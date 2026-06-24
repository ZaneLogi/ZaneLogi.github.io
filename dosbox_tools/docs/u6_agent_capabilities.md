# U6 agent capabilities — premise, how-to-play, and the tool surface

The agent's single reference: its **premise** (the goal), the **how-to-play** (the
U6 command model — from the Amiga/DOS manual, which matches our keyboard
automation), and the **tool surface** (the MCP tools that perceive state and drive
actions, each grounded in the `u6-decompiled` source).

Per the blind-discovery principle, the agent is given **premise + how-to-play
only** — never the quest solution. It discovers the chain by playing and
journaling. The quest docs are the eval oracle, withheld.

---

## 1. Premise (the goal — allowed input)

> You are the Avatar, summoned again by Lord British. The forces of Darkness have
> renewed their aggression — gargoyles have invaded Britannia and seized the
> shrines, and their army outmatches Britannia's. An ancient prophecy: *"One shall
> arise who possesses the strength of an army, the vision of a prophet and the
> heart of a saint; this Great One will bring an end to the struggle between the
> Darkness and the Light."* Lord British believes that is you, and calls you to
> fulfill it. Talk to everyone, ask many questions — that is how leads surface.

That last sentence is the manual's own advice and is exactly the intended
behavior: premise, not steps.

---

## 2. How to play (U6 keyboard command model)

U6 is mouse-or-keyboard; we drive the **keyboard** path (SendInput into DOSBox).

- **A command = press the first letter of its name, then select a target**
  (a direction key, or a cursor target). The 10 main commands:
  `A`ttack · `C`ast · `T`alk · `L`ook · `G`et · `D`rop · `M`ove · `U`se ·
  `R`est · `B`egin/break combat.
- **`U`se** is the multi-purpose interaction: open/close **doors & chests**, enter/
  exit ships, **climb ladders**, mount horses, light fires, ring bells, eat/drink.
  → opening a door and **leaving via the castle gate** is `Use`.
  - **Locked doors/chests need the key explicitly — the engine does NOT auto-find
    it** (seg_27a1.c:1280/1389/3066). A plain `Use` on a locked target (door frame
    8–0xB; magically-locked ≥ 0xC) only prints *"locked"*. You `Use` the **key**
    (`OBJ_040`) and target the lock; it opens only if `GetQual(key) ==
    GetQual(target)` (the lock-id) with the target's qual ≠ 0. Lockpicks (`OBJ_03F`)
    handle qual-0 locks (dexterity-gated, can break). So `u6_use` will read the
    target's **frame + quality**, find the matching owned key, then drive
    `U → key → target` — i.e. the agent does the ownership/qual check the engine
    skips, making a locked door "just open" from the agent's view.
- **`L`ook** identifies anything and reads books/signs; **on an adjacent object it
  searches it** (reveals container contents, hidden items, secret doors).
- **`G`et** picks up an adjacent object if not too heavy.
- **Equipping is NOT a letter command** (`R` is *Rest*). It is an **inventory-panel
  interaction** — keyboard: `<tab>` to the panel → arrow/numpad to the item →
  `<enter>` to ready/unready; `F1`–`F8` switch members. (Hardest action to drive.)
- **Party vs solo:** `1`–`8` put one member in **solo** mode; `0` returns to
  **party** mode. **⚠ You cannot Talk, or Use ladders/dungeon-entrances/moongates,
  in solo mode — you must be in party mode.** So *ensure party mode before talking*.
- **`B`** toggles party mode ↔ combat mode. In combat, player moves are leashed to
  Chebyshev ≤ 8 of the combat centre.
- **Talk:** type single words + `<enter>` (abbreviate to 4 letters). Everyone
  answers `name`/`job`/`bye`; some answer `join`/`leave`. Empty `<enter>` or `bye`
  ends. (We read the valid keyword branches straight from `TalkBuf`.)
- **Turn-based + buffered input:** a key sent in the wrong context is consumed
  wrongly, not lost. **Gate every send on `u6_input_state == COMMAND_READY`** (the
  action tools already do this).

---

## 3. Turn / input model — `u6_input_state`

Poll before acting. States (game loop `C_0A33_1CB4`, seg_0A33.c:1020):

| state | meaning | what to do |
|---|---|---|
| `COMMAND_READY` | parked at the top-level prompt (your turn) | send a move/command |
| `CONVERSATION` | a talk is active | reply with `u6_say` |
| `SELECTING` | a command is awaiting a target/direction | supply it |
| `MOUSE_MODE` | mouse UI mode | keyboard play wants this off |
| `BUSY` | processing the turn / animating | wait |

`u6_move`/`u6_talk`/`u6_goto`/`u6_validate_passability` call `_wait_command_ready`
internally, so they fire only on a real turn boundary.

---

## 4. Tool surface

**Perceive:** `u6_avatar` (controlled actor pos+facing), `u6_party` (solo/party,
combat, who's controlled), `u6_roster_status` (STR/DEX/INT/Level + load caps),
`u6_input_state` (turn-readiness), `u6_object(slot)` (incl. tile/weight/equip-slot),
`u6_inventory(npc_slot)`, `u6_npcs_near(radius)`, `u6_objects_near(radius)` (map
items + gear hints), `u6_walkable` (40×40 grid), `u6_conversation` (live talk +
TalkBuf).
**Act:** `u6_move` · `u6_talk` · `u6_say` · `u6_look` · `u6_get` · `u6_key`.
**Navigate:** `u6_pathfind` (plan) · `u6_goto` (closed-loop) · `u6_talk_to`.
**Verify:** `u6_validate_passability` (predict-vs-live passability gate).
**Inherited:** base mem tools + input tools (escape hatches).

---

## 5. Capability map (player intent → tool, with source)

| Intent | Act | Perceive / confirm | Status |
|---|---|---|---|
| Know it's my turn | — | `u6_input_state` | ✅ HAVE |
| Talk to LB / NPCs | `u6_goto`→`u6_talk`→`u6_say` (party mode!) | `u6_npcs_near` + `u6_conversation` | ✅ HAVE |
| Move / explore | `u6_move` / `u6_goto` | `u6_walkable` / `u6_avatar` | ✅ HAVE |
| Solo↔party / combat awareness | `u6_key('0')` / `'1'..'8'` | `u6_party` | ✅ HAVE (act = key) |
| Check party inventory | — | `u6_inventory(member)` | ✅ HAVE |
| Roster STR/DEX/INT + load | — | `u6_roster_status` | ✅ HAVE |
| Locate gear in the world | — | `u6_objects_near` | ✅ HAVE |
| Is it readyable + which slot | — | `u6_object` (tile/weight/slot) | ✅ HAVE |
| Identify / search (`L`) | `u6_look` | name via scroll; re-read state | ✅ HAVE (verify live) |
| Pick up gear (`G`) | `u6_get` | `u6_inventory` / `u6_object` | ✅ HAVE (verify live) |
| Equip gear (panel UI) | **`u6_ready`** (`<tab>`→nav→`<enter>`) | `u6_inventory` (EQUIP) | ❌ GAP (hard) |
| Use key / open door / leave gate (`U`) | **`u6_use`** | `u6_walkable` (cell opens) | ❌ GAP |

"Suit the party" = the agent's **reasoning** over readyable+slot+weight (per object)
× STR caps+free slots (per member) — thin tools, agent decides.

---

## 6. Milestone 1 plan

**M1:** post-intro castle save → talk to LB → collect + equip the gear he names →
explore → leave the castle. (On foot, party mode, no combat.)

- **Slice 1 (talk + explore + leave-if-open):** needs no new gameplay tools beyond
  `u6_input_state` — it's the live validation of the whole perceive/act/nav stack.
- **Gear slice (full M1):** *perception done* — `u6_roster_status`, `u6_objects_near`,
  and `u6_object` (tile/weight/equip-slot) give the full "suit yourself" inputs.
  *Simple action verbs built* — `u6_look`, `u6_get` (letter+target, turn-gated;
  confirmed live, not offline). *Remaining:* `u6_use` (key qual-match) and
  **`u6_ready`** (inventory-panel UI, hardest) — both held for live Slice 1.

**The authoritative M1 phase plan + the live Slice-1 runbook/validation gate live
in `u6_ai_agent.md` §5 & §7** (single source — not duplicated here). Progress:
turn gate ✅, gear perception ✅, `u6_look`/`u6_get` ✅ (live-unconfirmed);
remaining `u6_use` + `u6_ready` held for live Slice 1.

---

## 7. Source-grounded offsets (validated this effort)

All DGROUP / DS-relative (`u6-decompiled`). Re-derive before relying.

| Datum | Where | Note |
|---|---|---|
| Party[] / PartySize / Active | `0x3533` / `0x8E50` / `0x2C54` | control roster; Party[Active] = controlled |
| Solo flag `D_2CC3` | `0x2CC3` (signed) | `<0` party, `≥0` solo (= Active) |
| InCombat / EnemiesNum | `0x2CC2` / `0xEBFB` | combat leash = Chebyshev 8 |
| Turn gate: AllowMouseMov / SelectMode / MouseMode | `0x04C4` / `0x0492` / `0x04BE` | + IsInConversation `0x098B` |
| STR / DEX / INT / Level | `STREN 0x8C4A` / `DEXTE 0x3316` / `INTEL 0x3433` / `0x8E4C` | per-slot bytes |
| Load caps | carry = STR×20 (seg_1944.c:1945); equip = STR×10 (seg_155D.c:546) | current load via `TypeWeight 0xB417` |
| Equip slot | `STAT_GetEquipSlot` (seg_155D.c:129) on `TILE_FRAME`; weapons table `D_07DD 0x07DD` | −1 = not readyable |
| Names[][14] | `0x3236` | indexed by party index |
| Passability tables | TerrainType `0xB3EB` / TileFlag `0x8C46` / D_B3EF `0xB3EF` / BaseTile `0x6824` | see dosbox_u6_passability.md |
