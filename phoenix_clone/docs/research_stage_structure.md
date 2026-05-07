# Phoenix Stage / Wave Structure — Verified Specification

Source-of-truth: a local clone of the computerarcheology.com Phoenix
project (Z80/8085 hybrid listing produced from the original ROM).

- **Disassembly** — `D:\tmp\computer_archeology_phonenix\content\Arcade\Phoenix\Code.md`
  (full 8085 listing with labels like `L0515`, `T0598`, `T1760`).
- **RAM map** — `D:\tmp\computer_archeology_phonenix\content\Arcade\Phoenix\RAMUse.md`
  (every label in this doc resolves there).
- **Journal** — `D:\tmp\computer_archeology_phonenix\content\Arcade\Phoenix\Journal.md`
  (Peter's research notes).

Every claim is tagged **[verified]** with an address citation
(e.g. `Code.md:$0515` / `RAMUse.md:$43AB`), **[inferred]** when
reasoning beyond the source, or **[uncertain]** when the source itself
is unclear.

---

## 1. Top-level state machine (`GameState` at `$43A4`)

A single byte at `$43A4` (`GameState`, `RAMUse.md:$43A4`) selects one of
8 top-level routines through the jump table at `$040E` (`T040E`).
Dispatcher at `Code.md:$0400`:

```
0400: lxi h, $040e            ; T040E base
0403: ldax $43a4              ; GameState (0..7)
0406: rlca                    ; *2 → 16-bit pointer index
...                           ; pchl through table at $040E
```

| GameState | Handler | Purpose |
|-----------|---------|---------|
| 0         | `$0430` | New game start / init demo vars |
| 1         | `$04AC` | Flashing of "SCORE 1" / "SCORE 2" |
| 2         | `$0515` | Init of game and level data (per-stage init) |
| 3         | `$0800` | Normal gameplay (dispatches to JT4 by stage) |
| 4         | `$0AEA` | Player-ship particle explosion |
| 5         | `$0B60` | "GAME OVER" text |
| 6         | `$2400` | Mothership particle explosion |
| 7         | `$244C` | Mothership score display |

[verified, `Code.md:$040E`]

The fact that mothership-explosion (6) and mothership-score (7) are
**top-level GameStates rather than sub-states of state 3** is the most
important architectural fact for our port. The mothership stage is
fundamentally different from the other stages: when the mothership dies,
control leaves "normal gameplay" entirely and goes to a dedicated state.

---

## 2. Stage selector (`v43b8` / `LevelAndRound` at `$43B8`)

A single byte at `$43B8` packs stage and round:

```
bits 0-3 : stage within round (0..15, but only 0..A used in the wave cycle)
bits 4-7 : round number (loop counter)
```

[verified, `RAMUse.md:$43B8`: "Bit0-3 game level, bit4-7 game round"]

Bit 1 of the same register also doubles as the **video-palette select bit**
— `SetBitsVideoRegister` at `Code.md:$041E` reads `$43B8`, masks `$02`,
and writes to the `$5000` video register. In practice the palette
therefore alternates with stage parity (background color shifts each
stage).

---

## 3. The stage cycle — JT4 dispatch at `$0800`

Inside GameState 3 ("normal gameplay"), the per-frame routine at `$0800`
indexes JT4 by `bits 0-3 of $43B8` [verified, `Code.md:$0800-$080F`]:

```
0800: lxi  h, $0814           ; T0814 (JT4) base
0803: ldax $43b8              ; stage byte
0806: rlca                    ; *2
0807: ani  $1e                ; mask to even offset 0..0x1E (16 entries)
0809: add  l                  ; ... pchl
```

The 16-entry JT4 table `T0814` at `Code.md:$0814`, with the
disassembly's own per-entry comments:

| Stage | Handler | Purpose (verbatim from `Code.md:$0814`)                                  |
|-------|---------|--------------------------------------------------------------------------|
| 0x0   | `$0834` | "stars scrolling down and 'aliens fade in'"                              |
| 0x1   | `$2000` | "'player alife' with aliens, after 'fade in'" (small-alien combat)       |
| 0x2   | `$0834` | "stars scrolling down and 'aliens fade in'"                              |
| 0x3   | `$2000` | "'player alife' with aliens, after 'fade in'" (extra `AbovePlayerBullet`) |
| 0x4   | `$2230` | "'spiral fill'" (wipe-to-birds intro)                                    |
| 0x5   | `$3400` | "birds level including 'fade in'" (phoenix-bird combat)                  |
| 0x6   | `$2230` | "'spiral fill'"                                                          |
| 0x7   | `$3400` | "birds level including 'fade in'"                                        |
| 0x8   | `$2230` | "'spiral fill'" (wipe-to-mothership intro)                               |
| 0x9   | `$22B4` | "mothership 'fade in'"                                                   |
| 0xA   | `$22CA` | "mothership and aliens 'fade in'"                                        |
| 0xB   | `$2000` | "'player alife' with aliens AND mothership, after 'fade in'" (combat)    |
| 0xC-F | `$224C` | **"not used in this context"** (label inside `$2230`; see §3.2)          |

[verified, `Code.md:$0814-$0832` — these comments are in the source file
itself, not English glosses on top of it.]

So the per-stage handler set is just five distinct functions: `$0834`
(alien fade-in), `$2000` (alien/mothership combat), `$2230` (spiral
fill / wipe), `$3400` (bird combat), and the two mothership fade-in
variants `$22B4` / `$22CA`. The "stage" granularity is 16 slots but
only slots 0..B are reachable in normal play.

`$224C` is **not a separate routine** — it is a label *inside* the
spiral-fill routine at `$2230` (`Code.md:$224C`). The fact that JT4
slots C/D/E/F point to it is dead code; control never reaches stage
0xC because mothership-clear loops back via GameState 7 (see §3.2).

### 3.1 Reading the cycle as 5 player-visible "stage types"

The arcade-history claim of **"5 stage types"** maps cleanly onto the
12 reachable JT4 entries [inferred]:

| Player-visible stage type | Reachable JT4 stages | Notes                                |
|---------------------------|----------------------|--------------------------------------|
| 1 — small alien wave 1    | 0x0 (intro) + 0x1    | 16 small aliens fade in, attack      |
| 2 — small alien wave 2    | 0x2 (intro) + 0x3    | Same enemies, formation variant      |
| 3 — phoenix-bird wave 1   | 0x4 (intro) + 0x5    | 8 large birds, eggs hatch            |
| 4 — phoenix-bird wave 2   | 0x6 (intro) + 0x7    | Larger birds, swooping               |
| 5 — mothership            | 0x8 (intro) + 0x9 (descend) + 0xA (alien fade-in) + 0xB (combat) | Boss ship + 8 attendant aliens |

So one **complete loop = 12 JT4 increments**, not 16, and the mothership
phase is unusual: it has three distinct intro stages (spiral wipe →
mothership fade-in → alien fade-in) before combat at 0xB.

### 3.2 Cycle wrap and round increment

There are **two** stage-advance paths, both serving as "stage cleared":

1. **Alien-wave path** (`Code.md:$084E-$0855`, called from the `$0834`
   intro and via `$2000`'s frame-end check): `inr ($43B8)` then
   `GameState = 2`. This walks 0x0 → 0x1 → 0x2 → 0x3 → 0x4 (which
   triggers spiral fill) → ...

2. **Bird/mothership-wave path** (`Code.md:$2204`, called from `$3400`
   bird combat at `$21BA`/`$21BC` and from the mothership-combat
   handler at `$346D`): decrements the secondary countdown `$43B6`,
   and once it underflows below `$A0` does `inr ($43B8)` and
   `GameState = 2`. It also peeks `T1760` (see §4.2) to decide
   whether the *next* stage gets `AliensLeft = 16` or
   `BirdsLeft = 8`.

3. **Mothership-clear path** (GameState 7, `Code.md:$245A-$2461`):
   when the mothership is destroyed, control reaches state 7 which
   does `($43B8) = ($43B8 & 0xF0) + 0x10` — i.e. **stage nibble is
   forced to zero and round nibble is incremented in one shot**, with
   `AliensLeft = 16` and GameState = 2.

That third path is the answer to "do stages 0xC-0xF run?" — they
don't. The mothership stage exits via GameState 6 → 7 → next round's
stage 0, never touching slots 0xC-0xF. The natural carry from `inr
($43B8)` at slot 0x0F → 0x10 is therefore **also dead** in normal
play; only the GameState 7 path advances the round.

The round nibble (bits 4-7) is read in several places to scale
difficulty — see §8.

---

## 4. Per-stage init flow (GameState 2 at `$0515`)

When a stage clears, the corresponding stage-clear path writes
`GameState = 2`. On the next frame the JT1 dispatcher routes to
`$0515`, which performs per-stage init. Verbatim from
`Code.md:$0515-$052F`:

```
0515: call $041e        ; SetBitsVideoRegister (palette from $43B8 bit 1)
0518: lxi  h, $43a4     ; GameState
051B: mvi  m, $03       ;   := 03 (next state = JT4 gameplay)
051D: call $0580        ; InitGlobalLevelData — copy 12-byte block to $43AB-$43B6
0520: call $0547        ; InitPlayerDataStructure — copy 32 bytes T0560 → $43C0
0523: call $09a0        ; map player + bullet grid coords to screen-RAM addresses
0526: call $0532        ; init alien data ($4B50-$4BEF) for new level/round
0529: call $0a6c        ; map alien grid coords to screen-RAM addresses
052C: call $0506        ; clear $4392-$4397, init $4394
052F: jmp  $32b0        ; clear $4350-$437F + $439A-$439D, set up bird init data
```

The key calls for stage parameterisation are `$0580` (per-stage
12-byte RAM block, decoded in §4.1) and `$0532` (which calls
`$05EC` `InitAlienControlStates`, `$0650` alien movement-pattern
pointers, and `$0610` `InitAlienPositions`).

### 4.1 Per-stage parameter copy at `$0580`

The routine `InitGlobalLevelData` at `Code.md:$0580` reads the stage
nibble and copies a 12-byte block from a per-stage table to RAM
`$43AB..$43B6`:

```
0580: lxi  h, $0598       ; T0598 dispatch table base
0583: ldax $43b8          ; stage byte
0586: ani  $0f            ; keep low nibble (stage-in-round)
0588: add  l              ; offset into table
0589: mov  l, a
058A: mov  l, m           ; fetch pointer LO from T0598
058B: mvi  h, $05         ; pointer HI is fixed at $05
058D: lxi  d, $43ab       ; destination RAM
0590: mvi  b, $0c         ; 12 bytes to copy
0592: call $05e0          ; CopyBbytesHLtoDE
0595: ret
```

The dispatch table `T0598` at `Code.md:$0598` (16 bytes, one LSB per
stage 0-F):

```
0598: A8 A8 C0 C0 A8 A8 A8 A8 B4 CC B4 B4 A8 A8 A8 A8
```

These are `$05xx` pointers; the 16 stages share **only 4 unique blocks**.
Per the source comments (`Code.md:$05A0-$05A6`):

| Block at | Used by stages | Source-comment role          |
|----------|----------------|------------------------------|
| `$05A8`  | 0, 1, 4, 5, 6, 7, C-F | alien wave 1, blue-bird wave, pink-bird wave |
| `$05B4`  | 8, A, B        | mothership wave             |
| `$05C0`  | 2, 3           | alien wave 2                |
| `$05CC`  | 9              | mothership wave (descend)   |

The 12 bytes per block are:

```
                        $43AB $43AC $43AD $43AE $43AF $43B0 $43B1 $43B2 $43B3 $43B4 $43B5 $43B6
$05A8 (alien/bird):      80    7F    00    00    40    3F    00    1C    00    FF    FF    FF
$05B4 (motherCfg+aliens):60    5F    01    02    30    2F    00    1C    00    C0    FF    FF
$05C0 (alien wave 2):    80    7F    03    04    40    3F    00    1F    00    A0    FF    FF
$05CC (mothership intro):60    60    05    06    50    30    00    1D    00    48    FF    FF
```

**Decoded per-byte meaning** (cross-referenced against every
`($43AB)..($43B6)` access in the listing):

| Offset | RAM    | Label / role                                              | Used by                                       |
|--------|--------|-----------------------------------------------------------|-----------------------------------------------|
| 0      | `$43AB`| Planet-trigger value (compared to `CounterB9`)            | `AddPlanetsToBackground` `Code.md:$06B0-$06B7`|
| 1      | `$43AC`| Planet-trigger increment (added to `$43AB` on each hit)   | `Code.md:$06B9-$06BD`                         |
| 2      | `$43AD`| Planet-row index (`INC` per planet, drives `T1E20` lookup)| `Code.md:$06BE-$06C1`                         |
| 3      | `$43AE`| Planet-shape index (`INC` per planet, drives `T1E60`)     | `Code.md:$06C2-$06C5`                         |
| 4      | `$43AF`| Galaxy-trigger value (compared to `CounterB9`)            | `AddGalaxiesToBackground` `Code.md:$2040-$2048`|
| 5      | `$43B0`| Galaxy-trigger decrement (subtracted from `$43AF`)        | `Code.md:$204A-$204D`                         |
| 6      | `$43B1`| Unused (only consumer is dead routine at `$0670`)         | (none)                                        |
| 7      | `$43B2`| MSB of background-fill source (T1C00/T1D00/T1F00)         | `StarsScrollDown` `Code.md:$0693-$0698`       |
| 8      | `$43B3`| LSB of background-fill source (auto-advanced by `$06A9`)  | same                                          |
| 9      | `$43B4`| `CounterB4` — **alien-wave countdown** (FF→0 = stage clear)| `Code.md:$0834,$0848,$22B4,$22CA`            |
| 10     | `$43B5`| Unused — always `FF` in all 4 blocks                       | (none located)                                |
| 11     | `$43B6`| **Bird/mothership-wave countdown** (FF→`$A0` = stage clear)| `Code.md:$2204` `L2204`                       |

Notes from this decoding:

- The first six bytes (`$43AB-$43B0`) are entirely about **starfield
  decoration timing**, not gameplay. They control how often
  background-screen "planets" (2x2 tiles from `T1E20`) and "galaxies"
  (1x1 tiles from `T1E80`) get sprinkled into `BackgroundScreen` as
  `CounterB9` ticks. Different blocks → different planet density.
- `$43B2:$43B3` selects which **background tile bank** is used while
  scrolling stars: T1C00 (`$1C` = block A8), T1F00 (`$1F` = block C0),
  T1D00 (`$1D` = block CC). Block B4 also uses `$1C`. So this is the
  per-stage "what does the starfield look like" pointer.
- `$43B4` and `$43B6` are the **two stage countdowns**. `$43B4` is
  decremented in `$0834` (alien fade-in / stage 0,2) and in `$22B4` /
  `$22CA` (mothership fade-in stages 9,A). `$43B6` is decremented in
  `$2204` (bird-combat and mothership-combat per-frame check).
- Initial `$43B4` values: `FF` (alien stages, max wait), `C0` (block
  B4, mothership-fade), `A0` (block C0, alien wave 2), `$48` (block
  CC, mothership descend — short countdown). `$22B4` exits its
  fade-in when `$43B4 == $28`; `$22CA` exits when `$43B4 == $C0` and
  then resets `$43B4` to `$30`.
- `$43B6` starts at `FF` in all 4 blocks; `$2204` advances the stage
  once `$43B6` underflows below `$A0` (i.e. ~96 frames ≈ 1.6 s in
  total, but the per-frame decrement only runs when `$2204` is
  reached, which happens conditionally inside bird/mothership combat
  — so the effective wait depends on when combat starts ticking it).

[verified, all addresses checked against the listing.]

### 4.2 Enemy formation table (`$1540`-`$15FF`) and the `T1760` partition

The actual alien starting positions live at `T1540+` in
`Code.md:$1540-$15FF`. There are 8 sub-tables (`$1540, $1560, $1580,
$15A0, $15C0, $15E0, $1600, $1620`) of 16 `(X, Y)` pairs each. They
are not indexed directly by the stage nibble — they are indexed via
the `T063A` LSB table (`Code.md:$063A`):

```
063A: 60 40 E0 E0 E0 E0 FF FF   ; round 1: LSBs for T1560, T1540, T15E0...
0642: C0 A0 80 80 80 80 FF FF   ; round 2: LSBs for T15C0, T15A0, T1580...
```

`InitAlienPositions` (`Code.md:$0610`) takes `LevelAndRound`, rotates
right (so bit 4 of the round nibble selects between the two rows of
`T063A`), masks to bits 0-3, and uses that as the LSB index. So
**stage layout depends on round as well as stage** — round 1 uses one
set of formations, round 2+ uses another. `AliensLeft` (default 16) is
preserved across this; the table just gives the starting `(X, Y)`
positions.

The partition between alien-stage and bird-stage is in `T1760` at
`Code.md:$1760`:

```
1760: 10 10 88 88 10 10 10 10
```

Indexed by `(LevelAndRound & 0x0E) >> 1` (level pair 0..7) **after**
the stage-clear `inr ($43B8)` in `$2204`. A positive byte (`$10`) sets
`AliensLeft = 16`; a negative byte (high bit set, `$88`) sets
`BirdsLeft = byte & $7F = 8`. Source comment: "Parity table and
initial number of aliens/birds for levels: odd, odd, even (P), even
(P), odd, odd, odd, odd". So pairs 2-3 (stages 4-7) are bird stages
with 8 birds; all other pairs are alien stages with 16 aliens.

### 4.3 The two-phase enable

Like Galaga, Phoenix splits stage init from "go" via the GameState
machine itself: `$0515` finishes by setting `GameState = 3`, but
gameplay only starts on the **next** frame when the JT1 dispatcher routes
through state 3. There is no explicit `_b_atk_wv_enbl`-style flag — the
state-machine is the gate. [verified, hhi `$051B`.]

---

## 5. Stage-clear detection

There are **two timer-based stage-clear paths** plus a third event-
based path for the mothership.

### 5.1 Alien-stage path — `$0834 / $084E`

The fade-in handler at `Code.md:$0834-$0855` is reached on JT4 stages
0 and 2 (the `aliens fade in` intro). It decrements `$43B4`
(`CounterB4`, byte 9 of the per-stage block) every frame; when
`$43B4` hits 0 it does:

```
084E: mvi  l, $b8           ; HL → $43B8
0850: inr  m                ; ++stage
0851: mvi  l, $a4           ; HL → $43A4
0853: mvi  m, $02           ; GameState := 2 (re-init for next stage)
0855: ret
```

So alien fade-in stages clear after a fixed number of frames (`$FF`
from block `$05A8`, `$A0` from block `$05C0`).

### 5.2 Bird/mothership-stage path — `$2204`

The bird-combat handler at `$3400` and the mothership-combat handler
at the `$346D` exit both eventually call `Code.md:$2204` (`L2204`),
which decrements `$43B6` (byte 11 of the per-stage block, always
initialised to `$FF`). Once `$43B6 < $A0` it does:

```
220C: mvi  l, $a4           ; GameState := 2
220E: mvi  m, $02
2210: mvi  l, $a6           ; ShieldCount := 0 (drop player shield)
2212: mvi  m, $00
2214: mvi  l, $b8           ; ++LevelAndRound
2216: inr  m
...                         ; then look up T1760 to set AliensLeft or BirdsLeft for next stage
```

So bird stages and mothership-combat stages also clear by countdown,
but with a separate counter (`$43B6`) and a separate per-stage exit
routine that *also* drops the player shield and pre-initialises
`AliensLeft`/`BirdsLeft` for the next stage from `T1760`.

`AliensLeft` (`$43BA`) and `BirdsLeft` (`$43BB`) drive scoring,
bonus-life thresholds, and the "less-than-5 aliens" speed-up flag
(`$435E AliensLeft<5`), but they do **not** themselves drive
stage-clear. The countdown alone determines when a stage ends.

### 5.3 Mothership-clear path — GameState 6 → 7

When the mothership is hit and destroyed, control jumps to GameState
6 (`Code.md:$2400` "Mother ship partikel explosion"), then to
GameState 7 (`Code.md:$244C` "Mother ship score display"). The end of
GameState 7 (`Code.md:$2457-$2466`) does:

```
2457: dcr  l               ; HL → $43A4
2458: mvi  m, $02          ; GameState := 2
245A: mvi  l, $b8          ; HL → $43B8
245C: mov  a, m
245D: ani  $f0             ; clear stage nibble
245F: adi  $10             ; ++round nibble
2461: mov  m, a            ; store
2462: mvi  l, $ba          ; AliensLeft := 16
2464: mvi  m, $10
2466: jmp  $0380           ; ClearForeground
```

This is the only path that **advances the round nibble**. It also
zeros the stage nibble in one shot, so the player sees: mothership
explodes → score readout → GameState 2 → next round, stage 0 (alien
fade-in). Stages 0xC-0xF are never reached.

---

## 6. Inter-stage transitions

For non-mothership stages there is **no separate bonus-screen or
score-readout state** in the JT1 table. The transition is just:

```
[stage handler hits countdown=0] → inr $43B8 → GameState := 2
                                  → next frame: $0515 inits next stage
                                  → $051B sets GameState := 3
                                  → next frame: JT4 for new stage
```

Two frames of init, then straight into the new stage. The per-stage
intro animation (`$0834` for alien fade-in stages 0/2, `$2230`
spiral-fill for stages 4/6/8) IS the visual transition — the
starfield-scroll or "spiral fill" routine plays first, then the
countdown bottoms out and the combat sub-stage runs.

For the **mothership transition**, GameState 6 ("Mother ship partikel
explosion", `Code.md:$2400`) → GameState 7 ("Mother ship score
display", `Code.md:$244C`) is the bonus-score readout. State 7
decrements `CounterA5` (`$43A5`) each frame, and on the bit-0
parity calls `$06F0` to keep the starfield scrolling. When the
counter underflows, it executes the round-bump described in §5.3.

---

## 7. Player ship across stage transitions

The player block at `$43C0..$43DF` is **re-initialised every stage**
by `InitPlayerDataStructure` at `Code.md:$0547` (called from the
GameState-2 init at `$0520`):

```
0547: ; copies 32 bytes from T0560 to $43C0
       ; defaults: PlayerShipX=$64, PlayerShipY=$D8 (Code.md:$0560)
```

So position and bullet state are reset each stage. The
`$43E0..$43FF` screen-RAM mirror block is also zeroed by `$0557`
(`ClearBbytesAtHL`).

**Lives counter**: at `RAMUse.md:$4390 Player1Lives` and
`RAMUse.md:$4391 Player2Lives`. Initialised by `GetPlayerLivesFromDip`
at `Code.md:$0350-$0376` from the bottom 2 bits of DIP switch DSW0
(`(DSW0 & 3) + 3` → 3, 4, 5, or 6 lives). They survive stage transitions
because they live outside the per-stage init blocks; only new-game
init writes them. Lives are decremented elsewhere (player-explosion
path) and incremented by the bonus-life path at `Code.md:$278A-$2791`,
which adds to the per-player byte selected by `($43A3) + $90`
(`GameAndDemoOrSplash` — 0 selects `$4390`, 1 selects `$4391`).

A second-player swap happens via `CopyMemoryBank` at `$0460` that
exchanges bank 0 ↔ 1 when a 2-player game switches turn. So
`GameOrAttract` (`$43A2`: 0=attract, 1=1P, 2=2P) and
`GameAndDemoOrSplash` (`$43A3`: 0=P1, 1=P2, 2=splash) determine
which state bank the per-stage init writes into.

---

## 8. Per-stage RAM working set (summary table)

What changes per stage, and where it lives:

| RAM       | Label                          | Set by                                       | Cleared by             |
|-----------|--------------------------------|----------------------------------------------|------------------------|
| `$43A4`   | GameState                      | `$0851` (= 2 on alien clear), `$245A` (mship) | new game → 0           |
| `$43A5`   | CounterA5                      | `$0436` (= $80 at game start), `$244C` ticks  | live                   |
| `$43A6`   | ShieldCount                    | `$2210` (cleared on stage transition)         | live during gameplay   |
| `$43AB-$43AE` | planet-spawn timer + indices | `$0580` memcpy (block bytes 0-3)            | per-stage              |
| `$43AF-$43B0` | galaxy-spawn timer/decrement | `$0580` memcpy (block bytes 4-5)            | per-stage              |
| `$43B2-$43B3` | background-fill bank ptr   | `$0580` memcpy (block bytes 7-8); `$06A9` advances LSB | per-stage    |
| `$43B4`   | CounterB4 — alien-stage countdown | `$0580` memcpy (block byte 9)             | `$083A`/`$22BA` decrement |
| `$43B6`   | bird/mothership-stage countdown | `$0580` memcpy (block byte 11) — always $FF | `$2207` decrement      |
| `$43B8`   | LevelAndRound (stage+round)    | `$0850 inr m` / `$2216 inr m` / `$245F` round-bump | new game → 0       |
| `$43B9`   | CounterB9                      | per-stage at `$0BAC` (cleared when entering levels 4-9), live counter | live |
| `$43BA`   | AliensLeft                     | `$22D1=$10` (mship), `$2222` (T1760 lookup), `$2464` ($10) | hit detection |
| `$43BB`   | BirdsLeft                      | `$2228` from `T1760` (= 8 for bird stages)    | hit detection         |
| `$43BD`   | follow-up bonus-life threshold | `$27A2` (= BonusLivesAt >> 4 after first bonus) | bonus-life path     |
| `$43BE`   | BonusLivesAt                   | `$015F` once per game from DIP switches       | `$279C` zeroed after first bonus |
| `$43C0..$43DF` | player + bullets struct   | `$0547` memcpy from `T0560`                   | per-stage             |
| `$43E0..$43FF` | OldPlayerShipMSB scratch  | `$0557` `ClearBbytesAtHL`                     | per-stage             |
| `$4390`   | Player1Lives                   | `$0350` (DIP), `$278F` bonus, player-explosion decrements | new game → DIP value |
| `$4391`   | Player2Lives                   | `$0350` (DIP), `$278F` bonus                  | new game              |
| `$4B50..$4B6F` | Alien movement-pattern ptrs | `$0532`/`$0650` from `T1520` per-stage    | per-stage             |
| `$4B70..$4BAF` | Alien (or Bird) data block | `$0532`/`$05EC` from `T1500`, then `$32B0` for bird stages | per-stage |
| `$4BB0..$4BEF` | Alien screen-RAM mirrors  | `$0532` clear; live during gameplay           | per-stage             |
| `$435E`   | AliensLeft<5 flag              | live during gameplay                          | per stage             |
| `$435F`   | AlienMovementCounter           | live                                          | per stage             |
| `$4360`   | PlayerMoved                    | live                                          | per stage             |

### 8.1 Per-round difficulty scaling

The round nibble (bits 4-7 of `$43B8`) is read by several gameplay
routines, not just `BonusLivesAt`. Found by grepping for
`($43B8)`:

| Code addr | What it scales |
|-----------|----------------|
| `Code.md:$3074-$3093` | Closed-loop pattern selection: takes `(LevelAndRound >> 1) & 0x07` and `(LevelAndRound >> 5) & 0x07`, sums them, adds `7-x` terms — this becomes `C`, the base index for picking which alien movement pattern is used. Net effect: round and stage both nudge the pattern table index. Caps at `LevelAndRound >= $80` (round 8) by clamping the high contribution to `$70`. |
| `Code.md:$312D-$313B` | Number of aliens in a closed-loop attack: takes `(LevelAndRound >> 2) & 0x0F` (so it grows by 1 per **stage**, by 4 per **round**), adds 5, caps at $10. So later rounds → more aliens swooping at once. |
| `Code.md:$356D-$3577` | Bird-stage shape/movement: tests `LevelAndRound >= $40` (round 4) — beyond round 4 the round contribution to `B` is clamped to `$30`. Indexes into `T3E80` for bird animation/movement data. |
| `Code.md:$3A6E-$3A76` | Bird-wing-hit feedback duration: if `LevelAndRound & 0x08` set (level >= 8 within round, i.e. mothership wave), uses a longer `5`-frame counter instead of the default `($43B6)` countdown decrement. |
| `Code.md:$32DE-$32EA` | Bird-data init at `$32B0`: tests bit 2 of `LevelAndRound` (i.e. stage in 4..7) — selects which bird-init table is copied into `$4B70+`. |
| `Code.md:$08A9-$08B7` | Player-bullet logic: only on stage 3 (= 2nd small-alien wave) does the player get the second `AbovePlayerBullet` slot processed. |
| `Code.md:$0BA0-$0BAF` | Scroll register: only reset to 0 if stage in 4..8 (intro stages); kept live during alien stages. |
| `Code.md:$2295-$2298` | Spiral-fill final action: if stage bit 3 set (stages 8..F) → branch to `$22F0` (clear background); else stay (`$229B`, copy stars). Mothership-intro spiral wipes to black; alien/bird intros leave the starfield. |

So per-round scaling is real and meaningful: more aliens swoop per
attack each round, attack-pattern table index drifts, bird shapes
change at round 4. There is no per-round speed-up of the master
movement counter — speed-up comes from the `AliensLeft<5` flag at
`$435E`, which is independent of round.

`BonusLivesAt` (`$43BE`) is set **once per game** by
`Code.md:$015F-$016A`: `$30 + ((DSW0 & 0x0C) << 1)` = $30, $40, $50,
or $60 (i.e. 30K/40K/50K/60K). It does NOT scale with round; the
earlier guess "0x30 + (LevelAndRound & 0x0C) << 1" was wrong. After
the first bonus, `$43BD := BonusLivesAt >> 4` and `BonusLivesAt := 0`
— so a second bonus can fire at a derived threshold (`Code.md:$2799`).

---

## 9. Implementation impact for the JS canvas port

What this implies for `phoenix_clone/`:

1. **State machine first.** Implement `state.gameState ∈ {0..7}` with a JT1-
   style dispatcher. Most logic hangs off this; do **not** try to fold the
   mothership into a "stage-3 sub-state" — the original treats it as two
   distinct top-level states (6 and 7) and your code will be cleaner if
   you do too.

2. **Stage byte = stage*16 + round.** Use a single
   `state.levelAndRound` (0..255) and decode `stage = byte & 0x0F`,
   `round = byte >> 4`. Bump with `byte++` on stage clear. The natural
   carry into the round nibble at the wrap is the original behaviour.

3. **Stage-clear is timer-based, not kill-count-based.** Add a
   `state.stageCountdown` (the `$43B4` analogue). It is set in per-stage
   init and decremented each frame; when it hits zero, advance the
   stage. `AliensLeft` is for scoring/HUD only.

4. **JT4 with 16 entries, sharing 5-ish handlers.** Build a 16-entry
   dispatch keyed by `stage` low nibble. Most stages reuse the same
   handler; the table at §3 above is the full mapping. The 5-stage
   player narrative is an emergent property of how those 16 entries are
   grouped (intro / combat / intro / combat / mothership-descend /
   mothership / outro).

5. **Per-stage init in two frames.** GameState 2 runs once, sets
   GameState 3, gameplay starts the next frame. Mirror this rather than
   collapsing init+gameplay into a single frame.

6. **Player struct reset per stage.** Player position is reset every
   stage clear. Lives and round survive.

7. **The 12-byte per-stage block is fully decoded** (see §4.1). Bytes
   0-5 control planet/galaxy spawn timing (background-only, no
   gameplay impact), 6 is unused, 7-8 select the background-fill bank,
   9 and 11 are the two stage countdowns, 10 is unused. There are only
   4 unique blocks (`$05A8/$05B4/$05C0/$05CC`), so a JS literal table
   of four 12-byte arrays + a 16-entry index table is enough.

8. **Two stage countdowns, two paths.** `$43B4` (alien fade-in
   countdown, decremented in `$0834`/`$22B4`/`$22CA`) drives clear of
   stages 0/2/9/A. `$43B6` (bird/mothership combat countdown,
   decremented in `$2204`) drives clear of stages 5/7/B. Mothership
   destruction goes through GameState 6→7 which uniquely advances the
   round nibble.

9. **Per-round difficulty scaling is significant** (see §8.1). At
   minimum, port the swoop-count formula from `$312D` (`5 + (round*4
   + stage) capped at 16` aliens-in-attack) — it is the single most
   noticeable difficulty knob.

---

## 10. Open questions

- **Mothership HP / explicit "killed" trigger.** The mothership damage
  model and the exact write that flips into GameState 6 was not
  traced — the `$2400` handler exists and is reached, but identifying
  *which RAM byte goes to zero or which collision routine writes
  GameState=6* needs a follow-up pass through `$3400`-end and the
  enemy-bullet/collision code at `$0C40+`.
- **Bird-stage `$3400`.** Not traced this pass. We know it exits via
  `$2204`, but the inner per-frame structure (egg→bird hatching, bird
  formation behaviour) is still opaque. Required before porting bird
  AI.
- **Spiral-fill exact tile-write order.** `$2230` was traced to its
  exit conditions but not its per-frame drawing math at `$2260+`.
  Cosmetic, can be deferred.
- **Demo / attract stages (`SplashAndDemo` at `$00E3`).** `$03E2`
  hardcodes `LevelAndRound = $08` (1st round, level 8 = mothership
  intro) and `$03EB` hardcodes `$04` (level 4 = bird intro), so
  attract mode demos those two specific stages with simulated input.
  Not load-bearing for the port but worth noting if we want a faithful
  attract loop.
