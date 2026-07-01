// lunar_lander/landscape.js
//
// The TERRAIN AUTHORITY (CLAUDE.md "Planned gameplay module layout"): it owns the
// lunar surface and, later, the terrain QUERIES (heightAt/padAt/slopeAt) that the
// land/crash verdict (collision.js) consumes. It does NOT decide land vs crash —
// that's a terrain FACT vs the game VERDICT split.
//
// One surface, both scapes: major (zoom-out) and minor (zoom-in) are the SAME
// LNMIN/MINTBL terrain drawn at different camera scales (major ¼, minor ~1) — see
// research_vector_usage.md §3/§3.1. So this class renders scale-agnostically; the
// camera decides the zoom.
//
// STEP 1 scope: the model + render + horizontal scroll/wrap. The queries and the
// zoom transition come later (steps 2/6). The model is built query-ready (the
// segment list + per-section x-ranges are retained) so heightAt() is a cheap add.

import { ROM598 } from './discovery_rom_data.js';
import { runList } from './dvg.js';
import { SCREEN_W, drawSegmentsWorld } from './render.js';

// LNMIN section order (play order) + MINTBL Y baselines — the terrain-DEFINITION
// tables (A34598.1B:238 / :261), NOT vector coordinates. Segment GEOMETRY is
// referenced by key from ROM598 (single-sourced; the "no vector-coord literals"
// rule). SECT11 = the flat SEG019 (key S_516E). See research_vector_usage.md §3.
const LNMIN_KEYS = ['S_5000', 'S_500A', 'S_5010', 'S_5016', 'S_5020', 'S_5026', 'S_502E',
  'S_5038', 'S_5040', 'S_504C', 'S_516E', 'S_5058', 'S_5060', 'S_506C', 'S_5072', 'S_507E'];
const MINTBL_Y = [896, 384, 656, 576, 224, 368, 864, 1440, 1088, 640, 64, 64, 448, 96, 64, 640];
const SECT_W = 256;                 // every section is 256 units wide
const LOOP_W = SECT_W * 16;         // 4096 — one full horizontal wrap

export class Landscape {
  constructor() {
    this.loopW = LOOP_W;
    this.majorScale = SCREEN_W / LOOP_W;      // 0.25 — fit the whole loop to the screen width

    // Build the surface once. This is the SCAPE `LABS(MINTBL) + JSRL(section)` weave:
    // chaining the 16 sections with a cumulative DVG cursor lands each section's start
    // on its MINTBL baseline (the faithful check). Segments are WORLD DVG coords
    // (x 0..loopW, y = terrain height); only bri>0 strokes reach the callback.
    const segs = [], bounds = [], cur = { x: 0, y: MINTBL_Y[0] };
    LNMIN_KEYS.forEach((key, i) => {
      bounds.push({ i, x0: cur.x, y: cur.y });
      runList(ROM598, [{ op: 'JSR', target: key }], cur, 0,
              (fx, fy, tx, ty) => segs.push({ fx, fy, tx, ty }));
      bounds[i].x1 = cur.x;                    // section x-range, for future heightAt()
    });

    this.segs = segs;                          // world-coord segment list (render + queries)
    this.bounds = bounds;                      // per-section {i, x0, x1, y}
    this.faithful = bounds.every(b => b.y === MINTBL_Y[b.i]) &&
                    cur.x === LOOP_W && cur.y === MINTBL_Y[0];

    this.yMin = Infinity; this.yMax = -Infinity;
    for (const s of segs) {
      this.yMin = Math.min(this.yMin, s.fy, s.ty);
      this.yMax = Math.max(this.yMax, s.fy, s.ty);
    }
  }

  // Frame the camera for the major (zoom-out) view: ¼ scale, terrain valleys near the
  // screen bottom. Convenience for the boot/IDLE framing; the state machine will later
  // drive scale/y for the altitude zoom transition.
  setMajorCamera(cam, bottomMargin = 24) {
    cam.scale = this.majorScale;
    cam.y = this.yMin - bottomMargin / cam.scale;   // yMin → bottomMargin px above the bottom
  }

  // Advance horizontal scroll, wrapping at the loop. pxPerSec is SCREEN px/s (scale-
  // independent). IDLE auto-scrolls; PLAY will drive cam.x from the lander's VELX.
  update(cam, dt, pxPerSec = 40) {
    cam.x = (cam.x + (pxPerSec / cam.scale) * dt) % this.loopW;
    if (cam.x < 0) cam.x += this.loopW;
  }

  // Draw the surface through the camera, wrapping (3 loop-copies keep the viewport
  // filled across the seam). Scale-agnostic → the same call renders major or minor.
  render(ctx, cam) {
    for (const copy of [-1, 0, 1]) {
      const shifted = { x: cam.x - copy * this.loopW, y: cam.y, scale: cam.scale };
      drawSegmentsWorld(ctx, shifted, this.segs, { color: 'rgba(120,255,150,0.92)', width: 1.7 });
    }
  }

  // heightAt(worldX) / padAt(worldX) / slopeAt(worldX) — added at step 6, computed
  // from this.segs + this.bounds (the model is already query-ready).
}
