# Frogger — progress

Living build tracker. The design lives in `architecture.md` (the self-contained spec);
this file logs how the implementation gets there — steps done, what's next, and any
impl-time decisions or deferrals. The spec never points back here, so it stays
self-contained; progress.md is free to reference the spec's sections.

## Status

**Step 1 — Frog hop + static field: DONE.** The frog hops one 16 px cell as a smooth 8-frame
slide at 2 px/frame (`Frog.beginHop`/`update`) — a lane vertically (row-indexed) or a column
horizontally — facing set per direction, input locked for the hop's duration; it renders
`frog_0..7` by facing × rest/hop. The static field renders the arcade's bands: the 24 px home
hedge (5 bays), the 16 px median + start-row `bg_block` safe strips, and a dev row grid.
`Play.update` runs §7 steps 1–2 (input → frog); no movers/collision yet.

The band layout was **measured from the arcade screenshot** and matches it to the pixel — see
the *Band layout* decision below. The frog frame mapping was derived by inspecting the atlas.

Verified deterministically (drive `frog.update()` directly, cadence-independent): the slide
steps 2 px/frame with the hop frame throughout → the rest frame on landing, snapped exact (no
float drift); the row anchors walk `224→208→…→32`, every hop **16 px**; a direction pressed
mid-hop is fully ignored (facing + position unchanged); spamming right clamps at `MAX_X = 200`.
In the browser: boots clean (no console errors); the rendered bands (`hedge 24–44 · median
128–143 · start 224–239`) match the arcade measurements exactly; real arrow keys drive the hops.

Next up: **step 2 — lanes + movers** (§3.2 conveyors, wrap, per-lane rendering).

## Steps (plan is provisional — adjusts as we build)

| # | What | Refs | Status |
|---|---|---|---|
| — | Design — `architecture.md`, the self-contained spec | — | done |
| 0 | Module scaffold — `main.js` + `src/*` + `modes/*`, boots into Attract | §9, §6 | done |
| 1 | Frog — hop (8-frame slide), facing, input-lock; render the frog + the static background bands + the row grid; no moving objects / collision yet | §6, §7, §4 | **done** |
| 2 | Lanes + movers — conveyors, wrap, rendering | §3.2 | next |
| 3 | Collision — safe / ride / drown / squash per row | §7.3 | |
| 4 | Homes — bays, landing test, bonus insect / croc-head | §3.4, §6 | |
| 5 | Timer + Score + HUD wiring (lives, timer bar, level) | §4.1, §6 | |
| 6 | Timed events — dives, croc mouth, bay item, lady-frog, otter | §3.4 | |
| 7 | Death + RoundClear presentation (explosion, laugh sweep) | §3.5, §10 | |
| 8 | Level ramp | §3.3 | |

## What's real vs stubbed (after step 1)

- **Real / running:** the boot pump (`main.js`), `Game` + the mode machine
  (`Mode`/`Flow`/5 modes), `Renderer` (drawSprite + a source/dest clip + `fillRect` +
  tinted monospace drawText), `Sprites` (atlas load), `Input` (edge-triggered),
  `constants.js` (the real §3/§4/§6 design data), `Score`/`Timer` logic, `Attract`, the
  mode transition/timing, **`Frog` (hop/facing/lock/render)**, **`Playfield.render`** (safe
  strips + dev grid), **`Homes.render`** (the hedge), and `Play`'s §7 steps 1–2.
- **Stubbed** (class shell + documented §6 API + `TODO`): `Mover`, `Lane`
  (seed/advance/render), `Collision`, `Homes.land`/occupancy visuals, `Playfield`'s lane
  advance, and `Play`'s later tick steps (collision / objects / timer / audio).

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
  lane boundary) so the rows read before the movers exist; turn it off once step 2 fills the
  field.

## Deferred

- **Sound** — the `Audio` service is a no-op placeholder (§5.2). The arcade
  AY-3-8910 engine + `assets/dat_sfx.js` are built later; until then RoundClear /
  GameOver fall back to their fixed §10 durations.
