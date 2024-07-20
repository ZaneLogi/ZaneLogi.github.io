"use strict"

const ENT_ENTSNUM           = 0x0c;

const ENT_FLG_ONCE          = 0x01;
const ENT_FLG_STOPRICK      = 0x02;
const ENT_FLG_LETHALR       = 0x04;
const ENT_FLG_LETHALI       = 0x08;
const ENT_FLG_TRIGBOMB      = 0x10;
const ENT_FLG_TRIGBULLET    = 0x20;
const ENT_FLG_TRIGSTOP      = 0x40;
const ENT_FLG_TRIGRICK      = 0x80;

function Entity() {
    this.n = 0;          /* b00 */
    /*U8 b01;*/    /* b01 in ASM code but never used */
    this.x = 0;         /* b02 - position */
    this.y = 0;         /* w04 - position */
    this.sprite = 0;     /* b08 - sprite number */
    /*U16 w0C;*/   /* w0C in ASM code but never used */
    this.w = 0;          /* b0E - width */
    this.h = 0;          /* b10 - height */
    this.mark = 0;      /* w12 - number of the mark that created the entity */
    this.flags = 0;      /* b14 */
    this.trig_x = 0;    /* b16 - position of trigger box */
    this.trig_y = 0;    /* w18 - position of trigger box */
    this.xsave = 0;     /* b1C */
    this.ysave = 0;     /* w1E */
    this.sprbase = 0;   /* w20 */
    this.step_no_i = 0; /* w22 */
    this.step_no = 0;   /* w24 */
    this.c1 = 0;        /* b26 */
    this.c2 = 0;        /* b28 */
    this.ylow = 0;       /* b2A */
    this.offsy = 0;     /* w2C */
    this.latency = 0;    /* b2E */
    this.prev_n = 0;     /* new */
    this.prev_x = 0;    /* new */
    this.prev_y = 0;    /* new */
    this.prev_s = 0;     /* new */
    this.front = 0;      /* new */
    this.trigsnd = 0;    /* new */
}

