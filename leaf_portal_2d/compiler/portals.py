"""Portal generation — the doorways between empty leaves.

For each node an oversized candidate portal is laid on the node's line and
pushed down the whole tree from the root; the tree carves it into the fragments
that are empty on both sides. A fragment bordering exactly two empty leaves is a
real portal. See ``docs/02_portals.md``.

Inspired by the Mr-GameMaker.com BSP tutorial series (Gary Simmons & Adam Hoult).
"""

from __future__ import annotations

from geom2d import (
    Vec2, classify_wall, split_wall,
    dot, sub, add, mul, length,
    FRONT, BACK, ON, SPAN,
)
from bsp import Node, Leaf, Child


class Portal:
    """A candidate doorway: a segment ``a -> b`` carrying the origin node's
    normal ``n`` plus the empty leaves it has landed in so far. Shaped like a
    ``geom2d.Wall`` (``a`` / ``b`` / ``n`` / ``piece``) so the same
    ``classify_wall`` / ``split_wall`` routines apply."""

    __slots__ = ("a", "b", "n", "owners")

    a: Vec2
    b: Vec2
    n: Vec2
    owners: list[int]

    def __init__(self, a: Vec2, b: Vec2, n: Vec2,
                 owners: list[int] | None = None) -> None:
        self.a = (float(a[0]), float(a[1]))
        self.b = (float(b[0]), float(b[1]))
        self.n = n
        self.owners = list(owners) if owners else []

    def piece(self, a: Vec2, b: Vec2) -> Portal:
        """A sub-segment (same normal) inheriting a COPY of the owner list, so a
        split sends independent owner lists down each side."""
        return Portal(a, b, self.n, self.owners)

    def length(self) -> float:
        return length(sub(self.b, self.a))


def initial_portal(node: Node) -> Portal:
    """The oversized candidate on ``node``'s line: centred at the box centre
    projected onto the line, half-length = the box half-diagonal (so it
    overshoots the node's region; the clip step trims it)."""
    (minx, miny), (maxx, maxy) = node.bbox
    centre = ((minx + maxx) / 2, (miny + maxy) / 2)
    p, n = node.plane_p, node.plane_n
    cp = add(centre, mul(n, dot(sub(p, centre), n)))     # centre projected to line
    direction = (-n[1], n[0])                            # along the line (n is unit)
    half = length(sub((maxx, maxy), centre))             # box half-diagonal
    return Portal(add(cp, mul(direction, half)),
                  sub(cp, mul(direction, half)), n)


def clip_portal(root: Child, portal: Portal) -> list[Portal]:
    """Push ``portal`` from ``root`` down the tree; return the fragments that
    survived, each carrying the leaves it landed in."""
    kind, obj = root
    if kind == "solid":
        return []                                        # backed by solid — no door
    if kind == "leaf":
        leaf: Leaf = obj  # type: ignore[assignment]
        portal.owners.append(leaf.index)                 # landed in an empty leaf
        return [portal]

    node: Node = obj  # type: ignore[assignment]
    side = classify_wall(portal, node.plane_p, node.plane_n)

    if side == FRONT:
        return clip_portal(node.front, portal)
    if side == BACK:
        return clip_portal(node.back, portal)
    if side == SPAN:
        pf, pb = split_wall(portal, node.plane_p, node.plane_n)
        out: list[Portal] = []
        if pf:
            out += clip_portal(node.front, pf)           # front piece (never solid)
        if pb:
            out += clip_portal(node.back, pb)            # back piece (dropped if solid)
        return out

    # ON — the portal reached its own origin node: collect the front leaf, then
    # push each surviving fragment down the back to collect the back leaf. This
    # is the only case that can give a fragment two owners.
    out = []
    for fragment in clip_portal(node.front, portal):
        out += clip_portal(node.back, fragment)
    return out


def build_portals(root: Child) -> tuple[list[Portal], list[Leaf]]:
    """Generate every portal for the tree. Returns the portal list (each with
    ``owners = [front_leaf, back_leaf]``) and the index-ordered leaves, every
    leaf's ``portals`` filled with the indices of the portals on its border."""
    # Recursion trade-off: clip_portal recurses the tree (depth = tree height).
    # We flatten the nodes to a list first and then loop, so the outer traversal
    # is a flat for-loop and only clip_portal is ever on the stack — we never
    # nest two tree-recursions. At 2D scale tree depth is tens, far under
    # Python's recursion limit (1000; exceeding it raises a catchable
    # RecursionError, not a hard crash). If a pathologically deep scene ever
    # appears, escalate: raise sys.setrecursionlimit, then rewrite clip_portal
    # iteratively — the ON case's front-then-back dependency is what makes that
    # the fiddly one; this flat node loop never needs converting.
    leaves = _index_leaves(root)
    portals: list[Portal] = []

    for node in _collect_nodes(root):
        for fragment in clip_portal(root, initial_portal(node)):
            if len(fragment.owners) != 2:
                continue                                 # solid on a side (or neither)
            _add_or_merge(fragment, portals)

    for index, portal in enumerate(portals):
        for owner in portal.owners:
            leaves[owner].portals.append(index)
    return portals, leaves


def _add_or_merge(fragment: Portal, portals: list[Portal]) -> None:
    """Add a 2-owner fragment, deduping by leaf pair: if a portal already joins
    the same pair, keep the longer segment."""
    pair = frozenset(fragment.owners)
    for i, existing in enumerate(portals):
        if frozenset(existing.owners) == pair:
            if fragment.length() > existing.length():
                portals[i] = fragment
            return
    portals.append(fragment)


def _index_leaves(root: Child) -> list[Leaf]:
    """Assign each Leaf a stable index (DFS, front before back — the same order
    the serializer emits) and return them in that order. These are the indices
    both the portals and the serialized ``leaves[]`` refer to."""
    leaves: list[Leaf] = []

    def walk(child: Child) -> None:
        kind, obj = child
        if kind == "leaf":
            leaf: Leaf = obj  # type: ignore[assignment]
            leaf.index = len(leaves)
            leaf.portals = []
            leaves.append(leaf)
        elif kind == "node":
            node: Node = obj  # type: ignore[assignment]
            walk(node.front)
            walk(node.back)

    walk(root)
    return leaves


def _collect_nodes(root: Child) -> list[Node]:
    nodes: list[Node] = []

    def walk(child: Child) -> None:
        kind, obj = child
        if kind == "node":
            node: Node = obj  # type: ignore[assignment]
            nodes.append(node)
            walk(node.front)
            walk(node.back)

    walk(root)
    return nodes
