# Research: NPC conversation-script summaries (on-demand)

**Status:** a growing catalog — one section per NPC, added when Zane asks me to
inspect that NPC's conversation. NOT exhaustive (200 NPCs exist); only the ones
requested. Each entry summarizes the decoded `converse.a/.b` bytecode for that NPC
(topics, branches, copy-protection, actions).

**Standing rule (Zane, binding):** when Zane asks to *check* an NPC — even when the
question is just "does this NPC touch a quest item?" — **decode it in full and add its
section here**, don't only answer the narrow question. A check always produces a catalog
entry. (Zane is investigating the main-quest storyline himself, so: decode only the NPCs he
names, one at a time — no catalog-wide content scans that would spoil the chain.)

The conversation **engine** is
[research_conversation_vm.md](research_conversation_vm.md); the rebuild **design**
is [research_i13_conversation_vm.md](research_i13_conversation_vm.md). This doc is
about script **content**.

## Checked NPCs (index)

**Sorted by npcId** (click a name to jump). The sections below are in *catalog (ask) order*,
so this index order differs from reading order — the anchors bridge the two. When a new NPC
lands, add a row here **and** an `<a id="npc-N">` anchor line directly above that NPC's header.

| npcId | NPC | File | One-line |
|---:|---|---|---|
| 2 | [Dupre](#npc-2) | `converse.a` | starting companion — keyword banter; quest-locked (won't `leav`e) |
| 3 | [Shamino](#npc-3) | `converse.a` | starting companion — banter; hints: gargoyles' "true nature", "I know [Lord British] better than you might think" |
| 4 | [Iolo](#npc-4) | `converse.a` | starting companion — party gold pool/split (obj 88) + hidden `spam`×3 → `humbug` developer menu |
| 5 | [Lord British](#npc-5) | `converse.a` | met-gate copy-protection quiz → castle key + briefing; topic menu; party heal; Wizard-of-Oz book quest; easter eggs |
| 6 | [Nystul](#npc-6) | `converse.a` | scripted quest-intro (no topic menu): the found book → **Mariah** at the Lycaeum; "hast thou the stone?" → ask **Lord British** |
| 33 | [Mariah](#npc-33) | `converse.a` | Lycaeum mage — magic-syllable copy-protection quiz; translates the **Book of Prophecies** (needs book obj 60 + both silver-tablet halves obj 389/390) → reveals the "false prophet = Avatar" + points to **Sin'Vraal**; gypsy lead for the missing tablet half |
| 34 | [Thariand](#npc-34) | `converse.a` | Lycaeum **librarian** (flavor) — book-catalog gags; live leads: **Nicodemus** lives SE of **Yew**; catalogs *The Lost Book of Mantras* / Priliwig's Compendium / Wizard-of-Oz; **★ also *The Lost Art of Ballooning* (718.5 B34 z5)** = Johann's balloon book (thread 6) |
| 35 | [Ephemerides](#npc-35) | `converse.a` | astronomer on Verity Isle — **the lens duplicator**: give him one lens (obj 396) + a **glass sword** (from **Minoc**) → he casts the second lens (obj 394) free, so you get **both** lenses the Vortex needs |
| 36 | [Xiao](#npc-36) | `converse.a` | Council mage (N. tip of Verity Isle) — **magic vendor**: spellbook 60g (obj 57), per-circle spell teaching, 7 reagents; **8th Circle gated on the wisp secret** ("seek the wisps") |
| 37 | [Dargoth](#npc-37) | `converse.a` | Lycaeum **healer** — paid heal (30g) / cure (10g) / **resurrect** (400g, needs the corpse obj 339); lead: a gravedigger is cheaper |
| 38 | [Rob](#npc-38) | `converse.a` | **Blue Bottle Tavern** keeper (Moonglow) — food/drink vendor (mead/ale/wine/bread/brie; brews Frasier's Folly); flavor |
| 39 | [Lord Aganar](#npc-39) | `converse.a` | Lord of **Moonglow** (Verity Isle) — Honesty-virtue lore: the **Rune of Honesty** was his, entrusted to **Beyvin**; mantra → **Penumbra**; **Shrine of Honesty** on **Dagger Isle** (north) |
| 40 | [Manrel](#npc-40) | `converse.a` | Moonglow woodworker — **Beyvin's cousin**: gives the **key to Beyvin's crypt** (obj 64 qual 12) + daffodils → unlocks the **Rune of Honesty** |
| 41 | [Penumbra](#npc-41) | `converse.a` | fortune teller (~922,502, near the Lycaeum) — sells the **Honesty mantra "ahm"** (5 gold); the **Rune of Honesty** is buried with **Beyvin** under Moonglow; pay out her fortune → the **lens prophecy** (broken **violet lens** must be repaired + a **blue lens** also needed, two lenses for the Vortex) |
| 42 | [Derydlus](#npc-42) | `converse.a` | Blue Bottle tavern patron (Moonglow) — flavor drunk; vouches for **Penumbra** ("she can truly be of great assistance") |
| 43 | [Zellivan](#npc-43) | `converse.b` | **Jhelom** — **Lord Zellivan**, the town leader (Valor; "I watch over the fighters") — ★ the **Rune of Valour** was awarded in his tournament; the victor was "no man" (a pun on **Nomaan**); points to the **Sword & Keg** pub (N side) for the mantra (in a song) + **Nomaan** for arms. No item |
| 44 | [Nomaan](#npc-44) | `converse.b` | **Jhelom** — "**Naughty Nomaan**," the **armourer** (buys/sells weapons + ammo by the dozen) — ★★ won the **Rune of Valour** in Zellivan's tourney, then dropped it drunk at the Sword & Keg → **a rat carried it into a hole in the pub wall** (lost ever since). No item |
| 45 | [Stelnar](#npc-45) | `converse.b` | **Jhelom** — **Stelnar Starhelm**, an angry **monster-slayer** (Shamino's old Spiritwood comrade) — ★ **Sin'Vraal lead** (thread 4): the gargoyle lives in the **Dry Land** (desert E of the Bloody Plains, where a Shrine of Honesty stands); wants him dead. No item |
| 46 | [Van Kellian](#npc-46) | `converse.b` | **Jhelom** — **Van**, a velvet-clad **bard** — sings; argues gargoyles deserve **mercy** (vs Stelnar; thread 4 thematic); names the **mantra of pride "mul"** (the anti-Humility mantra, learned from a beggar = Heftimus). No quest item |
| 47 | [Heftimus](#npc-47) | `converse.b` | **Jhelom** — **Heftimus McPry**, the **hook-handed beggar** (ex-sabre champion; **Captain Hawkins** cut off his hand) — ★★ a **silver-tablet map-piece holder** (thread 2): for **10–20 gold** he reveals his **map scrap is in dungeon Wrong** (he lost it there to rats); confirms **Hawkins dead** + his ship the **Empire** |
| 48 | [Lyssandra](#npc-48) | `converse.b` | **Jhelom** — **Lyssandra ("Andy")**, the ~12-yr-old barmaid at the **Sword & Keg** — ★★ the **Rune-of-Valour retrieval key**: the rat took it into the **wall hole**, and her idea (nobody listened) is that a **talking mouse** (Sherry, Lord British's friend) could fetch it. No item |
| 49 | [Culham](#npc-49) | `converse.b` | **Jhelom** — **Culham**, a seashell-vested **bard/lutist** — ★ sings the **Mantra of Valour "ra"** (his avalanche song, "sing 'ra' to make thee strong"); his loud rune-story can trigger a **pub brawl**. Also tells a gypsy tale. No item |
| 50 | [Jerris](#npc-50) | `converse.b` | **Jhelom** — **Jerris**, an aspiring guard (wants to join **Zellivan's Stalwarts**) — corroborates the **rat-hole Rune of Valour** (points to the wall hole; Shamino spots it) and that the **mantra is in Culham's song, "ra"**. No item |
| 51 | [Arvin](#npc-51) | `converse.b` | **Jhelom** — **Arvin**, keeper of the **Sword & Keg** pub (where the Rune of Valour's rat hole is) — food/drink vendor (rolls/ale/mead/wine/rations). No quest item |
| 52 | [Martin](#npc-52) | `converse.b` | **Jhelom** — **Martin ("Dutch")**, the jolly **innkeeper** of the **Warrior's Stead** (mock-German) — rents a room (5g/person → REST). No quest item |
| 53 | [Peer](#npc-53) | `converse.b` | **Jhelom** — **Peer**, the **shipwright** — sells **ship & skiff deeds (obj 149)** (party takes a collection if short); another watercraft source (cf. Trebor/Fentrissa) for island-hopping. No quest item |
| 54 | [Ben](#npc-54) | `converse.a` | **forest lumberman** ("Big Ben," cottage W of Yew near Empath Abbey) — sells a **yew log (obj 274) for 5g** = the raw material for the **panpipes → Rune of Sacrifice** chain (thread 3; → Aaron's sawmill → Julia); gruff (refuses the king's call to be a war-axe). No map piece |
| 55 | [Le'nard](#npc-55) | `converse.a` | **Yew** tailor (timid) — clothes vendor / buys thread; **★ silk-bag lead**: holding the balloon plans (obj 270), "Ask **Marissa in Paws**" (balloon envelope, thread 6) |
| 56 | [Andrea](#npc-56) | `converse.a` | **Slaughtered Lamb** pub-keeper (Yew) — food/drink + arm-wrestling; flavor. **★ Her pub is where the Rune of Justice is hidden** (under a potted plant, per Boskin) |
| 57 | [Utomo](#npc-57) | `converse.a` | **Yew** weaponsmith (island refugee) — arms/armor vendor; lead: a **lady on his home island makes magic fans** ("big wind, blow ships around") |
| 58 | [Nicodemus](#npc-58) | `converse.a` | the "powerful enchanter" E of Yew ("between two rivers") — turns out a **magic vendor**: reagents, spellbook (45g, obj 57), spell-teaching by Circle, yew staves (100g, obj 78); secretive about his "experimenting"; **no quest item** |
| 59 | [Lenora](#npc-59) | `converse.a` | **Lady Mayor of Yew** (Hall of Justice) — ★ **Justice** virtue: gives the **mantra "beh"**; the **Rune of Justice** was stolen (thief jailed) → her **letter of permission** (obj 152) admits you to the thief; also points to **Ben the logger** (yew logs) |
| 60 | [Boskin](#npc-60) | `converse.a` | **the jailed thief** — stole the **Rune of Justice** from the late Mayor's grave; call his bluff (`lie`/`fool`) or promise freedom → it's **under a potted plant in the Slaughtered Lamb** (lying = −5 karma) |
| 61 | [Pridgarm](#npc-61) | `converse.a` | **the Yew jailer** — with **Lenora's letter** (obj 152 q121) lends the **solitary cell key** (obj 64 q11) to reach Boskin (return = +7 karma); incorruptible; `cell` easter egg → tosses you the other cell keys |
| 62 | [Jaana](#npc-62) | `converse.a` | **Yew** druidess — a returning Ultima **companion**, recruitable; flavor + reinforces the **Nicodemus** lead ("lives between two rivers"); no quest item |
| 63 | [Isabella](#npc-63) | `converse.a` | **Minoc** mayor ("city of Sacrifice") — confirms the **Rune of Sacrifice** → Selganor; the **Sacrifice mantra** → ask healer **Tara** (npc 65, N side of town); balloon lead (→ Selganor → Sutek). No glassblower |
| 64 | [Selganor](#npc-64) | `converse.a` | **Minoc** artisan **guildmaster** — reagent copy-protection quiz; join the guild (make **panpipes** via Julia + recite **"Stones"** via Gwenno) → he gives the **Rune of Sacrifice** (obj 246). Leads: **Sutek**'s island (E of Serpent's Hold), Isabella (mayor) |
| 65 | [Tara](#npc-65) | `converse.a` | **Minoc** **healer** (N side) — heal 30g / cure 10g / resurrect 400g (free if poor + karma≥40); gives the **Sacrifice mantra "Cah"**. No glassblower |
| 66 | [Gwenno](#npc-66) | `converse.a` | **Minoc** bard, **Iolo's wife** — recruitable companion; teaches the song "Stones" (678987 8767653); points to **Selganor** (guildmaster). No glassblower lead |
| 67 | [Julia](#npc-67) | `converse.a` | **Minoc** instrument-maker (recruitable) — makes the **panpipes** (obj 153) from a **yew board** (obj 277): get a freshly-cut yew log in **Yew** → a **sawmill** → bring the board to her. No glassblower lead |
| 68 | [Michelle](#npc-68) | `converse.a` | **Minoc** basket-weaver — weaves the **balloon basket** (obj 422) from the **balloon plans** (obj 270) + 300g; also needs a **silk bag** (silk weaver). Balloon → Sutek's island. No glassblower |
| 69 | [Aaron](#npc-69) | `converse.a` | **Minoc** **sawmill** — cuts a **yew log** (obj 274) into a **board** (obj 277) for 5g (the board Julia needs for the panpipes) |
| 70 | [Dale](#npc-70) | `converse.a` | **Minoc** **Glassblower** (★ the one Ephemerides sent for) — makes the **glass sword** (obj 48) from **5 gems** (obj 77); points crystal/lens work to "a **lensmaker near the Lycaeum**" |
| 71 | [James](#npc-71) | `converse.a` | **Minoc** weapon/armor shop apprentice — vendor (master gone to fight gargoyles); flavor, no quest lead |
| 72 | [Trebor](#npc-72) | `converse.a` | **Minoc** shipwright — sells **ships & skiffs** (deed obj 149) for sea travel; traversal vendor, no quest item |
| 73 | [Troy](#npc-73) | `converse.a` | **Minoc** clockmaker — flavor (helped Ephemerides design the orrery gearwork); no quest lead |
| 74 | [Doris](#npc-74) | `converse.a` | **Minoc** innkeeper (Tinker's Inn) — rest 5g/person; flavor (studies under Xiao); no quest lead |
| 75 | [Sandy](#npc-75) | `converse.a` | **Trinsic** cook (Sandstone Angus) for **Lord Whitsaber** — ★★ the **map-piece informant**: give him a **dragon's egg (obj 417, from Destard)** → he names **4 holders** (woman pirate @ Serpent's Hold · hermit @ Dagger Isle · Nathaniel Moorehead @ Empath Abbey · **Lord Whitsaber = the first mate, Alastor Gordon**) (thread 2) |
| 76 | [Whitsaber](#npc-76) | `converse.a` | **Trinsic** mayor (Lord Whitsaber) — secretly **Alastor Gordon, Hawkins' former first mate**; ★ holds **map-piece obj 401**, surrendered via a two-step blackmail (raise Sandy/`alas`/`firs`/`mate` → confess `y`, then `map` → `y`). Also sources **Honor: rune on a pedestal in Trinsic's center + mantra "summ"** (thread 2 + main quest) |
| 77 | [Lawrence](#npc-77) | `converse.a` | **Trinsic** — tavernkeeper of the **Fool's Pair o' Dice**; food/drink vendor (grapes 3g · ale/mead/wine 1g · rations 4g each, party-aware). No quest content |
| 78 | [Harold](#npc-78) | `converse.a` | **Trinsic** farrier — sells **horseshoes** (obj 202) 2g; pairs with Immanuelle's stables. No quest content |
| 79 | [Brandon](#npc-79) | `converse.a` | **Trinsic** weaponsmith (a journeyman) — arms+armor vendor (maces/swords/two-handers/helms/shields/plate/magic armour), shop-hours gated, buys+sells; **declines to join** ("responsibilities here"); forges weapons "to fight the gargoyles" (flavor). No quest item |
| 80 | [Immanuelle](#npc-80) | `converse.a` | **Trinsic** stables — flirty **horse trader**: sells horses (60g via `GETHORSE`), party-aware buy loop. No quest item / no map piece (Trinsic's holders are Sandy 75 + the first mate) |
| 81 | [Tobatha](#npc-81) | `converse.a` | **Trinsic** healer ("a doddering old woman") — **heal 30g / cure 10g / resurrect 400g** (resurrect needs the corpse obj 339); **free** heal/cure at **karma ≥ 40**; no-gold resurrect → "see a **gravedigger**" (cheaper; cf. Dargoth). No quest item |
| 92 | [Antonio](#npc-92) | `converse.b` | **New Magincia** — **Lord Antonio**, governor of the **city of Humility** (refined; does balloon-and-doves magic tricks) — ★★ **gives the Rune of Humility (obj 249)** once you name the humblest townsperson: **Conor (Starfalcon)**; a wrong guess costs **−5 karma** (thread 3) |
| 93 | [William](#npc-93) | `converse.b` | **New Magincia** — an old **farmer** (humility-as-honest-toil musings; carves wooden hippos) — flavor; points to **Antonio** for the rune. No quest item |
| 94 | [Conor](#npc-94) | `converse.b` | **New Magincia** — **Conor Starfalcon**, a **fisherman** (ex-guildmaster/warrior who renounced it all) — ★★ **the answer to Antonio's "humblest" riddle**; gives the **Mantra of Humility "lum"**; lends his **boat** (down at the beach) toward the **Shrine of Humility (far SE)**; knew **Iolo** of old (thread 3) |
| 95 | [Charlotte](#npc-95) | `converse.b` | **New Magincia** — **Charlotte Weaver**, the shy **silk weaver** — ★★ **weaves silk thread (obj 226) → the silk bolt (obj 241) for 10g** (the balloon-bag chain, thread 6), then "take it to **Marissa**" (Paws); also a wool/cloth vendor (buys wool 190 @10g, sells cloth 185 @25g) |
| 96 | [Dunbar](#npc-96) | `converse.b` | **New Magincia** — **Dunbar**, keeper of the **Humble Palate** tavern (fish/ale/mead/wine/mutton; fish bought from Conor) — ★ the **Conor "glow"** lead ("a strange glow by his house at night" + "head of some important guild"). No quest item |
| 97 | [Katrina](#npc-97) | `converse.b` | **New Magincia** — **"the humble peasant Katrina,"** ★ **recruitable companion** (the Humility figure; an ex-shepherd who now tills the land); pointedly **won't name the humblest** ("'twould be vain… or worse, a lie"). JOIN/LEAVE |
| 98 | [Aurendir](#npc-98) | `converse.b` | **New Magincia** — **Aurendir**, a **shepherd** & ex-mage who renounced wealth and magic after the Shrine of Humility — ★ also gives the **Mantra of Humility "lum"**; wool vendor (bale obj 190, 5g) (thread 3) |
| 100 | [Thindle](#npc-100) | `converse.b` | **Paws** **weaver** ("Thindle the spindler," whimsical/rhyming) — weaves thread → **cloth (obj 185, 15g)** but **CANNOT work silk** → redirects to **Charlotte** (New Magincia) for the balloon silk bolt (thread 6). Cloth/thread vendor + the *flippits* easter-egg game; friends with Mortude |
| 101 | [Mortude](#npc-101) | `converse.b` | **Paws** **ropemaker** ("a man nearly as wide as he is tall," gruff) — sells **rope (obj 284, 5g)**; plays the bone-in-a-hat dice game **flippits** (easter egg; friends with Thindle). No quest item |
| 102 | [Marissa](#npc-102) | `converse.b` | **Paws** seamstress ("Miss Trihune," haughty fashion-maker) — ★ **makes the balloon silk bag (obj 421, the envelope)** from the **balloon plans (obj 270)** + a **bolt of silk (obj 241)** + 75g (thread 6); silk-bolt chain: spidersilk → **Arbeth** (Paws threadmaker, npc 103) spins thread → **Charlotte** (New Magincia) weaves the bolt. Also a clothes vendor (tunic/dress/pants) |
| 103 | [Arbeth](#npc-103) | `converse.b` | **Paws** **spinner** (timid, "never looks you in the eye") — ★ spins **40 spidersilk (obj 71) + 20g → a silk thread spool (obj 226)**; then a **weaver** (he names **Thindle** npc 100 in Paws; Marissa names **Charlotte** in New Magincia) weaves it → the silk-cloth **bolt (obj 241)** for **Marissa**'s balloon bag (thread 6). Also sells thread / buys wool |
| 104 | [Grison](#npc-104) | `converse.b` | **Paws** **miller** ("Grison Fairfleth," goes by 'Gris' — a figure covered head to toe in flour) — grain↔flour vendor (sells **flour obj 167, 4g**; buys **grain obj 166, 3g**); **he is the "ghost" Merideth (106) fears** — just flour-dusted. No quest item |
| 105 | [Dorin](#npc-105) | `converse.b` | **Paws** **shepherd** ("a plump older woman with an apron") — wool vendor (**bale obj 190, 5g**), bakes shepherd's pie; **she is "Memah," Merideth's (106) grandmother**, and Ubermon ("Uby") courts her. No quest item |
| 106 | [Merideth](#npc-106) | `converse.b` | **Paws** — a **little girl** ("Merideth Cassandra Lamby") with her doll *Becky*; pure **flavor** (child's-eye gossip — her "secret friend" Arbeth, the "ghost" **Gris** = the flour-dusted miller **Grison** (104), her grandma **"Memah"** = **Dorin** (105), Ubermon courting Memah). No quest item |
| 107 | [Hendle](#npc-107) | `converse.b` | **Paws** **slaughterman / butcher** ("a pungent smell greets you before he can"; unpopular in the pub) — meat vendor (ham/bacon obj 133, pork chops obj 129, brisket/steak obj 209, ribs obj 210). No quest item |
| 108 | [Ubermon](#npc-108) | `converse.b` | **Paws** **dairyman** ("Ubermon Kalbmilch," mock-German accent, disarming grin) — sells **milk / cheese** (for "crowns"); courts **Dorin** (105, "Memah"). No quest item |
| 109 | [Timothy](#npc-109) | `converse.b` | **Paws** **innkeeper** ("sea-blue eyes," named for his uncle Sir Timothy Enders Daverstock, a famed knight who held a bridge alone) — rents a room ((party+1)×5 g → sleep/REST + meal). No quest item |
| 110 | [Dr. Cat](#npc-110) | `converse.b` | **Paws** — keeper of the **Cat's Lair** tavern (cat-lover; **Taynith**'s dearest friend, bar closes when she visits); the **duck** story (Taynith's "ask about the duck" = flavor, a free ale); plays **Nim** (gambling minigame); **buys Snilwit's Big Book of Boardgame Strategy** (obj 151 q70). Tavern vendor (ale/mead/wine/milk/mutton) |
| 111 | [Captain Fox](#npc-111) | `converse.b` | pirate captain of **Buccaneer's Den** (the *Silken Stag*) — pure **flavor**: **no silver tablet**, never names "Hawkins"; only quest-adjacent line is the **Captain John** rumor (went underground after the gargoyles, fled, whereabouts unknown — Leodon disputes it) (thread 4) |
| 112 | [Elad](#npc-112) | `converse.b` | **Buccaneer's Den** — "the tea-drinker," ex-captain of the sunk *Theodosia Marie* (reforming drunk); ★ his "truth" about Captain John = **captured by gargoyles, dragged into Hythloth** — but **Leonna (114) disputes** it (the den's John-rumor gag continues); wants the **Honesty mantra "ahm"** (pays 5 gold). No tablet |
| 113 | [Leodon](#npc-113) | `converse.b` | **Buccaneer's Den** — **female** captain of the *Golden Hind* (in for repairs), **recruitable**; ★ on `john` says he "joined the gargoyles, the dirty traitor" → **Elad (112) interrupts that he knows "the truth about Captain John"** (thread 4 lead); Leonna (114) also recruitable. No tablet |
| 114 | [Leonna](#npc-114) | `converse.b` | **Buccaneer's Den** — ex-captain, **Leodon's first mate**, **recruitable**; ★ on `john` says he went into **Hythloth** to kill gargoyles → **Fox (111) interrupts HER**, closing the den's John-rumor **loop** (Fox→Leodon→Elad→Leonna→Fox = dead-end gag). No tablet |
| 115 | [Budo](#npc-115) | `converse.b` | **Buccaneer's Den** merchant ("the Den") — general-goods vendor (torches/oil/lockpicks/gems/backpacks/bags/shovels/powder kegs); **★ Thieves' Guild recruiter**: holding a guild belt (obj 25) gets you in, else "Who sent you?" → initiation = "retire" a guild member in the **Britain sewers**. Guild membership is what makes **Homer (116)** talk |
| 116 | [Homer](#npc-116) | `converse.b` | **Buccaneer's Den** — ex-pirate of Capt. **Hawkins** (now **dead**, killed by his crew); **★★ the silver-tablet quest giver**: the bigger half (obj 390) is in **Hawkins' buried treasure**, found via a **9-piece map** — gated on Thieves'-Guild membership (Budo); collect 8 pieces (obj 400-407) from scattered crew → Homer gives the 9th (obj 408) + dig directions, his price = the **storm cloak** (obj 81) |
| 117 | [Johann](#npc-117) | `converse.b` | **Buccaneer's Den** — "Yodeling Johann," nervous **bard** + ex-pirate **deserter** (hiding from **Bonn**, **Ybarra**, Hawkins); ★ his ballooning song → "read about it in a book at the **Lycaeum**" → ask the librarian (thread 6 balloon lead). No tablet/map piece |
| 118 | [Shawn](#npc-118) | `converse.b` | **Buccaneer's Den** food/drink **vendor** (ham/ale/mead/wine/rations) — flavor, no quest |
| 119 | [Petroph](#npc-119) | `converse.b` | **Buccaneer's Den** **innkeeper** of the *King's Ransom* (rest 6g/head, broken-English) — flavor, no quest |
| 120 | [Enrik](#npc-120) | `converse.b` | **Buccaneer's Den** weaponsmith "Enrik the Hammer" (arms/armor buy+sell, shop-hours gated) — flavor, no quest |
| 121 | [Fentrissa](#npc-121) | `converse.b` | **Buccaneer's Den** **shipwright** — sells **ship & skiff deeds** (obj 149), a 2nd watercraft source (cf. Trebor, Minoc); handy for the island-hopping treasure hunt. No quest item |
| 133 | [Zoltan](#npc-133) | `converse.b` | **king of the gypsies** (near Yew) — ★ the **gypsies** Mariah sought: 10g → the **silver-tablet** story (Capt. **Hawkins** stole the bigger half to **Buccaneer's Den**, E of Paws; **Capt. John** = gargoyle-friendly tablet origin); reagent vendor |
| 134 | [Karina](#npc-134) | `converse.b` | gypsy girl, **Zoltan's daughter** & dancer — **Penumbra (npc 41) is her sister**; dance = +10 karma; defers quest topics to her father; no item |
| 135 | [Kador](#npc-135) | `converse.b` | the gypsies' **dog** (beside Zoltan) — flavor / easter egg (the free-will-vs-determinism monologue); **no quest**; commanding tricks sets the bit-7 flag that makes **Zoltan** snub you until you pay the dog's bowl |
| 136 | [Taynith](#npc-136) | `converse.b` | mysterious gypsy **fortune-teller** — tile-casting prophecies (a "**glass** item matters → seek **Penumbra**'s crystal ball" = the lens; "down far then up far" = the abyss/vortex); names **Dr. Cat in Paws** |
| 137 | [Blaine](#npc-137) | `converse.b` | gypsy **juggler** — **recruitable companion**; advice (1g) → **Nicodemus** "east of Iolo's hut"; juggling show (5g) |
| 146 | [Glen](#npc-146) | `converse.b` | **Empath Abbey** **mortician** — "Glen D'Arc of the Trinsic D'Arcs," a pale, moonlight-loving undertaker; cremation (corpse obj 339 → urn obj 170, 15g); runs a **message-relay sidequest** with **Mole** the gravedigger (npc 178) → reward = a slain mage's enchanted items + gold. No map piece |
| 148 | [Stephanie](#npc-148) | `converse.b` | **Empath Abbey** **healer** ("Steph," young + **blind**) — heal 25g / cure 5g / resurrect 350g (resurrect needs corpse obj 339); **free** heal/cure at **karma ≥ 40**; shop-hours gated. **Faren's sister**. No map piece |
| 149 | [Faren](#npc-149) | `converse.b` | **Empath Abbey** **wine-seller** — "Faren the drunk," sells abbey wine (White/Red/Dry/Sweet/**Abbey Red**/**Abbey Dry**, made on-site); **Stephanie's brother**; muses on gargoyles ("we know them by how they differ, not their similarities" — thematic). No map piece |
| 150 | [Zeke](#npc-150) | `converse.b` | **Empath Abbey** **beekeeper** ("Zeke the one-armed," lost his arm vs **Mondain**) — honey vendor (buy honey obj 184 10g / sell honey jar obj 183 7g); buys hives from **Michelle** (Minoc). No map piece |
| 151 | [Eckhart](#npc-151) | `converse.b` | **Empath Abbey** **vinekeeper/gardener** — tends the vineyard ("Brotherhood of the Rose"); **seedless grapes** (the enchanter's work), gives free table grapes (obj 95); points to **Nicodemus** (E, "between two rivers, N of Britain") + Faren (wine). No map piece |
| 178 | [Mole](#npc-178) | `converse.b` | **Empath Abbey** **gravedigger** (Glen's employee, digs bare-handed) — the other half of the **Glen relay**: **GIVE him a shovel (obj 104)** resolves the feud + he hints **Glen is shady** ("not all bodies end up where supposed… his back room"). Digs graves, does NOT resurrect. No map piece |
| 179 | [Sionnach](#npc-179) | `converse.b` | **Empath Abbey** wandering **troubadour** ('ShaNOK', courting Sylaina; greets Iolo) — drum/song lore; ★ sings **"The Ballad of the Virtuous"**: a ship sunk at **Loch Lake** ("great treasure on her"), Capt. **Keegan** of Serpent's Hold; also names the **Dutchman** + **Empire** wrecks (a possible "shipwreck" treasure lead). No map piece |
| 180 | [Mandrake](#npc-180) | `converse.b` | a wandering **minstrel** (news/tales/songs; ~Paws) — ★ **captured by gargoyles, freed by a friendly gargoyle named "Beh Lem"** (thread 4 — a human↔gargoyle bridge, cf. Sin'Vraal/Capt. John); his comic "**version of the eight virtues**" (wine/women/song → drunkenness/sensuality/…) = the flavor joke **Sinjen** named; names taverns + the Dry Land's giant ants |
| 181 | [Sinjen](#npc-181) | `converse.b` | a warrior **voluntarily in the Yew stocks** ("a different perspective on life") — flavor; thinks **Lenora** carries Justice too far; name-drops **Mandrake's** "version of the eight virtues" (minor lead); no quest item |

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

<a id="npc-5"></a>

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

---

<a id="npc-6"></a>

## Nystul — npcId 6 (`converse.a`), 1,434 bytes

**You see** "a concerned looking mage."

**A scripted quest-intro NPC — no topic menu.** Unlike Lord British, Nystul has **no
`ASKTOP` ask/answer loop and no keyword topics**: the whole conversation is a single linear
monologue with two conditional branches and one yes/no prompt. The only player input is the
moonstone Y/N question. His script is the canonical U6 opening hook — the Avatar arrives via
the red moongate with the starting companions, and Nystul (Lord British's court mage) sends
you off on the Book-of-Prophecies / Mariah translation quest.

**Gated on `TalkFlags[self]` bit 7 ("have we met?"):**
- **First meeting** (bit 7 clear) → `SET` bit 7, play the book/Mariah quest intro + the
  moonstone Y/N, then `SET` bit 0 and end.
- **Return visits** (bit 7 set) → straight to a one-shot nag (`GOTO @1293`): *"Hast thou
  gone to the Lycaeum and shown Mariah the book? 'Tis most important."* … *"There is naught
  else I can help thee with at this time."* then ends (`LEAVE`).

### First meeting — the quest intro (linear, with two branches)
1. *"Hail to thee $G, and well met."* → *"'Twas I who learned of thy peril through my mystic
   arts, so that aid might be sent unto thee."* → *"Iolo, I saw that thou didst find a
   book."* / *"Might I examine it?"* — switches the portrait to **Iolo** (`SHOW_CONVERSE`
   npc 4; the script's own text attributes the next lines to Iolo).
2. **Branch — does Iolo still carry the book?** `IF OWNS(Iolo[npc 4], obj 60, qual 0) == 0`:
   - **Iolo no longer has it** → Iolo: *"I no longer have the book, milord."* → portrait back
     to Nystul → *"That is too bad. I had hoped thou might take it to Mariah and have her
     translate it."* → `GOTO @874`, skipping the cover description straight to the stone
     question.
   - **Iolo still has it** (the IF-false fall-through) → Iolo: *"Certainly, milord. Perhaps
     thou canst make better sense of it than I."* → portrait back to Nystul → *"Strange..."*
     / *"This has a picture on its cover of a gargoyle standing with one foot on the chest of
     a slain human."* / *"This is interesting."* / *"It's written in a language I know not."*
     / *"Take it to Mariah at the Lycaeum, the finest scribe on the great Council of
     Wizards."* / *"She has studied many languages, and perhaps she can decipher this book
     for thee."*
   - **obj 60 (0x3C) = the Book of Prophecies** (`research_main_quest.md §2`).
3. **The moonstone question** (both branches rejoin here, at `@874`): *"One more thing,
   Avatar..."* / *"I noticed that thou didst arrive through a red gateway."* / *"Dost thou
   have the stone that opened the gate?"* — a `GET` that accepts only **`y` / `n`**:

| Answer (exact) | Response |
|---|---|
| `y` | "From whence could it have come? The gargoyles, perhaps?" / "Best ask Lord British about it." / "I believe he has some knowledge of such items." |
| `n` | "Such items are quite rare." / "Indeed, the only one I have ever seen is that which Lord British himself possesses." |

Either answer falls through to `SET` self bit 0, then `LEAVE` (ends).

**Actions the script performs:** `SET` self **bit 7** (met) at the start of the first
meeting, and `SET` self **bit 0** (name-known) at the very end — so Nystul is addressed as
**"Nystul"** only *after* the intro is completed (this refines the earlier Journal note that
he "stays 'mage'", which reflected the pre-completion header; the reveal is automatic here,
not via a `name` keyword). Reads `OWNS(Iolo, Book of Prophecies)` to branch.
`SHOW_CONVERSE` toggles the portrait between **Iolo** (npc 4) and **Nystul** (self) so the
scene reads as a three-way exchange. **No** give/take/karma/heal — Nystul hands over nothing;
he is a pure plot-delivery NPC (the Mariah/Lycaeum book-translation hook + the Lord British
moonstone hook).

---

## The three starting companions — Dupre (2), Shamino (3), Iolo (4)

The party you arrive with. All three are **keyword-banter** NPCs that loop a topic menu and
**refuse to `leav`e the party until the main quest is complete** (Lord British's standing
order). Their `*` (catch-all) answers form a little deflection cycle: **Dupre → Iolo →
Shamino → Dupre**. None carries a quest item or a story gate — except that **Shamino drops
two thematic hints** (below), and **Iolo** doubles as the party's gold-manager and hides the
developer debug menu.

<a id="npc-2"></a>

### Dupre — npcId 2 (`converse.a`), 1,238 bytes

**You see** "a ruggedly handsome man, wearing a gleaming suit of armor."

Sets bit 0 (name-known) immediately on the greeting (`"Yes, $P?"`), so he reads as "Dupre"
from the first word. Pure banter; every topic `GOTO`s back to the ask prompt.

| Keyword prefix(es) — exact | Response |
|---|---|
| `name` | "It's Dupre - sounds like dew pray, remember?" |
| `job` | questing — "many a @quest together, you and I." |
| `ques` | rescuing @damsels, finding @grails |
| `resc` `dams` | "Some of them are pretty eager to show their @gratitude…" |
| `eage` `grat` `know` `mean` | "Wink wink, nudge nudge, say no more…" |
| `find` `grai` | "Lord British likes to keep grails around to use at his @banquets…" |
| `lord` `brit` `banq` | "He'll throw us a fine feast if you can deal with the @gargoyle invasion…" |
| `garg` `inva` | "They may be the toughest threat we've ever faced." |
| `join` | "I've been with you since the start of this quest, haven't I?" |
| `leav` | "Lord British gave me strict orders not to leave your side until this quest is complete." |
| `duck` | "Please, let's not talk about ducks…" (easter egg — Dupre's running gag) |
| `bye` | "Let's go find some action!" → ends |
| `*` | "Ask Iolo about that." |

**Actions:** `SET` self bit 0 (name) only. No give/take/quest.

<a id="npc-3"></a>

### Shamino — npcId 3 (`converse.a`), 1,761 bytes

**You see** "a quiet man, who almost seems to be a creature of the forest."

Greeting "Yes, my friend?"; the name-known bit is set only when you ask his `name`. Unknown
topics deflect to Dupre.

| Keyword prefix(es) — exact | Response |
|---|---|
| `name` | "Shamino Salle' Dacil." (then `SET` self bit 0) |
| `job` | helps his @friends; exploring the @woods |
| `frie` | "…one of my closest friends." |
| `wood` `expl` | prefers the Deep @Forest; Spiritwood and its @wisps |
| `deep` `fore` | it is @home; the forest @creatures |
| `home` | "A home needs not @walls to make it so." |
| `wall` | "…where are the @trees in theirs!" |
| `tree` | "…the lifesblood of the realm…" |
| `crea` | learning from animals — **if Dupre is in the party**, Dupre cuts in: "Now Shamino's going on about talking to animals… The whole world's going batty!" |
| `wisp` | "…some @mages who have investigated them…" |
| `mage` | "…members of the council could tell you more." |
| `garg` | **"I feel that Lord @British does not understand their true nature."** |
| `lord` `brit` | **"I know him better than you might think."** |
| `join` | "I'll follow you wherever thou might choose to lead…" |
| `leav` | "I'd best stay with you." |
| `bye` | "A pleasure." → ends |
| `*` | "Ask Dupre about that." |

**Actions:** `SET` bit 0 (name); a conditional party cut-in (`ISINPARTY` Dupre → portrait
swap). No give/take. The two **bold** lines are in-script storyline hints (the gargoyles'
"true nature"; Shamino knows Lord British better than he lets on).

<a id="npc-4"></a>

### Iolo — npcId 4 (`converse.a`), 5,461 bytes — party gold-manager + a hidden debug menu

**You see** "your old friend Iolo."

Sets bit 0 immediately. Greeting: "do you need @help with something? Or maybe you've got
time for a @story?" The largest party script: beyond banter it owns the **party gold
utility** and a **developer cheat menu**.

Banter topics: `name` ("pronounces it 'Yo-low'"), `job`/`appr`/`shop`/`cros` (a crossbow
maker whose apprentice now runs the shop), `bard`/`wife`/`gwen`/`mino`/`arti` (hopes to join
his wife **Gwenno** in **Minoc** after the quest), `tea`/`fras`/`foll`, `brit`/`mr`/`nose`
(the Lord-British "Mr. Nose" gag), `join`/`leav` (the quest-lock — "his nibs, the king"),
`garg` ("pretty ugly looking"), and `stor` (a Dupre tournament story Dupre interrupts if
present). `hut`/`home`/`smit`/`clue` → "My hut is in the Deep Forest, south of Yew. My horse
**Smith** lives there." (`smit` = his horse, not a smith.)

**Gold management (the real mechanic):**
- `gath` `pool` → gathers **all** party members' gold (obj 88) onto the Avatar, weight-capped
  (`TAKEOBJ` from each member → `GIVEOBJ` to the Avatar). "Iolo gathers up everyone's gold and
  hands it to you."
- `spli` `shar` → divides the gold evenly across members with room to carry it. "Iolo splits
  up the gold between everyone who has room to carry any."

**Hidden developer cheat menu:** say **`spam` three times** (it bumps a counter the normal
ask-loop resets each turn, so it only accumulates on consecutive `spam`s) then **`humbug`** →
a "Secret Cheaters Menu": **1.** Get items (arbitrary `GIVEOBJ`), **2.** Set flags (per-NPC
`SET`/`CLR`), **3.** View npcs (portraits / inventories / item search via `OWNS` / `SETMODE`
worktype), **4.** Edit party (`ADDSTR`/`ADDINT`/`ADDDEX`/`ADDLVL`/`ADDEXP`, `HEAL`/`CURE`,
`GETHORSE`), **5.** Edit player (set quest flag, `ADDKARMA`/`SUBKARMA`). A debug backdoor, not
part of normal play.

**Actions:** `SET` bit 0 (name); gold `TAKEOBJ`/`GIVEOBJ` (obj 88) in the pool/split routines;
and — via the `spam`×3 + `humbug` backdoor — the full set of cheat-menu writes above.

---

<a id="npc-33"></a>

## Mariah — npcId 33 (`converse.a`), 5,240 bytes — the Book-of-Prophecies translator

**You see** "a freckled young lady with an enchanting smile."

A Lycaeum mage (Verity Isle, ~tile (886,444)) and the **plot hub** for translating the strange
book Nystul points you to. Two `TalkFlags[self]` gates plus the name bit:
- **bit 5 = passed the magic-word quiz.** Checked on **every** entry — until set, the
  copy-protection quiz runs first ("I'm only supposed to help those who know the ways of magic").
- **bit 7 = has examined your book once** (first-examination scene vs. later status replies).
- **bit 0 = name known** (set when you ask `name`).

### Copy-protection — the magic-syllable quiz (until bit 5)
Picks **RND(1–5)** of five questions; the right answer → "That's right!" + **`SET` bit 5** →
topic menu. Wrong → "No, that's not it. Haven't you a Compendium of knowledge to draw on?"
(re-asks). `bye` → "I'd suggest you find a Compendium to study, then come talk to me again." (ends).

| Question (syllable) | Accepted prefix(es) — exact | (meaning — inferred) |
|---|---|---|
| What does 'Zu' mean? | `slee` | (sleep) |
| What does 'Quas' mean? | `illu` | (illusion) |
| What does 'Hur' mean? | `wind` | (wind) |
| What does 'Jux' mean? | `dang` `trap.harm` | (danger / trap / harm) — the `trap.harm` keyword has a literal `.` (a script typo) |
| What does 'Ort' mean? | `magi` | (magic) |

(The standard Britannian *words of power* — the Compendium/manual lookup that gated the 1990 game.)

### Topic menu (once past the quiz)
| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` | "They call me Mariah." (+ `SET` bit 0) |
| `job` | newest of the @Council of Wizards; uses the @library for her own studies |
| `coun` `wiza` | "…they forget even to eat and @sleep!" |
| `eat` `slee` | "…they dwell apart from the realm of the @senses." |
| `dwel` `apar` `real` `sens` | "Aye, indeed." |
| `libr` `stud` | "the finest library in all Britannia"; she studies **old languages** |
| `book` | **the main-quest branch** (below) |
| `half` `tabl` `anci` `silv` `deci` | the **tablet** branch (below) |
| `bye` | "Fare thee well." → ends |
| `*` | "I cannot help thee with that." |

### The Book-of-Prophecies quest (the heart of this script)
Objects: **Book of Prophecies** (obj 60 / `0x3C` — the strange-tongue book), and **two halves
of an ancient silver tablet** (obj 389 / `0x185` and obj 390 / `0x186`) — a bilingual "Rosetta"
stone. The branch is pure `WHOSGOT(obj)` inventory checks (`== 0x8001` ⇒ nobody in the party
holds it). The `book` keyword + a shared status block resolve to:

1. **Book not in the party** → "Nystul sent word to me that thou hast a book written in a strange
   tongue… But I'd find the task much easier if thou wouldst bring it here!" (you must be carrying
   obj 60).
2. **Book in hand, first time** (bit 7 clear) → `SET` bit 7 + the identification scene: she
   recognizes the script, reveals she keeps **part of a silver tablet** in her study with the same
   writing in *both* tongues, makes out the title — **"The Book of Prophecies"** — and a phrase
   about **"the end of our world,"** then asks for the **other half of the @tablet**.
3. **Book + BOTH tablet halves held** → the **full translation**: she reads the prophecy aloud —
   the **three signs of the end**; a **"false prophet"** of **another race** (the gargoyles, who
   revere him as a prophet) who will **desecrate their holiest shrine**, **steal the Codex of
   Ultimate Wisdom**, descend and **collapse the underworld** (quakes, plague, famine), and finally
   return with warriors to **destroy the gargoyle race**; the prophecy says the only aversion is
   **"the sacrifice of the false prophet."** She concludes **"they must mean you"** — the Avatar is
   the gargoyles' false prophet — and sends you to **Sin'Vraal**, a gargoyle living in the
   **desert** who speaks the human tongue, to hear the gargoyles' side.

> **Where the "Sin'Vraal pointer" actually is:** it is the *closing lines of this
> full-translation text* — "There's a gargoyle named Sin'Vraal living out in the desert. He
> speaks our language." / "Perhaps he could tell you more about this book, and of how the
> gargoyles view us." It is **NOT a `talk` keyword** — before you've assembled the book + **both**
> tablet halves, Mariah never names him at all. The pointer is gated behind the entire tablet
> sub-quest (the `@2292` branch). (Sin'Vraal = **npcId 141**, ~tile **(810, 234, z=0)**.)

### The tablet lead (`tablet` / `half`)
- Holding **no** tablet half → "I got my piece of the tablet from some **gypsies** whom I met at a
  pub. Mayhap they can tell thee where to look for the other piece. Bring **both** pieces of the
  tablet here…" (the gypsy lead).
- Holding **one** half → status replies: "I must have both halves before I can tell you any more"
  / "Ah, thou hast found the rest of the tablet! Go get the other half from **my study** and bring
  it here." (both halves must be in the party's inventory when you talk).

**Actions the script performs:** only `SET` `TalkFlags` bits (0 name · 5 quiz-passed · 7
book-seen). **No give/take/heal** — Mariah hands over nothing; she is a **plot / translation hub**.
The payoff is the prophecy text + the **Sin'Vraal** pointer.

**Thread:** Nystul → **Mariah** (translate the Book of Prophecies — needs the book *and* both
silver-tablet halves; gypsies have the lead on the missing half) → **Sin'Vraal** (a desert
gargoyle). (This is the book/prophecy line — distinct from the lens-repair thread.)

---

<a id="npc-41"></a>

## Penumbra — npcId 41 (`converse.a`), 3,478 bytes — fortune teller (Honesty mantra + the lens prophecy)

**You see** "a small, inscrutable woman, cloaked in shadows." At ~tile **(922, 502, z=0)** — near
the Lycaeum isle / the Orb's Qual-1 landing. She knows you're the Avatar on sight; **bit 0** = met
("Ah, hello Avatar. I was wondering when you would get here." → `SET` bit 0; on return: "I see you
have yet to fulfill your destiny.").

A high-value help NPC — three distinct leads (mantra · rune · the lens requirement).

### Topic menu
| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` | "I am the one known as @Penumbra." |
| `penu` | "I am the daughter of the eclipse." |
| `job` | "I am a @fortune teller." |
| `fort` `tell` | "Yes, I can foretell your @future for you." |
| `fore` `futu` | → the **fortune-telling** gold-sink (ends in the **lens prophecy**, below) |
| `beyv` | **Beyvin** — an @honest fellow who "lacked the virtue of tact… told the truth once too often"; now "buried in the catacombs under **Moonglow**, pushing up @daffodils." |
| `daff` | "Yes, daffodils." |
| `hone` | "I can tell you of both the @rune and the @mantra." |
| `rune` | "'Twas buried with @Beyvin, rest his shade." (→ the **Rune of Honesty** is in Beyvin's grave) |
| `mant` | → the **mantra divination** (5 gold → "ahm", below) |
| `bye` | "Your destiny awaits." → ends |
| `*` | "You must seek the answer to that elsewhere." |

### The Honesty mantra (`mant`) — 5 gold → **"ahm"**
"For five gold coins I can use my powers to divine the mantra for you. Shall I do this?" (`y`/`n`).
On `y`: if the party holds **< 5 gold** (obj 88) → "Your ambitions outreach your means."; else
`TAKEOBJ` 5 gold + `GIVEOBJ` 5 to herself → (a Dupre party-aside) → **"The word you seek is
'ahm.'"** — the **Honesty** mantra (matches `research_main_quest.md §4`'s Ahm/Mu/Ra/… set; "ahm" is
the first/Honesty virtue), spoken at the rune+mantra moonstone shrines.

### The Honesty rune lead (`hone` / `rune` / `beyv`)
The **Rune of Honesty** is **buried with Beyvin in the catacombs under Moonglow**. So the Honesty
half of the shrine puzzle = dig up Beyvin's grave for the rune, pair it with "ahm".

### Fortune-telling (`fore` / `futu`) — a gold sink that ends in the LENS prophecy
A repeated "How much do you give her?" (`GETINT` → `TAKEOBJ` that much gold) loop. Each payment
yields a vaguer line and a plea for more (dark future → a light at the tunnel's end → conflict →
travel → "the depths of the earth," strange creatures → terrible choices, powerful magic, "some
barrier"). Give **0** at any prompt → "So be it." (ends). Pay through to the end and she "breaks
through the barrier":
- **"I see a great Vortex."**
- **"There is a violet lens that is crucial to your quest. It is broken, and must be made whole."**
- **"But one lens is not enough! A blue lens is needed as well."**
- **"You must have two lenses, else all is for naught."**
→ then she rests (ends).

**Actions:** `SET` bit 0 (met); `TAKEOBJ` gold (obj 88) — 5 for the mantra, arbitrary amounts in
the fortune loop; `GIVEOBJ` 5 gold to herself (the mantra fee). No item gifts.

**Help summary (answering "can we get help from this one?" — yes, three leads):**
1. The **Honesty mantra "ahm"** (5 gold) — for the rune+mantra moonstone shrine.
2. The **Rune of Honesty** is buried with **Beyvin** under **Moonglow** — go dig it up.
3. The **lens requirement** (pay out the fortune): a broken **violet lens must be made whole** *and*
   a **blue lens** is also needed — two lenses for the Vortex. (She reveals the requirement; she
   does **not** repair the lens herself.)

**Thread:** Penumbra feeds two of the win's hard prerequisites — the **rune+mantra** moonstone
puzzle (Honesty: mantra "ahm" + the rune under Moonglow) and the **two-lens** requirement (violet
broken-lens repair + a blue lens). The repairer of the broken lens is still elsewhere.

---

<a id="npc-39"></a>

## Lord Aganar — npcId 39 (`converse.a`), 1,653 bytes — Lord of Moonglow (Rune of Honesty lore)

**You see** "a gentleman with an air of leadership about him." At **(894, 515, z=0)** — Moonglow,
on Verity Isle (the isle of Honesty; same isle as the Lycaeum / Penumbra). He recognizes you on
sight ("Thou art the Avatar! I saw thy portrait in Lord British's castle.") and offers aid; **bit 0**
= met (set on that first greeting).

A lore/lead NPC for the **Honesty** virtue — he corroborates and frames Penumbra's leads.

| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` | "I am Lord Aganar of @Moonglow." |
| `job` | "I keep things running smoothly here. 'Tis not difficult in a town of such @honesty." |
| `moon` | praises the town → `y`/`n` "thought of moving here?" → "good @fishing… plenty of merriment over at the Blue @Bottle." |
| `fish` | "Aye, indeed." |
| `blue` `bott` `merr` | the **Blue Bottle Tavern** — "drinking, singing, revelry… But mostly @drinking." |
| `drin` `sing` `reve` `tell` `tale` `tave` | "why not go pay a visit? … 'tis the biggest building in town." |
| `hone` | "Honesty is the virtue we prize most highly here… We are closest to the @Shrine of Honesty, and indeed, the @Rune of Honesty was entrusted into my care some years ago." |
| `shri` | "'Tis north of here, on **Dagger Isle**." |
| `dagg` `isle` | "Aye, just a ways to the north." |
| `rune` `care` | "I had it once, but I entrusted it to **@Beyvin**'s care, as he is the most honest man I know. He lives with **@Penumbra**." |
| `mant` | "**Penumbra** might be able to help you with that." |
| `penu` | "I can't imagine what Beyvin sees in her!" |
| `beyv` | "Haven't seen him around lately. **Penumbra** should be able to tell you where to find him." |
| `bye` | "Until next we meet, then." → ends |
| `*` | "Well you might ask…" |

**Actions:** `SET` bit 0 (met) only. **No give/take** — pure lore/lead NPC.

**Help summary (can we get help? — yes, leads for the Honesty virtue):**
1. The **Rune of Honesty** was in his care; he **entrusted it to Beyvin** (→ matches Penumbra: it's
   now buried with Beyvin under Moonglow).
2. The **mantra** → ask **Penumbra** (cross-reference; she sells "ahm").
3. The **Shrine of Honesty** is on **Dagger Isle**, north of Moonglow.

**Thread:** Aganar (Moonglow's lord, rune-keeper) ⇄ **Penumbra** (mantra "ahm" + Beyvin's
whereabouts) → **Beyvin** (holds the Rune of Honesty) → **Shrine of Honesty** (Dagger Isle). The
Honesty branch of the 8-virtue rune+mantra set is now fully sourced between Aganar + Penumbra.

---

<a id="npc-35"></a>

## Ephemerides — npcId 35 (`converse.a`), 4,522 bytes — astronomer + **the lens duplicator**

**You see** "a solemn man, constantly dusting and polishing the items in his shop." At
**(945, 398, z=0)** — Verity Isle. An astronomer / instrument-maker, and **the NPC who makes the
second lens** the win needs.

**Busy gate:** while he's at his telescope (his stargazing work schedule — `#W` npcMode `== 138`)
he turns you away: "Shhh! Can't you see I'm busy?! … come back in the morning." → ends. Otherwise
normal conversation. **Flags:** bit 0 = name known; **bit 7 = your lens is with him for analysis**
(in progress); **bit 6 = the duplicate lens is done**.

### Topic menu (astronomer flavor)
`name` (+`SET` bit 0) · `job` (astronomer — star movements, @moons phases, @tidal predictions; makes
@glasswares + @instruments) · `inst` ("@sextants mostly") · `glas` ("Lenses and the like.") ·
`tide`/`moon`/`sosa`/`felu`/`tram` (tides as a two-moon function; flat-world humor) · `orre`
(an @orrery clockwork model) · `roun` ("Absurd!") · `neap`/`spri`/`quad` (tide science) ·
`buy`/`sex` (his **shop**, below) · `mast` (master glassblower → **Minoc**) · `fly`/`mach` (a
Minoc flying machine — "Must have been a fairy tale") · `bye` (ends) · `*` ("That I cannot help you
with.").

### The lens duplication — the key branch (`vort` / `lens` / `conc`)
The win needs **two** lenses (`research_main_quest.md §1`: Britannia Lens obj 394 + Gargoyle Lens
obj 396). Ephemerides turns **one** lens into both:

1. **Bring him a lens (obj 396)**, first time → "Ooooh, let me see it… That's a very interesting
   lens. You need a concave copy of it?… It would be very tricky to duplicate, being magical in
   nature… The material and the nature of the enchantment appear similar to those involved in the
   making of **glass swords**. If I could keep this to analyze while you go get me a glass sword,
   I'll try and make a copy." → **`SET` bit 7 + `TRANSFEROBJ` your lens (396) into his keeping**
   ("Before you can protest, he pockets the lens. Let me know when you have the glass @sword.").
2. **Reminder** (lens with him, no sword yet) → "When you bring me a glass @sword, I should be able
   to duplicate your lens."
3. **Bring a glass sword (obj 48)** back → completion: "Ah, you've brought me a glass sword!… I'll
   melt down the glass sword and try to cast a lens for you… Here's your lens back, and the
   duplicate. **There's no charge** — the challenge of the task was reward enough… I don't know
   what you need these lenses for, but I wish you luck!" → **`SET` bit 6, `TAKEOBJ` the glass sword
   (48), `TRANSFEROBJ` your lens (396) back to you, `GIVEOBJ` the duplicate (obj 394)**.
4. Already done (bit 6) → "I hope the lens I made you will prove suitable."

**Net: supply one lens (396) + a glass sword → walk away with both lenses (396 + 394)** the Vortex
needs. Free of charge.

### Glass-sword lead (`swor` / `mast`)
"I once heard of a @master glassblower who could make glass swords…" → "**Minoc** is the logical
place to look. That town is filled with master craftsmen." (So: get a **glass sword** in Minoc.)

### Shop (`buy` / `sex`)
A standard merchant routine — picks a party member, then sells **sextant / telescope / crystal
ball** (gold obj 88 ↔ item, with affordability + carry-weight gates).

**Actions:** `SET` bits 0/6/7; `TRANSFEROBJ` lens 396 (to him, then back to you); `TAKEOBJ` glass
sword (48); `GIVEOBJ` the duplicate lens (394); plus the shop's gold↔item give/take.

**Help summary (yes — he is the lens fix):** Ephemerides solves the **two-lens** requirement
Penumbra named — bring him **one lens** + a **glass sword** (from a Minoc glassblower) and he casts
the **second lens for free**, so you end with both. He **duplicates**; the *first* lens's
acquisition / the broken-lens "made whole" step is still upstream.

**Thread:** Penumbra ("two lenses — the violet one is broken & must be made whole; a blue one too")
→ **Ephemerides** (duplicates lens 396 → 394 with a glass sword) → **Minoc** (a master glassblower
for the glass sword). The broken-lens *repair* / first-lens source remains to be found.

---

<a id="npc-34"></a>

## Thariand — npcId 34 (`converse.a`), 2,276 bytes — the Lycaeum librarian

**You see** "a busy looking man wearing a blue robe." At **(891, 427, z=0)** — the Lycaeum library,
beside Mariah. "Thariand, of the blue @star" — a student of **Nicodemus**. A flavor NPC (library
gags) with a few real pointers. bit 0 = name known.

| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` | "I am Thariand, of the blue @star." (+ `SET` bit 0) |
| `blue` `star` | "All the students of @Nicodemus bear this sign." |
| `nico` | "He lives southeast of @Yew." |
| `yew` | "Somebody there should be able to give you directions." |
| `job` | "I'm the librarian… I prefer to spend my time studying @magic, but I'll help you find some @books." |
| `stud` `magi` | arcane-lore flavor ("the greatest sorcerer of all time!") |
| `help` `find` `book` | → the **library catalog** (below) |
| `begi` `guid` `dewe` `deci` `syst` | "That book was checked out last week. Try coming back later." (the Dewey-guide gag) |
| `shri` | "We have a book that tells the history of the shrines. If only I could remember the title…" |
| `bye` | "any books you take out of here are due back before the next bipolar lunar conjunction!" → ends |
| `*` | "You could probably find more information… in Priliwig's Universal Compendium of Knowledge." |

### Library catalog (`help`/`find`/`book` → A / B / C)
A reading-recommendation routine (mostly joke titles + call numbers; nothing is actually handed over):
- **A. Fiction** — *The Caverns of Freitag* · *Around the World in a Washtub* · **The Wizard of Oz**
  (417.8 Baum c6).
- **B. Non-fiction** — *…Northern Plains Centaur* · *Of Dreams and Visions* · **The Lost Art of
  Ballooning** (`718.5 B34 z5`) **★** · *Summoning Incubi for Fun and Profit*.
- **C. Reference** — *Dilzal's Almanac of Good Advice* · **Priliwig's Universal Compendium of
  Knowledge** (a001.3 bfb) · **The Lost Book of Mantras** (998.99 ZWX).

Then "Is there anything else?" loops the menu, ending on a Dewey-Decimal gag.

**Actions:** `SET` bit 0 only. **No give/take** — he fetches nothing ("checked out").

**Help summary (modest, amid the gags):** **Nicodemus** (a mage) lives **southeast of Yew**; the
library catalogs **The Lost Book of Mantras** and **Priliwig's Compendium** (the in-fiction
"Compendium" that Mariah's & Penumbra's copy-protection lines reference), plus **The Wizard of Oz**
book tied to Lord British's quest (npc 5). He points, but hands over nothing.

**★ Balloon link (thread 6):** the Non-fiction catalog includes **The Lost Art of Ballooning**
(`718.5 B34 z5`) — this is the book **Johann (npc 117, Buccaneer's Den)** read for his ballooning song
and the librarian-lead he gives. Thariand only recites the call number (hands over nothing), so the
book would point to a physical volume in the Lycaeum. **But no such book object exists** — *The Lost Art
of Ballooning* is a **flavor/joke title** in Thariand's catalog (alongside "Summoning Incubi for Fun and
Profit", "Mating Rituals of the Northern Plains Centaur"), not a retrievable item. So Johann's "book at
the Lycaeum" is a **flavor lead**, and the **balloon plans (obj 270)** source stays open.
*(The call number is a **Dewey-Decimal parody** — class · author-Cutter · workmark — with **no in-game
meaning**; `z5` is a shelf workmark, **NOT** z-level 5. Same pattern across his catalog, e.g. Wizard of
Oz = `417.8 Baum c6`, "c6" = copy 6.)*

**Thread:** mostly flavor. Live leads: **Nicodemus, SE of Yew**; and confirmation that the mantras /
Compendium lore lives in the Lycaeum library.

---

<a id="npc-36"></a>

## Xiao — npcId 36 (`converse.a`), 4,284 bytes — Council mage: spell teacher + reagent/spellbook vendor

**You see** "a wise, scholarly woman." At **(864, 345, z=0)** — the northern tip of Verity Isle. A
member of the **Council of Wizards**; she greets you as the Avatar. bit 0 = name known. The bulk of
her script is three commerce routines (teach spell · buy reagents · buy spellbook).

### Topic menu (lore)
| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` | "I am Xiao." (+ `SET` bit 0) |
| `job` | "I serve on the Council of @Wizards… I also teach @spells and sell magical @reagents." |
| `serv` `coun` `wiza` | "keep the forces of magic in @balance… promote the eight @virtues." |
| `prom` `virt` | "We created the @shrines, many years ago." |
| `shri` | "@Thariand can tell thee more." (→ Thariand, npc 34) |
| `thar` | "He is the librarian at the @Lycaeum." |
| `secr` `wisp` | "Their secret is far more @powerful than anything I might teach thee." |
| `powe` | "Only we of the Council of Wizards know the secret… But, since thou art the Avatar, surely it is safe for thee to learn it as well." (→ **seek the wisps**) |
| `avat` · `forc`/`magi`/`bala` | flavor |
| `bye` | "Thou art always welcome here, Avatar." → ends |
| `*` | "Perhaps you should speak of that to another." |

### Services
- **`lear` / `spel` — teach a spell.** Requires a party member carrying a **spellbook (obj 57)**
  ("But thou hast not a spellbook!" otherwise). Pick a member → a **Circle (1–8)** (auto-capped to
  the member's level: "I sense that $Y is only ready for the Nth Circle") → a spell → pay its gold
  cost → "$N hands $Y a piece of rune-covered parchment" (the spell, obj 58, scribed into the book).
  **The 8th Circle is gated:** without the **wisp secret** (flag `TalkFlags[201]` bit 3) → "Thou art
  not yet ready… **Seek out and speak with the @wisps, and learn their secrets.** Then wilt thou be
  prepared to enter the Eighth Circle." Her teachable repertoire (by circle, from the script's
  tables): *Detect Magic · Dispel Magic · Light* / *Infravision · Reappear · Telekinesis · Vanish* /
  *Dispel Field · Great Light · Peer* / *Animate · Fire Field · Locate · Mass Dispel · Poison Field ·
  Sleep Field · Wind Change* / *Energy Field · Invisibility · Reveal · X-Ray* / *Clone · Negate
  Magic · Replicate* / *Fear · Gate Travel · Wizard Eye* / *Death Wind · Eclipse · Mass Charm · Mass
  Kill · Slime · Summon · Time Stop · Tremor* (8th).
- **`buy` / `reag` — reagent shop.** Sells **seven** reagents per portion (quantity up to 500,
  carry-weight + gold gated): **Black Pearl · Garlic · Ginseng · Mandrake Root · Nightshade ·
  Spider Silk · Sulfurous Ash** (note: **no Blood Moss**). `TAKEOBJ` gold ↔ `GIVEOBJ` reagent.
- **`book` — spellbook.** 60 gold → `GIVEOBJ` a spellbook (obj 57). "Here you are."

**Actions:** `SET` bit 0; `TAKEOBJ`/`GIVEOBJ` gold (88) ↔ reagents / spellbook (57) / spell-parchment
(58); the spell-teach + shop loops (per-member, weight/affordability checks).

**Help summary (yes — the magic supplier):** a full **magic vendor** — buy a **spellbook** (60g),
**learn spells** by circle, and stock **reagents** — plus a notable **lead: the wisp secret** that
gates 8th-Circle magic ("seek the wisps"). She also reinforces lore: the **Council created the
shrines / the eight virtues**, and routes shrine history to **Thariand**.

**Thread:** Xiao = magic supply (spellbook · spells · reagents) **+ the wisp-secret → 8th-Circle
gate**, which dovetails with **Shamino's** and **Mariah's** "wisps / the Council investigated them"
hints — the **wisps** are now a converging lead across several NPCs.

---

<a id="npc-37"></a>

## Dargoth — npcId 37 (`converse.a`), 3,201 bytes — the Lycaeum healer

**You see** "a stern, severe man in white robes." At **(891, 413, z=0)** — the Lycaeum (near
Thariand). "Dargoth, master of medical lore" — a research-minded physician who resents being asked
to "@cure poison ivy and @heal paper cuts." bit 0 = name. On entry he checks whether you carry a
dead party member's **body (obj 339)**; if so he opens with the resurrection offer.

A paid **healer / curer / resurrector**:
- **`heal`** — heals each wounded member for **30 gold** (`TAKEOBJ` 30 → `HEAL`).
- **`cure`** — cures each poisoned member for **10 gold** (`TAKEOBJ` 10 → `CURE`).
- **`resu`** — if you carry a corpse (obj 339): **400 gold** → `RESURRECT` ("Doman… thixus…
  anretu!"). Can't afford it? The party pools its gold; still short → "Go see a **gravedigger**.
  I'll reckon his price'll be lower." (a cheaper-resurrection lead). Repeats per corpse carried.

Topic flavor: `name` (+`SET` bit 0), `job` ("My true calling is research"), `bye`/`yes`/`no`/`*`.

**Actions:** `SET` bit 0; `TAKEOBJ` gold (88) ↔ `HEAL`/`CURE`/`RESURRECT`. No item gifts.

**Help summary:** a paid medic (heal 30g · cure 10g · resurrect 400g). Combat-light value; lone
lead = a **gravedigger** does cheaper resurrections.

---

<a id="npc-38"></a>

## Rob — npcId 38 (`converse.a`), 2,249 bytes — Blue Bottle Tavern keeper

**You see** "a short, congenial fellow." At **(898, 506, z=0)** — Moonglow's **Blue Bottle Tavern**
(Aganar's recommendation). "Rob Frasier," who brews **Frasier's Folly** (the ale Iolo name-drops).
bit 0 = name. A food/drink **vendor**:

| Keyword prefix(es) — exact | Sells / says |
|---|---|
| `name` | "I'm Rob Frasier." (+ `SET` bit 0) |
| `fras` `foll` | "I brew Frasier's Folly myself… a very popular @ale." |
| `buy` · `job` | @mead · @wine · @bread · baked @brie · @ale (Frasier's Folly) |
| `mead` / `ale`/`brew` / `wine` | drinks (5 / 7 / 6 crowns) |
| `brie` | 6 crowns ("served warm with sliced almonds") |
| `brea` `rati` | bread, 3 gold/loaf (bulk) |
| `bye` · `*` | farewells |

**Actions:** `SET` bit 0; `TAKEOBJ` gold ↔ `GIVEOBJ` drink/food. **No quest content** — a flavor
vendor (the tavern Aganar & Iolo reference).

---

<a id="npc-40"></a>

## Manrel — npcId 40 (`converse.a`), 1,773 bytes — Beyvin's cousin → **the crypt key (Rune of Honesty)**

**You see** "a pipe-smoking gentleman with the symbol of the Codex @tattooed on his forehead." At
**(933, 537, z=0)** — Moonglow. A **woodworker** who dabbles in alchemy — and, crucially,
**Beyvin's cousin**. bit 0 = name; **bit 7 = crypt key given**.

Topic flavor: `job` (woodworker + @alchemy), `wood`, `alch`/`dabb` ("trying to learn healing
potions… stumbled across a recipe for red @mead"), `red`/`mead` → the Blue @Bottle / Frasier's
@Folly, `tatt`/`code`/`symb` (he woke up with the **Codex** tattoo after a drunken night), `bye`,
`*`.

### The crypt key (`beyv` / `lock` / `key` / `door` / `cryp`)
- First time → "Oh, have you been to visit my **cousin's grave**?" → "You wouldn't be wanting **the
  key to his crypt**, would you?" → on `y` (and enough carry room): "Okay, you can have the key. But
  you have to take these **@flowers** and leave them there." → **`GIVEOBJ` daffodils (obj 139)** +
  **`TRANSFEROBJ` the crypt key (obj 64, quality 12) from Manrel to you** + `SET` bit 7.
- After (bit 7) → "I hope you got a chance to deliver the @flowers." (`flow`/`daff`: "Daffodils were
  always his favorites.")

**Actions:** `SET` bits 0/7; `GIVEOBJ` flowers (139); `TRANSFEROBJ` the crypt key (obj 64, qual 12)
to the party.

**Help summary (yes — the Honesty-rune unlock):** Manrel hands over **the key to Beyvin's crypt**
(obj 64 qual 12) + daffodils to leave there. Combined with **Penumbra** ("the Rune of Honesty is
buried with Beyvin under Moonglow") and **Aganar** (he entrusted the rune to Beyvin), this completes
the Honesty path: **get the crypt key from Manrel → enter Beyvin's crypt under Moonglow → recover
the Rune of Honesty** (and pair it with the mantra "ahm" from Penumbra).

---

<a id="npc-42"></a>

## Derydlus — npcId 42 (`converse.a`), 1,066 bytes — Blue Bottle tavern patron (flavor)

**You see** "a man who looks very amused — whether with his surroundings or himself is hard to say."
At **(936, 528, z=0)** — Moonglow's Blue Bottle Tavern. A cheerful drunk. bit 0 = met. On the first
meeting he asks "Have you had your fortune told yet?" and **vouches for Penumbra**: "Some people
think Penumbra's a hoax. But she knows her stuff… she can truly be of great assistance to you." (a
nudge to actually use Penumbra).

Topic flavor: `name` (asks yours back), `job`/`drin`/`fras`/`foll` (a Frasier's Folly devotee),
`mand` ("Here's to Mandrake!"), `manr` ("My drinking buddy!" → if **Manrel** is on-screen, Manrel
toasts back), `penu` ("she has the gift"), `bye`, `*` (random toasts).

**Actions:** `SET` bit 0 only. **No items / quest** — pure flavor; the one useful note is his
**endorsement of Penumbra**.

---

<a id="npc-66"></a>

## Gwenno — npcId 66 (`converse.a`), 2,697 bytes — Iolo's wife, a Minoc bard (recruitable)

**You see** "a plainly dressed bard." At **(565, 81, z=0)** — **Minoc**. **Iolo's wife**, a bard who
transcribes Britannia's folk songs into numerical notation for the artisan's guild — and a
**recruitable 8th party member**. Sets bit 0 (name) on greeting; greets differently when she's
already in the party.

| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` | "It's me, Gwenno. You have been away from our realm a long time…" |
| `job` | her old job at **Iolo's Bows** passed to the apprentice; now transcribes @songs into numerical @notation for the artisan's @guild; offers to @join |
| `arti` `guil` | "**@Selganor** can tell you more about the guild than I could." |
| `selg` | "He's the **guildmaster**." (npc 64) |
| `folk` `song` · `heri`/`pape`/`trad`/… | tradition flavor |
| `iolo` | "the sweetest husband I could ever ask for" (+ if **Iolo** is on-screen, he kisses her) |
| `appr` `bow` | Iolo's Bows shop is in **Britain, over by the Blue @Boar** |
| `nume`/`nota`/`note`/`numb`/`repr` | numerical-notation banter |
| `play` `tune` | "Oh, **Selganor** sent you, did he? I bet you want to learn '**@Stones**.'" |
| `lear` `ston` | **"In the standard numerical notation, it reads '678987 8767653'."** (the song "Stones") |
| `join` `help` `ques` | the **recruit** routine (below) |
| `leav` | the **dismiss** routine |
| `bye` · `*` | farewells |

**Recruit (`join`):** an optional 8th companion. Refused if you're in a **vehicle** ("Not while
you're in that thing!") or the party is **full** ("ask one of them to @leave first"). On join: "It
will be nice to spend some time on the road again" (+ she dances with **Iolo** if he's present).
**Dismiss (`leav`):** "I'll head back home to Minoc… I'll leave all my things here — some of them
might come in handy for you."

**Actions:** `SET` bit 0; `JOIN` / `LEAVEPARTY` (recruit/dismiss). No items/gold.

**Help summary:** an optional **bard companion**; teaches the song **"Stones" = 678987 8767653** (a
numerical-notation tune to play on an instrument); points to **Selganor**, the artisan's
**guildmaster** (npc 64). **No glassblower lead** — for the glass sword, Selganor / the guild or
another Minoc NPC is the next check.

**Thread:** Iolo ↔ **Gwenno** (his wife; recruitable). The "Stones" tune + **Selganor**
(guildmaster) are Minoc threads; the glass-sword **glassblower is still unidentified** in the Minoc
block.

---

<a id="npc-64"></a>

## Selganor — npcId 64 (`converse.a`), 3,838 bytes — Minoc artisan guildmaster → **the Rune of Sacrifice**

**You see** "a slender, graceful man tuning a lute." At **(619, 85, z=0)** — **Minoc**. The
**guildmaster of artisans** ("Selganor" = "seeker of the crystal"). Flags: bit 0 name · **bit 5 =
passed his reagent quiz** · **bit 6 = guild member** · bit 7 = join-quest started.

### Copy-protection — the reagent quiz (until bit 5)
"My nephew is studying alchemy, and he needs to know this." RND **1-of-4** reagent questions:

| Question | Accepted prefix(es) — exact |
|---|---|
| What kind of fork should mandrake roots be prepared with? | `silv` (silver) |
| What part of the nightshade mushroom is used in spellcasting? | `fung` `cap` `spor` |
| Where does sulfurous ash come from? | `volc` `erup` |
| What are black pearls used for? | `kine` `prop` (kinetic) |

Wrong → "No, that doesn't sound right. If only I had a Compendium to look it up in…" (re-ask).
Correct → `SET` bit 5 → topic menu. `bye` → he turns away absent-mindedly (ends).

### Topic menu
`name` (+`SET` bit 0), `selg`/`hist` ("seeker of the @crystal"), `seek`/`crys`/`tale`, `job`
("@guildmaster of artisans"), `juli` (**Julia** made his lute; "lives just across the road, next
door to Lady @Isabella"), `isab` ("She's the **mayor**"), `gwen` (Gwenno cuts in if on-screen),
`lute`/`inst`, **`ball`** ("the man who invented the **balloon**… flew to **@Sutek's** castle… a big
job he had to do there"), **`sute`/`cast`/`flew`** ("Sutek lives on an @island, far to the south"),
**`isla`** ("It's **east of Serpent's Hold**"), `bye`, `*`.

### Join the guild → the Rune of Sacrifice (the key branch)
- `rune` → "only members of the @guild are allowed to handle it" (once a member: "I already loaned
  you the rune").
- `loan`/`memb`/`guil`/`arti`/`join` → "you need to do **two things**: **make a set of @panpipes**
  (**@Julia** can teach you) **and commit '@Stones' to memory** (ask **@Gwenno** to play it)." (`SET`
  bit 7.)
- `pan`/`pipe`/`ston` → induction: "Have you made a set of panpipes?" → must **hold panpipes (obj
  153)** ("But I don't see any!" otherwise) → "tell me the sequence of notes in 'Stones'… Numeric
  notation will be fine." → answer **`678987` / `8767653`** → "**You are now a full member of the
  guild of artisans**… He takes out the **Rune of Sacrifice** and hands it to you… I know you'll find
  some solution to this gargoyle problem." → **`TRANSFEROBJ` the Rune of Sacrifice (obj 246 =
  `OBJ_0F6`) to you** + `SET` bit 6.

**Actions:** `SET` bits 0/5/6, `CLR` bit 7; **`TRANSFEROBJ` the Rune of Sacrifice (obj 246)** on
induction. No gold.

**Help summary (yes — the 2nd virtue rune):** Selganor hands over the **Rune of Sacrifice** as the
reward for **joining the artisan's guild**. Requirements: (1) pass his reagent quiz, (2) **make
panpipes** (Julia teaches, npc 67), (3) **recite "Stones"** `678987 8767653` (Gwenno teaches, npc
66). Bonus leads: **Sutek** (an island far south, **east of Serpent's Hold** — where the balloon
inventor flew for "a big job") + **Isabella** (Minoc's mayor). **Still no glassblower.**

**Thread:** the **Sacrifice** branch of the 8-virtue rune+mantra puzzle — rune via the Minoc guild
(panpipes + Stones → Selganor). Its **mantra** ("Cah" per `research_main_quest.md §4`) is not yet
sourced. The glass-sword **glassblower remains unidentified**.

---

<a id="npc-67"></a>

## Julia — npcId 67 (`converse.a`), 3,482 bytes — Minoc instrument-maker → **makes the panpipes**

**You see** "a sturdy woman with calloused hands and a loud manner." At **(635, 77, z=0)** — Minoc.
A blunt, Scots-accented **instrument-maker** ("the finest in the land," respected by the Guild) who
**makes the panpipes** for the Sacrifice-rune guild quest. Also a **recruitable** companion. bit 0 =
met; **bit 1 = "was abandoned"** (she refuses to rejoin if set: "be dumped off in the middle of
nowhere again? Not likely!").

| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` · `job` | makes the finest instruments; respected by the @Guild; would give it up for @adventure |
| `guil` | "go talk to **@Selganor**" (to join the guild) |
| `selg` | "He's the guildmaster." |
| `pan` `pipe` | the recipe: "the panpipes are a tricky instrument… you'll need to bring a **yew @board**… freshly @cut!" |
| `yew` `boar` · `fres` `cut` | → the full recipe (below) |
| `life` `adve` · `join` | **recruitable** (a tinker; refuses if she was abandoned before — bit 1) |
| `leav` · `bye` · `*` | farewells / deflect |

### Make the panpipes (the key — yew board → pipes)
- The recipe (`yew`/`fres`/no-board): "**Go to Yew** where they grow the best wood in Britannia. Buy
  a **freshly-cut yew log** and take it to a **sawmill**. Have 'em cut it into a **board**, and bring
  it back here. Then I'll show ye how panpipes are made!"
- Bring her a **yew board (obj 277)** → "A fine set of pipes this will make!" → she carves / hollows
  / pegs / notches it → **`TAKEOBJ` the yew board (277)** + **`GIVEOBJ` panpipes (obj 153)**.

**Actions:** `SET` bits 0/1; `JOIN`/`LEAVEPARTY` (recruitable tinker); **`TAKEOBJ` yew board (277) →
`GIVEOBJ` panpipes (153)**. No gold.

**Help summary (yes — the panpipes step of the Sacrifice rune):** Julia turns a **yew board (obj
277)** into **panpipes (obj 153)**. Sourcing the board: go to **Yew**, buy a **freshly-cut yew
log**, have a **sawmill** cut it into a board. (Yew is also where **Nicodemus** lives nearby —
Thariand's lead.) **No glassblower lead.**

**Thread:** completes the **panpipes** leg of the Sacrifice-rune chain: **Yew (log) → sawmill
(board) → Julia (panpipes)** → Gwenno ("Stones") → Selganor (**Rune of Sacrifice**).

---

<a id="npc-63"></a>

## Isabella — npcId 63 (`converse.a`), 2,244 bytes — Lady mayor of Minoc (the Sacrifice mantra lead)

**You see** "a woman of elegant demeanor, wearing a finely embroidered dress." At **(646, 87, z=0)**
— Minoc (just east; the earlier roster box clipped her at x=646). **Lady Isabella, mayor of Minoc —
"the city of @sacrifice."** bit 0 = met. A lore/lead NPC who supplies the **Sacrifice mantra**
pointer.

| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` · `well`/`know`/`thro`/`land` | recognized you from the portrait **@Woodroffe** painted |
| `wood`/`pain`/`port` · `die`/`flu` | Woodroffe — a fine artisan; "died of the @flu two years ago" |
| `job` | "mayor of Minoc, the city of @sacrifice… renowned for our fine @craftsmen" |
| `city`/`mino`/`reno`/`craf` | "The artisan's guild is located here." |
| `sacr` | **"We were entrusted with the @Rune of Sacrifice."** |
| `rune` | **"I gave it to @Selganor, the @artisan's guildmaster."** |
| `arti` `guil` | "When the Rune of Sacrifice was sent to our city, I entrusted it to their care." |
| `selg` · `musi` · `busy`/`less` | Selganor (a fine @musician in the @guild hall, across the road) |
| **`mant`** | **"The good healer @Tara should be able to tell you the mantra. Go ask at her house, on the north side of town."** |
| `heal` `tara` | "Tara is a very compassionate woman." |
| `garg` | "rumors of such creatures, but I know no one who has actually seen one." |
| **`ball`/`fly`/`airs`/`ligh`** | the **balloon**: "The balloonist flew off on an important @mission, and never returned. **Selganor** should be able to tell you more." (+ asks if you once rode a balloon) |
| `impo` `miss` | "Yes, ask Selganor." |
| `bye` · `*` | farewells / deflect |

**Actions:** `SET` bit 0 only. **No items/gold** — a lore/lead NPC.

**Help summary (the Sacrifice virtue's missing piece):** Isabella, mayor of **Minoc = "the city of
Sacrifice,"** supplies the two Sacrifice leads:
1. **Rune of Sacrifice** → confirms she entrusted it to **Selganor** (the guild quest).
2. **The Sacrifice MANTRA** → "the good healer **Tara** should be able to tell you the mantra," at
   her house on the **north side of town** (**Tara = npc 65**). ← *the mantra source we were missing.*
Plus the **balloon** lead (the balloonist flew off and never returned → ask Selganor → Sutek's
island). **No glassblower.**

**Thread:** Minoc = the **Sacrifice** virtue town. Both halves now sourced — **rune** → Selganor
(guild), **mantra "Cah"** → **Tara** (healer, npc 65). The **balloon/Sutek** sub-thread also advances.

---

<a id="npc-65"></a>

## Tara — npcId 65 (`converse.a`), 3,116 bytes — Minoc healer + the Sacrifice mantra **"Cah"**

**You see** "a kindly old woman." At **(603, 66, z=0)** — Minoc, north side. "The healer for this
town… I've cared for the @unfit here for threescore years." bit 0 = met.

| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` · `job` · `unfi` | "the healer for this town"; the @unfit = those needing @healing / @curing / @resurrected |
| **`mant` `sacr`** | **"'Cah,' that is the word of sacrifice."** |
| `heal` · `cure` · `resu` | her healer services (below) |
| `bye`/`no` · `yes` · `*` | farewells / deflect |

**Healer services** (like Dargoth, but with a karma-based mercy clause):
- **`heal`** — "Wilt thou make an offering of **30 gold**?" → `HEAL`. If you can't pay but **karma ≥
  40** → "Thou art poor, but thy cause is just. I will heal thee without payment."
- **`cure`** — "**10 gold**" → `CURE` (same karma-free path).
- **`resu`** — if you carry a corpse (obj 339): "**400 gold**" → `RESURRECT` ("Doman… thixus…
  anretu!"); party-collection if short.

(Quirk: the free-heal line reads "**Sasha** approaches $Y and binds the wounds" — a leftover from
another healer's script; should say Tara. A shipped-data typo.)

**Actions:** `SET` bit 0; `TAKEOBJ` gold (88) ↔ `HEAL`/`CURE`/`RESURRECT` (with a `karma ≥ 40` free
path). No item gifts.

**Help summary (the Sacrifice mantra — confirmed):** Tara is Minoc's **healer** (heal 30 / cure 10 /
resurrect 400, free if poor-but-virtuous) **and** the source of the **Sacrifice mantra "Cah"**
(`mant`/`sacr`) — confirming Isabella's lead and matching `research_main_quest.md §4`. **No
glassblower.**

**Thread:** with Tara, the **Sacrifice** virtue is now **fully sourced + confirmed** — rune
(Selganor's guild quest) + mantra **"Cah"** (Tara). **2 of 8 virtues complete** (Honesty + Sacrifice).

---

<a id="npc-68"></a>

## Michelle — npcId 68 (`converse.a`), 3,980 bytes — Minoc basket-weaver → the balloon basket

**You see** "an industrious young woman." At **(578, 89, z=0)** — Minoc. A **basket & beehive
weaver** ("just like my @father"). Her shop is schedule-gated ("Come to my shop when I'm open!").
bit 0 = met.

| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` · `job` | weaves @baskets + beehives, like her @father |
| `bask` `beeh` · `buy` | her **shop** (baskets / beehives — standard merchant, when open) |
| `sell` | "I have all I need." |
| **`fath` `ball`** | "Father once told me a story of weaving a **basket large enough for eight people!** He never showed me the @plans, though." |
| **`plan`** | if you hold the **balloon plans (obj 270)** → "Then it was true!… She studies the plans" → weaves the **huge balloon basket** (below) |
| `bye` · `*` | farewell / deflect |

### The balloon basket (the key — needs the plans + a silk bag)
- Requires the **balloon plans (obj 270)** in inventory (her father's design; she doesn't have them).
- "Such a basket would cost **300 gold**, in advance." (+ a weight check — "would weigh six stones…
  Lighten thy load").
- While weaving she asks: **"Hast thou found a silk weaver yet?… this will require a huge silk bag.
  I know not where thou might find a silk weaver to craft it!"** (the silk-bag lead).
- "Finished!" → **`GIVEOBJ` the basket (obj 422)** — the balloon's gondola.

**Actions:** `SET` bit 0; shop `TAKEOBJ` gold ↔ `GIVEOBJ` basket/beehive; the balloon-basket build
(`TAKEOBJ` 300 gold → `GIVEOBJ` basket 422).

**Help summary (the balloon basket):** Michelle weaves the **balloon's basket (obj 422)** — but only
if you bring her the **balloon plans (obj 270)** (source unknown) + 300 gold; and she flags you'll
also need a **silk bag** from a **silk weaver** (unknown). The balloon flies to **Sutek's island**
(Isabella/Selganor). **No glassblower.**

**Thread:** the **balloon** (traversal) sub-quest — **plans (obj 270, ?) → Michelle → basket (422)**
\+ a **silk bag** (silk weaver, ?) → the balloon → Sutek's island.

---

<a id="npc-70"></a>

## Dale — npcId 70 (`converse.a`), 2,176 bytes — Minoc **Glassblower → the glass sword**

**You see** "a short, barrel-chested man." At **(616, 85, z=0)** — Minoc. **"Dale the Glassblower"**
— the master glassblower **Ephemerides** sent you to find. bit 0 = met.

| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` | "I am Dale the @Glassblower." (+ `SET` bit 0) |
| `job` | "I make @glassware, the finest in the land!" |
| `glas` · `buy` | his **glassware shop** (Glass / Jar / Mirror — schedule-gated, "come when it's open") |
| **`swor`** | "Aye, I know how to make **glass swords**. But there is little @demand for them." |
| **`dema`** | "I require **five gems** for the crafting. This is too expensive for most… things of @beauty they are." |
| `beau` | "I'll make thee one, if thou hast the @gems." |
| **`gems`** | → the **glass-sword crafting** (below) |
| **`crys` `lens` `tele`** | "Hmmm… You'd have to see a **lensmaker** about that. I hear there's one **near the Lycaeum**." |
| `bye` · `*` | farewell / deflect |

### The glass sword (the key — 5 gems → glass sword)
- `gems` (shop open) → checks you hold **≥ 5 gems (obj 77)** → "Dost thou wish me to craft thee a
  glass sword? It will cost thee **5 gems**!" → `y` → **`TAKEOBJ` 5 gems (obj 77)** → "$N turns to
  the furnace and begins crafting… Soon it is finished" → **`GIVEOBJ` the glass sword (obj 48)**.
  (Weight check; refuses if you can't carry it / lack 5 gems.)

**Actions:** `SET` bit 0; **`TAKEOBJ` 5 gems (77) → `GIVEOBJ` glass sword (48)**; glassware shop
(gold ↔ Glass / Jar / Mirror).

**Help summary (★ the glassblower — found):** Dale makes the **glass sword (obj 48)** from **5 gems
(obj 77)** — the glass sword **Ephemerides** needs to duplicate your lens. Bonus lens lead: for
crystal/lens work he points to **"a lensmaker near the Lycaeum"** (a possible source for the
first/broken lens). This was the long-hunted Minoc glassblower.

**Thread:** closes the glassblower hunt for the **lens** thread — **5 gems → Dale → glass sword (48)**
→ Ephemerides → 2nd lens. New lead: a **lensmaker near the Lycaeum** (toward the first lens / the
broken-lens "made whole" gap).

---

<a id="npc-69"></a>

## Aaron — npcId 69 (`converse.a`), 1,037 bytes — Minoc sawmill (yew log → board)

**You see** "a plump blond man with curly blond hair and a cheerful face." At **(678, 99, z=0)** —
Minoc (east; off the earlier roster box). **Runs the sawmill.** bit 0 = met.

| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` | "My name's Aaron." (+ `SET` bit 0) |
| `job` · `saw` | "I run the sawmill!… I saw logs into @boards." |
| **`boar` `log`** | with a **yew log (obj 274)** + **5 gold** → "turns the log into a flat, sanded board" → **`GIVEOBJ` the board (obj 277)** |
| `bye` · `*` | farewell / deflect |

**Actions:** `SET` bit 0; **`TAKEOBJ` yew log (274) + 5 gold → `GIVEOBJ` board (277)**.

**Help summary (the sawmill step of the Sacrifice/panpipes chain):** Aaron cuts a **yew log (obj
274) → yew board (obj 277)** for 5 gold — the board **Julia** needs for the panpipes. So the chain
is now fully concrete: **Yew (yew log 274) → Aaron's sawmill (board 277) → Julia (panpipes 153)**.

**Thread:** resolves the "sawmill" in the Sacrifice-rune chain (Julia's lead): yew log → **Aaron** →
board → Julia.

---

<a id="npc-71"></a>

## James — npcId 71 (`converse.a`), 2,548 bytes — Minoc weapon/armor shop apprentice

**You see** "a young lad." At **(603, 107, z=0)** — Minoc. **James, the apprentice** minding a
weapon & armor shop: "Me master went off to fight the gargoyles. 'E ain't been 'eard from since." (a
flavor note on the gargoyle war's toll). bit 0 = met.

Topic menu: `name`, `job`/`appr` (just the apprentice; the absent master), `buy`/`arms`/`armo`/`sell`
(the shop). A standard **buy/sell merchant** (schedule-gated):
- **Weapons:** Dagger · Mace · Main Gauche · Morning Star · Sword.
- **Armor:** Chain Coif · Chain Mail · Ring Mail · Scale Mail · Winged Helm.

**Actions:** `SET` bit 0; buy/sell (gold ↔ weapons/armor). **No quest content** — a vendor (no
glassblower, no lead); the missing master is gargoyle-war flavor.

---

<a id="npc-72"></a>

## Trebor — npcId 72 (`converse.a`), 1,832 bytes — Minoc shipwright (ships & skiffs)

**You see** "a tall, muscled man with a wide grin." At **(594, 116, z=0)** — Minoc. **Sells ships
and skiffs** (as deeds). bit 0 = met.

Topic menu: `name` ("Trebor"), `buy`/`job` ("I sell @ships and @skiffs"), `bye`, `*`.
- **`ship` / `skif`** → buy a vessel: "It'll cost you #N gold for the deed." → pay → **`TRANSFEROBJ`
  the deed (obj 149)** to you (party-collection if short). His stock depletes (`OWNS` check — "Sorry,
  I sold you my last ship").

**Actions:** `SET` bit 0; `TAKEOBJ` gold → `TRANSFEROBJ` a ship/skiff **deed (obj 149)**.

**Help summary (a travel option):** Trebor is the **shipwright** — buy a **ship or skiff** here for
**sea travel** (an alternative to moongates for reaching islands: the Lycaeum, Serpent's Hold /
Sutek's island, the z5 broken-lens site, etc.). No virtue/quest item; a traversal vendor.

---

<a id="npc-73"></a>

## Troy — npcId 73 (`converse.a`), 1,229 bytes — Minoc clockmaker (flavor)

**You see** "a spidery looking man with delicate hands." At **(599, 94, z=0)** — Minoc. A
**clockmaker** with a philosophical bent ("the @ticking of clocks is the pulse of @civilization").
bit 0 = name. Topic flavor: clocks / ticks / @tocks; @chess ("keeps one's @mind fit"); and
`moon`/`star` → "**@Ephemerides** is going to build a model of the whole system — I helped him design
the @gearwork" (he helped with Ephemerides's orrery; `ephe` → "He lives at the @Lycaeum").

**Actions:** `SET` bit 0 only. **No items/quest** — pure flavor; the one cross-ref is the
Ephemerides-orrery gearwork.

---

<a id="npc-74"></a>

## Doris — npcId 74 (`converse.a`), 1,839 bytes — Minoc innkeeper (Tinker's Inn)

**You see** "a stunningly beautiful young woman." At **(573, 86, z=0)** — Minoc. The (rude,
sarcastic) **innkeeper of the Tinker's Inn** while her father is away fighting gargoyles; she studies
magic under **Xiao**. bit 0 = met.

Topic flavor: `name` ("just call me '@Hey @you'"), `job` (the **Tinker's Inn**), `fath` ("my father
called me back from the @Lycaeum so he could go fight the gargoyles"), `book`/`read` ("learning the
mystic arts from the great @Xiao"), `xiao` ("the wisest mage in all Britannia… only she can teach
the spells of the greatest @power").
- **`rest` / `inn` / `room`** → the inn: **5 gold per person per night** → pay → **`REST`** (sleep +
  time pass).

**Actions:** `SET` bit 0; `TAKEOBJ` gold → `REST`. **No items/quest** — an inn + flavor; the one
cross-ref is Xiao's "spells of the greatest power" (the 8th-Circle / wisp thread).

---

<a id="npc-62"></a>

## Jaana — npcId 62 (`converse.a`), 2,405 bytes — druidess (Yew), recruitable companion

**You see** "the druidess Jaana." At **(234, 153, z=0)** — Yew. A returning Ultima **companion** (a
druid) who now "lives in Yew, blessing crops and tending to sick animals." Recruitable.

**Self-reference decode (resolves the apparent "NPC 235"):** every party/flag op in her script is
encoded as `BYTE 0xEB`, which the disassembler shows as `BYTE(235)`. `0xEB` is `OP_NPC`, the
**self-marker**; `parse_factor` runs it through `mk_npcnum`/`_npc` (seg_1703.c:147) → the talk
target's own id = **62, herself**. So it is NOT a separate NPC 235 — it is "self."

**Greeting — a 3-state machine on her own `TalkFlags[self]`** (`TST`/`SET` self; operand = a **bit
index**, per the host's `(flags>>bit)&1` / `flags|=(1<<bit)`):
- **Already in party** → "I fear I know little that would help in this situation, $G." (deflects).
- **bit 2 set** (has joined before) → "Hast thou need of my services again?" + y/n (both nudge
  "@join").
- **bit 0 set** (met, not yet joined) → "Hast thou fared well in thy travels?" + y/n ("Ask me to
  @join thy band").
- **First meeting** (neither bit) → **`SET` bit 0**, then the reunion: "$P! 'Tis a great joy and
  relief to see thou hast returned to Britannia, $G!" (greets the other companions if you have any),
  "Mayhap I can help thee in thy struggle against the @gargoyles… Thou needst but ask and I will
  gladly @join."

**Topic menu (`ASKTOP`):**
| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` | "Why, my name's Jaana, $G." |
| `job` | lives in **Yew**, "blessing crops and tending to sick animals"; misses the quests → offers to **@join** |
| `join` | already-in-party guard ("Am I not already a member of thy band?") → else `JOIN` self: **0** → "Gladly, $G!" + **`SET` bit 2** + ends; **2** → "thou seemst to have enough companions"; **else** (at sea) → "Let us discuss such matters ashore… Jaana seems definitely seasick!" |
| `leav` | `LEAVEPARTY` self: **0** → "Whatever thou thinkest best, $G… Thou mayst keep my supplies."; **2** → "I cannot leave thy party since I am not in it!"; **else** (at sea) → seasick |
| `garg` | "I know little of the gargoyles, $G… fierce fighters, and a great threat to the land!" (no lead) |
| `ench` / `nico` | **"I've heard that Nicodemus the enchanter lives between two rivers."** → lead to **Nicodemus** (npc 58, ~(334,203), SE of Yew) |
| `bye` | farewell (a different line if she is in your party) |
| `*` (catch-all) | random "Alas, I know nothing of $Z, $G." / "Beg pardon?" |

**Actions:** `SET`/`TST` self bits 0 & 2 (acquaintance state); `JOIN` / `LEAVEPARTY` self. **No
items, no quest gate.** Her only lead is **Nicodemus** (reinforces Thariand's pointer). The classic
Jaana **seasickness** flavor guards join/leave at sea.

**Clone note:** `JOIN`/`LEAVEPARTY` are **deferred stubs** (`conversation_system.js:180-181` returns
the success code but does **not** mutate party membership), so she says "Gladly!" yet isn't actually
added to the party in the current build. Dialogue is faithful; the recruitment wiring is a later step.

---

<a id="npc-133"></a>

## Zoltan — npcId 133 (`converse.b`), 5,174 bytes — king of the gypsies (★ the silver-tablet lead)

**You see** "a lively soul of a gypsy, with a bit of a wild look to him." At **(257, 168, z=0)** —
the wandering gypsy camp near **Yew** (his band names **Karina** + **Taynith**). Self-ref `BYTE(235)`
= 0xEB = self = 133. **★ These are the "gypsies" Mariah pointed to for the missing silver-tablet
half** (thread 2). His `npcId` byte after `OP_ID` is `0x85` (=133, shown as `DIF` in the raw disasm).

**Entry gates:**
- `TST` **npc 135 bit 7** (a *literal* 135 = **Kador, his dog**) → "Anyone who would mistreat a dog
  has no business with Zoltan." + `LEAVE`. (Kador's bit 7 is set when you command his tricks but
  don't pay his begging bowl — see npc 135; pay the bowl to clear it.)
- `TST` **self bit 1** (you stiffed him on a dance before) → hostile: "Hah! You again! You are no
  friend to Zoltan… Perhaps a few coins might ease the sting of your insult." → pay (clears it) or
  "Leave me before I place a gypsy curse on you!" `LEAVE`.
- else → "Huzzah! I am @Zoltan, king of the gypsies!" `SET` self bit 0 (met).

**Topic menu (`ASKTOP`) — quest-bearing keywords:**
| Keyword prefix(es) — exact | Response / action |
|---|---|
| `advi` (advice) | **2 gold** → "Powder kegs are useful for persuading uncooperative doors to open." |
| `silv,tabl` (silver tablet) | **10 gold** → the tablet story (below) |
| `capt,john` | **Captain John** gave them the tablet for Mariah; "madder than a gremlin… been living with the gargoyles… talks as if there's nothing evil about them… the tablet had something to do with translating." |
| `hawk` (Hawkins) | "He's the lowest scum I ever met." |
| `bucc,den` | **Buccaneer's Den** is "on an island due east of @Paws"; "no place for an honest soul." |
| `paws` | "We pass Paws often… @Taynith likes to go drinking there." |
| `danc` | **Karina** fiddles, Zoltan dances → asks for money: pay → `SET` self bit 7; give 0 / refuse → `SET` self bit 1 (the insult flag → hostile next visit). |
| `fine,magi,sale,sell,buy,good,item,inte,reag` | **reagent shop** (below) |

Flavor keywords (no lead): `name`/`job`/`zolt`/`king`/`road`/`wind`/`roam`/`free,spir`/`land,cast`
(gypsy-life patter), `gyps` ("Ask my people for @advice, or what they @sell"), `kari,tayn`, `mari`
("Mariah… is generous to poor wandering gypsies"), `lyca`/`moon` ("on the same island"), `gorg`/
`artu`/`duck` (jokes).

**The silver-tablet story (the 10-gold `silv,tabl` info — ★ thread 2):** "Some gorgio called
**Captain John** brought us the silver tablet and paid us to take it to the **Lycaeum**… we were
ambushed by **Captain Hawkins** and his crew. The tablet was broken in two… the pirates got away with
the **bigger half**… Most likely they went to **Buccaneer's Den** with their loot. We took the corner
they missed to the Lycaeum and **sold it to @Mariah**." → so **Mariah's study half = the small corner
the gypsies sold her**; the **bigger half is at Buccaneer's Den, held by the pirate Captain Hawkins**
(island due **east of Paws**).

**Reagent vendor** (`B4` indexed table; obj 88 = gold): **Blood Moss** 3g, **Garlic** 2g, **Ginseng**
1g, **Nightshade** 1g, **Spider Silk** 2g, **Sulfurous Ash** 3g — a `GETDIGIT`-pick / `GETINT`-quantity
buy loop with carry-weight + affordability gates.

**Actions:** `SET`/`CLR`/`TST` self bits 0/1/7; `TAKEOBJ`/`GIVEOBJ` gold (88) + reagents; vendor loop.
**Quest payload:** closes the **"untraced gypsies"** gap (thread 2) — and reveals the missing tablet
half is NOT with the gypsies but with the pirate **Captain Hawkins at Buccaneer's Den** (E of Paws);
**Captain John** (tablet origin; gargoyle-friendly, "tablet is for translating") is a new
gargoyle-side lead (cf. Sin'Vraal, thread 4).

---

<a id="npc-135"></a>

## Kador — npcId 135 (`converse.b`), 1,431 bytes — the gypsies' dog (flavor / easter egg)

**You see** "an amiable, shaggy mutt." At **(257, 166, z=0)** — beside **Zoltan** (the gypsy camp near
Yew); **Kador is the dog Zoltan's entry-gate protects** (Zoltan's `TST npc 135 bit 7`). Self-ref
`BYTE(235)` = self = 135. **No quest content** — the quest keywords `capt`/`john`/`silv`/`tabl`/`sell`
(plus `name`/`job`) are explicitly caught and answered "The dog looks at you with a puzzled
expression." He is a dog.

**Opening:** a random bark from a 4-line table ("Arf!" / "Bow wow." / licks your face / "Woof,
woof!"), `SET` self bit 0 (met). If **self bit 7** is already set → he brings his **bowl** to beg
(the money flow below).

**Commands (`ASKTOP`):** `sit` / `fetc` (fetch) / `shak` (shake) / `heel` (bites your heel) / `beg` /
`play,dead` / `roll,over` → the dog performs, each `SET`s self **bit 7**. `tric` → "looks at you
expectantly." `artu,wand,andr` → "Grrrrrrr…" (growls — note `artu` = the "Arturos" Zoltan also won't
name). `spea` / `advi` → **once** (gated on bit 6) the famous talking-dog monologue: *"…the whole
debate over 'free will' versus 'determinism' arises from an artificial semantic division. In light of
the work of Gödel and Heisenberg, … indistinguishable and thus, for all practical purposes,
identical."* then `SET` bit 6 (+ bit 7). `bye` → "Ruff." (or the bowl, if bit 7).

**The begging bowl (the bit-7 mechanic — ★ the Zoltan link):** commanding any trick `SET`s self bit
7. While bit 7 is set, the dog presents a coin-filled bowl — *"Do you give him any money?"*: **refuse
→ `SUBKARMA 5`** (+ whimpers); **pay** (`GETINT` → `TAKEOBJ`/`GIVEOBJ` gold 88) → "The dog seems
pleased." + `CLR` bit 7. So a still-set bit 7 = "you made the gypsies' dog perform and didn't pay" →
**Zoltan then snubs you**. Pay Kador's bowl to clear it.

**Actions:** `SET`/`CLR`/`TST` self bits 0/6/7; `SUBKARMA 5` (refusing the bowl); `TAKEOBJ`/`GIVEOBJ`
gold (88). **No items, no quest** — pure flavor + an easter egg; its only mechanical tie is gating
**Zoltan** (npc 133).

---

<a id="npc-59"></a>

## Lenora — npcId 59 (`converse.a`), 2,701 bytes — Lady Mayor of Yew (★ the Justice virtue)

**You see** "a tall, stern woman, with graying red hair and a perpetual scowl." At **(220, 167, z=0)**
— the **Hall of Justice**, Yew. **Lady Mayor of Yew**, presiding over the town + its **courts**.
Self-ref `BYTE(235)` = self = 59. **★ The Justice-virtue town leader** (rune + mantra, thread 3).

**Greeting / flags:** bit 0 = met; **bit 1 = "you left in a huff"** (set when you `bye` out of her
mantra quiz or refuse the letter) → next visit she's frosty: "I graciously grant thee another
interview… I certainly hope thou wilt be more respectful this time." Otherwise: "Welcome… to the
Hall of Justice. How may we assist thee?" (`SET` bit 0).

**Topic menu (`ASKTOP`):**
| Keyword prefix(es) — exact | Response / action |
|---|---|
| `name` | "I am Lenora, Lady Mayor of Yew." |
| `job` | presides over the town + its **courts**; "We also provide the finest **wood** in the realm." |
| `wood,log` | **"Go ask Ben the logger.** Head **west** into the forest until you can go no further, then look for a way through the trees to the **north**." → the **yew-log** source. |
| `cour` (courts) / `just` (justice) | "the **Rune of Justice** itself was sent here for safekeeping." |
| `rune` | "A **thief** stole the rune from the grave of… the former Lord Mayor… the thief was caught, but we have not yet found the rune." |
| `thie` / `caug` / `wher` | "The thief is in the **jail**, awaiting the carriage of justice." |
| `mant` (mantra) | "thou knowest not the Mantra of Justice… How can that be?" → answer anything but `bye` → **"The Mantra of Justice is 'beh.'"** (`CLR` bit 1; `bye` → offended, `SET` bit 1, leaves) |
| `lett` / `perm` (letter of permission) | "Dost thou truly need to speak with that reprehensible thief?" → **yes** → drafts a letter, `GIVEOBJ` avatar **obj 152 q121** (the **letter of permission**; "the jailer will now let you in"); **no** → offended (`SET` bit 1, leaves) |
| `rele`/`free`/`deal`/`trad`/`swap`/`allo`/`go`/`out` | "Free the thief in return for the rune? **Never!**… Better to leave it lost." (won't trade) |
| `kid`/`chil`/`fami`/`feed` | dismisses the thief's "family to feed" story as **lies** ("he's just a drifter") |
| `lie` | "Tell him he's not fooling anyone." |
| `ench`/`nico` | "Nicodemus the enchanter lives near here. His house lies between two rivers." |
| `bye` | "May you find that which thou deservest on thy quest." |

**Actions:** `SET`/`CLR`/`TST` self bits 0/1; `GIVEOBJ` avatar the **letter of permission (obj 152
q121)**. **Quest payload (★):**
- **JUSTICE rune+mantra (thread 3):** mantra **"beh"** — given here for free; the **Rune of Justice**
  was at Yew but **stolen by a thief** (from the former Lord Mayor's grave), now **lost**, and the
  thief sits in **Yew jail**. Get Lenora's **letter of permission** (obj 152 q121) → the jailer admits
  you → question the thief (the rune's whereabouts). She refuses to free him for the rune.
- **Yew-log source:** **Ben the logger** (W of Yew into the forest, then N) — the wood/yew supply that
  feeds the panpipes → Sacrifice-rune chain (yew log → Aaron's sawmill → Julia's panpipes).

---

<a id="npc-55"></a>

## Le'nard — npcId 55 (`converse.a`), 1,907 bytes — timid tailor of Yew (the silk-bag lead)

**You see** "a short, fat, rosy-cheeked man with long hair covering his eyes." At **(260,154,z=0)** —
Yew. A **timid tailor** ("The man seems afraid of you. 'Wh-what do you want?'"). Self-ref `BYTE(235)`
= self = 55; bit 0 = met.

**Topics:** `name` ("Le'nard," whispered), `job`/`buy`/`tail` → he sews **pants / tunics / dresses**
and uses a lot of **thread (obj 225)**, which he'll **buy** off the party (8g each); `pant`/`tuni`/
`dres` → the clothing buy loop.
- **`ball,plan,silk,bag`** → **★** gated on `WHOSGOT(obj 270)` (the **balloon plans**): if you do NOT
  have them → "I'm not sure what you mean."; if you DO → **"I wouldn't know where to begin. Ask
  Marissa in Paws."** → the **silk bag / balloon envelope** maker is **Marissa in Paws** (thread 6).

**Actions:** `SET` bit 0; tailor buy/sell (`TAKEOBJ`/`GIVEOBJ` gold 88 + clothing; buys thread 225).
**Quest payload:** the balloon's **silk bag** → **Marissa in Paws** (the hint unlocks only once you
carry the balloon plans, obj 270).

---

<a id="npc-56"></a>

## Andrea — npcId 56 (`converse.a`), 3,904 bytes — keeper of the Slaughtered Lamb (Yew)

**You see** "an enormous woman, both in size and personality." At **(225,156,z=0)** — runs the
**Slaughtered Lamb** pub (Yew). Self-ref self = 56; bit 0 = met, bits 2/3 = arm-wrestling won/lost.

**Vendor:** ribs (obj 210), ale / mead / wine, rations (obj 129). **`arm,wres`** → an **arm-wrestling**
match (a STR contest; result recorded in bits 2/3). Flavor: `men`/`stro`, `big,ben` ("Now there's a
man… wish he'd come into town more often" = **Ben the logger**), `Lena` (Le'nard, "a little
girlie-man… makes fine clothes"), `chan`, `garg`, `bye` ("if you see that cutie **Utomo**, tell him
Andrea says hi").

**Actions:** `SET`/`TST` bits 0/2/3; `ADDSTR` (wrestling); food/drink vendor loop. **No quest
dialogue** — but **★ her pub, the Slaughtered Lamb, is where the Rune of Justice is hidden** (under a
**potted plant**, per Boskin npc 60). Andrea's role is the *location*, not the telling.

---

<a id="npc-57"></a>

## Utomo — npcId 57 (`converse.a`), 3,592 bytes — weaponsmith of Yew (the magic-fan lead)

**You see** "a huge, dark-skinned man with a close-set face." At **(259,186,z=0)** — Yew's
**weaponsmith**, an island refugee who fled an "evil man" who wanted him to "kill good people."
Self-ref self = 57; bit 0 = met. Speaks broken Common (`ombo`/`dono`/`sano` = hello / stranger /
friend; `omdu yaf` = goodbye).

**Vendor:** weapons (Club, Dagger, Spear, Throwing Axe, 2-Handed Axe) + armor (Brass Helm, Leather
Armour, Leather Helm, Ring Mail, Swamp Boots); also **buys** gear. Flavor: from a far **island**, home
burned, a girl **Yuna** back home; `Andr` → Andrea's unwanted advances.
- **`fan,magi`** → **★** "Lady on island make **magic fans**. They make **big wind, blow ships all
  around**." (Utomo brought one from his island.) → a magic-fan / wind-device lead (sea-travel or
  balloon adjacent; the island + the lady are not yet pinned).

**Actions:** `SET` bit 0; arms/armor buy + sell loop. **Quest payload:** the **magic fan** lead. No
hard quest gate.

---

<a id="npc-60"></a>

## Boskin — npcId 60 (`converse.a`), 2,558 bytes — the jailed thief (★ the Rune of Justice)

**You see** "a short, heavyset man dressed in rags." At **(243,186,z=0)** — **the thief in Yew's
jail** who **stole the Rune of Justice** from the late Lord Mayor's grave. (Reach him via **Pridgarm**
the jailer + **Lenora**'s letter.) Self-ref self = 60; bit 0 = met; bit 1 = "clammed up" (set if you
refuse his deal / `bye` rudely).

**The con + the reveal:** he opens with a sob story — `grav`/`rob`/`crim` ("I 'ad me kids to feed"),
`kids`/`fami` (tearful), `true` ("even a thief wouldn't lie to the Avatar"). Two routes to the rune:
- **Call his bluff** — `know`/`lie`/`lyin`/`fals`/`fool` → "All right, I admit it. I 'aven't got any
  kids." → offers a deal: "If I tell you where the rune is, will you take it away?" → **yes** → **"Go
  to the Slaughtered Lamb; I 'id the rune under a potted plant there."**
- **Promise to free him** — `rele`/`free`/`go` → "Are they gonna let me go 'ome?" → **yes** → reveals
  the same ("under a potted plant in the Slaughtered Lamb inn") **+ `SUBKARMA 5`** (you lied — Iolo,
  if in party, chides you via `SHOW_CONVERSE`).
- After he's been engaged (bit 1), a later visit he cracks on his own: "All right, I give up. The rune
  is 'idden under a potted plant at the Slaughtered Lamb."

**Actions:** `SET`/`CLR`/`TST` bits 0/1; `SUBKARMA 5` (the lie); `SHOW_CONVERSE` Iolo's aside.
**Quest payload (★):** the **Rune of Justice** is **under a potted plant in the Slaughtered Lamb**
(Andrea's pub, npc 56) — completes the Justice rune trail. Lenora refuses to free him in trade.

---

<a id="npc-61"></a>

## Pridgarm — npcId 61 (`converse.a`), 2,311 bytes — the Yew jailer (the cell key)

**You see** "an old man, tall and thin. He spends all his time whittling." At **(235,184,z=0)** —
**the jailer** of Yew's jail (the thief Boskin is in **solitary**). Self-ref self = 61; bit 0 = met;
bit 2 = "you have a cell key out."

**Getting in to the thief:**
- `key`/`give`/`plea` → "I could give you the key… but not without **Her Ladyship's permission**."
- `perm`/`lett`/`lady` → "You got a letter of permission from Her Ladyship?" → **yes** + you hold
  **Lenora's letter** (`WHOSGOT` obj 152 q121) → he **takes the letter** and **`TRANSFEROBJ`s you the
  solitary cell key (obj 64 q11)** ("Give it back when you're done"); `SET` bit 2; `SUBKARMA 5`. (No
  letter → "Gotta have a letter if you want to see the thief.")
- **Return the key** — a later visit opens "Done with the key yet?" → give it back → `TRANSFEROBJ` key
  to the jailer, `ADDKARMA 7`.
- `brib`/`mone`/`pay` → "You offering me a bribe? … Nope. Sorry, not interested." (incorruptible).
- **`cell` easter egg** → "Say, you looking to get the keys to my jail cells? … I make up fer [Her
  Ladyship's strictness] by being a little careless with the keys." → he **tosses you the OTHER cell
  keys** (obj 64 q7/8/9/10) for free (not the thief's solitary q11).

**Actions:** `SET`/`CLR`/`TST` bits 0/2; `WHOSGOT` the letter; `TRANSFEROBJ`/`GIVEOBJ` cell keys (obj
64 q7–11); `SUBKARMA 5` (lending the key) / `ADDKARMA 7` (returning it). **Quest payload:** the gate
between Lenora's letter and Boskin — letter → **solitary cell key (obj 64 q11)** → talk to the thief.

---

<a id="npc-134"></a>

## Karina — npcId 134 (`converse.b`), 1,853 bytes — gypsy girl, Zoltan's daughter (the dancer)

**You see** "a gypsy girl poised on the verge of womanhood." At **(255,167,z=0)** — the Yew gypsy
camp. **Zoltan's daughter**, the shy dancer. Self-ref self = 134; bit 0 = met, bit 7 = "danced for
you." **Kador gate:** if you mistreated the dog (npc 135 bit 7) → "How could you be so mean to Kador!…
go apologize!" + `LEAVE`.

**Topics:** `name` ("My name is Karina… Do you think it's a pretty name?"), `job` ("Father says I'm
supposed to dance for gorgios"), `gyps`/`gorg` (gypsy life), `fath`/`zolt` ("He is Zoltan, king of the
gypsies"), `capt`/`john`/`silv`/`tabl`/`lyca` → **"Ask my father"** (defers all quest topics to
Zoltan), `dog`/`kado` ("such a sweet little doggie").
- **`sist` / `penu`** → **★** "Her name is **Penumbra**. Have you any news of her?" → **yes** → "Oh!
  I'm so glad to hear she's okay!" (hug/kiss). → **Karina is Penumbra's sister** (Penumbra = npc 41,
  the fortune-teller near the Lycaeum who sells the **Honesty mantra "ahm"**).
- **`advi`** (1 gold) → "Ask our dog, **Kador**, to do some tricks for you."
- **`danc`** → too shy → `emba` → "promise not to make fun of me?" → agree → she dances "a dance of
  haunting beauty" → **+10 karma** (once; `ADDKARMA 10` + `SET` bit 7); refuse / `bye` → she turns
  away, **−5 karma**.

**Actions:** `SET`/`TST` bits 0/7; `TAKEOBJ`/`GIVEOBJ` gold (advice fee); `ADDKARMA 10`/`SUBKARMA 5`
(dance); `SETMODE` self. **Quest payload:** none hard — defers quests to Zoltan; the lore thread is
**Penumbra = her sister**.

---

<a id="npc-136"></a>

## Taynith — npcId 136 (`converse.b`), 3,413 bytes — mysterious gypsy fortune-teller

**You see** "a mysterious gypsy woman wearing an ankh pendant." At **(253,167,z=0)** — the Yew gypsy
camp. A **fortune-teller**. Self-ref self = 136; bit 0 = met. **Gates:** if npc 110 is on-screen →
"My chances to visit **Dr. Cat** come all too seldom… Seek me out later." `LEAVE`; if you mistreated
Kador (npc 135 bit 7) → "I have no time for those who are cruel to animals." `LEAVE`.

**Topics:** `name` ("Some know me as Taynith"), `true`/`know` → refuses her true name; `job`/`aid` →
"I tell fortunes - for a price"; `capt`/`john` → confirms the silver tablet ("he brought us a silver
tablet… to deliver to the Lycaeum; **Zoltan** took care of the deal") → defers to Zoltan; `path`/`paw`
→ "My path leads to **Paws**… my good friend **Dr. Cat** lives there"; `penu` → senses whether you've
met Penumbra (npc 41) already.
- **`advi`** (2 gold) → "Look through the books at the **Lycaeum**. You might learn something useful."
- **`tell`/`fort`/`tile`/`futu`** (6 gold) → casts **three ivory tiles**, a random reading:
  - 'Panda / Coin / **Bead of Glass**' → **★** "something made of **glass** plays a very important role
    in your future… **Seek out Penumbra. Her crystal ball** should hold more affinity for this item."
    → the **lens** (thread 1), pointing to Penumbra (npc 41).
  - 'Abyss / Mountains / **Maelstrom**' → "to accomplish your ends, you must **go down very far, then
    up very far**, but you will not end up back where you started" → the abyss/vortex endgame.
  - 'Path / **War** / Rogue' → Britannia heads "towards all out war"; the Rogue "goes against his Lord
    to find another path."
  - 'Shaman / Blademaster / Clever Fish' → "All of these things and more must you be to find success."

**Actions:** `SET`/`TST` bit 0; `ISONSCREEN` npc 110 gate; `TAKEOBJ`/`GIVEOBJ` gold (fees); `RND` tile
pick. **Quest payload:** prophecy-flavor, but the **glass-tile → Penumbra** reading reinforces the
**lens** thread, 'Abyss/Maelstrom' foreshadows the vortex, and she names **Dr. Cat in Paws**.

---

<a id="npc-137"></a>

## Blaine — npcId 137 (`converse.b`), 2,615 bytes — gypsy juggler (recruitable companion)

**You see** "a slightly built gypsy lad." At **(256,166,z=0)** — the Yew gypsy camp. A **juggler**,
**recruitable**. Self-ref self = 137; bit 0 = met. **Kador gate** (npc 135 bit 7) → "Our dog did his
best trick for you. You should show him some appreciation." `LEAVE`.

**Topics:** `name` ("I am called Blaine"), `job` ("I am a juggler. But I would fain **@join** thee and
go adventuring"), `buy`/`sell` (nothing now), `bye` (a little gypsy tune).
- **`join` / `adve`** → "Do you want me to come with you?" → `JOIN` self → **joins** ("I look forward
  to the many adventures we will share"); return codes: 1 = "Not while you're in that thing!" (at
  sea / balloon), 2 = party full ("ask one to @leave first"), 3 = decline-confirm path. `leave` (in
  party) → leaves and drops his gear in a pile.
- **`advi`** (1 gold) → **★** "Almost **due east of Iolo's hut** there lives a powerful enchanter." →
  the **Nicodemus** lead (cf. Thariand / Jaana / Lenora).
- **`jugg`** (5 gold) → a flaming-wand juggling show.

**Actions:** `SET` bit 0; `JOIN`/`LEAVEPARTY` self; `TAKEOBJ`/`GIVEOBJ` gold (fees). **Quest payload:**
a **recruitable companion** + another **Nicodemus** pointer. *(Clone note: `JOIN` is the deferred stub
— he says he joins but party membership isn't yet wired; same as Jaana.)*

---

<a id="npc-181"></a>

## Sinjen — npcId 181 (`converse.b`), 956 bytes — the warrior in the Yew stocks (flavor)

**You see** "a long haired, raggedy man in stocks." At **(253,169,z=0)** — Yew (beside the gypsy
camp). A **warrior** who **volunteered for the stocks** "to get a different perspective on life."
Self-ref self = 181; bit 0 = met. A short flavor script — **no quest item, no gate.**

**Topics:** `name` ("I'm Sinjen the warrior"), `warr` ("these days I'm more into stocks"), `job` →
"**Lenora** said I should stay in these stocks… and make sure they work properly"; `stoc`/`stay` → "I
didn't really do anything wrong. I told them to put me here anyway, so I could get a different
@perspective on @life"; `pers`/`life` → mild philosophy; `leno` → "Justice may be a @virtue, but I
think she carries it too far"; **`just`/`virt`** → "I prefer **Mandrake's** version of the eight
virtues"; **`mand`** → "You should ask him about it sometime."; `bye` → "I'll be right here…"

**Actions:** `SET` bit 0 only. **Quest payload:** none — pure flavor (a zen warrior in Lenora's
stocks). The one thread is a soft lead to **Mandrake** (an unlocated NPC with a contrarian take on the
eight virtues; likely flavor, not confirmed quest-critical).

---

<a id="npc-58"></a>

## Nicodemus — npcId 58 (`converse.a`), 4,004 bytes — the enchanter east of Yew (magic vendor)

**You see** "a wizened old man with a ready smile." At **(334,203,z=0)** — east of Yew, "between two
rivers" / "east of Iolo's hut" (the **"powerful enchanter"** that Thariand, Jaana, Lenora & Blaine all
point to). Self-ref self = 58; bit 0 = met. Greeting: "Good $T, Avatar. For what purpose hast thou
come?" **Despite the reputation, his script is a magic SHOP** — no quest keyword (no gargoyle / lens /
tablet / rune / vortex topic anywhere).

**Services:**
- `buy`/`reag` → **reagent vendor**: Blood Moss, Garlic, Ginseng, Spider Silk, Sulfurous Ash (1–2g;
  the 5 "common" reagents — no Nightshade / Mandrake / Black Pearl).
- `book` → sells a **spellbook (obj 57)** for **45 gold**.
- `lear`/`spel` → **teaches spells by Circle** (member needs a spellbook; gates on level/circle
  readiness; cost ≈ 20 + 2·circle gold per spell; hands over a rune-parchment, obj 58). His list spans
  Detect Trap / Sleep / Unlock Magic / Untrap / Magic Lock / Mass Sleep / Protection / Repel Undead /
  Conjure / Insect Swarm / Charm / Confuse / Mass Protect / Web / Enchant / Mass Invisibility (a
  partial set; **no 8th-Circle / wisp gate**, unlike Xiao npc 36).
- `sta` → crafts **magic yew staves (obj 78)** for **100 gold** ("if thou knowest the **Enchant**
  spell, thou canst lock a spell within the staff for quick use").

**Flavor:** `job` → "I sell reagents, teach spells, and craft magic staves. I also do a little
**@experimenting**." `expe`/`inte` → he clams up, suspicious: "Don't be too nosy, sonny!" — a dangling
mystery the script never opens (no flag/item unlocks it here).

**Actions:** `SET` bit 0; vendor loops (`TAKEOBJ`/`GIVEOBJ` gold 88 ↔ reagents / spellbook obj 57 /
spell-parchment obj 58 / staff obj 78). **Quest payload: none** — the universal "go see the enchanter"
leads resolve to a convenient **magic vendor** (reagents + spell-teaching without the wisp gate +
Enchant + staves). The secretive "experimenting" is unexplained flavor, not a quest hook in this script.

---

<a id="npc-111"></a>

## Captain Fox — npcId 111 (`converse.b`), 1,511 bytes — pirate captain of Buccaneer's Den (flavor)

**You see** "a handsome gentleman, immaculately dressed." At **~(570,611,z=0)** — **Buccaneer's Den**
(the pirate island east of Paws), captain of the ship the **Silken Stag**. Self-ref self = 111; bit 0
= met. **Busy gate:** the script opens `IF #W (npcMode) == 153` (0x99, a combat/assault AI mode) →
*"'Can't talk now, $G.' He pauses to punch another pirate in the belly… 'Come back later when I've less
on my mind!'"* + `LEAVE` — i.e. if he's mid-brawl he brushes you off. Otherwise greets *"Hello, $G.
Your company is welcome."*

**Topics (all flavor):**
- `name` → "I'm @Captain Fox, of the Silken @Stag." (`SET` bit 0 — name known).
- `capt` → the pirates at the table turn expectantly, then go back to their business.
- `silk`/`stag` → "We just stopped off here for some supplies and a @drink or two."; `drin`/`two` →
  "Well, maybe three wouldn't hurt."
- `job` → "I sail the wide, wide sea, to the edges of the @world and back again… also known for the
  @paintings I create in my spare time."; `pain` → "There are a few of them around here. Go see for
  yourself." (his paintings are scattered around the den as set dressing).
- `edge`/`world` → flat-earth joke ("Don't go too far, matey--ye'll fall off!").
- **`john`** → **★ (thread 4)** "Captain John, that lunatic? … I hear he went @underground seeking the
  @gargoyles, but he fled from the first one he encountered. Nobody knows where he is now." — and **if
  Leodon (npc 113) is on-screen** (`ISONSCREEN` 113) Leodon interjects *"Well, that's not what I heard,"*
  (portrait swap) — the script itself flags the rumor as **disputed** (cf. Zoltan's "John is living with
  the gargoyles, there's nothing evil about them").
- `unde` → "Under the earth is no place for a seafaring man to be."; `garg` → "Tough creatures. My crew
  and I steer well clear of them."
- `bye` → "Until we meet again." `LEAVE`. Catch-all `*` → `RND(0,3)` → either "I can't help ye with
  that." or a laughing / ale-spill brush-off.

**Actions:** `SET` bit 0 only; `IF`/`RND`/`ISONSCREEN`; `SHOW_CONVERSE` (Leodon's aside); `LEAVE`. **NO
`GIVEOBJ`/`TAKEOBJ`/`TRANSFEROBJ` anywhere in the script.** **Quest payload: none.** ✗ He does **not**
hold or mention the **silver tablet** (obj 389/390) and **never names "Hawkins."** So the bigger tablet
half is **not** a Captain-Fox conversation reward — it must be recovered **physically from the den** (a
container/chest) or possibly from another den NPC. His only quest-adjacent line is the **Captain John**
rumor (thread 4): John went underground after the gargoyles and fled, whereabouts unknown — and Leodon
(113) disputes even that.

---

<a id="npc-113"></a>

## Leodon — npcId 113 (`converse.b`), 2,803 bytes — captain of the Golden Hind, Buccaneer's Den (★ recruitable; the Captain John lead)

**You see** "a woman with a slightly seaworn look, but delicate hands." At **~(570,612,z=0)** —
**Buccaneer's Den**. A **female pirate captain** (of the *Golden Hind*, currently laid up for
**repairs**), **recruitable**. Self-ref self = 113; bit 0 = met. Greets *"A good $T to you, $G. Come,
have a seat and talk with us a while."* **Busy gate** (`IF npcMode == 153`) → *"Not now, $G! She ducks a
punch. I'm busy!"* + `LEAVE`. **Already-in-party** greet → *"Yes, $P?"*.

**Topics:**
- `name` → "I'm @Captain Leodon." (`SET` bit 0).
- `job`/`fine`/`ship`/`sail`/`gold`/`hind` → captain of the **Golden Hind**; "the Hind needs serious
  @repairs just now."
- `need`/`repa` → keeps busy on land meantime → (if not already in party) "Perhaps I could @join thy
  party for a time."
- `life`/`sea`/`vast`/`drea` → sea-poetry flavor.
- `capt` → the "all the pirates turn expectantly" gag — gated on how many of Leonna (114) / Fox (111) /
  Elad (112) are on-screen (`LET #0 = ISONSCREEN(114)+ISONSCREEN(111)+ISONSCREEN(112)`; if ≤1 present
  she instead asks "You wouldn't be talking about Captain @John, would you?").
- **`leon`** → "Aye, **Leonna** is the best first mate I've ever had." (if Leonna 114 on-screen she
  blushes — portrait swap) "Comes from being **a captain once herself**, you know." → **Leonna (114) is
  an ex-captain too** (also recruitable — see her own block).
- **`john`** → **★ (thread 4)** "That scallawag? He went down to the **other side of the world to join
  up with the @gargoyles, the dirty traitor**…" — and **if Elad (npc 112), "the tea-drinker," is
  on-screen** (`ISONSCREEN` 112) he **interrupts**: *"No, no, you've got it all wrong! I can tell you
  the truth about Captain John!"* (portrait swap to 112). → **the lead: ask Elad (112) about Captain
  John.**
- `garg`/`ham`/`bisc` → flavor (a gargoyle once stole her ham; she "dined on biscuits that night").
- `bye` → in-party "Back to our quest, eh $G?" / else "Drop by again…"; catch-all `*` → "I can't help
  you with that."

**Recruiting:** `occu`/`join`/`part` → the join offer ("The Golden Hind won't be repaired for months…
Would you like me to come along?" → Y/N → `JOIN` self). Success → "Very well. This should make a nice
change from my usual routine." + (if Leonna 114 not yet in party) "You might ask **@Leonna** if she
would like to join us as well." `leav` (in party) → `LEAVEPARTY` self; she "heads back to the **Fallen
Virgin**" and drops her gear. (Join return codes 1/2/3 = at-sea / party-full / decline, as elsewhere.)

**Actions:** `SET`/`TST` bit 0; `ISINPARTY`/`ISONSCREEN`; `JOIN`/`LEAVEPARTY` self; `SHOW_CONVERSE`
(Leonna's & Elad's asides); `LET`/`ADD`/comparisons; `LEAVE`. **NO `GIVEOBJ`/`TAKEOBJ`.** **Quest
payload:** ✗ no silver tablet / no "Hawkins"; **★ two leads** — (1) **Elad (112) claims to know "the
truth about Captain John"** (thread 4), and (2) **Leodon + Leonna (114) are recruitable captains**. Her
take on John (a traitor who joined the gargoyles) only loosely matches Fox's "went underground… fled" —
the den NPCs disagree about John, which is exactly why Elad's "truth" is worth hearing. *(Clone note:
`JOIN`/`LEAVEPARTY` are the deferred party-membership stubs — she says she joins/leaves but membership
isn't wired yet.)*

---

<a id="npc-112"></a>

## Elad — npcId 112 (`converse.b`), 3,163 bytes — "the tea-drinker," Buccaneer's Den (the disputed Captain John "truth")

**You see** "an uncomfortable looking man sitting behind a cup of tea." At **~(569,611,z=0)** —
**Buccaneer's Den**. **Captain Elad**, ex-captain of the sunk *Theodosia Marie*, a **reforming drunk**
(sipping tea, "his gaze… lingering longingly on the mugs of ale his fellow patrons are gulping down").
Self-ref self = 112; bit 0 = met; bits 6/7 = Honesty-mantra quest state. **Busy gate** (`npcMode == 153`)
→ "Can't talk now. I'm--ungh!" (punched) + `LEAVE`.

**Topics:**
- `name` → "I'm @Captain Elad." (`SET` bit 0; once met → "Well, I'm still Captain Elad.").
- `job` → "I was Captain of the Theodosia Marie--until she @sank."
- **`john`** → **★ (thread 4)** his promised "truth": *"Captain John, that fool… He was **captured by
  gargoyles**. I hear they **dragged him down into Hythloth**, and nobody's seen hide nor hair of him
  since."* — and **if Leonna (114) is on-screen** she raises an eyebrow: *"Is that so? I could tell a
  different tale…"* (`ISONSCREEN` 114, portrait swap). So **Elad's "truth" is just another version,
  immediately disputed by Leonna** — the den's running John gag continues.
- The shipwreck thread: `theo`/`sank` → the *Theodosia Marie* sank off **@Bordermarch**; `bord` → "A
  fair sized island, and now she's **gone**!"; `eart`/`quak` → the **earthquakes started soon after Lord
  @British was @rescued from the underworld** (he lost his ship to the last one); `whir` → a whirlpool
  swallowed the wreck.
- `rune` → "I wish I had one… I bet I could **sell it** for a pretty penny!" (greed, no rune here);
  `mant`/`virt` → "You don't hear much about the @virtues in a pirate town…"; `hone`/`trut`/`tea` → he's
  "given up @drinking" to better himself; `drin`/`temp` → temptation flavor.
- `bye` → routes to his **Honesty-mantra ask** (below); catch-all `*` → "Ah, that's not important."

**★ Honesty-mantra micro-quest (on leaving):** if he hasn't asked already, Elad stops you — "do you know
the **@Mantra of Honesty**?" → "I'll give you **five gold** if you tell me." → type **`ahm`** (the
Honesty mantra, from **Penumbra** npc 41, thread 3) → he `GIVEOBJ`s the avatar **5 gold** (obj 88 ×5),
sets his done-bits, "Now my meditations will succeed at last!" Closing gag: "you think you might have
caught a glimpse of Captain Elad **stealing a swig from someone else's mug**… But you can't be sure." A
`SUBKARMA 5` branch guards the dishonest path; a `CANCARRY`/`WEIGHT` gold-room check gates the offer.

**Actions:** `SET`/`TST` bits 0/6/7; `ISONSCREEN` 114; `SHOW_CONVERSE` (Leonna's aside); `GET` y/n +
`ASKTOP` (the mantra prompt); `GIVEOBJ` 5 gold (obj 88); `SUBKARMA 5` (dishonesty branch); `CANCARRY`/
`WEIGHT` gold check; `LEAVE`. **Quest payload:** ✗ no silver tablet / no "Hawkins." **Thread 4:** his
Captain-John "truth" (**captured → dragged into Hythloth**) is **disputed by Leonna (114)** — the four
den pirates (Fox/Leodon/Elad/Leonna) each tell a *different* John story, so the den is a **running-gag
dead-end** for John's real fate; the only forward pointer left is **Leonna (114)** as the next disputant.
Minor: a **5-gold reward** for knowing the Honesty mantra "ahm" (ties to thread 3); plus world lore
(Bordermarch sank; earthquakes began after LB's rescue).

---

<a id="npc-114"></a>

## Leonna — npcId 114 (`converse.b`), 2,093 bytes — Leodon's first mate, Buccaneer's Den (★ recruitable; closes the Captain John loop)

**You see** "a smartly dressed woman. Her smile has a delightful subtlety to it." At **~(569,612,z=0)** —
**Buccaneer's Den**. An **ex-captain** who "fell on hard times" and now sails as **Leodon's first mate**
on the *Golden Hind*; **recruitable**. Self-ref self = 114; bit 0 = met. Greets the Avatar warmly ("'Tis
an honor to meet thee"). **Busy gate** (`npcMode == 153`) → "You fail to get her attention in the midst
of the brawl." + `LEAVE`. In-party → "Yes, $P?".

**Topics:**
- `name` → "My name is Leonna."; `job` → "I used to @captain my own ship… now I sail with @Leodon on the
  @Hind."; `hind`/`repa` → the Golden Hind's in for repairs; `leod` → "There's none I'd rather ship out
  with."
- `capt` → the "pirates turn expectantly" gag (same ISONSCREEN-count gate as the others).
- **`john`** → **★ (thread 4)** "Captain John is a **madman**! He went down in **Hythloth** seeking a way
  to the **other side of the world**. Said he was going to **kill as many @gargoyles as he could** before
  they got him." — and **if Fox (111) is on-screen, Fox interrupts: "That's not true! I can tell you what
  really happened."** (`ISONSCREEN` 111, portrait swap) → **the rumor LOOPS back to Fox**.
- `garg` → "Please, let's not talk about them." `bye` → "Talk to you later." catch-all `*` → "I can't
  help you with that."

**Recruiting:** `litt`/`repa`/`join` → "Could I join your party, perhaps?" → Y/N → `JOIN` self; success →
"Oh good! I bet we'll meet a lot of interesting men…" `leav` (in party) → `LEAVEPARTY` self; she "waits
back at the **Fallen Virgin**" and drops her gear. (Join codes 1/2/3 = at-sea / full / decline.)

**Actions:** `SET`/`TST` bit 0; `ISINPARTY`/`ISONSCREEN`; `JOIN`/`LEAVEPARTY` self; `SHOW_CONVERSE`
(Fox's aside); `LET`/`ADD`; `LEAVE`. **NO `GIVEOBJ`/`TAKEOBJ`.** **Quest payload:** ✗ no silver tablet /
no "Hawkins." **Thread 4 — the loop closes:** Leonna's John story (into **Hythloth** for the other-side
passage, to kill gargoyles) is **disputed by Fox**, who started the chain — so the four den captains form
a **complete circle** (Fox→Leodon→Elad→Leonna→Fox), confirming the den is a **running-gag dead-end**. The
one element recurring across **both Elad and Leonna is "Hythloth"** (the dungeon) — the only
semi-consistent thread about John, if any of it is true. Also a **recruitable** companion (with Leodon).
*(Clone note: `JOIN`/`LEAVEPARTY` are deferred party stubs.)*

---

<a id="npc-115"></a>

## Budo — npcId 115 (`converse.b`), 4,554 bytes — Buccaneer's Den merchant ("the Den") + Thieves' Guild recruiter

**You see** "a chubby, jovial merchant." At **~(563,604,z=0)** — **Buccaneer's Den**. A scatterbrained
**general-goods merchant** who plays dumb; nicknamed **"the Den."** Self-ref self = 115; bit 0 = met;
bit 7 = "you're a guild member (discount)." Opening gag: he insists you ordered an **orrery** (if Dupre's
along, Dupre objects), then "Do you need to buy some supplies?"

**Vendor** (`buy`/`sell`): **torches, oil, lockpicks, gems, backpacks, bags, shovels, powder kegs** — a
full priced buy loop (obj 88 = gold; indexed item/name/price tables). *(He stocks the **shovels** you'll
need to dig up buried treasure and the **gems** Dale wants for the glass sword, thread 1.)*

**Flavor topics:** `name` → "it's Budo… Some call me 'the @Den'"; `den` → "that was @Nick's name"; `nick`
→ "I've never met him"; `job`/`mone`/`hone` → bumbling-merchant patter.

**★ Thieves' Guild (`thie`/`guil`/`belt`):**
- If you **already hold a guild belt** (`WHOSGOT` obj 25) → "Congratulations, and welcome to the guild"
  → `SET` bit 7 (member discount); thereafter he's a "brother."
- If you're **already a member** (bit 7) → guild lore: "each member only knows the names of two others."
- Otherwise his bumbling mask **drops** — "a shrewd, sharp, dangerous looking man… 'Who sent you?'" →
  asks if you want to **join** → the **initiation**: you need **your own belt**, and membership is
  capped, so you must **"retire" (kill) an existing guild member** — "Her hideout is **deep below
  Britain, in the sewers**" (mind the rats); "don't get too violent" (no bodies). Decline → a veiled
  threat ("accidents can happen… even to the Avatar. Now get out of my shop.").

**Actions:** `SET`/`TST` bits 0/7; `WHOSGOT` obj 25 (guild belt); `TAKEOBJ`/`GIVEOBJ` gold↔supplies;
`GET`/`ASKTOP`. **Quest payload (★):** the **Thieves' Guild entry point** — join via Budo (get the belt
obj 25; "retire" the member in the **Britain sewers**). Guild membership is the **gate that makes Homer
(116) reveal Hawkins' treasure / the silver tablet** (thread 2). Plus a handy supply shop (shovels,
gems, lockpicks, powder kegs).

---

<a id="npc-116"></a>

## Homer — npcId 116 (`converse.b`), 5,474 bytes — ex-pirate of Captain Hawkins (★★ the silver-tablet treasure quest)

**You see** "a shifty-eyed character. He carries a cane and walks with a slight limp." At
**~(573,610,z=0)** — **Buccaneer's Den**. A **former crewman of Captain Hawkins**, gouty. Self-ref self
= 116; bit 0 = met. A heavy state machine — bits 1/2/4/5/6/7 track the treasure-map deal.

**Backstory topics:**
- `job` → "I once sailed on the ship '@Empire,' under Captain @Hawkins."; `empi`/`sail` → "wrecked on
  the cape, **southwest of here, not far from Serpent's Hold**."
- **`hawk`** → **★** "That heartless bastard… **He was killed by his own men**, and it was no worse than
  he deserved… Of course, I had nothing to do with it." → **Captain Hawkins is DEAD** (mutiny); Homer
  was complicit.

**★★ The silver-tablet thread (gated on Thieves'-Guild membership — `WHOSGOT` obj 25):**
- **`silv`/`tabl`** → if you're **not** a guild member he stonewalls ("Who sent you?… You're not a member
  of the @guild"); a **member** gets: "You're looking for the silver tablet? **It's part of Captain
  Hawkins' buried @treasure.**"
- `buri`/`trea` (member) → "It was buried in a small @cave."; `cave` (member) → the **map lore dump**:
  - After Hawkins died, the crew **tore his treasure map into NINE pieces** (so no one could
    double-cross). Homer has gout and can't travel: **"bring me the other eight pieces"** and he'll deal.
    The eight other holders:
    - **Hawknose** → the **Dry Land** (to kill the daemon there).
    - **Sandy** the ship's cook → **Trinsic** (with the first mate). *(Sandy = npc 75.)*
    - **Ybarra** → the dungeon **Shame** (seeking more treasure).
    - one crewman **died in a shipwreck**.
    - a man with a **hook hand** → **Jhelom**.
    - (plus the remaining unnamed holders — "find out where the others have gone").
  - "lay them out on the ground to see how they fit"; "only I know where the **ninth** piece is — come
    back when you have the other eight." `SET` bit 6.
- `guil` → "Go ask **Budo**." (confirms Budo 115 is the guild contact); `bye` (member) → "Farewell,
  brother thief."

**The deal (once you bring the 8 pieces — bit 7 set when `WHOSGOT` obj 400–407 are all in party):** "you
can have the silver tablet; all I really want is the **magical cloak** buried with the treasure." →
promise to bring the cloak → he hands you the **ninth piece** (`TRANSFEROBJ` **obj 408**; "Right here in
my pocket!") + the **dig directions**: *"reach the island marked X, find the three stones, stand in the
center; walk **3 paces south, 9 paces west, 12 paces south** to an old dead tree; dig in the dirt to the
south."* (`SET` bits 1/5.) **Payoff loop:** bring back the **storm cloak (obj 81)** → `TRANSFEROBJ` it to
Homer + `ADDKARMA 10`, `SET` bit 4 ("you served your purpose, now I have no further need of you"); **keep**
the cloak / break the deal → `SUBKARMA 10`.

**Actions:** `SET`/`CLR`/`TST` bits 0–7; `WHOSGOT` obj 25 (guild belt) / obj 400–407 (the 8 map pieces);
`TRANSFEROBJ` obj 408 (9th piece) & obj 81 (storm cloak); `ADDKARMA 10` / `SUBKARMA 10`; `GET`/`ASKTOP`.
**Quest payload (★★ thread 2):** the **bigger silver-tablet half (obj 390) is in Captain Hawkins' buried
treasure**, not loose in the den — recovered via the **nine-piece treasure-map** subquest: (1) **join the
Thieves' Guild via Budo (115)** so Homer talks, (2) gather the **8 map pieces (obj 400–407)** from the
scattered ex-crew (Hawknose/Dry Land, Sandy/Trinsic npc 75, Ybarra/Shame, a shipwreck, hook-hand/Jhelom,
+more), (3) Homer gives the **9th piece (obj 408)** + dig directions in exchange for the **storm cloak
(obj 81)** from the hoard, (4) dig on the X island → the **silver tablet** (+ the cloak + loot). Hawkins
himself is **dead**.

---

<a id="npc-117"></a>

## Johann — npcId 117 (`converse.b`), 1,502 bytes — "Yodeling Johann," nervous bard / ex-pirate deserter (★ a balloon lead)

**You see** "an uneasy looking bard." At **~(553,610,z=0)** — **Buccaneer's Den**. A jumpy **bard** and
**ex-pirate deserter** in hiding. Self-ref self = 117; bit 0 = met.

**Topics:** `name` → "Yodeling Johann."; `job` → "I sing @songs for the @pira—the @sailors here. But I'm
looking for a chance to @move to another town."; `yode` → too risky ("still got bruises"); `move`/`sail`
→ the salty air doesn't agree with him.
- **`pira`** → he panics: "Did I say pirates? … Nobody but fine honest sailors here." Then, low: **"If
  you should happen to run across **Bonn**, or **Ybarra**, or **Hawkins**, don't tell them I'm here."** →
  Johann is a **deserter** from Hawkins' crew (cf. Homer 116). `bonn`/`ybar`/`hawk` → he clams up ("Never
  'eard of 'im"); `empi` (the ship *Empire*) → spits, "What?".
- **`song`** → ★ a comic ballad about **ballooning** ("a young man went @ballooning… rise up to glory or
  fall to his doom").
- **`ball`** → "that's just some nonsense that gave me an idea for a song… I **read about it in a book at
  the @Lycaeum**."; `lyca`/`book` → "Ask the **librarian** there for help." → **Thariand (npc 34)**.

**Actions:** `SET` bit 0 only. **Quest payload:** **(thread 6)** a **balloon lead** — ballooning lore is
in a **book at the Lycaeum** (ask the librarian Thariand 34), a candidate source for the still-unknown
**balloon plans (obj 270)**. **(thread 2)** Johann is an ex-Hawkins crewman and name-drops **Bonn** (a
NEW crew name, alongside Ybarra) — possibly among Homer's unnamed map-piece holders — but Johann himself
hands over **no map piece** (no `GIVEOBJ`/`TRANSFEROBJ`). No tablet.

---

<a id="npc-118"></a>

## Shawn — npcId 118 (`converse.b`), 2,315 bytes — Buccaneer's Den food & drink vendor (flavor)

**You see** "a charismatic man with an engaging smile." At **~(563,611,z=0)** — **Buccaneer's Den**. Self
= 118; bit 0 = met. A **food/drink vendor**: `buy` → **ham** (5g), **mead/ale/wine**, **mutton rations**
(4g each) — the standard party-aware buy loop (obj 88 gold; obj 133 ham, 129 ration). **Actions:** `SET`
bit 0; `TAKEOBJ`/`GIVEOBJ`. **Quest payload: none** (flavor vendor).

---

<a id="npc-119"></a>

## Petroph — npcId 119 (`converse.b`), 755 bytes — Buccaneer's Den innkeeper, the King's Ransom (flavor)

**You see** "a giant of a man with a solemn stare." At **~(557,612,z=0)** — **Buccaneer's Den**. A
broken-English **innkeeper** of the **King's Ransom** inn. Self = 119; bit 0 = met; bit 1 = "you insulted
my inn." `room`/`inn` → rest for **(party+1)×6 gold** → `TAKEOBJ` gold + `REST` (sleep, restore); decline
→ he takes offense (`SET` bit 1, surly thereafter). **Actions:** `SET`/`CLR`/`TST` bits 0/1; `TAKEOBJ`
gold; `REST`. **Quest payload: none** (the den's inn).

---

<a id="npc-120"></a>

## Enrik — npcId 120 (`converse.b`), 2,613 bytes — Buccaneer's Den weaponsmith, "Enrik the Hammer" (flavor)

**You see** "a scarred man with a gap-toothed grin and large, calloused hands." At **~(548,635,z=0)** —
**Buccaneer's Den**. The **weaponsmith**, "Enrik the @Hammer." Self = 120; bit 0 = met. **Busy gate**
(`npcMode == 153`) → "Don't like talking when I'm fighting!". `buy`/`arms`/`armo` → **weapons & armor**
vendor (Club, Dagger, Main Gauche, Oil Flask, Throwing Axe; Cloth/Leather Armour, Leather Helm); `sell`
buys your used gear — both **gated on shop hours** ("Come by my shop when I'm open!"). **Actions:**
`SET`/`TST` bit 0; `OWNS`/`TEST_OBJ`; `TAKEOBJ`/`GIVEOBJ`. **Quest payload: none** (arms vendor).

---

<a id="npc-121"></a>

## Fentrissa — npcId 121 (`converse.b`), 2,049 bytes — Buccaneer's Den shipwright (ship & skiff deeds)

**You see** "a strong, sinewy woman with a hard look about her." At **~(573,636,z=0)** — **Buccaneer's
Den**. The den's **shipwright**. Self-ref self = 121; bit 0 = met. Salty banter (`sea`/`jeal` — whether
the sea is a "jealous man" or "a female").

**Vendor (`buy`/`deed`/`ship`/`skif`):** sells **ship and skiff deeds** (obj 149, quals 1/2 = ships,
128/129 = skiffs) — the standard party-gold-collection buy loop (`OWNS` to check her remaining stock,
`TRANSFEROBJ` the deed, `TAKEOBJ` gold). Sells out as you buy ("Sorry, I sold you my last one").

**Actions:** `SET`/`TST` bit 0; `OWNS` obj 149; `TAKEOBJ` gold / `TRANSFEROBJ` deed; `GET`/`GETDIGIT`.
**Quest payload:** none directly, but **★ a handy traversal vendor** — a **second source of ships &
skiffs** (deed obj 149) besides **Trebor** (Minoc, npc 72), right on the den island. Useful for the
island-hopping that thread 2's treasure hunt demands (the X-island dig site, Trinsic, Jhelom, the Dry
Land…). No tablet, no map piece.

---

<a id="npc-80"></a>

## Immanuelle — npcId 80 (`converse.a`), 1,624 bytes — Trinsic horse trader (flavor + a mount vendor)

**You see** "a sultry, dark-skinned woman dressed in riding-leathers." At **~(414,799,z=0)** —
**Trinsic**, at the stables. A flirty **horse trader**. Self-ref self = 80; bit 0 = met.

**Topics:**
- `name` → "Some call me Immanuelle, $G. Others call me…something @else." (winks); `some`/`else` →
  flirtation ("Perhaps some time I will @show you…"); `show` → "Not here." — pure flavor.
- `job` → "I raise horses here, in the stables. I also sell @horses, if you wish to @buy one."
- `sell`/`hors` → "a few that fail to please me… buy one of them."
- **`buy`** → (shop-hours gated) the horse-buy loop: scans the party for who lacks a mount (`HORSED`),
  "My price is #9 gold pieces" (**60 gold**) → Y → `TAKEOBJ` 60 gold + **`GETHORSE`** (gives/mounts a
  horse); handles "one of thy friends" for multiple riders.
- `bye` → "Come back again soon!" (blows a kiss).

**Actions:** `SET`/`TST` bit 0; `HORSED` (mount check); `TAKEOBJ` gold (88) + `GETHORSE`; `GET` y/n +
`GETDIGIT` (which member). **Quest payload:** ✗ none — a **horse vendor** (faster overland travel) +
flirt flavor. Not a map-piece holder; Trinsic's treasure-map holders are **Sandy (npc 75)** + "the
first mate" (per Homer).

---

<a id="npc-75"></a>

## Sandy — npcId 75 (`converse.a`), 1,955 bytes — Trinsic cook (★★ the map-piece informant)

**You see** "a shifty-eyed man with a strange smile. He smells of rancid grease and cooking smoke." At
**~(404,780,z=0)** — **Trinsic**. Real name **Sandstone Angus**; cooks for **Lord Whitsaber** (Trinsic's
mayor). Self-ref self = 75; bit 0 = met; bit 2 = "received the dragon egg" (unlocks his pirate/map info).

**The gate — a dragon's egg:** Sandy wants a **dragon's egg (obj 417)** for his "Humble Pie / Magincian
pastry." His riddle: *"A golden orb on a crystal sea, in a box sans hinges, lid, or key."* → answer
**egg**; `egg`/`drag` → "Only a dragon's will do. There's a lair in the dungeon **Destard**, to the
northwest." On opening, if you're **carrying obj 417** (`WHOSGOT`) he asks for it → Y → `TRANSFEROBJ`
the egg to him + `SET` bit 2 ("Now I can make Humble Pie!").

**★★ The payoff (after the egg, bit 2) — `pira`/`map`:** "Does the subject of @pirates interest you?" →
Y → he names **four map-piece holders**:
1. a **woman pirate in Serpent's Hold** (name forgotten) — has a piece.
2. a **hermit on Dagger Isle**.
3. **Nathaniel Moorehead**, a pirate at/near **Empath Abbey**.
4. the **fourth** ("maybe I've said too much") → via `four`/`said`/`much`/`alre`: **"Before Lord
   Whitsaber came to Trinsic to be our mayor, he was first mate to Captain Hawkins himself! His real
   name is Alastor Gordon."** → **Lord Whitsaber, Trinsic's mayor = Homer's "first mate" = Alastor
   Gordon**, the 4th holder.

**Other topics:** `name` → "Sandstone Angus… most folks call me Sandy"; `job` → cooks for **Lord
@Whitsaber**; `fish`/`wine`/`sauc` → his fish-in-white-wine specialty; `favo`/`firs`/`pie`/`magi`/`past`
→ route to the egg gate; `bye`.

**Actions:** `SET`/`TST` bits 0/2; `WHOSGOT` obj 417 (dragon egg); `TRANSFEROBJ` obj 417 (you→Sandy);
`GET` y/n + `ASKTOP` (the riddle). **Quest payload (★★ thread 2):** Sandy is the **map-lead informant**
— a **dragon's egg (obj 417, from Destard)** buys the locations of **4 map-piece holders**: Serpent's
Hold (woman pirate), Dagger Isle (hermit), Empath Abbey (**Nathaniel Moorehead**), and Trinsic's mayor
**Lord Whitsaber = first mate Alastor Gordon**. He hands over **no piece himself**.

---

<a id="npc-76"></a>

## Whitsaber — npcId 76 (`converse.a`), 2,260 bytes — Trinsic's mayor (★ a map-piece holder = the first mate, Alastor Gordon)

**You see** "a balding but distinguished man." At **~(402,739,z=0)** — **Trinsic**, the north end of
town. **Lord Whitsaber, mayor of Trinsic** ("the Town of Honor"), and secretly **Alastor Gordon,
Captain Hawkins' former first mate** (Sandy 75 outs him). Self-ref self = 76; bit 0 = met; **bit 2 =
"confronted — admitted the pirate past"**; **bit 3 = "gave you his map piece."** His greeting changes
once confronted: with bit 2 set, "fear fills the former pirate's eyes… *What do you want? I thought we
had a deal!*"

**★ The map piece (thread 2) — a two-step blackmail.** Whitsaber holds **treasure-map piece obj 401**
but won't give it up until you prove you know his secret:
1. Raise **`sand`/`alas`/`gord`/`firs`/`mate`** (Sandy / Alastor / Gordon / first mate) → *"Wh--what
   did Sandy tell you? Did he say I was once a @pirate?"* → **answer `y`** → he breaks ("*Then all is
   lost! …keep my secret! I have changed since those dark days*") and `SET` bit 2. (Answer `n` and he's
   relieved — *"good, because it isn't true!"* — and the gate stays shut.)
2. Now raise **`map`** (also `ship`/`hawk`/`capt`/`home`): with bit 2 set → *"If thou wouldst but
   promise to keep my secret, I'll give thee the map! Agreed?"* → **answer `y`** → *"He hands over his
   piece of the map."* `TRANSFEROBJ` obj **401** (Whitsaber→you) + `SET` bit 3. (Answer `n` → *"No
   pirate would willingly give up the key to such a treasure!"*)
   - `map` **before** bit 2 → *"What are you insinuating?"* (no offer). `map` **after** bit 3 → *"I gave
     you the map. What more do you want?"*

**★ Rune + Mantra of Honor (main quest):**
- `rune` → *"The Rune of Honor? Why, it is on a pedestal in the center of town!"* + *"Even though the
  rune is our most prized possession, we do not guard it!"* → a y/n aside: Trinsic doesn't guard it
  because *"None here would be dishonorable enough to steal it. And surely, if any took the rune, they
  would do the honorable thing and return it afterwards!"* So the **Rune of Honor sits openly on a
  pedestal in the center of Trinsic.**
- `mant` → *"The Mantra of Honor? …Oh yes, I remember now. It's 'summ.'"* → **Mantra of Honor = "summ."**

**Other topics:** `name` → *"I am Lord Whitsaber, mayor of this honorable town!"* (`SET` bit 0); `job`
→ governs Trinsic, the Town of @Honor; `trin`/`town`/`hono` → honor flavor ("*thy own example guides us
all*"); `pira` → *"Me, a pirate? Absurd!"* (laughs, "*but you sense a trace of fear*"); `bye` → warmer
once bit 2 (*"Thou hast my thanks!"*), else *"Good $T, Avatar."* + `LEAVE`.

**Actions:** `SET`/`TST` self bits 0/2/3; `TRANSFEROBJ` obj 401 (Whitsaber→Avatar); three `GET` "yn"
prompts (the pirate confession, the rune-why-unguarded aside, the map "Agreed?"); `LEAVE`. **Quest
payload (★ thread 2 + main quest):** holds **map-piece obj 401**, released by the Sandy-secret
blackmail (confess `y` → ask `map` → `y`). Independently sources **Honor: the rune on a pedestal in
Trinsic's center + the mantra "summ."**

---

<a id="npc-77"></a>

## Lawrence — npcId 77 (`converse.a`), 1,993 bytes — Trinsic tavernkeeper (the Fool's Pair o' Dice)

**You see** "a small, fussy looking man." At **~(418,803,z=0)** — **Trinsic**, behind the bar of the
**Fool's Pair o' Dice**. Self-ref self = 77; bit 0 = met. A **food/drink vendor**.

**Topics:** `name` → "It's Lawrence." (`SET` bit 0); `job`/`buy` → "I sell @grapes, @ale, @mead,
@wine, and @rations." Each routes to a party-aware buy loop (asks "Which of you?" / a quantity, charges
gold obj 88, `GIVEOBJ` the goods):
- `grap` — **grapes (obj 95), 3 gold**.
- `ale` / `mead` / `wine` — **bottles, 1 gold each**.
- `rati` — **rations (obj 129), 4 gold apiece**, buy up to 200 ("How many do you want?").
- `no`/`bye` → "Goodbye." `LEAVE`; `*` → "I can't help you with that."

**Actions:** `SET` self bit 0; `TAKEOBJ` gold (obj 88) / `GIVEOBJ` grapes(95)/rations(129)/bottles;
party-member + quantity pickers (`GETDIGIT`/`GETINT`); `LEAVE`. **Quest payload:** ✗ none — a tavern
provisions vendor (the Fool's Pair o' Dice). Flavor / supplies.

---

<a id="npc-78"></a>

## Harold — npcId 78 (`converse.a`), 654 bytes — Trinsic farrier (horseshoes)

**You see** "a tall, muscular man with a solemn look on his face." At **~(419,746,z=0)** — **Trinsic**.
Self-ref self = 78; bit 0 = met. A **farrier**.

**Topics:** `name` → "My name is Harold." (`SET` bit 0); `job` → "@Horseshoes are my living."; `buy`/
`hors`/`shoe` → the buy: "It'll cost you 2 gold for the horseshoes, interested?" → `y` → `TAKEOBJ`
2 gold (obj 88) + `GIVEOBJ` **horseshoes (obj 202)**; `n` → "Very well."; `bye` → "Farewell." `LEAVE`;
`*` → "I can't help you with that."

**Actions:** `SET` self bit 0; `TAKEOBJ` gold (obj 88) / `GIVEOBJ` obj 202; `LEAVE`. **Quest payload:**
✗ none — sells **horseshoes** (pairs with Immanuelle's stables). Flavor / vendor.

---

<a id="npc-79"></a>

## Brandon — npcId 79 (`converse.a`), 2,991 bytes — Trinsic weaponsmith (a journeyman)

**You see** "a golden-haired young man." At **~(427,752,z=0)** — **Trinsic**. Self-ref self = 79; bit 0
= met. A starstruck **weaponsmith** ("You've come to me to aid thee in thy quest! What an honor!").

**Topics:** `buy` → "@arms or @armor?"; `arms`/`armo` → the buy loop (gated on **shop hours** — outside
them, "Come by my shop when I'm open!"); `sell` → a sell loop; `job` → "just a weaponsmith—and only a
@journeyman"; `jour` → "a few years ago I was a simple apprentice. Now I @supply arms to all Trinsic!";
`name` → "My name's Brandon"; **`join` → "That would be a great honor! …But no, I can't. I've
responsibilites here, especially @now."** (**not recruitable**); `now`/`supp` → "I have to make
@weapons to help fight the gargoyles!"; `bye`/`noth` → "Farewell! May thy quest succeed, Avatar!"
`LEAVE`.

**Stock** (buy/sell tables): Mace · Main Gauche · Sword · 2-Hnd Axe · 2-Hnd Hammer · 2-Hnd Sword ·
Iron Helm · Kite Shield · Magic Armour · Magic Helm · Plate Mail (prices per the embedded table; gold
obj 88).

**Actions:** `SET` self bit 0; full `TAKEOBJ`/`GIVEOBJ`/`MOVEOBJ` buy+sell machinery (party + item
pickers, weight/affordability checks); `LEAVE`. **Quest payload:** ✗ none — Trinsic's arms & armour
vendor; declines to join; "weapons to fight the gargoyles" is flavor.

---

<a id="npc-81"></a>

## Tobatha — npcId 81 (`converse.a`), 3,568 bytes — Trinsic healer (heal / cure / resurrect)

**You see** "a doddering old woman." At **~(437,796,z=0)** — **Trinsic**. Self-ref self = 81; bit 0 =
met. A cantankerous **healer** ("a mender of the @inflicted") who insists you call her **"maam."**

**Services** (all party-aware, charged in gold obj 88):
- `heal` → "Wilt thou make an offering of **30 gold**?" → `TAKEOBJ` 30 + `HEAL`. **Free at karma ≥ 40**
  ("Thou art not too bad, for a youngster"); below 40 she refuses ("everything should be free!").
- `cure` (poison) → "an offering of **10 gold**" → `TAKEOBJ` 10 + `CURE`. Same karma-≥-40 free gate.
- `resu` / `raise` → resurrect: needs a **corpse (obj 339)** carried (`WHOSGOT`); "an offering of
  **400 gold**" (the party takes up a collection) → `TAKEOBJ` up to 400 + `RESURRECT` ("Doman… thixus…
  anretu!" → "the dead live again!"). No corpse → "There ain't no dead person here!"; **no gold → "go
  see a gravedigger, I'll reckon his price'll be lower."**

**Other topics:** `name` → "@Tobatha… but you can call me @maam" (`SET` bit 0); `toba`/`maam` → a
manners gag; `job`/`infl` → "I can @heal, @cure, and even @raise dead!"; `than` → grumpy; `bye`/`no` →
"not so much as a @thank-you… kids today!" `LEAVE`.

**Actions:** `SET` self bit 0; `TEST_OBJ`/`TAKEOBJ` gold (obj 88); `WHOSGOT` obj 339 (corpse); `HEAL` /
`CURE` / `RESURRECT`; a karma gate (`#K < 40`); `LEAVE`. **Quest payload:** ✗ none — a paid healer
(heal/cure/resurrect; free heal/cure at high karma). Corroborates the **gravedigger = cheaper
resurrection** lead (cf. Dargoth).

---

<a id="npc-146"></a>

## Glen — npcId 146 (`converse.b`), 3,708 bytes — Empath Abbey mortician (cremation + the Mole feud)

**You see** "a quiet, pale, almost motionless gentleman." At **Empath Abbey**. **Glen D'Arc**, of the
"Trinsic D'Arcs" — a vampire-flavored **undertaker** who left Trinsic ("too sunny"), prefers moonlight,
and sighs that "only the dead know true peace." Self-ref self = 235; bit 0 = met; bits 2-6 track the
Mole errand chain.

**Cremation service:** carrying a **corpse (obj 339, `WHOSGOT`)** opens his pitch — a "new process called
cremation": for **15 gold** he `TAKEOBJ`s the body + gold and `GIVEOBJ`s an **urn (obj 170)** ("an eerie
green flame… nothing but ashes remain"). Refuses if you're short on gold.

**★ The Mole errand (a relay sidequest):** Glen employs **Mole** (the abbey gravedigger, **npc 178**) and
the two won't speak — you carry messages back and forth (`inco`/`grav`/`mole` starts it): "Mole was
supposed to have two more graves finished… tell him I need those graves dug immediately!" Then a chain
(tracked by bits on npc 178 + self): Mole needs a shovel → Glen: "use the one I gave him" → it broke →
"he should have bought another" → equipment allowance → Glen finally agrees to pay Mole and **rewards
you**: "that mage on the table was found just outside town… carrying a couple of enchanted items and some
money… nobody can find his relatives, so take it all."

**Other topics:** `name` (Glen D'Arc); `trin`/`darc` (left Trinsic, too sunny); `sun`/`prep`/`bod`
(embalming with "Frigid Solvol"); `eter`/`rest`/`dead` (death-loving banter, offers grapes); `job`
(prepares the departed); `bye`.

**Actions:** `SET`/`TST` self bits 0/2-6 + bits on npc 178 (the relay state); `WHOSGOT` obj 339;
`TAKEOBJ` corpse(339)/gold(88) + `GIVEOBJ` urn(170); the Mole-errand reward (a mage's items + gold);
`LEAVE`. **Quest payload:** ✗ no map piece. A **mortician** (cremation: corpse → urn, 15g) + the
**Mole-the-gravedigger relay sidequest** (reward = a slain mage's enchanted gear + gold). **Mole (npc 178)
is the abbey's gravedigger** — likely the "see a gravedigger" figure Tobatha/Dargoth point to.

---

<a id="npc-148"></a>

## Stephanie — npcId 148 (`converse.b`), 3,575 bytes — Empath Abbey healer (a blind seeress)

**You see** "a young woman who stares into the distance." At **Empath Abbey**. **Stephanie** ("call me
Steph") — **blind since birth** (per her brother **Faren**, npc 149), a gentle healer who "senses" your
wounds. Self-ref self = 235; bit 0 = met. Services are **shop-hours gated** ("Come to my shop when I'm
open!").

**Services** (party-aware, gold obj 88):
- `heal` → "Will you make an offering of **25 gold**?" → `TAKEOBJ` 25 + `HEAL`. **Free at karma ≥ 40**
  ("I sense your cause is a just one") — she heals the penniless-but-worthy for nothing.
- `cure` (poison) → "an offering of **5 gold**" → `TAKEOBJ` 5 + `CURE`. Same karma-≥-40 free gate.
- `resu` → resurrect: needs a **corpse (obj 339)**; "an offering of **350 gold**" (party collection) →
  `TAKEOBJ` up to 350 + `RESURRECT` ("Doman… thixus… anretu!" — the same incantation as Tobatha).

**Other topics:** `name` ("Steph"); `job` ("we have no jobs here… but I can heal, cure and resurrect");
`bye`.

**Actions:** `SET`/`TST` self bit 0; `WOUNDED`/`POISONNED` checks; `TEST_OBJ`/`TAKEOBJ` gold (obj 88);
`WHOSGOT` obj 339; `HEAL`/`CURE`/`RESURRECT`; karma gate (`#K < 40`); shop-hours gate; `LEAVE`. **Quest
payload:** ✗ no map piece. The Empath Abbey **healer** (heal 25g / cure 5g / resurrect 350g; free
heal/cure at high karma) — a gentler, cheaper counterpart to Trinsic's Tobatha. **Faren's** sister.

---

<a id="npc-149"></a>

## Faren — npcId 149 (`converse.b`), 1,930 bytes — Empath Abbey wine-seller (Stephanie's brother)

**You see** "a good looking young man with a wine glass in his hand." At **Empath Abbey**. **Faren**
("Faren the drunk, as some call me" — "just kidding"), the abbey's **wine-seller** ("I sell many types of
wine, made right here"). Self-ref self = 235; bit 0 = met.

**Wine shop:** `buy`/`wine` → a party-aware buy loop over the abbey's list (embedded table): **White Wine
· Red Wine · Dry Wine · Sweet Wine · Abbey Red · Abbey Dry** (20-100 gold; `TAKEOBJ` gold 88 → `GIVEOBJ`
the bottle, with a carry-weight check).

**Other topics:** `name` (Faren); `drun` ("just kidding"); `fare`/`sist`/`step` → **Stephanie (npc 148)
is his sister**, "a beautiful lass… she is **blind**, has been since birth"; `blin`/`garg` → a thoughtful
musing — being blind is "like being born a gargoyle… we know them more by the ways they differ from us,
rather than their similarities" (a quiet nod to the main quest's **gargoyle-reconciliation** theme);
`job` (wine, made on-site); `bye`.

**Actions:** `SET`/`TST` self bit 0; the wine buy loop (`TAKEOBJ` gold 88 / `GIVEOBJ` bottle +
`CANCARRY`/`WEIGHT` checks); `LEAVE`. **Quest payload:** ✗ no map piece. The Empath Abbey **wine-seller**
(the famous abbey wine), **Stephanie's brother**; the gargoyle musing is thematic flavor, not a lead.

---

<a id="npc-150"></a>

## Zeke — npcId 150 (`converse.b`), 2,345 bytes — Empath Abbey beekeeper (the one-armed)

**You see** "a strong looking man with just one arm." At **Empath Abbey**. **Zeke the one-armed
beekeeper** — lost his arm "in battle" thwarting **Mondain** (a grizzled veteran who muses that today's
children take the Avatar's protection for granted). Self-ref self = 235; bit 0 = met.

**Honey trade:** `buy`/`hone` → **honey (obj 184) for 10 gold** (party-aware, weight-checked); `sell`
→ he buys a **honey jar (obj 183) for 7 gold**. `bee`/`hive` → he buys his straw hives from **Michelle
in Minoc** (the basket-weaver / balloon-basket NPC, npc 68).

**Other topics:** `name`/`zeke` (the one-armed beekeep); `batt`/`mond` (Mondain lore); `job` (beekeeper);
`bye`.

**Actions:** `SET`/`TST` self bit 0; honey buy/sell (`TAKEOBJ`/`GIVEOBJ` obj 184/183 ↔ gold 88); `LEAVE`.
**Quest payload:** ✗ no map piece. The abbey **beekeeper** (honey vendor). Cross-link: buys hives from
**Michelle** (Minoc, npc 68).

---

<a id="npc-151"></a>

## Eckhart — npcId 151 (`converse.b`), 1,624 bytes — Empath Abbey vinekeeper (Brotherhood of the Rose)

**You see** "a gnarled man with knobby muscles," pruning the vineyard. At **Empath Abbey**. **Eckhart the
vinekeeper** — tends the garden + vines; the abbey is the **Brotherhood of the Rose** (druids planted its
rosebushes centuries ago). Self-ref self = 235; bit 0 = met; bit 7 = gave you grapes.

**Topics:** `name` (Eckhart vinekeeper); `job`/`gard`/`care` (the garden + the Brotherhood-of-the-Rose
history); `vine`/`tend`/`seed`/`less` → **seedless grapes**, an enchantment the **enchanter** made ("now
I graft seedless grapevines onto rootstocks"); `nico`/`ench` → **Nicodemus** "lives east of here, between
two rivers, due north of Britain" (restates the standing Nicodemus lead); `grap` → gives you a **free
bunch of table grapes (obj 95)** once (a Dupre wine-vs-mead party-banter fires here); `wine`/`fare` →
**Faren** the winemaker (npc 149); `bees`/`hone` → **Zeke** (npc 150); `bye`.

**Actions:** `SET`/`TST` self bits 0/7; `GIVEOBJ` table grapes (obj 95) with a carry-weight gate;
`SHOW_CONVERSE` Dupre banter; `LEAVE`. **Quest payload:** ✗ no map piece. The abbey **vinekeeper**
(seedless grapes, free table grapes); restates the **Nicodemus** location lead.

---

<a id="npc-178"></a>

## Mole — npcId 178 (`converse.b`), 2,842 bytes — Empath Abbey gravedigger (the Glen relay + the shovel)

**You see** "a coarse looking individual" (+ "digging in the dirt with his bare hands" until he has a
shovel). At **Empath Abbey**. **Mole** — the **gravedigger**, working for his master **Glen** (npc 146);
a simple man whose family has "dug for generations" ("a good shovel is more important than a good wife").
Self-ref self = 235; bits on Glen (146) + self track the relay. Carrying a **corpse (obj 339)** he turns
you away: "go see me master Glen about a funeral first."

**★ The Glen relay — resolved by a shovel:** Mole is the other half of Glen's feud (npc 146). Each side
fires a relay line (Mole: "wants his graves dug? I'd do better with a **shovel**!" → it broke → Glen
never paid → "old penny pincher says he'll pay me?"). **The fix: GIVE Mole a shovel (obj 104)** —
`give`/`shov` with one in hand → "Is it for me?" → `y` → `TAKEOBJ` shovel(104); he thanks you, **sets
the whole relay's flags done**, *and* drops a dark hint: **"keep an eye on old Glen — they say not all of
the bodies end up where they're supposed to… nobody knows what he keeps in that back room of his."**

**Other topics:** `name` (Mole); `dig`/`grav`/`dirt`/`kind` (the dirt-and-graves trade, learned from his
father); `trad`/`job` (digs graves for Glen); `tool`/`wife` (shovel banter); `mast`/`glen` ("a strange
one… nobody knows what he keeps in that back room"); `bye`.

**Actions:** `SET`/`TST` self bits 2-7 + Glen's (146) bits 2-6 (the relay state); `WHOSGOT`/`TAKEOBJ`
shovel (obj 104); `WHOSGOT` corpse (obj 339) gate; `LEAVE`. **Quest payload:** ✗ no map piece. The abbey
**gravedigger**; the Glen-Mole sidequest completes by **giving Mole a shovel (obj 104)**, which also
surfaces a **"Glen is hiding something" thread** (his back room / missing bodies). Note: Mole **digs
graves, he does NOT resurrect** — so he is *not* the "cheap resurrection" gravedigger Tobatha/Dargoth
point to.

---

<a id="npc-179"></a>

## Sionnach — npcId 179 (`converse.b`), 2,703 bytes — Empath Abbey troubadour (the Ballad of the Virtuous)

**You see** "a troubadour with a drum. His tailored suit is travel-worn but bright." A wandering bard
visiting **Empath Abbey**, **Sionnach** (pronounced 'ShaNOK'), busy **courting Sylaina** (npc 147 — if
she's on-screen he's "indisposed… I hate to keep my dear one waiting"). Greets **Iolo** warmly ("It has
been a while, Master Iolo"). Self-ref self = 235; bit 0 = met.

**Topics:** `name` (Sionnach); `job`/`drum` → a drummer + singer who offers a **"battle summons"** drum
demo; `batt`/`summ` → drum-language lore (Lord Fennian's army drums — "read it in a book at the
Lycaeum"); `book`/`lyca` → maritime histories → "the songs of different @ships."
- **★ `song`/`ship`** → "Storms have brought down many a haughty vessel: the evil **Empire**, the
  **Dutchman**, the **Virtuous**…"; `dutc`/`empi` → "I don't know where she rests, ask other bards —
  there's probably **great treasure** on her, and on the Virtuous too."
- **★ `sing`/`virt`** → **"The Ballad of the Virtuous"**: a southerner from **Serpent's Hold**, young
  **Captain Keegan**, slew a pirate crew of eight and claimed the *Bitter Kate*, renaming her the
  *Virtuous*; the pirate *Barston Bay* sank her at **Loch Lake** — "while on **Loch Lake's** shore the
  Virtuous lays" (Keegan "sleeps the endless sleep"). A **sunken-ship treasure lead**.

**Actions:** `SET`/`TST` self bit 0; `ISONSCREEN` Sylaina gate; `SHOW_CONVERSE` Iolo banter; a `GET`
y/n for the drum demo; `LEAVE`. **Quest payload:** ✗ no map piece. A **bard** whose songs point to
**sunken treasure ships** — the *Virtuous* (Capt. Keegan) at **Loch Lake**, plus the *Dutchman* + the
*Empire*. Possibly the "one [map-piece holder] **died in a shipwreck**" of Homer's list — chase Loch Lake.

---

<a id="npc-54"></a>

## Ben — npcId 54 (`converse.a`), 2,284 bytes — the forest lumberman ("Big Ben")

**You see** "a man as large as the trees that surround his cottage." **Ben** ("my friends call me Big
Ben"), a gruff **lumberman** whose cottage sits in the forest **W of Yew, near Empath Abbey** (the "Ben
the logger" Lenora points to). Suspicious of intruders — barging into his house makes him heft his axe
("accidents happen…"); he assumes you're **from the king**, sent to recruit him "to be good at wittlin'
on men" after he won a chopping contest, and **refuses** ("tell him I'm not interested"). Answering "no,
not from the king" warms him up. Self-ref self = 235; bit 1 = wary/hostile.

**★ Buy a yew log:** `buy`/`wood`/`log`/`yew` → "Logs is **5 gold** apiece" → `y` → `TAKEOBJ` 5 gold +
`GIVEOBJ` a **yew log (obj 274)** ("a fine yew log"), party-aware (carry-weight + gold checks). This is
the **raw material for the panpipes**: yew log → **Aaron's sawmill** (Minoc) cuts it to a board →
**Julia** carves the panpipes → joins the Minoc artisan guild → the **Rune of Sacrifice** (thread 3).

**Other topics:** `name`/`big`/`ben` ("don't wear it out"); `frie` (friends surprise him); `job`/`fore`
(lumberman, dislikes strangers in his woods); `war`/`alon`/`king` (refuses the king's war-recruiting);
`bye`.

**Actions:** `SET`/`CLR`/`TST` self bits 0/1 (the wary-of-intruders flag); the king y/n gate; the log
buy (`TAKEOBJ` gold 88 / `GIVEOBJ` obj 274 + `CANCARRY`/`WEIGHT`); `LEAVE`. **Quest payload:** ★ sells
the **yew log (obj 274, 5g)** — the start of the **panpipes → Rune of Sacrifice** chain (thread 3). Not
a map-piece holder; the king/war refusal is flavor.

---

<a id="npc-102"></a>

## Marissa — npcId 102 (`converse.b`), 3,307 bytes — Paws seamstress (★ the balloon silk bag)

**You see** "a finely adorned woman with a tight mouth and wide eyes." At **Paws**. **Marissa** ("you may
call me Miss Trihune") — a haughty high-fashion **seamstress** ("garments fit to see the King in").
Self-ref self = 235; bit 0 = met. Shop-hours gated ("my shop is closed for now").

**★ The balloon silk bag (thread 6).** `ball`/`mamm`/`bag`/`plan` → "A large silk bag… since it is
important, I'll do it." She needs **both**:
- the **balloon plans (obj 270)** in hand (`WHOSGOT` — "I'll need to see the plans"), AND
- a **bolt of silk (obj 241)** (`WHOSGOT` — "I'll need a @bolt of silk").
With both → **75 gold** → `TAKEOBJ` gold + the silk bolt (241) → "following the balloon plans… completes
the silk bag" → `GIVEOBJ` the **silk bag / balloon envelope (obj 421)**.

**★ How to get the silk bolt** (`bolt`): spidersilk → **Arbeth** (a Paws threadmaker, **npc 103**) spins
it into thread → **Charlotte** of **New Magincia** weaves the thread into a bolt of silk cloth → bring
the bolt to Marissa. (`arbe` → "I get all my thread straight from Arbeth.")

**Vendor side:** `buy`/`tuni`/`dres`/`pant` → sews **Tunic / Dress / Pants** (party-aware buy loop, gold
obj 88); `sell` → buys cloth (obj 185) for 20g; `silk` → "silk is out of fashion"; `job`/`fash` →
high-fashion garments; `bye`.

**Actions:** `SET`/`TST` self bit 0; `WHOSGOT` obj 270 (plans) + obj 241 (silk bolt); `TAKEOBJ`
gold(88)/silk-bolt(241) → `GIVEOBJ` **obj 421** (silk bag); clothes buy/sell (`TAKEOBJ`/`GIVEOBJ` obj
185); shop-hours gate; `LEAVE`. **Quest payload (★ thread 6):** **makes the balloon envelope (silk bag,
obj 421)** from the **balloon plans (270)** + a **silk bolt (241)** + 75g. Silk-bolt chain: **Arbeth**
(103, Paws) → **Charlotte** (New Magincia). Still gated on the **balloon plans (obj 270)** — source open.

---

<a id="npc-103"></a>

## Arbeth — npcId 103 (`converse.b`), 3,517 bytes — Paws spinner (★ the balloon silk-thread step)

**You see** "a frightened little man who never looks you in the eye." At **Paws**. **Arbeth** — a timid,
nervous **spinner** ("I make @wool into @thread") who flinches as if expecting to be beaten. Self-ref
self = 235; bit 0 = met. Shop-hours gated.

**★ Spin spidersilk → silk thread (thread 6).** `spid`/`silk`/`plan`/`ball` → "I could spin spidersilk
into thread. Do you want me to?" → y → he needs **40 bits of spidersilk (obj 71)** + **20 gold**
("twoscore bits… come back when thou hast 40 pieces"). With both → `TAKEOBJ` gold(20) + spidersilk(71 ×40)
→ "a spool of fine silk thread!" → `GIVEOBJ` a **silk thread spool (obj 226)** → "You'll have to find a
**@weaver**, of course…"

**★ The weaver step:** `weav` → "I'm not a weaver, just a spinner. Talk to **@Thindle**." `thin` →
"**Thindle** lives here in Paws and is a fine weaver." *(Marissa instead names **Charlotte** of New
Magincia — either weaver turns the thread spool into the **silk-cloth bolt (obj 241)** Marissa needs.)*

**Vendor side:** `buy`/`thre` → sells a **thread spool (obj 225)** for 3g; `sell`/`wool` → buys **wool
(obj 190)**; `job`/`shop` → a spinner.

**Flavor (the Paws folk):** `timo` (Timothy) "is nice to me"; `mort` (Mortude) "much too loud" (then a
terrified backpedal — he fears Mortude); `meri` (Merideth) "I like her — she brought me cookies once";
others "alright, I guess"; `bye`.

**Actions:** `SET`/`TST` self bit 0; `TEST_OBJ`/`TAKEOBJ` spidersilk(71)/gold(88) → `GIVEOBJ` silk thread
spool (obj 226); thread/wool buy-sell (obj 225/190); shop-hours gate; `LEAVE`. **Quest payload (★ thread
6):** spins **40 spidersilk (obj 71) + 20g → a silk thread spool (obj 226)**; then a **weaver** —
**Thindle** (npc 100, Paws) or **Charlotte** (New Magincia) — weaves it into the **silk bolt (obj 241)**
for **Marissa**'s balloon bag. (Spidersilk source: spiders — likely the **Spider Cave** (92,250).)
*(Update: Thindle turns out to NOT do silk — see his entry; the silk weaver is **Charlotte** only.)*

---

<a id="npc-100"></a>

## Thindle — npcId 100 (`converse.b`), 2,762 bytes — Paws weaver (redirects silk to Charlotte)

**You see** "a little, white haired man hunched over with age." At **Paws**. **Thindle "the spindler"** —
a whimsical, rhyming old **weaver** ("Sew, sew, I @sew 'cause I said so"). Self-ref self = 235; bit 0 =
met. Shop-hours gated.

**★ The silk redirect (thread 6).** `silk`/`bag`/`ball` → "**Silk? Oh no, oh no. Can't work silk… See
@Charlotte. She can!**"; `char` → "Humble **Charlotte**… she lives in **New Magincia**." So although
Arbeth (npc 103) names Thindle as "a weaver," **Thindle cannot weave silk** — the silk-bolt step belongs
to **Charlotte (New Magincia)** alone. Thindle weaves only ordinary cloth.

**Vendor side:** `buy` → sells **cloth (obj 185)** for 15g; `sell` → buys **thread (obj 225)** for 6g;
`job`/`sew` → a weaver.

**Flavor:** `mort` (Mortude) → "Shorty is my friend. We play **@flippits**"; `flip`/`bone`/`pea`/`hat` →
a long whimsical lesson in the pea-into-a-hat game "flippits" (easter egg); `bye` → "Say hi to Mortude."

**Actions:** `SET`/`TST` self bit 0; cloth/thread buy-sell (`TAKEOBJ`/`GIVEOBJ` obj 185 ↔ gold 88; buys
thread 225); shop-hours gate; `LEAVE`. **Quest payload:** ✗ no item. **Redirects the balloon silk-bolt
weaving to Charlotte (New Magincia)** — Thindle does only plain cloth, not silk. A cloth/thread vendor +
the *flippits* easter egg; friends with **Mortude**.

---

<a id="npc-180"></a>

## Mandrake — npcId 180 (`converse.b`), 5,403 bytes — a wandering minstrel (★ the gargoyle "Beh Lem" lead)

**You see** "a charming fellow with a peacock feather in his cap." A traveling **minstrel** (~Paws / the
King's Way) who "spreads news, tales and songs." Self-ref self = 235; bit 0 = met.

**★ Captured by gargoyles → freed by "Beh Lem" (thread 4).** `trav`/`impo`/`news` → "I was **captured by
the gargoyles** and taken to the other side of the world… but **one of them helped me escape**. He spoke
little of our tongue — his name was **'Beh Lem.'**" → another **friendly gargoyle / human↔gargoyle
bridge** (cf. Sin'Vraal, Captain John).

**The "eight virtues" joke (resolves Sinjen's lead).** `stuf`/`prin`/`wine`/`wome` → "Had it been up to
me I'd have chosen **wine, women and song**… the eight virtues of **drunkenness, sensuality, harmony,
lust, laziness, dance, indulgence, and happiness**." This is the **"Mandrake's version of the eight
virtues"** that **Sinjen (181)** name-dropped — pure comedy, **flavor, not a mechanic.**

**Other:** `garg` → gargoyles hold the shrines; `eigh`/`virt` → lists the 8 virtues; tavern lore (Fallen
Virgin @ Buccaneer's Den, Sword & Keg @ Jhelom, Blue Bottle @ Moonglow, the **Cat's Lair @ Paws**);
**songs**/**tales** (paid, flavor) — the tales mention the pirate ship **Empire** + the **giant ants in
the Dry Land** + "the secret of the wisps." `bye`.

**Actions:** `SET`/`TST` self bit 0; paid song/tale (`GETINT` donation → `TAKEOBJ` gold 88); `LEAVE`.
**Quest payload:** ✗ no item. ★ **Beh Lem** — a friendly gargoyle who freed him (thread 4 lead). Sinjen's
"Mandrake's virtues" = flavor. Color on the Dry Land (giant ants) + the Empire wreck.

---

<a id="npc-110"></a>

## Dr. Cat — npcId 110 (`converse.b`), 7,032 bytes — keeper of the Cat's Lair (Paws)

**You see** "an amused looking gentleman." Keeper of the **Cat's Lair** tavern in **Paws** — a cat-loving
gamesman, and **Taynith**'s (npc 136) dearest friend (when Taynith is in, "the bar's closed… we have a
lot to talk about"). Picked Paws "midway between Britain and Trinsic on the King's Way." Self-ref self =
235; bit 0 = met; bit 2 = sold him Snilwit's book.

**The duck (resolves Taynith's lead).** `duck` → a free ale + the story: "Taynith bet me I couldn't catch
a duck bare-handed… so I did, leashed it, and gave it to her as a pet. I doubt she still has it — I saw
**Zoltan** eyeing it hungrily." → the "ask him about the duck" Taynith named = **flavor** (a free ale,
obj 117).

**Games.** `indu`/`game` → he loves a challenge; plays **Nim** (10 beads, take 1-3, last wins — a wager
minigame); `snil`/`book` → wants **"Snilwit's Big Book of Boardgame Strategy" (obj 151, quality 70)** and
**buys it** for gold (per-weight) if you have one; points to Thindle/Mortude for flippits.

**Vendor:** `buy`/`sell` → **ale / mead / wine** (crowns), **milk** (5 crowns — "good for the cats"),
**mutton** (3g/serving). `tayn`/`gyps`/`zolt` → Taynith rides with **Zoltan**'s band (don't confuse it
with the pickpocket gypsies); `mand` → "that deadbeat Mandrake owes me for drinks"; `bye`.

**Actions:** `SET`/`TST` self bits 0/2-7; tavern buy/sell (`TAKEOBJ`/`GIVEOBJ` drinks/milk(180)/mutton(129)
↔ gold 88); free ale (obj 117) on `duck`; the Nim wager (`GETINT` + win/lose gold); `WHOSGOT`/`TAKEOBJ`
Snilwit's book (obj 151 q70) → pays gold. **Quest payload:** ✗ no major item — the Paws **tavernkeeper**
(Taynith's friend). The "duck" = flavor; **buys Snilwit's boardgame book (obj 151 q70)**; Nim minigame.

---

<a id="npc-101"></a>

## Mortude — npcId 101 (`converse.b`), 1,408 bytes — Paws ropemaker

**You see** "a man nearly as wide as he is tall." At **Paws** — a gruff, grumbling **ropemaker**
("'@Mortude the Ropemaker,' as the sign on my door reads"). Self-ref self = 235; bit 0 = met.

**Vendor.** `buy`/`make`/`rope` → "**The strongest you'll ever tug!**" When his shop is open, the
party-aware buy loop takes **5 gold (obj 88)** and hands over **rope (obj 284)**; outside shop hours →
"Come to my shop when I'm open." A capacity check ("You look pretty full to me") gates the give.

**The flippits easter egg.** `thin` (Thindle) → "He's a pretty good **@flippits**, player"; `flip` →
"You have a **@bone** on ya? We'll play"; `bone`/`old,dog` → wants a small old dog bone "and maybe a
**@hat**"; `hat` → "Never played 'ave ya?" — the same bone-in-a-hat dice game Thindle (100) gushes about.
Pure color.

**Actions:** `SET`/`TST` self bit 0; shop-hours gate; the buy loop `TAKEOBJ` gold 88 ×5 → `GIVEOBJ`
**rope (obj 284)**; `LEAVE`. **Quest payload:** ✗ no quest item — a rope vendor (5g) + the *flippits*
running gag. Friends with **Thindle**.

---

<a id="npc-106"></a>

## Merideth — npcId 106 (`converse.b`), 1,026 bytes — a Paws child (flavor)

**You see** "a little girl with a doll in her hands." At **Paws** — **Merideth Cassandra Lamby**, a small
girl who talks to and through her doll **Becky** ("'See, Becky, they've come back,' she says to her doll").
Self-ref self = 235; bit 0 = met (set when she gives her name).

**Child's-eye gossip on the Paws folk.** `job` → "Oh, I don't work. My **@Memah** can help you though";
`mema` → "My grandma. She's around here somewhere." She characterizes the neighbours: `timo` (Timothy)
"got me this doll"; `shor`/`mort` (Mortude) "put a rope in a tree for me to swing on"; `mari` (Marissa)
"a mean woman, never plays dolls"; `arbe` (Arbeth) "my **secret friend** — he tells me stories"; `gris`
→ "I think he is a **ghost**. He's scary" (a child's framing); `hend` (Hendle) "doesn't smell too good";
`uber` (Ubermon) "brings my Memah flowers sometimes." Named after a `grea`/`aunt` who "lives far away."

**Actions:** `SET`/`TST` self bit 0; `LEAVE` on `bye`; no items, no flags beyond met. **Quest payload:**
✗ none — pure flavor. (Color only: an unnamed **grandmother "Memah"** is implied nearby, and a "ghost"
**Gris** is the child's name for someone — neither surfaced as a quest hook here.)

---

<a id="npc-107"></a>

## Hendle — npcId 107 (`converse.b`), 1,484 bytes — Paws slaughterman / butcher

**You see** "a man whose pungent smell greets you before he can." At **Paws** — **Hendle the
Slaughterman**, a cheerful butcher who jokes that his trade "makes me a bit unpopular 'ere in the pub!"
Has a `<PREFIX>` block; self-ref self = 235; bit 0 = met.

**Vendor.** `buy`/`meat` (in-shop) → a 6-item meat menu, party-aware buy loop taking **gold (obj 88)**:
**1. Ham / 2. Bacon** (obj 133), **3. Pork Chops** (obj 129), **4. Brisket / 5. Steak** (obj 209),
**6. Ribs** (obj 210); price per item from his cost table, with carry/gold checks. Out of shop hours →
"come to my shop later, I'll fix ya up."

**Actions:** `SET`/`TST` self bit 0; shop-hours gate; meat buy loop (`TAKEOBJ` gold 88 → `GIVEOBJ` the
chosen meat obj). **Quest payload:** ✗ no quest item — the Paws **butcher** (food vendor).

---

<a id="npc-108"></a>

## Ubermon — npcId 108 (`converse.b`), 1,244 bytes — Paws dairyman

**You see** "a tall man with a disarming grin." At **Paws** — **Ubermon Kalbmilch**, a hearty,
mock-German-accented **dairyman** ("I @milk de cows und make de @cheese"). Self-ref self = 235; bit 0 =
met.

**Vendor.** `buy`/`word`/`milk`/`chee` (in-shop) → sells **milk** or **cheese** for "crowns" (gold,
obj 88) via a party-aware buy loop with gold + carry checks; outside hours → "Come by my dairy ven I'm
open, ja?" `job` → the dairy.

**Flavor.** Brings flowers to Merideth's grandma "Memah" (per Merideth, npc 106); warns "Take care among
ze British."

**Actions:** `SET`/`TST` self bit 0; shop-hours gate; milk/cheese buy loop (`TAKEOBJ` gold 88 →
`GIVEOBJ` the dairy obj). **Quest payload:** ✗ no quest item — the Paws **dairy** vendor.

---

<a id="npc-109"></a>

## Timothy — npcId 109 (`converse.b`), 1,102 bytes — Paws innkeeper

**You see** "a man with sea-blue eyes and a warm smile." At **Paws** — **Timothy**, a warm, welcoming
**innkeeper** ("Here for @lodging this fine $T?"). Self-ref self = 235; bit 0 = met.

**Lodging.** `yes`/`room`/`inn`/`lodg` → rents a room for **(party size + 1) × 5 gold**; on payment
(`TAKEOBJ` gold 88) the party **sleeps** (`<REST>` — "You sleep in a comfortable bed… wake rested and eat
a large breakfast"); requires cash in advance.

**Flavor.** Named after his `uncl` **Sir Timothy Enders Daverstock**, a famous `knig`ht remembered for his
`cour`age in `batt`le — "held off a score of men while his own fled to safety across a bridge."

**Actions:** `SET`/`TST` self bit 0; the room loop computes cost = (party+1)×5, `TAKEOBJ` gold 88,
`<REST>`; `LEAVE` on `bye`. **Quest payload:** ✗ no quest item — the Paws **inn** (rest / heal point).

---

<a id="npc-104"></a>

## Grison — npcId 104 (`converse.b`), 2,288 bytes — Paws miller ("Gris," the flour "ghost")

**You see** "a figure covered from head to toe with flour." At **Paws** — **Grison Fairfleth**, the
**miller** ("You can call me 'Gris' if ya prefer"). Shop-hours gated (out of hours → "Come see me at my
gristmill some other time"). Self-ref self = 235; bit 0 = met.

**★ Resolves Merideth's "ghost."** Because he's dusted **head to toe in flour**, the child **Merideth
(106)** calls him a "scary ghost" — he's just the miller. `job` → "I turn @grain into @flour… a bit messy
too."

**Vendor.** `buy`/`flou` → sells **flour (obj 167)** for **4 gold** (party-aware loop, gold + carry
checks); `sell`/`grai` → **buys grain (obj 166)** from the party for **3 crowns** (scans each member for a
grain sack).

**Flavor / the Paws web.** Grew up with **Timothy** ("we were mates"); `mort` "Old Shorty's got a fair
temper"; `mari` (Marissa) "nose to the air instead of the grindstone"; `arbe` (Arbeth) "scared of his own
shadow"; `dori` (Dorin) "baked many a pie with my flour"; `meri` "Meri the wisp, eh? She's sure a cutey"
(an affectionate nickname for Merideth — not the forest wisps); `hend` (Hendle) "always has a good tale";
`uber` (Ubermon) "a strong grip."

**Actions:** `SET`/`TST` self bit 0; shop-hours gate; flour buy loop (`TAKEOBJ` gold 88 ×4 → `GIVEOBJ`
**flour 167**); grain buy-from-player loop (`TEST_OBJ`/`TAKEOBJ` **grain 166** → `GIVEOBJ` gold 88 ×3);
`LEAVE`. **Quest payload:** ✗ no quest item — the Paws **mill** (flour/grain vendor); identity-only payoff
(he is the "ghost" **Gris**).

---

<a id="npc-105"></a>

## Dorin — npcId 105 (`converse.b`), 2,056 bytes — Paws shepherd ("Memah," Merideth's grandmother)

**You see** "a plump older woman with an apron about her waist." At **Paws** — **Dorin** (named after her
mother), a **shepherd** who sells wool. Self-ref self = 235; bit 0 = met.

**★ Resolves Merideth's "Memah."** `job` → "At the moment, only **Meri** and I are here"; `meri` → "She's
my **little angel**. If you see her around here, tell her I have errands to run." So Dorin is the
grandmother **"Memah"** that **Merideth (106)** points to — and `uber` → "I like to go on walks with
**Uby**" confirms **Ubermon (108)** is the suitor who "brings Memah flowers."

**Vendor.** `shee`/`busi` → "We are shepherds. We sell @wool"; `buy`/`sell`/`wool` → sells a **bale of
wool (obj 190)** for **5 gold** (party-aware loop, gold + carry checks).

**Flavor / the Paws web.** `pie` → bakes a **shepherd's pie** (a saved-slice flag, bit 7, toggled — pure
color); `gris` (Grison) "has the best flour in all the land"; `timo` (Timothy) "he and I care for the less
fortunate"; `mort` "Old Shorty… quite a nice little man"; `arbe` (Arbeth) "afraid of the dark"; `hend`
(Hendle) "his smell is quite strong"; `mari` (Marissa) "a bit caught up in herself, but likable."

**Actions:** `SET`/`TST` self bit 0; `SET`/`CLR` self bit 7 (the pie-slice flag); wool buy loop (`TAKEOBJ`
gold 88 ×5 → `GIVEOBJ` **wool 190**); `LEAVE`. **Quest payload:** ✗ no quest item — the Paws **shepherd**
(wool vendor); identity payoff (she is **"Memah,"** Merideth's grandmother, courted by Ubermon).

---

<a id="npc-92"></a>

## Antonio — npcId 92 (`converse.b`), 1,725 bytes — Lord of New Magincia (★★ the Rune of Humility)

**You see** "a gentleman of slight build and refined manners." **Lord Antonio**, governor of **New
Magincia, the city of Humility**. Refined speech ("prithee," "$G"). Self-ref self = 235; bit 0 = met
(set when your name matches his greeting prompt).

**★★ The Rune of Humility (thread 3).** `rune`/`mant`/`humi`/`humb` → "**The most humble one amongst us
knows the mantra. If thou canst find out who that is, tell me, and I will give thee the rune.**" He then
asks **"who is the most humble person in this town?"** → the **correct answer is `Conor` / `Starfalcon`**
→ "Very astute!" and he **`TRANSFEROBJ` the Rune of Humility (obj 249)** self → Avatar. A **wrong guess →
`SUBKARMA` 5** ("'Tis not fitting that thou shouldst guess"). Gated on his still owning the rune
(`<IF> self OWNS obj 249`).

**Flavor.** `job` → "I govern New Magincia"; `hobb`/`magi`/`tric` → a parlor **magic trick** (blows up a
balloon until it bursts and four doves fly off to the compass points — pure color).

**Actions:** `SET`/`TST` self bit 0; `TRANSFEROBJ` **rune 249** self→avatar on the right answer;
`SUBKARMA 5` on a wrong guess; `LEAVE`. **Quest payload:** ★★ **gives the Rune of Humility (obj 249)** —
answer **Conor Starfalcon** (the humblest). Part of the Humility rune+mantra pair (thread 3).

---

<a id="npc-93"></a>

## William — npcId 93 (`converse.b`), 919 bytes — a New Magincia farmer (flavor)

**You see** "an old farmer who looks to have made his peace with life." A contented **farmer** in **New
Magincia**. Self-ref self = 235; bit 0 = met.

**Humility musings + the rune pointer.** `humi`/`humb`/`farm` → "Working the earth is the lowest form of
labor… but it provides food for them as writes books and plays music. Surely 'tis a humble living"; `rune`
→ "**Ask @Antonio**"; `anto` → "the lord of New @Magincia." Carves wooden **hippos** as a hobby ("if I
don't make the purtiest hippos you ever did see, you can call me Mortimer").

**Actions:** `SET`/`TST` self bit 0; `LEAVE`; no items. **Quest payload:** ✗ none — flavor; **points to
Antonio (92)** for the Rune of Humility.

---

<a id="npc-94"></a>

## Conor — npcId 94 (`converse.b`), 1,774 bytes — Conor Starfalcon, fisherman (★★ the humblest; Mantra "lum")

**You see** "a stalwart fellow, with a look of placid concentration." **Conor Starfalcon**, a **fisherman**
in **New Magincia** — and secretly an **ex-guildmaster / warrior** who renounced it all. If **Iolo** is in
the party, "a brief flicker of recognition" passes between them ("we've met before… many years ago").
Self-ref self = 235; bit 0 = met.

**★★ The answer to Antonio's riddle.** He IS the humblest townsperson — `guil`/`kora` → "I used to be a
**guildmaster**, but that was long ago"; `shie`/`war` → "I no longer follow the way of the warrior." He
deflects modestly (`humb`/`humi` → "the one thing I can tell you for certain is that it **isn't me** you're
looking for") — but **"Conor"/"Starfalcon" is the name Antonio (92) wants** for the rune.

**★ The Mantra of Humility + the Shrine.** `mant` → "**The Mantra of Humility is 'lum'.**" `shri` → "The
Shrine of Humility is **far to the southeast**"; he'd take you in his `boat` (down at the beach — "feel free
to borrow it") but it's "too small to weather the high seas." `fish`/`way` → fisherman-as-enlightenment
musings (flavor).

**Actions:** `SET`/`TST` self bit 0; `LEAVE`; no items. **Quest payload:** ★★ the **humblest** (the rune
answer for Antonio) + the **Mantra of Humility "lum"** + a **boat** toward the Shrine of Humility (SE)
(thread 3).

---

<a id="npc-95"></a>

## Charlotte — npcId 95 (`converse.b`), 2,800 bytes — Charlotte Weaver, the silk weaver (★★ thread 6)

**You see** "a pretty young woman with downcast eyes." **Charlotte Weaver**, a shy, self-deprecating
**weaver** in **New Magincia** ("I am not very good, but some people take pity on me and buy my cloth").
Self-ref self = 235; bit 0 = met. Shop-hours gated (busy + closed flags).

**★★ The silk-bolt step (the balloon-bag chain, thread 6).** `silk` → if you hold a **silk thread spool
(obj 226)** she weaves it into the **silk bolt (obj 241)** for **10 gold** (`WHOSGOT 226`; `TAKEOBJ` gold 88
×10 + `TAKEOBJ` thread 226; `GIVEOBJ` **silk cloth 241**) — "Turning to her loom, Charlotte soon weaves the
thread into fine silk cloth." `plan`/`ball`/`bag` → a stateful pointer: holding the **silk cloth (241)** →
"**Take the cloth to @Marissa** [Paws]. Mayhap she can sew it into a bag"; holding **thread (226)** → "I can
weave that silk… then speak with **Marissa**"; otherwise → "If you had some silk thread, go ask **@Arbeth**
[Paws] if he has any to spare." She **names Marissa & Arbeth as living in Paws.**

**Vendor side.** `buy`/`clot` → sells plain **cloth (obj 185)** for **25 gold**; `sell`/`wool` → **buys wool
(obj 190)** at **10 gold/bale**.

**Humility note.** `humb` → "honesty forces me to admit that **I am the humblest person in New Magincia**"
— a candidate, but Antonio's accepted answer is **Conor**, so this is the humility-paradox red herring.

**Actions:** `SET`/`TST` self bit 0; shop-hours gate; **silk weave** (`TAKEOBJ` gold ×10 + thread 226 →
`GIVEOBJ` **bolt 241**); wool buy (`TAKEOBJ` wool 190 → `GIVEOBJ` gold ×10); cloth sell (`TAKEOBJ` gold ×25 →
`GIVEOBJ` cloth 185); `LEAVE`. **Quest payload:** ★★ **weaves the silk bolt (obj 241)** from silk thread
(obj 226) + 10g — the New Magincia link in the balloon-bag chain → on to **Marissa** in Paws (thread 6).

---

<a id="npc-96"></a>

## Dunbar — npcId 96 (`converse.b`), 2,606 bytes — keeper of the Humble Palate (New Magincia tavern)

**You see** "a plump, jovial fellow chewing on a leg of lamb." **Dunbar**, keeper of the **Humble Palate**
tavern in **New Magincia**. Self-ref self = 235; bit 0 = met.

**Vendor.** `buy`/`job` → **fish** (3g/serving, "bought fresh from @Conor"), **ale**/**mead**/**wine**
(crowns), **mutton**/**rations** (4g each, quantity loop, cap 200) — party-aware buy loops taking gold (obj
88), giving fish (obj 265) / mutton ration (obj 129).

**★ The Conor lead.** `humi`/`humb` → "Serving others is the humblest occupation I could imagine"; `cono` →
"I hear he used to be the **head of some important guild**"; `expl`/`stra`/`glow` → "that **strange glow you
can see over by his house at night**" — a nudge toward **Conor** (94) (the humblest, whose house glows).

**Actions:** `SET`/`TST` self bit 0; the drink/fish/ration buy loops (`TAKEOBJ` gold → `GIVEOBJ` the item);
`LEAVE`. **Quest payload:** ✗ no item — a tavern vendor; ★ the **Conor "glow"/ex-guildmaster** lead points
at the humblest-person answer.

---

<a id="npc-97"></a>

## Katrina — npcId 97 (`converse.b`), 2,351 bytes — "the humble peasant Katrina" (★ recruitable)

**You see** "the humble peasant Katrina." A peasant of **New Magincia** — the **Humility** figure, and an
**old acquaintance of the Avatar** ("$P! I had heard that thou hadst returned to our land, but I dared not
believe it!"). Self-ref self = 235; bit 0 = met; bit 2 = was-in-party (re-join prompt).

**★ Recruitable companion.** `join` → **`JOIN` self** (codes 1 at-sea / 2 party-full / 0 ok — "Since thou
dost think it wise, I wilt join"); `leav` → **`LEAVEPARTY`** ("I'll leave my equipment with thee"); both
refuse aboard ship ("no place else to go"). She greets you per state (in-party / met / first-meeting since
your return).

**Humility riddle (declines).** `humb`/`humi`/`most` → "**I cannot answer thy question. 'Twould be vain of
me to answer truthfully, and 'twould be worse to lie.**" — pointedly **won't name the humblest** (so she's
the humility red herring, not Antonio's answer). `job` → "Where once I grazed sheep, now I till the land";
`garg` → the gargoyle threat (lore).

**Actions:** `SET`/`TST` self bits 0/2; `JOIN`/`LEAVEPARTY` self; `LEAVE`; no items. **Quest payload:** ★
**recruitable party member** (the Humility companion). Does not give the rune/mantra and won't answer the
humblest riddle.

---

<a id="npc-98"></a>

## Aurendir — npcId 98 (`converse.b`), 2,050 bytes — a New Magincia shepherd (★ Mantra "lum")

**You see** "a short man dressed in shepherd's clothing." **Aurendir**, a **shepherd** in **New Magincia**
who was once "**Aurendir the mighty**." Self-ref self = 235; bit 0 = met.

**★ The Mantra of Humility + the renunciation tale.** `medi`/`mant` → "You should go meditate at the shrine
yourself. I find **'lum'** a most effective mantra"; `once`/`migh`/`mode`/`humi`/`humb` → his story: a
**powerful, wealthy mage** with a castle, silk robes and jewelry who visited the **Shrine of Humility**,
then gave up all his possessions and magic to **live as a shepherd** ("surely this would be the greatest act
of humility"). `shri` → "It changed my life." Life's-great-circle musings (earth → grass → sheep → me →
earth).

**Vendor.** `buy`/`wool` → sells a **bale of wool (obj 190)** for **5 gold** (party-aware loop, gold +
carry checks).

**Actions:** `SET`/`TST` self bit 0; wool buy loop (`TAKEOBJ` gold ×5 → `GIVEOBJ` **wool 190**); `LEAVE`.
**Quest payload:** ★ gives the **Mantra of Humility "lum"** (also from Conor) + a wool vendor + Shrine-of-
Humility lore (thread 3).

---

<a id="npc-43"></a>

## Zellivan — npcId 43 (`converse.b`), 1,774 bytes — Lord of Jhelom (the Valor town leader)

**You see** "a man with a serpent-and-heart tabard covering his chainmail." **Lord Zellivan**, ruler of
**Jhelom**, the Valor city ("I watch over the fighters"). Self-ref self = 235; bit 0 = met.

**★ The Rune of Valour tournament + the mantra pointer.** `rune` → "I held a **tournament** to decide who
would be entrusted with the rune's care… you might say that **'no man' was the victor**" (a pun → the
winner was **Nomaan**, npc 44). `mant` → "Hear it for thyself at the **Sword and Keg Pub**" (the mantra
lives in a song); the pub is "on the **north side of town**." `arms`/`armo` → "Speak to **Nomaan**."

**Flavor.** `valo`/`batt` → Jhelom delights in the clash of arms; `eart`/`quak` → an earthquake last year
broke the piers (the shipwrights repaired them); `lord`/`brit` → he grew up near Castle Britannia.

**Actions:** `SET`/`TST` self bit 0; `LEAVE`; no items. **Quest payload:** ✗ no item — the **town leader**;
★ points the Rune-of-Valour trail at **Nomaan** + the mantra to the **Sword & Keg** (thread 3, Valor).

---

<a id="npc-44"></a>

## Nomaan — npcId 44 (`converse.b`), 4,243 bytes — "Naughty Nomaan," the Jhelom armourer (★★ lost the Rune of Valour)

**You see** "a blond man with broad shoulders and a stern, unsmiling face." **"Naughty Nomaan,"** Jhelom's
**armourer**. Has a `<PREFIX>`; busy-gate (`#W==153` → "Can't you see there's a lovely brawl going on?").
Self-ref self = 235; bit 0 = met.

**★★ How the Rune of Valour was lost.** `rune` → "I **won a rune in a tournament** once… 'tis gone now,
though"; `gone`/`tale` → Zellivan's tourney awarded him the **Rune of Valour**; celebrating drunk at the
pub he dropped it, and **`rat` → a rat seized it and ran into a `hole` in the WEST wall of the pub**,
carrying the rune; "we tried banging, digging, poking with a sword — to no avail. We haven't seen the rune
since." (Lyssandra/Jerris say the **north** wall — source is loose on which wall; it's the Sword & Keg
rat hole either way.) `mant` → "Go ask around in the tavern."

**Vendor.** `buy` → **armaments** (Bow/Club/Crossbow/Dagger/Oil Flask/Spear/Spiked Shield) or **ammunition**
(Arrows/Bolts, sold by the dozen); also **buys** the party's weapons (half-price). Shop-hours gated.

**Actions:** `SET`/`TST` self bit 0; weapon/ammo buy + sell loops (`TAKEOBJ`/`GIVEOBJ` vs gold 88); `LEAVE`.
**Quest payload:** ✗ no item — the **armourer**; ★★ the **Rune of Valour is in the rat hole** in the
Sword & Keg (retrieve via the talking mouse — see Lyssandra 48) (thread 3).

---

<a id="npc-45"></a>

## Stelnar — npcId 45 (`converse.b`), 1,982 bytes — Stelnar Starhelm, monster-slayer (★ the Sin'Vraal lead)

**You see** "an angry-looking man wearing short swords on either hip." **Stelnar Starhelm**, a
**monster-slayer** — and **Shamino's old comrade** (if Shamino is in the party they shake hands and he
introduces you). Busy-gate (`#W==153`). Self-ref self = 235; bit 0/2.

**★ Sin'Vraal / the Dry Land (thread 4).** `mons`/`slay` → he hunts **wisps** in Spiritwood and hates all
monsters; `garg` → "There's one they call **Sin'Vraal**… if I had my way, that gargoyle would be a statue";
`sin`/`vraa` → "a vicious **daemon**"; `lord`/`brit`/`virt` → "**Lord British defeated Sin'Vraal in the
underworld**; the gargoyle went to live in the **Dry Land**"; `dry`/`land` → "a **desert east of the Bloody
Plains**. **There is a shrine there**" (`shri` → the **Shrine of Honesty**). His scorn ("how could a
gargoyle understand virtue?") plays off **Van Kellian**'s mercy view (on-screen banter).

**Actions:** `SET`/`TST` self bits 0/2; `SHOW_CONVERSE` cut-ins with Shamino/Van Kellian; `LEAVE`; no
items. **Quest payload:** ✗ no item; ★ the **Sin'Vraal** location — **the Dry Land** (desert E of the
Bloody Plains, with a Shrine of Honesty) (thread 4) + Shamino-lore.

---

<a id="npc-46"></a>

## Van Kellian — npcId 46 (`converse.b`), 2,253 bytes — a Jhelom bard (mantra of pride "mul")

**You see** "a man dressed in velvets and silks of yellow, green and blue." **Van Kellian** ("call me
Van"), a **bard**. Busy-gate (`#W==153`). Self-ref self = 235; bit 0 = met.

**Lore.** `mant` → "Did ye know the **mantra of pride is 'mul'**? A **beggar** told me that" (`prid`/`begg`
→ the beggar = Heftimus; "mul" is the inverse of the Humility mantra "lum" — anti-virtue lore, not a cube
mantra). `sin`/`vraa` → he argues for **mercy** ("if Lord British suffers him to live, I will not harm
him… what threat is one gargoyle alone?"), sparring on-screen with **Stelnar** (thread 4 thematic);
`valo`/`comp` → "Valour comes from the courage to be virtuous, just as compassion comes from a love of all
mankind." Sings (flavor, `song`).

**Actions:** `SET`/`TST` self bit 0; `SHOW_CONVERSE` banter with Stelnar; `LEAVE`; no items. **Quest
payload:** ✗ no item — a bard; names the **pride mantra "mul"** (lore) and voices the gargoyle-mercy side
of the Sin'Vraal debate (thread 4 color).

---

<a id="npc-47"></a>

## Heftimus — npcId 47 (`converse.b`), 1,917 bytes — Heftimus McPry, the hook-handed beggar (★★ a silver-tablet map piece)

**You see** "a beggar, clad in the rags of a sailor, with a hook for a right hand." **Heftimus McPry**, a
begging ex-pirate ("Spare a doubloon fer an old seahand?" — a `<GETINT>` donation goes straight to him).
Self-ref self = 235; bit 0 = met.

**★★ The map scrap (thread 2).** `job` → once the greatest sabre fighter, until **Captain Hawkins struck
off his right `hand` with his sword** (and threw it to the sharks); `capt`/`hawk` → "He be **long gone**
now, he an' his ship the **Empire**. A pox on his memory!" (confirms **Hawkins dead** + ship name).
**`map` → "That bit o' news will cost ye twenty coins. Aye or nay?"** (haggles down to **ten**) → on
payment (`TAKEOBJ` gold 88 ×10 or ×20) he reveals: he used the **map scrap** to try to start a fire in a
**dungeon**, but a swarm of rats drove him off — "**the scrap o' map lies in the dungeon `Wrong`, matey.**"
He sleeps before a `cave` on the island, saving to dig for gold.

**Actions:** `SET`/`TST` self bit 0; donation + the 10/20-gold map-info haggle (`TAKEOBJ` gold → self);
`LEAVE`. **Quest payload:** ★★ his **silver-tablet map piece is in dungeon Wrong** (he lost it there) —
buy the location for 10–20 gold (thread 2). Hawkins/Empire confirmation.

---

<a id="npc-48"></a>

## Lyssandra — npcId 48 (`converse.b`), 1,701 bytes — "Andy," the Sword & Keg barmaid (★★ the mouse hint)

**You see** "a girl of perhaps twelve years," nimbly balancing trays of mugs and dodging brawl debris.
**Lyssandra ("call me Andy")**, the barmaid at the **Sword & Keg**; dreams of being a fighter. Self-ref
self = 235; bit 0 = met.

**★★ How to get the Rune of Valour out of the rat hole.** `figh`/`braw` → the brawling here "usually begins
over… the **rat**!"; `rat` → (whispering) "See yon **hole in the north wall**? Look where floor and wall
meet — **that's where it took the rune**. They tried all manner of tricks; all failed. **I had an idea, but
nobody listened**"; `idea` → "Do ye know of the **talking mouse, Lord British's friend**? **A mouse could
get the rune!**" → the retrieval method = the **talking mouse (Sherry)**. `mant` → "Culham has oft sung of
it" (→ Culham 49).

**Actions:** `SET`/`TST` self bit 0; `LEAVE`; no items. **Quest payload:** ★★ the **Rune-of-Valour
retrieval key** — a **talking mouse (Sherry)** can fetch it from the Sword & Keg rat hole (thread 3); points
to **Culham** for the mantra.

---

<a id="npc-49"></a>

## Culham — npcId 49 (`converse.b`), 3,079 bytes — a Jhelom bard (★ the Mantra of Valour "ra")

**You see** "a small man in a handsome vest made of seashells." **Culham**, a lute-playing **bard**.
Busy-gate (`#W==153`). Self-ref self = 235; bit 0 = met.

**★ The Mantra of Valour "ra".** `chee`/`mant` → "The **Mantra of Valour** bringeth great cheer… it makes
me sing"; `play`/`tune` → his avalanche ballad with the refrain **"Sing 'ra,' my friends, sing 'ra'… 'tis a
song to make thee strong."** So the **mantra is "ra".** `rune`/`rat`/`noma` → he retells the Naughty-Nomaan
rune loss; if **Jerris + Stelnar** are both on-screen his loud laugh **triggers a pub brawl** (he `SETMODE`s
the fighters to 153). `gyps`/`tale` → a long gypsy tale ("Arturosis," the horse-poison con — names
Immanuelle of Trinsic).

**Actions:** `SET`/`TST` self bit 0; `SETMODE` 153 on several NPCs (the brawl trigger); `LEAVE`; no items.
**Quest payload:** ★ the **Mantra of Valour "ra"** (sung) (thread 3). Brawl color; gypsy tale flavor.

---

<a id="npc-50"></a>

## Jerris — npcId 50 (`converse.b`), 1,412 bytes — an aspiring Jhelom guard (corroborates the rune hole)

**You see** "a slender man with boots that come up to his thighs." **Jerris**, who hopes to join
**Zellivan's Stalwarts** as a guard. Busy-gate (`#W==153`). Self-ref self = 235; bit 0 = met. Offers a
mug of warmed Verity-Isle `mead`.

**Corroborates the Rune of Valour.** `mous`/`rat` → "It was a **rat**… Nomaan dropped the rune and the rat
took it into a little **hole**"; `hole`/`rune` → "It's right there, on the **north wall**. See it?" (if
Shamino's along he points to the spot **west of the bar** where wall meets ground); `mant` → "It's in the
refrain of the **song** — get **Culham** to play it." `zell`/`stal` → Zellivan once lifted an earthquake
branch off him.

**Actions:** `SET`/`TST` self bit 0; `SHOW_CONVERSE` Shamino spotting the hole; `LEAVE`; no items. **Quest
payload:** ✗ no item; corroborates the **rat-hole Rune of Valour** location + the **mantra-in-Culham's-song
("ra")** (thread 3).

---

<a id="npc-51"></a>

## Arvin — npcId 51 (`converse.b`), 2,312 bytes — keeper of the Sword & Keg (Jhelom pub)

**You see** "a tavernkeeper." **Arvin**, keeper of the **Sword and Keg** — the rowdy pub whose wall hides
the Rune-of-Valour **rat hole**. Has a `<PREFIX>`; cooking-gate (busy → "come back when supper's ready").
Self-ref self = 235; bit 0 = met.

**Vendor.** `buy`/`job` → **rolls** (obj 130, 2 crowns), **ale**/**mead**/**wine** (crowns), **rations**
(obj 129, 4g each, quantity loop cap 200) — party-aware buy loops vs gold (obj 88).

**Actions:** `SET`/`TST` self bit 0; the food/drink buy loops; `LEAVE`. **Quest payload:** ✗ no item — the
**Sword & Keg tavernkeeper** (vendor). (His pub is the Rune-of-Valour site.)

---

<a id="npc-52"></a>

## Martin — npcId 52 (`converse.b`), 893 bytes — "Dutch," the Warrior's Stead innkeeper (Jhelom)

**You see** "a jolly, red-faced innkeeper." **Martin** ("friends call me **Dutch**"), keeper of the
**Warrior's Stead** inn (mock-German accent). Self-ref self = 235; bit 0 = met.

**Lodging.** `rest`/`inn`/`room` → "Room und board ist **5 gold per night per person**" → on payment
(`TAKEOBJ` gold 88 × party-scaled cost) the party **sleeps** (`<REST>`) and wakes to a big breakfast.

**Actions:** `SET`/`TST` self bit 0; the room loop (`TAKEOBJ` gold, `<REST>`); `LEAVE`. **Quest payload:**
✗ no item — the Jhelom **inn** (rest / heal point).

---

<a id="npc-53"></a>

## Peer — npcId 53 (`converse.b`), 1,901 bytes — the Jhelom shipwright (ships & skiffs)

**You see** "a tall, muscled man with a wide grin." **Peer** ("my father was a sailor, but couldn't
spell"), the **shipwright**. Self-ref self = 235; bit 0 = met.

**Vendor.** `buy`/`ship`/`skif` → sells **ship & skiff deeds (obj 149)** — `TRANSFEROBJ` the deed for gold,
with a **party collection** if the buyer is short ("Your party takes up a collection"). Tracks which deeds
you already own (won't re-sell the same craft).

**Actions:** `SET`/`TST` self bit 0; deed sale (`TAKEOBJ` gold / `TRANSFEROBJ` deed 149) + party-collection
path; `LEAVE`. **Quest payload:** ✗ no quest item — a **watercraft source** (ships/skiffs), handy for the
island-hopping treasure hunt (cf. Trebor, Fentrissa).
