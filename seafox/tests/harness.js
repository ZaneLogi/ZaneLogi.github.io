// seafox/tests/harness.js
//
// Shared plumbing for the test pages: collect labelled pass/fail results, time
// the run, render them, and stamp the outcome into the document title so the
// result is readable without looking at pixels.
//
// Deliberately tiny and dependency-free. design_spec § 20.9 leaves the test
// framework free; what it does not leave free is the expected values, so
// nothing here knows anything about the game.

/**
 * A run's accumulated results.
 */
export class CheckList {
  constructor() {
    /** @type {{label: string, ok: boolean, detail: string}[]} */
    this.results = [];
  }

  /**
   * Record one check.
   * @param {string} label what is being asserted, with its design_spec citation
   * @param {boolean} ok
   * @param {string} [detail] the observed value, shown pass or fail
   * @returns {boolean} ok, so a caller can branch on it
   */
  add(label, ok, detail = '') {
    this.results.push({ label, ok: !!ok, detail, section: false });
    return !!ok;
  }

  /**
   * A heading that groups a long page. It is NOT a check: it asserts nothing
   * and is excluded from the counts, so the headline stays honest.
   * @param {string} title
   * @returns {void}
   */
  section(title) {
    this.results.push({ label: title, ok: true, detail: '', section: true });
  }

  /** @returns {{label: string, ok: boolean, detail: string}[]} real checks only. */
  checks() {
    return this.results.filter((r) => !r.section);
  }

  /**
   * Record an equality check, formatting both sides into the detail line.
   * @param {string} label
   * @param {*} got
   * @param {*} want
   * @param {(v: *) => string} [format] renders each side; defaults to String
   * @returns {boolean}
   */
  eq(label, got, want, format = String) {
    const g = format(got);
    const w = format(want);
    const ok = g === w;
    return this.add(label, ok, ok ? g : g + '   expected ' + w);
  }

  /** @returns {number} how many checks failed. */
  failures() {
    return this.checks().filter((r) => !r.ok).length;
  }
}

/**
 * Run a page's checks and paint them into `#checks`.
 *
 * @param {string} subtitle one line of context under the headline count
 * @param {(list: CheckList) => void} run adds every check to the list
 * @returns {void}
 */
export function mount(subtitle, run) {
  const el = document.getElementById('checks');
  const list = new CheckList();
  let ms = 0;
  try {
    const t0 = performance.now();
    run(list);
    ms = performance.now() - t0;
  } catch (e) {
    el.innerHTML = '<span class="fail">ERROR</span>  ' + escapeHtml(String(e && e.message || e));
    document.title = 'FAIL — ' + document.title;
    throw e;
  }
  render(el, list, ms, subtitle);
}

/**
 * @param {HTMLElement} el
 * @param {CheckList} list
 * @param {number} ms
 * @param {string} subtitle
 * @returns {void}
 */
function render(el, list, ms, subtitle) {
  const failed = list.failures();
  const total = list.checks().length;
  const head = failed === 0
    ? '<span class="pass">' + total + ' / ' + total + ' PASS</span>'
    : '<span class="fail">' + failed + ' of ' + total + ' FAILED</span>';

  el.innerHTML = head + '  <span class="note">' + escapeHtml(subtitle) + ', ' +
    ms.toFixed(1) + ' ms</span>\n\n' +
    list.results.map((r) => {
      if (r.section) return '<span class="head">' + escapeHtml(r.label) + '</span>';
      const mark = r.ok ? '<span class="pass">PASS</span>' : '<span class="fail">FAIL</span>';
      const tail = r.detail
        ? '\n      <span class="note">' + escapeHtml(r.detail) + '</span>'
        : '';
      return mark + '  ' + escapeHtml(r.label) + tail;
    }).join('\n\n');

  document.title = (failed === 0 ? 'PASS' : 'FAIL') + ' — ' + document.title;
}

/**
 * @param {string} s
 * @returns {string} s with HTML metacharacters escaped
 */
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
