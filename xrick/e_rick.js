"use strict"

const e_rick_context = {
    /*
     * public vars
    */
    e_rick_stop_x: 0,
    e_rick_stop_y: 0,
    e_rick_state: 0,

    /*
     * local vars
     */
    scrawl: 0,
    trigger: false,
    offsx: 0,
    ylow: 0,  // fixed-point number, scaling factor 2 ^ 8
    offsy: 0, // fixed-point number, scaling factor 2 ^ 8
    seq: 0,
    save_crawl: 0,
    save_x: 0,
    save_y: 0,

    stopped: false,
};

const E_RICK_NO = 1;
const E_RICK_ENT = ent_ents[E_RICK_NO];

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


/*
 * Box test
 *
 * ASM 113E (based on)
 *
 * e: entity to test against (corresponds to SI in asm code -- here DI
 *    is assumed to point to rick).
 * ret: TRUE/intersect, FALSE/not.
 */
function e_rick_boxtest(e) {
	/*
	 * rick: x+0x05 to x+0x11, y+[0x08 if rick's crawling] to y+0x14
	 * entity: x to x+w, y to y+h
	 */

	if (E_RICK_ENT.x + 0x11 < ent_ents[e].x ||
		E_RICK_ENT.x + 0x05 > ent_ents[e].x + ent_ents[e].w ||
		E_RICK_ENT.y + 0x14 < ent_ents[e].y ||
		E_RICK_ENT.y + (E_RICK_STTST(E_RICK_STCRAWL) ? 0x08 : 0x00) > ent_ents[e].y + ent_ents[e].h - 1)
		return false;
	else
		return true;
}

/*
 * Go zombie
 *
 * ASM 1851
 */
function e_rick_gozombie() {
    if (game_context.game_cheat2) return;

	/* already zombie? */
	if (E_RICK_STTST(E_RICK_STZOMBIE)) return;

    // syssnd_play(WAV_DIE, 1);

	E_RICK_STSET(E_RICK_STZOMBIE);
	e_rick_context.offsy = -0x0400;
	e_rick_context.offsx = (E_RICK_ENT.x > 0x80 ? -3 : +3);
	e_rick_context.ylow = 0;
	E_RICK_ENT.front = true;
}

/*
 * Action sub-function for e_rick when zombie
 *
 * ASM 17DC
 */
function e_rick_z_action() {
	/* sprite */
	E_RICK_ENT.sprite = (E_RICK_ENT.x & 0x04) ? 0x1A : 0x19;

	/* x */
	E_RICK_ENT.x += e_rick_context.offsx;

	/* y */
	let i = (E_RICK_ENT.y << 8) + e_rick_context.offsy + e_rick_context.ylow;
	E_RICK_ENT.y = i >> 8;
	e_rick_context.offsy += 0x80;
	e_rick_context.ylow = i & 0xff;

	/* dead when out of screen */
	if (E_RICK_ENT.y < 0 || E_RICK_ENT.y > 0x0140)
		E_RICK_STSET(E_RICK_STDEAD);
}

/*
 * Action sub-function for e_rick.
 *
 * ASM 13BE
 */
function e_rick_action2() {
    let env0 = [0], env1 = [0];
	let x = 0, y =0;
	let i = 0;

	E_RICK_STRST(E_RICK_STSTOP|E_RICK_STSHOOT);

	/* if zombie, run dedicated function and return */
	if (E_RICK_STTST(E_RICK_STZOMBIE)) {
		e_rick_z_action();
		return;
	}

	/*
	* NOT CLIMBING
	*/
    const not_climbing = function() {
	    E_RICK_STRST(E_RICK_STJUMP);
	    /* calc y, fixed-point number, scaling factor 2 ^ 8 */
	    i = (E_RICK_ENT.y << 8) + e_rick_context.offsy + e_rick_context.ylow;
	    y = i >> 8;
	    /* test environment */
	    u_envtest(E_RICK_ENT.x, y, E_RICK_STTST(E_RICK_STCRAWL), env0, env1);
	    /* stand up, if possible */
	    if (E_RICK_STTST(E_RICK_STCRAWL) && !env0[0])
		    E_RICK_STRST(E_RICK_STCRAWL);

        /* can move vertically? */
	    if (env1[0] & (e_rick_context.offsy < 0 ?
            	MAP_EFLG_VERT|MAP_EFLG_SOLID|MAP_EFLG_SPAD :
				MAP_EFLG_VERT|MAP_EFLG_SOLID|MAP_EFLG_SPAD|MAP_EFLG_WAYUP))
		    return vert_not();

        return vertical_move();
    };

	/*
	* VERTICAL MOVE
	*/
    const vertical_move = function() {
	    E_RICK_STSET(E_RICK_STJUMP);
	    /* killed? */
	    if (env1[0] & MAP_EFLG_LETHAL) {
		    e_rick_gozombie();
		    return true;
	    }
	    /* save */
	    E_RICK_ENT.y = y;
	    e_rick_context.ylow = i & 0xff; // y fraction
	    /* climb? */
	    if ((env1[0] & MAP_EFLG_CLIMB) &&
			(control.control_status & (CONTROL_UP|CONTROL_DOWN))) {
		    e_rick_context.offsy = 0x0100; // set speed = 1 pixel down
		    E_RICK_STSET(E_RICK_STCLIMB);
		    return true;
	    }

	    /* fall, add the speed 0.5 pixels down, not over 8 pixels */
	    e_rick_context.offsy += 0x0080;
	    if (e_rick_context.offsy > 0x0800) {
		    e_rick_context.offsy = 0x0800;
		    e_rick_context.ylow = 0;
	    }

        return horiz();
    };

	/*
	* HORIZONTAL MOVE
	*/
    const horiz = function() {
        /* should move? */
	    if (!(control.control_status & (CONTROL_LEFT|CONTROL_RIGHT))) {
		    e_rick_context.seq = 2; /* no: reset seq and return */
		    return true;
	    }
	    if (control.control_status & CONTROL_LEFT) {
            /* move left */
		    x = E_RICK_ENT.x - 2;
		    game_context.game_dir = LEFT;
		    if (x < 0) {  /* prev submap */
			    game_context.game_chsm = true;
			    E_RICK_ENT.x = 0xe2;
			    return true;
		    }
	    } else {
            /* move right */
		    x = E_RICK_ENT.x + 2;
		    game_context.game_dir = RIGHT;
		    if (x >= 0xe8) {  /* next submap */
			    game_context.game_chsm = true;
			    E_RICK_ENT.x = 0x04;
			    return true;
		    }
	    }

	    /* still within this map: test environment */
	    u_envtest(x, E_RICK_ENT.y, E_RICK_STTST(E_RICK_STCRAWL), env0, env1);

	    /* save x-position if it is possible to move */
	    if (!(env1[0] & (MAP_EFLG_SOLID|MAP_EFLG_SPAD|MAP_EFLG_WAYUP))) {
		    E_RICK_ENT.x = x;
		    if (env1[0] & MAP_EFLG_LETHAL) e_rick_gozombie();
	    }

	    /* end */
	    return true;
    };

    /*
     * NO VERTICAL MOVE
    */
    const vert_not = function() {
        if (e_rick_context.offsy < 0) {
            /* not climbing + trying to go _up_ not possible -> hit the roof */
            E_RICK_STSET(E_RICK_STJUMP);  /* fall back to the ground */
            E_RICK_ENT.y &= 0xF8; // 8 pixels aligned
            e_rick_context.offsy = 0; // set speed = 0
            e_rick_context.ylow = 0;
            return horiz();
        }
        /* else: not climbing + trying to go _down_ not possible -> standing */
        /* align to ground */
        E_RICK_ENT.y &= 0xF8; // 8 pixels aligned
        E_RICK_ENT.y |= 0x03; // 21 pixels high, (24-21=3) aligned to ground
        e_rick_context.ylow = 0;

        /* standing on a super pad? */
        if ((env1[0] & MAP_EFLG_SPAD) && e_rick_context.offsy >= 0X0200) {
            e_rick_context.offsy =
                (control.control_status & CONTROL_UP) ? 0xf800 : 0x00fe - offsy;
            //syssnd_play(WAV_PAD, 1);

            return horiz();
        }

        e_rick_context.offsy = 0x0100;  /* reset to the speed 1 pixel down for gravity*/

        /* standing. firing ? */
        if (e_rick_context.scrawl || !(control.control_status & CONTROL_FIRE))
            return firing_not();

        return firing();
    };

    /*
     * FIRING
     */
    const firing = function() {
	    if (control.control_status & (CONTROL_LEFT|CONTROL_RIGHT)) {
            /* stop */
		    if (control.control_status & CONTROL_RIGHT) {
                game_context.game_dir = RIGHT;
			    e_rick_context.e_rick_stop_x = E_RICK_ENT.x + 0x17;
		    } else {
                game_context.game_dir = LEFT;
                e_rick_context.e_rick_stop_x = E_RICK_ENT.x;
		    }
		    e_rick_context.e_rick_stop_y = E_RICK_ENT.y + 0x000E;
		    E_RICK_STSET(E_RICK_STSTOP);
		    return true;
	    }

        if (control.control_status == (CONTROL_FIRE|CONTROL_UP)) {
            /* bullet */
            E_RICK_STSET(E_RICK_STSHOOT);
            /* not an automatic gun: shoot once only */
            if (e_rick_context.trigger)
                return true;
            else
                e_rick_context.trigger = false;
            /* already a bullet in the air ... that's enough */
            if (E_BULLET_ENT.n)
                return true;
            /* else use a bullet, if any available */
            if (!game_context.game_bullets)
                return;
            if (!game_context.game_cheat1)
                game_context.game_bullets--;
            /* initialize bullet */
            e_bullet_init(E_RICK_ENT.x, E_RICK_ENT.y);
            return true;
        }

        e_rick_context.trigger = false; /* not shooting means trigger is released */
        e_rick_context.seq = 0; /* reset */

        if (control.control_status == (CONTROL_FIRE|CONTROL_DOWN)) {
            /* bomb */
            /* already a bomb ticking ... that's enough */
            if (E_BOMB_ENT.n)
                return;
            /* else use a bomb, if any available */
            if (!game_context.game_bombs)
                return;
            if (!game_context.game_cheat1)
                game_context.game_bombs--;
            /* initialize bomb */
            e_bomb_init(E_RICK_ENT.x, E_RICK_ENT.y);
            return true;
        }

        return true;
    };

    /*
     * NOT FIRING
     */
    const firing_not = function() {
        if (control.control_status & CONTROL_UP) {
            /* jump or climb */
            if (env1[0] & MAP_EFLG_CLIMB) {
                /* climb */
                E_RICK_STSET(E_RICK_STCLIMB);
                return true;
            }
            e_rick_context.offsy = -0x0580;  /* jump, speed = -5.5 pixels */
            e_rick_context.ylow = 0;
            // syssnd_play(WAV_JUMP, 1);
            return horiz();
        }
        if (control.control_status & CONTROL_DOWN) {
            /* crawl or climb */
            if ((env1[0] & MAP_EFLG_VERT) &&  /* can go down */
	            !(control.control_status & (CONTROL_LEFT|CONTROL_RIGHT)) &&  /* + not moving horizontaly */
	            (E_RICK_ENT.x & 0x1f) < 0x0a) {  /* + aligned -> climb */
                E_RICK_ENT.x &= 0xf0;
                E_RICK_ENT.x |= 0x04;
                E_RICK_STSET(E_RICK_STCLIMB);
            }
            else {  /* crawl */
                E_RICK_STSET(E_RICK_STCRAWL);
                return horiz();
            }
        }

        return horiz();
    };

	/*
	* CLIMBING
	*/
	const climbing = function() {
		/* should move? */
		if (!(control.control_status & (CONTROL_UP|CONTROL_DOWN|CONTROL_LEFT|CONTROL_RIGHT))) {
			e_rick_context.seq = 0; /* no: reset seq and return */
			return true;
		}

		if (control.control_status & (CONTROL_UP|CONTROL_DOWN)) {
			/* up-down: calc new y and test environment */
			y = E_RICK_ENT.y + ((control.control_status & CONTROL_UP) ? -0x02 : 0x02);
			u_envtest(E_RICK_ENT.x, y, E_RICK_STTST(E_RICK_STCRAWL), env0, env1);
			if (env1[0] & (MAP_EFLG_SOLID|MAP_EFLG_SPAD|MAP_EFLG_WAYUP) &&
					!(control.control_status & CONTROL_UP)) {
				/* FIXME what? */
				E_RICK_STRST(E_RICK_STCLIMB);
				return true;
			}
			if (!(env1[0] & (MAP_EFLG_SOLID|MAP_EFLG_SPAD|MAP_EFLG_WAYUP)) ||
					(env1[0] & MAP_EFLG_WAYUP)) {
				/* ok to move, save */
				E_RICK_ENT.y = y;
				if (env1[0] & MAP_EFLG_LETHAL) {
					e_rick_gozombie();
					return true;
				}
				if (!(env1[0] & (MAP_EFLG_VERT|MAP_EFLG_CLIMB))) {
					/* reached end of climb zone */
					e_rick_context.offsy = (control.control_status & CONTROL_UP) ? -0x0300 : 0x0100;

					//if (control.control_status & CONTROL_UP)
					//	syssnd_play(WAV_JUMP, 1);

					E_RICK_STRST(E_RICK_STCLIMB);
					return true;
				}
			}
		}

        if (control.control_status & (CONTROL_LEFT|CONTROL_RIGHT)) {
            /* left-right: calc new x and test environment */
            if (control.control_status & CONTROL_LEFT) {
                x = E_RICK_ENT.x - 0x02;
            if (x < 0) {  /* (i.e. negative) prev submap */
	            game_context.game_chsm = true;
	            /*6dbd = 0x00;*/
	            E_RICK_ENT.x = 0xe2;
	            return true;
            }
        }
        else {
            x = E_RICK_ENT.x + 0x02;
            if (x >= 0xe8) {  /* next submap */
	            game_context.game_chsm = true;
	            /*6dbd = 0x01;*/
	            E_RICK_ENT.x = 0x04;
	            return true;
            }
        }
        u_envtest(x, E_RICK_ENT.y, E_RICK_STTST(E_RICK_STCRAWL), env0, env1);
        if (env1[0] & (MAP_EFLG_SOLID|MAP_EFLG_SPAD)) return;
        E_RICK_ENT.x = x;
        if (env1[0] & MAP_EFLG_LETHAL) {
            e_rick_gozombie();
            return true;
        }

        if (env1[0] & (MAP_EFLG_VERT|MAP_EFLG_CLIMB)) return;
        E_RICK_STRST(E_RICK_STCLIMB);
        if (control.control_status & CONTROL_UP)
            e_rick_context.offsy = -0x0300;
        }
    };

	// flow:
	// +-- climing
	// |
	// +-- not climbing
	//     +-- vertical move
	//     |   +-- horizontal move
	//     +-- not vertical move
	//         +-- hroizontal move
	//         +-- firing
	//         +-- not firing
	//             +-- horizontal move

    /* climbing? */
	if (E_RICK_STTST(E_RICK_STCLIMB))
		climbing();
    else
        not_climbing();
}

/*
 * Action function for e_rick
 *
 * ASM 12CA
 */
function e_rick_action(e) {
    e_rick_action2();

    e_rick_context.scrawl = E_RICK_STTST(E_RICK_STCRAWL);

	if (E_RICK_STTST(E_RICK_STZOMBIE))
		return;

	/*
	 * set sprite
	 */
	if (E_RICK_STTST(E_RICK_STSTOP)) {
		E_RICK_ENT.sprite = (game_dir ? 0x17 : 0x0B);

		if (!e_rick_context.stopped) {
			//syssnd_play(WAV_STICK, 1);
			e_rick_context.stopped = true;
		}
		return;
	}

	e_rick_context.stopped = false;

	if (E_RICK_STTST(E_RICK_STSHOOT)) {
		E_RICK_ENT.sprite = (game_dir ? 0x16 : 0x0A);
		return;
	}

	if (E_RICK_STTST(E_RICK_STCLIMB)) {
		E_RICK_ENT.sprite = (((E_RICK_ENT.x ^ E_RICK_ENT.y) & 0x04) ? 0x18 : 0x0c);

		e_rick_context.seq = (e_rick_c.seq + 1) & 0x03;
		//if (e_rick_context.seq == 0) syssnd_play(WAV_WALK, 1);

		return;
	}

	if (E_RICK_STTST(E_RICK_STCRAWL)) {
		E_RICK_ENT.sprite = (game_context.game_dir ? 0x13 : 0x07);
		if (E_RICK_ENT.x & 0x04) E_RICK_ENT.sprite++;

		e_rick_context.seq = (e_rick_context.seq + 1) & 0x03;
		//if (e_rick_context.seq == 0) syssnd_play(WAV_CRAWL, 1);

		return;
	}

	if (E_RICK_STTST(E_RICK_STJUMP)) {
		E_RICK_ENT.sprite = (game_context.game_dir ? 0x15 : 0x06);
		return;
	}

	e_rick_context.seq++;

	if (e_rick_context.seq >= 0x14) {
		//syssnd_play(WAV_WALK, 1);

		e_rick_context.seq = 0x04;
	}
    else {
        //if (e_rick_context.seq == 0x0C)
            //syssnd_play(WAV_WALK, 1);
    }

    E_RICK_ENT.sprite =
        (e_rick_context.seq >> 2) + 1 + (game_context.game_dir ? 0x0c : 0x00);
}

/*
 * Save status
 *
 * ASM part of 0x0BBB
 */
function e_rick_save() {
	e_rick_context.save_x = E_RICK_ENT.x;
	e_rick_context.save_y = E_RICK_ENT.y;
	e_rick_context.save_crawl = E_RICK_STTST(E_RICK_STCRAWL);
}

/*
 * Restore status
 *
 * ASM part of 0x0BDC
 */
function e_rick_restore() {
	E_RICK_ENT.x = e_rick_context.save_x;
	E_RICK_ENT.y = e_rick_context.save_y;
	E_RICK_ENT.front = false;
	if (e_rick_context.save_crawl)
		E_RICK_STSET(E_RICK_STCRAWL);
	else
		E_RICK_STRST(E_RICK_STCRAWL);
}
