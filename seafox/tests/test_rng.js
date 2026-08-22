// seafox/tests/test_rng.js
//
// Oracle 1 -- the generator (design_spec § 20.2). A pure unit test: no
// simulation, no entity list, no renderer. It is first in § 20.8's bring-up
// order because it needs nothing else to exist, and first in importance
// because everything random in the game descends from it and nothing about a
// wrong generator looks wrong. A game with a subtly different generator plays
// plausibly and matches no other oracle.
//
// Five assertions come from § 20.2's table; two more come from § 5.4, which
// states checkable properties of the state space and is worth holding to
// them. Three of the seven are exhaustive over all 65536 states -- cheap
// enough to run on every load, and they catch a generator that produces the
// right first dozen values and diverges later.
//
// State-space packing used throughout: packed = s2 | (s3 << 8). s1 is not part
// of it -- § 5.2 makes it derived, so it cannot distinguish two states.

import { Rng, stepState, INITIAL_STATE } from '../src/core/rng.js';

/** @type {number[]} The twelve values § 5.5 and § 20.2 expect from the shipped state. */
const TEST_VECTOR = [
  0x72, 0xFF, 0x8C, 0xB8, 0xD0, 0xD0, 0xB8, 0x8C, 0xFE, 0xF3, 0x06, 0xF1,
];

/** @type {number} Size of the packed state space, 2^16. */
const STATE_COUNT = 65536;

main();

function main() {
  const el = document.getElementById('checks');
  try {
    const t0 = performance.now();
    const results = runChecks();
    render(el, results, performance.now() - t0);
  } catch (e) {
    el.innerHTML = '<span class="fail">ERROR</span>  ' + e.message;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// The state-space sweep -- shared by four of the seven checks
// ---------------------------------------------------------------------------

/**
 * Build the successor and in-degree maps over the whole state space.
 * @returns {{succ: Uint16Array, indeg: Uint16Array}} successor per packed
 *   state, and how many states step INTO each packed state.
 */
function sweep() {
  const succ = new Uint16Array(STATE_COUNT);
  const indeg = new Uint16Array(STATE_COUNT);
  for (let st = 0; st < STATE_COUNT; st++) {
    const n = stepState(st & 0xFF, st >>> 8);
    const to = n.s2 | (n.s3 << 8);
    succ[st] = to;
    indeg[to]++;
  }
  return { succ, indeg };
}

/**
 * Every distinct cycle length in the successor graph. Each state is walked at
 * most once: a path is coloured as it is laid down, and landing on the current
 * path closes a new cycle.
 * @param {Uint16Array} succ successor per packed state
 * @returns {Set<number>} distinct cycle lengths
 */
function cycleLengths(succ) {
  const colour = new Uint8Array(STATE_COUNT);   // 0 unseen, 1 on this path, 2 done
  const pos = new Int32Array(STATE_COUNT);      // index of the state along this path
  const lengths = new Set();

  for (let start = 0; start < STATE_COUNT; start++) {
    if (colour[start] !== 0) continue;
    const path = [];
    let cur = start;
    while (colour[cur] === 0) {
      colour[cur] = 1;
      pos[cur] = path.length;
      path.push(cur);
      cur = succ[cur];
    }
    if (colour[cur] === 1) lengths.add(path.length - pos[cur]);   // closed a new cycle
    for (const p of path) colour[p] = 2;
  }
  return lengths;
}

/**
 * Walk from one state until it repeats.
 * @param {number} packed starting state
 * @param {Uint16Array} succ successor per packed state
 * @returns {{period: number, tail: number}} cycle length, and how many steps
 *   are taken before entering the cycle
 */
function periodFrom(packed, succ) {
  const seen = new Int32Array(STATE_COUNT).fill(-1);
  let cur = packed;
  let i = 0;
  while (seen[cur] === -1) {
    seen[cur] = i++;
    cur = succ[cur];
  }
  return { period: i - seen[cur], tail: seen[cur] };
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

/**
 * @param {number} v byte
 * @returns {string} two-digit uppercase hex
 */
function hex(v) {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Run every Oracle-1 assertion.
 * @returns {{label: string, ok: boolean, detail: string}[]} one row per check
 */
function runChecks() {
  const out = [];

  // 1. The test vector (§ 5.5, § 20.2). A consumer steps, then reads s2.
  const rng = new Rng();
  const got = [];
  for (let i = 0; i < TEST_VECTOR.length; i++) got.push(rng.step());
  const vectorOk = got.every((v, i) => v === TEST_VECTOR[i]);
  out.push({
    label: 'the first twelve values from the shipped state (§ 5.5)',
    ok: vectorOk,
    detail: got.map(hex).join(' ') +
      (vectorOk ? '' : '   expected ' + TEST_VECTOR.map(hex).join(' ')),
  });

  // The generator is never reseeded, so a draw counter is the only record of
  // how far it has run. Draw ORDER is normative (§ 5.6), and Oracle 2 will
  // assert against this counter.
  out.push({
    label: 'stepping advances the draw counter, for the § 5.6 draw-order checks',
    ok: rng.draws === TEST_VECTOR.length,
    detail: 'draws = ' + rng.draws + ' after ' + TEST_VECTOR.length + ' steps',
  });

  const { succ, indeg } = sweep();

  // 2. Period from the shipped state (§ 20.2).
  const shipped = INITIAL_STATE.s2 | (INITIAL_STATE.s3 << 8);
  const walk = periodFrom(shipped, succ);
  out.push({
    label: 'the period from the shipped state is 32767 (§ 5.4)',
    ok: walk.period === 32767,
    detail: 'period ' + walk.period + ', reached after a tail of ' + walk.tail +
      (walk.tail === 1
        ? ' -- the shipped state is itself transient and is never revisited'
        : ''),
  });

  // 3. The step map is exactly 2-to-1 (§ 5.4, § 20.2).
  const hist = new Map();
  for (let i = 0; i < STATE_COUNT; i++) hist.set(indeg[i], (hist.get(indeg[i]) || 0) + 1);
  const histOk = hist.size === 2 && hist.get(0) === 32768 && hist.get(2) === 32768;
  const histText = [...hist.entries()].sort((a, b) => a[0] - b[0])
    .map((e) => e[0] + ': ' + e[1]).join(', ');
  out.push({
    label: 'in-degree histogram over all 65536 states is {0: 32768, 2: 32768} (§ 20.2)',
    ok: histOk,
    detail: '{' + histText + '}' + (histOk
      ? ' -- the map is 2-to-1, not a bijection'
      : ' -- expected {0: 32768, 2: 32768}'),
  });

  // 4. The image after one step is 2^15 (§ 5.4, § 20.2).
  let image = 0;
  for (let i = 0; i < STATE_COUNT; i++) if (indeg[i] !== 0) image++;
  const imageOk = image === 32768;
  out.push({
    label: 'the image after one step is exactly 32768 = 2^15 (§ 20.2)',
    ok: imageOk,
    detail: image + ' reachable states' + (imageOk
      ? ' -- fifteen live bits, not sixteen'
      : ' -- expected 32768, so the live-bit count is wrong'),
  });

  // 5. Two cycles: the fixed point at zero, and one of 2^15 - 1 (§ 20.2).
  const lengths = [...cycleLengths(succ)].sort((a, b) => a - b);
  const cyclesOk = lengths.length === 2 && lengths[0] === 1 && lengths[1] === 32767;
  out.push({
    label: 'distinct cycle lengths are {1, 32767} (§ 20.2)',
    ok: cyclesOk,
    detail: '{' + lengths.join(', ') + '}' + (cyclesOk
      ? ' -- the two do not sum to 65536, because the other 32768 states are ' +
        'transient and funnel in through the 2-to-1 collapse'
      : ' -- expected {1, 32767}'),
  });

  // 6. Bit 0 of s2 carries nothing forward (§ 5.4). This is why § 8.4's
  //    entry-side coin flip samples bit 1 rather than bit 0.
  let bit0Carries = 0;
  for (let st = 0; st < STATE_COUNT; st += 2) {
    if (succ[st] !== succ[st | 1]) bit0Carries++;
  }
  out.push({
    label: 'bit 0 of s2 carries nothing forward -- states differing only there ' +
      'share a successor (§ 5.4)',
    ok: bit0Carries === 0,
    detail: bit0Carries === 0
      ? 'all 32768 pairs agree -- a consumer wanting one bit must not take the low one (§ 8.4)'
      : bit0Carries + ' pairs disagree',
  });

  // 7. Zero is unreachable (§ 5.4). Its predecessors are itself -- it is the
  //    fixed point -- and one state absent from the image, so nothing falls
  //    into zero unless it starts there.
  const preds = [];
  for (let st = 0; st < STATE_COUNT; st++) if (succ[st] === 0) preds.push(st);
  const outside = preds.filter((p) => p !== 0);
  const zeroOk = preds.indexOf(0) !== -1 && outside.length === 1 && indeg[outside[0]] === 0;
  out.push({
    label: 'the generator cannot reach zero (§ 5.4)',
    ok: zeroOk,
    detail: outside.length === 1
      ? 'the only predecessors of zero are zero itself and s2=' + hex(outside[0] & 0xFF) +
        ' s3=' + hex(outside[0] >>> 8) + ', whose own in-degree is ' + indeg[outside[0]] +
        ' -- absent from the image, so unreachable after step 1'
      : outside.length + ' predecessors besides zero itself',
  });

  return out;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/**
 * Paint the results panel.
 * @param {HTMLElement} el the panel
 * @param {{label: string, ok: boolean, detail: string}[]} results
 * @param {number} ms wall-clock time the whole run took
 * @returns {void}
 */
function render(el, results, ms) {
  const failed = results.filter((r) => !r.ok).length;
  const head = failed === 0
    ? '<span class="pass">' + results.length + ' / ' + results.length + ' PASS</span>'
    : '<span class="fail">' + failed + ' of ' + results.length + ' FAILED</span>';

  el.innerHTML = head + '  <span class="note">Oracle 1 -- the generator (§ 20.2), ' +
    ms.toFixed(1) + ' ms, three checks exhaustive over 65536 states</span>\n\n' +
    results.map((r) => {
      const mark = r.ok ? '<span class="pass">PASS</span>' : '<span class="fail">FAIL</span>';
      const tail = r.detail ? '\n      <span class="note">' + r.detail + '</span>' : '';
      return mark + '  ' + r.label + tail;
    }).join('\n\n');

  document.title = (failed === 0 ? 'PASS' : 'FAIL') + ' — ' + document.title;
}
