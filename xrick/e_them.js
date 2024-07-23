"use strict"

const e_them_context = {
    e_them_rndseed: 0,
};














/*
 * Action function for e_them _z (zombie) type
 *
 * ASM 23B8
 */
function e_them_z_action(e) {

}




























function e_them_t1a_action(e) {

}

function e_them_t1b_action(e) {

}

function e_them_t2_action(e) {

}


/*
 * Action sub-function for e_them _t3
 *
 * FIXME always starts asleep??
 *
 * Waits until triggered by something, then execute move steps from
 * ent_mvstep with sprite from ent_sprseq. When done, either restart
 * or disappear.
 *
 * Not always lethal ... but if lethal, kills rick.
 *
 * ASM: 255A
 */
function e_them_t3_action2(e) {
    const get_sproffs = function() { return ent_ents[e].c1; };
    const set_sproffs = function(v) { ent_ents[e].c1 = v; };
    const add_sproffs = function(v) { ent_ents[e].c1 += v; };
    const get_step_count = function() { return ent_ents[e].c2; };
    const set_setp_count = function(v) { ent_ents[e].c2 = v; };
    const add_setp_count = function(v) { ent_ents[e].c2 += v; };

    const wakeup = function() {
        if (E_RICK_STTST(E_RICK_STZOMBIE))
            return;
        /*
         * FIXME the sound should come from a table, there are 10 of them
         * but I dont have the table yet. must rip the data off the game...
         * FIXME is it 8 of them, not 10?
         * FIXME testing below...
         */
        //syssnd_play(WAV_ENTITY[(ent_ents[e].trigsnd & 0x1F) - 0x14], 1);
        /*syssnd_play(WAV_ENTITY[0], 1);*/

        ent_ents[e].n &= ~ENT_LETHAL;
        if (ent_ents[e].flags & ENT_FLG_LETHALI)
            ent_ents[e].n |= ENT_LETHAL;
        set_sproffs(1); // ent_ents[e].sproffs = 1;
        set_setp_count(0); // ent_ents[e].step_count = 0;
        ent_ents[e].step_no = ent_ents[e].step_no_i;
    };

    while (true) {
        /* calc new sprite */
        let i = ent_sprseq[ent_ents[e].sprbase + get_sproffs()];
        if (i == 0xff)
            i = ent_sprseq[ent_ents[e].sprbase];
        ent_ents[e].sprite = i;

        if (get_sproffs() != 0) {  /* awake */
            /* rotate sprseq */
            if (ent_sprseq[ent_ents[e].sprbase + get_sproffs()] != 0xff)
	            add_sproffs(1);
            if (ent_sprseq[ent_ents[e].sprbase + get_sproffs()] == 0xff)
	            set_sproffs(1);

            if (get_step_count() < ent_mvstep[ent_ents[e].step_no].count) {
                /*
	             * still running this step: try to increment x and y while
	             * checking that they remain within boudaries. if so, return.
	             * else switch to next step.
	             */
	            add_setp_count(1);
	            let x = ent_ents[e].x + ent_mvstep[ent_ents[e].step_no].dx;

                /* check'n save */
	            if (x > 0 && x < 0xe8) {
                    ent_ents[e].x = x;
                    /*FIXME*/
                    /*
                    y = ent_mvstep[ent_ents[e].step_no].dy;
                    if (y < 0)
                        y += 0xff00;
                    y += ent_ents[e].y;
                    */
                    let y = ent_ents[e].y + ent_mvstep[ent_ents[e].step_no].dy;
                    if (y > 0 && y < 0x0140) {
                        ent_ents[e].y = y;
                        return;
                    }
                }
            }

            /*
             * step is done, or x or y is outside boundaries. try to
             * switch to next step
             */
            ent_ents[e].step_no++;
            if (ent_mvstep[ent_ents[e].step_no].count != 0xff) {
                /* there is a next step: init and loop */
                set_setp_count(0);
            }
            else {
                /* there is no next step: restart or deactivate */
                if (!E_RICK_STTST(E_RICK_STZOMBIE) && !(ent_ents[e].flags & ENT_FLG_ONCE)) {
                    /* loop this entity */
	                set_sproffs(0);
	                ent_ents[e].n &= ~ENT_LETHAL;
	                if (ent_ents[e].flags & ENT_FLG_LETHALR)
	                    ent_ents[e].n |= ENT_LETHAL;
	                ent_ents[e].x = ent_ents[e].xsave;
	                ent_ents[e].y = ent_ents[e].ysave;
	                if (ent_ents[e].y < 0 || ent_ents[e].y > 0x140) {
	                    ent_ents[e].n = 0;
	                    return;
	                }
                }
                else {
                    /* deactivate this entity */
                    ent_ents[e].n = 0;
                    return;
                }
            }
        }
        else { /* ent_ents[e].sprseq1 == 0 -- waiting */
            if (ent_ents[e].flags & ENT_FLG_TRIGRICK) {  /* reacts to rick */
                /* wake up if triggered by rick */
                if (u_trigbox(e, E_RICK_ENT.x + 0x0C, E_RICK_ENT.y + 0x0A))
                    return wakeup();
            }

            if (ent_ents[e].flags & ENT_FLG_TRIGSTOP) {  /* reacts to rick "stop" */
                /* wake up if triggered by rick "stop" */
                if (E_RICK_STTST(E_RICK_STSTOP) &&
                    u_trigbox(e, e_rick_context.e_rick_stop_x, e_rick_context.e_rick_stop_y))
                    return wakeup();
            }

            if (ent_ents[e].flags & ENT_FLG_TRIGBULLET) {  /* reacts to bullets */
                /* wake up if triggered by bullet */
                if (E_BULLET_ENT.n && u_trigbox(e, e_bullet_context.e_bullet_xc, e_bullet_context.e_bullet_yc)) {
                    E_BULLET_ENT.n = 0;
                    return wakeup();
                }
            }
        
            if (ent_ents[e].flags & ENT_FLG_TRIGBOMB) {  /* reacts to bombs */
                /* wake up if triggered by bomb */
                if (e_bomb_context.e_bomb_lethal && u_trigbox(e, e_bomb_context.e_bomb_xc, e_bomb_context.e_bomb_yc))
                    return wakeup();
            }

            /* not triggered: keep waiting */
            return;
        }
    }
}

/*
 * Action function for e_them _t3 type
 *
 * ASM 2546
 */
function e_them_t3_action(e) {
    e_them_t3_action2(e);

    /* if lethal, can kill rick */
    if ((ent_ents[e].n & ENT_LETHAL) &&
        !E_RICK_STTST(E_RICK_STZOMBIE) && e_rick_boxtest(e)) {
        /* CALL 1130 */
        e_rick_gozombie();
    }
}
