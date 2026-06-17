# research_spellbook.md — minimal cast feature (I-spellbook)

Pre-implementation research for **I-spellbook**: a deliberately *limited* spell-casting
feature, anchored on **Telekinesis** (the only in-world way to pull a lever you can't
reach — see `research_level_change.md` / the 2026-06-17 lever fix in `Journal.md`). NOT a
magic system, NOT combat. Source: `seg_1944.c` (the spell module) + `spells.h`.

## 1. Scope

**In:** press `c` → a spellbook modal listing **all named U6 spells** (8 circles, with
reagents); `Enter` casts the highlighted spell. A small set of **non-combat spells is
actually implemented**; the rest are listed for the book's feel and **fizzle** ("Nothing
happens.") on cast.

**Implemented set (Zane, 2026-06-17):** Telekinesis · Locate · Gate Travel · Heal · Mass
Awaken · Create Food · Unlock Magic. Each routes into a subsystem the clone **already** has,
so the spell is wiring, not a new engine.

**Out (deliberate non-goals):**
- No **spellbook-item requirement** — `c` always opens the book (source needs a spellbook in
  inventory; skipped).
- No **reagent consumption or availability gate** — reagents are shown as info only; cast
  regardless of what's carried.
- No **mana / magic-point cost** — `maxMagic` (`stat_formulas`) is not consumed.
- No **INT / circle learning gate** — every spell is visible and castable.
- No **combat spells** (attack/field/summon/charm/etc.) — they fizzle.
- Skip **Telekinesis's missile arc + line-of-sight** (cosmetic; source fires `COMBAT_Missile`).

## 2. Source spell model

- **`SpellName[]`** (`seg_1944.c:143`) — the names, indexed by spell number, **16 slots per
  circle** (10 named + 6 empty `""`). So a spell's number encodes its circle:
  `MK_CIRCLE(n) = n/0x10 + 1` (`spells.h:112`). Circle 1 = `0x00–0x0F`, circle 2 = `0x10–0x1F`, …
- **`Reagents_needed[]`** (`seg_1944.c:255`) — a per-spell reagent bitmask, same 16/circle
  indexing. 8 reagent bits (`spells.h:9`): `MR`=mandrake root `0x01` · `NS`=nightshade `0x02` ·
  `BP`=black pearl `0x04` · `BM`=blood moss `0x08` · `SS`=spider silk `0x10` · `GA`=garlic `0x20`
  · `GS`=ginseng `0x40` · `SA`=sulfurous ash `0x80`.
- **`Reagents_name[]`** (`seg_1944.c:242`) — the 8 reagent display names.
- **`ReagType[]`** (`seg_1944.c:253`) — reagent bit → object number, for a future "do I have
  it?" check (deferred): `MR→OBJ_045 · NS→OBJ_046 · BP→OBJ_041 · BM→OBJ_042 · SS→OBJ_047 ·
  GA→OBJ_043 · GS→OBJ_044 · SA→OBJ_048`.
- **Cast dispatch** — a big block (`~:1033–1700`) for creature/area-targeted spells + a final
  `switch` (`~:2390–2500`) for the rest. `MK_CIRCLE`, `HAS_SPELL`, `SET_SPELL` macros in `spells.h`.

**Data plan:** extract `SpellName` + `Reagents_needed` (+ reagent names + `ReagType`) **verbatim
into a clone resource** `resources/spells.js` (ROM-data extraction, like the moongate red-gate
table). The book reads it; nothing comes from the user's dropped data.

## 3. The implemented spells

Reagent abbreviations as in §2.

### 3.1 Telekinesis — `0x15`, circle 2 — reagents BM, BP, MR ★ anchor
- **Source:** `C_1944_2DA7` (`seg_1944.c:1771`). Select an object at range; fire a missile to it; on a
  hit, dispatch on its type: **lever `OBJ_10C` → `C_27A1_4479`**, **crank `OBJ_120` → `C_27A1_433D`**
  (the drawbridge handler — `OBJ_120` is the *Crank*, `obj.h:602`, *not* a chest; `C_27A1_433D` is
  `seg_27a1.c:2056`), else **push the object one tile in a player-chosen direction** (a "Direction-"
  prompt → `MoveObj`, `seg_1944.c:1816-1826` — the MOVE-verb push, at range). It is a plain relocate:
  source does **not** call `C_27A1_00A9`/`InsertObj`, so a Telekinesis push never drops the object into
  a container.
- **Clone hook:** the lever + crank branches reuse the ported handlers directly — **lever** `OBJ_10C` →
  `useLever`, **crank** `OBJ_120` → `useCrank` (I-10e, `use_drawbridge.js:161`). The **push** branch is
  *not* a clean MOVE-verb reuse: the clone's MOVE verb gates on adjacency (CLOSE_ENOUGH-1) and Telekinesis
  is range+direction, so the push uses the push primitive (`moveMapObject`/`canPushTo`) **without** the
  adjacency gate. **Decision (push vs container-insert):** route the push to a plain `moveMapObject`, NOT
  the post-I-container MOVE-insert path — else Telekinesis would gain insert-into-open-container that
  source's `MoveObj` lacks.
- **Target/UI:** an object at range → reuse `command_dispatch`'s cell-cursor (`pendingVerb='spell'`). Skip
  the missile/LOS (so it always succeeds). **This is the payoff:** it opens far/blocked levers (the
  portcullis puzzles).

### 3.2 Locate — `0x35`, circle 4 — reagent NS
- **Source:** `C_1944_42AC` (`seg_1944.c:2345`). Computes a sextant position from **`MapX/MapY` — the map
  *viewport origin*, not the avatar's tile** (`(MapY-0x168)>>3` N/S, `(MapX-0x130)>>3` E/W; dungeon coords
  `<<2` first) and prints "`<lat> N/S, <long> E/W`".
- **Clone hook:** compute from the **same origin source uses** — the camera/viewport origin (or
  avatar-minus-half-viewport), NOT the raw avatar `Position` (that shifts the readout by ~half a viewport
  = up to ~1 sextant unit at `>>3`). → `MessageLog`. No new system. **No target.** Port the offset/shift
  verbatim so the number matches U6.

### 3.3 Gate Travel — `0x64`, circle 7 — reagents SA, BP, MR ★ reuse
- **Source:** `C_1944_305A` (`seg_1944.c:1842`). Prompts "To phase " (a moon phase **1–8**),
  validates it, checks the **blue-moongate endpoint `D_2C74[phase-1]`** is set, then `GateTravel(phase-1)`.
- **Clone hook:** the **I-moongate** system — `D_2C74` blue endpoints + `GateTravel`/`teleportParty`
  are all ported (`moongate_runtime.js`, `resources/moon_gates.js`). So this is wiring.
- **Target/UI:** a **digit input 1–8** (the phase) → if `D_2C74[phase-1]` is set, `teleportParty`
  there; else fizzle. (Same digit-input shape the dialog window uses.)

### 3.4 Heal — `0x06`, circle 1 — reagents GS, SS
- **Source:** routes through the creature-target block `C_1944_12FC` (dispatch `:2479`, grouped with Great
  Heal `0x34`); the HP restore is at `seg_1944.c:~1040`. Targeting is a **cursor selection of any creature
  at range** (you can heal an NPC), via `COMBAT_Missile`.
- **Clone hook:** objlist HP + `stat_formulas` (`maxHP`). **Target — deviation:** the clone uses the
  `party_status` roster picker (party members only), NOT source's at-range creature cursor — a non-combat
  simplification (can't heal non-party creatures). Clamp HP to `maxHP`.

### 3.5 Mass Awaken — `0x25`, circle 3 — reagents GS, GA
- **Note:** there is **no single "Awaken"** in this source — only **Mass Awaken** (substituted for
  the discussion's "Awaken"; same hook).
- **Source:** `seg_1944.c:2435` → `C_1944_256A` (the area "mass" handler) — wakes sleeping
  creatures in range.
- **Clone hook:** `AI_SLEEP` (the `canTalk` gate already reads it). **No target** — clear `AI_SLEEP`
  on NPCs within the avatar's area window.

### 3.6 Create Food — `0x00`, circle 1 — reagents GS, GA, MR
- **Source:** `C_1944_2B9A` (`seg_1944.c`, dispatch `:2422`) — adds food object(s) to inventory.
- **Clone hook:** `addMapObject`/inventory. **No target.** (Low value; trivial.)

### 3.7 Unlock Magic — `0x17`, circle 2 — reagents SA, BM
- **Source:** dispatch `:2418` → `C_1944_1DF4` (target an object, `seg_1944.c:1400-1410`). It clears a
  **magically-locked** lock only — and on **both** a door and a chest:
  - door (the `C_1944_0AA9` door test) at state magic-locked (`frame & 0xc == 0xc`) → `C_27A1_2A44(obj,
    0, 0, 1)` (the bp06 magic-unlock) → closed-unlocked (state 1).
  - chest `OBJ_062` at frame 3 (magically locked) → `C_27A1_2BBC(obj, 0, 0, 1)` → frame 1 (closed-unlocked).
  - anything else → fizzle. It does **not** touch a key-locked (state/frame 2) lock — that needs the key
    (`C_27A1_2D8E`).
- **Clone hook:** the lock state lives in the frame for both objects — door `state = frame>>2` (0 open · 1
  closed · 2 key-locked · 3 magic-locked, `use_handlers.js`); chest frame 0 open / 1 closed / 2 key-locked
  / 3 magic-locked (I-container). Unlock Magic flips a frame-3 door/chest to closed-unlocked.
- **Cross-link to I-container:** this IS the in-world magic-unlock that I-container's plan defers ("no
  magic-unlock yet" — magically-locked chests force-open). When I-spellbook lands, Unlock Magic retires
  the chest magic-lock bypass for the frame-3 case.
- **Caveat — the temporary lock-bypass:** `useDoor` (and, post-I-container, the locked-chest path)
  currently *force-opens* locked objects (the 2026-06-04 door bypass + I-container's keyless force-open),
  so Unlock Magic is partly redundant until those bypasses revert to faithful refusal. Implement it to
  clear the magic-lock faithfully anyway. **Target:** a door/chest at range — source is range-exempt for
  SPELL_17 (skips the distance check, `seg_1944.c:1366-1377`).

## 4. The full named-spell catalog (what the book lists)

All named slots, by circle, with reagent masks (abbr. §2). **★** = implemented; the rest fizzle.

**Circle 1** (`0x00–09`): ★Create Food `GS GA MR` · Detect Magic `SA NS` · Detect Trap `SA NS` ·
Dispel Magic `GS GA` · Douse `GA BP` · Harm `SS NS` · ★Heal `GS SS` · Help `—` · Ignite `SA BP` ·
Light `SA`

**Circle 2** (`0x10–19`): Infravision `SA NS` · Magic Arrow `SA BP` · Poison `BM BP NS` · Reappear
`SS BM BP` · Sleep `SS BP NS` · ★Telekinesis `BM BP MR` · Trap `SS NS` · ★Unlock Magic `SA BM` ·
Untrap `SA BM` · Vanish `GA BM BP`

**Circle 3** (`0x20–29`): Curse `SA GA NS` · Dispel Field `SA BP` · Fireball `SA BP` · Great Light
`SA MR` · Lock `SA GA BM` · ★Mass Awaken `GS GA` · Mass Sleep `GS SS NS` · Peer `NS MR` · Protection
`SA GS GA` · Repel Undead `SA GA`

**Circle 4** (`0x30–39`): Animate `SA BM MR` · Conjure `SS MR` · Disable `SS NS MR` · Fire Field
`SA SS BP` · Great Heal `GS SS MR` · ★Locate `NS` · Mass Dispel `SS BP NS` · Poison Field `GS SS BP`
· Sleep Field `GS GA` · Wind Change `SA BM`

**Circle 5** (`0x40–49`): Energy Field `SS BP MR` · Explosion `SA BM BP MR` · Insect Swarm `SA SS
BM` · Invisibility `BM NS` · Lightning `SA BP MR` · Paralyze `SA SS BP NS` · Pickpocket `SS BM NS` ·
Reveal `SS NS MR` · Seance `SA SS BM NS MR` · X-ray `SA MR`

**Circle 6** (`0x50–59`): Charm `SS BP NS` · Clone `SA GS SS BM NS MR` · Confuse `NS MR` · Flame Wind
`SA BM MR` · Hail Storm `BM BP MR` · Mass Protect `SA GS GA MR` · Negate Magic `SA GA MR` · Poison
Wind `SA BM NS` · Replicate `SA GS SS BM NS` · Web `SS`

**Circle 7** (`0x60–69`): Chain Bolt `SA BM BP MR` · Enchant `SA SS MR` · Energy Wind `SA BM NS MR`
· Fear `GA NS MR` · ★Gate Travel `SA BP MR` · Kill `SA BP NS` · Mass Curse `SA GA NS MR` · Mass Invis
`BM BP NS MR` · Wing Strike `SA SS BM MR` · Wizard Eye `SA SS BM BP NS MR`

**Circle 8** (`0x70–79`): Armageddon `—` · Death Wind `SA BM NS MR` · Eclipse `SA GA BM NS MR` · Mass
Charm `SS BP NS MR` · Mass Kill `SA BP NS MR` · Resurrect `SA GS GA SS BM MR` · Slime `BM NS MR` ·
Summon `GA SS BM MR` · Time Stop `GA BM MR` · Tremor `SA BM MR`

## 5. UI — the spellbook modal

`c` is free (verbs `u/l/g/m/t` live on `document`; movement on `window`). Reuse the **UIStack +
`ui_widgets` list** (the inventory/dialog substrate):

- A scrollable list grouped by circle header ("── First Circle ──"), each row: spell name + reagent
  abbreviations; **★/highlight** the implemented few.
- Footer for the highlighted spell: full reagent names + a one-line description + "↑↓ select ·
  Enter cast · Esc close".
- Keys via the list widget's `onKey` (UIStack routes `document` keydowns): ↑↓ move, Enter cast,
  Esc close — exactly the dialog/inventory key model.
- Each reagent on a row is **tinted by whether the party carries it** (`ReagType` → obj number →
  scan party inventory) — purely informational (no gating, no consumption).

## 6. Casting flow

A **spell registry keyed by spell number** (mirroring the `useHandlers` registry), dispatched on
Enter:
- **No-target** (Locate, Mass Awaken, Create Food, Heal-self) → run effect → `MessageLog` → close.
- **Targeted object/cell** (Telekinesis, Unlock Magic) → close the book, arm the existing
  `command_dispatch` cell-cursor (a new `pendingVerb='spell'` mode), pick → run effect (Telekinesis →
  lever / crank / range-push; Unlock Magic → clear the door/chest magic-lock frame).
- **Party-member target** (Heal) → the `party_status` roster picker.
- **Digit input** (Gate Travel) → a 1–8 phase prompt → `teleportParty` to `D_2C74[phase-1]`.
- **Unimplemented** → `message("Nothing happens.")`.

## 7. Kept deviations (for the impl step)

- No spellbook-item, no reagent gate/consumption, no mana, no INT/circle gate, no combat — see §1.
- Telekinesis: no missile/LOS — target-pick + apply.
- "Awaken" → **Mass Awaken** (no single-target Awaken in source).
- Unlock Magic clears the door's magic-lock frame state but is partly redundant under the current
  door lock-bypass (§3.7) until that's reverted with the key/spell mechanism.
- Reagent display shows a have/don't-have tint (`ReagType` + inventory), informational only.

## 8. Decisions + one separate item

Resolved (Zane, 2026-06-17): list order is **source slot order = alphabetical within a circle**
(U6 already authored them that way — not a question). Reagent **have/don't-have tint is in scope**
(§5). Telekinesis needs **no chest handler** — its three branches (lever / crank / range-push) are all
ported (§3.1).

**Separate, now its own step (NOT an I-spellbook dependency):** USE-on-container — open a chest/barrel/
crate on the map — is now planned as **I-container** (`progress.md` §"I-container plan", confirmed
2026-06-17; it **spills contents to the ground**, not into an inventory window). It is **not** required
by Telekinesis (which routes to the crank, not a chest). The one real coupling is **Unlock Magic** (§3.7):
it clears a magic-locked chest's frame — the magic-unlock path I-container defers.
