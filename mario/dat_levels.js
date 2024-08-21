"use strict"

map.struckBlockQ = function (x, y, width) {
    const mapping = {
        0: 8,
        4: 8,
    }
    const blockID = mapping[this.iLevelType] || 55;

    for (let i = 0; i < width; i++) {
        this.lMap[x + i][y].blockID = blockID;
    }
};

map.struckBlockQ2 = function (x, y, width) {
    for (let i = 0; i < width; i++) {
        this.lMap[x + i][y].blockID = 24;
    }
};

map.structBrick = function (x, y, width, height) {
    const mapping = {
        0: 13,
        3: 81,
        4: 13,
    }
    const blockID = mapping[this.iLevelType] || 28;

    for (let i = 0; i < width; i++) {
        for (let j = 0; j < height; j++) {
            this.lMap[x + i][y + j].blockID = blockID;
        }
    }
};

map.structBush = function (x, y, size) {
    // ----- LEFT & RIGHT
    for (let i = 0; i < size; i++) {
        this.lMap[x + i][y + i].blockID = 5;
        this.lMap[x + size + 1 + i][y + size - 1 - i].blockID = 6;
    }

    // ----- CENTER LEFT & RIGHT
    for (let i = 0, k = 1; i < size - 1; i++) {
        for (let j = 0; j < k; j++) {
            this.lMap[x + 1 + i][y + j].blockID = (i % 2 == 0 ? 3 : 4);
            this.lMap[x + size * 2 - 1 - i][y + j].blockID = (i % 2 == 0 ? 3 : 4);
        }
        ++k;
    }

    // ----- CENTER
    for (let i = 0; i < size; i++) {
        this.lMap[x + size][y + i].blockID = (i % 2 == 0 && size != 1 ? 4 : 3);
    }

    // ----- TOP
    this.lMap[x + size][y + size].blockID = 7;
};

map.structCastleSmall = function (x, y) {
    const blockID1 = (this.iLevelType == 3 ? 155 : 43);
    const blockID2 = (this.iLevelType == 3 ? 159 : 47);
    const blockID3 = (this.iLevelType == 3 ? 158 : 46);
    const blockID4 = (this.iLevelType == 3 ? 157 : 45);
    const blockID5 = (this.iLevelType == 3 ? 156 : 44);
    const blockID6 = (this.iLevelType == 3 ? 160 : 48);
    const blockID7 = (this.iLevelType == 3 ? 161 : 49);

    for (let i = 0; i < 2; i++) {
        this.lMap[x][y + i].blockID = blockID1;
        this.lMap[x + 1][y + i].blockID = blockID1;
        this.lMap[x + 3][y + i].blockID = blockID1;
        this.lMap[x + 4][y + i].blockID = blockID1;

        this.lMap[x + 2][y + i].blockID = blockID2;
    }

    this.lMap[x + 2][y + 1].blockID = blockID3;

    for (let i = 0; i < 5; i++) {
        this.lMap[x + i][y + 2].blcokID
            = (i == 0 || i == 4 ? blockID4 : blockID5);
    }

    this.lMap[x + 1][y + 3].blockID = blockID6;
    this.lMap[x + 2][y + 3].blockID = blockID1;
    this.lMap[x + 3][y + 3].blockID = blockID7;

    for (let i = 0; i < 3; i++) {
        this.lMap[x + i + 1][y + 4].blockID = blockID4;
    }
}

map.structCloud = function (x, y, size) {
    // ----- LEFT
    this.lMap[x][y].blockID = (this.iLevelType == 3 ? 148 : 14);
    this.lMap[x][y + 1].blockID = 15;

    for (let i = 0; i < size; i++) {
        this.lMap[x + 1 + i][y].blockID = (this.iLevelType == 3 ? 149 : 16);
        this.lMap[x + 1 + i][y + 1].blockID = (this.iLevelType == 3 ? 150 : 17);
    }

    this.lMap[x + size + 1][y].blockID = 18;
    this.lMap[x + size + 1][y + 1].blockID = 19;
};

map.structCoins = function (x, y, width, height) {
    const mapping = {
        0: 71,
        1: 29,
        2: 73,
        4: 71,
    }
    const blockID = mapping[this.iLevelType] || 29;

    for (let i = 0; i < width; i++) {
        for (let j = 0; j < height; j++) {
            this.lMap[x + i][y + j].blockID = blockID;
        }
    }
};

map.structEnd = function (x, y, height) {
    const blockID1 = (this.iLevelType == 4 ? 123 : 40);
    for (let i = 0; i < height; i++) {
        this.lMap[x][y + i].blockID = blockID1;
    }

    // TODO: oFlag = new Flag(x * 32 - 16, y + height + 72);

    const blockID2 = (this.iLevelType == 4 ? 124 : 41);
    this.lMap[x][y + height].blockID = blockID2;

    for (let i = y + height + 1; i < y + height + 4; i++) {
        this.lMap[x][i].blockID = 182;
    }
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
};

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
};

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
};

map.structGrass = function (x, y, size) {
    this.lMap[x][y].blockID = 10;
    for (let i = 0; i < size; i++) {
        this.lMap[x + 1 + i][y].blockID = 11;
    }
    this.lMap[x + size + 1][y].blockID = 12;
};

map.structPipe = function (x, y, height) {
    const mapping1 = {
        0: 20,
        2: 97,
        3: 176,
        4: 112,
        5: 136,
        7: 172
    }
    const blockID1 = mapping1[this.iLevelType] || 30;

    const mapping2 = {
        0: 22,
        2: 99,
        3: 178,
        4: 114,
        5: 138,
        7: 174
    }
    const blockID2 = mapping2[this.iLevelType] || 32;

    const mapping3 = {
        0: 21,
        2: 98,
        3: 177,
        4: 113,
        5: 137,
        7: 173
    }
    const blockID3 = mapping3[this.iLevelType] || 31;

    const mapping4 = {
        0: 23,
        2: 100,
        3: 179,
        4: 115,
        5: 139,
        7: 175
    }
    const blockID4 = mapping4[this.iLevelType] || 33;

    for (let i = 0; i < height; i++) {
        this.lMap[x][y + i].blockID = blockID1;
        this.lMap[x + 1][y + i].blockID = blockID2;
    }

    this.lMap[x][y + height].blockID = blockID3;
    this.lMap[x + 1][y + height].blockID = blockID4;
};

map.structPipeHorizontal = function (x, y, width) {
    const mapping1 = {
        0: 62,
        2: 105,
        4: 120
    }
    const blockID1 = mapping1[this.iLevelType] || 38;

    const mapping2 = {
        0: 60,
        2: 103,
        4: 118
    }
    const blockID2 = mapping2[this.iLevelType] || 36;

    const mapping3 = {
        0: 61,
        2: 104,
        4: 119
    }
    const blockID3 = mapping3[this.iLevelType] || 37;

    const mapping4 = {
        0: 59,
        2: 102,
        4: 117
    }
    const blockID4 = mapping4[this.iLevelType] || 35;

    const mapping5 = {
        0: 58,
        2: 101,
        4: 116
    }
    const blockID5 = mapping5[this.iLevelType] || 34;

    const mapping6 = {
        0: 63,
        2: 106,
        4: 121
    }
    const blockID6 = mapping6[this.iLevelType] || 39;

    this.lMap[x][y].blockID = blockID1;
    this.lMap[x][y + 1].blockID = blockID2;

    for (let i = 0; i < width; i++) {
        this.lMap[x + 1 + i][y].blockID = blockID3;
        this.lMap[x + 1 + i][y + 1].blockID = blockID4;
    }

    this.lMap[x + 1 + width][y].blockID = blockID5;
    this.lMap[x + 1 + width][y + 1].blockID = blockID6;
};

map.structPipeVertical = function (x, y, height) {
    const mapping1 = {
        0: 20,
        2: 97,
        4: 112
    }
    const blockID1 = mapping1[this.iLevelType] || 30;

    const mapping2 = {
        0: 22,
        2: 99,
        4: 114
    }
    const blockID2 = mapping2[this.iLevelType] || 32;

    for (let i = 0; i < height + 1; i++) {
        this.lMap[x][y + i].blockID = blockID1;
        this.lMap[x + 1][y + i].blockID = blockID2;
    }
};

map.loadLVL_1_1 = function () {
    this.clearMap();

    this.iMapWidth = 260;
    this.iMapHeight = 25;
    this.iLevelType = 0;
    this.iMapTime = 400;

    this.createMap();

    // this.loadMinionsLVL_1_1();

    // this.loadPipeEventsLVL_1_1();

    this.structBush(0, 2, 2);
    this.structBush(16, 2, 1);
    this.structBush(48, 2, 2);
    this.structBush(64, 2, 1);
    this.structBush(96, 2, 2);
    this.structBush(112, 2, 1);
    this.structBush(144, 2, 2);
    this.structBush(160, 2, 1);
    this.structBush(192, 2, 2);
    this.structBush(208, 2, 1);

    this.structCloud(8, 10, 1);
    this.structCloud(19, 11, 1);
    this.structCloud(27, 10, 3);
    this.structCloud(36, 11, 2);
    this.structCloud(56, 10, 1);
    this.structCloud(67, 11, 1);
    this.structCloud(75, 10, 3);
    this.structCloud(84, 11, 2);
    this.structCloud(104, 10, 1);
    this.structCloud(115, 11, 1);
    this.structCloud(123, 10, 3);
    this.structCloud(132, 11, 2);
    this.structCloud(152, 10, 1);
    this.structCloud(163, 11, 1);
    this.structCloud(171, 10, 3);
    this.structCloud(180, 11, 2);
    this.structCloud(200, 10, 1);
    this.structCloud(211, 11, 1);
    this.structCloud(219, 10, 3);

    this.structGrass(11, 2, 3);
    this.structGrass(23, 2, 1);
    this.structGrass(41, 2, 2);
    this.structGrass(59, 2, 3);
    this.structGrass(71, 2, 1);
    this.structGrass(89, 2, 2);
    this.structGrass(107, 2, 3);
    this.structGrass(119, 2, 1);
    this.structGrass(137, 2, 2);
    this.structGrass(157, 2, 1);
    this.structGrass(167, 2, 1);
    this.structGrass(205, 2, 1);
    this.structGrass(215, 2, 1);


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

    this.struckBlockQ(16, 5, 1);
    this.structBrick(20, 5, 1, 1);
    this.struckBlockQ(21, 5, 1);
    this.lMap[21][5].spawnMushroom = true;
    this.structBrick(22, 5, 1, 1);
    this.struckBlockQ(22, 9, 1);
    this.struckBlockQ(23, 5, 1);
    this.structBrick(24, 5, 1, 1);

    this.struckBlockQ2(64, 6, 1);
    this.lMap[64][6].spawnMushroom = true;
    this.lMap[64][6].powerUP = false;

    this.structBrick(77, 5, 1, 1);
    this.struckBlockQ(78, 5, 1);
    this.lMap[78][5].spawnMushroom = true;
    this.structBrick(79, 5, 1, 1);

    this.structBrick(80, 9, 8, 1);
    this.structBrick(91, 9, 3, 1);
    this.struckBlockQ(94, 9, 1);
    this.structBrick(94, 5, 1, 1);
    this.lMap[94][5].numOfUse = 4;

    this.structBrick(100, 5, 2, 1);

    this.struckBlockQ(106, 5, 1);
    this.struckBlockQ(109, 5, 1);
    this.struckBlockQ(109, 9, 1);
    this.lMap[109][9].spawnMushroom = true;
    this.struckBlockQ(112, 5, 1);

    this.structBrick(118, 5, 1, 1);

    this.structBrick(121, 9, 3, 1);

    this.structBrick(128, 9, 1, 1);
    this.struckBlockQ(129, 9, 2);
    this.structBrick(131, 9, 1, 1);

    this.structBrick(129, 5, 2, 1);

    this.structBrick(168, 5, 2, 1);
    this.struckBlockQ(170, 5, 1);
    this.structBrick(171, 5, 1, 1);

    this.lMap[101][5].spawnStar = true;

    this.structPipe(28, 2, 1);
    this.structPipe(38, 2, 2);
    this.structPipe(46, 2, 3);
    this.structPipe(57, 2, 3);
    this.structPipe(163, 2, 1);
    this.structPipe(179, 2, 1);

    this.structEnd(198, 3, 9);
    this.structCastleSmall(202, 2);

    // ----- MAP 1_1_2 -----

    this.iLevelType = 1;

    this.structGND(240, 0, 17, 2);

    this.structBrick(240, 2, 1, 11);
    this.structBrick(244, 2, 7, 3);
    this.structBrick(244, 12, 7, 1);

    this.structPipeVertical(255, 2, 10);
    this.structPipeHorizontal(253, 2, 1);

    this.structCoins(244, 5, 7, 1);
    this.structCoins(244, 7, 7, 1);
    this.structCoins(245, 9, 5, 1);

    // ----- END LEVEL

    this.iLevelType = 0;
};

map.loadLVL_1_2 = function () {

};

map.loadLVL_1_3 = function () {

};

map.loadLVL_1_4 = function () {

};
