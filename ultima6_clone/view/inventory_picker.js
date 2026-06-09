// Inventory window (I-10j) — a modal "browse a party member's items and act on the
// highlighted one" surface; the clone's carried-item targeting surface (the analog of
// source's status-panel inventory that Selection.obj points at). Opened by a digit key
// (1..PartySize, main.js); a verb key acts on the highlight (D drop / M give), Enter
// drills into a carried container (recursive), a digit switches member, Esc backs out.
// (Supersedes I-10h's one-shot openInventoryPicker — DROP migrated onto this in step 3.)
//
// Reuses the I-7 substrate: UIStack, makeListCursor, tileIcon, inventoryOf, displayName.
// RECURSIVE: a carried container (a bag) drills in via a nested window, so any CONTAINED
// object at any depth is reachable (source allows any CONTAINED object, C_27A1_14DA / the
// give container branch). A verb hand-off or a member-switch pops the whole window chain
// back to the depth captured at the ROOT open (`_baseDepth`).

import { Container } from '../components/components.js';
import { inventoryOf } from '../world_loader.js';
import { tileIcon } from './ui_icons.js';
import { makeListCursor } from './ui_widgets.js';
import { displayName } from './inspector.js';

// I-10j — the verb-aware inventory window.
// Lists a holder's items; `↑`/`↓` highlights, `Enter` drills INTO a highlighted container
// (recursive), a verb key (`D` drop / `G` give) acts on the highlighted item by closing
// the WHOLE window chain (pop to the root `baseDepth`) and handing off via
// `onVerb(verb, item)`; a digit `1`..`9` switches member via `onDigit(n)` (the window
// unwinds to baseDepth first, then the caller opens member n — see step 2). The title is
// **descriptive — the holder's name** (member or container), NOT the action (the window is
// multi-verb). Esc backs out one level (substrate auto-pop). DROP (step 3) + give (step 4)
// supply `onVerb`; digit-open (step 2) supplies `onDigit`.
export function openInventoryWindow(world, holder, uiStack, opts) {
  const { reg, objlist, onVerb, onDigit, titleName, _baseDepth } = opts;
  const baseDepth = _baseDepth ?? uiStack.depth();
  const nameOf = (item) => {
    const look = reg.tiles?.getTileLook?.(reg.tileForObject(item.objNumber, item.frame), item.quantity);
    return (look && look !== 'Unknown') ? look : `Item #${item.objNumber}`;
  };

  const el = document.createElement('div');
  el.className = 'ui-modal';
  const head = document.createElement('div');
  head.className = 'ui-name';
  head.textContent = titleName ?? displayName(world, holder, { reg, objlist });   // who/what, not the action
  el.appendChild(head);

  const items = inventoryOf(world, holder);
  let listCursor = null;
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ui-meta';
    empty.textContent = '(empty)';
    el.appendChild(empty);
  } else {
    listCursor = makeListCursor(items, {
      renderRow: (item) => {
        const row = document.createElement('div');
        row.appendChild(tileIcon(reg, reg.tileForObject(item.objNumber, item.frame)));
        const n = document.createElement('div');
        n.className = 'ui-name';
        n.textContent = nameOf(item);
        const tags = document.createElement('div');
        tags.className = 'ui-tags';
        const parts = [];
        if (item.quantity > 1) parts.push(`×${item.quantity}`);
        if (item.equipped) parts.push('equipped');
        if (world.has(item.handle, Container)) parts.push('▸ open');
        tags.textContent = parts.join(' · ');
        row.appendChild(n);
        row.appendChild(tags);
        return row;
      },
      onActivate: (item) => {
        // Enter drills INTO a container only; leaf items are acted on via verb keys.
        if (world.has(item.handle, Container)) {
          openInventoryWindow(world, item.handle, uiStack, { ...opts, titleName: nameOf(item), _baseDepth: baseDepth });
        }
      },
    });
    el.appendChild(listCursor.el);
  }

  const hint = document.createElement('div');
  hint.className = 'ui-hint';
  hint.textContent = items.length
    ? '↑↓ move · Enter open · D drop · G give · 1-N switch · Esc back'
    : '1-N switch member · Esc close';
  el.appendChild(hint);

  function onKey(e) {
    const k = e.key;
    // digit → switch member: unwind THIS chain to the root, then the caller opens member n.
    if (onDigit && /^[1-9]$/.test(k)) {
      e.preventDefault();
      while (uiStack.depth() > baseDepth) uiStack.pop();
      onDigit(parseInt(k, 10));
      return;
    }
    // verb key on the highlighted item: close the window chain, hand off to onVerb.
    // `D` = drop, `G` = give (give is MOVE Mode 2 in source/code, but `G` reads as "give"
    // to the player; the map-cursor GET is a separate context, suppressed while open).
    const item = listCursor ? items[listCursor.cursor] : null;
    if (item && onVerb && /^[dg]$/i.test(k)) {
      e.preventDefault();
      const verb = k.toLowerCase() === 'd' ? 'drop' : 'give';
      while (uiStack.depth() > baseDepth) uiStack.pop();
      onVerb(verb, item);
      return;
    }
    if (listCursor) listCursor.onKey(e);   // ↑↓ navigate + Enter drill-in
  }

  uiStack.push({ el, onKey });
}
