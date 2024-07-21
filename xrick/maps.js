"use strict"

const map_context = {
    map_map: new Array(0x2C),
    map_eflg: new Array(0x100),
    map_frow:0,
    map_tilesBank:0,
};

for (let i = 0; i < 0x2C; i++) {
    map_context.map_map[i] = new Array(0x20).fill(0);
}

/*
 * map row definitions, for three zones : hidden top, screen, hidden bottom
 * the three zones compose map_map, which contains the definition of the
 * current portion of the submap.
 */
const MAP_ROW_HTTOP     = 0x00;
const MAP_ROW_HTBOT     = 0x07;
const MAP_ROW_SCRTOP    = 0x08;
const MAP_ROW_SCRBOT    = 0x1F;
const MAP_ROW_HBTOP     = 0x20;
const MAP_ROW_HBBOT     = 0x27;

const MAP_MARK_NACT = 0x80;


/*
 * Fill in map_map with tile numbers by expanding blocks.
 *
 * add map_submaps[].bnum to map_frow to find out where to start from.
 * We need to /4 map_frow to convert from tile rows to block rows, then
 * we need to *8 to convert from block rows to block numbers (there
 * are 8 blocks per block row). This is achieved by *2 then &0xfff8.
 */
function map_expand() {
    let pbnum = map_submaps[game_context.game_submap].bnum
        + ((2 * map_context.map_frow) & 0xfff8);
    let row = 0, col = 0;

    for (let i = 0; i < 0x0b; i++) {  /* 0x0b rows of blocks */
        for (let j = 0; j < 0x08; j++) {  /* 0x08 blocks per row */
            for (let k = 0, l = 0; k < 0x04; k++) {  /* expand one block */
	            map_context.map_map[row][col++] = map_blocks[map_bnums[pbnum]][l++];
	            map_context.map_map[row][col++] = map_blocks[map_bnums[pbnum]][l++];
	            map_context.map_map[row][col++] = map_blocks[map_bnums[pbnum]][l++];
	            map_context.map_map[row][col]   = map_blocks[map_bnums[pbnum]][l++];
	            row += 1; col -= 3;
            }
            row -= 4; col += 4;
            pbnum++;
        }
        row += 4; col = 0;
    }
}

/*
 * Initialize a new submap
 *
 * ASM 0cc3
 */
function map_init() {
    map_context.map_tilesBank = (map_submaps[game_context.game_submap].page == 1) ? 2 : 1;

    map_eflg_expand((map_submaps[game_context.game_submap].page == 1) ? 0x10 : 0x00);
    map_expand();

    ent_reset();
    ent_actvis(map_context.map_frow + MAP_ROW_SCRTOP, map_context.map_frow + MAP_ROW_SCRBOT);
    ent_actvis(map_context.map_frow + MAP_ROW_HTTOP, map_context.map_frow + MAP_ROW_HTBOT);
    ent_actvis(map_context.map_frow + MAP_ROW_HBTOP, map_context.map_frow + MAP_ROW_HBBOT);
}

/*
 * Expand entity flags for this map
 *
 * ASM 1117
 */
function map_eflg_expand(offs)
{
    for (let i = 0, k = 0; i < 0x10; i++) {
        let j = map_eflg_c[offs + i++];
        while (j--) map_context.map_eflg[k++] = map_eflg_c[offs + i];
    }
}

/*
 * Chain (sub)maps
 *
 * ASM 0c08
 * return: TRUE/next submap OK, FALSE/map finished
 */
function map_chain() {
    game_context.game_chsm = 0;

    e_sbonus_context.e_sbonus_counting = false;

    /* find connection */
    let c = map_submaps[game_context.game_submap].connect;
    let t = 3;

    console.log("xrick/maps: chain submap=%#04x frow=%#04x .connect=%#04x %s",
        game_context.game_submap, map_context.map_frow, c,
        (game_context.game_dir == LEFT ? "-> left" : "-> right"));

    /*
     * look for the first connector with compatible row number. if none
     * found, then panic
     */
    for (c = map_submaps[game_context.game_submap].connect; ; c++) {
        if (map_connect[c].dir == 0xff)
            sys_panic("(map_chain) can not find connector\n");
        if (map_connect[c].dir != game_context.game_dir)
            continue;
        t = (ent_ents[1].y >> 3) + map_context.map_frow - map_connect[c].rowout;
        if (t < 3)
             break;
    }

    /* got it */
    console.log("xrick/maps: chain frow=%#04x y=%#06x",
	    map_context.map_frow, ent_ents[1].y);
    console.log("xrick/maps: chain connect=%#04x rowout=%#04x - ",
	    c, map_connect[c].rowout);

    if (map_connect[c].submap == 0xff) {
        /* no next submap - request next map */
        console.log("chain to next map");
        return false;
    }
    else  {
        /* next submap */
        console.log("chain to submap=%#04x rowin=%#04x",
            map_connect[c].submap, map_connect[c].rowin);

        map_context.map_frow = map_context.map_frow - map_connect[c].rowout + map_connect[c].rowin;
        game_context.game_submap = map_connect[c].submap;

        console.log("xrick/maps: chain frow=%#04x",
            map_context.map_frow);
 
        return true;
    }
}

/*
 * Reset all marks, i.e. make them all active again.
 *
 * ASM 0025
 *
 */
function map_resetMarks() {
    // clear the highest bit to activate all entities
    for (let i = 0; i < MAP_NBR_MARKS; i++)
        map_marks[i].ent &= ~MAP_MARK_NACT;
}

