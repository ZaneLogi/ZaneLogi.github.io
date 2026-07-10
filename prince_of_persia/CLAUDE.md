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
- **`collision_kernel.js` is a ROUTINE-FOR-ROUTINE mirror of the source over its
  own C-style globals — keep it that way.** Every function in that file is a named
  port of ONE SDLPoP routine with its `// segNNN.c:line` citation; the module-level
  `let`s ARE the C globals. **Do not add clone-only helpers or new logic to the
  kernel** — a quantity the source computes inline, or a decision a control/render
  routine needs, belongs in `player.js` / `collision.js`, never in the kernel.
  Adding `export` to expose an existing routine/global is fine (visibility only);
  inventing a routine with no `segNNN.c` counterpart is not. A kernel function
  without a source citation is a red flag. *(This is exactly the trap that was
  caught in review 2026-07-10 — a stray `gateBlocksChar` helper; the fix moved to
  `player.js`. The file's own header carries the same invariant.)*
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
├─ index.html          # THE PLAYER (the toy) — the prince in level 1 with real tile collision.
├─ player.js           # the player: per-tick engine order + render + keyboard (boots the engine)
├─ masksheet.js        # shared module: load + rasterize 1-bpp mask sheets
├─ playseq.js/seqtbl.js/seqbuilder.js   # animation engine (play_seq interpreter + sequence data)
├─ collision.js        # tile-collision substrate: getTile + floor/wall predicates + coord helpers
├─ trob.js             # transient-object animator (ported seg007.c) — loose floors only, so far
├─ control.js          # input→transition layer (ported control_kid) — wired by the player
├─ demos/              # one <name>.html + <name>.js per demo (lunar_lander pattern)
│  ├─ actor_frames.html / .js   # dev inspector: contact sheet of every KID.DAT silhouette
│  ├─ motion.html / .js          # move sandbox (stand/walk/run/turn/jump/fall)
│  └─ blockmap.html / .js         # level-1 solid-geometry map (imports collision.js predicates)
├─ res/                # generated JS data: frame_table_kid.js, level1.js
├─ gfx/                # extracted assets, flat: <datname>_masks.json (no per-char subdir)
│  └─ kid_masks.json
└─ tools/              # extract_masks.py, extract_frametable.py, extract_level.py (seg009.c ports)
```

- `index.html` at root = the player (like lunar_lander's game) — **built** (see the roadmap
  entry); the sprite inspector + building-block demos live under `demos/`.
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
    `regX = actorX + (facing? -dx : +dx)*2*scale`, then the flip mirrors about `regX`. *(This is the
    `demos/motion.js` sandbox, which stays at the `×2` / 28-px scale. The `index.html` **player** uses
    the same reg-point model but applies `frame.dx` at `·sx` with the faithful `sx = 32/14` — 32 px/tile;
    see the player roadmap entry.)*
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
- **[done] Level decode + collision block map.** The world half of the toy: give the actor a
  real room. **`tools/extract_level.py`** decodes a level from `LEVELS.DAT` into a JS data
  module (`res/level<N>.js`; level 1 committed as `res/level1.js`). Level N is resource
  **2000+N** (`load_level`, seg000.c:1152) stored as a **verbatim 2305-byte `level_type`**
  (types.h:228, `sizeof`==2305 compile-assert) — the **same DAT container as `extract_masks.py`**,
  but the payload is a raw struct so there is **no image decode**. We emit only the fields the
  engine actually reads and drop the rest — **collision, not graphics** (the map is the goal;
  art is explicitly out of scope):
  - **kept:** `fg` tile **TYPE** (`byte & 0x1F`, seg006.c:37) · `bg` modifier byte · `roomlinks`
    `{left,right,up,down}` (0 = void → reads as `tiles_20_wall`, seg006.c:40) · `used_rooms` ·
    `start{room,pos,dir}` · **doorLinks** (button→gate chain, seg007.c:720-746; trimmed to the
    indices reachable from a button — the engine only ever indexes via a button's `bg` modifier,
    so the 256-entry file tail is never read) · **guards** `{tile,dir,skill,color}` for rooms with
    `guards_tile < 30` (seg002.c / pos_guards seg003.c:661).
  - **dropped:** `roomxs/roomys` (Mechner editor grid) + `fill_*` (unused) · the **`fg` high 3
    bits** (engine masks `&0x1F` *everywhere*, incl. drawing seg008.c:246 — inert) · `guards_x` /
    `guards_seq_*` (`0xFF` in the file; the engine derives them at spawn).
  - **format decisions (settled with user):** a **`.js` module** (loads natively via `import`, no
    fetch/parse; mirrors `res/frame_table_kid.js`) holding an **expanded readable object** — *not*
    base64. Base64 is right for the masks (bulk binary pixel data) and wrong here (a ~1.5 KB
    structured table you want to read/diff). The generator emits `// room N` index comments and is
    **generic** (arg = level number). Raw `LEVELS.DAT` stays `.gitignore`d (Ubisoft IP); the derived
    `level1.js` is committed like the masks; `extract_level.py` is another **GPLv3** SDLPoP
    derivative (see `NOTICE`).
  - **`demos/blockmap.{html,js}`** renders the **solid geometry only** from `level1.js`, via the two
    ported collision predicates: `wall_type==4` (seg006.c:1626) → **full block**, `tile_is_floor`
    (seg006.c:951) → **bottom ledge** (you stand *on* floors, are blocked *by* walls), else open.
    Interactive tiles (gate/exit/button/potion/spike) get semantic accent marks from the
    `tiles_N_*` enum; start + guards flagged. Rooms are laid out by **flood-filling `roomlinks`**
    from the start room. Level 1 flood-fills to a clean **9×3 grid of 21 rooms**; the 3 unreachable
    ones (**13/18/24** — one-way links, nobody links back) are **map-editor leftovers**, kept
    visible as evidence and stacked below (13↔18 leftmost column, orphan 24 two columns over).
    **Colors are designed-by-eye** (dark UI + warm/cool floor-vs-wall split + conventional
    accents), not sampled from the PoP palette — that convergence is intuition, not a lookup.
    **User verified the map against a real level-1 playthrough** — which validates *both* the
    byte-exact decode *and* the faithful predicate port (the map traces the walkable geometry
    because it computes the engine's own collision from the engine's own data + functions).
  - **feeds next:** this is the collision substrate for the deferred **room-relative bounded
    `obj_x`** model (below) — the actor-in-a-room experiment. The full tile-collision mechanism
    (position→tile mapping, `get_tile` room-crossing, floor/wall predicates, the sub-tile bump
    system, and the room-relative `Char.x` model) is written up in **`docs/research_collision.md`**
    — read that first when building the actor-in-a-room step.
- **[done] The player (`index.html`) — the actor in a room, real tile collision.** The
  prince dropped into level 1 with PoP's **room-relative bounded `Char.x` model**: he stands
  on ledges, is blocked by walls, and falls when unsupported — driven by a ported collision
  substrate + the animation engine. The world half of the toy, now playable.
  - **`collision.js`** (new, project root) — the ported substrate, PoP-agnostic over a
    decoded level: `tile_is_floor`/`wall_type` (moved from `blockmap.js` — single source of
    truth, `blockmap.js` now imports them), **`getTile(level,room,col,row)`** with
    `find_room_of_tile` link-crossing + `0 → wall`, and the coord helpers (`X_BUMP`, `Y_LAND`,
    `standX`, `tileDivModM7`, `distanceToEdge`, `yToRowMod4`, the char-relative tile
    accessors). Every collision query goes through it.
  - **`player.js`** (new) — the faithful `play_kid_frame` per-tick order (`seg000.c:1192`):
    `controlKid` → `playSeq` → `fallAccel`/`fallSpeed` → `determineCol` → `crossRooms` →
    `checkAction`. `checkAction` (`seg006.c:909`) is the hub: freefall → `do_fall` (land
    soft/med/hard, else `inc_curr_row`), grounded → `check_on_floor` (`FRAME_NEEDS_FLOOR` +
    no floor → `start_fall`). **Level-1 opens with the real falling entry** (`do_startpos`
    → `seq_7_fall`; start tile (0,0) is empty by design — he drops one row and soft-lands on
    the torch-floor). Room crossing = `leave_room` trigger + `goto_other_room` (`±140`/`±189`
    rebase + `drawn_room` swap). Rendering reuses the motion-sandbox registration, on a **384×200
    frame at integer zoom** (default **1×**): **`sx = 32/14` → 32 px/tile** — the faithful DOS scale
    (`obj_x = 2·internal` then `calc_screen_x_coord ×320/280`, seg008.c:1736/1850; `types.h:1427`
    "a tile is 32 pixels wide in screen space") — and `sy = 1` (obj_y 1:1, `TILE_SIZEY = 63`). The
    room is the full **320 px** (10·32) width; a **neighbour-room SLIVER on all four sides** (`drawRoom`
    draws cols −1..10 AND rows −1..3 via `getTile`'s link-hop; a void link → solid cap), darkened — so an
    across-the-edge wall/portcullis/passage is visible. Side margins = one tile (32 px); **top/bottom =
    `MARGIN_Y` (24 px)** — the **row −1** margin shows the ABOVE room's row 2 (the source's own
    `draw_tile_aboveroom`, seg008.c:148, which is why in the DOS game you see the bottom of the room
    above), the **row 3** margin the BELOW room's row 0 (a symmetric clone extension — the source draws
    only the above one), corners = the diagonal rooms. Each sliver row is drawn **behind** the active
    room and **clipped to its own margin**, so the active room's row-2 floor slab (the ledge) stays
    bright on top of the below sliver (the bottom dim starts below the ledge). The **above** sliver's
    clip extends `LEDGE` px past `roomTop` so its row-2 floor slabs — the **ceiling ledges the prince
    bonks on a jump-up** — are drawn too (else he'd hit an invisible blocker; its walls stay dimmed in
    the margin, the ledge reads bright as the surface he collides with). Canvas = 32+320+32 = 384
    **× (24+189+24 = 237)**. (Spikes, gate/portcullis, buttons, and the sword are drawn as labelled
    tiles in `drawRoom` — see their roadmap entries / the code.)
    **(Was `sx = 2` → 28 px/tile / 280 px room / 20 px margins; corrected 2026-07-07 — the 28 px omitted
    the `×320/280` stretch, so the room was 7/8-compressed and the sprite ~8/7 too wide. Top/bottom
    slivers added 2026-07-10. Vertical/collision were always right.)** Coord pipeline:
    `docs/research_collision.md §2.1`.
  - **`control.js`** — now **wired** (was a scaffold): `control_standing` (`forward_pressed`
    → run, blocked at a wall; Shift → `safe_step`; back → `turn`), `control_running`
    (frame-gated `runstop` on release, `runturn` on reverse), `control_crouched` (stand up —
    recovers the falling entry). Input is made **facing-relative** upstream (absolute L/R +
    `ch.direction` → FWD/BACK). Keys: **←/→ run · Shift+dir careful step · ↑ jump up / grab &
    climb a ledge · release = stop · R restart**. `runstop` (`seq_13_stop_run`) transcribed into
    `seqtbl.js`.
  - **Deviations (documented in `docs/research_collision.md §8`):** wall-block detection is a
    sub-tile `Char.x`-clamp to the wall face (`Char.x` is the leading edge, so he walks up to a
    wall in either direction, no penetration) — but the collision *box* and the bump *animation*
    are now modelled (see the **[done] Wall bump** roadmap entry); the remaining substitute is the
    per-column buffer *scan* (§5b). `safe_step`-to-edge is now implemented (Shift-step + post-bump
    land flush; stop-at-a-ledge — see the **[done] Wall bump** entry); gate *collision* + the
    climb-into-a-closed-gate are now modelled (see the **[done] Gate collision** entry), while gate
    open/close (animate/button) and spikes stay out of scope. `index.html#debug` exposes a console handle
    (`POP.step`/`place`/`restart`, plus `tile`/`modif`/`trobs`) for testing.
  - **Verified** vs SDLPoP semantics by single-stepping: falling entry (fall→soft-land→stand),
    run/runstop/runturn/turn/careful-step, wall-block both directions (stable, no jitter/
    creep/fall-through), ledge-fall→land, and multi-room horizontal crossing (2→3→9 with
    `drawn_room` swap + `Char.x` rebase). **Open UX call:** the black-silhouette default tint
    is low-contrast on the dark room in open areas (adjustable via the tint control).
- **[done] Loose floors — the first *trob* (transient object).** A loose tile (type 11) you
  stand on shakes for `loose_floor_delay = 11` frames, then collapses to empty and drops you
  through — via the existing fall engine, no new fall code. **`trob.js`** (new) is a minimal,
  loose-only slice of SDLPoP's whole trob system (`seg007.c`): `makeLooseFall` (arm) +
  `processTrobs` (tick → `remove_loose`). **`player.js`** wires it faithfully to the source
  frame order — `processTrobs` at the top of the tick (like `process_trobs` at the top of
  `play_frame`), `checkPress` after `checkAction` (the trigger: a grounded actor on a loose tile
  → `make_loose_fall`). The collapse countdown is the tile's own `bg` byte (`curr_room_modif`),
  so the player mutates a **`structuredClone` of the level** and a restart re-clones it (the
  shared `LEVEL1` const is never touched). Level-1's loose tile (room 1, col 6, row 2) drops him
  **through the room boundary** into room 2 — a multi-room fall. **Deferred (agreed):** the
  falling-debris chunk (`add_mob`) and the shake visual (`loose_shake`). Full mechanism +
  verification in `docs/research_collision.md §9`.
- **[done] Wall bump — §5b, the box + recoil animation.** A run/walk into a wall now plays the
  faithful **recoil** (`seq_47_bump`: skid back `dx(-4)` + settle) instead of a dead stop, on top
  of a **collision box** (`setCharCollision`, port of `seg006.c:1012`). `checkBumped` replaces
  `clampToWall`: the same `Char.x`-clamp *detects* the wall hit, then the ported
  `bumped`/`bumped_floor`/`bumped_fall` dispatch (`seg004.c:266/311/298) picks the sequence —
  `seq_47_bump` (grounded, verified) / `seq_45_bumpfall` (over a gap, bytes-verified) /
  `seq_46_hardbump` (jump/fall-onset, dormant until jumps). **The substitute is only the per-column
  collision-buffer *scan*** — what that defers (multi-row + trailing-edge/knockback bumps) and where
  a bug would surface is written up durably in `docs/research_collision.md §5b`. (Correction recorded
  there: those buffers are wall-collision only; char-vs-char is the separate `bump_into_opponent`/
  `char_opp_dist`.) **Follow-on — `safe_step`-to-edge (also §5b):** the 14 `step1..step14` sequences
  (seqtbl.c) + `getEdgeDistance` (port of `get_edge_distance`) + `safe_step` wired through
  `control.js` replace the old `step11`/`blockedForward` stand-ins — so Shift-step and the post-bump
  forward land the char *flush* at a wall (`step<gap>`), and a Shift-step toward a **ledge** stops at
  the brink and then plays **`testfoot`** (`seq_44_step_on_edge` — the "peer over + bounce back",
  gated once by `Char.repeat`; a clone `ch.testing` flag makes the lean skip `checkBumped`/
  `checkOnFloor` so it can't fall/bump). `getEdgeDistance` decides on the tile *directly in front*
  (not the leading edge) — fixing two bugs: a wall across an empty tile walking him off a ledge, and
  a wall across a room boundary being missed (which had falsely *blocked* a left-facing char at a
  room edge). Forward without Shift still runs off a ledge. (Render tweak: the neighbour-room
  **slivers** in the side margins are dimmed with a translucent wash so they read as adjacent rooms.)
- **[done] Vertical jump-up + climb.** Pressing **Up** jumps straight up; a ledge within reach
  above is **grabbed** (hang), and Up again **climbs onto** it — the first player-controlled move
  *between* rows. This is the grab/hang/climb subsystem of `control_kid`, ported from `seg005.c`:
  `up_pressed` → `check_jump_up` (`seg005.c:693`) picks grab-front-above / grab-straight-above /
  plain-jump-up via `can_grab` (`seg006.c:1606` → `collision.js canGrab`); `control_hanging`
  (`seg005.c:791`) then climbs (Up → `climbup`/seq_10), hangs against a wall (Shift → `hangstraight`),
  or lets go (`hangdrop`/`hangfall`). **No new engine mechanism was needed** — `climbup`'s
  `dx(5) dy(-63) SEQ_UP` moves him up exactly one row using opcodes `play_seq` already ran; the hang
  render is the frame-table draw-offset dy; `check_action` already no-ops for the hang actions. New
  sequences transcribed in `seqtbl.js` (jumpup / highjump / hangdrop / jumphangMed·Long·backhang /
  hang / hangstraight / climbup / hangfall); `seqbuilder.js` gained `up()`/`down()`/`knockUp()`;
  `collision.js` gained `getTileModif` + the row-above accessors + `canGrab`; `player.js` the
  jump-up/grab/hang logic (through the `world` object) + a `grab_timer` countdown. Full port map +
  verification in `docs/research_collision.md §10`. **Deferred (each reuses this hang machinery):**
  grab-a-ledge-while-falling (Shift, sets `grab_timer`) and climb-down (Down → `climbdown`/seq_68).
- **[done] Standing (horizontal) jump.** ↑+forward from a standstill → `standing_jump` (seg005.c:687)
  → `seq_3_standing_jump` (the `standjump` sequence already existed; this **wired the three control
  paths** that call it — `control_standing` up+forward branch, `control_startrun`, `control_jumpup`; +
  the `standingJump` helper sets `control_forward = IGNORE`). A ~2.8-tile forward hop that clears a
  1-tile gap **only from near its edge** — faithful: leap frames 19–25 don't need floor, but frame 26
  does (`FRAME_NEEDS_FLOOR`) and it checks the tile under the lagging **weight point**, so a takeoff too
  far back drops into the gap (verified vs the source frame table: flat hop lands +2.8 tiles; edge
  takeoff clears a 1-tile pit; col-2→col-4-pit falls). (Running jump is now wired too — see the
  **Traversal gaps** entry below.)
- **[done] Position/room substrate — faithful (W1+W1b+W2+W3).** A ground-up alignment of the
  position/edge pipeline to SDLPoP, prompted by cross-room climbing (grab a ledge in the next room →
  climb → *fell*). The whole `docs/research_*.md` set (frame_loop / position_room /
  collision_detection / actions / environment / deviation_ledger) maps the source; the ledger
  classifies every clone deviation. The fix removed two **entangled** shortcuts (not new code):
  **W1** `determineCol` no longer clamps `curr_col` (seg006.c:122 is unclamped; only the collision-
  *scan* bounds clamp) so `check_action` link-hops across a boundary via `getTile`; **W1b**
  `getEdgeDistance` restored to `get_edge_distance`'s **own-tile-first** structure (seg004.c:383 —
  check `get_tile_at_char` before the front tile) so a boundary wall safe-steps flush instead of
  oscillating (the front-only shortcut only worked *because* of the clamp — each propped up the
  other); **W2** the room cross moved to a post-`checkAction` `leaveRoom()` step (source runs
  `exit_room` after the kid frame, seg000.c:881); **W3** `leaveRoom` is now faithful `leave_room`
  (seg002.c:423) — `Char.y`-based UP/DOWN leave + the climb-frame (135–149) block on horizontal.
  Verified: cross-room climb succeeds (straddle → resolves on the next step), boundary-wall bump
  flush, vertical up/down + horizontal crosses, all prior regressions; no console errors; the
  straddle renders faithfully (character drawn room-relative, no extra draw). **Lesson (promoted to
  a feedback memory): with a faithful RE source, follow it — don't simplify away without a strong
  reason; entangled shortcuts cost more later than the faithful port.**
- **[done] Gate collision + climb-into-a-closed-gate.** The portcullis's *collision* half (the
  animate/button open-close subsystem landed later — see the **Button → portcullis** entry below): a
  **closed gate blocks** and an **open gate is passable** — `can_bump_into_gate` (`(modif>>2)+6 < char_height`, char_height = the frame's sprite
  height / `MaskSprite.h`) folded into a `wallTypeAt` helper feeding `getEdgeDistance`/`wallAheadFace`
  (the clone's `is_obstacle`/`dist_from_wall_forward` equivalents). And climbing up into a **closed
  gate above** now plays **`climbfail`** (`seq_73`, transcribed into `seqtbl.js`: reach up 135→138,
  reverse, `dx(-7)`+`hangdrop` — **no `dy`, never changes row**) via `canClimbUp`'s ported
  `can_climb_up` branch (closed gate facing left, or mirror/chomper facing right). Prompted by the
  room-1 left-edge portcullis, which is actually **room 5's col 9 gate** drawn into room 1's edge
  (`get_tile_to_draw(room_L, 9, …)`, seg008.c:363) — a *visual* borrow that does NOT make room 1
  (0,0) solid; the collision lives on room 5's tile, read across the boundary by `getTile`'s link-hop.
  **Verified** by single-stepping (`#debug`): held-Up loops jump→grab→climbfail→drop then parks below
  the gate; a closed gate pins `Char.x` at its face (x=184); normal climb (→row 0) + normal wall both
  unaffected. Rendering (flat 2D tiles vs the source's pseudo-3D, and the neighbour-sliver draw) is
  deliberately untouched. Full map + verification in `docs/research_environment.md §1d/§1e`.
- **[done] Control auto-repeat latch — a HELD key settles, a TAP oscillates.** Ported PoP's 3-state
  control latch so running/holding into a wall *settles at the wall* (one `safe_step`, then the
  `IGNORE` latch stops the repeat) while *tapping* at the face oscillates (step11-into-wall →
  `seq_47` recoil → gap → step back in). The clone had the `CONTROL_HELD`/`IGNORE` constants
  **inverted** and no latch at all (`buildControl` recomputed `control.forward` fresh each tick →
  walked flush, never oscillated). Fix: corrected constants (`control.js`); a persistence layer in
  `player.js` (`ctrl1` + `readRawAxis → restCtrl1 → readUserControl → controlKid → saveCtrl1`, the
  `seg006.c:1428` pipeline); latch-aware handlers (`safe_step` sets `IGNORE` + `else → step11`;
  `forward_pressed` HELD-gated near a wall; `control_standing` `control_x` fall-through;
  `back_pressed`/`control_running`/`controlKid` `release_arrows` — the one-shot that stops a turn/
  run-turn re-firing every tick; `dropAtStart` resets the latch). *(A verification-caught regression —
  `back_pressed` missing `release_arrows` spun the prince forever with no key — was fixed the faithful
  way; §5c.)* `checkBumped`/`seq_47` (the Wall-bump entry) is
  unchanged — the latch just makes it fire only on real penetration. **Validated against DOS ground
  truth via a live `dosbox-memory` hook** (settle vs oscillate; a 4-unit `= dx(-4)` swing; the gap is
  general, not the gate `wall_dist` inset) before porting, then **verified in-clone** by deterministic
  stepping (`#debug` `POP.keys`/`step`): HOLD → settle stable at x=58, TAP → oscillate 58↔62,
  regressions (turn/jump/run/runstop/fall) pass. **Deferred (separable):** the `wall_dist_from_left`
  inset (clone rests flush at the raw edge; DOS insets ~10 units — the follow-on that matches the DOS
  *rest position*) and the vertical (`control_up`/`down`) latch. Full mechanism + verification in
  `docs/research_collision.md §5c`.
- **[done] Routine-level-identical collision kernel — the x-bias fix, done right.** The whole
  kid-vs-environment collision path is now a verbatim port of SDLPoP's own routines (`collision_kernel.js`,
  new) instead of the old `Char.x`-clamp + raw-tile-edge substitutes. Prompted by the wall-stop **x-bias**
  (the prince stopped ~6 internal units off the source): rather than patch the one number (which the
  earlier analysis proved leaves a residual), the whole subsystem was un-substituted so any discrepancy is
  a mechanical value-diff, not a reasoning exercise (the user's call: "make everything identical, or we
  don't do this"). Ported as named `// segNNN.c:line` routines over module-level globals mirroring the C:
  **tile access** (`get_tile` with its side-effect globals `curr_room`/`tile_col`/`curr_tilepos`/
  `curr_tile2`, `find_room_of_tile`, the char-relative reads incl. `get_tile_infrontof_char` setting the
  pre-hop `infrontx`); **char box** (`set_char_collision` via `load_frame_to_obj`, `determine_col`,
  `dx_weight`, `distance_to_edge`); **wall faces** (`get_left/right_wall_xpos` + the `wall_dist_from_left/
  right[]` tables + `coll_tile_left_xpos = x_bump + TILE_MIDX`, `can_bump_into_gate`, `xpos_in_drawn_room`);
  the **per-column buffer scan** (`check_collisions`/`get_row_collision_data`/`move_coll_to_prev` + the
  10-column `curr/above/below/prev_row_coll_*` buffers); the **bump** (`check_bumped`/`check_bumped_look_
  left/right`/`is_obstacle`/`is_obstacle_at_col`/`bumped`/`bumped_floor`/`bumped_fall`); **edge distance**
  (`get_edge_distance`/`dist_from_wall_forward`); and the **fall/floor** path (`do_fall`/`land`/`start_fall`/
  `check_on_floor`/`in_wall`/`check_action`) with the faithful per-context fall sequences
  (`stepfall`/`jumpfall`/`rjumpfall`/`stepfall2`/`patchfall` = `seq_7/18/21/19/104`, transcribed into
  `seqtbl.js` with `set_fall` for the forward drift — replacing the old `freefall` collapse + its
  `fall_x=0` stopgap). `player.js` runs the faithful `play_kid_frame` order (seg000.c:1192) over the kernel;
  the substitutes (`wallAheadFace`, the `Char.x`-clamp `checkBumped`, `getEdgeDistance`'s raw-edge faces,
  the local `doFall`/`land`/`startFall`/`checkOnFloor`/`checkAction`) are **deleted**.
  - **The x-bias, resolved per lesson 6c:** collision now stops the prince at the SOURCE's internal x (the
    inset face `coll_tile_left_xpos + TILE_MIDX` ± `wall_dist`), and the FLAT view re-derives the view-space
    offset with a render-only constant **`RENDER_X_BIAS = 6`** (draw the prince 6 internal-x units left, so
    he reads flush against our flat-drawn walls). Collision faithful; only the *number in our render* is
    re-expressed. (The wall's collision slab is `+7` on the left face vs `+6` on the right — ~2 screen px —
    so it's a tweakable constant, not a per-facing formula.)
  - **Two latent bugs the faithful port exposed** (exactly the "identical routines make bugs obvious"
    payoff): (1) `makeCharacter` never set `alive`, so the faithful `bumped()` guard `Char.alive < 0` failed
    and the prince walked *through* walls → fixed with `alive: -1` (SDLPoP's alive sentinel). (2) the kernel
    cached `drawnRoom`, which went stale on **R restart** / teleport (they set the player's `drawnRoom`
    without syncing the kernel's) → `xpos_in_drawn_room` skipped the −140 straddle offset → a cross-boundary
    wall's face computed a room-width off → the bump flung `Char.x` to ~208 (the "emerge on the right" bug)
    → fixed by reading `drawnRoom` **live** through a `getDrawnRoom` getter (never cached).
  - **Verified** (deterministic `#debug` stepping, zero console errors): wall bump settles at the inset face
    (x=177 plain wall / x=64 room-1 boundary wall, not the raw 170/58); falling entry soft-lands; ledge-fall
    runs the real start-fall frames 102–106 → land; loose-floor → room 2; deep fall ends bounded (no
    "fall forever"); legitimate horizontal cross (room 2↔3); jump-up→grab→hang→climb; turn; runstop. The
    render-bias screenshot shows the prince flush at the left wall with collision unchanged.
  - **Deviations retired** (`research_deviation_ledger.md`): **L1** (`Char.x`-clamp bump detection),
    **L2** (don't-fall-on-a-wall), **D1** (the buffer scan) are now the faithful routines. **Genuinely
    out of scope** (separate subsystems, not collision-detection substitutes — same class as char-vs-char):
    spikes, chompers (`start_chompers` stub + `check_chomped_kid`), HP (`take_hp` — a medium land always
    survives), mid-fall Shift-grab (`check_grab` stub), feather fall, buttons (`check_press` is loose-only),
    sword combat / guards. Full map: `docs/research_collision.md §11` + the ledger.
  - Files: `collision_kernel.js` (new), `player.js`, `playseq.js` (`alive`/`sword` init), `seqtbl.js`
    (the 5 fall sequences).
- **[done] Traversal gaps — running jump + Down→crouch + climb-down.** The last on-foot moves the
  level-1 route needs (part of the sword milestone). **Running jump** (`run_jump`, seg005.c:898,
  player.js): Up held during the run cycle → scan up to 2 tiles forward for the take-off edge (spike /
  non-floor), align `Char.x` to launch from the brink (a bad alignment window returns → the run
  re-checks next frame; flat ground jumps straight), then `runjump` (seq_4); wired into
  `control_running` (seg005.c:595). **Down→crouch / climb-down** — one handler, `down_pressed`
  (seg005.c:464, player.js), wired into `control_standing`'s down branch (both blocks, seg005.c:380/399):
  a grabbable ledge behind + far enough from the back edge → `climbdown` (seq_68, transcribed into
  `seqtbl.js`) else `crouch()` = the existing `stoop` (seq_50). *Finding:* climb-down's hang is
  transient — after frame 91 (action 3) `control_hanging`→`hang_fall` runs `seq_11`, which the source
  labels **"end of climb down"** (seg005.c:866); so it descends one row and lands unless Up (climb back)
  / Shift (hang) is held. Reuses collision.js tile reads (the `checkJumpUp`/`hangFall` layer) — no new
  kernel exports here (those come with `check_press`, next). **Verified** (deterministic `#debug`
  stepping, zero console errors): run-jump 34→44 arc resumes the run; Down → stoop 107/108/109 →
  release → standup; climb-down row 1 → row 2 lands on a floor; all regressions (falling entry,
  runstop, turn→turn-run, jump-up, wall bump x=64, loose-floor→room 2) pass. Files: `seqtbl.js`
  (`climbdown`), `player.js` (`runJump`/`downPressed` + `world`), `control.js` (run-jump + down
  branches), `index.html` (control hint). Detail: `docs/research_actions.md §4/§5/§7`.
- **[done] Button → portcullis (the animate/press subsystem).** A pressure plate now raises a
  gate: `trob.js` grew from loose-only to the full trob system (`process_trobs` → `animate_tile`
  dispatch by tile type) — `trigger_button` → `do_trigger_list` → `trigger_1` → `trigger_gate`
  (the press → door-link chain), `animate_door`/`gate_stop` (rise +4/frame to 188, hold 238, sink
  −1/frame to 0), `animate_button` (the pressed debounce), + the door-link accessors over the
  decoded `level.doorLinks`. `player.js` `check_press` gained the button branch (opener 15 / drop 6
  → `trigger_button`, read through the kernel's `get_tile_at_char` so `curr_room`/`curr_tilepos`/
  `currModif` resolve the tile). `drawRoom` renders the gate's open height by retracting the bars
  (`openFrac = min(modifier,188)/188`) and draws the **buttons** as coloured floor plates (raise 15 =
  blue, drop 6 = orange — the block-map demo's palette) so you can see where they are. The gate's
  animated modifier feeds collision automatically
  (the kernel's `can_bump_into_gate` reads it live), so an opening gate becomes passable on its own.
  **Found + fixed mid-step:** the clone's `leave_room` had dropped the source's col-9 guard
  (seg002.c:472) — a closed gate at a room boundary could be *safe-stepped through* (its inset face
  x=201 coincides with the right-cross threshold). Restored the doortop guard + extended it to a
  still-blocking closed gate (via `check_bumped`'s `can_bump_into_gate`, so leave_room and the bump
  agree; computed in player.js from `spriteOf(ch.frame).h` — the kernel stays routine-identical, no
  invented helper). **Verified** (deterministic `#debug` stepping, no console errors): the room-5
  raise button opens both linked gates → held 238 while standing → auto-closes to 0 on step-off; the
  prince runs *through* an opened gate; a closed boundary gate holds him (stays in room 5, x=201); an
  open one lets him cross; regressions (falling entry, run/turn, jump-up, wall bump, loose → room 2,
  multi-room 2→3→9) pass. Files: `trob.js` (rewritten), `player.js` (checkPress + gate render +
  leave_room guard), `collision_kernel.js` (export `get_tile_at_char`/`currModif`/`curr_room`/
  `curr_tilepos`). Detail: `docs/research_environment.md §1`.
- **[done] Sword pickup (the milestone).** The prince picks up his sword: stand near it (or on it),
  hold/press **Shift** → he crouches, then grabs it. A two-step port of `check_get_item` (seg005.c:620)
  → `get_item` (seg005.c:640) → `do_pickup` (seg006.c:1671) → `proc_get_object` (seg006.c:1857), all in
  `player.js`, reading the at/in-front/behind tiles through the kernel's `get_tile_*` so
  `curr_tile2`/`curr_room`/`curr_tilepos` mirror the C's globals. First Shift → `get_item` aligns +
  `crouch()` (the existing `stoop`); second Shift while crouched (frame 109) → `do_pickup(-1)` erases the
  sword tile → floor + plays `pickupsword` (seq_91, transcribed), whose `SEQ_GET_ITEM 1` fires
  `proc_get_object` → `have_sword = -1`; then `resheathe` (seq_91→seq's tail) → stand. Wiring: a new
  **`control_shift2` latch** (`player.js` — `ctrl1.shift2` + the `readUserControl`/`restCtrl1`/`saveCtrl1`
  branch, seg006.c:1594) so a held Shift is a fresh press for one tick then `do_pickup` latches it IGNORE;
  `control.js` `control_standing` (Shift+shift2, seg005.c:344) + `control_crouched` (shift2, seg005.c:330)
  gained the get-item check at the top (it returns false when not near an item, so Shift still careful-steps
  — no conflict). `playseq.js` `SEQ_GET_ITEM` fires an `onGetItem` hook (kept PoP-agnostic; `player.js`
  binds it to `proc_get_object`). Potions share the path (`drinkpotion`/seq_78 transcribed) — the drink
  animation plays + the potion vanishes, but its *effects* (HP/life/feather) are out of scope (no HP
  system), so `proc_get_object`'s potion branch is a no-op. HUD gained a `sword=yes/no` field; `drawRoom`
  draws the sword tile as a bright steel blade + brass hilt lying on the floor so the objective is
  visible (it vanishes after pickup, when the tile becomes floor). The kernel
  gained `export` on `get_tile_infrontof_char`/`get_tile_behind_char`/`load_fram_det_col` (visibility only —
  the routine-for-routine invariant holds). **Deferred (faithful):** the sword-drawn combat stance + guards
  (the source only draws the sword near a guard) and the little sword-blade overlay sprite (we have body
  silhouettes only, so the grab reads as reach-down-and-rise without the blade). **Verified** (deterministic
  `#debug` stepping, no console errors): Shift by the room-15 sword → crouch (107/108/109) → `pickupsword`
  (229) → `have_sword`=-1 / HUD `sword=yes` → `resheathe` → stand; sword tile → floor (consumed); the
  standing-on-the-sword back-up path works; Shift near a non-item still careful-steps; all regressions
  (falling entry, runstop, jump-up, Down-crouch, wall bump, loose → room 2, button→gate) pass. Files:
  `seqbuilder.js` (`getItem`), `seqtbl.js` (`pickupsword`/`resheathe`/`drinkpotion`), `playseq.js`
  (`SEQ_GET_ITEM` hook + `have_sword`/`pickup_obj_type`/`onGetItem` fields), `collision_kernel.js` (3
  exports), `control.js` (shift2 + get-item branches), `player.js` (the 4 functions + latch + HUD).
  Detail: `docs/research_actions.md §11`.
- **[done] Grab a ledge in mid-fall.** Hold **Shift** while falling and the prince catches a ledge
  that's close enough ahead-and-above (and you're not falling too fast) → hangs, from where the §10
  machinery climbs (Up) or drops (release). This fills the `check_grab` stub the routine-identical
  kernel left. Port of `check_grab` (`seg006.c:1177`): fires while `control_shift == HELD`, `fall_y < 32`,
  `alive < 0`, and the landing row is within reach (`(word)y_land[curr_row+1] <= (word)(Char.y+25)`);
  nudges `Char.x` back 8 so a ledge just ahead reads as grabbable, tests `can_grab_front_above`, and on
  success snaps flush to the ledge, seats `Char.y` at the landing row, zeroes `fall_y`, starts
  **`fallhang`** (seq_15 = `act(3) frame_80 jmp(hang)`, transcribed), and sets `grab_timer = 12` (which
  gates the climb — the last consumer of the field the jump-up step put in place). **The kernel's two
  call sites** (`do_fall` each freefall tick the feet are above the floor line; `check_action` at the
  start-fall frames 102–105) are unchanged. **Design (respects the kernel invariant):** `check_grab`
  needs the control layer (`control_shift`) + the grab predicates already in `collision.js`, so the body
  is `checkGrab(ch)` in **`player.js`** (next to `checkJumpUp`, reusing `canGrab`/`getTileAboveChar`/
  `distanceToEdge`) and the kernel's `check_grab()` becomes a one-line `Char.onCheckGrab?.()` delegate —
  the `onGetItem`/`SEQ_GET_ITEM` hook pattern — so no control state or grab predicate is pulled into the
  kernel (zero duplication, no new import). **Verified** (deterministic `#debug` stepping, no console
  errors): run off room-5 col-6 into the col-7 pit + Shift → grab (frame 80 → hang loop, `grab_timer=12`,
  `Char.y` snapped to 118) → Shift-hold-then-Up climbs row 1→0, or release drops; negatives all correct
  (no Shift lands; `fall_y ≥ 32` falls through; a *centred* drop — stand-on-col-7 or the room-12 loose
  floors — doesn't grab because the `-8` back-nudge lands "above" on an adjacent floor, so a natural grab
  needs the front-of-column position a run-off gives). Regressions (falling entry, run/runstop, wall bump,
  **jump-up grab** — `grab_timer` stays 0 there, no leak) pass. Files: `seqtbl.js` (`fallhang`),
  `player.js` (`checkGrab` + `onCheckGrab` binding), `collision_kernel.js` (`check_grab` → hook delegate),
  `control.js` (stale comment fix). Detail: `docs/research_collision.md §12`.
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
6. **With a faithful RE source, follow it — don't simplify away without a strong
   reason.** Deviating needs a *load-bearing* justification (a hardware-only mechanism,
   §"When a subsystem has no software counterpart" in the root doc), never "this is
   simpler / enough for now." The trap is that **shortcuts entangle**: the position
   substrate accumulated a `curr_col` clamp *and* a front-only `getEdgeDistance` — each
   existed only because the other did, so each looked individually harmless while
   together they produced a wrong-direction bug (climbing into a wall at room edges).
   Unwinding them later cost a full research pass + rework; the faithful port up front
   would have been cheaper. Four corollaries: **(a)** prove the entanglement before
   ripping it out — a quick A/B toggle (clamp on/off) both *confirmed* the fix and
   *surfaced* the companion shortcut before the rework, not mid-way; **(b)** don't offer
   the user short-term "let's stop here / make it work for now" off-ramps on substrate
   code — take the long-term view and port the whole coherent mechanism, deferring only
   separable *features*, never the substrate; **(c)** *not everything in the source is
   mechanism.* A quantity expressed in a **view / render space we deliberately don't
   reproduce** is a **second legitimate deviation** (beyond hardware-only): **re-derive
   it in our view, don't copy the number.** PoP's `wall_dist_from_left` /
   `dist_from_wall_forward` insets a wall's collision face ~10 units because the DOS room
   is drawn **pseudo-3D** (the visible wall face sits inset from the abstract tile
   boundary); our clone draws the wall **flat** at the tile cell, so the faithful stop is
   **flush**, and any face offset is re-derived from *our* render — not ported. Keep the
   collision **logic** faithful (which tile blocks, which side, link-hop, bump/recoil,
   the control latch); re-express only the **view-space number**. Reading "follow the
   source" as an all-or-nothing binary *is itself the trap* — it stalled a whole session
   on this exact x-bias (2026-07-09). The test: *is the number in a coordinate/view space
   we chose not to reproduce?* If yes, re-derive; if it's mechanism, still follow it.
7. **The flag-and-wait protocol (binding — this is how corollary 6c gets adjudicated).**
   "Follow the source, don't simplify" is the firm default. When the user asks for
   something that looks like it breaks that rule, do **NOT** grind trying to reconcile
   faithfulness with the request, and do **NOT** silently decide for yourself whether the
   deviation is "legitimate" — that self-adjudication is exactly what causes the
   stall / no-response loop (paid for 2026-07-09 on `wall_dist`). Instead: **stop, state
   in one line "this breaks follow-the-source, specifically X," and WAIT for the user's
   call.** The assistant *flags* the break; the *user* decides whether to break it (e.g.
   "yes — it's a view-space thing, do the flat version"). Once the user authorises the
   deviation, implement it without further agonising. Division of labour: I flag, you
   rule.

## Commit style

Repo-wide convention (root `CLAUDE.md` → "Commit conventions"): a one-line title
+ the `Co-Authored-By` trailer when a doc (this file, a research note) carries the
detail; subject prefixed `[prince_of_persia]`.
