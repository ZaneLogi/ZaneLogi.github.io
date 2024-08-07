"use strict"

const CONTROL_UP    = 0x08
const CONTROL_DOWN  = 0x04
const CONTROL_LEFT  = 0x02
const CONTROL_RIGHT = 0x01
const CONTROL_PAUSE = 0x80
const CONTROL_END   = 0x40
const CONTROL_EXIT  = 0x20
const CONTROL_FIRE  = 0x10

const CONTROL_CHEAT1 = 0x100
const CONTROL_CHEAT2 = 0x200
const CONTROL_CHEAT3 = 0x400

const control = {
    control_status: 0,
    control_last: 0,
}

control.onkeydown = function(e) {
    switch (e.keyCode) {
    case 38:
        this.SETBIT(CONTROL_UP);
        this.control_last = CONTROL_UP;
        break;
    case 40:
        this.SETBIT(CONTROL_DOWN);
        this.control_last = CONTROL_DOWN;
        break;
    case 37:
        this.SETBIT(CONTROL_LEFT);
        this.control_last = CONTROL_LEFT;
        break;
    case 39:
        this.SETBIT(CONTROL_RIGHT);
        this.control_last = CONTROL_RIGHT;
        break;
    case 32: // space bar
        this.SETBIT(CONTROL_FIRE);
        this.control_last = CONTROL_FIRE;
        break;
     case 80: // P key
        this.SETBIT(CONTROL_PAUSE);
        this.control_last = CONTROL_PAUSE;
        break;
    case 69:  // E key
        this.SETBIT(CONTROL_END);
        this.control_last = CONTROL_END;
        break;
    case 27: // ESC key
        this.SETBIT(CONTROL_EXIT);
        this.control_last = CONTROL_EXIT;
        break;
    case 49: // '1'
        this.SETBIT(CONTROL_CHEAT1);
        break;
    case 50: // '2'
        this.SETBIT(CONTROL_CHEAT2);
        break;
    case 51: // '3'
        this.SETBIT(CONTROL_CHEAT3);
        break;
    }
}

control.onkeyup = function(e) {
    switch (e.keyCode) {
    case 38:
        this.CLRBIT(CONTROL_UP);
        this.control_last = CONTROL_UP;
        break;
    case 40:
        this.CLRBIT(CONTROL_DOWN);
        this.control_last = CONTROL_DOWN;
        break;
    case 37:
        this.CLRBIT(CONTROL_LEFT);
        this.control_last = CONTROL_LEFT;
        break;
    case 39:
        this.CLRBIT(CONTROL_RIGHT);
        this.control_last = CONTROL_RIGHT;
        break;
    case 32: // space bar
        this.CLRBIT(CONTROL_FIRE);
        this.control_last = CONTROL_FIRE;
        break;
     case 80: // P key
        this.CLRBIT(CONTROL_PAUSE);
        this.control_last = CONTROL_PAUSE;
        break;
    case 69:  // E key
        this.CLRBIT(CONTROL_END);
        this.control_last = CONTROL_END;
        break;
    case 27: // ESC key
        this.CLRBIT(CONTROL_EXIT);
        this.control_last = CONTROL_EXIT;
        break;
    case 49: // '1'
        this.CLRBIT(CONTROL_CHEAT1);
        break;
    case 50: // '2'
        this.CLRBIT(CONTROL_CHEAT2);
        break;
    case 51: // '3'
        this.CLRBIT(CONTROL_CHEAT3);
        break;
    }
}

control.SETBIT = function(b) {this.control_status |= (b);}
control.CLRBIT = function(b) {this.control_status &= ~(b);}
control.CHKBIT = function(b) {return this.control_status & b;}

window.addEventListener("keydown", (e) => control.onkeydown(e));
window.addEventListener("keyup", (e) => control.onkeyup(e));
