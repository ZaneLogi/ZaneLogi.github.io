# Quest Log — playing U6 by decoding the conversations

**What this is.** A **player's-eye reconstruction of the U6 main quest**, built up as we decode
NPC conversation scripts in the running clone. It's a *different way to play the game* — instead of
walking the world, we dig the story out of the `converse.a/.b` bytecode and trace where the quest
leads. This file is the **living quest state**: the threads, the key items, who points where, and
what's still missing.

**This is NOT research.** The `research_*.md` docs are source-grounded facts for *building the
clone*; this is the *gameplay trace*. Two companions feed it:
- [research_npc_scripts.md](research_npc_scripts.md) — the raw per-NPC decode **catalog** (every
  fact here traces to an entry there).
- [research_main_quest.md](research_main_quest.md) — the **win structure** (the engineering gap
  analysis), grounded in `seg_*.c`.

**Maintenance rule (binding).** Whenever decoding an NPC yields story / item / lead info, update
this file's **threads + key-items + leads** in the *same pass* as the catalog entry. Keep the two in
sync. Coordinates come from live objlist scans (the user's own data); anything from general U6 lore
is marked **(lore — unverified)**.

**Status legend:** 🔴 open (no lead yet) · 🟡 partially traced · 🟢 fully traced (we know exactly
how, not yet executed in-game) · ✅ executed in-game.

---

## The goal (win condition)

**USE the Vortex Cube** (`OBJ_03E`) at the Codex chamber, with ALL of these true (source:
`research_main_quest.md §1`, `C_27A1_5FAC`):
1. **All 8 moonstones** (`OBJ_049`, frames 0–7) **inside the cube**.
2. **Britannia Lens** (`OBJ_18A`/394) at **(921,851)**.
3. **Gargoyle Lens** (`OBJ_18C`/396) at **(925,851)**.
4. **Codex** (`OBJ_03B`/59) at **(923,851)** — already in the world there.
5. Avatar **within 5 tiles** of (923,851).

→ the Codex vanishes, the ending runs. **The win path is combat-free** — every required item is
gained by puzzle / quest / placement, not by killing.

---

## Quest threads (status board)

### 1. The two lenses → 🟡 partially traced
The Vortex needs **both** finished lenses placed at the Codex chamber (goal #2/#3).
- **Penumbra's prophecy** (npc 41): "a **violet lens**… is **broken, and must be made whole**" +
  "a **blue lens** is needed as well" + "two lenses, else all is for naught." (**Taynith**'s
  fortune-tiles, npc 136, also point here: "something of glass… seek **Penumbra**'s crystal ball.")
- **Ephemerides** (npc 35) **duplicates** a lens: bring him **one working lens (396)** + a **glass
  sword (obj 48)** → he casts the **second lens (394)** free.
- **Glass sword** 🟢 → **Dale the Glassblower** (npc 70, Minoc) crafts it from **5 gems (obj 77)**.
- **The remaining gap:** that makes lens **#2**. Lens **#1** (the *first* working lens) still needs a
  source — the **broken violet lens (`OBJ_18B`/395, at ~(124,194,z5)) being "made whole."** New lead:
  Dale points crystal/lens work to **"a lensmaker near the Lycaeum"** 🟡 — chase that for lens #1.
- **Next:** get **5 gems → Dale → glass sword**; find the **lensmaker near the Lycaeum** (lens #1);
  Ephemerides duplicates → lens #2; place both at (921,851)/(925,851).

### 2. The Book of Prophecies + the silver tablet → 🟡 partially traced
The story spine — learning the gargoyle conflict.
- **Nystul** (npc 6): the strange-tongue book you carry → take it to **Mariah** at the Lycaeum.
- **Mariah** (npc 33) translates **only** with the **Book of Prophecies (obj 60)** + **both
  silver-tablet halves (obj 389 + 390)**. The full translation reveals the **"false prophet = the
  Avatar"** prophecy and points to **Sin'Vraal** (see thread 4).
- **The gypsies = Zoltan's band** (npc 133, **king of the gypsies**, ~(257,168) near **Yew**; with
  Karina + Taynith) — 🟢 **traced.** Pay Zoltan **10 gold** (`silv,tabl`) for the story: a gorgio
  **Captain John** gave them the tablet to carry to the Lycaeum "for translating"; en route
  **Captain Hawkins**'s pirates **ambushed** them and stole the **bigger half** to **Buccaneer's
  Den**; the gypsies sold the **small corner Hawkins missed to Mariah** (= the half now in her study).
- **So the two halves are:** Mariah's-study corner (the gypsies' leftover) + the **bigger half**, which
  turns out to be **part of Captain Hawkins' buried treasure** (NOT loose loot in the den). **Obj
  numbers:** the study corner is **obj 390** at **(897,443)** in the Lycaeum (GET it); the missing bigger
  half is **obj 389** (the buried-treasure one). **Den:** a pirate **island ~(565,612), east of Paws**,
  water-locked (bbox x[523..598] y[578..669]). **No "Hawkins" NPC** — and **Hawkins is dead** (killed by
  his own mutinous crew, per Homer).
- **★ The mechanism — Homer (npc 116, ex-Hawkins crew at the den)** is the quest giver, but **only
  talks if you're a Thieves'-Guild member.** Join via **Budo (npc 115)** — get the guild **belt (obj
  25)**; the initiation = **"retire" a guild member hiding in the Britain sewers**. Then Homer's deal:
  Hawkins' treasure map was **torn into 9 pieces**; bring him the **8 scattered pieces (obj 400-407)**
  and he gives the **9th (obj 408)** + dig directions, in exchange for the **magic storm cloak (obj
  81)** from the hoard. Dig on the X-marked island → the **silver tablet (obj 390)** (+ cloak + loot).
- **Map-piece holders — leads from Homer + Sandy** (🔴 all unrecovered). **Sandy (npc 75, Trinsic cook
  "Sandstone Angus")** is the **informant, not a holder**: give him a **dragon's egg (obj 417, from
  dungeon Destard)** → he names four holders. Combined trail:
  - **Hawknose** → the **Dry Land** (kill the daemon) *(Homer)*
  - **Ybarra** → dungeon **Shame** *(Homer)*
  - a **hook-handed** man → **Jhelom** = 🟢 **Heftimus McPry** (npc 47, the hook-handed beggar; **Capt.
    Hawkins** cut off his hand): for **10–20 gold** he reveals his **map scrap is in dungeon Wrong** (he
    lost it there to a swarm of rats) *(Homer; confirmed at Jhelom)*
  - one **died in a shipwreck** *(Homer)*
  - a **woman pirate** → **Serpent's Hold** (name forgotten) *(Sandy)*
  - a **hermit** → **Dagger Isle** *(Sandy)*
  - **Nathaniel Moorehead** → **Empath Abbey** (or thereabouts) *(Sandy)*
  - **Lord Whitsaber** (Trinsic's mayor) = **the first mate, Alastor Gordon** *(Sandy)* — Homer's
    "first mate." 🟢 **His piece traced: obj 401**, surrendered by blackmail — raise Sandy / `alas` /
    `firs` / `mate` with him, **confess `y`** (he admits the pirate past, panicking), then ask **`map`
    → `y`** and he hands over **map-piece 401**. *(Whitsaber npc 76, ~(402,739) Trinsic.)*
  *(Johann npc 117 also fears "Bonn" + Ybarra — "Bonn" may be one of the above or an extra. Sandy hands
  over no piece himself — he sells the locations for a dragon egg.)*
- **★ Map-piece object locations (found via a full-world object scan of the loaded data — the
  "behind-the-scenes" placements, vs the conversation leads above). 4 of 8 currently loaded.** The pieces
  are **dungeon-placed**, looted from **corpses / chests** — which fits the dead-crew-in-dungeons leads
  ("Ybarra → Shame," "one died in a shipwreck"). `z` = dungeon level; which *named* dungeon each is in is
  TBD (cross-ref the leads). NOT at Empath Abbey.
  - **obj 400** → inside a **corpse** at **(248, 40, z4)**
  - **obj 403** → in a **pouch (obj 188) inside a chest (obj 192)** at **(237, 53, z1)**
  - **obj 404** → inside **obj 384** at **(76, 30, z4)**
  - **obj 406** → loose on the floor at **(149, 5, z3)**
  - *(Not loaded during this scan: **401** [Whitsaber's — handed over in Trinsic, not a floor object], **402,
    405, 407** — their levels weren't resident. Dungeon levels load only on descent; these 4 came from the
    **Destard** descent through z1–z4. Re-scan after visiting more dungeons to find the rest.)*
- **Dig directions** (Homer, once you've promised the cloak): on the X island, find the three stones,
  stand centered → **3 paces S, 9 paces W, 12 paces S** → old dead tree → dig the dirt just south.
- **Next:** GET Mariah's study half; **join the Thieves' Guild (Budo 115)** → ask **Homer (116)** about
  the **silver tablet** → collect the 8 map pieces → 9th piece + dig the treasure (return the storm
  cloak to Homer for +10 karma); then bring the book + both halves back to Mariah. Den travel: Orb
  **2-W (Qual 11)→(739,699)** + ship NW.

### 3. The 8 rune+mantra moonstone shrines → 🟡 6 of 8 traced (Honesty, Sacrifice, Justice, Honor, Humility, Valor)
Each of the **8 moonstones** is **force-field-guarded** and freed only by **USE the matching virtue
Rune + speak its Mantra** at the shrine (source: `research_main_quest.md §4`, `C_27A1_4B98`). You
need all 8 stones in the cube (goal #1). Each virtue is sourced separately (rune + mantra). The
8 mantras (per §4): Honesty *Ahm* · Compassion *Mu* · Valor *Ra* · Justice *Beh* · Sacrifice *Cah* ·
Honor *Summ* · Spirituality *Om* · Humility *Lum*.
- **HONESTY — 🟢 rune+mantra both traced:**
  - **Manrel** (npc 40, Beyvin's cousin) → the **key to Beyvin's crypt** (obj 64 qual 12) + daffodils.
  - **Penumbra** (npc 41) → the **mantra "ahm"** (5 gold); "the rune is buried with **Beyvin** under
    Moonglow."
  - **Aganar** (npc 39, Lord of Moonglow) → the **Rune of Honesty** was his, entrusted to Beyvin;
    the **Shrine of Honesty** is on **Dagger Isle** (north).
  - **Path:** Manrel's crypt key → Beyvin's crypt under Moonglow → **Rune of Honesty** → pair with
    mantra **"ahm"** at the Honesty moonstone shrine.
- **SACRIFICE — 🟢 rune+mantra both sourced** (Minoc = "the city of Sacrifice"):
  - **Rune of Sacrifice** (obj 246) → **Selganor** (npc 64, artisan **guildmaster**), for **joining
    the guild**: (1) pass his reagent quiz, (2) **make panpipes (obj 153)**, (3) **recite "Stones"**
    `678987 8767653` — **Gwenno** (npc 66) teaches. (Isabella, the mayor, confirms she entrusted the
    rune to Selganor.)
  - **Panpipes** — **Julia** (npc 67) carves them from a **yew board (obj 277)**. Board: a
    **freshly-cut yew log** from **Ben the logger** (W of Yew into the forest, then N) →
    **Aaron's sawmill** (npc 69, Minoc) cuts it to a board (5g).
  - **Mantra "Cah"** → the healer **Tara** (npc 65, **N side of Minoc**) — **confirmed** ("'Cah,'
    that is the word of sacrifice").
- **JUSTICE — 🟢 fully traced** (Yew = the Hall of Justice):
  - **Mantra "beh"** → **Lenora** (npc 59, **Lady Mayor of Yew**) gives it (`mant`; answer "how can
    that be?" with anything but bye). ✅
  - **Rune of Justice** — the recovery chain, end to end:
    1. **Lenora** (npc 59) → **letter of permission** (obj 152 q121).
    2. **Pridgarm** the jailer (npc 61) → show the letter → he lends the **solitary cell key**
       (obj 64 q11). (Return it for +7 karma.)
    3. **Boskin** the jailed thief (npc 60) → call his bluff (`lie`/`fool`) or promise freedom → he
       reveals the rune is **under a potted plant in the Slaughtered Lamb** (lying = −5 karma).
    4. **Slaughtered Lamb** (Andrea's pub, npc 56) → the rune sits at **(237,156)** under a **potted
       plant** (obj 138): MOVE/GET the plant → **Rune of Justice** (obj 245) → USE rune + mantra "beh"
       at the Justice moonstone shrine. *(verified in the loaded world)*
- **HONOR — 🟢 rune+mantra both sourced** (Trinsic = the Town of Honor):
  - **Mantra "summ"** → **Whitsaber** (npc 76, Trinsic's mayor) gives it on `mant` ("*Oh yes… It's
    'summ.'*").
  - **Rune of Honor** → Whitsaber on `rune`: it sits **openly on a pedestal in the center of Trinsic**,
    **unguarded** ("*None here would be dishonorable enough to steal it*") → just MOVE/GET it. USE rune
    + mantra "summ" at the Honor moonstone shrine.
- **HUMILITY — 🟢 rune+mantra both sourced** (New Magincia = the city of Humility):
  - **Mantra "lum"** → **Conor** (npc 94, the fisherman) and **Aurendir** (npc 98, the shepherd) both
    give it ("I find 'lum' a most effective mantra").
  - **Rune of Humility** (obj 249) → **Lord Antonio** (npc 92, the governor): name the **humblest
    townsperson** and he hands it over. The answer is **Conor Starfalcon** (npc 94 — the ex-guildmaster
    turned humble fisherman; **Dunbar**'s "strange glow by his house at night" + "head of an important
    guild" point to him). A **wrong guess = −5 karma**. (Katrina and Charlotte each coyly claim/deflect
    the title — red herrings.)
  - **Shrine of Humility** is **far to the SE**; **Conor lends his boat** (down at the beach), though it's
    "too small to weather the high seas." USE rune + mantra "lum" at the Humility moonstone shrine.
- **VALOR — 🟢 rune+mantra both sourced** (Jhelom = the city of Valour):
  - **Mantra "ra"** → sung by the bard **Culham** (npc 49) — the refrain of his avalanche song ("Sing 'ra,'
    my friends… 'tis a song to make thee strong"). **Jerris** (50) and **Lyssandra** (48) both point to it.
  - **Rune of Valour** → lost: **Nomaan** (npc 44) won it in **Zellivan**'s (43) tournament, then dropped it
    drunk at the **Sword & Keg** pub, where **a rat carried it into a hole in the wall** (Nomaan says west,
    Lyssandra/Jerris say north — the pub rat hole either way). **Retrieval (Lyssandra 48):** a **talking
    mouse — Sherry, Lord British's friend — can fetch it** from the hole. USE rune + mantra "ra" at the
    Valor moonstone shrine. *(So the rune needs Sherry the mouse before it can be obtained.)*
- **The other 2 virtues — 🔴 open** (Compassion, Spirituality)**:** each needs its town leader +
  rune location + mantra source. Lord British said "ask each town's leaders" for runes + mantras.

### 4. The gargoyle reconciliation (the "false prophet") → 🔴 lead found, not visited
The plot resolution — the Avatar is the gargoyles' feared "false prophet"; the win is reconciliation.
- **Mariah's** translation → seek **Sin'Vraal** (**npc 141**, ~tile **(810,234,z0)**, the desert),
  a gargoyle who speaks the human tongue, "to hear the gargoyles' side."
- **Stelnar** (npc 45, Jhelom) **corroborates the location**: Lord British defeated Sin'Vraal in the
  underworld and the gargoyle "went to live in the **Dry Land** — a **desert east of the Bloody Plains**,
  where a Shrine of Honesty stands." Stelnar wants him dead; the bard **Van Kellian** (46) argues for
  **mercy** ("what threat is one gargoyle living alone?") — the human-side mercy-vs-kill debate.
- **Shamino** (npc 3) hints: the gargoyles' "true nature" is misunderstood; "I know Lord British
  better than you might think."
- **Beh Lem** (per **Mandrake** npc 180, the Paws minstrel): a **friendly gargoyle** who **freed Mandrake**
  after the gargoyles captured him and took him "to the other side of the world" — another human↔gargoyle
  bridge (cf. Sin'Vraal, Captain John). Location untraced.
- **Captain John** (per **Zoltan**): a gorgio who has **been living with the gargoyles**, says
  "there's nothing evil about them," and knew the silver tablet was "for translating" — another
  human↔gargoyle bridge like Sin'Vraal. Location untraced.
- **The Buccaneer's Den pirates** all gossip about Captain John and **disagree** — the game stages it as
  a chain of interruptions:
  - **Captain Fox** (npc 111): John "went **underground** seeking the gargoyles, but **fled** from the
    first one. Nobody knows where he is now." (If **Leodon** is nearby she scoffs "that's not what I heard.")
  - **Leodon** (npc 113, capt. of the *Golden Hind*): John "went to the **other side of the world to join
    up with the gargoyles, the dirty traitor**." (If **Elad** is nearby he interrupts: "No, no, you've got
    it all wrong!")
  - **Elad** (npc 112, "the tea-drinker"): his "truth" = John was **captured by gargoyles and dragged
    into Hythloth** — but **Leonna (114) disputes** it ("I could tell a different tale…").
  - **Leonna** (npc 114, Leodon's first mate): John "went down in **Hythloth** to find a way to the other
    side of the world, vowing to **kill gargoyles**" — and **Fox interrupts HER** ("That's not true!"), so
    the chain **loops closed** (Fox→Leodon→Elad→Leonna→Fox).
  - **✅ Den exhausted for John:** all four captains contradict each other in a **complete circle** — a
    running gag, a confirmed **dead-end**. The only detail two of them share is **Hythloth** (Elad +
    Leonna); the real answer comes from the **gargoyle side** (Sin'Vraal, thread 4 proper), not the den.
- **Next:** reach & talk to Sin'Vraal (gated behind thread 2's full translation in dialogue, but he
  exists in the world now).

### 5. The wisp secret → 🔴 lead found, wisps not located
Deeper lore / 8th-Circle magic.
- **Xiao** (npc 36): 8th-Circle spells are **gated on the wisp secret** (`TalkFlags[201]` bit 3);
  "**Seek out and speak with the wisps, and learn their secrets.**"
- **Shamino** (npc 3): "strange **wisps**… some **mages** who have investigated them."
- **Next:** find the wisps (a converging hint across Shamino / Mariah / Xiao).

### 6. The balloon (traversal sub-quest) → 🟡 partially traced
A flying device. The balloonist "flew off on an important mission and never returned" to **Sutek's
island** (Isabella + Selganor). To build one:
- **Basket (obj 422)** — **Michelle** (npc 68, Minoc) weaves it from the **balloon plans** + 300 gold.
- **Balloon plans (obj 270)** — 🔴 source unknown (Michelle's late father's design; she lacks them).
  - **★ Lead → book identified:** **Johann** (npc 117, Buccaneer's Den bard) read about ballooning in a
    book at the **Lycaeum**; **Thariand (npc 34)**'s catalog lists it — **"The Lost Art of Ballooning"
    (call # `718.5 B34 z5`)**, B. Non-fiction. Thariand only recites the call number (hands over
    nothing). **No such book object actually exists** — *The Lost Art of Ballooning* is a **flavor/joke
    title** in Thariand's catalog (cf. "Summoning Incubi for Fun and Profit"), not a retrievable item.
    So Johann's lead is **flavor**, and the balloon-plans (obj 270) source stays **🔴 open**.
    (`718.5 B34 z5` is a flavor Dewey call number, not coordinates — `z5` ≠ z-level.)
- **Silk bag (obj 421, the envelope)** — **Marissa** (npc 102, Paws) — 🟢 **recipe decoded**: bring her
  the **balloon plans (obj 270)** + a **bolt of silk (obj 241)** + **75 gold** → she sews the **silk bag
  (obj 421)**. **The silk-bolt chain (fully decoded):** (1) gather **40 spidersilk (obj 71)** [from
  spiders — likely the **Spider Cave** (92,250)]; (2) **Arbeth** (npc 103, Paws spinner) spins 40
  spidersilk + 20g → a **silk thread spool (obj 226)**; (3) **Charlotte** (npc 95, New Magincia) weaves the
  thread → the **silk bolt (obj 241)** for **10 gold** — *🟢 recipe confirmed; she's the only silk weaver,
  and Paws's **Thindle** (npc 100) can't work silk and redirects to her*; (4) → Marissa. Still **gated on
  the plans (obj 270)** — 🔴 source open. *(Marissa's
  bag offer only fires once you hold obj 270.)*
- **Where/why:** **Sutek**'s island (far S, **E of Serpent's Hold**) — Sutek had "a big job" there.

---

## Key items

| Item | Obj | Role | Source / where | State |
|---|---|---|---|---|
| **Vortex Cube** | `03E`/62 | USE it to win | pre-placed ~(147,57,z4) — GET it | 🔴 not obtained |
| **Codex** | `03B`/59 | win-chamber centerpiece | already at (923,851) | present |
| **Britannia Lens** | `18A`/394 | place at (921,851) | Ephemerides duplicate (needs lens 396 + glass sword) | 🟡 |
| **Gargoyle Lens** | `18C`/396 | place at (925,851) | the *first* working lens — **source open** | 🔴 |
| **Broken Lens** | `18B`/395 | must be "made whole" → lens #1 | at (124,194,z5) — the abyss/gargoyle realm (confirmed); **repairer unknown** | 🔴 |
| **Glass sword** | 48 | Ephemerides melts it to cast lens #2 | **Dale the Glassblower** (npc 70) — 5 gems | 🟢 |
| **Gems** (×5) | 77 | Dale needs 5 to craft the glass sword | various (treasure; LB's Oz-book quest gives some) | 🟡 |
| **Book of Prophecies** | 60 | Mariah translates it | the strange book (Nystul → Mariah) | 🟡 in hand? |
| **Silver tablet — Mariah's-study half** (small corner) | **390** | Mariah needs both halves | **GET in Mariah's study — confirmed live at (897,443)**, Lycaeum (the corner the gypsies sold her) | 🟡 present |
| **Silver tablet — Hawkins'-treasure half** (bigger) | **389** | " | in **Capt. Hawkins' buried treasure** (not yet in the world) — dig via the **9-piece map** quest (Homer npc 116, gated by Thieves' Guild / Budo 115). Den ~(565,612), Orb 2-W→(739,699)+ship | 🔴 |
| **Treasure-map pieces** (×8) | 400–407 | assemble Hawkins' map | holders (per Homer + Sandy): Hawknose/Dry Land · Ybarra/Shame · **hook-hand=Heftimus(47)/Jhelom → obj 403, PINPOINTED in dungeon Wrong @ (237,53,z1)** — in a closed **crate→bag** (Heftimus sells the loc 10–20g; lost it to rats) · a shipwreck · woman/Serpent's Hold · hermit/Dagger Isle · Moorehead/Empath Abbey · **Whitsaber=first mate/Trinsic → obj 401** (blackmail: confess Sandy's secret → `map` `y`) | 🔴 0/8 recovered (3 located 🟢; **403 pinpointed in-world**) |
| **Dragon's egg** | 417 | Sandy's price for the map-holder leads | **Destard** (surface mouth (284,657), NW of Trinsic) → descend to **dungeon level 4 (z4)** → a **nest of 10 eggs at ~(41–46, 41–46)** (center ~(43,43)); the level is a **dragon lair** (the other eggs there hatch dragons — guards). `GET` one → give to **Sandy** (npc 75, Trinsic) | 🟢 located |
| **9th map piece** | 408 | completes the map | **Homer** (npc 116) hands it over once you have the other 8 | 🔴 |
| **Magic storm cloak** | 81 | Homer's price for the 9th piece + dig spot | buried with Hawkins' treasure (give to Homer = +10 karma; keep = −10) | 🔴 |
| **Thieves' Guild belt** | 25 | gates Homer's tablet info | **Budo** (npc 115) — "retire" a guild member in the **Britain sewers** | 🔴 |
| **8 Moonstones** | `049` f0–7 | all 8 into the cube | the 8 moongate sites, each force-field-guarded | 🔴 0/8 freed |
| **Rune of Honesty** | `0F2`-class | USE at the Honesty shrine | **Beyvin's crypt** (Manrel's key) | 🟢 traced |
| **Mantra "ahm"** (Honesty) | — | spoken at the shrine | **Penumbra** (5 gold) | 🟢 traced |
| **Rune of Sacrifice** | 246 (`0F6`) | USE at the Sacrifice shrine | **Minoc artisan guild** — Selganor (panpipes + "Stones") | 🟢 traced |
| **Mantra "Cah"** (Sacrifice) | — | spoken at the shrine | **Tara** (npc 65, healer, N Minoc) — confirmed | 🟢 |
| **Rune of Justice** | 245 | USE at the Justice shrine | **Yew (237,156)** — under a potted plant (obj 138) in the Slaughtered Lamb (chain: Lenora letter → Pridgarm cell key → Boskin reveals) | 🟡 |
| **Mantra "beh"** (Justice) | — | spoken at the shrine | **Lenora** (npc 59, Yew mayor) — ask `mant` | 🟢 |
| **Rune of Honor** | — | USE at the Honor shrine | **Trinsic center** — openly on a pedestal, **unguarded** (MOVE/GET it); **Whitsaber** (npc 76) tells you where on `rune` | 🟢 traced |
| **Mantra "summ"** (Honor) | — | spoken at the shrine | **Whitsaber** (npc 76, Trinsic mayor) — ask `mant` | 🟢 |
| **Letter of permission** | 152 q121 | admits you to the Yew jail (the thief) | **Lenora** (npc 59) | 🟡 |
| **Solitary cell key** | 64 q11 | opens the thief's cell | **Pridgarm** (jailer, npc 61) — show Lenora's letter; return for +7 karma | 🟡 |
| **Panpipes** | 153 | guild-join requirement (→ Rune of Sacrifice) | **Julia** (npc 67) carves from a yew board | 🟢 traced |
| **Yew board** | 277 | Julia turns it into panpipes | yew log (**Ben the logger**, W of Yew → N) → **Aaron's sawmill** (npc 69, Minoc, 5g) | 🟢 |
| **Song "Stones"** | — | recited to join the guild | `678987 8767653` — **Gwenno** (npc 66) | 🟢 known |
| **Beyvin's crypt key** | 64 q12 | open the crypt | **Manrel** (npc 40) | 🟢 source known |
| **Daffodils** | 139 | leave at Beyvin's grave | **Manrel** (with the key) | 🟢 |
| **Orb of the Moons** | `057` | red-gate fast travel | enabled via **Lord British** (`TalkFlags[5]` bit 5) | — |
| **Amulet of Submission** | `04C` | pacifies gargoyles (combat-free) | **(lore — unverified)** | 🔴 |
| **Balloon basket** | 422 | the balloon's gondola | **Michelle** (npc 68) — needs plans + 300g | 🟡 |
| **Balloon plans** | 270 | Michelle needs them to weave the basket | source unknown | 🔴 |
| **Silk bag** (balloon envelope) | — | the balloon's gas bag | **Marissa in Paws** (per Le'nard; needs the balloon plans in hand) | 🟡 |

---

## Leads — who points where

**Verity Isle (Lycaeum + Moonglow)** — fully decoded (npcId 33–42):

| Lead / target | Pointed to by | Where |
|---|---|---|
| Translate the book | Nystul → **Mariah** | Lycaeum (886,444) |
| **Glass sword** — **Dale the Glassblower** (5 gems) | Ephemerides | Minoc (616,85) ✓ found |
| A **lensmaker near the Lycaeum** (lens work / lens #1?) | **Dale** | near the Lycaeum |
| **Nicodemus** (enchanter, npc 58) @ ~(334,203) | **Thariand**, **Jaana**, **Blaine** | SE of **Yew** / "east of Iolo's hut", "between two rivers". ✓ **checked: a magic vendor** (reagents / spellbook 45g / spell-teaching by Circle / yew staves 100g) — no quest payload |
| **Lenora** — Yew mayor → the **Justice** rune + mantra ("beh") | Lord British ("ask the town leaders") | Yew, Hall of Justice (220,167) |
| **Whitsaber** — Trinsic mayor → the **Honor** rune (open on a pedestal, town center) + mantra ("summ"); also map-piece **obj 401** | Lord British ("ask the town leaders") + Sandy (the blackmail secret) | Trinsic ~(402,739) |
| **Antonio** — New Magincia lord → the **Humility** rune (obj 249); name the humblest = **Conor** (wrong guess −5 karma). Mantra ("lum") from **Conor**/**Aurendir** | Lord British ("ask the town leaders") + Dunbar's "glow" hint | New Magincia ~(746,685) |
| **Zellivan/Nomaan** — Jhelom → the **Valor** rune (lost in the **Sword & Keg rat hole**; fetch it via the **talking mouse Sherry**) + mantra ("ra") from **Culham**'s song | Lord British ("ask the town leaders") | Jhelom ~(134,880) |
| **Ben the logger** (yew logs / "the finest wood") | **Lenora** | W of Yew into the forest, then N |
| The jailed **thief** Boskin (where the **Rune of Justice** is) | **Lenora** → **Pridgarm** (jailer) | Yew **jail** (Lenora's letter → cell key) → rune is in the Slaughtered Lamb |
| **Marissa** — the balloon's **silk bag** (envelope) | **Le'nard** (npc 55) | **Paws** (hint needs the balloon plans in hand) |
| **Ballooning** (a book → the balloon plans?) | **Johann** (npc 117, den bard) | a book at the **Lycaeum** → ask the librarian (**Thariand** 34) |
| **Magic fans** ("big wind, blow ships around") | **Utomo** (npc 57) | a lady on Utomo's home island |
| **Dr. Cat** (healer; "ask him about the duck") | **Taynith** (npc 136) | **Paws** |
| **Mandrake** — a contrarian "version of the eight virtues" (likely flavor) | **Sinjen** (npc 181) | unlocated |
| **Sin'Vraal** (gargoyle, the gargoyle side) | **Mariah** | desert (810,234) |
| **The wisps** (the wisp secret) | **Xiao**, Shamino | (unlocated) |
| **Shrine of Honesty** | **Aganar** | **Dagger Isle** (north) |
| **Beyvin's crypt** (Rune of Honesty) | **Manrel** + Penumbra | catacombs under **Moonglow** |
| **The gypsies** = Zoltan (npc 133) + Karina/Taynith | **Mariah** | wandering camp ~(257,168) near **Yew** ✓ found |
| **Buccaneer's Den** (the bigger silver-tablet half) | **Zoltan** | pirate **island ~(565,612)**, due **east of Paws** ✓ located; Orb 2-W→(739,699) + ship |
| **Captain Hawkins** (pirate; stole the bigger tablet half) | **Zoltan** | dialogue-only name — **no NPC/talk script**; **DEAD** (mutinied by his crew, per Homer) |
| **Silver tablet (bigger half) = Hawkins' buried treasure** | **Homer** (npc 116, den) | gated by **Thieves' Guild** (Budo 115) → the **9-piece map** quest |
| **Thieves' Guild** (belt obj 25) | **Budo** (npc 115, den) | initiation: **"retire" a member in the Britain sewers** |
| **The 8 treasure-map pieces** | **Homer** (npc 116) + **Sandy** (npc 75, for a dragon egg obj 417) | Hawknose/Dry Land · Ybarra/Shame · **hook-hand=Heftimus(47)/Jhelom → dungeon Wrong** · a shipwreck · woman/**Serpent's Hold** · hermit/**Dagger Isle** · **Moorehead**/Empath Abbey · **Whitsaber**=first mate/Trinsic |
| **Captain John** (gave the gypsies the tablet; lives w/ gargoyles, "not evil") | **Zoltan** | unlocated — gargoyle-side, cf. Sin'Vraal |
| **The truth about Captain John** | the den pirates (Fox/Leodon/Elad/Leonna), each disputing the last in a **closed loop** | Buccaneer's Den (565,612) — **dead-end gag** (all 4 decoded, circular); shared detail = **Hythloth**; real answer is gargoyle-side (Sin'Vraal) |
| A **gravedigger** (cheap resurrection) | **Dargoth** + **Tobatha** (npc 81, Trinsic healer) | **(unlocated — NOT Mole:** the Empath Abbey gravedigger npc 178 only digs graves, doesn't resurrect) |
| **The Virtuous** — a sunken ship, "great treasure aboard"; possible **shipwreck map-piece holder** (cf. Homer's "one died in a shipwreck") | **Sionnach** (npc 179, Empath Abbey bard) | **Loch Lake** (Capt. **Keegan** of Serpent's Hold went down there; he also names the *Dutchman* + *Empire* wrecks) |
| Enable the **Orb** / Oz book / castle key | **Lord British** | Britain |
| **Julia** — panpipes / instruments (Sacrifice-rune step) | **Selganor**, Gwenno | Minoc (635,77) |
| **Sutek**'s island ("a big job" / the balloon) | **Selganor** | **Sutek = npc 129 @ ~(787,939)**, far S; Orb: cast (−2,−1) → land (919,934), then ~132 W (boat for the island hop) |
| **Isabella** — Minoc's mayor | **Selganor** | Minoc |
| Recruit **Gwenno** (bard) / the song "Stones" | Iolo, Selganor | Minoc (565,81) |
| **Yew** town — yew log + a **sawmill** → board (for panpipes) | **Julia** | a town (Nicodemus lives SE of it) |
| **Tara** — healer; knows the **Sacrifice mantra "Cah"** | **Isabella** | Minoc, N side (603,66) |
| The **balloon** (balloonist "flew off, never returned") | **Isabella**, Selganor | → Sutek's island |

---

## Travel — Orb of the Moons routes

The Orb (`OBJ_057`) red-gate destination depends **only on the cast direction** — a fixed ROM table
(`research_moongate.md §2.3`), never on where you cast from — so these casts work **anywhere**, once
the Orb is enabled (taught by **Lord British**, `TalkFlags[5]` bit 5). The "cast" is the cell you
pick in the 5×5 "Where:" box relative to the avatar. Town anchors are NPC tiles (live objlist scans).

| Destination | Anchor tile | Orb cast | Lands at | From the landing |
|---|---|---|---|---|
| **Lycaeum / Verity Isle** | Mariah ~(886,444) | **NW-by-2** (Qual 1) | **(899,499,0)** | ~56 tiles **N** — drops you *on the isle*, by the Lycaeum |
| **Minoc** | Gwenno ~(565,81) | **SE-by-2** (Qual 25) | **(667,67,0)** | ~100 tiles **W** (same latitude) |
| **Sutek's island** (mad mage, npc 129) | Sutek ~(787,939) | **(−2,−1)** = 2 W + 1 N (Qual 6) | **(919,934,0)** | ~132 tiles **W**, ~same latitude — the closest of all 22 casts. **(919,934) = blue slot 7**, so a blue moongate at the matching phase also drops here. It's an **island** → the final hop likely needs a **skiff/ship** (Trebor, Minoc); terrain/water between not yet verified. |
| **Yew / Nicodemus** (enchanter, npc 58) | Nicodemus ~(334,203) | **(+2,0)** = 2 E (Qual 15) | **(227,131,0)** | lands at/near **Yew town**; Nicodemus ~129 **SE** (107 E, 72 S). Orb-only (not a blue endpoint). |
| **Buccaneer's Den** (pirate island, Captain Fox npc 111) | Capt. Fox ~(570,611) | **(−2,0)** = 2 W (Qual 11) | **(739,699,0)** | ~174 tiles **NW** of the den, **across open sea** — the den is a confirmed **isolated island** (landmass bbox x[523..598] y[578..669]; every Orb cast lands off it), so the final hop needs a **ship/skiff** (Trebor, Minoc). Runner-up: 2-S (Qual 23)→(387,787), ~178 NE, also water. |

Each row is the *nearest* of the 22 Orb casts to that destination; the runner-up cast is typically
1.5–5× farther. Only the Lycaeum drop is genuinely close (~56) — the 22-entry ROM table has no
destination directly adjacent to most towns, so the rest are ~100–132-tile walks — but every one is
still far closer than the nearest **blue** moongate (≥ 270 tiles). More routes get added here as we
scout them.

**Sea travel:** a **ship or skiff** (deed obj 149) from **Trebor** (Minoc shipwright, npc 72) **or
Fentrissa** (Buccaneer's Den shipwright, npc 121) sails the seas — needed for the final hop onto **islands** even when the Orb drops you on the opposite
mainland shore (e.g. **Sutek's island**, ~132 W of the Qual-6 landing; **Serpent's Hold**). (The z5
broken-lens site is a *dungeon* level — reached by ladder or an Orb cast to z5, not by ship.)

---

## Overworld gazetteer — towns, isles & landmarks

Town **centers** are NPC-cluster centroids from the objlist scan (accurate to ~town center). Landmark
coords are **approximate**, read off an annotated overworld map (1 px ≈ 1 tile). Dungeon/cave mouths have
their own section below; the 8 moonstone/virtue shrines are in thread 3.

**Mainland towns**
| Town | ~Center (x,y) | Notes |
|---|---|---|
| **Britain** | (301, 373) | Lord British's castle; the hub |
| *(Blue Boar / Tholden)* | (352, 403) | Britain's S outskirts — a tavern + LB's chancellor, not a separate town |
| **Yew** | (247, 168) | Lenora (mayor) + the jail/Slaughtered Lamb (Justice rune); gypsy camp wanders ~(257,168) |
| **Empath Abbey** | (149, 198) | abbey of Love / Brotherhood of the Rose (all 8 NPCs decoded) |
| **Minoc** | (614, 90) | NE; Isabella + the artisan guild (Sacrifice rune); Dale, Trebor |
| **Cove** | (570, 359) | Rudyom the wizard, Artegal |
| **Paws** | (384, 611) | Marissa (silk bag), Dr. Cat |
| **Trinsic** | (421, 786) | the Town of Honor; Sandy + Whitsaber (map-piece leads) |

**Island towns / isles**
| Isle / town | ~Center (x,y) | Notes |
|---|---|---|
| **Skara Brae** | (84, 515) | far-W isle (undecoded) |
| **Jhelom** | (134, 880) | far-SW isles; the Valor city; a hook-handed map-piece holder |
| **Buccaneer's Den** | (562, 618) | pirate isle E of Paws; Homer (treasure quest), Budo (guild) |
| **Serpent's Hold** | (540, 950) | far-S isle; the Courage city; Sentri; a woman-pirate map-piece holder |
| **New Magincia** | (746, 685) | SE isle; the Humility city; Katrina |
| **Verity Isle** | Lycaeum (886, 444) + Moonglow (917, 518) | E; the Truth city; Mariah (translator), Aganar, Penumbra |
| **Dagger Isle** | ~(960, 280) | far-NE isle; dungeon **Deceit** (964,306) + the **Shrine of Honesty**; a hermit map-piece holder |

**Landmarks** (approx, from the map / decodes)
| Place | ~(x,y) | Notes |
|---|---|---|
| **Stonegate** | ~(663, 259) | the gargoyle stronghold keep (central) |
| **Sin'Vraal** | ~(810, 234) | desert gargoyle who speaks the human tongue (npc 141) — thread 4 |
| **Sutek's Castle** | ~(787, 939) | the mad mage Sutek (npc 129), far S |
| **Nicodemus's hut** | ~(334, 203) | the enchanter, E of Yew ("between two rivers, N of Britain") |
| **Codex chamber** | (923, 851) | the **win** location (Vortex Cube goal) — SE |
| **The Empire** (shipwreck) | ~(405, 970) | a sunken treasure ship (Sionnach's ballad) — far S |
| **The Virtuous** (shipwreck) | **Loch Lake** (unlocated) | Capt. Keegan's wreck (Sionnach) — possible shipwreck map-piece |

The map also labels all **8 virtue shrines + their moongates** (Honesty=Dagger Isle, Compassion≈W near
Empath Abbey, Valor≈(150,962) by Jhelom, Justice=Yew, Sacrifice≈Minoc, Honor≈(315,859) by Trinsic,
Spirituality≈an isle SW, Humility≈by New Magincia) — approximate; the rune+mantra/moonstone-shrine work
is tracked in **thread 3**.

---

## Dungeon & cave entrances

Every dungeon and cave mouth on the surface, from a sweep of the map objects (coordinates are absolute
surface tiles, z=0). The number is the in-game dungeon order; ★ marks a current quest tie-in.

| # | Dungeon / cave | Entrance (x, y) | Quest tie-in / note |
|---|---|---|---|
| 1 | Deceit | (964, 306) | — (far NE) |
| 2 | Despise | (365, 265) | — |
| 3 | **★ Destard** | **(284, 657)** | the **dragon's egg (obj 417)** for **Sandy** (thread 2) — **NW of Trinsic**, matching Sandy's "to the northwest"; the eggs are a **nest of 10 down on dungeon level 4 at ~(43,43)** (a dragon lair) |
| 4 | **★ Wrong** | (500, 81) | **Heftimus**'s **treasure-map piece (obj 403)** (thread 2) — he lost it inside to rats; **PINPOINTED in the loaded data at (237,53,z1)**, in a closed **crate→bag** on dungeon level 1; far N |
| 5 | Covetous | (627, 113) | — (N) |
| 6 | **★ Shame** | (234, 409) | **Ybarra**'s treasure-map piece (Homer's lead, thread 2) |
| 7 | **★ Hythloth** | (948, 930) | the **Captain John** rumor (Elad + Leonna, thread 4); the **SE corner** of the map — the way down to the gargoyle world |
| 13 | Ant Mound | (867, 187) **and** (835, 195) | two mouths (NE) |
| 14 | Swamp Cave | (611, 363) | — |
| 15 | Spider Cave | (92, 250) | — (far W) |
| 16 | Cyclops Cave | (185, 436) | — (W) |
| 17 | Heftimus Cave | (132, 857) | — (SW) |
| 18 | Heroes' Hole | (348, 809) | — (S) |
| 20 | **★ Buccaneer's Cave** | (564, 594) | on the **Buccaneer's Den** island (den ~565,612) — the den's own cave |

**No surface entrance found** (the map sweep turned up no surface mouth for these — they're reached
from *within* another level, not by a hole you can walk onto): **GSA** (8), **shrine of Control** (9),
**shrine of Passion** (10), **shrine of Diligence** (11), **Tomb of Kings** (12), **Pirate Cave** (19).
*(Lore: the gargoyle-realm group — GSA + the three shrines + Tomb of Kings — sits below, reached
through **Hythloth** / the underworld; Pirate Cave's connection is unconfirmed.)*

---

## Open gaps — what to chase next

1. **The broken-lens repairer** — the unknown NPC who makes the broken violet lens whole (→ lens #1). *(thread 1)*
2. **Hawkins' buried treasure (the bigger silver-tablet half, obj 390)** — **mechanism traced via Homer (npc 116)**: join the Thieves' Guild (Budo npc 115; belt obj 25; "retire" a member in the Britain sewers) → Homer reveals the tablet is in Hawkins' treasure, found via a **9-piece map**; gather 8 pieces (obj 400-407) from scattered crew (Hawknose/Dry Land · Sandy 75/Trinsic · Ybarra/Shame · a shipwreck · hook-hand/Jhelom · +more) → Homer gives the 9th (obj 408) + dig directions for the **storm cloak (obj 81)** → dig the X-island. Den ~(565,612), Orb 2-W→(739,699)+ship. *(thread 2)*
3. **The other 4 virtue rune+mantra shrines** — repeat the Honesty / Sacrifice / Justice / Honor template per town. *(thread 3)*
4. **Sin'Vraal** — visit the desert gargoyle (npc 141). *(thread 4)*
5. **The wisps** — locate them for the wisp secret / 8th Circle. *(thread 5)*
6. **The Vortex Cube** — GET it from ~(147,57,z4). *(Nicodemus npc 58 now checked — just a magic vendor, no quest hook.)*

---

## NPCs visited so far

Full decodes are in [research_npc_scripts.md](research_npc_scripts.md) (sorted index at its top).
**97 so far:** Lord British (5), Nystul (6), Dupre (2), Shamino (3), Iolo (4); the complete
**Verity Isle** block — Mariah (33), Thariand (34), Ephemerides (35), Xiao (36), Dargoth (37),
Rob (38), Aganar (39), Manrel (40), Penumbra (41), Derydlus (42); and **Minoc** — Gwenno (66,
Iolo's wife — a recruitable bard; teaches the song "Stones" `678987 8767653`), Selganor (64,
artisan **guildmaster** → the **Rune of Sacrifice**), Julia (67, instrument-maker → carves the
**panpipes** from a yew board), Isabella (63, mayor → the Sacrifice **mantra** points to healer
**Tara** 65), Tara (65, healer → confirms the Sacrifice **mantra "Cah"**), Michelle (68,
basket-weaver → the **balloon basket**), **Dale (70, the Glassblower → the glass sword, 5 gems)**,
Aaron (69, sawmill), James (71, weapon/armor), Trebor (72, shipwright), Troy (73, clockmaker), Doris
(74, Tinker's Inn); and **Yew / the gypsies** — Jaana (62, recruitable druidess **companion** →
repeats the **Nicodemus** lead), **Lenora** (59, **Lady Mayor of Yew** → the **Justice** mantra "beh"
+ the jailed-thief / Rune-of-Justice trail), the rest of the Yew residents — **Le'nard** (55, tailor →
silk-bag/Marissa lead), **Andrea** (56, the **Slaughtered Lamb** — where the Justice rune hides),
**Utomo** (57, weaponsmith → magic-fan lead), **Boskin** (60, the jailed **thief** → the rune's spot),
**Pridgarm** (61, the **jailer** → the cell key) — and **Zoltan** (133, **king of the gypsies** → the **silver-tablet**
story: Capt. Hawkins stole the bigger half to **Buccaneer's Den**; Capt. John the gargoyle-friendly
tablet origin; also a reagent vendor), his band **Karina** (134, his daughter = **Penumbra**'s sister, the dancer),
**Taynith** (136, fortune-teller → the glass/lens + abyss prophecies; names Dr. Cat in Paws), **Blaine**
(137, juggler, **recruitable** → another Nicodemus lead), and his dog **Kador** (135, flavor / talking-dog easter egg — no quest;
commanding his tricks unpaid is what makes Zoltan snub you); and **Sinjen** (181, a warrior who volunteered for Lenora's
stocks — flavor; name-drops "Mandrake's version of the eight virtues"). Plus the enchanter **Nicodemus** (58, E of Yew
— a magic vendor: reagents / spell-teaching / yew staves; no quest payload). **The entire Minoc block (63–74) is now decoded; glassblower = Dale (70).** — the rest of the Minoc block (65, 67, 68, 70–74, + 69 off-box) is
unvisited. And **Buccaneer's Den** — **Captain Fox** (111, pirate captain of the *Silken Stag*): pure
flavor — **no silver tablet, never names "Hawkins"**; only quest-adjacent line is the **Captain John**
rumor (thread 4); **Leodon** (113, **female** capt. of the *Golden Hind*, **recruitable**) → her `john`
topic surfaces Elad; **Elad** (112, "the tea-drinker," reforming drunk) → his John "truth"
(captured → Hythloth), disputed by Leonna, + pays 5 gold for the Honesty mantra "ahm"; and **Leonna**
(114, Leodon's first mate, **recruitable**) → her John story (Hythloth, to kill gargoyles) **loops back
to Fox**, closing the den's John-rumor circle (**dead-end gag**); **★ Budo** (115, merchant "the Den" →
**Thieves' Guild** recruiter, belt obj 25); and **★★ Homer** (116, ex-Hawkins crew → **the silver-tablet
treasure quest**: 9-piece map, gated by the guild); plus **Johann** (117, nervous bard/deserter → ★ a
balloon-book lead + names "Bonn"), and the den's three vendors **Shawn** (118, food/drink), **Petroph**
(119, innkeeper of the *King's Ransom*), **Enrik** (120, weaponsmith), **Fentrissa** (121, **shipwright**
→ ships & skiffs, like Trebor) — all flavor/vendors. **✅ All 11 Buccaneer's Den NPCs (111–121) are now
decoded.** And **Trinsic** — **Immanuelle** (80, flirty **horse trader** at the stables: horses 60g; no
quest item); **★★ Sandy** (75, the cook *Sandstone Angus* → the **map-piece informant**: a dragon
egg (obj 417, from Destard) buys 4 holder leads, incl. that **Lord Whitsaber** = the first mate
**Alastor Gordon**); and **★ Whitsaber** (76, **Trinsic's mayor** = the first mate **Alastor Gordon** →
holds **map-piece obj 401**, surrendered via the Sandy-secret blackmail; also sources the **Honor** rune
— openly on a town-center pedestal — and the mantra **"summ"**); plus the town's services — **Lawrence**
(77, tavernkeeper of the *Fool's Pair o' Dice* — food/drink), **Harold** (78, farrier — horseshoes),
**Brandon** (79, weaponsmith — arms & armour; declines to join), and **Tobatha** (81, the healer —
heal/cure/resurrect, free at high karma; points to a gravedigger for cheaper resurrection). **✅ All 7
Trinsic NPCs (75–81) now decoded** — the quest content is Sandy (75) + Whitsaber (76); the rest are
flavor/services. And **Empath Abbey** (the abbey of Love / "Brotherhood of the Rose", ~(149,198)) —
**Glen** (146, the **mortician** Glen D'Arc: cremation; the **Mole** relay sidequest, reward = a slain
mage's enchanted loot; **Mole hints Glen is shady** — "not all bodies end up where supposed… his back
room"), **Stephanie** (148, the **blind healer**), **Faren** (149, the **wine-seller**, her brother),
**Zeke** (150, the one-armed **beekeeper** — honey vendor), **Eckhart** (151, the **vinekeeper** —
seedless grapes, Brotherhood of the Rose; restates the Nicodemus lead), **Mole** (178, the **gravedigger**
— Glen's relay; give a shovel obj 104; digs graves, doesn't resurrect), **Sionnach** (179, a wandering
**troubadour** → sings of sunken treasure ships, esp. the **Virtuous at Loch Lake**), and **Ben** (54,
"Big Ben" the **lumberman** near the abbey → sells the **yew log obj 274, 5g** for the Sacrifice-rune
panpipes chain). **✅ All 8 Empath Abbey NPCs decoded — and NONE holds a map piece.** So the Empath
Abbey map-piece (Sandy's "Nathaniel Moorehead" — a name with no matching NPC) is **not** given by any
talker here; the only local hook is **Glen's "back room" / missing bodies** (Mole's hint). And **Paws**
(✅ fully decoded — all 11 residents 100–110 + the wandering Mandrake) —
**Marissa** (102, the haughty seamstress *Miss Trihune* → ★ sews the **balloon silk bag**
obj 421 from the plans obj 270 + a silk bolt obj 241 + 75g; thread 6) and **Arbeth** (103, the timid
**spinner** → ★ spins 40 spidersilk → a silk thread spool for the bag; points to a weaver) and **Thindle**
(100, the whimsical **weaver** "the spindler" → can't do silk, redirects the silk-bolt weaving to
**Charlotte** in New Magincia; cloth/thread vendor + the *flippits* easter egg); **Dr. Cat** (110, keeper
of the **Cat's Lair** — Taynith's friend; the "duck" story = flavor; plays Nim; buys Snilwit's boardgame
book obj 151); and **Mandrake** (180, the wandering **minstrel** → ★ the **Beh Lem** friendly-gargoyle
lead, thread 4; his "eight virtues" = the flavor joke Sinjen named); plus the village's everyday folk —
**Mortude** (101, **ropemaker** → rope obj 284, 5g + the *flippits* dice game), **Hendle** (107,
**slaughterman/butcher** — meat vendor), **Ubermon** (108, **dairyman** — milk/cheese), **Timothy** (109,
**innkeeper** — rents a room to rest), **Grison** (104, the **miller** "Gris" — grain↔flour), **Dorin**
(105, the **shepherd** "Memah" — wool), and **Merideth** (106, a **little girl** with her doll *Becky*,
who gossips about the neighbours) — all flavor/services, no quest content. *(Merideth's two riddles
resolve to townsfolk: the "ghost" **Gris** = **Grison** the flour-dusted miller (104); her grandma
**"Memah"** = **Dorin** the shepherd (105), whom **Ubermon** courts.)* **Paws' only quest content is
the balloon silk-bag chain (Marissa/Arbeth/Thindle → Charlotte) + Mandrake's Beh Lem lead.**
And **New Magincia** (✅ fully decoded — the SE-isle **city of Humility**, all 7 residents 92–98) — a
rich stop: **Antonio** (92, the **lord/governor** → ★★ gives the **Rune of Humility** obj 249 if you name
the humblest townsperson, **Conor**; wrong guess −5 karma), **Conor Starfalcon** (94, the **fisherman** /
ex-guildmaster → ★★ **the riddle answer** + the **Mantra "lum"** + a **boat** toward the SE Shrine of
Humility; knew Iolo of old), **Aurendir** (98, a **shepherd** / ex-mage → ★ also gives the **Mantra
"lum"**; wool vendor), **Katrina** (97, *"the humble peasant"* → ★ **recruitable companion**, the Humility
figure; won't name the humblest), **Charlotte Weaver** (95, the shy **silk weaver** → ★★ weaves **silk
thread obj 226 → the silk bolt obj 241 for 10g**, then "take it to Marissa" — the New Magincia link in the
balloon chain, thread 6), **Dunbar** (96, the **Humble Palate** tavernkeeper → the **Conor "glow"** lead),
and **William** (93, an old **farmer** → flavor, points to Antonio). **So New Magincia sources the whole
Humility rune+mantra pair (thread 3) and confirms Charlotte's silk step (thread 6).**
And **Jhelom** (✅ fully decoded — the far-SW-isles **city of Valour**, all 11 residents 43–53) — another
rich stop: **Zellivan** (43, the **town leader** → ★ the **Rune of Valour** went to the tourney victor "no
man" = **Nomaan**; mantra at the Sword & Keg), **Nomaan** (44, "**Naughty Nomaan**," the **armourer** →
★★ won the Rune of Valour then drunkenly lost it — **a rat carried it into a hole in the Sword & Keg
wall**), **Lyssandra** (48, the barmaid "Andy" → ★★ the **retrieval key**: a **talking mouse (Sherry)** can
fetch the rune from the hole), **Culham** (49, a **bard** → ★ sings the **Mantra of Valour "ra"**;
his rune-story can spark a brawl), **Jerris** (50, an aspiring guard → corroborates the rat-hole rune +
mantra-in-song), **Heftimus** (47, the **hook-handed beggar** *Heftimus McPry* → ★★ a **silver-tablet
map-piece** holder, thread 2: for 10–20g he reveals his scrap is in **dungeon Wrong**; **Hawkins** cut off
his hand, confirms Hawkins dead + ship *Empire*), **Stelnar** (45, *Starhelm*, a **monster-slayer**,
Shamino's old comrade → ★ the **Sin'Vraal**/**Dry Land** lead, thread 4), **Van Kellian** (46, a **bard** →
the mercy side of the gargoyle debate + the pride mantra "mul"), **Peer** (53, the **shipwright** → ships &
skiffs, obj 149), **Arvin** (51, the **Sword & Keg** tavernkeeper — where the rat hole is), and **Martin**
(52, "Dutch," the **Warrior's Stead** innkeeper). **So Jhelom sources the whole Valor rune+mantra pair
(thread 3), locates the hook-handed map piece (thread 2 → dungeon Wrong), and corroborates Sin'Vraal's Dry
Land (thread 4).**
