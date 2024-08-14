"use strict"

const e_sbonus_context = {
    e_sbonus_counting: false,
    e_sbonus_counter: 0,
    e_sbonus_bonus: 0,
};


function e_sbonus_start(e) {
    ent_ents[e].sprite = 0; /* invisible */
    if (u_trigbox(e, E_RICK_ENT.x + 0x0C, E_RICK_ENT.y + 0x0A)) {
        /* rick is within trigger box */
        ent_ents[e].n = 0;
        e_sbonus_context.e_sbonus_counting = true;  /* 6DD5 */
        e_sbonus_context.e_sbonus_counter = 0x1e;  /* 6DDB */
        e_sbonus_context.e_sbonus_bonus = 2000;    /* 291A-291D */

        game.playsound(game.WAV_SBONUS1, 1);
    }
}

function e_sbonus_stop(e) {
    ent_ents[e].sprite = 0; /* invisible */

    if (!e_sbonus_context.e_sbonus_counting)
        return;

    if (u_trigbox(e, E_RICK_ENT.x + 0x0C, E_RICK_ENT.y + 0x0A)) {
        /* rick is within trigger box */
        e_sbonus_context.e_sbonus_counting = false;  /* stop counting */
        ent_ents[e].n = 0;  /* deactivate entity */
        game_context.game_score += e_sbonus_context.e_sbonus_bonus;  /* add bonus to score */

        game.playsound(game.WAV_SBONUS2, 1);

        /* make sure the entity won't be activated again */
        map_marks[ent_ents[e].mark].ent |= MAP_MARK_NACT;
    }
    else {
        /* keep counting */
        if (--e_sbonus_context.e_sbonus_counter == 0) {
            e_sbonus_context.e_sbonus_counter = 0x1e;
            if (e_sbonus_context.e_sbonus_bonus) e_sbonus_context.e_sbonus_bonus--;
        }
    }
}
