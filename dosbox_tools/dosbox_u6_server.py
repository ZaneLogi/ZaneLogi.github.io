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

from mcp.server.fastmcp import FastMCP

import dosbox_mem as dm
import dosbox_input as di

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
# (conversation state is U6_IsInConversation = 0x098B, defined in the talk section.)


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
U6_TalkSavedPC      = 0xE7A7   # 4 B; Talk_PC saved at the current prompt (D_E7A7)
U6_NpcName          = 0xE764   # up to ~50 B; current NPC name (D_E764), high-bit terminates

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
            f"/ u6_object / u6_inventory / u6_npcs_near / u6_objects_near / u6_walkable "
            f"/ u6_conversation; act: u6_move / u6_talk / u6_say / u6_key; navigate: "
            f"u6_pathfind / u6_goto / u6_talk_to; verify: u6_validate_passability. "
            f"Avatar = slot 1.")


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
    ready = "not readyable" if eslot < 0 else f"ready->{_EQUIP_SLOT_NAME[eslot]}"
    return (f"slot 0x{slot:x}: status=0x{st:02x} {_COORDUSE.get(cu, '?')}  {where}  "
            f"type={sh & 0x3ff} frame={sh >> 10}  quan={am & 0xff} qual={am >> 8}  "
            f"tile={tile}  weight={wt}  {ready}")


@mcp.tool()
def u6_inventory(npc_slot: int, segment: int = -1,
                 max_slots: int = U6_MAX_SLOTS) -> str:
    """Ultima VI: list an NPC's inventory -- every object flagged INVEN or EQUIP
    whose assoc (holder slot) == npc_slot. Walks the whole object-slot range
    in-process and returns the decoded items (slot, INVEN/EQUIP, shape type,
    frame, quan, qual). The Avatar is its roster[0] slot (usually 1). DS comes
    from u6_hook unless you override it with segment=."""
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
        rows.append((i, "EQUIP" if cu == 0x18 else "INVEN",
                     sh & 0x3ff, sh >> 10, am & 0xff, am >> 8))
    if not rows:
        return f"No INVEN/EQUIP objects with assoc={npc_slot} (DS=0x{ds:04x})."
    out = [f"{len(rows)} item(s) held by NPC slot {npc_slot} (DS=0x{ds:04x}):",
           "  slot   use    type  frame  quan  qual"]
    for slot, use, typ, frame, quan, qual in rows:
        out.append(f"  0x{slot:03x}  {use:<5}  {typ:>4}  {frame:>5}  {quan:>4}  {qual:>4}")
    return "\n".join(out)


@mcp.tool()
def u6_conversation(segment: int = -1, dump: int = 64) -> str:
    """Ultima VI: decode the live conversation / "talk" engine state (seg_1703.c
    "talkdr"). Reports whether a conversation is active (IsInConversation), the
    interlocutor NPC# and the party speaker (D_E796), the NPC name, the VM
    program counter (Talk_PC), the player's last input (D_E732), and the resolved
    TalkBuf far pointer -- plus a hex window of the loaded script starting at
    Talk_PC, annotated if the current byte is an input-wait opcode.

    The VM loads the NPC's whole script into TalkBuf and runs PARSE_U8 ==
    TalkBuf[Talk_PC++], printing text then blocking on input -- so the NPC's text
    and the valid keyword branches both live in TalkBuf. `dump` = bytes of TalkBuf
    to show from Talk_PC (0 to skip). DS comes from u6_hook unless overridden with
    segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base_addr = S.membase + (ds << 4)
    try:
        active   = dm.read(S.handle, base_addr + U6_IsInConversation, 1)[0]
        interloc = int.from_bytes(dm.read(S.handle, base_addr + U6_TalkInterloc, 2), "little")
        locutor  = int.from_bytes(dm.read(S.handle, base_addr + U6_TalkInterloc + 2, 2), "little")
        pc       = int.from_bytes(dm.read(S.handle, base_addr + U6_Talk_PC, 2), "little")
        inp_raw  = dm.read(S.handle, base_addr + U6_TalkInput, 0x32)
        name_raw = dm.read(S.handle, base_addr + U6_NpcName, 50)
        fp       = dm.read(S.handle, base_addr + U6_TalkBuf_ptr, 4)
    except OSError as ex:
        return f"Read failed reading talk-engine state (DS=0x{ds:04x}): {ex}"

    inp = inp_raw.split(b"\x00", 1)[0].decode("latin-1", "replace")
    # NPC name: a high-bit byte terminates (per C_1703_00A0); NUL also stops it.
    name_b = bytearray()
    for b in name_raw:
        if b == 0 or (b & 0x80):
            break
        name_b.append(b)
    name = name_b.decode("latin-1", "replace")

    tb_off = fp[0] | (fp[1] << 8)
    tb_seg = fp[2] | (fp[3] << 8)
    tb_lin = (tb_seg << 4) + tb_off

    out = [
        f"IsInConversation = {active}  ({'ACTIVE' if active else 'idle'})",
        f"interlocutor (NPC#) = {interloc} (0x{interloc:x});  locutor (speaker slot) = {locutor}",
        f"NPC name = {name!r}",
        f"Talk_PC = {pc} (0x{pc:x})   last input (D_E732) = {inp!r}",
        f"TalkBuf = {tb_seg:04x}:{tb_off:04x}  (linear 0x{tb_lin:x}, size 0x{U6_TalkBuf_SIZE:x})",
    ]

    n = min(dump, U6_TalkBuf_SIZE - pc) if (dump > 0 and 0 <= pc < U6_TalkBuf_SIZE) else 0
    if n > 0:
        try:
            window = dm.read(S.handle, S.membase + tb_lin + pc, n)
            op = window[0]
            opn = _TALK_INPUT_OPS.get(op)
            tag = f"  (opcode at Talk_PC = 0x{op:02x}{' = ' + opn + ' [waiting for input]' if opn else ''})"
            out.append(f"TalkBuf[Talk_PC .. +{n}]:{tag}")
            out.append("  " + " ".join(f"{b:02x}" for b in window))
        except OSError as ex:
            out.append(f"(TalkBuf window read failed: {ex})")
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
# Converse opcodes that read a SINGLE key (vs a typed line) -- see _TALK_INPUT_OPS.
_TALK_SINGLEKEY_OPS = {0xf8, 0xfa, 0xfc, 0xcb}  # GET, GETCHR, GETDIGIT, WAIT


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
    """Ultima VI: open a conversation with the NPC in `direction` -- presses 'T'
    then the direction key. Afterward poll u6_conversation() and reply with
    u6_say() / u6_key(). (Verify the talk-input flow live.)"""
    key = _U6_DIR.get(direction.strip().lower())
    if not key:
        return f"Unknown direction {direction!r}. Use n/s/e/w."
    b = _session_base()
    if b is not None:
        _wait_command_ready(b)          # 'T' must land as a fresh command
    r1 = inp.send_key("t")
    time.sleep(0.15)
    r2 = inp.send_key(key)
    return f"talk {direction}: [{r1}] [{r2}]"


@mcp.tool()
def u6_say(text: str, segment: int = -1) -> str:
    """Ultima VI: answer the current conversation prompt. Peeks the converse-VM
    opcode at Talk_PC: at a single-key prompt (GET/GETCHR/GETDIGIT/WAIT) it sends
    just the first character; otherwise (ASKTOP/GETSTR/GETINT) it types `text` +
    Enter. Falls back to line input if the VM state can't be read. DS from
    u6_hook."""
    single = False
    if S.membase is not None:
        ds, err = _ds(segment)
        if not err:
            base_addr = S.membase + (ds << 4)
            try:
                pc = int.from_bytes(dm.read(S.handle, base_addr + U6_Talk_PC, 2), "little")
                fp = dm.read(S.handle, base_addr + U6_TalkBuf_ptr, 4)
                tb_lin = ((fp[2] | (fp[3] << 8)) << 4) + (fp[0] | (fp[1] << 8))
                op = dm.read(S.handle, S.membase + tb_lin + pc, 1)[0]
                single = op in _TALK_SINGLEKEY_OPS
            except OSError:
                pass
    if single:
        ch = text[:1]
        return f"[single-key] {inp.send_key(ch if ch else 'enter')}"
    out = inp.send_text(text)
    ent = inp.send_key("enter")
    return f"[line] {out} [{ent}]"


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
    compass direction, distance and shape type -- the agent's situational
    awareness for picking a target. DS from u6_hook unless overridden."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        self_slot, _idx, _veh = _controlled_slot(base)
        x0, y0, z0 = _controlled_xyz(base)
        status = dm.read(S.handle, base + U6_ObjStatus, 0x100)
        pos = dm.read(S.handle, base + U6_ObjPos, 0x100 * 3)
        shape = dm.read(S.handle, base + U6_ObjShapeType, 0x100 * 2)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    rows = []
    for i in range(0x100):
        if i == self_slot or (status[i] & 0x18) != 0:   # the controlled actor / not in world
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        x, y, z = v & 0x3ff, (v >> 10) & 0x3ff, (v >> 20) & 0xf
        typ = (shape[i * 2] | (shape[i * 2 + 1] << 8)) & 0x3ff
        if typ == 0 or z != z0:                          # empty slot / other level
            continue
        dist = max(abs(x - x0), abs(y - y0))
        if dist > radius:
            continue
        rows.append((dist, i, x, y, _compass(x - x0, y - y0), typ))
    if not rows:
        return f"No NPCs within {radius} of you ({x0},{y0},z{z0})."
    rows.sort()
    out = [f"NPCs within {radius} of you ({x0},{y0},z{z0}):",
           "  dist  slot     x    y   dir  type"]
    for dist, i, x, y, comp, typ in rows:
        out.append(f"  {dist:>4}  0x{i:02x}  {x:>4} {y:>4}  {comp:<3}  {typ}")
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
        _t, wt, eslot = _gear_of(sh, basetile, tw, weapons)
        rows.append((dist, i, x, y, _compass(x - x0, y - y0), typ, wt, eslot))
    if not rows:
        return f"No world objects within {radius} of you ({x0},{y0},z{z0})."
    rows.sort()
    dropped = max(0, len(rows) - max_items)
    rows = rows[:max_items]
    out = [f"World objects within {radius} of you ({x0},{y0},z{z0}):",
           "  dist  slot     x    y   dir  type  weight  ready"]
    for dist, i, x, y, comp, typ, wt, eslot in rows:
        rd = "-" if eslot < 0 else _EQUIP_SLOT_NAME[eslot]
        out.append(f"  {dist:>4}  0x{i:03x}  {x:>4} {y:>4}  {comp:<3}  {typ:>4}  "
                   f"{wt:>6}  {rd}")
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
