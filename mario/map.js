"use strict"

const map = {
    fXPos: 0, // x position in the screen coordinate
    fYPos: 0, // y position in the screen coordinate

    iMapWidth: 0,
    iMapHeight: 0,
    iLevelType: 0,
    iMapTime: 0,

    currentLevelID: 0,
    iLevelType: 0,
    underWater: false,
};

map.init = function () {
    this.loadGameData();
    this.loadLVL();
}

map.loadGameData = function () {
    this.blocks = new Array(183);

    this.blocks[0] = new Block(0, new Sprite(["transp"], [0], false), false, true, false, false);
    this.blocks[1] = new Block(1, new Sprite(["gnd_red_1"], [0], false), true, false, true, true);
};

map.loadLVL = function () {
    // TODO clearPipeEvent

    const levels = [
        "loadLVL_1_1", "loadLVL_1_2", "loadLVL_1_3", "loadLVL_1_4",
        /*loadLVL_2_1, loadLVL_2_2, loadLVL_2_3, loadLVL_2_4,
        loadLVL_3_1, loadLVL_3_2, loadLVL_3_3, loadLVL_3_4,
        loadLVL_4_1, loadLVL_4_2, loadLVL_4_3, loadLVL_4_4,
        loadLVL_5_1, loadLVL_5_2, loadLVL_5_3, loadLVL_5_4,
        loadLVL_6_1, loadLVL_6_2, loadLVL_6_3, loadLVL_6_4,
        loadLVL_7_1, loadLVL_7_2, loadLVL_7_3, loadLVL_7_4,
        loadLVL_8_1, loadLVL_8_2, loadLVL_8_3, loadLVL_8_4,*/
    ]

    this[levels[this.currentLevelID]]();
};

map.getStartBlock = function () {
    // when the player moves right, the map moves left.
    // so fXPos is negative
    const fXPos = this.fXPos;
    return Math.floor((-fXPos - (-fXPos % 32)) / 32);
}

map.getEndBlock = function () {
    const fXPos = this.fXPos;
    return Math.floor((-fXPos - (-fXPos % 32) + game.canvas.width) / 32) + 2;
}

map.setBackgroundColor = function (ctx) {
    switch (this.iLevelType) {
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

map.draw = function (ctx) {
    this.drawMap(ctx);
};

map.drawMap = function (ctx) {
    // in the y direction, the bottom tile has the smallest y index (ie, 0) in lMap.
    // the y map origin is at canvas.height + 16 and increasing when going up
    for (let i = this.getStartBlock(), iEnd = this.getEndBlock(); i < iEnd && i < this.iMapWidth; i++) {
        for (let j = this.iMapHeight - 1; j >= 0; j--) {
            const blockID = this.lMap[i][j].blockID;
            if (blockID != 0) {
                /* for test purpose
                ctx.fillStyle = "rgb(255, 0, 255)";
                ctx.fillRect(
                    32 * i + this.fXPos,
                    game.canvas.height - 32 * j - 16 - this.lMap[i][j].updateYPos(),
                    16, 16
                );*/
                this.blocks[blockID].draw(
                    ctx,
                    32 * i + this.fXPos,
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
}

map.createMap = function () {
    // TODO mionion list

    const tempMapLevels = new Array(this.iMapHeight).fill(0);
    const tempColumn = new Array(this.iMapWidth).fill(0);

    this.lMap = tempColumn.fill().map(
        () => tempMapLevels.map(() => new MapLevel(0))
    );

    this.underWater = false;
    this.bTP = false;
}

map.structGND = function (x, y, w, h) {
    const mapping = {
        0: 1,
        1: 26,
        2: 92,
        4: 1,
        6: 166,
        7: 181,
    }
    const blockID = mapping[this.iLevelType] || 75;

    for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
            this.lMap[x + i][y + j].blockID = blockID;
        }
    }
}

// ----- true = LEFT, false = RIGHT -----
map.structGND2Dir = function (x, y, size, dir) {
    const mapping = {
        0: 25,
        3: 167,
        4: 25,
    }
    const blockID = mapping[this.iLevelType] || 27;

    if (dir) {
        for (let i = 0, k = 1; i < size; i++) {
            for (let j = 0; j < k; j++) {
                this.lMap[x + i][y + j].blockID = blockID;
            }
            ++k;
        }
    } else {
        for (let i = 0, k = 1; i < size; i++) {
            for (let j = 0; j < k; j++) {
                this.lMap[x + size - 1 - i][y + j].blockID = blockID;
            }
            ++k;
        }
    }
}

map.structGND2 = function (x, y, w, h) {
    const mapping = {
        0: 25,
        3: 167,
        4: 25,
    }
    const blockID = mapping[this.iLevelType] || 27;

    for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
            this.lMap[x + i][y + j].blockID = blockID;
        }
    }
}

map.loadLVL_1_1 = function () {
    this.clearMap();

    this.iMapWidth = 260;
    this.iMapHeight = 25;
    this.iLevelType = 0;
    this.iMapTime = 400;

    this.createMap();

    // this.loadMinionsLVL_1_1();

    // this.loadPipeEventsLVL_1_1();


    this.structGND(0, 0, 69, 2);
    this.structGND(71, 0, 15, 2);
    this.structGND(89, 0, 64, 2);
    this.structGND(155, 0, 85, 2);

    this.structGND2Dir(134, 2, 4, true);
    this.structGND2Dir(140, 2, 4, false);
    this.structGND2Dir(148, 2, 4, true);
    this.structGND2(152, 2, 1, 4);
    this.structGND2Dir(155, 2, 4, false);
    this.structGND2Dir(181, 2, 8, true);
    this.structGND2(189, 2, 1, 8);
    this.structGND2(198, 2, 1, 1);

};

map.loadLVL_1_2 = function () {

};

map.loadLVL_1_3 = function () {

};

map.loadLVL_1_4 = function () {

};
