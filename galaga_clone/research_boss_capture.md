# Galaga Boss Capture — Research + 4c/4d Implementation Spec

Research scope: the **boss capture mechanic** — the boss dives, opens a tractor
beam, and pulls the player ship up to fly as a slave in the formation; the
player can then shoot that boss to rescue the ship and gain **2-ship mode**.
This is step 10 in `progress.html`, built as sub-steps; **4a (dive) and 4b
(beam render) are done** — this doc specs **4c (ship gets captured)** and
**4d (rescue → 2-ship)**, and audits every gap between the clone and the Z80
source along the whole chain.

Follows the steps-7/8 research-doc discipline (`research_attack_paths.md`,
`research_stage_init.md`): every claim cites a Z80 label / `file:line`; re-grep
before relying. Written 2026-06-19.

## Sources

Z80 (`C:\Z_Temp\hackbar_galaga\rom0\`):
- `mrw.s:364-369` — `ds5_928A_captr_status` struct definition (5 bytes)
- `gg1-2_fx.s:1011-1043` — `case_bmbr_boss` (capture/wingman select)
- `gg1-2_fx.s:857-922` — `f_1B65` + `l_1B8B` (boss-pool drain)
- `gg1-2_fx.s:510-669` — `f_19B2` (captured-ship slave / "FIGHTER CAPTURED")
- `gg1-3.s:392-446` — `f_21CB` (boss dives to beam position) — *4a, done*
- `gg1-3.s:458-694` — `f_2222` (tractor beam) incl. `l_233D` ship-in-beam — *4b done, 4c seam*
- `gg1-3.s:205-380` — `f_20F2` (pull ship) + `c_2188_ship_spin` — **4c**
- `gg1-3.s:29-194` — `f_2000` (rescued-ship landing → 2-ship) — **4d**
- `gg1-5.s:1724-1765` — `case_0A53` (F4 BOSS_DIVE aim) — *4a, done*
- `gg1-5.s:359-369` — `db_0454` (capture dive path) + `db_flv_cboss` (slave path)
- `gg1-5.s:338-354` — `db_flv_0411` (escort sortie path)

Clone (`galaga_clone/`):
- `tasks/captorDive.js` (f_21CB, done), `tasks/tractorBeam.js` (f_2222, 4a/4b),
  `tasks/pullShip.js` (f_20F2 — **empty stub**)
- `tasks/launchAttackWave.js` (capture-select + escort + pool drain — done)
- `tasks/bugMotion.js` (F4 token, captureHalted freeze), `paths.js`
  (`ATTACK_PATH_BOSS`, capture entry, `BEAM_CONE`), `state.js`, `main.js`

Status legend: ✅ ported/faithful · ⚠ partial/shortcut · ❌ missing ·
⏳ deferred (acknowledged) · 🔇 dropped (no software counterpart in scope).

---

## 1. Where 4a/4b left off (current clone state)

The capture **setup** is ported and faithful:

- **Capture-squad select** (`case_bmbr_boss`, gg1-2_fx.s:1011) — every-other
  boss launch (`captureToggle` ⇔ `_b_bmbr_boss_wingm`, gated by
  `captureActive` ⇔ `_b_bmbr_boss_cflag`) is a capture mission; the first
  standby boss (index order, `l_1C1B`) is flagged and queued **solo** on the
  capture path `db_0454`. `launchAttackWave.js:359-379` ✅
- **Boss-pool stagger** (`l_1B8B`, gg1-2_fx.s:892) — `drainBossPool`
  launches one queued boss/escort per frame. `launchAttackWave.js:439` ✅
- **F4 BOSS_DIVE aim** (`case_0A53`, gg1-5.s:1724) — reads player X, clamps to
  a lane, stores it as the beam X, sets the dive angle, arms the
  capture-dive monitor. `bugMotion.js:393` ✅
- **Dive → halt → beam open** (`f_21CB`, gg1-3.s:392) — waits for the dive's
  `00 FC FF` stall segment (vx→0), spins the boss to face DOWN, opens the
  beam. `captorDive.js` ✅ (halt-cue faithfulness **verified** — see §6.1)
- **Beam lifecycle + shimmer** (`f_2222`, gg1-3.s:458) — cone grows over
  `0..0x0B` phases at `newStageParms[6]` frames/phase; palette cycles 15 Hz.
  `tractorBeam.js` ✅

What is **not** there — i.e. all of 4c/4d:

- **The boss never actually captures.** `tractorBeam.js:30` is the explicit
  **4c STUB SEAM**: the ship-in-beam test is skipped, so the beam always
  plays out and the boss retreats (`endBeamNoCapture`). ❌
- `pullShip.js` is an **empty no-op** (`export function update(state){}`). ❌
- No ship spin, no captured-ship slave, no rescue, no 2-ship, no respawn. ❌

---

## 2. The capture state struct → named-field model (Decision 1)

The whole mechanic pivots on **`ds5_928A_captr_status`** — a 5-byte struct
(`mrw.s:364-369`) that is heavily overloaded across the lifecycle. The clone
currently models only fragments (`beam.x/phase/timer`, `captureActive`,
`captureBossId`). **Decision (agreed): introduce a faithful named-field
`state.capture` struct** mirroring all 5 bytes — a raw `Uint8Array(5)` would be
too opaque given the magic values (`0x40`/`0x68`/`0x80`) one offset carries.

Proposed `state.capture` (each field cites its byte + the lines that prove the
values):

| Z80 byte | proposed field | meaning + values (with set-sites) |
|---|---|---|
| +0 | `beamX` | beam column = clamped player X. Set by F4 (gg1-5.s:1745). Read by cone draw (gg1-3.s:464, `c_238A`:707) + ship-in-beam test (gg1-3.s:665). *(today: `beam.x`)* |
| +1 | `phase` | **multi-use.** Beam grow: low nibble = cone strip `0..0x0B` (f_2222:529-559); `bit6` = shrink phase; `bit7` = **shot-boss** (l_2327:642). `0x40` = beam at full extent / about to grab (set l_231C:636, tested l_233D:653). `0x68` = connect-hold (l_22D2:591). Rescue (f_2000): `0/1/2/3` stage (gg1-3.s:172/192/70); f_19B2 also runs a `0..0x24` settle counter here (gg1-2_fx.s:631). |
| +2 | `timer` | per-phase frame countdown; reload from `captr_flag`=`newStageParms[6]` (f_2222:509-514). Also `0x40` (l_231C:634), `1` (beam-start f_21CB:438 / shot-boss marker l_2327:647). *(today: `beam.timer`)* |
| +3 | `pullGate` | pull/spin gate. `1` = capture active (f_21CB:439). f_20F2 pulls only while `!=0` (gg1-3.s:213-215); `c_2188` reads it to decide spin-stop (gg1-3.s:346); `0` at connect (l_2141:262). Rescue reuses it as a spin-duration gate = `bugsFlying|gameTimer` (l_20D1:183). |
| +4 | `fighterCaptured` | `1` when boss connects with ship → enables f_19B2 text (l_2305→gg1-3.s:629); `0` to erase (gg1-2_fx.s:570). |

Keep the existing `captureActive` (`_b_bmbr_boss_cflag`), `captureBossId`
(`_b_bmbr_boss_cobj`), and the per-enemy `captureDiving/captureHalted/
captureTargetX` — they map to separate Z80 RAM (`ds_plyr_actv`), not
`captr_status`. Add `_b_cboss_slot` analog only if needed (we look the boss up
by `captureBossId` instead of a que slot).

---

## 3. 4c — the capture half (ship pulled in)

Three routines, in execution order. The beam (`f_2222`) keeps running
throughout; these plug into it.

### 3.1 Ship-in-beam test — `l_233D` (gg1-3.s:651-694) → replaces the stub seam

Gate: only fires once the beam reaches full extent (`phase == 0x40`;
`cp 0x40 / ret nz`, gg1-3.s:653). Then:

```
shipX = sprite_posn[0x62]          ; player ship X (gg1-3.s:658)
A = beamX − shipX + 0x1B           ; (gg1-3.s:665-667)
if (A >= 0x36) return              ; cp 0x36 / ret nc  → NOT in beam
```

In-beam ⇔ `−0x1B ≤ (beamX − shipX) < 0x1B` → a window of **0x36 = 54 raw
units (≈ ±27 px)** centred on `beamX`. The `−16` hardware X offset cancels in
the subtraction, so the test is identical in canvas coords:
`|beamX − shipX| < 27`.

On a hit (gg1-3.s:682-694): disable player control (`f_1F85`, task 0x14 → 0),
**enable `f_20F2`** (task 0x1C → 1), set `captr_flag = 0x0A`. (Attract mode
skips an extra task-gate check at gg1-3.s:670 — irrelevant to us.)

Clone: in `tractorBeam.update`, replace the `4c STUB SEAM` comment with
`if (shipInBeam(state)) { startCapture(state); return; }` where `startCapture`
sets `state.player.alive=false`-equivalent control-lock + `state.tasks.pullShip
= true`.

### 3.2 Pull + spin — `f_20F2` (gg1-3.s:205-318) + `c_2188_ship_spin` (gg1-3.s:330-380)

Fills the `pullShip.js` stub. Per frame:

1. **Spin** (`c_2188`): cycles the ship sprite code 0↔6 to animate rotation and
   toggles the facing bit; returns `B` whose bit0 flags "completed a 180°"
   (gg1-3.s:341-350). This is the visible "ship tumbling in the beam".
2. **Pull** (only while `pullGate != 0`, gg1-3.s:213-215):
   - move ship **X** one step toward the capturing boss's column (compare to
     boss X, inc/dec 1) (gg1-3.s:216-228);
   - move ship **Y up** one step (`dec` the Y byte; bit-8 overflow toggle)
     (gg1-3.s:243-259);
   - at ship Y byte **`0xE0`** → `l_2141_connected`: `pullGate=0`, recolour ship
     to sprite code 7 / red (gg1-3.s:260-266);
   - at ship Y byte **`0xE6`** → `l_214C`: disable fire (task 0x15 → 0).
3. **Connect completes** (gg1-3.s:275-318): once firepower is off and the spin
   gate trips, `glbls+0x0D = 1` (boss connected), task 0x1C → 0 (f_20F2 off),
   cpu1 collision back on.

> ⚠ **Connect handshake is intricate** — `f_2222` is *still running* during the
> pull. When the cone is fully grown **and** `glbls+0x0D` says connected,
> `f_2222`'s `l_22D2`→`l_2305` (gg1-3.s:583-630) loads `db_flv_cboss` into the
> boss's motion slot (so the boss flies home carrying the ship) and enables
> `f_19B2` (task 0x11) with `fighterCaptured = 1`. **Port the f_2222 ⇔ f_20F2
> interplay carefully and verify in-browser** (see §7).

Y thresholds (`0xE0` connect, `0xE6` fire-off) are sprite-Y bytes; convert with
`canvas_Y = sprite_Y_byte + 256·bit8 − 40` and **verify the meet-point on
screen** rather than trusting a precomputed value.

### 3.3 Captured-ship slave — lifecycle, dives, firing

The captured ship is an **enemy object** (Decision G16) living at slot
`0x00/0x02/0x04/0x06` (the capturing boss's slot `& 7`; gg1-2_fx.s:546). Three
phases below: carry-home join, then standby member, then the paired re-dive.

#### 3.3.1 Carry-home + settle (`f_19B2`, gg1-2_fx.s:510-669)

`f_19B2` (task 0x11) runs **only during the initial join** — enabled once at
connect (gg1-3.s:628), disabled once at settle (gg1-2_fx.s:660), **never
re-enabled** (verified: the only other refs are its table pointer task_man.s:61
and a `0x00` default byte gg1-2.s:732). Two segments:

- **Segment 1** — while the boss flies home (boss state 9) on `db_flv_cboss`:
  ship X = boss X, ship Y = boss Y **+ 0x10** (gg1-2_fx.s:594-617); sprite code 7
  (wings-closed red). *(Note: gg1-2_fx.s:592 tests the **boss's** status
  `b_8800[cobj]`, not the slave's — a breadth agent misread this.)*
- **Segment 2** — boss reaches its home slot (`l_1A3F`:620): ship moves up over a
  `0..0x24` counter to settle **above** the boss (gg1-2_fx.s:630-656).
- In position (`l_1A6A`:658): disable f_19B2, set the slave object to **standby
  (state 1)**, invalidate cobj, flag restart-stage.

After this the slave is an ordinary **standby formation member** (red, code 7)
sitting just above its boss. **No glue persists** — later motion is via the squad
pairing (§3.3.2).

#### 3.3.2 The slave dives WITH its boss — squad pairing (`l_1CE3`, the key mechanism)

The rescue dive is a **deliberate pairing**, not emergent and not a separate
rogue dive. Every boss activation (`j_1CAE` tail, gg1-2_fx.s:1207-1248):
1. queues the boss into `bmbr_boss_pool[0]` with its flight vector `IY`;
2. (escort sortie) queues 1–2 wingmen via `c_1D03`;
3. **`l_1CE3` (gg1-2_fx.s:1221-1248): reads `pool[0] & 7` (the boss's
   captured-ship slot); if that ship is STANDBY (state 1), queues it into the
   pool too** — with the **same `IY`** (`l_1D16`, gg1-2_fx.s:1303-1320) = the
   **boss's path**.

The pool drains one-per-frame (`l_1B8B`): boss launches (→ state 9), then
wingmen, then the captured ship (→ state 9). For an escort sortie `IY =
db_flv_0411` (gg1-2_fx.s:1159), so the slave flies **`db_flv_0411` — the escort
path** — in formation with the boss + wingmen. **The slave dives as, in effect,
an extra escort that happens to be your red ship.**

> **This resolves the "f_19B2 never re-enabled" puzzle (verified).** Later dives
> don't re-enable the glue — the slave is re-launched **through the boss pool**
> (`l_1CE3` → `l_1B8B` → `c_1079`), flying the boss's path. Both earlier
> framings — "persistent glue" AND "independent rogue dive / emergent tandem" —
> were **wrong**; the slave is a **pool-paired squad member**.

**Third path — standalone "rogue" (fallback).** Only when the dispatcher finds
**no boss and no escort** available does its *last pass* (gg1-2_fx.s:1109-1118)
launch a lone captured ship on `db_fltv_rogefgter` via `l_1D25` (gg1-2_fx.s:1325).
A no-boss fallback, distinct from the paired dive.

So the slave flies **three** paths across its life: `db_flv_cboss` (carry-home
join, no F6), **`db_flv_0411`** (paired dive with boss — the rescue dive), and
`db_fltv_rogefgter` (standalone rogue fallback, no F6).

#### 3.3.3 Does the slave fire? — it fires *exactly like an escort* (corrected)

**The earlier "slave never fires" claim was mechanistically wrong.** On the
paired dive the slave flies `db_flv_0411`, an ordinary escort sortie. There is
**no captured-ship firing exclusion** — the bomb-drop gate (`case_0DF5`,
gg1-5.s:2345-2349) checks only the per-object counter `0x0E` / enable mask `0x0F`
plus position, identical for any attacker. So the slave drops bombs under the
**same conditions as the boss and wingmen on that sortie**.

> **⚠ CORRECTED 2026-06-21** (the bombing-arming misconception — full analysis in
> `research_attack_paths.md` §6). This section previously claimed "no firing on a
> normal stage — the escort sortie's `FA` homes the group before reaching `F6`".
> That is WRONG: bombs are armed at attack **LAUNCH** by `j_108A` (gg1-2.s:314-323,
> `0x0E=0x1E` / `0x0F=b_92C0[8]`), NOT by `F6`. `F6` only **re-arms** inside the
> cont_bmb loop. So boss + wingmen on a normal escort sortie **do** bomb (every
> diving enemy is armed at launch), and the carry-home `db_flv_cboss` /
> standalone-rogue paths bomb too (the launch arm doesn't depend on the path
> containing `F6`).

**Clone consequence:** the slave is the exception only because of the clone's
**glued-slave deviation (D2/D3)** — it's positioned by `fighterCaptured`, not run
as a `db_flv_0411` path-runner, so `launchEnemyAttack` (which does the j_108A-style
launch arming) is never called for it → it never arms → never fires. That's a
*clone* limitation, not a Z80 "no normal-stage bombing" rule. If the slave were
made a real path-runner it would bomb like any escort.

#### 3.3.4 "FIGHTER CAPTURED" text — render the real glyphs (Decision G11)

Feasible and cheap this phase — no dependency on step 11's HUD work. The string
is literal `"FIGHTER CAPTURED/"` (gg1-2.s:1322), shown for 6 game-timer ticks
then erased (gg1-2_fx.s:541, `l_1A01`:573). The glyph renderer already exists
(`charCanvas(code, palIdx)`, resource.js:157 — the beam cone uses it). The
ASCII→tile-code map is `c_string_out` (gg1-2.s:1208-1217):

```
code = ascii − 0x30 ; then −7 if code ≥ 0x11 ; space(0x20) → 0x24
→ '0'-'9' = 0x00-0x09, 'A'-'Z' = 0x0A-0x23, space = 0x24
"FIGHTER CAPTURED" = 0F 12 10 11 1D 0E 1B 24 0C 0A 19 1D 1E 1B 0E 0D
```

(`0x24` = blank is consistent with `BEAM_BLANK = 0x24` already in tractorBeam.)
Add a small `drawText(ctx, str, x, y, palette)` that applies that formula +
`charCanvas`. **Substitution note:** the Z80 writes glyphs into tile-RAM at a
fixed grid cell (rotated-display mapping); we have no tile-RAM buffer
(routine-level translation), so we place glyphs at **canvas pixel coords** —
exactly how the beam cone already renders. Centre it (~`x=48`, mid-screen);
confirm colour (string entry `s_14A7`) + position visually.

---

## 4. 4d — the rescue half (shoot the boss → 2-ship)

### 4.1 The rescue trigger + every mission-end branch

**The rescue is the LATER paired dive, not the carry-home.** When you shoot a
boss, the hit handler reads the **captured ship's own status** `b_8800[boss & 7]`
(gg1-5.s:1332-1338). The slave is state-9 (diving) only when it has been launched
into the **paired squad dive** through the pool (§3.3.2; `c_1079`→`j_108A` sets
state 9 at gg1-2.s:260). During carry-home the slave object is **not** state 9
(`f_19B2` reads the *boss's* status, and settles the slave to state 1) — so the
carry-home is **not** a rescue window. (Corrected: an earlier draft said it was.)

The capturing boss is a normal **2-hit boss** (green→blue→dead): first hit turns
it blue (colour 1, gg1-5.s:1325-1327); the rescue check lives in the **blue-boss
(2nd-hit) flying branch**.

**Every way the capture mission can end** (re-verified against gg1-5.s):

| # | Condition | Outcome | Cite |
|---|---|---|---|
| R | Shoot the **blue, flying boss** while its slave is **state 9** (paired dive) | **RESCUE** → enable `f_2000` (task 0x1D), `captr_status+1=0`, `+3=1`, rescued-ship music; slave → spin/land/dock → 2-ship | gg1-5.s:1339-1361 |
| L1 | Shoot the boss while slave **not** state 9 (e.g. 0x80 — boss killed before the ship was fully pulled in) | Boss dies, **slave orphaned/lost**; `gameTimers[1]=6`, boss score | gg1-5.s:1338 → l_0899:1364 |
| L2 | Shoot the **captured ship itself** (sprite colour 7) | **Slave destroyed — lost forever** (G19) | gg1-5.s:1305-1311 |
| L3 | Shoot the boss **during the beam, before connect** | Beam aborts, **ship lost**; `captr_flag=3`, `captr_status+1=0x80`, `+2=1`, control back (task 0x14) | gg1-3.s:639 `l_2327` |
| O | Shoot the **non-flying** capturing boss in **home position** (status 4) | Slave **"goes rogue and launches out"** on `db_fltv_rogefgter` | gg1-5.s:1442-1456, 2516 |
| B | A **bomb** hits the slave | Treated like any object hit — **slave lost** (no special case) | gg1-5.s:1257 `l_0815` |

**Clone consequence:** the rescue (R) is **only reachable once the paired dive
exists** (§3.3.2) — so the squad pairing is *not* separable from a working
rescue. L1/L2/L3 are cheap collision special-cases. O (rogue launch) rides on the
standalone-rogue path and can lag. `f_2000` itself (the spin/land/dock + 2-ship)
is §4.2-4.3.

### 4.2 Rescue sequence — `f_2000` (gg1-3.s:29-194), staged on `phase` (+1)

| `phase` | stage | what happens |
|---|---|---|
| 0 | start | set `phase=1`, `gameTimers[1]=2` (l_20C7:170) |
| 1 | spin | spin freed ship (`c_2188`); `pullGate = bugsFlying|gameTimer` as a spin-duration gate; when spin done → disable control/fire/collision, `phase=2` (l_20D1:177) |
| 2 | land | move ship X toward centre (`0x80`), Y toward landing row (`0x29`); when reached → `phase=3` (ships joined) (gg1-3.s:44-95) |
| 3 | dock | `l_2075`:114 — ship slid beside the active ship; finalise join (below) |

### 4.3 Join → 2-ship mode (`l_208F`, gg1-3.s:133-168)

If the active ship was solo (sprite code 6): **`_b_2ship = 1`**, dock the rescued
ship at `sprite_posn+0x61` (left) beside the main at `+0x63`; re-enable control
(task 0x14), fire (task 0x15), collision (cpu1 0x05), set both to code 6 / white
(colour 9). Disable `f_2000` (task 0x1D → 0).

2-ship mode then changes gameplay elsewhere (`_b_2ship` read at gg1-5.s:663,696):
**dual fire**, **double-wide hitbox**, two ship sprites. *None of this exists in
the clone yet* — 4d builds it.

---

## 5. Capture data tables (verified bytes)

- **`db_0454`** capture dive (gg1-5.s:359-366) — `12 18 14 F4 12 00 04 FC 48 00
  FC FF 23 00 30 F8 F9 FA <p_flv_040c> FD <p_flv_0425>`. Descend → **F4** aim →
  **FC** dive-to-Y(`0x48`) → **`00 FC FF`** stall (vx=0 → the f_21CB halt cue,
  §6.1) → `F8/F9/FA/FD` retreat-or-loop tail. Clone: `ATTACK_PATH_BOSS` capture
  entry (offset 72).
- **`db_flv_cboss`** carry-home path (gg1-5.s:367-369) — `12 18 14 FB 12 00 FF FF`
  (no F6). Loaded into the **boss's** slot by `f_2222 l_2305` (gg1-3.s:620) so the
  boss flies home carrying the ship; `f_19B2` positions the ship relative to it.
  **Not yet ported.**
- **`db_flv_0411`** escort sortie + **paired-slave dive** (gg1-5.s:338-354) — clone
  `ATTACK_PATH_BOSS` "entry 5", ✅ already flown by escorts (sub-step 2).
  **Contains `F6`** at `p_flv_0425`/`p_flv_0430` (gg1-5.s:348, 352) → escort/slave
  firing under the usual gates (§3.3.3). The paired slave flies **this** path
  (`l_1CE3`/`l_1D16`, §3.3.2).
- **`db_fltv_rogefgter`** standalone-rogue path (gg1-5.s:356-357) —
  `12 18 14 12 03 2a 12 10 40 12 01 20 12 fe 78 ff`. Flown only by the
  no-boss-available fallback (`l_1D25`, §3.3.2 / G21). **Not yet ported.**

> **⚠ Firing reasoning corrected 2026-06-21** (the "Contains F6 → fires" / "no F6
> → no fire" notes above were wrong): bombs are armed at attack **LAUNCH** by
> `j_108A` (`0x0E`/`0x0F`), **not** by `F6` in the path — see
> `research_attack_paths.md` §6. So firing depends on **whether the path-runner is
> launched** (`c_1079`/`j_108A`), not on `F6` presence: `db_flv_0411` (escort/rogue
> launches) **do** arm and fire on normal dives; `F6` only re-arms in the cont_bmb
> loop. The one genuine "no fresh fire" case is **`db_flv_cboss`** carry-home —
> loaded into the boss's slot by `f_2222 l_2305`, **not** a `j_108A` launch, so it
> keeps whatever arm state was left (no new launch arm).

---

## 6. Clone-vs-source GAP TABLE

Every divergence in the capture chain, classified. **This is the section to
re-read before/while implementing.**

### 6.1 Already-landed (4a/4b) — verified faithful or known shortcut

| # | Site | Gap | Class |
|---|---|---|---|
| G1 | `captorDive.js` halt cue `boss.vx !== 0` | **FAITHFUL (verified).** f_21CB gates on `0x0A(ix)==0` = vx (research_path_data.md:27); `db_0454` really contains the `00 FC FF` (vx=0) stall segment once FC's `0x48` arg is consumed. No gap. | ✅ |
| G2 | `tractorBeam.js:47` per-phase frames = `newStageParms[6]` | Faithful (f_2222:513 reload from `captr_flag`=`newStageParms[6]`). The `state.js:157`/`paths.js:607` "captured_boss flag init — TODO step 10" comments are **stale**: the value *is* used (beam timing). | ⚠ doc-staleness |
| G3 | `launchAttackWave.js:343` "capture sortie NOT here yet" | **Stale comment.** Capture select *is* implemented at :359-379. | ⚠ doc-staleness |
| G4 | Sound — every `b_9AA0` write (beam sfx +0x05/+0x06, rescue music +0x11) | No sound subsystem in the clone at all. Leave hook comments; defer. | ⏳ |
| G5 | flip-screen / cocktail branches in l_233D/f_20F2/f_2000/f_19B2 (`b_9215`) | Clone is upright-only. Always take the **non-flipped** branch; don't port the cocktail negate paths. | 🔇 (out of scope) |

### 6.2 4c / 4d — the work to do

| # | Site | Gap | Class |
|---|---|---|---|
| G6 | `pullShip.js` | `export function update(state){}` — empty. Whole `f_20F2` pull+spin missing. | ❌ STUB → 4c |
| G7 | `tractorBeam.js:30` 4c STUB SEAM | Ship-in-beam test (`l_233D`) skipped → boss never captures. | ❌ STUB → 4c |
| G8 | `c_2188_ship_spin` | Ship-spin animation not ported (needed by both 4c pull and 4d rescue). | ❌ → 4c |
| G9 | `state.capture` struct | Only `beam.x/phase/timer` + `captureActive/BossId` modelled; `pullGate`(+3), `fighterCaptured`(+4), rescue stages(+1) missing. | ❌ → 4c (Decision 1) |
| G10 | `f_19B2` captured-ship slave | Carry-home glue+settle — not ported. Port `f_19B2`: glue slave to boss (pos + `0x10`, state 9) during carry-home, then settle it above the boss and stop. **Glue is carry-home ONLY** (not persistent — §3.3.2). | ❌ → 4c-ii |
| G11 | "FIGHTER CAPTURED" text | **DECIDED: render real glyphs this phase** (§3.3.3). `charCanvas` + the `c_string_out` ASCII→code formula; draw at canvas coords (no tile-RAM dep). Not blocked on step 11. | ✅ → 4c-ii |
| G12 | Player respawn (general) | No respawn anywhere — a bomb hit freezes the ship forever (`bombUpdate.js:103`). **DECIDED: add a general respawn** (fresh ship at spawn after a short pause, no life decrement) covering BOTH capture and the existing bomb-death. Makes the game playable again. | ✅ → 4c-i |
| G13 | bullet → capturing-boss detection sets shot-boss flag | Needed to trigger rescue; clone has bullet→enemy collision but no `captureBossId` special-case / `phase bit7`. | ❌ → 4d trigger |
| G14 | `f_2000` rescue (spin→land→dock) | Not ported. | ❌ → 4d |
| G15 | 2-ship mode (`_b_2ship`): dual fire, double-wide hitbox, two sprites, docking offsets | Nothing exists. The biggest single piece of 4d. | ❌ → 4d |
| G16 | captured-ship object identity | **DECIDED: normal enemy object flagged `isCapturedSlave`** (reuse render/collision; the flag distinguishes shoot-slave=lose vs shoot-boss=rescue, and marks which enemy to convert on rescue). After rescue it's deleted and replaced by a 2nd *player* ship — no "captured friend" state. | ✅ → 4c-ii |
| G17 | Slave firing | **NOT a special case — it's an escort (corrected §3.3.3).** On the paired dive the slave flies `db_flv_0411`; the bomb gate is identical for any attacker. **⚠ corrected 2026-06-21:** bombs arm at attack LAUNCH (`j_108A`), not `F6`, so normal dives DO bomb (the old "stage 1 shows no fire because FA homes before F6" was wrong — see `research_attack_paths.md` §6). The clone's slave is the exception only via the **glued-slave deviation (D3)** — never run as a path-runner, so never armed. | ✅ no special work |
| G18 | Slave dives WITH its boss (squad pairing) | **The rescue dive — deliberate, via `l_1CE3`** (gg1-2_fx.s:1221-1248): boss activation queues the standby slave into `bmbr_boss_pool` with the boss's `IY = db_flv_0411`; the pool drains them as one squad (§3.3.2). **NOT emergent / not an independent rogue dive.** Required for the rescue to be reachable. | ❌ → 4d |
| G19 | Shoot the slave itself → lost forever | Bullet→`isCapturedSlave` special-case: remove the slave permanently (vs. shoot-boss = rescue). | ❌ → 4d |
| G20 | Slave body → player contact kills player | Needs enemy-body→player collision (may not exist yet); on hit → respawn (no life-loss, Decision 2). | ❌ → 4d (or whenever body-collision lands) |
| G21 | Standalone "rogue" dive + status-4 free path | The no-boss-available fallback (`l_1C83`→`l_1D25`→`db_fltv_rogefgter`, gg1-2_fx.s:1109/1325) and the home-position status-4 forced rogue (gg1-5.s:1454/2516). **Distinct from the paired rescue dive (G18); genuinely deferrable** — secondary ways the slave dives/frees. | ⏳ later |
| G22 | 2-hit bosses (green→blue) | Clone kills all enemies in 1 hit; the faithful rescue lands on the boss's **2nd** hit. **DECIDED: implement faithful 2-hit bosses.** 1st hit on a green boss (palette 0) → blue (palette 1), survives + "hit_green_boss" sound (gg1-5.s:1189 `l_08CA`); 2nd hit kills, and the rescue check lives in the blue-boss branch (gg1-5.s:1325-1362). Affects **all** bosses + scoring (capture-boss bonus 1600/800/400 via `d_1CFD`, gg1-2_fx.s:1255). | ✅ → 4d (prereq sub-step) |

---

## 7. Decisions + open questions

**Decided:**
1. **Named-field `state.capture` struct** mirroring `captr_status` (+0..+4). §2.
2. **General respawn, no life-loss / game-over yet (G12).** Add a real respawn
   (fresh ship at spawn after a short pause) covering BOTH capture and the
   existing bomb-death freeze; defer real life-loss to a later lives/INT-4 step.
3. **flip-screen dropped** — always the upright branch (G5).
4. **Sound deferred** — leave hook comments, no audio (G4).
5. **G11 — render the real "FIGHTER CAPTURED" glyphs this phase** (not a
   placeholder): `charCanvas` + the `c_string_out` formula, drawn at canvas
   coords. No step-11 dependency. §3.3.3.
6. **G16 — captured slave = normal enemy object flagged `isCapturedSlave`**;
   rescue deletes it and spawns a 2nd player ship. No "captured friend". §3.3.
7. **Slave fires *like an escort*, not "never" (G17, corrected).** On the paired
   dive it flies the escort path `db_flv_0411`; no firing exclusion — bombs are
   armed at attack LAUNCH (`j_108A`) like any dive (⚠ NOT only via `F6` / the
   cont-bmb endgame — corrected 2026-06-21, `research_attack_paths.md` §6). In the
   clone the slave is glued (D3), not a path-runner, so it never arms → never
   fires; that's the deviation, not Z80 behavior. §3.3.3.
8. **The paired squad dive IS the rescue dive and is in scope (G18, corrected).**
   `l_1CE3` queues the standby slave into the boss pool so it dives *with* the
   boss on `db_flv_0411`; the rescue (shoot the **blue, flying** boss while the
   slave is **state 9**) is only reachable once that dive exists — so it belongs
   in 4d, **not deferred**. The **carry-home is NOT a rescue window** (slave isn't
   state 9 then). Only the standalone-rogue + status-4 free paths (G21) defer.
   *(All three points corrected after tracing `l_1CE3`/`l_1D16`/`db_flv_0411`.)*
9. **Faithful 2-hit bosses (G22).** Bosses take 2 hits (green palette 0 → blue
   palette 1 → dead); the rescue lands on the 2nd hit. Affects all boss combat +
   scoring. Lands as a prerequisite sub-step inside 4d (before the rescue trigger).

**To verify in-browser during impl (visual-mismatch → suspect the spec, per
root CLAUDE.md):**
- The `f_2222 ⇔ f_20F2` connect handshake (§3.2 ⚠): cone keeps drawing during
  the pull; slave handoff (`l_2305`) fires exactly when cone full + connected.
- Pull meet-point: connect at ship sprite-Y `0xE0`, fire-off at `0xE6` — confirm
  the canvas meet-point looks right (boss dove down, ship pulled up).
- 2-ship docking offsets (`sprite_posn 0x61` vs `0x63`) → correct px gap.

---

## 8. Phased plan (save-point commits, squash at end)

Same shape as steps 7/8: each sub-phase its own browser-verified save-point
commit; squash into one `step 10` commit (or keep sub-step commits given step
10's size — decide at squash time). The per-phase detail lives here, not in the
commit bodies.

- **4c-i — capture core + respawn.** `state.capture` named struct (G9) ·
  ship-in-beam test replacing the stub seam (`l_233D`, G7) · `f_20F2` pull +
  `c_2188` spin (G6/G8) → ship reaches the boss, player ship locked out · **general
  respawn (G12)** — fresh ship at spawn after a short pause, also fixing the
  bomb-death freeze. Beam ends via the capture branch instead of `endBeamNoCapture`.
- **4c-ii — slave joins formation + text.** Captured slave as an enemy object
  (`isCapturedSlave`, G16) with the **carry-home glue+settle** (`f_19B2`, G10):
  glued to the boss while it flies home on `db_flv_cboss` (§5), then settled above
  it as a red standby member · real "FIGHTER CAPTURED" glyphs (G11). End state:
  the slave sits inert in formation. *(No rescue reachable yet — the slave isn't
  state 9 in formation, §4.1.)*
- **4d — 2-hit bosses + paired dive + rescue → 2-ship.**
  - **4d-a — 2-hit bosses (G22, prereq):** green (palette 0) → blue (palette 1) on
    1st hit, dies on 2nd; applies to all bosses + scoring. Must land before the
    rescue trigger reads the blue-boss branch.
  - **4d-b — paired dive (G18, `l_1CE3`):** when the slave's boss takes an escort
    sortie, queue the slave into the boss pool so it dives *with* the boss on
    `db_flv_0411` (state 9) — inherits escort firing for free (G17).
  - **4d-c — rescue (G13/G14):** bullet hits the **blue, flying** boss whose slave
    is state 9 → `f_2000` spin/land/dock; shoot-slave-loses-it (G19).
  - **4d-d — 2-ship mode (G15):** dual fire, double-wide hitbox, two-ship render,
    docking.
  - *(G20 slave-body→player deferred — no enemy-body→player collision in the clone
    yet.)*
- **Deferred (G21):** the standalone-rogue dive (no boss available) + the
  status-4 home-shot forced rogue — secondary free paths, not the main rescue.

> **Why the dive is in 4d, not 4c-ii:** the rescue is *only reachable* once the
> slave dives with its boss (state 9). So the paired dive (G18) and the rescue
> (G13/G14) are one inseparable unit. 4c-ii leaves the slave inert in formation;
> 4d makes it dive + be rescuable in the same phase — no half-state where killing
> the boss must do something undefined.

After 4d, update `architecture.html` (capture state-machine diagram + pointer to
this doc) and flip `progress.html` step 10 to done.

---

## 9. Implementation outcome (as-built, 2026-06-20)

**All six sub-steps implemented + browser-verified + committed** as save-points
on `galaga_clone` (one commit each: 4c-i, 4c-ii, 4d-a, 4d-b, 4d-c, 4d-d). The
base game still runs (fly-in → formation → attacks → respawn) and a **live
capture → carry-home → respawn** was observed in normal play flow
(`debugForceCapture`). Each sub-step was verified by deterministic task-stepping
in the preview (the headless rAF loop is throttled between reads, so the
load-bearing checks were done by stepping `update()` directly):

- **4c-i** ship-in-beam → pull/spin → connect (`fighterCaptured=1`) → general
  respawn; mid-pull render (boss + beam + spinning ship). ✓
- **4c-ii** boss carries ship home → slave settles above it (red) → "FIGHTER
  CAPTURED" text renders centered. ✓
- **4d-a** 1st hit → blue + alive, 2nd hit → dead; blue sprite renders. ✓
- **4d-b** slave glued to the diving boss (dx=0, dy=−16 throughout the dive). ✓
- **4d-c** shoot boss → 168-frame spin/land/dock → `twoShip=true`; shoot-slave
  → lost. ✓
- **4d-d** two fighters render side-by-side, dual fire (x and x−16), bomb on
  either fighter → revert to single ship. ✓

### As-built deviations (vs the spec above — for review)

| # | Decision in spec | As built | Why |
|---|---|---|---|
| D1 | G16: slave = a normal `state.enemies` entry | **Dedicated `state.capturedSlave` object** | The fixed 48-enemy roster has no free slot 0/2/4/6 and the objectIds collide with the boss-attack scans; a separate object avoids accidental auto-launch. G16 benefits kept via explicit checks (bulletUpdate slave hit, fighterCaptured glue). |
| D2 | G18: slave flies the boss's path `db_flv_0411` | **Slave glued to the boss's position** each frame | Simpler + the slave isn't a `state.enemies` path-runner. Net effect (dives with boss) identical. |
| D3 | G17: slave fires like an escort | **Glued slave never fires** | Falls out of D2 (positioned by `fighterCaptured`, not a `db_flv_0411` path-runner → `launchEnemyAttack`'s j_108A-style arming never runs for it). **⚠ corrected 2026-06-21:** the Z80 slave/escort bombs on EVERY dive (armed at launch by `j_108A`), so this deviates on every paired dive — NOT only in the cont-bmb endgame as previously stated. (See `research_attack_paths.md` §6.) Documented in `fighterCaptured.js`. |
| D4 | captr_status as one named struct (§2) | **Split: `state.beam` (+0/+1/+2 render) + `state.capture` (+3/+4 + rescueStage)** | The working 4a/4b beam already lived in `state.beam`; lower-risk than refactoring it. Both documented as mirroring captr_status. |
| D5 | `f_2000` exact rescue stages | **Simplified spin(36f) → land → dock-left-of-player → twoShip** | Faithful-in-effect; the exact Z80 stage timings/`captr_status+1` reuse weren't reproduced byte-for-byte. |
| D6 | 2-hit boss scoring (bonus 1600/800/400) | **Not wired** | No scoring/HUD in the clone yet (step 11). The 2-hit + blue-render combat is in. |

### Deferred (unchanged from the plan)
- **G21** standalone-rogue dive (no boss available) + status-4 home-shot forced
  rogue. The clone's rescue is the diving-boss case only.
- **G20** slave-body→player contact kill — no enemy-body→player collision exists
  in the clone yet.
- **Sound (G4)** — no sound subsystem.
- **Real life-loss / game-over** — respawn is unconditional (Decision 2).

### Recommended final acceptance (for the reviewer)
A live, hands-on playthrough: let a real capture happen, then shoot the diving
capture-boss to rescue and confirm the 2-ship hand-feel (movement bound, dual
fire, losing one fighter). The pieces are each verified, but a continuous
human-played capture→rescue→2-ship run is the natural sign-off.

### Review fixes (during Zane's playtest, 2026-06-20)
- **Capture-active stays set while a ship is held — one captured ship at a time.**
  *Found in play:* a boss that already owned a slave could open a NEW capture beam,
  and the single `state.capturedSlave` got overwritten. *Root cause:*
  `fighterCaptured` cleared `captureActive` when the slave **settled** — a misread
  of `l_1A6A`, which invalidates `cobj` only, **not** `cflag`. The source never
  clears `cflag` on a *successful* capture (`f_2222 l_22E3` jumps to `l_2305`
  before the `cflag=0` line); it clears only on rescue (`l_208F`),
  shot-capturing-boss (gg1-5.s:1212), beam-end-without-capture, and dive-abort.
  *Fix:* keep `captureActive` set at settle; invalidate only `captureBossId`. So
  while a ship is captured the selector is gated off and a boss-with-slave dives as
  an **escort sortie** (bringing the slave — the rescue chance), never a fresh
  beam. (Updates the §2 note that `captureActive ⇔ _b_bmbr_boss_cflag`.)
- **Beam lifecycle now matches the `f_2222` machine — grow → grab → shrink.**
  *Found in play:* a failed-capture beam vanished in one frame, and the grab/hold
  timing was wrong. The clone now models `tractorBeam` as three modes (`beam.mode`)
  mirroring `captr_status+1`/`+2`:
  - **grow** — `BEAM_PHASES` (0x0B) strips, each lasting `newStageParms[6]`
    (`captr_flag`) frames (Z80 l_226A reload).
  - **grab** — at full extent the Z80 (`l_231C`, gg1-3.s:632-634) sets
    `captr_status+2 = 0x40`: a **hardcoded 64-frame** hold (NOT a strip-time, NOT
    from `captr_flag`; same on every stage). The ship-in-beam test (`l_233D`) runs
    each of those frames — **capture happens ONLY here**, never during grow/shrink.
  - **shrink** — the Z80 never pops the cone: at full extent (bit 6 set) it writes
    blank tiles `0x24` bottom-to-top over the next 0x0B strips (`l_22C1`/`l_22C5`/
    `l_22CC`, gg1-3.s:567-581), per-strip timer back to `captr_flag`. Reducing
    `beam.phase` drops the lowest strip first → cone withdraws upward (same erase
    order); `endBeamNoCapture` fires at phase 0 (Z80 `l_22AB`→`l_22E3`).

  Verified: no-capture trace `grow:11, grab:64, shrink:11`; capture fires only
  with `capturedDuringMode='grab'`; mid-retract renders a partial cone.
  (Supersedes the earlier "one strip-time grab window / close-enough" note and the
  §3.2 "no-capture is instant" implication.)
- **Dive-start timing (found in play).** Un-halting the boss alone left it sitting
  out the stall segment's (`00 FC FF`) ~255-frame leftover before retreating.
  `endBeamNoCapture` now force-expires it — `boss.segTimer = 1`, mirroring Z80
  `l_22E3`'s `bug_motion_que[cboss_slot].b0D = 1` (gg1-3.s:607-612) — so the boss
  advances straight to its retreat tokens (`23 00 30 / F8 / F9 / FA`) the next
  tick and dives promptly when the beam finishes retracting.
