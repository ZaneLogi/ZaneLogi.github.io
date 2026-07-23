// constants.js — the design constants (§3.2 lanes, §3.4 timers, §4 render, §6 values).
// Figures are tuned by feel; the model is fixed. Everything is frame-based (~60 Hz, §7).

export const SCREEN = { WIDTH: 224, HEIGHT: 256, PLAY_TOP: 24, PLAY_BOTTOM: 239, CELL: 16 };

export const TICK = { HZ: 60 };

// The frog: a hop is a smooth HOP_FRAMES-frame slide at HOP_PX/frame over one 16 px cell. It
// spawns on the start row (row 0), horizontally centred (sprite left 104 → centre 112 =
// mid-screen), facing up. Horizontal hops move x on the 8-offset column grid (8…200, so the
// 16 px frog stays fully on screen); vertical hops step the row index (0…MAX_ROW), y from
// ROWS.ANCHOR_Y — uniform 16 px, since every playfield row (lanes + both safe strips) is 16 px.
export const FROG = { SPAWN_X: 104, HOP_FRAMES: 8, HOP_PX: 2, MIN_X: 8, MAX_X: 200, LADY_DY: 5 };

// Frog frame ↔ (facing × rest/hop), derived from the atlas (§3.5): frog_0..7 are (rest, hop)
// pairs in the order up, left, down, right. Rest = legs tucked; hop = legs kicked out (shown
// during the slide). [0] = rest (landed), [1] = hop (in transit).
export const FROG_FRAMES = {
  up:    ['frog_0', 'frog_1'],
  left:  ['frog_2', 'frog_3'],
  down:  ['frog_4', 'frog_5'],
  right: ['frog_6', 'frog_7'],
};

// One-cell unit steps per hop direction (multiplied by CELL).
export const HOP_DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// Dev scaffolding (marked non-source): a faint per-row grid to make the lanes legible. Off now
// that the movers (step 2) fill the field; flip on to debug row geometry.
export const DEBUG = { ROW_GRID: false };

// Dev-only overrides (marked non-source), from the URL query — testing aids. `?level=N` sets the
// starting level (clamped [1, 20], default 1); `?lives=N` sets the STARTING lives (clamped [1, 10],
// default 3 — the in-game count can still rise past 10 via the extra life, capped at LIVES.MAX below);
// `?beat=N` sets the timer's FRAMES_PER_BEAT — how many frames drain one beat (clamped [1, 300],
// default 30; lower = the countdown runs out faster). Guarded so a non-browser import doesn't touch
// `location`.
const _q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const _int = (k) => (_q ? parseInt(_q.get(k), 10) : NaN);
export const DEV = {
  START_LEVEL: Math.min(20, Math.max(1, _int('level') || 1)),
  START_LIVES: Math.min(10, Math.max(1, _int('lives') || 3)),
  FRAMES_PER_BEAT: Math.min(300, Math.max(1, _int('beat') || 30)),
};

// Death = the 7-frame explosion death_0..5 → skull (§3.5); per-frame duration tunable.
export const DEATH = { FRAME_HOLD: 8 };

// Timer: 60 beats, one drains every FRAMES_PER_BEAT frames (default 30 → ~30 s; the `?beat=` dev
// override sets it); red warning near the end (§6, §4.1).
export const TIMER = { BEATS: 60, FRAMES_PER_BEAT: DEV.FRAMES_PER_BEAT, WARNING_AT: 12, BONUS_PER_BEAT: 10 };

export const SCORE = {
  HOP: 10, HOME: 50, BONUS: 200, ALL_HOMES: 1000, EXTRA_LIFE: 20000,
};

// Lives caps: the in-game count (start DEV.START_LIVES, plus the extra life at SCORE.EXTRA_LIFE) is
// capped at MAX; the HUD draws at most HUD_MAX reserve icons (more would reach the level markers, §4.1).
export const LIVES = { MAX: 99, HUD_MAX: 10 };

// Timed events — fixed periods, no RNG (§3.4).
export const TIMED = {
  T_DIVE: 240, T_MOUTH: 120, T_BAY: 350, T_BAYCROC: 324, T_LADY: 512, T_OTTER: 256,
  BAY_ORDER: [2, 0, 3, 1, 4],            // the bay-item walk order
  OTTER_LANES: ['river1', 'river3', 'river4'],  // roams the log lanes, in order
  LADY_LANE: 'river4',                   // the lady-frog rides a log in this lane
  LADY_LOG: 0,                           // which of the lane's logs she sits on (she rides it until picked up)
  CROC_LOG: 0,                           // which River-1 log becomes the crocodile (from L2)
  CROC_SLIVER: 48,                       // bay croc-head: head-down sliver (safe) frames at the start of each T_BAYCROC cycle
  CROC_OPEN: 36,                         // bay croc-head: head-up (lethal) frames after the sliver; then it disappears until the next cycle
  INSECT_SHOW: 170,                      // bonus insect: visible frames at the start of each T_BAY cycle; gone (waits) for the rest — a shorter wait (180) than the croc's (240)
  OTTER_V: 0.8,                          // otter base traversal speed (px/frame at L1) — faster than every log lane; ramps with the board (§3.3/§3.4)
  OTTER_MIN_LEVEL: 3,                    // the otter is a level-3+ hazard (§3.3)
};

// §3.3 level ramp — how the §3.2 lane numbers change as levels advance (still no RNG):
// - Speed: every lane accelerates by V(level) = V₁ × (1 + SPEED_PER_LEVEL·(level−1)), capped at
//   SPEED_CAP (2×, reached ~level 11). Nothing else about speed changes. The otter rides the same
//   factor (its OTTER_V ramps too) so it keeps overtaking the logs at every level.
// - Count: the river thins and the road thickens on a fixed per-lane schedule (COUNT_SCHEDULE),
//   one notch every couple of levels to floors/caps; because P = L/N, changing N re-derives the
//   spacing and start positions for free. Only the listed lanes change; the rest keep their base n.
// - A second diving turtle group per turtle lane switches on from DIVE_2ND_MIN_LEVEL (§3.4).
// The timer length, lives, and the extra-life threshold do NOT ramp — rising speed and thinning
// platforms are the whole ramp (§3.3).
export const RAMP = {
  SPEED_PER_LEVEL: 0.10,
  SPEED_CAP: 2.0,
  DIVE_2ND_MIN_LEVEL: 3,
  // N per lane, indexed L1, L2, L3, L4, L5, L6+ (levels past 6 hold the last value). Lanes absent
  // here keep their base n. The four representative lanes the §3.3 schedule table lists.
  COUNT_SCHEDULE: {
    river1: [3, 3, 3, 2, 2, 2],
    river4: [4, 4, 3, 3, 2, 2],
    road2:  [3, 3, 4, 4, 5, 5],
    road5:  [2, 2, 3, 3, 3, 3],
  },
};

// The §3.3 speed multiplier for a level (1× at level 1, +10% per level, capped at 2×).
export const speedFactor = (level) => Math.min(RAMP.SPEED_CAP, 1 + RAMP.SPEED_PER_LEVEL * (level - 1));

// The §3.3 mover count for a lane at a level: its scheduled value if the lane is in COUNT_SCHEDULE
// (clamped to the last column past L6), else its base n.
export const laneCount = (id, baseN, level) => {
  const sched = RAMP.COUNT_SCHEDULE[id];
  return sched ? sched[Math.min(Math.max(level, 1), sched.length) - 1] : baseN;
};

export const WRAP_L = 240;   // shared off-screen wrap length (§3.2)

// An object's sprite composition, laid out left→right across its width W: `body` fills the
// middle (tiled at its own width), with optional 16 px end-cap sprites `left`/`right`. Each part
// is a single sprite (static) OR a frame LIST that cosmetically cycles at ANIM.RATE (§3.5).
// - A log is three static parts: rounded left end `log_0`, repeating body `log_1`, tree-ring
//   right end `log_2` — a longer log just gets more body tiles (§3.1).
// - A turtle group is a body-only animated swim loop; its diving group submerges to the lane's
//   `dive` frames on the §3.4 dive timer (behavior lands in step 6; the frames live here now).
// - The median snake is an animated 32 px body; it enters at an edge as a hazard from L2 (§3.3/
//   §3.4) rather than as a fixed conveyor, so the median lane isn't seeded yet.
const LOG = { left: 'log_0', body: 'log_1', right: 'log_2' };
const TURTLE = { body: ['turtle_0', 'turtle_1', 'turtle_2'] };
const TURTLE_DIVE = ['turtle_dive_0', 'turtle_dive_1'];
const SNAKE = { body: ['snake_0', 'snake_1', 'snake_2'] };

// Sprite orientation constrains lane direction: the turtle sprite's head faces LEFT (no
// right-facing variant), so every turtle lane must drift **left**. Logs are symmetric (rounded
// left end / tree-ring right end, no "front"), so they take the opposite drift — **right** —
// keeping most adjacent lanes counter-flowing. Vehicles already face their lane's direction.

// Cosmetic frame-cycle rate: advance an animated part every RATE ticks (§3.5).
export const ANIM = { RATE: 8 };

// Lanes top → bottom. dir +1 = drifts right, -1 = left. phase φ = index × 20 (§3.2).
// w = object width px, n = count, v = px/frame at level 1. tiles = the §3.1 sprite composition;
// dive = the diving group's submerged frames (§3.4); croc = a crocodile replaces a log from L2.
export const LANES = [
  { id: 'river1', band: 'river',  object: 'log',    tiles: LOG,                  w: 48, n: 3, v: 0.35, dir: +1, croc: true },
  { id: 'river2', band: 'river',  object: 'turtle', tiles: TURTLE,               w: 48, n: 3, v: 0.30, dir: -1, dive: TURTLE_DIVE },
  { id: 'river3', band: 'river',  object: 'log',    tiles: LOG,                  w: 64, n: 2, v: 0.20, dir: +1 },
  { id: 'river4', band: 'river',  object: 'log',    tiles: LOG,                  w: 32, n: 4, v: 0.45, dir: +1 },
  { id: 'river5', band: 'river',  object: 'turtle', tiles: TURTLE,               w: 32, n: 4, v: 0.30, dir: -1, dive: TURTLE_DIVE },
  { id: 'median', band: 'median', object: 'snake',  tiles: SNAKE,                w: 32, n: 1, v: 0.25, dir: -1, safe: true },
  { id: 'road1',  band: 'road',   object: 'truck',  tiles: { body: 'truck' },    w: 32, n: 2, v: 0.20, dir: -1 },
  { id: 'road2',  band: 'road',   object: 'car',    tiles: { body: 'car_green' },w: 16, n: 3, v: 0.30, dir: +1 },
  { id: 'road3',  band: 'road',   object: 'car',    tiles: { body: 'car_pink' }, w: 16, n: 3, v: 0.25, dir: -1 },
  { id: 'road4',  band: 'road',   object: 'dozer',  tiles: { body: 'dozer' },    w: 16, n: 3, v: 0.20, dir: +1 },
  { id: 'road5',  band: 'road',   object: 'car',    tiles: { body: 'car_red' },  w: 16, n: 2, v: 0.45, dir: -1 },
];

// Row geometry — the arcade's tile-aligned bands, measured from the arcade screenshot and
// summing to 256 px: score 24 · home hedge 24 (y24…47) · five river lanes 16 (48…127) ·
// median 16 (128…143) · five road lanes 16 (144…223) · start 16 (224…239) · bottom HUD 16
// (240…255). Only the home hedge is 24 px tall; the ten moving lanes AND both bg_block safe
// strips (median, start) are 16 px.
//
// ANCHOR_Y is the frog's sprite-top per row (row 0 = start … MAX_ROW = home): a uniform 16 px
// grid `224 − row·16`, since every playfield row below the hedge is 16 px. Row 12 (home) lands
// at y32, in the hedge band (24…47).
export const ROWS = {
  HOME_Y: 24, LANE_H: 16,
  FIRST_LANE_Y: 48, MEDIAN_Y: 128, ROAD_Y0: 144, START_Y: 224, MAX_ROW: 12,
  ANCHOR_Y: [224, 208, 192, 176, 160, 144, 128, 112, 96, 80, 64, 48, 32],
};

// HUD positions in px for the 224×256 screen (§4.1), tunable. Top strip y0…23 (score); bottom
// strip y240…255 (lives + timer + level). TILE is the fixed 8×8 blk_* tile width (an atlas fact,
// not a layout knob); LIVES_STEP / LEVEL_STEP are the tunable marker spacings (both one tile now).
export const HUD = {
  ONE_UP: [16, 1], SCORE: [16, 9], HI_LABEL: [88, 1], HI_VALUE: [88, 9],
  TILE: 8,                                  // blk_* tile width (fixed by the atlas)
  LIVES: [0, 240], LIVES_STEP: 8,
  TIMER_BAR: [8, 248], TIMER_W: 176, TIME_LABEL: [188, 248],
  LEVEL_END: [216, 240], LEVEL_STEP: 8,
};

// Five home bays, centres on the frog column grid (16-apart multiples) and symmetric about
// mid-screen (112): the two outer bays sit at the extreme reachable columns, the middle bay
// straight above the spawn. Each hedge_0 bay unit is 32 px wide, drawn at centre − 16.
export const HOMES = { COUNT: 5, LAND_TOLERANCE: 6, BAY_Y: 24, BAY_CENTERS: [16, 64, 112, 160, 208] };
