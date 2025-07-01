"use strict"

const TILE_WIDTH = 8;
const TILE_HEIGHT = 8;
const SPRITE_WIDTH = 16;
const SPRITE_HEIGHT = 16;
const DISPLAY_TILES_X = 28;
const DISPLAY_TILES_Y = 36;
const DISPLAY_PIXELS_X = DISPLAY_TILES_X * TILE_WIDTH;
const DISPLAY_PIXELS_Y = DISPLAY_TILES_Y * TILE_HEIGHT;

const NUM_SPRITES = 8;

const NUM_LIVES            = 3;
const NUM_STATUS_FRUITS    = 7;    // max number of displayed fruits at bottom right
const NUM_DOTS             = 244;  // 240 small dots + 4 pills
const NUM_PILLS            = 4;    // number of energizer pills on playfield
const ANTEPORTAS_X         = 14*TILE_WIDTH;  // pixel position of the ghost house enter/leave point
const ANTEPORTAS_Y         = 14*TILE_HEIGHT + Math.floor(TILE_HEIGHT/2);

const GHOST_EATEN_FREEZE_TICKS = 60; // number of ticks the game freezes after Pacman eats a ghost
const PACMAN_EATEN_TICKS   = 60;     // number of ticks to freeze game when Pacman is eaten
const PACMAN_DEATH_TICKS   = 150;    // number of ticks to show the Pacman death sequence before starting new round
const GAMEOVER_TICKS       = 3*60;   // number of ticks the game over message is shown
const ROUNDWON_TICKS       = 4*60;   // number of ticks to wait after a round was won
const FRUITACTIVE_TICKS    = 10*60;  // number of ticks a bonus fruit is shown

const TILE_SPACE          = 0x40;
const TILE_DOT            = 0x10;
const TILE_PILL           = 0x14;
const TILE_GHOST          = 0xB0;
const TILE_LIFE           = 0x20; // 0x20..0x23
const TILE_CHERRIES       = 0x90; // 0x90..0x93
const TILE_STRAWBERRY     = 0x94; // 0x94..0x97
const TILE_PEACH          = 0x98; // 0x98..0x9B
const TILE_BELL           = 0x9C; // 0x9C..0x9F
const TILE_APPLE          = 0xA0; // 0xA0..0xA3
const TILE_GRAPES         = 0xA4; // 0xA4..0xA7
const TILE_GALAXIAN       = 0xA8; // 0xA8..0xAB
const TILE_KEY            = 0xAC; // 0xAC..0xAF
const TILE_DOOR           = 0xCF; // the ghost-house door

const SPRITETILE_INVISIBLE    = 30;
const SPRITETILE_SCORE_200    = 40;
const SPRITETILE_SCORE_400    = 41;
const SPRITETILE_SCORE_800    = 42;
const SPRITETILE_SCORE_1600   = 43;
const SPRITETILE_CHERRIES     = 0;
const SPRITETILE_STRAWBERRY   = 1;
const SPRITETILE_PEACH        = 2;
const SPRITETILE_BELL         = 3;
const SPRITETILE_APPLE        = 4;
const SPRITETILE_GRAPES       = 5;
const SPRITETILE_GALAXIAN     = 6;
const SPRITETILE_KEY          = 7;
const SPRITETILE_PACMAN_CLOSED_MOUTH = 48;

const COLOR_BLANK         = 0x00;
const COLOR_DEFAULT       = 0x0F;
const COLOR_DOT           = 0x10;
const COLOR_PACMAN        = 0x09;
const COLOR_BLINKY        = 0x01;
const COLOR_PINKY         = 0x03;
const COLOR_INKY          = 0x05;
const COLOR_CLYDE         = 0x07;
const COLOR_FRIGHTENED    = 0x11;
const COLOR_FRIGHTENED_BLINKING = 0x12;
const COLOR_GHOST_SCORE   = 0x18;
const COLOR_EYES          = 0x19;
const COLOR_CHERRIES      = 0x14;
const COLOR_STRAWBERRY    = 0x0F;
const COLOR_PEACH         = 0x15;
const COLOR_BELL          = 0x16;
const COLOR_APPLE         = 0x14;
const COLOR_GRAPES        = 0x17;
const COLOR_GALAXIAN      = 0x09;
const COLOR_KEY           = 0x16;
const COLOR_WHITE_BORDER  = 0x1F;
const COLOR_FRUIT_SCORE   = 0x03;

const gfx = {
    // the 36x28 tile framebuffer
    video_ram: Array.from(Array(DISPLAY_TILES_Y), () => new Array(DISPLAY_TILES_X)), // tile codes
    color_ram: Array.from(Array(DISPLAY_TILES_Y), () => new Array(DISPLAY_TILES_X)), // color codes

    sprite: Array.from(Array(NUM_SPRITES), () => ({enabled:false})),

    hwColors: undefined, // the decoded hardware colors
    palettes: undefined, // the decoded color palettes
    tiles: undefined, // the decoded tile data
    sprites: undefined, // the decoded sprite data
}

gfx.init = function() {
    this.spr_clear();
    this.decodeRomData();
}

gfx.decodeRomData = function() {
    // total 32 HW colors
    this.hwColors = decodeRomHwColors(hwcolors_data);
    // total 64 color palettes
    this.palettes = decodeRomPalette(palette_data, this.hwColors);
    // total 256 tiles
    this.tiles = decodeRomTile(tile_data);
    // total 64 sprites
    this.sprites = decodeRomSprite(sprite_data);
}

// disable and clear all sprites
gfx.spr_clear = function() {
    for (const spr of this.sprite) {
        spr.enabled = false;
    }
}

// clear tile and color buffer
gfx.vid_clear = function(tile_code, color_code) {
    for (const arr of this.video_ram) { arr.fill(tile_code); }
    for (const arr of this.color_ram) { arr.fill(color_code); }
}

// clear the playfield's rectangle in the color buffer
gfx.vid_color_playfield = function(color_code) {
    for (let y = 3; y < DISPLAY_TILES_Y-2; y++) {
        for (let x = 0; x < DISPLAY_TILES_X; x++) {
            this.color_ram[y][x] = color_code;
        }
    }
}

// check if a tile position is valid
gfx.valid_tile_pos = function(tile_pos) {
    return ((tile_pos.x >= 0) && (tile_pos.x < DISPLAY_TILES_X)
        && (tile_pos.y >= 0) && (tile_pos.y < DISPLAY_TILES_Y));
}

// put a color into the color buffer
gfx.vid_color = function(tile_pos, color_code) {
    console.assert(this.valid_tile_pos(tile_pos));
    this.color_ram[tile_pos.y][tile_pos.x] = color_code;
}

// put a tile into the tile buffer
gfx.vid_tile = function(tile_pos, tile_code) {
    console.assert(this.valid_tile_pos(tile_pos));
    this.video_ram[tile_pos.y][tile_pos.x] = tile_code;
}

// put a colored tile into the tile and color buffers
gfx.vid_color_tile = function(tile_pos, color_code, tile_code) {
    console.assert(this.valid_tile_pos(tile_pos));
    this.video_ram[tile_pos.y][tile_pos.x] = tile_code;
    this.color_ram[tile_pos.y][tile_pos.x] = color_code;
}

// translate ASCII char into "NAMCO char"
gfx.conv_char = function(c) {
    let ret;
    switch (c) {
    case ' ':   ret = 0x40; break;
    case '/':   ret = 58; break;
    case '-':   ret = 59; break;
    case '\"':  ret = 38; break;
    case '!':   ret = 'Z'.charCodeAt(0)+1; break;
    default: ret = c.charCodeAt(0); break;
    }
    return ret;
}

// put colored char into tile+color buffers
gfx.vid_color_char = function(tile_pos, color_code, chr) {
    console.assert(this.valid_tile_pos(tile_pos));
    this.video_ram[tile_pos.y][tile_pos.x] = this.conv_char(chr);
    this.color_ram[tile_pos.y][tile_pos.x] = color_code;
}

// put char into tile buffer
gfx.vid_char = function(tile_pos, chr) {
    console.assert(this.valid_tile_pos(tile_pos));
    this.video_ram[tile_pos.y][tile_pos.x] = this.conv_char(chr);
}

// put colored text into the tile+color buffers
gfx.vid_color_text = function(tile_pos, color_code, text) {
    console.assert(this.valid_tile_pos(tile_pos));
    for (const chr of text) {
        if (tile_pos.x < DISPLAY_TILES_X) {
            this.vid_color_char(tile_pos, color_code, chr);
            tile_pos.x++;
        }
        else {
            break;
        }
    }
}

// put text into the tile buffer
gfx.vid_text = function(tile_pos, text) {
    console.assert(this.valid_tile_pos(tile_pos));
    for (const chr of text) {
        if (tile_pos.x < DISPLAY_TILES_X) {
            this.vid_char(tile_pos, chr);
            tile_pos.x++;
        }
        else {
            break;
        }
    }
}

/* print colored score number into tile+color buffers from right to left(!),
    scores are /10, the last printed number is always 0,
    a zero-score will print as '00' (this is the same as on
    the Pacman arcade machine)
*/
gfx.vid_color_score = function(tile_pos, color_code, score) {
    this.vid_color_char(tile_pos, color_code, '0');
    tile_pos.x--;
    for (let digit = 0; digit < 8; digit++) {
        const chr = String.fromCharCode((score % 10) + '0'.charCodeAt(0));
        if (this.valid_tile_pos(tile_pos)) {
            this.vid_color_char(tile_pos, color_code, chr);
            tile_pos.x--;
            score = Math.floor(score / 10);
            if (0 == score) {
                break;
            }
        }
    }
}

/* draw a colored tile-quad arranged as:
    |t+1|t+0|
    |t+3|t+2|

   This is (for instance) used to render the current "lives" and fruit
   symbols at the lower border.
*/
gfx.vid_draw_tile_quad = function(tile_pos, color_code, tile_code) {
    for (let yy = 0; yy < 2; yy++) {
        for (let xx = 0; xx < 2; xx++) {
            const t = tile_code + yy * 2 + (1 - xx);
            this.vid_color_tile(i2(xx + tile_pos.x, yy + tile_pos.y), color_code, t);
        }
    }
}

// draw the fruit bonus score tiles (when Pacman has eaten the bonus fruit)
gfx.vid_fruit_score = function(fruit_type) {
    console.assert((fruit_type >= 0) && (fruit_type < FRUIT.NUM_FRUITS));
    const color_code = (fruit_type == FRUIT.NONE) ? COLOR_DOT : COLOR_FRUIT_SCORE;
    for (let i = 0; i < 4; i++) {
        this.vid_color_tile(i2(12+i, 20), color_code, fruit_score_tiles[fruit_type][i]);
    }
}

// initialize the playfield tiles
gfx.game_init_playfield = function() {
    this.vid_color_playfield(COLOR_DOT);
    // decode the playfield from an ASCII map into tiles codes
    const tiles =
       //0123456789012345678901234567
        "0UUUUUUUUUUUU45UUUUUUUUUUUU1" + // 3
        "L............rl............R" + // 4
        "L.ebbf.ebbbf.rl.ebbbf.ebbf.R" + // 5
        "LPr  l.r   l.rl.r   l.r  lPR" + // 6
        "L.guuh.guuuh.gh.guuuh.guuh.R" + // 7
        "L..........................R" + // 8
        "L.ebbf.ef.ebbbbbbf.ef.ebbf.R" + // 9
        "L.guuh.rl.guuyxuuh.rl.guuh.R" + // 10
        "L......rl....rl....rl......R" + // 11
        "2BBBBf.rzbbf rl ebbwl.eBBBB3" + // 12
        "     L.rxuuh gh guuyl.R     " + // 13
        "     L.rl          rl.R     " + // 14
        "     L.rl mjs--tjn rl.R     " + // 15
        "UUUUUh.gh i      q gh.gUUUUU" + // 16
        "      .   i      q   .      " + // 17
        "BBBBBf.ef i      q ef.eBBBBB" + // 18
        "     L.rl okkkkkkp rl.R     " + // 19
        "     L.rl          rl.R     " + // 20
        "     L.rl ebbbbbbf rl.R     " + // 21
        "0UUUUh.gh guuyxuuh gh.gUUUU1" + // 22
        "L............rl............R" + // 23
        "L.ebbf.ebbbf.rl.ebbbf.ebbf.R" + // 24
        "L.guyl.guuuh.gh.guuuh.rxuh.R" + // 25
        "LP..rl.......  .......rl..PR" + // 26
        "6bf.rl.ef.ebbbbbbf.ef.rl.eb8" + // 27
        "7uh.gh.rl.guuyxuuh.rl.gh.gu9" + // 28
        "L......rl....rl....rl......R" + // 29
        "L.ebbbbwzbbf.rl.ebbwzbbbbf.R" + // 30
        "L.guuuuuuuuh.gh.guuuuuuuuh.R" + // 31
        "L..........................R" + // 32
        "2BBBBBBBBBBBBBBBBBBBBBBBBBB3";  // 33
       //0123456789012345678901234567
    
    const t = {};
    for (let i = 0; i < 128; i++) { t[String.fromCharCode(i)] = TILE_DOT; }
    t[' ']=0x40; t['0']=0xD1; t['1']=0xD0; t['2']=0xD5; t['3']=0xD4; t['4']=0xFB;
    t['5']=0xFA; t['6']=0xD7; t['7']=0xD9; t['8']=0xD6; t['9']=0xD8; t['U']=0xDB;
    t['L']=0xD3; t['R']=0xD2; t['B']=0xDC; t['b']=0xDF; t['e']=0xE7; t['f']=0xE6;
    t['g']=0xEB; t['h']=0xEA; t['l']=0xE8; t['r']=0xE9; t['u']=0xE5; t['w']=0xF5;
    t['x']=0xF2; t['y']=0xF3; t['z']=0xF4; t['m']=0xED; t['n']=0xEC; t['o']=0xEF;
    t['p']=0xEE; t['j']=0xDD; t['i']=0xD2; t['k']=0xDB; t['q']=0xD3; t['s']=0xF1;
    t['t']=0xF0; t['-']=TILE_DOOR; t['P']=TILE_PILL;

    for (let y = 3, i = 0; y <= 33; y++) {
        for (let x = 0; x < 28; x++, i++) {
            this.video_ram[y][x] = t[tiles[i]];
        }
    }
    // ghost house gate colors
    this.vid_color({x:13, y:15}, 0x18);
    this.vid_color({x:14, y:15}, 0x18);
}

gfx.draw_playfield = function(canvas_ctx) {
    for (let ty = 0, ypos = 0; ty < DISPLAY_TILES_Y; ty++, ypos += 8) {
        for (let tx = 0, xpos = 0; tx < DISPLAY_TILES_X; tx++, xpos += 8) {
            const tile_code = gfx.video_ram[ty][tx];
            const color_code = gfx.color_ram[ty][tx];

            const image = imageCache.getTileImage(tile_code, color_code);
            canvas_ctx.drawImage(image, xpos, ypos);
        }
    }
}

gfx.draw_sprite = function(canvas_ctx, spr) {
    const image = imageCache.getSpriteImage(spr.tile, spr.color);

    let sx = 1, sy = 1;
    let tx = 0, ty = 0;
    let px = spr.pos.x, py = spr.pos.y;

    if (spr.flipx) {
        // flip image horizontally
        sx = -1;
        tx = -SPRITE_WIDTH;
        px = -px;
    }

    if (spr.flipy) {
        // flip image vertically
        sy = -1,
        ty = -SPRITE_HEIGHT;
        py = -py;
    }

    canvas_ctx.save();
    canvas_ctx.scale(sx, sy);
    canvas_ctx.translate(tx, ty);
    canvas_ctx.drawImage(image, px, py);
    canvas_ctx.restore();
}


const imageCache = {};

imageCache.createOffscreenCanvas = function(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

imageCache.getTileImage = function(tileCode, colorCode) {
    const key = `#${tileCode}-${colorCode}`;
    if (this[key]) {
        //console.log(`Cache hit for tile ${tileCode} with color ${colorCode}`);
        return this[key];
    }

    const image = this.createOffscreenCanvas(TILE_WIDTH, TILE_HEIGHT);
    const imageCtx = image.getContext('2d');
    const imageData = imageCtx.createImageData(TILE_WIDTH, TILE_HEIGHT);

    const tileData = gfx.tiles[tileCode];
    const palette = gfx.palettes[colorCode];

    for (let y = 0, yoffset = 0; y < TILE_HEIGHT; y++, yoffset += 32) {
        const rowData = tileData[y];
        for (let x = 0, xoffset = yoffset; x < TILE_WIDTH; x++, xoffset += 4) {
            const colorIndex = rowData[x];
            const color = palette[colorIndex];
            imageData.data.set(color, xoffset);
        }
    }

    imageCtx.putImageData(imageData, 0, 0);

    this[key] = image;
    return image;
}

imageCache.getSpriteImage = function(spriteCode, colorCode) {
    const key = `*${spriteCode}-${colorCode}`;
    if (this[key]) {
        //console.log(`Cache hit for sprite ${spriteCode} with color ${colorCode}`);
        return this[key];
    }

    const image = this.createOffscreenCanvas(SPRITE_WIDTH, SPRITE_HEIGHT);
    const imageCtx = image.getContext('2d');
    const imageData = imageCtx.createImageData(SPRITE_WIDTH, SPRITE_HEIGHT);

    const spriteData = gfx.sprites[spriteCode];
    const palette = gfx.palettes[colorCode];

    if (spriteData == undefined)
    {
        console.log(spriteCode, colorCode);
        throw new Error("x")
    }

    for (let y = 0, yoffset = 0; y < SPRITE_HEIGHT; y++, yoffset += 64) {
        const rowData = spriteData[y];
        for (let x = 0, xoffset = yoffset; x < SPRITE_WIDTH; x++, xoffset += 4) {
            const colorIndex = rowData[x];
            const color = palette[colorIndex];
            imageData.data.set(color, xoffset);
        }
    }

    imageCtx.putImageData(imageData, 0, 0);

    this[key] = image;
    return image;
}
