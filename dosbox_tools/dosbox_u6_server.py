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
# tables (u6.h, seg_101C.c GetTileAtXYZ, seg_1E0F.c __ComputeResistance). All
# DGROUP / DS-relative. Ground tiles are bytes 0-255; high tile.h IDs are
# objects drawn on top (the object arrays). Walkability mirrors the engine:
# terrain impassable OR a STATIC object (slot >= 0x100) whose tile is impassable;
# NPC slots (< 0x100) are excluded from the plan (resolved at per-step time).
# ----------------------------------------------------------------------------
U6_AREA_W = 40
U6_AREA_H = 40
U6_WORLD_MASK = 0x3ff             # world is 1024x1024
U6_AreaTiles  = 0x8E51            # AREA_H*AREA_W bytes; ground tile per cell
U6_AreaX      = 0xBBC8            # int; world X of the area-window origin
U6_AreaY      = 0xBBCA            # int; world Y of the area-window origin
U6_MapObjPtr  = 0xD8E7            # AREA_H*AREA_W int16; head object slot/cell, -1 = none
U6_Link       = 0xBDDA            # int16[U6_MAX_SLOTS]; per-cell object stack chain
U6_NPCFlag_ptr     = 0x4D4C       # far ptr -> NPCFlag[]; dir = NPCFlag[slot] & 7
U6_TerrainType_ptr = 0xB3EB       # far ptr -> TerrainType[tile]; & 0x02 = impassable
U6_BaseTile_ptr    = 0x6824       # far ptr -> BaseTile[type] (int16); tile = BaseTile[type]+frame
TERRAIN_IMPASS = 0x02
TERRAIN_WALL   = 0x04
TERRAIN_WET    = 0x01
_TILEFLAG_N = 0x800               # tile-flag tables span all 2048 tile ids
_BASETILE_N = 0x400               # BaseTile indexed by 10-bit object type

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

    def reset(self):
        super().reset()
        self.u6_ds = None


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
            f"Ready -- read: u6_avatar / u6_object / u6_inventory / u6_npcs_near "
            f"/ u6_walkable / u6_conversation; act: u6_move / u6_talk / u6_say / "
            f"u6_key; navigate: u6_pathfind / u6_goto / u6_talk_to. Avatar = slot 1.")


@mcp.tool()
def u6_object(slot: int, segment: int = -1) -> str:
    """Ultima VI: decode one object/NPC slot from the parallel arrays
    (ObjStatus/ObjPos/ObjShapeType/Amount). Shows CoordUse + world x/y/z (LOCXYZ)
    or assoc holder (CONTAINED/INVEN/EQUIP), plus shape type/frame and quan/qual.
    DS comes from u6_hook unless you override it with segment=."""
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
    except OSError as ex:
        return f"Read failed for slot 0x{slot:x} (DS=0x{ds:04x}): {ex}"
    cu = st & 0x18
    V = pos[0] | (pos[1] << 8) | (pos[2] << 16)
    where = (f"x={V & 0x3ff} y={(V >> 10) & 0x3ff} z={(V >> 20) & 0xf}"
             if cu == 0 else f"assoc=0x{V & 0xffff:x}")
    return (f"slot 0x{slot:x}: status=0x{st:02x} {_COORDUSE.get(cu, '?')}  {where}  "
            f"type={sh & 0x3ff} frame={sh >> 10}  quan={am & 0xff} qual={am >> 8}")


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
    return inp.send_key(key)


@mcp.tool()
def u6_talk(direction: str) -> str:
    """Ultima VI: open a conversation with the NPC in `direction` -- presses 'T'
    then the direction key. Afterward poll u6_conversation() and reply with
    u6_say() / u6_key(). (Verify the talk-input flow live.)"""
    key = _U6_DIR.get(direction.strip().lower())
    if not key:
        return f"Unknown direction {direction!r}. Use n/s/e/w."
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
def _s16(buf, i):
    v = buf[i * 2] | (buf[i * 2 + 1] << 8)
    return v - 0x10000 if v >= 0x8000 else v


def _read_far_ptr(base_addr, ds_off):
    """Resolve a Borland far pointer stored at DS:ds_off to a host linear addr."""
    fp = dm.read(S.handle, base_addr + ds_off, 4)
    off = fp[0] | (fp[1] << 8)
    seg = fp[2] | (fp[3] << 8)
    return S.membase + (seg << 4) + off


def _avatar_xyz(base_addr):
    pos = dm.read(S.handle, base_addr + U6_ObjPos + 1 * 3, 3)
    v = pos[0] | (pos[1] << 8) | (pos[2] << 16)
    return v & 0x3ff, (v >> 10) & 0x3ff, (v >> 20) & 0xf


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
    """Read terrain + static objects -> (walk[H][W] bool, cost[H][W] int, AreaX,
    AreaY). Mirrors the engine (seg_1E0F.c __ComputeResistance): a cell is blocked
    by impassable terrain, or by a STATIC object on it (slot >= 0x100) whose tile
    is impassable; NPC slots (< 0x100) are excluded (resolved at per-step time).
    The per-cell move cost is the engine's `(TerrainType[ground] >> 4) + 1`, so
    weighted search skirts costly terrain (forest/swamp) the way the game does."""
    ax = int.from_bytes(dm.read(S.handle, base_addr + U6_AreaX, 2), "little")
    ay = int.from_bytes(dm.read(S.handle, base_addr + U6_AreaY, 2), "little")
    tiles = dm.read(S.handle, base_addr + U6_AreaTiles, U6_AREA_H * U6_AREA_W)
    mop = dm.read(S.handle, base_addr + U6_MapObjPtr, U6_AREA_H * U6_AREA_W * 2)
    link = dm.read(S.handle, base_addr + U6_Link, U6_MAX_SLOTS * 2)
    shape = dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    terr = dm.read(S.handle, _read_far_ptr(base_addr, U6_TerrainType_ptr), _TILEFLAG_N)
    basetile = dm.read(S.handle, _read_far_ptr(base_addr, U6_BaseTile_ptr), _BASETILE_N * 2)

    def tflag(tile):
        return terr[tile] if 0 <= tile < len(terr) else 0

    walk = [[True] * U6_AREA_W for _ in range(U6_AREA_H)]
    cost = [[1] * U6_AREA_W for _ in range(U6_AREA_H)]
    for r in range(U6_AREA_H):
        for c in range(U6_AREA_W):
            gf = tflag(tiles[r * U6_AREA_W + c])
            cost[r][c] = (gf >> 4) + 1                   # engine move cost: forest/swamp > road
            if gf & TERRAIN_IMPASS:
                walk[r][c] = False
                continue
            slot = _s16(mop, r * U6_AREA_W + c)
            guard = 0
            while 0 <= slot < U6_MAX_SLOTS and guard < 64:
                if slot >= 0x100:                       # map object, not an NPC
                    sh = shape[slot * 2] | (shape[slot * 2 + 1] << 8)
                    typ = sh & 0x3ff
                    if typ < _BASETILE_N:
                        tile = (basetile[typ * 2] | (basetile[typ * 2 + 1] << 8)) + (sh >> 10)
                        if tflag(tile) & TERRAIN_IMPASS:
                            walk[r][c] = False
                            break
                nxt = _s16(link, slot)
                if nxt == slot:
                    break
                slot = nxt
                guard += 1
    return walk, cost, ax, ay


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
    """Ultima VI: the avatar's world position (x/y/z) + facing. The position is
    the closed-loop nav primitive (confirm a move actually happened). DS from
    u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        x, y, z = _avatar_xyz(base)
        d = dm.read(S.handle, _read_far_ptr(base, U6_NPCFlag_ptr) + 1, 1)[0] & 7
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    return f"avatar (slot 1): x={x} y={y} z={z}  dir(NPCFlag&7)={d}"


@mcp.tool()
def u6_npcs_near(radius: int = 12, segment: int = -1) -> str:
    """Ultima VI: NPCs/creatures placed in the world (LOCXYZ) within `radius`
    (Chebyshev) of the avatar on the same level. Reports slot, position, compass
    direction, distance and shape type -- the agent's situational awareness for
    picking a target. DS from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        x0, y0, z0 = _avatar_xyz(base)
        status = dm.read(S.handle, base + U6_ObjStatus, 0x100)
        pos = dm.read(S.handle, base + U6_ObjPos, 0x100 * 3)
        shape = dm.read(S.handle, base + U6_ObjShapeType, 0x100 * 2)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    rows = []
    for i in range(0x100):
        if i == 1 or (status[i] & 0x18) != 0:           # avatar / not in world
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
        return f"No NPCs within {radius} of avatar ({x0},{y0},z{z0})."
    rows.sort()
    out = [f"NPCs within {radius} of avatar ({x0},{y0},z{z0}):",
           "  dist  slot     x    y   dir  type"]
    for dist, i, x, y, comp, typ in rows:
        out.append(f"  {dist:>4}  0x{i:02x}  {x:>4} {y:>4}  {comp:<3}  {typ}")
    return "\n".join(out)


@mcp.tool()
def u6_walkable(segment: int = -1) -> str:
    """Ultima VI: the local 40x40 passability grid as ASCII (terrain + static
    objects; NPCs overlaid but NOT treated as walls -- engine rule). Legend:
    @=avatar  N=npc  .=open  #=blocked. DS from u6_hook unless overridden."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        x0, y0, z0 = _avatar_xyz(base)
        walk, cost, ax, ay = _build_grid(base)
        status = dm.read(S.handle, base + U6_ObjStatus, 0x100)
        pos = dm.read(S.handle, base + U6_ObjPos, 0x100 * 3)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    npc_cells = set()
    for i in range(0x100):
        if i == 1 or (status[i] & 0x18) != 0:
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        if ((v >> 20) & 0xf) != z0:
            continue
        cell = _world_to_cell(v & 0x3ff, (v >> 10) & 0x3ff, ax, ay)
        if cell:
            npc_cells.add(cell)
    av = _world_to_cell(x0, y0, ax, ay)
    out = [f"Walkable grid (window origin world {ax},{ay}; z={z0}; "
           f"@=avatar N=npc .=open #=blocked):"]
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
        x0, y0, z0 = _avatar_xyz(base)
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
        return "Avatar not within the local area window (unexpected)."
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
            x0, y0, z0 = _avatar_xyz(base)
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
        inp.send_key(_STEP_ARROW[mv])
        time.sleep(0.15)
        try:
            x1, y1, _ = _avatar_xyz(base)
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
        x0, y0, _ = _avatar_xyz(base)
        nx, ny, _nz, _cu = _npc_xyz(base, npc_slot)
    except OSError:
        return r + "\n(could not re-read positions; talk skipped)"
    if abs(nx - x0) + abs(ny - y0) != 1:
        return r + "\n(not adjacent; talk skipped)"
    td = _dir_to(nx - x0, ny - y0)
    return f"{r}\n{u6_talk(td)}\nNow poll u6_conversation() and reply with u6_say()."


if __name__ == "__main__":
    mcp.run()
