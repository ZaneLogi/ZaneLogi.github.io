# research_vector_usage.md — lunar_lander

How the **picture-ROM vector data is selected, positioned, and assembled** — decoded
from the original source (the question that bugged us when we had the decoded shapes but
not the usage). Sources, all in `D:\tmp\lunar_lander_source\`:
program `A34573.1A` (`:` = its line numbers), and the **vector-ROM source** files
`A34598.1B` / `A34599.1C` / `A34597.1A` (cited as `598:` / `599:` / `597:`). The
vector ROMs are not just dumps — the repo carries their **labeled source** (`.INCLUDE
VECMAC/VECAN`, per `LUNAR.DOC`), so shapes have names.

## 1. The core mechanism — a VG-RAM display list

The CPU never "draws." Each frame it assembles a list of DVG instructions in **VG RAM**
(`$4000-$47FF`); the DVG hardware then runs that list, jumping into the picture ROMs.
A decoded shape is used one of two ways:

- **Static shape → `LABS` (position) + `JSRL` (jump to the ROM subroutine).** The DVG
  jumps to the shape's ROM address and draws it in place. Used for terrain, starfield,
  font, HUD labels, arrows. `SCAPE` (`:1090` "loads VG RAM with JSRL's to lunarscape
  pictures"), `STARS` (`:1118`), `LOADRAM`.
- **Mirrored shape (the lander) → copy-and-sign-flip into VG RAM** (see §4), because the
  9 stored poses must cover all four quadrants.

`JSRL`/`RTSL` are "long" subroutine call/return *within* the DVG list — the picture ROM
is a library of subroutines the CPU stitches together by reference, not by copying
(except the lander).

## 2. Picture-ROM source map

**`034598` — `A34598.1B` "LUNMIN — LUNAR MINORSCAPE"** (`$5000-$57FF`):
- `598:13` minor **section definitions** `SECT01…SECT16` (terrain) — §3
- `598:101` **segment definitions** `SEG001…SEG024` (the reusable terrain pieces)
- `598:234` **vector & LABS tables** — `LNMIN` (section order), `MINTBL` (section LABS),
  `MINTAB` (scroll values)
- `598:306` **major starfield** (`MJSTRA`/`MJSTRB`), `598:401` **minor starfield** (`MINSTR`)
- `598:640` `.INCLUDE VECAN` — the **A–Z/0–9/colon font** (Ed Logg)

**`034599` — `A34599.1C` "LUNVEC — LUNAR LANDER VECTOR GENERATOR CODE"** (`$4800-$4FFF`):
- `599:46` `MODULES`, `599:138` **`SHIPS`** (the large/near lander bank, `$4BA2`),
  `599:346` ship vectors, `599:361` scape beam-rest (`FINI`),
  `599:380` **`LITTLE SHIPS`** (the small/far lander bank), `599:613` **explosion pieces**
  (the `$4F1C-$4FBE` debris). The two banks are the minor (near) and major (far) modules.

**`034597` — `A34597.1A`**: **FOREIGN VERSION ONLY** (`LUNAR.DOC`) — foreign glyphs +
`.ASCVG` message strings + offset tables (`$5800-$5FFF`). Absent/unused in a US cabinet
(why our dump decodes as noise). `A34602.ROM` = the separate "vector STATE ROM."

## 3. Terrain — resolved (no more address-order guessing)

The minor (near) scape is **16 sections, each 256 units wide** (`SECT01…SECT16`,
`598:13-100`). Each section is a **JSRL list of segments**, sometimes with inline `VCTR`
connectors, e.g.:
```
SECT01: JSRL SEG001 / SEG002 / SEG003 / SEG004 / RTSL
SECT09: JSRL SEG008 / VCTR 32,0 / JSRL SEG002 / VCTR 32,0 / JSRL SEG021 / RTSL
SECT11 = SEG019                 ; a one-segment section (alias)
```
The on-screen order is the **`LNMIN`** table (`598:238`): `SECT01,02,…,16,` then it
**repeats** `SECT01,02,…` — that repeat is the horizontal wrap. Each section's vertical
placement is **`MINTBL`** (`598:259`): `.WORD 896,384,656,576,224,368,864,1440,1088,
640,64,64,448,96,64,…` (Y per section). `MINTAB` holds the scroll values.

This is the real terrain sequence our `screen.html`/`scroll_view.html` approximated in
ROM-address order — to make those faithful, drive them from `LNMIN`+`MINTBL` instead.

The **major (far) scape is built at runtime**, not stored: `TRANS` (`MJRCON :362`,
"construct major scape") assembles `MJRLST`/`MJRVG` into VG RAM (`$44F0`/`$4500`) — a
reduced version of the minor sections. (Confirm the exact reduction if pixel-exact far
terrain is needed.)

## 4. The lander — `MODULE` (`:1163-1306`)

The one shape that's copied-and-transformed, because 9 poses cover only ~one quadrant:
1. **`SHIP` (0–31) → pose 0–8 + flips** (`:1173-1200`): `SHIP ≥ 9` is folded back into
   0–8 with `COMP`/`AND`, and `DELX`/`DELY` are set to sign masks (`$00`/`$FF`) for the
   quadrant. (This is the X/Y mirroring `rotation.html`/`thrust.html` do geometrically.)
2. **`M.OFFS` (`:1278`)** picks the bank by zoom: minor → `SHIPS=$4BA2` (large), major →
   `LTLMOD` (little). `LUNARNUM` selects.
3. **`SHPINV`/`SHPLP` (`:1242-1273`)** copy the pose's vector instructions into VG RAM,
   `EOR`-ing each delta's sign byte with `DELX`/`DELY` → the mirrored attitude (mirroring
   at the instruction-byte level, not a separate ROM shape).
4. **`POSTMOD` (`:1295`)** turns the ship's world position into the `LABS` written ahead.

## 5. Starfield, font, HUD, messages

- **Starfield** — `STARS` (`:1121`) writes `LABS` (`STRINIT`) + `JSRL` to the starfield
  sections (`MJSTRA`/`MJSTRB` far in two y-bands, `MINSTR` near). Far = fixed LABS, near =
  scrolled (`SCRLDO`). Point data = `598:306`/`401`.
- **Font** — `VECAN` (`598:640`); characters drawn by `JSRL` to `VGMSGA` glyph entries at
  computed `LABS` (digits/colon/arrows per the "034598 region map" in CLAUDE.md). The HUD
  `$5458` composite is itself a 75-`JSR` list of font glyphs (the label grid).
- **Messages** — English `.ASCVG` strings live with the program/`034598`; foreign in
  `034597` (`FTBLNG`/`FORMSG`/`FMESSG`/`F.MOFF`).

## 6. Takeaway

We now have **labeled source for every vector ROM** plus the program-side assembly — so
future vector work is "read the source," not "byte-decode + guess." The two open
byte-level items are gone: the **terrain sequence** is `LNMIN`+`MINTBL` (§3), and the
**lander fold** is `MODULE` (§4). The only remaining derivation is the exact `TRANS`
major-scape reduction, if/when far-terrain fidelity matters.
