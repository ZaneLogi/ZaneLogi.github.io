"use strict"

function e_bonus_action(e) {
    const get_seq = function() { return ent_ents[e].c1; };
    const set_seq = function(v) { ent_ents[e].c1 = v; };
    const add_seq = function(v) { ent_ents[e].c1 += v; };

    if (get_seq() == 0) {
        if (e_rick_boxtest(e)) {
            game_context.game_score += 500;

            game.playsound(game.WAV_BONUS, 1);

            map_marks[ent_ents[e].mark].ent |= MAP_MARK_NACT;
            set_seq(1);
            ent_ents[e].sprite = 0xad;
            ent_ents[e].front = true;
            ent_ents[e].y -= 0x08;
        }
    }
    else if (get_seq() > 0 && get_seq() < 10) {
        add_seq(1);
        ent_ents[e].y -= 2;
    }
    else {
        ent_ents[e].n = 0;
    }
}
