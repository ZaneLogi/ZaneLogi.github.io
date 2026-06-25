# Faithful passability: porting the engine's move gate `C_1E0F_000F`

`u6_walkable` / `u6_pathfind` / `u6_goto` decide where the avatar can step. Rather
than approximate the rule, the grid is a port of the engine's own move-legality
gate, so "can the avatar pass here?" is answered exactly the way the game answers
it. This documents the model, what is and isn't ported yet, and the empirical
gate that proves fidelity.

## The function that is the ground truth

`C_1E0F_000F(objNum, x, y)` (`seg_1E0F.c:66`) returns 1 iff actor `objNum` may
step onto tile `(x,y)` at the current level. Every real move runs through it:

- `TryStraightMove` (`seg_1E0F.c:1421`): `if (C_1E0F_000F(obj, nx, ny)) MoveObj(...)`
- `__TryDiagMove` (`seg_1E0F.c:1464`) calls it for both orthogonal cells **and**
  the diagonal target — the engine never cuts corners.

For a **cardinal** step the verdict depends only on the destination cell + the
mover, so the 40×40 grid IS the per-step oracle: `walk[dest]` is the engine's
answer. (Diagonals would add the no-corner-cut rule; nav is 4-connected today.)

## Land-walker reduction (what `_build_grid` implements)

On foot the avatar is a plain land-walker — in the gate's terms `bp_10 = 1` and
`flies = swims = skiffOrRaft = ethereal = 0`. That collapses `C_1E0F_000F` to:

1. **Ground**: passable iff `TerrainType[ground] & 0x02 (IMPASS) == 0`
   (`seg_1E0F.c:88`). Move cost is the engine's `(TerrainType[ground] >> 4) + 1`.
2. **Objects on the cell**: an object whose tile is impassable blocks
   (`seg_1E0F.c:162-164`), with two refinements:
   - **Multi-tile spread.** A `DoubleH` object (`TileFlag & 0x80`) also covers the
     cell to its **west** reading `tile-1`; `DoubleV` (`0x40`) the cell to its
     **north** (`tile-1`); a 2×2 (both) the W/N/NW cells reading `tile-1/-2/-3`.
     This matches the engine both ways: `__ComputeResistance`'s forward spread
     (`seg_1E0F.c:1907`) and `FindLoc`'s anchor-from-the-NW enumeration
     (`seg_1184.c:240`).
   - **Breakthrough / Ignore.** `D_B3EF[tile] & 0x04` (Br) makes a cell enterable
     even over impassable terrain (bridges) and wins over an impassable object on
     the same cell; `& 0x10` (Ig) leaves the Br non-definitive (`seg_1E0F.c:142`).
3. **Actors block.** Any in-world actor (slot `< 0x100`) on the cell blocks the
   avatar, except the walk-through field/effect types `{0x157,0x162,0x164,0x165,
   0x167}` (`seg_1E0F.c:213`).

**Doors and passthroughs need no special case on the avatar path.** The engine's
explicit door (`OBJ_129..12C`) / passthrough (`OBJ_116/118`) handling lives in the
`else if (objNum < 0x100)` *NPC-mover* branch (`seg_1E0F.c:199`), which never runs
for an `IsPlrControl` mover. For the avatar a door is just an object whose tile is
impassable when closed and passable when open — exactly what rule (2) already
tests. So they are handled by the general object rule, not deferred.

## Legality vs planner (the two-layer split)

Fidelity is required only for **reachability**; the **planner** serves the agent
and is free to diverge. So the two are layered, and never fight:

- `_build_grid` → the static, faithful **terrain+object** grid, **actor-free**, with
  the engine's cost weights. This is the **planning** graph: Dijkstra routes
  optimistically through a cell a transient NPC happens to occupy, and `u6_goto`
  re-plans each step. (A grid that walled off every current NPC position would be
  pathologically pessimistic.)
- `_actor_cells` → the dynamic actor-block layer. Full per-step **legality** =
  `walk[dest] AND dest ∉ _actor_cells`. `u6_walkable` overlays actors as `N`;
  `u6_goto` confirms each step empirically (re-read position) so a real block is
  always caught regardless.

### The mover is the controlled member, not "slot 1"

The engine excludes the *mover itself* from blocking (`C_1E0F_000F`: `if (i ==
objNum) continue`), and the mover is whoever the player drives — `Party[Active]`,
not a hardcoded avatar. So every nav reference (the grid origin / `@`, the
pathfind start, the move-confirm, and the `_actor_cells` self-exclusion) uses
`_controlled_xyz` / `_controlled_slot`. In **party** mode that's the avatar (slot
1); in **solo** mode it's the detached member, and the avatar then correctly
appears as a *blocking* actor. `u6_party` reports the mode + who's controlled;
`u6_avatar` reports that controlled actor (so it stays the right move-confirm
target in both modes).

## Performance: static-table cache

`TerrainType`, `TileFlag`, `D_B3EF`, `BaseTile` are loaded from the game's data at
boot and never change during play. `_static_table` reads each **once** (lazily, on
the first navigation call — not at `u6_hook`) and caches it on the session, keyed
to `base_addr` (= `MemBase + DS<<4`). A DOSBox restart or different-avatar re-hook
rebases the segment and transparently flushes the cache; game data is identical
across saves within one process, so reuse is safe. Only the dynamic arrays
(`ObjStatus/ObjPos/ObjShapeType`, `AreaTiles`) are re-read per build.

## Deferred — intentional, scoped

- **Movement-type awareness (Phase 2).** Boat/skiff/raft/horse/balloon/flying/
  ethereal change which tiles pass. The branch skeleton is preserved; its five
  inputs are hardwired to the land-walker constants. The avatar-on-foot path
  provably never reads `GetMonsterClass`, and Milestone 1 is entirely on foot, so
  this is correct to defer, not an approximation. Phase 2 = flip the five stubs to
  live `GetMonsterClass` values + add the `OBJ_19E/19F` skiff test.
- **Niche mover branches** (`seg_1E0F.c:84,118-137,155,223`): `OBJ_168`, the
  `objTyp >= OBJ_1AA || OBJ_19C` large-creature directional-edge rules, `OBJ_162`
  boat-on-water, `OBJ_19D` force-field stacking, the `OBJ_16A/1A8/19B/1A9` no-fly
  cases — all keyed on a non-foot mover type, so none apply to the walking avatar.
- **`OBJ_1A0` sacred-quest barrier** (`seg_1E0F.c:107`): blocks unless a quest var
  is set. Not modeled (would need the `VarInt` read); not present in the castle.
  Over-pass risk, rare.
- **Damage tiles** (`TerrainType & 0x08`): the gate returns blocked only when
  `D_17B4` is set (auto-move guard); we currently keep them passable (terrain
  impass bit is separate). Whether a manual avatar step onto fire is legal is left
  for the harness to settle empirically.
- **Ig-Br ordering edge.** When an *Ignore* breakthrough and an impassable object
  share a cell, the engine's verdict is `Link`-order dependent; the forward pass
  approximates by scan (slot) order. Vanishingly rare; the harness would flag it.
- **Combat leash.** This grid is the `C_1E0F_000F` gate; its *caller*
  `TryStraightMove` (`seg_1E0F.c:1428`) adds one more rule for a player-controlled
  mover: while `InCombat`, a step is allowed only within `CLOSE_ENOUGH0(8, …)`
  (Chebyshev ≤ 8) of the combat centre `(MapX,MapY)`. Not modeled in the grid —
  `u6_party` reports `InCombat` so the agent knows to fight/break off rather than
  roam; Milestone 1 has no combat. Model it as a post-filter on the grid if/when
  combat navigation matters.

## Fidelity gate: `u6_validate_passability`

Because we have the oracle *and* the live game *and* the action channel, fidelity
is testable, not arguable. The tool, for each cardinal direction: re-reads avatar
+ grid + actors, **predicts** pass/block, **sends** the move, **re-reads** the
avatar position to see what the game did, and reports MATCH / **MISMATCH** — then
steps back so the avatar ends where it started (each probe still costs game turns,
so run it on a safe save). A mismatch dumps the destination tile id + terrain
flags + any object/actor on the cell, so a wrong prediction points straight at the
branch to fix. This is the acceptance test for the port and for every future
refinement (e.g. when Phase 2 lands, validate again from a boat).

Offline, `_build_grid`'s multi-tile + Br/Ig logic and the static cache have unit
coverage (stub-driven, `dosbox_tools/tests/`); the live harness covers the rest.
