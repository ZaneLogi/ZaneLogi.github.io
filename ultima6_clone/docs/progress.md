# progress — ultima6_clone

The implementation-step ledger (matches `asteroids_clone` / `phoenix_clone`
convention: numbered `I-N` steps, each with a "scope" subsection carrying the
per-sub-step notes that don't fit a commit body). Research-side truth lives in
`research_*.md`; the architecture the steps build to is `architecture_ecs.md`.

**Status:** research phase closed; ECS runtime ground settled
(`architecture_ecs.md`). Implementation opening at **I-1 (terrain on screen)**. No
game code written yet.

---

## Step ledger

| Step | Title | Status |
|---|---|---|
| **I-1** | **terrain on screen** (ECS core + overworld render + a few entities) | **next** |
| I-2 | avatar entity + input + movement + camera follow | planned |
| I-3 | tile collision | planned |
| I-4 | NPC entities (static, drawn only) | planned |
| I-5 | NPC scheduled movement (stand / wander) | planned |
| I-6 | world clock | planned |
| I-7 | talk trigger (adjacency + key) | planned |
| I-8 | dialog UI window | planned |
| I-9 | conversation VM (adapt legacy `script.js`) | planned |

The ledger past I-1 is the visible-progress trajectory from
`architecture_ecs.md §10`, not a committed sub-step plan — each step's real
breakdown is written into its "scope" subsection when it starts. Deferred-to-later
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

- **I-1b — Asset pipeline as ES6 modules + data load.** Copy-then-own the legacy
  decoders (`palette_manager`, `tile`, `lzw_decoder`, `u6map`, `anim_data_manager`)
  as clean ES6 modules; wire the bring-your-own-data flow dropzone → `U6DB`
  (IndexedDB) → decode → `TileRegistry` resource (tile atlas + per-tile flags) +
  `MapLevel` resource (chunks + `worldTileIndex`). No bundled assets.
  *Verify:* checklist gate shows the required files present; log a known tile's
  flags read back from `TileRegistry`.

- **I-1c — Terrain render.** `RenderSystem` draws the terrain layer via the reused
  `Shader` (`createLayer` / `updateLayer` / `render`) fed from `MapLevel`;
  `CameraSystem` handles drag-scroll (reuse the `mapOrigin` viewport logic) and
  re-queries terrain on move.
  *Verify (browser):* Britain visible at the default origin `(276, 367)`;
  drag-scroll repaints smoothly; no console/WebGL errors.

- **I-1d — ECS entity layer (the integration test).** Spawn a few
  `Position` + `Renderable` entities (e.g. a tree / sign from `objtiles.vga`);
  `RenderSystem` walks the `SpatialIndex` → `query(Position, Renderable)` →
  `TileRegistry` flag lookup → **corrected per-tile** layer routing + double-tile
  expansion → entity-layer sub-buffer → reused `Shader`.
  *Verify (browser):* entities render at correct world positions, stay anchored
  while the camera drags, and a double-height tile places its head cell correctly
  (the pillar-bug fix is exercised here).

**Pre-impl research done:** `research_i1_render_slice.md` (render seam),
`research_map_render.md` (pillar-bug root cause + fix), `architecture_ecs.md`
(runtime ground). No further research blocks I-1.
