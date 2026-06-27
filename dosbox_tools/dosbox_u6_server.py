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

This module is now just the LAUNCHER: the U6 logic lives in the `u6/` package,
split by subsystem -- constants, ctx (runtime singletons + session primitives),
decode (object/tile interpreters), converse (dialogue VM + tools), navigate
(grid/area-map/movement), perceive (read tools), act (action verbs), hook. Each
import below pulls in a submodule whose @mcp.tool()s register on the shared mcp.
"""

from u6.constants import *  # noqa: F401,F403  -- constants live in u6/constants.py
from u6 import constants as _const  # so tests can also reach them via this module
globals().update({k: v for k, v in vars(_const).items() if not k.startswith('__')})

from u6.ctx import (mcp, S, U6State, base, inp, _ds, _derive_ds,  # noqa: F401
    _rd8, _rd16, _rd16s, _read_far_ptr, _static_table, _session_base, _controlled_slot, _controlled_xyz, _world_to_cell, _wait_command_ready, _input_state)
from u6.decode import *  # noqa: F401,F403  -- object/tile decoders
from u6.converse import *  # noqa: F401,F403  -- dialogue VM + tools
from u6.navigate import *  # noqa: F401,F403  -- grid/area-map/nav tools
from u6.cartography import *  # noqa: F401,F403  -- whole-level baked-terrain routing
from u6.perceive import *  # noqa: F401,F403  -- read tools
from u6.act import *  # noqa: F401,F403  -- action verbs
from u6.hook import *  # noqa: F401,F403  -- u6_hook


if __name__ == "__main__":
    mcp.run()
