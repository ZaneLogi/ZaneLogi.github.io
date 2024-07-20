"use strict"

const e_rick_context = {
    e_rick_stop_x: 0,
    e_rick_stop_y: 0,
    e_rick_state: 0,

    scrawl: 0,
    trigger: false,
    offsx: 0,
    ylow: 0,
    offsy: 0,
    seq: 0,
    save_crawl: 0,
    save_x: 0,
    save_y: 0,
};

const E_RICK_STSTOP     = 0x01;
const E_RICK_STSHOOT    = 0x02;
const E_RICK_STCLIMB    = 0x04;
const E_RICK_STJUMP     = 0x08;
const E_RICK_STZOMBIE   = 0x10;
const E_RICK_STDEAD     = 0x20;
const E_RICK_STCRAWL    = 0x40;

function E_RICK_STSET(X) { e_rick_context.e_rick_state |= X; }
function E_RICK_STRST(X) { e_rick_context.e_rick_state &= ~X; }
function E_RICK_STTST(X) { return e_rick_context.e_rick_state & X; }


