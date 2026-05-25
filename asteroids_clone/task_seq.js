// asteroids_clone/task_seq.js
//
// Per-frame task dispatch — JS port of the 15-JSR sequence at
// $683C-$6873 (research_main_loop.md §3). The cabinet's main loop is
// a frame-sync gate followed by these 15 routines in fixed order;
// gating ($684E delayBeforePlay, $6847 highScoreEntry, etc.) is
// preserved.
//
// Behavior style: cited free functions. Each routine names its
// source label and is filled in by the corresponding implementation
// step (I-8 ship, I-9 asteroid, I-10 saucer, I-11 collisions, I-12
// HUD/attract). For I-7 these were intentionally empty stubs.
//
// **Port deviation — sim/render split (I-8a).** The source intermixes
// simulation and DVG emission inside the 15-JSR dispatch: each
// per-object update routine ALSO calls $7C03 to emit its draw.
// Canvas rendering needs to be batched per painted frame (not per
// simulation tick), so the port splits the dispatch in two:
//
//   - `simulate(state)` — called once per accumulator tick. Runs the
//     simulation parts of the dispatch (motion, AI, collisions,
//     timers). No DVG emit.
//   - `render(state, renderer)` — called once per painted frame.
//     Runs the rendering parts (per-object draws via $7C03 +
//     scoreLivesDraw + closing emit + halt). Reads current state.
//
// Each split site cites the source routine it ports and notes the
// split. The 1:1 source mapping survives at the routine level.

// Per-frame collision + scoring lives in collisions.js (extracted during
// the I-11/I-12 boundary refactor). Per-frame render stubs (drawShip etc.)
// live in render.js. splitAsteroid is exported below for collisions.js's
// killAsteroid (the circular import is safe under ESM — both bindings
// resolve before any call site fires).
import { collisions } from './collisions.js';
import {
  drawShip, drawAsteroids, drawSaucer, drawPlayerShots, drawSaucerShots,
  scoreLivesDraw, attractOverlay, gameOverOverlay, highScoreTable,
  closingEmit, emitHalt,
} from './render.js';

// ----- Frame-rate gate (NMI $5B + main-loop $6811-$6813) -----
//
// The cabinet's NMI ticks $5B at 250 Hz; the main loop drains it at
// ~62.5 Hz via LSR/BCC. In JS we drive ticks from the
// requestAnimationFrame loop's fixed-timestep accumulator (see
// main.js), so frameGate is a no-op here — it exists so we can
// trace the source dispatch path one-to-one if we ever need to.

export function simulate(state) {
  // $683C — playerMgmt: credits, delay, player rotation. CF=1 triggers
  // cold-restart (handled in main loop; for now, no-op).
  playerMgmt(state);

  // $6841 — attractText: numPlayers-conditional text drawing.
  attractText(state);

  // $6844 — highScoreMgmt: high-score table mgmt; N flag set when
  // initial-entry is in progress, gating $6849.
  const highScoreActive = highScoreMgmt(state);

  if (highScoreActive) {
    // $6849 — highScoreEntry: rotate/hyperspace entry input. CF=1
    // means still entering — skip the rest of the gameplay block.
    if (highScoreEntry(state)) {
      soundDispatch(state);
      advanceRNG(state);
      advanceTimers(state);
      return;
    }
  }

  // $684E gate — skip ship/saucer/fire work during inter-life pause.
  if (state.delayBeforePlay === 0) {
    playerFire(state);       // $6CD7
    shipControl(state);      // $6E74
    shipSpawnPhys(state);    // $703F
    saucerSpawn(state);      // $6B93
  }

  asteroidUpdate(state);     // $6F57 — iterates all 35 object slots (sim only)
  collisions(state);         // $69F0

  soundDispatch(state);      // $7555 — per-frame sound channel updates (R-G)
  advanceRNG(state);         // $77B5

  waveTrailer(state);        // $6876-$6883 — fire newWaveInit when field is empty
  advanceTimers(state);
}

// $6876-$6883 — wave-progression trailer. Runs at end of per-frame body.
// Decrements astdWaveTimer (the inter-wave grace pause set to $7F at
// $6F89 when the last asteroid dies); when both the timer AND
// curAsteroidCount are zero, fires a new wave via $7168.
//
// At game-start with state.astdWaveTimer = 0 + state.curAsteroidCount = 0,
// the trailer fires newWaveInit on frame 1 — which is why the explicit
// bootstrap call in main.js (added during I-9a) became removable when
// this lands.
function waveTrailer(state) {
  if (state.astdWaveTimer > 0) {
    state.astdWaveTimer -= 1;
  }
  if (state.astdWaveTimer === 0 && state.curAsteroidCount === 0) {
    newWaveInit(state);
  }
}

// ===== Render dispatch — called once per painted frame =====

export function render(state, renderer) {
  // Source equivalent: the per-object draw emit sites scattered
  // through the per-object update routines + the frame trailer
  // ($724F scoreLivesDraw, $686D closing emit, $7BC0 emitHalt).
  // See the "Port deviation — sim/render split" note at top.

  // Per-object draws — emit order matches source's slot-iteration
  // direction in $6F57 (asteroids first, then ship, then saucer/shots).
  drawAsteroids(state, renderer);   // (I-9)
  drawShip(state, renderer);        // (I-8)
  drawSaucer(state, renderer);      // (I-10)
  drawPlayerShots(state, renderer); // (I-8d)
  drawSaucerShots(state, renderer); // (I-10)

  // Frame trailer:
  scoreLivesDraw(state, renderer);  // $724F
  attractOverlay(state, renderer);  // $68AD coinage + $6949 PUSH START blink (attract only)
  gameOverOverlay(state, renderer); // $6984 GAME OVER text (in-game, curShips==0)
  highScoreTable(state, renderer);  // $73C4 high-score table (attract only)
  closingEmit(state, renderer);     // $686D — single LABS at (~mid-screen)
  emitHalt(state, renderer);        // $7BC0
}

function advanceTimers(state) {
  // The source increments fastTimer in the main-loop preamble at
  // $6828-$682C. Mirroring it here keeps the timer semantics
  // intact for per-frame phase logic (sprite cycles etc.).
  state.fastTimer = (state.fastTimer + 1) & 0xFF;
  if (state.fastTimer === 0) {
    state.slowTimer = (state.slowTimer + 1) & 0xFF;
  }
}

// ===== 15-JSR stubs — implementation lands per step =====

function playerMgmt(state) {
  // $6885 — credits + game-state dispatcher.
  // I-12d.2 scope: attract-branch only (coin + start-press + game-start burst).
  // In-game branch (delayBeforePlay tick + JMP $6960 game-over check) is I-12e.
  // 2-player branch dropped per scope decision (see plan_i12.md "Drop 2P"
  // discussion 2026-05-25).

  // Edge-detect coin press → increment credits.
  // Source: coin counter hardware triggers; we use key '5' polled-switch.
  const coinEdge = state.input.coin && !state.coinWasPressed;
  state.coinWasPressed = state.input.coin;
  if (coinEdge) state.numCredits++;

  if (state.numPlayers !== 0) {
    // $6889-$6896 — in-game: delayBeforePlay tick + game-over check.
    if (state.delayBeforePlay > 0) {
      state.delayBeforePlay--;
      return;
    }
    // $688D JMP $6960 — game-over flow (1-player only; 2-player branch dropped).
    gameOverFlow(state);
    return;
  }

  // $689D-$695F — attract branch.
  // Coinage message + PUSH START blink are rendered in render.js attractOverlay.
  // Lamp blink ($694C-$695C) skipped — no cabinet lamps to drive.

  // $68B4-$68DE — edge-detect SW1START to begin 1-player game.
  const start1Edge = state.input.start1 && !state.start1WasPressed;
  state.start1WasPressed = state.input.start1;
  if (start1Edge && state.numCredits > 0) {
    state.numCredits--;
    gameStartBurst(state, 1);
  }
}

// $6960 — game-over flow. Called from playerMgmt's in-game branch when
// delayBeforePlay == 0. Per docs/research_game_state_machine.md §5.
//
// Source's $6970-$6991 GAME OVER + PLAYER N text emit is RENDER-side in
// our port (see render.js gameOverOverlay) — sim only handles the state
// transitions. Single-player only; 2-player switch branch dropped.
//
// The trick: Ship.kill writes shipSpawnTimer = $81 universally. The timer
// ticks to $80 exactly once on its way to 0. THIS routine catches that
// $80 frame and either resets to $10 (between-player wait, 2P only — dead
// code in our 1P-only port) or transitions to attract via numPlayers=$FF
// when curShips==0.
function gameOverFlow(state) {
  // $6960-$696D — per-game difficulty drift: every 64 frames, decrement
  // astWaveTimerReload until it floors at $08. Shortens the inter-wave
  // grace as the game wears on.
  if ((state.fastTimer & 0x3F) === 0) {
    if (state.astWaveTimerReload > 0x08) {
      state.astWaveTimerReload--;
    }
  }

  // $6992-$699C — transition only fires when ship is fully cleaned up
  // (status==0 after explosion-anim completed via $6F93) AND on the exact
  // frame shipSpawnTimer == $80 (it ticks $81 → $80 → ... in shipSpawnPhys
  // post-explosion).
  if (state.ship.status !== 0) return;
  if (state.shipSpawnTimer !== 0x80) return;

  // $69A0 — re-arm shipSpawnTimer to $10 (the 2P between-player wait;
  // in 1P this is effectively dead time before the attract-mode transition
  // takes hold via $765C on the next dispatch).
  state.shipSpawnTimer = 0x10;

  // $69A5-$69A9 — if all banks have ships left, this would be the next-
  // player switch path (2P only). In 1P, falls through to the all-out
  // branch when curShips==0; otherwise the ship would just respawn
  // (which our Ship.kill already handles via shipSpawnTimer=$81 → 0).
  if (state.curShips !== 0) return;

  // $69CF-$69E1 — cold-attract transition. Source sets numPlayers=$FF (the
  // "just-ended, run high-score-placement check" intermediate per
  // research_game_state_machine.md §1), turns off all sounds ($6EFA, R-G),
  // and turns on both start lamps. We model only the numPlayers flag —
  // sound off + lamps are no-ops in this port.
  state.numPlayers = 0xFF;
}

// $68F0-$693A — game-start burst. Single-player only (2P bank-swap deferred).
// Per docs/research_game_state_machine.md §4: zero per-player object tables,
// reset all timers, set numPlayers + curShips + delayBeforePlay, set
// ply1HighPlacement = $FF for the eventual placement check.
function gameStartBurst(state, numPlayers) {
  // $6916-$691A — placements reset (= "neither qualifies yet").
  // (state.ply1HighPlacement / ply2HighPlacement land in I-12e/f.)

  // $691C-$691E — 128-frame pre-game pause before ship actually appears.
  state.delayBeforePlay = 0x80;

  // $6921-$6923 — curPlayer = 0 (player 1 starts).
  state.curPlayer = 0;

  // $6925-$6927 — ply1CurShips = numShipsPerGame DIP.
  state.curShips = state.numShipsPerGame;

  // $68F0-$68F5 — shipSpawnTimer = 1 → respawn fires on next shipSpawnPhys tick.
  state.shipSpawnTimer = 1;

  // $68F8-$6903 — saucer timers ($92 = 146 frames at every-4-tick = ~9 sec to
  // first saucer attempt).
  state.saucerTimeReload = 0x92;
  state.saucerTimer = 0x92;

  // $6906-$690B — astdWaveTimer = $7F (127-frame pre-wave grace; lets the
  // delayBeforePlay banner drain before asteroids appear).
  state.astdWaveTimer = 0x7F;

  // $690E-$6913 — max_rocks_for_ufo = 5.
  state.max_rocks_for_ufo = 5;

  // $692F-$6934 — astWaveTimerReload = $30.
  state.astWaveTimerReload = 0x30;

  // $6ED8 — asteroidsPerWave seeded at 2; newWaveInit will bump to 4 on
  // wave 1.
  state.asteroidsPerWave = 2;
  state.curAsteroidCount = 0;

  // $6EE7-$6EF4 — zero all object slots (asteroids 27 + ship + saucer + shots).
  for (const ast of state.asteroids) ast.status = 0;
  for (const shot of state.playerShots) shot.status = 0;
  for (const shot of state.saucerShots) shot.status = 0;
  state.saucer.status = 0;
  // Ship reset: position to center, status=0 (shipSpawnTimer=1 will set status=1
  // next frame via shipSpawnPhys's respawn dispatch).
  state.ship.placeAtCenter();
  state.ship.status = 0;

  // Score reset.
  state.scoreThousands = 0;
  state.scoreTens = 0;

  // Commit numPlayers last so attract-mode guards don't suddenly fail mid-burst.
  state.numPlayers = numPlayers;
}

function attractText(state) {
  // $765C — MISNOMER (per research_game_state_machine.md §6): actually the
  // post-game-over high-score-placement detector. Runs only when numPlayers
  // has high bit set (= $FF, set by gameOverFlow's all-out branch).
  //
  // I-12f port: $7660-$76ED placement scan + table shuffle for player 1
  // (2P scan dropped per scope). If player's score beats any table entry,
  // shuffle it in with placeholder initials. Then numPlayers = 0 →
  // attract mode resumes.
  if (state.numPlayers !== 0xFF) return;

  const placement = scanHighScorePlacement(state);
  if (placement !== 0xFF) {
    insertHighScore(state, placement);
  }

  // $7694: numPlayers = 0 (complete the single-frame $FF → $00 intermediate).
  state.numPlayers = 0;
}

// $7668-$767A — placement scan for one player. Walks the table top-down;
// returns the index of the first entry the player beats, or 0xFF if not.
// Comparison: player score (scoreThousands:scoreTens) > entry (thous:tens).
function scanHighScorePlacement(state) {
  for (let i = 0; i < 10; i++) {
    const entry = state.highScores[i];
    if (state.scoreThousands > entry.thous) return i;
    if (state.scoreThousands === entry.thous && state.scoreTens > entry.tens) return i;
  }
  return 0xFF;
}

// $7699-$76ED — table shuffle: slide entries down from `placement` to make
// room, then insert the player's score with placeholder initials.
//
// Source uses 5-bit char code $0B as the initial placeholder (= 'G' per the
// packed-message char map). We use 'A' as a more conventional default — port
// deviation since I-12g letter-entry input is deferred and the player can't
// customize.
function insertHighScore(state, placement) {
  // Slide entries [placement..8] down to [placement+1..9].
  for (let i = 9; i > placement; i--) {
    state.highScores[i] = state.highScores[i - 1];
  }
  // Insert new entry. Use string concat to avoid sharing array refs across
  // entries (each entry needs its own initials array).
  state.highScores[placement] = {
    thous: state.scoreThousands,
    tens: state.scoreTens,
    initials: ['A', 'A', 'A'],
  };
}

function highScoreMgmt(_state) {
  // $6D90 — high-score table mgmt. Returns true (N=1) when the
  // initial-entry flow at $73C4 is currently active.
  return false;
}

function highScoreEntry(_state) {
  // $73C4 — rotate-to-select-letter / hyperspace-to-confirm input
  // for high-score initials. Returns true (CF=1) when still
  // entering. Body in I-12.
  return false;
}

function playerFire(state) {
  // $6CD7 — edge-detected SWFIRE: spawn shot in free slot $1F-$22.
  // Source uses $63 photomLimiter (bit 7 = current, bit 6 = previous);
  // JS uses state.fireWasPressed for the same rising-edge gate.
  const edge = state.input.fire && !state.fireWasPressed;
  state.fireWasPressed = state.input.fire;
  if (!edge) return;

  // $6CE6 — skip while ship is in spawn/respawn (we only check status===1).
  if (state.ship.status !== 1) return;

  // $6CF0-$6CFA — search slots top-down for the first free one.
  const slot = state.playerShots.find((s) => s.status === 0);
  if (!slot) return;

  const s = state.ship;
  slot.spawn(s.x, s.y, s.vx, s.vy, s.direction);
}

// $6E74-$6ED7 — hyperspace initiation. Polled-switch (no edge detect)
// because spawnTimer gate prevents re-trigger during the vanish window.
// Source: SWHYPER ($2003) pressed while alive + not respawn-protecting →
// teleport to random position. ~75% safe, ~25% fail (explode on re-entry).
//
// Rotation + thrust input live in shipSpawnPhys ($7086-$70DF) per I-8d —
// shipControl in source is hyperspace-only at this dispatch level.
function shipControl(state) {
  if (state.numPlayers === 0) return;          // $6E76 — attract: skip
  if (state.ship.status >= 0x80) return;       // $6E7B — exploding: skip
  if (state.shipSpawnTimer !== 0) return;      // $6E80 — already in spawn-
                                                 // protect/vanish: skip
  if (!state.input.hyper) return;              // $6E85 — SWHYPER not pressed

  // $6E87-$6E96 — vanish: zero status + velocity, set 48-frame re-entry timer.
  state.ship.status = 0;
  state.ship.vx = 0;
  state.ship.vy = 0;
  state.shipSpawnTimer = 0x30;

  // $6E97-$6EA8 — random X position, clamp to game-coord [3, 28].
  // Source uses hposhShip (high byte = integer game-coord). We collapse to
  // Float64 X per R-C §7; integer value lands at the cell boundary.
  let rndX = advanceRNG(state) & 0x1F;
  if (rndX >= 0x1D) rndX = 0x1C;
  if (rndX < 0x03) rndX = 0x03;
  state.ship.x = rndX;

  // $6EAB-$6EB3 — advance RNG 5 more times to decorrelate Y from X.
  let rndY = 0;
  for (let i = 0; i < 5; i++) rndY = advanceRNG(state);
  rndY &= 0x1F;

  // $6EB5-$6EC4 — fail-check + hyperspace flag.
  // Source logic: if rndY >= $18 AND ((rndY & $07) * 2 + 4) >= curAsteroidCount,
  // flag = $80 (fail). Else flag = 1 (success). Counter-intuitive: more
  // asteroids on screen → LESS chance of fail. Cabinet-faithful as-decoded.
  let hyperFlag = 0x01;
  if (rndY >= 0x18) {
    const dangerVal = ((rndY & 0x07) << 1) + 4;
    if (dangerVal >= state.curAsteroidCount) {
      hyperFlag = 0x80;
    }
  }

  // $6EC6-$6ED2 — clamp Y to game-coord [3, 20].
  if (rndY >= 0x15) rndY = 0x14;
  if (rndY < 0x03) rndY = 0x03;
  state.ship.y = rndY;

  // $6ED5 — store flag for shipSpawnPhys to read on re-entry tick.
  state.hyperSpaceFlag = hyperFlag;
}

function shipSpawnPhys(state) {
  // $703F-$7085 — ship-spawn-timer mgmt + respawn dispatch.

  if (state.numPlayers === 0) return;        // $7041 — skip in attract mode
  if (state.ship.status >= 0x80) return;     // $7046 — still exploding, no input + no respawn

  if (state.shipSpawnTimer !== 0) {
    // $704D-$7050 — countdown phase: DEC + RTS if still > 0.
    state.shipSpawnTimer -= 1;
    if (state.shipSpawnTimer !== 0) return;

    // $7052-$7056 — timer just hit 0: check hyperSpaceFlag first (I-13).
    // $80 = failed hyperspace (die at re-entry); non-zero non-$80 =
    // successful hyperspace (just set status=1 at the position shipControl
    // already wrote, NO placeAtCenter); 0 = normal post-explosion respawn.
    if (state.hyperSpaceFlag & 0x80) {
      // $706F-$707E — failed hyperspace death. Ship.kill writes the same
      // status=$A0 / curShips-- / shipSpawnTimer=$81 sequence ($706F's
      // explicit body); reuse the existing helper.
      state.ship.kill(state);
      state.hyperSpaceFlag = 0;
      return;
    }
    if (state.hyperSpaceFlag !== 0) {
      // $7068-$706A — successful hyperspace: status=1, position already set.
      state.ship.status = 1;
      state.hyperSpaceFlag = 0;
      return;
    }

    // $7058-$705B — safe-respawn scan. If blocked, source INCs timer
    // back to 1 to retry next frame (kept on countdown until clear).
    if (!state.ship.canSafelyRespawn(state)) {
      state.shipSpawnTimer = 1;
      return;
    }

    // $705D-$7060 — saucer alive? Defer 2 frames (avoid spawning into
    // saucer's flight path even if it's geometrically distant).
    if (state.saucer.status > 0 && state.saucer.status < 0x80) {
      state.shipSpawnTimer = 2;
      return;
    }

    // $7068-$706A — respawn: position to center, status = 1.
    state.ship.respawn(state);
    return;
  }

  // $7086+ — ship alive (status === 1, shipSpawnTimer === 0): handle input.
  if (state.ship.status !== 1) return;       // safety net

  // $7086-$709A — SWROTLEFT has priority; either rotates direction by ±3.
  if (state.input.rotLeft) {
    state.ship.rotate(3);
  } else if (state.input.rotRight) {
    state.ship.rotate(-3);
  }

  // $70A0-$70DF — thrust accelerates vx/vy; thrust-off path applies friction.
  if (state.input.thrust) {
    state.ship.applyThrust();
  } else {
    state.ship.applyFriction();
  }
}

// $6B93-$6C33 — saucer-spawn dispatch. Runs every 4th frame; either
// (a) dispatches to active-saucer logic if a saucer is alive, or
// (b) ticks the spawn countdown and spawns a new saucer when it fires.
//
// Source RTS exits compress into early returns. The dual-use saucerTimer
// (state.saucerTimer) is read+decremented here in role (a), and is
// read+decremented in role (b) by saucerActive() — see state.js field doc.
function saucerSpawn(state) {
  // $6B93-$6B97 — fastTimer & 3: gate to every 4th frame.
  if ((state.fastTimer & 0x03) !== 0) return;

  // $6B9A-$6B9D — currently exploding ($80+)? RTS (explosion-anim runs
  // elsewhere; spawn dispatch idle).
  if (state.saucer.status >= 0x80) return;

  // $6B9F-$6BA1 — saucer alive? Dispatch to active-saucer logic.
  if (state.saucer.status !== 0) {
    saucerActive(state);
    return;
  }

  // $6BA4-$6BAE — in play mode (numPlayers!=0), skip if ship absent
  // (status==0) or exploding (status>=$80). Attract mode (numPlayers==0)
  // spawns saucers regardless of ship state.
  if (state.numPlayers !== 0) {
    if (state.ship.status === 0 || state.ship.status >= 0x80) return;
  }

  // $6BAF-$6BB6 — asteroid_hit_timer countdown (set to $50 by $75EC's
  // shot-vs-asteroid resolver).
  if (state.asteroid_hit_timer > 0) state.asteroid_hit_timer -= 1;

  // $6BB7-$6BBA — saucerTimer countdown. Spawn attempt fires when it hits 0.
  state.saucerTimer = (state.saucerTimer - 1) & 0xff;
  if (state.saucerTimer !== 0) return;

  // $6BBC-$6BBE — re-arm to $12 (= 18 frames) as the retry delay if spawn
  // aborts below; if it succeeds, $02F7 becomes the inter-shot timer and
  // drifts to $0A via saucerActive's first shot.
  state.saucerTimer = 0x12;

  // $6BC1-$6BCE — while asteroid_hit_timer is still ticking (recent
  // explosion), only spawn if curAsteroidCount is in (0, max_rocks_for_ufo).
  // Once asteroid_hit_timer drains to 0, spawn unconditionally.
  if (state.asteroid_hit_timer !== 0) {
    if (state.curAsteroidCount === 0) return;
    if (state.curAsteroidCount >= state.max_rocks_for_ufo) return;
  }

  // $6BD0-$6BDC — shorten saucerTimeReload (next saucer appears sooner),
  // floor at $20. Only write back if the new value is >= $20.
  const next = (state.saucerTimeReload - 6) & 0xff;
  if (next >= 0x20) state.saucerTimeReload = next;

  // $6BDD-$6C30 — set position, velocity, size on the saucer object.
  state.saucer.spawn(state, advanceRNG);
}

// $6C34-$6C44 — active-saucer logic (called from saucerSpawn every 4th
// frame when saucer is alive). Two responsibilities:
//   (a) Periodic vertical direction change (this routine, I-10b).
//   (b) Shot-timer countdown + fire shot (I-10d, deferred to saucerActive
//       extension).
function saucerActive(state) {
  // $6C34-$6C37 — ASL fastTimer; BNE skip. Source fires when the post-ASL
  // result is zero, i.e. when fastTimer's low 7 bits are all zero — which
  // happens at fastTimer == $00 or $80. Since this dispatch is itself
  // gated to every 4th frame (saucerSpawn's fastTimer & 3 check), direction
  // change fires roughly twice per 256-frame cycle = once every ~128 frames.
  if ((state.fastTimer & 0x7f) === 0) {
    // $6C39-$6C42 — RNG AND #$03 indexes a 4-entry direction table at $6CD3.
    // Bytes: $F0, $00, $00, $10. So 50% chance of no vertical change,
    // 25% chance down ($F0 = -16/256), 25% chance up ($10 = +16/256).
    // Result is written as the new vertVel.
    const VERT_DIR_TABLE = [0xf0, 0x00, 0x00, 0x10];
    const byte = VERT_DIR_TABLE[advanceRNG(state) & 0x03];
    state.saucer.vy = byte <= 0x7f ? byte / 256 : (byte - 256) / 256;
  }

  // $6C45-$6C53 — gate shot-timer countdown on ship not in spawn-protect:
  //   numPlayers != 0 (in play) AND shipSpawnTimer != 0 ⟹ skip (RTS).
  //   Otherwise decrement saucerTimer; if it hits 0, fire.
  if (state.numPlayers !== 0 && state.shipSpawnTimer !== 0) return;
  state.saucerTimer = (state.saucerTimer - 1) & 0xff;
  if (state.saucerTimer !== 0) return;

  // $6C54-$6C56 — reset shot timer to $0A = 10 ticks (40 frames @ every-4 = ~0.64s).
  state.saucerTimer = 0x0a;

  // $6C59-$6CC4 — compute saucerShotDir.
  let dir;
  if (state.saucer.status === 2) {
    // $6C59-$6C62 — LARGE saucer: random direction.
    dir = advanceRNG(state);
  } else {
    // $6C65-$6CAA — SMALL saucer: aim at ship with self-velocity compensation.
    //   dx = ship.x - saucer.x - 0.5 * saucer.vx
    //   dy = ship.y - saucer.y - 0.5 * saucer.vy
    //   atan2(dy, dx) → 8-bit direction (0=east, $40=north, $80=west, $C0=south).
    // Source scales dx/dy by 4 before atan2 to widen the byte range, but the
    // angle is invariant under uniform scale — we skip the scale step and
    // use Math.atan2 directly. Not wrap-aware (matches source).
    const dx = state.ship.x - state.saucer.x - 0.5 * state.saucer.vx;
    const dy = state.ship.y - state.saucer.y - 0.5 * state.saucer.vy;
    const base = Math.round(Math.atan2(dy, dx) / (2 * Math.PI) * 256) & 0xff;

    // $6CAC-$6CC4 — score-based aim noise:
    //   <35k pts: signed [-16, +15] (AND $8F + sign-extend with OR $70)
    //   ≥35k pts: signed [-8,  +7]  (AND $87 + sign-extend with OR $78)
    const rnd = advanceRNG(state);
    const tight = state.scoreThousands >= 35;
    const andMask = tight ? 0x87 : 0x8f;
    const orMask  = tight ? 0x78 : 0x70;
    const masked = rnd & andMask;
    const noise = (masked & 0x80) ? ((masked | orMask) - 0x100) : masked;
    dir = (base + noise) & 0xff;
  }

  // $6CC6-$6D8E — spawn shot in first free saucer-shot slot. Source scans
  // $021E (slot $1E) down to $021D (slot $1D), Y=$03..$02 with $0E=$01 stop.
  // Shot inherits saucer's velocity + unit-vector in dir, position = saucer
  // position + nose offset. Same Shot.spawn path as player fire (refactored
  // to take explicit source state).
  const slot = state.saucerShots.find((s) => s.status === 0);
  if (!slot) return;
  const s = state.saucer;
  slot.spawn(s.x, s.y, s.vx, s.vy, dir);
}

function asteroidUpdate(state) {
  // $6F57 — iterates all 35 object slots; per-slot calls $6FC7 motion
  // (or $7708 explosion anim if status high bit set). I-8c/d ported the
  // ship-slot ($1B) + player-shot slots ($1F-$22); I-9b adds asteroid
  // slots ($00-$1A) motion; I-9e will add the explosion-anim branch;
  // saucer + saucer-shot slots fill in with I-10.
  if (state.ship.status === 1) {
    state.ship.advancePosition();
  } else if (state.ship.status >= 0x80) {
    // $74A4-$74C5 — fragment positions advance every tick. Source's
    // per-frame phase at $748E also runs unconditionally.
    state.ship.advanceExplosionFragments();

    // $6F62-$6F77 ship-slot exploding-anim status increment. Source formula:
    // (negated >> 4) base + (fastTimer & 1) carry-in for the ship slot.
    // Net: explosion duration ~0.58 sec at 62.5 Hz. Matches research_ship_
    // explosion.md §6 — one frame slower per tick than asteroid explosion.
    const negated = ((~state.ship.status) + 1) & 0xff;
    const increment = (negated >> 4) + (state.fastTimer & 1);
    const newStatusRaw = state.ship.status + increment;
    if (newStatusRaw <= 0xff) {
      state.ship.status = newStatusRaw;
    } else {
      // $6F93-$6F8E — explosion complete: place ship at center + status=0.
      // shipSpawnPhys continues ticking the timer until 0 → status = 1.
      state.ship.placeAtCenter();
      state.ship.status = 0;
    }
  }
  // Saucer slot ($1C) — three branches in source's $6F57 dispatch:
  //   status == 0: skip
  //   status >= $80: explosion-anim path ($6F64-$6F77 + $6F99 cleanup)
  //   status > 0 < $80: motion path ($6FC7) + edge-cross despawn
  //
  // Explosion-anim formula: same as exploding-asteroid (negate + >>4 +
  // increment by counter+1) since source's $6F77 SEC sets C=1 for both
  // non-ship slots. On completion ($6F99): clear status + reset
  // saucerTimer = saucerTimeReload (mirrors source's reset of the
  // spawn countdown).
  if (state.saucer.status >= 0x80) {
    const negated = ((~state.saucer.status) + 1) & 0xff;
    const increment = (negated >> 4) + 1;
    const newStatusRaw = state.saucer.status + increment;
    if (newStatusRaw <= 0xff) {
      state.saucer.status = newStatusRaw;
    } else {
      // $6F99-$6F9F — saucer cleanup: reset spawn countdown.
      state.saucer.status = 0;
      state.saucerTimer = state.saucerTimeReload;
    }
  } else if (state.saucer.status > 0) {
    // Motion + edge-cross despawn ($6FC7 motion + $6FE2-$6FEA saucer-
    // specific wrap-becomes-despawn). Saucer.advancePosition extends
    // source's high-edge-only wrap to the low edge too, since the
    // saucer's horzVel can be either +$10 (enters left, exits right)
    // or -$10 (enters right, exits left).
    state.saucer.advancePosition(state);
  }
  // Saucer-shot slots ($1D-$1E) — same shared motion + lifetime decrement
  // as player shots in source's $6F57 / $7393. Iterated separately here only
  // because state.saucerShots and state.playerShots are different arrays.
  for (const shot of state.saucerShots) {
    if (shot.status > 0) {
      shot.advancePosition();
      shot.decrementLifetime(state.fastTimer);
    }
  }
  for (const shot of state.playerShots) {
    if (shot.status > 0) {
      shot.advancePosition();
      shot.decrementLifetime(state.fastTimer);
    }
  }
  // Asteroids: source's $6F57 dispatch tests status high bit to route
  // between $6FC7 motion (alive, status 1..$7F) and the explosion-anim
  // increment path at $6F64-$6F77 (exploding, status >= $80).
  for (const ast of state.asteroids) {
    if (ast.status === 0) continue;
    if (ast.status < 0x80) {
      ast.advancePosition();
    } else {
      // $6F64-$6F77 — exploding-asteroid animation tick. Source negates
      // status, shifts right by 4 to get a "frames-remaining" counter,
      // adds (counter + 1) to status. When status overflows past $FF,
      // explosion is complete → clear slot + decrement curAsteroidCount
      // (mirrors $6F82). Cycling status also changes bits 2,3 which
      // drive Shrapnel shape selection in drawAsteroids — gives visual
      // variety across the ~10-15-tick animation.
      const negated = ((~ast.status) + 1) & 0xff;
      const increment = (negated >> 4) + 1;
      const newStatusRaw = ast.status + increment;
      if (newStatusRaw <= 0xff) {
        ast.status = newStatusRaw;
      } else {
        // $6F82-$6F8E — explosion complete: clear slot + dec count. If the
        // dec brings curAsteroidCount to 0, arm astdWaveTimer = $7F (127
        // frames ≈ 2 sec pre-wave grace before the trailer fires the next
        // newWaveInit). Source: $6F85 BNE skip-timer-set; $6F87-$6F89 STY
        // astdWaveTimer. Without this, the wave-trailer fires the next wave
        // on the same frame as the last asteroid's death (visible only
        // during attract mode, where saucer kills are the only way for
        // curAsteroidCount to hit 0).
        ast.status = 0;
        state.curAsteroidCount -= 1;
        if (state.curAsteroidCount === 0) {
          state.astdWaveTimer = 0x7F;
        }
      }
    }
  }
}

function soundDispatch(_state) {
  // $7555 — per-frame sound-channel updates. Writes SNDSAUCR /
  // SNDSFIRE / SNDTHRUST / SNDFIRE / SNDTHUMP / SNDEXP. Body in
  // R-G (deferred until silent game runs).
}

function advanceRNG(state) {
  // $77B5-$77D0 — 16-bit Galois LFSR over $5F:$60 (rngLo:rngHi).
  // Two feedback taps + anti-stuck-at-zero guard. Output is the low
  // byte (rngLo). See research_main_loop.md §10 for the full decode.
  const oldHi = state.rngHi;
  state.rngHi = ((state.rngHi << 1) | (state.rngLo >> 7)) & 0xff;  // ROL $60
  state.rngLo = (state.rngLo << 1) & 0xff;                          // ASL $5F
  if (oldHi & 0x40) state.rngLo = (state.rngLo + 1) & 0xff;         // $77BB INC $5F if bit 6 of old $60 was 1
  if (state.rngLo & 0x02) state.rngLo ^= 0x01;                      // $77C4 EOR #$01 if bit 1 of A is set
  if ((state.rngLo | state.rngHi) === 0) state.rngLo = 1;           // $77CC anti-zero guard
  return state.rngLo;
}

// ===== Wave init — called from bootstrap (main.js) + trailer (I-9f) =====

// $7168 — wave-init entry. Early-outs if astdWaveTimer > 0 (grace
// period after a wave ended) OR if saucer is active. Otherwise:
// bumps max_rocks_for_ufo, bumps asteroidsPerWave by 2 (capped at 11),
// spawns that many large asteroids at random left-or-bottom edges,
// then resets the per-wave saucer + reload timers.
//
// Status byte at $71A0-$71A4: AND #$18 (bits 3-4 from RNG = Rock-shape
// variant seed, picks 1 of 4 fixed tumble poses Rock1..Rock4) | ORA #$04
// (bit 2 set = "alive marker"; size bits 0-1 stay zero = LARGE). Result
// is one of $04 / $0C / $14 / $1C. Alive asteroids never modify these
// bits (no per-frame animation — see research_collisions.md §3).
export function newWaveInit(state) {
  if (state.astdWaveTimer !== 0) return;   // $716D — still in grace period
  if (state.saucer.status !== 0) return;   // $7172 — saucer holds open the gap

  // $7174-$7177 — zero saucer velocity (also serves as the "source"
  // velocity for $7203 perturbation; new asteroids inherit it).
  state.saucer.vx = 0;
  state.saucer.vy = 0;

  // $717A-$7185 — bump UFO-spawn threshold, cap at 10.
  state.max_rocks_for_ufo = Math.min(state.max_rocks_for_ufo + 1, 10);

  // $7187-$7191 — bump asteroidsPerWave by 2, cap at 11.
  // $6ED8 seeds asteroidsPerWave=2, so first call → 4, then 6, 8, 10, 11, 11, ...
  state.asteroidsPerWave = Math.min(state.asteroidsPerWave + 2, 11);
  state.curAsteroidCount = state.asteroidsPerWave;

  // $719B-$71D3 — spawn loop, X = 26..0 (top asteroid slot down).
  // Y=$1C is the saucer slot, used by $7203 as the velocity source.
  for (let x = state.curAsteroidCount - 1, slot = state.asteroids.length - 1;
       x >= 0;
       x--, slot--) {
    const ast = state.asteroids[slot];

    // $719D-$71A4 — status: bit 2 set + shape-variant seed in bits 3-4.
    const rndStatus = advanceRNG(state);
    ast.status = 0x04 | (rndStatus & 0x18);

    // $71A7 — perturb velocity: child = saucer's vel (0,0) + random ±15 clamped.
    const v = perturbVelocity(state, state.saucer.vx, state.saucer.vy);
    ast.vx = v.vx;
    ast.vy = v.vy;

    // $71AA-$71CD — position: random left OR bottom edge.
    const rndPos = advanceRNG(state);
    const carry = rndPos & 0x01;      // $71AD LSR A — original bit 0 → C
    let coord = (rndPos >> 1) & 0x1F; // $71AE AND #$1F after LSR
    if (carry === 0) {
      // $71C5 — BOTTOM edge: x = random(0-31), y = 0.
      ast.x = coord;
      ast.y = 0;
    } else {
      // $71B2-$71B8 — LEFT edge: x = 0, y = random clamped to 0-23.
      if (coord >= 24) coord &= 0x17; // $71B6 mask 24-31 → 16-23
      ast.x = 0;
      ast.y = coord;
    }
  }

  // $71D5-$71DC — re-arm per-wave timers.
  state.saucerTimer = 0x7F;
  state.astWaveTimerReload = 0x30;

  // $71DF-$71E5 — zero any asteroid slots beyond curAsteroidCount.
  // (After our spawn loop, the slots [0, asteroids.length - curAsteroidCount)
  // are the "remaining" slots from source's perspective.)
  for (let slot = state.asteroids.length - state.curAsteroidCount - 1; slot >= 0; slot--) {
    state.asteroids[slot].status = 0;
  }
}

// $7203-$7232 — perturb a base velocity pair with random ±15 (game-coord
// magnitude ±15/256), clamped to magnitude [6, 31]/256. Between X and Y
// axes, 4 RNG calls run to decorrelate the two random samples; only the
// 4th call's output drives Y. Returns {vx, vy}.
//
// Source uses one Y register to index the "source" velocity slot. Our JS
// equivalent passes the base velocity values directly.
function perturbVelocity(state, baseVx, baseVy) {
  const vx = clampAsteroidVel(baseVx + signedPerturb(advanceRNG(state)));
  // $7216-$721F — 4 RNG advances to mix entropy. Only the last output is used.
  advanceRNG(state);
  advanceRNG(state);
  advanceRNG(state);
  const vy = clampAsteroidVel(baseVy + signedPerturb(advanceRNG(state)));
  return { vx, vy };
}

// $7206-$720B — source: AND #$8F (keep bits 0-3 + bit 7), then if bit 7
// set, OR #$F0 (sign-extend the high nibble). Net effect: low nibble of
// the random byte becomes the magnitude, original bit 7 is the sign.
// Result is signed [-16, +15] in source-byte units, converted to
// game-coord by ÷256.
function signedPerturb(rndByte) {
  const lowNibble = rndByte & 0x0F;
  const signed = (rndByte & 0x80) ? lowNibble - 16 : lowNibble;
  return signed / 256;
}

// $7233-$724E — clamp velocity to signed magnitude in [6, 31] source-byte
// units = game-coord magnitude in [6/256, 31/256]. The min-magnitude clamp
// is why asteroids never sit still.
const VEL_MIN_MAG = 6 / 256;
const VEL_MAX_MAG = 31 / 256;
function clampAsteroidVel(v) {
  if (v < 0) {
    if (v < -VEL_MAX_MAG) return -VEL_MAX_MAG;
    if (v > -VEL_MIN_MAG) return -VEL_MIN_MAG;
    return v;
  }
  if (v < VEL_MIN_MAG) return VEL_MIN_MAG;
  if (v > VEL_MAX_MAG) return VEL_MAX_MAG;
  return v;
}

// $6A9D-$6AD2 (split-copy primitive) + $7203 (perturbation, reuses
// helper above) + $7630/$764A (sub-tile XOR jitter). Populates `target`
// (a presumed-empty Asteroid slot) as a child of `parent` with:
//   - status = parent's size bits + new random shape-variant bits
//     (child picks a different Rock1..4 tumble pose than parent)
//   - position = parent's position + sub-tile XOR jitter
//   - velocity = parent's velocity + ±15-clamped random perturbation
//
// I-9g lands this as a dev-console-testable primitive. I-9h calls it
// from the shot-vs-asteroid collision resolution after finding a free
// slot via the asteroid-slot scanner. Source's `$745A`/`$745C` is a
// top-down scan (`LDX #$1A` decrementing); the port uses `Array.find`
// which scans bottom-up but yields the same "first empty slot"
// semantic — functionally equivalent given slot symmetry.
export function splitAsteroid(target, parent, state) {
  // $6A9D-$6AAB — status: keep parent's low 3 bits (size + alive marker),
  // new shape-variant bits from RNG (child Rock pose differs from parent).
  // NOTE: in $75EC the parent's size bits get downgraded BEFORE this is
  // called (medium → small via LSR pattern); for I-9g we use whatever bits
  // parent currently has — I-9h/I-11 handles the downgrade as the caller.
  const newShapeBits = advanceRNG(state) & 0x18;
  target.status = (parent.status & 0x07) | newShapeBits;

  // $6AAE-$6AC3 — position copied verbatim from parent (then jitter below)
  target.x = parent.x;
  target.y = parent.y;

  // $6AC6-$6ACF — velocity copied; then $7203 perturbs. Net: target.vel =
  // parent.vel + random ±15 clamped to magnitude [6, 31].
  const v = perturbVelocity(state, parent.vx, parent.vy);
  target.vx = v.vx;
  target.vy = v.vy;

  // $7630 / $764A — sub-tile XOR jitter so split children don't perfectly
  // overlap. Source: hposl ^= (horzVel & $1F) << 1 (and same for vertical).
  target.x = applyXorJitter(target.x, target.vx);
  target.y = applyXorJitter(target.y, target.vy);
}

// Helper for the source's hposl/vposl XOR jitter pattern.
// Operates on the sub-tile (fractional) portion of the Float64 coord,
// mirroring source's byte-level XOR on hposl/vposl.
function applyXorJitter(coord, vel) {
  const velByte = Math.round(vel * 256) & 0xff;     // signed-byte representation
  const jitter = (velByte & 0x1f) << 1;              // 0..62
  const high = Math.floor(coord);
  const subByte = Math.round((coord - high) * 256) & 0xff;
  const newSubByte = subByte ^ jitter;
  return high + newSubByte / 256;
}
