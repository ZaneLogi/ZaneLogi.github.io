import { state }    from './state.js';
import { init as initDevPanel } from './devPanel.js';

import * as starfield          from './tasks/starfield.js';
import * as formationOscillate from './tasks/formationOscillate.js';
import * as formationPulse     from './tasks/formationPulse.js';
import * as objectStates       from './tasks/objectStates.js';
import * as enemyStatus        from './tasks/enemyStatus.js';
import * as bombUpdate         from './tasks/bombUpdate.js';
import * as launchAttackWave   from './tasks/launchAttackWave.js';
import * as playerMove         from './tasks/playerMove.js';
import * as playerFire         from './tasks/playerFire.js';
import * as bulletUpdate       from './tasks/bulletUpdate.js';
import * as captorDive         from './tasks/captorDive.js';
import * as tractorBeam        from './tasks/tractorBeam.js';
import * as pullShip           from './tasks/pullShip.js';

// ── Task dispatch table ────────────────────────────────────────────────────
// Ordered to match the Z80 task table (d_cpu0_task_table). bulletUpdate has
// no Z80 task counterpart — it stands in for CPU1's rckt_man + hitd_det_rckt
// (the original ran bullet move/collision on a second processor in parallel).
// Slotted right after playerFire so a freshly spawned bullet doesn't move
// on the same tick — matches the natural CPU0/CPU1 1-frame lag.
//
// Note: f_1DD2 (game timer decrement) is NOT here — it runs unconditionally
// as tickGameTimers() below, mirroring its always-on status in the original.
const TASK_TABLE = [
    { flag: 'starfield',          module: starfield,          ref: 'f_1D76'    },
    { flag: 'formationOscillate', module: formationOscillate, ref: 'f_2A90'    },
    { flag: 'formationPulse',     module: formationPulse,     ref: 'f_1DE6'    },
    { flag: 'objectStates',       module: objectStates,       ref: 'f_23DD'    },
    { flag: 'enemyStatus',        module: enemyStatus,        ref: 'f_1DB3'    },
    { flag: 'bombUpdate',         module: bombUpdate,         ref: 'f_1EA4'    },
    { flag: 'launchAttackWave',   module: launchAttackWave,   ref: 'f_2916'    },
    { flag: 'playerMove',         module: playerMove,         ref: 'f_1F85'    },
    { flag: 'playerFire',         module: playerFire,         ref: 'f_1F04'    },
    { flag: 'bulletUpdate',       module: bulletUpdate,       ref: 'CPU1 rckt' },
    { flag: 'captorDive',         module: captorDive,         ref: 'f_21CB'    },
    { flag: 'tractorBeam',        module: tractorBeam,        ref: 'f_2222'    },
    { flag: 'pullShip',           module: pullShip,           ref: 'f_20F2'    },
];

// ── Canvas setup ───────────────────────────────────────────────────────────
const canvas = document.getElementById('screen');
const ctx    = canvas.getContext('2d');
state.ctx    = ctx;

// ── Keyboard input ─────────────────────────────────────────────────────────
// Raw key state — sampled once per logic tick in update() so all tasks see a
// consistent snapshot (mirrors the Z80's io_input[] polled at the top of the frame).
const _keys = new Set();
window.addEventListener('keydown', e => { _keys.add(e.code);    e.preventDefault(); });
window.addEventListener('keyup',   e => { _keys.delete(e.code);                    });

// ── Dev panel ─────────────────────────────────────────────────────────────
initDevPanel(state, TASK_TABLE);

// ── Fixed-timestep runloop ─────────────────────────────────────────────────
const FRAME_PERIOD = 1000 / 60;

let lastTime    = 0;
let accumulator = 0;

// f_1DD2 equivalent — decrement game timers at 2 Hz (every 30 frames).
// Always runs unconditionally, not controlled by the dev panel.
function tickGameTimers() {
    if (state.frameCount % 30 !== 0) return;
    for (let i = 0; i < 4; i++) {
        if (state.gameTimers[i] > 0) state.gameTimers[i]--;
    }
}

function update() {
    // Sample raw input once per tick — consistent snapshot for all tasks.
    // fireEdge is true only on the rising edge (was up, now down) so holding
    // Space doesn't auto-repeat — reproduces the Z80 IO chip's hardware debounce.
    const firePrev       = state.input.fire;
    state.input.left     = _keys.has('ArrowLeft');
    state.input.right    = _keys.has('ArrowRight');
    state.input.fire     = _keys.has('Space');
    state.input.fireEdge = state.input.fire && !firePrev;

    tickGameTimers();

    // Dispatch all enabled tasks — mirrors the Z80 scheduler iterating
    // ds_cpu0_task_actv and calling each enabled function pointer.
    for (const task of TASK_TABLE) {
        if (state.tasks[task.flag]) task.module.update(state);
    }

    state.frameCount++;
}

function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 224, 256);

    // Each task module can expose a render() — called unconditionally
    // (rendering is always active even if the logic task is disabled).
    for (const task of TASK_TABLE) {
        task.module.render?.(state);
    }
}

function loop(timestamp) {
    const delta = timestamp - lastTime;
    lastTime = timestamp;

    accumulator += delta;

    while (accumulator >= FRAME_PERIOD) {
        update();
        accumulator -= FRAME_PERIOD;
    }

    render();
    requestAnimationFrame(loop);
}

requestAnimationFrame(ts => {
    lastTime = ts;
    requestAnimationFrame(loop);
});
