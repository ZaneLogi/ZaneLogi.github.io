# research_verb_coverage.md — command-verb coverage: source vs clone

Branch-by-branch comparison of two source command verbs — **MOVE** and
**LOOK** — against their clone implementations, plus the
gameplay mechanics that surfaced as *deferred* during the audit. This is
the detailed companion to [research_object_interaction.md](research_object_interaction.md)
(which maps the five world-interaction commands at the subsystem level);
here each source branch is tracked individually as **ported / deviating /
deferred**.

**Framing.** The clone is a modern educational rewrite whose goal —
"wander the world and talk to NPCs" — is met. The verb *systems* (pick →
validate(range/legality) → apply → message, the registry dispatch, the
cell-pick tiers) are all built. What remains in the rows below is almost
entirely **gameplay-completeness**: descriptive-text detail, edge gates,
and mechanics that need subsystems the clone intentionally never built
(combat stats, the QuanType table, light/dark, move-point economy). These
are **deferred, not dropped** — every one is portable; none is a hardware
artifact. Only one genuine defect is recorded (the `TypeWeight==255` MOVE
over-gate, §1).

Legend: ✅ ported (behaviour matches) · ⚠️ deviating (wrong or differs) ·
⛔ not ported (deferred).

---

## 1. MOVE — `C_27A1_1E8B` (`seg_27a1.c:953-1224`)

Source MOVE is **one dual-mode verb**, branching at `:968` on whether the
picked object is on the ground (`LOCXYZ`) or carried:

- **Mode 1** (`:968-1043`) — ground object → **push** one tile.
- **Mode 2** (`:1044-1220`) — carried object → **give** to a person /
  **insert** into a container.

The clone splits this across two surfaces: the **`move` verb**
([command_dispatch.js](../systems/command_dispatch.js) `move` register +
`resolveMove` + `canPushTo` + the `awaitingDir` key handler) implements
**Mode 1 only**; **Mode 2** lives in the inventory window's `G` (give) and
`M` (move-to-container) keys ([inventory_picker.js](../view/inventory_picker.js),
`giveItem` + `openMovePicker` + `canInsertInto`). There is no "MOVE verb on
a carried item" from the map cursor — by design.

### 1a. Mode 1 — push a ground object

| Source branch | What it does | Clone |
|---|---|---|
| `:960` no/invalid selection | "Nothing." | ✅ `move` register ("Nothing to move.") |
| `:964` echo object name on pick | prints name | ⛔ not echoed (name appears only in the result message) |
| `:969` adjacency `CLOSE_ENOUGH(1)` | "Out of range!" | ✅ dispatch `withinReach(…,1)` |
| `:973` face the pushed object | turn avatar | ⛔ deferred (all facing deferred) |
| `:983` "To "+getch direction | text prompt | ✅ recast as a stage-2 armed arrow/numpad (`awaitingDir`) |
| `:995` **fixed gate** `TypeWeight==0 \|\| OBJ_19B` | "You can't move it." | ⚠️ **BUG** — clone adds `\|\| w===255` (`command_dispatch.js`, the `move` register + the Telekinesis push). `255` is the *carry* sentinel, not a push gate — see the note below. |
| `:999` NPC/self/locked push exclusion (`obj<0x100`) | can shove some NPCs, not others | ⛔ not ported — the `forUse` pick skips all NPCs, so pushing/swapping a creature is unsupported |
| `:1008` `SubMov(Active,5)` | spend 5 move-points | ⛔ deferred (move-point economy is project-wide deferred) |
| `:1012` push-into-open-container (`C_27A1_00A9` + `bp_0e<0xff`) | item drops inside | ✅ `resolveMove` via `containerAtCell`/`canInsertInto` |
| `:1015` blocked check `C_27A1_1DAB` | "won't budge" | ✅ `canPushTo` ("You can't move it there.") |
| `:1017/:1030` `OBJ_0DD` facing-frame on push | the directional cannon rotates to face the push | ⛔ deferred (cosmetic facing frame) |
| `:1035` `MoveObj` | relocate one tile | ✅ `moveMapObject` |

**The `255` over-gate (the one real defect).** Source's only push gate is
`TypeWeight==0` (`:995`). `255` is a *separate* sentinel: `GetWeight`
(`seg_155D.c:180`) rewrites `255 → 10000` ("effectively infinite"), which
blocks **carry (GET)** and **container-insert** — both weight-gated — but
**not push**, which has no weight gate. Proof it's pushable: source's push
handler *explicitly* relocates `OBJ_0DD` (the directional cannon, also
weight 255) with `MoveObj` + a facing-frame rewrite at `:1017-1036`; if 255
blocked pushing, that code would be dead. The clone copied GET's
"can't-carry-255" logic onto the push path, so it wrongly refuses to push
255-weight furniture (harpsichords, tables, cannons). The same clause sits
in the Telekinesis push. *Fix:* drop `w===255` from the MOVE/Telekinesis
fixed gate; keep it on GET. (This is the faithful way to clear a harpsichord
off a shadowed ladder — see §3.4.)

### 1b. Mode 2 — give / insert a carried object

| Source branch | What it does | Clone |
|---|---|---|
| `:1054` quantity prompt `C_27A1_13BE` | "move 10 of 50" | ⛔ missing (QuanType gap — whole stacks only) |
| `:1060` `di==OBJ_04C` refusal | a specific un-moveable item | ⛔ not ported (edge) |
| `:1080` give to person (`recipient<0x100`) | transfer to party | ✅ `giveItem` |
| `:1088` `IsPlrControl` → "Only within the party!" | party-only | ✅ `giveItem` |
| `:1101` carry weight → "Can't carry!" | recipient STR check | ⛔ deferred (carry-capacity, like GET/DROP) |
| `:1107` unready a 2H item on give | auto-unequip | ⛔ deferred (give); move-to-container silently unreadies instead of source's "unready it first" at `:1152` |
| `:1119` `GiveObj`/`InsertObj INVEN` | the transfer | ✅ `moveToInventory` |
| `:1126` give to self → "yourself." | no-op | ✅ `giveItem` |
| `:1135-1158` insert gates: ground / not-container / another-person's-bag / too-big / self | refusals | ✅ mostly via `canInsertInto` + picker scope (same-holder only); "too big" (an NPC) is N/A |
| `:1159` spellbook accepts only spells (`OBJ_039`/`OBJ_03A`) | restricted | ⚠️ clone excludes the spellbook as an insert target entirely (no spell-items) |
| `:1163` vortex cube accepts only moonstones (`OBJ_03E`/`OBJ_049`) | restricted | ⚠️ **deviation** — the clone's vortex is in `INSERT_CONTAINERS` with no moonstone-only check (would accept any item) |
| `:1167` out-of vs into a container | bidirectional | ✅ `openMovePicker` (both directions) |

### 1c. MOVE summary

- **One real defect:** the `255` push over-gate (§1a).
- **Faithful deferrals** (same class GET/DROP already defer): `SubMov(5)`
  move-points, face-the-target, quantity-split (QuanType), recipient
  carry-capacity, unequip-on-give.
- **Capabilities not ported:** pushing/swapping an NPC (`:999`); the cannon
  facing-frame (`:1017`); the vortex-cube moonstone-only restriction.

---

## 2. LOOK — `C_27A1_0C67` (`seg_27a1.c:472-637`)

Source LOOK is a **rich, multi-branch verb**: it names the target *and*
prints weight, damage/armor, quality detail, spellbook reagents, the time,
and runs an adjacency search — all into the message scroll. It ends by
calling the shared search routine `C_27A1_09A1` (`:402-469`).

The clone deliberately makes LOOK a **one-line scroll verb**
([command_dispatch.js](../systems/command_dispatch.js) `look` register):
`"Thou dost see X."` plus the I-book reader. Source's *detail* is pushed to
a separate **`I` Inspect modal** ([inspector.js](../view/inspector.js),
opened by the `I` hotkey in [main.js](../main.js)). This is a conscious UX
split: *naming* in LOOK, *detail/contents* in `I`.

### 2a. LOOK main handler

| Source branch | What it does | Clone |
|---|---|---|
| `:483` "Thou dost see " | lead-in | ✅ |
| `:484` face the look direction | turn avatar | ⛔ deferred (all facing) |
| `:489` **darkness gate** `D_B6DF` | "darkness." | ⛔ not ported (no light/dark subsystem) |
| `:496` empty/invisible → **name the terrain tile** | tile look string | ✅ (`getTileLook`, `assets/tiles.js`) |
| `:507` empty-tile adjacency search | "you find nothing." | ✅ stub *(but search is stubbed — §2b)* |
| `:513` NPC/multi-tile head resolve `COMBAT_getHead` | resolve to head | ~ partial (pick returns the head; no explicit walk) |
| `:515` **NPC / statue branch** → name + `C_27A1_02D9` | names + health/condition readout | ✅ names it; ⛔ NPC condition detail (`C_27A1_02D9`) deferred |
| `:524` identify `C_27A1_0841` (discovery + plural) | mark seen, plural flag | ⛔ deferred (no discovery flag / QuanType plural) |
| `:525` **stacked-tile top/left redirect** (`TIL_4DC`/`TIL_4DD`) | look through a 2-tile object to its anchor | ⛔ not ported |
| `:529` print object name | name | ✅ |
| `:530` **weight readout** "It weighs N.N stones" (0 & 255 suppressed) | weight line | ⛔ deferred → available via `I` Inspect, not LOOK |
| `:538` **damage points** "can do N points" | weapon stat | ⛔ deferred (no combat stats) |
| `:549` **armor points** "can absorb N points" | armor stat | ⛔ deferred |
| `:551` **quality/lit detail** `C_27A1_06D7`→`C_27A1_078F` | charges, lit, contents-on-ground | ⛔ deferred — except the **book/sign sub-case** ✅ (the I-book reader) |
| `:570` **spellbook → read a spell's reagents** (`OBJ_039`) | pick spell → SpellName + syllables + ingredients | ⛔ deferred (distinct from the `c` cast modal) |
| `:617` **clock / sundial** (`OBJ_09F`, or `OBJ_0EB` by day) | "The time is HH:MM A.M." | ⛔ not ported (cheap standalone win — `WorldClock` exists) |
| `:635` post-look **adjacency search** `C_27A1_09A1` | secret doors + spill | ⚠️ stubbed (§2b) |
| *(clone-only)* **I-book reader** | — | ✅ extension — a readable book/sign (`READABLE_BOOKS`/`READABLE_SIGNS` + non-zero quality) opens the `BOOK.DAT` modal. Faithful to `CanRead`, but rendered as a modal vs source's inline scroll text |

### 2b. Search routine `C_27A1_09A1` (the `:635` tail, also `:402-469`)

This routine is shared: LOOK-adjacent invokes it, and USE-on-chest uses its
spill half. The clone ported the **spill** half as `spillContents`
([use_container.js](../systems/use_container.js)) wired to **USE-on-chest** —
but LOOK's invocation is a canned stub, so neither reveal mechanic fires
through LOOK.

| Source branch | What it does | Clone |
|---|---|---|
| `:413` adjacency gate | only search when adjacent | ✅ `withinReach` before the stub |
| `:421` "Searching here, you find " | lead-in | ✅ |
| `:422` **secret door `OBJ_14E`** → reveal (frame ^1) | flips hidden→passable | ⛔ not ported (see §3.1) |
| `:436` **spill/reveal contents** (`FindInv` → `MoveObj` out) | search reveals hidden items onto the ground | ⚠️ ported as `spillContents`, but wired to **USE-on-chest, not LOOK's search** — so LOOK-searching a chest tile or a corpse finds nothing |
| `:464` "nothing." / "." | result | ✅ stub always says "nothing." |

### 2c. LOOK summary

- **Functional gaps** (behaviour, not flavour): the adjacency search is a
  canned stub — no secret-door reveal (`:422`, §3.1) and no spill-on-search
  (`:436`); the clock/sundial "tell the time" (`:617`) is unported; the
  darkness gate (`:489`) needs the light subsystem.
- **Deferred detail text** (reachable via `I` Inspect or absent subsystems):
  weight, damage/armor, quality detail, the LOOK-spellbook reagent reader,
  NPC condition readout.
- **Clone extension:** the I-book reader (book/sign → `BOOK.DAT` modal).

---

## 3. Deferred / not-ported gameplay mechanics

Surfaced while probing **Dungeon Wrong** (a walled-off down-ladder at
`(163,3,z1)`, reached from the surface mouth `OBJ_146` at `(500,81,z0)`).
All are characterized-but-deferred — portable, none implemented.

### 3.1 Secret door `OBJ_14E` — revealed by LOOK-search

`C_27A1_09A1` (`:422-429`): if the cell holds an `OBJ_14E` with an **even
frame** (hidden), searching it (adjacent LOOK) prints *"a secret door"* and
`SetFrame(obj, frame ^ 1)` → frame **2 → 3** = revealed. Passability flips
for free via the live tile flags: frame 2 → tile 1254 (impassable), frame 3
→ tile 1255 (passable). The clone's LOOK-search is a stub with no `OBJ_14E`
handling, so a hidden door stays an impassable wall (the doors guarding the
Wrong ladder are at `(158,2,z1)` and `(158,3,z1)`). A hidden door must also
not be named by LOOK or picked until revealed — only the *search* reveals
it (mirror source).

### 3.2 Dispel Field — spell `SPELL_21` (0x21, Circle 3)

Handler `seg_1944.c:1164` (dispatched `:2399`): `FindLoc` + `DeleteObj` the
first **spell-created** field of type `OBJ_13D`/`OBJ_13E`/`OBJ_13F`/`OBJ_140`
(fire/poison/sleep/energy); fizzles if none. In the clone "Dispel Field" is
in the spellbook list but **fizzles** (not one of the 7 implemented casts).
**It does not remove `OBJ_0AF`** (the dungeon force field — §3.3).

### 3.3 Force field `OBJ_0AF` — switch-only, the Wrong one is PERMANENT

`OBJ_0AF` has exactly two source references, both in the switch handler
`C_27A1_4672` (`seg_27a1.c:2158-2161`). The switch (`OBJ_0AE`) flips its own
frame, then **only if its `quality` is non-zero** scans `OBJ_12D` markers of
matching quality and adds/deletes the field at each. There is **no spell,
lever, or other removal** for `OBJ_0AF`. The Wrong field at `(160,3,z1)` has
a **quality-0** marker, and a quality-0 switch does nothing — so that ladder
is **sealed from the z1 side in U6 itself**. The clone is faithful leaving
it impassable (tile 735). **Do not invent a removal for it.**

### 3.4 USE-pick shadowing — furniture over a ladder

Wrong's up-ladder at `(234,50,z1)` ascends to a surface cabin at
`(930,210,z0)`, where a **down-ladder** (`OBJ_131` frame 0) round-trips back
— but a **harpsichord (`OBJ_9C`) sits on the same cell, on top of the
ladder**. The clone's USE-on-cell re-pick selects the top object (the
harpsichord), which has no handler → "Nothing happens"; the ladder never
gets a turn. The harpsichord *is* usable in U6 (`OBJ_9C` → music-instrument
`C_27A1_335A`, `seg_27a1.c:3091`), unported. The faithful in-game escape is
to **MOVE the harpsichord off the cell** then USE the exposed ladder — which
the `255` push over-gate (§1a) currently blocks. Open question before any
"fix": does U6's USE re-pick resolve a multi-object cell top-of-stack (as the
clone does) or prefer a usable/under object? If U6 also shadows it, the spot
is awkward-but-faithful.

### 3.5 Inventory `×N` display bug — the QuanType gap

A bag whose OBJBLK byte-6 quantity is 65 (read faithfully by
`assets/objblk.js`) shows **"bag ×65"** in the inventory window — it is one
bag. U6 never shows a count for a **non-stackable** object; the count is gated
by the **QuanType** table, which the clone hasn't ported, so
[inventory_picker.js](../view/inventory_picker.js) surfaces the inert
quantity for every item. Same root as the deferred LOOK count-prefix. Cheap
fix: suppress `×N` for items with a `Container` component. Proper fix: port
QuanType and gate both sites on it.

---

## 4. Bottom line

| Class | Items |
|---|---|
| **Real defect** | the `TypeWeight==255` MOVE/Telekinesis push over-gate (§1a) |
| **Small faithfulness fixes** | vortex-cube moonstone-only insert gate (§1b); LOOK clock/sundial (§2a) |
| **Functional gaps (deferred)** | LOOK-search secret-door reveal (§3.1) + spill-on-search (§2b); push-an-NPC (§1a); darkness gate |
| **Deferred-by-subsystem** | move-points, facing, QuanType (quantity-split, count-prefix, the ×N bug), combat stats (weight/damage/armor), light/dark, NPC condition, the LOOK-spellbook reader |
| **Faithful-as-is** | the Wrong force field is permanent (§3.3) — leave it |

Everything except the `255` defect is gameplay-completeness, consciously
deferred under the educational-port scope. None is a blocker for "wander the
world and talk to NPCs."
