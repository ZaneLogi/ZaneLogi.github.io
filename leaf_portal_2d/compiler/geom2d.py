"""2D geometry primitives for the leaf-BSP compiler.

Points are ``(x, y)`` float tuples. Canvas convention: +X right, +Y **down**,
origin top-left. A wall's unit normal points into EMPTY (front) space, and a
point ``Q`` is in *front* of a line ``(P, N)`` when ``(Q - P) . N > 0``.

Inspired by the Mr-GameMaker.com BSP tutorial series (Gary Simmons & Adam Hoult).
"""

from __future__ import annotations

import math

EPS = 1e-4

# Wall classification results.
FRONT, BACK, ON, SPAN = "FRONT", "BACK", "ON", "SPAN"

# A point or vector in the plane.
Vec2 = tuple[float, float]


# --- vector helpers on (x, y) tuples ---------------------------------------

def sub(a: Vec2, b: Vec2) -> Vec2:
    return (a[0] - b[0], a[1] - b[1])


def add(a: Vec2, b: Vec2) -> Vec2:
    return (a[0] + b[0], a[1] + b[1])


def mul(a: Vec2, s: float) -> Vec2:
    return (a[0] * s, a[1] * s)


def dot(a: Vec2, b: Vec2) -> float:
    return a[0] * b[0] + a[1] * b[1]


def length(a: Vec2) -> float:
    return math.hypot(a[0], a[1])


def normalize(a: Vec2) -> Vec2:
    L = length(a)
    if L == 0:
        raise ValueError("cannot normalize a zero-length vector")
    return (a[0] / L, a[1] / L)


def normal(a: Vec2, b: Vec2) -> Vec2:
    """Unit normal of the directed segment ``a -> b``.

    N = rot90(direction) with the sign that puts *front* on the right of
    ``a -> b`` in the Y-down canvas: for a direction ``(dx, dy)`` the normal is
    ``(-dy, dx)``. This sign is browser-verified against the compiled room.
    """
    dx, dy = sub(b, a)
    return normalize((-dy, dx))


# --- walls ------------------------------------------------------------------

class Wall:
    """A finite piece of solid boundary: endpoints ``a``, ``b`` plus the unit
    normal ``n`` (into empty space). ``used`` marks a wall already chosen as a
    splitter — it stays in the list but can never be chosen again."""

    __slots__ = ("a", "b", "n", "used")

    a: Vec2
    b: Vec2
    n: Vec2
    used: bool

    def __init__(self, a: Vec2, b: Vec2, n: Vec2 | None = None,
                 used: bool = False) -> None:
        self.a = (float(a[0]), float(a[1]))
        self.b = (float(b[0]), float(b[1]))
        self.n = n if n is not None else normal(self.a, self.b)
        self.used = used

    def piece(self, a: Vec2, b: Vec2) -> Wall:
        """A sub-segment of this wall (same direction, so same normal), which
        inherits the ``used`` flag per the leaf-build rules."""
        return Wall(a, b, self.n, self.used)


def poly(points: list[Vec2], facing: str) -> list[Wall]:
    """Build a closed loop of walls from polygon vertices.

    ``facing`` is ``"in"`` (normals point toward the centroid — empty inside,
    e.g. a room) or ``"out"`` (normals point away — empty outside, e.g. an
    obstacle). Each edge is wound so its stored normal equals ``normal(a, b)``;
    if the natural order faces the wrong way the edge is reversed.
    """
    pts = [(float(x), float(y)) for x, y in points]
    n = len(pts)
    centroid = (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)
    want_inward = facing == "in"

    walls: list[Wall] = []
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        mid = mul(add(a, b), 0.5)
        points_inward = dot(normal(a, b), sub(centroid, mid)) > 0
        if points_inward != want_inward:
            a, b = b, a  # reverse edge -> flips the normal
        walls.append(Wall(a, b))
    return walls


# --- classification & splitting --------------------------------------------

def classify_point(q: Vec2, p: Vec2, n: Vec2) -> str:
    """FRONT / BACK / ON for point ``q`` against line ``(p, n)``."""
    s = dot(sub(q, p), n)
    if s > EPS:
        return FRONT
    if s < -EPS:
        return BACK
    return ON


def classify_wall(wall: Wall, p: Vec2, n: Vec2) -> str:
    """Classify a wall against line ``(p, n)`` by combining its endpoints."""
    ca = classify_point(wall.a, p, n)
    cb = classify_point(wall.b, p, n)
    if ca == ON and cb == ON:
        return ON
    if ca != BACK and cb != BACK:   # {FRONT, ON} x {FRONT, ON}, not both ON
        return FRONT
    if ca != FRONT and cb != FRONT:  # {BACK, ON} x {BACK, ON}
        return BACK
    return SPAN


def split_wall(wall: Wall, p: Vec2, n: Vec2) -> tuple[Wall | None, Wall | None]:
    """Split a spanning wall at line ``(p, n)``.

    Returns ``(front_piece, back_piece)``; either may be ``None`` if the
    crossing snaps onto an endpoint (zero-length sliver dropped). Pieces keep
    ``a -> b`` direction, so their normal is unchanged.
    """
    a, b = wall.a, wall.b
    da = dot(sub(a, p), n)
    db = dot(sub(b, p), n)
    t = da / (da - db)                 # fraction along a->b where it crosses
    i = add(a, mul(sub(b, a), t))

    if length(sub(i, a)) <= EPS:
        i = a
    elif length(sub(i, b)) <= EPS:
        i = b

    if da > 0:                          # a is on the front side
        front = None if i == a else wall.piece(a, i)
        back = None if i == b else wall.piece(i, b)
    else:                               # b is on the front side
        back = None if i == a else wall.piece(a, i)
        front = None if i == b else wall.piece(i, b)
    return front, back


# --- bounding boxes ---------------------------------------------------------

def bbox_of_walls(walls: list[Wall]) -> tuple[Vec2, Vec2]:
    """Axis-aligned box ``((minx, miny), (maxx, maxy))`` over all endpoints."""
    xs = [c for w in walls for c in (w.a[0], w.b[0])]
    ys = [c for w in walls for c in (w.a[1], w.b[1])]
    return ((min(xs), min(ys)), (max(xs), max(ys)))
