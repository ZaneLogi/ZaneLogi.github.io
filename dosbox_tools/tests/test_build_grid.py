"""Stub-driven unit test for dosbox_u6_server._build_grid (the C_1E0F_000F port).

Stubs out mcp / dosbox_mem / dosbox_input so we can import the REAL server module
and exercise _build_grid against a synthetic flat memory image. Validates the new,
error-prone logic: multi-tile object spread (DoubleH/DoubleV/2x2 -> W/N/NW with
tile-1/-2/-3 quadrants) and breakthrough/ignore (Br/Ig) overrides.
"""
import sys, types, os

# ---- stub external/local deps BEFORE importing the server ----
MEM = bytearray(0x50000)

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

# fake mcp.server.fastmcp.FastMCP
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
u6.S.u6_ds = 0          # base_addr = 0 -> DS offsets index MEM directly

def w16(addr, v): MEM[addr] = v & 0xff; MEM[addr + 1] = (v >> 8) & 0xff
def w24(addr, v):
    MEM[addr] = v & 0xff; MEM[addr + 1] = (v >> 8) & 0xff; MEM[addr + 2] = (v >> 16) & 0xff

# ---- table placement (linear; far ptr = seg<<4|off) ----
TERR, TF1, TF2, BASE = 0x40000, 0x41000, 0x42000, 0x43000
def far(addr): w16(0, 0)  # placeholder
def set_far(ds_off, addr): w16(ds_off, addr & 0xf); w16(ds_off + 2, addr >> 4)
set_far(u6.U6_TerrainType_ptr, TERR)
set_far(u6.U6_TileFlag_ptr, TF1)
set_far(u6.U6_TileFlag2_ptr, TF2)
set_far(u6.U6_BaseTile_ptr, BASE)

def set_terr(tile, fl): MEM[TERR + tile] = fl
def set_tf1(tile, fl):  MEM[TF1 + tile] = fl
def set_tf2(tile, fl):  MEM[TF2 + tile] = fl
def set_base(typ, tile): w16(BASE + typ * 2, tile)

# area origin 0,0
w16(u6.U6_AreaX, 0); w16(u6.U6_AreaY, 0)
# avatar slot 1 at world (5,5,0)
def pack(x, y, z): return x | (y << 10) | (z << 20)
w24(u6.U6_ObjPos + 1 * 3, pack(5, 5, 0))
MEM[u6.U6_ObjStatus + 1] = 0

IMP = u6.TERRAIN_IMPASS
nslot = [0x100]
def put_obj(x, y, typ, tile, frame=0):
    """place a world object at (x,y,0): basetile[typ]=tile, shape=typ|frame<<10."""
    s = nslot[0]; nslot[0] += 1
    set_base(typ, tile)
    w16(u6.U6_ObjShapeType + s * 2, (typ & 0x3ff) | (frame << 10))
    w24(u6.U6_ObjPos + s * 3, pack(x, y, 0))
    MEM[u6.U6_ObjStatus + s] = 0
    return s

# Scenario A: 1x1 impassable @ (10,10)
put_obj(10, 10, 0x200, 100); set_terr(100, IMP)
# Scenario B: DoubleH impassable @ (15,15) -> own + WEST(14,15) tile-1
put_obj(15, 15, 0x201, 200); set_tf1(200, u6.TILE_DOUBLE_H); set_terr(200, IMP); set_terr(199, IMP)
# Scenario C: DoubleV impassable @ (20,20) -> own + NORTH(20,19) tile-1
put_obj(20, 20, 0x202, 300); set_tf1(300, u6.TILE_DOUBLE_V); set_terr(300, IMP); set_terr(299, IMP)
# Scenario D: 2x2 impassable @ (25,25) -> own + W + N + NW, tiles 400/399/398/397
put_obj(25, 25, 0x203, 400); set_tf1(400, u6.TILE_DOUBLE_H | u6.TILE_DOUBLE_V)
for t in (400, 399, 398, 397): set_terr(t, IMP)
# Scenario E: Br over impassable GROUND @ (30,30) -> open + locked
MEM[u6.U6_AreaTiles + 30 * 40 + 30] = 5; set_terr(5, IMP)
put_obj(30, 30, 0x204, 500); set_tf2(500, u6.TILE2_BREAKTHROUGH)
# Scenario F: Ig+Br (slot N) then impassable (slot N+1) same cell (32,32) -> blocked
put_obj(32, 32, 0x205, 600); set_tf2(600, u6.TILE2_BREAKTHROUGH | u6.TILE2_IGNORE)
put_obj(32, 32, 0x206, 700); set_terr(700, IMP)
# Scenario G: non-Ig Br (locks) then impassable same cell (34,34) -> stays open
put_obj(34, 34, 0x207, 800); set_tf2(800, u6.TILE2_BREAKTHROUGH)
put_obj(34, 34, 0x208, 900); set_terr(900, IMP)
# Scenario H: passable object @ (12,12) -> open
put_obj(12, 12, 0x209, 1000)  # terr[1000]=0

walk, cost, ax, ay = u6._build_grid(0)

def chk(name, r, c, expect):
    got = walk[r][c]
    ok = (got == expect)
    print(f"  [{'OK' if ok else 'FAIL'}] {name}: walk[{r}][{c}]={got} expect={expect}")
    return ok

ok = True
print("multi-tile + Br/Ig grid checks:")
ok &= chk("A own blocked",        10, 10, False)
ok &= chk("A east open",          10, 11, True)
ok &= chk("A west open",          10,  9, True)
ok &= chk("B DoubleH own",        15, 15, False)
ok &= chk("B DoubleH west",       15, 14, False)
ok &= chk("B DoubleH (not east)", 15, 16, True)
ok &= chk("C DoubleV own",        20, 20, False)
ok &= chk("C DoubleV north",      19, 20, False)
ok &= chk("C DoubleV (not south)",21, 20, True)
ok &= chk("D 2x2 own",            25, 25, False)
ok &= chk("D 2x2 west",           25, 24, False)
ok &= chk("D 2x2 north",          24, 25, False)
ok &= chk("D 2x2 NW",             24, 24, False)
ok &= chk("D 2x2 (not SE)",       26, 26, True)
ok &= chk("E Br over impass grnd",30, 30, True)
ok &= chk("F Ig-Br + impass",     32, 32, False)
ok &= chk("G locked Br + impass", 34, 34, True)
ok &= chk("H passable obj",       12, 12, True)

print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
