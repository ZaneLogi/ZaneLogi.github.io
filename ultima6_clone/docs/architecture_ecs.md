# Architecture: the ECS runtime ground

> **Status: designed; runtime ground built as of I-1 (2026-05-29).** The
> Entities + Components + Systems core specified here is implemented in
> `ecs/world.js` (allocator, parallel-array stores, 64-bit signature-mask query,
> two-list scheduler + `TurnClock`). The two-clock tick is wired; world-loading is
> designed and its region load-seam lands with the world-data system (I-2). This
> document is the **build spec** the I-N steps work to — self-contained.

This is the ground layer only — the runtime (identity, storage, world, query,
scheduler, resources, tick). The full component/system **catalogue** lands
incrementally on top, one or two components + one system per implementation step.
See `progress.md` for the step ledger and `research_*.md` for the source-side
truth each system ports.

---

## 1. Architecture choice — Pure ECS primary, Hybrid the named fallback

U6 is a **modern rewrite**, not a routine-level translation: its 1990 DOS
hardware (segmented memory, region paging, 320×200 viewport) is incidental
substrate, not the gameplay mechanism (see `../CLAUDE.md` and
`feedback_retro_port_translation_choice`). The rewrite ports the *game*, not the
paging workarounds.

**Pure ECS is the primary architecture.** Picked for: composition over hierarchy
(a haunted chest = `Container` + `HostileSpawn` + `Renderable`, no class-tree
explosion); genuinely zero-touch extension of the large *unbuilt* majority of the
engine (each subsystem = one component file + one system file); and save/load
uniformity (serialize the component stores — which is literally what U6's
`objlist` already does).

**Hybrid is the named fallback** — a real escape valve, not a hedge. If "where
does behavior live?" friction wears on the project mid-stream, the pivot is
"switch to Hybrid" (move system logic onto methods of the data classes that are
already the components; collapse the system pipeline into direct calls), not
"redesign from scratch." Estimated switch cost ~3–5 days; data layout, research,
and learning all survive it. The trigger stays **felt-out, not numeric**: when
implementation feels like fighting the architecture instead of expressing it.

Why this is safe to commit to now: research already characterized every consumer
(the 9 `research_*.md` docs), so the runtime core can be designed deliberately
rather than speculatively. Origin did **not** write U6 in ECS — but 16-bit memory
tightness, cache-locality, and savegame-I/O simplicity pushed them to a parallel-
array data layout that is *structurally isomorphic* to ECS sparse-set storage.
The data side of the port is therefore nearly free ("rename containers"); the
work is reorganizing procedural logic into systems.

---

## 2. Vocabulary (the working model)

- **Entity** — an identity (a row). No data of its own; just a handle.
- **Component** — plain data attached to an entity (a column). `Position`,
  `Renderable`, `Status`.
- **System** — a function that reads/writes the components of every entity
  matching a query (a transform over a table slice).
- **Resource** — a singleton not tied to one entity (`TileRegistry`, `MapLevel`,
  `WorldClock`, `TurnClock`, `SpatialIndex`).

Mental model: a database. Components are columns, entities are row IDs, systems
are queries. An entity *is* whatever components it has.

---

## 3. E — Identity & lifecycle

### Generational handle

An entity id is a **generational handle** `{index, generation}`, packed into one
JS Number (well below 2^53). The `index` is reused; a per-slot `generation` bumps
on every reuse, so a **stale handle is caught at deref** (its generation no longer
matches the slot's).

This guards the slot-reuse hazard that ECS *deliberately re-introduces*:
relationship components (`AttackTarget`, `ContainedIn`, `CarriedBy`) store another
entity's handle as data, and decoupled systems run at their own cadence — a target
can die between two systems' updates. We pay one `generation++` on free + one
compare on deref to turn silent corruption into a clean, detectable stale handle.

> **Why B (generational) over A (serial, never-reused).** Both need a liveness
> check on every cross-object deref — A's is a `Map`-miss, B's is a generation
> mismatch. B folds slot+check into the handle; A splits them and pays *more*
> (permanent holes, or a `Map<serial→slot>` indirection on every access). B's
> arrays high-water-mark at peak-simultaneous-live (a few thousand), not
> total-ever-created. Bevy / EnTT / Unity all ship exactly this.

### Free-stack allocator

The allocator is the dissolved descendant of source's `D_D5DA` / `Link[]`
recycler. Three small pieces: a `freeStack` (a JS array used as a stack of free
indices), `generation[]` (one int per slot), and a `highWater` counter for growing
into never-yet-used indices.

```
create():   i = freeStack.length ? freeStack.pop() : highWater++;
            generation[i]++;                 // → alive
            return makeHandle(i, generation[i]);

destroy(h): i = h.index;
            generation[i]++;                 // → free; invalidates old handles
            freeStack.push(i);               // + remove from spatial index, clear rel. comps
```

O(1), same as source's intrusive-list head-pop. Chose the plain stack array over
source's intrusive `nextFree[]` trick because our per-component split storage has
no "spare bytes" to thread a free-list through, so a dedicated `nextFree[]` would
cost the same memory as the stack — equal cost, simpler wins (not a spend-more
call).

### generation ≠ occupancy

`generation` answers "same object?", not "occupied?". The render never meets free
holes because it is **spatial-index-driven** (walks visible cells → looks up
entities), never scanning `[0..highWater]`; `destroy` removes the entity from the
spatial index, so a dead slot is never yielded. Only a hypothetical linear "touch
every NPC" scan needs occupancy — handle it then via **low-bit parity**
(`generation & 1`: odd = alive, even = free — one array, two jobs) or by storing
that component densely (sparse-set).

---

## 4. C — Component storage

### Three separate concerns (do not conflate)

| Concern | What it is | Structure |
|---|---|---|
| **Identity** | what names an object | generational handle (§3) |
| **Component storage** | where an object's data lives | **plain parallel arrays** indexed by `handle.index` |
| **Spatial index** | how you find objects by location | **sparse `Map<packedXY → entity[]>`** |

**The array-vs-Map rule (the key decides it):** key range *small + dense* → array
(entity ids 0..~3000, all used → `pos.x[id]` direct index). Key range *huge +
sparse* → Map (cell coords 0..~1,000,000 but only a few thousand occupied → only
occupied cells get an entry). "Sparse-set" is the **sparse-key** tool — it belongs
to the spatial index and to later *optional/rare* components (e.g. `Poisoned`,
held by few entities), NOT to the always-present object arrays.

### Component stores

- **Common components** (most entities have them): plain parallel SoA typed
  arrays keyed by `handle.index`. `Position` = `{ x: Int16Array, y: Int16Array, z: Uint8Array }`.
- **Optional/rare components**: sparse-set (sparse index array + dense data array)
  so they cost memory only where present.
- **Spatial index**: a `SpatialIndex` resource holding `Map<cell → entity[]>`,
  maintained by the movement system on the turn tick (cost ∝ objects that moved, a
  handful). Replaces source's `MapObjPtr[y][x]` + sorted `Link[]`.

Render cost is **O(visible cells)**, independent of total object count or map
size: the render walks visible cells (it's drawing terrain there anyway) and does
one index lookup per cell; it never scans the object arrays.

### Terrain is an A-grid, not entities

Terrain is static, homogeneous, dense, and position-indexed — none of the things
ECS entities are for. So terrain is an **A-grid**: a `Uint16Array` of tile IDs per
`MapLevel` resource, plus a shared `TileRegistry` resource holding the ~2048 tile
definitions (graphics + per-tile flags). This is the *correct* ECS expression for
terrain, not a compromise — every serious ECS runtime puts state shaped like this
in a resource. Only the things *on top of* the map (items, doors, NPCs, furniture)
are entities. Per-tile dynamic state (fire, fog-of-war, mapped/unmapped) goes in
**sparse overlays** (`Map<packedXY, T>` or parallel byte arrays) — pay the cost
where the state exists, don't upgrade 147k static tiles to support 50 fires.

(Memory check: overworld 128×128 superchunk refs ≈ 32 KB; 5 dungeons 32×32 ≈
10 KB. Trivial.)

### Packed `Status` + transients as data components

The on-disk `ObjStatus` byte stays packed as one `Status` component (bitfield +
named accessors `isOwned()`/`isInvisible()`/…) — it's the source-of-truth byte,
O(1) load/save, and no system queries "all invisible entities." **Combat-style
transients that carry duration/severity/source data become their own data
components** (`PoisonedDuration`, …), iterated via `query(PoisonedDuration)`.
Rule: static-or-near-static on/off → packed bit in `Status`; dynamic transient
with data → its own component. **Don't store the same status in two places.**

---

## 5. S — Systems, query, scheduler, resources, communication

### A System is a plain function

`(world, dt) => void`. The irreducible unit — a transform that reads some
component arrays and writes others. **Escape valve:** if a system needs private
state across ticks, upgrade it to a closure factory
(`makeIdleSystem = () => { let s=…; return (world,dt)=>{…s…}; }`). From the
scheduler's view a plain fn and a closure-returned fn are the *same type*, so the
upgrade is fully local — zero change to the scheduler or any other system.
Litmus for closure-vs-resource: *would anything outside this system want to see
this value?* No → closure; yes → resource.

### Query API (the System↔Component seam)

**Membership = a central 64-bit signature mask.** Each entity has one bitfield;
bit *k* = "has component *k*". A query tests `(sig[id] & mask) === mask`. The
component catalogue is ~37–46 counting tags-as-bits, so 32 bits is too few →
**two `Uint32Array` (`sigLo` / `sigHi`)**, query test = two ANDs. (BigInt
rejected: heap-alloc, slow in hot loops. Per-component membership sets — EnTT's
model — rejected as the default; see the spatial driver below for where the
sparse-set variant *does* apply.)

**Three execution drivers, one contract:**
- **scan-by-mask** (default) — walk `0..highWater`, test the mask. O(highWater)
  per call — free at our scale (a few thousand).
- **iterate-a-sparse-component** — a query *driven by* a rare component iterates
  that component's dense array directly, then mask-tests the rest (EnTT's
  "iterate smallest pool", applied only where it pays).
- **walk-cells (spatial)** — `SpatialIndex` `Map<cell→entity[]>` lookup for
  "things near X".

All three sit behind `world.query(...)`, so the execution strategy is a
representation swap *below* the contract — systems don't change if we optimize
later.

**Result = a generator yielding ids:**
```
for (const id of world.query(Position, Renderable)) { … }
```
A generator is resumable, so the consumer's `for…of` and the generator's internal
walk are the *same* traversal interleaved via `yield` — one pass
O(highWater + matches), NOT nested O(n·m). (The real O(n²) hazard is calling
`query` *inside* a query loop — which the spatial index exists to kill: "things
near X" is an O(1) cell lookup, not a nested scan.)

**Access = store-handle, not per-field.** Fetch the store once through the API,
raw-index inside the loop:
```
const pos = world.store(Position);   // ← the swap seam
const vel = world.store(Velocity);
for (const id of world.query(Position, Velocity)) { pos.x[id] += vel.dx[id]; }
```
Rule: a system touches storage **only** via `world.store(Comp)` + `world.query(...)`.
The stable interface is `.field[id]`; common comps back it with a raw typed array
(fast), rare comps with an accessor (indirection, fine because rare). The
discipline is **convention, not language-enforced** — with a 1–2-person team, code
review suffices. (Hiding arrays in closures to enforce it would kill the
zero-alloc raw access, so we don't.)

### Scheduler — two ordered lists + a turn-driver

The scheduler is **two system lists**, matching the two-clock tick model (§6):
- `renderSystems` — every frame: input poll, camera, tile-animation, render,
  dialog, HUD.
- `simSystems` — per turn: schedule, worktype, movement, collision, world-clock,
  talk-trigger.

"Ordered list" = a plain JS array; "run the list" = `for (const s of list) s(world, dt)`.
**Order = array position = the within-tick data-flow pipeline** (schedule before
movement before collision). Rejected a dependency graph — its only payoff is
auto-parallelism, which single-thread JS can't use. Phases are the escape valve if
a list grows unwieldy; the two clocks already give the coarse split for free. **No
per-system tick rates** — slow systems self-gate (ScheduleSystem runs every turn
but early-exits unless the game-hour changed; tile-animation advances every N
frames via its own counter).

The **turn-driver is World orchestration, not a registered system** — deciding
"should the sim list run this frame" is control-flow *above* the list, kept inline
in the frame fn so the tick shape stays readable:
```
frame(dt):  poll input
            decide whether a turn fires (TurnClock)   ← orchestration
            if turn: for (s of simSystems) s(world, dt)
            for (s of renderSystems) s(world, dt)
```
Turn-driver **state** lives in a `TurnClock` resource `{ lastTurnAt, idleInterval,
suspendCount }`. `suspendCount` (not a bool) so nested blockers (dialog over
inventory) suspend/resume correctly.

### Resources — typed Map, World as a generic container

Resources are registered in a typed `Map<constructor → instance>`, fetched via
`world.getResource(Type)` — the class itself is the key (no string keys → no typos
or collisions). Rejected direct fields (`world.tileRegistry`) because that
hard-codes the catalogue into `World`, so adding a resource would edit `World` and
break additivity.

This is the **same pattern as the component stores** (`Map<componentType → store>`),
so **`World` is a uniform generic container** — entity allocator + component
stores + resources, all keyed by type, hard-coding no domain type. That uniformity
*is* the "add a subsystem = add files, zero touches" property we chose Pure ECS
for. (`World` itself is passed as an arg, not stored as a map entry.)

### Inter-system communication — two channels; the Use-switch dissolved

**Governing principle: the producer never names the consumer.** A system leaves
data; whoever cares picks it up. The literal inverse of source's 40-case `Use`
switch (one consumer naming all 40 types).

Two storage channels:
- **Components** — per-entity persistent facts (`OnFire`, `Dead`, `WantsToMove`).
- **Resources** — singleton / cross-cutting (`WorldClock`, `TurnClock`,
  `PendingAction`).

"Events" are **not** a third mechanism: an event queue is a transient per-type
message list living *in a resource*, cleared at end of turn
(`Events.push(UseEvent, {…})` / `for (const e of Events.of(UseEvent))`). No
pub/sub, no observer registration. Build an event-resource only when a one-shot is
awkward as a persistent component (no host entity; annoying to clear).

**The `Use` 40-case switch dissolves** into: a `UseEvent{actor, target}` emitted
by an `ActionDispatchSystem` that never inspects the target's type + **capability
components** (`Openable`, `Unlocks{lockId}`, `Lightable`, `Triggers{target}`) +
**one small self-selecting system per capability** that drains `UseEvent`s for
targets carrying its component. Adding a usable type = 1 component + 1 system, zero
touches; nobody holds a master list. Same-turn cascades (unlock → open) fall out of
the `simSystems` array order: `UnlocksSystem` removes `Locked` earlier in the list,
`OpenableSystem` later sees it unlocked. Deep chains (death → loot → quest) may
take a turn of latency — invisible in a turn-based game, and leaner.

Pure helper functions (pathfinding, LOS, tile-flag lookup) are shared freely.
Coupling = depending on another system's execution/order/state, NOT sharing code.

---

## 6. Tick model — two clocks

- **Render tick** — continuous at display refresh; never blocks. Drives render,
  camera, animation, input polling, dialog.
- **Sim/turn tick** — discrete; drives AI / schedule / movement / world-clock /
  interaction. **Two triggers:** (1) player commits an action → fire now + reset
  the idle timer; (2) the idle interval elapses → fire a turn anyway, so NPCs run
  their schedules while the player is idle.

Trigger (2) is a **conscious modern-UX deviation**: the original blocks on
`CON_getch` and freezes the world on idle; we choose a living town. Idle
auto-advance **suspends** whenever a blocking UI is open (dialog / inventory /
targeting / spellbook); player-driven turns always fire. The game is turn-based at
heart — the idle heartbeat is liveliness, a **calm** heartbeat, not a drift toward
real-time. The idle rate is feel-tuning, deferred to when a town is on screen —
don't silently hard-code it.

This is a corollary of the project's "modern-browser UX as architectural anchor"
principle (see `../CLAUDE.md`): source's behavioral *envelope* (timing, cadence)
is substrate residue, not the mechanic spec.

---

## 7. World-loading — demand-load + cache

**Demand-load by region + cache the parsed result.** Region = the *load* unit.
Never load a region until the player approaches it (skip the unused); cache the
parsed result in memory (and optionally IndexedDB so reloads don't re-decode) so
revisiting never re-parses (don't do it twice). At U6 scale this collapses to
"load-on-demand and basically never evict" — the whole world is tens of MB.

**Distinct from region paging** (swap in *and out* under memory pressure), which
is **dropped** — it's substrate residue. **Design the load-seam in from the
start** (the first impl can just load the starting region; prefetch + an eviction
guard are later additions, not a retrofit). This is the one place region
partitioning legitimately returns — as the load unit, not a search structure.

**Loading is decoupled from rendering.** The legacy port's flaw was that the
render walk *was* the load trigger (synchronous IO inside the map loop). Here:

```
input
→ streaming update   (decide load/evict; drain load queue, budgeted)   ← producer
→ simulation
→ render             (read-only: draws resident chunks, skips the rest) ← pure consumer
```

Supporting techniques, easiest-first (single-thread, no workers): async IO
(`fetch`/IndexedDB); **small chunks** (finer than U6's 128×128 — the biggest
lever, each load a single-frame bite); prefetch with margin (slow tile-RPG
movement hides latency); time-slice the parse *only if measured to spike*; atomic
integration (build off to the side, splice in as one budgeted step). **Web Workers
declined** for this scale (can't touch ECS/WebGL, only prepare buffers; protocol
complexity; GitHub-Pages can't set COOP/COEP for `SharedArrayBuffer` without a
shim — if workers ever return, prefer transferable `ArrayBuffer`s).

Two distinctions the original conflated and the rebuild separates:
- **Availability ≠ simulation.** Loading makes an entity queryable; it doesn't
  mean it ticks. Cheap consistency state (schedules, clocks) ticks *globally* (so
  the world feels alive); detailed movement/pathfinding stays *local* via a
  sim-radius (snap far NPCs to schedule — gameplay-equivalent to source).
- **Agent vs. prop = a component-set distinction**, not a loading one. NPCs carry
  `AIMode` + `Schedule` → AI/schedule systems query them; props don't → those
  systems skip them automatically. U6's eager-NPCs / lazy-objects split was a
  memory artifact, not a design one.

---

## 8. Design principles

**Green-Earth (default tiebreaker).** Minimizing waste is the default tiebreaker
for design choices; a proven correctness/clarity/simplicity reason can override it
— lead with the lean option, flag explicitly when paying more is warranted so the
call is Zane's. (The free-stack allocator was an equal-cost pick, not a spend-more.)

**The litmus test (operationalizes "source = mechanic spec, not code template").**
*Would this code still need to exist with infinite RAM + an instant disk?*
- **NO → substrate residue, DROP:** 16-slot LRU chunk cache (`D_B7C8`/`D_B784`),
  region paging, `Link[]`-threaded free-list, in-file-index→live-slot remap, fixed
  slot caps.
- **YES → genuine, keep but modernize:** store object data, find objects by cell,
  reference objects safely.

**Don't build structure for a scale you don't have.** Plain arrays + load-
everything fit U6 trivially; archetype-grouping / sparse-set-intersection /
streaming-with-eviction are AAA-scale optimizations behind stable contracts —
design the seam, don't build the machine until the scale is real.

---

## 9. Source lineage — what dissolves into what

Dissolving the legacy `ObjManager` god-object *is* the merge of the legacy port
into the ECS:

| Source / legacy mechanism | ECS home |
|---|---|
| `ObjStatus[]` / `ObjPos[]` / `NPCMode[]` … (slot-indexed parallel arrays) | component stores (one per property), keyed by `handle.index` |
| `D_D5DA` / `Link[]` free-list recycler | the free-stack allocator (§3) |
| `MapObjPtr[y][x]` + sorted `Link[]` | `SpatialIndex` resource `Map<cell→entity[]>` (§4) |
| globally-sorted `Link[]` draw order | render walks visible cells in scan order → painter's algorithm; within-cell 3-zone height/layer sort |
| `C_0A33_1355` (one proc reading ~12 arrays + driving the clock) | split into ~8 systems (`SpellTimer`, `StatusEffect`, `HourRollover`, …) + explicit `simSystems` order |
| 40-case `Use` switch | `UseEvent` + capability components + self-selecting systems (§5) |
| eager-NPC `objlist` / lazy-object `objblk*` split | a component-set distinction (`AIMode`+`Schedule`), not a storage one (§7) |

The friction this introduces is real and named: logic spreads across systems,
ordering becomes explicit, and source-vs-port debugging means mentally scheduling
systems instead of reading a linear procedure. The Hybrid escape valve (§1) exists
for exactly this.

---

## 10. The graphics-first minimum-viable set

The first visible gate is "Britain on screen." Minimum ECS set:
entity registry + `Position` + `Renderable` components + `TileRegistry` resource +
`MapLevel` resource + `RenderSystem` + `CameraSystem`. No movement, input, AI, or
clock yet. Each subsequent step adds 1–2 components + 1 system. The first
implementation step (I-1) is the first integration test of everything in this
document — see `research_i1_render_slice.md` and `progress.md`.
