# research — main quest (gap analysis toward game completion)

**Purpose.** Find the gaps between the clone's current implementation and *completing the U6
main story* — the Vortex Cube ending. This is a research **instrument**: its output is the
**scope of the `I-main_quest` step** (which handlers / verbs / procedures we must build), not a
lore write-up. Organized as a backward chain from the win, with a per-milestone gap row carrying
the three axes Zane named: **objects · player verbs · procedure**, plus a **source ↔ clone ↔
status** verdict.

Grounded per `feedback_separate_decoded_facts_from_memory`: source-verified facts cite a
`seg_*.c` address or a live data scan; anything from general U6 knowledge is marked **(memory —
unverified)**. Cross-checked against the running clone (preview + IndexedDB, Zane's factory data).

Status legend: ✅ done (rides an existing handler) · ⚠ partial / verify · ❌ missing (new code).

---

## 1. The end state (verified — the win trigger)

`C_27A1_5FAC` ("Use vortex cube", `seg_27a1.c:2883`), reached via the USE dispatch
`case OBJ_03E` (`:3152`). USE the **Vortex Cube** and ALL of these must hold, or it no-ops:

1. **All 8 moonstones inside the cube** — the cube is a container; the code marks
   `bp_12[GetFrame(di)]` for each contained stone and requires **all 8 frames 0–7** (the 8 lunar
   phases) present (`:2888-2896`).
2. **Britannia Lens** (`OBJ_18A`) at **(0x399,0x353) = (921,851)** (`:2898`).
3. **Gargoyle Lens** (`OBJ_18C`) at **(0x39d,0x353) = (925,851)** (`:2901`).
4. **Codex** (`OBJ_03B`) at **(0x39b,0x353) = (923,851)** (`:2904`).
5. **Avatar within 5 tiles** of (923,851) (`:2907-2910`).

→ deletes the Codex, "The Codex has vanished!", runs the ending `C_0903_0A1E` (`:2912-2916`).

**Two consequences that shrink the scope:** (a) the win checks object **presence at cells** — it
never requires having *read* a book or *looked* through a lens, so the books/lenses/Codex need
**no USE handler** (confirmed: no `case OBJ_03B/03C/03D/18A/18B/18C` in the dispatch). Placing a
lens is just GET + DROP onto its cell. (b) The only win-critical USE verbs are **USE Vortex Cube**
and (to collect the moonstones) **USE rune + mantra**.

---

## 2. Quest-object locations (live scan of Zane's factory data, 2026-06-14)

All on z=0 unless noted. Loaded every region (64 surface + 5 dungeon) and queried by object type.

| Object | Obj # | Location(s) | Notes |
|---|---|---|---|
| **Codex** | `OBJ_03B` (59) | **(923,851)** qual 128 | the win-chamber centre pedestal (matches §1 exactly) |
| **Britannia Lens** pedestal | `OBJ_18A` (394) | win needs it at **(921,851)** | **not in map data** — player must place it here |
| **Gargoyle Lens** pedestal | `OBJ_18C` (396) | win needs it at **(925,851)** | **not in map data** — player must place it here |
| **Broken Lens** | `OBJ_18B` (395) | **(124,194, z5)** | the ONLY lens object present → both finished lenses come from a quest step (repair / conversation) |
| **Vortex Cube** | `OBJ_03E` (62) | **(147,57, z4)** | pre-placed in a dungeon; GET + carry it |
| **Moonstones** (8) | `OBJ_049` (73) | see below | one per phase (frame 0–7); **every one force-field-guarded** |
| **Force Fields** (8) | `OBJ_033` (51) | one on each moonstone cell | removed only by the rune+mantra puzzle (§4) |
| **Book of Prophecies** | `OBJ_03C` (60) | present (1) | lore; not win-gated |
| **Book of Circles** | `OBJ_03D` (61) | present (1) | lore; not win-gated |

**The 8 moonstones (frame = lunar phase), each behind a force field:**

| Frame (phase) | Location |
|---|---|
| 0 new moon | (935,263) |
| 1 cres.wax | (503,359) |
| 2 first qtr | (159,943) |
| 3 gibb.wax | (295,39) |
| 4 full | (831,167) |
| 5 gibb.wan | (327,823) |
| 6 last qtr | **(23,23, z1)** (dungeon) |
| 7 cres.wan | (919,935) |

**These are the moongate network endpoints.** The coords match the `D_2C74` defaults from
`research_moongate.md` (e.g. frame 0 ≈ slot 0 `(0x3A7,0x106)=(935,262)`; frame 6 ≈ slot 6
`(0x017,0x016,z1)=(23,22,z1)`), the stone sitting ~1 tile from its gate. So collecting the
moonstones for the cube = visiting all 8 moongate sites and solving each force-field shrine.

Three required things live in dungeons (cube z4, a moonstone z1, the broken lens z5) — all
reachable via the I-19 level-change (done).

---

## 3. The critical path (forward) + per-milestone gaps

| # | Milestone | Objects | Player verbs | Procedure | Source | Clone status |
|---|---|---|---|---|---|---|
| **M1** | Learn the quest | Book of Prophecies/Circles, NPCs | TALK, (LOOK) | talk LB / Nystul / gargoyles; read the prophecy | conversation scripts | ✅ VM done (I-13); content data — **coarse, §5** |
| **M2** | Obtain the two lenses | Broken Lens → Britannia + Gargoyle | TALK / (repair) + GET | repair/obtain the finished lenses | quest/conversation | ⚠ **coarse, deferred (§5)** — rides I-13; not traced |
| **M3** | Collect the 8 moonstones | Moonstone ×8, Force Field ×8, Rune+Mantra, gargoyle eggs | travel, **USE rune + mantra**, GET | per site: travel → USE the matching virtue rune + speak its mantra → field + gargoyle egg deleted → GET the stone | `C_27A1_4B98` (`:2295`) + `C_27A1_4B0B` | ❌ **rune handler + mantra prompt UI** (gates ALL 8) |
| **M4** | Fill the Vortex Cube | Vortex Cube, 8 moonstones | travel, GET, **move-into-container** | reach (147,57,z4), GET the cube, put all 8 stones into it | container (`FindInv`) | GET ✅; **PUT into cube ⚠ (M-picker only lists already-`Container` items; an empty cube isn't tagged)** |
| **M5** | Set the Codex chamber | Britannia + Gargoyle Lens | travel, DROP | bring both lenses to (921,851)/(925,851) and DROP them | `__SearchTypeAt` at the cells | ✅ GET + DROP (I-10g); win reads cell presence |
| **M6** | Perform the ritual | Vortex Cube, Codex | **USE Vortex Cube** | stand within 5 of (923,851), USE the filled cube → ending | `C_27A1_5FAC` (`:2883`) | ❌ **USE-Vortex-Cube handler (the win)** |

Travel between all of these (8 scattered shrines + 3 dungeon sites + the far-SE Codex isle) rides
on moongates (I-moongate ✅), ladders / multi-z (I-19 ✅), and walking.

---

## 4. The moonstone shrine procedure (verified — the M3 mechanism)

Each of the 8 moonstones sits on a Shrine cell under a Force Field (`OBJ_033`), with a gargoyle
egg nearby. The force field is removed by the **rune + mantra** handler `C_27A1_4B98`
(`seg_27a1.c:2295`, USE dispatch `case OBJ_0F2..0F9` `:3125-3132`):

1. USE the matching **virtue Rune** (`OBJ_0F2..0F9`) adjacent to the stone.
2. Prompt **`Mantra:`** (`CON_gets`), check against `D_1D0F[virtue]` (Ahm/Mu/Ra/Beh/Cah/Summ/Om/Lum,
   `:2280`).
3. If correct **and** a moonstone in the 3×3 has **frame == the rune's virtue index** (`:2320`):
   `DeleteObj` the Force Field (`OBJ_033`, `:2322-2324`) **and** `C_27A1_4B0B` deletes the gargoyle
   egg's embryos + the egg (`:2263-2326`).
4. Then GET the freed moonstone (✅ existing).

`OBJ_033` is removed **nowhere else in the entire source** — so this puzzle, not combat, is the
only way to free a moonstone. (The frame↔virtue map means e.g. the (503,359) frame-1 stone needs
the Rune of Compassion `OBJ_0F3` + "Mu".) This is the I-egg play-test finding, now confirmed as a
**hard win prerequisite** (all 8 stones are guarded this way).

---

## 5. To verify later (coarse — conversation-gated, deferred per Zane 2026-06-14)

Anything that bottoms out in NPC dialogue **rides on the I-13 conversation VM** (mechanism done;
the give/set-flag opcodes are ported) + the `converse.a/.b` script data — so it is a *dependency*,
not new `I-main_quest` code. Documented coarsely; **not traced per-NPC** this pass:

- **Lens acquisition (M2).** The finished Britannia (`OBJ_18A`) + Gargoyle (`OBJ_18C`) lenses are
  **absent from the map** — only the **Broken Lens** (`OBJ_18B`, at (124,194,z5)) exists. They are
  obtained/repaired somewhere — **likely an NPC conversation and/or a fix step**. Mechanism not
  traced; assumed to ride I-13 + script data. **(memory — unverified):** U6 lore has a smith
  repair the lens; the second lens comes from the gargoyle side. **Resolve only if it turns out to
  need a NEW handler** (a USE-repair verb); if it's pure conversation, no `I-main_quest` work.
- **Vortex Cube acquisition.** Pre-placed at (147,57,z4); presumably just GET it (✅), possibly
  gated by a conversation/quest flag (not traced).
- **Opcode coverage (the one cheap check worth doing).** The only way a conversation step becomes a
  real gap is if a quest script uses a VM opcode I-13 didn't port. Verifiable later by scanning the
  quest NPCs' scripts for unported opcodes — **without** tracing each NPC's quest content.

---

## 6. Combat-free winnability (the pivotal scope verdict)

**The clone's win path is combat-free.** No required item is behind a must-kill in source: the
moonstones are freed by the rune+mantra puzzle (§4, not combat), the lenses/cube are
placement/quest items, and the Codex ritual is a USE. The hatched gargoyle guards at the shrines
are `AI_ASSAULT` → **idle in the clone** (no combat subsystem, I-egg §9.1 pt 5), and source-side
they can be pacified (Amulet of Submission / a gargoyle party member → `AI_GRAZE`). So
`I-main_quest` can deliver a **winnable game with combat still deferred**.

Caveat: this rests on §5's coarse assumption that lens acquisition is conversation/quest-gated
(not combat-gated). If a future trace finds a required item behind a forced fight, the verdict
changes — but nothing seen so far suggests it.

---

## 7. Scope-out → `I-main_quest`

Working backward from the win, the clone already covers travel (moongates/ladders), GET/DROP, the
moonstone bury USE, the Orb, and the conversation VM. The **new code** the win critical path needs
is a short list:

- **a — USE Vortex Cube** (`C_27A1_5FAC`): the win trigger + the end-state checks (8 frames in the
  cube · both lenses at their cells · Codex present · avatar within 5) → run the ending. ❌
- **b — USE rune + mantra** (`C_27A1_4B98` + `C_27A1_4B0B`): the force-field-shrine puzzle that
  gates **all 8** moonstones; needs a **mantra text-input prompt** (the one genuinely new UI
  affordance — the clone has I-13 dialog input but no generic USE text prompt). ❌
- **c — move a moonstone INTO the Vortex Cube**: make an (empty) container a valid `M`-picker
  destination — small fix to `openMovePicker` (offer known container types, or tag the cube
  `Container`). ⚠

Everything else is a **dependency, not a deliverable**: lens/cube acquisition rides I-13 +
script data (§5, coarse); lens *placement* is GET+DROP (✅); travel is done.

**Step shape.** The gap is small and cohesive enough to be **one step, `I-main_quest`** (sub-steps
a/b/c above), which **absorbs the old "I-20 = fill the USE dispatch table" item** — only these
win-critical handlers get built; the rest of `seg_27a1.c`'s ~40 USE cases stay **demand-driven**.
Re-evaluate the one-step framing only if the §5 conversation trace later surfaces real new work.

---

## 8. Open / unverified items

Flagged per the CLAUDE.md "verify negative claims / separate decoded facts from memory" discipline.

- **Lens acquisition chain** — §5; coarse by decision, needs a conversation/source trace to firm up.
- **Does collecting a moonstone disable its moongate?** The moonstones are the `D_2C74` endpoints;
  taking one for the cube may interact with the moongate network (gates are derived from `D_2C74`,
  so possibly not). Not load-bearing for the win; note if it surfaces.
- **The frame↔virtue↔slot relationship** — verified for slots 0 and 6 (coords match); assumed
  uniform for all 8. Cheap to confirm if M3 impl needs it.
- **Vortex Cube container-tagging in the clone** — confirm whether the pre-placed cube carries any
  contents / `Container` tag on load, which decides exactly how small the (c) fix is.
