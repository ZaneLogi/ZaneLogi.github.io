// lemmings/src/particle_burst.js
//
// §21.4 The explosion scatter — an authored *procedural ballistic burst*.
//
// When a lemming explodes (§15.14) it is removed and a burst of pixels is thrown from its
// death point, playing for the post-explosion hold (`particleTimer`, §11.3 — 52 frames)
// and then cleared. This is pure presentation, strictly downstream of the sim (§1.6): the
// frame pump never reads a particle position, so the burst may be driven by a seed without
// touching determinism. This module is therefore a **pure function** of `(seed, elapsed)` —
// it holds no state, so the renderer recomputes an identical burst every render frame and
// the whole thing self-clears when `particleTimer` reaches 0.
//
// The distribution is fitted to the original 51×80 particle table (Lemmix `Particles.dat`),
// which is itself an integer-rounded ballistic integration: horizontal velocity constant
// (no sideways gravity), a shared downward gravity g ≈ 0.206 px/frame², particles launched
// upward (≈58–120°) with a heavy-tailed speed (median ≈2.3, a few to ~29 px/frame), each
// retiring after a random lifetime. We reproduce that *model* rather than the table — the
// spec (§21.4) frees the trajectories and colours; only "a burst of the hold duration plays
// then clears" is normative.

export const PARTICLE_COUNT = 80;         // particles per burst
export const PARTICLE_HOLD = 52;          // frames — matches the sim's particleTimer (§11.3)
export const PARTICLE_GRAVITY = 0.206;    // px/frame² downward — fitted from the reference table

// Authored colour cycle (colours are free, §21.4) — warm sparks fading to ash. Indexed by
// particle, so a burst shows a stable spread of tones like the reference's 16-colour cycle.
export const PARTICLE_COLORS = [
  '#ffffff', '#ffef9c', '#ffd45a', '#ffb03a', '#ff7e2a',
  '#e9d9b0', '#c9b48c', '#9a8f7a', '#b9b1a1', '#7c7568',
];

// Deterministic hash → uniform [0, 1) from three integer inputs. Stateless, so the same
// (seed, particle, salt) always yields the same draw — this is what makes the burst a pure
// function that can be recomputed each frame without jitter.
function hash01(a, b, c) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The live particles of one burst, `elapsed` frames after detonation.
 *
 * @param {number} seed     a stable per-lemming identifier (its list index) — distinct seeds
 *                          give distinct bursts.
 * @param {number} elapsed  frames since detonation, `PARTICLE_HOLD − particleTimer` (0…51).
 * @returns {{dx:number, dy:number, ci:number}[]}  each particle's pixel offset from the
 *          death point and its colour index (mod `PARTICLE_COLORS.length`). Particles that
 *          have out-lived their random lifetime are omitted, so the burst thins over time.
 */
export function burstParticles(seed, elapsed) {
  const out = [];
  const t = elapsed;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Launch angle — upward-biased, ~normal via the mean of two uniforms (central limit),
    // 90° = straight up, clamped to the observed 42…138° cone.
    const ua = (hash01(seed, i, 0) + hash01(seed, i, 1)) * 0.5;
    let angDeg = 90 + (ua - 0.5) * 100;
    if (angDeg < 42) angDeg = 42; else if (angDeg > 138) angDeg = 138;
    const ang = angDeg * (Math.PI / 180);

    // Speed — heavy-tailed (exponential): most sparks slow, a rare few fast. Capped so the
    // fastest don't dominate; ones that fly past the viewport are simply culled by the caller.
    const us = hash01(seed, i, 3);
    const speed = Math.min(0.7 - 3.2 * Math.log(1 - us), 28);

    const vx = speed * Math.cos(ang);
    const vy = -speed * Math.sin(ang);           // up is −y

    // A small initial puff so frame 0 isn't a single point (reference P0 spreads a few px,
    // biased ~4px above the foot anchor).
    const px0 = (hash01(seed, i, 4) - 0.5) * 6;
    const py0 = -4 + (hash01(seed, i, 5) - 0.5) * 6;

    // Random lifetime, biased long (u³ concentrates near 0 ⇒ most live near the full hold,
    // a few die early) — this is what thins the burst as it falls.
    const life = PARTICLE_HOLD - Math.floor(hash01(seed, i, 6) ** 3 * 42);
    if (t >= life) continue;

    // Ballistic position: constant horizontal velocity, gravity on the vertical.
    out.push({
      dx: px0 + vx * t,
      dy: py0 + vy * t + 0.5 * PARTICLE_GRAVITY * t * t,
      ci: i % PARTICLE_COLORS.length,
    });
  }
  return out;
}
