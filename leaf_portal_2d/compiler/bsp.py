"""Leaf-BSP tree builder.

Turns a flat list of walls into a tree whose leaves are convex regions of
*empty* space (the solid-leaf convention: only empty leaves exist; solid space
is represented by nothing at all). See ``docs/01_leaf_tree.md``.

Inspired by the Mr-GameMaker.com BSP tutorial series (Gary Simmons & Adam Hoult).
"""

from __future__ import annotations

from geom2d import (
    Wall, Vec2,
    classify_wall, split_wall, bbox_of_walls, dot, sub,
    FRONT, BACK, ON, SPAN,
)

SPLIT_COST_K = 3   # penalty per wall a candidate splits (docs/01_leaf_tree.md §2)

# A child slot is a (kind, payload) pair, where kind is one of:
#   ("node", Node)  ("leaf", Leaf)  ("solid", None)
# The payload is left loose (``object``) — the tag/payload tuple pattern does
# not narrow cleanly, so callers switch on the kind string.
Child = tuple[str, object]

SOLID: Child = ("solid", None)


class Leaf:
    """A convex region of empty space: the wall fragments that bound it plus
    their bounding box. ``index`` is assigned during portal generation and
    ``portals`` holds the indices of the portals on this leaf's border (both set
    in stage 2); ``pvs`` is filled in stage 3."""

    __slots__ = ("walls", "bbox", "index", "portals")

    walls: list[Wall]
    bbox: tuple[Vec2, Vec2]
    index: int
    portals: list[int]

    def __init__(self, walls: list[Wall]) -> None:
        self.walls = walls
        self.bbox = bbox_of_walls(walls)
        self.index = -1
        self.portals = []


class Node:
    """An internal split: the splitter line ``(plane_p, plane_n)``, a front and
    a back child, and the bounding box of the walls beneath it."""

    __slots__ = ("plane_p", "plane_n", "front", "back", "bbox")

    plane_p: Vec2
    plane_n: Vec2
    front: Child
    back: Child
    bbox: tuple[Vec2, Vec2]

    def __init__(self, plane_p: Vec2, plane_n: Vec2, front: Child,
                 back: Child, bbox: tuple[Vec2, Vec2]) -> None:
        self.plane_p = plane_p
        self.plane_n = plane_n
        self.front = front
        self.back = back
        self.bbox = bbox


def select_best_splitter(walls: list[Wall]) -> Wall:
    """Pick the unused wall whose line makes the best cut, mark it used, and
    return it. Score = imbalance ``|front - back|`` plus a per-split penalty, so
    a low score means a balanced cut that fragments few walls."""
    best: Wall | None = None
    best_score: int | None = None
    for cand in walls:
        if cand.used:
            continue
        f = b = s = 0
        for other in walls:
            if other is cand:
                continue
            c = classify_wall(other, cand.a, cand.n)
            if c == FRONT:
                f += 1
            elif c == BACK:
                b += 1
            elif c == SPAN:
                s += 1
            # ON is ignored — it neither balances nor fragments.
        score = abs(f - b) + s * SPLIT_COST_K
        if best_score is None or score < best_score:
            best, best_score = cand, score
    best.used = True
    return best


def build_node(walls: list[Wall], side_is_empty: bool) -> Child:
    """Recursively build the tree for ``walls``.

    ``side_is_empty`` is whether this region sits on the empty (front) side of
    its parent split. A list with no unused walls is convex: it becomes an
    empty ``Leaf`` when on the empty side, otherwise it is solid and dropped.
    """
    if not any(not w.used for w in walls):
        return ("leaf", Leaf(walls)) if side_is_empty else SOLID

    node_bbox = bbox_of_walls(walls)
    splitter = select_best_splitter(walls)
    p, n = splitter.a, splitter.n

    front: list[Wall] = []
    back: list[Wall] = []
    for w in walls:
        c = classify_wall(w, p, n)
        if c == FRONT:
            front.append(w)
        elif c == BACK:
            back.append(w)
        elif c == ON:
            # A wall on the splitter line joins the side its own normal faces.
            (front if dot(w.n, n) > 0 else back).append(w)
        else:  # SPAN
            fp, bp = split_wall(w, p, n)
            if fp:
                front.append(fp)
            if bp:
                back.append(bp)

    front_child = build_node(front, True)
    back_child = build_node(back, False) if back else SOLID
    return ("node", Node(p, n, front_child, back_child, node_bbox))


def build_tree(walls: list[Wall]) -> Child:
    """Build the tree and return its root child slot (a ``node`` for any scene
    that needs splitting, or a single ``leaf`` for a lone convex region)."""
    return build_node(walls, True)


def locate(root: Child, point: Vec2) -> Leaf | None:
    """Walk the tree to the leaf containing ``point``; return that ``Leaf`` or
    ``None`` if the point is in solid space. Used for the compile-time sign
    check and as the spatial-index primitive later stages reuse."""
    kind, obj = root
    while kind == "node":
        node: Node = obj  # type: ignore[assignment]  # kind == node -> Node
        s = dot(sub(point, node.plane_p), node.plane_n)
        kind, obj = node.front if s >= 0 else node.back
    return obj if kind == "leaf" else None  # type: ignore[return-value]
