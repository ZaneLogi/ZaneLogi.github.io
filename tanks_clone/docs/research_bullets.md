# Battle City — bullets (S5) decode

How a bullet is fired, flies, chips brick, is stopped by walls, explodes, cancels
another bullet, and — the mechanic Zane called out — **freezes the other player**.
This is Scope 2, the other half of the movement/bullets split; it sits on the P6
player tank + the P5 field. Everything is cited to `bank_FF.asm` (cyneprepou4uk); the
governing test applies — **faithful to what the player can observe; free with what
only the CPU can observe** (`tanks_clone/CLAUDE.md`).

The `sub_C2E6` pipeline steps this covers (order is a faithfulness invariant):

| step | routine | JS |
|---|---|---|
| 5  | `$E02E` bullets_status_handler | `BulletManager.updateStatus` — advance + explosion countdown |
| 8  | `$E122` player fire | `BulletManager.playerFire` → `spawn` (`$E08C`) |
| 9  | `$E162` enemy fire | `BulletManager.enemyFire` — **stub** (enemy scope) |
| 11 | `$E604` bullets_movement | `BulletManager.move` → `Bullet.checkPoint` (`$E69A`) |
| 12 | `$E910` vs bullets | `BulletManager.collideWithBullets` |
| 13 | `$E70C` vs tanks | `BulletManager.collideWithTanks` — **Part 3 (freeze)**; 1&2 deferred |

The render half `$E0D8` (`BulletManager.render`) sits **outside** the pipeline, in each
battle screen's own draw loop (`$C206`), exactly like `sub_DEA6` for tanks. `clearAll`
(`$E409`) is wired at stage prep (`$C331`, `Game.prepareStage`).

## 0. Data model — 10 flat slots  [D]

The ROM spreads bullets across parallel zero-page arrays, and lays the **2nd-bullet**
arrays (`$C0/$CA/$D4/$DE`) immediately after the **primary** arrays (`$B8/$C2/$CC/$D6`)
so a single loop `9→0` covers both. Decoded:

| index | is | ROM address (status) |
|---|---|---|
| 0-7 | each tank's primary bullet — bullet i belongs to tank i | `ram_bullet_status $CC` + i |
| 8-9 | the two players' **2nd** bullets (the "2 shots on screen" upgrade) | `ram_2nd_bullet_status $D4` + p |

The ROM packs a bullet's whole condition into one byte, `ram_bullet_status` (`$CC`):
HIGH nibble = state (`$00` inactive / `$40` flying / `$30-$10` exploding), LOW 2 bits =
direction, and while exploding the LOW nibble doubles as a per-phase frame counter.
`Bullet` **splits** that into named fields — `state`, `dir`, `explosionPhase`,
`phaseFrame` (dev #4) — plus `property` (bit0 `FAST`, bit1 `POWER`, kept as flags).

**The flat-10 array IS the faithful model, not a zero-page mirror.** Every bullet loop
tests membership with `& $06` (player bullets = 0,1,8,9) and `& $07` (skip a bullet's
own pair), and those masks are **player-observable** ("which bullet can hit which"),
not CPU economy — so they become named predicates (`Bullet.isPlayerBullet`, the
`p ^ bi` other-player test) over the flat array. Reorganising the shape, keeping the
behaviour (the data-model rule).

## 1. Fire — `$E122` + `$E08C`  [D]

`$E122`, players 1,0: if the tank is **drivable** (`$80..$DF`, not exploding/respawning)
and A **or** B is freshly pressed (`ram_btn_press & $03`), fire.

- **2-shot upgrade** (`$E136-$E158`): only when the tank has the upgrade tier
  (`type & $C0 == $40`) **and** the primary is already flying: if the 2nd slot is free,
  copy primary→2nd and clear the primary (`copyFrom`); if the 2nd is also busy, skip.
  Without the upgrade, or with the primary free, fall straight to spawn.
- **`$E08C` spawn** into the tank's **own** primary slot (index == tank.slot): no-op if
  it's already active; else `status = $40 | dir`, position = `tank_center + dir·8`
  (`tbl_E46C/E470 · 8`), and `property` from the tank's type high nibble
  (`bulletPropertyForType`, `$E0BC-$E0D5`): 0-star player → 0; a player star tier
  (`$10-$50,$70`) or a 200-pt enemy (`$C0`) → `FAST`; a 3-star player (`$60`) →
  `FAST|POWER`; any other enemy (`$80+`) → 0. Players spawn `type=0` today, so every
  bullet is a plain `property 0` until upgrades (bonus pickup) land — the branch is
  ported so it's correct then.

`ram_sfx_shot` (`$E094`) is a cited TODO (Audio stub).

## 2. Movement + speed — `$E02E` / `$E063`  [D]

`$E02E` runs every frame with **no gate** (the frame gate is in step 11's collision, not
here). For each **flying** bullet it advances via `$E063`: `pos += dir·2`; if `FAST`,
again → `pos += dir·2` more. So a **normal bullet moves 2 px/frame, a fast one 4**.

*Verified:* normal +2 px/frame; fast +4 px/frame; straight line in each direction.

## 3. Terrain collision + brick chip — `$E604` / `$E69A`  [D]

`$E604` is the collision pass (its label "movement" is the misnomer — §2 does the
moving). For each flying bullet, **gated**: a fast bullet is checked every frame; a
normal one every **other** frame, keyed by `(slot ^ frame) & 1` so the 10 bullets
stagger (`$E612-$E61B`).

**Cross-section sampling (`$E642-$E688`).** The bullet is ~8 px wide, so collision
samples up to **four** points spread **perpendicular** to travel — `spd = |DIR_DX|`
(spd_Y) / `|DIR_DY|` (spd_X), swapped (`tbl_EA49`/`tbl_EA4D`, byte-identical to
`tbl_E46C/E470`), so an up/down bullet samples across X and a left/right one across Y:

| sample | point | when |
|---|---|---|
| A | `(x, y)` centre | always |
| B | `(x, y) + 4·spd` far +edge | only if A **chipped a brick** |
| C | `(x, y) − spd` near −edge | always |
| D | `(x, y) − 5·spd` far −edge | only if C **chipped a brick** |

The **conditional far-sample** is load-bearing: a bullet flying down a 1-tile-wide
corridor has its centre in open space (A/C don't chip) so the edge samples B/D never
run — it does **not** chip the walls its edges brush. Only when punching *into* a wall
(A/C hit brick) does the chip extend to the full 8 px width.

**`$E69A` — one sample point.** A quadrant pre-test (`$D725`/`$D73C`, `Field.quadrantHit`)
turns `(px&4, py&4)` into a quadrant bit (TL 1 / TR 2 / BL 4 / BR 8) and returns
`(bit | $F0) & tile != 0`. The `$F0` makes any tile with a non-zero HIGH nibble
(steel/border/water/…/eagle) register whatever the quadrant, while a **brick** (`$01-$0F`,
a 4-bit quadrant mask) only registers on a quadrant still solid — **which is exactly why
a bullet flies clean through a chipped hole.** Then, on the tile value:

| tile | result |
|---|---|
| eagle (`& $FC == $C8`, `$C8-$CB`) | `Base.onHit(field)` (once) + bullet explodes → game over follows. **Live since P8** — Base draws the eagle (`research_base.md`). |
| `≥ $12` (water `$12`, ice `$21`, forest `$22`, blank-steel `$20`) | pass — bullets **fly over** |
| border `$11` | bullet explodes (`$33`), tile unchanged |
| POWER bullet, any solid | clear the **whole** tile (`$D784` A=0) + explode |
| steel `$10` (non-POWER) | bullet explodes, tile unchanged |
| brick `$01-$0F` | **chip this quadrant** (`$D743`, `Field.chipQuadrant`) + explode; the only case that returns "chipped" to drive B/D |

`Field.chipQuadrant` = the P4-built `Tilemap.setQuadrant(px,py,false)` (already `$D743`);
its `& $F0` guard is harmless here because `$E69A` only reaches it on a brick.

*Verified:* a RIGHT bullet into a full brick (`$0F`) chips the leading **left column**
(TL+BL) → `$0A` and explodes; a bullet fired at a top-row hole (`$0C`) **traverses** the
brick cell still flying; steel (`$10`) and border (`$11`) explode the bullet with the
tile **unchanged**; water (`$12`) is flown over (no explosion); a POWER bullet clears
steel to `$00`.

## 4. Explosion — `$E02E` `ofs_002_E076` + `$E0D8`/`$DEE2`  [D]

A bullet that hits a solid/tank/bullet-target is set to `status $33`. `$E076` counts it
down each frame: `status--`; when the low nibble hits 0, the high nibble `−= $10` and
reloads the low nibble to 3 (`ORA #$03`), clearing at 0. So `$33 → $23 → $13 → 0` over
**9 frames**, three high-nibble phases. Our port carries this as `Bullet.explode()`
(seed) + two fields — `explosionPhase` 3→1 and `phaseFrame` 3→0 (dev #4) — so the nibble
arithmetic becomes a plain two-counter countdown.

Render (`ofs_003_E112` → `$DEE2`): `spr_T = (|((status+$40) >> 4) − 7| · 4) + $F1` =
`$F1 / $F5 / $F9` by phase; `sub_DA7B` draws two 8×16 sprites (left at `x-8`, right at
`x`), palette 3. Our render indexes those three tiles by `explosionPhase`, dropping the
packed-byte incantation.

*Verified:* `$33 → 0` in exactly 9 `updateStatus` calls; the explosion sprite draws
(~136 lit px).

## 5. Bullet vs bullet — `$E910`  [D]

A **player** bullet (0,1,8,9) overlapping any **other** bullet within **6 px** on both
axes → **both cleared** (`status = 0`), silently (no explosion). A bullet skips its own
pair (`index & $07` equal). Enemy bullets are only ever the inner term, so two of them
never cancel — only a player-involved pair does.

*Verified:* two opposing player bullets 2 px apart both vanish.

## 6. Bullet vs tank — `$E70C`  [D]

Three parts share the hit box `|dx| < $0A && |dy| < $0A` and set the hitting bullet to
`$33`. **Parts 1 & 2 are deferred to the enemy scope** (no enemy tank/bullet exists, and
they need the tank-explosion render (a `Tank.render` TODO), player respawn, and
Score/Bonus); they are cited stubs:

- Part 1 (`$E710`) — enemy bullets (2-7) vs players → kill (unless shielded).
- Part 2 (`$E782`) — player bullets vs enemies → armour damage / kill / score / bonus.

### Part 3 (`$E83F`) — THE FREEZE  [D]

The whole player-vs-player rule. For each drivable player p, scan the player bullets
(0,1,8,9); `(p ^ bi) & 1` selects **only the OTHER player's** bullet (P1↔bullets 1,9;
P2↔bullets 0,8 — a player is never hit by its own bullet). On a hit the bullet explodes
(`$33`), then:

1. victim **shielded** (`helmet_timer != 0`) → **absorb** (clear the bullet, no stun);
2. victim **already stunned** (`stun_timer != 0`) → skip;
3. **demo** (`ram_2nd_loop_flag == $02`) → skip (no stun in the attract demo);
4. else `stun_timer[victim] = $C8` (**200**) and stop scanning that player.

The countdown + "can't move while stunned" + the 8-frame blink already exist in
`Tank.control` (`$DB8F`) / `Tank.draw` (`$DFDD`) from P6 — this scope adds only the
**set**. `stun_timer` is cleared on spawn (`$E377`) and at stage prep (`$C363`).

*Verified (through the real `mainBattleScript`):* P1's bullet → P2 `stun=200`, P2 then
**cannot move**; symmetric P2→P1; a player is **never** frozen by its own bullet; a
shielded victim absorbs it with no stun; in demo mode the bullet still explodes but no
stun is set.

## 7. Render half + layering — `$E0D8`  [D]

`$E0D8` (called at `$C206`, outside the pipeline) draws each bullet:

- **flying** (`ofs_003_E0FB` → `sub_DA64`): one 8×16 sprite, tile `$B1 + dir·2`
  (`$B0-$B7` are the four facings in the BG pattern table), palette 2, at `(x-5, y)`.
- **exploding**: the `$DEE2` blast above.

Bullets carry no forest priority, so they are always **front** sprites. `Battle.render`
enqueues them between the tanks and the shields; the OAM index order the ROM writes is
shields (step 7) < bullets (`$C206`) < tanks (`$C209`) — i.e. shields on top of bullets
on top of tanks — and the front list paints in that enqueue order.

## Deviations (governing test)

1. **Flat-10 array is the faithful model.** The `& $06`/`& $07` loop predicates are
   observable membership (who collides with whom), not CPU layout economy — expressed
   as named predicates over one array, not a zero-page mirror.
2. **Plain `Math.abs`** for the collision `|Δ|` compares, **not** the ROM's 8-bit
   subtract-and-negate — which is a *circular* distance `min(|Δ|, 256-|Δ|)`. They differ
   only for pairs >128 px apart, and a flying bullet never gets there: it lives in the
   play field (~[16,224]) and explodes at the border (`$11`) before steps 12/13 run, so
   the max reachable separation (208) is nowhere near the 6/10 px ranges. The 8-bit
   wraparound (an edge-to-edge "collision" no one can trigger) is an unobservable 6502
   artifact — **dropped, not mirrored** (governing test; a byte-exact match of an
   invisible difference is exactly what the rule says not to pay for).
3. **`property` bits + the brick-tile quadrant mask kept.** `property` is two flags
   (`FAST`/`POWER`) read by observable branches — small and clear as bits, like
   `Tank.type`. A brick tile id (`$01-$0F`) *is* a 4-bit "which quadrants are still
   solid" mask that gameplay reads back (shoot through a hole you made) — that's terrain
   mechanism, not CPU shape, so it stays a tile id.
4. **The packed `status` byte is split into named fields.** The ROM crams lifecycle
   state (high nibble), direction (low 2 bits), and — while exploding — a per-phase
   frame counter (low nibble) into one byte. We split it into `Bullet.state` (string
   enum), `.dir`, `.explosionPhase` (3→1) and `.phaseFrame` (3→0) — the same
   reorganization `Tank` applies to `ram_tank_flags` (→ `state` + `dir`) and `Base` to
   `ram_game_over_flag` (→ `BASE_STATE` + `explosionTimer`). The nibble arithmetic
   (`$E076` `DEC`/`AND #$0F`/`SBC #$10`/`ORA #$03`) becomes a two-field countdown, and the
   render's sprite is a phase-indexed lookup instead of `((status+$40)>>4)`. Behavior is
   byte-identical (still 3 phases × 3 frames); the `$addr` citations are preserved. This
   is the data-model rule; keeping the packed byte for `Bullet` while `Tank`/`Base`/ice
   split theirs was an inconsistency, now fixed.

## Verified — summary (all deterministic, headless `Game` + `getImageData`; 35 checks)

- **Fire:** A/B spawns the primary at `tank + dir·8`, one per tank; no 2nd bullet
  without the upgrade.
- **Speed:** normal 2 px/frame, fast 4.
- **Terrain:** brick chips the leading column (`$0F`→`$0A`) + explodes; a hole is flown
  through (corridor); steel/border explode with the tile unchanged; water is flown over;
  a POWER bullet clears steel to `$00`.
- **Explosion:** gone in 9 frames, `explosionPhase` walking `333222111` (3 frames each of
  phase 3/2/1); all three phase sprites draw.
- **Bullet vs bullet:** two opposing player bullets both vanish, silent.
- **Freeze:** P1→P2 and P2→P1 set `stun=200` (the stunned player can't move); no
  self-freeze; shield absorbs; demo exempt — all through the real `mainBattleScript`.
- **Real flow:** Menu→1P→Battle spawns P1, fires, the bullet travels and renders
  (visible sprite pixels); `render()` throws/mutates nothing.
