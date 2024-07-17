"use strict"

let framebuffer = new function() {
    this.init = function(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.xbytes = 4;
        this.ypitch = this.xbytes * this.width;
        this.imgData = this.ctx.createImageData(canvas.width, canvas.height);

        this.clear();
    }

    this.clear = function(c) {
        const black = [0, 0, 0, 0xff];
        c = c || black;
        for (let i = 0; i < this.width * this.height * 4; i += 4) {
            this.imgData.data.set(c, i);
        }
    }

    this.updateCanvas = function() {
        this.ctx.putImageData(this.imgData, 0, 0);
    }
}

function drawPalette(x, y) {
    const data = framebuffer.imgData.data;
    const rectWidth = 16;
    const rectHeight = 16;
    const ypitch = framebuffer.ypitch;
    const xbytes = framebuffer.xbytes;

    for (let i = 0; i < 32; i++) {
        let offset = (y + Math.floor(i/16) * rectHeight) * ypitch + (x + (i%16) * rectWidth) * xbytes;
        for (let h = 0; h < rectHeight; h++) {
            for(let xoff = 0; xoff < 64; xoff += xbytes) {
                data.set(palette.colors[i], offset + xoff);
            }
            offset += ypitch;
        }
    }
}

let fb = 0; /* frame buffer pointer */

function draw_setfb(x, y)
{
    fb = y * framebuffer.ypitch + x * framebuffer.xbytes;
}

const tileWidth = 8;
const tileHeight = 8;
let draw_tilesBank = 0;
let draw_tllst = "";    /* pointer to tiles list */
let draw_tllst_index = 0;

function draw_tilesList() {
    let t = fb;

    while (draw_tilesSubList() != 0xFE) { /* draw sub-list */
        t += tileHeight * ypitch;  /* go down one tile i.e. 8 lines */
        fb = t;
    }
}

function draw_tilesListImm(list) {
    console.log(list);

    draw_tllst = list;
    draw_tllst_index = 0;
    draw_tilesList();
}

function draw_tilesSubList() {
    while (draw_tllst_index < draw_tllst.length) {
        let i = draw_tllst.charCodeAt(draw_tllst_index++);
        if (i == 0xFF || i == 0xFE)
            return i;

        draw_tile(i);
    }
    return 0xFE; // something wrong
}

function draw_tile(tileNumber) {
    const data = framebuffer.imgData.data;
    const tile = tiles_data[draw_tilesBank][tileNumber];
    let f = fb;
    const xbytes = framebuffer.xbytes;
    const ypitch = framebuffer.ypitch;
    const xtileBytes = tileWidth * xbytes;
    const xoff_start = xtileBytes - xbytes;

    for (let i = 0; i < tileHeight; i++) { /* for all 8 pixel lines */
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

    fb += tileWidth * xbytes;
}

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
        let f = fb;
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
        fb += ypitch;
    }
}
  
function main() {
    const canvas = document.querySelector('canvas');

    framebuffer.init(canvas);
    
    /*
    drawPalette(0, 0);

    draw_setfb(0, 64);
    for (let i = 0; i < 8; i++) {
        draw_tile(i);
    }

    framebuffer.updateCanvas();
    */

    devtools.run();
}

window.addEventListener("load", main);
