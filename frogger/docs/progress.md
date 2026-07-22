# Frogger — progress

Living build tracker. The design lives in `architecture.md` (the self-contained spec);
this file logs how the implementation gets there — steps done, what's next, and any
impl-time decisions or deferrals. The spec never points back here, so it stays
self-contained; progress.md is free to reference the spec's sections.

## Status

**Step 4 — homes: DONE.** `Homes` runs the §6 landing test: the frog's centre must fall within
±6 px of a bay centre **and** the bay be empty → it **fills** (`frog_home_0`, smile); landing there
while the **bonus insect** occupies that bay is a **pickup** (home + bonus); a miss (a divider) or an
occupied bay is **death**. The insect **walks** the five bays on the `T_BAY` timer in the fixed order
`2, 0, 3, 1, 4`, skipping any filled bay (§3.4). `Collision.resolve` delegates the home row to
`Homes.land` → `home` / `pickup` / `death`; `Play` awards `+50` (home) / `+200` (bonus) and **respawns
the frog** for the next bay (a home costs no life), and on the **fifth** bay routes to `RoundClear` —
which awards the `+1000` all-homes bonus and, after its fallback duration, advances the level with the
bays cleared. **The game is now winnable.**

Verified deterministically — 15 `Homes` unit assertions + 12 end-to-end through `Game.tick` → `Play`
→ `Flow`: the ±6 px tolerance boundary (home at +6, death at +7), occupied-bay + divider deaths, the
pickup award (+250), the walk order + skip-filled, and the full win path (5th bay → RoundClear +1000
→ level up → cleared bays). Render confirmed via `getImageData` (filled bays `rgb(29,195,0)`, empty
openings black, the insect drawn); no console errors.

Prior: **step 3** — collision (safe / ride / drown / squash per row + the river carry). **Step 2** —
the ten conveyor lanes (deterministic seed, seamless seam wrap). **Step 1** — the frog hop + the
static arcade field.

Next up: **step 5 — Timer + Score + HUD wiring** (the per-life countdown + time-out death, the home
**time bonus**, the forward-hop `+10`, and the bottom-HUD lives / timer bar / level, §4.1, §6).

## Steps (plan is provisional — adjusts as we build)

| # | What | Refs | Status |
|---|---|---|---|
| — | Design — `architecture.md`, the self-contained spec | — | done |
| 0 | Module scaffold — `main.js` + `src/*` + `modes/*`, boots into Attract | §9, §6 | done |
| 1 | Frog — hop (8-frame slide), facing, input-lock; render the frog + the static background bands + the row grid; no moving objects / collision yet | §6, §7, §4 | done |
| 2 | Lanes + movers — conveyors, wrap, rendering | §3.2 | done |
| 3 | Collision — safe / ride / drown / squash per row + the river carry | §7.3 | done |
| 4 | Homes — bays, landing test, occupancy fill, bonus insect, win check | §3.4, §6 | **done** |
| 5 | Timer + Score + HUD wiring (lives, timer bar, level) | §4.1, §6 | next |
| 6 | Timed events — dives, croc mouth, bay croc-head, lady-frog, otter (bonus insect done in step 4) | §3.4 | |
| 7 | Death + RoundClear presentation (explosion, laugh sweep) | §3.5, §10 | |
| 8 | Level ramp | §3.3 | |

## What's real vs stubbed (after step 4)

- **Real / running:** the boot pump (`main.js`), `Game` + the mode machine
  (`Mode`/`Flow`/5 modes), `Renderer` (drawSprite + clip + `fillRect` + `drawObject` +
  tinted monospace drawText), `Sprites` (atlas load), `Input` (edge-triggered),
  `constants.js` (the real §3/§4/§6 design data), `Score`/`Timer` logic, `Attract`, the
  mode transition/timing, **`Frog` (hop/facing/lock/render + river carry)**, **`Mover`**,
  **`Lane` (seed/advance/render)**, **`Playfield` (build/update/render)**, **`Homes` (landing
  test / occupancy fill + smile render / bonus-insect walk / win check)**, **`Collision` (§7.3
  safe / ride / drown / squash + carried-off-edge + home delegation)**, and `Play`'s §7 steps
  1 · 2 · 3 · 4 (input → frog → collision → objects move), with drown / squash / home-miss →
  `Death`, home / pickup → score + respawn, all-filled → `RoundClear` (+1000, level ramp).
  (Tile parts animate via `Lane._frame` — turtles swim.)
- **Stubbed** (class shell + documented §6 API + `TODO`): the turtle **dive** state + median
  **snake** entry + the **bay croc-head** / **lady-frog** / **otter** / **river-croc mouth** rest
  of §3.4 (frames are in config), the §3.3 level ramp, the `RoundClear` **laugh-sweep** render
  (step 7), and `Play`'s remaining tick steps (timer / audio + the forward-hop / time-bonus score).

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

## Step-4 impl decisions

- **Home row via `Collision` delegation.** `Collision.resolve` routes row `MAX_ROW` to
  `Homes.land` and returns its `home` / `pickup` / `death` outcome (the §6 outcome vocabulary);
  `Play` maps those to score awards + respawn + the win transition. Collision stays the single
  place the frog's landed cell is classified — the home band is just another band it dispatches.
- **±6 px tolerance vs the 8 px column grid.** The frog lands only on 8-multiple centres and the
  bays sit every 48 px, so in practice a landing is "exactly on a bay column or not" — the ±6 px
  window (`LAND_TOLERANCE`) leaves headroom without ever admitting an off-column landing. Tested at
  the boundary (centre +6 → home, +7 → death) so the constant's intent is pinned even though the
  grid never produces +7.
- **Bonus insect = the L1 bay item, owned by `Homes` (§6).** Its walk is derived from the frame
  counter (`BAY_ORDER[⌊frame/T_BAY⌋ % 5]`) — no stored state, deterministic. "Skipping a filled
  bay" is read as *no insect shown that step* (the simplest deterministic reading), not
  advance-to-next-unfilled. `land` reads `itemBay` during collision (§7 step 3), i.e. **last tick's**
  walk position — consistent with the "resolve against last frame's positions" invariant, since the
  walk advances in step 4 (`Playfield.update`).
- **Home content sits at the frog's landing y (32).** The filled `frog_home_0` and the insect draw
  at `ANCHOR_Y[MAX_ROW]`, so the arriving frog "becomes" the smiling home frog in place. If the
  hedge opening ever wants a different inset that's a one-constant tweak.
- **Reaching a home costs no life** — `Play` respawns the frog (`frog.reset`) + resets the timer and
  stays in `Play` for the next bay; only all-five-filled leaves `Play` (→ `RoundClear`).
- **Homes-triggered score is wired here** (home `+50`, pickup `+200`; the `+1000` all-homes already
  fires in `RoundClear.enter`) — the real data flow, cheap to wire when the event happens. The
  forward-hop `+10`, the home **time bonus** (needs `Timer`), and the HUD display of
  score / lives / timer / level are **step 5**.
- **Deferred to their steps:** the **croc-head** bay hazard (L2-only — unreachable until the level
  ramp, step 8; frames `crochead_0/1` are in the atlas), the **lady-frog** river escort (step 6),
  and the `RoundClear` **laugh-sweep** render (`frog_home_1` across the bays — step 7).

## Deferred

- **Sound** — the `Audio` service is a no-op placeholder (§5.2). The arcade
  AY-3-8910 engine + `assets/dat_sfx.js` are built later; until then RoundClear /
  GameOver fall back to their fixed §10 durations.
