"use strict"

class Trigger {
    static #DISABLED_TICKS = -1;
    static game = undefined;

    // return a disabled time trigger
    static disabled_timer() {
        return new Trigger();
    }

    #tick;

    constructor() {
        this.#tick = Trigger.#DISABLED_TICKS;
    }

    // set time trigger to the next tick
    start() {
        this.#tick = Trigger.game.ticks + 1;
    }

    // set time trigger to a future tick
    startAfter(ticks) {
        this.#tick = Trigger.game.ticks + ticks;
    }

    // deactivate a time trigger
    disable() {
        this.#tick = Trigger.#DISABLED_TICKS;
    }

    // check if a time trigger is triggered
    now() {
        return this.#tick == Trigger.game.ticks;
    }

    // return the number of ticks since a time trigger was triggered
    since() {
        if (Trigger.game.ticks >= this.#tick) {
            return Trigger.game.ticks - this.#tick;
        }
        else {
            return Trigger.#DISABLED_TICKS;
        }
    }

    // check if a time trigger is between begin and end tick
    between(begin, end) {
        console.assert(begin < end);
        if (this.#tick != Trigger.#DISABLED_TICKS) {
            const ticks = this.since();
            return (ticks >= begin) && (ticks < end);
        }
        else {
            return false;
        }
    }

    // check if a time trigger was triggered exactly N ticks ago
    afterOnce(ticks) {
        return this.since() == ticks;
    }

    // check if a time trigger was triggered more than N ticks ago
    after(ticks) {
        const s = this.since();
        if (s != Trigger.#DISABLED_TICKS) {
            return s >= ticks;
        }
        else {
            return false;
        }
    }

    // same as between(t, 0, ticks)
    before(ticks) {
        const s = this.since();
        if (s != Trigger.#DISABLED_TICKS) {
            return s < ticks;
        }
        else {
            return false;
        }
    }
}
