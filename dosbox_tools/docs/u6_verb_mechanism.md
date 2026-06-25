# U6 command (verb) mechanism — source model + how the MCP drives it

How Ultima VI's top-level commands (`A`ttack `C`ast `T`alk `L`ook `G`et `D`rop
`M`ove `U`se `R`est `B`egin/break-combat) work in the engine, and how the
`dosbox-u6` MCP reproduces each by driving the **real** game (keystrokes in,
memory reads out). One mechanism with per-verb parameters — the dispatch,
target-selection, result-drain and turn-gate are shared; verbs differ only in a
few fields.

All source citations are `D:\tmp\u6-decompiled\SRC` (ergonomy-joe `u6-decompiled`).
This is a **currently-true mechanism reference**; per-verb *build/verification
status* lives in `u6_agent_capabilities.md` §5 and `u6_ai_agent.md` §6, not here.
The object-naming subsystem that turns a tile into "club"/"leather helm" for the
result reports is its own doc, `u6_object_naming.md`. Movement passability is
`dosbox_u6_passability.md`.

---

## 1. The shared command model

A command is **press the first letter, then commit on a target** — not "letter +
direction". Pressing the letter enters a select-cursor mode; the handler fires
only on an explicit **commit**.

- `case 'L'/'T'/'G'/'U'/…` (`seg_0A33.c:1035-1138`) sets `SelectMode`, seeds the
  cursor at the actor (`AimX=AimY=5`), and sets `SelectRange`. The select family
  splits on `SelectRange`:
  - **`SelectRange=7`** (LOOK/TALK/ATTACK/DROP/REST/CAST): arrows **move** the
    cross-cursor (≤7 tiles, diagonals); commit needs an explicit **Enter**.
  - **`SelectRange=-1`** (GET/MOVE/USE): the arrow **auto-commits** to the
    adjacent tile (`seg_0C9C.c:1242` — `SelectRange==-1 → CMD_8E` on the arrow);
    **no Enter**.
- The dispatch sets `MouseMode=1`, prints `"<Cmd>-"`, then blocks in `CON_getch`
  (`seg_0A33.c:1248-1255`). The handler runs only when the select loop returns
  **`CMD_8E`** (commit) (`seg_0A33.c:1256-1264`).
- **Commit key = Enter** in `SelectMode==1` (`'\r' → CMD_8E`, `seg_0C9C.c:1206`);
  a mouse click commits too (`:820`). **Cancel = ESC ×2** (first clears
  `SelectMode`, second clears `MouseMode`).
- USE costs a turn: the handler tail runs `SubMov(Party[Active],5)`
  (`seg_27a1.c:3159`); LOOK/GET likewise resolve a turn. So after a commit the
  engine processes the turn (a transient BUSY) before returning to the prompt.

### The four ways to set `Selection.obj`

The handler operates on whatever `Selection.obj` is at commit. The select loop
(`seg_0C9C.c`) produces a commit four ways:

| Route | Keys | How `Selection` is set | Reach |
|---|---|---|---|
| **Adjacent map tile** | a cardinal arrow (`SelectRange=-1`) | world object at the tile (`mkMouseSelection`, `:597`) | adjacent only |
| | arrows then Enter (`SelectRange=7`) | world object at the cursor tile | up to 7 tiles, diagonals |
| **Self tile** | Enter (cursor stays at centre) | object on the actor's own tile (`:1206`) | the actor's tile |
| **Party member** | digit `1`–`8` in `SelectMode==1` | `Selection.obj = Party[n]` directly, `CMD_8E`, **no** mouse recompute (`:1298`) | any party member |
| **Inventory / equipment** | `<tab>` → navigate panel → Enter (§2) | `mkMouseSelection`→`C_155D_1267/130E` picks the panel item (`:604`) | held/worn items |

There is **no** shortcut that injects an arbitrary inventory item — the panel
route (§2) is the only path to an inventory target.

### The result-drain (`_drain_to_ready`)

`_input_state` classifies the engine from `AllowMouseMov / SelectMode / MouseMode
/ IsInConversation` → `COMMAND_READY | CONVERSATION | SELECTING | MOUSE_MODE |
BUSY`. `AllowMouseMov==1` (`==COMMAND_READY`) is raised **only** around the
top-level command `getch` (`seg_0A33.c:1028-1031`); every other getch (select
loop, message page-waits, result dismiss) runs with it 0. So the end signal is
**exact and count-free** — a 2-item and a 20-item container both *end* at the
top-level prompt.

`_drain_to_ready`: send Enter on any non-`COMMAND_READY`/non-`SELECTING` state
(`MOUSE_MODE` portrait/inventory getch, `seg_27a1.c:258`; or `BUSY` "press a key"
page-wait, `:507`), **sleep `_DRAIN_SETTLE=0.5`**, re-read, repeat; stop at
`COMMAND_READY`; cancel a stray re-entered command (`SELECTING`) with ESC ×2.
**The settle is load-bearing:** the throttled portrait/inventory redraw holds
`MouseMode=1`; reading too soon mistakes that transient for another page and
over-fires one Enter into the command prompt — surfacing as a stray `">What?"`
(a re-entered LOOK) or `"Not possible"` (a re-entered GET). Reading only the
**settled/resting** state makes the key count exact (bump to 1.0 on a slower box).

### Turn / solo-mode gates (binding for the agent)

- Gate every send on `u6_input_state == COMMAND_READY` (input is buffered; a key
  in the wrong context is mis-consumed, not lost). The action verbs call
  `_wait_command_ready` internally.
- **Solo mode blocks TALK and USE-of-ladders/dungeon-entrances/moongates** —
  must be in party mode (manual; engine: ladder case `seg_27a1.c:3098`
  `if(D_2CC3==-1) … else "Not in solo mode"`). Ensure party mode first.

---

## 2. Inventory / equipment targeting (the panel route)

This is the keyboard flow the manual documents verbatim ("press `<tab>` to move
the crosshairs to the status display… move to any item or button with the arrow
or numeric keypad keys, and press `<enter>`… `<tab>` again returns to the map.
F1–F8 switch members… `*` toggles portrait/inventory"). It maps exactly onto the
source:

- **Precondition:** the status panel must show the active char's inventory,
  `StatusDisplay == CMD_92`. `F1`–`F8` select member N (`seg_0C9C.c:1345/1369`),
  `*` toggles portrait↔inventory (`CMD_90↔CMD_92`, `:1331/1351`), `F10` →
  party list (`CMD_91`), `+`/`-` next/prev member (`CMD_99/9A`).
- **Tab** (`:1313`): `SelectMode 1→2` (panel selector), `SelectRange=7` (panel
  arrows no longer auto-commit). Tab again returns the cursor to the map.
- **Panel cursor** = `(D_0499 col, D_049A row)`; arrows move it
  (`:1248-1285`); `>12` items scroll via `D_07CE` (±4, `CMD_95/96`).
- **Backpack grid** (`C_155D_1267`, `seg_155D.c:458`): **4 cols × 3 rows = 12
  visible**, `index = row*4 + col`, object = `D_E70F[index]` (the visible-slot
  array; screen box X 248–311, Y 32–79).
- **Equipment silhouette** (`C_155D_130E`, `:486`): cursor cells map to
  `Equipment[0..7]` (head/neck/hands/…/feet).
- **Enter** in `SelectMode==2` + `CMD_92` → `do_CMD_92` then `mkMouseSelection`
  (`:1218-1228`): with `MouseMode==1` it picks the item under the cursor and
  returns `CMD_8E`, `Selection.obj` = the item.

Everything the agent needs to navigate precisely is in memory: `D_E70F[0..11]`,
`Equipment[0..7]`, the cursor `D_0499/D_049A`, and the scroll `D_07CE`.

---

## 3. Per-verb dispatch table

Letter → command (`seg_0A33.c`), the select params, the handler, and what it
targets. `SR` = `SelectRange`.

| Verb | Key | `SelectMode` | `SR` | Handler | Target | 2nd input |
|---|---|---|---|---|---|---|
| Look | `L` | 1 | 7 | `C_27A1_0C67` | map / inv (examine; search if adjacent) | — |
| Talk | `T` | 1 | 7 | `TALK_talkTo` | map NPC | conversation |
| Attack | `A` | 1 | 7 | `COMBAT_attack` | map target in weapon range | — |
| Rest | `R` | 1 | 7 | (rest) | guard = a party member | hours 1–9 |
| Get | `G` | 1 | −1 | `C_27A1_18F5` | adjacent map tile | — |
| Move | `M` | 1 | −1 | `C_27A1_1E8B` | adjacent map (push) / inv (transfer) | dest tile |
| **Use** | `U` | 1 | −1 | `C_27A1_6179` | map tile / self / **inventory** | varies (§4) |
| Drop | `D` | 2 | 7 | `C_27A1_14DA` | item (inv) → map spot | dest tile |
| Cast | `C` | 3 | 7 | `C_1944_4C2F` | spellbook → optional target | spell + target |
| Begin/break | `B` | — | — | `COMBAT_*` | (no target) | — |

---

## 4. The verbs in detail

### LOOK (`L`) / GET (`G`)

- **LOOK** identifies anyone/anything (map or inventory) and **searches** an
  adjacent object — `C_27A1_09A1` (`seg_27a1.c:634`) surfaces a container/corpse's
  hidden or contained items to visible `LOCXYZ` world objects. The agent can't
  read the message scroll, so the *state change* is the readable result (see §5).
- **GET** picks up an adjacent object (`LOCXYZ → INVEN`) if within the carry cap;
  `SelectRange=-1` so the arrow auto-commits (cardinal-adjacent only).
- An NPC LOOK shows a portrait (a `MOUSE_MODE` getch, `seg_27a1.c:258`); a
  container/empty-corpse shows a `BUSY` "you find …" page (`:507`). Both drain
  with Enter.

### TALK (`T`)

A `SelectRange=7` cursor command: walk the cross-cursor onto the NPC, **Enter** to
commit → `TALK_talkTo`. On a valid NPC `IsInConversation=1` (state
`CONVERSATION`); then the conversation sub-loop (`u6_conversation` → pick keyword
→ `u6_say`) takes over. Party mode required.

### USE (`U`) — the multi-purpose verb

`U` arms `SelectMode=1, SelectRange=-1` (GET-shaped), commits via the four routes
in §1, handler `C_27A1_6179` (`seg_27a1.c:2956`).

**Pre-switch gates** (`:2960-3014`): `COMBAT_getHead` → auto-find-adjacent
`C_27A1_0919` (map targets only) → usability `C_27A1_01DE` (else "you can't use
that") → `IN_VEHICLE` checks → **LOCXYZ adjacency** block (map objects must be ≤1
tile; the avatar turns to face) → terrain "Not now!" → **EQUIP "Must be in your
hand"** (the active char must own an equipped item). Tail: `SubMov(…,5)` (a turn).

The big `switch` (~45 type cases) routes each object type to a handler. What
matters for the MCP is **where the object must live** and **whether a second
input follows**.

**Target-location requirement (which uses are inventory uses):**

- **Map-only (`LOCXYZ`):** doors `129–12C` (`C_27A1_2A44`), chest `062`
  (`C_27A1_2BBC`, guard `!=LOCXYZ → error`), boardables `19C/19E/19F/1A7`, bell
  `0EC/1A3`, beehive `0B6`, cannon `0DD`, churn `0B5`, cow `1AC`, crank `120`,
  crystal ball `09B`, deflated balloon `1A4`, fountain `0EA`, ladder `131`, lever
  `10C`, switch `0AE`, well `0E9`, horse `1AE/1AF`, secret door `14E`
  (`C_27A1_32FA` — toggles a frame, **no** prompt), passthrough `116/118`,
  barrel/crate `0BA/0C0`, brazier/campfire `0CE/0FD`.
- **Inventory (`INVEN`/`EQUIP`):** food `05F…109` (`C_27A1_5F43` — eat, no
  prompt), drink `073–075`, torch `05A`, **key/lockpick `040/03F`**, potion
  `113`, gem `04D`, moonstone `049`, vocabulary `061`, balloon plans `10E`,
  sextant `05D` (surface only), instruments `09D/09C/09E/099/128`
  (`C_27A1_335A`), telescope `09A`, **staff `04E` (EQUIP-only)**, **pick/shovel
  `067/068` (EQUIP-only)**, virtue runes `0F2–0F9`, silver horn `139`, vortex
  cube `03E`, fishing pole `108`, powder keg `0DF`, candle `07A/091`, **orb of
  moons `057` (guard `==LOCXYZ → error`, so must be inventory)**.
- Several work **either** place (torch/key/gem on the ground or in the pack) — the
  engine branches on `CoordUse`.

**Handlers that take a SECOND input** (after the item/target is selected):

| Item | Handler (getch) | Second input |
|---|---|---|
| key / lockpick `040/03F` | `C_27A1_2D8E` (`:1401`) | a **map** target — "On " → the lock/door |
| potion `113` | `C_27A1_3832` (`:1708`) | a **party member** ("On whom") |
| orb of moons `057` | `C_27A1_5789` (`:2657`) | a **map** location ("Where:") |
| pick / shovel `067/068` | `C_27A1_4FC6` (`:2449`) | a **direction** |
| telescope `09A` | `C_27A1_5A97` (`:2752`) | a **direction** |
| instrument `09D/09C/09E/099/128` | `C_27A1_335A` (`:1540`) | a **digit string** `0`–`9`, then Enter (a non-digit ends it) |
| fountain `0EA` | `C_27A1_4E9B` (`:2407`) | a single keypress |

Everything else (food, drink, torch, gem, book, runes…) is a **single
selection** — `_drain_to_ready` already finishes it.

**Locked doors/chests need a key explicitly — the engine does NOT auto-find it.**
A plain USE on a locked target (door frame `8–0xB`; magically-locked `≥0xC`) only
prints "locked" (`C_27A1_2A44`, `seg_27a1.c:1285-1322`). The unlock is the key
flow: USE the key `OBJ_040`, target the lock; it opens only if
`GetQual(key)==GetQual(target)` with the target qual ≠ 0 (`:1421`). Lockpicks
`OBJ_03F` handle qual-0 locks (dexterity-gated, can break). So the agent does the
ownership/qual check the engine skips: read the door's frame band + qual, find the
owned key with the matching qual, then drive `U → key → door`. Frame bands:
`0-3` open · `4-7` closed-unlocked (plain USE opens) · `8-0xB` locked ·
`0xC-0xF` magically locked. Chest (`C_27A1_2BBC`): `0/1/2/3` =
open/closed/locked/magic.

### MOVE (`M`) / DROP (`D`) / CAST (`C`)

Listed for completeness (not yet built as MCP verbs):

- **MOVE** (`C_27A1_1E8B`, `SR=-1`): push a map item to an adjacent square, or
  transfer between characters / into a container. Second input = a direction/dest.
- **DROP** (`C_27A1_14DA`, `SelectMode=2`): select the item in inventory, then a
  map spot — the **inventory-then-map** two-selection idiom, same shape as the
  USE key flow.
- **CAST** (`C_1944_4C2F`, `SelectMode=3`): the spellbook shows in the panel;
  pick a spell (or type the syllable letters); some spells then need a map/party
  target. Requires a readied spellbook + reagents.

---

## 5. Driving the verbs from the MCP

The dosbox-u6 model is **drive input, read state** — never re-implement an
effect. Each route is a keystroke sequence; correctness is confirmed by re-reading
memory. Implemented today: `u6_use` (map tiles + carried items + the auto key
flow), `u6_ready` (equip/unequip), `u6_panel_state` (the panel-state read those
drive). Per-verb build/verification status lives in `u6_agent_capabilities.md` §5
and `u6_ai_agent.md` §6.

**Targeting** composes the four §1 routes — `u6_use` takes a target spec:
- `n/s/e/w` → adjacent map tile (arrow auto-commit).
- `here`/`self` → self tile (Enter).
- party member → digit `1`–`8` (route 3, clean and exact).
- carried item (`inv:<slot>` / a slot id from `u6_inventory` / `u6_panel_state`) →
  the panel route (§2).

**Inventory-select (`_panel_commit`, shared by USE-on-item + READY):** `F<member>`
→ INVENTORY view (`StatusDisplay==CMD_92`); a `locate()` finds the item's cursor
cell; [the command letter `U` → `SELECTING`, for USE; **none** for the
command-less READY toggle]; `Tab` → `SelectMode==2`; **place the cursor by WRITING
`D_0499/D_049A`** to the cell; `Enter` → confirm (USE: `Selection.obj==slot`;
READY: the `INVEN↔EQUIP` flip). Each step is a guarded read; any mismatch
ESC-aborts (an abort before the effect costs no turn).

The cursor is **memory-written**, not arrow-counted: blind arrow-nav across scroll
+ the equip/backpack boundary is brittle, and the Enter redraw (`C_0C9C_1AE5(2)`)
sets `PointerX/Y = D_054B[col]/D_0559[row][col]`, so the write lands exactly. The
cell maps are verified against those tables (seg_0C9C.c:103) — backpack cell (r,c)
→ cursor `(c+3, r)`; equip slot → `HEAD(1,0) NECK(0,0) RHND(0,1) RFNG(0,2)
CHST(2,0) LHND(2,1) LFNG(2,2) FEET(1,2)`. The commit + handler still run in the
real engine; only the placement is a poke.

**Plain backpack vs open container.** Within `CMD_92` the grid shows either the
member's backpack or an opened container's contents — distinguished by `D_E709`
(`< 0x100` = plain backpack; `≥ 0x100` = the open container). The inventory-select
assumes top level, and `F<member>` redraws the member's view (resets `D_E709`), so
it lands on the plain backpack. A carried item must be on the **visible page**
(`D_E70F[12]`); a deeper item reports "scroll first".

**Second-input handling** makes a multi-input USE a small state machine, not a
fixed key sequence — the agent branches on the selected item's type (read from
memory) and supplies the second input *before* draining (else the drain's ESC/Enter
cancels the sub-prompt):
- key (`040/03F`) → drive the map door target (after the qual ownership check).
- potion (`113`) → drive a party-member digit.
- orb (`057`) → drive a map "Where".
- pick/shovel (`067/068`), telescope (`09A`) → drive a direction.
- instrument → send a digit string + Enter.
- single-prompt / none → drain as usual.

In `u6_use` the **locked-door key flow is automatic**: USE a locked door (frame
`8–0xB`) → the tool reads its qual, finds the member's owned matching key
(`_find_matching_key`: an `OBJ_040` of equal qual, or a lockpick on a qual-0 lock)
and drives `U → key (panel) → door (arrow)`. It is **container-aware** — the search
includes CONTAINED items and resolves ownership up the assoc chain — so a key inside
a bag is **reported** ("take it out first"), not silently missed. (USE can't reach a
contained item; extracting it needs MOVE / container drill-in, deferred.)

**Result read-back** (the agent reads STATE, never the scroll):
- map fixtures → re-read the tile (a door/chest's open/closed/locked **frame
  state**; `_use_result_at_tile`).
- inventory uses → re-read the item (consumed? frame toggled — torch lit, potion
  gone) and any affected target (party HP for a potion, the door for a key).
- LOOK → re-read the tile for newly-surfaced `LOCXYZ` objects (`_notable_at_tile`).

Object names in these reports come from `u6_object_naming.md`.

---

## Deployment note

The MCP server runs from a **deployment copy** (e.g. `C:\Z_Temp\tools\dosbox_mcp\`);
both `dosbox_u6_server.py` **and** `u6_look_names.py` must be copied there.
Impl-only changes need a **server reconnect**; adding/changing tool signatures
needs a **full Claude restart**. `read_linear`/`read_dos` take **decimal** ints,
not `0x..` strings.
