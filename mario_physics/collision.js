// ----------------------
// Collision detection & response
// ----------------------
// An actor proposes its motion for a step as a velocity; the world is the
// authority on how much of that motion is actually possible. This resolver is
// that authority — it advances the actor by its velocity and constrains it
// against solid tiles, then reports the outcome as a `contacts` struct the actor
// reads on its next step.
//
// It POINT-SAMPLES, it does not test a box. An actor's type names the points, in
// the actor's own space, and `LevelMap.isSolidAt` is a point query. This is SMB's
// model: PlayerBGCollision reads BlockBuffer_X_Adder / _Y_Adder at fixed offsets
// from the sprite block's origin — there is no hitbox anywhere in the source. See
// docs/research_smb_collision.md.
//
// Two foot probes rather than one bottom edge is the load-bearing part: an actor is
// supported if EITHER foot finds solid, which is ledge forgiveness, and which a
// bounding box cannot express.
//
// The two axes are resolved independently — advance X and resolve X, then advance Y
// and resolve Y. Handling one direction at a time keeps tile collisions stable at
// corners, where a single combined move could snap the actor to the wrong side.
//
// (SMB instead integrates both axes and probes once, which is why it needs the `$05`
// penetration-depth gate to tell "landed on it" from "walked into it" — one pass
// makes a foot probe ambiguous. Resolving per axis answers the same question
// structurally: a hit during the X pass IS a wall, a hit during the Y pass IS a
// floor. The gate is that constraint's solution, not a behaviour, so it is
// deliberately not ported.)
//
// Solid ENVIRONMENT objects are collided against in the same call, with the same
// probe points — but snapped to the object's own FACE rather than a grid line,
// which is what lets a free 16 px block sit off the 32 px grid. It is a SEPARATE
// pass so the grid path stays bit-identical: with no env solids it runs no code.
// `contacts` then names WHAT each side touched (`bumped` / `groundRef` →
// {kind:'tile', …} | {kind:'env', obj}) so the world can react to it and, later,
// carry a rider on a moving one.

const EPS = 0.01;

// Probe points for an actor whose type does not name any: the corners of its
// `size` box. These reproduce the box model exactly — same points, same snaps — so
// an actor that has not been given real probes behaves as it always did.
function defaultProbes(w, h) {
  return {
    head:  { xs: [0, w - 1], y: 0 },
    feet:  { xs: [0, w - 1], y: h },
    left:  { x: 0, ys: [EPS, h - 1 - EPS] },
    right: { x: w, ys: [EPS, h - 1 - EPS] },
  };
}

// Nearest solid env object whose rect contains any of the probe points, plus the
// face to snap to. `points` are [x, y] pairs in world space; axis 'x' yields a
// left/right face, 'y' a top/bottom face; `dir` +1 takes the near face in the +
// direction (min), −1 the far face (max). Point-in-rect is half-open [o, o+size),
// matching the grid's floor-based cell test. Linear scan — fine for a handful of
// objects; a spatial index is a later optimisation.
function envHit(env, points, axis, dir) {
  let best = null; // { face, obj }
  for (const o of env) {
    if (!o.def.solid) continue;
    const inside = points.some(([x, y]) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
    if (!inside) continue;
    const face = axis === 'x' ? (dir > 0 ? o.x : o.x + o.w) : (dir > 0 ? o.y : o.y + o.h);
    if (best === null || (dir > 0 ? face < best.face : face > best.face)) best = { face, obj: o };
  }
  return best;
}

/**
 * Integrates the actor's velocity into its position one fixed step, resolving
 * collisions per axis (grid tiles, then solid env objects) and zeroing blocked
 * velocity components.
 *
 * @param {object}   actor       An Actor with x, y, vx, vy, and either `probes` or w/h.
 * @param {LevelMap} levelMap    The tile map to collide against.
 * @param {object[]} envObjects  Environment objects; solid ones are collided against.
 * @param {number}   dt          The fixed timestep, in seconds (1/60).
 * @returns {{ground: boolean, ceiling: boolean, left: boolean, right: boolean, bumped: object|null, groundRef: object|null}}
 *          Which sides ended the step in contact, and (bumped/groundRef) what was touched.
 */
export function resolveCollision(actor, levelMap, envObjects, dt) {
  const T = levelMap.tileSize;
  const solid = (x, y) => levelMap.isSolidAt(x, y);
  const env = envObjects ?? [];
  const step = dt * 60; // constants are tuned for 60 FPS; keep them frame-rate independent
  const contacts = { ground: false, ceiling: false, left: false, right: false, bumped: null, groundRef: null };
  const P = actor.probes ?? defaultProbes(actor.w, actor.h);

  // --- HORIZONTAL: move, then resolve ---
  // Direction is captured before resolving: the grid pass may zero the velocity, and
  // the env pass that follows still needs to know which way the actor was going.
  const goingRight = actor.vx > 0, goingLeft = actor.vx < 0;
  actor.x += actor.vx * step;
  if (actor.vx > 0) {
    const px = actor.x + P.right.x;
    if (P.right.ys.some((y) => solid(px, actor.y + y))) {
      actor.x = Math.floor(px / T) * T - P.right.x - EPS;
      actor.vx = 0;
      contacts.right = true;
    }
  } else if (actor.vx < 0) {
    const px = actor.x + P.left.x;
    if (P.left.ys.some((y) => solid(px, actor.y + y))) {
      actor.x = Math.floor(px / T + 1) * T - P.left.x;
      actor.vx = 0;
      contacts.left = true;
    }
  }
  if (env.length) { // env solids, same probes, snapped to the object's own face
    if (goingRight) {
      const px = actor.x + P.right.x;
      const hit = envHit(env, P.right.ys.map((y) => [px, actor.y + y]), 'x', +1);
      if (hit) { actor.x = hit.face - P.right.x - EPS; actor.vx = 0; contacts.right = true; }
    } else if (goingLeft) {
      const px = actor.x + P.left.x;
      const hit = envHit(env, P.left.ys.map((y) => [px, actor.y + y]), 'x', -1);
      if (hit) { actor.x = hit.face - P.left.x; actor.vx = 0; contacts.left = true; }
    }
  }

  // --- VERTICAL: move, then resolve ---
  const goingDown = actor.vy > 0, goingUp = actor.vy < 0;
  actor.y += actor.vy * step;
  if (actor.vy > 0) { // falling — supported if EITHER foot finds solid
    const py = actor.y + P.feet.y;
    if (P.feet.xs.some((x) => solid(actor.x + x, py))) {
      actor.y = Math.floor(py / T) * T - P.feet.y - EPS;
      actor.vy = 0;
      contacts.ground = true;
    }
  } else if (actor.vy < 0) { // rising: head-bump from below
    const py = actor.y + P.head.y;
    const hit = P.head.xs.find((x) => solid(actor.x + x, py));
    if (hit !== undefined) {
      // Name the bumped tile (from the pre-snap head position) so the world can
      // react to it — e.g. a ? block. Detection only; the resolver stays unaware
      // of what any tile does.
      contacts.bumped = { kind: 'tile', tx: Math.floor((actor.x + hit) / T), ty: Math.floor(py / T) };
      actor.y = Math.floor(py / T + 1) * T - P.head.y;
      actor.vy = 0;
      contacts.ceiling = true;
    }
  } else {
    // vy === 0: not moving vertically, probe just below for standing ground
    const py = actor.y + P.feet.y + 1;
    if (P.feet.xs.some((x) => solid(actor.x + x, py))) contacts.ground = true;
  }
  if (env.length) { // env solids, vertical — name the object hit (groundRef / bumped)
    if (goingDown) {
      const py = actor.y + P.feet.y;
      const hit = envHit(env, P.feet.xs.map((x) => [actor.x + x, py]), 'y', +1);
      if (hit) { actor.y = hit.face - P.feet.y - EPS; actor.vy = 0; contacts.ground = true; contacts.groundRef = { kind: 'env', obj: hit.obj }; }
    } else if (goingUp) {
      const py = actor.y + P.head.y;
      const hit = envHit(env, P.head.xs.map((x) => [actor.x + x, py]), 'y', -1);
      if (hit) { contacts.bumped = { kind: 'env', obj: hit.obj }; actor.y = hit.face - P.head.y; actor.vy = 0; contacts.ceiling = true; }
    } else {
      const py = actor.y + P.feet.y + 1;
      const hit = envHit(env, P.feet.xs.map((x) => [actor.x + x, py]), 'y', +1);
      if (hit) { contacts.ground = true; contacts.groundRef = { kind: 'env', obj: hit.obj }; }
    }
  }

  return contacts;
}
