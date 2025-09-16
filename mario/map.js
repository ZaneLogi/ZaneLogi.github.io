import { Player } from "./player.js";
import { MapLevel } from "./map_level.js";
import { game } from "./game.js";
import { blocks } from "./block.js";
import { levels } from "./dat_levels.js";

export const map = {
    xpos: 0, // x position in the screen coordinate
    ypos: 0, // y position in the screen coordinate

    iMapWidth: 0,
    iMapHeight: 0,
    iLevelType: 0,
    iMapTime: 0,

    currentLevelID: 0,
    iLevelType: 0,
    underWater: false,

    canMoveMap: true,
};

map.init = function () {
    this.player = new Player(84, 368);
    this.loadGameData();
    this.loadLVL();
}

map.loadGameData = function () {
    this.blocks = blocks;
};

map.loadLVL = function () {
    // TODO clearPipeEvent

    this.lMap = levels[this.currentLevelID]();
    this.iMapWidth = this.lMap.length;
    this.iMapHeight = this.lMap[0].length;
};

map.getStartBlock = function () {
    // when the player moves right, the map moves left.
    // so xpos is negative
    const xpos = this.xpos;
    return Math.floor((-xpos - (-xpos % 32)) / 32);
};

map.getEndBlock = function () {
    const xpos = this.xpos;
    return Math.floor((-xpos - (-xpos % 32) + game.canvas.width) / 32) + 2;
};

map.getBlockID = function (x, y) {
    return {
        x: this.getBlockIDX(x),
        y: this.getBlockIDY(y),
    }
};

map.getBlockIDX = function (x) {
    return Math.floor(x < 0 ? 0 : x / 32);
};

map.getBlockIDY = function (y) {
    return Math.floor(y > game.window_height - 16 ? 0 : (game.window_height - 16 - y + 32) / 32);
};

map.getMapBlock = function (x, y) {
    return map.lMap[x][y];
}


map.setBackgroundColor = function (ctx) {
    switch (this.lMap.levelType) {
        case 0: case 2:
            ctx.fillStyle = "rgb(93, 148, 252)";
            break;
        case 1: case 3: case 4:
            ctx.fillStyle = "rgb(0, 0, 0)";
            break;
        default:
            ctx.fillStyle = "rgb(93, 148, 252)";
            break;
    }
    ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);
};

map.update = function () {
    map.player.update();
}


map.draw = function (ctx) {
    // draw map level
    this.drawMapLevel(ctx);

    // draw platforms

    // draw minions

    // draw points

    // draw coins

    // draw block debris

    // draw level text

    // draw lines

    // draw bubbles

    // draw player
    this.player.draw(ctx);

    // draw events

    // draw game layout
};

map.drawMapLevel = function (ctx) {
    // in the y direction, the bottom tile has the smallest y index (ie, 0) in lMap.
    // the y map origin is at canvas.height + 16 and increasing when going up
    for (let i = this.getStartBlock(), iEnd = this.getEndBlock(); i < iEnd && i < this.iMapWidth; i++) {
        for (let j = this.iMapHeight - 1; j >= 0; j--) {
            const blockID = this.lMap[i][j].blockID;
            if (blockID != 0) {
                /* for test purpose
                ctx.fillStyle = "rgb(255, 0, 255)";
                ctx.fillRect(
                    32 * i + this.xpos,
                    game.canvas.height - 32 * j - 16 - this.lMap[i][j].updateYPos(),
                    16, 16
                );*/
                this.blocks[blockID].draw(
                    ctx,
                    32 * i + this.xpos,
                    game.canvas.height - 32 * j - 16 - this.lMap[i][j].updateYPos()
                )
            }
        }
    }
};

map.drawMinions = function (ctx) {

};

map.drawGameLayout = function (ctx) {

};

map.drawLines = function (ctx) {

};


map.clearMap = function () {
    delete this.lMap;

    this.iMapWidth = 0;
    this.iMapHeight = 0;

    // TODO
};

map.createMap = function () {
    // TODO mionion list

    const tempMapLevels = new Array(this.iMapHeight).fill(0);
    const tempColumn = new Array(this.iMapWidth).fill(0);

    this.lMap = tempColumn.map(
        () => tempMapLevels.map(() => new MapLevel(0))
    );

    this.underWater = false;
    this.bTP = false;
};

map.moveMap = function (dx, dy) {
    if (this.xpos + dx > 0) {
        // the max allowed value of xpos is 0
        // when it is out of bound, set it to 0
        this.xpos = 0;
        return false;
    }
    else {
        this.xpos += dx;
        return true;
    }
};

map.checkCollision = function (pos, checkVisible) {
    // check the collision flag of the block at the pos
    const block = this.blocks[this.lMap[pos.x][pos.y].blockID];
    return block.collision && (checkVisible ? block.visible : true);
};

map.checkCollisionLB = function (x, y, hitBoxY, checkVisible) {
    return this.checkCollision(this.getBlockID(x, y + hitBoxY), checkVisible);
};

map.checkCollisionLT = function (x, y, checkVisible) {
    return this.checkCollision(this.getBlockID(x, y), checkVisible);
};

map.checkCollisionLC = function (x, y, hitBoxY, checkVisible) {
    return this.checkCollision(this.getBlockID(x, y + hitBoxY), checkVisible);
};

map.checkCollisionRC = function (x, y, hitBoxX, hitBoxY, checkVisible) {
    return this.checkCollision(this.getBlockID(x + hitBoxX, y + hitBoxY), checkVisible);
};

map.checkCollisionRB = function (x, y, hitBoxX, hitBoxY, checkVisible) {
    return this.checkCollision(this.getBlockID(x + hitBoxX, y + hitBoxY), checkVisible);
}

map.checkCollisionRT = function (x, y, hitBoxX, checkVisible) {
    return this.checkCollision(this.getBlockID(x + hitBoxX, y), checkVisible);
}