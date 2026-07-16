// hud.js — a debug readout for the mode machine.
//
// NOT SOURCE. The NES has no such display; this is a development instrument. It
// exists because Renderer and Input are still stubs, so the mode machine — which
// IS ported and tested (flow doc §7, progress.md P3) — is otherwise invisible
// behind a black canvas. It writes to an HTML element rather than the canvas, so
// it costs the frame nothing and can never be mistaken for something the PPU would
// have produced. Retire it once Renderer draws.
//
// FIXED-WIDTH FIELDS — root CLAUDE.md, "UI conventions — HUD / on-screen readouts".
// A readout that updates every frame shifts every field to the right of any value
// whose CHARACTER COUNT changes (lo=7 -> lo=11, sub=Menu -> sub=StageIntro). That
// jitter makes it unreadable. Monospace alone does NOT fix it — `1` and `11` are
// still one cell vs two, so the FIELD width itself must be held constant. Hence:
//   1. the element is monospace + `white-space: pre` (index.html), so the pad
//      spaces actually render at a fixed cell width;
//   2. every variable field below is padded to the widest value its DOMAIN can
//      produce — numbers right-aligned, state words left-aligned;
//   3. the test is that each line has exactly ONE length across every mode. Measure
//      the string, never a screenshot. (Verified 2026-07-16 — see progress.md P3.)
// Reference implementation of padN/padW: prince_of_persia/demos/motion.js.

const padN = (v, n) => String(v).padStart(n);   // numbers -> right-aligned
const padW = (v, n) => String(v).padEnd(n);     // words   -> left-aligned

// Widths, each sized to its domain's maximum — not to what it happens to show now.
const W_MODE = 12;   // 'HALL_OF_FAME'
const W_SUB = 10;    // 'StageIntro'
const W_SEQ = 13;    // 'CURTAIN_CLOSE'
const W_BASE = 9;    // 'DESTROYED'
const W_LOOP = 4;    // 'DEMO'
const W_PLAY = 3;    // 'CON'
const W_ENEMY = 2;   // ram_enemies_left_cnt: 0..20, seeded $14 at $C355
// The ram_* bytes. 3, not "however many digits it shows in practice": ram_stage
// really does take $FF ($C3D3, to select the demo stage), ram_frm_cnt_lo/hi wrap at
// 255, and ram_lives climbs past 9 in a long game ($D138 grants one per 20000 pts).
const W_BYTE = 3;

const GAME_MODE_NAME = ['1P', '2P', 'CON'];       // ram_game_mode ($83) — tbl_CA69's index
const LOOP_NAME = ['1st', '2nd', 'DEMO'];         // ram_2nd_loop_flag ($46) — 3 states, §5

// The whole readout, as a string. Pure: takes a Game, touches no DOM — so the
// constant-width test can run headless.
export function hudText(g) {
  const sub = g.mode?.sub ?? null;
  const subName = sub ? sub.constructor.name : '-';
  const seq = sub?.seq ?? '-';   // only StageIntro carries one

  return [
    `mode ${padW(g.modeId ?? '-', W_MODE)}  sub ${padW(subName, W_SUB)}  seq ${padW(seq, W_SEQ)}`,

    `frm  lo=${padN(g.frm.lo, W_BYTE)} hi=${padN(g.frm.hi, W_BYTE)}` +
    `  stage=${padN(g.stage, W_BYTE)}  scrollY=${padN(g.scrollY, W_BYTE)}` +
    `  pause=${padW(g.paused ? 'Y' : 'N', 1)}`,

    `run  ${padW(GAME_MODE_NAME[g.gameMode] ?? '?', W_PLAY)}` +
    `  lives=${padN(g.lives[0], W_BYTE)}/${padN(g.lives[1], W_BYTE)}` +
    `  loop=${padW(LOOP_NAME[g.secondLoop] ?? '?', W_LOOP)}` +
    `  enemies=${padN(g.enemiesLeft, W_ENEMY)}  base=${padW(g.base.state, W_BASE)}` +
    `  constr=${padN(g.constrUsageCnt, W_BYTE)}`,
  ].join('\n');
}
