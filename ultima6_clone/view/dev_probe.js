// Cell probe + drag-to-pan installer — extracted from main.js's startRender()
// (I-7a). Owns: pointerdown/move/up/cancel canvas drag-pan; the I-4d
// describeCell + 16×16 highlight overlay; the I-5f per-NPC schedule line.
// Kept across remaining impl steps as a dev affordance.
//
// Exposes { isDragging, getLastCell } so I-7's `I` hotkey can gate on
// "don't fire mid-pan" and read the most-recently-described cell without
// re-running the probe logic on the keypress.

import { TileRegistry } from '../resources/tile_registry.js';
import { MapLevel } from '../resources/map_level.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { Camera } from '../resources/camera.js';
import { WorldClock } from '../resources/world_clock.js';
import { canStandAt } from '../systems/passability.js';
import { forEachOccupiedCell } from '../systems/tile_footprint.js';
import { Renderable, Actor, Schedule } from '../components/components.js';
import { Schedules } from '../resources/schedules.js';
import { AiAction } from '../assets/schedule.js';

export function installDevProbe(world, { canvas, ts, probeEl, cellEl, objlist, schedules, isVerbArmed }) {
  // drag-to-pan
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (isVerbArmed && isVerbArmed()) return;                  // I-10f: armed targeting expects a click-to-confirm, not a pan
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    cellEl.style.display = 'none';                              // I-4d: hide the probe highlight during drag-pan
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    world.getResource(Camera).pan(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // I-4d cell probe + I-5f schedule probe: hover-to-inspect overlay on the
  // dev HUD. Shows the cell under the cursor, terrain tile + key flags,
  // per-cell object tile ids, canStandAt verdict, AND for any NPC entity
  // in the cell its current schedule slot (action, target xyz) +
  // active-area status.
  const rendStore = world.store(Renderable);
  const actorStore = world.store(Actor);
  // Reverse of AiAction: action code (e.g. 0x91) -> name (e.g. "SLEEP").
  // Built once; consumed by the schedule probe to decode the resolver's
  // `action`.
  const actionName = new Map(Object.entries(AiAction).map(([k, v]) => [v, k]));

  // The cursor's last position WITHIN the canvas (screen px), or null when the pointer is
  // outside it. The world cell under it is DERIVED ON DEMAND (cellFromScreen) from the
  // current camera + active level — NOT cached — so after a level change / teleport (camera
  // recenters, surface↔dungeon scale flips) getLastCell reflects the cell the cursor now
  // points at, not a stale pre-teleport coordinate. (Bug it fixes: USE a ladder down, then
  // USE again without moving the mouse → "Out of range!", because the cached cell was still
  // a surface coordinate far from the dungeon avatar; the active-level wrap was also pinned
  // to 1024 so dungeon cells past the 256 seam came out wrong.)
  let lastScreen = null;

  // Screen px (within the canvas) -> world cell on the ACTIVE level. Wraps to the active
  // level's width (MapLevel.tilesWide: 1024 surface / 256 dungeon).
  function cellFromScreen(sx, sy) {
    const cam = world.getResource(Camera);
    const W = world.getResource(MapLevel).tilesWide;
    const tx = (Math.floor((cam.worldX + sx) / ts) % W + W) % W;
    const ty = (Math.floor((cam.worldY + sy) / ts) % W + W) % W;
    return { x: tx, y: ty };
  }

  function describeCell(x, y) {
    const reg = world.getResource(TileRegistry);
    const lvl = world.getResource(MapLevel);
    const spatial = world.getResource(SpatialIndex);
    const clock = world.getResource(WorldClock);

    const tT = lvl.tileAt(x, y);
    const tFlags = [];
    if (reg.isTerrainImpassable(tT)) tFlags.push('impass');
    if (reg.isTerrainWet(tT)) tFlags.push('wet');
    if (reg.isTerrainWall(tT)) tFlags.push('wall');
    if (reg.isTerrainDamage(tT)) tFlags.push('damage');

    const objs = [];
    const npcs = [];                                    // schedule lines, one per NPC entity in the cell
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const ents = spatial.at(x + dx, y + dy);
        if (!ents) continue;
        for (let k = ents.length - 1; k >= 0; k--) {
          const handle = ents[k];
          const id = world.resolve(handle);
          if (id === -1) continue;
          let tile = -1;
          forEachOccupiedCell(reg, rendStore.tileId[id], x + dx, y + dy, (t, col, row) => {
            if (col === x && row === y) tile = t;
          });
          if (tile === -1) continue;
          const lbl = [];
          if (world.has(handle, Actor)) lbl.push('NPC');
          if (reg.isBreakthrough(tile)) lbl.push('br');
          if (reg.isTileIgnore(tile)) lbl.push('ig');
          if (reg.isTerrainImpassable(tile)) lbl.push('impass');
          objs.push(`t#${tile}${lbl.length ? '[' + lbl.join(',') + ']' : ''}`);

          // I-5f schedule probe: surface the NPC's resolved slot for this
          // hour. Display name falls through party-Names → look.lzd, mirroring
          // source's GetObjectString (seg_1184.c:1912): party members get
          // their objlist Names[] entry; everyone else gets the tile's
          // look.lzd string ("Lord British", "musician", etc.).
          if (world.has(handle, Actor)) {
            const npcId = actorStore.npcId[id];
            const partyName = (() => {
              if (!objlist?.party) return null;
              for (let p = 0; p < objlist.partySize; p++)
                if (objlist.party[p] === npcId) return objlist.actors[npcId]?.name;
              return null;
            })();
            const look = reg.tiles?.getTileLook?.(rendStore.tileId[id]);
            const name = partyName ?? ((look && look !== 'Unknown') ? look : '(NPC)');
            if (world.has(handle, Schedule) && schedules) {
              const dow = Schedules.dayOfWeek(clock.Date_D);
              const slot = schedules.resolveSlotAt(npcId, clock.Time_H, dow);
              const slotStr = slot
                ? `slot ${slot.slotIndex}: ${actionName.get(slot.action) ?? '0x' + slot.action.toString(16)} (hour ${slot.hour}, day ${slot.day}) → (${slot.x},${slot.y},${slot.z})`
                : `no slot at hour ${clock.Time_H} day ${dow}`;
              const active = spatial.hasRegionAt(x + dx, y + dy);
              npcs.push(`NPC #${npcId} "${name}" · ${slotStr} · active=${active ? 'YES' : 'NO'}`);
            } else {
              npcs.push(`NPC #${npcId} "${name}" · (no schedule)`);
            }
          }
        }
      }
    }

    return {
      // Split into two fields so the cell/terrain/stand summary and the
      // variable-length object list render on separate lines (the objs line
      // wraps within the fixed-width HUD instead of stretching it).
      cell: `(${x},${y}) terrain t#${tT}${tFlags.length ? '[' + tFlags.join('+') + ']' : ''}`,
      objs: objs.length ? '[' + objs.join(' ') + ']' : 'none',
      npcs,
      stand: canStandAt(world, x, y),
    };
  }

  function updateProbe(e) {
    if (dragging) return;                                         // freeze probe + highlight while panning
    const cam = world.getResource(Camera);
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (sx < 0 || sy < 0 || sx >= rect.width || sy >= rect.height) return;
    lastScreen = { sx, sy };
    const { x: tx, y: ty } = cellFromScreen(sx, sy);
    const d = describeCell(tx, ty);
    // Cell/stand line, then the objs line (variable length → its own line so a
    // crowded cell wraps within the fixed-width HUD), then the NPC line(s) — always
    // present ("NPC: none" when the cell has none) so the probe is a consistent
    // height and the HUD doesn't jump as the cursor crosses NPC vs non-NPC cells
    // (I-5f). innerHTML for the <br>; cell / NPC strings come from describeCell
    // which doesn't accept user input, so we're not escaping for an external string.
    const npcLines = d.npcs.length ? d.npcs : ['NPC: none'];
    const lines = [`${d.cell} · stand=${d.stand ? 'YES' : 'NO'}`, `objs: ${d.objs}`, ...npcLines];
    probeEl.innerHTML = lines.join('<br>');
    probeEl.classList.toggle('pass', d.stand);
    probeEl.classList.toggle('blocked', !d.stand);
    // Position the 1px highlight rectangle on the cell. Computed from the
    // cursor's tile-snapped pixel inside the canvas (avoids wrap edge-
    // cases with tx/ty); result is the same pixel the renderer paints at.
    const offX = ((cam.worldX % ts) + ts) % ts;
    const offY = ((cam.worldY % ts) + ts) % ts;
    cellEl.style.left = (rect.left + Math.floor((sx + offX) / ts) * ts - offX) + 'px';
    cellEl.style.top  = (rect.top  + Math.floor((sy + offY) / ts) * ts - offY) + 'px';
    cellEl.style.display = 'block';
  }

  canvas.addEventListener('pointermove', updateProbe);
  canvas.addEventListener('pointerleave', () => {
    probeEl.textContent = 'hover the map…';
    probeEl.classList.remove('pass', 'blocked');
    cellEl.style.display = 'none';
    lastScreen = null;
  });

  return {
    isDragging: () => dragging,
    // Derived from the current camera + active level each call, so it stays correct after a
    // teleport / level change even if the mouse hasn't moved (see lastScreen note above).
    getLastCell: () => (lastScreen ? cellFromScreen(lastScreen.sx, lastScreen.sy) : null),
  };
}
