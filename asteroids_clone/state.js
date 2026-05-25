// asteroids_clone/state.js
//
// JS port of the source's $0200-$03FF object tables + frame-state RAM.
// This file is the GameState container only; the four actor classes
// (Asteroid / Ship / Saucer / Shot) and their per-class constants live
// in their own files. Shared world geometry constants
// (WORLD_W / WORLD_H / GAME_TO_DVG) live in `world.js`.
//
// Hybrid design: data as classes (per-class files), behavior as cited
// free functions (task_seq.js + future per-subsystem modules). Each
// routine elsewhere comments its $xxxx source citation; the per-class
// files just carry the fields and their source addresses for
// traceability.

import { Asteroid } from './asteroid.js';
import { Ship }     from './ship.js';
import { Saucer }   from './saucer.js';
import { Shot }     from './shot.js';

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
    this.numPlayers = 1;         // $1C — 0 = attract mode; I-12 makes dynamic
    this.curPlayer = 0;          // $18 — 0/1
    this.curAsteroidCount = 0;   // $02F6
    this.astdWaveTimer = 0;      // $02FB
    this.astWaveTimerReload = 0; // $02FC
    this.hyperSpaceFlag = 0;     // $59

    // $02F5 asteroidsPerWave — initial value 2 from $6ED8. Each $7168
    // call adds 2 (capped at 11), so wave 1 = 4, wave 2 = 6, ..., wave 5+ = 11.
    this.asteroidsPerWave = 2;
    // $02FD max_rocks_for_ufo — initial 5 from game-init burst $6910.
    // $7168 increments per wave (capped at 10) to make UFOs appear more often.
    // Consumed by saucer-spawn (I-10).
    this.max_rocks_for_ufo = 5;
    // $02F7 saucerTimer — DUAL-USE byte (per RAMUse.md):
    //   - When no saucer active: countdown until spawn attempt. Reset to $7F at
    //     end of wave-init ($71D7); shortened to $12 ($6BBC) on each spawn-tick
    //     where the timer hits zero (retry interval if spawn aborts).
    //   - When saucer active: countdown between shots. Reset to $0A ($6C56)
    //     after each saucer-shot fires.
    // Cold-init value $92 from $6903 is irrelevant for now — newWaveInit
    // overwrites with $7F on frame 1 (via the I-9f trailer).
    this.saucerTimer = 0;
    // $02F8 saucerTimeReload — drift target for inter-saucer interval. Each
    // saucer spawn shortens this by 6 ($6BD4), clamped at $20 ($6BD6). Cold
    // init = $92 from $68FA. Also gates size selection: high bit set ($>=80)
    // forces large saucers; below $80 enables small-saucer rolls (more likely
    // as the value shrinks further).
    this.saucerTimeReload = 0x92;
    // $02F9 asteroid_hit_timer — set to $50 ($75EC) on shot-vs-asteroid hit;
    // decremented per saucer-spawn-dispatch tick ($6BB4). While ticking,
    // saucer spawn is gated by curAsteroidCount being in (0, max_rocks_for_ufo).
    // I-9h's resolveShotVsAsteroid sets this as part of I-10a (it gates
    // saucer behavior).
    this.asteroid_hit_timer = 0;
    // $02FA shipSpawnTimer — counts down ship respawn/spawn-protect window.
    // Source cold-inits to 1 at $68F2; on the very next frame, $7048-$704D
    // in shipSpawnPhys decrements it to 0, then $7068 sets statusShip=1.
    // I-11d restored source-faithful cold-init (was 0 to work around the
    // missing spawn-timer dispatch). Ship.kill sets to $81 = 129 frames
    // respawn delay; the saucer-shot gate at $6C49 reads this to avoid
    // shooting at a spawning ship.
    this.shipSpawnTimer = 1;
    // $0053 ply1ScoreThous — high 2 BCD nibbles of player-1 score (10k and
    // 1k digits). Used by Saucer.spawn for the 30k size-threshold ($6C1E
    // CMP #$30) and by scoreLivesDraw for HUD digits 1-2. Written by the
    // BCD adder ($7397) in I-11b.
    this.scoreThousands = 0x00;
    // $0052 ply1ScoreTens — middle 2 BCD nibbles of player-1 score (100s
    // and 10s digits). Score's ones place is implicit 0 (cabinet score is
    // always a multiple of 10). Written by the BCD adder ($7397) in I-11b.
    this.scoreTens = 0x00;
    // $57 ply1CurShips — player-1 lives remaining. Init from numShipsPerGame
    // DIP at $6925-$6927 (typical cabinet setting = 3). Read by $6F3E lives-
    // icon emit; decremented by Ship.kill (I-11d) and incremented by bonus-
    // ship grant in the BCD adder (I-11b).
    this.curShips = 3;

    // $5F:$60 rndValue — 16-bit Galois LFSR state. Seed must be non-zero
    // (the LFSR has an anti-stuck-at-zero guard at $77CA-$77CC but it
    // can only inch the state forward — a fresh non-zero seed avoids
    // the boot-time bias). Port of $77B5 (research_main_loop.md §10).
    this.rngLo = 1;
    this.rngHi = 0;

    // Polled-switch state — mirrors source's $2003-$2407 hardware ports.
    // Source reads SWROTLEFT/SWROTRGHT/SWTHRUST/SWHYPER/SWFIRE every frame
    // (not edge-triggered); JS keyboard handlers in main.js flip these
    // bools on keydown/keyup. See research_hardware.md §5 input map.
    this.input = {
      rotLeft: false,    // $2407 SWROTLEFT
      rotRight: false,   // $2406 SWROTRGHT
      thrust: false,     // $2405 SWTHRUST
      hyper: false,      // $2003 SWHYPER   — consumed in I-13
      fire: false,       // $2004 SWFIRE
    };

    // $63 photomLimiter — edge-detection state for SWFIRE so a held fire
    // button doesn't auto-spam shots. Tracks last frame's fire state.
    this.fireWasPressed = false;

    // High-score table, DIP settings, sound timers, credits, and per-
    // subsystem state get added as their port steps land (I-8..I-14).
  }
}
