// view/spellbook_window.js — I-spellbook `c` modal.
//
// A scrollable spellbook listing ALL named U6 spells grouped by circle, the way source's
// book reads (`SpellName[]`). ↑↓ moves over the named spells (circle headers are skipped),
// Enter casts the highlight (closes the book, then `onCast(spellNum)` runs), Esc closes
// (UIStack default pop). The implemented few are starred; each reagent is tinted by whether
// the party carries it (informational only — no reagent gate, per research_spellbook.md §1).
//
// Reuses the I-7 UIStack substrate + the index.html `.ui-*` classes (a bespoke list rather
// than makeListCursor because of the per-circle headers, but the same row/cursor classes).

import { namedSpellsByCircle, reagentParts, SPELL_DESC } from '../resources/spells.js';

export function openSpellbook(uiStack, { haveMask = 0, onCast } = {}) {
  const groups = namedSpellsByCircle();

  const el = document.createElement('div');
  el.className = 'ui-modal';
  const head = document.createElement('div');
  head.className = 'ui-name';
  head.textContent = 'Spellbook';
  el.appendChild(head);

  const list = document.createElement('div');
  list.className = 'ui-list';
  el.appendChild(list);

  const entries = [];   // selectable spell entries, in display order (headers excluded)
  const rowEls = [];
  for (const g of groups) {
    const header = document.createElement('div');
    header.className = 'ui-meta';
    header.textContent = `── ${g.label} ──`;
    list.appendChild(header);
    for (const e of g.entries) {
      const row = document.createElement('div');
      row.className = 'ui-row';

      const star = document.createElement('span');
      star.style.flex = '0 0 14px';
      star.textContent = e.implemented ? '★' : '';
      row.appendChild(star);

      const n = document.createElement('span');
      n.className = 'ui-name';
      n.textContent = e.name;
      row.appendChild(n);

      const tags = document.createElement('span');
      tags.className = 'ui-tags';
      for (const p of reagentParts(e.mask)) {
        const t = document.createElement('span');
        t.textContent = p.abbr;
        t.style.marginLeft = '5px';
        t.style.opacity = (haveMask & p.bit) ? '1' : '0.3';   // carried = bright, missing = dim
        tags.appendChild(t);
      }
      row.appendChild(tags);

      list.appendChild(row);
      entries.push(e);
      rowEls.push(row);
    }
  }

  const foot = document.createElement('div');
  foot.className = 'ui-meta';
  el.appendChild(foot);

  const hint = document.createElement('div');
  hint.className = 'ui-hint';
  hint.textContent = '↑↓ select · Enter cast · Esc close';
  el.appendChild(hint);

  const footerText = (e) => {
    const reags = reagentParts(e.mask).map((p) => p.name).join(', ') || 'no reagents';
    return `${SPELL_DESC[e.num] ?? 'Has no effect.'} — ${reags}`;
  };

  let cursor = entries.length ? 0 : -1;
  function paint() {
    rowEls.forEach((r, i) => r.classList.toggle('ui-cursor', i === cursor));
    if (cursor < 0) { foot.textContent = ''; return; }
    rowEls[cursor].scrollIntoView({ block: 'nearest' });
    foot.textContent = footerText(entries[cursor]);
  }

  function move(d) {
    if (!entries.length) return;
    cursor = ((cursor + d) % entries.length + entries.length) % entries.length;
    paint();
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { move(1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { move(-1); e.preventDefault(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const sp = entries[cursor];
      if (!sp) return;
      uiStack.pop();          // close the book first — a targeted cast arms the map cursor underneath
      onCast?.(sp.num);
    }
    // Esc → UIStack default pop.
  }

  uiStack.push({ el, onKey });

  // Reserve a FIXED footer height = the tallest description+reagents line across all spells, so
  // arrowing the list never reflows the footer (descriptions/reagent lists vary 1–3 lines, and the
  // modal is centre-anchored, so a growing footer jiggled the whole window). Measured once, after the
  // modal is in the DOM (offsetHeight needs layout) — so it adapts to the actual modal width.
  let maxH = 0;
  for (const e of entries) { foot.textContent = footerText(e); maxH = Math.max(maxH, foot.offsetHeight); }
  if (maxH) foot.style.minHeight = `${maxH}px`;
  paint();
}
