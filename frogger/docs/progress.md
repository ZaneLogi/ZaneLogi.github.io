# Frogger — progress

Living build tracker. The design lives in `architecture.md` (the self-contained spec);
this file logs how the implementation gets there — steps done, what's next, and any
impl-time decisions or deferrals. The spec never points back here, so it stays
self-contained; progress.md is free to reference the spec's sections.

## Status

**Step 3 — collision: DONE.** `Collision.resolve` decides the frog's landed cell per §7.3 by span
overlap against that row's movers: a **river** row is safe only while the frog's **centre** rides an
object (it records `frog.riding` / `rideDx`), else it **drowns** — open water, or carried off a
screen edge; a **road** row **squashes** on any overlap with a vehicle; the two safe strips (start,
median) and the home band resolve **safe** (the bay landing test is step 4). `Frog.update` now
**carries** a landed rider by `rideDx` (§7 step 2), and `Play.update` runs the full §7 order
1 · 2 · **3** · 4 — collision resolves against last frame's drawn positions (before the lanes
advance in step 4), and a drown / squash fires `Flow.to('death')`. The frog now dies on the road,
rides logs and turtle groups down the river, and is carried off the edge.

Verified deterministically — 22 in-module assertions + 6 end-to-end through `Game.tick` → `Play` →
`Flow`: river ride / drown / off-edge, road squash / safe / any-overlap, the safe strips + home
band, the carry step, seam wrap-copy overlap, and a 31-tick "glued to the log" ride; car contact
and open water both transition Play → Death, a ride keeps the frog in Play and carried at
`dir·V`/tick. Live board renders clean (frog at spawn `rgb(224,224,0)`; river / road / hedge bands
all lit); no console errors.

Prior: **step 2** — the ten conveyor lanes seed deterministically (`x_i = (φ + i·P) mod L`) and
advance each tick with a seamless `L = 240` seam wrap; `Playfield` renders logs / turtles / vehicles
per row. **Step 1** — the frog hop (8-frame slide, facing, input-lock) + the static arcade field.

Next up: **step 4 — homes** (bays, the ±6 px landing test, occupancy fill, bonus insect /
croc-head bay hazard) + the win check (§3.4, §6).

## Steps (plan is provisional — adjusts as we build)

| # | What | Refs | Status |
|---|---|---|---|
| — | Design — `architecture.md`, the self-contained spec | — | done |
| 0 | Module scaffold — `main.js` + `src/*` + `modes/*`, boots into Attract | §9, §6 | done |
| 1 | Frog — hop (8-frame slide), facing, input-lock; render the frog + the static background bands + the row grid; no moving objects / collision yet | §6, §7, §4 | done |
| 2 | Lanes + movers — conveyors, wrap, rendering | §3.2 | done |
| 3 | Collision — safe / ride / drown / squash per row + the river carry | §7.3 | **done** |
| 4 | Homes — bays, landing test, bonus insect / croc-head | §3.4, §6 | next |
| 5 | Timer + Score + HUD wiring (lives, timer bar, level) | §4.1, §6 | |
| 6 | Timed events — dives, croc mouth, bay item, lady-frog, otter | §3.4 | |
| 7 | Death + RoundClear presentation (explosion, laugh sweep) | §3.5, §10 | |
| 8 | Level ramp | §3.3 | |

## What's real vs stubbed (after step 3)

- **Real / running:** the boot pump (`main.js`), `Game` + the mode machine
  (`Mode`/`Flow`/5 modes), `Renderer` (drawSprite + clip + `fillRect` + `drawObject` +
  tinted monospace drawText), `Sprites` (atlas load), `Input` (edge-triggered),
  `constants.js` (the real §3/§4/§6 design data), `Score`/`Timer` logic, `Attract`, the
  mode transition/timing, **`Frog` (hop/facing/lock/render + river carry)**, **`Mover`**,
  **`Lane` (seed/advance/render)**, **`Playfield` (build/update/render)**, `Homes.render`
  (the hedge), **`Collision` (§7.3 safe / ride / drown / squash + carried-off-edge)**, and
  `Play`'s §7 steps 1 · 2 · 3 · 4 (input → frog → collision → objects move), drown / squash →
  `Death`. (Tile parts animate via `Lane._frame` — turtles swim.)
- **Stubbed** (class shell + documented §6 API + `TODO`): `Homes.land`/occupancy visuals, the
  turtle **dive** state + median **snake** entry + the rest of §3.4 timed events (frames are in
  config), the L2 croc, the §3.3 level ramp, and `Play`'s remaining tick steps (timer / audio).

## Step-1 impl decisions

- **Frog frame ↔ state** (`FROG_FRAMES`, `constants.js`) — derived by inspecting the atlas:
  `frog_0..7` are `(rest, hop)` pairs in the order **up, left, down, right**. Rest = legs
  tucked (landed); hop = legs kicked out (shown during the slide).
- **Atlas fix — the extractor mis-cut a mixed-height source row.** The offline extractor cropped
  every cell at its band's full height, but source band 9 is 24 px (the hedge sets it) while its
  bay sprites are 16 px on the band's bottom, and band 10's `blk_*` tiles are 8 px on its top. So
  `frog_home_0/1`, `bonus`, `crochead_0/1`, `bg_block` came out **16×24** (8 px black margin) and
  `blk_0..9` came out **8×16**. Fixed in the extractor (a `CELL_FIX` per-cell height + edge-align
  override) and **regenerated** `frogger_atlas.png` + `dat_sprites.js`; they are now 16×16 / 8×8.
  Also corrected the extractor's hard-coded output path (it now lives outside the repo). The
  wrong `bg_block` height is what drove the earlier (reverted) 24 px-strip layout.
- **Band layout — measured from the arcade screenshot**, matches to the pixel. The arcade's
  tile-aligned split, summing to 256 px: score **24** · hedge **24** (24–47) · 5 river ×16
  (48–127) · median **16** (128–143) · 5 road ×16 (144–223) · start **16** (224–239) · bottom
  HUD **16** (240–255) (`ROWS`, `SCREEN.PLAY_TOP=24`/`PLAY_BOTTOM=239`). Only the hedge is 24 px;
  the ten lanes and both safe strips are 16 px.
- **Vertical hops are a uniform 16 px grid** — `ROWS.ANCHOR_Y[row] = 224 − row·16` (row 0 = start
  … 12 = home), since every playfield row below the hedge is 16 px. Row-indexed (not a fixed
  pixel delta) so later steps can query the frog's row directly.
- **Column grid** — horizontal hops move `x` on the 8-offset column grid (8…200, so the
  16 px frog stays fully on screen). A hop blocked at a screen edge only turns the frog (no
  lock), so the player can redirect immediately.
- **Bay geometry** (`HOMES.BAY_CENTERS = [16, 64, 112, 160, 208]`) — centres on the frog
  column grid, symmetric about mid-screen (112 = straight above spawn). The hedge tiles
  `hedge_0` bay units at `centre − 16` with `hedge_1` filling the gaps; each opening's black
  is transparent → a black bay until filled.
- **Home approach (deferred to step 4)** — the top hop lands the frog at row 12 (`y = 32`),
  in the 24 px hedge band (24…47). The exact bay snap + `frog_home_0` swap + the ±6 px landing
  test belong to `Homes` (step 4).
- **Dev row grid** (`DEBUG.ROW_GRID`) — a marked non-source aid (a faint 16 px grid line per
  lane boundary) so the rows read before the movers exist; turned **off** in step 2 now that
  the movers fill the field (flip on to debug row geometry).

## Step-2 impl decisions

- **Deterministic conveyor seed** (`Lane._seed`) — N `Mover`s at left-edge `x_i = (φ + i·P) mod
  L`, pitch `P = L/N`, phase `φ = laneIndex·20` (the §3.2 stagger), shared `L = WRAP_L = 240`.
  No RNG — identical every run.
- **Seamless wrap** (`Mover.advance` + `Lane.render`) — `x` stays in `[0, L)`; a mover is drawn
  at `x` and, when it straddles the seam (`x + w > L`), a second copy at `x − L`. `L = 240` is
  16 px wider than the 224 screen, so a lone 16 px object is fully hidden in that buffer for the
  one frame it crosses — the wrap reads as continuous.
- **Object composition** (`Renderer.drawObject`, `LANES[].tiles`) — a lane object is a tile spec
  `{ body, left?, right? }` laid out left→right: optional 16 px end caps + `body` tiled between.
  A **log** = rounded left end `log_0` + repeating body `log_1` + tree-ring right end `log_2`, so
  its length scales the body count (W 48/64/32 → **1/2/0** body tiles). Turtle groups / vehicles
  are body-only (`truck` a 32 px body; cars/dozers 16 px). (Was a single tiled sprite — wrong
  for logs; corrected mid-step.)
- **Animated vs static tile parts** (`Lane._frame`, `ANIM.RATE`) — each part is either a single
  sprite (static: log parts, vehicles) **or** a frame LIST that cosmetically cycles every
  `ANIM.RATE = 8` ticks off the global counter (§3.5). Turtles **swim** (`turtle_0/1/2`) — done;
  the config also carries the diving group's submerged frames (`dive: turtle_dive_0/1`) and the
  median snake's frames (`snake_0/1/2`) so the substrate is complete, but their **behavior** —
  the §3.4 dive timer and the snake's edge-entry hazard — lands in step 6. The frame counter is
  threaded `Play.render → Playfield.render → Lane.render`.
- **Lane direction ↔ sprite orientation** — the turtle sprite's head faces **left** only, so
  every turtle lane drifts left; logs are symmetric (no front) so they take the opposite drift,
  **right**. This flipped River 4 (log → right) and River 5 (turtle → left) from the old spec;
  all adjacent lanes still counter-flow except the two neighbouring log lanes (River 3 · 4).
  Vehicles already face their lane's direction (car_green → right, car_red / truck → left), so
  the road was left unchanged. (§3.1 updated.)
- **Level-1 only** — lanes use `cfg.v` / `cfg.n` directly; the §3.3 ramp (V scaling + the N
  schedule) is **step 8**. `Lane` already carries `level` for it.
- **Deferred to their steps** — the river **carry** of a riding frog (needs the frog's ride
  state → step 3); collision/kill (`Lane.carries`/`kills` are set but unread until step 3); the
  turtle **dive** state + the median **snake** entry (§3.4 → step 6; their frames are in config);
  the L2 **crocodile** (a wide single-sprite object replacing a river-1 log). The median lane
  seeds **0 movers** at L1 (its snake enters at an edge from L2, not a fixed conveyor).

## Step-3 impl decisions

- **Row → lane, geometry-derived.** `Collision` finds the frog's band by equating the frog's row
  anchor to a lane's render y: `i = (ROWS.ANCHOR_Y[row] − FIRST_LANE_Y) / CELL`. An out-of-range
  `i` is a **safe strip** — the start row (below the lanes) or the home band (above) — so those
  resolve `safe` with no special-casing. Chosen over a bare `11 − row` so the mapping stays tied
  to the actual band geometry, not a magic constant.
- **River = centre test, road = any-overlap test (a deliberate asymmetry).** A river ride needs
  the frog's **centre** over a mover — you must be *on* the log, and drifting a hair off drowns
  you (faithful feel). A road squash triggers on **any** span overlap with a vehicle — contact
  kills, a generous hitbox. Both tests also check each mover's **seam wrap copy** (`m.x − WRAP_L`),
  so collision geometry matches `Lane.render`'s wrap copy exactly.
- **Carried-off-edge = frog centre outside `[0, 224)`** — a tunable feel constant (symmetric about
  screen centre; the frog rides until more than half of it has left the screen, then drowns).
- **Carry lives in `Frog.update` (§7 step 2), not in the lane advance.** `Collision` caches
  `frog.rideDx = dir·V` when it confirms a ride; `Frog.update` applies it while landed. Because
  step 2 uses *last* frame's ride and the movers advance in step 4, the frog trails its log by ≤ V
  px (≤ 0.45) for one frame, corrected the next — sub-pixel, never enough to break the 16 px
  overlap, and it keeps the §7 invariant "collide against last frame's drawn positions → move".
- **Diving-turtle drown is step 6.** At L1 every turtle group is surfaced, so a turtle ride is
  always safe now; the §3.4 dive timer flips a submerged rider to `drown` when it lands. The dive
  frames are already in config.
- **Death re-enters through `Play.enter`, which rebuilds the playfield** (re-seeds the conveyors)
  each life. Deterministic and fine for now; keeping the board running across a life (resetting
  only the frog) is a **step-7** (Death presentation) concern, not a step-3 one.

## Deferred

- **Sound** — the `Audio` service is a no-op placeholder (§5.2). The arcade
  AY-3-8910 engine + `assets/dat_sfx.js` are built later; until then RoundClear /
  GameOver fall back to their fixed §10 durations.
