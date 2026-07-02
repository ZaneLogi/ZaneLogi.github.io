# glossary.md — lunar_lander

Expansions for the terse 6502 / DVG labels that appear across the source, the
research docs, and `CLAUDE.md`. The **meaning** column is the original source's
own inline comment wherever one exists (that comment *is* the authoritative
expansion); a few letter-expansions marked **≈** are inferred from the naming
scheme and are not spelled out in the source.

Citations: `:nnn` = a line in the program source `A34573.1A`; `598:`/`599:` =
the labeled vector-ROM sources `A34598.1B` / `A34599.1C`; `VECMAC` =
`VECMAC.XX`. All in `D:\tmp\lunar_lander_source\` (per-PC — see `CLAUDE.md`).

## The naming scheme (once seen, they decode themselves)

Labels are **dropped-vowel** stems + a *scape tag* + a *role suffix*:

| Fragment | Means | | Fragment | Means |
|---|---|---|---|---|
| `LN` / `LUN` | **LUN**ar | | `TBL` | **T**a**BL**e |
| `MIN` | **MIN**or scape (zoom-IN) | | `TAB` | **TAB**le |
| `MJR` / `MJ` | **MaJoR** scape (zoom-OUT) | | `LST` | **L**i**ST** |
| `SCP` / `SCAPE` | luna**r-SCAP**e (terrain) | | `VG` | **V**ector-**G**enerator (VG-RAM) |
| `STR` | **ST**a**R**field | | `FLG` | **FL**a**G** |
| `VCTR` | **V**e**CT**o**R** | | `CNT` | **C**ou**NT** |

**Watch out:** the ROM's `MINOR`/`MAJOR` labels are about *how much moon-area
is on screen*, so they read backwards — **minor scape = zoomed-IN close-up**
(big lander, landing), **major scape = zoomed-OUT wide view** (little lander,
most of the flight). See `research_vector_usage.md` §3.1.

## Source files & linked modules

| Label | Expansion / meaning |
|---|---|
| `A34573.1A` | The main program source (6502), by Rich Moore (`:1-4`). `.1B/.1C/.1D` = linked modules. |
| `LUNAR` | main game module (link string `:31`). |
| `LUNVCT` | **LUN**ar **V**e**CT**or code (physics/vector math module, `:31`). |
| `LUNCON` | **LUN**ar **CON**trol module (`:31`). |
| `LUNINT` | **LUN**ar **INT**errupt (NMI) module (`:31`). |
| `A34598.1B` = `LUNMIN` | **LUN**ar **MIN**orscape VG-ROM source — terrain sections/segments, starfields, the `VECAN` font (`$5000-$57FF`). |
| `A34599.1C` = `LUNVEC` | **LUN**ar lander **VEC**tor-generator code — the two lander banks + explosion pieces (`$4800-$4FFF`). |
| `A34597.1A` | **FOREIGN-VERSION-ONLY** VG-ROM — foreign glyphs + `.ASCVG` strings (`$5800-$5FFF`); noise on a US cabinet. |
| `VECMAC` | **VEC**tor **MAC**ros — the DVG assembler macros (`LABS`/`VCTR`/…). |
| `VECAN` | **VEC**tor **A**lpha**N**umerics — the A-Z/0-9/colon font source (Ed Logg). |
| `LUNAR.MAP` | hardware I/O memory map. |

## DVG — Digital Vector Generator instruction mnemonics (`VECMAC`)

The CPU never draws; it assembles a **VG-RAM display list** of these and the
DVG hardware runs it. Full opcode/scale spec: `asteroids_clone/docs/research_dvg.md`.

| Mnemonic | Expansion / meaning |
|---|---|
| `DVG` | **D**igital **V**ector **G**enerator — the vector display chip (same as Asteroids). |
| `VG RAM` / `VG ROM` | **V**ector-**G**enerator RAM (`$4000`, the display list) / ROM (`$4800`, the shape library). |
| `LABS` | **L**oad **ABS**olute beam position; lower-left = `(0,0)`; also sets scale (`VECMAC:19`). |
| `VCTR` | draw **V**e**CT**o**R** — relative beam move `(dx,dy)` at intensity `ZZ` 0-15 (`VECMAC:73`). |
| `SVEC` | **S**hort **VEC**tor — the single-word compact `VCTR` encoding for small deltas (auto-selected by the `VCTR` macro; the font glyphs are `SVEC`+`RTSL`). |
| `JSRL` | **J**ump **S**ub**R**outine **L**ong — call a shape subroutine inside the DVG list (`VECMAC:41`). |
| `RTSL` | **R**e**T**urn from **S**ubroutine **L**ong (`VECMAC:52`). |
| `JMPL` | **J**u**MP** **L**ong within the DVG list (`VECMAC:62`). |
| `WAIT` | beam **WAIT** — let the beam settle; used after every `LABS` (`VECMAC:126`). |
| `HALT` | **HALT** the vector generator (end of frame list, opcode `B`) (`VECMAC:32`). |
| `ALPHA` | **ALPHA**numeric macro — emits one `JSRL CHAR.x` per character in a string (`VECMAC:144`). |
| `VGVCTR` | routine that emits a computed `VCTR` into VG-RAM (the beam-walk used by scape/explosion). |
| `VGBRIT` | **VG** **BRI**gh**T**ness value written into emitted vectors. |
| `VGON` / `VGHLT` / `VGCONT` | **VG ON** (`$3000`) / **VG HaLT** flag (`$2400`) / **VG CONT**inue (`$3800`) (`:67-69`). |

## Scape (terrain) — sections, tables, scroll

| Label | Expansion / meaning | Cite |
|---|---|---|
| `SCAPE` | luna**r-SCAPE** — the display-lunarscape routine; picks minor vs major on `LUNARNUM`. | `:1093` |
| `LNMIN` | **L**u**N**ar **MIN**or — pointer to the *minor scape section JSRL list* (`=$51BA`). | `:124` |
| `MINTBL` | **MIN**or scape **T**a**BL**e — the section `LABS` (position words). | `:125` |
| `MINTAB` | **MIN**or scape scroll-value **TAB**le. | `:126` |
| `SECT01…SECT16` | the 16 terrain **SECT**ions (each 256 wide, itself a JSRL list of segments). | `598:13` |
| `SEG001…SEG024` | the 24 reusable slope/flat **SEG**ments the sections `JSRL`. | `598:101` |
| `LUNMJ0` | **LUN**ar **MaJ**or (table **0**) — major scape section table (the equate `:107` says "section JSRL's", the `SCAPE` doc-block `:1082` says "absolute scape section origins"). | `:107` |
| `LNMJR` | **L**u**N**ar **MaJ**o**R** half-section `LABS`. | `:109` |
| `MJRLST` | **MaJoR** scape section `LST` (JSRLs) — built at runtime by `TRANS` (`=$44F0`). | `:90` |
| `MJRVG` | **MaJoR** scape **VG** vectors (`VCTRS`) — built by `TRANS`, ¼-scale (`=$4500`). | `:89` |
| `TRANS` | **TRANS**form — "construct major scape": walks `LNMIN`, ÷4 + 4-sections-into-1 → `MJRLST`/`MJRVG`. | `:362`, `:3035` |
| `MJRCON` | **MaJoR CON**struct — the call site that invokes `TRANS`. | `:362` |
| `LUNARNUM` | **LUNAR**scape **NUM**ber — the zoom state (V-bit: minor vs major), *not* a terrain index. | `:232` |
| `LUNAROT` | **LUNAR**scape r**OT**ate. | `:233` |
| `SCROLL` | horizontal **SCROLL** factor (`SCROLL+1` = 0-255, `SCROLL` = fraction). | `:234` |
| `SCRADD` | vertical **SCR**oll **ADD**er (vertical scroll factor). | `:235` |
| `MJRFLG` | lunar-scape scroll **FL**a**G** (≈ **MaJoR FLaG**). | `:236` |
| `SCRLDO` | **SCR**o**L**l-**DO** — performs the per-frame scape scroll. | `:1103`, `:1109` |
| `SCAPCHG` | **SCAPE CH**an**G**e — the zoom transition (minor↔major). | phys §9.1 |
| `SCAPMJR` / `SCRLUP` | **SCAPE-MaJoR** / **SCR**o**L**l-**UP** — sub-steps of the zoom-out transition. | phys §9.1 |
| `XSCPADD`/`XSCPSUB`, `YSCPADD`/`YSCPSUB` | **X/Y SC**a**P**e **ADD**/**SUB**tract — scroll accumulators. | phys §9.1 |
| `SCPDST` | **SC**a**P**e **DST** (distance) — used by collision/landing. | phys §9.2 |
| `RAMLD` | VG-**RAM L**oa**D** source pointer (`TRANS` sets it to `LNMIN`). | `:251`, `:3036` |

## Starfield

| Label | Expansion / meaning | Cite |
|---|---|---|
| `STARS` | the star-field routine (major/minor). | `:1121` |
| `MJSTRA` / `MJSTRB` | **MaJoR STa**rfield **A**/**B** (two y-bands, fixed `LABS`). | `:127-128` |
| `MINSTR` | **MIN**orscape **ST**a**R**field section JSRLs (near, scrolled). | `:129` |
| `MINSVG` | **MIN**orscape **S**tarfield section `LABS` (≈ minor-star VG). | `:130` |
| `STRINIT` | **ST**a**R** **INIT** — starfield init `LABS`. | phys §8 |

## Lander / module

| Label | Expansion / meaning | Cite |
|---|---|---|
| `MODULE` | the lunar-**MODULE** (lander) assembly routine — folds `SHIP` → pose + mirror. | `:1163` |
| `SHIP` | **SHIP** rotation (0-31, = 11.25°/step). | `:175` |
| `SHIPS` | **SHIP** module JSRLs — the near/large lander bank (`=$4BA2`). | `:105` |
| `ATRMOD` | a**T**t**R**act **MOD**ule LABS position. | `:106` |
| `LTLMOD` | **L**i**T**t**L**e **MOD**ules JSRLs — the far/little lander bank. | `:111` |
| `M.OFFS` | **M**odule **OFFS**et — picks the bank (`SHIPS` near / `LTLMOD` far) by zoom. | vec §4 |
| `SHPINV` / `SHPLP` | **SH**i**P** **INV**ert / **SH**i**P** **L**oo**P** — copy a pose's vectors, `EOR`-flipping delta signs to mirror it. | `:1242-1243` |
| `POSTMOD` | **POS**i**T**ion **MOD**ule — turn the ship's world position into the `LABS`. | `:1295` |
| `FRCMLT` | ≈ **F**o**RC**e **M**u**LT**iply — decompose `SHIP` rotation into thrust X/Y via `SINES`. | `:1758` |
| `SHPINE` | **SH**i**P** **INE**rtia value. | `:176` |
| `INERTIA` | **INERTIA** flag. | `:177` |
| `OCTGN` | ship **OCT**a**G**o**N** pictures (used in explosions). | `:116` |

## Explosion (`BOOM`)

| Label | Expansion / meaning | Cite |
|---|---|---|
| `BOOM` | the crash-explosion routine. | `:3340` |
| `PIECE1…PIEC12` | the 12 debris fragment glyphs (`$4F1C-$4FBE`). | `599:613` |
| `BOOMA{n}` / `BOOMB{n}` | the 4 hand-authored explosion piece velocity/glyph sets (`RNDOM` picks 1 of 4). | `:117-120` |
| `BOOMC1` | the piece death-time (wink-out) table (93/96/100/109/112/116/127). | expl doc |
| `INDEX` | **EXP**losion/abort sequence counter (1→127, +1 every other frame). | `:237` |
| `RNDOM` | **R**a**ND**o**M** — the 1-of-4 explosion-pattern pick. | expl doc |

## Physics / flight

| Label | Expansion / meaning | Cite |
|---|---|---|
| `THRUST` | rocket **THRUST** ×.05. | `:174` |
| `THRSTLV` / `THRLVL` | **THR**u**ST** **L**e**V**el (value / the routine that reads the throttle pot → `THRUST`). | `:180`, `:897` |
| `XTHRUST` / `YTHRUST` | **THRUST** X / Y (acceleration components). | `:239-240` |
| `TRSTAB` | **T**h**R**u**ST** **TAB**le — thrust magnitude per level. | phys §9 |
| `SINES` | **SINE**s table (rotation → X/Y decomposition). | phys §5 |
| `ACCEL` | **ACCEL**erate — integrate thrust + gravity into velocity. | `:1940` |
| `VELX` / `VELY` | **VEL**ocity X / Y. | `:247-248` |
| `SGNVLX` / `SGNVLY` | **S**i**GN** of **V**e**L**ocity X / Y (D7 = sign). | `:241-242` |
| `XCURR` / `YCURR` | ship X / Y **CURR**ent position (`LABS`). | `:181-182` |
| `XCURADJ` / `YCURADJ` | ship X / Y position, **ADJ**usted. | `:178-179` |
| `GRAVITY` / `GRAVT` | **GRAVITY** value / the per-difficulty **GRAV**i**T** table. | `:250`, phys §7 |
| `BURN` | **BURN** fuel = thrust level × fuel factor. | `:1794` |
| `FUEL` / `GAS` / `GASA` | remaining **FUEL** / fuel working value / fuel table. | phys §6 |
| `FRICTN` | **FRIC**tio**N** (difficulty-mode friction). | phys §7 |
| `ROTSHP` | **ROT**ate **SH**i**P** — apply rotation (skips during abort). | `:773` |
| `ROTCHK` | **ROT**ate **CH**ec**K** — read the rotate-left/right switches. | `:886` |
| `ROT` | **ROT**ate-ship debounce. | `:252` |
| `ROT.GAS` / `ROT.NI` | **ROT**ate fuel (**GAS**) / **ROT**ate **N**o-**I**nertia variant. | phys §5 |
| `DEDUCT` | **DEDUCT** (fuel) — the deduct-fuel message/count path. | phys §6 |
| `DECODE` | **DECODE** — walk the lander corners vs terrain for landing/crash distance. | `:2087` |
| `DISTYL` / `DISTYR` | **DIST**ance **Y L**eft / **R**ight (leg-to-terrain gap). | phys §9.2 |
| `COLFLG` | **COL**lision **FL**a**G** (`80`=good land, `C0`=hard, `8F`=crash). | `:243` |
| `M.CLFL` | **M**otion **C**o**L**lision **FL**ag. | `:249` |
| `M.HRDY` / `M.HRDG` | **M**otion **H**a**RD** landing **Y** velocity / **G**ravity (bounce thresholds). | `:53-54` |
| `POTVAL`/`POTMIN`/`PTRNGE`/`POTUSE` | throttle **POT** (potentiometer) **VAL**ue / **MIN** / **P**o**T RaNGE** / in-**USE**. | phys §4 |

## Game state, modes, input, credits

| Label | Expansion / meaning | Cite |
|---|---|---|
| `GAMODE` | **GA**me **MODE** (`0`=attract, `10`=free-play, `20`=RTP, `40`=play, `80`=land). | `:196` |
| `PLYMOD` | **PL**a**Y** **MOD**e = difficulty (0=easy…3=difficult); changes physics only. | `:201` |
| `DOGAME` | **DO-GAME** — top-level per-frame dispatch on `GAMODE`. | `:332` |
| `ATRINIT` / `PLYINIT` | a**T**t**R**act **INIT** / **PL**a**Y** **INIT**. | `:587`, `:609` |
| `PLYSTRT` | **PL**a**Y** **ST**a**RT**. | `:361` |
| `TYPE` | **game TYPE** select (the SELECT button; cycles `PLYMOD`). | `:687` |
| `CREDIT` | coin/**CREDIT** handling. | `:720` |
| `LANG` | **LANG**uage number (0=English…3=German). | `:191` |
| `OPT0…OPT3` | operator **OPT**ion DIPs (coin modes, free-play, foreign lang, coin mech #2). | `:94-97` |

## HUD / display

| Label | Expansion / meaning | Cite |
|---|---|---|
| `DISPLY` | **DISPL**a**Y** — draw the numeric HUD values. | `:3258` |
| `VGMSGA` | **VG** **M**e**S**sa**G**e/character JSRLs (font glyph table). | `:138` |
| `DATAVG` | player numerical **DATA** offset **V**e**C**tors. | `:133` |
| `MESSG` / `MSSGLBS` | **MESS**a**G**e alpha-string JSRLs / **MESSaGe LaBS**. | `:131-132` |
| `XARROW` / `YARROW` / `STARRW` | horizontal / vertical speed-**ARROW** JSRLs / start-**ARR**o**W**. | `:134-136` |
| `$5458` | the 75-JSR HUD label composite (`SCORE TIME FUEL ALTITUDE HORIZONTAL/VERTICAL SPEED`). | see `CLAUDE.md` |

## Constants & timing

| Label | Expansion / meaning | Cite |
|---|---|---|
| `FUELFAC` / `FLFAC2` | **FUEL FAC**tor / fuel factor for game #2. | `:48-49` |
| `FLMFRC` | **FL**a**M**e **FR**a**C**tion. | `:50` |
| `FLFACT` | **F**ue**L FACT**or (8 fuel/units/sec). | `:58` |
| `BNFUEL` | **B**o**N**us **FUEL**. | `:55` |
| `FRMECNT` | **FR**a**ME C**ou**NT** (frame length = 24 ms). | `:56` |
| `SECCNT` | **SEC**ond **C**ou**NT** (250 × NMI at 4 ms). | `:59` |
| `ABTCNT` / `ABTMIN` | a**B**or**T C**ou**NT** / abort **MIN** count. | `:51-52` |
| `SOFTWD` | **SOFT**ware **W**atch**D**og byte. | `:47` |

## I/O & memory regions (`LUNAR.MAP`)

| Label | Expansion / meaning | Cite |
|---|---|---|
| `NMI` | **N**on-**M**askable **I**nterrupt — the 4 ms frame tick. | `:25` |
| `POTIN` | throttle **POT INput** (`$2C00`). | `:87` |
| `ROTRHT` / `ROTLFT` | **ROT**ate **R**ig**HT** / **L**e**FT** switches (`$2406/7`). | `:85-86` |
| `ABORTSW` / `STARTSW` / `TYPESW` | **ABORT** / **START** / game-**TYPE** **SW**itches. | `:79-84` |
| `NOISE` / `NSREST` | **NOISE** (sound) trigger (`$3C00`) / **N**oi**S**e **RES**e**T** (`$3E00`). | `:76-78` |
| `WATCH` | **WATCH**dog (`$3400`). | `:77` |
| `PROG` | **PROG**ram ROM base (`$6000`). | `:101` |

---

*Meanings quoted from the source's own inline comments are authoritative;
entries marked **≈** expand the letters by the naming scheme (§ "naming
scheme") where the source gives a function comment but not a spelled-out name.
Cross-refs: `research_vector_usage.md` (scape/lander/starfield),
`research_physics.md` (flight/collision/zoom — cited `phys §`),
`research_explosion.md` (BOOM — cited `expl`).*
