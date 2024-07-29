"use strict"

const draw_context = {
    draw_tllst: "\xFE",
    draw_tllst_index: 0,
    fb: 0,
    fb8: 0,
    draw_tilesBank: 0,
};

/* map coordinates of the screen */
const DRAW_XYMAP_SCRLEFT    = -0x0020;
const DRAW_XYMAP_SCRTOP     = 0x0040;
/* map coordinates of the top of the hidden bottom of the map */
const DRAW_XYMAP_HBTOP      = 0x0100;

const DRAW_STATUS_BULLETS_X = 0x68;
const DRAW_STATUS_BOMBS_X   = 0xA8;
const DRAW_STATUS_SCORE_X   = 0x20;
const DRAW_STATUS_LIVES_X   = 0xF0;
const DRAW_STATUS_Y         = 0;

const TILES_BULLET          = 0x01;
const TILES_BOMB            = 0x02;
const TILES_RICK            = 0x03;

/*
 * Set the frame buffer pointer
 *
 * x, y: position (pixels, screen)
 */
function draw_setfb(x, y) {
    draw_context.fb = framebuffer.getOffset(x, y);
    draw_context.fb8 = framebuffer.u8buf_offsets[y] + x;
}

/*
 * Clip to map screen
 *
 * x, y: position (pixels, map) CHANGED clipped
 * width, height: dimension CHANGED clipped
 * return: TRUE if fully clipped, FALSE if still (at least partly) visible
 */
function draw_clipms(rect) {
    if (rect.x < 0) {
        if (rect.x + rect.width < 0)
            return true;
        else {
            rect.width += rect.x;
            rect.x = 0;
        }
    }
    else {
        if (rect.x > 0x0100)
            return true;
        else if (rect.x + rect.width > 0x0100) {
            rect.width = 0x0100 - rect.x;
        }
    }

    if (rect.y < DRAW_XYMAP_SCRTOP) {
        if ((rect.y + rect.height) < DRAW_XYMAP_SCRTOP)
            return true;
        else {
            rect.height += rect.y - DRAW_XYMAP_SCRTOP;
            rect.y = DRAW_XYMAP_SCRTOP;
        }
    }
    else {
        if (rect.y >= DRAW_XYMAP_HBTOP)
            return true;
        else if (rect.y + rect.height > DRAW_XYMAP_HBTOP)
            rect.height = DRAW_XYMAP_HBTOP - rect.y;
    }

    return false;
}

/*
 * Draw a list of tiles onto the frame buffer
 * start at position indicated by fb ; at the end of each (sub)list,
 * perform a "carriage return + line feed" i.e. go back to the initial
 * position then go down one tile row (8 pixels)
 *
 * ASM 1e33
 * fb: CHANGED (see above)
 * draw_tllst: CHANGED points to the element following 0xfe/0xff end code
 */
function draw_tilesList() {
    const ypitch8 = framebuffer.ypitch * 8;
    let t = draw_context.fb;

    const yp8 = framebuffer.width * 8;
    let t8 = draw_context.fb8;

    while (draw_tilesSubList() != 0xFE) {  /* draw sub-list */
        t += ypitch8;  /* go down one tile i.e. 8 lines */
        draw_context.fb = t;

        t8 += yp8;
        draw_context.fb8 = t8;
    }
}

/*
 * Draw a list of tiles onto the frame buffer -- same as draw_tilesList,
 * but accept an immediate string as parameter. Note that the string needs
 * to be properly terminated with 0xfe (\376) and 0xff (\377) chars.
 */
function draw_tilesListImm(list) {
    draw_context.draw_tllst = list;
    draw_context.draw_tllst_index = 0;
    draw_tilesList();
}

/*
 * Draw a sub-list of tiles onto the frame buffer
 * start at position indicated by fb ; leave fb pointing to the next
 * tile to the right of the last tile drawn
 *
 * ASM 1e41
 * fpb: CHANGED (see above)
 * draw_tllst: CHANGED points to the element following 0xfe/0xff end code
 * returns: end code (0xfe : end of list ; 0xff : end of sub-list)
 */
function draw_tilesSubList() {
    const draw_tllst = draw_context.draw_tllst;
    while (draw_context.draw_tllst_index < draw_tllst.length) {
        let i = draw_tllst.charCodeAt(draw_context.draw_tllst_index++);
        if (i == 0xFF || i == 0xFE)
            return i;

        draw_tile(i);
    }
    return 0xFE; // something wrong
}

/*
 * Draw a tile
 * at position indicated by fb ; leave fb pointing to the next tile
 * to the right of the tile drawn
 *
 * ASM 1e6c
 * tlnbr: tile number
 * draw_filter: CGA colors filter
 * fb: CHANGED (see above)
 */
function draw_tile(tileNumber) {
    const data = framebuffer.imgData.data;
    const tile = tiles_data[draw_context.draw_tilesBank][tileNumber];
    let f = draw_context.fb;
    const xbytes = framebuffer.xbytes;
    const ypitch = framebuffer.ypitch;
    const xtileBytes = 8 * xbytes;
    const xoff_start = xtileBytes - xbytes;

    const data8 = framebuffer.u8buf;
    let f8 = draw_context.fb8;
    const yp8 = framebuffer.width;

    for (let i = 0; i < 8; i++) { /* for all 8 pixel lines */
        let x = tile[i];
        /*
         * tiles / perform the transformation from ST 4 bits
         * per pixel to frame buffer 32 bits per pixels
         */
        let xoff = xoff_start;
        let xoff8 = 7;
        for (let k = 8; k--; x >>= 4) {
            const c = x & 0x0f;
            data.set(palette.colors[c], f + xoff);
            xoff -= xbytes;

            data8[f8 + xoff8] = c;
            xoff8--;
        }
        f += ypitch;  /* next line */
        f8 += yp8;
    }

    draw_context.fb += 8 * xbytes;
    draw_context.fb8 += 8;
}

/*
 * Draw a sprite
 *
 * ASM 1a09
 * nbr: sprite number
 * x, y: sprite position (pixels, screen)
 * fb: CHANGED
 */
function draw_sprite(number, x, y)
{
    const data = framebuffer.imgData.data;
    const sprite = sprites_data[number];
    const xbytes = framebuffer.xbytes;
    const ypitch = framebuffer.ypitch;
    const colbytes = 8 * xbytes;
    const xoff_start = colbytes - xbytes;

    const data8 = framebuffer.u8buf;
    const yp8 = framebuffer.width;

    draw_setfb(x, y);
    let g = 0;
    for (let i = 0; i < 0x15; i++) { /* rows */
        let f = draw_context.fb;
        let f8 = draw_context.fb8;
        for (let j = 0; j < 4; j++) { /* cols */
            let d = sprite[g++];
            let xoff = xoff_start;
            let xoff8 = 7;
            for (let k = 8; k--; d >>= 4) {
                const color = d & 0x0F;
	            if (color) {
                    data.set(palette.colors[color], f + xoff);
                    data8[f8 + xoff8] = color;
                }
                xoff -= xbytes;
                xoff8--;
            }
            f += colbytes;
            f8 += 8;
        }
        draw_context.fb += ypitch;
        draw_context.fb8 += yp8;
    }
}

/*
 * Draw a sprite
 *
 * NOTE re-using original ST graphics format
 */
function draw_sprite2(number, x, y, front) {
    const data = framebuffer.imgData.data;
    const ypitch = framebuffer.ypitch;
    const xbytes = framebuffer.xbytes;

    const data8 = framebuffer.u8buf;
    const yp8 = framebuffer.width;

    let rect = { x: x, y: y, width: 0x20, height: 0x15 };
    if (draw_clipms(rect))  /* return if not visible */
        return;

    let x0 = rect.x;
    let y0 = rect.y;
    let w = rect.width;
    let h = rect.height;
    let g = 0;
    draw_setfb(x0 - DRAW_XYMAP_SCRLEFT, y0 - DRAW_XYMAP_SCRTOP + 8);

    for (let r = 0; r < 0x15; r++) {
        if (r >= h || y + r < y0) continue;

        let i = 0x1f * xbytes;
        let i8 = 31;
        let im = x - (x & 0xfff8);
        let flg = map_context.map_eflg[
            map_context.map_map[(y + r) >> 3][(x + 0x1f)>> 3]];

        let LOOP = function(N, C0, C1) {
            let d = sprites_data[number][g + N];
            for (let c = C0; c >= C1; c--, i-=xbytes, i8--, d >>= 4, im--) {
                if (im == 0) {
                    flg = map_context.map_eflg[
                        map_context.map_map[(y + r) >> 3][(x + c) >> 3]];
                    im = 8;
                }
                if (c >= w || x + c < x0) continue;
                if (!front && !game_context.game_cheat3 && (flg & MAP_EFLG_FGND))
                    continue;

                const colorIndex = d & 0x0F;
                if (colorIndex) {
                    data.set(palette.colors[colorIndex], draw_context.fb + i);
                    data8[draw_context.fb8+i8] = colorIndex;
                }
                if (game_context.game_cheat3) {
                    const new_color = data8[draw_context.fb8+i8] | 0x10;
                    data.set(palette.colors[new_color], draw_context.fb + i);
                }
            }
        };

        LOOP(3, 0x1f, 0x18);
        LOOP(2, 0x17, 0x10);
        LOOP(1, 0x0f, 0x08);
        LOOP(0, 0x07, 0x00);

        draw_context.fb += ypitch;
        draw_context.fb8 += yp8;
        g += 4;
    }
}

/*
 * Redraw the map behind a sprite
 * align to tile column and row, and clip
 *
 * x, y: sprite position (pixels, map).
 */
function draw_spriteBackground(x, y) {
    /* aligne to column and row, prepare map coordinate, and clip */
    let xmap = x & 0xFFF8;
    let ymap = y & 0xFFF8;
    let cmax = (x - xmap == 0 ? 0x20 : 0x28);  /* width, 4 tl cols, 8 pix each */
    let rmax = (y & 0x04) ? 0x20 : 0x18;  /* height, 3 or 4 tile rows */
    let rect = { x:xmap, y:ymap, width:cmax, height:rmax };
    if (draw_clipms(rect))  /* don't draw if fully clipped */
        return;
    xmap = rect.x;
    ymap = rect.y;
    cmax = rect.width;
    rmax = rect.height;

    /* get back to screen */
    let xs = xmap - DRAW_XYMAP_SCRLEFT;
    let ys = ymap - DRAW_XYMAP_SCRTOP;
    xmap >>= 3;
    ymap >>= 3;
    cmax >>= 3;
    rmax >>= 3;

    /* draw */
    for (let r = 0; r < rmax; r++) {  /* for each row */
        draw_setfb(xs, 8 + ys + r * 8);
        for (let c = 0; c < cmax; c++) {  /* for each column */
            draw_tile(map_context.map_map[ymap + r][xmap + c]);
        }
    }
}

/*
 * Draw entire map screen background tiles onto frame buffer.
 *
 * ASM 0af5, 0a54
 */
function draw_map()
{
    draw_context.draw_tilesBank = map_context.map_tilesBank;

    for (let i = 0; i < 0x18; i++) {  /* 0x18 rows */
        draw_setfb(0x20, 8 + (i * 8));
        for (let j = 0; j < 0x20; j++)  /* 0x20 tiles per row */
            draw_tile(map_context.map_map[i + 8][j]);
  }
}

/*
 * Draw status indicators
 *
 * ASM 0309
 */
function draw_drawStatus()
{
    const s = [0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0xfe];

    draw_context.draw_tilesBank = 0;

    for (let i = 5, sv = game_context.game_score; i >= 0; i--) {
        s[i] = 0x30 + (sv % 10);
        sv = Math.floor(sv/10);
    }
    draw_context.draw_tllst = String.fromCharCode(...s);
    draw_context.draw_tllst_index = 0;

    draw_setfb(DRAW_STATUS_SCORE_X, DRAW_STATUS_Y);
    draw_tilesList();

    draw_setfb(DRAW_STATUS_BULLETS_X, DRAW_STATUS_Y);
    for (let i = 0; i < game_context.game_bullets; i++)
        draw_tile(TILES_BULLET);

    draw_setfb(DRAW_STATUS_BOMBS_X, DRAW_STATUS_Y);
    for (let i = 0; i < game_context.game_bombs; i++)
        draw_tile(TILES_BOMB);

    draw_setfb(DRAW_STATUS_LIVES_X, DRAW_STATUS_Y);
    for (let i = 0; i < game_context.game_lives; i++)
        draw_tile(TILES_RICK);
}

/*
 * Draw info indicators
 */
function draw_infos()
{
    draw_context.draw_tilesBank = 0;

    draw_setfb(0x00, DRAW_STATUS_Y);
    draw_tile(game_context.game_cheat1 ? 'T'.charCodeAt(0) : '@'.charCodeAt(0));
    draw_setfb(0x08, DRAW_STATUS_Y);
    draw_tile(game_context.game_cheat2 ? 'N'.charCodeAt(0) : '@'.charCodeAt(0));
    draw_setfb(0x10, DRAW_STATUS_Y);
    draw_tile(game_context.game_cheat3 ? 'V'.charCodeAt(0) : '@'.charCodeAt(0));
}

/*
 * Clear status indicators
 */
function draw_clearStatus()
{
    draw_context.draw_tilesBank = 0;
    draw_setfb(DRAW_STATUS_SCORE_X, DRAW_STATUS_Y);
    for (let i = 0; i < DRAW_STATUS_LIVES_X/8 + 6 - DRAW_STATUS_SCORE_X/8; i++) {
        draw_tile('@'.charCodeAt(0));
    }
}

/*
 * Draw a picture
 */
function draw_pic(x, y, w, h, pic) {
    const data = framebuffer.imgData.data;
    const xbytes = framebuffer.xbytes;
    const ypitch = framebuffer.ypitch;
    const colbytes = 8 * xbytes;
    const xoff_start = colbytes - xbytes;

    draw_setfb(x, y);
    let pp = 0;

    for (let i = 0; i < h; i++) { /* rows */
        let f = draw_context.fb;
        for (let j = 0; j < w; j += 8) {  /* cols */
            let v = pic[pp++];
            for (let k = 8, xoff = xoff_start; k--; v >>=4, xoff -= xbytes) {
                data.set(palette.colors[v & 0x0f], f + xoff);
            }
            f += colbytes;
        }
        draw_context.fb += ypitch;
    }
}

/*
 * Draw a bitmap
 */
function draw_img(img) {
    // NOTE: assume the image size is the same as the framebuffer size
    const w = img.width;
    const h = img.height;
    const colors = img.colors;
    const pixels = img.pixels;

    draw_setfb(0, 0);

    const fb = framebuffer.imgData.data;
    const xbytes = framebuffer.xbytes;

    let fb_offset = 0;
    let p_offset = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            fb.set(colors[pixels[p_offset]], fb_offset);
            fb_offset += xbytes;
            p_offset++;
        }
    }
}
