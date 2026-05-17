import { sys_evt }  from './sys_evt.js';
import { input }    from './input.js';
import { gfx }      from './gfx.js';
import { state }    from './state.js';
import { states }   from './states.js';
import { render }   from './render.js';
import { runloop }  from './runloop.js';
import { resource } from './resource.js';
import { scoring }  from './scoring.js';

// L001A — Code.md:MainLoop. Three-phase frame structure
// (research_code_flow.md §5.1):
//   1. WaitVBlankCoin → input + counters (rAF replaces busy-wait VBLANK poll)
//   2. GameStateMachine dispatch
//   3. UpdateScoresAndSound (game-mode only; stub for skeleton)

const game = {
    async init() {
        sys_evt.init();
        input.init();
        gfx.init();
        state.init();
        await resource.init();

        // Expose state for dev / debugger inspection. Several research docs
        // direct readers to "poll window.state.X after stage Y" — that
        // requires the binding to actually exist. Cost-free in production.
        window.state = state;

        runloop.start(() => this.tick(), () => this.render());
    },

    tick() {
        input.sample();
        render.checkHotkeys();
        state.counter9a = (state.counter9a + 1) & 0xFFFF;

        if (state.gameOrAttract === 0) {
            states.attractFrame();
        } else {
            states.dispatch();
            scoring.update();        // L2700 UpdateScoresAndSound
        }
    },

    render() {
        render.frame();
    },
};

window.addEventListener("load", () => game.init());
