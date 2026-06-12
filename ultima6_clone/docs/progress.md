# progress — ultima6_clone

The implementation-step ledger (matches `asteroids_clone` / `phoenix_clone`
convention: numbered `I-N` steps, each with a "scope" subsection carrying the
per-sub-step notes that don't fit a commit body). Research-side truth lives in
`research_*.md`; the architecture the steps build to is `architecture_ecs.md`.

**Status: I-17 (NPC AI behaviors) COMPLETE (2026-06-11) — the moving schedule worktypes are now active per-turn behaviors: `WANDER`/`GRAZE` (`C_1E0F_37DB`), `LOITER`/`FARM` (`C_1E0F_33C4`), `GUARD` pacing (`:1820`), all riding the I-14 accumulator via the probability×accumulator contract (the credit gate is the beat; source's per-turn die picks step-vs-idle; idle spends too, so a high-DEXTE NPC can't bank beats into a burst). Plus I-17d: a displaced settle-in-place NPC (shoved aside by a passing NPC's step-aside) stands up, then returns to post + re-poses once the slot cell clears. `RINGBELL` (on-demand bell tile-anim) split to its own later step; combat/thief/law deferred by design. test_pathfinding 194/194; WANDER+LOITER live-verified on real data. See §"I-17 scope". Next: I-18 (status panel).** Prior: I-16 (arrival behaviors + direction system, §"I-16 scope") and the conversation system I-12/I-13 (walk + talk end-to-end, §"I-13 scope").

This banner is the **single canonical current-status line** — `CLAUDE.md` and
`DOCUMENTATION_INDEX.md` point here instead of mirroring it (convention: §"Doc maintenance").
**Per-step detail** lives in each step's **§"I-N scope"** section below; **at-a-glance status**
is the **ledger**. Standing cross-cutting items, each with its own section: the **post-I-9
deviation audit** — idle-heartbeat fork **DECIDED (keep heartbeat; settled model = DEXTE-paced
per-actor accumulator — a modern rewrite of the MovePts/DEXTE economy, NOT a round-driver port:
one master `WORLD_SPEED` slider, decoupled clock, snap tile-to-tile, fixed-brisk non-laggy player,
no auto-pass)**; the movement-model impl (I-14) + I-9f drop stay **deferred** (§"Post-I-9 — deviation
audit"); the **render-to-fit viewport** refinement landed 2026-06-05 (§"Render-to-fit viewport").

## Doc maintenance — keep status in ONE place

To avoid rewriting the same status prose in five files per step (the drift that left this
banner ballooned and `DOCUMENTATION_INDEX` stale at I-10), the convention is:

- **This banner** is the single canonical current-status line — one line: `I-N (title)
  COMPLETE; Next: I-N+1`, plus standing cross-cutting deferrals. Don't paste sub-step detail
  here; it's in §"I-N scope".
- **Per step, the only substantial writes are** a new **§"I-N scope"** section (the real
  record — decisions, sub-steps, deviations) + a terse **Journal** entry (discoveries +
  next). Everything else is a one-line touch: this banner, the **ledger row**, the
  `CLAUDE.md` stage pointer, and the memory pointers.
- **`CLAUDE.md` "Project stage"** and **`DOCUMENTATION_INDEX.md`** carry a pointer here, NOT
  a status mirror. `CLAUDE.md`'s durable content (architecture, conventions, kept-deviations,
  code layout) is what changes rarely and stays there.

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
| I-10 | object-action dispatch core — `Map<verb,handler>` + `Map<ObjectType,useHandler>` registries; verb-first front-end + message channel + fixed UI shell; USE door/lever/switch/crank, LOOK + GET/DROP, MOVE push + give, the inventory window | **complete** (a–j — USE/LOOK/GET/DROP/MOVE-push/give + inventory window; further USE cases demand-driven) |
| I-11 | talk trigger — adds TALK as a case in the I-10 dispatch (reach-7 target-pick + the can-talk gate; single-stage, stops before the conversation VM) | **done** (a–c) |
| I-12 | dialog window — second surface on the I-7 substrate; opens when TALK fires (modal frame + four-region layout + real lazy-decoded portrait; chips/input inert — I-13 wires them) | **done** (pre-step + a–c) |
| I-13 | conversation VM — **standalone generator yielding typed effects** + host driver; swaps the I-12 window's placeholder body for real lines + clickable `@`keywords/chips + live input. β reached: walk + talk works end-to-end against real `converse.a/.b`. | **done** (pre-step + a–g + review; squashed) |
| I-14 | **NPC movement speed (DEXTE-paced accumulator)** — replace I-9's flat step-rate with a per-actor `moveCredit` accumulator (DEXTE = speed meter, `SubTerrainMov` = step cost); a *modern rewrite* of the `MovePts`/`DEXTE` economy, NOT a `C_1E0F_4E0A` round-driver port. One master `WORLD_SPEED` slider, decoupled clock, snap tile-to-tile, fixed-brisk non-laggy player. Restores terrain-/dex-speed + staggering, fixes the flat-step thrash. Foundation for the NPC-movement arc. | **done** (a–e; squashed + pushed) |
| I-15 | **drunk-walk approach** — `TryMoveTo` greedy fallback chain + `__TryDiagMove` corner-clearance (the pathfinding-less move primitive for chase/flee). Rides on I-14. New `systems/drunk_walk.js`; no live consumer yet (I-17 wires it); dev hook `__U6.driveTo`. | **done** (a–c + step-aside; squashed + pushed) |
| I-save/load | **save/load — full-snapshot JSON persistence** — generic ECS snapshot (every live entity's components + mutable resources) → JSON; Export downloads, Import re-uploads + restores on reload. Restore *replaces* `loadActors` and re-marks `loadedRegions`, so deletions stay dead + mutations survive without tombstones (`research_save_load.md`). Non-numeric label keeps the I-16…I-19 arc intact. | **done** (a–g, 2026-06-10) |
| I-16 | **arrival behaviors + direction system** — `__AtDestination` prop lookup for sit/sleep/eat/play (`C_1E0F_2184` + `FindLoc`/`NextLoc` multi-tile footprint + `D_0658`) + fallbacks, eating dynamic facing (`C_1E0F_2125`), the `C_1E0F_0664` frame system (humanoid + non-humanoid per-type arms) + chair-overrides-facing, sprite-restore-on-wake, and (d) `AI_SCHEDULE` continuous-settle (`resolveActiveSlot` + per-tick `__AtDestination`). | **done** (a–c + 2 review fixes + d; carries the AI-mode dispatch coverage table) |
| I-17 | **NPC AI behaviors** — the moving worktypes as active per-turn behaviors: `WANDER`/`GRAZE` (`C_1E0F_37DB`), `LOITER`/`FARM` (`C_1E0F_33C4`), `GUARD` pacing, via the probability×accumulator contract; + **I-17d** displaced settle-in-place NPCs stand aside on a shove & return to post + re-pose when the slot clears. `RINGBELL` split to its own later step; thief/law + combat deferred by design. See §"I-17 scope". | **done** (a–d) |
| I-18 | status panel — third surface on the substrate; replaces the dev HUD's clock readout (was I-14→I-17) | planned |
| I-19 | object-action handlers expansion — fills in the rest of `seg_27a1.c`'s dispatch table (spellbooks / moonstones / instruments / etc.); each handler tied to its owning subsystem when that subsystem lands (was I-15→I-18) | planned |

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

**FORK DECIDED (Zane 2026-06-08): KEEP the idle heartbeat — reverting to turn-based is NOT the
expectation.** The audit's movement items therefore collapse into ONE settled model (below), not
a deferred fork.

**SETTLED MODEL — DEXTE-paced per-actor accumulator (Zane 2026-06-08, refined through a design pass; SUPERSEDES the earlier "faithful round-driver port + idle auto-pass" framing that `fcc3a1d` committed).**
A **modern rewrite** of U6's `MovePts`/`DEXTE` economy as a **continuous per-actor accumulator** — NOT a
port of the `C_1E0F_4E0A` round driver. Keep the *mechanic* (DEX = speed, terrain = cost); drop the
turn-loop *substrate* (no shared pool, no refill event, no ratio-priority round-robin, no idle
auto-pass). This is the correct call per this project's "modern rewrite" choice (`CLAUDE.md` →
[[feedback_retro_port_translation_choice]]): the round-robin/refill/auto-pass driver is exactly the
shape a single-threaded, blocking-input 1990 loop takes — forcing it onto the clone's continuous 100 ms
heartbeat is what produced the "chaos" that drove this reframe. The same *observable* behavior (DEX
speed-variation = staggering; terrain slowdown; overdraft delay) falls out of the accumulator
continuously instead of bursting per round. (Source-mechanism reference still: `research_npc_ai.md
§"Move-point economy"` + `U6_世界推進_回合節拍.md`; we reinterpret it, not transcribe it.)

**The model:**
- **Per actor, each heartbeat (100 ms fixed):** `moveCredit += rate(DEXTE) × WORLD_SPEED × dt`; when
  `moveCredit ≥ stepCost`, **move one tile and subtract the cost**. Movement is **snap tile-to-tile, no
  render interpolation** (faithful to source's per-pick redraw — Zane 2026-06-08). **Cap** a stationary
  actor's credit at one step's cost (no banked multi-tile dash when it later gets a destination).
- **`rate(DEXTE)` — DEXTE is a *speed meter*** (the dexterity stat, 1–30, `seg_0C9C.c:303` from objlist),
  used for the relative ordering and **mapped into a feel-calibrated band, NOT its raw scale.** Anchor:
  reference DEX ≈ 15 → ≈ 2.5 tiles/s on open ground (sets the slider default); **floor** effective DEX
  (~6) so the slowest creature still ambles. NPCs keep the full spread (horse fast, slime slow) — it's
  characterful ambient life. Source values are the *inputs*; the ms-per-tile mapping is ours, tuned live.
- **`stepCost` = `SubTerrainMov`** (`seg_1E0F.c:1402` = `5 + Σ(TerrainType>>4)` over the actor's tile +
  stacked objects; `SubMov` `seg_1E0F.c:441` modifiers: horse ½, slow/haste spell ½/×2, min 1).
  **Per-location, shared by all actors on that tile** (NOT per-NPC). Diagonal cost lives in
  `__TryDiagMove` — I-15.
- **Player movement = fixed-brisk, never gated → zero input lag** (Zane 2026-06-08). The player does
  **NOT** use DEX-scaling (a sluggish low-DEX avatar everywhere feels bad; the player-facing point is
  terrain-speed, not avatar-DEX-speed). Design: **standing still leaves the player "ready" (credit
  banked to one step), so a keypress after any pause steps instantly that frame**; a post-step
  **cooldown = terrain-scaled** rate-limits *sustained* walking only. Open ground → cooldown < key-repeat
  (continuous smooth walk); swamp → visibly slower, but the first step is always instant. The
  distinction that dissolves the lag worry: "lag" = delay before responding (none here) vs "throttle" =
  capped sustained rate (intended — it IS the terrain mechanic).
- **Clock = DECOUPLED** (Zane 2026-06-08). Advances on its **own** real-time cadence, **not** tied to
  rounds/refills (source's per-refill `C_0A33_1355(1)` tick is turn-loop convenience → dropped, a kept
  clone deviation per the modern-UX anchor). Schedules read the independent clock. Why: a per-refill
  clock would make time-of-day speed up in empty areas / slow down in crowds (an NPC-density artifact);
  decoupling also auto-fixes today's runaway 600× idle clock.
- **`WORLD_SPEED` = ONE master slider** (Zane 2026-06-08) in the world-clock UI — scales **every actor's
  fill rate AND the decoupled clock together**: slow → everything ambles, **slow-end = frozen** (recovers
  source's "world stops when idle" feel), fast → bustle. **Log-scaled.** The 100 ms heartbeat stays
  fixed; the slider changes the *rate*, not the frame interval. Pairs with the world-clock surface
  (dev-HUD clock now → **status panel I-18**).
- **Staggering & blocking** emerge from independent per-actor credit phases (actors cross the threshold
  on different heartbeats), so a blocker usually vacates before/after a blocked NPC, not simultaneously —
  no global interleave needed. Residual blocks ride the existing `84/85/86` wait-and-replan
  (`npc_path.js:98-100`); **build-time check:** confirm it still de-gridlocks. **I-9f
  teleport-to-previous is a non-faithful band-aid → DROP it** once this lands; blocked-NPC behavior then
  follows `U6_NPC_排程與移動邏輯.md §五` (waited-out, not warped — lenient Chebyshev ≤ 1 arrival; catch-up
  via hourly schedule re-target §二 + off-screen visibility teleport §六).
- **Data:** `assets/objlist.js` already decodes `a.dexterity` (0x0a00) — carry only that into a
  component. `a.movePts` (0x14f1) is now **unused** (the accumulator needs no saved per-round budget).

**After the full port — new-mechanism study (Zane 2026-06-02).** If the idle heartbeat
stays, a later study may add mechanisms the original LACKS (NPC-NPC swap, local detour,
actor-aware/soft-cost re-planning) to make NPC movement feel right under auto-advance.
Legitimate non-faithfulness: the original has no mechanism for a problem it doesn't have,
so inventing one solves a clone-only problem (per CLAUDE.md §"Modern-browser UX as
architectural anchor").

**NPC step-aside — PULLED FORWARD (Zane 2026-06-08), the first such clone-only mechanism.**
Surfaced reviewing I-14/I-15: under auto-advance an NPC blocked by another *actor* (NPC or
party member) visibly stalls (source has no actor detour/swap and just waits — §5.1, invisible
behind the turn-based freeze). Added to `doOnPath` (`systems/npc_path.js`): on the **first**
block (`AI_ONPATH`), if an actor holds the next cell, `requestStepAside` nudges that blocker
one cell **perpendicular to the mover's travel axis** (E/W mover → step the blocker N/S; N/S
mover → E/W — clearing the exact lane; perpendicular-only, so a 1-wide corridor with both
sides blocked falls through to the wait), then **both re-plan** (`AI_FINDPATH`, status `'aside'`). Gated to the first block only — a static block, a boxed-in
blocker, or any later block (`84/85`) falls through to source's faithful `84/85/86` grace-wait.
Only a **mid-journey** blocker (already in the pathfinding tier) is re-pathed — re-finding
sends it toward its OWN goal, away from the contested cell. A **settled** blocker (worktype /
schedule / party — modes outside 0x81..0x86) is **left where it stepped** and keeps its mode:
its goal is the very cell it was pushed off (its schedule slot), so re-pathing it there caused
an infinite push↔return loop (caught in review — LB vs the jester at a chokepoint). Left put,
it re-snaps to its slot at the next schedule hour. The step-aside is a reactive "free" move
(not accumulator-gated).
**Still deferred:** full swap / actor-aware soft-cost re-planning (revisit if step-aside churns
under real I-17 AI traffic). Detail: `progress.md §"I-15 scope"`; verified test_pathfinding 9
step-aside cases + live two-NPC block.

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
- **#2 — LOOK = line only; `I` stays a separate always-modal "Inspect"
  tool (revised 2026-06-04).** Plain LOOK → a line in the message channel
  and nothing more: source's `C_27A1_0C67` is a pure scroll verb that
  **never** opens a panel or lists a container — its one "structured"
  branch is book/sign *reading* (`C_27A1_06D7` CanRead → `C_27A1_078F`
  reads `BOOK.DAT`), not a contents walk
  ([research_object_interaction.md](research_object_interaction.md)
  §"Look"; seeing inside a container is a USE/GET interaction, the
  `D_E709` open-container view). So the faithful LOOK is line-only. The
  **`I` hotkey is kept as a separate, clone-only "Inspect" tool** — always
  open the I-7 detail modal (obj#/status/position/contents) for any pick.
  `L` and `I` are therefore **deliberately distinct**: L = the description
  line, I = the structured detail/inventory view. (Revises the original
  2026-06-03 call, which had LOOK escalate to the modal for containers —
  the I-10f impl + a source re-check falsified it: `C_27A1_078F` is
  book/sign reading, not a contents list.)
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

- **I-10a — message channel + fixed UI shell. ✓ landed** (see
  "I-10a — landed" below). New DOM surface + a `message(text, cls)` API
  + scrollback + styling, built on a fixed game-shell grid.
- **I-10b — dispatch core (USE-shaped) + verb-first front-end +
  targeting cue. ✓ landed** (see "I-10b — landed" below). The
  `dispatch` pipeline + both registry levels + the verb-first front-end
  + `#probe-cell` cue + refusals, proven with a trivial echo USE
  handler.
- **I-10c — USE → door. ✓ landed** (see "I-10c — landed" below). The door (`C_27A1_2A44`,
  `OBJ_129-12C`) — open/close + locked check, toggling the door frame
  so the player can walk through. Closes the I-9/I-10 door seam (I-9
  left player doors requiring USE; humanoid NPCs phase, player must
  open). Verify: USE a closed door → opens → walk through; locked →
  "It's locked.".
- **I-10d — USE → lever / switch (quality-linked controls). ✓ landed**
  (see "I-10d — landed" below; reordered ahead of the crank, Zane
  2026-06-04). Lever `OBJ_10C`→`C_27A1_4479` (portcullis `OBJ_136`) +
  switch `OBJ_0AE`→`C_27A1_4672` (electric field `OBJ_0AF`) — both
  **add/delete** the gate object at quality-matched `OBJ_12D` markers.
  Builds the shared map add/delete primitives (also used by I-10e crank
  + GET/DROP).
- **I-10e — USE → crank (drawbridge). ✓ landed** (see "I-10e — landed"
  below). The castle drawbridge control:
  the **crank** `OBJ_120` → `C_27A1_433D` (seg_27a1.c:2056) → `C_27A1_3F47`
  (seg_27a1.c:1942). **Correction (read 2026-06-04):** the crank does NOT
  frame-toggle `OBJ_10D` in place — it `SearchArea`s for the bridge by
  quality, then **deletes every bridge tile and re-adds them in the new
  shape** (raised = edge tiles frames 6/7/8; lowered = a span across the
  moat, frames 0–5), gated by an occupancy check (can't close if someone's
  on it) + a water-clearance whitelist (`D_1D0A`, can't open onto non-
  water), plus `MoveObj` for anything on the bridge. ~110-line geometry
  port on the I-10d primitives. Relevant to the I-9 **NPC-#12** teleport
  (closed bridge → can't path → teleports; an opened bridge lets it path).
- **I-10f — LOOK. ✓ landed** (see "I-10f — landed" below). Single-handler
  verb; a source-faithful **line-only** description (no panel); viewport-range.
  The `I` hotkey stays a separate "Inspect" detail modal (L and I distinct).
  Verified live: terrain/item/NPC/container → line; `I` → detail modal.
- **I-10g — GET. ✓ landed** (see "I-10g — landed" below). Pick up an
  adjacent ground object into the active member's inventory
  (`C_27A1_18F5` → `moveToInventory` = `InsertObj INVEN`). **The
  `TypeWeight==0` fixed-object gate IS ported** (scenery/furniture →
  "You can't get that."; `reg.weightOf`, data from the tileflag plane);
  carry-capacity (`STREN*20`) + **theft/karma deferred**. Verified live:
  fixed carpet refused, real item → inventory; out-of-range / nothing-here.
- **I-10h — DROP. ✓ landed** (see "I-10h — landed" below). Two-stage target
  (faithful to source's `D` → inventory panel → "Location:", `SelectRange 7`):
  `D` → modal inventory picker (**recursive** — drills into nested containers;
  opens the hovered party member's inventory, else the avatar's) → pick item →
  armed map cursor (reach 7) → click/Enter a passable cell → `dropToMap`. Verified
  live: Orb dropped; **gold nuggets dropped out of Dupre's nested bag**; out-of-range
  / impassable handled. Throw animation + break-if-far + quantity + drop-into-
  container deferred. **(I-10j later migrated DROP onto the inventory window — `D` now
  lives in the window; the standalone `D` map-hotkey + `openInventoryPicker` retired.)**
- **I-10i — MOVE Mode 1 (push a ground object). ✓ landed (verified live).**
  (see "I-10i — landed" below). Push an adjacent world object one tile in a chosen
  direction (`C_27A1_1E8B`, the LOCXYZ branch). **New targeting shape — two-stage,
  direction-not-cell:** arm `M` → pick the object (Enter/click, adjacency-gated) →
  press a **direction** (arrow/numpad). The `TypeWeight==0` fixed-object gate
  (`reg.weightOf`, shared with GET) + the **verified `C_27A1_1DAB` diagonal
  corner-clearance** are ported. Mode 2 (give/transfer a carried item) is **I-10j**.

### I-10a — landed (UI-shell decision + message channel)

I-10a forced the UI-layout decision the scope above left open ("Layout
… settled in I-10a"). Resolved with Zane 2026-06-03:

**UI-shell model — Fixed Shell grid (LOCKED), Dynamic Dock as a named
later upgrade.** A fixed CSS-grid frame with named regions; components
are assigned to a region, no runtime drag/dock. The decision is *not*
high-lock-in because the real base is the **content/placement seam**,
not the grid: every panel is built as (a) a layout-agnostic data layer
(an ECS resource) + (b) an installer that's *handed* its DOM element
and knows nothing about page layout. The codebase already followed this
(`installDevHud(world, {hudEl, …})`, `installDevProbe`, `UIStack`), so
switching to a dynamic dock manager later is "write the dock manager +
re-parent the same panels," not a rewrite — same pivot-not-redesign
framing as the ECS Pure-primary / Hybrid-escape-valve decision. Modern
look (NOT U6's parchment frame) is the eventual direction; this step is
clean-neutral *structure* with the modern skin deferred to a later
pass (the seam makes the skin independent of the structure).

**What landed:**
- `resources/message_log.js` — `MessageLog` resource: capped ring
  (200) of `{text, cls}` lines, `push()/clear()`, a `revision` counter.
  The CON_printf analog's data half; layout-agnostic.
- `view/message_channel.js` — `installMessageChannel(world, {el})`: a
  render-flush system that rebuilds the list only when `revision`
  changes (idle = one int compare/frame; rebuild only on a message),
  auto-scrolls to newest, returns a `message(text, cls)` emitter. The
  placement half of the seam; mirrors `installDevHud`.
- `index.html` — the fixed game-shell grid: MAP (canvas, 1024×640
  unchanged) / MESSAGES (bottom strip) / RIGHT panel (spans both rows).
  Right panel = `#status-panel` placeholder (for I-13) over a
  collapsible `#dev-block`. The dev HUD + boot `#log` **relocated** into
  the dev block — `installDevHud`/`installDevProbe` unchanged (handed
  the same element IDs in new homes), which is the seam's proof. The
  pause indicator now tints `#clock-text` instead of a fixed-box border.
  Pre-load checklist/dropzone unchanged; `#app` hidden until `load()`.
- `main.js` — register `MessageLog`; reveal `#app` at the top of
  `load()`; install the channel + expose `window.__U6.message`; push a
  welcome line; drop the redundant `canvas.style.display` toggle.

**Verified live on Zane's real U6 data (port 8083):** shell geometry
exact (1312-wide frame = 1024 map + 280 panel + 8 gap; messages 1024×157
below the map; right panel full-height); Britain renders in MAP; the
message channel shows the welcome line via the real resource path, and
`window.__U6.message()` appends with correct color classes (default /
`miss` red / `ok` green) + auto-scrolls; dev HUD populated (clock, NPC
stats, probe, boot log); no console errors. Render-flush is next-frame
(push is synchronous, DOM updates on the following rAF) — expected.

**Deferred (Zane 2026-06-03):**
- **Fit-to-window** — RESOLVED 2026-06-05 by the render-to-fit refinement: the canvas
  drawing buffer now tracks its CSS cell size and the shell fills the window, so the page
  no longer pans. Full write-up in §"Render-to-fit viewport".
- **Modern skin pass** — clean-neutral palette/structure now; modern
  typography/spacing/visual language is a later CSS-only pass on the
  stable shell.

### I-10b — landed (dispatch core + verb-first front-end)

The object-action dispatch core, proven against USE with a trivial echo
handler (real effects in I-10c+). Lifts the *structure* of source's
shared targeting block (verb-agnostic targeting + a verb→handler split,
seg_0A33.c:1231-1278) but not its substrate (CMD_* ints, double
`CON_getch`, global `Selection`/`MouseMode`/`D_04C2`, the giant switch).

**What landed:**
- `systems/cell_pick.js` — `makePickAtCell(world, reg)` → the
  source-faithful 3-tier pick (NPC > object > ignore-tile,
  mkMouseSelection→`C_2337_08F1`) returning a HANDLE; `{forUse}` option
  = source's USE re-pick `C_27A1_0919` (objects only, skip NPCs).
  **Generalized from main.js's inline `inspectAtCell`** — the inspector
  hotkey and the dispatcher now share one pick (the inline copy in
  main.js is gone).
- `resources/commands.js` — `Commands` resource: `verbHandlers`
  (`Map<verb, fn>`, single-function verbs) + `useHandlers`
  (`Map<objNumber, fn>`, USE's additive type table) + `register` /
  `registerUse([types], fn)` (list = fall-through group). Holds only
  ported handlers.
- `systems/command_dispatch.js` — `installCommandDispatch`. The
  `dispatch({verb, target})` pipeline: verb lookup (→ "What?" if
  unknown) → adjacency `withinReach` (wrap-aware Chebyshev ≤ 1 from the
  avatar; → "Out of range!") → verb handler. **Face-the-target +
  move-point cost are deferred** to the real handlers (time already
  advances on the turn heartbeat, so the echo needs neither). The USE
  verb-handler is the shared wrap: re-pick (`forUse`) → look up
  `useHandlers` by objNumber → call, else echo `Nothing happens.
  (name)` + `console.warn` (the unported-type path; tightens to "Not
  possible!" once real handlers + a usability flag exist). Verb-first
  front-end: a `keydown` arms a verb key (`U`→use; extensible), the
  `#probe-cell` highlight recolors + shows a verb label (decision #3,
  visual cue — no source text-echo), Enter confirms the hovered cell
  (`probe.getLastCell()`), Esc → "What?" + disarm. Returns `{dispatch,
  isPending}`.
- `view/inspector.js` — exported `displayName(world, handle,
  {reg, objlist})` (GetObjectString-faithful) so the echo reuses the
  inspector's name resolution.
- `index.html` — `#probe-cell.armed` recolor + `.probe-verb-label` cue
  styling.
- `main.js` — register `Commands`; build `pickAtCell` via
  `makePickAtCell`; install the dispatcher; **refactor the I-7c
  inspector hotkey** to use the shared `pickAtCell` + gate on
  `!cmd.isPending()` (no inspecting mid-aim); expose `window.__U6.cmd`
  / `.pickAtCell` for live debugging.

**Verified live on real U6 data (port 8083):** avatar at (307,352);
`dispatch use` on the adjacent object (306,351) → `Nothing happens.
(carpet)` (name via the GetObjectString path; carpet picked through the
`forUse` ignore-tile fallback); a far cell → `Out of range!` (red); an
unknown verb → `What?` (red); arming `U` sets `pending` + the `armed`
class + the "Use" label, Esc clears all three. No console errors.

**Deferred to I-10c+ (as scoped):** the real USE effects (door, crank);
LOOK/GET/DROP; face-the-target; move-point cost; the target-first
front-end (click → verb menu).

### I-10c — landed (USE → door)

First real USE handler — the door quartet `OBJ_129-12C` (Oaken /
Windowed / Cedar / Steel), all routed to one handler (source's USE
switch sends them to `C_27A1_2A44`, seg_27a1.c:3069). Pre-impl read of
`C_27A1_2A44` (seg_27a1.c:1280) done.

**Door frame model (`C_27A1_2A44`):** low 2 bits = orientation/variant;
bits 2-3 = state — 0 open, 1 closed (unlocked), 2 key-locked, 3
magically locked. In source, plain USE (flags 0,0,0) toggles the
open↔closed bit on an unlocked door and **refuses** a locked one;
unlocking needs the matching key or a spell (the `bp0a`/`bp08`/`bp06`
arms, via `C_27A1_2D8E` / magic).

**TEMPORARY lock bypass (Zane 2026-06-04):** the clone **force-opens**
a locked door instead of refusing. The faithful unlock needs (a) the
matching key — e.g. the quality-1 key for the steel door at (304,382)
gating the castle drawbridge/portcullis — which U6 hands the player via
**Lord British's conversation** (the conversation VM = I-13, not built),
and (b) a USE-an-inventory-item-on-a-target front-end (deferred).
Investigated 2026-06-04: no quality-1 key exists in the loaded start
region (only a quality-14 key at (298,355) + three quality-0 lockpicks
held by NPCs; lockpicks open quality-0 locks only), so a locked door
would dead-end progress. **REVERT** to the source-faithful refusal +
key/lockpick unlock once I-13 + the key mechanism land.

**What landed:**
- `world_loader.js` — `setObjectFrame(world, handle, frame)`: the shared
  mutation primitive (mirrors source `SetFrame`) — sets `ObjType.frame`
  + refreshes `Renderable.tileId` via `reg.tileForObject`. Every USE
  frame effect (door now; crank/lever later) and any future frame change
  goes through it. (GET/DROP — I-10g/h — use their own `moveToInventory` /
  `dropToMap`, not this primitive.)
- `systems/use_handlers.js` — `useDoor` (open↔closed toggle; **locked
  doors are force-opened** per the bypass above — preserves the low-2-bit
  orientation, clears the lock) + `registerUseHandlers(world)` registering
  `DOORS = [129,12A,12B,12C]` via `Commands.registerUse`. The handler does
  ONLY the effect; the
  dispatcher's shared wrap (re-pick, adjacency, lookup) is unchanged —
  adding the door was one `registerUse` + one effect fn. The seam's
  payoff.
- `main.js` — call `registerUseHandlers` after the dispatch install;
  expose `window.__U6.commands` + `.stores` (dev hooks).

**Passability follows for free** (the I-4 per-frame-tile-flags finding):
opening the door changes its `tileId`, and `canStandAt` reads the live
tile flags — no special-case. Verified: the closed oaken-door tile 1031
is impassable+wall, the open tile 1027 is neither.

**Verified live on real data (port 8083):** all 4 door types
registered. Unlocked oaken door (296,351, obj 297, frame 7): USE → "You
open the door." (frame 7→3, tile 1031→1027) → USE → "You close the
door." (3→7). Far door (300,347) → "Out of range!". The **key-locked
steel door at (304,382)** (obj 300, frame 9, quality 1 — the
drawbridge/portcullis gate): USE → "You force the door open." (frame
9→1, tile 1081→**1073, now passable**) → USE → "You close the door."
(→5, unlocked-closed). Passability flips with the frame (closed 1081
impassable, open 1073 passable). No console errors.

**Closes the I-9/I-10 door seam + unblocks the drawbridge route:** the
player can now pass the locked steel door to reach the castle's south
gate controls — lever→portcullis at (303,383) + cranks→drawbridge at
(303,384)/(311,384), bridge tiles (303–310,385) (all confirmed in
region 26). **Deferred:** the real key/magic unlock (see bypass note —
keys arrive via I-13 conversation); the I-9 non-humanoid door-phasing
predicate (`isHumanoid` vs `MONSTER_4000`) is a separate I-9 audit item.

### I-10d — landed (USE → lever / switch, + the map add/delete primitives)

Reordered ahead of the crank (Zane 2026-06-04): build the shared add/
delete map primitives on the *simpler* quality-linked control first, then
the crank (I-10e) reuses them. Pre-impl reads of `C_27A1_4479` (lever),
`C_27A1_4672` (switch), `C_27A1_433D`/`C_27A1_3F47` (crank) all done.

**Source correction:** the scope above had called the crank a "frame-
toggle." Reading the bodies showed **neither** control frame-toggles —
all of lever / switch / crank **add and delete** objects. (Caught before
building, per "verify research against source.")

**What landed:**
- `world_loader.js` — runtime map-object primitives (mirror source
  AddObj/DeleteObj/SearchArea): `addMapObject` (create + `insertAtHead`),
  `deleteMapObject` (`spatial.remove` + `destroy`), `findObjectsByTypeQuality`
  (SearchArea analog), `objAtCell`, `actorAtCell` (the occupancy gate's
  actor-at-cell test, source's actor/object index split `C_27A1_3E9A`).
  Shared by lever/switch now, the crank (I-10e), and GET/DROP (I-10g).
- `systems/use_handlers.js` — `markerToggle` shared helper (flip the
  control's frame; for each `OBJ_12D` marker matching the control's
  quality, add the gate if absent / delete if present; occupancy-gate the
  add) + `useLever` (`OBJ_10C`→portcullis `OBJ_136`, frame 3 if marker
  bit 2 else 1, occupancy-checked) + `useSwitch` (`OBJ_0AE`→electric field
  `OBJ_0AF`, frame 0, no occupancy). Registered both.

**Passability follows for free:** the gate object's tile is impassable, so
add = blocked cell, delete = clear cell — no special-case.

**Verified live on real data (regions 18+26):** the castle lever
(303,383, quality 1) ↔ its `OBJ_12D` quality-1 marker at (307,384) ↔ the
portcullis (`OBJ_136`) there. USE lever → frame flips 0→1, portcullis
**deleted** (raised; cell now passable — tile 1149 is impassable) → USE
→ frame 1→0, portcullis **re-added** (dropped). "You hear a noise." each
toggle. Occupancy: with an actor spatially on the marker, USE → gate
stays raised + "You can't close the portcullis."; cleared → drops
normally. No console errors. (Switch path is the same mechanism but
untested — no `OBJ_0AE` reachable in the start area.)

### I-10e — landed (USE → crank, the drawbridge)

The geometry-heavy USE handler — port of `C_27A1_433D` → `C_27A1_3F47` in
its own module. The bridge is a run of `OBJ_10D` tiles whose FRAME encodes
position+state (raised = one row [6,7…,8]; lowered = rows spanning south
[3,4…,5] + a shore row [0,1…,2]); open/close **delete + re-add** the run in
the other shape (not a frame-toggle), on the I-10d add/delete primitives.

**What landed:**
- `systems/use_drawbridge.js` — `findBridgeAnchor` (the frame-3/6 corner,
  topmost-leftmost, matched by the crank's quality — explicit, vs source's
  reliance on SearchArea scan order), `activateBridge` (width count →
  clearance/occupancy gates → delete + re-add with the position frames →
  `MoveObj` entities onto the lowered deck), `useCrank` (`C_27A1_433D`
  entry: find bridge by quality → activate → result message), `registerCrank`
  (`OBJ_120`). Wired via `registerUseHandlers`.

**CLONE DEVIATION (flagged):** source bounds the span with a hardcoded
shore-tile whitelist `D_1D0A` = {0x10,0x1C,0x20,0x2C,0xD6} (extend over
non-whitelist cells, stop at one). The clone extends while the terrain is
**WET** and stops at the first non-wet cell (`reg.isTerrainWet`, the I-4
flag) — the representation-native equivalent of "span the water, land on the
shore," robust to our full tile ids rather than source's byte values. The
cosmetic crank-turning tile animation (`SetTileAnimation`) is dropped
(hardware effect, not gameplay).

**Verified live (regions 18+26):** the castle drawbridge — raised row at
y385 (303–310, frames 6/7/8); moat wet y386–390, shore y391. USE crank
(303,384) → "You open the drawbridge.": raised row deleted, a 7-wide
lowered span laid across the moat (rows y386–390 frames 3/4/5, shore row
y391 frames 0/1/2); a sample lowered tile (307,388) is **passable** (tile
918) — the moat is crossable. USE again → "You close the drawbridge.":
exact round-trip to the raised row. Occupancy gate: an actor on the lowered
bridge → "You can't close the drawbridge." (stays open); cleared → closes.
No console errors. (The "can't open" clearance gate uses the same blockedAt
check; not separately exercised — no moat-blocker scenario at hand.)

**NPC-#12 unblock:** a modeled, crossable drawbridge now exists, so the
bridge-gated NPC can path across instead of teleporting (the I-9 known
issue). Tying #12's actual route to the open bridge is an I-9-audit
follow-up; the mechanism it needed is now in place.

### I-10 refinement — windowed quality search (active-area bound)

A follow-up to I-10d/e (decided + landed 2026-06-04), closing a latent bug in the
quality-linked-control search. Source's lever/switch/crank scan with
`SearchArea(0,0,0x3ff,0x3ff)` (`C_27A1_4479`/`4672`/`433D`) = *no coordinate filter*,
relying on U6's DOS streaming to keep only the ~40×40 active area resident
(`SearchArea`/`NextArea` walk the resident `Link[]` chain; `C_1184_19AA` evicts
beyond a ±20 box). The clone **never unloads regions**, so an unfiltered
`findObjectsByTypeQuality` is an unbounded superset that grows with exploration —
after two castles, two quality-0 controls could co-resolve, a collision source
structurally avoids. Full mechanism: `research_world_data.md §"Area-bounded object
search"`; handler scope: `research_object_interaction.md §"Quality-linked controls —
search scope"`.

**What landed:**
- `world_loader.js` — `findObjectsByTypeQuality(world, objNumber, quality, near=null)`
  gained the optional `near = {x,y,z}` window: `query(ObjType, Position)` (the
  `LOCXYZ`/on-map restriction = `NextArea`'s `GetCoordUse` skip), `z == near.z`
  (`NextArea`'s `z == MapZ`), and a **±20 box** (`|Δx|,|Δy| ≤ 20`). No `near` ⇒
  unchanged global scan.
- `systems/use_handlers.js` (`markerToggle`) + `systems/use_drawbridge.js`
  (`findBridgeAnchor`/`useCrank`) pass the **control object's own cell** as `near`.

**Decisions (Zane 2026-06-04):** (1) **center ±20** — a symmetric box, the I-9
`AREA = 40` work-area size; not source's chunk-aligned `AreaX = (MapX-16) & ~7`
anchor (the clone has no streaming `AreaX`, and the ≤4-tile difference is immaterial
for a circuit search). (2) **Center on the control cell**, not the avatar (they're
adjacent on USE; the control's position is already in hand). (3) **Keep the z
filter** even though it's a no-op while single-level (overworld) — it's a faithful
port of `NextArea`'s `z == MapZ` and becomes load-bearing once dungeons co-reside
under no-unload (the xy box doesn't exclude a same-xy object on another level).

**Verified live (preview-eval, real Britain data):** (a) predicate — 34 quality-0
doorways → 9 windowed (all Chebyshev ≤ 20), 25 excluded; (b) synthetic in-world
markers — ±20 boundary-inclusive (Δ20 kept, Δ21 dropped), z=1 same-xy marker
excluded, temp entities cleaned up; (c) **end-to-end on the real castle gate** — the
lever (303,383, q1) toggles its portcullis at (307,384) open/close (the q1 marker is
in **region 26**, across the y=384 boundary from the region-18 lever, Chebyshev 4 →
in-window), while the unrelated portcullis at (351,407) (out of window + different
circuit) is untouched. Round-trip exact, lever frame restored, no console errors.
See `Journal.md` 2026-06-04 (windowing entry).

### I-10f — landed (LOOK)

The first single-function verb (LOOK is not table-dispatched — one handler,
`C_27A1_0C67`). Registered in the dispatch core per the revised decision #2: LOOK
is a **line-only, source-faithful** scroll verb (no panel); the `I` hotkey stays a
separate clone-only "Inspect" modal. The two are deliberately distinct.

**What landed:**
- `systems/command_dispatch.js` — the `look` verb handler: `pickAtCell` (3-tier,
  NPCs included — NOT the USE re-pick) → an empty/invisible cell names the terrain
  (`mapLevel.tileAt` + `getTileLook`, `C_27A1_0C67:496-510`) plus the adjacent
  "Searching here, you find nothing." search line; everything else prints
  `Thou dost see <article><name>.`. **No modal escalation** — source's LOOK never
  opens a panel. LOOK is **viewport-range** — added a `VIEWPORT_VERBS` set so the
  dispatcher skips the adjacency gate for it (source reads the pointer cell with no
  reach check). `withArticle` approximates `C_27A1_061E`'s a/an (proper nouns take
  none). `L` added to `VERB_KEYS`.
- `main.js` — the `I` hotkey is **kept** as the always-open detail inspector
  (`openInspector` for any pick), now documented as the deliberate counterpart to
  LOOK (L = line, I = structured detail/inventory view).

**Source re-check correction (Zane flagged; caught before commit):** the first cut
followed the original decision #2 and escalated container OBJECTS to the inspector
modal on LOOK. Re-reading `C_27A1_0C67` falsified it — its only "structured" branch
is `C_27A1_06D7` (`CanRead?`) → `C_27A1_078F` (`/*read book or sign?*/`, opens
`BOOK.DAT`), i.e. **book/sign reading, not a container-contents walk**. Source LOOK
never opens or lists a container (that is a USE/GET interaction). So LOOK is
line-only and the inspector modal is exclusively the `I` tool. (A second, smaller
trap surfaced first: NPCs carry inventory so they are `Container`-tagged too — moot
once LOOK stopped escalating containers entirely.)

**Deferred (need absent subsystems):** weight ("It weighs N stones" — TypeWeight
table), damage/armor points (combat stats), the **count-prefix** (`C_27A1_0841`,
gated on the QuanType table — without it the raw quantity mislabels non-stackables,
"10 crate"), book/sign text reading (`BOOK.DAT`), the spellbook spell-list (spells),
clock/sundial time read, sign-tile redirect, the NPC portrait (`C_27A1_02D9`),
darkness gating (`D_B6DF`, lighting). The a/an/the article's exact per-tile data
(`C_27A1_061E`) is approximated by `withArticle`.

**Verified live (preview-eval, real Britain data):** LOOK (`L`) → terrain "Thou dost
see floor." / "grass." (incl. a 30-tile-away cell, proving viewport range), item
"a flag.", NPC (Avatar) "Avatar.", a crate "a crate." — all **lines, no modal**.
Inspect (`I`) on the same flag / crate → the detail modal (obj#/status/contents),
confirming the L-vs-I split. `L` arms "Look" + Esc disarms; no console errors.

**Mouse-confirm (same session, Zane request):** the verb-first front-end now
confirms with a **left-click** as well as `Enter` — `command_dispatch.js` adds a
canvas `click` that dispatches the armed verb at the highlighted cell, and
`dev_probe.js` **suppresses drag-to-pan while a verb is armed** (`isVerbArmed`, a
forward-ref to `cmd.isPending()` passed from `main.js`). Per Zane: the armed
targeting state expects a click, not a pan — so no click-vs-drag threshold is
needed. This restores source's native targeting route (the mouse click; `Enter`
only *synthesises* a click, seg_0C9C.c:1206-1217). Verified live: armed-Look +
click → "Thou dost see …" at the cell + disarm; a drag while armed pans 0 px;
`Enter` unchanged; no console errors.

### I-10g — landed (GET)

The first inventory-mutating verb — pick up an adjacent ground object into the active
party member's inventory (port of `C_27A1_18F5`). **DROP is split out to I-10h** (its
inventory-item + location two-target flow is heavier in the current architecture —
Zane 2026-06-04: do GET first).

**What landed:**
- `world_loader.js` — `moveToInventory(world, item, holder)`: source's
  `InsertObj(obj, holder, INVEN)` (`C_27A1_18F5:882`). Unlinks the entity from the map
  (`spatial.remove` + drop `Position`) and attaches it via the existing
  `attachToHolder` (`ContainedIn{holder, equipped:0}` + marks the holder `Container`).
  Renderable/Amount stay (the inspector icon + qty). Stack-MERGING (`GiveObj`) is
  deferred — a got stack becomes one INVEN entity.
- `assets/tile_flags.js` + `resources/tile_registry.js` — decode the **`TypeWeight`
  plane** (tileflag @0x1000, 1024 bytes, indexed by object type) that was previously
  skipped, exposed as `reg.weightOf(objType)`. This is the data the gettable gate needs
  (it was already in the loaded `tileflag` file).
- `systems/command_dispatch.js` — the `get` verb handler: `pickAtCell(…, forUse)`
  re-pick (objects only, skip NPC/ignore — `C_27A1_0919`, you can't get an NPC) → must
  be on the ground (`Position`) → **the `TypeWeight==0` fixed-object gate**
  (`reg.weightOf(objNum) === 0 || === 255 || objNum === OBJ_19B` → "You can't get
  that.", `C_27A1_18F5:857-861`) → `moveToInventory` into `avatarRef` → "You get
  <article><name>.". Adjacency is the dispatch gate (CLOSE_ENOUGH 1; GET isn't a
  viewport verb). `G` added to `VERB_KEYS`.

**The gettable gate (Zane-flagged, ported same session):** the first cut deferred ALL
weight handling, so the clone got *everything* — including fixed scenery (it picked up
a carpet). Source's gettability gate is `TypeWeight[type]` (`C_27A1_18F5:858` +
`GetWeight` `seg_155D.c:165`): **`TypeWeight==0` = a fixed object** (scenery, furniture,
walls) — refused for GET *and* MOVE (`seg_27a1.c:995`). That gate is load-bearing
(defines GET correctness) AND its data was already loaded, so it's ported here — only
the carry-capacity (`STREN*20`) gate stays deferred.

**Deferred (no subsystem yet):** the carry-**capacity** gate (`STREN*20 < total`, needs
strength + a running carried-weight total), terrain-damage-on-grab (fire/lava),
**theft/karma** (no karma system), lit-torch-to-hand (no equip flow), stack-merge
(`GiveObj`), per-type fixups (close lanterns, etc.), the explicit `SubMov(3)` cost (time
advances on the turn heartbeat).

**Verified live (preview-eval, real Britain data):** `G` + click an adjacent **fixed
carpet** (obj 0x12f, `weightOf==0`) → "You can't get that." (stays on the map); a
**real item** (a placed weight-12 object) → "You get …" — the entity leaves the map
(Position dropped, off the SpatialIndex) and appears in the avatar's inventory
(confirmed via the `I` Inspect modal); a non-adjacent item → "Out of range!"; an empty
cell → "Nothing to get."; no console errors.

### I-10h — landed (DROP)

DROP a carried item onto a map cell — split from GET (`C_27A1_14DA`). **Source-faithful
two-stage target**, verified from primary source: pressing `D` switches the status
panel to inventory (`seg_0A33.c:1088`, `StatusDisplay = CMD_92`) → pick the item → the
handler prompts "Location:" for a cell within `SelectRange = 7`. The clone mirrors this
as **`D` → modal picker → armed map cursor (reach 7) → click/Enter a cell**.

**What landed:**
- `world_loader.js` — `dropToMap(world, item, x, y, z)`: inverse of `moveToInventory`
  (source's `MoveObj`). Strips `ContainedIn`, adds `Position`, head-splices into the
  SpatialIndex.
- `view/inventory_picker.js` — `openInventoryPicker(world, holder, uiStack, {onPick})`:
  a modal "pick one carried item" list, reusing the I-7 substrate (`UIStack`,
  `makeListCursor`, `tileIcon`, `inventoryOf`). The stand-in for source's
  panel-switch-to-inventory (no persistent inventory panel yet). **Recursive** —
  selecting a carried container (a bag) drills into it via a nested picker (the
  inspector's "open this then open that"), so a deeply-nested item is droppable (source
  allows any `CONTAINED` object). On pick at any depth it pops the whole picker chain
  back to the depth captured at the **root** open (new `UIStack.depth()` + a base-depth
  pop — **not** `clear()`, which would be blunt; not a single pop). Esc backs out one
  level.
- `systems/command_dispatch.js` — `armDrop(itemHandle)` (the picker's `onPick` → arm the
  cursor with a *pending item*) + the `drop` handler (validate the cell via `canStandAt`
  = the `C_1E0F_000F` placement-legality analog → `dropToMap` → "You drop <name>."). DROP
  reach is **7** (`VERB_REACH`, vs adjacency-1); the dispatch now threads an `item`
  payload so the armed confirm (Enter/click) carries the chosen item.
- `main.js` — `D` hotkey opens the picker → `cmd.armDrop(item.handle)`. The picker's
  holder is the **hovered party member** when the cursor is on one (`Actor` +
  `PartyMember`), else the avatar/active member — a clone QoL convenience (source drops
  from the active member, switched via the party panel). The picker title shows the
  holder's name (`<name> — drop which item?`).

**Two-stage-target seam (new):** DROP is the first verb whose first target isn't a map
cell, so the dispatch gained a small `pendingDropItem` payload the armed confirm carries.
The same "arm with context → pick a cell" pattern is reusable for **TALK** and a future
**"use item X on target Y"**. (The picking-Enter doesn't double-fire the drop: the
dispatch keydown listener was registered before `UIStack`'s, so it sees the modal open
and returns; only the *next* confirm fires.)

**Deferred (substrate / other subsystems):** the missile-arc throw animation, the
break-if-fragile-and-far outcome, the quantity prompt for partial stacks,
drop-into-container, unequip-on-drop (equipment system), `SetOkToGet` (anti-theft, no
karma yet).

**Verified live (preview-eval, real Britain data):** `D` opens the picker (sword
equipped / Orb of the Moons / ankh amulet); picking the Orb + confirming a passable
cell → "You drop Orb of the Moons." (inventory 3→2, the item now on the map at the
cell); a cell >7 away → "Out of range!"; an impassable cell → "You can't drop it
there."; the click-confirm correctly carries the armed item. **Member-targeting:**
hovering companion **Dupre** + `D` → "Dupre — drop which item?" (his inventory);
hovering an empty cell → "Avatar — drop which item?" (default). **Nested drop:**
drilling into Dupre's **bag** (depth 1→2, title "bag — drop which item?") and picking
the **gold nuggets** pops the picker chain to depth 0 + arms; confirming a cell → "You
drop a gold nuggets." (now on the map, gone from the bag). No console errors.

### I-10i — landed (MOVE Mode 1 — push a ground object)

Push an adjacent world object one tile in a chosen direction — `C_27A1_1E8B`'s
**Mode 1** (the `GetCoordUse == LOCXYZ` branch, `seg_27a1.c:968-1043`). MOVE is a
**dual-mode** verb; this step ships only the push half. **Mode 2 (give/transfer a
carried item — the `else` branch :1044) is I-10j.**

**New targeting shape — direction, not a cell.** DROP's two-stage is *pick item
(modal) → pick cell (cursor)*. MOVE inverts the second stage to a **direction key**:
arm `M` → pick the adjacent object (Enter/click) → press an arrow/numpad direction.
This mirrors source's `M` → SelectMode `getch` (the object) → "To " `getch` (the
direction, `:983`). Three inputs.

**What landed:**
- `systems/avatar_move_system.js` — `KEY_DIR`/`CODE_DIR` are now **exported**, plus a
  `dirFromKeyEvent(e)` helper, so MOVE's stage-2 push-direction pick shares ONE
  keyboard→direction map with avatar movement (the avatar handler was refactored onto
  it — no behavior change).
- `world_loader.js` — `moveMapObject(world, handle, x, y, z)`: source's `MoveObj`
  (spatial.remove → update `Position` → insertAtHead, the same chain-head relocate the
  avatar step does inline). A reusable runtime primitive.
- `systems/command_dispatch.js` —
  - `m: 'move'` binding; MOVE is a normal **adjacency** verb (reach 1, not viewport,
    not DROP's reach 7) — the dispatch's `CLOSE_ENOUGH-1` gate is source's
    `CLOSE_ENOUGH(1, …, MapX, MapY)` (`:969`).
  - the `move` handler (**stage 1**): `pickAtCell(forUse)` (objects only, skip
    NPC/ignore) → the `TypeWeight==0` fixed-object gate (`reg.weightOf(objNum) === 0
    || === 255 || === OBJ_19B` → "You can't move it.", `:995`) → on success sets
    `pendingMoveObj` + `awaitingDir`, swaps the cursor label to "Move…" and prompts
    "Push it which way?". It does **not** complete here.
  - `resolveMove(handle, dir)` (**stage 2**): the arrow/numpad key → `canPushTo`
    legality → `moveMapObject` one tile, or "You can't move it there." One attempt per
    `M` (a blocked direction disarms; re-press `M` to retry — source `return`s at
    `:1016`).
  - `canPushTo` (module-level) = the **verified port of `C_27A1_1DAB`** (`:924`): the
    destination must be passable (`canStandAt`, the `C_1E0F_000F` proxy DROP also
    uses); a **diagonal** push additionally needs at least one flanking cardinal
    (`dir±1`) passable, so an object can't be squeezed through a wall corner.
  - front-end: the Enter/click confirm is refactored into one `confirm(cell)` that
    skips `disarm()` when stage 1 transitioned to `awaitingDir`. A new `awaitingDir`
    keydown branch captures the direction key, `stopPropagation()`s it (so the
    avatar's *window*-level keydown — later in the bubble than this *document*-level
    one — doesn't also walk on the same key), runs `resolveMove`, disarms. Esc cancels
    ("Never mind."). No change to `avatar_move`'s `isBlocked` — bubble order does the
    suppression.

**Input routing — the crux.** Arrow keys mean different things by stage. In **stage 1**
(armed, aiming) they fall through `command_dispatch` to the avatar's `window` listener,
so you can still **walk closer** while a verb is armed (pre-existing behavior). In
**stage 2** (`awaitingDir`) the `document` listener grabs the arrow first and
`stopPropagation`s, so the same key **pushes the object** and the avatar stays put.

**Deviations / deferrals (faithful, documented like GET/DROP):**
- **`SubMov(5)`** move-point cost — deferred (move-point economy is still project-wide
  deferred; the turn heartbeat advances time anyway).
- **Push-into-container** (`InsertObj CONTAINED` when the destination cell holds an
  accepting container, `:1012`) — deferred.
- **Directional-object facing frames** (cannonball `OBJ_0DD` sets its frame instead of
  moving, `:1023`) — deferred (rare).
- **`IsTileSu` table-surface accept** (`C_27A1_1330`) — treated as no surface, so you
  can't push an object onto a tabletop yet; `canPushTo` reduces to pure `canStandAt`.
- **Target-then-refuse an NPC** — source targets an NPC then refuses with a specific
  message (`:999`); the clone's `forUse` re-pick skips NPCs at the pick instead (same
  outcome, friendlier — and it picks an object *under* an NPC, which source wouldn't).
- **Object push-legality via the walks-class `canStandAt`** — source's `C_1E0F_000F`
  dispatches on the moved object; for an inanimate object that reduces to
  terrain/object passability, which `canStandAt`'s walks branch approximates (and which
  DROP placement already relies on).

**Verified live** (preview-eval, real Britain data, in Lord British's castle; drove the
real `cmd.dispatch` stage-1 + an `Arrow*` keydown stage-2, world state restored after):
- **Push** — a **chair** (`OBJ_0FC`, weight 74) one tile **west**: `(301,352) → (300,352)`,
  messages "Push it which way?" → **"You move a chair."**.
- **Avatar stays put** — avatar at `(302,352)` was unchanged across the direction key, so
  stage-2 `stopPropagation` correctly suppressed the avatar walk.
- **Blocked direction** — pushing the chair into an occupied (avatar) cell → **"You can't
  move it there."**, chair unmoved.
- **Fixed object** — MOVE on carpet (`OBJ_12F`, weight 0) → **"You can't move it."**.
- **Out of range** — MOVE on an object 8 tiles away → **"Out of range!"**.
- **Arm / cancel** — `M` keydown arms (`isPending()` true); `Esc` → "What?" + disarm.
- *Not exercised live:* "Nothing to move." (the throne room has no empty adjacent cell);
  it's the same trivial `pick === null` guard already verified live for GET ("nothing-here").

### I-10j — landed (2026-06-05): verb-aware inventory window, DROP migration, MOVE Mode 2 (give)

Landed 2026-06-05 (auto-run save-points, steps 1-4; squashed to one commit `260e61e`). Plan settled with Zane 2026-06-04. **Two parts sharing one new surface:
migrate DROP onto a verb-aware inventory window FIRST, then add give (`M`).** Doing DROP
first validates the window with a verb already built; give is then one extra key. Source
for give: `C_27A1_1E8B`'s `else` branch (`seg_27a1.c:1044-1141`).

**Implementation (auto-run save-points, 2026-06-05):**
- **Step 1 — verb-aware window ✓ landed.** `view/inventory_picker.js`
  `openInventoryWindow`: descriptive title (member / container name), `↑↓` + `Enter`
  recursive drill-in, `D`/`G` verb hand-off via `onVerb(verb, item)` (pops the chain to
  `baseDepth`), digit hook via `onDigit(n)`. Old `openInventoryPicker` kept until DROP
  migrates (step 3). Dev hook `window.__U6.openInventoryWindow`. Verified live: Avatar /
  Dupre / Shamino / Iolo titles, `↑↓` nav, drill into Dupre's bag (→ gold nuggets/coins)
  + `Esc`-back unwinds one level at a time.
- **Step 2 — digit-open + member-switch ✓ landed.** `main.js` `openMemberInventory(n)` +
  a top-row `Digit1`..`Digit9` keydown opens member n's window (`1`..`PartySize`, dynamic
  bound); the window's `onDigit` switches member (unwind to root, then re-open). **Top-row
  only** (`e.code` Digit*) — numpad digits stay avatar diagonals. Verified live: `2`→Dupre,
  drill into bag (depth 2), `1`→unwind+Avatar (depth 1), numpad `1` opens nothing.
- **Step 3 — DROP migration ✓ landed.** The standalone `D` map-hotkey is removed; the
  window's `D` on the highlighted item → `cmd.armDrop` → map cursor (reach 7) →
  click/Enter a cell → the unchanged `drop` handler. Old `openInventoryPicker` retired
  (+ its `displayName`/picker imports in main.js). Verified live end-to-end: digit
  `1`→Avatar window → highlight Orb → `D` → "You drop Orb of the Moons." at a passable
  cell (left inventory, landed on map), restored after.
- **Step 4 — give (MOVE Mode 2) ✓ landed.** The window's `G` on the highlighted item →
  `cmd.armGive(item, holder)` (holder = the giver member) → pick a recipient: a top-row
  digit (resolved in main.js → `cmd.giveTo`) OR a click on a party member
  (command_dispatch → `giveTo`) → `moveToInventory` → "You give …". Refusals: yourself →
  "yourself.", non-party → "Only within the party!", Esc → "Never mind.". Verified live:
  Dupre→Avatar (digit, "You give an ale to Avatar."), Avatar→Dupre (click, "You give Orb
  of the Moons to Dupre."), both refusals. Carry-weight gate / unequip-on-give /
  put-into-container deferred (faithful, as GET/DROP).
  - **Fix (2026-06-05):** give now shows the same armed `#probe-cell` rectangle + "Give"
    label as DROP while picking the recipient — `armGive` was missing the cue. Factored
    `showCue`/`hideCue` out of `arm`/`disarm`; `armGive` shows it, `giveTo`/Esc-cancel hide
    it. Verified live (cue shows on the give key, cleared on give + Esc).
  - **Key change (2026-06-05): in-window give key is `G`, not `M`.** "Give" reads as `G` to
    the player (`M` was the source MOVE-verb holdover); the code/comments keep the MOVE
    Mode 2 name. The map-cursor GET (`g`) is a separate context, suppressed while a window
    is open, so no clash. Hint is now `D drop · G give`.

**The inventory window (shared surface).** NOT the persistent U6 status panel
(`seg_0A33.c:933-936`, out of scope) — a modal **inventory window** opened on demand,
generalizing I-10h's `openInventoryPicker` from a one-shot "pick to drop" into a
**verb-aware** "browse a member's items and act on the highlighted one." It is the clone's
**carried-item targeting surface** — the analog of source's status-panel inventory that
`Selection.obj` points at (the missing piece that forced the modal pickers as stand-ins).

**In-window keymap** (the window is a UIStack modal, so its `onKey` owns these):

| Key | Action |
|-----|--------|
| `↑` / `↓` | move the item highlight |
| `Enter` | drill INTO a highlighted container (recursive, as I-10h) |
| `D` | DROP the highlighted item → pop window → `armDrop` → cell targeting (reach 7) |
| `G` | GIVE the highlighted item → pop window → recipient targeting (`G` reads as "give"; MOVE Mode 2 in code/source) |
| `1`..`PartySize` | open / switch to that member's inventory |
| `Esc` | up one container level, or close the window |

**Number-key member access — DECISION (Zane 2026-06-04):** digit keys open / switch a
member's inventory. `1`..`PartySize` → the member at party-index 0..N-1 (`1` = Avatar),
bound **dynamically to `PartySize`** (≤ 8 — `JoinParty` hard-caps at 8, `seg_1703.c:226`),
exactly source's `ch-'1' < PartySize` guard. `0` → a **party roster window**, DEFERRED to
its own later step.

**Member-switch with unwind:** a digit pressed while the window is open — even deep inside
nested containers — **unwinds the whole current chain back to the root `baseDepth` and
re-opens the new member at depth 1**, reusing the exact "pop to baseDepth" the recursive
picker already does on a final pick (I-10h). Reset-to-top is correct: you can't switch
people and stay inside a bag. Every nested level shares one `onKey`, so a digit at any
depth triggers the same clean reset — no per-level logic, no leak (UIStack push/pop is
O(1); TurnClock suspend is counter-balanced).

**Accepted divergence from source (Zane 2026-06-04):** in U6 the digit keys do NOT open
inventories — outside targeting they switch the *controlled* member (solo mode) / regroup
(`0` = party mode), `seg_0A33.c:1142`; during targeting they pick a member as the *target*,
`seg_0C9C.c:1298`. The clone has **no solo/party-mode** (Avatar always controlled,
companions follow), so the digit keys are free — we **repurpose them for inventory-open
now**. Whether to build solo/party-mode is undecided; *if* we ever do, the digit keys
become contested and we reconcile then — **decision deliberately deferred to that moment,
not pre-solved.** (The targeting use — a digit picks a member — stays faithful and is
reused for the give recipient, below.)

**Window title — DECISION (Zane 2026-06-04):** each window level shows a **simple
descriptive title — who/what, NOT the action** (the window is multi-verb now): the
**member name** at the top (`displayName(member, {objlist})`, e.g. "Dupre"), the
**container name** when drilled in (`getTileLook`, e.g. "a bag"). The verb keys live in a
bottom **hint line** (e.g. `↑↓ move · Enter open · D drop · G give · 1-4 switch · Esc
back`), not the title. This drops I-10h's action-phrased title ("Dupre — drop which
item?"). U6's status panel shows portrait+name; portraits are deferred, so the name is the
faithful-enough analog. **Breadcrumb DEFERRED (note):** a full-path heading
("Dupre ▸ bag ▸ pouch") is a nice later refinement for deep nesting; the stacked modals
already convey depth, so start with the per-level simple title and add the breadcrumb only
if deep navigation feels confusing.

**DROP migration (part 1 — do first):** DROP moves off its bespoke `D` map-hotkey onto the
window. The standalone `D` hotkey (main.js) is **removed**; you open an inventory via a
digit, highlight an item, press `D` IN the window → the window pops → `armDrop(item)` arms
the map cursor → click/Enter a cell (reach 7) → the existing `drop` handler runs unchanged.
So DROP is reachable only via *digit → window → `D`* (no more `D`-on-the-map). The post-arm
flow (`armDrop` + the `drop` verb handler + `canStandAt` + `dropToMap`) is reused verbatim
— only the entry changes.

**Give (part 2 — MOVE Mode 2):** add `G` to the window: highlight an item → `G` → window
pops → pick a recipient (a digit `1`..N, source-faithful per `seg_0C9C.c:1298`, or a click
on the party member) → `moveToInventory(item, recipient)` → "You give …". Party members
need no adjacency (always "around"); refusals: yourself → "yourself." (no-op), non-party
NPC → "Only within the party!".

**UIStack rule (verified live 2026-06-04):** while the inventory window is open the UIStack
owns the keyboard (its single listener routes every key to the top modal's `onKey`, and the
global command_dispatch / hotkey listeners early-return on `!uiStack.isEmpty()`), so the
window MUST handle the verb keys itself (`D`/`G` on the highlight → pop + hand off). Live
check confirmed DROP (modal: `depth 0→1`, Esc routes through the UIStack listener to pop)
and MOVE (no modal: arms + runs with the stack empty) both route correctly in the I-10i
state — the refactor won't disturb existing verbs.

**Deferred (faithful):** put-item-into-a-carried-container (the Mode 2 container branch +
same-owner gate), the `STREN×20` carry-weight gate (as for GET/DROP), unequip-on-give, the
`0` party-roster window, breadcrumb titles, portraits.

### Pre-impl reads (completed — research-before-impl convention)

These were the pre-impl reads done before their sub-steps; all landed.

- **`C_27A1_2A44`** (door USE) — open/close/unlock logic + frame mapping for
  `OBJ_129-12C`. Read before I-10c.
- **`C_27A1_433D` (crank) + `C_27A1_3F47` + the "drawbridge related"
  helper (seg_27a1.c:1898)** — the crank→`OBJ_10D` toggle geometry +
  how the bridge's open/closed frame maps to passability. Read before
  I-10e (the crank).
- **`world_loader.js` mutation helpers** — confirmed which of
  `GiveObj`/`TakeObj`/`InsertObj`/`MoveObj` already exist (`inventoryOf`
  does) before GET/DROP (I-10g/h), per the no-reinvention rule.

### Deferred (not in I-10)

- **Target-first front-end** — click a cell (no pending verb) → context
  menu of applicable verbs (`appliesTo(target)` predicates) → dispatch.
  Architecturally free at the core (same `dispatch`), but its real cost
  is the menu widget + predicates. Ships as a thin later front-end (its
  own small step), so I-10 isn't gated on it and verb-first
  validates the core first. When it lands, TALK + every verb get the
  second route for free.
- **Vehicle gate** (get/drop/move/cast blocked on a boat) — no
  boats yet. **Theft/karma** coupling on GET/MOVE — no karma system.
  **NPC portraits** on LOOK. **Full persistent inventory/status panel**
  (`seg_0A33.c:933-936`) — the I-10j inventory *window* is a per-member modal
  opened on demand; the always-on parchment status panel is still deferred.
  **Cast** (`C_1944_4C2F`) — when magic matters.
  (Portcullis lever `OBJ_10C`→`C_27A1_4479` + switch `OBJ_0AE`→`C_27A1_4672`
  **landed in I-10d** — `markerToggle` add/deletes the gate at quality-matched
  `OBJ_12D` markers — so they are no longer deferred.)

### Reuse-from-existing (no reinvention)

- `inspectAtCell` (main.js) → generalize to `pickAtCell`.
- `openInspector` + `UIStack` (view/inspector.js, view/ui_stack.js) →
  the `I` Inspect hotkey's detail modal (distinct from LOOK — #2).
- `getTileLook` / inspector `nameFor` → the LOOK line's object name.
- `inventoryOf` (world_loader.js:161) → GET/DROP list shape.
- `canStandAt` (I-4 passability.js) → placement legality.
- I-8 facing (humanoid_anim / `MACRO_A`) → face-the-target.
- `TurnClock` suspend + `uiStack.isEmpty()` gating → centralized in the
  dispatcher instead of repeated per handler.
- `#probe-cell` (view/dev_probe.js) → the targeting cursor tag (#3).

---

## Render-to-fit viewport — UI refinement (2026-06-05)

A pre-I-11 layout pass. The game shell was a rigid pixel frame (1024×640 map + 280 panel
+ 8 gap ≈ 1312px wide, ~800px tall), so on a normal laptop it overflowed **both** axes and
the user had to pan the page to reach the panels. Now the shell **fills the viewport** and
the map is **render-to-fit**: the canvas drawing buffer tracks its on-screen cell, so a
bigger window shows more of Britain and a smaller one fewer tiles — always 1:1 crisp, never
panning.

**Decision trail (with Zane 2026-06-05):**
- **Render-to-fit (variable tiles), not scale-to-fit (letterboxed shrink).** The map
  shows more/fewer tiles by window size at native resolution — the legacy `ultima6/
  map_viewer.js` made the same choice (`mapW = ceil(canvas.width / tileSize)`).
- **Design 1: buffer = CSS size, `dpr` pinned to 1.** The drawing buffer equals the CSS
  layout size (no devicePixelRatio scaling), so every existing render/camera/mouse
  calculation stays valid with zero unit-juggling. This matches legacy `map_viewer.js`,
  which staged the `devicePixelRatio` recipe then deliberately hardcoded `dpr = 1` — for a
  variable-viewport tile renderer, honoring dpr would double the tile count and thread a
  dpr-scaled tile size through all the pixel math. **A HiDPI dpr pass is the named
  follow-up** (only worth it if tiles look soft on a fractional-scaling display; integer
  2× Retina is already clean via `image-rendering: pixelated`).

**Why it was small:** the render pipeline was **already viewport-size-driven** —
`render_system.js` and `world_render_system.js` recompute their visible `cols`/`rows` from
`canvas.width/height` every frame, camera centering already divides by `canvas.width/height`,
and `renderer.resize()` already set `gl.viewport` + `u_resolution`. Nothing ever changed the
canvas's fixed 1024×640 buffer — that was the whole "fixed" feel.

**What landed (4 files):**
- **`resources/viewport.js`** (new) — `Viewport` ECS resource: live `cols`/`rows` + a
  `nearRadius` getter (`ceil(max(cols,rows)/2) + 8`, = 40 at the old 64×40 view).
- **`main.js`** — registers `Viewport`; `fitCanvas()` sets `canvas.width/height` to the
  cell's CSS size + calls `renderer.resize()` + updates `viewport.cols/rows`; a
  `ResizeObserver` on `#map-region` re-fits and recenters on the avatar as the window
  changes. Initial `fitCanvas()` runs before the first region load so streaming covers the
  real viewport.
- **`index.html`** — the shell is now a fluid full-viewport grid (`minmax(0,1fr)` map
  column/row, 280px panel, message band); body is a flex column with `overflow:hidden` so
  the page never pans; `#screen` fills its cell (`width/height:100%`, `box-sizing:border-box`).
- **`systems/npc_path.js`** — the I-9h teleport guard reads `Viewport.nearRadius` (the
  visible extent now VARIES, so a fixed 40 would pop on-screen NPCs on a big window). The
  `TELEPORT_NEAR_RADIUS = 40` constant survives only as the unit-test fallback (the tests
  never register a `Viewport`).

**The one game-logic coupling — the teleport radius AND its center.** The I-9h gate
suppresses the off-area teleport when an NPC (or its slot) is within Chebyshev-`nearRadius`
of the **view center**, so visible NPCs always walk. Two things had to follow the viewport:
- **The radius** must exceed the on-screen half-extent, and with a variable viewport must
  track the live size. `Viewport.nearRadius` reproduces the old 40 at 64×40 and scales
  (smaller on a small window, larger on a big one).
- **The center** is the **camera's center tile, not the avatar's.** They coincide while the
  camera follows the avatar, but the clone's **drag-to-pan** (a modern-UX feature source
  lacks — source always centers the view on the controlled member, so it could safely gate
  on the avatar) can move the view off the avatar; centering on the camera keeps the gate
  matching what's actually on screen, so a visible NPC in a panned-to region can't pop.
  `npc_tick_system.js` computes the camera center (`floor(cam.worldX/16) + cols/2`, wrapped
  on the toroidal axis) and passes it to `tryTeleportToSlot`; the unit tests register no
  camera, so they fall back to the avatar position (preserving their setup + the radius-40
  default).

The per-NPC 40×40 *pathfinding* window in `pathfinding.js` is an AI work-area, not a
visibility bound, so it was intentionally left fixed — NPCs outside the plan window
edge-seek + re-plan and still walk visibly.

**Verified live (preview-eval on real U6 data, 2026-06-05):** full game boots with no
console errors through boot + multiple resizes; `canvas.width/height` == CSS size at every
size (`bufferMatchesCss`); resizing 980px→1440px grew the buffer 666×657 (42×42 tiles) →
1126×589 (71×37); `nearRadius` tracked it (29 → ~42); `document.documentElement.scrollWidth/
Height` never exceeded the window (no page panning) at 742 / 980 / 1400 / 1440 widths. The
gate's **view center** tracked the camera: (307,352) = the avatar's start cell while
following, and moved to (347,352) after drag-panning 40 tiles east (the avatar stays at
307). **121/121 unit tests pass** (the avatar fallback keeps the camera-less test setup
green).

**Deferred:** the HiDPI `dpr` pass (above); a dedicated mobile/stacked reflow (the
two-column fluid grid handles narrow desktop widths on its own — map column shrinks, panel
holds, no panning; a first attempt at a `max-width:900px` stacked media query starved the
map and was dropped); the modern skin pass (still deferred from I-10a).

---

## Talk arc (I-11 → I-13)

The three steps that complete the **β path** ("walk + talk works
end-to-end"). They split the single act of talking to an NPC into a dispatch
trigger, a UI surface, and the bytecode VM that drives it:

- **I-11 — talk trigger.** TALK as a verb on the I-10 dispatch core: pick an
  NPC within reach 7, run the can-talk gate, emit the result. No conversation
  content yet — the slice ends exactly where `TalkDriver` would load the
  script.
- **I-12 — dialog window.** The second UI surface on the I-7 substrate; opens
  when the talk trigger fires.
- **I-13 — conversation VM.** Adapts the legacy `script.js` bytecode
  interpreter; β reached — give/take opcodes work on the I-6 inventory data.

**Source split:** TALK is a one-line case in the shared targeting block
(`seg_0A33.c:1264`) → `TALK_talkTo` (`seg_16E1.c:60`) → `TalkDriver`
(`seg_1703.c:1016`) → the conversation VM (`seg_1703`/`seg_16E1`). I-11 ports
the front-end through the can-talk gate; I-13 ports the VM. Research:
[research_object_interaction.md](research_object_interaction.md) §"Talk"
(front-end + reach + gate) + [research_conversation_vm.md](research_conversation_vm.md)
(the VM).

## I-11 scope — talk trigger

**Goal:** wire **TALK** as one more verb on the I-10 dispatch core so the
player can `T` → point at an NPC (within reach 7) → get a source-faithful
result: the talkable-filter + can-talk-gate outcome (a name echo / a placeholder
where the dialog window will open, or one of the canned refusals). The slice
ports `TALK_talkTo` (`seg_16E1.c:60`) + `TalkDriver`'s precondition block
(`seg_1703.c:1022-1079`) and **stops before `LoadConversation`** — the actual
conversation is I-12 (window) + I-13 (VM). Self-evident payoff: press `T` near
an NPC and the right line appears in the message channel; press it on a wall,
on yourself, or out of range and the matching refusal appears.

**Source findings (decoded 2026-06-05, full detail in
[research_object_interaction.md](research_object_interaction.md) §"Talk"):**

- **Command path.** `T` (`seg_0A33.c:1061`) → `CMD_83`, `SelectMode = 1`,
  `SelectRange = 7` → the shared targeting block dispatches
  `TALK_talkTo(Active, Selection.obj, 1)` (`seg_0A33.c:1264`). TALK is the
  only verb whose handler isn't in `seg_27a1.c`.
- **Reach = 7, not adjacency-1.** `SelectRange = 7` (the DROP/ATTACK reach);
  `TALK_talkTo`/`TalkDriver` add no `CLOSE_ENOUGH` check, so 7 is the effective
  reach. Corrects the earlier "two-stage seam / adjacency-pick" framing — TALK
  is **single-stage** (one pick → fire) and reach-7; it reuses DROP's
  `VERB_REACH = 7` gate, nothing more.
- **Talkable filter** (`seg_16E1.c:60-88`): NPC slot (`0 ≤ obj < 0x100`) or
  shrine `OBJ_189` / statue `OBJ_18D-18F`, else `"nothing!"`; mounts
  (`OBJ_1AE/1AF`) head-resolve first; the `aFlag=1` path prints the target-name
  echo (met → `C_1703_0116`, first-time → `GetObjectString`).
- **Can-talk gate** (`TalkDriver` early-exit, `seg_1703.c:1022-1079`): the
  8-row precondition table (Not-on-screen / Not-in-solo-mode / seance-moan /
  No-response[dead/asleep/paralyzed/vigilante/fear/retreat/arrest/evil/chaotic]
  / Armageddon / Talking-to-yourself / Funny-no-response) — tabulated in the
  research doc. I-11 ports the arms with a live clone signal (asleep, evil/
  chaotic, talking-to-yourself); the rest defer with their subsystem.
- **`NPCStatus` is parsed-then-dropped — alignment carried for the gate.** The
  gate reads `IsAsleep`/`GetAlignment`/`IsDead`, all in the per-NPC `NPCStatus`
  byte (`u6.h:113-155`) — a *different* array from the `Status` (ObjStatus) the
  clone loads. The clone decodes the byte (`objlist.js:42`) but `world_loader.js`
  drops it. Two bits have live clone signals: **asleep** is exactly
  `AIMode.AI_SLEEP` (source sets `SetAsleep` + `NPCMode=AI_SLEEP` in lock-step at
  `__AtDestination`, `seg_1E0F.c:1014-1033`), and **alignment** (`& 0x60`) is
  carried into a new `Alignment` component at load — the TALK gate is its
  first/only in-scope reader, so it's carried now, not dropped. Full
  decomposition (all 7 bits → owning subsystem + consumers + the save-roundtrip
  caveat) in [research_save_load.md](research_save_load.md) §"`NPCStatus`
  decomposition". `dead`/`paralyzed`/`poisoned` stay deferred (no
  death/combat/magic model to set them).

**Reuse-from-existing (no reinvention):**

- `pickAtCell` (command_dispatch / main.js) → the 3-tier cell-pick (NPCs are
  tier 1) — same resolver LOOK/GET/USE use.
- DROP's `VERB_REACH = 7` reach gate → TALK's reach (DROP is the existing
  reach-7 precedent; "Out of range!" beyond 7).
- `displayName` (view/inspector.js — the same name resolver GET/DROP/MOVE
  use) → the target-name echo.
- The message channel (I-10a) → all TALK output (echo + refusals).
- `Actor` component → the talkable test; active-member ref (`avatarRef`) →
  the "Talking to yourself?" self-check.
- `AIMode.mode` (`components.js`, the worktype an NPC settles into at
  `atDestination`) → the asleep gate arm (`=== AI_SLEEP`).
- **new `Alignment` component** (loaded `NPCStatus & 0x60` in `loadActors`)
  → the evil/chaotic gate arm. Load-only until its mutators land.

**Deferred:**

- **To I-13** (needs the script data / VM): `LoadConversation` of
  `converse.a/.b`, the `"Funny, no response."` no-script refusal, the portrait
  + `"You see "` description (both read from the script), and the whole
  ask/answer loop. I-11 emits a placeholder where I-12's window will open.
- **Facing the target** (`MkDirection` → `C_1E0F_0664`) — deferred, as in the
  other I-10 handlers (the dispatch defers facing globally for now).
- **Gate arms with no live clone signal** (one-line each, later): dead,
  paralyzed, poisoned, the combat-mode arms (`AI_VIGILANTE/FEAR/RETREAT/ARREST`
  — no setter yet), seance/`IsArmageddon`, solo-mode (`D_2CC3`), and
  party-member-off-screen — tracked per-bit in the `NPCStatus` decomposition
  ([research_save_load.md](research_save_load.md)) so they aren't forgotten
  (same incremental pattern as GET's theft/karma and USE's case table).

**Sub-steps** (locked 2026-06-05; each ≈ one save-point, browser-verified;
squashed into one `impl I-11`):

- **I-11a — `Alignment` component, carried from `NPCStatus`.** New
  `Alignment { value: Uint8Array }` in `components.js`; `loadActors`
  (`world_loader.js`) sets `value = a.npcStatus & 0x60` per NPC. Load-only
  (no mutators yet) — the first concrete repair of the parsed-then-dropped
  `NPCStatus` byte. *Verify:* preview-eval an NPC's `Alignment` matches its
  objlist `npcStatus & 0x60`.
- **I-11b — the `talk` verb front-end.** `t:'talk'` → `VERB_KEYS`, `talk:7`
  → `VERB_REACH`; register `talk`: `pickAtCell` (3-tier) → talkable filter
  (`Actor` ∨ shrine `OBJ_189` / statue `OBJ_18D-18F`, else "nothing!") →
  self → "Talking to yourself?" → `canTalk(pick)` → on pass
  `openConversation(pick)`. *Verify:* `T` on an NPC → name echo; wall/empty
  → "nothing!"; self → self-line; >7 away → "Out of range!".
- **I-11c — the `canTalk` gate + `openConversation` seam.** `canTalk(npc)` →
  asleep (`AIMode.AI_SLEEP` → "asleep" line) + evil/chaotic (`Alignment &
  0x60` → "No response"); the deferred arms as commented one-line slots
  citing the `NPCStatus` decomposition. `openConversation(target)` → the
  meaningful placeholder per type (NPC name "has nothing to say yet" /
  shrine / statue) — the I-12/I-13 seam, the only thing I-12 + I-13 reopen.
  *Verify:* a sleeping NPC at night → "asleep"; an evil-aligned NPC → "No
  response"; a normal NPC → placeholder; a shrine → shrine line.

**Kept deviations (record so a later session doesn't "correct" them):**

- **Reach-7 is a post-confirm refusal, not a cursor cap.** Source hard-caps
  the targeting cursor at 7 (`seg_0C9C.c:1237` — you can't point past it);
  the clone's free mouse cursor confirms then refuses ("Out of range!").
  Same reach, friendlier UX.
- **asleep = `AIMode.AI_SLEEP`**, not `NPCStatus & ASLEEP` (the clone drops
  that byte; the worktype is the lock-step proxy — see findings).
- **`Alignment` is load-only** until its mutators (party join/leave in I-13,
  charm/combat later) land — faithful while nothing yet changes alignment.
- **Name echo = `displayName`** (tile-look) until I-13 loads `converse.*`'s
  name section (source's `C_1703_0116`).

**Landed (2026-06-05, a→b→c as separate commits — verified live on real Britain data):**
**a** = `Alignment` carried (188 NPCs, `Alignment === npcStatus & 0x60`, 0 mismatches; 184
NEUTRAL / 4 GOOD in the loaded set, no evil/chaotic). **b** = `T` arms (reach 7) →
Dupre/jester "<name> has nothing to say yet."; self → "Talking to yourself?"; empty →
"There is no one to talk to."; cheb 8 → "Out of range!". **c** = the gate, exercised by
forcing the state (no NPC is naturally asleep/evil in the loaded overworld now):
`AIMode.AI_SLEEP` → "<name> is fast asleep."; `Alignment` EVIL/CHAOTIC → "No response.";
neutral + awake → the placeholder. No console errors. The talk handler is **final** —
**I-12 (dialog window) swaps `openConversation`'s body next**; I-13 wires it to the VM.

**Boot-time gotcha (recorded):** a new component must be added to `main.js`'s
`registerComponent(...)` chain, or `world.add` throws "component not registered" and boot
halts silently mid-`loadActors` (the page log stops at "Decoding…", no console error). Cost
me a debug loop on I-11a; check the registration chain when adding any component.

**Pre-impl research:** done — [research_object_interaction.md](research_object_interaction.md)
§"Talk" + [research_save_load.md](research_save_load.md) §"`NPCStatus`
decomposition" + the standing
[research_conversation_vm.md](research_conversation_vm.md).

## I-12 scope — dialog window

**Goal:** swap `openConversation`'s I-11 message-echo placeholder for the
**dialog window** — the SECOND consumer of the I-7 UI substrate (after the object
inspector), proving the modal stack generalises from a list-cursor surface to a
text-I/O surface. **I-12 = the window's UI LAYOUT + open/close wiring + a real
portrait, driven by STUB content** — NO script loading, NO conversation VM (I-13).
Source shape: `TalkDriver` (`seg_1703.c:1016`) shows the target's portrait + name
then runs the ask/answer loop; the clone splits portrait/name/frame (I-12) from the
VM (I-13). The single seam is `openConversation(target)` (`systems/command_dispatch.js`)
— I-12 swapped its body to `openDialog`; I-13 swaps the window's placeholder body for
real lines. The talk handler + the window chrome never change again.

**Decisions (settled with Zane 2026-06-05, before impl):**

- **Modal on the I-7 stack** (option A), NOT a status-panel repurpose (option B —
  what source does: `C_27A1_02D9` draws the portrait into the in-game status panel,
  `seg_27a1.c:168`). Turn-driver suspended + avatar movement gated for the window's
  lifetime — both free via `UIStack` (`view/ui_stack.js` + main.js `isBlocked`).
  Conversation text lives INSIDE the window, not the world `#messages` channel.
- **Four regions, top→bottom:** portrait box + name / scrolling text / keyword chips
  / "you say:" input.
- **Chips + input are INERT at I-12 — no fakes** (Zane): the layout commits the
  surface, but clickable chips (= say the word), a live input, and the NPC's words
  are all I-13. **ESC-close is the only working interaction.** (Decision earlier in
  the discussion was "chip click = immediately say the keyword" — that BEHAVIOUR is
  I-13; I-12 only renders the chips.)
- **Portrait is REAL at I-12** (Zane wants it now). Fixed centred modal at a
  **readable width** (460px) — it's text, not the map; a fixed column reads better
  than scaling with the viewport (matches the inspector/inventory fixed-size modals).
- **Opens for ALL talkable targets** the I-11 filter accepts (NPC / shrine `OBJ_189`
  / statue `OBJ_18D-18F`) — automatic through the one seam.

**Pre-step — portrait asset enablement + research.** Added
`portrait.{a,b,z}` to `main.js`'s `OPTIONAL` set (stored raw + loaded, non-gating —
the project's FIRST lazy-decoded asset; they must not block Britain from rendering)
and wrote [research_portraits.md](research_portraits.md) (the full format + source
decode of `C_2FC1_1C19`). **Decode chain verified live on Zane's real data BEFORE
coding the window** (de-risking I-12c): `portrait.a`=98 / `portrait.b`=96 entries,
all sampled blocks → 3584 = 56×64 px, 8 portraits rendered correctly through `u6pal`
(`a[4]`=Lord British; `a[0]`=a horse/mount, resolving the off-by-one — named NPCs
start at `a[1]`).

**Sub-steps (each one save-point during the build, browser-verified; Zane reviewed +
approved, then squashed into one `impl I-12` commit per the I-7/I-8 default):**

- **I-12a — modal frame + seam swap.** New `view/dialog_window.js`
  (`openDialog`); `openConversation`'s body → `openDialog`. Bare modal: name title +
  placeholder body + ESC-close. *Verified:* clean boot, opens (UIStack depth 0→1),
  titles real NPCs, ESC closes (→0) via the real substrate key path.
- **I-12b — four-region layout.** `openDialog` builds portrait box +
  name / scrolling text / inert chips (`name`/`job`/`bye`, muted) / disabled
  "You say:" input; fixed centred 460px (CSS in `index.html`). *Verified:* all four
  regions render for Dupre; input disabled; ESC closes.
- **I-12c — real lazy-decoded portrait.** New `assets/portrait.js`
  (`Portraits`): decode-on-first-show via the verified chain (`lib_32` offset table
  → `decompressCompressedFile` → `u6pal` RGBA), `ImageData` cached per `npcId`.
  Built in `main.js` from the `OPTIONAL` bytes + `reg.palette`, threaded through
  `installCommandDispatch` → `openConversation` → `openDialog`, which blits the face
  into the box. *Verified via the REAL wired path* (live `talk` handler at Dupre's
  cell): Dupre/Shamino/Iolo show correct distinct faces (Dupre = `a[1]`, 3470/3584
  non-blank px), ESC closes.

**Key implementation facts (so a later session doesn't re-derive them):**

- **Portrait key = the Actor `npcId` (the slot), NOT `ObjType.objNumber` (the type).**
  `C_2FC1_1C19` takes the NPC number; `npcId 1` = the Avatar → `portrait.z[D_2CCB-1]`
  (deferred — `D_2CCB` is the char-creation choice from the save, and the talk target
  is never self). `npcId ≥ 2` → `a[npcId-1]` (`< 0x62`) or `b[…-0x62]`. Confirmed
  live: Avatar=1→blank, Dupre/Shamino/Iolo=2/3/4→faces.
- **No dedicated portrait palette** — portraits index the in-game `u6pal`
  (research_portraits.md). The decoder forces opaque alpha (portraits are full
  images; `u6pal`'s colourkey alpha is a tile concern).
- **The portrait box is a native 56×64 `<canvas>`** scaled 2× by CSS
  (`image-rendering: pixelated`), so `putImageData` writes at native res.

**Deferred (→ I-13 unless noted):** clickable chips (= say the keyword) + the
script's own `OP_KEY` keywords; the live input + Enter; the NPC's words (script load
+ VM); the pause / "▼ more" continue affordance (no text to page at I-12). **Blank
portrait box (no live signal yet):** shrines/statues (source uses `GetQual`, no
quality carried) and the Avatar's own face (`portrait.z` / `D_2CCB`).

## I-13 scope — conversation VM (standalone effect interpreter)

Adapts the legacy `../ultima6/script.js` VM into a **standalone generator that yields
typed effects**, per [research_i13_conversation_vm.md](research_i13_conversation_vm.md)
(the design + full effect taxonomy) over the [research_conversation_vm.md](research_conversation_vm.md)
source decode. Built as save-point commits (pre-step + a–g + review polish + a
post-review indexed-table fix), **squashed into one `impl I-13` commit** after Zane's
review. Verified live against Zane's real `converse.a/.b`.

**Architecture (the locked decision).** Three parties: a pure **`ConversationVM`**
(`systems/conversation/conversation_vm.js`) with zero world/I-O imports; a **host**
(`systems/conversation/conversation_system.js`) that seeds vars + drives the generator
+ applies effects; the **dialog window** (`view/dialog_window.js`) as the I/O surface.
Wire protocol: `run()` is a `function*` that `yield`s `{type,…}`; the driver resumes
with `.next(value)` — a value for reads (query/input/read-write), nothing for
output/sink. `evaluate()` is also a generator (`yield*`) so a mid-expression query
suspends with the operand stack intact — which is what deletes the legacy port's
hand-rolled `current--`/`checkInputNumber` resume hack.

**Sub-steps (each a save-point commit):**
- **pre-step** (`fc42f9b`) — `converse.a/.b` + `portrait.a/.b` moved to REQUIRED in
  `main.js` (Zane's call: the conversation experience needs them; supersedes I-12's
  portraits-optional). Still lazy-decoded.
- **a–c** (`9947d0d`) — `conversation_vm.js` + `opcodes.js`: statement loop,
  RPN `evaluate`, keyword dispatch (**source-faithful** per-word-prefix + `?` wildcard
  + `*` catch-all — fixes the legacy `includes()`), IF/GOTO, `$`/`#` expansion
  (VM-owned) + host-seeded vars, inline-`*` pause. `tests/test_conversation_vm.*`
  (23/23, no data needed).
- **d** (`5d4d5c0`) — `assets/converse.js` loader (lib_32 `.a` 0..0x62 / `.b`
  0x63..0xDF, LZW-or-raw, lazy); host seeds + drives; `dialog_window.js` rebuilt into
  a live I/O controller (streaming text, input field, clickable chips, pause cue,
  Esc-ends); wired `main.js` → `command_dispatch.openConversation`.
- **e** (`807da31`) — query effects (world reads): `flag`(TST→`objlist.talkFlags`
  bit), `wounded`, `poisoned`(`status&0x08`), `inParty`, `onScreen`(camera/viewport),
  `isHorse`, `objType`, `canCarry`, `owns`/`hasObj`/`whosGot`(via `inventoryOf`),
  `partyMember`.
- **f** (`c42a7ba`) — sink + read-write: `set/clrFlag`, `add/subKarma`, `heal`,
  `cure`, `setMode`, attribute trainers, `give`/`take`, `spawnHorse`, `rest`(heal).
- **g** (`2562169`) — `OP_PREFIX` body marker; `@`keywords render gold + click-to-say;
  CSS; coverage scan.
- **review polish** (`c7ac53c`/`d9f9109`/`9d5fb8b`/`994d053`, Zane's review) — a `{pause}`
  continue-cue (blinking "▾ click/press a key") + per-mode input hints (placeholder / key
  prompts); the player's own input is **echoed** into the transcript as a blue `.dialog-you`
  line (vs the NPC's sepia); only `.dialog-text` scrolls (the modal no longer double-scrolls
  on a long convo); `window.__U6.inspectConversation()` dev hook snapshots the live VM
  (npc/pc vars, lastInput, the current question, the upcoming KEY answer-keywords).
- **post-review** — folded in here by the squash: the **indexed string/value-table read**
  (`1af4593`, `C_1703_1494` → random/state-driven NPC lines, closes the last 3
  stray-`unknownOp` scripts; see "Indexed string/value tables — DONE" below), the
  **branch-skipping** mechanism + nested-IF limitation (`c5de6e6`; see "Known limitation"
  below), the **open-questions resolution** (`b6d2912`), and `research_npc_scripts.md` — an
  on-demand per-NPC decoded-script catalog (`529fe9e`, first entry: Lord British).

**Effect-stream verification (the standalone-design payoff).** Headless coverage over
**all 200 NPC scripts**: **200/200 clean + terminating, 0 crashes, 0 empty** (the
indexed-table fix closed the last 3 stray-`unknownOp` scripts; NPC 183's non-termination
was a coverage-harness artifact — see "Indexed string/value tables — DONE").
Live (real wired path, talk at Dupre/Shamino/Iolo/Lord British cells): portrait + name
+ "You see …" + pause + greeting + keyword Q&A (name→"It's Dupre…", job→…) + `bye`
closes the window and resumes the turn driver.

**Key kept decisions (so a later session doesn't "correct" them):**
- **Gates stay in `command_dispatch.canTalk`** (I-11c) as host pre-flight — the VM is
  reached only when talk is allowed. Not duplicated in the host.
- **`$`/`#` expansion is VM-owned** (the vars are VM state, seeded once via the
  relocated `TALK_initTalk` then mutated mid-script). The `say` effect carries final
  text; the host never sees `$N`. Text markup (`@`/`<>`/`/\`/`&&`) is passed through.
- **`@`words are the askable keywords** — rendered gold + click-to-say, the live
  evolution of the I-12 inert chips. Default chips stay `name`/`job`/`bye` (the
  universal keywords); per-script keyword extraction is intentionally NOT done (U6
  doesn't reveal an NPC's full keyword list).

**Deferrals (stub-when-deferred — VM emits the complete effect; the host handler is a
stub, fleshed out with zero VM edits when the subsystem lands):**
- **Party `join`/`leave`** — needs ECS party + follower integration; returns
  source-faithful codes but does NOT mutate membership yet (the highest-value
  follow-up; companion-recruit NPCs are affected).
- **`selectObject` / `showInventory` (trade UI)**, **`resurrect`** (corpse handling),
  **`moveObj`/`transferObj`** (obj-ref resolution), **`rest` time-skip** (heals party,
  no clock jump), **`owner`/`weight`** queries (GetAssoc / no `TypeWeight` table).
**Indexed string/value tables — DONE (2026-06-08).** The 3 stray-`unknownOp` scripts (NPCs
35/123/135) were the **unported `C_1703_1494` indexed-table read** — an NPC selecting one of
N packed strings by a computed index (e.g. Artegal's `RND(0,2)` random groan, the dog Kador's
`RND(0,3)` bark, Ephemerides' `LET $0 = instruments[idx]`). The old `_followAddress` read the
table offset but never parsed the index factor, so it always printed entry #0 and **leaked the
factor bytes to statement level** (the `0xd3 BYTE` → `unknownOp`). Faithful port: after the u32
offset, if the next byte isn't `OP_CALL`, `evaluate()` the index factor then walk the table —
string mode skips `si` NUL-terminated strings, value mode offsets `si<<1`. NPC 183's
non-termination was a **coverage-harness artifact** (its `bye`→LEAVE sits behind `IF TST(self,
bit)`; with the host's `setFlag`→`TST` feedback modeled, it exits — no code change needed).
Re-verified live against real `converse.a/.b`: **200/200 scripts clean + terminating**, and the
index is honored (`rng→lo` prints groan #0, `rng→hi` prints #2). Regression test added
(`tests/test_conversation_vm.js` — indexed-table PRINTSTR + no-leak assertion). Mechanism +
worked examples: `research_conversation_vm.md §"Indexed string / value tables"` + §"Code and
data share one address space".

**Known limitation — general nested IF/ELSE in a skipped branch.** The branch-skip
(`_skipIfBlock`, and the keyword non-match skip) is a **flat linear scan** with no depth
counter, so a *general* nested `IF/ELSE` in a *skipped* branch would make it stop at the inner
`ELSE`/`ENDIF` and misalign. **Faithful to source** (`seg_1703.c:784-791` has the identical
flat loop). **Empirically resolved for the shipped data:** a scan of all 200 scripts found
**199 completely flat (IF-depth ≤ 1) and exactly one (NPC 164) nested one level** — and NPC
164 is laid out to survive the flat skip (inner `IF` has no `ELSE`; inner `ENDIF` adjacent to
the outer `ENDIF`; the flat landing is one no-op `ENDIF` byte short of a correct skip, absorbed
harmlessly). So **all 200 shipped scripts skip correctly** — the limitation only bites a
*hypothetical* non-adjacent / `ELSE`-bearing nested block. A depth-counting skip (as the legacy
`ultima6/script.js` `skipCodeBlock` already uses) would lift it. Mechanism + evidence:
`research_conversation_vm.md §"Branch skipping"`.

**Pre-impl research:** [research_i13_conversation_vm.md](research_i13_conversation_vm.md)
(design + taxonomy + sub-step plan) + [research_conversation_vm.md](research_conversation_vm.md)
(source decode) + [U6_對話系統.md](U6_對話系統.md) (Chinese explainer, corrected vs source).

**Pre-impl research:** [research_portraits.md](research_portraits.md) (portrait
format + decode) + the standing [research_conversation_vm.md](research_conversation_vm.md)
(the I-13 VM the window will feed) + the substrate read recorded in this section.

## I-14 scope — NPC movement speed (DEXTE-paced accumulator)

**Planned (not started).** Pulled ahead of the old status-panel/handlers steps (now I-18/I-19)
to start the **NPC-movement arc** (I-14 speed model → I-15 drunk-walk → I-16 arrival/direction →
I-17 AI): the AI behaviors all ride on the movement model, so it goes first.

**Goal:** replace I-9's **flat step-rate** with a **DEXTE-paced per-actor accumulator** — a *modern
rewrite* of U6's `MovePts`/`DEXTE` economy, **NOT** a port of the `C_1E0F_4E0A` round driver — so NPC
movement regains **terrain-speed**, **dexterity-speed**, and the **staggering** that keeps traffic
un-gridlocked, fixing the "watch an NPC thrash" symptom and laying the substrate for I-15/I-16.
**Full design + rationale (READ FIRST):** §"Post-I-9 — deviation audit" → "SETTLED MODEL — DEXTE-paced
per-actor accumulator". **Source inputs (reinterpreted, not transcribed):** `SubTerrainMov`
(`seg_1E0F.c:1402` = `5 + Σ(TerrainType>>4)`), `SubMov` (`:441`), `DEXTE` (`seg_0C9C.c:303`, objlist);
the `C_1E0F_4E0A` round driver is studied for the mechanic but deliberately **not** ported. **Data:**
`assets/objlist.js` already decodes `a.dexterity` (0x0a00) — carry that only; `a.movePts` (0x14f1) is
unused under the accumulator.

**Sub-steps (one save-point each):**
- **a** — `MoveSpeed` component (`dexterity` from objlist + a `moveCredit` accumulator), added in
  `world_loader.js`; `rate(DEXTE)` maps DEX into the calibrated band (reference DEX ≈ 15 → ≈ 2.5
  tiles/s on open ground, floor ~6). Source scale is the *input*; ms-per-tile mapping is ours.
- **b** — per-actor accumulator tick: each heartbeat `moveCredit += rate × WORLD_SPEED × dt`; step
  **one tile** when `moveCredit ≥ stepCost` (**snap, no interpolation**); cap idle credit at one step.
  **Replaces** the flat-step `npc_tick_system`. Staggering emerges from per-actor credit phases (no
  round-robin, no auto-pass).
- **c** — `stepCost = SubTerrainMov` (terrain weight; `SubMov` modifiers horse ½ / spells, min 1) as
  the per-step threshold for NPCs. **Player:** **fixed-brisk** base (NOT DEX-scaled), **instant-first-
  step + terrain cooldown** — standing leaves the player "ready" so a keypress steps instantly; a
  post-step cooldown rate-limits *sustained* walking only → zero input lag, swamp visibly slows.
- **d** — **`WORLD_SPEED` master slider** in the world-clock UI (dev-HUD clock now → status panel
  I-18): scales **all actor rates + the decoupled clock together**; log-scaled; **slow end = frozen**.
  The clock advances on its **own** cadence (**decoupled** — not per round/refill); the 100 ms
  heartbeat stays fixed (the slider changes the *rate*, not the frame interval).
- **e** — verify: staggering removes the flat-step thrash; player input never lags + swamp visibly
  slows; the `84/85/86` escalation (`npc_path.js:98-100`) still de-gridlocks; live preview + unit tests.
- **fold-in** — **door-phasing predicate fix** (`isHumanoid` → `MONSTER_4000` monster-class /
  `GetMonsterClass`) so non-humanoids stop phasing closed doors — small, pathfinding-adjacent,
  co-located here (§"Known issue — door-phasing predicate").

**I-9f teleport-to-previous** was a **non-faithful band-aid** for the flat-step thrash → **drop it** once
the economy lands; the resulting blocked-NPC behavior MUST follow `U6_NPC_排程與移動邏輯.md §五 "典型情境
的行為結果"` — a blocked NPC is **waited out** (`84/85/86` → re-plan, still actor-blind), with catch-up
coming only from the **hourly schedule target-switch** (§二) + the **off-screen visibility teleport**
(§六), plus **lenient adjacent-arrival** (Chebyshev ≤ 1); it is **never warped to a previous target**.
**Sub-step e verifies the dropped-I-9f behavior against §5.1** (blocked = waited-out, not warped). The
**§5.2** arrival-pose behaviors (arrived-but-can't-sit / sleep-on-spot when the prop sits at the player's
feet; stand/guard settle adjacent) are an **I-16** concern (§七) and are verified there.

## I-15 scope — drunk-walk approach (`TryMoveTo` + `__TryDiagMove`)

**DONE (2026-06-08), local — pending review + squash (alongside I-14).** The pathfinding-LESS
"head roughly toward a target, nudge around the one blocker in front of you" move primitive —
`U6_NPC_排程與移動邏輯.md §4.3`'s "only ACTIVE detour." New `systems/drunk_walk.js`. Built on
`npcStep` (= source's `TryStraightMove`); move-point spend stays at the I-14 tick level (the
primitive just attempts a move + reports success, like `npcStep`). **No live consumer yet** —
NPC AI behaviors (I-17) + combat drive it later; for now it's a tested primitive + a dev hook.

**Sub-steps (one save-point each):**
- **a** — `tryDiagMove` (`__TryDiagMove`, `seg_1E0F.c:3470`): step diagonally only if the
  diagonal target is standable AND ≥1 orthogonal neighbour is clear (corner-cut prevention —
  no squeezing between two solid corners). Diagonal-combine incl. the N+W→NW special case.
- **b** — `tryMoveTo` (`C_1E0F_35A7`): one greedy step toward a target — pick the primary
  axis (larger delta; random tie-break; distance-weighted random for far targets), then the
  fallback chain **primary-straight → diagonal → other-straight → reverse-other (~50%)** (the
  reverse fires only on source's `OSI_rand(0,1) || !TryStraightMove(..^4)` short-circuit).
  Wrap-aware on the 1024 toroidal axis; RNG injectable (`randInt`) for deterministic tests.
- **c** — dev hook `__U6.driveTo(npcId, x, y[, intervalMs])` / `__U6.stopDrive()`
  (`view/dev_npc_inspect.js`): WRITES the sim (parks the NPC at `AI_MOTIONLESS`, drunk-walks
  it on a fixed timer until adjacent) — a review tool; **deliberately bypasses the I-14
  accumulator** (the real DEXTE/WORLD_SPEED-paced consumer is the NPC-AI step, I-17).

**Kept deviations:** the move-point spend (`SubTerrainMov` inside source's TryStraightMove/
__TryDiagMove/TryMoveTo) is NOT duplicated here — the I-14 accumulator owns it at the tick
(same as `npcStep`). `__TryDiagMove`'s `D_17B2` party-pass toggle on the two clearance probes
is dropped (plain `canStandAt`) — harmless until a party member drunk-walks.

**Verification:** `tests/test_drunk_walk.html` **14/14** (8 `tryDiagMove`: clear/blocked-target/
corner-cut/one-orthogonal/SW+NW combine; 6 `tryMoveTo`: approach/diagonal-detour/reverse-fires/
reverse-skips-by-rand/zero-delta/wrap). Live vs real data: `__U6.driveTo(5, …)` walked Lord
British tile-by-tile toward the target (greedy S-then-W), reached adjacent on open carpet
(auto-stop at Chebyshev ≤ 1), and stalled against dense throne-room furniture — the correct
drunk-walk limitation (nudges one blocker, doesn't route-plan).

## I-save/load scope — full-snapshot JSON persistence

**DONE (2026-06-10).** Save/restore the live game across sessions. Artifacts stay the static
baseline (re-uploaded each session); the save is a clone-internal JSON carrying ONLY the mutable
ECS state (`research_save_load.md`: "the format is throwaway; the state set is the deliverable").
**Full snapshot**, not a delta — in an ECS the full dump is the cheapest correct form and it
auto-captures future components. Non-numeric label by design so the planned `I-16`…`I-19`
movement-arc numbers are untouched.

**Files:** new `systems/persistence/snapshot.js` (serialize + restore) + `tests/test_snapshot.{html,js}`;
edits to `main.js` (boot restore hook + Export/Import + dropzone `.json`), `index.html`
(`#save-controls`), `u6db.js` (`del`).

**Snapshot model (generic over the ECS).** No `ecs/world.js` change was needed: `world.query()`
(no-arg) already yields every live entity, and the `components.js` catalog filtered by
`world.isRegistered()` covers component discovery. Each live entity → `{ comps: { Name: {field:…} } }`,
save-id = array index. **Entity references**: the only component field holding a raw handle is
`ContainedIn.holder` (a `Float64Array`); convention = **a `Float64Array` field is an entity
reference**, serialized as the referent's save-id and remapped to the fresh handle in a second
pass on load (generic + auto-grows). `Actor.npcId`/`Schedule.npcId`/`PartyMember.slotIndex` are
stable values, serialized as-is. Resources are an explicit whitelist — `WorldClock` + `Party`.
`WorldSpeed`/`Camera` are deliberately NOT saved (the boot owns them: `dev_hud` re-applies the
speed slider, `startRender` recenters the camera on the avatar), and everything else is static
(TileRegistry/MapLevel/Schedules) or rebuilt (Paths/SpatialIndex/ActorIndex). **Conversation /
NPC-record state**: the conversation system mutates the decoded `objlist` IN PLACE (actors'
`talkFlags` + trained stats, `globals.karma`, and — later — party join/leave), not via ECS
components, and `objlist` is re-decoded pristine each boot — so the snapshot also carries the
full `objlist` (actors + globals + party), re-applied in place on restore. Without it, passing
Lord British's questions was lost on reload (caught in live testing 2026-06-10). The snapshot also
carries `loadedRegions` + a `version`
+ an `artifacts` stamp (FNV-1a over objlist bytes) for an import-mismatch warning.

**Restore = replace `loadActors`.** On boot, `consumePendingRestore` reads a one-shot reserved
U6DB key (`__pending_restore.json`); if present, `restoreWorld` runs **in place of** `loadActors`:
recreate entities, remap `Float64Array` refs, rebuild `ActorIndex` + `SpatialIndex` (insert in
save-id order — on-map entities are emitted in cell-chain order so cell-pick chains survive), set
`loadedRegions`, restore resources. A restored boot **skips the first-tick schedule re-resolve**
(the saved AIMode/Destination are already correct).

**Object deletion needs no tombstones** (the case Zane raised). A destroyed object is simply
absent from the dump, and restore re-marks its region loaded so the streamer never re-reads
pristine objblk to resurrect it. Airtight by invariant: a world object can only be destroyed once
its region is loaded, so a deletion's region is always in `loadedRegions`; NPCs are global and
restore bypasses `loadActors`. **Dependency**: rests on no-region-unload
(`project_ultima6_no_region_unload`) — see `research_save_load.md §"Object deletion"`.

**Export / Import UI.** `#save-controls` in the dev block: Export → `serializeWorld` → Blob →
`u6save-<ts>.json` download (the `../ultima6/map_viewer.js` Blob pattern); Import (button or a
dropped `.json`) stashes the JSON under the reserved key + reloads, so the boot path restores it.

**Sub-steps (save-point each):** (a) confirm no ECS change needed → (b) `serializeWorld` →
(c) `restoreWorld` + unit round-trip test → (d) boot restore hook → (e) Export → (f) Import →
(g) tests + docs.

**Verification.** `tests/test_snapshot.html` **17/17** (round-trip deep-equality;
`ContainedIn.holder` ref remap to fresh handles; resources; loadedRegions; cell-chain head order).
Live vs real data (1052-entity world): mutate (clock→15:30, delete obj 326 @ (365,265) in loaded
region 18, add a torch) → snapshot (206 KB) → reload → restore reproduced **1052/1052** entities,
the **deletion stayed dead** (region 18 gated, not resurrected), the addition persisted, clock +
`loadedRegions` restored, Export produced a valid JSON Blob — no console errors. **Talk-state
(2026-06-10 fix):** set an NPC `talkFlags` bit + `globals.karma` on the live `objlist` → export →
reload → both restored (the analog of "passed Lord British's questions stays passed"). Unit:
`test_snapshot.html` adds an objlist round-trip (talkFlags / trained stat / karma / party) → 22/22.

## I-16 scope — arrival behaviors + direction system (§七)

**Done (a–c + two review fixes + d, 2026-06-10).** Finished `__AtDestination` and the direction/frame system —
"what an NPC does on arrival, and how it faces." Spec: [U6_NPC_排程與移動邏輯.md](U6_NPC_排程與移動邏輯.md) §七 +
`research_npc_ai.md §"Arrival"`. Built on I-9g (worktype settle + `STAND`/`GUARD` facing + humanoid walk frames).

**Sub-steps:**
- **a — `origObjNumber` + arrival branches.** New `ObjType.origObjNumber` (mirrors source `OrigShapeType`):
  set = objNumber at load; restored on pose-exit so `SLEEP`→`OBJ_092` / `PLAY`→`OBJ_188` don't permanently change
  identity. `atDestination` `SLEEP`/`SIT`/`EAT`/`PLAY`/`RINGBELL` branches — `C_1E0F_2184` prop lookup, `C_1E0F_2125`
  plate-facing for `EAT`, sleep-on-spot fallback.
- **b — `setDirection` humanoid arm + chair-override.** `C_1E0F_0664` humanoid: sit pose (cycle 3) facing the
  chair's direction (`OBJ_0FC` = chair frame; `OBJ_147` throne = face S); stand `(facing<<2)|1`; walk via `walkStep`.
- **c — full `setDirection` + non-humanoid walk facing.** Per-type arms: gazer (frame IS facing,
  `OBJ_162`/`167`/`19E`/`184`), `OBJ_16A` (12 frames/dir, cycles 3/7/11), `OBJ_16B` (3/dir), `OBJ_164` (random),
  2-frame family (frame = walkbit + `facing<<1`). `npcStep` no longer humanoid-gated. (This **lifts** the I-9
  "non-humanoid animation deferred" deviation — gazers/animals now face + animate.)

**Two fixes from the live review (commits `0121f8e`, `3474856`):**
- **Multi-tile furniture footprint** (`0121f8e`). `findPropAtCell` (`C_1E0F_2184`) only checked the NPC's OWN cell,
  so a seated NPC never found a 2-wide throne (`OBJ_147`) whose anchor is the cell to the EAST → Lord British faced
  north and never took the sit pose. Ported `FindLoc`/`NextLoc` (`seg_1184.c:211-291`): also scan `loc_right`
  (double-H), `loc_down` (double-V), `loc_dn_rt` (2×2) with the `D_0658` footprint offset; chair test is
  `frame - D_0658 == 2`, `SLEEP` bed sub-frame likewise. **Decode gotcha:** source `TileFlag`/DoubleH/V is the
  clone's `flags2` plane (`TileFlag` @0x800), NOT `flags1` (`TerrainType` @0).
- **Restore sprite on wake, not arrival** (`3474856`). A sleeping NPC kept its bed sprite (`OBJ_092`) for the WHOLE
  walk to its next slot (restore was on arrival only). Restore `origObjNumber` when the schedule sends a posed NPC
  (`SLEEP`/`PLAY`) off to a new slot — source restores on **wake**: `seg_0A33.c:837-840` (ClrAsleep + ObjShapeType =
  OrigShapeType once mode left `AI_SLEEP`) + the PLAY-exit restore in the schedule arm (`seg_1E0F.c:2287`).

**d — `AI_SCHEDULE` continuous-settle.** Source calls `__AtDestination` for every `AI_SCHEDULE` NPC each active
tick (`seg_1E0F.c:2198`), acting on the **save-persisted** `SchedIndex` (`seg_0C9C.c:311` reads it from the save).
The clone settled only on the hourly arm, and `resolveSlotAt` is exact-hour-only, so an NPC loaded/streamed
mid-period showed its raw pose until the next exact-hour event — Lord British loaded **standing** instead of
sitting on his throne. Fix: new `Schedules.resolveActiveSlot(npc, hour, dow)` (most-recent slot ≤ now, day-matched,
wrapping midnight — re-derives `SchedIndex` without persisting it; 7×24 bound) + an `AI_SCHEDULE` branch in
`npc_tick_system`: on-slot → `atDestination` (apply the worktype pose/facing), off-slot → `AI_FINDPATH` (walk
there). Null-safe (off on the unit-test worlds). Tests: `resolveActiveSlot` wrap/day cases + on-/off-slot tick
settle (`tests/test_pathfinding.js`, **157/157**).

**Kept deviations / decisions:**
- `findPropAtCell` scans own + right/down/dn-rt only (the source `FindLoc`/`NextLoc` footprint) and returns the
  first match — there is normally one relevant prop per cell.
- `resolveActiveSlot` **re-derives** the active slot each call instead of porting the save-persisted `SchedIndex`
  byte — the clone drops re-derivable save state (same principle as `MovePts`→accumulator).
- The `AI_SCHEDULE` settle is per-tick but **transient**: an NPC leaves `AI_SCHEDULE` after one settle (→ worktype
  or `FINDPATH`), so it fires ~once per load/region-load, not every tick (no pathfinder hammering).

### AI-mode dispatch coverage — the I-16 / I-17 boundary record

The full `NPCMode` dispatch is the `switch(NPCMode)` at `seg_1E0F.c:1748` (per-NPC AI turn) + `__AtDestination`
(`:1002`) for arrivals + the `AI_SCHEDULE`→`__AtDestination` settle (`:2198`). Coverage as of I-17:

| Mode(s) | Source handler | Clone status |
|---|---|---|
| `AI_SCHEDULE` 0x80 | `__AtDestination` every tick (`:2198`) | **ported (I-16d)** — `resolveActiveSlot` + tick settle |
| `AI_FINDPATH`/`ONPATH`/`84`/`85`/`86` 0x81–86 | pathfind + `__DoOnPath` | ported (I-9) |
| `AI_STAND_N..W` 0x87–8a | arrival facing | ported (I-9g / I-16) |
| `AI_SLEEP`/`SIT`/`EAT`/`PLAY` 0x91–95 | arrival pose + idle | ported (I-16; multi-tile + wake-restore fixed) |
| `AI_GUARD_N..W` 0x8b–8e | arrival facing **+ pacing** (`:1820`) | facing ported (I-9g/I-16); **pacing ported (I-17c)** |
| `AI_WANDER`/`GRAZE` 0x8f | `C_1E0F_37DB` (1/8 → one random cardinal step) | **ported (I-17a)** |
| `AI_LOITER`/`FARM` 0x90/94 | `C_1E0F_33C4` (1/8 → one step drifting near the slot) | **ported (I-17b)** |
| `AI_RINGBELL` 0x98 | arrival + bell tile anim (`:1835`) | arrival ported; **bell anim → its own later step** (on-demand tile-anim trigger) |
| `AI_SEEKOBJ` 0x82 | seek a chair/bed | not ported (rarely a schedule action) |
| `AI_CONVERSE`/`THIEF` 0x96/97 | approach player → talk/steal | deferred (player-interaction) |
| `AI_BRAWL`/`9A`/`VIGILANTE`/`ARREST` + all `COMBAT_AI_*` | combat subsystem | deferred by design (no combat yet) |

**Why this boundary entry exists (the discipline it records).** Both I-16 review bugs were *missing sub-paths in a
feature the ledger already called done* (the throne `D_0658` footprint; the wake-time sprite restore), and the
`AI_SCHEDULE`-settle gap (I-16d) was a whole dispatch arm the clone silently skipped. The cheap defense is to
enumerate the source dispatch arms a step claims to cover and mark each **ported / deferred-with-reason** — this
table. I-17 picks up three of the `→ I-17` rows: the persistent moving worktypes `WANDER`/`GRAZE` (via
`C_1E0F_37DB`), `LOITER`/`FARM` (via `C_1E0F_33C4`), and `GUARD` pacing, all riding the I-14/I-15 move primitives.
`RINGBELL` is **split to its own later step** (it needs an on-demand "trigger a specific tile's animation" hook the
clone doesn't have yet — see §"I-17 scope"); combat-AI and thief/law modes stay deferred by design (educational-port
scope, `user_retro_port_goal`).

## I-17 scope — NPC AI behaviors (persistent moving worktypes + guard pacing)

**Status: COMPLETE (2026-06-11).** The moving schedule worktypes are now active per-turn behaviors (a–c), plus
I-17d (displaced settle-in-place NPCs stand aside on a shove + return to post). test_pathfinding **194/194**;
WANDER + LOITER live-verified moving on real data. Spec:
[U6_NPC_排程與移動邏輯.md](U6_NPC_排程與移動邏輯.md) + `research_npc_ai.md §"Per-mode dispatcher"`.

Turns the **moving** schedule worktypes from idle leaf states (where I-16's `__AtDestination` parks them on arrival)
into **active per-turn behaviors**. The clone analog of the worktype cases in source's per-mode dispatcher
`C_1E0F_3E6A` (`seg_1E0F.c:1733-1848`). Builds entirely on existing primitives — the I-14 DEXTE accumulator
(`move_economy.js`), the I-15 `tryMoveTo`/`npcStep` move kernel (`drunk_walk.js` / `npc_path.js`), and the I-16c
non-humanoid facing (so animals/gazers face + animate). **No new pathfinding.** Worklist = the `→ I-17` rows of the
§"I-16 scope" AI-mode dispatch coverage table.

**In scope — the three non-combat moving worktypes (verified against source 2026-06-11):**

| Worktype | Source | Behavior |
|---|---|---|
| `WANDER`/`GRAZE` 0x8f / 0x0c | `C_1E0F_37DB` (`seg_1E0F.c:1558-1574`) | 1/8 → one step in a random cardinal (`OSI_rand(0,3)<<1`), else idle |
| `LOITER`/`FARM` 0x90 / 0x94 | `C_1E0F_33C4` (`:1448-1462`) + `C_1E0F_31C7` (`:1391`) | 1/8 → one geometric-random-biased step *toward the slot*, else idle |
| `GUARD_N..W` 0x8b–8e | dispatcher arm `:1820-1834` | 50% idle; else march guard-axis (on-slot) or current facing, reverse `dir^4` on a block |

`GRAZE` (0x0c) shares `C_1E0F_37DB` with `WANDER` (`:1810-1811`) but is set as an animal *disposition*, not a
schedule action — covered for free by the same handler once the 0x0c routing is added.

**Plus — I-17d: displaced settle-in-place NPCs (stand aside on a shove + return to post).** Completes the
clone-only step-aside (I-9). When a passing NPC's step-aside shoves a settle-in-place NPC
(STAND/SIT/SLEEP/EAT/PLAY) off its slot, it now **stands up** — mode → `AI_STAND` facing the shove + a plain stand
pose, any SLEEP/PLAY sprite swap restored — instead of freezing mid-stride or leaving a sit pose stranded on empty
floor. It keeps its `Destination` (slot + original worktype) and **walks back + re-poses** (sits/sleeps again) once
the slot cell **clears**. The clear-slot gate is the key: it waits the passer out, so there's no push↔return loop
(the loop the original step-aside comment warned about). Moving worktypes (WANDER/LOITER/FARM) and GUARD are left to
their own handlers — not converted. **Clone-only mechanism** — source has neither step-aside nor return (its settled
NPCs never move); it serves the clone's auto-advance heartbeat, the kind the post-I-9 audit calls legitimate.

**Split out / deferred (decided 2026-06-11):**
- **`RINGBELL` (0x98) → its own later I-step.** Source `SetTileAnimation(BaseTile[OBJ_0EC], 1)` (`:1841`) is an
  *on-demand* tile animation; the clone's `tile_animation_system.js` is always-on for animdata-flagged tiles, so
  this needs a "start/stop a specific tile's animation" extension that doesn't exist yet. The mode + chime-count
  logic (`MUS_Bell = Time_H % 12`, 0→12) is trivial; the missing piece is the triggered visual swing.
- **`THIEF`/`ARREST`/`VIGILANTE`/`BRAWL` + all `COMBAT_AI_*`** — deferred by design (no combat subsystem;
  educational-port scope, `user_retro_port_goal`).
- **`AI_9A` (0x9a) skittish-creature flee — NOT an I-17 activity (verified live 2026-06-11).** Trap to record: a
  schedule worktype can *look* like an I-17 persistent activity yet dispatch to combat AI. The **castle mouse**
  (npcId 9, `OBJ_162`) carries worktype `0x9a` on 5 of its 6 slots, but source routes `0x9a` (with
  `AI_RETREAT`/`SHY`/`FEAR`) to **`COMBAT_AI_Retreat`** (`seg_1E0F.c:1760`) — a flee/scurry handler in the deferred
  combat subsystem, not `C_1E0F_37DB`/`33C4`. So I-17's `WANDER`/`LOITER`/`GUARD` arms **do not** cover it; the mouse
  stays idle/stuck after I-17 (expected, not a regression — making it scurry needs `COMBAT_AI_Retreat`). **Not a z
  case:** all six mouse slots are z=0. Its "scurries the castle at night, missing by day" is fully explained by
  slot-reachability + the unported flee AI: night slots are central & reachable (h0/h19/h21 within ~9 of the castle
  center → the FINDPATH walk is the only motion the clone gives it → visible), day slots are peripheral & blocked
  (h7/h12/h14 at dist 17–28; the path fails and, being **in view**, the 2026-06-10 rule correctly refuses to teleport
  it → it parks motionless in `AI_SCHEDULE`/`AI_86`). A clean instance of the "in-view + unreachable slot → frozen
  NPC" interaction the post-I-9 audit flagged.
- **The `IsPlrControl` wander-toward-player arm** of `C_1E0F_37DB` (`:1561-1567`, 1/4 → `TryMoveTo(MapX,MapY)`) —
  needs NPC player-control/charm, which doesn't exist; dropped with a note.

### Design preamble — the probability × accumulator contract

Source rate-limits these behaviors **twice**, and the clone reproduces only one of the two for free. The contract
is how I-17 re-introduces the second on top of the I-14 accumulator.

**Limiter #1 — how often the NPC gets a turn (DEXTE-paced).** The round scheduler `C_1E0F_4E0A` grants turns by the
`MovePts/DEXTE` ratio, so high-`DEXTE` NPCs act more often per game-minute. This is the NPC's *clock rate*.

**Limiter #2 — the per-turn dice roll (duty cycle).** Inside the handler, even on a granted turn the NPC usually
does nothing — `WANDER`: `if(OSI_rand(0,7)==0) TryStraightMove(...); else SubMov(5)`. The decisive detail: **both
branches spend move points** (`TryStraightMove`→`SubMov` internally; the idle branch calls `SubMov(5)` explicitly),
so the budget drains either way and skipped turns can't bank into a later burst. The roll only decides whether
*this* turn's expenditure produces visible motion. Net feel: the NPC gets many turns but only shuffles a step on
~1/8 of them — the gentle townsfolk drift.

**What the clone already has.** The I-14 accumulator reproduces **limiter #1** faithfully and refresh-rate-
independently: `credit += rate(dexterity)·elapsed`, capped at the cell's `stepCost`; a step is allowed only when
`credit ≥ stepCost` and subtracts it. It does **not** reproduce limiter #2 — "step whenever credit allows" would
walk a continuous random walk every eligible beat, losing the 1/8.

**The contract — slot the source roll between eligibility and spend, and spend on BOTH outcomes:**

```
on each tick, for a worktype-active NPC:
  if credit < stepCost:  wait                         // limiter #1 (accumulator beat)
  else:
    if roll(source_probability) hits:                 // limiter #2 (source's coin)
        attempt move (tryStraightMove / tryMoveTo);  spend stepCost
    else:
        idle;                                         spend stepCost   ← load-bearing
```

**Why the idle branch must also spend** (mirrors source's `else SubMov(5)`): if a miss didn't spend, `credit` stays
`≥ stepCost`, so the handler re-rolls on the *next render tick* (~16 ms) and keeps re-rolling until it hits — the
first step lands within a few ms instead of on the next DEXTE beat, collapsing the duty cycle toward ~100% (constant
walking). Worse, it'd be **framerate-coupled** (144 Hz rolls more often than 60 Hz → faster wandering on a faster
monitor) — the exact bug I-14's wall-clock integration exists to kill. Spending on a miss forces the NPC to wait for
the accumulator to refill before its next roll. So: **the accumulator decides the beats; on each beat the NPC flips
the source coin to decide step-vs-stand.** Both limiters preserved at once. Dropping either changes the feel (no
accumulator → wrong/refresh-coupled speed; no probability → constant walking, no idle shuffle).

**Not a new invention.** This is the same gate the path-walker already uses — `npc_tick_system.js` waits on
`credit < cost` and spends cost on `step`/`blocked`/`aside` alike (a *blocked* path step already spends, same
"no-progress turns still cost" principle). The contract just inserts the source probability roll between the
eligibility check and the spend; the move-economy gate itself is unchanged.

**Kept deviation:** source's idle spends a flat 5 move points; a step spends terrain-weighted `SubTerrainMov`. The
clone caps `credit` at the cell's `stepCost`, so idle and step "cost" the same here (idle marginally pricier on heavy
terrain than source's flat 5) — invisible in play, simplest reset.

### Sub-steps (landed a–d)

- **a — WANDER/GRAZE** (`C_1E0F_37DB`) **+ the dispatch seam.** New `systems/npc_behaviors.js` holds the active
  worktype handlers (separately unit-testable, mirroring how `npc_path.js` holds `doOnPath`/`atDestination`).
  `npc_tick_system` lets the active-worktype modes through the mode gate, shares the I-14 credit-fill + step-gate
  with the path-walkers, and dispatches via `dispatchWorktype`. `wander()` = 1/8 random cardinal, else idle;
  `AI_GRAZE` (0x0c) + `isActiveWorktype` added to `ai_modes`. The probability×accumulator wrapper (spend stepCost on
  step AND idle) lives in the tick. The `IsPlrControl`-toward-player arm is dropped (noted above).
- **b — LOITER/FARM** (`C_1E0F_33C4` + the geometric-random `C_1E0F_31C7`). `loiter()` = 1/8 → one jittered step
  toward the `Destination` slot, else idle.
- **c — GUARD pacing** (dispatcher `:1820-1834`). `guardPace()` = 50% idle; else march the guard cardinal on-post /
  the current frame-facing off-post (consumes the I-9g/I-16 "read facing from `frame>>2`" hook), reversing
  (`dir^4`) on a block.
- **d — displaced settled NPCs: stand aside + return to post** (see the I-17d paragraph above). `isSettleInPlace`
  added; the `npc_path.js` step-aside converts a shoved settle-in-place blocker to `AI_STAND` + stand pose (sprite
  restored), keeping its `Destination`; `requestStepAside` returns the shove dir; `actorHandleAt` exported. The
  `npc_tick_system` return-to-post branch sends a displaced settle-in-place NPC back (`AI_FINDPATH`) once
  `actorHandleAt` shows the slot cell clear, re-posing on arrival via `atDestination`.

All deterministic tests use an injected `rand` (the `drunk_walk` pattern). test_pathfinding **194/194**; WANDER +
LOITER live-verified moving on real data (gentle 1/8 drift, no console errors). The handlers carry their
`// C_1E0F_*` citations.
