// seafox/src/core/sound.js
//
// The sound queue (design_spec § 18.2 - § 18.5). **Core owns the queue and hands
// out exactly one (pitch, duration) pair per tick; it never owns a sample
// buffer** (§ 18.9). Synthesis lives in presentation/speaker.js.
//
// The one mechanism worth getting right here is the QUEUE, not the tone.
// Everything a player can notice about this game's audio comes from the queue's
// two unusual properties (§ 18.4):
//
//   * **Nothing is ever pre-empted.** Appending starts at the WRITE cursor and
//     never touches the read cursor, so a new sound waits behind whatever is
//     still sounding. One speaker makes mixing impossible, so the obvious design
//     is for a new sound to cut off the old one -- this does the opposite, and
//     the audio therefore lags the picture under load.
//   * **A full queue does not drop the newest sound.** There is no bounds test.
//     A write cursor that laps the read cursor either overwrites unplayed pairs
//     in place -- turning one sequence into a different one partway through --
//     or lands exactly on it, at which point the queue reads as empty and the
//     WHOLE backlog is discarded in one tick.
//
// Both fall out of a 256-byte ring with byte-wide cursors, so that is what is
// modelled below rather than a JS array of pairs. Reproducing the ring is the
// cheapest way to get the overflow behaviours, and § 18.10 makes them normative.

/**
 * @type {number} The 6502's clock, per § 18.2. Every frequency and burst length
 * in the game derives from this and nothing else.
 */
export const CPU_HZ = 1020484;

/** @type {number} § 18.4: the ring is 256 bytes, which is 128 (pitch,duration) slots. */
export const QUEUE_BYTES = 256;

/** @type {number} Pair-slots the ring holds, for readability at call sites. */
export const QUEUE_PAIRS = QUEUE_BYTES / 2;

/**
 * § 18.8's three output states.
 *
 * These are the values the original indexes the speaker soft-switch with, and
 * they are kept because the DIFFERENCE between the last two is observable:
 * `CASSETTE` runs the identical code path aimed at a harmless address, so it
 * still DRAINS the queue silently, while `SUPPRESSED` exits before the cursors
 * are even read and therefore drains nothing. That is exactly why the title
 * screen can pile up a backlog it never plays.
 * @enum {number}
 */
export const OUTPUT = {
  /** $C030 -- the speaker. */
  SPEAKER: 0x20,
  /** $C020 -- the cassette port. Same code, no sound, queue still drains. */
  CASSETTE: 0x10,
  /** Playback skipped entirely. The queue does not move. */
  SUPPRESSED: 0x00,
};

/**
 * The eighteen sequences of § 18.5, `[pitch, duration]` per burst.
 *
 * Verified byte-for-byte against the ROM's pointer table at $7283. Note 14 and
 * 16 are the SAME sequence -- the original shares one pointer rather than
 * duplicating the data (§ 18.7) -- and 10 is a fully-formed orphan that nothing
 * selects and that an implementation must ship and never play (§ 18.6).
 * @type {ReadonlyArray<ReadonlyArray<number[]>>}
 */
export const SEQUENCES = Object.freeze([
  /*  0 */ [[25, 20], [20, 20], [15, 20], [10, 20]],
  /*  1 */ [[8, 16], [16, 16], [24, 16]],
  /*  2 */ [[15, 10], [15, 10]],
  /*  3 */ [[100, 20]],
  /*  4 */ [[250, 5], [237, 3], [225, 4], [212, 3], [200, 5], [187, 3], [175, 4], [167, 3]],
  /*  5 */ [[167, 3], [175, 5], [187, 4], [200, 3], [212, 4], [225, 2], [237, 3], [250, 5]],
  /*  6 */ [[100, 4], [75, 4], [105, 4], [75, 4], [112, 4], [80, 4], [70, 4], [100, 4],
            [125, 4], [75, 4], [62, 4], [100, 4]],
  /*  7 */ [[50, 8], [35, 8], [50, 8], [35, 8], [56, 8], [40, 8], [35, 8], [50, 8],
            [63, 8], [36, 8], [31, 8], [50, 8]],
  /*  8 */ [[10, 20], [15, 20], [20, 20], [25, 20]],
  /*  9 */ [[25, 40], [20, 40], [15, 40], [10, 40]],
  /* 10 */ [[200, 3], [175, 4], [210, 3], [150, 5], [250, 4], [210, 3], [180, 5], [150, 3],
            [165, 3], [195, 4], [220, 3], [240, 3], [250, 2], [205, 4], [180, 3], [145, 5],
            [155, 2], [190, 4], [220, 3], [245, 4], [230, 3], [200, 4], [175, 3], [150, 4]],
  /* 11 */ [[250, 4], [220, 5], [180, 3], [150, 4], [160, 4], [190, 3], [220, 4], [245, 3]],
  /* 12 */ [[150, 5], [180, 4], [220, 4], [250, 3], [245, 2], [215, 4], [175, 3], [150, 3]],
  /* 13 */ [[200, 5], [175, 3], [210, 3], [150, 2], [225, 4], [160, 3], [140, 4], [200, 5],
            [250, 2], [150, 3], [125, 3], [200, 3], [200, 3], [175, 4], [210, 4], [150, 5],
            [225, 4], [160, 3], [140, 4], [200, 2], [250, 3], [150, 4], [125, 5], [200, 2],
            [200, 3], [175, 3], [210, 4], [150, 3], [225, 3], [160, 4], [140, 5], [200, 3]],
  /* 14 */ [[100, 3], [85, 3], [105, 3], [75, 3]],
  /* 15 */ Array.from({ length: 32 }, () => [200, 4]),
  /* 16 */ [[100, 3], [85, 3], [105, 3], [75, 3]],
  /* 17 */ [[15, 200]],
].map(Object.freeze));

/**
 * Names for § 18.6's assignments, so call sites read as the event rather than as
 * an index. Nine of these are death sounds carried in a type's definition record
 * (§ 7.4) rather than selected by an event.
 * @enum {number}
 */
export const SOUND = {
  SPLASH: 0,              // depth charge hits the water (§ 15.6)
  TORPEDO_AWAY: 1,        // either weapon
  DEFLECTED: 2,           // hospital ship deflects a vertical torpedo (§ 13.6.2)
  EMPTY_MAGAZINE: 3,      // fired with nothing left
  DEATH_SHIP: 4,          // hospital ship, merchant ship
  DEATH_DESTROYER: 5,
  DEATH_ORDNANCE: 6,      // magnetic mine, depth charge
  DEATH_TORPEDO: 7,       // all three torpedoes, the player's two and the enemy's
  CLAM_CLOSES: 8,         // § 13.8.3
  REFUEL: 9,              // § 16.4
  ORPHAN: 10,             // nothing selects this. Ship it, never play it.
  DEATH_ENEMY_SUB: 11,
  DEATH_SUPPLY_SUB: 12,
  DEATH_PLAYER: 13,
  DEATH_DOLPHIN: 14,      // dolphin, Giant Clam
  MISSION_COMPLETE: 15,   // § 11.3
  DEATH_PAYLOAD: 16,      // the same sequence as 14
  LAUNCH: 17,             // the launch animation (§ 11.1.1)
};

/**
 * Cycles between cone flips for a pitch (§ 18.2). Pitch is INVERSE to
 * frequency: a larger value is a lower note.
 * @param {number} pitch 8 to 250 across the game's data.
 * @returns {number} CPU cycles per half-period.
 */
export function halfPeriodCycles(pitch) {
  return 5 * pitch + 24;
}

/**
 * @param {number} pitch
 * @returns {number} Hz, about 401 (pitch 250) to 7972 (pitch 8).
 */
export function frequencyHz(pitch) {
  return CPU_HZ / (2 * halfPeriodCycles(pitch));
}

/**
 * How long one burst sounds. `duration` counts HALF-periods -- cone flips -- not
 * milliseconds, so the same duration byte is a different length at every pitch.
 *
 * NOTE ON THE SPEC: § 18.3 says "the longest single burst in the game is 40 ms".
 * It is 19.4 ms -- sequence 17, `15,200`, is 200 x 99 cycles. Nothing depends on
 * the figure; it is wrong only as prose.
 * @param {number} pitch
 * @param {number} duration half-periods.
 * @returns {number} seconds.
 */
export function burstSeconds(pitch, duration) {
  return duration * halfPeriodCycles(pitch) / CPU_HZ;
}

/**
 * § 18.4's ring: 256 bytes, two byte-wide cursors, both kept on pair boundaries,
 * and **no bounds test anywhere**.
 *
 * The cursors are modelled as byte offsets rather than pair indices on purpose.
 * The overflow behaviours are not special cases in the original -- they are what
 * an unchecked byte cursor does when it laps another -- so writing them as byte
 * arithmetic makes them fall out instead of having to be re-implemented as rules
 * that could disagree with the thing they describe.
 */
export class SoundQueue {
  constructor() {
    /** @type {Uint8Array} the ring at $6682: pitch, duration, pitch, duration... */
    this.ring = new Uint8Array(QUEUE_BYTES);
    /** @type {number} $667E, the read cursor. Always even. */
    this.readCursor = 0;
    /** @type {number} $667F, the write cursor. Always even. */
    this.writeCursor = 0;
  }

  /**
   * The original's emptiness test, verbatim: `CPX $667F / BEQ`. A ring filled
   * exactly to the read cursor is indistinguishable from an empty one, which is
   * the second of § 18.4's two overflow behaviours.
   * @returns {boolean}
   */
  get isEmpty() {
    return this.readCursor === this.writeCursor;
  }

  /**
   * Pairs waiting, which is also how many ticks of backlog there are.
   * @returns {number}
   */
  get pending() {
    return ((this.writeCursor - this.readCursor) & 0xFF) >> 1;
  }

  /**
   * Append a sequence BEHIND whatever is already queued (§ 18.4). Never
   * pre-empts, never bounds-checks, and never touches the read cursor.
   * @param {number} index 0-17, an index into `SEQUENCES`.
   * @returns {void}
   */
  push(index) {
    const seq = SEQUENCES[index];
    if (!seq) return;
    for (let i = 0; i < seq.length; i++) {
      this.ring[this.writeCursor] = seq[i][0];
      this.ring[this.writeCursor + 1] = seq[i][1];
      this.writeCursor = (this.writeCursor + 2) & 0xFF;
    }
    // The original's `AND #$FE` after appending. Redundant while every advance
    // is +2 from an even start, and kept because it is what HOLDS the cursor on
    // a pair boundary rather than something a caller happens to maintain.
    this.writeCursor &= 0xFE;
  }

  /**
   * Take one pair, or null when empty.
   * @returns {?{pitch: number, duration: number}}
   */
  shift() {
    if (this.isEmpty) return null;
    const pitch = this.ring[this.readCursor];
    const duration = this.ring[this.readCursor + 1];
    this.readCursor = (this.readCursor + 2) & 0xFF;
    return { pitch, duration };
  }

  /**
   * § 18.4: **flushed only between rounds**, never during play.
   * @returns {void}
   */
  flush() {
    this.readCursor = 0;
    this.writeCursor = 0;
  }
}

/**
 * The session's audio state. `enabled` is the § 18.8 preference the input
 * toggles; suppression is NOT stored, because it is a consequence of the mission
 * counter being zero and storing it would be a second thing to keep in step.
 *
 * `sink` is how core "hands out" its pair (§ 18.9) without knowing what receives
 * it. A host that wants sound assigns one; core stays ignorant of presentation
 * and the simulation runs identically with none attached.
 * @returns {{queue: SoundQueue, enabled: boolean, sink: ?function}}
 */
export function createSoundState() {
  return { queue: new SoundQueue(), enabled: true, sink: null };
}

/**
 * § 18.8: the title screen is silent, but the demo keeps queueing.
 * @param {Object} session
 * @returns {number} one of `OUTPUT`.
 */
export function outputFor(session) {
  if (session.mission === 0) return OUTPUT.SUPPRESSED;
  return session.sound.enabled ? OUTPUT.SPEAKER : OUTPUT.CASSETTE;
}

/**
 * Queue a sound (§ 18.6). Callable from anywhere in core; the queue decides
 * when -- or whether -- it is heard.
 * @param {Object} session
 * @param {number} index one of `SOUND`.
 * @returns {void}
 */
export function playSound(session, index) {
  session.sound.queue.push(index);
}

/**
 * § 9.3 step 3 / § 18.3: advance sound by **exactly one pair** -- always, not one
 * per sound and never two.
 *
 * Returns the pair that should be HEARD, which is not the same as the pair that
 * was consumed: cassette output drains the queue and returns null, and
 * suppression returns without draining at all. Presentation receives the return
 * value; it is never handed the queue.
 *
 * The sink is called on **every** tick, with null on the silent ones. A device
 * that schedules ahead needs the empty ticks to keep its cursor in step with the
 * simulation -- skipping them would close up the gaps that § 18.3's
 * burst-and-gap texture is made of.
 * @param {Object} session
 * @returns {?{pitch: number, duration: number}}
 */
export function advanceSound(session) {
  const heard = takePair(session);
  if (session.sound.sink) session.sound.sink(heard);
  return heard;
}

/**
 * `advanceSound` without the sink -- the queue half on its own, so tests can
 * assert the drain without standing up an audio device.
 * @param {Object} session
 * @returns {?{pitch: number, duration: number}}
 */
function takePair(session) {
  const output = outputFor(session);
  if (output === OUTPUT.SUPPRESSED) return null;   // exits before the cursors
  const pair = session.sound.queue.shift();
  if (pair === null) return null;
  return output === OUTPUT.SPEAKER ? pair : null;  // cassette: drained, silent
}
