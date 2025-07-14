"use strict"

const P1_SCOR_X = 56, P1_SCOR_Y = 224;
const P2_SCOR_X = 200, P2_SCOR_Y = 224;
const HI_SCOR_X = 120, HI_SCOR_Y = 224;
const CREDIT_X = 168, CREDIT_Y = 8, CREDIT_COINS_X = 224;

const gfx = {
    canvas: null,
    canvas_ctx: null,
    window_width: 0,
    window_height: 0,
};

gfx.init = function() {
    this.canvas = document.querySelector('canvas');
    // https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-will-read-frequently
    // CanvasSettings objects with will read frequently equal to true tell the user agent that
    // the webpage is likely to perform many readback operations
    // and that it is advantageous to use a software canvas.
    this.canvas_ctx = this.canvas.getContext('2d', {willReadFrequently: true});
    this.window_width = this.canvas.width;
    this.window_height = this.canvas.height;
}

gfx.clearScreen = function() {
    this.canvas_ctx.fillStyle = "#000000";
    this.canvas_ctx.fillRect(0, 0, this.window_width, this.window_height);
}

gfx.clearPlayField = function() {
    this.canvas_ctx.fillStyle = "#000000";
    this.canvas_ctx.fillRect(0, 40, 224, 200);
}

gfx.drawScoreHead = function() {
    // Print score header " SCORE<1> HI-SCORE SCORE<2> "
    const x = 32, y = 240;
    this.drawString(x, y, message_score);
    let pt = this.convertCoords({x:x, y:y});
}

gfx.drawScore = function(x, y, score, num_digits) {
    let digits = [];

    for (let i = 0; i < num_digits; i++) {
        const d = score % 10;
        digits.push(d);
        score = Math.floor((score - d)/10);
    }

    if (digits[num_digits-1] > 9) digits[3] = 9;

    let pt = this.convertCoords({x:x, y:y});

    for (let i = num_digits-1; i >= 0; i--) {
        this.canvas_ctx.drawImage(resource.chrImages[digits[i] + 0x1A], pt.x, pt.y);
        pt.x += 8;
    }
}

gfx.drawP1Score = function() {
    this.drawScore(P1_SCOR_X, P1_SCOR_Y, game.p1_score, 4);
}

gfx.drawP2Score = function() {
    this.drawScore(P2_SCOR_X, P2_SCOR_Y, game.p2_score, 4);
}

gfx.drawCredit = function() {
    this.drawString(CREDIT_X, CREDIT_Y, message_credit);
    this.drawScore(CREDIT_COINS_X, CREDIT_Y, game.coins, 2);
}

gfx.drawString = function(x, y, str) {
    let pt = this.convertCoords({x:x, y:y});
    for (const ch of str) {
        this.canvas_ctx.drawImage(resource.chrImages[ch], pt.x, pt.y);
        pt.x += 8;
    }
}

gfx.drawChar = function(x, y, ch) {
    const pt = this.convertCoords({x:x, y:y});
    this.canvas_ctx.drawImage(resource.chrImages[ch], pt.x, pt.y);
}

gfx.drawStatus = function() {
    this.clearScreen();
    this.drawScoreHead();
    this.drawP1Score(); // player one score
    this.drawP2Score(); // player two score
    this.drawScore(HI_SCOR_X, HI_SCOR_Y, game.hi_score, 4); // hi score
    this.drawCredit();
}

gfx.convertCoords = function(pt) {
    // in the original game, the origin(0, 0) is at the point(32, 255) of the canvas
    // the x direction is left to right, the y direction is bottom to top
    // so need to translate the game coordinates to the screen coordinates
    const x = pt.x;
    const y = pt.y;

    // Convert to canvas coordinates
    pt.x = x - 32;
    pt.y = this.window_height - 1 - y;

    return pt;
}

gfx.eraseRect = function(x, y, w, h) {
    const pt = this.convertCoords({x: x, y: y});
    this.canvas_ctx.fillStyle = "#000000";
    this.canvas_ctx.fillRect(pt.x, pt.y, w, h);
}

gfx.drawSprite = function(x , y, image) {
    const pt = this.convertCoords({x: x, y: y});
    this.canvas_ctx.drawImage(image, pt.x, pt.y);
}

gfx.drawShield = function() {
    const shieldX = 64;
    const shieldY = 56;
    const shieldW = 22;
    const distBetweenShields = 23;

    for (let i = 0, x = shieldX; i < 4; i++) {
        const pt = this.convertCoords({x: x, y: shieldY});

        this.canvas_ctx.drawImage(resource.shieldImage, pt.x, pt.y);
        x += distBetweenShields + shieldW;
    }
}

gfx.drawBottomLine = function() {
    this.canvas_ctx.fillStyle = "#00ff00";
    this.canvas_ctx.fillRect(0, this.window_height - 1 - 17, this.window_width, 1);
}

gfx.drawPlayerShip = function(obj) {
    const playerX = obj.player_x;
    const playerY = obj.player_y;
    const playerImage = resource.playerImage;
    this.drawSprite(playerX, playerY, playerImage);
}

gfx.drawPlayerBlowup = function(obj) {
    const x = obj.player_x;
    const y = obj.player_y;
    const image = resource.playerBlowupImages[obj.player_alive];
    this.drawSprite(x, y, image);
}

gfx.drawAlien = function() {
    const alienCurIndex = game.level_data.alien_cur_index;
    if (game.level_data.aliens[alienCurIndex] != 0) {
        const alienType = Math.floor(game.level_data.alien_row/2);
        const alienFrame = game.level_data.alien_frame;
        const x = game.level_data.alien_cursor_x;
        const y = game.level_data.alien_cursor_y;
        const image = resource.alienImages[alienType][alienFrame];

        // as the alien images have blank linkes at the left and right sides,
        // no need to erase the old one if moving horizontally
        this.drawSprite(x, y, image);

        // erase the old one if moving vertically
        if (game.level_data.ref_alien_dy > 0) {
            this.eraseRect(
                x - game.level_data.ref_alien_dx,
                y + game.level_data.ref_alien_dy,
                16, 8);
        }
    }
}

gfx.drawPlayerShot = function(obj) {
    const x = obj.shot_x;
    const y = obj.shot_y;
    const image = resource.playerShotImage;
    this.drawSprite(x, y, image);
}

gfx.drawShotExploding = function(obj, draw) {
    const x = obj.shot_x;
    const y = obj.shot_y;
    const image = draw
        ? resource.shotExplodingImage
        : resource.shotExplodingRemoveImage;
    this.drawSprite(x, y, image);
}

gfx.drawAlienExploding = function() {
    const x = game.exp_alien_x;
    const y = game.exp_alien_y;
    const image = resource.alienExplodingImage;
    this.drawSprite(x, y, image);
}

gfx.drawAlienShot = function(obj) {
    const pt = this.convertCoords({x: obj.shot_x, y: obj.shot_y});
    const imageIndex = obj.shot_step_cnt % 4;
    this.canvas_ctx.drawImage(obj.images[imageIndex], pt.x, pt.y);
}

gfx.drawAlienShotExploding = function(obj, draw) {
    const x = obj.shot_x;
    const y = obj.shot_y;
    const image = draw 
        ? resource.alienShotExplodingImage
        : resource.alienShotExplodingRemoveImage;
    this.drawSprite(x, y, image);
}

gfx.drawSaucer = function(index) {
    const x = game.saucer.coord_x;
    const y = game.saucer.coord_y;
    const image = resource.saucerImages[index]; // 0: normal, 1: explosion
    this.drawSprite(x, y, image);
}

gfx.drawPlayerNumShips = function() {
    let ship_loc_x = 56, ship_loc_y = 8;
    // draw player ships
    for (let i = 0; i < game.p1_num_ships; i++) {
        const playerImage = resource.playerImage;
        this.drawSprite(ship_loc_x, ship_loc_y, playerImage);
        ship_loc_x += 16;
    }

    // clear rest area
    this.eraseRect(ship_loc_x, ship_loc_y, CREDIT_X - ship_loc_x, 8);

    // draw number digits
    const dig_x = 40, dig_y = 8;
    this.drawChar(dig_x, dig_y, game.p1_num_ships + 0x1a);
}