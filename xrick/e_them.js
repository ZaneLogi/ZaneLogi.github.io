"use strict"

const e_them_context = {
    e_them_rndseed: 0,  // U32

    e_them_rndnbr: 0, // U16
};

const TYPE_1A = 0x00;
const TYPE_1B = 0xff;

/*
 * Check if entity boxtests with a lethal e_them i.e. something lethal
 * in slot 0 and 4 to 8.
 *
 * ASM 122E
 *
 * e: entity slot number.
 * ret: TRUE/boxtests, FALSE/not
 */
function u_themtest(e) {
    if ((ent_ents[0].n & ENT_LETHAL) && u_boxtest(e, 0))
        return true;

    for (let i = 4; i < 9; i++)
        if ((ent_ents[i].n & ENT_LETHAL) && u_boxtest(e, i))
            return true;

    return false;
}

/*
 * Go zombie
 *
 * ASM 237B
 */
function e_them_gozombie(e) {
    const set_offsx = function(v) { ent_ents[e].c1 = v; };

    ent_ents[e].n = 0x47;  /* zombie entity */
    ent_ents[e].front = true;
    ent_ents[e].offsy = -0x0400;

    //syssnd_play(WAV_DIE, 1);

    game_context.game_score += 50;
    if (ent_ents[e].flags & ENT_FLG_ONCE) {
        /* make sure entity won't be activated again */
        map_marks[ent_ents[e].mark].ent |= MAP_MARK_NACT;
    }

    set_offsx(ent_ents[e].x >= 0x80 ? -0x02 : 0x02);
}

/*
 * Action sub-function for e_them _t1a and _t1b
 *
 * Those two types move horizontally, and fall if they have to.
 * Type 1a moves horizontally over a given distance and then
 * u-turns and repeats; type 1b is more subtle as it does u-turns
 * in order to move horizontally towards rick.
 *
 * ASM 2242
 */
function e_them_t1_action2(e, type)
{
    const get_offsx = function() { return ent_ents[e].c1; };
    const set_offsx = function(v) { ent_ents[e].c1 = v; };
    const get_step_count = function() { return ent_ents[e].c2; };
    const set_step_count = function(v) { ent_ents[e].c2 = v; };
    const add_step_count = function(v) { ent_ents[e].c2 += v; };

    let env0 = [0], env1 = [0];

    /* by default, try vertical move. calculate new y */
    let i = (ent_ents[e].y << 8) + ent_ents[e].offsy + ent_ents[e].ylow;
    let y = i >> 8;

    /* deactivate if outside vertical boundaries */
    /* no need to test zero since e_them _t1a/b don't go up */
    /* FIXME what if they got scrolled out ? */
    if (y > 0x140) {
        ent_ents[e].n = 0;
        return;
    }

    /* test environment */
    u_envtest(ent_ents[e].x, y, false, env0, env1);

    if (!(env1[0] & (MAP_EFLG_VERT|MAP_EFLG_SOLID|MAP_EFLG_SPAD|MAP_EFLG_WAYUP))) {
        /* vertical move possible: falling */
        if (env1[0] & MAP_EFLG_LETHAL) {
            /* lethal entities kill e_them */
            e_them_gozombie(e);
            return;
        }
        /* save, cleanup and return */
        ent_ents[e].y = y;
        ent_ents[e].ylow = i & 0xff;
        ent_ents[e].offsy += 0x0080;
        if (ent_ents[e].offsy > 0x0800)
            ent_ents[e].offsy = 0x0800;
        return;
    }

    /* vertical move not possible. calculate new sprite */
    ent_ents[e].sprite = ent_ents[e].sprbase
        + ent_sprseq[(ent_ents[e].x & 0x1c) >> 3]
        + (get_offsx() < 0 ? 0x03 : 0x00);

    /* reset offsy */
    ent_ents[e].offsy = 0x0080;

    /* align to ground */
    ent_ents[e].y &= 0xfff8;
    ent_ents[e].y |= 0x0003;

    /* latency: if not zero then decrease and return */
    if (ent_ents[e].latency > 0) {
        ent_ents[e].latency--;
        return;
    }

    /* horizontal move. calculate new x */
    if (get_offsx() == 0)  /* not supposed to move -> don't */
        return;

    let x = ent_ents[e].x + get_offsx();
    if (ent_ents[e].x < 0 || ent_ents[e].x > 0xe8) {
        /*  U-turn and return if reaching horizontal boundaries */
        set_step_count(0);
        set_offsx(-get_offsx());
        return;
    }

    /* test environment */
    u_envtest(x, ent_ents[e].y, false, env0, env1);

    if (env1[0] & (MAP_EFLG_VERT|MAP_EFLG_SOLID|MAP_EFLG_SPAD|MAP_EFLG_WAYUP)) {
        /* horizontal move not possible: u-turn and return */
        set_step_count(0);
        set_offsx(-get_offsx());
        return;
    }

    /* horizontal move possible */
    if (env1[0] & MAP_EFLG_LETHAL) {
        /* lethal entities kill e_them */
        e_them_gozombie(e);
        return;
    }

    /* save */
    ent_ents[e].x = x;

    /* depending on type, */
    if (type == TYPE_1B) {
        /* set direction to move horizontally towards rick */
        if ((ent_ents[e].x & 0x1e) != 0x10)  /* prevents too frequent u-turns */
            return;
        set_offsx((ent_ents[e].x < E_RICK_ENT.x) ? 0x02 : -0x02);
        return;
    }
    else {
        /* set direction according to step counter */
        add_step_count(1);
        /* FIXME why trig_x (b16) ?? */
        if ((ent_ents[e].trig_x >> 1) > get_step_count())
            return;
    }

    /* type is 1A and step counter reached its limit: u-turn */
    set_step_count(0);
    set_offsx(-get_offsx());
}

/*
 * ASM 21CF
 */
function e_them_t1_action(e, type) {
    e_them_t1_action2(e, type);

    /* lethal entities kill them */
    if (u_themtest(e)) {
        e_them_gozombie(e);
        return;
    }

    /* bullet kills them */
    if (E_BULLET_ENT.n &&
        u_fboxtest(e, E_BULLET_ENT.x + (e_bullet_context.e_bullet_offsx < 0 ? 0 : 0x18),
		E_BULLET_ENT.y)) {
        E_BULLET_ENT.n = 0;
        e_them_gozombie(e);
        return;
    }

    /* bomb kills them */
    if (e_bomb_context.e_bomb_lethal && e_bomb_hit(e)) {
        e_them_gozombie(e);
        return;
    }

    /* rick stops them */
    if (E_RICK_STTST(E_RICK_STSTOP) &&
        u_fboxtest(e, e_rick_context.e_rick_stop_x, e_rick_context.e_rick_stop_y))
    ent_ents[e].latency = 0x14;

    /* they kill rick */
    if (e_rick_boxtest(e))
        e_rick_gozombie();
}


/*
 * Action function for e_them _t1a type (stays within boundaries)
 *
 * ASM 2452
 */
function e_them_t1a_action(e) {
    e_them_t1_action(e, TYPE_1A);
}

/*
 * Action function for e_them _t1b type (runs for rick)
 *
 * ASM 21CA
 */
function e_them_t1b_action(e) {
    e_them_t1_action(e, TYPE_1B);
}

/*
 * Action function for e_them _z (zombie) type
 *
 * ASM 23B8
 */
function e_them_z_action(e) {
    const get_offsx = function() { return ent_ents[e].c1; };

    /* calc new sprite */
    ent_ents[e].sprite = ent_ents[e].sprbase
        + ((ent_ents[e].x & 0x04) ? 0x07 : 0x06);

    /* calc new y */
    let i = (ent_ents[e].y << 8) + ent_ents[e].offsy + ent_ents[e].ylow;

    /* deactivate if out of vertical boundaries */
    if (ent_ents[e].y < 0 || ent_ents[e].y > 0x0140) {
        ent_ents[e].n = 0;
        return;
    }

    /* save */
    ent_ents[e].offsy += 0x0080;
    ent_ents[e].ylow = i & 0xff;
    ent_ents[e].y = i >> 8;

    /* calc new x */
    ent_ents[e].x += get_offsx();

    /* must stay within horizontal boundaries */
    if (ent_ents[e].x < 0)
        ent_ents[e].x = 0;
    if (ent_ents[e].x > 0xe8)
        ent_ents[e].x = 0xe8;
}

/*
 * Action sub-function for e_them _t2.
 *
 * Must document what it does.
 *
 * ASM 2792
 */
function e_them_t2_action2(e)
{
    const get_flgclmb = function() { return ent_ents[e].c1; };
    const set_flgclmb = function(v) { ent_ents[e].c1 = v; };
    const get_offsx = function() { return ent_ents[e].c2; };
    const set_offsx = function(v) { ent_ents[e].c2 = v; };

    let i;
    let x, y, yd;
    let env0 = [0], env1 = [0];

    /* latency: if not zero then decrease */
    if (ent_ents[e].latency > 0) ent_ents[e].latency--;

    const climbing_not = function() {
        /* NOT CLIMBING */
        set_flgclmb(false);  /* not climbing */

        /* calc new y (falling) and test environment */
        i = (ent_ents[e].y << 8) + ent_ents[e].offsy + ent_ents[e].ylow;
        y = i >> 8;
        u_envtest(ent_ents[e].x, y, false, env0, env1);
        if (!(env1[0] & (MAP_EFLG_SOLID|MAP_EFLG_SPAD|MAP_EFLG_WAYUP))) {
            /*sys_printf("e_them_t2 y move OK\n");*/
            /* can go there */
            if (env1[0] & MAP_EFLG_LETHAL) {
	            e_them_gozombie(e);
	            return;
            }
            if (y > 0x0140) {  /* deactivate if outside */
                ent_ents[e].n = 0;
                return;
            }
            if (!(env1[0] & MAP_EFLG_VERT)) {
                /* save */
                ent_ents[e].y = y;
                ent_ents[e].ylow = i & 0xff;
                ent_ents[e].offsy += 0x0080;
                if (ent_ents[e].offsy > 0x0800)
                    ent_ents[e].offsy = 0x0800;
                
                return;
            }
            if (((ent_ents[e].x & 0x07) == 0x04) && (y < E_RICK_ENT.y)) {
                /*sys_printf("e_them_t2 climbing00\n");*/
                set_flgclmb(true);  /* climbing */
                return;
            }
        }
        /*sys_printf("e_them_t2 ymove nok or ...\n");*/
        /* can't go there, or ... */
        ent_ents[e].y = (ent_ents[e].y & 0xf8) | 0x03;  /* align to ground */
        ent_ents[e].offsy = 0x0100;
        if (ent_ents[e].latency != 0x00)
            return;
        if ((env1[0] & MAP_EFLG_CLIMB) &&
	        ((ent_ents[e].x & 0x0e) == 0x04) &&
	        (ent_ents[e].y > E_RICK_ENT.y)) {
            /*sys_printf("e_them_t2 climbing01\n");*/
            set_flgclmb(true);  /* climbing */
            return;
        }

        /* calc new sprite */
        ent_ents[e].sprite = ent_ents[e].sprbase +
            ent_sprseq[(get_offsx() < 0 ? 4 : 0) +
            ((ent_ents[e].x & 0x0e) >> 3)];
        /*sys_printf("e_them_t2 sprite %02x\n", ent_ents[e].sprite);*/

        /* */
        if (get_offsx() == 0)
            set_offsx(2);
        x = ent_ents[e].x + get_offsx();
        /*sys_printf("e_them_t2 xmove x=%02x\n", x);*/
        if (x < 0xe8) {
            u_envtest(x, ent_ents[e].y, false, env0, env1);
            if (!(env1[0] & (MAP_EFLG_VERT|MAP_EFLG_SOLID|MAP_EFLG_SPAD|MAP_EFLG_WAYUP))) {
                ent_ents[e].x = x;
                if ((x & 0x1e) != 0x08)
                    return;

                /*
	             * Black Magic (tm)
	             *
	             * this is obviously some sort of randomizer to define a direction
	             * for the entity. it is an exact copy of what the assembler code
	             * does but I can't explain.
	             */
                const sl = e_them_context.e_them_rndseed & 0xffff;
                const sh = (e_them_context.e_them_rndseed >> 16) & 0xffff;
                const bx = e_them_context.e_them_rndnbr + sh + sl + 0x0d;
	            const cx = sh;
                const cl = cx & 0xff;
                const ch = (cx >> 8) & 0xff;
                let bl = bx & 0xff;
                const bh = (bx >> 8) & 0xff;
	            bl ^= ch;
	            bl ^= cl;
	            bl ^= bh;
	            e_them_context.e_them_rndnbr = (bl & 0xff) | (bh << 8);

	            set_offsx((bl & 0x01) ? -0x02 : 0x02);

	            /* back to normal */
	            return;
            }
        }

        /* U-turn */
        /*sys_printf("e_them_t2 u-turn\n");*/
        if (get_offsx() == 0)
            set_offsx(2);
        else
            set_offsx(-get_offsx());
    };

    /* climbing? */
    if (get_flgclmb() != true) return climbing_not();

    /* CLIMBING */
    /* latency: if not zero then return */
    if (ent_ents[e].latency > 0) return;

    /* calc new sprite */
    ent_ents[e].sprite = ent_ents[e].sprbase + 0x08 +
        (((ent_ents[e].x ^ ent_ents[e].y) & 0x04) ? 1 : 0);

    const ymove = function() {
        /* calc new y and test environment */
        yd = ent_ents[e].y < E_RICK_ENT.y ? 0x02 : -0x02;
        y = ent_ents[e].y + yd;
        if (y < 0 || y > 0x0140) {
            ent_ents[e].n = 0;
            return;
        }
        u_envtest(ent_ents[e].x, y, false, env0, env1);
        if (env1[0] & (MAP_EFLG_SOLID|MAP_EFLG_SPAD|MAP_EFLG_WAYUP)) {
            if (yd < 0)
	            return xmove();  /* can't go up */
            else
	            return climbing_not();  /* can't go down */
        }
        /* can move */
        ent_ents[e].y = y;
        if (env1[0] & (MAP_EFLG_VERT|MAP_EFLG_CLIMB))  /* still climbing */
            return;

        return climbing_not();
    };

    const xmove = function() {
        /* calc new x and test environment */
        set_offsx((ent_ents[e].x < E_RICK_ENT.x) ? 0x02 : -0x02);
        x = ent_ents[e].x + get_offsx();
        u_envtest(x, ent_ents[e].y, false, env0, env1);
        if (env1[0] & (MAP_EFLG_SOLID|MAP_EFLG_SPAD|MAP_EFLG_WAYUP))
            return;
        if (env1[0] & MAP_EFLG_LETHAL) {
            e_them_gozombie(e);
            return;
        }
        ent_ents[e].x = x;
        if (env1[0] & (MAP_EFLG_VERT|MAP_EFLG_CLIMB))  /* still climbing */
            return;
        
        return climbing_not();  /* not climbing anymore */
    }

    /* reached rick's level? */
    if ((ent_ents[e].y & 0xfe) != (E_RICK_ENT.y & 0xfe)) return ymove();

    return xmove();
}

function e_them_t2_action(e) {
    e_them_t2_action2(e);

    /* they kill rick */
    if (e_rick_boxtest(e))
        e_rick_gozombie();

    /* lethal entities kill them */
    if (u_themtest(e)) {
        e_them_gozombie(e);
        return;
    }

    /* bullet kills them */
    if (E_BULLET_ENT.n &&
        u_fboxtest(e, E_BULLET_ENT.x
            + (e_bullet_context.e_bullet_offsx < 0 ? 0x00 : 0x18),
		    E_BULLET_ENT.y)) {
        E_BULLET_ENT.n = 0;
        e_them_gozombie(e);
        return;
    }

    /* bomb kills them */
    if (e_bomb_context.e_bomb_lethal && e_bomb_hit(e)) {
        e_them_gozombie(e);
        return;
    }

    /* rick stops them */
    if (E_RICK_STTST(E_RICK_STSTOP) &&
        u_fboxtest(e, e_rick_context.e_rick_stop_x,
            e_rick_context.e_rick_stop_y))
        ent_ents[e].latency = 0x14;
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
