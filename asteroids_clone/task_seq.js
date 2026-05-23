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
// HUD/attract). For I-7 these are intentionally empty stubs.
//
// Drawing emit: per-object draws (ship, asteroid, saucer, shots)
// will be emitted INSIDE the per-object update routines below — the
// source structure has the gameplay routines themselves call the
// $7C03 LABS-emit helper as they update each slot. No mainListBuild;
// see the "Per-object globalScale" section in docs/progress.md.

// ----- Frame-rate gate (NMI $5B + main-loop $6811-$6813) -----
//
// The cabinet's NMI ticks $5B at 250 Hz; the main loop drains it at
// ~62.5 Hz via LSR/BCC. In JS we drive ticks from the
// requestAnimationFrame loop's fixed-timestep accumulator (see
// main.js), so frameGate is a no-op here — it exists so we can
// trace the source dispatch path one-to-one if we ever need to.

export function tick(state) {
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
      finishFrame(state);
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

  asteroidUpdate(state);     // $6F57 — iterates all 35 object slots
  collisions(state);         // $69F0

  finishFrame(state);
  advanceTimers(state);
}

function finishFrame(state) {
  // The source's frame trailer at $6864-$6873:
  scoreLivesDraw(state);     // $724F
  soundDispatch(state);      // $7555 — per-frame sound channel updates (R-G)
  closingEmit(state);        // $686D — single LABS at (~mid-screen) with inherited gs
  advanceRNG(state);         // $77B5
  emitHalt(state);           // $7BC0
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

function playerFire(_state) {
  // $6CD7 — read SWFIRE, spawn shot in $021F-$0222 slot if room.
  // Body in I-8 (ship physics + fire).
}

function shipControl(_state) {
  // $6E74 — read SWHYPER + SWROTLEFT/RIGHT, run hyperspace, update
  // ship.direction. Body in I-8.
}

function shipSpawnPhys(_state) {
  // $703F — spawn timer + thrust accumulator → ship.vx/vy update.
  // Body in I-8.
}

function saucerSpawn(_state) {
  // $6B93 — saucer spawn (every 4th frame), dispatch to active-
  // saucer logic at $6C34. Body in I-10.
}

function asteroidUpdate(_state) {
  // $6F57 — iterates all 35 object slots; per-slot calls $6FC7
  // motion (or $7708 explosion anim if status high bit set).
  // Also emits the asteroid draw via $7C03 (see $6F48 caller).
  // Body in I-9 (asteroids) + I-8 (ship) + I-10 (saucer) since
  // this routine iterates ALL object types.
}

function collisions(_state) {
  // $69F0 — pairwise distance tests, splits, scoring, explosion
  // spawn. Body in I-11.
}

function scoreLivesDraw(_state) {
  // $724F — emits LABS opcodes (3 $7C03 callsites at $725E /
  // $72A2 / $72BF) and matching JSRs for score digits, lives icons,
  // and copyright. Body in I-12 / I-7-trailer.
}

function soundDispatch(_state) {
  // $7555 — per-frame sound-channel updates. Writes SNDSAUCR /
  // SNDSFIRE / SNDTHRUST / SNDFIRE / SNDTHUMP / SNDEXP. Body in
  // R-G (deferred until silent game runs).
}

function closingEmit(_state) {
  // $686D — LDA #$7F; TAX; JSR $7C03. Emits one LABS opcode at
  // DVG coords (~127×4 = ~508, ~127×4 = ~508) — roughly mid-
  // screen — with whatever globalScale was last set into ram.$00.
  // Likely a sentinel for the credits/copyright JSR that follows.
  // Body fleshed out when the per-object draws need their
  // surrounding LABS context.
}

function advanceRNG(state) {
  // $77B5 — 8-bit LFSR using $5F as state. Body in the missing
  // ~20% disasm region; cross-reference Mikstas's alt-disassembly
  // when a gameplay step (saucer-direction, hyperspace teleport)
  // actually needs randomness. Placeholder advance keeps the
  // tick visibly progressing.
  state.rng = ((state.rng ?? 0) + 1) & 0xFF;
}

function emitHalt(_state) {
  // $7BC0 — writes $B0 (HALT opcode) to the cursor. In JS the
  // canvas frame ends when the rAF callback returns; nothing to
  // do here. Kept as a citation point.
}
