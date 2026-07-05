# research_collision.md — PoP tile collision

Research notes for the **actor-in-a-room** step: drop the actor onto the level-1
collision map and give it *real* tile collision — stand on the ledges, get
blocked by the walls, fall when unsupported — replacing the motion sandbox's
invented flat `[0,640]` strip with PoP's **room-relative bounded `Char.x`** model.

All citations are SDLPoP (`C:\Z_Temp\SDLPoP\src`), the address-citation
convention (`segNNN.c:line`). This doc is the *mechanism*; two pieces of it are
already ported (`wall_type` + `tile_is_floor` in `demos/blockmap.js`), and the
whole animation/gravity engine already exists (`playseq.js` / `seqtbl.js`).
Where a claim is synthesis rather than a single cited line, it says so.

---

## 0. Collision needs two answers

1. **WHERE am I** — the character's position → which tile it occupies.
2. **WHAT is there** — that tile's type → is it a floor (stand on) / a wall
   (blocked by)?

Everything below is those two, plus the room-relative position model that makes
"which tile" work across a 24-room level.

---

## 1. The character position model (`char_type`, `types.h:302`)

```c
typedef struct char_type {
  byte  frame;              // animation frame (indexes frame_table_kid)
  byte  x;                 // ROOM-RELATIVE internal-x (a byte; see §2)
  byte  y;                 // internal-y
  sbyte direction;         // dir_0_right = 0, dir_FF_left = -1
  sbyte curr_col, curr_row;// the tile the char occupies — DERIVED each frame
  byte  action;
  sbyte fall_x, fall_y;    // falling velocity (fall_y also = fall distance gauge)
  byte  room;              // which room the char is in
  ...
} char_type;
```

The load-bearing facts:
- **`Char.x` is a *room-relative* byte**, not an absolute world coordinate.
  A room is 140 internal-x units wide (§2); `Char.x` lives inside that.
- **`curr_col` / `curr_row` are derived from `Char.x` / `Char.y` every frame**
  (`determine_col`, §2) — they are *outputs*, not stored state you set.

> **Clone gap:** `demos/motion.js` uses an invented `actorX ∈ [0,640]` flat
> accumulator instead. The next step replaces that with `(Char.room, Char.x
> byte)` + derived `curr_col/curr_row`.

---

## 2. The coordinate system (internal-x, not screen pixels)

Constants (`types.h:1427-1434`):
- `SCREENSPACE_X = 58` — the room's left edge in internal-x.
- `TILE_SIZEX = 14` — tile width in internal-x (`TILE_MIDX = 7`, `TILE_RIGHTX = 13`).
- `SCREEN_TILECOUNTX = 10` → a room spans **`10 × 14 = 140`** internal-x units.

**x → column** (`get_tile_div_mod`, `seg006.c:750`):
```c
int x  = xpos - SCREENSPACE_X;   // 58
int xh = x / TILE_SIZEX;          // 14  -> tile COLUMN
int xl = x % TILE_SIZEX;          //     -> sub-tile offset 0..13 (pixel-precise)
```
`get_tile_div_mod_m7(xpos)` = the same on `xpos - 7` (`seg006.c:697`). In DOS PoP
these were two 256-byte LUTs (`tile_div_tbl` / `tile_mod_tbl`, `seg006.c:702/726`).

**Deriving the column** (`determine_col`, `seg006.c:122`):
```c
Char.curr_col = get_tile_div_mod_m7( dx_weight() );
```
where `dx_weight()` (`seg006.c:547`) = `char_dx_forward(cur_frame.dx -
(cur_frame.flags & FRAME_WEIGHT_X))` — i.e. the column is taken at the frame's
**weight point** (a per-frame forward-offset), not raw `Char.x`. For a first cut
you can approximate with `Char.x`; the weight offset only matters for exact
edge/tile registration.

**Vertical / rows:** rows are 63 units tall (`TILE_SIZEY = 63`, `types.h:1430`).
`y_land[] = {-8, 55, 118, 181, 244}` (`data.h:506`) are the feet-y values at the row
boundaries; a character standing in `curr_row` rests at **`Char.y = y_land[curr_row + 1]`**
(used at `set_start_pos` and after landing, e.g. `bumped_floor` sets
`Char.y = y_land[Char.curr_row + 1]`, `seg004.c:316`).

### 2.1 From internal units to the screen — the render pipeline

The point of "internal, not pixels" is that **the game logic is decoupled from the display
resolution.** There are three coordinate spaces, and the physics lives entirely in the first:

```
  internal units            obj_x / obj_y            the window
  (Char.x, tiles,     →     (screen pixels on   →    (any size; the whole
   collision, y_land)        a FIXED 320×200          fixed frame is scaled)
                             surface)
```

**1. Internal → screen pixels (`obj_x`/`obj_y`).** A fixed, *non-uniform* map
(from `set_char_collision`, `seg006.c:1021`: `char_x_left = obj_x/2 + 58`):
- **x:** `obj_x = 2 × (internal_x − 58)` → **2 px per internal-x unit** (the `<<1`). A tile is
  `14 × 2 = 28` px wide; a room is `140 × 2 = 280` px.
- **y:** `obj_y = internal_y` → **1 px per internal-y unit** (1:1). A tile is `63` px tall.

The 2:1 vs 1:1 asymmetry is because **DOS PoP's pixels were not square.** SDLPoP corrects for
it by scaling to 4:3 (`seg009.c:2485`: `SDL_RenderSetLogicalSize(320*5, 200*6)`), or leaves it
16:10 at `320×200` (`:2487`). (The tile *positioning* grid is 28 px/tile; the tile *art*
bitmaps are ~32 px and overlap slightly for seamless walls — irrelevant to a collision port.)

**2. The fixed frame → the window.** Everything is drawn into one **320×200 offscreen
surface** (`screen_rect = {0,0,200,320}`, `data.h:62`), uploaded to a texture, and blitted to
fill the whole window with `SDL_RenderCopy(renderer, texture, NULL, NULL)` (`seg009.c:2790`).
**This final scale is the *only* place window size enters** — the engine drawing `obj_x`/
`obj_y` at 320×200 has no idea how big the window is. So: **the source does adapt to different
rendering dimensions, but only by stretching the finished fixed-size frame; the game logic
never changes.** That separation is what keeps the physics deterministic across displays.

**3. How the clone player maps it** (`player.js`). Same structure, mirrored:
- Base frame = **320×200** (as DOS). `screenX(ix) = ROOM_X0 + (ix−58)·sx`,
  `screenY(iy) = ROOM_Y0 + (iy+8)·sy`, with **`sx = 2`** (the DOS `obj_x = 2·internal`, so a
  tile is 28 px) and `sy = 1` (the `obj_y` 1:1). A room = `140·2 = 280` px; `ROOM_X0 = 20`
  centres it, leaving a **20 px margin each side**.
- **The side margins show neighbour SLIVERS (the DOS layout).** `drawRoom` draws cols
  **−1..10**: `getTile(room, −1, row)` hops the left link to that room's col 9, `getTile(room,
  10, row)` hops right to col 0, and a `0`/void link reads as a wall = a solid cap. The
  slivers land in the 20 px margins and the canvas clips them — so the wall the char is blocked
  by across a room edge (e.g. room 5's col 9 at the level-1 start) is visible, not off-screen.
- The **`zoom` control is the equivalent of the final `RenderCopy` scale:** the canvas is
  `320·zoom × 200·zoom` and every coordinate is drawn `×zoom` (integer, `image-rendering:
  pixelated`). The collision/logic in `collision.js` is in internal units and is **untouched
  by zoom or `sx`** — only `draw()` multiplies. Same decoupling as the source. The clone also
  rasterizes the silhouette masks itself at `spriteScale = zoom`, so it isn't bound to DOS's
  tile-art pixel sizes.

---

## 3. `get_tile` — the universal accessor + auto room-crossing

`get_tile(room, col, row)` (`seg006.c:28`) is the heart of all collision:

```c
curr_room = find_room_of_tile();          // normalize out-of-range col/row
if (curr_room > 0) {
    curr_tile2 = curr_room_tiles[tbl_line[row] + col] & 0x1F;   // low 5 bits = type
} else {
    curr_tile2 = tiles_20_wall;           // room 0 = the void = solid wall
}
```

`find_room_of_tile` (`seg006.c:46`) walks room links when the query leaves the
`[0..9] × [0..2]` range:
- `col >= 10` → `col -= 10`, `room = roomlinks[room-1].right`
- `col <  0`  → `col += 10`, `room = roomlinks[room-1].left`
- `row >= 3`  → `row -= 3`,  `room = roomlinks[room-1].down`
- `row <  0`  → `row += 3`,  `room = roomlinks[room-1].up`
(`tbl_line = {0,10,20}` — a room is row-major, 3 rows of 10.)

**Consequences that matter for us:**
- "The tile in front of me" (`get_tile_infrontof_char`, `seg006.c:1305`) works
  *across a room boundary* with no special-casing — the accessor hops the link.
- A missing neighbor is **room 0**, which reads as `tiles_20_wall` — so the edge
  of the map is implicitly walled.

> **Clone plan:** `res/level1.js` already stores `fg` types per room +
> `roomlinks {left,right,up,down}`. A JS `getTile(room,col,row)` that mirrors
> `find_room_of_tile` (link-hop; `0 → wall`) reproduces this exactly and drives
> every query below. `blockmap.js` already walks the same link graph.

---

## 4. Floor support — stand vs. fall

**`tile_is_floor(type)`** (`seg006.c:951`) — has a surface to stand on. Floor for
everything **except** `{ 0 empty, 9 bigpillar_top, 12 doortop, 20 wall, 26/27/28/29
lattice }`. (This is one of the two predicates already ported in `blockmap.js`.)

- **Standing:** feet at `y_land[curr_row + 1]` (§2).
- **Unsupported → fall.** When no floor is under the character it starts a fall
  sequence. Representative check (ledge release, `seg005.c:853`):
  ```c
  if (!tile_is_floor(get_tile_behind_char()) && !tile_is_floor(get_tile_at_char()))
      seqtbl_offset_char(seq_23_release_ledge_and_fall);
  ```
  The general model (synthesis, confirmed by the many `tile_is_floor(get_tile_*_char())`
  checks in `seg005.c`): each frame the physics knows `curr_row/curr_col`; if the
  tile under the char isn't a floor, transition to `freefall`.
- **Falling** then runs gravity (`fallAccel`/`fallSpeed`, `seg006.c:0577/05AE`)
  until the feet reach the next floor's `y_land`, then a landing sequence keyed by
  impact speed — soft `fall_y<22` / medium `<33` / hard `>=33` (`seg005.c:174`).

> **Clone status:** the fall + soft/med/hard landing engine **already exists**
> (the motion-sandbox fall pick, `playseq.js` gravity + `seqtbl.js` land seqs).
> The new wiring is just: "is `getTile(room, curr_col, curr_row)` (or the tile
> under the feet) a floor? — if not, start `freefall`."

---

## 5. Wall blocking — two layers

### 5a. Coarse: whole-tile, by type (enough for a first cut)

**`wall_type(type)`** (`seg006.c:1626`) — vertical obstacle, and which side:
| type | wall_type | meaning |
|---|---|---|
| 4 gate, 7 doortop+floor, 12 doortop | 1 | wall at right |
| 13 mirror | 2 | wall at left |
| 18 chomper | 3 | obstacle at left |
| 20 wall | 4 | wall on both sides |
| else | 0 | not a wall |

(The other already-ported predicate in `blockmap.js`.) Movement checks the tile
ahead via `get_tile_infrontof_char`; a wall ahead makes the actor **stop / step
instead of run** — e.g. `forward_pressed` (`seg005.c:577`): *"If char is near a
wall, step instead of run."* For "get blocked by walls," this layer is enough.

### 5b. Fine: sub-tile x, the bump system (faithful polish, optional)

For pixel-precise "I hit the wall at exactly this x," PoP keeps per-column
collision buffers (`data.h:655-674`): `curr/above/below/prev _row_coll_room[10]`
+ `_flags[10]`. Each frame:

- `check_collisions` (`seg004.c:42`) → `get_row_collision_data` (`seg004.c:111`)
  computes each column's wall **left/right face x** (`get_left/right_wall_xpos`,
  `seg004.c:131/141`) using per-type offsets `wall_dist_from_left[] =
  {0,10,0,-1,0,0}` / `wall_dist_from_right[] = {0,0,10,13,0,0}` (`seg004.c:37-39`),
  and compares them to the char's collision box (`char_x_left/right_coll`).
- A column that flips clear→overlapping *this frame* becomes
  `bump_col_left/right_of_wall`.
- `check_bumped` (`seg004.c:151`) → `bumped` (`seg004.c:266`): push `Char.x` back
  by the overlap and play a bump sequence (`seq_47_bump` / `seq_46_hardbump` /
  `seq_45_bumpfall`).

> This buffer system is *also* character-vs-character (sword-fight) collision. For
> a single actor walking a room, **5a suffices**; 5b is the faithful upgrade
> (bump-back + bump animation) — defer unless we want it.

---

## 6. The room-relative bounded `obj_x` model (the deferred position piece)

PoP is **room-by-room with NO scroll**. The screen shows `drawn_room` plus thin
slivers of its neighbors (`room_L/R/A/BL/BR`).

- `Char.x` is a **bounded byte, room-relative** (`types.h:304`); a room = 140
  internal-x units (§2).
- **On crossing a room edge:** `drawn_room = next_room; redraw_screen(1)`
  (`draw_game_frame`, `seg000.c:918`), and the actor's `x` rebases into the new
  room (via `roomlinks`).
- **Drawing an actor that straddles the boundary:** offset its x by one
  room-width — `xpos_in_drawn_room` (`seg004.c:254`) does `xpos ∓= TILE_SIZEX *
  SCREEN_TILECOUNTX` (= 140) when `curr_room` is L/BL (−) or R/BR (+).

> **Clone plan:** replace the sandbox's `actorX ∈ [0,640]` accumulator with
> `(Char.room, Char.x byte)`. Screen-x = map `Char.x` into the drawn room's
> pixels; when `Char.x` crosses a room edge, swap `Char.room` via `roomlinks` and
> rebase `Char.x`. The block map already lays rooms out via `roomlinks`, so the
> same graph drives the room-swap.

---

## 7. What the clone already has vs. still needs

**Already ported / available:**
- Animation + gravity engine: `playSeq`, `fallAccel`/`fallSpeed`, fall + land
  sequences — `playseq.js` / `seqtbl.js`.
- `wall_type`, `tile_is_floor` (cited) — `demos/blockmap.js`.
- Level collision data: `fg` types + `bg` + `roomlinks` + `start` — `res/level1.js`.
- Room layout by `roomlinks` (flood-fill) — `demos/blockmap.js`.

**Built for the actor-in-a-room step** (all of the below — `index.html` / `player.js`,
`collision.js`, wired `control.js`, `runstop` added to `seqtbl.js`):
1. ✅ **Position as `(room, x-byte, curr_col/curr_row)`** with the full `determine_col`
   mapping (§2, `dxWeight` incl. the per-frame weight offset), replacing the flat `actorX`.
2. ✅ **`getTile(level,room,col,row)`** with `find_room_of_tile` link-crossing + `0 → wall`
   (§3) — `collision.js`, drives every query.
3. ✅ **Floor-support → fall** (§4): `check_on_floor` (see §8) + the existing gravity/land
   engine, keyed by tile state.
4. ✅ **Wall stop** — a sub-tile `Char.x`-clamp to the wall face (the §5b substitute; see §8).
5. ✅ **Room-swap at the boundary + `Char.x/y` rebase** (§6): `leave_room` trigger +
   `goto_other_room` (see §8).

Keyboard control (`control.js`, ported `control_kid`): run (`forward_pressed` → `start_run`,
blocked at a wall), `runstop` on release (frame-gated 7/11), `runturn` on reverse, standing
`turn`, `safe_step` (Shift) — all consuming the substrate above.

---

## 8. Traced during implementation (the §8 open items, resolved)

The three open items above were all traced end-to-end while building the player:

- **The walk-off-ledge trigger is `check_on_floor` (`seg006.c:1046`)**, dispatched from
  `check_action` (`seg006.c:909`) for a grounded actor. For a frame flagged
  `FRAME_NEEDS_FLOOR` (`0x40`, `types.h:381`), if `tile_is_floor(get_tile_at_char())` is
  false it calls `start_fall` (`seg006.c:1099`) → `inc_curr_row` + `seq_7_fall`. The freefall
  side is `do_fall` (`seg005.c:37`): when `Char.y` reaches `y_land[curr_row+1]`, `land()`
  (floor) or `inc_curr_row` (descend). Ported verbatim in `player.js`.
- **The per-tick order is `play_kid_frame` (`seg000.c:1192`):** `control` → `play_seq` →
  `fall_accel` → `fall_speed` → `determine_col` → (room cross) → `check_action`. The player
  follows it exactly; `check_action` is the collision hub.
- **Room crossing = `leave_room` (`seg002.c:423`) trigger + `goto_other_room`
  (`seg002.c:390`) rebase:** left `Char.x += 140` / right `-= 140` / up `Char.y += 189` /
  down `-= 189` (`+ curr_row = y_to_row_mod4`, `seg006.c:804`), then hop the roomlink and
  swap `drawn_room`. Horizontally the clone triggers on the leading edge `Char.x`, with the
  source's **direction-dependent thresholds** (`seg002.c:462-483`; the leading edge is
  `char_x_right` facing right / `char_x_left` facing left, both `== Char.x`): facing **right**
  → cross right at `Char.x >= 201`, left at `<= 57`; facing **left** → cross left at
  `Char.x <= 54`, right at `>= 198`. Vertically on `curr_row` leaving `[0,2]` (falls). A `0`
  link is the void (no cross). **Two guards, ported from `leave_room` (`seg002.c:440/459`):
  no cross during a TURN (`action 7`) or while STANDING UP from a crouch (frames 110-119).**
  These matter because both sequences shove `Char.x` around with their own `dx` while the
  character is stationary — and `clampToWall` *skips the turn* (`action 7`, §5b), so during a
  turn nothing pins `Char.x` at a wall face. Without the turn guard, turning at a room edge let
  the turn's `dx` push `Char.x` past the threshold and cross into the neighbour — *even a walled
  one* (observed: standing at room 2's left edge facing right, pressing back teleported the kid
  into room 6's col-9 wall). So the earlier "no wall-guard needed — `clampToWall` pins `Char.x`
  first" reasoning holds **only for non-turn motion**; the turn is exactly the case it doesn't
  cover, and the `action 7` guard is what closes it (matching the source, which returns −1 from
  `leave_room` for a turn).
- **`dx_weight`'s per-frame weight offset (§2) IS implemented** (`determineCol` uses
  `char_dx_forward(frame.dx - (flags & 0x1F))`), not the first-cut `Char.x` approximation. And
  **`curr_col` is clamped to `[0,9]` ALWAYS** — the weight point lags `Char.x` by ~10 units and
  reads a phantom neighbour column at a tile/room edge (or when a fast run frame overshoots the
  boundary), which would make `clampToWall` compute the wrong wall face and let the char slip
  into the next room. Clamping is the clone's stand-in for the bump system keeping the char
  valid; crossing is decided by `Char.x`, so it never blocks a legitimate cross.

### How the source blocks at a room-edge wall (cross-check)

When the char walks toward a room boundary whose neighbour has a wall (e.g. room 1 col 0 → room
5's col-9 wall), **the source does NOT cross into the walled room — it bumps him back at the
boundary first.** The design that makes this work, and which the clone mirrors:

- **Per-frame order** (`play_frame`, `seg000.c:863`): `play_kid_frame()` → … → `exit_room()` →
  `check_the_end()`. The wall bump (`check_collisions`/`check_bumped`) is *inside*
  `play_kid_frame`; the room change (`leave_room`/`goto_other_room`) is in `exit_room`; the
  `drawn_room` flip is in `check_the_end`. So **the wall bump runs before the room-leave check.**
- **The collision scan reaches across the boundary.** `check_collisions` (`seg004.c:42`) sets
  `left_checked_col = get_tile_div_mod_m7(char_x_left_coll) − 1` (can be **−1**), and
  `get_row_collision_data` (`seg004.c:118`) reads walls via `get_tile(room, column, row)`, which
  **hops the room link** for out-of-range columns. So the neighbour room's edge wall is detected
  while the char is still in the current room. The scan is keyed off the sprite collision box
  (`char_x_left/right`, a *position* from `Char.x`), not the lagging weight point. (`check_collisions`
  returns early during a turn, `action==7`.)
- **The bump pins the box to the wall face** (`check_bumped`→`bumped`, `seg004.c:194/266`):
  `Char.x += (wall_face − char_edge)`. Then `leave_room` reads the *pushed-back* position, its
  `char_x_left/right` threshold isn't met, it returns −1, and no room flip happens.

**The clone mirrors this** with `clampToWall` (position-based, boundary-aware via `getTile`'s
link-hop) running *before* `crossRooms` — pin `Char.x` at the face, then decide the cross. The
clone's *earlier* bug was the exact failure this ordering prevents: keying the wall check off the
lagging `curr_col` let it go phantom on a fast overshoot, so the "bump" missed and the "leave"
fired. Fixing it (Char.x-based clamp + unconditional `curr_col` clamp) made the clone
position-based and boundary-aware like `check_collisions`. Not modelled: the box *width*
(`char_width_half`) and the bump *animation* (`seq_45`/`bumped_floor`) — the clone contacts at the
reg point and settles to `stand`.

**Deviations (honest):**
- **Wall block is the §5b substitute, not the bump buffers — but it IS sub-tile.** We don't
  port `check_collisions`/`check_bumped` (the per-column `curr_row_coll_*` buffers, which also do
  sword-fight collision). Instead we work in **`Char.x`, the leading edge** (`set_char_collision`,
  `seg006.c:1021`: `char_x_right = Char.x` facing right, `char_x_left = Char.x` facing left):
  `wallAheadFace`/`clampToWall` find the blocking wall by the **leading edge's column**,
  `tileDivMod(Char.x)` — the edge's own column if a fast frame overshot it into the wall, else
  the next column ahead — and pin `Char.x` to that column's near face. The char walks *up to* a
  wall within a tile in either direction and stops flush (mid-row *or* across a room edge, e.g.
  left at the level-1 start up to room 5's col-9 wall), with **no penetration** (Char.x never
  exceeds the face → no bounce-back). Three subtleties, all learned from bugs:
  - **Key off the leading edge, never `curr_col`.** The weight point lags `Char.x` by ~10 units
    and can sit *in* a wall while the edge is safely past it (facing away) — a `curr_col`-based
    test then pushes the char the wrong way. `tileDivMod(Char.x)` is the actual edge.
  - **A wall isn't a hole.** `check_on_floor` must not fall when the tile under the char is a
    wall (a fast frame can leave the weight-point `curr_col` in a wall for a tick). The source
    ejects (`in_wall`) before its floor test; the clone just skips the fall (`wallType != 0`).
  - **Skip the clamp during a turn** (`action==7`), as `check_collisions` does (`seg004.c:44`) —
    the turn's own `dx` carries the char off the wall.
  What's *not* modelled: the char's collision **width** (`char_width_half`) — contact is to the
  reg point, not the sprite edge (imperceptible for one walking actor) — and the bump *animation*
  (`seq_47_bump`): a run into a wall settles straight to `stand` (a deferred follow-on).
- **`safe_step` (the step-to-edge sequences 29..42) isn't transcribed;** Shift-step uses the
  generic careful step (`step11`). Walking up to a wall is handled by the `Char.x`-clamp above,
  not by a dedicated step-to-edge sequence.
- **`start_fall`'s run-frame variants** (frame 9 → `seq_7`, frame 13 → `seq_19`) collapse to
  the general `seq_7_fall` (`freefall`); visually identical for a single actor.
- Gates/doors (drawn but static), spikes, and the sub-tile bump animation are out of scope
  for the collision substrate. **Loose-floor collapse IS now implemented** — see §9.

---

## 9. Loose floors — the first *trob* (transient object)

A loose floor (tile type 11) is a floor you can stand on that **collapses a moment after
weight lands on it**, dropping you through. It's the first *trob* (transient object — a tile
that animates over several frames) the toy ports. Source is `seg007.c` (the whole trob
system); this is a **minimal, loose-only** slice of it — faithful to the mechanism, with the
falling-debris chunk and the shake visual deferred by agreement.

### The mechanism (three source touch-points)

1. **Trigger — `check_press` (`seg006.c:1683`).** Each frame, for a grounded / turning /
   bumped actor (`action==turn || action==bumped || action < actions_2_hang_climb`) on a
   `FRAME_NEEDS_FLOOR` frame, it reads the tile underfoot (`get_tile_at_char`); if that tile is
   `tiles_11_loose` it calls `make_loose_fall(1)`. (The full routine also handles hanging/
   climbing frames, a jump-hang break-from-above, and buttons — none in the toy's move set yet.)
2. **Arm — `make_loose_fall` (`seg007.c:904`).** Guards twice: the tile must be a still-solid
   loose floor, and its **modifier must be `<= 0`** (a fresh loose tile is 0) so re-stepping a
   tile that's already counting down never restarts it. It sets the modifier to 1 and
   `add_trob(room, tilepos, 0)`.
3. **Tick — `process_trobs` → `animate_loose` (`seg007.c:24` / `:816`).** `process_trobs` runs
   at the **top of `play_frame` (`seg000.c:869`)**, before `play_kid_frame`. For each active
   loose tile it `++`s the modifier; once it reaches **`loose_floor_delay = 11` (`seg007.c:832`)**
   it calls `remove_loose` (`seg007.c:897`: `curr_room_tiles[tilepos] = tiles_0_empty`) and drops
   the trob (plus `add_mob` for the falling debris chunk — **deferred**). Otherwise it keeps
   shaking (`loose_shake` — the visual, **deferred**) and stores the bumped modifier back.

The **modifier is the tile's own `bg` byte** (`curr_room_modif[tilepos]`): `get_curr_tile`
loads it (`seg007.c:974`), `animate_tile` stores it back (`seg007.c:87`). So a loose tile's
collapse countdown lives *in the level data*, not in a side table.

Because `process_trobs` removes the tile at the top of the frame and `check_action` /
`check_on_floor` (§8) run later the same frame, the tile is already empty when the floor test
sees it — so the actor **falls the very frame the tile ripens**, via the existing fall engine
(§4). No new fall code; the loose floor just deletes the floor under him.

### The clone port (`trob.js` + `player.js`)

- **`trob.js`** (new) — the minimal trob module: `makeTrobs` / `makeLooseFall` (arm) /
  `processTrobs` (tick + collapse). Loose-only; pure over `(trobs, level)`, no rendering. Ports
  points 2–3 above verbatim, including the `(sbyte)modifier <= 0` guard and `loose_floor_delay`.
- **`player.js`** — three wirings:
  - The player now holds a **mutable `structuredClone` of the level** (loose floors collapse
    into its `fg`/`bg`; the shared `LEVEL1` const — also read by the block-map demo — is never
    touched). **Restart re-clones**, restoring every loose tile.
  - `processTrobs(trobs, level)` runs at the **top of `tick()`** (mirroring `process_trobs` at
    the top of `play_frame`); `checkPress(ch)` runs **after `checkAction`** (mirroring
    `check_press` after `check_action` in `play_kid_frame`, `seg000.c:1215-1216`). `checkPress`
    is point 1 above, reduced to the loose-floor branch.
- **Level-1 loose tile: room 1, col 6, row 2** — its room's `down` link is room 2, so the
  collapse drops the prince **through a room boundary** into room 2, where he lands on the
  floor at row 1 (a ~2-row multi-room fall, medium landing).

### Verified (deterministic single-stepping, `index.html#debug`)

Standing him on the loose tile (`POP.place(1,6,2,0)`) and stepping: the modifier counts
`1 → 10` over ten frames (tile stays 11, one trob), then at frame 11 the tile flips to `0`
(empty), the trob drops, and he enters `freefall` (`action 4`, `curr_row 2→3`) — falling into
room 2 the next frame and landing on its row-1 floor (`fall_y 24` → medium land → recover).
Re-stepping a shaking tile does **not** reset the timer (modifier stays monotone); `restart`
restores the tile to 11; the shared `LEVEL1` module const is never mutated (still reads 11).

### A latent control bug the medium landing exposed (fixed)

The loose-floor fall is the first thing in the *player* (as opposed to the motion sandbox) that
produces a **medium landing**, and it immediately surfaced a bug: the prince ended up standing
~2 internal-y units **above** the floor (a visible gap between his feet and the ledge).

Cause: `medland` (`seqtbl.c:935`) opens with `dy(-2)` (drop into a crouch) and compensates with
`dy(1)+dy(1)` in its **own** stand-up tail. But the clone's `controlKid` dispatched purely by
frame, and medland's long crouch is `frame_109_crouch` — the same frame the *soft*-land crouch
holds. So `controlCrouched` fired and redirected him into the separate `standup` sequence, which
has **no `dy`** — the `dy(-2)` was never repaid, leaving `Char.y` two units high.

The source doesn't hit this because **`control()` (`seg005.c:264`) suppresses all control while
`action == bumped` or `in_freefall`** (it just `release_arrows()`). The medium/hard-land crouch
runs at `actions_5_bumped`, so it's *not* controllable and plays its own dy-balanced recovery;
only the **soft**-land crouch is controllable, because `softland` deliberately switches to
`actions_1_run_jump` at its crouch (`seqtbl.c:919`) so the player can stand up on input. The
clone was missing exactly this gate. Adding `if (action==bumped || action==in_freefall) return;`
at the top of `controlKid` fixes it: the medium land now plays its full faithful 29-frame crouch
and lands flush on the floor line (`Char.y = y_land[row+1]`, gap 0, pixel-confirmed), while the
soft-land falling entry still stands up as before.

### Deferred (agreed, same bucket)

- **The falling-debris chunk** (`add_mob` / `curmob`, `seg007.c:848-855`) — a separate mobile
  object that tumbles down and can hurt whoever's below. Its own subsystem (`do_mobs`).
- **The shake visual** (`loose_shake`, `seg007.c:870`) — the tile just renders as its normal
  (brown) floor ledge until it vanishes. The collapse is still legible (floor disappears → fall).
