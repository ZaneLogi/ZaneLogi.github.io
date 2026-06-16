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

`obj.h`: Ladder `OBJ_131` (0x131, #305); the dungeon/cave **entrance holes**
`OBJ_146` (0x146, #326 — most dungeons + the named caves) and `OBJ_134` (0x134,
#308 — the Ant Mound mouth); Steps `OBJ_110`/`OBJ_114` (#272/#276), Trellis
`OBJ_132`, Volcano `OBJ_133`. I-19's headline verb is **the ladder** (`OBJ_131`) —
it handles both directions via its frame/quality. The entrance holes are
**walk-onto** triggers (no verb), added in **I-19g** (§7); Steps are demand-driven adds.

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

- **Steps (`OBJ_110`/`114`)** — add as one-line registrations when a target location
  needs them. *(The dungeon/cave entrance holes `OBJ_146`/`OBJ_134` are no longer
  deferred — done in **I-19g**, §7.)*
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

---

## 7. Dungeon/cave entry by walking onto a hole (I-19g)

I-19 shipped the level-change **engine** (`C_101C_089E`) + the **ladder USE** trigger,
but deferred the dungeon/cave **entrances** (§6). I-19g adds the faithful trigger:
**walking onto an entrance hole descends** — the way U6 actually enters a dungeon (a
ladder is `USE`d; a hole is not).

### 7.1 Source — the post-move tile check `C_1E0F_184D`

After the avatar's step, the advance routine `C_1E0F_1B0E` (`seg_1E0F.c:811`) calls
`C_1E0F_184D()` (`seg_1E0F.c:934`). That handler (`seg_1E0F.c:712`) scans the objects on
the party's **new** cell and dispatches on the **first** special object, then breaks:
- `OBJ_055` blue moongate / `OBJ_054` red moongate → gate travel (ported in I-moongate
  as `checkGateEntry`).
- **`OBJ_146 || OBJ_134` → `C_101C_089E(objNum)`** (`seg_1E0F.c:769-785`) — the **same
  level-change routine the ladder USE calls**. No verb, no prompt.

The specific dungeon is the entrance object's **quality**: `D_17E2[quality-1]`
(`seg_1E0F.c:686`) names it (Deceit=1, Despise=2, Destard=3, … Hythloth=7, the gargoyle
shrines 9-11, the caves 13-20). The quality only drives Shamino's "you see the dungeon X"
line (`SHAMINO_COMMENT`-gated); the entry itself ignores it (the engine reads only the
entrance's position/frame, plus — on the way *up* — the quality sub-cell bits, §5).

**USE on a hole is a no-op in source** — its USE switch (`seg_27a1.c:3085-3108`) has a
`case OBJ_131` (ladder) but **no `OBJ_146`/`OBJ_134` case**. So the clone deliberately
does **not** register a USE handler for holes; they are walk-onto only.

### 7.2 Legacy `../ultima6/` port

The legacy viewer does implement hole/ladder traversal (`map_viewer.js:852-909`,
right-click a `LADDER`/`CAVE` object → the same `z_incr` + coordinate scaling), but as a
**view-navigation** affordance (it moves the view origin; there is no party, and the
trigger is a right-click, not a walk-onto). It corroborates the coordinate math, not the
trigger.

### 7.3 Clone implementation

Both halves already existed — I-19's engine and I-moongate's post-move hook — so I-19g is
small:
- **`enterLevelChange(world, entity, ctx)`** (`systems/use_ladder.js`) — the shared
  `C_101C_089E` core, **extracted** out of `useLadder` (which now wraps it). Generic over
  the entrance object: direction (`z_incr`) + the 1024↔256 rescale (§5) + `teleportParty`.
  The up-direction test is gated to `OBJ_131` frame 1 (matching source's
  `ObjShapeType == TypeFrame(OBJ_131,1)`), so a frame-1 *hole* is never mistaken for an
  up-ladder (moot at the surface anyway, where `MapZ==0` short-circuits the test to "down").
- **`checkDungeonEntry(world, ctx)`** (`systems/use_ladder.js`) — the `C_1E0F_184D`
  dungeon/cave branch: scan the avatar's cell for an `OBJ_146`/`OBJ_134`, descend via
  `enterLevelChange`. Returns whether it entered.
- **Wiring** (`main.js` `onMove`): `checkGateEntry(...) || checkDungeonEntry(...)`.
  `checkGateEntry` now **returns `true` when it travels**, so the `||` reproduces source's
  single-dispatch-and-break (a tile is a moongate **or** a hole, never both → the hole
  check is skipped when a gate already fired).

No new components, no snapshot change. Tests: `tests/test_dungeon_entry.{html,js}`
(walk onto `OBJ_146`/`OBJ_134` → descend with the /4 compression; the up `*4` expand +
quality sub-cell; dungeon↔dungeon no-rescale) + one assertion in `test_moongate.js`
locking `checkGateEntry`'s new return contract.

### 7.4 The entrance catalog — `D_17E2` names + the surface mouths

Each entrance object carries its dungeon **index** in `quality`; `D_17E2[quality-1]`
(`seg_1E0F.c:686`) maps it to a name. `C_1E0F_184D`'s Shamino-gated "you see…" line
prefixes the name by range: quality **< 8** → "dungeon ", quality **9–11** → "shrine of "
(the gargoyle-realm shrines), else bare. A global scan of the 64 surface OBJBLK
superchunks for `OBJ_146`/`OBJ_134` at `LOCXYZ` finds every surface mouth — **15 objects /
14 named locations** (the Ant Mound has two); 6 quality values have **no** surface mouth
(reached from *within* another level, not a walkable hole).

| Qual | `D_17E2` name | Entrance obj | Surface mouth (this data) |
|---|---|---|---|
| 1 | Deceit | `OBJ_146` | (964, 306) |
| 2 | Despise | `OBJ_146` | (365, 265) |
| 3 | **Destard** | `OBJ_146` | (284, 657) |
| 4 | Wrong | `OBJ_146` | (500, 81) |
| 5 | Covetous | `OBJ_146` | (627, 113) |
| 6 | Shame | `OBJ_146` | (234, 409) |
| 7 | Hythloth | `OBJ_146` | (948, 930) |
| 8 | GSA | — | *(no surface mouth)* |
| 9 | Control *(shrine)* | — | *(gargoyle realm)* |
| 10 | Passion *(shrine)* | — | *(gargoyle realm)* |
| 11 | Diligence *(shrine)* | — | *(gargoyle realm)* |
| 12 | Tomb of Kings | — | *(no surface mouth)* |
| 13 | Ant Mound | `OBJ_134` | (867, 187) **and** (835, 195) |
| 14 | Swamp Cave | `OBJ_146` | (611, 363) |
| 15 | Spider Cave | `OBJ_146` | (92, 250) |
| 16 | Cyclops Cave | `OBJ_146` | (185, 436) |
| 17 | Heftimus Cave | `OBJ_146` | (132, 857) |
| 18 | Heroes' Hole | `OBJ_146` | (348, 809) |
| 19 | Pirate Cave | — | *(no surface mouth)* |
| 20 | Buccaneer's Cave | `OBJ_146` | (564, 594) |

So `OBJ_146` is the generic dungeon/cave mouth (19 of the 20 entrances); `OBJ_134` is the
Ant Mound's distinct sprite. Coordinates are from a scan of the dropped game data (same
provenance the quest log records — no game data is committed); the player-facing version
lives in `quest_log.md §"Dungeon & cave entrances"`. The down-transform on each takes the
surface mouth to its dungeon-level-1 cell via §5 (e.g. Destard (284,657)→(68,161,z1)).
