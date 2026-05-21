# Galaga Stage-Init Data — Verified Specification

Source-of-truth: `C:\Z_Temp\hackbar_galaga\rom0\` (`gg1-3.s` for all citations
unless noted). Every claim below is tagged **[verified]** with a line citation
or **[inferred]** when reasoning beyond the source.

## 1. Two-stage data flow

The launcher does NOT read `d_combat_stg_dat` directly each frame. There's an
intermediate runtime structure built once at stage-init by `c_25A2`:

```
   d_combat_stg_dat            ds_8920 (runtime)             ds_bug_motion_que
   (static, gg1-3.s:1461)  ──► (token stream + pairs) ─────► (per-bug structs)
                  c_25A2  build               f_2916  per-frame launcher
```

The runtime stream `ds_8920` has a different shape than the static data: it's
a flat sequence of `0x7E`-delimited groups, each group containing 4 pairs of
`[path_byte_1, ID_lefty, path_byte_2, ID_righty]`, terminated by `0x7F`.

## 2. d_combat_stg_dat row layout [verified, gg1-3.s:1450-1473]

Each row = one stage = 18 bytes:

| Offset | Bytes | Meaning |
|--------|-------|---------|
| 0      | 1     | Stage parm 0 → `b_92E2[0]` (purpose currently unverified) |
| 1      | 1     | Stage parm 1 → `b_92E2[1]` = bomb-drop enable bits, fed into `0x0F(ix)` per bug |
| 2-4    | 3     | Wave 1 triplet: `[byte0, byte1, byte2]` |
| 5-7    | 3     | Wave 2 triplet |
| 8-10   | 3     | Wave 3 triplet |
| 11-13  | 3     | Wave 4 triplet |
| 14-16  | 3     | Wave 5 triplet |
| 17     | 1     | `0xFF` terminator |

**Stage 1 row (gg1-3.s:1462):**
```
0x14, 0x00,                 ; header: parm0=0x14, parm1=0x00 (no bomb drops in stage 1)
0x00, 0x00, 0xC0,           ; wave 1
0x00, 0x01, 0x01,           ; wave 2
0x00, 0x41, 0x41,           ; wave 3
0x00, 0x40, 0x40,           ; wave 4
0x00, 0x00, 0x00,           ; wave 5
0xFF                        ; end-of-stage
```

**Stage rank/cycling:** `c_25A2` lines 1180-1212 use `b_stgctr` modulo logic
(after stage 23, only the last 4 levels repeat) plus `b_mchn_cfg_rank`
(difficulty rank A/B/C/D) to pick a row from `d_combat_stg_dat_idx`. Stage 1
always selects row 0 regardless of rank.

## 3. Wave-byte (path byte) bit decoder

The comment at gg1-3.s:1450-1458 documents the bits, **and the code verifies it
exactly**:

| Bit  | Meaning | Verification |
|------|---------|--------------|
| 0-5  | Index into `db_2A3C` (PATH_INDEX). Max 0x17 (24 entries). | gg1-3.s:1733 `sla c` then used as offset; gg1-3.s:1838-1842 |
| 6    | (a) Pair-member selector (entry 2N vs 2N+1 in db_2A6C) AND (b) **NEGATE-ROTATION flag** | gg1-3.s:1868-1873 (member); gg1-3.s:1892-1894 (negate flag stored in 0x13(ix) bit 7); gg1-5.s:2014-2018 (rotation negation applied per segment) |
| 7    | If CLEAR: this launch is gated by `frame_cnt & 0x07` (waits for frame mod 8 == 0) | gg1-3.s:1723-1728 |
| 0    | (Also) selects bomb-drop-counter init: 0x44 ("sides entry") if set, 0x08 ("top entry") if clear | gg1-3.s:1828-1834 |

**The negate-rotation flag is the missing piece in our JS port.** When pair
member 1 launches (bit 6 set), the per-segment rotation rate is `neg`-ed
before being stored at `0x0C(ix)`. So if member 0's path rotates
clockwise, member 1 rotates counterclockwise — they sweep in mirrored arcs.
This is what creates Galaga's iconic symmetric pair entries.

## 4. Variant-table indexing [verified, gg1-3.s:1856-1873]

`db_2A3C` (PATH_INDEX) entries pack `(addr, variant_bits)` into one .dw word:
- bits 0-12: path data address
- bits 13-15: variant_bits (3 bits, value 0-7)

`db_2A6C` (VARIANTS) is **12 entries × 3 bytes** (Y_high, X_high, rotHi). Indexed
as PAIRS, with byte-offset arithmetic:

```
byte_offset = variant_bits × 6 + (bit_6_of_wave ? 3 : 0)
entry_index = byte_offset / 3 = variant_bits × 2 + (bit_6_of_wave ? 1 : 0)
```

So `variant_bits N` → pair N (entries `2N`, `2N+1`). Bit 6 of wave byte picks
which member of the pair.

Stage 1 examples:
- Wave 1 byte_1 = 0x00 → idx 0, member 0 → entry 0 = (Y=0x9B, X=0x34, rotHi=0x03)
- Wave 1 byte_2 = 0xC0 → idx 0, member 1 → entry 1 = (Y=0x9B, X=0x44, rotHi=0x03), **negate-rotation set**

## 5. db_attk_wav_IDs structure [verified, gg1-3.s:1489-1494]

5 rows × 8 IDs = 40 IDs total. **NOT consumed in row order during pair
formation.** `c_25A2` lines 1318-1343 reads 8 IDs and places them into a
16-slot temp buffer at the FF positions, with a hop at count==5 that
**splits the 8 IDs into TWO halves of 4**, occupying slots 0-3 ("lefty"
section) and 8-11 ("righty" section). Slots 4-7 and 12-15 stay 0xFF unless
filled by transients (see §6).

**Stage 1 wave 1 tmp_buf layout** (after `c_25A2` line 1343):
```
[0x58, 0x5A, 0x5C, 0x5E, FF, FF, FF, FF, 0x28, 0x2A, 0x2C, 0x2E, FF, FF, FF, FF]
 ── lefties ──        transients?         ── righties ──        transients?
```

Pair construction (lines 1357-1378) walks lefty positions; for each one,
it grabs the corresponding righty 8 slots later. Output to `ds_8920`:

```
[byte_1, lefty_ID, byte_2, righty_ID]   ← repeated 4 times per wave
```

**Stage 1 wave 1 runtime stream** (assembled by c_25A2):
```
0x7E,
0x00, 0x58, 0xC0, 0x28,    ; pair 1
0x00, 0x5A, 0xC0, 0x2A,    ; pair 2
0x00, 0x5C, 0xC0, 0x2C,    ; pair 3
0x00, 0x5E, 0xC0, 0x2E,    ; pair 4
0x7E,                      ; (next wave's start)
```

## 6. byte0 of triplet — transient handling [verified, gg1-3.s:1267-1310]

Low nibble of byte0 = number of transient bugs to add to this wave. For each
transient:
- Use `c_1000` randomizer + `c_divmod` to pick a slot in tmp_buf positions 4-11.
- Compute transient ID via: rotate bits of `B`/`C` counters, OR with 0x40 if
  carry, OR with 0x38 → final ID in range 0x38-0x7F with bit-3 patterns.
- These transient bugs end up in slots 4-7 ("lefty transients") and 12-15
  ("righty transients") of tmp_buf, which are then formed into pairs the
  same way as regular IDs.

**Stage 1 has byte0=0x00 in all 5 waves** (gg1-3.s:1462) → **no transients in
stage 1**. Confirmed.

Stages with transients: stage 6 (`0x82` in wave 1, `0x42` in wave 2) and
stages 9+. Transient routing in `l_2974_got_slot` (gg1-3.s:1748+) detects
ID & 0x38 == 0x38 and dispatches to `l_29B3_setup_transients` which assigns
sprite code/color manually based on bit 6 of the ID.

## 7. Wave-launcher cadence [verified, gg1-3.s:1658-1745]

`f_2916` runs once per frame. Each call processes AT MOST ONE byte of the
runtime stream:

```
read byte at p_atkwav_tbl
  if 0x7F → all complete (l_2A29)
  if 0x7E → wave-start handling:
              if bugs_flying_nbr != 0: l_294D_set_tmr0 (set game_tmrs[0]=2), return
              if game_tmrs[0] != 0: return
              advance past 0x7E, increment wave counter, return
  else (path byte):
    if (byte & 0x80) == 0:                ; bit 7 CLEAR → trailing
      if (frame_cnt & 0x07) != 0: return  ; wait for frame mod 8
    find free slot in ds_bug_motion_que (12 slots × 0x14 bytes)
    read NEXT byte = object ID
    launch bug into queue (decode wave byte, look up path/variant)
    advance p_atkwav_tbl by 2 bytes
```

**Key timing implications:**

- **Wave boundary:** the launcher waits until ALL flying enemies of the
  previous wave have landed (`bugs_flying_nbr == 0`) PLUS a 2-tick game
  timer delay (`game_tmrs[0]`, decremented at 2 Hz = ~1 second total).
- **Within a wave with bit 7 CLEAR on every byte (e.g. wave 2):** each byte
  fires only at `frame_cnt % 8 == 0`, so consecutive bytes are 8 frames
  apart. A wave of 8 bytes (4 pairs × 2 members) takes 64 frames ≈ 1.07 s.
- **Within a wave with mixed bits (e.g. wave 1):** byte_1 (bit 7 clear)
  waits for frame mod 8, then byte_2 (bit 7 set) launches the very next
  frame. So pair members are 1 frame apart (almost simultaneous). Pair-to-
  pair gap is still 8 frames.

**No separate "trailing-pair m2 timer" mechanism exists in the Z80** — it's
all just `frame_cnt & 0x07` per-launch. Our JS port's `pendingMember2` /
`trailTimer` should be removed.

## 8. Coordinate conversions [verified, gg1-5.s:2275-2330]

Both X and Y go through 9.7 fixed-point + bit-rotation in the rendering path:

**X (not-flipped, gg1-5.s:2287-2299):**
```
sprite_X = (rawX << 1) + integer_bit_0_from_low_byte    ; range 0-510, sprite reg is 8-bit
canvas_X = sprite_X - 10                                ; per CLAUDE.md hardware offset
```

For low-byte = 0 (initial position): `sprite_X = rawX × 2`, `canvas_X = rawX × 2 - 10`.

**Y (not-flipped, gg1-5.s:2305-2321):**
```
mid    = (~(rawY + 0x4F)) & 0xFF
final  = (mid << 1) + (1 - integer_bit_0_from_low_byte)
canvas_Y = final
```

For low-byte = 0 (initial position): `canvas_Y = ((~(rawY + 0x4F)) & 0xFF) × 2 + 1`.

**Verification with stage 1 variant 0** (rawX=0x34, rawY=0x9B):
- canvas_X = 0x34 × 2 − 10 = 104 − 10 = **94**
- canvas_Y = ((~0xEA) & 0xFF) × 2 + 1 = 0x15 × 2 + 1 = **43**

So pair-member 0 of wave 1 starts at canvas **(94, 43)** — top-centre.
Member 1 (rawX=0x44): canvas X = 0x44 × 2 − 10 = **126**. Same Y.

**Pair members are 32 px apart, both centre-top.** With member 1 having
NEGATED rotation, they sweep symmetric arcs from this entry point.

There's a `flip-screen` branch (lines 2290-2293, 2311-2316) that uses
different offsets/complements for X and Y respectively — Galaga has a
"flip screen" cocktail-cabinet mode (player 2 plays inverted). Not relevant
for our port (always not-flipped).

## 9. Game state machine integration [verified, partially inferred]

- `c_2896` (gg1-3.s:1523, "stg_init_env") runs once per stage. Initializes
  sprite codes, color tables, bomb-drop flag bytes. Called BEFORE c_25A2.
- `c_25A2` runs once per stage right after `c_2896`. Builds the runtime
  wave table at `ds_8920`. Sets `_p_atkwav_tbl` to the start.
- The TASK `f_2916` is enabled by `stg_init_env`. From then on, it runs
  every frame, consuming the wave table.
- When `f_2916` hits 0x7F (`l_2A29_attack_waves_complete`), it disables
  itself and enables `f_1A80` (bonus-bee manager) and `f_1B65` (bomber
  attack manager), then sets `_b_nestlr_inh = 1` (formation oscillation
  becomes free again).

**For our JS port:** stage init = call `c_25A2` equivalent (build the runtime
table) when transitioning attract → stageStart. The launcher task then walks
the table per frame.

## 10. Key corrections from prior assumptions

| Old assumption | Corrected understanding |
|----------------|--------------------------|
| Wave table = array of `{id1, id2, byte1, byte2, trailing}` pair entries | Wave table = flat byte stream with 0x7E/0x7F markers; pairs are implicit |
| Bit 7 of byte_2 only = trailing flag | Bit 7 of EVERY byte = "skip frame mod 8 gate" flag |
| Separate "trailing-pair m2 timer" needed | No — pair members are just two consecutive bytes, each gated independently |
| Bit 6 = pair-member selector only | Bit 6 ALSO sets negate-rotation flag → mirrored arcs for partners |
| `runFlyInWave` should wait for landing between pairs | NO between pairs (use frame-mod-8). YES between WAVES (until bugs_flying_nbr==0) |
| Stage 1 pair members start at (42, 42) | Start at (94, 43) — the X conversion needs ×2 |

## 11. JS port implementation impact

What needs to change in the JS port:

1. **Wave table format:** flatten to byte stream with 0x7E/0x7F markers.
2. **Per-frame launcher:** match the frame_cnt & 7 gate per byte instead of
   the current pair-level cooldown + trail-timer.
3. **Inter-wave wait:** explicit "wait for all enemies to land + 1 sec game
   timer" between 0x7E markers.
4. **Pair-member rotation negation:** when bit 6 of wave byte is set, store
   a `negateRotation` flag on the enemy struct; the path interpreter must
   negate `rotRate` (segment byte 1) when reading new segments.
5. **X coordinate ×2:** canvas_X = rawX × 2 − 10 (already partially done).
6. **Remove `pendingMember2` / `trailTimer`** — not needed.

## 12. Full stage-init chain — verified end-to-end

The Z80 has a multi-step stage-init pipeline split across files. Following
is the complete call graph as of stage 1 entry, with line citations.

### 12.1 Call graph

```
g_main (game_ctrl.s:172) — runs once at boot
  ├─ c_sctrl_sprite_ram_clr (int.s:196)        ; one-time
  │     • memset(b_8800, 0x80, 0x80)           ; all 128 disposition bytes "inactive"
  │     • memset(sprite_posn, 0, 0x80)
  │     • memset(sprite_ctrl, 0, 0x80)
  ├─ memset(mctl_mpool, 0, 0x14*12)            ; clear 12 bug-motion slots
  └─ enters g_main loop ...
       ↓ (when game_state transitions ATTRACT→READY→IN_GAME)
       ↓
stg_init_splash (task_man.s:189)               ; runs each new stage
  ├─ b_stgctr++                                ; bump stage counter
  ├─ b_not_chllg_stg = (stgctr+1) % 4          ; 0 = challenge stage
  ├─ display "STAGE X" / "CHALLENGING STAGE" text
  ├─ game_tmrs[2] = 3, busy-wait                ; text-display delay
  ├─ ds_9200_glbls[0x0B] = 3                   ; enemy_enable, begin round
  ├─ c_new_level_tokens                        ; lives/stage-flag icons
  └─ falls through to stg_init_env (no return)
       ↓
stg_init_env (task_man.s:256)                  ; the heart of stage init
  ├─ game_tmrs[2] = 120                        ; ~1 s stage-init delay
  ├─ c_2896 (gg1-3.s:1523)                     ; per-creature sprite codes + colors
  ├─ c_25A2 (gg1-3.s:1168)                     ; build runtime wave table at ds_8920
  ├─ game_tmrs[0] = 2                          ; attack-formation timer init
  ├─ c_12C3(A=0) (gg1-2.s:873)                 ; init formation home positions:
  │     • ds_hpos_loc_t[16] (offsets=0, origins from db_fmtn_hpos_orig)
  │     • ds_hpos_spcoords[10] (column X coords)
  │     • ds_9200_glbls[0x0F] = flip_screen
  ├─ memset(b_9200_obj_collsn_notif even bytes 0..0x5F, 0)  ; clear hit-flags
  ├─ DISABLE tasks:
  │     task_actv[0x09] = 0    (f_1DE6 — formation pulse)
  │     task_actv[0x10] = 0    (f_1B65 — bomber attack)
  │     task_actv[0x04] = 0    (f_1A80 — bonus-bee manager)
  ├─ ZERO per-stage state:
  │     b_bug_flyng_hits_p_round = 0
  │     _b_bmbr_boss_wingm = 0           ; bomber boss wingman enable
  │     _b_bbee_tmr = 0                  ; bonus bee launch timer
  │     _b_atk_wv_enbl = 0               ; ⚠ attack wave enable — gates f_2916
  │     _b_attkwv_ctr = 0                ; current wave counter
  │     b8_99B0_X3attackcfg_ct = 0
  │     _b_nestlr_inh = 0                ; nest L/R inhibit
  ├─ SET per-stage state:
  │     _b_bbee_obj = 1                  ; bonus bee object offset
  │     _b_bmbr_boss_cobj = 1            ; invalidate capture-boss object
  ├─ ENABLE tasks:
  │     task_actv[0x0B] = 1   (f_1DB3 — enemy status)
  │     task_actv[0x08] = 1   (f_2916 — wave launcher)
  │     task_actv[0x0A] = 1   (f_2A90 — formation oscillate)
  ├─ c_2C00 (new_stage.s:28)                   ; load per-stage difficulty
  │     • ds_new_stage_parms[0..9] from bmbr_stg_cfg_dat[stage][rank]
  │     • ds_new_stage_parms[0xA] = clone-attack alien count
  │     • b_92C0[0..1] = 0x0216           ; init bomber timers (yellow/red/boss)
  │     • star scroll speed adjustment
  └─ set bomber-boss sprite codes (ds_bmbr_boss_scode, 8 bytes)
       ↓
plyr_respawn_rdy (game_ctrl.s:872)             ; the actual "GO" trigger
  ├─ ENABLE task 0x15 (f_1F04 — player fire input)
  ├─ ENABLE cpu1 task 0x05 (hit detection)
  ├─ _b_atk_wv_enbl = 1                        ; ⚠ NOW f_2916 actually runs waves
  ├─ erase "STAGE X" / "READY" text
  └─ resume gctl_game_runner loop
```

### 12.2 The two-phase enable: why _b_atk_wv_enbl matters

`stg_init_env` enables the `f_2916` task slot (task_actv[0x08] = 1) — but
f_2916's first action is `if (!_b_atk_wv_enbl) return` (gg1-3.s:1672-1675).
So even though the task is "scheduled", it does nothing until
plyr_respawn_rdy flips `_b_atk_wv_enbl` to 1.

This two-phase split is intentional: it lets the Z80 set up everything
about the stage during the "STAGE X" text display, then start the actual
wave launches *after* the text clears and the player ship spawns.

In our JS port, we have to mirror this — the launcher task can be
"enabled" via state.tasks but should still gate on `state.atkWvEnbl`.

### 12.3 Per-stage difficulty params (c_2C00, new_stage.s:28)

`bmbr_stg_cfg_dat` is a 4-rank × 26-stage × 5-byte table (each byte
packs 2 nibbles = 10 parameters):

| Idx | Parameter |
|-----|-----------|
| 0   | bomb-drop enable flags |
| 1   | yellow bomber launch counter init |
| 2   | red bomber launch counter init |
| 3   | boss bomber launch counter init |
| 4   | max_bombers (initial cap) |
| 5   | max_bombers increase (over time) |
| 6   | _b_captr_flag |
| 7   | aliens-left threshold for continuous bombing |
| 8   | reload attack-wave flite-vector pointer (stage 8+) |
| 9   | reload bombing flite-vector pointer (stage 8+) |
| A   | clone-attack alien count (computed, not from table) |

For stage 1, rank A (sub-table 0): all params 0 except max_bombers=1,
captured_boss=0xC, continuous_bomb_threshold=6. Result: **stage 1 has no
bombing during fly-in** and minimal active bombers later.

## 13. JS state-layer mapping (Z80 → JS)

What state variables our JS port needs to add, grouped by criticality.

### 13.1 Critical for stage 1 fly-in (must add now)

| Z80 var | Initial value | Purpose | New JS field |
|---------|---------------|---------|--------------|
| `_b_atk_wv_enbl` | 0 in stg_init_env, 1 in plyr_respawn_rdy | Gates the wave launcher | `state.atkWvEnbl: false` |
| `_b_attkwv_ctr` | 0 in stg_init_env | Current wave counter (0-4) | `state.attkwvCtr: 0` |
| `b_bugs_flying_nbr` | 0 (recomputed by f_08D3 each frame) | Count of in-flight enemies; used for inter-wave wait | `state.bugsFlying: 0` (cached, updated by bugMotion) |
| `ds_8920` runtime stream | built by c_25A2 | Byte stream walked by f_2916 | `state.waveStream: Uint8Array` (replaces `state.waveTable`) |
| `_p_atkwav_tbl` cursor | start of ds_8920 | Position in the byte stream | `state.waveStreamCursor: 0` (semantic rename of flyInCursor) |
| `game_tmrs[0]` | 2 in stg_init_env | Inter-wave countdown after bugs land | `state.gameTimers[0]` ✅ already exists |

### 13.2 To remove (replaced by Z80-faithful logic)

| Current JS | Why removing |
|------------|--------------|
| `state.pendingMember2` | No m2-specific timer in Z80 — both bytes use frame_cnt & 0x07 |
| `state.trailTimer` | Same as above |
| `state.flyInCooldown` | Replaced by Z80's two gates: `frame_cnt & 0x07` (per byte) and `game_tmrs[0]` (per wave) |
| `state.waveTable` (pair shape) | Replaced by `state.waveStream` (byte stream) |

### 13.3 Per-stage init (must run on every stageStart entry)

These are the operations that `stg_init_env` performs. Many become no-ops
in our JS port because we use hardcoded data instead of dynamic init —
documented as workarounds:

| Z80 op | JS action | Notes |
|--------|-----------|-------|
| `c_sctrl_sprite_ram_clr` (game start) | reset `state.enemies[*].state = 'pending'`, `hitFlag = false`, motion fields | needed for stage cycling |
| `c_2896` (sprite codes/colors) | **workaround:** sprites hardcoded in `gfx/resource.js`; no per-stage refresh needed | see CLAUDE.md |
| `c_25A2` (build wave table) | `state.waveStream = buildWaveStream(state.stage)` | use new builder from §12 |
| `c_12C3` (formation home positions) | **workaround:** positions hardcoded in `state.js` `_ROWS` / `_COL_X` | see CLAUDE.md |
| Clear `obj_collsn_notif[]` | `state.enemies.forEach(e => e.hitFlag = false)` | per-stage hit-flag reset |
| Disable formationPulse, bomberAttack, bonusBee | `state.tasks.* = false` via STATE_TASKS | partial; bomber-attack currently always-on in our code |
| Zero per-stage counters | reset `state.atkWvEnbl=false`, `attkwvCtr=0`, `bugsFlying=0`, `waveStreamCursor=0`, `attackTimers.*=initial` | gathered into `resetStageState(state)` helper |
| Enable enemyStatus, launchAttackWave, formationOscillate | `state.tasks.* = true` via STATE_TASKS | already done |
| `c_2C00` (difficulty params) | `state.newStageParms = loadStageParms(state.stage, state.rank)` | **deferred** — not needed for stage 1 (all zeroes anyway); needed for stage 2+ bombing tuning |
| Set bomber-boss sprite codes | n/a (sprite-code workaround) | — |
| `plyr_respawn_rdy` sets `_b_atk_wv_enbl=1` | `gameController` sets `state.atkWvEnbl = true` after stage init settles | **add a 'stageReady' state OR sub-step within stageStart** |

### 13.4 Later phases (deferred, not in scope now)

| Z80 var | Phase |
|---------|-------|
| `_b_stgctr` increment | INT-5 (stage cycling) |
| `_b_not_chllg_stg` | INT-5+ (challenge-stage handling) |
| `_b_nships` (lives) | INT-6 (HUD) |
| `_w_shot_ct`, `_w_hit_ct` | INT-6 (HUD) |
| Bonus-bee, capture-boss vars | step 10 (boss capture) |
| Most bombing-mode flags | when continuous-bombing is wired up |

### 13.5 Implementation sequence (proposed)

1. **state.js** — add the 5 new fields from §13.1; mark the 4 removed
   fields as deprecated (keep them for one transition step so the
   current launcher doesn't break).
2. **gameController.js** — add `stgInitEnv(state)` helper that runs the
   per-stage init beats from §13.3; call it on `attract → stageStart`
   transition; flip `state.atkWvEnbl = true` after a small delay (or
   when wave-stream is built).
3. **launchAttackWave.js** — separate phase: rewrite to consume
   `state.waveStream` byte-by-byte, applying the `frame_cnt & 0x07`
   gate per byte and the `game_tmrs[0]` gate per wave.
4. **bugMotion.js** — separate phase: motion model rewrite per
   research_path_data.md; add negateRotation handling.
