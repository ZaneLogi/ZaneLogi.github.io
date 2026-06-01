# Research: U6 NPC AI, schedules, and pathfinding

**Status:** decoded 2026-05-28; party-follow + avatar-move path added
2026-06-01; **I-8 (avatar movement + party follow) implemented + verified
2026-06-01** — the avatar-move (`C_1E0F_1B0E`), facing (`C_1E0F_0664` +
`MACRO_A`), idle settle (`seg_0A33.c` arm), and `MoveFollowers` sections below
are now landed code; pathfinding (`C_1E0F_2D37`) remains decode-only for I-9.
`seg_1E0F.c` (2295 lines, the "NPCTracker" module) read for the AI tick,
per-mode dispatcher, schedule transitions, pathfinding, and the
party-follow/active-member movement path (`MoveFollowers` + the
`AI_COMMAND`/`AI_FOLLOW` dispatcher exclusion — see §"Party follow + avatar
movement"). Supporting data structures from
`u6.h` + `ai.h`; schedule-file format cross-checked against
`../ultima6/doc/schedule.txt` (Nuvie). Movement-legality core
(`C_1E0F_000F`) read; a few render-side primitives (`C_1E0F_0664`
face-and-animate) and the combat-AI handlers (`COMBAT_AI_*` in
`seg_2337`) are noted but out of scope here.

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

## Party follow + avatar movement

**The active party member and the followers move on a path SEPARATE
from the per-mode dispatcher above.** The NPC tick explicitly skips
`C_1E0F_3E6A` for `AI_COMMAND` (the active player member) and
`AI_FOLLOW` (companions) at `seg_1E0F.c:2225`
(`if(NPCMode[pick] != AI_COMMAND && NPCMode[pick] != AI_FOLLOW)`), and
`AI_FOLLOW` members are also excluded from the move-point turn
allocation at `seg_1E0F.c:2197`. So party motion is **not** AI-driven:

- the **active member** (`AI_COMMAND`) moves on **player input**;
- **followers** (`AI_FOLLOW`) move via **`MoveFollowers`**, called
  immediately after the active member's move — never from the per-NPC
  tick.

This corrects a natural-but-wrong assumption that "party-follow is just
another `NPCMode` case in the dispatcher." It is not; there is no
follow case in the `C_1E0F_3E6A` switch.

### Consumer structure — three move paths, one shared kernel

| Mover | Trigger | Path build? |
|-------|---------|-------------|
| Avatar step (`AI_COMMAND`) | player input | no |
| Follower step (`AI_FOLLOW`) | `MoveFollowers` after avatar move | no |
| NPC schedule walk | `AI_FINDPATH` → `C_1E0F_2D37` (see §Pathfinding) | **yes** |

The bucket-Dijkstra path builder `C_1E0F_2D37` is used by **NPC AI
alone**. All three movers share the **single-step move kernel**:
`C_1E0F_000F` (legality — the clone's `canStandAt`) + `MoveObj` (the
clone's `SpatialIndex.insertAtHead` + `Position` write) + `C_1E0F_0664`
(face & animate). This is why avatar movement and NPC pathfinding are
two separate rebuild steps (I-8 vs I-9) sharing a kernel, not one step
sharing a path builder.

### Active-member move — `C_1E0F_1B0E` (`/*[advance]*/`, `seg_1E0F.c:811-936`)

The player-move entry. Input → command → advance:

- **Input dispatch** (`seg_0C9C.c:1069-1076`): arrow + diagonal keys set
  `AdvanceDir` and raise `CMD_80`. The avatar is **8-directional** —
  `0x148`↑=0, `0x149`↗=1, `0x14d`→=2, `0x151`↘=3, `0x150`↓=4, `0x14f`↙=5,
  `0x14b`←=6, `0x147`↖=7. Encoding is **clockwise from North**, matching
  `DirIncrX[]={0,1,1,1,0,-1,-1,-1}` / `DirIncrY[]={-1,-1,0,1,1,1,0,-1}`
  (`seg_0903.c:20-21`; y increases southward).
- **Command** (`seg_0A33.c:1202-1203`): `case CMD_80: C_1E0F_1B0E(AdvanceDir)`.
- **`C_1E0F_1B0E(dir)`** (`seg_1E0F.c:811`): `si = Party[Active]`; if the
  active member is a ship (`OBJ_19F`/`OBJ_1A7`) the dir is reinterpreted
  through wind/flow (the sail sub-branch); otherwise `new = (MapX,MapY) +
  DirIncr[dir]` (masked `& 0x3ff`), checked by `C_1E0F_000F`. A failed
  legality sets the bump flag `D_17AE` (no `MoveObj`, a "bump" sound), with
  a diagonal-slide fallback under mouse control. On success: `MapX`/`MapY`
  become the destination (the viewport/camera centers on the active
  member), `MoveObj` + facing `C_1E0F_0664`, then `MoveFollowers(si, 0)`.
- **Drunk** (`seg_1E0F.c:820-823`): `DrunkCounter > 3` randomizes `dir` —
  a status effect, deferred.

The **pass** command (`seg_0A33.c:1311-1322`) moves no avatar but still
calls `MoveFollowers(Party[Active], 1)` so a stationary party tightens up.

### Facing-on-step — `C_1E0F_0664` + `MACRO_A` (`seg_1E0F.c:268-438`)

Sprites have **4 facings, not 8**. `MACRO_A(dir, frame)` (`seg_1E0F.c:268`)
collapses the 8-direction move into a 4-way facing:

- **Cardinal** `dir` (even): `frame = dir >> 1` → 0=N, 1=E, 2=S, 3=W.
- **Diagonal** `dir` (odd): **hysteresis** — keep the current facing unless
  the diagonal points more than a right angle away
  (`if(((dir>>1) - frame + 1) & 3) > 1) frame = (frame+2) & 3`), in which
  case flip 180°. So walking NE while facing W flips to E; walking NE while
  facing N or E keeps it. This avoids facing-flicker on diagonal movement.

For humanoid actors (`OBJ_178..183`, the party range) the sprite frame is
`walkCycle + (facing << 2)` — 4 facings × a 3-step walk cycle
(`ClrWalking`/`SetWalking` toggles the mid-step). The rebuild keeps the
8→4 facing collapse + diagonal hysteresis as visible mechanism; the exact
frame-index arithmetic is sprite-data-specific and maps onto the clone's
own animator.

### Idle settle-to-stand — `seg_0A33.c:121-133`

The move path only *advances* the walk cycle on a step (`C_1E0F_0664`); it
never resets it, so a humanoid stopped on a leg-out frame (walk 0/2) would
freeze mid-stride. Source settles it in a **separate continuous
idle-animation pass** (`seg_0A33.c`) — the same per-tick function that drives
animdata tile animation + palette cycling. For humanoids
(`OBJ_178..0x19A`, generic branch `:120-141`), on each idle tick:

```c
switch(frm & 3) {
  case 0: if(rand(0,31)==0) frm = 1;          // leg-out → stand (settle)
  case 1: if(rand(0,63)==0) frm = rand(0,2);  // stand → random fidget
  case 2: if(rand(0,31)==0) frm = 1;          // leg-out → stand (settle)
}
```
Facing (`frm & 0xfc`) is preserved; only the low 2 walk-cycle bits change.
Gated to actors within 6 tiles of the view (`CLOSE_ENOUGH_S(6,…)`).

**Co-working with movement = temporal mutual exclusion.** Source's idle pass
runs only on the no-key path of the input loop; while keys are queued only the
move runs. The two never run in the same loop iteration, so the settle can't
fight the walk cycle.

**Clone realization (I-8a → generalized at I-8e).** This maps onto the
`TurnClock`: a turn is either a player action (`pendingAction`) or an
idle-heartbeat tick — which IS source's command-vs-idle split. So the settle
runs in the **idle branch of the avatar's turn-driven update**
(`pendingDir === -1`): on a leg-out frame, snap walk → 1 (stand), facing
preserved. It runs only on idle turns, never on a move turn, so no cross-system
race and no per-actor "recently moved" flag is needed. **I-8a** settled the
avatar alone; **I-8e** generalized it to the whole party — the avatar's idle
branch fires an `onIdle` callback (symmetric with the `onMove` that drives
`MoveFollowers`) wired to `settleParty(world)`, which settles every `PartyMember`
mid-stride, so the avatar (slot 0) and the followers plant their feet together.
**Deviations** (per the modern-UX anchor): the settle is deterministic and gated
on a separate idle-detection delay (`IDLE_SETTLE_MS`, ~500 ms of no movement
input — the party holds its stride pose briefly rather than snapping on the first
heartbeat) rather than the source `1/32` probability tuned to its ~10 Hz idle
loop, and the `1/64` stand→random fidget (`:126-128`) is **dropped** as cosmetic.
For walking NPCs (I-9) the same turn-cadence principle applies — a walker settles
on the turns it doesn't step.

### `MoveFollowers` — `C_1E0F_1193` (`seg_1E0F.c:501-594`)

A **formation-offset greedy step** — NOT a trail-copy conga buffer and
NOT per-follower pathfinding. Each follower owns a fixed formation slot
behind the leader and greedily steps one tile toward it each turn.

- `IN_VEHICLE` → early return (no follow while boarded/sailing).
- Leader facing → `facing_dir` (from sprite frame for certain object
  types, else `GetDirection`).
- **Two passes** (`seg_1E0F.c:523`; the code references a `doc9.txt`
  we don't have — pass 1 moves stragglers, pass 2 tightens). Per
  follower in `AI_FOLLOW`:
  1. **Formation target** from the offset tables `D_17B8`
     (perpendicular) + `D_17C3` (behind), rotated by `facing_dir`
     (`seg_1E0F.c:528-535`).
  2. **Contiguity check** `C_1E0F_1056` ("already contiguous to the
     party?", `seg_1E0F.c:473`).
  3. **Step decision** (`seg_1E0F.c:549-588`): if not contiguous, or
     (pass 2 AND an overshoot condition gated by `aFlag`), try all 8
     directions and pick the best:
     - legal via `C_1E0F_000F`;
     - **eager** score = base (256, or **128 if `D_17A9`** damage-tile)
       + contiguity bonus (+256 if the step keeps contiguity)
       − |Δx to target| − |Δy to target|;
     - highest-eager legal direction wins → `MoveObj` + `C_1E0F_0664`.
  4. `SubMov(follower, 5)` — the move-point cost.
- **`aFlag` = tightness.** `0` when the avatar actually moved (loose —
  followers only correct if they've overshot the slot, giving natural
  trailing); `1` on a pass/stationary turn (tighten fully onto the
  slot). Call sites: `seg_1E0F.c:933` (aFlag 0, active-member move),
  `seg_0A33.c:1322` (aFlag 1, pass command), `seg_101C.c:291`
  (aFlag 1).

**Formation offset tables (verbatim, `seg_1E0F.c:62-63`):**
```
D_17B8[] = { 0,-1, 1, 0,-2, 2,-1, 1,-3, 3, 0};   // perpendicular
D_17C3[] = { 0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 1};   // behind
```
Indexed by `follow_pos` (1-based per follower). Slot 1 = back-left,
2 = back-right, 3 = two-behind, 4/5 = wider — a diamond expanding behind
the leader. Rotation (`seg_1E0F.c:528-535`):
```
target_x = x − DirIncrX[facing]·D_17C3[fp] − DirIncrY[facing]·D_17B8[fp]
target_y = y + DirIncrX[facing]·D_17B8[fp] − DirIncrY[facing]·D_17C3[fp]
```

### `D_17A9` — damage-tile reluctance

`C_1E0F_000F` sets `D_17A9 = 1` (`seg_1E0F.c:95, 150`) when a candidate
cell's terrain (or an object on it) carries `TERRAIN_FLAG_08` (the
damage-tile flag — same flag I-4 deferred). `MoveFollowers` reads it
(`seg_1E0F.c:564`): a damage cell halves base eagerness to 128 and, if
the follower is already contiguous, is skipped outright (`continue`).
So companions won't wade into lava/fire just to hold formation. The
rebuild stubs `D_17A9 = false` until a hazard subsystem exists.

### Rebuild shape (I-8)

- **`PartyMember { slotIndex }`** component — Avatar = slot 0,
  companions 1..N. `world.query(PartyMember)` sorted by `slotIndex` IS
  the member list; no separate `members[]` array (source treats the
  Avatar as just `Party[0]`, no distinct marker).
- **`Party { activeIndex, mode }`** resource — `mode` is `'follow'` at
  β, with a slot for the `'solo'` toggle (combat-era).
- **Port faithfully, don't substitute.** The formation-greedy-step,
  two-pass tighten, eager heuristic, and `aFlag` tightness are the
  *mechanism* — the visible conga/diamond/route-around-block behavior is
  emergent from them. A trail-copy ring buffer would look different and
  is the wrong port.
- `MoveFollowers` is a **system that runs right after the avatar-move
  system**, not inside the per-NPC tick. Camera follows
  `Party[activeIndex]`'s `Position`.
- **Avatar input arity (4- vs 8-direction)** is TBD until the I-8a read
  of the player-command dispatch in `seg_0A33.c`; note that
  `MoveFollowers` itself tries all 8 directions for followers regardless.

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

**Order matters — NPC-ness is decided independent of the entity's tile
flags** (`c_04ed`, `seg_1E0F.c:212-222`). An NPC blocks because it *is* an NPC
(slot `< 0x100`), and the party pass-through (`IsPlrControl` mover walking past
another `IsPlrControl` non-leader, `seg_1E0F.c:191-198`) is the only exception —
**neither consults the NPC's own sprite-tile flags.** The clone's `canStandAt`
must therefore evaluate the Actor/party-pass decision BEFORE the object-tile
flag checks (terrain-impassable / breakthrough). I-8d hit exactly this: some
NPC sprite tiles carry the terrain-impassable flag, so checking it first left
`blocked` set even when the party pass-through skipped the follower, wrongly
blocking the Avatar from stepping onto a companion's cell. Fixed by reordering
the Actor check ahead of the tile-flag checks — which is what `c_04ed` does.

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
- Vehicles / boarding (`Board`/`Unboard`), corpser drag-under.
  (Party-formation following `MoveFollowers` is **in scope at I-8** and
  decoded in §"Party follow + avatar movement".)

## Open questions

1. **`C_1E0F_0664`** (face-direction + per-step animation) — called
   after every successful move; body not read. Likely sets the
   sprite frame from direction and triggers the per-step redraw.
   Needs a read before implementing smooth NPC movement animation.
2. **Mouse-driven movement + diagonal-slide fallback.** The keyboard
   advance path is fully decoded (§"Active-member move"); `C_1E0F_1B0E`
   is the general player advance (8-directional; the ship/wind handling
   is a sub-branch). What's *not* yet traced is the mouse-control path —
   `MousePress`/`MouseMapX`/`MouseMapY` drive a diagonal-slide fallback
   (`seg_1E0F.c:848-865`) and the mouse→`AdvanceDir` mapping at
   `seg_0C9C.c:816`. The clone is keyboard-first at I-8a; mouse movement
   is a later UX add, not a mechanic blocker.
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
