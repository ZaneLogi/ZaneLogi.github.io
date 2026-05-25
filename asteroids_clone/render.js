// asteroids_clone/render.js
//
// Per-frame render stubs — called from task_seq.js's `render(state, renderer)`
// dispatch in painted-frame order. Each function ports one of the source's
// per-object draw emit sites or the frame-trailer routines:
//   drawAsteroids / drawShip / drawSaucer / drawPlayerShots / drawSaucerShots
//     — the per-slot draws in source's $6F57 dispatch + $72FE per-slot LABS.
//   scoreLivesDraw / closingEmit / emitHalt
//     — the frame-trailer sites at $724F / $686D / $7BC0.
//
// Extracted from task_seq.js during the I-11/I-12 boundary refactor so the
// "sim/render split" note in task_seq.js's header becomes an actual module
// boundary, not just a per-function convention. See task_seq.js's
// "Port deviation — sim/render split" comment for the underlying intent.
//
// The functions receive (state, renderer); they call into `renderer.drawAt`,
// `renderer.drawDot`, `renderer.drawShipExplosionPiece` (the canvas-side
// renderer object built in main.js).

import { GAME_TO_DVG } from './world.js';

export function drawShip(state, renderer) {
  // Alive branch: $750B — ship.shapeSelection() returns the right ShipDirN
  // + flip flags for the current 8-bit direction. gs from $7027 = 14 (ship
  // status=1 → high nibble $E stored at ram.$00 → upper nibble of LABS).
  if (state.ship.status === 1) {
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
    return;
  }

  // Exploding branch: $7465-$7508 — emit one SVEC per active fragment
  // at ship.dvgPos() + fragment[i] offset converted to DVG-coord.
  // Active count from research_ship_explosion.md §5.1's formula:
  //   ((~status) & 0x70) >> 4 + 1, simplified below as 6 → 1 across stages.
  if (state.ship.status >= 0x80) {
    // Stage 0 ($A0..$AF) = 6 frags, stage 5 ($F0..$FF) = 1 frag.
    const stage = (state.ship.status - 0xA0) >> 4;   // 0..5
    const activeCount = Math.max(1, 6 - stage);
    // **Port deviation: fixed gs = 0 across all stages** (current experiment
    // 2026-05-25). Source cycles gs through 0/14/15 per status bits 0,1,
    // which on a vector CRT integrates via phosphor decay into a "growing
    // star" perception. Our canvas clears each frame (no phosphor), so
    // per-frame cycling reads as shape-morphing (the bullet/comet artifact
    // the user observed). Earlier progressive-gs experiments (15→0 step,
    // and 14→15→0 step) had visible discontinuities at each gs change.
    // Fixed gs=0 gives stable per-fragment shape (lengths 4-12 px) with
    // visible drift driving the "spreading" feel.
    const gs = 0;
    // **Port deviation: fragment alpha fades from 1.0 (status $A0) → 0.2
    // (status $FF).** Approximates the cabinet's phosphor-decay fade-out
    // — fragments visibly dim as the explosion ages, in addition to the
    // count-decay (6 → 1). Min alpha 0.2 floor so the last fragments
    // remain visible up to the moment they vanish. Linear ramp across
    // the status range.
    const alpha = 0.2 + 0.8 * (0xFF - state.ship.status) / 0x5F;
    const shipDvg = state.ship.dvgPos();
    for (let i = 0; i < activeCount; i++) {
      const frag = state.ship.shipExplosionFragments[i];
      const cursor = {
        x: shipDvg.x + frag.x * GAME_TO_DVG,
        y: shipDvg.y + frag.y * GAME_TO_DVG,
      };
      renderer.drawShipExplosionPiece(i, cursor, gs, alpha);
    }
  }
}

export function drawAsteroids(state, renderer) {
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

export function drawSaucer(state, renderer) {
  // Per-slot dispatcher $72FE-$7383 routes the saucer slot ($1C) two
  // ways based on the exploding-flag check at $7343:
  //   alive ($7363-$7382): JSR into VROM's UFO subroutine
  //     gs from $7018-$7025 (shared with asteroid alive path): small=1
  //     → gs=14, large=2 → gs=15. Mod-16 wrap (research_dvg.md §4) +
  //     local scales render gs=14 smaller than gs=15 (cabinet behavior).
  //   exploding ($7345-$7353): falls into the same Shrapnel-cycling
  //     path as exploding asteroids ($72FE CPX #$1B skip → $7349 picks
  //     Shrapnel from status bits 2,3 via $50F8 jump table). Across-
  //     sweep gs expansion via $7321's LABS opcode is also shared,
  //     using the same mod-16 wrap trick.
  if (state.saucer.status === 0) return;
  if (state.saucer.status < 0x80) {
    renderer.drawAt('UFO', state.saucer.dvgPos(), state.saucer.globalScale());
  } else {
    // Same formula as drawAsteroids' exploding branch (see that comment
    // for the full $7349-$7353 + $7321 LABS decode).
    const shrapnelIdx = (state.saucer.status & 0x0c) >> 2;
    const gs = (((state.saucer.status >> 4) + 1) & 0x0f);
    renderer.drawAt(`Shrapnel${4 - shrapnelIdx}`, state.saucer.dvgPos(), gs);
  }
}

export function drawPlayerShots(state, renderer) {
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

export function drawSaucerShots(state, renderer) {
  // $7384-$738B — saucer-shot slots ($1D, $1E) emit a single dot per shot.
  // Source uses the same emit path as player shots; JS draws via the
  // renderer's drawDot (the cabinet's zero-length VEC via $7CE0).
  for (const shot of state.saucerShots) {
    if (shot.status > 0) {
      const { x, y } = shot.dvgPos();
      renderer.drawDot(x, y);
    }
  }
}

export function scoreLivesDraw(state, renderer) {
  // $724F — HUD render (I-11a). Player-1 score + player-1 lives only;
  // 2-player score mirror ($72BF), high-score display ($72A2), and
  // attract-mode text are deferred to I-12. See research_hud_coords.md
  // §4 + §7 for the decoded LABS coordinates.

  // $725E — player-1 score LABS at DVG (100, 876) gs=1, then 5 digit
  // JSRs. Score lives in scoreThousands:scoreTens BCD bytes plus an
  // implicit trailing zero (cabinet score is always a multiple of 10).
  // Digit-0 renders as Char_O via the $56D4 cross-reference table —
  // VROM has no Char_0 entry (research_hud_coords.md §6.1).
  const scoreCursor = { x: 100, y: 876 };
  const digits = [
    (state.scoreThousands >> 4) & 0x0f,   // 10,000s
    state.scoreThousands & 0x0f,           // 1,000s
    (state.scoreTens >> 4) & 0x0f,        // 100s
    state.scoreTens & 0x0f,                // 10s
    0,                                      // implicit ones place
  ];
  for (const d of digits) {
    const name = d === 0 ? 'Char_O' : `Char_${d}`;
    renderer.drawAt(name, scoreCursor, 1);
  }

  // $6F48 — player-1 lives LABS at DVG (160, 852) gs=14, then curShips
  // × LivesIcon JSRs. Per-icon stride is encoded in LivesIcon's own
  // SVECs (the runList cursor advances naturally as each subroutine
  // executes). Source's $6F3E BEQ $6F56 skips the whole emit when
  // ply1CurShips == 0; we mirror with the guard.
  if (state.curShips > 0) {
    const livesCursor = { x: 160, y: 852 };
    for (let i = 0; i < state.curShips; i++) {
      renderer.drawAt('LivesIcon', livesCursor, 14);
    }
  }
}

export function closingEmit(_state, _renderer) {
  // $686D — LDA #$7F; TAX; JSR $7C03. Emits one LABS opcode at
  // DVG coords (~127×4 = ~508, ~127×4 = ~508) — roughly mid-
  // screen — with whatever globalScale was last set into ram.$00.
  // Likely a sentinel for the credits/copyright JSR that follows.
  // Body fleshed out when the per-object draws need their
  // surrounding LABS context.
}

export function emitHalt(_state, _renderer) {
  // $7BC0 — writes $B0 (HALT opcode) to the cursor. In JS the
  // canvas frame ends when the rAF callback returns; nothing to
  // do here. Kept as a citation point.
}
