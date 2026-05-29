# Research: U6 engine — subsystem overview

**Status:** first-pass subsystem map from a single reading session
(2026-05-27). Citations use relative paths within the u6-decompiled
clone (e.g., `seg_0903.c:426`). The clone's absolute path is
per-PC; see [`../CLAUDE.md`](../CLAUDE.md) §"Source of truth".
Function-body interiors are NOT yet read — claims below are based
on signatures, call sites, header declarations, comments, and grep
counts. Each row needs a deeper follow-up pass before relying on it
for implementation decisions.

## Entry point

`main()` is at `seg_0903.c:426` as `C_0903_0C5E` (the Borland Turbo
C compiler stamps function names
with their segment+offset). Body length: ~200 lines.

Main() responsibilities, in order:
1. RNG seed + config file parsing (`OSI_randomize`, `cfg_parse`).
2. Big farmalloc-grab of all remaining far memory into `D_B3F3`
   (seg_0903.c:443-447) — the engine's entire heap.
3. `DISK_init()` / `OSI_delay_init()` setup.
4. **Per-driver screen layout** (seg_0903.c:454-523): branches on
   `D_01C8 == 0..4` for VGA / EGA / Tandy / CGA / Hercules. Sets
   `Screen.segment`, `Screen.pScanlines`, and a parallel
   off-screen buffer `D_9E3D`. Screen is 320×200 (left=0, right=319,
   top=0, bottom=199); `D_9E3D` off-screen is 160×160.
5. Graphics driver init: `C_2FC1_000A(D_01C8)` at seg_0903.c:524
   ("init gr") — this loads the actual driver-specific code into
   `D_ECC4->_06` and sets the function-pointer table `D_ECB8`.
6. Music init: `MUS_0A3A(D_01CA, D_01CC)` at seg_0903.c:525.
7. **Console clip-rects** at seg_0903.c:530-537: `CON_createClip` for
   three rects:
   - `D_B6B5[0]`: full text grid 0,0..39,24 (40 cols × 25 rows)
   - `D_B6B5[1]`: 22,1..38,12 (status / portrait)
   - `D_B6B5[3]`: 22,14..38,23 (text scroll / messages)
   These imply the screen layout: **map viewport left, status +
   message console right.**
8. World-state malloc (seg_0903.c:539-577): `TerrainType` (2KB),
   `TileFlag` (2KB), `BaseTile` (2KB int), `TypeWeight` (1KB),
   `D_B3EF` (2KB), `ScratchBuf` (30KB scratch surface),
   `Schedule` (600 × tSchedule), `NPCMode` / `NPCComMode` /
   `SchedIndex` / `Leader` / `NPCFlag` / `OrigShapeType` / `Level`
   (256 each), `D_8C42` (256, palette per comment), `D_B7A4` (1.5KB),
   `TalkBuf` (10KB).
9. World-init: `C_1184_3B1D()` (seg_1184.c:1849) — major init, in
   the seg I'm calling the object/composition module.
10. Cursor + button-strip drawn directly: `GR_2D(TIL_190+i, 8+i*16,
    176)` for 9 buttons + `GR_2D(TIL_19E, 152, 176)` floppy button
    at y=176 (= 11 tiles × 16 px, just below the map viewport).
11. `C_101C_052D()` (map-chunk init) + `C_0C9C_042A()` ("load game?"
    per comment).
12. Animation init loop: `GR_4B(D_67E4[si], D_9DF5[si])` per
    `NumAnimData`.
13. Character-existence check + bail (seg_0903.c:594-604): if no
    character, prompt + execl back into self.
14. `C_1E0F_512A()` (NPC/path init) + `C_0A33_1355(0)` (advance time
    by 0 = initial state stamp) + `COMBAT_begin()` or `MUS_09A8()`.
15. **Game loop entry**: `C_0A33_1CB4()` at seg_0903.c:617, with
    explicit comment `/*-- game loop --*/`.

## Screen geometry

Confirmed from `main()` + `u6.h`:

- **Screen**: 320×200 pixels, character grid 40 cols × 25 rows
  (8×8 char cell).
- **Map viewport**: 11×11 tiles × 16 px = 176×176 px, on the left
  side of the screen (top-left at 0,0). Backing data structures:
  `Tile_11x11[11][11]` (u6.h:554) and `Obj_11x11[11][11]` (u6.h:556).
- **Status / portrait panel**: text-grid cols 22-38, rows 1-12
  (`D_B6B5[1]`). Roughly 17×12 char cells = 136×96 px.
- **Message console**: cols 22-38, rows 14-23 (`D_B6B5[3]`). Same
  width × 10 rows.
- **Button strip**: y=176 (below map viewport), 10 buttons at
  (8+i×16, 176) for `TIL_190..TIL_198` + `TIL_19E` at (152, 176).
- **Working area (NOT viewport)**: `AREA_W 40, AREA_H 40` (u6.h:281)
  + `AreaTiles[40][40]` (u6.h:489) + `AreaFlags[40][40]` (u6.h:492)
  + `AreaLight[40][40]` (u6.h:502) + `MapObjPtr[40][40]` (u6.h:555).
  This is a **40×40 working tile area** — the engine composes/AI's
  within this larger area, then the 11×11 viewport reads from a
  centered window into it.

The 11×11 viewport is the answer to "small visible screen area" Zane
mentioned as a DOS-era limitation we
should not carry into the JS port. The 40×40 work area is the
engine's actual model.

## Subsystem map

Mapping from `seg_XXXX.c` files to subsystems. Confidence noted per
row:

| Seg file | Lines | Subsystem | Confidence | Key evidence |
|----------|------:|-----------|:----------:|--------------|
| `seg_0903.c` | 627 | **Startup + main() + global-state declarations** | **high** | `main()` here; hosts globals per u6.h "module seg_0903" comments (Mouse, Names[], Leader, INTEL/STREN/DEXTE, NPCMode, NPCFlag, ObjStatus, NPCStatus, AreaTiles, etc.) |
| `seg_0A33.c` | 1405 | **Game loop + per-frame composition** | **high** | `C_0A33_1CB4()` IS the game loop (called from main with explicit `/*-- game loop --*/` comment); `C_0A33_09CE(int bp06/*0:offScreen,1:onScreen*/)` is a draw-to-backbuffer-or-screen function; `C_0A33_1355(int minutes)` advances time |
| `seg_0C9C.c` | 1976 | **Console / text I/O** (`CON_*`) **+ save/load orchestration** | **high** | `CON_atoi`, `CON_printf`, `CON_setClip`, `CON_createClip`, `CON_getch` are all `C_0C9C_*` per extern decls in u6.h. Also hosts the savegame core: `C_0C9C_089F` save, `C_0C9C_0397` restore, `C_0C9C_042A` load-body — decoded in [`research_save_load.md`](research_save_load.md). |
| `seg_101C.c` | 498 | **Map-chunk cache + tile lookup** | **high** | u6.h comment "module seg_101c" annotates `D_B784`/`D_B7A4`/`D_B7A8`/`D_B7C8` (chunks cache, 16 entries × 8×8 tiles); `GetTileAtXYZ = C_101C_0DC9` exposed in u6.h:333 |
| `seg_1100.c` | 310 | **Area-coord helpers** (likely AreaTiles read/write) | medium | u6.h "module seg_1100" comment hosts `D_BBCC[256]`/`D_BCCC[256]`/`AreaOffset`; tiny `__1100_009F(x, y)` at seg_1100.c:71 |
| `seg_1184.c` | 1933 | **Map + object composition + inventory + pathing** | medium-high | u6.h "module seg_1184" hosts `MapObjPtr[40][40]`, `Tile_11x11`, `Obj_11x11`, Equipment, Inven, NPC_1Hand, Spellbook, SpellList, **PTH_*** path globals, **PartyGravityX/Y**, **EnemiesGravityX/Y**; `C_1184_35EA(int tile, int frame, int x, int y)` is the tile-frame blitter; `C_1184_3B1D()` is the major init called from main; many xyz-coord functions |
| `seg_155D.c` | 668 | **Likely status-panel / portrait / inventory render** | LOW-medium | 20 `GR_*` calls but mostly `int objNum` / `int objType` params (not `int x, int y` map coords); needs body read to confirm vs. main-viewport render |
| `seg_16E1.c` | 88 | **Conversation `TALK_initTalk`** | **high** | Per `ultima6/doc/investigation.txt`: `TALK_initTalk (11)` initializes `VarStr` and `VarInt` for the conversation VM in `seg_1703` |
| `seg_1703.c` | 1206 | **Conversation engine (talkdr) — opcode VM** | **high** | Per `ultima6/doc/investigation.txt`: `LeaveParty (246)`, `execute_op (714)` (bytecode dispatcher); pairs with `seg_16E1.c TALK_initTalk (11)` for VarStr/VarInt init |
| `seg_1944.c` | 2642 | **Spells** | high | many `int spellNum` / `int spellnum` params; aFlag pattern common to spell dispatchers; this is the spell module |
| `seg_1E0F.c` | 2295 | **NPC AI / path / motion** | **high — decoded** | The "NPCTracker" module. AI tick `C_1E0F_4E0A` (move-point round scheduler), per-mode dispatcher `C_1E0F_3E6A`, schedule transitions `C_1E0F_5165` + `__AtDestination`, bucket-Dijkstra pathfinding `C_1E0F_2D37`. Full decode in [`research_npc_ai.md`](research_npc_ai.md). |
| `seg_2337.c` | 2134 | **Combat** | high | `C_2337_0B99(int att_objNum, int *pX_dest, int *pY_dest, int weap_objNum)` signature is unambiguous combat resolution; `C_2337_1A99(int bp08, int bp06/*disolve/rob flag*/)` |
| `seg_27a1.c` | 3162 | **Game actions / object-type dispatch** (Look/Get/Drop/Move/Use) | **high — decoded** | The five world-interaction handlers (`C_27A1_0C67` look, `C_27A1_18F5` get, `C_27A1_14DA` drop, `C_27A1_1E8B` move, `C_27A1_6179` use). Use is a ~40-case `switch(GetType)` object-type dispatch. Shared target→validate→apply→recompose pipeline. Full decode in [`research_object_interaction.md`](research_object_interaction.md). |
| `seg_2E2D.c` | 384 | **Monster class dispatch** | medium | only static seen: `C_2E2D_00BE(int objNum, int objClass)`; pairs naturally with seg_3522's monster-class data |
| `seg_2F1A.c` | 423 | **Music driver wrapper** (`MUS_*`) | high | u6.h "module seg_2f1a" comment annotates `D_ECA0..D_ECB4` MIDI/music driver pointer; all functions prefixed `MUS_*` |
| `seg_2FC1.c` | 950 | **Graphics driver wrapper + map-effect overlays** | high | u6.h "module seg_2fc1" comment annotates `D_ECB8` (the GR_* vptr) + `D_ECBC[4]` clipping rect + `D_ECC4` (struct tGr*); `Explosion`/`MagicWind` named in u6.h:335-336 as `C_2FC1_10D2/11EB`; 30 `GR_*` calls (highest count) |
| `seg_3200.c` | 452 | **Init / misc utility** | low | several small static helpers; needs read |
| `seg_32C3.c` | 200 | **Disk-swap UI** (`DISK_*`) | high | all functions prefixed `DISK_*`; u6.h:346 `DISK_confirm = C_32C3_0097`; u6.h "module seg_32c3" comment annotates DOS version vars |
| `seg_3522.c` | 354 | **Monster-class data tables** | high | seg_3522.h declares `D_3522_0242[]` (class-flag bitfield); `IsMonster_*` macros (acid / amphibious / splits / drags / immortal); pure data |
| `seg_356A.c` | 83 | **Message string constants** | high | seg_356A.h declares all gameplay-text constants (`KiledMsg`, `OutOfArrowsMsg`, `ArrestMsg`, etc.); pure data |
| `D_2C4A.c` | 55 | **Savegame state block** | high | D_2C4A.h declares the contiguous savegame globals (`Time_H`, `MapX/Y/Z`, `KARMA`, etc., ending at `__2CCC end marker`); pure data |
| `padding.c` | 8 | **Linker padding** | high | 8 lines |
| `BSS.ASM` | 6629 | **Uninitialized data declarations** | high | huge declarative file for the bss segment |
| `SEG_155X.ASM` | 141 | **ASM bits paired with seg_155D** | low | naming suggests it's a hand-written asm tail for the seg_155X module |

## What's NOT here

Things we'd expect in a U6 engine that are NOT visible at this level
(they live in the OSILIB/ asm sub-library, the loaded graphics
driver, or aren't in u6-decompiled's scope):

- VGA / EGA / CGA / Tandy / Hercules pixel-level draw code. Loaded
  from a separate file into `D_ECC4->_06` (graphics driver vptr) at
  startup — see seg_0903.c:524 + the comment at seg_0903.c:528
  about `LoadFile("U6.CH")`. The driver code is NOT in u6-decompiled
  per upstream README ("I have also decompiled most of the other
  executables, but I have to make the code more readable before
  releasing it").
- Sound generation: `OSILIB/SOUND1-5.ASM` hold the driver primitives;
  `seg_2F1A.c` is the wrapper.
- Mouse / keyboard / file I/O / LZ decompress: `OSILIB/MOUSE.ASM`,
  `KBD.ASM`, `OSI_FILE.ASM`, `INFLATE.ASM`.
- The conversation VM bytecode interpreter — NOT yet located. Some
  conversation-related vars (`TalkBuf`, `TalkFlags`, `IsInConversation`)
  are in u6.h:408,503,461 but the VM dispatch hasn't been pinpointed.
  Likely lives in seg_1184 or seg_27a1 — TBD.

## Global-state architecture (high level)

The engine is built around **flat parallel arrays indexed by
object-number** — a classic 1990 C pattern, NOT C++ objects.
Confirmed examples from u6.h:

- `ObjStatus[objNum]` — packed status byte (OWNED, INVISIBLE,
  CHARMED, LOCAL, CURSED|MUTANT|HATCHED [overloaded on 0x40],
  LIT + LOCXYZ/CONTAINED/INVEN/EQUIP coord-use bits 0x18)
- `ObjPos[objNum]` — 3-byte coord packing 10-bit X + 10-bit Y +
  4-bit Z (`GetCoordX/Y/Z` macros at u6.h:256-258)
- `ObjShapeType[objNum]` — 16-bit type+frame (low 10 bits = type,
  high 6 bits = frame; `GetType/GetFrame` macros)
- `Amount[objNum]` — quantity (low byte) + quality (high byte);
  `GetQuan/GetQual` macros
- `NPCStatus[objNum]` — combat transients (PROTECTED, PARALYZED,
  ASLEEP, POISONED, DEAD, PLRCONTROL) + alignment bits 0x60
- `NPCFlag[objNum]` — direction (low 3 bits) + bk-alignment +
  skip-test / dragged-under / walking
- `NPCMode[objNum]` / `NPCComMode[objNum]` — AI mode (values in
  `ai.h`: AI_FOLLOW, AI_COMMAND, AI_FRONT, AI_SCHEDULE, AI_FINDPATH,
  AI_STAND_N/E/S/W, AI_WANDER, AI_LOITER, AI_SLEEP, AI_FARM, etc.)
- `HitPoints[]`, `STREN[]`, `DEXTE[]`, `INTEL[]`, `MAGIC[]`,
  `ExpPoints[]`, `Level[]`, `MovePts[]` — RPG stats, all flat arrays
- `Schedule[]` (600 entries of `tSchedule{time, action, xyz}`),
  `SchedIndex[npcId]` indirection

**Implication for the rebuild's Pure-ECS hypothesis**: U6's
parallel-arrays-indexed-by-objNum is **isomorphic to an ECS
sparse-set layout** where each "Status / Position / NPCStatus /
NPCFlag" array is a component. The discussion-phase A-grid
decision (terrain as Uint16Array + tiles as singleton resource;
items / NPCs as entities) lines up with how source organizes it:
terrain (`TerrainType[]`, `TileFlag[]`, `BaseTile[]`,
`TypeWeight[]`) is keyed by tile-type ID, not object ID; the
per-object arrays are keyed by object ID. Source's data layout
already validates that decision **for the terrain split**. Whether
per-object data should be Pure ECS or B-packed (legacy `obj.js`
shape) is a separate question — research pending.

## What we know about flags vs. how the legacy port handles them

Several legacy-port observations from the earlier pillar-bug
investigation are now grounded in source:

1. **CURSED / MUTANT / HATCHED all alias to 0x40 in u6.h:80-82.**
   This is intentional in source — bit 0x40 means different things
   per object type (curse for items, mutation for plants, hatched
   for eggs). `IsCursed(i)`, `IsMutant(i)`, `IsHatched(i)` all
   return the same bit; the engine dispatches semantics via object-
   type checks at the call site (not yet read).

   The legacy port's `ultima6/obj.js:9-11` mirror of this is
   **faithful**, not buggy in itself. It's only a problem if the
   *port* wants per-type disambiguation, which would require
   per-call-site type dispatch — same as source.

2. **`IsTileDoubleV(tile)` and `IsTileDoubleH(tile)` are explicit
   tile flags** (u6.h:223-224). Macros read `TileFlag[tile]` bits:
   **bit 0x40 = `IsTileDoubleV`** (vertical-size doubling) and
   **bit 0x80 = `IsTileDoubleH`** (horizontal-size doubling).

   ⚠️ **u6.h has a comment-vs-macro mismatch here**: the
   `/*[Double] horizontal*/` comment sits above `TILE_FLAG1_40`
   (0x40), and `/*[Double] vertical*/` sits above `TILE_FLAG1_80`
   (0x80) — these comments are SWAPPED relative to the macros
   below them. Independent confirmation that the macros are
   correctly named (and the comments wrong): `tileflag.txt` in
   `../ultima6/doc/` (a Nuvie-derived tech doc) says "bit 6
   vertical size, bit 7 horizontal size," which matches the macros
   (0x40 = bit 6 = V, 0x80 = bit 7 = H).

   This answers the pillar-bug "is double-height fabricated by our
   port?" question (hypothesis B): the engine reads double-height
   from `TileFlag[tile]` bit 0x40, source-faithful behavior.
   Whether the legacy port reads the same flag is a follow-up
   read. Pillars (tall objects) should set DoubleV (bit 0x40).

3. **OBJBLK iteration order** (the "top item first, reverse-iterate
   to draw bottom-then-top" rule from the pillar-bug note): not yet
   located in source. The natural place to look is the map render
   path — likely in seg_0A33 (game loop / per-frame composition)
   or seg_1184 (object composition).

## Open questions for follow-up research

The original 7 follow-up items targeted at the map-render path have
been mostly addressed by subsequent research:

1. ~~**Read `C_0A33_1CB4()` body**~~ — **RESOLVED** in
   [`research_game_loop.md`](research_game_loop.md). Turn-based
   blocking loop with three-phase command dispatch + per-action
   NPC tick.
2. ~~**Read `C_0A33_09CE(int bp06)`**~~ — **RESOLVED** in
   [`research_map_render.md`](research_map_render.md). Per-frame
   map composer.
3. ~~**Read `C_1184_35EA(int tile, int frame, int x, int y)`**~~ —
   **RESOLVED** in [`research_map_render.md`](research_map_render.md).
   Double-tile auto-extension via `tile-1/-2/-3` to (x-1,y),
   (x,y-1), (x-1,y-1).
4. **Read seg_155D.c** end-to-end — STILL OPEN. Likely status-panel
   / portrait / equipment render (callers in `CON_getch`'s
   CMD_91/92/9F/A0/A7/A8 UI handlers + `RefreshStatus`'s
   `C_155D_*` calls), but body not read.
5. ~~**Find OBJBLK iteration**~~ — **RESOLVED** in
   [`research_map_render.md`](research_map_render.md). `ShowObjects`
   walks the 11×11 window via `SearchArea`/`NextArea` forward
   through `Link[]`.
6. ~~**Trace `IsTileDoubleH` / `IsTileDoubleV` callers**~~ —
   **RESOLVED** in [`research_map_render.md`](research_map_render.md).
   `C_1184_35EA` is THE call site.
7. ~~**Locate the conversation VM**~~ — **RESOLVED** in
   [`research_conversation_vm.md`](research_conversation_vm.md). Full
   end-to-end decode: `TalkDriver` entry + ask/answer outer loop,
   `parse_statement` statement read, `execute_op` ~30-opcode dispatcher,
   `parse_factor` RPN expression evaluator. Conversation data in
   `converse.a` / `converse.b` LZW-compressed lib_32 files. Legacy
   port `../ultima6/script.js` (~1300 lines) is a substantial existing
   implementation usable as a starting point for the rebuild.

Additional follow-ups surfaced by the game-loop and animation reads
(see [`research_game_loop.md`](research_game_loop.md) §"Open questions"
and [`research_animation.md`](research_animation.md) §"Open questions"
for full lists):

- `C_0A33_0073()` body — the `D_0340`-gated path inside
  `OtherAnimations`. Possibly the animdata loop's call site.
- ~~`C_1E0F_4B6A` / `C_1E0F_4746` / `C_1E0F_464A` / `C_1E0F_0FA9` /
  `C_1E0F_3E6A` — NPC AI internals~~ — **RESOLVED** in
  [`research_npc_ai.md`](research_npc_ai.md). The AI tick
  (`C_1E0F_4E0A`), per-mode dispatcher (`C_1E0F_3E6A` — note
  `C_1E0F_0FA9` is just the corpser-drag gate, not the dispatcher),
  schedule transitions (`C_1E0F_5165` + `__AtDestination`), and
  bucket-Dijkstra pathfinding are all decoded.
- `C_1944_4C2F` (Cast) and the six `C_27A1_*` action handlers —
  per-command implementations.
- ~~`TALK_talkTo` + `seg_1703 execute_op` body~~ — **RESOLVED** in
  [`research_conversation_vm.md`](research_conversation_vm.md).
- Animation loop call site for `tile_to_animate[]` iteration —
  tech-doc claims game.exe offset `0x1F28`; not yet mapped to a
  `seg_*.c` location.

## Things to verify before relying on this doc

Per `feedback_research_docs_layout` and the root-CLAUDE.md
sub-agent verification discipline (agents can write confidently
wrong docs; same for the lead author): the rows above marked
**medium** or **low** confidence have not been confirmed by reading
function bodies. Before any implementation decision rests on a
specific row, re-derive it by reading the named functions.

Specifically:
- **seg_155D** placement as status-panel renderer is a hypothesis
  based on signature patterns + GR\_\* density, not a verified
  claim. Could turn out to be a partial map renderer.
- **seg_27a1** as "game actions" is a guess from size +
  parameter shapes. Body read needed.
- **seg_1184** owning the conversation VM is unverified.
- **seg_1703** has no confident assignment.
- **seg_2E2D** could be monster spawning, monster AI dispatch, or
  something else.

These get resolved in follow-up research docs as they become
load-bearing for a specific question.
