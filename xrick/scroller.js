"use strict"

const scroller_context = {
    period: 0,
    n: 0,
};

const SCROLL_RUNNING = 1;
const SCROLL_DONE = 0;

const SCROLL_PERIOD = 24;

/*
 * Scroll up
 *
 */
function scroll_up() {
    const map_map = map_context.map_map;

    /* last call: restore */
    if (scroller_context.n == 8) {
        scroller_context.n = 0;
        game.update_game_period(scroller_context.period);
        return SCROLL_DONE;
    }

    /* first call: prepare */
    if (scroller_context.n == 0) {
        scroller_context.period = game.game_period;
        game.update_game_period(SCROLL_PERIOD);
    }

    /* translate map */
    for (let i = MAP_ROW_SCRTOP; i < MAP_ROW_HBBOT; i++)
        for (let j = 0x00; j < 0x20; j++)
            map_map[i][j] = map_map[i + 1][j];

    /* translate entities */
    for (let i = 0; ent_ents[i].n != 0xFF; i++) {
        if (ent_ents[i].n) {
            ent_ents[i].ysave -= 8;
            ent_ents[i].trig_y -= 8;
            ent_ents[i].y -= 8;
            if (ent_ents[i].y & 0x8000) {  /* map coord. from 0x0000 to 0x0140 */
                console.log("xrick/scroller: entity %d is gone\n", i);
	            ent_ents[i].n = 0;
            }
        }
    }

    /* display */
    draw_map();
    ent_draw();
    draw_drawStatus();
    map_context.map_frow++;

    /* loop */
    if (scroller_context.n++ == 7) {
        /* activate visible entities */
        ent_actvis(map_context.map_frow + MAP_ROW_HBTOP, map_context.map_frow + MAP_ROW_HBBOT);

        /* prepare map */
        map_expand();

        /* display */
        draw_map();
        ent_draw();
        draw_drawStatus();
    }

    return SCROLL_RUNNING;
}

/*
 * Scroll down
 *
 */
function scroll_down() {
    const map_map = map_context.map_map;

    /* last call: restore */
    if (scroller_context.n == 8) {
        scroller_context.n = 0;
        game.update_game_period(scroller_context.period);
        return SCROLL_DONE;
    }

    /* first call: prepare */
    if (scroller_context.n == 0) {
        scroller_context.period = game.game_period;
        game.update_game_period(SCROLL_PERIOD);
    }

    /* translate map */
    for (let i = MAP_ROW_SCRBOT; i > MAP_ROW_HTTOP; i--)
        for (let j = 0x00; j < 0x20; j++)
            map_map[i][j] = map_map[i - 1][j];

    /* translate entities */
    for (let i = 0; ent_ents[i].n != 0xFF; i++) {
        if (ent_ents[i].n) {
            ent_ents[i].ysave += 8;
            ent_ents[i].trig_y += 8;
            ent_ents[i].y += 8;
            if (ent_ents[i].y > 0x0140) {  /* map coord. from 0x0000 to 0x0140 */
                console.log("xrick/scroller: entity %d is gone\n", i);
                ent_ents[i].n = 0;
            }
        }
    }

    /* display */
    draw_map();
    ent_draw();
    draw_drawStatus();
    map_context.map_frow--;

    /* loop */
    if (scroller_context.n++ == 7) {
        /* activate visible entities */
        ent_actvis(map_context.map_frow + MAP_ROW_HTTOP, map_context.map_frow + MAP_ROW_HTBOT);

        /* prepare map */
        map_expand();

        /* display */
        draw_map();
        ent_draw();
        draw_drawStatus();
    }

    return SCROLL_RUNNING;
}
