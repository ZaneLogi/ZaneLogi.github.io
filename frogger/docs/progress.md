# Frogger — progress

Living build tracker. The design lives in `architecture.md` (the self-contained spec);
this file logs how the implementation gets there — steps done, what's next, and any
impl-time decisions or deferrals. The spec never points back here, so it stays
self-contained; progress.md is free to reference the spec's sections.

## Status

**Step 9 — Audio, Phase B (music playing): DONE.** The song engine is complete: **`assets/dat_sfx.js`** holds
all 25 arcade songs (the theme, the two jingles, the home tunes) as decoded note-frequency / note-set / tempo
tables + raw voice byte-streams, and **`src/audio/sequencer.js`** (Layer 2) interprets them onto the Layer-1
PSG — `playMusic()` loops the theme, `request('level_complete')` / `request('game_over')` fire the jingles,
`isPlaying()` gates the jingle-timed screens, `tick()` loops. **It is already integrated in-game:** the music
request-sites were wired long ago (`Play.enter` → `playMusic`; `RoundClear` / `GameOver` → `request` +
`isPlaying`), so with the real sequencer in place the theme now plays during Play and the jingles time the
clear / game-over screens. The `demo/audio_test.html` bench's sequencer section is live (theme + jingle
buttons). Detail in *Audio impl decisions*.

Verified (deterministic — hearing it is a listen-test): the theme decodes to the right melody (A#4 / F#4 … at
exact 0.229 s eighth-notes across all three voices), the jingles gate `isPlaying` true, driving the game into
Play schedules the 70-note theme, and the game + bench boot clean. Next: **Phase C — SFX playing** — the short
gameplay sounds (hop / plunk / squash / hurry-up / time-out / bonus / extra-life) are a *separate* arcade
mechanism (a command jump table with per-effect init/continuation routines, likely procedural rather than note
streams), so they need their own decode, then their `request()` sites wired.

Prior steps: **9A** the Layer-1 PSG voices + the `audio_test` bench · **8** level ramp (per-level speed + count
schedule + L3 second diver/otter) · a **HUD-overflow** polish (lives/level → one icon + a digit count past 5) ·
**7** death explosion + RoundClear laugh-sweep · **6** all §3.4 timed events (6a diving turtles · 6b lady-frog ·
6c river-croc mouth · 6d bay croc-head · 6e median snake · 6f roaming otter) · **5** Timer + Score + HUD · **4**
homes · **3** collision + carry · **0–2** scaffold / frog / lanes. The core gameplay (1–8) is complete and the
`Attract` screen is done (§8/§10 — minimal title, no demo). Per-step detail in the *impl decisions* sections below.

**Dev URL overrides** (`DEV`, wired into `Game` / `Attract` / `Timer`): `?level=N` [1, 20] sets the start
level; `?lives=N` [1, 10] the start lives; `?beat=N` [1, 300] the timer's frames-per-beat (default 30 — lower
drains the countdown faster). **Lives cap:** the in-play count can pass 10 via the extra life, capped at
`LIVES.MAX` = 99; the HUD collapses lives / level to one icon + a digit count past `HUD.ICON_MAX` = 5.

## Steps (plan is provisional — adjusts as we build)

| # | What | Refs | Status |
|---|---|---|---|
| — | Design — `architecture.md`, the self-contained spec | — | done |
| 0 | Module scaffold — `main.js` + `src/*` + `modes/*`, boots into Attract | §9, §6 | done |
| 1 | Frog — hop (8-frame slide), facing, input-lock; render the frog + the static background bands + the row grid; no moving objects / collision yet | §6, §7, §4 | done |
| 2 | Lanes + movers — conveyors, wrap, rendering | §3.2 | done |
| 3 | Collision — safe / ride / drown / squash per row + the river carry | §7.3 | done |
| 4 | Homes — bays, landing test, occupancy fill, bonus insect, win check | §3.4, §6 | done |
| 5 | Timer + Score + HUD wiring (lives, timer bar, level) | §4.1, §6 | **done** |
| 6a | Timed events — diving turtles (submerge cycle, drown a submerged rider) | §3.4, §3.5 | done |
| 6b | Timed events — lady-frog escort (River 4, cyan recolor, +200 carry-home) | §3.4, §5.1 | **done** |
| 6c | Timed events — river-crocodile mouth (River 1, from L2) | §3.4 | done |
| 6d | Timed events — bay croc-head hazard (from L2) | §3.4 | done |
| 6e | Timed events — median snake (from L2) | §3.4 | done |
| 6f | Timed events — roaming otter (log lanes 1→3→4, gap-model, from L3) | §3.4 | done |
| 7 | Death + RoundClear presentation (explosion, laugh sweep) | §3.5, §10 | done |
| 8 | Level ramp — speed scaling + count schedule + L3 second diver / otter | §3.3 | done |
| 9 | Audio — Phase A: Layer 1 PSG voices + bench · Phase B: music playing (song data + sequencer) · Phase C: SFX playing (decode + wire the gameplay effects) | §5.2 | **A·B done** |

*(Bonus insect was done in step 4. HUD-overflow polish — lives/level → icon + digit count — landed between steps 8 and 9, not a numbered step.)*

## What's real vs stubbed (after step 8)

- **Real / running:** the boot pump (`main.js`), `Game` + the mode machine
  (`Mode`/`Flow`/5 modes), `Renderer` (drawSprite + clip + `fillRect` + `drawObject` +
  tinted monospace drawText + **cached `recolored` / `drawSpriteFrom`**), `Sprites` (atlas load),
  `Input` (edge-triggered), `constants.js` (the real §3/§4/§6 design data), `Attract`, the mode
  transition/timing, **`Frog` (hop/facing/lock/render + river carry + lady-on-back)**, **`Mover`**,
  **`Lane` (seed/advance/render + `submerged` diving turtles + `mouthOpen` river croc from L2 + L2
  median snake + the **§3.3 level ramp**: effective `v` = base × speed factor, effective `n` = the count
  schedule, and a **second diving group** from L3)**,
  **`Playfield` (build/update/render — `build` applies the §3.3 ramp per level)**, **`Homes` (landing test / occupancy fill + smile render /
  bonus-insect walk + L2 bobbing croc-head / win check)**, **`LadyFrog` (River 4 escort — board /
  pickup-on-her-log / carry-home +200)**, **`Otter` (roams River 1/3/4 from L3 — traverses a
  lane left→right, submerges under logs / surfaces in gaps, lethal only while surfaced; its speed ramps
  with the board so it keeps overtaking the logs)**, **`Collision` (§7.3 safe / ride / drown / squash + carried-off-edge + home
  delegation + submerged-diver drown + lady pickup + croc-jaws drown + otter contact)**, **`Timer` (countdown +
  time-out + continuous bar fraction)**, **`Score` (all
  awards + forward-hop gate + extra life)**, **`Hud` (top score/hi + bottom lives / timer bar /
  level)**, and `Play`'s §7 steps 1 · 2 · 3 · 4 · 5 (input → frog → collision → objects → timer):
  drown / squash / home-miss / time-out → `Death`, home / pickup → score (+ time bonus + lady) +
  respawn, all-filled → `RoundClear` (+1000, level ramp). (Tile parts animate via `Lane._frame`.)
  **`Death` (frozen field + `death_0..5 → skull` explosion at the frog's spot → life spend → Play /
  GameOver)** and **`RoundClear` (field runs; `frog_home_1` laugh-sweep left-to-right across the bays →
  next level)** are now real (step 7).
- **Stubbed** (class shell + documented §6 API + `TODO`): the gameplay-event **sounds** (hop / plunk /
  squash / hurry-up / time-out — no-op `Audio`, §5.2) and `Play`'s remaining tick step (audio). **All
  §3.4 timed events and the §3.3 level ramp are now real** — the whole gameplay loop (steps 1–8) is done,
  and the `Attract` title screen meets its §8 / §10 spec. **Audio (§5.2) is the sole remaining subsystem.**

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
  each life. Deterministic; re-seeding the conveyors on death is fine. **Fixed after step 7 (bug):**
  `build()` used to also `homes.reset()`, so a death wiped the filled home bays — but they must
  **persist across a life**. `homes.reset()` moved out of `build()` to the two fresh-start points
  (`Attract` on Start = new game, `RoundClear` on advance = new level); a death now keeps the bays.

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
- **Deferred to their steps:** the **lady-frog** river escort (step 6b), the **bay croc-head** hazard
  (step 6d), and the `RoundClear` **laugh-sweep** render (`frog_home_1` across the bays — step 7).

## Step-5 impl decisions

- **Timer ticks in `Play` step 5** — after the objects move, every frame (including mid-hop, so time
  passes during a slide); `tick()` returning true (`beats` → 0) routes to `Death` like any other
  kill. Resets on each life start (`Play.enter`) and on reaching a home.
- **Continuous bar fraction.** `Timer.fraction()` = `(beats−1 + _frames/FRAMES_PER_BEAT) / BEATS`, so
  the HUD bar **creeps** smoothly instead of jumping a whole beat every 30 frames. The gameplay
  countdown itself is still integer beats; the fraction is display-only.
- **Time bonus is read before the timer resets.** On a home, `+50` / `+200` then `+beats×10` are
  awarded off the beats *standing when the home is reached* — computed **before** the win check, so
  the fifth (winning) home also banks its time bonus, then `RoundClear` adds `+1000`.
- **Forward-hop `+10` is gated + per-frog.** Awarded only on a `safe` / `ride` landing to a **new
  furthest row** (not on the home award, not on death); `Score.newFrog()` zeroes the gate at every
  respawn (`Play.enter` + the home respawn) so each frog re-earns its hop points and can't farm one
  row. `Score.reset()` (whole new game, from `Attract`) stays separate.
- **Reserve lives = `lives − 1`** (the last life is the frog currently in play), per §4.1 "reserve
  life" — so 3 lives shows 2 icons, the last life shows none.
- **Timer bar is right-anchored, draining leftward** — derived from the `blk_*` sprites, not guessed:
  the partial end tiles fill their **right** side (`blk_3` `..######` → `blk_5` `......##`) and the
  `TIME` label sits to the bar's right, so the bar hugs the right edge and its draining (leftmost)
  tile joins onto the full tiles. Length is continuous px; drawn as `⌊px/8⌋` full tiles + one
  narrowing end tile chosen from the sub-tile remainder (2 / 4 / 6 px buckets).
- **Gameplay-event sounds stay unwired** (hurry-up, time-out, hop, plunk, squash). `Audio` is a
  no-op; these `request()` sites land with the §5.2 audio work, consistent with the other
  gameplay sounds still unwired (only the mode-transition sounds call `request` today).

## Step-6a impl decisions

- **The diver is the first group; the dive state is derived, not stored.** In a turtle lane
  (`cfg.dive` set) `lane.diver = movers[0]`; `lane.submerged(frame)` is a pure function of the frame
  counter — `(frame + phase) % T_DIVE ≥ ¾·T_DIVE` — so no per-frame state to reset or desync. The
  per-lane `phase = index · (T_DIVE/2)` puts the two turtle lanes half a cycle apart (river2 under
  `[60,120)`, river5 `[180,240)`), so they never submerge together.
- **`Collision.resolve` gained the `frame`** so the river branch can drown a rider on the submerged
  diver (`m === lane.diver && lane.submerged(frame)`). It's threaded from `Play` (`g.frame`), and
  since collision runs in §7 step 3 against last-frame positions, the dive state it reads is the same
  one that was rendered — consistent with the carry / drawn-position invariant.
- **Only the diver swaps sprites.** `Lane.render` draws the normal turtle spec for every group and
  the `cfg.dive` (`turtle_dive_*`) spec only for `diver` while `submerged` — the other groups in the
  lane keep swimming. Non-dive lanes are unaffected (`diver` null).

## Step-6b impl decisions

- **Ride-a-log / ride-on-back (Zane's ruling over the simpler ride-her-as-platform).** The lady
  **sits on** a River-4 log (`LADY_LOG`), so the *log* is the platform — the player is never left
  over open water on pickup. Hopping onto her log sets `frog.hasLady` and marks her `taken`; she
  then rides on the **frog's back** (drawn by `Frog`) until a home (+200) or death (lost).
- **`Collision` triggers the pickup, not `LadyFrog`.** The river ride branch already finds the mover
  under the frog; if that mover **is her log** (`m === lady.log`) while she's aboard and the frog
  isn't already carrying one, it's a pickup. Gated `!frog.hasLady` so you can't double-carry.
- **Deterministic, mostly derived.** She has only `active` / `taken` flags; her **position tracks
  her conveyor log** (`x` getter) rather than a stored coordinate, and boarding is frame-gated
  (`frame % T_LADY == 0`); once aboard she rides continuously (see the fixes below). The seam wrap
  copy mirrors `Lane.render`.
- **Reusable `recolored(key, map)`** (lifted from `demo/sprite_viewer.js`): one palette-remapped
  copy of the whole atlas per key, cached; `drawSpriteFrom(src, name, x, y)` blits a sprite rect
  from it. Only the multi-colour frog remaps (per §5.1) — the cyan lady is `FROG_RECOLOR.cyan`.
- **The back-sprite offset `FROG.LADY_DY`** is the one feel value left tunable.

### Step-6b fixes (2026-07-22)

Three lady-frog corrections (Zane), verified deterministically:

- **(1) Only one lady in play.** `LadyFrog.update(frame, frogHasLady)` no-ops while the player is
  carrying her, so no second lady boards/shows on the river. `frogHasLady` is threaded
  `Play` / `RoundClear` → `Playfield.update` → `LadyFrog.update`. (Pickup was already gated
  `!frog.hasLady`; this closes the *spawn* side.)
- **(2) Rides her log continuously — no vanish-and-return.** Dropped the `LADY_WINDOW` cutoff
  (removed from `constants.js`) that blinked her off mid-ride; once boarded she stays aboard,
  riding her log, until picked up (or the timer re-boards her after a delivery/loss).
- **(3) Carried below the frog.** The back sprite draws at `y + FROG.LADY_DY` (screen-y **greater**
  than the frog's), not `y − LADY_DY` above it.

Verified: continuous ride = 1 active transition over 1200 frames (boards once, stays); one-at-a-time
= no river lady while carrying across the `T_LADY` boundaries; below = lady y = frog y + 5. Live tick
path + full render run clean (no console errors).

## Step-6c impl decisions

- **The croc is a flagged `Lane` mover, not a separate entity.** It *replaces* a River-1 log, so it
  rides the same conveyor at the same width (48) — `Lane.croc = movers[CROC_LOG]` (only when
  `level ≥ 2 && cfg.croc`). Render and collision special-case that one mover; below level 2 it's a
  plain log. This mirrors `diver` and keeps the croc on the deterministic conveyor for free.
- **Mouth orientation verified against the sprite, not assumed.** `croc_0`↔`croc_1` differ only in
  columns 33–46 → the mouth is the **right** end, which is River 1's *leading* edge (dir +1). So the
  lethal "front tile" is `[x + w − CELL, x + w)`; `_inJaws` computes it by `dir` (so a left-drifting
  croc would use the left tile) and checks the seam wrap copy too.
- **Only the front tile kills, only while open.** `mouthOpen` is the last third of `T_MOUTH`
  (frames 80–119); on the back tiles, or any time the mouth is closed, the croc **rides like a log**
  (`ride` + carry at the lane speed). Death is just the `_inJaws && mouthOpen` corner.

## Step-6d impl decisions

- **Two coexisting bay items, not one that swaps type (Zane's ruling).** The bonus insect (step 4)
  and the crocodile head are **separate** home-bay items that never share a bay, each on its own
  schedule. The considered alternative — a single item whose type flips by level — was set aside for
  this two-item design.
- **The croc's level-2 gate is a deliberate choice.** It keeps early levels gentle; `Homes.level`
  (set in `Playfield.build`) is the gate.
- **Both items are frame-derived — no new entity.** `Homes.update` cycles the insect on `T_BAY`
  (visible for `INSECT_SHOW`, then gone) and the croc head on its **own `T_BAYCROC` cycle**
  (`crocBay = BAY_ORDER[(⌊frame/T_BAYCROC⌋ + 2) % 5]`,
  the `+2` starting it clear of the insect), skipping a filled bay **or** the insect's current bay (so
  they're never together). Within the cycle: sliver for `[0, CROC_SLIVER)`, lethal for
  `[CROC_SLIVER, CROC_SLIVER + CROC_OPEN)`, gone after (see the fix). `land` gains two branches: croc
  bay + head-up → death; croc bay + head-down → a normal `home` fill (which clears the croc). No RNG.
- **The two crocodile hazards differ.** The river croc mouth is lethal in the last third of its
  `T_MOUTH` cycle and is always present (riding a log). The bay croc-head runs a distinct three-phase
  cycle — sliver → open → **disappear/wait** — so it is absent between appearances (see the fix below).

### Step-6d fix (2026-07-22)

**Bay items get appear → wait lifecycles (Zane).** Two original problems with the croc head: it
stepped bays on the insect's `T_BAY` (`(s+2)`) while bobbing on `frame % T_BAYCROC`, so `≈ 2.13` bobs
crammed into one bay visit and the two items moved in lockstep; and it was **always present**, hopping
straight to the next bay with no gap. The insect, likewise, never left. Fix — each item now runs its
own cycle: appear, then **disappear and wait** before re-appearing in the next bay.

- **Croc head** — own `T_BAYCROC` cycle (default **324**, independent of `T_BAY`): head-down
  **sliver** (safe) `CROC_SLIVER` (48) frames → head-up **lethal** `CROC_OPEN` (36) frames → **gone**
  for the rest (~**240** frames ≈ 4 s: the wait). One snap per appearance. A `+2` bay offset keeps it
  clear of the insect at startup; it still yields (skips a cycle) if it would land on the insect's or a
  filled bay.
- **Bonus insect** — own `T_BAY` cycle (default **350**): visible `INSECT_SHOW` (170) frames → **gone**
  for the rest (~**180** frames ≈ 3 s: the wait), then the next bay.
- **Different waits, on purpose** (Zane): croc **240** vs insect **180**, and the cycles (324 vs 350)
  are non-multiples so the two never lock into a fixed collision pattern. Both were tuned **longer**
  after a first pass (126 / 86) felt too short.

The spec fixed only the old bob cycle, not the items' spawn rhythms, so this was a free design choice;
§3.4 updated. Verified: steady-state timelines read insect `show 170 → wait 180 → …` and croc
`sliver 48 → open 36 → wait 240 → …` from frame 0, both always with a wait, and the croc never shares
the insect's bay.

## Step-6e impl decisions

- **The snake is a plain lane object, not a new timed entity.** It is a single median mover that
  sweeps left and wraps like any conveyor — so `Lane._seed` just seeds the median (one mover) from
  level 2, and the existing advance / seam-wrap / `_frame` animation carry it for free. No `LadyFrog`-
  style class, no timer beyond the level gate.
- **`kills` follows the seed.** `Lane.kills` is now computed *after* `_seed` as `road || (median &&
  movers.length > 0)`, so the median resolves like a hazard lane (the road collision path: overlap →
  death, else safe) exactly when it holds a snake — level 2+. Below that it is empty safe grass.
- **Sprite-width correction: median `W` 16 → 32.** The `snake_*` sprites are 32 px; the lane's width
  was 16, which would give the visible snake a half-width hitbox. Widened to 32 so the hitbox matches
  what the player sees (§3.2 updated) — the same "faithful to what the player observes" fix as the
  earlier atlas-size corrections.

## Step-6f impl decisions

- **The otter traverses the lane and submerges under logs — nothing is spawned or hidden.** It enters at
  the left edge (`x = 0`) and swims right at `OTTER_V` (absolute, 0.8 px/frame — faster than every lane, so
  it overtakes logs), leaving off the right edge (`x ≥ WIDTH`). Its `surfaced` flag is recomputed each
  frame as **"no log span overlaps the otter"** (`_underLog`, checking each mover's span + its seam wrap
  copy); any overlap ⇒ submerged, so the otter is only ever drawn in clear water, never on top of a log. It
  toggles **its own** visibility — the lane's log set is untouched, so the `diver` / `croc` mover-index
  refs stay valid.
- **Lethal only while surfaced** (`Otter.hits`, checked first in the river branch): `hits` returns true
  only when `active && surfaced` and the frog span overlaps. A frog on a log's **middle** clears the otter;
  one riding within ~8 px of the **edge facing a surfaced otter** has its span poke into the gap and is
  snatched; under a log the otter is harmless. So the "don't stay near a log edge next to a surfaced otter"
  behaviour falls out of the overlap — no special rule.
- **Render / state.** A two-state `idle → swimming` machine; `render` and `hits` both no-op unless
  `active && surfaced`. `otter_1` (the rear-up catch pose) is the death presentation's (step 7); during
  play the otter is always `otter_0`. Roam order River 1 → 3 → 4.
- **From level 3** (`Otter` takes the level, gated on `OTTER_MIN_LEVEL`), per §3.3 — the last hazard to
  switch on. Paired with a **`?level=N` URL start-override** (`DEV.START_LEVEL`, dev-only, clamped
  [1, 20], default 1, wired in `Game` + `Attract`) so the otter is testable without grinding to level 3.
- **Exit is at the right edge** (not a dive under a specific final log) — the simplest deterministic end;
  flag if a dive-out is wanted instead.

## Step-7 impl decisions

- **The death spot + frame are captured in `Death.enter`.** The frog isn't reset until the *next*
  `Play.enter`, so its `x`/`y` are still the death position while `Death` runs — but `Death` snapshots
  them (and `game.frame`) anyway, so the explosion draws at a fixed spot over a **frozen field** (the
  playfield is rendered but **not** updated in `Death`). Freezing matches the arcade "everything stops,
  the frog bursts" feel and avoids the movers sliding under the explosion.
- **Explosion = a 7-frame array, index by `⌊timer / FRAME_HOLD⌋`.** `['death_0'..'death_5','skull']`,
  each held `DEATH.FRAME_HOLD` (8) frames → 56 total; `update` transitions at 56. The frames are a real
  burst→skull sequence in the atlas (verified on screen — their cells were once lady/fly names, but the
  atlas was regenerated).
- **Laugh-sweep = an overlay, no `Homes` change.** `RoundClear.render` draws the normal field (bays show
  `frog_home_0`), then overlays `frog_home_1` on the first `⌊timer / LAUGH_PER_BAY⌋` bays **left-to-right**
  — so smile → laugh sweeps across without touching `Homes`. `LAUGH_PER_BAY` (15) × 5 bays = 75 frames of
  sweep inside the `SWEEP` (90) hold; the field keeps running (movers advance) behind it.
- **The exit still honours the jingle.** `RoundClear` advances at `timer ≥ SWEEP` **and** `!isPlaying('level_complete')`;
  with `Audio` a no-op `isPlaying` is false, so the fixed 90-frame hold governs — the §10 jingle path is
  already wired for when audio lands.

## Step-8 impl decisions

- **The ramp lives in `Lane`, computed once at construction from `level` — not per-frame.** `Playfield.build(level)`
  already rebuilds every lane each level, so the `Lane` constructor derives `this.v = cfg.v × speedFactor(level)`
  and `this.n = laneCount(cfg.id, cfg.n, level)` up front; `advance` and `_seed` read those, never the base `cfg`.
  This keeps the ramp a pure function of `level` with no per-tick cost and no mutable ramp state to reset.
- **The carry must read the *same* effective `v`.** `collision.js` sets `frog.rideDx = dir × lane.v` (was
  `cfg.v`), so a rider is carried at exactly the ramped speed the lane advances at — the §7 "collide against the
  drawn positions" invariant would break if the two used different speeds.
- **Count schedule = the four lanes the §3.3 table lists** (`COUNT_SCHEDULE` in `constants.js`): river1 / river4
  thin, road2 / road5 thicken; every other lane keeps its base `n`. Indexed L1…L6+ (levels past 6 hold the last
  column). Because `P = L/N`, `_seed` re-derives the pitch and start positions from the new `n` for free — no
  separate spacing table. (If you later want *all* river/road lanes to ramp their count, it's just more rows in
  `COUNT_SCHEDULE`.)
- **Second diving group → `divers` is now a list, `submerged` is per-mover.** The single `diver` field became
  `divers: [{ m, phase }]`; `movers[0]` always dives, and from `RAMP.DIVE_2ND_MIN_LEVEL` (3) `movers[1]` joins,
  **offset half a `T_DIVE` cycle** so the two never submerge together. `submerged(frame, mover)` looks the mover
  up in the list (false for non-divers), so `render` and `collision` test any mover uniformly — no `m === diver`
  special-case. The per-lane offset (`index·T_DIVE/2`) still keeps the two turtle *lanes* out of unison, so at L3
  the four diving groups are all staggered.
- **The otter ramps with the board (Zane's ruling).** Its `OTTER_V` (0.8) is scaled by the same `speedFactor` at
  construction (`otter.v`), keeping the documented "faster than every log lane" invariant true at every level —
  at the L11 cap the fastest log (river4) is 0.90 and the otter is 1.60. The alternative (a fixed absolute
  `OTTER_V`) would let river4 logs overtake it from ~L9; ramping was chosen for consistency with §3.3 "the whole
  board accelerates."
- **Level 1 is an exact no-op.** `speedFactor(1) = 1` and every scheduled lane's L1 column equals its base `n`, so
  a level-1 board is byte-identical to the pre-ramp build — the ramp only ever *adds* difficulty above L1.

## Audio impl decisions

*(Phase A — the Layer-1 scaffold. Phase B — music playing: the song data + the sequencer. Phase C — SFX playing: the gameplay effects.)*

- **Two files, one-way dependency — the seam made physical.** The subsystem splits along the boundary it already
  had conceptually: `src/audio/psg.js` (Layer 1, the synth) and `src/audio/sequencer.js` (Layer 2, the driver +
  public API). `sequencer.js` imports `psg.js`, never the reverse, so the boundary is a module boundary, not just
  a comment. `psg.js` imports nothing project-specific; if it ever needs a note number or a tempo, the boundary
  has leaked. The old `src/audio.js` stub moved to `sequencer.js` (game's `import { Audio }` updated).
- **The PSG models the AY as always-on generators gated by gain.** Each of the 3 tone voices is a square
  `OscillatorNode` running continuously into a `GainNode`; `noteOn` / `noteOff` / `pluck` ramp the gain (the AY
  tone generator runs free — volume gates it; cheaper and click-free vs start/stop per note). The noise voice is a
  looping random-sample buffer, gated the same way. `glide(from, to, secs)` schedules the descending "pew".
- **Decoded-param API only — no register model.** Voices speak Hz + gain; the sequencer will hand them
  frequencies (note→freq baked at extract time), never AY periods or registers.
- **One dual-section bench, not two.** `demo/audio_test.html` has a PSG section and a sequencer section, each
  with a status line — the same page grows with the subsystem and exercises the public boundary for real.

*Phase B (music playing):*

- **The extractor scrapes, the sequencer interprets.** `dat_sfx.js` carries the raw arcade data verbatim — the
  four tables + every song's three voice byte-streams — and *all* the format logic (note-set resolution, the
  `2^(ccc−1)` durations, the commands, the off-by-one) lives in one place, `sequencer.js`. So the data file is a
  dumb scrape and the interpretation is testable in isolation.
- **Schedule-ahead on the audio clock, not per-frame polling.** `sequencer.js` walks a stream and schedules its
  note events (`setFreq` / `noteOn` / `noteOff` at computed future times) on the PSG's sample-accurate clock, so
  playback is decoupled from the 60 Hz game loop; `tick()` only appends the theme's next loop when the current
  schedule is nearly spent. A note's seconds = `2^(ccc−1) × tempo / 700`; tempo is song-global (voice A sets it).
- **The off-by-one is a one-line toggle.** `FAITHFUL_PITCH` (default on) reproduces the arcade's semitone-low
  tuning; flip it for the "written" pitches. A per-choice decision left open for a listen-test, not baked in.
- **Music needed no new wiring.** The music `request()` sites (`Play` → `playMusic`; `RoundClear` / `GameOver` →
  `request` + `isPlaying`) were already placed, so dropping in the real sequencer lit up the in-game music for
  free — the remaining `request()` wiring (Phase C) is only the gameplay SFX.

## Deferred

- **Sound — SFX only.** The music is done (Phase B — the engine + `assets/dat_sfx.js`); what remains is
  Phase C, the gameplay SFX (hop / plunk / squash / …), a separate arcade mechanism still to decode + wire.
  Possible later refinements to the music (note articulation, the AY volume curve, the `FAITHFUL_PITCH`
  choice) await a listen-test.
