---
name: teleport_to
description: >-
  Teleport the ultima6_clone party (avatar + companions) to a map tile (x, y, z)
  in the running browser preview, for dev world-exploration. Invoke as
  `/teleport_to <x> <y> [z]` (z defaults to 0). Moves the WHOLE party via the
  real `teleportParty` core — the same one the Orb of the Moons / moongates call —
  so followers come along, the conga re-forms, and the camera recenters. Use when
  asked to teleport / jump / move the party to a coordinate or to "look at" a place
  whose tile is known.
scope: ultima6_clone branch only (depends on the clone's `window.__U6` dev surface)
---

# /teleport_to — move the party to a map tile (dev world-exploration)

A committed project skill (not a harness-registered slash command — `.claude/` is
git-ignored here, see `ultima6_clone/CLAUDE.md`). When Zane types
`/teleport_to <x> <y> [z]`, **read and follow this file**, substituting the args.

This exists because `__U6.setLevel(z,x,y)` is a *camera/avatar-only* dev hook — it
strands the followers. The party-aware relocate is `teleportParty`
(`systems/level_change.js`), which `partyTeleport` / `gateTravel` (the Orb + both
moongate networks) all wrap. This skill drives that core directly.

## Args

- `x`, `y` — destination tile (required). Surface is 1024-wide; dungeon levels 256-wide.
- `z` — level (optional, default `0`). 0 = surface, 1..5 = dungeons.

To teleport to an NPC instead of raw coords, first resolve the NPC's tile from the
objlist (`actors[slot].x/y/z`) — see the `feedback_npc_script_check_decodes` flow for
resolving a name → slot — then teleport there.

## Procedure

### 1. Ensure the preview is up and the game is booted

- `preview_list` → if there's no `u6` server, `preview_start("u6")`. Grab the `serverId`.
- Check boot state with `preview_eval`:
  ```js
  (() => ({ booted: !!window.__U6, hasWorld: !!(window.__U6 && window.__U6.world) }))()
  ```
- If `booted` is false, the page is at the dropzone. The game needs the user's U6 data in
  IndexedDB (`u6clone`/`files`). If the data is already there (a prior session),
  `window.location.reload()` then re-check. If `files` is empty, ask Zane to drag his U6
  files onto the dropzone first (BYO-data; never commit game data — `CLAUDE.md`).

### 2. Teleport the whole party

Run this with `preview_eval` (substitute `__X__`, `__Y__`, `__Z__`; `__Z__` defaults to `0`):

```js
(async () => {
  const u = window.__U6;
  if (!u || !u.world) return { error: 'game not booted — start the u6 preview + load U6 data first' };
  const { teleportParty } = await import('/systems/level_change.js');
  const { installMoveFollowers } = await import('/systems/move_followers.js');   // pure factory, no side effects
  const moveFollowers = installMoveFollowers(u.world);
  const ts = u.renderer.tileSize || 16;
  const cv = document.querySelector('#map-region canvas') || document.querySelector('canvas');
  const recenter = (tx, ty) => {                       // = main.js centerOn()
    u.camera.worldX = tx * ts + ts / 2 - cv.width / 2;
    u.camera.worldY = ty * ts + ts / 2 - cv.height / 2;
  };
  const X = __X__, Y = __Y__, Z = __Z__;
  // teleportParty: moves avatar + every PartyMember, re-forms via MoveFollowers, recenters,
  // and force-hatches the destination area's eggs (research_egg.md §2 — "arrival wakes the area").
  teleportParty(u.world, X, Y, Z, { avatarRef: u.avatarRef, recenter, moveFollowers });
  const pos = u.stores.pos;
  const party = u.objlist.party.map(slot => {
    const h = u.actorIndex.get(slot);
    const id = h !== undefined ? u.world.resolve(h) : -1;
    return id === -1 ? { slot, gone: true } : { slot, name: (u.objlist.actors[slot] || {}).name, x: pos.x[id], y: pos.y[id], z: pos.z[id] };
  });
  return { teleportedTo: [X, Y, Z], party, camera: { x: u.camera.worldX, y: u.camera.worldY } };
})()
```

### 3. Verify + show

- Confirm the returned `party` array shows all four members clustered at the destination
  (the diamond conga: leader + 3 behind). Report it.
- Take a `preview_screenshot` so Zane can see the spot.

## Notes / gotchas

- **`setLevel` ≠ teleport.** `__U6.setLevel(z,x,y)` only moves the avatar + camera; the
  followers stay behind. Always use `teleportParty` for a real party move.
- **Egg side effect (faithful).** `teleportParty` force-hatches the destination area and culls
  the source's spawns (`hatchAroundAvatar`/`cullAroundAvatar`) — a teleport "wakes the area,"
  so creatures may appear near the landing. Expected, not a bug.
- **Module paths** are root-relative because the `u6` server serves the `ultima6_clone` folder
  as web root (`tools/devserver.py … ultima6_clone`): `/systems/level_change.js`,
  `/systems/move_followers.js`.
- **z must match the destination's level.** `teleportParty` calls `setActiveLevel(z)` first, so
  a dungeon tile needs its real z (1..5) or you'll land on the surface coordinate.
- **This mutates the live sim** (read/write via preview-eval). It's a dev/exploration action —
  no source edits, nothing to commit.
