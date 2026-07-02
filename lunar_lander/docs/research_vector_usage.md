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

![Terrain composition: 24 segment-glyphs compose into 16 sections, tiled by LNMIN into one wrapping surface](terrain_composition.svg)

*(Figure decoded straight from `A34598.1B`: the 24 segment-glyphs, one section built from
four of them, and the full 16-section surface that loops. See `terrain_composition.svg`.)*

The minor (near) scape is **16 sections, each 256 units wide** (`SECT01…SECT16`,
`598:13-100`). Each section is a **JSRL list of segments**, sometimes with inline `VCTR`
connectors, e.g.:
```
SECT01: JSRL SEG001 / SEG002 / SEG003 / SEG004 / RTSL
SECT09: JSRL SEG008 / VCTR 32,0 / JSRL SEG002 / VCTR 32,0 / JSRL SEG021 / RTSL
SECT11 = SEG019                 ; a one-segment section (alias)
```
All **24 segments `SEG001…SEG024`** (`598:101`) are used — every one is `JSRL`'d by some
section (e.g. `SEG019`→SECT11, `SEG020`→SECT12, `SEG022/023`→SECT14, `SEG024`→SECT07/16).
None are spare; the earlier "terrain glyphs we couldn't place" were just the segments seen
without the `SECT`→`LNMIN`→`MINTBL` indirection.

The on-screen order is the **`LNMIN`** table (`598:238`): `SECT01,02,…,16,` then **`SECT01,
02,03,04` again** (20 `JSRL`s) — that 4-section tail is the horizontal-wrap seam (the right
edge re-shows the start as you scroll). Each section's vertical placement is **`MINTBL`**
(`598:261`): `.WORD 896,384,656,576,224,368,864,1440,1088,640,64,64,448,96,64,640` (Y per
section). `MINTAB` (`598:282`) holds the scroll/centering values.

Our `screen.html`/`scroll_view.html` already render this **exact `LNMIN` sequence** —
verified: their tile list's per-section net-`dy` matches the `MINTBL` boundaries 1:1, all 16
(including the `SECT11`=`SEG019` flat). That was largely luck: the ROM stores `SECT01-16` in
the same order `LNMIN` plays them, so "address order" = play order; and the one out-of-order
insert (the flat pad at slot 11, added to match a MAME snapshot) landed exactly where
`SECT11` belongs. Only the **vertical scale** is still approximate — they fit the silhouette
into the snapshot band rather than the real `MINTBL` Y at DVG scale — so the faithful upgrade
is "drive Y from `MINTBL`", not reorder.

### The major (far/zoom-out) scape — GENERATED from the minor by `TRANS`

The major scape is **not** a separate stored terrain — `TRANS` (`MJRCON :362`,
"construct major scape") **generates it at runtime from the same minor `LNMIN` data**, as a
**¼-scale reduction**:

- **Input** `RAMLD = LNMIN` (`:3035`) — it walks the same minor section list → sections →
  segments.
- **Output** into VG RAM: `MJRLST` (`$44F0`, the major section JSRL list) and `MJRVG`
  (`$4500`, the major terrain vectors).
- **Transform = ÷4 + regroup.** Each copied `VCTR` has its scale field knocked down
  (`SBC I,20`, "VCTR TIMER subtract 2") so the rendered "DELTA X & DELTA Y DIVIDED BY 4"
  (`:3073-3074`; same ÷4 for `ALPH`, `:3067`), and **"4 MINOR SECTIONS = 1 MAJOR SECTION"**
  (`:3125`) — each 256-wide minor section becomes **64 wide** (`:3123`), four packed into one.
  So 4× more terrain fits the screen → the zoom-out. A second-half copy of the JSRLs
  provides the wrap, like `LNMIN`'s tail (`:3141-3151`).

So the **only major-specific *stored* data** is the position table `LUNMJ0` (`599:365`, in
`034599` — the major analog of `MINTBL`, "absolute scape section origins" `:1082`) plus the
bonus-site tables (`TBLABS`/`TBVCTR`). The terrain *shape* is reused from minor, just shrunk.
`SCAPE`'s major branch (`:1107`) draws `LUNMJ0` (LABS) + `MJRLST` (JSRLs into `MJRVG`).

| | minor scape (zoom-IN) | major scape (zoom-OUT) |
|---|---|---|
| section order / JSRLs | **`LNMIN`** — stored in ROM | **`MJRLST`** (`$44F0`) — *built by `TRANS`* |
| section relief / vectors | the `SECT`/`SEG` shapes — stored | **`MJRVG`** (`$4500`) — *built by `TRANS`, ¼-scale* |
| section positions / LABS | **`MINTBL`** — stored | **`LUNMJ0`** — stored (in `034599`) |

**Demo upshot:** to draw the major (zoom-out) scape we need no new terrain data — render exactly
what `landscape.html` already draws (the minor `LNMIN` terrain) at **¼ DVG scale, 4 sections
packed into one**, positioned by `LUNMJ0`. That *is* the major scape, which is why the two
zoom levels share an identical silhouette.

### 3.1 The terrain is FIXED — not level- or difficulty-dependent

There is **one** lunar surface, the same for every play and every difficulty. `SCAPE`
(`:1093`) loads the terrain tables as fixed immediate addresses (`LDA I,LNMIN&0FF`,
`LDA I,MINTBL&0FF`) and **never reads `PLYMOD`** (the difficulty) or any per-play index.

- **Difficulty** = `PLYMOD` (`:201`, 0–3 = training/cadet/prime/command, cycled by the
  SELECT button in `TYPE` `:687`) changes only the **physics** — gravity, thrust, fuel,
  rotation (`:350`, `:871`; `research_physics.md` §7). It does **not** touch the terrain.
- **There is no "level"** — Lunar Lander is one continuous play session (land/refuel until
  fuel runs out), not discrete stages.
- **`LUNARNUM`** (`:232`, "LUNARSCAPE NUMBER") is **not** a terrain selector — its V-bit is
  the **zoom state**: `SCAPE` `BIT LUNARNUM / BVS MAJOR` (`:1098`) picks **minor scape**
  (the zoomed-**IN** close-up near landing — `LNMIN`+`MINTBL`, big lander) vs **major scape**
  (the zoomed-**OUT** wide view you fly in most of the time — `LUNMJ0`+`MJRLST`, little lander).
  That is the approach zoom, altitude-driven, not a different map.

So what varies the *view* is **zoom** (`LUNARNUM` minor/major) and **horizontal scroll**
(which slice of the wrapping surface is centred) — never the terrain *data*. This resolves
the CLAUDE.md open item "*whether difficulty reshuffles the terrain segments*": it does not.

**Plain-language gloss — the ROM names are backwards-feeling, so prefer zoom-out/zoom-in:**
the **major scape = the zoomed-OUT wide view** (small "little" lander, the whole rolling
surface on screen — e.g. the MAME `0001` frame), and the **minor scape = the zoomed-IN
close-up** at landing (big lander, a small magnified slice). The labels track *how much
moon-area is on screen* (major = large area), **not** zoom or feature size — the opposite of
what "minor" suggests. Confirmed four ways: the game boots high in major (`:672`), the little
lander ⇒ major (`M.OFFS :1283`), the touchdown check runs only in minor (`:2794`), and the
small-lander MAME `0001` snapshot is the zoom-out (major) view. **So `demos/landscape.html`'s
wide overview IS the zoom-out (major-scape) view** — even though it's drawn from the
`LNMIN`/`MINTBL` tables the ROM happens to label *minor scape*: those tables are just the
terrain *definition*, and the zoom-out view renders that same surface.

### 3.2 The tables: `LNMIN` is code, `MINTBL`/`MINTAB` are data

The three terrain tables (`598:234-297`) are two different *kinds* of thing:

```asm
LNMIN:  JSRL SECT01-VGRAM   ; the section ORDER, as executable DVG code
        JSRL SECT02-VGRAM   ;   one JSRL ("jump-subroutine, long") per section
        ... (SECT03 … SECT16)
        JSRL SECT01-VGRAM   ; ┐ 4-entry "wrap tail": repeats the first sections so a
        JSRL SECT02-VGRAM   ; │ scroll window crossing the loop seam never runs dry
        JSRL SECT03-VGRAM   ; │  → 20 entries (16+4), 2 bytes each
        JSRL SECT04-VGRAM   ; ┘
MINTBL: .WORD 896.,0        ; per-section POSITION, as data: (Y baseline, X)
        .WORD 384.,0        ;   "(MODIFIED)" — scroll patches X in at runtime
        ... (16 pairs, 4 bytes each)
MINTAB: .WORD 872.          ; per-section scroll/centre value; each = MINTBL − 24
        ... (16 words)
```

- **`LNMIN` is not an array of section numbers — it is a DVG subroutine.** A flat list of
  `JSRL` *call instructions*, one per section, in play order. The DVG executes it; the order
  is encoded as the order of the calls. `-VGRAM` (= `−$4000`) rebases each ROM address into
  the DVG's VG-RAM-relative addressing.
- **`MINTBL` is plain `.WORD` data** — 16 LABS (load-absolute) coordinate pairs `(Y, X)`. The
  varying first word is the section's Y baseline (= the cumulative-`dy` boundaries); the `0`
  is an X placeholder. The header tag `(MODIFIED)` is literal: the scroll code patches these
  before they enter the live display list.
- **`MINTAB`** is the per-section scroll/centre value, exactly `MINTBL − 24` for every entry.

`LNMIN` and `MINTBL` are **parallel arrays** indexed by play-position *k*: `MINTBL[k]` says
*where* the *k*-th section sits, `LNMIN[k]` says *which* section it is. `SCAPE`/`SCRLDO`
(`:1093`) weaves them into the per-frame VG-RAM list as alternating **`LABS` (from `MINTBL`,
scrolled by `MINTAB`) then `JSRL` (from `LNMIN`)** — position a section, draw it, repeat:

```
LABS(0,896) · JSRL SECT01 · LABS(256,384) · JSRL SECT02 · LABS(512,656) · JSRL SECT03 · …
```

(The 20-vs-16 length mismatch is the wrap: `LNMIN`'s 4 tail entries reuse `MINTBL[0..3]`
one loop-width over.) *Not yet traced: `SCRLDO`'s exact LABS bit-packing / how the X word is
patched — the structure above is from the table values + the `(MODIFIED)` tag, not the
scroll routine's bit math.*

### 3.3 Drawing it: `landscape.html` (derived) vs `screen.html` (calibrated)

Both demos chain the same sections and get the same terrain *shape*; they differ entirely
in how a DVG `y` becomes a screen `y` — `landscape.html` derives it from the source,
`screen.html` was calibrated to a MAME frame (before the source was found; kept as-is).

**`screen.js` — Y stretched to fit a measured snapshot band:**
```js
const c = { x: 0, y: 0 };                      // cursor starts at 0 — MINTBL never used
// … chain tiles, find the terrain's own min/max:  e = min fy,  d = max fy
const TERRAIN_TOP = 404, TERRAIN_BASE = 739;   // hardcoded pixels, eyeballed from the MAME frame
const sy  = (TERRAIN_BASE - TERRAIN_TOP) / (d - e);   // a SEPARATE vertical scale, ≠ X scale
const yAt = y => TERRAIN_BASE - (y - e) * sy;  // lowest valley → 739px, highest peak → 404px
```
The vertical scale `sy` is independent of the X scale and is sized so the terrain's
`[min,max]` exactly fills the pixel band `[404…739]` — two numbers *measured off the
screenshot*, not computed. Absolute `MINTBL` Y is irrelevant (cursor at 0). It reproduces
*how tall the terrain looked in the cabinet photo*.

**`landscape.js` — Y is the real `MINTBL` coordinate at a uniform scale:**
```js
const cur  = { x: 0, y: MINTBL_Y[0] };         // cursor starts at MINTBL[0]=896 — real baseline
// … chain; every boundary lands on its MINTBL value (the faithful ✓ check)
const BASE = Math.min(W/LOOP_W, (H-2*PAD)/(yMax-yMin));   // ONE scale for X and Y
const yOf  = y => H - PAD - (y - yMin) * scale;            // scale = BASE × zoom (same as X)
```
The vertical scale equals the X scale (uniform → true DVG aspect), and the Y values *are*
the `MINTBL`-anchored ROM coordinates. It reproduces *how tall the ROM data says it is*.

| | vertical scale | absolute Y ref | nature |
|---|---|---|---|
| `screen.js` | separate `sy`, sized to fill a measured band `[404,739]` | starts at 0; `MINTBL` unused | **calibrated** to the MAME snapshot |
| `landscape.js` | **same** scale as X (uniform, true aspect) | starts at `MINTBL[0]`; Y *is* `MINTBL` | **derived** from the source |

They look close — `screen`'s band gives `sy ≈ 335/1376 ≈ 0.243` vs an X scale `~0.25`, so the
photo's apparent aspect was nearly the true one — but conceptually opposite. Had the cabinet's
vertical scale differed (overscan, in-game zoom, non-square pixels), the two would visibly
diverge: `screen` tracks the photo, `landscape` the bytes.

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
