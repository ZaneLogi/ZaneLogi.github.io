# progress — ultima6_clone

The implementation-step ledger (matches `asteroids_clone` / `phoenix_clone`
convention: numbered `I-N` steps, each with a "scope" subsection carrying the
per-sub-step notes that don't fit a commit body). Research-side truth lives in
`research_*.md`; the architecture the steps build to is `architecture_ecs.md`.

**Status:** **I-5 (NPC schedule resolution) COMPLETE** — narrowed mid-flight
from the original "NPC scheduled movement (hourly schedules + pathfinding +
walking)" framing to **schedule-resolution-only**: snap eligible NPCs to
their slot's `xyz` on each game-hour rollover, with no pathfinding, no
facing/frame updates, and no `NPCMode` plumbing. Day-long world-clock sweep
shows sensible snap counts at meal/sleep boundaries; the dev HUD's stats
line + cell probe surface live activity + per-NPC slot details. Six
save-point commits (I-5a parser → I-5f HUD probe). A post-I-5 fix in
`WorldRenderSystem` reworked the within-cell sort from reverse-load-order
to a type-based z-priority (`Actor=1`, else=0) after Lord British rendered
under his throne — the rule is now decoupled from entity-index recycling,
ready for the object-interaction phase. See I-2c scope (updated) for the
current painter rule and the new I-5 scope section for the slice that
landed + the deferred items (pathfinding, action-driven pose sprites,
first-tick alignment, NPC names, fgExt-source-faithful ordering).

Next: **I-6** (inventory data layer) — first step of a re-planned
post-I-5 trajectory that pulls **inventory data + UI substrate** ahead
of **avatar movement**. The UI substrate (formerly "I-8 dialog UI
window") is now broadened to be the shared foundation for every later
UI surface (object inspector, status panel, save/load, spell select,
conversation); its first consumer is the object inspector (I-7) — the
heaviest UI consumer in primitive usage, so the substrate is battle-
tested by a real surface rather than aspirationally general. See the
explainer paragraph below the ledger for the full rationale + binding
modal-stack / turn-driver-suspension design decisions.

---

## Step ledger

| Step | Title | Status |
|---|---|---|
| **I-1** | **terrain on screen** (ECS core + overworld render + demo entities) | **done** |
| **I-2** | **world-data system** — load `OBJBLK*` objects + `objlist` NPCs into real ECS entities (drawn + spatial-indexed; `ObjManager` dissolved) | **done** |
| **I-3** | world clock (game-time tick → schedules; `D_2C55` computed but unconsumed) | done |
| **I-4** | **tile passability** — `canStandAt` primitive (walks-only body) + footprint util + HUD cell probe | **done** |
| **I-5** | **NPC schedule resolution** — hourly slot snap (pathfinding + pose sprites deferred) | **done** |
| **I-6** | **inventory data layer** — CONTAINED/INVEN/EQUIP entities + `Container`/`ContainedIn` components; resolve OBJBLK's in-file `GetAssoc` against live entities (deferred from I-2). No UI. | **next** |
| I-7 | UI substrate + object inspector view (first surface) — modal stack + input routing + turn-driver gating + list-with-cursor + atlas-icon DOM rendering | planned |
| I-8 | avatar movement + NPC pathfinding — `C_1E0F_2D37` shared by both consumers; avatar input + camera follow + facing-on-step + facing-on-snap fold in | planned |
| I-9 | object-action dispatch core — `Map<ObjectType, handler>` registries per action (USE / GET / LOOK / DROP); minimum handlers for "walk around without getting stuck" (door USE, LOOK on any, GET/DROP via inventory) | planned |
| I-10 | talk trigger — adds TALK as a case in the I-9 dispatch + adjacency-pick logic | planned |
| I-11 | dialog window — second surface on the I-7 substrate; opens when TALK fires | planned |
| I-12 | conversation VM (adapt legacy `script.js`) — β reached: walk + talk works end-to-end. Give/take opcodes work because I-6 inventory data exists. | planned |
| I-13 | status panel — third surface on the substrate; replaces the dev HUD's clock readout | planned |
| I-14 | object-action handlers expansion — fills in the rest of `seg_27a1.c`'s dispatch table (spellbooks / moonstones / instruments / etc.); each handler tied to its owning subsystem when that subsystem lands | planned |

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
comes from I-2's `SpatialIndex`). The avatar reuses the same passability primitive
when its movement step lands (I-8 in the re-planned trajectory). See
`research_npc_ai.md`.

**Why the post-I-5 trajectory re-plans inventory + UI ahead of avatar (decided
2026-05-31).** The originally-scoped "I-8 dialog UI window" is rescoped into a
broader **UI substrate** (modal stack + input routing + turn-driver gating +
list-with-cursor + atlas-icon DOM rendering) shared by every later UI surface
(object inspector, status panel, save/load, spell select, conversation). Its first
consumer is the **object inspector** (I-7) — the heaviest UI consumer in primitive
usage, so the substrate is battle-tested by a real surface rather than
aspirationally general. To feed the inspector, the **inventory data layer** (I-6)
lands first: parse CONTAINED/INVEN/EQUIP records into entities, resolve OBJBLK's
in-file `GetAssoc` against the live entity space (the bit deferred from I-2).
Avatar movement + NPC pathfinding then fold into one step (I-8) — both consumers
share `C_1E0F_2D37` machinery, plus facing-on-step (pathfind walker) + facing-on-
snap (schedule trigger) want the same direction logic.

**Object-action dispatch (I-9) precedes talk trigger (I-10).** U6 doesn't have
"USECODE" in the Ultima 7 sense — instead source uses two distinct mechanisms:
a stack-based bytecode VM at `seg_1703.c` for NPC dialogue (the conversation
VM, I-12) and a hardcoded C dispatch table at `seg_27a1.c` for object actions
(USE / GET / LOOK / DROP / PUSH / SEARCH per `OBJ_xxx`). The object-action
dispatch is the more general primitive: TALK is just one case in the same
"press a key, do X to the entity in front of me" pattern that USE/GET/LOOK
share. So I-9 lays the dispatch infrastructure with a minimum handler set
(door USE, generic LOOK, GET/DROP via inventory) — enough to walk around
without getting stuck. I-10 then adds TALK as a new case alongside, plus the
adjacency-pick logic ("which NPC am I facing?"). I-14 (post-β) fills in the
rest of `seg_27a1.c`'s table (spellbooks → `C_27A1_2D8E`, moonstones →
`C_27A1_3425`, instruments → `C_27A1_5935`, etc.), each gated on its owning
subsystem becoming available.

The β path (walk + talk) reaches at **I-12**, later than the prior plan, but
the conversation VM lands with full give/take semantics rather than stubbed
inventory opcodes; the world feels alive sooner via inventory inspection
before agency exists; and the object-action dispatch is in place from I-9 so
β includes "USE on doors works" rather than requiring a follow-up step.

**Binding design decisions for the substrate (decided 2026-05-31).**
- **Object inspector, not container view.** ONE inspector surface for any
  entity — sword, NPC, barrel, chest. Identity (sprite + name + type) always
  shown; contents-list area conditional on `Container` component (empty/absent
  for non-containers).
- **Modal-stack pattern for nested containers** — opening a container child
  pushes a new inspector modal on top of the existing stack (not inline tree
  expansion). Each modal lists ONE level of children; the window manager's
  z-stack handles the rest. Cleaner widget, matches source's "open this then
  open that" interaction model.
- **Turn-driver suspended for the entire modal-stack lifetime.** When any
  inspector opens, `TurnClock.suspend()` fires; every sim-system activity
  (schedule snaps, NPC moves, clock advance — all turn-driver-gated work)
  pauses until every modal in the stack closes, then `TurnClock.resume()`.
  No schedule snaps fire while the player inspects. Matches source's
  "world pauses during inspection" behavior and the existing dev HUD's
  pause button mechanism.

Steps past I-2 are the visible-progress trajectory, not a committed sub-step plan
— each step's real breakdown is written into its "scope" subsection when it
starts, after pre-impl research for its trickiest part. Deferred-to-later
subsystems (combat, magic, save/load, audio) fold in after the β path lands.

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
  (spatial-walk + 4-zone cross-cell order: **background → normal → FG-hotspot →
  FG-extension**) replaces I-1d's 2-zone `EntityRenderSystem`. Within-zone
  order: for each visible cell, gather all contributions (own anchor + the 3
  neighbor anchors whose 2×2 footprint can reach in), then sort ascending by a
  **type-based z-priority** (`Actor=1`, else=0; JS stable sort keeps ties in
  scan order) before emitting to the zone lists — `Actor` entities end up
  drawn last within zone = on top of furniture/floor objects. This rule
  replaces an earlier "reverse load order" iteration that broke for
  double-tile extensions reaching IN from a neighbor (the LB-throne bug
  surfaced post-I-5). See `research_map_render.md §"Painter's algorithm"` for
  the full source-vs-clone comparison + the deferred fgExt-source-faithful
  rule. Two render channels extracted as systems:
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

## I-5 scope — NPC schedule resolution

**Goal:** at each game-hour rollover, NPCs whose schedule has a slot for that
hour snap to the slot's `xyz`. Position-only — no pathfinding, no facing/
frame update, no AI-mode plumbing. Narrower than the step-ledger's original
"NPC scheduled movement (hourly schedules + pathfinding + walking)" framing;
the visible payoff (NPCs at scheduled positions across a game-day) ships
without the pathfinding subsystem source mirrors at this trigger.

**Scope narrowing — what was deferred and why.** Source's `C_1E0F_5165`
(seg_1E0F.c:2264-2294) does TWO things on hour-tick: (a) resolve the slot
and (b) set `NPCMode = AI_FINDPATH` to kick pathfinding toward the slot's
xyz. Frame/facing updates and action-driven pose sprites (sleep/sit/eat)
come from pathfinding (frame-during-walk) + the AI dispatch reading
`NPCMode` on arrival, NOT from the schedule trigger itself. Landing all of
that at I-5 would be a multi-subsystem commit; the schedule-resolution-only
slice composes cleanly with what already exists (I-3 onHour + I-4
`canStandAt`) and produces a self-evident result (advance the clock → see
NPCs jump to new positions). Pathfinding, facing updates, and pose sprites
are I-6+ territory.

**Sub-steps** (each ≈ one save-point commit, browser-verified before the
next):

- **I-5a — `assets/schedule.js` parser** + `tests/test_schedule.html`.
  Decode the 257 u16-LE pointer table + N×5-byte `tSchedule` records per
  `seg_0C9C.c:285` + `u6.h:469`. Exposes raw `pointers` plus `byNpc[256]`
  convenience view + `AiAction` schedule-tier constants. Two data quirks
  surfaced and documented in the parser header: unused NPCs may have
  `pointers[n] > totalSlots` (empty-range sentinel; source's resolver loop
  tolerates `start > end` naturally); `AI_9A 0x9a` is a legitimate
  schedule action despite `ai.h`'s "RETREAT?" comment. 18 structural
  checks pass on real data (563 slots, 178 scheduled NPCs). `schedule`
  added to `main.js` REQUIRED so the dropzone extracts it.

- **I-5b — `resources/schedules.js` + pure resolver.**
  `Schedules.resolveSlotAt(npcId, hour, dayOfWeek)` mirrors
  `C_1E0F_5165`'s backward scan: highest-indexed slot whose hour matches
  AND whose day field is 0 (wildcard) or matches `dayOfWeek` wins.
  Returns null when nothing triggers — between-event hours are no-ops,
  consistent with source (NPC stays in its last-set mode). Static
  `dayOfWeek(Date_D)` helper for the `((D-1)%7+1)` conversion. 25 pure
  unit tests cover empty NPC, any-day match, day-specific match/miss,
  between-events miss, duplicate-key backward-scan precedence, wildcard
  fallback, `slotIndex` correctness, DoW wraparound, idempotency.

- **I-5c — `Schedule { npcId }` component + load-time tagging.**
  Component in `components/components.js`. `main.js` decodes the SCHEDULE
  file via `Schedules.fromBytes` and registers the resource; `loadActors`
  in `world_loader.js` tags NPCs whose objlist slot has schedule data via
  `schedules.hasSchedule(a.id)`. Result: 188 spawned NPCs, 176 tagged (2
  of the 178 scheduled NPCs are off-map / not LOCXYZ — no entity to tag,
  as designed). `loadActors` return shape now `{ actors, scheduled }`.

- **I-5d — Active-area predicate (OBJBLK residency).**
  `SpatialIndex.hasRegionAt(x, y)` — is the OBJBLK region containing
  `(x, y)` currently loaded? Method on `SpatialIndex` (per the
  methods-on-state-objects feedback memory) since it reads a single field.
  Inlines `world_loader`'s `regionId(col, row)` formula to stay
  self-contained; cross-checked against the exported `regionId` in tests
  across all 64 `(col, row)` pairs. 24 unit tests cover empty set,
  single-region, multi-region, boundaries between adjacent regions,
  world-edge region (7, 7). The semantics — "NPCs whose current region
  isn't loaded are skipped silently" — relies on our loader's monotonic
  `loadedRegions` set (never unloaded for the page session); the working
  set therefore grows as the player explores, eventually saturating at
  all 256 NPCs.

- **I-5e — NPC schedule system.** `systems/npc_schedule_system.js`:
  hooks `WorldClock.onHour`. Each tick, iterate `(Schedule, Position)`
  entities; gate by `SpatialIndex.hasRegionAt(currentPos)` (NPCs in
  unloaded regions are silently skipped); resolve slot via
  `Schedules.resolveSlotAt`; skip if null trigger; check `canStandAt`
  for the target; if OK, snap pos and update `SpatialIndex`. Per-tick
  stats (`snapped / alreadyAtTarget / blocked / inactive / noTrigger`)
  exposed via the returned object, mutated in place each tick so the
  I-5f HUD can read live state.

  Two small infra additions made this step possible:
  - `World.handleOf(i)` — reverse of `resolve()`, packs index +
    generation back into a handle. Needed by callers that get an index
    from `query()` but need a handle for spatial ops or `canStandAt`'s
    `actorId`.
  - `SpatialIndex.remove(x, y, handle)` — splices an entity out of its
    cell when it moves. Drops empty cells so `cells.size` stays
    meaningful.

- **I-5f — Dev HUD schedule probe.** Two surfaces on the existing dev
  HUD:
  - **(A) NPC stats line** — dedicated `<div id="npc-stats">` between
    the time-op buttons and the hover probe:
    `schedule @ hour HH: snap N / block M / idle K / inactive L`. Reads
    `npcScheduleStats` every frame.
  - **(B) Cell probe schedule line** — when a hovered cell holds an
    NPC entity with a `Schedule` component, the probe appends a second
    line: `NPC #<id> "<name>" · slot N: <ACTION> (hour H, day D) →
    (x,y,z) · active=YES|NO`. Reverse-maps the action byte to its
    `AiAction` name; reads `Schedules.resolveSlotAt` for the current
    `(hour, dayOfWeek)`, falling back to `no slot at hour H day D`
    between triggers. NPC name comes from objlist (party members only;
    `"(undefined)"` for everyone else until name-loading lands).

**Post-I-5 Z-order fix** (queued during I-5c verification when Lord
British rendered UNDER his throne; fixed immediately after I-5f
landed): the per-cell normal-zone emits followed scan order, so the
throne's `isDoubleWidth` extension from (308, 348) reaching back into
(307, 348) got pushed to the flat normal list AFTER LB's own emit at (307, 348)
and drew on top. Fix in `systems/world_render_system.js`: per-cell
gather (own anchor + 3 neighbors whose 2×2 footprint could reach in)
then sort by **type-based z-priority** (`Actor=1`, else=0) before
emitting to zone lists. Decouples Z-order from entity index so freed-
slot recycling in the object-interaction phase can't break it (the
"Option A" forward-compatible design discussed in chat). Header
comment in the file carries the source ref (seg_1184.c:1651
`ShowObject`) + the deferred fgExt source-faithful rule (newer at
chain tail = top — rare in u6 data, revisit if observed). The I-2c
scope text above now describes this current rule; the cross-
source comparison is in `research_map_render.md §"Painter's algorithm"`.

**Verification:**
- Pure unit tests: `tests/test_schedule.html` (18/18 structural),
  `test_schedules.html` (25/25 resolver), `test_active_area.html`
  (24/24 predicate).
- Live world: day-long sweep across hours 9-24 + 00:00 shows sensible
  snap counts at meal/sleep boundaries (noon snap=9, evening snap=11,
  late-night snap=2). No errors in console.
- HUD probe at hour 8 reports
  `NPC #5 "(undefined)" · slot 0: SIT (hour 8, day 0) → (307,348,0)
  · active=YES`, with LB rendered visibly on top of his throne after
  the Z-order fix.

**Deferred (each owns a later step):**

- **Pathfinding** — bucket-Dijkstra walker per `C_1E0F_2D37`. Lands at
  I-6 or later (avatar movement needs it too); until then, the
  schedule snap is teleport-not-walk.
- **`NPCMode` component + action-driven sprite swap** — sleep/sit/eat
  pose sprites need an `NPCMode` (or equivalent) field on the NPC
  entity that the schedule system can set on snap, and a render-side
  mapping from action → frame/sprite. The four `AI_STAND_*` actions
  could be wired cheaply (action → frame 0..3 = N/E/S/W) before the
  full sleep/sit/eat rework if a pose-correctness pass becomes worth
  doing.
- **First-tick alignment on game-load.** Currently NPCs stay at
  OBJLIST positions until the first hour-tick crosses an event.
  Acceptable for the I-5 demo (OBJLIST positions are close-enough to
  schedule). Real save/load will need to restore `SchedIndex` per the
  savegame.
- **NPC names** — `"(undefined)"` in the probe is because objlist's
  name section only fills party members. Real NPC names live in a
  separate string table (probably `LZNAMES`) not yet decoded.
- **Multi-fgExt-per-cell source-faithful ordering** — within-zone sort
  for fgExt uses the same z-priority as normal/fgHot, which inverts
  source's "chain tail = top" rule. Rare in u6 data; revisit if
  observed.

## I-6 scope — inventory data layer

**Goal:** off-map item entities (NPC inventory + object containers)
live in ECS with `Container` / `ContainedIn` components, resolved
from each OBJBLK region's records (the `GetAssoc` rewrite source's
`__ObjectsDeserialize` does in one pass at `seg_1184.c:1385-1390`).
No UI surface — the inspector view is I-7's first consumer.

**Sub-steps** (each ≈ one save-point commit, browser-verified before
the next; squashed for the final commit):

- **I-6a — components + INVEN/EQUIP wiring.** Add `Container`
  (marker) + `ContainedIn { holder: Float64Array, equipped:
  Uint8Array }` to `components/components.js`. `objblk.js` decoder
  exposes 16-bit `assoc` (source's `*(unsigned int *)&ObjPos[i]`);
  the legacy port's 10-bit `owner = this.x` read works for NPC slot
  IDs (≤ 8 bits) but is lossy for CONTAINED in-file indices (up to
  12 bits). New `resources/actor_index.js` holds `Map<slotId →
  handle>`, populated by `loadActors`. `loadRegion` spawns items
  for records with bit 0x10 set (INVEN=0x10, EQUIP=0x18), resolves
  the holder via `ActorIndex.get(rec.assoc)` (NPC slot IDs are
  stable across files per source's `if(CONTAINED)` guard at line
  1389 — INVEN/EQUIP keep their on-disk assoc). Items spawn
  *without* `Position`, so `SpatialIndex` and `query(Position)`
  skip them. Holders get `Container` idempotently. `inventoryOf(
  world, handle)` helper exposed via `window.__U6` for console
  inspection. **Verified:** 42 ContainedIn items in initial view;
  party dump Avatar / Dupre / Shamino / Iolo = 3 / 9 / 9 / 12;
  Dupre splits 5 equipped + 4 carried; SpatialIndex unchanged at
  1488 cells.

- **I-6b — CONTAINED resolution.** Two-pass `loadRegion`: pass 1
  spawns every record and records its in-file index → handle
  (LOCXYZ + INVEN/EQUIP attach during pass 1; CONTAINED entities
  created but `ContainedIn` deferred). Pass 2 walks again, looks
  up each CONTAINED record's `assoc` in the in-file-index map,
  attaches `ContainedIn{holder, equipped:0}`, idempotently flags
  the parent `Container`. Adapted from source's single-pass
  `_6000[GetAssoc(si)]` (`seg_1184.c:1389-1390`) which relies on
  parents-come-first ordering plus a zeroed scratch buffer; modern
  JS has no RAM constraint, so explicit two-pass is the cheaper
  read. **Verified:** 117 container-held items, no orphan
  warnings; 12 sample object-containers including a 5-item chest
  at `(293,351,0)`.

- **I-6c — page chrome cleanup.** Mostly stale-log eviction now
  that I-1b / I-2b are several steps behind: delete `diagnostics()`
  (palette / mapLevel / tile-87 / sample flags / "I-1b plumbing
  complete") and `verifyWorld()` (I-2b entity counts / spatial
  cells / cell `(307,352)`) plus their two call sites. Surviving
  on-page log = 5 lines (Decoding / Loaded N NPCs / Loaded N
  objects+items+container-held / I-6 inventory summary / Rendering
  started). Detailed I-6 console-group dumps stay in DevTools
  where they don't crowd the page. UI: collapse Required panel
  into a `<details>` element (auto-closes when ready); fold intro
  paragraph into the dropzone; canvas 768×512 → 1024×640;
  relocate dev HUD `top: 12px` → `bottom: 12px` (the old position
  overlapped the now-shorter dropzone area).

**Deferred (noted):** `main.js`-side logic refactor —
`startRender()` is at ~235 lines and mixes 6 concerns
(composition, dev HUD, schedule-stats line, drag-to-pan, hover
probe, rAF loop). Refactor pairs with I-7's UI substrate when the
inspector lands (`view/dev_hud.js`, `view/dev_probe.js`, `view/
inspector.js` are the natural cuts already legible in
`startRender`). Doing it now would buy nothing.
