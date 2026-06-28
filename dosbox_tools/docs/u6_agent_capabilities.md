# U6 agent capabilities — premise, how-to-play, and the tool surface

The agent's single reference: its **premise** (the goal), the **how-to-play** (the
U6 command model — from the Amiga/DOS manual, which matches our keyboard
automation), and the **tool surface** (the MCP tools that perceive state and drive
actions, each grounded in the `u6-decompiled` source).

Per the blind-discovery principle, the agent is given **premise + how-to-play
only** — never a hand-authored quest solution. It discovers the chain by playing
and journaling. The quest-trace / quest-log docs are the eval oracle, withheld.

**Rule of engagement — reading NPC scripts (`u6_script_disasm`).** The agent
*is* allowed to disassemble and read the full conversation script of an NPC it is
talking to (`u6_script_disasm` dumps the live TalkBuf as an addressed listing —
keywords, branches, flag gates, `GIVEOBJ`, answer keys). Reading it is fine; how
the agent *acts* on what it reads is governed by honesty:

- **Manual-lookup / copy-protection** (Lord British's "what was in the Compendium"
  quiz, rune/symbol identification, anything a boxed game's *manual* answers) — the
  agent **may answer directly** from the script. A legitimate owner has the manual;
  this is meta, not the quest.
- **Game puzzle** (a riddle whose answer is discovered by playing, a password hidden
  in the world, a deduced sequence, a "bring me X / do Y first" gate) — the agent
  **must solve it through play** (find, earn, deduce) and **must not** lift the answer
  from the disassembly, even though it could.
- Whenever it uses script-derived information, the agent **declares which case it is
  in** ("copy-protection lookup, answering directly" vs "quest gate, going to solve it").

And the load-bearing point: the script is the **"what"** (which keyword gives which
object, which flag gates which branch), never the **"how."** Navigation, prerequisite
chains, sequencing, combat, and the multi-NPC threads that actually *conquer* a quest
are not in any one script — the agent still has to figure those out by playing.

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
The full per-verb source mechanism + how the MCP drives each (the four targeting
routes, the inventory-panel route, the per-verb handlers and result read-backs)
is `u6_verb_mechanism.md`; this section is the agent-facing summary.

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
- **Reading dialogue (`u6_conversation`).** TalkBuf is a bytecode VM, not plain
  text, so `u6_conversation` **decodes** it (faithful port of `seg_1703.c`'s
  parse_statement / parse_factor / keyword dispatch): with no args → the NPC, the
  greeting, the prompt type, and the **askable keyword list**; `keyword="gargoyle"`
  → previews that keyword's response (decoded *ahead* of the prompt, so the agent
  reads it before committing with `u6_say`). IF/ELSE conditions are evaluated
  against **live** memory (flags/inventory/party/status); random-flavor branches
  show as `[either: A | B]`. **An unknown opcode → `status=DECODER_STOP`: the agent
  MUST halt and report it (never act on partial dialogue).**
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
combat, who's controlled), `u6_time` (in-game clock/date — ~0.5–1 min/step,
look/talk/use free, NPC schedules), `u6_roster_status` (STR/DEX/INT/Level + load caps),
`u6_input_state` (turn-readiness), `u6_object(slot)` (incl. tile/weight/equip-slot),
`u6_inventory(npc_slot)`, `u6_container(slot)` (a carried **container's** contents,
recursing nested bags — the read `u6_inventory` can't do, it lists only INVEN/EQUIP
held directly), `u6_panel_state` (which side panel is up + the inventory cursor/scroll/
slots/Selection; reports the live **PointerX/Y** cursor), `u6_npcs_near(radius)` (+ allegiance **`class`**:
party/enemy/ally/npc), `u6_objects_near(radius)` (map items + gear hints),
`u6_walkable` (40×40 passability, **allegiance overlay** `P`/`E`/`a`/`N`),
`u6_area_map` (40×40 decoded from **MapObjPtr** — doors drawn by state + a door
list), `u6_conversation` (**decoded**
dialogue + askable keywords + highlighted cues — see below), `u6_script_disasm`
(the **whole** NPC script as an addressed assembly listing — see the rule of
engagement above), `u6_npc_flags(npc)` (the NPC's TalkFlags byte — keyword-gated
progression, read before/after a keyword).
**Act:** `u6_move` · `u6_talk` · `u6_say` · `u6_continue` (page a convo to the next
prompt / single-key menu / `LEAVE`) · `u6_look` · `u6_get` · `u6_use` · `u6_use_object`
· `u6_travel` (door-aware: auto-opens/unlocks doors en route) · `u6_ready` ·
`u6_move_object(target, dest, amount)` (drop / give to a member / into-or-out-of a
container, with stack splitting — drives the D/M keyboard flow; see
`u6_inventory_management.md`) · `u6_key`.
**Navigate:** `u6_pathfind` (plan) · `u6_goto` (closed-loop, NPC target) ·
`u6_goto_xy` (closed-loop, world `(x,y)` — re-plans each step, **routes around
non-party NPCs**, stops adjacent to a closed door so you `u6_use` it) · `u6_talk_to`
· `u6_route` (whole-level planner over baked terrain) · `u6_area(radius)` (a
**bigger** bird's-eye map than the 40×40 — baked terrain + loaded 2×2-OBJBLK objects,
the whole building at a glance).
**Combat-safety (manual verbs — the USER triggers these; the agent does NOT fight):**
`u6_pacify(radius)` (set every spawned hostile in slots **0xE0–0xFF** within `radius` to alignment
**NEUTRAL** so it stands down — the temporary spawn pool only, where eggs/slime-splits/`AddMonster`
land; persistent/placed NPCs in 0x00–0xDF are left for the user to fight or flee) · `u6_heal_party`
(restore LIVING members to **MaxHP** and clear poison/asleep/paralyzed; dead members skipped, never
revived). Both are direct one-shot RAM writes grounded in `u6/combat.py`: hostility is alignment
(`NPCStatus & 0x60`; target re-picked every turn, seg_2337.c:1538 — so NEUTRAL stops an in-progress
attacker next tick, exactly like Charm), and `HP = MaxHP = min(255, Level*30)` is the Heal-spell write.
**Verify:** `u6_validate_passability` (predict-vs-live passability gate).
**Inherited:** base mem tools + input tools (escape hatches).

---

## 5. Capability map (player intent → tool, with source)

| Intent | Act | Perceive / confirm | Status |
|---|---|---|---|
| Know it's my turn | — | `u6_input_state` | ✅ HAVE |
| Talk to LB / NPCs | `u6_goto`→`u6_talk`→`u6_say` (party mode!) | `u6_npcs_near` + `u6_conversation` + `u6_script_disasm` | ✅ live-verified |
| Move / explore | `u6_move` / `u6_goto` | `u6_walkable` / `u6_avatar` | ✅ HAVE |
| Solo↔party / combat awareness | `u6_key('0')` / `'1'..'8'` | `u6_party` | ✅ HAVE (act = key) |
| Check party inventory | — | `u6_inventory(member)` | ✅ HAVE |
| Roster STR/DEX/INT + load | — | `u6_roster_status` | ✅ HAVE |
| Locate gear in the world | — | `u6_objects_near` | ✅ HAVE |
| Is it readyable + which slot | — | `u6_object` (tile/weight/slot) | ✅ HAVE |
| Identify / search (`L`) | `u6_look` | re-read state (names via LOOK.LZD) | ✅ live-verified |
| Pick up gear (`G`) | `u6_get` | `u6_inventory` / `u6_object` | ✅ live-verified |
| Equip / unequip gear | `u6_ready(slot)` | `u6_panel_state` / `u6_inventory` (INVEN↔EQUIP flip) | ✅ live-verified |
| Read a carried bag's contents | — | `u6_container(slot)` | ✅ live-verified |
| Drop / give / bag items (D & M) | `u6_move_object(slot, dest[, amount])` — `ground[:dir]` / `member:N` / `container:slot` / `out` | `u6_object` / `u6_container` (CoordUse/assoc flip) | ✅ live-verified (drop, member→member, in/out container, stacked split, multi-bag consolidation, 2026-06-28) |
| See which side panel + the inventory | — | `u6_panel_state` | ✅ live-verified |
| Open/close door, leave gate, ladder (`U`) | `u6_use` (n/s/e/w or `here`) | door/chest frame state in return | ✅ live-verified (opened oaken doors en route to the Avatar's room, 2026-06-26) |
| USE a carried item (drink/eat/light/play…) | `u6_use(inv:slot[, on=…])` | re-read the item (consumed / frame change) | ✅ built (live-unconfirmed) |
| Open a *locked* door/chest (`U`) | `u6_use` (auto key flow) | finds the owned `OBJ_040` qual-match; reports a key stuck in a bag | ✅ live-verified 2026-06-29 (steel door qual-1, key 0x381, auto-unlocked via `u6_travel`) |
| Avoid a fight (stand spawns down) | `u6_pacify(radius)` (USER-triggered) | `u6_npcs_near` (`class` enemy→npc) | ✅ live-verified 2026-06-29 (dungeon giant rat slot 0xE0 → NEUTRAL) |
| Heal the party to full | `u6_heal_party` (USER-triggered "heal") | per-member HP before→max + ailments cleared | ✅ live-verified 2026-06-29 |
| Leave the castle (gated exit) | `u6_use` lever/crank + `u6_travel` (auto-unlock) | drawbridge/portcullis state via `u6_at` / `u6_nearest` (affordance link) | ✅ live-verified 2026-06-29 (key→steel door → lever→portcullis → crank→drawbridge → crossed out) |
| Tell friend from foe / spot threats | — | `u6_npcs_near` (`class`) · `u6_walkable` / `u6_area_map` (`P`=party swap-through · `E`=enemy · `a`=ally · `N`=npc, via NPCStatus alignment) | ✅ live-verified |
| See doors on the map (a *closed* door reads as a wall on `u6_walkable`) | — | `u6_area_map` (MapObjPtr → `+`closed / `=`locked / `'`open + door list w/ key-qual + bearing) | ✅ live-verified |
| Walk to a world coordinate | `u6_goto_xy(x,y)` | step log / `u6_avatar` | ✅ live-verified (drove across the castle to the west wing, 2026-06-26) |

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
  *Action verbs built* — `u6_look`, `u6_get` (LOOK/GET live-verified), `u6_ready`
  (equip/unequip via the inventory panel) and `u6_panel_state` both **live-verified
  2026-06-26** (repeated back-to-back unready→ready on a party member, no manual ESC,
  `SelectMode` self-cleared after each — see `u6_verb_mechanism.md` §2). `u6_use`
  **map-tile path live-verified 2026-06-26** (opened oaken doors en route to the Avatar's
  room); its carried-item and **auto** locked-door key flows are built + offline-tested
  but still **live-unconfirmed**. **M1's toolset is complete.** Navigation/perception also
  gained `u6_area_map` (doors decoded from MapObjPtr), `u6_goto_xy` (closed-loop coordinate
  nav that routes around non-party NPCs) and the allegiance-aware grid (`P`/`E`/`a`/`N`) —
  all live-verified on the "find the Avatar's room" run.

**The authoritative M1 phase plan + the live Slice-1 runbook/validation gate live
in `u6_ai_agent.md` §5 & §7** (single source — not duplicated here). Progress:
turn gate ✅, gear perception ✅, `u6_look`/`u6_get`/`u6_ready`/`u6_panel_state` ✅
live-verified, plus TALK/`u6_conversation`/`u6_script_disasm` ✅ live-verified;
`u6_use` ✅ map-tile + **locked-key flows live-verified 2026-06-29** (steel door qual-1 auto-unlocked
en route); `u6_area_map` / `u6_goto_xy` / allegiance-aware grid ✅ live-verified.
**★ M1 Slice-1 COMPLETE 2026-06-29 — the Avatar LEFT the castle.** Full run: surfaced from the dungeon,
revealed a secret door (LOOK/search), then solved the gated south exit (qual-1 key → steel door; lever →
inner portcullis; crank → drawbridge) and crossed out to Britain town. Also added the **combat-avoidance
layer** (`u6_pacify` / `u6_heal_party`, §4) so the agent can survive/skip fights the user doesn't want to
drive. **Remaining live gap = `u6_use` carried-item (drink/eat/light) only.** Next: virtue towns (Cove/Lycaeum).

---

## 7. Source-grounded offsets (validated this effort)

All DGROUP / DS-relative (`u6-decompiled`). Re-derive before relying.

| Datum | Where | Note |
|---|---|---|
| Party[] / PartySize / Active | `0x3533` / `0x8E50` / `0x2C54` | control roster; Party[Active] = controlled |
| Solo flag `D_2CC3` | `0x2CC3` (signed) | `<0` party, `≥0` solo (= Active) |
| InCombat / EnemiesNum | `0x2CC2` / `0xEBFB` | combat leash = Chebyshev 8 |
| Turn gate: AllowMouseMov / SelectMode / MouseMode | `0x04C4` / `0x0492` / `0x04BE` | + IsInConversation `0x098B` |
| Status panel: StatusDisplay / PanelChar `D_04B3` | `0x04C0` / `0x04B3` | view = CMD_90 PORTRAIT / 91 PARTY / 92 INVENTORY |
| Inventory panel: cursor `D_0499`/`D_049A` / scroll `D_07CE` / visible `D_E70F[12]` / `Equipment[8]` / open-container `D_E709` | `0x0499` `0x049A` (char) / `0x07CE` / `0xE70F` / `0xE6E4` / `0xE709` | backpack cell (r,c)→cursor (c+3,r); `D_E709<0x100`=plain backpack, `≥0x100`=open container; cells via `D_054B`/`D_0559` (seg_0C9C.c:103) |
| Selection (committed target) x/y/obj | `0xB6AF` / `0xB6B1` / `0xB6B3` | u6.h struct `int x,y,obj`; obj is the 3rd word |
| STR / DEX / INT / Level | `STREN 0x8C4A` / `DEXTE 0x3316` / `INTEL 0x3433` / `0x8E4C` | per-slot bytes |
| Load caps | carry = STR×20 (seg_1944.c:1945); equip = STR×10 (seg_155D.c:546) | current load via `TypeWeight 0xB417` |
| Equip slot | `STAT_GetEquipSlot` (seg_155D.c:129) on `TILE_FRAME`; weapons table `D_07DD 0x07DD` | −1 = not readyable |
| Names[][14] | `0x3236` | indexed by party index |
| Passability tables | TerrainType `0xB3EB` / TileFlag `0x8C46` / D_B3EF `0xB3EF` / BaseTile `0x6824` | see dosbox_u6_passability.md |
| Area window | AreaTiles `0x8E51` (floor tile[40][40]) / **MapObjPtr `0xD8E7`** (int[40][40] top object slot, −1=none) / AreaX·Y `0xBBC8`·`0xBBCA` | `u6_area_map` decodes each cell's object → doors (seg_1184.c:663) |
| NPCStatus alignment | `0x9FAB`: &0x80 PLRCONTROL (party→swap-through) / &0x20 ATKPLR (enemy) / &0x40 ATKMON (ally) | friend-or-foe for the grid (u6.h:120-123); incap = &0x16, dragged = NPCFlag&0x10 |
| Converse VM | TalkBuf ptr `0x4D50` / Talk_PC `0xE7AB` / input `0xE732` / interlocutor `0xE796` | OP_NPC `0xeb` → interlocutor (self) |
| Converse vars / flags | VarInt `0xB6E1` (int[36]) / VarStr `0xB72D` (near ptr[36]) / TalkFlags `0xB2EB` (per-NPC byte) | OP_TST/SET/CLR bit ops; HP `0x66E4`, NPCStatus `0x9FAB` |
| Keyword dispatch | `OP_KEY 0xef` kw[,kw] `OP_RES 0xf6` body … `OP_ENDRES 0xee` | str_i_compare (seg_1703.c:130/980) |
