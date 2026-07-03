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

## Status / roadmap

- **[done] Sprite extraction.** `KID.DAT` → 219 silhouette frames (ids 401–619)
  in `gfx/kid_masks.json`; verified by eye (the run cycle is unmistakable).
  `masksheet.js` loads + rasterizes (`MaskSheet.load` → `MaskSprite.draw`);
  `demos/actor_frames.html` is the inspector.
- **[next] Motion.** Pull `frame_table_kid` (per-frame draw offsets) out of
  `seg006.c` into `MaskSprite.ox/oy` so a flipbook doesn't jitter, then port
  `play_seq` (the `seqtbl` bytecode interpreter) + a minimal driver. First moving
  proof: the run cycle (frames ~408–412).
- **[later] The player (`index.html`).** Drive the actor with the keyboard
  (walk / run / jump / turn) via `control_kid`'s state machine.
- **[later] Enemies.** `GUARD.DAT` / `SHADOW.DAT` / … → `demos/enemy_frames.html`,
  same pipeline (`extract_masks.py <DAT>` is already generic).

## Commit style

Repo-wide convention (root `CLAUDE.md` → "Commit conventions"): a one-line title
+ the `Co-Authored-By` trailer when a doc (this file, a research note) carries the
detail; subject prefixed `[prince_of_persia]`.
