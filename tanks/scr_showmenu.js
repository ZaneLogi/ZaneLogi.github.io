"use strict"

const screen_showmenu = {
    seq: 0,
    y: 0,
    offscreenCanvas: null,
    offscreenContext: null,
};

screen_showmenu.doFrame = function () {
    if (this.seq == 0) {
        this.offscreenCanvas = createOffscreenCanvas(game.canvas.width, game.canvas.height);
        this.offscreenContext = this.offscreenCanvas.getContext('2d');
        this.drawIntroScreen(this.offscreenContext);
        this.seq = 1;
        this.y = 416;

        game.canvasContext.fillStyle = "rgb(0, 0, 0)";
        game.canvasContext.fillRect(0, 0, game.canvas.width, game.canvas.height);

        game.stage = 1; // set the start stage
    }

    switch (this.seq) {
        case 1:
            game.canvasContext.drawImage(this.offscreenCanvas, 0, this.y);
            this.y -= 5;
            if (this.y <= 0 || control.CHKBIT(CONTROL_FIRE)) {
                this.y = 0;
                this.seq = 20;
            }
            break;
        case 20:
            game.canvasContext.drawImage(this.offscreenCanvas, 0, 0);
            if (control.CHKBIT(CONTROL_FIRE))
                this.seq = 21;
            else
                this.seq = 22;
            break;
        case 21: // wait the key release
            if (!control.CHKBIT(CONTROL_FIRE))
                this.seq = 22;
            break;
        case 22:
            if (control.CHKBIT(CONTROL_UP) && game.nr_of_players == 2) {
                game.nr_of_players = 1;
                this.drawIntroScreen(this.offscreenContext);
                game.canvasContext.drawImage(this.offscreenCanvas, 0, 0);
                this.seq = 23;
            }
            else if (control.CHKBIT(CONTROL_DOWN) && game.nr_of_players == 1) {
                game.nr_of_players = 2;
                this.drawIntroScreen(this.offscreenContext);
                game.canvasContext.drawImage(this.offscreenCanvas, 0, 0);
                this.seq = 24;
            }
            else if (control.CHKBIT(CONTROL_FIRE)) {
                this.seq = 25;
            }
            break;
        case 23:
            if (!control.CHKBIT(CONTROL_UP)) {
                this.seq = 22;
            }
            break;
        case 24:
            if (!control.CHKBIT(CONTROL_DOWN)) {
                this.seq = 22;
            }
            break;
        case 25:
            if (!control.CHKBIT(CONTROL_FIRE)) {
                this.seq = 26;
            }
            break;
    }

    if (this.seq == 26) {
        this.seq = 0;
        return SCREEN_DONE;
    }
    else
        return SCREEN_RUNNING;
}

screen_showmenu.drawIntroScreen = function (ctx) {
    // set the background black with alpha != 0
    // note: without this, offscreen canvas includes transparent pixels
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);

    ctx.font = "16px prstart";
    ctx.fillStyle = "rgb(255, 255, 255)";

    // note: set the baseline at the y of the text output
    ctx.textBaseline = 'top';

    ctx.fillText("HI- " + game.hi_score.toString(), 170, 35);

    ctx.fillText("1 PLAYER", 165, 250);
    ctx.fillText("2 PLAYERS", 165, 275);
    ctx.fillText("(c) 1980 1985 NAMCO LTD.", 50, 350);
    ctx.fillText("ALL RIGHTS RESERVED", 85, 380);

    switch (game.nr_of_players) {
        case 1: ctx.drawImage(game.player_image, 125, 245); break;
        case 2: ctx.drawImage(game.player_image, 125, 270); break;
    }

    game.writeInBricks(ctx, "battle", 65, 80);
    game.writeInBricks(ctx, "city", 129, 160);
}
