// seafox/src/platform/keyboard.js
//
// The keyboard source of design_spec § 19.4, and **the only file in the port
// that touches the DOM for input.**
//
// § 19.5 puts the platform layer here for a reason that matters more for the
// gamepad than for the keyboard: nothing analogue may reach `core/`, because the
// step-divider speed model of § 2.7 is integer-only. The keyboard has nothing to
// bucket, so this file's whole job is to name keys and hold one.
//
// **It is a one-key register, not a queue** -- see `core/input.js` for why that
// is the faithful shape rather than a convenient one. `read()` is the strobe:
// it returns the pending key and clears it.

/** Keys that reach core under a name rather than as themselves. */
const NAMED = {
  Escape: 'escape',
  ' ': ' ',
};

/**
 * Normalise a `KeyboardEvent` to the name `core/input.js` matches on.
 *
 * Ctrl chords come through as `ctrl+<letter>` so the sound toggle cannot be
 * confused with the `s` key, which is unbound. Everything else is lowercased,
 * because the original compares against a displayed letter and does not care
 * about shift.
 *
 * @param {KeyboardEvent} e
 * @returns {?string} the key name, or null for a key core could never use
 */
export function nameOf(e) {
  if (e.ctrlKey || e.metaKey) {
    return e.key.length === 1 ? 'ctrl+' + e.key.toLowerCase() : null;
  }
  if (NAMED[e.key] !== undefined) return NAMED[e.key];
  return e.key.length === 1 ? e.key.toLowerCase() : null;
}

/**
 * A live keyboard, shaped as the `{read}` source `core` expects.
 *
 * **Only `keydown` is listened for, and `keyup` is deliberately absent.** The
 * keyboard scheme is latched (§ 19.2): a direction persists until another
 * replaces it, holding a key does nothing extra and releasing one does nothing
 * at all. Tracking key-up state would produce a hold-to-move scheme, which is
 * the gamepad's model and not this one.
 */
export class KeyboardSource {
  /**
   * @param {EventTarget} [target] defaults to `window`
   */
  constructor(target) {
    /** @type {?string} the single pending key -- the KBD latch. */
    this.key = null;
    /** @type {EventTarget} */
    this.target = target || window;
    /** @type {?function(KeyboardEvent): void} */
    this.onKey = null;

    /** @type {function(KeyboardEvent): void} */
    this.handler = (e) => {
      const name = nameOf(e);
      if (name === null) return;
      // **The newest key wins**, overwriting whatever was pending. A flurry of
      // presses between two polls collapses to one (§ 19.4), exactly as a
      // single hardware latch does.
      this.key = name;
      // The browser's own bindings would otherwise eat several of these --
      // space scrolls, and ctrl+S opens a save dialog.
      if (name === ' ' || name.startsWith('ctrl+')) e.preventDefault();
      if (this.onKey) this.onKey(e);
    };
  }

  /** @returns {void} */
  attach() {
    this.target.addEventListener('keydown', this.handler);
  }

  /** @returns {void} */
  detach() {
    this.target.removeEventListener('keydown', this.handler);
  }

  /**
   * The strobe: hand over the pending key and clear it.
   * @returns {?string}
   */
  read() {
    const k = this.key;
    this.key = null;
    return k;
  }
}
