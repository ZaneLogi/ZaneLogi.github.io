// Moongate player-facing HUD (I-moongate sub-steps h + g): the composited sky strip
// (clock panel) + the gate/phase dev readout. Both ride on the moon-phase clock (b).
//
//   sky view (h) — a faithful, composited recreation of source's status-bar sky scene
//     (C_2FC1_19C5, seg_2FC1.c:677), branching on the active level:
//       outside (0/5): sky base (TIL_19B x9) + sun (TIL_169/16A/16B by hour) + the two
//                      moon glyphs (the moonstone phase tile by slot) + mountain ridge
//                      (TIL_160+0..8), arc-placed via D_2BFA; eclipse hides the moons +
//                      swaps the eclipse sun.
//       cave (1-4):    cave backdrop (TIL_174 / 175 x7 / TIL_176), no sun/moons.
//     Rendered into a <canvas> via tileIcon (CPU tile pixels -> palette), composited
//     with drawImage so the colour-keyed transparency layers correctly (mountain over
//     sun/moons = "rising behind the ridge"). Re-composited only when the scene key
//     changes (level / hour / eclipse / moon slot+phase) — i.e. ~hourly, not per frame.
//
//   gate readout (g) — a diagnostic line (dev panel): each moon's slot + phase + today's
//     gate destination (the live D_2C74 endpoint). Coords in decimal (matches the probe).
//
// Decision (research_moongate.md §9 / progress.md §"I-moongate scope"): the dev HUD stays
// player-visible (the clone is its own experience, not a 1:1 of the original); the sky
// strip lives in the clock panel, the readout in the dev-stats block. No D_2C55 tint.

import { MoonGates } from '../resources/moon_gates.js';
import { MapLevel } from '../resources/map_level.js';
import { WorldClock } from '../resources/world_clock.js';
import { tileIcon } from './ui_icons.js';
import {
  OBJ_MOONSTONE, D_2BFA, TIL_SKY_BASE, TIL_MOUNTAIN_0,
  TIL_SUN_DUSK, TIL_SUN_DAY, TIL_SUN_ECLIPSE, TIL_CAVE_0, TIL_CAVE_1, TIL_CAVE_2,
} from '../assets/moon_tables.js';

export const SKY_W = 144;   // 9 tiles x 16px
// Source draws the base/mountain row at y=4 and the sun/moon arc at y=0..10+16. We crop
// SKY_TOP off the top (so the hills sit flush, no sky gap) and the dead sub-ridge overflow
// off the bottom — the scene ops keep source-faithful y's; the blitter applies the offset.
const SKY_TOP = 4;
export const SKY_H = 16;    // the base/mountain band height (y=4..20 shifted up by SKY_TOP)

// Is today an eclipse? (seg_2FC1.c:682 — first of every third month; the SpellFx[15]
// magical-eclipse arm has no clone counterpart yet.)
export function isEclipseDay(clock) { return clock.Date_D === 1 && (clock.Date_M % 3) === 0; }

// Pure scene description: the ordered list of tile draws for the current sky, as
// { tile } (raw tile id) or { obj, frame } (object glyph, resolved through the registry).
// Order = source's paint order (base -> sun -> moons -> mountain), so a later op composites
// OVER an earlier one (the ridge occludes the lower sun/moon). seg_2FC1.c:684-712.
export function computeSkyScene(level, clock, moons) {
  const ops = [];
  if (level === 0 || level === 5) {
    const eclipse = isEclipseDay(clock);
    for (let c = 0; c < 9; c++) ops.push({ tile: TIL_SKY_BASE, x: c * 16, y: 4 });   // sky backdrop
    const H = clock.Time_H;
    if (H > 4 && H < 20) {                                                            // the sun (05:00-19:59)
      const sun = eclipse ? TIL_SUN_ECLIPSE : (H === 5 || H === 19) ? TIL_SUN_DUSK : TIL_SUN_DAY;
      ops.push({ tile: sun, x: (19 - H) << 3, y: D_2BFA[19 - H] });
    }
    if (!eclipse && moons) {                                                          // the two moons (h2)
      if (moons.trammelPhase >= 0 && moons.trammelPhase <= 14)
        ops.push({ obj: OBJ_MOONSTONE, frame: moons.trammelSlot, x: moons.trammelPhase << 3, y: D_2BFA[moons.trammelPhase] });
      if (moons.feluccaPhase >= 0 && moons.feluccaPhase <= 14)
        ops.push({ obj: OBJ_MOONSTONE, frame: moons.feluccaSlot, x: moons.feluccaPhase << 3, y: D_2BFA[moons.feluccaPhase] });
    }
    for (let c = 0; c < 9; c++) ops.push({ tile: TIL_MOUNTAIN_0 + c, x: c * 16, y: 4 });   // ridge, over the top
  } else {                                                                            // a cave (levels 1-4)
    ops.push({ tile: TIL_CAVE_0, x: 0, y: 4 });
    for (let c = 1; c < 8; c++) ops.push({ tile: TIL_CAVE_1, x: c * 16, y: 4 });
    ops.push({ tile: TIL_CAVE_2, x: 8 * 16, y: 4 });
  }
  return ops;
}

// A short key capturing everything the scene depends on — recompute only when it changes.
function sceneKey(level, clock, moons) {
  return [level, clock.Time_H, isEclipseDay(clock) ? 1 : 0,
    moons.trammelSlot, moons.trammelPhase, moons.feluccaSlot, moons.feluccaPhase].join('|');
}

// Decimal "(x,y)" for an endpoint, or "—" for an unburied (all-zero) slot.
function destStr(moons, slot) {
  const [x, y, z] = moons.gateDest(slot);
  if (!(x || y || z)) return '—';
  return `(${x},${y}${z ? `,z${z}` : ''})`;
}

export function installMoongateHud(world, { skyEl, readoutEl, reg }) {
  const moons = world.getResource(MoonGates);
  const mapLevel = world.getResource(MapLevel);
  const clock = world.getResource(WorldClock);
  if (!moons || !mapLevel || !clock) return;

  let lastKey = null;
  const ctx = skyEl ? skyEl.getContext('2d') : null;
  if (skyEl) { skyEl.width = SKY_W; skyEl.height = SKY_H; }

  function drawSky() {
    if (!ctx) return;
    ctx.clearRect(0, 0, SKY_W, SKY_H);
    const level = mapLevel.level;
    // SKY_TOP crops the OUTDOOR sky gap (the base sits at y=4 with the sun/moon arc filling
    // the space above it). The cave backdrop has no arc — its tiles ARE the content, and only
    // their top ~9px is opaque — so it must NOT be cropped, else that imagery jams against the
    // canvas top with a dead band below. Cave keeps its natural y=4 → a small top margin.
    const topCrop = (level === 0 || level === 5) ? SKY_TOP : 0;
    for (const op of computeSkyScene(level, clock, moons)) {
      const tileId = op.tile !== undefined ? op.tile : reg.tileForObject(op.obj, op.frame);
      ctx.drawImage(tileIcon(reg, tileId), op.x, op.y - topCrop);   // drawImage alpha-composites the colour-keyed tile
    }
  }

  world.addRenderSystem(() => {
    const key = sceneKey(mapLevel.level, clock, moons);
    if (key === lastKey) return;                          // unchanged (most frames) — skip the recomposite
    lastKey = key;
    drawSky();
    if (readoutEl) {
      readoutEl.textContent = mapLevel.level === 0 || mapLevel.level === 5
        ? `moons · Trammel s${moons.trammelSlot}/ph${moons.trammelPhase} → ${destStr(moons, moons.trammelSlot)}` +
          ` · Felucca s${moons.feluccaSlot}/ph${moons.feluccaPhase} → ${destStr(moons, moons.feluccaSlot)}`
        : 'moons · (underground)';
    }
  });
}
