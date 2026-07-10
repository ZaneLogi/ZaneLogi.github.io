# Research — the per-tick frame loop (SDLPoP)

**Purpose.** Map the exact per-frame order in which SDLPoP runs the prince's
control, animation, position, and collision code — because *the order is
load-bearing*. Several of the clone's bugs (cross-room climb, the fall-vs-cross
race) come from doing these steps in a different order than the source. This is
the spine every other research doc hangs off.

**Source.** `C:\Z_Temp\SDLPoP\src` — `seg000.c` (the loop), `seg002.c`
(room crossing), `seg006.c`/`seg004.c` (the per-step routines). Citations are
`segNNN.c:line`.

**Scope.** Traversal only. Guard/sword/cutscene steps are named where they sit
in the order but not detailed (see the project scope note). This doc does not
duplicate the coordinate model (`research_position_room.md`) or the collision
kernel (`research_collision_detection.md`) — it places them in time.

---

## 0. Two nested loops: `play_frame` → `play_kid_frame`

`play_frame` (seg000.c:863) is the top of one game tick. In order:

1. `do_mobs()` — falling debris (loose-floor chunks); their own subsystem.
2. `process_trobs()` (seg007.c:24) — advance every animated tile (loose floors,
   **gates/portcullis**, spikes, chompers, doors…). See `research_environment.md`.
3. `check_skel()`, `check_can_guard_see_kid()` — guard bookkeeping.
4. **`play_kid_frame()` (seg000.c:1192)** — the prince's whole frame (§1). Returns
   1 if the level was restarted (loop bails).
5. `play_guard_frame()` — the guard's frame (same shape, `Char` = guard).
6. `check_sword_*`, `do_delta_hp()` — combat/HP (not traversal).
7. **`exit_room()` (seg000.c:881 → seg002.c:311)** — the room crossing. **This is
   AFTER `play_kid_frame`.** See §2.4 — it is the single most important ordering
   fact in this doc.
8. `check_the_end()` (seg000.c:1256) — applies the pending `next_room` →
   `drawn_room` swap that `exit_room` requested.
9. `check_guard_fallout()`, level-specific events.

So a room change is decided/applied at the *very end* of the tick, once the kid
frame (including its fall check) has already run.

---

## 1. `play_kid_frame` — the spine (seg000.c:1192)

The exact call order (traversal-relevant steps in **bold**):

```
play_kid_frame():
  loadkid_and_opp()                    // Char = the kid
  load_fram_det_col()                  // = load_frame() + determine_col()  -- BEFORE control (§2.2)
  check_killed_shadow()
  play_kid()                           // == control_kid: input -> pick next sequence (research_actions.md)
  ...restart / upside_down checks...
  if (Char.room != 0) {
    play_seq()                         // run the chosen sequence: new frame + Char.x/y/action/curr_seq
    fall_accel()                       // gravity accel  (freefall only)   seg006.c:0577
    fall_speed()                       // apply fall velocity to y (+ fall_x drift in freefall)  seg006.c:05AE
    load_frame_to_obj()                // obj_x/obj_y = draw offsets from frame_table  seg008.c:1736
    load_fram_det_col()                // determine_col() AGAIN, from the moved Char.x  (§2.2)
    set_char_collision()               // char_x_left/right, char_col_left/right (clamped), char_*_row  seg006.c:1012
    bump_into_opponent()               // char-vs-char (guard) — NOT the kid-vs-wall path
    check_collisions()                 // FILL the per-column collision buffers (wall data)  seg004.c:42
    check_bumped()                     // READ the buffers -> bumped / bumped_floor / bumped_fall  seg004.c:151
    check_gate_push()                  // a closing gate shoves the kid out of its tile  seg004.c
    check_action()                     // the fall/floor hub: do_fall / check_on_floor per action  seg006.c:909
    check_press()                      // trob triggers: loose floor / button underfoot  seg006.c:1683
    check_spike_below()
    check_spiked()                     // spike hazard  seg006.c:968
    check_chomped_kid()                // chomper hazard (reads the collision buffer)  seg004.c:439
    check_knock()
  }
  savekid()
```

`play_guard_frame` (seg000.c:1229) is the same skeleton with `Char` = guard and a
`44 ≤ Char.x < 211` on-screen gate; it uses `check_guard_bumped` instead of
`check_collisions`/`check_bumped`. Not our concern, but it confirms the shape is
generic over the character.

---

## 2. The load-bearing ordering facts

### 2.1 Control before animation
`play_kid()` (control) runs *before* `play_seq()`. Control only sets
`Char.curr_seq` (picks the next sequence); `play_seq` then advances it and emits
the frame. So a control decision takes effect on the *same* tick's `play_seq`.
(This is why the clone's control-phase handlers must only `startSeq` — never also
`playSeq` — while the post-`play_seq` collision handlers `startSeq`+`playSeq`.)

### 2.2 `determine_col` runs TWICE per tick
`load_fram_det_col()` = `load_frame()` + `determine_col()` (seg006.c:116). It is
called **once before `play_kid()`** (so control reads the *current* column) and
**again after `play_seq()`** (so collision reads the column at the *new* `Char.x`).
`determine_col` itself is just `Char.curr_col = get_tile_div_mod_m7(dx_weight())`
(seg006.c:122) — **unclamped** (see `research_position_room.md §3`).

### 2.3 Fill buffers, then read them
`check_collisions()` (fill the per-column wall buffers) runs *before*
`check_bumped()` (read them). The fall/floor path (`check_action`) reads the tile
map directly, not the buffers (see `research_collision_detection.md`). Order
within the collision block: **`determine_col` → `set_char_collision` →
`check_collisions` → `check_bumped` → `check_gate_push` → `check_action` →
`check_press`** — position is resolved first, then walls, then gates, then floor,
then triggers.

### 2.4 The room cross is AFTER the fall check — and this is why straddling works
`check_action()` (which contains `check_on_floor`/`do_fall` — the fall trigger)
is **inside** `play_kid_frame`. `exit_room()` (which decides and applies the room
swap via `leave_room`→`goto_other_room`) is **after**, back in `play_frame`
(seg000.c:881). So within one tick:

1. `play_seq` moves `Char.x` (possibly past a room boundary).
2. `determine_col` sets `Char.curr_col` = the raw column — which can be **−1 or
   10** when `Char.x` is at/over a boundary. It is *not* clamped.
3. `check_action` → `check_on_floor` reads `get_tile_at_char()` =
   `get_tile(Char.room, Char.curr_col, Char.curr_row)`. With `curr_col = −1`,
   `get_tile` **link-hops** into the neighbour room and reads the tile *there*.
   So a character straddling the left boundary sees the neighbour's floor — no
   spurious fall — even though `Char.room` hasn't changed yet.
4. Only at `exit_room` does `leave_room` decide whether to actually swap
   `Char.room` (and it *blocks* the swap during climb frames 135–149, stand-up
   110–119, and turns — see `research_position_room.md §5`). Until then the
   character legitimately lives in one room while reading/drawing into another.

**This is the mechanism the clone breaks in two places at once:** it clamps
`curr_col` to `[0,9]` (so step 3 reads the *wrong* room's empty tile and falls),
and it runs its room-cross *before* `check_action` (wrong order). Both are logged
in `research_deviation_ledger.md`.

---

## 3. The clone's `tick()` vs the source order (now FAITHFUL — the reworks landed)

`index.html`'s `player.js` `tick()` currently does (matching the source spine):

```
processTrobs → readRawAxis/restCtrl1/readUserControl → controlKid → saveCtrl1
→ playSeq → fallAccel → fallSpeed → load_frame_to_obj → determine_col → set_char_collision
→ check_collisions → check_bumped → check_gate_push → check_action → checkPress
→ check_spike_below → check_spiked → leaveRoom
```

The table below was the *old* divergence list — **every row has since been resolved** (the
routine-level-identical kernel + the W1/W2 substrate rework):

| step | old clone state | now |
|---|---|---|
| pre-control `determine_col` | no | still folded (control reads last tick's col — minor, kept) |
| `load_frame_to_obj` as a step | folded into `draw()` | now an explicit `tick()` step feeding `set_char_collision` |
| `check_collisions` (fill buffers) | absent — ad-hoc `Char.x` | ✅ the faithful per-column buffer scan (kernel, §5b/`research_collision.md §11`) |
| `check_gate_push` | absent | ✅ ported into the kernel (a closing gate ejects you sideways) |
| room cross vs `check_action` | `crossRooms` **before** `checkAction` (wrong) | ✅ **W2** — `leaveRoom` runs **after** `checkAction` (source `exit_room` order) |
| `curr_col` clamp | clamps `[0,9]` (wrong-direction patch) | ✅ **W1** — clamp removed; only the collision-scan bounds clamp |

(New steps since: `check_spike_below`/`check_spiked` for the lethal-spike hazard, and the
control-latch pipeline `restCtrl1`/`readUserControl`/`saveCtrl1`.)
