// view/dialog_window.js
//
// I-12 — the conversation dialog window: the SECOND consumer of the I-7 UI
// substrate (after the object inspector), proving the modal stack generalises
// from a list-cursor surface to a text-I/O surface. Opened by the TALK
// trigger's `openConversation` seam (systems/command_dispatch.js) when the
// player talks to an NPC / shrine / statue. Self-contained modal on the
// UIStack: the turn-driver suspends and avatar movement is gated for its
// lifetime (free via UIStack — ui_stack.js + main.js isBlocked), and the
// conversation text lives INSIDE the window, not the world #messages channel
// (design decision 2026-06-05).
//
// Source shape: TalkDriver (seg_1703.c:1016) shows the target's portrait + name
// then runs the ask/answer loop. The clone splits that across steps:
//   I-12a: the modal frame + open/close wiring + name title + ESC.
//   I-12b (this step): the four regions (portrait box + name / scrolling text /
//          keyword chips / "you say:" input) as LAYOUT — fixed centred modal at
//          a readable width. Chips + input are INERT placeholders (no fakes).
//   I-12c: the real lazy-decoded portrait into the box (docs/research_portraits.md).
// The conversation CONTENT (script load + VM, clickable chips that say the word,
// a live input) is I-13; at I-12 ESC is the only working interaction.

import { Actor } from '../components/components.js';
import { displayName } from './inspector.js';

// The always-available U6 keywords (name / job / bye). Shown as inert chips for
// layout; I-13 makes them clickable (= say the word) and adds the script's own
// OP_KEY keywords. Hardcoded stubs here, NOT a faked response path.
const STUB_KEYWORDS = ['name', 'job', 'bye'];

// openDialog(world, target, uiStack, { reg, objlist, portraits })
//   target — the talkable entity handle (NPC / shrine / statue) the seam picked.
//   portraits — the lazy portrait decoder (assets/portrait.js); may be undefined.
export function openDialog(world, target, uiStack, { reg, objlist, portraits }) {
  const id = world.resolve(target);
  if (id === -1) return;
  const name = displayName(world, target, { reg, objlist });

  const el = document.createElement('div');
  el.className = 'ui-modal dialog-window';

  // --- Region 1: portrait box + speaker name ------------------------------
  const top = document.createElement('div');
  top.className = 'dialog-top';
  // The portrait box is a native 56x64 canvas (the U6 portrait size), scaled to
  // 2x by CSS (image-rendering: pixelated). Blank here; I-12c blits into it.
  const portrait = document.createElement('canvas');
  portrait.className = 'dialog-portrait';
  portrait.width = 56; portrait.height = 64;
  // I-12c: blit the NPC's portrait (lazy-decoded via npcId — the actor slot, NOT
  // the ObjType; see research_portraits.md). Shrines/statues + the Avatar (self)
  // have no portrait here (GetQual / portrait.z deferred) → the box stays blank.
  if (portraits && world.has(target, Actor)) {
    const npcId = world.store(Actor).npcId[id];
    const img = portraits.imageData(npcId);
    if (img) portrait.getContext('2d').putImageData(img, 0, 0);
  }
  const idBox = document.createElement('div');
  idBox.className = 'dialog-id';
  const nameEl = document.createElement('div');
  nameEl.className = 'dialog-name';
  nameEl.textContent = name;
  idBox.appendChild(nameEl);
  top.appendChild(portrait);
  top.appendChild(idBox);
  el.appendChild(top);

  // --- Region 2: scrolling conversation text ------------------------------
  const text = document.createElement('div');
  text.className = 'dialog-text';
  const placeholder = document.createElement('div');
  placeholder.className = 'ui-meta';
  placeholder.textContent = 'The conversation begins here — the NPC’s words arrive in I-13.';
  text.appendChild(placeholder);
  el.appendChild(text);

  // --- Region 3: keyword chips (inert placeholders) -----------------------
  const keywords = document.createElement('div');
  keywords.className = 'dialog-keywords';
  for (const kw of STUB_KEYWORDS) {
    const chip = document.createElement('span');
    chip.className = 'dialog-chip';
    chip.textContent = kw;
    chip.title = 'keywords become clickable in I-13';   // inert at I-12 (no listener)
    keywords.appendChild(chip);
  }
  el.appendChild(keywords);

  // --- Region 4: "you say:" input (inert placeholder) ---------------------
  const inputRow = document.createElement('div');
  inputRow.className = 'dialog-input';
  const prompt = document.createElement('span');
  prompt.className = 'dialog-prompt';
  prompt.textContent = 'You say:';
  const field = document.createElement('input');
  field.className = 'dialog-field';
  field.type = 'text';
  field.disabled = true;                                // I-13 enables + wires Enter
  field.placeholder = 'type a keyword (I-13)';
  inputRow.appendChild(prompt);
  inputRow.appendChild(field);
  el.appendChild(inputRow);

  const hint = document.createElement('div');
  hint.className = 'ui-hint';
  hint.textContent = 'Esc to close';
  el.appendChild(hint);

  // No live input yet, so onKey is a no-op and Esc auto-pops (ui_stack.js).
  uiStack.push({ el, onKey: () => {} });
}
