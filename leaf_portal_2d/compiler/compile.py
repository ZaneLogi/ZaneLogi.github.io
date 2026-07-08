"""Compile a scene into ``levels/<scene>.json``.

Usage (run from the ``leaf_portal_2d/`` folder)::

    python compiler/compile.py room

Loads ``scenes/<scene>.py``, builds the leaf-BSP tree, and writes the JSON the
demos read. Also runs the scene's PROBES as a wall-normal sign check.

Inspired by the Mr-GameMaker.com BSP tutorial series (Gary Simmons & Adam Hoult).
"""

import sys
import json
import importlib.util
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # geom2d / bsp
import geom2d
import bsp

ROOT = Path(__file__).resolve().parent.parent  # leaf_portal_2d/


def _r(v):
    """Round a coordinate and normalize -0.0 to 0.0 for clean JSON."""
    v = round(v, 6)
    return 0.0 if v == 0 else v


def _pt(p):
    return [_r(p[0]), _r(p[1])]


def _bbox(bb):
    return {"min": _pt(bb[0]), "max": _pt(bb[1])}


def serialize(root, bounds):
    """Flatten the tree into the ``level.json`` shape (planes / nodes / leaves).

    The root is always ``nodes[0]`` for a scene that splits, since it is the
    first node emitted; a single-leaf scene has ``nodes == []``.
    """
    planes, nodes, leaves = [], [], []

    def emit(child):
        kind, obj = child
        if kind == "solid":
            return {"kind": "solid"}
        if kind == "leaf":
            index = len(leaves)
            leaves.append({
                "walls": [[_r(w.a[0]), _r(w.a[1]), _r(w.b[0]), _r(w.b[1])]
                          for w in obj.walls],
                "bbox": _bbox(obj.bbox),
                "portals": [],
                "pvs": [],
            })
            return {"kind": "leaf", "index": index}
        # node — reserve its slot before recursing so children index correctly
        index = len(nodes)
        nodes.append(None)
        plane_index = len(planes)
        planes.append({"p": _pt(obj.plane_p), "n": _pt(obj.plane_n)})
        nodes[index] = {
            "plane": plane_index,
            "front": emit(obj.front),
            "back": emit(obj.back),
            "bbox": _bbox(obj.bbox),
        }
        return {"kind": "node", "index": index}

    emit(root)
    return {
        "bounds": _bbox(bounds),
        "planes": planes,
        "nodes": nodes,
        "leaves": leaves,
        "portals": [],
    }


def load_scene(name):
    path = ROOT / "scenes" / f"{name}.py"
    if not path.exists():
        sys.exit(f"scene not found: {path}")
    spec = importlib.util.spec_from_file_location(f"scene_{name}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python compiler/compile.py <scene>")
    name = sys.argv[1]
    scene = load_scene(name)

    walls = []
    for polygon in scene.POLYGONS:
        walls += geom2d.poly(polygon["points"], polygon["facing"])

    root = bsp.build_tree(walls)
    data = serialize(root, scene.BOUNDS)

    out = ROOT / "levels" / f"{name}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(data, indent=2))

    print(f"[{name}] {len(data['nodes'])} nodes, {len(data['leaves'])} leaves "
          f"-> {out.relative_to(ROOT)}")
    for point, label in getattr(scene, "PROBES", []):
        leaf = bsp.locate(root, (float(point[0]), float(point[1])))
        print(f"  probe {tuple(point)} ({label}): "
              f"{'SOLID' if leaf is None else 'empty'}")


if __name__ == "__main__":
    main()
