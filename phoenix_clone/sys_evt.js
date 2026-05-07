export const sys_evt = {
    KEY_DOWN: 0,
    KEY_UP: 1,
    events: [],

    init() {
        window.addEventListener("keydown", (e) => this.onKeyDown(e));
        window.addEventListener("keyup",   (e) => this.onKeyUp(e));
    },

    reset() {
        this.events.length = 0;
    },

    onKeyDown(e) {
        this.events.push({ type: this.KEY_DOWN, context: e });
    },

    onKeyUp(e) {
        this.events.push({ type: this.KEY_UP, context: e });
    },
};
