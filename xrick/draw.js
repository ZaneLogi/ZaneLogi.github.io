"use strict"

const draw_context = {
    draw_tllst: "\xFE",
    draw_tllst_index: 0,
    fb: 0,
    draw_tilesBank: 0,
};

/*
 * Set the frame buffer pointer
 *
 * x, y: position (pixels, screen)
 */
function draw_setfb(x, y) {
    draw_context.fb = framebuffer.getOffset(x, y);
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

    while (draw_tilesSubList() != 0xFE) {  /* draw sub-list */
        t += ypitch8;  /* go down one tile i.e. 8 lines */
    }

    draw_context.fb = t;
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

    for (let i = 0; i < 8; i++) { /* for all 8 pixel lines */
        let x = tile[i];
        /*
         * tiles / perform the transformation from ST 4 bits
         * per pixel to frame buffer 32 bits per pixels
         */
        let xoff = xoff_start;
        for (let k = 8; k--; x >>= 4) {
            data.set(palette.colors[x & 0x0f], f + xoff);
            xoff -= xbytes;
        }
        f += ypitch;  /* next line */
    }

    draw_context.fb += 8 * xbytes;
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

    draw_setfb(x, y);
    let g = 0;
    for (let i = 0; i < 0x15; i++) { /* rows */
        let f = draw_context.fb;
        for (let j = 0; j < 4; j++) { /* cols */
            let d = sprite[g++];
            let xoff = xoff_start;
            for (let k = 8; k--; d >>= 4) {
	            if (d & 0x0F) {
                    data.set(palette.colors[d & 0x0f], f + xoff);
                }
                xoff -= xbytes;
            }
            f += colbytes;
        }
        draw_context.fb += ypitch;
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
