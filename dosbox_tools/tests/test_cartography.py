"""Offline tests for u6.cartography -- the region-Dijkstra + grid logic that powers
u6_route. The live RAM-dependent path (_baked_region_grid reads TerrainType + the
avatar pos) is covered by the live u6_route run; here we prove the pure algorithm:
weighted shortest path, wall detours, goal-set arrival, unreachable, and the
baked-grid builder over REAL mapdata terrain with a stubbed passability table.
"""
import sys, types, os

# Hermetic bootstrap (mirrors the other tests): stub the win32/mcp libs so importing
# the u6 package needs no live deps and @mcp.tool() is identity.
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


def _grid(rows):
    """ASCII rows ('.'=open '#'=wall) -> (walk[R][C], cost all-1, R, C)."""
    R, C = len(rows), len(rows[0])
    walk = [[ch == "." for ch in row] for row in rows]
    cost = [[1] * C for _ in range(R)]
    return walk, cost, R, C


def test_region_dijkstra_straight():
    from u6 import cartography as g
    walk, cost, R, C = _grid(["....."])
    steps = g._region_dijkstra(walk, cost, R, C, (0, 0), {(0, 4)})
    assert steps == [(0, 1)] * 4, steps          # four east steps


def test_region_dijkstra_wall_detour():
    from u6 import cartography as g
    # a vertical wall with a gap at the bottom forces a detour down-around-up
    walk, cost, R, C = _grid([
        "..#..",
        "..#..",
        ".....",
    ])
    steps = g._region_dijkstra(walk, cost, R, C, (0, 0), {(0, 4)})
    assert steps is not None
    # must reach the goal and never step onto a wall
    r, c = 0, 0
    for dr, dc in steps:
        r, c = r + dr, c + dc
        assert walk[r][c], (r, c)
    assert (r, c) == (0, 4)
    assert len(steps) == 8                        # 2 down + 2 east + ... shortest around the gap


def test_region_dijkstra_goalset_and_already_there():
    from u6 import cartography as g
    walk, cost, R, C = _grid(["..."])
    assert g._region_dijkstra(walk, cost, R, C, (0, 1), {(0, 1)}) == []      # already at a goal
    # multi-goal: arrives at whichever is cheapest
    steps = g._region_dijkstra(walk, cost, R, C, (0, 0), {(0, 2), (0, 1)})
    assert steps == [(0, 1)]                       # the nearer goal


def test_region_dijkstra_unreachable():
    from u6 import cartography as g
    walk, cost, R, C = _grid([
        "..#..",
        "..#..",
        "..#..",
    ])
    assert g._region_dijkstra(walk, cost, R, C, (0, 0), {(0, 4)}) is None


def test_region_dijkstra_weighted_prefers_low_cost():
    from u6 import cartography as g
    # two routes to (0,2): straight east (cost 1+9) vs down-east-east-up (cost 1+1+1+1)
    walk = [[True, True, True], [True, True, True]]
    cost = [[1, 9, 1], [1, 1, 1]]
    steps = g._region_dijkstra(walk, cost, 2, 3, (0, 0), {(0, 2)})
    # cheapest avoids the cost-9 cell (0,1): go down, east, east, up
    assert steps == [(1, 0), (0, 1), (0, 1), (-1, 0)], steps


def test_runlength():
    from u6 import cartography as g
    assert g._runlength(["e", "e", "e", "n", "w", "w"]) == "e×3 n w×2"
    assert g._runlength(["n"]) == "n"
    assert g._runlength([]) == ""


def test_baked_region_grid_over_real_terrain(monkeypatch):
    """Build a region grid over REAL baked mapdata with a stub TerrainType table:
    mark exactly tile-id 1 (grass) impassable, everything else open, and confirm the
    grid flags the right cells -- proves the mapdata->grid wiring + indexing."""
    from u6 import cartography as g
    fake_terr = bytearray(0x800)
    fake_terr[1] = 0x02                              # tile 1 -> IMPASS bit
    monkeypatch.setattr(g, "_static_table", lambda *a, **k: fake_terr)
    # surface region around (300,350); base unused (terr is stubbed)
    walk, cost, ox, oy, R, C = g._baked_region_grid(0, 300, 350, 305, 352, 0)
    tiles = g._level_tiles(0)[0]
    W = g.mapdata.SURFACE_W
    # every cell's walk flag must equal "underlying baked tile != 1"
    bad = 0
    for r in range(R):
        for c in range(C):
            tile = tiles[(oy + r) * W + ox + c]
            if walk[r][c] != (tile != 1):
                bad += 1
    assert bad == 0, bad
    assert R > 0 and C > 0


if __name__ == "__main__":
    import traceback
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for fn in fns:
        try:
            if "monkeypatch" in fn.__code__.co_varnames[:fn.__code__.co_argcount]:
                # tiny monkeypatch shim for standalone running (no pytest)
                class _MP:
                    def __init__(self): self._undo = []
                    def setattr(self, obj, name, val):
                        self._undo.append((obj, name, getattr(obj, name)))
                        setattr(obj, name, val)
                    def undo(self):
                        for o, n, v in reversed(self._undo): setattr(o, n, v)
                mp = _MP()
                try:
                    fn(mp)
                finally:
                    mp.undo()
            else:
                fn()
            print("PASS", fn.__name__)
            passed += 1
        except Exception:
            print("FAIL", fn.__name__)
            traceback.print_exc()
    print(f"\n{passed}/{len(fns)} passed")
