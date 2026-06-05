# Research: U6 player↔object interaction (Look / Get / Drop / Move / Use / Talk)

**Status:** decoded 2026-05-28. The five world-interaction commands
in `seg_27a1.c` (the "game actions / object-type dispatch" module,
3162 lines — the largest segment) read for their interaction model:
`C_27A1_0C67` (look), `C_27A1_18F5` (get), `C_27A1_14DA` (drop),
`C_27A1_1E8B` (move), `C_27A1_6179` (use). The focus is the shared
**target → validate → apply → recompose** pattern and the Use
command's object-type dispatch table, not every per-object special
case (there are ~40 in the Use switch alone).

**Talk added 2026-06-05** (pre-I-11): the TALK verb shares this same
targeting front-end but its handler lives in the conversation module —
`TALK_talkTo` (`seg_16E1.c:60`) → `TalkDriver` (`seg_1703.c:1016`), reached
from the shared targeting block (`seg_0A33.c:1264`). The command-path,
reach, talkable-filter, and can-talk-gate are decoded in §"Talk" below; the
conversation VM it leads into is [`research_conversation_vm.md`](research_conversation_vm.md).

Citations use relative paths within the u6-decompiled clone (e.g.,
`seg_27a1.c:472`). The clone's absolute path is per-PC; see
[`../CLAUDE.md`](../CLAUDE.md) §"Source of truth".

## How a command reaches a handler

From [`research_game_loop.md`](research_game_loop.md) §"Three-phase
command dispatch": a keystroke (`L`/`G`/`D`/`M`/`U`) is translated in
Phase 1 to a `CMD_*` opcode and sets up the **targeting cursor**
(`SelectMode`, `SelectRange`, `AimX/Y`). Phase 3 then dispatches:

| Key | CMD_* | Handler | Range |
|-----|-------|---------|-------|
| `T` talk | CMD_83 | `TALK_talkTo` → `TalkDriver` | 7 |
| `L` look | CMD_84 | `C_27A1_0C67` | 1 (search) / viewport |
| `G` get | CMD_85 | `C_27A1_18F5` | adjacent (1) |
| `D` drop | CMD_86 | `C_27A1_14DA` | thrown arc |
| `M` move | CMD_87 | `C_27A1_1E8B` | adjacent (1) |
| `U` use | CMD_88 | `C_27A1_6179` | adjacent (1) |

Each handler runs **after a second `CON_getch`** has resolved the
target into the global `Selection` struct:

- `Selection.obj` — the targeted object's slot ID, or `-1` if the
  player pointed at an empty tile.
- `Selection.x`, `Selection.y` — the targeted tile coordinates.

`Selection` is populated by the SelectMode cursor logic in the input
layer (`seg_0C9C`, see [`research_game_loop.md`](research_game_loop.md)
§"Input polling"). The handler treats it as its input.

### Mouse and keyboard targeting collapse into the same path

Both input modes converge on `mkMouseSelection` → `C_2337_08F1`. At
`seg_0C9C.c:1206-1217`, the keyboard `RETURN`-while-in-SelectMode
synthesises a "click" at the cursor:

```c
} else if(ch == '\r') {
    if(SelectMode == 1) {
        ch = CMD_8E;                       // = "select made"
        ...
        PointerX = TIL2SCR(AimX);           // turn cursor into a pointer pos
        PointerY = TIL2SCR(AimY);
        mkMouseSelection();                 // <-- SAME function the mouse calls
    }
```

So there isn't a separate keyboard-specific picker. There's exactly
one cell-pick rule, decoded in the next section.

## Cell-pick — `C_2337_08F1` (`seg_2337.c:365`)

The decision "which object at this cell is the target?" Runs from
both `mkMouseSelection` (the map-click) and the keyboard path above,
so it determines `Selection.obj` for every LOOK / GET / DROP / MOVE /
USE / TALK.

The body walks the cell's `Link[]` chain head-first via `FindLoc` +
`NextLoc` (head-first per [`research_world_data.md`](research_world_data.md)
§"Sort order — `C_1184_29C4` comparator"), running two passes:

```c
C_2337_08F1(int objNum_param, int x, int y) {
    int objNum_ret, objNum_2, objNum_3;
    objNum_3 = -1;
    /* first "canSee" object */
    for (objNum_ret = FindLoc(x, y, MapZ); objNum_ret >= 0; objNum_ret = NextLoc()) {
        if (COMBAT_canSee(objNum_param, objNum_ret))
            break;
        if (objNum_3 < 0)
            objNum_3 = objNum_ret;          /* save first non-canSee as fallback */
    }
    /* first "canSee" notDead NPC — overrides any prior pick */
    for (objNum_2 = objNum_ret; objNum_2 >= 0; objNum_2 = NextLoc()) {
        if (COMBAT_canSee(objNum_param, objNum_2)) {
            if (objNum_2 < 0x100 && !IsDead(objNum_2))
                break;
            continue;
        }
        if (objNum_3 < 0)
            objNum_3 = objNum_2;
    }
    if (objNum_2 >= 0)
        objNum_ret = objNum_2;              /* NPC override */
    else if (objNum_3 >= 0 && objNum_ret < 0)
        objNum_ret = objNum_3;              /* fall back to first non-canSee */
    return objNum_ret;
}
```

**Three-tier priority:** NPC > first non-Ignore object > first
Ignore-flagged object. Each tier corresponds to a temporary
(`objNum_2` / `objNum_ret` / `objNum_3`).

### `COMBAT_canSee` — the visibility filter

Body at `seg_2337.c:340`. Returns 0 (invisible to the picker) when:

- the candidate is `IsInvisible` (and not a fellow party member from a
  party-member observer),
- `IsDraggedUnder` (something being dragged behind a horse),
- `ObjShapeType == TypeFrame(OBJ_165, 0)` (a specific stealth case),
- **`IsTileIg(TILE_FRAME(candidate))`** — this is the load-bearing
  flag for "decorative pass-through" tiles (doorway frames, carpets,
  eggs, mushrooms),
- `GetZ(observer) != GetZ(candidate)` (different map levels).

The `IsTileIg` filter is what makes "look at door+doorway → oaken
door" work without the picker explicitly knowing what a doorway is.
But because the second pass *saves* the first Ignore candidate as
`objNum_3` and falls back to it if nothing canSee exists, an egg
sitting alone on a floor (tile 1256 has `IsTileIg=true`) is still
inspectable — the third tier fires.

### Clone correspondence — `inspectAtCell`

`main.js`'s `inspectAtCell(x, y)` implements the same three-tier
rule against the clone's spatial-index storage:

```js
let firstObj = null, firstNpc = null, firstIgObj = null;
for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
  const ents = spatial.at(x + dx, y + dy);
  if (!ents) continue;
  for (const handle of ents) {                          // FORWARD = chain head order
    ...
    if (landedTile === -1) continue;                    // not at this cell
    if (world.has(handle, Actor)) {
      if (firstNpc === null) firstNpc = handle;
    } else if (reg.isTileIgnore(landedTile)) {
      if (firstIgObj === null) firstIgObj = handle;
    } else if (firstObj === null) {
      firstObj = handle;
    }
  }
}
const pick = firstNpc ?? firstObj ?? firstIgObj;
```

The 4-anchor gather mirrors source's `NextLoc`-recognises-extensions
behavior (the four candidate anchors whose 2×2 footprint could cover
`(x, y)`). Forward iteration of `spatial.at` is chain-head-first per
the [`research_world_data.md`](research_world_data.md)
§"Clone correspondence — `SpatialIndex` API" rule.

### Display-name resolution — `GetObjectString` (`seg_1184.c:1912`)

The string LOOK prints for `Selection.obj`. Two-tier fall-through:

```c
GetObjectString(int objNum) {
    if (IsPlrControl(objNum)) {
        di = GetTileString(TILE_FRAME(objNum));
        for (bp_02 = 0; bp_02 < PartySize; bp_02++)
            if (Party[bp_02] == objNum)
                strcpy(D_D7DC, Names[bp_02]);       /* override with party name */
    } else if (objNum < 0x100 && Isbis_0014(objNum)) {
        di = GetTileString(BaseTile[OrigShapeType[objNum] & 0x3ff] +
                           (OrigShapeType[objNum] >> 10));
    } else {
        di = GetTileString(TILE_FRAME(objNum));      /* everyone else */
    }
    return di;
}
```

**No separate "NPC names" file.** Personal names for major NPCs live
in `look.lzd` at NPC-specific tile ids: tile 1769 → "Lord British",
tile 1700-1710 → "musician", etc. The `Names[][14]` table is
populated only for **party members** (from `objlist`); for everyone
else, `GetTileString` (= clone's `Tiles.getTileLook` over the
LZW-decompressed `look.lzd`) is the canonical source of the
displayed name.

Clone's `view/inspector.js` `nameFor()` mirrors this: party member →
`objlist.actors[npcId].name`; everyone else → `getTileLook(tileId,
quantity)`. `look.lzd` format (16-bit tileId + null-terminated
string, sorted ascending; first record with `tileId >= target` wins)
is decoded identically by source's `GetTileString` (linear scan per
query) and clone's `parseLook` (pre-built 2048-entry array — same
result, different cache strategy).

## The shared interaction pattern

All five commands follow the same skeleton:

```c
1. Resolve target object at the cursor.
   - C_27A1_0919 / COMBAT_getHead disambiguate "tile vs object on it"
     and "multi-tile creature → head slot".
2. Guard: target valid? (Selection.obj != -1, right CoordUse, not self)
   - if invalid → print a canned message (D_0DDC[] table) and return.
3. Face the target:  dir = MkDirection(PointerX, PointerY);
                     if (dir != -1) { C_1E0F_0664(Party[Active], dir);
                                      C_1100_0306(); }
4. Range check:  CLOSE_ENOUGH(1, Selection.x, Selection.y, GetX, GetY)
                 → "Out of range!" if too far (most commands need
                    adjacency; look searches at range 1, drops throw).
5. Apply the command-specific effect (mutate object state / inventory
   / world).
6. Spend move points (SubMov(actor, N)) + recompose (C_1100_0306).
```

The canned-message table `D_0DDC[]` (`seg_1944.c:372`, **verified**) holds
terse result/status codes, indexed by a small integer per case:
`{Success, Failed, No effect, Out of range, Blocked, nothing, Not
possible, Done, On what:, On whom:, Location:, Not usable, …}`. (Earlier
drafts of this doc paraphrased these as "Nothing!/You can't reach
that!"-style strings — that was loose; the real table is the list above.)
The handlers index it by case — MOVE uses `[3]` Out-of-range, `[4]`
Blocked, `[5]` nothing, `[6]` Not-possible, `[1]` Failed. The clone
**paraphrases** these into U6-flavored message lines ("You can't move
it.", "You can't move it there.") rather than echoing the terse codes,
the same choice GET makes ("You can't get that." for `[6]`).

This skeleton is the **interaction contract** the rebuild should
reproduce: a command is `(verb, targetObj | targetTile, actor)` →
validate → effect → world-recompose + time/move-point cost.

## Look — `C_27A1_0C67` (`seg_27a1.c:472-690`)

Pure inspection; no world mutation (except revealing/searching).
**Not table-dispatched.** A single function that consumes whatever
`Selection.obj` the cell-pick set, formats a description via
`GetObjectString`, and appends generic stats. Only USE has the big
per-object-type switch — LOOK's text variations (weight / damage /
armor / contents) are cosmetic branches inside the one function.

- **Empty tile** (`Selection.obj == -1` or invisible): name the
  terrain tile (`GetTileString`), and if adjacent, "Searching here,
  you find nothing." (the search-for-hidden-items hook).
- **NPC** (slot < 0x100 or statue types): print the NPC description
  string (`GetObjectString`) + show the **portrait** (`C_27A1_02D9`)
  when not in a vehicle.
- **Item**: print name + **stats** — weight ("It weighs N.N
  stones"), damage points, armor points. Special handling for
  spellbooks (opens the spell-list UI), **readable books / signs /
  scrolls** (`C_27A1_06D7` `CanRead?` → `C_27A1_078F` reads the text
  from `BOOK.DAT` by quality index — this is *reading*, **not** a
  container-contents list), sign-text tiles (`TIL_4DC`/`TIL_4DD`
  redirect to the adjacent text tile). **LOOK does NOT open or list a
  container** — seeing inside one is a USE / GET interaction (the
  `D_E709` open-container view), never LOOK.
- `D_B6DF` (darkness) short-circuits to "darkness." — you can't look
  without light.

Look is the read-only probe; everything else mutates.

### Clone correspondence — `look` (L) vs `inspect` (I)

`systems/command_dispatch.js` registers `look` on the dispatch core: `pickAtCell`
(3-tier, NPCs included — not the USE re-pick) → an empty/invisible cell names the
terrain (`mapLevel.tileAt` + `getTileLook`) plus the adjacent "Searching here, you
find nothing." line; everything else prints `Thou dost see <article><name>.`. LOOK
is **line-only and source-faithful** — `C_27A1_0C67` is a pure scroll verb that
never opens a panel (its one "structured" branch is book/sign *reading*, deferred),
so the clone's LOOK does **not** escalate to a modal. It is **viewport-range** (the
dispatcher's `VIEWPORT_VERBS` set skips the adjacency gate — source reads the pointer
cell, no reach check). `withArticle` approximates `C_27A1_061E`'s a/an/the (per-tile
article data deferred); the count-prefix (`C_27A1_0841`, QuanType-gated), weight,
damage, book/sign text, spellbook, clock, portrait, and darkness branches are all
deferred (each needs a subsystem the clone lacks).

The **`I` hotkey is a separate clone tool — "Inspect"** (`main.js`), with no source
LOOK counterpart: it always opens the I-7 detail inspector modal (obj# / status /
position / container contents) for any pick. So `L` = the faithful description line,
`I` = the structured detail / inventory view; they are deliberately distinct.

## Get — `C_27A1_18F5` (`seg_27a1.c:815-922`)

Move a world object into an NPC's inventory.

- Target must be `LOCXYZ` (on the ground), adjacent.
- **Terrain-damage guard**: getting an item out of fire/lava damages
  the actor (`TerrainDamage`).
- **Weight / gettability gate**: `weight` is `TypeWeight[type] * qty`
  (`GetWeight`, `seg_155D.c:165`). Refuses (`"You can't get that."`,
  `D_0DDC[6]`) if `weight == 0 && !C_155D_063A(type)` — **`TypeWeight==0`
  marks a fixed object** (scenery / furniture / walls; the
  `C_155D_063A`/`D_081F` whitelist is the lightweight stackables
  gold/gems/reagents, weight ÷10, not "containers") — or `weight ≥ 10000`
  (the `255→10000` sentinel), or the target is an NPC (`< 0x100`), or
  `OBJ_19B`. The same `TypeWeight==0` test also gates **Move**
  (`seg_27a1.c:995`). Separately, the **carry-capacity** check refuses
  `STREN*20 < weight + WeightInven + WeightEquip` ("The total is too
  heavy.").
- Placement:
  - **Stackable** (`QuanType`): `GiveObj(actor, type, Amount)` then
    `DeleteObj` the ground object.
  - **Torch lit** (`OBJ_05A` frame 1): equip in a free hand
    (`SLOT_RHND`/`SLOT_LHND`), else "No free hand".
  - **Otherwise**: `InsertObj(obj, actor, INVEN)`, with per-type
    frame fixups (close lanterns, snuff candles, zero moonstone
    coords `D_2C74`, morph `OBJ_1A7→OBJ_1A4`).
- **Theft / karma**: if the object wasn't already "ok to get" and
  you're overworld → `SubKarma(1)`, set OkToGet, and scan nearby
  awake neutral NPCs — if one sees you, `"Stop Thief!!!"` +
  `C_2337_1B0E` (turn hostile / call guards); else `"Stealing!!!"`.
- Cost: `SubMov(actor, 3)`.

Get is the canonical "world → inventory + consequences" verb.

### Clone correspondence — the `get` verb-handler (I-10g)

`systems/command_dispatch.js` registers `get`: `pickAtCell(…, forUse)` re-pick
(objects only, skip NPC/ignore — `C_27A1_0919`) → must be on the ground (has
`Position`) → the **`TypeWeight==0` fixed-object gate**
(`reg.weightOf(objNum) === 0 || === 255 || objNum === OBJ_19B` → "You can't get
that.") → `moveToInventory` (`world_loader.js` — source's `InsertObj INVEN`: drop
`Position` + `spatial.remove`, attach `ContainedIn{holder, equipped:0}`) into the
active member (`avatarRef`) → "You get <article><name>.". Adjacency is the
dispatch's CLOSE_ENOUGH-1 gate (GET isn't a viewport verb).

The gettable gate needs `TypeWeight`, which the clone **already loads** — it's the
`tileflag` file's per-object-type plane (@0x1000), previously *skipped* by
`assets/tile_flags.js`; I-10g decodes it and exposes `reg.weightOf(objType)`. This
gate is load-bearing (it's what makes GET not pick up the floor), so it's ported
rather than deferred. **Deferred** (absent subsystems): the carry-**capacity** check
(`STREN*20`, needs strength + a running carried-weight total), terrain-damage-on-grab,
**theft/karma** (no karma system), lit-torch-to-hand (no equip flow), stack-MERGE
(`GiveObj` — a got stack becomes one INVEN entity), and the per-type frame fixups.

## Drop — `C_27A1_14DA` (`seg_27a1.c:692-812`)

Move an inventory/equipped object into the world (thrown).

- Target must NOT be `LOCXYZ` (it must currently be carried), and
  not the open container being viewed (`D_E709`).
- Prompts "Location:" for a second target (where to drop).
- Validates the drop cell (`C_1E0F_000F` legality + `C_27A1_1330`
  obstacle check + container acceptance `C_27A1_00A9`).
- **Throws** the object as a missile (`COMBAT_Missile(actor, &x, &y,
  8, tile)`) — an animated arc.
- **Outcomes**:
  - Thrown too far / hit something fragile → `"It broke!"`
    (delete, or break-frame for bottles `OBJ_1A1` / certain items).
  - Landed in a container → `InsertObj(obj, container, CONTAINED)`.
  - Landed on open ground → `MoveObj` to the cell (or `AddObj` a
    split stack), `SetOkToGet`.
- Unequips from `Equipment[]` slots if it was worn (handles 2-handed
  weapon → clears the off-hand).
- Cost: `SubMov(actor, 3)`.

**Item selection (the first target, before the handler):** pressing `D`
(`seg_0A33.c:1088-1101`) sets up the targeting (`SelectMode=2`, `SelectRange=7`)
AND **switches the status panel to the inventory** (`StatusDisplay = CMD_92`) so the
player picks the carried item to drop → `Selection.obj`. The handler's "Location:"
prompt is then the *second* target. So DROP is a two-stage select: **inventory item →
cell (range 7)**.

### Clone correspondence — the `drop` verb-handler (I-10h)

The two-stage flow ports as **`D` → modal inventory picker → armed map cursor → cell**.
`main.js`'s `D` hotkey opens `view/inventory_picker.js` (`openInventoryPicker` — a "pick
one carried item" modal reusing the I-7 substrate + `inventoryOf`), the clone's stand-in
for source's panel-switch-to-inventory (no persistent inventory panel yet). The picker's
holder is the **hovered party member** when the cursor is on one (`Actor` +
`PartyMember`), else the avatar — a clone QoL convenience (source drops from the *active*
member, switched via the party panel). The picker is **recursive** — selecting a carried
container (a bag) drills into it via a nested picker, matching source's arbitrary
container nesting (the `D_E709` view navigates the hierarchy: open = down
`seg_0C9C.c:1502`, close = up via `GetAssoc` `:1495`), so an item nested at any depth is
droppable; a pick pops the picker chain back to the root depth. The chosen
item calls `command_dispatch.js`'s `armDrop(itemHandle)`, which arms the verb cursor with
a `pendingDropItem`; the armed confirm (Enter/click, reach **7** per `VERB_REACH`) runs
the `drop` handler: validate the cell (`canStandAt` = the `C_1E0F_000F` placement-legality
analog) → `dropToMap` (`world_loader.js`, inverse of `moveToInventory` / source's
`MoveObj`) → "You drop <name>.". This is the first **two-stage target** (arm with a
context item → pick a cell) — a seam TALK and "use item on target" reuse. **Deferred**:
the missile-arc throw animation, break-if-fragile-and-far, the quantity prompt,
drop-into-container, unequip-on-drop, `SetOkToGet`.

## Move — `C_27A1_1E8B` (`seg_27a1.c:953-1145`)

**MOVE is a dual-mode verb** — it splits on `GetCoordUse(Selection.obj)`
(`:968`): a `LOCXYZ` target is a **ground object to push** (Mode 1); any
other coord-use is a **carried item to give/transfer** (Mode 2). The
second input differs between the modes — Mode 1's is a **direction**,
Mode 2's is a **target entity** — which is what distinguishes MOVE from
DROP (whose second input is a *cell*).

### Mode 1 — push a ground object (`LOCXYZ` branch, `:968-1043`)

Push a world object one tile in a chosen direction (not pick it up). The
puzzle/furniture verb (shove a barrel, push a crate onto a pressure
plate, reposition a cannon).

- Target must be `LOCXYZ`, adjacent — `CLOSE_ENOUGH(1, Selection.x,
  Selection.y, MapX, MapY)` (`:969`; `MapX/Y` = the active member /
  view center), else "Out of range".
- Prompts "To " then a **direction** key (`CMD_80` + `AdvanceDir`,
  `:983`); anything else → "nowhere." **The second input is a
  direction, not a target cell.**
- **Fixed gate**: `TypeWeight[type] == 0 || type == OBJ_19B` → refuse
  (`:995`) — the **same fixed-object gate as GET** (`:857`). Also
  refuses self / certain held NPCs (`:999`).
- **Destination** = the object's cell + `DirIncr[AdvanceDir]` (`:1009`):
  - a container at that cell that accepts it (`C_27A1_00A9`) → `InsertObj
    CONTAINED` (push it *into* a barrel), `:1012`;
  - else `C_27A1_1DAB` legality (below) → `MoveObj` one tile, `:1035`;
    directional objects (cannonball `OBJ_0DD`) set their facing frame
    instead of moving, `:1023`;
  - else → "You can't move it there." (`D_0DDC[4]` = "Blocked"), `:1016`.
- Cost: `SubMov(actor, 5)` (`:1006`) — vs GET/DROP's 3.

**`C_27A1_1DAB` — the move-blocked check** (`:924`, **verified from
source**, returns 1 = blocked):

```c
dest = objCell + DirIncr[dir];
if (!C_1E0F_000F(obj, dest) && !C_27A1_1330(dest))   // dest impassable AND no Su surface
    return 1;                                        //   → blocked
if (!(dir & 1)) return 0;                            // cardinal → clear (dest open is enough)
// diagonal: don't squeeze through a wall corner —
//   clear iff EITHER flanking cardinal (dir-1, dir+1) is passable
if (passable(dir-1 flank)) return 0;
if (passable(dir+1 flank)) return 0;
return 1;                                            // both flanks blocked → corner-blocked
```

`C_27A1_1330` (`:639`) is "is there a `IsTileSu` table-surface tile here
to receive the object?" — the path that lets MOVE drop an object onto a
tabletop; returns 0 the moment it hits an `IsTerrainImpass` tile.

### Mode 2 — give / transfer a carried item (`else` branch, `:1044-1141`)

Point at an **inventory** item → "To " → select a target:

- **another party member** → give it (`C_155D_16E7` remove +
  `GiveObj`/`InsertObj INVEN`), gated by a `STREN×20` carry-weight check
  ("Can't carry!", `:1101`); unequips it first if worn;
- a **container** → put it inside (`InsertObj CONTAINED`, `:1122/1139`;
  "not a container" / "another person's bag" refusals otherwise);
- **yourself** → "yourself." (no-op).

So MOVE = *rearrange*: shove world objects around **or** hand items
between party members / into containers.

### Clone correspondence — the `move` verb-handler (I-10i = Mode 1)

`systems/command_dispatch.js` ships **Mode 1 (push) as I-10i**; **Mode 2
(give) is I-10j**. Stage 1 (the `move` handler): `pickAtCell(forUse)`
(objects only) → the `TypeWeight==0` fixed gate (`reg.weightOf`, shared
with GET) → on success it **arms a push direction** (`pendingMoveObj` +
`awaitingDir`) rather than completing — the clone's stand-in for source's
"To " prompt. Stage 2 (`resolveMove`, fired by the next arrow/numpad key,
sharing `avatar_move_system`'s `dirFromKeyEvent` map): `canPushTo` (the
verified `C_27A1_1DAB` port — dest `canStandAt` + diagonal corner-
clearance) → `moveMapObject` (= `MoveObj`) → "You move <name>.". The
arrow key is captured at the `document` listener and `stopPropagation`'d
so the avatar (whose handler is on `window`, later in the bubble) doesn't
also walk. Adjacency is the dispatch's `CLOSE_ENOUGH-1` gate. **Deferred**
(faithful, like GET/DROP): `SubMov(5)`, push-into-container, directional-
object facing frames, the `IsTileSu` table-surface accept (`canPushTo`
treats it as no surface), and source's target-then-refuse-an-NPC message
(the `forUse` re-pick skips NPCs at the pick). Full notes in
[`progress.md`](progress.md) §"I-10i — landed".

## Use — `C_27A1_6179` (`seg_27a1.c:2956-3160+`)

The richest command: a **`switch(GetType(Selection.obj))`** dispatch
to ~40 per-object-type handlers. This is the "object-type dispatch"
the engine-overview row anticipated — and it's the **only** verb
that's table-dispatched (LOOK/GET/DROP/MOVE are generic single
functions; USE is the dispatch table).

Pre-dispatch:
- `COMBAT_getHead` resolves multi-tile creatures.
- **USE-specific re-pick** (`seg_27a1.c:2962-2967`): if
  `Selection.obj` is an NPC (`< 0x100` at a map tile, not a ridable
  creature) OR the selected tile has `IsTileIg` set, re-pick via
  `C_27A1_0919` to find a non-NPC non-Ignore target at the cell.
  This is *additional* to the cell-pick rule in
  §"Cell-pick (`C_2337_08F1`)": USE refuses NPCs and decorative
  tiles as targets even if the initial pick landed on one.
- `C_27A1_01DE(type)` gates "is this type usable at all?" → "Not
  possible!" if not.
- Vehicle guard (`C_27A1_60F5`) — some things can't be used from a
  ship.
- Adjacency + facing as in the shared pattern.
- Reagent/instrument guards (`C_1944_0AA9` checks for "use on
  altar"-style restrictions).

**`C_27A1_0919`** (`seg_27a1.c:387`) is the USE re-picker:

```c
for (si = FindLoc(GetX(objNum), GetY(objNum), MapZ); si >= 0; si = NextLoc()) {
    if (si == objNum) continue;
    if (!IsTileIg(TILE_FRAME(si))) {
        if (si > 0xff) break;        /* first non-NPC, non-Ignore wins */
    }
}
```

Walks the cell's chain, skips the current `Selection.obj` and any
NPC (`si > 0xff` means "object slot, not NPC slot"), and stops at
the first non-Ignore object.

Representative dispatch cases (`seg_27a1.c:3016-3105+`):

| Object type(s) | Handler | What "use" does |
|----------------|---------|------------------|
| `OBJ_073/074/075` | `C_27A1_4E6F` | food / consumables |
| `OBJ_19C/19E/19F/1A7` (ships, skiff, raft, balloon) | `C_27A1_5289` | board vehicle |
| `OBJ_0BA/0C0` (lever-ish) | frame toggle + `C_27A1_09A1` | pull lever / switch |
| `OBJ_0EC/1A3` | `C_27A1_338D` | (bell / special) |
| `OBJ_07A/091/0A4/0CE/0FD` (lanterns, candles, torches) | `C_27A1_31F6` | light / extinguish |
| `OBJ_129-12C` (doors) | `C_27A1_2A44` | open / close / unlock door |
| `OBJ_062` (something openable, LOCXYZ-only) | `C_27A1_2BBC` | open |
| `OBJ_120` (crank) | `C_27A1_433D` | raise/lower drawbridge — see §"Quality-linked controls" |
| `OBJ_1AC/1AE/1AF` (cannon, creature mount, horse) | `C_27A1_36E7`/`5503`/`55F0` | fire cannon / mount |
| `OBJ_03F/040` (spellbook / scroll) | `C_27A1_2D8E` | cast / read |
| `OBJ_049` (moonstone) | `C_27A1_3425` | bury / use moongate |
| `OBJ_09B/09C/09D/09E` (instruments) | `C_27A1_5935`/`335A(n)` | play music |
| `OBJ_131` (ladder / grate) | `C_101C_089E` | change dungeon level |
| ... ~25 more | various `C_27A1_*` | type-specific |

Each handler is a small bespoke routine. They share the same
post-effect tail (recompose + move-point cost) but the effect is
fully type-specific. This is **not** a uniform "verb on noun"
mechanic — Use is a dispatch table where each usable type defines
its own verb semantics.

### Quality-linked controls — search scope (lever / switch / crank)

A subset of USE handlers operate a **remote target via a shared
`quality` byte** — U6's "circuit ID." The control and its target
carry the same quality; the handler finds the target by scanning for
matching-quality objects (no pointers, no adjacency):

| Control (USE) | Handler | Scans for | Target toggled |
|---|---|---|---|
| lever `OBJ_10C` | `C_27A1_4479` (`seg_27a1.c:2092`) | `OBJ_12D` doorway markers of matching quality | portcullis `OBJ_136` add/delete |
| switch `OBJ_0AE` | `C_27A1_4672` (`:2140`) | same `OBJ_12D` markers | electric field `OBJ_0AF` add/delete |
| crank `OBJ_120` | `C_27A1_433D` (`:2056`) → `C_27A1_3F47` | `OBJ_10D` bridge-corner tile of matching quality | drawbridge geometry extend/retract |

The lever/switch link lives on the `OBJ_12D` marker (not the gate)
because the gate is add/deleted — there is nothing to find when it is
up; the crank link lives on the persistent bridge-corner tile. All
three scan with **`SearchArea(0, 0, 0x3ff, 0x3ff)`** — the full
coordinate range, i.e. *no position filter*: walk every resident
object, keep the type+quality match. Per
[`research_world_data.md`](research_world_data.md) §"Area-bounded
object search", that resident set is structurally the ~40×40 active
window — so a U6 "remote" trigger is remote only *within the loaded
area*; a far, unloaded target was never reachable.

**Clone correspondence + the windowing fix.** The clone's
`findObjectsByTypeQuality(world, objType, quality)`
([`world_loader.js`](../world_loader.js)) currently scans **all loaded
`ObjType` entities** with no position or level filter. Because the
clone never unloads regions ([`../CLAUDE.md`](../CLAUDE.md) +
[`research_world_data.md`](research_world_data.md) §"Clone divergence"),
that set grows unbounded and can match a same-quality object in a
previously-visited region (`quality 0` especially recurs) — a
collision source structurally avoids. So
`findObjectsByTypeQuality(world, type, quality, near)` takes an
optional **`near = {x, y, z}` window** that restores the source bound,
and the three control handlers pass it:

- `near` is the **control object's own cell** (the lever/switch/crank
  being USE'd — adjacent to the avatar, so equivalent to centering on
  the player). The scan keeps candidates within a **±20 box**
  (`|Δx|,|Δy| ≤ 20`) — the I-9 `AREA = 40` work-area size, a symmetric
  stand-in for source's chunk-aligned `AreaX = (MapX-16) & ~7` window
  (`seg_2FC1.c:915`); the ≤4-tile anchor difference is immaterial for a
  circuit search.
- It also applies the **level/Z filter** `NextArea` uses (`z == MapZ`,
  `seg_1184.c:359`) — a no-op while the clone is single-level
  (overworld) but load-bearing once dungeons co-reside under no-unload
  (the xy box doesn't exclude a same-xy object on another level).
- `query(ObjType, Position)` restricts to on-map (`LOCXYZ`) entities,
  matching `NextArea`'s `GetCoordUse == LOCXYZ` skip of
  inventory/contained items.

The control is adjacent to the avatar on USE, so its quality-matched
target is always in-window — the castle lever + crank stay correct.
This is **more** faithful, not a deviation: it excludes only matches
source could never make.

## Talk — `TALK_talkTo` (`seg_16E1.c:60`) → `TalkDriver` (`seg_1703.c:1016`)

TALK uses the **same targeting front-end** as the five `seg_27a1.c` verbs
but its handler lives in the conversation module. Pressing `T`
(`seg_0A33.c:1061`) sets `ch = CMD_83`, `SelectMode = 1`, `SelectRange = 7`;
the shared targeting block (§"How a command reaches a handler") dispatches
the made selection to `TALK_talkTo(Active, Selection.obj, 1)`
(`seg_0A33.c:1264`). So TALK is the **only verb whose handler isn't in
`seg_27a1.c`** — it's one case in the same switch, calling into
`seg_16E1`/`seg_1703` instead of an object handler.

### Reach — 7, not adjacency-1

TALK's `SelectRange = 7` (`seg_0A33.c:1068`) is the **DROP/ATTACK reach**,
not the USE/GET/MOVE adjacency-1. `TALK_talkTo` and `TalkDriver` add **no**
further `CLOSE_ENOUGH` range check, so 7 is TALK's effective reach: you can
hail an NPC up to 7 tiles away. (This pins down the I-11 ledger row's loose
"adjacency-pick" shorthand — the pick is the shared 3-tier `C_2337_08F1`
cell-pick, NPCs first, gated at **reach 7**, not at adjacency.)

### Talkable filter — `TALK_talkTo` (`seg_16E1.c:60-88`)

The wrapper decides whether the pick can be talked to at all:

- Multi-tile mounts (`OBJ_1AE` creature-mount / `OBJ_1AF` horse) →
  `COMBAT_getHead` resolves to the head slot first.
- Talkable **iff** the target is an **NPC slot** (`0 ≤ objNum < 0x100`)
  **or** a **shrine** (`OBJ_189`) / **statue** (`OBJ_18D`/`18E`/`18F`).
  Anything else → `"nothing!\n"`.
- `aFlag` (1 from the `T`-key path) prints the **target-name echo** before
  the conversation opens: `"shrine"` / `"statue"` for those types, else the
  NPC name — `C_1703_0116` if already met (`TalkFlags[npc] & 1`), else
  `GetObjectString` (first meeting). The clone already has the name source
  (`nameFor` / `getTileLook`, §"Display-name resolution").

### Can-talk gate — `TalkDriver` early-exit (`seg_1703.c:1022-1079`)

Once `TALK_talkTo` accepts the target, `TalkDriver` runs a precondition
block **before** loading the script. Source order + message:

| # | Condition | Message |
|---|---|---|
| 1 | party-member target off-screen (`IsPlrControl && !C_1703_0153`) | `"Not on screen."` |
| 2 | not solo/default formation (`D_2CC3 ∉ {-1, 0}`) | `"Not in solo mode."` |
| 3 | shrine/statue → conversation index = `GetQual` (a **redirect**, not a refusal) | — |
| 4 | generic/dead target in seance (`==0 ‖ ≥0xE0`, `IsDead && SeanceFlag`) | `"You hear a deep moan."` |
| 5 | dead-not-seance ‖ asleep ‖ paralyzed ‖ `AI_VIGILANTE/FEAR/RETREAT/ARREST` ‖ `EVIL`/`CHAOTIC` alignment | `"No response"` |
| 6 | `IsArmageddon` | `"No response"` |
| 7 | talker == addressee (`D_E796[1] == [0]`) | `"Talking to yourself?"` |
| 8 | no script: `==0 ‖ (≥0xE0 & not Guard/Wisp/Gargoyle/`OBJ_16A`) ‖ !LoadConversation` | `"Funny, no response."` |

After the gate it faces the target (`MkDirection` → `C_1E0F_0664`), reads
the `$N` name, shows the portrait, prints `"You see "` + the `OP_DESC` body,
and enters the ask/answer loop — all of which is the conversation VM. The
full precondition semantics + the VM are in
[`research_conversation_vm.md`](research_conversation_vm.md)
§"Conversation-init pre-conditions". **I-11 stops at this gate**; the script
load + VM are I-13.

There is a second, **AI-driven** caller — `C_1E0F_3E08` →
`TALK_talkTo(partyId, npc, 0)` (`seg_1E0F.c:1712`, an NPC worktype hailing
the player; `aFlag = 0` so no name echo). Out of I-11 scope (player-
initiated TALK only).

### Clone correspondence — the `talk` verb-handler (I-11)

`systems/command_dispatch.js` registers `talk` as a single-handler verb; all
of it lands in I-11 *except* the conversation itself:

- **Reach 7, single-stage** — reuse DROP's `VERB_REACH = 7` gate (not the
  adjacency-1 `CLOSE_ENOUGH` path; beyond 7 → "Out of range!"). TALK picks
  ONE target and fires — not a two-stage verb. (The earlier "reuse DROP's
  `pendingDropItem` two-stage seam for TALK" note was loose: that seam is for
  a future "use item X on target Y". TALK's only reuse from DROP is the
  reach-7 gate.)
- **Talkable filter** — `pickAtCell` (3-tier, NPCs first) accepts an `Actor`
  **or** a shrine (`OBJ_189`) / statue (`OBJ_18D-18F`); anything else →
  "nothing!". The active member itself → "Talking to yourself?". (Shrine /
  statue are *recognized* now and routed to the placeholder; their real
  conversation — `GetQual`-indexed generic scripts — is I-13.)
- **`canTalk(npc)` gate** — the available arms of `TalkDriver`'s precondition
  block, with two clone substitutions:
  - **asleep** → `AIMode.mode === AI_SLEEP`, **not** source's `IsAsleep`
    (`NPCStatus & ASLEEP`). The clone doesn't carry the `NPCStatus` byte (it's
    parsed then dropped — [`research_save_load.md`](research_save_load.md)
    §"`NPCStatus` decomposition"), but `__AtDestination` sets `NPCMode =
    AI_SLEEP` and `SetAsleep` at the *same* arrival event (`seg_1E0F.c:
    1014-1033` ↔ `npc_path.js:204`), so the worktype is an exact faithful
    proxy for schedule-driven sleep → a meaningful "asleep" line.
  - **evil/chaotic** → an **`Alignment` component carried from `NPCStatus &
    0x60`** at load (load-only until its mutators land; see the decomposition
    doc). The TALK gate is alignment's first/only in-scope reader, so the bit
    is carried *now* rather than dropped — keeping this arm faithful instead
    of a forgotten deferral → "No response".
- **`openConversation(target)` seam** — on a passing gate the handler hands
  the target to one function (the I-12/I-13 integration point), which at I-11
  emits the meaningful placeholder (NPC name / "you approach the shrine").
  I-12 swaps its body for the dialog window; I-13 drives it with the VM. The
  talk handler is final at I-11.

**Deferred to I-13** (needs the script/VM): `LoadConversation` of
`converse.a/.b`, the `"Funny, no response."` no-script refusal, the portrait +
`"You see "` description (both read from the script), and the ask/answer loop.
**Deferred — facing** the target (`MkDirection` → `C_1E0F_0664`), consistent
with the other handlers. **Deferred — gate arms with no live clone signal**
(the `NPCStatus` transients + party/world flags): dead, paralyzed, poisoned,
seance, `IsArmageddon`, solo-mode (`D_2CC3`), and the party-member-off-screen
check — each a one-line arm when its subsystem lands, tracked per-bit in
[`research_save_load.md`](research_save_load.md) §"`NPCStatus` decomposition"
so they aren't forgotten.

## Supporting helpers (shared across the five commands)

| Function | Role |
|----------|------|
| `C_27A1_0205(str, mode)` (`:131`) | Parse a typed string into an integer / quantity (used by "how many?" prompts). Returns -1/-2 for invalid/escape. |
| `C_27A1_02D9(objNum)` (`:168`) | Display an NPC/object portrait in the status panel. |
| `C_27A1_0841(objNum)` | Prefix the object name with the right article ("a"/"an"/"the"/count). |
| `C_27A1_0919(obj)` | USE-specific re-pick — walks the cell's chain skipping the current selection + any NPC + any Ignore tile; returns the first remaining object. See §"Use" for the body. |
| `COMBAT_getHead(obj)` | Map any tile of a multi-tile creature to its canonical head slot. |
| `MkDirection(px, py)` | Convert a pointer position to a facing direction (or -1 if on the player). |
| `CLOSE_ENOUGH(n, x0, y0, x1, y1)` | Chebyshev-distance range test. |
| `C_1E0F_000F(obj, x, y)` | Terrain/object placement legality (shared with NPC AI — see [`research_npc_ai.md`](research_npc_ai.md)). |
| `D_0DDC[]` | Canned refusal-message string table. |

## Object-mutation primitives (the verbs' building blocks)

These live mostly in `seg_1184` (world data) and are how every
interaction actually changes state:

- `GiveObj(npc, type, amount)` — add a (possibly stacked) item to an
  inventory; returns the slot or -1 if no room.
- `TakeObj(npc, type, amount)` — remove from inventory.
- `InsertObj(obj, holder, coordUse)` — relink an object as
  INVEN/EQUIP/CONTAINED of a holder.
- `MoveObj(obj, x, y, z)` — relocate a world object to a cell.
- `AddObj(..., xyz, type, frame, amount)` — create a new world
  object (e.g., a split stack).
- `DeleteObj(obj)` — return a slot to the free list.
- `SetFrame` / `SetType` / `SetOkToGet` / `SetCoordXYZ` — field
  mutators.
- `SubKarma(n)` / `SubMov(actor, n)` — karma + move-point costs.

All of these update the same parallel arrays + `Link[]` linkage
described in [`research_world_data.md`](research_world_data.md).

## Implications for the rebuild

### Command system shape (ECS)

The interaction model is a clean fit for a **command/intent system**:

- **`Command` resource** (or event): `{ verb, actorEntity,
  targetEntity | targetTile, extra }` — the modern analog of the
  `CMD_*` + `Selection` pair.
- **`InteractionSystem`** consumes a `Command`, runs the shared
  pipeline (resolve → validate → effect → recompose + cost). Modern
  UX replaces the blocking second `CON_getch` with click-to-target
  / drag-to-target (see [`../CLAUDE.md`](../CLAUDE.md) §"Modern-browser
  UX as architectural anchor" — the blocking prompt is substrate
  residue).
- **Per-verb modules**: Look / Get / Drop / Move are uniform enough
  to be data-driven; **Use** is inherently a dispatch table — model
  it as a `useHandlers: Map<ObjectType, (ctx) => void>` registry, one
  entry per usable type. This keeps the giant switch as additive
  registrations (ECS-friendly: each new usable item registers its
  handler without touching the others).

### Validation + effects are world queries/mutations

The validate step is queries (`CLOSE_ENOUGH`, `C_1E0F_000F`,
weight/strength); the effect step is the mutation primitives
(`GiveObj`/`TakeObj`/`MoveObj`/`InsertObj`/`DeleteObj`). Both should
go through the world/ECS layer, not be baked into the command
handler — same separation recommended for the conversation VM
(see [`research_conversation_vm.md`](research_conversation_vm.md)
§"Separation of concerns").

### Cross-system couplings to preserve

- **Karma + crime**: Get/Move of un-owned items triggers theft
  detection (nearby NPC line-of-sight → hostility). This couples
  interaction to the NPC AI alignment/combat system
  ([`research_npc_ai.md`](research_npc_ai.md)). Keep it — it's a
  signature U6 mechanic.
- **Move points / time**: every successful interaction spends move
  points (`SubMov`), which feeds the turn scheduler + clock. Keep
  the cost model.
- **Containment**: Drop-into-container and Move-into-container both
  produce CONTAINED links; the rebuild's container model must support
  arbitrary nesting (the `GetAssoc` chain).

### Minimum-scope subset for "wander Britain + interact"

For a first playable: **Look** (inspect tiles/NPCs/items) + **Get** /
**Drop** (basic inventory) + a small **Use** subset (doors
`OBJ_129-12C`, lanterns/torches, ladders `OBJ_131` for level change).
Defer: vehicles, spellbook/scroll casting, instruments, cannon,
moonstones, fishing — each is one Use-dispatch entry addable later.

## Open questions

1. **`Selection` struct full definition** — fields confirmed as
   `obj` / `x` / `y`; whether it carries more (range, mode) needs a
   `u6.h` grep when implementing.
2. **The full Use dispatch table** (~40 cases) — only the
   architecturally-representative ones are tabulated here. The
   complete enumeration is a mechanical pass when Use is implemented
   (one handler at a time).
3. **`C_27A1_5289` board-vehicle + `Board`/`Unboard`
   (`seg_1E0F.c:596/656`)** — the vehicle subsystem; its own
   research when boats/horses matter.
4. **Move's diagonal corner-clearance** (`C_27A1_1DAB`) vs the NPC
   AI's `__TryDiagMove` — confirm they use the same geometry.
5. **`D_0DDC[]` message indices** — exact string per index; tabulate
   when wiring UI text.

## Cross-references

- [`research_game_loop.md`](research_game_loop.md) §"Three-phase
  command dispatch" — how a keystroke becomes a `CMD_*` + sets up
  `SelectMode`; Phase 3 dispatches into these handlers.
- [`research_world_data.md`](research_world_data.md) — the
  parallel-array + `Link[]` object model that the mutation
  primitives (`GiveObj`/`MoveObj`/`InsertObj`/`DeleteObj`) operate on;
  containment via `GetAssoc`.
- [`research_npc_ai.md`](research_npc_ai.md) — `C_1E0F_000F`
  placement legality shared with Drop/Move; theft → NPC hostility
  coupling.
- [`research_conversation_vm.md`](research_conversation_vm.md) —
  parallel "separate VM core / world mutations / I/O" recommendation;
  Use of a person is "talk" (routes to `TALK_talkTo`).
- [`research_save_load.md`](research_save_load.md) — the object-state
  these commands mutate is exactly what gets serialized to
  `savegame\objlist` + `objblkXX`.
- [`../CLAUDE.md`](../CLAUDE.md) §"Modern-browser UX as architectural
  anchor" — the blocking second-`getch` target prompt is substrate
  residue; the rebuild uses click/drag targeting.
