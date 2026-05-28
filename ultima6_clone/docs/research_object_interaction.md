# Research: U6 player↔object interaction (Look / Get / Drop / Move / Use)

**Status:** decoded 2026-05-28. The five world-interaction commands
in `seg_27a1.c` (the "game actions / object-type dispatch" module,
3162 lines — the largest segment) read for their interaction model:
`C_27A1_0C67` (look), `C_27A1_18F5` (get), `C_27A1_14DA` (drop),
`C_27A1_1E8B` (move), `C_27A1_6179` (use). The focus is the shared
**target → validate → apply → recompose** pattern and the Use
command's object-type dispatch table, not every per-object special
case (there are ~40 in the Use switch alone).

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

The canned-message table `D_0DDC[]` holds the common refusals
("Nothing!", "Out of range!", "You can't reach that!", "Not
possible!", etc.), indexed by a small integer per failure case.

This skeleton is the **interaction contract** the rebuild should
reproduce: a command is `(verb, targetObj | targetTile, actor)` →
validate → effect → world-recompose + time/move-point cost.

## Look — `C_27A1_0C67` (`seg_27a1.c:472-690`)

Pure inspection; no world mutation (except revealing/searching).

- **Empty tile** (`Selection.obj == -1` or invisible): name the
  terrain tile (`GetTileString`), and if adjacent, "Searching here,
  you find nothing." (the search-for-hidden-items hook).
- **NPC** (slot < 0x100 or statue types): print the NPC description
  string (`GetObjectString`) + show the **portrait** (`C_27A1_02D9`)
  when not in a vehicle.
- **Item**: print name + **stats** — weight ("It weighs N.N
  stones"), damage points, armor points. Special handling for
  spellbooks (opens the spell-list UI), containers (lists contents
  via the quality/`C_27A1_078F` walk), readable signs (`TIL_4DC`/
  `TIL_4DD` redirect to the adjacent text tile).
- `D_B6DF` (darkness) short-circuits to "darkness." — you can't look
  without light.

Look is the read-only probe; everything else mutates.

## Get — `C_27A1_18F5` (`seg_27a1.c:815-922`)

Move a world object into an NPC's inventory.

- Target must be `LOCXYZ` (on the ground), adjacent.
- **Terrain-damage guard**: getting an item out of fire/lava damages
  the actor (`TerrainDamage`).
- **Weight gate**: refuses if `weight == 0 && !container`, weight ≥
  10000, target is an NPC, or `STREN*20 < weight + WeightInven +
  WeightEquip` ("The total is too heavy.").
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

## Move — `C_27A1_1E8B` (`seg_27a1.c:953-1100+`)

Push a world object one tile in a chosen direction (not pick it up).

- Target must be `LOCXYZ`, adjacent to the map center.
- Prompts "To " then a direction key (`CMD_80` + `AdvanceDir`);
  anything else → "nowhere."
- Refuses: zero-weight / fixed objects (`TypeWeight == 0`,
  `OBJ_19B`), self, certain NPC frames, blocked destinations.
- **Destination resolution**:
  - Into a container at the target cell → `InsertObj(obj, container,
    CONTAINED)`.
  - Onto passable ground (`C_27A1_1DAB` legality incl. diagonal
    corner-clearance) → `MoveObj`. Directional objects (`OBJ_0DD`
    cannonball / wheel) set their facing frame.
  - Blocked → "You can't move it there." (`D_0DDC[4]`).
- Cost: `SubMov(actor, 5)`.

Move is the puzzle/furniture verb (push a crate onto a pressure
plate, shove a barrel, reposition a cannon).

## Use — `C_27A1_6179` (`seg_27a1.c:2956-3160+`)

The richest command: a **`switch(GetType(Selection.obj))`** dispatch
to ~40 per-object-type handlers. This is the "object-type dispatch"
the engine-overview row anticipated.

Pre-dispatch:
- `COMBAT_getHead` resolves multi-tile creatures.
- `C_27A1_0919` disambiguates tile-vs-object targeting.
- `C_27A1_01DE(type)` gates "is this type usable at all?" → "Not
  possible!" if not.
- Vehicle guard (`C_27A1_60F5`) — some things can't be used from a
  ship.
- Adjacency + facing as in the shared pattern.
- Reagent/instrument guards (`C_1944_0AA9` checks for "use on
  altar"-style restrictions).

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
| `OBJ_120` | `C_27A1_433D` | (clock / device) |
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

## Supporting helpers (shared across the five commands)

| Function | Role |
|----------|------|
| `C_27A1_0205(str, mode)` (`:131`) | Parse a typed string into an integer / quantity (used by "how many?" prompts). Returns -1/-2 for invalid/escape. |
| `C_27A1_02D9(objNum)` (`:168`) | Display an NPC/object portrait in the status panel. |
| `C_27A1_0841(objNum)` | Prefix the object name with the right article ("a"/"an"/"the"/count). |
| `C_27A1_0919(obj)` | Resolve "what did the player actually target" when pointing at a tile that has both terrain and an object. |
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
2. **`C_27A1_0919` tile-vs-object resolution** — the exact priority
   when a cell has terrain + multiple objects; body not fully read.
3. **The full Use dispatch table** (~40 cases) — only the
   architecturally-representative ones are tabulated here. The
   complete enumeration is a mechanical pass when Use is implemented
   (one handler at a time).
4. **`C_27A1_5289` board-vehicle + `Board`/`Unboard`
   (`seg_1E0F.c:596/656`)** — the vehicle subsystem; its own
   research when boats/horses matter.
5. **Move's diagonal corner-clearance** (`C_27A1_1DAB`) vs the NPC
   AI's `__TryDiagMove` — confirm they use the same geometry.
6. **`D_0DDC[]` message indices** — exact string per index; tabulate
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
