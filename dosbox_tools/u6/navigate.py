"""u6.navigate -- the walkable/cost grid (C_1E0F_000F passability port), the
Dijkstra planner, the live area map (doors via MapObjPtr), and the closed-loop
movement tools (pathfind/goto/goto_xy) + the passability validator.
"""

import heapq
import time

from u6.constants import *  # noqa: F401,F403
from u6.ctx import *        # noqa: F401,F403
from u6.decode import *     # noqa: F401,F403


_DOOR_GLYPH = {"open": "'", "closed": "+", "locked": "=", "magically locked": "x"}

_RESTORE_ARROW = {"n": "down", "s": "up", "w": "right", "e": "left"}


def _build_grid(base_addr):
    """Faithful per-step passability for the LAND-WALKING avatar, ported from the
    engine's move-legality gate C_1E0F_000F (seg_1E0F.c:66). Returns (walk[H][W]
    bool, cost[H][W] int, AreaX, AreaY); for a cardinal step the destination cell's
    walk flag IS the engine verdict.

    On foot the avatar is a plain land-walker (bp_10=1; flies/swims/raft/ethereal
    all 0), so the gate collapses to: ground passable (TerrainType & IMPASS == 0)
    AND no object on the cell whose tile is impassable -- with the two refinements
    the previous own-cell-only version skipped:

      * Multi-tile objects spread their block. A DoubleH object (TileFlag & 0x80)
        also covers the cell to its WEST reading tile-1; DoubleV (0x40) the cell to
        its NORTH; a 2x2 (both) the W/N/NW cells reading tile-1/-2/-3. This mirrors
        the engine both ways: __ComputeResistance's forward spread (seg_1E0F.c:1907)
        and FindLoc's anchor-from-the-NW enumeration (seg_1184.c:240).
      * Breakthrough tiles (D_B3EF & Br) make a cell enterable even over impassable
        terrain (bridges); they win over an impassable object on the same cell. An
        Ignore tile (& Ig) leaves the Br non-definitive (seg_1E0F.c:142-145).

    ACTORS (slot < 0x100) are NOT folded in -- the engine blocks on them too, but
    for PLANNING we keep the grid actor-free so a transient NPC doesn't wall off a
    route (u6_goto re-plans each step; the faithful actor block is _actor_cells,
    applied at legality / per-step time). Move cost is the engine's
    `(TerrainType[ground] >> 4) + 1`, so weighted search skirts costly terrain the
    way the game does. Static tables come from the lazy per-process cache."""
    ax = int.from_bytes(dm.read(S.handle, base_addr + U6_AreaX, 2), "little")
    ay = int.from_bytes(dm.read(S.handle, base_addr + U6_AreaY, 2), "little")
    _, _, z0 = _controlled_xyz(base_addr)
    tiles  = dm.read(S.handle, base_addr + U6_AreaTiles, U6_AREA_H * U6_AREA_W)
    status = dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS)
    objpos = dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3)
    shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    terr     = _static_table(base_addr, U6_TerrainType_ptr, _TILEFLAG_N, "terr")
    tflag1   = _static_table(base_addr, U6_TileFlag_ptr,    _TILEFLAG_N, "tflag1")
    tflag2   = _static_table(base_addr, U6_TileFlag2_ptr,   _TILEFLAG_N, "tflag2")
    basetile = _static_table(base_addr, U6_BaseTile_ptr,    _BASETILE_N * 2, "basetile")

    def terr_of(tile):
        return terr[tile] if 0 <= tile < len(terr) else 0

    # Ground terrain: per-cell move cost + impassability.
    walk = [[True] * U6_AREA_W for _ in range(U6_AREA_H)]
    cost = [[1] * U6_AREA_W for _ in range(U6_AREA_H)]
    brk  = [[False] * U6_AREA_W for _ in range(U6_AREA_H)]   # a Br tile locked the cell open
    for r in range(U6_AREA_H):
        for c in range(U6_AREA_W):
            gf = terr_of(tiles[r * U6_AREA_W + c])
            cost[r][c] = (gf >> 4) + 1                       # engine move cost: forest/swamp > road
            if gf & TERRAIN_IMPASS:
                walk[r][c] = False

    # Apply one object-tile to one cell, land-walker rules (C_1E0F_000F :142-164).
    def apply(r, c, qtile):
        if not (0 <= r < U6_AREA_H and 0 <= c < U6_AREA_W):
            return
        if not (0 <= qtile < _TILEFLAG_N):
            return
        if tflag2[qtile] & TILE2_BREAKTHROUGH:              # bridge etc.: enterable
            walk[r][c] = True
            if not (tflag2[qtile] & TILE2_IGNORE):
                brk[r][c] = True                            # definitive open; later impass can't re-block
        elif (terr_of(qtile) & TERRAIN_IMPASS) and not brk[r][c]:
            walk[r][c] = False

    # Map objects: one pass over the world-object slots (engine SearchArea loop).
    # Skip NPCs (< 0x100), empty slots, anything not loose on the map (CoordUse !=
    # LOCXYZ), or off-level. Place each by its OWN world position, then spread its
    # multi-tile extent to the W/N/NW neighbour cells.
    for slot in range(0x100, U6_MAX_SLOTS):
        sh = shape[slot * 2] | (shape[slot * 2 + 1] << 8)
        if sh == 0:                                         # empty slot
            continue
        if status[slot] & 0x18:                             # not LOCXYZ (held/contained/equipped)
            continue
        typ = sh & 0x3ff
        if typ >= _BASETILE_N:
            continue
        p = objpos[slot * 3] | (objpos[slot * 3 + 1] << 8) | (objpos[slot * 3 + 2] << 16)
        if ((p >> 20) & 0xf) != z0:                         # different map level
            continue
        cell = _world_to_cell(p & 0x3ff, (p >> 10) & 0x3ff, ax, ay)
        if cell is None:
            continue
        r, c = cell
        tile = (basetile[typ * 2] | (basetile[typ * 2 + 1] << 8)) + (sh >> 10)
        fl = tflag1[tile] if 0 <= tile < len(tflag1) else 0
        apply(r, c, tile)                                   # own (anchor) cell
        if fl & TILE_DOUBLE_H:                              # also covers WEST
            apply(r, c - 1, tile - 1)
            if fl & TILE_DOUBLE_V:                          # 2x2: also N + NW
                apply(r - 1, c, tile - 2)
                apply(r - 1, c - 1, tile - 3)
        elif fl & TILE_DOUBLE_V:                            # also covers NORTH
            apply(r - 1, c, tile - 1)
    return walk, cost, ax, ay

def _dijkstra(walk, cost, start, goals):
    """4-connected weighted Dijkstra from start to the LOWEST-COST cell in `goals`
    (path cost = sum of entered cells' move cost). Returns a list of (dr,dc)
    steps, [] if already at a goal, or None if unreachable. Weighting is what
    keeps routes on roads/plains instead of cutting through forest/swamp."""
    if start in goals:
        return []
    INF = 1 << 30
    dist = {start: 0}
    prev = {start: None}
    pq = [(0, start)]
    while pq:
        d, cur = heapq.heappop(pq)
        if d > dist.get(cur, INF):
            continue                                     # stale heap entry
        if cur in goals:
            steps, node = [], cur
            while prev[node] is not None:
                parent, mv = prev[node]
                steps.append(mv)
                node = parent
            steps.reverse()
            return steps
        for dr, dc in _DIR_DELTAS:
            nr, nc = cur[0] + dr, cur[1] + dc
            if 0 <= nr < U6_AREA_H and 0 <= nc < U6_AREA_W and walk[nr][nc]:
                nd = d + cost[nr][nc]
                if nd < dist.get((nr, nc), INF):
                    dist[(nr, nc)] = nd
                    prev[(nr, nc)] = (cur, (dr, dc))
                    heapq.heappush(pq, (nd, (nr, nc)))
    return None

def _adjacent_goals(grid, ncell):
    goals = set()
    for dr, dc in _DIR_DELTAS:
        gr, gc = ncell[0] + dr, ncell[1] + dc
        if 0 <= gr < U6_AREA_H and 0 <= gc < U6_AREA_W and grid[gr][gc]:
            goals.add((gr, gc))
    return goals

def _mask_walk(walk, blocked):
    """Copy of `walk` with the cells in `blocked` (current non-party NPC cells)
    cleared -- so the planner routes AROUND standing NPCs instead of through them."""
    if not blocked:
        return walk
    return [[walk[r][c] and (r, c) not in blocked for c in range(U6_AREA_W)]
            for r in range(U6_AREA_H)]

def _closest_reachable(walk, start, ax, ay, tx, ty):
    """BFS the cells reachable from `start` over `walk`, returning the reachable cell
    whose WORLD position is closest (Manhattan) to target (tx,ty). For an in-window,
    reachable target this is the target itself; for an off-window target it is the
    edge cell nearest it (step toward it, then the window scrolls and we re-plan);
    if the avatar is boxed in it returns `start`. This unifies in-window and
    off-window routing into one goal pick."""
    seen = {start}
    q = [start]
    best, bestd = start, abs(((ax + start[1]) & U6_WORLD_MASK) - tx) + \
                          abs(((ay + start[0]) & U6_WORLD_MASK) - ty)
    qi = 0
    while qi < len(q):
        cur = q[qi]; qi += 1
        for dr, dc in _DIR_DELTAS:
            nr, nc = cur[0] + dr, cur[1] + dc
            if 0 <= nr < U6_AREA_H and 0 <= nc < U6_AREA_W and walk[nr][nc] and (nr, nc) not in seen:
                seen.add((nr, nc)); q.append((nr, nc))
                d = abs(((ax + nc) & U6_WORLD_MASK) - tx) + abs(((ay + nr) & U6_WORLD_MASK) - ty)
                if d < bestd:
                    best, bestd = (nr, nc), d
    return best

@hot_tool
def u6_walkable(segment: int = -1) -> str:
    """Ultima VI: the local 40x40 passability grid as ASCII, faithful to the
    engine's land-walker move gate C_1E0F_000F (terrain + objects, incl. multi-tile
    spread + bridge/breakthrough overrides). Actors are overlaid by ALLEGIANCE, not
    a flat 'N', because they don't all block: a PARTY member (P) is walk-THROUGH --
    the avatar swaps places with it (C_1E0F_1B0E) -- so it never walls you in. An
    enemy (E, hostile per NPCStatus alignment), an ally (a, fights monsters for you)
    and a neutral npc (N) each block a step; only E is a threat. '@' is the actor
    you control. Legend: @=you  P=party(swap-through)  E=enemy  a=ally  N=npc
    .=open  #=blocked. DS from u6_hook unless overridden."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        self_slot, _idx, _veh = _controlled_slot(base)
        x0, y0, z0 = _controlled_xyz(base)
        walk, cost, ax, ay = _build_grid(base)
        amap = _actor_map(base, z0, ax, ay, self_slot)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    av = _world_to_cell(x0, y0, ax, ay)
    glyph = {"party": "P", "enemy": "E", "ally": "a", "npc": "N"}
    out = [f"Walkable grid (window origin world {ax},{ay}; z={z0}; @=you "
           f"P=party(swap-through) E=enemy a=ally N=npc .=open #=blocked):"]
    for r in range(U6_AREA_H):
        line = []
        for c in range(U6_AREA_W):
            if (r, c) == av:
                line.append("@")
            elif (r, c) in amap:
                line.append(glyph[amap[(r, c)][0]])
            else:
                line.append("." if walk[r][c] else "#")
        out.append("  " + "".join(line))
    return "\n".join(out)

def u6_area_map_data(base, segment_ds):
    """Shared decode for u6_area_map: read AreaTiles + MapObjPtr for the live 40x40
    window and resolve every cell's TOP object (MapObjPtr) into a feature. Returns
    (x0,y0,z0, av, ax, ay, walk, amap, doorcells, doors). `doorcells` maps (r,c) ->
    glyph; `doors` is a list of (dist, wx, wy, state, qual, name, bearing)."""
    self_slot, _idx, _veh = _controlled_slot(base)
    x0, y0, z0 = _controlled_xyz(base)
    walk, _cost, ax, ay = _build_grid(base)
    amap = _actor_map(base, z0, ax, ay, self_slot)
    mop    = dm.read(S.handle, base + U6_MapObjPtr, U6_AREA_H * U6_AREA_W * 2)
    shape  = dm.read(S.handle, base + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    amount = dm.read(S.handle, base + U6_Amount, U6_MAX_SLOTS * 2)
    doorcells, doors, seen = {}, [], set()
    for r in range(U6_AREA_H):
        for c in range(U6_AREA_W):
            raw = mop[(r * U6_AREA_W + c) * 2] | (mop[(r * U6_AREA_W + c) * 2 + 1] << 8)
            if raw == 0xffff or raw >= U6_MAX_SLOTS or raw < 0x100:   # none / actor / oob
                continue
            slot = raw
            typ = (shape[slot * 2] | (shape[slot * 2 + 1] << 8)) & 0x3ff
            if typ not in _U6_DOOR_TYPES:
                continue
            frame = (shape[slot * 2] | (shape[slot * 2 + 1] << 8)) >> 10
            state, _locked = _door_state(frame)
            doorcells[(r, c)] = _DOOR_GLYPH[state]
            wx, wy = (ax + c) & U6_WORLD_MASK, (ay + r) & U6_WORLD_MASK
            if (wx, wy) in seen:
                continue
            seen.add((wx, wy))
            qual = amount[slot * 2 + 1]
            doors.append((max(abs(wx - x0), abs(wy - y0)), wx, wy, state, qual,
                          _obj_name(base, slot), _compass(wx - x0, wy - y0)))
    av = _world_to_cell(x0, y0, ax, ay)
    return x0, y0, z0, av, ax, ay, walk, amap, doorcells, doors

@hot_tool
def u6_area_map(segment: int = -1) -> str:
    """Ultima VI: the live 40x40 area decoded DIRECTLY from the engine's own per-cell
    object map -- AreaTiles (floor) + MapObjPtr (the TOP object slot at each cell,
    @ U6_MapObjPtr) -- so OBJECTS are identified by NAME, not just passable/blocked.
    The point: on u6_walkable a CLOSED DOOR is impassable and shows as '#', exactly
    like a wall -- invisible. Here each cell's MapObjPtr slot is decoded type/frame ->
    name/state, and every door is drawn distinctly AND listed with its world (x,y),
    state, key-qual and bearing from you -- so 'find the door I can open' is a glance,
    not a maze-walk. Party/enemy overlay is shared with u6_walkable. Legend:
    @=you  +=closed door  ==locked door  '=open door  x=magically locked
    P=party  E=enemy  a=ally  N=npc  #=blocked  .=open. DS from u6_hook."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        x0, y0, z0, av, ax, ay, walk, amap, doorcells, doors = u6_area_map_data(base, ds)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    glyph = {"party": "P", "enemy": "E", "ally": "a", "npc": "N"}
    out = [f"Area map (window origin world {ax},{ay}; z={z0}; you at ({x0},{y0}); "
           f"@=you +=closed door ==locked '=open x=magically-locked "
           f"P=party E=enemy a=ally N=npc .=open #=blocked):"]
    for r in range(U6_AREA_H):
        line = []
        for c in range(U6_AREA_W):
            if (r, c) == av:
                line.append("@")
            elif (r, c) in doorcells:
                line.append(doorcells[(r, c)])
            elif (r, c) in amap:
                line.append(glyph[amap[(r, c)][0]])
            else:
                line.append("." if walk[r][c] else "#")
        out.append("  " + "".join(line))
    if doors:
        doors.sort()
        out.append(f"Doors in view ({len(doors)}):")
        for dist, wx, wy, state, qual, name, bearing in doors:
            keyq = f", key qual={qual}" if (state == "locked" and qual) else ""
            out.append(f"  ({wx},{wy})  {bearing:<2} d{dist:<2}  {state}{keyq}  {name}")
    else:
        out.append("Doors in view: none.")
    return "\n".join(out)

@hot_tool
def u6_pathfind(npc_slot: int, segment: int = -1) -> str:
    """Ultima VI: PLAN a route to get adjacent to an NPC. Returns the cardinal
    step list (n/s/w/e) WITHOUT sending input -- pure computation over the
    walkable grid (NPCs excluded; moving-NPC blocks are u6_goto's job). DS from
    u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        x0, y0, z0 = _controlled_xyz(base)
        nx, ny, nz, cu = _npc_xyz(base, npc_slot)
        walk, cost, ax, ay = _build_grid(base)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    if cu != 0:
        return f"NPC slot 0x{npc_slot:x} is not placed in the world (in a party/container?)."
    if nz != z0:
        return f"NPC slot 0x{npc_slot:x} is on z={nz}; avatar on z={z0} -- not the same level."
    start = _world_to_cell(x0, y0, ax, ay)
    ncell = _world_to_cell(nx, ny, ax, ay)
    if start is None:
        return "Controlled actor not within the local area window (unexpected)."
    if ncell is None:
        return (f"NPC 0x{npc_slot:x} at ({nx},{ny}) is outside the 40x40 local window "
                f"-- global routing not implemented yet.")
    if abs(nx - x0) + abs(ny - y0) == 1:
        return f"Already adjacent to NPC 0x{npc_slot:x} (to the {_dir_to(nx - x0, ny - y0)})."
    goals = _adjacent_goals(walk, ncell)
    if not goals:
        return f"No walkable tile adjacent to NPC 0x{npc_slot:x}."
    steps = _dijkstra(walk, cost, start, goals)
    if steps is None:
        return f"No path to NPC 0x{npc_slot:x} within the local area (blocked)."
    dirs = [_STEP_NAME[s] for s in steps]
    return (f"Path to adjacent NPC 0x{npc_slot:x}: {len(dirs)} steps -> "
            f"{' '.join(dirs)}\n(execute with u6_goto, or step via u6_move)")

@hot_tool
def u6_goto(npc_slot: int, max_steps: int = 60, segment: int = -1) -> str:
    """Ultima VI: walk the avatar adjacent to an NPC, CLOSED-LOOP -- plan -> one
    u6_move -> confirm via re-read -> replan on block, until adjacent or stuck.
    Handles moving NPCs reactively (re-plans each step). Returns a step log;
    when it arrives, follow with u6_talk(dir). DS from u6_hook unless overridden."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    log, stuck = [], 0
    for step_i in range(max_steps):
        try:
            x0, y0, z0 = _controlled_xyz(base)
            nx, ny, nz, cu = _npc_xyz(base, npc_slot)
            walk, cost, ax, ay = _build_grid(base)
        except OSError as ex:
            return "\n".join(log + [f"Read failed: {ex}"])
        if cu != 0:
            return "\n".join(log + [f"NPC 0x{npc_slot:x} left the world (party/container?) -- stop."])
        if nz != z0:
            return "\n".join(log + [f"NPC now on z={nz}, avatar z={z0} -- stop."])
        if abs(nx - x0) + abs(ny - y0) == 1:
            td = _dir_to(nx - x0, ny - y0)
            return "\n".join(log + [f"Arrived adjacent to NPC 0x{npc_slot:x} at avatar "
                                    f"({x0},{y0}); it's to the {td}. Now u6_talk('{td}')."])
        start = _world_to_cell(x0, y0, ax, ay)
        ncell = _world_to_cell(nx, ny, ax, ay)
        if start is None or ncell is None:
            return "\n".join(log + [f"Target/avatar left the local window (global routing "
                                    f"not implemented). avatar=({x0},{y0}) npc=({nx},{ny})."])
        steps = _dijkstra(walk, cost, start, _adjacent_goals(walk, ncell))
        if not steps:
            return "\n".join(log + [f"No path to NPC 0x{npc_slot:x} (blocked). avatar=({x0},{y0})."])
        mv = steps[0]
        _wait_command_ready(base)            # our turn before we step
        inp.send_key(_STEP_ARROW[mv])
        time.sleep(0.05)                     # let the key register (AllowMouseMov drops)
        _wait_command_ready(base)            # wait for the turn to resolve, then re-read
        try:
            x1, y1, _ = _controlled_xyz(base)
        except OSError:
            x1, y1 = x0, y0
        if (x1, y1) == (x0, y0):
            stuck += 1
            log.append(f"step {step_i}: {_STEP_NAME[mv]} blocked (no move) [{stuck}/3]")
            if stuck >= 3:
                return "\n".join(log + [f"Stuck at ({x0},{y0}) after 3 blocked tries "
                                        f"(NPC parked in the way?) -- giving up."])
        else:
            stuck = 0
            log.append(f"step {step_i}: {_STEP_NAME[mv]} -> ({x1},{y1})")
    return "\n".join(log + [f"Hit max_steps={max_steps} without arriving."])

@hot_tool
def u6_goto_xy(x: int, y: int, max_steps: int = 150, segment: int = -1) -> str:
    """Ultima VI: walk the controlled actor to world tile (x,y) on the current level,
    CLOSED-LOOP -- the coordinate counterpart of u6_goto. Each step: re-read the live
    position, rebuild the grid, route AROUND the current non-party NPCs (a party
    member never blocks -- the avatar swaps with it; only a townsperson/guard/monster
    does), take ONE u6_move, and confirm it landed. NPCs move every turn, so a static
    path goes stale -- this re-plans every step and, when an NPC sits in the only
    corridor, bump-waits a few turns for it to clear before giving up. Off-window
    targets are handled by stepping toward the nearest edge cell (the window scrolls,
    then we re-plan). Stops when standing on (x,y), or reports where/why it stalled
    (boxed in, NPC parked in the sole path, or target tile itself blocked -- e.g. a
    closed door you must u6_use). Reads N (each step is a real game turn); raise
    max_steps for long hauls. North=-y South=+y West=-x East=+x. DS from u6_hook."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    tx, ty = x & U6_WORLD_MASK, y & U6_WORLD_MASK
    log, stuck = [], 0
    STUCK_CAP = 8                                         # bump-wait budget for a parked NPC
    for step_i in range(max_steps):
        try:
            self_slot, _idx, _veh = _controlled_slot(base)
            x0, y0, z0 = _controlled_xyz(base)
            walk, cost, ax, ay = _build_grid(base)
            actors = _actor_cells(base, z0, ax, ay, self_slot)
        except OSError as ex:
            return "\n".join(log + [f"Read failed: {ex}"])
        if (x0, y0) == (tx, ty):
            return "\n".join(log + [f"Arrived at ({tx},{ty}) in {step_i} step(s)."])
        start = _world_to_cell(x0, y0, ax, ay)
        if start is None:
            return "\n".join(log + [f"Controlled actor ({x0},{y0}) outside its own window -- stop."])
        # Primary plan: route AROUND current NPCs (mask them out of the grid).
        walkm = _mask_walk(walk, actors)
        goal = _closest_reachable(walkm, start, ax, ay, tx, ty)
        using = "around-npcs"
        if goal == start:                                # can't get closer avoiding NPCs...
            goal = _closest_reachable(walk, start, ax, ay, tx, ty)   # ...try through them (bump-wait)
            walkm, using = walk, "through-npcs"
            if goal == start:                            # boxed by walls/doors even ignoring NPCs
                gx, gy = (ax + start[1]) & U6_WORLD_MASK, (ay + start[0]) & U6_WORLD_MASK
                if abs(gx - tx) + abs(gy - ty) == 1:
                    td = _dir_to(tx - x0, ty - y0)
                    return "\n".join(log + [f"Adjacent to ({tx},{ty}) at ({x0},{y0}); it's to the "
                                            f"{td} but that tile is blocked (wall / closed door / "
                                            f"occupied). If a door, u6_use('{td}')."])
                return "\n".join(log + [f"No route toward ({tx},{ty}); boxed in at ({x0},{y0}) "
                                        f"(walls/doors). Closest reachable is here."])
        steps = _dijkstra(walkm, cost, start, {goal})
        if not steps:
            return "\n".join(log + [f"Planner found a goal but no path (unexpected) at ({x0},{y0})."])
        mv = steps[0]
        _wait_command_ready(base)
        inp.send_key(_STEP_ARROW[mv])
        time.sleep(0.05)
        _wait_command_ready(base)
        try:
            x1, y1, _ = _controlled_xyz(base)
        except OSError:
            x1, y1 = x0, y0
        if (x1, y1) == (x0, y0):
            stuck += 1
            log.append(f"step {step_i}: {_STEP_NAME[mv]} blocked ({using}) [{stuck}/{STUCK_CAP}]")
            if stuck >= STUCK_CAP:
                nx, ny = (x0 + mv[1]) & U6_WORLD_MASK, (y0 + mv[0]) & U6_WORLD_MASK   # mv=(dr=dy,dc=dx)
                return "\n".join(log + [f"Stuck at ({x0},{y0}) after {STUCK_CAP} blocked tries -- an "
                                        f"NPC is parked at ({nx},{ny}) in the only path, or the way is "
                                        f"sealed. Re-run later, or clear the NPC. Target ({tx},{ty})."])
        else:
            stuck = 0
            if len(log) < 40:                            # keep the log bounded on long hauls
                log.append(f"step {step_i}: {_STEP_NAME[mv]} -> ({x1},{y1})")
    return "\n".join(log + [f"Hit max_steps={max_steps} at -> stopped short of ({tx},{ty})."])

def _cell_diag(base_addr, wx, wy, z0, ax, ay):
    """One-line why diagnostic for world cell (wx,wy,z0): ground tile + terrain
    flags, plus any in-world object/actor on it. Called only on an oracle mismatch,
    so it re-reads freely."""
    terr = _static_table(base_addr, U6_TerrainType_ptr, _TILEFLAG_N, "terr")
    parts = []
    cell = _world_to_cell(wx, wy, ax, ay)
    if cell:
        tiles = dm.read(S.handle, base_addr + U6_AreaTiles, U6_AREA_H * U6_AREA_W)
        gt = tiles[cell[0] * U6_AREA_W + cell[1]]
        gf = terr[gt] if 0 <= gt < len(terr) else 0
        parts.append(f"ground tile={gt} terr=0x{gf:02x}")
    status = dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS)
    pos    = dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3)
    shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    hits = []
    for i in range(1, U6_MAX_SLOTS):
        if (status[i] & 0x18) != 0:
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        if (v & 0x3ff) != wx or ((v >> 10) & 0x3ff) != wy or ((v >> 20) & 0xf) != z0:
            continue
        typ = (shape[i * 2] | (shape[i * 2 + 1] << 8)) & 0x3ff
        if typ == 0:
            continue
        hits.append(f"slot 0x{i:x} type 0x{typ:x}" + (" ACTOR" if i < 0x100 else ""))
    if hits:
        parts.append("on cell: " + ", ".join(hits[:5]))
    return "; ".join(parts) if parts else "(no terrain/obj info)"

@hot_tool
def u6_validate_passability(restore: bool = True, settle_ms: int = 160,
                            segment: int = -1) -> str:
    """Ultima VI: EMPIRICALLY verify the ported passability oracle (C_1E0F_000F)
    against the live game -- the fidelity gate. For each cardinal direction it
    (re-)reads avatar + grid + actors, PREDICTS pass/block, sends the move, re-reads
    the avatar position to see what the game DID, and reports MATCH / MISMATCH.

    By default it steps back after any successful move so the avatar ends where it
    started -- but each probe still costs game turns, so run it on a SAFE save
    (e.g. standing in the castle), not mid-combat. A mismatch dumps the destination
    tile id + flags + any object/actor, so a wrong prediction is debuggable on the
    spot. DOSBox must be focused (SendInput). DS from u6_hook unless overridden."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        sx, sy, sz = _controlled_xyz(base)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    out = [f"Passability validation at controlled actor ({sx},{sy},z{sz}) "
           f"-- predict (oracle) vs actual (live move):"]
    mismatches = 0
    for dr, dc in _DIR_DELTAS:
        name = _STEP_NAME[(dr, dc)]
        _wait_command_ready(base)            # predict from a stable turn boundary
        try:
            self_slot, _idx, _veh = _controlled_slot(base)
            x0, y0, z0 = _controlled_xyz(base)
            walk, _cost, ax, ay = _build_grid(base)
            actors = _actor_cells(base, z0, ax, ay, self_slot)
        except OSError as ex:
            out.append(f"  {name}: read failed: {ex}")
            continue
        av = _world_to_cell(x0, y0, ax, ay)
        if av is None:
            out.append(f"  {name}: avatar outside window -- skipped")
            continue
        nr, nc = av[0] + dr, av[1] + dc
        in_win = 0 <= nr < U6_AREA_H and 0 <= nc < U6_AREA_W
        predict = bool(in_win and walk[nr][nc] and (nr, nc) not in actors)
        wx, wy = (x0 + dc) & 0x3ff, (y0 + dr) & 0x3ff
        inp.send_key(_STEP_ARROW[(dr, dc)])
        time.sleep(settle_ms / 1000.0)
        _wait_command_ready(base)            # wait for the turn to resolve before re-reading
        try:
            x1, y1, _ = _controlled_xyz(base)
        except OSError:
            x1, y1 = x0, y0
        actual = (x1, y1) == (wx, wy)
        ok = (actual == predict)
        if not ok:
            mismatches += 1
        line = (f"  {name}: predict={'pass' if predict else 'block'} "
                f"actual={'pass' if actual else 'block'}  {'OK' if ok else '**MISMATCH**'}")
        if not ok:
            line += "  | " + _cell_diag(base, wx, wy, z0, ax, ay)
        out.append(line)
        if actual and restore:                              # we moved -- step back
            _wait_command_ready(base)
            inp.send_key(_RESTORE_ARROW[name])
            time.sleep(settle_ms / 1000.0)
    out.append("-- " + ("ALL 4 MATCH: oracle faithful here." if mismatches == 0
                        else f"{mismatches} MISMATCH(es): oracle diverges -- inspect the diag + C_1E0F_000F."))
    return "\n".join(out)


__all__ = [
    "_DOOR_GLYPH",
    "_RESTORE_ARROW",
    "_build_grid",
    "_dijkstra",
    "_adjacent_goals",
    "_mask_walk",
    "_closest_reachable",
    "_cell_diag",
    "u6_walkable",
    "u6_area_map_data",
    "u6_area_map",
    "u6_pathfind",
    "u6_goto",
    "u6_goto_xy",
    "u6_validate_passability",
]
