// UI substrate widgets (I-7b) — reusable input/render pieces consumed by
// every surface on top of UIStack.
//
// ListCursor: keyboard-driven vertical list. Up/Down navigate (wrapping at
// ends); Enter activates the cursor row. The widget owns a <div class="ui-list">
// with one <div class="ui-row"> per item; the focused row carries the
// `ui-cursor` class. Empty list: no rows; Enter / arrow keys are no-ops.

export function makeListCursor(items, { renderRow, onActivate }) {
  const el = document.createElement('div');
  el.className = 'ui-list';
  const rowEls = items.map((item, i) => {
    const r = renderRow(item, i);
    r.classList.add('ui-row');
    el.appendChild(r);
    return r;
  });
  let cursor = items.length ? 0 : -1;

  function paint() {
    rowEls.forEach((r, i) => r.classList.toggle('ui-cursor', i === cursor));
    if (cursor >= 0) rowEls[cursor].scrollIntoView({ block: 'nearest' });
  }
  paint();

  function select(i) {
    if (!items.length) return;
    cursor = ((i % items.length) + items.length) % items.length;
    paint();
  }

  function onKey(e) {
    if (!items.length) return;
    if (e.key === 'ArrowDown') { select(cursor + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp')   { select(cursor - 1); e.preventDefault(); }
    else if (e.key === 'Enter')     { onActivate(items[cursor], cursor); e.preventDefault(); }
  }

  return { el, onKey, select, get cursor() { return cursor; } };
}
