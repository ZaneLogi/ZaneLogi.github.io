// seafox/src/core/types.js
//
// The entity type numbering of design_spec § 7.1: one index, 0-20, which
// selects a row in each of two static tables. Only the numbering lives here.
//
// The dispatch table (§ 7.2) and the definition table (§ 7.4) are deliberately
// absent: they hold handler references, scores, death frames and debris counts,
// and nothing reads any of that until the entity walk and collision exist. They
// arrive with Oracle 3.
//
// Six of the twenty-one types have no creation site (§ 7.5) and are kept anyway.
// They are byte-identical to the merchant in both tables, and deleting them is
// safe today and unsafe later -- Chapter 14's shared merchant response exempts a
// RANGE of types that stops short of 12, so a reused type 12 would be able to
// destroy another merchant. Keeping the slots keeps that latent inconsistency
// inert.

/** @enum {number} The type byte of design_spec § 7.1. */
export const TYPE = {
  PLAYER: 0,
  VERTICAL_TORPEDO: 1,
  HORIZONTAL_TORPEDO: 2,
  ENEMY_SUBMARINE: 3,
  MAGNETIC_MINE: 4,
  MERCHANT_UNUSED_5: 5,
  MERCHANT_UNUSED_6: 6,
  MERCHANT_UNUSED_7: 7,
  HOSPITAL_SHIP: 8,
  MERCHANT_SHIP: 9,
  MERCHANT_UNUSED_10: 10,
  MERCHANT_UNUSED_11: 11,
  MERCHANT_UNUSED_12: 12,
  SUPPLY_SUBMARINE: 13,
  PAYLOAD: 14,
  DOLPHIN: 15,
  GIANT_CLAM: 16,
  DESTROYER: 17,
  DEPTH_CHARGE: 18,
  ENEMY_TORPEDO: 19,
  AVENGER: 20,
};

/** @type {string[]} Human names by type, for test output and debugging. */
export const TYPE_NAMES = [
  'player', 'vertical torpedo', 'horizontal torpedo', 'enemy submarine',
  'magnetic mine', 'merchant (unused 5)', 'merchant (unused 6)',
  'merchant (unused 7)', 'hospital ship', 'merchant ship',
  'merchant (unused 10)', 'merchant (unused 11)', 'merchant (unused 12)',
  'supply submarine', 'payload', 'dolphin', 'Giant Clam', 'Destroyer',
  'depth charge', 'enemy torpedo', 'avenger',
];

/**
 * The nine capped classes of design_spec § 4.7, keyed as the counters are.
 * Seven of them are the difficulty ladder's knobs (Chapter 8); the two torpedo
 * classes carry a fixed cap of 1, which is how rate of fire is expressed.
 * @enum {string}
 */
export const CLASS = {
  ENEMY_SUBMARINE: 'enemySubmarine',
  MAGNETIC_MINE: 'magneticMine',
  HOSPITAL_SHIP: 'hospitalShip',
  MERCHANT: 'merchant',
  DESTROYER: 'destroyer',
  DEPTH_CHARGE: 'depthCharge',
  ENEMY_TORPEDO: 'enemyTorpedo',
  VERTICAL_TORPEDO: 'verticalTorpedo',
  HORIZONTAL_TORPEDO: 'horizontalTorpedo',
};

/**
 * Which capped class a type belongs to, or null where the type is uncapped.
 *
 * § 4.7's six uncapped creation sites are the player, the supply submarine
 * (bounded by a timer instead), the payload, the dolphin, the Giant Clam and
 * the avenger. The avenger is the starkest: one is created per dolphin shot
 * with no bound anywhere.
 *
 * All seven merchant type numbers map to the one merchant class, which is what
 * lets the unused slots cost nothing.
 * @type {Object<number, string|null>}
 */
export const CLASS_OF_TYPE = {
  [TYPE.PLAYER]: null,
  [TYPE.VERTICAL_TORPEDO]: CLASS.VERTICAL_TORPEDO,
  [TYPE.HORIZONTAL_TORPEDO]: CLASS.HORIZONTAL_TORPEDO,
  [TYPE.ENEMY_SUBMARINE]: CLASS.ENEMY_SUBMARINE,
  [TYPE.MAGNETIC_MINE]: CLASS.MAGNETIC_MINE,
  [TYPE.MERCHANT_UNUSED_5]: CLASS.MERCHANT,
  [TYPE.MERCHANT_UNUSED_6]: CLASS.MERCHANT,
  [TYPE.MERCHANT_UNUSED_7]: CLASS.MERCHANT,
  [TYPE.HOSPITAL_SHIP]: CLASS.HOSPITAL_SHIP,
  [TYPE.MERCHANT_SHIP]: CLASS.MERCHANT,
  [TYPE.MERCHANT_UNUSED_10]: CLASS.MERCHANT,
  [TYPE.MERCHANT_UNUSED_11]: CLASS.MERCHANT,
  [TYPE.MERCHANT_UNUSED_12]: CLASS.MERCHANT,
  [TYPE.SUPPLY_SUBMARINE]: null,
  [TYPE.PAYLOAD]: null,
  [TYPE.DOLPHIN]: null,
  [TYPE.GIANT_CLAM]: null,
  [TYPE.DESTROYER]: CLASS.DESTROYER,
  [TYPE.DEPTH_CHARGE]: CLASS.DEPTH_CHARGE,
  [TYPE.ENEMY_TORPEDO]: CLASS.ENEMY_TORPEDO,
  [TYPE.AVENGER]: null,
};
