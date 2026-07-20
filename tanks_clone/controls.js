// controls.js — the on-page key legend.
//
// NOT SOURCE, but not arbitrary either. The ROM prints no control help because a
// Famicom player is holding the pad and its buttons are moulded into it. A keyboard
// carries no such labelling, so the pad's own markings have to be re-derived
// somewhere in our view — the same class of deviation as Renderer, not an invention.
//
// GENERATED FROM input.js's KEYMAP, never hand-written. A hand-written legend goes
// stale the first time a binding moves, and a legend that lies is worse than none.
// Rebind in input.js and this follows.

import { KEYMAP } from './input.js';
import { BTN } from './constants.js';

// e.code is a PHYSICAL key name, not a label: 'ArrowUp' and 'KeyZ' are not what is
// printed on the keycap. Anything unlisted just loses its 'Key' prefix.
const KEY_LABEL = Object.freeze({
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftRight: 'R-Shift',
});
const label = (code) => KEY_LABEL[code] ?? code.replace(/^Key/, '');

// One row per pad control, in the order they sit on the controller, each carrying
// what the ROM actually does with it. The four D-pad bits share a row because that
// is how a player thinks of them, and A/B share one because either fires.
//
// The D-pad order is UP, LEFT, DOWN, RIGHT — the cross read clockwise, not the
// con_btn_* bit order. It has to be spatial, because a linear list of four keys is
// read as a shape: this is what prints the universally-recognised "W A S D".
// Up/Down/Left/Right order would print "W S A D", which every player misreads.
const ROWS = Object.freeze([
  { pad: 'D-pad', does: 'move · aim',
    bits: [BTN.Up, BTN.Left, BTN.Down, BTN.Right] },       // $DB9F -> $E451
  { pad: 'A / B', does: 'fire (either)',
    bits: [BTN.A, BTN.B] },                                // $E132 AND #con_btns_AB
  { pad: 'Start', does: 'start · pause',
    bits: [BTN.Start] },                                   // $CA3F menu / $C20E pause
  { pad: 'Select', does: '1P · 2P · Construction',
    bits: [BTN.Select] },                                  // $C9FA
]);

// bit -> key code for one player. Inverted from KEYMAP at render time so that
// KEYMAP stays the single source of truth and this cannot drift out of step.
const keyFor = (player, bit) =>
  Object.entries(KEYMAP[player]).find(([, b]) => b === bit)?.[0];

const keysFor = (player, bits) =>
  bits.map((bit) => {
    const code = keyFor(player, bit);
    return code ? label(code) : '—';   // em dash = bound to nothing
  }).join(' ');

// The legend as an HTML string. Pure — takes no DOM, so it is testable headless.
export function controlsHtml() {
  const row = (r) =>
    `<tr><th>${r.pad}</th><td class="does">${r.does}</td>` +
    `<td class="key">${keysFor(0, r.bits)}</td>` +
    `<td class="key">${keysFor(1, r.bits)}</td></tr>`;

  return '<table>' +
    '<thead><tr><td colspan="2">controls</td><th>1P</th><th>2P</th></tr></thead>' +
    `<tbody>${ROWS.map(row).join('')}</tbody></table>` +
    '<p>Start and Select are player 1 only.</p>';
}

export function renderControls(el) { el.innerHTML = controlsHtml(); }
