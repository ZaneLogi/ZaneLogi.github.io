import { Sprite } from "./sprite.js";

class Block {
  #sprite;
  #blockID;
  #collision;
  #death;
  #use;
  #visible;

  constructor(blockID, sprite, collision, death, use, visible) {
    this.#blockID = blockID || 0;
    this.#sprite = sprite;
    this.#collision = collision || false;
    this.#death = death || false;
    this.#use = use || false;
    this.#visible = visible || false;
  }

  draw(ctx, x, y) {
    this.#sprite.image.draw(ctx, x, y);
  }

  get blockID() {
    return this.#blockID;
  }

  set blockID(value) {
    this.#blockID = value;
  }

  get sprite() {
    return this.#sprite;
  }

  get collision() {
    return this.#collision;
  }

  get death() {
    return this.#death;
  }

  get use() {
    return this.#use;
  }

  get visible() {
    return this.#visible;
  }
}

export const blocks = new Array(183);

// blockID, sprite, collision, death, use, visible

blocks[0] = new Block(0, new Sprite(["transp"], [0], false), false, true, false, false);
blocks[1] = new Block(1, new Sprite(["gnd_red_1"], [0], false), true, false, true, true);

blocks[3] = new Block(3, new Sprite(["bush_center_0"], [0], false), false, false, false, true);
blocks[4] = new Block(4, new Sprite(["bush_center_1"], [0], false), false, false, false, true);
blocks[5] = new Block(5, new Sprite(["bush_left"], [0], false), false, false, false, true);
blocks[6] = new Block(6, new Sprite(["bush_right"], [0], false), false, false, false, true);
blocks[7] = new Block(7, new Sprite(["bush_top"], [0], false), false, false, false, true);
blocks[8] = new Block(8,
  new Sprite(["blockq_0", "blockq_2", "blockq_1", "blockq_2"], [300, 30, 130, 140], false),
  true, false, true, true);

blocks[10] = new Block(10, new Sprite(["grass_left"], [0], false), false, false, false, true);
blocks[11] = new Block(11, new Sprite(["grass_center"], [0], false), false, false, false, true);
blocks[12] = new Block(12, new Sprite(["grass_right"], [0], false), false, false, false, true);
blocks[13] = new Block(13, new Sprite(["brickred"], [0], false), true, false, true, true);
blocks[14] = new Block(14, new Sprite(["cloud_left_bot"], [0], false), false, false, false, true);
blocks[15] = new Block(15, new Sprite(["cloud_left_top"], [0], false), false, false, false, true);
blocks[16] = new Block(16, new Sprite(["cloud_center_bot"], [0], false), false, false, false, true);
blocks[17] = new Block(17, new Sprite(["cloud_center_top"], [0], false), false, false, false, true);
blocks[18] = new Block(18, new Sprite(["cloud_right_bot"], [0], false), false, false, false, true);
blocks[19] = new Block(19, new Sprite(["cloud_right_top"], [0], false), false, false, false, true);
blocks[20] = new Block(20, new Sprite(["pipe_left_bot"], [0], false), true, false, false, true);
blocks[21] = new Block(21, new Sprite(["pipe_left_top"], [0], false), true, false, true, true);
blocks[22] = new Block(22, new Sprite(["pipe_right_bot"], [0], false), true, false, false, true);
blocks[23] = new Block(23, new Sprite(["pipe_right_top"], [0], false), true, false, true, true);
// ----- 24 BlockQ2 -----
blocks[24] = new Block(24, new Sprite(["transp"], [0], false), true, false, true, false);
blocks[25] = new Block(25, new Sprite(["gnd_red2"], [0], false), true, false, false, true);
blocks[26] = new Block(26, new Sprite(["gnd1"], [0], false), true, false, false, true);
blocks[27] = new Block(27, new Sprite(["gnd1_2"], [0], false), true, false, false, true);
blocks[28] = new Block(28, new Sprite(["brick1"], [0], false), true, false, true, true);
blocks[29] = new Block(29,
  new Sprite(["coin_use0", "coin_use2", "coin_use1", "coin_use2"], [300, 30, 130, 140], false),
  false, false, true, true);
blocks[30] = new Block(30, new Sprite(["pipe1_left_bot"], [0], false), true, false, false, true);
blocks[31] = new Block(31, new Sprite(["pipe1_left_top"], [0], false), true, false, true, true);
blocks[32] = new Block(32, new Sprite(["pipe1_right_bot"], [0], false), true, false, false, true);
blocks[33] = new Block(33, new Sprite(["pipe1_right_top"], [0], false), true, false, true, true);
blocks[34] = new Block(34, new Sprite(["pipe1_hor_bot_right"], [0], false), true, false, false, true);
blocks[35] = new Block(35, new Sprite(["pipe1_hor_top_center"], [0], false), true, false, false, true);
blocks[36] = new Block(36, new Sprite(["pipe1_hor_top_left"], [0], false), true, false, true, true);
blocks[37] = new Block(37, new Sprite(["pipe1_hor_bot_center"], [0], false), true, false, false, true);
blocks[38] = new Block(38, new Sprite(["pipe1_hor_bot_left"], [0], false), true, false, true, true);
blocks[39] = new Block(39, new Sprite(["pipe1_hor_top_right"], [0], false), true, false, false, true);
blocks[40] = new Block(40, new Sprite(["end0_l"], [0], false), false, false, true, true);
blocks[41] = new Block(41, new Sprite(["end0_dot"], [0], false), false, false, true, true);
blocks[42] = new Block(42, new Sprite(["end0_flag"], [0], false), false, false, false, true);
blocks[43] = new Block(43, new Sprite(["castle0_brick"], [0], false), false, false, false, true);
blocks[44] = new Block(44, new Sprite(["castle0_top0"], [0], false), false, false, false, true);
blocks[45] = new Block(45, new Sprite(["castle0_top1"], [0], false), false, false, false, true);
blocks[46] = new Block(46, new Sprite(["castle0_center_center_top"], [0], false), false, false, false, true);
blocks[47] = new Block(47, new Sprite(["castle0_center_center"], [0], false), false, false, false, true);
blocks[48] = new Block(48, new Sprite(["castle0_center_left"], [0], false), false, false, false, true);
blocks[49] = new Block(49, new Sprite(["castle0_center_right"], [0], false), false, false, false, true);

blocks[55] = new Block(55,
  new Sprite(["blockq1_0", "blockq1_2", "blockq1_1", "blockq1_2"], [300, 30, 130, 140], false),
  true, false, true, true);

blocks[58] = new Block(58, new Sprite(["pipe_hor_bot_right"], [0], false), true, false, false, true);
blocks[59] = new Block(59, new Sprite(["pipe_hor_top_center"], [0], false), true, false, false, true);
blocks[60] = new Block(60, new Sprite(["pipe_hor_top_left"], [0], false), true, false, true, true);
blocks[61] = new Block(61, new Sprite(["pipe_hor_bot_center"], [0], false), true, false, false, true);
blocks[62] = new Block(62, new Sprite(["pipe_hor_bot_left"], [0], false), true, false, true, true);
blocks[63] = new Block(63, new Sprite(["pipe_hor_top_right"], [0], false), true, false, false, true);




blocks[71] = new Block(71,
  new Sprite(["coin_use00", "coin_use02", "coin_use01", "coin_use02"], [300, 30, 130, 140], false),
  false, false, true, true);

blocks[73] = new Block(73,
  new Sprite(["coin_use30", "coin_use32", "coin_use31", "coin_use32"], [300, 30, 130, 140], false),
  false, false, true, true);

blocks[75] = new Block(75, new Sprite(["gnd_4"], [0], false), true, false, true, true);

blocks[81] = new Block(81, new Sprite(["brick2"], [0], false), true, false, true, true);

blocks[92] = new Block(92, new Sprite(["uw_0"], [0], false), true, false, true, true);

blocks[97] = new Block(97, new Sprite(["pipe2_left_bot"], [0], false), true, false, false, true);
blocks[98] = new Block(98, new Sprite(["pipe2_left_top"], [0], false), true, false, true, true);
blocks[99] = new Block(99, new Sprite(["pipe2_right_bot"], [0], false), true, false, false, true);
blocks[100] = new Block(100, new Sprite(["pipe2_right_top"], [0], false), true, false, true, true);
blocks[101] = new Block(101, new Sprite(["pipe2_hor_bot_right"], [0], false), true, false, false, true);
blocks[102] = new Block(102, new Sprite(["pipe2_hor_top_center"], [0], false), true, false, false, true);
blocks[103] = new Block(103, new Sprite(["pipe2_hor_top_left"], [0], false), true, false, true, true);
blocks[104] = new Block(104, new Sprite(["pipe2_hor_bot_center"], [0], false), true, false, false, true);
blocks[105] = new Block(105, new Sprite(["pipe2_hor_bot_left"], [0], false), true, false, true, true);
blocks[106] = new Block(106, new Sprite(["pipe2_hor_top_right"], [0], false), true, false, false, true);



blocks[112] = new Block(112, new Sprite(["pipe3_left_bot"], [0], false), true, false, false, true);
blocks[113] = new Block(113, new Sprite(["pipe3_left_top"], [0], false), true, false, true, true);
blocks[114] = new Block(114, new Sprite(["pipe3_right_bot"], [0], false), true, false, false, true);
blocks[115] = new Block(115, new Sprite(["pipe3_right_top"], [0], false), true, false, true, true);
blocks[116] = new Block(116, new Sprite(["pipe3_hor_bot_right"], [0], false), true, false, false, true);
blocks[117] = new Block(117, new Sprite(["pipe3_hor_top_center"], [0], false), true, false, false, true);
blocks[118] = new Block(118, new Sprite(["pipe3_hor_top_left"], [0], false), true, false, true, true);
blocks[119] = new Block(119, new Sprite(["pipe3_hor_bot_center"], [0], false), true, false, false, true);
blocks[120] = new Block(120, new Sprite(["pipe3_hor_bot_left"], [0], false), true, false, true, true);
blocks[121] = new Block(121, new Sprite(["pipe3_hor_top_right"], [0], false), true, false, false, true);

blocks[123] = new Block(123, new Sprite(["end1_l"], [0], false), false, false, true, true);
blocks[124] = new Block(124, new Sprite(["end1_dot"], [0], false), false, false, true, true);


blocks[136] = new Block(136, new Sprite(["pipe4_left_bot"], [0], false), true, false, false, true);
blocks[137] = new Block(137, new Sprite(["pipe4_left_top"], [0], false), true, false, true, true);
blocks[138] = new Block(138, new Sprite(["pipe4_right_bot"], [0], false), true, false, false, true);
blocks[139] = new Block(139, new Sprite(["pipe4_right_top"], [0], false), true, false, true, true);


blocks[148] = new Block(148, new Sprite(["cloud_left_bot1"], [0], false), false, false, false, true);
blocks[149] = new Block(149, new Sprite(["cloud_center_bot1"], [0], false), false, false, false, true);
blocks[150] = new Block(150, new Sprite(["cloud_center_top1"], [0], false), false, false, false, true);

blocks[155] = new Block(155, new Sprite(["castle1_brick"], [0], false), false, false, false, true);
blocks[156] = new Block(156, new Sprite(["castle1_top0"], [0], false), false, false, false, true);
blocks[157] = new Block(157, new Sprite(["castle1_top1"], [0], false), false, false, false, true);
blocks[158] = new Block(158, new Sprite(["castle1_center_center_top"], [0], false), false, false, false, true);
blocks[159] = new Block(159, new Sprite(["castle1_center_center"], [0], false), false, false, false, true);
blocks[160] = new Block(160, new Sprite(["castle1_center_left"], [0], false), false, false, false, true);
blocks[161] = new Block(161, new Sprite(["castle1_center_right"], [0], false), false, false, false, true);




blocks[166] = new Block(166, new Sprite(["gnd2"], [0], false), true, false, false, true);
blocks[167] = new Block(167, new Sprite(["gnd2_2"], [0], false), true, false, false, true);
blocks[168] = new Block(168, new Sprite(["end1_flag"], [0], false), false, false, false, true);

blocks[172] = new Block(172, new Sprite(["pipe5_left_bot"], [0], false), true, false, false, true);
blocks[173] = new Block(173, new Sprite(["pipe5_left_top"], [0], false), true, false, true, true);
blocks[174] = new Block(174, new Sprite(["pipe5_right_bot"], [0], false), true, false, false, true);
blocks[175] = new Block(175, new Sprite(["pipe5_right_top"], [0], false), true, false, true, true);
blocks[176] = new Block(176, new Sprite(["pipe6_left_bot"], [0], false), true, false, false, true);
blocks[177] = new Block(177, new Sprite(["pipe6_left_top"], [0], false), true, false, true, true);
blocks[178] = new Block(178, new Sprite(["pipe6_right_bot"], [0], false), true, false, false, true);
blocks[179] = new Block(179, new Sprite(["pipe6_right_top"], [0], false), true, false, true, true);


blocks[181] = new Block(181, new Sprite(["gnd_5"], [0], false), true, false, false, true);
// ----- 182 ----- ENDUSE
blocks[182] = new Block(182, new Sprite(["transp"], [0], false), true, false, true, false);
