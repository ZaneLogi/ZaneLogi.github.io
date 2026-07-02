// lunar_lander/starfield.js
//
// The STARS backdrop (CLAUDE.md module table; A34573.1A `STARS` :1121-1150) — the ROM's real
// 61-point star field ($5244-$53E6 in ROM598: single-dot bright VECs, brightness 5-9 = star
// magnitudes, CLAUDE.md "034598 region map"), drawn behind the terrain and scrolling with the world.
//
// FAITHFUL: the real ROM star POINTS + magnitudes (the 24 decoded cluster subroutines). LABELED
// derivation: the field LAYOUT — the source positions the clusters via the `MJSTRA`/`MJSTRB`/`MINSTR`
// display lists (`STRINIT` LABS + per-cluster VEC moves, :1124-1150), which live in VG-RAM and aren't
// extractable (the same situation as the bonus-site `TBMNA` positions), so we spread the 24 clusters
// across a horizontal wrap-tile in a sky band. Source behavior kept: the field scrolls horizontally
// with the world (`SCRLDO`, the minor path :1141) — here the tile scrolls with the camera. This is the
// real-ROM-data counterpart to the physics demo's generated field (demos/physics.js, labeled a choice).

import { ROM598 } from './discovery_rom_data.js';
import { runList } from './dvg.js';
import { SCREEN_W, SCREEN_H } from './render.js';

const STAR_LO = 0x5244, STAR_HI = 0x53E6;   // the starfield region (034598 region map)
const TILE_W = SCREEN_W;                     // horizontal wrap tile (one screen wide)
const SKY_H = SCREEN_H * 0.55;               // stars live in the top band (sky, above the terrain)

export class Starfield {
  constructor() {
    this.stars = this._build();              // {x (0..TILE_W), y (canvas px), bri} — the real ROM points
  }

  // Pull the 61 bright points from the ROM cluster subroutines and spread them across the tile:
  // each cluster is placed at an even base-X, then its own point offsets fan out from there; the
  // whole set's Y range is normalised into the sky band. Deterministic (no RNG) → a stable field.
  _build() {
    const keys = Object.keys(ROM598)
      .filter(k => { const a = parseInt(k.slice(2), 16); return a >= STAR_LO && a <= STAR_HI; })
      .sort();
    const raw = [];
    keys.forEach((k, i) => {
      const baseX = (i / keys.length) * TILE_W;                  // cluster i's slot across the tile
      runList(ROM598, ROM598[k], { x: 0, y: 0 }, 0, (fx, fy, tx, ty, bri) => {
        if (fx === tx && fy === ty) raw.push({ x: baseX + fx * 0.4, y: fy, bri });   // zero-length VEC = a star
      });
    });
    let yMin = Infinity, yMax = -Infinity;
    for (const s of raw) { yMin = Math.min(yMin, s.y); yMax = Math.max(yMax, s.y); }
    const ySpan = Math.max(1, yMax - yMin);
    return raw.map(s => ({
      x: ((s.x % TILE_W) + TILE_W) % TILE_W,
      y: 8 + ((s.y - yMin) / ySpan) * (SKY_H - 16),             // canvas Y-down, into the sky band
      bri: s.bri,
    }));
  }

  // Draw the field behind the terrain, scrolling horizontally with the camera (the world scroll →
  // the same screen displacement the terrain gets), wrapped at the tile. Points are single dots
  // whose brightness follows the ROM magnitude (5-9). Runs in every mode (attract + play + outcome).
  render(ctx, camera) {
    const off = (((camera.x * camera.scale) % TILE_W) + TILE_W) % TILE_W;   // scroll with the world
    for (const s of this.stars) {
      const sx = (((s.x - off) % TILE_W) + TILE_W) % TILE_W;                // wrap into [0, TILE_W)
      const a = 0.28 + 0.62 * ((s.bri - 5) / 4);                           // magnitude → alpha
      ctx.fillStyle = `rgba(200,255,215,${a.toFixed(2)})`;
      ctx.fillRect(sx, s.y, 1.6, 1.6);
    }
  }
}
