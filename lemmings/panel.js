// lemmings/panel.js
//
// The skill panel & HUD (design_spec Chapter 22), realised as authored HTML/CSS DOM
// widgets — NOT decoded from the original panel art (see the decision note in
// index.html; Ch 22 itself stays technology-neutral). Its *appearance and placement*
// are free (§22.1); its *function and values* are normative and follow the spec:
//
//   - the eight skill buttons show the §11.3 budgets and select the active skill (§18);
//   - the rate ± drives §13.6 (clamped to the floor); pause hits the §12.5 gate;
//   - the nuke is a two-press safety (§19.3 / §25);
//   - the readouts are OUT (§11.3), IN% (§19.6 done%), TIME (§19.1), and the
//     under-cursor focus (§18.2);
//   - the minimap plots every live lemming and the camera window by the §2.5 mapping.
//
// This module owns only the panel DOM; the simulation and camera are passed in.

import { WORLD_W, WORLD_H, VIEWPORT_W, SCROLL_MAX } from './src/constants.js';

// Panel order (reference, §22.2 — free). Keys are the SKILL.* budget keys.
const SKILLS = [
  { key: 'climber', label: 'Climber' }, { key: 'floater', label: 'Floater' },
  { key: 'bomber', label: 'Bomber' }, { key: 'blocker', label: 'Blocker' },
  { key: 'builder', label: 'Builder' }, { key: 'basher', label: 'Basher' },
  { key: 'miner', label: 'Miner' }, { key: 'digger', label: 'Digger' },
];

const MM = 3;                       // minimap display scale (§2.5 logical is 104×20)
const NUKE_CONFIRM_MS = 2000;       // window for the second nuke press (§19.3 safety)

export class Panel {
  /**
   * @param {HTMLElement} root container the panel builds itself into
   * @param {{onRate:(d:number)=>void, onPause:()=>void, onNuke:()=>void,
   *          onSelect:(key:string)=>void, onMinimap:(worldX:number)=>void}} cb
   */
  constructor(root, cb) {
    this.cb = cb;
    this.selected = null;           // §22.5 — the active skill, or null
    this._nukePending = false;
    this._nukeTimer = 0;
    this._build(root);
  }

  _build(root) {
    root.classList.add('panel');
    root.innerHTML = '';

    // Release rate (§13.6): [−] floor/current [+]
    const rate = el('div', 'grp rate');
    this.rateDown = btn('−', () => this.cb.onRate(-1));
    this.rateUp = btn('+', () => this.cb.onRate(+1));
    this.rateNums = el('div', 'rateNums');
    rate.append(this.rateDown, this.rateNums, this.rateUp);

    // The eight skill buttons (§18 / §11.3).
    const skills = el('div', 'grp skills');
    this.skillBtns = new Map();
    for (const s of SKILLS) {
      const b = el('button', 'skill');
      const n = el('span', 'n'); const l = el('span', 'lbl'); l.textContent = s.label;
      b.append(n, l);
      b.addEventListener('click', () => this.cb.onSelect(s.key));
      this.skillBtns.set(s.key, { b, n });
      skills.appendChild(b);
    }

    // System controls: pause + nuke (two-press).
    const sys = el('div', 'grp sys');
    this.pauseBtn = btn('Pause', () => this.cb.onPause(), 'pause');
    this.nukeBtn = btn('Nuke', () => this._nukeClick(), 'nuke');
    sys.append(this.pauseBtn, this.nukeBtn);

    // Readouts (§22.3).
    const read = el('div', 'grp readouts');
    this.outEl = span(); this.inEl = span(); this.timeEl = span();
    this.focusEl = el('div', 'focus'); this.focusEl.textContent = '—';
    read.append(
      row('OUT', this.outEl), row('IN', this.inEl, '%'), row('TIME', this.timeEl), this.focusEl,
    );

    // Minimap (§2.5).
    this.mm = el('canvas', 'minimap');
    this.mm.width = 104 * MM; this.mm.height = 20 * MM;
    this.mmCtx = this.mm.getContext('2d');
    this.mm.addEventListener('mousedown', (e) => {
      const r = this.mm.getBoundingClientRect();
      const worldX = ((e.clientX - r.left) / r.width) * WORLD_W;
      this.cb.onMinimap(worldX - VIEWPORT_W / 2);   // centre the view there (§2.5)
    });

    root.append(rate, skills, sys, read, this.mm);
  }

  // Two-press safety (§19.3 / §25): the first press only arms a confirmation; a second
  // press within NUKE_CONFIRM_MS actually fires. The button's label/colour are derived
  // from state in update(), so the player can see what a second press will do.
  _nukeClick() {
    if (this._nukePending) {                 // second press → arm the nuke (§19.3)
      clearTimeout(this._nukeTimer);
      this._nukePending = false;
      this.cb.onNuke();
    } else {                                  // first press → await a confirming second press
      this._nukePending = true;
      this._nukeTimer = setTimeout(() => { this._nukePending = false; }, NUKE_CONFIRM_MS);
    }
  }

  /** Set the active skill and reflect it in the button highlight (§22.5). */
  setSelected(key) {
    this.selected = key;
    for (const [k, { b }] of this.skillBtns) b.classList.toggle('on', k === key);
  }

  /**
   * Refresh every readout and control state from the live sim + camera (§22 — kept
   * current each frame). `focusText` is the under-cursor lemming's action (§22.3), or ''.
   * @param {import('./src/simulation.js').Simulation} sim
   * @param {{camX:number, terrainCanvas:HTMLCanvasElement}} game
   * @param {string} focusText
   */
  update(sim, game, focusText) {
    // Skill counts + exhausted state (§11.3 — budget 0 ⇒ unselectable, §18.4).
    for (const s of SKILLS) {
      const { b, n } = this.skillBtns.get(s.key);
      const c = sim.budget[s.key] ?? 0;
      n.textContent = c;
      b.classList.toggle('empty', c === 0);
    }
    // Rate: floor / current, with inert ends (§13.6).
    const floor = sim.spawner ? sim.spawner.floorRate : sim.spawner?.rate ?? 0;
    const cur = sim.spawner ? sim.spawner.rate : 0;
    this.rateNums.innerHTML = `<b>${floor}</b>/<b>${cur}</b>`;
    this.rateDown.disabled = cur <= floor;
    this.rateUp.disabled = cur >= 99;
    // Pause / nuke state.
    this.pauseBtn.classList.toggle('on', sim.paused);
    this.pauseBtn.textContent = sim.paused ? 'Paused' : 'Pause';
    // Nuke label derived from state each frame so the two-press safety is legible:
    // "Nuke" → (first press) "Nuke?" → (second press, armed §19.3) "Nuking".
    const nukeArmed = sim.isNuking, nukePending = this._nukePending && !nukeArmed;
    this.nukeBtn.classList.toggle('armed', nukeArmed);
    this.nukeBtn.classList.toggle('pending', nukePending);
    this.nukeBtn.textContent = nukeArmed ? 'Nuking' : nukePending ? 'Nuke?' : 'Nuke';
    // Readouts (§22.3).
    this.outEl.textContent = sim.out;
    this.inEl.textContent = sim.savedPercent();
    this.timeEl.textContent = sim.clockString();
    this.focusEl.textContent = focusText || '—';

    this._drawMinimap(sim, game);
  }

  _drawMinimap(sim, game) {
    const c = this.mmCtx;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#0e1524';
    c.fillRect(0, 0, this.mm.width, this.mm.height);
    // Terrain silhouette scaled by the §2.5 divisors (x/16, y/8).
    c.drawImage(game.terrainCanvas, 0, 0, WORLD_W, WORLD_H, 0, 0, (WORLD_W / 16) * MM, (WORLD_H / 8) * MM);
    // Every live lemming as a dot (§2.5 — the normative content).
    c.fillStyle = '#e8e8f0';
    for (const l of sim.liveLemmings()) {
      c.fillRect(Math.round((l.x / 16) * MM), Math.round((l.y / 8) * MM), MM, MM);
    }
    // The camera window (§2.5) — a hollow rectangle.
    const vx = (game.camX / 16) * MM, vw = (VIEWPORT_W / 16) * MM;
    c.strokeStyle = '#f0c040';
    c.lineWidth = 1;
    c.strokeRect(vx + 0.5, 0.5, vw, this.mm.height - 1);
  }
}

// ── tiny DOM helpers ───────────────────────────────────────────────────────────
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function span() { return el('span'); }
function btn(text, on, cls = '') { const b = el('button', cls); b.textContent = text; b.addEventListener('click', on); return b; }
function row(label, valueEl, suffix = '') {
  const d = el('div', 'ro'); const l = el('span', 'k'); l.textContent = label;
  d.append(l, valueEl); if (suffix) d.append(document.createTextNode(suffix)); return d;
}

export { SKILLS };
