# Battle City — player tank movement (S3) decode

How a player tank spawns, drives, is stopped by walls and by the other player, and
slides on ice. This is the first gameplay slice on top of the P5 field. Bullets are
a **separate** step. Everything is cited to `bank_FF.asm` (cyneprepou4uk); the
governing test applies — **faithful to what the player can observe; free with what
only the CPU can observe** (`tanks_clone/CLAUDE.md`).

The `sub_C2E6` pipeline steps this covers (order is a faithfulness invariant):

| step | routine | JS |
|---|---|---|
| 1 | `$E181` ice_detection | `Field.iceDetectAndMarkOccupancy` (P5) — sets `tank.onIce`, marks occupancy |
| 2 | `$DB75` ("ice_movement") | `TankRoster.controlPlayers` → `Tank.control` |
| 3 | `$DBF1` tank_movement | `TankRoster.moveTanks` → `Tank.moveStep` |
| 4 | `$E1FA` | `Field.occupancyWriteback` (P5) |
| 7 | `$E27C` invincibility | `TankRoster.updateInvincibility` (+ `drawShields` in render) |

Spawn is `$C331` (`Game.prepareStage`) → `$E363` (`TankRoster.spawnPlayer`), not a
pipeline step.

## 1. Player control — `$DB75` (misnamed "ice_movement")  [D]

`$DB75` is where a **player's** facing and drive/stop state come from; enemies get
theirs from AI. Players only, gate = 3 of every 4 frames (`$DB77-$DB7F`, the same
cadence as the move step). Per player:

- exploding (`<$80`) / respawning (`>=$E0`) → skip (`$DB85/$DB89`).
- stunned (`ram_plr_stun_timer` `$6F`) → DEC + stop (`$DB8B-$DB91`). No enemy/bullet
  sets stun yet, so it never fires this step, but the branch is ported.
- read the d-pad (`sub_E451`, `Input.dpadToDirection`): no direction → state `$80`
  (stopped, `$DBA6`); a direction → state `$A0 | dir` (`$DBE9`).
- **Turn-snap** (`$DBC7-$DBE5`): a **perpendicular** turn (not same, not the
  opposite `dir ^ 2`) snaps position to the 8px grid — `pos = (pos + 4) & $F8` on
  both axes. This is what lets the tank line up with corridors.

**Deviation #1 (state model):** the ROM's stopped state is `$88` and it decays
`$88→$84` via `SBC #$04` (`$DC6B`). Traced: `$DB75` rewrites the state every
processed frame on the **same** 3/4 gate as the move step, so that coast never
advances a player — it is CPU-shaped and unobservable. We model `$80` (stopped) /
`$A0` (moving) only. *Verified:* release on non-ice ground stops the tank with
**0 px** of drift.

## 2. Move step + terrain collision — `$DBF1` / `loc_DC97`  [D]

`$DBF1` dispatches on the flags' high nibble (`tbl_E498`); the roster applies the
3/4 player gate (`$DC09-$DC13`). Player states: `$A0` → `loc_DC97` (drive); `$80` →
stop/ice-slide (§6); `$F0`/`$E0` → respawn INC (§4).

`loc_DC97` — one **1px** step in `dir` (`tbl_E46C`=dx `[0,-1,0,1]` / `tbl_E470`=dy
`[-1,0,1,0]`, indexed UP0/LEFT1/DOWN2/RIGHT3):

- Tank center `(x,y)`; the 16×16 sprite spans `(x-8..x+7, y-8..y+7)`.
- Probe the destination's **two leading corners**:
  `p1 = (newX+(dx+dy)·8, newY+(dx+dy)·8)`, `p2 = (newX+(dx-dy)·8, newY+(dy-dx)·8)`,
  each fixed up by `sub_DD6E/DD76` (`v-1` when the byte `≥ new`, so a 16px tank
  samples the tile it is entering, not the one past it).
- A corner **blocks** if occupied (§3) or the tile is solid `$01-$1F`; passable =
  `$00` or `≥$20`. Reuses `Field.isPassable` / `isOccupied` (P5-verified).
- Both corners clear → commit `x=newX, y=newY` (`$DD04`). Wheels toggle `^4` either
  way (`loc_DD29`) — treads roll even while pushing a wall.

*Verified:* solids (brick `$0F` / steel `$10` / border `$11` / water `$12`) stop the
tank with its leading edge one pixel short of the wall; passables (empty / ice `$21`
/ forest `$22` / blank_steel `$20`) let it through.

## 3. Tank-vs-tank collision — the occupancy grid  [D]

No new code: `$E181` (step 1) marks **every** drivable tank's footprint into
`Field.occupancy` before any tank moves (the two-pass mark/clear P5 kept), and the
`loc_DC97` corner probe already tests it. So once **both** players are on the field
they block each other. A tank never self-blocks: its own marks sit at its current
footprint (`base+$21`/`+$20`/`+$01`, which are the down/right neighbors — not the
top-left cell), while the leading corners probe the cell(s) ahead.

*Verified (2P):* P1→P2 (right), P2→P1 (left), P1→P2 (up) each stop at a 16px gap
(flush, no pass-through); a lone tank moves freely.

## 4. Spawn + the respawn animation  [D]

`$C331` (`prepareStage`) clears bullets (`sub_E409`) + tank flags (`sub_E413`), then
spawns each player who still has lives — P1 if `lives[0]>0`, P2 if `lives[1]>0`
(**absence of lives is the disable**, the ROM's own mechanism).

`$E363` player path: `type=0`, position from `tbl_E47A/E47C` (P1 `$58,$D8` / P2
`$98,$D8`, tank-center coords), state `$F0` (respawn). The move step then animates:

- `$DE55` (`$F0`) and `$DE64` (`$E0`) both **INC the low-nibble counter** each
  processed frame; at `$0E` the phase ends (`$F0..$FE`→`$E0`, `$E0..$EE`→`sub_E3B8`).
  The counter is an explicit `Tank.respawnFrame` (the packed low nibble reorganized).
- `sub_E3B8` player path: state `$A0` facing up (`tbl_E47E[slot]=$A0`),
  `helmet_timer=3`. `tank_upgrade`→type and the enemy branch are deferred.
- Render `$E00B` (`Tank.drawRespawnStar`, dispatched for `$E0`/`$F0`): a **pulsing
  star**, tile `(|counter-7|·2 & $FC)+$A1`, palette 3, 2 sprites (`sub_DA7B`). This
  is also our stand-in for `loc_E3A9`'s `$0F` spawn-block field write (not ported —
  the sprite is the visual).

*Verified:* P1 spawns `$F0` at `(88,216)`; ~37 frames later it is `$A0` (drivable)
with `helmet=3`; the star draws ~105 lit px mid-respawn.

## 5. Spawn (helmet) invincibility — `$E27C`  [D]

Update half (pipeline step 7): DEC `helmet_timer` once every **64 frames**
(`$E286-$E28C`), so `3→0` over ~192 frames. Draw half (`$E28E-$E2A1`): a flickering
shield around the tank, tile `((lo & 2) << 1)+$29` (alternates `$29`/`$2D`),
palette 2, 2 sprites — **on top** of the tank (its OAM is written in the pipeline,
before `sub_DEA6`'s tank OAM at `$C209`, giving it the lower index / higher
priority). Split per our `Mode` contract: the DEC is `updateInvincibility`, the
sprite is `drawShields` (render). **Deviation #3.**

*Verified:* `helmet` 3→2→1→0 over ~154 frames (phase-shifted 192); shield adds 2
sprites (~23 px) while active, none after.

## 6. Ice  [D]

`$E181` sets `ram_0103_plr_flags` bit7 = "the tile under the player's center is ice
(`$21`)" — this is `Tank.onIce`, refreshed every frame.

**The `$0103` byte does quadruple duty**; per the data-model rule it is split into
explicit fields (`onIce` + `Tank.slideTimer`). **Deviation #2.** The mapping:

| `$0103` | meaning | our field |
|---|---|---|
| bit7 | on ice (this frame) | `onIce` |
| bits 0-6 | slide counter (`$9C & $7F = $1C` armed → 0) | `slideTimer` |
| bit4 (`$10`) | input LOCK while set | `slideTimer & SLIDE_LOCK_BIT` |

- **Arm** (`$DB75`, `$DBB4-$DBBD`): pressing on ice from a settled state
  (`slideTimer==0`) sets `slideTimer=$1C` — so releasing keeps the tank moving.
- **Lock** (`$DB94-$DB9B`): on ice while bit4 is set, the pad is **ignored** and the
  tank commits to state `$80` — this is why turning on ice is sluggish.
- **Slide** (`$DC52` `$80` handler, `$DC56-$DC68`): on ice with `slideTimer≠0`,
  DEC it and `drive` in the current direction; the two wheel toggles (`$DC62` +
  `loc_DD29`) cancel, so a sliding tank's treads freeze — faithful. The slide stops
  when `slideTimer` hits 0 **or** the tank leaves the ice (`onIce` cleared).

Ice stages (block `$C`): **17, 24, 28, 32** — reachable from stage 1 via A/B select.

*Verified:* on ice, release → **15 px** momentum slide (vs 0 px on normal ground);
the slide stops flush against a steel wall; turning on ice resolves (dir→UP after
the lock, drives up).

## 7. Battle rendering — water shimmer + forest priority  [D]

Two PPU behaviors the field needed to look right, fixed in this step (not deferred).

- **Water shimmer — `$C31D`** (`Game.waterPaletteSwap`, pipeline step 18). It sets
  `ram_bg_palette_id` to con_bg_pal_02 for frames `lo%64 ∈ [0,31]` and con_bg_pal_01
  for `[32,63]`, HOLDING between the two switch points. `Battle.render` draws the
  field with that live `bgPaletteId` (was a fixed `$02`). The two BG palette **sets**
  differ only in palette-1's entries 1↔2 (swapped), and the water block uses palette 1
  (`BLOCK_ATTRIBUTE[$A]=1`), so only the water tile (`$12`) animates. *Verified:* the
  16×16 water block differs by 76/256 px between the two sets.
- **Forest priority — `$DA3B-$DA45`** (`sub_DA2B`). A sprite half is drawn **behind**
  the background when the tile at (`sprX+3`, tank centre `Y`) is forest (`$22`) — the
  ROM ORs `ram_priority_spr_A`. Implemented as the real 4-layer composite the PPU
  does: **backdrop → behind-BG sprites → BG (colour-0 transparent) → front sprites**.
  - `Renderer`: `beginSpriteLayers()` makes `drawSprite` **enqueue** (behind/front)
    instead of paint; `flushSprites(behind)` paints one layer; `drawTilemap(...,
    transparent)` composes with colour-0 left clear (so behind sprites show through
    the grass's gaps — every entry-0 IS the backdrop, so it looks the same over a
    backdrop fill). `TileCache` already keyed on `transparent`.
  - `Tank.draw`/`drawRespawnStar` probe **per half** (the tank is 2 sprites, so a tank
    straddling a forest edge has only the grass-side half drawn behind). The menu
    passes no field → never behind → paints on top (immediate mode).
  - Grass is a **partial** obstacle, not a cover (Zane, 2026-07-18: *"making it hard
    to be visible, not making it not to be seen"*): the tank shows through the forest
    tile's colour-0 holes. *Verified:* behind-render differs from forest-alone by only
    4 px (tank peeks through) while a front tank would differ by 122 px; behind vs
    front differ by 118 px (the layering is real).

## Verified — summary (all deterministic, headless `Game` + `getImageData`)

- **Spawn:** `$F0`→`$A0` in ~37 frames, `helmet=3`; 2P spawns both.
- **Move:** ~3px/4frames, wheels toggle `0↔4`; release stops immediately (dev. #1).
- **Turn-snap:** perpendicular turn → 8px-aligned.
- **Terrain:** solids block flush; passables (incl. ice/forest) pass.
- **2P tank collision:** blocks flush from all 4 approaches, no pass-through; lone
  tank free.
- **Helmet:** counts down, shield renders then stops.
- **Ice:** 15px slide after release, stops at walls, turns resolve.
- **Real flow:** Menu→1P→StageIntro→SELECT→Battle spawns P1 and drives; `render()`
  clean.
- **Rendering:** water block animates (76/256 px differ between palette sets); a tank
  on forest is drawn behind the grass (4 px peek vs 122 for a front tank).
