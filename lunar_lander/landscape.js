// lunar_lander/landscape.js
//
// The TERRAIN AUTHORITY (CLAUDE.md "Planned gameplay module layout"): it owns the
// lunar surface and the terrain QUERIES (heightAt now; padAt/slopeAt with scoring)
// that the land/crash verdict (collision.js) consumes. It does NOT decide land vs
// crash — that's a terrain FACT vs the game VERDICT split.
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

// The terrain-DEFINITION tables (NOT vector coordinates): the section play order
// (the source's LNMIN, A34598.1B:238) + each section's start-Y baseline (MINTBL,
// :261). Segment GEOMETRY is referenced by key from ROM598 (single-sourced; the
// "no vector-coord literals" rule). SECT11 = the flat SEG019 (key S_516E). See
// research_vector_usage.md §3.
const SECTION_ORDER = ['S_5000', 'S_500A', 'S_5010', 'S_5016', 'S_5020', 'S_5026', 'S_502E',
  'S_5038', 'S_5040', 'S_504C', 'S_516E', 'S_5058', 'S_5060', 'S_506C', 'S_5072', 'S_507E'];
const SECTION_BASELINES = [896, 384, 656, 576, 224, 368, 864, 1440, 1088, 640, 64, 64, 448, 96, 64, 640];
const SECT_W = 256;                 // every section is 256 units wide
const LOOP_W = SECT_W * 16;         // 4096 — one full horizontal wrap

// Bonus landing SITES (A34573.1A `LNDADR`/`TBSTFT`, research_physics.md §11 / step 7). The source
// designates 15 flat sites and reads each one's score multiplier from TBSTFT; PLYINIT picks 4 per
// drop (TABSIT) to flash + score. Its site X-positions (TBMNA) are runtime-built VG-RAM — not a
// static table and not in the vector source — so we DERIVE the 15 sites from our own terrain flats
// (same LNMIN data): take the 15 widest landable flats and assign the multiplier by WIDTH RANK
// (widest = index 0 = 2X … narrowest = index 14 = 5X). That reproduces the source's exact economy
// (four 2X, two 3X, four 4X, five 5X) AND the MAME `5X 5X 2X 2X` calibration (wide valley floors
// pay 2X, narrow ledges 5X). Labeled deviation: derived positions, not the byte-exact TBMNA table.
const TBSTFT = [2, 2, 2, 2, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5];   // :1921 — bonus factor per site index
const SITE_MIN_WIDTH = 24;          // narrowest flat we'll designate (a bit under the ~24u lander span)

export class Landscape {
  constructor() {
    this.loopW = LOOP_W;
    this.majorScale = SCREEN_W / LOOP_W;      // 0.25 — fit the whole loop (4096) to the screen width
    this.minorScale = this.majorScale * 4;    // 1.0  — the near view is 4× the far (§9.1)

    // Build the surface once. This is the SCAPE `LABS(MINTBL) + JSRL(section)` weave:
    // chaining the 16 sections with a cumulative DVG cursor lands each section's start
    // on its MINTBL baseline (the faithful check). Segments are WORLD DVG coords
    // (x 0..loopW, y = terrain height); only bri>0 strokes reach the callback.
    const segs = [], bounds = [], cur = { x: 0, y: SECTION_BASELINES[0] };
    SECTION_ORDER.forEach((key, i) => {
      bounds.push({ i, x0: cur.x, y: cur.y });
      runList(ROM598, [{ op: 'JSR', target: key }], cur, 0,
              (fx, fy, tx, ty) => segs.push({ fx, fy, tx, ty }));
      bounds[i].x1 = cur.x;                    // section x-range (feeds the terrain queries)
    });

    this.segs = segs;                          // world-coord segment list (render + queries)
    this.bounds = bounds;                      // per-section {i, x0, x1, y}
    this.faithful = bounds.every(b => b.y === SECTION_BASELINES[b.i]) &&
                    cur.x === LOOP_W && cur.y === SECTION_BASELINES[0];

    this.yMin = Infinity; this.yMax = -Infinity;
    for (const s of segs) {
      this.yMin = Math.min(this.yMin, s.fy, s.ty);
      this.yMax = Math.max(this.yMax, s.fy, s.ty);
    }
    // Major camera vertical base: puts yMin ~bottomMargin px above the screen bottom.
    // frameCamera adds SCRADD on top; the minor base is 0 (SCRADD carries it entirely).
    this.majorBaseY = this.yMin - 24 / this.majorScale;

    this.sites = this._buildSites();           // the 15 designated bonus landing sites (see below)
  }

  // Designate the bonus landing sites from the terrain flats (see the SITES note above). The 15
  // widest horizontal segments become sites; the TBSTFT multiplier is assigned by width rank.
  // Indexed by rank (0 = widest = 2X … 14 = narrowest = 5X) so `TABSIT` = index and the source's
  // "two low-band + two high-band" pick maps straight onto our index ranges.
  _buildSites() {
    const flats = [];
    for (const s of this.segs) {
      if (Math.abs(s.fy - s.ty) >= 0.5) continue;             // horizontal strokes only
      const x0 = Math.min(s.fx, s.tx), x1 = Math.max(s.fx, s.tx);
      if (x1 - x0 < SITE_MIN_WIDTH) continue;                 // too narrow to land the lander on
      flats.push({ x0, x1, y: s.fy, w: x1 - x0 });
    }
    return flats.sort((a, b) => b.w - a.w || a.x0 - b.x0)     // widest first (ties by x, stable)
      .slice(0, TBSTFT.length)
      .map((f, rank) => ({ rank, mult: TBSTFT[rank], x0: f.x0, x1: f.x1, cx: (f.x0 + f.x1) / 2, y: f.y, w: f.w }));
  }

  // Which designated site (if any) sits under worldX — the source's `LNDADR` X-match (:1863),
  // used by the scorer + the SITES flash. Returns the site {rank, mult, x0, x1, cx, y, w} or null.
  // FACTS only: whether a landing here PAYS the bonus depends on the site being one of the drop's
  // active TABSIT picks (`state.activeSites`) — that gate lives with the scorer (facts vs verdict).
  siteAt(worldX) {
    const x = ((worldX % this.loopW) + this.loopW) % this.loopW;
    for (const s of this.sites) if (x >= s.x0 && x <= s.x1) return s;
    return null;
  }

  // Frame the camera for the major (zoom-out) view: ¼ scale, terrain valleys near the
  // screen bottom. Used for the boot/IDLE framing (PLAY uses frameCamera each tick).
  setMajorCamera(cam) {
    cam.scale = this.majorScale;
    cam.y = this.majorBaseY;
  }

  // Per-frame camera framing from the shared scape state (the SCAPE positioning): scale +
  // scroll offsets → the camera the render layer reads. Called every PLAY tick (main.js).
  //   scale  : major 0.25 / minor 1.0 (from the zoom state)
  //   camera.x = scrollX wrapped into the loop; camera.y = scape base + scrollY
  frameCamera(state, camera) {
    const major = isMajor();
    camera.scale = major ? this.majorScale : this.minorScale;
    camera.x = ((state.scrollX % this.loopW) + this.loopW) % this.loopW;
    camera.y = (major ? this.majorBaseY : 0) + state.scrollY;
  }

  // The zoom transition + off-top reset (SCAPMJR/SCRLUP, research_physics.md §9.1), driven
  // by the REAL SCPDST (collision.clearance — min lower-corner clearance in minor, point
  // probe in major; world units) with hysteresis. Call each PLAY tick AFTER motion + frameCamera +
  // collision.update, and only while COLFLG is clear (SCAPCHG :2719-2721 blocks the zoom-out
  // on contact — main.js branches to the outcome instead).
  updateZoom(state, camera, alt) {
    if (isMajor()) {
      if (state.posY > OFFTOP_Y) {                 // flew off the top of the far view → restart
        resetFlight(OFFTOP_FUEL_PENALTY);
        this.frameCamera(state, camera);
      } else if (alt < GEOM.ZOOM_IN_ALT) {         // dropped close to the ground → snap to near view
        this._zoom(state, camera, true);
      }
    } else if (alt >= GEOM.ZOOM_OUT_ALT && state.velY > 0 && state.posY >= GEOM.WIN_YMAX - 1) {
      this._zoom(state, camera, false);            // climbed clear (ascending, high in window) → far view
    }
  }

  // Snap between scapes, preserving the world point under the ship (coordinate continuity).
  // The source does an exact SUMSA/SUMSUM conversion; we reproduce the visible result — note the
  // ship's world point (wx = horizontal, wy = its world height = altitude), flip the scape, then
  // place the ship + scroll so it still sits over that point at the new scale. The two scapes
  // differ vertically: MINOR floats (no fixed base — scrollY carries the height), MAJOR has a FIXED
  // base (SCRLUP zeroes SCRADD :2773-7), so on zoom-OUT the terrain must return to majorBaseY and
  // the altitude is carried by the ship's screen-Y instead. Horizontal continuity holds both ways.
  _zoom(state, camera, toMinor) {
    const wx = camera.x + state.posX / camera.scale;
    const wy = camera.y + state.posY / camera.scale;
    state.zoomedOut = !toMinor;                          // LUNARNUM V-bit flip
    const newScale = toMinor ? this.minorScale : this.majorScale;
    if (toMinor) {
      state.posX = GEOM.ZOOM_IN_SHIP_X;
      state.posY = GEOM.ZOOM_IN_SHIP_Y;
      state.scrollY = wy - state.posY / newScale;        // minor base 0 → scrollY holds the height
    } else {
      state.posX = GEOM.ZOOM_OUT_SHIP_X;
      state.posY = (wy - this.majorBaseY) * newScale;    // put the height into posY; base stays put
      state.scrollY = 0;                                 // restore the major terrain base (SCRLUP)
    }
    state.scrollX = wx - state.posX / newScale;          // horizontal continuity (both directions)
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
  // interpolates the surface y. THE terrain fact under the verdict: collision.js
  // probes it at the ship's four corner points (minor) or its bare origin (major)
  // to build the DISTY*/SCPDST clearances. Continuous float — already finer than
  // the source's integer world units; the verdict quantizes, not this query.
  // padAt/slopeAt (scoring) land with the GAMODE step, from this.segs/this.bounds.
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
