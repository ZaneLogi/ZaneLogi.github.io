"""Offline tests for u6.act.u6_travel (#3.5) -- the route-follower that auto-opens doors.
The real RAM/input path is live-verified (and the manual version drove the castle escape);
here we prove the orchestration with the sub-calls stubbed: _first_closed_door_on_path's
shut-door detection, and that u6_travel drives to each door's approach, opens it (u6_use),
skips it once open, and finishes with a straight drive to the goal.
"""
import sys, types, os

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


def _door_at(open_flag):
    """A fake _door_at_tile: the door at (10,12) is open/closed per `open_flag()`."""
    def f(base, tx, ty, tz):
        if (tx, ty) == (10, 12):
            return (0x300, 0x129, 1 if open_flag() else 4, 0)   # frame 1=open, 4=closed
        return None
    return f


# --- _first_closed_door_on_path -----------------------------------------------------
def test_first_closed_door_on_path(monkeypatch):
    from u6 import act
    monkeypatch.setattr(act, "_door_at_tile", _door_at(lambda: False))   # door shut
    steps = [(1, 0)] * 5                                                  # s x5 from (10,10)
    approach, door = act._first_closed_door_on_path(0, steps, 10, 10, 0, 0, 0, {(12, 10)})
    assert approach == (10, 11) and door == (10, 12), (approach, door)
    # no door cells on the path -> nothing
    a2, d2 = act._first_closed_door_on_path(0, steps, 10, 10, 0, 0, 0, set())
    assert a2 is None and d2 is None
    # an OPEN door on the path is skipped (you just walk through it)
    monkeypatch.setattr(act, "_door_at_tile", _door_at(lambda: True))    # door open
    a3, d3 = act._first_closed_door_on_path(0, steps, 10, 10, 0, 0, 0, {(12, 10)})
    assert a3 is None and d3 is None


# --- u6_travel orchestration --------------------------------------------------------
def _wire(mp, door_cells):
    """Stub planning + driving + door RAM. Returns (act, calls, state)."""
    from u6 import act, cartography
    state = {"pos": (10, 10), "door_open": False}
    calls = {"goto": [], "use": []}
    mp.setattr(act.S, "membase", 0x1000)
    mp.setattr(act, "_ds", lambda seg: (0x2f27, None))
    mp.setattr(act, "_controlled_xyz", lambda base: (state["pos"][0], state["pos"][1], 0))
    mp.setattr(cartography, "_baked_region_grid",
               lambda base, x0, y0, tx, ty, z: ([[True] * 40 for _ in range(40)],
                                                [[1] * 40 for _ in range(40)], 0, 0, 40, 40, door_cells))
    mp.setattr(cartography, "_region_dijkstra",
               lambda walk, cost, R, C, start, goals: [(1, 0)] * (min(goals)[0] - start[0]))
    mp.setattr(act, "_door_at_tile", _door_at(lambda: state["door_open"]))
    def fake_goto(x, y, ms):
        calls["goto"].append((x, y)); state["pos"] = (x, y)
        return f"step\nArrived at ({x},{y})."
    def fake_use(d, on=""):
        calls["use"].append((d, on)); state["door_open"] = True
        return "use s: committed; now COMMAND_READY."
    mp.setattr(act, "u6_goto_xy", fake_goto)
    mp.setattr(act, "u6_use", fake_use)
    return act, calls, state


def test_travel_no_door_straight_drive(monkeypatch):
    act, calls, _ = _wire(monkeypatch, door_cells=[])         # no doors
    out = act.u6_travel(10, 15)
    assert calls["goto"] == [(10, 15)] and calls["use"] == []  # one straight drive, no USE
    assert "final leg -> (10,15)" in out


def test_travel_opens_door_then_arrives(monkeypatch):
    act, calls, _ = _wire(monkeypatch, door_cells=[(12, 10)])  # one closed door at (10,12)
    out = act.u6_travel(10, 15)
    # leg 0: drive to the approach (10,11) + USE 's' to open; leg 1: door now open -> straight drive
    assert calls["goto"] == [(10, 11), (10, 15)], calls["goto"]
    assert calls["use"] == [("s", "")], calls["use"]
    assert "USE 's' on door (10,12)" in out and "final leg -> (10,15)" in out


def test_travel_locked_door_two_step(monkeypatch):
    from u6 import act, cartography
    state = {"pos": (10, 10), "uses": 0}
    calls = {"goto": [], "use": []}
    monkeypatch.setattr(act.S, "membase", 0x1000)
    monkeypatch.setattr(act, "_ds", lambda seg: (0x2f27, None))
    monkeypatch.setattr(act, "_controlled_xyz", lambda base: (state["pos"][0], state["pos"][1], 0))
    monkeypatch.setattr(cartography, "_baked_region_grid",
                        lambda base, x0, y0, tx, ty, z: ([[True] * 40 for _ in range(40)],
                                                         [[1] * 40 for _ in range(40)], 0, 0, 40, 40, [(12, 10)]))
    monkeypatch.setattr(cartography, "_region_dijkstra",
                        lambda walk, cost, R, C, start, goals: [(1, 0)] * (min(goals)[0] - start[0]))
    def door_at(base, tx, ty, tz):
        if (tx, ty) == (10, 12):
            frame = (8, 4, 1)[min(state["uses"], 2)]    # locked(8) -> closed(4) -> open(1)
            return (0x300, 0x129, frame, 0)
        return None
    monkeypatch.setattr(act, "_door_at_tile", door_at)
    def fake_goto(x, y, ms):
        calls["goto"].append((x, y)); state["pos"] = (x, y); return f"step\nArrived at ({x},{y})."
    def fake_use(d, on=""):
        calls["use"].append((d, on)); state["uses"] += 1; return "use s: committed"
    monkeypatch.setattr(act, "u6_goto_xy", fake_goto)
    monkeypatch.setattr(act, "u6_use", fake_use)
    out = act.u6_travel(10, 15)
    assert calls["use"] == [("s", ""), ("s", "")], calls["use"]   # USE twice: unlock then open
    assert calls["goto"] == [(10, 11), (10, 15)], calls["goto"]
    assert "final leg -> (10,15)" in out


def test_travel_already_there(monkeypatch):
    act, calls, _ = _wire(monkeypatch, door_cells=[])
    out = act.u6_travel(10, 10)                                # already at the goal
    assert calls["goto"] == [] and calls["use"] == []
    assert "Arrived at (10,10)" in out


if __name__ == "__main__":
    import traceback
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for fn in fns:
        try:
            if "monkeypatch" in fn.__code__.co_varnames[:fn.__code__.co_argcount]:
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
