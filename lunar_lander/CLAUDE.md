# CLAUDE.md — lunar_lander

Guidance for Claude Code in this directory. Read this before changing
anything here; it overrides the repo-root CLAUDE.md.

## What this is

A port of Atari **Lunar Lander** (1979) — a vector-display arcade game
running on the **same Atari DVG** (Digital Vector Generator) as
Asteroids. "Faithful" matters: behavior should match the original ROM.

## Status

Early. First slice = a **vector-ROM font demo**
(`demos/vector_rom.html`) that decodes the letter glyphs out of the
picture ROM and renders the whole alphabet as a font sheet. No
gameplay / runtime / CPU-side port yet.

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

Raw ROM dumps live at `C:\Z_Temp\lunar_lander\` on this PC (2 KB each):

| File             | Maps at        | Holds |
|------------------|----------------|-------|
| `034598-01.np3`  | CPU `$5000-$57FF` | picture/glyph ROM — the A-Z + space font (+ picture shapes, TBD) |
| `034599-01.r3`   | TBD (`$5800+`?)   | second picture ROM — lander / terrain / flag / digits (TBD) |
| `034597-01.m3`   | —              | shape index PROM — opens with a `$58xx-$5Bxx` pointer table (TBD) |

File offset within `034598` = `addr − $5000`. The committed artifact is
the **decoded** `vector_rom_data.js`, not the ROM. Add the other PC's
path to `tools/build_vector_rom.py` when known.

## Build + run

```bash
# regenerate the font data (reads the per-PC ROM, writes vector_rom_data.js)
python lunar_lander/tools/build_vector_rom.py

# serve from the repo root, then open /lunar_lander/demos/vector_rom.html
python -m http.server -b 127.0.0.1 8080
```

`vector_rom_data.js` is **generated** — edit the build script, not the
data file.

## Letter address table (034598-01.np3, $5000-$57FF)

Contiguous, alphabetical, each glyph ends in RTS:

```
A $55BE  B $55CE  C $55E8  D $55F4  E $5604  F $5614  G $5622
H $5634  I $5642  J $5650  K $565C  L $5668  M $5672  N $567E
O $5688  P $5694  Q $56A2  R $56B4  S $56C4  T $56D2  U $56DE
V $56EA  W $56F4  X $5702  Y $570C  Z $571A  space $5726
```

## Next steps (user will provide info)

Picture shapes — lander, terrain, flag, digits — from `034599-01.r3`
plus the `034597-01.m3` index table. Addresses TBD.
