"""Offline tests for the #1 structured-query layer in u6.cartography: the pure helpers
that don't need the static-table / gear machinery -- _use_from (adjacent walkable cell +
face direction, over a stubbed live grid) and _top_object_slot (MapObjPtr top in-window,
world-object tile scan off-window).

The full u6_at / u6_nearest / u6_interactables_near string output rides the same gear/
name static tables as u6_objects_near, so it is covered by the live run (same stance as
test_cartography for u6_route). predict_use composition is proven in test_affordance.
"""
import sys, types, os

# Hermetic bootstrap (mirrors test_cartography / test_affordance).
dm = types.ModuleType("dosbox_mem")
class _Sess:
    def __init__(self): self.handle = None; self.membase = None
    def reset(self): pass
dm.Session = _Sess
dm.register_base_tools = lambda mcp, S: types.SimpleNamespace()
dm.register_input_tools = lambda mcp, S: types.SimpleNamespace()
dm.read = lambda *a: b""
dm.iter_regions = lambda handle: []
dm.HINT_NO_MEMBASE = "no membase"
sys.modules["dosbox_mem"] = dm
di = types.ModuleType("dosbox_input")
di.register_input_tools = lambda mcp, S: types.SimpleNamespace()
sys.modules["dosbox_input"] = di
m_mcp = types.ModuleType("mcp"); m_srv = types.ModuleType("mcp.server")
m_fm = types.ModuleType("mcp.server.fastmcp")
class FastMCP:
    def __init__(self, *a, **k): pass
    def tool(self, *a, **k): return lambda f: f
    def run(self): pass
m_fm.FastMCP = FastMCP
sys.modules["mcp"] = m_mcp; sys.modules["mcp.server"] = m_srv
sys.modules["mcp.server.fastmcp"] = m_fm

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from u6.constants import (U6_MAX_SLOTS, U6_ObjStatus, U6_ObjPos, U6_ObjShapeType,
                          U6_Amount, U6_AreaX, U6_AreaY, U6_MapObjPtr, U6_AREA_W, U6_AREA_H)


def _build_arrays(objects):
    status = bytearray(U6_MAX_SLOTS)
    pos    = bytearray(U6_MAX_SLOTS * 3)
    shape  = bytearray(U6_MAX_SLOTS * 2)
    amount = bytearray(U6_MAX_SLOTS * 2)
    for o in objects:
        i = o["slot"]
        status[i] = o.get("coorduse", 0) & 0xff
        sh = (o["type"] & 0x3ff) | ((o.get("frame", 0) & 0x3f) << 10)
        shape[i * 2] = sh & 0xff; shape[i * 2 + 1] = (sh >> 8) & 0xff
        v = (o["x"] & 0x3ff) | ((o["y"] & 0x3ff) << 10) | ((o.get("z", 0) & 0xf) << 20)
        pos[i * 3] = v & 0xff; pos[i * 3 + 1] = (v >> 8) & 0xff; pos[i * 3 + 2] = (v >> 16) & 0xff
        amount[i * 2 + 1] = o.get("qual", 0) & 0xff
    return status, pos, shape, amount


def _ram_reader(regions, size=0x10000):
    """Model ONE flat contiguous RAM image (what real DOSBox memory is): write each
    (start, bytes) region into it in ascending order, then dm.read(handle, addr, n)
    slices [addr:addr+n]. This reproduces the engine layout faithfully -- the per-slot
    arrays sit close enough that a full U6_MAX_SLOTS read over-reads into the next array
    (harmless: no real object occupies those top slots), exactly as on live RAM. (base
    is passed as 0, so addr == offset.)"""
    ram = bytearray(size)
    for start, blob in sorted(regions):
        ram[start:start + len(blob)] = blob
    def reader(handle, addr, n):
        return bytes(ram[addr:addr + n])
    return reader


# --- _use_from (reachability-aware: floods from the avatar) ------------------------
def _run_use_from(cells, ax, ay, avatar_xy, obj_xy):
    """Drive g._use_from over a full 40x40 stub grid (real _closest_reachable uses the
    U6_AREA bounds, so the grid must be that size) + a stubbed avatar position. `cells`
    is the set of walkable (row,col), or "all". Restores both patched names."""
    from u6 import cartography as g, navigate
    walk = [[True] * U6_AREA_W for _ in range(U6_AREA_H)] if cells == "all" else \
           [[False] * U6_AREA_W for _ in range(U6_AREA_H)]
    if cells != "all":
        for (r, c) in cells:
            walk[r][c] = True
    sb, sc = navigate._build_grid, g._controlled_xyz
    navigate._build_grid = lambda base: (walk, None, ax, ay)
    g._controlled_xyz = lambda base: (avatar_xy[0], avatar_xy[1], 0)
    try:
        return g._use_from(0, obj_xy[0], obj_xy[1])
    finally:
        navigate._build_grid, g._controlled_xyz = sb, sc


def test_use_from_picks_reachable_cardinal_and_faces_object():
    # object world (5,5); avatar inside at (5,7); the SOUTH neighbour (5,6) is reachable.
    fxy, face = _run_use_from({(6, 5), (7, 5)}, 0, 0, (5, 7), (5, 5))
    assert fxy == (5, 6) and face == "n", (fxy, face)   # stand south of it, face north


def test_use_from_prefers_reachable_side_not_far_walkable():
    # the bug fix: object (5,5) has a walkable NORTH neighbour (5,4) isolated on the far
    # side of the wall, and a reachable SOUTH neighbour (5,6). Old code returned the north
    # (first walkable); reachability-aware must return the south the avatar can actually reach.
    # (5,5) blocked splits the north region (rows 3,4) from the avatar's south region.
    fxy, face = _run_use_from({(4, 5), (3, 5), (6, 5), (7, 5)}, 0, 0, (5, 7), (5, 5))
    assert fxy == (5, 6) and face == "n", (fxy, face)   # NOT the far-side north cell (5,4)


def test_use_from_object_on_walkable_cell_returns_adjacent():
    # regression (castle-escape lever bug): a lever sits on PASSABLE floor, so the object's
    # OWN cell (5,5) is walkable + reachable. _use_from must still return an ADJACENT cell,
    # not None -- the old code took the dist-0 own-cell and failed the `== 1` check.
    # walkable: object cell (5,5) + its south neighbour (5,6) + the avatar at (5,7).
    fxy, face = _run_use_from({(5, 5), (6, 5), (7, 5)}, 0, 0, (5, 7), (5, 5))
    assert fxy == (5, 6) and face == "n", (fxy, face)   # stand adjacent (5,6), face the lever


def test_use_from_none_when_object_off_window():
    fxy, face = _run_use_from("all", 100, 100, (100, 100), (5, 5))  # object far from window
    assert fxy is None and face is None


def test_use_from_none_when_boxed_in():
    fxy, face = _run_use_from({(4, 4)}, 0, 0, (4, 4), (2, 4))    # only own cell; can't reach sides
    assert fxy is None and face is None


# --- _top_object_slot -------------------------------------------------------------
def test_top_object_slot_in_window_uses_mapobjptr():
    from u6 import cartography as g
    ax, ay = 0, 0
    tx, ty = 5, 5
    cell = (ty - ay) * U6_AREA_W + (tx - ax)                       # row*W + col
    mop = bytearray(U6_AREA_W * U6_AREA_H * 2)
    mop[cell * 2] = 0x05; mop[cell * 2 + 1] = 0x03                 # -> slot 0x305
    status, pos, shape, amount = _build_arrays([])
    dm.read = _ram_reader([
        (U6_AreaX, bytes([ax & 0xff, ax >> 8])),
        (U6_AreaY, bytes([ay & 0xff, ay >> 8])),
        (U6_MapObjPtr, bytes(mop)),
        (U6_ObjStatus, status), (U6_ObjPos, pos),
        (U6_ObjShapeType, shape), (U6_Amount, amount),
    ])
    assert g._top_object_slot(0, tx, ty, 0) == 0x305


def test_top_object_slot_off_window_scans_tile():
    from u6 import cartography as g
    ax, ay = 100, 100                                             # window far from (5,5)
    status, pos, shape, amount = _build_arrays([
        {"slot": 0x310, "type": 0x129, "frame": 4, "x": 5, "y": 5},
    ])
    dm.read = _ram_reader([
        (U6_AreaX, bytes([ax & 0xff, ax >> 8])),
        (U6_AreaY, bytes([ay & 0xff, ay >> 8])),
        (U6_MapObjPtr, bytes(U6_AREA_W * U6_AREA_H * 2)),
        (U6_ObjStatus, status), (U6_ObjPos, pos),
        (U6_ObjShapeType, shape), (U6_Amount, amount),
    ])
    assert g._top_object_slot(0, 5, 5, 0) == 0x310                # fallback tile scan
    assert g._top_object_slot(0, 6, 5, 0) is None                 # nothing there


if __name__ == "__main__":
    import traceback
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for fn in fns:
        try:
            fn()
            print("PASS", fn.__name__)
            passed += 1
        except Exception:
            print("FAIL", fn.__name__)
            traceback.print_exc()
    print(f"\n{passed}/{len(fns)} passed")
