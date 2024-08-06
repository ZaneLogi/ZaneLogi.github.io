"use strict"

const runloop = {
    frame_period: 50,
    frame_count: 0,
};

runloop.changeFramePeriod = function (period) {
    this.frame_period = period;
    this.msPrev = window.performance.now();
    this.frame_count = 0;
};

runloop.start = function () {
    this.msPrev = window.performance.now();
    window.requestAnimationFrame(() => this.run());

    const timer_enabled = false;
    this.timerId = timer_enabled
        ? setInterval((ctx) => { console.log(ctx.frame_count) }, 1000, this)
        : 0;
}

runloop.run = function () {
    window.requestAnimationFrame(() => this.run());
    const msNow = window.performance.now();
    const msPassed = msNow - this.msPrev;
    if (msPassed < this.frame_period) return;
    const excessTime = msPassed % this.frame_period;
    this.msPrev = msNow - excessTime;

    game.doFrame();

    this.frame_count++;
}

window.addEventListener("load", () => game.init());
