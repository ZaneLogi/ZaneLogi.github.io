"""u6.cartography -- whole-level routing over the BAKED static terrain (mapdata),
beyond the live 40x40 window.

`u6_pathfind`/`u6_goto_xy` (navigate.py) can only see the engine's live 40x40
`AreaTiles` window, so they can't plan to a place the avatar can't currently see --
off-window targets degrade to greedy edge-stepping. cartography lifts that limit:
it builds a passability grid over the full baked terrain map (the whole 1024x1024
surface, or a 256x256 dungeon level) and runs weighted Dijkstra across it, so the
agent can route to ANY tile on the level -- e.g. a room Lord British named that's
across the castle.

Terrain-only by design: walls/water/mountains block (TerrainType & IMPASS), doorways
are passable floor (a door is an OBJECT, not terrain -- open a closed one at move time
with u6_use). The cost weight `(TerrainType >> 4) + 1` is the engine's, so routes
skirt forest/swamp the way the game does. This is a PLANNER (no input sent); execute
the returned steps with u6_move, or with u6_goto_xy for the closed-loop drive.
"""
import heapq

from u6.constants import *  # noqa: F401,F403
from u6.ctx import *        # noqa: F401,F403
from u6.decode import *     # noqa: F401,F403
from u6 import mapdata
from u6 import navigate     # live walkable grid (_build_grid) for the use-from cell
from u6 import affordance   # predict_use + the shared object scanner

_ROUTE_MARGIN = 96          # grow the start->goal bbox generously: a winding corridor can
                            # detour far from the straight line, so a tight box (the path
                            # leaving the box -> false "no route") is the wrong economy. 96
                            # makes the region ~castle-sized; Dijkstra over it is still <50ms.
_ROUTE_MAX_SPAN = 384       # cap one bbox dimension (bounds Dijkstra; a castle is far smaller)

# memoized terrain expansion (static -> compute once per process; ~50ms surface)
_surf_cache = None
_dun_cache = {}


def _level_tiles(z):
    """Expanded terrain (row-major bytearray) + its width for level z (0=surface)."""
    global _surf_cache
    if z == 0:
        if _surf_cache is None:
            _surf_cache = mapdata.expand_surface()
        return _surf_cache, mapdata.SURFACE_W
    if z not in _dun_cache:
        _dun_cache[z] = mapdata.expand_dungeon(z)
    return _dun_cache[z], mapdata.DUNGEON_W


def _baked_region_grid(base, x0, y0, tx, ty, z):
    """Passability + cost over the world bbox covering (x0,y0)->(tx,ty) (+margin) on
    level z, from the BAKED terrain (mapdata) + the resident TerrainType table. Returns
    (walk[R][C], cost[R][C], ox, oy, R, C); world cell (wx,wy) maps to (wy-oy, wx-ox).
    Terrain-only -- walls/water block, doorways stay passable (doors are objects)."""
    terr = _static_table(base, U6_TerrainType_ptr, _TILEFLAG_N, "terr")
    tiles, W = _level_tiles(z)
    ox = max(0, min(x0, tx) - _ROUTE_MARGIN)
    oy = max(0, min(y0, ty) - _ROUTE_MARGIN)
    C = min(min(W, max(x0, tx) + _ROUTE_MARGIN + 1) - ox, _ROUTE_MAX_SPAN)
    R = min(min(W, max(y0, ty) + _ROUTE_MARGIN + 1) - oy, _ROUTE_MAX_SPAN)
    walk = [[True] * C for _ in range(R)]
    cost = [[1] * C for _ in range(R)]
    for r in range(R):
        rowbase = (oy + r) * W + ox
        wr, cr = walk[r], cost[r]
        for c in range(C):
            gf = terr[tiles[rowbase + c]]
            cr[c] = (gf >> 4) + 1
            if gf & TERRAIN_IMPASS:
                wr[c] = False
    return walk, cost, ox, oy, R, C


def _region_dijkstra(walk, cost, R, C, start, goals):
    """4-connected weighted Dijkstra over an RxC grid to the lowest-cost cell in
    `goals`. Returns a list of (dr,dc) steps, [] if already at a goal, None if none
    of `goals` is reachable."""
    if start in goals:
        return []
    INF = 1 << 30
    dist = {start: 0}
    prev = {start: None}
    pq = [(0, start)]
    while pq:
        d, cur = heapq.heappop(pq)
        if d > dist.get(cur, INF):
            continue
        if cur in goals:
            steps, node = [], cur
            while prev[node] is not None:
                parent, mv = prev[node]
                steps.append(mv)
                node = parent
            steps.reverse()
            return steps
        cr, cc = cur
        for dr, dc in _DIR_DELTAS:
            nr, nc = cr + dr, cc + dc
            if 0 <= nr < R and 0 <= nc < C and walk[nr][nc]:
                nd = d + cost[nr][nc]
                if nd < dist.get((nr, nc), INF):
                    dist[(nr, nc)] = nd
                    prev[(nr, nc)] = (cur, (dr, dc))
                    heapq.heappush(pq, (nd, (nr, nc)))
    return None


def _runlength(dirs):
    """['e','e','e','n'] -> 'e×3 n'."""
    out, i, n = [], 0, len(dirs)
    while i < n:
        j = i
        while j < n and dirs[j] == dirs[i]:
            j += 1
        out.append(dirs[i] if j - i == 1 else f"{dirs[i]}×{j - i}")
        i = j
    return " ".join(out)


@mcp.tool()
def u6_route(x: int, y: int, z: int = -1, segment: int = -1) -> str:
    """Ultima VI: PLAN a route to world tile (x,y) using the FULL baked terrain map --
    NOT limited to the live 40x40 window like u6_pathfind/u6_goto_xy. This is the tool
    for locating and heading to a place you can't currently see (e.g. a room LB named
    across the castle). Returns the cardinal step list (n/s/w/e) + the next direction +
    straight-line bearing/distance, WITHOUT sending input.

    Routes over the wall/floor STRUCTURE: doorways are passable (a door is an object --
    open a closed one when you reach it with u6_use), and the cost weight skirts
    forest/swamp like the engine. z defaults to the avatar's level; pass 1..5 for a
    dungeon level (start is taken at the avatar's x,y). Execute the steps with u6_move,
    or hand the target to u6_goto_xy for the closed-loop drive. DS from u6_hook."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        x0, y0, z0 = _controlled_xyz(base)
        zz = z0 if z < 0 else z
        tx, ty = x & U6_WORLD_MASK, y & U6_WORLD_MASK
        if (x0, y0) == (tx, ty) and zz == z0:
            return f"Already at ({tx},{ty})."
        walk, cost, ox, oy, R, C = _baked_region_grid(base, x0, y0, tx, ty, zz)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    sr, sc = y0 - oy, x0 - ox
    gr, gc = ty - oy, tx - ox
    if not (0 <= sr < R and 0 <= sc < C):
        return f"Avatar ({x0},{y0}) fell outside the routing region -- unexpected."
    if not (0 <= gr < R and 0 <= gc < C):
        return (f"Target ({tx},{ty}) is beyond the {_ROUTE_MAX_SPAN}-tile routing span from "
                f"the avatar ({x0},{y0}) -- too far for one plan (hierarchical routing TBD).")
    if walk[gr][gc]:
        goals, tnote = {(gr, gc)}, ""
    else:
        goals = {(gr + dr, gc + dc) for dr, dc in _DIR_DELTAS
                 if 0 <= gr + dr < R and 0 <= gc + dc < C and walk[gr + dr][gc + dc]}
        tnote = "  (target tile is blocked -- routing to an adjacent tile)"
        if not goals:
            return f"Target ({tx},{ty}) is walled in -- no walkable tile there or adjacent."
    steps = _region_dijkstra(walk, cost, R, C, (sr, sc), goals)
    if steps is None:
        return (f"No route to ({tx},{ty}) over the known terrain on z={zz} -- blocked by walls "
                f"(or the target is on a separately-walled area you must enter another way).")
    if not steps:
        return f"Already at/adjacent to ({tx},{ty})."
    dirs = [_STEP_NAME[s] for s in steps]
    bearing = _compass(tx - x0, ty - y0)
    cheb = max(abs(tx - x0), abs(ty - y0))
    return (f"Route to ({tx},{ty}) z={zz}: {len(dirs)} steps{tnote}.\n"
            f"  next: {dirs[0]}    straight-line: {bearing} (dist {cheb})\n"
            f"  path: {_runlength(dirs)}\n"
            f"(plan only -- step it with u6_move, or drive it closed-loop with "
            f"u6_goto_xy({tx},{ty}). Open any closed door en route with u6_use.)")


# ----------------------------------------------------------------------------
# The structured spatial-query layer (#1 from the castle-escape experiment,
# 2026-06-27): decision-ready answers (terrain + object + decoded state + how-to-
# reach) so the agent stops counting ASCII columns and re-surveying the same area.
# Composes decode (names/state), affordance (predict_use), navigate (the live grid).
# ----------------------------------------------------------------------------

def _use_from(base, ox, oy):
    """For a world object at (ox,oy) on the controlled actor's level, the REACHABLE
    cardinal cell to USE it from + the direction to FACE it. Returns (from_xy, face_dir)
    or (None, None) when the object is off the live 40x40 window or has no reachable
    n/s/e/w neighbour. This is the decision-ready bit: answers 'stand here, face X'
    instead of leaving the agent the neighbour puzzle the diagonally-placed crank forced.

    Reachability is the whole point. A bare 'walkable neighbour' can sit on the FAR side
    of a wall/door -- e.g. a castle door whose north tile is the outside courtyard
    (passable grass) while the avatar is inside; picking it sends u6_goto_xy 'boxed in'.
    So we flood from the AVATAR (navigate._closest_reachable, a BFS over the live grid)
    and take the reachable cell nearest the object: if it's cardinally adjacent it IS a
    use-from cell on the avatar's side; otherwise no cardinal approach is reachable."""
    ox &= U6_WORLD_MASK
    oy &= U6_WORLD_MASK
    walk, _cost, ax, ay = navigate._build_grid(base)
    x0, y0, _z0 = _controlled_xyz(base)
    start = _world_to_cell(x0, y0, ax, ay)
    if start is None:
        return None, None
    nr, nc = navigate._closest_reachable(walk, start, ax, ay, ox, oy)
    wx, wy = (ax + nc) & U6_WORLD_MASK, (ay + nr) & U6_WORLD_MASK
    dx, dy = ox - wx, oy - wy
    if abs(dx) + abs(dy) == 1:                           # reachable cardinal neighbour
        return (wx, wy), _dir_to(dx, dy)                 # face from that cell toward the object
    return None, None


def _top_object_slot(base, tx, ty, tz):
    """The TOP object slot on tile (tx,ty,tz): the engine's per-cell MapObjPtr when the
    tile is inside the live 40x40 window, else the lowest-slot LOCXYZ world object on
    the tile (off-window fallback). Returns a slot (>=0x100) or None."""
    ax = int.from_bytes(dm.read(S.handle, base + U6_AreaX, 2), "little")
    ay = int.from_bytes(dm.read(S.handle, base + U6_AreaY, 2), "little")
    cell = _world_to_cell(tx, ty, ax, ay)
    if cell is not None:
        r, c = cell
        raw = int.from_bytes(
            dm.read(S.handle, base + U6_MapObjPtr + (r * U6_AREA_W + c) * 2, 2), "little")
        if 0x100 <= raw < U6_MAX_SLOTS:
            return raw
    objs = affordance._load_objs(base)
    status = objs[0]
    for i in range(0x100, U6_MAX_SLOTS):
        if status[i] & 0x18:
            continue
        typ, _frm, _ql, x, y, z = affordance._slot_tfqxyz(objs, i)
        if typ and x == tx and y == ty and z == tz:
            return i
    return None


def _describe_obj(base, slot, z0, with_use=True):
    """One-line decode of a world object: 'slot name (type) [state] -- USE: effect'.
    State + USE effect come from affordance.predict_use for usable types."""
    name = _obj_name(base, slot)
    typ, _frm, _qual = _obj_tfq(base, slot)
    desc = f"0x{slot:03x} '{name}' (type 0x{typ:03x})"
    if with_use and typ in affordance._BY_TYPE:
        p = affordance.predict_use(base, slot, z0)
        cur = p.get("current_state")
        if cur is not None:
            desc += f" [{cur}]"
        if p.get("decoded") and p.get("category") == affordance.AFF_MECHANISM:
            desc += f" -- USE: {p['effect']}"
        elif not p.get("decoded"):
            desc += " -- usable (USE effect not decoded this slice)"
    return desc


def _actor_on_tile(base, tx, ty, tz):
    """A creature/NPC (slot < 0x100) on the tile -> 'slot name (allegiance)', else None."""
    objs = affordance._load_objs(base)
    status = objs[0]
    npcst = dm.read(S.handle, base + U6_NPCStatus, 0x100)
    for i in range(0x100):
        if status[i] & 0x18:
            continue
        typ, _frm, _ql, x, y, z = affordance._slot_tfqxyz(objs, i)
        if typ and x == tx and y == ty and z == tz:
            return f"0x{i:02x} '{_obj_name(base, i)}' ({_npc_class(npcst[i])})"
    return None


@mcp.tool()
def u6_at(x: int, y: int, z: int = -1, segment: int = -1) -> str:
    """Ultima VI: STRUCTURED single-cell query -- decode exactly what is at world tile
    (x,y,z), so the agent never has to count ASCII columns. Reports the terrain tile
    id + name + passability (baked mapdata + the live TerrainType table), the TOP
    object on the cell (live MapObjPtr) decoded to name + state (door open/closed/
    locked, container, lever/switch/portcullis state) + its predicted USE effect, and
    any actor on it with allegiance. z defaults to the avatar's level."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    tx, ty = x & U6_WORLD_MASK, y & U6_WORLD_MASK
    try:
        x0, y0, z0 = _controlled_xyz(base)
        zz = z0 if z < 0 else z
        tile = mapdata.tile_at(tx, ty, zz)
        terr = _static_table(base, U6_TerrainType_ptr, _TILEFLAG_N, "terr")
        passable = not (terr[tile] & TERRAIN_IMPASS) if 0 <= tile < len(terr) else True
        slot = _top_object_slot(base, tx, ty, zz)
        objline = _describe_obj(base, slot, zz) if slot is not None else "(none)"
        actor = _actor_on_tile(base, tx, ty, zz)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    out = [f"({tx},{ty},z{zz}):",
           f"  terrain: tile {tile} '{_tile_name(tile)}' -- {'passable' if passable else 'BLOCKED'}",
           f"  object: {objline}",
           f"  actor: {actor if actor else '(none)'}"]
    return "\n".join(out)


@mcp.tool()
def u6_nearest(name: str, radius: int = 16, segment: int = -1) -> str:
    """Ultima VI: find the NEAREST world object whose name matches `name` (e.g.
    'lever', 'crank', 'key', 'chest', 'door') within `radius` of the controlled actor.
    Returns its world (x,y), compass bearing + distance, decoded state + predicted USE
    effect, AND the decision-ready part: the WALKABLE cell to use it from + the cardinal
    direction to face -- so the agent skips the "which neighbour is reachable" puzzle the
    diagonally-placed crank forced in the castle-escape run. DS from u6_hook."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    needle = name.strip().lower()
    try:
        x0, y0, z0 = _controlled_xyz(base)
        objs = affordance._load_objs(base)
        status = objs[0]
        best = None
        for i in range(0x100, U6_MAX_SLOTS):
            if status[i] & 0x18:
                continue
            typ, _frm, _ql, x, y, z = affordance._slot_tfqxyz(objs, i)
            if typ == 0 or z != z0:
                continue
            d = max(abs(x - x0), abs(y - y0))
            if d > radius or (best is not None and d >= best[0]):
                continue
            if needle in _obj_name(base, i).lower():
                best = (d, i, typ, x, y)
        if best is None:
            return f"No object named like '{name}' within {radius} of you ({x0},{y0},z{z0})."
        d, slot, typ, ox, oy = best
        nm = _obj_name(base, slot)
        lines = [f"Nearest '{nm}' (slot 0x{slot:03x}, type 0x{typ:03x}): "
                 f"({ox},{oy}) {_compass(ox - x0, oy - y0)} dist {d}"]
        if typ in affordance._BY_TYPE:
            p = affordance.predict_use(base, slot, z0)
            if p.get("current_state") is not None:
                lines.append(f"  state: {p['current_state']}")
            lines.append(f"  USE: {p['effect']}")
        fxy, face = _use_from(base, ox, oy)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    if fxy is not None:
        lines.append(f"  use-from: stand at {fxy} facing '{face}' "
                     f"(or u6_use_object(0x{slot:03x}) to drive it)")
    else:
        lines.append("  use-from: outside the live window or boxed in -- "
                     "u6_goto_xy nearer, then re-query")
    return "\n".join(lines)


@mcp.tool()
def u6_interactables_near(radius: int = 6, segment: int = -1) -> str:
    """Ultima VI: the "what can I do here" affordance scan -- list the USABLE objects
    within `radius` of the controlled actor (levers, cranks, switches, doors,
    containers, readyable items, ...), each with world (x,y), decoded state + predicted
    USE effect, and HOW to act on it (the walkable cell + cardinal USE direction, or a
    u6_use_object(slot) handle). Turns a raw survey into a ready-to-execute action list.
    Only types in the USE dispatch are listed (plain scenery is skipped). DS from u6_hook."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        x0, y0, z0 = _controlled_xyz(base)
        objs = affordance._load_objs(base)
        status = objs[0]
        found = []
        for i in range(0x100, U6_MAX_SLOTS):
            if status[i] & 0x18:
                continue
            typ, _frm, _ql, x, y, z = affordance._slot_tfqxyz(objs, i)
            if typ == 0 or z != z0 or typ not in affordance._BY_TYPE:
                continue
            d = max(abs(x - x0), abs(y - y0))
            if d <= radius:
                found.append((d, i, typ, x, y))
        if not found:
            return f"No usable objects within {radius} of you ({x0},{y0},z{z0})."
        found.sort()
        out = [f"Usable objects within {radius} of you ({x0},{y0},z{z0}):"]
        for d, slot, typ, ox, oy in found:
            nm = _obj_name(base, slot)
            p = affordance.predict_use(base, slot, z0)
            st = f" [{p['current_state']}]" if p.get("current_state") is not None else ""
            out.append(f"  0x{slot:03x} '{nm}' @ ({ox},{oy}) {_compass(ox - x0, oy - y0)} "
                       f"dist {d}{st}")
            out.append(f"      USE: {p['effect']}")
            fxy, face = _use_from(base, ox, oy)
            if fxy is not None:
                out.append(f"      act: stand {fxy} face '{face}' "
                           f"(or u6_use_object(0x{slot:03x}))")
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    return "\n".join(out)


__all__ = [
    "_ROUTE_MARGIN",
    "_ROUTE_MAX_SPAN",
    "_level_tiles",
    "_baked_region_grid",
    "_region_dijkstra",
    "_runlength",
    "u6_route",
    "_use_from",
    "_top_object_slot",
    "_describe_obj",
    "_actor_on_tile",
    "u6_at",
    "u6_nearest",
    "u6_interactables_near",
]
