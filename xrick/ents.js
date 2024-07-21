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

class Entity {
    constructor() {
        this.n = 0; /* b00 */

        /*U8 b01;*/ /* b01 in ASM code but never used */
        this.x = 0; /* b02 - position */
        this.y = 0; /* w04 - position */
        this.sprite = 0; /* b08 - sprite number */

        /*U16 w0C;*/ /* w0C in ASM code but never used */
        this.w = 0; /* b0E - width */
        this.h = 0; /* b10 - height */
        this.mark = 0; /* w12 - number of the mark that created the entity */
        this.flags = 0; /* b14 */
        this.trig_x = 0; /* b16 - position of trigger box */
        this.trig_y = 0; /* w18 - position of trigger box */
        this.xsave = 0; /* b1C */
        this.ysave = 0; /* w1E */
        this.sprbase = 0; /* w20 */
        this.step_no_i = 0; /* w22 */
        this.step_no = 0; /* w24 */
        this.c1 = 0; /* b26 */
        this.c2 = 0; /* b28 */
        this.ylow = 0; /* b2A */
        this.offsy = 0; /* w2C */
        this.latency = 0; /* b2E */
        this.prev_n = 0; /* new */
        this.prev_x = 0; /* new */
        this.prev_y = 0; /* new */
        this.prev_s = 0; /* new */
        this.front = 0; /* new */
        this.trigsnd = 0; /* new */
    }
}

const ent_ents = new Array(ENT_ENTSNUM + 1);
for (let i = 0; i < ent_ents.length; i++) {
    ent_ents[i] = new Entity();
}

/*
 * Reset entities
 *
 * ASM 2520
 */
function ent_reset() {
    E_RICK_STRST(E_RICK_STSTOP);
    e_bomb_context.e_bomb_lethal = false;

    ent_ents[0].n = 0; // de-activate the entity
    for (let i = 2; ent_ents[i].n != 0xff; i++)
        ent_ents[i].n = 0; // de-activate the entity
}

/*
 * Create an entity on slots 4 to 8 by using the first slot available.
 * Entities of type e_them on slots 4 to 8, when lethal, can kill
 * other e_them (on slots 4 to C) as well as rick.
 *
 * ASM 209C
 *
 * e: anything, CHANGED to the allocated entity number.
 * return: TRUE/OK FALSE/not
 */
function ent_creat1(e)
{
    /* look for a slot */
    for (e[0] = 0x04; e[0] < 0x09; e[0]++)
        if (ent_ents[e[0]].n == 0) {  /* if slot available, use it */
            ent_ents[e[0]].c1 = 0;
        return true;
    }

    return false;
}

/*
 * Create an entity on slots 9 to C by using the first slot available.
 * Entities of type e_them on slots 9 to C can kill rick when lethal,
 * but they can never kill other e_them.
 *
 * ASM 20BC
 *
 * e: anything, CHANGED to the allocated entity number.
 * m: number of the mark triggering the creation of the entity.
 * ret: TRUE/OK FALSE/not
 */
function ent_creat2(e, m)
{
    /* make sure the entity created by this mark is not active already */
    for (e[0] = 0x09; e[0] < 0x0c; e[0]++)
        if (ent_ents[e[0]].n != 0 && ent_ents[e[0]].mark == m)
            return false;

    /* look for a slot */
    for (e[0] = 0x09; e[0] < 0x0c; e[0]++)
        if (ent_ents[e[0]].n == 0) {  /* if slot available, use it */
            ent_ents[e[0]].c1 = 2;
            return true;
        }

    return false;
}

/*
 * Process marks that are within the visible portion of the map,
 * and create the corresponding entities.
 *
 * absolute map coordinate means that they are not relative to
 * map_frow, as any other coordinates are.
 *
 * ASM 1F40
 *
 * frow: first visible row of the map -- absolute map coordinate
 * lrow: last visible row of the map -- absolute map coordinate
 */
function ent_actvis(frow, lrow) {

}


function ent_action() {
    
}






/*
 * Draw all entities onto the frame buffer.
 *
 * ASM 07a4
 *
 * NOTE This may need to be part of draw.c. Also needs better comments,
 * NOTE and probably better rectangles management.
 */
function ent_draw() {
    draw_context.draw_tilesBank = map_context.map_tilesBank;

    /*
     * background loop : erase all entities that were visible
     */
    for (let i = 0; ent_ents[i].n != 0xff; i++) {
        // if (ent_ents[i].prev_n && (ch3 || ent_ents[i].prev_s))
        if (ent_ents[i].prev_n && ent_ents[i].prev_s)
            /* if entity was active, then erase it (redraw the map) */
            draw_spriteBackground(ent_ents[i].prev_x, ent_ents[i].prev_y);
    }

    /*
     * foreground loop : draw all entities that are visible
     */
    for (let i = 0; ent_ents[i].n != 0xff; i++) {
        /*
         * If entity is active now, draw the sprite. If entity was
         * not active before, add a rectangle for the sprite.
         */
        // if (ent_ents[i].n && (game_cheat3 || ent_ents[i].sprite))
        if (ent_ents[i].n && ent_ents[i].sprite)
            /* If entitiy is active, draw the sprite. */
            draw_sprite2(ent_ents[i].sprite,
                ent_ents[i].x, ent_ents[i].y,
                ent_ents[i].front);
    }

    /*
     * rectangles loop : figure out which parts of the screen have been
     * impacted and need to be refreshed, then save state
     */
    for (let i = 0; ent_ents[i].n != 0xff; i++) {
        /* save state */
        ent_ents[i].prev_x = ent_ents[i].x;
        ent_ents[i].prev_y = ent_ents[i].y;
        ent_ents[i].prev_n = ent_ents[i].n;
        ent_ents[i].prev_s = ent_ents[i].sprite;
    }
}
