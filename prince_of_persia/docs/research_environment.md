# Research — interactive environment & the portcullis (SDLPoP)

**Purpose.** The tiles the prince *collides with that change state* — above all the
**portcullis/gate** (button → door-link → raise/lower, and how its open height
feeds collision). Plus the other traversal trobs (loose floors, spikes, chompers,
potions, doors, mirror) at a glance. This is what the collision kernel reads when
a tile is animated rather than static.

**Source.** `seg007.c` (the trob/animated-tile system), `seg004.c`
(`can_bump_into_gate`, `check_gate_push`), `seg006.c` (`wall_type`,
`tile_is_floor`, `check_press`). Citations `segNNN.c:line`. Gate logic verified by
direct read of `seg007.c:333–409, 610–674`.

**Scope.** Traversal. Guard/sword-related trobs skipped.

---

## 0. The trob system (how an animated tile ticks)

A **trob** (transient object) is an animated tile on the active list. Plumbing
(`seg007.c`):

- **`process_trobs`** (seg007.c:24) — at the top of `play_frame`
  (`research_frame_loop.md §0`): iterate `trobs[]`, call `animate_tile` on each,
  drop finished ones (`type = −1`), compact.
- **`animate_tile`** (seg007.c:48) — dispatch by the tile's type at
  `trob.tilepos` → `animate_loose` / `animate_door` (gate) / `animate_spike` /
  `animate_chomper` / `animate_button` / `animate_potion` / `animate_leveldoor` /
  `animate_torch`. Loads the tile's modifier into `curr_modifier`, runs the
  animator, stores it back.
- **`add_trob`** (seg007.c:677) — add/refresh a trob (room, tilepos, type). The
  *type* seeds the animation state (for a gate: 0 closing / 1 opening / 2 permanent
  / 3 fast-close).
- **The modifier byte IS the animation state.** Each tile's `curr_room_modif[tilepos]`
  holds its live state (gate open-height, loose countdown, spike phase, potion
  bubble). The clone already does this for loose floors (`bg` byte, a
  `structuredClone` of the level).

---

## 1. PORTCULLIS / GATE (`tiles_4_gate`) — the priority

A gate is a vertical bar-grid that **raises to open and lowers to close**. Its
**modifier is its open height**, `0` (fully closed) … `188` (fully open) … `238`
(held-open peak), or `0xFF` (permanently open).

### 1a. The button → door-link → gate chain
1. **Press.** `check_press` (seg006.c:1683) — a grounded/turning/bumped actor on a
   `FRAME_NEEDS_FLOOR` frame reads the tile underfoot; a **button** (raise
   `tiles_15` / drop `tiles_6`) → `trigger_button`. (The clone's `check_press`
   currently handles only the loose tile; buttons are deferred.)
2. **`trigger_button`** (seg007.c:749) → **`do_trigger_list(index, button_type)`**
   (seg007.c:656): the button's modifier indexes a **door-link chain**; walk it —
   for each link get `room`+`tilepos`+target tile type, call `trigger_1`, and if
   the result `≥ 0`, `add_trob(room, tilepos, result)`. Continue while
   `get_doorlink_next(index) != 0` (one button can drive several gates). Door-link
   accessors `get_doorlink_room/tile/next/timer` (seg007.c:720–746). *The clone's
   `level1.js` already decodes `doorLinks` from this table.*
3. **`trigger_1`** (seg007.c:639): target `gate` → `trigger_gate`; target
   `level_door` → open if its modifier is 0.

### 1b. `trigger_gate` — the open/close decision (seg007.c:612)
By the pressing button's type:

| button | condition | action | returns (→ trob type) |
|---|---|---|---|
| **raise (`tiles_15_opener`)** | modifier `0xFF` (perm-open) | nothing | `−1` |
| | modifier `≥ 188` (already open) | hold: modifier = 238 | `−1` |
| | otherwise | modifier = `(modifier+3) & 0xFC` (snap up to ×4) | **`1`** (regular open) |
| **permanent (`tiles_14_debris`)** | modifier `< 188` | — | **`2`** (permanent open) |
| | else | modifier = `0xFF` | `−1` |
| **drop (else)** | modifier `≠ 0` | — | **`3`** (fast close) |
| | else (already closed) | — | `−1` |

### 1c. `animate_door` — the raise/lower over time (seg007.c:343)
`trob.type` (anim_type) drives the modifier each frame (`door_delta = {−1, +4, +4}`,
`gate_close_speeds = {0,0,0,20,40,60,80,100,120}`):

- **type 1 (regular open):** modifier `+= 4`/frame. On reaching `≥ 188` → set
  `238` and **switch to type 0 (closing)** → so a regular open **auto-closes** back
  to 0. (Opening sound every 8 units.)
- **type 2 (permanent open):** modifier `+= 4` to `≥ 188` → set `0xFF`, stop.
- **type 0 (closing):** modifier `−= 1`/frame; at `0` → `gate_stop`. (Closing sound
  when `modifier & 3 == 3`.)
- **type 3–8 (fast close):** step up anim_type to 8, subtract
  `gate_close_speeds[anim_type]`; clamp at 0 + stop.

So the life of a raise-button gate: **rise `+4`/frame to 188 → hold at 238 → sink
`−1`/frame to 0** (unless permanent). Slow to open, slower to fully close.

### 1d. How the gate's height feeds COLLISION (the key link)
- **`wall_type(gate) == 1`** (seg006.c:1626) — a gate is *always* reported as
  "wall at right", **regardless of openness.** So the coarse classifier never lets
  you through a gate tile.
- **`can_bump_into_gate()`** (seg004.c:373): `return (modifier >> 2) + 6 <
  char_height;` — the *actual* walkability. The gate is a bump obstacle only while
  its collision height `(modifier>>2)+6` is **less than** the prince (~char_height).
  So: closed (modifier 0 → height 6) blocks; open (modifier 188 → height 53) lets
  him walk **under**. The crossover is ~modifier 156. This is called inside
  `is_obstacle` (the bump path) and `get_edge_distance`, so a raising gate stops
  bumping/blocking you once it's high enough.
- **`tile_is_floor(gate) == 1`** (seg006.c:951) — a gate is a floor: you can
  **stand on top of a closed/low gate**. (An open gate is high, so nothing stands
  on it — the geometry, not a predicate, prevents that.)
- **`check_gate_push()`** (seg004.c): a *closing* gate that fully walls the
  prince's column (`curr_row_coll_flags & prev_coll_flags == 0xFF`) and
  `can_bump_into_gate()` shoves `Char.x` ±5 out of the tile — so a gate closing on
  you ejects you sideways rather than trapping you.

**Clone status:** the gate is *drawn* (portcullis bars) but **static** — no
button trigger (`check_press` button branch deferred), no `animate_door`, no
`can_bump_into_gate`/`check_gate_push`. Modeling it = wire the button branch of
`check_press` → a `trigger_gate`/`animate_door` port (the modifier already lives in
the mutable `bg` byte, same as loose floors) → teach `wallType`/floor checks to
consult `can_bump_into_gate` for tile 4. Bounded and self-contained; the door-link
data is already decoded.

---

## 2. Loose floors (`tiles_11_loose`) — *implemented*

`make_loose_fall` (seg007.c:904) arms (guard: solid loose + `(sbyte)modifier ≤ 0`);
`animate_loose` (seg007.c:816) `++modifier` each frame, `≥ loose_floor_delay (11)`
→ `remove_loose` (seg007.c:897, fg 11 → 0) + spawn a falling chunk (`add_mob`, the
debris — deferred). Countdown lives in the tile's modifier byte. Full write-up:
`research_collision.md §9`. The shake visual (`loose_shake`, high modifier bit) is
deferred.

---

## 3. Other traversal tiles (at a glance)

| tile | animator | collision-relevant behavior | citation |
|---|---|---|---|
| **spike** (`tiles_2`) | `animate_spike` | extends (modifier 0→5) then retracts; `is_spike_harmful` (modifier state) gates `check_spiked`/`land` damage | seg007.c:317; seg007.c:1178 |
| **chomper** (`tiles_18`) | `animate_chomper` | cycles blades; `wall_type == 3` (obstacle at left); a *closed* chomper (`modif==2`) is a bump obstacle + `check_chomped_kid` (reads the collision buffer) | seg007.c:288; seg004.c:439 |
| **potion** (`tiles_10`) | `animate_potion` | bubble frame cycles; **not a bump obstacle** (`is_obstacle` returns 0); picked up via `check_get_item` | seg007.c:253; seg004.c:232 |
| **doortop** (`7` / `12`) | static | `wall_type == 1` (wall at right); `12` is not a floor, `7` is; grab rules differ by facing (`can_grab`) | seg006.c:1626/951 |
| **mirror** (`tiles_13`) | static | `wall_type == 2` (wall at left); a right-to-left run-jump *breaks* it (`is_obstacle` sets modifier `0x56`) | seg004.c:240 |
| **level door** (`16`/`17`) | `animate_leveldoor` | opens (modifier→43 = `leveldoor_open`); `up_pressed` enters it | seg007.c:420 |

---

## 4. What the environment adds to the substrate

- The **portcullis** is the one traversal tile whose *collision result changes
  over time* — `wall_type` says "wall" but `can_bump_into_gate` reads the live
  modifier. Any faithful collision must consult the modifier for tile 4 (and let
  the actor stand on a low gate / pass under a high one). This is a clean addition
  on top of the loose-floor trob machinery the clone already has.
- Every animated tile stores its state in the **modifier byte** — the clone's
  mutable-level (`structuredClone`) approach already supports this; gates, spikes,
  chompers all fit the same pattern.
- `check_press` is the shared **trigger entry** (loose + button); the clone has the
  loose branch, and the button branch is the portcullis's on-ramp.

Deviation classification: `research_deviation_ledger.md`.
