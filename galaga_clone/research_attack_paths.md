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
| Boss+wing pool (capture squad queue) | check first, before per-type | none | ⏳ step 10 |
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
- **No bonus-bee skip** ⚠ — we don't have a bonus-bee object yet, so this is currently moot, but will matter when step 10 adds it
- Returns first match (first-found = first available in formation order) ✅

### 4.2 Red (gg1-2_fx.s:1004-1008) — ✅ verified

Z80:
- Range b_8800[0x40..0x5E] (16 red moths)
- Falls through to common `l_1BDF` (same logic as yellow)

Our `tryLaunchAttack(state, 'red')`:
- Range `e.objectId 0x40..0x5E` ✅
- Same filter logic ✅

### 4.3 Boss (gg1-2_fx.s:1011+) — ❌ wrong / oversimplified

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

## 6. F6 spawn-arming workaround

**Status: ✅ removed in Phase E INT-7.** With FD JUMP and FA LOOP_TOP
implemented (§7), F6 now fires at its proper offset inside the inner
attack loop. In normal-mode stage 1 (most of the round), FA at offset
17 jumps directly to the FB tail before reaching F6, so attackers don't
drop bombs at all — matching Z80 behavior. In late stage 1 (≤5 enemies
left, cont_bmb active), FA falls through, the path continues to F6
(offset 34, arms bombs), then FD JUMP loops the inner section so F6
re-fires every loop iteration.

Previously (pre-Phase E):
```js
// Phase 8e simplification: ... bombs at spawn ...
e.bombCounter = 0x1E;
e.bombEnable  = 0xFF;
```
Now:
```js
e.bombCounter = 0;
e.bombEnable  = 0;
```

## 7. Token handlers (attack context)

Our `bugMotion.loadSegment` skips most of these as no-ops with arg-byte
counting. For attack paths specifically:

| Token | Z80 case | Status in our port |
|-------|----------|---------------------|
| 0xF3 BREAK_TARGETED | case_0A01 (gg1-5.s:1661) | ✅ **PORTED (2026-06-18).** Player-targeted turn-hold: reads player X, computes `(playerX−mothX)/4` (signed, mirrored by negateRotation), biases +0x18, clamps [0,0x2F], `/6` → bucket 0-7, and writes `LUT[bucket]` into the segment **duration** (0x0D), then continues the current heading. **Doc correction:** earlier rows here said F3 does a "LUT lookup → *sub-path*". It does NOT select a sub-path — it picks a turn-HOLD DURATION (`0x0D(ix)`) and `jp l_0BFF_flite_pth_skip_load` (gg1-5.s:1715) keeps the prior segment's vx/vy/rotRate. The longer hold of the preceding `0x12,0xFA,..` (rotRate −6) turn = bigger hook toward the player. See `bugMotion.js` loadSegment `0xF3` block. |
| 0xF6 FREE_FLIGHT | case_0BA8 (gg1-5.s:1963) | ✅ **FULLY PORTED (2026-06-18).** All 3 effects: (1) sets heading `0x04/0x05 = (arg, mirrored by negateRotation) << 2` (arg×4); (2) bomb counter `0x0E = 0x1E`; (3) bomb-enable bitmask `0x0F = b_92C0[8]` (= `state.bombDropFlags`, was hardcoded `0xFF`). Earlier the heading-redirect was skipped — now done. |
| 0xF7 ATTACK_TURN | case_0B98 (gg1-5.s:1947) | ✅ correct skip (transient-only behavior; not used for non-transient bombers) |
| 0xF8 | case_0B87 (gg1-5.s:1929) | ✅ **PORTED (2026-06-18).** In the attack/home context this is NOT "BEAM_ON" — it repositions the bug's **Y to the top** ("flew through the bottom of the screen to the top"): Z80 sets `0x01(ix) = 0x0138>>1 = 0x9C`; `rawYToCanvasY(0x9C) = 1` (top edge). **0-arg** token (the old TOKEN_ARG_BYTES.F8=1 was wrong, §7c). Pairs with F9 + the FB tail. See `bugMotion.js` `0xF8` block. |
| 0xF9 (case_0B5F) | gg1-5.s:1907 | ✅ **PORTED (2026-06-18).** Sets the bug's **X to its home-column** coordinate (`0x03(ix) = ds_hpos_spcoords[col]/2 → rawXToCanvasX = e.homeX`), so it re-enters above its slot. 0-arg; skips the cocktail flip-screen branch + cont_bmb dive-sound (unmodelled). With F8, the moth re-appears at `(homeX, top)` then FA→FB homes it down — the faithful "dive off bottom → re-enter top → fly down to formation" loop. |
| 0xFA LOOP_TOP | case_0BD1 (gg1-5.s:1984) | ✅ Phase E INT-7 — gated on state.contBmbFlag. Jumps to FB tail when cont_bmb=false (most of stage 1), falls through when cont_bmb=true (late stage 1, ≤5 enemies). |
| 0xFB TURN_HOME | case_0AA0 | ✅ INT-7 — homing tracks the live oscillating slot (per-frame offset re-sync, the `case_2422` mirror); bug lands on the drifting formation with no jump. **See §5b.** |
| 0xFC RTN_FMTN/DIVE | case_0B4E (gg1-5.s:1896) | ⚠ skip (1 arg). Sets dive-origin Y for boss — needs check |
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

4. **Missing guards.** Z80 requires `task_actv[0x15]` (fire button
   active) and `!task_actv[0x1D]` (no destroyed-capture-boss). Our
   port runs unconditionally. Could cause bombers to dive during
   wrong game states.

5. **FD JUMP + FA LOOP_TOP — ✅ fixed in Phase E INT-7.** Dive paths
   now loop their inner attack section when cont_bmb is active, and
   take the short-dive-home path otherwise. F6 spawn-arming workaround
   removed.

6. **Boss attack behavior oversimplified.** Currently solo boss with
   yellow path; should be 3-bug capture squad. Step 10 territory but
   worth flagging.

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
   crowding out yellow. Two paths to the same visual symptom; both
   resolve when Phase F lands proper boss_pool + wingmen + boss path.

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
  simplifies to one check in our port: task_actv[0x1D] (destroyed-capture-
  boss) doesn't exist yet (Phase F), so it's always 0 = always passes.
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
- F6 spawn-arming workaround removed. Bombs now arm at the path's F6
  offset, which fires only when cont_bmb is active (late stage 1).
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

**Phase F: Step-10 territory (deferred)**
- Boss capture squad
- Bonus-bee
- ~~F3 BREAK_TARGETED LUT~~ ✅ done 2026-06-18 (player-targeted turn-hold; see §7/§7a)
- Sound

## 10. What we can claim about the current implementation

- ✅ Bytecode arrays are correct (no transcription errors)
- ✅ Token argument-byte counts are correct (F8 corrected 1→0, 2026-06-18, §7)
- ✅ Attack-dive INITIAL ANGLE = 0x100 (90°), per Z80 j_108A (gg1-2.s:243). Was hardcoded 0 (a placeholder) → moths veered left / one pair member flew up; 0x100 makes the pair dive down + split symmetrically. (2026-06-18; see launchEnemyAttack.)
- ✅ Per-type slot-scan logic is structurally correct
- ✅ FB TURN_HOME homing tracks the live oscillating formation (INT-7 — the `case_0AA0` + `case_2422` offset mechanism is ported; bug lands on the drifting slot, no snap-jump). See §5b.
- ✅ FD JUMP + FA LOOP_TOP correct (Phase E INT-7)
- ✅ MAX_BOMBERS sourced from per-stage data (Phase A INT-7)
- ✅ F6 bomb-arming fires at proper path offset (Phase E INT-7)
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
- ⚠ FC token (bee dive-start, sets return-home Y) still a no-op skip — BEE-path only, not yet needed
- ❌ Missing dispatcher guards (Phase D)
- ❌ Boss capture squad is missing (Phase F / step 10)
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
