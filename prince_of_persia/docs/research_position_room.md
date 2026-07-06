# Research — the position & room model (SDLPoP)

**Purpose.** The coordinate substrate every collision query reads: where the
prince *is* (internal x/y, room, derived column/row), how `get_tile` crosses room
boundaries, and how the room actually swaps. This is the layer the clone
simplified into patches (the `curr_col` clamp, the `Char.x`-threshold room
cross), and it's where cross-room climbing breaks. Getting this faithful is the
substrate rework.

**Source.** `seg006.c` (coords, `get_tile`, `determine_col`, `set_char_collision`),
`seg002.c` (`exit_room`/`leave_room`/`goto_other_room`), `seg004.c`
(`xpos_in_drawn_room`), `types.h` (`char_type`). Citations `segNNN.c:line`.

**Scope.** Traversal. The internal-unit constants (TILE_SIZEX=14, room=140,
`y_land[]`, `x_bump[]`) are already documented in `research_collision.md §1–2`
and are not repeated here; this doc is about *the model*, not the numbers.

---

## 1. What a character's position is (`char_type`, types.h:302)

- **`Char.x`** — internal-x, **room-relative** and *bounded to a byte-ish range*.
  It is the character's leading/registration edge, not a screen pixel.
- **`Char.y`** — internal-y, room-relative (the feet baseline via `y_land`).
- **`Char.room`** — which room the character is *in*.
- **`Char.curr_col` / `Char.curr_row`** — the character's own tile, **derived**
  each frame from `Char.x`/`Char.y` (not stored authoritatively).
- **`Char.direction`** — `dir_0_right` (0) / `dir_FF_left` (−1).

The important consequence: `Char.x` is small (≈ 0–200) and *repeats* per room;
which room you're in is `Char.room`, and the on-screen room is `drawn_room`. A
character can briefly have `Char.room ≠ drawn_room` (mid-cross) — see §6.

---

## 2. `get_tile` — the universal accessor with auto room-crossing

`get_tile(room, col, row)` (seg006.c:28) is *the* tile read. It calls
`find_room_of_tile()` (seg006.c:46) to normalize an out-of-range `col`/`row` by
hopping the matching room link, then returns the tile type (`& 0x1F`).

`find_room_of_tile` loops (seg006.c:46): `col<0 → col+=10, room=left`;
`col≥10 → col-=10, room=right`; `row<0 → row+=3, room=up`; `row≥3 → row-=3,
room=down`; repeat until in range. A missing neighbour is room 0 = the void,
which reads as `tiles_20_wall`.

Side effects (globals the callers rely on): `get_tile` sets `curr_room`,
`tile_col`, `tile_row`, `curr_tilepos`, `curr_tile2` (the tile value). So *"the
room of the last tile I looked up"* is `curr_room`, which can differ from
`Char.room` when the lookup crossed a boundary. Several routines (grab,
`check_gate_push`) reconcile `curr_room` vs `Char.room` explicitly.

**This link-hop is the whole reason out-of-range columns are safe** — and the
reason clamping `curr_col` is wrong (§3).

The clone's `collision.js getTile` already ports this faithfully.

---

## 3. `determine_col` — the derived column is UNCLAMPED (the crux)

```c
// seg006.c:122
void determine_col() {
    Char.curr_col = get_tile_div_mod_m7(dx_weight());
}
```

That's the entire function. `Char.curr_col` is the tile column at the frame's
**weight point** (`dx_weight()`, seg006.c:547 = `char_dx_forward(cur_frame.dx −
(flags & FRAME_WEIGHT_X))`), and it is **not clamped**. At or across a room
boundary it is legitimately `−1` or `10`, and every downstream `get_tile_at_char`
etc. link-hops to read the correct neighbour tile.

There are therefore **two distinct column concepts**, and conflating them is a
bug:

| variable | set by | range | used for |
|---|---|---|---|
| `Char.curr_col` | `determine_col` | **unclamped** (can be −1/10) | `get_tile_at_char`, fall/floor, grab, press |
| `char_col_left` / `char_col_right` | `set_char_collision` | **clamped** `[0,9]` | the per-column collision-buffer *scan bounds* |

`set_char_collision` (seg006.c:1012) computes `char_x_left/right` from `obj_x`
and the sprite half-width, then `char_col_left = MAX(get_tile_div_mod(char_x_left),
0)` and `char_col_right = MIN(get_tile_div_mod(char_x_right), 9)` — the clamp
lives *here*, on the scan bounds, **never on `Char.curr_col`.** It also sets
`char_top_row`/`char_bottom_row` (via `y_to_row_mod4`) and, on `FRAME_THIN`
frames, insets `char_x_left/right` by 4.

**Clone deviation:** `player.js determineCol` clamps `Char.curr_col` to `[0,9]`
(added to stop a phantom-column wall-face miscompute). That clamp is on the
*wrong* variable — it defeats the link-hop, so `check_on_floor` at a boundary
reads the character's own (empty) room instead of the neighbour's ledge, and the
climb falls. The faithful fix is: leave `curr_col` unclamped; clamp only the
collision-scan bounds (as the source does), and make the *bump* path robust to an
out-of-range `curr_col` some other way. Logged in `research_deviation_ledger.md`.

---

## 4. The weight point (`dx_weight`) and why the column "lags"

`dx_weight()` (seg006.c:547) samples ~10 units *behind* `Char.x` (the frame's
`dx` minus the weight-flag bits). So `Char.curr_col` trails the leading edge:
this is deliberate — you're "standing on" the column under your weight, not under
your outstretched leading edge. Collision that must key off the *edge* (wall
stops, room crossing) uses `Char.x` / `char_x_left/right` directly, not
`curr_col`. Mixing the two is the root of several clone bugs (documented in
`research_collision.md §5b`).

---

## 5. Leaving a room — `exit_room` → `leave_room` → `goto_other_room`

Room crossing is a **post-frame** step (`play_frame` calls `exit_room` after
`play_kid_frame` — see `research_frame_loop.md §2.4`).

### `exit_room` (seg002.c:311)
Reloads the kid, `load_frame_to_obj`, `set_char_collision`, then
`roomleave_result = leave_room()`. If `< 0` (no leave) → return. Otherwise
`next_room = Char.room` (already updated inside `leave_room`), and the rest is
guard-follow logic (not traversal).

### `leave_room` (seg002.c:423) — the decision
Returns `−1` to stay, else `0/1/2/3` = left/right/up/down (and calls
`goto_other_room` before returning). The order of tests matters:

1. **UP** (seg002.c:428) — if `action ≠ bumped/freefall/midair` **and**
   `(sbyte)Char.y` is in `(−16, 10)` → leave up. **`Char.y`-based**, checked
   first. (So climbing *up* out of the top row crosses up.)
2. **DOWN** (seg002.c:434) — `Char.y ≥ 211` → leave down.
3. **BLOCKED FRAMES** (seg002.c:436–461) — `return −1` (no horizontal leave) when
   the frame is **climb 135–149**, **stand-up-from-crouch 110–119**, sword frames
   150–162 / 166–168, **or `action == 7_turn`.** i.e. you cannot leave left/right
   mid-climb, mid-stand-up, or mid-turn.
4. **HORIZONTAL** (seg002.c:462–483) — by facing, on the **leading edge**
   (`char_x_left` facing left, `char_x_right` facing right):
   - facing **left**: `char_x_left ≤ 54` → left; `char_x_left ≥ 198` → right; else −1.
   - facing **right**: (guarded so a doortop at col 9 doesn't count) `char_x_right
     ≥ 201` → right; `char_x_right ≤ 57` → left; else −1.

### `goto_other_room` (seg002.c:390) — the rebase
`Char.room = neighbour`, then:
- left: `Char.x += 140`.  right: `Char.x −= 140`.
- up: `Char.y += 189`, `Char.curr_row = y_to_row_mod4(Char.y)`.
- down: `Char.y −= 189`, `Char.curr_row = y_to_row_mod4(Char.y)`.

So a **horizontal** cross rebases `Char.x` by a room-width and leaves `curr_row`;
a **vertical** cross rebases `Char.y` by a room-height and recomputes `curr_row`.
The clone's `gotoRoom` matches these numbers.

**Clone deviations (both logged):** the clone runs its `crossRooms` *before*
`checkAction` (source: after, in `exit_room`); the clone's `leave_room` port
covers the frame-block guards for turn/stand-up but **not the climb-frame block
(135–149)** and **not the `Char.y`-based up/down leave** (it uses `curr_row<0`/`≥3`
instead) — which is exactly why a climb that lands in a neighbour room doesn't
cross.

---

## 6. The straddle — drawing a character in two rooms (`xpos_in_drawn_room`)

Because `Char.room` doesn't change until `exit_room`, a character whose
`Char.x`/`curr_col` has moved into a neighbour is drawn by offsetting its x by one
room-width:

```c
// seg004.c:254
int xpos_in_drawn_room(int xpos) {
    if (curr_room != drawn_room) {
        if (curr_room == room_L || curr_room == room_BL)  xpos -= 140;   // TILE_SIZEX*10
        else if (curr_room == room_R || curr_room == room_BR) xpos += 140;
    }
    return xpos;
}
```

So the model tolerates "I'm logically in room A, my weight column is −1, I'm
reading and being drawn one room-width to the left" — until `leave_room` finally
commits the swap. The clone has *no* straddle draw; it instead renders neighbour
slivers in the side margins (a cosmetic substitute) and snaps the character to one
room. For within-room play that's fine; for a character mid-cross (a climb across
a boundary, a run-jump that lands in the next room) the faithful straddle is what
keeps him consistent. Logged in the ledger as the render side of the substrate
rework.

---

## 7. Summary — what "faithful position/room" means for the rework

1. `determine_col` sets `Char.curr_col` **unclamped**; clamp only
   `char_col_left/right` (in `set_char_collision`).
2. All floor/fall/grab/press reads go through `get_tile_at_char` etc., which
   link-hop on the unclamped column — no special boundary cases needed.
3. Room crossing is a **post-frame** `exit_room` step (after `check_action`),
   using `leave_room`'s real conditions: `Char.y`-based up/down first, the frame
   blocks (climb 135–149 / stand-up 110–119 / turn), then the leading-edge
   `char_x` thresholds; `goto_other_room` rebases.
4. Drawing a mid-cross character uses `xpos_in_drawn_room` (offset by a
   room-width) rather than snapping to one room.

Wall-bump detection (the per-column buffers) is a separate concern —
`research_collision_detection.md` — and can stay on the clone's `Char.x` stand-in
until enemies force it (the legitimate defer).
