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

  advanceTimers(state);
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

function playerMgmt(_state) {
  // $6885 — credits, "wait between players", trigger new ship via
  // $6960. Body in I-12 (attract / credits / 2-player flow).
}

function attractText(_state) {
  // $765C — numPlayers-conditional attract-mode text drawing.
  // Calls into PrintPackedMsg. Body in I-12.
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

  slot.spawn(state.ship);
}

function shipControl(_state) {
  // $6E74 — read SWHYPER + SWROTLEFT/RIGHT, run hyperspace, update
  // ship.direction. Body in I-8.
}

function shipSpawnPhys(state) {
  // $703F — ship-spawn-timer mgmt + rotation + thrust accumulator.
  // I-8b/c implement rotation + thrust; spawn-timer body ($7041-$7085)
  // lands when ship death + respawn is wired.
  if (state.ship.status !== 1) return;

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

function saucerSpawn(_state) {
  // $6B93 — saucer spawn (every 4th frame), dispatch to active-
  // saucer logic at $6C34. Body in I-10.
}

function asteroidUpdate(state) {
  // $6F57 — iterates all 35 object slots; per-slot calls $6FC7 motion
  // (or $7708 explosion anim if status high bit set). I-8c/d implement
  // ship-slot ($1B) + player-shot slots ($1F-$22); asteroid + saucer +
  // saucer-shot slots fill in with I-9 / I-10.
  if (state.ship.status === 1) {
    state.ship.advancePosition();
  }
  for (const shot of state.playerShots) {
    if (shot.status > 0) {
      shot.advancePosition();
      shot.decrementLifetime(state.fastTimer);
    }
  }
}

function collisions(_state) {
  // $69F0 — pairwise distance tests, splits, scoring, explosion
  // spawn. Body in I-11.
}

function soundDispatch(_state) {
  // $7555 — per-frame sound-channel updates. Writes SNDSAUCR /
  // SNDSFIRE / SNDTHRUST / SNDFIRE / SNDTHUMP / SNDEXP. Body in
  // R-G (deferred until silent game runs).
}

function advanceRNG(state) {
  // $77B5 — 8-bit LFSR using $5F as state. Body in the missing
  // ~20% disasm region; cross-reference Mikstas's alt-disassembly
  // when a gameplay step (saucer-direction, hyperspace teleport)
  // actually needs randomness. Placeholder advance keeps the
  // tick visibly progressing.
  state.rng = ((state.rng ?? 0) + 1) & 0xFF;
}

// ===== Render-side stubs (called by render(state, renderer)) =====

function drawShip(state, renderer) {
  // $750B — ship.shapeSelection() returns the right ShipDirN + flip flags
  // for the current 8-bit direction. gs from $7027 = 14 (ship status=1 →
  // high nibble $E stored at ram.$00 → upper nibble of LABS opcode).
  if (state.ship.status !== 1) return;
  const { name, xFlip, yFlip } = state.ship.shapeSelection();
  // One shared cursor so the thrust flame starts where the ship's last
  // SVEC left it (matches the source: one LABS, then sequential JSRs
  // into ShipDirN + ThrustDirN with no re-anchor between them).
  const cursor = state.ship.dvgPos();
  renderer.drawAt(name, cursor, 14, xFlip, yFlip);

  // $753B-$7553 — matching ThrustDirN flickers on bit 2 of fastTimer
  // while SWTHRUST is held. Picks up cursor from ship's last opcode.
  if (state.input.thrust && (state.fastTimer & 4)) {
    const thrustName = name.replace('ShipDir', 'ThrustDir');
    renderer.drawAt(thrustName, cursor, 14, xFlip, yFlip);
  }
}

function drawAsteroids(_state, _renderer) {
  // I-9 — per-slot iteration via $6F48 caller of $7C03, emitting
  // LABS + JSR into the right Rock_N subroutine.
}

function drawSaucer(_state, _renderer) {
  // I-10 — saucer-draw emit site (probably inside $6B93/$6C34).
}

function drawPlayerShots(state, renderer) {
  // $7384-$738B — source emits a small bright mark per active shot via
  // $7CE0 (a zero-length VEC ≈ illuminated dot). JS renders a tiny dot
  // at the shot's DVG position.
  for (const shot of state.playerShots) {
    if (shot.status > 0) {
      const { x, y } = shot.dvgPos();
      renderer.drawDot(x, y);
    }
  }
}

function drawSaucerShots(_state, _renderer) {
  // I-10 — same as drawPlayerShots but for saucer's 2 shot slots.
}

function scoreLivesDraw(_state, _renderer) {
  // $724F — emits LABS opcodes (3 $7C03 callsites at $725E /
  // $72A2 / $72BF) and matching JSRs for score digits, lives icons,
  // and copyright. Body in I-12 / I-7-trailer.
}

function closingEmit(_state, _renderer) {
  // $686D — LDA #$7F; TAX; JSR $7C03. Emits one LABS opcode at
  // DVG coords (~127×4 = ~508, ~127×4 = ~508) — roughly mid-
  // screen — with whatever globalScale was last set into ram.$00.
  // Likely a sentinel for the credits/copyright JSR that follows.
  // Body fleshed out when the per-object draws need their
  // surrounding LABS context.
}

function emitHalt(_state, _renderer) {
  // $7BC0 — writes $B0 (HALT opcode) to the cursor. In JS the
  // canvas frame ends when the rAF callback returns; nothing to
  // do here. Kept as a citation point.
}
