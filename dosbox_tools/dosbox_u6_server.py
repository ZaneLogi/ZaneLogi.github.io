#!/usr/bin/env python3
"""
DOSBox Ultima VI decoder - "dosbox-u6" MCP server (Windows).

A per-game DECODER server: it knows Ultima VI's in-memory layout and exposes it
as high-level tools (avatar/NPC inventory, single-object decode, live
conversation state, local walkable map) plus an ACTION channel (DOSBox keystroke
injection via the shared dosbox_input lib -- move/talk/say) and closed-loop
NAVIGATION (pathfind/goto to an NPC). It does NOT
include the discovery workbench (scan/fuzzy/struct_dump/table) -- that lives in
the generic `dosbox-memory` server, used only when reverse-engineering something
new. This server is self-sufficient for U6 inspection: the routine plumbing
(attach, BDA-calibrate, read/write, status, disconnect) comes from the shared
`dosbox_mem` library via register_base_tools.

U6 layout facts (the parallel object arrays, CoordUse encoding, the in-segment
offsets) are baked in below -- they ARE the spec, from the u6-decompiled DGROUP.
The one thing NOT baked in is DS (the U6 data segment): it is the program's DOS
load segment, which shifts with the memory layout (drivers/TSRs/env/config), so
it must be DERIVED PER RUN. u6_hook() does that from the avatar's name -- the
name's bytes pin Names[0] at DS:0x3236, giving DS = (name_linear - 0x3236) / 16.
"""

import heapq
import time
import types

from mcp.server.fastmcp import FastMCP

import dosbox_mem as dm
import dosbox_input as di

try:                                    # committed name table decoded from LOOK.LZD
    from u6_look_names import tile_name as _tile_name
except Exception:                       # module missing in deployment -> numeric fallback
    def _tile_name(_tile):
        return f"tile{_tile}"

mcp = FastMCP("dosbox-u6")


# ----------------------------------------------------------------------------
# Ultima VI object model -- parallel arrays in DGROUP (offsets from u6-decompiled
# u6.h), each indexed by object/NPC slot. NPCs 0..0xFF, world objects
# 0x100..0xCFF. The Avatar is roster[0], normally slot 1. These offsets are
# IN-SEGMENT and fixed; only DS (the segment base) varies per run.
# ----------------------------------------------------------------------------
U6_Names        = 0x3236   # 14 B/entry, indexed by PARTY SLOT (Names[0] = avatar)
U6_ObjStatus    = 0xA0AB   # 1 B/slot; CoordUse = &0x18
U6_ObjPos       = 0x6828   # 3 B/slot; LOCXYZ packed x10|y10|z4; else assoc = first 2 B (holder slot)
U6_ObjShapeType = 0x3548   # 2 B/slot; type = &0x3ff, frame = >>10
U6_Amount       = 0x4EE4   # 2 B/slot; quan = low byte, qual = high byte
U6_NPCStatus    = 0x9FAB   # 1 B/slot; creature status bits (PLRCONTROL 0x80, etc.) -- != ObjStatus
U6_MAX_SLOTS    = 0xD00    # NPCs 0..0xFF + world objects 0x100..0xCFF

_COORDUSE = {0: "LOCXYZ", 0x08: "CONTAINED", 0x10: "INVEN", 0x18: "EQUIP"}


# ----------------------------------------------------------------------------
# Party / control state -- whether the player drives the whole party as one
# (PARTY mode) or a single detached member (SOLO mode), and WHO is driven now.
# DGROUP globals from u6-decompiled (u6.h, D_2C4A.h, seg_0A33.c SetActive /
# SetPartyMode). Party[0] is always the avatar/leader.
# ----------------------------------------------------------------------------
U6_Party     = 0x3533   # unsigned char[]; party index -> object slot
U6_PartySize = 0x8E50   # unsigned char; number of party members
U6_Active    = 0x2C54   # unsigned char; party index the player drives now (Party[Active])
U6_SoloFlag  = 0x2CC3   # signed char (D_2CC3): < 0 => PARTY mode; >= 0 => SOLO mode (value == Active)
U6_InCombat  = 0x2CC2   # char (InCombat): nonzero => combat is active
U6_EnemiesNum = 0xEBFB  # int; count of hostiles engaged
COMBAT_LEASH = 8        # in combat, player moves are gated to Chebyshev<=8 of the combat centre
# Names[][14] @ U6_Names is indexed by PARTY index for roster names.


# ----------------------------------------------------------------------------
# Turn / input context -- what input the engine will accept RIGHT NOW. The game
# loop C_0A33_1CB4 (seg_0A33.c:1020) sets AllowMouseMov=1 immediately before its
# top-level CON_getch and =0 right after, so AllowMouseMov==1 UNIQUELY means
# "parked at the command prompt = your turn" (sub-prompts/conversation use their
# own getch). DOS keyboard input is BUFFERED, so a key sent in the wrong context
# isn't lost -- it's consumed in whatever state the engine reaches next (a command
# letter eaten as a sub-prompt's target, etc.); hence every send must be gated.
# ----------------------------------------------------------------------------
U6_AllowMouseMov = 0x04C4   # int; ==1 only while blocked at the top-level command getch
U6_SelectMode    = 0x0492   # unsigned char; nonzero => a command is awaiting a target
U6_MouseMode     = 0x04BE   # int; nonzero => mouse-driven UI mode (keyboard play wants 0)
U6_LineInput     = 0x049B   # int D_049B; ==1 only WHILE CON_gets reads a typed line
                            #   (seg_0C9C.c:1593/1626) -- i.e. the keyword prompt is live
U6_PromptCh      = 0x04D4   # int PromptCh; ==1 during a page-pause "press a key" getch
                            #   ('*' marker / screen-full, seg_0C9C.c:1698/1830), else 5
# (conversation state is U6_IsInConversation = 0x098B, defined in the talk section.)


# ----------------------------------------------------------------------------
# Status-panel / inventory-UI state -- the "eyes" into the panel that the keyboard
# inventory-target route drives (USE/READY on a CARRIED item: <tab> into the panel,
# arrow to the item, Enter). All source-derived from BSS.ASM (the `;D_xxxx` layout +
# the `Selection`/`Equipment` declarations) and the .c `/*xxxx*/` offset annotations
# -- convention verified: SelectMode /*0492*/, MouseMode /*04BE*/, AllowMouseMov
# /*04C4*/ match the turn-gate offsets above.
# ----------------------------------------------------------------------------
U6_StatusDisplay = 0x04C0   # int; which status view is shown (CMD_90/91/92), seg_0C9C.c:39
U6_PanelChar     = 0x04B3   # int (D_04B3); party index whose panel is displayed
U6_PanelCol      = 0x0499   # char (D_0499); inventory-panel cursor column
U6_PanelRow      = 0x049A   # char (D_049A); inventory-panel cursor row
U6_InvScroll     = 0x07CE   # unsigned char (D_07CE); backpack scroll offset (paged by 4)
U6_VisBackpack   = 0xE70F   # int[12] (D_E70F); the visible backpack slots (4 col x 3 row)
U6_Equipment     = 0xE6E4   # int[8]; equipped object slots, indexed SLOT_HEAD..FEET (0..7)
U6_Sel_x         = 0xB6AF   # int; Selection.x  (u6.h: struct {int x,y,obj} @ B6AF/B6B1/B6B3)
U6_Sel_y         = 0xB6B1   # int; Selection.y
U6_Sel_obj       = 0xB6B3   # int; Selection.obj -- the committed target object slot
# Status-view modes (cmd.h CMD_9x). The panel must be INVENTORY (CMD_92) to target a
# carried item; F1-F8 select a member's view, '*' toggles PORTRAIT<->INVENTORY.
_PANEL_VIEW = {0x90: "PORTRAIT", 0x91: "PARTY", 0x92: "INVENTORY"}
U6_BACKPACK_COLS = 4        # backpack grid is 4 cols x 3 visible rows (C_155D_1267);
U6_BACKPACK_ROWS = 3        # visible index = row*4 + col, object = D_E70F[index]


# ----------------------------------------------------------------------------
# Character stats + item weight -- the inputs for "suit the party" gear decisions
# (u6.h, seg_2337.c GetStr/GetDex/GetInt, seg_155D.c STAT_GetEquipSlot). STREN/
# DEXTE/INTEL are direct DGROUP byte arrays per slot; Level/TypeWeight are far
# pointers. Equip slot is decided by an object's TILE id (BaseTile[type]+frame),
# not its type. Load caps: carry = STR*20 (seg_1944.c:1945), equip = STR*10
# (seg_155D.c:546); both comparable to TypeWeight[type].
# ----------------------------------------------------------------------------
U6_STREN = 0x8C4A           # unsigned char[]; Strength per slot (direct)
U6_DEXTE = 0x3316           # unsigned char[]; Dexterity per slot (direct)
U6_INTEL = 0x3433           # unsigned char[]; Intelligence per slot (direct)
U6_Level_ptr      = 0x8E4C  # far ptr -> Level[] (unsigned char per slot)
U6_TypeWeight_ptr = 0xB417  # far ptr -> TypeWeight[type] (unsigned char)
U6_EquipWeaponTbl = 0x07DD  # int[33] (D_07DD) stored DIRECTLY in DGROUP; RHND weapon TILE ids
CARRY_PER_STR = 20          # max carried weight = STR * 20
EQUIP_PER_STR = 10          # max readied weight = STR * 10

# Equip-slot index -> name (u6.h SLOT_*). STAT_GetEquipSlot returns one of these
# or -1 (not readyable); 8/9 are input slots resolved to a free hand/finger.
_EQUIP_SLOT_NAME = {0: "HEAD", 1: "NECK", 2: "RHND", 3: "RFNG", 4: "CHST",
                    5: "LHND", 6: "LFNG", 7: "FEET", 8: "2HND", 9: "RING"}


# ----------------------------------------------------------------------------
# Ultima VI conversation / "talk" engine -- DGROUP globals (offsets from the
# u6-decompiled seg_1703.c "talkdr" module, u6.h, BSS.ASM). On talk start the VM
# loads the current NPC's WHOLE script from converse.a into TalkBuf, then
# interprets it with Talk_PC as the program counter (PARSE_U8 == TalkBuf[Talk_PC++]).
# It prints text (OP_PRINTSTR) until an input opcode, then BLOCKS on CON_gets /
# CON_getch for the player's keyword -- so the conversation is turn-based by
# construction, and BOTH the NPC's text and the valid keyword branches live in
# TalkBuf (no screen scrape needed).
# ----------------------------------------------------------------------------
U6_IsInConversation = 0x098B   # 1 B; 1 while a conversation is active
U6_TalkBuf_ptr      = 0x4D50   # far ptr (off:2, seg:2) -> loaded script buffer
U6_TalkBuf_SIZE     = 0x2800   # TalkBuf allocation size (__MemAlloc, seg_0903.c)
U6_Talk_PC          = 0xE7AB   # 2 B; VM program counter = index into TalkBuf
U6_TalkInterloc     = 0xE796   # 2 words: [0]=interlocutor (active NPC#), [1]=locutor (party speaker)
U6_TalkInput        = 0xE732   # 0x32 B; player's last typed input (CON_gets buffer)
U6_TalkSavedPC      = 0xE7A7   # 4 B; D_E7A7 -- VM scratch save-PC for jumps (NOT the prompt PC)
U6_NpcName          = 0xE764   # up to ~50 B; current NPC name (D_E764), high-bit terminates
# Converse-VM variable tables + per-NPC flags, for decoding text/conditions:
U6_VarInt    = 0xB6E1   # int[36]; converse vars (#0-9 scratch, A-Z = 10-35). IF/expr operands.
U6_VarStr    = 0xB72D   # char *[36]; string vars -- NEAR ptrs (string at base+off), seg_1703.c
U6_TalkFlags = 0xB2EB   # unsigned char[]; per-NPC conversation flag byte (OP_TST/SET/CLR)
U6_HitPoints = 0x66E4   # unsigned char[]; per-slot HP (OP_WOUNDED, vs computed MaxHP)
OBJ_HORSE    = 0x1AF    # GetType == this => OP_HORSED true
POISONED_BIT = 0x10     # NPCStatus & 0x10 (OP_POISONNED)

# Conversation-VM opcodes where the VM blocks waiting for player input. The byte
# at TalkBuf[Talk_PC] being one of these means "the game is waiting for a reply".
_TALK_INPUT_OPS = {
    0xf7: "ASKTOP",    # free keyword via CON_gets -- the main "you say:" prompt
    0xf9: "GETSTR",    # read a string -> VarStr
    0xfb: "GETINT",    # read an integer -> VarInt
    0xfc: "GETDIGIT",  # read a single digit
    0xfa: "GETCHR",    # read a single char
    0xf8: "GET",       # menu of single keys, list terminated by OP_KEY (0xef)
    0xcb: "WAIT",      # wait for any key
}


# ----------------------------------------------------------------------------
# Map / navigation layout -- the local 40x40 "area" window + the tile-flag
# tables (u6.h, seg_101C.c GetTileAtXYZ). All DGROUP / DS-relative. Ground tiles
# are bytes 0-255; high tile ids are objects drawn on top (the object arrays).
#
# Passability is a faithful port of the engine's move-legality gate C_1E0F_000F
# (seg_1E0F.c:66) -- the function EVERY real step goes through (TryStraightMove
# @ :1421). For a cardinal step the verdict depends only on the destination cell
# + the mover, so the grid IS the per-step oracle. On foot the avatar is a plain
# land-walker, which collapses the gate to "passable ground AND no impassable
# object on the cell", with multi-tile-object spread + breakthrough overrides
# (see _build_grid). Actors (slot < 0x100) block too, but that half stays a
# separate dynamic layer (_actor_cells) so a transient NPC doesn't wall off a
# plan; movement-type (boat/horse/balloon) is Phase 2 (the branch skeleton is in
# place, its inputs hardwired to land-walker).
# ----------------------------------------------------------------------------
U6_AREA_W = 40
U6_AREA_H = 40
U6_WORLD_MASK = 0x3ff             # world is 1024x1024
U6_AreaTiles  = 0x8E51            # AREA_H*AREA_W bytes; ground tile per cell
U6_AreaX      = 0xBBC8            # int; world X of the area-window origin
U6_AreaY      = 0xBBCA            # int; world Y of the area-window origin
U6_NPCFlag_ptr     = 0x4D4C       # far ptr -> NPCFlag[]; dir = NPCFlag[slot] & 7
U6_TerrainType_ptr = 0xB3EB       # far ptr -> TerrainType[tile] (u6.h); flags below
U6_TileFlag_ptr    = 0x8C46       # far ptr -> TileFlag[tile]  (u6.h); DoubleH/DoubleV below
U6_TileFlag2_ptr   = 0xB3EF       # far ptr -> D_B3EF[tile]    (u6.h); Br/Ig below
U6_BaseTile_ptr    = 0x6824       # far ptr -> BaseTile[type] (int16); tile = BaseTile[type]+frame

# TerrainType[tile] bits (u6.h). Low nibble = properties; high nibble feeds the
# engine path cost `(TerrainType>>4)+1`. Only IMPASS blocks the land-walker.
TERRAIN_WET    = 0x01
TERRAIN_IMPASS = 0x02
TERRAIN_WALL   = 0x04
TERRAIN_DAMAGE = 0x08
# TileFlag[tile] bits (u6.h): a multi-tile object's extent from its anchor.
TILE_DOUBLE_V  = 0x40             # object also covers the cell to its NORTH
TILE_DOUBLE_H  = 0x80             # object also covers the cell to its WEST
# D_B3EF[tile] bits (u6.h): land-walker passability overrides (seg_1E0F.c:142).
TILE2_BREAKTHROUGH = 0x04         # Br: enterable even over impassable terrain (bridges)
TILE2_IGNORE       = 0x10         # Ig: keep scanning -- the Br/match is non-definitive

_TILEFLAG_N = 0x800               # tile-flag tables span all 2048 tile ids
_BASETILE_N = 0x400               # BaseTile indexed by 10-bit object type

# Actor types that DON'T block movement (C_1E0F_000F c_04ed @ seg_1E0F.c:215:
# fields/effects you walk through); every other in-world actor blocks the avatar.
_PASSABLE_ACTOR_TYPES = frozenset({0x157, 0x162, 0x164, 0x165, 0x167})

# 4-connected movement (U6 arrow-key cardinals; diagonals deferred -- they need
# numpad keys + an 8-connected search, both unverified). step (dr,dc) -> labels.
_DIR_DELTAS = ((-1, 0), (1, 0), (0, -1), (0, 1))
_STEP_NAME = {(-1, 0): "n", (1, 0): "s", (0, -1): "w", (0, 1): "e"}
_STEP_ARROW = {(-1, 0): "up", (1, 0): "down", (0, -1): "left", (0, 1): "right"}


# A session that also remembers the per-run U6 data segment, derived by u6_hook.
class U6State(dm.Session):
    def __init__(self):
        super().__init__()
        self.u6_ds = None        # derived per run; never hardcoded
        self.static_cache = {}   # name -> table bytes; lazy, see _static_table
        self.static_key = None   # base_addr the cache is valid for

    def reset(self):
        super().reset()
        self.u6_ds = None
        self.static_cache = {}
        self.static_key = None


S = U6State()

# Shared base tools (find_dosbox / find_membase_auto / set_membase_from /
# read_dos / read_linear / write_dos / status / disconnect) on this session.
base = dm.register_base_tools(mcp, S)

# Generic input tools (find_window / focus_window / send_key / send_text) -- the
# ACTION channel, so this one server both PERCEIVES (read) and ACTS (keys) on the
# same DOSBox session. SendInput needs DOSBox foreground (DirectInput); see
# dosbox_input for the why and the future focus-independent backend.
inp = di.register_input_tools(mcp, S)


def _derive_ds(name: str):
    """Locate the avatar's name in guest RAM and derive the U6 data segment from
    it: Names[0] sits at DS:0x3236, so DS = (name_linear - 0x3236) / 16 for a hit
    that lands exactly on a Names[0] boundary. Returns a list of (ds, host)
    candidates (usually exactly one). The DGROUP is in low conventional memory, so
    the first ~2 MB of the emulated-RAM region covers it."""
    needle = name.encode("latin-1")
    out = []
    for region_base, size in dm.iter_regions(S.handle):
        if size < 0x110000:                 # emulated RAM is >= ~1 MB
            continue
        try:
            buf = dm.read(S.handle, region_base, min(size, 0x200000))
        except OSError:
            continue
        start = 0
        while len(out) <= 32:
            i = buf.find(needle, start)
            if i < 0:
                break
            start = i + 1
            linear = (region_base + i) - S.membase
            if linear >= U6_Names and (linear - U6_Names) % 16 == 0:
                out.append(((linear - U6_Names) // 16, region_base + i))
    return out


def _ds(segment: int):
    """Resolve the DS to use: explicit `segment` (>=0) overrides; else the
    session's derived DS. Returns (ds, error_or_None)."""
    if segment is not None and segment >= 0:
        return segment, None
    if S.u6_ds is not None:
        return S.u6_ds, None
    return None, ("U6 data segment not calibrated. Call u6_hook('<avatar name>') "
                  "first to derive it, or pass segment=0x....")


@mcp.tool()
def u6_hook(avatar_name: str = "") -> str:
    """Hook DOSBox for Ultima VI: attach, BDA-calibrate MemBase, and DERIVE the
    U6 data segment (DS) from the avatar's name.

    DS is the program's DOS load segment -- it shifts with the memory layout
    (drivers/TSRs/env/config), so it must NOT be hardcoded. Pass the avatar's
    name (as shown in-game); this finds its bytes in RAM (Names[0] @ DS:0x3236)
    and computes DS = (name_linear - 0x3236) / 16. After this, u6_inventory /
    u6_object work with no DS argument. Omit the name only to calibrate MemBase
    alone (then you must pass segment= to the decoders)."""
    r1 = base.find_dosbox()
    if not r1.startswith("Opened DOSBox"):
        return r1
    r2 = base.find_membase_auto()
    if not r2.startswith("MemBase auto-set"):
        return f"Attached, but MemBase calibration failed:\n{r2}"

    if not avatar_name:
        return (f"Attached, MemBase=0x{S.membase:x}. DS NOT derived (no avatar "
                f"name given). Pass the avatar's name -- u6_hook('Monica') -- so "
                f"DS can be pinned, or call the decoders with an explicit segment=.")

    cands = _derive_ds(avatar_name)
    if not cands:
        return (f"MemBase=0x{S.membase:x}, but the name {avatar_name!r} was not "
                f"found at any Names[0] boundary. Check the exact in-game spelling, "
                f"or the game may not be at a state with the party loaded.")
    ds, host = cands[0]
    S.u6_ds = ds
    # Read the name back as a confirmation.
    try:
        raw = dm.read(S.handle, S.membase + (ds << 4) + U6_Names, 14)
        readback = raw.split(b"\x00", 1)[0].decode("latin-1", "replace")
    except OSError:
        readback = "<unreadable>"
    extra = ""
    if len(cands) > 1:
        extra = f"\n(Multiple name hits: {[(hex(d), hex(h)) for d, h in cands[:4]]}; used the first.)"
    return (f"Hooked U6: MemBase=0x{S.membase:x}, DS=0x{ds:04x} "
            f"(derived from {avatar_name!r} @ host 0x{host:x}).\n"
            f"Names[0] reads back as {readback!r}.{extra}\n"
            f"Ready -- read: u6_avatar / u6_party / u6_roster_status / u6_input_state "
            f"/ u6_object / u6_inventory / u6_panel_state / u6_npcs_near / u6_objects_near "
            f"/ u6_walkable / u6_conversation; act: u6_move / u6_talk / u6_say / u6_look / u6_get "
            f"/ u6_use / u6_ready / u6_key; navigate: u6_pathfind / u6_goto / u6_talk_to; verify: "
            f"u6_validate_passability. Avatar = slot 1.")


@mcp.tool()
def u6_object(slot: int, segment: int = -1) -> str:
    """Ultima VI: decode one object/NPC slot from the parallel arrays
    (ObjStatus/ObjPos/ObjShapeType/Amount). Shows CoordUse + world x/y/z (LOCXYZ)
    or assoc holder (CONTAINED/INVEN/EQUIP), plus shape type/frame, quan/qual, and
    gear metadata (tile, weight, and the equip slot or 'not readyable'). DS comes
    from u6_hook unless you override it with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base_addr = S.membase + (ds << 4)
    try:
        st  = dm.read(S.handle, base_addr + U6_ObjStatus + slot, 1)[0]
        pos = dm.read(S.handle, base_addr + U6_ObjPos + slot * 3, 3)
        sh  = int.from_bytes(dm.read(S.handle, base_addr + U6_ObjShapeType + slot * 2, 2), "little")
        am  = int.from_bytes(dm.read(S.handle, base_addr + U6_Amount + slot * 2, 2), "little")
        basetile, tw, weapons = _gear_tables(base_addr)
    except OSError as ex:
        return f"Read failed for slot 0x{slot:x} (DS=0x{ds:04x}): {ex}"
    cu = st & 0x18
    V = pos[0] | (pos[1] << 8) | (pos[2] << 16)
    where = (f"x={V & 0x3ff} y={(V >> 10) & 0x3ff} z={(V >> 20) & 0xf}"
             if cu == 0 else f"assoc=0x{V & 0xffff:x}")
    tile, wt, eslot = _gear_of(sh, basetile, tw, weapons)
    name = _tile_name(tile)                                  # LOOK.LZD name for this tile
    ready = "not readyable" if eslot < 0 else f"ready->{_EQUIP_SLOT_NAME[eslot]}"
    return (f"slot 0x{slot:x} '{name}': status=0x{st:02x} {_COORDUSE.get(cu, '?')}  {where}  "
            f"type={sh & 0x3ff} frame={sh >> 10}  quan={am & 0xff} qual={am >> 8}  "
            f"tile={tile}  weight={wt}  {ready}")


@mcp.tool()
def u6_inventory(npc_slot: int, segment: int = -1,
                 max_slots: int = U6_MAX_SLOTS) -> str:
    """Ultima VI: list an NPC's inventory -- every object flagged INVEN or EQUIP
    whose assoc (holder slot) == npc_slot. Walks the whole object-slot range
    in-process and returns the decoded items (slot, INVEN/EQUIP, shape type,
    frame, quan, qual, and the LOOK.LZD name). The Avatar is its roster[0] slot
    (usually 1). DS comes from u6_hook unless you override it with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base_addr = S.membase + (ds << 4)
    try:
        status = dm.read(S.handle, base_addr + U6_ObjStatus, max_slots)
        pos    = dm.read(S.handle, base_addr + U6_ObjPos, max_slots * 3)
        shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, max_slots * 2)
        amount = dm.read(S.handle, base_addr + U6_Amount, max_slots * 2)
        basetile, tw, weapons = _gear_tables(base_addr)
    except OSError as ex:
        return f"Read failed walking object arrays (DS=0x{ds:04x}): {ex}"
    rows = []
    for i in range(min(max_slots, len(status))):
        cu = status[i] & 0x18
        if cu not in (0x10, 0x18):
            continue
        assoc = pos[i * 3] | (pos[i * 3 + 1] << 8)
        if assoc != npc_slot:
            continue
        sh = shape[i * 2] | (shape[i * 2 + 1] << 8)
        am = amount[i * 2] | (amount[i * 2 + 1] << 8)
        tile, _wt, _es = _gear_of(sh, basetile, tw, weapons)   # tile -> LOOK.LZD name
        rows.append((i, "EQUIP" if cu == 0x18 else "INVEN",
                     sh & 0x3ff, sh >> 10, am & 0xff, am >> 8, _tile_name(tile)))
    if not rows:
        return f"No INVEN/EQUIP objects with assoc={npc_slot} (DS=0x{ds:04x})."
    out = [f"{len(rows)} item(s) held by NPC slot {npc_slot} (DS=0x{ds:04x}):",
           "  slot   use    type  frame  quan  qual  name"]
    for slot, use, typ, frame, quan, qual, name in rows:
        out.append(f"  0x{slot:03x}  {use:<5}  {typ:>4}  {frame:>5}  {quan:>4}  "
                   f"{qual:>4}  {name}")
    return "\n".join(out)


@mcp.tool()
def u6_panel_state(segment: int = -1) -> str:
    """Ultima VI: read the STATUS-PANEL state -- the agent's "eyes" into the inventory
    UI that a USE/READY on a CARRIED item must drive by keyboard (the engine offers no
    way to target inventory except through the panel). Reports the current view
    (PORTRAIT/PARTY/INVENTORY = StatusDisplay CMD_90/91/92), which member's panel is
    shown (D_04B3), the backpack cursor (D_0499 col / D_049A row) and scroll (D_07CE),
    the visible 4x3 backpack slots (D_E70F[12], decoded, the cursor cell marked), the
    equipped items (Equipment[8] by slot), and the live Selection (x/y/obj at
    B6AF/B6B1/B6B3 -- what a commit would act on). The keyboard route to target a
    carried item: F<member> -> view becomes INVENTORY (CMD_92); <tab> -> SelectMode==2
    (panel cursor); arrows move the cursor to the item's (row,col); Enter commits.
    Read-only. DS from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    b = S.membase + (ds << 4)
    try:
        sd    = int.from_bytes(dm.read(S.handle, b + U6_StatusDisplay, 2), "little")
        pch   = int.from_bytes(dm.read(S.handle, b + U6_PanelChar, 2), "little")
        col   = dm.read(S.handle, b + U6_PanelCol, 1)[0]
        row   = dm.read(S.handle, b + U6_PanelRow, 1)[0]
        scr   = dm.read(S.handle, b + U6_InvScroll, 1)[0]
        pack  = dm.read(S.handle, b + U6_VisBackpack, U6_BACKPACK_COLS * U6_BACKPACK_ROWS * 2)
        equip = dm.read(S.handle, b + U6_Equipment, 8 * 2)
        sx   = int.from_bytes(dm.read(S.handle, b + U6_Sel_x, 2), "little", signed=True)
        sy   = int.from_bytes(dm.read(S.handle, b + U6_Sel_y, 2), "little", signed=True)
        sobj = int.from_bytes(dm.read(S.handle, b + U6_Sel_obj, 2), "little", signed=True)
    except OSError as ex:
        return f"Panel read failed (DS=0x{ds:04x}): {ex}"
    view = _PANEL_VIEW.get(sd, f"0x{sd:02x}")
    out = [f"Panel (DS=0x{ds:04x}): view={view} char#={pch} "
           f"cursor=(col{col},row{row}) scroll={scr}"]
    # visible backpack: 4 cols x 3 rows, index = row*4 + col; 0 = empty cell
    rows_seen = []
    for i in range(U6_BACKPACK_COLS * U6_BACKPACK_ROWS):
        slot = pack[i * 2] | (pack[i * 2 + 1] << 8)
        if slot == 0:
            continue
        r, c = divmod(i, U6_BACKPACK_COLS)
        mark = " <-cursor" if (c == col and r == row) else ""
        rows_seen.append(f"  ({r},{c}) slot 0x{slot:03x} {_obj_name(b, slot)}{mark}")
    out.append(f"backpack ({len(rows_seen)} visible):" if rows_seen
               else "backpack: none visible")
    out.extend(rows_seen)
    # equipped silhouette: 0/1 = empty slot (the C_155D_130E self-ref guard)
    eq = []
    for s in range(8):
        slot = equip[s * 2] | (equip[s * 2 + 1] << 8)
        if slot > 1:
            eq.append(f"  {_EQUIP_SLOT_NAME[s]}: 0x{slot:03x} {_obj_name(b, slot)}")
    out.append("equipped:" if eq else "equipped: none")
    out.extend(eq)
    sel = "none" if sobj < 0 else f"0x{sobj:03x} {_obj_name(b, sobj)}"
    out.append(f"Selection: obj={sel}  x={sx} y={sy}")
    return "\n".join(out)


# ----------------------------------------------------------------------------
# Converse-VM decoder -- turns the live TalkBuf bytecode into READABLE dialogue +
# the askable keywords, a faithful port of seg_1703.c (parse_statement / execute_op
# / parse_factor / C_1703_1D01 keyword dispatch), cross-checked against the wound-
# down ultima6_clone's conversation_vm.js. Decodes FORWARD from the live state
# (greeting from MAIN; a chosen keyword's response previewed ahead of the ASK) so
# it never has to reconstruct already-run output, and stays blind-discovery-safe
# (only the greeting + the keyword the agent picks + the keyword NAMES).
#
# IF/ELSE conditions are evaluated against LIVE memory (TalkFlags / inventory /
# party / status via `env`). Three outcomes, per the agreed contract:
#   * deterministic  -> the exact branch the engine would take.
#   * OP_RND / a query we don't resolve -> BOTH branches, annotated [either: A | B]
#     (RND is flavor, not quest-gating), and decoding continues.
#   * an unknown STATEMENT opcode (decode_block, a closed set) -> raise _DecoderStop;
#     the tool returns DECODER_STOP and the agent must halt + report (fail loud).
#     Inside a FACTOR (parse_factor/evaluate), an unrecognized byte is NOT a stop --
#     it is pushed as a literal value, exactly as the engine does (seg_1703.c:319).
# ----------------------------------------------------------------------------
class _DecoderStop(Exception):
    def __init__(self, op, pc):
        super().__init__(f"unhandled converse opcode 0x{op:02x} at TalkBuf+{pc}")
        self.op, self.pc = op, pc


# Statement-level side-effect ops -> how many parse_factor operand expressions to
# consume (we don't execute the effect, just skip its operands). seg_1703.c:808+.
_CV_SIDE_EFFECT = {
    0xa4: 2, 0xa5: 2,            # SET / CLR (npc, bit)
    0xb9: 4, 0xba: 4,            # GIVEOBJ / TAKEOBJ (npc, obj, qual, qty)
    0xc8: 2, 0xc9: 4,            # MOVEOBJ / TRANSFEROBJ
    0xc4: 1, 0xc5: 1,            # ADDKARMA / SUBKARMA
    0xcd: 2,                     # SETMODE
    0xd6: 1, 0xd9: 1, 0xdb: 1,   # RESURRECT / HEAL / CURE
    0x9c: 1, 0xd0: 1,            # GETHORSE / DELAY
    0xbe: 1, 0xbf: 1,            # SHOW_INVENTORY / SHOW_CONVERSE
    0xd8: 1, 0xdf: 1,            # D8 / DF ($Y := npc name)
}


def _cv_str_match(keyword, inp, n):
    """str_i_compare (seg_1703.c:130): any space-separated word of `inp` has
    `keyword` (first n chars, '?' = wildcard) as a case-insensitive prefix."""
    for word in str(inp).split(" "):
        if not word:
            continue
        ok = True
        for i in range(n):
            k = keyword[i] if i < len(keyword) else ""
            if k == "?":
                continue
            if i >= len(word) or word[i].lower() != k.lower():
                ok = False
                break
        if ok:
            return True
    return False


class _ConverseVM:
    """Read-only decoder over a TalkBuf byte image. `env` supplies live state:
    env.npc (interlocutor, for OP_NPC self), env.varint(i)/env.varstr(i), and
    env.query(kind, **kw) for world reads (flag/owns/inParty/poisoned/objType/...)."""
    END_OF_FACTOR, LET_VALUE = 0xa7, 0xa8
    IF, ENDIF, ELSE = 0xa1, 0xa2, 0xa3
    GOTO, CALL, VARINT, VARSTR, B4, PRINTSTR, LEAVE = 0xb0, 0xb1, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6
    LET, ADDRESS, BYTE, WORD, D5, RND = 0xa6, 0xd2, 0xd3, 0xd4, 0xd5, 0xa0
    KEY, RES, ENDRES, NPC = 0xef, 0xf6, 0xee, 0xeb

    def __init__(self, data, env):
        self.d = data
        self.n = len(data)
        self.env = env
        self.pc = 0
        self.budget = 20000          # byte-read guard against runaway GOTO loops

    # --- byte readers ---
    def _u8(self):
        self.budget -= 1
        if self.budget < 0:
            raise _DecoderStop(0xff, self.pc)
        v = self.d[self.pc] if 0 <= self.pc < self.n else 0
        self.pc += 1
        return v

    def _u16(self):
        v = self._u8(); return v | (self._u8() << 8)

    def _u32(self):
        v = self._u16(); return v | (self._u16() << 16)

    def _npc(self, x):
        return self.env.npc if x == self.NPC else x

    # --- parse_factor (seg_1703.c:295): RPN; returns (value, nondeterministic) ---
    def evaluate(self):
        st, nd = [], False
        pop = lambda: st.pop() if st else 0
        while self.pc < self.n:
            op = self._u8()
            if op in (self.END_OF_FACTOR, self.LET_VALUE):
                break
            if op == self.ADDRESS:   st.append(self._u32())
            elif op == self.BYTE:    st.append(self._u8())
            elif op == self.WORD:    st.append(self._u16())
            elif op == self.VARINT:  st.append(self.env.varint(pop()))
            elif op == self.VARSTR:  st.append(self.env.varstr(pop()))
            elif op == 0x90: b, a = pop(), pop(); st.append(a + b)
            elif op == 0x91: b, a = pop(), pop(); st.append(a - b)
            elif op == 0x92: b, a = pop(), pop(); st.append(a * b)
            elif op == 0x93: b, a = pop(), pop(); st.append(a // b if b else 0)
            elif op == 0x94: b, a = pop(), pop(); st.append(1 if (a or b) else 0)
            elif op == 0x95: b, a = pop(), pop(); st.append(1 if (a and b) else 0)
            elif op == 0x86: b, a = pop(), pop(); st.append(1 if str(a).lower() == str(b).lower() else 0)
            elif op == 0x85: b, a = pop(), pop(); st.append(1 if a != b else 0)
            elif op == 0x81: b, a = pop(), pop(); st.append(1 if a > b else 0)
            elif op == 0x82: b, a = pop(), pop(); st.append(1 if a >= b else 0)
            elif op == 0x83: b, a = pop(), pop(); st.append(1 if a < b else 0)
            elif op == 0x84: b, a = pop(), pop(); st.append(1 if a <= b else 0)
            elif op == self.RND:
                pop(); pop(); st.append(0); nd = True          # can't predict -> nondeterministic
            elif op == 0xab:  # TST (npc, bit) -> flag
                bit = pop(); npc = self._npc(pop()); st.append(self.env.query("flag", npc=npc, bit=bit))
            elif op == 0x9f:  # OWNS (npc, obj, qual)
                q = pop(); o = pop(); npc = self._npc(pop()); st.append(self.env.query("owns", npc=npc, obj=o, qual=q))
            elif op == 0xbb:  # TEST_OBJ (npc, obj)
                o = pop(); npc = self._npc(pop()); st.append(self.env.query("owns", npc=npc, obj=o, qual=0))
            elif op == 0xc7:  # WHOSGOT (obj, qual)
                q = pop(); o = pop(); st.append(self.env.query("whosgot", obj=o, qual=q))
            elif op == 0xc6:  # ISINPARTY (npc)
                st.append(self.env.query("inparty", npc=self._npc(pop())))
            elif op == 0xdc:  # POISONNED (npc)
                st.append(self.env.query("poisoned", npc=self._npc(pop())))
            elif op == 0x9d:  # HORSED (npc)
                st.append(self.env.query("ishorse", npc=self._npc(pop())))
            elif op == 0xc2:  # OBJTYPE (obj slot)
                st.append(self.env.query("objtype", obj=pop()))
            elif op == 0xc1:  # OWNER (obj slot) -> holder
                st.append(self.env.query("owner", obj=pop()))
            elif op in (0xda, 0x9a, 0x9b, 0xd7, 0xdd, 0xc0):
                # WOUNDED/CANCARRY/WEIGHT/ISONSCREEN/partyMember/SELECT_OBJECT:
                # known but not resolved here -> treat the result as unknown so any
                # gating IF shows BOTH branches (never a wrong single read).
                for _ in range(1 if op in (0xda, 0x9a, 0xd7, 0xc0) else 2):
                    pop()
                st.append(0); nd = True
            else:
                # parse_factor default (seg_1703.c:314-322): a byte that is neither a
                # tagged literal (ADDRESS/BYTE/WORD) nor a recognized operator is
                # pushed as a LITERAL value (the engine's `default: lstack[sidx]=opcode`
                # then `sidx++`; its operator switch has NO default, so it never stops
                # here). e.g. a bare 0x00 -> push 0 (SET self 0 reveals the NPC name).
                st.append(op)
        return (st[0] if st else 0), nd

    def _skip_factor(self):
        self.evaluate()

    # --- follow an OP_ADDRESS table ref to its string (seg_1703.c:688) ---
    def _follow_addr_string(self):
        target = self._u32()
        if self.pc < self.n and self.d[self.pc] == self.CALL:
            self.pc += 1
            ret = self.pc
        else:
            idx, _nd = self.evaluate()
            ret = self.pc
            self.pc = target
            n = idx
            while n > 0 and self.pc < self.n:      # skip `idx` NUL-terminated strings
                if self._u8() == 0:
                    n -= 1
            target = self.pc
        self.pc = target
        s = bytearray()
        while self.pc < self.n:
            c = self._u8()
            if c == 0:
                break
            s.append(c)
        self.pc = ret
        return s.decode("latin-1", "replace")

    # --- OP_PRINTSTR (seg_1703.c:729) ---
    def _printstr(self):
        tag = self._u8()
        if tag == self.ADDRESS:
            return self._follow_addr_string()
        if tag != self.D5:
            di = self._u8()
            if self._u8() != self.VARSTR:
                return ""
            return self.env.varstr(di)
        return ""

    # --- parse_statement (seg_1703.c:945): decode a block of text + control,
    # stopping (peek, not consume) at any op in `stops` or a structural terminator.
    def decode_block(self, stops, depth=0, follow_goto=True):
        if depth > 40:
            raise _DecoderStop(self.IF, self.pc)
        out = []
        while self.pc < self.n:
            op = self.d[self.pc]
            if op == 0 or op == self.ENDRES or op == self.KEY or op >= 0xf0 or op in stops:
                break
            self.pc += 1
            if op < 0x80:                                  # raw inline ASCII text
                out.append(chr(op))
            elif op == self.PRINTSTR:
                out.append(self._printstr())
            elif op == self.LEAVE:
                break
            elif op == self.GOTO:
                tgt = self._u32()
                if follow_goto:                            # follow for real response text;
                    self.pc = tgt                          # don't follow when scanning the
                                                           # keyword table (stay linear)
            elif op == self.IF:
                _val, nd = self.evaluate()
                ta = self.decode_block({self.ELSE, self.ENDIF}, depth + 1, follow_goto)
                tb = ""
                if self.pc < self.n and self.d[self.pc] == self.ELSE:
                    self.pc += 1
                    tb = self.decode_block({self.ENDIF}, depth + 1, follow_goto)
                if self.pc < self.n and self.d[self.pc] == self.ENDIF:
                    self.pc += 1
                if nd:
                    out.append(f"[either: «{ta.strip()}»" + (f" | «{tb.strip()}»]" if tb.strip() else "]"))
                else:
                    out.append(ta if _val else tb)
            elif op in (self.ENDIF, self.ELSE):
                pass                                        # stray (outside an IF) -> no-op
            elif op == self.LET:
                self._let()
            elif op in _CV_SIDE_EFFECT:
                for _ in range(_CV_SIDE_EFFECT[op]):
                    self._skip_factor()
            elif op in (0x9e, 0xa7, 0xcb):                  # 0-operand no-op statements
                pass                                        # REST / stray END_OF_FACTOR /
                                                            # WAIT (a key-pause; execute_op
                                                            # seg_1703.c: break, no text)
            else:
                raise _DecoderStop(op, self.pc - 1)
        return "".join(out)

    def _let(self):
        di = self._u8()
        if di == self.ADDRESS:                              # var-cell / list-element dest
            self.pc += 4
            if self.pc < self.n and self.d[self.pc] == self.LET_VALUE:
                self.pc += 1                                # optional leading LET_VALUE
            self._skip_factor()                             # value factor(s): an a8-separated
            guard = 0                                       # chain -- list-element LET is
            while (0 < self.pc <= self.n and guard < 8      # `@a[idx] a8 @b[idx] a7`; the old
                   and self.d[self.pc - 1] == self.LET_VALUE):  # 1-factor read DECODER_STOPped
                guard += 1
                self._skip_factor()
            return
        kind = self._u8()
        if self._u8() != self.LET_VALUE:
            return
        if kind == self.VARINT:
            self._skip_factor()
        else:                                               # string assignment
            tag = self._u8()
            if tag == self.ADDRESS:
                self._follow_addr_string()
            elif self.pc < self.n and self.d[self.pc] == self.VARSTR:
                self.pc += 1

    # --- keyword headers at an ASK: OP_KEY <kw[,kw...]> OP_RES <body> ... (C_1703_1D01) ---
    def keyword_list(self):
        kws, guard = [], 0
        while self.pc < self.n and guard < 64:
            guard += 1
            op = self._u8()
            if op != self.KEY:
                self.pc -= 1
                if op == self.ENDRES or op >= 0xf0 or op == 0:
                    break
                # not a keyword section here -> stop scanning
                break
            # read comma-separated keyword(s) until OP_RES
            while True:
                kw = bytearray()
                c = self._u8()
                while c not in (0x2c, self.RES) and self.pc <= self.n:
                    kw.append(c)
                    c = self._u8()
                k = kw.decode("latin-1", "replace")
                kws.append("(anything)" if k == "*" else k)
                if c != 0x2c:
                    break
            # skip the response body to the next KEY/ENDRES/structural
            self._skip_body()
        return kws

    def _skip_body(self):
        """Skip a keyword's response body to the next KEY/ENDRES/structural, WITHOUT
        following GOTOs (stay linear within the keyword table). Uses the full
        decode_block parser so every opcode's operands are consumed correctly -- a
        hand-rolled length table (the old version) desynced on ADDRESS/PRINTSTR/IF/
        side-effect factors and lost the keywords after the first complex body."""
        self.decode_block(set(), follow_goto=False)

    def find_response(self, input_word):
        """Scan OP_KEY sections from self.pc; return True (pc at the matching OP_RES
        body) if a keyword matches `input_word` (or '*'), else False."""
        inp = input_word or "bye"
        guard = 0
        while self.pc < self.n and guard < 64:
            guard += 1
            if self._u8() != self.KEY:
                self.pc -= 1
                return False
            matched = False
            while True:
                kw = bytearray()
                c = self._u8()
                while c not in (0x2c, self.RES):
                    kw.append(c)
                    c = self._u8()
                k = kw.decode("latin-1", "replace")
                if k and (k[0] == "*" or _cv_str_match(k, inp, len(k))):
                    matched = True
                if c != 0x2c:
                    break
            if matched:
                if self.d[self.pc - 1] != self.RES:        # consume up to RES
                    while self._u8() != self.RES:
                        pass
                return True
            self._skip_body()
        return False


def _make_converse_env(base_addr, npc_id):
    """Live `env` for _ConverseVM: reads VarInt/VarStr/TalkFlags + party/inventory/
    status from DOSBox memory to evaluate conditions and variable strings."""
    cache = {}

    def _objarr():
        if "obj" not in cache:
            cache["obj"] = (dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS),
                            dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3),
                            dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2))
        return cache["obj"]

    def varint(i):
        if not 0 <= i < 36:
            return 0
        return int.from_bytes(dm.read(S.handle, base_addr + U6_VarInt + i * 2, 2), "little", signed=True)

    def varstr(i):
        if not 0 <= i < 36:
            return ""
        off = int.from_bytes(dm.read(S.handle, base_addr + U6_VarStr + i * 2, 2), "little")
        if off == 0:
            return ""
        raw = dm.read(S.handle, base_addr + off, 64)
        return raw.split(b"\x00", 1)[0].decode("latin-1", "replace")

    def _owns(npc, obj, qual):
        status, pos, shape = _objarr()
        for i in range(1, U6_MAX_SLOTS):
            if (status[i] & 0x18) not in (0x10, 0x18):        # INVEN / EQUIP
                continue
            if (pos[i * 3] | (pos[i * 3 + 1] << 8)) != npc:   # assoc holder
                continue
            if ((shape[i * 2] | (shape[i * 2 + 1] << 8)) & 0x3ff) == obj:
                return 1
        return 0

    def query(kind, **kw):
        try:
            if kind == "flag":
                b = dm.read(S.handle, base_addr + U6_TalkFlags + kw["npc"], 1)[0]
                return (b >> kw["bit"]) & 1
            if kind == "owns":
                return _owns(kw["npc"], kw["obj"], kw.get("qual", 0))
            if kind == "whosgot":
                psize = dm.read(S.handle, base_addr + U6_PartySize, 1)[0]
                party = dm.read(S.handle, base_addr + U6_Party, max(psize, 0) + 1)
                for k in range(min(psize, 16)):
                    if _owns(party[k], kw["obj"], kw.get("qual", 0)):
                        return party[k]
                return 0x8001
            if kind == "inparty":
                psize = dm.read(S.handle, base_addr + U6_PartySize, 1)[0]
                party = dm.read(S.handle, base_addr + U6_Party, max(psize, 0) + 1)
                return 1 if kw["npc"] in party[:max(psize, 0)] else 0
            if kind == "poisoned":
                return 1 if (dm.read(S.handle, base_addr + U6_NPCStatus + kw["npc"], 1)[0] & POISONED_BIT) else 0
            if kind == "ishorse":
                _s, _p, shape = _objarr()
                n = kw["npc"]
                return 1 if ((shape[n * 2] | (shape[n * 2 + 1] << 8)) & 0x3ff) == OBJ_HORSE else 0
            if kind == "objtype":
                _s, _p, shape = _objarr()
                o = kw["obj"]
                return (shape[o * 2] | (shape[o * 2 + 1] << 8)) & 0x3ff
            if kind == "owner":
                _s, pos, _sh = _objarr()
                o = kw["obj"]
                return pos[o * 3] | (pos[o * 3 + 1] << 8)
        except (OSError, IndexError):
            return 0
        return 0

    return types.SimpleNamespace(npc=npc_id, varint=varint, varstr=varstr, query=query)


def _expand_vars(text, env):
    """Substitute $X (string) / #X (int) converse vars; pass markup through."""
    import re
    text = re.sub(r"\$([A-Za-z0-9])", lambda m: env.varstr(_cv_var_index(m.group(1))) or m.group(0), text)
    text = re.sub(r"#([A-Za-z0-9])", lambda m: str(env.varint(_cv_var_index(m.group(1)))), text)
    return text


def _cv_var_index(ch):
    c = ord(ch)
    return c - 0x30 if 0x30 <= c <= 0x39 else c - 0x37   # '0'-'9'->0-9, 'A'-'Z'->10-35


# U6 marks a highlighted conversation keyword inline as '@word': CON_putch
# (seg_0C9C.c:1880-1888) switches to the highlight colour at '@' and restores it at
# the next word-terminator, CONSUMING the '@'. Those highlighted words are exactly
# the on-screen cues for what to ask next, so we strip the '@' from the prose and
# return the words. Terminator set is the engine's own strchr(" ,.:;!?'-\"\n").
_HL_TERMINATORS = set(" ,.:;!?'-\"\n")


def _extract_highlights(text):
    """Strip U6 '@' highlight markers; return (clean_prose, [highlighted words]).
    A highlighted word runs from just after '@' to the next terminator; an '@' right
    before a terminator highlights nothing (just drops the '@'). Words are de-duped
    case-insensitively, first-seen order (a cue list, not every occurrence)."""
    out, words, seen, i, n = [], [], set(), 0, len(text)
    while i < n:
        if text[i] == "@":
            i += 1
            w = []
            while i < n and text[i] not in _HL_TERMINATORS:
                w.append(text[i]); i += 1
            out.extend(w)                       # keep the word in prose, sans '@'
            word = "".join(w)
            if word and word.lower() not in seen:
                seen.add(word.lower()); words.append(word)
        else:
            out.append(text[i]); i += 1
    return "".join(out), words


def _decode_conversation(base_addr, keyword):
    """Read live talk state + TalkBuf and decode the greeting (or the response to
    `keyword`) + the askable keyword list. Returns a dict (or {'status':...})."""
    active = dm.read(S.handle, base_addr + U6_IsInConversation, 1)[0]
    interloc = int.from_bytes(dm.read(S.handle, base_addr + U6_TalkInterloc, 2), "little")
    pc = int.from_bytes(dm.read(S.handle, base_addr + U6_Talk_PC, 2), "little")
    inp = dm.read(S.handle, base_addr + U6_TalkInput, 0x32).split(b"\x00", 1)[0].decode("latin-1", "replace")
    name_raw = dm.read(S.handle, base_addr + U6_NpcName, 50)
    fp = dm.read(S.handle, base_addr + U6_TalkBuf_ptr, 4)
    name_b = bytearray()
    for b in name_raw:
        if b == 0 or (b & 0x80):
            break
        name_b.append(b)
    name = name_b.decode("latin-1", "replace")
    tb_lin = (((fp[2] | (fp[3] << 8)) << 4) + (fp[0] | (fp[1] << 8)))
    data = dm.read(S.handle, S.membase + tb_lin, U6_TalkBuf_SIZE)
    env = _make_converse_env(base_addr, interloc)
    res = {"active": active, "npc": name, "npc_num": interloc, "pc": pc, "last_input": inp}

    op_at = data[pc] if 0 <= pc < len(data) else 0
    res["prompt"] = _TALK_INPUT_OPS.get(op_at, f"op_0x{op_at:02x}")

    vm = _ConverseVM(data, env)
    try:
        # Walk the FIXED intro (OP_ID -> DESC -> MAIN/PREFIX -> greeting) to the
        # keyword table. This anchor is independent of the live Talk_PC, so the
        # askable keywords AND any keyword's response are readable from ANY VM state
        # -- the fresh prompt, a mid-response page-pause, or parked on another
        # keyword -- which is what lets the agent collect the story by asking topics.
        vm.pc = 0
        if vm.pc < vm.n and data[vm.pc] == 0xff:      # OP_ID
            vm.pc += 1
        vm._u8()                                       # npcId
        while vm.pc < vm.n and data[vm.pc] != 0xf1:    # to OP_DESC
            vm.pc += 1
        while vm.pc < vm.n and vm._u8() != 0xf1:       # past OP_DESC
            pass
        desc = vm.decode_block({})                     # "You see ..." description
        while vm.pc < vm.n:                            # past OP_MAIN / OP_PREFIX run
            c = vm._u8()
            if c in (0xf2, 0xf3):
                while vm.pc < vm.n and data[vm.pc] in (0xf2, 0xf3):
                    vm.pc += 1
                break
        greet = vm.decode_block({}) if (vm.pc < vm.n and data[vm.pc] != 0xf7) else ""
        if vm.pc < vm.n and data[vm.pc] == 0xf7:       # skip OP_ASKTOP -> first OP_KEY
            vm.pc += 1
        kw_anchor = vm.pc                              # start of the keyword table

        if keyword:                                    # preview the response to `keyword`
            vm.pc = kw_anchor
            if vm.find_response(keyword):
                res["said"] = _expand_vars(vm.decode_block({}).strip(), env)
            else:
                res["said"] = f"(no keyword section matches {keyword!r})"
        else:
            res["said"] = _expand_vars((("You see " + desc).strip() + "\n" + greet.strip()).strip(), env)
        # keyword list: scan ALL OP_KEY sections from the table anchor (NOT live pc)
        kvm = _ConverseVM(data, env); kvm.pc = kw_anchor
        res["keywords"] = kvm.keyword_list()
        if "said" in res:                              # strip '@' markup, collect the cues
            res["said"], res["highlighted"] = _extract_highlights(res["said"])
        res["status"] = "OK"
    except _DecoderStop as st:
        res["status"] = "DECODER_STOP"
        res["stop"] = str(st)
        lo = max(0, st.pc - 4)
        res["hex"] = " ".join(f"{b:02x}" for b in data[lo:st.pc + 12])
    return res


# ----------------------------------------------------------------------------
# Full script disassembler -- decode an NPC's WHOLE TalkBuf into an addressed,
# assembly-like listing (every opcode in address order, operands resolved, GOTO
# labels, keyword blocks, IF/factor expressions, side-effects, '??? 0xNN' for an
# unknown opcode). The agent's structural/reference view of a script: the "what"
# (which keyword gives what, which flag gates what, a copy-protection answer
# key). The agent owns the "how" -- see the rule of engagement in u6_ai_agent.md:
# a manual-lookup/copy-protection answer may be read here directly, but a game
# PUZZLE must be solved by playing, not lifted from the disassembly. Unlike
# decode_block this walks LINEARLY (no control-flow following). seg_1703.c.
# ----------------------------------------------------------------------------
_DIS_BINOP = {0x90: "+", 0x91: "-", 0x92: "*", 0x93: "/", 0x94: "||", 0x95: "&&",
              0x81: ">", 0x82: ">=", 0x83: "<", 0x84: "<=", 0x85: "!=", 0x86: "=="}
_DIS_QUERY = {                                  # parse_factor query op -> (name, argc)
    0xa0: ("Rand", 2), 0xab: ("Flag", 2), 0x9f: ("Owns", 3), 0xbb: ("HasObj", 2),
    0xc7: ("WhosGot", 2), 0xc6: ("InParty", 1), 0xdc: ("Poisoned", 1),
    0x9d: ("Horsed", 1), 0xc2: ("ObjType", 1), 0xc1: ("Owner", 1), 0xda: ("Wounded", 1),
    0xd7: ("OnScreen", 1), 0x9a: ("CanCarry", 1), 0xca: ("Join", 1), 0xcc: ("LeaveParty", 1),
}
_DIS_STMT = {                                   # side-effect opcode -> mnemonic
    0xa4: "SET", 0xa5: "CLR", 0xb9: "GIVEOBJ", 0xba: "TAKEOBJ", 0xc8: "MOVEOBJ",
    0xc9: "TRANSFEROBJ", 0xc4: "ADDKARMA", 0xc5: "SUBKARMA", 0xcd: "SETMODE",
    0xd6: "RESURRECT", 0xd9: "HEAL", 0xdb: "CURE", 0x9c: "GETHORSE", 0xd0: "DELAY",
    0xbe: "SHOWINVEN", 0xbf: "SHOWPORTRAIT", 0xd8: "SETNAME", 0xdf: "SETNAME2",
}
_DIS_MARK = {                                   # 0-operand structural / control markers
    0xf1: "DESC", 0xf2: "MAIN", 0xf3: "PREFIX", 0xf7: "ASKTOP", 0xee: "ENDRES",
    0xf6: "RES", 0xa2: "ENDIF", 0xa3: "ELSE", 0xb6: "LEAVE", 0xcb: "WAIT", 0x9e: "REST",
    0xf8: "GET",                                 # GET's permitted-keys string renders as text
    0xa7: "(eof)",                               # stray END_OF_FACTOR -> VM no-op (decode_block)
    # NOTE: GETSTR/GETCHR/GETINT/GETDIGIT (0xf9-0xfc) are NOT here -- they carry a
    # <idx><b2/b3> var operand and are handled explicitly in _disassemble.
}


def _disasm_factor(d, pc):
    """Decode a parse_factor RPN expression to a readable infix string. Returns
    (expr, pc_after). Mirrors _ConverseVM.evaluate but builds text; an
    unrecognized byte is a literal (the engine's default -- seg_1703.c:319)."""
    n = len(d); st = []
    pop = lambda: st.pop() if st else "?"
    guard = 0
    while pc < n and guard < 256:
        guard += 1
        op = d[pc]; pc += 1
        if op in (0xa7, 0xa8):                  # END_OF_FACTOR / LET_VALUE
            break
        if op == 0xd2:                          # ADDRESS
            st.append(f"@0x{int.from_bytes(d[pc:pc+4],'little'):04x}"); pc += 4
        elif op == 0xd3:                        # BYTE
            b = d[pc] if pc < n else 0; pc += 1; st.append("self" if b == 0xeb else str(b))
        elif op == 0xd4:                        # WORD
            st.append(str(int.from_bytes(d[pc:pc+2], 'little'))); pc += 2
        elif op == 0xb2:                        # VARINT
            st.append(f"VarInt[{pop()}]")
        elif op == 0xb3:                        # VARSTR
            st.append(f"VarStr[{pop()}]")
        elif op in _DIS_BINOP:
            b = pop(); a = pop(); st.append(f"({a} {_DIS_BINOP[op]} {b})")
        elif op in _DIS_QUERY:
            name, ac = _DIS_QUERY[op]
            args = [pop() for _ in range(ac)][::-1]
            st.append(f"{name}({', '.join(args)})")
        else:
            st.append(str(op))                  # bare literal
    return (st[-1] if st else "0"), pc


def _disasm_let(d, pc):
    """OP_LET -> 'LET <dest> = <expr>' (seg_1703.c:746)."""
    n = len(d)
    di = d[pc] if pc < n else 0; pc += 1
    if di == 0xd2:                              # ADDRESS dest (var cell / list element)
        a = int.from_bytes(d[pc:pc+4], "little"); pc += 4
        if pc < n and d[pc] == 0xa8: pc += 1
        expr, pc = _disasm_factor(d, pc)         # value factor(s): an a8-separated chain
        parts, guard = [expr], 0                 # (list-element LET: <idx> a8 <val> a7)
        while 0 < pc <= n and d[pc - 1] == 0xa8 and guard < 8:
            guard += 1
            e2, pc = _disasm_factor(d, pc); parts.append(e2)
        rhs = f"[{parts[0]}] = {parts[1]}" if len(parts) == 2 else "= " + " | ".join(parts)
        return f"LET @0x{a:04x}{rhs}", pc
    kind = d[pc] if pc < n else 0; pc += 1       # VARINT (0xb2) / VARSTR (0xb3)
    if pc < n and d[pc] == 0xa8: pc += 1         # LET_VALUE
    if kind == 0xb2:
        expr, pc = _disasm_factor(d, pc)
        return f"LET VarInt[{di}] = {expr}", pc
    tag = d[pc] if pc < n else 0; pc += 1        # string assignment
    if tag == 0xd2:                              # = @addr[index] (string-list ref)
        a = int.from_bytes(d[pc:pc+4], "little"); pc += 4
        if pc < n and d[pc] == 0xb1:             # CALL -> direct ref
            return f"LET VarStr[{di}] = @0x{a:04x}", pc + 1
        idx, pc = _disasm_factor(d, pc)          # index factor selects the Nth string
        return f"LET VarStr[{di}] = @0x{a:04x}[{idx}]", pc
    if pc < n and d[pc] == 0xb3: pc += 1
    return f"LET VarStr[{di}] = VarStr[?]", pc


def _disasm_printstr(d, pc):
    """OP_PRINTSTR -> 'PRINTSTR @addr[index]' / VarStr (seg_1703.c:729)."""
    n = len(d)
    tag = d[pc] if pc < n else 0; pc += 1
    if tag == 0xd2:                              # ADDRESS -> string-list
        a = int.from_bytes(d[pc:pc+4], "little"); pc += 4
        if pc < n and d[pc] == 0xb1:             # CALL -> direct ref
            return f"PRINTSTR @0x{a:04x}", pc + 1
        idx, pc = _disasm_factor(d, pc)          # index factor selects the Nth string
        return f"PRINTSTR @0x{a:04x}[{idx}]", pc
    if tag != 0xd5:                              # VarStr form: di + checked byte
        di = d[pc] if pc < n else 0; pc += 2
        return f"PRINTSTR VarStr[{di}]", pc
    return "PRINTSTR", pc


def _disassemble(d, n):
    """Linear disassembly of the first `n` bytes of a TalkBuf image. Text runs
    render as quoted strings; GOTO targets become L_xxxx labels; an unknown
    opcode is flagged '??? 0xNN' (not fatal). Stops at >=16 zero bytes (end)."""
    lines, labels, pc = [], set(), 0
    while pc < n:
        if pc + 16 <= n and not any(d[pc:pc + 16]):     # zero padding -> end of script
            break
        addr = pc
        op = d[pc]
        if op < 0x80:                                   # inline ASCII text run
            s = bytearray()
            while pc < n and d[pc] and d[pc] < 0x80:
                s.append(d[pc]); pc += 1
            if pc < n and d[pc] == 0:                    # NUL between strings
                pc += 1
            lines.append((addr, '"' + s.decode("latin-1", "replace").replace("\n", "\\n") + '"'))
            continue
        pc += 1
        if op == 0xff:                                  # OP_ID + npcId
            npc = d[pc] if pc < n else 0; pc += 1
            lines.append((addr, f"ID npc={npc}"))
        elif op in _DIS_MARK:
            lines.append((addr, _DIS_MARK[op]))
        elif op == 0xef:                                # KEY <kw,...>  (until RES)
            kw = bytearray()
            while pc < n and d[pc] != 0xf6:
                kw.append(d[pc]); pc += 1
            lines.append((addr, 'KEY "' + kw.decode("latin-1", "replace") + '"'))
        elif op == 0xb0:                                # GOTO u32
            tgt = int.from_bytes(d[pc:pc + 4], "little"); pc += 4
            labels.add(tgt); lines.append((addr, f"GOTO L_{tgt:04x}"))
        elif op == 0xa1:                                # IF <factor>
            expr, pc = _disasm_factor(d, pc); lines.append((addr, f"IF {expr}"))
        elif op == 0xa6:                                # LET
            text, pc = _disasm_let(d, pc); lines.append((addr, text))
        elif op in _CV_SIDE_EFFECT:                     # SET/GIVEOBJ/HEAL/... <factors>
            args = []
            for _ in range(_CV_SIDE_EFFECT[op]):
                e, pc = _disasm_factor(d, pc); args.append(e)
            mn = _DIS_STMT.get(op, f"OP_{op:02x}")
            cmt = f"   ; obj 0x{int(args[1]):02x}" if op in (0xb9, 0xba) and args[1].isdigit() else ""
            lines.append((addr, f"{mn} {', '.join(args)}{cmt}"))
        elif op == 0xb5:                                # PRINTSTR @addr[index] / VarStr
            text, pc = _disasm_printstr(d, pc)
            lines.append((addr, text))
        elif op in (0xf9, 0xfa, 0xfb, 0xfc):            # GET* var input: <idx><b2/b3>
            idx = d[pc] if pc < n else 0; pc += 1
            if pc < n and d[pc] in (0xb2, 0xb3): pc += 1
            nm = {0xf9: "GETSTR", 0xfa: "GETCHR", 0xfb: "GETINT", 0xfc: "GETDIGIT"}[op]
            lines.append((addr, f"{nm} Var[{idx}]"))
        else:
            lines.append((addr, f"??? 0x{op:02x}"))
    out, starts = [], {a for a, _ in lines}
    for addr, text in lines:
        if addr in labels:
            out.append(f"L_{addr:04x}:")
        out.append(f"  0x{addr:04x}: {text}")
    for t in sorted(labels - starts):                   # jump into a mid-instruction byte
        out.append(f"; note: L_{t:04x} targets mid-instruction byte 0x{t:04x}")
    return "\n".join(out)


@mcp.tool()
def u6_script_disasm(segment: int = -1, max_bytes: int = 4096) -> str:
    """Ultima VI: disassemble the CURRENTLY-LOADED NPC conversation script (the live
    TalkBuf) into an addressed, assembly-like listing -- every opcode with operands,
    GOTO labels, keyword (KEY/RES) blocks, IF/factor expressions, side-effects
    (SET/GIVEOBJ/HEAL/...), and an inline '??? 0xNN' for any unknown opcode. The
    agent's full structural view of a script: which keyword gives which object, which
    flag gates which branch, a copy-protection answer key, etc. A conversation must be
    OPEN (talk to the NPC first) so its script is in TalkBuf. RULE OF ENGAGEMENT:
    reading the script is allowed, but you may answer a manual-lookup / copy-protection
    prompt directly ONLY; a game PUZZLE must be solved by playing, never lifted from
    here -- and say which you are doing. DS from u6_hook unless overridden with
    segment=. max_bytes caps the window (default 4096; the buffer is 0x2800)."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base_addr = S.membase + (ds << 4)
    try:
        active = dm.read(S.handle, base_addr + U6_IsInConversation, 1)[0]
        fp = dm.read(S.handle, base_addr + U6_TalkBuf_ptr, 4)
        tb_lin = (((fp[2] | (fp[3] << 8)) << 4) + (fp[0] | (fp[1] << 8)))
        n = max(1, min(int(max_bytes), U6_TalkBuf_SIZE))
        data = dm.read(S.handle, S.membase + tb_lin, n)
    except OSError as ex:
        return f"Read failed reading TalkBuf (DS=0x{ds:04x}): {ex}"
    head = ("" if active else "(no conversation open -- TalkBuf may be stale; "
            "talk to an NPC first)\n")
    return head + _disassemble(data, len(data))


@mcp.tool()
def u6_conversation(keyword: str = "", raw: int = 0, segment: int = -1) -> str:
    """Ultima VI: read the live conversation as READABLE dialogue. With no args it
    returns the NPC, the greeting (decoded from TalkBuf), the prompt type, the
    askable keywords, and the HIGHLIGHTED words -- the '@'-marked cues U6 draws in a
    bright colour, i.e. exactly what an on-screen player would see as "ask me about
    this" (the prose is returned clean, with the '@' stripped). Pass
    keyword="gargoyle" to preview that keyword's response (decoded ahead of the
    prompt -- so the agent reads it before committing with u6_say). Conditions
    (flags/inventory/party/status) are evaluated against live
    memory; random-flavor branches show as [either: A | B]; an UNKNOWN opcode
    returns status=DECODER_STOP -- the agent MUST halt and report it (don't guess).

    `raw=1` appends the old hex window of TalkBuf from Talk_PC (for debugging). DS
    from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base_addr = S.membase + (ds << 4)
    try:
        r = _decode_conversation(base_addr, keyword.strip())
    except OSError as ex:
        return f"Read failed reading talk-engine state (DS=0x{ds:04x}): {ex}"

    if not r["active"]:
        head = "IsInConversation = 0 (idle -- no conversation open)"
    else:
        head = f"NPC = {r['npc']!r} (#{r['npc_num']})   prompt = {r['prompt']}"
    out = [head]
    if r.get("status") == "DECODER_STOP":
        out += [f"** DECODER_STOP: {r['stop']} **",
                f"  hex: {r.get('hex','')}",
                "  -> HALT and report: the converse decoder hit an opcode it can't "
                "handle; do not act on partial dialogue."]
        return "\n".join(out)
    if "said" in r:
        out.append(f"said: {r['said']}")
    if r.get("highlighted"):
        out.append("highlighted (ask next): " + ", ".join(r["highlighted"]))
    if r.get("keywords"):
        out.append("keywords: " + ", ".join(r["keywords"]))
    if r.get("last_input"):
        out.append(f"(last input: {r['last_input']!r})")

    if raw:
        pc = r["pc"]
        n = min(64, U6_TalkBuf_SIZE - pc) if 0 <= pc < U6_TalkBuf_SIZE else 0
        if n > 0:
            try:
                fp = dm.read(S.handle, base_addr + U6_TalkBuf_ptr, 4)
                tb_lin = (((fp[2] | (fp[3] << 8)) << 4) + (fp[0] | (fp[1] << 8)))
                window = dm.read(S.handle, S.membase + tb_lin + pc, n)
                out.append(f"raw TalkBuf[Talk_PC..+{n}]: " + " ".join(f"{b:02x}" for b in window))
            except OSError:
                pass
    return "\n".join(out)


# ----------------------------------------------------------------------------
# Ultima VI action verbs -- semantic wrappers over the generic input tools
# (dosbox_input). Movement/talk encode U6's key bindings; u6_say picks line- vs
# single-key input from the converse-VM opcode at Talk_PC.
# ----------------------------------------------------------------------------
_U6_DIR = {
    "n": "up", "north": "up", "up": "up",
    "s": "down", "south": "down", "down": "down",
    "w": "left", "west": "left", "left": "left",
    "e": "right", "east": "right", "right": "right",
}
# 8-way cursor map for the SelectRange=7 commands (LOOK / TALK): the cross-cursor can
# travel diagonally and several tiles, so a direction expands to the ORDERED arrow
# presses that walk it one tile that way (a diagonal = two arrows). GET stays on the
# 4-way _U6_DIR -- its SelectRange=-1 auto-commits on the first arrow, so it can only
# ever reach a cardinal-adjacent tile.
_U6_DIR8 = {
    "n": ["up"], "north": ["up"], "up": ["up"],
    "s": ["down"], "south": ["down"], "down": ["down"],
    "w": ["left"], "west": ["left"], "left": ["left"],
    "e": ["right"], "east": ["right"], "right": ["right"],
    "ne": ["up", "right"], "northeast": ["up", "right"],
    "nw": ["up", "left"], "northwest": ["up", "left"],
    "se": ["down", "right"], "southeast": ["down", "right"],
    "sw": ["down", "left"], "southwest": ["down", "left"],
}
# Converse opcodes that read a SINGLE key (vs a typed line) -- see _TALK_INPUT_OPS.
_TALK_SINGLEKEY_OPS = {0xf8, 0xfa, 0xfc, 0xcb}  # GET, GETCHR, GETDIGIT, WAIT


# ----------------------------------------------------------------------------
# Shared cursor-command skeleton for the cursor-targeting verbs (LOOK/TALK/GET/
# USE). They are one shape -- validate direction -> (blind if not hooked) ->
# _begin_select -> _walk_cursor -> _drain_to_ready -> report -- differing only in
# 8-way vs cardinal, Enter-commit (SelectRange=7) vs arrow auto-commit
# (SelectRange=-1), and the per-verb result read-back. The scaffolding lives here;
# the per-verb result text stays in each verb. (The state-machine primitives an
# inventory-target USE will need -- guarded-send, abort-to-ready -- are deferred to
# that feature, not added here where they'd be unused.)
# ----------------------------------------------------------------------------
_CURSOR_STEP = 0.12   # seconds between cursor keystrokes -- let DOSBox consume each

# A long greeting/response contains a '*' page-pause (CON_putch '*' -> CON_getch,
# seg_0C9C.c:1830; also the screen-full auto-break :1698). While it's blocking,
# PromptCh==1 and a keystroke only ADVANCES the page -- so the first char of a reply
# typed into a paused conversation is eaten ("name" -> "ame"). The real keyword
# prompt is CON_gets, which raises D_049B==1 while it reads the line. So u6_say
# advances past any page-pause (ENTER while PromptCh==1) until D_049B==1, THEN types
# -- deterministic, not a timing guess. _PAGE_ADVANCE_SETTLE lets the engine render
# the next page after each ENTER before we re-read.
_PAGE_ADVANCE_SETTLE = 0.3


def _begin_select(base_addr, letter, verb):
    """Enter a cursor command: wait for COMMAND_READY (the letter must land as a fresh
    command), press `letter`, confirm the cross-cursor came up (SELECTING). Returns an
    error string on failure, or None on success."""
    _wait_command_ready(base_addr)
    inp.send_key(letter)
    st, _ = _wait_state(base_addr, "SELECTING")
    if st != "SELECTING":
        return f"{verb}: '{letter.upper()}' did not enter select mode (state={st})."
    return None


def _walk_cursor(keys, commit_enter):
    """Walk the cross-cursor: press each key in `keys` a _CURSOR_STEP apart, then -- for
    a SelectRange=7 command -- press Enter to commit. For SelectRange=-1 the arrow
    itself auto-commits (commit_enter=False, no Enter). Reproduces the talk/look (Enter)
    and get/use (auto-commit; `here`=Enter) sequences."""
    for k in keys:
        time.sleep(_CURSOR_STEP)
        inp.send_key(k)
    if commit_enter:
        time.sleep(_CURSOR_STEP)
        inp.send_key("enter")


def _blind_cursor_cmd(verb, letter, keys, commit_enter):
    """Not-hooked fallback for a cursor command: press the letter, the cursor keys, then
    (if commit_enter) Enter -- ungated best-effort, no state gate. Returns the result
    string."""
    inp.send_key(letter); time.sleep(0.15)
    for k in keys:
        inp.send_key(k); time.sleep(_CURSOR_STEP)
    if commit_enter:
        inp.send_key("enter")
    seq = "+".join([letter, *keys] + (["enter"] if commit_enter else []))
    return f"{verb}: sent {seq} blind (not hooked)."


# ----------------------------------------------------------------------------
# State-machine primitives for the multi-step inventory-target route (USE on a
# carried item / the locked-door key flow). Every step is a GUARDED send: send a
# key, then poll a memory read until it confirms the key landed -- the receipt is
# the read, not a sleep (the agent can't see the screen). _abort_to_ready is the
# universal bail (the engine's own ESC cancel) for any mid-sequence mismatch.
# ----------------------------------------------------------------------------
def _guarded_send(base_addr, key, want, timeout=2.5):
    """Send `key`, then poll until confirmed. `want` is a state name / an iterable of
    names (checked against _input_state) OR a zero-arg predicate () -> bool that reads
    whatever memory it needs. Returns (ok, last_state). The receipt is the read."""
    inp.send_key(key)
    if callable(want):
        test = want
    else:
        targets = (want,) if isinstance(want, str) else tuple(want)
        test = lambda: _input_state(base_addr)[0] in targets
    deadline = time.time() + timeout
    ok = test()
    while not ok and time.time() < deadline:
        time.sleep(0.03)
        ok = test()
    return ok, _input_state(base_addr)[0]


def _abort_to_ready(base_addr, cap=8):
    """Universal bail: ESC -> drain to COMMAND_READY (the engine's own cancel -- first
    ESC clears SelectMode, the next clears MouseMode). Bounded; returns the final state.
    A USE that aborts BEFORE its commit costs no turn, so bailing is cheap and safe."""
    for _ in range(cap):
        state, _ = _input_state(base_addr)
        if state == "COMMAND_READY":
            return state
        inp.send_key("esc")
        time.sleep(_CURSOR_STEP)
    return _input_state(base_addr)[0]


@mcp.tool()
def u6_move(direction: str) -> str:
    """Ultima VI: step the party one tile. direction = n/s/e/w (also
    north/south/east/west or up/down/left/right). Sends the arrow key via
    SendInput (DOSBox focused first). Verify the binding live."""
    key = _U6_DIR.get(direction.strip().lower())
    if not key:
        return f"Unknown direction {direction!r}. Use n/s/e/w."
    b = _session_base()
    if b is not None:
        _wait_command_ready(b)          # act only on our turn (input is buffered)
    return inp.send_key(key)


@mcp.tool()
def u6_talk(direction: str) -> str:
    """Ultima VI: open a conversation with the NPC in `direction` (n/s/e/w, or a
    diagonal ne/nw/se/sw). TALK is a CURSOR-targeting command like LOOK (source
    seg_0A33.c:1061 -- SelectMode=1, SelectRange=7): it presses 'T', walks the
    cross-cursor onto the NPC's tile, then ENTER to commit (Enter->CMD_8E at
    seg_0C9C.c:1206; arrows only move the cursor, they do NOT commit). On a valid NPC
    this starts a conversation
    (IsInConversation=1 -> state CONVERSATION); then poll u6_conversation() and reply
    with u6_say()/u6_key(). Turn-gated."""
    arrows = _U6_DIR8.get(direction.strip().lower())
    if not arrows:
        return (f"Unknown direction {direction!r}. Use n/s/e/w or a diagonal "
                f"(ne/nw/se/sw).")
    b = _session_base()
    if b is None:                                    # not hooked: best-effort blind
        return _blind_cursor_cmd(f"talk {direction}", "t", arrows, True)
    err = _begin_select(b, "t", f"talk {direction}")  # 'T' as a fresh command -> SELECTING
    if err:
        return err
    _walk_cursor(arrows, True)                        # onto the NPC, then Enter -> TALK_talkTo
    state, _ = _wait_state(b, ("CONVERSATION", "COMMAND_READY"), timeout=3.0)
    if state == "CONVERSATION":
        return (f"talk {direction}: conversation started. "
                f"Poll u6_conversation(); reply with u6_say()/u6_key().")
    state, _ = _drain_to_ready(b)                     # clear any "no response" message
    return (f"talk {direction}: no conversation (now {state}). "
            f"Is a talkable NPC adjacent that way?")


@mcp.tool()
def u6_look(direction: str) -> str:
    """Ultima VI: LOOK at the adjacent tile in `direction` (n/s/e/w, or a diagonal
    ne/nw/se/sw). LOOK is a CURSOR-targeting command (source seg_0A33.c:1070 --
    SelectMode=1, SelectRange=7, so the cursor may move diagonally and up to 7 tiles):
    it presses 'L', walks the cross-cursor onto the target tile, then ENTER to
    commit (Enter->CMD_8E at seg_0C9C.c:1206). The result prints to the message scroll
    -- an NPC shows name + portrait, an object its name/weight, a container/book its
    contents (which can span several pages). This drives the whole sequence and then
    DRAINS the result back to COMMAND_READY (dismiss key = Enter) so variable-length
    output needs no key-counting. Because the agent cannot read the scroll, the return
    also lists the NOTABLE objects (weight>0 or readyable) now on the looked tile: LOOK's
    search surfaces a corpse/container's hidden items to LOCXYZ, and reading that state
    is the agent's real result (e.g. a looted corpse's club/helm appear here). Floor and
    scenery are omitted (use u6_walkable for terrain). Turn-gated."""
    arrows = _U6_DIR8.get(direction.strip().lower())
    if not arrows:
        return (f"Unknown direction {direction!r}. Use n/s/e/w or a diagonal "
                f"(ne/nw/se/sw).")
    b = _session_base()
    if b is None:                                    # not hooked: best-effort blind
        return _blind_cursor_cmd(f"look {direction}", "l", arrows, True)
    err = _begin_select(b, "l", f"look {direction}")  # 'L' as a fresh command -> SELECTING
    if err:
        return err
    _walk_cursor(arrows, True)                        # onto the target tile, then Enter (commit)
    state, pages = _drain_to_ready(b)                 # dismiss the result page(s)
    # The agent can't read the scroll, so report the notable objects now on the looked
    # tile -- LOOK's search surfaces a corpse/container's hidden items to LOCXYZ, and
    # that state change IS the readable result.
    note = ""
    try:
        tx, ty, z0 = _target_tile(b, arrows)
        items = _notable_at_tile(b, tx, ty, z0)
        if items:
            desc = ", ".join(
                f"{name} (0x{i:03x} type{typ} w{wt}"
                + ("" if e < 0 else f" {_EQUIP_SLOT_NAME[e]}") + ")"
                for i, name, typ, wt, e in items)
            note = f" Notable at ({tx},{ty}): {desc}."
        else:
            note = f" No notable objects at ({tx},{ty})."
    except OSError:
        note = ""
    return f"look {direction}: committed; dismissed {pages} page(s); now {state}.{note}"


@mcp.tool()
def u6_get(direction: str) -> str:
    """Ultima VI: GET (pick up) the object on the adjacent tile in `direction`
    (n/s/e/w). GET is adjacent-ONLY (source seg_0A33.c:1079 -- SelectMode=1,
    SelectRange=-1), so the direction arrow AUTO-COMMITS to that tile -- NO Enter is
    sent (seg_0C9C.c:1242: SelectRange==-1 -> CMD_8E on the arrow). This presses 'G',
    sends the arrow to commit, then drains the result message back to COMMAND_READY.
    The avatar must be next to the object and within the carry cap (see
    u6_roster_status); on success the object's CoordUse flips LOCXYZ -> INVEN
    (assoc = the member). Confirm via u6_inventory / u6_object(slot). Turn-gated."""
    key = _U6_DIR.get(direction.strip().lower())
    if not key:
        return (f"Invalid GET direction {direction!r}. GET is adjacent-only "
                f"(cardinal n/s/e/w) -- its arrow auto-commits (SelectRange=-1), so "
                f"diagonal/far tiles aren't reachable by keyboard.")
    b = _session_base()
    if b is None:                                    # not hooked: best-effort blind
        return _blind_cursor_cmd(f"get {direction}", "g", [key], False)
    err = _begin_select(b, "g", f"get {direction}")   # 'G' as a fresh command -> SELECTING
    if err:
        return err
    _walk_cursor([key], False)                        # the arrow auto-commits (SelectRange==-1)
    state, msgs = _drain_to_ready(b)                  # clear the result message(s)
    return (f"get {direction}: committed; cleared {msgs} message(s); now {state}. "
            f"Confirm pickup via u6_inventory / u6_object.")


# ----------------------------------------------------------------------------
# Inventory-target USE -- driving the status panel to USE a CARRIED item, and the
# locked-door key flow. The panel is the ONLY route to an inventory target: F<member>
# shows that member's INVENTORY view (StatusDisplay==CMD_92), <tab> arms the panel
# cursor (SelectMode==2), Enter commits on the cell under the cursor (C_155D_1267).
# The tool absorbs this keyboard mechanism; the agent supplies only a SEMANTIC `on=`
# choice when an item needs one (potion->member, orb->where, dig->direction, ...).
# ----------------------------------------------------------------------------
_USE_POTION     = 0x113                              # potion -> on = a party member
_USE_ORB        = 0x057                              # orb of the moons -> on = a 'where' (map dir)
_USE_DIR        = frozenset((0x067, 0x068, 0x09a))   # pick/shovel/telescope -> on = a direction
_USE_INSTRUMENT = frozenset((0x09d, 0x09c, 0x09e, 0x099, 0x128))  # -> on = a digit tune
_DOOR_LOCKED    = range(8, 0xc)                      # door frame band: locked (key, qual match)
# Equipment-silhouette cursor cells -- equip slot -> (D_0499 col, D_049A row), derived
# from D_054B/D_0559 (seg_0C9C.c:103) feeding C_155D_130E's hit rectangles (the Enter
# redraw C_0C9C_1AE5(2) sets PointerX/Y = D_054B[col]/D_0559[row][col]). Verified
# against both tables: HEAD NECK RHND RFNG CHST LHND LFNG FEET (SLOT_* 0..7).
_EQUIP_CELL = {0: (1, 0), 1: (0, 0), 2: (0, 1), 3: (0, 2),
               4: (2, 0), 5: (2, 1), 6: (2, 2), 7: (1, 2)}


def _rd8(addr):   return dm.read(S.handle, addr, 1)[0]
def _rd16(addr):  return int.from_bytes(dm.read(S.handle, addr, 2), "little")
def _rd16s(addr): return int.from_bytes(dm.read(S.handle, addr, 2), "little", signed=True)


def _obj_tfq(base_addr, slot):
    """(type, frame, qual) for an object slot."""
    sh = _rd16(base_addr + U6_ObjShapeType + slot * 2)
    am = _rd16(base_addr + U6_Amount + slot * 2)
    return sh & 0x3ff, sh >> 10, am >> 8


def _party_member_slot(base_addr, idx):
    """Object slot of party member `idx` (Party[idx])."""
    return _rd8(base_addr + U6_Party + idx)


def _holder_party_index(base_addr, holder_slot):
    """Party index (0..7) whose object slot == `holder_slot` (an item's INVEN/EQUIP
    assoc), or -1 if the holder isn't a party member."""
    psize = _rd8(base_addr + U6_PartySize)
    for i in range(min(psize, 8)):
        if _rd8(base_addr + U6_Party + i) == holder_slot:
            return i
    return -1


def _visible_backpack(base_addr):
    """The 12 visible backpack object slots (D_E70F); 0 = an empty cell."""
    n = U6_BACKPACK_COLS * U6_BACKPACK_ROWS
    raw = dm.read(S.handle, base_addr + U6_VisBackpack, n * 2)
    return [raw[i * 2] | (raw[i * 2 + 1] << 8) for i in range(n)]


def _door_at_tile(base_addr, tx, ty, tz):
    """A door (OBJ_129..12C) on tile (tx,ty,tz) -> (slot, type, frame, qual), else None."""
    status = dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS)
    pos    = dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3)
    shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    amount = dm.read(S.handle, base_addr + U6_Amount, U6_MAX_SLOTS * 2)
    for i in range(0x100, U6_MAX_SLOTS):
        if status[i] & 0x18:                              # not LOCXYZ
            continue
        typ = (shape[i * 2] | (shape[i * 2 + 1] << 8)) & 0x3ff
        if typ not in _U6_DOOR_TYPES:
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        if (v & 0x3ff) == tx and ((v >> 10) & 0x3ff) == ty and ((v >> 20) & 0xf) == tz:
            return i, typ, (shape[i * 2 + 1] >> 2), amount[i * 2 + 1]   # frame=sh>>10, qual=am>>8
    return None


def _find_matching_key(base_addr, member_slot, lock_qual):
    """The member's owned key that opens a lock of `lock_qual` (an OBJ_040 with qual ==
    lock_qual, qual != 0; or a lockpick OBJ_03F on a qual-0 lock) -- searching CONTAINED
    items too (a key inside a bag still belongs to the member). Returns
    (key_slot, container_slot): container_slot is -1 when the key is held DIRECTLY
    (INVEN/EQUIP, so USE can reach it), else the bag/chest it sits inside (the agent must
    take it out first -- USE can't target a contained item). (-1, -1) if none owned. The
    agent does the ownership/qual check the engine skips (seg_27a1.c:1410)."""
    status = dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS)
    pos    = dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3)
    shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    amount = dm.read(S.handle, base_addr + U6_Amount, U6_MAX_SLOTS * 2)

    def owner(slot):
        """Walk the held-by chain (INVEN/EQUIP/CONTAINED assoc) up to the < 0x100 holder
        -- a member slot, or a world slot if the chain roots in a ground container."""
        for _ in range(64):
            if slot < 0x100 or not (status[slot] & 0x18):
                break
            slot = pos[slot * 3] | (pos[slot * 3 + 1] << 8)
        return slot

    for i in range(0x100, U6_MAX_SLOTS):
        cu = status[i] & 0x18
        if cu not in (0x08, 0x10, 0x18):                  # CONTAINED / INVEN / EQUIP
            continue
        typ = (shape[i * 2] | (shape[i * 2 + 1] << 8)) & 0x3ff
        qual = amount[i * 2 + 1]
        if not ((lock_qual and typ == 0x040 and qual == lock_qual)
                or (not lock_qual and typ == 0x03f)):
            continue
        if owner(i) != member_slot:                       # not in this member's possession
            continue
        container = (pos[i * 3] | (pos[i * 3 + 1] << 8)) if cu == 0x08 else -1
        return i, container
    return -1, -1


def _resolve_member(base_addr, on):
    """`on` -> a party-select digit '1'..'8' (route 3: a digit selects Party[n-1],
    seg_0C9C.c:1298). Accepts a digit or a member NAME (matched against Names[]).
    Returns the digit char, or None."""
    on = (on or "").strip()
    if on in tuple("12345678"):
        return on
    if not on:
        return None
    psize = _rd8(base_addr + U6_PartySize)
    for i in range(min(psize, 8)):
        nm = dm.read(S.handle, base_addr + U6_Names + i * 14, 14).split(b"\x00", 1)[0]
        if nm.decode("latin-1", "replace").lower() == on.lower():
            return str(i + 1)
    return None


def _parse_slot(t):
    """A USE target string -> an inventory object slot int, or None if it's a map
    direction. Accepts `inv:0x305` / `inv:773` / `0x305` / `773`."""
    s = t[4:] if t.startswith("inv:") else t
    try:
        if s.startswith("0x"):
            return int(s, 16)
        if s.isdigit():
            return int(s)
    except ValueError:
        pass
    return None


def _panel_commit(base_addr, member_index, command, locate, confirm):
    """Shared status-panel drive for inventory-target commands (USE-on-item, READY/
    UNREADY) -- the only route to an inventory target. Steps, each confirmed by a memory
    read: F<member+1> -> INVENTORY view (CMD_92); `locate()` finds the target's cursor
    cell (col,row) in the now-shown panel (or None); [`command` -> SELECTING, for a verb
    like USE; None for the command-less Ready toggle]; <tab> -> panel cursor
    (SelectMode==2); **WRITE D_0499/D_049A to the cell** (the Enter redraw C_0C9C_1AE5(2)
    sets PointerX/Y = D_054B[col]/D_0559[row][col], so the write lands exactly); <enter>
    -> `confirm()`. Any mismatch ESC-aborts to COMMAND_READY (a command that aborts
    before its effect costs no turn). Returns (ok, err)."""
    fkey = f"f{member_index + 1}"                          # F1..F8 select a member's view
    ok, _ = _guarded_send(base_addr, fkey,
                          lambda: _rd16(base_addr + U6_StatusDisplay) == 0x92)
    if not ok:
        return False, (f"could not open member {member_index}'s INVENTORY view "
                       f"(F{member_index + 1} -> StatusDisplay != CMD_92)")
    cell = locate()
    if cell is None:
        _abort_to_ready(base_addr)
        return False, "target not on the panel (a carried item must be on the visible backpack page -- scroll first)"
    col, row = cell
    if command:
        ok, _ = _guarded_send(base_addr, command, "SELECTING")
        if not ok:
            _abort_to_ready(base_addr); return False, f"'{command.upper()}' did not enter select mode"
    ok, _ = _guarded_send(base_addr, "tab", lambda: _rd8(base_addr + U6_SelectMode) == 2)
    if not ok:
        _abort_to_ready(base_addr); return False, "<tab> did not arm the panel cursor (SelectMode != 2)"
    dm.write(S.handle, base_addr + U6_PanelCol, bytes([col]))
    dm.write(S.handle, base_addr + U6_PanelRow, bytes([row]))
    ok, _ = _guarded_send(base_addr, "enter", confirm)
    if not ok:
        _abort_to_ready(base_addr); return False, "commit did not take effect"
    return True, ""


def _select_backpack_item(base_addr, member_index, target_slot):
    """USE-commit on `target_slot` in member `member_index`'s backpack: _panel_commit
    with the 'u' command, the backpack cell, and confirm = Selection.obj == target."""
    def locate():
        pack = _visible_backpack(base_addr)
        if target_slot not in pack:
            return None
        r, c = divmod(pack.index(target_slot), U6_BACKPACK_COLS)
        return (c + 3, r)             # backpack col c -> cursor col c+3 (cols 0-2 = equip silhouette)
    return _panel_commit(base_addr, member_index, "u", locate,
                         lambda: _rd16s(base_addr + U6_Sel_obj) == target_slot)


def _use_key_flow(base_addr, keys, door, label):
    """Open a LOCKED door (frame 8-0xB) by USE-ing the matching key: find the owned key
    (the qual/ownership check the engine skips), select it in the panel, then the
    engine's "On " prompt (C_27A1_2D8E) targets the door -- the arrow auto-commits
    (SelectRange=-1 from 'U')."""
    slot, _typ, _frame, qual = door
    ai = _controlled_slot(base_addr)[1]
    member_slot = _party_member_slot(base_addr, ai)
    key, container = _find_matching_key(base_addr, member_slot, qual)
    if key < 0:
        need = f"a key (OBJ_040) of qual {qual}" if qual else "a lockpick (OBJ_03F)"
        return f"{label}: door locked (qual={qual}); no matching {need} in inventory."
    if container >= 0:                                          # key exists but is in a bag/chest
        return (f"{label}: door locked (qual={qual}); the matching key {_obj_name(base_addr, key)} "
                f"(0x{key:03x}) is INSIDE {_obj_name(base_addr, container)} (0x{container:03x}) -- "
                f"take it out of the container first (USE can't reach a contained item).")
    ok, err = _select_backpack_item(base_addr, ai, key)
    if not ok:
        return f"{label}: locked door; couldn't select the key -- {err}"
    st, _ = _wait_state(base_addr, "SELECTING", timeout=2.0)   # the "On <target>" prompt
    if st != "SELECTING":
        _abort_to_ready(base_addr)
        return f"{label}: key selected but the 'On <target>' prompt didn't appear (state={st})."
    inp.send_key(keys[0] if keys else "enter")                 # the door direction (auto-commits)
    state, _ = _drain_to_ready(base_addr)
    nframe = _obj_tfq(base_addr, slot)[1]
    verdict = f"unlocked (frame {nframe})" if nframe < 8 else f"still locked (frame {nframe})"
    return f"{label}: used key 0x{key:03x} on the door -> {verdict}; now {state}."


def _use_map(base_addr, keys, self_use, on, label):
    """Map-tile USE: a plain USE on the target tile -- EXCEPT a LOCKED door, where the
    tool auto-runs the key flow (find the matching owned key, drive U->key->door)."""
    try:
        tx, ty, tz = _target_tile(base_addr, keys)
        door = _door_at_tile(base_addr, tx, ty, tz)
    except OSError:
        door = None
    if door and door[2] in _DOOR_LOCKED:
        return _use_key_flow(base_addr, keys, door, label)
    err = _begin_select(base_addr, "u", label)
    if err:
        return err
    _walk_cursor(keys, self_use)                               # commit on the target tile
    state, msgs = _drain_to_ready(base_addr)
    note = ""
    try:
        tx, ty, tz = _target_tile(base_addr, keys)
        items = _use_result_at_tile(base_addr, tx, ty, tz)
        note = (f" Now at ({tx},{ty}): " + "; ".join(items) + "."
                if items else f" No notable objects at ({tx},{ty}).")
    except OSError:
        note = ""
    return f"{label}: committed; cleared {msgs} message(s); now {state}.{note}"


def _use_inventory(base_addr, slot, on):
    """USE a CARRIED item (`slot` from u6_inventory / u6_panel_state): drive the panel
    select, then supply any second SEMANTIC input the item needs from `on` (potion ->
    member, orb -> where, pick/shovel/telescope -> direction, instrument -> digit tune);
    single-use items (food/drink/torch/gem/...) just drain. If a needed `on` is missing
    it ESC-aborts (no turn) and asks -- it never guesses."""
    try:
        ai = _controlled_slot(base_addr)[1]
        typ, frame, _q = _obj_tfq(base_addr, slot)
        name = _obj_name(base_addr, slot)
    except OSError as ex:
        return f"use inv 0x{slot:03x}: read failed ({ex})."
    label = f"use {name} (0x{slot:03x})"
    ok, err = _select_backpack_item(base_addr, ai, slot)
    if not ok:
        return f"{label}: {err}"
    second = ""
    if typ == _USE_POTION:
        m = _resolve_member(base_addr, on)
        if not m:
            _abort_to_ready(base_addr)
            return f"{label}: a potion needs a target -- re-call with on=<member 1..8 or name>."
        inp.send_key(m); second = f" on member {m}"
    elif typ == _USE_ORB:
        a = _U6_DIR.get(on)
        if not a:
            _abort_to_ready(base_addr)
            return f"{label}: the orb needs a destination -- re-call with on=<n/s/e/w>."
        inp.send_key(a); second = f" where={on}"
    elif typ in _USE_DIR:
        a = _U6_DIR.get(on)
        if not a:
            _abort_to_ready(base_addr)
            return f"{label}: needs a direction -- re-call with on=<n/s/e/w>."
        inp.send_key(a); second = f" dir={on}"
    elif typ in _USE_INSTRUMENT:
        for ch in on:
            if ch.isdigit():
                inp.send_key(ch); time.sleep(_CURSOR_STEP)
        inp.send_key("enter"); second = f" tune={on!r}"
    state, _ = _drain_to_ready(base_addr)
    ntyp, nframe, _nq = _obj_tfq(base_addr, slot)
    res = ("consumed" if ntyp == 0 else
           f"frame {frame}->{nframe}" if nframe != frame else "used")
    return f"{label}{second}: {res}; now {state}."


@mcp.tool()
def u6_use(target: str, on: str = "") -> str:
    """Ultima VI: USE an object. `target` is EITHER a MAP tile -- a cardinal direction
    (n/s/e/w) or `here`/`self` for the tile you stand on (ladders) -- OR a CARRIED item
    by object slot: `inv:0x305` / `inv:773` / `0x305` / `773` (get the slot from
    u6_inventory / u6_panel_state). The tool absorbs the keyboard mechanism; the agent
    supplies a SEMANTIC choice via `on=` only when an item needs one:
      * a LOCKED door (map target): NO `on` -- the tool auto-finds the matching owned
        key (OBJ_040, qual match; or a lockpick on a qual-0 lock) and drives
        U->key->door, so the door 'just opens' (or it reports no matching key).
      * a potion: on=<member 1..8 or name>.  * the orb: on=<n/s/e/w> ('where').
      * pick/shovel/telescope: on=<n/s/e/w>.  * an instrument: on=<digits 0-9> (tune).
    Single-use items (food/drink/torch/gem/book) and unlocked map objects need no `on`.
    If a required `on` is missing the tool ESC-aborts (no turn spent) and asks -- it
    never guesses. The inventory route drives the status panel (F<member> -> INVENTORY
    view, <tab> -> panel cursor, Enter -> commit), each step confirmed by a memory read
    (the agent can't see the screen). The return reports the resulting STATE (door
    open/closed/locked, item consumed / frame change). Sources: dispatch seg_0A33.c:1115,
    handler C_27A1_6179, key C_27A1_2D8E:1410, panel C_155D_1267. Turn-gated."""
    t = target.strip().lower()
    b = _session_base()
    slot = _parse_slot(t)
    if slot is not None:                              # carried-item USE (the panel route)
        if b is None:
            return f"use inv 0x{slot:03x}: not hooked (inventory USE needs the panel state)."
        return _use_inventory(b, slot, on.strip())
    self_use = t in ("here", "self", "@")             # map-tile USE
    arrow = None if self_use else _U6_DIR.get(t)
    if not self_use and not arrow:
        return (f"Invalid USE target {target!r}. Use a map tile (n/s/e/w or here/self) "
                f"or a carried item (inv:<slot> / 0x... / a slot number).")
    keys = [] if self_use else [arrow]
    if b is None:                                     # not hooked: best-effort blind
        return _blind_cursor_cmd(f"use {t}", "u", keys, self_use)
    return _use_map(b, keys, self_use, on.strip(), f"use {t}")


@mcp.tool()
def u6_ready(target: str) -> str:
    """Ultima VI: READY (equip) a carried item, or UNREADY (take off) an equipped one
    -- the inventory-panel toggle. Ready is NOT a letter command (R is Rest); it's the
    panel interaction the manual describes: <tab> to the panel, move to the item, <enter>
    to ready/unready. `target` = an object slot (`inv:0x305` / `0x305` / `773`, from
    u6_inventory / u6_panel_state). The tool reads the item's holder + current state and
    figures out the rest: which party member's panel to open, and whether to READY
    (INVEN->EQUIP, a backpack item) or UNREADY (EQUIP->INVEN, an equipped item). It then
    drives the panel (F<member> -> INVENTORY, <tab> -> cursor, place on the item's cell,
    <enter> -> C_155D_144B Ready / C_155D_1738 Unready), each step confirmed by a memory
    read, and leaves the panel. Result = the item's CoordUse flip. A READY can be refused
    by the engine (no equip slot / too heavy > STR*10 / that slot occupied -- printed to
    the scroll the agent can't see); the tool detects the no-flip and says so, and the
    agent can diagnose via u6_object (equip-slot), u6_roster_status (STR*10 cap), and
    u6_panel_state (which slots are occupied). Ready is a free action (no turn). DS from
    u6_hook."""
    b = _session_base()
    if b is None:
        return "ready: not hooked (panel state needed)."
    slot = _parse_slot(target.strip().lower())
    if slot is None:
        return (f"Invalid ready target {target!r}. Give an object slot "
                f"(inv:<slot> / 0x.. / a number) from u6_inventory / u6_panel_state.")
    try:
        cu = _rd8(b + U6_ObjStatus + slot) & 0x18
        assoc = _rd16(b + U6_ObjPos + slot * 3)           # INVEN/EQUIP: first 2 bytes = holder slot
        name = _obj_name(b, slot)
    except OSError as ex:
        return f"ready 0x{slot:03x}: read failed ({ex})."
    if cu not in (0x10, 0x18):
        return (f"ready {name} (0x{slot:03x}): not in a member's inventory "
                f"(CoordUse=0x{cu:02x}) -- only a carried or worn item can be readied.")
    mi = _holder_party_index(b, assoc)
    if mi < 0:
        return f"ready {name} (0x{slot:03x}): its holder (slot 0x{assoc:03x}) isn't a party member."

    if cu == 0x10:                                         # INVEN -> READY (equip)
        def locate():
            pack = _visible_backpack(b)
            if slot not in pack:
                return None
            r, c = divmod(pack.index(slot), U6_BACKPACK_COLS)
            return (c + 3, r)
        equipped = lambda: (_rd8(b + U6_ObjStatus + slot) & 0x18) == 0x18
        ok, err = _panel_commit(b, mi, None, locate, equipped)
        _abort_to_ready(b)                                 # Ready stays in the panel -> ESC out
        if equipped():
            return f"ready {name} (0x{slot:03x}): equipped (INVEN -> EQUIP) on member {mi + 1}."
        return (f"ready {name} (0x{slot:03x}): NOT equipped -- {err}. If the panel drove OK, "
                f"the engine refused (no equip slot / too heavy / that slot occupied); check "
                f"u6_object equip-slot, u6_roster_status STR*10 cap, u6_panel_state free slot.")

    # EQUIP -> UNREADY (take off)
    def locate():
        equip = dm.read(S.handle, b + U6_Equipment, 8 * 2)
        for s in range(8):
            if (equip[s * 2] | (equip[s * 2 + 1] << 8)) == slot:
                return _EQUIP_CELL[s]
        return None
    stowed = lambda: (_rd8(b + U6_ObjStatus + slot) & 0x18) == 0x10
    ok, err = _panel_commit(b, mi, None, locate, stowed)
    _abort_to_ready(b)
    if stowed():
        return f"unready {name} (0x{slot:03x}): taken off (EQUIP -> INVEN) on member {mi + 1}."
    return (f"unready {name} (0x{slot:03x}): NOT removed -- {err} "
            f"(a cursed/locked item can't be unreadied).")


def _advance_conv_input(base_addr, max_pages=8):
    """Clear any '*' page-pause(s) blocking the keyword prompt so a typed reply's
    leading char isn't eaten advancing a page. Sends ENTER only WHILE a page-pause is
    showing (PromptCh==1); stops the instant CON_gets is live (D_049B==1) and NEVER
    sends a key once D_049B==1 (that would submit an empty line / exit). Also returns
    early on a non-paused single-key prompt (PromptCh!=1, D_049B!=1 -- nothing to
    clear). Returns the number of pages advanced."""
    pages = 0
    for _ in range(max_pages):
        if _rd8(base_addr + U6_LineInput) == 1:        # keyword line input is live
            break
        if _rd16(base_addr + U6_PromptCh) != 1:        # no page-pause -> nothing to clear
            break
        inp.send_key("enter")                          # dismiss this page
        pages += 1
        time.sleep(_PAGE_ADVANCE_SETTLE)
    return pages


@mcp.tool()
def u6_say(text: str, segment: int = -1) -> str:
    """Ultima VI: answer the current conversation prompt. First advances past any '*'
    page-pause so the leading char isn't eaten dismissing a page (a long greeting/
    reply pauses for a keypress -- see _advance_conv_input), then peeks the
    converse-VM opcode at Talk_PC: at a single-key prompt (GET/GETCHR/GETDIGIT/WAIT)
    it sends just the first character; otherwise (ASKTOP/GETSTR/GETINT) it types
    `text` + Enter. Falls back to line input if the VM state can't be read. DS from
    u6_hook."""
    single, pages = False, 0
    if S.membase is not None:
        ds, err = _ds(segment)
        if not err:
            base_addr = S.membase + (ds << 4)
            try:
                if dm.read(S.handle, base_addr + U6_IsInConversation, 1)[0]:
                    pages = _advance_conv_input(base_addr)   # clear page-pauses first
                pc = int.from_bytes(dm.read(S.handle, base_addr + U6_Talk_PC, 2), "little")
                fp = dm.read(S.handle, base_addr + U6_TalkBuf_ptr, 4)
                tb_lin = ((fp[2] | (fp[3] << 8)) << 4) + (fp[0] | (fp[1] << 8))
                op = dm.read(S.handle, S.membase + tb_lin + pc, 1)[0]
                single = op in _TALK_SINGLEKEY_OPS
            except OSError:
                pass
    adv = f" (advanced {pages} page-pause(s))" if pages else ""
    if single:
        ch = text[:1]
        return f"[single-key]{adv} {inp.send_key(ch if ch else 'enter')}"
    out = inp.send_text(text)
    ent = inp.send_key("enter")
    return f"[line]{adv} {out} [{ent}]"


@mcp.tool()
def u6_key(key: str) -> str:
    """Ultima VI: send one keypress (for single-key conversation prompts, menus,
    or any raw key). `key` = a single char or a name (enter/esc/space/up/...)."""
    return inp.send_key(key)


# ----------------------------------------------------------------------------
# Navigation helpers -- build the walkable + cost grid from terrain + static
# objects, 4-connected weighted Dijkstra to adjacency. All read from u6_hook DS.
# ----------------------------------------------------------------------------
def _read_far_ptr(base_addr, ds_off):
    """Resolve a Borland far pointer stored at DS:ds_off to a host linear addr."""
    fp = dm.read(S.handle, base_addr + ds_off, 4)
    off = fp[0] | (fp[1] << 8)
    seg = fp[2] | (fp[3] << 8)
    return S.membase + (seg << 4) + off


def _static_table(base_addr, ds_off, nbytes, name, far=True):
    """Read a STATIC table once and cache it. `far=True` (default) resolves a
    DGROUP far pointer at ds_off (TerrainType / TileFlag / D_B3EF / BaseTile /
    TypeWeight); `far=False` reads a table stored directly in DGROUP at ds_off
    (e.g. the D_07DD weapon-tile list). All are game data loaded at boot that
    doesn't change during play, so re-reading per call is pure waste. The read is
    LAZY (first use, not session start); the cache is keyed to base_addr (= MemBase
    + DS<<4), so a DOSBox restart or different-avatar re-hook -- which rebases the
    segment -- transparently flushes it. (Game data is identical across saves in
    one process, so reuse is safe.)"""
    if S.static_key != base_addr:
        S.static_cache.clear()
        S.static_key = base_addr
    table = S.static_cache.get(name)
    if table is None:
        addr = _read_far_ptr(base_addr, ds_off) if far else base_addr + ds_off
        table = dm.read(S.handle, addr, nbytes)
        S.static_cache[name] = table
    return table


def _equip_slot(tile, weapon_tiles):
    """Port of STAT_GetEquipSlot (seg_155D.c:129): given an object's TILE id
    (BaseTile[type] + frame), return its equip slot 0..9 (see _EQUIP_SLOT_NAME) or
    -1 if it can't be readied. Checks run in SOURCE ORDER -- first match wins -- so
    the 0x219 overlap correctly resolves to NECK (tested before CHST). weapon_tiles
    is the D_07DD right-hand-weapon tile set."""
    s = tile
    if s in (0x21A, 0x21B):                                       return 7   # FEET
    if s == 0x258 or 0x37D <= s <= 0x37F:                         return 9   # RING
    if s in (0x219, 0x217, 0x101) or 0x250 <= s <= 0x252:         return 1   # NECK
    if 0x200 <= s <= 0x207:                                       return 0   # HEAD
    if (0x210 <= s <= 0x216) or s in (0x218, 0x219, 0x28C, 0x28E, 0x29D, 0x257):
        return 4                                                             # CHST
    if s in (0x228, 0x229, 0x231, 0x235) or 0x22B <= s <= 0x22E:  return 8   # 2HND
    if (0x208 <= s <= 0x20F) or s == 0x222:                       return 5   # LHND
    if s in weapon_tiles:                                         return 2   # RHND
    return -1


def _gear_tables(base_addr):
    """(BaseTile, TypeWeight, weapon-tile set) from the lazy static cache. BaseTile
    maps object type -> base tile; TypeWeight maps type -> weight (comparable to the
    STR*N caps); the weapon set is D_07DD (RHND tiles for the equip-slot decode)."""
    basetile = _static_table(base_addr, U6_BaseTile_ptr, _BASETILE_N * 2, "basetile")
    tw = _static_table(base_addr, U6_TypeWeight_ptr, _BASETILE_N, "typeweight")
    raw = _static_table(base_addr, U6_EquipWeaponTbl, 33 * 2, "d07dd", far=False)
    weapons = frozenset((raw[i * 2] | (raw[i * 2 + 1] << 8)) for i in range(33))
    return basetile, tw, weapons


def _gear_of(sh, basetile, tw, weapons):
    """For a packed ObjShapeType `sh` -> (tile, weight, equip_slot). equip_slot is
    -1 (not readyable) or 0..9. tile = BaseTile[type] + frame."""
    typ = sh & 0x3ff
    if typ >= _BASETILE_N:
        return -1, 0, -1
    tile = (basetile[typ * 2] | (basetile[typ * 2 + 1] << 8)) + (sh >> 10)
    wt = tw[typ] if typ < len(tw) else 0
    eslot = _equip_slot(tile, weapons) if 0 <= tile < 0x800 else -1
    return tile, wt, eslot


def _obj_name(base_addr, slot):
    """LOOK.LZD name for an object slot (tile = BaseTile[type]+frame, via _gear_of)."""
    sh = int.from_bytes(dm.read(S.handle, base_addr + U6_ObjShapeType + slot * 2, 2), "little")
    basetile, tw, weapons = _gear_tables(base_addr)
    tile, _wt, _es = _gear_of(sh, basetile, tw, weapons)
    return _tile_name(tile)


def _controlled_slot(base_addr):
    """The object slot the player currently DRIVES = Party[Active] (seg_0A33.c
    SetActive). In party mode Active==0 (the avatar); in solo mode it's the
    detached member; if Active==PartySize the party is aboard a vehicle and
    Party[Active] is the vehicle slot. This is the mover the engine's move gate
    excludes from blocking (C_1E0F_000F: `if(i==objNum) continue`), so it -- not a
    hardcoded slot 1 -- is the reference for all navigation. Returns (slot,
    party_index, in_vehicle)."""
    active = dm.read(S.handle, base_addr + U6_Active, 1)[0]
    psize  = dm.read(S.handle, base_addr + U6_PartySize, 1)[0]
    idx = active if active <= 16 else 0
    slot = dm.read(S.handle, base_addr + U6_Party + idx, 1)[0]
    return slot, active, (active == psize)


def _controlled_xyz(base_addr):
    """(x, y, z) of the actor the player currently drives (Party[Active]). The
    local area window + map level are centred on this actor, so it is the correct
    origin for the walkable grid and pathfinding -- in party mode it's the avatar,
    in solo mode the detached member."""
    slot, _idx, _veh = _controlled_slot(base_addr)
    pos = dm.read(S.handle, base_addr + U6_ObjPos + slot * 3, 3)
    v = pos[0] | (pos[1] << 8) | (pos[2] << 16)
    return v & 0x3ff, (v >> 10) & 0x3ff, (v >> 20) & 0xf


def _session_base():
    """base_addr from the session's derived DS, or None if not hooked. Lets the
    no-segment action verbs gate their keystrokes on turn-readiness when possible."""
    if S.membase is None or S.u6_ds is None:
        return None
    return S.membase + (S.u6_ds << 4)


def _input_state(base_addr):
    """Classify what input the engine will accept right now (turn/input context).
    Returns (state, flags). state is one of:
      CONVERSATION  -- a talk is active; answer with u6_say
      COMMAND_READY -- parked at the top-level prompt; your turn (send a move/command)
      SELECTING     -- a command is awaiting a target/direction; supply it
      MOUSE_MODE    -- mouse UI mode; keyboard play wants this off
      BUSY          -- processing the turn / animating; wait
    Priority matters: AllowMouseMov==1 fires only at the top-level getch, so it
    cleanly dominates SELECTING/BUSY (which run with it 0)."""
    conv  = dm.read(S.handle, base_addr + U6_IsInConversation, 1)[0]
    amm   = int.from_bytes(dm.read(S.handle, base_addr + U6_AllowMouseMov, 2), "little")
    sel   = dm.read(S.handle, base_addr + U6_SelectMode, 1)[0]
    mouse = int.from_bytes(dm.read(S.handle, base_addr + U6_MouseMode, 2), "little")
    flags = {"IsInConversation": conv, "AllowMouseMov": amm,
             "SelectMode": sel, "MouseMode": mouse}
    if conv:
        state = "CONVERSATION"
    elif amm == 1:
        state = "COMMAND_READY"
    elif sel:
        state = "SELECTING"
    elif mouse:
        state = "MOUSE_MODE"
    else:
        state = "BUSY"
    return state, flags


def _wait_command_ready(base_addr, timeout=3.0, poll=0.03):
    """Block until the engine is at the top-level command prompt (COMMAND_READY) so
    a keystroke lands as a fresh command. Returns (state, flags): COMMAND_READY on
    success, or the last-seen state on timeout (caller can proceed best-effort)."""
    deadline = time.time() + timeout
    state, flags = _input_state(base_addr)
    while state != "COMMAND_READY" and time.time() < deadline:
        time.sleep(poll)
        state, flags = _input_state(base_addr)
    return state, flags


def _wait_state(base_addr, targets, timeout=2.5, poll=0.03):
    """Block until _input_state is one of `targets` (a str or an iterable of states),
    else return the last-seen (state, flags) on timeout. Lets a cursor-command verb
    wait for the cross-cursor to come up (SELECTING) or for a talk to land
    (CONVERSATION) before it sends the next keystroke."""
    if isinstance(targets, str):
        targets = (targets,)
    deadline = time.time() + timeout
    state, flags = _input_state(base_addr)
    while state not in targets and time.time() < deadline:
        time.sleep(poll)
        state, flags = _input_state(base_addr)
    return state, flags


# Seconds to let DOSBox fully process a keystroke and finish redrawing before we read
# the input state again. The NPC-look portrait/inventory redraw (seg_27a1.c:231-258) is
# throttled (DOSBox ~3000 cycles) and runs with MouseMode=1; read too early, that redraw
# looks like another page and the drain over-fires one key into the command prompt -> a
# stray command ('>What?' / 'Not possible'). 0.5s clears the race; bump to 1.0 if a
# slower box still races.
_DRAIN_SETTLE = 0.5


def _drain_to_ready(base_addr, key="enter", cap=40, settle=_DRAIN_SETTLE):
    """Dismiss whatever result/page waits a look/get/talk left behind, until the engine
    is back at the top-level command prompt (COMMAND_READY) -- count-free, by state.

    Every read is taken AFTER a `settle` pause, so it reflects the engine's RESTING state
    rather than a mid-redraw transient -- and a transient (the processing/redraw between
    the handler returning and the prompt coming back) has resolved to COMMAND_READY by
    read time. So ANY non-COMMAND_READY state we still see after settling is a genuine
    "press a key to continue" wait and gets an Enter. Those waits come in two flavors:
      - MOUSE_MODE: the NPC-look portrait/inventory getch, run while the dispatch's
        MouseMode=1 (seg_0A33.c:1248) is still set (seg_27a1.c:258).
      - BUSY (all flags 0): a container / empty-corpse look's down-arrow prompt, e.g.
        the "Searching here, you find nothing." page (seg_27a1.c:507-509).
    COMMAND_READY (AllowMouseMov=1, raised ONLY at the top-level getch, seg_0A33.c:1029)
    is the exact, count-free end signal -- a 2-item and a 20-item container end there
    alike. A stray re-entered command (SELECTING) is cancelled with ESC x2 rather than
    committed. `cap` bounds total iterations. If a slower box still over-fires, raise
    _DRAIN_SETTLE (0.5 -> 1.0)."""
    sent = 0
    time.sleep(settle)                          # let the just-committed result finish drawing
    for _ in range(cap):
        state, _ = _input_state(base_addr)
        if state == "COMMAND_READY":
            break
        if state == "SELECTING":                # a command got re-entered -> cancel it
            inp.send_key("esc"); time.sleep(0.12)
            inp.send_key("esc")
        else:                                   # MOUSE_MODE or BUSY: a real dismiss wait
            inp.send_key(key)
            sent += 1
        time.sleep(settle)                      # so the next read is of the RESTING state
    state, _ = _input_state(base_addr)
    return state, sent


# Per-arrow tile delta (dx, dy): up=north=-y, down=+y, left=-x, right=+x. Maps a look
# direction (its _U6_DIR8 arrow list) to the tile the cross-cursor lands on, so the verb
# can re-read object state there -- the agent reads state, never the scroll.
_ARROW_DXY = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}


def _target_tile(base_addr, keys):
    """The world tile the cursor lands on for a cursor command whose walk is `keys`
    (an _U6_DIR8/_U6_DIR arrow list; an empty list = the controlled actor's own tile).
    Sums the per-arrow deltas onto the controlled actor's position. Shared by the
    LOOK/USE result read-back."""
    x0, y0, z0 = _controlled_xyz(base_addr)
    dx = sum(_ARROW_DXY[k][0] for k in keys)
    dy = sum(_ARROW_DXY[k][1] for k in keys)
    return x0 + dx, y0 + dy, z0


def _notable_at_tile(base_addr, tx, ty, tz, cap=12):
    """World objects (LOCXYZ, slot >= 0x100) on tile (tx,ty,tz) that the agent would ACT
    on -- weight>0 (carryable) OR readyable (has an equip slot). Floor/scenery (weight 0,
    not readyable) is dropped: the agent has u6_walkable for terrain and never decides on
    floor type. Returns decoded (slot, name, type, weight, eslot) tuples (name from the
    LOOK.LZD table via _tile_name), capped at `cap`. This is the perception path for a
    LOOK/search result -- LOOK surfaces hidden/contained items to LOCXYZ, and reading
    that change here is how the agent 'sees' the loot (the 'you find a ...' scroll text
    is invisible to it)."""
    status = dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS)
    pos = dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3)
    shape = dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    basetile, tw, weapons = _gear_tables(base_addr)
    out = []
    for i in range(0x100, U6_MAX_SLOTS):
        if (status[i] & 0x18) != 0:                  # not LOCXYZ (held/contained/equipped)
            continue
        sh = shape[i * 2] | (shape[i * 2 + 1] << 8)
        typ = sh & 0x3ff
        if typ == 0:                                 # empty slot
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        if (v & 0x3ff) != tx or ((v >> 10) & 0x3ff) != ty or ((v >> 20) & 0xf) != tz:
            continue
        tile, wt, eslot = _gear_of(sh, basetile, tw, weapons)
        if wt <= 0 and eslot < 0:                     # floor/scenery -> not actionable
            continue
        out.append((i, _tile_name(tile), typ, wt, eslot))  # name via LOOK.LZD table
        if len(out) >= cap:
            break
    return out


# USE targets whose result is a frame-encoded open/closed/locked STATE the agent must
# read back (it can't see the "opened!"/"locked" scroll). Door types 0x129-0x12C share
# one frame band; the chest (0x062) has its own. A locked one only opens with a key
# (OBJ_040) whose qual matches the lock-id GetQual(target) -- a plain Use just reports
# "locked" (engine never auto-finds the key, seg_27a1.c:1410).
_U6_DOOR_TYPES = frozenset((0x129, 0x12a, 0x12b, 0x12c))
_U6_CHEST_TYPE = 0x062


def _door_state(frame):
    """Door frame band -> (state, locked) per C_27A1_2A44 (seg_27a1.c:1285-1322):
    0-3 open, 4-7 closed (unlocked), 8-0xB locked (key, qual-match), 0xC-0xF magically
    locked."""
    if frame < 4:   return "open", False
    if frame < 8:   return "closed", False
    if frame < 0xc: return "locked", True
    return "magically locked", True


def _chest_state(frame):
    """Chest frame -> (state, locked) per C_27A1_2BBC (seg_27a1.c:1331-1373): 0 open,
    1 closed (unlocked), 2 locked (key, qual-match), 3 magically locked."""
    return (("open", False), ("closed", False),
            ("locked", True), ("magically locked", True))[frame & 3]


def _use_result_at_tile(base_addr, tx, ty, tz, cap=12):
    """LOCXYZ objects on tile (tx,ty,tz) after a USE, reported as the STATE the agent
    needs to read back -- it can't see the "opened!"/"locked" scroll. Doors
    (0x129-0x12C) and chests (0x062) always report their open/closed/locked frame state
    (and, when locked with a nonzero qual, the lock-id a matching key OBJ_040 must
    carry); other objects report only if actionable (weight>0 or readyable), so floor /
    scenery is dropped (u6_walkable covers terrain). Returns human strings, capped at
    `cap`."""
    status = dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS)
    pos    = dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3)
    shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    amount = dm.read(S.handle, base_addr + U6_Amount, U6_MAX_SLOTS * 2)
    basetile, tw, weapons = _gear_tables(base_addr)
    out = []
    for i in range(0x100, U6_MAX_SLOTS):
        if (status[i] & 0x18) != 0:                  # not LOCXYZ (held/contained/equipped)
            continue
        sh = shape[i * 2] | (shape[i * 2 + 1] << 8)
        typ = sh & 0x3ff
        if typ == 0:                                 # empty slot
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        if (v & 0x3ff) != tx or ((v >> 10) & 0x3ff) != ty or ((v >> 20) & 0xf) != tz:
            continue
        frame = sh >> 10
        qual = amount[i * 2 + 1]                      # high byte of Amount = qual (lock-id)
        tile, wt, eslot = _gear_of(sh, basetile, tw, weapons)
        name = _tile_name(tile)
        if typ in _U6_DOOR_TYPES or typ == _U6_CHEST_TYPE:
            kind = "door" if typ in _U6_DOOR_TYPES else "chest"
            state, locked = (_door_state if kind == "door" else _chest_state)(frame)
            extra = f", key qual={qual}" if (locked and qual) else ""
            out.append(f"{name} (0x{i:03x} {kind}: {state}{extra})")
        elif wt > 0 or eslot >= 0:                    # actionable item (else floor/scenery)
            out.append(f"{name} (0x{i:03x} type{typ} frame{frame})")
        if len(out) >= cap:
            break
    return out


def _world_to_cell(x, y, ax, ay):
    c = (x - ax) & U6_WORLD_MASK
    r = (y - ay) & U6_WORLD_MASK
    return (r, c) if (c < U6_AREA_W and r < U6_AREA_H) else None


def _compass(dx, dy):
    ns = "N" if dy < 0 else ("S" if dy > 0 else "")
    ew = "E" if dx > 0 else ("W" if dx < 0 else "")
    return (ns + ew) or "@"


def _dir_to(dx, dy):
    if dx == 1:
        return "e"
    if dx == -1:
        return "w"
    return "s" if dy == 1 else "n"


def _build_grid(base_addr):
    """Faithful per-step passability for the LAND-WALKING avatar, ported from the
    engine's move-legality gate C_1E0F_000F (seg_1E0F.c:66). Returns (walk[H][W]
    bool, cost[H][W] int, AreaX, AreaY); for a cardinal step the destination cell's
    walk flag IS the engine verdict.

    On foot the avatar is a plain land-walker (bp_10=1; flies/swims/raft/ethereal
    all 0), so the gate collapses to: ground passable (TerrainType & IMPASS == 0)
    AND no object on the cell whose tile is impassable -- with the two refinements
    the previous own-cell-only version skipped:

      * Multi-tile objects spread their block. A DoubleH object (TileFlag & 0x80)
        also covers the cell to its WEST reading tile-1; DoubleV (0x40) the cell to
        its NORTH; a 2x2 (both) the W/N/NW cells reading tile-1/-2/-3. This mirrors
        the engine both ways: __ComputeResistance's forward spread (seg_1E0F.c:1907)
        and FindLoc's anchor-from-the-NW enumeration (seg_1184.c:240).
      * Breakthrough tiles (D_B3EF & Br) make a cell enterable even over impassable
        terrain (bridges); they win over an impassable object on the same cell. An
        Ignore tile (& Ig) leaves the Br non-definitive (seg_1E0F.c:142-145).

    ACTORS (slot < 0x100) are NOT folded in -- the engine blocks on them too, but
    for PLANNING we keep the grid actor-free so a transient NPC doesn't wall off a
    route (u6_goto re-plans each step; the faithful actor block is _actor_cells,
    applied at legality / per-step time). Move cost is the engine's
    `(TerrainType[ground] >> 4) + 1`, so weighted search skirts costly terrain the
    way the game does. Static tables come from the lazy per-process cache."""
    ax = int.from_bytes(dm.read(S.handle, base_addr + U6_AreaX, 2), "little")
    ay = int.from_bytes(dm.read(S.handle, base_addr + U6_AreaY, 2), "little")
    _, _, z0 = _controlled_xyz(base_addr)
    tiles  = dm.read(S.handle, base_addr + U6_AreaTiles, U6_AREA_H * U6_AREA_W)
    status = dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS)
    objpos = dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3)
    shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    terr     = _static_table(base_addr, U6_TerrainType_ptr, _TILEFLAG_N, "terr")
    tflag1   = _static_table(base_addr, U6_TileFlag_ptr,    _TILEFLAG_N, "tflag1")
    tflag2   = _static_table(base_addr, U6_TileFlag2_ptr,   _TILEFLAG_N, "tflag2")
    basetile = _static_table(base_addr, U6_BaseTile_ptr,    _BASETILE_N * 2, "basetile")

    def terr_of(tile):
        return terr[tile] if 0 <= tile < len(terr) else 0

    # Ground terrain: per-cell move cost + impassability.
    walk = [[True] * U6_AREA_W for _ in range(U6_AREA_H)]
    cost = [[1] * U6_AREA_W for _ in range(U6_AREA_H)]
    brk  = [[False] * U6_AREA_W for _ in range(U6_AREA_H)]   # a Br tile locked the cell open
    for r in range(U6_AREA_H):
        for c in range(U6_AREA_W):
            gf = terr_of(tiles[r * U6_AREA_W + c])
            cost[r][c] = (gf >> 4) + 1                       # engine move cost: forest/swamp > road
            if gf & TERRAIN_IMPASS:
                walk[r][c] = False

    # Apply one object-tile to one cell, land-walker rules (C_1E0F_000F :142-164).
    def apply(r, c, qtile):
        if not (0 <= r < U6_AREA_H and 0 <= c < U6_AREA_W):
            return
        if not (0 <= qtile < _TILEFLAG_N):
            return
        if tflag2[qtile] & TILE2_BREAKTHROUGH:              # bridge etc.: enterable
            walk[r][c] = True
            if not (tflag2[qtile] & TILE2_IGNORE):
                brk[r][c] = True                            # definitive open; later impass can't re-block
        elif (terr_of(qtile) & TERRAIN_IMPASS) and not brk[r][c]:
            walk[r][c] = False

    # Map objects: one pass over the world-object slots (engine SearchArea loop).
    # Skip NPCs (< 0x100), empty slots, anything not loose on the map (CoordUse !=
    # LOCXYZ), or off-level. Place each by its OWN world position, then spread its
    # multi-tile extent to the W/N/NW neighbour cells.
    for slot in range(0x100, U6_MAX_SLOTS):
        sh = shape[slot * 2] | (shape[slot * 2 + 1] << 8)
        if sh == 0:                                         # empty slot
            continue
        if status[slot] & 0x18:                             # not LOCXYZ (held/contained/equipped)
            continue
        typ = sh & 0x3ff
        if typ >= _BASETILE_N:
            continue
        p = objpos[slot * 3] | (objpos[slot * 3 + 1] << 8) | (objpos[slot * 3 + 2] << 16)
        if ((p >> 20) & 0xf) != z0:                         # different map level
            continue
        cell = _world_to_cell(p & 0x3ff, (p >> 10) & 0x3ff, ax, ay)
        if cell is None:
            continue
        r, c = cell
        tile = (basetile[typ * 2] | (basetile[typ * 2 + 1] << 8)) + (sh >> 10)
        fl = tflag1[tile] if 0 <= tile < len(tflag1) else 0
        apply(r, c, tile)                                   # own (anchor) cell
        if fl & TILE_DOUBLE_H:                              # also covers WEST
            apply(r, c - 1, tile - 1)
            if fl & TILE_DOUBLE_V:                          # 2x2: also N + NW
                apply(r - 1, c, tile - 2)
                apply(r - 1, c - 1, tile - 3)
        elif fl & TILE_DOUBLE_V:                            # also covers NORTH
            apply(r - 1, c, tile - 1)
    return walk, cost, ax, ay


def _actor_cells(base_addr, z0, ax, ay, self_slot=1):
    """Cells blocked by an ACTOR -- the dynamic half of C_1E0F_000F's legality
    (seg_1E0F.c:213): every in-world actor (slot 1..0xFF, LOCXYZ, same level)
    blocks the mover EXCEPT the walk-through field/effect types and the mover
    ITSELF (`self_slot` -- the controlled member, which the engine skips via
    `if(i==objNum) continue`). In solo mode self_slot is the detached member, so
    the avatar then correctly shows as a blocking actor. Returns a set of (r, c)
    in the local window. Kept separate from _build_grid so the planner can route
    optimistically through a transient NPC (and re-plan), while per-step legality
    still honours it."""
    status = dm.read(S.handle, base_addr + U6_ObjStatus, 0x100)
    pos    = dm.read(S.handle, base_addr + U6_ObjPos, 0x100 * 3)
    shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, 0x100 * 2)
    cells = set()
    for i in range(0x100):
        if i == self_slot or (status[i] & 0x18) != 0:       # the mover / not in world
            continue
        typ = (shape[i * 2] | (shape[i * 2 + 1] << 8)) & 0x3ff
        if typ == 0 or typ in _PASSABLE_ACTOR_TYPES:
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        if ((v >> 20) & 0xf) != z0:
            continue
        cell = _world_to_cell(v & 0x3ff, (v >> 10) & 0x3ff, ax, ay)
        if cell:
            cells.add(cell)
    return cells


def _dijkstra(walk, cost, start, goals):
    """4-connected weighted Dijkstra from start to the LOWEST-COST cell in `goals`
    (path cost = sum of entered cells' move cost). Returns a list of (dr,dc)
    steps, [] if already at a goal, or None if unreachable. Weighting is what
    keeps routes on roads/plains instead of cutting through forest/swamp."""
    if start in goals:
        return []
    INF = 1 << 30
    dist = {start: 0}
    prev = {start: None}
    pq = [(0, start)]
    while pq:
        d, cur = heapq.heappop(pq)
        if d > dist.get(cur, INF):
            continue                                     # stale heap entry
        if cur in goals:
            steps, node = [], cur
            while prev[node] is not None:
                parent, mv = prev[node]
                steps.append(mv)
                node = parent
            steps.reverse()
            return steps
        for dr, dc in _DIR_DELTAS:
            nr, nc = cur[0] + dr, cur[1] + dc
            if 0 <= nr < U6_AREA_H and 0 <= nc < U6_AREA_W and walk[nr][nc]:
                nd = d + cost[nr][nc]
                if nd < dist.get((nr, nc), INF):
                    dist[(nr, nc)] = nd
                    prev[(nr, nc)] = (cur, (dr, dc))
                    heapq.heappush(pq, (nd, (nr, nc)))
    return None


def _adjacent_goals(grid, ncell):
    goals = set()
    for dr, dc in _DIR_DELTAS:
        gr, gc = ncell[0] + dr, ncell[1] + dc
        if 0 <= gr < U6_AREA_H and 0 <= gc < U6_AREA_W and grid[gr][gc]:
            goals.add((gr, gc))
    return goals


def _npc_xyz(base_addr, slot):
    """(x, y, z, coorduse) for an object/NPC slot."""
    st = dm.read(S.handle, base_addr + U6_ObjStatus + slot, 1)[0]
    pos = dm.read(S.handle, base_addr + U6_ObjPos + slot * 3, 3)
    v = pos[0] | (pos[1] << 8) | (pos[2] << 16)
    return v & 0x3ff, (v >> 10) & 0x3ff, (v >> 20) & 0xf, st & 0x18


@mcp.tool()
def u6_avatar(segment: int = -1) -> str:
    """Ultima VI: world position (x/y/z) + facing of the actor you currently
    CONTROL -- the closed-loop nav primitive (confirm a move actually happened).
    In PARTY mode that's the avatar (slot 1); in SOLO mode it's the detached
    member you drive (Party[Active]), which is what u6_move actually steers, so
    this tracks the right actor in both. Use u6_party for the full mode/roster.
    DS from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        slot, idx, in_veh = _controlled_slot(base)
        x, y, z = _controlled_xyz(base)
        d = dm.read(S.handle, _read_far_ptr(base, U6_NPCFlag_ptr) + slot, 1)[0] & 7
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    who = "avatar" if slot == 1 else f"party idx {idx}"
    veh = "  [aboard vehicle]" if in_veh else ""
    return f"controlled: slot 0x{slot:x} ({who})  x={x} y={y} z={z}  dir(NPCFlag&7)={d}{veh}"


@mcp.tool()
def u6_party(segment: int = -1) -> str:
    """Ultima VI: party control state -- whether the game is in PARTY mode (the
    whole party marches together, led by the avatar) or SOLO mode (one detached
    member is driven on its own), WHO the player controls right now, and whether
    a fight is on (InCombat). In combat the player's moves are leashed to within
    Chebyshev 8 of the combat centre (TryStraightMove), so this also tells the
    agent when to switch from roaming to attacking ('a') / breaking off.

    Mode is the engine's D_2CC3 (seg_0A33.c SetPartyMode/solo handler): < 0 =>
    PARTY mode (Active forced to 0, the avatar/leader); >= 0 => SOLO mode (the
    value equals Active, the chosen member). Active is the party index the
    keystrokes drive; the controlled object slot is Party[Active] and the map is
    centred on it. Active == PartySize means the party is aboard a vehicle (moved
    as one). The roster is listed with the controlled member marked '*'. DS from
    u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        solo_b = dm.read(S.handle, base + U6_SoloFlag, 1)[0]
        active = dm.read(S.handle, base + U6_Active, 1)[0]
        psize  = dm.read(S.handle, base + U6_PartySize, 1)[0]
        party  = dm.read(S.handle, base + U6_Party, 17)
        names  = dm.read(S.handle, base + U6_Names, (psize + 1) * 14)
        objpos = dm.read(S.handle, base + U6_ObjPos, 0x100 * 3)
        incombat = dm.read(S.handle, base + U6_InCombat, 1)[0]
        enemies  = int.from_bytes(dm.read(S.handle, base + U6_EnemiesNum, 2), "little")
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    if not 0 < psize <= 16:
        return (f"PartySize={psize} out of range -- DS likely wrong or no game "
                f"loaded (DS=0x{ds:04x}). Re-run u6_hook with the avatar name.")
    solo = solo_b - 256 if solo_b >= 128 else solo_b    # D_2CC3 is a signed char
    in_vehicle = (active == psize)
    mode = "SOLO" if solo >= 0 else "PARTY"
    combat = f"COMBAT (enemies={enemies})" if incombat else "no combat"

    def name_of(k):
        raw = names[k * 14:k * 14 + 14]
        return raw.split(b"\x00", 1)[0].decode("latin-1", "replace") or f"<member {k}>"

    def xyz(slot):
        v = objpos[slot * 3] | (objpos[slot * 3 + 1] << 8) | (objpos[slot * 3 + 2] << 16)
        return v & 0x3ff, (v >> 10) & 0x3ff, (v >> 20) & 0xf

    out = [f"Party control: mode={mode}  {combat}  PartySize={psize}  "
           f"Active(idx)={active}" + ("  [aboard vehicle]" if in_vehicle else "")]
    if incombat:
        out.append(f"  In combat: player moves are leashed to Chebyshev <= "
                   f"{COMBAT_LEASH} of the combat centre (TryStraightMove); use 'a' "
                   f"to attack, or break off combat to roam freely.")
    if in_vehicle:
        veh = party[psize] if psize < len(party) else 0
        out.append(f"Controlled now: the whole party is aboard a vehicle "
                   f"(slot 0x{veh:x}) -- moves as one.")
    else:
        cs = party[active]
        cx, cy, cz = xyz(cs)
        tail = "" if solo >= 0 else "  (avatar / leader -- the party follows in formation)"
        out.append(f"Controlled now: party index {active} -> slot 0x{cs:x} "
                   f"{name_of(active)!r} at ({cx},{cy},z{cz}){tail}")
    out.append("   idx  slot    x    y   z  name")
    for k in range(psize):
        slot = party[k]
        x, y, z = xyz(slot)
        mark = "*" if (not in_vehicle and k == active) else " "
        out.append(f" {mark} {k:>3}  0x{slot:02x}  {x:>4} {y:>4} {z:>2}  {name_of(k)}")
    return "\n".join(out)


@mcp.tool()
def u6_input_state(segment: int = -1) -> str:
    """Ultima VI: what input the engine will accept RIGHT NOW -- the turn-readiness
    gate. U6 is turn-based and DOS keyboard input is buffered, so a key sent in the
    wrong context is consumed wrongly, not lost. Poll this before acting. States:
    COMMAND_READY (your turn -- send a move/command), CONVERSATION (answer via
    u6_say), SELECTING (a command awaits a target/direction), MOUSE_MODE (keyboard
    play wants this off), BUSY (turn processing/animating -- wait). Derived from
    AllowMouseMov/IsInConversation/SelectMode/MouseMode (game loop C_0A33_1CB4).
    DS from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        state, flags = _input_state(base)
        slot, idx, _veh = _controlled_slot(base)
        nm = dm.read(S.handle, base + U6_Names + idx * 14, 14).split(b"\x00", 1)[0]
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    who = nm.decode("latin-1", "replace") or f"idx{idx}"
    fl = "  ".join(f"{k}={v}" for k, v in flags.items())
    note = {"COMMAND_READY": "your turn -- send a move/command",
            "CONVERSATION": "in dialogue -- reply with u6_say",
            "SELECTING": "a command is awaiting a target/direction",
            "MOUSE_MODE": "mouse UI mode -- keyboard commands may not land",
            "BUSY": "engine processing the turn -- wait"}[state]
    return f"input_state = {state}  ({note})\n  controlled: {who} (slot 0x{slot:x})\n  {fl}"


@mcp.tool()
def u6_roster_status(segment: int = -1) -> str:
    """Ultima VI: per-member STR/DEX/INT/Level + load (carried & readied vs max) --
    the inputs for deciding who can use/bear which gear. Max carry = STR*20, max
    readied = STR*10 (engine caps). Current load is summed from each member's
    INVEN/EQUIP items by TypeWeight (top-level held items; contents of carried
    containers are not recursed). DS from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        psize  = dm.read(S.handle, base + U6_PartySize, 1)[0]
        party  = dm.read(S.handle, base + U6_Party, 17)
        names  = dm.read(S.handle, base + U6_Names, (psize + 1) * 14)
        stren  = dm.read(S.handle, base + U6_STREN, 0x100)
        dexte  = dm.read(S.handle, base + U6_DEXTE, 0x100)
        intel  = dm.read(S.handle, base + U6_INTEL, 0x100)
        level  = dm.read(S.handle, _read_far_ptr(base, U6_Level_ptr), 0x100)
        status = dm.read(S.handle, base + U6_ObjStatus, U6_MAX_SLOTS)
        objpos = dm.read(S.handle, base + U6_ObjPos, U6_MAX_SLOTS * 3)
        shape  = dm.read(S.handle, base + U6_ObjShapeType, U6_MAX_SLOTS * 2)
        amount = dm.read(S.handle, base + U6_Amount, U6_MAX_SLOTS * 2)
        _bt, tw, _wp = _gear_tables(base)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    if not 0 < psize <= 16:
        return (f"PartySize={psize} out of range -- DS likely wrong or no game "
                f"loaded (DS=0x{ds:04x}).")
    # Current load per holder: INVEN -> carried, EQUIP -> readied.
    carried, readied = {}, {}
    for i in range(0x100, U6_MAX_SLOTS):
        cu = status[i] & 0x18
        if cu not in (0x10, 0x18):
            continue
        holder = objpos[i * 3] | (objpos[i * 3 + 1] << 8)
        typ = (shape[i * 2] | (shape[i * 2 + 1] << 8)) & 0x3ff
        quan = amount[i * 2] or 1
        w = (tw[typ] if typ < len(tw) else 0) * quan
        d = readied if cu == 0x18 else carried
        d[holder] = d.get(holder, 0) + w
    out = [f"Party roster status ({psize} members):",
           "  idx  slot  name           STR DEX INT Lvl   carry(cur/max)  ready(cur/max)"]
    for k in range(psize):
        s = party[k]
        nm = (names[k * 14:k * 14 + 14].split(b"\x00", 1)[0]
              .decode("latin-1", "replace") or f"<{k}>")
        STR = stren[s]
        out.append(f"  {k:>3}  0x{s:02x}  {nm:<13}  {STR:>3} {dexte[s]:>3} {intel[s]:>3} "
                   f"{level[s]:>3}   {carried.get(s, 0):>5}/{STR * CARRY_PER_STR:<5}  "
                   f"{readied.get(s, 0):>4}/{STR * EQUIP_PER_STR:<4}")
    return "\n".join(out)


@mcp.tool()
def u6_npcs_near(radius: int = 12, segment: int = -1) -> str:
    """Ultima VI: NPCs/creatures placed in the world (LOCXYZ) within `radius`
    (Chebyshev) of the CONTROLLED actor (where you are -- the avatar in party
    mode, the active member in solo) on the same level. Reports slot, position,
    compass direction, distance, shape type and name (party members by their
    Names[] name; creatures/NPCs by LOOK.LZD appearance -- rat/guard/...) -- the
    agent's situational awareness for picking a target. DS from u6_hook unless
    overridden."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        self_slot, _idx, _veh = _controlled_slot(base)
        x0, y0, z0 = _controlled_xyz(base)
        psize = dm.read(S.handle, base + U6_PartySize, 1)[0]
        party = dm.read(S.handle, base + U6_Party, 17)
        names = dm.read(S.handle, base + U6_Names, (psize + 1) * 14) if 0 < psize <= 16 else b""
        status = dm.read(S.handle, base + U6_ObjStatus, 0x100)
        pos = dm.read(S.handle, base + U6_ObjPos, 0x100 * 3)
        shape = dm.read(S.handle, base + U6_ObjShapeType, 0x100 * 2)
        basetile, tw, weapons = _gear_tables(base)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    # party object-slot -> roster index, so party members show their Names[] name
    # (GetObjectString's IsPlrControl path, seg_1184.c:1921) rather than a tile appearance.
    party_idx = {party[k]: k for k in range(psize)} if 0 < psize <= 16 else {}
    rows = []
    for i in range(0x100):
        if i == self_slot or (status[i] & 0x18) != 0:   # the controlled actor / not in world
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        x, y, z = v & 0x3ff, (v >> 10) & 0x3ff, (v >> 20) & 0xf
        sh = shape[i * 2] | (shape[i * 2 + 1] << 8)
        typ = sh & 0x3ff
        if typ == 0 or z != z0:                          # empty slot / other level
            continue
        dist = max(abs(x - x0), abs(y - y0))
        if dist > radius:
            continue
        if i in party_idx:                               # party member -> personal name
            k = party_idx[i]
            nm = names[k * 14:(k + 1) * 14].split(b"\x00", 1)[0].decode("latin-1", "replace")
        else:                                            # creature / NPC -> LOOK.LZD appearance
            tile, _w, _e = _gear_of(sh, basetile, tw, weapons)
            nm = _tile_name(tile)
        rows.append((dist, i, x, y, _compass(x - x0, y - y0), typ, nm))
    if not rows:
        return f"No NPCs within {radius} of you ({x0},{y0},z{z0})."
    rows.sort()
    out = [f"NPCs within {radius} of you ({x0},{y0},z{z0}):",
           "  dist  slot     x    y   dir  type  name"]
    for dist, i, x, y, comp, typ, nm in rows:
        out.append(f"  {dist:>4}  0x{i:02x}  {x:>4} {y:>4}  {comp:<3}  {typ:>4}  {nm}")
    return "\n".join(out)


@mcp.tool()
def u6_objects_near(radius: int = 8, max_items: int = 30, segment: int = -1) -> str:
    """Ultima VI: world OBJECTS (slot >= 0x100, placed on the map) within `radius`
    (Chebyshev) of the controlled actor on the same level -- find gear/items to
    Look or Get. Reports slot, position, compass dir, distance, type, weight, and
    the equip slot if readyable. Capped at the nearest `max_items` (any dropped are
    noted). DS from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        x0, y0, z0 = _controlled_xyz(base)
        status = dm.read(S.handle, base + U6_ObjStatus, U6_MAX_SLOTS)
        pos = dm.read(S.handle, base + U6_ObjPos, U6_MAX_SLOTS * 3)
        shape = dm.read(S.handle, base + U6_ObjShapeType, U6_MAX_SLOTS * 2)
        basetile, tw, weapons = _gear_tables(base)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    rows = []
    for i in range(0x100, U6_MAX_SLOTS):
        if (status[i] & 0x18) != 0:                      # only LOCXYZ (loose on the map)
            continue
        sh = shape[i * 2] | (shape[i * 2 + 1] << 8)
        typ = sh & 0x3ff
        if typ == 0:                                     # empty slot
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        x, y, z = v & 0x3ff, (v >> 10) & 0x3ff, (v >> 20) & 0xf
        if z != z0:
            continue
        dist = max(abs(x - x0), abs(y - y0))
        if dist > radius:
            continue
        tile, wt, eslot = _gear_of(sh, basetile, tw, weapons)
        rows.append((dist, i, x, y, _compass(x - x0, y - y0), typ, wt, eslot,
                     _tile_name(tile)))
    if not rows:
        return f"No world objects within {radius} of you ({x0},{y0},z{z0})."
    rows.sort()
    dropped = max(0, len(rows) - max_items)
    rows = rows[:max_items]
    out = [f"World objects within {radius} of you ({x0},{y0},z{z0}):",
           "  dist  slot     x    y   dir  type  weight  ready  name"]
    for dist, i, x, y, comp, typ, wt, eslot, name in rows:
        rd = "-" if eslot < 0 else _EQUIP_SLOT_NAME[eslot]
        out.append(f"  {dist:>4}  0x{i:03x}  {x:>4} {y:>4}  {comp:<3}  {typ:>4}  "
                   f"{wt:>6}  {rd:<4}  {name}")
    if dropped:
        out.append(f"  (+{dropped} more beyond the nearest {max_items}; "
                   f"raise max_items or lower radius)")
    return "\n".join(out)


@mcp.tool()
def u6_walkable(segment: int = -1) -> str:
    """Ultima VI: the local 40x40 passability grid as ASCII, faithful to the
    engine's land-walker move gate C_1E0F_000F (terrain + objects, incl. multi-tile
    spread + bridge/breakthrough overrides). NPCs are overlaid as N -- they DO
    block a step (engine rule), but are kept off the planning grid so routes can
    re-plan around moving NPCs. '@' is the actor you control (the avatar in party
    mode, the detached member in solo). Legend: @=you  N=npc  .=open  #=blocked. DS
    from u6_hook unless overridden."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        self_slot, _idx, _veh = _controlled_slot(base)
        x0, y0, z0 = _controlled_xyz(base)
        walk, cost, ax, ay = _build_grid(base)
        npc_cells = _actor_cells(base, z0, ax, ay, self_slot)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    av = _world_to_cell(x0, y0, ax, ay)
    out = [f"Walkable grid (window origin world {ax},{ay}; z={z0}; "
           f"@=you N=npc .=open #=blocked):"]
    for r in range(U6_AREA_H):
        line = []
        for c in range(U6_AREA_W):
            if (r, c) == av:
                line.append("@")
            elif (r, c) in npc_cells:
                line.append("N")
            else:
                line.append("." if walk[r][c] else "#")
        out.append("  " + "".join(line))
    return "\n".join(out)


@mcp.tool()
def u6_pathfind(npc_slot: int, segment: int = -1) -> str:
    """Ultima VI: PLAN a route to get adjacent to an NPC. Returns the cardinal
    step list (n/s/w/e) WITHOUT sending input -- pure computation over the
    walkable grid (NPCs excluded; moving-NPC blocks are u6_goto's job). DS from
    u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        x0, y0, z0 = _controlled_xyz(base)
        nx, ny, nz, cu = _npc_xyz(base, npc_slot)
        walk, cost, ax, ay = _build_grid(base)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    if cu != 0:
        return f"NPC slot 0x{npc_slot:x} is not placed in the world (in a party/container?)."
    if nz != z0:
        return f"NPC slot 0x{npc_slot:x} is on z={nz}; avatar on z={z0} -- not the same level."
    start = _world_to_cell(x0, y0, ax, ay)
    ncell = _world_to_cell(nx, ny, ax, ay)
    if start is None:
        return "Controlled actor not within the local area window (unexpected)."
    if ncell is None:
        return (f"NPC 0x{npc_slot:x} at ({nx},{ny}) is outside the 40x40 local window "
                f"-- global routing not implemented yet.")
    if abs(nx - x0) + abs(ny - y0) == 1:
        return f"Already adjacent to NPC 0x{npc_slot:x} (to the {_dir_to(nx - x0, ny - y0)})."
    goals = _adjacent_goals(walk, ncell)
    if not goals:
        return f"No walkable tile adjacent to NPC 0x{npc_slot:x}."
    steps = _dijkstra(walk, cost, start, goals)
    if steps is None:
        return f"No path to NPC 0x{npc_slot:x} within the local area (blocked)."
    dirs = [_STEP_NAME[s] for s in steps]
    return (f"Path to adjacent NPC 0x{npc_slot:x}: {len(dirs)} steps -> "
            f"{' '.join(dirs)}\n(execute with u6_goto, or step via u6_move)")


@mcp.tool()
def u6_goto(npc_slot: int, max_steps: int = 60, segment: int = -1) -> str:
    """Ultima VI: walk the avatar adjacent to an NPC, CLOSED-LOOP -- plan -> one
    u6_move -> confirm via re-read -> replan on block, until adjacent or stuck.
    Handles moving NPCs reactively (re-plans each step). Returns a step log;
    when it arrives, follow with u6_talk(dir). DS from u6_hook unless overridden."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    log, stuck = [], 0
    for step_i in range(max_steps):
        try:
            x0, y0, z0 = _controlled_xyz(base)
            nx, ny, nz, cu = _npc_xyz(base, npc_slot)
            walk, cost, ax, ay = _build_grid(base)
        except OSError as ex:
            return "\n".join(log + [f"Read failed: {ex}"])
        if cu != 0:
            return "\n".join(log + [f"NPC 0x{npc_slot:x} left the world (party/container?) -- stop."])
        if nz != z0:
            return "\n".join(log + [f"NPC now on z={nz}, avatar z={z0} -- stop."])
        if abs(nx - x0) + abs(ny - y0) == 1:
            td = _dir_to(nx - x0, ny - y0)
            return "\n".join(log + [f"Arrived adjacent to NPC 0x{npc_slot:x} at avatar "
                                    f"({x0},{y0}); it's to the {td}. Now u6_talk('{td}')."])
        start = _world_to_cell(x0, y0, ax, ay)
        ncell = _world_to_cell(nx, ny, ax, ay)
        if start is None or ncell is None:
            return "\n".join(log + [f"Target/avatar left the local window (global routing "
                                    f"not implemented). avatar=({x0},{y0}) npc=({nx},{ny})."])
        steps = _dijkstra(walk, cost, start, _adjacent_goals(walk, ncell))
        if not steps:
            return "\n".join(log + [f"No path to NPC 0x{npc_slot:x} (blocked). avatar=({x0},{y0})."])
        mv = steps[0]
        _wait_command_ready(base)            # our turn before we step
        inp.send_key(_STEP_ARROW[mv])
        time.sleep(0.05)                     # let the key register (AllowMouseMov drops)
        _wait_command_ready(base)            # wait for the turn to resolve, then re-read
        try:
            x1, y1, _ = _controlled_xyz(base)
        except OSError:
            x1, y1 = x0, y0
        if (x1, y1) == (x0, y0):
            stuck += 1
            log.append(f"step {step_i}: {_STEP_NAME[mv]} blocked (no move) [{stuck}/3]")
            if stuck >= 3:
                return "\n".join(log + [f"Stuck at ({x0},{y0}) after 3 blocked tries "
                                        f"(NPC parked in the way?) -- giving up."])
        else:
            stuck = 0
            log.append(f"step {step_i}: {_STEP_NAME[mv]} -> ({x1},{y1})")
    return "\n".join(log + [f"Hit max_steps={max_steps} without arriving."])


@mcp.tool()
def u6_talk_to(npc_slot: int, max_steps: int = 60, segment: int = -1) -> str:
    """Ultima VI: the demo one-liner -- u6_goto(npc) then open the conversation
    (T + direction). On success, poll u6_conversation() and reply with u6_say().
    DS from u6_hook unless overridden with segment=."""
    r = u6_goto(npc_slot, max_steps, segment)
    if S.membase is None:
        return r
    ds, err = _ds(segment)
    if err:
        return r
    base = S.membase + (ds << 4)
    try:
        x0, y0, _ = _controlled_xyz(base)
        nx, ny, _nz, _cu = _npc_xyz(base, npc_slot)
    except OSError:
        return r + "\n(could not re-read positions; talk skipped)"
    if abs(nx - x0) + abs(ny - y0) != 1:
        return r + "\n(not adjacent; talk skipped)"
    td = _dir_to(nx - x0, ny - y0)
    return f"{r}\n{u6_talk(td)}\nNow poll u6_conversation() and reply with u6_say()."


# ----------------------------------------------------------------------------
# Passability validation harness -- the fidelity gate. We have BOTH the oracle
# (ported C_1E0F_000F) and the live game + action channel, so "is the port 100%
# faithful?" is answerable, not arguable: predict each cardinal step, actually
# take it, and compare to what the avatar's position did.
# ----------------------------------------------------------------------------
_RESTORE_ARROW = {"n": "down", "s": "up", "w": "right", "e": "left"}


def _cell_diag(base_addr, wx, wy, z0, ax, ay):
    """One-line why diagnostic for world cell (wx,wy,z0): ground tile + terrain
    flags, plus any in-world object/actor on it. Called only on an oracle mismatch,
    so it re-reads freely."""
    terr = _static_table(base_addr, U6_TerrainType_ptr, _TILEFLAG_N, "terr")
    parts = []
    cell = _world_to_cell(wx, wy, ax, ay)
    if cell:
        tiles = dm.read(S.handle, base_addr + U6_AreaTiles, U6_AREA_H * U6_AREA_W)
        gt = tiles[cell[0] * U6_AREA_W + cell[1]]
        gf = terr[gt] if 0 <= gt < len(terr) else 0
        parts.append(f"ground tile={gt} terr=0x{gf:02x}")
    status = dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS)
    pos    = dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3)
    shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    hits = []
    for i in range(1, U6_MAX_SLOTS):
        if (status[i] & 0x18) != 0:
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        if (v & 0x3ff) != wx or ((v >> 10) & 0x3ff) != wy or ((v >> 20) & 0xf) != z0:
            continue
        typ = (shape[i * 2] | (shape[i * 2 + 1] << 8)) & 0x3ff
        if typ == 0:
            continue
        hits.append(f"slot 0x{i:x} type 0x{typ:x}" + (" ACTOR" if i < 0x100 else ""))
    if hits:
        parts.append("on cell: " + ", ".join(hits[:5]))
    return "; ".join(parts) if parts else "(no terrain/obj info)"


@mcp.tool()
def u6_validate_passability(restore: bool = True, settle_ms: int = 160,
                            segment: int = -1) -> str:
    """Ultima VI: EMPIRICALLY verify the ported passability oracle (C_1E0F_000F)
    against the live game -- the fidelity gate. For each cardinal direction it
    (re-)reads avatar + grid + actors, PREDICTS pass/block, sends the move, re-reads
    the avatar position to see what the game DID, and reports MATCH / MISMATCH.

    By default it steps back after any successful move so the avatar ends where it
    started -- but each probe still costs game turns, so run it on a SAFE save
    (e.g. standing in the castle), not mid-combat. A mismatch dumps the destination
    tile id + flags + any object/actor, so a wrong prediction is debuggable on the
    spot. DOSBox must be focused (SendInput). DS from u6_hook unless overridden."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        sx, sy, sz = _controlled_xyz(base)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    out = [f"Passability validation at controlled actor ({sx},{sy},z{sz}) "
           f"-- predict (oracle) vs actual (live move):"]
    mismatches = 0
    for dr, dc in _DIR_DELTAS:
        name = _STEP_NAME[(dr, dc)]
        _wait_command_ready(base)            # predict from a stable turn boundary
        try:
            self_slot, _idx, _veh = _controlled_slot(base)
            x0, y0, z0 = _controlled_xyz(base)
            walk, _cost, ax, ay = _build_grid(base)
            actors = _actor_cells(base, z0, ax, ay, self_slot)
        except OSError as ex:
            out.append(f"  {name}: read failed: {ex}")
            continue
        av = _world_to_cell(x0, y0, ax, ay)
        if av is None:
            out.append(f"  {name}: avatar outside window -- skipped")
            continue
        nr, nc = av[0] + dr, av[1] + dc
        in_win = 0 <= nr < U6_AREA_H and 0 <= nc < U6_AREA_W
        predict = bool(in_win and walk[nr][nc] and (nr, nc) not in actors)
        wx, wy = (x0 + dc) & 0x3ff, (y0 + dr) & 0x3ff
        inp.send_key(_STEP_ARROW[(dr, dc)])
        time.sleep(settle_ms / 1000.0)
        _wait_command_ready(base)            # wait for the turn to resolve before re-reading
        try:
            x1, y1, _ = _controlled_xyz(base)
        except OSError:
            x1, y1 = x0, y0
        actual = (x1, y1) == (wx, wy)
        ok = (actual == predict)
        if not ok:
            mismatches += 1
        line = (f"  {name}: predict={'pass' if predict else 'block'} "
                f"actual={'pass' if actual else 'block'}  {'OK' if ok else '**MISMATCH**'}")
        if not ok:
            line += "  | " + _cell_diag(base, wx, wy, z0, ax, ay)
        out.append(line)
        if actual and restore:                              # we moved -- step back
            _wait_command_ready(base)
            inp.send_key(_RESTORE_ARROW[name])
            time.sleep(settle_ms / 1000.0)
    out.append("-- " + ("ALL 4 MATCH: oracle faithful here." if mismatches == 0
                        else f"{mismatches} MISMATCH(es): oracle diverges -- inspect the diag + C_1E0F_000F."))
    return "\n".join(out)


if __name__ == "__main__":
    mcp.run()
