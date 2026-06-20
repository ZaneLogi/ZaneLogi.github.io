# Galaga Enemy Attack Paths — Verification Report

Research scope: enemy continuous-attack mode (bombers diving from
formation), as opposed to the fly-in covered in `research_stage_init.md`
and `research_path_data.md`. This was last researched in **step 8**
(early in the project, before the rigor-bar that INT-2c introduced).
The user asked for a full deep-dive verification.

Sources:
- `gg1-5.s:285+` (ATTACK_PATH_YELLOW bytecode, db_flv_atk_yllw)
- `gg1-5.s:311+` (ATTACK_PATH_RED bytecode, db_flv_atk_red)
- `gg1-2_fx.s:857+` (`f_1B65` — the per-frame attack-launch dispatcher)
- `gg1-2_fx.s:973-1010` (`case_bmbr_yellow / red / boss` — type-specific)
- `new_stage.s:28-119` (`c_2C00` — per-stage difficulty params)
- Our: `paths.js` (ATTACK_PATH_YELLOW/RED), `tasks/launchAttackWave.js`
  (runAttackMode + tryLaunchAttack), `tasks/bugMotion.js` (launchEnemyAttack)

Status legend: ✅ verified · ⚠ partially correct (with shortcuts) ·
❌ wrong or missing · ⏳ deferred (acknowledged, postponed)

## 1. Bytecode arrays — ATTACK_PATH_YELLOW (90 bytes)

**Status: ✅ verified byte-for-byte against gg1-5.s:285-309.**

Recount by sub-path block:

| Sub-path | Z80 size | JS port size | .dw addresses match? |
|----------|----------|--------------|----------------------|
| Header (0x349-0x34F)         | 3 bytes  | 3 bytes  | n/a |
| p_flv_0352                    | 6 bytes  | 6 bytes  | n/a |
| p_flv_0358                    | 11 bytes | 11 bytes | ✅ p_flv_039e at 0x9E,0x03 |
| p_flv_0363                    | 9 bytes  | 9 bytes  | n/a |
| p_flv_036c                    | 16 bytes | 16 bytes | ✅ p_flv_037c at 0x7C,0x03; p_flv_0352 at 0x52,0x03 |
| p_flv_037c                    | 34 bytes | 34 bytes | ✅ p_flv_039e at 0x9E,0x03; p_flv_036c at 0x6C,0x03 |
| p_flv_039e (shared return)    | 11 bytes | 11 bytes | n/a |
| **Total**                     | **90**   | **90**   | ✅ |

No transcription errors. All sub-path addresses are little-endian
correct. The per-token argument layouts (1-byte F6/F8, 2-byte FA/FD/EF,
8-byte F3 LUT) are present in the right offsets.

## 2. Bytecode arrays — ATTACK_PATH_RED (104 bytes)

**Status: ✅ verified byte-for-byte against gg1-5.s:311-337.**

| Sub-path | Z80 size | JS port size | .dw addresses match? |
|----------|----------|--------------|----------------------|
| Header                        | 3 bytes  | 3 bytes  | n/a |
| p_flv_03ac                    | 32 bytes | 32 bytes | ✅ p_flv_040c at 0x0C,0x04; p_flv_03d7 at 0xD7,0x03 |
| p_flv_03cc                    | 11 bytes | 11 bytes | ✅ p_flv_03ac at 0xAC,0x03 |
| p_flv_03d7                    | 53 bytes | 53 bytes | ✅ p_flv_040c at 0x0C,0x04; p_flv_03cc at 0xCC,0x03 |
| p_flv_040c (shared return)    | 5 bytes  | 5 bytes  | n/a |
| **Total**                     | **104**  | **104**  | ✅ |

No transcription errors. F3 8-byte LUTs (lines 316 + 332) present at
the right offsets. F6 free-flight arg bytes (0xB0, 0xC0, 0xB0) match.

## 3. Dispatcher — runAttackMode vs Z80 f_1B65

**Status: ⚠ structurally similar, missing several gates and per-stage
data inputs.**

### 3.1 Z80 f_1B65 flow (gg1-2_fx.s:857-970)

```
1. GUARD CHECK (lines 858-869):
   if (glbl_enemy_enbl != 0):
     if (task_actv[0x15] == 0 || task_actv[0x1D] != 0): return
   ; (i.e. need fire-button task active AND no destroyed-capture-boss task)

2. BOSS+WING POOL CHECK (lines 872-888):
   walk bmbr_boss_pool (4 × 3-byte slots)
   if any slot has obj_idx != 0xFF → launch capture squad (l_1B8B)
   else → wait for frame_cnt & 0x0F == 0 → l_1BA8
   ⚠ KEY ARCHITECTURAL POINT: l_1B8B BYPASSES the per-type dispatch
      AND the max-bombers gate. The boss_pool can launch up to 3 enemies
      (boss + 2 wingmen) over consecutive frames — yellow/red are
      paused while the pool drains. Populated by case_bmbr_boss's
      capture-mode select branch (lines 1022-1043).

3. PER-TYPE TIMER CHECK (lines 923-933, l_1BA8):
   for n in [yellow, red, boss]:
     b_92C0[n] -= 1
     if b_92C0[n] == 0 → dispatch type n (l_1BB4)
   if all > 0: return

4. MAX_BOMBERS GATE (lines 935-945, l_1BB4):
   if bugs_flying_nbr >= ds_new_stage_parms[0x04]:
     b_92C0[n]++ ; reset back to 1
     return

5. RELOAD + DISPATCH (lines 947-965):
   b_92C0[n] = b_92C0[n+4]   ; reload value lives at offset+4
   switch (n) → case_bmbr_yellow / red / boss
```

### 3.2 Our runAttackMode

```js
function runAttackMode(state) {
    // Decrement all per-type timers EVERY frame (Z80 only decs on frame mod 16)
    for (const type of ['yellow', 'red', 'boss']) {
        if (state.attackTimers[type] > 0) state.attackTimers[type] -= 1;
    }

    // Frame gate: every 16 frames
    if ((state.frameCount & (ATTACK_RATE_GATE - 1)) !== 0) return;

    // Max-bombers gate: hardcoded 4
    if (state.bugsFlying >= MAX_BOMBERS) return;

    for (const type of ['yellow', 'red', 'boss']) {
        if (state.attackTimers[type] > 0) continue;
        if (tryLaunchAttack(state, type)) {
            state.attackTimers[type] = reloadFor(type);   // hardcoded 180/240/360
        } else {
            state.attackTimers[type] = ATTACK_RATE_GATE;
        }
        return;
    }
}
```

### 3.3 Comparison

| Behavior | Z80 | Our port | Status |
|----------|-----|----------|--------|
| Guard: glbl_enemy_enbl + fire-button + no-destroyed-capture | yes | none | ❌ missing |
| Boss+wing pool (capture squad queue) | check first, before per-type | `drainBossPool` + `queueCaptureBoss`/`queueBossSortie` | ✅ step 10 (4a–4d) — see §14 + research_boss_capture.md |
| Frame mod 16 gate scope | wraps boss-pool wait + per-type DEC | wraps per-type DEC + dispatch attempt | ⚠ slightly off |
| Per-type timer DEC frequency | every 16 frames (gated) | every 16 frames after Phase C (gate-first dispatch) | ✅ Phase C INT-7 |
| `b_92C0` array indexing | `[0]=boss, [1]=red, [2]=yellow` (verified via f_1B65 djnz loop + d_1BD1 case-table at gg1-2_fx.s:923-970) | `state.attackTimers.{boss,red,yellow}` named slots | ✅ matches semantically |
| Dispatcher iteration order | `b_92C0[0]→[1]→[2]` = `[boss, red, yellow]` (Z80 iterates in array order, fires first to hit 0) | `[boss, red, yellow]` after Phase B (was `[yellow, red, boss]` before) | ✅ Phase B INT-7 |
| MAX_BOMBERS source | `ds_new_stage_parms[0x04]` (per-stage) | hardcoded `4` | ❌ wrong source |
| MAX_BOMBERS for stage 1 | **2** (sub-table 0 byte 2 = 0x22 → upper nibble = 2) | 4 | ❌ wrong value (2× too many bombers) — fixed Phase A |
| **Initial timer values** | **Hardcoded `0x16/0x02/0x02` in c_2C00 (new_stage.s:100-103) — NOT from per-stage data. Same for every stage and rank.** Stored: `b_92C0[0]=0x16, [1]=0x02, [2]=0x02`. In 16-frame ticks: boss=22, red=2, yellow=2. | hardcoded `yellow=180, red=240, boss=360` in resetWaveState | ❌ wrong source + wrong values + wrong type→value mapping (we had yellow shortest; Z80 has yellow & red shortest, boss longest) — fixed Phase B |
| Reload values (per launch) | `b_92C0[4..6]` set by `f_0857` lookup chain: `newStageParms[1..3]` → `c_08BE`/`c_08AD` → `b_92C0[4..6]`. (game_ctrl.s:1386-1438.) Updated continuously; depends on bug count + elapsed stage time. | `state.attackReloads.{boss,red,yellow}` recomputed every frame by `tasks/bomberConfig.js` (port of f_0857) | ✅ Phase C INT-7 |
| Type dispatch (3 types) | yes | yes | ✅ structurally correct |
| Sound on launch | `b_9AA0[0x13] = 1` | none | ❌ no sound system yet |

**Earlier (incorrect) claim retracted:** prior versions of this doc said
"`newStageParms[1..3]` are the initial timer values, 0 for stage 1." Reading
c_2C00 directly (Phase B work) showed that's wrong on three counts:
(1) initial timers are a hardcoded `0x0216` constant, not per-stage data;
(2) `newStageParms[1..3]` actually feed the *reload-value* lookup in
`f_0888`, writing `b_92C0[4..6]` — not `b_92C0[0..2]`;
(3) for stage 1 sub-table 0, `newStageParms[1..3]` happen to be `0/0/0`
which made the misreading look plausible, but those zeros affect reloads
not initial timers.

**Compounded effect for stage 1 (post-Phase-B):**
- We now allow only `newStageParms[4]` = 2 bombers simultaneously (Phase A).
- First attack: red fires at frame ~16 (0.27 sec), yellow at frame ~32
  (0.53 sec). Boss waits 22×16 = 352 frames (5.87 sec). Matches Z80.
- Reloads still hardcoded (Phase C). After the first burst, cadence drifts
  from Z80 because subsequent reload values aren't sourced from b_92C0[4..6].

This explains why "the wrong type was attacking first" pre-Phase-B — our
iteration was `[yellow, red, boss]` and our hardcoded timers had yellow
shortest, so yellow always won the first dispatch. Z80 has red winning
first because b_92C0[1]=2 hits 0 before b_92C0[2]=2 in the array-order
iteration.

## 4. Type-specific handlers — case_bmbr_yellow / red / boss

### 4.1 Yellow (gg1-2_fx.s:973-1001) — ⚠ partial

Z80:
- Range b_8800[0x08..0x2E] (20 yellow aliens)
- Skip the bonus-bee object (`_b_bbee_obj` index)
- For each: if `b_8800[id] == STAND_BY (=1)`, launch via c_1083

Our `tryLaunchAttack(state, 'yellow')`:
- Range `e.objectId 0x08..0x2E` ✅
- Filter `e.state === 'formation' && e.alive` ✅ (functional equivalent of STAND_BY check)
- **No bonus-bee skip** ⚠ — still no bonus-bee object; it was a step-10 nice-to-have that the 4c/4d capture work did **not** include, so it remains deferred and the skip stays moot for now
- Returns first match (first-found = first available in formation order) ✅

### 4.2 Red (gg1-2_fx.s:1004-1008) — ✅ verified

Z80:
- Range b_8800[0x40..0x5E] (16 red moths)
- Falls through to common `l_1BDF` (same logic as yellow)

Our `tryLaunchAttack(state, 'red')`:
- Range `e.objectId 0x40..0x5E` ✅
- Same filter logic ✅

### 4.3 Boss (gg1-2_fx.s:1011+) — ✅ implemented in step 10 (was: oversimplified)

> **✅ UPDATE (step 10, 4a–4d).** The boss launcher below is no longer
> oversimplified. The clone now has the **capture-squad select** (`captureToggle`/
> `captureActive`, one capture at a time), **escort sorties** (boss + 1–2 wingmen
> via `BOSS_ESCORTS`), the **boss-pool stagger** (`drainBossPool`), and a real
> **boss-path** (`ATTACK_PATH_BOSS`, not the YELLOW stand-in). The boss roster is
> `BOSS_ID_MIN..BOSS_ID_MAX = 0x30..0x36` (the 4 bosses of the boss row), which
> **resolves the open `BOSS_IDS` question below** — the earlier
> `[0x00,0x02,0x04,0x06,…]` guess was wrong; bosses are the `0x30–0x36` row only.
> Full mechanism: **§14** + [research_boss_capture.md](research_boss_capture.md).
> The step-8-era analysis below is kept for history.

Z80 boss launcher is **complex**. It implements the capture-squad
logic:
1. Check `_b_bmbr_boss_cflag` (capture-mode active) — if so, jump to
   non-capture path (only one capture mission at a time)
2. Toggle `_b_bmbr_boss_wingm` — every other launch is capture-eligible
3. If capture-eligible: pick first STAND_BY boss as capture-boss,
   queue 2 wingmen alongside it (3-bug squad)
4. Else: just launch one boss solo

Our `tryLaunchAttack(state, 'boss')`:
- Picks from explicit `BOSS_IDS = [0x00, 0x02, 0x04, 0x06, 0x30, 0x32, 0x34, 0x36]`
- Uses **YELLOW path** (`ATTACK_PATH_YELLOW`) — comment: "capture-capable path"
- Single launch, no wingmen, no capture flag
- No alternate path (red? boss-specific?)

**Issues:**
- ❌ Boss attacks should use a boss-specific path (or the yellow path, but with capture context). Currently solo boss with yellow path.
- ⏳ Capture squad is step 10 territory — fine to defer, but should be explicit.
- ⚠ The BOSS_IDS array is correct (verified against `b_8800[0x30..0x36]` for boss row 0/1, plus `[0x00..0x06]` for ... wait, those don't match. Let me check.)

Actually `BOSS_IDS = [0x00, 0x02, 0x04, 0x06, 0x30, 0x32, 0x34, 0x36]` is suspicious. Z80 boss objects start at b_8800[0x30] (per gg1-2_fx.s:1025). The 0x00-0x06 range is *something else* in our enemy roster — looking at SPRT_FMTN_HPOS ordering, IDs 0x00-0x06 are also boss row entries (IDs scattered for fly-in pairing). So our BOSS_IDS list might be correct, just including BOTH boss rows. Needs to be confirmed against `_ROWS` in state.js.

## 5. launchEnemyAttack — start position

Our:
```js
const f = state.formation;
e.x = e.homeX + f.oscillateX + (f.pulseOffsets[e.colIdx] ?? 0);
e.y = e.homeY +                (f.pulseOffsets[10 + e.rowIdx] ?? 0);
```

Includes oscillation + pulse offsets — i.e. starts where the enemy was
visibly drawn before breaking formation.

**Status: ⚠ likely correct but unverified against Z80 `c_1083`.**

The Z80 `c_1083` is called at `case_bmbr_yellow` line 1000. It sets up
the bug_motion_que entry from the enemy's current sprite position.
Whether it includes oscillate/pulse offsets — needs separate
verification by reading c_1083 directly. In real gameplay, the enemy
SHOULD appear to leave from where you saw it last (with offsets), so
our behavior is visually correct even if mechanically the Z80 might
do something slightly different (e.g. snap to home first then read
sprite_posn).

## 5b. Homing return to formation — formation-offset tracking (FB / case_0AA0)

The symmetric companion to §5. §5 makes a dive **start** leave from the
visible (offset-included) position; this is the homing **return**
arriving at the visible (offset-included) position. `FB`/`case_0AA0` is
the shared "go home" handler for **both** the fly-in (a bug reaching its
slot for the first time) and a dive-return.

**Status: ✅ FIXED (INT-7). Homing now tracks the live oscillating slot
(the `case_2422` mirror): at FB the bug aims at `homeX+offset` and seeds
`homeOscX/Y`; each homing frame it adds the formation's drift delta to its
position and snaps against the live slot — so it glides onto the moving
formation with no jump. Without the tracking it homed to the *static* slot
and popped sideways by the current `oscillateX` at snap.**

### What the source does (verified)

A bug at `FB`/`TURN_HOME` (`case_0AA0`, gg1-5.s:1768) enters disposition
**9** (diving/homing):

1. `case_0AA0` sets the home **target** `0x06/0x07(ix)` to the slot's
   **static origin** (gg1-5.s:1840-1841), stores the slot's **current**
   drift offset in `0x11/0x12(ix)` (:1793-1794), and pre-shifts the
   bug's position by that offset (:1807-1828).
2. **Every frame**, `case_2422` (gg1-3.s:826-848 — the disposition-9
   handler) re-reads the slot's **current** offset from the live
   `ds_hpos_loc_offs` and re-writes it into the bug's `0x11/0x12`
   (:832-847). The offset is re-synced to the oscillation each frame,
   not frozen at FB.
3. The motion update adds `0x11/0x12` to the bug's position
   ("heading home (add x-offset)", gg1-5.s:2297 / 2326).
4. Home-detect (`l_0C05`, gg1-5.s:2037-2053) compares the bug to the
   *static* origin `0x06/0x07`; because the position carries the live
   offset, "reached the origin" means "reached the **live slot** on
   screen." Snap (`l_0E08_imhome`, gg1-5.s:2474) fires with the bug
   already on the moving formation → **no jump.**

Net: a homing bug **tracks the oscillating formation every frame** and
glides onto it wherever it has drifted.

### What our clone does (`bugMotion.js`, INT-7)

At `FB`, `bugMotion` aims at the **live** slot (`homeX + oscillateX +
pulse`) and seeds `e.homeOscX/Y` from the slot's offset. Each homing frame
it adds the offset **delta** (`ox − homeOscX`) to `e.x/e.y` — the
`case_2422` re-sync — and snaps when within `HOME_THRESHOLD` of the live
slot. So `e.x` carries the drift and the bug lands on the moving slot.
`objectStates` is unchanged: `'homing'` still renders at `e.x`, which now
tracks the formation. `state.js` adds the `homeOscX/homeOscY` fields.

### Measured (stage 1, no shooting; headless replay of the clone's own tasks)

| event | frame | `oscillateX` |
|---|---|---|
| `stageStart` | 2 | 0 |
| launcher enables (`atkWvEnbl`) | 62 | +15 |
| first wave snaps (obj 88/90/92/94/40/42/44/46) | 176–188 | **+18 … +21** |
| later wave snaps (obj 48…) | 396–406 | **−30 … −27** |

**Before** the tracking, each snap's horizontal jump equalled the
`oscillateX` at that frame (≈ +20 px first wave, growing later) — the
visible "doesn't match the original" artifact. **After** (same replay,
measuring last-homing → first-formation render): the horizontal jump is
**≤ 2.7 px** (within the 2 px snap threshold), and the formed block sits
correctly in its slots. The formation is still at +20 px drift when the
first wave arrives, but the bug now lands on it seamlessly.

### Implementation (INT-7 — done)

`bugMotion.js` gives flying/homing bugs a per-frame offset carried **on the
position** (mirror `case_2422`): each frame set a per-bug `(offX, offY)`
from the slot's current `oscillateX` (+ pulse) and add it to the position
used for homing motion **and** the home-distance check, so the bug arrives
at the live slot and the snap is seamless. The home *target* can stay static
(matches Z80 `0x06/0x07`); only the live offset on the *position* is
missing.

## 6. Bomb arming — ⚠ CORRECTED 2026-06-21 (the "no normal-dive bombing" claim was WRONG)

**This section previously claimed attackers don't bomb on a normal dive — only
in the cont_bmb endgame loop via `F6`. That is WRONG, and it made the clone never
drop bombs in normal play.** The real arming is at **attack LAUNCH**, not `F6`:

- **`j_108A` (gg1-2.s:314-323) arms EVERY diving enemy at launch:** `0x0E = 0x1E`
  (the bomb countdown) and `0x0F = b_92C0[8]` (= `bombDropFlags`, the per-stage
  enable bitmask) whenever enemies are enabled (i.e. all through a stage). So
  **every dive can bomb.** `F6` (`case_0BA8`) only **re-arms** the same fields
  inside the continuous-bombing loop — it is NOT the only arming.
- **The bomb counter `0x0E` free-runs:** `case_0DF5` (gg1-5.s:2345) does
  `dec 0x0E` **every frame** for every diving enemy and, when it hits 0, shifts
  the enable mask (`srl 0x0F`) and drops if the shifted bit was 1 AND the bomber
  is low enough AND fire is active. (Reload from `b_92E2[0]` = the stage-header
  byte = `0x14` on stage 1.)

**The three fixes (2026-06-21), caught playtesting "no bombs even at rank D":**
1. **Restore launch-arming** (`bugMotion.launchEnemyAttack`): `bombCounter = 0x1E`,
   `bombEnable = state.bombDropFlags` — matching `j_108A`. (The Phase-E code set
   `0/0` on the wrong belief above; ironically the *older* `0x1E/0xFF` was closer,
   just with too many enable bits.)
2. **Drop Y-gate conversion** (`bombUpdate`): Z80 drops at **sprite_Y ≥ 152**
   (`case_0DF5` `cp #152>>1` on `0x01(ix)` = sprite_Y>>1); `canvas = sprite − 40`,
   so the gate is **canvas Y ≥ 112**. Was `152` used as a canvas value (the −40
   dropped — same bug class as the bullet despawn), making bombers need to dive
   40px deeper than they ever do.
3. **Hold-set-bit DEVIATION** (`bombUpdate`) — **see §6.1**.

So: normal dives now drop their 1-2 bombs (stage-1 `bombDropFlags` is `0x03`/`0x01`
= 1-2 bits, **verified faithful** against `d_0909` + `c_08BE`), and the endgame
loop bombs continuously.

### 6.1 ⚑ FIDELITY FLAG — attack-dive descent vs the bomb timing (DEVIATION, open)

Even after fixes 1+2, **no bomb dropped**: the Z80 consumes an enable bit on
*every* counter tick **regardless of height** (`srl 0x0F` before the Y-check),
which only works if the bomber is already low (sprite_Y ≥ 152) by the first
couple of checks (launch counter `0x1E` = 30 frames, then `0x14` = 20). The
clone's attack-dive descent is a touch **slower / curvier** — on stage 1 the
bomber is still above canvas Y=112 on the frame-29/49 checks (measured: bee
≈ y87/y96, moth ≈ y59/y68, crossing y112 only around frame ~85) — so the tiny
1-2-bit mask depletes before it gets low and nothing drops.

**Current deviation (`bombUpdate`):** a *set* enable bit is **held** until the
bomber is actually low enough (`y ≥ 112`), so each set bit yields a bomb instead
of being wasted high. Clear bits are consumed immediately (as the Z80 does). Net:
each diving enemy drops ≈ its mask's set-bit count per dive.

**Why this is a flag, not a clean port:** the *real* faithful behavior is the
Z80's unconditional shift — which implies the **attack-dive descent should be
faster/steeper** so the bomber is low by the early checks. The descent timing was
verified for the *fly-in*, not the *attack dive*. **Open item:** compare the
attack-dive descent profile against MAME (the data-segment velocity + the initial
`12 18 1e`/`12 18 1d` turn that keeps the bomber high early); if the descent is
made faithful, revert the §6.1 deviation and let the mask shift unconditionally.

## 7. Token handlers (attack context)

Our `bugMotion.loadSegment` skips most of these as no-ops with arg-byte
counting. For attack paths specifically:

| Token | Z80 case | Status in our port |
|-------|----------|---------------------|
| 0xF3 BREAK_TARGETED | case_0A01 (gg1-5.s:1661) | ✅ **PORTED (2026-06-18).** Player-targeted turn-hold: reads player X, computes `(playerX−mothX)/4` (signed, mirrored by negateRotation), biases +0x18, clamps [0,0x2F], `/6` → bucket 0-7, and writes `LUT[bucket]` into the segment **duration** (0x0D), then continues the current heading. **Doc correction:** earlier rows here said F3 does a "LUT lookup → *sub-path*". It does NOT select a sub-path — it picks a turn-HOLD DURATION (`0x0D(ix)`) and `jp l_0BFF_flite_pth_skip_load` (gg1-5.s:1715) keeps the prior segment's vx/vy/rotRate. The longer hold of the preceding `0x12,0xFA,..` (rotRate −6) turn = bigger hook toward the player. See `bugMotion.js` loadSegment `0xF3` block. |
| 0xF6 FREE_FLIGHT | case_0BA8 (gg1-5.s:1963) | ✅ **FULLY PORTED (2026-06-18).** All 3 effects: (1) sets heading `0x04/0x05 = (arg, mirrored by negateRotation) << 2` (arg×4); (2) bomb counter `0x0E = 0x1E`; (3) bomb-enable bitmask `0x0F = b_92C0[8]` (= `state.bombDropFlags`). **NOTE (2026-06-21):** F6 is NOT the primary bomb arming — `j_108A` (gg1-2.s:314-323) arms **every** dive at launch with the same `0x0E`/`0x0F`; F6 only **re-arms** inside the cont_bmb loop. The earlier "no normal-dive bombing" reading was wrong — see §6. |
| 0xF7 ATTACK_TURN | case_0B98 (gg1-5.s:1947) | ✅ correct skip (transient-only behavior; not used for non-transient bombers) |
| 0xF8 | case_0B87 (gg1-5.s:1929) | ✅ **PORTED (2026-06-18).** In the attack/home context this is NOT "BEAM_ON" — it repositions the bug's **Y to the top** ("flew through the bottom of the screen to the top"): Z80 sets `0x01(ix) = 0x0138>>1 = 0x9C`; `rawYToCanvasY(0x9C) = 1` (top edge). **0-arg** token (the old TOKEN_ARG_BYTES.F8=1 was wrong, §7c). Pairs with F9 + the FB tail. See `bugMotion.js` `0xF8` block. |
| 0xF9 (case_0B5F) | gg1-5.s:1907 | ✅ **PORTED (2026-06-18).** Sets the bug's **X to its home-column** coordinate (`0x03(ix) = ds_hpos_spcoords[col]/2 → rawXToCanvasX = e.homeX`), so it re-enters above its slot. 0-arg; skips the cocktail flip-screen branch + cont_bmb dive-sound (unmodelled). With F8, the moth re-appears at `(homeX, top)` then FA→FB homes it down — the faithful "dive off bottom → re-enter top → fly down to formation" loop. |
| 0xFA LOOP_TOP | case_0BD1 (gg1-5.s:1984) | ✅ Phase E INT-7 — gated on state.contBmbFlag. Jumps to FB tail when cont_bmb=false (most of stage 1), falls through when cont_bmb=true (late stage 1, ≤5 enemies). |
| 0xFB TURN_HOME | case_0AA0 | ✅ INT-7 — homing tracks the live oscillating slot (per-frame offset re-sync, the `case_2422` mirror); bug lands on the drifting formation with no jump. **See §5b.** |
| 0xFC RTN_FMTN/DIVE | case_0B4E (gg1-5.s:1896) | ✅ **PORTED (2026-06-19).** Bee "dive-to-Y": arms a screen-Y reference (`e.fcDiveTargetY = rawYToCanvasY(arg)`); a per-frame check in `update()` (port of `l_0C2D`, gg1-5.s:2056) force-expires the current segment once the bee dives to that depth, then disarms. Source uses `0x06(ix)` + bit 5 of `0x13(ix)`; the port keeps a dedicated field (homing target stays on `homeX/Y`). Reached every bee dive (`p_flv_0358`), but on normal stage 1 the bee only reaches ~y173 vs the ~221 target → arms without firing (segment expires naturally); fires on deeper/continuous passes. |
| 0xFD JUMP | case_0B46 (gg1-5.s:1885) | ✅ Phase E INT-7 — unconditional jump via path.z80Base address translation. Used by attack-yellow inner loop (offset 42 → 3) and attack-red inner loop (offsets 43 → 3, 96 → 35). |
| 0xEF BOMB_MODE | case_094E (gg1-5.s:1523) | ✅ **PORTED (2026-06-18).** Stage-gated branch on `newStageParms[9]`: nonzero → JUMP to the embedded address (`p_flv_03d7`, a harder pass — moth keeps diving/bombing) via `z80Base`; zero → skip the 2-byte address (re-loop / home). **Data note:** `[9]` is 0 until **stage 12** (rank 3), not stage 8 — the source "on/after stage 8" comment conflates it with the `F0` token's gate (`[8]`, which does turn on at stage 8). EF is only *reached* when `FA` falls through (contBmbFlag true). Dormant on stage 1 (gate=0 → skip), so this changes nothing in normal stage-1 play. |

**Phase E INT-7 status:** FD JUMP + FA LOOP_TOP both implemented as a
pair (one without the other gives wrong behavior — see §3.3 and §9
Phase E notes). The path now executes its inner loop structure correctly
on stage 1 normal mode (FA short-circuits to FB) and on cont_bmb mode
(FD loops the attack pass with F6 firing each iteration).

## 8. Summary — what's wrong, in priority order

### 🔴 High impact (likely visible)

1. **MAX_BOMBERS hardcoded 4 → should read `ds_new_stage_parms[0x04]`.**
   For stage 1 (rank A) = 2 bombers max (we previously had 4 = 2× too
   many). **Fixed in Phase A** — now reads from `state.newStageParms[4]`
   populated by `loadStageParms` in stgInitEnv.

2. **Initial per-type timers wrong — ✅ fixed Phase B.** Z80 c_2C00
   (new_stage.s:100-103) hardcodes initial `b_92C0[0..2] = 0x16/0x02/0x02`
   regardless of stage/rank. With f_1B65's array-order iteration this
   means **red fires first (~0.27 sec), then yellow (~0.53 sec), then
   boss (~5.87 sec)**. We had hardcoded `yellow=180, red=240, boss=360`
   AND iteration `[yellow,red,boss]` — so the wrong type fired first AND
   too slowly. Phase B sets the correct constants and reverses the
   iteration order. (See §3.3 Earlier-claim-retracted note for what was
   misread before.)

3. **Reload values + cadence — ✅ fixed Phase C INT-7.** Ported `f_0857`
   as new task `tasks/bomberConfig.js` — recomputes per-frame:
     - boss reload via `c_08BE(d_0929, newStageParms[1], num_bugs)`
     - red reload  via `c_08AD(d_08CD, newStageParms[2], gameTimers[2])`
     - yellow reload via `c_08AD(d_08EB, newStageParms[3], gameTimers[2])`
     - bomb-drop enable flags via `c_08BE(d_0909, newStageParms[0], bugs)`
     - cont_bmb branch (memset reloads to 2 when ≤5 enemies left)
     - MAX_BOMBERS ramp-up after 30 sec elapsed
   `runAttackMode` now reads from `state.attackReloads.{type}` instead
   of hardcoded constants. Timer DEC moved to gate-first (only on
   frame mod 16) so cadence matches Z80; initial timers no longer
   need Phase B's × 16 scaling — they're now stored in 16-frame ticks
   directly (boss=22, red=2, yellow=2).

★ **Fly-in / dive homing snap-jump — ✅ fixed INT-7.** The homing return
  now tracks the oscillating formation (the `case_2422` mirror), so a bug
  lands on the drifting slot instead of popping by `oscillateX` (was
  ≈ +20 px first wave) when it joins. Verified: jump → ≤ 2.7 px. Full
  mechanism + measurements in §5b.

### 🟡 Medium impact (structural / contextual)

4. **Dispatcher guards — ⚠ mostly done (Phase D INT-7).** The `task_actv[0x15]`
   (fire-button active) guard is ported (`if (!state.tasks.playerFire) return`).
   `!task_actv[0x1D]` (no destroyed-capture-boss) and `glbl_enemy_enbl` have no
   port equivalent yet — currently always-pass, harmless in the states we enter.

5. **FD JUMP + FA LOOP_TOP — ✅ fixed in Phase E INT-7.** Dive paths
   now loop their inner attack section when cont_bmb is active, and
   take the short-dive-home path otherwise. F6 spawn-arming workaround
   removed.

6. **Boss attack behavior — ✅ done step 10 (4a–4d).** Was solo boss with the
   yellow path; now the full 3-bug capture squad (capture dive + escort/paired
   dive + 2-hit boss + rescue → 2-ship) on the real `ATTACK_PATH_BOSS`. See §14 +
   research_boss_capture.md.

   **Side-effect discovered during Phase C testing (verified against
   MAME):** in Z80, the boss_pool capture-squad pattern (3 enemies in
   flight at once, bypassing max-bombers via l_1B8B) means that when
   boss+wingmen launch, yellow/red dispatch PAUSES until the pool
   drains. User observed this in MAME: kill a yellow → "no more yellow
   attacks for a while" + "boss attacks with wingmen" — these are the
   same event (capture squad active). Our port has neither boss_pool
   nor wingmen, so this exact pattern never plays. But our port HAS
   a similar-looking effect (yellow pauses) for a different reason:
   our solo boss uses ATTACK_PATH_YELLOW with a fast 4-tick reload,
   eating one of the 2 max-bomber slots most of the time and
   crowding out yellow. Two paths to the same visual symptom.
   **✅ Resolved in step 10:** the real `boss_pool` + wingmen +
   `ATTACK_PATH_BOSS` landed, so the clone now reproduces the genuine
   capture-squad pause (yellow/red wait while the pool drains) rather
   than the look-alike artifact.

### 🟡 Medium impact (newly discovered in Phase E review)

7a. **F3 BREAK_TARGETED — ✅ fully ported (2026-06-18).** First fixed the
    arg count INT-7 (skip 8 LUT bytes), then ported the real handler
    `case_0A01` (gg1-5.s:1661-1715): player-X → bucket → `LUT[bucket]`
    becomes the turn-hold **duration**, current heading preserved.
    Verified by deterministic replay through `bugMotion.update()`: the
    duration sweep is monotonic in player X and mirror-symmetric under
    negateRotation, and a full-dive replay shows the moth's trajectory
    diverges ~70 px between player-far-left and player-far-right (was 0 —
    F3 used to be a no-op skip). Earlier "→ sub-path" framing was wrong
    (see §7 row).

7b. **negateRotation leaking from fly-in into attack.** ✅ Fixed INT-7.
    Z80 c_1083 (gg1-2.s:206-216) recomputes `0x13(ix) bit 7` on every
    attack launch from `objectId bit 1` (left pair member = 0, right
    pair member = 1). Our launchEnemyAttack was leaving whatever the
    fly-in pair-mirror logic had set, causing attackers whose fly-in
    set negate=true to execute the attack path mirrored — they flew
    UP and off the top edge instead of diving down. Fix:
    `e.negateRotation = (objectId & 0x02) !== 0` in launchEnemyAttack.
    Confirmed by visual observation: red butterfly at ID 0x40 (bit 1=0,
    so negate should be FALSE) was visibly executing with negate=TRUE
    before the fix.

7c. **F8 BEAM_ON arg count wrong (1, should be 0).** Causes F9 to be
    skipped in token sequences. Mostly harmless because F9 is also
    behavioral with no path effect. Fix: TOKEN_ARG_BYTES.F8 = 0.

### 🟢 Low impact / known deferred

8. FC/FE token handlers skipped — visual polish.
9. Bonus-bee skip in yellow scan — moot until bonus-bee exists (step 10).
10. Sound effects — no sound system yet.

## 9. Recommended fix sequence

**Phase A: Per-stage difficulty sourcing (high impact, low effort)**
- Add `state.newStageParms` array (10 elements + extras)
- Implement `c_2C00` equivalent in `gameController.stgInitEnv`: load
  bmbr_stg_cfg_dat row for current stage+rank, populate
  `state.newStageParms[0..9]`, init `state.b92C0` array
- runAttackMode reads MAX_BOMBERS, reload values from these arrays

**Phase B: Initial-timer fix — ✅ done INT-7**
- Initial timers come from c_2C00 hardcoded `0x0216` constant
  (new_stage.s:100-103), NOT from per-stage data as the original Phase B
  plan assumed. Set `boss=22*16=352, red=2*16=32, yellow=2*16=32` (× 16
  is the temporary scaling for our per-frame DEC; will normalize when
  Phase C's 16-frame DEC lands).
- Reverse dispatcher iteration order from `[yellow,red,boss]` to
  `[boss,red,yellow]` to match Z80 b_92C0[0..2] traversal in f_1B65.
  Without this, the iteration-order tie-breaking when both red and
  yellow timers hit 0 puts yellow first instead of red.
- Earlier Phase B plan (read from `newStageParms[1..3]`) was based on a
  doc misreading. Those nibbles drive RELOADS via f_0888, not initial
  timers. Phase C territory.

**Phase C: Z80-faithful timer cadence + reload-value sourcing — ✅ done INT-7**

**Phase C bugfix (same session):** initial Phase C dispatcher used two
loops — dec-all-timers, then iterate-and-fire — which looked cleaner but
**changed the semantics**. Z80's djnz pattern at gg1-2_fx.s:927-931 only
dec's the FIRST non-zero timer per tick, then early-exits to fire/gate.
This matters when max-bombers blocks the gate: in Z80 only `boss` (first
in iteration) keeps oscillating 0/1, while `red` and `yellow` timers
freeze at their previous values. In our two-loop version, all three
drained to 0 during gate-blocked periods; when the gate released, boss
won the iteration tie-break every time and yellow starved.

The fix: rewrite as a single pass mirroring Z80's djnz loop, with the
max-bombers + reload check integrated per-type (set timer back to 1 if
gated, reload + dispatch if not). Diagnosed by user observing
`yellowTimer === 0` with 11 valid formation candidates and no fire.

**Lesson** (echoes the Phase B doc-misreading lesson): when a Z80
control-flow pattern looks refactorable into idiomatic JS loops, **keep
the Z80 structure**. The "ugly" early-exit + per-type processing isn't
incidental — it's load-bearing for fairness across types under
max-bombers pressure.

- Ported the entire f_0857 (game_ctrl.s:1386-1438) as new task
  `tasks/bomberConfig.js` — runs every frame in 'playing' state.
- Ported lookup helpers `c_08AD`, `c_08BE` and tables `D_08CD_RED_RELOAD`
  (30B), `D_08EB_YELLOW_RELOAD` (30B), `D_0909_0929_BOMB_BOSS` (44B
  contiguous d_0909 + d_0929) into paths.js.
- `state.attackReloads.{boss,red,yellow}` and `state.bombDropFlags`
  added (mirror b_92C0[4..6] and b_92C0[8]).
- `state.gameTimers[2] = 0x78` (120) initialized in `stgInitEnv`
  — Z80 stage-elapsed timer, decremented at 2Hz, hits 0 after 60 sec.
  Drives column selection in c_08AD red/yellow tables and the
  MAX_BOMBERS ramp-up gate.
- Switched `runAttackMode` to gate-first dispatch: timer DEC now
  happens only on `frameCount & 0x0F == 0` (every 16 frames).
- Undid Phase B's `× 16` scaling on initial timers — values now
  stored as 16-frame ticks directly (boss=22, red=2, yellow=2).
- Z80-faithful tweak: timer is reloaded BEFORE tryLaunchAttack,
  matching l_1BC0 at gg1-2_fx.s:947-953. Even no-candidate frames
  consume a full reload cycle.
- Wired `bomberConfig` into TASK_TABLE, STATE_TASKS, dev panel.

**Phase D: Guard checks — ✅ done INT-7**
- Ported f_1B65 entry guards (gg1-2_fx.s:858-869):
  `if (!state.tasks.playerFire) return` at top of runAttackMode.
- Z80's two-condition gate (`task_actv[0x15] != 0 AND task_actv[0x1D] == 0`)
  simplifies to one check in our port: the destroyed-capture-boss rescue
  (`f_2000`) now exists (step 10, driven by `fighterCaptured`) but is **not wired
  as a dispatcher guard**, so the second condition is still effectively always-pass.
  Pausing attacks during a rescue animation is a minor follow-up.
- Without this guard, dev-panel toggling playerFire off would still
  let attackers dive — which doesn't match Z80.
- glbl_enemy_enbl (the outer wrapper condition) has no port equivalent
  yet; we treat it as always-true. Any `glbl_enemy_enbl == 0` window
  in Z80 (probably during stage transitions) would skip the guard
  entirely; we don't enter such windows currently.

**Phase E: FD JUMP + FA LOOP_TOP — ✅ done INT-7**
- FD JUMP handler in bugMotion.loadSegment — unconditional jump via
  path.z80Base address translation. Added z80Base = 0x34F (yellow) and
  0x3A9 (red) on the attack path arrays.
- FA LOOP_TOP handler — gated on state.contBmbFlag (mirrors Z80
  cont_bmb_flag at b_92A0[0x0A]). Computed in launchAttackWave.update
  from `aliveOnScreen < newStageParms[7]` and `tasks.playerFire`.
- Refactored loadSegment to take `state` so token handlers can read
  state-dependent flags.
- F6 spawn-arming workaround removed. ⚠ **This was a regression — corrected
  2026-06-21:** bombs are armed at attack LAUNCH (`j_108A`), not only at F6, so
  removing the launch-arming made the clone never bomb in normal play. Restored.
  See §6.
- IMPORTANT: FD and FA had to be implemented together. FD alone would
  loop attack paths forever on stage 1 (no FB inside the loop); FA's
  conditional jump is what gives early-stage attackers a way out via
  the FB tail.

**Homing formation-offset tracking — ✅ done INT-7 (fixed the visible
fly-in/dive snap-jump).** Flying/homing bugs now carry a per-frame offset
on the position (mirror `case_2422`, gg1-3.s:826-848): at FB they aim at
the live slot + seed `homeOscX/Y`, and each frame add the offset delta to
the position used for homing motion **and** the home-distance check, so the
bug arrives at the live slot and snaps seamlessly. Verified: jump → ≤ 2.7
px. See §5b for the full mechanism + measurements.

**Phase F: Step-10 territory**
- ~~Boss capture squad~~ ✅ done step 10 (4a–4d) — capture dive + escort/paired
  dive + 2-hit boss + rescue → 2-ship. See §14 + research_boss_capture.md.
- Bonus-bee — ⏳ still deferred (not part of the 4c/4d capture work)
- ~~F3 BREAK_TARGETED LUT~~ ✅ done 2026-06-18 (player-targeted turn-hold; see §7/§7a)
- Sound — ⏳ deferred

## 10. What we can claim about the current implementation

- ✅ Bytecode arrays are correct (no transcription errors)
- ✅ Token argument-byte counts are correct (F8 corrected 1→0, 2026-06-18, §7)
- ✅ Attack-dive INITIAL ANGLE = 0x100 (90°), per Z80 j_108A (gg1-2.s:243). Was hardcoded 0 (a placeholder) → moths veered left / one pair member flew up; 0x100 makes the pair dive down + split symmetrically. (2026-06-18; see launchEnemyAttack.)
- ✅ Per-type slot-scan logic is structurally correct
- ✅ FB TURN_HOME homing tracks the live oscillating formation (INT-7 — the `case_0AA0` + `case_2422` offset mechanism is ported; bug lands on the drifting slot, no snap-jump). See §5b.
- ✅ FD JUMP + FA LOOP_TOP correct (Phase E INT-7)
- ✅ MAX_BOMBERS sourced from per-stage data (Phase A INT-7)
- ✅ Bombs armed at attack LAUNCH (`j_108A`) + re-armed by F6 in the cont_bmb loop; drop Y-gate fixed to canvas ≥ 112; normal dives now bomb (2026-06-21, §6). ⚑ attack-dive-descent deviation flagged (§6.1)
- ✅ Initial-timer values match Z80 c_2C00 constants (Phase B)
- ✅ Dispatcher iteration order matches Z80 b_92C0 traversal (Phase B)
- ✅ Reload values dynamic via f_0857 lookup chain (Phase C)
- ✅ Timer DEC cadence Z80-faithful 16-frame (Phase C)
- ✅ Bomb-drop enable flags computed from per-stage data (Phase C)
- ✅ MAX_BOMBERS ramp-up after 30 sec elapsed (Phase C)
- ✅ Cont_bmb branch (memset reloads to 2) (Phase C)
- ✅ Dispatcher entry guards (playerFire gate) (Phase D)
- ✅ F3 BREAK_TARGETED ported — RED dives now hook toward the player (2026-06-18)
- ✅ F8 (Y→top) + F9 (X→home column) ported — dive wraps off the bottom, re-enters at the top, homes into the slot (2026-06-18, §7)
- ✅ EF BOMB_MODE ported — stage-gated jump to the harder continuous-bombing pass; dormant on stage 1 (2026-06-18, §7)
- ✅ F6 FREE_FLIGHT fully ported — heading redirect (arg×4, mirrored) + per-stage bomb-enable bitmask, not just bomb-arming (2026-06-18, §7)
- ✅ **Every token the MOTH (red) path uses is now fully implemented** (data, F3, F6, F8, F9, FA, FB, FD, EF, FF) — see §11
- ✅ **Every token the BEE (yellow) path uses is now fully implemented too** (data, FC, FA, F8, F9, EF, F6, FD, FB, FF) — FC ported 2026-06-19, see §12. No attack-path token stub remains for moth OR bee.
- ✅ **Every token the BOSS paths use is implemented too** (data, F4, FC, F8, F9, F1, FA, FB, FD, EF, F6, FF) — step 10 (4a–4d), see §14. `F4` (capture aim) + `F1` (Y→home row) are boss-distinctive.
- ✅ Boss capture squad implemented (capture dive + escort/paired dive + 2-hit boss + rescue → 2-ship), step 10 — see §14 + research_boss_capture.md
- ⚠ Dispatcher guard partial: `playerFire` gate ported (Phase D); `glbl_enemy_enbl` has no port equivalent yet
- ⏳ Sound, bonus-bee deferred

## 11. Moth (red) dive — token map + decision gates

Quick reference for the moth's break-formation dive: which path tokens it
uses, and the gates that decide which branch it takes. Source:
`db_flv_atk_red` (gg1-5.s:311). All ported as of 2026-06-18 (stage-1 path);
the moth does NOT use `F7` (fly-in CALL) or `FC` (bee dive-start).

### 11.1 Tokens the moth uses

| Token | Role | Appears in |
|-------|------|------------|
| data `0x12`/`0x23` | 3-byte motion segment `[vx/vy nibbles, signed rotRate, duration]` — the actual flight | throughout |
| `F3` | **player-targeted turn-hold** — read ship X, pick a turn-HOLD duration from an 8-byte LUT (moth-only) | `p_flv_03ac`, `p_flv_03d7` |
| `F6` | "free flight" run — set heading (`arg×4`, mirrored) + arm bombs (`bombCounter`=30, `bombEnable`=per-stage bitmask) | `p_flv_03cc`, `p_flv_03d7` |
| `F8` | reposition **Y → top edge** (`0x01(ix)=0x9C` → canvas Y 1) | `p_flv_03ac`, `p_flv_03d7` |
| `F9` | reposition **X → home column** (`0x03(ix)` → `e.homeX`) | `p_flv_03ac`, `p_flv_03d7` |
| `FA` | LOOP_TOP — **gated jump** (see gate 3) | `p_flv_03ac`, `p_flv_03d7` |
| `FB` | TURN_HOME → enter `homing` (track live slot, land in formation) | `p_flv_040c` |
| `FD` | unconditional JUMP (via `z80Base`) — wires the attack loop | `p_flv_03cc`, `p_flv_03d7` |
| `EF` | BOMB_MODE — **stage-gated jump** (see gate 4) | `p_flv_03ac` |
| `FF` | terminate (defensive; FB takes over first) | `p_flv_040c` tail |

### 11.2 The four gates that steer the moth

1. **`negateRotation`** — per-enemy, set at launch from `objectId & 0x02`
   (`c_1083`, gg1-2.s:206). Negates every segment's `rotRate` **and** the
   `F3` player-delta. Net: the two members of a launch pair sweep **mirrored**
   arcs (one hooks left, one right).
2. **Player X** (live, `ds_sprite_posn+0x62`) — read by **`F3`** to pick the
   turn-hold bucket (0–7). Decides **how far / which way** the dive curves to
   aim at the ship. (§7/§7a.)
3. **`contBmbFlag`** (live) — `aliveOnScreen < newStageParms[7]` AND the
   fire-button task active (`gg1-5.s:489`). The **`FA`** gate:
   - **false** (most of a stage, many enemies) → `FA` jumps to `p_flv_040c`
     → `FB` → **moth homes back to formation**.
   - **true** (few enemies left, the endgame) → `FA` falls through → reach `EF`.
4. **`newStageParms[9]`** (per-stage, fixed at stage init via `c_2C00`) — the
   **`EF`** gate. **First nonzero at STAGE 12** (rank 3), *not* stage 8:
   - **== 0** (stages ≤ 11) → `EF` skips → `p_flv_03cc` → `F6` + `FD` →
     **re-loop the SAME dive** (`p_flv_03ac`).
   - **!= 0** (stage ≥ 12) → `EF` jumps to `p_flv_03d7` → a **harder pass**
     (2nd `F3` targeting dive + `F8`/`F9` + `FD` loop) → **continuous bombing**.

### 11.3 Decision flow

```
LAUNCH  (angle = 0x100 = 90°/down ; negateRotation = objectId & 0x02)
  │  descend → begin turn (data segments; rotRate sign per negateRotation)
  │  F3  → read player X → turn-hold duration → CURVE TOWARD THE SHIP
  │  counter-turn segments
  │  F8 (Y→top) , F9 (X→home column)
  │
  FA ── contBmbFlag? ───────────────────────────────────────────────┐
        │ false → jump p_flv_040c → FB TURN_HOME → HOME INTO SLOT     │ (returns)
        │ true  → fall through ↓                                      │
        EF ── newStageParms[9]? ──────────────────────────────────────┤
              │ ==0 (stage ≤11) → skip → p_flv_03cc → F6+FD → loop dive│ (re-dive)
              │ !=0 (stage ≥12) → jump p_flv_03d7 → harder F3 pass     │ (continuous bombing)
              │                    → F8/F9 → FD → loop                 │
```

Gates 1–2 shape **one dive** (direction + aim); gates 3–4 decide **what
happens after** the dive (home / re-loop / escalate). In normal stage-1 play
only gate 3 is ever exercised (and it's almost always `false` → home), which
is why a lone surviving moth is the only one that visibly re-loops.

## 12. Bee (yellow) dive — token map + decision gates

The bee's break-formation dive. Source: `db_flv_atk_yllw` (gg1-5.s:285). All
tokens ported as of 2026-06-19. **vs the moth (§11):** the bee has **`FC`**
(a dive-to-Y trigger) and has **no `F3`** (targeting is moth-only) — otherwise
the same vocabulary.

### 12.1 Tokens the bee uses

| Token | Role | Appears in |
|-------|------|------------|
| data `0x12`/`0x23` | 3-byte motion segment | throughout |
| **`FC`** | **dive-to-Y** — arm a screen-Y; force-expire the current segment once the bee dives to it (then turn for home). *Bee-only.* | `p_flv_0358`, `p_flv_037c` |
| `FA` | LOOP_TOP — gated jump | `p_flv_0358`, `p_flv_037c` |
| `FB` | TURN_HOME → home into slot | `p_flv_039e` |
| `FD` | unconditional JUMP (loop wiring) | `p_flv_036c`, `p_flv_037c` |
| `F6` | "free flight" — heading (`arg×4`) + arm bombs | `p_flv_036c`, `p_flv_037c` |
| `F8` / `F9` | Y→top / X→home column | `p_flv_036c` |
| `EF` | BOMB_MODE — stage-gated jump | `p_flv_036c` |
| `FF` | terminate | `p_flv_039e` tail |

No `F3` (no player-targeting), no `F7`/`F0` (those are fly-in CALL tokens).

### 12.2 The gates that steer the bee

1. **`negateRotation`** (`objectId & 0x02`) — mirrors every segment's `rotRate`
   → pair members sweep opposite arcs. (Same as the moth; no F3 to also mirror.)
2. **`FC` dive-Y** (per-dive, from the token's arg) — gates the **turn-for-home
   point**: the descent segment ends when the bee reaches screen-Y `0x2e`
   (canvas ~221) **or** the segment's frame-count runs out, whichever first.
   On stage 1 the bee only reaches ~y173, so the frame-count wins and FC is a
   no-op in practice; it bites on deeper dives.
3. **`contBmbFlag`** (`aliveOnScreen < newStageParms[7]` + fire active) — the
   **`FA`** gate: false → `p_flv_039e` → `FB` home; true → fall through to the
   loop (`F8`/`F9`/`EF`/`F6`/`FD`).
4. **`newStageParms[9]`** (per-stage, first nonzero at stage 12) — the **`EF`**
   gate: 0 → skip (re-loop); nonzero → continuous-bombing pass.

### 12.3 Decision flow

```
LAUNCH  (angle = 0x100 = 90°/down ; negateRotation = objectId & 0x02)
  │  descend → FC arms dive-Y (0x2e) → turn segment (rotRate −6)
  │            └─ ends at Y=0x2e OR on duration (whichever first)
  │  (no F3 — the bee does NOT aim at the player)
  │
  FA ── contBmbFlag? ───────────────────────────────────────────────┐
        │ false → p_flv_039e → FB TURN_HOME → HOME INTO SLOT          │ (returns)
        │ true  → p_flv_036c: F8/F9 (→top/home-col) · EF · F6 · FD    │ (loop / escalate)
        EF ── newStageParms[9]? ── 0 → re-loop · !=0 → harder pass    │
```

The bee's dive is **simpler than the moth's** in one key way: it has no
player-targeting (`F3`), so its descent is a fixed scripted arc rather than a
heading bent toward the ship. The `FC` dive-to-Y is the bee's distinctive
mechanic — a position-gated turn-for-home instead of the moth's `F8`/`F9`
top-wrap. (On stage 1, with shallow dives + `contBmb` rarely true, the bee just
descends its scripted arc and homes — gates 2–4 stay dormant, same as the moth.)

## 13. Attack-path script structure (sub-path composition)

Each enemy TYPE owns exactly **one** top-level attack-path table, built from
several **sub-paths** laid out inline and wired together by the jump tokens
(`FA` LOOP_TOP, `FD` JUMP, `EF` BOMB_MODE) and fall-through. In the port each
table is a single `Uint8Array`; sub-paths are reached by translating the
embedded Z80 addresses via `pathBase.z80Base`. (Verified by tokenizing each
table — the byte-walk ends exactly at the table length, so the sub-path
boundaries are consistent.)

| Type | Top-level table | Port array | Sub-paths |
|------|-----------------|------------|-----------|
| **Moth (red)** | `db_flv_atk_red` (gg1-5.s:311) | `ATTACK_PATH_RED` | **4** |
| **Bee (yellow)** | `db_flv_atk_yllw` (gg1-5.s:285) | `ATTACK_PATH_YELLOW` | **6** |
| **Boss** | boss-path region (gg1-5.s:335-369) | `ATTACK_PATH_BOSS` + `BOSS_CARRYHOME_PATH` | **4 paths** — see §14.1 |

### 13.1 Moth (red) — 4 sub-paths

| Sub-path | Role |
|---|---|
| `db_flv_atk_red` (header) → `p_flv_03ac` | entry |
| `p_flv_03ac` | main dive — descent + `F3` targeting + counter-turns + `F8`/`F9` top-wrap + `FA` + `EF` |
| `p_flv_03cc` | re-loop body — `F6` re-arm + `FD` → back to `p_flv_03ac` (when `EF` skips, stages ≤11) |
| `p_flv_03d7` | harder continuous pass — `F6` + 2nd `F3` + `F8`/`F9` + `FD` (the `EF` target, stage 12+) |
| `p_flv_040c` | home tail — `FB` TURN_HOME → terminate (the `FA` jump target) |

### 13.2 Bee (yellow) — 6 sub-paths

| Sub-path | Role |
|---|---|
| `db_flv_atk_yllw` (header) → `p_flv_0352` | entry / initial descent |
| `p_flv_0358` | descent + `FC` dive-Y + `FA` — the turn-for-home decision point |
| `p_flv_0363` | loop-branch descent (entered when `FA` falls through, contBmb) |
| `p_flv_036c` | loop body — `F8`/`F9`/`EF`/`F6`/`FD` (the continuous re-dive) |
| `p_flv_037c` | harder/`EF`-target pass |
| `p_flv_039e` | home tail — `FB` TURN_HOME → terminate |

Same shape, the moth's just more compact (its `F3` targeting + top-wrap fold
into the single main pass `p_flv_03ac`; the bee spreads descent/turn/loop over
two extra sub-paths).

### 13.3 Notes

- **Fly-in is NOT type-specific.** A bug enters formation on whatever entrance
  path the WAVE data assigns (the `db_flv_001d`-style tables, shared across all
  types). The only type-owned path is the one attack table above. (The boss owns
  the **boss-path region** `ATTACK_PATH_BOSS` + the carry-home `BOSS_CARRYHOME_PATH`
  — see §14; step 10 replaced the earlier "boss reuses `ATTACK_PATH_YELLOW`"
  stand-in.)
- **Some sub-paths are shared (ROM code-reuse), not extra scripts.** The home
  tail `p_flv_040c` has 4 `.dw` refs (2 from red's `FA` sites + 2 fly-in paths);
  the bee's `p_flv_0358`/`0363`/`039e` are also jumped into by the
  challenging-stage paths (`db_0473`/`04AB`/`04EA`). Counted once, as part of
  their owning attack table.

## 14. Boss sortie + capture dive — token map + decision gates

The boss is the odd one out: it does **not** run `ATTACK_PATH_RED`/`YELLOW`. It
owns the **boss-path region** (`ATTACK_PATH_BOSS`, paths.js:273 — the contiguous
ROM `0x40C–0x46A`: shared home tail `p_flv_040c` + escort sortie `db_flv_0411` +
rogue `db_fltv_rogefgter` + capture dive `db_0454`) plus the separate **carry-home**
array (`BOSS_CARRYHOME_PATH` / `db_flv_cboss`). It launches in **two flavors** and
flies **two more** paths across the capture lifecycle. Source: gg1-5.s:335-369
(paths) + gg1-2_fx.s:1011-1043 (`case_bmbr_boss` select). Built in **step 10**
(sub-steps 4a–4d).

> **The capture *mechanic* — tractor beam, ship-in-beam, pull/spin, 2-hit boss,
> rescue → 2-ship — is its own document: [`research_boss_capture.md`](research_boss_capture.md).**
> This section covers only the boss's **path/token movement** and hands off at the
> beam.

### 14.1 The four boss paths

| Path | Role | Entry |
|---|---|---|
| `db_0454` **capture dive** | solo tractor-beam mission — dive, aim at the ship, halt, open beam | `ATTACK_PATH_BOSS` offset 72 (`CAPTURE_ENTRY_OFFSET`) |
| `db_flv_0411` **escort sortie** | boss + 1–2 wingmen; once it owns a slave, the **paired rescue dive** brings the captured ship down | `ATTACK_PATH_BOSS` offset 5 (`.entryOffset`) |
| `db_flv_cboss` **carry-home** | flies the captured ship home (loaded into the boss's slot by `f_2222 l_2305` on connect) | `BOSS_CARRYHOME_PATH` |
| `db_fltv_rogefgter` **rogue** | standalone fallback (no boss/escort available) — ⏳ **deferred, never entered** (G21) | `ATTACK_PATH_BOSS` offset 56 (verbatim, for address alignment) |

### 14.2 Tokens the boss uses

| Token | Role | Appears in |
|-------|------|------------|
| data `0x12`/`0x23`/`0x00` | 3-byte motion segment. The `00 FC FF` segment (vx=0) is the **halt cue** — see gate 3 | all |
| **`F4`** | **capture aim** (boss-only) — read player X, clamp to a lane, point down-and-at the ship, arm the capture-dive monitor (`captorDive`/`f_21CB`). `case_0A53`, gg1-5.s:1724 | `db_0454` |
| `FC` | dive-to-Y (arg `0x48` ≈ y169) — shared with the bee | `db_0454` |
| `F8` | reposition **Y → top edge** | `db_0454` |
| `F9` | reposition **X → home column** | `db_0454`, `db_flv_0411` |
| **`F1`** | reposition **Y → home row** (above the top) — the boss-sortie counterpart of the moth's `F8`. `case_0968`, gg1-5.s:1551 | `db_flv_0411` |
| `FA` | LOOP_TOP — gated jump (gate 4) | `db_0454`, `db_flv_0411` |
| `FB` | TURN_HOME → enter `homing`, land in formation | `p_flv_040c` (tail), `db_flv_cboss` |
| `FD` | unconditional JUMP (loop wiring, via `z80Base`) | `db_0454`, `db_flv_0411` |
| `EF` | BOMB_MODE — stage-gated jump (gate 4) | `db_flv_0411` |
| `F6` | "free flight" — heading + **arm bombs** | `db_flv_0411` **only** (escort/paired); `db_0454` + `db_flv_cboss` have **no `F6`** → those paths never fire |
| `FF` | terminate | `db_flv_cboss`, rogue, shared tail |

### 14.3 The gates that steer the boss

1. **Capture-squad select** (`case_bmbr_boss`, gg1-2_fx.s:1011) — every **other**
   boss launch is a capture mission (`captureToggle` ⇔ `_b_bmbr_boss_wingm`),
   gated by `captureActive` ⇔ `_b_bmbr_boss_cflag` (**one capture at a time** —
   the flag stays set the whole time a ship is held; see
   [research_boss_capture.md](research_boss_capture.md) §9 review fix). A capture
   turn queues the first standby boss **solo** on `db_0454`. Otherwise → an
   **escort sortie** on `db_flv_0411` with 1–2 wingmen; a boss that already owns a
   slave can't open a fresh beam, so it dives as an escort **bringing the slave**
   (the rescue chance). `launchAttackWave.js:359-401`.
2. **`F4` capture aim** (boss-only) — reads the **live** player X, clamps it to a
   capture lane (canvas [25,185]), points the heading down-and-at the ship, and
   arms `captorDive` (`f_21CB`). This is what makes the capture boss **position
   over the ship**, unlike the escort's fixed arc. `bugMotion.js` `0xF4`.
3. **The `00 FC FF` stall = the halt cue** — a vx=0 data segment; `captorDive`
   (`f_21CB`) detects vx=0, spins the boss to face DOWN, and **opens the tractor
   beam** (`f_2222`). **→ from here it is [research_boss_capture.md](research_boss_capture.md)**
   (beam grow/grab/shrink → ship-in-beam → pull/spin → connect → carry-home →
   rescue → 2-ship).
4. **`contBmbFlag`/`FA`** and **`newStageParms[9]`/`EF`** — the **same** gates as
   the moth/bee (§11/§12): on the escort/loop sub-paths `FA` picks home-vs-loop and
   `EF` picks re-loop-vs-continuous. Dormant on stage 1.

### 14.4 Decision flow

```
case_bmbr_boss select ── capture turn? ───────────────────────────────────────┐
  │ YES → db_0454 CAPTURE DIVE                                                  │
  │        descend → F4 aim at ship → FC dive-to-Y → 00 FC FF STALL            │
  │        └─ f_21CB halt cue → spin down → OPEN BEAM (f_2222)                 │
  │           └──► research_boss_capture.md: ship-in-beam → pull → CONNECT     │
  │                 → db_flv_cboss CARRY-HOME (FB → slot, no F6)               │
  │                 → f_19B2 settle slave above boss (red, standby)            │
  │ NO  → db_flv_0411 ESCORT SORTIE (boss + 1–2 wingmen)                       │
  │        dive arc → F9/F1 (X→col / Y→top) → FA ── contBmb? ── home / loop    │
  │        F6 arms bombs (escort/paired only)                                   │
  │        └─ a boss that owns a slave dives here, bringing it = RESCUE CHANCE │
  │           └──► shoot the blue, holding boss → f_2000 → 2-ship             │
  └──────────────────────────────────────────────────────────────────────────┘
  (db_fltv_rogefgter standalone-rogue path — ⏳ deferred, never entered)
```

Gates 1–2 decide **which dive** (capture vs escort) and **where the capture dive
aims**; the beam/pull/rescue machine downstream of the halt cue is
`research_boss_capture.md`'s domain. **Bombing (corrected 2026-06-21, §6):** boss +
wingmen are armed at attack launch (`j_108A`) like any diving enemy, so they CAN
bomb on a normal escort sortie — `FA` homing before `F6` only skips the cont_bmb
*re*-arm, not the launch arm. (The earlier "dive without bombing — matching the
Z80" note here was the same wrong reading.) The clone's **glued slave** still never
fires — it isn't a path-runner so it never arms (deviation D3).
