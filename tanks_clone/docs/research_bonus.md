# research_bonus.md — P14 / S7: Bonus power-ups

The last Battle-loop subsystem: a bonus-carrier enemy (the 4th, 11th and 18th of the
stage) drops a flashing power-up when killed, and a player who drives over it gets 500
points and one of seven effects — a helmet, a clock (freeze), a shovel (fortify the HQ),
a star (upgrade), a grenade (blow up every enemy), an extra life, or a no-op pistol. Most
of the plumbing already existed (dormant): the shovel is P8's `Base.applyShovel`, the
clock-freeze GATE is P9/P10's, the helmet shares the spawn-shield timer, and the star just
sets `Tank.type`, which the P7 bullet code already reads. So S7 is mostly the `Bonus`
class (spawn / display / pickup) plus wiring those dormant hooks live.

## §0 Scope

**In** (all under S7):
- `sub_E8BE_spawn_bonus` (`$E8BE`) + `sub_E902_convert_random_number_to_position` (`$E902`)
  — the drop: a random grid position (retried off any player) + a weighted-random id.
- `sub_E23B_display_bonus_on_screen` (`$E23B`) — the on-field icon (blinking) and the
  post-pickup "500" flash; split update/render per the Mode contract.
- `sub_E972_try_to_pick_up_bonus` (`$E972`, pipeline step 14) + the seven effect handlers
  (`tbl_E9E2` → `$E9F0`/`$E9F5`/`$E9FB`/`$EA07`/`$EA17`/`$EA3E`/`$EA48`).
- the wiring the effects need live: the drop trigger (`$E7D7`, in the P10 kill path), the
  bonus-carrier marker hiding a live bonus (`$E3A5`), the **clock-freeze countdown**
  (`$DBFA-$DC00`), and the **star-upgrade lifecycle** (`$EA07` set / `$E76A` reset on
  death / `$E3C5` restore on respawn).

**Deferred, cited:** every sfx (`ram_sfx_bonus_appear` `$E8C0`, `_bonus_pickup` `$E9C7`,
`_explosion_enemy` `$EA1D`, `_gain_life` `$EA42`) — Audio. The **demo** follow-bonus AI
(`$C648`, the demo steers a player toward the bonus) — Demo mode. The bonus's own OAM /
priority plumbing — Renderer's job (S9).

## §1 The drop — `sub_E8BE` (`$E8BE`)

**Trigger (`$E7D7`, in `sub_E70C` Part 2).** When a player bullet is dealt to an enemy,
before the damage math the ROM tests `tank_type & $04` (`TANK_TYPE.BONUS_FLAG`); a carrier
→ `JSR sub_E8BE_spawn_bonus`. Then `$E7DA`: if the type is exactly `$E4` (armour **and**
bonus), `DEC` it to `$E3` — clearing the bonus bit so an armoured carrier, which survives
the first hit, doesn't drop a *second* bonus on its later hits. (A basic carrier `$84` is
destroyed by that one hit anyway, so its flag never needs clearing.) `bullet.js`
`collideWithTanks`.

**Position — the retry loop.** `sub_E8BE` picks `pos_X` and `pos_Y` each from a random
0-3 through `sub_E902`, sets `id = $FF` and `timer = 0`, then **calls `sub_E972`**: with
`id = $FF` that is a pure *position probe* — it applies no effect (`$E9AE BMI` skips the
handler) but sets `timer = $32` if the chosen spot overlaps a player. `$E8E2` retries the
whole pick while `timer != 0`, so a bonus never spawns on top of a player. Once clear, a
final `random & $07` indexes `tbl_E8FA` for the real id and `timer` is reset to 0.

**`sub_E902` — the 4×4 grid.** `A = ((n*3)*2 + 6) << 3` maps `0/1/2/3 → $30/$60/$90/$C0`,
so both axes land on a 4-cell grid → 16 possible spots. `BONUS_POS` is the closed form.

**`tbl_E8FA` — the weighted id (`$E8FA`).** `[0,1,2,3,4,5,4,3]`: grenade (4) and star (3)
each appear **twice** → 2/8; helmet/clock/shovel/tank are 1/8 each; **pistol (6) is never
generated** (the handler exists but is unreachable from spawn). Verified live: over 200
spawns, star 49 / grenade 47 vs the singles 21-32, and no 6 or $FF ever.

## §2 The display — `sub_E23B` (`$E23B`)

Called from the loop body at `$C203` (Battle) / `$C241` (Tail) — **outside `sub_C2E6`**,
so it runs even while paused (like `sub_DEA6`). Two branches on `bonus_timer`:
- `timer != 0` (post-pickup): `DEC` it; at 0, clear `pos_X` (the bonus is gone); otherwise
  draw the "500" number sprite (`spr_T = $3B`).
- `timer == 0` (waiting on the field): blink on `frm_cnt_lo & $08` (8 on / 8 off); the
  icon tile is `id*4 + $81`.
Either draw is two 8×16 sprites (`sub_DA7B`: tile @ X-8, tile+2 @ X), palette 2, front
(priority 0).

**Update/render split (Mode contract).** The routine mutates state (`DEC timer`, clear
`pos_X`) *and* emits sprites, so it splits: `Bonus.updateDisplay()` (the `timer != 0`
countdown; called from `Battle`/`Tail` `update()` after `mainBattleScript`, **outside the
pause gate** to match `$C203`) and `Bonus.render(renderer, frameLo)` (all the drawing;
called from `renderBattlefield`). The render reads the post-`updateDisplay` timer, so the
two agree: a 2→1 tick still draws the flash, a 1→0 tick clears `pos_X` and the render sees
no bonus. The `timer == 0` waiting branch mutates nothing, so its blink is render-only.

## §3 The pickup — `sub_E972` (`$E972`, pipeline step 14)

`if pos_X == 0 → return` (no bonus); `if timer != 0 → return` (a flash or the spawn probe
is locking it out — this is why a picked-up bonus can't be re-grabbed during its 50-frame
flash). Then scan players **1 then 0** (so P2 wins a tie), skipping any that aren't
drivable (`flags & $80` set and `< $E0`). A hit is the half-open box `|player - bonus| <
$0C` on **both** axes. On a hit:
1. `timer = $32` (arm the flash / signal the spawn probe).
2. `if id < 0` (`$FF`, the spawn probe) → return, no effect.
3. unless the attract demo (`ram_2nd_loop_flag == $02`): add **500** (`sub_D9E1(#$50)` →
   `sub_D9BE`) + the extra-life check (`sub_D138`) to the picking player.
4. dispatch the id through `tbl_E9E2` to its handler, then return.

The ROM's `PLA/PLA + JMP (handler)` pops `sub_E972`'s return address so the handler `RTS`
returns to *`sub_E972`'s caller* (`mainBattleScript`) — a tail-call. In the port that is a
plain `_applyEffect(); return;`. Only the first overlapping player grabs it.

## §4 The seven effects — `tbl_E9E2` (`$E9E2`)

| id | name | handler | effect |
|---|---|---|---|
| 0 | helmet  | `$E9F0` | `helmetTimer[p] = $0A` — ~10 units of shield (the spawn-shield timer, DEC'd every 64 frames by `sub_E27C`; the roster already draws it) |
| 1 | clock   | `$E9F5` | `clock_timer = $0A` — freezes enemy **move** (`$DC18`) and **fire** (`$E162`); both gates already ported dormant |
| 2 | shovel  | `$E9FB` | `Base.applyShovel` (P8): fortify the HQ walls to steel + `shovel_timer = $14`, but only while the base is alive (`$E9FB BPL`) |
| 3 | star    | `$EA07` | upgrade the picking player one tier — see §5 |
| 4 | grenade | `$EA17` | every live enemy (slots 7..2, `flags & $80`, `< $E0`) → `flags = $73` (explode) + `type = 0`. **No score, no per-type kill count** — the explosions run to death, DECing `enemiesLeft`, but `awardKill` is never called |
| 5 | tank    | `$EA3E` | `lives[p]++` — an extra life |
| 6 | pistol  | `$EA48` | `RTS` — no-op (never spawned) |

## §5 The star-upgrade lifecycle (cross-subsystem)

The star is the one effect that touches several subsystems, because Battle City's tank
power carries between stages and is lost only on death. Two per-player bytes:
`ram_tank_type` (`$A8`, live) and `ram_tank_upgrade` (`$0101`, persistent).

- **Set (`$EA07`).** `if tank_upgrade[p] == $60 → RTS` (capped at 3 stars). Else
  `tank_upgrade[p] += $20`, and write it to **both** `tank_upgrade[p]` and `tank_type[p]`.
  The live write is immediate: `Tank.type` drives the bullet property (§below) and the
  drawn sprite (`(type & $F0)` shifts the tile base — the upgraded-tank art). `Bonus._star`
  writes `game.tankUpgrade[slot]` + `player.type`.
- **Reset on death (`$E76A`, in `sub_E70C` Part 1).** A player killed by an enemy bullet
  gets `tank_upgrade[p] = 0` and `tank_type[p] = 0` — the tier is lost. `bullet.js`.
- **Restore on respawn (`$E3C5`, in `sub_E3B8`).** The player materialises: `sub_E363`
  first zeroed `tank_type` (`$E365`), then `sub_E3B8` does `tank_type = tank_upgrade`
  (an `ORA` with the just-zeroed type). So the tier survives the per-stage respawn (a
  player who cleared the stage keeps it) — but after a death `tank_upgrade` is 0, so the
  fresh life starts at 0 stars. `Tank.becomeDrivable(game)`, threaded through
  `moveStep → respawnTick → becomeDrivable`. **`prepareStage` does NOT clear
  `tank_upgrade`** (only `preparePlayerData` does, at game start, `$C2BF`) — that is what
  makes the tier persist across stages.

**Why it "just works" for bullets.** The P7 bullet code already keys everything on
`Tank.type` (`bulletPropertyForType` at `$E0BC`, the 2-shot gate `(type & $C0) == $40` at
`$E138`). So the star tiers map straight through: `$20` (1★) → FAST bullet; `$40` (2★) →
FAST + 2 shots; `$60` (3★) → FAST + POWER (destroy steel) + 2 shots. No new bullet code.

## §6 The clock-freeze countdown (`$DBFA-$DC00`)

`sub_DBF1` (step 3, `moveTanks`) DECs `clock_timer` once every 64 frames while it is armed,
at the *top* before the tank loop. P9/P10 already ported the freeze **gates** (enemy move
`$DC18`, enemy fire `$E162`) as no-ops-until-armed; S7 arms it (the clock bonus) and adds
the countdown so the freeze expires. `moveTanks` DECs `game.clockTimer` and the post-DEC
value feeds both the freeze gate in its own loop and enemy fire (step 9, which reads
`game.clockTimer` fresh after step 3).

## §7 Deviations (the governing test — player-observable vs CPU-only)

1. **`ram_bonus_id = $FF` as a spawn probe.** Kept faithfully — the `$FF` sentinel + the
   `sub_E972` re-use *is* the ROM's position-validity mechanism, and it is cheap and exact.
   `Bonus.spawn` calls `tryPickup` with `id = $FF` exactly as `$E8BE` does.
2. **The RNG call count.** `sub_E8BE` rolls the RNG 2× per position attempt + 1× for the
   id; the port matches. The *sequence* is CPU-only (re-derived LFSR, rng.js), so the
   positions/ids differ from a real Famicom — but the distribution (grid + weights) is
   faithful, which is all the player sees.
3. **`sub_E23B` update/render split** — the Mode contract, same shape as `sub_DEA6` /
   `sub_E2A9`. The `timer` DEC lands in `update()`; the sprites in `render()`.
4. **`tank_upgrade` ($0101) modelled as `Game.tankUpgrade[]`, not a per-tank field.** It is
   session state (persists across the roster's per-stage `spawnPlayer`/`clearAll`), so it
   lives on `Game` with the other session state (the §7 map lock), and `becomeDrivable`
   reaches it via the threaded `game` — the same shape `destroyTank` uses.
5. **Bonus OAM position.** Drawn at its `$C203` slot: front of bullets/tanks, behind
   shields/base explosion. Nearly unobservable (pickup is instant on overlap), noted in
   `renderBattlefield`.

## §8 Verification (deterministic in-browser + live)

43 checks (headless `Game` + `getImageData` / a `drawSprite` spy; the real
Menu→1P→Battle flow), all green:

- **spawn** — 200 spawns land on the 4×4 grid `{$30,$60,$90,$C0}`, ids 0-5 only (never 6 /
  `$FF`), star+grenade ≈ 2× the singles; the retry never lands within the pickup box of a
  parked player.
- **display** — the flash counts exactly `$32` frames then clears `pos_X`; a waiting bonus
  (`timer 0`) is inert; the icon draws 2 sprites `id*4+$81`/`+2` palette 2 when `frm & 8`,
  nothing when not; the flash draws `$3B`/`$3D`; `pos_X == 0` draws nothing.
- **pickup** — P2 wins a tie (scan 1,0); +500 + flash `$32`; out-of-range nothing; the
  demo applies the effect but scores 0.
- **effects** — helmet `$0A`; clock `$0A`; shovel `$14` (alive) / no-op (destroyed); life
  +1; pistol no-op (still +500); grenade explodes enemies 2-5 (`$70`, type 0) with no kill
  count, leaving an empty slot untouched.
- **star** — tiers step `20,40,60,60`(cap); bullet property `0/FAST/FAST/FAST|POWER`;
  2-shot only 2★/3★; upgrade restored on respawn (`$40` survives a fresh `spawnPlayer`),
  zeroed on an enemy kill.
- **carrier** — a carrier kill through `collideWithTanks` (and through the full
  `mainBattleScript`) drops a bonus; an `$E4` carrier drops one and steps `$E4→$E2`
  (survives, flag cleared); a new carrier spawn hides a live bonus, a non-carrier does not.
- **clock** — DECs at `frameLo % 64 == 0`, holds off the boundary, never underflows from 0.
- **live** — the full flow reaches `Battle`; a bonus star renders on the real canvas (the
  icon box gains 95 lit px / 3 colours vs empty). Screenshot: the star on the stage-1
  battlefield with `enemies=20`, `base=ALIVE`.
