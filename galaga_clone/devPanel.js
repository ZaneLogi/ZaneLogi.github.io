// Dev overlay panel — task toggles for testing individual systems.
// Mirrors the role of DIP switches on the original arcade board.
//
// Task lifecycle (all optional exports on each task module):
//   init(state)    — called once when task is enabled
//   update(state)  — called every logic tick while enabled
//   render(state)  — called every render frame (always, even if disabled)
//   destroy(state) — called once when task is disabled
//
// ★ = always-on in the original (task_enable_tbl_def = 0x01).
//     Shown pre-checked; can still be toggled for debugging.

const TASK_GROUPS = [
    {
        group: 'System',
        tasks: [
            { flag: 'gameController',     label: 'Game Controller',    ref: 'JS port' },
        ]
    },
    {
        group: 'Background',
        tasks: [
            { flag: 'starfield',          label: 'Starfield',          ref: 'f_1D76' },
        ]
    },
    {
        group: 'Formation',
        tasks: [
            { flag: 'formationOscillate', label: 'Formation Oscillate',ref: 'f_2A90' },
            { flag: 'formationPulse',     label: 'Formation Pulse',    ref: 'f_1DE6' },
        ]
    },
    {
        group: 'Enemies',
        tasks: [
            { flag: 'objectStates',       label: 'Object States',      ref: 'f_23DD', alwaysOn: true },
            { flag: 'bugMotion',          label: 'Bug Motion (paths)', ref: 'CPU1'   },
            { flag: 'enemyStatus',        label: 'Enemy Status',       ref: 'f_1DB3' },
            { flag: 'bomberConfig',       label: 'Bomber Config',      ref: 'f_0857' },
            { flag: 'launchAttackWave',   label: 'Launch Attack Wave', ref: 'f_2916' },
        ]
    },
    {
        group: 'Combat',
        tasks: [
            { flag: 'bombUpdate',         label: 'Bomb Update',        ref: 'f_1EA4', alwaysOn: true },
            { flag: 'playerMove',         label: 'Player Move',        ref: 'f_1F85' },
            { flag: 'playerFire',         label: 'Player Fire',        ref: 'f_1F04' },
            { flag: 'bulletUpdate',       label: 'Bullet Update',      ref: 'CPU1'   },
        ]
    },
    {
        group: 'Capture',
        tasks: [
            { flag: 'captorDive',         label: 'Captor Dive',        ref: 'f_21CB' },
            { flag: 'tractorBeam',        label: 'Tractor Beam',       ref: 'f_2222' },
            { flag: 'pullShip',           label: 'Pull Ship',          ref: 'f_20F2' },
        ]
    },
    {
        group: 'Debug',
        tasks: [
            { flag: 'hud',                label: 'HUD (faked)',        ref: 'visual check' },
        ]
    },
];

// Flat list for lookups
const ALL_TASKS = TASK_GROUPS.flatMap(g => g.tasks);

// Wrap state.tasks in a Proxy so that any write — whether from a checkbox
// click or from task code doing state.tasks.x = true — triggers the
// lifecycle hooks and keeps the UI in sync.
function makeReactive(tasks, taskTable, state, onSet) {
    return new Proxy(tasks, {
        set(target, flag, value) {
            const wasEnabled = target[flag];
            target[flag] = value;

            const entry = taskTable.find(t => t.flag === flag);
            if (value && !wasEnabled && entry) {
                entry.module.init?.(state);
            } else if (!value && wasEnabled && entry) {
                entry.module.destroy?.(state);
            }

            onSet(flag, value);
            return true;
        }
    });
}

export function init(state, taskTable) {
    const panel = document.getElementById('dev-panel');
    if (!panel) return;

    const checkboxes = {};

    // ── Header ────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'dp-header';
    header.textContent = 'DEV TASKS';
    panel.appendChild(header);

    // ── All On / All Off buttons ───────────────────────────────────────────
    const btnRow = document.createElement('div');
    btnRow.className = 'dp-btnrow';

    const btnAll = document.createElement('button');
    btnAll.textContent = 'All On';
    btnAll.addEventListener('click', () => {
        ALL_TASKS.forEach(t => { state.tasks[t.flag] = true; });
    });

    const btnNone = document.createElement('button');
    btnNone.textContent = 'All Off';
    btnNone.addEventListener('click', () => {
        ALL_TASKS.forEach(t => {
            if (!t.alwaysOn) state.tasks[t.flag] = false;
        });
    });

    btnRow.appendChild(btnAll);
    btnRow.appendChild(btnNone);
    panel.appendChild(btnRow);

    // ── Task rows grouped by category ─────────────────────────────────────
    TASK_GROUPS.forEach(({ group, tasks }) => {
        const grpEl = document.createElement('div');
        grpEl.className = 'dp-group';
        grpEl.textContent = group;
        panel.appendChild(grpEl);

        tasks.forEach(task => {
            const row = document.createElement('label');
            row.className = 'dp-row' + (task.alwaysOn ? ' dp-always-on' : '');

            const cb = document.createElement('input');
            cb.type     = 'checkbox';
            cb.checked  = state.tasks[task.flag];
            cb.disabled = task.alwaysOn ?? false;
            cb.title    = task.alwaysOn
                ? 'Always-on in the original (f_23DD/f_1EA4). Toggle via console: state.tasks.' + task.flag + ' = false'
                : '';
            if (!task.alwaysOn) {
                cb.addEventListener('change', () => {
                    state.tasks[task.flag] = cb.checked;
                });
            }

            const name = document.createElement('span');
            name.className = 'dp-name';
            name.textContent = task.label + (task.alwaysOn ? ' ★' : '');

            const ref = document.createElement('span');
            ref.className = 'dp-ref';
            ref.textContent = task.ref;

            row.appendChild(cb);
            row.appendChild(name);
            row.appendChild(ref);
            panel.appendChild(row);

            checkboxes[task.flag] = cb;
        });
    });

    // ── Internal always-on tasks (not in panel) ────────────────────────────
    const internalNote = document.createElement('div');
    internalNote.className = 'dp-internal';
    internalNote.textContent = '↳ f_1DD2 game timers — internal';
    panel.appendChild(internalNote);

    // ── Make state.tasks reactive ─────────────────────────────────────────
    state.tasks = makeReactive(
        state.tasks,
        taskTable,
        state,
        (flag, value) => {
            if (checkboxes[flag]) checkboxes[flag].checked = value;
        }
    );
}
