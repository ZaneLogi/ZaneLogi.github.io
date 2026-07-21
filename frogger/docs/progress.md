# Frogger — progress

Living build tracker. The design lives in `architecture.md` (the self-contained spec);
this file logs how the implementation gets there — steps done, what's next, and any
impl-time decisions or deferrals. The spec never points back here, so it stays
self-contained; progress.md is free to reference the spec's sections.

## Status

**Step 0 — module scaffold: DONE.** The full `src/` module structure per §9, booting
into Attract. Verified in the browser: boots clean (no console errors), Attract renders
the title, and Space transitions Attract → Play — the mode machine runs end to end.

Next up: the **Play gameplay**, built in the §7 tick order (the Frog hop first).

## Steps (plan is provisional — adjusts as we build)

| # | What | Refs | Status |
|---|---|---|---|
| — | Design — `architecture.md`, the self-contained spec | — | done |
| 0 | Module scaffold — `main.js` + `src/*` + `modes/*`, boots into Attract | §9, §6 | **done** |
| 1 | Frog — hop (8-frame slide), facing, input-lock; render the frog + the static background bands + the row grid; no moving objects / collision yet | §6, §7, §4 | next |
| 2 | Lanes + movers — conveyors, wrap, rendering | §3.2 | |
| 3 | Collision — safe / ride / drown / squash per row | §7.3 | |
| 4 | Homes — bays, landing test, bonus insect / croc-head | §3.4, §6 | |
| 5 | Timer + Score + HUD wiring (lives, timer bar, level) | §4.1, §6 | |
| 6 | Timed events — dives, croc mouth, bay item, lady-frog, otter | §3.4 | |
| 7 | Death + RoundClear presentation (explosion, laugh sweep) | §3.5, §10 | |
| 8 | Level ramp | §3.3 | |

## What's real vs stubbed (after step 0)

- **Real / running:** the boot pump (`main.js`), `Game` + the mode machine
  (`Mode`/`Flow`/5 modes), `Renderer` (drawSprite + tinted monospace drawText),
  `Sprites` (atlas load), `Input` (edge-triggered), `constants.js` (the real §3/§4/§6
  design data), `Score`/`Timer` logic, `Attract`, and the mode transition/timing.
- **Stubbed** (class shell + documented §6 API + `TODO(impl)`): `Frog`, `Mover`,
  `Lane`, `Playfield`, `Collision`, `Homes`, and the gameplay bodies of `Play`.

## Deferred

- **Sound** — the `Audio` service is a no-op placeholder (§5.2). The arcade
  AY-3-8910 engine + `assets/dat_sfx.js` are built later; until then RoundClear /
  GameOver fall back to their fixed §10 durations.
