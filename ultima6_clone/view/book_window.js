// view/book_window.js
//
// I-book — the book/sign reader modal. LOOK at a readable object opens this with the
// object's name + its BOOK.DAT text (resources/books.js get(quality)). Source:
// seg_27a1.c C_27A1_078F simply CON_printf's the text into the scroll; this modal is
// the modern-UX surface (a scrollable, dismissable window — CLAUDE.md "modern-browser
// UX as architectural anchor").
//
// Renders the U6 inline markup carried in BOOK.DAT:
//   <...>  gargoyle / runic text — the clone has no rune font, so it's shown in a
//          distinct "inscribed" style; the gargoyle transliteration stays readable.
//   @word  a highlighted keyword.
//   *      a paragraph break (rendered as a blank line).
//   &      a section/translation marker — dropped (a formatting control, not text).
//   \      a plural marker — dropped (keeps the suffix letter, e.g. "rune\s" → "runes").
//   \n     a line break (rendered natively via white-space: pre-wrap).

export function openBookWindow(uiStack, title, rawText) {
  const el = document.createElement('div');
  el.className = 'ui-modal book-window';

  const header = document.createElement('div');
  header.className = 'ui-header book-title';
  header.textContent = title || 'You read:';
  el.appendChild(header);

  const body = document.createElement('div');
  body.className = 'book-text';
  renderInto(body, rawText || '');
  el.appendChild(body);

  const hint = document.createElement('div');
  hint.className = 'ui-hint';
  hint.textContent = 'Esc to close · ↑/↓ · PgUp/PgDn to scroll';
  el.appendChild(hint);

  const modal = {
    el,
    onKey(e) {
      if (e.key === 'Escape') return;            // let the stack pop → close
      const page = Math.max(40, body.clientHeight * 0.85);
      if (e.key === 'ArrowDown') { body.scrollTop += 48; e.preventDefault(); }
      else if (e.key === 'ArrowUp') { body.scrollTop -= 48; e.preventDefault(); }
      else if (e.key === 'PageDown' || e.key === ' ') { body.scrollTop += page; e.preventDefault(); }
      else if (e.key === 'PageUp') { body.scrollTop -= page; e.preventDefault(); }
      else if (e.key === 'Home') { body.scrollTop = 0; e.preventDefault(); }
      else if (e.key === 'End') { body.scrollTop = body.scrollHeight; e.preventDefault(); }
    },
    onClose() {},
  };
  uiStack.push(modal);
  return modal;
}

// Markup → DOM. `*` becomes a real newline (so `*\n` reads as a paragraph gap); the
// section (&) and plural (\) markers are dropped. Then the text is split into gargoyle
// <...> regions vs normal runs, each rendered with @word highlights. Newlines render
// natively because .book-text is white-space: pre-wrap.
function renderInto(container, raw) {
  const text = raw.replace(/\*/g, '\n').replace(/[&\\]/g, '');
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) { appendRun(container, text.slice(i), false); break; }
    if (lt > i) appendRun(container, text.slice(i, lt), false);
    const gt = text.indexOf('>', lt + 1);
    if (gt === -1) { appendRun(container, text.slice(lt + 1), true); break; }   // unterminated <…> → rest is runic
    appendRun(container, text.slice(lt + 1, gt), true);
    i = gt + 1;
  }
}

// Append one run (normal or gargoyle), expanding @word highlights. Plain text (incl.
// newlines) goes into text nodes; pre-wrap turns the newlines into breaks.
function appendRun(container, run, runic) {
  for (const part of run.split(/(@\w+)/g)) {
    if (!part) continue;
    if (part[0] === '@') {
      const span = document.createElement('span');
      span.className = 'book-hl';
      span.textContent = part.slice(1);
      container.appendChild(span);
    } else if (runic) {
      const span = document.createElement('span');
      span.className = 'book-runic';
      span.textContent = part;
      container.appendChild(span);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  }
}
