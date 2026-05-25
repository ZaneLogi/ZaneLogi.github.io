// asteroids_clone/collisions.js
//
// Collision kernel + resolution + BCD scoring. Ports $69F0-$6A95 (the
// per-frame collision kernel) + $6B0F-$6B65 (resolution dispatcher) +
// $75EC-$760A (asteroid-hit handler) + $7397-$73B1 (BCD score adder).
//
// Extracted from task_seq.js during the I-11/I-12 boundary refactor.
// All seven functions stay together because they form one tightly-
// coupled module:
//   - `collisions` (exported) — the per-frame collision pass
//   - `resolveShotVsAsteroid` / `resolveShotVsSaucer` — per-pair resolvers
//   - `killAsteroid` — shared kill-asteroid logic (downgrade + child spawn
//     + scoring gate)
//   - `asteroidScoreByte` — size→BCD lookup (port deviation from source's
//     LSR/TAX path; see I-11b notes in progress.md)
//   - `addScore` / `bcdAdd` — BCD score adder + carry propagation
//
// External dependency: `splitAsteroid` from task_seq.js. Imports cross
// the module boundary (collisions imports from task_seq; task_seq imports
// `collisions` back). The circular reference is safe under ESM because
// both bindings are used lazily inside function bodies, never at module
// top-level.

import { splitAsteroid } from './task_seq.js';

export function collisions(state) {
  // $69F0-$6A95 — collision kernel. Source outer-loop X iterates 0 (ship),
  // 1 (saucer), 2-3 (saucer shots), 4-7 (player shots) — pairs added per
  // sub-step (I-11b shot-vs-asteroid, I-11c shot-vs-saucer, I-11d+f ship-
  // vs-asteroid, I-11g saucer-shot-vs-*, I-11h saucer-vs-*).
  //
  // Source uses BB collision: |dx| < r AND |dy| < r (= square region of
  // half-side r). Earlier port deviation used plain Euclidean (dx²+dy²<r²)
  // which is 79% the area of source's BB — missed ~21% of corner-case
  // hits where |dx| AND |dy| are both near r. Reverted to source-faithful
  // BB everywhere per user observation 2026-05-25 (ship-vs-asteroid felt
  // too forgiving). All collision pairs in this function use BB.

  // ----- X=0: ship-vs-asteroid (I-11d folded in I-11f) -----
  // Ship can only be hit when alive (status === 1). Source $69F0-$69FA
  // skips this loop when ship is exploding or absent.
  if (state.ship.status === 1) {
    for (const ast of state.asteroids) {
      if (ast.status === 0 || ast.status >= 0x80) continue;
      const dx = ast.x - state.ship.x;
      const dy = ast.y - state.ship.y;
      if (Math.abs(dx) >= 2 || Math.abs(dy) >= 2) continue;
      // $6A55 table + $6A67 ADC #$1C ship-radius adjust: source adds $1C
      // (= 28) halved-unit, which is +56/256 game-coord after the ×2
      // halved-unit correction (research_collisions.md §3). So ship hit-
      // radii: small=(84+56)/256, medium=(144+56)/256, large=(264+56)/256.
      let r;
      if (ast.status & 0x01)      r = (84 + 56) / 256;
      else if (ast.status & 0x02) r = (144 + 56) / 256;
      else                        r = (264 + 56) / 256;
      // **Port deviation reverted to source-faithful BB.** Source's
      // $6A77-$6A7D checks |dx|<r AND |dy|<r (bounding box). The earlier
      // Euclidean check (dx²+dy²<r²) missed ~21% of cabinet-valid hits
      // — specifically glancing-angle ram-ins where |dx| and |dy| are
      // both near r. User feedback 2026-05-25 — ship-vs-asteroid felt
      // too forgiving. BB matches source exactly.
      if (Math.abs(dx) < r && Math.abs(dy) < r) {
        // $6B1E + $760C — kill ship AND score the asteroid kill (X=0
        // shooter path scores per $760C-$7612).
        state.ship.kill(state);
        killAsteroid(state, ast, true);
        break;  // $6A94 JMP $69F9: one collision per frame
      }
    }
  }

  // ----- X=4-7: player-shot-vs-asteroid + shot-vs-saucer (I-11b/I-11c) -----
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
      // BB collision per source $6A77-$6A7D (see top-of-function comment).
      if (Math.abs(dx) < r && Math.abs(dy) < r) {
        resolveShotVsAsteroid(state, shot, ast);
        // $6A94 JMP $69F9 — source aborts the inner loop on hit so one
        // shot only resolves against one asteroid per frame. I-9h missed
        // this; latent until scoring landed in I-11b (without scoring,
        // 1 vs N dead asteroids per shot looked identical).
        break;
      }
    }

    // Skip shot-vs-saucer if this shot already killed an asteroid —
    // matches source's outer-loop early-exit semantics. Still useful
    // even with the inner-loop break above, since `shot.status===0`
    // (set by resolveShotVsAsteroid) is the same single-resolve-per-
    // frame guarantee at a different scope.
    if (shot.status === 0) continue;

    // Shot-vs-saucer collision (I-10f). Source's outer loop $69F0-$69FA
    // hits player-shot slots ($1F-$22) at the X=$04-$07 mapping; inner
    // Y iterates down from $1C (= saucer) per $69FD-$6A09. The radius
    // calc at $6A55-$6A65 picks asteroid-size-style radii from the
    // saucer's status low bits (status=1 small → r=42, status=2 large →
    // r=72), then the saucer-specific adjustment block at $6A6B-$6A75
    // is UNREACHABLE per I-9 audit ($6A69 BNE always branches), so the
    // effective radii match small/medium asteroid values exactly. The
    // halved-unit correction (×2) from I-9h applies the same way here.
    if (state.saucer.status > 0 && state.saucer.status < 0x80) {
      const dx = state.saucer.x - shot.x;
      const dy = state.saucer.y - shot.y;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
        const r = state.saucer.status === 1 ? 84 / 256 : 144 / 256;
        // BB collision per source $6A77-$6A7D (see top-of-function comment).
        if (Math.abs(dx) < r && Math.abs(dy) < r) {
          resolveShotVsSaucer(state, shot, state.saucer);
        }
      }
    }
  }

  // ----- X=2,3: saucer-shot vs ship + asteroid (I-11g) -----
  // Outer loop over saucer shots. Inner Y starts at ship slot ($1B) per
  // $69FD-$6A08, then walks down through all asteroid slots. Saucer-shot
  // is the shooter, so $760E-$7612 score gate fails (no scoring on
  // asteroid kills). No $1C shooter-radius adjustment (X=2/3, not 0).
  for (const shot of state.saucerShots) {
    if (shot.status === 0) continue;

    // Saucer-shot vs ship: kill shot + Ship.kill. No score.
    if (state.ship.status === 1) {
      const dx = state.ship.x - shot.x;
      const dy = state.ship.y - shot.y;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
        // Ship-target picks $6A55's $2A (=42 halved-unit, =84/256 game-coord
        // raw) via $0B's low bit being ship.status=1.
        const r = 84 / 256;
        if (Math.abs(dx) < r && Math.abs(dy) < r) {
          shot.status = 0;
          state.ship.kill(state);
          continue;  // $6A94 JMP $69F9: shot dies → outer-loop continues
        }
      }
    }

    // Saucer-shot vs asteroid: kill shot + killAsteroid(no score).
    for (const ast of state.asteroids) {
      if (ast.status === 0 || ast.status >= 0x80) continue;
      const dx = ast.x - shot.x;
      const dy = ast.y - shot.y;
      if (Math.abs(dx) >= 2 || Math.abs(dy) >= 2) continue;
      let r;
      if (ast.status & 0x01)      r = 84 / 256;
      else if (ast.status & 0x02) r = 144 / 256;
      else                        r = 264 / 256;
      if (Math.abs(dx) < r && Math.abs(dy) < r) {
        shot.status = 0;
        killAsteroid(state, ast, false);   // false: no score (saucer shooter)
        break;
      }
    }
  }

  // ----- X=1: saucer body vs ship + asteroid (I-11h) -----
  // Source's $6B0F-$6B19 X-swap: for saucer-vs-ship, source remaps
  // (X=1, Y=$1B) to (X=0, Y=$1C) — treats it as "ship-vs-saucer" so the
  // $6B73-$6B90 saucer-score path fires (ship gets 200/990 saucer pts
  // even though it's the saucer who initiated the collision). For
  // saucer-vs-asteroid, the X=1 path falls through to $6B29 (mark both
  // exploding, no score because shooter index $0D = 1 fails the
  // $760E-$7612 gate).
  if (state.saucer.status > 0 && state.saucer.status < 0x80) {
    let saucerHit = false;

    // Saucer-vs-ship: both die, ship scores saucer points (200/990).
    if (state.ship.status === 1) {
      const dx = state.ship.x - state.saucer.x;
      const dy = state.ship.y - state.saucer.y;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
        // Radius from $0B = saucer.status low bits (1=small, 2=large) via
        // $6A55-$6A61's LSR chain. No $1C adjust (X=1 outer-loop).
        const r = state.saucer.status === 1 ? 84 / 256 : 144 / 256;
        if (Math.abs(dx) < r && Math.abs(dy) < r) {
          state.ship.kill(state);
          // $6B73-$6B76 saucerTimer re-arm + $6B85-$6B8B scoring.
          // Small=$99 (990 pts), large=$20 (200 pts) — matches $6B81's LSR
          // on saucer.status: bit 0 set (small) → carry → keep $99.
          if (state.numPlayers !== 0) {
            addScore(state, state.saucer.status === 1 ? 0x99 : 0x20);
          }
          state.saucerTimer = state.saucerTimeReload;
          // Mark saucer exploding ($A0 + zero vel). Source $6B29-$6B33
          // (after X-swap, X=0 so $021B,X = ship; $6B47-$6B73 separately
          // marks Y=$1C as exploding via $6B4A-$6B65 common path).
          state.saucer.status = 0xA0;
          state.saucer.vx = 0;
          state.saucer.vy = 0;
          saucerHit = true;
        }
      }
    }

    // Saucer-vs-asteroid: both die, no score.
    if (!saucerHit) {
      for (const ast of state.asteroids) {
        if (ast.status === 0 || ast.status >= 0x80) continue;
        const dx = ast.x - state.saucer.x;
        const dy = ast.y - state.saucer.y;
        if (Math.abs(dx) >= 2 || Math.abs(dy) >= 2) continue;
        let r;
        if (ast.status & 0x01)      r = 84 / 256;
        else if (ast.status & 0x02) r = 144 / 256;
        else                        r = 264 / 256;
        if (Math.abs(dx) < r && Math.abs(dy) < r) {
          state.saucer.status = 0xA0;
          state.saucer.vx = 0;
          state.saucer.vy = 0;
          // saucerTimer re-arm happens at explosion-completion ($6F99-$6F9F),
          // not at hit-time for this path. The asteroidUpdate saucer-
          // exploding branch already handles that.
          killAsteroid(state, ast, false);
          break;
        }
      }
    }
  }
}

// $6B0F-$6B65 + $75EC subset — shot-vs-asteroid resolution. Kills shot
// + scores + kills asteroid via shared killAsteroid helper.
function resolveShotVsAsteroid(state, shot, ast) {
  // $6B3C-$6B3E — kill the shot.
  shot.status = 0;
  // $760C-$761B player-shot scoring path: shooter index $0D == 0 (ship)
  // → score; saucer-shot shooter (X=2/3) skips this path (I-11g).
  killAsteroid(state, ast, true);
}

// $75EE-$7625 — common kill-asteroid logic: hit timer + size downgrade +
// up to 2 child spawns via splitAsteroid + mark parent exploding. Used by
// shot-vs-asteroid (I-11b, scores), ship-vs-asteroid (I-11f, scores),
// saucer-shot-vs-asteroid (I-11g, no score), saucer-vs-asteroid (I-11h,
// no score). Scoring is gated by the caller via shouldScore.
function killAsteroid(state, ast, shouldScore) {
  if (shouldScore) {
    addScore(state, asteroidScoreByte(ast));
  }

  // $75EE-$75F2 — set asteroid_hit_timer = $50 (80 frames ≈ 1.3 s @ 62.5 Hz).
  // Gates saucer-spawn dispatch ($6BC1-$6BCE) so a saucer doesn't appear
  // immediately after an asteroid hit unless the asteroid count is in
  // (0, max_rocks_for_ufo).
  state.asteroid_hit_timer = 0x50;

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

// $7659-$765B score table = [$10, $05, $02] BCD = 100/50/20 pts in
// scoreTens units (where $10 BCD = "1 hundred + 0 tens" = 100 pts).
// Cabinet scoring is small=100/medium=50/large=20 (smaller = harder to
// hit = more pts).
//
// **Port deviation.** Source's $75FF LSR/TAX path doesn't cleanly index
// the 3-byte table: status low 3 bits ∈ {$04 large, $05 small, $06 medium}
// LSR to {$02, $02, $03}, so large and small both map to X=2 (table[2]
// = $02 = 20 pts), and medium's X=3 reads past the table into adjacent
// code bytes. Port uses a direct size-bit dispatch instead, matching
// cabinet behavior.
//
// **plan_i11.md §I-11b note.** That doc lists the lookup as
// `{small: $01, medium: $05, large: $10}` — labels swapped vs cabinet
// behavior. The verify section (large → +20, small → +100) is the
// source-of-truth; using cabinet-faithful values here. Flag in the
// I-11 squash + progress.md.
function asteroidScoreByte(ast) {
  const sizeBits = ast.status & 0x03;
  if (sizeBits & 0x01) return 0x10;   // small  → 100 pts
  if (sizeBits & 0x02) return 0x05;   // medium → 50 pts
  return 0x02;                         // large  → 20 pts
}

// $7397-$73B1 — BCD score adder. SED-mode ADC of bcdByte into scoreTens
// with carry propagating to scoreThousands. Bonus-ship trigger at
// $73A4-$73AE fires when the 10k-digit (high nibble of scoreThousands)
// increments — cabinet awards one free ship per 10k pts (DIP-tunable
// to 15k/20k/none, but we use the 10k default).
function addScore(state, bcdByte) {
  const oldThousandsHi = (state.scoreThousands >> 4) & 0x0f;

  const tens = bcdAdd(state.scoreTens, bcdByte, 0);
  state.scoreTens = tens.result;

  const thous = bcdAdd(state.scoreThousands, 0x00, tens.carry);
  state.scoreThousands = thous.result;

  // $73A4-$73AE — bonus ship on 10k-digit increment.
  const newThousandsHi = (state.scoreThousands >> 4) & 0x0f;
  if (newThousandsHi !== oldThousandsHi) {
    state.curShips += 1;
  }
}

// Decimal-mode ADC equivalent: each nibble is a decimal digit (0-9),
// with intra-byte carry between nibbles when a sum reaches 10. Returns
// {result, carry}. Equivalent to the 6502 SED/ADC/CLD pattern source
// uses in $7397-$73B1.
function bcdAdd(a, b, carryIn) {
  const lowSum = (a & 0x0f) + (b & 0x0f) + carryIn;
  const lowResult = lowSum >= 10 ? lowSum - 10 : lowSum;
  const lowCarry = lowSum >= 10 ? 1 : 0;
  const highSum = ((a >> 4) & 0x0f) + ((b >> 4) & 0x0f) + lowCarry;
  const highResult = highSum >= 10 ? highSum - 10 : highSum;
  const carry = highSum >= 10 ? 1 : 0;
  return { result: (highResult << 4) | lowResult, carry };
}

// $6B0F-$6B65 + $6B73-$6B90 player-shot-vs-saucer resolver. Source path:
//   $6B3C: kill shot
//   $6B45: BCS $6B73                  → score path (I-11c)
//   $6B73-$6B76: saucerTimer = saucerTimeReload (re-arm spawn countdown)
//   $6B79-$6B7B: BEQ $6B4A             → numPlayers gate: skip scoring in attract
//   $6B81-$6B8B: LSR status → C set means small ($99 = 990 pts); else large ($20 = 200 pts)
//   $6B90: JMP $6B4A                   → fall into mark-exploding common code
//   $6B4A-$6B65: STA #$A0 / STA $0200,Y + zero velocity (saucer)
//
// I-10f did kill-shot + mark-exploding. I-11c adds the score + saucer-
// Timer re-arm. Sound timer ($6B56 STA $69) still deferred to R-G.
function resolveShotVsSaucer(state, shot, saucer) {
  shot.status = 0;

  // $6B73-$6B76 — re-arm spawn countdown unconditionally (source does this
  // BEFORE the numPlayers gate). Without this, next saucer doesn't appear
  // until saucerTimer naturally re-arms via the explosion-anim cleanup at
  // $6F99-$6F9F (~12 ticks later) — source-faithful means start the
  // countdown at hit time, not explosion-complete time.
  state.saucerTimer = state.saucerTimeReload;

  // $6B79-$6B8E — score path, gated on numPlayers != 0 (attract mode skips).
  // status 1=small / 2=large via LSR-carry: C=1 (small) → $99 = 990 pts,
  // C=0 (large) → $20 = 200 pts.
  if (state.numPlayers !== 0) {
    const bcdByte = (saucer.status & 0x01) ? 0x99 : 0x20;
    addScore(state, bcdByte);
  }

  // $6B58-$6B62 — exploding flag + zero velocity. Source's $6B58 stores
  // literal $A0, overwriting the saucer's size bits (1 or 2) — we match.
  saucer.status = 0xA0;
  saucer.vx = 0;
  saucer.vy = 0;
}
