# Battle City — Enemy AI + spawn (S4 / S12 / S3) decode

How enemy tanks come into a stage and drive themselves. Built in **P9** (scope:
spawn + movement; enemy *fire* and *kill/explode* are P10). Covers the RNG (S12),
the enemy state machine and its target-seeking (S4), and the spawn machinery (S3).
The map (§5 S3/S4/S12) stays at the coupling level; this is the mechanism.

**The one fact everything else follows from — the "AI" is not a separable module.
It IS the enemy half of the tank state machine  [D].** There is no
`decideMovement()` routine in the ROM. `sub_DC3D_tank_status_handler` (`$DC3D`)
dispatches on the high nibble of `ram_tank_flags` through `tbl_E498`, and the
handlers for states `$80`/`$90`/`$A0` and the three follow-bias states
`$B0`/`$C0`/`$D0` **are** the enemy's movement logic — the decision (turn, re-pick a
direction) is interleaved with the move and the collision, not lifted out of it
(the "turn when blocked" branch lives *inside* `loc_DC97` after the terrain probe).

So the port keeps the shape the source has: the shared forward step (`loc_DC97`) is
`Tank.tryStep`; the enemy state handlers live in `EnemyAI` as the decision layer
that calls it. `EnemyAI` is **stateless** (the destination is scratch) — one shared
instance, not one per tank. The scaffold's `decideMovement`/`shouldFire` model was
wrong and was revised (the LOCKED §7 explicitly allows a boundary to be corrected in
implementation).

---

## 1. RNG — `sub_D44D_generate_random_number` (`$D44D`)  [D]

The ROM's mixer is `random = random*7 + frm_cnt_hi + zp[++index]`. The core (`*7`)
is a **weak** generator with short visible cycles; it stays unpredictable only by
adding `zp[++index]` — a rolling read that walks the whole zero page `$00-$FF`
cyclically, i.e. **live game state** (tank/bullet positions `$90`-`$CB`, the frame
counters `$0A`/`$0B`, the movement scratch temps the AI just wrote). Two calls in one
frame read different bytes, so it never repeats even within a frame.

**Re-derivation (governing test: the RNG *sequence* is CPU-only — nobody observes
it, only its effect, natural-looking enemy choices).** We keep the exact mixer's
*role* but replace the weak core + the 256-byte live-state stir with a **16-bit
Galois LFSR** (`rng.js`, taps `0xB400`, maximal period 65535, uniform low byte) and
**keep `+ frm_cnt_hi`**. The LFSR needs no external entropy; the run-to-run variation
comes from *when* it is sampled, which is gameplay-driven — enemies roll it a
data-dependent number of times per frame (the 1/16 grid re-pick, the blocked
3/4-vs-1/4, the `$90` turn, one 1/32 fire roll per live enemy). Reconstructing the
zero page would be maximum plumbing for entropy nobody sees — **and would still not
reproduce the ROM's sequence** (our per-frame state is not cycle-identical), so it is
dropped entirely. Bonus: an LFSR is *reproducible*, which is what makes the headless
enemy-movement tests deterministic.

`next(frmCntHi)` = advance the LFSR, return `(state + frmCntHi) & 0xFF`; callers mask
the low bits they need (`& $1F` fire, `& $0F` re-pick, `& $03` direction, `& $01`
coin-flip). Seed `0xACE1` (non-zero — 0 is the LFSR's fixed point); `reset()` re-seeds.

---

## 2. The state machine — dispatch on the flag high nibble  [D]

`sub_DC3D` computes `(flags >> 3) & $FE` and indexes `tbl_E498` (2-byte entries) —
which is just **the flag's high nibble → one of 16 handlers**. The enemy-relevant
states:

| state | handler (`$addr`) | role |
|---|---|---|
| `$80` | `ofs_000_DC52_80` (`$DC6B`) | recoil coast after a bump |
| `$90` | `ofs_000_DD48_90` (`$DD48`) | turn / re-decide |
| `$A0` | `ofs_000_DC7C_A0` (`$DC7C`) | **drive forward** (the main state) |
| `$B0` | `ofs_000_DD94` (`$DD94`) | follow HQ (transient) |
| `$C0` | `ofs_000_DD89` (`$DD89`) | follow P2 (transient) |
| `$D0` | `ofs_000_DD7E` (`$DD7E`) | follow P1 (transient) |
| `$E0`/`$F0` | `ofs_000_DE64`/`DE55` | respawn (shared with players) |

`EnemyAI.drive(tank, field, ctx)` is this dispatch. Respawn reuses the shared
`Tank.moveStep` tick; the explosion/kill-points states (`$10`-`$70`) no-op here
until combat (P10). `sub_E420_change_tank_status` (`$E420`) — "set the state high
nibble, keep the direction" — is modelled by writing `tank.state` and leaving
`tank.dir`.

**The flag byte's mid nibble (bits 2-3) has no home in our split.** We store
`state` (high nibble) and `dir` (low 2 bits) as separate fields. The `$88`→`$84`→
`$80` recoil coast packs a 2-step counter into bits 2-3 of the flag byte; that byte
does not exist here, so the counter is an explicit `Tank.coast` field (the same
re-derivation ice-slide got with `slideTimer`).

---

## 3. Movement handlers  [D]

**`$A0` drive forward (`ofs_000_DC7C_A0` + `loc_DC97`).**
1. `$DC80-$DC91` — if grid-aligned (`x & 7 == 0 && y & 7 == 0`), a **1/16** roll
   (`RNG & $0F == 0`) re-picks the target via `sub_DE72`, then returns. (The RNG is
   only rolled when aligned, so the call count matches.)
2. else `Tank.tryStep` (`loc_DC97`): a 1px step in `dir`, gated by the two
   leading-corner terrain+occupancy probe (unchanged from P6). Moved → toggle wheels.
3. **blocked** (`bra_DD11` enemy) → `RNG & 3`: **1/4** turn (`bra_DD30`: reverse
   `dir ^= 2`, and if grid-aligned hand off to the `$90` state); **3/4** recoil
   (state → `$80`, `coast = 2`, toggle wheels).

**`$80` recoil (`ofs_000_DC52_80` enemy, `bra_DC6B`).** Sit still for two move-steps
then resume `$A0` — the `$88`→`$84`→`$80`→`$A0` coast, done as `if (--coast <= 0)
state = $A0`. No move, no wheel toggle. This is the brief hesitation an enemy makes
at a wall before it re-tries (and, 1/4 of the time, turns).

**`$90` turn (`ofs_000_DD48_90`).** `RNG & 1`: **1/2** re-pick target (`sub_DE72`);
else rotate one step — `RNG & 1` picks `dir+1` (right) or `dir-1` (left) — and resume
`$A0`.

**`$B0`/`$C0`/`$D0` follow (transient).** Resolve the destination — P1 pos (`$DD7E`),
P2 pos (`$DD89`), or the HQ at `(0x78, 0xD8)` (`$DD94`) — pick a biased direction with
`sub_DDA2`, then immediately become `$A0` driving that way (the ROM stores `tbl_E486`'s
`$A0|dir` byte straight into `flags`). So a follow state costs one frame of re-orient,
no movement.

---

## 4. Target selection — the two policies that need game context  [D]

**Which target — `sub_DE72`, and it drifts across the stage.** `frm_cnt_hi` ticks
once per 64 frames from 0 at stage start (`$C35D`); the spawn interval sets the
thresholds:

| phase | test | target |
|---|---|---|
| early | `interval/8 >= frm_cnt_hi` | **random** direction (`$A0` + `RNG & 3`) |
| mid | `interval/8 < frm_cnt_hi <= interval/4` | **follow a player** |
| late | `interval/4 < frm_cnt_hi` | **follow the HQ** (rush the base) |

Follow-player split (`$DE8E-$DEA0`): P1 dead → P2; else **even slot → P1, odd slot →
P2** (falling back to the live player if the chosen one is dead). "Dead" = the slot is
empty (`state == 0`). For stage 1 (interval `$BA` = 186 → /4 = 46, /8 = 23) that is
~24 s of wandering, then chase, then a base rush past ~49 s — the classic Battle City
escalation.

**Which direction toward it — `sub_DDA2` + `tbl_E486`.** Each axis gets a sign from
`sub_DAAF` (`0` target-is-less / `1` aligned / `2` greater), `index = 3*dySign +
dxSign` (0..8) indexes `tbl_E486`. The first 9 entries bias **vertical** on a diagonal
(target up-left/up-right → UP; down-* → DOWN; only y-aligned goes horizontal); a coin
flip (`RNG & 1`) adds 9 to reach the second 9, which bias **horizontal** — so the
enemy wanders toward its target instead of beelining. `AIM_DIR` (`constants.js`) is
the low nibble of those 18 bytes. (`sub_DDA2`'s *player* branch — `frm_cnt_hi` instead
of `RNG` — is unreachable: players never enter a follow state.)

---

## 5. Spawn  [D]

**`sub_DB48_enemy_spawn_handler` (`$DB48`), pipeline step 10.** When the inter-spawn
timer elapses (`ram_enemy_timer_before_spawn` → 0) and enemies remain
(`ram_enemy_spawn_cnt > 0`), spawn the next into the **first free enemy slot scanning
down from `ram_enemy_limit` to 2**, reload the timer to the interval, and decrement
the spawn count. No free slot → nothing this frame — which is the "max N enemies on
screen" cap (**4 in 1P** with limit 5, **6 in 2P** with limit 7).

**Counters seeded at stage entry (`sub_C331` slice).** `enemy_spawn_cnt` = `enemies_left_cnt`
= `$14` (20); `enemy_type_offset` = 0; `spawn_pos_index` = 0; the spawn timer = 0 (so
the first enemy appears at once); `frm_cnt_hi` = 0. The **defeat counter
`enemies_left_cnt` lives on `Game`** (it gates stage ending, decrements on enemy
death — P10); the **spawn machinery lives on `TankRoster`**.

**Spawn interval — `loc_C39E`.** `interval = $BE - stage*4` (later stages spawn faster;
the 2nd loop uses a fixed stage `$23`), then `- $14` in 2P. Also feeds `sub_DE72`'s
target drift. Computed in `Game.prepareStage`, handed to the roster.

**`sub_E363` placement (enemy path).** Cycle `spawn_pos_index` 0→1→2→0 through the
three top points `tbl_E474`/`tbl_E477` — left `$18` / center `$78` / right `$D8`, all
at y `$18`. The **4th / 11th / 18th** enemy of the stage (`spawn_cnt` = `$11`/`$0A`/
`$03`) is flagged a **bonus carrier** (`type & $04`, the flashing tank). State → `$F0`
respawn; `Tank.spawn` animates it in.

**`sub_E42B` + `sub_E3B8` type schedule.** `sub_E42B` loads the stage's four type
**counts** (`tbl_E578` → `STAGE_ENEMY_COUNTS`, summing to 20); `sub_E3B8` walks that
schedule — skip an exhausted type-slot, consume one, take its **type byte** from
`tbl_E4EC` (→ `STAGE_ENEMY_TYPES`): `$80` basic / `$A0` fast / `$C0` power / `$E0`
armour. Armour becomes `$E3` (a 3-hit counter in the low bits, P10's concern); the
bonus flag ORs in; `$E7` (armour+bonus) clamps to `$E4`. Both tables were extracted +
validated at build time (`tools/extract.py`: types ∈ {80,A0,C0,E0}, counts sum 20).

---

## 6. Wiring — `sub_DBF1` enemy gates  [D]

`TankRoster.moveTanks` is `sub_DBF1` (pipeline step 3, loops 7→0). Players move on the
3/4-frame cadence; each enemy passes two gates, then `EnemyAI.drive`:

- **Clock freeze (`$DC18-$DC23`).** A live drivable enemy (`$80 <= state < $E0`) is
  frozen while `clock_timer != 0`; exploding (`state < $80`) and respawning (`>= $E0`)
  enemies proceed. `clock_timer` is a Bonus power-up, always 0 until Bonus lands, so
  this is a no-op today (the countdown DEC `$DC00` is deferred with Bonus).
- **Speed gate (`$DC25-$DC33`).** A **fast** tank (`type & $F0 == $A0`) moves every
  frame; any other enemy moves only when `(slot ^ frm_cnt_lo) & 1 != 0` — alternate
  frames, staggered by slot so enemies do not step in lockstep. (This also makes the
  respawn animation play at fast-vs-normal speed, faithfully.)

The AI context (`{frameHi, spawnInterval, players}`) is assembled once per frame; the
HQ target is a constant.

---

## 7. Flagged deviations (governing test)

1. **RNG → LFSR + `frm_cnt_hi`, dropping the 256-byte zp stir** (§1). The sequence is
   CPU-only; the LFSR gives natural-looking, *reproducible* variation.
2. **Enemy type assigned at spawn, not at `$E3B8`/become-drivable.** The type is
   unobservable during the respawn star (its sprite ignores type), and spawn order ==
   drivable order, so the type *sequence* is identical — moving the write to spawn keeps
   the roster (which owns the type schedule + stage tables) as the single owner and
   avoids threading that context into the state machine. `Tank.becomeDrivable`'s enemy
   path is then just "face DOWN, wheels 0".
3. **The `$88`→`$80` recoil coast → an explicit `Tank.coast` counter**, because the
   flag byte's bits 2-3 have no home in the state/dir split (§2).

Nothing load-bearing dropped. The enemy-icon HUD (`sub_C8C0`/`sub_C8B1`) is deferred
to Score/S8; enemy *fire* + *kill/explode* are P10.

---

## Verified (P9)

Deterministic, headless (63/63 in-browser — construct `Rng`/`TankRoster`/`EnemyAI`/
`Game`, drive the real `$C2E6` pipeline, `getImageData`; never a screenshot for logic):

- **RNG (10):** two fresh `Rng` agree over 10000 calls; `reset()` reproduces; maximal
  period (65535 distinct states, returns to seed, never hits 0); uniform on the AI's
  masks — fire `& $1F == 0` at 0.0312 (≈1/32), `& $03`/`& $0F` spreads < 0.0002, coin
  0.4999; `next(7) == next(0) + 7`.
- **Spawn (31):** stage-1 schedule exact — 18 basic then 2 fast, bonus flag on the
  4th/11th/18th, positions cycle center→right→left, all enter `$F0`; 1P max-concurrent
  = 4 (slots 2-5) with 16 queued.
- **AI decisions (18):** `tbl_E486` exact in both halves; the coin-flip yields both
  options on a diagonal; `pickTarget` drift (early random / mid follow-player with the
  even→P1 odd→P2 split + dead-player fallbacks / late HQ).
- **Integration (6):** enemies drive (max 206 px from spawn), stay in valid states
  within bounds, fully deterministic across two runs, and in the forced late-game head
  down toward the base (one reached y 171, base at 216); states cycle `$A0`/`$90`/`$80`.

Render: a headless enemies-present-vs-absent diff shows 405 sprite pixels in the top
band — the enemies paint. Visual (preview pane, live `window.game` handle): 4 enemies
roam stage 1 with the bonus tank flashing, the player at its spawn, the eagle in its
fortification. Screenshot in the P9 session.
