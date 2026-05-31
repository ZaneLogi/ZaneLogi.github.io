// Object inspector (I-7c) — the substrate's first consumer. ONE surface for
// any entity: sword / NPC / barrel / chest. Header always present (icon +
// name + type + position); contents list conditional on the Container
// component. Opening a held container pushes a nested inspector via the
// substrate's UIStack — no inline tree, source's "open this then open that"
// model (binding decision recorded in docs/progress.md "I-7 scope").
//
// Reuses everything: inventoryOf (world_loader.js:161), Tiles.getTileLook +
// getTilePixels (assets/tiles.js), TileRegistry.palette, plus the substrate
// (UIStack, ListCursor, tileIcon). No new infra.

import { Position, ObjType, Renderable, Status, Amount, Actor, Container } from '../components/components.js';
import { inventoryOf } from '../world_loader.js';
import { tileIcon } from './ui_icons.js';
import { makeListCursor } from './ui_widgets.js';

// Source's ObjStatus byte (research_world_data.md). Bits we don't decode yet
// hex-dump as "0x__". OWNED/LIT confirmed; the rest are placeholders matched
// to ObjStatus convention and will tighten as I-9+ touches them.
function decodeStatus(bits) {
  const flags = [];
  if (bits & 0x01) flags.push('OK_TO_TAKE');
  if (bits & 0x02) flags.push('TEMPORARY');
  if (bits & 0x04) flags.push('CHARMED');
  if (bits & 0x08) flags.push('IN_CONTAINER');
  if (bits & 0x10) flags.push('INVISIBLE');
  if (bits & 0x20) flags.push('READIED');
  if (bits & 0x40) flags.push('VARIANT_A');     // overloaded (CURSED/HATCHED/MUTANT — type-dispatched, ../ultima6/obj.js:9-11 + u6.h:80-82)
  if (bits & 0x80) flags.push('LIT');
  return flags.length ? flags.join(' ') : '(none)';
}

// Pick a display name — mirrors source's `GetObjectString` (seg_1184.c:1912):
//   1. Party member → objlist's Names[partyIdx] (only party members get
//      personal names in objlist; "(undefined)" for everyone else there).
//   2. Anything else → getTileLook(TILE_FRAME) from look.lzd. This is where
//      personal NPC names live: look.lzd stores "Lord British" at the LB
//      tile id (1769), "musician" for the generic-musician tile range, etc.
//      No separate names table needed — the engine deliberately routes
//      non-party display through the tile string.
function isPartyMember(npcId, objlist) {
  if (!objlist?.party) return false;
  for (let i = 0; i < objlist.partySize; i++) if (objlist.party[i] === npcId) return true;
  return false;
}
function nameFor(world, id, handle, reg, objlist, store) {
  if (world.has(handle, Actor)) {
    const npcId = store.actor.npcId[id];
    if (isPartyMember(npcId, objlist)) return objlist.actors[npcId].name;
    // fall through to getTileLook — source's GetObjectString does the same.
  }
  const qty = store.amount.quantity[id] ?? 1;
  const look = reg.tiles?.getTileLook?.(store.rend.tileId[id], qty);
  if (look && look !== 'Unknown') return look;
  if (world.has(handle, Actor)) return '(NPC)';
  return `Item #${store.obj.objNumber[id]}`;
}

export function openInspector(world, handle, uiStack, { reg, objlist }) {
  const id = world.resolve(handle);
  if (id === -1) return;

  const store = {
    pos:    world.store(Position),
    obj:    world.store(ObjType),
    rend:   world.store(Renderable),
    status: world.store(Status),
    amount: world.store(Amount),
    actor:  world.store(Actor),
  };

  const el = document.createElement('div');
  el.className = 'ui-modal';

  // --- Header: icon · name · meta lines ----------------------------------
  const header = document.createElement('div');
  header.className = 'ui-header';
  header.appendChild(tileIcon(reg, store.rend.tileId[id]));
  const head = document.createElement('div');
  const name = document.createElement('div');
  name.textContent = nameFor(world, id, handle, reg, objlist, store);
  const meta = document.createElement('div');
  meta.className = 'ui-meta';
  const objN = store.obj.objNumber[id];
  const frame = store.obj.frame[id];
  const qty = store.amount.quantity[id];
  const isContainer = world.has(handle, Container);
  const isActor = world.has(handle, Actor);
  const kind = isActor ? 'NPC' : (isContainer ? 'Container' : 'Item');
  meta.textContent = `${kind} · obj#${objN}/f${frame}${qty > 1 ? ` ×${qty}` : ''}`;
  const place = document.createElement('div');
  place.className = 'ui-meta';
  if (world.has(handle, Position)) {
    place.textContent = `@ (${store.pos.x[id]}, ${store.pos.y[id]}, ${store.pos.z[id]})`;
  } else {
    place.textContent = '@ (carried)';
  }
  const statusLine = document.createElement('div');
  statusLine.className = 'ui-meta';
  statusLine.textContent = `status: ${decodeStatus(store.status.bits[id])}`;
  head.appendChild(name);
  head.appendChild(meta);
  head.appendChild(place);
  head.appendChild(statusLine);
  header.appendChild(head);
  el.appendChild(header);

  // --- Contents list (Container only) -----------------------------------
  let listCursor = null;
  if (isContainer) {
    const items = inventoryOf(world, handle);
    listCursor = makeListCursor(items, {
      renderRow: (item) => {
        const row = document.createElement('div');
        row.appendChild(tileIcon(reg, reg.tileForObject(item.objNumber, item.frame)));
        const n = document.createElement('div');
        n.className = 'ui-name';
        const look = reg.tiles?.getTileLook?.(reg.tileForObject(item.objNumber, item.frame), item.quantity);
        n.textContent = (look && look !== 'Unknown') ? look : `Item #${item.objNumber}`;
        const tags = document.createElement('div');
        tags.className = 'ui-tags';
        const tagParts = [];
        if (item.quantity > 1) tagParts.push(`×${item.quantity}`);
        if (item.equipped) tagParts.push('equipped');
        tags.textContent = tagParts.join(' · ');
        row.appendChild(n);
        row.appendChild(tags);
        return row;
      },
      onActivate: (item) => {
        openInspector(world, item.handle, uiStack, { reg, objlist });
      },
    });
    el.appendChild(listCursor.el);
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ui-meta';
      empty.textContent = '(empty)';
      el.appendChild(empty);
    }
  }

  // --- Hint footer ------------------------------------------------------
  const hint = document.createElement('div');
  hint.className = 'ui-hint';
  hint.textContent = isContainer
    ? 'Up/Down · Enter to open · Esc to close'
    : 'Esc to close';
  el.appendChild(hint);

  uiStack.push({
    el,
    onKey: (e) => {
      if (listCursor) listCursor.onKey(e);
      // Esc: substrate auto-pops (UIStack.push handler), so we don't handle here.
    },
  });
}
