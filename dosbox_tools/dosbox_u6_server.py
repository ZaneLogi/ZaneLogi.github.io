#!/usr/bin/env python3
"""
DOSBox Ultima VI decoder - "dosbox-u6" MCP server (Windows).

A per-game DECODER server: it knows Ultima VI's in-memory layout and exposes it
as high-level tools (avatar/NPC inventory, single-object decode, live
conversation state) plus an ACTION channel (DOSBox keystroke injection via the
shared dosbox_input lib -- move/talk/say). It does NOT
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
            f"Ready -- read: u6_object / u6_inventory / u6_conversation; "
            f"act: u6_move / u6_talk / u6_say / u6_key. Avatar = slot 1.")


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


if __name__ == "__main__":
    mcp.run()
