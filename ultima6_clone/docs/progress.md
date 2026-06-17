# progress — ultima6_clone

The implementation-step ledger (matches `asteroids_clone` / `phoenix_clone`
convention: numbered `I-N` steps, each with a "scope" subsection carrying the
per-sub-step notes that don't fit a commit body). Research-side truth lives in
`research_*.md`; the architecture the steps build to is `architecture_ecs.md`.

**Status: I-spellbook (minimal `c` cast) COMPLETE (2026-06-17).** Press `c` → a spellbook modal listing all 80 named U6 spells by circle (reagents tinted by what the party carries); `Enter` casts. 7 non-combat spells hook already-ported subsystems — **Locate** (sextant from the viewport origin, `C_1944_42AC`), **Mass Awaken** (clear `AI_SLEEP` in an avatar-centred area), **Create Food** (`GiveObj OBJ_081 ×rand(1,10)`), **Heal** (roster picker → rand(1,30) HP, clamp `maxHP`), **Telekinesis** (a far lever `OBJ_10C` / crank `OBJ_120` via the USE registry, else a one-tile plain push), **Unlock Magic** (clear a magic-locked door/chest frame), **Gate Travel** (phase 1–8 → the I-moongate `D_2C74` endpoint) — every other named spell **fizzles**. NO spellbook-item / reagent gate / mana / INT-circle / combat (deliberate, `research_spellbook.md §1`). New `resources/spells.js` (verbatim `seg_1944.c` tables), `view/spellbook_window.js` (the `c` modal), `systems/cast_spell.js` (registry + effects); `command_dispatch` gains a `pendingVerb='spell'` cursor (`armSpell`/`runSpellTarget`) + `resolveMove` a `plain` flag; `world_loader.giveToInventory` = the GiveObj analog. No new components / no snapshot change. **`tests/test_spellbook.html` 34/34** + full suite green (18 harnesses) + live-verified (`c` opens the book on real U6 data). See §"I-spellbook scope". **Next: no fixed step** — remaining object-action (`USE`) handlers are demand-driven (each lands with its owning subsystem or as a one-off, not a numbered step); the next `I-N` is named when a concrete need is scoped. Prior: I-container (§"I-container scope"), I-19g (§"I-19g scope"), I-book (§"I-book scope"), I-egg (§"I-egg scope"), I-moongate (§"I-moongate scope").

This banner is the **single canonical current-status line** — `CLAUDE.md` and
`DOCUMENTATION_INDEX.md` point here instead of mirroring it (convention: §"Doc maintenance").
**Per-step detail** lives in each step's **§"I-N scope"** section below; **at-a-glance status**
is the **ledger**. Standing cross-cutting items, each with its own section: the **post-I-9
deviation audit** — idle-heartbeat fork **DECIDED (keep heartbeat; settled model = DEXTE-paced
per-actor accumulator — a modern rewrite of the MovePts/DEXTE economy, NOT a round-driver port:
one master `WORLD_SPEED` slider, decoupled clock, snap tile-to-tile, fixed-brisk non-laggy player,
no auto-pass)**; the movement-model impl (I-14) + I-9f drop stay **deferred** (§"Post-I-9 — deviation
audit"); the **render-to-fit viewport** refinement landed 2026-06-05 (§"Render-to-fit viewport").

## Doc maintenance — keep status in ONE place

To avoid rewriting the same status prose in five files per step (the drift that left this
banner ballooned and `DOCUMENTATION_INDEX` stale at I-10), the convention is:

- **This banner** is the single canonical current-status line — one line: `I-N (title)
  COMPLETE; Next: I-N+1`, plus standing cross-cutting deferrals. Don't paste sub-step detail
  here; it's in §"I-N scope".
- **Per step, the only substantial writes are** a new **§"I-N scope"** section (the real
  record — decisions, sub-steps, deviations) + a terse **Journal** entry (discoveries +
  next). Everything else is a one-line touch: this banner, the **ledger row**, the
  `CLAUDE.md` stage pointer, and the memory pointers.
- **`CLAUDE.md` "Project stage"** and **`DOCUMENTATION_INDEX.md`** carry a pointer here, NOT
  a status mirror. `CLAUDE.md`'s durable content (architecture, conventions, kept-deviations,
  code layout) is what changes rarely and stays there.

---

## Step ledger

| Step | Title | Status |
|---|---|---|
| **I-1** | **terrain on screen** (ECS core + overworld render + demo entities) | **done** |
| **I-2** | **world-data system** — load `OBJBLK*` objects + `objlist` NPCs into real ECS entities (drawn + spatial-indexed; `ObjManager` dissolved) | **done** |
| **I-3** | world clock (game-time tick → schedules; `D_2C55` computed but unconsumed) | done |
| **I-4** | **tile passability** — `canStandAt` primitive (walks-only body) + footprint util + HUD cell probe | **done** |
| **I-5** | **NPC schedule resolution** — hourly slot snap (pathfinding + pose sprites deferred) | **done** |
| **I-6** | **inventory data layer** — CONTAINED/INVEN/EQUIP entities + `Container`/`ContainedIn` components; resolve OBJBLK's in-file `GetAssoc` against live entities (deferred from I-2). No UI. | **done** |
| **I-7** | **UI substrate + object inspector view** (first surface) — modal stack + input routing + turn-driver gating + list-with-cursor + atlas-icon DOM rendering; `I` hotkey opens inspector on hovered cell | **done** |
| **I-8** | **avatar movement + party follow** — 8-dir avatar move (camera follow + facing-on-step + idle settle) + companion conga via `MoveFollowers` formation-greedy-step (avatar walks through followers; party settles when idle). Sub-steps a–e. Shares the single-step move kernel (`canStandAt` + `insertAtHead` + facing) with I-9; does **not** use the path builder. | **done** |
| I-9 | **NPC pathfinding** — `C_1E0F_2D37` bucket-Dijkstra + `AI_FINDPATH`→`AI_ONPATH`→`__DoOnPath`→`__AtDestination`; wires into the I-5 schedule trigger so NPCs **walk** to slots (near the player) or **teleport** to them (far/off-screen, `C_1E0F_291C`), then settle the arrival worktype (+ edge-seek for far slots, humanoid door pass-through, teleport-to-previous on reschedule, first-tick alignment at load). Makes Britain feel live. | **done** (a–h; i dropped) |
| I-10 | object-action dispatch core — `Map<verb,handler>` + `Map<ObjectType,useHandler>` registries; verb-first front-end + message channel + fixed UI shell; USE door/lever/switch/crank, LOOK + GET/DROP, MOVE push + give, the inventory window | **complete** (a–j — USE/LOOK/GET/DROP/MOVE-push/give + inventory window; further USE cases demand-driven) |
| I-11 | talk trigger — adds TALK as a case in the I-10 dispatch (reach-7 target-pick + the can-talk gate; single-stage, stops before the conversation VM) | **done** (a–c) |
| I-12 | dialog window — second surface on the I-7 substrate; opens when TALK fires (modal frame + four-region layout + real lazy-decoded portrait; chips/input inert — I-13 wires them) | **done** (pre-step + a–c) |
| I-13 | conversation VM — **standalone generator yielding typed effects** + host driver; swaps the I-12 window's placeholder body for real lines + clickable `@`keywords/chips + live input. β reached: walk + talk works end-to-end against real `converse.a/.b`. | **done** (pre-step + a–g + review; squashed) — **+ fix 2026-06-15: `run()` skips the `PREFIX`+`MAIN` double marker (33/200 scripts ended right after the look-line); see Journal** |
| I-14 | **NPC movement speed (DEXTE-paced accumulator)** — replace I-9's flat step-rate with a per-actor `moveCredit` accumulator (DEXTE = speed meter, `SubTerrainMov` = step cost); a *modern rewrite* of the `MovePts`/`DEXTE` economy, NOT a `C_1E0F_4E0A` round-driver port. One master `WORLD_SPEED` slider, decoupled clock, snap tile-to-tile, fixed-brisk non-laggy player. Restores terrain-/dex-speed + staggering, fixes the flat-step thrash. Foundation for the NPC-movement arc. | **done** (a–e; squashed + pushed) |
| I-15 | **drunk-walk approach** — `TryMoveTo` greedy fallback chain + `__TryDiagMove` corner-clearance (the pathfinding-less move primitive for chase/flee). Rides on I-14. New `systems/drunk_walk.js`; no live consumer yet (I-17 wires it); dev hook `__U6.driveTo`. | **done** (a–c + step-aside; squashed + pushed) |
| I-save/load | **save/load — full-snapshot JSON persistence** — generic ECS snapshot (every live entity's components + mutable resources) → JSON; Export downloads, Import re-uploads + restores on reload. Restore *replaces* `loadActors` and re-marks `loadedRegions`, so deletions stay dead + mutations survive without tombstones (`research_save_load.md`). Non-numeric label keeps the I-16…I-19 arc intact. | **done** (a–g, 2026-06-10) |
| I-16 | **arrival behaviors + direction system** — `__AtDestination` prop lookup for sit/sleep/eat/play (`C_1E0F_2184` + `FindLoc`/`NextLoc` multi-tile footprint + `D_0658`) + fallbacks, eating dynamic facing (`C_1E0F_2125`), the `C_1E0F_0664` frame system (humanoid + non-humanoid per-type arms) + chair-overrides-facing, sprite-restore-on-wake, and (d) `AI_SCHEDULE` continuous-settle (`resolveActiveSlot` + per-tick `__AtDestination`). | **done** (a–c + 2 review fixes + d; carries the AI-mode dispatch coverage table) |
| I-17 | **NPC AI behaviors** — the moving worktypes as active per-turn behaviors: `WANDER`/`GRAZE` (`C_1E0F_37DB`), `LOITER`/`FARM` (`C_1E0F_33C4`), `GUARD` pacing, via the probability×accumulator contract; + **I-17d** displaced settle-in-place NPCs stand aside on a shove & return to post + re-pose when the slot clears. `RINGBELL` split to its own later step; thief/law + combat deferred by design. See §"I-17 scope". | **done** (a–d) |
| I-18 | **party status UI — on-demand, NOT a fixed panel.** `P` → roster (icon/name/HP) → member digit → ZSTATS (portrait + STR/DEX/INT + Magic/Health cur/MAX + Lvl/Exp) → `Tab` ⇄ inventory, all on the UIStack; stats read straight from the **objlist** (NO `Stats` component — Option B; `MaxHP`/`MaxMagic` ported to `stat_formulas.js`). GIVE → in-stack recipient-picker (bare-map give + direct digit-inventory paths retired). Layout: fixed status panel removed → map full-width, clock → persistent strip, dev HUD → floating show/hide. Avatar portrait via `D_2CCB` (factory data → `z[6]`/D_2CCB 7 male-face default). **g/h/i** = equipped-equipment view (de-scoped paperdoll): equip-slot list beside the carried list + weight gauge + `E` equip/unequip (source gates, bagged-equip re-parents out) + **k** `M` "move to…" picker (move items in/out of bags, both directions). | **done** (a–k, 2026-06-12) |
| I-19 | **level change — `USE ladder` → multi-z dungeons.** Activate the already-decoded dungeon levels (`assets/map.js` decodes all 6; `MapLevel.dungeonTileIndex` ready; `Position.z` exists) + port `C_101C_089E` (z_incr direction + coordinate rescale + avatar reposition + reload/recompose). Single `SpatialIndex` + active-z filter; dungeon NPCs live; camera/bounds switch surface(1024-wrap)↔dungeon(256-wrap) per level. **Reframed 2026-06-12** (was "object-action handlers expansion" → re-homed to the demand-driven handler backlog). See §"I-19 scope" + `research_level_change.md`. | **done** (a–f, 2026-06-13) |
| **I-19g** | **dungeon/cave entry by walking onto a hole** — the faithful auto-trigger I-19 deferred (§6): stepping onto an entrance hole (`OBJ_146`/`OBJ_134`) descends, via the `C_1E0F_184D` dungeon/cave branch (`checkDungeonEntry`) → the shared `C_101C_089E` engine (extracted from `useLadder` into `enterLevelChange`). `checkGateEntry` now returns "traveled" so `main.js` runs the hole check single-dispatch (a tile is a gate **or** a hole). **No USE-on-hole** (source has none). `tests/test_dungeon_entry` 11/11. See §"I-19g scope" + `research_level_change.md §7`. | **done** (2026-06-16) |
| **I-moongate** | **blue + red moongate subsystem** — blue (`OBJ_055`) lunar-phase-routed, player-mutable `D_2C74` 8-endpoint network (hourly spawn `C_0A33_121A` + walk-in `GateTravel`; `USE moonstone` relocates an endpoint) · red (`OBJ_054`) Orb-of-the-Moons (`OBJ_057`) fixed-ROM single-use net · new-game `D_2C74` seeding from the `D_2C4A.c` constants · the player-facing **sky-view** (clock panel) + **gate-readout** (dev HUD). Pulled out into its own named step (like `I-save/load`). See §"I-moongate scope" + `research_moongate.md`. | **done** (a–e + g/h, 2026-06-13; f out of scope) |
| _(no number)_ | **Remaining object-action (`USE`) handlers** — demand-driven; each lands with its owning subsystem (as I-moongate / I-container / I-spellbook did) or as a one-off, **never a numbered step**. _(Earlier drafts tracked these as a numbered "I-20" bucket — still referenced in some step histories below; the number is dropped.)_ | n/a |
| **I-book** | **book / sign reading** — completes the LOOK verb (I-10f stopped at "Thou dost see…"). `LOOK` at a readable object (`C_27A1_06D7` CanRead → `C_27A1_078F`) opens its `BOOK.DAT` text in a scrollable reader modal. `resources/books.js` (u16 offset-table reader, keyed by quality; no compression) + `view/book_window.js` (modal + U6-markup renderer: `<>` gargoyle / `@` highlight / `*` paragraph / `&`·`\` stripped) + the LOOK-handler readable-type tables (`D_1CDA` books adjacency-gated / `D_1CE4` signs any-range, quality>0). `book.dat` = OPTIONAL BYO-data. `tests/test_books.html` 19/19. See §"I-book scope". | **done** (2026-06-16) |
| **I-egg** | **egg / creature-spawn system** (Path A, named 2026-06-14) — port `OBJ_14F` hatch (`seg_2E2D.c`): **a** data/decode · **b** hatch core (gates + embryo loop + alignment override + `SetHatched`/`SetInvisible`, spawns a placeholder/statless creature) · **d-visual** multi-tile bodies (place + link part-entities — dragon/hydra/serpent/vine + two-part cow/horse/giant-ant/etc.) · **c** avatar-keyed trigger (hatch on avatar entry into new territory, viewport-`nearRadius` proximity; `LOCAL` bypass) + force-hatch on the I-moongate `teleportParty` path · **e** cull + re-arm (avatar-keyed lifetime pass, §9.1; culls parts with the body) · **f** gargoyle pacification (Amulet/party-type → `AI_GRAZE`) + Shamino direction warning. **Spawn always stamps the embryo's AI mode (`NPCMode`/`NPCComMode`); unhandled modes idle, implemented I-16/I-17 worktypes apply automatically — NO combat** (`research_egg.md §9.1` pt 5). **Sub-step d is SPLIT:** **d-visual** (multi-tile bodies) is combat-independent and **IN I-egg** — a full-world objblk scan showed **234/943 eggs (~25%) hatch multi-tile creatures** (Dragon 55× / Giant Ant 69× / Alligator 39× / Hydra / Cow / Horse / Vine / Serpent), so deferring it would stub a quarter of all hatches; **d-stats** (`EGG_generate`+`D_3522` stat roll + loot) stays **combat-gated**. See §"I-egg scope" + `research_egg.md`. **d-stats + combat deferred.** | **done** (a · b · d-visual · c · e · f, 2026-06-14) |
| **I-container** | **USE-on-container** — a USE handler that opens a chest/barrel/crate on the map (`C_27A1_2BBC` + the shared `C_27A1_09A1`) and **spills its contents onto the ground tile** (source-faithful — reuses `dropToMap` + the `GET` verb, *not* a window); chest lock = a matching party key (`OBJ_040`, quality-matched per `C_27A1_2D8E`) opens cleanly, else force-open bypass (door-spirit); trap = message + consume, damage deferred to combat; filters `OBJ_150`/`OBJ_151` pseudo-items. Set = `{062 chest, 0BA barrel, 0C0 crate}`. **Sub-step d** adds the inverse — MOVE/DROP an item onto an open container to put it inside (`C_27A1_00A9` + `InsertObj CONTAINED`, the `moveToInventory` analog; full insert set incl. backpack/bag/basket/vortex-cube). Self-contained; **not** a Telekinesis dependency. `test_container` 31/31. See §"I-container scope". | **done** (a–d, 2026-06-17) |
| **I-spellbook** | **minimal cast feature** — `c` → spellbook modal (all named U6 spells + reagents); `Enter` casts. Only 7 non-combat spells that hook already-ported subsystems are implemented (Telekinesis / Locate / Gate Travel / Heal / Mass Awaken / Create Food / Unlock Magic); the rest fizzle. No spellbook-item / reagent-gate / mana / combat. See §"I-spellbook scope" + `research_spellbook.md`. | **done** (a–c, 2026-06-17) |

**Why I-2 is the world-data system.** Loading the real world from `OBJBLK*`/
`objlist` into ECS entities is the clone's core purpose — the reason for choosing
ECS at all — and the heaviest architecture validation: the `SpatialIndex`
(`Map<cell→entity[]>`), the `ObjManager` dissolution (god-object → component
stores + spatial resource + systems), the per-cell chain Z-order, and the
`basetile` (obj_number → tile) decode all land here. It comes first after the
render slice so the ECS architecture is exercised on the real thing as early as
possible, and so I-1d's demo entities are replaced by the genuine populated world.
It folds in what was a separate "NPC entities (drawn)" step — NPCs are just
entities with `AIMode`+`Schedule`; their scheduled *behaviour* is I-5.

**Why I-3 → I-4 → I-5 in this order (NPC movement before the avatar).** NPC
scheduled movement is the prize (it never existed in the legacy port), so it comes
before the avatar — NPCs run on the sim/turn heartbeat (`TurnClock`), independent
of any player. Its two hard prerequisites come first: the **world clock** (I-3)
drives the hourly schedule lookup `C_1E0F_5165` (no clock → no "where should this
NPC be now"), and **tile passability** (I-4) is what the bucket-Dijkstra
pathfinder `C_1E0F_2D37` + movement-legality `C_1E0F_000F` walk on (object-blocking
comes from I-2's `SpatialIndex`). The avatar reuses the same passability primitive
when its movement step lands (I-8 in the re-planned trajectory). See
`research_npc_ai.md`.

**Why the post-I-5 trajectory re-plans inventory + UI ahead of avatar (decided
2026-05-31).** The originally-scoped "I-8 dialog UI window" is rescoped into a
broader **UI substrate** (modal stack + input routing + turn-driver gating +
list-with-cursor + atlas-icon DOM rendering) shared by every later UI surface
(object inspector, status panel, save/load, spell select, conversation). Its first
consumer is the **object inspector** (I-7) — the heaviest UI consumer in primitive
usage, so the substrate is battle-tested by a real surface rather than
aspirationally general. To feed the inspector, the **inventory data layer** (I-6)
lands first: parse CONTAINED/INVEN/EQUIP records into entities, resolve OBJBLK's
in-file `GetAssoc` against the live entity space (the bit deferred from I-2).
Avatar movement (I-8) and NPC pathfinding (I-9) then land as two adjacent steps.
They share the **single-step move kernel** (`canStandAt` + `insertAtHead` +
facing-set) — and facing-on-step (pathfind-walker) + facing-on-snap (schedule
trigger) want the same direction logic — but **not** the path builder: a source
read 2026-06-01 confirmed `C_1E0F_2D37` (bucket-Dijkstra) is used by NPC AI alone;
the avatar steps on player input and companions trail via `MoveFollowers`' greedy
step, neither of which path-builds. (An earlier draft of this ledger folded the
two into one step "because both consumers share `C_1E0F_2D37`" — that was wrong,
and is why they are now separate steps: one step = one squash commit, and the two
have distinct payoffs + verification methods.)

**Object-action dispatch (I-10) precedes talk trigger (I-11).** U6 doesn't have
"USECODE" in the Ultima 7 sense — instead source uses two distinct mechanisms:
a stack-based bytecode VM at `seg_1703.c` for NPC dialogue (the conversation
VM, I-13) and a hardcoded C dispatch table at `seg_27a1.c` for object actions
(USE / GET / LOOK / DROP / PUSH / SEARCH per `OBJ_xxx`). The object-action
dispatch is the more general primitive: TALK is just one case in the same
"press a key, do X to the entity in front of me" pattern that USE/GET/LOOK
share. So I-10 lays the dispatch infrastructure with a minimum handler set
(door USE, generic LOOK, GET/DROP via inventory) — enough to walk around
without getting stuck. I-11 then adds TALK as a new case alongside, plus the
adjacency-pick logic ("which NPC am I facing?"). I-15 (post-β) fills in the
rest of `seg_27a1.c`'s table (spellbooks → `C_27A1_2D8E`, moonstones →
`C_27A1_3425`, instruments → `C_27A1_5935`, etc.), each gated on its owning
subsystem becoming available.

The β path (walk + talk) reaches at **I-13**, later than the prior plan, but
the conversation VM lands with full give/take semantics rather than stubbed
inventory opcodes; the world feels alive sooner via inventory inspection
before agency exists; and the object-action dispatch is in place from I-10 so
β includes "USE on doors works" rather than requiring a follow-up step.

**Binding design decisions for the substrate (decided 2026-05-31).**
- **Object inspector, not container view.** ONE inspector surface for any
  entity — sword, NPC, barrel, chest. Identity (sprite + name + type) always
  shown; contents-list area conditional on `Container` component (empty/absent
  for non-containers).
- **Modal-stack pattern for nested containers** — opening a container child
  pushes a new inspector modal on top of the existing stack (not inline tree
  expansion). Each modal lists ONE level of children; the window manager's
  z-stack handles the rest. Cleaner widget, matches source's "open this then
  open that" interaction model.
- **Turn-driver suspended for the entire modal-stack lifetime.** When any
  inspector opens, `TurnClock.suspend()` fires; every sim-system activity
  (schedule snaps, NPC moves, clock advance — all turn-driver-gated work)
  pauses until every modal in the stack closes, then `TurnClock.resume()`.
  No schedule snaps fire while the player inspects. Matches source's
  "world pauses during inspection" behavior and the existing dev HUD's
  pause button mechanism.

Steps past I-2 are the visible-progress trajectory, not a committed sub-step plan
— each step's real breakdown is written into its "scope" subsection when it
starts, after pre-impl research for its trickiest part. Deferred-to-later
subsystems (combat, magic, save/load, audio) fold in after the β path lands.

---

## I-1 scope — terrain on screen

**Goal:** Britain's overworld rendered on canvas, drag-scrollable, with a few ECS
entities drawn through the real runtime core — so the first visible payoff doubles
as the first integration test of `architecture_ecs.md`'s runtime ground. Design
rationale + the renderer seam are in `research_i1_render_slice.md`; do not restate
them here.

**Renderer seam (locked):** reuse the legacy draw mechanism + terrain feed; drop
the `ObjManager`-coupled collection; lift `drawObject`'s marshal rules into the
RenderSystem *with* the pillar-bug fix (`research_map_render.md:603`); defer the
upload-strategy (full-rebuild for I-1's few entities). Tile flags live in
`TileRegistry` keyed by tile ID; `Renderable = { tileId }`.

**Sub-steps** (each ≈ one save-point commit, browser-verified before the next;
final squash → one `[ultima6_clone] impl I-1 (terrain on screen)`):

- **I-1a — ECS core skeleton.** `World` = generic container: allocator
  (`freeStack` + `generation[]` + `highWater`; `create` / `destroy` / `resolve`),
  component-store registration (plain SoA), 64-bit signature mask
  (`sigLo` / `sigHi`), `query` generator, `store(Comp)` handle, resource `Map`,
  two-list scheduler (`renderSystems` / `simSystems`) + frame fn
  (`poll → decide-turn → maybe-sim → render`). No rendering.
  *Verify:* in-memory test — spawn/destroy/query a few entities; a stale handle is
  caught by generation mismatch; query yields the right ids. Log to console.
  **DONE** — `ecs/world.js` + `ecs/test_core.html` (29/29 checks: generational
  stale-handle + slot reuse, 64-bit signature lo/hi boundary, capacity growth,
  TurnClock turn-driver fires on action/idle and suspends correctly).

- **I-1b — Asset pipeline as ES6 modules + data load.** Copy-then-own the legacy
  decoders (`palette_manager`, `tile`, `lzw_decoder`, `u6map`, `anim_data_manager`)
  as clean ES6 modules; wire the bring-your-own-data flow dropzone → `U6DB`
  (IndexedDB) → decode → `TileRegistry` resource (tile atlas + per-tile flags) +
  `MapLevel` resource (chunks + `worldTileIndex`). No bundled assets.
  *Verify:* checklist gate shows the required files present; log a known tile's
  flags read back from `TileRegistry`.
  **BUILT** — `assets/{lzw,palette,tiles,map,tile_flags,anim}.js`, `u6db.js`,
  `resources/{tile_registry,map_level}.js`, `index.html` + `main.js`. Dropzone
  supports **loose files OR a .zip** (dependency-free `assets/zip.js` using the
  browser's `DecompressionStream('deflate-raw')`; basename-matched against the
  expected set, ultima7 pattern). Plumbing verified (modules import clean, U6DB +
  checklist gate work, zip round-trip 6/6 in `tests/test_zip.html`). **Decode
  VERIFIED on a real U6 zip** — all 11 files unpack, tile at (276,367) = "earth",
  file sizes match formats exactly.

- **I-1c — Terrain render.** `RenderSystem` draws the terrain layer via the reused
  `Shader` (`createLayer` / `updateLayer` / `render`) fed from `MapLevel`;
  `CameraSystem` handles drag-scroll (reuse the `mapOrigin` viewport logic) and
  re-queries terrain on move.
  *Verify (browser):* Britain visible at the default origin `(276, 367)`;
  drag-scroll repaints smoothly; no console/WebGL errors.
  **DONE** — `view/renderer.js` (TileRenderer: consolidated Shader + R8 atlas +
  palette texture; the GR_42-dispatch analog), `resources/camera.js`,
  `systems/{render_system,camera_system}.js`, canvas + rAF loop in `main.js`.
  Britain renders correctly on the user's real data (grass / animated water with
  sandy coastlines / buildings); pan verified (camera move re-fills + redraws); no
  errors. **Source-faithful render mechanics** (raw tile-ids first rendered
  transparent water bases as black): (1) apply the **animdata frame remap** before
  drawing — the legacy/Origin never draw raw water tiles (also gives animated
  water); (2) coastlines are a **two-layer composite** like the legacy/Origin —
  layer 0 base replaces shore tiles 16-47 with their water-base tile
  (`SHORE_TO_WATER`, map_viewer.js:150), layer 1 overlay draws the shore graphic
  on top (animmask-transparent pixels show the water through). Sub-pixel smooth
  scroll via a `u_scroll` uniform. Origin terrain-render comparison captured in
  `research_i1_render_slice.md §8`.

- **I-1d — ECS entity layer (the integration test).** Spawn a few
  `Position` + `Renderable` entities (e.g. a tree / sign from `objtiles.vga`);
  `RenderSystem` walks the `SpatialIndex` → `query(Position, Renderable)` →
  `TileRegistry` flag lookup → **corrected per-tile** layer routing + double-tile
  expansion → entity-layer sub-buffer → reused `Shader`.
  *Verify (browser):* entities render at correct world positions, stay anchored
  while the camera drags, and a double-height tile places its head cell correctly
  (the pillar-bug fix is exercised here).
  **DONE** — `components/components.js` (Position, Renderable),
  `systems/entity_system.js` (`EntityRenderSystem`), demo spawn + present step in
  `main.js`. Entities `query`'d each frame, double-tile expanded (C_1184_35EA), and
  routed **per-tile** to overlay layers 2 (lower) / 3 (top) by each tile's own
  `isTopTile` — the pillar-bug fix. Verified on real data: moongate (double-W) +
  skewer (double-H) render over terrain with transparency, stay anchored on pan;
  layer split 4 low / 1 top confirms per-tile routing. **Simplifications vs Origin
  (deferred to the object system):** layer model instead of the per-cell chain
  Z-order; `query`+viewport-cull instead of a spatial-index walk. Origin object-
  render comparison in `research_i1_render_slice.md §9`.

**Pre-impl research done:** `research_i1_render_slice.md` (render seam),
`research_map_render.md` (pillar-bug root cause + fix), `architecture_ecs.md`
(runtime ground). No further research blocks I-1.

## I-2 scope — world-data system

**Goal:** load the real world (`OBJBLK*` objects + `objlist` NPCs) into ECS entities,
drawn through a spatial-index-driven per-cell painter's render, `ObjManager` dissolved.
Landed as ONE squashed commit (I-2a+b+c) — a correct display needs the data *and* the
faithful render together (Zane's call).

- **I-2a — decoders + load gate.** `assets/{basetile,objblk,objlist}.js` (copy-then-own
  from the legacy `ObjManager`). BYO-data gating: require `basetile`+`objlist`;
  recognise/count `objblk*`. Also fixed an I-1 misclassification (`animdata` +
  `animmask.vga` are render-required, not optional). objlist layout verified against
  `seg_0C9C.c:297-321` (25 sections / 7283 bytes, size-driven read; `D_8C42` is the
  pathfinding buffer, not "per-NPC palette") — see `research_save_load.md`.

- **I-2b — components + SpatialIndex + loader (ObjManager dissolution).** Components
  `ObjType`/`Status`/`Amount` + `Actor` tag; `SpatialIndex` resource
  (`Map<packedXY→entity[]>` + `loadedRegions` + `dirty`). `world_loader.js`:
  `loadActors` (NPCs, eager-resident) + `loadRegion` (OBJBLK per region, demand-loaded,
  idempotent/cached) + `ensureRegionsInView` + `makeStreamingSystem` (camera-driven).
  Only on-map (LOCXYZ) objects/NPCs become entities; containment deferred — the in-file
  assoc index (16-bit, source `GetAssoc`) isn't carried into the ECS (see
  `research_world_data.md`). Verified: 1837 entities (188 NPCs + 1649 objects, CC+CD),
  1488 spatial cells.

- **I-2c — per-cell painter's render + palette cycling.** `WorldRenderSystem`
  (spatial-walk + 4-zone cross-cell order: **background → normal → FG-hotspot →
  FG-extension**) replaces I-1d's 2-zone `EntityRenderSystem`. Within-zone
  order: for each visible cell, gather all contributions (own anchor + the 3
  neighbor anchors whose 2×2 footprint can reach in), then sort by a
  **type-based z-priority** (`Actor=1`, else=0) then the contributing object's
  **anchor `(Y,X)` descending** (JS stable sort keeps same-`(zPri,Y,X)` ties in
  reverse-scan order) before emitting to the zone lists — `Actor` entities end up
  drawn last within zone = on top of furniture/floor objects, and among equal-
  priority objects the **lower-`(Y,X)` anchor draws on top** (source's object-visit
  order: the position-sorted `Link[]` chain + HEAD-insert + head→tail blit). The
  z-priority replaced an earlier "reverse load order" iteration that broke for
  double-tile extensions reaching IN from a neighbor (the LB-throne bug surfaced
  post-I-5); the **anchor-`(Y,X)` key (added 2026-06-15)** extends that fix to the
  object-vs-object case — a broken lens at (124,194,z5) was hidden under an altar's
  2×2 extension (same bug class, but no `Actor` to break the tie). See
  `research_map_render.md §"Painter's algorithm"` for the full source-vs-clone
  comparison + the deferred fgExt/bg-direction caveat. Two render channels extracted as systems:
  `TileAnimationSystem` (animdata frame-remap → `reg.animDirty`) and
  `PaletteCycleSystem` (the 0xE0–0xFC palette-register shimmer, ported from the legacy
  `colorCycling`). Painter's algorithm decoded from `ShowObject` (seg_1184.c:1651) and
  documented (source + clone) in `research_map_render.md` §"Painter's algorithm".
  **Flag corrections (source-verified, the legacy port misread two):** "isTopTile" =
  `IsTileFor` (Foreground) → renamed **`isForeground`**; "isForceLowerTile" = `IsTileBr`
  (Breakthrough — an AI/movement flag, NOT render) → renamed **`isBreakthrough`**,
  dropped from render; the real render-bottom flag `IsTileBa` (Background) was missing →
  added as **`isBackground`**. Verified on the Lycaeum (`objblkhg`): pillar heads on top
  (2×2 frame-3 → FG extension) and the carpet over the `IsTileBa` platform-edge steps.

**Deferred (noted):** containment/inventory entities; the exact same-Z/same-cell tie
(reverse-load-order matches source for NPC-over-floor + objblk top-first, but a true
same-position tie is merge-sort-undefined in source anyway); the `objlist` `D_8C42`
pathfinding buffer + global block (feed I-3/I-5).

## I-3 scope — world clock

**Goal:** game-time advances per turn; the date/time cascades minute → hour → day →
month → year; `D_2C55` (sun-strength byte) is computed and stored on the clock for
future consumption; an hourly hook list lets I-5 register its schedule re-check. **No
ambient-light render** at I-3 — the visible day/night transition on the map lands
in a later step alongside the lighting subsystem (see below). A small dev/cheat HUD
overlays the canvas so the clock is visible + manually steppable across the
remaining impl steps.

**Why no ambient-light render at I-3.** Pre-impl source read (2026-05-30) corrected a
misleading research-doc summary: `D_2C55` is the SUN-STRENGTH **input** to a per-cell
flood-fill lighting model, NOT a render-side ambient tint. A faithful port requires
`AreaFlags[][]` + `AreaLight[][]` + `C_1100_0131` BFS + per-cell tile substitution
(`TIL_0FF` / `TIL_1BC`) + obscurity overlay pass — all of which need (a) a
player-position source (avatar from I-8), (b) richer tile flags than I-1/I-2 decoded
(`IsTileWin`, `IsTileOpa`, `GetTileLight`), and (c) a render-path change. Defer to its
own later step. Full decode: `research_map_render.md` §"Lighting + visibility model";
correction trail: `research_game_loop.md` §"Time-advance" phase 9 + key takeaway.

**In scope:**

- `WorldClock` resource: `Time_H`, `Time_M`, `Date_D / M / Y`, `D_2C55` (stored).
- `WorldClockSystem` (sim-list): per turn, call `clock.advance(1)`. Cascade per
  `seg_0A33.c:853-885`. Recompute `D_2C55` per `seg_0A33.c:918-931`.
- Hourly hook list: `onHour(cb)` registration on the clock; hooks fire once per
  hour-rollover during `advance()`. Ships empty at I-3; I-5's NPC schedule
  re-check (`C_1E0F_5165`) is the first registrant.
- Dev/cheat HUD: corner overlay showing `Year Y · M D · HH:MM · ☀ D_2C55 ·
  hours fired N` + controls (pause/resume the turn-driver, ±10m and ±1h time
  jumps). `+1h` matches source's Alt+215 debug hotkey (`C_0A33_1355(60)`).
  Always-visible during development; hide-vs-toggle (e.g. backtick) revisited
  when the real status panel ports.
- Verification: live on the canvas via the HUD (clock ticks, ± jumps + rewind,
  pause freezes auto-advance, paused border tint) plus `tests/test_clock.html`
  (20/20 for the pure data class).

**Out of scope (deferred to later steps):**

- Ambient light render — its own later step after I-8 (avatar exists), with its own
  pre-impl research. ~1-2 days on its own.
- Spell-FX timers, powder keg, eruption — depend on combat / spell-FX components
  not landed.
- Per-minute status-effect rolls — depend on combat components.
- Torch fuel / ring procs / storm cloak rolls — depend on inventory components.
- Sundial tile rewrite, moon phase recompute, moongates spawn/despawn — each its
  own small subsystem; defer.
- Wind reroll — no ships.
- Music hooks — no audio.
- Real status panel — `seg_0A33.c:933-936` `CON_printf(DateMsg, ...)`. The
  dev/cheat HUD substitutes during development; the status-panel port is its
  own step.

**Estimate:** ~1-2 hours of focused work — beyond the small DOM HUD, no new render
path and no new asset decode; the two-clock architectural seam (`TurnClock`
resource + `frame()` orchestration) is already in `ecs/world.js` from I-1a, so
I-3 is purely additive.

## I-4 scope — tile passability

**Goal:** `canStandAt(world, x, y, { actorId })` — a pure predicate, NOT a
scheduler-registered system, called by I-5 (NPC path step) and I-6 (avatar
input) to decide whether a single tile move is legal. Mirrors source's
`C_1E0F_000F` (`seg_1E0F.c:66-235`); the walks branch only — the signature is
source-shaped (covers any monster class), the body grows by adding
`if (swims) …` arms in-place when later subsystems bring those classes online,
without touching callers (`research_npc_ai.md` §"Movement legality").

**Sub-steps** (each ≈ one save-point commit, squashed at the end → one
`impl I-4`):

- **I-4a — flag accessors (walks subset).** Five accessors on `TileFlags` +
  passthroughs on `TileRegistry`: `isTerrainImpassable` / `isTerrainWet` /
  `isTerrainWall` / `isTerrainDamage` (TerrainType plane @ 0x0000) +
  `isTileIgnore` (D_B3EF plane @ 0x1400). Source-name comments on each line
  preserve the citation (`IsTerrainImpass`, `IsTileIg`, etc.) per
  [[expand-source-abbreviations]] — JS gets the full word, comment carries
  the cryptic source short-form. 32 unit cases in
  `tests/test_passability.html` cover plane isolation + last-tile (2047)
  boundary.

- **I-4b — shared footprint utility.** Extract the 2×2 expansion previously
  inline in `world_render_system.js` into `systems/tile_footprint.js`:
  `forEachOccupiedCell(reg, tile, anchorCol, anchorRow, cb)`. `WorldRenderSystem`
  switches to it; no behavior change. Shared by two consumers — render's
  painter zones (needs the per-cell tile id + `isExt` flag) and passability's
  "what blocks at (x,y)" iteration (only needs the cell coords). Render
  verified pixel-identical on Britain after the extract.

- **I-4c — `canStandAt` primitive (walks-only body).** New
  `systems/passability.js`. Iterates the 4 candidate anchor cells whose 2×2
  footprint could cover `(x,y)`; per entity, calls `forEachOccupiedCell` to
  find the per-cell tile that actually lands on `(x,y)`; checks Breakthrough
  (short-circuit unless `IsTileIgnore`) + object-tile `IsTerrainImpassable`
  + NPC always-blocks. Skip-self via `actorId` (entity handle). Initial
  function name `canWalk` was renamed to `canStandAt` mid-step to match
  source's broader semantic — the walks-only body grows into the full
  predicate by adding `if (swims) …` / `if (flies) …` arms inside, rather
  than spawning sibling `canSwim` / `canFly` predicates that would leak the
  class switch into every caller. 19 synthetic-fixture unit cases:
  empty-cell pass, impassable terrain block, breakthrough-overrides-terrain,
  impassable object block, door open vs closed (via per-frame tile flags,
  no `OBJ_xxx` special), NPC blocks, skip-self, 2×2 anchor blocks all 4
  body cells + leaves 4 surrounding cells free, Breakthrough+Ignore stack
  interaction with NPC, Breakthrough-without-Ignore short-circuit, neighbour-
  cell isolation.

- **I-4d — HUD cell probe + highlight.** Real-data integration check for
  I-4c, paired with a small overlay so the readout is self-evidencing.
  Pointer hover updates a dev-HUD line `(x,y) terrain t#N[flags] · objs:
  [t#M[flags] …] · stand=YES/NO` (red on blocked, green on pass) AND
  positions a 16×16 yellow rectangle with a dark halo at the probed cell.
  Hides during drag-pan (probe text freezes too), resumes on the next
  hover, clears on canvas leave. Removed `cursor: grab` / `grabbing` from
  `#screen` — the grab hand obscured the 16×16 highlight at this scale; a
  debug-visibility tradeoff, default arrow cursor in dev; the proper cursor
  scheme is decided alongside the input model when I-6 lands. **Kept across
  the remaining impl steps** alongside the I-3 clock HUD — both are removed
  or gated behind a debug toggle when the real status panel ports
  (`seg_0A33.c:933-936`) and game UI lands; see `CLAUDE.md` §"Modern-browser
  UX".

**Deferred (each owns a later step, with subsystem owner noted):**
- swim / fly / amphibian / ethereal monster-class branches — boats → swim
  (post-I-8 boats subsystem); combat → fly + ethereal; folded INTO
  `canStandAt`'s body as class arms, NOT sibling functions
- party-member pass-through (`D_17B2`) — avatar party arrives at I-8;
  `MoveFollowers` (I-8c) may need this so companions don't treat each
  other as hard blockers while repositioning — watch during I-8c verify
- sacred-quest gate (`OBJ_1A0` + `VarInt['Q'-0x37]`) — no quest flags yet
- fence directional pass (object's `TerrainType` bits `80/40/20/10`)
- damage-tile flag (`TERRAIN_FLAG_08` + `D_17A9`) — no combat / hazard system
- 5-type NPC-furniture overlap exception list — no SIT/EAT/PLAY worktypes yet
- door-opening mechanism (the predicate already handles open vs closed
  transparently via per-frame tile flags; the open/close *trigger* logic is
  its own subsystem)

**Durable source findings (worth recalling before touching this code again):**
- **`IsTileIgnore` is the "don't short-circuit on Breakthrough" flag**
  (`seg_1E0F.c:142-146`). A Breakthrough tile grants pass + breaks the cell
  scan UNLESS Ignore is also set, in which case the scan continues and a
  later blocker (e.g. an NPC at the same cell) can still block.
- **Door open/closed is per-FRAME tile flags, NOT an `OBJ_xxx` special
  case.** Closed-door frames have `IsTerrainImpassable` set; open-door
  frames don't. `canStandAt` handles both transparently via the flag-bit
  check on `Renderable.tileId` — when door-opening lands, updating an
  entity's frame automatically updates both render and passability.
- **NPCs always block at `c_04ed`** in source. A 5-type furniture
  exception list exists in source (chairs/tables for SIT/EAT) but is
  dropped at this scope — none of those overlap types are in scope until
  the SIT/EAT/PLAY worktypes land.
- **Per-cell iteration order matches source's chain head→tail**
  (newest-insert first via `FindLoc`/`NextLoc`). Our `ents[]` is in load
  order (oldest at index 0), so iterate REVERSE — same direction as render.
- **2×2 footprint expansion at the QUERY site** (4 candidate anchor cells:
  `(x,y)`, `(x+1,y)`, `(x,y+1)`, `(x+1,y+1)`) replaces source's
  `MapObjPtr` register-at-each-cell trick. Our `SpatialIndex` stores
  entities at their anchor only, so both render and passability expand at
  lookup time via `forEachOccupiedCell`.

**Verification:**
- `tests/test_passability.html`: 51/51 (32 flag accessors + 19 canStandAt cases)
- HUD probe live on Britain on real `OBJBLK*` data: walls at (289,349) /
  (311,362) show `terrain t#156/146 [impass+wall] · stand=NO`; passable
  cells show `stand=YES`; the Avatar start cell (307,352) correctly blocks
  via 2 stacked objects despite passable terrain
- Render unchanged after the I-4b extract (visual check on Britain)
- Drag-pan still works after the cursor + `dragging`-class cleanup; the
  highlight + probe text correctly freeze during drag and resume after

**Estimate vs actual:** estimated ~2-3 h; landed in ~3-4 h including the
`canWalk` → `canStandAt` rename mid-step (a source-faithfulness discussion
that changed the function's naming scope) and the probe-highlight visibility
iteration (border 1px → 2px + dark outline + cursor swap to default arrow).

## I-5 scope — NPC schedule resolution

**Goal:** at each game-hour rollover, NPCs whose schedule has a slot for that
hour snap to the slot's `xyz`. Position-only — no pathfinding, no facing/
frame update, no AI-mode plumbing. Narrower than the step-ledger's original
"NPC scheduled movement (hourly schedules + pathfinding + walking)" framing;
the visible payoff (NPCs at scheduled positions across a game-day) ships
without the pathfinding subsystem source mirrors at this trigger.

**Scope narrowing — what was deferred and why.** Source's `C_1E0F_5165`
(seg_1E0F.c:2264-2294) does TWO things on hour-tick: (a) resolve the slot
and (b) set `NPCMode = AI_FINDPATH` to kick pathfinding toward the slot's
xyz. Frame/facing updates and action-driven pose sprites (sleep/sit/eat)
come from pathfinding (frame-during-walk) + the AI dispatch reading
`NPCMode` on arrival, NOT from the schedule trigger itself. Landing all of
that at I-5 would be a multi-subsystem commit; the schedule-resolution-only
slice composes cleanly with what already exists (I-3 onHour + I-4
`canStandAt`) and produces a self-evident result (advance the clock → see
NPCs jump to new positions). Pathfinding, facing updates, and pose sprites
are I-6+ territory.

**Sub-steps** (each ≈ one save-point commit, browser-verified before the
next):

- **I-5a — `assets/schedule.js` parser** + `tests/test_schedule.html`.
  Decode the 257 u16-LE pointer table + N×5-byte `tSchedule` records per
  `seg_0C9C.c:285` + `u6.h:469`. Exposes raw `pointers` plus `byNpc[256]`
  convenience view + `AiAction` schedule-tier constants. Two data quirks
  surfaced and documented in the parser header: unused NPCs may have
  `pointers[n] > totalSlots` (empty-range sentinel; source's resolver loop
  tolerates `start > end` naturally); `AI_9A 0x9a` is a legitimate
  schedule action despite `ai.h`'s "RETREAT?" comment. 18 structural
  checks pass on real data (563 slots, 178 scheduled NPCs). `schedule`
  added to `main.js` REQUIRED so the dropzone extracts it.

- **I-5b — `resources/schedules.js` + pure resolver.**
  `Schedules.resolveSlotAt(npcId, hour, dayOfWeek)` mirrors
  `C_1E0F_5165`'s backward scan: highest-indexed slot whose hour matches
  AND whose day field is 0 (wildcard) or matches `dayOfWeek` wins.
  Returns null when nothing triggers — between-event hours are no-ops,
  consistent with source (NPC stays in its last-set mode). Static
  `dayOfWeek(Date_D)` helper for the `((D-1)%7+1)` conversion. 25 pure
  unit tests cover empty NPC, any-day match, day-specific match/miss,
  between-events miss, duplicate-key backward-scan precedence, wildcard
  fallback, `slotIndex` correctness, DoW wraparound, idempotency.

- **I-5c — `Schedule { npcId }` component + load-time tagging.**
  Component in `components/components.js`. `main.js` decodes the SCHEDULE
  file via `Schedules.fromBytes` and registers the resource; `loadActors`
  in `world_loader.js` tags NPCs whose objlist slot has schedule data via
  `schedules.hasSchedule(a.id)`. Result: 188 spawned NPCs, 176 tagged (2
  of the 178 scheduled NPCs are off-map / not LOCXYZ — no entity to tag,
  as designed). `loadActors` return shape now `{ actors, scheduled }`.

- **I-5d — Active-area predicate (OBJBLK residency).**
  `SpatialIndex.hasRegionAt(x, y)` — is the OBJBLK region containing
  `(x, y)` currently loaded? Method on `SpatialIndex` (per the
  methods-on-state-objects feedback memory) since it reads a single field.
  Inlines `world_loader`'s `regionId(col, row)` formula to stay
  self-contained; cross-checked against the exported `regionId` in tests
  across all 64 `(col, row)` pairs. 24 unit tests cover empty set,
  single-region, multi-region, boundaries between adjacent regions,
  world-edge region (7, 7). The semantics — "NPCs whose current region
  isn't loaded are skipped silently" — relies on our loader's monotonic
  `loadedRegions` set (never unloaded for the page session); the working
  set therefore grows as the player explores, eventually saturating at
  all 256 NPCs.

- **I-5e — NPC schedule system.** `systems/npc_schedule_system.js`:
  hooks `WorldClock.onHour`. Each tick, iterate `(Schedule, Position)`
  entities; gate by `SpatialIndex.hasRegionAt(currentPos)` (NPCs in
  unloaded regions are silently skipped); resolve slot via
  `Schedules.resolveSlotAt`; skip if null trigger; check `canStandAt`
  for the target; if OK, snap pos and update `SpatialIndex`. Per-tick
  stats (`snapped / alreadyAtTarget / blocked / inactive / noTrigger`)
  exposed via the returned object, mutated in place each tick so the
  I-5f HUD can read live state.

  Two small infra additions made this step possible:
  - `World.handleOf(i)` — reverse of `resolve()`, packs index +
    generation back into a handle. Needed by callers that get an index
    from `query()` but need a handle for spatial ops or `canStandAt`'s
    `actorId`.
  - `SpatialIndex.remove(x, y, handle)` — splices an entity out of its
    cell when it moves. Drops empty cells so `cells.size` stays
    meaningful.

- **I-5f — Dev HUD schedule probe.** Two surfaces on the existing dev
  HUD:
  - **(A) NPC stats line** — dedicated `<div id="npc-stats">` between
    the time-op buttons and the hover probe:
    `schedule @ hour HH: snap N / block M / idle K / inactive L`. Reads
    `npcScheduleStats` every frame.
  - **(B) Cell probe schedule line** — when a hovered cell holds an
    NPC entity with a `Schedule` component, the probe appends a second
    line: `NPC #<id> "<name>" · slot N: <ACTION> (hour H, day D) →
    (x,y,z) · active=YES|NO`. Reverse-maps the action byte to its
    `AiAction` name; reads `Schedules.resolveSlotAt` for the current
    `(hour, dayOfWeek)`, falling back to `no slot at hour H day D`
    between triggers. NPC name comes from objlist (party members only;
    `"(undefined)"` for everyone else until name-loading lands).

**Post-I-5 Z-order fix** (queued during I-5c verification when Lord
British rendered UNDER his throne; fixed immediately after I-5f
landed): the per-cell normal-zone emits followed scan order, so the
throne's `isDoubleWidth` extension from (308, 348) reaching back into
(307, 348) got pushed to the flat normal list AFTER LB's own emit at (307, 348)
and drew on top. Fix in `systems/world_render_system.js`: per-cell
gather (own anchor + 3 neighbors whose 2×2 footprint could reach in)
then sort by **type-based z-priority** (`Actor=1`, else=0) before
emitting to zone lists. Decouples Z-order from entity index so freed-
slot recycling in the object-interaction phase can't break it (the
"Option A" forward-compatible design discussed in chat). Header
comment in the file carries the source ref (seg_1184.c:1651
`ShowObject`) + the deferred fgExt source-faithful rule (newer at
chain tail = top — rare in u6 data, revisit if observed). The I-2c
scope text above now describes this current rule; the cross-
source comparison is in `research_map_render.md §"Painter's algorithm"`.

**Verification:**
- Pure unit tests: `tests/test_schedule.html` (18/18 structural),
  `test_schedules.html` (25/25 resolver), `test_active_area.html`
  (24/24 predicate).
- Live world: day-long sweep across hours 9-24 + 00:00 shows sensible
  snap counts at meal/sleep boundaries (noon snap=9, evening snap=11,
  late-night snap=2). No errors in console.
- HUD probe at hour 8 reports
  `NPC #5 "(undefined)" · slot 0: SIT (hour 8, day 0) → (307,348,0)
  · active=YES`, with LB rendered visibly on top of his throne after
  the Z-order fix.

**Deferred (each owns a later step):**

- **Pathfinding** — bucket-Dijkstra walker per `C_1E0F_2D37`. Lands at
  **I-9** (its own step, after I-8 avatar/party movement); until then, the
  schedule snap is teleport-not-walk.
- **`NPCMode` component + action-driven sprite swap** — sleep/sit/eat
  pose sprites need an `NPCMode` (or equivalent) field on the NPC
  entity that the schedule system can set on snap, and a render-side
  mapping from action → frame/sprite. The four `AI_STAND_*` actions
  could be wired cheaply (action → frame 0..3 = N/E/S/W) before the
  full sleep/sit/eat rework if a pose-correctness pass becomes worth
  doing.
- **First-tick alignment on game-load.** Currently NPCs stay at
  OBJLIST positions until the first hour-tick crosses an event.
  Acceptable for the I-5 demo (OBJLIST positions are close-enough to
  schedule). Real save/load will need to restore `SchedIndex` per the
  savegame.
- **NPC names** — the probe currently falls back to `"(unnamed)"`
  when `objlist.actors[npcId].name` is empty (true for any non-party
  NPC). Source's `GetObjectString` (`seg_1184.c:1912`) handles this by
  falling through to `GetTileString(TILE_FRAME)` — i.e. `look.lzd`,
  which we already decode and which stores personal names ("Lord
  British" at tile id 1769, "musician" for the generic-musician tile
  range, etc.). The probe needs the same fall-through; fixed in I-7c.
- **Multi-fgExt-per-cell source-faithful ordering** — within-zone sort
  for fgExt uses the same z-priority as normal/fgHot, which inverts
  source's "chain tail = top" rule. Rare in u6 data; revisit if
  observed.

## I-6 scope — inventory data layer

**Goal:** off-map item entities (NPC inventory + object containers)
live in ECS with `Container` / `ContainedIn` components, resolved
from each OBJBLK region's records (the `GetAssoc` rewrite source's
`__ObjectsDeserialize` does in one pass at `seg_1184.c:1385-1390`).
No UI surface — the inspector view is I-7's first consumer.

**Sub-steps** (each ≈ one save-point commit, browser-verified before
the next; squashed for the final commit):

- **I-6a — components + INVEN/EQUIP wiring.** Add `Container`
  (marker) + `ContainedIn { holder: Float64Array, equipped:
  Uint8Array }` to `components/components.js`. `objblk.js` decoder
  exposes 16-bit `assoc` (source's `*(unsigned int *)&ObjPos[i]`);
  the legacy port's 10-bit `owner = this.x` read works for NPC slot
  IDs (≤ 8 bits) but is lossy for CONTAINED in-file indices (up to
  12 bits). New `resources/actor_index.js` holds `Map<slotId →
  handle>`, populated by `loadActors`. `loadRegion` spawns items
  for records with bit 0x10 set (INVEN=0x10, EQUIP=0x18), resolves
  the holder via `ActorIndex.get(rec.assoc)` (NPC slot IDs are
  stable across files per source's `if(CONTAINED)` guard at line
  1389 — INVEN/EQUIP keep their on-disk assoc). Items spawn
  *without* `Position`, so `SpatialIndex` and `query(Position)`
  skip them. Holders get `Container` idempotently. `inventoryOf(
  world, handle)` helper exposed via `window.__U6` for console
  inspection. **Verified:** 42 ContainedIn items in initial view;
  party dump Avatar / Dupre / Shamino / Iolo = 3 / 9 / 9 / 12;
  Dupre splits 5 equipped + 4 carried; SpatialIndex unchanged at
  1488 cells.

- **I-6b — CONTAINED resolution.** Two-pass `loadRegion`: pass 1
  spawns every record and records its in-file index → handle
  (LOCXYZ + INVEN/EQUIP attach during pass 1; CONTAINED entities
  created but `ContainedIn` deferred). Pass 2 walks again, looks
  up each CONTAINED record's `assoc` in the in-file-index map,
  attaches `ContainedIn{holder, equipped:0}`, idempotently flags
  the parent `Container`. Adapted from source's single-pass
  `_6000[GetAssoc(si)]` (`seg_1184.c:1389-1390`) which relies on
  parents-come-first ordering plus a zeroed scratch buffer; modern
  JS has no RAM constraint, so explicit two-pass is the cheaper
  read. **Verified:** 117 container-held items, no orphan
  warnings; 12 sample object-containers including a 5-item chest
  at `(293,351,0)`.

- **I-6c — page chrome cleanup.** Mostly stale-log eviction now
  that I-1b / I-2b are several steps behind: delete `diagnostics()`
  (palette / mapLevel / tile-87 / sample flags / "I-1b plumbing
  complete") and `verifyWorld()` (I-2b entity counts / spatial
  cells / cell `(307,352)`) plus their two call sites. Surviving
  on-page log = 5 lines (Decoding / Loaded N NPCs / Loaded N
  objects+items+container-held / I-6 inventory summary / Rendering
  started). Detailed I-6 console-group dumps stay in DevTools
  where they don't crowd the page. UI: collapse Required panel
  into a `<details>` element (auto-closes when ready); fold intro
  paragraph into the dropzone; canvas 768×512 → 1024×640;
  relocate dev HUD `top: 12px` → `bottom: 12px` (the old position
  overlapped the now-shorter dropzone area).

**Deferred (noted):** `main.js`-side logic refactor —
`startRender()` is at ~235 lines and mixes 6 concerns
(composition, dev HUD, schedule-stats line, drag-to-pan, hover
probe, rAF loop). Refactor pairs with I-7's UI substrate when the
inspector lands (`view/dev_hud.js`, `view/dev_probe.js`, `view/
inspector.js` are the natural cuts already legible in
`startRender`). Doing it now would buy nothing.

## I-7 scope — UI substrate + object inspector view

**Goal:** lay the shared UI substrate (modal stack + input routing +
turn-driver gating + list-with-cursor + atlas-icon DOM rendering)
that every later UI surface (dialog window I-12, status panel I-14,
save/load, spell select, conversation) will sit on, and battle-test
it on its heaviest primitive consumer — the **object inspector**, one
surface for any entity (sword / NPC / barrel / chest) with
nested-modal-stack opening of held containers. Paired with the
deferred-from-I-6 `main.js` logic refactor so the substrate's hook
sites are easier to wire on smaller modules.

**Trigger (Zane's feel call, 2026-05-31):** hover any cell, press `I`
→ inspector opens for the topmost entity at the hovered cell. Mirrors
U6's "look" command, leaves canvas pointer plumbing untouched
(drag-to-pan stays as is). Nested-open from a list row uses the
substrate's in-modal cursor + Enter — no canvas interaction.

**Sub-steps** (each ≈ one save-point commit, browser-verified before
the next; squashed at the end into one `[ultima6_clone] impl I-7
(UI substrate + object inspector view)`):

- **I-7a — `main.js` logic refactor (behavior-identical).** Extracts
  `view/dev_hud.js` (clock HUD installer: text, controls,
  pause/±10m/±1h, schedule-stats line, rewind helper) and
  `view/dev_probe.js` (drag-to-pan + I-4d describeCell + I-5f probe;
  returns `{ isDragging, getLastCell }` for I-7c's hotkey). `main.js`
  trims from 463 → ~280 lines; `startRender()` from ~235 → 53 lines.
  No behavior change. Browser-verified: HUD ticks, probe shows the
  same lines, drag-pan unchanged.

- **I-7b — UI substrate.** Four new files plus `index.html` chrome.
  `view/ui_stack.js` — `UIStack` class: `push(modal)` appends to
  `<div id="ui-root">`; on first-push suspends `TurnClock` + installs
  one global `keydown` listener that routes to `top().onKey` (Esc
  auto-pops unless `preventDefault`'d). `pop()` reverses; last-pop
  resumes `TurnClock` + removes listener. `TurnClock.suspendCount` is
  already counter-based (`ecs/world.js:60`) so nested modals work
  for free. `view/ui_widgets.js` — `makeListCursor(items, {
  renderRow, onActivate })`: Up/Down wrap, Enter activates; cursor
  row carries `.ui-cursor` class. `view/ui_icons.js` — `tileIcon(reg,
  tileId)`: builds a 16×16 `<canvas>`, blits `getTilePixels` via
  `reg.palette` (both already on CPU side); scaled 2× via CSS
  `image-rendering: pixelated`. `index.html` — adds
  `<div id="ui-root">` + substrate CSS (gold-on-black, matches dev
  HUD palette). `UIStack` exposed via `window.__U6.uiStack` for
  DevTools dry-run.

- **I-7c — Object inspector + `I` hotkey.** `view/inspector.js`'s
  `openInspector(world, handle, uiStack, { reg, objlist })` builds a
  modal: header (icon, name [NPC name from `objlist.actors` for
  scheduled actors, else `getTileLook`, else `Item #N`], kind +
  obj#/frame + ×qty, position-or-(carried), decoded status bits),
  contents list iff `Container` (rows = icon + name + ×N + equipped),
  hint footer. `inventoryOf` (`world_loader.js:161`) provides the
  list shape verbatim — no wrapper. `onActivate` on a child opens a
  nested inspector (substrate's stack handles the LIFO). `main.js`
  global keydown gated on `uiStack.isEmpty() && !probe.isDragging()
  && key === 'i'` reads `probe.getLastCell()`, calls
  `spatial.at(x,y)[length-1]` (same topmost = last-entry rule the
  per-cell painter uses for Actor=1 z-priority), opens the
  inspector.

**Binding design decisions (recorded 2026-05-31, all carried through):**
- **One inspector surface for any entity** (not container-specific).
  Identity always present; contents-list conditional on `Container`.
- **Modal-stack for nested containers**, not inline tree expansion.
  Each open pushes; substrate's z-stack handles the rest.
- **`TurnClock` suspended for the entire stack lifetime.** Push N
  modals → N suspends; pop N → N resumes; net 0. No schedule snaps
  fire while the player inspects. Matches source's pause-during-
  inspection behavior + the existing dev HUD pause-button mechanism.
- **Atlas-icon rendering uses existing CPU-side data** —
  `Tiles.cache` (set by `getTilePixels`) + `TileRegistry.palette`
  (already RGBA Uint8Array). No GPU readback, no extra cache.

**Reuse-from-existing decisions** (no reinvention):
- `inventoryOf(world, handle)` (`world_loader.js:161`) — already
  returns `{ handle, objNumber, frame, quantity, quality, equipped }`,
  exactly the list row shape.
- `Tiles.getTilePixels(index)` / `getTileLook(index, quantity)`
  (`assets/tiles.js:82, 128`) — pixel cache + display-name lookup.
- `SpatialIndex.at(x, y)` (`resources/spatial_index.js:45`) — cell
  entity array, no spatial scan.
- `TurnClock.suspend() / .resume()` (`ecs/world.js:60-62`) —
  suspendCount counter, no infra change.

**Source-faithful pick / display-name / chain-insertion rules.** The
chain-head-insertion rule (`AddMapObj` / `MoveObj` /
`__ObjectsDeserialize`), the three-tier cell-pick rule
(`C_2337_08F1` + `COMBAT_canSee` + `IsTileIg` fallback), the
display-name fall-through (party-`Names[]` → `look.lzd` via
`GetObjectString`), and the keyboard-targeting-collapses-into-mouse
path all landed in this scope but are documented in their proper
research homes — see [`research_world_data.md`](research_world_data.md)
§"Runtime mutation — AddMapObj and MoveObj" + §"Clone correspondence
— SpatialIndex API", [`research_object_interaction.md`](research_object_interaction.md)
§"Cell-pick (`C_2337_08F1`)" + §"Display-name resolution", and
[`research_map_render.md`](research_map_render.md) §"Painter's
algorithm — within-tier order" for the renderer's reverse-iter rule.

Concrete I-7c-time additions to the code base:
- **`Actor` component upgraded from tag → `{ npcId: Uint8Array }`** so
  party-membership checks work for any actor (the npcId used to live
  only on `Schedule.npcId`).
- **`SpatialIndex.insertAtHead(x, y, handle)`** added alongside
  `insert(x, y, handle)`. `insert` is for batch-load (file order
  preserved by push). `insertAtHead` is for runtime move/drop
  (matches source's chain-head splice).
- **`npc_schedule_system.tick`** switched its snap to `insertAtHead`.
  Wasn't visible bug (Actor override masked it) but now the chain
  state is source-faithful for any future reader.
- **`WorldRenderSystem` within-tier iter is REVERSE** so older
  spatial.at entries emit last → drawn last → on top. Fixed the
  candle-under-table and door-under-doorway visual issues.

Verified cases (combined across pick + render):

| Cell | spatial.at[0..] | Inspector picks | Visually on top |
|---|---|---|---|
| (300, 378) | [candle, table] | candle | candle |
| (293, 376) | [door, doorway] | oaken door | oaken door |
| (296, 373) | [potion, table] | green potion | green potion |
| (307, 348) | [LB] + throne extension | Lord British | Lord British |
| (307, 360) | [egg] (`IsTileIg`) | egg (3rd-tier fallback) | egg |

**Forward implications for I-8+:** every system that moves an entity
mirrors a source `MoveObj` / `AddMapObj` call, so every system that
moves an entity must use `SpatialIndex.insertAtHead` at the
destination. Source has ONE chain rule (insert-at-head) and ONE
movement routine (`MoveObj`); NPCs and objects both go through it —
`seg_1E0F.c` has 14+ `MoveObj` call sites covering NPC schedule snap
(line 1206), pathfinder per-step (1375/1436/1487), follower stepping
(584), combat warps (635-890). The clone mirrors this with one API
used uniformly:

- **NPC schedule snap** (today, `npc_schedule_system.tick`) → analog of
  `seg_1E0F.c:1206` `MoveObj`. ✓ uses `insertAtHead`.
- **I-8 avatar step + follower stepping** → analog of `seg_1E0F.c:921`
  (active-member move) / `seg_1E0F.c:584` (`MoveFollowers`). Must use
  `insertAtHead`.
- **I-9 NPC pathfinder per-step** → analog of `seg_1E0F.c:1375` /
  `seg_1E0F.c:1436` / `seg_1E0F.c:1487`. Must use `insertAtHead`.
- **I-10 DROP** → analog of `MoveObj` on a previously-INVEN object
  becoming LOCXYZ, OR `AddMapObj` for a split stack. Both head-splice
  in source. Must use `insertAtHead`.
- **I-10+ push / throw / teleport / magic move** → all `MoveObj`
  equivalents. Must use `insertAtHead`.

The NPC schedule snap's switch from `insert` → `insertAtHead` has no
observable behavior today (Actor type-priority in inspector + renderer
masks chain position for NPCs, and two-NPCs-per-cell is gameplay-
impossible via `canStandAt`'s NPC-blocks rule). But it makes the API
convention uniform — one API, one source rule, no split-brain — so I-8+
callers don't have to remember "NPCs use one API, objects use the
other." Plain `insert` at runtime by any future system would pile the
new arrival at the tail of `spatial.at`, and the inspector / chain-
consuming code would silently pick the wrong target. API naming is the
guardrail.

**Verification:**
- Page loads with empty IndexedDB: no errors, `#ui-root` in DOM,
  checklist scans cleanly.
- DevTools dry-run after data loads:
  `window.__U6.uiStack.push({ el: document.createElement('div'),
  onKey: (e) => {} })` → clock HUD border tints `#c66` (TurnClock
  suspended); Esc pops; border returns to `#6b5d3a`.
- Live: hover (307, 348) (Lord British on his throne), press `I` →
  inspector shows name = "Lord British", position (307,348,0), status
  bits decoded, contents = ~12 inventory items. Up/Down cursor;
  Enter on a held bag → nested inspector for that container. Esc
  unwinds nested → root → close. During the stack lifetime: clock
  text doesn't advance; canvas drag-pan unaffected. `I` over an
  empty cell = no-op.

**Deferred (each owns a later step):**
- **Status panel** (I-14) — third substrate consumer, replaces the
  dev HUD's clock readout. Substrate ready; consumer waits.
- **Dialog window** (I-12) — second substrate consumer; opens when
  TALK fires (I-11). Substrate ready; consumer waits.
- **Inspector actions** (USE / GET / DROP buttons) — need I-10's
  object-action dispatch core; today's inspector is read-only.
- **Object-action triggers from the inspector** (e.g. USE-on-selected
  child) — same I-10 dependency.

## I-8 scope — avatar movement + party follow

**Goal:** the player walks the Avatar around Britain with the camera
following, and the three starting companions (Iolo / Shamino / Dupre)
trail in formation. The first **agency** in the rebuild. **Landed a–e,
all browser-verified on real U6 data.**

**Source mechanism — see `research_npc_ai.md` §"Party follow + avatar
movement" for the full decode.** Headline finding: **party-follow is NOT a
case in the NPC per-mode dispatcher `C_1E0F_3E6A`** — it's skipped for
`AI_COMMAND` (active member) and `AI_FOLLOW` (companions) at
`seg_1E0F.c:2225`, and `AI_FOLLOW` is also excluded from move-point turn
allocation (`seg_1E0F.c:2197`). Companions move through a dedicated routine,
`MoveFollowers` (`C_1E0F_1193`, `seg_1E0F.c:501`), a **formation-offset greedy
step** — not a trail buffer, not per-follower pathfinding. The avatar step and
the follower step share only the **single-step move kernel** — `canStandAt`
(I-4) + `insertAtHead` (I-7) + the shared facing/walk helper (`C_1E0F_0664`);
the path builder `C_1E0F_2D37` belongs to I-9.

**Sub-steps as landed** (a–e; each one save-point commit, squashed into one
`impl I-8`):

- **I-8a — Avatar move + camera + facing + idle settle**
  (`systems/avatar_move_system.js`). 8-dir input (arrows = cardinals, numpad =
  full 8-dir; `seg_0C9C.c:1069-1076` keymap, 0=N clockwise) → the
  `C_1E0F_1B0E` /*[advance]*/ path: one legal step via `canStandAt`,
  `insertAtHead` at the destination; a blocked cell bumps (no move). Camera
  recenters on the Avatar each step. Facing-on-step = `MACRO_A` 8→4 facing +
  diagonal hysteresis + the `C_1E0F_0664` humanoid walk cycle
  (`frame = walk + facing<<2`). Idle settle: on an idle turn the walk cycle
  relaxes to stand (source's `seg_0A33.c` idle pass, settle arm), gated on a
  separate `IDLE_SETTLE_MS` (~500 ms) idle-detection delay so the Avatar holds
  its stride briefly rather than snapping on the first 100 ms heartbeat.

- **I-8b — `PartyMember` + `Party`** (`components.js`, `resources/party.js`).
  `PartyMember { slotIndex }` tags each on-map actor whose objlist slot id is
  in `objlist.party[]` (Avatar = slot 0, no distinct marker — source treats it
  as `Party[0]`). `Party` resource holds the singleton `activeIndex` (= 0) +
  `mode` (= 'follow'). `world.query(PartyMember)` sorted by slotIndex IS the
  member list (no `members[]` array) — MoveFollowers walks it. Verified: 4
  members in order (Avatar/Dupre/Shamino/Iolo) at their objlist start cells.

- **I-8c — Foundations** (`systems/humanoid_anim.js`, `passability.js`).
  (a) Extract the avatar's facing + walk-cycle into `humanoid_anim.js`
  (`faceDir` / `walkStep` / `settleToStand`) and refactor the avatar to use it
  — behavior-identical, regression-verified — so MoveFollowers reuses the same
  animation. (b) Add the **party pass-through** option to `canStandAt`
  (`{asPartyMember, leaderHandle}`, source `D_17B2` at `seg_1E0F.c:191-198`): a
  moving party member walks through other party members; the active leader
  stays solid.

- **I-8d — `MoveFollowers` (the conga line)** (`systems/move_followers.js`).
  Port `C_1E0F_1193`: per follower, compute the formation-slot target from
  `D_17B8`/`D_17C3` rotated by leader facing; try all 8 directions, keep legal
  cells (`canStandAt` with party-pass), score by the "eager" heuristic
  (contiguity via `C_1E0F_1056` minus distance-to-slot), step the best. Two
  passes; `aFlag` 0 = leader moved (loose trailing), 1 = stationary (tighten).
  Per-follower walk state in a handle-keyed map; facing via `humanoid_anim`.
  Wired off the avatar's `onMove` (camera recenter + follow). The Avatar
  (leader) also walks THROUGH its followers (party-pass); when it steps onto a
  follower's cell, MoveFollowers shuffles that follower aside — the same pair
  source uses. `D_17A9` damage-tile reluctance dropped (no hazard subsystem).
  **Bug found + fixed here:** `canStandAt` checked a follower's *sprite-tile*
  impassable flag BEFORE the party-pass could skip it, so `blocked` stuck true
  and the Avatar was wrongly blocked by its own followers. Moved the
  Actor/party-pass check to run FIRST, before the tile-flag checks — matching
  source's `c_04ed` (an NPC blocks for *being* an NPC, not for its sprite
  tile's flags). Verified: companions trail onto exact formation slots;
  reversing through the party never blocks the Avatar and never leaves a
  follower stacked.

- **I-8e — Party idle settle** (`move_followers.js` `settleParty`, avatar
  `onIdle`). When the party is idle past `IDLE_SETTLE_MS`, the whole party —
  Avatar (slot 0) + followers — settles its walk cycles to stand (facing
  preserved). Generalizes the I-8a avatar settle: the avatar's idle branch fires
  an `onIdle` callback (symmetric with `onMove`) wired to `settleParty(world)`,
  which settles every `PartyMember` mid-stride. Verified: party holds its stride
  ~500 ms after stopping, then plants its feet together.

**How the avatar system and the follow/settle relate.** `moveFollowers` and
`settleParty` are NOT registered sim systems — they're consequences the avatar
move system triggers via callbacks (`onMove` after a successful step → recenter
+ follow; `onIdle` after the idle gate → party settle), composed in `main.js`.
This mirrors source: `C_1E0F_1B0E` calls `MoveFollowers` at its tail
(`seg_1E0F.c:933`), and the settle is the no-key idle path. Followers move only
on the leader's turn; the party settles only on idle turns — turn-type mutual
exclusion, the same the command-vs-idle loop gives source. The avatar system
stays follower-agnostic (it just promises "I call onMove/onIdle"); the wiring
site composes the rest. Active-member switching (later) only changes the
`leaderHandle` passed to `moveFollowers`.

**Time-model note (provisional).** A player move advances the world clock +1
minute, AND the idle heartbeat advances it too (~10 game-min/sec) — so time
passes whether or not the player acts. Source is strictly turn-based (time per
move-point round; idle = frozen). Keeping the idle-advance ("world breathes") is
a provisional lean (Zane 2026-06-01); it finalizes at I-9 when the move-point
economy lands. See the I-9 scope.

**Formation offset tables (verbatim from `seg_1E0F.c:62-63`):**
```
D_17B8[] = { 0,-1, 1, 0,-2, 2,-1, 1,-3, 3, 0};   // perpendicular
D_17C3[] = { 0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 1};   // behind
```
Indexed by `follow_pos` (1-based per follower). Slot 1 = back-left,
2 = back-right, 3 = two-behind, 4/5 = wider, etc. — a diamond expanding
behind the leader. Target rotation (`seg_1E0F.c:528-535`):
`target_x = x − DirIncrX[facing]·behind − DirIncrY[facing]·perp`,
`target_y = y + DirIncrX[facing]·perp − DirIncrY[facing]·behind`.

**Deferred (each owns a later step):**
- **NPC pathfinding** (`C_1E0F_2D37`) → **I-9**. Until it lands, the I-5
  schedule snap stays teleport-not-walk; I-8 movement does not touch the
  path builder.
- **`[F]ollow` / `[S]olo` toggle** — the `Party.mode` slot exists but UI
  doesn't expose it; solo mode defers with combat (post-β).
- **Active-member cycle + party HUD line** — different active members
  elicit different conversations; land a minimal dev-HUD "Active: <name>"
  + `1`/`2`/`3` cycle at **I-11** (talk trigger) when it first matters.
  Full party status panel is **I-14**.
- **Teleport-when-too-far for stragglers** (`C_1E0F_291C`, 3/tick cap) —
  shares the mechanism NPC pathfinding uses for off-area NPCs; lands with
  **I-9**. Without it a badly-separated follower can strand; acceptable
  for the I-8 demo (small rooms, short separations).
- **Vehicle/boarding follow suppression** (`IN_VEHICLE` early-return in
  `MoveFollowers`) — no boats/horses yet.

## I-9 scope — NPC pathfinding

**Sub-steps a–h landed as SEPARATE commits (no squash, Zane 2026-06-02).**
Pre-impl research baseline: `research_npc_ai.md` §"Pathfinding" + §"Arrival —
`__AtDestination`" + §"Off-area handling" + the §"Clone port notes (I-9)" (which
carries the source-derived findings + the kept deviations). The per-sub-step commits:

| Sub | Commit | What landed | Tests |
|---|---|---|---|
| **I-9a** | `344f438` | **cost map** `computeResistance()` (`__ComputeResistance`, seg_1E0F.c:1866-1922): terrain `(TerrainType>>4)+1`, door frame<8 +1 / ≥8 block + behind-block, pass-through +1, 2×2-footprint spread, wet-tile rescue. `terrainCost()` accessor added. | 21 |
| **I-9b** | `99e0594` | **bucket-Dijkstra search** `findPath()` (`C_1E0F_2D37`+`C_1E0F_2A74`+`C_1E0F_25F9`): two-source meet-in-the-middle, bucket priority (route-faithful), traceback → plain 4-dir array (RLE dropped). | 14 |
| **I-9c** | `aa932fe` | **path-follow** `doOnPath()`/`npcStep()` (`__DoOnPath`): one 4-dir step via the shared kernel, `AI_ONPATH→84→85→86` escalation. `AIMode` component + `Paths` resource + `ai_modes.js`. **Humanoid-NPC door pass-through** in `canStandAt` (`MONSTER_4000` class). | 18 |
| **I-9d** | `b1894d8` | **NPC tick** `installNpcTickSystem` (sim-list): each turn, `AI_FINDPATH` NPCs build a path in their own 40×40 window + walk it; schedule arm rewired to set `Destination`+`AI_FINDPATH` instead of snapping. `AIMode`/`Destination` tagged at `loadActors`. | 6 |
| **I-9e** | `90831db` | **edge-seek** for far slots (`PTH_direct` port + deviation): off-window goal → flood to a window edge toward it, re-plan at the edge → walk across the map incrementally. | 8 |
| **I-9f** | `6dcc977` | **teleport-to-previous-target on reschedule** (deviation): a blocked NPC catches up to its unreached previous slot before re-targeting. | 8 |
| **I-9g** | `47216fc` | **arrival worktypes/facing** `atDestination()` (`__AtDestination`, seg_1E0F.c:1002-1085): on path-end-within-1-tile (`__DoOnPath` `COMBAT_getCathesus<2`) / already-on-slot / post-snap, set `NPCMode` = the slot's worktype (new `Destination.action`) + STAND_*/GUARD_* facing (stand frame `(facing<<2)\|1`, **humanoids only** — `isHumanoid` gate at both the arrival + walk sites, mirroring source's type-dispatched `C_1E0F_0664`). Off-slot → revert `AI_FINDPATH`. Pose worktypes (SLEEP/SIT/EAT/PLAY/RINGBELL) set the mode + hold position but **defer** the furniture sprite swap (`C_1E0F_2184`). | 33 |
| **I-9h** | (this commit) | **off-area teleport + distance gate + first-tick alignment** `tryTeleportToSlot()` (`C_1E0F_291C`, seg_1E0F.c:1181-1211): far NPCs teleport onto their slot (settling the worktype via `atDestination`) instead of pathfinding; the NPC tick tries it FIRST (source's `C_1E0F_464A` order), capped 3/turn. Visibility guard = suppress if NPC OR slot within Chebyshev-40 of the avatar (the wider-canvas adaptation of source's ±5 11×11 viewport box), `allowVisible` = source's `AllowNPCTeleport` override (used by the unreachable-fallback, which `tryTeleportToSlot` now unifies, replacing the local `snapToSlot`). First-tick alignment: `main.js` fires `clock.hourlyHooks` once at load so NPCs resolve to their current-hour slot instead of waiting for the next rollover. | 13 |

Verification: 121/121 unit cases (`tests/test_pathfinding.html`) + a real-data
preview-eval pass (2026-06-02). On real data: **40 scheduled NPCs carry STAND/GUARD
worktypes** (e.g. NPC 6 STAND_E @(305,349), NPC 8 GUARD_S @(333,407) — castle
courtiers), so the worktype path is live, not dead code; exercising `atDestination`
on a real humanoid (obj 0x19a, baseTile 1776) produced **valid facing sprites** for
all four cardinals (tiles 1777/1781/1785/1789, GUARD_W = STAND_W) — confirming the
frame→tile mapping that the unit test stubs to 0; and the **live AIMode distribution
already showed arrived worktypes populated** (SIT/LOITER/WANDER/FARM/PLAY/RINGBELL),
i.e. the full schedule→walk→arrive→worktype lifecycle fires end-to-end as the game
runs. **Non-humanoid guard verified on the real gazer NPC #9** (obj 0x162): its
`STAND_N` slot sets the mode but leaves the sprite frame untouched (`isHumanoid`
false), while a real humanoid control still faces (STAND_S → frame 9). (The a–f
NPC-#12 trace is what surfaced the drawbridge finding; NPC #9 surfaced the
non-humanoid facing gate.)

### Key decisions + deviations (all recorded in `research_npc_ai.md §"Clone port notes (I-9)"`)

- **Per-NPC 40×40 window, centered on the NPC (not the player).** Source
  player-centers a shared grid; our 64×40 canvas is wider than 40×40, so
  player-centering would teleport on-screen NPCs. Per-NPC centering + walk-don't-
  teleport sidesteps that and keeps source's building-scale window. Each NPC paths
  in its own window — camera-independent.
- **Edge-seek deviation: accept ANY window edge the goal lies beyond** (an
  `edgeMask`), not source's single dominant-axis edge — on real town maps the
  dominant edge is often walled right next to the NPC and source then snaps
  (verified: NPC #12 north walled, east open). Frontier pool sized to the grid (vs
  source's 256) so open-terrain edge-seeks don't false-give-up.
- **NPCs are NOT obstacles in the cost map** (source-faithful — only object slots
  ≥0x100). NPC-vs-NPC blocking is resolved at per-step move time: a blocked NPC
  bumps + waits (`84/85/86`) + re-plans, self-healing when the blocker moves. The
  deferred move-point step-rate would reduce collisions (staggered vs flat).
- **Teleport-to-previous-target on reschedule (deviation, I-9f).** A blocked NPC,
  on its next schedule slot, snaps to its unreached previous slot first, then walks
  on — so it "catches up" to its schedule. Source re-paths from where it's stuck.
  Kept difference; `reclaimed` HUD stat counts it.
- **`snapToSlot` is a fallback for genuinely-unreachable slots only.** The canonical
  real cause is an **unmodeled obstacle, not a cost-cap bug** — the **castle
  drawbridge** (`OBJ_10D`, frames 6/7/8 = raised/impassable; lever-operated
  `seg_27a1.c:1898-2090`) on NPC #12's route. Closed, it forces a cost-15 forest
  detour exceeding source's 7-bit cost cap (127) → snap. In normal play the Avatar
  opens that bridge (a quest step, NPC only matters once it's open); the clone's
  free-camera "god mode" activates schedules out of that sequence, surfacing the
  impossible-destination case where the teleport is correct. **Do NOT raise the cost
  cap** (it would route her through forest, a path the original never uses). The
  drawbridge/lever subsystem is **I-10** (object actions).
- **Flat step-rate** — every on-path NPC steps once per tick (all same speed). The
  full move-point priority economy (`MovePts`/`DEXTE` interleave) is **deferred**;
  the minimal move-point rate is the alternative if per-NPC speed / collision
  staggering ever matters.

### Time model (finalized 2026-06-01: keep idle-advance)

Kept the "world breathes" model — the clock auto-advances on the idle heartbeat —
NOT strict turn-based. The interval is currently the I-3 debug-fast 100 ms;
**tuning it to a slower natural value is DEFERRED (Zane 2026-06-02)** — it was the
4th part of the original I-9h bundle, split out as a one-line `TurnClock` change to
do when the slower-clock feel is wanted (it doesn't block I-9). Flipping to strict
turn-based later is a one-flag change (gate the idle branch of `World.frame`, since
the NPC tick is a sim-list system) — see the chat 2026-06-01.

### Done — I-9g: arrival worktypes/facing (`__AtDestination`, seg_1E0F.c:1002-1085)

`atDestination(world, handle)` in `systems/npc_path.js` sets `NPCMode` to the
schedule slot's worktype (the new `Destination.action` field) on arrival, and for
`STAND_*`/`GUARD_*` faces the NPC the right way (stand frame). Called from three
sites: `doOnPath`'s end-of-path branch (now gated by `COMBAT_getCathesus < 2` — a
wrap-aware Chebyshev — instead of exact-equality, so an NPC that ran out 1 tile short
still settles, and an edge-seek path that ran out far from the real slot re-plans);
the NPC tick's empty-path branch (schedule fired while already on the slot); and the
NPC tick's post-snap branch (an unreachable slot snapped onto). Off the exact slot →
revert to `AI_FINDPATH` and keep walking (the pose worktypes force-hold instead,
matching source). **Kept deviations:** facing is encoded in the sprite frame
(`frame = walkCycle + facing<<2`; stand = `(facing<<2)|1`), not a separate
`SetDirection` field — a later GUARD-pacing step reads facing back from `frame>>2`.

**Humanoid-only facing gate (both sites).** Source's facing helper `C_1E0F_0664` is
type-dispatched and is called from *both* the per-step walk (`TryStraightMove`,
seg_1E0F.c:1439) and the arrival (`__AtDestination`, seg_1E0F.c:1075). We ported only
its humanoid arm (`humanoid_anim.js`), so both clone sites — `npcStep` (the walk) and
`atDestination` (the arrival) — now gate on `isHumanoid(objNumber)` (`OBJ_178..0x183`,
`OBJ_199..0x19A`); non-humanoid NPCs move/settle without animating (a valid static
sprite) instead of being mis-encoded with the humanoid `facing<<2` layout. Surfaced by
inspecting the gazer NPC #9 (obj 0x162: source uses `frame = facing` directly,
seg_1E0F.c:410) on real data. The `npcStep` half is a fix to landed I-9c code, in this
commit because it shares the root cause + the new `isHumanoid` helper.

**Deferred:** the per-type non-humanoid facing arms (gazer direct-frame, animals, …);
the pose/furniture sprite swaps (SLEEP→bed `OBJ_0A3`, SIT/PLAY→chair, EAT→table
food-frame, RINGBELL→pull-chain, all via `C_1E0F_2184`) — the modes are set and
position held, but the sprite isn't swapped; and the ongoing GUARD up-and-down pacing
(the per-mode dispatcher `C_1E0F_3E6A`) — here GUARD just plants the NPC facing its
post, like STAND.

### Done — I-9h: off-area teleport + distance gate + first-tick alignment

The "walk-near, teleport-far" gate. `tryTeleportToSlot(world, handle, avatarX, avatarY,
allowVisible)` in `systems/npc_path.js` ports `C_1E0F_291C` (seg_1E0F.c:1181-1211):
place an NPC straight onto its scheduled slot and settle the worktype (via the I-9g
`atDestination`), instead of pathfinding. The NPC tick (`installNpcTickSystem(world,
{ avatarRef })`) tries it FIRST in the `AI_FINDPATH` branch — source's `C_1E0F_464A`
order (seg_1E0F.c:1924-1960): teleport, then pathfind only if the teleport was
suppressed — capped at 3/turn (source's `D_17A5`).

**Visibility guard (the distance threshold).** `tryTeleportToSlot` suppresses the
teleport when the NPC OR its slot is within `TELEPORT_NEAR_RADIUS` (40) Chebyshev of the
avatar, so on-screen NPCs always walk (visible, animated). This is the wider-canvas
adaptation of source's ±5 box (seg_1E0F.c:1188-1202) — source suppresses inside the
11×11 gameplay viewport; our 64×40-cell canvas shows ~32×20 half-extents, so a ±5 box
would pop NPCs the player can plainly see. Same deviation philosophy as the per-NPC
pathfinding window. `allowVisible` is source's `AllowNPCTeleport` flag (set during
rest / time-jumps); here it's used by the **unreachable-fallback**, which
`tryTeleportToSlot` now unifies — the old local `snapToSlot` is gone (the fallback is
`tryTeleportToSlot(..., allowVisible=true)`). New `teleported` tick stat + `tp` on the
dev-HUD line.

**First-tick schedule alignment** (was deferred from I-5). `main.js` fires
`clock.hourlyHooks` once at load (`for (const cb of clock.hourlyHooks) cb(clock)`),
which runs the schedule system for the CURRENT hour — resolving each eligible NPC's
`Destination` + `AI_FINDPATH` immediately, instead of leaving them at their OBJLIST
load positions until the clock crosses the next hour boundary. The first turn then
resolves movement (far → teleport off-screen, near → walk). Source forces a full
teleport-settle at every time-jump via `AllowNPCTeleport`; that forced load-settle is
**deferred to save-load**, when genuine mid-route NPCs exist to handle.

**Kept deviations / calls** (for the post-I-9 audit): (a) the **3/turn cap** is kept
source-faithful but is a CPU throttle that's invisible behind the visibility guard
(teleports only fire off-screen) — drop-candidate. (b) **No pathfind cap** (source's
`D_17A7`): when the teleport cap is hit, overflow far NPCs pathfind that turn rather
than wait — minor, arguably better. (c) teleport keeps the clone-defensive `canStandAt`
guard source omits (source assumes authored-valid slots), so a teleport never lands an
NPC on a wall/occupied cell.

Verification: 121/121 unit cases + live preview-eval on real Britain data (2026-06-02):
first-tick alignment fires at load (`[NpcSchedule] hour 09` at startup, before any
rollover); a far NPC (dist 50 from the avatar) **teleported 10 cells onto its slot in
one turn** and settled STAND_S (`teleported=1`); a near NPC (dist 4) was **suppressed
and built a path to walk** (`teleported=0`, AI_ONPATH); and normal play never
teleported a visible NPC. The full schedule→(walk|teleport)→arrive→worktype lifecycle
runs end-to-end with no errors over a day cycle.

### I-9i (dev-HUD path overlay) — DROPPED (Zane 2026-06-02)

The last planned sub-step (a visual cell-trail of a hovered NPC's route) was dropped.
Live `preview-eval` of `window.__U6` / the `Paths` resource already exposes any NPC's
full path state (`dirs`/`counter`/`goalX`/`goalY`) — it's exactly how I-9h was verified —
so the overlay would only save Claude keystrokes on a debug task already covered, while
dirtying one of two layers that don't want it (the `#probe-cell` cursor is a viewport-
positioned DOM box, not world-space; the WebGL renderer only knows terrain + objects;
neither owns a multi-cell camera-tracked trail cleanly). If a genuine spatial-debug
need shows up later, it's a clean standalone add (a dedicated debug layer), not
something bolted onto the cursor. **I-9 is therefore complete through a–h.**

**Deferred (not blocking, → post-I-9 audit):** idle-advance interval tuning — the clock
auto-advances on the I-3 debug-fast 100 ms heartbeat; a one-line `TurnClock` change to a
slower natural rate (the "world breathes" finalization). See the Time-model section
above + the audit fork below.

### Known issue — door-phasing predicate (NOT a deviation, an unverified simplification)

**`npcStep` (`systems/npc_path.js`) passes `asHumanoidNpc: true` to `canStandAt` for
EVERY pathing NPC** — so non-humanoid NPCs (gazer, animals) also phase through closed-
unlocked doors. But door-phasing is gated in source on the **`MONSTER_4000` monster class**
(`C_1E0F_000F:199-207`), NOT the sprite family — so `isHumanoid` ≠ the right predicate here.
Verifying whether a gazer should phase a door needs the monster-class table
(`D_3522_0242` / `GetMonsterClass`, see Journal a–f read). NOT touched in I-9h (the
distance gate doesn't read door-phasing); fix as a small standalone change or fold into
the post-I-9 deviation audit. Low impact today (NPCs rarely path through doors mid-route).

### Post-I-9 — deviation audit (Zane 2026-06-02)

I-9 has landed (a–h; i dropped), so the **consolidated deviation audit** is now due: pull
every I-9 deviation into one table and mark each *forced / deliberate-keep / revisit-
candidate / deferral*. Prime revisit candidates: **teleport-to-previous-target** (I-9f),
**flat step-rate** (move-point economy deferred), the **I-9h 3/turn teleport cap** (a CPU
throttle invisible behind the visibility guard — drop-candidate), and the **missing
pathfind cap** (source's `D_17A7`, not ported). The rest are mostly representation choices
(frame-encoded facing, per-NPC path Map, wrap-aware Chebyshev) inherent to the modern-
rewrite framing, plus modern-UX-forced ones (per-NPC window, any-edge edge-seek, the
Chebyshev-40 teleport radius — all forced by our wider-than-source canvas).

**The central audit fork — NPC blocking + the idle heartbeat (research 2026-06-02, see
`research_npc_ai.md §"Blocking + collision resolution"`).** Source has **no NPC swap or
detour**: a blocked NPC waits up to 3 turns then re-plans the same route, relying on the
blocker moving; the only swap in U6 is avatar↔party-member (`C_1E0F_1B0E:881-898`). Blocks
stay rare/brief in the original via two things the clone changed: (1) the **move-point
economy** (interleaved one-step-at-a-time re-pick + `DEXTE` speed variation = staggering),
deferred here as flat step-rate; (2) the **turn-based clock** — the original advances the
world ONLY per player action (`C_0A33_1CB4` blocks on `CON_getch`; `C_1E0F_4E0A` runs once
per keypress), so while the player is idle the world is frozen and a "stuck" NPC is never
*seen* stuck. Our **auto-advance idle heartbeat** is a clone addition that breaks this —
it's the root of the "watching a frozen NPC is no fun" symptom. So the movement items all
hang off one fork: **keep the idle heartbeat** (then move-points + clock-tuning become
*required* to make idle-time NPC traffic read as calm-and-rare; I-9f comes off once they
land) vs **revert to player-action-only advance** (faithful; the frozen-NPC-while-idle
problem disappears for free; move-points stay a nice-to-have for in-motion traffic). This
reopens the idle-heartbeat call finalized 2026-06-01 — decide it in the audit.

**FORK DECIDED (Zane 2026-06-08): KEEP the idle heartbeat — reverting to turn-based is NOT the
expectation.** The audit's movement items therefore collapse into ONE settled model (below), not
a deferred fork.

**SETTLED MODEL — DEXTE-paced per-actor accumulator (Zane 2026-06-08, refined through a design pass; SUPERSEDES the earlier "faithful round-driver port + idle auto-pass" framing that `fcc3a1d` committed).**
A **modern rewrite** of U6's `MovePts`/`DEXTE` economy as a **continuous per-actor accumulator** — NOT a
port of the `C_1E0F_4E0A` round driver. Keep the *mechanic* (DEX = speed, terrain = cost); drop the
turn-loop *substrate* (no shared pool, no refill event, no ratio-priority round-robin, no idle
auto-pass). This is the correct call per this project's "modern rewrite" choice (`CLAUDE.md` →
[[feedback_retro_port_translation_choice]]): the round-robin/refill/auto-pass driver is exactly the
shape a single-threaded, blocking-input 1990 loop takes — forcing it onto the clone's continuous 100 ms
heartbeat is what produced the "chaos" that drove this reframe. The same *observable* behavior (DEX
speed-variation = staggering; terrain slowdown; overdraft delay) falls out of the accumulator
continuously instead of bursting per round. (Source-mechanism reference still: `research_npc_ai.md
§"Move-point economy"` + `U6_世界推進_回合節拍.md`; we reinterpret it, not transcribe it.)

**The model:**
- **Per actor, each heartbeat (100 ms fixed):** `moveCredit += rate(DEXTE) × WORLD_SPEED × dt`; when
  `moveCredit ≥ stepCost`, **move one tile and subtract the cost**. Movement is **snap tile-to-tile, no
  render interpolation** (faithful to source's per-pick redraw — Zane 2026-06-08). **Cap** a stationary
  actor's credit at one step's cost (no banked multi-tile dash when it later gets a destination).
- **`rate(DEXTE)` — DEXTE is a *speed meter*** (the dexterity stat, 1–30, `seg_0C9C.c:303` from objlist),
  used for the relative ordering and **mapped into a feel-calibrated band, NOT its raw scale.** Anchor:
  reference DEX ≈ 15 → ≈ 2.5 tiles/s on open ground (sets the slider default); **floor** effective DEX
  (~6) so the slowest creature still ambles. NPCs keep the full spread (horse fast, slime slow) — it's
  characterful ambient life. Source values are the *inputs*; the ms-per-tile mapping is ours, tuned live.
- **`stepCost` = `SubTerrainMov`** (`seg_1E0F.c:1402` = `5 + Σ(TerrainType>>4)` over the actor's tile +
  stacked objects; `SubMov` `seg_1E0F.c:441` modifiers: horse ½, slow/haste spell ½/×2, min 1).
  **Per-location, shared by all actors on that tile** (NOT per-NPC). Diagonal cost lives in
  `__TryDiagMove` — I-15.
- **Player movement = fixed-brisk, never gated → zero input lag** (Zane 2026-06-08). The player does
  **NOT** use DEX-scaling (a sluggish low-DEX avatar everywhere feels bad; the player-facing point is
  terrain-speed, not avatar-DEX-speed). Design: **standing still leaves the player "ready" (credit
  banked to one step), so a keypress after any pause steps instantly that frame**; a post-step
  **cooldown = terrain-scaled** rate-limits *sustained* walking only. Open ground → cooldown < key-repeat
  (continuous smooth walk); swamp → visibly slower, but the first step is always instant. The
  distinction that dissolves the lag worry: "lag" = delay before responding (none here) vs "throttle" =
  capped sustained rate (intended — it IS the terrain mechanic).
- **Clock = DECOUPLED** (Zane 2026-06-08). Advances on its **own** real-time cadence, **not** tied to
  rounds/refills (source's per-refill `C_0A33_1355(1)` tick is turn-loop convenience → dropped, a kept
  clone deviation per the modern-UX anchor). Schedules read the independent clock. Why: a per-refill
  clock would make time-of-day speed up in empty areas / slow down in crowds (an NPC-density artifact);
  decoupling also auto-fixes today's runaway 600× idle clock.
- **`WORLD_SPEED` = ONE master slider** (Zane 2026-06-08) in the world-clock UI — scales **every actor's
  fill rate AND the decoupled clock together**: slow → everything ambles, **slow-end = frozen** (recovers
  source's "world stops when idle" feel), fast → bustle. **Log-scaled.** The 100 ms heartbeat stays
  fixed; the slider changes the *rate*, not the frame interval. Pairs with the world-clock surface
  (at I-18 the clock moved to the persistent strip; the slider still rides the floating dev HUD).
- **Staggering & blocking** emerge from independent per-actor credit phases (actors cross the threshold
  on different heartbeats), so a blocker usually vacates before/after a blocked NPC, not simultaneously —
  no global interleave needed. Residual blocks ride the existing `84/85/86` wait-and-replan
  (`npc_path.js:98-100`); **build-time check:** confirm it still de-gridlocks. **I-9f
  teleport-to-previous is a non-faithful band-aid → DROP it** once this lands; blocked-NPC behavior then
  follows `U6_NPC_排程與移動邏輯.md §五` (waited-out, not warped — lenient Chebyshev ≤ 1 arrival; catch-up
  via hourly schedule re-target §二 + off-screen visibility teleport §六).
- **Data:** `assets/objlist.js` already decodes `a.dexterity` (0x0a00) — carry only that into a
  component. `a.movePts` (0x14f1) is now **unused** (the accumulator needs no saved per-round budget).

**After the full port — new-mechanism study (Zane 2026-06-02).** If the idle heartbeat
stays, a later study may add mechanisms the original LACKS (NPC-NPC swap, local detour,
actor-aware/soft-cost re-planning) to make NPC movement feel right under auto-advance.
Legitimate non-faithfulness: the original has no mechanism for a problem it doesn't have,
so inventing one solves a clone-only problem (per CLAUDE.md §"Modern-browser UX as
architectural anchor").

**NPC step-aside — PULLED FORWARD (Zane 2026-06-08), the first such clone-only mechanism.**
Surfaced reviewing I-14/I-15: under auto-advance an NPC blocked by another *actor* (NPC or
party member) visibly stalls (source has no actor detour/swap and just waits — §5.1, invisible
behind the turn-based freeze). Added to `doOnPath` (`systems/npc_path.js`): on the **first**
block (`AI_ONPATH`), if an actor holds the next cell, `requestStepAside` nudges that blocker
one cell **perpendicular to the mover's travel axis** (E/W mover → step the blocker N/S; N/S
mover → E/W — clearing the exact lane; perpendicular-only, so a 1-wide corridor with both
sides blocked falls through to the wait), then **both re-plan** (`AI_FINDPATH`, status `'aside'`). Gated to the first block only — a static block, a boxed-in
blocker, or any later block (`84/85`) falls through to source's faithful `84/85/86` grace-wait.
Only a **mid-journey** blocker (already in the pathfinding tier) is re-pathed — re-finding
sends it toward its OWN goal, away from the contested cell. A **settled** blocker (worktype /
schedule / party — modes outside 0x81..0x86) is **left where it stepped** and keeps its mode:
its goal is the very cell it was pushed off (its schedule slot), so re-pathing it there caused
an infinite push↔return loop (caught in review — LB vs the jester at a chokepoint). Left put,
it re-snaps to its slot at the next schedule hour. The step-aside is a reactive "free" move
(not accumulator-gated).
**Still deferred:** full swap / actor-aware soft-cost re-planning (revisit if step-aside churns
under real I-17 AI traffic). Detail: `progress.md §"I-15 scope"`; verified test_pathfinding 9
step-aside cases + live two-NPC block.

### Deferred to later steps (subsystem owners noted)

- **Drawbridge USE** — the control is the **crank** `OBJ_120` (`C_27A1_433D`),
  which toggles the drawbridge tiles `OBJ_10D`; **now scoped as I-10d** (NOT the
  lever `OBJ_10C`, which is the portcullis control — the earlier note
  misidentified it). Until landed, bridge-gated NPCs teleport — correct given the
  closed bridge.
- **Move-point economy** (`MovePts`/`DEXTE` priority interleave) → its own refinement.
- **Object-seek pathfinding** (`AI_SEEKOBJ` / `PTH_object`) → when mice/animals seek.
- **Swim/fly/ethereal movement classes** in `canStandAt` → boats / combat.

## I-10 scope — object-action dispatch core

**Goal:** a thin, paradigm-agnostic **command dispatcher** —
`dispatch({verb, actor, target})` → look-up handler → validate →
effect → cost — plus the minimum verb set for "wander Britain without
getting stuck": **LOOK** (any), **GET**/**DROP** (inventory), **USE**
(doors). TALK is I-11 (one more handler registration on this seam);
MOVE / vehicles / spellbook-cast deferred. This is the front-end that
I-11 (talk) and I-12 (dialog) sit on — see the
[research_game_loop.md](research_game_loop.md) §"The shared targeting
block" finding: in source, look/talk/get/drop/move/use all share one
targeting front-end and differ only at the final switch, so building
the dispatcher now makes TALK additive.

**Why a dispatcher (not per-verb ad-hoc handlers, not a source port).**
The clone today wires input ad-hoc: avatar move + the `I`-look hotkey
are independent `keydown` handlers, each gated on `uiStack.isEmpty()`.
Adding GET/USE/DROP that way copy-pastes the targeting glue per verb —
exactly what source's shared block avoids. We lift the *structural
economy* (verb-agnostic targeting + a verb→handler split), NOT source's
substrate (the `CMD_*` opcode ints, the blocking double `CON_getch`,
the global `Selection` struct, `MouseMode`/`D_04C2`, the giant switch).
Per D2 + the modern-UX anchor, that machinery is 1990 input-loop
residue; the mechanic is `(verb, actor, target) → validate → effect →
cost` (the shared interaction contract,
[research_object_interaction.md](research_object_interaction.md)
§"The shared interaction pattern").

### Locked UI decisions (Zane, 2026-06-03)

- **#1 — message channel (NEW surface).** A gameplay scrolling text
  area, the `CON_printf` analog. Carries verb results ("You see a
  dagger. It weighs 0.1 stones.") and the canned refusals (`D_0DDC[]`:
  "Out of range!", "Nothing!", + `WhatMsg` "What?"). Does NOT exist
  today — `#log` is the dev/loading log, `#clock-hud` is the dev HUD.
  This is the one genuinely-new UI in I-10. Layout (below / beside the
  canvas), scrollback depth, and styling settled in I-10a.
- **#2 — LOOK = line only; `I` stays a separate always-modal "Inspect"
  tool (revised 2026-06-04).** Plain LOOK → a line in the message channel
  and nothing more: source's `C_27A1_0C67` is a pure scroll verb that
  **never** opens a panel or lists a container — its one "structured"
  branch is book/sign *reading* (`C_27A1_06D7` CanRead → `C_27A1_078F`
  reads `BOOK.DAT`), not a contents walk
  ([research_object_interaction.md](research_object_interaction.md)
  §"Look"; seeing inside a container is a USE/GET interaction, the
  `D_E709` open-container view). So the faithful LOOK is line-only. The
  **`I` hotkey is kept as a separate, clone-only "Inspect" tool** — always
  open the I-7 detail modal (obj#/status/position/contents) for any pick.
  `L` and `I` are therefore **deliberately distinct**: L = the description
  line, I = the structured detail/inventory view. (Revises the original
  2026-06-03 call, which had LOOK escalate to the modal for containers —
  the I-10f impl + a source re-check falsified it: `C_27A1_078F` is
  book/sign reading, not a contents list.)
- **#3 — targeting cue = visual, no text echo (option c).** When a verb
  is pending, tag the existing `#probe-cell` hover box (recolor + a
  small verb label); the **result** goes to the message channel. Drop
  source's textual `"Look-"`/`"Use-"` echo — that prompt-echo existed
  because a 1990 terminal had no better "you're aiming" cue; we have a
  mouse-following cursor. Modern-UX anchor: source's text-echo + aim-box
  envelope is substrate residue, the mechanic (verb → target → result)
  is the spec. Bonus: a visual cue degrades cleanly across both
  front-ends (cursor tag for verb-first, menu for target-first); a text
  echo would be verb-first-only.

### Dispatch-core seam (admits both front-ends)

- **`pickAtCell(x, y) → entity | null`** — the shared target resolver,
  generalized from the current `inspectAtCell` (main.js): the same
  three-tier cell-pick (NPC > object > ignore-tile,
  [research_object_interaction.md](research_object_interaction.md)
  §"Cell-pick — `C_2337_08F1`"), but returning the pick instead of
  opening a modal.
- **`dispatch({verb, actorEntity, target})`** where `target = {entity,
  x, y}` — the **local** intent value, the ECS analog of source's global
  `Selection {x,y,obj}`. Pipeline = the shared interaction contract:
  resolve → validate (adjacency `CLOSE_ENOUGH` + legality via I-4
  `canStandAt` for placement verbs) → face the target (I-8 facing) →
  effect → spend move-points / recompose (I-3/I-9 turn).
- **Handler registry** — `Map<verb, handler>` for the single-function
  verbs (LOOK/GET/DROP, later TALK/MOVE); **USE = `Map<ObjectType,
  useHandler>`** (the additive dispatch table,
  [research_object_interaction.md](research_object_interaction.md)
  §"Use" + §"Per-verb modules"). Each new usable type registers without
  touching the others.
- **Front-ends both end at `dispatch(...)`:** verb-first (this step) +
  target-first (deferred, below). The dispatcher never learns which one
  called it.

### USE handler implementation (the ~40-case branch)

Source's USE switch (`C_27A1_6179`, ~40 cases) looks daunting but
collapses to ~8 sub-patterns, and I-10 implements only 2 (door + crank).
Three rules keep it tractable:

1. **Registry, not switch.** `useHandlers: Map<ObjectType, fn>` +
   `registerUse([types], fn)` (group-registration = source's case
   fall-through, e.g. the door quartet `OBJ_129-12C` → one fn). Adding a
   case is a one-liner that can't break the others.
2. **Shared wrap in the dispatcher; handlers do ONLY the effect.**
   Source proves the boundary — everything around the switch in
   `C_27A1_6179` is written once. The USE verb-handler owns: head-resolve,
   the re-pick (`C_27A1_0919`, skip NPC/Ignore), the usability gate (→
   "Not possible!", ~`C_27A1_01DE`), adjacency + facing, the move-point
   cost (`SubMov 5`), recompose. Each registered handler owns only its
   type-specific effect.
3. **Factor sub-patterns so cases stay 1–3 lines.** The ~40 cases are a
   few shapes; one helper per shape:

   | Sub-pattern | helper | source examples |
   |---|---|---|
   | local frame-toggle | `toggleFrame(obj)` | doors `129-12C`, simple lever `0BA/0C0` |
   | quality-linked remote toggle | `qualToggle(ctrl, …)` | crank→`10D` (frame); lever→`136`, switch→`0AF` (add/del at `12D` markers) |
   | consume | `consume(obj)` | food `073/074/075` |
   | light source | `toggleLight(obj)` | lantern/candle/torch group |
   | board / mount | `board(obj)` | ships, horse `1AF`, cannon `1AC` |
   | level change | `changeLevel(obj)` | ladder `131` |

   I-10 implements only `toggleFrame` (door, I-10c) + the crank's
   quality-toggle (I-10d); the rest register later as one-liners.

**Discipline:** the map holds only *ported* handlers — unregistered types
fall to "Not possible!" (correct, not a gap). Keep source's full case
list in [research_object_interaction.md](research_object_interaction.md)
§"Use" as the to-do, and `console.warn` an un-ported-but-usable type
during play so gaps stay visible. USE effects go through the **same**
mutation primitives GET/DROP use (`setFrame` / add / delete) — no
parallel USE-only mutation path. Each handler cites its `C_27A1_*`
counterpart.

### USE cases beyond I-10 — demand-driven, no batch milestone

There is **no "implement all ~40 USE cases" step**, by design
(`user_retro_port_goal`: stop at the learning goal, defer mechanical-
completeness). The registry makes each case a one-liner added **when its
owning subsystem enters scope** — not a backlog to burn down. The min
scope ("wander Britain + talk to NPCs") is reached with just door + crank
(USE) + LOOK/GET/DROP + I-11/I-12 talk; the rest are post-min-scope and
may never land unless the scope grows. So when a future session asks
"when do we finish USE?" — the answer is "per subsystem, incrementally,
and most never."

| Case(s) | Gated on | When |
|---|---|---|
| door `129-12C` | movement | **I-10c (now)** |
| crank → drawbridge `120`/`10D` | castle access / NPC #12 | **I-10d (now)** |
| lever/switch → portcullis `10C`/`0AE` | a gated area on the wander path | small follow-on, same pattern |
| lantern/candle/torch | the lighting model (deferred) | with the lighting step |
| ladder/grate `131` → level change | dungeons / map-level transitions | when leaving the overworld |
| food / consume `073-075` | hunger / inventory-consume | quick add, only if it matters |
| vehicles `19C/19E/19F/1A7/1AF/1AC` | the vehicle subsystem | its own step — likely out of min scope |
| spellbook/scroll cast `03F/040` | magic (`C_1944_4C2F`, deferred) | when magic matters |
| instruments / moonstone / clock / one-offs | music / moongate / misc | likely never, unless scope grows |

### Sub-steps (each ≈ one save-point, browser-verified; squashed into one `impl I-10` per the I-7/I-8 default — unless kept separate like I-9)

**USE-first ordering (Zane 2026-06-03):** build the dispatcher against
its only table-dispatched consumer (USE), then the single-handler verbs
(LOOK/GET/DROP) follow as level-1 registrations.

- **I-10a — message channel + fixed UI shell. ✓ landed** (see
  "I-10a — landed" below). New DOM surface + a `message(text, cls)` API
  + scrollback + styling, built on a fixed game-shell grid.
- **I-10b — dispatch core (USE-shaped) + verb-first front-end +
  targeting cue. ✓ landed** (see "I-10b — landed" below). The
  `dispatch` pipeline + both registry levels + the verb-first front-end
  + `#probe-cell` cue + refusals, proven with a trivial echo USE
  handler.
- **I-10c — USE → door. ✓ landed** (see "I-10c — landed" below). The door (`C_27A1_2A44`,
  `OBJ_129-12C`) — open/close + locked check, toggling the door frame
  so the player can walk through. Closes the I-9/I-10 door seam (I-9
  left player doors requiring USE; humanoid NPCs phase, player must
  open). Verify: USE a closed door → opens → walk through; locked →
  "It's locked.".
- **I-10d — USE → lever / switch (quality-linked controls). ✓ landed**
  (see "I-10d — landed" below; reordered ahead of the crank, Zane
  2026-06-04). Lever `OBJ_10C`→`C_27A1_4479` (portcullis `OBJ_136`) +
  switch `OBJ_0AE`→`C_27A1_4672` (electric field `OBJ_0AF`) — both
  **add/delete** the gate object at quality-matched `OBJ_12D` markers.
  Builds the shared map add/delete primitives (also used by I-10e crank
  + GET/DROP).
- **I-10e — USE → crank (drawbridge). ✓ landed** (see "I-10e — landed"
  below). The castle drawbridge control:
  the **crank** `OBJ_120` → `C_27A1_433D` (seg_27a1.c:2056) → `C_27A1_3F47`
  (seg_27a1.c:1942). **Correction (read 2026-06-04):** the crank does NOT
  frame-toggle `OBJ_10D` in place — it `SearchArea`s for the bridge by
  quality, then **deletes every bridge tile and re-adds them in the new
  shape** (raised = edge tiles frames 6/7/8; lowered = a span across the
  moat, frames 0–5), gated by an occupancy check (can't close if someone's
  on it) + a water-clearance whitelist (`D_1D0A`, can't open onto non-
  water), plus `MoveObj` for anything on the bridge. ~110-line geometry
  port on the I-10d primitives. Relevant to the I-9 **NPC-#12** teleport
  (closed bridge → can't path → teleports; an opened bridge lets it path).
- **I-10f — LOOK. ✓ landed** (see "I-10f — landed" below). Single-handler
  verb; a source-faithful **line-only** description (no panel); viewport-range.
  The `I` hotkey stays a separate "Inspect" detail modal (L and I distinct).
  Verified live: terrain/item/NPC/container → line; `I` → detail modal.
- **I-10g — GET. ✓ landed** (see "I-10g — landed" below). Pick up an
  adjacent ground object into the active member's inventory
  (`C_27A1_18F5` → `moveToInventory` = `InsertObj INVEN`). **The
  `TypeWeight==0` fixed-object gate IS ported** (scenery/furniture →
  "You can't get that."; `reg.weightOf`, data from the tileflag plane);
  carry-capacity (`STREN*20`) + **theft/karma deferred**. Verified live:
  fixed carpet refused, real item → inventory; out-of-range / nothing-here.
- **I-10h — DROP. ✓ landed** (see "I-10h — landed" below). Two-stage target
  (faithful to source's `D` → inventory panel → "Location:", `SelectRange 7`):
  `D` → modal inventory picker (**recursive** — drills into nested containers;
  opens the hovered party member's inventory, else the avatar's) → pick item →
  armed map cursor (reach 7) → click/Enter a passable cell → `dropToMap`. Verified
  live: Orb dropped; **gold nuggets dropped out of Dupre's nested bag**; out-of-range
  / impassable handled. Throw animation + break-if-far + quantity + drop-into-
  container deferred. **(I-10j later migrated DROP onto the inventory window — `D` now
  lives in the window; the standalone `D` map-hotkey + `openInventoryPicker` retired.)**
- **I-10i — MOVE Mode 1 (push a ground object). ✓ landed (verified live).**
  (see "I-10i — landed" below). Push an adjacent world object one tile in a chosen
  direction (`C_27A1_1E8B`, the LOCXYZ branch). **New targeting shape — two-stage,
  direction-not-cell:** arm `M` → pick the object (Enter/click, adjacency-gated) →
  press a **direction** (arrow/numpad). The `TypeWeight==0` fixed-object gate
  (`reg.weightOf`, shared with GET) + the **verified `C_27A1_1DAB` diagonal
  corner-clearance** are ported. Mode 2 (give/transfer a carried item) is **I-10j**.

### I-10a — landed (UI-shell decision + message channel)

I-10a forced the UI-layout decision the scope above left open ("Layout
… settled in I-10a"). Resolved with Zane 2026-06-03:

**UI-shell model — Fixed Shell grid (LOCKED), Dynamic Dock as a named
later upgrade.** A fixed CSS-grid frame with named regions; components
are assigned to a region, no runtime drag/dock. The decision is *not*
high-lock-in because the real base is the **content/placement seam**,
not the grid: every panel is built as (a) a layout-agnostic data layer
(an ECS resource) + (b) an installer that's *handed* its DOM element
and knows nothing about page layout. The codebase already followed this
(`installDevHud(world, {hudEl, …})`, `installDevProbe`, `UIStack`), so
switching to a dynamic dock manager later is "write the dock manager +
re-parent the same panels," not a rewrite — same pivot-not-redesign
framing as the ECS Pure-primary / Hybrid-escape-valve decision. Modern
look (NOT U6's parchment frame) is the eventual direction; this step is
clean-neutral *structure* with the modern skin deferred to a later
pass (the seam makes the skin independent of the structure).

**What landed:**
- `resources/message_log.js` — `MessageLog` resource: capped ring
  (200) of `{text, cls}` lines, `push()/clear()`, a `revision` counter.
  The CON_printf analog's data half; layout-agnostic.
- `view/message_channel.js` — `installMessageChannel(world, {el})`: a
  render-flush system that rebuilds the list only when `revision`
  changes (idle = one int compare/frame; rebuild only on a message),
  auto-scrolls to newest, returns a `message(text, cls)` emitter. The
  placement half of the seam; mirrors `installDevHud`.
- `index.html` — the fixed game-shell grid: MAP (canvas, 1024×640
  unchanged) / MESSAGES (bottom strip) / RIGHT panel (spans both rows).
  Right panel = `#status-panel` placeholder (for I-13) over a
  collapsible `#dev-block`. The dev HUD + boot `#log` **relocated** into
  the dev block — `installDevHud`/`installDevProbe` unchanged (handed
  the same element IDs in new homes), which is the seam's proof. The
  pause indicator now tints `#clock-text` instead of a fixed-box border.
  Pre-load checklist/dropzone unchanged; `#app` hidden until `load()`.
- `main.js` — register `MessageLog`; reveal `#app` at the top of
  `load()`; install the channel + expose `window.__U6.message`; push a
  welcome line; drop the redundant `canvas.style.display` toggle.

**Verified live on Zane's real U6 data (port 8083):** shell geometry
exact (1312-wide frame = 1024 map + 280 panel + 8 gap; messages 1024×157
below the map; right panel full-height); Britain renders in MAP; the
message channel shows the welcome line via the real resource path, and
`window.__U6.message()` appends with correct color classes (default /
`miss` red / `ok` green) + auto-scrolls; dev HUD populated (clock, NPC
stats, probe, boot log); no console errors. Render-flush is next-frame
(push is synchronous, DOM updates on the following rAF) — expected.

**Deferred (Zane 2026-06-03):**
- **Fit-to-window** — RESOLVED 2026-06-05 by the render-to-fit refinement: the canvas
  drawing buffer now tracks its CSS cell size and the shell fills the window, so the page
  no longer pans. Full write-up in §"Render-to-fit viewport".
- **Modern skin pass** — clean-neutral palette/structure now; modern
  typography/spacing/visual language is a later CSS-only pass on the
  stable shell.

### I-10b — landed (dispatch core + verb-first front-end)

The object-action dispatch core, proven against USE with a trivial echo
handler (real effects in I-10c+). Lifts the *structure* of source's
shared targeting block (verb-agnostic targeting + a verb→handler split,
seg_0A33.c:1231-1278) but not its substrate (CMD_* ints, double
`CON_getch`, global `Selection`/`MouseMode`/`D_04C2`, the giant switch).

**What landed:**
- `systems/cell_pick.js` — `makePickAtCell(world, reg)` → the
  source-faithful 3-tier pick (NPC > object > ignore-tile,
  mkMouseSelection→`C_2337_08F1`) returning a HANDLE; `{forUse}` option
  = source's USE re-pick `C_27A1_0919` (objects only, skip NPCs).
  **Generalized from main.js's inline `inspectAtCell`** — the inspector
  hotkey and the dispatcher now share one pick (the inline copy in
  main.js is gone).
- `resources/commands.js` — `Commands` resource: `verbHandlers`
  (`Map<verb, fn>`, single-function verbs) + `useHandlers`
  (`Map<objNumber, fn>`, USE's additive type table) + `register` /
  `registerUse([types], fn)` (list = fall-through group). Holds only
  ported handlers.
- `systems/command_dispatch.js` — `installCommandDispatch`. The
  `dispatch({verb, target})` pipeline: verb lookup (→ "What?" if
  unknown) → adjacency `withinReach` (wrap-aware Chebyshev ≤ 1 from the
  avatar; → "Out of range!") → verb handler. **Face-the-target +
  move-point cost are deferred** to the real handlers (time already
  advances on the turn heartbeat, so the echo needs neither). The USE
  verb-handler is the shared wrap: re-pick (`forUse`) → look up
  `useHandlers` by objNumber → call, else echo `Nothing happens.
  (name)` + `console.warn` (the unported-type path; tightens to "Not
  possible!" once real handlers + a usability flag exist). Verb-first
  front-end: a `keydown` arms a verb key (`U`→use; extensible), the
  `#probe-cell` highlight recolors + shows a verb label (decision #3,
  visual cue — no source text-echo), Enter confirms the hovered cell
  (`probe.getLastCell()`), Esc → "What?" + disarm. Returns `{dispatch,
  isPending}`.
- `view/inspector.js` — exported `displayName(world, handle,
  {reg, objlist})` (GetObjectString-faithful) so the echo reuses the
  inspector's name resolution.
- `index.html` — `#probe-cell.armed` recolor + `.probe-verb-label` cue
  styling.
- `main.js` — register `Commands`; build `pickAtCell` via
  `makePickAtCell`; install the dispatcher; **refactor the I-7c
  inspector hotkey** to use the shared `pickAtCell` + gate on
  `!cmd.isPending()` (no inspecting mid-aim); expose `window.__U6.cmd`
  / `.pickAtCell` for live debugging.

**Verified live on real U6 data (port 8083):** avatar at (307,352);
`dispatch use` on the adjacent object (306,351) → `Nothing happens.
(carpet)` (name via the GetObjectString path; carpet picked through the
`forUse` ignore-tile fallback); a far cell → `Out of range!` (red); an
unknown verb → `What?` (red); arming `U` sets `pending` + the `armed`
class + the "Use" label, Esc clears all three. No console errors.

**Deferred to I-10c+ (as scoped):** the real USE effects (door, crank);
LOOK/GET/DROP; face-the-target; move-point cost; the target-first
front-end (click → verb menu).

### I-10c — landed (USE → door)

First real USE handler — the door quartet `OBJ_129-12C` (Oaken /
Windowed / Cedar / Steel), all routed to one handler (source's USE
switch sends them to `C_27A1_2A44`, seg_27a1.c:3069). Pre-impl read of
`C_27A1_2A44` (seg_27a1.c:1280) done.

**Door frame model (`C_27A1_2A44`):** low 2 bits = orientation/variant;
bits 2-3 = state — 0 open, 1 closed (unlocked), 2 key-locked, 3
magically locked. In source, plain USE (flags 0,0,0) toggles the
open↔closed bit on an unlocked door and **refuses** a locked one;
unlocking needs the matching key or a spell (the `bp0a`/`bp08`/`bp06`
arms, via `C_27A1_2D8E` / magic).

**TEMPORARY lock bypass (Zane 2026-06-04):** the clone **force-opens**
a locked door instead of refusing. The faithful unlock needs (a) the
matching key — e.g. the quality-1 key for the steel door at (304,382)
gating the castle drawbridge/portcullis — which U6 hands the player via
**Lord British's conversation** (the conversation VM = I-13, not built),
and (b) a USE-an-inventory-item-on-a-target front-end (deferred).
Investigated 2026-06-04: no quality-1 key exists in the loaded start
region (only a quality-14 key at (298,355) + three quality-0 lockpicks
held by NPCs; lockpicks open quality-0 locks only), so a locked door
would dead-end progress. **REVERT** to the source-faithful refusal +
key/lockpick unlock once I-13 + the key mechanism land.

**What landed:**
- `world_loader.js` — `setObjectFrame(world, handle, frame)`: the shared
  mutation primitive (mirrors source `SetFrame`) — sets `ObjType.frame`
  + refreshes `Renderable.tileId` via `reg.tileForObject`. Every USE
  frame effect (door now; crank/lever later) and any future frame change
  goes through it. (GET/DROP — I-10g/h — use their own `moveToInventory` /
  `dropToMap`, not this primitive.)
- `systems/use_handlers.js` — `useDoor` (open↔closed toggle; **locked
  doors are force-opened** per the bypass above — preserves the low-2-bit
  orientation, clears the lock) + `registerUseHandlers(world)` registering
  `DOORS = [129,12A,12B,12C]` via `Commands.registerUse`. The handler does
  ONLY the effect; the
  dispatcher's shared wrap (re-pick, adjacency, lookup) is unchanged —
  adding the door was one `registerUse` + one effect fn. The seam's
  payoff.
- `main.js` — call `registerUseHandlers` after the dispatch install;
  expose `window.__U6.commands` + `.stores` (dev hooks).

**Passability follows for free** (the I-4 per-frame-tile-flags finding):
opening the door changes its `tileId`, and `canStandAt` reads the live
tile flags — no special-case. Verified: the closed oaken-door tile 1031
is impassable+wall, the open tile 1027 is neither.

**Verified live on real data (port 8083):** all 4 door types
registered. Unlocked oaken door (296,351, obj 297, frame 7): USE → "You
open the door." (frame 7→3, tile 1031→1027) → USE → "You close the
door." (3→7). Far door (300,347) → "Out of range!". The **key-locked
steel door at (304,382)** (obj 300, frame 9, quality 1 — the
drawbridge/portcullis gate): USE → "You force the door open." (frame
9→1, tile 1081→**1073, now passable**) → USE → "You close the door."
(→5, unlocked-closed). Passability flips with the frame (closed 1081
impassable, open 1073 passable). No console errors.

**Closes the I-9/I-10 door seam + unblocks the drawbridge route:** the
player can now pass the locked steel door to reach the castle's south
gate controls — lever→portcullis at (303,383) + cranks→drawbridge at
(303,384)/(311,384), bridge tiles (303–310,385) (all confirmed in
region 26). **Deferred:** the real key/magic unlock (see bypass note —
keys arrive via I-13 conversation); the I-9 non-humanoid door-phasing
predicate (`isHumanoid` vs `MONSTER_4000`) is a separate I-9 audit item.

### I-10d — landed (USE → lever / switch, + the map add/delete primitives)

Reordered ahead of the crank (Zane 2026-06-04): build the shared add/
delete map primitives on the *simpler* quality-linked control first, then
the crank (I-10e) reuses them. Pre-impl reads of `C_27A1_4479` (lever),
`C_27A1_4672` (switch), `C_27A1_433D`/`C_27A1_3F47` (crank) all done.

**Source correction:** the scope above had called the crank a "frame-
toggle." Reading the bodies showed **neither** control frame-toggles —
all of lever / switch / crank **add and delete** objects. (Caught before
building, per "verify research against source.")

**What landed:**
- `world_loader.js` — runtime map-object primitives (mirror source
  AddObj/DeleteObj/SearchArea): `addMapObject` (create + `insertAtHead`),
  `deleteMapObject` (`spatial.remove` + `destroy`), `findObjectsByTypeQuality`
  (SearchArea analog), `objAtCell`, `actorAtCell` (the occupancy gate's
  actor-at-cell test, source's actor/object index split `C_27A1_3E9A`).
  Shared by lever/switch now, the crank (I-10e), and GET/DROP (I-10g).
- `systems/use_handlers.js` — `markerToggle` shared helper (flip the
  control's frame; for each `OBJ_12D` marker matching the control's
  quality, add the gate if absent / delete if present; occupancy-gate the
  add) + `useLever` (`OBJ_10C`→portcullis `OBJ_136`, frame 3 if marker
  bit 2 else 1, occupancy-checked) + `useSwitch` (`OBJ_0AE`→electric field
  `OBJ_0AF`, frame 0, no occupancy). Registered both.

**Passability follows for free:** the gate object's tile is impassable, so
add = blocked cell, delete = clear cell — no special-case.

**Verified live on real data (regions 18+26):** the castle lever
(303,383, quality 1) ↔ its `OBJ_12D` quality-1 marker at (307,384) ↔ the
portcullis (`OBJ_136`) there. USE lever → frame flips 0→1, portcullis
**deleted** (raised; cell now passable — tile 1149 is impassable) → USE
→ frame 1→0, portcullis **re-added** (dropped). "You hear a noise." each
toggle. Occupancy: with an actor spatially on the marker, USE → gate
stays raised + "You can't close the portcullis."; cleared → drops
normally. No console errors. (Switch path is the same mechanism but
untested — no `OBJ_0AE` reachable in the start area.)

### I-10e — landed (USE → crank, the drawbridge)

The geometry-heavy USE handler — port of `C_27A1_433D` → `C_27A1_3F47` in
its own module. The bridge is a run of `OBJ_10D` tiles whose FRAME encodes
position+state (raised = one row [6,7…,8]; lowered = rows spanning south
[3,4…,5] + a shore row [0,1…,2]); open/close **delete + re-add** the run in
the other shape (not a frame-toggle), on the I-10d add/delete primitives.

**What landed:**
- `systems/use_drawbridge.js` — `findBridgeAnchor` (the frame-3/6 corner,
  topmost-leftmost, matched by the crank's quality — explicit, vs source's
  reliance on SearchArea scan order), `activateBridge` (width count →
  clearance/occupancy gates → delete + re-add with the position frames →
  `MoveObj` entities onto the lowered deck), `useCrank` (`C_27A1_433D`
  entry: find bridge by quality → activate → result message), `registerCrank`
  (`OBJ_120`). Wired via `registerUseHandlers`.

**CLONE DEVIATION (flagged):** source bounds the span with a hardcoded
shore-tile whitelist `D_1D0A` = {0x10,0x1C,0x20,0x2C,0xD6} (extend over
non-whitelist cells, stop at one). The clone extends while the terrain is
**WET** and stops at the first non-wet cell (`reg.isTerrainWet`, the I-4
flag) — the representation-native equivalent of "span the water, land on the
shore," robust to our full tile ids rather than source's byte values. The
cosmetic crank-turning tile animation (`SetTileAnimation`) is dropped
(hardware effect, not gameplay).

**Verified live (regions 18+26):** the castle drawbridge — raised row at
y385 (303–310, frames 6/7/8); moat wet y386–390, shore y391. USE crank
(303,384) → "You open the drawbridge.": raised row deleted, a 7-wide
lowered span laid across the moat (rows y386–390 frames 3/4/5, shore row
y391 frames 0/1/2); a sample lowered tile (307,388) is **passable** (tile
918) — the moat is crossable. USE again → "You close the drawbridge.":
exact round-trip to the raised row. Occupancy gate: an actor on the lowered
bridge → "You can't close the drawbridge." (stays open); cleared → closes.
No console errors. (The "can't open" clearance gate uses the same blockedAt
check; not separately exercised — no moat-blocker scenario at hand.)

**NPC-#12 unblock:** a modeled, crossable drawbridge now exists, so the
bridge-gated NPC can path across instead of teleporting (the I-9 known
issue). Tying #12's actual route to the open bridge is an I-9-audit
follow-up; the mechanism it needed is now in place.

### I-10 refinement — windowed quality search (active-area bound)

A follow-up to I-10d/e (decided + landed 2026-06-04), closing a latent bug in the
quality-linked-control search. Source's lever/switch/crank scan with
`SearchArea(0,0,0x3ff,0x3ff)` (`C_27A1_4479`/`4672`/`433D`) = *no coordinate filter*,
relying on U6's DOS streaming to keep only the ~40×40 active area resident
(`SearchArea`/`NextArea` walk the resident `Link[]` chain; `C_1184_19AA` evicts
beyond a ±20 box). The clone **never unloads regions**, so an unfiltered
`findObjectsByTypeQuality` is an unbounded superset that grows with exploration —
after two castles, two quality-0 controls could co-resolve, a collision source
structurally avoids. Full mechanism: `research_world_data.md §"Area-bounded object
search"`; handler scope: `research_object_interaction.md §"Quality-linked controls —
search scope"`.

**What landed:**
- `world_loader.js` — `findObjectsByTypeQuality(world, objNumber, quality, near=null)`
  gained the optional `near = {x,y,z}` window: `query(ObjType, Position)` (the
  `LOCXYZ`/on-map restriction = `NextArea`'s `GetCoordUse` skip), `z == near.z`
  (`NextArea`'s `z == MapZ`), and a **±20 box** (`|Δx|,|Δy| ≤ 20`). No `near` ⇒
  unchanged global scan.
- `systems/use_handlers.js` (`markerToggle`) + `systems/use_drawbridge.js`
  (`findBridgeAnchor`/`useCrank`) pass the **control object's own cell** as `near`.

**Decisions (Zane 2026-06-04):** (1) **center ±20** — a symmetric box, the I-9
`AREA = 40` work-area size; not source's chunk-aligned `AreaX = (MapX-16) & ~7`
anchor (the clone has no streaming `AreaX`, and the ≤4-tile difference is immaterial
for a circuit search). (2) **Center on the control cell**, not the avatar (they're
adjacent on USE; the control's position is already in hand). (3) **Keep the z
filter** even though it's a no-op while single-level (overworld) — it's a faithful
port of `NextArea`'s `z == MapZ` and becomes load-bearing once dungeons co-reside
under no-unload (the xy box doesn't exclude a same-xy object on another level).

**Verified live (preview-eval, real Britain data):** (a) predicate — 34 quality-0
doorways → 9 windowed (all Chebyshev ≤ 20), 25 excluded; (b) synthetic in-world
markers — ±20 boundary-inclusive (Δ20 kept, Δ21 dropped), z=1 same-xy marker
excluded, temp entities cleaned up; (c) **end-to-end on the real castle gate** — the
lever (303,383, q1) toggles its portcullis at (307,384) open/close (the q1 marker is
in **region 26**, across the y=384 boundary from the region-18 lever, Chebyshev 4 →
in-window), while the unrelated portcullis at (351,407) (out of window + different
circuit) is untouched. Round-trip exact, lever frame restored, no console errors.
See `Journal.md` 2026-06-04 (windowing entry).

### I-10f — landed (LOOK)

The first single-function verb (LOOK is not table-dispatched — one handler,
`C_27A1_0C67`). Registered in the dispatch core per the revised decision #2: LOOK
is a **line-only, source-faithful** scroll verb (no panel); the `I` hotkey stays a
separate clone-only "Inspect" modal. The two are deliberately distinct.

**What landed:**
- `systems/command_dispatch.js` — the `look` verb handler: `pickAtCell` (3-tier,
  NPCs included — NOT the USE re-pick) → an empty/invisible cell names the terrain
  (`mapLevel.tileAt` + `getTileLook`, `C_27A1_0C67:496-510`) plus the adjacent
  "Searching here, you find nothing." search line; everything else prints
  `Thou dost see <article><name>.`. **No modal escalation** — source's LOOK never
  opens a panel. LOOK is **viewport-range** — added a `VIEWPORT_VERBS` set so the
  dispatcher skips the adjacency gate for it (source reads the pointer cell with no
  reach check). `withArticle` approximates `C_27A1_061E`'s a/an (proper nouns take
  none). `L` added to `VERB_KEYS`.
- `main.js` — the `I` hotkey is **kept** as the always-open detail inspector
  (`openInspector` for any pick), now documented as the deliberate counterpart to
  LOOK (L = line, I = structured detail/inventory view).

**Source re-check correction (Zane flagged; caught before commit):** the first cut
followed the original decision #2 and escalated container OBJECTS to the inspector
modal on LOOK. Re-reading `C_27A1_0C67` falsified it — its only "structured" branch
is `C_27A1_06D7` (`CanRead?`) → `C_27A1_078F` (`/*read book or sign?*/`, opens
`BOOK.DAT`), i.e. **book/sign reading, not a container-contents walk**. Source LOOK
never opens or lists a container (that is a USE/GET interaction). So LOOK is
line-only and the inspector modal is exclusively the `I` tool. (A second, smaller
trap surfaced first: NPCs carry inventory so they are `Container`-tagged too — moot
once LOOK stopped escalating containers entirely.)

**Deferred (need absent subsystems):** weight ("It weighs N stones" — TypeWeight
table), damage/armor points (combat stats), the **count-prefix** (`C_27A1_0841`,
gated on the QuanType table — without it the raw quantity mislabels non-stackables,
"10 crate"), book/sign text reading (`BOOK.DAT`), the spellbook spell-list (spells),
clock/sundial time read, sign-tile redirect, the NPC portrait (`C_27A1_02D9`),
darkness gating (`D_B6DF`, lighting). The a/an/the article's exact per-tile data
(`C_27A1_061E`) is approximated by `withArticle`.

**Verified live (preview-eval, real Britain data):** LOOK (`L`) → terrain "Thou dost
see floor." / "grass." (incl. a 30-tile-away cell, proving viewport range), item
"a flag.", NPC (Avatar) "Avatar.", a crate "a crate." — all **lines, no modal**.
Inspect (`I`) on the same flag / crate → the detail modal (obj#/status/contents),
confirming the L-vs-I split. `L` arms "Look" + Esc disarms; no console errors.

**Mouse-confirm (same session, Zane request):** the verb-first front-end now
confirms with a **left-click** as well as `Enter` — `command_dispatch.js` adds a
canvas `click` that dispatches the armed verb at the highlighted cell, and
`dev_probe.js` **suppresses drag-to-pan while a verb is armed** (`isVerbArmed`, a
forward-ref to `cmd.isPending()` passed from `main.js`). Per Zane: the armed
targeting state expects a click, not a pan — so no click-vs-drag threshold is
needed. This restores source's native targeting route (the mouse click; `Enter`
only *synthesises* a click, seg_0C9C.c:1206-1217). Verified live: armed-Look +
click → "Thou dost see …" at the cell + disarm; a drag while armed pans 0 px;
`Enter` unchanged; no console errors.

### I-10g — landed (GET)

The first inventory-mutating verb — pick up an adjacent ground object into the active
party member's inventory (port of `C_27A1_18F5`). **DROP is split out to I-10h** (its
inventory-item + location two-target flow is heavier in the current architecture —
Zane 2026-06-04: do GET first).

**What landed:**
- `world_loader.js` — `moveToInventory(world, item, holder)`: source's
  `InsertObj(obj, holder, INVEN)` (`C_27A1_18F5:882`). Unlinks the entity from the map
  (`spatial.remove` + drop `Position`) and attaches it via the existing
  `attachToHolder` (`ContainedIn{holder, equipped:0}` + marks the holder `Container`).
  Renderable/Amount stay (the inspector icon + qty). Stack-MERGING (`GiveObj`) is
  deferred — a got stack becomes one INVEN entity.
- `assets/tile_flags.js` + `resources/tile_registry.js` — decode the **`TypeWeight`
  plane** (tileflag @0x1000, 1024 bytes, indexed by object type) that was previously
  skipped, exposed as `reg.weightOf(objType)`. This is the data the gettable gate needs
  (it was already in the loaded `tileflag` file).
- `systems/command_dispatch.js` — the `get` verb handler: `pickAtCell(…, forUse)`
  re-pick (objects only, skip NPC/ignore — `C_27A1_0919`, you can't get an NPC) → must
  be on the ground (`Position`) → **the `TypeWeight==0` fixed-object gate**
  (`reg.weightOf(objNum) === 0 || === 255 || objNum === OBJ_19B` → "You can't get
  that.", `C_27A1_18F5:857-861`) → `moveToInventory` into `avatarRef` → "You get
  <article><name>.". Adjacency is the dispatch gate (CLOSE_ENOUGH 1; GET isn't a
  viewport verb). `G` added to `VERB_KEYS`.

**The gettable gate (Zane-flagged, ported same session):** the first cut deferred ALL
weight handling, so the clone got *everything* — including fixed scenery (it picked up
a carpet). Source's gettability gate is `TypeWeight[type]` (`C_27A1_18F5:858` +
`GetWeight` `seg_155D.c:165`): **`TypeWeight==0` = a fixed object** (scenery, furniture,
walls) — refused for GET *and* MOVE (`seg_27a1.c:995`). That gate is load-bearing
(defines GET correctness) AND its data was already loaded, so it's ported here — only
the carry-capacity (`STREN*20`) gate stays deferred.

**Deferred (no subsystem yet):** the carry-**capacity** gate (`STREN*20 < total`, needs
strength + a running carried-weight total), terrain-damage-on-grab (fire/lava),
**theft/karma** (no karma system), lit-torch-to-hand (no equip flow), stack-merge
(`GiveObj`), per-type fixups (close lanterns, etc.), the explicit `SubMov(3)` cost (time
advances on the turn heartbeat).

**Verified live (preview-eval, real Britain data):** `G` + click an adjacent **fixed
carpet** (obj 0x12f, `weightOf==0`) → "You can't get that." (stays on the map); a
**real item** (a placed weight-12 object) → "You get …" — the entity leaves the map
(Position dropped, off the SpatialIndex) and appears in the avatar's inventory
(confirmed via the `I` Inspect modal); a non-adjacent item → "Out of range!"; an empty
cell → "Nothing to get."; no console errors.

### I-10h — landed (DROP)

DROP a carried item onto a map cell — split from GET (`C_27A1_14DA`). **Source-faithful
two-stage target**, verified from primary source: pressing `D` switches the status
panel to inventory (`seg_0A33.c:1088`, `StatusDisplay = CMD_92`) → pick the item → the
handler prompts "Location:" for a cell within `SelectRange = 7`. The clone mirrors this
as **`D` → modal picker → armed map cursor (reach 7) → click/Enter a cell**.

**What landed:**
- `world_loader.js` — `dropToMap(world, item, x, y, z)`: inverse of `moveToInventory`
  (source's `MoveObj`). Strips `ContainedIn`, adds `Position`, head-splices into the
  SpatialIndex.
- `view/inventory_picker.js` — `openInventoryPicker(world, holder, uiStack, {onPick})`:
  a modal "pick one carried item" list, reusing the I-7 substrate (`UIStack`,
  `makeListCursor`, `tileIcon`, `inventoryOf`). The stand-in for source's
  panel-switch-to-inventory (no persistent inventory panel yet). **Recursive** —
  selecting a carried container (a bag) drills into it via a nested picker (the
  inspector's "open this then open that"), so a deeply-nested item is droppable (source
  allows any `CONTAINED` object). On pick at any depth it pops the whole picker chain
  back to the depth captured at the **root** open (new `UIStack.depth()` + a base-depth
  pop — **not** `clear()`, which would be blunt; not a single pop). Esc backs out one
  level.
- `systems/command_dispatch.js` — `armDrop(itemHandle)` (the picker's `onPick` → arm the
  cursor with a *pending item*) + the `drop` handler (validate the cell via `canStandAt`
  = the `C_1E0F_000F` placement-legality analog → `dropToMap` → "You drop <name>."). DROP
  reach is **7** (`VERB_REACH`, vs adjacency-1); the dispatch now threads an `item`
  payload so the armed confirm (Enter/click) carries the chosen item.
- `main.js` — `D` hotkey opens the picker → `cmd.armDrop(item.handle)`. The picker's
  holder is the **hovered party member** when the cursor is on one (`Actor` +
  `PartyMember`), else the avatar/active member — a clone QoL convenience (source drops
  from the active member, switched via the party panel). The picker title shows the
  holder's name (`<name> — drop which item?`).

**Two-stage-target seam (new):** DROP is the first verb whose first target isn't a map
cell, so the dispatch gained a small `pendingDropItem` payload the armed confirm carries.
The same "arm with context → pick a cell" pattern is reusable for **TALK** and a future
**"use item X on target Y"**. (The picking-Enter doesn't double-fire the drop: the
dispatch keydown listener was registered before `UIStack`'s, so it sees the modal open
and returns; only the *next* confirm fires.)

**Deferred (substrate / other subsystems):** the missile-arc throw animation, the
break-if-fragile-and-far outcome, the quantity prompt for partial stacks,
drop-into-container, unequip-on-drop (equipment system), `SetOkToGet` (anti-theft, no
karma yet).

**Verified live (preview-eval, real Britain data):** `D` opens the picker (sword
equipped / Orb of the Moons / ankh amulet); picking the Orb + confirming a passable
cell → "You drop Orb of the Moons." (inventory 3→2, the item now on the map at the
cell); a cell >7 away → "Out of range!"; an impassable cell → "You can't drop it
there."; the click-confirm correctly carries the armed item. **Member-targeting:**
hovering companion **Dupre** + `D` → "Dupre — drop which item?" (his inventory);
hovering an empty cell → "Avatar — drop which item?" (default). **Nested drop:**
drilling into Dupre's **bag** (depth 1→2, title "bag — drop which item?") and picking
the **gold nuggets** pops the picker chain to depth 0 + arms; confirming a cell → "You
drop a gold nuggets." (now on the map, gone from the bag). No console errors.

### I-10i — landed (MOVE Mode 1 — push a ground object)

Push an adjacent world object one tile in a chosen direction — `C_27A1_1E8B`'s
**Mode 1** (the `GetCoordUse == LOCXYZ` branch, `seg_27a1.c:968-1043`). MOVE is a
**dual-mode** verb; this step ships only the push half. **Mode 2 (give/transfer a
carried item — the `else` branch :1044) is I-10j.**

**New targeting shape — direction, not a cell.** DROP's two-stage is *pick item
(modal) → pick cell (cursor)*. MOVE inverts the second stage to a **direction key**:
arm `M` → pick the adjacent object (Enter/click) → press an arrow/numpad direction.
This mirrors source's `M` → SelectMode `getch` (the object) → "To " `getch` (the
direction, `:983`). Three inputs.

**What landed:**
- `systems/avatar_move_system.js` — `KEY_DIR`/`CODE_DIR` are now **exported**, plus a
  `dirFromKeyEvent(e)` helper, so MOVE's stage-2 push-direction pick shares ONE
  keyboard→direction map with avatar movement (the avatar handler was refactored onto
  it — no behavior change).
- `world_loader.js` — `moveMapObject(world, handle, x, y, z)`: source's `MoveObj`
  (spatial.remove → update `Position` → insertAtHead, the same chain-head relocate the
  avatar step does inline). A reusable runtime primitive.
- `systems/command_dispatch.js` —
  - `m: 'move'` binding; MOVE is a normal **adjacency** verb (reach 1, not viewport,
    not DROP's reach 7) — the dispatch's `CLOSE_ENOUGH-1` gate is source's
    `CLOSE_ENOUGH(1, …, MapX, MapY)` (`:969`).
  - the `move` handler (**stage 1**): `pickAtCell(forUse)` (objects only, skip
    NPC/ignore) → the `TypeWeight==0` fixed-object gate (`reg.weightOf(objNum) === 0
    || === 255 || === OBJ_19B` → "You can't move it.", `:995`) → on success sets
    `pendingMoveObj` + `awaitingDir`, swaps the cursor label to "Move…" and prompts
    "Push it which way?". It does **not** complete here.
  - `resolveMove(handle, dir)` (**stage 2**): the arrow/numpad key → `canPushTo`
    legality → `moveMapObject` one tile, or "You can't move it there." One attempt per
    `M` (a blocked direction disarms; re-press `M` to retry — source `return`s at
    `:1016`).
  - `canPushTo` (module-level) = the **verified port of `C_27A1_1DAB`** (`:924`): the
    destination must be passable (`canStandAt`, the `C_1E0F_000F` proxy DROP also
    uses); a **diagonal** push additionally needs at least one flanking cardinal
    (`dir±1`) passable, so an object can't be squeezed through a wall corner.
  - front-end: the Enter/click confirm is refactored into one `confirm(cell)` that
    skips `disarm()` when stage 1 transitioned to `awaitingDir`. A new `awaitingDir`
    keydown branch captures the direction key, `stopPropagation()`s it (so the
    avatar's *window*-level keydown — later in the bubble than this *document*-level
    one — doesn't also walk on the same key), runs `resolveMove`, disarms. Esc cancels
    ("Never mind."). No change to `avatar_move`'s `isBlocked` — bubble order does the
    suppression.

**Input routing — the crux.** Arrow keys mean different things by stage. In **stage 1**
(armed, aiming) they fall through `command_dispatch` to the avatar's `window` listener,
so you can still **walk closer** while a verb is armed (pre-existing behavior). In
**stage 2** (`awaitingDir`) the `document` listener grabs the arrow first and
`stopPropagation`s, so the same key **pushes the object** and the avatar stays put.

**Deviations / deferrals (faithful, documented like GET/DROP):**
- **`SubMov(5)`** move-point cost — deferred (move-point economy is still project-wide
  deferred; the turn heartbeat advances time anyway).
- **Push-into-container** (`InsertObj CONTAINED` when the destination cell holds an
  accepting container, `:1012`) — deferred.
- **Directional-object facing frames** (cannonball `OBJ_0DD` sets its frame instead of
  moving, `:1023`) — deferred (rare).
- **`IsTileSu` table-surface accept** (`C_27A1_1330`) — treated as no surface, so you
  can't push an object onto a tabletop yet; `canPushTo` reduces to pure `canStandAt`.
- **Target-then-refuse an NPC** — source targets an NPC then refuses with a specific
  message (`:999`); the clone's `forUse` re-pick skips NPCs at the pick instead (same
  outcome, friendlier — and it picks an object *under* an NPC, which source wouldn't).
- **Object push-legality via the walks-class `canStandAt`** — source's `C_1E0F_000F`
  dispatches on the moved object; for an inanimate object that reduces to
  terrain/object passability, which `canStandAt`'s walks branch approximates (and which
  DROP placement already relies on).

**Verified live** (preview-eval, real Britain data, in Lord British's castle; drove the
real `cmd.dispatch` stage-1 + an `Arrow*` keydown stage-2, world state restored after):
- **Push** — a **chair** (`OBJ_0FC`, weight 74) one tile **west**: `(301,352) → (300,352)`,
  messages "Push it which way?" → **"You move a chair."**.
- **Avatar stays put** — avatar at `(302,352)` was unchanged across the direction key, so
  stage-2 `stopPropagation` correctly suppressed the avatar walk.
- **Blocked direction** — pushing the chair into an occupied (avatar) cell → **"You can't
  move it there."**, chair unmoved.
- **Fixed object** — MOVE on carpet (`OBJ_12F`, weight 0) → **"You can't move it."**.
- **Out of range** — MOVE on an object 8 tiles away → **"Out of range!"**.
- **Arm / cancel** — `M` keydown arms (`isPending()` true); `Esc` → "What?" + disarm.
- *Not exercised live:* "Nothing to move." (the throne room has no empty adjacent cell);
  it's the same trivial `pick === null` guard already verified live for GET ("nothing-here").

### I-10j — landed (2026-06-05): verb-aware inventory window, DROP migration, MOVE Mode 2 (give)

Landed 2026-06-05 (auto-run save-points, steps 1-4; squashed to one commit `260e61e`). Plan settled with Zane 2026-06-04. **Two parts sharing one new surface:
migrate DROP onto a verb-aware inventory window FIRST, then add give (`M`).** Doing DROP
first validates the window with a verb already built; give is then one extra key. Source
for give: `C_27A1_1E8B`'s `else` branch (`seg_27a1.c:1044-1141`).

**Implementation (auto-run save-points, 2026-06-05):**
- **Step 1 — verb-aware window ✓ landed.** `view/inventory_picker.js`
  `openInventoryWindow`: descriptive title (member / container name), `↑↓` + `Enter`
  recursive drill-in, `D`/`G` verb hand-off via `onVerb(verb, item)` (pops the chain to
  `baseDepth`), digit hook via `onDigit(n)`. Old `openInventoryPicker` kept until DROP
  migrates (step 3). Dev hook `window.__U6.openInventoryWindow`. Verified live: Avatar /
  Dupre / Shamino / Iolo titles, `↑↓` nav, drill into Dupre's bag (→ gold nuggets/coins)
  + `Esc`-back unwinds one level at a time.
- **Step 2 — digit-open + member-switch ✓ landed.** `main.js` `openMemberInventory(n)` +
  a top-row `Digit1`..`Digit9` keydown opens member n's window (`1`..`PartySize`, dynamic
  bound); the window's `onDigit` switches member (unwind to root, then re-open). **Top-row
  only** (`e.code` Digit*) — numpad digits stay avatar diagonals. Verified live: `2`→Dupre,
  drill into bag (depth 2), `1`→unwind+Avatar (depth 1), numpad `1` opens nothing.
- **Step 3 — DROP migration ✓ landed.** The standalone `D` map-hotkey is removed; the
  window's `D` on the highlighted item → `cmd.armDrop` → map cursor (reach 7) →
  click/Enter a cell → the unchanged `drop` handler. Old `openInventoryPicker` retired
  (+ its `displayName`/picker imports in main.js). Verified live end-to-end: digit
  `1`→Avatar window → highlight Orb → `D` → "You drop Orb of the Moons." at a passable
  cell (left inventory, landed on map), restored after.
- **Step 4 — give (MOVE Mode 2) ✓ landed.** The window's `G` on the highlighted item →
  `cmd.armGive(item, holder)` (holder = the giver member) → pick a recipient: a top-row
  digit (resolved in main.js → `cmd.giveTo`) OR a click on a party member
  (command_dispatch → `giveTo`) → `moveToInventory` → "You give …". Refusals: yourself →
  "yourself.", non-party → "Only within the party!", Esc → "Never mind.". Verified live:
  Dupre→Avatar (digit, "You give an ale to Avatar."), Avatar→Dupre (click, "You give Orb
  of the Moons to Dupre."), both refusals. Carry-weight gate / unequip-on-give /
  put-into-container deferred (faithful, as GET/DROP).
  - **Fix (2026-06-05):** give now shows the same armed `#probe-cell` rectangle + "Give"
    label as DROP while picking the recipient — `armGive` was missing the cue. Factored
    `showCue`/`hideCue` out of `arm`/`disarm`; `armGive` shows it, `giveTo`/Esc-cancel hide
    it. Verified live (cue shows on the give key, cleared on give + Esc).
  - **Key change (2026-06-05): in-window give key is `G`, not `M`.** "Give" reads as `G` to
    the player (`M` was the source MOVE-verb holdover); the code/comments keep the MOVE
    Mode 2 name. The map-cursor GET (`g`) is a separate context, suppressed while a window
    is open, so no clash. Hint is now `D drop · G give`.

**The inventory window (shared surface).** NOT the persistent U6 status panel
(`seg_0A33.c:933-936`, out of scope) — a modal **inventory window** opened on demand,
generalizing I-10h's `openInventoryPicker` from a one-shot "pick to drop" into a
**verb-aware** "browse a member's items and act on the highlighted one." It is the clone's
**carried-item targeting surface** — the analog of source's status-panel inventory that
`Selection.obj` points at (the missing piece that forced the modal pickers as stand-ins).

**In-window keymap** (the window is a UIStack modal, so its `onKey` owns these):

| Key | Action |
|-----|--------|
| `↑` / `↓` | move the item highlight |
| `Enter` | drill INTO a highlighted container (recursive, as I-10h) |
| `D` | DROP the highlighted item → pop window → `armDrop` → cell targeting (reach 7) |
| `G` | GIVE the highlighted item → pop window → recipient targeting (`G` reads as "give"; MOVE Mode 2 in code/source) |
| `1`..`PartySize` | open / switch to that member's inventory |
| `Esc` | up one container level, or close the window |

**Number-key member access — DECISION (Zane 2026-06-04):** digit keys open / switch a
member's inventory. `1`..`PartySize` → the member at party-index 0..N-1 (`1` = Avatar),
bound **dynamically to `PartySize`** (≤ 8 — `JoinParty` hard-caps at 8, `seg_1703.c:226`),
exactly source's `ch-'1' < PartySize` guard. `0` → a **party roster window**, DEFERRED to
its own later step.

**Member-switch with unwind:** a digit pressed while the window is open — even deep inside
nested containers — **unwinds the whole current chain back to the root `baseDepth` and
re-opens the new member at depth 1**, reusing the exact "pop to baseDepth" the recursive
picker already does on a final pick (I-10h). Reset-to-top is correct: you can't switch
people and stay inside a bag. Every nested level shares one `onKey`, so a digit at any
depth triggers the same clean reset — no per-level logic, no leak (UIStack push/pop is
O(1); TurnClock suspend is counter-balanced).

**Accepted divergence from source (Zane 2026-06-04):** in U6 the digit keys do NOT open
inventories — outside targeting they switch the *controlled* member (solo mode) / regroup
(`0` = party mode), `seg_0A33.c:1142`; during targeting they pick a member as the *target*,
`seg_0C9C.c:1298`. The clone has **no solo/party-mode** (Avatar always controlled,
companions follow), so the digit keys are free — we **repurpose them for inventory-open
now**. Whether to build solo/party-mode is undecided; *if* we ever do, the digit keys
become contested and we reconcile then — **decision deliberately deferred to that moment,
not pre-solved.** (The targeting use — a digit picks a member — stays faithful and is
reused for the give recipient, below.)

**Window title — DECISION (Zane 2026-06-04):** each window level shows a **simple
descriptive title — who/what, NOT the action** (the window is multi-verb now): the
**member name** at the top (`displayName(member, {objlist})`, e.g. "Dupre"), the
**container name** when drilled in (`getTileLook`, e.g. "a bag"). The verb keys live in a
bottom **hint line** (e.g. `↑↓ move · Enter open · D drop · G give · 1-4 switch · Esc
back`), not the title. This drops I-10h's action-phrased title ("Dupre — drop which
item?"). U6's status panel shows portrait+name; portraits are deferred, so the name is the
faithful-enough analog. **Breadcrumb DEFERRED (note):** a full-path heading
("Dupre ▸ bag ▸ pouch") is a nice later refinement for deep nesting; the stacked modals
already convey depth, so start with the per-level simple title and add the breadcrumb only
if deep navigation feels confusing.

**DROP migration (part 1 — do first):** DROP moves off its bespoke `D` map-hotkey onto the
window. The standalone `D` hotkey (main.js) is **removed**; you open an inventory via a
digit, highlight an item, press `D` IN the window → the window pops → `armDrop(item)` arms
the map cursor → click/Enter a cell (reach 7) → the existing `drop` handler runs unchanged.
So DROP is reachable only via *digit → window → `D`* (no more `D`-on-the-map). The post-arm
flow (`armDrop` + the `drop` verb handler + `canStandAt` + `dropToMap`) is reused verbatim
— only the entry changes.

**Give (part 2 — MOVE Mode 2):** add `G` to the window: highlight an item → `G` → window
pops → pick a recipient (a digit `1`..N, source-faithful per `seg_0C9C.c:1298`, or a click
on the party member) → `moveToInventory(item, recipient)` → "You give …". Party members
need no adjacency (always "around"); refusals: yourself → "yourself." (no-op), non-party
NPC → "Only within the party!".

**UIStack rule (verified live 2026-06-04):** while the inventory window is open the UIStack
owns the keyboard (its single listener routes every key to the top modal's `onKey`, and the
global command_dispatch / hotkey listeners early-return on `!uiStack.isEmpty()`), so the
window MUST handle the verb keys itself (`D`/`G` on the highlight → pop + hand off). Live
check confirmed DROP (modal: `depth 0→1`, Esc routes through the UIStack listener to pop)
and MOVE (no modal: arms + runs with the stack empty) both route correctly in the I-10i
state — the refactor won't disturb existing verbs.

**Deferred (faithful):** put-item-into-a-carried-container (the Mode 2 container branch +
same-owner gate), the `STREN×20` carry-weight gate (as for GET/DROP), unequip-on-give, the
`0` party-roster window, breadcrumb titles, portraits.

### Pre-impl reads (completed — research-before-impl convention)

These were the pre-impl reads done before their sub-steps; all landed.

- **`C_27A1_2A44`** (door USE) — open/close/unlock logic + frame mapping for
  `OBJ_129-12C`. Read before I-10c.
- **`C_27A1_433D` (crank) + `C_27A1_3F47` + the "drawbridge related"
  helper (seg_27a1.c:1898)** — the crank→`OBJ_10D` toggle geometry +
  how the bridge's open/closed frame maps to passability. Read before
  I-10e (the crank).
- **`world_loader.js` mutation helpers** — confirmed which of
  `GiveObj`/`TakeObj`/`InsertObj`/`MoveObj` already exist (`inventoryOf`
  does) before GET/DROP (I-10g/h), per the no-reinvention rule.

### Deferred (not in I-10)

- **Target-first front-end** — click a cell (no pending verb) → context
  menu of applicable verbs (`appliesTo(target)` predicates) → dispatch.
  Architecturally free at the core (same `dispatch`), but its real cost
  is the menu widget + predicates. Ships as a thin later front-end (its
  own small step), so I-10 isn't gated on it and verb-first
  validates the core first. When it lands, TALK + every verb get the
  second route for free.
- **Vehicle gate** (get/drop/move/cast blocked on a boat) — no
  boats yet. **Theft/karma** coupling on GET/MOVE — no karma system.
  **NPC portraits** on LOOK. **Full persistent inventory/status panel**
  (`seg_0A33.c:933-936`) — the I-10j inventory *window* is a per-member modal
  opened on demand; the always-on parchment status panel is still deferred.
  **Cast** (`C_1944_4C2F`) — when magic matters.
  (Portcullis lever `OBJ_10C`→`C_27A1_4479` + switch `OBJ_0AE`→`C_27A1_4672`
  **landed in I-10d** — `markerToggle` add/deletes the gate at quality-matched
  `OBJ_12D` markers — so they are no longer deferred.)

### Reuse-from-existing (no reinvention)

- `inspectAtCell` (main.js) → generalize to `pickAtCell`.
- `openInspector` + `UIStack` (view/inspector.js, view/ui_stack.js) →
  the `I` Inspect hotkey's detail modal (distinct from LOOK — #2).
- `getTileLook` / inspector `nameFor` → the LOOK line's object name.
- `inventoryOf` (world_loader.js:161) → GET/DROP list shape.
- `canStandAt` (I-4 passability.js) → placement legality.
- I-8 facing (humanoid_anim / `MACRO_A`) → face-the-target.
- `TurnClock` suspend + `uiStack.isEmpty()` gating → centralized in the
  dispatcher instead of repeated per handler.
- `#probe-cell` (view/dev_probe.js) → the targeting cursor tag (#3).

---

## Render-to-fit viewport — UI refinement (2026-06-05)

A pre-I-11 layout pass. The game shell was a rigid pixel frame (1024×640 map + 280 panel
+ 8 gap ≈ 1312px wide, ~800px tall), so on a normal laptop it overflowed **both** axes and
the user had to pan the page to reach the panels. Now the shell **fills the viewport** and
the map is **render-to-fit**: the canvas drawing buffer tracks its on-screen cell, so a
bigger window shows more of Britain and a smaller one fewer tiles — always 1:1 crisp, never
panning.

**Decision trail (with Zane 2026-06-05):**
- **Render-to-fit (variable tiles), not scale-to-fit (letterboxed shrink).** The map
  shows more/fewer tiles by window size at native resolution — the legacy `ultima6/
  map_viewer.js` made the same choice (`mapW = ceil(canvas.width / tileSize)`).
- **Design 1: buffer = CSS size, `dpr` pinned to 1.** The drawing buffer equals the CSS
  layout size (no devicePixelRatio scaling), so every existing render/camera/mouse
  calculation stays valid with zero unit-juggling. This matches legacy `map_viewer.js`,
  which staged the `devicePixelRatio` recipe then deliberately hardcoded `dpr = 1` — for a
  variable-viewport tile renderer, honoring dpr would double the tile count and thread a
  dpr-scaled tile size through all the pixel math. **A HiDPI dpr pass is the named
  follow-up** (only worth it if tiles look soft on a fractional-scaling display; integer
  2× Retina is already clean via `image-rendering: pixelated`).

**Why it was small:** the render pipeline was **already viewport-size-driven** —
`render_system.js` and `world_render_system.js` recompute their visible `cols`/`rows` from
`canvas.width/height` every frame, camera centering already divides by `canvas.width/height`,
and `renderer.resize()` already set `gl.viewport` + `u_resolution`. Nothing ever changed the
canvas's fixed 1024×640 buffer — that was the whole "fixed" feel.

**What landed (4 files):**
- **`resources/viewport.js`** (new) — `Viewport` ECS resource: live `cols`/`rows` + a
  `nearRadius` getter (`ceil(max(cols,rows)/2) + 8`, = 40 at the old 64×40 view).
- **`main.js`** — registers `Viewport`; `fitCanvas()` sets `canvas.width/height` to the
  cell's CSS size + calls `renderer.resize()` + updates `viewport.cols/rows`; a
  `ResizeObserver` on `#map-region` re-fits and recenters on the avatar as the window
  changes. Initial `fitCanvas()` runs before the first region load so streaming covers the
  real viewport.
- **`index.html`** — the shell is now a fluid full-viewport grid (`minmax(0,1fr)` map
  column/row, 280px panel, message band); body is a flex column with `overflow:hidden` so
  the page never pans; `#screen` fills its cell (`width/height:100%`, `box-sizing:border-box`).
- **`systems/npc_path.js`** — the I-9h teleport guard reads `Viewport.nearRadius` (the
  visible extent now VARIES, so a fixed 40 would pop on-screen NPCs on a big window). The
  `TELEPORT_NEAR_RADIUS = 40` constant survives only as the unit-test fallback (the tests
  never register a `Viewport`).

**The one game-logic coupling — the teleport radius AND its center.** The I-9h gate
suppresses the off-area teleport when an NPC (or its slot) is within Chebyshev-`nearRadius`
of the **view center**, so visible NPCs always walk. Two things had to follow the viewport:
- **The radius** must exceed the on-screen half-extent, and with a variable viewport must
  track the live size. `Viewport.nearRadius` reproduces the old 40 at 64×40 and scales
  (smaller on a small window, larger on a big one).
- **The center** is the **camera's center tile, not the avatar's.** They coincide while the
  camera follows the avatar, but the clone's **drag-to-pan** (a modern-UX feature source
  lacks — source always centers the view on the controlled member, so it could safely gate
  on the avatar) can move the view off the avatar; centering on the camera keeps the gate
  matching what's actually on screen, so a visible NPC in a panned-to region can't pop.
  `npc_tick_system.js` computes the camera center (`floor(cam.worldX/16) + cols/2`, wrapped
  on the toroidal axis) and passes it to `tryTeleportToSlot`; the unit tests register no
  camera, so they fall back to the avatar position (preserving their setup + the radius-40
  default).

The per-NPC 40×40 *pathfinding* window in `pathfinding.js` is an AI work-area, not a
visibility bound, so it was intentionally left fixed — NPCs outside the plan window
edge-seek + re-plan and still walk visibly.

**Verified live (preview-eval on real U6 data, 2026-06-05):** full game boots with no
console errors through boot + multiple resizes; `canvas.width/height` == CSS size at every
size (`bufferMatchesCss`); resizing 980px→1440px grew the buffer 666×657 (42×42 tiles) →
1126×589 (71×37); `nearRadius` tracked it (29 → ~42); `document.documentElement.scrollWidth/
Height` never exceeded the window (no page panning) at 742 / 980 / 1400 / 1440 widths. The
gate's **view center** tracked the camera: (307,352) = the avatar's start cell while
following, and moved to (347,352) after drag-panning 40 tiles east (the avatar stays at
307). **121/121 unit tests pass** (the avatar fallback keeps the camera-less test setup
green).

**Pixel-snap — inter-tile bleed fix (2026-06-13).** The "always 1:1 crisp" above was only
true when the canvas dimensions were **even**. Render-to-fit sizes the buffer to the CSS
cell, which is often **odd** (e.g. 683×285), and `centerOn` does `tx*16 + 8 - canvas.width/2`
— so on an odd canvas the camera lands on a **half-pixel** and the shader's sub-tile scroll
(`u_scroll = worldX mod 16`) is **fractional** (e.g. 2.5). The tile shader samples the R8
atlas with **NEAREST** over **edge-to-edge** tile UVs (`view/renderer.js`), so a fractional
offset makes a tile's **right/bottom edge** pixel sample *across* the atlas-tile boundary
into the **neighbouring** atlas tile → faint 1px vertical/horizontal **lines between tiles**
(Zane spotted them 2026-06-13). **The difference from the legacy `../ultima6` port:** its
`map_viewer_renderer.js` has **no `u_scroll`** — tiles sit at integer positions only, so it
never bleeds (the clone added `u_scroll` for sub-tile pan smoothness). **Fix:** `CameraSystem`
(which already wraps the camera each frame, *before* the render systems) now also **rounds the
camera to whole pixels** (`systems/camera_system.js`). NEAREST quantises to whole pixels
regardless, so the snap costs **no** scroll smoothness, and it makes the clone pixel-perfect
like the legacy port. **INVARIANT (don't break):** the atlas is NEAREST-sampled with
edge-to-edge UVs, so **the camera must stay pixel-aligned** — do NOT reintroduce a fractional
/ sub-pixel camera (e.g. for "smoother" panning) without ALSO insetting the tile UVs by a half
texel, or the edge bleed returns. (The dpr-1.5 *softness* is a separate, shared-with-legacy
matter — see the HiDPI deferral.)

**Deferred:** the HiDPI `dpr` pass (above); a dedicated mobile/stacked reflow (the
two-column fluid grid handles narrow desktop widths on its own — map column shrinks, panel
holds, no panning; a first attempt at a `max-width:900px` stacked media query starved the
map and was dropped); the modern skin pass (still deferred from I-10a).

---

## Talk arc (I-11 → I-13)

The three steps that complete the **β path** ("walk + talk works
end-to-end"). They split the single act of talking to an NPC into a dispatch
trigger, a UI surface, and the bytecode VM that drives it:

- **I-11 — talk trigger.** TALK as a verb on the I-10 dispatch core: pick an
  NPC within reach 7, run the can-talk gate, emit the result. No conversation
  content yet — the slice ends exactly where `TalkDriver` would load the
  script.
- **I-12 — dialog window.** The second UI surface on the I-7 substrate; opens
  when the talk trigger fires.
- **I-13 — conversation VM.** Adapts the legacy `script.js` bytecode
  interpreter; β reached — give/take opcodes work on the I-6 inventory data.

**Source split:** TALK is a one-line case in the shared targeting block
(`seg_0A33.c:1264`) → `TALK_talkTo` (`seg_16E1.c:60`) → `TalkDriver`
(`seg_1703.c:1016`) → the conversation VM (`seg_1703`/`seg_16E1`). I-11 ports
the front-end through the can-talk gate; I-13 ports the VM. Research:
[research_object_interaction.md](research_object_interaction.md) §"Talk"
(front-end + reach + gate) + [research_conversation_vm.md](research_conversation_vm.md)
(the VM).

## I-11 scope — talk trigger

**Goal:** wire **TALK** as one more verb on the I-10 dispatch core so the
player can `T` → point at an NPC (within reach 7) → get a source-faithful
result: the talkable-filter + can-talk-gate outcome (a name echo / a placeholder
where the dialog window will open, or one of the canned refusals). The slice
ports `TALK_talkTo` (`seg_16E1.c:60`) + `TalkDriver`'s precondition block
(`seg_1703.c:1022-1079`) and **stops before `LoadConversation`** — the actual
conversation is I-12 (window) + I-13 (VM). Self-evident payoff: press `T` near
an NPC and the right line appears in the message channel; press it on a wall,
on yourself, or out of range and the matching refusal appears.

**Source findings (decoded 2026-06-05, full detail in
[research_object_interaction.md](research_object_interaction.md) §"Talk"):**

- **Command path.** `T` (`seg_0A33.c:1061`) → `CMD_83`, `SelectMode = 1`,
  `SelectRange = 7` → the shared targeting block dispatches
  `TALK_talkTo(Active, Selection.obj, 1)` (`seg_0A33.c:1264`). TALK is the
  only verb whose handler isn't in `seg_27a1.c`.
- **Reach = 7, not adjacency-1.** `SelectRange = 7` (the DROP/ATTACK reach);
  `TALK_talkTo`/`TalkDriver` add no `CLOSE_ENOUGH` check, so 7 is the effective
  reach. Corrects the earlier "two-stage seam / adjacency-pick" framing — TALK
  is **single-stage** (one pick → fire) and reach-7; it reuses DROP's
  `VERB_REACH = 7` gate, nothing more.
- **Talkable filter** (`seg_16E1.c:60-88`): NPC slot (`0 ≤ obj < 0x100`) or
  shrine `OBJ_189` / statue `OBJ_18D-18F`, else `"nothing!"`; mounts
  (`OBJ_1AE/1AF`) head-resolve first; the `aFlag=1` path prints the target-name
  echo (met → `C_1703_0116`, first-time → `GetObjectString`).
- **Can-talk gate** (`TalkDriver` early-exit, `seg_1703.c:1022-1079`): the
  8-row precondition table (Not-on-screen / Not-in-solo-mode / seance-moan /
  No-response[dead/asleep/paralyzed/vigilante/fear/retreat/arrest/evil/chaotic]
  / Armageddon / Talking-to-yourself / Funny-no-response) — tabulated in the
  research doc. I-11 ports the arms with a live clone signal (asleep, evil/
  chaotic, talking-to-yourself); the rest defer with their subsystem.
- **`NPCStatus` is parsed-then-dropped — alignment carried for the gate.** The
  gate reads `IsAsleep`/`GetAlignment`/`IsDead`, all in the per-NPC `NPCStatus`
  byte (`u6.h:113-155`) — a *different* array from the `Status` (ObjStatus) the
  clone loads. The clone decodes the byte (`objlist.js:42`) but `world_loader.js`
  drops it. Two bits have live clone signals: **asleep** is exactly
  `AIMode.AI_SLEEP` (source sets `SetAsleep` + `NPCMode=AI_SLEEP` in lock-step at
  `__AtDestination`, `seg_1E0F.c:1014-1033`), and **alignment** (`& 0x60`) is
  carried into a new `Alignment` component at load — the TALK gate is its
  first/only in-scope reader, so it's carried now, not dropped. Full
  decomposition (all 7 bits → owning subsystem + consumers + the save-roundtrip
  caveat) in [research_save_load.md](research_save_load.md) §"`NPCStatus`
  decomposition". `dead`/`paralyzed`/`poisoned` stay deferred (no
  death/combat/magic model to set them).

**Reuse-from-existing (no reinvention):**

- `pickAtCell` (command_dispatch / main.js) → the 3-tier cell-pick (NPCs are
  tier 1) — same resolver LOOK/GET/USE use.
- DROP's `VERB_REACH = 7` reach gate → TALK's reach (DROP is the existing
  reach-7 precedent; "Out of range!" beyond 7).
- `displayName` (view/inspector.js — the same name resolver GET/DROP/MOVE
  use) → the target-name echo.
- The message channel (I-10a) → all TALK output (echo + refusals).
- `Actor` component → the talkable test; active-member ref (`avatarRef`) →
  the "Talking to yourself?" self-check.
- `AIMode.mode` (`components.js`, the worktype an NPC settles into at
  `atDestination`) → the asleep gate arm (`=== AI_SLEEP`).
- **new `Alignment` component** (loaded `NPCStatus & 0x60` in `loadActors`)
  → the evil/chaotic gate arm. Load-only until its mutators land.

**Deferred:**

- **To I-13** (needs the script data / VM): `LoadConversation` of
  `converse.a/.b`, the `"Funny, no response."` no-script refusal, the portrait
  + `"You see "` description (both read from the script), and the whole
  ask/answer loop. I-11 emits a placeholder where I-12's window will open.
- **Facing the target** (`MkDirection` → `C_1E0F_0664`) — deferred, as in the
  other I-10 handlers (the dispatch defers facing globally for now).
- **Gate arms with no live clone signal** (one-line each, later): dead,
  paralyzed, poisoned, the combat-mode arms (`AI_VIGILANTE/FEAR/RETREAT/ARREST`
  — no setter yet), seance/`IsArmageddon`, solo-mode (`D_2CC3`), and
  party-member-off-screen — tracked per-bit in the `NPCStatus` decomposition
  ([research_save_load.md](research_save_load.md)) so they aren't forgotten
  (same incremental pattern as GET's theft/karma and USE's case table).

**Sub-steps** (locked 2026-06-05; each ≈ one save-point, browser-verified;
squashed into one `impl I-11`):

- **I-11a — `Alignment` component, carried from `NPCStatus`.** New
  `Alignment { value: Uint8Array }` in `components.js`; `loadActors`
  (`world_loader.js`) sets `value = a.npcStatus & 0x60` per NPC. Load-only
  (no mutators yet) — the first concrete repair of the parsed-then-dropped
  `NPCStatus` byte. *Verify:* preview-eval an NPC's `Alignment` matches its
  objlist `npcStatus & 0x60`.
- **I-11b — the `talk` verb front-end.** `t:'talk'` → `VERB_KEYS`, `talk:7`
  → `VERB_REACH`; register `talk`: `pickAtCell` (3-tier) → talkable filter
  (`Actor` ∨ shrine `OBJ_189` / statue `OBJ_18D-18F`, else "nothing!") →
  self → "Talking to yourself?" → `canTalk(pick)` → on pass
  `openConversation(pick)`. *Verify:* `T` on an NPC → name echo; wall/empty
  → "nothing!"; self → self-line; >7 away → "Out of range!".
- **I-11c — the `canTalk` gate + `openConversation` seam.** `canTalk(npc)` →
  asleep (`AIMode.AI_SLEEP` → "asleep" line) + evil/chaotic (`Alignment &
  0x60` → "No response"); the deferred arms as commented one-line slots
  citing the `NPCStatus` decomposition. `openConversation(target)` → the
  meaningful placeholder per type (NPC name "has nothing to say yet" /
  shrine / statue) — the I-12/I-13 seam, the only thing I-12 + I-13 reopen.
  *Verify:* a sleeping NPC at night → "asleep"; an evil-aligned NPC → "No
  response"; a normal NPC → placeholder; a shrine → shrine line.

**Kept deviations (record so a later session doesn't "correct" them):**

- **Reach-7 is a post-confirm refusal, not a cursor cap.** Source hard-caps
  the targeting cursor at 7 (`seg_0C9C.c:1237` — you can't point past it);
  the clone's free mouse cursor confirms then refuses ("Out of range!").
  Same reach, friendlier UX.
- **asleep = `AIMode.AI_SLEEP`**, not `NPCStatus & ASLEEP` (the clone drops
  that byte; the worktype is the lock-step proxy — see findings).
- **`Alignment` is load-only** until its mutators (party join/leave in I-13,
  charm/combat later) land — faithful while nothing yet changes alignment.
- **Name echo = `displayName`** (tile-look) until I-13 loads `converse.*`'s
  name section (source's `C_1703_0116`).

**Landed (2026-06-05, a→b→c as separate commits — verified live on real Britain data):**
**a** = `Alignment` carried (188 NPCs, `Alignment === npcStatus & 0x60`, 0 mismatches; 184
NEUTRAL / 4 GOOD in the loaded set, no evil/chaotic). **b** = `T` arms (reach 7) →
Dupre/jester "<name> has nothing to say yet."; self → "Talking to yourself?"; empty →
"There is no one to talk to."; cheb 8 → "Out of range!". **c** = the gate, exercised by
forcing the state (no NPC is naturally asleep/evil in the loaded overworld now):
`AIMode.AI_SLEEP` → "<name> is fast asleep."; `Alignment` EVIL/CHAOTIC → "No response.";
neutral + awake → the placeholder. No console errors. The talk handler is **final** —
**I-12 (dialog window) swaps `openConversation`'s body next**; I-13 wires it to the VM.

**Boot-time gotcha (recorded):** a new component must be added to `main.js`'s
`registerComponent(...)` chain, or `world.add` throws "component not registered" and boot
halts silently mid-`loadActors` (the page log stops at "Decoding…", no console error). Cost
me a debug loop on I-11a; check the registration chain when adding any component.

**Pre-impl research:** done — [research_object_interaction.md](research_object_interaction.md)
§"Talk" + [research_save_load.md](research_save_load.md) §"`NPCStatus`
decomposition" + the standing
[research_conversation_vm.md](research_conversation_vm.md).

## I-12 scope — dialog window

**Goal:** swap `openConversation`'s I-11 message-echo placeholder for the
**dialog window** — the SECOND consumer of the I-7 UI substrate (after the object
inspector), proving the modal stack generalises from a list-cursor surface to a
text-I/O surface. **I-12 = the window's UI LAYOUT + open/close wiring + a real
portrait, driven by STUB content** — NO script loading, NO conversation VM (I-13).
Source shape: `TalkDriver` (`seg_1703.c:1016`) shows the target's portrait + name
then runs the ask/answer loop; the clone splits portrait/name/frame (I-12) from the
VM (I-13). The single seam is `openConversation(target)` (`systems/command_dispatch.js`)
— I-12 swapped its body to `openDialog`; I-13 swaps the window's placeholder body for
real lines. The talk handler + the window chrome never change again.

**Decisions (settled with Zane 2026-06-05, before impl):**

- **Modal on the I-7 stack** (option A), NOT a status-panel repurpose (option B —
  what source does: `C_27A1_02D9` draws the portrait into the in-game status panel,
  `seg_27a1.c:168`). Turn-driver suspended + avatar movement gated for the window's
  lifetime — both free via `UIStack` (`view/ui_stack.js` + main.js `isBlocked`).
  Conversation text lives INSIDE the window, not the world `#messages` channel.
- **Four regions, top→bottom:** portrait box + name / scrolling text / keyword chips
  / "you say:" input.
- **Chips + input are INERT at I-12 — no fakes** (Zane): the layout commits the
  surface, but clickable chips (= say the word), a live input, and the NPC's words
  are all I-13. **ESC-close is the only working interaction.** (Decision earlier in
  the discussion was "chip click = immediately say the keyword" — that BEHAVIOUR is
  I-13; I-12 only renders the chips.)
- **Portrait is REAL at I-12** (Zane wants it now). Fixed centred modal at a
  **readable width** (460px) — it's text, not the map; a fixed column reads better
  than scaling with the viewport (matches the inspector/inventory fixed-size modals).
- **Opens for ALL talkable targets** the I-11 filter accepts (NPC / shrine `OBJ_189`
  / statue `OBJ_18D-18F`) — automatic through the one seam.

**Pre-step — portrait asset enablement + research.** Added
`portrait.{a,b,z}` to `main.js`'s `OPTIONAL` set (stored raw + loaded, non-gating —
the project's FIRST lazy-decoded asset; they must not block Britain from rendering)
and wrote [research_portraits.md](research_portraits.md) (the full format + source
decode of `C_2FC1_1C19`). **Decode chain verified live on Zane's real data BEFORE
coding the window** (de-risking I-12c): `portrait.a`=98 / `portrait.b`=96 entries,
all sampled blocks → 3584 = 56×64 px, 8 portraits rendered correctly through `u6pal`
(`a[4]`=Lord British; `a[0]`=a horse/mount, resolving the off-by-one — named NPCs
start at `a[1]`).

**Sub-steps (each one save-point during the build, browser-verified; Zane reviewed +
approved, then squashed into one `impl I-12` commit per the I-7/I-8 default):**

- **I-12a — modal frame + seam swap.** New `view/dialog_window.js`
  (`openDialog`); `openConversation`'s body → `openDialog`. Bare modal: name title +
  placeholder body + ESC-close. *Verified:* clean boot, opens (UIStack depth 0→1),
  titles real NPCs, ESC closes (→0) via the real substrate key path.
- **I-12b — four-region layout.** `openDialog` builds portrait box +
  name / scrolling text / inert chips (`name`/`job`/`bye`, muted) / disabled
  "You say:" input; fixed centred 460px (CSS in `index.html`). *Verified:* all four
  regions render for Dupre; input disabled; ESC closes.
- **I-12c — real lazy-decoded portrait.** New `assets/portrait.js`
  (`Portraits`): decode-on-first-show via the verified chain (`lib_32` offset table
  → `decompressCompressedFile` → `u6pal` RGBA), `ImageData` cached per `npcId`.
  Built in `main.js` from the `OPTIONAL` bytes + `reg.palette`, threaded through
  `installCommandDispatch` → `openConversation` → `openDialog`, which blits the face
  into the box. *Verified via the REAL wired path* (live `talk` handler at Dupre's
  cell): Dupre/Shamino/Iolo show correct distinct faces (Dupre = `a[1]`, 3470/3584
  non-blank px), ESC closes.

**Key implementation facts (so a later session doesn't re-derive them):**

- **Portrait key = the Actor `npcId` (the slot), NOT `ObjType.objNumber` (the type).**
  `C_2FC1_1C19` takes the NPC number; `npcId 1` = the Avatar → `portrait.z[D_2CCB-1]`
  (deferred — `D_2CCB` is the char-creation choice from the save, and the talk target
  is never self). `npcId ≥ 2` → `a[npcId-1]` (`< 0x62`) or `b[…-0x62]`. Confirmed
  live: Avatar=1→blank, Dupre/Shamino/Iolo=2/3/4→faces.
- **No dedicated portrait palette** — portraits index the in-game `u6pal`
  (research_portraits.md). The decoder forces opaque alpha (portraits are full
  images; `u6pal`'s colourkey alpha is a tile concern).
- **The portrait box is a native 56×64 `<canvas>`** scaled 2× by CSS
  (`image-rendering: pixelated`), so `putImageData` writes at native res.

**Deferred (→ I-13 unless noted):** clickable chips (= say the keyword) + the
script's own `OP_KEY` keywords; the live input + Enter; the NPC's words (script load
+ VM); the pause / "▼ more" continue affordance (no text to page at I-12). **Blank
portrait box (no live signal yet):** shrines/statues (source uses `GetQual`, no
quality carried) and the Avatar's own face (`portrait.z` / `D_2CCB`).

## I-13 scope — conversation VM (standalone effect interpreter)

Adapts the legacy `../ultima6/script.js` VM into a **standalone generator that yields
typed effects**, per [research_i13_conversation_vm.md](research_i13_conversation_vm.md)
(the design + full effect taxonomy) over the [research_conversation_vm.md](research_conversation_vm.md)
source decode. Built as save-point commits (pre-step + a–g + review polish + a
post-review indexed-table fix), **squashed into one `impl I-13` commit** after Zane's
review. Verified live against Zane's real `converse.a/.b`.

**Architecture (the locked decision).** Three parties: a pure **`ConversationVM`**
(`systems/conversation/conversation_vm.js`) with zero world/I-O imports; a **host**
(`systems/conversation/conversation_system.js`) that seeds vars + drives the generator
+ applies effects; the **dialog window** (`view/dialog_window.js`) as the I/O surface.
Wire protocol: `run()` is a `function*` that `yield`s `{type,…}`; the driver resumes
with `.next(value)` — a value for reads (query/input/read-write), nothing for
output/sink. `evaluate()` is also a generator (`yield*`) so a mid-expression query
suspends with the operand stack intact — which is what deletes the legacy port's
hand-rolled `current--`/`checkInputNumber` resume hack.

**Sub-steps (each a save-point commit):**
- **pre-step** (`fc42f9b`) — `converse.a/.b` + `portrait.a/.b` moved to REQUIRED in
  `main.js` (Zane's call: the conversation experience needs them; supersedes I-12's
  portraits-optional). Still lazy-decoded.
- **a–c** (`9947d0d`) — `conversation_vm.js` + `opcodes.js`: statement loop,
  RPN `evaluate`, keyword dispatch (**source-faithful** per-word-prefix + `?` wildcard
  + `*` catch-all — fixes the legacy `includes()`), IF/GOTO, `$`/`#` expansion
  (VM-owned) + host-seeded vars, inline-`*` pause. `tests/test_conversation_vm.*`
  (23/23, no data needed).
- **d** (`5d4d5c0`) — `assets/converse.js` loader (lib_32 `.a` 0..0x62 / `.b`
  0x63..0xDF, LZW-or-raw, lazy); host seeds + drives; `dialog_window.js` rebuilt into
  a live I/O controller (streaming text, input field, clickable chips, pause cue,
  Esc-ends); wired `main.js` → `command_dispatch.openConversation`.
- **e** (`807da31`) — query effects (world reads): `flag`(TST→`objlist.talkFlags`
  bit), `wounded`, `poisoned`(`status&0x08`), `inParty`, `onScreen`(camera/viewport),
  `isHorse`, `objType`, `canCarry`, `owns`/`hasObj`/`whosGot`(via `inventoryOf`),
  `partyMember`.
- **f** (`c42a7ba`) — sink + read-write: `set/clrFlag`, `add/subKarma`, `heal`,
  `cure`, `setMode`, attribute trainers, `give`/`take`, `spawnHorse`, `rest`(heal).
- **g** (`2562169`) — `OP_PREFIX` body marker; `@`keywords render gold + click-to-say;
  CSS; coverage scan.
- **review polish** (`c7ac53c`/`d9f9109`/`9d5fb8b`/`994d053`, Zane's review) — a `{pause}`
  continue-cue (blinking "▾ click/press a key") + per-mode input hints (placeholder / key
  prompts); the player's own input is **echoed** into the transcript as a blue `.dialog-you`
  line (vs the NPC's sepia); only `.dialog-text` scrolls (the modal no longer double-scrolls
  on a long convo); `window.__U6.inspectConversation()` dev hook snapshots the live VM
  (npc/pc vars, lastInput, the current question, the upcoming KEY answer-keywords).
- **post-review** — folded in here by the squash: the **indexed string/value-table read**
  (`1af4593`, `C_1703_1494` → random/state-driven NPC lines, closes the last 3
  stray-`unknownOp` scripts; see "Indexed string/value tables — DONE" below), the
  **branch-skipping** mechanism + nested-IF limitation (`c5de6e6`; see "Known limitation"
  below), the **open-questions resolution** (`b6d2912`), and `research_npc_scripts.md` — an
  on-demand per-NPC decoded-script catalog (`529fe9e`, first entry: Lord British).

**Effect-stream verification (the standalone-design payoff).** Headless coverage over
**all 200 NPC scripts**: **200/200 clean + terminating, 0 crashes, 0 empty** (the
indexed-table fix closed the last 3 stray-`unknownOp` scripts; NPC 183's non-termination
was a coverage-harness artifact — see "Indexed string/value tables — DONE").
Live (real wired path, talk at Dupre/Shamino/Iolo/Lord British cells): portrait + name
+ "You see …" + pause + greeting + keyword Q&A (name→"It's Dupre…", job→…) + `bye`
closes the window and resumes the turn driver.

**Key kept decisions (so a later session doesn't "correct" them):**
- **Gates stay in `command_dispatch.canTalk`** (I-11c) as host pre-flight — the VM is
  reached only when talk is allowed. Not duplicated in the host.
- **`$`/`#` expansion is VM-owned** (the vars are VM state, seeded once via the
  relocated `TALK_initTalk` then mutated mid-script). The `say` effect carries final
  text; the host never sees `$N`. Text markup (`@`/`<>`/`/\`/`&&`) is passed through.
- **`@`words are the askable keywords** — rendered gold + click-to-say, the live
  evolution of the I-12 inert chips. Default chips stay `name`/`job`/`bye` (the
  universal keywords); per-script keyword extraction is intentionally NOT done (U6
  doesn't reveal an NPC's full keyword list).

**Deferrals (stub-when-deferred — VM emits the complete effect; the host handler is a
stub, fleshed out with zero VM edits when the subsystem lands):**
- **Party `join`/`leave`** — needs ECS party + follower integration; returns
  source-faithful codes but does NOT mutate membership yet (the highest-value
  follow-up; companion-recruit NPCs are affected).
- **`selectObject` / `showInventory` (trade UI)**, **`resurrect`** (corpse handling),
  **`moveObj`/`transferObj`** (obj-ref resolution), **`rest` time-skip** (heals party,
  no clock jump), **`owner`/`weight`** queries (GetAssoc / no `TypeWeight` table).
**Indexed string/value tables — DONE (2026-06-08).** The 3 stray-`unknownOp` scripts (NPCs
35/123/135) were the **unported `C_1703_1494` indexed-table read** — an NPC selecting one of
N packed strings by a computed index (e.g. Artegal's `RND(0,2)` random groan, the dog Kador's
`RND(0,3)` bark, Ephemerides' `LET $0 = instruments[idx]`). The old `_followAddress` read the
table offset but never parsed the index factor, so it always printed entry #0 and **leaked the
factor bytes to statement level** (the `0xd3 BYTE` → `unknownOp`). Faithful port: after the u32
offset, if the next byte isn't `OP_CALL`, `evaluate()` the index factor then walk the table —
string mode skips `si` NUL-terminated strings, value mode offsets `si<<1`. NPC 183's
non-termination was a **coverage-harness artifact** (its `bye`→LEAVE sits behind `IF TST(self,
bit)`; with the host's `setFlag`→`TST` feedback modeled, it exits — no code change needed).
Re-verified live against real `converse.a/.b`: **200/200 scripts clean + terminating**, and the
index is honored (`rng→lo` prints groan #0, `rng→hi` prints #2). Regression test added
(`tests/test_conversation_vm.js` — indexed-table PRINTSTR + no-leak assertion). Mechanism +
worked examples: `research_conversation_vm.md §"Indexed string / value tables"` + §"Code and
data share one address space".

**Known limitation — general nested IF/ELSE in a skipped branch.** The branch-skip
(`_skipIfBlock`, and the keyword non-match skip) is a **flat linear scan** with no depth
counter, so a *general* nested `IF/ELSE` in a *skipped* branch would make it stop at the inner
`ELSE`/`ENDIF` and misalign. **Faithful to source** (`seg_1703.c:784-791` has the identical
flat loop). **Empirically resolved for the shipped data:** a scan of all 200 scripts found
**199 completely flat (IF-depth ≤ 1) and exactly one (NPC 164) nested one level** — and NPC
164 is laid out to survive the flat skip (inner `IF` has no `ELSE`; inner `ENDIF` adjacent to
the outer `ENDIF`; the flat landing is one no-op `ENDIF` byte short of a correct skip, absorbed
harmlessly). So **all 200 shipped scripts skip correctly** — the limitation only bites a
*hypothetical* non-adjacent / `ELSE`-bearing nested block. A depth-counting skip (as the legacy
`ultima6/script.js` `skipCodeBlock` already uses) would lift it. Mechanism + evidence:
`research_conversation_vm.md §"Branch skipping"`.

**Pre-impl research:** [research_i13_conversation_vm.md](research_i13_conversation_vm.md)
(design + taxonomy + sub-step plan) + [research_conversation_vm.md](research_conversation_vm.md)
(source decode) + [U6_對話系統.md](U6_對話系統.md) (Chinese explainer, corrected vs source).

**Pre-impl research:** [research_portraits.md](research_portraits.md) (portrait
format + decode) + the standing [research_conversation_vm.md](research_conversation_vm.md)
(the I-13 VM the window will feed) + the substrate read recorded in this section.

## I-14 scope — NPC movement speed (DEXTE-paced accumulator)

**Planned (not started).** Pulled ahead of the old status-panel/handlers steps (now I-18/I-19)
to start the **NPC-movement arc** (I-14 speed model → I-15 drunk-walk → I-16 arrival/direction →
I-17 AI): the AI behaviors all ride on the movement model, so it goes first.

**Goal:** replace I-9's **flat step-rate** with a **DEXTE-paced per-actor accumulator** — a *modern
rewrite* of U6's `MovePts`/`DEXTE` economy, **NOT** a port of the `C_1E0F_4E0A` round driver — so NPC
movement regains **terrain-speed**, **dexterity-speed**, and the **staggering** that keeps traffic
un-gridlocked, fixing the "watch an NPC thrash" symptom and laying the substrate for I-15/I-16.
**Full design + rationale (READ FIRST):** §"Post-I-9 — deviation audit" → "SETTLED MODEL — DEXTE-paced
per-actor accumulator". **Source inputs (reinterpreted, not transcribed):** `SubTerrainMov`
(`seg_1E0F.c:1402` = `5 + Σ(TerrainType>>4)`), `SubMov` (`:441`), `DEXTE` (`seg_0C9C.c:303`, objlist);
the `C_1E0F_4E0A` round driver is studied for the mechanic but deliberately **not** ported. **Data:**
`assets/objlist.js` already decodes `a.dexterity` (0x0a00) — carry that only; `a.movePts` (0x14f1) is
unused under the accumulator.

**Sub-steps (one save-point each):**
- **a** — `MoveSpeed` component (`dexterity` from objlist + a `moveCredit` accumulator), added in
  `world_loader.js`; `rate(DEXTE)` maps DEX into the calibrated band (reference DEX ≈ 15 → ≈ 2.5
  tiles/s on open ground, floor ~6). Source scale is the *input*; ms-per-tile mapping is ours.
- **b** — per-actor accumulator tick: each heartbeat `moveCredit += rate × WORLD_SPEED × dt`; step
  **one tile** when `moveCredit ≥ stepCost` (**snap, no interpolation**); cap idle credit at one step.
  **Replaces** the flat-step `npc_tick_system`. Staggering emerges from per-actor credit phases (no
  round-robin, no auto-pass).
- **c** — `stepCost = SubTerrainMov` (terrain weight; `SubMov` modifiers horse ½ / spells, min 1) as
  the per-step threshold for NPCs. **Player:** **fixed-brisk** base (NOT DEX-scaled), **instant-first-
  step + terrain cooldown** — standing leaves the player "ready" so a keypress steps instantly; a
  post-step cooldown rate-limits *sustained* walking only → zero input lag, swamp visibly slows.
- **d** — **`WORLD_SPEED` master slider** in the world-clock UI (at I-18 the clock moved to the
  persistent strip; the slider still rides the floating dev HUD): scales **all actor rates + the
  decoupled clock together**; log-scaled; **slow end = frozen**.
  The clock advances on its **own** cadence (**decoupled** — not per round/refill); the 100 ms
  heartbeat stays fixed (the slider changes the *rate*, not the frame interval).
- **e** — verify: staggering removes the flat-step thrash; player input never lags + swamp visibly
  slows; the `84/85/86` escalation (`npc_path.js:98-100`) still de-gridlocks; live preview + unit tests.
- **fold-in** — **door-phasing predicate fix** (`isHumanoid` → `MONSTER_4000` monster-class /
  `GetMonsterClass`) so non-humanoids stop phasing closed doors — small, pathfinding-adjacent,
  co-located here (§"Known issue — door-phasing predicate").

**I-9f teleport-to-previous** was a **non-faithful band-aid** for the flat-step thrash → **drop it** once
the economy lands; the resulting blocked-NPC behavior MUST follow `U6_NPC_排程與移動邏輯.md §五 "典型情境
的行為結果"` — a blocked NPC is **waited out** (`84/85/86` → re-plan, still actor-blind), with catch-up
coming only from the **hourly schedule target-switch** (§二) + the **off-screen visibility teleport**
(§六), plus **lenient adjacent-arrival** (Chebyshev ≤ 1); it is **never warped to a previous target**.
**Sub-step e verifies the dropped-I-9f behavior against §5.1** (blocked = waited-out, not warped). The
**§5.2** arrival-pose behaviors (arrived-but-can't-sit / sleep-on-spot when the prop sits at the player's
feet; stand/guard settle adjacent) are an **I-16** concern (§七) and are verified there.

## I-15 scope — drunk-walk approach (`TryMoveTo` + `__TryDiagMove`)

**DONE (2026-06-08), local — pending review + squash (alongside I-14).** The pathfinding-LESS
"head roughly toward a target, nudge around the one blocker in front of you" move primitive —
`U6_NPC_排程與移動邏輯.md §4.3`'s "only ACTIVE detour." New `systems/drunk_walk.js`. Built on
`npcStep` (= source's `TryStraightMove`); move-point spend stays at the I-14 tick level (the
primitive just attempts a move + reports success, like `npcStep`). **No live consumer yet** —
NPC AI behaviors (I-17) + combat drive it later; for now it's a tested primitive + a dev hook.

**Sub-steps (one save-point each):**
- **a** — `tryDiagMove` (`__TryDiagMove`, `seg_1E0F.c:3470`): step diagonally only if the
  diagonal target is standable AND ≥1 orthogonal neighbour is clear (corner-cut prevention —
  no squeezing between two solid corners). Diagonal-combine incl. the N+W→NW special case.
- **b** — `tryMoveTo` (`C_1E0F_35A7`): one greedy step toward a target — pick the primary
  axis (larger delta; random tie-break; distance-weighted random for far targets), then the
  fallback chain **primary-straight → diagonal → other-straight → reverse-other (~50%)** (the
  reverse fires only on source's `OSI_rand(0,1) || !TryStraightMove(..^4)` short-circuit).
  Wrap-aware on the 1024 toroidal axis; RNG injectable (`randInt`) for deterministic tests.
- **c** — dev hook `__U6.driveTo(npcId, x, y[, intervalMs])` / `__U6.stopDrive()`
  (`view/dev_npc_inspect.js`): WRITES the sim (parks the NPC at `AI_MOTIONLESS`, drunk-walks
  it on a fixed timer until adjacent) — a review tool; **deliberately bypasses the I-14
  accumulator** (the real DEXTE/WORLD_SPEED-paced consumer is the NPC-AI step, I-17).

**Kept deviations:** the move-point spend (`SubTerrainMov` inside source's TryStraightMove/
__TryDiagMove/TryMoveTo) is NOT duplicated here — the I-14 accumulator owns it at the tick
(same as `npcStep`). `__TryDiagMove`'s `D_17B2` party-pass toggle on the two clearance probes
is dropped (plain `canStandAt`) — harmless until a party member drunk-walks.

**Verification:** `tests/test_drunk_walk.html` **14/14** (8 `tryDiagMove`: clear/blocked-target/
corner-cut/one-orthogonal/SW+NW combine; 6 `tryMoveTo`: approach/diagonal-detour/reverse-fires/
reverse-skips-by-rand/zero-delta/wrap). Live vs real data: `__U6.driveTo(5, …)` walked Lord
British tile-by-tile toward the target (greedy S-then-W), reached adjacent on open carpet
(auto-stop at Chebyshev ≤ 1), and stalled against dense throne-room furniture — the correct
drunk-walk limitation (nudges one blocker, doesn't route-plan).

## I-save/load scope — full-snapshot JSON persistence

**DONE (2026-06-10).** Save/restore the live game across sessions. Artifacts stay the static
baseline (re-uploaded each session); the save is a clone-internal JSON carrying ONLY the mutable
ECS state (`research_save_load.md`: "the format is throwaway; the state set is the deliverable").
**Full snapshot**, not a delta — in an ECS the full dump is the cheapest correct form and it
auto-captures future components. Non-numeric label by design so the planned `I-16`…`I-19`
movement-arc numbers are untouched.

**Files:** new `systems/persistence/snapshot.js` (serialize + restore) + `tests/test_snapshot.{html,js}`;
edits to `main.js` (boot restore hook + Export/Import + dropzone `.json`), `index.html`
(`#save-controls`), `u6db.js` (`del`).

**Snapshot model (generic over the ECS).** No `ecs/world.js` change was needed: `world.query()`
(no-arg) already yields every live entity, and the `components.js` catalog filtered by
`world.isRegistered()` covers component discovery. Each live entity → `{ comps: { Name: {field:…} } }`,
save-id = array index. **Entity references**: the only component field holding a raw handle is
`ContainedIn.holder` (a `Float64Array`); convention = **a `Float64Array` field is an entity
reference**, serialized as the referent's save-id and remapped to the fresh handle in a second
pass on load (generic + auto-grows). `Actor.npcId`/`Schedule.npcId`/`PartyMember.slotIndex` are
stable values, serialized as-is. Resources are an explicit whitelist — `WorldClock` + `Party`.
`WorldSpeed`/`Camera` are deliberately NOT saved (the boot owns them: `dev_hud` re-applies the
speed slider, `startRender` recenters the camera on the avatar), and everything else is static
(TileRegistry/MapLevel/Schedules) or rebuilt (Paths/SpatialIndex/ActorIndex). **Conversation /
NPC-record state**: the conversation system mutates the decoded `objlist` IN PLACE (actors'
`talkFlags` + trained stats, `globals.karma`, and — later — party join/leave), not via ECS
components, and `objlist` is re-decoded pristine each boot — so the snapshot also carries the
full `objlist` (actors + globals + party), re-applied in place on restore. Without it, passing
Lord British's questions was lost on reload (caught in live testing 2026-06-10). The snapshot also
carries `loadedRegions` + a `version`
+ an `artifacts` stamp (FNV-1a over objlist bytes) for an import-mismatch warning.

**Restore = replace `loadActors`.** On boot, `consumePendingRestore` reads a one-shot reserved
U6DB key (`__pending_restore.json`); if present, `restoreWorld` runs **in place of** `loadActors`:
recreate entities, remap `Float64Array` refs, rebuild `ActorIndex` + `SpatialIndex` (insert in
save-id order — on-map entities are emitted in cell-chain order so cell-pick chains survive), set
`loadedRegions`, restore resources. A restored boot **skips the first-tick schedule re-resolve**
(the saved AIMode/Destination are already correct).

**Object deletion needs no tombstones** (the case Zane raised). A destroyed object is simply
absent from the dump, and restore re-marks its region loaded so the streamer never re-reads
pristine objblk to resurrect it. Airtight by invariant: a world object can only be destroyed once
its region is loaded, so a deletion's region is always in `loadedRegions`; NPCs are global and
restore bypasses `loadActors`. **Dependency**: rests on no-region-unload
(`project_ultima6_no_region_unload`) — see `research_save_load.md §"Object deletion"`.

**Export / Import UI.** `#save-controls` in the dev block: Export → `serializeWorld` → Blob →
`u6save-<ts>.json` download (the `../ultima6/map_viewer.js` Blob pattern); Import (button or a
dropped `.json`) stashes the JSON under the reserved key + reloads, so the boot path restores it.

**Sub-steps (save-point each):** (a) confirm no ECS change needed → (b) `serializeWorld` →
(c) `restoreWorld` + unit round-trip test → (d) boot restore hook → (e) Export → (f) Import →
(g) tests + docs.

**Verification.** `tests/test_snapshot.html` **17/17** (round-trip deep-equality;
`ContainedIn.holder` ref remap to fresh handles; resources; loadedRegions; cell-chain head order).
Live vs real data (1052-entity world): mutate (clock→15:30, delete obj 326 @ (365,265) in loaded
region 18, add a torch) → snapshot (206 KB) → reload → restore reproduced **1052/1052** entities,
the **deletion stayed dead** (region 18 gated, not resurrected), the addition persisted, clock +
`loadedRegions` restored, Export produced a valid JSON Blob — no console errors. **Talk-state
(2026-06-10 fix):** set an NPC `talkFlags` bit + `globals.karma` on the live `objlist` → export →
reload → both restored (the analog of "passed Lord British's questions stays passed"). Unit:
`test_snapshot.html` adds an objlist round-trip (talkFlags / trained stat / karma / party) → 22/22.

## I-16 scope — arrival behaviors + direction system (§七)

**Done (a–c + two review fixes + d, 2026-06-10).** Finished `__AtDestination` and the direction/frame system —
"what an NPC does on arrival, and how it faces." Spec: [U6_NPC_排程與移動邏輯.md](U6_NPC_排程與移動邏輯.md) §七 +
`research_npc_ai.md §"Arrival"`. Built on I-9g (worktype settle + `STAND`/`GUARD` facing + humanoid walk frames).

**Sub-steps:**
- **a — `origObjNumber` + arrival branches.** New `ObjType.origObjNumber` (mirrors source `OrigShapeType`):
  set = objNumber at load; restored on pose-exit so `SLEEP`→`OBJ_092` / `PLAY`→`OBJ_188` don't permanently change
  identity. `atDestination` `SLEEP`/`SIT`/`EAT`/`PLAY`/`RINGBELL` branches — `C_1E0F_2184` prop lookup, `C_1E0F_2125`
  plate-facing for `EAT`, sleep-on-spot fallback.
- **b — `setDirection` humanoid arm + chair-override.** `C_1E0F_0664` humanoid: sit pose (cycle 3) facing the
  chair's direction (`OBJ_0FC` = chair frame; `OBJ_147` throne = face S); stand `(facing<<2)|1`; walk via `walkStep`.
- **c — full `setDirection` + non-humanoid walk facing.** Per-type arms: gazer (frame IS facing,
  `OBJ_162`/`167`/`19E`/`184`), `OBJ_16A` (12 frames/dir, cycles 3/7/11), `OBJ_16B` (3/dir), `OBJ_164` (random),
  2-frame family (frame = walkbit + `facing<<1`). `npcStep` no longer humanoid-gated. (This **lifts** the I-9
  "non-humanoid animation deferred" deviation — gazers/animals now face + animate.)

**Two fixes from the live review (commits `0121f8e`, `3474856`):**
- **Multi-tile furniture footprint** (`0121f8e`). `findPropAtCell` (`C_1E0F_2184`) only checked the NPC's OWN cell,
  so a seated NPC never found a 2-wide throne (`OBJ_147`) whose anchor is the cell to the EAST → Lord British faced
  north and never took the sit pose. Ported `FindLoc`/`NextLoc` (`seg_1184.c:211-291`): also scan `loc_right`
  (double-H), `loc_down` (double-V), `loc_dn_rt` (2×2) with the `D_0658` footprint offset; chair test is
  `frame - D_0658 == 2`, `SLEEP` bed sub-frame likewise. **Decode gotcha:** source `TileFlag`/DoubleH/V is the
  clone's `flags2` plane (`TileFlag` @0x800), NOT `flags1` (`TerrainType` @0).
- **Restore sprite on wake, not arrival** (`3474856`). A sleeping NPC kept its bed sprite (`OBJ_092`) for the WHOLE
  walk to its next slot (restore was on arrival only). Restore `origObjNumber` when the schedule sends a posed NPC
  (`SLEEP`/`PLAY`) off to a new slot — source restores on **wake**: `seg_0A33.c:837-840` (ClrAsleep + ObjShapeType =
  OrigShapeType once mode left `AI_SLEEP`) + the PLAY-exit restore in the schedule arm (`seg_1E0F.c:2287`).

**d — `AI_SCHEDULE` continuous-settle.** Source calls `__AtDestination` for every `AI_SCHEDULE` NPC each active
tick (`seg_1E0F.c:2198`), acting on the **save-persisted** `SchedIndex` (`seg_0C9C.c:311` reads it from the save).
The clone settled only on the hourly arm, and `resolveSlotAt` is exact-hour-only, so an NPC loaded/streamed
mid-period showed its raw pose until the next exact-hour event — Lord British loaded **standing** instead of
sitting on his throne. Fix: new `Schedules.resolveActiveSlot(npc, hour, dow)` (most-recent slot ≤ now, day-matched,
wrapping midnight — re-derives `SchedIndex` without persisting it; 7×24 bound) + an `AI_SCHEDULE` branch in
`npc_tick_system`: on-slot → `atDestination` (apply the worktype pose/facing), off-slot → `AI_FINDPATH` (walk
there). Null-safe (off on the unit-test worlds). Tests: `resolveActiveSlot` wrap/day cases + on-/off-slot tick
settle (`tests/test_pathfinding.js`, **157/157**).

**Kept deviations / decisions:**
- `findPropAtCell` scans own + right/down/dn-rt only (the source `FindLoc`/`NextLoc` footprint) and returns the
  first match — there is normally one relevant prop per cell.
- `resolveActiveSlot` **re-derives** the active slot each call instead of porting the save-persisted `SchedIndex`
  byte — the clone drops re-derivable save state (same principle as `MovePts`→accumulator).
- The `AI_SCHEDULE` settle is per-tick but **transient**: an NPC leaves `AI_SCHEDULE` after one settle (→ worktype
  or `FINDPATH`), so it fires ~once per load/region-load, not every tick (no pathfinder hammering).

### AI-mode dispatch coverage — the I-16 / I-17 boundary record

The full `NPCMode` dispatch is the `switch(NPCMode)` at `seg_1E0F.c:1748` (per-NPC AI turn) + `__AtDestination`
(`:1002`) for arrivals + the `AI_SCHEDULE`→`__AtDestination` settle (`:2198`). Coverage as of I-17:

| Mode(s) | Source handler | Clone status |
|---|---|---|
| `AI_SCHEDULE` 0x80 | `__AtDestination` every tick (`:2198`) | **ported (I-16d)** — `resolveActiveSlot` + tick settle |
| `AI_FINDPATH`/`ONPATH`/`84`/`85`/`86` 0x81–86 | pathfind + `__DoOnPath` | ported (I-9) |
| `AI_STAND_N..W` 0x87–8a | arrival facing | ported (I-9g / I-16) |
| `AI_SLEEP`/`SIT`/`EAT`/`PLAY` 0x91–95 | arrival pose + idle | ported (I-16; multi-tile + wake-restore fixed) |
| `AI_GUARD_N..W` 0x8b–8e | arrival facing **+ pacing** (`:1820`) | facing ported (I-9g/I-16); **pacing ported (I-17c)** |
| `AI_WANDER`/`GRAZE` 0x8f | `C_1E0F_37DB` (1/8 → one random cardinal step) | **ported (I-17a)** |
| `AI_LOITER`/`FARM` 0x90/94 | `C_1E0F_33C4` (1/8 → one step drifting near the slot) | **ported (I-17b)** |
| `AI_RINGBELL` 0x98 | arrival + bell tile anim (`:1835`) | arrival ported; **bell anim → its own later step** (on-demand tile-anim trigger) |
| `AI_SEEKOBJ` 0x82 | seek a chair/bed | not ported (rarely a schedule action) |
| `AI_CONVERSE`/`THIEF` 0x96/97 | approach player → talk/steal | deferred (player-interaction) |
| `AI_BRAWL`/`9A`/`VIGILANTE`/`ARREST` + all `COMBAT_AI_*` | combat subsystem | deferred by design (no combat yet) |

**Why this boundary entry exists (the discipline it records).** Both I-16 review bugs were *missing sub-paths in a
feature the ledger already called done* (the throne `D_0658` footprint; the wake-time sprite restore), and the
`AI_SCHEDULE`-settle gap (I-16d) was a whole dispatch arm the clone silently skipped. The cheap defense is to
enumerate the source dispatch arms a step claims to cover and mark each **ported / deferred-with-reason** — this
table. I-17 picks up three of the `→ I-17` rows: the persistent moving worktypes `WANDER`/`GRAZE` (via
`C_1E0F_37DB`), `LOITER`/`FARM` (via `C_1E0F_33C4`), and `GUARD` pacing, all riding the I-14/I-15 move primitives.
`RINGBELL` is **split to its own later step** (it needs an on-demand "trigger a specific tile's animation" hook the
clone doesn't have yet — see §"I-17 scope"); combat-AI and thief/law modes stay deferred by design (educational-port
scope, `user_retro_port_goal`).

## I-17 scope — NPC AI behaviors (persistent moving worktypes + guard pacing)

**Status: COMPLETE (2026-06-11).** The moving schedule worktypes are now active per-turn behaviors (a–c), plus
I-17d (displaced settle-in-place NPCs stand aside on a shove + return to post). test_pathfinding **194/194**;
WANDER + LOITER live-verified moving on real data. Spec:
[U6_NPC_排程與移動邏輯.md](U6_NPC_排程與移動邏輯.md) + `research_npc_ai.md §"Per-mode dispatcher"`.

Turns the **moving** schedule worktypes from idle leaf states (where I-16's `__AtDestination` parks them on arrival)
into **active per-turn behaviors**. The clone analog of the worktype cases in source's per-mode dispatcher
`C_1E0F_3E6A` (`seg_1E0F.c:1733-1848`). Builds entirely on existing primitives — the I-14 DEXTE accumulator
(`move_economy.js`), the I-15 `tryMoveTo`/`npcStep` move kernel (`drunk_walk.js` / `npc_path.js`), and the I-16c
non-humanoid facing (so animals/gazers face + animate). **No new pathfinding.** Worklist = the `→ I-17` rows of the
§"I-16 scope" AI-mode dispatch coverage table.

**In scope — the three non-combat moving worktypes (verified against source 2026-06-11):**

| Worktype | Source | Behavior |
|---|---|---|
| `WANDER`/`GRAZE` 0x8f / 0x0c | `C_1E0F_37DB` (`seg_1E0F.c:1558-1574`) | 1/8 → one step in a random cardinal (`OSI_rand(0,3)<<1`), else idle |
| `LOITER`/`FARM` 0x90 / 0x94 | `C_1E0F_33C4` (`:1448-1462`) + `C_1E0F_31C7` (`:1391`) | 1/8 → one geometric-random-biased step *toward the slot*, else idle |
| `GUARD_N..W` 0x8b–8e | dispatcher arm `:1820-1834` | 50% idle; else march guard-axis (on-slot) or current facing, reverse `dir^4` on a block |

`GRAZE` (0x0c) shares `C_1E0F_37DB` with `WANDER` (`:1810-1811`) but is set as an animal *disposition*, not a
schedule action — covered for free by the same handler once the 0x0c routing is added.

**Plus — I-17d: displaced settle-in-place NPCs (stand aside on a shove + return to post).** Completes the
clone-only step-aside (I-9). When a passing NPC's step-aside shoves a settle-in-place NPC
(STAND/SIT/SLEEP/EAT/PLAY) off its slot, it now **stands up** — mode → `AI_STAND` facing the shove + a plain stand
pose, any SLEEP/PLAY sprite swap restored — instead of freezing mid-stride or leaving a sit pose stranded on empty
floor. It keeps its `Destination` (slot + original worktype) and **walks back + re-poses** (sits/sleeps again) once
the slot cell **clears**. The clear-slot gate is the key: it waits the passer out, so there's no push↔return loop
(the loop the original step-aside comment warned about). Moving worktypes (WANDER/LOITER/FARM) and GUARD are left to
their own handlers — not converted. **Clone-only mechanism** — source has neither step-aside nor return (its settled
NPCs never move); it serves the clone's auto-advance heartbeat, the kind the post-I-9 audit calls legitimate.

**Split out / deferred (decided 2026-06-11):**
- **`RINGBELL` (0x98) → its own later I-step.** Source `SetTileAnimation(BaseTile[OBJ_0EC], 1)` (`:1841`) is an
  *on-demand* tile animation; the clone's `tile_animation_system.js` is always-on for animdata-flagged tiles, so
  this needs a "start/stop a specific tile's animation" extension that doesn't exist yet. The mode + chime-count
  logic (`MUS_Bell = Time_H % 12`, 0→12) is trivial; the missing piece is the triggered visual swing.
- **`THIEF`/`ARREST`/`VIGILANTE`/`BRAWL` + all `COMBAT_AI_*`** — deferred by design (no combat subsystem;
  educational-port scope, `user_retro_port_goal`).
- **`AI_9A` (0x9a) skittish-creature flee — NOT an I-17 activity (verified live 2026-06-11).** Trap to record: a
  schedule worktype can *look* like an I-17 persistent activity yet dispatch to combat AI. The **castle mouse**
  (npcId 9, `OBJ_162`) carries worktype `0x9a` on 5 of its 6 slots, but source routes `0x9a` (with
  `AI_RETREAT`/`SHY`/`FEAR`) to **`COMBAT_AI_Retreat`** (`seg_1E0F.c:1760`) — a flee/scurry handler in the deferred
  combat subsystem, not `C_1E0F_37DB`/`33C4`. So I-17's `WANDER`/`LOITER`/`GUARD` arms **do not** cover it; the mouse
  stays idle/stuck after I-17 (expected, not a regression — making it scurry needs `COMBAT_AI_Retreat`). **Not a z
  case:** all six mouse slots are z=0. Its "scurries the castle at night, missing by day" is fully explained by
  slot-reachability + the unported flee AI: night slots are central & reachable (h0/h19/h21 within ~9 of the castle
  center → the FINDPATH walk is the only motion the clone gives it → visible), day slots are peripheral & blocked
  (h7/h12/h14 at dist 17–28; the path fails and, being **in view**, the 2026-06-10 rule correctly refuses to teleport
  it → it parks motionless in `AI_SCHEDULE`/`AI_86`). A clean instance of the "in-view + unreachable slot → frozen
  NPC" interaction the post-I-9 audit flagged.
- **The `IsPlrControl` wander-toward-player arm** of `C_1E0F_37DB` (`:1561-1567`, 1/4 → `TryMoveTo(MapX,MapY)`) —
  needs NPC player-control/charm, which doesn't exist; dropped with a note.

### Design preamble — the probability × accumulator contract

Source rate-limits these behaviors **twice**, and the clone reproduces only one of the two for free. The contract
is how I-17 re-introduces the second on top of the I-14 accumulator.

**Limiter #1 — how often the NPC gets a turn (DEXTE-paced).** The round scheduler `C_1E0F_4E0A` grants turns by the
`MovePts/DEXTE` ratio, so high-`DEXTE` NPCs act more often per game-minute. This is the NPC's *clock rate*.

**Limiter #2 — the per-turn dice roll (duty cycle).** Inside the handler, even on a granted turn the NPC usually
does nothing — `WANDER`: `if(OSI_rand(0,7)==0) TryStraightMove(...); else SubMov(5)`. The decisive detail: **both
branches spend move points** (`TryStraightMove`→`SubMov` internally; the idle branch calls `SubMov(5)` explicitly),
so the budget drains either way and skipped turns can't bank into a later burst. The roll only decides whether
*this* turn's expenditure produces visible motion. Net feel: the NPC gets many turns but only shuffles a step on
~1/8 of them — the gentle townsfolk drift.

**What the clone already has.** The I-14 accumulator reproduces **limiter #1** faithfully and refresh-rate-
independently: `credit += rate(dexterity)·elapsed`, capped at the cell's `stepCost`; a step is allowed only when
`credit ≥ stepCost` and subtracts it. It does **not** reproduce limiter #2 — "step whenever credit allows" would
walk a continuous random walk every eligible beat, losing the 1/8.

**The contract — slot the source roll between eligibility and spend, and spend on BOTH outcomes:**

```
on each tick, for a worktype-active NPC:
  if credit < stepCost:  wait                         // limiter #1 (accumulator beat)
  else:
    if roll(source_probability) hits:                 // limiter #2 (source's coin)
        attempt move (tryStraightMove / tryMoveTo);  spend stepCost
    else:
        idle;                                         spend stepCost   ← load-bearing
```

**Why the idle branch must also spend** (mirrors source's `else SubMov(5)`): if a miss didn't spend, `credit` stays
`≥ stepCost`, so the handler re-rolls on the *next render tick* (~16 ms) and keeps re-rolling until it hits — the
first step lands within a few ms instead of on the next DEXTE beat, collapsing the duty cycle toward ~100% (constant
walking). Worse, it'd be **framerate-coupled** (144 Hz rolls more often than 60 Hz → faster wandering on a faster
monitor) — the exact bug I-14's wall-clock integration exists to kill. Spending on a miss forces the NPC to wait for
the accumulator to refill before its next roll. So: **the accumulator decides the beats; on each beat the NPC flips
the source coin to decide step-vs-stand.** Both limiters preserved at once. Dropping either changes the feel (no
accumulator → wrong/refresh-coupled speed; no probability → constant walking, no idle shuffle).

**Not a new invention.** This is the same gate the path-walker already uses — `npc_tick_system.js` waits on
`credit < cost` and spends cost on `step`/`blocked`/`aside` alike (a *blocked* path step already spends, same
"no-progress turns still cost" principle). The contract just inserts the source probability roll between the
eligibility check and the spend; the move-economy gate itself is unchanged.

**Kept deviation:** source's idle spends a flat 5 move points; a step spends terrain-weighted `SubTerrainMov`. The
clone caps `credit` at the cell's `stepCost`, so idle and step "cost" the same here (idle marginally pricier on heavy
terrain than source's flat 5) — invisible in play, simplest reset.

### Sub-steps (landed a–d)

- **a — WANDER/GRAZE** (`C_1E0F_37DB`) **+ the dispatch seam.** New `systems/npc_behaviors.js` holds the active
  worktype handlers (separately unit-testable, mirroring how `npc_path.js` holds `doOnPath`/`atDestination`).
  `npc_tick_system` lets the active-worktype modes through the mode gate, shares the I-14 credit-fill + step-gate
  with the path-walkers, and dispatches via `dispatchWorktype`. `wander()` = 1/8 random cardinal, else idle;
  `AI_GRAZE` (0x0c) + `isActiveWorktype` added to `ai_modes`. The probability×accumulator wrapper (spend stepCost on
  step AND idle) lives in the tick. The `IsPlrControl`-toward-player arm is dropped (noted above).
- **b — LOITER/FARM** (`C_1E0F_33C4` + the geometric-random `C_1E0F_31C7`). `loiter()` = 1/8 → one jittered step
  toward the `Destination` slot, else idle.
- **c — GUARD pacing** (dispatcher `:1820-1834`). `guardPace()` = 50% idle; else march the guard cardinal on-post /
  the current frame-facing off-post (consumes the I-9g/I-16 "read facing from `frame>>2`" hook), reversing
  (`dir^4`) on a block.
- **d — displaced settled NPCs: stand aside + return to post** (see the I-17d paragraph above). `isSettleInPlace`
  added; the `npc_path.js` step-aside converts a shoved settle-in-place blocker to `AI_STAND` + stand pose (sprite
  restored), keeping its `Destination`; `requestStepAside` returns the shove dir; `actorHandleAt` exported. The
  `npc_tick_system` return-to-post branch sends a displaced settle-in-place NPC back (`AI_FINDPATH`) once
  `actorHandleAt` shows the slot cell clear, re-posing on arrival via `atDestination`.

All deterministic tests use an injected `rand` (the `drunk_walk` pattern). test_pathfinding **194/194**; WANDER +
LOITER live-verified moving on real data (gentle 1/8 drift, no console errors). The handlers carry their
`// C_1E0F_*` citations.

## I-18 scope — party status UI (on-demand) + dev-HUD/clock layout refactor

**Status: COMPLETE (2026-06-12) — all sub-steps a–f landed (a layout refactor · b stat helpers + dex-cache
fix · c `P` roster + shared widget · d ZSTATS + `Tab`⇄inventory · e GIVE picker + bare-map-path retirement
· f avatar portrait), all verified live on real data; data-layer = objlist-canonical (NO `Stats` component
— see "Data layer" below); no snapshot bump (stays v2).** Grounded against `seg_0A33.c`
`RefreshStatus` (`C_0A33_1AB7`) and the panel-mode routines in `seg_155D.c`. Supersedes I-18's
original "fixed status panel that replaces the dev-HUD clock readout" charter. The per-sub-step
as-built notes fill in as a–e land.

**The reframe (Zane's call, 2026-06-11).** Source's status display is a *fixed right-hand panel*
— `RefreshStatus` switches `StatusDisplay` between party / stats / inventory modes in place. The
clone deliberately does **not** reproduce that: a fixed panel mostly earns its keep in *combat*
(glanceable party HP), which is deferred, so a persistent panel would carry weight we don't use
yet. Per the modern-UX anchor (`CLAUDE.md §"Modern-browser UX"`), status becomes **on-demand**,
freeing the screen for the map. This is a UX-*feel* decision, not a mechanic change — source
stays the spec for *what* the numbers are, not *how* they're surfaced.

**Source mapping — the four `RefreshStatus` modes and what the clone adopts:**

| Source mode | Routine | Shows | Clone |
|---|---|---|---|
| `CMD_91` party roster (default) | `C_155D_000C` (`seg_155D.c:25`) | up to 5 members: **down-facing actor sprite** (`OBJ_MakeDirFrame(OrigShapeType,4)`, *not* the portrait) + HP (poison-green / <10-red) + name | **adopt** → the `P` roster modal |
| `CMD_90` ZSTATS | `C_155D_028A` (`:84`) | name + **portrait** + STR/DEX/INT + Magic cur/max + Health cur/max + Level/Exp | **adopt** → per-member ZSTATS |
| `CMD_92` inventory paperdoll | `C_155D_1065` (`:404`) | equip slots + backpack + weight/encumbrance | **not ported as a paperdoll** — reuse the existing I-10j inventory window via the `Tab` toggle (the equip-slot layout + weight overlaps the inventory window + I-7 inspector) |
| `CMD_9E` object/action view | `C_27A1_02D9` | object-action subsystem view | **out of scope** (object-action dispatch, I-19) |

### Navigation (all on the I-7 UIStack)

`P` → **roster** (icon + name + HP) → press a member **digit** → that member's **ZSTATS** →
`Tab` toggles the member-view body **ZSTATS ⇄ inventory**. Esc unwinds. As UIStack modals these
suspend `TurnClock` for the stack lifetime (world frozen while browsing — HP can't change under
you, so the combat-era "live panel" need is moot until combat).

- **`P` is a clone coinage** — source has no "open roster" key because the roster *was* the
  always-on panel.
- **Digit keys are relocated, not deleted.** Today top-row `1`..`PartySize` opens a member's
  inventory directly from the bare map (`main.js:528-556`). I-18 retires that map-level entry;
  "digit = select member N" now lives inside the roster modal's `onKey` (→ open that member's
  ZSTATS), where a visible member list makes the mapping meaningful. In-window `onDigit`
  member-switch is kept for fluidity.

### GIVE → recipient-picker modal (refactor of landed I-10j)

Today GIVE leaves the UI entirely: `G` in the inventory closes the whole window chain back to the
bare map, then you pick a recipient by digit/click (`armGive`/`pendingGive` + the map-digit branch
`main.js:547-552` + the canvas-click branch `command_dispatch.js:410-419`). I-18 replaces that
with an **in-stack recipient-picker modal**: `G` pushes a picker listing the party **minus the
giver** (the shared widget below); selecting a member calls `giveTo(recipient)` directly; Esc
cancels back to the inventory.

- **Recipients are party members only** — already enforced in `giveTo` (self → "yourself.",
  non-party → "Only within the party!", `command_dispatch.js:146-161`). The picker offers only
  valid members, so those refusals become unreachable-by-construction; keep `giveTo`'s validation
  anyway as belt-and-suspenders — the **stale-item check** still matters (item can move between
  open and select).
- **After a successful give**, pop the picker, **rebuild the giver's inventory list** (item now
  gone), and stay there so you can give again (better than today's "back to the map").
- **Party of one** (only the Avatar) → no valid recipient → **gray out `G`**.
- **Deletes** the entire bare-map give apparatus (`armGive`/`pendingGive`/`isAwaitingGiveRecipient`
  / the armed cue / the map-Esc-cancel + the map-digit and canvas-click give branches). Combined
  with the digit-entry retirement above, **the whole top-row-digit map handler is removed** —
  bare-map top-row digits become unused (numpad stays avatar diagonals).
- **Cross-PC note:** intentional behavior change to landed I-10j — the map-give path is *retired*,
  not lost. Modern-UX-anchor consistent: source's MOVE-to-actor targets the map, but the clone's
  give is already party-only (a clone construct), so a modal list picker is a legit rewrite, not a
  faithfulness regression.

### DROP asymmetry — accepted (Zane, 2026-06-11)

GIVE stays tidy/in-stack (picker), but DROP targets a *map cell*, so it still **detonates the
chain** (roster + ZSTATS + inventory all close) to arm the map cursor (reach 7). The asymmetry is
inherent — you can't pick a ground location from a list — and it is the same close-to-map behavior
I-10j's DROP already had. Accepted; not special-cased. (Net consequence: with the direct digit
entry gone, dropping is reached only by detonating out of the roster path — accepted.)

### Data layer — the objlist record is canonical (no new `Stats` component) [REVISED 2026-06-11 on review]

The original plan added a `Stats` ECS component "because the stats are decoded but dropped at load."
On review that premise was wrong: the stats are **not** dropped — they live on the **`objlist` actor
records** (`objlist.js` parses `strength/dexterity/intelligence/exp/hp/level/mp` into `a.*`), which is a
**mutable, persisted, conversation-VM-facing** store. The conversation VM reads them
(`conversation_system.js`: `#A` dex / `#I` int / `#P` hp / `#S` str / `#E` exp) and **writes** them
(`addDex` → `objlist.actors[slot].dexterity`), and `snapshot.js` serializes the full `objlist` as save
state (it explicitly calls these "trained stats"). What was "dropped" is only the ECS-component
projection. `world_loader.js` carries only `dexterity` (into `MoveSpeed`) + `Alignment` onto the entity.

A `Stats` component would therefore be a **second** persisted home for the same numbers → drift (`addDex`
writes the objlist; a `Stats` mirror wouldn't update → ZSTATS shows stale trained stats), double-
persistence, and the exact duplication the single-source-of-truth rule forbids. **Decision (Zane
2026-06-11): no `Stats` component.**

- **ZSTATS reads the objlist directly** — `objlist.actors[objlist.party[di]]`, the same pattern the
  conversation VM already uses. Single source of truth; covers all actors for free (the objlist holds
  them all); **no snapshot bump** — the objlist already round-trips through save/load, so
  `SNAPSHOT_VERSION` stays 2.
- **`MoveSpeed` is a derived cache of dexterity, not a second source.** `MoveSpeed.dexterity` stays (the
  accumulator reads it hot per tick), but it is a **cache** of the canonical `objlist` value, refreshed
  at load **and on dex-training**: the dex-training path (`conversation_system.js addDex`) must also
  update `MoveSpeed.dexterity[entity]` (via `ActorIndex.get(slot)`) so trained dexterity actually
  changes movement speed. This fixes a pre-existing latent bug — today `addDex` writes the objlist but
  not the MoveSpeed copy, so training never affected speed. One source (objlist), one cache (MoveSpeed),
  single writer. STR/INT/HP/Exp training don't feed the accumulator, so they need no cache refresh;
  ZSTATS reads them live from the objlist.
- **`MaxHP()` / `MaxMagic()` are derived in source** (functions, not stored bytes) — port the two
  formulas into a small `systems/stat_formulas.js`, cited to `seg_2337.c:226/237`: `maxHP =
  clamp(level*30, 1, 255)`; `maxMagic` = a type-keyed multiple of INT (`OBJ_19A` 2×, `OBJ_17A` 1×,
  `OBJ_179`/`OBJ_182` ½×, else 0). Computed on display from the objlist's level/int/objType — not stored.
- **HP coloring:** `<10` → red now; **poison-green deferred** to a combat/poison subsystem (poison is a
  status bit `0x08` on the objlist, not a clean ECS flag — out of scope here).
- **ZSTATS shows no weight/encumbrance** — that is the inventory/paperdoll view; `C_155D_028A` has
  STR/DEX/INT/Magic/Health/Level/Exp only.

### Shared widget — `makePartyMemberList`

The roster and the give-picker are the *same* widget — a party-member list with icon + name (+
optional HP) rows, cursor-select, Esc back-out — so build one:
`makePartyMemberList({ world, reg, objlist, exclude, showHp, onSelect })` on top of
`ui_widgets.makeListCursor` + `ui_icons.tileIcon`. Roster =
`{ exclude: [], showHp: true, onSelect: openZStats }`; picker =
`{ exclude: [giver], onSelect: giveTo }`. One home for the two fiddly bits — the **down-facing
sprite-frame icon** (dir-4 frame off `origObjNumber`, reusing the I-16 frame system) and the **HP
`<10`-red rule**. Decided over a roster-specific widget (the divergence is low and fully
parameterizable — not premature abstraction).

### Layout refactor — clock strip + floating dev HUD (resolves "point 1")

I-18's original "replaces the dev-HUD clock readout" charter is **dropped**. Instead the screen
chrome is restructured (`index.html` + `view/dev_hud.js`):

- **Remove the fixed status panel.** `#status-panel` (the reserved 280px-column placeholder,
  `index.html:223-226`) is deleted. With both right-column occupants gone, the grid collapses
  **two columns → one**: the **map canvas reclaims full window width**, message band full-width
  below it.
- **Persistent clock strip** above `#app` (below the dropzone): date/time/sun (`D_2C55`) + the
  existing `.paused` tint. The genuinely-useful "what time is it / is the world running" readout
  stays always-visible (schedule testing needs it).
- **Float the dev HUD.** `#dev-block` (pause, ±time, WORLD_SPEED slider, NPC schedule/tick stats,
  probe line, save/load, boot log) lifts into a **floating, show/hide** panel (toggle button + a
  hotkey; fixed-position, draggable is optional polish). `installDevHud`'s internals are
  unchanged — only its DOM home + a toggle.
- **The floating dev panel must NOT be a UIStack modal** — UIStack suspends `TurnClock` + captures
  the keyboard, but the dev panel must coexist with a *live, ticking* world (watching NPC stats
  update) and not eat keys. It stays a plain render-system-driven div (as it already is); UIStack
  is reserved for the player surfaces.

### Sub-step plan (each ≈ one save-point commit, browser-verified; squashed into one `impl I-18` per the I-7/I-8 default unless kept separate)

- **a — layout refactor (chrome only, no new surfaces). LANDED 2026-06-11.** Removed `#status-panel`
  + `#right-panel`; `#app` grid collapsed two columns → one (`"map"`/`"msg"`, map reclaims full window
  width). Bottom message band also shortened (`minmax(90px,160px)` → `minmax(56px,100px)`). New
  persistent `#clock-strip` (holds `#clock-text` + the `dev` toggle button; carries the
  `.paused` tint). `#dev-block` lifted out of the grid into a floating `position:fixed` bottom-right
  panel (`z-index:90` < `#ui-root`'s `100` so player modals stack above), `hidden` until `load()`
  reveals it (so the boot log shows); toggle via the strip button **or backtick** (skips typing into
  inputs). `dev_hud.js` is **UNCHANGED** — it's parameterized by element refs, so `main.js` just passes
  `hudEl=#clock-strip`/`textEl=#clock-text`, and `installDevHud`'s `hudEl.style.display='block'` reveals
  the strip while `.paused` toggles on it. **Open item settled:** dev-toggle = backtick + a strip button
  (resolves the plan's hotkey-choice open item). **Verified live on Zane's real data (a restored save, world ticking, port 8083):** clean boot (no
  console errors); map full-width (682/706px); the clock readout ticks in the strip (47→51 hours fired
  across the checks); **pause** tints `#clock-text` red (`rgb(204,102,102)`) + freezes the clock, resume
  restarts it; the **dev toggle** works via both the strip button and **backtick** (both directions, and
  correctly ignored while a text input is focused); the panel floats over the map and the **world keeps
  ticking with it open** (proof it's not a suspending modal); a player **modal opens centered over the
  full-width map** (`#ui-root` z-index 100 above the dev panel's 90), Esc closes it.
- **b — stat-read helpers (no new component). LANDED 2026-06-11.** Per the revised data layer: NO
  `Stats` component. New `systems/stat_formulas.js` — `maxHP(level)` (`clamp(level*30,1,255)`) +
  `maxMagic(objType,int)` (`0x19a`→2×, `0x17a`→1×, `0x179`/`0x182`→½×, else 0), cited `seg_2337.c:226/237`;
  also consolidated the conversation host's inline `maxHP` into it (heal/rest/wounded now import the shared
  fn — one source of truth). `addDex` (`conversation_system.js`) now calls a new `refreshMoveSpeedDex` to
  re-sync the `MoveSpeed.dexterity` cache (objlist = source of truth; `MoveSpeed.dexterity` = the cache the
  accumulator reads hot per tick) — fixes the latent bug where trained dexterity never reached movement
  speed. No new persisted state, no snapshot bump (stays v2). **Verified live on Zane's real data:**
  `maxHP`/`maxMagic` match source both synthetically and on the avatar (level 8 → 240; `0x19a`, INT 15 →
  30); the avatar entity has `MoveSpeed` with `dexterity` synced to the objlist at load, and the
  train-then-refresh path updates the cache (mutate+restore, no lasting change). Clean boot, no console
  errors. (`node` not on this PC → unit suites not re-run; the change is mechanical + live-verified.)
- **c — `makePartyMemberList` + the `P` roster. LANDED 2026-06-11.** New `view/party_status.js`:
  `makePartyMemberList({reg,objlist,exclude,showHp,onSelect})` (the shared widget — down-facing sprite
  icon [humanoid south stand frame `(2<<2)|1`=9, `OBJ_MakeDirFrame(type,4)`], name, HP cur/MAX via
  `stat_formulas.maxHP` with the `<10`-red rule; `↑↓`/Enter/digit select; reads the objlist) +
  `openPartyRoster(uiStack,{...})` (the `P` modal — CMD_91 `C_155D_000C`). `P` keydown in `main.js`,
  same gate as `I` (no modal / not panning / no verb armed). **Scoping calls:** (1) `onSelect` opens a
  read-only **inventory-browse placeholder** for now — I-18d swaps it for the member's ZSTATS; (2) the
  map-level direct-inventory **digit-retirement is DEFERRED to I-18e** (bundled with the give-apparatus
  removal) — c is purely additive, so the existing top-row-digit path is untouched (no half-removal).
  **Verified live on real data:** `P` opens the roster (Avatar 90/240, Dupre/Shamino/Iolo 90/90 — per-
  member maxHP: avatar L8→240, companions L3→90), each with its down-facing sprite; `↑↓` moves the
  cursor; Enter AND digit both select → that member's inventory opens as a stacked modal; Esc unwinds
  (inventory→roster→closed). Clean boot, no console errors. (`maxMagic` is unused until ZSTATS in d.)
- **d — ZSTATS surface + `Tab` toggle. LANDED 2026-06-11.** `openZStats` in `view/party_status.js` —
  per-member stats modal: name + **portrait** (the I-12 `Portraits.imageData(slot)` lazy decoder, blitted
  to a reused `.dialog-portrait` canvas; Avatar slot → blank box, split to **I-18f** below) + STR/DEX/INT +
  **Magic cur/MAX** (`mp`/`maxMagic`) + **Health cur/MAX** (`hp`/`maxHP`, `<10`-red) + Level/Exp, all read
  from `objlist.actors[slot]` + the `stat_formulas` helpers (no `Stats` component). Source: `CMD_90`
  `C_155D_028A`. **Stacks on the roster** (Zane's call — Esc peels ZSTATS → roster → close). `Tab` opens
  that member's inventory window (`openInventoryWindow` gained a `tabBack` opt: `Tab` there pops back to
  ZSTATS; `Esc` does too) — the toggle is push/pop on the stack, not an in-place body swap (consistent
  with the chosen "stack" model + reuses the full recursive/verb inventory window). A **digit switches
  member** in place (pop the ZSTATS, re-open for member n; roster preserved). main.js `openMemberView`
  wires it; the roster `onSelect` now points here (replacing the c inventory placeholder). **Verified live
  on real data:** Dupre ZSTATS (STR 26/DEX 20/INT 17/Magic 0/0 [fighter → 0]/Health 90/90/Lvl 3/Exp 374),
  portrait drew; Tab → inventory → Tab/Esc back; digit 3 → Shamino; Esc cascade roster→close; clean boot,
  no errors. **Long-list scroll fix (Zane, found via Iolo's inventory):** `.ui-list` now scrolls within
  itself (capped 56vh) so a long list keeps the modal header + hint/operation line PINNED instead of the
  whole modal scrolling them off the 80vh fold — applies to every list modal (inventory / roster / picker).
  **Member-switch fix (Zane):** the Tab'd inventory's "1-N switch" hint was a dead promise (no `onDigit`
  passed). Member-switch is now wired into BOTH faces — a digit from ZSTATS or from the Tab'd inventory
  unwinds the member view to the roster and opens member n's ZSTATS (`switchMember`).
- **e — GIVE → recipient-picker + retire the bare-map paths. LANDED 2026-06-11.** `G` in the inventory
  now opens an **in-stack** `openRecipientPicker` (party minus the giver — the shared `makePartyMemberList`,
  `view/party_status.js`); selecting a member calls a new `cmd.giveItem(item, giver, recipient)` (extracted
  from the old `giveTo` — same self/non-party/stale refusals), then the picker pops and the giver's
  inventory rebuilds (item gone, stay there). Party-of-one → an empty-state picker ("(no one else to give
  to)"), in place of "gray out `G`" (functionally equivalent, simpler). `G` is wired via a new `onGive`
  inventory-window hook that does NOT close the chain (so the picker stacks); `D` still detonates the whole
  chain to the bare map + arms the drop cursor (the accepted asymmetry). **Deletions:** the bare-map give
  apparatus (`pendingGive`/`armGive`/`giveTo`/`isAwaitingGiveRecipient` + the keydown give-Esc branch + the
  canvas-click give branch + the give cue, `command_dispatch.js`); and the **bare-map top-row-digit
  inventory handler** (`openMemberInventory` + its keydown listener + `__U6` hook, `main.js`) — inventory
  access is now P → roster → ZSTATS → `Tab` only; bare-map top-row digits are inert (numpad stays avatar
  diagonals). **Behavior change to landed I-10j:** the map-give path is retired (modern-UX consistent — give
  was already party-only, a clone construct, so a modal list is a legit rewrite, not a faithfulness
  regression). e also finally wires `G`/`D` into the ZSTATS-opened inventory (inert in d). **Verified live on
  real data:** Avatar `G` on the Orb → picker (Dupre/Shamino/Iolo, Avatar excluded) → pick Dupre → "You give
  Orb of the Moons to Dupre.", Orb leaves Avatar + arrives in Dupre, inventory rebuilt; `D` detonates to the
  armed map cursor; bare-map digit `1` opens nothing; Esc cascade; clean boot.
- **f — avatar ZSTATS portrait. LANDED 2026-06-12.** `objlist.js` now parses `avatarPortrait = g(0x2ccb)`
  (source `D_2CCB`, the char-creation portrait choice) into globals; `portrait.js`'s Avatar branch decodes
  `portrait.z[D_2CCB-1]` (`C_2FC1_1C19`, `seg_2FC1.c:755`); `main.js` passes it to `new Portraits`.
  `openZStats` needed **no change** — it already calls `portraits.imageData(slot)`, which now resolves the
  Avatar. **Investigation (Zane's data is a pristine factory copy — no save):** `D_2CCB` reads **0**, and that
  is **genuine, not a bug**. The globals block *is* in the objlist — source reads it LAST (`seg_0C9C.c:321`:
  the `0x2C4A..0x2CCC` block), which lands at file offset **`0x1bf1`**, **exactly** the clone's offset
  (verified by summing every prior section — not misread). It's all-zeros because no character has been
  created: the real game detects `D_2CCB==0` (`seg_0903.c:594`) and hands off to the **separate
  `ultima6.exe` char-creation program** (absent from this `GAME.EXE` decompile) which sets `D_2CCB`/name/sex
  + writes a save. The clone loads factory data with no creation flow, so `D_2CCB` is **always 0** here →
  **default to `portrait.z[6]`** (D_2CCB 7, a male face matching the factory `avatarSex` 0 — Zane's call)
  so the Avatar has a face; a real save (`D_2CCB>0`) shows the player's actual portrait. (Same factory-data
  origin explains `karma`/`avatarSex` reading 0; the world globals — clock/karma — are now seeded from the
  `D_2C4A.c` defaults when zero via `applyGlobalDefaults`, so a factory boot starts 08:00 D4/M7/Y161 with
  karma 75 rather than a hardcoded stand-in — see `research_save_load.md §"New-game initialization"`.) **No
  snapshot bump** — `avatarPortrait` rides the flexible `objlist.globals` blob and is re-read from the fresh
  objlist each boot (static). **Verified live:** Avatar ZSTATS shows the `z[6]` male face; clean boot, no errors.

### Deferred / not in I-18

- **Inventory paperdoll** — was deferred (reuse the `Tab` inventory list); **built as **I-18g–k** as a
  de-scoped **equipped-equipment slot list** + equip/unequip + container move (not the visual doll). See
  the §"I-18g–j scope" + §"I-18k scope" subsections below.
- **Poison-green HP color** — needs a combat/poison subsystem; `<10`-red only for now.
- **Persistent at-a-glance party HP** (the combat-era value of a fixed panel) — N/A until combat;
  the on-demand roster suffices.
- **`CMD_9E` object/action view** — object-action subsystem (I-19).
- **Draggable dev panel** — fixed-position + toggle is enough for v1.

### Open (settle at impl)

- Dev-panel toggle mechanism — hotkey choice (backtick / `~` vs a corner button); pick when a
  lands.

## I-18g–j scope — equipped-equipment view + ready/unready (the de-scoped paperdoll)

Picks up the "Inventory paperdoll" deferral. Source's status-panel inventory (`CMD_92` /
`C_155D_1065`) is a body-positioned **doll** + a 4×3 carried grid + a weight footer. The clone
keeps the **slot mechanism** but **drops the doll graphic** for a **labeled slot list** beside the
carried list (Zane's call — the doll positioning is cosmetic; an explicit "Left Hand: (none)" is
clearer than an empty doll cell, and fits the educational-not-pixel-faithful goal). Four sub-steps,
each one save-point commit + its doc touch (kept **un-squashed**, like I-18 a–f):

- **I-18g — equip-slot classifier + builder (pure, no UI).** `systems/equip_slots.js`:
  `equipSlotForTile(tile)` (verbatim `STAT_GetEquipSlot`, seg_155D.c:129 — the `TIL_*` ranges +
  the 33-entry `D_07DD` one-hander table; `TIL_NNN == 0xNNN` so they port as hex literals) +
  `buildEquipment(equippedItems, reg)` → an 8-slot array (`SLOT.*`-indexed) applying `C_155D_07E0`'s
  collision rules (two-handed → RHND + `BLOCKED` LHND; second one-hander → spill RHND↔LHND; ring →
  first free finger RFNG/LFNG). `SLOT_LABEL` uses **GAME.EXE's words** (Head / Neck / Chest /
  Right Hand / Left Hand / Right Finger / Left Finger / Feet, u6.h:290-297), not Nuvie's
  Body/Hand/Arm. **Verified (preview-eval):** classifier correct incl. 0x219→Neck (before Chest),
  two-hander→transient 8, ring→transient 9, non-equippable→−1; builder places two rings in both
  fingers, a two-hander as RHND + LHND-BLOCKED, dual-wield as RHND/LHND. **LANDED.**

- **I-18h — slot-list widget + two-column view + carried split.** The 8 `SLOT_ORDER` rows
  (`tileIcon` + name, or `(none)`; LHND-BLOCKED → "(two-handed)") rendered beside the carried list;
  the carried list filtered to **non-equipped** items and the inline `equipped` tag dropped. Wired
  through the existing ZSTATS `Tab` toggle. New `view/equip_list.js` (`makeEquipList`) +
  `inventory_picker.js` two-column restructure (equip column **only at the member root**, not a
  drilled-in bag — a bag has no equip slots) + `.inv-body`/`.equip-*` CSS in `index.html`.
  **Verified live (Dupre):** Equipped = Head iron helm / Chest plate mail / Right Hand sword /
  Left Hand kite shield / Feet leather boots / Neck+fingers (none); Carried = bag/ale/meat/mug
  (equipped items now absent from the list); clean two-column render, no console errors. **LANDED.**

- **I-18i — weight/STR encumbrance footer.** The two stone readouts (`equipped/STR`, `total/STR×2`,
  `C_155D_0CF5`:374-383) via `GetWeight` (`C_155D_0661`: `weightOf×qty`, `÷10` for the D_081F
  coin-like types) + a recursive bag-contents walk (`Encumbrance`) + the `C_155D_0CB6` tenths→stones
  round. The member's STR is threaded from `main.js`'s `openInv` (`holderStr`), so the footer shows
  only on the root member view. Display-only — eye candy now; the encumbrance *mechanic* (carry-cap
  gate, penalties) lands with combat/inventory later. **Verified live (Dupre, STR 26):**
  `Weight — equipped 20/26 · total 25/52 st`; no console errors. **LANDED.**

- **I-18j — equip/unequip (`E` toggle) + revert the right column to the full tagged list.** Per Zane's
  redesign: the right column reverts to **all** items (worn ones tagged `equipped`, as before I-18h's
  split) so everything's actionable from one list; the left slot list stays the read-only "what's worn
  where". `E` on the highlight toggles ready/unready. **Source gates** (`C_155D_144B` / `C_155D_1738`):
  not-equippable → "You can't ready X."; **too heavy** (equip weight + the item > STR×10, :546) → "Too
  heavy!"; a **full target slot REFUSES** ("No place to put it!", :569 — source does NOT swap; the
  2-hand / ring / hand spill is `resolveReadySlot`). **Ready RE-PARENTS the item to the member** (`readyItem`
  = source's `InsertObj(item, di=outermost-holder, EQUIP)`, :572-581) — so `E` on an equippable nested in a
  **bag pulls it out onto the member** + equips (the item is read from the stores, not the member's direct
  inventory; the `E` handler unwinds the inventory chain to baseDepth and reopens the member view). Unequip
  flips back to carried (holder unchanged). New `cmd.equipToggle` (`command_dispatch.js`) + `setEquipped` +
  **`readyItem`** (`world_loader.js`) + `resolveReadySlot` (`equip_slots.js`); `main.js` wires `onEquip`.
  **Verified live (Dupre, real save):** unequip / re-equip sword round-trips (slot + tag + messages);
  `E` on ale → "You can't ready an ale." (refused); full-slot refuse confirmed synthetically; **bagged equip
  (B):** moving the sword into the bag then `E` from the bag view pulled it out onto Dupre + equipped it
  (Right Hand: sword, bag emptied to gold), landing back at the member view. No console errors.
  **LANDED — I-18g–j COMPLETE.**

**Reused:** the `item.equipped` flag (`ContainedIn.equipped`, set on EQUIP records at load) is the
split key + the I-18j toggle target — no new component/state (the snapshot persists it). **Dropped
(not ported):** the doll draw `C_155D_08F4` + the 4×3 grid coords + the `TIL_19A/19B` doll tiles; the
**swap-on-full-slot** (source refuses). **Deferred:** the cursed-item unready lock (`OBJ_04C`), the
ring/cloak equip magic FX, and the encumbrance *mechanic* beyond the ready-time weight gate. **→ I-18k:**
general **move-in/out for non-equip items** (a "move to…" destination picker — the in/out symmetry the
bagged-equip half doesn't cover; see the I-18k stub below).

## I-18k scope — general container management (move items in/out of containers)

**COMPLETE (2026-06-12).** The mirror of I-18j/B's bagged-equip take-out, generalised to **any** item:
move an item between a member's top-level inventory and a container (bag), **both directions** —
source's inventory **drag-drop** (`InsertObj` with INVEN ↔ CONTAINED coord-use), reimagined for the
clone (no drag) as **one "move to…" action**. `M` on the highlighted item opens `openMovePicker`
(`view/inventory_picker.js`): a destination list of **the member top-level "Inventory (carried)" (only
when the item is currently nested) + the member's direct containers** (minus the item itself + its
current holder). Picking one re-parents via `moveToInventory` (= `attachToHolder`, equipped cleared);
the `E`/`M` unwind-to-baseDepth + reopen rebuilds the member view (works the same from a drilled bag,
so take-out lands back at the member). Feedback: "You put X in the Y." / "You take X." `M` wired in the
inventory window's onKey; `main.js` `onMove` **refuses an equipped item** ("You must unready it first." —
a worn item can't go straight into a container; unready via `E` first), opens the picker otherwise (or
messages "Nowhere to put it." when a top-level item has no containers). **Why separate from I-18j:** the equip take-out is source-faithful
*equip* (re-parent on ready); general move-in/out is its own interaction (the inventory drag-drop), no
equip semantics. **Verified live (Dupre, real save):** put-in (ale → bag, gone from top-level) +
take-out (drill into bag → `M` → "Inventory (carried)" → ale back) both land on the rebuilt member
view with the right messages; no console errors. **Deferred refinements:** nested-container
destinations (only the member's *direct* bags are offered) + a count/quantity split on move.

## I-19 scope — level change (`USE ladder` → multi-z dungeons) — COMPLETE 2026-06-13 (a–f)

**Reframe (Zane's call 2026-06-12).** I-19 was "object-action handlers expansion" (mechanically
fill `seg_27a1.c`'s dispatch table). That's demand-driven per `user_retro_port_goal`, so instead of
a batch table-fill, I-19's organizing rule becomes **"what the game-story critical path needs to
progress"** — and the first such need is **`USE ladder` → descend into dungeons** (reach NPCs/areas
the story requires). The old handler-expansion re-homes to **I-20** (still demand-driven). "Complete
the game story" as a north star is re-discussed *after* I-19 lands.

**The de-risk (why this is activation, not a new engine).** The terrain for all 6 levels is already
decoded at load (`assets/map.js:34-67` → `dungeonChunks[5][32][32]`), `MapLevel.tileAt` already
dispatches to `dungeonTileIndex` when `level!==0` (`resources/map_level.js:19-31`), and `Position`
already carries `z`. The dungeon data is dormant, not absent. Full grounding (source + legacy port +
clone state + the coordinate transform) in **`research_level_change.md`**.

**Locked design decisions:**
1. **Single `SpatialIndex` + active-z filter** (NOT per-level index). Entities of all levels share the
   one index; queries filter by the avatar's active `z`. Lean option; a forgotten filter is obvious on
   first descent (a surface object in a cave), not silent. **Named upgrade:** per-level `SpatialIndex`
   (build-once, swap-on-entry) if z-checks sprawl. *(Zane accepted, flagging uncertainty — hence the
   reversible/named-upgrade framing.)*
2. **Dungeon NPCs go live.** The schedule/AI systems already tick every loaded actor, so a level's NPCs
   animate for free once loaded + z-visible ("static render" would mean *adding* a suppression gate).
   Combat-type dwellers wander/idle (combat stays deferred) — dungeons are *inhabited, not dangerous*.
3. **Level transition = HARD CUT** (Zane 2026-06-12, matching the legacy `../ultima6/` port). No
   `PartyEnter`/`PartyExit` choreography — the *mechanic* still holds (party vanishes from the old level via
   the active-z filter + re-gathers on the new level via `MoveFollowers`); only the gather/vanish/spread
   *animation* is dropped (deferred polish; add only if the cut feels abrupt). See `research_level_change.md §6`.

**Sub-steps (landed a–f, each a save-point commit; squashed at the end). All browser-verified live on
Zane's real U6 data.**
- **a — active-level plumbing.** `MapLevel.level` mutable + per-level extent (`tilesWide`/`wrapMask`,
  1024↔256); `camera_system` wrap + `avatar_move_system` move-wrap follow it; `systems/level_change.js`
  `setActiveLevel` + `__U6.setLevel(z[,x,y])` dev hook. Terrain render follows for free (`tileAt`
  dispatches). *Verified:* dungeon-1 terrain renders at 256-wrap; surface unchanged.
- **b — z-aware visibility.** Active-z filter in `world_render_system`, `passability`, `cell_pick` (skip
  `Position.z != MapLevel.level`); level-change rebuild triggers in both render systems. *Verified:* a
  surface object `pickAtCell` resolves on level 0 → **null** once a dungeon is active. **Finding:** the
  "green/blue blob" first read as object bleed was actually **dungeon terrain** (underground water/moss);
  the z-filter has no bleed (entCount 0 in the dungeon view).
- **c — dungeon object loading.** `loadDungeonLevel` loads `objblk[a-e]i` (one file/level), spawning LOCXYZ
  objects at `z=level` via the shared two-pass spawn (factored out of `loadRegion`); cached in
  `SpatialIndex.loadedDungeons` (load-once + resident). `setActiveLevel` fire-and-forget triggers it; the
  surface streamer gates to level 0. *Verified:* entering dungeon 1 loads **1527** z=1 objects; a room
  renders with its contents.
- **d — `USE OBJ_131` handler.** `systems/use_ladder.js` ports `C_101C_089E`: z_incr + the §5 rescale +
  party teleport + camera recenter, **hard cut**; `command_dispatch` threads `avatarRef`/`recenter`/
  `moveFollowers` into every USE handler. *Verified:* a Britain surface ladder round-trips **down→up to the
  EXACT entrance cell** — the up-ladder's quality bits (`12 → +8+16 on y`) reconstruct it, proving the port
  is faithful.
- **e — dungeon NPCs on the active level.** `npc_tick` + `npc_schedule` gate to the active level (skip
  `z != activeLevel`) + a **level-aware active-area** predicate (the old `hasRegionAt` mis-maps dungeon
  coords to an unloaded surface region) + a level-wrapped teleport view-center; null-safe for the test
  worlds. *Verified:* descending to dungeon-5 switches the ticking cohort **6→13** (gargoyles go live;
  surface NPCs gated out, "inactive 162"); surface unchanged on return.
- **f — save/load the active level.** A save in a dungeon restores there: the boot sets the active level
  from the restored avatar's `z`, and the snapshot **persists `loadedDungeons`** (not derived from entity z
  — a dungeon NPC at z2 doesn't mean L2's objblk loaded; `|| []` keeps pre-I-19 saves loadable, **no
  version bump, v2**). *Verified:* save at (75,83,z1) → reload restores the avatar there, active level 1,
  `loadedDungeons [1]`, 1527 objects (no duplication).

**Tests: 446/446 pass** (all 12 `tests/*.html`, 0 failures — pathfinding 194, passability 51, core 29,
conversation_vm 27, schedules 25, active_area 24, clock 24, snapshot 24, schedule 18, drunk_walk 14,
move_economy 10, zip 6). **node isn't installed on this PC**, but the tests are *also* browser harnesses
(each `test_*.html` loads its `.js` as a module + writes pass/fail to `#out`), so they run in the preview
server with no node — **this is the way to run `tests/` on a node-less PC**. **A real regression was caught
here:** the active-z guards read `mapLevel.level`, but the tests stub `MapLevel` via
`Object.create(MapLevel.prototype)` (constructor bypassed → `level` is `undefined`), so a `mapLevel ?
mapLevel.level : 0` guard returned `undefined` and `z !== undefined` skipped EVERY z=0 entity (NPCs never
ticked, doors never blocked) — 61 `test_pathfinding` failures. Fixed to `mapLevel?.level ?? 0` + deriving
the wrap mask from that (separate `fix I-19` commit; game behavior unchanged — `level` is always defined
there).

**Deferred:** Steps (`OBJ_110`/`114`) — one-line adds when a location needs them; moongate/gate-travel
(landed as I-moongate); combat; solo-mode gate; the PartyEnter/Exit transition animation (hard cut chosen);
the momentary follower-stack-then-spread on a level change (cosmetic — `MoveFollowers` re-forms them). The
dungeon/cave entrance **holes** (`OBJ_146`/`OBJ_134`) are **no longer deferred** — done in **I-19g** below.
See `research_level_change.md §6`.

## I-19g scope — dungeon/cave entry by walking onto a hole — COMPLETE 2026-06-16

The faithful entry trigger I-19 §6 deferred. U6 enters a dungeon/cave by **walking onto** its entrance hole
(no verb): the advance routine `C_1E0F_1B0E` (`seg_1E0F.c:811`) calls `C_1E0F_184D()` at its tail (`:934`),
which scans the party's new cell and, on an `OBJ_146`/`OBJ_134` hole, calls the **same** level-change routine
the ladder USE uses — `C_101C_089E(objNum)` (`seg_1E0F.c:769-785`). Full source/legacy/clone analysis:
`research_level_change.md §7`.

**As built (one cohesive change, 5 files):**
- **`systems/use_ladder.js`** — extracted the `C_101C_089E` core out of `useLadder` into an exported
  **`enterLevelChange(world, entity, ctx)`** (z-direction + the 1024↔256 rescale + `teleportParty`; returns the
  direction). `useLadder` is now a thin wrapper (USE `OBJ_131`). Added **`checkDungeonEntry(world, ctx)`** — the
  `C_1E0F_184D` dungeon/cave branch (scan the avatar's cell for `OBJ_146`/`OBJ_134` → `enterLevelChange`;
  returns whether it entered).
- **`systems/moongate_runtime.js`** — `checkGateEntry` now **returns `true`** on each travel branch (was a bare
  `return`), so the caller can gate the hole check.
- **`main.js` `onMove`** — `checkGateEntry(world, moonCtx) || checkDungeonEntry(world, moonCtx)`. The `||` is
  source's single-dispatch-and-break: a tile is a moongate **or** a hole, never both.
- **`systems/use_handlers.js`** — registry unchanged (no USE-on-hole; see the deviation).

**Deviation considered + rejected — USE-on-hole.** Initially scoped a `USE OBJ_146/OBJ_134` handler "for
convenience," then dropped it: source's USE switch (`seg_27a1.c:3085-3108`) has **no** hole case (holes are
walk-onto only), so adding one would be an unfaithful extension with no upside. The clone matches source — holes
have no USE handler.

**Faithfulness improvement folded in:** the shared core's up-direction test is gated to `OBJ_131 && frame==1`
(matching source's `ObjShapeType == TypeFrame(OBJ_131,1)`), where the old `useLadder` used a bare `frame==1`.
Equivalent while it only ran for ladders; correct now that holes share the core (a frame-1 *hole* is never an
up-ladder — and is moot at the surface, where `MapZ==0` short-circuits the test to "down").

**Tests:** new `tests/test_dungeon_entry.{html,js}` — 11 checks: walk onto `OBJ_146` → descend to z1 with the
/4 compression (Destard (284,657)→(68,161)); `OBJ_134` (cave) also triggers; a non-entrance object doesn't;
`enterLevelChange` up (dungeon→surface ×4 expand + quality sub-cell, (68,161,q3)→(284,641,z0)); dungeon↔dungeon
no-rescale. Plus one assertion in `test_moongate.js` locking `checkGateEntry`'s new return contract (76/76). Full
suite green.

**Live-verified on real data:** teleported next to Destard's mouth, pressed **north** → the party walked
onto the `OBJ_146` hole and **descended to Destard dungeon level 1 at (68,161)** (the /4 compression of
(284,657)); active level → 1, dev panel reads "(underground)", message "You enter." Drove the real keydown
→ `onMove` → `checkDungeonEntry` path, not the dev hook. Also added the dev hook `__U6.checkDungeonEntry()`
(parallels `__U6.checkGateEntry`).

**No new components, no `SNAPSHOT_VERSION` bump.** Reuses I-19's engine + I-moongate's post-move-hook pattern —
this is the symmetric other half of I-19's level-change subsystem.

## I-moongate scope — blue + red moongate subsystem — DONE (2026-06-13, a–e + g/h; f out of scope)

**Read `research_moongate.md` alongside this** — it has the full mechanism decode, the
real-save verification, the clone-reuse map, and the §7 sky-scene / §9 UI design. This
section is the sub-step ledger; the `research_moongate.md §N` pointers below resolve there.
Named **I-moongate** (no serial number, Zane's call — like `I-save/load`); **pulled out of
I-20** because it's a whole subsystem, not a single `USE` handler.

**What it is.** Two unrelated gate networks sharing the moon idiom — **blue** (`OBJ_055`):
the `D_2C74` 8-endpoint, lunar-phase-routed, *player-mutable* network (auto-spawned hourly;
walk-in → teleport to the phase-selected moonstone position; `USE moonstone` relocates an
endpoint). **red** (`OBJ_054`): the Orb of the Moons' (`OBJ_057`) *fixed-ROM* (`D_171C`),
*single-use* network. Plus a player-facing UI layer (sky view + gate readout) that makes the
blue network legible. The Vortex-Cube endgame (`OBJ_03E`) is a separate device — out of scope.

**Hard prerequisite already exists:** the clone's `WorldClock` (`resources/world_clock.js`)
carries `Time_H`/`Date_D` + an `onHour(cb)` hook — exactly what the moon phases derive from
(§3). **Verified vs Zane's real saves (§8.1):** a factory `objlist` ships `D_2C74` **empty**;
char-creation seeds it with the `D_2C4A.c` constants — so the clone's new-game-init must seed
`D_2C74` itself.

**Locked decisions (research + the 2026-06-13 chat):**
1. **Seed `D_2C74` from the compiled `D_2C4A.c` constants** at new-game-init (the `y` values —
   NOT the placed-stone positions at `y+1`; verified vs a created save, §8.1).
2. **Sky view → the clock-panel element (`textEl`)**, on its own row *under* the clock line;
   **gate readout → the dev-HUD stats element (`npcStatsEl`)** — both already separate DOM
   nodes in `view/dev_hud.js`. Dev HUD stays player-visible (clone ≠ 1:1 of the original). §9.
3. **Sky view = faithful in-game tiles** via `view/ui_icons.js tileIcon` (CPU pixels → palette
   → `<canvas>`), composited into the §7 scene — NOT Unicode glyphs.
4. **Skip the `D_2CC3` solo-mode gate** (no solo mode) + **hard-cut teleport** (no
   PartyEnter/Exit) — same kept-deviations as I-19.

**Sub-steps (a–h, dependency order). Each a save-point commit; squash at the end.
Browser-verify on real data per sub-step (the suite is node-less `tests/*.html`).**

- **a — Data + moon-phase resource.** Extract verbatim ROM: `D_2C74[8][3]` defaults
  (`D_2C4A.c:30-38`), the `D_036A[28][2]` calendar (`seg_0A33.c:684-713`), the
  `D_171C/174E/1780` red-dest tables (`seg_1E0F.c:12-34`). Add a moon-phase resource for
  `D_2CC6-9`. **Seed `D_2C74` from the constants** in new-game-init (alongside
  `applyNewGameDefaults`, `assets/objlist.js`) + persist it in the snapshot (like I-19's
  `loadedDungeons`). Object/tile IDs in §1. *No dep.*
- **b — Phase clock.** An `onHour` hook recomputing both moons: `D_2CC6 = D_036A[Date_D-1][0]`,
  `D_2CC7 = (D_2CC6*3 + 18 - Time_H) % 24`; same for `D_2CC8/D_2CC9` (+20). §3 (verified day-4/
  hr-8 → 6/4/6/6). *Dep (a).* Verify: resource values match §3's formula across clock times.
- **c — Blue-gate runtime (the meaty step).** Port `C_0A33_121A` (`seg_0A33.c:621`): on the
  hour-hook + on level/area load, for each of the 8 `D_2C74` slots on the active level + in the
  loaded area, spawn a blue gate (`OBJ_055` via `world_loader.js addMapObject`) when a moon is
  up (`D_2CC7<15 ∥ D_2CC9<15`), else delete. Gate-entry: port the `C_1E0F_184D` **blue** branch
  (`seg_1E0F.c:726`) into the post-move path — on the gate's **anchor cell**,
  `|7-D_2CC7|-|7-D_2CC9|` picks Trammel vs Felucca → `GateTravel` (`C_101C_0A3A`,
  `seg_101C.c:368`) teleports the party to `D_2C74[slot]` (reuse the I-19 `use_ladder` teleport
  pattern + `setActiveLevel` for the z=1 slot 6); incl. the **midnight-shrine override**
  (`00:00-00:09` → fixed `0x018,0x01d,1`). §4/§5. *Dep (b).* Verify: gates appear at the seeded
  positions; walking in lands at the phase-correct destination.
- **d — Bury / relocate (`USE moonstone`).** Port `C_27A1_3425` (`seg_27a1.c:1563`) as the
  `OBJ_049` USE handler in `systems/use_handlers.js` (same path as `use_ladder`/`use_drawbridge`):
  buryable tile (`TIL_001..007`/`TIL_010..06F`) → write `D_2C74[frame]=(x,y,z)` + move stone +
  avatar, else "Cannot be buried here!"; + GET clears the slot (`seg_27a1.c:887-891`). §6.
  *Dep (a); meaningful once (c) exists.* Verify: bury a stone → its blue gate relocates there.
- **e — Red gate (Orb of the Moons).** Port `C_27A1_5789` (`seg_27a1.c:2642`) as the `OBJ_057`
  USE handler: gated on `TalkFlags[5]` bit 5 (per Zane taught by **Lord British** — confirm via
  LB's script if needed, §10), prompt a 5×5 cell, spawn `OBJ_054` with `Qual` = the cell offset.
  Red-gate travel: the `C_1E0F_184D` **red** branch (`seg_1E0F.c:753`) → `PartyTeleport(D_171C
  [Qual-1], …)`; **single-use** (`PartyTeleport`/`C_101C_0828` deletes the source `OBJ_054`,
  §5.4). §2.2/§5.2/§6. *Dep (a); otherwise self-contained.*
- **f — (separate) Vortex-Cube endgame.** OUT OF SCOPE here — only when the endgame lands
  (`C_27A1_5FAC`, `seg_27a1.c:2882`). Listed for completeness.
- **g — Gate + phase readout → dev HUD.** A diagnostic line in `view/dev_hud.js`'s `npcStatsEl`
  block (beside `hours fired`): the two moons' phases + "today's gates → …" (the active
  `D_2C74` dests for Trammel/Felucca; **coords by default** — named locations optional, would
  need a name source). Text only. *Dep (b).*
- **h — Sky view → clock panel.** A composited sky strip on its own row **beneath** the clock
  line (`textEl`), via `tileIcon` composited into one mini-canvas, branching on `MapLevel.level`:
  **0/5 →** sky base (`TIL_19B`) + sun (`TIL_169/16A/16B` by hour) + the two moon glyphs
  (`reg.tileForObject(OBJ_049, D_2CC6/D_2CC8)`) + mountain (`TIL_160+`), arc-placed via `D_2BFA`;
  **1–4 →** cave backdrop (`TIL_174/175`), no sun/moons. Faithful tiles + faithful arc. Split by
  dep: **h1** (sun + backdrops + cave) needs only `Time_H`/level — **no dep on (b)**, can land
  first; **h2** (the two moon glyphs) needs (b). Honor **eclipse** (`TIL_16B` + moons hidden,
  `Date_D==1 && Date_M%3==0`). §7 (full scene) + §9 (h).

**Impl-notes (decided — don't re-litigate):** (1) (h) honors eclipse per §7; (2) **no `D_2C55`
tint** — faithful: the strip conveys time by sun presence/position, `D_2C55` drives *map*
lighting, not the strip; (3) (g) coords by default, named gates optional.

**Open (carry forward, §10):** the `TalkFlags[5]` Orb-enable event (Lord British per Zane —
confirm via the conversation script when (e) is built). `D_0658` (FindLoc anchor-tile index)
and the red dead-slots are already resolved in `research_moongate.md`.

**Shape:** the real subsystem is **(b)+(c)** (the blue runtime); (d) bury is a ladder-class
handler that rides on it; (e) red is self-contained (one handler + one fixed table); (g)/(h)
are the player-facing UI (gated only on (b); h1 not even on that). Nothing blocks on combat or
the endgame. Suggested order: **a → b → c → d → (h1 anytime) → h2/g → e**.

### As built (2026-06-13)

Landed a→e + g/h in one pass (Zane's cadence choice), squashed. **f (Vortex-Cube endgame)
remains out of scope.** Files:

- `assets/moon_tables.js` — verbatim ROM: `D_2C74` defaults (`D_2C4A.c`), `D_036A` calendar,
  `D_171C/174E/1780` red dests, `D_2BFA` arc, the obj/tile ids, the shrine override coord.
- `resources/moon_gates.js` — `MoonGates` resource: `D_2C74` (seeded from constants, persisted)
  + the moon SLOT/PHASE quad + `recomputePhases` (`seg_0A33.c:907-910`) + `isSlotActive`/`anyMoonUp`.
- `systems/moon_phase_system.js` (b) — `onHour` recompute + an initial sync (covers restore).
- `systems/moongate_runtime.js` (c/d/e) — `spawnBlueGates` (`C_0A33_121A`, reconcile), `checkGateEntry`
  (`C_1E0F_184D` blue+red), `gateTravel` (`C_101C_0A3A`), `partyTeleport` (`C_101C_0828`, red single-use),
  `useMoonstone`/`clearMoonstoneSlot` (`C_27A1_3425` bury + GET-clear), `castDi`/`castRedGate`/`useOrb`
  (`C_27A1_5789`), `installBlueGateSpawn` (hourly hook + level-change sync system).
- `systems/level_change.js` — extracted `teleportParty` (the I-19 hard-cut party move), now shared by
  `use_ladder.js` (refactored to call it) and moongate travel.
- `view/moongate_hud.js` (g/h) — `computeSkyScene` (pure, tested) + `installMoongateHud` (composited sky
  `<canvas>` via `tileIcon`, redrawn only on a scene-key change; the dev readout line).
- Wiring: `use_handlers.js` registers `OBJ_049`/`OBJ_057`; `command_dispatch.js` adds the GET-clear + the
  Orb 5×5 cast cursor (`armOrbCast`/`confirm`); `snapshot.js` adds `MoonGates.D_2C74` to SAVED_RESOURCES;
  `index.html` adds `#sky-view` + `#moon-readout`; `main.js` creates the resource + installs (b)/(c)/(g/h)
  + dev hooks (`__U6.moonGates`/`enableOrb`/`checkGateEntry`/`castRedGate`).

**Kept deviations** (so a later session doesn't "correct" them):
1. **Dropped source's `AreaX`/`AREA_W` spawn bound** (a DOS memory-streaming artifact). `spawnBlueGates`
   RECONCILES (delete strays + add missing) at **every active-level slot**, not just the ~40×40 window.
   Consequence: a relocated/cleared endpoint can't leave a stale gate (source's incremental form can), and
   an UNBURIED (all-zero) slot is **skipped** so dropping the bound doesn't spawn a junk gate at (0,0).
   Reproduces source's "immediate on area-load" (it spawns at `C_101C_0306:193` too) without coupling to
   region streaming. Re-run on the hour-hook + a per-turn **level-change watch** + after bury/GET.
2. **No `SNAPSHOT_VERSION` bump.** `MoonGates.D_2C74` is a SAVED_RESOURCES field that's **gracefully absent**
   in a pre-moongate save (restore's `!data` guard leaves the freshly-seeded canonical network) — same call
   as I-19's `loadedDungeons`. The moon PHASES are derived (recomputed on load), not saved.
3. **Map-based bury.** The clone's USE is cell-based, so `USE moonstone` fires on an adjacent GROUND stone
   (source also USEs from inventory — the inventory-USE front-end is deferred). Bury relocates the stone to
   the avatar's feet (source's `MoveObj` to `Party[Active]`).
4. **Shared `teleportParty` / `partyTeleport`.** `teleportParty` (level_change.js) = the I-19 hard-cut move,
   now shared by the ladder + gate travel. `partyTeleport` wraps it to also consume a source-tile red gate
   (`C_101C_0828`) — used by gate travel + the midnight override, NOT the ladder (`C_101C_089E` doesn't).
5. **Phase drift while idle** (accepted, Zane 2026-06-13): the wall-clock clock (I-14d) re-rolls the moons
   even while the player stands still; source only moves them on player action.
6. **`D_2CC3` solo-mode gate skipped** (no solo mode, as I-19); **music (`MUS_*`) deferred** (no audio).

**Orb gate (`TalkFlags[5]` bit 5):** kept faithful — set by Lord British's conversation (the clone's I-13
VM ports the `setFlag` opcode → `objlist.actors[5].talkFlags`, `conversation_system.js`). `__U6.enableOrb()`
sets it for testing without the LB talk. (The §10 open item — "confirm via LB script" — is resolved at the
*mechanism* level: the VM supports it; whether Zane's `converse.a` LB script emits `setFlag(5,5)` is data and
confirmable in a playthrough.)

**Verification:** 71 new unit tests (`tests/test_moongate.html`, browser/node-less) — phase math (all 28×24
day/hours incl. the negative-phase C-modulo case), spawn-reconcile (relocate/clear/idempotent/dungeon),
entry tiebreak + midnight override, bury/GET-clear, red `castDi` + travel + single-use, the sky scene
(sun/cave/eclipse/moon-hide), and D_2C74 persistence (incl. graceful old-save absence). Full suite **521/521**.
Live on real data: 7 surface gates at the exact endpoints; blue walk-in (day 4) → `(23,22,z1)` with the
active level switched to the dungeon; red cast 2-east (di 15) → walk-in → `D_171C[14]=(227,131,0)` + gate
consumed; sky strip + readout render correctly.

### Review fixes (2026-06-13)

After the implementation landed, Zane reviewed it live (red moongate + the UI confirmed by hand; blue
moongate left to in-play discovery — its walk-in→dungeon path was dev-verified, not manually played). The
review surfaced **6 issues, all fixed in this step** (per the working rule "we found it, we fix it" — they
predate moongate but were caught here, so fixed here rather than deferred). Each is its own commit on top of
`impl I-moongate`:

1. **Sky-strip sizing** (`423c6ce`) — the strip was too tall (28px native ×2 = 56px). Cropped to the visible
   band + the outdoor-only top gap, rendered 1× (144×16). The cave keeps its natural top margin (its tiles
   are top-cropped imagery; the outdoor crop is sun/moon-arc-specific — applied per scene in the blitter).
2. **Cursor/reach stale across a level change** (`1e2517e`) — USE a ladder down, then USE again without
   moving the mouse, hit "Out of range!": the dev-probe cached the hovered cell at mouse-move with a fixed
   1024 wrap, so after a teleport it was still a surface coordinate. Now derived on demand from the live
   camera + `MapLevel.tilesWide`; `__U6.probe` exposed. Also switched `command_dispatch`'s 1024 hardcodes
   (`withinReach`/`canPushTo`/`resolveMove`) to the active level — seam-only defensive (closed dungeons keep
   the 256-seam unreachable; the NPC-movement `0x3ff` is intentionally left for the same reason).
3. **Inventory USE verb `U` + Orb held-vs-ground gate** (`ba9ad12`) — a held Orb couldn't be USEd (the map
   `use` only targets a cell). Added `cmd.useItem(handle)` routing held items to the same `useHandlers`
   registry + a `U` verb in the inventory window. Ported the source gate that was missing: the Orb works
   only when HELD — on the ground it's "Not usable" (`seg_27a1.c:3109`, `GetCoordUse==LOCXYZ`/`D_0DDC[11]`).
   `useMoonstone` now drops a held stone at the avatar's feet (bury-from-inventory).
4. **Dialog closed before the final line was readable** (`bc7a46d`) — a script ending right after a `say`
   with no trailing `WAIT` (e.g. Geoffrey's "speak to Lord British first" + `LEAVE`) flashed its last line +
   closed on the same click. `drive()` now pauses once before closing when the last effect was an
   unacknowledged say (source holds the final line until the player dismisses the conversation).
5. **Dialog didn't auto-scroll to the latest line** (`d654053`) — a long line that wraps + first pushes the
   flex text box past the 80vh cap finalized its height a layout pass after the line appended, so the
   synchronous `scrollTop = scrollHeight` landed short. Re-assert in `requestAnimationFrame`.
6. **NPC name not revealed once "known"** (`ae73adf`) — the dialog header showed the generic look string
   ("musician") for the whole talk. Source shows generic until `TalkFlags` bit 0 is set — only by the
   script's `SET self 0` (`seg_1703.c:868` OP_SET; read at `seg_16E1.c:76`; **no engine auto-set** — verified
   by decoding LB / Nystul / Kenneth) — then the real name (the script's `$N` / party `Names[]`). The host
   recomputes the header each effect; `ui.setName()` added. Verified "musician"→"Kenneth" (#11) via the real
   VM flow. (The mage at LB's left, #6/Nystul, is a quest-intro NPC with no name keyword → stays "mage" in
   source too; LB's name block has no SET — his look string is already "Lord British".)

**Follow-up (2026-06-14) — item 7**, surfaced while documenting the Orb destination table
(`research_moongate.md §2.3`) + the blue-gate player-facing model (`§11`):

7. **Blue gates were treated as authored/saved data, not derived state** (its own commit,
   below this review in history) — `spawnBlueGates` reconstructs every blue gate from
   `D_2C74` + moon phase, yet the objblk loader and the snapshot still *also* loaded/saved
   `OBJ_055` entities. A *played* save's objblk gate (or a restored snapshot gate) at a
   still-active endpoint would sit beside the reconstructed one, and the reconcile **can't
   dedupe two gates on one cell** → permanent duplicate. Fix: skip `OBJ_055` on objblk-load
   (`world_loader.spawnObjblkRecords`) + in serialize (`snapshot.serializeWorld`); red gates
   (`OBJ_054`) untouched (genuine objects). **No `SNAPSHOT_VERSION` bump** — the persisted
   state set is unchanged, so old saves' serialized gates restore-then-reconcile and new
   saves' absent gates rebuild from `D_2C74` even on old code (bumping would needlessly
   reject v2 saves). `research_moongate.md §4.1`; +2 snapshot regression tests.

**Suite after the review: 527/527** (75 moongate; +4 inventory-USE held-bury + Orb-ground-gate;
+2 the 2026-06-14 derived-gate skip, item 7). Cross-PC commit chain in [[reference_cross_pc_sync_state]].

## I-egg scope — egg / creature-spawn system — COMPLETE 2026-06-14 (a · b · d-visual · c · e · f)

Port of U6's EGG module (`seg_2E2D.c`, `OBJ_14F`). Built **a → b → d-visual → c → e → f**,
one save-point commit per sub-step (squashed to `impl I-egg`). All in `systems/egg.js` +
the `Spawned` component; the only shared-code edits are the `Spawned` registration
(`main.js` + `components.js`), the passability occupancy/self-exclusion, and the
`teleportParty` hatch/cull hooks. Research + decided model: `research_egg.md` (§1 data, §3/§4
mechanics, §9.1 spawn/cull, §10 build shape). **Suite 674/674** (527 prior unchanged + 147 new
`tests/test_egg.html`).

**As built, per sub-step:**

- **a — data + decode** (`0e43715`). `decodeEgg`/`decodeEmbryo` (Qual/Quan → time gate /
  alignment override / hatch chance · count / AI mode / mutant) + the world read path
  (`readEgg`/`findEggs`/`isEgg`) over I-6 containment. Validated live against the factory throne
  egg `(307,350)` = `0x20` un-hatched, `Quan100/Qual2`, embryo `OBJ_16B Quan3/Qual8` (§7/§8).
- **b — hatch core** (`53b2ddd`). `hatchEgg` = `EGG_hatches` (`seg_2E2D.c:203-365`) minus the
  stat roll + multi-tile bodies: Armageddon/day-night gates (early-return, no latch), re-hatch
  gate, hatch roll, embryo loop (firstborn-on-cell + ±3 `scatterCell` = `COMBAT_TryTeleport`
  analog), `Qual%10` alignment override, embryo-`Qual` AI-mode stamp, **unconditional**
  `SetHatched`+`SetInvisible`. `spawnCreature` = a placeholder (no stats — d-stats deferred)
  tagged `Spawned` + `MoveSpeed(REF_DEX)`+`Destination` so any AI mode ticks without a retrofit.
  New `Spawned` component (cull key + occupancy; auto-persists, **no `SNAPSHOT_VERSION` bump** —
  MoonGates/loadedDungeons precedent). Live: factory throne egg → 3 EVIL AI_ASSAULT gargoyles.
- **d-visual — multi-tile bodies** (`8aa5c01`). `buildMultiTileBody` assembles linked part-
  entities for ~25% of hatches (full-world scan: 234/943 eggs): dragon `OBJ_19B` (body + head/
  tail/2 wings), hydra `OBJ_176` (body + 8 heads), silver serpent `OBJ_19D` (curl), tangle vine
  `OBJ_16D` (+4 tentacles), two-part `≥OBJ_1AA` (body f6 + east part). **Winged gargoyle
  `OBJ_16A` = a single 2×2 footprint-sprite (frame 0x13, no parts)** — confirmed by a tile-flag
  probe (only 0x16A f0x13 is dW+dH; all other part frames single-cell, so source's multi-object
  == multi-entity). Parts: `Spawned{body,ox,oy}`, block + cull-with-head; a follow pass tracks a
  moving head; `canStandAt` excludes a head's own parts (`body===actorId`) so a grazing cow
  doesn't self-block. **Bug caught live**: firstborn is once-per-EGG not per-embryo
  (`seg_2E2D.c:247`) — the dragon+drake egg had stacked both on the egg cell. Live: dragon egg →
  5-part body renders as one creature.
- **c — avatar-keyed trigger** (`e48a6a8`). `hatchAroundAvatar` = `EGG_hatchArea` keyed on the
  AVATAR not the camera (§9.1 pt 1): scans eggs within `scanRadius` and hatches those past
  `EGG_hatchArea`'s gate (`:381` — force OR off-screen `>nearRadius` OR LOCAL). Wired at boot
  (the start area → throne ambush auto-fires), every avatar move (live pos, after
  `checkGateEntry`), and `teleportParty`'s tail with `forceHatch` (the source `:315` PartyEnter;
  ladder + both moongate nets land there). Live: camera-pan loads region 34 but the dragon egg
  stays `0x0` (panning never hatches).
- **e — cull + re-arm** (`e109650`). `cullAroundAvatar` = the avatar-keyed stand-in for the
  stream-out `C_1184_19AA`: reap `Spawned` creatures beyond `cullRadius` (outer ring of the
  two-radius hysteresis), and for far eggs delete LOCAL (one-shot) / clear HATCHED on non-LOCAL
  (`ClrHatched` = wilderness respawn). Parts cull with their head; orphans reaped; permanent
  NPCs/party never touched. Both avatar passes early-return when `Spawned` is unregistered (keeps
  `teleportParty` safe in minimal test worlds). Live: the boot throne ambush is fully reaped once
  the avatar leaves; hatch→leave→return re-hatches a fresh pack.
- **f — pacification + warning** (`7fe15aa`). `shouldPacifyGargoyles` = the real scan
  (`seg_2E2D.c:231-239` — gargoyle-in-party OR Amulet of Submission `OBJ_04C`, chain-walked
  through bags) → gargoyle embryos hatch `AI_GRAZE`. Shamino's approach warning
  (`seg_2E2D.c:351-360`): `hatchEgg` returns `atkplr` (`Is_ATKPLR` = alignment & EVIL-bit on a
  non-LOCAL egg); `hatchAroundAvatar` fires a once-per-session direction call-out when Shamino
  (slot 3, within 6) is near, gated by the 3/4 roll.

**Kept deviations (so a later session doesn't "correct" them):**
- **d-stats deferred** (combat): no `EGG_generate` `mkRandom` stat roll / `D_3522` tables /
  `C_2E2D_00BE` loot. `spawnCreature` is a placeholder; class-default alignment falls back to
  NEUTRAL when the egg gives no `Qual%10` override (which slightly under-fires Shamino's warning
  for `Qual%10==0` eggs). **No combat** — hostile AI modes (AI_ASSAULT etc.) are stamped but
  idle until handlers land (§9.1 pt 5); implemented I-16/I-17 worktypes (GRAZE/WANDER/…) apply
  automatically.
- **Avatar-keyed, not region-stream** (§9.1): the clone keeps regions resident, so hatch/cull
  key on avatar distance (`nearRadius`/`scanRadius`/`cullRadius` from the live `Viewport`), not
  source's `±20` active-window stream in/out. Camera pan never hatches.
- **`Spawned` tag** replaces source's 256/3072 slot table + 32-slot monster pool; multi-tile
  PARTS are `Spawned` map objects (status 0, source's `ClrLocal`), culled with the head via
  `Spawned.body`. Single `MoveSpeed`/`Destination` on every spawn (lean future-proofing).
- **Boot auto-hatch**: loading the game fires the throne-room ambush (the avatar's start area =
  "entry into new territory"). Faithful to source's area-load hatch; the 3 gargoyles stand idle
  (no combat).
- **Shamino warning text is clone-authored** — the source format string (`D_356A_0128`) is
  packed message data not decoded here; once-gate is a module flag (resets on page boot, which
  is also when save-load restores, so no explicit reset hook).

**Review finding (2026-06-14, Zane play-test) — the force-field moonstone shrines are an I-20
follow-up, NOT a combat gap.** Walking a gargoyle-guarded moonstone shrine (e.g. `(503,359)`:
Shrine `0x189` + Moonstone `0x049` frame 1 + Force Field `0x033` co-located, with a non-LOCAL
gargoyle egg at `(503,361)`) shows the gargoyles **respawning every return** — which is *correct*
I-egg behaviour (non-LOCAL re-arm). The moonstone is freed NOT by combat but by the **rune+mantra
puzzle** `C_27A1_4B98` (`seg_27a1.c:2295`, dispatched from `USE` on the 8 virtue runes
`OBJ_0F2..0F9` at `:3125`): USE the matching virtue Rune adjacent to the stone, type the mantra
(`D_1D0F[virtue]`); if a moonstone in the 3×3 has **frame == the rune's virtue index**, it
`DeleteObj`s the Force Field (`OBJ_033`) **and** calls `C_27A1_4B0B` to destroy the gargoyle egg
(the ONLY `OBJ_033` removal in all of source — combat never touches it). For `(503,359)`: frame 1
= Compassion → Rune of Compassion `OBJ_0F3` + mantra "Mu". **Missing piece = the rune USE handler
(I-20)** + a mantra text-input prompt (the one genuinely new UI bit); the egg-destroy half
(`C_27A1_4B0B`) is now trivial via `findEggs`+`deleteMapObject`. So I-egg is complete + faithful;
the shrine scene just isn't *completable* until that I-20 handler lands.

## I-book scope — book / sign reading (`BOOK.DAT`) — COMPLETE 2026-06-16

Completes the **LOOK** verb. I-10f deliberately shipped LOOK as a pure "Thou dost see …" scroll line
and **deferred** the one structured branch source's LOOK has: reading a book or sign. This step ports
that branch.

**Source mechanism (`seg_27a1.c`).** Inside the LOOK command handler, `C_27A1_06D7` ("CanRead?") tests
the object's type against two fixed 5-entry tables; if readable **and** the object has a **non-zero
quality**, `C_27A1_078F` reads `BOOK.DAT` and prints the text:
- `di = GetQual(obj)` — the object's **quality is the book index**.
- `OSI_read(file, (di-1)<<1, 2, &off)` — a **u16 little-endian offset table** (entry per book).
- `OSI_read(file, off, 0x2800, buf)` — the **NUL-terminated text** at that offset. **No compression**
  (unlike `converse.*`/`portrait.*` lib_32 LZW).

**Readable-type tables (ported verbatim):**
- **`D_1CDA` books** (`C_27A1_066D`, readable only when **adjacent** — source also allows carried books,
  deferred): `151` book · `61` Book of Circles · `152` scroll · `270` balloon plans · `59` Codex.
- **`D_1CE4` signs** (`C_27A1_06A2`, readable at **any range**): `332` sign · `333` gargoyle sign ·
  `143` picture · `254` cross · `255` tombstone.

**Files:**
- **`resources/books.js`** — `Books` (the offset-table reader). `count = firstOffset>>1`;
  `get(quality)` slices from `offsets[q-1]` to the NUL; `has(q)`. OPTIONAL data: `new Books(undefined)`
  / `<2` bytes → `count 0`, every `get` → null (the LOOK book-read no-ops).
- **`view/book_window.js`** — `openBookWindow(uiStack, title, rawText)`: a `.book-window` UIStack modal
  (flex column, inner-scroll like `.dialog-window`; Esc/↑↓/PgUp-PgDn). Renders the U6 inline markup
  carried in `BOOK.DAT`: `<…>` gargoyle/runic → a distinct `.book-runic` style (no rune font in the
  clone, so the transliteration stays readable); `@word` → `.book-hl` highlight; `*` → paragraph break;
  `&` (section marker) + `\` (plural marker) → **stripped**; `\n` → native line break (`white-space:
  pre-wrap`). CSS lives in `index.html` beside the `.dialog-*` rules.
- **`systems/command_dispatch.js`** — the `READABLE_BOOKS`/`READABLE_SIGNS` Sets + the LOOK-handler
  extension: after the "Thou dost see …" line, `readable = isSign || (isBook && withinReach)` and
  `quality>0` → `openBookWindow(uiStack, name, books.get(quality))`. Reads `quality` from the `Amount`
  store; `books` is a new dispatch dep.
- **`main.js`** — `const books = new Books(fileMap.get('book.dat'))`, threaded through `startRender`
  into `installCommandDispatch`; `book.dat` added to the **OPTIONAL** file set (loaded raw, never gates
  readiness); exposed as `__U6.books` for dev.

**Data:** `book.dat` is **OPTIONAL** BYO-data — gitignored / user-dropped, never committed (the legal
pattern). Absent → LOOK still names the object, just no modal.

**Bug fixed during the work (worth recording):** the deps object referenced `books` inside
`startRender`, but `const books` lived in `load()` — `books` wasn't threaded through `startRender`'s
parameter list, so `installCommandDispatch` boot-threw `ReferenceError: books is not defined`, halting
the load before the render loop (blank map, no `cmd`). Surfaced only because the throw was an
un-awaited-rejection (no console error); found by wrapping the call in a temporary try/catch. Fix =
add `books` to the `startRender` call + destructure. (`scripts`/`portraits` worked because they were
already threaded — the lesson: a new load()-scope value used by `startRender` must be passed through.)

**Verification:**
- `tests/test_books.html` — **19/19** (synthetic `BOOK.DAT` only; no game data): offset-table parse,
  `get`/`has` bounds (quality 0 / out-of-range → null), NUL-termination, newline survival, markup left
  intact for the renderer, and the absent/truncated-file inert paths.
- Live (real `book.dat`): LOOK at the **picture** by the throne (obj 143, quality 99) → modal "This is a
  very fancy portrait of you … signed 'Woodroffe'" (the artist self-portrait easter egg); the **Book of
  Circles** (quality 111) renders the gargoyle title/body in the runic style + the English `(Translation)`
  with `*` paragraph breaks, scrollable. No console errors.

**Kept deviations / deferrals (so a later session doesn't "correct" them):**
- **Display is a modal, not a console dump.** Source `CON_printf`s the text into the scroll; the clone
  uses a dismissable scroll modal (the modern-UX anchor). Behaviour (what's readable, keyed by quality)
  is faithful; presentation is modernized.
- **Books require adjacency; signs read at any range** — follows source (`C_27A1_066D` proximity gate
  vs `C_27A1_06A2` none). LOOK can target anything in view, so a distant sign is readable — minor, matches
  source's "signs always".
- **Carried books not read via LOOK** — source allows reading a non-LOCXYZ (carried) book; the clone's
  LOOK targets map cells, so reading from inventory is out of scope here.
- **Single-object read** — source's sign branch loops every readable at the LOCXYZ cell; the clone reads
  the one picked object (sufficient for the placed signs/books seen). 
- **Markup is best-effort, not a rune font** — gargoyle `<…>` is styled, not transliterated to runes;
  `&`/`\` control markers are dropped rather than interpreted (no count context for `\` plurals in static
  book text). Faithful to the *text*, modernized in *render*.

## I-container scope — USE-on-container (DONE 2026-06-17)

**As-built notes** (deviations from the literal plan below):
- **Module:** the handler lives in a dedicated `systems/use_container.js` (like `use_ladder.js` /
  `use_drawbridge.js`), not inline in `use_handlers.js` as the plan's prose said — because sub-step d's
  `canInsertInto`/`containerAtCell` are imported by `command_dispatch`, and a shared module avoids a
  `use_handlers → command_dispatch` import tangle. Registered via `registerUseHandlers` (one `registerUse`
  line). Exports: `useContainer`, `spillContents`, `canInsertInto`, `containerAtCell`, `CONTAINER_TYPES`.
- **Naming:** the spill loot list + the "You put *X* in *Y*." insert message need item names, so a single
  `name` closure (`withArticle(displayName(…))`) is threaded into the USE ctx from `command_dispatch` — NOT
  `reg`/`uiStack` (those were only the abandoned window route's need). The handler stays decoupled from the
  tile registry.
- **Verification:** `tests/test_container.html` 31/31 (pure logic) + in-game on real U6 data (closed chest
  with 10 items spilled; a key-locked + trapped chest force-opened, sprang, and spilled 4 items; a
  magic-locked chest force-opened; DROP put an item into an open chest; closed/no-nest/self rejected).
- **On-map guard (post-review fix):** `useContainer` refuses a container with no `Position` ("Nothing
  happens.") — source's `GetCoordUse == LOCXYZ` gate (`seg_27a1.c:3071`). The map USE path only picks
  on-map objects, but the inventory `U` verb (`command_dispatch.useItem`) routes a *carried* item here
  unfiltered; without the guard `spillContents` would read a missing `Position` and scatter the loot onto
  a stale `(0,0)` cell. (+3 guard tests.)

The rest of this section is the plan as built (sub-steps a–d landed as described).

A self-contained step covering the full container interaction: **USE** a chest/barrel/crate to open it and
**spill its contents onto the ground tile** (source-faithful — Zane 2026-06-17, after the window-vs-spill
fork — where the existing `GET` verb retrieves them), and **MOVE/DROP** an item onto an *open* container to
put it inside (sub-step d). The loop: open (spills out) → put items in → close (sealed). **Independent of
I-spellbook** — Telekinesis routes to the drawbridge crank (`OBJ_120` → `useCrank`), *not* a chest, so this
is standalone. Source: the chest handler `C_27A1_2BBC` ("use chest", `seg_27a1.c:1327`) + the shared
search/spill `C_27A1_09A1` ("Searching here, you find …", `seg_27a1.c:402`) + the USE switch
(`seg_27a1.c:3030-3075`); the insert half is `C_27A1_00A9` + `InsertObj(…, CONTAINED)` shared by MOVE
(`C_27A1_1E8B`) and DROP (`C_27A1_14DA`).

**The openable set** (the "pin the full set" item, resolved from the USE switch — `CONTAINER_TYPES`):
- `OBJ_062` (98, Chest) → `C_27A1_2BBC` → `C_27A1_09A1`. **Lockable + trappable.**
- `OBJ_0BA` (186, Barrel) and `OBJ_0C0` (192, Crate) → `C_27A1_09A1` directly (`seg_27a1.c:3030`). No
  lock, no trap — just search/spill.
- *Not* containers: `OBJ_129–12C` are the four **doors** (`C_27A1_2A44`, already `useDoor`); an earlier
  draft mis-listed them here.

**Chest frame model** (`C_27A1_2BBC` — corrected from an earlier draft's inversion): frame **1 = closed**,
**0 = open**, **2 = key-locked**, **3 = magically locked**. Plain USE *toggles* closed(1)↔open(0); the
spill + trap fire on the closed→open (1→0) transition. (The "`0→1` closed→open" and "`di>=8 && di<0xc`
locked range" framings were wrong — the latter is the *door* handler `C_27A1_2A44`'s range, not the
chest's.) Barrel/crate carry no lock state — USE always spills.

**What already exists (reused, not rebuilt):** `dropToMap(world, item, x, y, z)` (`world_loader.js:309`)
strips `ContainedIn`, adds `Position`, and spatial-indexes — the exact re-parent the DROP verb uses, so
**spill = `dropToMap` each child onto the container's cell.** `inventoryOf(world, container)`
(`world_loader.js:398`) enumerates the contained children; the `get` verb already retrieves ground items
(`moveToInventory`); `setObjectFrame` flips the frame; the snapshot persists the spilled items for free
(they're ordinary map objects now). So the gap is just the USE→open wiring + the spill loop + the message
+ the chest frame/lock/trap logic. (**No `uiStack`/`reg` ctx threading** — that was only for the
abandoned window route.)

**Sub-steps** (each ≈ one save-point commit; browser-verify; squash → `impl I-container`):
- **a — handler + frame toggle.** `CONTAINER_TYPES = {0x062, 0x0BA, 0x0C0}`; register `useContainer` in
  `systems/use_handlers.js`. Chest: toggle frame 1↔0 (`C_27A1_2BBC`) — on open→close print "You close the
  chest.", on closed→open fall through to the spill (step b). Barrel/crate: always spill. *Verify:* USE a
  chest → frame flips + message.
- **b — spill the contents (`C_27A1_09A1` port).** On open, `dropToMap` each child of
  `inventoryOf(container)` onto the container's cell, **skipping `OBJ_150` ("Charge") / `OBJ_151`
  ("Effect")** (lock/trap pseudo-items, not loot — source's `seg_27a1.c:440` filter). Print **"Searching
  here, you find a *X*, a *Y* and a *Z*."** (the source comma/" and " join), or **"…you find nothing."**
  when empty (`seg_27a1.c:464`). (Source's `MoveObj(avatar,…)` re-assert per item is a render quirk —
  skipped.) *Verify:* a chest's contents drop to the floor; `GET` picks them up.
- **c — lock + trap.** Locked chest (frame 2/3): first **scan the party for the matching key** — source's
  `C_27A1_2D8E` rule (`seg_27a1.c:1410-1427`): a key `OBJ_040` whose quality matches the chest's *nonzero*
  lock quality, or a lockpick `OBJ_03F` on a quality-0 lock. Party scan = recurse over each
  `world.query(PartyMember)`'s inventory, drilling into `Container`-tagged bags (the `inventoryOf` +
  `Container`-gate recursion already in `inventory_picker.js:117`), so a key inside a pack still counts. **Key found →
  unlock + open + spill cleanly** (no "force" message — e.g. "You unlock the chest."). **No key →
  force-open bypass:** "You force the chest open." + spill — the **same TEMPORARY LOCK BYPASS as `useDoor`**
  (`use_handlers.js:28`); a magically-locked chest (frame 3) always lands here (a key can't open it in
  source, and there is no magic-unlock yet). The lockpick break-chance (`C_27A1_2D34` dex test) is the one
  faithful detail deferred — the auto-scan never breaks the pick. Trapped chest (a contained `OBJ_151` of
  quality `SPELL_16` = `0x16`): on the open transition print **"You spring a trap!"** and consume the
  marker (`DeleteObj`, `C_27A1_28A3:1274`), but **do not apply the damage** (`C_27A1_28A3`'s
  Acid/Poison/Bomb/Gas need the combat subsystem — deferred, consistent with I-egg's "NO combat"). The
  trap is orthogonal to the lock — it springs on *any* open (key or force). *Verify* with a chest you hold
  the key for (opens clean), a locked chest with no key (force-open), and a trapped chest.
- **d — insert into a container (MOVE-push + DROP).** The other half of the interaction: putting items
  *into* a container. Port `C_27A1_00A9` ([seg_27a1.c:51](../u6_decompiled/SRC/seg_27a1.c)) as
  `canInsertInto(container, item)` — container objNumber ∈ the `D_1C00` set (`C_27A1_0082`) **minus** the
  two non-droppable ones: **Backpack `063` / Bag `0BC` / Basket `0BF`** (always accept) + **Chest `062` /
  Barrel `0BA` / Crate `0C0`** (accept only when OPEN, frame 0) + **Vortex Cube `03E`**; AND the item
  isn't itself a chest/barrel/crate (no nesting those); AND item weight < 255. Spellbook `039` + Dead Body
  `153` are containers (lootable) but **not** drop-targets (source excludes them). Wire into both verbs,
  each replacing its ground-placement call with the insert when the destination holds an accepting
  container:
    - **MOVE-push** (`C_27A1_1E8B:1011`): in `resolveMove`, if the push-destination cell holds an
      accepting container → `moveToInventory(world, movedObj, container)` instead of `moveMapObject`.
    - **DROP** (`C_27A1_14DA:778`): if the drop cell holds an accepting container →
      `moveToInventory(world, item, container)` instead of `dropToMap`. (Target a container cell even when
      it's not `canStandAt` — source gates on the container test, not standability.)
  `moveToInventory` (strip `Position`+spatial → `attachToHolder` as INVEN child, `world_loader.js:270`) IS
  the `InsertObj(…, CONTAINED)` analog. Message: "You put the *X* in the *Y*." *Verify:* open a chest →
  MOVE/DROP an item onto it → it's inside (re-open spills it back out); a *closed* chest refuses (item
  pushes to the cell / drops on the ground). Deferred (faithful): the throw-and-break-if-fragile branch
  (`C_27A1_012C` breakables × missile distance), the stackable give-into-container quantity merge
  (`GiveObj`/`TakeObj`, the `bp_04` arms), and `SetOkToGet` anti-theft (moot until karma).

**Kept deviations:**
- **Locked chests: a matching key in party inventory opens them cleanly; only a *keyless* chest
  force-opens** (message-but-don't-enforce, mirroring the door's temporary lock-bypass). The handler
  auto-scans the party for the key (the faithful `C_27A1_2D8E` quality match) rather than requiring the
  player to USE-key-on-chest; the full USE-item-on-target front-end + the lockpick break-chance stay
  deferred. Magically-locked chests always force-open (no magic-unlock yet).
- **Traps detected + messaged + consumed, but damage not applied** — no combat subsystem yet; revisit
  when combat lands.
- **Frame model is faithful** (chest closed-1/open-0/locked-2/magic-3, toggle); barrel/crate are
  search-only with no lock state.
- **Display = spill-to-ground, not an inventory window** — this IS the source behavior (`C_27A1_09A1`),
  *not* a deviation; recorded here because the clone's container data model (Container/ContainedIn +
  `openInventoryWindow` drilling) could have supported a window, and the window route was explicitly
  rejected for source-faithfulness.
- **Bag / backpack / basket are intentionally NOT USE-openable** (confirmed faithful, Zane 2026-06-17).
  Source has no USE case for `OBJ_063`/`OBJ_0BC`/`OBJ_0BF` — they appear only in the `D_1C00`
  container-type table (`seg_27a1.c:36-37`), never in the USE switch; U6 opens these portable containers
  via the container/inventory window, not a USE-spill. In the clone they open via the inventory-window
  drill-in (I-18: GET the bag → Enter to drill in). They DO accept inserts (sub-step d). **Don't add a
  USE-on-bag handler** — it was considered and rejected as unfaithful (parallel to I-19g's "no
  USE-on-hole").

## I-spellbook scope — minimal `c` cast (DONE 2026-06-17)

**As-built notes** (deviations from the literal plan below):
- **Modules:** `resources/spells.js` (the verbatim `SpellName` / `Reagents_needed` / `Reagents_name`
  / `ReagType` tables + pure accessors), `view/spellbook_window.js` (the `c` modal — a **bespoke**
  grouped list, NOT `makeListCursor`, because of the per-circle headers; reuses the `.ui-*` classes),
  `systems/cast_spell.js` (the spell registry + the no-cursor + Gate-Travel effects).
- **Telekinesis + Unlock Magic live in `command_dispatch`, not `cast_spell`:** they resolve at a picked
  cell, and Telekinesis's push reuses MOVE's stage-2 (`awaitingDir`) machinery which is command-dispatch-
  internal. So the cast effect just CLOSES the book + arms the cell cursor (`ctx.armSpellCursor` →
  `cmd.armSpell`, `pendingVerb='spell'`), and `command_dispatch.runSpellTarget` does the per-cell effect
  (lever/crank trigger via the `useHandlers` registry · plain one-tile push · magic-lock frame flip).
  `resolveMove` gained a `plain` flag so the Telekinesis push is a bare `moveMapObject` with **no**
  container-insert (source's Telekinesis `MoveObj` has none).
- **Locate origin:** the camera's top-left tile (`floor(cam.worldX / ts)`) is the clone's `MapX/MapY`.
  After a manual drag-pan it reads where you're *looking* (source can't drag-pan → always avatar-centred);
  ≤1 sextant-unit difference (research §3.2). Output uses `°` for source's `{` degree glyph.
- **Mass Awaken:** a NO-target avatar-centred area, **radius 5** (a clone constant — source missiles a
  cell + an Explosion AOE); clears `AI_SLEEP` → `AI_SCHEDULE` on the active level only.
- **Create Food:** a new food stack per cast (no `GiveObj` stack-merge — deferred, as for GET). Added
  `world_loader.giveToInventory` (the off-map `addMapObject` analog) as the GiveObj primitive.
- **`c` key** is wired in `main.js` (gated like `I`: no modal / not dragging / no verb pending); the
  reagent tint scans the party's carried reagents (recursing bags) — informational, no gate.
- **Verification:** `tests/test_spellbook.html` **34/34** (ROM data + cast registry + the no-cursor
  effects + the targeted/digit delegation); the **full suite is green** (18 harnesses, ~773 checks, no
  regression from the `command_dispatch` / `world_loader` changes); live — `c` opens the book on real U6
  data (80 spells, 7 starred, reagent tint, Esc closes). The per-cell targeted effects (lever/crank
  trigger · push · magic-lock flip · gate travel) are exercised **live** (they need the running game +
  a far lever / a magic-locked object / a buried endpoint) — left for Zane's review so a factory save
  stays untouched.

The rest of this section is the plan as built (sub-steps a–c landed as described below).

## I-spellbook plan — minimal `c` cast

A deliberately *limited* cast feature: `c` opens a spellbook modal listing **all** named U6 spells (8
circles, reagents shown); `Enter` casts. Only **7 non-combat spells** that hook already-ported subsystems
do anything — Telekinesis · Locate · Gate Travel · Heal · Mass Awaken · Create Food · Unlock Magic — the
rest **fizzle**. NOT a magic system, NOT combat. Full source grounding + per-spell decode + kept
deviations live in `research_spellbook.md` (verified against `seg_1944.c`, 2026-06-17); this is the
sub-step cut. **No** spellbook-item / reagent gate / mana / INT-circle gate.

**What already exists (reused, not rebuilt):** the **UIStack + list-widget** substrate (inventory/dialog
windows); `command_dispatch`'s **cell-cursor** (`pendingVerb`, armed for targeted verbs) + the digit-input
shape (dialog window); **I-moongate** `D_2C74` + `teleportParty`/`GateTravel` (Gate Travel);
**`useLever`/`useCrank`** (Telekinesis lever/crank branches); **`moveMapObject`/`canPushTo`** (Telekinesis
push); the door/chest **lock frame** model (Unlock Magic); `AI_SLEEP` (Mass Awaken); objlist HP +
`stat_formulas.maxHP` + the `party_status` roster picker (Heal); `MessageLog`. So most of I-spellbook is
data + UI + wiring, not new engines.

**Sub-steps** (each ≈ one save-point commit; browser-verify; squash → `impl I-spellbook`):
- **a — data resource + the book UI (all fizzle).** `resources/spells.js`: extract `SpellName`,
  `Reagents_needed`, `Reagents_name`, `ReagType` **verbatim** (`seg_1944.c:143/255/242/253`; 16 slots/
  circle = 10 named + 6 empty; `MK_CIRCLE(n)=n/0x10+1`). The `c` modal (`view/spellbook_window.js`): a
  scrollable list grouped by circle header, each row = spell name + reagent abbrevs, **★** the implemented
  7; footer = full reagent names + a one-line desc + key hints; each reagent **tinted by whether the party
  carries it** (`ReagType`→obj#→party scan, informational only — no gate). ↑↓/Enter/Esc via the list
  widget. Every spell **fizzles** ("Nothing happens.") this step. *Verify:* `c` opens, lists all 8
  circles, reagent tints track carried reagents.
- **b — cast registry + the no-cursor casts** (Locate · Mass Awaken · Create Food · Heal). A spell
  registry keyed by spell number (mirrors `useHandlers`), dispatched on Enter. **Locate** → sextant
  readout from the **viewport origin** (NOT raw avatar pos — `research §3.2`) → `MessageLog`. **Mass
  Awaken** → clear `AI_SLEEP` on NPCs in the avatar's area window. **Create Food** → add food to inventory.
  **Heal** → `party_status` roster picker → restore HP, clamp to `maxHP` (party-only = a targeting
  deviation, `research §3.4`). *Verify:* each fires; the rest still fizzle.
- **c — the cursor + digit casts** (Telekinesis · Unlock Magic · Gate Travel). Close the book, arm the
  cell-cursor with `pendingVerb='spell'`. **Telekinesis** (`research §3.1`): pick an object at range →
  lever `OBJ_10C`→`useLever`, crank `OBJ_120`→`useCrank`, else **push one tile** in a chosen direction via
  `moveMapObject` (NOT the MOVE-insert path — keep source's plain relocate; skip the missile/LOS).
  **Unlock Magic** (`research §3.7`): pick a door/chest at range → if magic-locked (door `frame&0xc==0xc`
  / chest frame 3) flip to closed-unlocked, else fizzle. **Gate Travel**: a 1–8 phase digit prompt → if
  `D_2C74[phase-1]` is set, `teleportParty` there, else fizzle. *Verify:* a far/blocked lever opens
  (the Telekinesis payoff); a magic-locked chest/door unlocks; gate-travel to a set phase lands.

**Kept deviations** (full list `research_spellbook.md §7`): no spellbook-item / reagent gate / mana /
INT-circle gate / combat; Telekinesis skips missile+LOS and routes its push to a plain relocate (no
container-insert); "Awaken" = **Mass Awaken** (no single-target Awaken in source); Heal targets party-only
(source targets any creature at range); Unlock Magic clears the magic-lock faithfully but is partly
redundant under the door/chest force-open bypasses until those revert; reagent tint is informational only.
