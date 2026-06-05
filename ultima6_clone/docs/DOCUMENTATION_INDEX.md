# ultima6_clone — Documentation Index

**Status & step ledger:** see [progress.md](progress.md) top banner — the single source
of truth (this index is the **navigation map**, not a status mirror; convention in
`progress.md §"Doc maintenance"`). As of 2026-06-05: **I-12 (dialog window) complete; next
I-13 (conversation VM).** The ECS runtime ground is specified in
[architecture_ecs.md](architecture_ecs.md) (implemented in `ecs/world.js`); the research
docs below remain the subsystem truth.

This index will be populated as research docs accumulate. Shape
matches sibling projects (asteroids_clone, phoenix_clone) — Quick
Navigation table, Architecture Overview, Cross-Document Reference
Map, key port-side decisions, open items.

---

## Quick Navigation

### Research docs (under `docs/`)

| Document | Focus | Length |
|----------|-------|--------|
| [research_engine_overview.md](research_engine_overview.md) | Subsystem map — `seg_*.c` → subsystem assignments + entry point + screen geometry + global-state architecture; follow-up questions partially resolved by `research_game_loop.md` + `research_animation.md` | ~260 lines |
| [research_world_data.md](research_world_data.md) | World data layer — OBJBLK file format, chunk-cache strategy, Link[] sorted+free-list, MapObjPtr per-cell index, slot-ID space, sort comparator + **file-order tie-break via `__ObjectsDeserialize` merge inner-while-loop**, containment rebuild, sav/tmp atomicity, **runtime chain-head insertion (`AddMapObj` / `MoveObj`)**, **clone `SpatialIndex` correspondence (`insert` vs `insertAtHead`)**. | ~530 lines |
| [research_map_render.md](research_map_render.md) | Map render path — two-pass pipeline (build Tile_11x11/Obj_11x11 chains → blit forward), `C_1184_35EA` double-tile auto-extension via `tile-1/-2/-3`, `ShowObject` 3-zone Z-buffer via FG-aware chain insertion, `C_0A33_09CE` frame composer. Pillar bug resolved. **Painter's algorithm section** documents the clone's 4-zone bucketed pass + 4-anchor gather + type-priority NPC override + within-tier reverse-iter (matching source's "first-inserted ends up drawn-last = on top"). | ~960 lines |
| [research_game_loop.md](research_game_loop.md) | Game loop + input dispatch — `C_0A33_1CB4` turn-based blocking structure, three-phase command dispatch (keystroke→CMD_* translation + party/solo + action), `C_1E0F_4E0A` NPC tick with MovePts/DEXTE time-slicing, `C_0A33_1355` time-advance, CON_getch→C_0C9C_1D59→CON_prompt input polling chain. Identifies CON_prompt's idle path as the animation tick site. | ~280 lines |
| [research_animation.md](research_animation.md) | Animation channels — three independent mechanisms: (1) hardware VGA palette cycling via `PaletteAnimation` for fires/braziers/BluGlo/cauldrons in slots 0xE0-0xFB; (2) animdata tile-pointer rewriting for water/fountains/flags/NPCs/protection-fields (29 entries with `tile_to_animate`/`first_anim_frame`/`and_mask`/`shift_value`); (3) hybrid tiles for coast/river banks. Cross-validated against `u6tech.txt` §"Animation" and legacy `anim_data_manager.js` + `map_viewer.js:updateFrame`. Documents the legacy port's `tileUsageMap` sparse-update pattern as implementation precedent. | ~280 lines |
| [research_conversation_vm.md](research_conversation_vm.md) | NPC conversation VM (`talkdr`) — four-layer architecture (`TalkDriver` entry + outer ask/answer loop, `parse_statement` statement read loop, `execute_op` ~30-opcode control dispatcher, `parse_factor` RPN expression evaluator with 10-deep stack), conversation-file format (`converse.a` + `converse.b`, LZW-compressed lib_32, ≈220 entries), full opcode catalog with source-vs-legacy-port name mapping, variables (`VarStr[32]` / `VarInt[32]` / `TalkFlags[256]`), substitution syntax, NPC self-reference via `0xEB`. Cross-validated against `u6converse.txt` (Nuvie) + legacy `script.js` (~1300 lines, substantial port). Rebuild implications: coroutine-style input pump, separation of VM core / world / I/O, ECS mapping. | ~530 lines |
| [research_npc_ai.md](research_npc_ai.md) | NPC AI / schedules / pathfinding (`seg_1E0F`, "NPCTracker") — action-economy turn scheduler (`C_1E0F_4E0A` + MovePts/DEXTE round economy + time-advance coupling), per-mode state-machine dispatcher (`C_1E0F_3E6A`, full mode table), schedule data layout (`tSchedule` + SchedPointer/SchedIndex) + hourly transition (`C_1E0F_5165`) + arrival behaviors (`__AtDestination`: sleep/sit/eat/play/stand/guard), bucket-priority Dijkstra pathfinding (`C_1E0F_2D37` + relax/traceback + RLE path + cost map), movement legality (`C_1E0F_000F`). AI mode catalog from `ai.h`. **No legacy port** of this subsystem exists. Rebuild implications: ECS turn system, AI-mode component, reimplement-not-transliterate pathfinding, off-area-teleport design choice, min-scope subset for "wander Britain". | ~470 lines |
| [research_object_interaction.md](research_object_interaction.md) | Player↔object interaction (`seg_27a1`, biggest segment) — the five world-interaction commands (Look `C_27A1_0C67`, Get `C_27A1_18F5`, Drop `C_27A1_14DA`, Move `C_27A1_1E8B`, Use `C_27A1_6179`). Shared target→validate(range/legality)→apply→recompose+cost pipeline; `Selection` struct; **cell-pick `C_2337_08F1` 3-tier rule (NPC > non-Ignore > Ignore-fallback) + COMBAT_canSee's IsTileIg skip**; **display-name `GetObjectString` party-Names→look.lzd fall-through (no LZNAMES file)**; **keyboard/mouse targeting collapses into mkMouseSelection**. Get's theft/karma coupling; Drop's thrown-missile arc; **LOOK = single function (not dispatched); USE = table-dispatched `switch(GetType)` ~40 handlers + IsTileIg re-pick via `C_27A1_0919`**. Mutation primitives (GiveObj/TakeObj/InsertObj/MoveObj/AddObj/DeleteObj). Rebuild: ECS command/intent system, Use = handler registry, click/drag targeting replaces blocking getch. | ~380 lines |
| [research_portraits.md](research_portraits.md) | Conversation portraits (I-12 pipeline) — 56×64 one-byte-per-pixel indexed bitmaps, LZW-compressed, one per object in `lib_32` files `portrait.a/.b/.z`; loader `C_2FC1_1C19` (`objNum → file + block index`: avatar→`.z[D_2CCB-1]`, `≥0x62`→`.b`, else `.a`; generic Wisp/Guard/Gargoyle remap; shrine/statue via `GetQual`). **Palette correction:** portraits use the active in-game `u6pal`, **not** a dedicated palette (the loader loads none; tech doc names none). Legacy port doesn't decode portraits. Clone plan reuses `assets/lzw.js` `decompressCompressedFile` + `assets/palette.js`; lazy-cache per `npcId` (project's first lazy asset). | ~180 lines |
| [research_save_load.md](research_save_load.md) | Save/load mechanism + savegame composition (`seg_0C9C` save/restore). A savegame = a memory-array dump split by slot range: `savegame\objlist` (24 actor parallel arrays + the contiguous `D_2C4A` global-state blob: clock/karma/wind/light/SpellFx[16]/moonstones/moon-phases/gender/language/flags) + `objblkXX` per-region + `objblk{A-E}I` dungeon world objects. Static files (schedule/basetile/chunks/*.vga) are NOT save data. Save = flush dirty regions + write objlist; restore = read static tables + objlist + stream current region. **Format is throwaway (rebuild uses modern persistence); the deliverable is the authoritative state-set checklist.** ECS: serialize component stores + singleton resources; staging-swap atomicity; new-game-init via parsing the original starting savegame. | ~250 lines |

### Design / plan docs (the rebuild's own decisions)

| Document | Focus | Length |
|----------|-------|--------|
| [architecture_ecs.md](architecture_ecs.md) | **The ECS runtime-ground build spec** (settled 2026-05-29) — Pure-ECS-primary/Hybrid-fallback choice; E (generational handle + free-stack allocator); C (parallel-array stores + sparse-set + spatial-index `Map<cell→entity[]>` + A-grid terrain + packed `Status`); S (systems-as-functions, 64-bit signature-mask query + generator + store-handle, two-list scheduler + `TurnClock` turn-driver, typed-`Map` resources, components+resources comms with the `Use`-switch dissolved); two-clock tick model; demand-load world streaming; green-Earth + the infinite-RAM litmus; the `ObjManager`-dissolution lineage table. Self-contained — build to this. | ~330 lines |
| [research_i1_render_slice.md](research_i1_render_slice.md) | I-1 pre-impl render-seam design — the legacy renderer split into draw-mechanism / terrain-feed / entity-feed / upload-strategy, with reuse/drop/lift/defer verdicts; the pillar-bug fix applied during the rules-lift; tile-flags-in-`TileRegistry` decision; the bring-your-own-data legal path; the flicker-hazard fold-in. | ~150 lines |
| [progress.md](progress.md) | Implementation step ledger (`I-N`) + per-step "scope" subsections. Carries the I-1 sub-step plan (I-1a core skeleton → I-1b assets → I-1c terrain → I-1d entity layer). | grows |

### Source-of-truth files

Local clone of ergonomy_joe's u6-decompiled. **The clone's absolute
path is per-PC** — both per-PC paths live in
[`../CLAUDE.md`](../CLAUDE.md) §"Source of truth" (the only place
the absolute paths are recorded). Research docs under `docs/` cite
source by relative name only (`seg_XXXX.c:NNN`, `u6.h:NNN`, etc.).

| Relative path | Contents |
|---------------|----------|
| `SRC/seg_XXXX.c` | Decompiled C function/segment files (Borland Turbo C 2.0 derivation; no friendly names — function discovery via reading) |
| `SRC/*.h` | Headers: `ai.h`, `cmd.h`, `gr.h`, `obj.h`, `spells.h`, `tile.h`, `u6.h` |
| `SRC/BSS.ASM` | Uninitialized data |
| `SRC/OSILIB/` | Low-level asm: `KBD.ASM`, `MOUSE.ASM`, `SOUND1-5.ASM`, `RAND.ASM`, `INFLATE.ASM`, `OSI_FILE.ASM` |
| `README.md` | Upstream notes on build process + decompilation method |

### Reference materials (legacy, lower trust)

| Path | Contents | Notes |
|------|----------|-------|
| `../ultima6/doc/*.pdf` + `*.txt` | U6 Technical Documents | Per upstream README: refer to an *earlier* version of the game; tech-docs lose to u6-decompiled where they disagree |
| `../ultima6/*.js` | Legacy JS port | Built from tech-docs + nuvie + Zane's own C++ `U6WorldEditor`. Has known divergence from source (pillar-render bug near Lycaeum; flag-alias bug at `obj.js:9-11`). Useful as a "what does the current port assume" reference for diff'ing against u6-decompiled. |

---

## Architecture Overview

The rebuild's architecture is settled and specified in
[architecture_ecs.md](architecture_ecs.md) — Pure ECS (Hybrid fallback
named), A-grid terrain + `TileRegistry`, packed `Status`, generational-
handle identity, signature-mask query, two-clock tick, demand-load world
streaming. Research validated these inputs rather than overturning them.
The first implementation slice and its render seam are in
[research_i1_render_slice.md](research_i1_render_slice.md);
the step ledger is [progress.md](progress.md).

---

## Cross-Document Reference Map

_(Pending — meaningful once ≥3 research docs exist.)_

---

## Key port-side decisions

These are deviations from byte-faithful porting (decided in
research, locked once decided):

| Decision | Where decided | Rationale |
|----------|---------------|-----------|
| **Modern rewrite, not routine-level translation** | Discussion phase 2026-05-26 + 2026-05-27; summary in [`../CLAUDE.md`](../CLAUDE.md) | U6 is hardware-as-substrate (DOS RPG), not hardware-as-design (arcade). Source-availability (u6-decompiled) doesn't change the family. See user memory `feedback_retro_port_translation_choice`. |
| **Modern-browser UX drives render cadence, not source's polling rate** | Research phase 2026-05-27 (game-loop + animation reads); captured in [`../CLAUDE.md`](../CLAUDE.md) §"Modern-browser UX as architectural anchor" | Source's on-demand composite + ~20-30Hz palette/animdata polling is hardware residue, not mechanic. Modern UX needs 60Hz+ drag-scroll smoothness + continuous-input-free animation. D2 corollary applied to behavioral envelope. WebGL is the natural substrate. |

More decisions land here as research surfaces them.

---

## Open items / deferrals

| Item | Status | Notes |
|------|--------|-------|
| Map render audit — pillar bug at Lycaeum | **RESOLVED — root cause identified, minimal fix sketched** | `research_map_render.md` "Pillar bug — root cause resolution" section. Bug = `drawObject` in `map_viewer.js:299-335` checks `isTopTile()` only on the base tile for layer routing; extensions inherit the base's layer. For pillars (base `isTopTile=false`, head `isTopTile=true`), the head ends up in Layer 1 instead of Layer 3, gets covered by Layer 3 objects like Steps (OBJ_114, decimal #276) at the same cell. Minimal fix: per-tile `isTopTile()` check during emission. |
| Conversation VM port — legacy `script.js` stubs to verify | **OPEN** — listed in `research_conversation_vm.md` §"Open questions" | Five concrete stubs (`OBJINPARTY`, `OWNS`, `WEIGHT`, `JOIN` cap, `LEAVEPARTY` inventory drop) + AND/OR boolean-vs-bitwise semantics + string equality in `OP_EQU` + `OP_FUNC` (0xD1) usage check + f2-vs-f3 marker mystery. None blocking; all fixable when the rebuild's `ConversationVM` lands. |
| CURSED/MUTANT/HATCHED 0x40 aliasing in legacy `obj.js:9-11` | **RESOLVED — not a port bug** | Source u6.h:80-82 deliberately overloads bit 0x40 across object types. Legacy port faithfully mirrors source. Disambiguation in either engine requires per-call-site object-type dispatch. |
| ECS-core specifics (entity ID format, component storage, query API, system pipeline, tick model) | **RESOLVED — settled 2026-05-29** | Full spec in [architecture_ecs.md](architecture_ecs.md): generational handle + free-stack allocator; parallel-array stores + sparse-set + spatial-index Map; 64-bit signature-mask query + generator + store-handle; two ordered system lists + `TurnClock` turn-driver; two-clock tick. |

---

## How to use this index

- **Starting research on a subsystem?** Add a row to Quick Navigation
  when the `research_*.md` file is first created.
- **Resuming after a break?** Read `Journal.md` first for process
  context; use this index to navigate the synthesized facts.
- **Modifying docs?** Update the relevant entry here in the same
  commit if you changed sections, added new ones, or resolved an
  open item.
