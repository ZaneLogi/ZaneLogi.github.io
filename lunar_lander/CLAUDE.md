# CLAUDE.md — lunar_lander

Guidance for Claude Code in this directory. Read this before changing
anything here; it overrides the repo-root CLAUDE.md.

## What this is

A port of Atari **Lunar Lander** (1979) — a vector-display arcade game
running on the **same Atari DVG** (Digital Vector Generator) as
Asteroids. "Faithful" matters: behavior should match the original ROM.

## Status

ROM-decode stage — five vector-ROM demo/survey pages, all faithful
byte-decodes. No gameplay / runtime / CPU-side port yet.
- **Font sheet** (`demos/vector_rom.html`) — the A-Z + space glyphs from
  `034598-01.np3`.
- **Lander poses** (`demos/lander.html`) — the 9 tilt attitudes from
  `034599-01.r3` (8 shared base octagons + per-angle leg/thruster SVECs).
- **Shape gallery** (`demos/gallery.html`) — every JSR/JMP-target
  subroutine across all three ROMs (599 lander, 598 font/pictures, 597
  terrain), each fit to a cell and labelled by CPU address. A survey tool
  for identifying shapes by eye; data from `discovery_rom_data.js`.
- **`$5458` composite** (`demos/title.html`) — the 75-JSR mega-composite
  at `034598` `$5458`, almost certainly the in-game HUD / status line.
- **360° rotation** (`demos/rotation.html`) — the lander spun through a
  full circle at both ROM sizes (see "Lander rotation" below); also
  demonstrates `globalScale` resizing. Sources both banks from
  `discovery_rom_data.js`.

(Note: a faithful byte-decode renders the lander legs correctly — earlier
non-faithful attempts had "legs too small"; staying byte-true to the ROM
avoids it.)

## Known faithful quirks (decoded as-is — NOT bugs)

- **`$4C94` has an extra leg stroke.** In `034599`, a second 9-frame
  lander rotation set is dispatched from the `$4DF4` table (`$4BE4,
  $4C22, $4C5A, $4C94, $4CD6, $4D02, $4D42, $4D7E, $4DB6`). Frame 3
  (`$4C94`) carries a **14th bright stroke at `$4CCC`** — bytes
  `00 10 00 C3`, a `bri=12` horizontal VEC drawing (−8,−1)→(−5,−1) over
  the left leg — where the other 8 frames each have 13. The decode is
  byte-exact (its RTS lands precisely on the next entry `$4CD6`), so this
  is an original-ROM artwork glitch reproduced on purpose; it stands out
  in `gallery.html`. Do **not** "fix" it — deleting the stroke would make
  the decode un-faithful.

## Lander rotation & the two size banks

`034599` stores the lander as **two 9-pose banks**, each spanning only
**~one 90° quadrant** (upright → laid on its side, ~12°/step). The full
360° is reconstructed by **X/Y mirroring** (`dvg.js` `xFlip`/`yFlip`) —
the same reflection scheme Asteroids uses for its ship (`ship.js`
`$750B`: 17 shapes/quadrant + flips; the lander is the coarser 9/quadrant
version). The two banks are the same rotation set at two sizes:

| Bank | Dispatch table | Poses | Native size | Role |
|---|---|---|---|---|
| zoom-out (far) | `$4DF4` | `$4BE4 $4C22 $4C5A $4C94 $4CD6 $4D02 $4D42 $4D7E $4DB6` | ~15 units | far view |
| zoom-in (close) | `$4BA2` | `$4916 $495C $49AA $49F6 $4A42 $4A80 $4AC8 $4B16 $4B64` | ~29 units | close view |

`demos/rotation.html` renders the full sweep; it orders frames by each
shape's measured orientation (the real *direction→pose+flip* fold lives
in the un-decoded LL CPU ROM, so the ordering is geometric, not the
original's exact thresholds). Each lander pivots about the **DVG origin
`(0,0)`** (≈ the cabin-octagon centre, shown as a red dot) — a fixed
point, chosen over a per-frame bounding-box centre that visibly wobbled.
Drawing at arbitrary sizes is also possible via DVG `globalScale` (doubles
per step; wraps at gs≥6 from the 4-bit `(localScale+globalScale) & 0x0F`
mask).

## DVG reuse — same chip as Asteroids

LL drives the identical DVG, verified by decoding glyphs straight from
the ROM (`A` @ `$55BE` = 7 SVEC + RTS, `B` @ `$55CE` = 12 SVEC + RTS) —
byte-for-byte the same opcode encoding as Asteroids. So:

- `dvg.js` here is a **verbatim copy** of `asteroids_clone/dvg.js` (repo
  convention: games are self-contained, no shared library across them).
- The decoded-object vector format is identical.
- The authoritative DVG opcode/scale spec is
  `asteroids_clone/docs/research_dvg.md` (§4-§6, §11) — not duplicated
  here.

## Vector ROM source (per-PC, NOT committed)

Raw ROM dumps (2 KB each) live in a per-PC directory — the exact path
differs between the two machines, so the build scripts
(`tools/build_vector_rom.py` and `tools/build_discovery.py`) probe a
list and use whichever exists on the machine you're on:

- `D:\tmp\lunar_lander\`
- `C:\Z_Temp\lunar_lander\`

(Add a new path to that list if you clone the ROMs onto a third machine.)

| File             | Maps at        | Holds |
|------------------|----------------|-------|
| `034598-01.np3`  | CPU `$5000-$57FF` | picture/glyph ROM — the A-Z + space font, plus picture parts and the `$5458` HUD/status composite (see `title.html`) |
| `034599-01.r3`   | CPU `$4800-$4FFF` | picture ROM #2 — the lander (8 base octagons `$4800-$48F8` + 9 tilt poses `$4916-$4B64`, dispatch table `$4BA2`; a second 9-frame rotation set dispatched from `$4DF4`); terrain / flag / digits TBD |
| `034597-01.m3`   | CPU `$5800-$5FFF` (working) | terrain ROM — `gallery.html` surveys it at `$5800` (offset-4 pointer table → `T_` polylines); earlier thought a shape-index PROM, base not hardware-confirmed |

File offset = `addr − base` (`$5000` for `034598`, `$4800` for `034599`,
`$5800` for `034597`). The committed artifacts are the **decoded**
`vector_rom_data.js` (font), `lander_rom_data.js` (lander), and
`discovery_rom_data.js` (full survey) — not the ROMs themselves.

## Build + run

```bash
# regenerate the curated runtime data (reads the per-PC ROMs):
#   vector_rom_data.js (font) + lander_rom_data.js (lander)
python lunar_lander/tools/build_vector_rom.py
# regenerate the exploratory survey data (every sub in all 3 ROMs):
#   discovery_rom_data.js  (feeds gallery.html)
python lunar_lander/tools/build_discovery.py

# serve from the repo root, then open a demo:
#   /lunar_lander/demos/vector_rom.html   (font sheet)
#   /lunar_lander/demos/lander.html       (9 lander poses)
#   /lunar_lander/demos/gallery.html      (full ROM shape survey)
#   /lunar_lander/demos/title.html        ($5458 mega-composite / HUD)
#   /lunar_lander/demos/rotation.html     (360° rotation, both size banks)
python -m http.server -b 127.0.0.1 8080
```

`vector_rom_data.js`, `lander_rom_data.js`, and `discovery_rom_data.js`
are **generated** — edit the build script, not the data files. (Preview
config: launch.json `lunar_lander` serves this dir on port 8085.)

## Letter address table (034598-01.np3, $5000-$57FF)

Contiguous, alphabetical, each glyph ends in RTS:

```
A $55BE  B $55CE  C $55E8  D $55F4  E $5604  F $5614  G $5622
H $5634  I $5642  J $5650  K $565C  L $5668  M $5672  N $567E
O $5688  P $5694  Q $56A2  R $56B4  S $56C4  T $56D2  U $56DE
V $56EA  W $56F4  X $5702  Y $570C  Z $571A  space $5726
```

## Next steps (user will provide info)

Remaining picture shapes — terrain, flag, digits (numeric readouts) —
plus identifying where the `034597-01.m3` index table's `$58xx-$5Bxx`
pointers map. Addresses TBD; the user supplies ROM context per shape set.
