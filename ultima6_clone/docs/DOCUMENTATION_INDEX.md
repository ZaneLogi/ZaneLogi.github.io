# ultima6_clone — Documentation Index

**Status & step ledger:** see [progress.md](progress.md) top banner — the single source
of truth (this index is the **navigation map**, not a status mirror; convention in
`progress.md §"Doc maintenance"`). The ECS runtime ground is specified in
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
| [research_game_loop.md](research_game_loop.md) | Game loop + input dispatch — `C_0A33_1CB4` turn-based blocking structure, three-phase command dispatch (keystroke→CMD_* translation + party/solo + action), `C_1E0F_4E0A` NPC tick with MovePts/DEXTE time-slicing, `C_0A33_1355` time-advance, CON_getch→C_0C9C_1D59→CON_prompt input polling chain. Identifies CON_prompt's idle path as the animation tick site. **Deep-dive:** [U6_世界推進_回合節拍.md](U6_世界推進_回合節拍.md). | ~280 lines |
| [research_animation.md](research_animation.md) | Animation channels — three independent mechanisms: (1) hardware VGA palette cycling via `PaletteAnimation` for fires/braziers/BluGlo/cauldrons in slots 0xE0-0xFB; (2) animdata tile-pointer rewriting for water/fountains/flags/NPCs/protection-fields (29 entries with `tile_to_animate`/`first_anim_frame`/`and_mask`/`shift_value`); (3) hybrid tiles for coast/river banks. Cross-validated against `u6tech.txt` §"Animation" and legacy `anim_data_manager.js` + `map_viewer.js:updateFrame`. Documents the legacy port's `tileUsageMap` sparse-update pattern as implementation precedent. | ~280 lines |
| [research_conversation_vm.md](research_conversation_vm.md) | NPC conversation VM (`talkdr`) — four-layer architecture (`TalkDriver` entry + outer ask/answer loop, `parse_statement` statement read loop, `execute_op` ~30-opcode control dispatcher, `parse_factor` RPN expression evaluator with 10-deep stack), conversation-file format (`converse.a` + `converse.b`, LZW-compressed lib_32, ≈220 entries), full opcode catalog with source-vs-legacy-port name mapping, variables (`VarStr[32]` / `VarInt[32]` / `TalkFlags[256]`), substitution syntax, NPC self-reference via `0xEB`. Cross-validated against `u6converse.txt` (Nuvie) + legacy `script.js` (~1300 lines, substantial port). Rebuild implications: coroutine-style input pump, separation of VM core / world / I/O, ECS mapping. **Deep-dive:** [U6_對話系統.md](U6_對話系統.md). | ~530 lines |
| [research_npc_scripts.md](research_npc_scripts.md) | **On-demand** per-NPC conversation-script summaries (content, not engine) — decoded from `converse.a/.b` + the `__U6.inspectConversation()` dev hook, added when a specific NPC is requested. Convention: keyword **prefixes** are exact-from-script, full-word answers are flagged inference. Entries: **Lord British** (npcId 5) — bit-7 met-gate, 10-question randomized copy-protection quiz (answer key), castle-key handout + briefing, topic menu, party-heal, Wizard-of-Oz book quest, easter eggs; **Nystul** (npcId 6) — scripted quest-intro, no topic menu: the Book-of-Prophecies→Mariah hook (`OWNS(Iolo,60)` branch) + the moonstone Y/N → "ask Lord British"; bit-7 met-gate + sets bit-0 name-known; **Dupre/Shamino/Iolo** (npcId 2/3/4) — the starting companions: keyword banter + quest-lock (`leav` refused till quest done), Shamino's gargoyle/LB hints, Iolo's gold pool/split utility (obj 88) + the `spam`×3 + `humbug` developer cheat menu; **Mariah** (npcId 33) — Lycaeum mage: magic-syllable copy-protection quiz + the Book-of-Prophecies translation hub (book obj 60 + silver-tablet halves obj 389/390 → "false prophet = Avatar" prophecy → Sin'Vraal; gypsy lead); **Penumbra** (npcId 41) — fortune teller: sells the Honesty mantra "ahm" (5 gold), Rune of Honesty buried with Beyvin under Moonglow, and the lens prophecy (broken violet lens must be repaired + a blue lens needed); **Lord Aganar** (npcId 39) — Lord of Moonglow: Honesty-virtue lore (Rune entrusted to Beyvin, mantra → Penumbra, Shrine of Honesty on Dagger Isle); **Ephemerides** (npcId 35) — Verity-Isle astronomer + **lens duplicator**: one lens (obj 396) + a glass sword (Minoc) → casts the second lens (obj 394) free, yielding both lenses for the Vortex; **Thariand** (npcId 34) — Lycaeum librarian (flavor): book-catalog gags + leads (Nicodemus SE of Yew; the mantras/Compendium/Oz books); **Xiao** (npcId 36) — Council mage / magic vendor (spellbook 60g, per-circle spell teaching, 7 reagents; 8th Circle gated on the wisp secret); **Dargoth** (npcId 37) — Lycaeum healer (heal/cure/resurrect for gold); **Rob** (npcId 38) — Blue Bottle Tavern keeper (food/drink vendor, flavor); **Manrel** (npcId 40) — Beyvin's cousin: gives the crypt key (obj 64 qual 12) + daffodils → the Rune of Honesty; **Derydlus** (npcId 42) — tavern patron (flavor; vouches for Penumbra); **Gwenno** (npcId 66, Minoc) — Iolo's wife, recruitable bard (teaches the song "Stones"; points to guildmaster Selganor; no glassblower lead); **Selganor** (npcId 64, Minoc) — artisan guildmaster: reagent quiz + join the guild (panpipes via Julia + recite "Stones" via Gwenno) → the **Rune of Sacrifice** (obj 246, the 2nd virtue rune); leads to Sutek's island; **Julia** (npcId 67, Minoc) — instrument-maker: makes the **panpipes** (obj 153) from a **yew board** (Yew log → sawmill); **Isabella** (npcId 63, Minoc mayor) — "city of Sacrifice": Rune of Sacrifice → Selganor, and the **Sacrifice mantra** → healer **Tara** (npc 65); balloon lead; **Tara** (npcId 65, Minoc healer) — heal/cure/resurrect (karma-mercy), and confirms the **Sacrifice mantra "Cah"** (so Sacrifice = 2nd virtue fully sourced); **Michelle** (npcId 68, Minoc basket-weaver) — weaves the **balloon basket** (obj 422) from the **balloon plans** (obj 270) + 300g + a silk bag; **Dale** (npcId 70, Minoc **Glassblower**) — makes the **glass sword** (obj 48) from **5 gems** (obj 77); points lens work to a "lensmaker near the Lycaeum"; the rest of the Minoc block — **Aaron** (69, sawmill: yew log→board), **James** (71, weapon/armor shop), **Trebor** (72, shipwright: ships/skiffs), **Troy** (73, clockmaker), **Doris** (74, Tinker's Inn) — vendors/flavor. | grows |
| [research_npc_ai.md](research_npc_ai.md) | NPC AI / schedules / pathfinding (`seg_1E0F`, "NPCTracker") — action-economy turn scheduler (`C_1E0F_4E0A` + MovePts/DEXTE round economy + time-advance coupling), per-mode state-machine dispatcher (`C_1E0F_3E6A`, full mode table), schedule data layout (`tSchedule` + SchedPointer/SchedIndex) + hourly transition (`C_1E0F_5165`) + arrival behaviors (`__AtDestination`: sleep/sit/eat/play/stand/guard), bucket-priority Dijkstra pathfinding (`C_1E0F_2D37` + relax/traceback + RLE path + cost map), movement legality (`C_1E0F_000F`). AI mode catalog from `ai.h`. **No legacy port** of this subsystem exists. Rebuild implications: ECS turn system, AI-mode component, reimplement-not-transliterate pathfinding, off-area-teleport design choice, min-scope subset for "wander Britain". **Deep-dive:** [U6_NPC_排程與移動邏輯.md](U6_NPC_排程與移動邏輯.md). | ~470 lines |
| [research_object_interaction.md](research_object_interaction.md) | Player↔object interaction (`seg_27a1`, biggest segment) — the five world-interaction commands (Look `C_27A1_0C67`, Get `C_27A1_18F5`, Drop `C_27A1_14DA`, Move `C_27A1_1E8B`, Use `C_27A1_6179`). Shared target→validate(range/legality)→apply→recompose+cost pipeline; `Selection` struct; **cell-pick `C_2337_08F1` 3-tier rule (NPC > non-Ignore > Ignore-fallback) + COMBAT_canSee's IsTileIg skip**; **display-name `GetObjectString` party-Names→look.lzd fall-through (no LZNAMES file)**; **keyboard/mouse targeting collapses into mkMouseSelection**. Get's theft/karma coupling; Drop's thrown-missile arc; **LOOK = single function (not dispatched); USE = table-dispatched `switch(GetType)` ~40 handlers + IsTileIg re-pick via `C_27A1_0919`**. Mutation primitives (GiveObj/TakeObj/InsertObj/MoveObj/AddObj/DeleteObj). Rebuild: ECS command/intent system, Use = handler registry, click/drag targeting replaces blocking getch. | ~380 lines |
| [research_portraits.md](research_portraits.md) | Conversation portraits (I-12 pipeline) — 56×64 one-byte-per-pixel indexed bitmaps, LZW-compressed, one per object in `lib_32` files `portrait.a/.b/.z`; loader `C_2FC1_1C19` (`objNum → file + block index`: avatar→`.z[D_2CCB-1]`, `≥0x62`→`.b`, else `.a`; generic Wisp/Guard/Gargoyle remap; shrine/statue via `GetQual`). **Palette correction:** portraits use the active in-game `u6pal`, **not** a dedicated palette (the loader loads none; tech doc names none). Legacy port doesn't decode portraits. Clone plan reuses `assets/lzw.js` `decompressCompressedFile` + `assets/palette.js`; lazy-cache per `npcId` (project's first lazy asset). | ~180 lines |
| [research_level_change.md](research_level_change.md) | **Level change (`USE ladder` → multi-z dungeons), I-19.** Source mechanism (`seg_27a1.c:3097` USE OBJ_131 → `seg_101C.c:325-366` `C_101C_089E`: z_incr direction + coordinate rescale + reload/recompose; z range 0..5, surface 1024-wrap / dungeon 256-wrap), the legacy `../ultima6/` JS blueprint (mapZ + dungeonTileIndex + ladder transform), the clone's current state (terrain for all 6 levels **already decoded**, `MapLevel.dungeonTileIndex` ready, `Position.z` exists — so I-19 is *activation* not a new engine), the locked architecture (single `SpatialIndex` + active-z filter; live dungeon NPCs), and the exact surface↔dungeon coordinate math. | ~180 lines |
| [research_moongate.md](research_moongate.md) | **Moongate system — implemented as I-moongate (2026-06-13; as-built in `progress.md §"I-moongate scope"`).** Two unrelated networks: **blue** (`OBJ_055`) = the `D_2C74` 8-endpoint, lunar-phase-routed, *player-mutable* network (auto-spawned hourly by `C_0A33_121A`; `USE moonstone`/`C_27A1_3425` relocates an endpoint; `GateTravel`/`C_101C_0A3A` teleports to the phase-selected slot) vs **red** (`OBJ_054`) = the Orb of the Moons' (`OBJ_057`/`C_27A1_5789`) *fixed-ROM* (`D_171C`), *single-use* network. Phase clock (`D_036A` 28-day calendar + `D_2CC6-9`, hourly in `C_0A33_1355`); gate-entry `C_1E0F_184D` (incl. midnight-shrine override); Vortex-Cube (`OBJ_03E`) endgame is separate. Clone-reuse map (`WorldClock.onHour` + I-19 teleport/active-z), suggested sub-step shape, kept-deviation candidates, open items. | ~210 lines |
| [research_save_load.md](research_save_load.md) | Save/load mechanism + savegame composition (`seg_0C9C` save/restore). A savegame = a memory-array dump split by slot range: `savegame\objlist` (24 actor parallel arrays + the contiguous `D_2C4A` global-state blob: clock/karma/wind/light/SpellFx[16]/moonstones/moon-phases/gender/language/flags) + `objblkXX` per-region + `objblk{A-E}I` dungeon world objects. Static files (schedule/basetile/chunks/*.vga) are NOT save data. Save = flush dirty regions + write objlist; restore = read static tables + objlist + stream current region. **Format is throwaway (rebuild uses modern persistence); the deliverable is the authoritative state-set checklist.** ECS: serialize component stores + singleton resources; staging-swap atomicity; new-game-init via parsing the original starting savegame. | ~250 lines |
| [research_egg.md](research_egg.md) | **Egg / creature-spawn system (implemented as `I-egg`, 2026-06-14).** `OBJ_14F` eggs = data-driven monster spawners (`seg_2E2D.c`): contained "embryo" templates; egg `Qual`/`Quan` = time-gate / alignment-override / hatch-%; embryo `Qual`/`Quan` = AI-mode / count. `EGG_hatchArea` hatches off-screen (>8 tiles) on area-load + force-hatches on teleport (`seg_101C.c:191/315`). **`LOCAL` = one-time** (deleted on stream-out) vs **non-`LOCAL` = wilderness respawn** (`ClrHatched` re-arm, `C_1184_19AA`). Slot model: 0xC00 table but 0x100 stat arrays → 0xe0-0xff 32-slot monster pool (why the throne gargoyles are 224-226). `EGG_generate` monster-gen (stats via `mkRandom` off `seg_3522` class tables; EXP=100) kept as a **seam**. Worked example: the opening throne gargoyle ambush; factory-vs-played-save; **§9.1 decided clone spawn/cull model** (avatar-trigger, viewport-`nearRadius`, camera-ignored, cull+re-arm — resolves the no-region-unload respawn fork). | ~320 lines |
| [research_main_quest.md](research_main_quest.md) | **Main quest — gap analysis toward game completion (→ scopes `I-main_quest`).** Backward chain from the win trigger `C_27A1_5FAC` (USE Vortex Cube with the 8 moonstones inside + both lenses placed at the Codex `(923,851)` + avatar within 5). **Quest-object coordinates** in Zane's data (Vortex Cube `(147,57,z4)`, Broken Lens `(124,194,z5)`, Codex `(923,851)`, the 8 force-field-guarded moonstones frame 0–7 = the moongate `D_2C74` endpoints). Per-milestone gap rows (objects · verbs · procedure · source↔clone↔status). **Findings:** all 8 moonstones are force-field-guarded → the rune+mantra puzzle (`C_27A1_4B98`) is a HARD win prerequisite; books/lenses/Codex need NO USE handler (win checks cell presence, lens = GET+DROP); **win path is combat-free**. Scope-out: `I-main_quest` = 3 items — USE Vortex Cube (a), USE rune+mantra + mantra prompt UI (b), move-into-cube container fix (c); lens/cube acquisition rides I-13 (coarse, deferred). | ~230 lines |
| [research_spellbook.md](research_spellbook.md) | **Minimal cast feature (I-spellbook, research-only).** Press `c` → a spellbook modal listing all named U6 spells (8 circles, reagents from `Reagents_needed[]`); `Enter` casts. Only **non-combat spells that route into already-ported subsystems** are implemented — **Telekinesis** (`OBJ_10C` lever / `OBJ_120` drawbridge-crank / object-pull), **Locate**, **Gate Travel** (reuses I-moongate), **Heal**, **Mass Awaken**, **Create Food**, **Unlock Magic**; the rest fizzle. Covers the source model (`SpellName[]` / `Reagents_needed[]` / `ReagType[]` / `MK_CIRCLE`, `seg_1944.c`), the per-spell handler→clone-hook map, the full named-spell catalog, the `c`-modal UI (UIStack + list, reagent have/don't-have tint), the casting flow (spell registry; no-target / object / party / digit-input), and the kept deviations (no spellbook-item / reagent-gate / mana / combat; fizzle the unimplemented). | ~190 lines |
| [research_verb_coverage.md](research_verb_coverage.md) | **Command-verb coverage: source vs clone** — branch-by-branch audit of **MOVE** (`C_27A1_1E8B`) and **LOOK** (`C_27A1_0C67` + search `C_27A1_09A1`), each source branch tracked as ported / deviating / deferred (detailed companion to `research_object_interaction.md`). Records the one real defect (the `TypeWeight==255` MOVE/Telekinesis push over-gate vs source's `==0`-only gate) and the deferred-mechanics set from the Dungeon Wrong audit (secret-door reveal `OBJ_14E`, spill-on-search, the permanent `OBJ_0AF` force field, USE-pick shadowing, the `×N` QuanType display bug, Dispel Field `SPELL_21`). Classifies every gap as gameplay-completeness deferred under the educational-port scope. | ~230 lines |

### Playthrough / quest-trace (NOT research)

A different category from the research docs: the **player's-eye quest reconstruction** built by
decoding NPC conversations (the "semi-gameplay" trace), kept in sync with the catalog above.

| Document | Focus | Length |
|----------|-------|--------|
| [quest_log.md](quest_log.md) | **The living quest log** — main-quest threads (status board), key-items tracker, who-points-where leads, and open gaps, reconstructed from the decoded NPC scripts. Updated alongside `research_npc_scripts.md` whenever a decode yields story/item info. Cross-links the catalog (raw decodes) + `research_main_quest.md` (the win structure). | grows |

### Source-decode deep-dives (paired with the English summaries above)

Native-language (Chinese) deep decodes of specific `seg_*.c` subsystems. They are
**companions, not replacements**: the English `research_*.md` above stay the canonical,
currently-true **summaries** (the "subsystem truth"); these go **deeper** (full code walks,
plus subsystems the summary doesn't yet cover). **Convention:** keep a pair consistent — on
conflict, re-derive from source and reconcile both.

| Document | Focus | Length |
|----------|-------|--------|
| [U6_對話系統.md](U6_對話系統.md) | Conversation VM deep-dive (`seg_1703.c` talkdr) — companion to [research_conversation_vm.md](research_conversation_vm.md). The bytecode VM walked end-to-end: statement/factor/keyword dispatch, the indexed string/value tables, IF/ELSE branch-skip, variables + markup. | ~257 lines |
| [U6_NPC_排程與移動邏輯.md](U6_NPC_排程與移動邏輯.md) | NPC schedule + pathfinding + blocking deep-dive (`seg_1E0F.c`) — companion to [research_npc_ai.md](research_npc_ai.md), going **further**: the 4-layer model (plan / execute / time / visibility), the `AI_84/85/86` blocking-degrade state machine, `__AtDestination` arrival behaviors + direction system, and the **guard / law-enforcement + thief** subsystems not in the English summary. | ~631 lines |
| [U6_世界推進_回合節拍.md](U6_世界推進_回合節拍.md) | World-advancement / turn-beat deep-dive (`seg_0A33.c` `C_0A33_1355` + `seg_1E0F.c` move-points) — companion to [research_game_loop.md](research_game_loop.md). The action-driven blocking loop, `MovePts`/`DEXTE` quota + overdraft, `SubTerrainMov` terrain cost, and the per-action world heartbeat (clock cascade, status rolls, hourly schedule switch). | ~240 lines |

### Design / plan docs (the rebuild's own decisions)

| Document | Focus | Length |
|----------|-------|--------|
| [architecture_ecs.md](architecture_ecs.md) | **The ECS runtime-ground build spec** (settled 2026-05-29) — Pure-ECS-primary/Hybrid-fallback choice; E (generational handle + free-stack allocator); C (parallel-array stores + sparse-set + spatial-index `Map<cell→entity[]>` + A-grid terrain + packed `Status`); S (systems-as-functions, 64-bit signature-mask query + generator + store-handle, two-list scheduler + `TurnClock` turn-driver, typed-`Map` resources, components+resources comms with the `Use`-switch dissolved); two-clock tick model; demand-load world streaming; green-Earth + the infinite-RAM litmus; the `ObjManager`-dissolution lineage table. Self-contained — build to this. | ~330 lines |
| [research_i1_render_slice.md](research_i1_render_slice.md) | I-1 pre-impl render-seam design — the legacy renderer split into draw-mechanism / terrain-feed / entity-feed / upload-strategy, with reuse/drop/lift/defer verdicts; the pillar-bug fix applied during the rules-lift; tile-flags-in-`TileRegistry` decision; the bring-your-own-data legal path; the flicker-hazard fold-in. | ~150 lines |
| [research_i13_conversation_vm.md](research_i13_conversation_vm.md) | I-13 pre-impl conversation-VM design — the **standalone effect-interpreter** decision: a generator VM that yields typed effects `{type,...}` (resumed with a value for reads) with zero world/I-O imports. Complete **effect taxonomy** (every `seg_1703.c` opcode → VM-internal / output / input / query / sink / read-write), one-shape wire protocol, VM-owned `$`/`#` expansion + host-seeded `TALK_initTalk`, gates-as-host-pre-flight, host-as-thin-translation with stub-when-deferred (worked `GETHORSE` example), legacy `script.js` reuse + fix-list, ECS placement, and the I-13a–g sub-step plan. | ~250 lines |
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
| Conversation VM port — research-phase open questions | **RESOLVED (I-13)** — `research_conversation_vm.md` §"Open questions" | Settled when the VM was built: `OP_FUNC` (0xD1) dropped (not a U6 opcode — no handler in `execute_op`/`parse_factor`, never executes across all 200 scripts); BC/BD, `OP_EQU` string-compare, AND/OR boolean, absolute-offset addressing all implemented source-faithfully; legacy stubs replaced by host effects (`weight` + party `join`/`leave` membership = I-13 deferrals); `0xF3` PREFIX characterized (30/200, treated identically to `0xF2`). Two genuine unknowns remain: the latent F2/F3 semantic + the `REST` time-skip modern-UX call. |
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
