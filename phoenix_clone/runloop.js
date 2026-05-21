// Fixed-timestep accumulator (mini_mario pattern, research_code_flow.md §5.1
// / §5.3). Logic locks to TICK_HZ; render runs at the display rate.

const TICK_HZ = 60;
const TICK_MS = 1000 / TICK_HZ;
const MAX_CATCHUP = 5;            // bail out of huge backlog after tab unfocus

export const runloop = {
    last: 0,
    acc: 0,
    tickCount: 0,
    catch_error: false,
    tick: null,
    render: null,

    start(tick, render) {
        this.tick = tick;
        this.render = render;
        this.last = window.performance.now();
        this.acc = 0;
        window.requestAnimationFrame((now) => this.run(now));
    },

    run(now) {
        if (this.catch_error) return;
        window.requestAnimationFrame((n) => this.run(n));

        this.acc += now - this.last;
        this.last = now;

        try {
            let n = 0;
            while (this.acc >= TICK_MS && n < MAX_CATCHUP) {
                this.tick();
                this.acc -= TICK_MS;
                this.tickCount++;
                n++;
            }
            if (n >= MAX_CATCHUP) this.acc = 0;
            this.render();
        } catch (e) {
            console.error(e);
            this.catch_error = true;
        }
    },
};
