# Research: U6 NPC AI, schedules, and pathfinding

**Status:** decoded 2026-05-28. `seg_1E0F.c` (2295 lines, the
"NPCTracker" module) read in full for the AI tick, per-mode
dispatcher, schedule transitions, and pathfinding. Supporting data
structures from `u6.h` + `ai.h`; schedule-file format cross-checked
against `../ultima6/doc/schedule.txt` (Nuvie). Movement-legality
core (`C_1E0F_000F`) read; a few render-side primitives
(`C_1E0F_0664` face-and-animate) and the combat-AI handlers
(`COMBAT_AI_*` in `seg_2337`) are noted but out of scope here.

Citations use relative paths within the u6-decompiled clone (e.g.,
`seg_1E0F.c:2147`). The clone's absolute path is per-PC; see
[`../CLAUDE.md`](../CLAUDE.md) §"Source of truth".

**The legacy `../ultima6/` port has NO NPC AI** — it's a map/tile
viewer plus the conversation demo. `npcMode` appears only as a
worktype field read from `objlist` (`obj_manager.js`) and consumed
by the conversation VM (`script.js`). So unlike the conversation VM
(which has a substantial legacy port — see
[`research_conversation_vm.md`](research_conversation_vm.md)), the
NPC AI subsystem must be built from u6-decompiled directly.

## Headline structure

NPCs run on an **action-economy turn scheduler**, not a real-time
loop. Each player action triggers one `C_1E0F_4E0A()` call (the
"NPC tick") from the game-loop epilogue (see
[`research_game_loop.md`](research_game_loop.md) §"NPC tick"). Inside
that tick, NPCs spend **move points** (`MovePts[npc]`) until the
round exhausts; refills come from **dexterity** (`DEXTE[npc]`); and
game time advances 1 minute each time a full round is consumed.

Three layers:

| Layer | Function | Role |
|-------|----------|------|
| **Scheduler** | `C_1E0F_4E0A` at `seg_1E0F.c:2147` | Picks the highest-priority ready NPC by move-point/dexterity ratio, advances time when the round exhausts, loops until the active party member is back in player control. |
| **Per-mode dispatcher** | `C_1E0F_3E6A` at `seg_1E0F.c:1733` | `switch(NPCMode[npc])` — routes each NPC's turn to a combat handler, a schedule-driven movement handler, wander, pathfollow, etc. |
| **Movement + pathfinding** | `C_1E0F_2D37` (build path) + `C_1E0F_2A74`/`C_1E0F_25F9` (Dijkstra + traceback) + `TryMoveTo`/`TryStraightMove`/`__TryDiagMove`/`C_1E0F_000F` | Bucket-priority Dijkstra over a 40×40 work area; RLE-encoded path output; per-step terrain-legality + move-point accounting. |

NPC AI mode is a per-entity state machine. `NPCMode[npc]` holds the
current mode; modes < 0x80 are combat / disposition states, modes
≥ 0x80 are schedule / navigation states.

## AI modes (`ai.h`)

```
0x00 AI_MOTIONLESS      (never ticked)
0x01 AI_FOLLOW          (party member following the leader)
0x02 AI_COMMAND         (party member under player control — "player's turn")
0x03 AI_FRONT  0x04 AI_REAR  0x05 AI_FLANK  0x06 AI_BERSEK
0x07 AI_RETREAT 0x08 AI_ASSAULT                (combat dispositions)
0x09 AI_SHY 0x0A AI_LIKE 0x0B AI_UNFRIENDLY 0x0C AI_GRAZE
0x0D AI_TANGLE 0x0E AI_IMMOBILE 0x0F/0x10 (guard-like)
0x12 AI_ARREST 0x13 AI_FEAR
--- navigation (>= 0x80) ---
0x80 AI_SCHEDULE        (needs to (re)acquire its scheduled goal)
0x81 AI_FINDPATH        (needs a path computed)
0x82 AI_SEEKOBJ         (path toward a sought object type)
0x83 AI_ONPATH          (following a computed path)
0x84/0x85/0x86          (path-retry escalation states)
--- schedule worktypes (>= 0x87) ---
0x87-0x8A AI_STAND_N/E/S/W   0x8B-0x8E AI_GUARD_N/E/S/W
0x8F AI_WANDER  0x90 AI_LOITER  0x91 AI_SLEEP  0x92 AI_SIT
0x93 AI_EAT  0x94 AI_FARM  0x95 AI_PLAY  0x96 AI_CONVERSE
0x97 AI_THIEF  0x98 AI_RINGBELL  0x99 AI_BRAWL
0x9A (npc-retreat?)  0x9B AI_VIGILANTE
```

The schedule worktypes (≥ 0x87) double as both the "destination
behavior" stored in a schedule entry's `action` byte AND the live
`NPCMode` once the NPC reaches that destination.

## The NPC tick — `C_1E0F_4E0A` (`seg_1E0F.c:2147-2247`)

Called once per player action. Structure:

```c
C_1E0F_4B6A();   // party leader/active reassignment
C_1E0F_4746();   // compute party + enemy "gravity centers" (combat AI)
C_1E0F_464A();   // service AI_FINDPATH NPCs: teleport off-area ones,
                 //   build paths, promote stuck AI_86 → AI_FINDPATH
do {
    do {
        // scan all 256 object slots for the highest-priority ready NPC
        for(i = 0; i < 0x100; i++) {
            if(eligible(i)) {
                if(off_work_area(i)) { teleport-or-reset; MovePts[i]=0; }
                else if(NPCMode[i] != AI_FOLLOW) {
                    if(NPCMode[i] == AI_SCHEDULE) __AtDestination(i);
                    // priority = MovePts*roundDexte - DEXTE*roundMovePts
                    // favor high movepts, low dexterity
                    if(MovePts[i] >= DEXTE[i] || better_priority) pick = i;
                    if(MovePts[i] >= DEXTE[i]) break;  // good enough, act now
                }
            }
        }
        if(di <= 0) {  // no NPC had positive move points → round over
            for(i = 0; i < 0x100; i++)
                MovePts[i] = (MovePts[i] < 0) ? MovePts[i]+DEXTE[i] : DEXTE[i];
            C_0A33_1355(1);   // advance time 1 minute
        }
    } while(di <= 0);

    if(!C_1E0F_0FA9(pick)) {   // not stuck being dragged-under by a corpser
        if(NPCMode[pick] != AI_COMMAND && NPCMode[pick] != AI_FOLLOW) {
            C_1E0F_3E6A(pick);  // <-- run the NPC's AI for this turn
            C_1E0F_4B6A();
        }
        C_0A33_0D06();          // composite-dirty redraw if needed
    }
} while(NPCMode[pick] != AI_COMMAND || IsDraggedUnder(pick));

// hand control to whichever party member ended up AI_COMMAND
if(Party[Active] != pick) SetActive(slot_of(pick));
```

### Eligibility (`seg_1E0F.c:2176-2185`)

An object slot `i` is a tickable NPC iff:
- `ObjShapeType[i] != 0` (slot occupied),
- `NPCMode[i] != AI_MOTIONLESS`,
- not paralyzed, not dead,
- not asleep **unless** `NPCMode[i] == AI_SCHEDULE` (so a sleeping
  NPC can still be woken by a schedule transition),
- `MovePts[i] > 0`,
- `GetCoordUse(i) == LOCXYZ` (on the map, not in inventory /
  contained) and `GetZ(i) == MapZ` (same dungeon level).

### Priority selection

The inner scan keeps the NPC with the best
`MovePts[i]*roundDexte - DEXTE[i]*roundMovePts` (favoring lots of
move points relative to dexterity), and breaks immediately if a NPC
has `MovePts >= DEXTE` (a clearly-ready NPC short-circuits the
scan). This produces a roughly fair interleaving where fast NPCs
(high DEXTE) act more often per minute.

### Move-point economy

- `DEXTE[npc]` is the per-round refill (forced ≥ 1 at init in
  `C_1E0F_512A`).
- `MovePts[npc]` is the spendable budget. Negative carryover is
  allowed (a turn that overspends leaves a debt that the next
  refill pays down: `MovePts = MovePts<0 ? MovePts+DEXTE : DEXTE`).
- Spending: `SubMov(npc, cost)` (`seg_1E0F.c:441`) deducts, with
  modifiers — horses (`OBJ_1AF`) move at half cost; the slow spell
  (`SpellFx[10]`) halves player-controlled budgets; the haste/quick
  spell (`SpellFx[7]`) doubles attacker budgets. `SubTerrainMov`
  (`seg_1E0F.c:1402`) computes terrain cost = `5 + Σ(TerrainType[tile] >> 4)`
  over the tiles at the NPC's cell, then calls `SubMov`.
- Anti-stall: at the end of `C_1E0F_3E6A`, if the NPC's `MovePts`
  didn't change this turn (it couldn't act), force-deduct 10 so it
  can't spin forever (`seg_1E0F.c:1846-1847`).

### Off-area handling

The active "work area" is a 40×40 tile window
(`AREA_W = AREA_H = 40`) centered on the map position. NPCs whose
on-screen-relative coordinates fall outside this window (and aren't
near the 11×11 viewport) are **teleported straight to their
scheduled destination** via `C_1E0F_291C` rather than simulated step
by step (`seg_1E0F.c:2186-2196`). This is both a cycle-saver and a
gameplay property: NPCs "are where their schedule says" by the time
the player arrives. `AllowNPCTeleport` gates whether the teleport is
allowed when the NPC is near the player (normally not).

**Port deviation (I-5d, picked 2026-05-31).** The clone chose
**OBJBLK residency** instead of a 40×40 tile box: an NPC is active
iff its current `(x, y)` falls in an OBJBLK region that's currently
in `SpatialIndex.loadedRegions`. The set is monotonic — once a region
loads, it stays loaded for the page session — so the active cohort
grows as the player explores and eventually covers all 256 NPCs. The
working set is larger than source's (up to ~4 × 128 × 128 = 65k tiles
straddled vs. source's fixed 1600), but for I-5's
schedule-resolution-only workload (one resolver call + maybe one
position snap per active NPC per game-hour), the cost is rounding
error. Off-area teleport is the same in spirit: NPCs in unloaded
regions stay frozen at their last known position and "are where the
last hour-tick put them" by the time the player visits. See
`progress.md` §"I-5d" + the chat 2026-05-31 for the rationale +
expected I-6+ tightening (inner radius for pathfinding cost control).

## Pre-tick maintenance

### `C_1E0F_4B6A` — party leadership (`seg_1E0F.c:2083-2145`)

Reassigns the active party member when the current one becomes
incapacitated (charmed, dragged-under, blinded `Isbis_0016`). If the
active member can't act, control passes to the next able member
(`NPCMode` flips: old active → AI_FOLLOW, new → AI_COMMAND), and the
map re-centers on the new leader. Also triggers the party-death
"requiem" (`C_1E0F_4AFA`) if member 1 (the Avatar) is dead.

### `C_1E0F_4746` — combat gravity centers (`seg_1E0F.c:1962-2061`)

Computes `PartyGravityX/Y` (centroid of non-skirmishing party
members) and `EnemiesGravityX/Y` (centroid of nearby
attack-the-player enemies within 24 tiles). Used by the combat AI
handlers to position front/flank/rear roles. Out of scope for
non-combat "wander Britain" gameplay but runs every tick.

### `C_1E0F_464A` — path service (`seg_1E0F.c:1924-1960`)

Walks NPC slots 2..0xDF looking for `AI_FINDPATH` NPCs, gives each a
freshly-computed path (`C_1E0F_2D37` toward its scheduled xyz),
teleports off-area ones (`C_1E0F_291C`, capped at 3 per tick via
`D_17A5`), and promotes stuck `AI_86` NPCs back to `AI_FINDPATH` for
a retry. Path slots are limited to 8 (`__NewPathIndex` returns the
first free slot 0..7, or 8 if all taken — then path service stops
for this tick).

## Per-mode dispatcher — `C_1E0F_3E6A` (`seg_1E0F.c:1733-1848`)

The heart of NPC behavior. `switch(NPCMode[npc])`:

| Mode(s) | Handler | Behavior |
|---------|---------|----------|
| AI_FRONT / REAR / FLANK / BERSEK / ASSAULT / VIGILANTE / IMMOBILE / TANGLE / RETREAT / SHY / FEAR / LIKE / UNFRIENDLY / 9A | `COMBAT_AI_*` (seg_2337) | Combat positioning + attack. Out of scope here. |
| AI_ARREST | `C_1E0F_39B3` + `C_1E0F_3B60` | Guard approaches party; if adjacent, runs the arrest "come quietly?" dialog (jail-teleport on yes, turns hostile on no). |
| AI_BRAWL | inline + `TryMoveTo` / `C_1E0F_33C4` | Pub brawler: pick an opponent, approach, show a hit, or drift toward schedule spot. |
| AI_CONVERSE / AI_THIEF | `C_1E0F_39B3` + `C_1E0F_3D8D` (steal) / `C_1E0F_3E08` (talk) | Near map center + can see a party member → steal gold or initiate dialog; else move toward schedule spot. |
| AI_ONPATH / AI_84 / AI_85 | `__DoOnPath` | Follow the precomputed RLE path. |
| AI_SEEKOBJ | `__NewPathIndex` + `C_1E0F_2D37` | Build a path toward a sought object type (e.g., a mouse seeking cheese). |
| AI_GRAZE / AI_WANDER | `C_1E0F_37DB` | Random walk (animals graze, idlers wander). |
| AI_LOITER / AI_FARM | `C_1E0F_33C4` | Occasional drift toward the schedule spot (1/8 chance per turn to step, else idle). |
| AI_0F / AI_10 / AI_GUARD_N/E/S/W | inline pacing | 50% chance to idle; else march in a straight line (guard direction or current facing), reversing on a block. This is the "patrol up-and-down" behavior `schedule.txt` describes for 0x8b/0x8c. |
| AI_RINGBELL | inline | If `MustRingBell`, set the church-bell tile animation + chime count (`Time_H % 12`). |
| default | `SubMov(npc, 5)` | Idle (consume move points, do nothing). |

After dispatch: the anti-stall `SubMov(npc, 10)` fires if the NPC
didn't spend anything (couldn't move).

### Wander — `C_1E0F_37DB` (`seg_1E0F.c:1558-1574`)

```c
if(NPCMode != AI_IMMOBILE) {
    if(player-controlled && not at map center && 1/4 chance)
        TryMoveTo(npc, MapX, MapY);     // wander toward the player
    else if(1/8 chance)
        TryStraightMove(npc, rand(0..3)*2, 1);  // random cardinal step
}
SubMov(npc, 5);   // otherwise idle
```

Mostly stands still; occasionally takes one cardinal step. This is
the gentle Britannian-townsfolk drift.

### Drift-toward-target — `C_1E0F_33C4` (`seg_1E0F.c:1448-1462`)

1/8 chance per turn to take one biased-random step toward `(x,y)`
(the schedule destination), else idle. Used by AI_LOITER / AI_FARM /
AI_BRAWL fallback. The bias uses a small geometric-random offset
(`C_1E0F_31C7`, a "flip coins until tails" distribution) so the
motion looks organic rather than beelining.

## Schedules

### Data layout

```c
struct tSchedule {           // u6.h:469
    unsigned char time;      // _00 — packed start-hour + day selector
    unsigned char action;    // _01 — worktype (an AI_* mode >= 0x87)
    struct coord  xyz;       // _02 — packed 10/10/4-bit destination
};
extern struct tSchedule far *Schedule;   // u6.h:474 — flat array
extern unsigned char far *SchedIndex;    // u6.h:490 — per-NPC ACTIVE entry (rel.)
extern int SchedPointer[];               // u6.h:511 — per-NPC FIRST entry index
```

- `SchedPointer[npc]` = index of NPC's first schedule entry;
  `SchedPointer[npc+1] - 1` = its last entry.
- `SchedIndex[npc]` = offset (relative to `SchedPointer[npc]`) of the
  currently-active entry. So the live entry is
  `Schedule[SchedPointer[npc] + SchedIndex[npc]]`.
- `time` byte: low 5 bits = start hour (0-23, 24-hour); high 3 bits
  = day-of-week selector matched against `(Date_D-1)%7 + 1`, or `0`
  = every day (`seg_1E0F.c:2283-2284`).

The on-disk `schedule` file, per source (`seg_0C9C.c:285-287`, the
two-pass read):

```c
OSI_read(si, 0, (0x100 + 1) * sizeof(int), SchedPointer);   // 514 bytes
OSI_read(si, -1, (long)SchedPointer[0x100] * sizeof(struct tSchedule), Schedule);
```

- **Bytes 0..513** — `SchedPointer[0..256]` as **257 × u16-LE**.
  `SchedPointer[npc]` is the start slot for NPC `npc`;
  `SchedPointer[256]` is the sentinel = total slot count. NPC `n`
  owns `Schedule[SchedPointer[n] .. SchedPointer[n+1] - 1]`.
- **Bytes 514+** — `Schedule[0..N-1]` where `N = SchedPointer[256]`,
  5 bytes per `tSchedule` record (`time` + `action` + 3-byte packed
  `coord`).

Entries are sorted ascending by start hour within each NPC's slot
range.

**Tech-doc disagreement (`../ultima6/doc/schedule.txt` is wrong).**
That Nuvie doc reads "0x200 bytes of 256 uint16 + a uint16 entry
count + entries from 0x202 onward." Source's read is `(0x100 + 1) *
sizeof(int)` = **514** bytes of **257** u16-LE values, with the
sentinel taking the role of the "entry count." Trust source.

**Empty-slot encoding quirk.** An NPC with no schedule entries has
`SchedPointer[n] > totalSlots` (i.e. its start pointer is past the
end of the data), producing an effectively-empty range. Source's
resolver loop `for(di = SchedPointer[n+1] - 1; di >= SchedPointer[n];
di--)` handles this naturally — `end < start` means the body never
runs. Real data has `SchedPointer[255] = totalSlots + 1` for the
unused-slot tail; a strict-monotonicity check is too tight here.
(We tripped over this writing the I-5a parser; see
`ultima6_clone/assets/schedule.js` header for the same note in
implementation language.)

### Hourly transition — `C_1E0F_5165` (`seg_1E0F.c:2264-2295`)

Called once per game-hour from the time-advance routine (see
[`research_game_loop.md`](research_game_loop.md) §"Time-advance",
step 6). For each NPC (slots 2..0xDF) currently in a schedule /
retreat mode and not player-controlled:

- Scan its schedule entries **backwards** for one whose hour ==
  `Time_H` and whose day selector matches (or is 0 = daily).
- On match: set `SchedIndex[npc]` to that entry, set
  `NPCMode[npc] = AI_FINDPATH` (so the NPC heads to the new spot),
  and restore a musician's normal sprite if leaving AI_PLAY.

`AI_VIGILANTE` NPCs are also reset to `AI_FINDPATH` here (they
re-acquire their post after a chase).

### Arrival — `__AtDestination` (`C_1E0F_2276`, `seg_1E0F.c:1002-1085`)

Called when an `AI_SCHEDULE` NPC is picked in the tick. Checks
whether the NPC's current position equals its scheduled xyz:

- Sets `NPCMode[npc] = action` (the entry's worktype).
- **AI_SLEEP**: lie down — find a bed (`OBJ_0A3`) under the NPC and
  swap to the sleeping-in-bed sprite, else use the unconscious
  sprite.
- **AI_SIT / AI_PLAY**: find a chair (`OBJ_*` chair via
  `C_1E0F_2184`), set facing; musicians (AI_PLAY) swap to the
  lute-playing sprite (`OBJ_188`).
- **AI_EAT**: find a table, face it, set the table's food frame.
- **AI_RINGBELL**: find the bell pull-chain.
- **AI_STAND_* / AI_GUARD_***: set facing direction from the mode.
- If **not** at the destination → `NPCMode = AI_FINDPATH` (go walk
  there). Musicians stop playing while walking.
- If the NPC is out of the work area → fall back to `AI_SCHEDULE`
  (will be teleported/re-pathed next service).

So the schedule lifecycle is:
`hourly tick sets AI_FINDPATH → path service builds a path →
AI_ONPATH walks it → on arrival __AtDestination sets the worktype
mode → NPC performs the worktype until the next hourly transition.`

## Pathfinding

A **bucket-priority Dijkstra** (uniform-cost search with a radix
priority queue) over the 40×40 work area, producing an RLE-encoded
direction list. All scratch lives in a `t40x40` struct overlaid on
the shared `ScratchBuf` (`seg_1E0F.c:1087-1095`):

```c
typedef struct {
    unsigned char PTH_map[40][40];   // per-cell accumulated cost + 0x80 side-flag
    int           PTH_rank[256];     // bucket heads: PTH_rank[cost] = list head
    int           PTH_link[256];     // free-list / bucket linked-list links
    unsigned char PTH_x[256], PTH_y[256];  // queued cell coords
    unsigned char PTH_resist[40][40];      // per-cell movement cost
} t40x40;
```

### Cost map — `__ComputeResistance` (`C_1E0F_436A`, `seg_1E0F.c:1866-1922`)

Per cell: `PTH_resist = (TerrainType[tile] >> 4) + 1`, or `0xff`
(impassable) for impassable terrain. Then objects in the work area
add cost: doors (`OBJ_129`-`OBJ_12C`) add 1 if open-ish else block,
and block the adjacent cell behind them; pass-through objects
(`OBJ_116`/`OBJ_118`) add 1; large object tiles spread their block
across their multi-tile footprint via `C_1E0F_4265` (handling the
DoubleH `0x80` / DoubleV `0x40` tile flags — same auto-extension
geometry as the render path in
[`research_map_render.md`](research_map_render.md)).

### Search — `C_1E0F_2D37` (`seg_1E0F.c:1286-1389`) + `C_1E0F_2A74` (relax)

- Three target modes: a fixed `(x,y)` cell, a sought **object type**
  (`PTH_object`), or a **favored map-edge direction** (`PTH_direct`,
  used when the goal is off the work area — head toward the edge
  nearest the goal).
- Standard Dijkstra: `PTH_rank[cost]` is the head of a linked list
  of frontier cells at that cost; `PTH_Cur` walks cost levels
  ascending; `PTH_Top` is the free-cell pool. `C_1E0F_2A74` is the
  relax/expand step — for each of 4 neighbors, push at
  `cost + PTH_resist[neighbor]` if cheaper than the recorded cost.
- A two-source trick: the search floods from both the NPC cell
  (flag 0) and the destination cell (flag 0x80) when target is a
  plain cell; the two frontiers meeting (`PTH_map side-flag flips`)
  signals a found path — meet-in-the-middle.

### Traceback — `C_1E0F_25F9` (`seg_1E0F.c:1100-1179`)

From the meeting point, greedily step toward decreasing `PTH_map`
cost, recording each step's direction into the path list. Output is
**run-length encoded**: each byte in `D_8C42->content[PTH_Index][]`
packs a direction (low 2 bits) plus a repeat count (each additional
repeat adds 4). E.g., "east ×3, north ×2" is two bytes. Terminated
by a 0 byte.

Up to **8 concurrent paths** (`PTH_Index` 0..7). A path is owned by
one NPC via `PathObject[index] = npc` and `Leader[npc] = index`;
`PathCounter[index]` is the current RLE position, `PathTries[index]`
the per-step repeat counter.

### Following — `__DoOnPath` (`C_1E0F_387D`, `seg_1E0F.c:1576-1608`)

Reads the current RLE step; `TryStraightMove` in that direction.
When the step's repeat count is exhausted, advance `PathCounter`. On
a block, escalate `AI_ONPATH → AI_84 → AI_85 → AI_86` (each forces
`MovePts = 0` so the NPC waits a turn / retries next tick); at AI_86
the path is abandoned and re-found. On reaching the end of the path
within 2 tiles of the goal → `__AtDestination`.

### Movement legality — `C_1E0F_000F` (`seg_1E0F.c:66-235`)

The big predicate "can this object stand at `(x,y)`?". Considers:
- the object's **monster class** movement capabilities (walk / swim
  / fly / amphibious / ethereal), from `GetMonsterClass`;
- terrain flags (`TERRAIN_FLAG_01` water, `_02` land, `_04` blocks
  flight, `_08` damage tile);
- object blocking (`IsTileBr` breakable / passable bits), doors,
  2×2-footprint objects, fences with directional pass flags;
- party-member pass-through (party can walk through each other when
  `D_17B2` set);
- the sacred-quest gate (`OBJ_1A0` blocks unless `VarInt['Q'-0x37]`).

`TryStraightMove` / `__TryDiagMove` call this, and on success
`MoveObj` + `SetDirection` + `C_1E0F_0664` (face & animate). `TryMoveTo`
picks horizontal/vertical/diagonal order based on the delta to the
target plus randomness, so NPCs don't all move identically.

## Implications for the rebuild

### Action-economy → ECS turn system

`MovePts` / `DEXTE` is a clean action-economy. ECS shape:

- **`MovePoints` component** (current budget) + **`Dexterity`
  component** (per-round refill).
- **`NPCTickSystem`** mirrors `C_1E0F_4E0A`: each player action,
  drain the highest-priority ready NPC, advance the `WorldClock`
  resource one minute when the round exhausts. This is the system
  the game loop kicks once per player command (see
  [`research_game_loop.md`](research_game_loop.md) §"Implications").
- The "advance time when round exhausts" couples to
  `WorldClockSystem` — keep that coupling; it's the mechanic.

### AI mode = state machine component

- **`AIMode` component** (the `NPCMode` byte). The dispatcher is a
  system switching on it. Combat modes can be their own system set
  (deferred). Schedule worktypes are leaf states the NPC sits in.
- **`ScheduleSystem`** runs hourly (driven by `WorldClock`): mirror
  `C_1E0F_5165`. On an hour match, set the NPC's `AIMode = FINDPATH`
  and update its active schedule entry.
- **Schedule data** is static ROM-like: load the `schedule` file
  once into a `Schedule` resource (`Map<npcId, ScheduleEntry[]>`).

### Pathfinding — reimplement, don't transliterate

The bucket-Dijkstra + RLE path + 8-slot pool are 1990 memory
optimizations. The rebuild should reimplement with a modern A* (or
plain Dijkstra) returning a waypoint / direction array per NPC, with
no 8-path cap (every NPC can own its path). Keep the **cost model**
(terrain `(TerrainType>>4)+1`, door/object surcharges, impassable =
∞) — that's the gameplay-relevant part. The meet-in-the-middle
two-source flood is a nice optimization but optional.

The **40×40 work-area window** is the DOS active-area paging limit —
substrate residue per the modern-UX anchor
([`../CLAUDE.md`](../CLAUDE.md) §"Modern-browser UX as architectural
anchor"). The rebuild can path over a larger radius or the whole
level (modern memory). **But** the off-area teleport
(`C_1E0F_291C`) is partly a *gameplay* property (NPCs are at their
scheduled spot when you arrive), not pure optimization — decide per
design whether to keep instant placement for far-away NPCs or
simulate them fully. Recommendation: keep instant placement for
NPCs outside a generous simulation radius; it matches the original
feel and is cheap.

### Minimum-scope subset for "wander Britain"

Needed for the milestone (NPCs move around town on schedules):

1. **Move-point round scheduler** (`NPCTickSystem` + MovePts/DEXTE).
2. **Schedule transitions** (`ScheduleSystem` = `C_1E0F_5165`) +
   **arrival** (`__AtDestination`) — including the stationary
   worktypes AI_STAND_*/GUARD_*/SLEEP/SIT/EAT/FARM/LOITER and their
   sprite/facing side-effects.
3. **AI_FINDPATH → pathfinding → AI_ONPATH → __DoOnPath** chain.
4. **AI_WANDER** random walk.
5. **Movement legality** (a `C_1E0F_000F` subset: terrain walk +
   object/door blocking; skip swim/fly/ethereal until those
   creatures matter).

Deferrable until later milestones:
- All combat modes (`COMBAT_AI_*`, needs `seg_2337`).
- Crime/justice modes: AI_THIEF, AI_BRAWL, AI_ARREST (+ jail
  teleport), AI_VIGILANTE.
- AI_SEEKOBJ (object-seeking pathfind).
- Vehicles / boarding (`Board`/`Unboard`), corpser drag-under,
  party-formation following (`MoveFollowers`).

## Open questions

1. **`C_1E0F_0664`** (face-direction + per-step animation) — called
   after every successful move; body not read. Likely sets the
   sprite frame from direction and triggers the per-step redraw.
   Needs a read before implementing smooth NPC movement animation.
2. **`C_1E0F_1B0E`** (player walk, called from game-loop CMD_80) —
   the player-control movement entry. Not read here; belongs to a
   future `research_player_movement.md` (separate from NPC AI).
   Pairs with `MoveFollowers` (`seg_1E0F.c:501`, the two-pass party
   formation algorithm that references a `doc9.txt` we don't have).
3. **`COMBAT_AI_*` handlers** (`seg_2337`) — the combat dispositions
   (FRONT/REAR/FLANK/BERSEK/ASSAULT/etc.) are a whole subsystem.
   Their own research doc when combat becomes in-scope.
4. **AI_84 / AI_85 / AI_86 thresholds** — the path-retry escalation
   states. Behavior inferred from `__DoOnPath` + `C_1E0F_464A`, but
   the exact "how many ticks stuck before giving up" deserves a
   second read if NPC navigation feels off in the port.
5. **`C_1E0F_2184`** (find adjacent furniture: chair/table/chain) —
   referenced by `__AtDestination` for SIT/EAT/PLAY/RINGBELL; body
   not read. Needed for those worktypes to look right.
6. **Red-gate teleport tables** (`D_171C`/`D_174E`/`D_1780` at
   `seg_1E0F.c:11-34`) — moongate destination coordinates. Not core
   AI; relevant when moongates are implemented.
7. **`Is_ATKPLR` / disposition → combat-mode transitions** — how an
   NPC flips from a schedule mode into a combat mode (alignment,
   aggression triggers) is partly in `seg_2337`; the trigger points
   weren't traced here.

## Cross-references

- [`research_game_loop.md`](research_game_loop.md) §"NPC tick" —
  this doc expands the `C_1E0F_4E0A` summary there into the full AI
  subsystem. **Correction:** that doc called `C_1E0F_0FA9` "the
  actual NPC action dispatcher"; it is actually only the
  corpser-drag-under gate (`seg_1E0F.c:454-471`). The real per-mode
  dispatcher is `C_1E0F_3E6A`. (research_game_loop.md's open-questions
  item 3 is updated accordingly.)
- [`research_engine_overview.md`](research_engine_overview.md) —
  `seg_1E0F` row (NPC AI / path / motion); the global parallel-array
  state (`NPCMode[]`, `MovePts[]`, `DEXTE[]`, `Schedule[]`, etc.).
- [`research_map_render.md`](research_map_render.md) — the DoubleH/V
  tile auto-extension geometry that `__ComputeResistance` reuses for
  multi-tile object footprints.
- [`research_conversation_vm.md`](research_conversation_vm.md) —
  AI_CONVERSE / AI_THIEF call into `TALK_talkTo`; conversation
  `OP_SETMODE` writes `NPCMode` (e.g., to AI_SLEEP) and `OP_JOIN` /
  `OP_LEAVE` flip party members between AI_FOLLOW and schedule modes.
- [`../CLAUDE.md`](../CLAUDE.md) §"Modern-browser UX as architectural
  anchor" — why the 40×40 work-area window + RLE path + 8-slot pool
  are substrate residue the rebuild needn't preserve.
- Tech doc: `../ultima6/doc/schedule.txt` (Nuvie schedule-file
  format + worktype list) and `../ultima6/doc/npcflags.txt`.
- Legacy port: **no NPC AI** — `npcMode` is only read as data in
  `../ultima6/obj_manager.js` and consumed by the conversation VM in
  `../ultima6/script.js`.
