# Research: U6 map render path

**Status:** complete decode of the source-side render pipeline,
2026-05-27. Resolves pillar-bug hypothesis B (FALSIFIED — engine
does auto-extension, port-faithful behavior). Hypotheses A and C
still pending the legacy-port comparison (next step).

Citations use relative paths within the u6-decompiled clone (e.g.,
`seg_0A33.c:350`). The clone's absolute path is per-PC; see
[`../CLAUDE.md`](../CLAUDE.md) §"Source of truth".

## Pipeline overview

The map render is **two-pass per frame**: first build the per-cell
data structures, then blit them.

```
[Pass 1 — build]
C_1100_0306()                            seg_1100.c:144
├── compute AreaFlags / AreaLight        (lighting + wall edges)
├── populate Tile_11x11[11][11]          (background tiles from AreaTiles)
└── ShowObjects()                        seg_1184.c:1723
    ├── SearchArea(MapX-5, MapY-5,
    │              MapX+6, MapY+6)       seg_1184.c:369
    │   ↓ iterates Link[] forward, filtering by area+Z
    ├── for each object visited:
    │   ├── compute (obj_x, obj_y) within 11×11
    │   ├── tile = TILE_FRAME(objNum) = BaseTile[type] + frame
    │   └── C_1184_35EA(tile, frame, x, y)   seg_1184.c:1702
    │       ├── ShowObject(tile + frame, x, y, 0)   [hotspot]
    │       ├── ShowObject(tile-1, x-1, y, 1)       [if DoubleH]
    │       ├── ShowObject(tile-2, x, y-1, 1)       [if 2×2]
    │       ├── ShowObject(tile-3, x-1, y-1, 1)     [if 2×2]
    │       └── ShowObject(tile-1, x, y-1, 1)       [if DoubleV only]
    └── ShowObject() inserts into Obj_11x11[y][x]
        chain with layered ordering   seg_1184.c:1651

[Pass 2 — blit]
C_0A33_09CE(bp06)                        seg_0A33.c:350
├── for each (j, i) in 11×11:
│   ├── GR_42(Tile_11x11[j][i], scr_x, scr_y)     [background]
│   └── walk Obj_11x11[j][i] chain via D_E5E0[]:
│       └── GR_42(D_D5DC[node], scr_x, scr_y)     [each tile in chain, forward]
├── viewport frame border (4 corners + 4 edges)
└── if bp06: GR_45/GR_48 to flush off-screen → screen
```

Data structures used per frame:

- `Tile_11x11[11][11]` — background tile per cell. One slot per cell.
- `Obj_11x11[11][11]` — head-of-chain index per cell. `0` = empty.
- `D_D5DC[256]` — chain-node value (the tile-frame index to draw).
- `D_E5E0[256]` — chain-node next pointer (singly-linked, terminator
  `0`). Initialized as a free-list (`D_E5E0[i] = i + 1`) at the top
  of `ShowObjects` (seg_1184.c:1731-1732); `D_E5E0[0]` is the
  free-list head.

So **up to 255 object-tile slots can be drawn per frame across all
121 cells** (D_D5DC/D_E5E0 are 256 entries with index 0 reserved
as free-list head). When the budget is exhausted, `ShowObject` at
seg_1184.c:1671-1673 silently returns — extra objects don't render.

## Pass 1a: `C_1100_0306()` — populate Tile_11x11 + lighting

Lives at `seg_1100.c:144-310`. Two paths:

- **X-ray vision** (`D_05E8` set, line 151): straight copy
  `Tile_11x11[y][x] = AreaTiles[ViewY+y][ViewX+x]` for all 11×11
  cells, full ambient light, jump straight to `ShowObjects()`.
- **Normal**: clears `AreaFlags`/`AreaLight` for the visible 24×24
  AreaTiles window, walks objects in that window via SearchArea to
  set up wall/window/opaque/foreground flags + light values per
  cell, runs flood-fill visibility (`C_1100_0131`) from the player's
  position with optional night-time light-source secondary flood,
  then fills `Tile_11x11[11][11]` from `AreaTiles[][]` with three
  special cases:
  - `Tile_11x11 = TIL_0FF` (Hidden) if cell isn't flagged visible
  - `Tile_11x11 = TIL_1BC` (Darkness) if light is 0
  - "Hide inside wall" patch: tile types in range `(TERRAIN_FLAG_04|
    TERRAIN_FLAG_02)` (wall + impass) get neighbor-aware variant
    selection via `D_0644[]` lookup table.

### Wall-edge auto-extension (separate from the visual one)

At lines 192-206, `C_1100_0306` propagates opaque/wall flags from
double-V/H tiles to the cell above/left FOR VISIBILITY purposes:

```c
if(IsTileOpa(tile - 1)) {
    if(IsTileDoubleV(tile) && y)
        *(pFlags - AREA_W) |= 0x20;    // opaque flag on cell above
    if(IsTileDoubleH(tile) && x)
        *(pFlags - 1) |= 0x20;          // opaque flag on cell left
}

if(IsTerrainWall(tile)) {
    *pFlags |= 0x08;
    if(IsTileDoubleV(tile) && y)
        *(pFlags - AREA_W) |= 0x08;
    if(IsTileDoubleH(tile) && x)
        *(pFlags - 1) |= 0x08;
}
```

This is for **flood-fill visibility blocking** — the "second half"
of a 2-tall wall blocks visibility from the next cell over too.
**Not the same mechanism as the visual auto-extension below**.

## Pass 1b: `ShowObjects()` — populate Obj_11x11 chains

Lives at `seg_1184.c:1723-1809+`. Per-frame:

1. Reset chain free-list: `D_E5E0[i] = i + 1` for i=0..255
   (line 1731-1732). Then `Obj_11x11[i][j] = 0` for all cells
   (line 1734-1736).
2. `SearchArea(MapX-5, MapY-5, MapX+6, MapY+6)` — sets up the
   iterator's bounds (the 11×11 window plus the bottom-right
   sentinel).
3. Loop `objNum = SearchArea(...); objNum >= 0; objNum = NextArea()`:
   - **Skip rules** (lines 1755-1758): invisible objects (unless
     player-controlled), dragged-under objects.
   - **Special cases**: mirror-frame reflection update (OBJ_07B),
     britannia/gargoyle lens at fixed Singularity-temple coords
     (lines 1782-1808).
   - **Effect overlays** (lines 1768-1775): if invisible → overlay
     newFrame=2, if protected → newFrame=4, if cursed → newFrame=6
     (slot shifts into ObjShapeType's frame high-bits).
   - **Main draw**: `C_1184_35EA(tile, 0, obj_x, obj_y)` for the
     hotspot. If overlay applies, also `C_1184_35EA(tile, newFrame,
     obj_x, obj_y)` first.

### `SearchArea / NextArea` — the iterator

`SearchArea(x1, y1, x2, y2)` (seg_1184.c:369-382):
- Clamps `x1, y1` to ≥ 0
- Sets bounds `D_BDCE[0..3]`
- Sets Z filter to `MapZ` (the current dungeon-level / overworld
  Z)
- Sets iterator state via `C_1184_02FA` (some position-to-Link-node
  lookup): `D_0703 = start node`, `D_0705 = end node`
- Returns `NextArea()`

`NextArea()` (seg_1184.c:345-367):
- Walks `D_0703 = Link[D_0703]` — **forward through Link[]**
- For each node, yields it if: CoordUse == LOCXYZ, X in bounds, Y
  in bounds, Z == MapZ
- Stops at `D_0703 == D_0705` (the end sentinel)

So **iteration order is forward Link[] order = (Y asc, X asc, Z desc)
per the comparator we already documented in `research_world_data.md`**.
Objects in the same cell are contiguous in iteration.

## Pass 1c: `C_1184_35EA(tile, frame, x, y)` — the double-tile dispatcher

Body at `seg_1184.c:1702-1721`:

```c
static C_1184_35EA(int tile, int frame, int x, int y) {
    int bp_02;

    if(x < 11 && y < 11)
        ShowObject(tile + frame, x, y, 0);    /* HOTSPOT */

    bp_02 = TileFlag[tile];
    if(bp_02 & TILE_FLAG1_80) {                /* DoubleH set */
        if(x != 0 && y < 11)
            ShowObject(tile + frame - 1, x - 1, y, 1);    /* LEFT cell, tile-1 */
        if(bp_02 & TILE_FLAG1_40) {            /* + DoubleV (= 2x2 tile) */
            if(x < 11 && y != 0)
                ShowObject(tile + frame - 2, x, y - 1, 1); /* ABOVE cell, tile-2 */
            if(x != 0 && y != 0)
                ShowObject(tile + frame - 3, x - 1, y - 1, 1); /* UPPER-LEFT, tile-3 */
        }
    } else if(x < 11 && y != 0 && (bp_02 & TILE_FLAG1_40)) {  /* DoubleV only */
        ShowObject(tile + frame - 1, x, y - 1, 1);    /* ABOVE cell, tile-1 */
    }
}
```

**This is THE auto-extension mechanism.** For a tile with the
`IsTileDoubleV` flag (bit 0x40), the engine draws **`tile - 1`**
into the cell directly above. For `IsTileDoubleH` (bit 0x80),
**`tile - 1`** into the cell to the left. For both flags set
(2×2 tile), **`tile - 1`, `tile - 2`, `tile - 3`** fill the 3
adjacent cells.

So a U6 pillar is rendered as TWO blits: the **base tile** at the
object's hotspot cell, and **the preceding tileindx entry** as the
"head" in the cell above. Same for doors (DoubleV), wide objects
(DoubleH), and 2×2 buildings (both).

The `bp06=0` parameter to the hotspot's `ShowObject` and `bp06=1`
parameter to each extension are **chain-position controls** — see
ShowObject below.

## Pass 1d: `ShowObject(tile_frame, x, y, bp06)` — chain insertion

Body at `seg_1184.c:1651-1700`. This is where the **layered
Z-ordering** happens within the per-cell Obj_11x11 chain.

### Early returns

- `BaseTile[OBJ_14F] == tile` (Egg tile) → skip entirely (line 1659)
- `Tile_11x11[y][x] == TIL_0FF` (Hidden / fog of war) → skip
- `Tile_11x11[y][x] == TIL_1BC` (Darkness) → skip unless `SpellFx[1]`
  (light spell) is on AND tile is wet

### Background-tile fast path

```c
if(IsTileBa(tile)) {
    Tile_11x11[y][x] = tile_frame;
    return;
}
```

**`IsTileBa` (bit 0x20 of `D_B3EF[tile]`) tiles REPLACE the
background `Tile_11x11[][]` entry directly** — they don't enter the
object chain at all. This is for tiles that ARE the floor/ground
even though they're stored as objects (e.g. wood floors placed as
objects).

### Free-slot allocation

```c
bp_04 = D_E5E0[0];
if(bp_04 == 0)
    return;             /* free-list empty, silently drop */
D_E5E0[0] = D_E5E0[bp_04];
D_D5DC[bp_04] = tile_frame;
```

Pop one slot from the free-list; store the tile-frame in `D_D5DC`.

### THE INSERTION LOGIC (the 3-zone Z-buffer)

```c
si = &(Obj_11x11[y][x]);
if(IsTileFor(tile) || bp06 == 2) {     /* Foreground tile OR forced FG */
    if(bp06 & 1) {                     /* extension (1) or X-ray (3) */
        if(SpellFx[1] && bp06 == 3) {
            /* X-ray: walk past water tiles */
            ...
        } else {
            /* extension: walk to END of chain */
            while(*si)
                si = D_E5E0 + *si;
        }
    } else {
        /* hotspot FG: walk to first existing FG in chain */
        while(*si && !IsTileFor(D_D5DC[*si] & 0x7ff))
            si = D_E5E0 + *si;
    }
}
/* (else fall through with si still = chain head pointer) */

D_E5E0[bp_04] = *si;     /* new node's next = whatever was at insertion point */
*si = bp_04;              /* insertion point now points to new node */
```

**Summary of insertion points for each (tile-fg-status, bp06)
combination:**

| Tile is FG? | bp06 = 0 (hotspot) | bp06 = 1 (extension) | bp06 = 2 (forced FG) | bp06 = 3 (X-ray) |
|---|---|---|---|---|
| **Background tile (`IsTileBa`)** | Replace Tile_11x11 — skips chain | (same — never reaches insertion logic) | (same) | (same) |
| **Non-foreground** | Insert at HEAD | Insert at HEAD | Walk to END, insert | Insert at HEAD |
| **Foreground (`IsTileFor`)** | Walk to first existing FG, insert there | Walk to END, insert | Walk to END, insert | Walk past water, insert |

### What the chain looks like in playback

The blit phase (`C_0A33_09CE` lines 363-369) iterates **forward**
through Obj_11x11 chain, calling `GR_42` per node. **Later in chain
= drawn later = covers earlier draws** (painter's algorithm).

So the chain has effectively three Z-zones:

1. **Front of chain** (drawn first, gets covered): non-foreground
   hotspot tiles, non-foreground extensions. These are "low priority"
   draws — they fill in but get overwritten by foreground items.
2. **Middle of chain**: foreground hotspots (each inserted before
   the existing foreground block). When several foreground hotspots
   arrive in iteration, they end up in iteration-reverse order
   inside the foreground block (each new one inserted in front of
   the existing ones).
3. **End of chain** (drawn last, covers everything): foreground
   extensions (`bp06=1` + `IsTileFor`) and forced-foreground
   (`bp06=2`) inserts always go to the tail.

**The key consequence for the pillar bug**: pillar HEAD extensions
(`bp06=1`, presumed `IsTileFor`-set) draw at the END of the chain —
they cover everything else in their cell. If the legacy port
implements the same end-of-chain insertion for extensions, the
pillar head should always be on top of whatever else lands at
(x, y-1). If the legacy port appends in iteration order without
the FG-aware re-positioning, an extension hotspot encountered
earlier could be covered by a regular tile encountered later.

## Pass 2: `C_0A33_09CE(bp06)` — render to screen

Body at `seg_0A33.c:350-434`. Top-level structure:

```c
GR_06(D_2A50);    /* set foreground color */
for(j = 0; j < 11; j++) {
    for(i = 0; i < 11; i++) {
        scr_x = TIL2SCR(i);    /* i * 16 */
        scr_y = TIL2SCR(j);
        ServeMouse;
        GR_42(Tile_11x11[j][i], scr_x, scr_y);  /* background */
        bp_0a = Obj_11x11[j][i];
        while(bp_0a) {                          /* walk chain forward */
            bp_04 = D_D5DC[bp_0a];
            GR_42(bp_04, scr_x, scr_y);          /* draw next tile in chain */
            if(BaseTile[OBJ_09F] == (bp_04 & 0x7ff))
                C_0A33_0931(scr_x, scr_y);       /* clock hands special case */
            bp_0a = D_E5E0[bp_0a];
        }
    }
}
```

Then storm-cloak negation (random pixels), select-cursor (TIL_16C
/ TIL_16D at AimX×16 / AimY×16), viewport frame border (TIL_1B0-
TIL_1B7 at 4 corners + 4 edges at y=0/160 and x=0/160), mouse
shadow blit if MouseOn, and finally `GR_45(8, 8, 167, 167, 8, 8)`
to flush the off-screen `D_9E3D` buffer to the on-screen Screen
(or `GR_48` if ScreenFade is set, for a fade-in transition).

The 8-pixel offset on both axes is the viewport frame border
thickness (`TIL_1B0` corner is 8×8 pixels, hence the 8-pixel inset).
The flush is only on-screen when `bp06 == 1` — when `bp06 == 0`,
the render goes to off-screen only (used by spells / overlays that
want to compose into the back buffer without flushing).

## Implications for the pillar bug

### Hypothesis B (auto-extension fabricated by our port): **FALSIFIED**

The engine does auto-extension exactly as described in the
pillar-bug investigation note. `C_1184_35EA` reads `IsTileDoubleV`
on the hotspot tile and emits `ShowObject(tile - 1, x, y - 1, 1)`
for the cell above. This is the source-faithful mechanism. The
legacy port doing the same thing is **not a fabrication**.

The note's H2 finding that "skipping #276 makes pillar tops
appear" doesn't falsify B — it just means tile #276 is on top of
the pillar head in the chain at (x, y-1). The question becomes how
the chain is ordered.

### "Top item first / reverse iteration" recollection: **PARTIALLY RECONCILED**

The recollection now lines up with source like this:

- Source's `SearchArea/NextArea` iterates **forward** through
  Link[] (sorted Y asc, X asc, Z desc).
- Source's `C_0A33_09CE` blits **forward** through Obj_11x11 chain
  (painter's algorithm — tail covers head).
- The `Obj_11x11` chain ordering is determined by `ShowObject`'s
  insertion logic, NOT just by iteration order. **Each call may
  insert at HEAD, MIDDLE, or END depending on (tile-fg, bp06)**.
- For pillar-style objects (DoubleV + presumed foreground tile),
  the HEAD extension lands at the END of `Obj_11x11[y-1][x]` chain
  every time, so the head should ALWAYS be on top of normally-
  inserted foregrounds at that cell.

So **source-faithful iteration is forward**, NOT reverse. The
"reverse iteration" intuition in the recollection seems to confuse
"OBJBLK on-disk order" with "rendering order." After deserialize,
Link[] is sorted by the comparator, and rendering uses the FG-aware
chain insertion to layer things — neither of which is "reverse."

### Hypotheses A and C: **NEED LEGACY-PORT COMPARISON**

The remaining question is: does `ultima6/map_viewer.js` /
`map_viewer_renderer.js` implement the same FG-aware chain
insertion as source's `ShowObject`?

If yes → the pillar head should always cover whatever else lands
at (x, y-1) → hypothesis A becomes "tile #276 has transparency we
should respect, but we render it opaque" (or C: "Zane is
misremembering — pillar tops were never visible in the original
either").

If no → port's append-in-order ordering means encounter-order
beats source's FG-layering → the pillar head can be covered if
SearchArea visits the pillar first and the "obscuring" object
second.

**Next action**: read `ultima6/map_viewer.js` `drawObject` and
`ultima6/map_viewer_renderer.js` to compare. After that, the
pillar bug A vs C is resolvable.

## Layer mechanism vs the legacy port's "4-layer shader"

From the prior pillar-bug investigation note, the legacy port has a
4-layer shader: 0=ground, 1=lower objects, 2=actors, 3=top objects.
H1 in that note was about per-sub-tile `isTopTile()` flag layering.

Source has a different layering model: **one off-screen buffer, one
per-cell chain, with insertion-position controlling Z order within
the chain.** There's no per-layer shader pass — it's all one render
pass with the chain insertion serving as the Z-control.

This is a meaningful architectural divergence between source and
the legacy port. The legacy port chose a multi-pass model for
WebGL convenience; source uses a single-pass model with a 256-slot
shared chain pool. Whether the legacy port faithfully ports the
chain-insertion semantics WITHIN its layer system is the question
that remains.

## Pillar bug — root cause resolution

Reading the legacy port's `map_viewer.js:270-404`, `obj_manager.js`,
and `map_viewer_renderer.js` reveals the divergence from source.

### Legacy port's render model — 4-layer WebGL shader

`map_viewer.js:347-403` builds 4 WebGL VAO layers in fixed render
order:

- **Layer 0** — ground tiles (background, drawn first)
- **Layer 1** — lower objects (force-lower + non-top)
- **Layer 2** — actors
- **Layer 3** — top objects (drawn last, covers all)

Per-layer construction iterates `objects` array:

```js
for (let i = objects.length - 1; i >= 0; i--) {     // REVERSE iteration
    const obj = objects[i];
    drawObject(obj, false, false);    // for Layer 1
}
// ...
for (const actor of actors) {
    drawObject(actor, false, false);   // for Layer 2
}
// ...
for (let i = objects.length - 1; i >= 0; i--) {     // REVERSE iteration
    const obj = objects[i];
    drawObject(obj, false, true);     // for Layer 3
}
```

(Reverse iteration of `objects` is presumably to compensate for
something — but since the bug is about *layer assignment*, not
within-layer order, reverse iteration isn't the load-bearing
divergence here.)

### `drawObject(obj, forceLower, topTile)` — the bug site

`map_viewer.js:299-335`:

```js
const drawObject = function(obj, forceLower, topTile) {
    const tileInfo = obj.tile_info.info;
    if (!forceLower && tileInfo.isForceLowerTile() && !topTile) return;
    if (forceLower && !tileInfo.isForceLowerTile()) return;

    const baseTileIndex = obj.tile_info.tileIndex;
    let tileFlag = obj.tile_info.info;
    // ...

    // *** THE BUG: layer check uses BASE tile's flag only ***
    if (tileFlag.isTopTile() !== topTile)
        return;

    drawTile(baseTileIndex, ox, oy);    // hotspot

    let next = 1;
    if (tileFlag?.isDoubleWidth()) {
      drawTile(baseTileIndex - next++, ox-1, oy);    // ← extension, inherits BASE layer
    }
    if (tileFlag?.isDoubleHeight()) {
      drawTile(baseTileIndex - next++, ox, oy-1);    // ← extension, inherits BASE layer
    }
    if (tileFlag?.isDoubleWidth() && tileFlag?.isDoubleHeight()) {
      drawTile(baseTileIndex - next++, ox-1, oy-1);  // ← extension, inherits BASE layer
    }
}
```

The check `tileFlag.isTopTile() !== topTile` reads the **base tile's**
flag only. Once that check passes, ALL extension tiles get appended
to whatever layer is currently being built — regardless of each
extension's own `isTopTile()` flag.

### Flag definitions match source bit-for-bit

`obj_manager.js:109-114`:

```js
isTopTile()         { return (this.flags2 & 0x10) !== 0; }   // = IsTileFor   (bit 0x10)
isDoubleHeight()    { return (this.flags2 & 0x40) !== 0; }   // = IsTileDoubleV (bit 0x40)
isDoubleWidth()     { return (this.flags2 & 0x80) !== 0; }   // = IsTileDoubleH (bit 0x80)
isForceLowerTile()  { return (this.flags3 & 0x04) !== 0; }   // = IsTileBr     (bit 0x04 of flags2 table)
```

`flags2` = `TileFlag[]` in source; `flags3` = `D_B3EF[]`. The bit
positions match u6.h:209-216 exactly. **The flag interpretation is
not the bug** — the bug is in how the flag is *used*. (Note: the
legacy port's V/H naming is correct, matching the macros — not the
swapped comments in u6.h.)

### What source does differently

Source's `C_1184_35EA` (the dispatcher) emits a `ShowObject(...)`
call **per tile** — one for the hotspot, one per extension. Inside
`ShowObject`, the **extension's own** `IsTileFor` flag determines
which "Z zone" of the per-cell chain it lands in:

| Source rule | Legacy port equivalent |
|---|---|
| Foreground EXTENSION (bp06=1, IsTileFor) → walk to chain END → drawn LAST in its cell | Extension goes to whichever layer the BASE was assigned to — **regardless of extension's own flag** |
| Non-foreground extension → insert at chain HEAD | (same — no flag check on extension) |
| Foreground hotspot → insert before existing FGs | Goes to Layer 3 IF base is topTile |

The architectural difference: **source has per-tile flag-driven
Z-ordering within a cell; legacy has per-object flag-driven layer
selection for the whole object including extensions.**

### Worked example: pillar at Lycaeum

> **Correction (I-2c source verification).** The flag specifics in this subsection
> predate reading `ShowObject` against real data and are partly wrong: the Lycaeum
> pillar is `OBJ_144` **frame 3 = tile 1191, a 2×2** (`IsTileDoubleH`+`IsTileDoubleV`),
> and **Steps are NOT foreground** — `IsTileFor=false`; the platform-edge Steps frame
> (tile 949) is **`IsTileBa` (Background)**, which replaces terrain. The bug *diagnosis*
> below (legacy routes an object's extensions by the BASE tile's flag) still holds, but
> for the verified flags + the full ordering rule see **"Painter's algorithm"** below.

Pillar object at world (x, y). Object number = `OBJ_144` (`obj.h:674`).

- **Base tile** `T_b`: `isDoubleHeight = true`, `isTopTile = false`.
  (The pillar base is the foundation; standing on the ground, it's
  not a "draw on top" tile.)
- **Head tile** `T_b - 1`: `isTopTile = true`. (The head is the
  tall part that should appear above any neighboring object.)

Object #276 = decimal 276 = 0x114 = **OBJ_114 "Steps"** (obj.h:580:
`/*276 - Steps*/ #define OBJ_114 0x114`). At the Lycaeum perimeter,
Steps lead up from the lower terrain to the columned platform.

- Steps' base tile: `isTopTile = true`.

The collision: Steps placed at (x, y-1) (the cell above the pillar
base, which is also where the pillar head extension lands).

**Source pipeline at cell (x, y-1)**:

1. SearchArea iterates Link[] forward, encounters both the pillar
   (at (x, y)) and Steps (at (x, y-1)).
2. Pillar processed first or second, doesn't matter:
   `C_1184_35EA(T_b, 0, x, y)` →
   - `ShowObject(T_b, x, y, 0)` — non-FG hotspot → HEAD of (x,y)
   - `ShowObject(T_b-1, x, y-1, 1)` — **FG extension → walk to END of (x, y-1) chain**
3. Steps processed: `C_1184_35EA(Steps_tile, 0, x, y-1)` →
   - `ShowObject(Steps_tile, x, y-1, 0)` — FG hotspot → walks to
     first FG, **inserts BEFORE it**.

If Steps come first in iteration, the chain at (x, y-1) ends up
`[Steps, PillarHead]` (PillarHead appended later, at chain end).
If Pillar comes first, the chain ends up `[PillarHead]` initially,
then Steps walks to first FG (PillarHead at head) and inserts
BEFORE it → `[Steps, PillarHead]`. **Same end result either way.**

Forward blit → `Steps` drawn first, `PillarHead` drawn last →
**pillar head visible on top of Steps**. ✓

**Legacy port pipeline**:

1. Layer 1 pass: `drawObject(pillar, false, false)` — pillar base's
   `isTopTile()` is `false`, check `false !== false` is `false` →
   proceed. Draws pillar BASE at (x, y) into Layer 1, AND pillar
   HEAD (extension) at (x, y-1) into Layer 1.
2. Layer 1 pass: `drawObject(steps, false, false)` — Steps' base's
   `isTopTile()` is `true`, check `true !== false` is `true` →
   RETURN. Steps not in Layer 1.
3. Layer 3 pass: `drawObject(pillar, false, true)` — `false !== true`
   is `true` → RETURN. Pillar entirely skipped.
4. Layer 3 pass: `drawObject(steps, false, true)` — `true !== true`
   is `false` → proceed. Draws Steps base at (x, y-1) into Layer 3.

Render order: Layer 0 → Layer 1 (pillar head at (x, y-1)) → Layer 2
→ Layer 3 (Steps at (x, y-1)) → **Steps drawn AFTER pillar head →
covers it**. ✗

That's the bug.

### Hypothesis status

- **B (auto-extension fabricated by port)**: **FALSIFIED** (already
  shown above — source does the same auto-extension via
  `tile - 1 / -2 / -3`).
- **A (tile #276 should be transparent)**: **FALSIFIED**. Tile
  transparency isn't the issue — the bug is in layer routing, not
  pixel alpha.
- **C (not a bug — Zane is misremembering)**: **FALSIFIED**. There
  IS a bug — pillar tops should be visible per source, but aren't
  per legacy.
- **NEW hypothesis D — Layer assignment for extension tiles**:
  **CONFIRMED**. The legacy port's `drawObject` checks only the
  base tile's `isTopTile()` flag for layer routing. Extensions
  (DoubleH / DoubleV / 2×2) inherit the base's layer, even when
  the extension tile's own flag indicates it should be in a
  different layer. For tall objects like pillars where the BASE
  is not a top-tile but the HEAD is, the head ends up in Layer 1
  and gets covered by Layer 3 top-tile objects (like Steps) that
  land in the same cell.

### Minimal fix

In `drawObject`, before each `drawTile(tileIndex, x, y)` call,
look up THAT tile's own `isTopTile()` flag (not the base's), and
only emit if it matches the current layer being built.

Sketch (untested — for design purposes only, NOT for landing as
code in this research-phase doc):

```js
const drawTileForLayer = (tileIndex, tx, ty, topTileLayer) => {
    const info = ObjManager.getTileInfo(tileIndex);
    if (info.isTopTile() !== topTileLayer) return;
    drawTile(tileIndex, tx, ty);
};

// In drawObject(), replace each drawTile call:
drawTileForLayer(baseTileIndex,       ox,    oy,    topTile);
if (tileFlag?.isDoubleWidth())  drawTileForLayer(baseTileIndex - next++, ox-1, oy,   topTile);
if (tileFlag?.isDoubleHeight()) drawTileForLayer(baseTileIndex - next++, ox,   oy-1, topTile);
if (tileFlag?.isDoubleWidth() && tileFlag?.isDoubleHeight())
    drawTileForLayer(baseTileIndex - next++, ox-1, oy-1, topTile);

// And remove the early-return-on-base-flag check.
```

After this, each tile (hotspot + each extension) independently
decides which layer it belongs in. Pillar BASE goes to Layer 1,
pillar HEAD goes to Layer 3 (because the head's tile flag has
`isTopTile=true`). Layer 3 renders last → pillar head on top of
everything. Bug resolved.

### Bigger-picture observation

The legacy port's 4-layer model is a **coarse approximation** of
source's per-cell chain insertion. It approximates correctly when
all of an object's tiles share the same layer membership — but it
mis-renders objects where extensions and hotspots have different
"natural" layers. Pillars (foundation + decorative head) are the
canonical example. Other DoubleV/DoubleH tall/wide objects with
mixed-flag tiles likely exhibit similar bugs that haven't been
spotted yet because they're visually less obvious or the
covering object isn't in the right spot to make the issue visible.

A more thorough fix would re-architect the legacy port's render
to match source's per-cell chain insertion. The 4-layer shader
keeps the WebGL convenience but loses per-cell Z-ordering
granularity.

For the educational-port goal (per `user_retro_port_goal` memory),
the minimal fix above is probably sufficient. The architectural
refactor belongs in the `ultima6_clone/` rebuild, not in legacy.

## Painter's algorithm — source chain vs. clone zones (implemented I-2c)

The within-cell Z-order. Source uses a per-cell linked chain; the clone uses an
equivalent zone-bucketed pass. Flags below are the source-verified mapping (named to
match source in `assets/tile_flags.js`): `isForeground` = `IsTileFor`, `isBackground`
= `IsTileBa`, `isDoubleHeight/Width` = `IsTileDoubleV/H`. (Note `IsTileBr`
"Breakthrough" — the legacy port's misnamed `isForceLowerTile` — is an AI/movement
flag, NOT a render flag; it plays no part here.)

### Source — per-cell linked chain (`ShowObject`, seg_1184.c:1651)

`C_1184_35EA` (seg_1184.c:1702) emits one `ShowObject` per tile: the hotspot
(`bp06=0`), then double-tile extensions (`bp06=1`) at `(x-1,y)` / `(x,y-1)` /
`(x-1,y-1)` for `IsTileDoubleH` / `+IsTileDoubleV` / 2×2. Each call routes its tile by
that tile's OWN flags:

| Tile's own flag | Placement in cell (x,y) |
|---|---|
| **`IsTileBa`** (Background) | **replaces the terrain tile** (`Tile_11x11[y][x]=tile`) and returns — never enters the chain → bottom |
| non-FG (not `IsTileFor`) | inserted at chain **HEAD** |
| `IsTileFor` **hotspot** (`bp06=0`) | walk past non-FGs, insert **before the first FG** |
| `IsTileFor` **extension** (`bp06=1`) | walk to chain **END** → top |

Pass 2 (`C_0A33_09CE`) blits cells in scan order; per cell it draws the background
tile then the chain forward (head→tail = bottom→top). Within-cell order, bottom→top:
**background → non-FG → FG-hotspot → FG-extension.**

### Clone — zone-bucketed painter's pass (`WorldRenderSystem`)

Walks the visible cells via the `SpatialIndex`, expands each object's double-tiles,
and routes each tile by its own flag into one of four ordered render layers (above the
two terrain layers):

| layer | zone | flag |
|---|---|---|
| 2 | background | `isBackground` |
| 3 | normal | neither |
| 4 | foreground hotspot | `isForeground`, own cell |
| 5 | foreground extension | `isForeground`, a double-tile extension |

**Why zones == the chain here:** U6 tiles are exactly one cell, so tiles in *different*
cells never share pixels — Z-order only matters *within* a cell, and the four zones
give exactly `ShowObject`'s cross-zone order.

**Within a zone, three keys combine to decide the view.** When multiple objects share a
cell *and* a zone (e.g. an NPC standing on a carpet — both "normal"; a candle on a
table — both "normal"; a broken lens under an altar's 2×2 extension — both "normal"),
no flag separates them. `WorldRenderSystem` **gathers per-cell contributions** then
sorts before emit, using a **type-priority** (NPC over object, same cell), the
contributing object's **anchor `(Y,X)` order** (a double-tile extension reaching in
draws under an object anchored AT the cell — source's position-sorted visit order),
and **reverse iteration** as the same-anchor tie-break:

1. For each visible cell `(col, row)`, scan the 4 anchor candidates whose 2×2 footprint
   could cover it — `(col, row)`, `(col+1, row)`, `(col, row+1)`, `(col+1, row+1)`.
2. For each anchor's entity array, iterate **in REVERSE** (`for k = ents.length-1; k >=
   0; k--`). This is the same-anchor tie-break for same-priority objects (see
   "Within-tier order" below).
3. For each entity, ask `forEachOccupiedCell` whether it contributes a tile *at this
   exact cell* (catching extensions from neighbors). Collect `{tile, zPri, isExt, ay,
   ax}` per contribution, where `(ay, ax) = (row+dy, col+dx)` is the contributing
   object's anchor cell.
4. Compute `zPri`: **`Actor` entities = 1, everything else = 0**.
5. **Stable** sort by **`(zPri` ascending, then anchor `(Y,X)` descending`)`**, then
   emit to the zone lists. Actors end up last within zone = drawn last = on top of
   floor objects; among equal-priority objects the one with the **lower `(Y,X)`** anchor
   sorts last = on top (source's visit order — see "Within-tier order"). The stable
   sort leaves same-`(zPri,Y,X)` ties in their reverse-iteration order.

### Within-tier order — same-zone same-priority objects

When two objects share a cell and a zone with equal `zPri`, source orders them by
**object position**: `ShowObjects` (seg_1184.c:1723) walks the **position-sorted
`Link[]` chain** — `C_1184_02FA` (seg_1184.c:139) keeps it ordered by increasing **Y,
then X** (the break tests at `:162-166`/`:194-201`) — and inserts each non-FG tile at
the chain **HEAD** (seg_1184.c:1698-1699); the blit walks head→tail (head = bottom,
`C_0A33_09CE` seg_0A33.c:363-369). So the **lowest-`(Y,X)` object is visited first →
ends at the chain tail → drawn last → on top.** Two sub-cases:

**Cross-anchor (different `(Y,X)`) — a 2×2 extension reaching into the cell.** A
double-tile object's extension cells are always to the **W / N / NW of its anchor** (the
anchor is the SE corner, see `tile_footprint.js`), so a reaching-in object always has a
**higher `(Y,X)`** than an object anchored AT the cell — and so draws UNDER it. The
clone reproduces this with the **anchor-`(Y,X)` descending secondary sort key** (step 5
above): lower `(Y,X)` sorts last = on top.
*Canonical repro:* the **broken lens** at (124,194,z5) under an **altar** anchored at
(125,195) — the altar's 2×2 NW quadrant (frame-3 tile `0x4b7`, both Double flags) lands
on the lens cell, but the lens's lower Y wins and draws on top, matching source. (Before
the `(Y,X)` key, the fixed gather scan emitted the own-cell anchor first = bottom, so
the reaching-in altar wrongly *covered* the lens — the object-vs-object analog of the
LB-throne bug in "NPC-vs-object" below, which `zPri` alone couldn't fix because neither
object is an Actor.)

**Same-anchor (same `(Y,X)`) — two objects in the same cell** (candle on a table).
Position can't separate them; source tiebreaks by chain-insertion order. The clone
gathers each anchor's `spatial.at` array **in REVERSE** so the older entry (chain head)
emits last = drawn last = on top, and the stable sort preserves that order (the `(Y,X)`
key ties). This matches source's HEAD-insert "first-inserted (= older) ends at the tail
= on top." Combined with `spatial.at`'s ordering convention
([`research_world_data.md`](research_world_data.md) §"Clone correspondence — SpatialIndex
API"): `spatial.at[0]` is always the chain head — initial-load uses `insert(push)` so
file-order is preserved, runtime uses `insertAtHead(unshift)` so the newest arrival is
at idx 0. Either way, reverse-iter visits the OLDEST entries last, drawing them on top.

This produces the source-faithful visual for the known stacks:

| Cell | objects | Visual top | Picked by inspector |
|---|---|---|---|
| (300, 378) candle + table | same anchor `[candle, table]` | candle | candle |
| (293, 376) door + doorway | same anchor `[door, doorway]` | door | door |
| (124, 194, z5) broken lens + altar | cross-anchor (altar anchored (125,195)) | broken lens | broken lens |

For the same-anchor cases, the inspector and renderer read the same chain-rule from
opposite ends — inspector walks forward through `spatial.at` (first = chain head =
source's `FindLoc` pick); renderer walks reverse (oldest emits last = drawn last = on
top). Both arrive at the same chain entry being the "player-visible" thing. See
[`research_object_interaction.md`](research_object_interaction.md)
§"Cell-pick (`C_2337_08F1`)" for the pick side.

### Toroidal wrap — the object query must wrap, like terrain (fixed 2026-06-13)

The map is a torus: standing near an edge, the view shows the opposite edge across the
seam. **Terrain** handles this — `MapLevel.tileAt` does `% width` (1024 overworld / 256
dungeon) so the wrapped terrain draws. **Objects** did NOT: the per-cell painter scans
screen-logical cells `(col, row)` that, past the seam, EXCEED the map width, and
`spatial.at(col, row)` then keyed an out-of-range / wrong cell → edge objects vanished
when viewed across the seam. (Latent since I-2c; on the 1024-wide overworld the seam is
far from explored areas, so it only surfaced with I-19's **256-wide dungeons**, where the
seam is a few tiles away — Zane spotted it walking a dungeon. The legacy `../ultima6`
port wraps objects too: `collectObjectsInSurface/Dungeon` test each object's visibility
against the view with an `ox + 1024` / `ox + 256` offset.)

**Fix:** wrap ONLY the spatial-query coordinate to the active level's width —
`spatial.at((col+dx) % wrap, (row+dy) % wrap)` (`world_render_system.js`). The
`forEachOccupiedCell` **anchor** (`col+dx`) and the **screen-draw position** (`col-tileX`)
stay UN-wrapped: a single tile's hotspot at screen-logical `col` maps to world `col%wrap`
for the lookup but draws at `col-tileX`; a 2×2 object straddling the seam has its hotspot
and extension land on **adjacent** screen cells (`col`, `col-1`) that wrap to world
`0`/`width-1` — correct. **The same query wrap is in `cell_pick` and `passability`** (so
USE / LOOK / movement also see edge objects across the seam). `wrap = activeZ===0 ? 1024 :
256`. Note the `SpatialIndex` key width stays **1024** regardless — wrapping brings coords
into `[0, width)` which is always within the 1024-wide key space, so the key still matches.

### NPC-vs-object — type priority overrides

When the cell has an NPC + objects (e.g. Lord British on a throne whose 2-wide
extension reaches LB's cell), the `zPri` sort kicks in: NPCs (priority 1) emit last
within the zone, drawing on top of the throne extension. This is the source-faithful
"NPC on top of furniture" outcome — source achieves it via `ShowObjects`
(seg_1184.c:1723) walking the sorted `Link[]` and inserting non-FG tiles at the chain
HEAD, so NPCs (slots `0x00–0xFF`, processed first) end up at the chain TAIL and (blit
head→tail) draw last. Our type-based sort produces the same end state without coupling
Z-order to load order.

The Lord British / throne case was the canonical repro: throne (`isDoubleWidth =
true`) anchored at (308, 348), extension tile 1202 at (307, 348), LB at (307, 348); a
naive "iterate the cell's entities reverse" loop only saw LB's own cell, so the
neighbor's extension reaching back IN got emitted while processing the neighbor's
anchor cell — *after* LB — and within the same zone drew on top. Gather-then-sort
collects both the anchor-at-cell AND extension-into-cell contributions uniformly per
cell so the `zPri` sort decides correctly. (The **object-vs-object** version of this
same reaching-in bug — two non-Actors, so `zPri` ties — is decided instead by the
anchor-`(Y,X)` key; see "Within-tier order" and the broken-lens/altar repro.)

(Naming: throne is `isDoubleWidth` in the port = `IsTileDoubleH` in source. Our port
uses shape-naming (`isDoubleWidth` = 2-wide, `isDoubleHeight` = 2-tall); source uses
extension-direction naming (`DoubleH` = horizontal-extension = 2-wide, `DoubleV` =
vertical-extension = 2-tall). Same flag bits in `TileFlag[]`.)

### Why type-based, not entity-index-based, sort

An earlier version sorted by entity index descending (low indices = NPCs loaded first
= drawn on top). That works while entity indices reflect load order, but
`World.create()` reuses freed slots via `freeStack` — once the object-interaction
phase destroys and respawns entities, a new object can inherit a low-indexed slot and
incorrectly draw above an NPC at the same cell. The type-based rule decouples Z-order
from slot identity. Source's chain encodes ordering incrementally on each `ShowObject`
call; we encode it via per-cell sort.

### Known limitation, deferred — multi-fgExt source-faithful ordering

Source's `ShowObject` foreground-branch inserts fgExt tiles at the chain TAIL (the
`while(*si) si = D_E5E0 + *si;` walk-to-end), so a newer-inserted (higher-`(Y,X)`) fgExt
covers an older one in the same cell — the *opposite* of normal/fgHot's HEAD insertion.
The clone applies ONE direction to every zone (the anchor-`(Y,X)` key + reverse-iter =
lower-`(Y,X)`/older on top), which is source-faithful for the head-insert zones
(normal, fgHot) but inverted for fgExt; so multi-fgExt-per-cell (two adjacent foreground
multi-tile objects whose extensions share a cell) would render with the wrong
within-zone order. (`bg` has the same inverted-direction caveat — source's `IsTileBa`
terrain-overwrite is last-write-wins = higher-`(Y,X)` on top.) Single-fgExt/bg-per-cell
is direction-independent, and multiples are rare in u6 data; revisit if observed.

### Two worked cases (verified on real data, region `objblkhg` = the Lycaeum)

- **Pillar over steps** — pillar `OBJ_144` frame 3 = tile 1191 (2×2, base
  `IsTileFor=false`); its upper-left extension tile 1188 has `IsTileFor=true` →
  FG-extension → top. A neighbouring Steps tile in the same cell is non-FG → lower.
  Head on top. ✓
- **Carpet over platform-edge steps** — at (922–924, 862) a carpet (obj 303 → normal)
  shares a cell with a Steps tile (obj 276, tile 949, **`IsTileBa`**). Background steps
  replace terrain (bottom); carpet draws above. ✓ (The 2-zone model that only checked
  `isForeground` ignored `IsTileBa`, so the steps wrongly covered the carpet.)

## Lighting + visibility model

The decode that backs Pass 1a's brief "compute AreaFlags / AreaLight"
hint. Sized for the rebuild to plan day/night honestly: **`D_2C55`
is the SUN STRENGTH at the player's feet, NOT a render-side ambient
knob**, so a "shader-uniform tint by `D_2C55`" port would diverge
visibly (no torches casting local light, no walls blocking sun, no
dungeon model).

### Storage — two 40×40 byte maps

The composite operates on a 40×40 area centred on the player
(`AREA_W = AREA_H = 40` per `BSS.ASM:96`; viewport sits at offset
`(ViewX, ViewY) = (12, 12)`, 11×11 wide, per `seg_1100.c:11`):

- `AreaFlags[40][40]` (`u6.h` alongside `AreaLight`) — per-cell
  bitfield: `0x80` visible, `0x40` visited-by-BFS, `0x20` opaque,
  `0x10` window, `0x08` wall (terrain), `0x04` background
  (`IsTileBa`), bits `0x03` = light-source intensity 0..3.
- `AreaLight[40][40]` (`u6.h:502`) — per-cell computed light, 0..N
  additive then clamped. 0 = darkness, ≥ 4 = full bright.

`D_2C55` (`D_2C4A.c:18`, init 7, comment "AmbiantLight?") is the
single byte that survives across composites — the sun-strength fed
as the flood-fill `dist` argument.

### Per-composite pipeline (`C_1100_0306`, `seg_1100.c:144-310`)

1. **Zero the active region** (lines 166-173):
   `AreaFlags[8..31][8..31] = 0`, `AreaLight[8..31][8..31] = 0`. The
   16-cell border around the 11×11 viewport is the BFS work area.

2. **Walk every object in the active area via `SearchArea`** (lines
   176-213). For each tile, OR flag bits into `AreaFlags`:
   - `IsTileWin` → `0x10`
   - `IsTileOpa` → `0x20` (plus propagation to extension cell for
     `IsTileDoubleV/H`, lines 192-198 — already covered under
     "Wall-edge auto-extension" above)
   - `IsTileBa` → `0x04`
   - `IsTerrainWall` → `0x08` (plus the same V/H propagation)
   - `GetTileLight(tile)` → write `max(existing, new)` into bits
     `0x03` (a torch on a cell that already had a candle stays at the
     torch's intensity).

3. **Sun flood-fill from the player** (line 215):
   `C_1100_0131(ViewX + 5, ViewY + 5, D_2C55, 1)`. BFS from the
   player's cell (centre of the 11×11 viewport) with strength
   `D_2C55`, bounds-clipped to the viewport (`bp06 == 1` clip at
   lines 128-133). Sets the `0x80` visible bit AND adds light. Per
   visited cell:
   `light = clamp(4 - D_05EA[|dx|][|dy|] + dist, 0, 4)`
   where `D_05EA` (lines 15-24) is an 8×8 chess-distance falloff
   table. With `dist = 7` (full day), most viewport cells clamp to
   4 = full bright.

4. **Light-source flood-fills** (lines 218-239, ONLY if `D_2C55 < 7`):
   for each cell with `AreaFlags & 0x03` AND `AreaFlags & 0x80` (a
   torch/lamp on an already-visible cell), clear `0x40` (visited) in a
   7×7 region around it, then
   `C_1100_0131(x, y, (flags & 0x03) - 4, 0)`. The `bp06 == 0` arg
   means don't set visibility (light without revealing); radius is
   bounded by `D_05EA <= dist + 3` (lines 136-138). Intensity-3 torch
   fills with `dist = -1`, reaching only ~3-4 cells.

5. **Per-cell tile pick** (lines 242-300): fill `Tile_11x11[][]` from
   `AreaTiles[][]` with three special cases:
   - `(flags & 0x80) == 0` → `TIL_0FF` (Hidden — fog of war for
     never-seen cells).
   - `AreaLight[][] == 0` → `TIL_1BC` (Darkness — solid dark tile).
   - Otherwise the real tile (plus the "hide inside wall"
     neighbor-aware variant for wall-impass terrain, lines 256-296).

### The obscurity overlay (`seg_1184.c:1829-1833`)

A SECOND lighting pass runs inside `ShowObjects` (Pass 1b),
iterating the same 11×11 viewport cells:

```c
light = AreaLight[j + ViewY][i + ViewX];
if(light < 4 && light > 0) {
    tile = TIL_1BC + light;
    ShowObject(tile, i, j, 3);
}
```

`TIL_1BC` is the darkness tile (light=0); `TIL_1BC + 1..3` are
obscurity-graded variants. Partly-lit cells (light 1..3) get an
overlay tile inserted into their cell's chain via `bp06 == 3` (the
X-ray-equivalent insertion point). This is what produces the visible
dusk / dawn / torch-edge gradient instead of a hard cutoff.

### So `D_2C55` is not the "ambient light" itself

`D_2C55` is the **byte the time-advance writes** (`seg_0A33.c:918-931`)
and the **byte the sun flood-fill reads** (`seg_1100.c:215`).
Everything else — what's visible, how dark, where torches reach —
falls out of the flood-fill model. Concretely:

- A "tint the screen by `D_2C55`" port would render full-day at
  strength 7 and uniformly dim the screen as it drops — but it would
  miss torches (which only locally brighten via the secondary flood),
  walls (which block both fills via `0x20` opacity), windows (which
  let light through differently), and the dungeon model (always
  `D_2C55 = 0`, relying entirely on torch flood-fills for visibility).
- A faithful port needs `AreaFlags[][]`, `AreaLight[][]`,
  `C_1100_0131`, the per-cell tile substitution (`TIL_0FF` /
  `TIL_1BC`), and the obscurity-overlay pass. Inputs it needs that
  the rebuild doesn't have yet at I-2: a player-position source
  (avatar from I-6), a richer tile-flag decode (`IsTileWin`,
  `IsTileOpa`, `GetTileLight`), and a render path that can substitute
  a tile and overlay a dim tile per cell.

### Implications for the rebuild

Defer the lighting model to its own step, **after I-6** (avatar =
flood-fill source exists). At I-3 the `WorldClock` stores `D_2C55`
(computed per `seg_0A33.c:918-931`) but nothing reads it yet; the
visible day/night transition lands when the lighting step does.

The modern wide drag-scrollable view also re-opens an architectural
question source didn't face: source bounds the flood-fill to the
11×11 viewport (`bp06 == 1` clipping in `C_1100_0131`); the modern
view needs either a wider flood region recomputed on camera move, or
a different lighting model that doesn't depend on viewport-clipped
BFS. That's a design call for the lighting step's pre-impl research.

## Open targets for the next research pass

The pillar bug is now resolved (see "Pillar bug — root cause
resolution" above). Remaining items for broader render research,
in case they come up later:

1. **Per-frame timing**: when does the game loop trigger
   `C_0A33_09CE`? Tied to input ticks, NPC schedule ticks, or
   uncapped per-frame? Read `C_0A33_1CB4` (game loop) body to
   confirm.
2. **Animation overlay timing**: `animdata`-driven tile-pointer
   rewrites in `C_0A33_0073` — what's the frame rate, and how
   does the legacy port's `AnimDataManager` compare?
3. **Special-cases in `ShowObjects`** (mirror reflection, lens
   placement, storm cloak, eruption) — minor compared to the
   main render flow, but they'll be edge cases to handle in the
   rebuild.
