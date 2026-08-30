// seafox/src/core/responses.js
//
// The response table of design_spec § 14.6 -- twenty-one rows, one per type.
//
// **The damage flag defaults to harm** (§ 14.5). A handler opts *out*; a type
// with no opinion damages and is damaged. Getting this backwards makes the
// entire game harmless, which is the failure mode this file is shaped to avoid:
// every row below is an EXEMPTION list, never a list of things that hurt.
//
// Each handler answers one question -- *is THIS entity damaged by that one?* --
// and the sweep calls it twice with the parties swapped (§ 14.4). That is why
// the rows read as whitelists rather than as rules about a pair.
//
// Reading the column as a whole gives two facts that no single row shows:
//
//   * **The Giant Clam has the narrowest damage whitelist in the game.** The
//     enemy submarine, its mine, its torpedo and the depth charge all name it
//     harmless, and the clam's own handler exempts everything but the player's
//     two torpedoes. It is reachable only by the two things allowed to hurt it.
//   * **The hospital ship is its exact mirror**: reachable only by the one type
//     forbidden to harm it. One is protected by its whitelist, the other by
//     geometry.
//
// The score award of § 14.5, the debris of § 15.8 and the death sound of § 18.6
// are all live. The death sound is not selected here -- raising the
// state-change flag is what reaches it, and `beginDeath` reads it off the
// type's own row.

import { TYPE } from './types.js';
import { ROSTER_STATUS } from './spawners.js';
import { spawnAvenger } from './avenger.js';
import { scoreFor, MISSION_SCORED } from './resources.js';
import { playSound, SOUND } from './sound.js';

/**
 * The score column of § 7.2's dispatch table.
 *
 * **`$99` in the low byte is a SENTINEL, not a value** (§ 7.3): it means *this
 * type scores by mission* and diverts to the merchant rule. Only the merchant
 * slots carry it, and in binary it would be an ordinary 153 points and the rule
 * would never fire -- which is why § 1.3 makes decimal semantics normative.
 * @type {Object<number, number>}
 */
const SCORES = {
  [TYPE.ENEMY_SUBMARINE]: 100,
  [TYPE.MAGNETIC_MINE]: 50,
  [TYPE.GIANT_CLAM]: 50,
  [TYPE.DESTROYER]: 150,
  [TYPE.DEPTH_CHARGE]: 20,
  [TYPE.ENEMY_TORPEDO]: 50,
  [5]: MISSION_SCORED, [6]: MISSION_SCORED, [7]: MISSION_SCORED,
  [9]: MISSION_SCORED, [10]: MISSION_SCORED, [11]: MISSION_SCORED,
  [12]: MISSION_SCORED,
};

/** § 13.6.2: the hospital ship's hull is rows 20-26, so a deflection lands here. */
const DEFLECT_ROW = 27;

/** The merchant type numbers that share one response (§ 7.2). */
const MERCHANTS = [5, 6, 7, 9, 10, 11, 12];

/** @param {number} t @returns {boolean} */
const isMerchant = (t) => MERCHANTS.indexOf(t) !== -1;

/**
 * **The ship slots, 5 to 11 -- the range the surface classes exempt.**
 *
 * `entry_7572` opens `CMP #$05 / BCC damage`, `CMP #$0C / BCS damage`, so a ship
 * is harmless to types **5 through 11**: the vestigial merchant slots, the
 * hospital ship (8) and other merchants (9). Ships do not sink ships.
 *
 * **The range misses type 12**, which is itself a vestigial merchant slot -- an
 * off-by-one in the original with no consequence, because no type 12 can ever be
 * created (§ 7.5). It is reproduced rather than tidied: the same slot IS in the
 * vertical torpedo's own consume list, and making the two agree would be
 * inventing a consistency the game does not have.
 *
 * @param {number} t
 * @returns {boolean}
 */
const isShipSlot = (t) => t >= 5 && t <= 11;

/**
 * Dispatch one side of a confirmed contact: **is `selfSlot` damaged by
 * `otherSlot`?**
 *
 * @param {Object} session
 * @param {number} selfSlot
 * @param {number} otherSlot
 * @returns {void}
 */
export function respond(session, selfSlot, otherSlot) {
  const self = session.entities.slots[selfSlot];
  const other = session.entities.slots[otherSlot];
  if (self.dying || self.stateChangePending || self.removalConfirmed) return;

  // **The flag is set to "this hurts" and every branch below can only CLEAR
  // it** (§ 14.5). Written this way on purpose: if each case assigned the flag
  // instead, the default would be dead code and the rule would live in fifteen
  // places at once. A type with no opinion damages and is damaged, and a type
  // that is not listed here at all -- § 7.5's unused merchant slots, say -- gets
  // the harmful default rather than silence.
  let harm = true;
  const t = other.type;

  switch (self.type) {
    case TYPE.PLAYER:
      if (!playerIsHarmedBy(session, other, otherSlot)) harm = false;
      break;

    case TYPE.VERTICAL_TORPEDO:
      if (!verticalTorpedoIsHarmedBy(session, self, selfSlot, other)) harm = false;
      break;

    case TYPE.HORIZONTAL_TORPEDO:
      // Cannot hit its own launcher, and two of them cannot hit each other.
      if (t === TYPE.PLAYER || t === TYPE.HORIZONTAL_TORPEDO) harm = false;
      break;

    case TYPE.ENEMY_SUBMARINE:
      // **Its own children pass through it -- but only while they are alive.**
      // The clam is exempt unconditionally; the mine and the torpedo are exempt
      // only while NOT dying, so a child that is exploding damages the submarine
      // that launched it ($7521-$752F: the type test, then `BIT $16A0` on the
      // OTHER party's dying bit).
      if (t === TYPE.GIANT_CLAM) harm = false;
      else if ((t === TYPE.MAGNETIC_MINE || t === TYPE.ENEMY_TORPEDO) &&
               !other.dying) harm = false;
      break;

    case TYPE.MAGNETIC_MINE:
      // The same shape from the other side ($753C-$7551), and the same reason:
      // a dying submarine or a dying mine is no longer a friend. Only the clam
      // is unconditional.
      if (t === TYPE.GIANT_CLAM) harm = false;
      else if ((t === TYPE.ENEMY_SUBMARINE || t === TYPE.MAGNETIC_MINE) &&
               !other.dying) harm = false;
      break;

    case 5: case 6: case 7: case 10: case 11: case 12:
    case TYPE.MERCHANT_SHIP:
      // **Ships do not sink ships** ($7572-$757B). Without this a merchant takes
      // the harmful default from every other surface class -- and since three of
      // them spawn at X 0-1 on the same row within a few ticks of each other,
      // they overlap on arrival and sink EACH OTHER on the spot.
      //
      // The damage path also retires the roster record and decrements the quota
      // (§ 12.5), so the failure is not just cosmetic: the roster fills with
      // retired records that never recycle, the cursor eventually finds nothing
      // available, and **no merchant spawns again for the rest of the mission**.
      // An empty sea, with a quota that was counted down by ships killing one
      // another.
      // **The bookkeeping is on the DAMAGE path, not the contact.** `$757D`
      // takes the exempt branch straight to the shared exit; only `$7585`
      // onward stamps the roster and decrements the quota. A merchant brushing
      // another merchant must do neither.
      //
      // This used to live in the switch's `default:`, which merchants reached
      // only because they had no case of their own. Giving them one silently
      // orphaned it, and the quota stopped counting.
      if (isShipSlot(t)) harm = false;
      else merchantBookkeeping(session, self);
      break;

    case TYPE.HOSPITAL_SHIP:
      // It exempts the vertical torpedo and the ship slots and takes damage from
      // everything else -- but **nothing else can get to row 20**. The one entity
      // that can physically reach it is the one type forbidden from harming it,
      // so this path is unreachable and its full sinking animation never plays
      // (§ 13.6.2). The handler looks protective and is not.
      if (t === TYPE.VERTICAL_TORPEDO || isShipSlot(t)) harm = false;
      break;

    case TYPE.SUPPLY_SUBMARINE:
      // Its own convoy and its customer. The player exemption is MUTUAL and not
      // decorative: the player clamps at row 175 with a 6-row hull, this sits at
      // 177-183, and § 2.4.2's four rows of overlap mean hugging the bottom of
      // the screen would otherwise be fatal.
      if (t === TYPE.PLAYER || t === TYPE.PAYLOAD || t === TYPE.DOLPHIN) harm = false;
      break;

    case TYPE.PAYLOAD:
      // It clears the shared convoy state on any contact except with the dolphin
      // -- which is what ends the convoy whether the player collected it, the
      // clam ate it, or it was destroyed (§ 16.5).
      // The dolphin branch is taken FIRST and does both things: the flag
      // survives, and the escort cannot hurt what it is carrying.
      if (t === TYPE.DOLPHIN) { harm = false; break; }
      session.convoy.live = false;
      if (t === TYPE.PLAYER || t === TYPE.GIANT_CLAM) {
        // **Collected or eaten, it removes ITSELF** -- no score, no death
        // frames, no debris: it simply vanishes, as the gauges refill or the
        // shell closes ($75CB raises the removal flag before $75D4 declines the
        // damage). Clearing the convoy flag is NOT enough on its own.
        //
        // Without this the entity outlives the run it belonged to and keeps
        // reading the shared block, so it goes on drifting after it has been
        // taken -- floating up at the release velocity, or sinking at +4 if the
        // dolphin had already been shot (§ 16.5.1). That is the visible symptom:
        // a cargo that was collected or eaten and is still on screen, moving.
        self.removalRequested = true;
        harm = false;
      }
      break;

    case TYPE.DOLPHIN:
      // A four-way branch on **who touched it**, not on whether it dies
      // (§ 13.8.2). Swimming into it is safe and so is its own cargo; the two
      // player torpedoes summon the avenger -- and it still dies, for nothing.
      // **Anything else kills it with no retaliation at all**: a mine, a depth
      // charge or an enemy torpedo takes the fall-through. Keying this to the
      // death instead would summon an avenger for those too.
      if (t === TYPE.PLAYER || t === TYPE.PAYLOAD) harm = false;
      else if (t === TYPE.VERTICAL_TORPEDO || t === TYPE.HORIZONTAL_TORPEDO) {
        spawnAvenger(session);
      }
      break;

    case TYPE.GIANT_CLAM:
      if (!clamIsHarmedBy(session, self, other)) harm = false;
      break;

    case TYPE.DEPTH_CHARGE:
      if (t === TYPE.GIANT_CLAM) harm = false;
      break;

    case TYPE.ENEMY_TORPEDO:
      // No "unless it is dying" clause, so a torpedo and a mine from the same
      // submarine destroy each other -- the mine's response agrees from its side.
      // They are only ever in the air together in mission 5 and in the demo, and
      // there they do interfere.
      if (t === TYPE.ENEMY_SUBMARINE || t === TYPE.GIANT_CLAM) harm = false;
      break;

    case TYPE.AVENGER:
      // Declines damage with **no type test at all**: nothing in the game can
      // destroy it. That also makes its silence marker unreachable (§ 7.4) --
      // the only silent type never gets the chance to be silent.
      harm = false;
      break;

    case TYPE.DESTROYER:
      // The only type with no response of its own (§ 7.2): it names the generic
      // handler, which takes damage and scores and does nothing else. Listed
      // rather than left to the default, so that the absence is deliberate.
      break;

    default:
      // Every type that can exist has a case above. A type that reached here
      // would take the harmful default, which is § 14.5's rule and not an
      // oversight -- but nothing does.
      break;
  }

  if (harm) damage(session, selfSlot);
}

/**
 * The generic outcome of § 14.5, run whenever the flag survives: award the
 * type's score and raise the state-change flag, which is what triggers its death
 * sound, its debris and its death animation (§ 9.4, § 7.4).
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
function damage(session, slot) {
  const e = session.entities.slots[slot];
  // § 14.5's generic outcome: award the type's score, then raise the flag that
  // triggers its death sound, its debris and its death animation.
  //
  // **Scoring is suspension 3 of § 10.5.2** -- skipped entirely on the title
  // screen, which is also what stops a demo merchant writing the floating-value
  // index that frame 11 reads (rule 4 is its pair).
  if (!session.isTitleScreen) {
    const table = SCORES[e.type];
    if (table !== undefined && table !== 0) {
      session.resources.award(scoreFor(table, session.mission, session.killCounter === 0));
    }
  }
  e.stateChangePending = true;
}

/**
 * The player (§ 14.6 row 0, § 13.1).
 * @param {Object} session
 * @param {Object} other
 * @param {number} otherSlot
 * @returns {boolean} whether the player is damaged
 */
function playerIsHarmedBy(session, other, otherSlot) {
  // Two gates ahead of the whitelist (§ 13.1). The outro clears the round-live
  // flag before driving the submarine off the screen, so the exit animation
  // cannot be spoiled by whatever is still on screen; the second gate is
  // suspension 1 of § 10.5.2 -- nothing can hurt the demo submarine.
  if (!session.roundLive || session.mission === 0) return false;

  const t = other.type;

  if (t === TYPE.PAYLOAD) {
    refuel(session, other, otherSlot);
    return false;
  }

  // **Its own vertical torpedo only while it is RISING.** Once a hospital ship
  // has flipped the sign, the shot falls through to the damage path: fire
  // straight up beneath a hospital ship and it comes back and kills you
  // (§ 13.6.2).
  if (t === TYPE.VERTICAL_TORPEDO && other.scratch0 < 0) return false;

  return !(t === TYPE.HORIZONTAL_TORPEDO || t === TYPE.SUPPLY_SUBMARINE ||
           t === TYPE.DOLPHIN || t === TYPE.GIANT_CLAM);
}

/**
 * Reaching the payload (§ 16.4). **A restore, not an addition**: collecting one
 * with fuel remaining does not bank the surplus, and there is no way to exceed
 * the starting values.
 * @param {Object} session
 * @param {Object} payload
 * @param {number} payloadSlot
 * @returns {void}
 */
function refuel(session, payload, payloadSlot) {
  // **Guarded against a payload that is already DYING -- not against one that is
  // merely flagged for removal.** The two are different bits in the original
  // ($16A0 = $02 for the guard, $16A1 = $04 for the removal flag), and the
  // distinction is load-bearing here: the payload's own response raises the
  // removal flag on this very contact, and the sweep may run that side first
  // (§ 14.4 dispatches both ways). Testing the removal flag as well would let
  // the ordering decide whether the tanks actually refill.
  if (payload.dying || payload.stateChangePending) return;

  session.resources.refill();
  session.convoy.live = false;
  payload.removalRequested = true;
  // § 18.6, sound 9 -- which is § 18.7's splash with the durations doubled: the
  // refuel note is the depth-charge splash, drawn out.
  playSound(session, SOUND.REFUEL);
  // Chapter 16: redraw both gauges.
}

/**
 * The vertical torpedo (§ 14.6 row 1).
 * @param {Object} session
 * @param {Object} self
 * @param {Object} other
 * @returns {boolean} whether the torpedo is damaged
 */
function verticalTorpedoIsHarmedBy(session, self, selfSlot, other) {
  // **The launcher, and only while THIS shot is rising** -- the mirror of the
  // player's own gate, tested on the same sign and against the same two types.
  // Without it the exemption on the player's side buys nothing: the launch
  // point clears the hull by ONE pixel and the player steps two, so the sub
  // overlaps its own shot on the first tick it moves up, and every torpedo
  // fired while ascending dies on the tick it is fired.
  //
  // A second vertical torpedo cannot exist -- the cap in flight is 1 (§ 13.2) --
  // so that half of the test is unreachable. It is here because the source
  // tests both, and a cap is a cheaper thing to change than a response table.
  if (other.type === TYPE.PLAYER || other.type === TYPE.VERTICAL_TORPEDO) {
    return self.scratch0 >= 0;
  }

  if (other.type === TYPE.HOSPITAL_SHIP) {
    // **The shot is reflected, not consumed** (§ 13.6.2): the vertical velocity
    // is negated, the Y snapped to just below the hull, the sprite swapped to
    // the descending form, and a distinct sound played -- with neither party
    // damaged.
    //
    // **The footprint has to follow it**, and this is the one response that
    // moves an entity. A response runs inside whatever entity the walk is
    // currently on, so when the hospital ship is the subject the torpedo is
    // moved long after its own erase/write cycle for this tick has finished --
    // its next erase would clear the new position and strand the old pixels
    // under its id forever. Erase before the move, while the record still
    // describes where those pixels are and which sprite drew them.
    session.stencil.erase(self, selfSlot);
    self.scratch0 = -self.scratch0;
    self.y = DEFLECT_ROW;
    self.sprite = 'torpedoDescending';
    session.stencil.write(self, selfSlot);
    playSound(session, SOUND.DEFLECTED);  // § 18.6, sound 2
    return false;
  }
  // **Consumed by ships and the Destroyer** -- removed silently, with no death.
  // A depth charge is on neither list, so a shot that stops one explodes while a
  // shot that sinks a ship just disappears (§ 13.7.6).
  if (isMerchant(other.type) || other.type === TYPE.DESTROYER) {
    self.removalRequested = true;
    return false;
  }
  return true;
}

/**
 * The Giant Clam (§ 14.6 row 16, § 13.8.3).
 * @param {Object} session
 * @param {Object} self
 * @param {Object} other
 * @returns {boolean} whether the clam is damaged
 */
function clamIsHarmedBy(session, self, other) {
  if (other.type === TYPE.PAYLOAD) {
    // **It has eaten the resupply.**
    self.sprite = 'shellClosed';
    session.convoy.live = false;
    playSound(session, SOUND.CLAM_CLOSES);   // § 18.6, sound 8
    return false;
  }
  // Everything else -- the player included -- passes through. Only the player's
  // two torpedoes can destroy it.
  return other.type === TYPE.VERTICAL_TORPEDO || other.type === TYPE.HORIZONTAL_TORPEDO;
}

/**
 * The shared merchant response (§ 14.6 rows 5-7 and 9-12): score, stamp the
 * roster and decrement the quota -- **all three suspended in the demo**
 * (§ 10.5.2 rules 3 and 5).
 *
 * Bookkeeping only. A merchant has no exemptions whatever, so it takes the
 * harmful default like anything else.
 * @param {Object} session
 * @param {Object} self
 * @returns {void}
 */
function merchantBookkeeping(session, self) {
  if (!session.isTitleScreen) {
    session.spawners.roster[self.scratch3] = ROSTER_STATUS.SUNK;
    if (session.killCounter > 0) session.killCounter -= 1;
    // § 7.3.2: which floating value to show is decided by the same test that
    // chooses the score -- whether this kill emptied the quota. Recorded here
    // and read by death frame 11 (§ 7.4.1). Rules 3 and 4 of § 10.5.2 are a
    // PAIR: this is what writes the index and frame 11 is what reads it, so
    // suspending only one leaves a demo merchant indexing the table with
    // whatever the previous occupant of its slot left behind.
    self.scratch2 = session.killCounter === 0 ? 1 : 0;
  }
}
