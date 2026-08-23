// seafox/src/presentation/hud.js
//
// Layers 5 and 6 of design_spec § 17.2 -- the HUD line, and the banners and
// messages posted outside it. Chapter 19 fixes the layout; this draws it.
//
// **Nothing draws the erase bar.** § 19.9.2's bar spans columns 0-174 and clears
// the line between states; `color` is rebuilt from state every tick (§ 17.1), so
// a state change is a different set of fields being drawn. `SCORE` and its six
// digits are drawn in all three states, and the three left-hand displays replace
// one another. docs/porting_decisions.md records the choice.
//
// **Fields are fixed-width by construction, so nothing on the line shifts.**
// Every value is BCD with a fixed byte count, so leading zeros are drawn and a
// field never changes length (§ 19.9.2).

import { SPRITES, DIGITS, stripSprite } from './sprites.js';
import { toBcd } from '../core/resources.js';
import { PHASE } from '../core/round.js';

/** @type {number} § 2.4: the HUD line, below everything the game can reach. */
export const HUD_ROW = 185;

/** @type {number} § 19.9.1: one byte column, so one digit, is seven pixels. */
export const DIGIT_W = 7;

/**
 * The four digit fields (§ 19.9.1), as screen X and BCD byte count.
 *
 * **The layout has no slack in it** -- `HIGH SCORE` ends at 118 and its digits
 * begin at 119, `SCORE` ends at 237 and its digits begin at 238 -- so a label
 * of the wrong width collides with its own value.
 *
 * @type {Object<string, {x: number, bytes: number}>}
 */
export const FIELDS = {
  fuel: { x: 56, bytes: 2 },        // byte columns 8-11,  four digits
  torpedoes: { x: 154, bytes: 1 },  // byte columns 22-23, two digits
  highScore: { x: 119, bytes: 3 },  // byte columns 17-22, six digits
  score: { x: 238, bytes: 3 },      // byte columns 34-39, six digits
};

/**
 * § 19.9.3: the spare-submarine icons, drawn during round setup.
 *
 * **The icon is the player's own sprite**, not a separate asset -- the same
 * bitmap the game draws in the water, placed on the HUD line. The first sits at
 * world X 84, which is screen 56: the same byte column the fuel gauge occupies
 * in the next state, so the rack and the gauge start at the same place.
 */
export const ICON_X = 56;
export const ICON_STEP = 30;

/** § 11.1.1: where the lifted icon is redrawn, and where the player spawns. */
export const LAUNCH_X = 100;
export const LAUNCH_Y = 100;

/**
 * Which of § 19.9's three HUD states a session is in.
 *
 * They are derived rather than stored, because the game has no HUD-state
 * variable: the mission counter answers "title screen?" (§ 10.1) and the round
 * phase answers the rest. Storing a fourth copy of that would be a thing to
 * keep in step.
 *
 * @param {Object} session
 * @returns {string} 'title', 'setup' or 'round'
 */
export function hudState(session) {
  if (session.isTitleScreen) return 'title';
  if (session.phase === PHASE.SETUP_ICONS || session.phase === PHASE.SETUP_LAUNCH) {
    return 'setup';
  }
  return 'round';
}

/**
 * Draw one digit field, most significant digit first.
 *
 * `toBcd` produces bytes least-significant first and each byte is two digits,
 * so the field is walked backwards and each byte high nibble before low.
 *
 * @param {Object} renderer
 * @param {{x: number, bytes: number}} field
 * @param {number} value
 * @returns {void}
 */
export function drawField(renderer, field, value) {
  const bcd = toBcd(value, field.bytes);
  let x = field.x;
  for (let i = bcd.length - 1; i >= 0; i--) {
    renderer.blit(DIGITS[bcd[i] >> 4], x, HUD_ROW);
    renderer.blit(DIGITS[bcd[i] & 0x0F], x + DIGIT_W, HUD_ROW);
    x += DIGIT_W * 2;
  }
}

/**
 * Layer 5 -- the HUD line (§ 16.6, § 19.9).
 *
 * `SCORE` and its digits are drawn in every state (§ 19.9.2); what changes is
 * the left-hand region, which the three states own exclusively.
 *
 * @param {Object} renderer
 * @param {Object} session
 * @returns {void}
 */
export function drawHud(renderer, session) {
  const res = session.resources;

  // Common to all three states, and the reason the score sits at the right-hand
  // end: it is the one readout every state carries.
  renderer.blitStrip(SPRITES.stripScore);
  drawField(renderer, FIELDS.score, res.score);

  switch (hudState(session)) {
    case 'title':
      // § 16.1: the high score appears ONLY here, which is consistent with its
      // being committed on entry to this screen.
      renderer.blitStrip(SPRITES.stripHighScore);
      drawField(renderer, FIELDS.highScore, res.highScore);
      break;

    case 'setup':
      renderer.blitStrip(SPRITES.stripSubs);
      drawIcons(renderer, session);
      break;

    default:
      renderer.blitStrip(SPRITES.stripFuelTorp);
      drawField(renderer, FIELDS.fuel, res.fuel);
      drawField(renderer, FIELDS.torpedoes, res.torpedoes);
      break;
  }
}

/**
 * The spare-submarine rack, and the launch (§ 11.1.1 step 3, § 19.9.3).
 *
 * During SETUP_LAUNCH the rack is one icon shorter and that icon is drawn at the
 * player's start position instead -- § 11.1.1's erase / redraw / erase, under a
 * buffer that is rebuilt rather than repaired. The two holds around it are the
 * round lifecycle's and are counted there.
 *
 * @param {Object} renderer
 * @param {Object} session
 * @returns {void}
 */
export function drawIcons(renderer, session) {
  const lifted = session.phase === PHASE.SETUP_LAUNCH;
  const onRack = lifted ? session.spareSubs - 1 : session.spareSubs;

  for (let i = 0; i < onRack; i++) {
    renderer.blit(SPRITES.playerSubmarine, ICON_X + i * ICON_STEP, HUD_ROW);
  }
  if (lifted && session.spareSubs > 0) {
    renderer.blit(SPRITES.playerSubmarine, LAUNCH_X - 28, LAUNCH_Y);
  }
}

/**
 * Layer 6 -- banners and messages (§ 11.3, § 10.5.1, § 19.10).
 *
 * **Two paths, and the difference is visible.** Stack entries nest, so all of
 * them draw, oldest first: posting a second banner does not remove the first,
 * and erasing takes the most recent. Each carries the palette parity of its own
 * posting, which is why the mission banner is a different colour every round.
 * The direct blits carry no parity at all and draw in their shipped colour.
 *
 * @param {Object} renderer
 * @param {Object} session
 * @returns {void}
 */
export function drawMessages(renderer, session) {
  const messages = session.messages;

  for (const entry of messages.stack) {
    renderer.blitStrip(stripSprite(entry.strip, entry.flip));
    if (entry.numeral) renderer.blitStrip(stripSprite(entry.numeral, entry.flip));
  }
  for (const strip of messages.direct) {
    renderer.blitStrip(SPRITES[strip]);
  }
}
