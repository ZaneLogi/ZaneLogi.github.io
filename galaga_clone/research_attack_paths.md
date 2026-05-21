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
| 0xF3 BREAK_TARGETED | case_0A01 (gg1-5.s:1661) | ❌ TOKEN_ARG_BYTES says 2 args but Z80 advances HL by 9 (`ld a,#9; rst 0x10` at gg1-5.s:1717) — token + 8-byte LUT. Currently mis-skips, causing RED path to misread LUT bytes 12-17 as 2 spinning segments. Fix: TOKEN_ARG_BYTES.F3 = 8. **Critical for RED path correctness — Phase F.** Real handler (player-deltaX → LUT lookup → sub-path) is also Phase F. |
| 0xF6 FREE_FLIGHT | case_0BA8 (gg1-5.s:1963) | ✅ now arms bombs at the proper path offset (Phase E removes the spawn-time workaround) |
| 0xF7 ATTACK_TURN | case_0B98 (gg1-5.s:1947) | ✅ correct skip (transient-only behavior; not used for non-transient bombers) |
| 0xF8 BEAM_ON | case_0B87 (gg1-5.s:1935) | ⚠ TOKEN_ARG_BYTES says 1 arg but Z80 case_0B87 reads 0 args (just `inc hl`); off-by-one mostly harmless on stage 1 since F9 is also 0-arg behavioral. **Bug to fix in Phase F.** |
| 0xF9 (case_0B5F) | gg1-5.s:1907 | ⚠ skip (0 args). Loop-back from below screen — visual effect missed |
| 0xFA LOOP_TOP | case_0BD1 (gg1-5.s:1984) | ✅ Phase E INT-7 — gated on state.contBmbFlag. Jumps to FB tail when cont_bmb=false (most of stage 1), falls through when cont_bmb=true (late stage 1, ≤5 enemies). |
| 0xFB TURN_HOME | case_0AA0 | ✅ properly handled (INT-7 homing state) |
| 0xFC RTN_FMTN/DIVE | case_0B4E (gg1-5.s:1896) | ⚠ skip (1 arg). Sets dive-origin Y for boss — needs check |
| 0xFD JUMP | case_0B46 (gg1-5.s:1885) | ✅ Phase E INT-7 — unconditional jump via path.z80Base address translation. Used by attack-yellow inner loop (offset 42 → 3) and attack-red inner loop (offsets 43 → 3, 96 → 35). |
| 0xEF BOMB_MODE | case_094E (gg1-5.s:1523) | ✅ correct skip (stage 8+ gated) |

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

7a. **F3 BREAK_TARGETED arg count wrong (2, should be 8).** ✅ Fixed
    INT-7 (TOKEN_ARG_BYTES.F3 = 8). Verified against Z80 case_0A01
    (gg1-5.s:1717): `ld a,#9; rst 0x10` advances HL by 9. RED path no
    longer mis-spins at offset 9. Real handler (player-deltaX → LUT
    lookup → sub-path) is still Phase F.

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

**Phase F: Step-10 territory (deferred)**
- Boss capture squad
- Bonus-bee
- F3 BREAK_TARGETED LUT
- Sound

## 10. What we can claim about the current implementation

- ✅ Bytecode arrays are correct (no transcription errors)
- ✅ Token argument-byte counts are correct (except F8 — see §7 Phase F note)
- ✅ Per-type slot-scan logic is structurally correct
- ✅ FB TURN_HOME homing is correct (INT-7)
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
- ⚠ F3/FC/F8 token semantics are partial
- ❌ Missing dispatcher guards (Phase D)
- ❌ Boss capture squad is missing (Phase F / step 10)
- ⏳ Sound, bonus-bee deferred
