# CLAUDE.md — prince_of_persia

Guidance for Claude Code in this directory. Read this before changing
anything here; it overrides the repo-root `CLAUDE.md`.

## What this is (SCOPE — read first)

An **animation-engine extraction** and a **playground** for Prince of Persia's
rotoscoped actor — lift the movement (walk, run, jump, turn, crouch, …) out of
the original game and play with it. Starting point: "watch the prince move."

**The one hard limit: don't rebuild the full game.** This is not a 1:1 clone,
not "reimplement Prince of Persia." *Everything else is open.* Whether to add a
mechanic — collision, ledge-climbing, a second actor on screen, sword play, a
room to run around in, a physics twist — is decided by a single question:
**is it fun / interesting to build?** — not by a fixed out-of-scope list. Follow
curiosity; the only thing off the table is turning this into the complete game.

## Source material — two upstream repos, one game's data

We dig into **one** of two public sources:

- **SDLPoP** (`NagyD/SDLPoP`) — the C reverse-engineering of the **DOS**
  version. **This is what we port from.** Readable, named C; both the DAT
  decoder and the animation engine live here. Clone locally for reference
  (per-PC, not committed): `git clone https://github.com/NagyD/SDLPoP`.
  Key files:
  - `src/seg009.c` — DAT container + image decode (ported in `tools/extract_masks.py`).
  - `src/seg006.c` — `seqtbl` (animation bytecode) + `play_seq` (its interpreter)
    + `frame_table_kid` (per-frame draw offsets). **This is the next port target.**
- **`jmechner/Prince-of-Persia-Apple-II`** — the authentic **Apple II** original
  (6502). Read-for-reverence only. The sequence-system *design* is identical, but
  SDLPoP is the readable version; the only thing unique here is the original
  monochrome rotoscope frames (unused — DOS sprites are easier and canonical).

**Why SDLPoP, not the Apple II source:** in PoP, animation *is* movement — the
`seqtbl` bytecode drives both which frame shows *and* how far the actor shifts
each tick. SDLPoP has that as readable C; the Apple II source is 6502 + arcane
hi-res graphics.

**Game data (per-PC, NOT committed):** the original DOS PoP 1.0 files are at
`C:\Z_Temp\POP\GAME\` on this PC (path differs per machine — same convention as
lunar_lander's ROMs; the other PC needs its own copy to re-extract). We use only
the character DATs: `KID.DAT` (the prince), later `GUARD.DAT` / `SHADOW.DAT` /
`SKEL.DAT` / `FAT.DAT` / `VIZIER.DAT`. **Raw DATs are Ubisoft's IP — do not commit
them.** The derived silhouette-mask JSON *is* committed (heavily reduced 1-bit
shapes, consistent with the repo's other committed sprite assets), so the demo
runs on a fresh clone without the DAT. Attribution + disclaimer live in
**`NOTICE`**: Prince of Persia © Ubisoft (unofficial / non-commercial /
educational), and `extract_masks.py` is a **GPLv3** port of SDLPoP's `seg009.c`.
This mirrors SDLPoP's own posture — it bundles the full extracted assets
alongside GPLv3 code (relying on Ubisoft's long tolerance of PoP1 preservation,
not a formal license); our silhouettes are a heavier reduction still.

## Architecture decisions (settled — don't re-litigate)

- **Routine-level translation from SDLPoP**, citing source lines
  (e.g. `// seg009.c:840`) — the repo's address-citation convention, with
  SDLPoP labels standing in for the usual `Lxxxx`.
- **Black silhouettes = 1-bit masks.** We extract the frame *shape* only
  (palette index 0 = transparent, anything else = opaque), so the palette
  (`PRINCE.DAT`) is never needed. This is a canonical PoP look, not a
  compromise: the **Shadow** (the prince's doppelgänger) is literally a black
  silhouette of these same frames — `decode_image` even force-blacks colour 0
  "for … the shadow" (`seg009.c:876`).
- **Browser rasterizes; no image codec.** The extractor emits masks as *data*
  (base64 1-bpp in JSON); the browser paints them via `putImageData`. No PNG
  writer, no bin-packer. Colour is a **runtime knob** (tint at draw time in
  `masksheet.js`), so black is the default but any colour is free.
- **One JSON per DAT.** `KID.DAT → gfx/kid_masks.json`, `GUARD.DAT →
  gfx/guard_masks.json`, … The source keeps characters in separate files; we
  mirror that boundary. Not one merged file; not the kid split further (the
  `seqtbl` sequences reference frames across the whole kid set).

## Layout (follows lunar_lander)

```
prince_of_persia/
├─ index.html          # THE PLAYER (the toy) — boots the engine. NOT YET BUILT (reserved).
├─ masksheet.js        # shared module: load + rasterize 1-bpp mask sheets
├─ demos/              # one <name>.html + <name>.js per demo (lunar_lander pattern)
│  └─ actor_frames.html / .js   # dev inspector: contact sheet of every KID.DAT silhouette
├─ gfx/                # extracted assets, flat: <datname>_masks.json (no per-char subdir)
│  └─ kid_masks.json
└─ tools/
   └─ extract_masks.py # generic DAT → masks JSON (faithful seg009.c port)
```

- `index.html` at root = the player (like lunar_lander's game). **Reserved** until
  the engine exists; the sprite inspector deliberately lives under `demos/`.
- `demos/` = validated building blocks (repo convention). Add a `demos/index.html`
  hub once there are ≥2 demos.
- Modules flat at the project root; demos import shared modules via `../masksheet.js`.
- ES6 modules, no build step. Served from the repo root; launch.json config
  `prince_of_persia` serves this dir on **port 8086**.

## Build + run

```bash
# extract a character DAT -> gfx/<name>_masks.json (output auto-named from the DAT):
python prince_of_persia/tools/extract_masks.py C:/Z_Temp/POP/GAME/KID.DAT

# serve from the repo root, then:
#   /prince_of_persia/demos/actor_frames.html   the sprite inspector (built)
#   /prince_of_persia/                            the player (once built)
python -m http.server -b 127.0.0.1 8080
```

`gfx/*_masks.json` are **generated** — edit `extract_masks.py`, not the JSON.

## The decoder (extract_masks.py) — format reference

Faithful pure-Python port of SDLPoP `seg009.c`. DAT container: 6-byte header
(`u32 index_offset, u16 index_size`) + index (`u16 count`, then `{u16 id,
u32 offset, u16 size}`); each resource = **1 checksum byte + data**. Image
resource: `u16 height, u16 width, u16 flags`; `depth=((flags>>12)&7)+1`,
`cmeth=(flags>>8)&0xF` — 0 raw / 1 RLE-LR / 2 RLE-UD / 3 LZG-LR / 4 LZG-UD. All
four decompressors + `conv_to_8bpp` ported verbatim; we stop at the 8-bpp index
buffer and threshold to a 1-bit mask. The single non-image resource (the `shpl`
palette — id 400 in `KID.DAT`) is auto-skipped by a dims sanity check.

## Sprite registration (drawing the character)

Each frame is positioned by a **registration point** (`obj_x`), *not* by its
bounding box. The KID frames are **right-aligned with varying left padding** —
that padding is **not noise, it IS the registration**: draw the image's left edge
at `obj_x` and the character lands correctly. (`obj_x = (char_dx_forward(cur_frame.dx)
<< 1) - 116`, `seg008.c:1736`; per-frame `dx/dy` come from `frame_table_kid`.)
KID sprites natively face **LEFT**.

- **Flipping to the other facing mirrors about the registration point**, per PoP's
  `draw_mid` (`seg008.c:1022`: `xpos -= w; hflip`). Facing left = draw native at
  the reg point (box `[x, x+w]`); facing right = `translate(x); scale(-1)` (box
  `[x-w, x]`).
- **Do NOT mirror about the image-box centre** (shifts the figure by the padding
  each frame) **nor the content centre** (`MaskSprite.cx` — *amplifies* the
  per-frame content-centre swing ~3× and jitters the gait). Both were tried and
  rejected; the correctness test is that the **feet are mirror-symmetric about the
  reg point** (pixel-measured).
- `demos/motion.js`'s reg-point model applies the **per-frame `frame_table_kid` `dx`/`dy`
  faithfully** (`load_frame_to_obj`, seg008.c:1736-1737), as **draw-time offsets** on top of the
  position:
  - **`frame.dy`** shifts the feet baseline: `feetY = GROUND_Y + (Char.y + frame.dy)*scale`. Note
    `obj_y` is the sprite **bottom** in source (`add_midtable` blits at `obj_y - h + 1`,
    seg008.c:863), which our feet-pin (`content.maxy`) matches. `frame.dy ≠ 0` for **exactly one**
    used frame — 185 (hard-land dead splat, `dy = 7`); it seats the corpse *below* the feet line
    just as the source does. The source's floor tile has depth so that reads as "lying on the
    ground"; our thin ground line doesn't, so here the corpse sinks below the line (and clips at the
    canvas edge) — faithful, if odd for this demo (accepted 2026-07-04, user confirmed vs a DOS
    snapshot). Every other used frame is `dy = 0`.
  - **`frame.dx`** shifts the reg point in the facing direction (`char_dx_forward`):
    `regX = actorX + (facing? -dx : +dx)*2*scale`, then the flip mirrors about `regX`.
    `frame.dx ≠ 0` on run/startrun accel 1–4 (1/1/3/4), turn 50–52 (4/3/1), standup 117–118 (2/2),
    dead 185 (4); all other used frames (walk `step11`, run-cycle loop 7–14, jump arcs, `freefall`,
    landings) are `dx = 0`.
  - **These are per-frame DRAW offsets, never accumulated** — exactly as the source (seqtbl `dx`
    modifies `Char.x`; `frame.dx` feeds only `obj_x`, never `Char.x`). So `actorX` still accumulates
    only the seqtbl `dx` delta (`actorX += ΔCharx·2·scale`) and the fixed-view **wall-pacing is
    untouched**; `frame.dx` is just a render nudge. This is why applying it needed no camera/room work.
  - **The still-deferred piece is the horizontal *position* model, not these offsets.** Our `actorX`
    is a delta-accumulator over an invented wide 640px flat strip (~2 rooms) with wall-bounce. PoP is
    room-by-room (**no scroll**): on a boundary it does `drawn_room = next_room; redraw_screen(1)`
    (`draw_game_frame`, seg000.c:918), `Char.x` is a **bounded byte** (`types.h:304`, room-relative;
    a room = `SCREEN_TILECOUNTX·TILE_SIZEX = 10·14 = 140` x-units), and a cross-boundary actor is
    drawn by offsetting x one room-width (`xpos_in_drawn_room`, seg004.c:254). So the faithful `obj_x`
    is *bounded* — no "runs off to infinity". Modelling x room-relative + bounded (and room-swap at the
    edge) is **deferred to the `index.html` player work**.

## Status / roadmap

- **[done] Sprite extraction.** `KID.DAT` → 219 silhouette frames (ids 401–619)
  in `gfx/kid_masks.json`. `masksheet.js` loads + rasterizes; `demos/actor_frames.html`
  is the inspector.
- **[done] Motion — the `play_seq` engine.** Split by responsibility across three
  files: **`seqbuilder.js`** (logic) — the opcode set + a `SeqBuilder` assembler
  mirroring `seqtbl.c`'s `act/dx/jmp` macros, PoP-agnostic; **`seqtbl.js`** (data) —
  the run/startrun/stand table transcribed via that builder into `SEQTBL` bytes +
  `SEQ_OFFSETS` (the file that grows as moves are added); **`playseq.js`** (logic) —
  a faithful `play_seq` interpreter (`seg006.c:570`) + the Character API. Dependency
  arrow is one-way: `seqbuilder → seqtbl → playseq` (assemble → data → run). Plus
  `res/frame_table_kid.js` (via `tools/extract_frametable.py`); `demos/motion.html`
  is a **move sandbox** — a `<select>` picks stand / crouch / walk / run / turn; each
  `startSeq`s a sequence in `seqtbl.js` and the engine's own `jmp`s chain the transitions
  (startrun→runcyc, runturn→runcyc7, step/turn→stand). The driver only decides *when* to
  fire a wall-turn (the `control_kid` stand-in): **run** reverses with the faithful
  `runturn` skid; **walk** (careful step `step11`) does a standing `turn` at the wall;
  poses hold in place. Symmetric both facings, fixed [0,640] view. See **Sprite
  registration** above for facing/flip and the reg-point simplification.
- **[done] Jumps + fall (folded into `motion.html`).** All added to the same move
  `<select>` — no separate demo. **Jumps** (`standjump` seqtbl.c:381, `runjump` :402) are
  self-contained rotoscoped arcs: their `dy` opcodes lift+drop `Char.y` (net ~0), so a
  *successful* jump needs **no gravity** — just the `Char.y` vertical (verified: standjump
  dips `y=-6`, runjump apexes `y=-14`, matching the source `dy`). **Gravity** is the new
  mechanism, and it lives only in the **fall**: `playseq.js` gained `fallAccel`/`fallSpeed`
  (`seg006.c:0577`/`05AE`, `fall_y += 3` cap 33, `y += fall_y`), run every tick in the
  faithful order `playSeq → fallAccel → fallSpeed` (`seg000.c:1205-1207`) but gated to
  `action == in_freefall`, so ground moves are untouched. The **fall** pick auto-cycles
  three drops → soft / medium / hard by impact speed (`seg005.c:174`: `fall_y` 21/27/33 →
  `softland`/`medland`/`hardland`), starting the actor at **negative `Char.y`** (above the
  screen) so any drop fits the fixed 640×300 view — you see the *end* of the fall + the
  landing (`stepfall`/`stepfloat` entry frames are out of scope; the actor starts directly
  in `freefall`). Ground line at **y=280** (fall room above + 20px below so the dead splat's
  `frame.dy=7` sink stays visible within the 300px canvas). New sequences in
  `seqtbl.js`: `freefall`, `softland`, `medland`, `hardland`, `standup`, `standjump`,
  `runjump` (each cited). The per-frame `frame_table` `dx`/`dy` are now **applied faithfully** as
  draw offsets (`obj_x`/`obj_y`, seg008.c:1736-1737) on top of the position — nonzero on only a
  handful of frames (dead splat 185 `dy=7`; `dx` on run-accel 1–4 / turn 50–52 / standup 117–118 /
  185). The dead splat therefore seats *below* the ground line as in the source (our thin line lets
  it sink/clip — accepted). These offsets are per-frame and never accumulated, so wall-pacing is
  untouched; the horizontal *position* stays a seqtbl-`dx` delta-accumulator (the room-relative
  bounded-`obj_x` model is the deferred `index.html` piece). See **Sprite registration** for the
  exact `dx≠0`/`dy≠0` frame list.
- **[later] The player (`index.html`).** Drive the actor with keyboard/gamepad via the
  input→transition layer — **scaffolded in `control.js`** (a port of `control_kid`,
  `seg005.c`). The model (no separate FSM — the seqtbl sequences ARE the states; this
  layer only picks the next sequence at decision frames): input is made **facing-relative**
  (absolute L/R + `ch.direction` → forward/backward, so *reverse* = BACKWARD), dispatched by
  **current frame** (`seg005.c:262`). The two signature behaviours live in `controlRunning`
  (`seg005.c:588`): **frame-gated stop** (release only skids at run frame 7/11 → `runstop`)
  and **reverse** (BACKWARD → `runturn`). `control.js` is a reserved, not-yet-wired scaffold
  (handlers stubbed with citations) until this step; wiring it needs a keyboard/gamepad read
  layer + `runstop` transcribed into `seqtbl.js`.
- **[later] Enemies.** `GUARD.DAT` / `SHADOW.DAT` / … → `demos/enemy_frames.html`,
  same pipeline (`extract_masks.py <DAT>` is already generic).

## UI conventions — HUD / on-screen readouts

> **Promote to the repo-root `CLAUDE.md` on merge** (same as the lessons below).
> This is a general UI rule, not PoP-specific — it applies to every game's HUD;
> it just stays local until the project lands so it rides in with the merge.

**Live readouts use fixed-width fields — pad each value to its domain's maximum
width so the text never bounces.** A HUD that updates every frame shifts every
field to the right of any value whose *digit / character count* changes
(`frame=7` → `frame=11`, `dir=left` → `dir=right`). That horizontal jitter is
noisy and hard to read. A monospace font alone does **not** fix it — `1` and
`11` are still one cell vs two; the *field width itself* must be held constant.

The rule, in three parts:

1. **Monospace + `white-space: pre`** on the container, so the pad spaces render
   at a fixed cell width (a proportional font defeats padding).
2. **Pad every variable field to the max width its value can reach** — numbers
   right-aligned (`padStart`), state words left-aligned (`padEnd`). Size to the
   domain maximum: a coordinate bounded `0..640` → 3 digits; a `left`/`right`
   state → 5. Constant fields (e.g. `[bounds 0..640]`) need no padding.
3. **The test is one constant string length.** Sample the rendered readout over
   many ticks across all states; if the set of distinct lengths is > 1, a field
   is still bouncing. (Measure the string, not a screenshot — same discipline as
   the pixel-measure lesson below.)

Reference implementation: `demos/motion.js` — the `padN` / `padW` helpers and the
HUD line that uses them.

## Lessons learned — debugging the run cycle

> **Promote this list to the repo-root `CLAUDE.md` once `prince_of_persia` is
> completed and merged to `main`.** These generalise well past this project (they
> belong with the retro-port lessons at the root), but stay local until the
> project lands so they ride in with its merge.

Getting the run cycle right — facing → anchor → step distance — took several wrong
turns. Each lesson was paid for in bugs:

1. **Source data that looks "weird" is usually load-bearing.** The frames' asymmetric
   padding looked like sloppiness; it was the per-frame registration. Suspect
   *meaning* before normalising it away. (= the root rule *"deviations are
   load-bearing"*, applied to art assets.)
2. **In a faithful port, find the transform in the source — don't invent it.** The
   flip's mirror axis was guessed twice (box centre, content centre) before reading
   `draw_mid`, where PoP's exact rule (`xpos -= w; hflip`) was waiting. The draw/blit
   routine — flip, clip included — is part of the mechanism; read it, don't reconstruct it.
3. **Static correctness ≠ dynamic correctness.** A fix that passes a single-frame
   symmetry test can still be wrong in motion. When the symptom is animation, measure
   the animation over time (the failing feature — the feet), not a static proxy.
4. **Measure canvas pixels, not screenshots.** The preview screenshot rasterises at a
   non-1:1 scale — it invented an offset that wasn't there and could equally hide a
   real one. Every correct conclusion came from `getImageData` via `preview_eval`.
   Eyeballing precise position / facing / symmetry is actively misleading.
5. **Suspect your own last fix; trust the observer's "this looks off."** The step
   asymmetry was *caused by* the previous fix — a new symptom right after a change
   makes the change the prime suspect. When the user reports a mismatch and your
   reasoning "proves" it's fine, **measure** — the observer watching the real output
   beats reasoning from assumptions.

## Commit style

Repo-wide convention (root `CLAUDE.md` → "Commit conventions"): a one-line title
+ the `Co-Authored-By` trailer when a doc (this file, a research note) carries the
detail; subject prefixed `[prince_of_persia]`.
