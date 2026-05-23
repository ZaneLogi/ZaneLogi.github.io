// asteroids_clone/state.js
//
// JS port of the source's $0200-$03FF object tables + frame-state RAM.
//
// Hybrid design: data as classes (this file), behavior as cited free
// functions (task_seq.js + future per-subsystem modules). Each routine
// elsewhere comments its $xxxx source citation; here we just carry the
// fields and their source addresses for traceability.
//
// Position uses Float64 instead of the source's 16-bit (hi, lo) byte
// pairs — port deviation per research_position_math.md §7. Velocity
// stays as the source's 8-bit signed range conceptually (±63 typical),
// but is held in a plain number for code clarity.

export class Asteroid {
  constructor() {
    this.status = 0;        // $0200+slot — low 2 bits = size (0=large, 1=small, 2=med)
    this.vx = 0;            // signed velocity
    this.vy = 0;
    this.x = 0;             // Float64 — collapses (x_hi, x_lo) per R-C §7
    this.y = 0;
  }
}

export class Ship {
  constructor() {
    this.status = 0;        // $021B — 0 absent, 1 alive, $80+ exploding
    this.vx = 0;            // $023E — high precision via $64 sub-byte (collapsed to Float64)
    this.vy = 0;            // $0261 — high precision via $65 sub-byte
    this.x = 0;
    this.y = 0;
    this.direction = 0;     // $61 — 0-255 around the circle (17-shape table maps to 0..15)
  }
}

export class Saucer {
  constructor() {
    this.status = 0;        // $021C — 0 absent, 1 small, 2 large, $80+ exploding
    this.vx = 0;
    this.vy = 0;
    this.x = 0;
    this.y = 0;
  }
}

export class Shot {
  constructor() {
    this.status = 0;        // 0 absent, non-zero = lifetime countdown
    this.vx = 0;
    this.vy = 0;
    this.x = 0;
    this.y = 0;
  }
}

export class GameState {
  constructor() {
    // Object tables — RAMUse.md $0200-$03FF.
    // Slot counts per pre-research scouting + R-C §3.
    this.asteroids = Array.from({ length: 27 }, () => new Asteroid());
    this.ship = new Ship();
    this.saucer = new Saucer();
    this.saucerShots = [new Shot(), new Shot()];
    this.playerShots = Array.from({ length: 4 }, () => new Shot());

    // Frame state (zero-page bytes).
    this.frameGate = 0;          // $5B — main-loop frame-sync gate (NMI ticks; LSR/BCC at $6811)
    this.fastTimer = 0;          // $5C — incremented per frame (~62.5 Hz)
    this.slowTimer = 0;          // $5D — incremented on fastTimer overflow
    this.delayBeforePlay = 0;    // $5A — inter-life pause counter

    // Game-state bytes.
    this.numPlayers = 0;         // $1C — 0 = attract mode
    this.curPlayer = 0;          // $18 — 0/1
    this.curAsteroidCount = 0;   // $02F6
    this.astdWaveTimer = 0;      // $02FB
    this.astWaveTimerReload = 0; // $02FC
    this.hyperSpaceFlag = 0;     // $59

    // High-score table, DIP settings, sound timers, credits, and per-
    // subsystem state get added as their port steps land (I-8..I-14).
  }
}
