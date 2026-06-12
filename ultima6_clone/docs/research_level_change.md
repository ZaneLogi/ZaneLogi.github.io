# research — level change (USE ladder → multi-z dungeons)

The research grounding for **I-19**: activate the clone's already-decoded dungeon
levels and port U6's `USE ladder` level-change. Three references are cross-checked
throughout (per `feedback_consult_legacy_ultima6_port`): **u6-decompiled** (the
mechanic spec), the **legacy `../ultima6/` port** (a working JS blueprint), and the
**clone's current state**.

**Headline:** this is *activation*, not a from-scratch dungeon engine. The terrain
for all 6 levels is already decoded at load, `MapLevel` already knows how to read a
dungeon tile, and `Position` already carries `z`. The work is the active-level
plumbing + the ladder handler.

---

## 1. Source mechanism (u6-decompiled)

### 1.1 Object types (vertical movement)

`obj.h`: Ladder `OBJ_131` (0x131, #305), Hole `OBJ_134` (0x134, #308), Steps
`OBJ_110`/`OBJ_114` (#272/#276), Trellis `OBJ_132`, Volcano `OBJ_133`. I-19's
headline verb is **the ladder** (`OBJ_131`) — it handles both directions via its
frame/quality. Hole/Steps are demand-driven adds (a location that needs them).

### 1.2 USE dispatch → the level-change routine

`seg_27a1.c:3097-3102` (the object-action USE switch):
```c
case OBJ_131:
    if(D_2CC3 == -1)              // whole party (not in solo mode)
        C_101C_089E(Selection.obj);
    else
        CON_printf("\nNot in solo mode.\n");
break;
```
The clone has **no solo/party-split mode**, so the `D_2CC3 == -1` gate is trivially
satisfied — we always allow (a kept simplification, not a port of the gate).

### 1.3 The level-change routine — `seg_101C.c:325-366` `C_101C_089E`

Verified verbatim. Sequence:
1. **Pick direction** (`z_incr`): `if(MapZ && (MapZ==5 || frame==OBJ_131 up-variant)) z_incr=-1; else z_incr=1;` — i.e. **down by default**; **up** only if already in a dungeon AND (at the deepest level 5, or the ladder's frame is the "up" variant).
2. **Land on the ladder's own cell:** `MapX=GetX(obj); MapY=GetY(obj);`
3. **Change level:** `MapZ += z_incr;`
4. **Rescale x/y across the level-size change** (see §5).
5. **Reload + recompose:** `C_101C_054C()` (LoadNewRegions + map-cache load + object refresh) then `C_1100_0306()` (composite re-render). `C_101C_054C` → `C_101C_0306` repositions all party + on-level objects to the new `MapZ` (`seg_101C.c:140-210`).

### 1.4 Map structure across levels

`seg_101C.c:56-77` comment + decode: **z range 0..5.** Level 0 = surface
(1024×1024 tiles, a wrapping torus). Levels 1–5 = dungeons, **256×256 each** (the
abyss is z=5). Dungeon map bytes load from the `map` file at offset
`((z+z+z)<<9) + 0x5a00` (`seg_101C.c:97-104`). The clone doesn't reproduce this
disk-paging — it decodes all levels up-front (§3).

---

## 2. Legacy `../ultima6/` port — the JS blueprint

The legacy port already renders dungeons, so it is the proven JS translation
(agent-surveyed; spot-verify at impl time):

- **Decode** (`../ultima6/u6map.js`): surface → `superChunks[128][128]`, dungeons →
  `dungeonChunks[5][32][32]`. **The clone copied this verbatim** (see §3).
- **Tile lookup** (`../ultima6/map_viewer.js:129-148`): `worldTileIndex` (% 1024) vs
  `dungeonTileIndex` (% 256, `level-1` into `dungeonChunks`); a module-level
  `mapZ` + `getTileIndex = mapZ===0 ? worldTileIndex : dungeonTileIndex`.
- **Level switch** (`../ultima6/map_viewer.js:857-909`): right-click ladder(305)/cave
  → the same `z_incr` logic + coordinate scaling as source (`(obj.x & 0x07) |
  ((obj.x >> 2) & 0xF8)` ≡ source's `((MapX>>2)&0xf8)+(MapX&7)`), `mapZ` mutation,
  re-render. **This is the line-for-line model for I-19's handler.**
- **Objects** (`../ultima6/obj_manager.js`): `surfaceObjs[8][8]` (OBJBLKAA..HH) +
  `dungeonObjs[5]` (OBJBLKAI..EI, one file per level); `collectObjectsInDungeon`
  reads `dungeonObjs[level-1]`.

The transform matching between legacy port and source is itself a verification that
the clone's port target (the source math) is right.

---

## 3. Clone current state — what's there, what's missing

**Already present (the de-risk):**
- `assets/map.js:34-67` — `U6Map.init()` decodes **all 6 levels**: 8×8 surface
  superchunk blocks **and** a 5-iteration `_readDungeon` loop into
  `dungeonChunks[5][32][32]`. The dungeon terrain bytes are in memory, unused.
- `resources/map_level.js:6-32` — `MapLevel.tileAt` already **dispatches** to
  `dungeonTileIndex(x,y,level)` when `this.level !== 0`. It's only ever built with
  `level=0`.
- `components/components.js` — `Position` already has a `z` field (Uint8Array),
  written from OBJBLK at load and preserved on move; `world_loader.js` already
  z-filters quality-linked controls (lever/switch only affect same-z objects).

**Missing (the work):**
1. **Active level is pinned.** `main.js` builds `new MapLevel(u6map, 0)` once; render
   reads that single level; the camera clamps to `1024*16` with no z concept.
2. **No z-aware entity visibility.** `SpatialIndex.key(x,y) = y*width+x` (no z);
   render / passability / cell-pick query `spatial.at(x,y)` with no z filter — so a
   dungeon would show surface objects.
3. **Dungeon objects aren't loaded.** Surface `OBJBLK[AA..HH]` load; the 5 dungeon
   files (`objblk[a-e]i`) don't. `world_loader.js` `regionId(col,row)` is an 8×8
   overworld grid with no z dimension.
4. **No ladder handler.** `systems/use_handlers.js` lists `ladder` as a deferred
   one-liner; no `OBJ_131` registration, no `changeLevel`.
5. **Camera/bounds are surface-only.** Dungeons are 256-wrap, not 1024-wrap — the
   camera clamp/wrap and the avatar move bounds must switch with the level.

---

## 4. Chosen architecture (decisions locked 2026-06-12)

- **Single `SpatialIndex` + active-z filter** (NOT a per-level index). Entities of all
  levels share the one index; queries filter results by the avatar's active `z`. The
  key `y*1024+x` holds surface(10,10) and dungeon(10,10) as distinct entities on the
  same key — the z-filter disambiguates. Chosen as the lean option; the failure mode
  (a forgotten filter → a surface object visible in a cave) is **obvious on the first
  descent**, not silent. **Named upgrade:** promote to a per-level `SpatialIndex`
  (build-once, swap-on-entry) if z-checks start sprawling across many sites. (Same
  lean-now/named-upgrade-later pattern as Fixed-Shell→Dynamic-Dock.)
- **Dungeon NPCs go live.** The schedule/AI systems already tick every loaded actor,
  so a level's NPCs animate **for free** once their entities load + z-visibility works
  — "static render only" would mean *adding* a suppression gate. Caveat: combat-type
  dwellers (gargoyles/fighters) just wander/idle since **combat stays deferred** — the
  dungeons are *inhabited, not dangerous*, consistent with the talk-focused clone.
- **Dungeon objects load-once and stay resident** (consistent with the no-region-unload
  rule, `project_ultima6_no_region_unload`). A level's `objblk[level]i` loads on first
  entry; the surface stays loaded underneath, just filtered out by z.
- **Camera/bounds switch per level.** Surface = 1024-wrap; dungeon = 256-wrap. The
  active level drives the camera clamp/wrap and the avatar's move bounds.

---

## 5. The coordinate transform (the exact math)

From `C_101C_089E` (`seg_101C.c:339-353`), applied to the avatar after landing on the
ladder's cell:

**Surface → dungeon** (`MapZ==1 && z_incr==1`) — the dungeon is ¼ the surface span:
```
x = ((x >> 2) & 0xf8) + (x & 7)     // keep the low 3 bits, compress the rest /4
y = ((y >> 2) & 0xf8) + (y & 7)
```

**Dungeon → surface** (`MapZ==0 && z_incr==-1`) — expand ×4, then the ladder's
quality bits pick which of the 4 surface sub-cells:
```
x = ((x << 2) & 0x3e0) + (x & 7)
y = ((y << 2) & 0x3e0) + (y & 7)
if(qual & 1) x += 8;   if(qual & 2) x += 0x10;
if(qual & 4) y += 8;   if(qual & 8) y += 0x10;
```

**Dungeon ↔ deeper dungeon** (`z_incr` either way, neither endpoint is z=0): **no
rescale** — both levels are 256-wide, so x/y carry over unchanged (land on the
ladder cell).

---

## 6. Deferred / out of scope for I-19

- **Hole (`OBJ_134`) / Steps (`OBJ_110`/`114`)** — add as one-line registrations when a
  target location needs them; ladder (`OBJ_131`) is the headline.
- **Moongate / gate travel** (`PartyTeleport`, `seg_101C.c:368-376` `GateTravel`) —
  absolute-coordinate teleport (no scaling), its own later step.
- **Combat / dangerous dungeons** — deferred by design across the clone.
- **Solo/party-split mode** — the `D_2CC3` gate is skipped (clone has no solo mode).
- **Level-transition animation** (`PartyEnter(2)` / `PartyExit(…,2)`, `C_101C_089E:337/364`) —
  **HARD CUT, no choreography** (matches the legacy `../ultima6/` port + the modern-UX-anchor rule:
  the gather/vanish/spread is 1990 feel, not mechanic). The *result* still happens — the party is gone
  from the old level (free via the active-z filter) and re-gathers on the new level (via `MoveFollowers`);
  only the *animation* is dropped. Add the faithful `PartyEnter`/`PartyExit` later only if the cut feels
  too abrupt in play.
