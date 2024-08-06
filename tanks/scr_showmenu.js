"use strict"

const screen_showmenu = {
    seq: 0,
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
    }

    switch (this.seq) {
        case 1:
            if (this.y > 0) {
                game.canvasContext.fillStyle = "rgb(0, 0, 0)";
                game.canvasContext.fillRect(0, this.y, game.canvas.width, game.canvas.height - this.y);
                game.canvasContext.drawImage(this.offscreenCanvas, 0, this.y);
                this.y -= 5;
            }
            else {
                game.canvasContext.fillStyle = "rgb(0, 0, 0)";
                game.canvasContext.fillRect(0, this.y, game.canvas.width, game.canvas.height);
                game.canvasContext.drawImage(this.offscreenCanvas, 0, 0);
                this.seq = 2;
            }
            break;
        case 2:
            break;
    }



    return SCREEN_RUNNING;
}

screen_showmenu.drawIntroScreen = function (ctx) {
    ctx.font = "16px prstart";
    ctx.fillStyle = "rgb(255, 255, 255)";

    ctx.textBaseline = 'top';

    ctx.fillText("HI- " + game.hi_score.toString(), 170, 35);

    ctx.fillText("1 PLAYER", 165, 250);
    ctx.fillText("2 PLAYERS", 165, 275);
    ctx.fillText("(c) 1980 1985 NAMCO LTD.", 50, 350);
    ctx.fillText("ALL RIGHTS RESERVED", 85, 380);

    ctx.drawImage(game.player_image, 125, 245);
    //ctx.drawImage(game.player_image, 125, 270);

    game.writeInBricks(ctx, "battle", 65, 80);
    game.writeInBricks(ctx, "city", 129, 160);
}
