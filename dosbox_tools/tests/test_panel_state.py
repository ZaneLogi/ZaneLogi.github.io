"""Structural test for u6_panel_state: decodes StatusDisplay / panel-char / cursor /
scroll / the 4x3 backpack (D_E70F) / Equipment / Selection from memory, against the
REAL function with a stub-memory image. Offsets are source-derived (BSS.ASM +
/*xxxx*/ annotations); this checks the DECODE, not the live offsets."""
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

def w8(a,v):  MEM[a]=v&0xff
def w16(a,v): MEM[a]=v&0xff; MEM[a+1]=(v>>8)&0xff

# A known INVENTORY panel: member #2, cursor at (col1,row0), two backpack items
# (0x305 @ (0,0), 0x306 @ (0,1) = the cursor cell), a HEAD equip (0x310), Selection
# on 0x306 with x=2, y=-1.
w16(u6.U6_StatusDisplay, 0x92)      # INVENTORY
w16(u6.U6_PanelChar, 2)
w8 (u6.U6_PanelCol, 1); w8(u6.U6_PanelRow, 0)
# the LIVE cursor is PointerX/Y, not PanelCol/Row: pixel of cell (row0,col1) = (264,32)
w16(u6.U6_PointerX, 264); w16(u6.U6_PointerY, 32)
w8 (u6.U6_InvScroll, 0)
w16(u6.U6_VisBackpack + 0*2, 0x305) # (row0,col0)
w16(u6.U6_VisBackpack + 1*2, 0x306) # (row0,col1) == cursor
w16(u6.U6_Equipment  + 0*2, 0x310)  # SLOT_HEAD
w16(u6.U6_Sel_x, 2); w16(u6.U6_Sel_y, 0xFFFF); w16(u6.U6_Sel_obj, 0x306)

ok=True
def chk(label, cond):
    global ok; ok &= bool(cond); print(f"  [{'OK' if cond else 'FAIL'}] {label}")

print("u6_panel_state decode (INVENTORY view, 2 backpack items, 1 equip, a selection):")
r = u6.u6_panel_state()
chk("view=INVENTORY",                 "view=INVENTORY" in r)
chk("char#=2",                        "char#=2" in r)
chk("live cursor cell (row0,col1)",   "cell (row0,col1)" in r)
chk("PanelCol/Row still noted",       "PanelCol/Row=(col1,row0)" in r)
chk("scroll=0",                       "scroll=0" in r)
chk("backpack (0,0) slot 0x305",      "(0,0) slot 0x305" in r)
chk("backpack (0,1) slot 0x306",      "(0,1) slot 0x306" in r)
chk("cursor mark on the (0,1) cell",  "0x306" in r and "<-cursor" in r.split("0x306",1)[1].split("\n",1)[0])
chk("(0,0) cell NOT marked",          "<-cursor" not in r.split("0x305",1)[1].split("\n",1)[0])
chk("equipped HEAD: 0x310",           "HEAD: 0x310" in r)
chk("Selection obj=0x306",            "Selection: obj=0x306" in r)
chk("Selection x=2 y=-1",             "x=2 y=-1" in r)

print("view-mode decode + empty selection:")
w16(u6.U6_StatusDisplay, 0x91)        # PARTY
w16(u6.U6_Sel_obj, 0xFFFF)            # -1 -> none
r = u6.u6_panel_state()
chk("view=PARTY",                     "view=PARTY" in r)
chk("Selection none",                 "Selection: obj=none" in r)

print("u6_container decode (contents + nesting):")
# bag 0x305 holds 0x320 (CONTAINED, assoc=0x305, quan 3); 0x320 nests 0x321
w8 (u6.U6_ObjStatus + 0x320, 0x08); w16(u6.U6_ObjPos + 0x320*3, 0x305)
w16(u6.U6_ObjShapeType + 0x320*2, 0x041); w16(u6.U6_Amount + 0x320*2, 0x0003)
w8 (u6.U6_ObjStatus + 0x321, 0x08); w16(u6.U6_ObjPos + 0x321*3, 0x320)
w16(u6.U6_ObjShapeType + 0x321*2, 0x042)
rc = u6.u6_container(0x305)
chk("container lists 0x320",          "0x320" in rc)
chk("container nests 0x321",          "0x321" in rc)
chk("contained quan=3 shown",         "quan=3" in rc)
chk("empty container note",           "(empty)" in u6.u6_container(0x309))

print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
