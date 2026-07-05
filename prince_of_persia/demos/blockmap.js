// blockmap.js -- render level 1's SOLID collision geometry as a block map,
// straight from res/level1.js. No graphics: walls -> full solid blocks, floor-type
// tiles -> a ledge at the cell bottom (in PoP you stand ON floors, are blocked BY
// walls), everything else open. Rooms are laid out by following roomlinks.
//
// Solid classification ports the two collision predicates from SDLPoP seg006.c:
//   tile_is_floor (seg006.c:951) -- has a floor to stand on
//   wall_type     (seg006.c:1626) -- is a vertical obstacle
import { LEVEL1 } from '../res/level1.js';

const COLS = 10, ROWS = 3;      // tiles per room
const CELL = 18;                // px per tile
const LEDGE = 5;                // floor-ledge thickness (px)
const RW = COLS * CELL, RH = ROWS * CELL;   // room px size

// --- collision predicates (ported seg006.c) ---
const NOT_FLOOR = new Set([0, 9, 12, 20, 26, 27, 28, 29]); // seg006.c:951 exclusions
const tileIsFloor = t => !NOT_FLOOR.has(t);
function wallType(t) {                                       // seg006.c:1626
  if (t === 4 || t === 7 || t === 12) return 1;   // wall at right
  if (t === 13) return 2;                          // wall at left (mirror)
  if (t === 18) return 3;                          // chomper
  if (t === 20) return 4;                          // wall both sides
  return 0;
}

// --- lay out rooms on a grid by flood-filling roomlinks from the start room ---
function layout(level) {
  const pos = new Map();                 // roomNumber -> {rx, ry}
  function flood(start, ox, oy) {
    const q = [[start, ox, oy]]; pos.set(start, { rx: ox, ry: oy });
    while (q.length) {
      const [r, x, y] = q.shift(), lk = level.rooms[r - 1].links;
      for (const [nb, nx, ny] of [[lk.left, x - 1, y], [lk.right, x + 1, y],
                                  [lk.up, x, y - 1], [lk.down, x, y + 1]]) {
        if (nb >= 1 && nb <= level.usedRooms && !pos.has(nb)) {
          pos.set(nb, { rx: nx, ry: ny }); q.push([nb, nx, ny]);
        }
      }
    }
  }
  flood(level.start.room, 0, 0);
  // Rooms unreachable from the start room are map-editor leftovers (kept, as evidence).
  // Lay each leftover COMPONENT below the main grid, left-aligned to the leftmost
  // column, with one empty column between successive components. For level 1 this puts
  // the 13<->18 pair in the leftmost column and the orphan 24 two columns over (gap).
  const cells = [...pos.values()];
  const minRx = Math.min(...cells.map(p => p.rx));
  const baseRow = Math.max(...cells.map(p => p.ry)) + 2;    // one empty row under main grid
  let col = minRx;
  for (let r = 1; r <= level.usedRooms; r++) {
    if (pos.has(r)) continue;
    const before = new Set(pos.keys());
    flood(r, col, baseRow);
    let compMaxRx = col;                                     // rightmost column this component used
    for (const rr of pos.keys())
      if (!before.has(rr)) compMaxRx = Math.max(compMaxRx, pos.get(rr).rx);
    col = compMaxRx + 2;                                     // +1 past the room, +1 empty gap column
  }
  return pos;
}

function render(level) {
  const pos = layout(level);
  const P = [...pos.values()];
  const minRx = Math.min(...P.map(p => p.rx)), maxRx = Math.max(...P.map(p => p.rx));
  const minRy = Math.min(...P.map(p => p.ry)), maxRy = Math.max(...P.map(p => p.ry));
  const W = (maxRx - minRx + 1) * RW, H = (maxRy - minRy + 1) * RH;

  const cv = document.getElementById('map');
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
      // overlays for a few gameplay tiles so the map reads
      overlay(g, t, x, y);
    }
    // room border + number
    g.strokeStyle = '#2a3444'; g.lineWidth = 1;
    g.strokeRect(bx + 0.5, by + 0.5, RW - 1, RH - 1);
    g.fillStyle = '#3d4a5e'; g.font = '9px monospace';
    g.fillText(String(r), bx + 3, by + 10);
  }

  // start position marker (room, pos -> col/row)
  const s = level.start, sc = s.pos % 10, sr = (s.pos / 10) | 0;
  if (pos.has(s.room)) {
    const x = ox(s.room) + sc * CELL, y = oy(s.room) + sr * CELL;
    g.strokeStyle = '#54e0a0'; g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
  }
  // guards
  for (let r = 1; r <= level.usedRooms; r++) {
    const gd = level.rooms[r - 1].guard;
    if (gd && pos.has(r)) {
      const x = ox(r) + (gd.tile % 10) * CELL, y = oy(r) + ((gd.tile / 10) | 0) * CELL;
      g.fillStyle = '#e05a5a'; g.beginPath();
      g.arc(x + CELL / 2, y + CELL / 2, 4, 0, 7); g.fill();
    }
  }

  document.getElementById('info').textContent =
    `level ${level.number} — ${pos.size}/${level.usedRooms} rooms placed · ` +
    `grid ${maxRx - minRx + 1}×${maxRy - minRy + 1} rooms · ${W}×${H}px · ` +
    `start room ${s.room} (green) · guards (red)`;
}

// small colored marks over interactive tiles (drawn on top of block/ledge)
function overlay(g, t, x, y) {
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
  } else if (t === 10) {                          // potion
    g.fillStyle = '#c65ad0'; g.beginPath(); g.arc(x + mid, y + c - 8, 3, 0, 7); g.fill();
  } else if (t === 6 || t === 15) {              // pressure buttons
    g.fillStyle = t === 15 ? '#4a90d0' : '#d07a4a';
    g.fillRect(x + mid - 3, y + c - 4, 6, 3);
  }
}

render(LEVEL1);
