// seafox/src/platform/gamepad.js
//
// The gamepad source of design_spec § 19.5, and the second of the two files in
// this port that touch a browser input API.
//
// **This is why `platform/` exists.** § 19.5 is explicit that the bucketing to
// -1 / 0 / +1 per axis happens here and that no analogue magnitude ever reaches
// `core/`. That is not tidiness: § 2.7's speed model is step-divided integers,
// so a fractional velocity would change how the submarine moves and § 1.6's
// determinism would go with it. A stick position is a float; what leaves this
// file is one of three integers.
//
// **The gamepad is HOLD-TO-MOVE, and the keyboard is latched** (§ 19.2). So this
// source is nothing like `keyboard.js`: that one is an event-driven single-key
// register that reports only when something happened, and this one is sampled
// fresh every tick and reports the CURRENT state, zero included. Releasing the
// stick has to write (0, 0), because release-to-centre is the whole difference
// between the two models.
//
// **Axis inversion is not offered.** The original provides it because analogue
// sticks of its era had no wiring convention; standard gamepad mapping fixes the
// axis senses, so pushing up moves the submarine up with no configuration
// (§ 19.5).

/** @type {number} Below this the stick is centred. A free choice -- § 19.5 asks
 * only for "a deadzone", and the value is not observable in the simulation
 * because everything past this point is one of three integers. */
export const DEADZONE = 0.35;

/**
 * Standard-mapping indices. The two face buttons are the ones § 19.5 binds, and
 * **the pairing reads backwards to a modern player on purpose**: the original
 * puts the horizontal torpedo on the primary button, and this keeps it.
 */
export const BUTTON = {
  PRIMARY: 0,                 // A / cross  -> the HORIZONTAL torpedo
  SECONDARY: 1,               // B / circle -> the VERTICAL torpedo
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
};

/** @type {number[]} standard mapping puts the left stick on axes 0 and 1. */
const AXIS = [0, 1];

/**
 * Bucket one analogue axis to -1, 0 or +1.
 *
 * **The only place a float exists in the whole input path**, and it ends here.
 *
 * @param {number} v raw axis, nominally -1 .. +1
 * @param {number} deadzone
 * @returns {number} -1, 0 or +1
 */
export function bucket(v, deadzone = DEADZONE) {
  if (v > deadzone) return 1;
  if (v < -deadzone) return -1;
  return 0;
}

/**
 * A live gamepad, shaped as the `{read}` source `core` expects.
 *
 * `read()` returns null when no pad is connected, which core reads as "this
 * scheme has nothing to say" and leaves the velocity pair alone.
 */
export class GamepadSource {
  /**
   * @param {{deadzone?: number, navigator?: Navigator}} [opts]
   */
  constructor(opts = {}) {
    /** @type {number} */
    this.deadzone = opts.deadzone === undefined ? DEADZONE : opts.deadzone;
    /** @type {?Navigator} injected for tests; defaults to the real one. */
    this.nav = opts.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  }

  /**
   * The first connected pad, or null.
   * @returns {?Gamepad}
   */
  pad() {
    if (!this.nav || !this.nav.getGamepads) return null;
    const pads = this.nav.getGamepads();
    for (let i = 0; i < pads.length; i++) if (pads[i]) return pads[i];
    return null;
  }

  /**
   * Sample the pad's CURRENT state (§ 19.2: hold-to-move, so this reports every
   * tick and not only on a change).
   *
   * **The D-pad and the stick are ORed, not chosen between.** A pad may have
   * both, and § 19.5 says a D-pad maps directly while a stick maps through a
   * deadzone -- so a digital press wins wherever the stick is centred, and the
   * two never disagree in practice because nobody holds both.
   *
   * @returns {?{vx: number, vy: number, primary: boolean, secondary: boolean}}
   */
  read() {
    const pad = this.pad();
    if (!pad) return null;

    const down = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);

    let vx = bucket(pad.axes[AXIS[0]] || 0, this.deadzone);
    let vy = bucket(pad.axes[AXIS[1]] || 0, this.deadzone);
    if (down(BUTTON.DPAD_LEFT)) vx = -1;
    if (down(BUTTON.DPAD_RIGHT)) vx = 1;
    if (down(BUTTON.DPAD_UP)) vy = -1;
    if (down(BUTTON.DPAD_DOWN)) vy = 1;

    return {
      vx,
      vy,
      primary: down(BUTTON.PRIMARY),
      secondary: down(BUTTON.SECONDARY),
    };
  }
}

/** A source that never reports a pad. The default, so core runs headless. */
export const NULL_PAD = { read: () => null };
