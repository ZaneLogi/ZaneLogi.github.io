# Research: U6 save / load mechanism + savegame composition

**Status:** decoded 2026-05-28. The save/restore orchestration in
`seg_0C9C.c` (`C_0C9C_089F` save, `C_0C9C_0397` restore,
`C_0C9C_042A` the load body), the global-state block layout
(`D_2C4A.h`), the `objlist` NPC-array serialization, and the
read-only data files are read end-to-end. The per-region world-object
files (`objblkXX`) and their serialize/deserialize pipeline are
already documented in
[`research_world_data.md`](research_world_data.md) — this doc covers
the **whole-game save composition + orchestration** and references
that doc for the OBJBLK details rather than repeating them.

Citations use relative paths within the u6-decompiled clone (e.g.,
`seg_0C9C.c:357`). The clone's absolute path is per-PC; see
[`../CLAUDE.md`](../CLAUDE.md) §"Source of truth".

**This subsystem will NOT be ported faithfully** — the rebuild uses
modern persistence (structured JSON or a versioned binary blob in
`localStorage` / `IndexedDB` / a file). The value of this research is
the **complete enumeration of game state that must be persisted** —
the source's flat memory-dump format is the authoritative checklist
of "what counts as save state."

## The big picture — what a U6 savegame IS

A U6 savegame is, almost literally, a **dump of the engine's
in-memory state arrays**, split across files by what they hold:

| File | Contents | Save/restore role |
|------|----------|-------------------|
| `savegame\objlist` | The 256 NPC/actor parallel arrays + party roster + the global game-state block (`D_2C4A`). | **The core savegame.** Written whole on save, read whole on load. |
| `savegame\objblkAA`..`objblkHH` | Per-region world objects (up to 64 region files, 128×128 tiles each). | Per-region object lists. Flushed lazily as the player roams; see [`research_world_data.md`](research_world_data.md). |
| `savegame\objblk{A,B,C,D,E}I` | The 5 dungeon levels' objects. | Same, one file per dungeon level. |
| `savegame\objblkXX.tmp` | In-flight dirty copies of region files. | Write-tmp-then-rename atomicity; deleted on restore. |

Read-only data files (NOT part of the save — shipped game assets,
loaded every session regardless):

| File | Contents |
|------|----------|
| `schedule` | NPC schedule table (`SchedPointer[257]` offsets + the `Schedule[]` entries). See [`research_npc_ai.md`](research_npc_ai.md) §"Schedules". |
| `basetile` | `BaseTile[2048]` — object-type → base tile index. |
| `chunks` | Terrain chunk tile data (8×8 byte chunks). See [`research_world_data.md`](research_world_data.md). |
| `map`, `tileindx.vga`, `maptiles.vga`, `objtiles.vga`, `animdata`, `animmask.vga`, `u6pal`, `converse.a/.b`, `look.lzd`, ... | Tiles, map, animation, palette, conversation scripts. |

So "the game state" = `objlist` (actors + globals) + the `objblk*`
set (world objects). Everything else is static content.

## The global-state block — `D_2C4A` (`D_2C4A.h`)

A single contiguous struct of globals from `IsOnQuest` (`__2C4A`) to
the `D_2CCC` end marker. Because it's laid out contiguously in
memory, the engine serializes it as **one blob** (see save/load
below). Contents:

| Field | Meaning |
|-------|---------|
| `IsOnQuest` | sacred-quest flag (mirrors conversation `VarInt['Q']`) |
| `NextSleep` | sleep timer |
| `Time_M` / `Time_H` | game clock (minute / hour) |
| `Date_D` / `Date_M` / `Date_Y` | calendar |
| `KARMA` | player karma (0-99) |
| `WindDir` | wind direction (0-7, 0xFF = calm) |
| `Active` | active party-member slot |
| `D_2C55` | ambient-light bucket |
| `MapX` / `MapY` / `MapZ` | player world position (derived from the active member on load, but stored) |
| `SpellFx[16]` | active spell-effect timers (light, protection, time-stop, etc.) |
| `D_2C6C` | "Vanished" object |
| `CaughtFish`, `DrunkCounter`, `MustRingBell` | misc state |
| `SoundFlag` | sound on/off |
| `D_2C74[8][3]` | moonstone buried positions (x,y,z each) |
| `D_2CA4` / `D_2CA6` | powder-keg explosion timer + object |
| `D_2CA8` | "speak Gargish" language flag |
| `PathObject[8]` / `PathCounter[8]` / `PathTries[8]` | NPC pathfinding state (see [`research_npc_ai.md`](research_npc_ai.md)) |
| `InCombat`, `D_2CC3`, `D_2CC4` | combat / solo-mode flags |
| `DefaultCommand` | the ALT-letter default action |
| `D_2CC6`-`D_2CC9` | two moon phases |
| `D_2CCA` | avatar gender (set at char creation) |
| `D_2CCB` | avatar char-creation **portrait** choice — `portrait.z` index, 1-based; 0 = uncreated (`C_2FC1_1C19`, `seg_2FC1.c:755`; see "New-game initialization") |
| `D_2CCC` | end marker |

The blob is written with
`OSI_write(si, -1, (&D_2CCC - &obj_2C4A), &obj_2C4A)` — i.e., "from
the first field to the end marker." ~0x82 bytes. **This is the
complete global game state**; the rebuild's save schema must carry
every one of these (clock, karma, party-active, spell timers,
moonstones, moon phases, gender, language, combat flags).

## `objlist` — the actor serialization

`objlist` is a **flat concatenation of fixed-size arrays**, written
in a fixed order and read back in the identical order (sequential
`OSI_read/OSI_write` with offset `-1` = "continue from current
position"). From `C_0C9C_089F` (save) / `C_0C9C_042A` (load),
`seg_0C9C.c:296-321` / `:371-396`:

| Order | Array | Size | Per-slot meaning |
|-------|-------|------|------------------|
| 1 | `ObjStatus` | 0x100 | status byte (CoordUse + flags) |
| 2 | `ObjPos` | 0x100 × 3 | packed x/y/z |
| 3 | `ObjShapeType` | 0x200 | type+frame (2 B) |
| 4 | `Amount` | 0x200 | quan+qual (2 B) |
| 5 | `NPCStatus` | 0x100 | combat status flags |
| 6 | `STREN` | 0x100 | strength |
| 7 | `DEXTE` | 0x100 | dexterity |
| 8 | `INTEL` | 0x100 | intelligence |
| 9 | `ExpPoints` | 0x200 | experience (2 B) |
| 10 | `HitPoints` | 0x100 | HP |
| 11 | `Names` | 16 × 14 | party member names (13 chars + null) |
| 12 | `Party` | 0x10 | party roster (slot IDs) |
| 13 | `PartySize` | 1 | party count |
| 14 | `Level` | 0x100 | level |
| 15 | `SchedIndex` | 0x100 | active schedule entry (rel.) |
| 16 | `NPCMode` | 0x100 | current AI mode |
| 17 | `NPCComMode` | 0x100 | combat AI mode |
| 18 | `MAGIC` | 0x100 | magic points |
| 19 | `MovePts` | 0x100 | move-point budget |
| 20 | `OrigShapeType` | 0x100 × 2 | pre-shapeshift type |
| 21 | `TalkFlags` | 0x100 | per-NPC conversation flags |
| 22 | `Leader` | 0x100 | leader / path-index |
| 23 | `NPCFlag` | 0x100 | direction + flags |
| 24 | `D_8C42` | 0x100 | pathfinding step buffer `content[8][32]` (8 paths × 32 dir steps) |
| 25 | `D_2C4A` block | ~0x82 | global game state (above) |

**Total = 7283 bytes (0x1C73).** The load is **size-driven, not EOF-driven** —
`C_0C9C_042A` reads exactly these 25 sections in order and stops; it never reads to
end-of-file. Sizes are fixed by `struct coord` = 3 bytes (`u6.h:302`) and Turbo C
`int` = 2 bytes. Verified against a real **initial/new-game `objlist`** (7539 bytes):
everything from `D_8C42` (0x1AF1) onward is zeroed — paths, clock, karma, etc. are
populated at new-game start — and the file carries an extra 256 zero bytes past
0x1C73 that the engine simply never reads (harmless slack, not part of the format).

`D_8C42` is the live pathfinding step buffer, not a per-NPC field — it's a pointer
to `content[8][32]` (8 concurrent NPC paths × 32 direction steps), built/reversed/
consumed in `seg_1E0F.c` (the NPC-AI segment). It's saved so in-progress paths
survive save/load; the rebuild can skip persisting it and recompute paths on load.

Note the first 4 arrays (`ObjStatus`/`ObjPos`/`ObjShapeType`/
`Amount`) are the **same 4 fields the OBJBLK records store** (see
[`research_world_data.md`](research_world_data.md) §"File format") —
but here sized for the 0x00-0xFF NPC range. The world-object range
(0x100+) of those same arrays is serialized separately in the
`objblk*` files. Source uses one big array set for both NPCs and
world objects; the save format splits them by slot range into
`objlist` (NPCs) vs `objblk*` (world).

This array catalog is the **definitive list of per-actor state** the
rebuild must persist per NPC entity: position, shape, quantity,
status, the 6 RPG stats (STR/DEX/INT/HP/MAGIC/EXP/LEVEL), AI mode +
combat mode + schedule index + leader + move points, talk flags,
direction, name, and party membership.

### `NPCStatus` (section 5) — decomposition by concern

`NPCStatus[256]` packs **seven unrelated per-NPC concerns into one byte**
(`u6.h:113-155`); source reads them through bit macros, never the raw
array. Loaded/saved whole (`OSI_read/write(..., 0x100, NPCStatus)`,
`seg_0C9C.c:301/376`); initialized at monster spawn from a class-default
table (`seg_2E2D.c:139` `NPCStatus[o] = D_3522_0202[objClass]`). For the
**named NPCs in the shipped `objlist`** the byte carries real per-NPC
state — chiefly **alignment**.

| bit | concern | source writers | consumers (~count) | clone mapping |
|---|---|---|---|---|
| `0x80` PLRCONTROL | party membership | Join/Leave (`seg_1703.c:236/262`) | 56 — render, targeting, talk on-screen, party iter | **re-encoded** → `PartyMember`, loaded from the party-slot list (`objlist 0x0fe0` → `world_loader.js:144-158`), not this bit |
| `0x60` alignment | NEUTRAL/EVIL/GOOD/CHAOTIC | spawn-by-class (`seg_2E2D.c:139`), charm/combat (`seg_1944`, `seg_2337.c:72`), party join/leave (`seg_1703.c:238/265`) | ~40 — **≈26 combat** hostility (`seg_2337.c`), 7 magic, **1 talk gate** (`seg_1703.c:1050`), theft/spawn/rest | **carry → `Alignment` component** (load `& 0x60`; **load-only** until its mutators land — party join/leave in I-13, charm/combat later). Owner = combat; first/only in-scope reader = the TALK evil/chaotic gate (I-11). |
| `0x10` DEAD | death | combat kill (`seg_2337.c:749/835`), resurrect (`seg_1944.c:1210`) | 27 | **defer → death/combat.** Consumers incl. the TALK dead arm (`seg_1703.c:1044`). |
| `0x04` ASLEEP | unconscious | schedule arrival (`seg_1E0F.c:1017/1033`), sleep spell (`seg_1944.c:729`), VM SETMODE (`seg_1703.c:828`), combat wake (`seg_2337.c:705`) | 13 | **re-encoded (schedule path)** → `AIMode.AI_SLEEP`, set at the *same* arrival event (`npc_path.js:204`). Magical-sleep writers → magic. Consumer incl. the TALK asleep arm (`seg_1703.c:1045`). |
| `0x08` POISONED | poison DoT | combat/terrain/spell (`seg_2337.c:1120`, `seg_27a1.c:1251`) | 8 | **defer → combat/magic.** |
| `0x02` PARALYZED | paralysis | spell (`seg_1944.c:1091`) | 6 | **defer → combat/magic.** Consumer incl. the TALK paralyzed arm (`seg_1703.c:1045`). |
| `0x01` PROTECTED | protection spell | spell (`seg_1944.c:1101`) | 11 | **defer → magic.** |

**Don't resurrect the monolithic byte as one component.** The locked ECS
architecture ([`architecture_ecs.md`](architecture_ecs.md)) splits status
by concern + lifecycle: static-ish flags get a small component, combat
transients that carry duration/severity get their own data components,
and **the same concept is never stored twice**. So the byte decomposes per
the table — two concerns are already re-encoded (`PartyMember`,
`AIMode.AI_SLEEP`), `Alignment` is carried when its first in-scope reader
appears (the TALK gate, I-11), and the four combat/magic transients land
with their owning subsystem.

**Recoverability of the deferred bits** (so a deferred status arm isn't
silently forgotten): each is tracked **here** — the consumer column lists
the TALK gate + every other reader — not only as a comment at the
consuming site. When a future subsystem builds e.g. the death model, the
`DEAD` row already says "wire the talk dead arm." The bits are also
self-recovering: their subsystem **cannot be built without** confronting
them (no combat without death/poison), at which point this table's
consumer list is the wiring checklist.

**Save-roundtrip caveat.** The byte is an **output format**, not the live
store. On save the rebuild *reconstructs* it from the decomposed
components (`PartyMember`→0x80, `Alignment`→0x60, `AIMode.AI_SLEEP`→0x04,
the future combat-status components→the transient bits); on load it routes
each bit to its component and drops bits whose subsystem isn't built yet.
"Section 5 = combat status flags" in the catalog above is therefore a
**derived** field, like `MapX/Y/Z` (line 67) — never the source of truth.

## Save — `C_0C9C_089F` (`seg_0C9C.c:357-405`)

```c
1. If IN_VEHICLE, move all party members onto the map cell (so they
   serialize with real positions, not vehicle-relative).
2. DISK_confirm(DISK_8);              // floppy-swap prompt (DOS)
3. C_1184_33CA();                     // flush ALL dirty objblk regions
                                      //   to disk (.tmp → primary)
4. IsOnQuest = VarInt['Q' - 0x37];    // sync quest flag from conv VM
5. Create savegame\objlist, write the 24 arrays + the D_2C4A blob
   (sequential).
6. C_101C_054C();                     // refresh map state
7. If IN_VEHICLE, re-insert party into the vehicle inventory.
```

The key orchestration insight: **the world objects are already on
disk** (flushed lazily as the player roamed, plus the `C_1184_33CA`
final flush); `objlist` is the only thing written at save time. There
is no single monolithic save file — the savegame is the *directory*
`savegame\` as a whole.

## Restore — `C_0C9C_0397` + `C_0C9C_042A` (`seg_0C9C.c:250-354`)

`C_0C9C_0397` (restore orchestration):
```c
1. Reset flags (IsArmageddon, SelectMode, StatusDisplay, ...).
2. C_1184_26E2();          // delete all objblk*.tmp (discard in-flight)
3. Clear D_065C[] dirty trackers (0x45 regions).
4. C_1184_3B1D();          // re-init world arrays / allocate
5. C_101C_052D();          // map-chunk init
6. C_0C9C_042A();          // <-- the actual load (below)
7. C_1E0F_512A();          // NPC/path init (force DEXTE >= 1, etc.)
8. COMBAT_begin/breakOff per InCombat; C_0A33_1355(0) initial stamp.
```

`C_0C9C_042A` (the load body, `seg_0C9C.c:279-354`):
```c
1. DISK_confirm(DISK_4); read "schedule"  → SchedPointer + Schedule.
2. DISK_confirm(DISK_4); read "basetile"  → BaseTile[2048].
3. DISK_confirm(DISK_8); read "savegame\objlist" → the 24 arrays +
   the D_2C4A blob (sequential, mirroring the save order exactly).
4. C_1184_3B7D();          // rebuild derived world structures
5. VarInt['Q'] = IsOnQuest; MapX/Y/Z = position of Party[Active].
6. Init animation state (StateAnimData per BaseTile match).
7. LoadNewRegions(MapX, MapY, MapZ);   // load objblk for current area
8. DISK_confirm(DISK_5); open "chunks"; C_101C_054C(); recompose.
```

So load = read the static tables (`schedule`, `basetile`), read the
actor blob (`objlist`), derive `MapX/Y/Z` from the active party
member, then stream in the world objects for the current region
(`LoadNewRegions` → the OBJBLK read path in
[`research_world_data.md`](research_world_data.md)).

The `DISK_confirm(DISK_n)` calls are DOS floppy-swap prompts ("insert
disk N") — pure substrate residue, dropped entirely in the rebuild.

## Compression layer

The actor/world save files (`objlist`, `objblk*`) are **uncompressed**
fixed-layout dumps — only the shipped content assets (`*.vga`,
`converse.a/.b`, `tileindx.vga`) are LZW-compressed (via
`decompress` = `C_32FD_0000`, backed by `OSILIB/INFLATE.ASM`). So
save/load itself involves no compression; it's raw `OSI_read` /
`OSI_write` of memory blocks. (The conversation files' LZW is covered
in [`research_conversation_vm.md`](research_conversation_vm.md)
§"Data layer".)

## Implications for the rebuild

### The format is throwaway; the state set is the deliverable

We are explicitly NOT porting the flat memory-dump format. The
rebuild persists with modern tech (structured JSON or a versioned
binary blob, in `localStorage` / `IndexedDB` / a downloadable file).
What this research delivers is the **authoritative checklist of save
state**:

1. **Per-actor (NPC) state** — the 24 `objlist` arrays: position,
   shape/frame, amount, status, NPCStatus, STR/DEX/INT/MAGIC/HP/EXP/
   LEVEL, NPCMode/NPCComMode/SchedIndex/Leader/MovePts, TalkFlags,
   NPCFlag(direction), Name, OrigShapeType, party membership.
2. **Per-world-object state** — the OBJBLK 8-byte record fields
   (status, pos, shape, amount) + containment links, per region +
   per dungeon level.
3. **Global game state** — the entire `D_2C4A` block: clock
   (min/hour/day/month/year), karma, wind, ambient light, active
   member, `SpellFx[16]`, moonstone positions, moon phases, powder-
   keg timer, gender, language, combat/solo flags, default command,
   sound flag, quest flag.

If the rebuild's save schema captures all three, it captures
everything a U6 savegame holds — verified against source, not
guessed.

### ECS mapping

- **Per-actor / per-object state** → serialize each ECS entity's
  components. The `objlist` array catalog maps 1:1 to components
  (`Position`, `Renderable`/shape, `Stats`, `AIMode`, `TalkFlags`,
  `Schedule`, `Inventory` links). This is the same parallel-arrays ↔
  ECS-sparse-set isomorphism noted in
  [`research_engine_overview.md`](research_engine_overview.md)
  §"Global-state architecture" — which is exactly why save/load is
  cheap in an ECS: dump the component stores.
- **Global state** → serialize the singleton resources
  (`WorldClock`, `Karma`, `Weather`, `MoonPhases`, `SpellEffects`,
  `PartyState`).
- **World objects per region** → either serialize the whole world's
  object entities in one blob (modern memory makes the DOS
  region-paging unnecessary — substrate residue per
  [`../CLAUDE.md`](../CLAUDE.md) §"Modern-browser UX"), or keep a
  region/level partition if the world is large enough to warrant
  lazy loading. Recommendation: one blob for the rebuild's initial
  scope; partition only if profiling demands it.

### Clone note — conversation state lives on `objlist`, not components

In the rebuild the conversation system (`conversation_system.js`) mutates
the **decoded `objlist`** in place — actors' `talkFlags`, trained stats,
`globals.karma` — rather than ECS components (the §"ECS mapping" 1:1 above
is aspirational; talk state never moved onto components). Because
`objlist` is re-decoded pristine each boot, the clone's save
(`systems/persistence/snapshot.js`) snapshots the **full `objlist`**
(actors + globals + party) alongside the ECS component stores, and
re-applies it in place on restore. Party join/leave (deferred from I-13)
mutates `objlist.party`, so it is automatically covered. (Discovered
2026-06-10 in live testing: without this, passing Lord British's questions
was lost on reload.)

### Object deletion — full-snapshot + region suppression (no tombstones)

The rebuild's save (`systems/persistence/snapshot.js`, the `I-save/load`
step) is a **full snapshot of the loaded world, authoritative for every
loaded region** — not a delta over the pristine `objblk`. So an object
destroyed during play (smashed barrel, drunk potion, killed NPC) needs no
tombstone: it is simply **absent** from the dump, and on restore the saved
`loadedRegions` are re-marked so `loadRegion` (`world_loader.js`)
early-returns for them — the pristine `objblk` is never re-read to
resurrect it.

This is airtight by invariant: a world object can only be destroyed once
it is a live entity, which requires its region loaded — so a deletion's
region is **always** in `loadedRegions`. NPCs are global (loaded by
`loadActors`), and restore **bypasses `loadActors`**, so a dead NPC absent
from the snapshot is never recreated.

**Dependency**: this rests on the resident-after-load rule
(`project_ultima6_no_region_unload`) — every visited region stays
resident, so the snapshot is complete for it. If region unloading is ever
added, a visited+mutated region could be evicted, leave the snapshot
incomplete, and (not being in `loadedRegions`) reload pristine —
resurrecting deletions. That future would need per-region deltas + explicit
tombstones.

### Atomicity

Source's write-tmp-then-rename (`objblkXX.tmp` → `objblkXX`) is a
crash-safety pattern. The modern equivalent: write the new save blob
to a staging key, then atomically swap (`IndexedDB` transaction, or
write-temp-file-then-rename on a file backend). Keep this — it's good
practice, not substrate residue.

### Static vs save data separation

Source cleanly separates **shipped content** (`schedule`, `basetile`,
`chunks`, `*.vga`) from **save data** (`objlist`, `objblk*`). The
rebuild should mirror this: load static content from bundled assets;
persist only the mutable game state. Don't bake schedule/basetile
into the savegame (source doesn't, and it keeps saves small).

### New-game initialization — and where the global defaults come from

A fresh game ships with an initial `savegame\` directory (the "starting state" objlist + objblk
set). The rebuild needs an equivalent **initial-state asset** — either bundle the original U6
starting savegame and parse it once, or author a fresh-start state. Parsing the original starting
`objlist` + `objblk*` is the faithful path and reuses the same loader the save/load uses.

**The `D_2C4A` block has two value sources: compile-time initializers, then the save.** `D_2C4A.c`
declares the block with C static initializers, loaded into the data segment **at program start** —
these are the built-in defaults:

| Global | Default (`D_2C4A.c`) |
|---|---|
| `KARMA` | **75** |
| `Time_H` / `Time_M` | **8** / 0 |
| `Date_D` / `Date_M` / `Date_Y` | **4** / **7** / **161** |
| `MapX` / `MapY` / `MapZ` | **0x133** / **0x160** / 0  (= 307, 352) |
| `D_2C55` (ambient light) | **7** |
| `InCombat` 1 · `D_2CC3` −1 · `DefaultCommand` 0xFF · `SoundFlag` 1 | (non-zero misc) |
| `Active`, `WindDir`, `IsOnQuest`, `NextSleep`, `D_2CCA`/`D_2CCB`, … | **0** |

These are **live only until the first load**: `C_0C9C_042A` overwrites the whole block from
`savegame\objlist` (`seg_0C9C.c:321`, mirror-saved at `:396`). `GAME.EXE` has **no new-game reset**
of the block — the only `KARMA` writes are runtime clamps (`seg_0A33.c:29/37`, `seg_1703.c:850/857`)
— so after a load the saved values are authoritative and the `D_2C4A.c` initializers are just the
pre-load blank slate.

**A pristine ("factory") U6 copy has all-zero globals in its starting `objlist`** — `D_2CCB`,
`KARMA`, `D_2CCA`, dates, etc. all 0 — because **no character has been created yet**. The real game
detects this (`seg_0903.c:594`: `if(D_2CCB == 0)` → *"You must first create or transfer a
character"* → `execl("ultima6.exe")`) and hands off to the **separate char-creation program**
(`ultima6.exe`, *not* in this `GAME.EXE` decompile), which sets name / sex (`D_2CCA`) / portrait
(`D_2CCB`) + the gypsy-determined stats and writes a real save; play proceeds from that save.

**Rebuild guidance.** The clone loads the factory `objlist` directly and has no char-creation flow,
so its globals read all-zero. The intended new-game default for each zeroed global is exactly its
`D_2C4A.c` initializer above (karma 75, date 161/7/4, time 08:00, start position 307/352) — so the
clean approach is to apply those new-game defaults to an **uncreated** copy. **Implemented** —
`applyNewGameDefaults(objlist)` (`assets/objlist.js`) is **gated on `D_2CCB==0`** (the "not yet
created" signal, `seg_0903.c:594`): for a pristine copy it (a) fills each **zeroed world global**
with its `D_2C4A.c` default (`D_2C4A_DEFAULTS` — karma 75, clock 08:00 day 4/7/161) and (b)
hard-sets the **Avatar's** (objlist slot 1) **EXP `0x172`=370 / level 3** — the values Nuvie's
`update_objlist_for_new_game_u6` writes at creation (`save/SaveGame.cpp`; the avatar's factory
placeholder is a *non-zero* 9999 / level 8, so a fill-if-zero wouldn't catch it). STR/DEX/INT keep
the template's 15/15/15 base; magic/HP derive from the stat formulas; `main.js` seeds the
`WorldClock` from `objlist.globals`. **A created character — any real save (`D_2CCB>0`) — is left
entirely untouched**, so its real karma (even a legitimate 0), midnight clock, and stats survive; a
clone snapshot restores its saved actors/globals over the top regardless (`snapshot.js`). So a
factory copy boots 08:00 day 4/7/161, karma 75, Avatar at EXP 370 / level 3, while a real save keeps
its own values.

**Nuvie cross-check.** Nuvie reads karma (objlist `0x1bf9`) and the clock (`0x1bf3`) **straight from
the objlist with no code default**, and its char-creation patches neither — so it yields karma 0 for
a zeroed template and relies on the shipped objlist already holding the start time. The clone instead
uses GAME.EXE's authored `D_2C4A.c` values for the zeroed template (karma 75 is the source's own
number, not invented) — the one deliberate divergence from Nuvie. Karma is **unsigned 0–99** in both
(`unsigned char KARMA = 75` / `uint8 karma`).
The avatar portrait defaults to `portrait.z[6]` (D_2CCB 7, a male face matching the factory `avatarSex` 0)
at the render layer (`portrait.js` `_pixels`); unlike the clock/karma globals, `D_2CCA`/`D_2CCB` have no
compile-time `D_2C4A.c` default — they're char-creation player choices, so this is a clone presentation
choice (a sensible face for an uncreated avatar), not a source default. A future minimal char-creation step (gypsy
questions → stats + name/sex/portrait), or bundling a real created save, would replace these
defaults with the player's actual choices; the external `ultima6.exe` + Nuvie's creation scene are
the references for that.

## Open questions

1. **`C_1184_33CA` (flush-all-dirty)** body not read — confirms how
   many regions flush on save and whether it walks `D_065C[]`.
   Needed only if the rebuild keeps region partitioning.
2. **`C_1184_3B7D`** (post-load world-structure rebuild) — what
   derived structures it reconstructs (MapObjPtr is rebuilt
   elsewhere; this may rebuild containment / free-list). Body not
   read.
3. **`LoadNewRegions`** (`seg_1184.c:1550`) — the region-streaming
   entry; partially noted in
   [`research_world_data.md`](research_world_data.md) open questions.
4. **Multiple save slots** — source appears to use a single
   `savegame\` directory (one slot). U6 used a "journal" copy
   mechanism for multiple saves at the DOS level (copy the
   directory). The rebuild can offer unlimited named slots trivially
   (modern storage) — a UX improvement, not a fidelity question.
5. **Original starting-state assets** — whether to bundle and parse
   the original U6 initial `savegame\`, or author a fresh start.
   Decision for the implementation phase.

## Cross-references

- [`research_world_data.md`](research_world_data.md) — the
  `objblkXX` per-region file format, the 8-byte object record, the
  serialize/deserialize pipeline, `.tmp`/primary atomicity,
  containment rebuild via `GetAssoc`. This doc covers the
  whole-save orchestration; that doc covers the world-object files.
- [`research_engine_overview.md`](research_engine_overview.md)
  §"Global-state architecture" — the parallel-arrays-by-objNum
  layout that `objlist` dumps; the ECS-sparse-set isomorphism that
  makes component-store serialization the natural save mechanism.
- [`research_npc_ai.md`](research_npc_ai.md) — `schedule` /
  `basetile` are loaded by the same `C_0C9C_042A` path; `NPCMode` /
  `SchedIndex` / `MovePts` / `PathObject[]` are save state.
- [`research_conversation_vm.md`](research_conversation_vm.md) —
  `TalkFlags[256]` is persistent conversation state serialized in
  `objlist`; the conversation files' LZW layer.
- [`research_object_interaction.md`](research_object_interaction.md)
  — the interaction commands mutate exactly the object state that
  gets serialized here.
- [`../CLAUDE.md`](../CLAUDE.md) §"Modern-browser UX as architectural
  anchor" — DOS floppy prompts (`DISK_confirm`), region paging, and
  the flat-dump format are substrate residue; the *state set* is the
  spec, the *format* is not.
