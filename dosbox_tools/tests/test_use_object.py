"""Offline tests for u6.act.u6_use_object (#2) -- the closed-loop "go to an object and
USE it" verb. The real input/RAM path is live-verified; here we prove the orchestration
with the sub-calls stubbed: the _adjacency_action decision (carried / other-level / on-tile
/ cardinally-adjacent / far) and that u6_use_object drives u6_goto_xy toward a use-from
cell then issues the cardinal u6_use -- and bails cleanly when an object has no walkable
cardinal neighbour.
"""
import sys, types, os

# Hermetic bootstrap (mirrors the other tests).
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


# --- _adjacency_action (pure decision) ----------------------------------------------
def _stub_positions(mp, avatar, obj, coorduse=0, oz=0, az=0):
    from u6 import act
    mp.setattr(act, "_controlled_xyz", lambda base: (avatar[0], avatar[1], az))
    mp.setattr(act, "_npc_xyz", lambda base, s: (obj[0], obj[1], oz, coorduse))


def test_adjacency_action_cardinal(monkeypatch):
    from u6 import act
    _stub_positions(monkeypatch, (10, 10), (11, 10))     # object one tile EAST
    assert act._adjacency_action(0, 0x100) == ("use", "e")


def test_adjacency_action_here(monkeypatch):
    from u6 import act
    _stub_positions(monkeypatch, (11, 10), (11, 10))     # standing on it
    assert act._adjacency_action(0, 0x100) == ("here", None)


def test_adjacency_action_far(monkeypatch):
    from u6 import act
    _stub_positions(monkeypatch, (5, 10), (11, 10))
    assert act._adjacency_action(0, 0x100) == ("far", (11, 10))


def test_adjacency_action_carried_and_other_level(monkeypatch):
    from u6 import act
    _stub_positions(monkeypatch, (10, 10), (11, 10), coorduse=0x10)   # INVEN
    kind, msg = act._adjacency_action(0, 0x305)
    assert kind == "err" and "inv:0x305" in msg, msg
    _stub_positions(monkeypatch, (10, 10), (11, 10), oz=1, az=0)      # other level
    kind, msg = act._adjacency_action(0, 0x100)
    assert kind == "err" and "z1" in msg and "z0" in msg, msg


# --- u6_use_object orchestration ----------------------------------------------------
def _wire(mp, avatar, obj, *, slot=0x100, name="lever", coorduse=0, oz=0,
          use_from=((10, 10), "e"), in_window=True):
    """Stub every sub-call; return (act, calls, state). u6_goto_xy 'arrives' by moving
    the avatar one tile WEST of the object (cardinally adjacent)."""
    from u6 import act, cartography, affordance
    state = {"avatar": list(avatar)}
    mp.setattr(act.S, "membase", 0x1000)
    mp.setattr(act, "_ds", lambda seg: (0x2f27, None))
    mp.setattr(act, "_controlled_xyz", lambda base: (state["avatar"][0], state["avatar"][1], 0))
    mp.setattr(act, "_npc_xyz", lambda base, s: (obj[0], obj[1], oz, coorduse))
    mp.setattr(act, "_obj_name", lambda base, s: name)
    mp.setattr(act, "_in_window", lambda base, x, y: in_window)
    mp.setattr(affordance, "_resolve_slot", lambda base, t, z, x, y: (slot, None))
    mp.setattr(cartography, "_use_from", lambda base, ox, oy: use_from)
    calls = {"use": [], "goto": []}
    def fake_use(d, on=""):
        calls["use"].append((d, on)); return "USE-RESULT"
    def fake_goto(x, y, ms):
        calls["goto"].append((x, y, ms))
        state["avatar"] = [obj[0] - 1, obj[1]]           # land one tile WEST -> adjacent
        return f"step 0: e -> ({x},{y})\nArrived at ({x},{y})."
    mp.setattr(act, "u6_use", fake_use)
    mp.setattr(act, "u6_goto_xy", fake_goto)
    return act, calls, state


def test_use_object_already_adjacent_uses_no_nav(monkeypatch):
    act, calls, _ = _wire(monkeypatch, (10, 10), (11, 10))       # object EAST, adjacent
    out = act.u6_use_object("lever")
    assert calls["goto"] == [], "should not navigate when already adjacent"
    assert calls["use"] == [("e", "")], calls["use"]
    assert "USE e" in out and "USE-RESULT" in out


def test_use_object_far_drives_then_uses(monkeypatch):
    act, calls, _ = _wire(monkeypatch, (5, 10), (11, 10), use_from=((10, 10), "e"))
    out = act.u6_use_object("0x100")
    assert calls["goto"] == [(10, 10, 40)], calls["goto"]        # routed to the use-from cell
    assert calls["use"] == [("e", "")], calls["use"]             # then cardinal USE east
    assert "approach lever via (10,10)" in out and "USE e" in out


def test_use_object_forwards_on(monkeypatch):
    act, calls, _ = _wire(monkeypatch, (10, 10), (11, 10))
    act.u6_use_object("lever", on="n")
    assert calls["use"] == [("e", "n")], calls["use"]            # `on` forwarded to u6_use


def test_use_object_carried_redirects(monkeypatch):
    act, calls, _ = _wire(monkeypatch, (10, 10), (11, 10), slot=0x305, coorduse=0x10)
    out = act.u6_use_object("0x305")
    assert calls["goto"] == [] and calls["use"] == []
    assert "inv:0x305" in out


def test_use_object_no_cardinal_neighbour(monkeypatch):
    # in view, far, but _use_from finds no walkable n/s/e/w cell -> bail, no drive
    act, calls, _ = _wire(monkeypatch, (5, 10), (11, 10), use_from=(None, None), in_window=True)
    out = act.u6_use_object("lever")
    assert calls["goto"] == [] and calls["use"] == []
    assert "no walkable cardinal" in out


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
