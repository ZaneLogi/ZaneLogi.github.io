"""The ``room`` scene: a rectangular room with a single square obstacle.

Pure data — the compiler turns these polygons into wound walls. ``facing``
picks which way each polygon's normals point:

- the room's walls face ``"in"``  (empty is inside the room),
- the obstacle's walls face ``"out"`` (empty is the floor around it).
"""

BOUNDS = ((0, 0), (800, 600))

POLYGONS = [
    {"facing": "in",  "points": [(50, 50), (750, 50), (750, 550), (50, 550)]},
    {"facing": "out", "points": [(350, 250), (450, 250), (450, 350), (350, 350)]},
]

# Sign check run at compile time (see compile.py): each point should resolve to
# empty or solid as labelled. If they come out swapped, the wall-normal sign is
# inverted.
PROBES = [
    ((100, 300), "open floor -> empty"),
    ((400, 300), "inside obstacle -> SOLID"),
    ((25, 25),   "outside room -> SOLID"),
]
