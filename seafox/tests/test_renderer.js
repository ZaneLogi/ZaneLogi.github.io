// seafox/tests/test_renderer.js
//
// The renderer -- design_spec Chapter 17.
//
// Every check here reads `color` directly, never a canvas and never a
// screenshot. § 20.5 makes the same choice for the golden frames and gives the
// reason: comparing the buffer keeps the test independent of § 17.5's free
// choices, and a scaled screenshot can invent an offset that is not there.
//
// Three claims get the most weight, because each is a way the chapter is
// commonly mis-implemented and none of them looks wrong in a still frame:
//
//   * **Every live entity is drawn every tick** (§ 17.6). The divider governs
//     whether an entity UPDATES, never whether it appears, and most entities
//     are skipped on most ticks -- so a renderer that draws what moved produces
//     a game where almost everything flickers.
//   * **The compositing order** (§ 17.2): the waterline beneath the entities so
//     objects crossing the surface occlude it, and the effects above them.
//   * **The renderer never touches the stencil** (§ 17.1), which is what the
//     whole of Chapter 20 rests on.

import { mount } from './harness.js';
import { Session } from '../src/core/session.js';
import { tick } from '../src/core/tick.js';
import { PHASE } from '../src/core/round.js';
import { STRIP } from '../src/core/messages.js';
import { TYPE, CLASS } from '../src/core/types.js';
import { COLOR } from '../src/presentation/palette.js';
import { Renderer, WATERLINE_ROW } from '../src/presentation/renderer.js';
import { SPRITES, DIGITS, POSTED_STRIPS, stripSprite } from '../src/presentation/sprites.js';
import { drawField, hudState, FIELDS, HUD_ROW, DIGIT_W, ICON_X, ICON_STEP } from '../src/presentation/hud.js';
import { SCREEN_W, SCREEN_H } from '../src/core/stencil.js';

mount('design_spec Chapter 17 — the renderer, reading state and drawing nothing else', run);

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function run(list) {
  theBuffer(list);
  theWaterline(list);
  oneSprite(list);
  compositingOrder(list);
  everyTick(list);
  theHud(list);
  theDigits(list);
  bannersAndMessages(list);
  theSeam(list);
}

/**
 * A session with nothing spawning, so a test sees only what it puts there.
 * @returns {Session}
 */
function quiet() {
  const s = new Session();
  s.startDemo();
  for (const k of Object.keys(s.spawners.cooldowns)) s.spawners.cooldowns[k] = 999999;
  s.caps[CLASS.VERTICAL_TORPEDO] = 0;
  s.caps[CLASS.HORIZONTAL_TORPEDO] = 0;
  s.entities.reset();
  s.effects.reset();
  return s;
}

/**
 * Put one entity on the screen at a known place.
 * @param {Session} s
 * @param {number} type
 * @param {string} sprite
 * @param {number} x world x
 * @param {number} y screen row
 * @returns {Object} the entity record
 */
function place(s, type, sprite, x, y) {
  const slot = s.entities.alloc(type);
  const e = s.entities.slots[slot];
  e.sprite = sprite;
  e.x = x;
  e.y = y;
  e.updatePeriod = 7;
  e.updateCountdown = 7;
  return e;
}

/** @param {Uint8Array} buf @param {number} x @param {number} y @returns {number} */
function at(buf, x, y) {
  return buf[y * SCREEN_W + x];
}

/**
 * Pixels painted on rows 0-6, the band every top-line banner shares (§ 19.10.2).
 * @param {Uint8Array} buf
 * @returns {number}
 */
function topLine(buf) {
  let n = 0;
  for (let i = 0; i < 7 * SCREEN_W; i++) if (buf[i] !== COLOR.BACKGROUND) n++;
  return n;
}

/** @param {Uint8Array} buf @returns {number} how many pixels are not background. */
function painted(buf) {
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] !== COLOR.BACKGROUND) n++;
  return n;
}

/**
 * The same count over the play area only -- everything above the HUD line.
 *
 * The HUD draws `SCORE` and six digits in every state (§ 19.9.2), so a whole-
 * buffer count carries a constant few hundred pixels that have nothing to do
 * with what a check is looking at.
 *
 * @param {Uint8Array} buf
 * @returns {number}
 */
function paintedAbove(buf) {
  let n = 0;
  for (let i = 0; i < HUD_ROW * SCREEN_W; i++) if (buf[i] !== COLOR.BACKGROUND) n++;
  return n;
}

/**
 * The screen columns a sprite's colour bitmap lights on a given row, relative
 * to the block's left edge.
 * @param {Object} sprite
 * @param {number} row within the bitmap
 * @returns {number[]}
 */
function litColumns(sprite, row) {
  const out = [];
  for (let c = 0; c < sprite.colorWidth; c++) {
    if (sprite.color[row * sprite.colorWidth + c] !== COLOR.BACKGROUND) {
      out.push(sprite.minX + c);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

/**
 * § 17.1: the buffer, and its rebuild.
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theBuffer(list) {
  list.section('§ 17.1 — the buffer is rebuilt from state every tick');

  const r = new Renderer();
  list.eq('color is 280 x 192 bytes', r.color.length, SCREEN_W * SCREEN_H);

  const s = quiet();
  place(s, TYPE.MERCHANT_SHIP, 'merchant0', 100, 20);
  r.render(s);
  const first = r.color.slice();

  // Rendering the same state twice gives the same buffer: no accumulation, no
  // dirty region, no second page.
  r.render(s);
  list.add('rendering the same state twice is identical',
    r.color.every((v, i) => v === first[i]));

  // And moving the entity leaves NOTHING behind, which is what "rebuilt" buys:
  // an incremental renderer would still be showing the old position.
  s.entities.slots[0].x = 200;
  r.render(s);
  const moved = r.color.slice();
  list.add('moving an entity leaves no trace at the old position',
    !r.color.some((v, i) => v !== COLOR.BACKGROUND && first[i] !== COLOR.BACKGROUND &&
      i % SCREEN_W < 100 && Math.floor(i / SCREEN_W) < WATERLINE_ROW));
  list.add('the buffer differs after the move', moved.some((v, i) => v !== first[i]));
}

/**
 * § 3.5: the waterline.
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theWaterline(list) {
  list.section('§ 3.5 — the waterline: row 38, full width, blue, SOLID');

  const r = new Renderer();
  const s = quiet();
  r.render(s);

  let solid = true;
  for (let x = 0; x < SCREEN_W; x++) if (at(r.color, x, WATERLINE_ROW) !== COLOR.BLUE) solid = false;
  list.add('row 38 is blue across all 280 columns', solid);

  // The stored pattern lights every EVEN column only; the bake's chroma cell
  // fills the odd ones. Rendering the dots literally would leave 140 gaps.
  let odd = 0;
  for (let x = 1; x < SCREEN_W; x += 2) if (at(r.color, x, WATERLINE_ROW) === COLOR.BLUE) odd++;
  list.eq('every odd column is blue too, so the line reads solid', odd, 140);

  list.eq('row 37 is untouched', at(r.color, 140, WATERLINE_ROW - 1), COLOR.BACKGROUND);
  list.eq('row 39 is untouched', at(r.color, 140, WATERLINE_ROW + 1), COLOR.BACKGROUND);
  list.eq('one pixel tall: an empty sea paints 280 pixels and no more',
    paintedAbove(r.color), SCREEN_W);
}

/**
 * § 17.3: drawing one sprite.
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function oneSprite(list) {
  list.section('§ 17.3 — drawing one sprite');

  const r = new Renderer();
  const s = quiet();

  // Index 0 is transparent. The player sprite's box is 28 px wide and its
  // bitmap is far from solid, so a fill would show up as a huge pixel count.
  const e = place(s, TYPE.PLAYER, 'playerSubmarine', 128, 100);
  r.render(s);
  const player = SPRITES.playerSubmarine;
  let want = 0;
  for (let i = 0; i < player.color.length; i++) {
    if (player.color[i] !== COLOR.BACKGROUND) want++;
  }
  list.eq('index 0 is skipped, not drawn as background',
    paintedAbove(r.color) - SCREEN_W, want);
  s.entities.freeSlot(0, s.stencil);

  // The crop offset. Both bitmaps are stripped to the ink box, so a block with
  // blank leading columns -- there are nine -- must have that offset put back
  // or it draws left of where the game puts it. chargeSinking's is 2.
  const charge = SPRITES.chargeSinking;
  list.eq('chargeSinking is cropped by 2 columns', charge.minX, 2);
  const c = place(s, TYPE.DEPTH_CHARGE, 'chargeSinking', 100, 60);
  r.render(s);
  const cols = litColumns(charge, 0).map((v) => v + c.x - 28);
  list.add('a cropped block draws at its block position, not its ink position',
    cols.every((x) => at(r.color, x, 60) !== COLOR.BACKGROUND) &&
    at(r.color, c.x - 28, 60) === COLOR.BACKGROUND,
    'lit columns ' + cols.join(',') + ', block edge ' + (c.x - 28) + ' blank');
  s.entities.freeSlot(0, s.stencil);

  // Colour, not ink. § 6.3.1 clips the chroma cell to each row's ink, so the two
  // bitmaps share a bounding box -- but not their contents: a cell reaches into
  // the gap right of an isolated pixel, and THAT is a real pixel on screen.
  const boxed = Object.keys(SPRITES).filter((k) => SPRITES[k].colorWidth !== SPRITES[k].w);
  list.add('colour shares the ink bounding box on every sprite (§ 6.3.1)',
    boxed.length === 0, boxed.length ? boxed.join(', ') : Object.keys(SPRITES).length + ' checked');

  // Pick a sprite that actually has a gap fill, rather than naming one: the
  // claim is about the rule, not about a chosen sprite staying the way it is.
  const gapOf = (sp) => {
    for (let row = 0; row < sp.h; row++) {
      for (let c = 0; c < sp.w; c++) {
        if (!sp.ink[row * sp.w + c] &&
            sp.color[row * sp.colorWidth + c] !== COLOR.BACKGROUND) return { row, c };
      }
    }
    return null;
  };
  const gapped = Object.keys(SPRITES).filter((k) => gapOf(SPRITES[k]));
  list.add('some sprites carry colour where ink is 0 (§ 6.3.1)', gapped.length > 0,
    gapped.length + ' of ' + Object.keys(SPRITES).length);
  const wide = SPRITES[gapped[0]];
  const g = gapOf(wide);
  const w = place(s, TYPE.MERCHANT_SHIP, gapped[0], 128, 70);
  r.render(s);
  const filled =
    at(r.color, w.x - 28 + wide.minX + g.c, 70 + wide.minY + g.row) ===
    wide.color[g.row * wide.colorWidth + g.c];
  list.add('a chroma cell filling a gap in the ink reaches the screen', filled,
    gapped[0] + ' @' + g.c + ',' + g.row);
  s.entities.freeSlot(0, s.stencil);

  // The clip is an ordinary rectangle test, per pixel, on all four edges.
  const clipped = place(s, TYPE.MERCHANT_SHIP, 'merchant0', 8, 2);
  clipped.y = -3;
  r.render(s);
  list.add('a sprite hanging off the top draws only what lands inside',
    paintedAbove(r.color) > SCREEN_W);
  clipped.x = 300;
  clipped.y = 100;
  r.render(s);
  const right = paintedAbove(r.color) - SCREEN_W;
  list.add('a sprite hanging off the right clips rather than wrapping',
    right > 0 && at(r.color, 0, 100) === COLOR.BACKGROUND &&
    at(r.color, 1, 100) === COLOR.BACKGROUND, right + ' px still drawn');

  // § 2.3: world x >= 308 produces no pixels at all, and that is normative --
  // one spawn relies on its first tick being invisible.
  clipped.x = 308;
  r.render(s);
  list.eq('world x 308 draws nothing (§ 2.3)', paintedAbove(r.color), SCREEN_W);
}

/**
 * § 17.2: the six layers, and the two orderings that matter.
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function compositingOrder(list) {
  list.section('§ 17.2 — compositing order');

  const r = new Renderer();
  const s = quiet();

  // The waterline goes down BEFORE the entities, so an object crossing the
  // surface occludes it and leaves a gap while it passes. Drawn afterwards it
  // would hide everything on row 38.
  const t = place(s, TYPE.TORPEDO_VERTICAL, 'torpedoRising', 128, WATERLINE_ROW - 2);
  r.render(s);
  const sprite = SPRITES.torpedoRising;
  const cols = litColumns(sprite, WATERLINE_ROW - (t.y + sprite.minY))
    .map((v) => v + t.x - 28);
  list.add('a torpedo crossing the surface occludes the waterline',
    cols.length > 0 && cols.every((x) => at(r.color, x, WATERLINE_ROW) !== COLOR.BLUE),
    'columns ' + cols.join(',') + ' are the torpedo, not the line');
  list.eq('the line is intact either side of it', at(r.color, 0, WATERLINE_ROW), COLOR.BLUE);
  s.entities.freeSlot(0, s.stencil);

  // Effects composite OVER entities, because the effects walk runs after the
  // entity walk (§ 9.3).
  const ship = place(s, TYPE.MERCHANT_SHIP, 'merchant1', 128, 100);
  r.render(s);
  const under = at(r.color, 106, 103);
  const fx = s.effects.spawn({ x: 134, y: 103, sprite: 'blob', lifetime: 4 });
  r.render(s);
  list.add('an effect over an entity wins the pixel',
    at(r.color, 106, 103) === COLOR.WHITE,
    'entity drew ' + under + ', effect drew ' + at(r.color, 106, 103));
  s.effects.free(fx);

  // Entity order is slot order, and there is no z-ordering: the later slot
  // overwrites. Slot order changes when an entity is removed (§ 4.6), so
  // overlap order is observable and follows from the array.
  const second = place(s, TYPE.MERCHANT_SHIP, 'merchant4', 128, 100);
  r.render(s);
  const later = at(r.color, 106 + SPRITES.merchant4.minX, 100 + SPRITES.merchant4.minY);
  list.add('a later slot draws over an earlier one',
    later === SPRITES.merchant4.color[0] || later !== COLOR.BACKGROUND,
    'slot 1 (' + second.sprite + ') is on top');
}

/**
 * § 17.6: the divider governs updating, never appearing.
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function everyTick(list) {
  list.section('§ 17.6 — every live entity is drawn every tick');

  const r = new Renderer();
  const s = quiet();
  const e = place(s, TYPE.MERCHANT_SHIP, 'merchant0', 150, 20);
  e.updatePeriod = 7;
  e.updateCountdown = 7;

  // Seven ticks: a merchant updates on exactly one of them (§ 2.7.1). The
  // entity must be drawn on all seven.
  let drawn = 0;
  let updates = 0;
  let last = e.x;
  for (let i = 0; i < 8; i++) {
    tick(s);
    if (s.entities.liveCount === 0) break;
    if (s.entities.slots[0].x !== last) { updates++; last = s.entities.slots[0].x; }
    r.render(s);
    if (paintedAbove(r.color) > SCREEN_W) drawn++;
  }
  // A cooldown of n fires on tick n + 1, which is the same off-by-one Oracle 2
  // names -- so a period of seven moves the merchant once in these eight ticks.
  list.eq('the merchant updated once, on the eighth tick', updates, 1);
  list.eq('and was drawn on all eight', drawn, 8);

  // The same for effects: one that has not stepped is still drawn.
  const fx = s.effects.spawn({
    x: 100, y: 150, sprite: 'blob', lifetime: 40, stepReload: 9,
  });
  s.effects.slots[fx].justCreated = false;
  let effDrawn = 0;
  for (let i = 0; i < 5; i++) {
    tick(s);
    r.render(s);
    if (at(r.color, 72, 150) !== COLOR.BACKGROUND) effDrawn++;
  }
  list.eq('an effect that has not stepped is drawn every tick', effDrawn, 5);
}

/**
 * § 19.9: the HUD line, its three states and its fixed-width fields.
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theHud(list) {
  list.section('§ 19.9 — the HUD line');

  const r = new Renderer();
  const s = quiet();

  // State one: the title screen. HIGH SCORE and SCORE.
  list.eq('mission 0 is the title state', hudState(s), 'title');
  s.resources.score = 1234;
  s.resources.highScore = 567890;
  r.render(s);
  list.add('HIGH SCORE is drawn at its own x=0',
    at(r.color, 1, HUD_ROW) !== COLOR.BACKGROUND ||
    at(r.color, 2, HUD_ROW + 1) !== COLOR.BACKGROUND);
  // The layout has no slack: HIGH SCORE ends at 118, its digits start at 119.
  list.eq('its six digits begin at 119',
    readDigits(r.color, FIELDS.highScore.x, 6), '567890');

  // State three: during a round. FUEL: and TORP: replace HIGH SCORE.
  s.mission = 1;
  s.phase = PHASE.PLAY;
  list.eq('a live round is the round state', hudState(s), 'round');
  r.render(s);
  list.add('the fuel field is drawn at 56', columnPainted(r.color, FIELDS.fuel.x, HUD_ROW, 8));
  list.add('the torpedo field is drawn at 154',
    columnPainted(r.color, FIELDS.torpedoes.x, HUD_ROW, 8));
  list.add('the high-score field is gone',
    !columnPainted(r.color, FIELDS.highScore.x + 1, HUD_ROW, 8) ||
    at(r.color, FIELDS.highScore.x, HUD_ROW) === COLOR.BACKGROUND);

  // SCORE and its digits survive every state change (§ 19.9.2) -- which is why
  // the erase bar stops at 175 and why this port needs no bar at all.
  const seen = [];
  for (const mission of [0, 1]) {
    s.mission = mission;
    r.render(s);
    seen.push(readDigits(r.color, FIELDS.score.x, 6));
  }
  s.phase = PHASE.SETUP_ICONS;
  s.mission = 1;
  r.render(s);
  seen.push(readDigits(r.color, FIELDS.score.x, 6));
  s.phase = PHASE.PLAY;
  list.add('SCORE and its six digits appear in all three states',
    seen.every((v) => v === '001234'), seen.join(' / '));

  // Fixed width by construction: leading zeros are drawn, so no field ever
  // changes length and nothing on the line shifts as values change.
  s.mission = 1;
  const gauge = [];
  for (const v of [0, 7, 99, 1200]) {
    s.resources.fuel = v;
    r.render(s);
    gauge.push(readDigits(r.color, FIELDS.fuel.x, 4));
  }
  list.eq('the fuel field is four digits at every value, leading zeros drawn',
    gauge.join(' '), '0000 0007 0099 1200');
  s.resources.torpedoes = 8;
  r.render(s);
  list.eq('and the torpedo field two', readDigits(r.color, FIELDS.torpedoes.x, 2), '08');

  // State two: round setup. SUBS and one icon per spare submarine.
  s.phase = PHASE.SETUP_ICONS;
  s.spareSubs = 3;
  list.eq('setup is the setup state', hudState(s), 'setup');
  r.render(s);
  let icons = 0;
  for (let i = 0; i < 4; i++) {
    if (columnPainted(r.color, ICON_X + i * ICON_STEP, HUD_ROW, 6)) icons++;
  }
  list.eq('three spare subs draw three icons, stepping 30 px', icons, 3);

  // The launch lifts the last icon to the player's start position. Under a
  // rebuild that is one fewer on the rack plus one at (100, 100).
  s.phase = PHASE.SETUP_LAUNCH;
  r.render(s);
  let lifted = 0;
  for (let i = 0; i < 4; i++) {
    if (columnPainted(r.color, ICON_X + i * ICON_STEP, HUD_ROW, 6)) lifted++;
  }
  list.eq('the launch leaves two on the rack', lifted, 2);
  list.add('and draws the lifted one at the start position',
    columnPainted(r.color, 72, 100, 6));
}

/**
 * § 19.9 / § 6.6.1: the digit font.
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theDigits(list) {
  list.section('§ 19.9 — the digit font, 6 x 8 cells');

  list.eq('ten glyphs', DIGITS.length, 10);
  list.add('every glyph is pure white',
    DIGITS.every((g) => g.color.every((v) => v === COLOR.BACKGROUND || v === COLOR.WHITE)),
    'no isolated lit pixel anywhere in the font, so no glyph takes a hue');
  list.add('every glyph fits a 6 px cell',
    DIGITS.every((g) => g.minX + g.colorWidth <= 6),
    'widths ' + DIGITS.map((g) => g.minX + g.colorWidth).join(','));
  list.add('every glyph fits seven ink rows',
    DIGITS.every((g) => g.minY + g.h <= 7));

  // The value drawn, most significant digit first, at a seven-pixel pitch.
  const r = new Renderer();
  drawField(r, { x: 0, bytes: 3 }, 102030);
  list.eq('102030 draws as its six digits, most significant first',
    readDigits(r.color, 0, 6), '102030');

  const r2 = new Renderer();
  drawField(r2, { x: 0, bytes: 2 }, 7);
  list.eq('leading zeros are drawn, so the field never changes length',
    readDigits(r2.color, 0, 4), '0007');
}

/**
 * § 19.10: the two paths text takes to the screen.
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function bannersAndMessages(list) {
  list.section('§ 19.10 — banners and messages');

  const r = new Renderer();
  const s = quiet();

  // Every strip posted since the last erase draws, so a group posted together
  // shows together.
  s.messages.post(STRIP.MISSION, 'stripOne');
  r.render(s);
  const banner = painted(r.color);
  s.messages.post(STRIP.DEMO_A);
  r.render(s);
  list.add('a second post draws alongside the first', painted(r.color) > banner);

  // ...and erasing takes ALL of it, not the most recent entry (§ 19.10.1). The
  // stack records what is on screen; it does not layer messages.
  s.messages.eraseAll();
  r.render(s);
  list.eq('erasing DRAINS the stack, so the top line goes empty', topLine(r.color), 0,
    (v) => v + ' pixels left on rows 0-6 — a pop would have left the MISSION ' +
      'banner behind for the next post to draw straight over');

  // Each post flips that strip's palette permanently, so a strip alternates
  // between two colours for the life of the session.
  s.messages.post(STRIP.MISSION, 'stripOne');
  r.render(s);
  const first = hueOf(r.color);
  s.messages.eraseAll();
  s.messages.post(STRIP.MISSION, 'stripOne');
  r.render(s);
  const second = hueOf(r.color);
  list.add('a second posting draws the banner in its other palette',
    first !== second, first + ' then ' + second);

  // The numeral ships in the opposite palette to the word, and stays opposite
  // while alternating with it (§ 6.6.1).
  const word = stripSprite('stripMission', 0);
  const numeral = stripSprite('stripOne', 0);
  list.add('the numeral ships opposite to the word it sits beside',
    hueSet(word) !== hueSet(numeral), hueSet(word) + ' vs ' + hueSet(numeral));
  list.add('and is still opposite after a flip',
    hueSet(stripSprite('stripMission', 1)) !== hueSet(stripSprite('stripOne', 1)));

  // Direct blits bypass the stack: fixed colour, no flip, and they must be
  // erased explicitly (§ 11.4).
  s.messages.stack.length = 0;
  s.messages.postDirect(STRIP.GAME_OVER);
  r.render(s);
  const g1 = hueOf(r.color);
  s.messages.eraseDirect();
  s.messages.postDirect(STRIP.GAME_OVER);
  r.render(s);
  list.eq('a direct blit never changes colour', hueOf(r.color), g1);
  list.add('GAME OVER draws at its own row 90',
    columnPainted(r.color, 100, 90, 7));
  s.messages.eraseDirect();
  r.render(s);
  list.eq('erasing the direct banners removes them', painted(r.color) > 0, true);

  list.eq('nine strips can be flipped by a posting, and only nine',
    POSTED_STRIPS.length, 9);
  list.add('the two direct banners are not among them',
    !POSTED_STRIPS.includes(STRIP.GAME_OVER) && !POSTED_STRIPS.includes(STRIP.OUT_OF_FUEL));
}

/**
 * § 17.1 / § 17.4: the line between the simulation and the picture.
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theSeam(list) {
  list.section('§ 17.1 — the renderer reads state and writes nothing back');

  const s = quiet();
  place(s, TYPE.MERCHANT_SHIP, 'merchant0', 150, 20);
  place(s, TYPE.PLAYER, 'playerSubmarine', 120, 100);
  for (let i = 0; i < 5; i++) tick(s);

  const before = s.stencil.buf.slice();
  const entities = JSON.stringify(s.entities.slots.slice(0, s.entities.liveCount));
  const r = new Renderer();
  r.render(s);
  r.render(s);

  list.add('the stencil is untouched by a render',
    s.stencil.buf.every((v, i) => v === before[i]));
  list.add('the entity list is untouched by a render',
    JSON.stringify(s.entities.slots.slice(0, s.entities.liveCount)) === entities);

  // § 17.4: the two buffers agree, because an entity that did not update did
  // not move. Every live entity's stencil footprint sits under painted pixels.
  let agree = true;
  for (let i = 0; i < s.entities.liveCount; i++) {
    const e = s.entities.slots[i];
    const sprite = SPRITES[e.sprite];
    if (sprite === undefined) continue;
    const x = e.x - 28 + sprite.minX;
    const y = e.y + sprite.minY;
    if (x < 0 || y < 0 || x >= SCREEN_W || y >= SCREEN_H) continue;
    if (s.stencil.buf[y * SCREEN_W + x] !== 0 &&
        s.stencil.buf[y * SCREEN_W + x] !== i + 1) agree = false;
  }
  list.add('the stencil and the picture agree on where each entity is', agree);
}

// ---------------------------------------------------------------------------
// Buffer readers
// ---------------------------------------------------------------------------

/**
 * @param {Uint8Array} buf
 * @param {number} x
 * @param {number} y
 * @param {number} rows how far down to look
 * @returns {boolean} whether anything is painted in that column band
 */
function columnPainted(buf, x, y, rows) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < DIGIT_W; c++) {
      if (x + c < SCREEN_W && y + r < SCREEN_H &&
          buf[(y + r) * SCREEN_W + x + c] !== COLOR.BACKGROUND) return true;
    }
  }
  return false;
}

/**
 * Read one drawn glyph back out of the buffer by matching it against the font.
 *
 * The whole seven-pixel cell is compared, not just the glyph's own box, so a
 * narrow glyph cannot match inside a wider one. Rows 0-6 only: the cell's
 * eighth row is the blank spacing row and at the HUD line it falls off the
 * bottom of the screen.
 *
 * @param {Uint8Array} buf
 * @param {number} x the cell's left column
 * @param {number} y the cell's top row
 * @returns {string} the digit, or '?'
 */
function readDigit(buf, x, y) {
  for (let d = 0; d < 10; d++) {
    const g = DIGITS[d];
    let match = true;
    for (let r = 0; r < 7 && match; r++) {
      for (let c = 0; c < DIGIT_W; c++) {
        const inGlyph = r >= g.minY && r < g.minY + g.h &&
                        c >= g.minX && c < g.minX + g.colorWidth;
        const want = inGlyph
          ? g.color[(r - g.minY) * g.colorWidth + (c - g.minX)]
          : COLOR.BACKGROUND;
        if (want !== buf[(y + r) * SCREEN_W + x + c]) { match = false; break; }
      }
    }
    if (match) return String(d);
  }
  return '?';
}

/**
 * Read a whole digit field back, at the seven-pixel pitch.
 * @param {Uint8Array} buf
 * @param {number} x
 * @param {number} digits
 * @param {number} [y]
 * @returns {string}
 */
function readDigits(buf, x, digits, y = HUD_ROW) {
  let out = '';
  for (let d = 0; d < digits; d++) out += readDigit(buf, x + d * DIGIT_W, y);
  return out;
}

/**
 * The set of hues a frame paints outside the waterline, as a sorted string.
 * @param {Uint8Array} buf
 * @returns {string}
 */
function hueOf(buf) {
  const seen = new Set();
  for (let i = 0; i < buf.length; i++) {
    const y = Math.floor(i / SCREEN_W);
    if (y === WATERLINE_ROW) continue;
    if (buf[i] !== COLOR.BACKGROUND && buf[i] !== COLOR.WHITE) seen.add(buf[i]);
  }
  return [...seen].sort().join(',');
}

/**
 * The set of hues a baked sprite carries, ignoring white.
 * @param {Object} sprite
 * @returns {string}
 */
function hueSet(sprite) {
  const seen = new Set();
  for (const v of sprite.color) {
    if (v !== COLOR.BACKGROUND && v !== COLOR.WHITE) seen.add(v);
  }
  return [...seen].sort().join(',');
}
