"use strict"

/*
 * Display the pause indicator
 */
function screen_pause(pause) {
    if (pause == true) {
        draw_context.draw_tilesBank = 0;
        draw_context.draw_tllst = screen_pausedtxt;
        draw_context.draw_tllst_index = 0;
        draw_setfb(120, 80);
        draw_tilesList();
    }
    else {
        draw_map();
        ent_draw();
        draw_drawStatus();
    }
}
