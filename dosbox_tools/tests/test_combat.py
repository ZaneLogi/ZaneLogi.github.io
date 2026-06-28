"""Stub-driven test for dosbox_u6_server combat-safety verbs: u6_pacify (spawn-pool
0xE0-0xFF -> NEUTRAL within radius) and u6_heal_party (living -> MaxHP, clear
poison/asleep/paralyzed; dead skipped). Mocks dosbox_mem with an in-memory bytearray
that supports read AND write, so the byte writes are asserted by reading MEM back."""
import sys, types, os
MEM = bytearray(0x50000)
dm = types.ModuleType("dosbox_mem")
class _S:
    def __init__(s): s.handle=None; s.membase=None
    def reset(s): pass
dm.Session=_S
dm.register_base_tools=lambda m,S: types.SimpleNamespace()
dm.register_input_tools=lambda m,S: types.SimpleNamespace()
dm.read=lambda h,a,n: bytes(MEM[a:a+n])
def _write(h,a,d): MEM[a:a+len(d)]=d; return len(d)
dm.write=_write
dm.iter_regions=lambda h:[]; dm.HINT_NO_MEMBASE="x"
sys.modules["dosbox_mem"]=dm
di=types.ModuleType("dosbox_input"); di.register_input_tools=lambda m,S: types.SimpleNamespace()
sys.modules["dosbox_input"]=di
mm=types.ModuleType("mcp"); ms=types.ModuleType("mcp.server"); mf=types.ModuleType("mcp.server.fastmcp")
class FastMCP:
    def __init__(s,*a,**k): pass
    def tool(s,*a,**k): return lambda f:f
    def run(s): pass
mf.FastMCP=FastMCP
sys.modules["mcp"]=mm; sys.modules["mcp.server"]=ms; sys.modules["mcp.server.fastmcp"]=mf
sys.path.insert(0, os.path.join(os.path.dirname(__file__),".."))
import dosbox_u6_server as u6
u6.S.handle=1; u6.S.membase=0; u6.S.u6_ds=0

def w24(a,v): MEM[a]=v&0xff; MEM[a+1]=(v>>8)&0xff; MEM[a+2]=(v>>16)&0xff
def pack(x,y,z): return x|(y<<10)|(z<<20)
def name(k,s):
    b=s.encode("latin-1")[:13]
    for i in range(14): MEM[u6.U6_Names+k*14+i]= b[i] if i<len(b) else 0
def setobj(slot,typ,x,y,z,npcst,coorduse=0):
    MEM[u6.U6_ObjShapeType+slot*2]=typ&0xff; MEM[u6.U6_ObjShapeType+slot*2+1]=(typ>>8)&0xff
    w24(u6.U6_ObjPos+slot*3, pack(x,y,z))
    MEM[u6.U6_ObjStatus+slot]=coorduse
    MEM[u6.U6_NPCStatus+slot]=npcst

# Level[] via far ptr -> linear 0x40000 (seg 0x4000, off 0)
LEVEL_BASE=0x40000
MEM[u6.U6_Level_ptr:u6.U6_Level_ptr+4]=bytes([0x00,0x00,0x00,0x40])
def setlevel(slot,lvl): MEM[LEVEL_BASE+slot]=lvl

EVIL,GOOD,CHAOTIC=0x20,0x40,0x60
DEAD,POISON,ASLEEP,PARAL=0x10,0x08,0x04,0x02

# --- party: idx0 slot1 Avatar(50,50,z0), idx1 slot0x1a Sherry, idx2 slot0x1b Iolo ---
PARTY=[1,0x1a,0x1b]
for k,s in enumerate(PARTY): MEM[u6.U6_Party+k]=s
MEM[u6.U6_PartySize]=3
MEM[u6.U6_Active]=0; MEM[u6.U6_SoloFlag]=0xff   # party mode, control idx0 (avatar slot1)
for k,nm in enumerate(["Avatar","Sherry","Iolo"]): name(k,nm)
# avatar: hp 5/Lvl5(max150), poisoned; Sherry: hp 10/Lvl3(max90), asleep; Iolo: DEAD
setobj(1,   0x16d,50,50,0, POISON)
setobj(0x1a,0x16d,50,50,0, ASLEEP)
setobj(0x1b,0x16d,50,50,0, DEAD)
setlevel(1,5); setlevel(0x1a,3); setlevel(0x1b,4)
MEM[u6.U6_HitPoints+1]=5; MEM[u6.U6_HitPoints+0x1a]=10; MEM[u6.U6_HitPoints+0x1b]=0

# --- spawn pool 0xE0-0xFF ---
setobj(0xE0,0x16d,52,50,0, EVIL)        # hostile rat, dist 2  -> PACIFY
setobj(0xE1,0x16d,50,70,0, EVIL)        # hostile, dist 20     -> out of radius, keep
setobj(0xE2,0x16d,51,50,0, 0)           # neutral              -> not hostile, keep
setobj(0xE3,0x16d,51,51,0, EVIL|DEAD)   # hostile but DEAD     -> skip
setobj(0xE4,0x16d,49,50,1, CHAOTIC)     # hostile, other level -> skip (z)
setobj(0xE5,0x16d,50,49,0, CHAOTIC)     # hostile, dist 1      -> PACIFY

print("=== u6_pacify(radius=8) ===")
print(u6.u6_pacify(8))
print()
print("=== u6_heal_party() ===")
print(u6.u6_heal_party())
print()

# --- assertions ---
def chk(label, cond):
    print(f"  [{'OK ' if cond else 'FAIL'}] {label}")
    assert cond, label

print("=== assertions ===")
A=lambda s: MEM[u6.U6_NPCStatus+s]
chk("0xE0 pacified (alignment cleared)", A(0xE0)&0x60==0)
chk("0xE5 pacified (alignment cleared)", A(0xE5)&0x60==0)
chk("0xE1 untouched (out of radius, still EVIL)", A(0xE1)&0x60==EVIL)
chk("0xE2 untouched (was neutral)",              A(0xE2)&0x60==0)
chk("0xE3 untouched (dead skip, still EVIL+DEAD)", A(0xE3)==(EVIL|DEAD))
chk("0xE4 untouched (other level, still CHAOTIC)", A(0xE4)&0x60==CHAOTIC)
chk("Avatar HP -> 150 (Lvl5*30)",   MEM[u6.U6_HitPoints+1]==150)
chk("Avatar poison cleared",        A(1)&POISON==0)
chk("Sherry HP -> 90 (Lvl3*30)",    MEM[u6.U6_HitPoints+0x1a]==90)
chk("Sherry asleep cleared",        A(0x1a)&ASLEEP==0)
chk("Iolo DEAD skipped (HP still 0)", MEM[u6.U6_HitPoints+0x1b]==0)
chk("Iolo DEAD bit preserved",        A(0x1b)&DEAD==DEAD)
print("\nALL PASS")
