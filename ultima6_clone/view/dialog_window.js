// view/dialog_window.js
//
// I-13 — the conversation dialog window, now LIVE. I-12 built the modal frame +
// four regions (portrait+name / scrolling text / keyword chips / "you say:" input)
// as layout; I-13 turns it into the conversation VM's I/O surface. This module owns
// only the DOM + input primitives; the VM + effect handling live in the host
// (systems/conversation/conversation_system.js), which drives this controller.
//
// Source shape: TalkDriver (seg_1703.c:1016) shows portrait + name, prints text,
// and the ask/answer loop reads input. Here the host pumps the VM's effect stream:
// {say}->append text, {ask}/{get*}->the input line, {pause}->press-a-key, {portrait}
// ->the box. Esc ends the conversation (UIStack onClose).

import { Actor } from '../components/components.js';
import { displayName } from './inspector.js';

// Always-available U6 keywords, shown as clickable chips (clicking = say the word).
// The script's own OP_KEY keywords are added by the host when available (I-13g).
const DEFAULT_CHIPS = ['name', 'job', 'bye'];

// createDialogUI(world, target, uiStack, { reg, objlist, portraits })
//   Returns a controller the host drives. Pushes the modal; `onClose` fires on Esc
//   / close so the host can end the conversation. The controller's promises
//   (input/pause) reject-as-end if the window closes while one is pending.
export function createDialogUI(world, target, uiStack, { reg, objlist, portraits } = {}) {
  const id = world.resolve(target);
  const name = id === -1 ? '???' : displayName(world, target, { reg, objlist });

  const el = document.createElement('div');
  el.className = 'ui-modal dialog-window';

  // Region 1: portrait + name.
  const top = document.createElement('div');
  top.className = 'dialog-top';
  const portrait = document.createElement('canvas');
  portrait.className = 'dialog-portrait';
  portrait.width = 56; portrait.height = 64;
  if (portraits && id !== -1 && world.has(target, Actor)) {
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
  top.append(portrait, idBox);
  el.appendChild(top);

  // Region 2: scrolling conversation text.
  const text = document.createElement('div');
  text.className = 'dialog-text';
  el.appendChild(text);

  // Region 3: clickable keyword chips.
  const chips = document.createElement('div');
  chips.className = 'dialog-keywords';
  el.appendChild(chips);

  // Region 4: "you say:" input.
  const inputRow = document.createElement('div');
  inputRow.className = 'dialog-input';
  const prompt = document.createElement('span');
  prompt.className = 'dialog-prompt';
  prompt.textContent = 'You say:';
  const field = document.createElement('input');
  field.className = 'dialog-field';
  field.type = 'text';
  field.disabled = true;
  field.autocomplete = 'off';
  inputRow.append(prompt, field);
  el.appendChild(inputRow);

  // Continue/​input cue: shown on a {pause} ("click or press a key") and on key-based
  // inputs (Y/N, digit, any-key) so the expected interaction is always signposted.
  const cueEl = document.createElement('div');
  cueEl.className = 'dialog-cue';
  cueEl.style.display = 'none';
  el.appendChild(cueEl);

  const hint = document.createElement('div');
  hint.className = 'ui-hint';
  hint.textContent = 'Esc to end the conversation';
  el.appendChild(hint);

  // --- internal I/O state ---
  let waiter = null;           // { kind: 'text'|'pause'|'char'|'digit'|'choice', resolve, allowed }
  let closed = false;
  let onEnd = () => {};        // host registers its end handler

  function scroll() { text.scrollTop = text.scrollHeight; }

  // Append a say line, rendering @word as a highlight (the rest verbatim — markup
  // <>/\& is passed through for now; research_i13_conversation_vm.md §Variables).
  function appendSay(s) {
    const parts = String(s).split(/(@\w+)/g);
    for (const p of parts) {
      if (!p) continue;
      if (p[0] === '@') {
        // @word = an askable keyword: highlight it and make it click-to-say (like a
        // chip) when an input is being awaited. Source cues these; here they're live.
        const word = p.slice(1);
        const span = document.createElement('span');
        span.className = 'dialog-hl';
        span.textContent = word;
        span.addEventListener('click', () => { if (waiter && waiter.kind === 'text') settleWaiter(word); });
        text.appendChild(span);
      } else {
        text.appendChild(document.createTextNode(p));
      }
    }
    scroll();
  }

  function appendMeta(s) {
    const d = document.createElement('div');
    d.className = 'ui-meta';
    d.textContent = s;
    text.appendChild(d);
    scroll();
  }

  // Echo the player's own input into the transcript (so it reads as a two-way talk,
  // not just the NPC's replies) — source shows "you say: <input>". Distinct color
  // from the NPC's words; the prompt label supplies the "you say:" framing.
  function appendPlayer(s) {
    const d = document.createElement('div');
    d.className = 'dialog-you';
    d.textContent = s;
    text.appendChild(d);
    scroll();
  }

  const showCue = (t) => { cueEl.textContent = t; cueEl.style.display = ''; };
  const hideCue = () => { cueEl.style.display = 'none'; };

  function settleWaiter(value) {
    const w = waiter;
    waiter = null;
    field.disabled = true;
    field.value = '';
    field.placeholder = '';
    prompt.textContent = 'You say:';
    hideCue();
    if (w) {
      // Echo real user input into the transcript (not pauses, not a window-close null).
      // Empty free-text Enter = "bye" (what the VM does), so show that.
      if (w.kind !== 'pause' && value !== null && value !== undefined) {
        const shown = w.kind === 'text' ? (value || 'bye') : value;
        if (shown !== '') appendPlayer(shown);
      }
      w.resolve(value);
    }
  }

  // Text input (ask / getString / getInt): the <input> field. Resolves on Enter
  // (value, empty → "bye") or a chip / @keyword click. `placeholder` hints what's
  // expected (a keyword / a number / free text).
  function textInput(placeholder) {
    return new Promise((resolve) => {
      waiter = { kind: 'text', resolve };
      prompt.textContent = 'You say:';
      field.disabled = false;
      field.value = '';
      field.placeholder = placeholder || '';
      field.focus();
    });
  }
  // Key-based input (char / digit / choice) — no field; onKey resolves. The prompt +
  // cue spell out which keys are accepted (e.g. "Press Y / N").
  function keyInput(kind, allowed) {
    if (kind === 'choice') { prompt.textContent = 'Press ' + (allowed || '').split('').join(' / ') + ':'; showCue('▸ press ' + (allowed || '').split('').join(' or ')); }
    else if (kind === 'digit') { prompt.textContent = 'Press a digit:'; showCue('▸ press a number key (0–9)'); }
    else if (kind === 'char') { prompt.textContent = 'Press a key:'; showCue('▸ press any key'); }
    return new Promise((resolve) => { waiter = { kind, resolve, allowed }; });
  }
  // {pause} — wait for the user to advance (click the text/cue or press a key).
  function pauseInput() {
    showCue('▾ click here or press a key to continue');
    return new Promise((resolve) => { waiter = { kind: 'pause', resolve }; });
  }

  field.addEventListener('keydown', (e) => {
    if (waiter && waiter.kind === 'text' && e.key === 'Enter') {
      e.preventDefault();
      settleWaiter(field.value.trim());
    }
    // Esc bubbles to the stack handler (ends the conversation).
  });

  // Click the text region OR the cue to advance a pause.
  const advancePause = () => { if (waiter && waiter.kind === 'pause') settleWaiter(''); };
  text.addEventListener('click', advancePause);
  cueEl.addEventListener('click', advancePause);

  function renderChips(words) {
    chips.replaceChildren();
    for (const kw of words) {
      const chip = document.createElement('span');
      chip.className = 'dialog-chip dialog-chip-live';
      chip.textContent = kw;
      chip.addEventListener('click', () => { if (waiter && waiter.kind === 'text') settleWaiter(kw); });
      chips.appendChild(chip);
    }
  }
  renderChips(DEFAULT_CHIPS);

  const modal = {
    el,
    onKey(e) {
      if (e.key === 'Escape') return;        // let the stack pop → onClose → end
      if (!waiter) return;
      if (waiter.kind === 'pause') { e.preventDefault(); settleWaiter(''); }
      else if (waiter.kind === 'char') { if (e.key.length === 1) { e.preventDefault(); settleWaiter(e.key); } }
      else if (waiter.kind === 'digit') { if (/^[0-9]$/.test(e.key)) { e.preventDefault(); settleWaiter(e.key); } }
      else if (waiter.kind === 'choice') {
        const up = e.key.toUpperCase();
        if (waiter.allowed && waiter.allowed.toUpperCase().includes(up)) { e.preventDefault(); settleWaiter(up); }
      }
      // kind 'text' → let the field handle typing/Enter
    },
    onClose() {
      closed = true;
      if (waiter) { const w = waiter; waiter = null; w.resolve(null); }   // pending input → end signal
      onEnd();
    },
  };
  uiStack.push(modal);

  return {
    name,
    isClosed: () => closed,
    say: appendSay,
    meta: appendMeta,
    setChips: renderChips,
    promptText: (label) => { prompt.textContent = label || 'You say:'; },
    askText: (placeholder) => textInput(placeholder),
    askKey: (kind, allowed) => keyInput(kind, allowed),
    pause: () => pauseInput(),
    showPortrait: (npcId) => {
      if (!portraits) return;
      const img = portraits.imageData(npcId);
      if (img) portrait.getContext('2d').putImageData(img, 0, 0);
    },
    onEnd: (fn) => { onEnd = fn; },
    close: () => { if (!closed) uiStack.pop(); },
  };
}
