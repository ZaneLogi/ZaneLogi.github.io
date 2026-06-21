# Galaga Bonus-Bee / "Clone-Attack" — Verified Specification

**Status: researched 2026-06-21, NOT yet ported.** A stage-4+ special attacker:
the game plucks a resting bee from the formation, flashes it, repaints it with a
distinct sprite set, and launches it as the leader of a coordinated 3-bug
("X3") convoy dive. None of this exists in the clone yet — this doc is the spec
for porting it.

This is what surfaced when Zane noticed, at **stage 4**, a diving bee drawn with
sprites the clone never shows — shapes **`0x58-0x5E`** in `gfx/sprite_viewer.html`.
Those `0x5x` shapes are the bonus-bee's, not an alternate frame of a normal bee.

The bonus-bee reuses the existing dive-launch machinery — `c_1083 → j_108A`,
which the clone already ports as `launchEnemyAttack` (see
`research_attack_paths.md` §5). Everything *new* is the manager `f_1A80`, the
sprite swap, and the convoy.

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
chain; see `research_stage_init.md` §12.3. Its exact per-stage values are not
yet transcribed — TODO when porting.)

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

> **Clone note:** `gfx/resource.js` only decodes ship/boss/butterfly/wasp
> (shapes `0x00-0x1F`). Porting the bonus-bee needs the `0x50`/`0x58`/`0x60`
> sprite groups added to the `sprites` catalog (they're already in `_tiles`;
> the `sprite_viewer` confirms they decode).

## 5. The launch — `c_1083` / `j_108A` (shared) [verified, gg1-2.s:206-259]

`c_1083` header: *"Diving movement of red alien, yellow alien, **clone-attacker**,
and rogue fighter."* It computes the negate-rotation flag from the object's
left/right origin, then falls into **`j_108A`** — the same dive-launch the clone
already ports as `launchEnemyAttack` (`research_attack_paths.md` §5). So the
bonus-bee does **not** need new launch code; it needs the manager to *call* the
launch with the convoy path pointer.

## 6. The X3 convoy — `d_1B59` / `d_1B5F` [verified, gg1-2_fx.s:786-844]

The bonus-bee leads a **triple ("X3") attack** — a convoy of bugs that dive
together. Indexed by the bonus-bee color (0/1/2):

```
d_1B59 (X3 config, 3 × 2 bytes):  1E BD / 0A B8 / 14 BC
d_1B5F (convoy path pointers):    db_04EA / db_0473 / db_04AB
```

- `d_1B59[color]` → `ds3_99B0_X3attackcfg` (the 3-byte attack setup).
- `d_1B5F[color]` → the path script (`db_04EA` etc.) handed to `c_1083`.
- `b8_99B0_X3attackcfg_ct` is the **"counter for triple attack"** (gg1-5.s:1391),
  decremented as the convoy members launch; `gg1-5.s:1315` reads the **"object
  of parent bonus-bee"** to glue the convoy to its leader.

> The full convoy choreography (how `c_1083` + `X3attackcfg` spawn the 2 trailing
> members and the `db_04EA` path shape) is **not yet byte-traced** — deferred to
> implementation. This doc establishes the entry points; the path scripts
> themselves are `research_attack_paths.md` territory (§1/§2 format).

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

## 8. Clone gap + implementation notes

**Entirely unported.** No `f_1A80`, no `_b_bbee_*` state, no `new_stage_parms[0x0A]`
gate, no X3 convoy. The clone's attack waves are only the per-wave homing/diving
bugs from the launcher (`research_stage_init.md` §7).

Port sketch:
1. Add the `0x50`/`0x58`/`0x60` sprite groups to `gfx/resource.js` `sprites`.
2. Add `_b_bbee_*` fields to `state.js` + the `new_stage_parms[0x0A]` value to the
   per-stage params (`research_stage_init.md` §12.3).
3. New task `tasks/bonusBee.js` (port `f_1A80`): gate → find resting bee → flash
   → repaint → launch via the existing `launchEnemyAttack`.
4. The X3 convoy (`c_1083` + `X3attackcfg` + `db_04EA` path) — a second sub-step;
   start with a single diving bonus-bee, add the 2 convoy escorts after.

Reuses: the existing `launchEnemyAttack`/`j_108A` (`research_attack_paths.md`
§5) and `determine_sprite_code`/`spriteFromAngle` (the repainted base flows
through it unchanged).

**Related but separate:** the stage-6+ "transient" fly-through bugs (a wave-data
feature, `research_stage_init.md` §6) are a *different* stage gap — they use the
normal `0x10`/`0x18` codes, not the bonus-bee's `0x5x` set. Don't conflate them.
