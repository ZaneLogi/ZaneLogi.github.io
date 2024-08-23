"use strict"

const map = {
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
    this.blocks = new Array(183);

    this.blocks[0] = new Block(0, new Sprite(["transp"], [0], false), false, true, false, false);
    this.blocks[1] = new Block(1, new Sprite(["gnd_red_1"], [0], false), true, false, true, true);

    this.blocks[3] = new Block(3, new Sprite(["bush_center_0"], [0], false), false, false, false, true);
    this.blocks[4] = new Block(4, new Sprite(["bush_center_1"], [0], false), false, false, false, true);
    this.blocks[5] = new Block(5, new Sprite(["bush_left"], [0], false), false, false, false, true);
    this.blocks[6] = new Block(6, new Sprite(["bush_right"], [0], false), false, false, false, true);
    this.blocks[7] = new Block(7, new Sprite(["bush_top"], [0], false), false, false, false, true);
    this.blocks[8] = new Block(8,
        new Sprite(["blockq_0", "blockq_2", "blockq_1", "blockq_2"], [300, 30, 130, 140], false),
        true, false, true, true);

    this.blocks[10] = new Block(10, new Sprite(["grass_left"], [0], false), false, false, false, true);
    this.blocks[11] = new Block(11, new Sprite(["grass_center"], [0], false), false, false, false, true);
    this.blocks[12] = new Block(12, new Sprite(["grass_right"], [0], false), false, false, false, true);
    this.blocks[13] = new Block(13, new Sprite(["brickred"], [0], false), true, false, true, true);
    this.blocks[14] = new Block(14, new Sprite(["cloud_left_bot"], [0], false), false, false, false, true);
    this.blocks[15] = new Block(15, new Sprite(["cloud_left_top"], [0], false), false, false, false, true);
    this.blocks[16] = new Block(16, new Sprite(["cloud_center_bot"], [0], false), false, false, false, true);
    this.blocks[17] = new Block(17, new Sprite(["cloud_center_top"], [0], false), false, false, false, true);
    this.blocks[18] = new Block(18, new Sprite(["cloud_right_bot"], [0], false), false, false, false, true);
    this.blocks[19] = new Block(19, new Sprite(["cloud_right_top"], [0], false), false, false, false, true);
    this.blocks[20] = new Block(20, new Sprite(["pipe_left_bot"], [0], false), true, false, false, true);
    this.blocks[21] = new Block(21, new Sprite(["pipe_left_top"], [0], false), true, false, true, true);
    this.blocks[22] = new Block(22, new Sprite(["pipe_right_bot"], [0], false), true, false, false, true);
    this.blocks[23] = new Block(23, new Sprite(["pipe_right_top"], [0], false), true, false, true, true);
    // ----- 24 BlockQ2 -----
    this.blocks[24] = new Block(24, new Sprite(["transp"], [0], false), true, false, true, false);
    this.blocks[25] = new Block(25, new Sprite(["gnd_red2"], [0], false), true, false, false, true);
    this.blocks[26] = new Block(26, new Sprite(["gnd1"], [0], false), true, false, false, true);
    this.blocks[27] = new Block(27, new Sprite(["gnd1_2"], [0], false), true, false, false, true);
    this.blocks[28] = new Block(28, new Sprite(["brick1"], [0], false), true, false, true, true);
    this.blocks[29] = new Block(29,
        new Sprite(["coin_use0", "coin_use2", "coin_use1", "coin_use2"], [300, 30, 130, 140], false),
        false, false, true, true);
    this.blocks[30] = new Block(30, new Sprite(["pipe1_left_bot"], [0], false), true, false, false, true);
    this.blocks[31] = new Block(31, new Sprite(["pipe1_left_top"], [0], false), true, false, true, true);
    this.blocks[32] = new Block(32, new Sprite(["pipe1_right_bot"], [0], false), true, false, false, true);
    this.blocks[33] = new Block(33, new Sprite(["pipe1_right_top"], [0], false), true, false, true, true);
    this.blocks[34] = new Block(34, new Sprite(["pipe1_hor_bot_right"], [0], false), true, false, false, true);
    this.blocks[35] = new Block(35, new Sprite(["pipe1_hor_top_center"], [0], false), true, false, false, true);
    this.blocks[36] = new Block(36, new Sprite(["pipe1_hor_top_left"], [0], false), true, false, true, true);
    this.blocks[37] = new Block(37, new Sprite(["pipe1_hor_bot_center"], [0], false), true, false, false, true);
    this.blocks[38] = new Block(38, new Sprite(["pipe1_hor_bot_left"], [0], false), true, false, true, true);
    this.blocks[39] = new Block(39, new Sprite(["pipe1_hor_top_right"], [0], false), true, false, false, true);
    this.blocks[40] = new Block(40, new Sprite(["end0_l"], [0], false), false, false, true, true);
    this.blocks[41] = new Block(41, new Sprite(["end0_dot"], [0], false), false, false, true, true);
    this.blocks[42] = new Block(42, new Sprite(["end0_flag"], [0], false), false, false, false, true);
    this.blocks[43] = new Block(43, new Sprite(["castle0_brick"], [0], false), false, false, false, true);
    this.blocks[44] = new Block(44, new Sprite(["castle0_top0"], [0], false), false, false, false, true);
    this.blocks[45] = new Block(45, new Sprite(["castle0_top1"], [0], false), false, false, false, true);
    this.blocks[46] = new Block(46, new Sprite(["castle0_center_center_top"], [0], false), false, false, false, true);
    this.blocks[47] = new Block(47, new Sprite(["castle0_center_center"], [0], false), false, false, false, true);
    this.blocks[48] = new Block(48, new Sprite(["castle0_center_left"], [0], false), false, false, false, true);
    this.blocks[49] = new Block(49, new Sprite(["castle0_center_right"], [0], false), false, false, false, true);

    this.blocks[55] = new Block(55,
        new Sprite(["blockq1_0", "blockq1_2", "blockq1_1", "blockq1_2"], [300, 30, 130, 140], false),
        true, false, true, true);

    this.blocks[58] = new Block(58, new Sprite(["pipe_hor_bot_right"], [0], false), true, false, false, true);
    this.blocks[59] = new Block(59, new Sprite(["pipe_hor_top_center"], [0], false), true, false, false, true);
    this.blocks[60] = new Block(60, new Sprite(["pipe_hor_top_left"], [0], false), true, false, true, true);
    this.blocks[61] = new Block(61, new Sprite(["pipe_hor_bot_center"], [0], false), true, false, false, true);
    this.blocks[62] = new Block(62, new Sprite(["pipe_hor_bot_left"], [0], false), true, false, true, true);
    this.blocks[63] = new Block(63, new Sprite(["pipe_hor_top_right"], [0], false), true, false, false, true);




    this.blocks[71] = new Block(71,
        new Sprite(["coin_use00", "coin_use02", "coin_use01", "coin_use02"], [300, 30, 130, 140], false),
        false, false, true, true);

    this.blocks[73] = new Block(73,
        new Sprite(["coin_use30", "coin_use32", "coin_use31", "coin_use32"], [300, 30, 130, 140], false),
        false, false, true, true);

    this.blocks[75] = new Block(75, new Sprite(["gnd_4"], [0], false), true, false, true, true);

    this.blocks[81] = new Block(81, new Sprite(["brick2"], [0], false), true, false, true, true);

    this.blocks[92] = new Block(92, new Sprite(["uw_0"], [0], false), true, false, true, true);

    this.blocks[97] = new Block(97, new Sprite(["pipe2_left_bot"], [0], false), true, false, false, true);
    this.blocks[98] = new Block(98, new Sprite(["pipe2_left_top"], [0], false), true, false, true, true);
    this.blocks[99] = new Block(99, new Sprite(["pipe2_right_bot"], [0], false), true, false, false, true);
    this.blocks[100] = new Block(100, new Sprite(["pipe2_right_top"], [0], false), true, false, true, true);
    this.blocks[101] = new Block(101, new Sprite(["pipe2_hor_bot_right"], [0], false), true, false, false, true);
    this.blocks[102] = new Block(102, new Sprite(["pipe2_hor_top_center"], [0], false), true, false, false, true);
    this.blocks[103] = new Block(103, new Sprite(["pipe2_hor_top_left"], [0], false), true, false, true, true);
    this.blocks[104] = new Block(104, new Sprite(["pipe2_hor_bot_center"], [0], false), true, false, false, true);
    this.blocks[105] = new Block(105, new Sprite(["pipe2_hor_bot_left"], [0], false), true, false, true, true);
    this.blocks[106] = new Block(106, new Sprite(["pipe2_hor_top_right"], [0], false), true, false, false, true);



    this.blocks[112] = new Block(112, new Sprite(["pipe3_left_bot"], [0], false), true, false, false, true);
    this.blocks[113] = new Block(113, new Sprite(["pipe3_left_top"], [0], false), true, false, true, true);
    this.blocks[114] = new Block(114, new Sprite(["pipe3_right_bot"], [0], false), true, false, false, true);
    this.blocks[115] = new Block(115, new Sprite(["pipe3_right_top"], [0], false), true, false, true, true);
    this.blocks[116] = new Block(116, new Sprite(["pipe3_hor_bot_right"], [0], false), true, false, false, true);
    this.blocks[117] = new Block(117, new Sprite(["pipe3_hor_top_center"], [0], false), true, false, false, true);
    this.blocks[118] = new Block(118, new Sprite(["pipe3_hor_top_left"], [0], false), true, false, true, true);
    this.blocks[119] = new Block(119, new Sprite(["pipe3_hor_bot_center"], [0], false), true, false, false, true);
    this.blocks[120] = new Block(120, new Sprite(["pipe3_hor_bot_left"], [0], false), true, false, true, true);
    this.blocks[121] = new Block(121, new Sprite(["pipe3_hor_top_right"], [0], false), true, false, false, true);

    this.blocks[123] = new Block(123, new Sprite(["end1_l"], [0], false), false, false, true, true);
    this.blocks[124] = new Block(124, new Sprite(["end1_dot"], [0], false), false, false, true, true);


    this.blocks[136] = new Block(136, new Sprite(["pipe4_left_bot"], [0], false), true, false, false, true);
    this.blocks[137] = new Block(137, new Sprite(["pipe4_left_top"], [0], false), true, false, true, true);
    this.blocks[138] = new Block(138, new Sprite(["pipe4_right_bot"], [0], false), true, false, false, true);
    this.blocks[139] = new Block(139, new Sprite(["pipe4_right_top"], [0], false), true, false, true, true);


    this.blocks[148] = new Block(148, new Sprite(["cloud_left_bot1"], [0], false), false, false, false, true);
    this.blocks[149] = new Block(149, new Sprite(["cloud_center_bot1"], [0], false), false, false, false, true);
    this.blocks[150] = new Block(150, new Sprite(["cloud_center_top1"], [0], false), false, false, false, true);

    this.blocks[155] = new Block(155, new Sprite(["castle1_brick"], [0], false), false, false, false, true);
    this.blocks[156] = new Block(156, new Sprite(["castle1_top0"], [0], false), false, false, false, true);
    this.blocks[157] = new Block(157, new Sprite(["castle1_top1"], [0], false), false, false, false, true);
    this.blocks[158] = new Block(158, new Sprite(["castle1_center_center_top"], [0], false), false, false, false, true);
    this.blocks[159] = new Block(159, new Sprite(["castle1_center_center"], [0], false), false, false, false, true);
    this.blocks[160] = new Block(160, new Sprite(["castle1_center_left"], [0], false), false, false, false, true);
    this.blocks[161] = new Block(161, new Sprite(["castle1_center_right"], [0], false), false, false, false, true);




    this.blocks[166] = new Block(166, new Sprite(["gnd2"], [0], false), true, false, false, true);
    this.blocks[167] = new Block(167, new Sprite(["gnd2_2"], [0], false), true, false, false, true);
    this.blocks[168] = new Block(168, new Sprite(["end1_flag"], [0], false), false, false, false, true);

    this.blocks[172] = new Block(172, new Sprite(["pipe5_left_bot"], [0], false), true, false, false, true);
    this.blocks[173] = new Block(173, new Sprite(["pipe5_left_top"], [0], false), true, false, true, true);
    this.blocks[174] = new Block(174, new Sprite(["pipe5_right_bot"], [0], false), true, false, false, true);
    this.blocks[175] = new Block(175, new Sprite(["pipe5_right_top"], [0], false), true, false, true, true);
    this.blocks[176] = new Block(176, new Sprite(["pipe6_left_bot"], [0], false), true, false, false, true);
    this.blocks[177] = new Block(177, new Sprite(["pipe6_left_top"], [0], false), true, false, true, true);
    this.blocks[178] = new Block(178, new Sprite(["pipe6_right_bot"], [0], false), true, false, false, true);
    this.blocks[179] = new Block(179, new Sprite(["pipe6_right_top"], [0], false), true, false, true, true);


    this.blocks[181] = new Block(181, new Sprite(["gnd_5"], [0], false), true, false, false, true);
    // ----- 182 ----- ENDUSE
    this.blocks[182] = new Block(182, new Sprite(["transp"], [0], false), true, false, true, false);
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
}

map.createMap = function () {
    // TODO mionion list

    const tempMapLevels = new Array(this.iMapHeight).fill(0);
    const tempColumn = new Array(this.iMapWidth).fill(0);

    this.lMap = tempColumn.map(
        () => tempMapLevels.map(() => new MapLevel(0))
    );

    this.underWater = false;
    this.bTP = false;
}

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
}
