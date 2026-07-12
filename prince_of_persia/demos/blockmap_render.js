// blockmap_render.js — render a decoded PoP level as a solid-geometry block map.
// Factored out of blockmap.js so both the static level-1 block map (blockmap.html) and the
// interactive level viewer (level_viewer.html) draw with one code path. Draws to a caller-
// supplied <canvas> and RETURNS the status line; the caller owns its own info UI.
//
// No graphics: walls -> full solid blocks, floor-type tiles -> a ledge at the cell bottom (in
// PoP you stand ON floors, are blocked BY walls), everything else open. Rooms are laid out by
// following roomlinks. Solid classification uses the two collision predicates ported in
// collision.js:
//   tile_is_floor (seg006.c:951) -- has a floor to stand on
//   wall_type     (seg006.c:1626) -- is a vertical obstacle
// The level is rendered from an alter_mods'd CLONE, so potion/gate modifiers read at their
// runtime encoding (potion colour = pot_types[modifier>>3]) and the caller's level object (the
// shared LEVEL1, or a decoded level) is left untouched.
import { tileIsFloor, wallType } from '../collision.js';
import { alterModsAllrm, POT_TYPES } from '../leveldecode.js';

const COLS = 10, ROWS = 3;      // tiles per room
const CELL = 18;                // px per tile
const LEDGE = 5;                // floor-ledge thickness (px)
const RW = COLS * CELL, RH = ROWS * CELL;   // room px size

// --- lay out rooms: real (fully bidirectional) rooms on a grid; one-way-linked leftovers dangle ---
function layout(level) {
  const U = level.usedRooms;
  const linksOf = r => level.rooms[r - 1].links;

  // PRE-PASS — a room with ANY one-way (non-reciprocal) link is an editor leftover, not part of the
  // real playable map, so exclude it from the main grid up front. A link A --dir--> B is reciprocal iff
  // B links back to A in the opposite direction (left<->right, up<->down). (In level 13 all 12 one-way
  // links originate from such leftover rooms; its 11 real rooms are a clean bidirectional graph.)
  const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };
  const dangling = new Set();
  for (let r = 1; r <= U; r++) {
    const lk = linksOf(r);
    for (const dir of ['left', 'right', 'up', 'down']) {
      const t = lk[dir];
      if (t >= 1 && t <= U && linksOf(t)[OPP[dir]] !== r) { dangling.add(r); break; }
    }
  }

  const pos = new Map();                 // roomNumber -> {rx, ry}
  const occupied = new Set();            // "rx,ry" cells taken — final no-two-rooms-share-a-cell backstop
  const cellKey = (x, y) => x + ',' + y;
  // skipDangling = true for the main grid (exclude leftovers); false for the dangling pass (place them).
  function flood(start, ox, oy, skipDangling) {
    const q = [[start, ox, oy]];
    pos.set(start, { rx: ox, ry: oy }); occupied.add(cellKey(ox, oy));
    while (q.length) {
      const [r, x, y] = q.shift(), lk = linksOf(r);
      for (const [nb, nx, ny] of [[lk.left, x - 1, y], [lk.right, x + 1, y],
                                  [lk.up, x, y - 1], [lk.down, x, y + 1]]) {
        if (nb >= 1 && nb <= U && !pos.has(nb) && !occupied.has(cellKey(nx, ny))
            && !(skipDangling && dangling.has(nb))) {
          pos.set(nb, { rx: nx, ry: ny }); occupied.add(cellKey(nx, ny)); q.push([nb, nx, ny]);
        }
      }
    }
  }

  // MAIN grid: flood from the start room over the real (non-dangling) rooms only — a clean bidirectional
  // subgraph, so it embeds without conflicts.
  flood(level.start.room, 0, 0, true);
  const mainCount = pos.size;

  // DANGLING pass: every room still unplaced — the one-way leftovers plus any unreachable cluster — is
  // laid out below the main grid, each COMPONENT flooded via its own links (cell-gated so nothing
  // overlaps), one empty column between successive components.
  const cells = [...pos.values()];
  const minRx = Math.min(...cells.map(p => p.rx));
  const baseRow = Math.max(...cells.map(p => p.ry)) + 2;    // one empty row under main grid
  let col = minRx;
  for (let r = 1; r <= U; r++) {
    if (pos.has(r)) continue;
    const before = new Set(pos.keys());
    flood(r, col, baseRow, false);                          // place everything left, incl. leftovers
    let compMaxRx = col;                                     // rightmost column this component used
    for (const rr of pos.keys())
      if (!before.has(rr)) compMaxRx = Math.max(compMaxRx, pos.get(rr).rx);
    col = compMaxRx + 2;                                     // +1 past the room, +1 empty gap column
  }
  return { pos, mainCount, danglingCount: dangling.size };
}

// Door-link lines: each pressure button (drop 6 / raise 15) chains, via its bg modifier, to the
// gate(s) it triggers — walk doorLinks[i, i+1, …] while .next (seg007.c:720) and draw a line from the
// button to each gate it opens/closes. Targets in unplaced rooms are skipped.
function drawDoorLinks(g, level, pos, ox, oy) {
  const dls = level.doorLinks || [];
  g.save();
  g.strokeStyle = 'rgba(201,161,59,0.5)'; g.fillStyle = 'rgba(201,161,59,0.85)'; g.lineWidth = 1;
  for (let r = 1; r <= level.usedRooms; r++) {
    if (!pos.has(r)) continue;
    const room = level.rooms[r - 1];
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      const t = room.fg[row][col];
      if (t !== 6 && t !== 15) continue;                     // not a button
      const bx = ox(r) + col * CELL + CELL / 2, by = oy(r) + row * CELL + CELL / 2;
      let i = room.bg[row][col], steps = 0;
      while (i >= 0 && i < dls.length && steps < 256) {
        const dl = dls[i];
        if (dl && pos.has(dl.room)) {
          const gx = ox(dl.room) + (dl.tile % 10) * CELL + CELL / 2;
          const gy = oy(dl.room) + ((dl.tile / 10) | 0) * CELL + CELL / 2;
          g.beginPath(); g.moveTo(bx, by); g.lineTo(gx, gy); g.stroke();
          g.beginPath(); g.arc(gx, gy, 2, 0, 7); g.fill();   // dot marks the gate end
        }
        if (!dl || !dl.next) break;
        i++; steps++;
      }
    }
  }
  g.restore();
}

// Render `rawLevel` into `canvas`. Returns the status-line string for the caller to display.
export function renderLevel(canvas, rawLevel, opts = {}) {
  // Work on an alter_mods'd CLONE: potion/gate modifiers read at their runtime encoding and the
  // caller's level (the shared LEVEL1, or a decoded level) is never mutated.
  const level = structuredClone(rawLevel);
  alterModsAllrm(level);

  const { pos, mainCount, danglingCount } = layout(level);
  const P = [...pos.values()];
  const minRx = Math.min(...P.map(p => p.rx)), maxRx = Math.max(...P.map(p => p.rx));
  const minRy = Math.min(...P.map(p => p.ry)), maxRy = Math.max(...P.map(p => p.ry));
  const W = (maxRx - minRx + 1) * RW, H = (maxRy - minRy + 1) * RH;

  const cv = canvas;
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#0d1017'; g.fillRect(0, 0, W, H);

  const ox = r => (pos.get(r).rx - minRx) * RW;
  const oy = r => (pos.get(r).ry - minRy) * RH;

  for (const [r] of pos) {
    const bx = ox(r), by = oy(r), room = level.rooms[r - 1];
    // room backdrop + faint border
    g.fillStyle = '#141924'; g.fillRect(bx, by, RW, RH);
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      const t = room.fg[row][col];
      const x = bx + col * CELL, y = by + row * CELL;
      if (wallType(t) === 4) {                 // full solid wall block
        g.fillStyle = '#5b6b82'; g.fillRect(x, y, CELL, CELL);
        g.fillStyle = '#6f8199'; g.fillRect(x, y, CELL, 2);   // top highlight
      } else if (tileIsFloor(t)) {             // floor ledge at cell bottom
        g.fillStyle = (t === 11) ? '#8a7048' : '#7f8c5a';     // loose floor tinted
        g.fillRect(x, y + CELL - LEDGE, CELL, LEDGE);
      }
      // overlays for a few gameplay tiles so the map reads (potion tint needs its modifier)
      overlay(g, t, x, y, room.bg[row][col]);
    }
    // room border + number
    g.strokeStyle = '#2a3444'; g.lineWidth = 1;
    g.strokeRect(bx + 0.5, by + 0.5, RW - 1, RH - 1);
    g.fillStyle = '#3d4a5e'; g.font = '9px monospace';
    g.fillText(String(r), bx + 3, by + 10);
  }

  // door-link lines (button -> gate), drawn over the tiles but under the start/guard markers
  drawDoorLinks(g, level, pos, ox, oy);

  // start position marker (room, pos -> col/row)
  const s = level.start, sc = s.pos % 10, sr = (s.pos / 10) | 0;
  if (pos.has(s.room)) {
    const x = ox(s.room) + sc * CELL, y = oy(s.room) + sr * CELL;
    g.strokeStyle = '#54e0a0'; g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
  }
  // guards — a filled RECTANGLE (a standing figure on the tile's floor), so a guard reads by SHAPE
  // not just colour: it and a heal potion were both reddish dots before, easy to confuse.
  for (let r = 1; r <= level.usedRooms; r++) {
    const gd = level.rooms[r - 1].guard;
    if (gd && pos.has(r)) {
      const x = ox(r) + (gd.tile % 10) * CELL, y = oy(r) + ((gd.tile / 10) | 0) * CELL;
      const w = 6, h = 11;                                        // slim upright figure
      g.fillStyle = '#e05a5a';
      g.fillRect(x + (CELL - w) / 2, y + CELL - LEDGE - h, w, h); // standing on the floor ledge
    }
  }

  // Rooms outside the connected main grid: the one-way-linked leftovers flagged by the pre-pass, plus
  // any unreachable clusters. Both are stacked below as dangling rooms; no two rooms ever share a cell.
  const separate = pos.size - mainCount;
  const sepNote = separate
    ? ` · ${separate} room${separate > 1 ? 's' : ''} placed separately (${danglingCount} with one-way links)`
    : '';
  return `level ${level.number} — ${pos.size}/${level.usedRooms} rooms placed · `
    + `grid ${maxRx - minRx + 1}×${maxRy - minRy + 1} rooms · ${W}×${H}px · `
    + `start room ${s.room} (green) · guards (red)${sepNote}`;
}

// small colored marks over interactive tiles (drawn on top of block/ledge). `modif` is the tile's
// (alter_mods'd) bg byte — used only for the potion colour.
function overlay(g, t, x, y, modif) {
  const c = CELL, mid = c / 2;
  if (t === 4) {                                 // gate: vertical bars on right edge
    g.strokeStyle = '#c9a13b'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + c - 3, y); g.lineTo(x + c - 3, y + c); g.stroke();
  } else if (t === 16 || t === 17) {             // exit door
    g.fillStyle = '#c98a3b'; g.fillRect(x + 3, y + 2, c - 6, c - 4);
  } else if (t === 2) {                          // spikes
    g.strokeStyle = '#b04040'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x + 3, y + c - 1); g.lineTo(x + mid, y + c - 6);
    g.lineTo(x + c - 3, y + c - 1); g.stroke();
  } else if (t === 10) {                          // potion — tinted by TYPE (pot_types, modifier>>3)
    g.fillStyle = (POT_TYPES[modif >> 3] || POT_TYPES[0]).color;
    g.beginPath(); g.arc(x + mid, y + c - 8, 3, 0, 7); g.fill();
  } else if (t === 6 || t === 15) {              // pressure buttons
    g.fillStyle = t === 15 ? '#4a90d0' : '#d07a4a';
    g.fillRect(x + mid - 3, y + c - 4, 6, 3);
  }
}
