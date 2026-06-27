"""Offline tests for u6.affordance -- the USE-effect predictor (the A-mechanism set).

Proves the pure source-ported logic without a live DOSBox: the SearchArea/__SearchTypeAt
object scan, _use_target's qual / qual-tile resolution, and each A predictor
(crank->drawbridge, lever->portcullis, switch->force-field, bell, door/chest open-close,
key/lockpick unlock), plus predict_use's dispatch incl. the graceful B/C operate-note.

Object state is built as the four parallel arrays (status/pos/shape/amount) exactly as
the engine lays them out, so the decoders run on real-shaped bytes.
"""
import sys, types, os

# Hermetic bootstrap (mirrors test_cartography): stub win32/mcp so importing u6 needs no
# live deps and @mcp.tool() is identity. dm.read is replaced per-test where needed.
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

from u6.constants import U6_MAX_SLOTS, U6_ObjStatus, U6_ObjPos, U6_ObjShapeType, U6_Amount


# --- build the four parallel object arrays from a list of placed objects ------------
def build_objs(objects):
    """objects: list of dicts {slot,type,frame,qual,x,y,z, coorduse(optional 0=LOCXYZ)}.
    Returns (status, pos, shape, amount) bytes -- the tuple _load_objs would produce."""
    status = bytearray(U6_MAX_SLOTS)
    pos    = bytearray(U6_MAX_SLOTS * 3)
    shape  = bytearray(U6_MAX_SLOTS * 2)
    amount = bytearray(U6_MAX_SLOTS * 2)
    for o in objects:
        i = o["slot"]
        status[i] = o.get("coorduse", 0) & 0xff
        sh = (o["type"] & 0x3ff) | ((o.get("frame", 0) & 0x3f) << 10)
        shape[i * 2] = sh & 0xff
        shape[i * 2 + 1] = (sh >> 8) & 0xff
        v = (o["x"] & 0x3ff) | ((o["y"] & 0x3ff) << 10) | ((o.get("z", 0) & 0xf) << 20)
        pos[i * 3] = v & 0xff
        pos[i * 3 + 1] = (v >> 8) & 0xff
        pos[i * 3 + 2] = (v >> 16) & 0xff
        amount[i * 2] = o.get("quan", 1) & 0xff
        amount[i * 2 + 1] = o.get("qual", 0) & 0xff
    return bytes(status), bytes(pos), bytes(shape), bytes(amount)


def _stub_dm_read(objs):
    """Make dm.read serve the four arrays keyed by their offset (base passed as 0)."""
    status, pos, shape, amount = objs
    table = {U6_ObjStatus: status, U6_ObjPos: pos, U6_ObjShapeType: shape, U6_Amount: amount}
    def reader(handle, addr, n):
        if addr in table:
            return table[addr][:n]
        raise KeyError(f"unexpected read @ 0x{addr:x}")
    dm.read = reader


# --- scanner / target resolution ----------------------------------------------------
def test_search_area_type_and_qual_source_order():
    from u6 import affordance as A
    objs = build_objs([
        {"slot": 0x300, "type": A.OBJ_DRAWBRIDGE, "frame": 6, "qual": 5, "x": 10, "y": 20},
        {"slot": 0x305, "type": A.OBJ_DRAWBRIDGE, "frame": 3, "qual": 7, "x": 11, "y": 20},
        {"slot": 0x310, "type": A.OBJ_DRAWBRIDGE, "frame": 4, "qual": 5, "x": 12, "y": 20},
    ])
    got = list(A._search_area(objs, A.OBJ_DRAWBRIDGE, 0, qual=5))
    assert [g[0] for g in got] == [0x300, 0x310], got        # qual-5 only, low slot first
    assert list(A._search_area(objs, A.OBJ_DRAWBRIDGE, 0, qual=7))[0][0] == 0x305


def test_search_type_at_tile():
    from u6 import affordance as A
    objs = build_objs([{"slot": 0x320, "type": A.OBJ_PORTCULLIS, "frame": 1, "x": 50, "y": 60}])
    assert A._search_type_at(objs, A.OBJ_PORTCULLIS, 50, 60, 0) == (0x320, 1)
    assert A._search_type_at(objs, A.OBJ_PORTCULLIS, 51, 60, 0) is None


def test_use_target_qual_tile_present_and_clear():
    from u6 import affordance as A
    # doorway qual 9 at (40,40); a portcullis sits on it -> present
    objs = build_objs([
        {"slot": 0x330, "type": A.OBJ_DOORWAY, "qual": 9, "x": 40, "y": 40},
        {"slot": 0x331, "type": A.OBJ_PORTCULLIS, "frame": 1, "x": 40, "y": 40},
    ])
    res = A._use_target(objs, A.TGT_QUAL_TILE, 9, 0, A.OBJ_DOORWAY, at_tile_type=A.OBJ_PORTCULLIS)
    assert res == (40, 40, 0x331, 1), res
    # remove the portcullis -> clear
    objs2 = build_objs([{"slot": 0x330, "type": A.OBJ_DOORWAY, "qual": 9, "x": 40, "y": 40}])
    assert A._use_target(objs2, A.TGT_QUAL_TILE, 9, 0, A.OBJ_DOORWAY,
                         at_tile_type=A.OBJ_PORTCULLIS) == (40, 40, -1, None)
    # qual 0 has no link
    assert A._use_target(objs2, A.TGT_QUAL_TILE, 0, 0, A.OBJ_DOORWAY,
                         at_tile_type=A.OBJ_PORTCULLIS) is None


# --- A predictors -------------------------------------------------------------------
def test_predict_crank_open_vs_closed():
    from u6 import affordance as A
    open_bridge = build_objs([{"slot": 0x340, "type": A.OBJ_DRAWBRIDGE, "frame": 3, "qual": 2, "x": 7, "y": 8}])
    p = A._predict_qual_toggle(open_bridge, (A.OBJ_CRANK, 0, 2, 5, 5), 0)
    assert p["target_xy"] == (7, 8) and "closes the drawbridge" in p["effect"], p
    closed_bridge = build_objs([{"slot": 0x340, "type": A.OBJ_DRAWBRIDGE, "frame": 6, "qual": 2, "x": 7, "y": 8}])
    p = A._predict_qual_toggle(closed_bridge, (A.OBJ_CRANK, 0, 2, 5, 5), 0)
    assert "opens the drawbridge" in p["effect"], p
    # no matching drawbridge
    p = A._predict_qual_toggle(closed_bridge, (A.OBJ_CRANK, 0, 99, 5, 5), 0)
    assert "no correspondent drawbridge" in p["effect"], p


def test_predict_lever_toggles_portcullis():
    from u6 import affordance as A
    present = build_objs([
        {"slot": 0x350, "type": A.OBJ_DOORWAY, "qual": 4, "x": 30, "y": 31},
        {"slot": 0x351, "type": A.OBJ_PORTCULLIS, "frame": 1, "x": 30, "y": 31},
    ])
    p = A._predict_qual_toggle(present, (A.OBJ_LEVER, 0, 4, 20, 20), 0)
    assert "opens the portcullis at (30,31)" in p["effect"], p     # present -> USE removes -> opens
    clear = build_objs([{"slot": 0x350, "type": A.OBJ_DOORWAY, "qual": 4, "x": 30, "y": 31}])
    p = A._predict_qual_toggle(clear, (A.OBJ_LEVER, 0, 4, 20, 20), 0)
    assert "closes the portcullis at (30,31)" in p["effect"], p


def test_predict_switch_toggles_forcefield():
    from u6 import affordance as A
    clear = build_objs([{"slot": 0x360, "type": A.OBJ_DOORWAY, "qual": 1, "x": 5, "y": 6}])
    p = A._predict_qual_toggle(clear, (A.OBJ_SWITCH, 0, 1, 1, 1), 0)
    assert "force field" in p["effect"] and "closes" in p["effect"], p


def test_predict_bell_no_target():
    from u6 import affordance as A
    p = A._predict_qual_toggle(build_objs([]), (0x0EC, 0, 0, 1, 1), 0)
    assert p["target_slot"] == -1 and "no world state change" in p["effect"], p


def test_predict_open_close_door_states():
    from u6 import affordance as A
    no = build_objs([])
    assert "opens the door" in A._predict_open_close(no, (0x129, 4, 0, 0, 0), 0)["effect"]   # closed
    assert "closes the door" in A._predict_open_close(no, (0x129, 0, 0, 0, 0), 0)["effect"]   # open
    locked = A._predict_open_close(no, (0x129, 8, 3, 0, 0), 0)                                # locked, qual 3
    assert "locked" in locked["effect"] and "qual-3 key" in locked["effect"], locked
    assert "magically locked" in A._predict_open_close(no, (0x129, 0xC, 0, 0, 0), 0)["effect"]
    assert "opens the chest" in A._predict_open_close(no, (0x062, 1, 0, 0, 0), 0)["effect"]   # chest closed


def test_predict_unlock_key_vs_lockpick():
    from u6 import affordance as A
    no = build_objs([])
    k = A._predict_unlock(no, (A.OBJ_KEY, 0, 5, 0, 0), 0)
    assert "matching qual 5" in k["effect"], k
    lp = A._predict_unlock(no, (A.OBJ_LOCKPICK, 0, 0, 0, 0), 0)
    assert "qual-0" in lp["effect"] and "break" in lp["effect"], lp


# --- predict_use dispatch (end to end through a stubbed dm.read) ---------------------
def test_predict_use_lever_end_to_end():
    from u6 import affordance as A
    objs = build_objs([
        {"slot": 0x100, "type": A.OBJ_LEVER, "frame": 0, "qual": 4, "x": 20, "y": 20},
        {"slot": 0x350, "type": A.OBJ_DOORWAY, "qual": 4, "x": 30, "y": 31},
        {"slot": 0x351, "type": A.OBJ_PORTCULLIS, "frame": 1, "x": 30, "y": 31},
    ])
    _stub_dm_read(objs)
    p = A.predict_use(0, 0x100, 0)
    assert p["decoded"] and p["category"] == A.AFF_MECHANISM
    assert "opens the portcullis at (30,31)" in p["effect"], p
    assert p["handler"] == "C_27A1_4479"


def test_predict_use_b_row_graceful_note():
    from u6 import affordance as A
    objs = build_objs([{"slot": 0x100, "type": 0x05A, "frame": 0, "x": 1, "y": 1}])  # torch (B)
    _stub_dm_read(objs)
    p = A.predict_use(0, 0x100, 0)
    assert p["decoded"] is False and p["category"] == A.AFF_UTILITY, p
    assert "not decoded this slice" in p["effect"]


def test_predict_use_absent_type():
    from u6 import affordance as A
    objs = build_objs([{"slot": 0x100, "type": 0x001, "frame": 0, "x": 1, "y": 1}])
    _stub_dm_read(objs)
    p = A.predict_use(0, 0x100, 0)
    assert p["category"] is None and "not in the USE dispatch" in p["effect"], p


def test_format_affordance_lines():
    from u6 import affordance as A
    p = {"type": 0x10C, "category": "A", "verb": "pull", "decoded": True,
         "effect": "opens the portcullis at (30,31)", "target_slot": 0x351,
         "target_xy": (30, 31), "current_state": "present (closed)",
         "predicted_state": "removed (open)"}
    out = A._format_affordance("lever", 0x100, p)
    assert "USE lever (slot 0x100, type 0x10c)  [A mechanism]" in out
    assert "state: present (closed) -> removed (open)" in out
    assert "target: slot 0x351 at (30, 31)" in out


def test_use_dispatch_manifest_complete():
    from u6 import affordance as A
    # 85 case-types across 48 rows; every A row has a predictor (no pat:None left).
    total = sum(len(r["t"]) for r in A.USE_DISPATCH)
    assert total == 85, total
    a_rows_without_pat = [r["h"] for r in A.USE_DISPATCH if r["cat"] == A.AFF_MECHANISM and r["pat"] is None]
    assert a_rows_without_pat == [], a_rows_without_pat


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
