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
// This module is also the SCAPE authority (CLAUDE.md module table: SCAPE/SCAPCHG/
// SCAPMJR/SCRLUP live here): it owns the per-frame camera framing (`frameCamera`) and
// the major↔minor zoom transition (`updateZoom`) — research_physics.md §9/§9.1.

import { ROM598 } from './discovery_rom_data.js';
import { runList } from './dvg.js';
import { SCREEN_W, drawSegmentsWorld } from './render.js';
import { isMajor, resetFlight, GEOM } from './state.js';

const OFFTOP_Y = 744;               // off-top-of-major ceiling (screen top, ~SCREEN_H); flew off → reset
const OFFTOP_FUEL_PENALTY = 20;     // minimal DEDCTA analog charged on the off-top restart (§9.1)

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
    this.majorScale = SCREEN_W / LOOP_W;      // 0.25 — fit the whole loop (4096) to the screen width
    this.minorScale = this.majorScale * 4;    // 1.0  — the near view is 4× the far (§9.1)

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
    // Major camera vertical base: puts yMin ~bottomMargin px above the screen bottom.
    // frameCamera adds SCRADD on top; the minor base is 0 (SCRADD carries it entirely).
    this.majorBaseY = this.yMin - 24 / this.majorScale;
  }

  // Frame the camera for the major (zoom-out) view: ¼ scale, terrain valleys near the
  // screen bottom. Used for the boot/IDLE framing (PLAY uses frameCamera each tick).
  setMajorCamera(cam) {
    cam.scale = this.majorScale;
    cam.y = this.majorBaseY;
  }

  // Per-frame camera framing from the shared scape state (the SCAPE positioning): scale +
  // scroll offsets → the camera the render layer reads. Called every PLAY tick (main.js).
  //   scale  : major 0.25 / minor 1.0 (from LUNARNUM)
  //   camera.x = SCROLL wrapped into the loop; camera.y = scape base + SCRADD
  frameCamera(state, camera) {
    const major = isMajor();
    camera.scale = major ? this.majorScale : this.minorScale;
    camera.x = ((state.SCROLL % this.loopW) + this.loopW) % this.loopW;
    camera.y = (major ? this.majorBaseY : 0) + state.SCRADD;
  }

  // Ship altitude = its world Y minus the terrain surface straight below it (world units).
  // The SCPDST proxy (single-point; DECODE's 2-corner min lands with collision). The camera
  // transform inverts render.js: world = cam + screen/scale. Shared by display_info + zoom.
  altitudeAt(state, camera) {
    const worldX = camera.x + state.posX / camera.scale;
    const worldY = camera.y + state.posY / camera.scale;
    return Math.max(0, worldY - this.heightAt(worldX));
  }

  // The zoom transition + off-top reset (SCAPMJR/SCRLUP, research_physics.md §9.1), driven by
  // the altitude proxy with hysteresis. Call each PLAY tick AFTER motion + frameCamera.
  updateZoom(state, camera) {
    const alt = this.altitudeAt(state, camera);
    if (isMajor()) {
      if (state.posY > OFFTOP_Y) {                 // flew off the top of the far view → restart
        resetFlight(OFFTOP_FUEL_PENALTY);
        this.frameCamera(state, camera);
      } else if (alt < GEOM.ZOOM_IN_ALT) {         // dropped close to the ground → snap to near view
        this._zoom(state, camera, true);
      }
    } else if (alt >= GEOM.ZOOM_OUT_ALT && state.VELY > 0 && state.posY >= GEOM.WIN_YMAX - 1) {
      this._zoom(state, camera, false);            // climbed clear (ascending, high in window) → far view
    }
  }

  // Snap between scapes, preserving the world point under the ship (coordinate continuity).
  // The source does an exact SUMSA/SUMSUM conversion; we reproduce the visible result — note the
  // ship's world point (wx = horizontal, wy = its world height = altitude), flip the scape, then
  // place the ship + scroll so it still sits over that point at the new scale. The two scapes
  // differ vertically: MINOR floats (no fixed base — SCRADD carries the height), MAJOR has a FIXED
  // base (SCRLUP zeroes SCRADD :2773-7), so on zoom-OUT the terrain must return to majorBaseY and
  // the altitude is carried by the ship's screen-Y instead. Horizontal continuity holds both ways.
  _zoom(state, camera, toMinor) {
    const wx = camera.x + state.posX / camera.scale;
    const wy = camera.y + state.posY / camera.scale;
    state.LUNARNUM = toMinor ? 0 : 0x40;
    const newScale = toMinor ? this.minorScale : this.majorScale;
    if (toMinor) {
      state.posX = GEOM.MINSTX;
      state.posY = GEOM.MINSTY;
      state.SCRADD = wy - state.posY / newScale;        // minor base 0 → SCRADD holds the height
    } else {
      state.posX = GEOM.RMJRX;
      state.posY = (wy - this.majorBaseY) * newScale;    // put the height into posY; base stays put
      state.SCRADD = 0;                                  // restore the major terrain base (SCRLUP)
    }
    state.SCROLL = wx - state.posX / newScale;           // horizontal continuity (both directions)
    this.frameCamera(state, camera);
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

  // Terrain surface height (world DVG y) directly below worldX. Walks the segment
  // polyline for the span containing x (wrapped into the loop) and linearly
  // interpolates the surface y. Single-point query — enough for the HUD ALTITUDE
  // readout now (display_info). Step 6's collision uses the faithful two-corner
  // SCPDST (min of both lower-corner clearances) instead; padAt/slopeAt land there
  // too, computed from this.segs + this.bounds (the model is already query-ready).
  heightAt(worldX) {
    const x = ((worldX % this.loopW) + this.loopW) % this.loopW;
    let best = null;                                   // topmost surface at x (a ridge can stack segments)
    for (const s of this.segs) {
      const lo = Math.min(s.fx, s.tx), hi = Math.max(s.fx, s.tx);
      if (x < lo || x > hi) continue;
      const y = hi > lo ? s.fy + (s.ty - s.fy) * ((x - s.fx) / (s.tx - s.fx)) : Math.max(s.fy, s.ty);
      if (best === null || y > best) best = y;         // surface = the highest stroke over x
    }
    return best === null ? this.yMin : best;
  }
}
