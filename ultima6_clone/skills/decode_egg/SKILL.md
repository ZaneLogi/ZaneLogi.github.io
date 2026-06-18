---
name: decode_egg
description: >-
  Decode + diagnose an ultima6_clone EGG (OBJ_14F) in the running browser — why a
  given egg does or doesn't spawn its creature. Invoke as `/decode_egg <x> <y> [z]`.
  Reads the live egg via preview-eval (the engine's own `readEgg`, so it can't
  desync), reports its spawn template (time gate / alignment / hatch-% / embryos)
  and runs the hatch-gate checklist; optionally force-hatches to prove it. Use when
  Zane asks to "check" / "investigate" an egg spawn.
scope: ultima6_clone — needs the running preview with the user's U6 data dropped. ENGINE-DEBUG (touches systems/egg.js + seg_2E2D.c), not a quest-content tool — produces a diagnosis to Zane, never a quest_log / research_npc_scripts / Journal entry.
---

# /decode_egg — decode + diagnose an egg's spawn

A committed project dev-skill (see `ultima6_clone/CLAUDE.md` §"Project dev-skills").
When Zane types `/decode_egg <x> <y> [z]`, **read and follow this file**, substituting
the args (`z` defaults to 0). This is the egg analog of `/decode_npc`: a desync-proof
decode core + a diagnosis, instead of a catalog write.

**Binding conventions:**
- **ENGINE-DEBUG, not quest content.** The output is a diagnosis report to Zane. Do NOT
  write to `quest_log.md` / `research_npc_scripts.md` / `Journal.md` (the quest-trace
  storyline rule — `feedback_quest_docs_no_engine`).
- The decode is **read-only**; the force-hatch in §5 **mutates the live sim** (a dev
  action, nothing committed) — only run it when diagnosing or when Zane wants the spawn.

## 0. Prereqs

- The `u6` preview must be running with the user's U6 data dropped. `preview_list` → grab the
  `u6` serverId; if none, `preview_start("u6")`. Every eval below runs via `preview_eval`.
- Dungeon eggs live on z≠0; their level loads async on descent — make sure the party is on
  the egg's level (z) first (`/teleport_to <x> <y> <z>` if needed), else the egg isn't loaded.

## 1. Resolve + decode the egg (the core)

Find the egg at `(x,y,z)` and decode it with the engine's own `readEgg` (so the qual/quan/status
+ embryo decode always matches `systems/egg.js`, never a re-derived copy). Substitute `__X__`,
`__Y__`, `__Z__`:

```js
(async () => {
  const u = window.__U6;
  const { readEgg, OBJ_EGG } = await import('/systems/egg.js');
  const { Position, ObjType } = await import('/components/components.js');
  const { Viewport } = await import('/resources/viewport.js');
  const w = u.world, pos = w.store(Position), obj = w.store(ObjType);
  const X = __X__, Y = __Y__, Z = (typeof __Z__ === 'number' ? __Z__ : 0);
  let eh = null;
  for (const id of w.query(ObjType, Position)) {
    if (obj.objNumber[id] === OBJ_EGG && pos.x[id] === X && pos.y[id] === Y && pos.z[id] === Z) { eh = w.handleOf(id); break; }
  }
  if (!eh) return { error: `no egg (OBJ_14F) at ${X},${Y},${Z} — is the level loaded? is z right?` };
  const egg = readEgg(w, eh);                       // { qual, quan, timeGate, alignmentOverride, hatchChance, exactCounts, status, local, hatched, invisible, embryos:[...] }
  const ai = w.resolve(u.avatarRef.handle);
  const dist = Math.max(Math.abs(pos.x[ai] - X), Math.abs(pos.y[ai] - Y));
  const vp = w.getResource(Viewport);
  const clock = w.getResource((await import('/resources/world_clock.js')).WorldClock);
  return {
    at: [X, Y, Z],
    egg: { ...egg, statusHex: '0x' + egg.status.toString(16) },
    avatar: { x: pos.x[ai], y: pos.y[ai], z: pos.z[ai], sameLevel: pos.z[ai] === Z, distToEgg: dist },
    nearRadius: vp ? vp.nearRadius : null,            // off-screen gate threshold
    scanRadius: vp ? vp.nearRadius + 12 : null,       // area scanned by hatchAroundAvatar
    hourNow: clock ? clock.Time_H : null,
  };
})()
```

## 2. Read the decode (what the fields mean)

From `seg_2E2D.c:216-245` (`EGG_hatches`), surfaced verbatim by `readEgg`/`decodeEgg`:

- **`timeGate`** = `qual / 10`: **0** any time · **1** DAY (06:00-18:00) · **2** NIGHT (19:00-05:00).
  Out of its window the egg neither hatches NOR latches — it stays armed for later.
- **`alignmentOverride`** = `qual % 10` (call it `d`): `d=0` → no override (use the creature's
  class default); else `(d-1)<<5` → **1 NEUTRAL (0x00) · 2 EVIL (0x20) · 3 GOOD (0x40) · 4 CHAOTIC
  (0x60)**. An EVIL/CHAOTIC non-LOCAL spawn arms Shamino's approach warning.
- **`hatchChance` (`quan`)** = **% chance to hatch** (`OSI_rand(1,100) <= quan`). `quan == 100` →
  spawn the embryo counts exactly; `< 100` → each embryo count is reduced to `rand(1,count)`.
- **`status`** bits: **LOCAL `0x20`** (on-top ambush — hatches on-screen) · **HATCHED `0x40`**
  (already fired this arming) · **INVISIBLE `0x02`** (eggs are render-skipped anyway). A spent
  non-LOCAL egg reads **`0x42`** (HATCHED|INVISIBLE); a spent LOCAL one **`0x62`**; a fresh,
  never-triggered egg reads **`0x00`** (or `0x20` LOCAL).
- **`embryos[]`** — each `{ objNumber, count, aiMode, mutant }`: the creature `OBJ_xxx` to spawn,
  how many, the stamped AI/combat mode (`Qual`), and the two-headed-variant bit (status `0x40`).

## 3. The hatch-gate cheat-sheet (why it does / doesn't fire)

`hatchAroundAvatar` (`EGG_hatchArea`, `seg_2E2D.c:367-385`) scans eggs on the avatar's level and
hatches each that passes (`:381`):

```
within scanRadius (nearRadius+12) of the avatar  AND
( forceHatch  ||  dist > nearRadius  ||  LOCAL )
```

- **Non-LOCAL egg** → hatches **only when the avatar is FARTHER than `nearRadius`** (off-screen):
  the monster appears at the edge and walks in. **Standing on / next to it is suppressed by
  design** — it will NOT pop into view.
- **LOCAL egg** → hatches on-screen right away (the ambush).
- **`forceHatch`** (a teleport / ladder / moongate arrival — `teleportParty`) bypasses the
  near-gate, so arriving force-hatches the whole destination area (within `scanRadius`).
- Trigger points: boot, every avatar step (`main.js`), and arrival (`teleportParty`). **Camera pan
  never hatches.**
- On a **fresh dungeon descent** the level's objects load async; the arrival force-hatch is
  deferred onto that load so eggs populate once it lands (the 2026-06-17 fix, `level_change.js`).
- `cullAroundAvatar` re-arms a non-LOCAL egg (`ClrHatched`) once the avatar leaves `cullRadius`
  (= U6 wilderness respawn) and deletes a LOCAL one (one-shot).

## 4. Diagnose "it doesn't spawn" — the checklist

Walk these against §1's output:

1. **Found at all?** No egg at `(x,y,z)` → wrong coords, or the level isn't loaded (dungeon z
   loads async on descent — be on the level).
2. **`avatar.sameLevel` false?** An egg on another z never ticks for you — teleport to its z.
3. **`hatched` / status `0x40` set?** It already fired this arming. A non-LOCAL egg re-arms after
   you leave + return (cull ring); a LOCAL one is gone (deleted).
4. **Non-LOCAL + `distToEgg <= nearRadius`?** → **suppressed on purpose** (you're too close /
   on-screen). It only fires when you're past `nearRadius`. This is the usual "I stood on it and
   nothing happened" answer — not a bug.
5. **`timeGate` 1/2 vs `hourNow`?** Day/night-gated and out of window → waits (no latch).
6. **`hatchChance` < 100?** Even when triggered it spawns only that %% of the time — it's a roll,
   not a guarantee (answers "is it random?": yes).
7. **Fresh descent and status still `0x00` after exploring?** That's the descent-force-hatch path;
   if it's broken again, suspect the async-load ordering (see the 2026-06-17 Journal fix).

## 5. (Optional) Force-hatch to prove it

Deterministically hatch JUST this egg (bypasses the area gate + the `quan` roll) — proves the egg
is valid + loaded, and gives the spawn. **Mutates the sim.** Substitute `__X__`,`__Y__`,`__Z__`:

```js
(async () => {
  const u = window.__U6;
  const { hatchEgg, OBJ_EGG } = await import('/systems/egg.js');
  const { Position, ObjType, Status, Spawned } = await import('/components/components.js');
  const w = u.world, pos = w.store(Position), obj = w.store(ObjType), st = w.store(Status);
  const X = __X__, Y = __Y__, Z = (typeof __Z__ === 'number' ? __Z__ : 0);
  let eh = null, ei = -1;
  for (const id of w.query(ObjType, Position)) {
    if (obj.objNumber[id] === OBJ_EGG && pos.x[id] === X && pos.y[id] === Y && pos.z[id] === Z) { eh = w.handleOf(id); ei = id; break; }
  }
  if (!eh) return { error: `no egg at ${X},${Y},${Z}` };
  const before = '0x' + st.bits[ei].toString(16);
  const r = hatchEgg(w, eh, { rand: (a, b) => a, forceHatch: true });   // rand low → roll(1,100)=1 (<=quan, hatches); count(1,n)=1
  const after = '0x' + st.bits[ei].toString(16);
  const spawns = r.spawns.map(h => { const i = w.resolve(h); return i === -1 ? null : { objHex: '0x' + obj.objNumber[i].toString(16), x: pos.x[i], y: pos.y[i] }; }).filter(Boolean);
  return { statusBefore: before, statusAfter: after, rolled: r.rolled, spawns };
})()
```

A successful run flips the status to `0x42`/`0x62` and lists the spawned creature(s). Take a
`preview_screenshot` if Zane wants to see them. (Spawns are combat-free idle placeholders — I-egg
d-stats deferred.)

## Notes / gotchas

- Eggs are **OBJ_14F (335)**, render-skipped but LOOK-able. The decode is the source of truth;
  for tangled cases read `systems/egg.js` (`readEgg`/`hatchEgg`/`hatchAroundAvatar`) +
  `seg_2E2D.c` (`EGG_hatches` `C_2E2D_0760`, `EGG_hatchArea` `C_2E2D_0DFE`).
- A `Qual%10 == 0` egg has no alignment override → the clone's placeholder spawn falls back to
  NEUTRAL (d-stats deferred), so a few hostile-spawn Shamino warnings under-fire.
- This reads the user's own data via preview-eval; the optional §5 mutates the running sim only —
  no game data and no engine change is committed.
