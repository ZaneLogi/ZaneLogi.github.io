---
name: locate
description: >-
  Find where a target is in the running ultima6_clone — an NPC by name, an object
  by number, or a roster of NPCs around a tile. Invoke as `/locate <name>`,
  `/locate obj <N>`, or `/locate near <x> <y>`. Reads the live game via preview-eval
  and reports tile(s) + direction/distance from the avatar, so it pairs with
  `/teleport_to` (go there) and `/decode_npc` (read them). Use when chasing the quest:
  "where is X?".
scope: ultima6_clone (quest-trace branch) — needs the running preview with U6 data dropped
---

# /locate — find an NPC / object / area roster

A committed project dev-skill (see `ultima6_clone/CLAUDE.md` §"Project dev-skills").
On `/locate …`, read and follow this file. It only **reads** — pair it with
`/teleport_to <x> <y>` to travel and `/decode_npc <name>` to read the script.

## 0. Prereqs
- The `u6` preview must be running with the user's U6 data dropped. `preview_list` → grab the
  `u6` serverId (`preview_start("u6")` if none). All evals run via `preview_eval`.

## Mode A — `/locate <name>` (NPC by name)
Resolves the name → npcId (via the conversation-script name), then reports the NPC's **home**
tile (schedule slot 0 — works even if the region isn't loaded) and **live** tile (if currently
loaded), with distance + direction from the avatar. Substitute `__NAME__`:

```js
(async () => {
  const u = window.__U6;
  const { U6DB } = await import('/u6db.js');
  const { ConversationScripts } = await import('/assets/converse.js');
  const s = new ConversationScripts({ a: await U6DB.get('converse.a'), b: await U6DB.get('converse.b') });
  const OP_DESC = 0xf1, OP_ID = 0xff, q = '__NAME__'.toLowerCase();
  const nameOf = (id) => { let d; try { d = s.get(id); } catch (e) { return null; } if (!d || d.length < 3) return null;
    let pc = 0; if (d[pc] === OP_ID) pc++; pc++; let n = ''; while (pc < d.length && d[pc] !== OP_DESC) n += String.fromCharCode(d[pc++]); return n; };
  const pos = u.stores.pos, ai = u.actorIndex, aid = u.world.resolve(u.avatarRef.handle), ax = pos.x[aid], ay = pos.y[aid];
  const dir = (dx, dy) => (`${dy<0?'N':dy>0?'S':''}${dx<0?'W':dx>0?'E':''}`) || 'here';
  const rel = (t) => t ? `${Math.max(Math.abs(t.x-ax), Math.abs(t.y-ay))} ${dir(t.x-ax, t.y-ay)}` : null;
  const out = [];
  for (let id = 0; id <= 0xdf; id++) {
    const n = nameOf(id); if (!n || !n.toLowerCase().includes(q)) continue;
    let live = null; const h = ai.get(id); if (h !== undefined) { const e = u.world.resolve(h); if (e >= 0) live = { x: pos.x[e], y: pos.y[e], z: pos.z[e] }; }
    let home = null; try { const info = u.inspectNpc(id); const sl = info && info.schedule && info.schedule.slots && info.schedule.slots[0]; if (sl) home = { x: sl.x, y: sl.y, z: sl.z }; } catch (e) {}
    out.push({ id, name: n, home, homeFromAvatar: rel(home), live, liveFromAvatar: rel(live) });
  }
  return { avatar: [ax, ay], matches: out };
})()
```

## Mode B — `/locate obj <N>` (object by number)
Lists every instance of object `N` in the **loaded** world (ground tiles + container/inventory
holders), with distance + direction. Substitute `__N__`:

```js
(() => {
  const u = window.__U6, r = u.findByObj(__N__) || [];
  const pos = u.stores.pos, aid = u.world.resolve(u.avatarRef.handle), ax = pos.x[aid], ay = pos.y[aid];
  const dir = (dx, dy) => (`${dy<0?'N':dy>0?'S':''}${dx<0?'W':dx>0?'E':''}`) || 'here';
  const inst = r.slice(0, 30).map(o => o.x != null
    ? { x: o.x, y: o.y, qual: o.quality, frame: o.frame, from: `${Math.max(Math.abs(o.x-ax), Math.abs(o.y-ay))} ${dir(o.x-ax, o.y-ay)}` }
    : { heldBy: o.holder, qual: o.quality, frame: o.frame });
  return { avatar: [ax, ay], obj: __N__, count: r.length, instances: inst };
})()
```
**Caveat:** `findByObj` scans only the **loaded region(s)** (objects stream per-area). If an
object is in a distant town, `/teleport_to` there first, then `/locate obj <N>`.

## Mode C — `/locate near <x> <y>` (NPC roster around a tile)
Lists named NPCs whose live position is within a box of `(x,y)` (default radius 25), with
direction. Useful on arrival at a new town/area. Substitute `__X__`, `__Y__`, and optionally `__R__`:

```js
(async () => {
  const u = window.__U6, sp = u.spatial, st = u.stores;
  const { U6DB } = await import('/u6db.js');
  const { ConversationScripts } = await import('/assets/converse.js');
  const s = new ConversationScripts({ a: await U6DB.get('converse.a'), b: await U6DB.get('converse.b') });
  const OP_DESC = 0xf1, OP_ID = 0xff;
  const nameOf = (id) => { let d; try { d = s.get(id); } catch (e) { return null; } if (!d || d.length < 3) return null;
    let pc = 0; if (d[pc] === OP_ID) pc++; pc++; let n = ''; while (pc < d.length && d[pc] !== OP_DESC) n += String.fromCharCode(d[pc++]); return n; };
  const pos = st.pos, CX = __X__, CY = __Y__, R = (typeof __R__ === 'number' ? __R__ : 25);
  const dir = (dx, dy) => (`${dy<0?'N':dy>0?'S':''}${dx<0?'W':dx>0?'E':''}`) || 'here';
  const rows = [];
  for (let slot = 0; slot < u.objlist.actors.length; slot++) {
    const h = u.actorIndex.get(slot); if (h === undefined) continue;
    const id = u.world.resolve(h); if (id < 0) continue;
    const x = pos.x[id], y = pos.y[id], z = pos.z[id];
    if (z !== 0 || Math.max(Math.abs(x-CX), Math.abs(y-CY)) > R) continue;
    rows.push({ id: slot, name: nameOf(slot), x, y, dir: dir(x-CX, y-CY) });
  }
  rows.sort((a, b) => (Math.abs(a.x-CX)+Math.abs(a.y-CY)) - (Math.abs(b.x-CX)+Math.abs(b.y-CY)));
  return { center: [CX, CY], count: rows.length, npcs: rows };
})()
```

## Report
Tell Zane the tile(s) + direction; if a clear single hit, offer the `/teleport_to <x> <y>` to go
there (and `/decode_npc` if it's an NPC). Coordinates from live data are fine in the quest_log
(its preamble already allows live-objlist-scan coords) — but don't add engine/clone framing.

## Notes
- npcId == objlist slot for these NPCs; names come from `converse.a/.b` (the same resolver as
  `/decode_npc`).
- Mode A's **home** tile is global (schedule data) so it answers "where do I go" even for unloaded
  NPCs; **live** is only set when the NPC's region is currently loaded.
- Mode C lists only z=0 surface NPCs whose region is loaded; teleport near first for a full roster.
