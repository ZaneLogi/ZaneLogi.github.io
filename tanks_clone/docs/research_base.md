# Battle City — Base / HQ (S6) decode

The eagle and its walls: how they are drawn, destroyed, fortified, and how
destruction becomes game over. Built in **P8**. The map (§5 S6) stays at the
coupling level; this is the mechanism.

**The one fact everything follows from — the base is TILES in the field buffer,
not sprites  [D].** The walls and the eagle are ordinary background tiles written
into `$0400` by `sub_CAF5`/`sub_CB9E`/`sub_CB5D`/`sub_CC08`. The *only* sprite part
is the game-over **explosion** (`$E2D8-$E362`). So in the port, drawing the base is
writing tiles into `field.tilemap`; destroying it swaps the eagle tiles and adds a
sprite overlay. `Base` HAS-NO surface of its own — it edits `Field`'s (like the
bullet brick-chip, `Field.chipQuadrant`).

## 1. Geometry — a fixed 6×4 stamp at the bottom-centre  [D]

The four draw routines write `$FF`-terminated tile runs through
`sub_D6B3_fill_buffer_with_tiles` at fixed buffer offsets. Decoding `LDX #(off &
$1F)` (column) + `LDY #(off - $0400)/$20` (row):

```
        col 12  13  14  15  16  17
row 24   00  00  00  00  00  00      $070C  line1  (blank)
row 25   00  0F  0F  0F  0F  00      $072C  line2  top wall
row 26   00  0F  C8  CA  0F  00      $074C  line3  L wall · eagle-top · R wall
row 27   00  0F  C9  CB  0F  00      $076C  line4  L wall · eagle-bot · R wall
```

Eagle 2×2 = cols 14-15 / rows 26-27, tiles `C8 CA / C9 CB` (`sub_CB5D` writes the
same pair at `$074E`/`$076E`). In block space that is block **(6,12)**; the walls
span block rows 11-12, cols 5-7. All of it is **empty in the stage files** — stage
1's block rows 11-12 cols 5-7 are `$D` (verified against `LEVELS[0]`), so the stamp
fills empty space and never fights stage terrain. This is map §5 S2's "the eagle is
NOT in stage data — row 12 is empty in every stage file, the HQ is painted by code."

**When it is drawn  [D].** `$C1DC sub_CAF5_draw_default_base` runs at stage intro,
right after `$C1D9 sub_F000_draw_stage` — so the base stamps over the freshly-drawn
field. (The constructed-stage path `$C1E2` instead calls `sub_CB5D_draw_default_eagle`
alone, because the editor's field already has walls — Construction, deferred.) The
`$C0E7` caller is the editor loop; `$C412` is the demo — both deferred.

### Tile tables  [D]

| routine | `$addr` | walls | eagle | source tables |
|---|---|---|---|---|
| `draw_default_base` | `$CAF5` | brick `$0F` | `$C8-$CB` | `tbl_D36D/D374/D37B/D382` |
| `draw_protected_base` | `$CB9E` | steel `$10` | `$C8-$CB` | `tbl_D389/D390/D397/D39E` |
| `draw_default_eagle` | `$CB5D` | — | `$C8-$CB` | `tbl_D3A5/D3A8` |
| `draw_destroyed_eagle` | `$CC08` | — | `$CC-$CF` | `tbl_D3AB/D3AE` |

`sub_CAF5`'s lines 3-4 already contain the eagle tiles, so the default draw paints
walls **and** eagle in one call — `sub_CB5D` (eagle-only) exists for the editor path.

## 2. Attribute writes → per-cell palette  [D]

Each draw routine also writes the `$07C0` attribute shadow, which the PPU decodes
per 16×16 (2×2-tile) quadrant. In the port palettes are 1:1 per cell
(`Tilemap.setPalette`), so the region writes re-derive to per-cell values that
produce **byte-identical visible output** (a blank cell's palette is unobservable —
colour index 0 is the backdrop in every palette). The two attribute bytes touched
are offsets `$33` (region cols 12-15 / rows 24-27) and `$34` (cols 16-19):

- **Default** (`$CB41` `attr$33 = $00`, `$CB4B` `attr$34 &= $CC`): every base cell →
  **palette 0**. (`sub_CB5D` additionally `attr$33 &= $3F` → the eagle BR quadrant to 0.)
- **Protected** (`$CBE8` `attr$33 = $3F`, `$CBF1` `attr$34 = (x&$CC)|$33`): the wall
  quadrants → **palette 3** (`$3F` = TL/TR/BL = 3, BR = 0), the eagle (BR) → **0**.

So the port rule: default = all base cells palette 0; protected = wall cells palette
3, eagle cells palette 0. Palette 0/3 in the stage set (`con_bg_pal_02`) are the same
brick/steel colours `BLOCK_ATTRIBUTE` assigns bricks (0) and steel (3).

## 3. The eagle exposes a P6 passability bug — `$DCD5 BMI`  [D]

`sub_DCD5` (tank passability) reads the field tile and branches **`$DCD7 BMI`**
(tile ≥ `$80`) → **blocked**, *before* the `$DCDB CMP #$20 / BCC` (< `$20`) block:

```
$DCD5 LDA (tile)
$DCD7 BMI blocked      ; tile >= $80  -> BLOCKED   (occupancy bit7 AND the eagle)
$DCD9 BEQ passable     ; tile == 0    -> pass
$DCDB CMP #$20
$DCDD BCC blocked      ; tile $01-$1F -> BLOCKED
                       ; tile $20-$7F -> pass
```

That `BMI` did **double duty** in the ROM: occupancy (bit7, packed into the tile
byte) *and* the eagle, whose tiles `$C8-$CB` have bit7 set. The port split occupancy
into its own grid (`Field.occupancy`, checked separately in `Tank.cornerClear`), so
the eagle is now seen only by `isPassable`, which was `t === 0 || t >= $20` → **true
for `$C8`** → tanks would drive through the eagle. Latent through P6 because no
tile ≥ `$80` ever existed in the field until this phase draws the eagle.

**Fix (P8):** `isPassable = t === 0 || (t >= $20 && t < $80)` — restore the `$DCD5
BMI` bound on the pure tile id. Only the eagle (`$C8-$CB`) and destroyed eagle
(`$CC-$CF`) are ≥ `$80`; all real terrain is `< $80`, so existing behaviour is
unchanged. Bullets are unaffected — they read the eagle via `quadrantHit` +
`(tile & $FC) == $C8` (`Bullet.checkPoint`, `$E6A4`), not `isPassable`.

## 4. `sub_E2A9_HQ_handler` — pipeline step 6  [D]

Two jobs, in order: shovel fortify (only while active), then the game-over countdown.

**Shovel fortify (`$E2A9-$E2CF`).** Gated on `ram_shovel_timer` (`$45`, set by the shovel
bonus — P14). Acts only every 16 frames (`frm_cnt_lo & $0F == 0`):

- every 64 frames (`& $3F == 0`): `DEC shovel_timer`; if it hits 0 → `draw_default_base`
  (revert steel→brick).
- `timer >= 4`: nothing — the protected base drawn at pickup stays.
- `timer < 4`: **blink** — `draw_protected_base` on frames where `frm_cnt_lo & $10`,
  else `draw_default_base` (walls flash steel/brick as the shovel runs out).

The protected base is first drawn at **pickup**, not here — `ofs_bonus_E9FB_02_shovel`
(`$E9FF` `draw_protected_base`, `$EA04` `shovel_timer = $14`), gated on the base being
alive (`$E9FB BPL`). Ported as `Base.applyShovel(field)` for Bonus to call.

**Game-over countdown (`$E2D2-$E304`).** `ram_game_over_flag` (`$68`) is a tri-state
byte: `$80` alive (`$E2D6 BMI` → return), `$00` destroyed (`$E2D4 BEQ` → return),
`$01-$7F` = the live countdown. We keep the behaviour, drop the byte-packing:
`Base.state` (ALIVE/EXPLODING/DESTROYED) + `explosionTimer`. Each EXPLODING frame:
`DEC` the timer (`$E2DC`); at 0 → DESTROYED. Measured 38 frames EXPLODING, DESTROYED
on the 39th — the `$27` seeded at `$E6B0`.

## 5. The explosion sprites — `$E2D8-$E362`  [D]

The render half of `sub_E2A9`: a growing/shrinking blast at the eagle, driven off the
remaining count. Palette 3 (`$E2D8`). The phase index is a **triangle wave**:

```
index = |  | (timer >> 2) - 5 | - 5 |        ($E2DE-$E2F6, two abs folds)
```

`timer` sweeps `$26→0` (post-DEC), so `timer>>2` is 9→0 and the index runs
`1→2→3→4→5→4→3→2→1→0`, ~4 frames per level. `tbl_E306` maps it to a handler:

| index | tiles | layout |
|---|---|---|
| 0 | — | nothing (`ofs_004_DBF0_00_RTS`) |
| 1 / 2 / 3 | `$F1` / `$F5` / `$F9` | one 16×16 blast at (`$78`,`$D8`) — the eagle centre |
| 4 | `$D1 $D5 $D9 $DD` | 32×32: four 16×16 at (`$70`/`$80`,`$D0`/`$E0`) |
| 5 | `$E1 $E5 $E9 $ED` | 32×32, biggest frame (`$D1+$10` etc., `ram_0069`) |

Each 16×16 is a `sub_DA7B_display_2_sprites` pair — left tile `T` at `X-8`, right
tile `T+2` at `X` — the same convention `bullet.js` uses for `sub_DEE2`. Ported as
`Base.render(renderer)`, reading `explosionTimer`. It runs entirely within `Battle`
(the countdown finishes before `checkStageEnding` returns DONE), drawn **last** among
front sprites: `sub_E2A9` fills OAM at step 6, a lower index than the tanks/bullets
drawn after the pipeline (`$C206`/`$C209`) ⇒ frontmost ⇒ enqueued last in the port's
paint-order model.

## 6. Destruction path  [D]

A bullet reaching an eagle tile (`Bullet.checkPoint`, `$E6A2-$E6C3`, ported dormant
in P7): `(tile & $FC) == $C8` → if the base is alive, `Base.onHit(field)`:

1. `state = EXPLODING`, `explosionTimer = $27` (`$E6B0`).
2. `draw_destroyed_eagle(field)` — eagle → `$CC-$CF` (`$E6BA`). The crater shows
   immediately; the sprite blast animates on top for 39 frames.
3. sfx `ram_sfx_explosion_hq`/`_player` (`$E6B4/$E6B7`) — was Audio-deferred;
   **wired in P15** (`base.js` `onHit`, `research_audio.md`).

Then the countdown (§4) runs to DESTROYED, and `Game.checkStageEnding` (`$C72A BEQ`)
sees `base.isDestroyed()` → ends the stage **with** the GAME OVER message (already
wired, `game.js`). A player can destroy their **own** base — the destroyed eagle
(`$CC-$CF`, still ≥ `$80`) also blocks tanks and lets bullets fly over (`$CC & $FC !=
$C8`, then `≥ $12` pass).

## Verified (P8)

Deterministic, headless (66/66 in-browser — construct `Field`/`Base`/`Game`,
`getImageData`, never a screenshot for logic):

- **Draw:** `drawDefault` writes the exact 24-cell stamp (walls `$0F` + eagle `$C8-$CB`)
  at palette 0; `drawProtected` → steel `$10` pal 3 walls, eagle pal 0; `drawDestroyedEagle`
  → `$CC-$CF`.
- **Passability (the fix):** the eagle blocks tanks on all 4 cells; the destroyed eagle
  blocks too; regression sweep `$00`/`$0F`/`$10`/`$11`/`$12`/`$20`/`$21`/`$22`/`$C8`/`$CC`
  all classify per `$DCD5` (note water `$12` blocks tanks — solid, `< $20` — though bullets
  fly over it); an A/B drive proves an isolated eagle stops a tank the empty field lets pass.
- **Destruction:** `onHit` → EXPLODING, timer `$27`, destroyed tiles, walls intact; the
  countdown is exactly 39 frames → DESTROYED; a flying bullet on the eagle drives
  `Bullet.checkPoint` → `base.onHit(field)`; the full flow (Menu→1P→Battle) reaches Battle
  with the base drawn, destroys via the real pipeline (39 frames), `checkStageEnding()` →
  true, `advanceStage()` → false (game over).
- **Explosion animation:** the phase index sweeps `1→2→3→4→5→…→0`; `render` emits the right
  sprite pairs (phase 1 = `$F1`/`$F3` at (`$70`/`$78`,`$D8`) pal 3; phase 5 = 8 sprites,
  first `$E1`; phase 0 / alive = none).
- **Shovel (ported P8, wired live P14):** `applyShovel` → steel walls + `$14`; the 64-frame
  DEC gate; the `< 4` blink (protected on `& $10`, else default); expiry reverts to brick;
  refused when not alive.

Visual (preview pane, pixels via `getImageData` + a screenshot): stage 1 renders the eagle
emblem inside its brick fortification (alive eagle `$c8`, 122 lit px); destruction shows the
explosion blast over the base (destroyed `$cc`, 245 px; blast 1525 px).
