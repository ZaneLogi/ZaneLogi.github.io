"use strict"

const e_bomb_context = {
    e_bomb_lethal: false,
    e_bomb_xc: 0,
    e_bomb_yc: 0,

    e_bomb_ticker: 0,
};

const E_BOMB_NO = 3;
const E_BOMB_ENT = ent_ents[E_BOMB_NO];
const E_BOMB_TICKER = 0x2D;

/*
 * Bomb hit test
 *
 * ASM 11CD
 * returns: TRUE/hit, FALSE/not
 */
function e_bomb_hit(e)
{
    if (ent_ents[e].x > (E_BOMB_ENT.x >= 0xE0 ? 0xFF : E_BOMB_ENT.x + 0x20))
        return false;
    if (ent_ents[e].x + ent_ents[e].w < (E_BOMB_ENT.x > 0x04 ? E_BOMB_ENT.x - 0x04 : 0))
        return false;
    if (ent_ents[e].y > (E_BOMB_ENT.y + 0x1D))
        return false;
    if (ent_ents[e].y + ent_ents[e].h < (E_BOMB_ENT.y > 0x0004 ? E_BOMB_ENT.y - 0x0004 : 0))
        return false;
    return true;
}

/*
 * Initialize bomb
 */
function e_bomb_init(x , y) {
    E_BOMB_ENT.n = 0x03;
    E_BOMB_ENT.x = x;
    E_BOMB_ENT.y = y;
    e_bomb_context.e_bomb_ticker = E_BOMB_TICKER;
    e_bomb_context.e_bomb_lethal = false;

    /*
     * Atari ST dynamite sprites are not centered the
     * way IBM PC sprites were ... need to adjust things a little bit
     */
    E_BOMB_ENT.x += 4;
    E_BOMB_ENT.y += 5;
}

/*
 * Entity action
 *
 * ASM 18CA
 */
function e_bomb_action(e) {
    /* tick */
    e_bomb_context.e_bomb_ticker--;

    if (e_bomb_context.e_bomb_ticker == 0) {
        /*
         * end: deactivate
         */
        E_BOMB_ENT.n = 0;
        e_bomb_context.e_bomb_lethal = false;
    }
    else if (e_bomb_context.e_bomb_ticker >= 0x0A) {
        /*
         * ticking
         */
        if ((e_bomb_context.e_bomb_ticker & 0x03) == 0x02)
            game.playsound(game.WAV_BOMBSHHT, 1);

        /* ST bomb sprites sequence is longer */
        if (e_bomb_context.e_bomb_ticker < 40)
            E_BOMB_ENT.sprite = 0x99 + 19 - (e_bomb_context.e_bomb_ticker >> 1);
        else
            E_BOMB_ENT.sprite = (e_bomb_context.e_bomb_ticker & 0x01) ? 0x23 : 0x22;
    }
    else if (e_bomb_context.e_bomb_ticker == 0x09) {
        /*
         * explode
         */
        game.playsound(game.WAV_EXPLODE, 1);

        /* See above: fixing alignment */
        E_BOMB_ENT.x -= 4;
        E_BOMB_ENT.y -= 5;
        E_BOMB_ENT.sprite = 0xa8 + 4 - (e_bomb_context.e_bomb_ticker >> 1);

        e_bomb_context.e_bomb_xc = E_BOMB_ENT.x + 0x0C;
        e_bomb_context.e_bomb_yc = E_BOMB_ENT.y + 0x000A;
        e_bomb_context.e_bomb_lethal = true;
        if (e_bomb_hit(E_RICK_NO))
            e_rick_gozombie();
    }
    else {
        /*
         * exploding
         */
        E_BOMB_ENT.sprite = 0xa8 + 4 - (e_bomb_context.e_bomb_ticker >> 1);

        /* exploding, hence lethal */
        if (e_bomb_hit(E_RICK_NO))
            e_rick_gozombie();
    }
}
