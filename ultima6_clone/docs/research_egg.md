# research — egg / creature-spawn system

Research grounding + **implementation guide for the `I-egg` step** (greenlit Path A,
2026-06-14; ledger row in `progress.md`). U6's "EGG" creature-spawn system. Cross-checked per
`feedback_consult_legacy_ultima6_port` against **u6-decompiled** (the mechanic spec), the legacy
**`../ultima6/`** port, and the **clone's live state** (read read-only via the running preview +
IndexedDB). **A fresh chat implementing I-egg starts at §10** (the build shape + cadence); §9/§9.1
are the clone integration map + decided spawn/cull model; §3/§4 are the source mechanics.

**Headline.** An **egg** (`OBJ_14F`, "egg" = obj 335) is a *data-driven creature
spawner*: an invisible container object whose contained **"embryo"** objects are
*templates* for the monsters to generate. The egg's `Qual`/`Quan` encode *when / which
alignment / how likely*; each embryo's `Qual`/`Quan` encode *which monster / how many /
what combat AI*. Eggs **hatch on area-load** — normally only when the egg is *off-screen*
(>8 tiles away), so packs pop in at the edges, never in your face. Two lifetimes decide
respawn:

- **`LOCAL` eggs → one-time.** Hatch once, then the egg is **deleted** when it streams
  out of the active area. Used for scripted, on-top-of-you ambushes (the opening
  throne-room gargoyles).
- **Non-`LOCAL` eggs → wilderness respawn.** Hatch when you approach; **re-armed**
  (`ClrHatched`) when they stream out, so they re-hatch a fresh pack on every return.

The whole module is `seg_2E2D.c` (3 routines). The *monster-creation* it leans on
(`EGG_generate` → stat roll + loot) is a **shared pipeline** also used by summon spells,
the editor, and monster-death splits — documented here as a **seam**, not in full (that's
the monster/combat subsystem you asked to keep separate).

---

## 1. Object + data model

| Concept | Object | Notes |
|---|---|---|
| Egg | `OBJ_14F` (335) | The spawner. Render-skipped (`BaseTile[OBJ_14F]`, `research_map_render.md:203`); LOOK-able as a cell-pick fallback (`cell_pick.js`). Holds embryos as inventory. |
| Embryo | any creature `OBJ_xxx` | `CONTAINED` inside the egg (off-map, no `Position`). Its type/Qual/Quan are the spawn template. |
| Gargoyle | `OBJ_16A` (362, *winged* gargoyle), `OBJ_16B` (363, gargoyle) | The two gargoyle creature types. Both base-`EVIL`. |
| (unrelated) Dragon egg | `OBJ_417` / `OBJ_418` (hatched) | A *distinct* object with an unhatched/hatched **frame pair** — **NOT** part of the `OBJ_14F` EGG system (`EGG_hatchArea` scans only `OBJ_14F`). Out of scope; flagged in §11. |

**Egg `Qual` / `Quan` encoding** (`EGG_hatches`, `seg_2E2D.c:216-245`):

- `Qual / 10` = **time gate**: `0` = anytime · `1` = DAY only (06:00–18:00) · `2` = NIGHT
  only (19:00–05:00).
- `Qual % 10` = **alignment override**: `align = ((Qual%10) - 1) << 5` →
  `1`→NEUTRAL(0x00) · `2`→EVIL(0x20) · `3`→GOOD(0x40) · `4`→CHAOTIC(0x60). Applied only
  when `Qual%10 != 0` (`:275`); otherwise the monster keeps its class-default alignment.
- `Quan` = **percent chance to hatch** (`OSI_rand(1,100) <= Quan`, `:245`). Also: when
  `Quan == 100`, embryo counts are used *exactly*; when `< 100`, each embryo count is
  reduced to `OSI_rand(1, count)` (`:257`).

**Embryo `Qual` / `Quan` / status:**

- embryo type = the monster `OBJ_xxx`.
- embryo `Quan` = **number of monsters** to spawn (`:256`).
- embryo `Qual` = the **combat AI mode** stamped on each spawn (`npcMod = GetQual(embryo)`,
  `:335`). e.g. `8` = `AI_ASSAULT` (`ai.h:18`).
- embryo `MUTANT` status bit (`0x40`) → spawn a two-headed variant (`typParam |= 0x8000`,
  `:253-254`, consumed by `EGG_generate:125-128`).

**Status bits in play** (`u6.h:76-83`): `OWNED 0x01`, `INVISIBLE 0x02`, `LOCAL 0x20`,
`HATCHED 0x40` (`0x40` is overloaded `CURSED`/`MUTANT`/`HATCHED`, disambiguated by object
type — faithful, per the clone's `obj.js` note). A hatched egg ends up
`HATCHED|LOCAL|INVISIBLE = 0x62`.

---

## 2. The hatch trigger — `EGG_hatchArea` (`C_2E2D_0DFE`, `seg_2E2D.c:367-385`)

```c
EGG_hatchArea() {
    if (IsArmageddon) return;
    for (objNum = SearchArea(AreaX, AreaY, AreaX+39, AreaY+39); objNum >= 0; objNum = NextArea()) {
        if (GetType(objNum) != OBJ_14F || GetZ(objNum) != MapZ) continue;
        if (ForceHatching || !CLOSE_ENOUGH(8, x, y, MapX, MapY) || IsLocal(objNum))
            EGG_hatches(objNum);
    }
}
```

Scans the **40×40 active area** for `OBJ_14F` eggs on the current level and hatches each
that passes the gate. The gate's three OR terms are the whole proximity story:

- **`!CLOSE_ENOUGH(8,…)`** — normal case: only eggs **>8 tiles from the player** hatch, so
  monsters appear off-screen and walk in. An egg right next to you would *not* hatch under
  this term alone.
- **`IsLocal(objNum)`** — overrides the proximity rule: a `LOCAL` egg hatches even when
  you're standing on it (the throne ambush, §7).
- **`ForceHatching`** — global override: hatch *everything* in the area regardless of
  distance.

**Callers** (verified, agent-scanned then re-grepped):

| Site | Trigger | `ForceHatching` |
|---|---|---|
| `seg_101C.c:191` | **area / map load** (after the chunk-cache fill) | 0 (proximity rules apply) |
| `seg_101C.c:315-317` | **teleport / `PartyEnter`** (`ForceHatching=1; EGG_hatchArea(); ForceHatching=0`) | 1 (force-hatch all) |

So a *walk-in* to a region hatches only its distant eggs; a *teleport* (and, relevant to
us, a **moongate**) force-hatches the destination area completely. This is the same
`seg_101C` teleport path that I-moongate's `teleportParty`/`gateTravel` ported (minus the
hatch).

---

## 3. The hatch logic — `EGG_hatches` (`C_2E2D_0760`, `seg_2E2D.c:203-365`)

Order of operations:

1. **Armageddon gate** (`:213`) — after the "armageddon" spell wiped the world, nothing
   hatches.
2. **Day / night gate** (`:216-224`) — DAY/NIGHT eggs no-op outside their window.
3. **Gargoyle pacification scan** (`:231-239`) — if **any party member is a gargoyle**
   (`OBJ_16A`/`OBJ_16B`) **or** the party carries the **Amulet of Submission** (`OBJ_04C`,
   `FindInvType`), set `forceGarglGraze`. Then gargoyle embryos hatch as **`AI_GRAZE`**
   (peaceful, `:262-263`) instead of hostile. This is the in-world plot pacification of the
   gargoyles, expressed entirely in the spawn layer.
4. **Re-hatch gate** (`:241`) — `if(!IsHatched(egg))` … the body only runs once per arming.
5. **Hatch roll** (`:245`) — `OSI_rand(1,100) <= Quan`.
6. **Embryo loop** (`:249-350`) — for each contained embryo, spawn `num_monsters`:
   - **simple** (`objTyp < OBJ_156 && != OBJ_062`): `AddMapObj` (lands in the ≥256 range,
     no stats), `:271`.
   - **full monster** (`≥ OBJ_156`): `EGG_generate` (§4), `:273`; then `SetAlignment` from
     the egg's `Qual%10` override (`:275-276`).
   - **placement**: the **first** spawn stays on the egg's cell (`isFirstBorn`); each later
     spawn is scattered by `COMBAT_TryTeleport(si, onScreenNotOk)` (`:285`) — random cell
     in a ±3 box, rejecting on-screen cells when `onScreenNotOk` (which is `!ForceHatching`
     unless the egg is `LOCAL`, `:226-229`); if it can't place, the spawn is deleted.
   - **combat AI** (`:334-337`): `npcMod = GetQual(embryo)`; written to `NPCMode` +
     `NPCComMode`. Gargoyle + `AI_BERSEK` doubles STR/DEX/INT (`:344-348`).
   - **multi-tile creatures**: silver serpent `OBJ_19D` (head + curve/tail segments,
     `:291-315`) and tangle vine `OBJ_16D` (vine + 4 `OBJ_16E` tentacles, `:316-330`) build
     their bodies here; dragon/hydra/two-part bodies are built inside `EGG_generate` (§4).
7. **Shamino's warning** (`:351-360`) — first time an attack-the-player monster hatches
   from a non-local egg, Shamino announces the compass direction ("…approaching from the
   <dir>"), gated by `D_17B6` so it fires once.
8. **Latch off** (`:363-364`) — `SetHatched(egg)` + `SetInvisible(egg)`, unconditionally.

---

## 4. Monster creation — `EGG_generate` (`C_2E2D_0499`, `seg_2E2D.c:120-194`)  *(seam)*

`EGG_generate` is **the** general monster constructor — not egg-specific. Callers (agent-
scanned): egg hatch (`:273`, `:321`), **summon-family spells** (`seg_1944.c:1116` animate,
`:1157` replicate, `:1741` summon, `:1743` summon daemon, `:1981` mass-summon), **monster-
death split** (`seg_2337.c:310`, insect reproduction), **rest-time random encounter**
(`seg_3200.c:141`), and a **scripted horse spawn** (`seg_27a1.c:2621`). So the egg is one
of several front-ends onto a shared pipeline.

What it does (`:129-191`):

- `AddMonster` (§5) to claim a slot; roll stats from the **monster-class tables** via
  `mkRandom`:
  - `STREN/DEXTE/INTEL/HitPoints = mkRandom(D_3522_*[class])`,
    `Level = (HitPoints+29)/30`, `NPCStatus = D_3522_0202[class]` (class-default
    alignment), `MAGIC = MaxMagic`, `MovePts = DEXTE`, **`ExpPoints = 100`** (constant),
    `NPCMode = NPCComMode = AI_ASSAULT` (default until the embryo `Qual` overrides it).
  - `mkRandom(val)` (`:40-45`): `half=val/2; rand(0,half) + (val-half) + rand(0,half)` →
    spread on **`[ceil(val/2) … 1.5·val]`**, centered ~`val`.
- multi-tile bodies built here: dragon `OBJ_19B` (body+head+tail+2 wings, `:164-182`),
  hydra `OBJ_176` (8 `OBJ_1A9` heads, `:183-189`), `≥OBJ_1AA` two-part creatures
  (`:156-163`).
- `C_2E2D_00BE` (`:50-118`) generates **possessions** (spells / weapons / armor / treasure
  drops) from the loot tables — the monster-economy layer.

### Monster-class tables (`seg_3522.c`) — structure + worked example

`D_3522_0000` (`:14-24`) is the **class list**: 62 monster `OBJ_xxx` entries + a `0`
sentinel. `GetMonsterClass(objType)` (`seg_2E2D.c:27-38`) linear-scans it; the returned
index addresses every parallel array:

| Array | `seg_3522.c` | Per-class field |
|---|---|---|
| `D_3522_0082` | `:26` | STR base |
| `D_3522_00C2` | `:33` | DEX base |
| `D_3522_0102` | `:40` | INT base |
| `D_3522_0142` | `:47` | ARM (armor) |
| `D_3522_0182` | `:54` | DMG (damage) |
| `D_3522_01C2` | `:61` | HP base |
| `D_3522_0202` | `:75` | alignment (NEUTRAL/EVIL/GOOD/CHAOTIC) |
| `D_3522_0242` | `:86` | special-ability flags (`MONSTER_*`) |
| `D_3522_02C2` → `D_3522_0342` | `:158` / `:173` | loot offset → packed possession bytes |

**Worked example — gargoyle.** `OBJ_16A` is class index **0x13**, `OBJ_16B` index **0x14**
(`seg_3522.c:17`):

- `OBJ_16A` (winged): STR 15 · DEX 32 · INT 33 · ARM 5 · DMG 6 · **HP 50** · EVIL.
- `OBJ_16B` (gargoyle): STR 25 · DEX 19 · INT 8 · ARM 10 · DMG 15 · **HP 30** · EVIL.

The throne ambush (§7) spawns `OBJ_16B`. Its live spawn-rolled stats — STR 23/25/22, DEX
22/20/15, INT 10/5/8 — all land inside `mkRandom` of the base (STR 13–37, DEX 10–28, INT
4–12). **HP is the tell**: `mkRandom(30)` floors at 15, yet one live gargoyle reads **HP
12** → that gargoyle has taken combat damage; the loaded data is a *played* DOSBox save,
not a fresh one. (STR/DEX/INT/EXP/alignment/AI are spawn-time and survive combat; HP is
current.)

**Seam boundary.** The full 62-row stat/loot tables and `C_2E2D_00BE`'s probability
ladder belong to a future **monster/combat** research doc; the egg port only needs
`EGG_generate`'s *interface* (in: type+x+y+z+mutant-bit; out: a fully-statted monster slot)
and the gargoyle row above as its worked example.

---

## 5. Slot allocation — the object table (`seg_1184.c`, `BSS.ASM`)

The object table is **`0xC00` = 3072 entries** (`BSS.ASM`: `ObjShapeType`/`ObjStatus`/
`Link` `dw/db 0C00h`, `ObjPos` `3*0C00h`). But the **per-creature stat arrays are only
`0x100` = 256** (`STREN`/`DEXTE`/`HitPoints`/`NPCStatus` `db 100h`). So **only slots
0–255 can be creatures with stats**; 256–3071 are stat-less map objects. Three regions:

| Slots | Role | Stat arrays? |
|---|---|---|
| `0x000–0x0DF` (0–223) | **permanent NPCs** (named townsfolk, objlist-loaded) | yes |
| `0x0E0–0x0FF` (224–255) | **temporary-monster pool** (32 slots, always `LOCAL`, recycled) | yes |
| `0x100` (256) | list-head sentinel (`Link[0x100]`, not allocated) | — |
| `0x101–0xBFF` (257–3071) | **map objects** (items, doors, body parts) | no |

Two free-lists, built by `C_1184_3B1D` (`seg_1184.c:1849-1864`):

```c
for (si=0; si<0xbff; si++) Link[si] = si+1;
Link[0xff] = -1;        // ends the monster-pool chain (0xe0..0xff)
Link[0x100] = -1;       // map-object list anchor
Link[0xbff] = -1;       // ends the map-object chain
D_BDD6 = 0xe0;  D_E6E2 = 0x20;     // monster free-list head 224, count 32
D_D5DA = 0x101; D_E6E0 = 0xaff;    // map-object free-list head 257, count 2815
```

- **`AddMonster`** (`:689-720`) pops the **monster** list (`D_BDD6`/`D_E6E2`) → slots
  224–255. Sets `ObjStatus = LOCAL|OWNED`, `NPCMode = AI_ASSAULT`. Returns −1 when the
  32-slot pool is full.
- **`AddMapObj`** (`:642-666`) pops the **map-object** list (`D_D5DA`/`D_E6E0`) → slots
  257+.
- **`DeleteObj`** (`:751-793`) pushes a slot back onto its pool (`<0x100` → `D_BDD6`, else
  `D_D5DA`).

**Why the throne gargoyles are 224/225/226.** They're full monsters
(`EGG_generate`→`AddMonster`), and at new-game-init the monster free-list head is `0xe0`
(224) with all 32 slots free, so three back-to-back allocations hand out 224 → 225 → 226.
The egg code's `if(si >= 0x100) continue;` (`seg_2E2D.c:331`) skips per-NPC AI/stat
assignment for *simple* spawns that went through `AddMapObj` into the ≥256 range (they have
no stat arrays).

---

## 6. Respawn / re-arm — `C_1184_19AA` (`seg_1184.c:795-840`)

The **area stream-out** routine (runs when the active window scrolls so an object leaves
the `±20` box). Two loops decide the fate of temporaries:

- **Temporary monsters** (`:802-816`, slots `0xe0..0xff`): a `LOCAL` creature that left the
  box is `DeleteObj`'d (recycled). So wandering monsters you out-run are cleaned up.
- **Eggs** (`:818-839`, the map-object chain): for an egg that left the box —
  ```c
  if (IsLocal(si) || ObjShapeType[si] == 0)  DeleteObj(si);          // LOCAL → gone
  else if (GetType(si) == OBJ_14F && IsHatched(si))  ClrHatched(si); // non-LOCAL → re-armed
  ```

That `else` branch is **U6's wilderness respawn**: a non-`LOCAL` egg's `HATCHED` bit is
*cleared* when it streams out, so returning later re-runs `EGG_hatches` (`!IsHatched` true
again) → a fresh pack. A `LOCAL` egg instead hits the `if` branch and is **deleted** — it
can never re-arm. **One flag, opposite lifetimes.**

**Other (non-egg) spawn paths** (so the doc's "respawn" picture is complete): rest-time
**random encounters** (`HasNightEncounter`, `seg_3200.c:128`, called only from the rest
loop `seg_3200.c:405` → 1–8 monsters via `EGG_generate`), **summon spells**, and
**monster-death splits**. **No periodic/day-based respawn timer exists** — wilderness
regeneration *is* the egg re-arm above (verified firsthand; the "no timer" negative claim
is supported by re-arm being the only area-driven path).

---

## 7. Worked example — the opening throne ambush (the `(307,350)` egg)

Read live (read-only) from Zane's loaded data at the new-game start tile `(307,352)`,
Lord British's throne room:

- **Egg** `OBJ_14F` at `(307,350)`: status `0x62` (`HATCHED|LOCAL|INVISIBLE`), `Quan=100`,
  `Qual=2`. Contains **one embryo**: gargoyle `OBJ_16B`, `Quan=3`, `Qual=8`.
  - `Quan=100` → 100% hatch **and** exact count (no random reduction).
  - `Qual=2` → anytime, alignment `((2)-1)<<5 = 0x20 EVIL`.
  - embryo `Quan=3` → three monsters; embryo `Qual=8` → `AI_ASSAULT`.
  - ⇒ a **deterministic 3 × EVIL, AI_ASSAULT gargoyle** ambush.
- **The three spawns** (objlist NPC slots **224/225/226**, obj 363): `NPCMode=NPCComMode=8`
  (AI_ASSAULT), `NPCStatus=0x20` (EVIL), `EXP=100`, `Level=(HP+29)/30`, stats `mkRandom`
  off the `OBJ_16B` base — every field a fingerprint of `EGG_generate`/`EGG_hatches`.

**The `LOCAL` flag does double duty:** at hatch it bypasses the "don't hatch within 8
tiles" rule and lets the gargoyles spawn *on-screen* on top of you (`:226`, `:381`); at
stream-out it routes the egg to *delete* (§6) so the ambush is **one-time** — flee the
throne room without killing them and the egg + the three `LOCAL` gargoyles are all cleaned
up, never to return. Force-hatch happens because new-game entry runs the teleport path
(`seg_101C.c:315`, `ForceHatching=1`).

---

## 8. Factory vs game-save

This is the concrete form of the "starting gargoyles appear in the *game* save, not the
*factory* save" observation:

Both halves are now **verified live** (read-only, against Zane's own factory and played
data sets):

- **Factory copy** (`D_2CCB=0`, pristine pre-character-creation): the egg `(307,350)` is
  present with status **`0x20` (LOCAL only) — un-hatched**, `Quan=100`/`Qual=2`, its
  gargoyle embryo (`OBJ_16B`, `Quan=3`/`Qual=8`) intact; **no gargoyle entities at the
  throne**, and **slots 224–226 are all-zero (empty)**. The game has never run, so nothing
  force-hatched.
- **Created / played save** (`D_2CCB=5`): the *same* egg is status **`0x62`
  (`LOCAL|HATCHED|INVISIBLE`)** and the three gargoyles occupy slots 224–226. (HP 12 on one
  shows the ambush was mid-fight when saved.)

**The only delta between the two is the egg's status byte gaining `HATCHED|INVISIBLE` and
the three monster-pool slots filling** — Quan/Qual/embryo are byte-identical (shipped
`objblk` data). So the gargoyles materialise purely from the hatch at game start; the egg
is the mechanism, and **`LOCAL` is authored into the egg pre-hatch** (present in the
factory `0x20`), confirming it's the designers' flag, not set at hatch time.

The clone neither runs character-creation nor hatches eggs, so whatever it shows is purely
what the loaded files contain — which is why the created save *has* the gargoyles and the
factory copy would not.

---

## 9. Clone state — what a port reuses / ECS mapping

| Source concept | Clone today | Port note |
|---|---|---|
| egg `OBJ_14F` objects | **already loaded** as inert, invisible, LOOK-able entities (render-skipped) | the embryos are their `Container` contents (I-6) — already resolved |
| `EGG_hatchArea` on area-load | clone **demand-loads regions** (the trigger seam exists) | **decided (§9.1):** hatch on *avatar* entry into new territory, NOT on camera-driven region load; proximity gate = avatar-centered `nearRadius` |
| force-hatch on teleport | I-moongate added `teleportParty`/`gateTravel` (= the `seg_101C` teleport path, **minus** the hatch) | drop a `ForceHatching` equivalent into that path |
| 256/3072 slot table + 32-slot monster pool | ECS handles (no fixed table); no "temporary pool" | tag spawns `LOCAL`/temporary; an avatar-keyed **cull pass** reaps them (§9.1) |
| `C_1184_19AA` stream-out (delete LOCAL / re-arm non-LOCAL) | clone keeps regions resident (`project_ultima6_no_region_unload`), so not ported wholesale | **decided (§9.1):** port the *behaviour* as an avatar-keyed **cull + re-arm** pass — cull spawned creatures past a cull radius > `nearRadius`; re-arm non-`LOCAL` eggs / delete `LOCAL` eggs. Restores wilderness respawn without region streaming. |
| `HATCHED` bit persistence | snapshot persists component state | persist `HATCHED` so a reload doesn't re-hatch |
| gargoyle pacification | Amulet `OBJ_04C` + party-type check not yet needed | add when eggs spawn gargoyles |

Legacy `../ultima6/`: object IDs + the `HATCHED` flag accessor only (`obj.js`) — **no egg
logic** (same status as moongate/NPC-AI: no JS blueprint to lean on).

### 9.1 Decided clone spawn/cull model (with Zane, 2026-06-14)

The clone keeps regions resident (no stream-out), so source's region-stream lifecycle
(hatch on stream-in, cull/re-arm on stream-out) can't be inherited wholesale. The decided
substitute ports the *behaviour* as **avatar-keyed passes** and ignores the free camera:

1. **Trigger = avatar, never the camera.** Hatching fires only for the avatar's area, on
   avatar movement/teleport into new territory — panning the god-camera renders regions but
   does **not** hatch their eggs (otherwise sightseeing would populate the whole map).
   "Loaded for render" and "eggs hatched" are decoupled. Source keys on `MapX/MapY` = the
   avatar; the clone's camera is a pure view artifact. (Same camera-is-not-the-avatar lesson
   as the I-9h NPC-teleport guard, but the *opposite* keying: teleport suppression gates on
   the **camera**, spawn gates on the **avatar** — because teleport is about "don't pop into
   my gaze," spawn is about "monsters populate where I actually am.")

2. **Spawn proximity = avatar-centered, viewport-derived `nearRadius`.** Eggs hatch only
   *beyond* it, so monsters appear off the visible bubble and walk in. This replaces
   source's literal `CLOSE_ENOUGH(8)` — 8 tiles was off-screen on 320×200 but is plainly
   on-screen at the clone's render-to-fit size, so reuse the I-9h `Viewport.nearRadius`
   (half the visible extent + margin). **`LOCAL` eggs bypass this** (the throne ambush must
   spawn on the avatar, in view — source's `IsLocal` bypass).

3. **Camera ignored for placement.** No camera-relative scatter, no whole-hatch camera gate.
   The non-firstborn scatter (`COMBAT_TryTeleport`) keeps source's avatar-relative on-screen
   test, just sized to the viewport. Accepted cost: if you pan the camera onto the avatar's
   hatching eggs, a monster (firstborn or scattered) may wink in — rare, and it matches
   source's "they materialise around you" feel.

4. **Cull + re-arm = source steady-state, one avatar-keyed pass** (the `C_1184_19AA`
   behaviour, minus full region streaming):
   - **Cull** spawned creatures (tagged `LOCAL`/temporary) that fall outside a **cull radius
     larger than `nearRadius`** — a two-radius ring (source's 8-spawn vs 20-cull). Spawns
     only; permanent NPCs and party are never culled. Born just outside `nearRadius`, a
     hostile spawn moves *inward* to attack and is reaped only once the avatar leaves it
     outside the cull radius.
   - On the same pass, for eggs left behind: **re-arm** non-`LOCAL` eggs (clear `HATCHED`)
     so a return re-populates; **delete** `LOCAL` eggs (one-shot ambushes).

5. **Stamp the AI mode; never gate spawning on it (decided with Zane, 2026-06-14).** Hatch always
   spawns the creature and stamps `NPCMode`/`NPCComMode` from the embryo's `Qual` (source-faithful,
   §3 step 6) — regardless of whether that mode has a handler yet. The existing AI dispatch (I-16 /
   I-17) ticks the modes it implements (`SCHEDULE`/`WANDER`/`GRAZE`/`LOITER`/`GUARD`) and **ignores
   the rest, so an unhandled mode simply idles** (a hatched gargoyle's `AI_ASSAULT` does nothing
   until combat lands). Because the mode is already stamped, **a later-implemented handler applies
   automatically** to already-spawned creatures — no retrofit. **No combat now**, so most hatched
   hostiles idle; that is expected, not a gap. (This is also why sub-step b can land before the
   sub-step d monster-gen seam: spawn + stamp first, behavior fills in as handlers arrive.)

This yields source's steady state — populate near the avatar → reap on leave → regenerate on
return — without porting region streaming, and **resolves the "no wilderness respawn" fork**
the table above used to flag. The avatar-keyed cull pass is the clone's stand-in for the
stream-out lifecycle; everything else about regions stays resident.

---

## 10. I-egg — build shape (greenlit Path A, 2026-06-14)

**This is the active step.** **Cadence: one save-point commit per sub-step, browser-verified,
then squash to `impl I-egg`** (Zane's pick; repo-root sub-step convention). Build order is
**a → b → d-visual → c → e → f**, with **d-stats deferred** (combat). Each sub-step below names
the source routine + the clone seam it hooks (full integration map: §9 table; decided spawn/cull
model: §9.1). Verify against real data per sub-step (the clone runs in the browser preview;
multi-tile test eggs are listed under d-visual).

- **a — Data + decode:** confirm egg/embryo `Qual`/`Quan` decode on real data; add an
  `Egg`/embryo read path (mostly there via I-6 containment).
- **b — Hatch core:** `EGG_hatches` minus monster-gen — the gates (Armageddon/day-night/
  hatch-roll), the embryo loop, alignment override, `SetHatched`+`SetInvisible`. Spawn a
  *placeholder* creature (or a minimal `AddMonster` analog) so the flow is testable before
  the stat pipeline lands.
- **c — Trigger wiring (§9.1):** hatch on *avatar* entry into new territory (avatar-centered
  `nearRadius` proximity) + force-hatch on the I-moongate teleport path; camera pan never
  hatches.
- **d — Monster-gen seam, SPLIT in two (the halves defer for different reasons):**
  - **d-visual — multi-tile bodies (IN I-egg; combat-independent):** assemble + link the
    part-entities — silver serpent / tangle vine (source builds these in `EGG_hatches`) and
    dragon / hydra / two-part large creatures (source `EGG_generate` `:156-189`). Parts are pure
    geometry (no stats). **Two flavors to resolve at impl-read:** footprint-sprite (one entity, a
    2-tile sprite — likely cow/horse, may already render via the I-16 footprint path) vs linked
    part-objects (dragon = body+head+tail+2 wings, hydra = 8 heads — parts must **cull together**
    in (e) and **follow** the body on move). Moving grazing animals ride the already-implemented
    GRAZE/WANDER, so those hatches are fully functional **pre-combat** (part-following is needed
    for them, not a combat-era add). Verification eggs: dragon `(300,605)` objblkce, hydra
    `(375,64)` objblkca, tangle vine `(354,484)` objblkcd, giant ants across objblkgb.
  - **d-stats — stat roll + loot (DEFERRED, combat-gated):** `EGG_generate`'s `mkRandom` roll
    from `D_3522` (HP/STR/DEX/INT/Level/MAGIC/EXP) + `C_2E2D_00BE` possessions (the §4 seam) —
    nothing reads these until combat; until then b's placeholder stands in.
- **e — Lifetime (cull + re-arm, §9.1):** one avatar-keyed pass — cull spawned creatures past
  a cull radius > `nearRadius` (two-radius ring, spawned-only tag), re-arm non-`LOCAL` eggs /
  delete `LOCAL` eggs (source steady-state).
- **f — Pacification + flavor:** gargoyle `AI_GRAZE` via Amulet/party-type; Shamino's
  direction warning.

**The d-split (decided with Zane, 2026-06-14, then data-verified).** Multi-tile *rendering*
(d-visual) is a visual, combat-independent concern; the combat-gated stat roll + loot (d-stats)
is separate. Zane's call to split was confirmed by a **full-world objblk scan** (read-only, all
69 regions): of **943 eggs / 1035 embryos, 234 eggs (~25%) hatch multi-tile creatures** — Dragon
`0x19B` (55×), Giant Ant `0x1AB` (69×), Alligator `0x1AD` (39×), plus Giant Scorpion `0x1AA`,
Cow `0x1AC`, Horse `0x1AE` (the two-part quadrupeds/insects), Hydra `0x176`, Tangle Vine `0x16D`,
Silver Serpent `0x19D`. So d-visual is **NOT rare → it lands IN I-egg** (deferring it would
stub a quarter of all hatches, including common wildlife). Only **d-stats stays deferred** for
combat. (Note `0x171` Drake `0x170` Skeleton etc. are single-tile and need no d-visual; the
distinct `OBJ_1A1`/`1A2` Dragon Egg is NOT an `OBJ_14F` egg — §11.)

---

## 11. Open / unverified items

Flagged per the CLAUDE.md "verify negative claims / separate decoded facts from memory"
discipline.

- **Dragon egg `OBJ_417`/`OBJ_418`.** A distinct unhatched/hatched frame-pair object,
  *not* `OBJ_14F` — outside `EGG_hatchArea`. Verify its mechanism (likely a USE/quest
  object) before assuming it's part of this system.
- **Full `D_3522` tables + `C_2E2D_00BE` loot.** Deliberately a seam (§4); transcribe in a
  monster/combat research doc when that subsystem is in scope.
- **`COMBAT_TryTeleport` exact bounds.** Quoted from `seg_2337.c:141-163` (agent-found):
  ±3 scatter box, rejects on-screen cells when `onScreenNotOk`. Re-read at impl time if the
  scatter feel matters.
- **Rest-encounter path (`seg_3200.c`).** Agent-found (`HasNightEncounter` `:128`, rest
  loop `:405`); re-derive from source if/when rest is ported.
- **Egg destruction via the rune+mantra moonstone puzzle (`C_27A1_4B0B`, I-20).** Some gargoyle
  eggs guard a force-field moonstone shrine (e.g. `(503,359)`). The egg is destroyed — not by
  combat — when the player solves the shrine: USE the matching virtue Rune (`OBJ_0F2..0F9`) +
  speak the mantra (`C_27A1_4B98`, `seg_27a1.c:2295`), which `DeleteObj`s the Force Field
  (`OBJ_033`) and calls `C_27A1_4B0B` to delete the egg's embryos + the egg (the `±20` scan for
  an `OBJ_14F` holding an `OBJ_16A/16B`). Until then the non-LOCAL egg re-arms on every return
  (faithful respawn). The rune USE handler is an **I-20** item; the egg-destroy half is trivial
  given this doc's read path (`findEggs` + `deleteMapObject`). Found in the I-egg play-test review.
