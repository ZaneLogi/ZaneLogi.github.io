# Galaga Bonus-Bee / "Clone-Attack" — Verified Specification

**Status: IMPLEMENTED 2026-06-22 (BB-1..BB-5).** A stage-4+ special attacker:
the game plucks a resting bee from the formation, flashes it, repaints it with a
distinct sprite set, and launches it as the leader of a coordinated 3-bug
("X3") convoy dive. Now ported — this doc is the spec + the as-built record
(scoring excluded; see §6.4 / §8).

This is what surfaced when Zane noticed, at **stage 4**, a diving bee drawn with
sprites the clone never shows — shapes **`0x58-0x5E`** in `gfx/sprite_viewer.html`.
Those `0x5x` shapes are the bonus-bee's, not an alternate frame of a normal bee.

The bonus-bee reuses the existing dive-launch machinery — `c_1083 → j_108A`,
which the clone already ports as `launchEnemyAttack` (see
`research_attack_paths.md` §5). Everything *new* is the manager `f_1A80`, the
sprite swap, and the convoy.

> **⚠ Not the same as "bonus STAGES."** This doc is the **bonus-BEE** — one
> flashing diving bee inside a *normal combat* stage. The **CHALLENGING STAGE**
> bonus rounds (stages 3, 7, 11, …) are a different, already-IMPLEMENTED feature
> — see `research_stage_init.md` §14.4. The only thing they share is the word
> "bonus." Don't conflate them (see §8).

---

## 1. What it is (one paragraph)

Late in a stage (stage 4+), once enough of the formation has been cleared, one
resting bee starts **flashing** (alternating two colors ~4 Hz). After a short
delay it launches as a **bonus** target leading a **convoy** of bugs in a
coordinated triple attack. While flashing/diving it is drawn with the `+0x40`
sprite set (`0x50` / `0x58` / `0x60`), chosen by stage. The Z80 calls the
subsystem the **"clone-attack"** and the state the **"bonus-bee"**.

## 2. The stage gate — `new_stage_parms[0x0A]` [verified, gg1-2_fx.s:671-688]

`f_1A80` is the per-frame **"clone-attack" manager**. Its own header comment:

> *"Not active until stage-4 or higher because the parameter is 0."*

```
f_1A80:
   ld a,(ds_new_stage_parms + 0x0A)   ; "bonus-bee when bug count reaches this"
   ld c,a
   ld a,(b_bugs_actv_nbr)
   cp c
   ret nc                              ; return while active-bug count >= threshold
```

- For stages 1-3 the per-stage param `[0x0A]` is **0**, so `b_bugs_actv_nbr >= 0`
  is always true → immediate `ret` → the feature never arms.
- From stage 4 the param is nonzero; the manager arms once the active-bug count
  **drops below** it — i.e. **late in the stage, when few bugs remain**.

(The param is one of the per-stage difficulty bytes loaded by the stage-init
chain; see `research_stage_init.md` §12.3. **Already computed in the clone:**
`loadStageParms` returns it as `params[10]` (`paths.js`, Z80 c_2C00 lines 82-98)
— `0` for stages 1-3, `0` for challenge stages (`stage & 3 == 3`), `0x0A`
otherwise. So the gate VALUE is in place; the bonus-bee port just has to read it.)

## 3. The manager `f_1A80` — flow [verified, gg1-2_fx.s:681-833]

Three phases, selected by the launch timer `_b_bbee_tmr`:

**A. Arm (tmr == 0, none active yet)** — find a resting bee:
- Scan the **bee group** `b_8800 + 0x07`, 20 objects, for one with status `1`
  (resting) — `l_1A97` (gg1-2_fx.s:695-702).
- Fallback: scan the **moth group** `b_8800 + 0x40`, 16 objects — `l_1AA3`
  (704-711). If none rest, return.
- On a hit (`l_1AAB_found_one`, 715-740): set `_b_bbee_tmr = 0xC0` (launch
  delay), compute the stage color (§4), and stash `_b_bbee_obj` / `_b_bbee_clr_a`
  / `_b_bbee_clr_b` + trigger the bonus-bee sound.

**B. Flash (tmr counting up, < 0)** — `l_1AD5_in_one_already` (742-765):
- `inc` the timer each frame; when it wraps to 0 → phase C.
- Bail if the bee was killed first (status != 1, 751-753).
- Otherwise **alternate its color register** between `_b_bbee_clr_a` (tile-color
  byte `8B2E`) and `_b_bbee_clr_b` (`8B2F`) on **bit 4 of the counter** = every
  16 frames ≈ ¼ s (757-764). This is the shimmer.

**C. Launch (tmr wrapped to 0)** — `l_1AF4_ready_go` → `l_1B00` (767-828):
- Confirm the bee is still alive (779-785).
- Write the **X3-attacker config** (3 bytes) from `d_1B59[color]` into
  `ds3_99B0_X3attackcfg` (786-797) — see §6.
- **Repaint** the bee's sprite code to the `+0x40` set (§4, 813-819).
- Fold the stage color into `_b_bbee_clr_a` (820-826).
- `call c_1083` with `DE = d_1B5F[color]` (the convoy dive path) → the bee dives.
- `l_1B54_getout`: clear `ds_cpu0_task_actv[0x04]` → **disable `f_1A80`** until
  the next stage re-arms it (830-831). One bonus-bee per arming.

## 4. Sprite mapping — the `0x50` / `0x58` / `0x60` groups [verified, gg1-2_fx.s:813-819]

```
ld a,c          ; c = bonus-bee color index 0..2  (= _b_bbee_clr_b - 4)
rlca/rlca/rlca  ; c << 3
add a,#0x56     ; → 0x56 / 0x5E / 0x66
ld (hl),a       ; store into the bee's sprite-code byte
```

`0x56 / 0x5E / 0x66` are `(base | frame 6)`, so the **base** is **`0x50` / `0x58`
/ `0x60`** (frame 6 = vertical/wings-open; `determine_sprite_code`,
gg1-5.s:2104-2135, overwrites the low 3 bits with the live heading each frame —
see `research_attack_paths.md` §5/objectStates `spriteFromAngle`). These are
exactly the "groups of 7" Zane spotted — each is a `+0x40` variant of a normal
creature base (`0x10`/`0x18`/`0x20`).

The color index cycles `0 → 1 → 2` by stage group:
`_b_bbee_clr_b = (stgctr >> 2) % 3 + 4` (gg1-2_fx.s:725-732), so the base steps
`0x50 → 0x58 → 0x60` every 4 stages. Zane observed **`0x58`** (index 1).

> **Clone note (BB-1 done 2026-06-22):** `gfx/resource.js` now decodes the three
> bonus-bee groups as `sprites.bonusBee[colorIndex][frame]` =
> `group(0x50,8,4)` / `group(0x58,8,5)` / `group(0x60,8,6)`. **Only 7 of the 8
> frames per variant carry graphics** — frames 0-5 (directional) + 6 (vertical);
> **frame 7 is BLANK** in the ROM (tiles `0x57`/`0x5F`/`0x67` are empty), which is
> Zane's "groups of 7." That's correct + harmless: frame 7 is selected ONLY by the
> formation-idle 6↔7 shimmer (`objectStates`), and the `0x5x` sprite is only shown
> while the bee is **diving** (while resting it's still a normal wasp/butterfly,
> repainted to `0x5x` only at launch) — so `spriteFromAngle` (0-6 during a dive)
> never reaches the blank tile. The 8-frame groups are kept for frame-index
> alignment with the other creatures. Verified: opaque-pixel counts per frame +
> visual sprite-grid screenshot.

## 5. The launch — `c_1083` / `j_108A` (shared) [verified, gg1-2.s:206-259]

`c_1083` header: *"Diving movement of red alien, yellow alien, **clone-attacker**,
and rogue fighter."* It computes the negate-rotation flag from the object's
left/right origin, then falls into **`j_108A`** — the same dive-launch the clone
already ports as `launchEnemyAttack` (`research_attack_paths.md` §5). So the
bonus-bee does **not** need new launch code; it needs the manager to *call* the
launch with the convoy path pointer.

## 6. The X3 convoy — fully traced [verified, gg1-2_fx.s:786-844 · gg1-5.s:408-420, 1564-1633, 1389-1400]

The bonus-bee leads a **triple ("X3") attack**: the leader (the repainted bee) +
**2 "clones"** that split off *from the leader's own path* mid-dive. Indexed by
the bonus-bee color (0/1/2):

```
d_1B59 (X3 config, 3 × 2 bytes):  1E BD / 0A B8 / 14 BC   (parm0, parm1 per color)
d_1B5F (leader path pointers):    db_04EA / db_0473 / db_04AB
```

### 6.1 Launch (the leader) — `l_1B00`
`d_1B59[color]` → `ds3_99B0_X3attackcfg` = **{0x03, parm0, parm1}** (count = 3,
then 2 score-popup bytes). `d_1B5F[color]` is the leader's dive path, handed to
`c_1083`. The leader is one of the formation bees, repainted to the `0x5x` base (§4).

### 6.2 The 2 clones spawn via the `0xF2` token [verified, gg1-5.s:408-420, 1564-1633]
The leader paths embed **two `0xF2` SPAWN tokens**, each followed by a 2-byte
`.dw` sub-path pointer. E.g. `db_04EA` (color 0):
```
12 18 1E · 12 00 14 · F2 →p_flv_0502 · 12 00 08 · F2 →p_flv_0502 · 12 00 18 · 12 FB 26 · FD →p_flv_0358
```
Each `0xF2` (`case_097B`, "split off bonus bee") does:
1. Find an INACTIVE (`0x80`) slot in **`b_8800 + 0x38`** — 4 slots `0x38/3A/3C/3E`,
   the "clone" / transient IDs — or bail (gg1-5.s:1568-1577).
2. Copy the leader's **sprite_code + cclr** to the clone, so it looks identical
   (same `0x5x` repaint + color) (1580-1588).
3. Grab a free `ds_bug_motion_que` slot (1592-1603); copy the leader's **position
   (6 B) + 4 more + the `0x13` flags byte** into it (1605-1624) — the clone starts
   where the leader currently is.
4. Load the **`.dw` sub-path** (bytes right after the `0xF2`) into the clone's path
   pointer `0x08/0x09` (1626-1633) → the clone flies that sub-path.

So the convoy is **emergent from the path data**: the leader runs `db_04EA`; as it
flies it hits `0xF2` twice and splits off 2 clones, each running `p_flv_0502`. No
separate "spawn the escorts" routine — the spawns are tokens in the leader's path.

### 6.3 Leader vs clone endings
- **Clones** end on `FF` (despawn / fly-through): `p_flv_0502` =
  `12 E2 01 · F3[08 07 06 05 04 03 02 01] · F5 · 23 00 48 · FF` — a segment, `F3`
  BREAK_TARGETED (8-byte player-aim LUT, **already ported**), `F5` (`case_0942`,
  set status 3 + advance), a segment, `FF` END. (Color 1 clones → `p_flv_0499`;
  color 2 clones → `p_flv_04c6` and `p_flv_04cf` — the two clones differ here.)
- **Leader** returns home: the path tail is `FD`/`FA` into the shared bee home
  blocks (`p_flv_0358` / `p_flv_039e` / `p_flv_0363`) — i.e. it dives, splits the
  clones, then homes into formation like a normal bee dive.

### 6.4 Destruction / scoring — OUT OF SCOPE [gg1-5.s:1389-1400]
Each killed convoy member decrements `b8_99B0_X3attackcfg_ct` (leader matched by
`_b_bbee_obj == L`, clones by `L & 0x38 == 0x38`, gg1-5.s:1314-1322); at 0 (all 3
dead) the `parm0`/`parm1` bonus is awarded (popup score). The clone has no score
system → **skip the `X3attackcfg` count + bonus entirely**; the convoy's
kill-removal and `FF` despawn still apply without it.

### 6.5 As built (BB-5)
The whole convoy region `db_0473..p_flv_0502` (0x0473-0x0512) is ported VERBATIM as
one `CONVOY_REGION` array (`paths.js`, z80Base 0x0473); the 3 leader paths are entry
offsets (`getConvoyPath(colorIndex)`). `bugMotion` gains the `0xF2` SPAWN handler
(`spawnClone` → a free `0x38-0x3E` slot, copies the leader's sprite/color/position/
flags, runs the embedded sub-path within the region) and an FD/FA **out-of-array →
TURN_HOME** fallback for the leaders' cross-region home-tails (the bee-descent blocks
they target live in `ATTACK_PATH_YELLOW`; homing the leader is equivalent — that
descent ends in FB-home anyway). Clones carry `bbeeClone` → `FF` / off-screen
despawns them. `X3attackcfg` + scoring skipped (§6.4). **Verified:** leader + 2 clones
fly the convoy; clones dive (F3) + despawn; leader homes (`flying`→`homing`→
`formation`); no `0xF2` exists outside the convoy region (no regression to other paths).

## 7. State + init

RAM (`structs.inc`):

| field | off | meaning |
|---|---|---|
| `_b_bbee_obj`   | 0x0D | object slot of the chosen bonus-bee |
| `_b_bbee_clr_a` | 0x0E | flash color A (the bee's original sprite-code byte) |
| `_b_bbee_clr_b` | 0x0F | flash color B / stage color index (4/5/6) |
| `_b_bbee_tmr`   | 0x21 | launch timer (0 idle, `0xC0`→ counts up to launch) |

Init: `task_man.s:286-294` zeroes `_b_bbee_tmr` / `_b_bbee_obj` and
`b8_99B0_X3attackcfg_ct` at stage start (per active + suspended player).

## 8. As built (BB-1..BB-5, implemented 2026-06-22)

Ported across the following, in dependency order:
- **BB-1 sprites** — `gfx/resource.js`: `sprites.bonusBee[colorIndex][frame]`
  (`group(0x50,8,4)` / `(0x58,8,5)` / `(0x60,8,6)`) + `recolorCreature(type,pal)`
  used by the flash (§4).
- **BB-2 state** — `state.js`: `state.bonusBee {obj,clrA,clrB,tmr,colorIndex,flashFrames,
  flashOn}` + per-enemy `bbeeColorIndex` / `bbeeClone`; `gameController.stgInitEnv`
  resets them each stage.
- **BB-3 manager** — `tasks/bonusBee.js` (port of `f_1A80`): gate (`activeBugCount <
  newStageParms[10]`) → arm (first resting bee 0x08-0x2E then 0x40-0x5E; tmr=0xC0;
  stage color) → flash (alternate every 16 frames; bail if killed) → launch (repaint +
  dive via `launchEnemyAttack` on the convoy path) → self-disable (one per stage).
  Wired into `TASK_TABLE` + `STATE_TASKS` ('playing' only) + dev panel.
- **BB-4 render** — `tasks/objectStates.js`: diving bonus-bee → `sprites.bonusBee[idx]`;
  resting flash → the `recolorCreature` clrB shape (toggled by `flashOn`); reverts to a
  normal bee on home-back (avoids the blank frame 7, §4).
- **BB-5 convoy** — `paths.js` `CONVOY_REGION` + `getConvoyPath`; `bugMotion` `0xF2`
  SPAWN (`spawnClone`) + the FD/FA out-of-array → TURN_HOME fallback + `bbeeClone`
  despawn (§6.5).

**Deviations:** the leaders' cross-region home-tails resolve to TURN_HOME rather than
re-entering the bee descent (same net result); `X3attackcfg` + the kill-bonus tally are
skipped (no score system — §6.4). Reaching it in play needs stage 4+ with < 10 active
bugs.

Reuses: the existing `launchEnemyAttack`/`j_108A` (`research_attack_paths.md`
§5) and `determine_sprite_code`/`spriteFromAngle` (the repainted base flows
through it unchanged).

**Related but separate — don't conflate:**
- The stage-6+ **"transient" fly-through bugs** (a wave-data feature,
  `research_stage_init.md` §6) — they use the normal `0x10`/`0x18` codes, not the
  bonus-bee's `0x5x` set. A *different* stage gap, still unported.
- The **challenge / bonus STAGES** (the "CHALLENGING STAGE" rounds — stages 3, 7,
  11, …; `research_stage_init.md` §14.4, **IMPLEMENTED** in `92d4ffa`) — a
  whole-stage fly-through mode, unrelated to this single flashing diving bee in a
  *combat* stage. The naming overlap ("bonus") is all they share.
