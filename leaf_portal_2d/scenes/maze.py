"""The ``maze`` scene: a serpentine corridor that actually occludes.

Unlike ``room`` (where every leaf sees every other), this layout hides its far
ends, so the PVS becomes a strict subset — the scene that makes stage-3 culling
visible.

The whole walkable space is authored as one **concave** polygon: a rectangular
room whose top and bottom edges are notched by four thin **teeth** (solid wall
fingers) alternating from the ceiling and the floor. The passages left beside
the teeth alternate bottom / top / bottom / top, so walking it snakes left→right
through five chambers A–E.

The teeth **overlap vertically** (ceiling teeth reach down to y=380, floor teeth
up to y=220, sharing the band y∈[220,380]), so no straight sightline threads more
than a couple of passages — the far chambers drop out of each chamber's PVS.

One concave ``facing:"in"`` polygon, no separate solid slabs: the teeth are
notches in the boundary, so every wall is a real empty/solid edge — orientation
comes from ``facing``, not the shape (see the winding note in
``docs/00_overview.md``).
"""

BOUNDS = ((0, 0), (800, 600))

POLYGONS = [
    {"facing": "in", "points": [
        (50, 50),                                         # top-left
        (180, 50), (180, 380), (200, 380), (200, 50),     # notch down around T1 (ceiling)
        (460, 50), (460, 380), (480, 380), (480, 50),     # notch down around T3 (ceiling)
        (750, 50),                                        # top-right
        (750, 550),                                       # bottom-right
        (620, 550), (620, 220), (600, 220), (600, 550),   # notch up around T4 (floor)
        (340, 550), (340, 220), (320, 220), (320, 550),   # notch up around T2 (floor)
        (50, 550),                                        # bottom-left
    ]},
]

# Sign check (see compile.py): each point should resolve as labelled. A "tooth"
# is a notch in the boundary, so a point inside one is outside the corridor.
PROBES = [
    ((110, 300), "chamber A (left) -> empty"),
    ((690, 300), "chamber E (right) -> empty"),
    ((190, 200), "inside a tooth -> SOLID"),
    ((25, 25),   "outside room -> SOLID"),
]
