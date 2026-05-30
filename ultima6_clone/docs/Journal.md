# ultima6_clone — Research Journal

Chronological log — research-phase reading plus source reading during
implementation. **Newest entries at the top.** Per-step implementation detail
(sub-steps, decisions, status) lives in `progress.md`; this is the
reading/discovery narrative.

The Journal is the project's narrative — what was read, when, what
surprised, what got documented, where to go next. The synthesized
facts live in `research_*.md` files, which are maintained
currently-true (no resolved-history sections, no strikethrough —
rewrite in place per `feedback_doc_style`).

The Journal is the only doc allowed to grow chronologically. It IS
the process record; the research docs are the product.

## Entry format

```
## YYYY-MM-DD HH:MM — <one-line summary>

- **Read**: <files / functions in u6-decompiled, with citations>
- **Found**: <surprises, mechanism decodes, corrections to prior assumptions>
- **Docs**: <created / updated, with section refs>
- **Open**: <questions raised, items deferred to a later pass>
- **Next**: <intended next step>
```

---

## 2026-05-30 — I-4 (tile passability) landed: walks branch + footprint util + cell probe

`C_1E0F_000F` (the per-step movement-legality predicate) ported as
`canStandAt(world, x, y, { actorId })` — the signature mirrors source's
`(objNum, x, y)`; the body implements the walks-class branch only and grows
in-place for swim/fly/ethereal as their owning subsystems land.

- **Read**: `seg_1E0F.c:66-235` (`C_1E0F_000F` end-to-end, focused on the
  `bp_10` walks branch + the `c_04ed` NPC-always-blocks gate); `u6.h:175-247`
  (TerrainType / TileFlag / D_B3EF plane bit definitions, including the
  `[Ig]nore` short-form decoding); `seg_1E0F.c:1866-1922`
  (`__ComputeResistance` — the pathfinder's parallel cost-map that uses the
  same 2×2 footprint expansion via `C_1E0F_4265`); `seg_0903.c:229-232`
  (the tileflag file's 4-plane @0x0000/0x0800/0x1000/0x1400 layout —
  TypeWeight skipped, real total 0x1C00 bytes).
- **Found**:
  - **Door open/closed is per-FRAME tile flags, not an `OBJ_129..12C`
    special case.** Closed frames have `IsTerrainImpassable` set; open
    frames don't. The walks-class predicate handles both transparently.
    When door-opening lands later, updating an entity's frame updates
    render AND passability via the same `Renderable.tileId` read — one
    source of truth.
  - **`IsTileIgnore` is "don't short-circuit on Breakthrough"** — not a
    generic "ignore me." A Breakthrough tile grants pass + breaks the cell
    scan UNLESS Ignore is also set on the same tile (`seg_1E0F.c:142-146`).
    Stacked Breakthrough + NPC at the same cell behaves differently with
    vs without Ignore — confirmed in unit tests.
  - **The legacy port misread two flags.** I-2 already corrected
    `isTopTile` → `isForeground` (`IsTileFor`) and `isForceLowerTile` →
    `isBreakthrough` (`IsTileBr`, an AI/movement flag, NOT render); I-4
    added the missing `isTileIgnore` (`IsTileIg`, `D_B3EF & 0x10`) and the
    four TerrainType walks-branch flags (`isTerrainImpassable` / `Wet` /
    `Wall` / `Damage`).
  - **2×2 footprint expansion at the QUERY site** (the 4 candidate anchors
    `(x,y)` / `(x+1,y)` / `(x,y+1)` / `(x+1,y+1)`) cleanly replaces
    source's `MapObjPtr` register-at-each-cell trick. Source registers a
    2×2 anchor at all 4 cells; we register only the anchor and expand at
    lookup. Same semantic, less memory, no per-move bookkeeping. Shared
    between render (per-cell painter zones) and passability (per-cell
    block check) via `forEachOccupiedCell`.
- **Docs**: `progress.md` — I-4 ledger row flipped + "I-4 scope"
  subsection added (sub-step breakdown, deferred class arms, durable
  source findings, verification record). `passability.js` header carries
  the deferred items list with subsystem-owner notes (swim → boats,
  fly+ethereal → combat, etc.). No `research_*.md` changes — the
  walks-branch decode in `research_npc_ai.md` §"Movement legality" was
  already accurate; the new source insights here (door per-frame,
  IsTileIgnore semantics) are captured in the durable-findings block of
  `progress.md` "I-4 scope" alongside the impl rather than re-flowed into
  the research doc.
- **Discussion notes (for the cross-PC paper trail)**:
  - **Function naming**: `canWalk` → `canStandAt` mid-step. Source's
    predicate has no friendly name (`C_1E0F_000F`); its semantic role is
    broader than "walks" — it covers any monster class, switching
    internally. Renaming keeps the body's future expansion
    (swim/fly/ethereal arms) in one function rather than spawning sibling
    predicates.
  - **Scope of class branches**: I floated expanding to the full class
    dispatch now (unit tests don't need real game data), but
    [[green-earth-default-justified-override]] won out — none of
    swim/fly/ethereal are reachable in the visible-progress trajectory
    (I-5 → I-6 → I-7 → I-8 → I-9 are all walks), and the source is
    short + well-documented in `research_npc_ai.md` for the eventual
    re-read. Defer-not-now.
  - **Cursor scheme**: removed `cursor: grab` / `grabbing` from the canvas
    because the OS grab-hand obscured the 16×16 probe highlight. The
    proper cursor scheme follows the input-model decision (keyboard-
    primary vs point-and-click hybrid) that I-6 forces; current state is
    a debug-visibility tradeoff, not a UX commitment.
- **Open**:
  - Input model decision (keyboard-primary + mouse for pan/inspect vs
    point-and-click hybrid) — determines the cursor scheme and the
    avatar's movement input mechanic. Pinned to land before I-6 (avatar
    movement) starts.
  - Lighting subsystem step number (still unnumbered, post-I-6) —
    placement in the ledger settles when its pre-impl research begins.
  - Boats / vehicles step (the first caller that needs the swim arm of
    `canStandAt`) — unscheduled.
- **Next**: I-5 — NPC scheduled movement. Consumes the I-3 `WorldClock`
  hook list (`onHour` → `C_1E0F_5165` schedule re-check) AND the I-4
  `canStandAt` predicate (movement-legality per step + pathfinder cost
  map). The first step where multiple I-N primitives compose into
  observable behaviour.

## 2026-05-30 — Ambient-light decode: `D_2C55` is a flood-fill input, not a render knob

Pre-impl source read for I-3 (world clock) flipped a misleading research-doc claim
before any code landed.

- **Read**: `D_2C4A.c:18` (`D_2C55 = 7` init + "AmbiantLight?" comment), `u6.h:502`
  (`AreaLight[40][40]`), `BSS.ASM:96` (`AreaLight db 40*40`), `seg_1100.c:11/87-142`
  (`C_1100_0131` flood-fill BFS), `seg_1100.c:144-310` (`C_1100_0306` composite —
  zero region → object-walk flag setup → sun fill from player → torch fills →
  per-cell tile pick), `seg_1184.c:1829-1833` (obscurity overlay pass),
  `seg_0A33.c:918-931` (the bucket recompute already in `research_game_loop.md`).
- **Found**: `D_2C55` is the SUN STRENGTH at the player's feet, fed to
  `C_1100_0131` as its BFS `dist` argument — NOT a render-side ambient tint. The
  visible day/night effect is the *result* of re-running the per-cell flood-fill
  with new strength, which (a) recomputes `AreaLight[40][40]`, (b) re-substitutes
  `TIL_0FF` / `TIL_1BC` placeholder tiles for unseen/dark cells, (c) emits
  obscurity-overlay tiles for partly-lit cells. Torches, walls (opaque + window),
  dungeon darkness all fall out of the flood-fill model — none would survive a
  "shader-uniform tint by `D_2C55`" port.
- **Docs**: `research_map_render.md` — added §"Lighting + visibility model" with
  storage, per-composite pipeline, obscurity overlay, the "`D_2C55` is not the
  ambient" framing, rebuild implications; removed the now-resolved open-question
  item #3. `research_game_loop.md` — corrected phase 9 ("Ambient light bucket")
  description, the key-takeaway, and the `WorldClockSystem` implications bullet to
  point at the lighting model and flag it as its own later step. `progress.md` —
  updated I-3 ledger row + added "I-3 scope — world clock" subsection: clock +
  cascade + hourly hook list, ~1-2 hours; ambient-light render dropped, deferred
  to its own step after I-6 (avatar = flood-fill source exists).
- **Open**: where in the step ledger the lighting subsystem lands (after I-6, but
  unnumbered for now). The modern wide drag-scrollable view re-opens an
  architectural question source didn't face — source's flood-fill is
  viewport-clipped (`bp06 == 1` clip in `C_1100_0131`); the rebuild needs either a
  wider flood region recomputed on camera move, or a different lighting model.
  Design call for the lighting step's pre-impl research.
- **Next**: I-3 implementation per the revised scope.

## 2026-05-29 — Implementation phase opened: I-1 built; terrain + object render read against source

Research phase closed; implementation began (per-step narrative now in
`progress.md` "scope" subsections). I-1 (terrain + a few entities through the ECS
core) landed and was verified on real U6 data. Two source investigations grounded
the render work:

- **Read**: terrain — `C_1100_0306` (populate Tile_11x11), `C_0A33_09CE` (Pass-2
  blit), `GR_42` (`gr.h:61` — a graphics-driver dispatch *macro*, not inline pixel
  code; actual blit lives in a separate VGA driver). Objects — `C_1184_35EA`
  (`seg_1184.c:1702`, double-tile expansion via `tile-1/-2/-3`) + `ShowObject`
  (`seg_1184.c:1651`, per-cell chain, 3-zone Z-order by `IsTileFor`).
- **Found**: U6 is palette-indexed (mode 13h) — the WebGL indexed-palette shader is
  the exact modern analog (fragment shader = VGA DAC; `GR_42` dispatch = WebGL draw).
  Water tiles are transparent bases remapped via animdata to opaque frames (drawing
  raw → black). Coastlines are a two-layer composite (animated water base + shore
  overlay). The pillar bug = per-object vs per-tile flag routing; fix = route each
  tile by its own `isTopTile`.
- **Docs**: `research_i1_render_slice.md` §8 (terrain) + §9 (objects); `progress.md`
  I-1 scope + re-ordered ledger (object/world-data system pulled to I-2).
- **Next**: I-2 — world-data system: `OBJBLK*`/`objlist` → real ECS entities +
  `SpatialIndex` + `ObjManager` dissolution.

## 2026-05-28 — Player↔object interaction + save/load mechanism decoded

- **Read**:
  - `seg_27a1.c` (3162 lines, "game actions / object-type dispatch")
    — the five world-interaction handlers: `C_27A1_0C67` look
    (`:472`), `C_27A1_18F5` get (`:815`), `C_27A1_14DA` drop
    (`:692`), `C_27A1_1E8B` move (`:953`), `C_27A1_6179` use
    (`:2956`) + helpers `C_27A1_0205` (string→int), `C_27A1_02D9`
    (portrait), `C_27A1_0841` (article prefix), `C_27A1_1DAB`
    (diagonal corner-clearance).
  - `seg_0C9C.c:250-405` — save/restore orchestration: `C_0C9C_089F`
    save, `C_0C9C_0397` restore, `C_0C9C_042A` the load body.
  - `D_2C4A.h` (full) — the contiguous global-state block.
  - `../ultima6/doc/objlist.txt` — Nuvie's objlist field map
    (cross-checked against the actual `OSI_read`/`OSI_write` order).
  - Re-read `research_world_data.md` to scope the save/load doc
    against already-documented OBJBLK content (no duplication).

- **Found** — interaction model:
  - **All five commands share one pipeline**: resolve target
    (`Selection.obj`/`.x`/`.y` from a second `CON_getch`) → guard
    (valid? right CoordUse? not self) → face target
    (`MkDirection` → `C_1E0F_0664`) → range check (`CLOSE_ENOUGH`)
    → apply effect → recompose (`C_1100_0306`) + spend move points
    (`SubMov`). Canned refusals from the `D_0DDC[]` string table.
  - **Look** = read-only probe (tile/NPC/item description + stats +
    portrait). **Get** = world→inventory with weight gate + theft/
    karma detection (un-owned + overworld → SubKarma + nearby NPC
    "Stop Thief!"). **Drop** = inventory→world as a thrown missile
    (`COMBAT_Missile`), can break. **Move** = push a world object
    one tile (puzzles/furniture). **Use** = a
    `switch(GetType(obj))` dispatch to ~40 per-object-type handlers
    (food, vehicles, doors, levers, lanterns, instruments,
    spellbook, moonstones, ladders, ...).
  - The interaction contract is `(verb, targetObj|targetTile,
    actor) → validate → effect → recompose + cost`. Look/Get/Drop/
    Move are uniform; **Use is inherently a dispatch table** (each
    usable type defines its own verb semantics) — model as a
    `Map<ObjectType, handler>` registry in the rebuild.
  - Mutation primitives (shared with everything): `GiveObj` /
    `TakeObj` / `InsertObj` / `MoveObj` / `AddObj` / `DeleteObj` +
    `SubKarma` / `SubMov`.

- **Found** — save/load:
  - A U6 savegame is a **dump of in-memory state arrays**, split by
    slot range across files. `savegame\objlist` = the 256 actor
    parallel arrays (24 of them: pos/shape/amount/status + 7 RPG
    stats + AI mode/combat mode/sched index/leader/movepts + talk
    flags + direction + names + party) followed by the `D_2C4A`
    global-state blob. `savegame\objblkXX` (per 128×128 region) +
    `objblk{A-E}I` (5 dungeon levels) = world objects (format in
    `research_world_data.md`).
  - **Save** (`C_0C9C_089F`): flush dirty objblk regions
    (`C_1184_33CA`), then write `objlist` (the only file written at
    save time — world objects were flushed lazily while roaming).
    There is no monolithic save file; the savegame is the
    `savegame\` directory.
  - **Restore** (`C_0C9C_0397` → `C_0C9C_042A`): delete `.tmp`
    files, re-init arrays, read `schedule` + `basetile` (static,
    not part of save) + `objlist`, derive MapX/Y/Z from the active
    party member, stream in objblk for the current region.
  - The `D_2C4A` block is written as **one contiguous blob**
    (`&obj_2C4A` .. `&D_2CCC`, ~0x82 bytes) — clock, karma, wind,
    ambient light, active member, `SpellFx[16]`, moonstone
    positions, moon phases, powder-keg timer, gender, language,
    combat/solo flags, default command, sound flag, quest flag.
  - Save files are **uncompressed** raw memory blocks; only shipped
    content assets are LZW-compressed. `DISK_confirm(DISK_n)` calls
    are DOS floppy-swap prompts (substrate residue).

- **Docs**:
  - Created [`research_object_interaction.md`](research_object_interaction.md)
    (~270 lines): shared interaction pipeline, per-command sections
    (look/get/drop/move/use), the Use object-type dispatch table,
    helpers + mutation primitives, ECS command-system mapping
    (Use = handler registry), cross-system couplings (karma/crime,
    move-points/time, containment), min-scope subset, open
    questions.
  - Created [`research_save_load.md`](research_save_load.md)
    (~250 lines): savegame composition (objlist + objblk* + static
    files), the `D_2C4A` global-state catalog, the 24-array
    `objlist` order, save/restore orchestration, compression layer
    note. **Framing: the format is throwaway (rebuild uses modern
    persistence); the deliverable is the authoritative state-set
    checklist.** ECS mapping = serialize component stores +
    singleton resources; atomicity = staging-swap; static-vs-save
    separation; new-game-init via parsing the original starting
    savegame.
  - Updated [`research_engine_overview.md`](research_engine_overview.md):
    `seg_27a1` row → decoded; `seg_0C9C` save/load noted.
  - Updated [`DOCUMENTATION_INDEX.md`](DOCUMENTATION_INDEX.md):
    two new rows + status.

- **Open**:
  - Full Use dispatch table (~40 cases) — only representative ones
    tabulated; mechanical enumeration when Use is implemented.
  - `Selection` struct full field set (grep u6.h when implementing).
  - `C_1184_33CA` / `C_1184_3B7D` / `LoadNewRegions` bodies (region
    flush + post-load rebuild + region stream) — only needed if the
    rebuild keeps region partitioning.
  - `D_8C42` (per-NPC, saved in objlist, "palette?") — meaning
    unconfirmed.
  - Vehicle subsystem (`Board`/`Unboard`, `C_27A1_5289`) — own
    research when boats/horses matter.

- **Next**: the core engine is now broadly characterized — loop,
  render, world data, animation, conversation, NPC AI, interaction,
  save/load. Remaining single-subsystem gap: `seg_155D` status
  panel (the last original engine-overview open Q). After that, the
  natural transition is an **implementation-readiness assessment**
  (is research sufficient to open the implementation phase? sketch
  the graphics-first minimum-viable plan).

---

## 2026-05-28 — NPC AI / schedules / pathfinding decoded

- **Read**:
  - `seg_1E0F.c` (2295 lines, the "NPCTracker" module) — read in
    full for the AI subsystem:
    - `C_1E0F_4E0A` (`:2147`) — the NPC tick (move-point round
      scheduler), called once per player action from the game-loop
      epilogue.
    - `C_1E0F_3E6A` (`:1733`) — the per-mode dispatcher
      (`switch(NPCMode)`).
    - `C_1E0F_4B6A` (`:2083`) party-leadership, `C_1E0F_4746`
      (`:1962`) combat gravity centers, `C_1E0F_464A` (`:1924`)
      AI_FINDPATH path service — the three pre-tick maintenance
      functions.
    - `C_1E0F_0FA9` (`:454`) — corpser drag-under gate.
    - `__AtDestination` (`:1002`), `C_1E0F_5165` (`:2264`) NPC
      update / hourly schedule transition, `C_1E0F_291C` (`:1181`)
      off-area teleport.
    - Pathfinding: `C_1E0F_2D37` (`:1286`) build path,
      `C_1E0F_2A74` (`:1213`) Dijkstra relax, `C_1E0F_25F9`
      (`:1100`) RLE traceback, `__ComputeResistance` (`:1866`)
      cost map, `__DoOnPath` (`:1576`) path follow,
      `__NewPathIndex` (`:1717`) path-slot allocation.
    - Movement: `C_1E0F_000F` (`:66`) terrain legality,
      `TryMoveTo`/`TryStraightMove`/`__TryDiagMove` (`:1421-1556`),
      `SubMov`/`SubTerrainMov` move-point accounting,
      `C_1E0F_37DB` (`:1558`) wander, `C_1E0F_33C4` (`:1448`)
      drift-toward-target.
  - `ai.h` (full) — AI mode constants (combat <0x80, navigation
    0x80-0x86, schedule worktypes 0x87-0x9B).
  - `u6.h` — `tSchedule` struct (`:469`), `Schedule[]` /
    `SchedIndex[]` / `SchedPointer[]` / `PathObject` / PTH_*
    globals, `struct coord` (`:302`).
  - `../ultima6/doc/schedule.txt` (Nuvie) — schedule-file format
    + worktype list. Cross-checked against the decoded entry usage.
  - Confirmed legacy `../ultima6/` port has **NO NPC AI** — `npcMode`
    appears only as data read in `obj_manager.js` and consumed by
    the conversation VM in `script.js`.

- **Found** — AI architecture:
  - **Action-economy turn scheduler**, not real-time. Each player
    action → one `C_1E0F_4E0A` call. NPCs spend `MovePts[npc]`;
    refill from `DEXTE[npc]` (dexterity); time advances 1 minute
    each time a full round (all NPCs out of move points) is
    consumed. Priority = `MovePts*roundDexte - DEXTE*roundMovePts`
    (fast NPCs act more often).
  - **`NPCMode` is a per-entity state machine.** `C_1E0F_3E6A`
    switches on it: combat modes → `COMBAT_AI_*` (seg_2337);
    AI_WANDER/GRAZE → random walk; AI_LOITER/FARM → drift toward
    schedule spot; AI_ONPATH/84/85 → follow path; AI_GUARD_*/0F/10
    → patrol pacing; AI_ARREST/BRAWL/CONVERSE/THIEF → crime/social;
    default → idle.
  - **Schedule lifecycle**: hourly `C_1E0F_5165` matches a schedule
    entry by `Time_H` (+ day-of-week packed in the high 3 bits of
    the `time` byte) and sets `NPCMode = AI_FINDPATH`. Path service
    builds a path → AI_ONPATH walks it → `__AtDestination` sets the
    entry's worktype mode (with sprite/facing side-effects:
    SLEEP→bed, SIT/PLAY→chair+lute, EAT→table, STAND/GUARD→facing).
  - **Pathfinding** = bucket-priority Dijkstra over a 40×40 work
    area, with a meet-in-the-middle two-source flood (NPC cell +
    dest cell, distinguished by a 0x80 side-flag in `PTH_map`).
    Cost map from terrain `(TerrainType>>4)+1` + object surcharges
    (doors, 2×2 footprints via the same DoubleH/V tile-flag
    geometry as the render path). Output is RLE-encoded direction
    nibbles; up to 8 concurrent paths (`PathObject[8]`), shared via
    `Leader[npc]`/`PathObject[idx]`.
  - **Off-area teleport** (`C_1E0F_291C`): NPCs far outside the
    work area are teleported straight to their scheduled
    destination rather than simulated — both a cycle-saver and a
    gameplay property (NPCs are where they should be when you
    arrive).

- **Found** — correction to a prior research-doc claim:
  - `research_game_loop.md` §"Open questions" item 3 called
    `C_1E0F_0FA9` "the actual NPC action dispatcher." **Wrong** —
    `C_1E0F_0FA9` (`seg_1E0F.c:454-471`) is only the corpser
    drag-under gate (returns 1 if the NPC is stuck struggling to
    escape a corpser). The real per-mode dispatcher is
    `C_1E0F_3E6A`. Both `research_game_loop.md` and
    `research_engine_overview.md` corrected. (This is the
    "agents/lead-author can write confidently-wrong claims about
    a function they only saw at a call site" pattern — the
    game-loop read saw `C_1E0F_0FA9` called in the tick and
    inferred its role from position, without reading its body.)

- **Docs**:
  - Created [`research_npc_ai.md`](research_npc_ai.md) (~470 lines):
    AI tick, move-point economy, per-mode dispatcher table,
    schedule data layout + transition + arrival, pathfinding
    (cost map / Dijkstra / RLE traceback / path following),
    movement legality, rebuild implications (ECS turn system, AI
    state-machine component, reimplement-don't-transliterate
    pathfinding, off-area teleport design choice), minimum-scope
    subset for "wander Britain", open questions.
  - Corrected [`research_game_loop.md`](research_game_loop.md)
    open-Q items 2 + 3 (C_1E0F maintenance + the C_1E0F_0FA9
    mislabel) and item 5 (TALK_talkTo resolved).
  - Updated [`research_engine_overview.md`](research_engine_overview.md):
    `seg_1E0F` row → "decoded"; the C_1E0F follow-up item RESOLVED.
  - Updated [`DOCUMENTATION_INDEX.md`](DOCUMENTATION_INDEX.md):
    new row + status.

- **Open**:
  - `C_1E0F_0664` (face-direction + per-step animation) — body not
    read; needed for NPC movement animation.
  - `C_1E0F_1B0E` (player walk) + `MoveFollowers` (party formation)
    — belong to a future `research_player_movement.md`.
  - `COMBAT_AI_*` (seg_2337) — combat dispositions, own subsystem.
  - `C_1E0F_2184` (find adjacent chair/table/chain) — needed for
    SIT/EAT/PLAY/RINGBELL worktype visuals.
  - AI_84/85/86 path-retry thresholds — exact give-up counts.

- **Next**: with "talk to NPCs" (conversation VM) + "wander
  Britain" (NPC AI) both decoded, the min-scope research is largely
  covered. Candidates:
  (a) `seg_155D` status-panel — last engine-overview open Q; small.
  (b) `research_player_movement.md` — `C_1E0F_1B0E` + MoveFollowers
      + Board/Unboard; pairs with the NPC-AI movement primitives
      already read.
  (c) Begin the implementation-phase plan now that the core engine
      (loop, render, world data, animation, conversation, NPC AI)
      is characterized — assess whether research is "sufficient"
      per the phase-transition criteria.

---

## 2026-05-28 — Conversation VM decoded end-to-end

- **Read**:
  - `seg_16E1.c` (88 lines, entire file) — `TALK_initTalk` populates
    6 strings + 14 integers in `VarStr` / `VarInt`; `TALK_talkTo`
    routes from the game-loop CMD_83 (talk) handler, handles
    shrine / statue special-case prints, and delegates to
    `TalkDriver`.
  - `seg_1703.c` (1206 lines, entire file) — full conversation VM:
    `TalkDriver` (entry + ask/answer loop) at `:1016-1206`,
    `parse_statement` (statement read loop) at `:945-977`,
    `execute_op` (control-opcode switch with ~30 cases) at
    `:714-943`, `parse_factor` (RPN expression evaluator, 10-deep
    stack, ~50 opcodes) at `:295-685`, plus support routines
    `JoinParty`/`LeaveParty`/`mk_npcnum`/`str_i_compare`.
  - `seg_2FC1.c:783-834` `LoadConversation` — the data-load
    function. Routes by NPC# to `converse.a` (NPCs 0..0x62) or
    `converse.b` (NPCs 0x63..); special-cases 0x66/0x67/0x68 for
    Wisp/Guard/Gargoyle generic scripts. LZW-inflate via
    `decompress(...)` if entry has non-zero stored size, else raw
    read up to 0x2800 bytes.
  - `../ultima6/doc/u6converse.txt` (306 lines, Nuvie tech doc by
    Joseph Applegate, May 2003) — bytecode-format spec, opcode
    catalog (partial), substitution syntax. Many uncertainties
    (marked `??`) that u6-decompiled now confirms.
  - `../ultima6/doc/investigation.txt:30-35` — function-pointer
    notes confirming `seg_16E1 TALK_initTalk (11)` + `seg_1703
    LeaveParty (246)` + `execute_op (714)` positions.
  - `../ultima6/script.js` (~1300 lines, entire file) — legacy port
    of the VM. `ScriptInterpreter` class with `run`, `evaluate`,
    `formatScript`/`collectFormat`/`collectEval` (full disassembler),
    `skipCodeBlock`/`skipEvalBlock` (branch-skip helpers).
  - `../ultima6/u6opcode.js` (128 lines) — opcode-constant table
    with semantic names + brief one-line comments.
  - `../ultima6/map_viewer.js:707-726, 982` — integration call site:
    `dialog = new ScriptInterpreter(...); dialog.run("", output)`.
    `scriptLib = new Library(fileMap.get("converse.a").buffer)`.

- **Found** — VM architecture:
  - **Four-layer**: TalkDriver (entry) → parse_statement (statement
    read loop) → execute_op (~30 control opcodes) + parse_factor
    (RPN expression evaluator with `lstack[10]` long stack).
  - **State**: `TalkBuf` (10 KB script buffer, malloc at
    `seg_0903.c:539-577`), `Talk_PC` (offset into TalkBuf), `VarInt[32]`,
    `VarStr[32]` (letter-addressed via `letter - 0x37`),
    `TalkFlags[256]` (persistent per-NPC bit flags, serialized in
    savegame), `mustLeave` exit flag, `IsInConversation` mode flag.
  - **Bytecode shape**: flat byte stream; printable ASCII (0x20-0x7A
    + 0x0A) prints directly via `CON_putch`; 0x80+ are control
    opcodes. Three data-size prefixes: `OP_BYTE` (0xD3, 1B),
    `OP_WORD` (0xD4, 2B), `OP_ADDRESS` (0xD2, 4B). Expressions are
    RPN; literals push directly; the eval terminator `OP_END_OF_FACTOR`
    (0xA7) or `OP_LET_VALUE` (0xA8) returns the bottom-of-stack value.
  - **Scope of opcodes**: ~30 control (IF/ELSE/ENDIF, GOTO, LET,
    PRINTSTR, GIVEOBJ/TAKEOBJ/MOVEOBJ/TRANSFEROBJ, SETMODE,
    SET/CLR talkflag, ADDKARMA/SUBKARMA, JOIN/LEAVEPARTY,
    HEAL/CURE/RESURRECT, REST, SHOW_INVENTORY/SHOW_CONVERSE,
    DELAY, WAIT). ~50 expression (arithmetic, comparison, variable
    lookup, ~25 domain queries like OWNS/WEIGHT/ISINPARTY/HORSED/
    WOUNDED/STRSEARCH/VALSEARCH/CANCARRY/TST flag-test/...).
  - **Keyword dispatch** (`OP_KEY` = 0xEF): comma-separated keyword
    list terminated by `OP_RES` (0xF6); case-insensitive match;
    wildcard `*` matches anything (default-answer).
  - **NPC self-reference**: every NPC argument passes through
    `mk_npcnum` which translates `0xEB` (`OP_NPC`) → current
    talker. Allows scripts to reference "myself" without baked-in
    NPC numbers.

- **Found** — conversation data layer:
  - Two LZW-compressed lib_32 files: `converse.a` (99 entries,
    NPCs 0-98) + `converse.b` (125 entries, NPCs 99-220 + 14
    generic / shrine / temporary). Combined ≈ 220 scripts.
  - Per-entry layout: 32-bit uncompressed size header; if 0 →
    raw payload; else LZW-inflated to caller buffer.
  - Per-script layout: `0xFF NPC# NAME` (name section) →
    `0xF1 description` (look section, the "You see ...") →
    `0xF2|0xF3 main_script` (converse section). Section markers
    `OP__FF / OP_DESC / OP_MAIN` with `0xF3` (OP_PREFIX in legacy
    port) substituted for `OP_MAIN` in some scripts — purpose
    unknown.

- **Found** — legacy port is more advanced than expected:
  - `ultima6/script.js` is ~1300 lines including a substantial
    disassembler. Architecture mirrors source's layers.
  - **Continuation-passing input model** — `run(input, output)`
    returns a status enum (`END / INPUT / PAUSE / INPUTNUM`); the
    caller resumes the VM on the next input. This is the right
    pattern for the rebuild's async-friendly substrate (mirrors
    the modern-UX anchor — source's blocking `CON_getch` is
    substrate residue, not spec).
  - **Opcode-name divergence**: legacy port uses semantic names
    (JUMP / BYE / KEYWORDS / ANSWER) where source uses syntactic
    (OP_GOTO / OP_LEAVE / OP_KEY / OP_RES). Same bytes, different
    labels. The rebuild should adopt the legacy port's names for
    readability; cite source hex in comments.
  - **Known stubs / bugs** to verify against source before
    re-porting: OBJINPARTY pushes 0 (fake), OWNS pushes 0 (fake),
    WEIGHT uses typeWeight=10 fake, JOIN cap 16 (source = 8),
    LEAVEPARTY doesn't drop inventory (source does). String
    equality for `$Z` in `OP_EQU` not handled in legacy port's
    `evaluate()` — needs the `bp_58` flag path from source.

- **Docs**:
  - Created [`research_conversation_vm.md`](research_conversation_vm.md)
    (~530 lines): VM architecture overview, conversation-file
    format, bytecode mechanics, full opcode catalog with source-vs-
    legacy name mapping, variables + substitution, special NPC
    constants, pre-condition gates, legacy port reference, rebuild
    implications (coroutine pattern, separation of concerns, ECS
    mapping, async-input model, minimum-viable scope), open
    questions (legacy-port stubs, AND/OR semantics, OP_FUNC, the
    f2/f3 marker mystery).
  - Updated [`research_engine_overview.md`](research_engine_overview.md):
    open-Q item 7 (conversation VM) marked RESOLVED with link.
  - Updated [`DOCUMENTATION_INDEX.md`](DOCUMENTATION_INDEX.md):
    new row for research_conversation_vm.md; status updated.

- **Open**:
  - `OP_FUNC` (0xD1) — present in legacy opcode table but commented
    out; not handled in source's `execute_op`. May be SE/MD-only.
    Need to grep U6 scripts for actual 0xD1 occurrences.
  - `OP_MAIN` (0xF2) vs `OP_PREFIX` (0xF3) — which scripts use
    which marker, and what does PREFIX actually mean? Tech doc
    marks it unknown.
  - `OP_AND` / `OP_OR` boolean-vs-bitwise — source's semantics
    differ subtly from the legacy port's; need to scan actual
    scripts for non-0/1 operands.
  - `seg_155D` status-panel renderer (the remaining
    engine-overview Q) — still pending.
  - NPC AI internals (`C_1E0F_*`) — still the next-best research
    target for "wander Britain" minimum scope.
  - Combat (`seg_2337`) and spells (`seg_1944`) — only touched
    glancingly via `C_1944_0A43` (find object in inventory) and
    `C_1944_1A42` (resurrect spell) references from this read.

- **Next**: pick one of:
  (a) NPC AI internals (`C_1E0F_0FA9` + siblings) — next subsystem
      on the "wander Britain" min-scope path; largest scope (likely
      its own `research_npc_ai.md`).
  (b) `seg_155D` status-panel — closes the last engine-overview
      open Q; small focused scope.
  (c) Start verifying the legacy port's conversation-VM stubs
      against u6-decompiled — concretely turn the §"Open questions"
      checklist in `research_conversation_vm.md` into a corrected
      port reference, even before the rebuild starts on it. Useful
      cross-PC because the verification work is mostly grep + read.

---

## 2026-05-27 — Game-loop + animation pipeline decoded; modern-UX principle captured

- **Read**:
  - `C_0A33_1CB4()` game-loop body at `seg_0A33.c:1020-1405` (full
    body — three-phase command dispatch + epilogue).
  - `C_1E0F_4E0A()` per-action NPC tick at `seg_1E0F.c:2147` —
    MovePts/DEXTE time-slicing + 1-minute time-advance trigger.
  - `C_0A33_1355(int minutes)` time-advance at `seg_0A33.c:715-937`
    — full body. Spell timers, inventory rolls, status-effect
    rolls, hour rollover + date cascade, sundial / moon / moongate
    hourly hooks, wind reroll, ambient-light bucket recompute.
  - `RefreshStatus()` at `seg_0A33.c:939-952` — dirty-flag-gated
    status-panel refresh dispatching to `seg_155D` renderers.
  - `CON_getch` = `C_0C9C_2A59` at `seg_0C9C.c:1423+` — UI dispatch
    wrapper.
  - `C_0C9C_1D59()` at `seg_0C9C.c:1023+` — the polling layer
    (`while(!ch)` loop). Mouse + keyboard + ALT-letter
    default-command setters + SelectMode cursor logic.
  - `CON_prompt` = `C_0C9C_0E6E` at `seg_0C9C.c:483-520` — leaf
    keyboard scan; the animation tick site (when `D_049C` set:
    `OtherAnimations()` + `PaletteAnimation()`).
  - `OtherAnimations()` at `seg_0A33.c:436-454` — NOT a per-tile
    animator; it processes the `D_17B0` / `D_0340` / `CyclopsFlag`
    deferred-render flags by calling `C_1100_0306` /
    `C_0A33_09CE(1)` / `ShakeScreen`.
  - `PaletteAnimation()` = `C_0903_0820` at `seg_0903.c:283-326`
    — direct VGA DAC writes cycling palette slots `0xE0-0xFB`
    (8-wide cycles at `0xE0-0xE7` / `0xE8-0xEF`, 4-wide at
    `0xF0-0xF3` / `0xF4-0xF7` / `0xF8-0xFB`); non-VGA path
    delegates to `GR_27(D_01D2++)`.
  - `u6tech.txt:323-429` §"Animation" — canonical high-level
    description: two animation types + hybrid tiles.
  - Legacy `../ultima6/anim_data_manager.js` (full file, 78 lines)
    — `parseAnimData` + `update(frame)` returning Set of changed
    tile IDs.
  - Legacy `../ultima6/map_viewer.js:406-462` `updateFrame(frame)`
    — sparse buffer-patch pattern using `tileUsageMap` reverse
    index + `Shader.updateLayer` partial upload.
  - Legacy `../ultima6/map_viewer.js:920-958` drag handling —
    `pointermove` sets `mapOriginX/Y` + `pendingMapUpdate = true`.

- **Found** — game-loop architecture:
  - **Turn-based blocking loop, not real-time.** `CON_getch()`
    blocks until input arrives; no per-frame tick at the loop
    level. Three switch phases: (1) keystroke → CMD_*
    translation + targeting setup; (2) '0'-'9' party-mode /
    solo-mode toggle; (3) action dispatch on translated CMD_*.
    Action handlers dispatch into seg_2337 (combat), seg_1944
    (cast), seg_27A1 (look/get/drop/move/use), seg_1703 (talk
    via `TALK_talkTo`), seg_3200 (rest).
  - **Time advance lives entirely inside `C_1E0F_4E0A`** — game
    loop never calls `C_0A33_1355` directly except the Alt+215
    debug hotkey. The mechanism: each NPC has `DEXTE[i]`
    movepts per round; inner loop picks highest-priority NPC by
    `(MovePts * round_dexte) - (DEXTE * round_movepts)`; when
    no NPC has positive movepts, round exhausts, `MovePts[i]`
    replenishes and `C_0A33_1355(1)` advances time 1 minute.
    Outer loop exits when active party member's `NPCMode`
    returns to `AI_COMMAND`.
  - **Time-advance side effects on render**: only the ambient-
    light bucket (`D_2C55`) triggers a composite redraw via
    `C_1100_0306()` when the bucket changes. Sunrise (Time_H==5)
    and sunset (Time_H==19) bucket via `Time_M / 10`, giving 6
    stepped redraws per hour during dawn/dusk. Other transitions
    are invisible to the composite pass — the palette/animdata
    channels handle continuous-feeling animation.
  - **Animation tick site = `CON_prompt`'s no-key idle path.**
    When `C_31FA_000C` returns 0 (no key) and `D_049C` is set,
    `OtherAnimations() + PaletteAnimation()` run. When `D_049C`
    clear, `OSI_delay(1)` instead. The 4-frame animated text
    cursor is independent of the graphics channels.

- **Found** — animation architecture (three independent channels):
  - **Channel 1: Palette cycling** — hardware VGA DAC writes
    cycle slots `0xE0-0xFB`. Used for fires, braziers, candles,
    BluGlo, kitchen cauldrons. Pixel buffer untouched; visible
    flow comes from the indexed-color LUT changing under static
    pixels. Tech-doc and source agree exactly. Cross-checked
    against `u6tech.txt:340-347` palette slot map.
  - **Channel 2: animdata tile-pointer rewrite** — file format
    matches `u6tech.txt:381-391` and `anim_data_manager.js` byte
    for byte. 29 active entries × `{tile_to_animate,
    first_anim_frame, and_mask, shift_value}`. Formula:
    `tile_pointers[tile_to_animate[i]] = tile_pointers[first_anim_frame[i]
    + ((game_timer & mask) >> shift)]`. Drives water, fountains,
    pennants, **PC and NPC sprite cycles**, protection fields.
  - **Channel 3: Hybrid tiles** — coast/river-bank pixel mask
    drives layered animation. Source mechanism (per
    `u6tech.txt:430-516`) lives in `u6mcga.drv` at offsets `0x2CFA`
    + `0x2D2F` (OUTSIDE u6-decompiled's scope — game.exe vs
    graphics driver). Per-tick direct pixel copy `dest_tile[i] =
    source_tile[i]` across 32 hybrid tiles using `animmask.vga`'s
    RLE (displacement, length) blocks. **Legacy port reframes the
    mechanism**: `tile.js:60-80 processAnimMask` runs once at
    decode time per hybrid tile (indices 16-47), filling masked
    positions with colorkey `0xFF` (transparent). At render time,
    animated source draws under, static dest draws over with
    transparent holes — same visible result, zero per-tick cost.
    Visual confirmed by user.
  - **My earlier "render-on-demand" framing was wrong.** Zane
    corrected with the observation that sea waves / springs /
    sunrise/sunset animate without user input. Tracking the
    polling loop confirmed the animation tick channels exist
    and run continuously while CON_getch "waits."

- **Found** — legacy port's WebGL architecture is well-justified:
  - Precomposed tile-index buffer per layer (Layer 0 terrain +
    object layers). Drag-scroll changes a shader uniform, not
    the buffer — cheap.
  - `AnimDataManager.update(frame)` returns Set of changed tile
    IDs; `updateFrame(frame)` walks them through `tileUsageMap`
    (reverse index) and patches only affected positions via
    `Shader.updateLayer(0, mapTileIndices, modifiedIndices)`
    sparse upload.
  - Animation ticks at 15Hz (`Math.floor(frame / 4)` on 60fps
    render loop) — matches the perceptual sweet spot for 1990
    palette/animdata cadence without over-driving.
  - I was wrong earlier to characterize the WebGL choice as
    overshoot. Zane's framing — "DOS U6 may limit the refresh
    rate of the map, but I don't see this limitation should be
    followed in the modern web browser" — settles it. Drag-scroll
    at 60Hz+ on a full-canvas viewport forces continuous viewport
    repaint regardless of animation; WebGL with instanced
    rendering of a precomposed buffer is the textbook solution.

- **Docs**:
  - Created [`research_game_loop.md`](research_game_loop.md)
    (~280 lines): game-loop body, command dispatch catalog, NPC
    tick, time-advance, input polling architecture, animation tick
    site pointer, rebuild implications.
  - Created [`research_animation.md`](research_animation.md)
    (~280 lines): three animation channels with full citations,
    cross-validation against `u6tech.txt` and legacy port,
    `tileUsageMap` pattern documented as implementation precedent.
  - Patched [`research_engine_overview.md`](research_engine_overview.md):
    items 1, 2, 3, 5, 6 of original open-questions list marked
    RESOLVED with cross-links; item 4 (seg_155D) still open;
    item 7 (conversation VM) partial.
  - Updated [`DOCUMENTATION_INDEX.md`](DOCUMENTATION_INDEX.md):
    added two new docs to Quick Navigation; updated status
    summary; added "Modern-browser UX drives render cadence"
    decision row; reframed Source-of-truth files table to cite
    by relative path only (`SRC/seg_XXXX.c`) — phoenix-clone
    convention.
  - Adopted **phoenix-clone path convention** across the project:
    absolute clone paths live only in `../CLAUDE.md` §"Source of
    truth"; research docs cite by relative name (`seg_0A33.c:1020`
    etc.). Patched `research_engine_overview.md` +
    `research_map_render.md` (both pre-existing, had a hardcoded
    `D:/tmp/` reference each) and the two new docs
    (`research_game_loop.md` + `research_animation.md`) to follow
    the convention. `research_world_data.md` was already clean.
    Added the convention statement to `../CLAUDE.md` §"Source of
    truth" so future docs follow it explicitly.
  - Patched [`../CLAUDE.md`](../CLAUDE.md):
    - §"Source of truth" — added this-PC clone path
      `C:/Z_Temp/u6_decompiled/`.
    - New §"Modern-browser UX as architectural anchor" — D2
      corollary capturing the principle that source's behavioral
      envelope (frame timing, render cadence, drag-scroll
      responsiveness) is substrate residue, not spec.

- **Open**:
  - `C_0A33_0073()` body — `D_0340`-gated path inside
    `OtherAnimations`. Possibly the animdata loop call site.
  - Animdata loop call site — tech-doc claims game.exe offset
    `0x1F28`; not yet mapped to a `seg_*.c` function. Likely
    candidate `C_0A33_0073` or sibling.
  - `C_1E0F_4B6A` / `C_1E0F_4746` / `C_1E0F_464A` / `C_1E0F_0FA9`
    / `C_1E0F_3E6A` — NPC AI internals.
  - `seg_155D.c` end-to-end — original open Q4, still pending.
  - `TALK_talkTo` + `seg_1703 execute_op` body — conversation VM
    internals.
  - `SpellFx[14]` (time-stop) gating — confirmed for palette
    cycle; need to verify whether animdata loop also skips.
  - EGA/CGA/Tandy/Hercules palette cycle equivalents in `GR_27`
    — per-driver code is out of u6-decompiled's scope.

- **Self-correction noted**: three claims in this session needed
  user-supplied correction.
  - "Render-on-demand suffices" — falsified by continuous animation
    without input (channels 1 + 2 keep going inside CON_prompt's
    idle path).
  - "WebGL is overstated" — falsified by modern drag-scroll UX
    requirements; the legacy port's WebGL choice is well-justified
    and the 15:00 note's framing was right on the conclusion.
  - "Legacy port has no obvious hybrid path" — falsified by
    `tile.js:60-80 processAnimMask`; the port DOES implement hybrid
    tiles, just in a different file than I checked, and with a
    smarter mechanism (one-shot mask + layered render) than source's
    per-tick copy.
  Pattern across all three: I grepped narrowly and generalized.
  The first two fed into the durable cross-PC principle captured in
  [`../CLAUDE.md`](../CLAUDE.md) §"Modern-browser UX as
  architectural anchor". The third is captured in the corrected
  Channel 3 section of [`research_animation.md`](research_animation.md).
  Defense pattern going forward: claims of *absence* in legacy-port
  code need a wider grep + sibling-file check before being written
  down, per the parallel principle in root CLAUDE.md §"Verify
  negative source claims (un-disasm, missing routines)."

- **Next**: pick one of (a) NPC AI internals — read `C_1E0F_0FA9`
  + related (next subsystem on the "wander Britain" min-scope
  path); (b) Conversation VM — read `seg_1703 execute_op`
  (next subsystem on the "talk to NPCs" min-scope path);
  (c) `seg_155D` status-panel — small focused close-out of the
  one remaining engine-overview open Q. Order TBD with user; all
  three are near-term valid.

## 2026-05-27 — Pillar-bug RESOLVED: layer-assignment bug in `drawObject`

- **Read**: `../ultima6/map_viewer.js:200-404` (drawObject + layer
  build + collectObjects + 4-layer composition),
  `../ultima6/map_viewer_renderer.js` (WebGL shader, 4 layers
  rendered in order 0/1/2/3), `../ultima6/obj_manager.js:109-114`
  (tile-flag definitions).
- **Confirmed bit-mapping** between legacy port and source:
  - `isTopTile() = flags2 & 0x10` ↔ source `IsTileFor`
    (`TileFlag[] & 0x10`)
  - `isDoubleHeight() = flags2 & 0x40` ↔ `IsTileDoubleV`
  - `isDoubleWidth()  = flags2 & 0x80` ↔ `IsTileDoubleH`
  - `isForceLowerTile() = flags3 & 0x04` ↔ source's `D_B3EF[] &
    TILE_FLAG2_04` (Breakthrough)
  - Bit positions exact match; flag interpretation isn't the bug.
- **Root cause** (the bug):
  `map_viewer.js:311` checks `tileFlag.isTopTile()` of the **BASE
  tile only** for layer routing. After that check passes, all
  extension tiles (`isDoubleHeight` / `isDoubleWidth` / 2×2) get
  drawn in the same layer as the base — **regardless of each
  extension's own flag**. Source's `ShowObject` instead checks
  the EXTENSION tile's `IsTileFor` for chain-position routing.
- **Identified what tile #276 is**:
  decimal 276 = 0x114 = **OBJ_114 "Steps"** (obj.h:580). At the
  Lycaeum perimeter, Steps lead up from lower terrain to the
  columned platform. Steps' base tile has `isTopTile=true` → goes
  to Layer 3 (top tiles).
- **Worked example** of the bug:
  - Pillar at (x, y): base `T_b` has `isDoubleHeight=true`,
    `isTopTile=false`; head `T_b-1` has `isTopTile=true`.
  - Legacy port: pillar base + head BOTH go to Layer 1
    (because the layer check reads the base's flag only). Pillar
    skipped in Layer 3 pass.
  - Steps at (x, y-1): base `isTopTile=true` → Layer 3.
  - Render order: Layer 1 (pillar head visible) → Layer 3
    (Steps drawn over it) → **Steps covers pillar head**.
  - Source equivalent: pillar head extension is a foreground
    tile, so `ShowObject(T_b-1, x, y-1, 1)` walks to END of the
    (x, y-1) chain → drawn LAST → pillar head on top, Steps
    underneath.
- **Minimal fix sketched** (in research doc, NOT for code-landing
  yet — still research phase):
  In `drawObject`, check `isTopTile()` per-tile during emission
  (not just on the base before the loop). Each extension tile
  independently routes to Layer 1 or Layer 3.
- **Architectural observation**: legacy's 4-layer model is a
  coarse approximation of source's per-cell chain insertion. The
  approximation works when an object's tiles share a layer, but
  breaks for objects whose extensions have different "natural"
  layer membership (pillars are the canonical case). Other
  DoubleV/H objects with mixed-flag tiles likely have similar
  bugs that just haven't been noticed yet.
- **Hypothesis status**:
  - A (tile #276 transparency): FALSIFIED — bug is layer routing,
    not pixel alpha
  - B (auto-extension fabricated): FALSIFIED (already)
  - C (not a bug): FALSIFIED — there IS a bug, both pillar head
    being visible IS source-faithful behavior
  - **NEW hypothesis D (layer-assignment for extensions):
    CONFIRMED — this is the root cause**
- **Reverse iteration in legacy** (`for(i = objects.length-1;
  i >= 0; i--)`): yes, present at map_viewer.js:359, 364, 395 for
  Layers 1 and 3. NOT source-faithful (source iterates forward),
  and NOT what causes the pillar bug. Within a single layer it
  may compensate for some other inconsistency, but it's not
  load-bearing here — the bug crosses layer boundaries, not
  within-layer ordering.
- **Docs**: extended [`research_map_render.md`](research_map_render.md)
  with a "Pillar bug — root cause resolution" section
  (~170 lines): legacy render model, drawObject bug site, flag
  bit-mapping table, worked example, minimal fix sketch,
  architectural observation. Updated DOCUMENTATION_INDEX status
  line.
- **Pillar bug research arc COMPLETE.** Decision now belongs to
  Zane: apply the minimal fix to legacy `ultima6/map_viewer.js`,
  or treat the bug as motivation for the `ultima6_clone/`
  rebuild and don't invest more in legacy. Per the original
  framing 2026-05-27: "the pillar bug fix is one
  thing, the u6_clone based on u6 decompiled is another" —
  these are still orthogonal questions.

## 2026-05-27 — Render-design discussion parked (design-phase)

- **What happened**: extended discussion of the rebuild's render
  strategy — 4-zone WebGL → 2-zone collapse → 3-buffer refinement
  with per-tile flag routing + raster-scan iteration + slot-ID
  tiebreaker. Triggered by Zane's question on layering mechanism
  after the pillar-bug fix on `ultima6_fix` confirmed the
  per-tile-flag insight applies to U6 data, not just source code.
- **Classification**: this was **design-phase**, not research.
  The substance is "how should the rebuild's render system look,"
  not "how does U6 source render."
- **Status**: design-phase, parked. Not required reading for continuing
  research-phase work here; design discussions get folded into a
  `<project>_clone/docs/` file when implementation needs them.
- **Why NOT in `research_map_render.md`**: that doc is
  currently-true source-behavior decoding (per `feedback_doc_style`).
  Adding "here's what the rebuild might do" would mix research
  output with design proposals — a category error.
- **Settled-ish (tentative, design-only)**: 3 WebGL buffers
  (background-slot grid + back-buffer + front-buffer), iterate
  visible objects in (Y asc, X asc, slot-ID asc) order, per-tile
  flag (`IsTileBa` / `IsTileFor`) routes into buffer, last-wins
  per cell via alpha-blend with one prepend trick for the
  back-buffer to match source's "non-FG insert at HEAD" rule.
  Full rationale + edge cases (item-on-chest, actor-below-beam,
  actor-on-rug, two-FG-hotspot residual ambiguity) were worked
  through in that discussion.
- **What's deferred**: atlas layout, palette handling, animation
  overlays, lighting/fog, bp06=2/3 spell effects, ECS-shape
  questions for the iteration entry point.
- **Status**: discussion at a natural pause point. Not a commitment.
  Implementation will revisit when/if implementation phase begins.
- **Next**: open. Options include (a) continuing research on
  another U6 subsystem, (b) starting a separate `ultima6_clone`
  design discussion (ECS-core specifics — entity IDs, component
  storage, query API), (c) pausing `ultima6_clone` and shifting
  to another project. All TBD.

## 2026-05-27 — Render path: pipeline decoded; pillar-bug B falsified

- **Read**: `C_0A33_09CE` (frame composer body, seg_0A33.c:350-434),
  `C_1100_0306` (Tile_11x11 + lighting + ShowObjects caller,
  seg_1100.c:144-310), `ShowObjects` (seg_1184.c:1723-1809+),
  `C_1184_35EA` (double-tile dispatcher, seg_1184.c:1702-1721),
  `ShowObject` (chain inserter, seg_1184.c:1651-1700), `SearchArea`
  /`NextArea` (iterator, seg_1184.c:345-382). Plus grep for all
  `IsTileDouble*` + `TILE_FLAG1_40|80` call sites.
- **Found** — pipeline is **two-pass per frame**:
  - **Pass 1**: `C_1100_0306` populates `Tile_11x11` (background)
    and computes lighting, then calls `ShowObjects` which iterates
    objects in the 11×11 window via `SearchArea/NextArea` (forward
    through Link[]). Each object → `C_1184_35EA` → 1-4 calls to
    `ShowObject` (hotspot + DoubleH/V auto-extensions).
  - **Pass 2**: `C_0A33_09CE` renders: per cell, blit background
    `Tile_11x11[j][i]` then walk Obj_11x11 chain forward via
    `D_E5E0[]`, blitting each tile in sequence (painter's
    algorithm — tail covers head).
- **Found** — `C_1184_35EA` is THE auto-extension mechanism:
  - DoubleH bit → also draw `tile-1` at (x-1, y)
  - DoubleV bit → also draw `tile-1` at (x, y-1)
  - Both bits (2×2 tile) → draw `tile-1`, `tile-2`, `tile-3` at
    the 3 adjacent cells
  - Hotspot passes `bp06=0`, extensions pass `bp06=1`
- **Found** — `ShowObject` is a **3-zone Z-buffer via chain
  insertion**:
  - `IsTileBa` → REPLACE Tile_11x11 (skips chain entirely)
  - Non-foreground hotspot → insert at HEAD (drawn first, covered)
  - Foreground hotspot → walk to first existing FG in chain,
    insert there
  - Foreground extension (bp06=1, IsTileFor) → walk to END,
    insert (drawn LAST, covers all)
  - Non-foreground extension → insert at HEAD
  - 256-slot shared chain pool across all 121 cells; silent drop
    if exhausted
- **Pillar bug**:
  - **Hypothesis B (port fabricates auto-extension): CONCLUSIVELY
    FALSIFIED.** Source's `C_1184_35EA` does exactly the auto-
    extension the legacy port does. The legacy is source-faithful
    here.
  - **"Top item first, reverse iteration intentional" recollection:
    partially reconciled.** Source iterates **forward** through
    Link[] AND forward through Obj_11x11 chains. Z-order is
    controlled by FG-aware **insertion position** in the chain,
    not iteration direction. The recollection seems to conflate
    OBJBLK file order with rendering order.
  - **Hypotheses A and C still depend on the legacy-port
    comparison**: does `map_viewer.js drawObject` implement the
    same FG-aware chain insertion, or does it append in
    encounter order?
- **Found-also** — a meaningful architectural divergence between
  source and legacy: source uses ONE off-screen buffer + per-cell
  chain with insertion-Z; legacy has 4-layer WebGL shader. Whether
  legacy's layer model preserves the same Z semantics is the
  open question.
- **Docs**: created [`research_map_render.md`](research_map_render.md)
  (~330 lines) with full pipeline diagram, per-pass detail,
  insertion-Z table, and pillar-bug A/B/C status.
- **Open** (for the pillar-bug resolution pass):
  1. Read `../ultima6/map_viewer.js drawObject` (~line 299).
  2. Read `../ultima6/map_viewer_renderer.js` shader composition.
  3. Read `../ultima6/obj_manager.js` per-cell resolution.
  4. Identify what tile #276 actually is (via tile viewer or
     OBJBLK inspection at Lycaeum coords).
  5. Compare insertion ordering: legacy port FG-aware or not.
- **Next**: legacy-port comparison pass. Output: a focused
  `research_pillar_bug_resolution.md` (or a "Conclusion" section
  appended to `research_map_render.md`) once items 1-5 are read.

## 2026-05-27 — maporg.htm cross-check: dungeon dims + chunk-format disagreement

- **Read**: `maporg.htm` from
  [`ZaneLogi/U6WorldEditor/doc`](https://github.com/ZaneLogi/U6WorldEditor/tree/master/doc)
  via the GitHub API. Other .txt files in that folder are
  duplicates of `../ultima6/doc/*.txt` (already read).
- **Found (useful new fact)**: dungeon levels are 32×32 chunks each
  = **256×256 tiles per dungeon level**, vs 1024×1024 for the
  overworld. Five dungeon levels. Adds a dimensional detail
  missing from earlier reads.
- **Found (contradiction)**: maporg.htm says chunks are
  `[0..1023, 0..7, 0..7] of Word` — i.e. u16 per cell, 128
  bytes per chunk, 1024 chunks. **Direct conflict with source's
  64-byte-per-chunk u8-per-cell layout** (verified twice:
  u6-decompiled `seg_101C.c:44` reads 0x40 bytes into a
  `unsigned char[8][8]` buffer; legacy `u6_chunk_viewer.js` reads
  single bytes per cell). Source wins.
- **Found (placeholder)**: maporg.htm's OBJBLK section is marked
  "I'll do it later" — no help on the object-record layout. The
  format details we already have from `C_1184_2DEF` stand.
- **Docs**: patched [`research_world_data.md`](research_world_data.md):
  added dungeon-level dimensions to world geometry; added a
  "Tech-doc disagreement worth flagging" callout under the chunks
  section explaining the maporg.htm discrepancy; expanded the
  intro's cross-check list to mention maporg.htm as a tertiary
  source.
- **Methodology note**: maporg.htm joins u6tech.txt as a tech doc
  from "the internet era" that's partially or fully wrong on
  byte-level format details. Pattern: **always verify byte
  layouts against source + a working viewer; never trust
  tech-docs alone.** Doesn't reduce the value of tech docs as
  framing (high-level world geometry was confirmed correct), only
  for byte specifics.
- **Next**: render path (unchanged from prior entry).

## 2026-05-27 — Resolved tile-ID encoding via legacy port

- **Read**: `../ultima6/u6_chunk_viewer.js` (full file),
  `../ultima6/tile.js:90-160` (getTilePixels + getTileOffset).
- **Found**: chunks file IS 1-byte-per-cell (matching source's
  `OSI_read(..., 0x40, ...)`), but each byte indexes through
  `tileindx.vga` (a 2048-entry u16 indirection table that maps
  tile-type-ID → offset in the combined `alltiles` blob). So
  chunks carry terrain (0..255 of the 2048 tile types); objects
  reach the same `tileindx` table via `BaseTile[GetType(objNum)] +
  GetFrame(objNum)` per the u6.h:285 `TILE_FRAME` macro (covering
  0..2047). One shared indirection table, two entry points.
- **Found-also**: animation overlay (`animdata` + `anim_data_manager.js`)
  rewrites `tileindx` entries for ~32 animated tiles based on
  `game_timer & and_mask`. Frame timing TBD via the render-path
  read.
- **Docs**: patched [`research_world_data.md`](research_world_data.md)
  — chunk-file entry now resolved with full indirection chain
  documented; added "Tile resolution" subsection citing both
  `seg_101C.c`, `u6.h:285 TILE_FRAME`, and the legacy
  `tile.js:96-99 getTileOffset`. Removed the "open question" entry
  for tile-ID encoding; added two new follow-ups (`BaseTile[]` load
  site, animation overlay timing).
- **Workflow note**: the legacy port's `u6_chunk_viewer.js` was
  perfect cross-check material — it works (visible chunks render
  correctly), so its file-format interpretation is implicitly
  validated. This is a NEW research input class that we should use
  systematically going forward: when a legacy `*_viewer.js` exists
  for a data file format, treat it as a tertiary source alongside
  u6-decompiled (primary) and tech docs (hint-only).
- **Next**: render path. Same as previous Next.

## 2026-05-27 — World data layer: OBJBLK + chunks + Link[] + MapObjPtr

- **Read** (tech-docs first, then source per Zane's suggested workflow):
  - Tech docs: `../ultima6/doc/investigation.txt` (Zane's prior decode
    notes — a treasure map of pre-located function addresses),
    `u6tech.txt` (Nuvie's file-format spec), `objlist.txt`,
    `schedule.txt`, `tileflag.txt`.
  - Source: `C_1184_2DEF` (read objblk, seg_1184.c:1429-1454),
    `__ObjectsDeserialize` (seg_1184.c:1370-1426),
    `C_1184_2ECC` (rebuild MapObjPtr, seg_1184.c:1456-1474),
    `C_1184_29C4` (sort comparator, seg_1184.c:1308-1341),
    `C_1184_2FB3` (leave dungeon level, seg_1184.c:1477-1521),
    `seg_101C.c:1-100` (chunk cache + `MK_MAP_ID` macro + world
    geometry ASCII art).
  - Filename templates: `__Sav_file = "savegame\\objblkaa"`,
    `__Tmp_file = "savegame\\objblkaa.tmp"` (seg_1184.c:31-32).
- **Found**:
  - **World geometry**: 1024×1024 tiles, divided into 8×8 = 64
    regions of 128×128 tiles (60 active per the seg_101C ASCII
    art). Z: 0=overworld, 1..5=dungeon levels.
  - **OBJBLK file format**: u16 count (capped 0xC00) + N×8-byte
    records (`ObjStatus 1 + ObjPos 3 + ObjShapeType 2 + Amount 2`).
    64 overworld files `objblkAA..objblkHH` + 5 dungeon files
    `objblkAI..objblkEI`. `.tmp` variants for in-flight modified
    copies, tracked by `D_065C[64]`.
  - **Slot-ID space**: 0..0xFF reserved for NPCs (loaded once from
    savegame `objlist`), 0x100..0xCFF for world objects (loaded
    per-area from OBJBLK).
  - **Link[] dual-use**: global sorted linked-list (active objects)
    AND free-list (inactive slots, head = `D_D5DA`, count =
    `D_E6E0`). Head sentinel at `Link[0x100]`.
  - **Sort order** (`C_1184_29C4`): primary Y asc, secondary X asc,
    **tertiary Z DESC** (reversed operands). Same (x,y,z) = tied,
    merge-sort fall-through. Containers/inventory unwind via
    `GetAssoc()` to compare by the outermost holder's position.
  - **MapObjPtr[40][40]**: per-cell head pointer; rebuilt by
    `C_1184_2ECC`; stores only the FIRST object encountered in
    Link[] order at each cell. To iterate all objects in a cell:
    walk Link[] forward from MapObjPtr[y][x] until (X,Y) changes
    (same-cell objects are contiguous because of the sort).
  - **Chunk cache** (tile-layer, separate from OBJBLK): 16-slot
    LRU cache of 8×8-byte chunks; 4 region chunk-maps loaded at a
    time (`D_05D2[4]`).
  - **Tile-flag comment-vs-macro mismatch in u6.h** confirmed by
    `tileflag.txt`: bit 0x40 = vertical-doubling (the macro
    `IsTileDoubleV` is correctly named; u6.h's comment above the
    bit define is swapped). Fixed in
    [`research_engine_overview.md`](research_engine_overview.md).
  - **seg_1703 = conversation engine** (talkdr opcode VM), seg_16E1
    = `TALK_initTalk` — per `investigation.txt`. Updated those
    rows in `research_engine_overview.md` from "low confidence"
    to "high."
- **Docs**:
  - Created [`research_world_data.md`](research_world_data.md) (~330
    lines) — full data-layer spec with the OBJBLK file format,
    chunk-cache strategy, Link[]/MapObjPtr architecture, sort
    order, containment rebuild, sav/tmp atomicity, and
    pillar-bug implications.
  - Patched [`research_engine_overview.md`](research_engine_overview.md):
    fixed IsTileDoubleV/H bits (had them swapped per u6.h's wrong
    comments), upgraded seg_1703 + seg_16E1 confidence from low to
    high with citations to `investigation.txt`.
  - Updated [`DOCUMENTATION_INDEX.md`](DOCUMENTATION_INDEX.md).
- **Found wrt pillar bug**:
  - **Hypothesis B trending NO** (not a port fabrication): each
    OBJBLK record holds ONE object at ONE (x,y,z); the "double-
    height" comes from the tile's `IsTileDoubleV` flag, not from
    multiple object records. Legacy port reading the same flag
    would be source-faithful.
  - **Zane's "top item first, reverse iteration intentional"
    recollection** is partially questionable: the comparator
    ties same-Z objects (no defined order). Either (a) the
    OBJBLK on-disk file order matters and the merge-sort is
    stable (preserving file order on ties), or (b) the
    recollection conflates file order with renderer iteration
    direction. Resolution needs the renderer read.
- **Open**:
  - Tile-ID encoding in chunks (1-byte cells vs 2048 total tile
    types) — likely chunks store terrain only (0..255), objects
    come via OBJBLK + `ObjShapeType` (10-bit type, up to 1024).
    Verify via renderer.
  - Merge-sort stability in `__ObjectsDeserialize`.
  - `AddObj` / `AddMapObj` / `AddInvObj` bodies — runtime object
    adds.
  - `LoadNewRegions` / `C_1184_3B1D` init bodies.
  - Where NPC slots are populated from savegame `objlist`.
- **Next**: render path. Targets: `C_0A33_09CE(bp06)` (on/off-screen
  draw), `C_1184_35EA(tile, frame, x, y)` (tile-frame blitter),
  `IsTileDoubleV/H` caller sites, Link[] iteration direction in
  render. Output: `research_map_render.md` resolving pillar-bug
  A/B/C.

## 2026-05-27 — Scout of SRC/: subsystem map

- **Read**:
  - All 7 headers: `u6.h` (633L), `obj.h` (1483L; 432 OBJ_* + commented
    432-1023 reserved), `tile.h` (479L; TIL_* with friendly names),
    `gr.h` (70L), `ai.h` (68L), `cmd.h` (82L), `spells.h` (117L),
    plus `seg_3522.h`/`seg_356A.h`/`D_2C4A.h`.
  - `main()` body at `seg_0903.c:426-619`.
  - Function-definition grep across all `seg_*.c` files.
  - Module-routing comments inside `u6.h` annotating which globals
    live in which `seg_*` module.
  - GR\_\* call density per file (proxy for "is this file a renderer?").
- **Found**:
  - Engine is **320×200**, driver-dispatched (VGA/EGA/Tandy/CGA/
    Hercules switch in main).
  - **Map viewport is 11×11 tiles** (`Tile_11x11[11][11]` +
    `Obj_11x11[11][11]` at u6.h:554,556). Working tile area is
    `AREA_W=40, AREA_H=40` (u6.h:281-282) — the 40×40 is the
    engine's composition area; only 11×11 is visible at any time.
  - **Graphics is vptr-dispatched through `D_ECB8`** (`gr.h`). The
    engine calls `GR_2D(tile,x,y)` / `GR_42` / `GR_18` / `GR_45` /
    `GR_48` macros; the driver-specific pixel code is loaded from a
    separate file into `D_ECC4->_06` at startup (seg_0903.c:528
    `LoadFile("U6.CH")`). **Per-driver code NOT in u6-decompiled
    scope** (upstream README: "other executables decompiled but not
    yet released").
  - **Game loop is `C_0A33_1CB4()`** at seg_0A33.c:1020, called from
    seg_0903.c:617 with explicit `/*-- game loop --*/` comment.
  - **`C_0A33_09CE(int bp06/*0:offScreen,1:onScreen*/)`** at
    seg_0A33.c:350 — draws to backbuffer or screen, prime candidate
    for the per-frame map composer.
  - **`C_1184_35EA(int tile, int frame, int x, int y)`** at
    seg_1184.c:1702 — the tile-frame blitter signature.
  - **`IsTileDoubleH(tile)` / `IsTileDoubleV(tile)`** are explicit
    tile flags (u6.h:223-224, bits 0x40/0x80 of `TileFlag[]`).
    Engine reads double-height from the tile's flag table; doesn't
    fabricate it from object number.
  - **CURSED/MUTANT/HATCHED really do alias 0x40 in source**
    (u6.h:80-82). Legacy port `obj.js:9-11` is faithful to source;
    semantics are dispatched at call site via object type, not bit
    position. Need to read those dispatch sites.
  - **Global-state is flat parallel arrays indexed by `objNum`** —
    `ObjStatus[]`, `ObjPos[]`, `ObjShapeType[]`, `Amount[]`,
    `NPCStatus[]`, `NPCFlag[]`, etc. Isomorphic to ECS sparse-set
    layout — Q1 A-grid + per-object component arrays is the natural
    JS mapping.
- **Docs**:
  - Created [`research_engine_overview.md`](research_engine_overview.md)
    with subsystem map (21 rows for `seg_*` + headers), screen
    geometry, global-state architecture, and 7 follow-up questions
    targeted at the map-render path.
  - Updated [`DOCUMENTATION_INDEX.md`](DOCUMENTATION_INDEX.md) Quick
    Navigation table.
- **Open** (for next session):
  1. Read `C_0A33_1CB4()` body — game-loop structure.
  2. Read `C_0A33_09CE(bp06)` — confirm map composer.
  3. Read `C_1184_35EA(tile, frame, x, y)` — tile-frame blitter
     details.
  4. Read seg_155D.c end-to-end — confirm status-panel vs map render.
  5. Find OBJBLK iteration path — grep for `MapObjPtr[`, `Obj_11x11[`
     loops in seg_0A33 / seg_1184.
  6. Trace `IsTileDoubleH`/`IsTileDoubleV` callers.
  7. Locate the conversation VM (candidates: seg_1184, seg_27a1).
- **Next**: pick one of opens 1-3 (start with the game-loop body so
  the rest hangs on a frame structure we understand). Write up
  `research_map_render.md` once items 1-6 above are read.

## 2026-05-27 — Research phase begins; folder skeleton

- **Phase transition**: discussion → research, per local memory
  `feedback_project_phases`. Discussion-phase outputs (Pure ECS,
  A-grid terrain, packed Status byte, graphics-first sequencing —
  summarized in [`../CLAUDE.md`](../CLAUDE.md) "Architecture choice")
  are now provisional inputs into research, not locked decisions.
  Zane's framing: *"we get more data in the research phase so we
  can discuss how the project will look like not just blah blah
  blah without the support of the reality."*
- **u6-decompiled cloned** to `D:/tmp/u6_decompiled/` (1.1 MB, full
  clone — too small to bother with sparse-checkout). Upstream:
  <https://github.com/ergonomy-joe/u6-decompiled> (2022/03/29).
  Repo shape: `SRC/seg_XXXX.c` Borland Turbo C 2.0 segments + `.h`
  headers (ai, cmd, gr, obj, spells, tile, u6) + `BSS.ASM` data +
  `OSILIB/` low-level asm.
- **Folder skeleton created** (this commit, when it lands):
  `ultima6_clone/CLAUDE.md` + `docs/Journal.md` +
  `docs/DOCUMENTATION_INDEX.md`. No `research_*.md` files yet — they
  land as reading happens.
- **Open**:
  - What does the in-game map render actually do? (Driving question:
    is `../ultima6/map_viewer.js`'s `drawObject` correct against
    Origin's actual draw routine?)
  - Where is the main game loop / per-frame dispatch in
    `SRC/seg_XXXX.c`? Need to find the entry point before any
    subsystem reading makes sense.
  - How are objects iterated for draw within a tile cell? (The
    pillar-bug investigation surfaced "reverse iteration is
    intentional per OBJBLK convention" as Zane's recollection —
    research should confirm this against u6-decompiled.)
- **Next**: scout `SRC/` to map seg_XXXX files to subsystems —
  identify which segments hold map rendering, main loop, object
  manager, conversation VM. Capture findings as a first
  `research_engine_overview.md` (or similar) once enough is read
  to write something currently-true.
