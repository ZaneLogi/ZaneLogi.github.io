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

### 5b. Fine: sub-tile x, the bump system — IMPLEMENTED (box + animation on a substitute)

**Status (2026-07-05):** the bump is in the player — a wall hit plays the faithful **recoil
animation** (`seq_47_bump`) instead of a dead stop, on top of a **collision box**
(`setCharCollision`). But the *detection* is the clone's `Char.x`-clamp substitute, **not** the
source's per-column collision-buffer scan. This section is the durable record of exactly what was
substituted, why, and where a bug would surface if the substitute is ever the cause.

**What the source does (the mechanism we did NOT port).** For pixel-precise "I hit the wall at
exactly this x, on this side," PoP keeps per-column collision buffers (`data.h:655-674`:
`curr/above/below/prev _row_coll_room[10]` + `_flags[10]`). Each frame:
- `check_collisions` (`seg004.c:42`) → `get_row_collision_data` (`seg004.c:111`) scans the columns
  `left_checked_col-1 .. right_checked_col+2` across **three rows** (curr/above/below), computing
  each column's wall **left/right face x** (`get_left/right_wall_xpos`, `seg004.c:131/141`) from the
  per-type offsets `wall_dist_from_left[] = {0,10,0,-1,0,0}` / `wall_dist_from_right[] =
  {0,0,10,13,0,0}` (`seg004.c:37-39`), and compares them to the char's collision box
  (`char_x_left/right_coll`).
- A column that flips clear→overlapping **this frame** (prev vs curr `_flags`) becomes
  `bump_col_left/right_of_wall` — detection on **both** sides (forward *and* the trailing edge).
- `check_bumped` (`seg004.c:151`) → `bumped` (`seg004.c:266`): step `tile_col` off the wall to the
  char's side, push `Char.x` back by the overlap, and play `seq_47_bump` / `seq_46_hardbump` /
  `seq_45_bumpfall` (chosen by `bumped_floor`/`bumped_fall`, seg004.c:311/298).

**What the clone does instead (`player.js`).** `setCharCollision` (port of `seg006.c:1012`) builds
the box `char_x_left/right_coll` (width `char_width_half = (sprite.w+1)/2`). `checkBumped` reuses the
existing `wallAheadFace` **`Char.x`-clamp** to detect the forward edge passing the wall face, pins
`Char.x` there (= `bumped()`'s push-back), steps off the wall to the char's standing column exactly
as `bumped()` does (seg004.c:270-288 — needed, or a bump where `curr_col` lands on the wall wrongly
reads `tile_is_floor(wall)=false` and plays bumpfall), then runs the faithful
`bumpedFloor`/`bumpedFall` dispatch to pick the sequence. `blockedForward` widened to the source's
`distance < 8` run-gate (seg005.c:577) so the `dx(-4)` recoil doesn't trigger a re-run (no bump
oscillation).

**Correction to an earlier claim.** A prior note here said "this buffer system is *also*
character-vs-character collision." **That is wrong** — verified: the buffers are read only by
`check_collisions`/`check_bumped` (wall collision) and the per-char save/restore (`seg000.c:313`).
Kid-vs-guard collision is a **separate** mechanism: `bump_into_opponent` (`seg003.c:622`) uses
`char_opp_dist()` (distance ≤ 15) and plays `seq_47_bump`; it never touches these buffers. So the
buffers are **wall-collision only**, and deferring them does *not* affect future char-vs-char work.

**What the substitute loses, and where a bug would surface (the "where the bodies are buried" map).**
For the current single-actor walk/run/turn/fall scope this loses **nothing visible**. Deferred:
1. **Multi-row wall bumps.** The buffers scan curr/above/below rows; the clamp checks only the char's
   **current row** (`wallAheadFace` reads `getTile(room, col, Char.curr_row)`). *If you ever see the
   char clip a wall segment that is above/below his standing row* (e.g. a head-height wall while his
   feet are at a floor edge), the cause is the missing above/below scan — port
   `get_row_collision_data`'s 3-row loop (`seg004.c:50-52`).
2. **Trailing-edge / knockback-into-a-wall.** The clamp only stops **forward** motion
   (`bump_col_left_of_wall` equivalent). The source also fires `bump_col_right_of_wall` — a wall
   hitting the char's **back** edge. *If a future knockback/explosion push drives the char backward
   through a wall*, the cause is the missing trailing-edge test (`get_row_collision_data`'s
   `right_wall_xpos > char_x_left_coll`, `seg004.c:123`); the box (`char_x_left_coll`) is already
   computed, so this is the natural next step.
3. **Exact multi-column bump-column selection** — invisible for a single-column contact; matters only
   with wide/compound obstacles.

**Bump-sequence verify status.**
- `seq_47_bump` — **VERIFIED** (run into a wall both facings: recoil `dx(-4)`, frames 50-52, no
  penetration/oscillation/fall, stays in room; then `safe_step` walks him flush — see below).
- `seq_45_bumpfall` — **bytes verified** (frames 102-105 render with the falling `dy`), but the
  natural trigger + freefall handoff needs airborne geometry (bumping a wall over a gap / while
  falling); not reachable in the current move set (jumps not wired). Re-verify end-to-end with jumps.
- `seq_46_hardbump` — **ported, unverified**: only reached from jump/fall-onset frames
  `{24,25,40-42,102-106}` the current player can't produce. Verify when jumps land.

**`safe_step`-to-edge — IMPLEMENTED (the recoil no longer leaves him parked back).** `get_edge_distance`
(seg004.c:378, `player.js` — walls / floor edges / ledges only) + the 14 `step1..step14` sequences
(seqtbl.c:737-863) + `safe_step` (seg005.c:604) wired into `control.js`. `forward_pressed`'s
`distance < 8` rule now **steps flush** to a wall (the recoil's ~4-unit gap → `step4` → flush) instead
of parking back, **Shift+forward** lands the careful step exactly at the wall face or the ledge's
drop. **`getEdgeDistance` must decide on the tile *directly in front* (`curr_col + facing`), NOT the
leading edge** — the leading-edge approach (`wallAheadFace`) has two failure modes, both fixed by
computing the front column's near face directly: (1) it finds a wall *across* an empty tile and steps
the char off a **ledge** toward it; (2) it only scans the leading-edge column ±1, so it **misses** a
wall a full tile away or **across a room boundary** — which falsely *blocked* a left-facing char at a
room edge (he had ~14 units of floor to step but `distance` defaulted to 0). VERIFIED: Shift-step→wall
flush (both facings, incl. a left-facing char stepping to a room-edge wall); run→bump→step flush;
forward (no Shift)→ledge still runs off.

**At a ledge brink, Shift+forward plays `testfoot` (the "peer over the edge + bounce back").** This
is `seq_44_step_on_edge` (`seqtbl.c:720`, frame `86_test_foot`), fired by `safe_step`'s distance-0 /
`edge != WALL` / `Char.repeat` branch (seg005.c:611): so a careful step at a drop is step-to-brink →
lean out + retreat (net dx 0) → stand, gated by `Char.repeat` so it happens once. `testfoot` leans
+10 **past** the edge, which — unlike the plain steps that stop *at* the edge — reaches into whatever
is beyond (a hole, or at a 1-tile pit a wall on the far side), and would otherwise `check_on_floor`-
fall or `check_bumped`-bump mid-lean (observed cascade at room 1 col 3: lean → col-5 wall bump →
recoil into the col-4 pit → fall). Fix: a clone-only `ch.testing` flag (set when `testfoot` starts,
cleared at the next stand) makes `checkBumped` and `checkOnFloor` **skip** during the lean — correct
because `testfoot` is self-contained (always returns to the floor). Deferred: `safe_step`'s
distance-0 / `repeat==0` `unsafe-step`-off-ledge branch (persisting walks you off) → the clone stands.

Other deferred: sword bump sequences (`seq_64/65`), `is_obstacle` gate/chomper/mirror cases
(`seg004.c:231` — gates static, chompers/mirrors not modelled), feather-fall (`bumpfloat`).

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

> **Superseded in part (2026-07-07): the position/room/edge substrate is now FAITHFUL.**
> The `curr_col` clamp, the front-only `getEdgeDistance`, the room-cross-before-`check_action`
> order, and the `curr_row`-based vertical cross described in §7/§8 were all **removed** in the
> substrate rework (W1+W1b+W2+W3). Stale claims below are corrected inline. The authoritative,
> fully-mapped source model now lives in the dedicated research set —
> `research_frame_loop.md`, `research_position_room.md`, `research_collision_detection.md`,
> and the clone-vs-source classification in `research_deviation_ledger.md`.

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
   `curr_col` is **unclamped** (faithful, seg006.c:122) — at a room edge it is legitimately
   −1/10 and `getTile` link-hops (research_position_room.md §3).
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
  `fall_accel` → `fall_speed` → `determine_col` → `set_char_collision` → `check_bumped` →
  `check_action` → `check_press` → **(then, after the whole kid frame, `exit_room`)**. The player
  now follows this exactly — the room cross runs **after** `check_action`, matching `exit_room`'s
  place in `play_frame` (`seg000.c:881`). *(Corrected: the earlier draft ran the room cross before
  `check_action`; that was the W2 deviation — see `research_frame_loop.md §2.4` and
  `research_deviation_ledger.md`.)*
- **Room crossing = `leave_room` (`seg002.c:423`) trigger + `goto_other_room`
  (`seg002.c:390`) rebase:** left `Char.x += 140` / right `-= 140` / up `Char.y += 189` /
  down `-= 189` (`+ curr_row = y_to_row_mod4`, `seg006.c:804`), then hop the roomlink and
  swap `drawn_room`. The clone's `leaveRoom` is now the **faithful `leave_room` order**
  (research_position_room.md §5): **(1) UP** and **(2) DOWN** are **`Char.y`-based** (up when
  `Char.y ∈ (−16,10)` and the action is grounded/climbing — this is what crosses a two-floor
  climb into the room above; down when `Char.y ≥ 211`); **(3)** a **climb frame (135–149)**,
  **stand-up-from-crouch (110–119)**, or **turn (`action 7`)** blocks *horizontal* leave only;
  **(4)** horizontal on the leading edge `Char.x` with the direction-dependent thresholds
  (`seg002.c:462-483`; facing **right** → right at `>=201`, left at `<=57`; facing **left** →
  left at `<=54`, right at `>=198`). A `0` link is the void. *(Corrected: the earlier draft used
  `curr_row` leaving `[0,2]` for the vertical cross and lacked the climb-frame block — the W3
  deviation; the turn/stand-up guards were already present. The turn-teleport bug they fixed is
  still real: turning at a room edge, the turn's own `dx` would push `Char.x` past the threshold
  and cross into a walled neighbour, so the `action 7` guard on horizontal leave stays.)*
- **`dx_weight`'s per-frame weight offset (§2) IS implemented** (`determineCol` uses
  `char_dx_forward(frame.dx - (flags & 0x1F))`), not the first-cut `Char.x` approximation. And
  **`curr_col` is UNCLAMPED** (faithful, `determine_col` seg006.c:122), so at a room edge it is
  legitimately −1/10 and every `getTileAtChar` link-hops to read the neighbour tile. *(Corrected:
  the earlier draft clamped `curr_col` to `[0,9]` — the W1 deviation. It only "worked" because the
  front-only `getEdgeDistance` was co-designed with it; both were removed together, and
  `getEdgeDistance` is now the source's own-tile-first `get_edge_distance`, seg004.c:383. Full
  account: `research_deviation_ledger.md §1`.)*

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

**The clone mirrors this faithfully.** The wall bump (`checkBumped`, position-based on `Char.x`
and boundary-aware via `getTile`'s link-hop) runs *inside* the tick and pins `Char.x` at the wall
face; the room cross (`leaveRoom`) runs *after* `checkAction` (matching `exit_room`'s place after
the kid frame). So the bump pushes `Char.x` back before `leaveRoom` reads it, its `Char.x`
threshold isn't met, and no flip happens — exactly as the source's `check_bumped`-then-`exit_room`
order does. *(This ordering is the W2 fix; the earlier draft ran the cross before `check_action`
and relied on the now-removed `curr_col` clamp — see the §7 banner + `research_deviation_ledger.md`.)*
The bump *animation* + collision *box* are modelled (§5b); the one remaining substitute is the
per-column buffer *scan*.

**Deviations (honest):**
- **Wall block — the box + recoil animation ARE modelled (§5b); the per-column buffer *scan* is
  the substitute.** Detection works in **`Char.x`, the leading edge** (`set_char_collision`,
  `seg006.c:1021`: `char_x_right = Char.x` facing right, `char_x_left = Char.x` facing left):
  `wallAheadFace` finds the blocking wall by the **leading edge's column** `tileDivMod(Char.x)` —
  the edge's own column if a fast frame overshot it into the wall, else the next column ahead — and
  `checkBumped` pins `Char.x` to that column's near face (no penetration), then runs the faithful
  `bumped`/`bumped_floor`/`bumped_fall` dispatch (recoil `seq_47` / bumpfall `seq_45` / hardbump
  `seq_46`). Three subtleties, all learned from bugs:
  - **Key off the leading edge, never `curr_col`.** The weight point lags `Char.x` by ~10 units
    and can sit *in* a wall while the edge is safely past it (facing away) — a `curr_col`-based
    test then pushes the char the wrong way. `tileDivMod(Char.x)` is the actual edge.
  - **A wall isn't a hole.** `check_on_floor` must not fall when the tile under the char is a
    wall (a fast frame can leave the weight-point `curr_col` in a wall for a tick). The source
    ejects (`in_wall`) before its floor test; the clone just skips the fall (`wallType != 0`).
  - **Skip the bump during a turn** (`action==7`), as `check_collisions` does (`seg004.c:44`) —
    the turn's own `dx` carries the char off the wall.
  The remaining substitute is the per-column buffer **scan** (`check_collisions`/
  `get_row_collision_data`) — see **§5b** for exactly what that defers (multi-row + trailing-edge
  bumps) and where a bug would surface.
- **`safe_step`-to-edge IS implemented** (§5b): `step1..step14` + `get_edge_distance` wired through
  `control.js`, so Shift-step and the post-bump forward both land the char *exactly* at the wall face
  (flush) or a ledge's brink. Only `safe_step`'s distance-0 climb branches are deferred.
- **`start_fall`'s run-frame variants** (frame 9 → `seq_7`, frame 13 → `seq_19`) collapse to
  the general `seq_7_fall` (`freefall`); visually identical for a single actor.
- Gates/doors (drawn but static) and spikes are out of scope for the collision substrate.
  **Loose-floor collapse IS implemented** (§9); **the sub-tile bump system IS implemented** (§5b).

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

## 10. Vertical jump-up + climb (Up → jump / grab a ledge / climb up)

The first move that carries the prince *between* rows under player control. Pressing **Up** while
standing jumps straight up; if a ledge is within reach above, he **grabs it and hangs**; pressing
**Up** again **climbs him onto** it. The striking thing about the port: it needed **no new engine
mechanism** — the row change, the hang render, and "don't fall while hanging" all fall out of
machinery that was already there (`§2.1`, `§4`, the `play_seq` opcodes). It is transcription +
control/collision wiring.

### The control paths (ported `seg005.c`)

`control_standing` (`seg005.c:393`) routes a standing **Up** to `up_pressed` → `check_jump_up`
(`seg005.c:693`), which tries three things in order:

1. **Grab a ledge in front & above** — `can_grab(through = tile directly above, target = tile
   front-above)`. Success → `grab_up_with_floor_behind` (`seg005.c:871`): close to the edge and not
   against a wall → `jumphangMed` (seq_8, dx 0), else `jumphangLong` (seq_24, reach forward dx +4).
2. **Grab a ledge straight above** — `can_grab(through = behind-above, target = above)`. Success →
   `jump_up_or_grab` (`seg005.c:711`): too close (<6) just jumps; no floor behind → `jumpbackhang`
   (seq_16); else step back a tile and `grab_up_with_floor_behind`.
3. **Neither** → `jump_up` (`seg005.c:734`): read the tile one row above at the weight column —
   neither wall nor floor → open air → `highjump` (seq_28); a wall/floor above → `jumpup` (seq_14,
   touch the ceiling with `SEQ_KNOCK_UP`). Both self-contained arcs ending in `hangdrop` → stand.

`can_grab` (`seg006.c:1606`, ported to `collision.js canGrab(through, target, mod, facingRight)`):
grab is allowed only when the *through* tile is passable (not wall / not a floor / not a
right-facing doortop) and the *target* is a floor (with the doortop-with-floor and shaking-loose
exclusions). Our `loose_floor_delay == 11`, so a shaking loose target (modifier ≠ 0) is not
grabbable — matching source.

Once hanging (frames 87–99, action `2_hang_climb`), `control_hanging` (`seg005.c:791`, our
`controlHanging`) decides each frame: **Up** (once `grab_timer` has counted down) → `can_climb_up`
→ `climbup` (seq_10); **Shift** against a wall/doortop → `hangstraight` (seq_25, action
`6_hang_straight`); **anything else** → `hang_fall` (`seg005.c:846`) → `hangdrop` (seq_11, land on
the floor below) or `hangfall` (seq_23, release over a pit → `freefall`). Because control interrupts
on the *first* hang frame, the long `hang` swing loop (`seqtbl.c:554`, 42 frames) rarely plays under
player control — you climb or drop almost immediately.

### Why the row change / render / no-fall are free

- **Row change:** `climbup` is `… dx(5) dy(-63) SEQ_UP frame_141 …`. `SEQ_UP` decrements `curr_row`
  and `dy(-63)` lifts the feet exactly one tile (`y_land`: 118→55, `§2`), so he ends standing on the
  ledge one row up. `play_seq` already executes `SEQ_UP/DOWN/KNOCK_UP` (`playseq.js`) — the only new
  builder work was the `up()`/`down()`/`knockUp()` helpers in `seqbuilder.js`.
- **Hang render:** the rise-and-hang is entirely the per-frame `frame_table_kid` **draw-offset dy**
  (already applied in `player.js draw()`, `§2.1`). `Char.y` barely moves while hanging (the feet of
  a char hanging from the row-above ledge sit ≈ where they'd stand in the current row), so hanging
  keeps `curr_row` unchanged and the sprite is drawn up by the frame dy.
- **No spurious fall:** `check_action` (`seg006.c:909`) does nothing for actions `2_hang_climb` /
  `6_hang_straight`, so a hanging char never falls via the floor check. During the jump-up *rise*
  `curr_row` is unchanged, so `check_on_floor` keeps finding the take-off floor.

### `grab_timer`

Set to 12 only when grabbing a ledge **mid-fall** (`check_grab`, `seg006.c:1217`) — that path is
deferred (below) — and counted down each tick (`process(grab_timer)`, `seg006.c:1405`; our tick
top). So in this step it is always 0 and the climb starts immediately; the field + countdown are in
place so the deferred mid-fall grab works when added.

### Sequences transcribed (`seqtbl.js`, from `seqtbl.c`)

`jumpup` (629), `highjump` (637), `hangdrop` (602), `jumphangMed` (526), `jumphangLong` (534),
`jumpbackhang` (544), `hang`+`hang1` (554), `hangstraight`+loop (569), `climbup` (590), `hangfall`
(609). `climbfail` (575) is **not** transcribed — it is reached only from `seq_9_grab_while_jumping`
(the deferred `USE_JUMP_GRAB` path), so it would be dead code here.

### Verified (deterministic single-stepping, `index.html#debug`)

- **Jump up in place:** `POP.place(2,6,1,0)` + Up → `highjump` (open air above; apex-hold), ends
  standing at the **same** row. `POP.place(2,3,1,0)` + Up → `jumpup` (wall above; single apex +
  `KNOCK_UP`). Both drop via `hangdrop` and never fall.
- **Grab front-above + climb:** `POP.place(7,5,2,-1)` (facing left; above = empty, front-above col 4
  = floor) + Up held → `67…80,91,135…149,118,119,15`: rise → grab → one hang frame → `climbup` →
  ends standing **row 2→1** on the col-4 floor, `Char.y` 181→118. Screenshot confirms the hang pose.
- **Grab straight-above + climb:** `POP.place(5,6,2,-1)` + Up → `jump_up_or_grab` path → climb
  (row 2→1, uses `climbup` frame 141).
- **Release while hanging:** grab then release → `…,91,81,82,83,84,85,15` (`hangdrop`) back to row 2.
- **Regressions:** run/stop/turn/careful-step, wall-bump, loose-floor fall, room crossings, the
  falling entry — all still pass; no console errors.

### Deferred (each a clean follow-on that reuses this hang machinery)

- **Grab a ledge while falling** — Shift held during a fall → `check_grab` (`seg006.c:1177`) →
  `fallhang` (seq_15); this is what sets `grab_timer = 12`.
- **Climb down** — Down at a ledge edge with an edge behind → `down_pressed` grab path
  (`seg005.c:472`) → `climbdown` (seq_68).
- **Climb onto a closed gate/mirror/chomper** — `can_climb_up`'s `seq_73` variant
  (`seg005.c:835`); gates are drawn but static here, so `can_climb_up` always uses the general
  `climbup`.
- **The horizontal jumps** (standing jump / running jump) — the other branch of the jump family;
  `control_jumpup`'s forward→standing-jump conversion (`seg005.c:680`) is a no-op until then.
