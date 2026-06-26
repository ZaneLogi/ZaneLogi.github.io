"""Structural test for u6_ready: READY (INVEN->EQUIP, backpack item) / UNREADY
(EQUIP->INVEN, equipped item), member derivation from the item's holder, the
equip-silhouette cell math, refused-ready detection, and not-on-page / not-carried
guards -- against the REAL function with a stub modelling the panel toggle ('/' -> roster,
F<member> -> INVENTORY, <tab> -> cursor, <enter> on the cell flips CoordUse; ESC -> ready)."""
import sys, types, os
MEM = bytearray(0x10000)
dm = types.ModuleType("dosbox_mem")
class _S:
    def __init__(s): s.handle=None; s.membase=None
    def reset(s): pass
dm.Session=_S
dm.register_base_tools=lambda m,S: types.SimpleNamespace()
dm.register_input_tools=lambda m,S: types.SimpleNamespace()
dm.read=lambda h,a,n: bytes(MEM[a:a+n]); dm.iter_regions=lambda h:[]; dm.HINT_NO_MEMBASE="x"
def _w(h,a,b): MEM[a:a+len(b)]=b; return len(b)
dm.write=_w
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
# fast fake clock (advances per .time() call so timeout loops exit quickly; no real sleep)
class _Clock:
    def __init__(s): s.t=0.0
    def time(s): s.t += 0.2; return s.t
    def sleep(s, d): pass
u6.time = _Clock()

def w8(a,v):  MEM[a]=v&0xff
def w16(a,v): MEM[a]=v&0xff; MEM[a+1]=(v>>8)&0xff
def set_obj(slot, typ=1, status=0, assoc=0):
    w16(u6.U6_ObjShapeType+slot*2, typ&0x3ff)
    w8(u6.U6_ObjStatus+slot, status)
    if status & 0x18: w16(u6.U6_ObjPos+slot*3, assoc)        # held: ObjPos[0..1]=holder slot
def coorduse(slot): return MEM[u6.U6_ObjStatus+slot] & 0x18

# party: Party[0..2] = object slots 1,2,3; size 3
w8(u6.U6_PartySize, 3)
for i,sl in enumerate((1,2,3)): w8(u6.U6_Party+i, sl)

REFUSE=set()
def set_ready():     w16(u6.U6_AllowMouseMov,1); MEM[u6.U6_SelectMode]=0
def set_selecting(): w16(u6.U6_AllowMouseMov,0); MEM[u6.U6_SelectMode]=1
rec=[]
def eng(k):
    rec.append(k)
    if k=="/":                                               # any view -> roster (CMD_91)
        w16(u6.U6_StatusDisplay, 0x91)
    elif k.startswith("f") and k[1:].isdigit():
        w16(u6.U6_PanelChar, int(k[1:])-1)
        if u6._rd16(u6.U6_StatusDisplay) in (0x91, 0x92):   # roster/inventory -> member INVENTORY
            w16(u6.U6_StatusDisplay, 0x92)
        # from PORTRAIT (0x90) the F-key only swaps the member, view stays portrait
    elif k=="*":                                             # toggle PORTRAIT<->INVENTORY
        sd=u6._rd16(u6.U6_StatusDisplay)
        w16(u6.U6_StatusDisplay, 0x92 if sd==0x90 else 0x90)
    elif k=="tab":                                          # seg_0C9C.c:1313/1183
        sm=MEM[u6.U6_SelectMode]; sd=u6._rd16(u6.U6_StatusDisplay)
        if sm==1: MEM[u6.U6_SelectMode]=2                              # map-select -> panel
        elif sm==0: MEM[u6.U6_SelectMode]=2 if sd==0x92 else 1         # CMD_92: ->2 directly; else ->1
        if MEM[u6.U6_SelectMode]==2: w16(u6.U6_AllowMouseMov,0)
    elif k=="enter":                                         # ready-mode toggle (no command active)
        col=MEM[u6.U6_PanelCol]; row=MEM[u6.U6_PanelRow]
        if col>=3:                                           # backpack cell -> READY
            idx=row*4+(col-3); pack=u6._visible_backpack(0)
            obj=pack[idx] if 0<=idx<12 else 0
            if obj and (MEM[u6.U6_ObjStatus+obj]&0x18)==0x10 and obj not in REFUSE:
                MEM[u6.U6_ObjStatus+obj]=0x18                # INVEN -> EQUIP
        else:                                                # equip cell -> UNREADY
            for s,(c,r) in u6._EQUIP_CELL.items():
                if (c,r)==(col,row):
                    obj=MEM[u6.U6_Equipment+s*2]|(MEM[u6.U6_Equipment+s*2+1]<<8)
                    if obj: MEM[u6.U6_ObjStatus+obj]=0x10; w16(u6.U6_Equipment+s*2,0)
                    break
        # stays SelectMode==2 (panel)
    elif k=="esc":
        set_ready()
    return f"[{k}]"
u6.inp=types.SimpleNamespace(send_key=eng, send_text=lambda t:"[txt]")

ok=True
def chk(label, cond):
    global ok; ok &= bool(cond); print(f"  [{'OK' if cond else 'FAIL'}] {label}")
def reset(items=()):
    for i in range(12): w16(u6.U6_VisBackpack+i*2, items[i] if i<len(items) else 0)
    for s in range(8): w16(u6.U6_Equipment+s*2, 0)
    w8(u6.U6_PanelCol,3); w8(u6.U6_PanelRow,0); set_ready()
    w16(u6.U6_StatusDisplay, 0x90)                  # start non-roster (e.g. post-conversation PORTRAIT)
    rec.clear()

print("READY a backpack item (INVEN -> EQUIP), member from the item's holder:")
set_obj(0x305, status=0x10, assoc=1)            # held by Party[0]=1 -> member 0 -> F1
reset([0x305])                                  # visible at backpack cell (0,0)
r = u6.u6_ready("inv:0x305")
chk("drove / + F1 + tab + enter (no 'u'!) + esc", rec==["/","f1","tab","enter","esc"])
chk("item now EQUIP",                          coorduse(0x305)==0x18)
chk("reports equipped on member 1",            "equipped" in r and "member 1" in r)

print("UNREADY an equipped item (EQUIP -> INVEN); member + equip-cell math:")
set_obj(0x320, status=0x18, assoc=3)            # worn by Party[2]=3 -> member 2 -> F3
reset(); w16(u6.U6_Equipment+0*2, 0x320)        # in SLOT_HEAD (equip cell (1,0))
r = u6.u6_ready("0x320")
chk("opened member 3's panel (/ then F3)",     rec[:2]==["/","f3"])
chk("cursor placed on HEAD cell (col1,row0)",  MEM[u6.U6_PanelCol]==1 and MEM[u6.U6_PanelRow]==0)
chk("item now INVEN",                          coorduse(0x320)==0x10)
chk("reports taken off",                       "taken off" in r)

print("refused READY (engine won't equip) -> detected as not-equipped:")
set_obj(0x306, status=0x10, assoc=1); REFUSE.add(0x306)
reset([0x306])
r = u6.u6_ready("0x306")
chk("still INVEN + reports NOT equipped",      coorduse(0x306)==0x10 and "NOT equipped" in r)

print("guards:")
set_obj(0x307, status=0x10, assoc=1); reset([])     # INVEN but not on the visible page
r = u6.u6_ready("0x307")
chk("not-on-page -> reports it",               "not on the panel" in r)
set_obj(0x330, status=0)                             # LOCXYZ (on the ground)
reset()
r = u6.u6_ready("0x330")
chk("not-carried -> reports it",               "not in a member's inventory" in r)
r = u6.u6_ready("north")
chk("bad target -> asks for a slot",           "Invalid ready target" in r)

print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
