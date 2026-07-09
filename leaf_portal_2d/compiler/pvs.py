"""PVS — per-leaf potentially visible set.

For each leaf we flood outward through portals; a leaf reached with a non-empty
sight cone is potentially visible. The cone is the anti-penumbra of the portal
chain, which in 2D is a wedge bounded by (at most) two separating lines — the
crossed tangents between the two segment portals. See ``docs/03_pvs.md``.

Inspired by the Mr-GameMaker.com BSP tutorial series (Gary Simmons & Adam Hoult).
"""

from __future__ import annotations

from geom2d import (
    Vec2, EPS, classify_point, classify_wall, split_wall,
    sub, normalize, length,
    FRONT, BACK, ON, SPAN,
)
from bsp import Leaf
from portals import Portal


def calculate_pvs(leaves: list[Leaf], portals: list[Portal]) -> None:
    """Fill every ``leaf.pvs`` with the sorted list of visible leaf indices.

    A leaf always sees itself and its direct portal neighbours; the recursion
    handles everything two or more portals away. Like ``clip_portal``, only the
    inner ``_recurse`` walks a chain — the cone strictly narrows each step, so it
    terminates (see the recursion note in ``portals.py``).
    """
    for leaf in leaves:
        visible = {leaf.index}
        for source_pi in leaf.portals:
            source_portal = portals[source_pi]
            target_leaf = _neighbour(source_portal, leaf.index)
            visible.add(target_leaf)                        # direct neighbour
            for target_pi in leaves[target_leaf].portals:
                target_portal = portals[target_pi]
                if target_portal is source_portal:
                    continue
                if classify_wall(target_portal, source_portal.a,
                                 source_portal.n) == ON:
                    continue                                # coincident line
                _recurse(leaf.index, source_portal, target_portal,
                         target_leaf, visible, leaves, portals)
        leaf.pvs = sorted(visible)


def _neighbour(portal: Portal, leaf_index: int) -> int:
    """The owner of ``portal`` that isn't ``leaf_index``."""
    a, b = portal.owners
    return b if a == leaf_index else a


def _centre(leaf: Leaf) -> Vec2:
    (minx, miny), (maxx, maxy) = leaf.bbox
    return ((minx + maxx) / 2, (miny + maxy) / 2)


def _recurse(source_leaf: int, source_portal: Portal, target_portal: Portal,
             target_leaf: int, visible: set[int],
             leaves: list[Leaf], portals: list[Portal]) -> None:
    generator_leaf = _neighbour(target_portal, target_leaf)
    visible.add(generator_leaf)     # reachable through source→target: visible

    # Which side of each portal its own leaf sits on — a generator on that same
    # side is "behind" us and can't be seen through the portal.
    source_side = classify_point(_centre(leaves[source_leaf]),
                                 source_portal.a, source_portal.n)
    target_side = classify_point(_centre(leaves[target_leaf]),
                                 target_portal.a, target_portal.n)

    for gen_pi in leaves[generator_leaf].portals:
        generator = portals[gen_pi]
        if generator is target_portal:
            continue                                        # don't turn back

        loc = classify_wall(generator, source_portal.a, source_portal.n)
        if loc == ON or loc == source_side:
            continue                                        # behind the source
        loc = classify_wall(generator, target_portal.a, target_portal.n)
        if loc == ON or loc == target_side:
            continue                                        # behind the target

        # Clip the generator to the cone, then narrow the source by the clipped
        # generator; both must survive for the chain to continue.
        clipped_gen = _clip_to_anti_penumbra(source_portal, target_portal, generator)
        if clipped_gen is None:
            continue
        clipped_src = _clip_to_anti_penumbra(clipped_gen, target_portal, source_portal)
        if clipped_src is None:
            continue

        _recurse(source_leaf, clipped_src, clipped_gen, generator_leaf,
                 visible, leaves, portals)


def _separating_lines(source: Portal, target: Portal) -> list[tuple[Vec2, Vec2]]:
    """The (≤2) lines through a source endpoint and a target endpoint that put
    the whole source on one side and the whole target on the other — the crossed
    tangents that bound the anti-penumbra wedge."""
    lines: list[tuple[Vec2, Vec2]] = []
    for sv in (source.a, source.b):
        for tv in (target.a, target.b):
            d = sub(tv, sv)
            if length(d) <= EPS:
                continue
            n = normalize((-d[1], d[0]))                    # line through sv, tv
            if _crossed(classify_wall(source, sv, n),
                        classify_wall(target, sv, n)):
                lines.append((sv, n))
    return lines


def _crossed(source_side: str, target_side: str) -> bool:
    return ((source_side == FRONT and target_side == BACK) or
            (source_side == BACK and target_side == FRONT))


def _clip_to_anti_penumbra(source: Portal, target: Portal,
                           generator: Portal) -> Portal | None:
    """Clip ``generator`` to the anti-penumbra of ``source`` seen through
    ``target``; return the surviving fragment, or ``None`` if it lies entirely
    outside the wedge."""
    for p, n in _separating_lines(source, target):
        gen_loc = classify_wall(generator, p, n)
        src_loc = classify_wall(source, p, n)
        if gen_loc == ON or gen_loc == src_loc:
            return None                       # entirely on the source's side
        if gen_loc == SPAN:                   # keep the piece away from source
            front_piece, back_piece = split_wall(generator, p, n)
            generator = back_piece if src_loc == FRONT else front_piece
            if generator is None:
                return None
        # else: opposite side -> fully inside the cone, keep unchanged
    return generator
