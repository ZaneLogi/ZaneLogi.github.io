"use strict"

const sys_evt = {
    KEY_DOWN: 0,
    KEY_UP: 1,
    events: [],
}

sys_evt.init = function() {
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.onKeyUp(e));
}

sys_evt.reset = function() {
    this.events.length = 0;
}

sys_evt.onKeyDown = function(e) {
    this.events.push({ type: this.KEY_DOWN, context: e });
}

sys_evt.onKeyUp = function(e) {
    this.events.push({ type: this.KEY_UP, context: e });
}
