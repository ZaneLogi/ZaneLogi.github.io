# progress — ultima6_clone

The implementation-step ledger (matches `asteroids_clone` / `phoenix_clone`
convention: numbered `I-N` steps, each with a "scope" subsection carrying the
per-sub-step notes that don't fit a commit body). Research-side truth lives in
`research_*.md`; the architecture the steps build to is `architecture_ecs.md`.

**Status:** **I-4 (tile passability) COMPLETE** — `canStandAt(world, x, y, { actorId })`,
a pure predicate that mirrors source's `C_1E0F_000F` for the walks-class branch,
landed alongside the shared `forEachOccupiedCell` footprint utility, the five
new tile-flag accessors it needs, and a HUD cell probe that lights up the real-
data integration (cursor hover → cell coords + flags + verdict + 16×16 highlight).
Deferred class arms (swim/fly/ethereal/amphibian) live in their own later steps;
the signature is source-shaped so they fold into the same predicate's body when
their owning subsystems land. Next: **I-5** — NPC scheduled movement (the
attractive all-new step; consumes the I-3 clock + the I-4 predicate).

---

## Step ledger

| Step | Title | Status |
|---|---|---|
| **I-1** | **terrain on screen** (ECS core + overworld render + demo entities) | **done** |
| **I-2** | **world-data system** — load `OBJBLK*` objects + `objlist` NPCs into real ECS entities (drawn + spatial-indexed; `ObjManager` dissolved) | **done** |
| **I-3** | world clock (game-time tick → schedules; `D_2C55` computed but unconsumed) | done |
| **I-4** | **tile passability** — `canStandAt` primitive (walks-only body) + footprint util + HUD cell probe | **done** |
| **I-5** | NPC scheduled movement (hourly schedules + pathfinding + walking) | **next** |
| I-6 | avatar entity + input + movement + camera follow | planned |
| I-7 | talk trigger (adjacency + key) | planned |
| I-8 | dialog UI window | planned |
| I-9 | conversation VM (adapt legacy `script.js`) | planned |

**Why I-2 is the world-data system.** Loading the real world from `OBJBLK*`/
`objlist` into ECS entities is the clone's core purpose — the reason for choosing
ECS at all — and the heaviest architecture validation: the `SpatialIndex`
(`Map<cell→entity[]>`), the `ObjManager` dissolution (god-object → component
stores + spatial resource + systems), the per-cell chain Z-order, and the
`basetile` (obj_number → tile) decode all land here. It comes first after the
render slice so the ECS architecture is exercised on the real thing as early as
possible, and so I-1d's demo entities are replaced by the genuine populated world.
It folds in what was a separate "NPC entities (drawn)" step — NPCs are just
entities with `AIMode`+`Schedule`; their scheduled *behaviour* is I-5.

**Why I-3 → I-4 → I-5 in this order (NPC movement before the avatar).** NPC
scheduled movement is the prize (it never existed in the legacy port), so it comes
before the avatar — NPCs run on the sim/turn heartbeat (`TurnClock`), independent
of any player. Its two hard prerequisites come first: the **world clock** (I-3)
drives the hourly schedule lookup `C_1E0F_5165` (no clock → no "where should this
NPC be now"), and **tile passability** (I-4) is what the bucket-Dijkstra
pathfinder `C_1E0F_2D37` + movement-legality `C_1E0F_000F` walk on (object-blocking
comes from I-2's `SpatialIndex`). The avatar (I-6) reuses the same passability
primitive, so it slots in cheaply after. See `research_npc_ai.md`.

Steps past I-2 are the visible-progress trajectory, not a committed sub-step plan
— each step's real breakdown is written into its "scope" subsection when it
starts, after pre-impl research for its trickiest part. Deferred-to-later
subsystems (HUD, combat, magic, inventory UI, save/load, audio) fold in after the
β path lands.

---

## I-1 scope — terrain on screen

**Goal:** Britain's overworld rendered on canvas, drag-scrollable, with a few ECS
entities drawn through the real runtime core — so the first visible payoff doubles
as the first integration test of `architecture_ecs.md`'s runtime ground. Design
rationale + the renderer seam are in `research_i1_render_slice.md`; do not restate
them here.

**Renderer seam (locked):** reuse the legacy draw mechanism + terrain feed; drop
the `ObjManager`-coupled collection; lift `drawObject`'s marshal rules into the
RenderSystem *with* the pillar-bug fix (`research_map_render.md:603`); defer the
upload-strategy (full-rebuild for I-1's few entities). Tile flags live in
`TileRegistry` keyed by tile ID; `Renderable = { tileId }`.

**Sub-steps** (each ≈ one save-point commit, browser-verified before the next;
final squash → one `[ultima6_clone] impl I-1 (terrain on screen)`):

- **I-1a — ECS core skeleton.** `World` = generic container: allocator
  (`freeStack` + `generation[]` + `highWater`; `create` / `destroy` / `resolve`),
  component-store registration (plain SoA), 64-bit signature mask
  (`sigLo` / `sigHi`), `query` generator, `store(Comp)` handle, resource `Map`,
  two-list scheduler (`renderSystems` / `simSystems`) + frame fn
  (`poll → decide-turn → maybe-sim → render`). No rendering.
  *Verify:* in-memory test — spawn/destroy/query a few entities; a stale handle is
  caught by generation mismatch; query yields the right ids. Log to console.
  **DONE** — `ecs/world.js` + `ecs/test_core.html` (29/29 checks: generational
  stale-handle + slot reuse, 64-bit signature lo/hi boundary, capacity growth,
  TurnClock turn-driver fires on action/idle and suspends correctly).

- **I-1b — Asset pipeline as ES6 modules + data load.** Copy-then-own the legacy
  decoders (`palette_manager`, `tile`, `lzw_decoder`, `u6map`, `anim_data_manager`)
  as clean ES6 modules; wire the bring-your-own-data flow dropzone → `U6DB`
  (IndexedDB) → decode → `TileRegistry` resource (tile atlas + per-tile flags) +
  `MapLevel` resource (chunks + `worldTileIndex`). No bundled assets.
  *Verify:* checklist gate shows the required files present; log a known tile's
  flags read back from `TileRegistry`.
  **BUILT** — `assets/{lzw,palette,tiles,map,tile_flags,anim}.js`, `u6db.js`,
  `resources/{tile_registry,map_level}.js`, `index.html` + `main.js`. Dropzone
  supports **loose files OR a .zip** (dependency-free `assets/zip.js` using the
  browser's `DecompressionStream('deflate-raw')`; basename-matched against the
  expected set, ultima7 pattern). Plumbing verified (modules import clean, U6DB +
  checklist gate work, zip round-trip 6/6 in `tests/test_zip.html`). **Decode
  VERIFIED on a real U6 zip** — all 11 files unpack, tile at (276,367) = "earth",
  file sizes match formats exactly.

- **I-1c — Terrain render.** `RenderSystem` draws the terrain layer via the reused
  `Shader` (`createLayer` / `updateLayer` / `render`) fed from `MapLevel`;
  `CameraSystem` handles drag-scroll (reuse the `mapOrigin` viewport logic) and
  re-queries terrain on move.
  *Verify (browser):* Britain visible at the default origin `(276, 367)`;
  drag-scroll repaints smoothly; no console/WebGL errors.
  **DONE** — `view/renderer.js` (TileRenderer: consolidated Shader + R8 atlas +
  palette texture; the GR_42-dispatch analog), `resources/camera.js`,
  `systems/{render_system,camera_system}.js`, canvas + rAF loop in `main.js`.
  Britain renders correctly on the user's real data (grass / animated water with
  sandy coastlines / buildings); pan verified (camera move re-fills + redraws); no
  errors. **Source-faithful render mechanics** (raw tile-ids first rendered
  transparent water bases as black): (1) apply the **animdata frame remap** before
  drawing — the legacy/Origin never draw raw water tiles (also gives animated
  water); (2) coastlines are a **two-layer composite** like the legacy/Origin —
  layer 0 base replaces shore tiles 16-47 with their water-base tile
  (`SHORE_TO_WATER`, map_viewer.js:150), layer 1 overlay draws the shore graphic
  on top (animmask-transparent pixels show the water through). Sub-pixel smooth
  scroll via a `u_scroll` uniform. Origin terrain-render comparison captured in
  `research_i1_render_slice.md §8`.

- **I-1d — ECS entity layer (the integration test).** Spawn a few
  `Position` + `Renderable` entities (e.g. a tree / sign from `objtiles.vga`);
  `RenderSystem` walks the `SpatialIndex` → `query(Position, Renderable)` →
  `TileRegistry` flag lookup → **corrected per-tile** layer routing + double-tile
  expansion → entity-layer sub-buffer → reused `Shader`.
  *Verify (browser):* entities render at correct world positions, stay anchored
  while the camera drags, and a double-height tile places its head cell correctly
  (the pillar-bug fix is exercised here).
  **DONE** — `components/components.js` (Position, Renderable),
  `systems/entity_system.js` (`EntityRenderSystem`), demo spawn + present step in
  `main.js`. Entities `query`'d each frame, double-tile expanded (C_1184_35EA), and
  routed **per-tile** to overlay layers 2 (lower) / 3 (top) by each tile's own
  `isTopTile` — the pillar-bug fix. Verified on real data: moongate (double-W) +
  skewer (double-H) render over terrain with transparency, stay anchored on pan;
  layer split 4 low / 1 top confirms per-tile routing. **Simplifications vs Origin
  (deferred to the object system):** layer model instead of the per-cell chain
  Z-order; `query`+viewport-cull instead of a spatial-index walk. Origin object-
  render comparison in `research_i1_render_slice.md §9`.

**Pre-impl research done:** `research_i1_render_slice.md` (render seam),
`research_map_render.md` (pillar-bug root cause + fix), `architecture_ecs.md`
(runtime ground). No further research blocks I-1.

## I-2 scope — world-data system

**Goal:** load the real world (`OBJBLK*` objects + `objlist` NPCs) into ECS entities,
drawn through a spatial-index-driven per-cell painter's render, `ObjManager` dissolved.
Landed as ONE squashed commit (I-2a+b+c) — a correct display needs the data *and* the
faithful render together (Zane's call).

- **I-2a — decoders + load gate.** `assets/{basetile,objblk,objlist}.js` (copy-then-own
  from the legacy `ObjManager`). BYO-data gating: require `basetile`+`objlist`;
  recognise/count `objblk*`. Also fixed an I-1 misclassification (`animdata` +
  `animmask.vga` are render-required, not optional). objlist layout verified against
  `seg_0C9C.c:297-321` (25 sections / 7283 bytes, size-driven read; `D_8C42` is the
  pathfinding buffer, not "per-NPC palette") — see `research_save_load.md`.

- **I-2b — components + SpatialIndex + loader (ObjManager dissolution).** Components
  `ObjType`/`Status`/`Amount` + `Actor` tag; `SpatialIndex` resource
  (`Map<packedXY→entity[]>` + `loadedRegions` + `dirty`). `world_loader.js`:
  `loadActors` (NPCs, eager-resident) + `loadRegion` (OBJBLK per region, demand-loaded,
  idempotent/cached) + `ensureRegionsInView` + `makeStreamingSystem` (camera-driven).
  Only on-map (LOCXYZ) objects/NPCs become entities; containment deferred — the in-file
  assoc index (16-bit, source `GetAssoc`) isn't carried into the ECS (see
  `research_world_data.md`). Verified: 1837 entities (188 NPCs + 1649 objects, CC+CD),
  1488 spatial cells.

- **I-2c — per-cell painter's render + palette cycling.** `WorldRenderSystem`
  (spatial-walk + 4-zone within-cell order: **background → normal → FG-hotspot →
  FG-extension**; each cell's entities drawn in REVERSE load order so the first-loaded
  is on top → NPCs stand on carpets/floor, matching source's chain) replaces I-1d's
  2-zone `EntityRenderSystem`. Two render channels extracted as systems:
  `TileAnimationSystem` (animdata frame-remap → `reg.animDirty`) and
  `PaletteCycleSystem` (the 0xE0–0xFC palette-register shimmer, ported from the legacy
  `colorCycling`). Painter's algorithm decoded from `ShowObject` (seg_1184.c:1651) and
  documented (source + clone) in `research_map_render.md` §"Painter's algorithm".
  **Flag corrections (source-verified, the legacy port misread two):** "isTopTile" =
  `IsTileFor` (Foreground) → renamed **`isForeground`**; "isForceLowerTile" = `IsTileBr`
  (Breakthrough — an AI/movement flag, NOT render) → renamed **`isBreakthrough`**,
  dropped from render; the real render-bottom flag `IsTileBa` (Background) was missing →
  added as **`isBackground`**. Verified on the Lycaeum (`objblkhg`): pillar heads on top
  (2×2 frame-3 → FG extension) and the carpet over the `IsTileBa` platform-edge steps.

**Deferred (noted):** containment/inventory entities; the exact same-Z/same-cell tie
(reverse-load-order matches source for NPC-over-floor + objblk top-first, but a true
same-position tie is merge-sort-undefined in source anyway); the `objlist` `D_8C42`
pathfinding buffer + global block (feed I-3/I-5).

## I-3 scope — world clock

**Goal:** game-time advances per turn; the date/time cascades minute → hour → day →
month → year; `D_2C55` (sun-strength byte) is computed and stored on the clock for
future consumption; an hourly hook list lets I-5 register its schedule re-check. **No
ambient-light render** at I-3 — the visible day/night transition on the map lands
in a later step alongside the lighting subsystem (see below). A small dev/cheat HUD
overlays the canvas so the clock is visible + manually steppable across the
remaining impl steps.

**Why no ambient-light render at I-3.** Pre-impl source read (2026-05-30) corrected a
misleading research-doc summary: `D_2C55` is the SUN-STRENGTH **input** to a per-cell
flood-fill lighting model, NOT a render-side ambient tint. A faithful port requires
`AreaFlags[][]` + `AreaLight[][]` + `C_1100_0131` BFS + per-cell tile substitution
(`TIL_0FF` / `TIL_1BC`) + obscurity overlay pass — all of which need (a) a
player-position source (avatar from I-6), (b) richer tile flags than I-1/I-2 decoded
(`IsTileWin`, `IsTileOpa`, `GetTileLight`), and (c) a render-path change. Defer to its
own later step. Full decode: `research_map_render.md` §"Lighting + visibility model";
correction trail: `research_game_loop.md` §"Time-advance" phase 9 + key takeaway.

**In scope:**

- `WorldClock` resource: `Time_H`, `Time_M`, `Date_D / M / Y`, `D_2C55` (stored).
- `WorldClockSystem` (sim-list): per turn, call `clock.advance(1)`. Cascade per
  `seg_0A33.c:853-885`. Recompute `D_2C55` per `seg_0A33.c:918-931`.
- Hourly hook list: `onHour(cb)` registration on the clock; hooks fire once per
  hour-rollover during `advance()`. Ships empty at I-3; I-5's NPC schedule
  re-check (`C_1E0F_5165`) is the first registrant.
- Dev/cheat HUD: corner overlay showing `Year Y · M D · HH:MM · ☀ D_2C55 ·
  hours fired N` + controls (pause/resume the turn-driver, ±10m and ±1h time
  jumps). `+1h` matches source's Alt+215 debug hotkey (`C_0A33_1355(60)`).
  Always-visible during development; hide-vs-toggle (e.g. backtick) revisited
  when the real status panel ports.
- Verification: live on the canvas via the HUD (clock ticks, ± jumps + rewind,
  pause freezes auto-advance, paused border tint) plus `tests/test_clock.html`
  (20/20 for the pure data class).

**Out of scope (deferred to later steps):**

- Ambient light render — its own later step after I-6 (avatar exists), with its own
  pre-impl research. ~1-2 days on its own.
- Spell-FX timers, powder keg, eruption — depend on combat / spell-FX components
  not landed.
- Per-minute status-effect rolls — depend on combat components.
- Torch fuel / ring procs / storm cloak rolls — depend on inventory components.
- Sundial tile rewrite, moon phase recompute, moongates spawn/despawn — each its
  own small subsystem; defer.
- Wind reroll — no ships.
- Music hooks — no audio.
- Real status panel — `seg_0A33.c:933-936` `CON_printf(DateMsg, ...)`. The
  dev/cheat HUD substitutes during development; the status-panel port is its
  own step.

**Estimate:** ~1-2 hours of focused work — beyond the small DOM HUD, no new render
path and no new asset decode; the two-clock architectural seam (`TurnClock`
resource + `frame()` orchestration) is already in `ecs/world.js` from I-1a, so
I-3 is purely additive.

## I-4 scope — tile passability

**Goal:** `canStandAt(world, x, y, { actorId })` — a pure predicate, NOT a
scheduler-registered system, called by I-5 (NPC path step) and I-6 (avatar
input) to decide whether a single tile move is legal. Mirrors source's
`C_1E0F_000F` (`seg_1E0F.c:66-235`); the walks branch only — the signature is
source-shaped (covers any monster class), the body grows by adding
`if (swims) …` arms in-place when later subsystems bring those classes online,
without touching callers (`research_npc_ai.md` §"Movement legality").

**Sub-steps** (each ≈ one save-point commit, squashed at the end → one
`impl I-4`):

- **I-4a — flag accessors (walks subset).** Five accessors on `TileFlags` +
  passthroughs on `TileRegistry`: `isTerrainImpassable` / `isTerrainWet` /
  `isTerrainWall` / `isTerrainDamage` (TerrainType plane @ 0x0000) +
  `isTileIgnore` (D_B3EF plane @ 0x1400). Source-name comments on each line
  preserve the citation (`IsTerrainImpass`, `IsTileIg`, etc.) per
  [[expand-source-abbreviations]] — JS gets the full word, comment carries
  the cryptic source short-form. 32 unit cases in
  `tests/test_passability.html` cover plane isolation + last-tile (2047)
  boundary.

- **I-4b — shared footprint utility.** Extract the 2×2 expansion previously
  inline in `world_render_system.js` into `systems/tile_footprint.js`:
  `forEachOccupiedCell(reg, tile, anchorCol, anchorRow, cb)`. `WorldRenderSystem`
  switches to it; no behavior change. Shared by two consumers — render's
  painter zones (needs the per-cell tile id + `isExt` flag) and passability's
  "what blocks at (x,y)" iteration (only needs the cell coords). Render
  verified pixel-identical on Britain after the extract.

- **I-4c — `canStandAt` primitive (walks-only body).** New
  `systems/passability.js`. Iterates the 4 candidate anchor cells whose 2×2
  footprint could cover `(x,y)`; per entity, calls `forEachOccupiedCell` to
  find the per-cell tile that actually lands on `(x,y)`; checks Breakthrough
  (short-circuit unless `IsTileIgnore`) + object-tile `IsTerrainImpassable`
  + NPC always-blocks. Skip-self via `actorId` (entity handle). Initial
  function name `canWalk` was renamed to `canStandAt` mid-step to match
  source's broader semantic — the walks-only body grows into the full
  predicate by adding `if (swims) …` / `if (flies) …` arms inside, rather
  than spawning sibling `canSwim` / `canFly` predicates that would leak the
  class switch into every caller. 19 synthetic-fixture unit cases:
  empty-cell pass, impassable terrain block, breakthrough-overrides-terrain,
  impassable object block, door open vs closed (via per-frame tile flags,
  no `OBJ_xxx` special), NPC blocks, skip-self, 2×2 anchor blocks all 4
  body cells + leaves 4 surrounding cells free, Breakthrough+Ignore stack
  interaction with NPC, Breakthrough-without-Ignore short-circuit, neighbour-
  cell isolation.

- **I-4d — HUD cell probe + highlight.** Real-data integration check for
  I-4c, paired with a small overlay so the readout is self-evidencing.
  Pointer hover updates a dev-HUD line `(x,y) terrain t#N[flags] · objs:
  [t#M[flags] …] · stand=YES/NO` (red on blocked, green on pass) AND
  positions a 16×16 yellow rectangle with a dark halo at the probed cell.
  Hides during drag-pan (probe text freezes too), resumes on the next
  hover, clears on canvas leave. Removed `cursor: grab` / `grabbing` from
  `#screen` — the grab hand obscured the 16×16 highlight at this scale; a
  debug-visibility tradeoff, default arrow cursor in dev; the proper cursor
  scheme is decided alongside the input model when I-6 lands. **Kept across
  the remaining impl steps** alongside the I-3 clock HUD — both are removed
  or gated behind a debug toggle when the real status panel ports
  (`seg_0A33.c:933-936`) and game UI lands; see `CLAUDE.md` §"Modern-browser
  UX".

**Deferred (each owns a later step, with subsystem owner noted):**
- swim / fly / amphibian / ethereal monster-class branches — boats → swim
  (post-I-6 boats subsystem); combat → fly + ethereal; folded INTO
  `canStandAt`'s body as class arms, NOT sibling functions
- party-member pass-through (`D_17B2`) — no avatar party until I-6+
- sacred-quest gate (`OBJ_1A0` + `VarInt['Q'-0x37]`) — no quest flags yet
- fence directional pass (object's `TerrainType` bits `80/40/20/10`)
- damage-tile flag (`TERRAIN_FLAG_08` + `D_17A9`) — no combat / hazard system
- 5-type NPC-furniture overlap exception list — no SIT/EAT/PLAY worktypes yet
- door-opening mechanism (the predicate already handles open vs closed
  transparently via per-frame tile flags; the open/close *trigger* logic is
  its own subsystem)

**Durable source findings (worth recalling before touching this code again):**
- **`IsTileIgnore` is the "don't short-circuit on Breakthrough" flag**
  (`seg_1E0F.c:142-146`). A Breakthrough tile grants pass + breaks the cell
  scan UNLESS Ignore is also set, in which case the scan continues and a
  later blocker (e.g. an NPC at the same cell) can still block.
- **Door open/closed is per-FRAME tile flags, NOT an `OBJ_xxx` special
  case.** Closed-door frames have `IsTerrainImpassable` set; open-door
  frames don't. `canStandAt` handles both transparently via the flag-bit
  check on `Renderable.tileId` — when door-opening lands, updating an
  entity's frame automatically updates both render and passability.
- **NPCs always block at `c_04ed`** in source. A 5-type furniture
  exception list exists in source (chairs/tables for SIT/EAT) but is
  dropped at this scope — none of those overlap types are in scope until
  the SIT/EAT/PLAY worktypes land.
- **Per-cell iteration order matches source's chain head→tail**
  (newest-insert first via `FindLoc`/`NextLoc`). Our `ents[]` is in load
  order (oldest at index 0), so iterate REVERSE — same direction as render.
- **2×2 footprint expansion at the QUERY site** (4 candidate anchor cells:
  `(x,y)`, `(x+1,y)`, `(x,y+1)`, `(x+1,y+1)`) replaces source's
  `MapObjPtr` register-at-each-cell trick. Our `SpatialIndex` stores
  entities at their anchor only, so both render and passability expand at
  lookup time via `forEachOccupiedCell`.

**Verification:**
- `tests/test_passability.html`: 51/51 (32 flag accessors + 19 canStandAt cases)
- HUD probe live on Britain on real `OBJBLK*` data: walls at (289,349) /
  (311,362) show `terrain t#156/146 [impass+wall] · stand=NO`; passable
  cells show `stand=YES`; the Avatar start cell (307,352) correctly blocks
  via 2 stacked objects despite passable terrain
- Render unchanged after the I-4b extract (visual check on Britain)
- Drag-pan still works after the cursor + `dragging`-class cleanup; the
  highlight + probe text correctly freeze during drag and resume after

**Estimate vs actual:** estimated ~2-3 h; landed in ~3-4 h including the
`canWalk` → `canStandAt` rename mid-step (a source-faithfulness discussion
that changed the function's naming scope) and the probe-highlight visibility
iteration (border 1px → 2px + dark outline + cursor swap to default arrow).
