"use strict"

const SEQ_INIT = 0x0A;

function e_box_action(e) {
    const sp = [0x24, 0x25, 0x26, 0x27, 0x28];  /* explosion sprites sequence */

    if (ent_ents[e].n & ENT_LETHAL) {
		/*
		 * box is lethal i.e. exploding
		 * play sprites sequence then stop
		 */
		ent_ents[e].sprite = sp[ent_ents[e].cnt >> 1];
		if (--ent_ents[e].cnt == 0) {
			ent_ents[e].n = 0;
			map_marks[ent_ents[e].mark].ent |= MAP_MARK_NACT;
		}
	} else {
		/*
		 * not lethal: check to see if triggered
		 */
		if (e_rick_boxtest(e)) {
			/* rick: collect bombs or bullets and stop */
			//syssnd_play(WAV_BOX, 1);

			if (ent_ents[e].n == 0x10)
				game_context.game_bombs = GAME_BOMBS_INIT;
			else  /* 0x11 */
                game_context.game_bullets = GAME_BULLETS_INIT;
			ent_ents[e].n = 0;
			map_marks[ent_ents[e].mark].ent |= MAP_MARK_NACT;
		}
		else if (E_RICK_STTST(E_RICK_STSTOP)
            && u_fboxtest(e, e_rick_context.e_rick_stop_x, e_rick_context.e_rick_stop_y)) {
			/* rick's stick: explode */
			explode(e);
		}
		else if (E_BULLET_ENT.n && u_fboxtest(e, e_bullet_xc, e_bullet_yc)) {
			/* bullet: explode (and stop bullet) */
			E_BULLET_ENT.n = 0;
			explode(e);
		}
		else if (e_bomb_context.e_bomb_lethal && e_bomb_hit(e)) {
			/* bomb: explode */
			explode(e);
		}
	}
}

/*
 * Explode when
 */
function explode(e) {
	ent_ents[e].cnt = SEQ_INIT;
	ent_ents[e].n |= ENT_LETHAL;

	//syssnd_play(WAV_EXPLODE, 1);
}
