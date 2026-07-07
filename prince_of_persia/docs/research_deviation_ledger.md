# Research — the deviation ledger (clone vs SDLPoP)

**Purpose.** The actionable synthesis: every place the `index.html` player differs
from SDLPoP, **classified**, so the substrate rework has a precise work-list and
the legitimate defers are on record. Reading order: this doc last, after
`research_frame_loop.md`, `research_position_room.md`,
`research_collision_detection.md`, `research_actions.md`, `research_environment.md`.

**Rule (from the root `CLAUDE.md` retro-port principle):** deviations are one of
three kinds. Only the third is a bug.

| class | meaning | action |
|---|---|---|
| **FAITHFUL** | matches the source mechanism | none |
| **LOAD-BEARING SUBSTITUTE** | a deliberate stand-in that preserves visible behavior; the source mechanism isn't needed yet | keep; revisit only if a feature needs the real thing |
| **DEFERRED** | not ported, but cleanly tied to a feature that isn't built | port when that feature lands |
| **WRONG-DIRECTION PATCH** | produces *incorrect* behavior, not just a simplification | **fix — the substrate rework** |

Clone files: `player.js`, `collision.js`, `control.js`, `seqtbl.js`,
`playseq.js`. The clone's own implementation notes live in `research_collision.md`
(unchanged by this research).

---

## 1. WRONG-DIRECTION PATCHES — the substrate rework  ✅ IMPLEMENTED 2026-07-07

**STATUS: DONE + verified.** W1 + W1b + W2 + W3 landed in `player.js`; the four
subsections below are the record of *why*. Cross-room climb now succeeds (climb
into the adjacent room → straddle → resolve on the next step), the W1b boundary-
wall oscillation is gone (settles flush), vertical up/down + horizontal crosses
all pass, and every regression is green (no console errors). No straddle-draw
companion was needed — the character is drawn room-relative exactly as the source
does in the straddle state. Verification detail: §5.

These three interact to produce the cross-room-climb failure (grab a ledge in the
next room → climb → fall). They are one coherent fix: **model the boundary
straddle the way the source does.**

### W1 · `determineCol` clamps `Char.curr_col` to `[0,9]`
- **Clone:** `player.js determineCol` → `ch.curr_col = Math.max(0, Math.min(9, …))`.
- **Source:** `determine_col` (seg006.c:122) is unclamped; only
  `char_col_left/right` (the *collision-scan bounds* in `set_char_collision`,
  seg006.c:1036) are clamped. Two distinct column concepts
  (`research_position_room.md §3`).
- **Symptom:** at a boundary the clamp forces `curr_col = 0` instead of `−1`, so
  `checkOnFloor`/`getTileAtChar` reads the character's *own* (empty) room instead
  of link-hopping to the neighbour's ledge → the climb falls.
- **Fix:** leave `curr_col` raw; clamp only the collision-scan bounds. The `getTile`
  link-hop (already faithful in `collision.js`) then reads the right tile.
- **MEASURED (2026-07-07, preview A/B toggle on `determineCol`):** unclamping
  **fixes cross-room climb** (clamped → falls back to row 1; unclamped → climbs to
  row 0, no fall) and is behaviourally identical to the clamp on 11 of 12 regression
  scenarios (falling entry, within-room climb, jump-up, run/stop, run 2↔3 both ways,
  turn-at-edge, fast-run, loose fall, walled-boundary reversal, turn-right-at-edge).
  **It exposes exactly one companion bug** (call it **W1b**): at a boundary *wall*
  the char **oscillates** stand→run→bump→recoil→step→… instead of settling flush.
  **Root cause = another clone simplification, not a source reality.** The source
  `get_edge_distance` (seg004.c:380-397) checks the char's **own tile**
  (`get_tile_at_char`) FIRST and only falls back to the tile in front; the clone's
  `getEdgeDistance` skipped the own-tile check and only reads `frontCol = curr_col +
  facing`. Flush at the boundary (`curr_col = −1`): the source's own-tile check is
  `get_tile(room 2, −1, row 1)` → link-hops to **room 6 col 9** = the *adjacent*
  wall → correct distance → safe-step flush. The clone computes `frontCol = −2` →
  **room 6 col 8** (one column further) → distance `> 8` → `forward_pressed` runs →
  re-bump. With the clamp (`curr_col ∈ [0,9]`) `frontCol = curr_col ± 1` always hit
  the correct adjacent column, so the front-only shortcut *happened* to work.
  **W1 and W1b are one entangled simplification: the clamp made the front-only
  edge check safe, and the front-only check was written because the clamp was
  there. The fix is to FOLLOW THE SOURCE — unclamp `curr_col` AND port
  `get_edge_distance`'s own-tile-first structure — which removes both.** (Check
  `checkBumped`'s post-pin floor-decision col for the same class of shortcut.)

### W2 · `crossRooms` runs *before* `checkAction` (wrong order)
- **Clone:** `player.js tick()` order `… checkBumped → crossRooms → checkAction …`.
- **Source:** `check_action` is inside `play_kid_frame`; `exit_room` (the room
  cross) is *after*, in `play_frame` (`research_frame_loop.md §2.4`). So the floor
  check runs first (reading across the boundary via the unclamped col), and the
  room only swaps at end-of-frame.
- **Symptom:** the clone tries to cross *before* the fall check to dodge the fall —
  a symptom of W1. With W1 fixed, the cross belongs after.
- **Fix:** move the room cross to the end of the tick (a faithful `exit_room` step).

### W3 · `crossRooms`/`leave_room` port is incomplete
- **Clone:** `player.js crossRooms` — `Char.x` thresholds (54/57/198/201, ported
  from `leave_room` seg002.c:462–483) + guards for turn (act 7) and stand-up
  (frames 110–119); vertical via `curr_row < 0 / ≥ 3`.
- **Source:** `leave_room` (seg002.c:423) also (a) **blocks horizontal leave during
  climb frames 135–149** and (b) does **`Char.y`-based up/down leave** first
  (`(sbyte)Char.y` in `(−16,10)` → up; `≥211` → down), not `curr_row`.
- **Symptom:** a climb that should cross (up, or diagonally into a side room) isn't
  handled the way the source gates it.
- **Fix:** port `leave_room`'s full decision (the climb-frame block + the
  `Char.y`-based vertical leave), called from the W2 post-frame step.

**Companion (render side of the rework), classify as LOAD-BEARING for now:**
`xpos_in_drawn_room` (the straddle draw, seg004.c:254) is not modeled — the clone
draws neighbour *slivers* in the side margins and snaps the character to one room.
Fine for within-room play; a *mid-cross* character (climbing across a boundary)
would ideally be drawn straddling. Bundle with the rework if the straddle looks
wrong after W1–W3, else leave the slivers.

**Acceptance test for the rework:** cross-room climb (room 2 col 0 facing left →
climb into room 6) succeeds; and the full regression set still passes —
run-cross-boundary, turn-at-edge, wall-bump both dirs, loose-floor fall, the 2↔3
crossings, the falling entry.

---

## 2. LOAD-BEARING SUBSTITUTES — keep

| # | clone substitute | source mechanism | why keeping is right |
|---|---|---|---|
| L1 | `checkBumped` detects walls by clamping `Char.x` to the wall face | per-column collision **buffers** (`check_collisions`/`get_row_collision_data` → `is_obstacle_at_col`, edge-triggered) — `research_collision_detection.md §3–4` | the `Char.x` stand-in reproduces the visible bump for every shipped case; the buffer's extra reach (multi-row, char-vs-char) isn't exercised until guards/chompers. `research_collision.md §5b`. |
| L2 | `checkOnFloor` "don't fall on a wall" | `in_wall()` sideways eject (seg006.c:1057) | a wall is solid, not a hole — the substitute yields the same "you don't fall through a wall" without the eject animation, which no shipped case needs |
| L3 | neighbour **slivers** in the margins | `xpos_in_drawn_room` straddle draw | cosmetic; makes cross-boundary walls visible. (Promoted to the rework only if W1–W3 expose a straddle artifact — see §1.) |
| L4 | `load_frame_to_obj` folded into `draw()` | an explicit spine step | pure rendering placement; identical result |
| L5 | no pre-control `determine_col` (only post-`playSeq`) | two `determine_col`s per tick (seg000.c:1194/1209) | control reads last-tick's `curr_col`; the drift is sub-tile and unobservable in shipped moves |

---

## 3. DEFERRED — port with the owning feature

| # | not ported | owning feature | on-ramp already in place |
|---|---|---|---|
| D1 | `check_collisions`/`get_row_collision_data` (buffer scan) | multi-row bumps, char-vs-char (guards), chomper | `bumped*` dispatch is faithful; only the *scan* is stubbed |
| D2 | `check_grab` (Shift fall-grab, seq_15) | grab-a-ledge-while-falling | `grab_timer` field + countdown wired; `canGrab` ported |
| D3 | `down_pressed` climb-down path (seq_68) | climb down | reuses the whole hang machinery from this session |
| ~~D4~~ ✅ | `can_climb_up`'s `seq_73` (`climbfail`, climb onto a closed gate/mirror/chomper) | gate climb | **PORTED 2026-07-07** — `climbfail` transcribed; `canClimbUp` picks it per `seg005.c:840` |
| D5 | horizontal `standing_jump`/`run_jump` control wiring | horizontal jumps | `standjump`/`runjump` sequences transcribed; `control_jumpup` conversion is a documented no-op |
| D6 | `check_gate_push` + `animate_door` + `trigger_gate` (**button/animate subsystem**) | **portcullis open/close** | `can_bump_into_gate` collision + `climbfail` now **PORTED 2026-07-07** (D4); gate *drawn*; `doorLinks` decoded in `level1.js`; modifier in the mutable `bg` byte (like loose); `check_press` has the loose branch — add the button branch |
| D7 | `add_mob` debris chunk + `loose_shake` visual | loose-floor polish | loose collapse + fall already work |
| D8 | spikes / chompers / potions / mirror / level-door interactions | hazards & items | tile predicates + `wall_type` already classify them statically |

---

## 4. FAITHFUL — no action (the substrate that already works)

- **Animation engine:** `play_seq` interpreter + every opcode (`dx/dy/UP/DOWN/
  FLIP/ACTION/SET_FALL/KNOCK_*`), `frame_table_kid` draw offsets, the sequence
  catalog transcribed (`seqtbl.js`), the reg-point flip. (`research_actions.md §0`.)
- **Control dispatch:** `control_kid` frame-dispatch + the `action 4/5` suppression
  gate + facing-relative input; the standing/running/startrun/jumpup/hanging/
  crouched handlers for the built moves.
- **Tile layer:** `getTile` + `find_room_of_tile` crossing (0→wall), `tileIsFloor`,
  `wallType`, `getTileModif`, the row-above accessors, `canGrab`.
- **Coords:** `dxWeight`, `tileDivMod(_m7)`, `distanceToEdge`, `getEdgeDistance`
  (wall/floor/closer branches), `standX`, `Y_LAND`, `X_BUMP`.
- **Fall/land + bump:** `checkAction` action-branching, `doFall`/`land`/`startFall`
  thresholds (soft/med/hard), `bumped`/`bumpedFloor`/`bumpedFall` recoil dispatch.
- **Room rebase math:** `gotoRoom` (±140/±189, `curr_row` recompute on up/down).
- **Loose floors:** the full trob slice (`trob.js`), `check_press` loose branch,
  the mutable-level modifier countdown.
- **Frame-loop order** *except* W2 (crossRooms placement) and D1 (check_collisions).

---

## 5. The rework, scoped

**Substrate rework = W1 (+W1b) + W2 + W3** (one change to the position/room layer):
1. **W1** `determineCol`: stop clamping `curr_col`; clamp only the collision-scan
   bounds. **W1b** (same deviation, other end): port `get_edge_distance`'s
   **own-tile-first** structure into `getEdgeDistance` (check `get_tile_at_char`
   before the front tile) instead of the front-only `curr_col + facing` shortcut —
   otherwise a boundary wall oscillates (W1 §MEASURED). Check `checkBumped`'s
   post-pin floor-decision col for the same class of shortcut.
2. **W2** `tick()`: move the room cross to a post-`checkAction` `exitRoom()` step.
3. **W3** `crossRooms` → a faithful `leaveRoom`: add the climb-frame (135–149) block
   and the `Char.y`-based up/down leave.
4. (conditional) `xpos_in_drawn_room` straddle draw, only if slivers look wrong.

**Empirically validated (A/B check, then the landed rework):** W1 fixes
cross-room climb with no regression on 11/12 scenarios; W1b is the one companion
fix the A/B check surfaced (boundary-wall oscillation). After landing all four:

- cross-room climb: climbs to row 0 on the neighbour's ledge, no fall; straddles
  (`Char.room` unchanged, `curr_col = −1`), and walking left resolves the cross
  fully into room 6 (`drawnRoom` shifts) — faithful straddle behavior.
- boundary-wall bump: settles flush at x=58 (`frame 15` held), no oscillation.
- vertical crosses: `Char.y`-based UP (climb into the room above → `Char.y += 189`)
  and DOWN (`Char.y ≥ 211` → room below) both fire; DOWN confirmed via the loose
  floor fall (room 1 → 2).
- regressions: within-room climb, jump-up, falling entry, run/stop, run 2↔3 both
  ways, turn-at-edge — all pass. No console errors.

**Files touched:** `player.js` only — `determineCol` (unclamp), `getEdgeDistance`
(own-tile-first), `crossRooms`→`leaveRoom` (Char.y up/down + climb-frame block),
`tick()` (room cross moved after `checkAction`/`checkPress`). `collision.js`
`getTile` already handled the link-hop.

Everything else is either faithful, a keeper substitute, or a feature-scoped
defer. The rework is bounded to the layer that `research_position_room.md` maps,
and its acceptance test is §1.

**Portcullis progress:** the **collision half is done** (2026-07-07) —
`can_bump_into_gate` (open/closed-aware block) + the climb-into-a-closed-gate
`climbfail` (D4). What remains for the full mechanic (D6) is the **button/animate
subsystem** — `trigger_gate` + `animate_door` (open/close over time) +
`check_gate_push` — whose data + trob machinery are already in place.
