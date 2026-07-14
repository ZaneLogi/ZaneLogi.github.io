// render.js — draws the game to canvas. Visual assets are not the point
// (see ../docs/research_gameplay.md); we draw plain colored cells.

import { COLS, ROWS, TILE_EMPTY, TILE1, TILE2, TILE3, TILE_HIDDEN, TILE_CURTAIN } from './constants.js';
import { ORIENTATIONS, TYPE_FROM_ORIENTATION } from './pieces.js';
import { PS } from './game.js';

export const CELL = 24;
const BOARD_X = 20;
const BOARD_Y = 20;
const PANEL_X = BOARD_X + COLS * CELL + 24;

export const CANVAS_W = PANEL_X + 150;
export const CANVAS_H = BOARD_Y + ROWS * CELL + 20;

// Clickable gameplay toggles drawn in the panel; hit-tested by main.js via
// toggleHitTest (kept in sync with the drawing below).
const TOG_X = PANEL_X;
const TOG_Y0 = BOARD_Y + 192;
const TOG_DY = 26;
const TOG_BOX = 14;
const TOG_ROW_W = 130;
const TOGGLE_KEYS = ['ghost', 'harddrop'];
const TOGGLE_LABELS = ['Ghost', 'Hard drop'];

// tile color group -> fill (the 3 NES color groups; arbitrary distinct hues).
const TILE_COLOR = {
  [TILE1]: '#2dd4bf', // {T, O, I}
  [TILE2]: '#f59e0b', // {Z, L}
  [TILE3]: '#60a5fa', // {J, S}
  [TILE_CURTAIN]: '#64748b', // game-over curtain
};

const PIECE_NAME = ['T', 'J', 'Z', 'O', 'S', 'L', 'I'];

function drawCell(ctx, px, py, color) {
  ctx.fillStyle = color;
  ctx.fillRect(px, py, CELL, CELL);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
}

// Ghost (landing shadow): faint fill + colored outline.
function drawGhostCell(ctx, px, py, color) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = color;
  ctx.fillRect(px, py, CELL, CELL);
  ctx.restore();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
}

export function render(ctx, game) {
  const { playfield, currentPiece, nextPiece } = game;

  // background
  ctx.fillStyle = '#0f1220';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // board well
  ctx.fillStyle = '#181c2e';
  ctx.fillRect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL);

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(BOARD_X + c * CELL + 0.5, BOARD_Y);
    ctx.lineTo(BOARD_X + c * CELL + 0.5, BOARD_Y + ROWS * CELL);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(BOARD_X, BOARD_Y + r * CELL + 0.5);
    ctx.lineTo(BOARD_X + COLS * CELL, BOARD_Y + r * CELL + 0.5);
    ctx.stroke();
  }

  // locked cells
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = playfield.get(x, y);
      if (tile < TILE_EMPTY) {
        drawCell(ctx, BOARD_X + x * CELL, BOARD_Y + y * CELL, TILE_COLOR[tile] || '#888');
      }
    }
  }

  // ghost (optional toggle) + active piece — both hidden during the wipe / game over
  const ori = ORIENTATIONS[currentPiece];
  const pieceColor = TILE_COLOR[ori.tile] || '#fff';
  const activeVisible = ori.tile !== TILE_HIDDEN && game.playState !== PS.GAME_OVER;

  if (activeVisible && game.options && game.options.ghost && game.playState === PS.CONTROL) {
    let gy = game.tetriminoY;
    while (playfield.isPositionValid(currentPiece, game.tetriminoX, gy + 1)) gy++;
    if (gy > game.tetriminoY) { // draw only below the active piece
      for (const [dy, dx] of ori.cells) {
        const by = gy + dy;
        if (by < 0) continue;
        drawGhostCell(ctx, BOARD_X + (game.tetriminoX + dx) * CELL, BOARD_Y + by * CELL, pieceColor);
      }
    }
  }
  if (activeVisible) {
    for (const [dy, dx] of ori.cells) {
      const by = game.tetriminoY + dy;
      if (by < 0) continue; // vanish zone above the board
      drawCell(ctx, BOARD_X + (game.tetriminoX + dx) * CELL, BOARD_Y + by * CELL, pieceColor);
    }
  }

  // next-piece box
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '14px monospace';
  ctx.fillText('NEXT', PANEL_X, BOARD_Y + 14);
  const nOri = ORIENTATIONS[nextPiece];
  const nColor = TILE_COLOR[nOri.tile] || '#fff';
  const nx = PANEL_X + 40, ny = BOARD_Y + 60;
  for (const [dy, dx] of nOri.cells) {
    drawCell(ctx, nx + dx * CELL, ny + dy * CELL, nColor);
  }

  // HUD — score / lines / level
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '13px monospace';
  ctx.fillText(`SCORE ${String(game.score).padStart(6, '0')}`, PANEL_X, BOARD_Y + 120);
  ctx.fillText(`LINES ${String(game.lines).padStart(3, '0')}`, PANEL_X, BOARD_Y + 140);
  ctx.fillText(`LEVEL ${String(game.levelNumber).padStart(2, '0')}`, PANEL_X, BOARD_Y + 160);

  // gameplay toggles (clickable — hit-tested in main.js via toggleHitTest)
  for (let i = 0; i < TOGGLE_KEYS.length; i++) {
    const y = TOG_Y0 + i * TOG_DY;
    const on = game.options && game.options[TOGGLE_KEYS[i]];
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(TOG_X + 0.5, y + 0.5, TOG_BOX, TOG_BOX);
    if (on) {
      ctx.fillStyle = '#2dd4bf';
      ctx.fillRect(TOG_X + 3, y + 3, TOG_BOX - 6, TOG_BOX - 6);
    }
    ctx.fillStyle = on ? '#e2e8f0' : '#94a3b8';
    ctx.font = '13px monospace';
    ctx.fillText(TOGGLE_LABELS[i], TOG_X + TOG_BOX + 8, y + TOG_BOX - 2);
  }

  // debug overlay
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px monospace';
  const valid = playfield.isPositionValid(currentPiece, game.tetriminoX, game.tetriminoY);
  const bits = (b) => (b & 0xFF).toString(2).padStart(8, '0');
  const lines = [
    `frame ${String(game.frameCounter).padStart(6)}`,
    `piece ${PIECE_NAME[TYPE_FROM_ORIENTATION[currentPiece]]} ori 0x${currentPiece.toString(16).padStart(2, '0')}`,
    `state ${game.playState}`,
    `x,y   ${String(game.tetriminoX).padStart(2)},${String(game.tetriminoY).padStart(2)}`,
    `valid ${valid ? 'y' : 'n'}`,
    `dasX  ${String(game.autorepeatX).padStart(3)}`,
    `dropY ${String(game.autorepeatY).padStart(3)}`,
    `hdPts ${String(game.holdDownPoints).padStart(3)}`,
    `held  ${bits(game.heldButtons)}`,
    '',
    'move ←→  soft ↓',
    'rotate Z/X  hard ↑',
    'debug 1-7 = piece',
  ];
  lines.forEach((t, i) => ctx.fillText(t, PANEL_X, BOARD_Y + 250 + i * 16));

  // game-over banner
  if (game.playState === PS.GAME_OVER) {
    const cx = BOARD_X + (COLS * CELL) / 2;
    const cy = BOARD_Y + (ROWS * CELL) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(BOARD_X, cy - 34, COLS * CELL, 64);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('GAME OVER', cx, cy + 2);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px monospace';
    ctx.fillText('press Enter', cx, cy + 22);
    ctx.textAlign = 'left';
  }
}

// Which toggle (if any) is at canvas coords (cx, cy). Kept in sync with the
// toggle drawing in render(); main.js maps a click through the CSS scale to here.
export function toggleHitTest(cx, cy) {
  for (let i = 0; i < TOGGLE_KEYS.length; i++) {
    const y = TOG_Y0 + i * TOG_DY;
    if (cx >= TOG_X && cx <= TOG_X + TOG_ROW_W && cy >= y - 3 && cy <= y + TOG_BOX + 4) {
      return TOGGLE_KEYS[i];
    }
  }
  return null;
}
