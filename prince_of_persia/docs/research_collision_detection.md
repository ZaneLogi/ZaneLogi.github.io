# Research — the collision-detection kernel (SDLPoP)

**Purpose.** The source-faithful map of *how* the prince detects collision: the
tile predicates, the per-column collision buffers, the wall-bump path, the
fall/land path, and ledge-grab. This complements `research_collision.md` (which
documents the *clone's* current collision code + its deviations) — this doc is the
SDLPoP side, the target.

**Source.** `seg004.c` (buffers, bump, edge distance, gate/spike/chomper), `seg006.c`
(tile predicates, coords, `check_action`/`check_on_floor`/`start_fall`, grab),
`seg005.c` (`do_fall`/`land`). Citations `segNNN.c:line`. Verified by direct read
of `seg004.c:20–264`.

**Scope.** Traversal, kid-vs-tile. Char-vs-char (`bump_into_opponent`) is guards
only and out of scope.

---

## 0. The one distinction that organizes everything

There are **two collision paths**, and they read different things:

| path | reads | routines |
|---|---|---|
| **Wall bump** (edge-triggered, per-column) | the **collision buffers** (`curr_row_coll_*`), then the tile map for the type | `check_collisions` → `check_bumped` → `is_obstacle_at_col` → `bumped*` |
| **Floor / fall / grab / press** | the **tile map directly** (`get_tile_at_char` etc.) | `check_action` → `check_on_floor`/`do_fall`/`land`/`start_fall`; `can_grab`/`check_grab`; `check_press` |

So a wall *stop/recoil* uses the buffers; deciding whether you *fall* or *grab*
does not — it link-hops `get_tile` on the (unclamped) `Char.curr_col`. This is why
the clone's `curr_col` clamp breaks cross-room climb (a *fall* decision) but the
clone's buffer-less `Char.x` bump still works: the two paths are independent.

---

## 1. Tile predicates (the vocabulary)

- **`tile_is_floor(t)`** (seg006.c:951) — a surface you stand on. Returns 0 for
  `{0 empty, 9 bigpillar_top, 12 doortop, 20 wall, 26–29 lattice}`, else 1. Note a
  **gate (4)** and **doortop_with_floor (7)** *are* floors here — you can stand on
  a closed gate.
- **`wall_type(t)`** (seg006.c:1626) — a vertical obstacle + which side: `4 gate /
  7 doortop_with_floor / 12 doortop → 1` (wall at right); `13 mirror → 2` (wall at
  left); `18 chomper → 3` (obstacle at left); `20 wall → 4` (both); else `0`.
  **A gate returns "wall" regardless of open state** — its actual walkability is a
  separate check (`can_bump_into_gate`, §5 / `research_environment.md`).

Both are pure over the tile type; the clone ports them verbatim.

---

## 2. Coordinates the kernel needs

- **`get_tile_div_mod(xpos)`** (seg006.c:750) / **`_m7(xpos)`** (seg006.c:697) —
  internal-x → tile column; `_m7` evaluates on `xpos−7` (the tile-mid point).
  Both set `obj_xl` (the sub-tile offset), used by distance functions.
- **`dx_weight()`** (seg006.c:547) — `char_dx_forward(cur_frame.dx − (flags &
  FRAME_WEIGHT_X))`. The weight point ~10 units behind the leading edge;
  `determine_col` samples the column here.
- **`distance_to_edge(xpos)`** (seg006.c:1328) / **`distance_to_edge_weight()`**
  (seg006.c:1323, = `distance_to_edge(dx_weight())`) — sub-tile distance from
  `xpos` to the edge of its tile in the facing direction (0..13).
- **`get_edge_distance()`** (seg004.c:378) — the *classified* forward distance +
  `edge_type` global (`EDGE_TYPE_WALL` / `_FLOOR` / `_CLOSER`). Reads the tile at
  char and in front (`wall_type`, `tile_is_floor`) and the loose/sword/potion
  special cases. This is the input to `forward_pressed`/`safe_step`/grab
  positioning. The clone ports the wall/floor/closer branches.

---

## 3. The per-column collision buffers (the wall substrate)

Globals (per-column arrays of 10, one entry per on-screen column):

- `curr_row_coll_flags[10]`, `curr_row_coll_room[10]` — the character's row.
- `above_row_coll_*[10]`, `below_row_coll_*[10]` — rows ±1 (a 3-row band).
- `prev_coll_flags[10]`, `prev_coll_room[10]` — last frame's row.
- `collision_row` / `prev_collision_row`; `left_checked_col` / `right_checked_col`
  (scan bounds); `bump_col_left_of_wall` / `bump_col_right_of_wall` (results).

A **flag byte** encodes, per column, whether a wall's near face overlaps the
character's collision box: low nibble `0x0F` = a wall on the **left** side is
within `char_x_right_coll`; high nibble `0xF0` = a wall on the **right** side is
beyond `char_x_left_coll` (`get_row_collision_data`, seg004.c:121-123).

### `check_collisions` (seg004.c:42) — fill + edge-detect
1. `bump_col_left/right_of_wall = −1`; **return early if `action == 7_turn`**
   (turns don't bump — the clone mirrors this).
2. `move_coll_to_prev()` (seg004.c:76) — copy the row the character was *on* into
   `prev_coll_*` (it picks curr/above/below by how `curr_row` shifted since last
   frame), and clear the three current buffers.
3. Scan bounds from the collision box: `left_checked_col =
   get_tile_div_mod_m7(char_x_left_coll) − 1`, `right_checked_col =
   MIN(get_tile_div_mod_m7(char_x_right_coll) + 2, 11)`.
4. `get_row_collision_data` for `collision_row`, `+1`, `−1` — fill curr/below/above.
5. For each column: **if the wall is in the same room as last frame AND a
   wall-flag went `0 → nonzero`, record the bump column.** i.e. a bump is
   **edge-triggered on the transition into a wall**, not on merely resting against
   one (seg004.c:53-72). This is the subtle bit the clone's `Char.x`-clamp
   stand-in approximates.

### `get_row_collision_data` (seg004.c:110) — tile map → flags
For each column in `[left_checked, right_checked]`: `get_left_wall_xpos` /
`get_right_wall_xpos` (seg004.c:131/141 — `wall_type` + the `wall_dist_from_left/
right[]` tables at seg004.c:37-39), then pack the two nibble flags vs
`char_x_left/right_coll`, and store `curr_room` (from the `get_tile` side effect).
So the buffer records *which room* each column's wall is in — enabling the bump
path to work across a room boundary.

---

## 4. The wall-bump path

### `check_bumped` (seg004.c:151)
Runs only when `action ≠ 2_hang_climb`, `≠ 6_hang_straight`, and the frame is
**not** a climb frame (`135 ≤ frame < 149`) — hanging/climbing don't wall-bump.
Then: `bump_col_left_of_wall ≥ 0 → check_bumped_look_right()`, else
`bump_col_right_of_wall ≥ 0 → check_bumped_look_left()` (the names are inverted:
a wall on your *left* means you moved *right* into it).

### `check_bumped_look_left/right` (seg004.c:180/199)
Gated by facing (or sword drawn). Call `is_obstacle_at_col(bump_col)`; if it's a
real obstacle, `bumped(wall_face − char_edge, push_dir)`.

### `is_obstacle_at_col` (seg004.c:218) → `is_obstacle` (seg004.c:231)
`is_obstacle_at_col` reads **`curr_row_coll_room[tile_col]` (the buffer)** for the
room, then `get_tile(that room, tile_col, tile_row)`. `is_obstacle` filters:
`potion → not an obstacle`; `gate → obstacle only if can_bump_into_gate()` (§5);
`chomper → obstacle only if closed (modif == 2)`; `mirror + a right-to-left
run-jump → break it (set modif 0x56), not an obstacle`; else obstacle. It also
sets `coll_tile_left_xpos = xpos_in_drawn_room(...)` (the straddle offset).

### `bumped` / `bumped_floor` / `bumped_fall` (seg004.c:266 / 311 / 298)
`bumped` pins `Char.x` to the wall face, then dispatches by whether the tile the
character *stands on* (its neighbour on the standing side) is a floor:
- floor → `bumped_floor` (seg004.c:311): seat feet at `y_land[curr_row+1]`; if
  `fall_y ≥ 22` shove back 5 (a heavy-landing bump, no recoil seq); else pick
  `seq_46_hardbump` on jump/fall-onset frames `{24,25,40–42,102–106}` or
  `seq_47_bump` otherwise.
- no floor → `bumped_fall` (seg004.c:298): if already falling just kill `fall_x`;
  else skid back 4 and play `seq_45_bumpfall` → freefall.

The clone ports `bumped/bumped_floor/bumped_fall` (research_collision.md §5b) but
substitutes the buffer *scan* with a `Char.x` clamp; what that defers (multi-row +
trailing-edge/knockback bumps) is written up there.

---

## 5. Gate collision (the portcullis interaction with the kernel)

- **`can_bump_into_gate()`** (seg004.c:373): `return (curr_room_modif[curr_tilepos]
  >> 2) + 6 < char_height;` — the gate is a bump obstacle only while its open
  height `(modifier >> 2) + 6` is **less than** the character height. Open enough →
  not an obstacle → you walk under. Used inside `is_obstacle` (§4) and by
  `get_edge_distance`, and by:
- **`check_gate_push()`** (seg004.c, run in the spine after `check_bumped`): while
  standing/crouching/turning, if the tile at/left-of char is a gate, **both**
  `curr_row_coll_flags & prev_coll_flags == 0xFF` (fully walled this frame *and*
  last), and `can_bump_into_gate()`, then shove `Char.x` out (±5) so a closing gate
  ejects the prince instead of trapping him. The clone does not model this yet.

Full gate open/close mechanism (button → door-link → `animate_door`) is in
`research_environment.md`.

---

## 6. The fall / floor path (reads the tile map, NOT the buffers)

### `check_action` (seg006.c:909) — the hub, by action
- `6_hang_straight` / `5_bumped`: only at frame 109 (crouch) [+ the FIX ranges] →
  `check_on_floor`.
- `4_in_freefall` → `do_fall`.
- `3_in_midair` → at frames 102–105 → `check_grab`.
- `2_hang_climb` → nothing (hanging never falls).
- else (incl. `0_stand`, `1_run_jump`) → `check_on_floor`.

### `check_on_floor` (seg006.c:1046)
If the frame has `FRAME_NEEDS_FLOOR`: read `get_tile_at_char()`; **if it's a
`tiles_20_wall` → `in_wall()`** (eject sideways — you don't fall *through* a wall);
if it's not a floor → `start_fall()`; else stay. The clone substitutes the
`in_wall` eject with "don't fall on a wall."

### `do_fall` (seg005.c:37)
While freefalling: scream if `fall_y ≥ 31`; above the landing row → `check_grab`
(Shift-grab mid-fall) + optional `in_wall`; at the landing row → if the tile is a
floor `land()`, if a wall `in_wall()`, else `inc_curr_row()` (descend a row).

### `land` (seg005.c:114)
Clamp feet to `y_land[curr_row+1]`, handle spikes, then by impact speed:
`fall_y < 22 → seq_17 softland`; `< 33 → seq_20 medland` (−1 HP); `≥ 33 → seq_22
crushed/dead`. `fall_y = 0`.

### `start_fall` (seg006.c:1099)
`inc_curr_row`, sheath sword, pick the fall sequence by the frame it fell from
(run → `seq_7`/`seq_19`; jump → `seq_18`/`seq_21`; climb → pushed-off variants),
adjust `Char.x` if in front of a wall.

**Every routine in §6 reads the tile map directly through `get_tile_at_char` /
`get_tile_infrontof_char`** — which link-hop on the unclamped `curr_col`. That is
the exact path the clone's clamp corrupts.

---

## 7. Ledge grab

- **`can_grab()`** (seg006.c:1606) — over `through_tile` (the tile the hands pass)
  and `curr_tile2` (the target): can't grab through a wall / a right-facing doortop
  / a floor; can't grab a shaking loose target; a doortop-with-floor only from the
  left; the target must be a floor. The clone ports this as `canGrab`.
- **`can_grab_front_above()`** (seg006.c:1285) — sets `through_tile = above`,
  `curr_tile2 = front-above`, then `can_grab()`.
- **`check_grab()`** (seg006.c:1177) — the **fall-grab**: if Shift held, `fall_y <
  32`, alive, and within 25 of the landing row, nudge x by −8 and test
  `can_grab_front_above`; on success seat at the edge, `seq_15` (grab ledge
  midair), **`grab_timer = 12`**. Called from `do_fall`/`check_action` (midair
  frames). This is the deferred "grab a ledge while falling" — the clone has
  `grab_timer` wired but not `check_grab`.

---

## 8. Hazards (edge cases, for completeness)

- **`check_spiked`** (seg006.c:968) / **`is_spike_harmful`** (seg007.c:1178) —
  running/jumping onto extended spikes → `spiked()`; reads the tile map.
- **`check_chomped_kid`** (seg004.c:439) — **reads the collision buffer**
  (`curr_row_coll_flags`/`curr_row_coll_room`): a column fully walled (`0xFF`) whose
  tile is a *closed* chomper → `chomped()`. The other buffer reader besides the
  bump path.

Both out of scope for the traversal substrate but noted so the buffer's second
consumer (chomper) isn't a surprise later.

---

## 9. What this means for the rework (pointer to the ledger)

- The **fall/floor/grab path already works** in the clone *except* for the
  `curr_col` clamp (a §6 concern, not a buffer concern). Faithful `determine_col`
  (unclamped) fixes cross-room climb here.
- The **wall-bump buffers** (§3–4) are the legitimate defer: the clone's `Char.x`
  stand-in covers shipped cases; port the buffers when guards/chompers/multi-row
  bumps force it.
- **`check_gate_push`** (§5) and the **fall-grab `check_grab`** (§7) are small
  bounded additions, each tied to a specific feature (closing gates, Shift-grab).

Classification lives in `research_deviation_ledger.md`.
