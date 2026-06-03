# progress — ultima6_clone

The implementation-step ledger (matches `asteroids_clone` / `phoenix_clone`
convention: numbered `I-N` steps, each with a "scope" subsection carrying the
per-sub-step notes that don't fit a commit body). Research-side truth lives in
`research_*.md`; the architecture the steps build to is `architecture_ecs.md`.

**Status:** **I-9 (NPC pathfinding) COMPLETE — sub-steps a–h landed
(2026-06-01/02); i dropped.** NPCs now WALK to their schedule slots when near the
player and **TELEPORT to them when far** (off-screen), then **settle into their
arrival worktype** (stand/guard facing the right way): a per-NPC bucket-Dijkstra over
a 40×40 window, with edge-seek + re-plan for far slots, humanoid door pass-through, a
teleport-to-previous-target catch-up on reschedule, `__AtDestination` worktype/facing
on arrival, the off-area teleport + player-distance gate, and first-tick schedule
alignment at load. 121/121 unit tests (`tests/test_pathfinding.html`) + live
preview-eval verification on real Britain data. Steps I-1 → I-8 complete; I-9 a–h
committed.

**I-9i (dev-HUD path overlay) DROPPED (Zane 2026-06-02).** A visual path trail is
fancy-not-must: live `preview-eval` of `window.__U6` / the `Paths` resource already
exposes any NPC's full path state (it's how I-9h was verified), so the overlay would
only save Claude keystrokes on a debug task already covered. A real spatial-debug need
later is a clean standalone add (a dedicated debug layer), not something bolted onto
the probe cursor. **So I-9 is complete through a–h.** One **deferred** loose end (not
blocking, → post-I-9 audit): idle-advance interval tuning.

**No squash for I-9 (Zane's call 2026-06-02).** Unlike the sibling-project
convention, the I-9 sub-step commits are KEPT as separate commits — each is a
meaningful, individually-verified milestone worth preserving in history. See the
I-9 scope section for the per-sub-step breakdown + SHAs.

**Prior:** I-8 (avatar movement + party follow) complete — the Avatar walks
Britain 8-dir, camera follows, party trails via `MoveFollowers`. NPC pathfinding
was split out into I-9 (decided 2026-06-01); the two share only the single-step
move kernel (`canStandAt` + `insertAtHead` + facing), not the path builder.

Next: **I-10** (object-action dispatch core) — scoped 2026-06-03, see the I-10
scope section below. The **post-I-9 deviation audit** (move-point economy, clock
tuning, the idle-heartbeat keep-vs-revert fork, I-9f as a removal candidate — see
the audit subsection in I-9 scope) is **deferred to after I-10** (Zane's call
2026-06-03 — build the player-interaction surface first, audit NPC movement later).

---

## Step ledger

| Step | Title | Status |
|---|---|---|
| **I-1** | **terrain on screen** (ECS core + overworld render + demo entities) | **done** |
| **I-2** | **world-data system** — load `OBJBLK*` objects + `objlist` NPCs into real ECS entities (drawn + spatial-indexed; `ObjManager` dissolved) | **done** |
| **I-3** | world clock (game-time tick → schedules; `D_2C55` computed but unconsumed) | done |
| **I-4** | **tile passability** — `canStandAt` primitive (walks-only body) + footprint util + HUD cell probe | **done** |
| **I-5** | **NPC schedule resolution** — hourly slot snap (pathfinding + pose sprites deferred) | **done** |
| **I-6** | **inventory data layer** — CONTAINED/INVEN/EQUIP entities + `Container`/`ContainedIn` components; resolve OBJBLK's in-file `GetAssoc` against live entities (deferred from I-2). No UI. | **done** |
| **I-7** | **UI substrate + object inspector view** (first surface) — modal stack + input routing + turn-driver gating + list-with-cursor + atlas-icon DOM rendering; `I` hotkey opens inspector on hovered cell | **done** |
| **I-8** | **avatar movement + party follow** — 8-dir avatar move (camera follow + facing-on-step + idle settle) + companion conga via `MoveFollowers` formation-greedy-step (avatar walks through followers; party settles when idle). Sub-steps a–e. Shares the single-step move kernel (`canStandAt` + `insertAtHead` + facing) with I-9; does **not** use the path builder. | **done** |
| I-9 | **NPC pathfinding** — `C_1E0F_2D37` bucket-Dijkstra + `AI_FINDPATH`→`AI_ONPATH`→`__DoOnPath`→`__AtDestination`; wires into the I-5 schedule trigger so NPCs **walk** to slots (near the player) or **teleport** to them (far/off-screen, `C_1E0F_291C`), then settle the arrival worktype (+ edge-seek for far slots, humanoid door pass-through, teleport-to-previous on reschedule, first-tick alignment at load). Makes Britain feel live. | **done** (a–h; i dropped) |
| I-10 | object-action dispatch core — `Map<ObjectType, handler>` registries per action (USE / GET / LOOK / DROP); minimum handlers for "walk around without getting stuck" (door USE, LOOK on any, GET/DROP via inventory) | **scoped** (see I-10 scope) |
| I-11 | talk trigger — adds TALK as a case in the I-10 dispatch + adjacency-pick logic | planned |
| I-12 | dialog window — second surface on the I-7 substrate; opens when TALK fires | planned |
| I-13 | conversation VM (adapt legacy `script.js`) — β reached: walk + talk works end-to-end. Give/take opcodes work because I-6 inventory data exists. | planned |
| I-14 | status panel — third surface on the substrate; replaces the dev HUD's clock readout | planned |
| I-15 | object-action handlers expansion — fills in the rest of `seg_27a1.c`'s dispatch table (spellbooks / moonstones / instruments / etc.); each handler tied to its owning subsystem when that subsystem lands | planned |

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
Avatar movement (I-8) and NPC pathfinding (I-9) then land as two adjacent steps.
They share the **single-step move kernel** (`canStandAt` + `insertAtHead` +
facing-set) — and facing-on-step (pathfind-walker) + facing-on-snap (schedule
trigger) want the same direction logic — but **not** the path builder: a source
read 2026-06-01 confirmed `C_1E0F_2D37` (bucket-Dijkstra) is used by NPC AI alone;
the avatar steps on player input and companions trail via `MoveFollowers`' greedy
step, neither of which path-builds. (An earlier draft of this ledger folded the
two into one step "because both consumers share `C_1E0F_2D37`" — that was wrong,
and is why they are now separate steps: one step = one squash commit, and the two
have distinct payoffs + verification methods.)

**Object-action dispatch (I-10) precedes talk trigger (I-11).** U6 doesn't have
"USECODE" in the Ultima 7 sense — instead source uses two distinct mechanisms:
a stack-based bytecode VM at `seg_1703.c` for NPC dialogue (the conversation
VM, I-13) and a hardcoded C dispatch table at `seg_27a1.c` for object actions
(USE / GET / LOOK / DROP / PUSH / SEARCH per `OBJ_xxx`). The object-action
dispatch is the more general primitive: TALK is just one case in the same
"press a key, do X to the entity in front of me" pattern that USE/GET/LOOK
share. So I-10 lays the dispatch infrastructure with a minimum handler set
(door USE, generic LOOK, GET/DROP via inventory) — enough to walk around
without getting stuck. I-11 then adds TALK as a new case alongside, plus the
adjacency-pick logic ("which NPC am I facing?"). I-15 (post-β) fills in the
rest of `seg_27a1.c`'s table (spellbooks → `C_27A1_2D8E`, moonstones →
`C_27A1_3425`, instruments → `C_27A1_5935`, etc.), each gated on its owning
subsystem becoming available.

The β path (walk + talk) reaches at **I-13**, later than the prior plan, but
the conversation VM lands with full give/take semantics rather than stubbed
inventory opcodes; the world feels alive sooner via inventory inspection
before agency exists; and the object-action dispatch is in place from I-10 so
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
player-position source (avatar from I-8), (b) richer tile flags than I-1/I-2 decoded
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

- Ambient light render — its own later step after I-8 (avatar exists), with its own
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
  (post-I-8 boats subsystem); combat → fly + ethereal; folded INTO
  `canStandAt`'s body as class arms, NOT sibling functions
- party-member pass-through (`D_17B2`) — avatar party arrives at I-8;
  `MoveFollowers` (I-8c) may need this so companions don't treat each
  other as hard blockers while repositioning — watch during I-8c verify
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
  **I-9** (its own step, after I-8 avatar/party movement); until then, the
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
- **NPC names** — the probe currently falls back to `"(unnamed)"`
  when `objlist.actors[npcId].name` is empty (true for any non-party
  NPC). Source's `GetObjectString` (`seg_1184.c:1912`) handles this by
  falling through to `GetTileString(TILE_FRAME)` — i.e. `look.lzd`,
  which we already decode and which stores personal names ("Lord
  British" at tile id 1769, "musician" for the generic-musician tile
  range, etc.). The probe needs the same fall-through; fixed in I-7c.
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

## I-7 scope — UI substrate + object inspector view

**Goal:** lay the shared UI substrate (modal stack + input routing +
turn-driver gating + list-with-cursor + atlas-icon DOM rendering)
that every later UI surface (dialog window I-12, status panel I-14,
save/load, spell select, conversation) will sit on, and battle-test
it on its heaviest primitive consumer — the **object inspector**, one
surface for any entity (sword / NPC / barrel / chest) with
nested-modal-stack opening of held containers. Paired with the
deferred-from-I-6 `main.js` logic refactor so the substrate's hook
sites are easier to wire on smaller modules.

**Trigger (Zane's feel call, 2026-05-31):** hover any cell, press `I`
→ inspector opens for the topmost entity at the hovered cell. Mirrors
U6's "look" command, leaves canvas pointer plumbing untouched
(drag-to-pan stays as is). Nested-open from a list row uses the
substrate's in-modal cursor + Enter — no canvas interaction.

**Sub-steps** (each ≈ one save-point commit, browser-verified before
the next; squashed at the end into one `[ultima6_clone] impl I-7
(UI substrate + object inspector view)`):

- **I-7a — `main.js` logic refactor (behavior-identical).** Extracts
  `view/dev_hud.js` (clock HUD installer: text, controls,
  pause/±10m/±1h, schedule-stats line, rewind helper) and
  `view/dev_probe.js` (drag-to-pan + I-4d describeCell + I-5f probe;
  returns `{ isDragging, getLastCell }` for I-7c's hotkey). `main.js`
  trims from 463 → ~280 lines; `startRender()` from ~235 → 53 lines.
  No behavior change. Browser-verified: HUD ticks, probe shows the
  same lines, drag-pan unchanged.

- **I-7b — UI substrate.** Four new files plus `index.html` chrome.
  `view/ui_stack.js` — `UIStack` class: `push(modal)` appends to
  `<div id="ui-root">`; on first-push suspends `TurnClock` + installs
  one global `keydown` listener that routes to `top().onKey` (Esc
  auto-pops unless `preventDefault`'d). `pop()` reverses; last-pop
  resumes `TurnClock` + removes listener. `TurnClock.suspendCount` is
  already counter-based (`ecs/world.js:60`) so nested modals work
  for free. `view/ui_widgets.js` — `makeListCursor(items, {
  renderRow, onActivate })`: Up/Down wrap, Enter activates; cursor
  row carries `.ui-cursor` class. `view/ui_icons.js` — `tileIcon(reg,
  tileId)`: builds a 16×16 `<canvas>`, blits `getTilePixels` via
  `reg.palette` (both already on CPU side); scaled 2× via CSS
  `image-rendering: pixelated`. `index.html` — adds
  `<div id="ui-root">` + substrate CSS (gold-on-black, matches dev
  HUD palette). `UIStack` exposed via `window.__U6.uiStack` for
  DevTools dry-run.

- **I-7c — Object inspector + `I` hotkey.** `view/inspector.js`'s
  `openInspector(world, handle, uiStack, { reg, objlist })` builds a
  modal: header (icon, name [NPC name from `objlist.actors` for
  scheduled actors, else `getTileLook`, else `Item #N`], kind +
  obj#/frame + ×qty, position-or-(carried), decoded status bits),
  contents list iff `Container` (rows = icon + name + ×N + equipped),
  hint footer. `inventoryOf` (`world_loader.js:161`) provides the
  list shape verbatim — no wrapper. `onActivate` on a child opens a
  nested inspector (substrate's stack handles the LIFO). `main.js`
  global keydown gated on `uiStack.isEmpty() && !probe.isDragging()
  && key === 'i'` reads `probe.getLastCell()`, calls
  `spatial.at(x,y)[length-1]` (same topmost = last-entry rule the
  per-cell painter uses for Actor=1 z-priority), opens the
  inspector.

**Binding design decisions (recorded 2026-05-31, all carried through):**
- **One inspector surface for any entity** (not container-specific).
  Identity always present; contents-list conditional on `Container`.
- **Modal-stack for nested containers**, not inline tree expansion.
  Each open pushes; substrate's z-stack handles the rest.
- **`TurnClock` suspended for the entire stack lifetime.** Push N
  modals → N suspends; pop N → N resumes; net 0. No schedule snaps
  fire while the player inspects. Matches source's pause-during-
  inspection behavior + the existing dev HUD pause-button mechanism.
- **Atlas-icon rendering uses existing CPU-side data** —
  `Tiles.cache` (set by `getTilePixels`) + `TileRegistry.palette`
  (already RGBA Uint8Array). No GPU readback, no extra cache.

**Reuse-from-existing decisions** (no reinvention):
- `inventoryOf(world, handle)` (`world_loader.js:161`) — already
  returns `{ handle, objNumber, frame, quantity, quality, equipped }`,
  exactly the list row shape.
- `Tiles.getTilePixels(index)` / `getTileLook(index, quantity)`
  (`assets/tiles.js:82, 128`) — pixel cache + display-name lookup.
- `SpatialIndex.at(x, y)` (`resources/spatial_index.js:45`) — cell
  entity array, no spatial scan.
- `TurnClock.suspend() / .resume()` (`ecs/world.js:60-62`) —
  suspendCount counter, no infra change.

**Source-faithful pick / display-name / chain-insertion rules.** The
chain-head-insertion rule (`AddMapObj` / `MoveObj` /
`__ObjectsDeserialize`), the three-tier cell-pick rule
(`C_2337_08F1` + `COMBAT_canSee` + `IsTileIg` fallback), the
display-name fall-through (party-`Names[]` → `look.lzd` via
`GetObjectString`), and the keyboard-targeting-collapses-into-mouse
path all landed in this scope but are documented in their proper
research homes — see [`research_world_data.md`](research_world_data.md)
§"Runtime mutation — AddMapObj and MoveObj" + §"Clone correspondence
— SpatialIndex API", [`research_object_interaction.md`](research_object_interaction.md)
§"Cell-pick (`C_2337_08F1`)" + §"Display-name resolution", and
[`research_map_render.md`](research_map_render.md) §"Painter's
algorithm — within-tier order" for the renderer's reverse-iter rule.

Concrete I-7c-time additions to the code base:
- **`Actor` component upgraded from tag → `{ npcId: Uint8Array }`** so
  party-membership checks work for any actor (the npcId used to live
  only on `Schedule.npcId`).
- **`SpatialIndex.insertAtHead(x, y, handle)`** added alongside
  `insert(x, y, handle)`. `insert` is for batch-load (file order
  preserved by push). `insertAtHead` is for runtime move/drop
  (matches source's chain-head splice).
- **`npc_schedule_system.tick`** switched its snap to `insertAtHead`.
  Wasn't visible bug (Actor override masked it) but now the chain
  state is source-faithful for any future reader.
- **`WorldRenderSystem` within-tier iter is REVERSE** so older
  spatial.at entries emit last → drawn last → on top. Fixed the
  candle-under-table and door-under-doorway visual issues.

Verified cases (combined across pick + render):

| Cell | spatial.at[0..] | Inspector picks | Visually on top |
|---|---|---|---|
| (300, 378) | [candle, table] | candle | candle |
| (293, 376) | [door, doorway] | oaken door | oaken door |
| (296, 373) | [potion, table] | green potion | green potion |
| (307, 348) | [LB] + throne extension | Lord British | Lord British |
| (307, 360) | [egg] (`IsTileIg`) | egg (3rd-tier fallback) | egg |

**Forward implications for I-8+:** every system that moves an entity
mirrors a source `MoveObj` / `AddMapObj` call, so every system that
moves an entity must use `SpatialIndex.insertAtHead` at the
destination. Source has ONE chain rule (insert-at-head) and ONE
movement routine (`MoveObj`); NPCs and objects both go through it —
`seg_1E0F.c` has 14+ `MoveObj` call sites covering NPC schedule snap
(line 1206), pathfinder per-step (1375/1436/1487), follower stepping
(584), combat warps (635-890). The clone mirrors this with one API
used uniformly:

- **NPC schedule snap** (today, `npc_schedule_system.tick`) → analog of
  `seg_1E0F.c:1206` `MoveObj`. ✓ uses `insertAtHead`.
- **I-8 avatar step + follower stepping** → analog of `seg_1E0F.c:921`
  (active-member move) / `seg_1E0F.c:584` (`MoveFollowers`). Must use
  `insertAtHead`.
- **I-9 NPC pathfinder per-step** → analog of `seg_1E0F.c:1375` /
  `seg_1E0F.c:1436` / `seg_1E0F.c:1487`. Must use `insertAtHead`.
- **I-10 DROP** → analog of `MoveObj` on a previously-INVEN object
  becoming LOCXYZ, OR `AddMapObj` for a split stack. Both head-splice
  in source. Must use `insertAtHead`.
- **I-10+ push / throw / teleport / magic move** → all `MoveObj`
  equivalents. Must use `insertAtHead`.

The NPC schedule snap's switch from `insert` → `insertAtHead` has no
observable behavior today (Actor type-priority in inspector + renderer
masks chain position for NPCs, and two-NPCs-per-cell is gameplay-
impossible via `canStandAt`'s NPC-blocks rule). But it makes the API
convention uniform — one API, one source rule, no split-brain — so I-8+
callers don't have to remember "NPCs use one API, objects use the
other." Plain `insert` at runtime by any future system would pile the
new arrival at the tail of `spatial.at`, and the inspector / chain-
consuming code would silently pick the wrong target. API naming is the
guardrail.

**Verification:**
- Page loads with empty IndexedDB: no errors, `#ui-root` in DOM,
  checklist scans cleanly.
- DevTools dry-run after data loads:
  `window.__U6.uiStack.push({ el: document.createElement('div'),
  onKey: (e) => {} })` → clock HUD border tints `#c66` (TurnClock
  suspended); Esc pops; border returns to `#6b5d3a`.
- Live: hover (307, 348) (Lord British on his throne), press `I` →
  inspector shows name = "Lord British", position (307,348,0), status
  bits decoded, contents = ~12 inventory items. Up/Down cursor;
  Enter on a held bag → nested inspector for that container. Esc
  unwinds nested → root → close. During the stack lifetime: clock
  text doesn't advance; canvas drag-pan unaffected. `I` over an
  empty cell = no-op.

**Deferred (each owns a later step):**
- **Status panel** (I-14) — third substrate consumer, replaces the
  dev HUD's clock readout. Substrate ready; consumer waits.
- **Dialog window** (I-12) — second substrate consumer; opens when
  TALK fires (I-11). Substrate ready; consumer waits.
- **Inspector actions** (USE / GET / DROP buttons) — need I-10's
  object-action dispatch core; today's inspector is read-only.
- **Object-action triggers from the inspector** (e.g. USE-on-selected
  child) — same I-10 dependency.

## I-8 scope — avatar movement + party follow

**Goal:** the player walks the Avatar around Britain with the camera
following, and the three starting companions (Iolo / Shamino / Dupre)
trail in formation. The first **agency** in the rebuild. **Landed a–e,
all browser-verified on real U6 data.**

**Source mechanism — see `research_npc_ai.md` §"Party follow + avatar
movement" for the full decode.** Headline finding: **party-follow is NOT a
case in the NPC per-mode dispatcher `C_1E0F_3E6A`** — it's skipped for
`AI_COMMAND` (active member) and `AI_FOLLOW` (companions) at
`seg_1E0F.c:2225`, and `AI_FOLLOW` is also excluded from move-point turn
allocation (`seg_1E0F.c:2197`). Companions move through a dedicated routine,
`MoveFollowers` (`C_1E0F_1193`, `seg_1E0F.c:501`), a **formation-offset greedy
step** — not a trail buffer, not per-follower pathfinding. The avatar step and
the follower step share only the **single-step move kernel** — `canStandAt`
(I-4) + `insertAtHead` (I-7) + the shared facing/walk helper (`C_1E0F_0664`);
the path builder `C_1E0F_2D37` belongs to I-9.

**Sub-steps as landed** (a–e; each one save-point commit, squashed into one
`impl I-8`):

- **I-8a — Avatar move + camera + facing + idle settle**
  (`systems/avatar_move_system.js`). 8-dir input (arrows = cardinals, numpad =
  full 8-dir; `seg_0C9C.c:1069-1076` keymap, 0=N clockwise) → the
  `C_1E0F_1B0E` /*[advance]*/ path: one legal step via `canStandAt`,
  `insertAtHead` at the destination; a blocked cell bumps (no move). Camera
  recenters on the Avatar each step. Facing-on-step = `MACRO_A` 8→4 facing +
  diagonal hysteresis + the `C_1E0F_0664` humanoid walk cycle
  (`frame = walk + facing<<2`). Idle settle: on an idle turn the walk cycle
  relaxes to stand (source's `seg_0A33.c` idle pass, settle arm), gated on a
  separate `IDLE_SETTLE_MS` (~500 ms) idle-detection delay so the Avatar holds
  its stride briefly rather than snapping on the first 100 ms heartbeat.

- **I-8b — `PartyMember` + `Party`** (`components.js`, `resources/party.js`).
  `PartyMember { slotIndex }` tags each on-map actor whose objlist slot id is
  in `objlist.party[]` (Avatar = slot 0, no distinct marker — source treats it
  as `Party[0]`). `Party` resource holds the singleton `activeIndex` (= 0) +
  `mode` (= 'follow'). `world.query(PartyMember)` sorted by slotIndex IS the
  member list (no `members[]` array) — MoveFollowers walks it. Verified: 4
  members in order (Avatar/Dupre/Shamino/Iolo) at their objlist start cells.

- **I-8c — Foundations** (`systems/humanoid_anim.js`, `passability.js`).
  (a) Extract the avatar's facing + walk-cycle into `humanoid_anim.js`
  (`faceDir` / `walkStep` / `settleToStand`) and refactor the avatar to use it
  — behavior-identical, regression-verified — so MoveFollowers reuses the same
  animation. (b) Add the **party pass-through** option to `canStandAt`
  (`{asPartyMember, leaderHandle}`, source `D_17B2` at `seg_1E0F.c:191-198`): a
  moving party member walks through other party members; the active leader
  stays solid.

- **I-8d — `MoveFollowers` (the conga line)** (`systems/move_followers.js`).
  Port `C_1E0F_1193`: per follower, compute the formation-slot target from
  `D_17B8`/`D_17C3` rotated by leader facing; try all 8 directions, keep legal
  cells (`canStandAt` with party-pass), score by the "eager" heuristic
  (contiguity via `C_1E0F_1056` minus distance-to-slot), step the best. Two
  passes; `aFlag` 0 = leader moved (loose trailing), 1 = stationary (tighten).
  Per-follower walk state in a handle-keyed map; facing via `humanoid_anim`.
  Wired off the avatar's `onMove` (camera recenter + follow). The Avatar
  (leader) also walks THROUGH its followers (party-pass); when it steps onto a
  follower's cell, MoveFollowers shuffles that follower aside — the same pair
  source uses. `D_17A9` damage-tile reluctance dropped (no hazard subsystem).
  **Bug found + fixed here:** `canStandAt` checked a follower's *sprite-tile*
  impassable flag BEFORE the party-pass could skip it, so `blocked` stuck true
  and the Avatar was wrongly blocked by its own followers. Moved the
  Actor/party-pass check to run FIRST, before the tile-flag checks — matching
  source's `c_04ed` (an NPC blocks for *being* an NPC, not for its sprite
  tile's flags). Verified: companions trail onto exact formation slots;
  reversing through the party never blocks the Avatar and never leaves a
  follower stacked.

- **I-8e — Party idle settle** (`move_followers.js` `settleParty`, avatar
  `onIdle`). When the party is idle past `IDLE_SETTLE_MS`, the whole party —
  Avatar (slot 0) + followers — settles its walk cycles to stand (facing
  preserved). Generalizes the I-8a avatar settle: the avatar's idle branch fires
  an `onIdle` callback (symmetric with `onMove`) wired to `settleParty(world)`,
  which settles every `PartyMember` mid-stride. Verified: party holds its stride
  ~500 ms after stopping, then plants its feet together.

**How the avatar system and the follow/settle relate.** `moveFollowers` and
`settleParty` are NOT registered sim systems — they're consequences the avatar
move system triggers via callbacks (`onMove` after a successful step → recenter
+ follow; `onIdle` after the idle gate → party settle), composed in `main.js`.
This mirrors source: `C_1E0F_1B0E` calls `MoveFollowers` at its tail
(`seg_1E0F.c:933`), and the settle is the no-key idle path. Followers move only
on the leader's turn; the party settles only on idle turns — turn-type mutual
exclusion, the same the command-vs-idle loop gives source. The avatar system
stays follower-agnostic (it just promises "I call onMove/onIdle"); the wiring
site composes the rest. Active-member switching (later) only changes the
`leaderHandle` passed to `moveFollowers`.

**Time-model note (provisional).** A player move advances the world clock +1
minute, AND the idle heartbeat advances it too (~10 game-min/sec) — so time
passes whether or not the player acts. Source is strictly turn-based (time per
move-point round; idle = frozen). Keeping the idle-advance ("world breathes") is
a provisional lean (Zane 2026-06-01); it finalizes at I-9 when the move-point
economy lands. See the I-9 scope.

**Formation offset tables (verbatim from `seg_1E0F.c:62-63`):**
```
D_17B8[] = { 0,-1, 1, 0,-2, 2,-1, 1,-3, 3, 0};   // perpendicular
D_17C3[] = { 0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 1};   // behind
```
Indexed by `follow_pos` (1-based per follower). Slot 1 = back-left,
2 = back-right, 3 = two-behind, 4/5 = wider, etc. — a diamond expanding
behind the leader. Target rotation (`seg_1E0F.c:528-535`):
`target_x = x − DirIncrX[facing]·behind − DirIncrY[facing]·perp`,
`target_y = y + DirIncrX[facing]·perp − DirIncrY[facing]·behind`.

**Deferred (each owns a later step):**
- **NPC pathfinding** (`C_1E0F_2D37`) → **I-9**. Until it lands, the I-5
  schedule snap stays teleport-not-walk; I-8 movement does not touch the
  path builder.
- **`[F]ollow` / `[S]olo` toggle** — the `Party.mode` slot exists but UI
  doesn't expose it; solo mode defers with combat (post-β).
- **Active-member cycle + party HUD line** — different active members
  elicit different conversations; land a minimal dev-HUD "Active: <name>"
  + `1`/`2`/`3` cycle at **I-11** (talk trigger) when it first matters.
  Full party status panel is **I-14**.
- **Teleport-when-too-far for stragglers** (`C_1E0F_291C`, 3/tick cap) —
  shares the mechanism NPC pathfinding uses for off-area NPCs; lands with
  **I-9**. Without it a badly-separated follower can strand; acceptable
  for the I-8 demo (small rooms, short separations).
- **Vehicle/boarding follow suppression** (`IN_VEHICLE` early-return in
  `MoveFollowers`) — no boats/horses yet.

## I-9 scope — NPC pathfinding

**Sub-steps a–h landed as SEPARATE commits (no squash, Zane 2026-06-02).**
Pre-impl research baseline: `research_npc_ai.md` §"Pathfinding" + §"Arrival —
`__AtDestination`" + §"Off-area handling" + the §"Clone port notes (I-9)" (which
carries the source-derived findings + the kept deviations). The per-sub-step commits:

| Sub | Commit | What landed | Tests |
|---|---|---|---|
| **I-9a** | `344f438` | **cost map** `computeResistance()` (`__ComputeResistance`, seg_1E0F.c:1866-1922): terrain `(TerrainType>>4)+1`, door frame<8 +1 / ≥8 block + behind-block, pass-through +1, 2×2-footprint spread, wet-tile rescue. `terrainCost()` accessor added. | 21 |
| **I-9b** | `99e0594` | **bucket-Dijkstra search** `findPath()` (`C_1E0F_2D37`+`C_1E0F_2A74`+`C_1E0F_25F9`): two-source meet-in-the-middle, bucket priority (route-faithful), traceback → plain 4-dir array (RLE dropped). | 14 |
| **I-9c** | `aa932fe` | **path-follow** `doOnPath()`/`npcStep()` (`__DoOnPath`): one 4-dir step via the shared kernel, `AI_ONPATH→84→85→86` escalation. `AIMode` component + `Paths` resource + `ai_modes.js`. **Humanoid-NPC door pass-through** in `canStandAt` (`MONSTER_4000` class). | 18 |
| **I-9d** | `b1894d8` | **NPC tick** `installNpcTickSystem` (sim-list): each turn, `AI_FINDPATH` NPCs build a path in their own 40×40 window + walk it; schedule arm rewired to set `Destination`+`AI_FINDPATH` instead of snapping. `AIMode`/`Destination` tagged at `loadActors`. | 6 |
| **I-9e** | `90831db` | **edge-seek** for far slots (`PTH_direct` port + deviation): off-window goal → flood to a window edge toward it, re-plan at the edge → walk across the map incrementally. | 8 |
| **I-9f** | `6dcc977` | **teleport-to-previous-target on reschedule** (deviation): a blocked NPC catches up to its unreached previous slot before re-targeting. | 8 |
| **I-9g** | `47216fc` | **arrival worktypes/facing** `atDestination()` (`__AtDestination`, seg_1E0F.c:1002-1085): on path-end-within-1-tile (`__DoOnPath` `COMBAT_getCathesus<2`) / already-on-slot / post-snap, set `NPCMode` = the slot's worktype (new `Destination.action`) + STAND_*/GUARD_* facing (stand frame `(facing<<2)\|1`, **humanoids only** — `isHumanoid` gate at both the arrival + walk sites, mirroring source's type-dispatched `C_1E0F_0664`). Off-slot → revert `AI_FINDPATH`. Pose worktypes (SLEEP/SIT/EAT/PLAY/RINGBELL) set the mode + hold position but **defer** the furniture sprite swap (`C_1E0F_2184`). | 33 |
| **I-9h** | (this commit) | **off-area teleport + distance gate + first-tick alignment** `tryTeleportToSlot()` (`C_1E0F_291C`, seg_1E0F.c:1181-1211): far NPCs teleport onto their slot (settling the worktype via `atDestination`) instead of pathfinding; the NPC tick tries it FIRST (source's `C_1E0F_464A` order), capped 3/turn. Visibility guard = suppress if NPC OR slot within Chebyshev-40 of the avatar (the wider-canvas adaptation of source's ±5 11×11 viewport box), `allowVisible` = source's `AllowNPCTeleport` override (used by the unreachable-fallback, which `tryTeleportToSlot` now unifies, replacing the local `snapToSlot`). First-tick alignment: `main.js` fires `clock.hourlyHooks` once at load so NPCs resolve to their current-hour slot instead of waiting for the next rollover. | 13 |

Verification: 121/121 unit cases (`tests/test_pathfinding.html`) + a real-data
preview-eval pass (2026-06-02). On real data: **40 scheduled NPCs carry STAND/GUARD
worktypes** (e.g. NPC 6 STAND_E @(305,349), NPC 8 GUARD_S @(333,407) — castle
courtiers), so the worktype path is live, not dead code; exercising `atDestination`
on a real humanoid (obj 0x19a, baseTile 1776) produced **valid facing sprites** for
all four cardinals (tiles 1777/1781/1785/1789, GUARD_W = STAND_W) — confirming the
frame→tile mapping that the unit test stubs to 0; and the **live AIMode distribution
already showed arrived worktypes populated** (SIT/LOITER/WANDER/FARM/PLAY/RINGBELL),
i.e. the full schedule→walk→arrive→worktype lifecycle fires end-to-end as the game
runs. **Non-humanoid guard verified on the real gazer NPC #9** (obj 0x162): its
`STAND_N` slot sets the mode but leaves the sprite frame untouched (`isHumanoid`
false), while a real humanoid control still faces (STAND_S → frame 9). (The a–f
NPC-#12 trace is what surfaced the drawbridge finding; NPC #9 surfaced the
non-humanoid facing gate.)

### Key decisions + deviations (all recorded in `research_npc_ai.md §"Clone port notes (I-9)"`)

- **Per-NPC 40×40 window, centered on the NPC (not the player).** Source
  player-centers a shared grid; our 64×40 canvas is wider than 40×40, so
  player-centering would teleport on-screen NPCs. Per-NPC centering + walk-don't-
  teleport sidesteps that and keeps source's building-scale window. Each NPC paths
  in its own window — camera-independent.
- **Edge-seek deviation: accept ANY window edge the goal lies beyond** (an
  `edgeMask`), not source's single dominant-axis edge — on real town maps the
  dominant edge is often walled right next to the NPC and source then snaps
  (verified: NPC #12 north walled, east open). Frontier pool sized to the grid (vs
  source's 256) so open-terrain edge-seeks don't false-give-up.
- **NPCs are NOT obstacles in the cost map** (source-faithful — only object slots
  ≥0x100). NPC-vs-NPC blocking is resolved at per-step move time: a blocked NPC
  bumps + waits (`84/85/86`) + re-plans, self-healing when the blocker moves. The
  deferred move-point step-rate would reduce collisions (staggered vs flat).
- **Teleport-to-previous-target on reschedule (deviation, I-9f).** A blocked NPC,
  on its next schedule slot, snaps to its unreached previous slot first, then walks
  on — so it "catches up" to its schedule. Source re-paths from where it's stuck.
  Kept difference; `reclaimed` HUD stat counts it.
- **`snapToSlot` is a fallback for genuinely-unreachable slots only.** The canonical
  real cause is an **unmodeled obstacle, not a cost-cap bug** — the **castle
  drawbridge** (`OBJ_10D`, frames 6/7/8 = raised/impassable; lever-operated
  `seg_27a1.c:1898-2090`) on NPC #12's route. Closed, it forces a cost-15 forest
  detour exceeding source's 7-bit cost cap (127) → snap. In normal play the Avatar
  opens that bridge (a quest step, NPC only matters once it's open); the clone's
  free-camera "god mode" activates schedules out of that sequence, surfacing the
  impossible-destination case where the teleport is correct. **Do NOT raise the cost
  cap** (it would route her through forest, a path the original never uses). The
  drawbridge/lever subsystem is **I-10** (object actions).
- **Flat step-rate** — every on-path NPC steps once per tick (all same speed). The
  full move-point priority economy (`MovePts`/`DEXTE` interleave) is **deferred**;
  the minimal move-point rate is the alternative if per-NPC speed / collision
  staggering ever matters.

### Time model (finalized 2026-06-01: keep idle-advance)

Kept the "world breathes" model — the clock auto-advances on the idle heartbeat —
NOT strict turn-based. The interval is currently the I-3 debug-fast 100 ms;
**tuning it to a slower natural value is DEFERRED (Zane 2026-06-02)** — it was the
4th part of the original I-9h bundle, split out as a one-line `TurnClock` change to
do when the slower-clock feel is wanted (it doesn't block I-9). Flipping to strict
turn-based later is a one-flag change (gate the idle branch of `World.frame`, since
the NPC tick is a sim-list system) — see the chat 2026-06-01.

### Done — I-9g: arrival worktypes/facing (`__AtDestination`, seg_1E0F.c:1002-1085)

`atDestination(world, handle)` in `systems/npc_path.js` sets `NPCMode` to the
schedule slot's worktype (the new `Destination.action` field) on arrival, and for
`STAND_*`/`GUARD_*` faces the NPC the right way (stand frame). Called from three
sites: `doOnPath`'s end-of-path branch (now gated by `COMBAT_getCathesus < 2` — a
wrap-aware Chebyshev — instead of exact-equality, so an NPC that ran out 1 tile short
still settles, and an edge-seek path that ran out far from the real slot re-plans);
the NPC tick's empty-path branch (schedule fired while already on the slot); and the
NPC tick's post-snap branch (an unreachable slot snapped onto). Off the exact slot →
revert to `AI_FINDPATH` and keep walking (the pose worktypes force-hold instead,
matching source). **Kept deviations:** facing is encoded in the sprite frame
(`frame = walkCycle + facing<<2`; stand = `(facing<<2)|1`), not a separate
`SetDirection` field — a later GUARD-pacing step reads facing back from `frame>>2`.

**Humanoid-only facing gate (both sites).** Source's facing helper `C_1E0F_0664` is
type-dispatched and is called from *both* the per-step walk (`TryStraightMove`,
seg_1E0F.c:1439) and the arrival (`__AtDestination`, seg_1E0F.c:1075). We ported only
its humanoid arm (`humanoid_anim.js`), so both clone sites — `npcStep` (the walk) and
`atDestination` (the arrival) — now gate on `isHumanoid(objNumber)` (`OBJ_178..0x183`,
`OBJ_199..0x19A`); non-humanoid NPCs move/settle without animating (a valid static
sprite) instead of being mis-encoded with the humanoid `facing<<2` layout. Surfaced by
inspecting the gazer NPC #9 (obj 0x162: source uses `frame = facing` directly,
seg_1E0F.c:410) on real data. The `npcStep` half is a fix to landed I-9c code, in this
commit because it shares the root cause + the new `isHumanoid` helper.

**Deferred:** the per-type non-humanoid facing arms (gazer direct-frame, animals, …);
the pose/furniture sprite swaps (SLEEP→bed `OBJ_0A3`, SIT/PLAY→chair, EAT→table
food-frame, RINGBELL→pull-chain, all via `C_1E0F_2184`) — the modes are set and
position held, but the sprite isn't swapped; and the ongoing GUARD up-and-down pacing
(the per-mode dispatcher `C_1E0F_3E6A`) — here GUARD just plants the NPC facing its
post, like STAND.

### Done — I-9h: off-area teleport + distance gate + first-tick alignment

The "walk-near, teleport-far" gate. `tryTeleportToSlot(world, handle, avatarX, avatarY,
allowVisible)` in `systems/npc_path.js` ports `C_1E0F_291C` (seg_1E0F.c:1181-1211):
place an NPC straight onto its scheduled slot and settle the worktype (via the I-9g
`atDestination`), instead of pathfinding. The NPC tick (`installNpcTickSystem(world,
{ avatarRef })`) tries it FIRST in the `AI_FINDPATH` branch — source's `C_1E0F_464A`
order (seg_1E0F.c:1924-1960): teleport, then pathfind only if the teleport was
suppressed — capped at 3/turn (source's `D_17A5`).

**Visibility guard (the distance threshold).** `tryTeleportToSlot` suppresses the
teleport when the NPC OR its slot is within `TELEPORT_NEAR_RADIUS` (40) Chebyshev of the
avatar, so on-screen NPCs always walk (visible, animated). This is the wider-canvas
adaptation of source's ±5 box (seg_1E0F.c:1188-1202) — source suppresses inside the
11×11 gameplay viewport; our 64×40-cell canvas shows ~32×20 half-extents, so a ±5 box
would pop NPCs the player can plainly see. Same deviation philosophy as the per-NPC
pathfinding window. `allowVisible` is source's `AllowNPCTeleport` flag (set during
rest / time-jumps); here it's used by the **unreachable-fallback**, which
`tryTeleportToSlot` now unifies — the old local `snapToSlot` is gone (the fallback is
`tryTeleportToSlot(..., allowVisible=true)`). New `teleported` tick stat + `tp` on the
dev-HUD line.

**First-tick schedule alignment** (was deferred from I-5). `main.js` fires
`clock.hourlyHooks` once at load (`for (const cb of clock.hourlyHooks) cb(clock)`),
which runs the schedule system for the CURRENT hour — resolving each eligible NPC's
`Destination` + `AI_FINDPATH` immediately, instead of leaving them at their OBJLIST
load positions until the clock crosses the next hour boundary. The first turn then
resolves movement (far → teleport off-screen, near → walk). Source forces a full
teleport-settle at every time-jump via `AllowNPCTeleport`; that forced load-settle is
**deferred to save-load**, when genuine mid-route NPCs exist to handle.

**Kept deviations / calls** (for the post-I-9 audit): (a) the **3/turn cap** is kept
source-faithful but is a CPU throttle that's invisible behind the visibility guard
(teleports only fire off-screen) — drop-candidate. (b) **No pathfind cap** (source's
`D_17A7`): when the teleport cap is hit, overflow far NPCs pathfind that turn rather
than wait — minor, arguably better. (c) teleport keeps the clone-defensive `canStandAt`
guard source omits (source assumes authored-valid slots), so a teleport never lands an
NPC on a wall/occupied cell.

Verification: 121/121 unit cases + live preview-eval on real Britain data (2026-06-02):
first-tick alignment fires at load (`[NpcSchedule] hour 09` at startup, before any
rollover); a far NPC (dist 50 from the avatar) **teleported 10 cells onto its slot in
one turn** and settled STAND_S (`teleported=1`); a near NPC (dist 4) was **suppressed
and built a path to walk** (`teleported=0`, AI_ONPATH); and normal play never
teleported a visible NPC. The full schedule→(walk|teleport)→arrive→worktype lifecycle
runs end-to-end with no errors over a day cycle.

### I-9i (dev-HUD path overlay) — DROPPED (Zane 2026-06-02)

The last planned sub-step (a visual cell-trail of a hovered NPC's route) was dropped.
Live `preview-eval` of `window.__U6` / the `Paths` resource already exposes any NPC's
full path state (`dirs`/`counter`/`goalX`/`goalY`) — it's exactly how I-9h was verified —
so the overlay would only save Claude keystrokes on a debug task already covered, while
dirtying one of two layers that don't want it (the `#probe-cell` cursor is a viewport-
positioned DOM box, not world-space; the WebGL renderer only knows terrain + objects;
neither owns a multi-cell camera-tracked trail cleanly). If a genuine spatial-debug
need shows up later, it's a clean standalone add (a dedicated debug layer), not
something bolted onto the cursor. **I-9 is therefore complete through a–h.**

**Deferred (not blocking, → post-I-9 audit):** idle-advance interval tuning — the clock
auto-advances on the I-3 debug-fast 100 ms heartbeat; a one-line `TurnClock` change to a
slower natural rate (the "world breathes" finalization). See the Time-model section
above + the audit fork below.

### Known issue — door-phasing predicate (NOT a deviation, an unverified simplification)

**`npcStep` (`systems/npc_path.js`) passes `asHumanoidNpc: true` to `canStandAt` for
EVERY pathing NPC** — so non-humanoid NPCs (gazer, animals) also phase through closed-
unlocked doors. But door-phasing is gated in source on the **`MONSTER_4000` monster class**
(`C_1E0F_000F:199-207`), NOT the sprite family — so `isHumanoid` ≠ the right predicate here.
Verifying whether a gazer should phase a door needs the monster-class table
(`D_3522_0242` / `GetMonsterClass`, see Journal a–f read). NOT touched in I-9h (the
distance gate doesn't read door-phasing); fix as a small standalone change or fold into
the post-I-9 deviation audit. Low impact today (NPCs rarely path through doors mid-route).

### Post-I-9 — deviation audit (Zane 2026-06-02)

I-9 has landed (a–h; i dropped), so the **consolidated deviation audit** is now due: pull
every I-9 deviation into one table and mark each *forced / deliberate-keep / revisit-
candidate / deferral*. Prime revisit candidates: **teleport-to-previous-target** (I-9f),
**flat step-rate** (move-point economy deferred), the **I-9h 3/turn teleport cap** (a CPU
throttle invisible behind the visibility guard — drop-candidate), and the **missing
pathfind cap** (source's `D_17A7`, not ported). The rest are mostly representation choices
(frame-encoded facing, per-NPC path Map, wrap-aware Chebyshev) inherent to the modern-
rewrite framing, plus modern-UX-forced ones (per-NPC window, any-edge edge-seek, the
Chebyshev-40 teleport radius — all forced by our wider-than-source canvas).

**The central audit fork — NPC blocking + the idle heartbeat (research 2026-06-02, see
`research_npc_ai.md §"Blocking + collision resolution"`).** Source has **no NPC swap or
detour**: a blocked NPC waits up to 3 turns then re-plans the same route, relying on the
blocker moving; the only swap in U6 is avatar↔party-member (`C_1E0F_1B0E:881-898`). Blocks
stay rare/brief in the original via two things the clone changed: (1) the **move-point
economy** (interleaved one-step-at-a-time re-pick + `DEXTE` speed variation = staggering),
deferred here as flat step-rate; (2) the **turn-based clock** — the original advances the
world ONLY per player action (`C_0A33_1CB4` blocks on `CON_getch`; `C_1E0F_4E0A` runs once
per keypress), so while the player is idle the world is frozen and a "stuck" NPC is never
*seen* stuck. Our **auto-advance idle heartbeat** is a clone addition that breaks this —
it's the root of the "watching a frozen NPC is no fun" symptom. So the movement items all
hang off one fork: **keep the idle heartbeat** (then move-points + clock-tuning become
*required* to make idle-time NPC traffic read as calm-and-rare; I-9f comes off once they
land) vs **revert to player-action-only advance** (faithful; the frozen-NPC-while-idle
problem disappears for free; move-points stay a nice-to-have for in-motion traffic). This
reopens the idle-heartbeat call finalized 2026-06-01 — decide it in the audit.

**After the full port — new-mechanism study (Zane 2026-06-02).** If the idle heartbeat
stays, a later study may add mechanisms the original LACKS (NPC-NPC swap, local detour,
actor-aware/soft-cost re-planning) to make NPC movement feel right under auto-advance.
Legitimate non-faithfulness: the original has no mechanism for a problem it doesn't have,
so inventing one solves a clone-only problem (per CLAUDE.md §"Modern-browser UX as
architectural anchor"). Deferred until the port is functionally complete.

### Deferred to later steps (subsystem owners noted)

- **Drawbridge USE** — the control is the **crank** `OBJ_120` (`C_27A1_433D`),
  which toggles the drawbridge tiles `OBJ_10D`; **now scoped as I-10d** (NOT the
  lever `OBJ_10C`, which is the portcullis control — the earlier note
  misidentified it). Until landed, bridge-gated NPCs teleport — correct given the
  closed bridge.
- **Move-point economy** (`MovePts`/`DEXTE` priority interleave) → its own refinement.
- **Object-seek pathfinding** (`AI_SEEKOBJ` / `PTH_object`) → when mice/animals seek.
- **Swim/fly/ethereal movement classes** in `canStandAt` → boats / combat.

## I-10 scope — object-action dispatch core

**Goal:** a thin, paradigm-agnostic **command dispatcher** —
`dispatch({verb, actor, target})` → look-up handler → validate →
effect → cost — plus the minimum verb set for "wander Britain without
getting stuck": **LOOK** (any), **GET**/**DROP** (inventory), **USE**
(doors). TALK is I-11 (one more handler registration on this seam);
MOVE / vehicles / spellbook-cast deferred. This is the front-end that
I-11 (talk) and I-12 (dialog) sit on — see the
[research_game_loop.md](research_game_loop.md) §"The shared targeting
block" finding: in source, look/talk/get/drop/move/use all share one
targeting front-end and differ only at the final switch, so building
the dispatcher now makes TALK additive.

**Why a dispatcher (not per-verb ad-hoc handlers, not a source port).**
The clone today wires input ad-hoc: avatar move + the `I`-look hotkey
are independent `keydown` handlers, each gated on `uiStack.isEmpty()`.
Adding GET/USE/DROP that way copy-pastes the targeting glue per verb —
exactly what source's shared block avoids. We lift the *structural
economy* (verb-agnostic targeting + a verb→handler split), NOT source's
substrate (the `CMD_*` opcode ints, the blocking double `CON_getch`,
the global `Selection` struct, `MouseMode`/`D_04C2`, the giant switch).
Per D2 + the modern-UX anchor, that machinery is 1990 input-loop
residue; the mechanic is `(verb, actor, target) → validate → effect →
cost` (the shared interaction contract,
[research_object_interaction.md](research_object_interaction.md)
§"The shared interaction pattern").

### Locked UI decisions (Zane, 2026-06-03)

- **#1 — message channel (NEW surface).** A gameplay scrolling text
  area, the `CON_printf` analog. Carries verb results ("You see a
  dagger. It weighs 0.1 stones.") and the canned refusals (`D_0DDC[]`:
  "Out of range!", "Nothing!", + `WhatMsg` "What?"). Does NOT exist
  today — `#log` is the dev/loading log, `#clock-hud` is the dev HUD.
  This is the one genuinely-new UI in I-10. Layout (below / beside the
  canvas), scrollback depth, and styling settled in I-10a.
- **#2 — LOOK = line-default, modal-for-structured (option c).** Plain
  look → a line in the message channel (source-faithful: source's LOOK
  `C_27A1_0C67` is a scroll verb,
  [research_object_interaction.md](research_object_interaction.md)
  §"Look"). Escalate to the **existing inspector modal** only for
  structured targets — containers (list contents), later spellbooks.
  Mirrors source's own escalation (line → portrait/contents panel for
  complex objects). Consequence: the `I` hotkey shifts from
  "always-modal" to "line for simple / modal for structured" — a small
  behavior tweak of the I-7 inspector entry, not a rewrite.
- **#3 — targeting cue = visual, no text echo (option c).** When a verb
  is pending, tag the existing `#probe-cell` hover box (recolor + a
  small verb label); the **result** goes to the message channel. Drop
  source's textual `"Look-"`/`"Use-"` echo — that prompt-echo existed
  because a 1990 terminal had no better "you're aiming" cue; we have a
  mouse-following cursor. Modern-UX anchor: source's text-echo + aim-box
  envelope is substrate residue, the mechanic (verb → target → result)
  is the spec. Bonus: a visual cue degrades cleanly across both
  front-ends (cursor tag for verb-first, menu for target-first); a text
  echo would be verb-first-only.

### Dispatch-core seam (admits both front-ends)

- **`pickAtCell(x, y) → entity | null`** — the shared target resolver,
  generalized from the current `inspectAtCell` (main.js): the same
  three-tier cell-pick (NPC > object > ignore-tile,
  [research_object_interaction.md](research_object_interaction.md)
  §"Cell-pick — `C_2337_08F1`"), but returning the pick instead of
  opening a modal.
- **`dispatch({verb, actorEntity, target})`** where `target = {entity,
  x, y}` — the **local** intent value, the ECS analog of source's global
  `Selection {x,y,obj}`. Pipeline = the shared interaction contract:
  resolve → validate (adjacency `CLOSE_ENOUGH` + legality via I-4
  `canStandAt` for placement verbs) → face the target (I-8 facing) →
  effect → spend move-points / recompose (I-3/I-9 turn).
- **Handler registry** — `Map<verb, handler>` for the single-function
  verbs (LOOK/GET/DROP, later TALK/MOVE); **USE = `Map<ObjectType,
  useHandler>`** (the additive dispatch table,
  [research_object_interaction.md](research_object_interaction.md)
  §"Use" + §"Per-verb modules"). Each new usable type registers without
  touching the others.
- **Front-ends both end at `dispatch(...)`:** verb-first (this step) +
  target-first (deferred, below). The dispatcher never learns which one
  called it.

### USE handler implementation (the ~40-case branch)

Source's USE switch (`C_27A1_6179`, ~40 cases) looks daunting but
collapses to ~8 sub-patterns, and I-10 implements only 2 (door + crank).
Three rules keep it tractable:

1. **Registry, not switch.** `useHandlers: Map<ObjectType, fn>` +
   `registerUse([types], fn)` (group-registration = source's case
   fall-through, e.g. the door quartet `OBJ_129-12C` → one fn). Adding a
   case is a one-liner that can't break the others.
2. **Shared wrap in the dispatcher; handlers do ONLY the effect.**
   Source proves the boundary — everything around the switch in
   `C_27A1_6179` is written once. The USE verb-handler owns: head-resolve,
   the re-pick (`C_27A1_0919`, skip NPC/Ignore), the usability gate (→
   "Not possible!", ~`C_27A1_01DE`), adjacency + facing, the move-point
   cost (`SubMov 5`), recompose. Each registered handler owns only its
   type-specific effect.
3. **Factor sub-patterns so cases stay 1–3 lines.** The ~40 cases are a
   few shapes; one helper per shape:

   | Sub-pattern | helper | source examples |
   |---|---|---|
   | local frame-toggle | `toggleFrame(obj)` | doors `129-12C`, simple lever `0BA/0C0` |
   | quality-linked remote toggle | `qualToggle(ctrl, …)` | crank→`10D` (frame); lever→`136`, switch→`0AF` (add/del at `12D` markers) |
   | consume | `consume(obj)` | food `073/074/075` |
   | light source | `toggleLight(obj)` | lantern/candle/torch group |
   | board / mount | `board(obj)` | ships, horse `1AF`, cannon `1AC` |
   | level change | `changeLevel(obj)` | ladder `131` |

   I-10 implements only `toggleFrame` (door, I-10c) + the crank's
   quality-toggle (I-10d); the rest register later as one-liners.

**Discipline:** the map holds only *ported* handlers — unregistered types
fall to "Not possible!" (correct, not a gap). Keep source's full case
list in [research_object_interaction.md](research_object_interaction.md)
§"Use" as the to-do, and `console.warn` an un-ported-but-usable type
during play so gaps stay visible. USE effects go through the **same**
mutation primitives GET/DROP use (`setFrame` / add / delete) — no
parallel USE-only mutation path. Each handler cites its `C_27A1_*`
counterpart.

### USE cases beyond I-10 — demand-driven, no batch milestone

There is **no "implement all ~40 USE cases" step**, by design
(`user_retro_port_goal`: stop at the learning goal, defer mechanical-
completeness). The registry makes each case a one-liner added **when its
owning subsystem enters scope** — not a backlog to burn down. The min
scope ("wander Britain + talk to NPCs") is reached with just door + crank
(USE) + LOOK/GET/DROP + I-11/I-12 talk; the rest are post-min-scope and
may never land unless the scope grows. So when a future session asks
"when do we finish USE?" — the answer is "per subsystem, incrementally,
and most never."

| Case(s) | Gated on | When |
|---|---|---|
| door `129-12C` | movement | **I-10c (now)** |
| crank → drawbridge `120`/`10D` | castle access / NPC #12 | **I-10d (now)** |
| lever/switch → portcullis `10C`/`0AE` | a gated area on the wander path | small follow-on, same pattern |
| lantern/candle/torch | the lighting model (deferred) | with the lighting step |
| ladder/grate `131` → level change | dungeons / map-level transitions | when leaving the overworld |
| food / consume `073-075` | hunger / inventory-consume | quick add, only if it matters |
| vehicles `19C/19E/19F/1A7/1AF/1AC` | the vehicle subsystem | its own step — likely out of min scope |
| spellbook/scroll cast `03F/040` | magic (`C_1944_4C2F`, deferred) | when magic matters |
| instruments / moonstone / clock / one-offs | music / moongate / misc | likely never, unless scope grows |

### Sub-steps (each ≈ one save-point, browser-verified; squashed into one `impl I-10` per the I-7/I-8 default — unless kept separate like I-9)

**USE-first ordering (Zane 2026-06-03):** build the dispatcher against
its only table-dispatched consumer (USE), then the single-handler verbs
(LOOK/GET/DROP) follow as level-1 registrations.

- **I-10a — message channel.** New DOM surface + a `message(text)` API
  + scrollback + styling (gold-on-black, matches the HUD palette).
  Verify: lines render + scroll, survive a region stream/pan.
- **I-10b — dispatch core (USE-shaped) + verb-first front-end +
  targeting cue.** `pickAtCell` (generalize `inspectAtCell`); the
  `dispatch` pipeline (validate/face/cost + the USE-specific re-pick
  `C_27A1_0919`); **both dispatch levels** — verb→handler AND USE's
  object-type map; the `pendingVerb` state + `#probe-cell` verb-tag
  (#3) + Esc-cancel + the "What?" / "Out of range!" refusals. Proven
  with a **trivial USE handler** (echo the object name / "Nothing
  happens") so the plumbing is validated before any real effect.
  Verify: press `U` → cursor tagged "Use" → confirm hovered cell →
  echo line.
- **I-10c — USE → door.** First real handler: the door (`C_27A1_2A44`,
  `OBJ_129-12C`) — open/close + locked check, toggling the door frame
  so the player can walk through. Closes the I-9/I-10 door seam (I-9
  left player doors requiring USE; humanoid NPCs phase, player must
  open). Verify: USE a closed door → opens → walk through; locked →
  "It's locked.".
- **I-10d — USE → crank (drawbridge).** The castle drawbridge control:
  the **crank** `OBJ_120` → `C_27A1_433D` (seg_27a1.c:2056, "use
  crank") — quality-matches the linked drawbridge tiles `OBJ_10D` and
  toggles them (`C_27A1_3F47` + the "drawbridge related" helper at
  seg_27a1.c:1898; "Open/Close the drawbridge."). Needs **`OBJ_10D`
  frame-aware passability** so the bridge is crossable only when open —
  which is also the piece relevant to the I-9 **NPC-#12** teleport-to-
  dinner case (a closed/unmodeled bridge is why #12 teleports; a
  modeled, open bridge lets it path). Sibling USE-driven quality-linked
  controls — portcullis **lever** `OBJ_10C`→`C_27A1_4479`, and **switch**
  `OBJ_0AE`→`C_27A1_4672` — are **deferred** and use a *different* target
  mechanism: rather than frame-toggling a persistent object in place (the
  crank → `OBJ_10D`), they **add/delete** an object (`OBJ_136` portcullis /
  `OBJ_0AF`) at quality-matched `OBJ_12D` marker locations. So the crank is
  the one with frame-aware passability; the siblings spawn/despawn the
  blocker. Verified 2026-06-03: `OBJ_136` is created/destroyed ONLY in
  `C_27A1_4479` (seg_27a1.c:2110/2118/2121) — not the conversation VM.
- **I-10e — LOOK.** Follows the pattern as a single-handler verb (line
  + modal-escalation, #2). Verify: `L` → cursor tagged "Look" → confirm
  cell → "You see…" line; a container → inspector modal.
- **I-10f — GET / DROP.** Inventory ops via the I-6 data layer
  (`Container`/`ContainedIn`; the `GiveObj`/`TakeObj`/`InsertObj`/
  `MoveObj` analogs — **audit `world_loader.js` for what exists first**)
  + message feedback. Weight gate optional-faithful; **theft/karma
  deferred** (no karma system yet). Verify: get a ground item →
  inventory updated + "You get…"; drop → back on the ground.

### Pre-impl reads needed first (research-before-impl convention)

- **`C_27A1_2A44`** (door USE) — only tabulated in
  [research_object_interaction.md](research_object_interaction.md)
  §"Use", body not read: open/close/unlock logic + frame mapping for
  `OBJ_129-12C`. Read before I-10c.
- **`C_27A1_433D` (crank) + `C_27A1_3F47` + the "drawbridge related"
  helper (seg_27a1.c:1898)** — the crank→`OBJ_10D` toggle geometry +
  how the bridge's open/closed frame maps to passability. Read before
  I-10d.
- **`world_loader.js` mutation helpers** — confirm which of
  `GiveObj`/`TakeObj`/`InsertObj`/`MoveObj` already exist (`inventoryOf`
  does) before I-10f, per the no-reinvention rule.

### Deferred (not in I-10)

- **Target-first front-end** — click a cell (no pending verb) → context
  menu of applicable verbs (`appliesTo(target)` predicates) → dispatch.
  Architecturally free at the core (same `dispatch`), but its real cost
  is the menu widget + predicates. Ships as a thin later front-end (its
  own small step or I-10e), so I-10 isn't gated on it and verb-first
  validates the core first. When it lands, TALK + every verb get the
  second route for free.
- **MOVE** (push furniture, `C_27A1_1E8B`) — puzzle verb, not needed to
  wander. **Vehicle gate** (get/drop/move/cast blocked on a boat) — no
  boats yet. **Theft/karma** coupling on GET/MOVE — no karma system.
  **NPC portraits** on LOOK. **Full inventory panel view** (GET/DROP are
  message + data only for now). **Portcullis lever / switch USE**
  (`OBJ_10C`→`C_27A1_4479`; `OBJ_0AE`→`C_27A1_4672`) — the crank's sibling
  USE-driven quality-linked controls, but with a *different* target
  mechanism: they **add/delete** an object (`OBJ_136` portcullis / `OBJ_0AF`)
  at quality-matched `OBJ_12D` markers, vs the crank's in-place **frame-toggle**
  of the persistent `OBJ_10D` bridge. Deferred; fold in when those gates
  matter. (The drawbridge **crank** `OBJ_120` itself is **I-10d**, not deferred.)
  **Cast** (`C_1944_4C2F`) — when magic matters.

### Reuse-from-existing (no reinvention)

- `inspectAtCell` (main.js) → generalize to `pickAtCell`.
- `openInspector` + `UIStack` (view/inspector.js, view/ui_stack.js) →
  LOOK's structured escalation (#2).
- `getTileLook` / inspector `nameFor` → the LOOK line's object name.
- `inventoryOf` (world_loader.js:161) → GET/DROP list shape.
- `canStandAt` (I-4 passability.js) → placement legality.
- I-8 facing (humanoid_anim / `MACRO_A`) → face-the-target.
- `TurnClock` suspend + `uiStack.isEmpty()` gating → centralized in the
  dispatcher instead of repeated per handler.
- `#probe-cell` (view/dev_probe.js) → the targeting cursor tag (#3).
