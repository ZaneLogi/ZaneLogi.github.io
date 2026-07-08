# Galaga Motion Model — octant vs circular (DEFERRED finding)

**Status: researched + verified 2026-06-21, DEFERRED.** The per-frame motion step
that drives every flying bug (fly-in, attack dive, homing return, capture dive)
is **circular** in the clone but an **octant scheme** in the Z80. Net result: the
clone is up to ~40% **slower on diagonals**. Deferred until the higher-priority
items are done; this doc is the spec for when we return.

**Zane's call (2026-06-21):** this WOULD fix *fly-in too slow* + *bug spacing too
tight* (real, kept on the plate). It does **NOT** fix the *boss `cont_bmb` dive
depth* — that symptom was a **Y-coordinate** problem, already resolved by the +8
corner→center Y fix (`research_coordinate_system.md` / the `d02e4c3`-line fixes).
The earlier finding over-attributed the boss-depth symptom to motion; only the
speed/spacing half is real.

---

## 1. The clone — circular [bugMotion.js:680-683]

```js
const A = (state.frameCount & 1) ? e.vx : e.vy;   // alternate magnitude by parity
e.x += A * Math.cos(angleRad);
e.y -= A * Math.sin(angleRad);                     // canvas-Y inverted
```

Speed = `A` in **every** direction (the vector `(A·cosθ, A·sinθ)` has magnitude
`A`). I.e. a circle — diagonal travel is the same speed as axis-aligned.

## 2. The Z80 — octant (primary full + proportional secondary) [verified, gg1-5.s:2150-2270]

The motion step (`l_0CA7` onward) does **not** scale the magnitude by `cos`/`sin`:

1. **Magnitude source** (gg1-5.s:2150-2157): frame parity picks `0x0A(ix)` (vx) or
   `0x0B(ix)` (vy) as this frame's magnitude `A`. *(This is the only thing the old
   "alternate axes by parity" note captured.)*
2. **Primary component** (gg1-5.s:2197-2214): `A` is applied at **FULL value** to
   the axis nearest the heading (negated by quadrant for 135–305°). Comment at
   :2192 — *"whether the primary component of the magnitude should be negative."*
3. **Secondary component** (gg1-5.s:2231-2270): `HL = L × A` via the `c_0E97`
   multiply (:2234), where `L` is the **within-quadrant angle fraction** (folded
   to the nearer axis at :2225-2229), then added to the **other** axis.

So the per-frame vector is `(A, A·frac)` rotated into the heading's octant — the
primary axis **always** carries the full `A`. Speed is `A` axis-aligned and
**grows toward the diagonals** (the original estimate was up to ~`A·√2` at 45°;
the exact secondary scaling from the `L`-fold + `c_0E97` is **not yet derived** —
do that in the implementation pass).

## 3. The deviation + symptoms

| | axis-aligned | 45° diagonal |
|---|---|---|
| Z80 (octant) | `A` | ~`A`–`A·√2` (primary stays full `A`) |
| Clone (circular) | `A` | `A` (= `A·cos45 + A·sin45` components, magnitude `A`) |

→ Clone diagonal speed is up to ~30–40% low. Visible as:
- **Fly-in too slow** — the curved entrances are diagonal-heavy.
- **Bug spacing too tight** — slower diagonal travel bunches consecutively-launched
  bugs.
- (NOT boss-dive depth — that was the Y fix; see the status note above.)

It also underlies **`research_attack_paths.md` §6.1** (the bomb-enable hold-set-bit
deviation): the dive reaches the drop line late because the descent is too slow.
That deviation is functional, so it stays the accepted approach until this lands.

## 4. ⚠ The confidently-wrong code comment

`bugMotion.js` (file header, ~lines 31-37) claims the Z80's two-step trick is *"a
performance optimization — net effect is dx = A × cos(angle), dy = -A × sin(angle)"*.
**That is wrong** — §2 shows the Z80's primary axis is full `A`, not `A·cos`. The
comment should be corrected to "KNOWN DEVIATION — circular stand-in for the Z80
octant scheme; see research_motion_model.md" as part of the fix. (Left as-is for
now per the defer; flagged here so it isn't trusted.)

## 5. Implementation notes + status

**DEFERRED.** When we return:
1. Derive the exact secondary scaling (`L`-fold geometry + `c_0E97`, gg1-5.s:2225-
   2270) — confirm the 45° speed and the primary/secondary axis selection.
2. Replace the circular update with the octant scheme in `bugMotion.js`.
3. **It touches ALL movement** — fly-in, attack dive, homing (`case_0AA0`), capture
   dive — so it needs its own verification pass: fly-in timing vs MAME, bug
   spacing, the boss dive (now Y-correct), and capture still works.
4. Re-evaluate the §6.1 hold-set-bit deviation — once the descent is faithful, the
   Z80's unconditional `srl 0x0F` should drop bombs without the hold hack.
5. Fix the §4 code comment.

The fix is independent of the bomb-aim (§6.2) fix and the bonus-bee / transient
ports; sequence by priority.
