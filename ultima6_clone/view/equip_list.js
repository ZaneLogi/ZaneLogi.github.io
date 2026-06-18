// view/equip_list.js (I-18h)
//
// The equipped-equipment slot list — the de-scoped paperdoll. Renders source's 8 equip
// slots (C_155D_1065) as a labeled list ("Head: <item>", "Left Hand: (none)") instead of
// the body-positioned doll. Slot assignment + collision rules come from systems/equip_slots.js
// (the C_155D_07E0 builder); this file is render-only. `nameOf(item)` is supplied by the
// caller so names match the carried list.

import { buildEquipment, SLOT_ORDER, SLOT_LABEL, BLOCKED } from '../systems/equip_slots.js';
import { tileIcon } from './ui_icons.js';

export function makeEquipList(reg, equippedItems, nameOf) {
  const eq = buildEquipment(equippedItems, reg);

  const wrap = document.createElement('div');
  wrap.className = 'equip-list';
  const title = document.createElement('div');
  title.className = 'ui-meta';
  title.textContent = 'Equipped';
  wrap.appendChild(title);

  for (const slot of SLOT_ORDER) {
    const row = document.createElement('div');
    row.className = 'equip-row';
    const label = document.createElement('span');
    label.className = 'equip-label';
    label.textContent = `${SLOT_LABEL[slot]}:`;
    row.appendChild(label);

    const cell = eq[slot];
    if (cell === BLOCKED) {                       // LHND blocked by a two-handed weapon
      const t = document.createElement('span');
      t.className = 'equip-none';
      t.textContent = '(two-handed)';
      row.appendChild(t);
    } else if (cell) {
      row.appendChild(tileIcon(reg, reg.tileForObject(cell.objNumber, cell.frame)));
      const n = document.createElement('span');
      n.className = 'equip-item';
      n.textContent = nameOf(cell);
      row.appendChild(n);
    } else {
      const t = document.createElement('span');
      t.className = 'equip-none';
      t.textContent = '(none)';
      row.appendChild(t);
    }
    wrap.appendChild(row);
  }
  return wrap;
}
