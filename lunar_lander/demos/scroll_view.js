// lunar_lander/demos/scroll_view.js — auto-scrolling terrain view
//
// Simulates the lander flying RIGHT: the terrain scrolls LEFT and WRAPS (the
// left edge re-emerges from the right), exactly as observed in MAME (frames
// 0000-0003, cross-correlated 2026-06-29). Three facts from that study drive
// this demo:
//   • the scroll is PURELY HORIZONTAL — no vertical pan, no zoom change in the
//     far (zoomed-out) view (dy=0 across all captured frames);
//   • a fixed vertical baseline — the deepest valley sits at y_up≈42 every frame;
//   • the terrain is one continuous loop that wraps (15 tiles × ~256 ≈ one
//     3840-unit loop, net dy=0 so it joins seamlessly end-to-end).
//
// Terrain is drawn EXACTLY as screen.html (same $5000-$507E tile vector data,
// the same fit-to-width + vertical-band scale + pad labels) — then scrolled left
// and wrapped: the whole loop slides past and the loop is drawn twice so the wrap
// seam is invisible (net dy=0, so the ends join). Tile sequence is the address-
// order approximation, same as screen.js (the real CPU order is still TBD).

import { ROM598, ROM599 } from '../discovery_rom_data.js';
import { runList } from '../dvg.js';

const W = 1024, H = 768;
const DIGIT_W = 12;
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');

// ---- glyphs (same mapping as screen.js / hud.html) ----
const GLYPH = { SPACE:'S_5726', COLON:'S_55B2', ARROW_RIGHT:'S_5566', ARROW_LEFT:'S_5576', ARROW_DOWN:'S_5598' };
const CHAR_GLYPH = { ' ':GLYPH.SPACE, ':':GLYPH.COLON, '0':'S_5688', 'X':'S_5702' };  // 0=letter-O alias; X for pad labels
[0x572A,0x5732,0x5742,0x5750,0x575E,0x576C,0x577A,0x5784,0x5794]
  .forEach((a,i)=>{ CHAR_GLYPH[String(i+1)] = 'S_'+a.toString(16).toUpperCase(); });

function drawText(str, px, py, scale, color) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  let penX = 0;
  for (const ch of str) {
    const key = CHAR_GLYPH[ch] || GLYPH.SPACE;
    const cur = { x:0, y:0 }; const segs = [];
    runList(ROM598, [{ op:'LABS', x:0, y:0, globalScale:0 }, { op:'JSR', target:key }],
            cur, 0, (fx,fy,tx,ty)=>segs.push({ fx,fy,tx,ty }));
    for (const s of segs) {
      const x0 = px + (penX + s.fx)*scale, y0 = py - s.fy*scale;
      if (s.fx===s.tx && s.fy===s.ty) { ctx.beginPath(); ctx.arc(x0,y0,Math.max(1,scale),0,7); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(px+(penX+s.tx)*scale, py - s.ty*scale); ctx.stroke(); }
    }
    penX += cur.x || DIGIT_W;
  }
  return penX;
}
function drawTextRight(str, rightX, py, scale, color) { drawText(str, rightX - str.length*DIGIT_W*scale, py, scale, color); }

function drawArrowCentered(key, px, digitPy, color) {
  const c = { x:0, y:0 }; const segs = []; let mn=1e9, mx=-1e9;
  runList(ROM598, [{ op:'LABS', x:0, y:0, globalScale:0 }, { op:'JSR', target:key }], c, 0,
          (fx,fy,tx,ty)=>{ segs.push({fx,fy,tx,ty}); mn=Math.min(mn,fy,ty); mx=Math.max(mx,fy,ty); });
  const py = digitPy - 6 + (mn+mx)/2;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  for (const s of segs) { ctx.beginPath(); ctx.moveTo(px+s.fx, py-s.fy); ctx.lineTo(px+s.tx, py-s.ty); ctx.stroke(); }
}

function drawLander(key, cx, cy, scale, color) {
  const segs = []; const c = { x:0, y:0 };
  runList(ROM599, [{ op:'LABS', x:0, y:0, globalScale:0 }, { op:'JSR', target:key }], c, 0,
          (fx,fy,tx,ty)=>segs.push({ fx,fy,tx,ty }));
  let a=1e9,b=-1e9,e=1e9,d=-1e9;
  for (const s of segs){ a=Math.min(a,s.fx,s.tx); b=Math.max(b,s.fx,s.tx); e=Math.min(e,s.fy,s.ty); d=Math.max(d,s.fy,s.ty); }
  const bcx=(a+b)/2, bcy=(e+d)/2;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  for (const s of segs){ ctx.beginPath(); ctx.moveTo(cx+(s.fx-bcx)*scale, cy-(s.fy-bcy)*scale); ctx.lineTo(cx+(s.tx-bcx)*scale, cy-(s.ty-bcy)*scale); ctx.stroke(); }
}

// ---- terrain definition (same tiles + flats as screen.js) ----
const TILES = ['S_5000','S_500A','S_5010','S_5016','S_5020','S_5026','S_502E','S_5038',
  'S_5040','S_504C','S_516E','S_5058','S_5060','S_506C','S_5072','S_507E'];
const TILE_FLATS = {
  S_5000:[[0,32],[40,72],[80,96]], S_500A:[[0,32]], S_5010:[[96,128]], S_5016:[[32,64]],
  S_5020:[[32,96]], S_5026:[], S_502E:[[0,32]], S_5038:[[0,32],[40,72],[80,96]],
  S_5040:[[128,160],[192,224]], S_504C:[[128,160]], S_5058:[[64,80],[224,256]],
  S_5060:[[192,256]], S_506C:[[128,256]], S_5072:[[32,64],[160,192]], S_507E:[[32,96]],
};
const TERRAIN_TOP = 404, TERRAIN_BASE = 739;   // vertical band (canvas y-down), from the MAME snapshot

// Build the loop once — IDENTICAL geometry/scale to screen.js drawTerrain: the
// whole tile chain fit to width W, height fit to the band, plus the pad flats.
// LW = the drawn loop width (= W); the scroll wraps at LW.
function buildTerrain() {
  const cur = { x:0, y:0 }; const segs = []; const tileStart = [];
  runList(ROM598, [{ op:'LABS', x:0, y:0, globalScale:0 }], cur, 0, ()=>{});
  for (const k of TILES) { tileStart.push(cur.x); runList(ROM598, [{ op:'JSR', target:k }], cur, 0, (fx,fy,tx,ty)=>segs.push({ fx,fy,tx,ty })); }
  let a=1e9, b=-1e9, e=1e9, d=-1e9;
  for (const s of segs){ a=Math.min(a,s.fx,s.tx); b=Math.max(b,s.fx,s.tx); e=Math.min(e,s.fy,s.ty); d=Math.max(d,s.fy,s.ty); }
  const sc = W/(b-a), ox = -a*sc, LW = (b-a)*sc;      // fit loop → W (same as screen.js); LW = wrap period
  const sy = (TERRAIN_BASE - TERRAIN_TOP)/(d - e);
  const yAt = fy => TERRAIN_BASE - (fy - e)*sy;       // lowest→BASE, peak→TOP
  const yAtX = cx => {                                // interpolate fy at DVG x
    for (const s of segs){ const lo=Math.min(s.fx,s.tx), hi=Math.max(s.fx,s.tx);
      if (cx>=lo && cx<=hi){ const t = hi>lo ? (cx-lo)/(hi-lo) : 0; const fyA = s.fx<=s.tx ? s.fy:s.ty, fyB = s.fx<=s.tx ? s.ty:s.fy; return fyA + (fyB-fyA)*t; } }
    return e;
  };
  // marked pads: a flat narrower than 128 carries a multiplier = 1 + 64/width.
  const pads = [];
  TILES.forEach((k,i)=>{ for (const [s0,s1] of (TILE_FLATS[k]||[])) {
    const w = s1-s0; if (w>=128) continue;
    const mult = Math.round(1 + 64/w);                // 16→5X, 32→3X, 64→2X
    const cx = tileStart[i] + (s0+s1)/2;
    pads.push({ x:cx, lab: mult+'X', fy: yAtX(tileStart[i]+s0) });
  }});
  return { segs, sc, ox, LW, yAt, pads };
}
const TERRAIN = buildTerrain();

function drawTerrainScrolled(scrollX) {
  const { segs, sc, ox, LW, yAt } = TERRAIN;
  ctx.strokeStyle = 'rgba(150,255,150,0.9)'; ctx.lineWidth = 1.4; ctx.lineCap='round'; ctx.lineJoin='round';
  for (const base of [-scrollX, -scrollX + LW]) {      // two copies → seamless wrap
    for (const s of segs) {
      const x0 = ox + s.fx*sc + base, x1 = ox + s.tx*sc + base;
      if (Math.max(x0,x1) < -4 || Math.min(x0,x1) > W+4) continue;   // cheap cull
      ctx.beginPath(); ctx.moveTo(x0, yAt(s.fy)); ctx.lineTo(x1, yAt(s.ty)); ctx.stroke();
    }
  }
  // pad multiplier labels (scroll with terrain)
  for (const base of [-scrollX, -scrollX + LW]) {
    for (const p of TERRAIN.pads) {
      const x = ox + p.x*sc + base; if (x < -20 || x > W+20) continue;
      drawText(p.lab, x - DIGIT_W, yAt(p.fy) + 22, 1, 'rgba(150,255,150,0.9)');
    }
  }
}

function drawHUD(hSpeed) {
  const segs = []; const cur = { x:0, y:0 };
  runList(ROM598, ROM598['S_5458'], cur, 0, (fx,fy,tx,ty,bri)=>segs.push({ fx,fy,tx,ty,bri }));
  ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  for (const s of segs){ ctx.beginPath(); ctx.moveTo(s.fx, H-s.fy); ctx.lineTo(s.tx, H-s.ty);
    ctx.strokeStyle = `rgba(0,255,0,${Math.max(0.4, s.bri/15)})`; ctx.stroke(); }
  const v = 'rgba(0,255,0,0.95)';
  const LEFT_X = 204, RIGHT_X = 878;          // confirmed value columns (MAME frame 0001)
  drawText('0000', LEFT_X, 20, 1, v);
  drawText('00:30', LEFT_X, 48, 1, v);
  drawText('7000', LEFT_X, 76, 1, v);
  drawTextRight('1800', RIGHT_X, 20, 1, v);
  drawTextRight(String(hSpeed), RIGHT_X, 48, 1, v);
  drawTextRight('0', RIGHT_X, 76, 1, v);
  drawArrowCentered(dir >= 0 ? GLYPH.ARROW_RIGHT : GLYPH.ARROW_LEFT, RIGHT_X, 48, v);   // arrow follows travel direction
}

function render(scrollX, hSpeed) {
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,W,H);
  drawTerrainScrolled(scrollX);
  drawHUD(hSpeed);
  drawLander('S_4DB6', 512, 150, 1, 'rgba(0,255,0,1)');   // hovering far-view lander
}

// ---- animation ----
let scrollX = 0, speed = 140, dir = 1, paused = false, last = 0;   // dir: +1 slides left (fly right), -1 reverses
function frame(ts) {
  const dt = last ? Math.min(0.05, (ts - last)/1000) : 0; last = ts;
  if (!paused) {
    scrollX += dir * speed * dt;                                   // ping-pong: slide one screen, then reverse
    if (scrollX >= TERRAIN.LW) { scrollX = TERRAIN.LW; dir = -1; }
    else if (scrollX <= 0)     { scrollX = 0; dir =  1; }
  }
  syncBackingStore();
  render(scrollX, Math.round(speed));
  requestAnimationFrame(frame);
}

function syncBackingStore() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || W, cssH = canvas.clientHeight || H;
  canvas.width = Math.max(1, Math.floor(cssW*dpr));
  canvas.height = Math.max(1, Math.floor(cssH*dpr));
  ctx.setTransform(canvas.width/W, 0, 0, canvas.height/H, 0, 0);
}

document.getElementById('speed')?.addEventListener('input', e => { speed = +e.target.value; document.getElementById('speedval').textContent = speed; });
document.getElementById('pause')?.addEventListener('click', e => { paused = !paused; e.target.textContent = paused ? 'Resume' : 'Pause'; });
window.addEventListener('resize', () => { syncBackingStore(); render(scrollX, Math.round(speed)); });
syncBackingStore(); render(scrollX, Math.round(speed));   // draw frame 0 immediately; rAF then animates
requestAnimationFrame(frame);
