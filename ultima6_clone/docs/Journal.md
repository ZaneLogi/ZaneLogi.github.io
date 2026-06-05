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

## 2026-06-05 — I-11 implemented (talk trigger)

Implemented the locked I-11 plan in one auto-mode pass (a = the `Alignment` carry, b = the
`T` verb front-end, c = the `canTalk` gate), browser-verified each on real Britain data, and
committed a/b/c as separate commits (per I-9; not pushed — Zane reviews first). The
per-sub-step breakdown + the verification matrix live in `progress.md §"I-11 scope"` — this
is the discovery note.

- **Surprise (cost a debug loop):** a new component not added to `main.js`'s
  `registerComponent(…)` chain makes `world.add` throw "component not registered" deep in
  `loadActors`, and boot halts **silently** — the page log freezes at "Decoding…" with no
  console error. The 11 already-set `__U6` keys pinned the stall to the exact `loadActors`
  line; the fix is one `registerComponent(Alignment)`. Recorded in progress.md + CLAUDE.md.
- **Confirmed against source while porting:** `IsAsleep` and the schedule worktype really are
  set in lock-step at `__AtDestination` (`seg_1E0F.c:1014-1033`), so the `AIMode.AI_SLEEP`
  proxy is exact, not a shortcut.
- **Next**: I-12 (dialog window) — swap `openConversation`'s body for the second UI surface.

---

## 2026-06-05 — TALK branch + the NPCStatus drop (pre-I-11)

Reading the TALK verb end-to-end before implementing I-11, then a detour Zane forced: the
NPC status byte the clone parses but throws away.

- **Read**: the full TALK path — `T`→`CMD_83` cursor setup (`seg_0A33.c:1061`), the shared
  targeting block dispatch (`seg_0A33.c:1245-1267`), `TALK_talkTo` (`seg_16E1.c:60-88`),
  `TalkDriver`'s precondition gate (`seg_1703.c:1022-1079`), the cell-pick `C_2337_08F1`
  (`seg_2337.c:365`), the `SelectRange` cursor cap (`seg_0C9C.c:1229-1247`), and the
  `NPCStatus` macros + writers/readers (`u6.h:113-155`, `seg_1E0F.c:1014-1033`, `seg_2337.c`,
  `seg_1944.c`).
- **Found**: (1) TALK's reach is **7** (`SelectRange=7`), the DROP/ATTACK reach — NOT
  adjacency-1; `TalkDriver` adds no further range check. So TALK is single-stage + reach-7,
  correcting the earlier "two-stage seam reusable for TALK" plan note. (2) `NPCStatus` is a
  **distinct array from `ObjStatus`** — 7 packed concerns (PLRCONTROL / alignment / DEAD /
  ASLEEP / POISONED / PARALYZED / PROTECTED). The clone *decodes* it (`objlist.js:42`) but
  `world_loader.js` **drops it**. Two bits are already re-encoded (PLRCONTROL→PartyMember,
  schedule-ASLEEP→`AIMode.AI_SLEEP` — source sets `SetAsleep` + `NPCMode=AI_SLEEP` in
  lock-step at `__AtDestination`, so the worktype is an exact proxy). (3) **alignment** is the
  only genuinely-dropped *static* shipped data; its ~40 readers are ~90% combat — the TALK
  evil/chaotic gate is 1/38 and degenerate (you don't chat with trolls). So alignment is a
  combat concept, deferred-with-combat — EXCEPT the talk gate is an in-scope reader now → carry
  it now (cheap, data already parsed) to avoid a forgotten deferral.
- **Docs**: `research_object_interaction.md` §"Talk" (new); `research_save_load.md` §"NPCStatus
  decomposition" (new — 7-bit table → owning subsystem + consumers + save-roundtrip caveat);
  `progress.md` Talk-arc header + locked I-11 sub-steps (a Alignment carry / b talk front-end /
  c canTalk gate + openConversation seam) + kept deviations.
- **Open**: the deferred gate arms (dead / paralyzed / poisoned / combat-mode) ride their
  subsystems, tracked per-bit in the NPCStatus decomposition; `Alignment` is load-only until
  its mutators (party join/leave I-13, charm/combat) land.
- **Next**: implement I-11 a→b→c (auto mode), one commit per sub-step.

---

## 2026-06-05 — Persistent NPC inspection helpers (dev tooling)

While validating the render-to-fit teleport guard I'd been driving the live game with ad-hoc
preview-eval (inspect an NPC's schedule, classify teleport vs snap, check dungeon levels).
Zane: "the schedule inspection tool is good — if it's persistent you don't re-invent it."

- **New `view/dev_npc_inspect.js`** (`installNpcInspect`, wired in `main.js` like
  installDevHud/Probe) attaches helpers to `window.__U6`. READ-ONLY:
  `inspectNpc(npcId)`, `scanDungeonSchedules()`, `teleportSuppressed(npcId)`. CAMERA-only
  (Zane add-ons, write the view not the sim): `lookAtNpc(npcId)` (pan once),
  `followNpc(npcId)` (track every frame via rAF) / `stopFollow()` — verified the follow loop
  re-centers after a nudge and stop releases it.
- **Dungeon caveat, quantified:** `scanDungeonSchedules()` reports **20** loaded NPCs that are
  on a dungeon level now or scheduled to one (gargoyles z=5, a fighter z=4, a horse z=2, …).
  Dungeon levels aren't loaded, so they don't render/tick and would teleport onto an unloaded
  level — exactly Zane's caveat. The tool surfaces them before any experiment picks one.
- `teleportSuppressed` models ONLY the visibility guard, not the unreachable-fallback snap
  (which ignores the guard by design). Verified live: helpers present after boot, no console
  errors, `inspectNpc(100)` = villager (406,604,z0, dungeonSafe).
- **Next**: I-11 (talk), or the deferred post-I-9 deviation audit.

---

## 2026-06-05 — Render-to-fit viewport (the shell fills the window)

A layout pass before starting I-11, prompted by Zane: the fixed ~1312×800 shell overflowed
his screen, so he had to pan the page to reach the panels.

- **Checked the legacy `ultima6/` port first.** Its `map_viewer.html` is a full-bleed
  `100vw×100vh` canvas with draggable floating tool windows (the "Dynamic Dock" the clone
  deferred at I-10a). More useful: `map_viewer.js`'s `resizeCanvas()` chose **render-to-fit**
  (`mapW = ceil(canvas.width/tileSize)`) AND pinned `const dpr = 1`, with the
  `devicePixelRatio` recipe staged-but-commented. We followed both choices.
- **Decisions (Zane):** render-to-fit over scale-to-fit; Design-1 buffer=CSS / dpr=1 (a
  HiDPI dpr pass is the named follow-up). The dpr=1 story: honoring dpr in a
  variable-viewport tile renderer would double the tile count and thread a dpr-scaled tile
  size through every pixel/mouse conversion — not worth it for nearest-neighbor pixel art,
  which stays clean on integer-dpr displays via `image-rendering: pixelated`.
- **Surprise: nearly free.** The render path was already viewport-driven —
  `render_system.js` / `world_render_system.js` recompute cols/rows from `canvas.width/height`
  each frame; only the fixed canvas buffer + the rigid CSS frame were "fixed."
- **The one real coupling — the teleport visibility guard.** Two parts followed the
  viewport: (1) the **radius** — hardcoded `TELEPORT_NEAR_RADIUS = 40` (its own comment said
  "revisit if the canvas size changes") moved onto the new `Viewport` resource (`nearRadius`,
  viewport-derived) so visible NPCs never pop on a big window. (2) the **center** — Zane's
  follow-up: it was the avatar, but the clone **drag-pans** (source can't), so a visible NPC
  in a panned-to region could pop. Re-centered the guard on the **camera's center tile**
  (`npc_tick_system.js`); tests fall back to the avatar (no camera registered). The per-NPC
  40×40 *pathfinding* window stays fixed (AI work-area, not a visibility bound).
- **Verified** live on real U6 data via preview-eval: boots clean (no console errors),
  `bufferMatchesCss` at every size, resize grows/shrinks the buffer (666×657 ↔ 1126×589),
  no page panning at 742 / 980 / 1400 / 1440.
- **Files:** new `resources/viewport.js`; `main.js` (fit + ResizeObserver); `index.html`
  (fluid grid); `systems/npc_path.js` (radius from `Viewport`).
- **Next**: I-11 (talk), or the deferred post-I-9 deviation audit.

---

## 2026-06-05 — I-10j: inventory window + DROP migration + give (auto-run)

- **Mode:** an auto-run session (Zane: auto-commit save-points, no squash, no push, terse
  bodies, docs folded into each commit). 4 steps → 5 commits (plan `6a60ef1` + steps 1-4).
- **Built** the verb-aware **inventory window** (`view/inventory_picker.js`
  `openInventoryWindow`, generalizing the I-10h picker): descriptive title (member /
  container name), `↑↓` highlight, `Enter` recursive container drill-in, a verb key
  (`D`/`M`) acts on the highlight via `onVerb(verb, item)` (pops the chain to root), a digit
  switches member via `onDigit`. Then: **digit-key open** (`main.js` top-row `Digit1`..`9`
  → `openMemberInventory`, dynamic to `PartySize`; numpad stays avatar diagonals);
  **member-switch with unwind** (a digit at any nesting depth pops to root + re-opens);
  **DROP migrated** off the `D` map-hotkey onto the window's `D` (→ `armDrop` → cell, the
  downstream unchanged; old `openInventoryPicker` retired); **give** = the window's `M` →
  `armGive(item, holder)` → recipient via a digit (main.js → `giveTo`) or a click on a
  party member (command_dispatch → `giveTo`) → `moveToInventory`.
- **Source basis:** number keys ARE party-member keys in U6 — `seg_0A33.c:1142`
  (digit = switch controlled member / `0` = party mode) + `seg_0C9C.c:1298` (digit picks a
  member during targeting). The clone has no solo/party-mode, so digits are **repurposed**
  for inventory-open (decision deferred to if/when solo-mode lands). Give = `C_27A1_1E8B`
  else-branch (`:1101-1118`); party members need no adjacency; refusals "yourself." / "Only
  within the party!". Max party = 8 (`JoinParty`, `seg_1703.c:226`).
- **Verified live** (preview-eval, real party Avatar/Dupre/Shamino/Iolo) at each step:
  titles + nav + drill (1); `2`→Dupre, drill, `1`→unwind+Avatar, numpad opens nothing (2);
  digit→window→`D`→drop Orb at a cell + restore (3); Dupre→Avatar give (digit) + Avatar→
  Dupre give (click) + both refusals (4). No console errors.
- **Deferred (faithful):** the `STREN×20` carry-weight gate, unequip-on-give,
  put-item-into-a-container, the `0` party-roster window, breadcrumb titles, portraits.
- **Next:** the post-I-9 deviation audit (deferred to after I-10), or further verbs / TALK.

## 2026-06-04 — I-10i: MOVE Mode 1 (push a ground object)

- **Verified source first** (the cross-PC note flagged "read `C_27A1_1DAB` at impl
  time, don't trust the doc"): `seg_27a1.c:953` `C_27A1_1E8B` is **dual-mode** — a
  `LOCXYZ` target = push (Mode 1), any other coord-use = give/transfer (Mode 2). Read
  the corner-clearance `C_27A1_1DAB` (`:924`): the destination must be passable AND, for
  a **diagonal**, ≥1 flanking cardinal passable (no squeeze through a wall corner);
  `C_27A1_1330` is the `IsTileSu` table-surface accept (deferred). Also confirmed
  `D_0DDC` (`seg_1944.c:372`) is the **terse result-code table** (Success/Failed/…/Blocked),
  not the U6-flavored strings the research doc had paraphrased — fixed that.
- **Impl** (Mode 1 only; Mode 2 = I-10j): `avatar_move_system.js` now **exports**
  `KEY_DIR`/`CODE_DIR` + `dirFromKeyEvent` (one shared keyboard→direction map);
  `world_loader.js` `moveMapObject` = source `MoveObj`; `command_dispatch.js` `m:'move'`
  + the move handler (pick + the `TypeWeight==0` fixed gate → arm a push direction) +
  `resolveMove` + `canPushTo` (the `C_27A1_1DAB` port) + a `confirm()` refactor + an
  `awaitingDir` **stage-2** keydown branch that `stopPropagation`s the direction key so
  the avatar (window listener, later in the bubble) doesn't also walk.
- **New targeting shape**: two-stage **object → direction** (vs DROP's object→cell). Arm
  `M` → pick the object (Enter/click) → an arrow/numpad key pushes it one tile.
- **Verified live** (preview-eval, real data, Lord British's castle): a chair pushed west
  one tile + "You move a chair."; the avatar stayed put through the direction key
  (stage-2 suppression works); blocked-direction / fixed-object (carpet) / out-of-range /
  `M`-arm-then-`Esc` all correct. World state restored after.
- **Docs**: `progress.md` §"I-10i — landed" (+ plan bullet, MOVE moved out of deferred);
  `research_object_interaction.md` §Move rewritten to the dual-mode truth + the verified
  `D_0DDC` table; `CLAUDE.md` status line; this entry.
- **Open**: Mode 2 (give) = I-10j; the `IsTileSu` surface accept + push-into-container +
  cannonball (`OBJ_0DD`) facing-frame + `SubMov(5)` deferred. Post-I-9 deviation audit
  still pending (deferred to after I-10).
- **Next**: I-10j (MOVE Mode 2 — give/transfer a carried item), or the post-I-9
  deviation audit.

## 2026-06-04 — I-10h: DROP (D → inventory picker → map cell)

- **Verified source first** (Zane asked "is the D→picker→cell flow like source?"):
  `seg_0A33.c:1088-1101` — the `'D'` case sets `SelectMode=2`, **`SelectRange=7`**, and
  `if (!IN_VEHICLE) StatusDisplay = CMD_92` — i.e. **pressing `D` switches the status
  panel to the inventory** so you pick what to drop, then `C_27A1_14DA` prompts
  "Location:" for a cell. So the flow IS source's: `D → inventory item → location`. The
  clone's modal picker = source's panel-switch; the cell range is **7** (kept).
- **Impl**: `world_loader.js` `dropToMap` (inverse of `moveToInventory` = `MoveObj`);
  `view/inventory_picker.js` (modal "pick one carried item", reuses `UIStack` /
  `makeListCursor` / `tileIcon` / `inventoryOf`); `command_dispatch.js` `armDrop` +
  the `drop` handler (reach 7 via `VERB_REACH`; cell validated by `canStandAt` = the
  `C_1E0F_000F` analog) + an `item` payload threaded through dispatch so the armed
  confirm carries the picked item; `main.js` `D` hotkey → picker → `armDrop`.
- **Member-targeting (Zane add-on)**: `D` opens the **hovered party member's** inventory
  if the cursor is on one (`Actor` + `PartyMember`), else the avatar's — a clone QoL
  convenience (source drops from the *active* member). Picker title shows the holder
  name. Verified: hover Dupre + `D` → "Dupre — drop which item?"; empty cell → "Avatar
  — …".
- **Nested-container drop (Zane add-on)**: Zane found a real nested container — Dupre
  carries a **bag** holding gold nuggets/coins — and confirmed the inspector drills into
  nested containers. Source allows dropping any `CONTAINED` object at any depth (the
  container view navigates the hierarchy: `seg_0C9C.c:1502` open = `D_E709=Selection.obj`
  down, `:1495` close = `D_E709=GetAssoc` up). So made the picker **recursive**: a
  carried container drills in (nested picker), and a pick at any depth pops the chain
  back to the **base depth** captured at the root open (added `UIStack.depth()`; base-
  depth pop, not `clear()` — which is blunt, only correct because `D` is gated on an
  empty stack). Verified: drilled into Dupre's bag → picked gold nuggets → chain popped
  to 0 → "You drop a gold nuggets." (on the map, gone from the bag); no errors.
- **New seam**: DROP is the first verb whose first target isn't a map cell → the
  dispatch gained `pendingDropItem` (arm-with-context → pick-a-cell). Reusable for TALK
  + "use item on target". The picking-Enter doesn't double-fire (dispatch's keydown
  listener registered before `UIStack`'s → sees the modal open → returns).
- **Verified** (preview-eval): `D` opens the picker (sword equipped / Orb of the Moons /
  ankh amulet); pick Orb + confirm a passable cell → "You drop Orb of the Moons."
  (inventory 3→2, item on the map); >7 away → "Out of range!"; impassable → "You can't
  drop it there."; click-confirm carries the armed item; no errors.
- **Deferred**: throw-missile animation, break-if-far, quantity prompt, drop-into-
  container, unequip-on-drop, SetOkToGet (anti-theft).
- **Next**: I-10 core verbs (USE/LOOK/GET/DROP) done. Either the post-I-9 deviation
  audit (deferred to after I-10) or I-11 (talk).

---

## 2026-06-04 — I-10g: GET (pick up → inventory); DROP split to I-10h

- **Read**: `seg_27a1.c` — GET `C_27A1_18F5` (:815-922) + DROP `C_27A1_14DA` (:692-812).
  GET: re-pick → LOCXYZ + adjacency gates → terrain-damage-on-grab → weight/strength
  carry gate → place (stackable `GiveObj` / lit torch → hand / else `InsertObj INVEN`)
  → **theft/karma** (un-owned overworld item: −1 karma; an awake neutral witness yells
  "Stop Thief!!!" + turns hostile). DROP: a **two-target** verb — pick the carried item,
  then a "Location:" cell; quantity prompt for stacks; thrown as a `COMBAT_Missile` arc;
  outcomes ground / container / "It broke!" (fragile + far).
- **Decision (Zane)**: split GET and DROP — DROP's inventory-item + location flow is
  heavier in the current architecture (the verb-first front-end only targets a map cell;
  DROP needs a "which carried item" source). **Do GET first; DROP = I-10h.**
- **Audit** (`world_loader.js`, no-reinvention): `attachToHolder` (ContainedIn + Container
  tag) + `inventoryOf` exist; the missing piece is "take an on-map object into inventory"
  → added `moveToInventory` (`InsertObj INVEN`): drop `Position` + `spatial.remove`, then
  `attachToHolder`.
- **Impl**: `command_dispatch.js` `get` handler — forUse re-pick (skip NPC/ignore) →
  on-ground check → `moveToInventory` into `avatarRef` → "You get …"; adjacency via the
  dispatch gate; `G` key.
- **Gettable gate (Zane flagged "are all objects gettable?")**: the first cut deferred
  ALL weight handling → the clone got *everything*, incl. a carpet. Re-read confirmed
  source gates gettability on **`TypeWeight[type]`** (`C_27A1_18F5:858` + `GetWeight`
  `seg_155D.c:165`): `TypeWeight==0` = a **fixed object** (scenery/furniture), refused
  for GET *and* MOVE (`seg_27a1.c:995`). **Key**: that data is already loaded — it's the
  `tileflag` file's `TypeWeight` plane (@0x1000) which `tile_flags.js` deliberately
  *skipped*. So I decoded it (`reg.weightOf(objType)`) and ported the gate
  (`weight==0 || ==255 || OBJ_19B` → "You can't get that."). Only the carry-**capacity**
  (`STREN*20`) gate stays deferred. Deferred otherwise: terrain-damage, theft/karma,
  lit-torch-to-hand, stack-merge, per-type fixups, explicit `SubMov`.
- **Verified** (preview-eval): `G` on the fixed carpet (obj 0x12f, `weightOf==0`) →
  "You can't get that." (stays on the map); a real weight-12 item → "You get …" (leaves
  the map, into the avatar inventory via the `I` Inspect modal); non-adjacent → "Out of
  range!"; empty → "Nothing to get."; no errors.
- **Next**: I-10h (DROP) — settle the item-selection UI with Zane first (likely via the
  inventory modal).

---

## 2026-06-04 — verb-first front-end: left-click confirm (+ pan suppressed while armed)

- **Impl** (Zane request): the verb-first targeting now confirms with a **left-click**
  as well as `Enter`. `command_dispatch.js` adds a canvas `click` → dispatch the armed
  verb at `probe.getLastCell()` + disarm; `dev_probe.js` gains an `isVerbArmed` gate
  that **skips drag-to-pan while a verb is armed** (`main.js` forward-refs
  `cmd.isPending()`). Zane's framing — the armed state expects a click, not a pan —
  removed the click-vs-drag threshold I'd first proposed.
- **Faithfulness**: this is the route the clone had skipped — source's primary
  targeting IS the mouse click; keyboard `Enter` only synthesises one
  (`seg_0C9C.c:1206-1217`, `research_object_interaction.md §"Mouse and keyboard …"`).
- **Verified** (preview-eval): armed-Look + click → "Thou dost see …" at the cell +
  disarm; a drag while armed → camera delta (0,0); `Enter` route unchanged; no errors.

---

## 2026-06-04 — I-10f: LOOK (line-only) + keeping `I` as a distinct Inspect tool

Implemented the first single-function verb on the I-10b dispatch core — and, on a
Zane source-check prompt, corrected what LOOK does with containers.

- **Read**: `seg_27a1.c` — LOOK body `C_27A1_0C67` (:472-637): the "Thou dost see "
  prefix, the empty/invisible → terrain-name + adjacent "Searching here…" branch, the
  NPC/item `GetObjectString` branch, the `C_27A1_06D7`/`C_27A1_078F` branch, and the
  weight / damage / spellbook / clock / sign / portrait / darkness extras.
  `C_27A1_0841` (:355) — the count-prefix; `C_27A1_06D7` (:316, `CanRead?`) +
  `C_27A1_06A2` (:304, `IsReadableSign?`) + `C_27A1_078F` (:335, `read book or sign?`).
- **Found**: LOOK is **not** table-dispatched and is **viewport-range** (reads the
  pointer cell, no adjacency gate). **The big correction:** LOOK does **not** open or
  list a container — the branch that looked like "list contents" is `C_27A1_078F`,
  which opens `BOOK.DAT` and prints **book/sign text**. So source LOOK is a pure
  scroll verb that never opens a panel; container contents are a USE/GET interaction.
  Also: `C_27A1_0841` is the count-prefix (QuanType-gated), not the article
  (`C_27A1_061E`); the raw `Amount.quantity` is **not** a stack count for non-
  stackables (a crate reads ×10), so prefixing it ("10 crate") is wrong — count
  deferred with weight/stats.
- **Decision (Zane 2026-06-04)**: `L` and `I` must be **distinct**. `L` = LOOK =
  the faithful line; `I` = a separate clone-only **Inspect** tool = always open the
  I-7 detail modal (obj#/status/contents). Revises the original decision #2
  (LOOK-escalates-to-modal-for-containers), which the source re-check falsified.
- **Impl**: `command_dispatch.js` — the `look` handler is **line-only** (terrain /
  item / NPC / container all → a line; no modal); `withArticle` (article only);
  `VIEWPORT_VERBS`; `L` key. `main.js` — the `I` hotkey **kept** as the always-open
  inspector (restored), documented as LOOK's deliberate counterpart.
- **Docs**: corrected `research_object_interaction.md` §"Look" (the wrong "lists
  contents via C_27A1_078F" claim → book/sign reading) + its clone note; rewrote
  `progress.md` decision #2 + §"I-10f — landed"; ledger/top-status to a–f.
- **Verified** (preview-eval, real Britain data): LOOK → terrain "floor"/"grass"
  (incl. 30 tiles away — viewport range), item "a flag", NPC "Avatar", crate
  "a crate" — all **lines, no modal**; Inspect (`I`) on the same flag/crate → the
  detail modal. `L` arms "Look" + Esc disarms; no console errors.
- **Next**: I-10g (GET / DROP) — audit `world_loader.js` for the Give/Take/Insert/
  Move analogs first (no-reinvention rule).

---

## 2026-06-04 — `SearchArea` resident-set bound → quality-search windowing

Followed up the `note` `0d27e48` TODO: verify, from source, the exact window the
clone's quality-linked-control search (`findObjectsByTypeQuality`) should use.

- **Read**: `seg_1184.c` — `SearchArea` (`C_1184_09DE`, :369), `NextArea`
  (`C_1184_090D`, :345), the anchor-node lookup `C_1184_02FA` (:139, both the
  in-window `MapObjPtr` index path and the `else` Link[]-walk path :176-207),
  the local-object area maintainer `C_1184_19AA` (:795), and `C_1184_2ECC`
  (:1456, MapObjPtr rebuild). `seg_101C.c` — area refresh `C_101C_0306`
  (:140; `AreaX/AreaY = (MapX-0x10)&0x3f8`, the 5×5-chunk tile load, the local
  object re-place loop). `seg_27a1.c` — the three control handlers `C_27A1_433D`
  (crank, :2056), `C_27A1_4479` (lever, :2092), `C_27A1_4672` (switch, :2140),
  all using `SearchArea(0,0,0x3ff,0x3ff)`. `u6.h` — `AREA_W`/`AREA_H` = 40,
  `MapObjPtr[40][40]`, `AreaX/AreaY`.
- **Found**: `SearchArea` is **not** a map scan — it walks the resident `Link[]`
  chain between two positional anchors; the anchors index `MapObjPtr[40][40]`.
  The resident set is structurally bounded to the **40×40 active window** by
  `C_1184_19AA`'s ±20-box eviction (40 wide = `AREA_W`) + OBJBLK streaming. So
  `SearchArea(0,0,0x3ff,0x3ff)` is "**no coordinate filter**," not "scan the
  world" — it returns only the ~40×40 loaded working set. **The note's open worry
  (object window may differ from the tile window) resolves: it's the same 40×40.**
  The canonical area search at `seg_2FC1.c:915` confirms the exact window:
  `SearchArea(AreaX, AreaY, AreaX+39, AreaY+39)`. `NextArea` also filters
  `z == MapZ` (:359) — a level filter the clone scan currently lacks.
- **Docs**: `research_world_data.md` new §"Area-bounded object search —
  `SearchArea`/`NextArea`" (mechanism + the resident-set bound + the clone
  no-unload divergence); §"Open targets" item 1 augmented with the windowing
  consequence. `research_object_interaction.md` new §"Quality-linked controls —
  search scope" (lever/switch/crank handler table + the windowing fix); fixed the
  stale `OBJ_120` dispatch row ("clock/device" → crank/drawbridge).
- **Implemented** (same session): `findObjectsByTypeQuality(world, type, quality,
  near)` gained an optional `near = {x,y,z}` window — a ±20 box on the control's
  level (Zane's call: center±20, centered on the **control object's own cell**, not
  a separate `AreaX/AreaY` resource), with the `NextArea` `z == MapZ` filter and a
  `query(ObjType, Position)` LOCXYZ restriction. `useLever`/`useSwitch` (via
  `markerToggle`) + `useCrank` (`findBridgeAnchor`) pass the control cell.
- **Verified** (preview-eval, real Britain data), three ways: (1) **predicate** — the
  windowed scan drops 25 of 34 quality-0 doorways (keeps the 9 with Chebyshev ≤ 20);
  (2) **synthetic** in-world markers — ±20 is boundary-inclusive (Δ20 kept, Δ21
  dropped), the z filter drops a same-xy z=1 marker, and the temp entities are
  destroyed (world left clean); (3) **end-to-end on the real gate** — the LB-castle
  lever (303,383, quality 1) toggles its portcullis at (307,384) open→close
  (delete→re-add round-trip, "You hear a noise."), while the unrelated portcullis at
  (351,407) — Chebyshev 48, out of window + different circuit — is untouched; lever
  frame restored. The marker+portcullis live in **region 26** (the lever sits on the
  18/26 boundary at y=384), which only OBJBLK-loads once you cross into it; loaded it
  via `loadRegion(world, 26)` to reproduce the I-10d "regions 18+26" scenario. No
  console errors throughout.
- **Next**: commit (docs + impl); then I-10f (LOOK), I-10g (GET/DROP).

---

## 2026-06-04 — I-10a–e: USE dispatch + the castle gate (door / lever / crank)

Built the object-action dispatch core and the first real USE handlers, ending with
the geometry-heavy drawbridge. Each sub-step a save-point commit, none pushed
(Zane's call — local-only through the session).

- **Read**: `C_27A1_2A44` (door, seg_27a1.c:1280) + the USE switch (3066-3076);
  `C_27A1_2D8E` (use key/lockpick, 1390) — OBJ_03F lockpick (quality-0 locks) vs
  OBJ_040 key (quality-matched); `C_27A1_4479` (lever, 2092) + `C_27A1_4672`
  (switch, 2140); `C_27A1_433D` (crank, 2056) → `C_27A1_3F47` (drawbridge, 1942) +
  helpers `C_27A1_3E59`/`3E9A`/`3ED1`/`3EF6`; `GetTileAtXYZ` (seg_101C.c:485) +
  `D_1D0A` shore-tile whitelist; obj.h door/control/marker constants.
- **Found**: (1) **door frame model** — low 2 bits = orientation, bits 2-3 = state
  (0 open · 1 closed · 2 key-locked · 3 magic-locked); plain USE toggles the
  open/closed bit, refuses locked. (2) **The scope doc's "crank frame-toggles the
  bridge" was wrong** — ALL of lever/switch/crank *add and delete* objects, not
  frame-toggle (caught before building). Lever/switch add/delete a gate (portcullis
  OBJ_136 / electric-field OBJ_0AF) at quality-matched OBJ_12D markers; the crank
  delete/re-adds the whole OBJ_10D bridge run in a new shape (raised row ↔ lowered
  span across the moat). (3) **Lock-key investigation**: the (304,382) steel door is
  key-locked quality-1; no quality-1 key in the loaded start region (only a
  quality-14 key + quality-0 lockpicks), because U6 hands that key via **Lord
  British's conversation** (I-13 VM, not built) → temporary force-open bypass.
- **Docs**: `progress.md` gained "I-10a–e — landed" sections + status/ledger update;
  `CLAUDE.md` stage + code-layout + NPC-#12 known-issue (now RESOLVED) updated; this
  entry. New code: `resources/{message_log,commands}.js`, `view/message_channel.js`,
  `systems/{cell_pick,command_dispatch,use_handlers,use_drawbridge}.js`, runtime
  primitives in `world_loader.js`.
- **Found (live)**: with the bridge lowered, scheduled NPCs **#11/#12 walk to the
  dining room** (Zane) — the modeled drawbridge resolves the I-9 #12 dinner-teleport.
- **Open**: the real locked-door unlock (key via I-13 conversation + USE-inventory
  front-end); the switch path + the crank's "can't open" clearance gate are ported
  but untested (no reachable scenario); 5 local commits unpushed (push before any
  cross-PC switch).
- **Next**: **I-10f (LOOK)**, then **I-10g (GET/DROP)** — both reuse the dispatch
  seam + the I-10d add/delete primitives.

## 2026-06-02 — I-9 wrap-up: NPC-blocking research + I-9i dropped → I-9 complete

Post-I-9h discussion. Zane asked how the source handles an NPC blocked by another NPC /
party member mid-path, then (from game memory) pushed back on "it just waits forever" —
the right instinct: re-derive, don't defend.

- **Read**: the full block chain — `__DoOnPath` (`C_1E0F_387D`, seg_1E0F.c:1576-1608),
  `TryStraightMove` + `C_1E0F_000F` (legality, 66-235), `__ComputeResistance` (cost map,
  1866-1922), the per-mode dispatcher `C_1E0F_3E6A` (1733-1848), and the turn loop
  `C_0A33_1CB4` (seg_0A33.c:1020-1404) + its `C_1E0F_4E0A` call (1395).
- **Found**: (1) the planner **ignores actors** (cost map only `>= 0x100`), so paths run
  through occupied cells; (2) `C_1E0F_000F` blocks at step time on actor-ness, not tile
  flags; (3) `__DoOnPath` reacts by **wait + escalate `ONPATH→84→85→86` (`MovePts=0`) +
  re-plan** — retries the SAME step, **no detour, no swap**; AI_86 isn't even in the
  dispatcher switch (→ default wait, re-promoted to FINDPATH by the path service). **The
  only swap in U6 is avatar↔party-member** in the *player* advance (`C_1E0F_1B0E:881-898`,
  with an AI_FRONT push variant) — there is no NPC-NPC swap. Blocks stay rare/brief in the
  original via **move-point staggering** (round-robin one-step-at-a-time re-pick + `DEXTE`
  speed variation) + the **turn-based clock** (world advances only per player action;
  `CON_getch` blocks, so idle = frozen and a stuck NPC is never *seen* stuck).
- **Synthesis (Zane)**: our **auto-advance idle heartbeat** is the clone-only addition that
  surfaces blocking the original hides; the faithful levers (move-point economy + slower /
  player-action-only clock) are the real fix, and I-9f (teleport-to-previous) is a band-aid
  for their absence. A clone-only problem may warrant a clone-only solution (NPC swap /
  detour) — legitimate per the Modern-UX anchor — studied AFTER the port.
- **Decision**: **I-9i (dev-HUD path overlay) DROPPED** — fancy-not-must; live preview-eval
  of `window.__U6`/`Paths` already covers path inspection, and a visual trail would dirty
  the DOM-cursor or the renderer for no real gain. **I-9 is complete through a–h.**
- **Docs**: new `research_npc_ai.md §"Blocking + collision resolution"`; `progress.md`
  status → I-9 complete + I-9i-dropped + the deviation-audit "central fork" (idle-heartbeat
  keep-vs-revert) + post-port new-mechanism study; CLAUDE.md + DOCUMENTATION_INDEX status.
- **Next**: post-I-9 deviation audit, then I-10 (object-action dispatch).

## 2026-06-02 — I-9h: off-area teleport + distance gate + first-tick alignment

The "walk-near, teleport-far" gate, plus aligning NPCs to their current-hour slot at
load. SP1 (teleport + distance gate) and SP2 (first-tick alignment) landed as one
sub-step (Zane's call); SP3 (idle-advance tuning) deferred. Zane's framing for the
load case drove the design: rather than replay source's saved per-NPC path data, just
pathfind/teleport NPCs to their known schedule destination — we have the same info
source does, we just don't need its 8088 CPU-saving path cache.

- **Read**: `C_1E0F_291C` (off-area teleport, seg_1E0F.c:1181-1211); the NPC-dispatcher
  off-area arm (`C_1E0F_4E0A`, seg_1E0F.c:2186-2196); the path service `C_1E0F_464A`
  (seg_1E0F.c:1924-1960); the three `AllowNPCTeleport=1` call sites (`seg_0A33.c:1377`
  Alt-215 +1h, `seg_101C.c:432` rest-at-inn, `seg_1703.c:903` `OP_REST`).
- **Found**: `C_1E0F_291C` is small + most of it the I-9g `atDestination` already does.
  Its visibility guard is the gate: suppress the teleport if the NPC **or** its slot is
  inside `MapX/MapY ±5` (the 11×11 viewport) unless `AllowNPCTeleport`. The service
  order is **teleport-first, pathfind-if-suppressed** (1937–1943) — cheap test before
  the expensive flood — with twin 3/turn caps (`D_17A5` teleport, `D_17A7` pathfind),
  both reset per turn. `AllowNPCTeleport` is exactly the "force-settle at a time-jump"
  flag — the source analog of our load-time first-tick alignment.
- **Built**: `tryTeleportToSlot()` in `systems/npc_path.js` (Chebyshev-40 near radius
  = the wider-canvas adaptation of source's ±5; `allowVisible` = `AllowNPCTeleport`);
  the NPC tick tries it first, capped 3/turn, and the old local `snapToSlot` is folded
  into it (`allowVisible=true` for the unreachable-fallback). `main.js` fires
  `clock.hourlyHooks` once at load for first-tick alignment. `teleported` tick stat +
  `tp` on the dev HUD.
- **Calls (for the post-I-9 audit)**: kept the 3/turn cap source-faithful though it's a
  throttle invisible behind the visibility guard (off-screen-only) — drop-candidate; did
  NOT port the pathfind cap (`D_17A7`); kept a clone-defensive `canStandAt` on the
  teleport target (source assumes authored-valid slots).
- **Verified (real data, preview-eval)**: game boots + runs a day cycle, no errors;
  first-tick alignment logs `[NpcSchedule] hour 09` at startup (before any rollover); a
  far NPC (dist 50) **teleported 10 cells onto its slot in one turn**, settling STAND_S
  (`teleported=1`); a near NPC (dist 4) was **suppressed and built a walk path**
  (`teleported=0`, AI_ONPATH); normal play never teleported a visible NPC. 121/121 unit
  cases (+13).
- **Deferred**: idle-advance interval tuning (SP3 — one-line `TurnClock`, do when the
  slower-clock feel is wanted); source's forced load-settle via `AllowNPCTeleport` →
  to save-load (fresh-game OBJLIST is already at season-start slots, so the gap is
  minimal today); the door-phasing predicate known-issue (`isHumanoid` ≠ `MONSTER_4000`)
  untouched — the distance gate doesn't read it.
- **Next**: I-9i (dev-HUD path overlay), the last I-9 sub-step. Then the consolidated
  I-9 deviation audit.

## 2026-06-02 — I-9g: arrival worktypes/facing (`__AtDestination`)

Next sub-step after the a–f session. NPCs now don't just walk to their schedule slot —
on arrival they **settle into the slot's worktype** and face the right way (a guard
faces its post, a stander faces its set direction). Small, well-bounded port of
`__AtDestination`; the pose/furniture half (sit/eat/sleep sprites) is a deliberate
scope cut.

- **Read**: `__AtDestination` (`C_1E0F_2276`, seg_1E0F.c:1002-1085) — re-derived from
  primary source. The STAND/GUARD facing arm is `SetDirection + C_1E0F_0664` with dir8
  `((action−AI_STAND_N)&3)<<1`; the SLEEP/SIT/PLAY/EAT/RINGBELL arms force `isAtDest`
  and find furniture via `C_1E0F_2184` (read 978-1001) for the sprite swap. Confirmed
  the call sites + arrival distance test in `__DoOnPath` (`COMBAT_getCathesus < 2`,
  seg_1E0F.c:1582-1587) and the humanoid walk/face helper `C_1E0F_0664` (268-340).
- **Found**: the arrival distance gate is `< 2` (Chebyshev ≤1), not exact-position —
  the clone's a–f code used exact equality on the path goal, which is stricter and
  would loop if the exact slot cell is occupied; switched to a wrap-aware Chebyshev so
  a near-miss settles and an edge-seek path (whose `goalX/goalY` is the far slot, not
  the window edge it walked to) still re-plans. Also: source routes even an
  already-on-slot NPC through `AI_FINDPATH` → trivial path → `__AtDestination`, so the
  clone's "already at target" schedule branch now sets `AI_FINDPATH` (lets the tick's
  empty-path arm apply the worktype) instead of silently skipping.
- **Built**: `atDestination(world, handle)` in `systems/npc_path.js` (+ a wrap-aware
  Chebyshev helper); new `Destination.action` byte (the slot worktype); wired into
  `doOnPath` end-of-path, the NPC tick's empty-path + post-snap branches, and the
  schedule arm (stores `dest.action`, routes already-on-slot through FINDPATH).
- **Found (the gazer NPC #9)**: Zane asked me to inspect NPC #9 — a **gazer** (obj 0x162)
  with a 6-slot schedule (mostly AI_9A roaming, one STAND_N at 19:00). This surfaced a
  real bug: my facing code applied the humanoid `frame = facing<<2 | 1` to *any* NPC, but
  `C_1E0F_0664` is **type-dispatched** — the gazer's arm is `frame = facing` directly
  (seg_1E0F.c:410), so STAND_N should be frame 0, not 1. And source calls `C_1E0F_0664`
  at BOTH the walk (`TryStraightMove`:1439) and the arrival (`__AtDestination`:1075), so
  the walk path (`npcStep`, landed I-9c) had the same latent mis-encoding. Added an
  `isHumanoid` gate to both sites: non-humanoids move/settle without animating (valid
  static sprite); their per-type facing arms join the deferred pile. 33 new unit cases
  (108/108 total) incl. gazer arrival + gazer walk (frame untouched).
- **Deviation kept**: facing is frame-encoded (`(facing<<2)|1` stand frame), no separate
  `SetDirection` field — a later GUARD-pacing step reads facing from `frame>>2`.
- **Deferred**: per-type non-humanoid facing arms (gazer direct-frame, animals, …);
  furniture/pose sprite swaps (`C_1E0F_2184`) + ongoing GUARD pacing (`C_1E0F_3E6A`).
  Modes set + position held; sprite unchanged.
- **Verified (real data, preview-eval)**: Zane loaded U6 data into the preview, so I
  ran a live pass. 40 scheduled NPCs carry STAND/GUARD worktypes (castle courtiers/
  guards) → not dead code. `atDestination` on a real humanoid (obj 0x19a, baseTile
  1776) produced valid facing sprites for all 4 cardinals (tiles 1777/1781/1785/1789;
  GUARD_W = STAND_W) — confirms the frame→tile mapping the unit test stubs to 0. And
  the live AIMode distribution already had arrived worktypes populated (SIT 4 / LOITER
  6 / WANDER 3 / FARM 1 / PLAY 1 / RINGBELL 1), i.e. the schedule→walk→arrive→worktype
  lifecycle fires end-to-end in the running game. And the non-humanoid gate checks out
  on the real gazer NPC #9: STAND_N sets the mode but leaves its sprite frame untouched
  (`isHumanoid` false), while a humanoid control still faces (STAND_S → frame 9). NPC
  state snapshotted + restored so the live game wasn't disturbed.
- **Next**: I-9h (off-area teleport + first-tick alignment + idle-interval tuning +
  player↔NPC distance threshold), then I-9i (dev-HUD path overlay).

## 2026-06-02 — I-9 implemented a–f: NPC pathfinding (NPCs walk their schedules)

The big one: NPCs now **walk** to their schedule slots instead of teleporting.
Landed as six SEPARATE commits — **no squash** (Zane's call: each sub-step is a
verified milestone worth keeping). Pre-impl source read first (re-deriving the
pathfinder from primary source rather than trusting the research doc), then a–f.
The real-data verification (preview-eval driving the live game, since the U6 data
is loaded in the preview browser) turned into the most valuable part — it surfaced
the drawbridge finding below.

- **Read**: `seg_1E0F.c` pathfinder — `C_1E0F_2D37` (search), `C_1E0F_2A74`
  (relax), `C_1E0F_25F9` (traceback), `__ComputeResistance`/`C_1E0F_4265` (cost
  map), `__DoOnPath`, `C_1E0F_464A` (path service), `C_1E0F_291C` (off-area
  teleport), `C_1E0F_000F` (legality, esp. the door branch :199-207), `C_1E0F_5165`
  (schedule arm), `C_1E0F_4E0A` (NPC tick). Door frames via `C_27A1_2A44`. Monster
  class table `D_3522_0242` + `GetMonsterClass`. Drawbridge `OBJ_10D` + lever
  `OBJ_10C`: `C_27A1_3F47`/`C_27A1_433D` (`seg_27a1.c:1898-2090`).
- **Built**: `systems/pathfinding.js` (`computeResistance` + `findPath`),
  `systems/npc_path.js` (`npcStep` + `doOnPath`), `systems/npc_tick_system.js`,
  `systems/ai_modes.js`, `resources/paths.js`, `AIMode`/`Destination` components,
  `terrainCost()` accessor, `asHumanoidNpc` door arm in `passability.js`, schedule-
  arm rewire + teleport-to-previous in `npc_schedule_system.js`, HUD tick/reclaim
  lines. 75/75 in `tests/test_pathfinding.html`. (Sub-step SHAs + per-step detail:
  `progress.md §"I-9 scope"`.)
- **Found / corrected**:
  - **NPCs are NOT obstacles in the cost map** (source only spreads object slots
    ≥0x100). NPC-vs-NPC blocking is per-step move-time only → bump/wait/re-plan.
  - **Humanoid NPCs phase through closed-unlocked doors** (`MONSTER_4000` class is
    the townsfolk/party sprite family; the player is blocked and must USE) —
    corrects the note-branch "open door on arrival" guess.
  - **NPC #12's teleport-to-dinner is the unmodeled castle drawbridge**, not a
    cost-cap bug. The bridge (`OBJ_10D` at (303–310,385)) is raised (frames 6/7/8,
    impassable) → her route detours through cost-15 forest → exceeds source's 7-bit
    cost cap (127) → snap. With the bridge open (a quest step, I-10 lever USE) the
    route is cheap and she walks. **Raising the cost cap would be the wrong fix**
    (routes her through forest the original never uses). Dropped that idea.
  - Source's single-favored-edge edge-seek (`PTH_direct`) snaps when the dominant-
    axis edge is walled next to the NPC (common on real maps) → **deviation: accept
    any toward-goal edge** (`edgeMask`).
- **Kept deviations** (flagged so next-session-me doesn't "fix" them): per-NPC
  window (not player-centered); multi-edge edge-seek; teleport-to-previous-target
  on reschedule (I-9f); flat step-rate; frontier pool sized to grid (vs 256). All
  in `research_npc_ai.md §"Clone port notes (I-9)"`.
- **Decisions**: time model = keep idle-advance ("world breathes"), interval-tuning
  is a remaining item; god-mode free-camera activating schedules out of quest
  sequence is the source of "impossible destination" cases → accept the teleport there.
- **Open / Next**: arrival worktypes/facing (`__AtDestination`); off-area teleport
  + first-tick alignment + idle-interval tuning + player↔NPC distance threshold;
  dev-HUD path overlay. Then I-10 (object actions, incl. drawbridge/lever USE).

## 2026-06-01 — I-8 implemented: avatar movement + party conga (a–e)

I-8 landed as five save-point sub-steps, all browser-verified on real U6 data via
the preview MCP (synthetic `KeyboardEvent`s + reading `window.__U6` state). The
player now walks Britain with the camera following, the sprite facing + animating,
and the three companions trailing in formation.

- **Built**:
  - I-8a `systems/avatar_move_system.js` — 8-dir avatar move (`C_1E0F_1B0E`),
    camera recenter, facing-on-step (`MACRO_A` + `C_1E0F_0664` walk cycle), idle
    settle-to-stand gated on a ~500 ms `IDLE_SETTLE_MS` delay.
  - I-8b `components.js` `PartyMember` + `resources/party.js` `Party`.
  - I-8c `systems/humanoid_anim.js` (shared `faceDir`/`walkStep`/`settleToStand`;
    avatar refactored onto it, behavior-identical) + `canStandAt` party pass-through
    option (`D_17B2`).
  - I-8d `systems/move_followers.js` — `MoveFollowers` (`C_1E0F_1193`)
    formation-greedy step, wired off the avatar's `onMove`.
  - I-8e `settleParty` + the avatar's `onIdle` callback — whole-party idle settle.
- **Found / fixed**:
  - `C_1E0F_1B0E` /*[advance]*/ is the GENERAL player move (sail is a sub-branch);
    corrected a prior doc error that called it sail-only.
  - The avatar is `OBJ_19A` — a humanoid sprite, so `frame = walk + facing<<2` with
    a 4-facing / 3-step-walk layout (confirmed against live `baseTile`/`frame`).
  - **canStandAt ordering bug**: NPC sprite tiles can carry the terrain-impassable
    flag, and the original code checked it BEFORE the Actor/party-pass step — so a
    passed-through follower left `blocked` set and wrongly blocked the Avatar.
    Fixed by moving the Actor/party-pass check first, matching source's `c_04ed`
    (NPC-ness is decided independent of the sprite tile's flags).
  - The `[NpcSchedule]` console flood during testing is just the idle heartbeat
    racing the clock through game-days (one log/hour) — not a bug, but it saturates
    the CDP console and made `preview_eval` look like a 29 s hang. Red herring.
  - Time model: a move advances the clock +1 min AND the idle heartbeat advances it
    too (~10 game-min/sec). Source is strictly turn-based. Keeping the idle-advance
    ("world breathes") is a provisional lean; finalize at I-9 (move-point economy).
- **Design note**: `moveFollowers` and `settleParty` are not registered systems —
  the avatar move system triggers them via `onMove`/`onIdle` callbacks composed in
  `main.js`, so followers move only on the leader's turn and the party settles only
  on idle turns (source's command-vs-idle mutual exclusion).
- **Docs**: `progress.md` I-8 scope rewritten to the landed a–e; `research_npc_ai.md`
  idle-settle generalization + the `c_04ed` ordering insight; CLAUDE.md +
  DOCUMENTATION_INDEX status → I-8 complete.
- **Open / next**: I-8a–e are save-point commits to **squash into one `impl I-8`**
  before push. Then **I-9 (NPC pathfinding)** — its own pre-impl read of
  `C_1E0F_2D37` + `__ComputeResistance` first.

## 2026-06-01 — I-8 pre-impl read: party-follow mechanism + I-8/I-9 split

Opened the I-8 (player movement) scope by reading the NPC dispatch first,
the prerequisite the note-branch I-8 warm-up flagged before committing to a
party-follow mechanism. The read fired a trip-wire: the warm-up note's
central assumption was wrong, and the correct mechanism is a shape the note
didn't enumerate.

- **Read**:
  - `seg_1E0F.c:1733 C_1E0F_3E6A` — the per-mode NPC dispatcher
    (`switch(NPCMode)`); read the whole switch.
  - `seg_1E0F.c:2147-2247 C_1E0F_4E0A` — the NPC tick; the dispatcher-call
    guard at `:2225` and the move-point exclusion at `:2197`.
  - `seg_1E0F.c:501-594 MoveFollowers` (`C_1E0F_1193`) + the formation
    offset tables at `:62-63` (`D_17B8` / `D_17C3`).
  - `seg_1E0F.c:66-160 C_1E0F_000F` — where `D_17A9` (damage-tile flag) is
    set, read by `MoveFollowers`.
  - `seg_1E0F.c:880-936` active-member move + `seg_0A33.c:1311-1322` pass
    command; `MoveFollowers` call sites (`:933` aFlag 0, `seg_0A33.c:1322`
    aFlag 1, `seg_101C.c:291` aFlag 1).
- **Found**:
  - **Party-follow is NOT a case in `C_1E0F_3E6A`.** The tick skips the
    dispatcher entirely for `AI_COMMAND` (active member) and `AI_FOLLOW`
    (companions) at `:2225`, and excludes `AI_FOLLOW` from move-point
    allocation at `:2197`. The warm-up note's "party-follow is just another
    `NPCMode` case in the dispatch" is falsified.
  - **The real routine is `MoveFollowers` — a formation-offset greedy
    step**, which is neither of the note's three guesses (trail-copy /
    per-tick-pathfind / hybrid). Each follower owns a fixed diamond-formation
    slot behind the leader (offset tables rotated by facing) and greedily
    steps the best of 8 legal directions by an "eager" heuristic
    (contiguity bonus − distance-to-slot). Two passes; `aFlag` = tightness
    (0 = avatar moved/loose, 1 = stationary/tighten).
  - **Three movers, one kernel.** Avatar step, follower step, and NPC
    pathfind all share `C_1E0F_000F` + `MoveObj` + `C_1E0F_0664`; only NPC
    AI uses the path builder `C_1E0F_2D37`. This **falsifies `progress.md`'s
    "both consumers share `C_1E0F_2D37`"** — which was the stated reason for
    folding avatar movement + pathfinding into one step.
  - `D_17A9` = the `TERRAIN_FLAG_08` damage-tile flag (the one I-4 deferred);
    followers are reluctant to step on hazards. `C_1E0F_1B0E`, previously
    guessed as "player walk," is the sail/wind-move (called only for ships).
- **Decision (with Zane)**: **split I-8 → I-8 (avatar + party follow) +
  I-9 (NPC pathfinding)**. One step = one squash commit; "player walks
  Britain" and "NPCs pathfind their schedules" are distinct payoffs with
  distinct verification, so they can't share a commit. Renumbered the old
  I-9…I-14 to I-10…I-15. Pathfinding (the heaviest single port in the pair)
  is fenced as I-9 with its own pre-impl research read.
- **Docs**:
  - [`progress.md`](progress.md) — ledger split + renumber; new I-8 scope
    (sub-steps a/b/c, formation tables, verification) + I-9 scope stub;
    corrected the `C_1E0F_2D37` rationale; fixed the stale header Status
    block (was "I-5 complete / Next I-6") and pre-existing "avatar from I-6"
    leftovers.
  - [`research_npc_ai.md`](research_npc_ai.md) — new §"Party follow + avatar
    movement" (dispatcher exclusion, consumer structure, `MoveFollowers`
    decode, `aFlag`, `D_17A9`, ECS shape); open-Q2 + deferrable list + status
    header updated.
- **Open**:
  - I-8a needs a read of the player-command dispatch in `seg_0A33.c` —
    whether the avatar moves 4- or 8-directionally.
  - Party-member pass-through (`D_17B2`, deferred in I-4) may be needed in
    I-8c so companions don't treat each other as hard blockers — watch
    during I-8c verify.
  - I-9 pre-impl read: `C_1E0F_2D37` + `__ComputeResistance` before coding.
- **Next**: implement **I-8a** — avatar entity + single-step move + camera
  follow + facing-on-step.

## 2026-05-31 — I-7 (UI substrate + object inspector) + cell-pick + render tie-break + LZNAMES correction

I-7 lands the shared UI substrate (modal stack + input routing +
turn-driver gating + list-with-cursor + atlas-icon DOM rendering)
and its first consumer, the **object inspector**. The hotkey `I`
over a hovered cell opens an inspector for the topmost entity;
list-cursor `Up`/`Down` + `Enter` nests into held containers; `Esc`
unwinds. Main.js's 235-line `startRender()` refactored into
`view/dev_hud.js` + `view/dev_probe.js` + `view/inspector.js` + the
new substrate modules along the way.

The bigger payoff turned out to be everything the inspector forced
us to understand. Each user-flagged behavior gap drove a new source
read that surfaced a finding the existing docs had wrong or vague.
By the end of the session we'd corrected three substantial doc
claims and added two new mechanism decodes — none of which were
"I-7's scope" but all of which were needed to make I-7 correct.

- **Read**:
  - `seg_1184.c:1912 GetObjectString` + `seg_1184.c:1892 GetTileString`
    — display-name resolution path.
  - `seg_1184.c:1370+ __ObjectsDeserialize` + `seg_1184.c:1308 C_1184_29C4`
    — re-read of the chain comparator + the merge sort's inner-while-loop.
  - `seg_1184.c:642 AddMapObj` + `seg_1184.c:927 MoveObj` + `seg_1184.c:998 InsertObj`
    — runtime chain mutation (was an unread "open question" in the world-data
    doc).
  - `seg_1E0F.c` `MoveObj` call sites — verified NPC AI has NO special splice
    path; every NPC movement (schedule snap line 1206, pathfinder step 1375 /
    1436 / 1487, follower step 584, combat warps 635/667/677/890) calls the
    same `MoveObj` routine objects use. So NPC and object movement share one
    chain rule (insert-at-head) and one routine.
  - `seg_2337.c:340 COMBAT_canSee` + `seg_2337.c:365 C_2337_08F1`
    — the cell-pick rule. Three-tier priority via two-pass walk.
  - `seg_0C9C.c:590 mkMouseSelection` + `seg_0C9C.c:1206 RETURN-in-SelectMode-1`
    — verified keyboard targeting collapses into the mouse picker.
  - `seg_27a1.c:472 C_27A1_0C67` (LOOK) + `seg_27a1.c:2956 C_27A1_6179` (USE)
    + `seg_27a1.c:387 C_27A1_0919` — verified LOOK is NOT table-dispatched
    while USE IS; decoded USE's IsTileIg re-pick.
  - `seg_1184.c:1676 ShowObject` non-fg branch — found the source's render
    list ALSO insert-at-head, explaining why our forward-iter renderer was
    drawing the wrong thing on top for same-tier objects.

- **Found**:
  - **No `LZNAMES` file exists.** An earlier auto-memory note had invented
    one as the supposed home for non-party NPC names. The real path:
    party-`Names[]` from `objlist` → fall through to `look.lzd` via
    `GetTileString` for everyone else. `look.lzd` stores personal names at
    NPC-specific tile ids (tile 1769 = "Lord British"). Clone already
    decodes `look.lzd` via `parseLook` (LZW-decompressed, format identical
    to source). The inspector's "(undefined)" for non-party NPCs was a
    short-circuit in our `nameFor` that never tried `getTileLook`.
  - **Merge-sort tie-break preserves file order.** The
    `__ObjectsDeserialize` merge's inner-while-loop walks contiguous runs
    of equal-key new elements without re-linking back to existing chain
    until the run ends, so first-in-file lands at the run's head position
    in the resulting chain. Previously documented as "undefined" — wrong.
    This is why `FindLoc` returns Door before Doorway at (293, 376) even
    though both are at identical (x, y, z).
  - **`AddMapObj` and `MoveObj` both splice at chain head.** U6 design
    intent: most-recently-placed at a cell gets picked first by LOOK/USE.
    Lines 658-659 (`AddMapObj`) and 971-973 (`MoveObj`) are identical
    head-insertion patterns. **NPCs use the same routines** — `seg_1E0F.c`
    has 14+ `MoveObj` call sites for NPC movement (schedule snap +
    pathfinder + follower + combat); there's no NPC-specific chain path.
    So our `npc_schedule_system`'s `insertAtHead` is direct source-
    faithfulness, not just future-proofing.
  - **`COMBAT_canSee` skips `IsTileIg` tiles** as a deprioritization, not
    an absolute skip. `C_2337_08F1`'s `objNum_3` fallback fires when nothing
    canSee exists at the cell, so an egg sitting alone on a floor (tile
    1256 has `IsTileIg`) is still inspectable.
  - **Source's `ShowObject` non-fg branch inserts NEW at HEAD of the
    render list** (line 1676: `*si = bp_04`). Render walks list forward, so
    first-inserted (= older, = chain head) ends up at the tail = drawn last
    = visually on top. Our `WorldRenderSystem` was using forward iter →
    older on bottom → wrong (candle under table, door behind doorway).
    Fixed by reversing inner ents iter so older emits last.
  - **Keyboard targeting collapses into mouse path** (seg_0C9C.c:1217). No
    separate keyboard cell-picker.

- **Docs**:
  - `research_world_data.md` §"Sort order" rewritten — file-order
    tie-break is now documented as a mechanism, not "undefined." New
    §"Runtime mutation — AddMapObj and MoveObj" decodes the chain-head
    splice. New §"Clone correspondence — SpatialIndex API" maps source ops
    to clone's `insert` / `insertAtHead` / `remove`. Old "Implications for
    the pillar-bug audit" + answered open questions collapsed.
  - `research_map_render.md` §"Painter's algorithm" rewritten — within-tier
    rule now decodes the source's chain-head-insert / draw-forward effect
    + the clone's reverse-iter implementation. The "genuinely-undefined
    case" claim removed. Two verified cases (candle+table, door+doorway)
    tabulated.
  - `research_object_interaction.md` gained §"Cell-pick (C_2337_08F1)"
    (with the 3-tier rule + `COMBAT_canSee`'s IsTileIg filter + clone's
    `inspectAtCell` correspondence), §"Display-name resolution
    (GetObjectString)" (with the no-LZNAMES retraction), and §"Mouse and
    keyboard targeting collapse." LOOK now explicitly says "NOT
    table-dispatched"; USE's §-header now includes the IsTileIg re-pick
    via `C_27A1_0919`.
  - `progress.md` I-7 scope trimmed from a ~150-line mixed dump to a tight
    per-substep list + a verified-cases table + pointer-paragraph into the
    three research docs. Ledger flipped I-6 → done, I-7 → done.
  - `DOCUMENTATION_INDEX.md` table rows updated for the three changed
    research docs to mention the new sections.
  - Auto-memory `project_ultima6_rebuild_status.md` — LZNAMES claim
    explicitly retracted in the I-5 deferred block.

- **Open**:
  - Multi-fgExt-per-cell source-faithful ordering — still deferred. Rare
    in u6 data. Source's `ShowObject` fg-branch inserts fgExt tiles at
    chain TAIL (opposite of non-fg), so two adjacent foreground multi-tile
    objects whose extensions share a cell would render with the wrong
    within-zone order in the clone. Revisit if observed.
  - Inspector currently allows opening multiple stacked modals if `I` is
    pressed twice — should it enforce single-instance? Flagging only.
  - `Schedule.npcId` is now redundant with `Actor.npcId`; cleanup deferred.

- **Next**:
  - Save-point commits for I-7 + LZNAMES fix + chain-rule + render fix
    + docs — Zane's call on commit shape (per-step or one big squash).
  - I-8 = avatar movement + NPC pathfinding. Both consumers share
    `C_1E0F_2D37` machinery. Every move must use the new
    `SpatialIndex.insertAtHead` at the destination cell.

---

## 2026-05-31 — I-6 (inventory data layer) landed

I-6 lands the off-map item layer — CONTAINED / INVEN / EQUIP records
become ECS entities with `Container` / `ContainedIn` components, no
`Position` so they stay out of `SpatialIndex` and `query(Position)`.
Three save-point commits (I-6a INVEN/EQUIP → I-6b CONTAINED → I-6c
page chrome cleanup) squashed into one `impl I-6`. Inspector UI is
I-7's job; this step is data-only.

- **Read**:
  - `seg_1184.c:1370-1426` (`__ObjectsDeserialize`) — per-record
    loop pops a free slot, copies the 8-byte payload into
    `ObjStatus`/`ObjPos`/`ObjShapeType`/`Amount`, records in-file
    index → live slot in `ScratchBuf->_6000[]`, and at line 1389
    rewrites `GetAssoc(si) = _6000[GetAssoc(si)]` ONLY when
    `GetCoordUse(si) == CONTAINED`. INVEN/EQUIP keep their on-disk
    assoc untouched — meaning that value is already a stable NPC
    slot ID (0..0xFF), not an in-file index.
  - `research_world_data.md` §"Containment" — `GetAssoc(i) =
    *(unsigned int *)&ObjPos[i]`: assoc is **16-bit**, the first
    two bytes of `ObjPos` reinterpreted as a u16.
  - Legacy `ultima6/obj_manager.js:381-409` (`loadSuperchunk`) +
    `ultima6/obj.js:246-261` (`owner` / `container` getters).
- **Found**:
  - **Legacy port's 10-bit assoc bug.** `obj.js` exposes
    `owner = this.x` and `container = this.x`, where `x` is
    `(lo >>> 8) & 0x3ff` — 10 bits. NPC slot IDs fit in 8 bits so
    INVEN/EQUIP works by accident; container in-file indices reach
    12 bits (cap 0xc00 = 3072 records per file). The clone exposes
    a separate 16-bit `assoc` field to read the full
    `*(unsigned int *)` reinterpretation.
  - **Source's single-pass works because of two implicit
    assumptions** — CONTAINED records' assoc points at an EARLIER
    in-file index (parents come first on disk), and `ScratchBuf` is
    zeroed before each region load. The clone uses an explicit
    two-pass: pass 1 spawns all records and records handles; pass 2
    fixes up CONTAINED via the now-complete in-file-index → handle
    map. Modern JS has no RAM constraint, so trading source's
    single-pass for clarity is free.
  - **No nested-container orphans observed** in Britain's two
    in-view regions (`objblkcd` + `objblkdd`) — every CONTAINED
    record's `assoc` resolved to a spawned entity on the first try,
    so the two-pass handles whatever nesting Britain's containers
    carry (≤ depth 2 in this sample; possibly deeper elsewhere).
- **Docs**:
  - `progress.md` — new `## I-6 scope` section appended.
- **Open**:
  - **`main.js` logic refactor** — `startRender()` is at ~235
    lines and mixes 6 concerns. Cuts already legible (`view/
    dev_hud.js`, `view/dev_probe.js`, `view/inspector.js`). Pairs
    with I-7's UI substrate; deferred there.
  - **Save export/import** flagged as a forward-looking
    nice-to-have once I-9+ introduces in-game mutations and IDB
    state can diverge from the loaded zip. Not on the current
    trajectory; conversation-noted only.
- **Next**: I-7 (UI substrate + object inspector — the first
  surface on the substrate; modal stack + input routing +
  turn-driver gating + list-with-cursor + atlas-icon DOM
  rendering).

---

## 2026-05-31 — I-5 (schedule resolution) landed + post-I-5 Z-order bug fix

I-5 narrowed mid-flight from the ledger's "NPC scheduled movement (hourly
schedules + pathfinding + walking)" framing to **schedule-resolution-only**:
on each game-hour rollover, snap eligible NPCs to their slot's xyz. No
pathfinding, no facing/frame updates, no `NPCMode` plumbing. Six save-point
commits (I-5a parser → I-5f HUD probe) squashed into one `impl I-5`. Then a
Z-order bug ("Lord British drawn under his throne") surfaced during I-5c
verification, was queued, and fixed post-I-5f as its own commit. Post-step
doc resync paired with each implementing commit.

- **Read**:
  - `seg_1E0F.c:2264-2294` (`C_1E0F_5165` — the hourly schedule arm) +
    `seg_0A33.c:875` (the calling site inside the time-advance routine).
    Confirmed hour-EXACT match + day wildcard (0 = any), backward scan,
    `SchedIndex[npc]` becomes the per-NPC offset.
  - `seg_0C9C.c:285-287` (the SCHEDULE file's two-pass read) +
    `u6.h:469-473` (`struct tSchedule`) + `u6.h:302-303` (`struct coord`).
    Layout: **514 bytes (257 × u16-LE) of pointers, then N × 5-byte
    entries** — `(0x100 + 1) * sizeof(int)`, Borland TC2 `int` is 16-bit.
    Nuvie's `schedule.txt` says "0x200 + uint16 entry count"; source wins.
  - `ai.h` end-to-end — schedule-tier action codes 0x80..0x9b.
  - `seg_1184.c:1651-1700` (`ShowObject` — the chain insertion routine for
    the per-cell painter) + `seg_1184.c:1702-1721` (`C_1184_35EA` — the
    tile-frame expansion that emits anchor + horizontal/vertical/2×2
    extensions; source's `IsTileDoubleH`/`IsTileDoubleV` = port's
    `isDoubleWidth`/`isDoubleHeight`).
    Source's normal-tile insertion is at chain HEAD; older inserts end
    up at chain TAIL = drawn last = on top.
- **Found**:
  - **Schedule file format claim in Nuvie's `schedule.txt` is wrong.**
    The doc had carried the Nuvie layout (256 u16 + uint16 entry count +
    entries from 0x202); source reads 257 u16-LE pointers (514 bytes)
    with the sentinel `SchedPointer[256]` as the total slot count.
    Corrected in `research_npc_ai.md`; the parser header carries the
    same warning. Same class of "tech-docs disagree with source"
    surprise as the chunks-file format issue in `research_world_data.md`.
  - **Empty-slot encoding quirk.** An NPC with no schedule has
    `SchedPointer[n] > totalSlots` (start pointer past the end of data).
    Source's resolver loop `for di = end-1; di >= start; di--` tolerates
    `end < start` naturally — body never runs. A strict-monotonicity
    parser check is too tight; we tripped it during I-5a verification.
  - **`AI_9A 0x9a` is a legitimate schedule action**, despite `ai.h`'s
    "RETREAT?" comment treating it as ambiguous. 8 real instances in
    the schedule file. The comment was speculation; the data is real.
  - **Source's schedule trigger is hour-EXACT, not "between events".**
    Resolver returns null when no slot matches `Time_H` exactly; NPC
    stays in its previous `NPCMode`. Big design simplification for our
    I-5 — no need for a per-NPC `lastSlotIndex` field on the Schedule
    component; snap only when the resolver returns non-null.
  - **The LB-throne Z-order bug class: extensions reaching back into a
    cell from a neighbor's anchor.** Our render's per-cell scan emitted
    LB's tile first (at his cell), then the throne's anchor cell (the
    throne is `isDoubleWidth`, 2-wide) emitted BOTH the anchor tile + the
    extension landing back at LB's cell — the extension lands in the
    normal-zone list AFTER LB, draws on top. Source avoids this via `ShowObject`'s chain-HEAD insertion:
    LB (loaded first) ends up at chain TAIL = drawn last = on top,
    regardless of scan order. Fixed our port with per-cell gather +
    type-based z-priority sort (Actor=1, else=0); decouples Z-order
    from entity index for forward-compat with the object-interaction
    phase's slot recycling.
- **Docs**:
  - Created [`progress.md` §"I-5 scope"](progress.md) — goal +
    scope-narrowing rationale + sub-steps a-f + post-I-5 Z-order fix
    subsection + deferred list (pathfinding, NPCMode + pose sprites,
    first-tick alignment, NPC names, multi-fgExt source-faithful order).
  - Updated [`progress.md` §"I-2c"](progress.md) painter rule description
    to match the current type-based z-priority implementation.
  - Updated [`research_map_render.md` §"Painter's algorithm"](research_map_render.md)
    clone subsection — gather-per-cell + type-based z-priority + LB-throne
    case + "why type-based, not entity-index" forward-compat reasoning +
    deferred fgExt rule.
  - Updated [`research_npc_ai.md`](research_npc_ai.md) — schedule file
    format corrected against `seg_0C9C.c:285`; empty-slot encoding
    quirk added; "Off-area handling" gained a port-deviation note for
    I-5d's OBJBLK-residency choice.
  - Updated [`research_world_data.md`](research_world_data.md) —
    open Link[]-iteration question marked partially mooted by the
    clone's z-priority approach.
  - Local memory `project_ultima6_npc_under_furniture_zorder_bug.md`
    flipped from "QUEUED for after I-5" to "FIXED" with mechanism +
    forward-compat rationale + deferred items.
  - **Post-impl ledger re-plan.** End-of-session discussion landed a
    revised post-I-5 trajectory in `progress.md`:
    - I-6 (next) = inventory data layer (was: avatar movement)
    - I-7 = UI substrate + object inspector view (was: I-8 dialog UI)
    - I-8 = avatar movement + NPC pathfinding folded together
    - I-9 = object-action dispatch core (USE/GET/LOOK/DROP + door
      handler) — was missing from the prior ledger entirely
    - I-10 = talk trigger (adds TALK as a case in I-9's dispatch +
      adjacency-pick logic)
    - I-11 = dialog window — substrate's 2nd surface
    - I-12 = conversation VM (β reached)
    - I-13 = status panel — substrate's 3rd surface
    - I-14 = object-action handlers expansion — fills in
      `seg_27a1.c`'s dispatch table (spellbooks / moonstones /
      instruments / etc.), gated on owning subsystems
    **Important USECODE clarification surfaced.** U6 has no
    "USECODE" in the Ultima 7 sense — instead, two distinct
    mechanisms: bytecode VM at `seg_1703.c` for NPC dialogue
    (the conversation VM, I-12), and a hardcoded C dispatch table
    at `seg_27a1.c` for object actions (the dispatch registry,
    I-9 + I-14). Object-action dispatch is the GENERAL "press a
    key, do X to entity in front of me" primitive — TALK is one
    case in the same dispatch table that USE/GET/LOOK share,
    which is why I-9 precedes I-10. Binding design decisions
    recorded: object inspector (not container view — one surface
    for any entity), modal-stack for nested containers (no inline
    tree), turn-driver suspended for the full modal-stack lifetime
    (sim activity stops until all inspectors close), integer-only
    step numbers (no decimals; ordering is positional, free to
    re-plan as we learn). Rationale + full re-plan in
    `progress.md` §"Why the post-I-5 trajectory re-plans..." +
    §"Object-action dispatch precedes talk trigger".
- **Open** (each owns a later step):
  1. **Pathfinding** (`C_1E0F_2D37` bucket-Dijkstra + RLE path). I-6
     territory — avatar movement needs it too.
  2. **`NPCMode` component + action-driven sprite swap.** Sleep/sit/eat
     pose sprites need an `NPCMode` field that the schedule system can
     set on snap + a render-side `action → frame/sprite` mapping. The
     four `AI_STAND_*` actions could be a cheap directional-facing
     interim (action → frame 0..3 = N/E/S/W) ahead of the full rework.
  3. **First-tick alignment on game-load.** Objlist's per-actor
     `a.schedule` byte (the saved `SchedIndex`) is parsed by
     `objlist.js` but not consumed by I-5c. Real save/load will
     need it.
  4. **NPC names.** `"(undefined)"` in the HUD probe comes from
     objlist's name section only filling party members. Real NPC
     names probably live in `LZNAMES` or similar — not yet decoded.
  5. **Multi-fgExt-per-cell source-faithful ordering.** Source's
     chain-TAIL insertion for foreground extensions means newer = top;
     our type-based sort inverts this for the rare case. Revisit if
     ever observed in real data.
- **Next**: push the squashed `impl I-5` + Z-order fix + the post-step
  doc-resync commit to origin, update the cross-PC sync state memory,
  then plan **I-6 (inventory data layer)** per the revised trajectory.

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
