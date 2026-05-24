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
  // (or $7708 explosion anim if status high bit set). I-8c/d ported the
  // ship-slot ($1B) + player-shot slots ($1F-$22); I-9b adds asteroid
  // slots ($00-$1A) motion; I-9e will add the explosion-anim branch;
  // saucer + saucer-shot slots fill in with I-10.
  if (state.ship.status === 1) {
    state.ship.advancePosition();
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
        // $6F82-$6F8E — explosion complete: clear slot + dec count.
        ast.status = 0;
        state.curAsteroidCount -= 1;
      }
    }
  }
}

function collisions(state) {
  // $69F0-$6A95 — collision kernel, GATED TO SHOT-VS-ASTEROID ONLY for
  // I-9h. Other pairs (ship-vs-asteroid, saucer-shot-vs-ship, etc.)
  // land in I-11 by widening this loop's outer/inner ranges and adding
  // resolution cases. Source uses BB-intersected-Manhattan threshold
  // shape; we use plain Euclidean per research_collisions.md §6 port
  // spec — visually indistinguishable, simpler code, no integer-
  // saturation edge cases.
  for (const shot of state.playerShots) {
    if (shot.status === 0) continue;   // dead shot
    for (const ast of state.asteroids) {
      if (ast.status === 0 || ast.status >= 0x80) continue;  // empty or exploding
      const dx = ast.x - shot.x;
      const dy = ast.y - shot.y;
      // Proximity gate ($6A22-$6A53): source's quadrant test accepts
      // dx_hi ∈ {0, 1, $FE, $FF}, i.e. |dx_signed| < 512 sub-tile =
      // 2 game units. NOT wrap-aware per research_collisions.md §4 —
      // matches source behavior. See §3 step 2.
      if (Math.abs(dx) >= 2 || Math.abs(dy) >= 2) continue;
      // $6A55 table values (42/72/132) are HALVED-UNIT — source's
      // $6A22 LSR/ROR folds |dx|→|dx|/2 before the CMP, so effective
      // radii in raw sub-tile units are 2× the table: 84/144/264 =
      // 10.5/18/33 DVG, ≈ Rock1 visible extent. See
      // research_collisions.md §3 steps 2+4.
      let r;
      if (ast.status & 0x01)      r = 84 / 256;   // small  (2*42)
      else if (ast.status & 0x02) r = 144 / 256;  // medium (2*72)
      else                        r = 264 / 256;  // large  (2*132)
      if (dx * dx + dy * dy < r * r) {
        resolveShotVsAsteroid(state, shot, ast);
      }
    }
  }
}

// $6B0F-$6B65 + $75EC subset — shot-vs-asteroid resolution. Kills shot,
// downgrades asteroid size, spawns up to 2 children via splitAsteroid,
// then kills the parent.
//
// For I-9h we use immediate parent kill (status = 0) instead of source's
// $A0 exploding phase. I-9e will introduce the explosion-anim delay +
// shrapnel render; at that point this resolver changes to set $A0 + zero
// velocity, and the per-frame cleanup ($7708 port) handles the eventual
// status → 0 + curAsteroidCount decrement (mirroring source's $6F82).
function resolveShotVsAsteroid(state, shot, ast) {
  // $6B3C-$6B3E — kill the shot.
  shot.status = 0;

  // $75EC size downgrade via LSR of low 2 bits:
  //   large ($04 or $00) → medium ($02)
  //   medium ($02 or $06) → small ($01)
  //   small ($01 or $05) → no children (destroy without splitting)
  // Done by mutating parent's size bits temporarily so splitAsteroid
  // copies them into the children via $6A9D pattern.
  const sizeBits = ast.status & 0x03;
  let childSizeBits = null;
  if (sizeBits === 0)      childSizeBits = 0x02;  // large → medium
  else if (sizeBits & 0x02) childSizeBits = 0x01; // medium → small
  // else small (sizeBits & 0x01): no children

  if (childSizeBits !== null) {
    // Patch parent's size bits so splitAsteroid's parent.status & $07
    // copy picks up the DOWNGRADED size for the children. Mirrors
    // source's $75FF-$7605 (LSR; STA back to parent) — parent's status
    // is overwritten momentarily before $6A9D reads it.
    ast.status = (ast.status & 0xF8) | childSizeBits;
    for (let i = 0; i < 2; i++) {
      const freeSlot = state.asteroids.find((a) => a.status === 0);
      if (!freeSlot) break;        // $7625/$763F — no free slot, skip spawn
      splitAsteroid(freeSlot, ast, state);
      state.curAsteroidCount += 1; // $7627
    }
  }

  // $6B58-$6B62 — mark parent exploding ($A0) + zero velocity. Source
  // OVERWRITES size bits with $A0 (clears them); we match.
  // curAsteroidCount decrement happens at explosion-anim completion
  // (asteroidUpdate's exploding branch — mirrors source $6F82).
  ast.status = 0xA0;
  ast.vx = 0;
  ast.vy = 0;
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
// from the shot-vs-asteroid collision resolution (after finding a free
// slot via the eventual $745A/$745C port). NOT wired to collision yet.
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

function drawAsteroids(state, renderer) {
  // $7018-$7027 + $72FE — per asteroid: emit LABS at position with
  // size-derived gs, then JSR into the right Rock_N subroutine from
  // status bits 3,4 (alive) OR Shrapnel_N subroutine from status bits
  // 2,3 (exploding). Bits 2,3 cycle as status increments during the
  // I-9e explosion animation, giving frame-by-frame shape variety.
  for (const ast of state.asteroids) {
    if (ast.status === 0) continue;
    if (ast.status < 0x80) {
      renderer.drawAt(ast.shapeSelection(), ast.dvgPos(), ast.globalScale());
    } else {
      // $7349-$734D exploding-asteroid Shrapnel selector: bits 2,3 of
      // status pick 1 of 4 Shrapnel shapes via the jump table at
      // $10F8-$10FE. The table maps (bits>>1) → {Pattern4, Pattern3,
      // Pattern2, Pattern1} — i.e. SMALLEST spread first, growing
      // outward, because the 4 patterns are concentric spreads at
      // increasing radii (VectorROM.md line 185: "all four patterns
      // are the same just slightly spread out"). Pattern 4 dots sit
      // ±10-15 px from center, pattern 1 dots sit ±16-32 px.
      // Across-sweep expansion via LABS gs. Source's $7321 calls
      // $7C1C, which OR's the position-high byte with $00 — and $00
      // holds the gs byte computed at $6FA4-$6FA9 as (status & $F0)
      // + $10. DVG extracts globalScale from word2's upper nibble,
      // so gs cycles $B, $C, $D, $E, $F, $0 across the 6 explosion
      // stages ($A_..$F_). Combined with localScale via (local+
      // global) & $0f, this exploits the mod-16 wrap (same trick as
      // asteroid gs=14/15/0 in research_dvg.md §4) to double the
      // shrapnel pattern each stage — first ~2 stages collapse to a
      // single dot (POP), then it bursts outward through 1, 2, 5,
      // 10 px and lands at "normal" (gs=0) at the final stage.
      //
      // The $7324-$7339 $90/$80/$70 emit loop is DVG-list padding;
      // per MAME's avgdvg dvg_generate_vector_list, only LABS (high
      // nibble $A) modifies scale, so these VEC opcodes are no-ops.
      const shrapnelIdx = (ast.status & 0x0c) >> 2;
      const gs = (((ast.status >> 4) + 1) & 0x0f);
      renderer.drawAt(`Shrapnel${4 - shrapnelIdx}`, ast.dvgPos(), gs);
    }
  }
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
