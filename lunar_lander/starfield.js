// lunar_lander/starfield.js
//
// The STARS backdrop — a FAITHFUL port of the ROM's star display lists (A34573.1A
// `STARS` :1121). The layout is NOT a derivation: three JSRL index tables in ROM598
// — `MJSTRA`/`MJSTRB`/`MINSTR` (decoded in discovery_rom_data.js `STARTABLES`) —
// select and order the $5244-$53E6 cluster subroutines, and `STRINIT` (:1152) sets
// each field's LABS origin. Every cluster is a chain of dark VEC move → bright SVEC
// dot; chaining the clusters from the origin lays the field across the screen, so the
// dot positions + magnitudes come straight from the ROM (globalScale 0).
//
// (This SUPERSEDES the old "the cluster LAYOUT lives in VG-RAM and isn't extractable"
// claim — the tables are plain ROM, anchored off `LNMIN`=$51BA; see build_discovery.py
// `STAR_TABLES`. The layout was measured against the MAME `llander` snapshots.)
//
//   major (zoom-out) LOWER  MJSTRA  LABS(0,256)  ~15 dots, y 192-768 (FULL screen
//                           height); the field is 4 clusters = 1024 wide and repeats
//                           every screen (the ROM lists them twice as a scroll
//                           buffer). Used in IDLE + PLAY zoom-out. MAME-matched
//                           (snap/llander 0000-0003: ~15-17 dots, image y 20-883,
//                           translating 1:1 with the terrain).
//   major TOP               MJSTRB  LABS(0,768)  drawn in play mode by the source, but
//                           it sits at y 768-1279 — above the visible 0-767 window, so
//                           it never appears on screen (confirmed: attract vs play
//                           snapshots show the same stars). We don't render it.
//   minor (zoom-in)         MINSTR  16 clusters over the world width; only a few land
//                           in the close-up window (snap 0006 shows ~4). LABELED
//                           SIMPLIFICATION: the source positions minor stars via
//                           MINSVG/SCRLDO per-section LABS (:1138), coupled to the
//                           minor-scape sections; we chain from LABS(0,256) and let the
//                           visible subset show. (The scroll stays world-1:1 — correct.)
//
// SCROLL: faithful in effect — the field moves with the world (screen displacement =
// camera.x·scale, same as the terrain), wrapping at its tile; MAME confirms every star
// translates 1:1 with the terrain.

import { ROM598, STARTABLES } from './discovery_rom_data.js';
import { runList } from './dvg.js';
import { SCREEN_W, SCREEN_H } from './render.js';

// STRINIT LABS origins (A34573.1A :1124/:1133/:1152) — the ONLY program-side constants;
// the rest is ROM cluster geometry. X=$A1 → LABS y=256 (lower), X=$A3 → y=768 (top).
const MAJOR_ORIGIN_Y = 256;
const MINOR_ORIGIN_Y = 256;   // simplification — real minor uses MINSVG per-section LABS

export class Starfield {
  constructor() {
    this.major = this._buildField(STARTABLES.majorLower, MAJOR_ORIGIN_Y);
    this.minor = this._buildField(STARTABLES.minor, MINOR_ORIGIN_Y);
  }

  // Chain the cluster subroutines from the LABS origin (globalScale 0), collecting each
  // bright SVEC as a dot. cursor.x after the whole run = the horizontal wrap period.
  _buildField(keys, originY) {
    const dots = [];
    const cursor = { x: 0, y: originY };
    for (const k of keys) {
      runList(ROM598, ROM598[k], cursor, 0, (fx, fy, tx, ty, bri) => {
        if (bri > 0) dots.push({ x: tx, y: ty, bri });   // dots are zero-length: from==to
      });
    }
    return { dots, tileW: cursor.x || SCREEN_W };
  }

  // Draw the field behind the terrain, scrolling with the world (the terrain's screen
  // displacement) and wrapped at the tile. `zoomedOut` picks the major (far) field; the
  // near view uses the sparse minor field. Runs in every mode (attract + play + outcome).
  render(ctx, camera, zoomedOut = true) {
    const { dots, tileW } = zoomedOut ? this.major : this.minor;
    const off = (((camera.x * camera.scale) % tileW) + tileW) % tileW;   // scroll with the world
    for (const s of dots) {
      const sx = (((s.x - off) % tileW) + tileW) % tileW;                // wrap into [0, tileW)
      if (sx >= SCREEN_W) continue;                                      // off the visible width
      const cy = SCREEN_H - s.y;                                         // DVG y-up → canvas y-down
      if (cy < 0 || cy > SCREEN_H) continue;                            // off top/bottom (minor field)
      const a = 0.28 + 0.62 * ((s.bri - 5) / 4);                        // magnitude 5-9 → alpha
      ctx.fillStyle = `rgba(200,255,215,${a.toFixed(2)})`;
      ctx.fillRect(sx, cy, 1.6, 1.6);
    }
  }
}
