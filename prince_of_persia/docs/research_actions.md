# Research — the traversal actions catalog (SDLPoP)

**Purpose.** One place that ties every prince traversal move to *the collision it
executes and detects*. For each action: the **control trigger** (input + the
`seg005.c` path), the **sequence(s)** it fires, the **collision** it relies on
each tick, its **action-state**, and the **special cases**. This is the porting
spec — building an action means wiring its trigger, transcribing its sequence,
and making sure the collision it needs is faithful.

**Source.** Control: `seg005.c` (verified inventory). Sequences: `seqtbl.c`
(labels + `seqtbl_offsets[]`). Collision detail: `research_collision_detection.md`.
Frame order: `research_frame_loop.md`. Position/room: `research_position_room.md`.

**Scope.** Traversal + the item pickup (§11 — sword/potion). Sword-*combat* stance,
guards, and cutscenes are still out. Control-state values:
`CONTROL_HELD = CONTROL_HELD_UP = CONTROL_HELD_FORWARD = −1`; `CONTROL_HELD_DOWN =
CONTROL_HELD_BACKWARD = 1`; `RELEASED = 0`; `IGNORE = 1`.

---

## 0. The sequence system + control dispatch (how a move happens)

A "move" is a **sequence** (a `seqtbl` bytecode run) plus the **control decision**
that starts it. There is no separate FSM — *the sequence + its `jmp`s ARE the
state machine*; the control layer only picks the next sequence at decision-point
frames.

- **`play_seq`** (seg006.c:570) executes opcodes — `dx/dy` (move `Char.x/y`),
  `SEQ_UP/DOWN` (`curr_row ∓1`), `act(n)` (set `Char.action`), `SEQ_FLIP` (face),
  `set_fall`, `SEQ_KNOCK_UP/DOWN`, `snd`, `jmp` — until a frame byte, which becomes
  `Char.frame`. One frame emit = one tick.
- **`control_kid`** dispatches by the *current frame* (seg005.c:262):

| frame / action | handler |
|---|---|
| `action == 5_bumped` or `4_in_freefall` | *no control* (`release_arrows`) |
| `frame 15` or `50–52` (stand / turn-end) | `control_standing` |
| `frame 48` (mid-turn) | `control_turning` |
| `frame < 4` (start-run) | `control_startrun` |
| `frame 67–69` (start jump-up) | `control_jumpup` |
| `frame < 15` (run cycle 4–14) | `control_running` |
| `frame 87–99` (hanging) | `control_hanging` |
| `frame 109` (crouch) | `control_crouched` |

Handlers only `seqtbl_offset_char(seq)` (set the next sequence); `play_seq` runs it
on the same tick (`research_frame_loop.md §2.1`).

- **Actions** (`Char.action`, gates behavior): `0_stand`, `1_run_jump`,
  `2_hang_climb`, `3_in_midair`, `4_in_freefall`, `5_bumped`, `6_hang_straight`,
  `7_turn`. `check_action` (seg006.c:909) branches on this; `4/5` suppress control;
  `2/6` never fall; `7` never bumps/crosses.

---

## 1. Stand / walk (careful step)

| move | trigger (seg005.c) | sequence | collision it uses | act | notes |
|---|---|---|---|---|---|
| **stand** | idle at frame 15 | `stand` (seq_2, self-loop) | `check_on_floor` each tick (`FRAME_NEEDS_FLOOR`) → fall if unsupported | 0 | the resting state everything `jmp`s back to |
| **careful step** | Shift+fwd, or fwd near a wall (`forward_pressed`, seg005.c:566/604) | `step1..step14` (seq_29–42), picked by `get_edge_distance()` | `get_edge_distance` (`edge_type` + sub-tile distance to the wall/ledge ahead) | 1 | lands *flush* at the edge; `Char.repeat=1` |
| **test-foot** | Shift+fwd at a ledge brink, distance 0, `Char.repeat≠0` (`safe_step`, seg005.c:611) | `seq_44_step_on_edge` (testfoot) | `get_edge_distance` = `EDGE_TYPE_CLOSER` | 0 | peer over + bounce back (net dx 0) |
| **unsafe step** | `safe_step` distance 0, repeat spent (seg005.c:614) | `seq_39` (step11) | — | 1 | steps off the ledge |

`forward_pressed` (seg005.c:577): `edge_type == WALL && curr_tile2 != chomper &&
distance < 8` → `safe_step`, else `seq_1_start_run`.

---

## 2. Run

| move | trigger | sequence | collision | act | notes |
|---|---|---|---|---|---|
| **start run → run** | `forward_pressed` no near wall (seg005.c:583) | `seq_1_start_run` → run cycle (`runcyc1`↔`runcyc7`) | `check_on_floor` each tick; `check_bumped` (wall) | 1 | the run loop `jmp`s to itself |
| **run-stop** | `control_x == RELEASED` at frame 7 or 11 (`control_running`, seg005.c:589) | `seq_13_stop_run` → `stand` | `check_on_floor` | 1 | frame-gated: only skids at 7/11 |
| **run-turn** | `control_x == HELD_BACKWARD` (seg005.c:592) | `seq_6_run_turn` (`SEQ_FLIP`) → `runcyc7` | `check_on_floor`; `check_bumped` | 1 | skid + flip, resume run |
| **crouch-while-running** | `control_down == HELD` (seg005.c:597) | `seq_26_crouch_while_running` | `check_on_floor` | 1 | (roll) |

---

## 3. Turn

| move | trigger | sequence | collision | act | notes |
|---|---|---|---|---|---|
| **standing turn** | `back_pressed` (seg005.c:547) | `seq_5_turn` (`SEQ_FLIP` up front) → `stand` | none while `action==7_turn` (`check_collisions`/`check_bumped`/`leave_room` all skip turns) | 7 | the turn's own `dx` moves `Char.x`; **no room cross mid-turn** |
| **turn → run** | fwd held at frame 48 (`control_turning`, seg005.c:505) | `seq_43_start_run_after_turn` | `get_edge_distance` (near-wall guard, FIX) | 1 | |

The **turn is the one action that skips wall + room checks** — the clone must
guard its own `crossRooms`/`checkBumped` against `action==7` (it does).

---

## 4. Crouch

| move | trigger | sequence | collision | act | notes |
|---|---|---|---|---|---|
| **crouch (stoop)** | `down_pressed` on a floor (seg005.c:488/491) | `seq_50_crouch` → hold frame 109 | `check_on_floor` at frame 109 (action gated) | 1 | |
| **stand up** | `control_y != HELD_DOWN` at frame 109 (`control_crouched`, seg005.c:331) | `seq_49_stand_up_from_crouch` → `stand` | — | 5→1 | recovers the soft-land + crouch |
| **crouch-hop** | Down held + fresh fwd at frame 109 (seg005.c:334) | `seq_79_crouch_hop` (the "crawl") | `check_on_floor` + gate-height | 1 | shuffle forward ~7 units while low |

`down_pressed` also nudges `Char.x` away from a too-close edge (seg005.c:466), and
routes to **climb-down** if there's a grabbable ledge behind (§7).

**Clone status:** `down_pressed` (player.js) is wired into `control_standing`'s down
branch (both the Shift-held and plain blocks, seg005.c:380/399) — it picks **climb-down**
(a grabbable ledge behind, far enough from the back edge) or **crouch** (`stoop` = seq_50).
Stand-up on release was already done. **Crouch-hop is now done** (`control_crouched`, control.js):
Down held + a *fresh* forward → `control_forward = IGNORE` (one hop per press, no glide) +
`crouchhop` (= `seq_79`/`crawl`, seqtbl.c:427: rise 110→111→112→108 moving forward dx 1+2+2, settle
back to the crouch frame 109 and self-loop). **The under-a-low-gate fit is automatic** — no new
collision code: the kernel's `can_bump_into_gate` (`(modif>>2)+6 < char_height`) reads the *current*
frame's sprite height, and frame 109 is short, so a partly-open gate that blocks a tall stand lets the
crouch pass (the mechanism verified in the gate-collision step). Verified (deterministic `#debug`
stepping): Down → `stoop` (107/108/109); hold Down + forward → `crawl` shuffles **dx = 7** and loops
back to 109; a held forward gives exactly one hop (latch `IGNORE`), a release+repress gives another;
release Down → `standup` → stand.

---

## 5. Horizontal jumps (standing / running)

| move | trigger | sequence | collision | act | notes |
|---|---|---|---|---|---|
| **standing jump** | fwd+up while standing / start-run / jump-up (`standing_jump`, seg005.c:687; from `control_standing` 386/394, `control_startrun` 674, `control_jumpup` 681, `up_pressed` 455) | `seq_3_standing_jump` → `stand` | airborne frames 19–24 lack `FRAME_NEEDS_FLOOR` (no fall mid-arc); landing frames re-check floor; `check_bumped` on a wall | 1 | self-contained arc, net dy ~0 |
| **running jump** | up held during run, frame ≥ 7 (`run_jump`, seg005.c:898, from `control_running` 595) | `seq_4_run_jump` → `runcyc1` | **edge alignment**: scans up to 2 tiles fwd for a non-floor take-off (`get_tile_div_mod_m7` + `distance_to_edge`), aligns `Char.x`; airborne frames 38–42 no-floor; landing re-checks | 1 | clears a gap; lands running |

**Clone status (both implemented):** `standing jump` — `standingJump` wired into
`control_standing`/`control_startrun`/`control_jumpup`. `running jump` — `run_jump`
(player.js) wired into `control_running` (Up held during the run cycle): scans up to 2
tiles forward for the take-off edge and aligns `Char.x`, then plays `runjump` (seq_4);
on flat ground it jumps straight. Verified (deterministic stepping): the 34→44 arc
plays and resumes the run cycle; a held Up re-leaps each pass of run frame 7.

---

## 6. Vertical jump-up + grab + hang + climb *(implemented — this session)*

The path: `up_pressed` (seg005.c:411) → `check_jump_up` (693) chooses:

| move | trigger (seg005.c) | sequence | collision it detects | act |
|---|---|---|---|---|
| **jump up, nothing above** | `jump_up` (734): tile above is neither wall nor floor | `seq_28` (highjump) → `hangdrop` → stand | reads tile at `curr_row−1` (weight col) | 1→0 |
| **jump up into ceiling** | `jump_up`: wall/floor above | `seq_14` (jumpup, `KNOCK_UP`) → `hangdrop` | same | 1→0 |
| **grab front-above** | `grab_up_with_floor_behind` (871): `can_grab(above, front-above)` | `seq_8` jumphangMed (close) / `seq_24` jumphangLong (fwd) → `hang` | `can_grab` + `distance_to_edge_weight` + `get_edge_distance` | 1→2 |
| **grab straight-above** | `jump_up_or_grab` (711): `can_grab(behind-above, above)` | `seq_16` jumpbackhang (no floor behind) / `seq_8/24` (floor behind) → `hang` | `can_grab`; `distance_to_edge_weight`; `tile_is_floor(behind)` | 1→2 |
| **hang** | after a grab (`jmp(hang)`) | `seq_9` hang loop → (idle) `hangdrop` | none while `action==2` (`check_action` no-op) | 2 |
| **climb up** | up held while hanging, `grab_timer==0` (`can_climb_up`, seg005.c:826) | `seq_10` climbup (`dx5 dy-63 SEQ_UP`) → stand one row up | reads the ledge tile; **row change via `SEQ_UP`** | 1→5→1 |
| **hang against wall** | Shift while hanging vs a wall/doortop (seg005.c:801) | `seq_25` hangstraight (self-loop) | `get_tile_at_char` (wall/doortop test) | 6 |
| **release (land)** | hanging, no up/shift, floor below (`hang_fall`, seg005.c:857) | `seq_11` hangdrop → stand | `tile_is_floor(at)`/`(behind)` | 2→5→1 |
| **release (fall)** | hanging over a pit (`hang_fall`, seg005.c:853) | `seq_23` hangfall → freefall | no floor behind AND at char | 3→4 |

**Collision the whole family needs faithful:** (a) `can_grab` / the above-row tile
accessors — done (`collision.js`); (b) **`get_tile` link-hop on an unclamped
`curr_col`** for grabbing/climbing across a room boundary — *this is the
substrate gap* (cross-room climb, `research_position_room.md §3`).
The closed-gate climb-up variant (`seq_73` = `climbfail`) is now **ported** (2026-07-07,
`research_environment.md §1e`) — a closed gate above bounces the pull-up back down.

---

## 7. Climb down *(implemented — this session)*

- **trigger**: `down_pressed` (seg005.c:472) — no floor behind, `distance_to_edge_
  weight ≥ 8`, `can_grab(behind, at-char)`, and (facing right OR the tile isn't a
  closed gate). Aligns `Char.x`, fires `seq_68_climb_down`.
- **sequence**: `seq_68` climbdown — reach down (148→141, act 1), `dx(-5) dy(63)
  SEQ_DOWN` drops one row (act 3, frames 140/138/136/91), then `act(2) jmp(hang1)`.
- **collision**: `can_grab` (behind-below), `distance_to_edge_weight`, the gate
  check. Reuses the entire hang machinery from §6.
- **KEY (found in verification):** the hang is *transient*. On the tick after frame 91
  (still action 3), `control()` dispatches `control_hanging` (frame 87–99); with nothing
  held it calls `hang_fall`, whose `seq_11_release_ledge_and_land` the source itself
  labels **"end of climb down"** (seg005.c:866). So climb-down = *reach down → descend
  one row → controlled land*, unless the player holds **Up** (climb back up) or **Shift**
  (hang against the wall) at that moment. Not a bug — the intended flow.
- **Clone status:** implemented; `climbdown` transcribed into `seqtbl.js`; wired via
  `down_pressed` (§4). Verified: room-4 col-3-facing-left → descends row 1 → row 2 and
  lands standing on the floor (tileUnderChar = 1); no console errors.

---

## 8. Fall / land

| move | trigger | sequence | collision | act |
|---|---|---|---|---|
| **start fall (off a ledge)** | `check_on_floor`: `FRAME_NEEDS_FLOOR` + no floor + not a wall (`start_fall`, seg006.c:1099) | `seq_7`/`19` (run), `18`/`21` (jump), climb variants → freefall | reads tile at char | →3/4 |
| **freefall** | in `seq_7` etc. | `seq_10`… wait — `freefall` (seq_12 label) frame 106 loop | gravity (`fall_accel`/`fall_speed`); `do_fall` each tick | 4 |
| **fall-grab** | Shift held, `fall_y<32`, near landing row (`check_grab`, seg006.c:1177) *(✅ ported, §12)* | `seq_15` fallhang → hang | `can_grab_front_above`; sets `grab_timer=12` | 3→2 |
| **soft land** | `do_fall`→`land`, `fall_y<22` (seg005.c:174) | `seq_17` softland → crouch → stand | seat feet `y_land[curr_row+1]` | 5→1 |
| **medium land** | `22 ≤ fall_y < 33` (−1 HP) | `seq_20` medland → stand | same | 5 |
| **hard land** | `fall_y ≥ 33` (death) | `seq_22` crushed (`SEQ_DIE`) | same | 5 |

`do_fall` (seg005.c:37): above the landing row → `check_grab` (+ `in_wall`); at the
row → `land` on a floor / `in_wall` on a wall / `inc_curr_row` otherwise. The clone
substitutes `in_wall` with "don't fall on a wall."

---

## 9. Bump (wall recoil) *(implemented)*

| move | trigger (seg004.c) | sequence | act | notes |
|---|---|---|---|---|
| **grounded bump** | `bumped_floor`, non-jump frame (seg004.c:333) | `seq_47` bump (`dx-4`) → stand | 5 | the common recoil |
| **hard bump** | `bumped_floor`, jump/fall-onset frames `{24,25,40–42,102–106}` | `seq_46` hardbump → standup | 5 | |
| **bump-fall** | `bumped_fall`: wall with no floor (seg004.c:298) | `seq_45` bumpfall → freefall | 5→4 | |
| **gate push** | `check_gate_push` (seg004.c:487): closing gate on a standing/crouch/turn char *(implemented)* | (none — just `Char.x ±5`) | — | ejects from a closing gate |

Detection in the source is the **per-column buffer** edge-trigger
(`research_collision_detection.md §3–4`); this is now the faithful buffer scan in
`collision_kernel.js` (`research_collision.md §11`), not the old `Char.x` stand-in.

### Gate push *(implemented — `check_gate_push`, seg004.c:487)*

A **closing** portcullis shoves a *stationary* char (frame 15 stand, frames 108–110
crouch, or action 7 turn) sideways out of its path. It fires when a gate sits at the
char's tile (→ push **left −5**, back) or one column to his left (→ push **right +5**,
forward), the gate column has been solidly blocked two frames running
(`curr_row_coll_flags[tile_col] & prev_coll_flags[tile_col] == 0xFF`), and the gate is
low enough to bump (`can_bump_into_gate`). Ported into the kernel (a pure collision
routine over the buffers + gate tile) and called at the faithful frame-loop slot —
after `check_bumped`, before `check_action` (`seg000.c:1214`). The `--tile_col` idiom
+ `||` short-circuit pick the push direction (see the code comment). `bumped_sound`
and the `FIX_CAPED_PRINCE` straddle correction are not modeled.

**Why it needs `check_bumped` to run first.** The `0xFF` "straddling the gate column"
state only arises when the gate **descends onto** a char who was already mid-tile while
it was *open* — because a char who *walks into* a low gate is caught by `check_bumped`
(edge-triggered on a fresh `0→nonzero` flag) and knocked back to the gate face *before*
`check_gate_push` runs. So the natural sequence is: straddle the open gate (no bump,
`is_obstacle` needs `can_bump_into_gate`) → the gate descends → the moment the gap drops
below the char's height, `check_gate_push` fires. **Verified** (deterministic `#debug`
stepping, room-5 mid-room gate (5,5,0), zero console errors): a char straddling the open
gate at x=146 is pushed **−5** the instant the descending gate's gap reaches 40 (just
below stand height 41); the mirror case (char at col 6, gate one column left) pushes
**+5**. No spurious fire in normal play (run / turn / falling entry / crouch-hop through
an open gate / blocked at a closed gate). *(Sprite heights measured: stand 41, run 39,
crouch-hop 20–24, crouch 19 — so the crouch-under-a-partly-open-gate window is real:
modifier ~72–140 blocks a stand but passes a crouch; `research_collision.md §12`.)*

---

## 10. The collision each action group needs (the through-line)

| collision mechanism | actions that need it | clone status |
|---|---|---|
| `check_on_floor` / `do_fall` / `land` (tile-map floor read) | stand, walk, run, crouch, jump landings, fall | ported (kernel; the `curr_col` clamp is gone — §11 / `research_collision.md §11`) |
| `get_edge_distance` (edge classify) | careful step, forward-run gate, run-jump align, turn-run | ported |
| `can_grab` + above-row tiles | jump-up grab, climb-up, climb-down, fall-grab | ported — grab, climb-down, **and fall-grab** (`check_grab`, `research_collision.md §12`) |
| **`get_tile` link-hop on unclamped `curr_col`** | any action that lands/climbs across a room boundary | faithful (the clamp was removed — §11 / `research_collision.md §11`) |
| room cross (`leave_room` after `check_action`) | any action that crosses a boundary | ✅ faithful — **W2** (runs after `check_action`) + **W3** (climb-frame block / `Char.y` up-down) landed |
| per-column bump buffers | wall bump (all grounded moves), gate push, chomper | ✅ faithful — the kernel's per-column scan (`research_collision.md §11`); no longer a `Char.x` stand-in |

Every row above is now faithful (the substrate rework + the routine-level-identical
kernel landed); classification in `research_deviation_ledger.md`.

---

## 11. Item pickup — sword (and potion) *(implemented — the milestone)*

Not a traversal move, but a Shift-driven **action** the prince does, so catalogued here.
The path: `control_standing`/`control_crouched` (a get-item check at the top) →
`check_get_item` → `get_item` → `do_pickup` + `SEQ_GET_ITEM 1` → `proc_get_object`.

| step | trigger (seg005.c / seg006.c) | sequence | act | notes |
|---|---|---|---|---|
| **initiate (standing)** | `control_shift == HELD && control_shift2 == HELD && check_get_item()` (seg005.c:344) | — | 0 | fires only near a sword/potion; else falls through to the normal Shift handling |
| **initiate (crouched)** | `control_shift2 == HELD && check_get_item()` (seg005.c:330) | — | 1 | the second half of the two-step |
| **align + crouch** | `get_item`, frame ≠ 109 (seg005.c:641) | `stoop` (seq_50) | 1 | aligns `Char.x` to the item edge (`get_edge_distance`), then `crouch()` |
| **pick up sword** | `get_item`, frame == 109, `curr_tile2 == sword` (seg005.c:650) | `pickupsword` (seq_91) → `resheathe` | 1 | `do_pickup(-1)` erases the tile; `SEQ_GET_ITEM 1` → `proc_get_object` → `have_sword = -1` |
| **drink potion** | `get_item`, frame == 109, else (seg005.c:653) | `drinkpotion` (seq_78) | 1 | `do_pickup(modifier>>3)` = the effect type; HP/feather/flip effects out of scope, but `proc_get_object` fires a colour **flash** |

**Mechanism the pickup needs faithful:** (a) the kernel's char-relative `get_tile_*`
reads (the source reads `curr_tile2`/`curr_tilepos` across a *sequence* of them);
(b) the **`control_shift2` latch** (seg006.c:1594) — a fresh Shift reads HELD for one
tick, then `do_pickup` sets it IGNORE ("disable automatic repeat") so the grab fires
once; (c) `SEQ_GET_ITEM` in `play_seq` (fires the `onGetItem` hook = `proc_get_object`).

**Clone status:** implemented + verified (crouch → grab → `have_sword`, sword tile
consumed; the standing-on-the-sword back-up path; Shift near a non-item still
careful-steps). **Deferred (faithful):** the sword-drawn combat stance + guards (the
source only draws the sword near a guard — `can_guard_see_kid`), and the separate
sword-blade overlay sprite (body silhouettes only). Detail: `CLAUDE.md` roadmap.

### Potion — drink + colour label *(implemented)*

The potion path is the same two-step as the sword, and now with the correct **type**.
`do_pickup(modifier >> 3)` reads the effect type from the **high** bits — but only after
the level-load `alter_mods` shift makes them meaningful (`research_environment.md §6`);
the clone had been missing that shift, so `modifier >> 3` was always 0 and every potion
read as no-effect. With the shift, level-1 potions are **type 1 = heal** (verified
`pickup_obj_type == 1` end-to-end: crouch → full `drinkpotion` seq 191–205 → potion tile
erased to floor).

Effects (`proc_get_object`, seg006.c:1857 — heal/life/feather/flip/hurt/open) stay out
of scope (no HP subsystem), but two visible pieces make the potion *read* as a potion:

- **Colour label.** `drawRoom` draws each potion as a bottle tinted by SDLPoP's own
  `pot_types` table (`screenshot.c:181`), keyed by `modifier >> 3`: red = heal/life,
  green = slow-fall/flip, blue = hurt/open, gray = empty. ("Label the potions with
  colours.") Level 1 → red.
- **Drink flash.** `proc_get_object` sets a short screen wash in the potion's colour
  (`flash_color`/`flash_time`) — cosmetic here (no HP to change), so drinking visibly
  does *something* and reinforces the colour.

Verified: potion renders red, drink consumes it (tile 10 → 1, modifier → 0), flash fires
(type 1 → red). Detail: `CLAUDE.md` roadmap + `research_environment.md §6`.
