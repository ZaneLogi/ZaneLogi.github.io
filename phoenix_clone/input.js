import { sys_evt } from './sys_evt.js';

// Mirror of source's IN0 ($43A0) / IN0Previous ($43A1) edge-detection scheme,
// but with positive-logic booleans (research_hardware.md §7.1,
// research_code_flow.md §5.5 point 3). Previous-frame snapshot is kept so
// edge detection (coin-debounce, fire, shield, start) still works.

export const input = {
    leftPressed: false,
    rightPressed: false,
    firePressed: false,
    barrierPressed: false,
    coinPressed: false,
    startPressed: false,
    gridPressed: false,
    killAllPressed: false,
    prev: null,

    init() {
        this.prev = this.snapshot();
    },

    snapshot() {
        return {
            left:    this.leftPressed,
            right:   this.rightPressed,
            fire:    this.firePressed,
            barrier: this.barrierPressed,
            coin:    this.coinPressed,
            start:   this.startPressed,
            grid:    this.gridPressed,
            killAll: this.killAllPressed,
        };
    },

    sample() {
        this.prev = this.snapshot();

        for (const e of sys_evt.events) {
            const code = e.context.code;
            const down = (e.type === sys_evt.KEY_DOWN);
            switch (code) {
                case "ArrowLeft":  this.leftPressed    = down; break;
                case "ArrowRight": this.rightPressed   = down; break;
                case "Space":      this.firePressed    = down; break;
                case "ShiftLeft":  this.barrierPressed = down; break;
                case "Digit5":     this.coinPressed    = down; break;
                case "Digit1":     this.startPressed   = down; break;
                case "KeyG":       this.gridPressed    = down; break;
                case "KeyK":       this.killAllPressed = down; break;
            }
        }
        sys_evt.reset();
    },

    fireEdge()    { return this.firePressed    && !this.prev.fire; },
    barrierEdge() { return this.barrierPressed && !this.prev.barrier; },
    coinEdge()    { return this.coinPressed    && !this.prev.coin; },
    startEdge()   { return this.startPressed   && !this.prev.start; },
    gridEdge()    { return this.gridPressed    && !this.prev.grid; },
    killAllEdge() { return this.killAllPressed && !this.prev.killAll; },
};
