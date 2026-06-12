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

import { Container, ContainedIn } from '../components/components.js';
import { inventoryOf, moveToInventory } from '../world_loader.js';
import { tileIcon } from './ui_icons.js';
import { makeListCursor } from './ui_widgets.js';
import { displayName } from './inspector.js';
import { makeEquipList } from './equip_list.js';

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
  const { reg, objlist, onVerb, onDigit, titleName, _baseDepth, tabBack, onGive, holderStr, onEquip, onMove, cursorHandle } = opts;
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
  const equipped = items.filter((i) => i.equipped);     // I-18h: -> the equipped-slot list
  const carried = items.filter((i) => !i.equipped);     // non-equipped subset, for the weight footer (the right list shows all `items`)
  const isRoot = _baseDepth === undefined;              // the two-column member view (not a drilled-in bag)
  if (isRoot) el.classList.add('inv-window');           // wider modal for the two-column layout

  // Two columns at the member root: the equipped-slot list (the de-scoped paperdoll) | the full
  // item list. The right list shows ALL items incl. worn ones (tagged `equipped`); `E` toggles
  // ready/unready on the highlight (I-18j). A drilled-in container shows just its contents.
  const body = document.createElement('div');
  body.className = 'inv-body';
  if (isRoot) body.appendChild(makeEquipList(reg, equipped, nameOf));

  const carriedCol = document.createElement('div');
  carriedCol.className = 'inv-carried';
  if (isRoot) {
    const ct = document.createElement('div');
    ct.className = 'ui-meta';
    ct.textContent = 'Items';
    carriedCol.appendChild(ct);
  }

  let listCursor = null;
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ui-meta';
    empty.textContent = '(empty)';
    carriedCol.appendChild(empty);
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
    carriedCol.appendChild(listCursor.el);
  }
  body.appendChild(carriedCol);
  el.appendChild(body);

  // I-18j follow-up: after an equip/unequip rebuild, restore the cursor onto the same item (by handle)
  // instead of snapping back to the top of the list.
  if (cursorHandle != null && listCursor) {
    const ci = items.findIndex((it) => it.handle === cursorHandle);
    if (ci >= 0) listCursor.select(ci);
  }

  // I-18i: weight/STR encumbrance footer (root member only) — C_155D_0CF5's two stone readouts
  // (equipped/STR + total/STR×2) via GetWeight (C_155D_0661) + the C_155D_0CB6 tenths->stones round.
  // Display-only eye candy; the carry-cap mechanic lands with combat/inventory later.
  if (isRoot && holderStr) {
    const COIN = new Set([0x58, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48]);   // D_081F: weight stored per-10 units
    const itemW = (it) => { const w = reg.weightOf(it.objNumber) * (it.quantity ?? 1); return COIN.has(it.objNumber) ? Math.floor(w / 10) : w; };
    const encumb = (it) => world.has(it.handle, Container)
      ? inventoryOf(world, it.handle).reduce((s, c) => s + itemW(c) + encumb(c), 0) : 0;
    const stones = (tenths) => { const si = Math.floor(tenths / 10), di = tenths % 10; return si ? si + (di >= 5 ? 1 : 0) : (di ? 1 : 0); };
    const wEquip = equipped.reduce((s, i) => s + reg.weightOf(i.objNumber), 0);
    const wInven = carried.reduce((s, i) => s + itemW(i) + encumb(i), 0);
    const foot = document.createElement('div');
    foot.className = 'equip-weight';
    foot.textContent = `Weight — equipped ${stones(wEquip)}/${holderStr} · total ${stones(wInven + wEquip)}/${holderStr * 2} st`;
    el.appendChild(foot);
  }

  const hint = document.createElement('div');
  hint.className = 'ui-hint';
  hint.textContent = items.length
    ? '↑↓ · Enter open · E equip · M move · D drop · G give · 1-N · Esc'
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
    // I-18j: `E` ready/unready the highlighted item. Readying re-parents the item to the member
    // (B — so `E` works on a bagged equippable too, pulling it out), so unwind the whole inventory
    // chain to baseDepth and let onEquip toggle + reopen the member view (mirrors the digit/drop unwind).
    if (item && onEquip && /^e$/i.test(k)) {
      e.preventDefault();
      while (uiStack.depth() > baseDepth) uiStack.pop();
      onEquip(item);
      return;
    }
    // I-18k: `M` opens the "move to…" picker for the highlighted item (relocate in/out of a container).
    if (item && onMove && /^m$/i.test(k)) { e.preventDefault(); onMove(item, baseDepth); return; }
    if (item && /^[dg]$/i.test(k)) {
      e.preventDefault();
      // I-18e: `G` opens an in-stack recipient-picker (onGive) WITHOUT closing the window chain — the
      // picker stacks on top and the caller rebuilds this list after the give. `D` (and legacy give
      // when no onGive is wired) closes the chain to baseDepth and hands off via onVerb (drop then
      // arms the map cursor).
      if (k.toLowerCase() === 'g' && onGive) { onGive(item); return; }
      if (onVerb) {
        const verb = k.toLowerCase() === 'd' ? 'drop' : 'give';
        while (uiStack.depth() > baseDepth) uiStack.pop();
        onVerb(verb, item);
      }
      return;
    }
    // I-18d: when opened as the ZSTATS Tab-toggle side, Tab pops back to the ZSTATS view
    // (which sits underneath on the stack); Esc also pops (substrate default), so Tab/Esc both return.
    if (tabBack && k === 'Tab') { e.preventDefault(); uiStack.pop(); return; }
    if (listCursor) listCursor.onKey(e);   // ↑↓ navigate + Enter drill-in
  }

  uiStack.push({ el, onKey });
}

// I-18k: the "move to…" destination picker — relocate an item between the member's top-level
// inventory and any of its containers (bags), BOTH directions (the inventory drag-drop analog;
// source InsertObj with INVEN↔CONTAINED coord-use). Destinations = the member top-level (only when
// the item is currently nested in a container) + the member's direct containers, minus the item
// itself + its current holder. Picking one re-parents via moveToInventory (= attachToHolder, with
// equipped cleared); `onMoved` rebuilds the member view. Returns false (no picker) when there's
// nowhere to move it. Nested-container destinations + a no-dest message are deferred refinements.
export function openMovePicker(uiStack, world, { reg, objlist, item, holder, onMoved, message }) {
  const nameOf = (it) => {
    const look = reg.tiles?.getTileLook?.(reg.tileForObject(it.objNumber, it.frame), it.quantity);
    return (look && look !== 'Unknown') ? look : `Item #${it.objNumber}`;
  };
  const i = world.resolve(item.handle);
  const currentHolder = i === -1 ? holder : world.store(ContainedIn).holder[i];

  const dests = [];
  if (currentHolder !== holder) dests.push({ handle: holder, label: 'Inventory (carried)', tile: null });
  for (const it of inventoryOf(world, holder)) {                              // the member's DIRECT containers
    if (world.has(it.handle, Container) && it.handle !== item.handle && it.handle !== currentHolder) {
      dests.push({ handle: it.handle, label: nameOf(it), tile: reg.tileForObject(it.objNumber, it.frame) });
    }
  }
  if (dests.length === 0) return false;

  const el = document.createElement('div');
  el.className = 'ui-modal';
  const head = document.createElement('div');
  head.className = 'ui-name';
  head.textContent = `Move ${nameOf(item)} to…`;
  el.appendChild(head);

  const lc = makeListCursor(dests, {
    renderRow: (d) => {
      const row = document.createElement('div');
      const icon = d.tile != null ? tileIcon(reg, d.tile) : document.createElement('span');
      icon.classList.add('ui-icon');                                         // keep the row aligned when there's no tile
      row.appendChild(icon);
      const n = document.createElement('div');
      n.className = 'ui-name';
      n.textContent = d.label;
      row.appendChild(n);
      return row;
    },
    onActivate: (d) => {
      moveToInventory(world, item.handle, d.handle);
      if (message) message(d.tile == null ? `You take ${nameOf(item)}.` : `You put ${nameOf(item)} in the ${d.label}.`);
      onMoved();
    },
  });
  el.appendChild(lc.el);

  const hint = document.createElement('div');
  hint.className = 'ui-hint';
  hint.textContent = '↑↓ · Enter move · Esc cancel';
  el.appendChild(hint);

  uiStack.push({ el, onKey: (e) => lc.onKey(e) });
  return true;
}
