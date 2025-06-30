"use strict"

const canvas = document.querySelector('canvas');
const canvas_ctx = canvas.getContext('2d');

function renderScreen() {
    gfx.decodeRomData();

    let x = 0;
    for (const color of gfx.hwColors) {
        canvas_ctx.fillStyle = `rgb(${color[0]} ${color[1]} ${color[2]})`;
        canvas_ctx.fillRect(x, 0, 8, 8);
        x += 8;
    }

    // number of palettes = 64
    // 4 colors in a palette
    // total 256 colors
    for (let index = 0; index < 64; index++) {
        const ypos = 16 + Math.floor(index/4) * 8;
        let xpos = (index % 4) * 32;

        const colorBlock = gfx.palettes[index];
        colorBlock.map((color) => {
            canvas_ctx.fillStyle = `rgb(${color[0]} ${color[1]} ${color[2]})`;
            canvas_ctx.fillRect(xpos, ypos, 8, 8);
            xpos += 8;
        });
    }

    for (let i = 0; i < 256; i++) {
        let xpos = (i%16) * 8 + 128 + 8;
        let ypos = Math.floor(i/16) * 8 + 16;
        const tile = gfx.tiles[i];
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x ++) {
                const colorIndex = tile[y][x];
                const color = gfx.palettes[COLOR_PACMAN][colorIndex];
                canvas_ctx.fillStyle = `rgb(${color[0]} ${color[1]} ${color[2]})`;
                canvas_ctx.fillRect(xpos + x, ypos + y, 1, 1);
            }
        }
    }

    const drawSprite = function(spr, pal, xpos, ypos) {
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const colorIndex = spr[y][x];
                const color = pal[colorIndex];
                canvas_ctx.fillStyle = `rgb(${color[0]} ${color[1]} ${color[2]})`;
                canvas_ctx.fillRect(xpos + x, ypos + y, 1, 1);
            }
        }
    }

    const sprites = gfx.sprites;

    for (let index = 44, xpos = 0; index <= 48; index++, xpos += 16) {
        //const spritePacman = sprites[index];
        //const colorPacman = gfx.palettes[COLOR_PACMAN];
        //drawSprite(spritePacman, colorPacman, xpos, 128+16+8);
        const spritePacman = imageCache.getSpriteImage(index, COLOR_PACMAN);
        canvas_ctx.drawImage(spritePacman, xpos, 128+16+8);
    }

    for (let index = 52, xpos = 0; index <= 63; index++, xpos += 16 ) {
        const spritePacman = sprites[index];
        const colorPacman = gfx.palettes[COLOR_PACMAN];
        drawSprite(spritePacman, colorPacman, xpos, 128+16+8+16);
    }

    for (let index = 32, xpos = 0; index <= 39; index++, xpos += 16 ) {
        const spriteGhost = sprites[index];
        const colorGhost = gfx.palettes[COLOR_BLINKY];
        drawSprite(spriteGhost, colorGhost, xpos, 128+16+8+32);
    }

    gfx.vid_clear(TILE_SPACE, COLOR_DOT);
    gfx.vid_color_text({x:9, y:0}, COLOR_DEFAULT, "HIGH SCORE");
    gfx.init_playfield();
    gfx.vid_color_text({x:9, y:14}, 0x5, "PLAYER ONE");
    gfx.vid_color_text({x:11, y:20}, 0x9, "READY!");

    for (let ty = 0, ypos = 0; ty < DISPLAY_TILES_Y; ty++, ypos += 8) {
        for (let tx = 0, xpos = 128 + 8 + 128 + 8; tx < DISPLAY_TILES_X; tx++, xpos += 8) {
            const tile_code = gfx.video_ram[ty][tx];
            const color_code = gfx.color_ram[ty][tx];

            const image = imageCache.getTileImage(tile_code, color_code);
            canvas_ctx.drawImage(image, xpos, ypos);
        }
    }
}

window.addEventListener("load", () => renderScreen());