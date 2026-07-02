"""u6.ctx -- runtime singletons (the FastMCP server, the U6State session, the
shared base + input tool channels) and DS resolution. Imported by every tool
module so they register on the SAME mcp and share the SAME session S.
"""

import time

from mcp.server.fastmcp import FastMCP
import dosbox_mem as dm
import dosbox_input as di
from u6.constants import *  # noqa: F401,F403  -- U6_Names etc.

mcp = FastMCP("dosbox-u6")

# --- hot-reload support -----------------------------------------------------
# Tool modules tag their functions with @hot_tool INSTEAD of @mcp.tool(). The
# launcher (dosbox_u6_server.py) reads _HOT_TOOLS and registers ONE stable
# dispatching wrapper per tool; editing a tool BODY + saving then lets the
# launcher's _maybe_reload() importlib.reload the logic modules, and the wrapper
# picks up the fresh function -- no server restart. ctx is NEVER reloaded, so
# `mcp`, the session `S`, and the base/input tool registrations all survive.
# (Schema changes -- new params / renamed tools / docstrings -- still need a
# client reconnect, because the client caches the tool schema at connect time.)
_HOT_TOOLS = []   # [(module_name, func_name)], populated as tool modules import

def hot_tool(fn):
    """Marker: record (module, name) for the launcher's dynamic registration; do
    NOT register on mcp here (that would capture THIS function object and defeat
    reload). Returns fn unchanged, so the module still exposes it normally."""
    key = (fn.__module__, fn.__name__)
    if key not in _HOT_TOOLS:
        _HOT_TOOLS.append(key)
    return fn


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


# ---------------------------------------------------------------------------
# Session read/position primitives -- the lowest-level guest-RAM accessors and
# turn/position helpers, shared by every decoder/tool module.
# ---------------------------------------------------------------------------

def _rd8(addr):   return dm.read(S.handle, addr, 1)[0]

def _rd16(addr):  return int.from_bytes(dm.read(S.handle, addr, 2), "little")

def _rd16s(addr): return int.from_bytes(dm.read(S.handle, addr, 2), "little", signed=True)

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
    Priority matters: SelectMode!=0 means a target/panel cursor is armed and MUST be
    cleared (ESC) before the next command -- it is checked BEFORE AllowMouseMov, because
    the panel-armed state runs with AllowMouseMov==1 too (a TAB into the inventory leaves
    SelectMode=2 AND AllowMouseMov=1; classifying that as COMMAND_READY made the cleanup
    helpers stop early and stranded the panel armed)."""
    conv  = dm.read(S.handle, base_addr + U6_IsInConversation, 1)[0]
    amm   = int.from_bytes(dm.read(S.handle, base_addr + U6_AllowMouseMov, 2), "little")
    sel   = dm.read(S.handle, base_addr + U6_SelectMode, 1)[0]
    mouse = int.from_bytes(dm.read(S.handle, base_addr + U6_MouseMode, 2), "little")
    flags = {"IsInConversation": conv, "AllowMouseMov": amm,
             "SelectMode": sel, "MouseMode": mouse}
    if conv:
        state = "CONVERSATION"
    elif sel:                                   # a target/panel cursor is armed -> must ESC
        state = "SELECTING"
    elif amm == 1:
        state = "COMMAND_READY"
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



__all__ = ["mcp", "hot_tool", "_HOT_TOOLS", "S", "U6State", "base", "inp", "_ds", "_derive_ds", "dm", "di",
    "_rd8",
    "_rd16",
    "_rd16s",
    "_read_far_ptr",
    "_static_table",
    "_session_base",
    "_controlled_slot",
    "_controlled_xyz",
    "_world_to_cell",
    "_wait_command_ready",
    "_input_state",
]
