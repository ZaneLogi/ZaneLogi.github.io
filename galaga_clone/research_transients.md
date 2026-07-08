# Research — Transient fly-in members (the F7 feature)

Pre-implementation decode for the **transient** subsystem, the one gameplay
gap behind the deferred `F7` token (see `research_attack_paths.md` §8). This
doc fully characterizes the source mechanism so the port can be built without
mid-implementation surprises. Every claim cites a Z80 address.

Z80 source (this PC): `D:/tmp/galaga_rom/rom0`.

## 1. What transients are

From **stage 4**, a combat wave can include **transient** bugs: extra fly-in
members that enter alongside the formation, make one player-targeted swoop, and
**leave** — they never join the grid. The disassembler's own words at
`gg1-3.s:1806`: *"the additional 'transient' buggers that fly-in but don't
join ... Stage 4 or higher."*

A transient and a formation bug enter on the **same** `db_2A3C` fly-in path
(e.g. `db_flv_001d`). The only difference is the transient's object ID has the
`0x38` bits set, so at the shared `F7` token (`case_0B98`, `gg1-5.s:1947`) the
formation bug **skips** (continues to home) while the transient **jumps** to a
sub-path that targets the player (`FE`) and exits (`FF`). F7's gate is exactly
`(obj_id & 0x38) == 0x38`.

So "implement F7" = "implement transients." The token handler alone is inert;
nothing in the current clone ever sets a transient ID.

## 2. The object-ID / slot model

The formation has **48 slots** (object IDs `0x00`–`0x5E` even = offsets into
`sprt_fmtn_hpos`). Only **40** fly in via the normal waves — `db_attk_wav_IDs`
(`gg1-3.s:1489`) lists 40 IDs. The **8 reserved** slots (not in that table) are:

- `0x00, 0x02, 0x04, 0x06` — special (player/boss-capture region).
- **`0x38, 0x3A, 0x3C, 0x3E`** — the **transient / bonus-bee** slots.

So `0x38-0x3E` are formation slots that the normal fly-in never fills. They are
reused by **transients** (stage 4+) and by the **bonus-bee clones** (`case_097B`
scans `b_8800 + 0x38`, `gg1-5.s:1568`). The two never overlap in time
(transients = stage start; bonus-bee = late stage, ≤10 bugs).

**Clone parity (verified live):** `state.enemies` is a fixed 48-object pool with
IDs `0x00-0x5E`; `0x38-0x3E` exist as `butterfly` slots that stay `'pending'`
all game (never in `ATTK_WAV_IDS`). Bonus-bee already reuses them via
`spawnClone` (`bugMotion.js:173`). **A transient launch reuses the same 4
`'pending'` slots at stage start — no formation member is displaced.**

## 3. Build side — `c_25A2` (wave-stream assembly)

`c_25A2` (`gg1-3.s:1168-1423`) builds the runtime wave stream `ds_8920` at stage
init. The clone mirrors it in `paths.buildWaveStream`. Per-wave triplet layout
in the caravan row (`d_combat_stg_dat`):

```
byte0 = transient control   (low nibble = transient count; bit 7 = type marker)
byte1 = lefty  path byte
byte2 = righty path byte
```

The clone currently **ignores byte0** (`paths.js:622` "transient-attack control
(ignored)") and hardcodes 8 formation IDs per wave.

### 3.1 The 16-slot temp buffer

For each wave, `c_25A2` fills a 16-byte scratch buffer `ds_atk_wav_tmp_buf`
(memset to `0xFF`, `gg1-3.s:1272`), laid out as **lefty 0-7 / righty 8-15**.

### 3.2 Transient insertion loop (`l_2612`, `gg1-3.s:1287-1311`)

Runs only if `byte0 & 0x0F != 0`:

```
ld b, (byte0 & 0x0F)        ; b = transient COUNT
srl a; add a,#4; ld e,a     ; E = (count >> 1) + 4   ← placement divisor
l_2612:
  call c_1000               ; A = random byte (see §6)
  ld l,a; ld h,#0; ld a,e
  call c_divmod             ; A = random % E   ← slot index in [0, E)
  bit 0,b; jr z; set 3,a    ; if b bit0 set → +8 (righty half); b counts DOWN
  ld l,a; ld a,(tmp_buf[A]) ; retry (inc a; jr nz) if slot occupied (!= 0xFF)
  ld a,b; rlca              ; A = b*2
  rlc c; jr nc; or #0x40    ; rlc c rotates byte0 each iter; carry = the next
                            ;   MSB-first bit → OR 0x40 (THIS transient's type)
  or #0x38                  ; transient IDs carry the 0x38 bits
  ld (tmp_buf), a
  djnz l_2612               ; b counts DOWN
```

So each transient ID = **`(b * 2) | 0x38`** (b = the down-counter, count..1),
plus `| 0x40` when the **MSB-first bit of `byte0`** is set: `rlc c` rotates
`byte0` left once per transient, so transient *k* (k=1..count) takes `byte0`
bit `(8−k)`. That `0x40` (raw-ID bit 6) is the redmoth/yellowbee selector read
at launch (§4.3) — so **one wave can mix types**. Placement slot =
`(c_1000() % E)`, `+8` when **b** is odd (→ righty half), re-rolled on collision.

### 3.3 Worked trace — stage 4, rank A, wave 1

Caravan row 4 (`gg1-3.s:1466`), `byte0 = 0x82` (`1000_0010`):
- count = `0x82 & 0x0F` = **2**; E = `(2>>1)+4` = **5**.
- Transient 1 (**b=2**, even → lefty slot `rng%5` in 0..4): type bit = `byte0`
  bit 7 = **1** → `(2<<1) | 0x38 | 0x40` = **`0x7C`** (redmoth).
- Transient 2 (**b=1**, odd → righty slot `rng%5 + 8` in 8..12): `rlc c` has
  rotated `byte0`, so the bit is now `byte0` bit 6 = **0** → `(1<<1) | 0x38` =
  **`0x3A`** (yellowbee).

**Verified** against the built stream: stage-4 wave-1 transients = `{0x7C,
0x3A}` (one redmoth + one yellowbee), NOT `{0x7C, 0x7A}` — the `rlc c` rotation
gives each transient a *different* `byte0` bit, so a wave mixes types. (Stage 9
wave 1 = `0x78/0x7C` redmoths + `0x3A/0x3E` yellowbees, 4 transients.) Both pass
the F7 gate (`& 0x38 == 0x38`).

### 3.4 Formation fill + pairing (`l_2636` / `l_2662`)

After transients, `l_2636` (`gg1-3.s:1318-1341`) drops the 8 formation IDs into
the remaining `0xFF` slots (first 4 → lefty 0-7, next 4 → righty 8-15, via the
`cp #5 / ld l,#8` split). Then `l_2662` (`gg1-3.s:1358-1378`) emits the stream:
for each `i`, `[byte1, tmp_buf[i], byte2, tmp_buf[i+8]]`, stopping when
`tmp_buf[i] == 0xFF`. Markers `0x7E` (wave start) / `0x7F` (stage end).

So a transient simply occupies a lefty or righty slot and gets paired with
whatever sits opposite it — it rides the normal pairing machinery.

## 4. Launch side — `l_2953` / `l_29D1` / `_setup_transients`

`f_2916` walks `ds_8920` and launches each object (`l_2953_next_pair`,
`gg1-3.s:1718`). The clone mirrors this in `resolveWaveByte` + `launchEnemy`.

### 4.1 ID remap (`gg1-3.s:1753-1761`)

```
ld a,(hl); ld b,a          ; B = raw object ID (e.g. 0x7C)
and #0x78; cp #0x78        ; is it in [0x78, 0x80)?
ld a,b; jr nz
res 6,a                    ; YES → clear bit 6:  0x7C→0x3C, 0x7A→0x3A, ...
ld 0x10(ix),a              ; obj_id = 0x38-0x3E
```

So the `0x40` marker bit is **stripped at launch** — every transient lands at
`obj_id 0x38-0x3E`. The **raw** ID stays in `B` for the next step.

### 4.2 Disposition + transient routing (`gg1-3.s:1766-1780`)

`b_8800[obj_id] = 7` ("spawning"). Then `and #0x38; cp #0x38; jr z` →
`_setup_transients` (so any `0x38-0x3E` object is a transient).

### 4.3 `_setup_transients` sprite pick (`l_29B3`, `gg1-3.s:1807-1822`)

Uses `bit 6, b` — i.e. bit 6 of the **raw** ID (which survives the `res 6`).
That bit 6 is the per-transient `0x40` set in §3.2 (the MSB-first `byte0` bit),
so the type is decided **per transient**, not per wave:

| raw ID bit 6 | sprite | color |
|---|---|---|
| set (`0x7x`) | **redmoth** | 2 |
| clear (`0x3x`), wave ctr ≠ 2 | **yellowbee** | 3 |
| clear (`0x3x`), wave ctr == 2 | **boss** (stage 9+) | 0 |

Bomb flags `0x0F(ix) = 0` (transients never bomb). Stage-4 wave-1 → **one
redmoth (`0x7C`) + one yellowbee (`0x3A`)**, not all redmoths (§3.3).

### 4.4 Shared finalize — start position (`l_29D1`, `gg1-3.s:1824-1895`)

Transients fall into the **same** setup as formation members: bomb counter
(`0x08`/`0x44`), path pointer from `db_2A3C[C]` (the wave's path index — the
**same fly-in path** the formation pair runs), and start position from the
`db_2A6C` variant table (`gg1-3.s:1863`), selected by the path byte's variant
bits + the pair-member bit. **No special positioning** — transients enter from
the same variant slots as the bugs they pair with.

## 5. Runtime — F7 + sub-paths + FE

The transient flies its `db_2A3C` path. At `F7` (`case_0B98`): gate
`(obj_id & 0x38)==0x38` is **true** → `jp l_0B46` (the FD-jump handler) reads
the embedded 2-byte sub-path address and replaces the path pointer. (Formation
bugs: gate false → skip 3 bytes, continue to their `FB`-home tail.)

### 5.1 F7 sub-paths (need porting)

Six, interleaved in ROM with the main fly-in paths (and with non-path data —
same layout problem solved for F0): `p_flv_004b, 0084, 00b6, 0160, 0192, 01ca`.
Each is: a couple of segments → **`FE`** (player-targeting) → a segment → **`FF`**
(despawn). Example `p_flv_004b` (`gg1-5.s:136`):
`0x23,0xf0,0x26, 0x23,0x14,0x13, 0xFE,<8-byte LUT>, 0x23,0xFF, 0xFF,0xFF`.

They end in **`FF`, not `FB`** — transients despawn, never home (the clone's
`bbeeClone` lifecycle already does exactly this, `bugMotion.js:235`).

### 5.2 The `FE` token (`case_0B16`, `gg1-5.s:1849-1881`) — needs porting

A player-X targeting **turn-HOLD**, structurally a twin of the already-ported
`F3` (`case_0A01`): reads ship X (`sfr_sprite_posn+0x62`), mirrors by flip-screen
+ the `0x13` negate bit, computes an index `= shipX-derived / 0x1E` (`c_0EAA`),
reads the 8-byte LUT → writes segment **duration** `0x0D(ix) = LUT[idx]`, skips
`token + 8` bytes, then `jp l_0BFF_flite_pth_skip_load` (keeps vx/vy/rotRate).
Differences from F3: divisor `0x1E` (vs F3's `/6`) and its own bias. 9-byte arg
(token + 8-byte LUT), same as F3. **Port = copy the F3 handler, swap the math.**

## 6. The RNG (`c_1000`) — a hardware-substrate substitute

`c_1000` (`gg1-2.s:33`) is the only caller'd randomizer, and its entropy is the
Z80 **R register** (`ld a,r` ×2) — the DRAM-refresh counter, a function of
instruction-fetch count. **It has no JS counterpart**; reproducing its output
means counting Z80 instructions (a cycle-accurate core — the anti-pattern in the
repo CLAUDE.md "no software counterpart — drop, not defer"). The frame-counter +
`db_obj_home_posn_rc` table mixing in `c_1000` exists only to whiten R.

**Decision (LOCKED 2026-06-22, Zane): substitute the whole of `c_1000` with a
deterministic xorshift32, fixed / stage-derived seed.** Per-play variety
(reseeding from clock entropy at game start) is an available one-line switch,
deliberately **not** used — reproducibility + testability win here, and the
arcade's exact placement isn't a reproducible target anyway (its entropy is the
hardware R register). A real PRNG self-whitens (better-distributed than the
R+frame+table mix); the randomness dropped is cosmetic — `byte0` fixes the
transient **count** and the placement **distribution** is preserved (uniform
over free slots); only the **per-play entry slot** is fixed instead of varying.

```js
// c_1000 substitute — Z80 R-register entropy has no JS counterpart;
// deterministic xorshift32 (Marsaglia 13/17/5). Reseed at stage init.
const transientRng = (() => {
    let s = 0x12345678;                         // never 0
    return {
        reseed(seed) { s = (seed | 0) || 0x12345678; },
        byte() { let x = s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s = x; return x & 0xFF; },
    };
})();
```

Notes: use **`>>> 17`** (logical shift — the canonical generator; a signed `>>`
is a porting bug). A per-call advance is **load-bearing**, not polish: the
placement loop calls the RNG repeatedly and re-rolls on slot collisions, so equal
consecutive values would spin forever — the xorshift state advance prevents that.
Reseed per stage (`reseed(0x12345678 ^ stage)`) keeps placement deterministic +
reproducible (so the deterministic-replay tests still work). Document it as the
R-register substitute.

## 7. Clone mapping — what each piece becomes

| Source | Clone | Status |
|---|---|---|
| `c_25A2` transient insert (`l_2612`/`l_2636`) | `paths.buildWaveStream` — read `byte0`, generate N transient IDs, place via `transientRng`, interleave | **NEW** (the real work) |
| `c_1000` | `transientRng` xorshift (§6) | NEW, ~8 lines |
| `l_2953` ID remap (`res 6`) + transient routing | `resolveWaveByte` / launcher — detect `0x38-0x3E`, carry the `0x40` marker for sprite pick | NEW, small |
| `_setup_transients` sprite pick | transient launch — set redmoth/yellowbee/boss sprite + `bbeeClone` despawn flag | adapt `spawnClone` pattern |
| transient slots `0x38-0x3E` | already in `state.enemies` (`'pending'` butterflies) | **exists** |
| FF-despawn / no-home lifecycle | `bbeeClone` path | **exists** |
| `F7` handler | mirror the `F0` handler (gate → `.subPaths` jump) | small (F0 precedent) |
| F7 sub-paths | `.subPaths` arrays like F0's | mechanical (F0 precedent) |
| `FE` (`case_0B16`) | new handler ≈ ported `F3` | small (F3 precedent) |

## 8. Implementation plan (sub-steps, each a save-point commit)

1. ✅ **FE token — DONE (2026-06-22).** Ported `case_0B16` as an `F3`-twin
   handler in `bugMotion.js` (`0xFE` case + `TOKEN_ARG_BYTES.FE=8`). Player-region
   index (`(neg?shipX:0xF2−shipX)+0x0E`, `/0x1E` → `path[token+idx]`), keeps
   vx/vy. Dormant (no path reaches it until step 2). Verified by unit-driving a
   synthetic FE path through the real interpreter — 6 cases (center symmetric,
   L/R mirror, `pathOffset→9`, velocity held) all match hand-computed values.
2. ✅ **F7 sub-paths + F7 handler — DONE (2026-06-22).** Ported the 6 sub-paths
   as `.subPaths` (alongside F0's) + the `0xF7` handler (gate `(objectId&0x38)==
   0x38` → jump, else skip), mirroring `F0`. Inert until transients launch.
   Verified: a `0x38` enemy on `path_001D` jumps into `p_flv_004b` and flies the
   FE sub-path; a normal `0x28` bug skips F7 and homes.
3. ✅ **`transientRng` — DONE (2026-06-22).** xorshift32 (§6) in `paths.js`,
   reseeded per stage (`0x12345678 ^ stage`) at the top of `buildWaveStream`.
4. ✅ **Transient insertion — DONE (2026-06-22).** `buildWaveStream` now ports
   `c_25A2` fully (16-slot temp buffer, `l_2612` random-place + `rlc c` type
   bits, `l_2636` formation fill, `l_2662` pairing). Verified: deterministic;
   stages 1-3 byte-identical to the old builder (count=0); stage 4 inserts
   `{0x7C,0x3A}` in waves 1/4/5 (the §3.3 trace, after the §3.3 fix); stage 9
   mixes redmoth/yellowbee. **Note:** the raw IDs (`0x7x`/`0x3x`) are in the
   stream but don't launch yet — step 5 adds the `res 6` remap + transient setup.
5. ✅ **Transient launch/setup — DONE (2026-06-22).** `runFlyInWave` detects a
   transient ID (`& 0x38 == 0x38`), `res 6`s it to the `0x38-0x3E` slot, and sets
   the sprite via the RAW bit 6 (`butterfly`/`wasp`/`boss` per §4.3), an
   `e.transient` flag (separate from `bbeeClone`), no bombs, and clears stale
   bonus-bee render state. The FF handler despawns `e.transient` (no home), and
   `launchEnemy` now accepts a `'dead'` `0x38-0x3E` slot so transients relaunch
   each wave. Verified end-to-end at stage 4 (headless drive): 6 transients
   launch across waves 1/4/5 (1 redmoth + 5 yellowbee, matching the data),
   despawn on FF, while all 40 formation members still land; no console errors.
6. Final squash → one `feat: transients (F7)` commit. *(deferred — not this run)*

## 9. Verification

Transients first appear **stage 4**. Drive/force the stage-4 caravan (the F0
work proved stage data is deterministic in `(stage, rank)` — set
`state.newStageParms`/`waveStream` from `loadStageParms(4)`/`buildWaveStream(4)`).
Confirm: (a) the wave stream contains `0x38-0x3E` IDs at the expected count;
(b) a transient launches with the redmoth sprite, reusing a `'pending'` slot;
(c) it flies the path, hits F7, jumps to the sub-path, targets the player via FE,
and despawns on FF without homing. With the deterministic RNG this is
reproducible; placement is not byte-compared to the arcade (the R-register
entropy can't be).

## 10. Deviations (intentional, load-bearing)

- **`c_1000` → xorshift32** — the entropy source is hardware (R register); a
  faithful port is impossible, so a deterministic PRNG substitutes. The transient
  count/behavior is unchanged; only entry-slot placement differs. (§6.)
- **`0x40`/`0x78-0x7E` marker** — the source round-trips transient IDs through
  `0x78-0x7E` then `res 6`. The clone can carry the marker however is convenient
  (it only needs: which slot, and the redmoth-vs-yellowbee bit) — the exact
  `0x78` encoding is an implementation detail, not observable.

## 11. Open questions — none blocking

The decode above closes every item flagged in `research_attack_paths.md` §8.
No hardware dependency remains except the RNG (resolved by substitution). The
only genuinely novel code is sub-step 4 (transient insertion); everything else
reuses an existing precedent (F0, F3, bonus-bee, the `bbeeClone` lifecycle).
