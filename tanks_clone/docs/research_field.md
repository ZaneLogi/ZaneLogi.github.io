# Battle City — Field (S2) decode

How a stage becomes the live collision grid, and how tank occupancy is tracked. This
holds the Field-specific bulk the map deliberately keeps out of itself (map §5 S2
stays at the coupling level). Built in **P5**.

**Design settled #1 (2026-07-18):** `Field` HAS-A a `Tilemap`; the tile ids in it ARE
the terrain state (a chipped brick is a 4×4 quadrant mask only the tile id can hold);
occupancy is a **separate grid** (the ROM's bit7 packing dropped as an artifact). Map
§5 S2 carries that reasoning — this doc is the mechanism underneath it.

## 1. Coordinates — the play grid inside the nametable  [D]

The field buffer mirrors a full **32×30 nametable** (`$0400-$07FF`). The 13×13-block
play grid is drawn at **tile origin (2,2)** = pixel **(16,16)**; everything outside is
the `$11` grey border. Because tank/bullet positions are screen pixels that already
include that offset, `pixelToCell(x,y) = (x>>3, y>>3)` matches `$D706` with no offset
math, and the border + eagle walls live in the same buffer as real collision cells.

- `sub_F000_draw_stage`: `ram_0056`/`ram_0057` (X/Y pixel) both init `$10`, step `$10`,
  stop at `$E0` → 13 blocks each axis, first at (16,16).
- `sub_D7CC_create_default_stage_field`: fills the whole buffer with `$11`, then clears
  the **26×26 play grid from pointer `$0442`** (= row 2, col 2) to `$00`.

Geometry: 13×13 blocks × 16px = 208×208, occupying pixels (16,16)–(223,223); 26×26
tiles of 8×8. `constants.js`: `FIELD_ORIGIN_COL/ROW = 2`, `STAGE_COLS/ROWS = 13`.

## 2. `loadStage` — block grid → tile buffer  [D]

`sub_F000` + `sub_D7CC` + `sub_D80B_write_block_tiles_and_attribute_to_buffer`:

- Fill the buffer with `$11` (border) + palettes 0 (`$D7CC`), then draw 169 blocks —
  which **exactly cover** the 26×26 play grid, so drawing them *is* the clear.
- `sub_D80B`: BLOCK code → `tbl_DACB` (its 4 tile ids TL,TR,BL,BR) + `tbl_DABB` (its
  palette 0–3). `field.js`'s `_drawBlock` mirrors `demo/level_viewer.js`'s `paintBlock`
  using `BLOCK_TILES` (= `tbl_DACB`) and `BLOCK_ATTRIBUTE` (= `tbl_DABB`) — the exact
  decode P2 verified pixel-exact.
- `loadStage(blockGrid)` takes the **decoded** grid (`LEVELS[n]` / `DEMO_STAGE`), not
  raw bytes. The stage→grid dispatch (`$F009-$F00E`: stage 36–70 → `SBC #$23` → 1–35;
  `$FF` → demo) lives in `Game.stageGrid()`, at the call site where `stage` is known.

## 3. Terrain queries  [D]

- `terrainAt(col,row)` = the tile id. Occupancy is a separate grid, so no bit7 mask.
- `isPassable` (`$DCD5`, **#3**): `t === 0 || t >= $20`. The tile ids were **arranged**
  so a tank drives over `$00` (empty) and everything `>= $20` (BLANK_STEEL `$20`, ICE
  `$21`, FOREST `$22`), while every solid sits in `$01-$1F` (brick `$01-$0F`, steel
  `$10`, grey border `$11`, water `$12`). One magnitude compare classifies terrain —
  kept as the compare (`TILE_DRIVE_OVER_MIN`), not a decoded enum, so it can't drift.
- `isIce` (`$E181`): `t === $21`.

## 4. Occupancy — the two-pass mark/clear  (#2)  [D]

The ROM packs "a tank is here" into bit7 of the tile byte to save RAM; here it is a
separate `Uint8Array(32*30)`. The two-pass **shape** is faithful and load-bearing:

| step | routine | effect |
|---|---|---|
| 1 | `$E181` | **mark** every drivable tank's footprint, *before* any tank moves |
| 3 | `$DBF1` | movement reads occupancy — a moving tank sees others at frame-**start** |
| 4 | `$E1FA` | **clear** each tank's marks |

Net: occupancy is scratch, alive only across the movement pass. Marking all tanks
before moving any is why two tanks driving toward each other both see the other's
*old* cell — player-observable, so the timing is preserved, not just the packing.

**Footprint** (`$E1C9-$E1EB`): base cell = `((y-8)>>3, (x-8)>>3)`; mark `base+$21`
always; `+$20` (left) if `x & 7 == 0`; `+$01` (up) if `y & 7 == 0`. So a tank straddling
a cell boundary blocks the cells it straddles into (1–3 cells). `$E1F3` does the OR.

**Ice** (`$E181`, players only): the tile at `base+$21` `== $21` → `tank.onIce`
(the ROM's `$0103` bit7).

**Writeback** (`$E1FA`): clears exactly the marked cells. A tank destroyed during
movement is no longer drivable and is **skipped** (`$E202`/`$E206`) → its marks leak
until re-marked — a faithful quirk. We store the marked-cell list per tank instead of
the ROM's packed base-pointer + two neighbor-flag bits (`$E1D2`/`$E1E3`), which is the
same cell set without the packing.

## 5. Terrain mutation (bullets — step 11)  [D]

Thin edits Field owns; the *decision* to make them is bullet logic (`Bullet.checkPoint`,
`$E604`/`$E69A` — ported in P7): `chipQuadrant(px,py)` = `sub_D743` (a normal bullet clears
one 4×4 quadrant via `setQuadrant`); `clearTile(col,row)` = `$E6DE`'s whole-tile clear (a
power bullet). `Field.quadrantHit` (`$D725`/`$D73C`) is the collision pre-test they read.

## Verified (P5)

- **Terrain:** 169/169 blocks decode correct vs `LEVELS[0]`; border `$11` blocks;
  `isPassable`/`isIce` classify BLANK/ICE/FOREST vs BRICK/STEEL/WATER correctly.
- **Occupancy:** aligned player marks 3 footprint cells + `onIce`; unaligned enemy
  marks 1; non-drivable tank skipped; writeback clears exactly the marks; two-pass
  marks all tanks before clearing any.
- **Visible:** Menu → 1P → Start → `StageIntro` → `Battle` renders stage 1's terrain
  (grey border, brick columns, central + side steel, eagle fortification; at P5 the eagle
  itself was absent — `Base` drew it in **P8**, `research_base.md`). Screenshot in the P5 session.
