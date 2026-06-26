"""Stub-driven unit test for u6_area_map_data -- the per-cell MapObjPtr decode that
makes closed doors visible (they read as '#' on u6_walkable, indistinguishable from
walls). Verifies: a door slot in MapObjPtr[r][c] is resolved to its type/frame ->
state glyph (+ closed, = locked, ' open), placed at the right cell, listed with the
right world (x,y)/qual; non-door objects and actor slots (<0x100) are ignored; -1
(0xffff) cells are empty. Heavy deps (_build_grid/_actor_map/_obj_name/controlled)
are stubbed so the test isolates the new decode."""
import sys, types, os

MEM = bytearray(0x10000)

dm = types.ModuleType("dosbox_mem")
class _Sess:
    def __init__(self): self.handle = None; self.membase = None
    def reset(self): pass
dm.Session = _Sess
dm.register_base_tools = lambda mcp, S: types.SimpleNamespace()
dm.register_input_tools = lambda mcp, S: types.SimpleNamespace()
dm.read = lambda handle, addr, n: bytes(MEM[addr:addr + n])
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

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import dosbox_u6_server as u6

u6.S.handle = 1
u6.S.membase = 0

# ---- stub the heavy deps so we isolate the MapObjPtr decode ----
AX, AY, X0, Y0 = 0, 0, 0, 0
u6._build_grid       = lambda base: ([[True] * u6.U6_AREA_W for _ in range(u6.U6_AREA_H)], None, AX, AY)
u6._actor_map        = lambda *a, **k: {}
u6._controlled_slot  = lambda base: (1, 0, 0)
u6._controlled_xyz   = lambda base: (X0, Y0, 0)
u6._obj_name         = lambda base, slot: f"door{slot:03x}"

def w16(a, v): MEM[a] = v & 0xff; MEM[a + 1] = (v >> 8) & 0xff

# MapObjPtr defaults to -1 (0xffff = no object) everywhere
for i in range(u6.U6_AREA_H * u6.U6_AREA_W):
    w16(u6.U6_MapObjPtr + i * 2, 0xffff)

def set_cell(r, c, slot): w16(u6.U6_MapObjPtr + (r * u6.U6_AREA_W + c) * 2, slot)
def set_obj(slot, typ, frame, qual=0):
    w16(u6.U6_ObjShapeType + slot * 2, (typ & 0x3ff) | (frame << 10))
    w16(u6.U6_Amount + slot * 2, qual << 8)

# closed door (frame 5) at cell (10,5); locked (frame 9, qual7) at (12,8);
# open (frame 1) at (3,3); a non-door object at (4,4); an actor slot at (6,6).
set_cell(10, 5, 0x300); set_obj(0x300, 0x129, 5)
set_cell(12, 8, 0x301); set_obj(0x301, 0x12c, 9, qual=7)
set_cell(3, 3, 0x302);  set_obj(0x302, 0x12a, 1)
set_cell(4, 4, 0x303);  set_obj(0x303, 0x050, 0)      # not a door type -> ignored
set_cell(6, 6, 0x002)                                 # actor slot (<0x100) -> ignored

x0, y0, z0, av, ax, ay, walk, amap, doorcells, doors = u6.u6_area_map_data(0, 0)

ok = True
def chk(label, cond):
    global ok
    ok &= bool(cond)
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")

print("MapObjPtr door decode (cell glyphs):")
chk("closed door (10,5) -> '+'",  doorcells.get((10, 5)) == "+")
chk("locked door (12,8) -> '='",  doorcells.get((12, 8)) == "=")
chk("open door (3,3) -> \"'\"",    doorcells.get((3, 3)) == "'")
chk("non-door object ignored",    (4, 4) not in doorcells)
chk("actor slot ignored",         (6, 6) not in doorcells)
chk("exactly 3 door cells",       len(doorcells) == 3)

print("door list (world coords, state, qual):")
dmap = {(wx, wy): (state, qual, name) for _d, wx, wy, state, qual, name, _b in doors}
chk("closed at world (5,10)",     dmap.get((5, 10)) == ("closed", 0, "door300"))
chk("locked at world (8,12) q7",  dmap.get((8, 12)) == ("locked", 7, "door301"))
chk("open at world (3,3)",        dmap.get((3, 3)) == ("open", 0, "door302"))
chk("exactly 3 doors listed",     len(doors) == 3)

print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
