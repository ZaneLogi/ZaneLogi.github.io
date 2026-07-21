// constants.js — the design constants (§3.2 lanes, §3.4 timers, §4 render, §6 values).
// Figures are tuned by feel; the model is fixed. Everything is frame-based (~60 Hz, §7).

export const SCREEN = { WIDTH: 224, HEIGHT: 256, PLAY_TOP: 16, PLAY_BOTTOM: 231, CELL: 16 };

export const TICK = { HZ: 60 };

// The frog: hop = a smooth 8-frame slide at 2 px/frame over one 16 px cell (§6).
export const FROG = { SPAWN_X: 104, HOP_FRAMES: 8, HOP_PX: 2 };

// Death = the 7-frame explosion death_0..5 → skull (§3.5); per-frame duration tunable.
export const DEATH = { FRAME_HOLD: 8 };

// Timer: 60 beats, one drains every 30 frames (~30 s); red warning near the end (§6, §4.1).
export const TIMER = { BEATS: 60, FRAMES_PER_BEAT: 30, WARNING_AT: 12, BONUS_PER_BEAT: 10 };

export const SCORE = {
  HOP: 10, HOME: 50, BONUS: 200, ALL_HOMES: 1000, EXTRA_LIFE: 20000, START_LIVES: 3,
};

// Timed events — fixed periods, no RNG (§3.4).
export const TIMED = {
  T_DIVE: 240, T_MOUTH: 120, T_BAY: 256, T_BAYCROC: 120, T_LADY: 512, T_OTTER: 256,
  BAY_ORDER: [2, 0, 3, 1, 4],            // the bay-item walk order
  OTTER_LANES: ['river1', 'river3', 'river4'],  // roams the log lanes, in order
  LADY_LANE: 'river4',
};

export const WRAP_L = 240;   // shared off-screen wrap length (§3.2)

// Lanes top → bottom. dir +1 = drifts right, -1 = left. phase φ = index × 20 (§3.2).
// w = object width px, n = count, v = px/frame at level 1.
export const LANES = [
  { id: 'river1', band: 'river',  object: 'log',    sprite: 'log_2',     w: 48, n: 3, v: 0.35, dir: +1, croc: true },
  { id: 'river2', band: 'river',  object: 'turtle', sprite: 'turtle_0',  w: 48, n: 3, v: 0.30, dir: -1, dives: true },
  { id: 'river3', band: 'river',  object: 'log',    sprite: 'log_1',     w: 64, n: 2, v: 0.20, dir: +1 },
  { id: 'river4', band: 'river',  object: 'log',    sprite: 'log_0',     w: 32, n: 4, v: 0.45, dir: -1 },
  { id: 'river5', band: 'river',  object: 'turtle', sprite: 'turtle_0',  w: 32, n: 4, v: 0.30, dir: +1, dives: true },
  { id: 'median', band: 'median', object: 'snake',  sprite: 'snake_0',   w: 16, n: 1, v: 0.25, dir: -1, safe: true },
  { id: 'road1',  band: 'road',   object: 'truck',  sprite: 'truck',     w: 32, n: 2, v: 0.20, dir: -1 },
  { id: 'road2',  band: 'road',   object: 'car',    sprite: 'car_green', w: 16, n: 3, v: 0.30, dir: +1 },
  { id: 'road3',  band: 'road',   object: 'car',    sprite: 'car_pink',  w: 16, n: 3, v: 0.25, dir: -1 },
  { id: 'road4',  band: 'road',   object: 'dozer',  sprite: 'dozer',     w: 16, n: 3, v: 0.20, dir: +1 },
  { id: 'road5',  band: 'road',   object: 'car',    sprite: 'car_red',   w: 16, n: 2, v: 0.45, dir: -1 },
];

// Row geometry (16 px cells, home hedge 24 px). Refined against the atlas during impl.
export const ROWS = { HOME_Y: 16, LANE_H: 16, FIRST_LANE_Y: 40, START_Y: 216 };

// HUD positions in px for the 224×256 screen (§4.1), tunable.
export const HUD = {
  ONE_UP: [16, 1], SCORE: [16, 9], HI_LABEL: [88, 1], HI_VALUE: [88, 9],
  LIVES: [8, 234], LIVES_STEP: 16,
  TIMER_BAR: [8, 249], TIMER_W: 176, TIME_LABEL: [188, 248],
  LEVEL_END: [216, 234],
};

export const HOMES = { COUNT: 5, LAND_TOLERANCE: 6, BAY_Y: 16 };
