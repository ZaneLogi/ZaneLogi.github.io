# Research / design: I-1 render slice (terrain on screen)

Pre-implementation design for I-1's trickiest sub-step — how the proven legacy
renderer maps onto the ECS runtime ground (`architecture_ecs.md`). Settled in
discussion 2026-05-29 and **verified against the legacy code** (every `file:line`
below was re-read). I-1's scope and sub-steps live in `progress.md`; this doc is
the *why* behind the render seam.

The headline: "reuse vs. rebuild the renderer" was the wrong axis. The legacy
renderer is four separable layers that fit the ECS very differently. We reuse two,
drop one, lift one (with a bug fix), and defer one.

---

## 1. The renderer is four separable layers

| Layer | What it is | Verdict |
|---|---|---|
| **GPU draw mechanism** | WebGL2 instanced quad; per-instance `a_tileIndex` (u16) + `a_tilePos` (vec2); indexed-palette fragment shader (R8 tile-atlas texture + 256-color palette texture) | **Reuse** — architecture-agnostic |
| **Terrain feed** | viewport-cell scan → chunk lookup → fill the tile-index buffer | **Reuse** → wrap as `MapLevel` resource |
| **Entity feed** | collect visible objects/actors + marshal each into instance data | collection **DROP**; marshal-rules **LIFT** (with fix) |
| **Upload strategy** | how the buffer reaches the GPU each frame (full rebuild vs. partial `bufferSubData` + `tileUsageMap` dirty-tracking vs. no-dynamic-buffer) | **Defer** |

The data-layout concern (legacy layout vs. ECS) lives **only in the entity-feed
layer**. The draw mechanism and terrain feed carry zero ECS tension.

---

## 2. Reuse — draw mechanism + terrain feed

### Draw mechanism (verbatim, thin reshape to ES6 modules)

`ultima6/map_viewer_renderer.js` — the `Shader` object:
`createVAO` / `createLayer` / `updateLayer` / `renderLayer` / `render`
(`map_viewer_renderer.js:109,146,175,218,226`). Instanced draw at
`map_viewer_renderer.js:222` (`drawArraysInstanced(TRIANGLES, 0, 6, instanceCount)`),
per-instance attrs set at `map_viewer_renderer.js:120-132` (`a_tileIndex` via
`vertexAttribIPointer` UNSIGNED_SHORT + divisor 1; `a_tilePos` vec2 + divisor 1).
It only wants "a list of (tileID, position) instances per layer" — it has no idea
whether they came from a god-object or an ECS query. Supporting reusable pieces:
`palette_manager.js` (`setFromU6` decodes the 256-color `u6pal`, 6-bit→8-bit
`<<2`; `colorCycling` for water/lava) and `indexed_texture_manager.js` (R8 tile
atlas blit). The reshape is only: lift `Shader` into an ES6 module, drop the
duplicate `tile_viewer_shader.js` (DOM side-effects), pass the GL context in.

### Terrain feed → `MapLevel` resource

The viewport-cell → tile-ID lookup at `ultima6/map_viewer.js:129-136`:
```
worldTileIndex(xtile, ytile):
  chunk_index = superChunks.get(y>>3, x>>3)
  return chunks[chunk_index*64 + (y&7)*8 + (x&7)]
```
maps 1:1 onto a `MapLevel` resource holding the A-grid (`u6map.js`
`SuperChunks` / `DungeonChunks` / `chunks`, per `architecture_ecs.md §4`). Terrain
isn't entities in either model, so there's nothing to reconcile. The buffer is
**viewport-sized** (`mapW = ceil(canvas.width/16)`, `map_viewer.js:69-75`) — keep
that; the viewport is canvas-driven, not the original 11×11.

---

## 3. Drop — the legacy collection code

`updateObjects()` collects visible things two ways, both replaced by the ECS:
- objects from `ObjManager.surfaceObjs[chunkY%8][chunkX%8]` per-chunk bucket lists
  / `dungeonObjs[level]` (`map_viewer.js:209-263`);
- actors by a **brute-force scan** of `ObjManager.actors[256]` nested inside the
  viewport-tile loop (`map_viewer.js:273-284` — O(viewport × 256)).

Both are welded to the `ObjManager` god-object the ECS dissolves. The ECS replaces
them with one `SpatialIndex` walk over visible cells + `query(Position, Renderable)`
(`architecture_ecs.md §4-5`) — and does it *better*: the brute-force actor scan is
exactly the nested-scan hazard the spatial index exists to kill. **Do not port the
collection code.**

---

## 4. Lift — the marshal rules (with the pillar-bug fix)

The *logic* inside `drawObject` / `drawTile` (`map_viewer.js:299-345`) is
source-faithful U6 tile semantics worth keeping — we re-express it in the
RenderSystem rather than rewriting it from source:
- **layer routing** by tile flag (force-lower / lower / top);
- **double-width / double-height expansion** (a tall/wide object draws extension
  tiles at `baseTileIndex - 1/-2/-3`, placed at `ox-1` / `oy-1` / `ox-1,oy-1`);
- **animation remap** through `AnimDataManager.tileIndexMap[tileIndex]`.

### The pillar bug — fix it *while* lifting, don't copy it

`drawObject` is the documented pillar-bug site (`research_map_render.md:450`). The
bug: the layer check `tileFlag.isTopTile() !== topTile` reads **only the base
tile's** flag, so all extension tiles inherit the base's layer regardless of their
own flag. For a pillar (base `isTopTile=false`, head `isTopTile=true`) the head
lands in the lower layer and gets covered by top-layer objects (Steps) in the same
cell.

The fix (`research_map_render.md:603`): route **each tile by its own
`isTopTile()`** — a per-tile `drawTileForLayer(tileIndex, x, y, layer)` that looks
up *that* tile's flag, with the base-flag early-return removed. The ECS RenderSystem
implements this corrected per-tile routing from the start. (Bigger picture: the
4-layer model is a coarse approximation of source's per-cell chain Z-ordering;
per-tile flag routing is the minimal correct version. Going fully to source's
per-cell chain insertion is a possible later refinement, not needed for I-1.)

### Rules-lift shape — tile flags live in `TileRegistry`, keyed by tile ID

The flags (`isTopTile` `flags2&0x10`, `isDoubleHeight` `flags2&0x40`,
`isDoubleWidth` `flags2&0x80`, `isForceLowerTile` `flags3&0x04`;
`obj_manager.js:109-114`) live in the **`TileRegistry` resource keyed by tile ID,
NOT on the `Renderable` component**. Reasons:
1. Source stores `TileFlag[]` **tile-indexed**, not per-object — every object
   showing a tile shares one flag record. (`get_info(obj_number,obj_frame)` is
   itself a tile-keyed lookup.)
2. Green-Earth: ~2048 tile types vs. thousands of instances — per-instance flags
   duplicate immutable bits. `architecture_ecs.md`'s rule: don't store the same
   state twice.
3. It's already the architecture's direction — `architecture_ecs.md §4` locked
   `TileRegistry` as the resource holding per-tile definitions including flags.

So: **`Renderable` component = `{ tileId }`** (a `Uint16Array`); the RenderSystem
reads `TileRegistry.flags[tileId]` per visible entity and derives layer routing +
double-tile expansion from it. Even the layer assignment is resource-derived, not
component-stored (U6 needs no per-instance layer override).

---

## 5. Defer — the upload strategy

Legacy keeps a persistent per-layer `Uint16Array` instance buffer and, on animation
frames, does **targeted partial GPU updates** via `tileUsageMapList` (per-layer
`Map<tileID → [buffer-slot indices]>`, `map_viewer.js:66`) → `updateFrame()`
(`map_viewer.js:406-463`) rewrites only the changed slots and calls
`Shader.updateLayer` with the modified set, which range-coalesces
(`map_viewer_renderer.js:197-216`).

`tileUsageMap` is an **optimization tied to the persistent-buffer model**, not a
requirement. Its fate is the *fourth* renderer concern, independent of the
data-layout fit:
- I-1 uses a **simple full rebuild** for its handful of entities (rebuild of a few
  instances is free).
- Tile-frame animation (the `AnimDataManager.tileIndexMap` remap, ~29-32 tiles) and
  palette cycling (water/lava — handled entirely in the shader, no buffer touch)
  are the two animation channels; only the former interacts with `tileUsageMap`.
- Revisit when object count grows or if drag-scroll measurably stutters at modern
  resolution. A "no-dynamic-buffer / walk-visible-cells"
  renderer (re-look-up each visible cell's current tile at draw time → the GPU
  write-hazard never arises) is the candidate redesign — deferred, underspecified,
  not needed for terrain-on-screen.

### Known pitfall folded in — the flicker hazard

The legacy port had a flicker bug above ~2500 animated cells: each frame the
`>threshold` path re-uploaded the **entire** index buffer in place via
`bufferSubData(0, …)` — rewriting a `DYNAMIC_DRAW` buffer the GPU was still reading
from the prior frame's instanced draw → some instances sampled stale indices for a
frame. Legacy minimized (not eliminated) it via per-layer buffers + proportional
update threshold (`map_viewer_renderer.js:159-173`) + range coalescing. The ECS
design's escape from this is structural: the deferred no-dynamic-buffer approach
removes the per-frame in-place write entirely. For I-1, full-rebuild of a few
entities never reaches the hazard's scale, so it's a non-issue at this step — noted
here so the upload-strategy decision later is made with the hazard in view.

---

## 6. Legal — data load stays bring-your-own-data

**Data is never bundled or committed.** I-1 loads U6 files through the existing
client-side flow: dropzone → `U6DB` (IndexedDB, `ultima6/u6db.js`) → decode →
`TileRegistry` + `MapLevel` resources. (An asset-pipeline audit agent wrongly
recommended bundling assets and skipping `U6DB` — that violates the project's
binding game-data legal pattern; see `../CLAUDE.md` "Game-data legal pattern."
`U6DB` is load-bearing, not viewer scaffolding.) Minimal terrain-only file set:
`maptiles.vga`, `masktype.vga`, `tileindex.vga`, `u6pal`, `chunks`, `map`
(+ `animdata` for tile animation; `objtiles.vga` once entities are drawn in I-1d).

---

## 7. I-1 is the first integration test of the runtime ground

Rendering terrain alone would only exercise the A-grid + a resource. I-1
deliberately also spawns a few `Position`+`Renderable` **entities** drawn through
`query` + `store` + the `SpatialIndex` walk — so the visible payoff doubles as the
first end-to-end exercise of `architecture_ecs.md`'s runtime ground (allocator,
signature mask, query generator, store-handle, two-list scheduler, resource Map).
This is the rejected-alternative's opposite: not "let the renderer pull a core into
existence," but "build the core, then prove it by rendering through it." The
minimal surface I-1 forces into existence is the §10 graphics-first set of
`architecture_ecs.md`.

## 8. How Origin rendered terrain (source comparison)

Investigated for I-1c against `u6-decompiled`. Origin's terrain render:

- **Fixed 11×11 player-centered viewport** (176×176 px in the 320×200 VGA screen,
  8 px frame border). The clone deviates → canvas-sized free-scroll (modern-UX).
- **Two-pass, on-demand recomposite** (dirty-gated, not per-frame). Pass 1
  (`C_1100_0306`, seg_1100.c:144) builds `Tile_11x11[][]` from `AreaTiles[][]` with
  visibility flood-fill + lighting + neighbour-aware wall-variant selection
  (`D_0644[]`). Pass 2 (`C_0A33_09CE`, seg_0A33.c:350) blits each cell: background
  tile then object chain. The clone's RenderSystem is the same shape as Pass 2's
  121-cell loop, canvas-sized and continuous.
- **Blit primitive `GR_42`** is a macro dispatching through a graphics-driver
  function-pointer table: `(D_ECB8.iii.ofs = 0x42, (*D_ECB8.f)(tile,x,y))`
  (gr.h:61). The actual pixel copy lives in a *separate* VGA driver, not in the
  decompiled `GAME.EXE` — a clean hardware-abstraction seam. Draws to off-screen
  `D_9E3D`; `GR_45` flushes to the visible screen.
- **Palette-indexed (mode 13h):** screen + tiles are bytes of palette indices
  (0xFF transparent); the VGA DAC maps index→RGB; animation is palette-register
  cycling + animdata tile-pointer swaps, so static terrain bytes never move.

**The port/clone is structurally faithful, not just visually correct.** The
WebGL renderer reproduces Origin's palette-indexed model 1:1: an R8 index texture
= the screen's index bytes; the fragment shader's index→RGB lookup = the VGA DAC;
WebGL's "draw tile N at (x,y)" = `GR_42`'s dispatch; `colorCycling` rewriting the
palette texture = VGA palette-register cycling. The only deliberate departures are
viewport size and recompose cadence (both modern-UX deviations, §6).

## 9. How Origin renders objects (source comparison, for I-1d)

- **`ShowObjects` → `C_1184_35EA`** (seg_1184.c:1702) — double-tile expansion:
  hotspot tile at `(x,y)`, plus *preceding* tile-index entries into adjacent cells
  for big tiles — `DoubleH`(0x80)→`tile-1` at `(x-1,y)`; `DoubleV`(0x40)→`tile-1`
  at `(x,y-1)`; 2×2→`tile-1/-2/-3` at left/above/upper-left. A pillar = base +
  `tile-1` head in the cell above.
- **`ShowObject`** (seg_1184.c:1651) — per-cell linked chain, 3-zone Z-order by
  each tile's own `IsTileFor` flag: `IsTileBa` replaces terrain (skips chain);
  non-FG → chain head (covered); FG hotspot → before the FG block; FG **extension**
  → chain **end** (on top). Blit walks the chain forward (painter's).
- **Pillar bug** = the head (a `DoubleV` extension, itself a top tile) lands at
  chain-end/on-top in Origin (keyed off its OWN flag); the legacy `drawObject`
  routes the whole object by the BASE tile's flag, so the head inherits the lower
  layer and gets covered. Fix: route each tile by its own flag (research_map_render.md:603).

**I-1d** lifts these with the fix: `Position`+`Renderable` entities, an entity
render pass `query(Position,Renderable)` → double-tile expansion + **per-tile**
`isTopTile` layer routing → overlay layers above terrain. Two simplifications vs
Origin, both matching the locked plan: the fine per-cell **chain** Z-order becomes
a coarser **layer model + per-tile flag** (the documented coarse approximation;
full chain deferred to the object system), and the **spatial index** is deferred —
a few entities → `query` + viewport-cull (don't build for an absent scale). Both
arrive with the real object system.
