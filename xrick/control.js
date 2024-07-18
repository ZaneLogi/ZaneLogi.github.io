"use strict"

const CONTROL_UP    = 0x08
const CONTROL_DOWN  = 0x04
const CONTROL_LEFT  = 0x02
const CONTROL_RIGHT = 0x01
const CONTROL_PAUSE = 0x80
const CONTROL_END   = 0x40
const CONTROL_EXIT  = 0x20
const CONTROL_FIRE  = 0x10

const control = new function() {
    this.control_status = 0;
    this.control_last = 0;
    this.control_active = true;

    this.onkeydown = function(e) {
        switch (e.keyCode) {
            case 38: this.control_status |= CONTROL_UP; break;
            case 40: this.control_status |= CONTROL_DOWN; break;
            case 37: this.control_status |= CONTROL_LEFT; break;
            case 39: this.control_status |= CONTROL_RIGHT; break;
            case 32: this.control_status |= CONTROL_FIRE; break; // space bar
            case 80: this.control_status |= CONTROL_PAUSE; break; // P key
            case 69: this.control_status |= CONTROL_EXIT; break; // E key
        }
    }

    this.onkeyup = function(e) {
        switch (e.keyCode) {
            case 38: this.control_status &= ~CONTROL_UP; break;
            case 40: this.control_status &= ~CONTROL_DOWN; break;
            case 37: this.control_status &= ~CONTROL_LEFT; break;
            case 39: this.control_status &= ~CONTROL_RIGHT; break;
            case 32: this.control_status &= ~CONTROL_FIRE; break;
            case 80: this.control_status &= ~CONTROL_PAUSE; break;
            case 69: this.control_status &= ~CONTROL_EXIT; break;
        }
    }
}

window.onkeydown = (e) => control.onkeydown(e);
window.onkeyup = (e) => control.onkeyup(e);