# Research: NPC conversation-script summaries (on-demand)

**Status:** a growing catalog — one section per NPC, added when Zane asks me to
inspect that NPC's conversation. NOT exhaustive (200 NPCs exist); only the ones
requested. Each entry summarizes the decoded `converse.a/.b` bytecode for that NPC
(topics, branches, copy-protection, actions). The conversation **engine** is
[research_conversation_vm.md](research_conversation_vm.md); the rebuild **design**
is [research_i13_conversation_vm.md](research_i13_conversation_vm.md). This doc is
about script **content**.

## How these are produced + read

- **Static decode:** disassemble the NPC's script from `converse.a` (npcId 0..0x62)
  / `converse.b` (0x63..0xDF) via `assets/converse.js` + the opcode table in
  `systems/conversation/opcodes.js`.
- **Live state:** `window.__U6.inspectConversation()` (the I-13 dev hook) snapshots
  the active VM — `npc`, `pc`, live `VarStr`/`VarInt`, `lastInput`, `waitingOn`, the
  current question, and a disasm of the upcoming tokens.

**Convention — keep script-fact separate from inference** (see local memory
`feedback_separate_decoded_facts_from_memory`): keyword **prefixes** quoted below are
**exact from the script** (the matcher accepts any input word *starting with* the
prefix). Any full word in (parentheses) is my inference from the manual / lore and is
**not** in the script — it may be wrong; the prefix is the ground truth.

Object/flag numbers are decoded from the bytecode (shown decimal unless noted).

---

## Lord British — npcId 5 (`converse.a`), 7,249 bytes

**You see** "the noble ruler of Britannia."

**Gated on a "have we met?" flag — `TalkFlags[self]` bit 7:**
- **First meeting** (bit 7 clear) → copy-protection quiz → on success, gives the
  castle key + briefing, and **sets bit 7**.
- **Return visits** (bit 7 set) → straight to the topic menu; re-gives the key if
  `WHOSGOT(obj 64)` shows you no longer carry it.

### Copy-protection quiz (first meeting)
Picks **3 distinct random questions** (`RND 1–10` into scratch vars `#7`/`#8`/`#9`)
from a pool of **10**; all three must be answered. Wrong → "Nay, 'tis not the correct
answer. Consult thy Compendium." (re-asks); `bye` → "Find thy Compendium, then come
speak with me again." (ends).

| Question | Accepted prefix(es) — exact | (likely word — inferred) |
|---|---|---|
| What doth trolls lack? | `end` | (endurance) |
| What part of the tangle vine doth put one to sleep? | `cent` `pod` `frag` | (central pod fragments) |
| How wert the headlesses produced? | `wiza` `expe` | (wizardly experiments) |
| What valued item near the spawning grounds of Hydras? | `nigh` `mush` | (nightshade mushroom) |
| How canst one fend off rotworms? | `torc` `fire` `flam` `burn` `pass` | (torch / fire) |
| How doth sea serpents attack? | `fire` `ball` `swip` `tail` | (fireball / tail swipe) |
| What creature art wisps oft mistaken for? | `fire` `fly` | (fireflies) |
| How doth giant squids crush their prey? | `beak` | (beak) |
| Where hath images of the silver serpent been seen? | `tomb` `wall` `anci` `monu` | (ancient tomb walls) |
| What art reapers remnants of? | `anci` `ench` `fore` | (ancient enchanted forest) |

### On passing: reward + briefing
- **Gives the castle key** (`GIVEOBJ` obj 64); explains it unlocks the **gatehouse**
  (southern entrance), where the **lever** raises the portcullis and the **crank**
  lowers the drawbridge, and it opens the **sewers**.
- Sets the "met" flag (bit 7), then a paged briefing: underworld collapsed;
  **gargoyles** invade via the dungeons, attacking the **shrines** of the eight
  **virtues**; Shrine of Compassion fell and **Sir Geoffrey** sent a party (go ask
  him); offers a **room** (west wing) with equipment, says borrow anything, offers
  **healing** on request and to **repeat** the briefing.

### Topic menu (keywords)
| Keyword prefix(es) | Response / action |
|---|---|
| `name` | "I am Lord British, as thou knowest well." |
| `rep` | replays the full briefing |
| `job` | throne of Britannia; "heavy burden in @troubled @times" |
| `heav` `burd` `trou` `time` | the gargoyle threat is the greatest ever |
| `garg` | drive them back into the earth |
| `shri` | shrines may be captured — hurry |
| `virt` | stay strong in the eight virtues |
| `geof` | "Captain of the Guard" |
| `comp` | "ask @Tholden" |
| `thol` / `chan` | "my chancellor" |
| `moon` `gate` `ston` `blac` `orb` | shows the black stone; how to open **moongates** (placement is key); **sets flag bit 5** |
| `mant` `rune` | ask each town's leaders |
| `mous` `sher` | **Sherry** the talking mouse (npc 9); if she's in the party, "take good care of my little friend" |
| `wiza` `oz` `book` | the **Wizard of Oz** book quest (`y`/`n` prompt): bring the book (obj 151, quality 75) → he `TAKE`s it and `GIVE`s glowing gems (obj 77), with a carry-weight check |
| `bedt` `stor` → `favo` `hube` `lion` | recites the "Hubert the Lion" poem |
| `mr` `nose` | easter egg: "Who told thee of that nickname!?" |
| `heal` | **heals + cures the whole party** (loops members: `HEAL` if wounded, `CURE` if poisoned) |
| `than` | "'Tis I who should thank thee…" |
| `bye` | "May fortune favor thee." (ends) |
| `*` | "I cannot help thee with that." |

**Actions the script performs:** `GIVEOBJ` key (64) + replacement; `SET` flags (bit 7
met, bit 5 moonstone-told); `HEAL`/`CURE` whole party (`heal`); book quest
`TAKE`(151)/`GIVE`(77) with `CANCARRY`/`WEIGHT` gate; easter eggs (Mr. Nose, Hubert
the Lion, Sherry). The most elaborate NPC in `converse.a`.
