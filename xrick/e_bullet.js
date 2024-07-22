"use strict"

const e_bullet_context = {
    e_bullet_offsx: 0,
    e_bullet_xc: 0,
    e_bullet_yc: 0,
};

const E_BULLET_NO = 2;
const E_BULLET_ENT = ent_ents[E_BULLET_NO];

/*
 * Initialize bullet
 */
function e_bullet_init(x, y) {
    E_BULLET_ENT.n = 0x02;
    E_BULLET_ENT.x = x;
    E_BULLET_ENT.y = y + 0x0006;
    if (game_context.game_dir == LEFT) {
        e_bullet_context.e_bullet_offsx = -0x08;
        E_BULLET_ENT.sprite = 0x21;
    }
    else {
        e_bullet_context.e_bullet_offsx = 0x08;
        E_BULLET_ENT.sprite = 0x20;
    }

    // syssnd_play(WAV_BULLET, 1);
}

/*
 * Entity action
 *
 * ASM 1883, 0F97
 */
function e_bullet_action(e) {
    /* move bullet */
    E_BULLET_ENT.x += e_bullet_context.e_bullet_offsx;

    if (E_BULLET_ENT.x <= -0x10 || E_BULLET_ENT.x > 0xe8) {
        /* out: deactivate */
        E_BULLET_ENT.n = 0;
    }
    else {
        const map_eflg = map_context.map_eflg;
        const map_map = map_context.map_map;

        /* update bullet center coordinates */
        e_bullet_context.e_bullet_xc = E_BULLET_ENT.x + 0x0c;
        e_bullet_context.e_bullet_yc = E_BULLET_ENT.y + 0x05;
        if (map_eflg[map_map[e_bullet_context.e_bullet_yc >> 3][e_bullet_context.e_bullet_xc >> 3]]
            & MAP_EFLG_SOLID) {
            /* hit something: deactivate */
            E_BULLET_ENT.n = 0;
        }
    }
}
