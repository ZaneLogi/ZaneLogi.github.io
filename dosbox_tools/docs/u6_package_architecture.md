# `dosbox-u6` package architecture (the module spec)

The `dosbox-u6` MCP server used to be one 3407-line `dosbox_u6_server.py`. It is now
a **44-line launcher** over the `u6/` package — one module per subsystem. This doc is
the map: what each module owns, how they depend on each other, how tools register,
the conventions to keep, and the gotchas the split surfaced.

> Scope: this is the *code structure* of the U6 decoder server. It is orthogonal to
> the agent-facing surface (`u6_agent_capabilities.md`), the per-verb mechanism
> (`u6_verb_mechanism.md`), and the passability port (`dosbox_u6_passability.md`).

---

## 1. Layout

```
dosbox_tools/
  dosbox_u6_server.py     # LAUNCHER: imports every u6.* module (registers tools) -> mcp.run()
  u6/
    __init__.py
    constants.py          # layout offsets, bit-fields, area/terrain flags, dir tables
    ctx.py                # runtime singletons (mcp/S/inp/base) + session read/position primitives
    look_names.py         # LOOK.LZD tile-name table (auto-generated data); tile_name()
    mapdata.py            # baked MAP+CHUNKS -> expand_surface/expand_dungeon/tile_at (static terrain data)
    decode.py             # object/tile interpreters (names, gear, doors, allegiance, actor map)
    affordance.py         # USE-effect prediction: exhaustive USE_DISPATCH manifest + predict stubs
    converse.py           # TalkBuf bytecode VM + disassembler + the 2 dialogue tools
    navigate.py           # walkable/cost grid, Dijkstra, area map, live-window movement tools
    cartography.py        # whole-level routing over BAKED terrain (u6_route) + planned spatial-query stubs
    perceive.py           # read-only tools (avatar/party/inventory/panel/npcs/objects)
    act.py                # action verbs + the keyboard mechanisms (cursor/panel/use)
    hook.py               # u6_hook (attach/calibrate/derive DS)
```

The shared `dosbox_mem.py` (attach/calibrate/read/write + `register_base_tools`) and
`dosbox_input.py` (`register_input_tools`) are **not** part of this package — they are
the generic libs the 3-tier design shares with `dosbox-memory`. The U6 server consumes
them via `ctx.py`.

---

## 2. Module responsibilities & public surface

| Module | Owns | Tools | Notable internals (via `__all__`) |
|---|---|---|---|
| `constants` | the in-memory **spec**: DGROUP/DS-relative offsets, `NPCStatus`/door/terrain bit-fields, `AREA_*`, direction tables, `_U6_DOOR_TYPES` (shared) | — | `U6_*`, `_DIR_DELTAS/_STEP_*`, `_PASSABLE_ACTOR_TYPES`, … |
| `ctx` | **runtime singletons** + lowest-level guest-RAM access | (re-exports base+input tools) | `mcp, S, U6State, base, inp, dm, di`, `_ds, _derive_ds`, `_rd8/16/16s`, `_read_far_ptr`, `_static_table`, `_session_base`, `_controlled_slot/xyz`, `_world_to_cell`, `_wait_command_ready`, `_input_state` |
| `look_names` | the LOOK.LZD name table (immutable game data) | — | `tile_name` |
| `mapdata` | the **baked static terrain**: `MAP` (chunk-index) + `CHUNKS` (8x8 tile dict) as verbatim base64 blobs, expanded into the full 1024x1024 surface / 5x256x256 dungeons | — | `expand_surface`, `expand_dungeon`, `tile_at`, `SURFACE_W`, `DUNGEON_W` |
| `decode` | "**what is this**" — bytes → meaning | — | `_obj_tfq/_obj_name`, `_gear_*`, `_equip_slot`, `_door_state/_chest_state`, `_npc_class`, `_actor_map/_actor_cells`, `_door_at_tile`, `_holder_party_index`, `_party_member_slot`, `_visible_backpack`, `_npc_xyz`, `_compass`, `_dir_to`, `_tile_name`, `_ACTOR_RANK` |
| `converse` | the dialogue VM + decoder + offline disassembler | `u6_conversation`, `u6_script_disasm` | `_ConverseVM`, `_DecoderStop`, `_decode_conversation`, `_extract_highlights`, `_disassemble`, `_DIS_*`, `_CV_SIDE_EFFECT`, … |
| `navigate` | walkable/cost grid (`C_1E0F_000F` port), Dijkstra, live area map, **live-window** movement | `u6_walkable`, `u6_area_map`, `u6_pathfind`, `u6_goto`, `u6_goto_xy`, `u6_validate_passability` | `_build_grid`, `_dijkstra`, `_adjacent_goals`, `_mask_walk`, `_closest_reachable`, `_cell_diag`, `u6_area_map_data`, `_DOOR_GLYPH`, `_RESTORE_ARROW` |
| `affordance` | **what does USE do** — `USE_DISPATCH`, an exhaustive mirror of `seg_27a1.c`'s USE switch (all 85 case-types / 48 rows, A/B/C/TBD) + the predict-from-source layer (**A + B + C all built**; C is operate-mechanic only, quest payload withheld; **10 TBD rows** left return a graceful operate-note) | `u6_affordance` | `USE_DISPATCH`, `_BY_TYPE`, `predict_use`, `_use_target`, `_search_area/_search_type_at`, `_predict_*` (qual_toggle/open_close/unlock/light/consume/eat/vehicle/play/simple/quest_mechanic + weathervane/study/squeak/self_toggle), `_NOT_IMPL` |
| `cartography` | **whole-level** routing over the baked terrain (`mapdata`), beyond the 40x40 window + the **structured spatial-query layer** (#1) | `u6_route`, `u6_at`, `u6_nearest`, `u6_interactables_near` | `_baked_region_grid`, `_region_dijkstra`, `_use_from`, `_top_object_slot`, `_describe_obj`, `_actor_on_tile`, `_level_tiles`, `_runlength` |
| `perceive` | read-only perception | `u6_object`, `u6_inventory`, `u6_panel_state`, `u6_avatar`, `u6_party`, `u6_input_state`, `u6_roster_status`, `u6_npcs_near`, `u6_objects_near` | — (tools are self-contained) |
| `act` | action verbs + their keyboard mechanisms | `u6_move`, `u6_talk`, `u6_look`, `u6_get`, `u6_use`, `u6_ready`, `u6_say`, `u6_key`, `u6_talk_to`, `u6_use_object` (#2: go-adjacent + USE) | `_adjacency_action`, `_in_window`, `_panel_commit`, `_begin_select/_walk_cursor`, `_use_map/_use_inventory/_use_key_flow`, `_select_backpack_item`, `_find_matching_key`, `_drain_to_ready`, `_USE_*`, `_U6_DIR/_DIR8`, `_EQUIP_CELL`, … |
| `hook` | attach + BDA-calibrate + derive DS from the avatar name | `u6_hook` | — |

**Tool count:** converse 2 + navigate 6 + cartography 4 (`u6_route` + the #1 query trio
`u6_at`/`u6_nearest`/`u6_interactables_near`) + affordance 1 (`u6_affordance`) + perceive 9 +
act 10 + hook 1 = **33 built U6 tools** (no stubs left) = 33 registered, plus the shared
base/input tools registered by `ctx`. (`mapdata` is data + helpers — no built tools.
`affordance`'s `u6_affordance` predicts A/B/C now; 10 TBD rows remain (graceful note).)

---

## 3. Dependency layering (a DAG — no cycles)

```
constants ─┬─────────────────────────────────────────────► (everything)
           │
ctx ───────┤ (imports constants, dosbox_mem, dosbox_input, FastMCP)
           │
look_names ┤ (leaf data)
mapdata    ┘ (leaf data: baked MAP+CHUNKS, no deps)
           │
decode ◄── constants, ctx, look_names
           │
affordance ◄── constants, ctx, decode   (exhaustive USE_DISPATCH; feeds cartography #1 / act #2)
           │
   ┌───────┼──────────────┬───────────┐
converse  navigate    cartography   perceive   ◄── constants, ctx, decode
   │       │           (+ mapdata,
   │       │            + affordance)
   └───┬───┴──────────────┘
       ▼
      act ◄── constants, ctx, decode, converse, navigate
       │
      hook ◄── constants, ctx
       │
   dosbox_u6_server (launcher) ◄── imports ALL of the above
```

Rule of thumb: **a module may import "leftward/downward" only.** `act` is the most
connected (it composes converse for `u6_say` and navigate for `u6_talk_to`); nothing
imports `act` except the launcher, so it stays a sink.

---

## 4. How tools register (the runtime mechanism)

- `ctx.py` creates the singletons once: `mcp = FastMCP("dosbox-u6")`, `S = U6State()`,
  and `base/inp = register_base/input_tools(mcp, S)`.
- Every tool module does `from u6.ctx import *` and decorates its tools with
  `@mcp.tool()` — so they register on the **one shared `mcp`**.
- The **launcher** imports every module. Importing a module runs its body, which runs
  the `@mcp.tool()` decorators → registration. Then `mcp.run()`.
- Python caches modules, so each registers exactly once regardless of how many modules
  `import *` it.

---

## 5. Conventions (keep these)

1. **Constant placement:** a constant used by **>1 module → `constants.py`**; used by
   **one module → it travels with that module** (e.g. `_USE_*` in `act`, `_DIS_*` in
   `converse`, `_DOOR_GLYPH` in `navigate`). `_U6_DOOR_TYPES` is in `constants` because
   both `decode` and `act` need it.
2. **Re-export for tests:** each module declares `__all__` (including the `_underscore`
   names) and the launcher does `from u6.<mod> import *`. So the **legacy
   `import dosbox_u6_server as u6` still resolves every name** (`u6.U6_AREA_W`,
   `u6._build_grid`, `u6.u6_ready`, …). Tests were written against that surface and keep
   working unchanged — *except* monkeypatching (next point).
3. **Monkeypatch the module that OWNS the function.** Python resolves a called name in
   the **caller's** module globals. So to stub `_build_grid` for `u6_area_map_data`,
   patch `navigate._build_grid` (not `u6._build_grid`) — because `u6_area_map_data`
   lives in `navigate` and resolves the name there. Same for the input channel: the
   action tools resolve `inp`/`time` in `act`, so `test_ready`/`test_use_inventory`/
   `test_action_verbs` patch `act.inp` / `act.time`. (Tests that only *call* a function
   need no change — re-export covers them.)
4. **No new `import *` collisions:** keep each module's public names unique across the
   package (they are today).

---

## 6. Gotchas the split surfaced (don't relearn these)

- **Decorator lines aren't part of `FunctionDef.lineno`.** When relocating a decorated
  tool by AST span, start at `min(d.lineno for d in node.decorator_list)` or you strip
  the `@mcp.tool()` line — leaving the tool **undecorated (unregistered)** in the new
  module and an orphaned decorator in the old one.
- **A missing comma in `__all__` is silent** (`"di" "_rd8"` → `"di_rd8"` via string
  concatenation) and only blows up when some module does `from u6.<mod> import *`.
- **`import time` / `import heapq` / `import re` travel with the code that uses them** —
  e.g. `ctx` needs `time` (for `_wait_command_ready`), `navigate` needs `heapq`,
  `converse` needs `re`/`types`.
- The hermetic tests stub `FastMCP.tool` as identity, so they prove the **import graph**
  but **not real registration** — a live smoke-test (hook + one tool per module) is the
  only thing that confirms tools actually register on the server.

---

## 7. Deploy

The registered MCP server launches from a **separate copy** at
`C:\Z_Temp\tools\dosbox_mcp\` (see `reference_dosbox_mcp_runs_from_tools_copy` in
agent memory), not from the repo. To deploy a change:

```
cp dosbox_u6_server.py            <tools>/dosbox_u6_server.py
rm -rf <tools>/u6 && cp -r u6     <tools>/u6           # copy the WHOLE package
rm -rf <tools>/__pycache__ <tools>/u6/__pycache__      # avoid stale .pyc
# then RESTART the dosbox-u6 MCP server, then smoke-test (a new tool only
# appears after the process reloads)
```

---

## 8. Adding a new module (e.g. Phase 1: the persistent map)

1. Create `u6/<name>.py`; start with `from u6.constants import *` and
   `from u6.ctx import *` (+ `from u6.decode import *` if it needs interpreters).
2. Put its tools behind `@mcp.tool()` and list everything public in `__all__`.
3. Keep it on the right side of the DAG (import only leftward).
4. Add `from u6.<name> import *` to the launcher.
5. Add a stub-driven `tests/test_<name>.py`; if it monkeypatches, patch on
   `u6.<name>`.
6. Deploy (§7) + live smoke-test.

Phase-1 status (2026-06-27): **`mapdata` + `cartography` are built** and slotted in
exactly this way (new leaves, no existing module touched). `mapstore` (the SQLite
chunked world map) was **dropped** — baking both `MAP` and `CHUNKS` makes the terrain a
pure, deterministic function of import-time data, so there is no incremental fill to
persist.

**Step 1 done (2026-06-27): #1 structured queries + affordance A-mechanisms.** The
`affordance` A-set predictors (crank→drawbridge, lever→portcullis, switch→force-field,
bell, door/chest open-close, key/lockpick unlock — ports of `seg_27a1.c`'s
`C_27A1_433D/4479/4672/2A44/2BBC/2D8E/338D`), `predict_use` + the `u6_affordance` tool,
and the `cartography` query trio `u6_at`/`u6_nearest`/`u6_interactables_near` (composing
`predict_use` + `navigate._build_grid`'s live grid for the use-from cell) are all built
and offline-tested (`tests/test_affordance.py` 14/14, `tests/test_query.py` 5/5; full
suite green; 33 tools register clean). The `pat:None` bell/chain row is resolved (338D is
sound + animation only, no world target).

**Live-verified** (deployed to `tools\dosbox_mcp\`, server reloaded, in-castle save
"Monica"): the whole A-set against real RAM — `u6_nearest('lever')`→"opens the portcullis
at (307,384)" and `u6_nearest('crank')`→"opens the drawbridge at (303,385)" (BOTH
qual-links cross-checked vs `u6_nearest('portcullis'/'drawbridge')`; crank head frame
6→"up (closed)"), the locked oaken door's key-qual 14, a closed steel door closed→open,
`u6_at` terrain/object/actor decode, `u6_interactables_near` listing with in-window
use-from face directions, and B/C/TBD rows showing the graceful operate-note (no quest
payload). **Two wrinkles for the B/C slice:** (a) `u6_nearest('door')` substring-matches
'doorway' (the invisible OBJ_12D anchor) — consider exact-word ranking; (b) the shared
handler `C_27A1_5F43` row is tagged C wholesale, so food (bread/meat/cake) reads "category
C" — the real per-type split IS the B/C decode work (outcome stays withheld, so safe).

**Step 2 done (2026-06-27): #2 `u6_use_object`** — closed-loop "go to an object and USE
it" in `act`: resolve target (slot/name) → `_adjacency_action` (carried / other-level /
on-tile / cardinally-adjacent / far) → for 'far', route to a **cardinal** use-from cell
(`cartography._use_from`) via `u6_goto_xy`, then `u6_use(dir)`; forwards `on`. The live
test surfaced + fixed a **`_use_from` reachability bug**: it had picked the *first
walkable* cardinal neighbour, which for a castle door is the **outside courtyard** (passable
grass) the avatar can't reach from inside → `u6_goto_xy` "boxed in". `_use_from` now floods
from the avatar (`navigate._closest_reachable`) and returns the nearest **reachable**
cardinal neighbour (or None) — fixing both `u6_use_object` and the #1 query tools' "act:"
advice. Tests: `test_use_object.py` 9/9 + `test_query.py` 6/6 (incl. a reachable-vs-far-side
case); suite green; **33 tools, no stubs left**. **Live-verified** (castle/Monica): drove
`u6_use_object('0x1a6')` 1 step to the reachable use-from cell + USE → the brazier
extinguished (frame change), re-USE from adjacent (no nav) re-lit it; the now-reachable
`_use_from` correctly omitted the inside-unreachable door.

**Step 3 done (2026-06-27): affordance B + C predictors (+ 4 former-TBD quick wins).**
**B (utility):** `_predict_light` (lit/doused from frame), `_predict_consume` (potion/keg/
torch), `_predict_eat` (food), `_predict_vehicle` (board/mount/dismount), `_predict_play`
(instruments), `_predict_simple` (cow/churn/beehive/fishing/fountain/crystal-ball/telescope).
**C (quest, operate-mechanic ONLY):** `_predict_quest_mechanic` for orb/moonstone/rune/silver
horn/balloon plans/vortex cube — HOW to operate each; the moongate destination, the rune
mantra, the summon, and the **vortex-cube win are deliberately WITHHELD** (blind-discovery;
the handlers were read only to the operate surface). **Manifest correction:** `C_27A1_5F43`
is the **food/eat** handler (the old "incl. 0x87 Orb" note was wrong — the row is all food);
the real **Orb of the Moons is `0x057` → `C_27A1_5789`** (now C). **4 quick wins** off TBD:
weathervane (`0x0D4`), scroll (`0x061`), squeak toy (`0x0A9`), self-toggle (`0x14E`). Tests
`test_affordance.py` 24/24; suite green. **Live-verified** (castle/Monica): food → "eat"
(B), the Orb at type `0x057` → C operate-note "a red moongate opens… where it leads is
yours to discover", braziers → "douses/lights". **10 TBD rows remain** (peripheral handlers,
each carrying its `C_27A1_*`+line; `predict_use` returns the graceful note for them).

**Next:** the remaining **10 TBD rows** (low-value peripheral USE handlers — a later cleanup
slice), and `#3` (give `u6_route` a door-as-passable object overlay so the whole-level
planner can route through doors). See the 2026-06-27 castle-escape play-test in `u6_ai_agent.md`.

---

*Established by the Phase-0 refactor (10 save-points `3cdb4a8`…`b119a48`, 2026-06-26):
`dosbox_u6_server.py` 3407 → 44 lines, tests 15/15 throughout, live-verified.*
