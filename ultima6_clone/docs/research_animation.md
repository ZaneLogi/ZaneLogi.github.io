# Research: U6 animation channels

**Status:** decoded 2026-05-27. Three render channels identified
in source, cross-validated against `../ultima6/doc/u6tech.txt`
§"Animation" and the legacy `../ultima6/anim_data_manager.js` +
`../ultima6/map_viewer.js` implementation.

Citations use relative paths within the u6-decompiled clone (e.g.,
`seg_0903.c:283`), legacy-port relative paths (e.g.,
`../ultima6/anim_data_manager.js`), or tech-doc sections. The
u6-decompiled clone's absolute path is per-PC; see
[`../CLAUDE.md`](../CLAUDE.md) §"Source of truth".

## Headline summary

U6 has **three distinct animation channels** that compose together
per render. They are NOT a single 60fps render loop.

| Channel | Mechanism | What animates | Cost per tick |
|---------|-----------|---------------|---------------|
| **1. Palette cycling** | Hardware VGA DAC writes via `outportb(0x3c8/0x3c9, ...)` rotates RGB through palette slots `0xE0-0xFB`. No pixel touched. | Fires, braziers, candles, BluGlo magic items, kitchen cauldrons | ~32 register writes |
| **2. animdata tile-pointer rewrite** | An indirection table (`tile_pointers[]` in source, `tileIndexMap` in legacy port) gets rewritten per tick from the `animdata` file's `{tile_to_animate, first_anim_frame, and_mask, shift_value}` records. | Water, fountains, pennants/flags, PC and NPC sprite cycles, protection fields | ~29 table writes + sparse re-blit of affected cells |
| **3. Hybrid tiles** | 32 static "dest" tiles get masked regions filled from a corresponding animated "source" tile per tick. Source mechanism = direct pixel copy in `u6mcga.drv`; legacy port reframes as one-shot transparent-mask + layered render. | Coast lines, river banks | Source: 32 partial pixel copies; Port: zero per-tick (mask cached) |

Channels 1 and 2 are independent — some tiles use both (protection
fields). The tech doc explicitly notes: "I don't know if 'multiple
frame' animation and palette rotation are synchronized in any way"
([u6tech.txt:421-422](../ultima6/doc/u6tech.txt)). In practice they
share the same idle-tick driver (`CON_prompt`'s no-key path) so they
run at roughly the same cadence — but the visual outputs are
independent.

## Channel 1 — Palette cycling

### Function: `PaletteAnimation()` = `C_0903_0820` at `seg_0903.c:283-326`

Called once per `CON_prompt` idle tick (see
[`research_game_loop.md`](research_game_loop.md) §"Input polling")
when `D_049C` is set. Skips early if `SpellFx[14]` (time-stop) is
active.

**VGA path** (`D_01C8 == 0`, lines 290-322):

The animation counter is `D_01D2` (incremented inline each call).
The function rotates colors through five palette intervals via
direct DAC writes:

```c
// border color via BIOS int 0x10
bp_02 = (D_01D2 ++) & 0xf;
if(bp_02 > 7) bp_02 = 0xf - bp_02;   // triangle wave 0..7..0
bp_02 += 0xc;
bp_12.x.ax = 0x1010;                  // set border color
bp_12.x.bx = 0xff;
bp_12.h.dh = bp_12.h.ch = bp_12.h.cl = bp_02;
int86(0x10, &bp_12, &bp_12);

// 8-wide cycles at indices 0xE0-0xE7 and 0xE8-0xEF (1-tick step)
for(bp_02 = 0; bp_02 < 8; bp_02 ++) {
    outportb(0x3c8, ((D_01D2 - bp_02) & 7) + 0xe0);
    for(si = 0; si < 3; si ++)
        outportb(0x3c9, D_8C2C[0xe7 - bp_02].content[si]);

    outportb(0x3c8, ((D_01D2 - bp_02) & 7) + 0xe8);
    for(si = 0; si < 3; si ++)
        outportb(0x3c9, D_8C2C[0xef - bp_02].content[si]);
}

// 4-wide cycles at 0xF0-0xF3, 0xF4-0xF7, 0xF8-0xFB (2-tick step
// because indexed via D_01D2 >> 1)
for(bp_02 = 0; bp_02 < 4; bp_02 ++) {
    outportb(0x3c8, (((D_01D2 >> 1) - bp_02) & 3) + 0xf0);
    for(si = 0; si < 3; si ++)
        outportb(0x3c9, D_8C2C[0xf3 - bp_02].content[si]);
    /* 0xF4-0xF7 and 0xF8-0xFB blocks follow identical pattern */
}
```

**`D_8C2C[]`** is the source palette table (256 entries × 3 bytes
RGB, indexed-color palette). The animation reads "source slot
`0xE7 - bp_02`" and writes to "DAC slot `((D_01D2 - bp_02) & 7) +
0xE0`" — so the cycle direction is reverse-iteration through the
source, forward-rotation of the destination. Visually this means
"the gradient at slots 0xE0-0xE7 slides one step per tick."

**Non-VGA path** (`D_01C8 != 0`, line 324):

```c
GR_27((unsigned char)(D_01D2 ++));
```

Delegates to the graphics-driver vptr. The driver (loaded from
`U6.CH` per `main()`) handles per-platform palette cycling on
EGA/CGA/Tandy/Hercules with their own substitutes — exact behavior
out of scope (the per-driver code is not in u6-decompiled).

### Palette slot map (cross-validated by `u6tech.txt:340-347`)

| Slot range | Width | Step rate | Used for |
|------------|-------|-----------|----------|
| `0xE0-0xE7` | 8 | per tick | Fires, braziers, candles |
| `0xE8-0xEF` | 8 | per tick | BluGlo magic items |
| `0xF0-0xF3` | 4 | per 2 ticks | (tech doc marks unknown) |
| `0xF4-0xF7` | 4 | per 2 ticks | Kitchen cauldrons |
| `0xF8-0xFB` | 4 | per 2 ticks | (tech doc marks unknown) |
| Border | n/a | per tick (triangle wave) | Screen border color |

Tech doc characterizes this as "the relevant code is located at
offset `0x13D5` in the unpacked `game.exe`" — which corresponds
to `C_0903_0820` in u6-decompiled, matching seg+offset naming.

### Key property — no pixels touched

The screen-pixel buffer is unchanged across palette-cycle ticks.
Only the DAC's color-lookup-table contents change. The visible
flicker / flow of fires, water (when palette-cycled), magical
items happens because the indexed-color pixels resolve to
different RGB through the cycled LUT.

This is the canonical "1990 palette animation trick" — visually
expensive output for negligible CPU cost (just register writes).

## Channel 2 — animdata tile-pointer rewrite

### `animdata` file format

From `u6tech.txt:381-391` (cross-validated by
`../ultima6/anim_data_manager.js:14-36`):

```
struct animdata {
    unsigned word number_of_tiles_to_animate;   // = 0x1D (29)
    unsigned word tile_to_animate[0x20];        // capacity 32
    unsigned word first_anim_frame[0x20];
    unsigned byte and_masks[0x20];
    unsigned byte shift_values[0x20];
};
```

Total size: `2 + 32×2 + 32×2 + 32 + 32 = 194 bytes`. 29 entries
are active; the remaining 3 slots in each array are padding /
reserved.

### Mechanism

For each active entry `i`:

```c
current_anim_frame = (game_timer & and_masks[i]) >> shift_values[i];

tile_pointers[tile_to_animate[i]]
    = tile_pointers[first_anim_frame[i] + current_anim_frame];
```

(Tech doc pseudo-code at `u6tech.txt:407-414`.)

**Interpretation**: each entry says "tile slot `X` (a placeholder
tile with no graphics) should currently display the frame at
`first_anim_frame[i] + ((game_timer & mask) >> shift)`."

- `mask` determines the cycle length: `mask = 0x07` → 8-frame
  cycle; `mask = 0x03` → 4-frame cycle.
- `shift` lets one mask serve multiple animations at different
  rates: with `mask = 0x0F, shift = 2` the visible frame index
  advances every 4 game-timer ticks.

The rewrite is into an **indirection table** (`tile_pointers[]` in
source, `tileIndexMap` in the legacy port). The actual tile blit
code reads through this table, so the next render frame picks up
the new visual without any per-tile blit invalidation logic.

### Tile categories animated (from `u6tech.txt:372-377`)

- **Water** (ocean, lakes, rivers) — visible flow
- **Fountains** — water-spout cycle
- **Pennants and flags** — wave
- **PC and NPC sprite cycles** — breathing / idle bob; combat
  stance frames
- **Protection fields** — flicker (combined with palette cycling)

### Tech-doc note on timing

`u6tech.txt:400-402`: "the game timer is incremented regularly. I
don't know how regularly, though :)" — meaning even the
nuvie-era tech-doc author hadn't pinned down `game_timer`'s tick
rate. From u6-decompiled the answer is now clear: it's `D_01D2`
(or a sibling counter), incremented inside `CON_prompt`'s idle
tick alongside palette cycling. The exact tick-rate cap is TBD
(see open questions below).

### `OtherAnimations` ≠ animdata loop

`OtherAnimations()` at `seg_0A33.c:436` is NOT the animdata loop;
it's a **deferred-render flag handler**:

```c
OtherAnimations() {
    if(D_17B0) { C_1100_0306(); D_17B0 = 0; }   // composite-dirty
    if(D_0340) { C_0A33_0073(); C_0A33_09CE(1); MUS_0525(); }
    if(CyclopsFlag) { ShakeScreen(CyclopsFlag, 1); CyclopsFlag = 0; }
}
```

The actual animdata loop site has not been pinpointed yet in
u6-decompiled — tech doc says it's at game.exe offset `0x1F28`.
Probable candidates: `C_0A33_0073` (called from the `D_0340` path
inside `OtherAnimations`), an unnamed callee of `OtherAnimations`,
or a separate driver function called from `CON_prompt` itself. See
open questions.

## Channel 3 — Hybrid tiles

From `u6tech.txt:424-429`:

> Some tiles are part animated tile and part static tile, such as
> coast lines and river banks. Hybrid tiles are animated by
> copying parts of a regular animated tile into a static tile.

### Source-side mechanism (per `u6tech.txt:430-516`)

The hybrid code lives in **`u6mcga.drv`** (the MCGA/VGA graphics
driver file), NOT in `game.exe`. Per the upstream u6-decompiled
README, per-driver code is "decompiled but not yet released" — so
this mechanism is **out of u6-decompiled's scope**. The tech doc is
the primary source for the source-side spec; deeper tracing of
u6-decompiled won't find it.

Spec from tech doc:

- Two parallel arrays at `u6mcga.drv` offsets `0x2C00` (sources) and
  `0x2C40` (dests): `unsigned word [0x20]` each = 32 source/dest
  tile-index pairs, indexed into `tileindx.vga`.
- `animmask.vga` is shipped as an original U6 asset; layout =
  `unsigned byte animmask_vga[0x20][0x40]` = 32 mask blocks × 64
  bytes each.
- Per-block format: first byte `bytes2copy`; then (displacement,
  bytes2copy) pairs; terminate when both displacement and bytes2copy
  are zero.
- Tick code at `u6mcga.drv` offsets `0x2CFA` and `0x2D2F`. Per tick,
  for each of 32 entries: `dest_tile[copy_pos] =
  source_tile[copy_pos]` — **pixel COPY** from animated source tile
  into the masked region of the static dest tile.

Net effect: each tick, 32 hybrid tiles get their masked regions
freshly written from the corresponding animated source tile. The
static (non-masked) part of the dest tile is untouched. The "coast
edge stays fixed while water inside it flows" effect emerges from
the static dest tile's non-masked pixels staying put while the
masked pixels track the animated water frame.

### Legacy port mechanism (confirmed via `../ultima6/tile.js`)

The legacy port implements the same visible result with a different
mechanism — invert the mask and let layered rendering do the work.

- [`../ultima6/tile.js:60-80`](../ultima6/tile.js) `processAnimMask(i, pixels)`:
  reads `animmask.vga` (decompressed at
  [`tile.js:27-28`](../ultima6/tile.js)) — same RLE (displacement,
  length) format the tech doc describes. For each run, `pixels.fill(0xff,
  pixelOffset, pixelOffset + clen)` — fills the dest tile's masked
  region with the colorkey value `0xFF`.
- [`../ultima6/tile.js:147-168`](../ultima6/tile.js) `getTilePixels(index)`:
  caches each tile's decoded pixel buffer, then for `index >= 16 &&
  index < 48` (= the 32 hybrid dest tiles) calls `processAnimMask`
  ONCE at decode time. The cached result persists for the session.
- [`../ultima6/tile.js:191-192`](../ultima6/tile.js) (inside
  `getTileImage`): `if (color === 0xFF) { rgba[base + 3] = 0; }`
  — `0xFF` resolves to alpha=0 (fully transparent) when the tile is
  rasterized to RGBA for the WebGL atlas.
- At render time, the animated source tile is drawn first (via
  channel 2 animdata indirection), then the hybrid dest tile is
  drawn on top with the carved-out region transparent. The water
  animation under the mask appears to flow "through" the static
  coastline because it is literally being drawn under transparent
  pixels.

**Comparison:**

| | Source (`u6mcga.drv`) | Legacy port |
|---|---|---|
| Per-tick work | Copy `dest_tile[i] = source_tile[i]` for masked positions across all 32 hybrid tiles | None for hybrid — the static cached tile + animated source tile both render normally |
| Tile data mutation | Yes — dest tile's pixel buffer is rewritten in place per tick | No — dest tile's masked positions are made transparent once at decode time and cached |
| Where animation comes from | Direct pixel copy from animated source | Layered render: animated source draws under the dest's transparent holes |

Same visible result, much cheaper runtime in the port. The port's
approach also slots naturally into a WebGL pipeline (transparent
pixels in the indexed-color tile texture; the shader's alpha test
handles the rest).

### Range and asset notes

- The dest-tile range is documented as 32 tiles (`[0x20]` array
  dimension in the tech doc). The legacy port hardcodes it as
  indices 16-47 (`index >= 16 && index < 48`) — same count, with the
  base index 16 likely sourced from observation or extracted from
  the dests[] table at u6mcga.drv offset `0x2C40`. The tech doc
  itself doesn't explicitly cite the absolute index range; the
  array sizes match.
- `animmask.vga` is an original U6 ship asset file. Same lzw-
  compressed packaging as the other `.vga` assets.
- Visual confirmation: in the legacy port, standing at a shoreline,
  the water under the coast tile animates while the coast tile's
  land pixels stay static — exactly the "hybrid" effect the tech
  doc and source mechanism describe.

### What's still TBD in u6-decompiled

Deeper tracing of u6-decompiled to find the source-side mechanism is
**deferred** — the implementation lives in `u6mcga.drv`, not
`game.exe`, so u6-decompiled won't carry it. What u6-decompiled
SHOULD carry is the call site from `game.exe` into the driver vptr
(`D_ECB8` / `D_ECC4->_06`) that triggers the hybrid pass. Locating
that vptr-call site is a follow-up item.

## Tick site — `CON_prompt`'s idle path

The animation tick happens inside `CON_prompt`
(`seg_0C9C.c:483-520`; see
[`research_game_loop.md`](research_game_loop.md) §"Input polling"
for the call chain). Per iteration:

```c
ch = C_31FA_000C(D_04AB);       // non-blocking keyboard scan
if(ch == 0) {                   // no key — idle
    /* animated text cursor */
    (*D_04CC)(PromptCh + ((PromptCnt++) & 3), promptX, promptY);
    D_033E = 1;
    if(D_049C) {                // animations enabled
        OtherAnimations();      // process deferred-render flags
        PaletteAnimation();     // <-- channel 1 fires here
    } else {
        OSI_delay(1);
    }
    ServeMouse;
}
```

`PaletteAnimation` is invoked explicitly. The animdata loop
(channel 2) must be invoked from somewhere on this path too — most
likely inside `OtherAnimations` (or its `D_0340` branch through
`C_0A33_0073`) — but the exact call site is unconfirmed.

**Tick-rate cap**: there is no explicit `OSI_delay(N)` in the
animations-enabled branch — the rate is whatever the CPU can
sustain doing `OtherAnimations + PaletteAnimation + ServeMouse`
plus the cursor blit. On 1990 hardware that was probably 20-30 Hz
(visibly stepped). On modern hardware (if the port ran without
modification) it would be 1000s of Hz, well into "imperceptible
animation" territory. **Modern ports must throttle this** — the
legacy `ultima6/map_viewer.js` does so at `Math.floor(frame / 4)`
= 15 Hz on a 60fps render loop ([map_viewer.js:407](../ultima6/map_viewer.js:407)).

## Legacy port — implementation reference

The user's existing `../ultima6/` port implements channels 1 and 2
in WebGL with a tile-indexed texture + palette LUT shader. Key
files:

- [`anim_data_manager.js`](../ultima6/anim_data_manager.js) —
  parses the `animdata` file (matches the tech-doc layout exactly:
  `parseAnimData` lines 10-45) and maintains `tileIndexMap` (the
  legacy port's name for `tile_pointers[]`).
- [`anim_data_manager.js:47-76`](../ultima6/anim_data_manager.js) —
  `update(frame)`: runs the formula per active entry, returns the
  `Set` of tile IDs whose mapped frame changed this tick.
- [`map_viewer.js:406-462`](../ultima6/map_viewer.js) — `updateFrame(frame)`:
  - Computes `animFrame = Math.floor(frame / 4)` (15 Hz tick).
  - Calls `AnimDataManager.update(animFrame)`.
  - Walks the returned `changedIndices`, looks up positions in
    `tileUsageMap` (precomputed reverse index: tile ID → buffer
    positions), patches those positions in `mapTileIndices`.
  - Calls `Shader.updateLayer(0, mapTileIndices, modifiedIndices)`
    for a sparse GPU upload.
- [`palette_manager.js`](../ultima6/palette_manager.js) — manages
  the 256-color palette LUT uniform. Channel-1 cycling rewrites the
  palette buffer (no DAC equivalent in browsers).
- [`indexed_texture_manager.js`](../ultima6/indexed_texture_manager.js) —
  builds the indexed-color tile atlas that the shader samples
  against the palette LUT.

The legacy port's `tileUsageMap` reverse-index is the key
performance trick. Without it, the per-tick partial update would
require scanning the whole `mapTileIndices` buffer for cells using
each changed tile ID. With it, the update touches only the
positions that actually need patching — typically a few hundred
cells across the visible region, not all 10k+.

## Implications for the rebuild

The three channels map cleanly to WebGL primitives:

1. **Palette cycling → fragment-shader palette LUT uniform.** The
   shader samples an indexed-color tile texture against a
   `palette[256]` uniform. Cycling rewrites the affected slots
   (`0xE0-0xFB`) of the uniform per tick. Cost: a UBO update of 96
   bytes (32 slots × RGB). Native fit for source's mechanism.
2. **animdata → sparse `bufferSubData` patches on a tile-index
   buffer.** The legacy port already does this — copy its pattern.
   Tick at 15 Hz on top of the 60 Hz render loop.
3. **Hybrid tiles → defer until needed.** The legacy port handles
   coast/river-bank edges implicitly via the asset-load pipeline.
   For the rebuild, decide during impl whether to bake hybrid
   tiles at asset load (one-shot CPU cost, simpler runtime) or do
   the per-tick partial copy in a shader pass (closer to source).

**Tick-rate decisions for the rebuild:**

- Channel 1 tick rate: target the perceptual sweet spot — too fast
  and fires look like static noise; too slow and they look like a
  slideshow. Source's effective rate on a 286 was ~20-30 Hz; the
  legacy port runs at 15 Hz. Pick something in that range, not
  60 Hz.
- Channel 2 tick rate: 15 Hz matches the legacy port and looks
  right for water / NPC sprite cycles. Same recommendation.
- Render loop rate: 60 Hz (or display refresh) for smooth
  drag-scroll. The animation channels run at their own slower rate
  and update the buffers/uniforms between render frames; the
  render itself just draws the latest state.

**ECS mapping:**

- `AnimationClock` resource — global counter (analog of `D_01D2` /
  `game_timer`). Advances at the animation tick rate.
- `TileRegistry` resource — owns `tileIndexMap` (animdata's
  indirection table) and the `palette` LUT.
- `AnimationSystem` — runs once per animation tick. Updates
  `TileRegistry.tileIndexMap` from `animdata` records; cycles
  palette slots `0xE0-0xFB` in `TileRegistry.palette`.
- `RenderSystem` — runs every render frame. Reads from
  `TileRegistry`; uploads buffer/uniform deltas; draws.

## Open questions

1. **Animdata loop call site.** The function that runs the per-tick
   `tile_pointers[tile_to_animate[i]] = ...` formula is not yet
   pinpointed in u6-decompiled. Tech doc says game.exe offset
   `0x1F28`; the matching seg+offset address needs to be located.
   Candidate: `C_0A33_0073` (called from `OtherAnimations`
   D_0340 branch).
2. **`game_timer` source.** The variable name in u6-decompiled is
   uncertain — `D_01D2` is incremented in `PaletteAnimation` but
   the animdata loop may use a different counter (sibling global
   or a value derived from `D_01D2`). Need to grep for
   `tile_to_animate` / `first_anim_frame` reads to find the loop.
3. **Tick-rate cap on 1990 hardware.** Was there a delay loop or
   `OSI_delay(1)` somewhere in the animations-enabled path that
   capped the rate? The branch I've read has no explicit cap, so
   either the bottleneck was the actual register writes, or
   there's a sibling throttle I haven't found.
4. **EGA/CGA/Tandy/Hercules palette cycle equivalents.** `GR_27` in
   the non-VGA driver. Per-driver code is out of u6-decompiled's
   scope; not strictly needed for a modern port (we target a
   single representation) but interesting for completeness.
5. **`SpellFx[14]` (time stop) gating** — `PaletteAnimation`
   skips when set. Does the animdata loop also skip? Important for
   the rebuild's "time stop" spell effect — animations should
   freeze.
6. **Hybrid tile vptr entry point in `game.exe`.** Source's hybrid
   code lives in `u6mcga.drv` (out of u6-decompiled scope per
   upstream README). What u6-decompiled should still carry is the
   call site from `game.exe` into the driver vptr (`D_ECB8` /
   `D_ECC4->_06`) that triggers the hybrid pass per tick. Locating
   that vptr-call is a follow-up. Mechanism itself is confirmed
   via tech doc + legacy port implementation; no urgent need to
   resolve before write-up.

## Cross-references

- [`research_game_loop.md`](research_game_loop.md) §"Input polling"
  — `CON_prompt`'s idle tick where channel 1 fires.
- [`research_map_render.md`](research_map_render.md) — the
  composite render path that reads from `tile_pointers[]` (i.e.,
  picks up animdata changes on next composite frame).
- [`research_engine_overview.md`](research_engine_overview.md) —
  `seg_0903.c` (PaletteAnimation host) and `seg_0A33.c`
  (OtherAnimations host) subsystem rows.
- [`../CLAUDE.md`](../CLAUDE.md) §"Modern-browser UX as architectural
  anchor" — why the rebuild's render-cadence + tick-rate decisions
  don't follow source's polling cadence.
- Tech-doc: `../ultima6/doc/u6tech.txt:323-429` — the canonical
  high-level description of all three channels.
- Legacy port: `../ultima6/anim_data_manager.js`,
  `../ultima6/map_viewer.js:406-462`,
  `../ultima6/palette_manager.js`,
  `../ultima6/indexed_texture_manager.js`.
