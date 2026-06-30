# Research: the crash explosion (`BOOM`)

How Atari Lunar Lander draws the lander blowing up, decoded from the original
program source (`A34573.1A`, routine `BOOM`) and the vector-ROM source
(`A34599.1C`, the explosion pictures). Ported in `demos/explosion.js`.

This **supersedes** the earlier "the crash routine draws a random subset of the
12 debris glyphs scattered at the impact point" guess (which was a reasonable
read of the MAME crash frame, but wrong about the mechanism). The real routine is
a deterministic 7-piece animation; the only randomness is a 1-of-4 pattern pick.

## 1. Shape of an explosion

An explosion is **7 pieces**, animated over a step counter **`INDEX` = 1 … 127**:

- **1 cabin octagon** (the pod) — drawn first, lasts the whole animation, and
  **tumbles** (its pose cycles through the 8 octagon attitudes by `INDEX & 7`).
- **6 debris fragments** — small vector glyphs that fly straight out from the
  impact point, each on its own ray, each winking out at its own staggered time.

Each piece *i* has, per frame:
- a fixed **velocity** `delta[i] = (dx, dy)` → its position offset is
  `delta[i] · INDEX` (linear spread; the whole field expands as `INDEX` grows),
- a **disappear time** `BOOMC1[i]` — once `INDEX` passes it, the piece is gone.

`INDEX` advances **one step every other frame** (`A34573.1A:522` —
`LDA FRAME / LSR / BCS` skips odd frames), initialised to 1 (`:576`), and the
sequence ends when `INDEX` rolls past `0x7F` (`:525` `INC INDEX / BPL` →
`ASL INDEX` zeroes it and the state machine leaves crash mode). So the blast runs
~127 steps × 2 frames ≈ 254 frames ≈ 4.2 s at 60 Hz.

## 2. The "random debris" is a 1-of-4 pattern pick

`RNDOM` (0–3) selects **one of four hand-authored patterns**. It is **not** a
random subset of glyphs.

- `RNDOM` is set in `DELTA` (`A34573.1A:3508`): `LDA INTCNT / LSR / LSR / AND #3`
  — two bits off a free-running interrupt counter, i.e. effectively random per
  crash.
- `BMVCPI` (`:3427`) dispatches on `RNDOM` to one of four table pairs
  `BOOMA{n}` / `BOOMB{n}`.

Each pattern is a fixed set of **6 fragment glyphs** (`BOOMB{n}`) plus **7
velocities** (`BOOMA{n}`, the 6 fragments + the octagon). The disappear-time
table `BOOMC1` is **shared** by all four patterns.

## 3. The data tables

### Velocities — `BOOMA1..4` (`A34573.1A:3445`)
`.BYTE dx, dy` per piece, 7 pairs; index `Y = 0..5` = fragments, `Y = 6` =
octagon ("OCTAGON TRAVEL").

| Y | BOOMA1 | BOOMA2 | BOOMA3 | BOOMA4 |
|---|--------|--------|--------|--------|
| 0 | (0,−2) | (2,1)  | (−1,0) | (1,−1) |
| 1 | (−1,−1)| (0,1)  | (−3,0) | (−5,0) |
| 2 | (−2,0) | (−4,1) | (1,0)  | (1,−1) |
| 3 | (−1,0) | (−1,−1)| (−1,−1)| (3,1)  |
| 4 | (0,2)  | (2,0)  | (0,−1) | (−1,−3)|
| 5 | (2,−1) | (0,−1) | (3,0)  | (1,1)  |
| 6 (oct) | (0,3) | (0,2) | (0,3) | (0,3)  |

### Disappear times — `BOOMC1` (`A34573.1A:3478`, shared, hex)
`5D 60 64 6D 70 74 7F` = `93 96 100 109 112 116 127` for `Y = 0..6`. The octagon
(`7F = 127`) lasts the entire run — the "semi-intact cabin while the struts
scatter" look.

### Fragment pictures — `BOOMB1..4` (`A34599.1C:658`)
A `JSRL` list of 6 debris glyphs per pattern (`Y = 0..5`). The glyphs are
`PIECE1..PIEC12` = ROM `$4F1C..$4FBE` (decoded as `S_4F1C..S_4FBE` in
`discovery_rom_data.js`):

| | Y0 | Y1 | Y2 | Y3 | Y4 | Y5 |
|---|----|----|----|----|----|----|
| **BOOMB1** | PIECE1 `4F1C` | PIECE2 `4F28` | PIECE3 `4F3A` | PIECE4 `4F46` | PIECE5 `4F52` | PIECE6 `4F62` |
| **BOOMB2** | PIEC7 `4F6E` | PIEC8 `4F78` | PIEC9 `4F8E` | PIEC10 `4FA0` | PIEC11 `4FAE` | PIEC12 `4FBE` |
| **BOOMB3** | PIECE3 `4F3A` | PIEC12 `4FBE` | PIEC9 `4F8E` | PIECE6 `4F62` | PIECE4 `4F46` | PIEC12 `4FBE` |
| **BOOMB4** | PIEC8 `4F78` | PIECE2 `4F28` | PIECE3 `4F3A` | PIEC10 `4FA0` | PIECE6 `4F62` | PIEC7 `4F6E` |

The 12 fragment glyphs are tiny `VCTR` shapes (`A34599.1C:688`), most authored
**net-zero** (they return the beam to where they started). Their source names
also confirm the old eyeballed gallery labels — e.g. `PIEC7` (`4F6E`) is the
2×2 "box", `PIEC9` (`4F8E`) the thin "rectangle/panel", `PIEC12` (`4FBE`) the
"diamond".

### Octagon — `OCTGN` / `OCTX0..7` (`A34599.1C:617`)
8 poses `OCT00..OCT07` = `$4800..$48F8` (`S_4800,S_4826,S_4844,S_486A,S_4890,
S_48AC,S_48D2,S_48F8`). The explosion JSRs through `OCTGN[INDEX & 7]`
(`A34573.1A:3387`). Each `OCTXn` wrapper appends a small trailing dark `VCTR`
(`2,7 / 1,8 / 0,9 / −2,8 / 4,8 / 3,8 / 1,8 / −1,8`) — included in the port for
beam-walk fidelity.

## 4. Positioning is a single cumulative beam walk

The CPU rebuilds one VG display list per frame and the hardware walks it with one
moving beam. `BOOM` (`A34573.1A:3340`) loops the pieces in draw order
**`X = 12,10,…,0`** (`Y = X/2` = `6,5,4,3,2,1,0`, octagon first) and for each
**not-yet-disappeared** piece:

1. computes `delta · INDEX` (`MULT`, `:3355`/`:3366`) and emits a **dark
   positioning vector** to it — `VGVCTR` (`A34573.1B:177`) writes a *relative*
   `VCTR` with brightness `VGBRIT`, and `BOOM` sets `VGBRIT = 0` first (`:3341`),
   so these moves are invisible;
2. emits the piece's glyph (`JSRL` to the debris picture, or the tumbling
   octagon pose).

Because the positioning vectors are **relative** and never reset to origin, the
beam **accumulates**: piece *k* sits at `origin + INDEX · Σ(draw-order deltas
through k)` (plus the small net displacements of the glyphs already drawn). A
skipped (disappeared) piece emits nothing, so it doesn't perturb the others —
and pieces happen to disappear in reverse draw order, so the survivors' positions
stay stable. After the list, `BMREST` (`:406`/`:423`) rests the beam at centre.

The octagon is drawn first and is the only piece that gets the lander's
**residual velocity** added (`DELX/DELY`, `:3353`), so all later-drawn fragments
inherit that drift through the cumulative beam — i.e. the whole debris field
coasts with the ship's momentum at impact. `DELX/DELY` come from `VELX/VELY` in
`DELTA` (`:3488`).

The demo (`demos/explosion.js`) reproduces this exactly with one accumulating
cursor and the same draw order; it crashes a lander **resting at the centre**, so
`DELX = DELY = 0` and the burst is purely radial.

## 5. Sound (not ported)

`BOOM` also derives the crash-noise level from `INDEX` (`:3413` — `EOR #7F`,
shift, `ORA #NSPITC` hi-freq-noise bit, `S.SND`). Audio is out of scope for the
vector demos (cf. the repo's "no software counterpart" note for analog sound;
LL's sound is a separate study).

## 6. Citations

| What | Where |
|---|---|
| `BOOM` routine | `A34573.1A:3340` |
| Draw loop / `INDEX & 7` octagon / `GLBNUM`=octagon index | `A34573.1A:3343,3385,3338` |
| `BMVCPI` pattern dispatch on `RNDOM` | `A34573.1A:3427` |
| `BOOMA1..4` velocities | `A34573.1A:3445` |
| `BOOMC1` disappear times | `A34573.1A:3478` |
| `DELTA` (DELX/DELY, RNDOM) | `A34573.1A:3488` |
| `INDEX` advance / init | `A34573.1A:522,576` |
| `VGVCTR` = relative VCTR w/ VGBRIT | `A34573.1B:177` |
| `OCTGN`/`OCTX`/`BOOMB1..4`/`PIECE` pictures | `A34599.1C:617,658,688` |
