# Fix: `u6_walkable` over-blocked open floor (Link mis-read as a per-cell stack)

Live-verification of the `dosbox-u6` tools (2026-06-24, in-castle save) found
`u6_walkable` reporting far too many blocked (`#`) cells: the avatar stood in
open castle floor, blocked only by the NPCs packed around it, yet the grid
painted walls all over the passable area. This documents the root cause and the
fix, so the reasoning is recoverable later. The commit itself carries only a
one-line title.

## Symptom

`u6_walkable` returned a sane outline (correct `@`, correct `N` NPC positions,
real walls present) but with a flood of phantom `#` over cells that are actually
open floor — including the tile directly east of the avatar, which is a **carpet
(passable)**. Terrain looked right where it was open; there was just too much
blocked.

## What was NOT wrong (ruled out by live tracing)

- **Terrain passability decode.** `IsTerrainImpass(tile) = TerrainType[tile] &
  0x02` (`u6.h`), indexed by the ground tile byte (`AreaTiles` is `unsigned
  char`, ground tiles are 0–255). The tool's `TERRAIN_IMPASS = 0x02`, the
  `TerrainType` far pointer (`DS:0xB3EB`), and the table contents all check out.
  The regular `145`-type tiles flanking the avatar really are walls (confirmed
  against the `ultima6_clone` map). Terrain was left untouched.
- **Window alignment.** `AreaX/AreaY = (MapX/MapY − 0x10) & 0x3f8`
  (`seg_101C.c:145` `C_101C_0306`); `AreaTiles[row][col]` maps to world
  `(AreaX+col, AreaY+row)`. The live `AreaX=288` matched the current avatar, and
  `@`/`N` placement agreed with the screen.
- **Object tile decode.** For the carpet: `ObjShapeType[539] = 0x2d2f` → type
  `0x12f = 303`, frame `11`; `BaseTile[303] = 1104`; tile `= 1104 + 11 = 1115`;
  `TerrainType[1115] = 0x00` → **passable**. Exactly right — and exactly what the
  engine computes (`TILE_FRAME` = `BaseTile[type] + frame`).

## Root cause

`_build_grid` built the object-block layer by following **`Link` (`DS:0xBDDA`)**
from each cell's head object (`MapObjPtr[cell]`), treating `Link[slot]` as "the
next object stacked on the **same** cell":

```python
slot = MapObjPtr[cell]
while 0 <= slot < MAX_SLOTS and guard < 64:
    if slot >= 0x100 and impassable(tile_of(slot)):
        block(cell); break
    slot = Link[slot]        # assumed same-cell — WRONG
```

`Link` is **not** a per-cell stack. It is U6's **area-wide object scan chain**
(row-major order — the chain `SearchArea`/`NextArea` traverse). Proof from live
memory: the carpet (slot `539`) sits at world `(308,352)`, but
`Link[539] = 540`, and object `540` sits at `(313,352)` — a **different cell**,
five tiles east, on the very first hop.

So from any cell with an object, the walk wandered across the whole area (up to
64 hops) and blocked the **starting** cell as soon as it met *any* impassable
object anywhere downstream. That is the flood of phantom `#`, and why the
passable carpet's cell came back blocked.

## The fix

Mirror what the engine actually does in `__ComputeResistance`
(`seg_1E0F.c:1866`): it iterates objects with
`for (obj = SearchArea(...); obj >= 0; obj = NextArea())` and blocks **each
object's own cell** (`area_x = GetX(obj) − origin`). It never associates one
object with another cell.

`_build_grid` now does the same — a single pass over the world-object slots,
each impassable object blocking its **own** cell:

```python
for slot in range(0x100, U6_MAX_SLOTS):
    sh = ObjShapeType[slot]
    if sh == 0:                       continue   # empty slot
    if ObjStatus[slot] & 0x18:        continue   # not LOCXYZ (held/contained/equipped)
    tile = BaseTile[sh & 0x3ff] + (sh >> 10)
    if not (TerrainType[tile] & 0x02): continue  # passable object
    x, y, z = unpack(ObjPos[slot])
    if z != avatar_z:                 continue   # different map level
    cell = world_to_cell(x, y, AreaX, AreaY)     # None if outside the 40x40 window
    if cell: walk[cell] = False
```

`Link` is no longer used here. NPC slots (`< 0x100`) stay excluded by design
(they are resolved at per-step time). The ground-terrain pass (cost +
impassability) is unchanged.

## Follow-up: both refinements are now ported

This fix corrected the over-blocking but left two refinements out. Both are now
closed by porting the engine's actual move gate `C_1E0F_000F` — see
`dosbox_u6_passability.md` for the full model:

- **Multi-tile object spread** (`TileFlag` DoubleH/DoubleV/2×2 → W/N/NW neighbour
  cells, reading `tile-1/-2/-3`) — now implemented in `_build_grid`.
- **Doors / passthrough** — for the avatar these need no special case: the
  `OBJ_129..12C` / `OBJ_116/118` handling in the engine is on the *NPC*-mover
  branch, so a door is just an object whose tile is impassable (closed) or
  passable (open), which the general object rule already tests.

## Verification

Hooked "Monica" on the in-castle save and re-ran `u6_walkable`, cross-checked
against the running `ultima6_clone` and the DOSBox screen:

- The carpet east of the avatar is now open; the phantom `#` over the surrounding
  floor are gone; the area is blocked only by the adjacent NPCs.
- The real wall columns (the `145`-type terrain at `X=302` and `X=312`) stay
  blocked.
- Human-confirmed the avatar's neighborhood matches the screen.

## Durable RE note

- `Link` (`DS:0xBDDA`) = **area-wide object scan chain** (row-major), the order
  `SearchArea`/`NextArea` walk. It is **not** a per-cell object stack. To find
  the objects on one cell, filter all objects by position — do not chase `Link`.
- `MapObjPtr[cell]` (`DS:0xD8E7`) gives the head object drawn at a cell; it is a
  reliable per-cell entry point, but its `Link` successor is the next object in
  the *area scan*, not the next object on that cell.
