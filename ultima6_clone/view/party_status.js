// view/party_status.js (I-18c) — the on-demand party status surfaces, the clone's replacement for
// source's fixed right-hand status panel (RefreshStatus C_0A33_1AB7). Status is on-demand here per
// CLAUDE.md §"Modern-browser UX" (the combat-era glanceable-HP value of a persistent panel isn't
// needed yet). I-18c lands the shared party-member list widget + the `P` roster (CMD_91 party-roster
// mode, C_155D_000C seg_155D.c:25). ZSTATS (CMD_90) is I-18d; the GIVE recipient-picker reuses
// makePartyMemberList in I-18e. Stats are read straight off the objlist actor records — the canonical
// store (progress.md §"I-18 scope" → "Data layer"); there is no Stats component.

import { tileIcon } from './ui_icons.js';
import { makeListCursor } from './ui_widgets.js';
import { isHumanoid } from '../systems/humanoid_anim.js';
import { maxHP, maxMagic } from '../systems/stat_formulas.js';

// Down-facing (south) stand sprite for a body type — source's OBJ_MakeDirFrame(OrigShapeType, 4)
// in the roster (seg_155D.c). The clone packs facing into the humanoid frame as walkCycle+(facing<<2)
// with facing 2 = south (humanoid_anim.faceDir) and stand = walkCycle 1, so the south stand frame is
// 9. Party members are always humanoid; frame 0 is a harmless fallback for anything else.
function downFrame(objNumber) { return isHumanoid(objNumber) ? (2 << 2) | 1 : 0; }

// Shared party-member list widget (I-18c) — icon (down-facing sprite) + name (+ optional HP, red when
// <10), keyboard-selectable (↑↓ + Enter, or a digit for that row). Used by the `P` roster (showHp) and,
// in I-18e, the GIVE recipient-picker (exclude: [giver]). `onSelect(slot)` fires with the chosen
// member's objlist slot id. Names / HP / body-type come from the objlist (the canonical stat store).
export function makePartyMemberList({ reg, objlist, exclude = [], showHp = false, onSelect }) {
  const members = objlist.party.slice(0, objlist.partySize)
    .filter((slot) => !exclude.includes(slot))
    .map((slot) => ({ slot, a: objlist.actors[slot] || {} }));

  const list = makeListCursor(members, {
    renderRow: ({ a }) => {
      const row = document.createElement('div');
      const body = a.objNumber || 0;
      row.appendChild(tileIcon(reg, reg.tileForObject(body, downFrame(body))));
      const name = document.createElement('div');
      name.className = 'ui-name';
      name.textContent = a.name || 'someone';
      row.appendChild(name);
      if (showHp) {
        const hp = document.createElement('div');
        hp.className = 'ui-tags';
        const cur = a.hp ?? 0;
        hp.textContent = `${cur}/${maxHP(a.level)} hp`;
        if (cur < 10) hp.style.color = '#c66';     // source: HP < 10 → red (seg_155D.c)
        row.appendChild(hp);
      }
      return row;
    },
    onActivate: ({ slot }) => onSelect(slot),
  });

  function onKey(e) {
    if (/^[1-9]$/.test(e.key)) {                    // digit → select that row (1-based)
      const i = parseInt(e.key, 10) - 1;
      if (i < members.length) { e.preventDefault(); onSelect(members[i].slot); return; }
    }
    list.onKey(e);                                  // ↑↓ navigate + Enter activate
  }

  return { el: list.el, onKey };
}

// The `P` roster modal (I-18c) — CMD_91 party-roster mode (C_155D_000C). Lists the whole party
// (icon + name + HP) on the UIStack; selecting a member fires onSelect(slot). `P` is a clone coinage
// (source had no open-roster key — the roster WAS the always-on panel). I-18d points onSelect at the
// member's ZSTATS; until then the caller wires it to a browse placeholder.
export function openPartyRoster(uiStack, { reg, objlist, onSelect }) {
  const el = document.createElement('div');
  el.className = 'ui-modal';
  const head = document.createElement('div');
  head.className = 'ui-header';
  head.textContent = 'Party';
  el.appendChild(head);

  const list = makePartyMemberList({ reg, objlist, showHp: true, onSelect });
  el.appendChild(list.el);

  const hint = document.createElement('div');
  hint.className = 'ui-hint';
  hint.textContent = '↑↓ move · 1-N or Enter select · Esc back';
  el.appendChild(hint);

  uiStack.push({ el, onKey: list.onKey });
}

// ZSTATS (I-18d) — CMD_90 per-member stats view (C_155D_028A seg_155D.c:84): name + portrait +
// STR/DEX/INT + Magic cur/MAX + Health cur/MAX + Level/Exp, all read from the objlist actor record
// + the stat_formulas max helpers (no Stats component). Stacks on the roster (Esc peels back).
// `Tab` → onTab() (the caller opens that member's inventory window — the CMD_92 paperdoll reuse);
// a digit → onMember(n) (switch to party member n). Portrait via the I-12 lazy decoder
// (portraits.imageData(slot); the Avatar's slot has no portrait yet → blank box, as in I-12).
export function openZStats(uiStack, { reg, objlist, portraits, slot, onTab, onMember }) {
  const a = objlist.actors[slot] || {};
  const el = document.createElement('div');
  el.className = 'ui-modal';

  const head = document.createElement('div');
  head.className = 'ui-header';
  head.textContent = a.name || 'someone';
  el.appendChild(head);

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '12px';
  row.style.alignItems = 'flex-start';

  const portrait = document.createElement('canvas');   // reuse the I-12 portrait box (112×128, pixelated)
  portrait.className = 'dialog-portrait';
  portrait.width = 56; portrait.height = 64;
  const img = portraits && portraits.imageData(slot);
  if (img) portrait.getContext('2d').putImageData(img, 0, 0);
  row.appendChild(portrait);

  const stats = document.createElement('div');
  const line = (label, val, low) => {
    const d = document.createElement('div');
    d.className = 'ui-meta';
    d.textContent = `${label}: ${val}`;
    if (low) d.style.color = '#c66';
    return d;
  };
  stats.appendChild(line('STR', a.strength ?? 0));
  stats.appendChild(line('DEX', a.dexterity ?? 0));
  stats.appendChild(line('INT', a.intelligence ?? 0));
  stats.appendChild(line('Magic', `${a.mp ?? 0}/${maxMagic(a.objNumber, a.intelligence)}`));
  stats.appendChild(line('Health', `${a.hp ?? 0}/${maxHP(a.level)}`, (a.hp ?? 0) < 10));
  stats.appendChild(line('Level', a.level ?? 0));
  stats.appendChild(line('Exp', a.exp ?? 0));
  row.appendChild(stats);
  el.appendChild(row);

  const hint = document.createElement('div');
  hint.className = 'ui-hint';
  hint.textContent = 'Tab inventory · 1-N member · Esc back';
  el.appendChild(hint);

  function onKey(e) {
    if (e.key === 'Tab') { e.preventDefault(); if (onTab) onTab(); return; }
    if (/^[1-9]$/.test(e.key)) { e.preventDefault(); if (onMember) onMember(parseInt(e.key, 10)); return; }
  }

  uiStack.push({ el, onKey });
}

// GIVE recipient-picker (I-18e) — the inventory window's `G` pushes this modal listing the party
// MINUS the giver (the shared makePartyMemberList, exclude:[giverSlot]); selecting a member fires
// onPick(recipientSlot). Empty (party of one) → an empty-state line, Esc cancels. Replaces the old
// bare-map armGive recipient dance (progress.md §"I-18 scope").
export function openRecipientPicker(uiStack, { reg, objlist, giverSlot, onPick }) {
  const el = document.createElement('div');
  el.className = 'ui-modal';
  const head = document.createElement('div');
  head.className = 'ui-header';
  head.textContent = 'Give to whom?';
  el.appendChild(head);

  const others = objlist.party.slice(0, objlist.partySize).filter((s) => s !== giverSlot);
  let onKey = () => {};                                   // empty list → only Esc (substrate) closes
  if (others.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ui-meta';
    empty.textContent = '(no one else to give to)';
    el.appendChild(empty);
  } else {
    const list = makePartyMemberList({ reg, objlist, exclude: [giverSlot], onSelect: onPick });
    el.appendChild(list.el);
    onKey = list.onKey;
  }

  const hint = document.createElement('div');
  hint.className = 'ui-hint';
  hint.textContent = others.length ? '↑↓ move · 1-N or Enter select · Esc cancel' : 'Esc cancel';
  el.appendChild(hint);

  uiStack.push({ el, onKey });
}
