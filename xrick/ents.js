"use strict"

const ENT_ENTSNUM           = 0x0c;

/*
 * flags for ent_ents[e].n  ("yes" when set)
 *
 * ENT_LETHAL: is entity lethal?
 */
const ENT_LETHAL            = 0x80;

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
    const game_submap = game_context.game_submap;
    const map_frow = map_context.map_frow;
    let e = 0;

    /*
	* go through the list and find the first mark that
	* is visible, i.e. which has a row greater than the
	* first row (marks being ordered by row number).
	*/
    let  m = 0;
	for (m = map_submaps[game_submap].mark;
		map_marks[m].row != 0xff && map_marks[m].row < frow;
		m++);

	if (map_marks[m].row == 0xff)  /* none found */
		return;

    /*
	* go through the list and process all marks that are
	* visible, i.e. which have a row lower than the last
	* row (marks still being ordered by row number).
	*/
	for (;
		map_marks[m].row != 0xff && map_marks[m].row < lrow;
		m++) {

		/* ignore marks that are not active */
		if (map_marks[m].ent & MAP_MARK_NACT)
			continue;

        /*
		 * allocate a slot to the new entity
		 *
		 * slot type
		 *  0   available for e_them (lethal to other e_them, and stops entities
		 *      i.e. entities can't move over them. E.g. moving blocks. But they
		 *      can move over entities and kill them!).
		 *  1   xrick
		 *  2   bullet
		 *  3   bomb
		 * 4-8  available for e_them, e_box, e_bonus or e_sbonus (lethal to
		 *      other e_them, identified by their number being >= 0x10)
		 * 9-C  available for e_them, e_box, e_bonus or e_sbonus (not lethal to
		 *      other e_them, identified by their number being < 0x10)
		 *
		 * the type of an entity is determined by its .n as detailed below.
		 *
		 * 1               xrick
		 * 2               bullet
		 * 3               bomb
		 * 4, 7, a, d      e_them, type 1a
		 * 5, 8, b, e      e_them, type 1b
		 * 6, 9, c, f      e_them, type 2
		 * 10, 11          box
		 * 12, 13, 14, 15  bonus
		 * 16, 17          speed bonus
		 * >17             e_them, type 3
		 * 47              zombie
		 */
        if (!(map_marks[m].flags & ENT_FLG_STOPRICK)) {
			if (map_marks[m].ent >= 0x10) {
				/* boxes, bonuses and type 3 e_them go to slot 4-8 */
				/* (c1 set to 0 -> all type 3 e_them are sleeping) */
                let r = [0];
				if (!ent_creat1(r)) continue;
                e = r[0];
			}
			else {
				/* type 1 and 2 e_them go to slot 9-c */
				/* (c1 set to 2) */
                let r = [0]
				if (!ent_creat2(r, m)) continue;
                e = r[0];
			}
		}
		else {
			/* entities stopping rick (e.g. blocks) go to slot 0 */
			if (ent_ents[0].n) continue;
			e = 0;
			ent_ents[0].c1 = 0;
		}

        /*
         * initialize the entity
         */
        ent_ents[e].mark = m;
        ent_ents[e].flags = map_marks[m].flags;
        ent_ents[e].n = map_marks[m].ent;

        /*
         * if entity is to be already running (i.e. not asleep and waiting
         * for some trigger to move), then use LETHALR i.e. restart flag, right
         * from the beginning
         */
        if (ent_ents[e].flags & ENT_FLG_LETHALR)
            ent_ents[e].n |= ENT_LETHAL;
  
        ent_ents[e].x = map_marks[m].xy & 0xf8;

        let y = (map_marks[m].xy & 0x07) + (map_marks[m].row & 0xf8) - map_frow;
        y <<= 3;
        if (!(ent_ents[e].flags & ENT_FLG_STOPRICK))
            y += 3;
        ent_ents[e].y = y;

        ent_ents[e].xsave = ent_ents[e].x;
        ent_ents[e].ysave = ent_ents[e].y;

        /*ent_ents[e].w0C = 0;*/  /* in ASM code but never used */

        ent_ents[e].w = ent_entdata[map_marks[m].ent].w;
        ent_ents[e].h = ent_entdata[map_marks[m].ent].h;
        ent_ents[e].sprbase = ent_entdata[map_marks[m].ent].spr;
        ent_ents[e].sprite = ent_entdata[map_marks[m].ent].spr;
        ent_ents[e].step_no_i = ent_entdata[map_marks[m].ent].sni;
        ent_ents[e].trigsnd = ent_entdata[map_marks[m].ent].snd;

        /*
         * FIXME what is this? when all trigger flags are up, then
         * use .sni for sprbase. Why? What is the point? (This is
         * for type 1 and 2 e_them, ...)
         *
         * This also means that as long as sprite has not been
         * recalculated, a wrong value is used. This is normal, see
         * what happens to the falling guy on the right on submap 3:
         * it changes when hitting the ground.
         */
        const ENT_FLG_TRIGGERS = (ENT_FLG_TRIGBOMB|ENT_FLG_TRIGBULLET|ENT_FLG_TRIGSTOP|ENT_FLG_TRIGRICK);
        if ((ent_ents[e].flags & ENT_FLG_TRIGGERS) == ENT_FLG_TRIGGERS && e >= 0x09)
            ent_ents[e].sprbase = (ent_entdata[map_marks[m].ent].sni & 0x00ff);

        ent_ents[e].trig_x = map_marks[m].lt & 0xf8;
        ent_ents[e].latency = (map_marks[m].lt & 0x07) << 5;  /* <<5 eq *32 */

        ent_ents[e].trig_y = 3 + 8 * ((map_marks[m].row & 0xf8) - map_frow + (map_marks[m].lt & 0x07));

        ent_ents[e].c2 = 0;
        ent_ents[e].offsy = 0;
        ent_ents[e].ylow = 0;

        ent_ents[e].front = false;

        console.log("create an entity at the slot %d in the 'map_marks' index %d", e, m);
        console.log(ent_ents[e]);
    }
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
        if (ent_ents[i].n && (game_context.game_cheat3 || ent_ents[i].sprite))
            /* If entitiy is active, draw the sprite. */
            draw_sprite2(ent_ents[i].sprite,
                ent_ents[i].x, ent_ents[i].y,
                ent_ents[i].front);
    }

    /*
     * save state
     */
    for (let i = 0; ent_ents[i].n != 0xff; i++) {
        /* save state */
        ent_ents[i].prev_x = ent_ents[i].x;
        ent_ents[i].prev_y = ent_ents[i].y;
        ent_ents[i].prev_n = ent_ents[i].n;
        ent_ents[i].prev_s = ent_ents[i].sprite;
    }
}

/*
 * Clear entities previous state
 *
 */
function ent_clprev() {
    for (let i = 0; ent_ents[i].n != 0xff; i++)
        ent_ents[i].prev_n = 0;
}

/*
 * Table containing entity action function pointers.
 */
const ent_actf = [];

const ent_actf_init = function() {
    ent_actf.push(...[
        null,        /* 00 - zero means that the slot is free */
        e_rick_action,   /* 01 - 12CA */
        e_bullet_action,  /* 02 - 1883 */
        e_bomb_action,  /* 03 - 18CA */
        e_them_t1a_action,  /* 04 - 2452 */
        e_them_t1b_action,  /* 05 - 21CA */
        e_them_t2_action,  /* 06 - 2718 */
        e_them_t1a_action,  /* 07 - 2452 */
        e_them_t1b_action,  /* 08 - 21CA */
        e_them_t2_action,  /* 09 - 2718 */
        e_them_t1a_action,  /* 0A - 2452 */
        e_them_t1b_action,  /* 0B - 21CA */
        e_them_t2_action,  /* 0C - 2718 */
        e_them_t1a_action,  /* 0D - 2452 */
        e_them_t1b_action,  /* 0E - 21CA */
        e_them_t2_action,  /* 0F - 2718 */
        e_box_action,  /* 10 - 245A */
        e_box_action,  /* 11 - 245A */
        e_bonus_action,  /* 12 - 242C */
        e_bonus_action,  /* 13 - 242C */
        e_bonus_action,  /* 14 - 242C */
        e_bonus_action,  /* 15 - 242C */
        e_sbonus_start,  /* 16 - 2182 */
        e_sbonus_stop  /* 17 - 2143 */
    ]);
};

/*
 * Run entities action function
 *
 */
function ent_action() {
    if (!ent_actf.length) ent_actf_init();

    for (let i = 0; ent_ents[i].n != 0xff; i++) {
        if (ent_ents[i].n) {
            let k = ent_ents[i].n & 0x7f;
            if (k == 0x47)
	            e_them_z_action(i);
            else if (k >= 0x18) // 24
                e_them_t3_action(i);
            else
	            ent_actf[k](i);
        }
    }
}
