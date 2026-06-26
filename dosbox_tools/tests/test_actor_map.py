"""Stub-driven unit test for the party-aware actor layer: _actor_map (allegiance
classification + per-cell block flag) and _actor_cells (the blocking set the
planner/legality probe consume). Faithful to C_1E0F_000F's IsPlrControl skip
(seg_1E0F.c:191) -- a party member the avatar swaps with (C_1E0F_1B0E) must NOT
block; an enemy/ally/neutral does; a DOWN party member (dead/asleep/dragged)
blocks again. Drives the REAL functions over a synthetic flat memory image.
"""
import sys, types, os

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
u6.S.u6_ds = 0

def w16(a, v): MEM[a] = v & 0xff; MEM[a + 1] = (v >> 8) & 0xff
def w24(a, v):
    MEM[a] = v & 0xff; MEM[a + 1] = (v >> 8) & 0xff; MEM[a + 2] = (v >> 16) & 0xff
def pack(x, y, z): return x | (y << 10) | (z << 20)

# NPCFlag[] is a far pointer at U6_NPCFlag_ptr -> point it at a scratch region.
NPCFLAG = 0xB000
w16(u6.U6_NPCFlag_ptr, NPCFLAG & 0xf); w16(u6.U6_NPCFlag_ptr + 2, NPCFLAG >> 4)

MON = 0x180        # an ordinary blocking creature shape (not a walk-through field)
def put_actor(slot, x, y, npcstatus, shape=MON, npcflag=0, z=0):
    w24(u6.U6_ObjPos + slot * 3, pack(x, y, z))
    MEM[u6.U6_ObjStatus + slot] = 0                     # CoordUse LOCXYZ (in world)
    w16(u6.U6_ObjShapeType + slot * 2, shape & 0x3ff)
    MEM[u6.U6_NPCStatus + slot] = npcstatus
    MEM[NPCFLAG + slot] = npcflag

PLR, ATKPLR, ATKMON, DEAD = 0x80, 0x20, 0x40, 0x10

# _world_to_cell maps world (x,y) -> grid cell (row,col) = (y-ay, x-ax). With
# ax=ay=0 a fixed x=1 and a distinct y per actor gives cell (y, 1).
# slot 1 = the controlled avatar (self_slot) at (5,5) -- excluded from the map.
put_actor(1, 5, 5, PLR)
put_actor(2, 1, 10, PLR)                   # party member        -> party, passable
put_actor(3, 1, 11, ATKPLR)                # hostile to player   -> enemy, blocks
put_actor(4, 1, 12, ATKMON)                # fights monsters     -> ally,  blocks
put_actor(5, 1, 13, 0)                      # neutral townsfolk   -> npc,   blocks
put_actor(6, 1, 14, PLR | DEAD)            # DEAD party member   -> party, blocks
put_actor(7, 1, 15, PLR, npcflag=0x10)     # dragged-under party -> party, blocks
put_actor(8, 1, 16, 0, shape=0x157)        # walk-through field  -> skipped entirely

amap = u6._actor_map(0, 0, 0, 0, self_slot=1)
cells = u6._actor_cells(0, 0, 0, 0, self_slot=1)

ok = True
def chk(label, cond):
    global ok
    ok &= bool(cond)
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")

print("actor classification (cat, blocks)  [cell = (y, x)]:")
chk("avatar (self) excluded",         (5, 5) not in amap)
chk("party member -> party,passable",  amap.get((10, 1)) == ("party", False))
chk("enemy -> enemy,blocks",           amap.get((11, 1)) == ("enemy", True))
chk("ally -> ally,blocks",             amap.get((12, 1)) == ("ally", True))
chk("neutral -> npc,blocks",           amap.get((13, 1)) == ("npc", True))
chk("dead party -> party,blocks",      amap.get((14, 1)) == ("party", True))
chk("dragged party -> party,blocks",   amap.get((15, 1)) == ("party", True))
chk("walk-through field excluded",     (16, 1) not in amap)

print("blocking set (_actor_cells):")
chk("live party member NOT blocking",  (10, 1) not in cells)
chk("enemy blocks",                    (11, 1) in cells)
chk("ally blocks",                     (12, 1) in cells)
chk("neutral blocks",                  (13, 1) in cells)
chk("dead party blocks",               (14, 1) in cells)
chk("dragged party blocks",            (15, 1) in cells)

# two actors on one cell: enemy + party -> show the enemy, cell blocks
put_actor(9, 2, 20, ATKPLR)
put_actor(10, 2, 20, PLR)
amap2 = u6._actor_map(0, 0, 0, 0, self_slot=1)
print("shared-cell precedence:")
chk("enemy outranks party on a shared cell", amap2.get((20, 2)) == ("enemy", True))

print("_npc_class:")
chk("party",  u6._npc_class(PLR) == "party")
chk("enemy",  u6._npc_class(ATKPLR) == "enemy")
chk("ally",   u6._npc_class(ATKMON) == "ally")
chk("npc",    u6._npc_class(0) == "npc")
chk("party beats alignment bits", u6._npc_class(PLR | ATKMON) == "party")

print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
