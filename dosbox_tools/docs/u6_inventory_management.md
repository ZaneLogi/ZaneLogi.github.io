# U6 inventory management — `u6_container` + `u6_move_object`

Two tools that let the agent **read** a carried container's contents and **move**
objects around the inventory (drop, give, into/out of bags, with stack splitting).
Both were learned live from play on 2026-06-28 and cross-checked against the
u6-decompiled source. The move tool **drives the real engine D/M commands by
keyboard** — it never writes the object lists (`Link[]`/`MapObjPtr`/weights/
stacking stay the engine's job), the same philosophy as `u6_get`/`u6_ready`.

Sources: `seg_27a1.c` C_27A1_1E8B ("move"), `seg_1184.c` InsertObj/MoveObj/
GiveObj/TakeObj, `seg_155D.c` C_155D_1267 (panel hit-test).

---

## 1. The object model (read side)

Every object is a node in the engine's parallel arrays, indexed by slot:

| field | RAM (DS-relative) | meaning |
|---|---|---|
| CoordUse | `ObjStatus[slot] & 0x18` | `0`=LOCXYZ (map) · `0x08`=CONTAINED · `0x10`=INVEN · `0x18`=EQUIP |
| position / holder | `ObjPos[slot]` (3 B) | LOCXYZ → packed x10\|y10\|z4; else first 2 B = **assoc** (parent: a container object or a holder NPC) |
| type/frame | `ObjShapeType[slot]` (2 B) | type=`&0x3ff`, frame=`>>10`; **type 0 = a freed/empty slot ("husk")** |
| quan/qual | `Amount[slot]` (2 B) | low byte = quan (QuanType-2 stacks), high byte = qual; gold (QuanType 4) uses the full 2-byte value |

The engine also threads a `Link[]` sibling chain (`0xBDDA`) per parent; **the tools
do not touch it** — the engine maintains it. Reads are done by a linear scan over
the arrays (filter by CoordUse + assoc), not by walking `Link`.

`quan_type(type)` (port of `C_1184_21C7`): 4 = gold (`OBJ_058`); 2 = the `_QUANTYPE2`
set (torches, the 8 reagents, food, arrows, …); 0 = a discrete single object.

### Husks
Whole-stack moves that merge into a same-type stack `DeleteObj` the source: the
slot's type goes to 0 but CoordUse/assoc/Amount linger until the slot is reused.
The game's own panel walks `Link` and ignores these; a linear scan would surface
them, so **`u6_inventory` and `u6_container` skip `type==0` slots**.

---

## 2. `u6_container(slot)` — read a container's contents

Pure read; no keyboard. Scans for objects with `CoordUse==CONTAINED` and
`assoc==slot`, recursing into nested bags (indented). This is the gap
`u6_inventory` cannot fill: `u6_inventory` lists only `INVEN`/`EQUIP` items held
*directly* by an NPC, so a carried bag's contents — and items left
`CONTAINED`-under-a-member by a take-out-of-bag move — are invisible to it.

---

## 3. The keyboard move mechanism (what `u6_move_object` drives)

### Commands
- **`D`** (drop): an inventory item → a **map tile**. Arms the panel select-cursor
  directly (`SelectMode=2`).
- **`M`** (move): an inventory item → a **member** (owner-icon), a **container**
  (container cell), or **out** of its container. Starts on the **map** cursor
  (`SelectMode=1`); **`Tab`** toggles into the panel cursor (`SelectMode=2`).

### The cursor — the key discovery
The live select-cursor is **`PointerX`(0xB6A3) / `PointerY`(0xB6A5)** in *pixels*,
**NOT** `PanelCol`/`PanelRow` (which is the USE/READY nav cursor and goes **stale**
during a move). Panel hit-test (`C_155D_1267`):
- backpack cell `(col,row)` = pixel `(248 + col*16, 32 + row*16)`, within
  `X∈[248,312) Y∈[32,80)`; so `col=(X-248)/16, row=(Y-32)/16`.
- **owner-icon** (the displayed member / open container = the "give-to / take-out-of
  this" target) = `X∈[272,288) Y∈[16,32)` (drawn at 272,16), one tile above the grid.

Navigation facts (all verified): `Tab` **resumes the last cursor position** (never
assume (0,0) — always read `PointerX/Y`); **Up** from any top-row cell snaps to the
owner-icon; **Down** from the owner-icon re-enters the grid. So the tool
arrow-walks from the live cursor toward the target, **re-reading after every key
and retrying dropped keys** (raw SendInput drops keys if sent too fast — the engine
needs the inter-key delay `u6_ready` uses). UP is only issued from a row *below*
the target so it never accidentally jumps to the owner-icon.

### The "How many?" split
Selecting a **stackable with count > 1** as the source pops a `CON_gets` "How
many?" line prompt — detected via `LineInput`(0x049B) **low byte == 1** (note:
`u6_input_state` currently mislabels this as MOUSE_MODE; it doesn't check
LineInput). A **single stackable (count 1) and any non-stackable skip the prompt.**
The tool **detects, never assumes**: after the selecting Enter it polls LineInput
and types the amount only if the prompt appears (default = the whole stack).

### Destination → engine primitive (`Selection` set by the destination Enter)
| destination | how targeted | engine effect |
|---|---|---|
| ground | `D` → map cursor → arrow(s) → Enter | `MoveObj` → LOCXYZ |
| member N | `M` → … → `F<N>` → Tab → owner-icon → Enter | `InsertObj(item, member, INVEN)` (stack → `GiveObj` merge) |
| into container | `M` → … → Tab → container cell → Enter | `InsertObj(item, container, CONTAINED)` |
| out of container | open bag, `M` → … → Tab → owner-icon(of the open bag) → Enter | `InsertObj(item, bag's parent, CONTAINED)` → lands in the holder's pack |

Stackable transfers between *owners* merge/split via `GiveObj`+`TakeObj`. **A
container opened on a panel** (Tab → container cell → Enter, outside a move) sets
`D_E709` to it and repopulates the 12-cell view with its contents.

---

## 4. `u6_move_object(target, dest, amount=0)`

`target` = source object slot (`0x..` / number / `inv:..`).
`dest` ∈ `ground[:n/s/e/w]` · `member:<N>` (1-based; 1=avatar) · `container:<slot>`
· `out`. `amount` = how many of a stack (0 = all; ignored for non-stackables).

Validation/guards mirror the engine: EQUIP source → "unready first"; LOCXYZ source
→ "use u6_get"; a source **inside a container** must go `out` before `ground`/
`member`/`container` (so **container→container is two calls**: `out`, then
`container:`); no container-into-itself. Each step is verified by reading
`PointerX/Y` / `Selection` / `SelectMode`; any mismatch **ESC-resets** and returns
an error string instead of leaving the panel armed.

The five operations (the agent's goals): **drop**, **member→member**,
**into-container**, **out-of-container**, **stacked split** — plus
container→container as out+in.

---

## 5. Live verification (2026-06-28, fresh save, Monica)

All driven through the tools, each result independently re-read:
- `u6_container(bag)` — listed all 8 reagents + counts. ✅
- member→member — spellbook Monica→Dupre (`INVEN assoc=Dupre`). ✅
- stacked split — 2 of 6 torches → Dupre (Monica 6→4, Dupre +2 new slot). ✅
- into-container — ankh → bag (`CONTAINED assoc=bag`). ✅
- out-of-container — ankh `out` → back to pack. ✅
- drop — ankh → `ground:n` (`LOCXYZ`). ✅
- **stress test**: consolidated **two full reagent sets + a loose reagent into one
  bag** (17 chained moves) — every merge/quantity exact; the other bag empty. ✅
- **organize**: bagged Monica's food (bread+meat) into her empty bag. ✅

This surfaced the **husk** artifact (now fixed: skip `type==0`) and confirmed the
`PointerX/Y`-cursor model + adaptive quantity handling.

---

## 6. Known follow-ups (not blocking)
- `u6_panel_state` now reports the live `PointerX/Y` cursor (fixed); `u6_input_state`
  still mislabels the "How many?" line prompt as MOUSE_MODE (doesn't read LineInput).
- `u6_move_object` verification reports the *source slot's* post-state; for a
  partial stacked move the source persists (reduced) and the moved portion is a new
  slot at the destination — verify counts via `u6_inventory`/`u6_container`.
- container→container is two calls by design (the engine offers no direct route —
  bag B isn't on screen while bag A is open).
