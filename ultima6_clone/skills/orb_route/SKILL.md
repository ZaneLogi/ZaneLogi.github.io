---
name: orb_route
description: >-
  Find the closest Orb-of-the-Moons landing to a destination tile. Invoke as
  `/orb_route <x> <y> [z]`. The Orb's red-gate destination depends ONLY on the cast
  direction (a fixed ROM table), so this ranks every landing by distance to the target
  and reports the cast to use + how far the landing is from the goal. Pairs with
  `/locate` (find the goal) and a ship for island hops.
scope: ultima6_clone — pure computation (the Orb table is fixed ROM); no preview/game state needed
---

# /orb_route — closest Orb landing to a destination

A committed project dev-skill (see `ultima6_clone/CLAUDE.md` §"Project dev-skills"). On
`/orb_route <x> <y> [z]`, read and follow this file.

**Why a skill:** `USE Orb of the Moons` (`C_27A1_5789`) prompts "Where:" and you pick a cell in
the 5×5 box around the avatar; a red gate spawns whose destination depends **only on the cast
direction**, never on where you stand (a fixed ROM table — `research_moongate.md §2.3`, verified
byte-identical to source `D_171C/174E/1780`). So "closest Orb spot to X" is a pure table lookup —
no need to re-derive it each session.

## Run it
Substitute `__X__`, `__Y__`, and optionally `__Z__` (default 0). Ranks the landings on the target's
z by Chebyshev (8-dir walking) distance and returns the nearest 4:

```js
(() => {
  // Orb destinations (research_moongate.md §2.3). cast = the (dx,dy) cell in the 5×5 "Where:" box
  // relative to the avatar; blue = same tile as default blue-gate endpoint slot N.
  const DEST = [
    {q:1,  cast:[-2,-2], x:899,y:499,z:0}, {q:2,  cast:[-1,-2], x:935,y:262,z:0, blue:0},
    {q:3,  cast:[ 0,-2], x:435,y:395,z:0}, {q:4,  cast:[ 1,-2], x:503,y:358,z:0, blue:1},
    {q:5,  cast:[ 2,-2], x:147,y:883,z:0}, {q:6,  cast:[-2,-1], x:919,y:934,z:0, blue:7},
    {q:7,  cast:[-1,-1], x:68, y:45, z:5}, {q:8,  cast:[ 0,-1], x:307,y:352,z:0},
    {q:9,  cast:[ 1,-1], x:188,y:45, z:5}, {q:10, cast:[ 2,-1], x:159,y:942,z:0, blue:2},
    {q:11, cast:[-2, 0], x:739,y:699,z:0}, {q:15, cast:[ 2, 0], x:227,y:131,z:0},
    {q:16, cast:[-2, 1], x:23, y:22, z:1, blue:6}, {q:17, cast:[-1, 1], x:128,y:86, z:5},
    {q:18, cast:[ 0, 1], x:108,y:221,z:5}, {q:19, cast:[ 1, 1], x:923,y:876,z:0},
    {q:20, cast:[ 2, 1], x:295,y:38, z:0, blue:3}, {q:21, cast:[-2, 2], x:75, y:507,z:0},
    {q:22, cast:[-1, 2], x:327,y:822,z:0, blue:5}, {q:23, cast:[ 0, 2], x:387,y:787,z:0},
    {q:24, cast:[ 1, 2], x:831,y:166,z:0, blue:4}, {q:25, cast:[ 2, 2], x:667,y:67, z:0},
  ];
  const TX = __X__, TY = __Y__, TZ = (typeof __Z__ === 'number' ? __Z__ : 0);
  const dir = (dx,dy) => (`${dy<0?'N':dy>0?'S':''}${dx<0?'W':dx>0?'E':''}`) || 'here';
  const castWords = (dx,dy) => [dx ? `${Math.abs(dx)} ${dx<0?'W':'E'}` : null, dy ? `${Math.abs(dy)} ${dy<0?'N':'S'}` : null].filter(Boolean).join(' + ') || 'center';
  const ranked = DEST.filter(d => d.z === TZ).map(d => {
    const dx = TX - d.x, dy = TY - d.y;
    return { qual:d.q, cast:`(${d.cast[0]},${d.cast[1]})`, castWords:castWords(d.cast[0],d.cast[1]),
      lands:`${d.x},${d.y}${d.z?(',z'+d.z):''}`, cheb:Math.max(Math.abs(dx),Math.abs(dy)),
      euclid:Math.round(Math.hypot(dx,dy)), thenWalk:`${Math.max(Math.abs(dx),Math.abs(dy))} ${dir(dx,dy)}`,
      blueSlot: d.blue }; }).sort((a,b) => a.cheb - b.cheb);
  return { target:[TX,TY,TZ], nearest: ranked.slice(0,4) };
})()
```
(It's pure JS — run via `preview_eval` or just compute it; no game state needed.)

## Report
Lead with the best: "**cast `<castWords>` (Qual N) → lands (x,y), then ~`cheb` tiles `DIR` to the goal**."
Give the runner-up too. Then:
- **Position-independence:** the cast cell is relative to the avatar, so it works from anywhere once
  the Orb is enabled (`TalkFlags[5]` bit 5, taught by Lord British).
- **Water caveat:** the landing may be across sea from an island target → the final hop needs a
  **ship/skiff** (Trebor/Minoc or Fentrissa/Buccaneer's Den). Confirm terrain if it matters (a
  `reg.isTerrainWet(ml.tileAt(x,y))` corridor check, or pair with `/locate`).
- **`blueSlot`:** if set, a **blue** moongate at the matching lunar phase also reaches that tile.

## Notes
- Only z-matching landings are ranked (default surface z=0). The **z5 gargoyle realm** (Qual
  7/9/17/18) and the **z1 dungeon** (Qual 16) casts are in the table for those targets — pass the
  target's real z.
- Casts to the 3 center cells are dead ("stay put", Qual 0) and omitted.
- Table source: `docs/research_moongate.md §2.3`. To re-verify against the live ROM:
  `__U6.moonGates` / the `castRedGate` path (`systems/moongate_runtime.js`).
