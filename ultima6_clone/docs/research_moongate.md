# research — moongate system (moonstones, blue gates, red gates, Orb)

Research grounding for a **possible future port step** (no `I-N` assigned yet): U6's
moongate travel network. Cross-checked per `feedback_consult_legacy_ultima6_port`
against **u6-decompiled** (the mechanic spec), the legacy **`../ultima6/`** port, and
the **clone's current state**.

**Headline.** There are *two* moongate networks that look alike on the map but share
almost no code:

- **Blue gates (`OBJ_055`)** — a player-mutable network. 8 endpoints live in `D_2C74`
  (one per lunar phase). Gates auto-spawn at those endpoints on a clock; walking in
  sends you to the *phase-selected* endpoint. `USE moonstone` relocates an endpoint.
- **Red gates (`OBJ_054`)** — a fixed, single-use network from the **Orb of the Moons**
  (`OBJ_057`). Destinations are a hard ROM table (`D_171C`); the cast *direction* picks
  one; the gate is consumed on use.

The **Vortex Cube (`OBJ_03E`)** is a *third*, unrelated thing — the endgame device, not
a travel gate. The `USE moonstone` handler itself is ~25 lines (ladder-class); the
weight is the blue-gate runtime it feeds.

---

## 1. Object + tile inventory

| Concept | Object | Tiles | Notes |
|---|---|---|---|
| Moonstone | `OBJ_049` | `TIL_248`..`TIL_24F` (8 phase glyphs) | 8 frames = 8 lunar phases (`obj.h:9-26`, `obj.h:172`): 0 new · 1 cres.wax · 2 first-qtr · 3 gibb.wax · 4 full · 5 gibb.wan · 6 last-qtr · 7 cres.wan. **Frame = index into `D_2C74`.** |
| Blue moongate | `OBJ_055` | `TIL_25C`/`TIL_25D` (left/right) | spawned `TypeFrame(OBJ_055,1)`; 2-tile-wide. |
| Red moongate | `OBJ_054` | `TIL_25A`/`TIL_25B` | single-use. |
| Orb of the Moons | `OBJ_057` | `TIL_25F` | creates red gates. |
| Vortex Cube | `OBJ_03E` | `TIL_23D` | endgame device (not travel). |

Tiles: `tile.h:231-280`. Object defs: `obj.h` (`OBJ_054`=0x054, `OBJ_057`=0x057
"Orb of the Moons" `obj.h:200`, `OBJ_03E` "Vortex Cube" `obj.h:150`). Legacy port
cross-check: `../ultima6/u6objects.js:64-66` lists `RED_GATE:84` (0x54),
`MOONGATE:85` (0x55), `ORB_OF_THE_MOONS:87` (0x57) — IDs only, **no gate logic**.

---

## 2. The two destination networks

This is the core distinction; everything else hangs off it.

### 2.1 Blue — `D_2C74[8][3]` (player-mutable)

`D_2C4A.c:29-38` (decl `D_2C4A.h:30`): 8 rows of `(x,y,z)`, indexed by **lunar phase**
(= moonstone frame). Ships pre-populated with the canonical U6 network:

```
0: 3A7,106,0   1: 1F7,166,0   2: 09F,3AE,0   3: 127,026,0
4: 33F,0A6,0   5: 147,336,0   6: 017,016,1   7: 397,3A6,0
```

Seven on the surface (z=0); slot 6 is at **z=1** (a dungeon). The table is **save state**
(part of the `D_2C4A` global-state blob — see `research_save_load.md`), so relocations
persist. **Verified against a real factory `objlist`** (§8.1): in a pristine
(pre-character-creation) copy this registry is **all-zero** — the compiled values above
are the *link-time* default that the (zeroed) factory save overwrites — yet all eight
**moonstone objects** (`OBJ_049`, frames 0–7) are pre-placed in the world (`objblk*`) at
the canonical spots, one per phase. So the network is established at new-game-init, not
shipped live in the factory template — and burying only *moves* an endpoint thereafter.

### 2.2 Red — `D_171C` / `D_174E` / `D_1780` (fixed ROM)

`seg_1E0F.c:12-34`: three parallel arrays, 25 entries (X / Y / Z), indexed by the red
gate's `Qual-1`. Immutable — the Orb's fast-travel web. The table is a **5×5 directional
pad**: the cast cell offset around the player becomes the `Qual` (`C_27A1_5789:2665`,
`di = (dy+2)*5 + (dx+3)`), so casting *toward* a cell sends you to the destination "in
that direction." Indices 11–13 are `(0,0,0)` — these line up exactly with `Qual` 12/13/14,
i.e. the player's own cell + its two horizontal neighbors, which `C_27A1_5789:2662`
remaps to `Qual = 0` (a dead "stay-put" gate) *before* they can index the table. So the
zeros are **unreachable padding**, not a live hazard.

**Blue points at a moonstone position; red points at a ROM coordinate.** That one
sentence is the whole difference.

---

## 3. The moon-phase clock

Two state pairs, recomputed hourly inside the time-advance routine `C_0A33_1355`
(`seg_0A33.c:907-910`), in the `D_0369 != Time_H` hourly block (`:888`):

```c
D_2CC6 = D_036A[Date_D - 1][0];            // moon 1 (Trammel) SLOT  0..7
D_2CC7 = (D_2CC6 * 3 + 18 - Time_H) % 24;  // moon 1 PHASE 0..23
D_2CC8 = D_036A[Date_D - 1][1];            // moon 2 (Felucca) SLOT  0..7
D_2CC9 = (D_2CC8 * 3 + 20 - Time_H) % 24;  // moon 2 PHASE 0..23
```

- **SLOT** (`D_2CC6`/`D_2CC8`, 0–7): today's endpoint index → `D_2C74[slot]` is the
  destination, and it doubles as the sky glyph (§7).
- **PHASE** (`D_2CC7`/`D_2CC9`, 0–23): finer within-day value → gate *visibility*
  (§4), sky arc position (§7), and the which-moon-wins tiebreak (§5).

**Verified against a real created save** (§8.1): clock day 4 / hour 8 → `D_036A[3]={6,6}`
gives `D_2CC6/7/8/9 = 6/4/6/6`, which this formula reproduces exactly and matches the
save's stored values — the phase math is confirmed against real data, not just re-derived.

`D_036A[28][2]` (`seg_0A33.c:684-713`) is the per-day slot calendar for a 28-day month.
Trammel advances ~1 slot / 2 days; Felucca cycles ~3× faster:

```
day  1 {0,0}   8 {4,2}  15 {0,4}  22 {4,6}
day  2 {7,0}   9 {3,1}  16 {7,3}  23 {3,5}
...           (full table in source)        28 {1,0}
```

Then the hourly block calls `C_2FC1_19C5()` (sky render) + `C_0A33_121A()` (gate
spawn). **Prerequisite for any port: an hour-of-day + day-of-month calendar.** The
clone already has it — `resources/world_clock.js` carries `Time_H`/`Date_D`/… and an
`onHour(cb)` hook; the recompute registers there.

---

## 4. Blue-gate spawn / despawn — `C_0A33_121A` (`seg_0A33.c:621-653`)

Per-area heartbeat. For each of the 8 `D_2C74` slots:

```c
if (z == MapZ && in loaded area) {
    objNum = C_1184_07A7(OBJ_055, x, y);      // existing gate at this cell?
    if (D_2CC7 < 15 || D_2CC9 < 15) {         // at least one moon "up"
        if (objNum < 0) AddMapObj(TypeFrame(OBJ_055,1), 0,0, x,y,z);
    } else {
        if (objNum >= 0) DeleteObj(objNum);
    }
}
```

Since it's an **OR of two moons** each up for 15/24 of the cycle, gates are present
almost always; the phase mainly chooses *where you land*, not *whether a gate exists*.
Called from the hourly block (`seg_0A33.c:912`) **and** on area-load
(`seg_101C.c:193`, after `EGG_hatchArea`). The `z == MapZ` test maps directly to the
clone's I-19 **active-z filter**.

---

## 5. Gate entry + travel

Entry is detected by `C_1E0F_184D` (`seg_1E0F.c:712-790`), which runs over the objects
on the party's tile after a move (skipped in combat / in a vehicle).

### 5.1 Blue (`seg_1E0F.c:726-751`)

```c
if (objType == OBJ_055 && D_0658 == 0) {
    if (D_2CC3 != -1) break;                          // solo-mode gate (skip in clone)
    if (Time_H == 0 && Time_M < 10)                   // 00:00–00:09 override
        PartyTeleport(0x018, 0x01d, 1, 1);            //   → Shrine of Spirituality
    else {
        bp_06 = abs(7 - D_2CC7) - abs(7 - D_2CC9);    // which moon is "fuller"
        if (bp_06 < 0)                       GateTravel(D_2CC6);   // Trammel's slot
        else if (bp_06 <= 0 && tiebreak)     GateTravel(D_2CC6);
        else                                 GateTravel(D_2CC8);   // Felucca's slot
    }
}
```

Phase proximity to 7 picks the moon; that moon's **slot** is the destination index.

### 5.2 Red (`seg_1E0F.c:753-767`)

```c
if (objType == OBJ_054 && D_0658 == 0) {
    if (D_2CC3 != -1) break;
    di = GetQual(objNum);
    if (di) PartyTeleport(D_171C[di-1], D_174E[di-1], D_1780[di-1], 1);
    else    PartyTeleport(MapX, MapY, MapZ, 1);       // Qual 0 = dead gate, stay put
}
```

Both branches gate on `D_0658 == 0`. `D_0658` is **not** moongate state — it's a
`FindLoc`/`NextLoc` side-channel (`seg_1184.c:13,230-291`) holding which footprint
sub-cell of a multi-tile object the queried cell hit (0 = anchor, 1/2/3 = the
double-wide / double-tall / 2×2 extension cells; consumers read `TILE_FRAME-D_0658` to
recover the base tile). Since the blue gate is a 2-wide sprite (`TIL_25C`/`TIL_25D`),
`D_0658 == 0` means **"only teleport from the gate's anchor (left) tile,"** firing once
and ignoring the right half. The clone satisfies this for free if it anchors a gate at
one cell and only that cell triggers entry.

### 5.3 `GateTravel` (`C_101C_0A3A`, `seg_101C.c:368-376`)

```c
GateTravel(int si) {
    if (InCombat) COMBAT_breakOff();
    if (D_2C74[si][0] || D_2C74[si][1] || D_2C74[si][2])
        PartyTeleport(D_2C74[si][0], D_2C74[si][1], D_2C74[si][2], 1);
    else
        PartyTeleport(MapX, MapY, MapZ, 1);           // unburied slot → stay put
    MUS_09A8();
}
```

A near-sibling of I-19's `C_101C_089E` — same `PartyTeleport` + music family, but
**simpler**: no coordinate rescale (moongate destinations are absolute). Note slot 6's
default z=1, so a blue gate can drop the party onto a **different level** — `GateTravel`
must also switch the active level (reuse `setActiveLevel`).

### 5.4 Red gates are single-use — `PartyTeleport` (`C_101C_0828`, `seg_101C.c:301-322`)

```c
PartyTeleport(x, y, z, withAnimation) {
    PartyEnter(withAnimation);
    objNum = C_1184_07A7(OBJ_054, MapX, MapY);   // red gate at the SOURCE tile
    if (objNum >= 0) DeleteObj(objNum);          // consumed on every teleport
    MapX=x; MapY=y; MapZ=z; ...
}
```

**Every** teleport deletes an `OBJ_054` at the departure tile. Blue gates (`OBJ_055`)
survive — they're owned by the §4 heartbeat. So: blue = persistent, phase-routed,
mutable; red = single-shot, fixed-routed.

---

## 6. Creation / mutation handlers

USE dispatch: `seg_27a1.c:3088-3158` (`switch(GetType)`).

| Verb | Object | Handler | Effect |
|---|---|---|---|
| Bury moonstone | `OBJ_049` (`:3105`) | `C_27A1_3425` (`:1563-1588`) | If on buryable terrain (`TIL_001..007`, `TIL_010..06F`): `D_2C74[frame] = (x,y,MapZ)`, "buried."; else "Cannot be buried here!" |
| Pick up moonstone | `OBJ_049` | into-inventory branch (`:887-891`) | `D_2C74[frame] = 0,0,0` — that gate stops spawning. |
| Cast red gate | `OBJ_057` Orb (`:3106`) | `C_27A1_5789` (`:2642-2685`) | Needs `TalkFlags[5]` bit; prompt "Where:"; pick a cell in the 5×5 around you → spawn `OBJ_054` with `Qual = cell offset` (→ `D_171C` dest). "a red moon gate appears." |
| (Endgame) Vortex Cube | `OBJ_03E` (`:3152`) | `C_27A1_5FAC` (`:2882-2919`) | All 8 stones inside + both lenses + Codex at `~0x39b,0x353` + party near → end the game. No gate made. |

Vortex-cube container guard: moving an object **into** `OBJ_03E` accepts only `OBJ_049`
("Only moonstones can go into the vortex cube", `seg_27a1.c:1163-1166`).

**Ancillary (not a gate mechanic):** moonstones also key the shrine/rune virtue puzzle
— `USE rune` (`C_27A1_4B98`, `seg_27a1.c:2294-2339`) checks for a `OBJ_049` of
`frame == virtue` in the 3×3 to dispel a forcefield + gargoyle eggs. Out of scope for a
gate port; noted for completeness.

---

## 7. Sky render — `C_2FC1_19C5` (`seg_2FC1.c:677-712`)

The status-bar sky strip (only when `StatusDisplay` is the sky view `CMD_91`/`CMD_9E`).
It's a **composited ~9-tile-wide scene**, not floating glyphs, and it **branches on the
active level**:

- **Outside** (`MapZ == 0` surface **or** `MapZ == 5`, the gargoyle realm) — four layers:
  1. **Sky-base row** — `TIL_19B` across 9 columns (the backdrop).
  2. **Sun** (when `5 ≤ Time_H ≤ 19`) — tile by hour (`TIL_169` dawn/dusk · `TIL_16A` day ·
     `TIL_16B` eclipse), at `x = (19-Time_H)<<3`, height `D_2BFA[19-Time_H]`.
  3. **Two moons** (unless eclipse; each only while its phase ≤ 14) —
     `BaseTile[OBJ_049] + D_2CC6/D_2CC8` (phase glyph by **slot**) at `x = phase<<3`,
     height `D_2BFA[phase]`.
  4. **Mountain horizon** — `TIL_160 + 0..8`, painted over the top (the ridge the sun/moons
     rise and set behind).

  Arc heights: `D_2BFA = {10,7,5,3,2,1,0,0,0,1,2,3,5,7,10}`. Eclipse on
  `Date_D==1 && Date_M%3==0`.
- **Cave** (`MapZ` 1–4) — a **cave backdrop** instead: `TIL_174` at column 0, `TIL_175`
  across the rest. **No sun, no moons** (underground).

**UX note:** because the moon glyph is the slot and the slot is the destination, the player
can *read the sky to predict a blue gate's destination* — it's the player-facing instrument
that makes the blue network legible. §9 (h) ports this scene into the clone's clock panel.

---

## 8. Clone state — what a port reuses

The infrastructure is mostly already present (this is *activation + glue*, like I-19,
not a new engine):

| Need | Already in clone |
|---|---|
| hour/day calendar (the hard prerequisite) | `resources/world_clock.js` (`Time_H`/`Date_D` + `onHour`); driven by `systems/world_clock_system.js` |
| hourly phase recompute home | `WorldClock.onHour(cb)` |
| gate spawn/despawn | `world_loader` add/delete + cell-find (≈ `C_1184_07A7`) |
| active-level gating | I-19 single `SpatialIndex` + **active-z filter** |
| USE handlers (bury, Orb) | `systems/use_handlers.js` + `command_dispatch` (same path as `use_ladder`/`use_drawbridge`) |
| party teleport (`GateTravel`) | I-19 pattern in `systems/use_ladder.js` (remove→set x/y/z→`insertAtHead`→`moveFollowers`→`recenter`); `setActiveLevel` for the z-changing slot |
| persistence | `D_2C74` + moon phases already enumerated in `research_save_load.md`'s save-state set (persist relocations like I-19 persisted `loadedDungeons`) |

Legacy `../ultima6/`: object IDs only, **no gate logic** (verified — same status as NPC
AI). No JS blueprint to lean on here.

### 8.1 Factory-data verification (read from a real pristine `objlist` + `objblk*`)

Read live from a user-supplied **factory** (pre-character-creation) U6 data set via the
clone's own IndexedDB + `decodeObjblk` (read-only; nothing written/committed):

- **`D_2C74` registry = all-zero.** The 7539-byte factory `objlist` has every global
  zeroed (karma 0, clock 0, `D_2CCB` 0 = uncreated) — `research_save_load.md` documents
  exactly this — and `D_2C74` (objlist offset `0x1C1B`, 8×3 int16) is in that zeroed
  span. So the canonical 8 positions ship only as the `D_2C4A.c` *link-time* default,
  which the factory save overwrites with zeros; the live network is written at
  new-game-init (the external `ultima6.exe` char-creation, not in the `GAME.EXE`
  decompile).
- **All 8 moonstone objects ARE pre-placed** (`OBJ_049`, `LOCXYZ`), one per frame 0–7,
  matching the compiled `D_2C74` slots: **x and z identical, y consistently +1** (e.g.
  frame 0 stone at `(0x3a7,0x107,0)` vs default `(0x3a7,0x106,0)`; frame 6 at
  `(0x017,0x017,1)` vs `(0x017,0x016,1)`). The +1-in-y between stone-object and
  gate-constant is a real authoring offset, not a decode artifact.

**Confirmed against a real *created* save** (a DOSBox new game saved at the start,
`D_2CCB=11`, karma 81, clock 08:01 day 4/7/161, avatar at the LB-castle start
`0x133,0x160`, 7283-byte real save): **`D_2C74` is fully populated — all 8 slots match the
compiled `D_2C4A.c` constants exactly (the `y` values), none match the stones' `y+1`,
none empty.** So:

- **A started game's network is pre-active** — all 8 gates are live from character
  creation; the player needn't bury anything to get the canonical network.
- **Char-creation seeds the constants, not the stone positions.** The placed stone
  *objects* sit one tile south (`y+1`); the gate registry uses the constant `y`, so the
  gate appears one tile **north** of the visible stone — a real intentional offset.

**Clone consequence (now unambiguous).** The clone loads factory data with no
char-creation step, so it gets the **8 stones but an empty `D_2C74`** → zero gates. A
moongate port's new-game-init must **seed `D_2C74` from the compiled `D_2C4A.c`
constants** (the `y` values — *not* derived from the placed stones), parallel to
`applyNewGameDefaults` seeding karma/clock (`assets/objlist.js`).

---

## 9. If/when it becomes a port step — suggested shape

Decomposes cleanly into save-point sub-steps (per the repo-root sub-step convention):

- **a — Data:** extract `D_2C74` defaults, `D_036A` calendar, `D_171C/174E/1780`
  red-dest tables (verbatim ROM); add a moon-phase resource (`D_2CC6-9`).
- **b — Phase clock:** `onHour` recompute of slot+phase for both moons.
- **c — Blue runtime:** `C_0A33_121A` spawn/despawn (on the hour hook + on level/area
  load) + gate-entry phase-pick (`C_1E0F_184D` blue branch) incl. the midnight-shrine
  override + `GateTravel` (with `setActiveLevel` for the z-changing slot).
- **d — Bury/relocate:** `USE OBJ_049` (`C_27A1_3425`) + GET clears the slot.
- **e — Red gate:** `USE OBJ_057` (`C_27A1_5789`) + red travel + single-use deletion.
- **f — (separate) Vortex Cube endgame** — only when the endgame is in scope.
- **g — Gate + phase readout (dev HUD).** A diagnostic line in the dev-stats block
  (`view/dev_hud.js`, the `npcStatsEl` element, beside `hours fired` / NPC stats): the two
  moons' phases + "today's gates → …" (the active `D_2C74` destinations for
  Trammel/Felucca). Text only; rides on (b). The dev HUD stays as-is (left visible for
  players — the clone is its own experience, not a 1:1 of the original).
- **h — Sky view (clock panel).** A composited sky strip on its **own row beneath** the
  clock line (`textEl`), reusing `view/ui_icons.js tileIcon` (CPU tile pixels → palette →
  `<canvas>`) composited into one mini-canvas. **Faithful in-game tiles + faithful arc
  placement**, branching on the active level (`MapLevel.level`, the I-19 state): **0/5 →**
  sky base (`TIL_19B`) + sun (`TIL_169/16A/16B` by hour) + two moon glyphs
  (`tileForObject(OBJ_049, D_2CC6/D_2CC8)`) + mountain (`TIL_160+`); **1–4 →** cave
  backdrop (`TIL_174/175`), no sun/moons (§7). Splits by dependency: **h1 — sun +
  backdrops + cave** need only `Time_H`/level (no (b)), can land anytime; **h2 — moons**
  need (b).

The blue runtime (b+c) is the real subsystem; bury (d) is the ladder-class handler that
rides on it; red (e) is self-contained (one handler + one fixed table); the readout (g) +
sky view (h) are the player-facing clock-panel/HUD layer, gated only on the phase clock
(b) — and (h1) not even on that.

**Impl-time notes (decide while building, not pre-decided — none affect the plan shape):**
(1) **(h) honors eclipse** per §7 (`TIL_16B` sun + moons hidden); (2) **no `D_2C55`
tint** — faithful: the sky strip conveys time by sun presence/position, `D_2C55` drives
*map* lighting, not the strip (a modern day/night tint would be optional polish);
(3) **(g) uses coords by default** — named gates are an optional enhancement (needs a
location-name source, see the note in §10 if pursued).

### Kept-deviation candidates (decide at impl, not pre-decided)

- **Skip the `D_2CC3` solo-mode gate** — clone has no solo/party-split mode (same call
  as I-19).
- **Hard-cut teleport** (no `PartyEnter`/`PartyExit` animation) — same as I-19.
- **Real-time clock consequence:** the clone advances time on a wall-clock cadence
  (I-14d), not per-action. So **a gate's destination can change while the player stands
  still** — source only moves the moons on player action. This is an inherited
  consequence of the I-14d decision, worth a conscious accept/reject.

---

## 10. Open / unverified items

Flagged per the CLAUDE.md "verify negative claims / separate decoded facts from memory"
discipline. (`D_0658` and the red dead-slots — open in the first draft — are now
resolved into §5 and §2.2 respectively.)

- **`TalkFlags[5]` bit 5 (Orb enable)** — `C_27A1_5789:2646` gates the Orb on
  `(TalkFlags[5] >> 5) & 1` ("You can't figure out how to use it" when unset). It's a
  *conversation* flag — set by bytecode in `converse.a/.b`, not by C code (a literal
  `TalkFlags[5]` grep finds only the two read-sites: `:2646` + `seg_1E0F.c:1648`, which
  reads bit 7). Per Zane it's taught in the **Lord British** conversation (recollection,
  not source-traced — fine to follow); confirm by decoding LB's script when the Orb
  sub-step is in scope.
- **`D_2CC3`** — treated as the solo/party-split flag (consistent with
  `research_level_change.md`); only "`!= -1` blocks gate use" is confirmed. We skip it
  anyway (no solo mode), so it needs no further trace.
(The "started-game `D_2C74`" question — pre-active vs empty, constants vs stones — is now
**resolved** in §8.1: a real created save has all 8 slots = the compiled constants.)
