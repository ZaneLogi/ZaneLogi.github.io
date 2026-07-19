# research_enemy_combat.md — P10: enemy fire + kill + explode + score

The jump from a diorama to a playable battle with a live scoreboard: enemies shoot,
a bullet destroys a tank, the tank explodes and dies, the stage ends when the 20
enemies are gone or all players are lost, and a kill scores points. Covers **P10**
combat plus **S8-B** score accumulation (folded in; §7); the sidebar HUD (**S8-A**)
is `research_hud.md`.

## §0 Scope

**In:**
- `sub_E162` — enemy fire (pipeline step 9).
- `sub_E70C` Parts 1 & 2 — enemy bullet → player, player bullet → enemy (step 13;
  Part 3, the P-vs-P freeze, was done in P7).
- the tank explosion **tick** (`ofs_000_DDEA`, states `$70..$20`) + **death**
  (`$DE07`: player `lives--`/respawn, enemy `enemiesLeft--`).
- the tank explosion **render** (`ofs_001_DECD`/`DF33`/`DF46`, states `$70..$20`).

**Also in — S8-B, the score-visible consequences of a kill** (folded into P10 by
Zane's call; `E70C` establishes the kill event, this hangs off it): the score add
(`$E824` `sub_D9BE`) + extra-life (`$E827` `sub_D138`), the per-type kill counters
(`$E80E`/`$E813` `ram_p1/p2_enemy_type_kill_cnt`, which P11's Tally consumes), and
the kill-points popup (`$10` state / `ofs_001_DEFD`). See §7.

**Out — GAME OVER flow (a separate step):** the hi-score-beaten (`$D97D`
`sub_D97D`) + its HALL OF FAME routing, and the `$C972` game-over-message animation.
S8-B's `add` therefore drops `$D138`'s game-over-flag guard (`$D13A`).

**Out — Bonus (S7):** the bonus-tank power-up drop (`$E7D7` `sub_E8BE_spawn_bonus`) was
out of P10 scope — the bonus tank still **explodes** here; only the drop was deferred.
*(Since built: P14, `research_bonus.md`.)*

## §1 Enemy fire — `sub_E162` (step 9)

Trivial. If `clock_timer != 0` → return (the freeze power-up, armed by the clock bonus — P14).
Else for each enemy slot `X = 7..2`: skip if exploding (`flags < $80`) or respawning
(`flags >= $E0`); else roll `random & $1F` — on 0 (1/32) fire via `sub_E08C`
(`Bullet.spawn`, already ported for player fire). One primary bullet per enemy;
no 2-shot upgrade (that's players only).

`Bullet.enemyFire` calls the existing `EnemyAI.shouldFire(frameHi)` = `(rng.next
(frameHi) & 0x1F) === 0` — the same LFSR that drives AI movement, so `frameHi`
must be threaded into the call.

## §2 Bullet vs tank — `sub_E70C` Parts 1 & 2

**Part 1 ($E710–$E77E) — enemy bullet → player.** For each player `X = 1,0` (skip
if exploding/respawning): for each enemy bullet `Y = 7..2` that is flying (status
hi-nibble `$40`), if `|bx−tx| < $0A` and `|by−ty| < $0A`:
- the bullet explodes (status `$33`);
- **helmet on** → absorb: clear the bullet (`$00`), no kill;
- **helmet off** → the player is hit: `flags = $73` (explosion, sub-index 3),
  `sfx_explosion_player`, and `tank_upgrade = 0` / `tank_type = 0` (the star tier
  is lost on death). → next player.

**Part 2 ($E782–$E834) — player bullet → enemy.** For each enemy `X = 7..2` (skip
if exploding/respawning): for each **player** bullet `Y` (where `Y & $06 == 0`, i.e.
slots 0/1/8/9) that is flying, on the same `< $0A` box:
- the bullet explodes (status `$33`);
- **bonus carrier** (`type & $04`): `sub_E8BE_spawn_bonus` *(built P14, `research_bonus.md`)*;
  if `type == $E4` (armour+bonus) `DEC type` → `$E3` so the armour counter engages;
- **armour** (`type & $03 != 0`): `DEC type` (survive), `sfx_bullet_hit_tank` → next.
  So a `$E3` heavy tank takes 4 hits ($E3→$E2→$E1→$E0, then explodes);
- **final hit** (`type & $03 == 0`): explode — `flags = $73`, `sfx_explosion_enemy`,
  then **(S8-B, §7)** the enemy-type index `(type>>5)−4`, `INC kill_cnt`, and (if not
  demo) `add_score(tbl_E8BA[idx])` + `gain_extra_life` — `Game.awardKill`.

`tbl_E8BA_points_for_killing_enemy = [$10,$20,$30,$40]` — the per-type points (in the
game's decimal digit units: 100/200/300/400 via `sub_D9E1`). Used by S8-B (§7).

Note the loop bound: Part 2's `X` runs `7..2` (`$E838` `CMP #$01 BEQ` exits at 1) —
**enemies only**; players are handled by Part 3 (freeze). And `Y & $06 == 0` selects
only the four **player** bullet slots, so enemy bullets never damage enemies.

**Note:** the kill *event* (bullet→$33, armour DEC, explode) and its score-visible
consequences (S8-B) land here; the bonus **drop** (`$E7D7`) was deferred to P14 (built —
`research_bonus.md`). The armour/`$E4→$E3` type math holds, so a bonus-armour tank takes
the right number of hits before it explodes and drops its power-up.

## §3 The explosion tick — `ofs_000_DDEA` (states $70..$20)

Dispatched by the normal move step (`sub_DC3D`), so it inherits the tank's gate:
a **player**'s explosion ticks on the 3/4 player-speed gate, a non-fast **enemy**'s
on its `(slot ^ frm)` speed gate (`sub_DBF1` `$DC09` / `$DC25`). Both `Tank.moveStep`
(players) and `EnemyAI.drive` (enemies) must therefore handle explosion states.

`ram_tank_flags` doubles as the timer: `DEC flags`; if `flags & $0F != 0` stay;
else drop a phase (`SBC #$10`) and reset the low nibble — to **3** (`ORA #$03`)
normally, to **6** (`ORA #$06`) at the `$10` kill-points phase; at `$00` the tank is
dead. Starting from `$73`: `$70→$60→$50→$40→$30→$20` (3 ticks each) → `$10`
(6 ticks) → dead. ~24 ticks total (before gating).

**Model (deviation):** the port splits `state` (hi nibble) from `dir` (lo nibble),
so the packed low-nibble countdown becomes an explicit `Tank.explosionTimer` field —
the same data-shape deviation as `Base.explosionTimer`, `Bullet.phaseFrame`, and the
enemy `coast`. On the hit, `state = $70, explosionTimer = 3`. Each tick decrements the
timer; at 0 it steps `state −= $10` (timer→3), except `$20→$10` (timer→6) and
`$10→dead`.

**Death — `$DE07`.** When the timer runs out at the last phase:
- **player** (`slot < 2`): `DEC lives[slot]`; if lives remain → respawn
  (`sub_E363` = `TankRoster.spawnPlayer`); if 0 → the per-player GAME OVER slide
  message (`$DE18`, 2P only — in 1P the other player is also dead so it's skipped;
  the actual game-over is `checkStageEnding`'s all-lives-0 test, already built).
- **enemy** (`slot >= 2`): `DEC enemies_left_cnt`.

`enemiesLeft` and `lives` live on `Game`, and respawn is `roster.spawnPlayer`, so the
tick reaches back via `game` — the same shape `Base.update(field, game)` already uses.
`Game.destroyTank(tank)` owns the policy; `Tank.tickExplosion(game)` owns the animation.

**Stage end is already built** — `Game.checkStageEnding` (every Battle frame) returns
DONE when the base is destroyed, `enemiesLeft == 0` (stage clear, no message), or
`lives[0]+lives[1] == 0` (game over). So `enemiesLeft--` on the 20th kill clears the
stage; the last player's `lives--` to 0 ends the game. P10 adds only the decrements.

**The `$10` phase** ticks (the ~6-frame linger) and renders the kill-points popup
(§7). The tick guard is `$10..$70`, **not** `$20..$70` — a bug caught in
verification: with `$20` as the floor the explosion stuck at `$10` and never reached
death. The render guard stops at `$20` (the `$10` popup is drawn by its own path).

## §4 The explosion render — states $70..$20

Same sprite family as the P8 base explosion (identical tiles), but centered on the
**tank**, so it can't reuse `base.js`'s eagle-fixed `EXPLOSION_GROUPS` — a tank table
of `[dx, dy, tile]` relative to `(x, y)` is added. Each group draws two 8×16 sprites
(`sub_DA7B`: `tile` at `gx−8`, `tile+2` at `gx`), palette 3.

| state | draw (`ofs_001_*`) | groups (dx, dy, tile) |
|---|---|---|
| `$70` | DECD → `sub_DEE2` | `[0,0,$F1]` (single 16×16) |
| `$60` | DECD | `[0,0,$F5]` |
| `$50` | DECD | `[0,0,$F9]` |
| `$40` | DF46 | `[-8,-8,$D1] [8,-8,$D5] [-8,8,$D9] [8,8,$DD]` (32×32) |
| `$30` | DF46 | `[-8,-8,$E1] [8,-8,$E5] [-8,8,$E9] [8,8,$ED]` |
| `$20` | DF33 → `sub_DEF0(8)` | `[0,0,$F9]` |
| `$10` | DEFD | the kill-points popup — §7 |

`sub_DEE2` derives `$F1/$F5/$F9` for `$70/$60/$50` by `state>>4`; `sub_DF99` derives
`$D1../$E1..` for `$40/$30` by `quadrant*4 + $D1 + ((state−$30) EOR $10)`. `TANK_STATE`
gains `EXPLODE_50`/`EXPLODE_60` (the table already had `$20/$30/$40/$70`).

## §5 Verification plan (deterministic, headless `Game` + `getImageData`)

1. **Enemy fire** — with enemies on the field, over many frames some enemy bullets
   appear (flying, slots 2–7); none while `clockTimer != 0`.
2. **Player kills enemy** — aim a player bullet at an enemy: `flags → $70`, the
   explosion frames sweep `$70→$20`, then the slot clears and `enemiesLeft` drops by 1.
3. **Armour** — a `$E3` heavy tank survives 3 hits (type DEC each) and explodes on the 4th.
4. **Enemy kills player** — an enemy bullet hits an unshielded player: `flags → $70`,
   explodes, `lives--`, then respawns (star) with lives remaining; helmet absorbs instead.
5. **Stage clear** — force `enemiesLeft` low, kill the rest → `checkStageEnding` DONE
   with no game-over message.
6. **Game over** — 1P, `lives[0]=1`, kill the player → `lives→0`, all-lives-0 → DONE +
   game-over message begun.
7. **Gating** — a player explosion advances a phase every ~4/3 frames; a non-fast enemy
   explosion every other frame (the speed gate), a fast enemy every frame.
8. **Render/pixels** — the tank explosion composes blast ink; screenshot a live kill.

## §7 S8-B — score accumulation (folded into P10)

The score-visible half of a kill, hung off §2's kill event (`$E70C` Part 2).

**`Score.add(game, player, points)`** — `$D9BE` add + `$D138` extra-life. Scores are
plain ints, not the ROM's 7-digit BCD arrays (the digit math is CPU-only; the VALUE
is faithful). The extra life is a one-time grant at 20000 per player (`extraLife[]`).
**Scope (Zane):** the hi-score-beaten (`$D97D`) + HALL OF FAME routing are the GAME
OVER flow, a separate step (built in P12) — `checkHiscore` was left a stub here, and
`$D138`'s game-over-flag guard (`$D13A`) is dropped here.

**`Game.awardKill(enemy, owner, isDemo)`** at the kill (`$E7FB-$E827`):
- `idx = (type>>5) − 4` — the enemy types `$80/$A0/$C0/$E0` map to `0..3`
  (basic/fast/power/armour); a damaged armour tank explodes at `$E0`, still `idx 3`.
- `owner` = the bullet slot's low bit (`$E806-$E80A`), i.e. which player fired.
- `killCounts[owner][idx]++` — always (`$E80E`/`$E813`); the P11 Tally consumes it.
  `Game.killCounts` cleared per stage (`$C374 sub_C71E`).
- unless the attract demo (`$E815`): `score.add(owner, ENEMY_KILL_POINTS[idx])`.
  `ENEMY_KILL_POINTS = [100,200,300,400]` — `tbl_E8BA`'s `$10/$20/$30/$40` decoded by
  `sub_D9E1` as hundreds (hi nibble). Kept decimal since the port's score is an int.

**Kill-points popup (`$10` / `ofs_001_DEFD`)** — the `$10` phase's render. An enemy
(`type != 0`) shows `((type>>3) & $FC) − $10 + $B9` → `$B9/$BD/$C1/$C5` = the
100/200/300/400 number sprite; a killed player (`type 0`) shows a plain `$F1` blast
(`$DF03` BEQ). Palette 3, 2 sprites (`sub_DA7B`).

## §8 Open / deferred

- ~~**Audio:** every `sfx_*` write (explosion / hit / fire / gain-life). The GAME OVER
  flow's jingle gates (which block the GameOver / HallOfFame exits) are part of this.~~
  **Built in P15** — every write is wired (`bullet.js`, `score.js`) and both jingle
  gates are real `audio.isPlaying(...)` waits. See `research_audio.md`.
