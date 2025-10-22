import { MapLevel } from "./map_level.js";

function buildBlockQ(map, levelType, x, y, width) {
  const mapping = {
    0: 8,
    4: 8,
  }
  const blockID = mapping[levelType] || 55;

  for (let i = 0; i < width; i++) {
    map[x + i][y].blockID = blockID;
  }
}

function buildBlockQ2(map, levelType, x, y, width) {
  for (let i = 0; i < width; i++) {
    map[x + i][y].blockID = 24;
  }
}

function buildBrick(map, levelType, x, y, width, height) {
  const mapping = {
    0: 13,
    3: 81,
    4: 13,
  }
  const blockID = mapping[levelType] || 28;

  for (let i = 0; i < width; i++) {
    for (let j = 0; j < height; j++) {
      map[x + i][y + j].blockID = blockID;
    }
  }
}

function buildBush(map, levelType, x, y, size) {
  // ----- LEFT & RIGHT
  for (let i = 0; i < size; i++) {
    map[x + i][y + i].blockID = 5;
    map[x + size + 1 + i][y + size - 1 - i].blockID = 6;
  }

  // ----- CENTER LEFT & RIGHT
  for (let i = 0, k = 1; i < size - 1; i++) {
    for (let j = 0; j < k; j++) {
      map[x + 1 + i][y + j].blockID = (i % 2 == 0 ? 3 : 4);
      map[x + size * 2 - 1 - i][y + j].blockID = (i % 2 == 0 ? 3 : 4);
    }
    ++k;
  }

  // ----- CENTER
  for (let i = 0; i < size; i++) {
    map[x + size][y + i].blockID = (i % 2 == 0 && size != 1 ? 4 : 3);
  }

  // ----- TOP
  map[x + size][y + size].blockID = 7;
}

function buildCastleSmall(map, levelType, x, y) {
  const blockID1 = (levelType == 3 ? 155 : 43);
  const blockID2 = (levelType == 3 ? 159 : 47);
  const blockID3 = (levelType == 3 ? 158 : 46);
  const blockID4 = (levelType == 3 ? 157 : 45);
  const blockID5 = (levelType == 3 ? 156 : 44);
  const blockID6 = (levelType == 3 ? 160 : 48);
  const blockID7 = (levelType == 3 ? 161 : 49);

  for (let i = 0; i < 2; i++) {
    map[x][y + i].blockID = blockID1;
    map[x + 1][y + i].blockID = blockID1;
    map[x + 3][y + i].blockID = blockID1;
    map[x + 4][y + i].blockID = blockID1;

    map[x + 2][y + i].blockID = blockID2;
  }

  map[x + 2][y + 1].blockID = blockID3;

  for (let i = 0; i < 5; i++) {
    map[x + i][y + 2].blcokID = (i == 0 || i == 4 ? blockID4 : blockID5);
  }

  map[x + 1][y + 3].blockID = blockID6;
  map[x + 2][y + 3].blockID = blockID1;
  map[x + 3][y + 3].blockID = blockID7;

  for (let i = 0; i < 3; i++) {
    map[x + i + 1][y + 4].blockID = blockID4;
  }
}

function buildCloud(map, levelType, x, y, size) {
  // ----- LEFT
  map[x][y].blockID = (levelType == 3 ? 148 : 14);
  map[x][y + 1].blockID = 15;

  for (let i = 0; i < size; i++) {
    map[x + 1 + i][y].blockID = (levelType == 3 ? 149 : 16);
    map[x + 1 + i][y + 1].blockID = (levelType == 3 ? 150 : 17);
  }

  map[x + size + 1][y].blockID = 18;
  map[x + size + 1][y + 1].blockID = 19;
}

function buildCoins(map, levelType, x, y, width, height) {
  const mapping = {
    0: 71,
    1: 29,
    2: 73,
    4: 71,
  }
  const blockID = mapping[levelType] || 29;

  for (let i = 0; i < width; i++) {
    for (let j = 0; j < height; j++) {
      map[x + i][y + j].blockID = blockID;
    }
  }
}

function buildEnd(map, levelType,x, y, height) {
  const blockID1 = (levelType == 4 ? 123 : 40);
  for (let i = 0; i < height; i++) {
    map[x][y + i].blockID = blockID1;
  }

  // TODO: oFlag = new Flag(x * 32 - 16, y + height + 72);

  const blockID2 = (levelType == 4 ? 124 : 41);
  map[x][y + height].blockID = blockID2;

  for (let i = y + height + 1; i < y + height + 4; i++) {
    map[x][i].blockID = 182;
  }
}

function buildGround(map, levelType, x, y, w, h) {
  const mapping = {
    0: 1,
    1: 26,
    2: 92,
    4: 1,
    6: 166,
    7: 181,
  }
  const blockID = mapping[levelType] || 75;

  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      map[x + i][y + j].blockID = blockID;
    }
  }
}

// ----- true = LEFT, false = RIGHT -----
function buildGround2Dir(map, levelType, x, y, size, dir) {
  const mapping = {
    0: 25,
    3: 167,
    4: 25,
  }
  const blockID = mapping[levelType] || 27;

  if (dir) {
    for (let i = 0, k = 1; i < size; i++) {
      for (let j = 0; j < k; j++) {
        map[x + i][y + j].blockID = blockID;
      }
      ++k;
    }
  } else {
    for (let i = 0, k = 1; i < size; i++) {
      for (let j = 0; j < k; j++) {
        map[x + size - 1 - i][y + j].blockID = blockID;
      }
      ++k;
    }
  }
}

function buildGround2(map, levelType, x, y, w, h) {
  const mapping = {
    0: 25,
    3: 167,
    4: 25,
  }
  const blockID = mapping[levelType] || 27;

  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      map[x + i][y + j].blockID = blockID;
    }
  }
}

function buildGrass(map, levelType, x, y, size) {
  map[x][y].blockID = 10;
  for (let i = 0; i < size; i++) {
    map[x + 1 + i][y].blockID = 11;
  }
  map[x + size + 1][y].blockID = 12;
}

function buildPipe(map, levelType, x, y, height) {
  const mapping1 = {
    0: 20,
    2: 97,
    3: 176,
    4: 112,
    5: 136,
    7: 172
  }
  const blockID1 = mapping1[levelType] || 30;

  const mapping2 = {
    0: 22,
    2: 99,
    3: 178,
    4: 114,
    5: 138,
    7: 174
  }
  const blockID2 = mapping2[levelType] || 32;

  const mapping3 = {
    0: 21,
    2: 98,
    3: 177,
    4: 113,
    5: 137,
    7: 173
  }
  const blockID3 = mapping3[levelType] || 31;

  const mapping4 = {
    0: 23,
    2: 100,
    3: 179,
    4: 115,
    5: 139,
    7: 175
  }
  const blockID4 = mapping4[levelType] || 33;

  for (let i = 0; i < height; i++) {
    map[x][y + i].blockID = blockID1;
    map[x + 1][y + i].blockID = blockID2;
  }

  map[x][y + height].blockID = blockID3;
  map[x + 1][y + height].blockID = blockID4;
}

function buildPipeHorizontal(map, levelType, x, y, width) {
  const mapping1 = {
    0: 62,
    2: 105,
    4: 120
  }
  const blockID1 = mapping1[levelType] || 38;

  const mapping2 = {
    0: 60,
    2: 103,
    4: 118
  }
  const blockID2 = mapping2[levelType] || 36;

  const mapping3 = {
    0: 61,
    2: 104,
    4: 119
  }
  const blockID3 = mapping3[levelType] || 37;

  const mapping4 = {
    0: 59,
    2: 102,
    4: 117
  }
  const blockID4 = mapping4[levelType] || 35;

  const mapping5 = {
    0: 58,
    2: 101,
    4: 116
  }
  const blockID5 = mapping5[levelType] || 34;

  const mapping6 = {
    0: 63,
    2: 106,
    4: 121
  }
  const blockID6 = mapping6[levelType] || 39;

  map[x][y].blockID = blockID1;
  map[x][y + 1].blockID = blockID2;

  for (let i = 0; i < width; i++) {
    map[x + 1 + i][y].blockID = blockID3;
    map[x + 1 + i][y + 1].blockID = blockID4;
  }

  map[x + 1 + width][y].blockID = blockID5;
  map[x + 1 + width][y + 1].blockID = blockID6;
}

function buildPipeVertical(map, levelType, x, y, height) {
  const mapping1 = {
    0: 20,
    2: 97,
    4: 112
  }
  const blockID1 = mapping1[levelType] || 30;

  const mapping2 = {
    0: 22,
    2: 99,
    4: 114
  }
  const blockID2 = mapping2[levelType] || 32;

  for (let i = 0; i < height + 1; i++) {
    map[x][y + i].blockID = blockID1;
    map[x + 1][y + i].blockID = blockID2;
  }
}

function createMap(mapWidth, mapHeight) {
  // TODO mionion list

  // build [mapWidth][mapHeight]
  return Array.from({ length: mapWidth }, () =>
    Array.from({ length: mapHeight }, () => new MapLevel(0))
  );
}

function loadLVL_1_1() {
    const map = createMap(260, 25);
    map.levelType = 0;
    map.underWater = false;
    map.bTP = false;
    map.mapWidth = 260;
    map.mapHeight = 25;
    map.mapTime = 400;

    let levelType = 0;

    // this.loadMinionsLVL_1_1();

    // this.loadPipeEventsLVL_1_1();

    buildBush(map, levelType, 0, 2, 2);
    buildBush(map, levelType, 16, 2, 1);
    buildBush(map, levelType, 48, 2, 2);
    buildBush(map, levelType, 64, 2, 1);
    buildBush(map, levelType, 96, 2, 2);
    buildBush(map, levelType, 112, 2, 1);
    buildBush(map, levelType, 144, 2, 2);
    buildBush(map, levelType, 160, 2, 1);
    buildBush(map, levelType, 192, 2, 2);
    buildBush(map, levelType, 208, 2, 1);

    buildCloud(map, levelType, 8, 10, 1);
    buildCloud(map, levelType, 19, 11, 1);
    buildCloud(map, levelType, 27, 10, 3);
    buildCloud(map, levelType, 36, 11, 2);
    buildCloud(map, levelType, 56, 10, 1);
    buildCloud(map, levelType, 67, 11, 1);
    buildCloud(map, levelType, 75, 10, 3);
    buildCloud(map, levelType, 84, 11, 2);
    buildCloud(map, levelType, 104, 10, 1);
    buildCloud(map, levelType, 115, 11, 1);
    buildCloud(map, levelType, 123, 10, 3);
    buildCloud(map, levelType, 132, 11, 2);
    buildCloud(map, levelType, 152, 10, 1);
    buildCloud(map, levelType, 163, 11, 1);
    buildCloud(map, levelType, 171, 10, 3);
    buildCloud(map, levelType, 180, 11, 2);
    buildCloud(map, levelType, 200, 10, 1);
    buildCloud(map, levelType, 211, 11, 1);
    buildCloud(map, levelType, 219, 10, 3);

    buildGrass(map, levelType, 11, 2, 3);
    buildGrass(map, levelType, 23, 2, 1);
    buildGrass(map, levelType, 41, 2, 2);
    buildGrass(map, levelType, 59, 2, 3);
    buildGrass(map, levelType, 71, 2, 1);
    buildGrass(map, levelType, 89, 2, 2);
    buildGrass(map, levelType, 107, 2, 3);
    buildGrass(map, levelType, 119, 2, 1);
    buildGrass(map, levelType, 137, 2, 2);
    buildGrass(map, levelType, 157, 2, 1);
    buildGrass(map, levelType, 167, 2, 1);
    buildGrass(map, levelType, 205, 2, 1);
    buildGrass(map, levelType, 215, 2, 1);


    buildGround(map, levelType, 0, 0, 69, 2);
    buildGround(map, levelType, 71, 0, 15, 2);
    buildGround(map, levelType, 89, 0, 64, 2);
    buildGround(map, levelType, 155, 0, 85, 2);

    buildGround2Dir(map, levelType, 134, 2, 4, true);
    buildGround2Dir(map, levelType, 140, 2, 4, false);
    buildGround2Dir(map, levelType, 148, 2, 4, true);
    buildGround2(map, levelType, 152, 2, 1, 4);
    buildGround2Dir(map, levelType, 155, 2, 4, false);
    buildGround2Dir(map, levelType, 181, 2, 8, true);
    buildGround2(map, levelType, 189, 2, 1, 8);
    buildGround2(map, levelType, 198, 2, 1, 1);

    buildBlockQ(map, levelType, 16, 5, 1);
    buildBrick(map, levelType, 20, 5, 1, 1);
    buildBlockQ(map, levelType, 21, 5, 1);
    map[21][5].spawnMushroom = true;
    buildBrick(map, levelType, 22, 5, 1, 1);
    buildBlockQ(map, levelType, 22, 9, 1);
    buildBlockQ(map, levelType, 23, 5, 1);
    buildBrick(map, levelType, 24, 5, 1, 1);

    buildBlockQ2(map, levelType, 64, 6, 1);
    map[64][6].spawnMushroom = true;
    map[64][6].powerUP = false;

    buildBrick(map, levelType, 77, 5, 1, 1);
    buildBlockQ(map, levelType, 78, 5, 1);
    map[78][5].spawnMushroom = true;
    buildBrick(map, levelType, 79, 5, 1, 1);

    buildBrick(map, levelType, 80, 9, 8, 1);
    buildBrick(map, levelType, 91, 9, 3, 1);
    buildBlockQ(map, levelType, 94, 9, 1);
    buildBrick(map, levelType, 94, 5, 1, 1);
    map[94][5].numOfUse = 4;

    buildBrick(map, levelType, 100, 5, 2, 1);

    buildBlockQ(map, levelType, 106, 5, 1);
    buildBlockQ(map, levelType, 109, 5, 1);
    buildBlockQ(map, levelType, 109, 9, 1);
    map[109][9].spawnMushroom = true;
    buildBlockQ(map, levelType, 112, 5, 1);

    buildBrick(map, levelType, 118, 5, 1, 1);

    buildBrick(map, levelType, 121, 9, 3, 1);

    buildBrick(map, levelType, 128, 9, 1, 1);
    buildBlockQ(map, levelType, 129, 9, 2);
    buildBrick(map, levelType, 131, 9, 1, 1);

    buildBrick(map, levelType, 129, 5, 2, 1);

    buildBrick(map, levelType, 168, 5, 2, 1);
    buildBlockQ(map, levelType, 170, 5, 1);
    buildBrick(map, levelType, 171, 5, 1, 1);

    map[101][5].spawnStar = true;

    buildPipe(map, levelType, 28, 2, 1);
    buildPipe(map, levelType, 38, 2, 2);
    buildPipe(map, levelType, 46, 2, 3);
    buildPipe(map, levelType, 57, 2, 3);
    buildPipe(map, levelType, 163, 2, 1);
    buildPipe(map, levelType, 179, 2, 1);

    buildEnd(map, levelType, 198, 3, 9);
    buildCastleSmall(map, levelType, 202, 2);

    // ----- MAP 1_1_2 -----

    levelType = 1;

    buildGround(map, levelType, 240, 0, 17, 2);

    buildBrick(map, levelType, 240, 2, 1, 11);
    buildBrick(map, levelType, 244, 2, 7, 3);
    buildBrick(map, levelType, 244, 12, 7, 1);

    buildPipeVertical(map, levelType, 255, 2, 10);
    buildPipeHorizontal(map, levelType, 253, 2, 1);

    buildCoins(map, levelType, 244, 5, 7, 1);
    buildCoins(map, levelType, 244, 7, 7, 1);
    buildCoins(map, levelType, 245, 9, 5, 1);

    // ----- END LEVEL
    levelType = 0;

    return map;
}

function loadLVL_1_2() {

}

function loadLVL_1_3() {

}

function loadLVL_1_4() {

}

export const levels = [
  loadLVL_1_1, loadLVL_1_2, loadLVL_1_3, loadLVL_1_4,
  /*loadLVL_2_1, loadLVL_2_2, loadLVL_2_3, loadLVL_2_4,
  loadLVL_3_1, loadLVL_3_2, loadLVL_3_3, loadLVL_3_4,
  loadLVL_4_1, loadLVL_4_2, loadLVL_4_3, loadLVL_4_4,
  loadLVL_5_1, loadLVL_5_2, loadLVL_5_3, loadLVL_5_4,
  loadLVL_6_1, loadLVL_6_2, loadLVL_6_3, loadLVL_6_4,
  loadLVL_7_1, loadLVL_7_2, loadLVL_7_3, loadLVL_7_4,
  loadLVL_8_1, loadLVL_8_2, loadLVL_8_3, loadLVL_8_4,*/
]