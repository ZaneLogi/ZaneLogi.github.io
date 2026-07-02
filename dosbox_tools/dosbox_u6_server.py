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

U6 layout facts (parallel object arrays, CoordUse encoding, the in-segment offsets)
ARE the spec, from the u6-decompiled DGROUP. DS (the U6 data segment) is NOT baked
in: it is the program's DOS load segment, which shifts with the memory layout
(drivers/TSRs/env/config), so it is DERIVED PER RUN -- u6_hook() does that from the
avatar's name (Names[0] @ DS:0x3236 -> DS = (name_linear - 0x3236) / 16).

This module is the LAUNCHER + HOT-RELOAD layer. The U6 logic lives in the `u6/`
package, split by subsystem -- constants, ctx (runtime singletons + session
primitives), decode (object/tile interpreters), converse (dialogue VM + tools),
navigate (grid/area-map/movement), perceive (read tools), act (action verbs),
hook. Tool functions are tagged with @hot_tool (a marker, not a registration);
this launcher registers ONE stable dispatching wrapper per tool, then auto-reloads
changed logic modules on each call (mtime check) -- so editing a tool BODY takes
effect with NO server restart. Only schema changes (new params / renamed tools /
docstrings the client reads) still need a client reconnect.
"""

import os
import functools
import importlib

from u6.constants import *  # noqa: F401,F403  -- constants live in u6/constants.py
from u6 import constants as _const  # so tests can also reach them via this module
globals().update({k: v for k, v in vars(_const).items() if not k.startswith('__')})

from u6.ctx import (mcp, S, U6State, base, inp, hot_tool, _HOT_TOOLS, _ds, _derive_ds,  # noqa: F401
    _rd8, _rd16, _rd16s, _read_far_ptr, _static_table, _session_base, _controlled_slot, _controlled_xyz, _world_to_cell, _wait_command_ready, _input_state)

# Import every tool module: the @hot_tool decorators tag (module, name) into
# _HOT_TOOLS, AND these star-imports expose the functions in THIS module's
# namespace (the test suite imports them from here).
from u6.decode import *       # noqa: F401,F403  -- object/tile decoders (helpers, no tools)
from u6.affordance import *   # noqa: F401,F403  -- USE-effect prediction
from u6.converse import *     # noqa: F401,F403  -- dialogue VM + tools
from u6.navigate import *     # noqa: F401,F403  -- grid/area-map/nav tools
from u6.cartography import *  # noqa: F401,F403  -- whole-level baked-terrain routing
from u6.perceive import *     # noqa: F401,F403  -- read tools
from u6.act import *          # noqa: F401,F403  -- action verbs
from u6.combat import *       # noqa: F401,F403  -- combat-safety verbs (pacify / heal)
from u6.hook import *         # noqa: F401,F403  -- u6_hook

# ---------------------------------------------------------------------------
# Hot-reload: stat the logic modules on each tool call; on any change, reload
# them in dependency order so edits to a tool BODY take effect with no restart.
# ctx / constants / data modules are NOT reloaded -- ctx holds the live session
# S + the mcp server + the base/input tool registrations, so reloading it would
# drop the hook. Reload order = leaves first (a module is reloaded AFTER the u6
# deps it star-imports): decode -> {converse,navigate,cartography,affordance,
# perceive} -> act (uses converse+navigate) -> hook.
# ---------------------------------------------------------------------------
_RELOAD_ORDER = ["u6.decode", "u6.converse", "u6.navigate", "u6.cartography",
                 "u6.affordance", "u6.perceive", "u6.act", "u6.combat", "u6.hook"]
_mtimes = {}

def _scan_mtimes():
    """True if any logic module's source file changed since we last looked."""
    changed = False
    for name in _RELOAD_ORDER:
        f = getattr(importlib.import_module(name), "__file__", None)
        if not f:
            continue
        try:
            m = os.path.getmtime(f)
        except OSError:
            continue
        if _mtimes.get(name) != m:
            _mtimes[name] = m
            changed = True
    return changed

def _maybe_reload():
    """If any logic module changed on disk, reload them all in dependency order.
    Tool calls are serialized over stdio, so a reload only ever happens BETWEEN
    calls -- never mid-call, no lock needed. importlib.reload recompiles from
    source, so no manual pycache clearing is required."""
    if not _scan_mtimes():
        return
    for name in _RELOAD_ORDER:
        importlib.reload(importlib.import_module(name))
    _scan_mtimes()   # re-baseline after reloading

_scan_mtimes()       # prime the baseline at startup (so the first call is a no-op)

def _make_wrapper(modname, funcname):
    """One stable wrapper, registered once on mcp. functools.wraps copies the
    impl's signature/doc/__wrapped__ so FastMCP builds the right schema (it reads
    inspect.signature, which follows __wrapped__). The body re-looks-up the
    CURRENT function each call, so a reload swaps in the new code transparently."""
    impl0 = getattr(importlib.import_module(modname), funcname)
    @functools.wraps(impl0)
    def wrapper(*args, **kwargs):
        _maybe_reload()
        fn = getattr(importlib.import_module(modname), funcname)
        return fn(*args, **kwargs)
    return wrapper

# Register one dispatching wrapper per @hot_tool-tagged function.
for _modname, _funcname in list(_HOT_TOOLS):
    mcp.tool()(_make_wrapper(_modname, _funcname))


@mcp.tool()
def u6_dev_reload() -> str:
    """Dev helper: force a reload of the U6 logic modules now and report. Normally
    unnecessary -- every tool call auto-reloads changed modules via an mtime check
    -- but handy to confirm a code edit took effect, or to reload mid-investigation."""
    changed = _scan_mtimes()
    for name in _RELOAD_ORDER:
        importlib.reload(importlib.import_module(name))
    _scan_mtimes()
    note = "a source change was detected" if changed else "no source change since last tool call"
    return f"forced reload of: {', '.join(_RELOAD_ORDER)} ({note})."


if __name__ == "__main__":
    mcp.run()
