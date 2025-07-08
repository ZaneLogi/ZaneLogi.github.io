"use strict"

const canvas = document.querySelector('canvas');
const canvas_ctx = canvas.getContext('2d');

window.addEventListener("load", () => renderScreen());

function renderScreen() {
    resource.init();
    canvas_ctx.drawImage(resource.shieldImage, 0, 0);
    canvas_ctx.drawImage(resource.playerImage, 22, 0);

    let x = 0, y = 16;
    for (const alienImages of resource.alienImages) {
        canvas_ctx.drawImage(alienImages[0], x, y);
        canvas_ctx.drawImage(alienImages[1], x + 16, y);
        x += 32;
    }

    for (const saucerImage of resource.saucerImages) {
        canvas_ctx.drawImage(saucerImage, x, y);
        x += 24;
    }
    y += 16;
    x = 0;

    for (const chrImage of resource.chrImages) {
        canvas_ctx.drawImage(chrImage, x, y);
        x += 8;
    }

    // convert the coordinates to the screen coordinates
    // screenx = x - 32
    // screeny = screen_h - 1 - y

    // in the original game, the screen is 224x256 pixels.
    // the y direction is in the horizontal direction,
    // and the x direction is in the vertical direction. 
    // the video ram address starts from 0x2400 to 0x3FFF
    // one scanline consists of 256 pixels in y direction
    // as one bit represents one pixel, there are 256 / 8 = 32 bytes per scanline
    // the total scanlines are (0x3FFF - 0x2400 + 1) / 32 = 224

    // in the game source code, it treats the video address starts from 0x2000,
    // so the screen coordinates are shifted by 0x2000 - 0x2400 = -0x400 = -1024.
    // as one scanline consists of 32 bytes, the offset is -1024/32 = -32 in the x direction.
    // that's why the x coordinate is shifted by 32 pixels in the original game.

    const screenW = 224;
    const screenH = 256;
    const shiftX = 32;
    const shipX = 0x30;
    const shipY = 0x20;
    const shieldX = 32;
    const shieldY = 48;
    const shieldW = 22;
    const distBetweenShields = 24;
    canvas_ctx.fillStyle = "#00ff00";
    canvas_ctx.fillRect(0, screenH - 1 - 16, screenW, 1);

    const convertX = (x) => x - shiftX;
    const convertY = (y) => screenH - 1 - y;

    canvas_ctx.drawImage(resource.playerImage, convertX(shipX), convertY(shipY));

    for (let i = 0, x = shieldX; i < 4; i++) {
        canvas_ctx.drawImage(resource.shieldImage, x, screenH - 1 - shieldY - 8);
        x += distBetweenShields + shieldW;
    }

    const alienRefX = 56; // 0x38 = 56, 56 - 32 = 24
    const alienRefY = 120;// 0x78 = 120
    for (let i = 0; i < 55; i++) {
        const row = Math.floor(i/11);
        const col = i % 11;
        const x = alienRefX + col * 16;
        const y = alienRefY + row * 16;
        const type = Math.floor(row / 2);
        canvas_ctx.drawImage(resource.alienImages[type][0], x - shiftX, screenH - 1 - y);
    }
}