"""Structural test for the inventory-target USE path: _parse_slot / _find_matching_key
/ _resolve_member (pure decisions) + _select_backpack_item, single-item USE, potion
on=member, and the locked-door key flow -- against the REAL functions with a send_key
stub that MODELS the engine's panel transitions (F<n>->INVENTORY, U->SELECTING,
<tab>->panel cursor, Enter->commit on the cursor cell, key/potion->re-arm 'On')."""
import sys, types, os, time as _time
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
u6.time = types.SimpleNamespace(time=_time.time, sleep=lambda s: None)

def w8(a,v):  MEM[a]=v&0xff
def w16(a,v): MEM[a]=v&0xff; MEM[a+1]=(v>>8)&0xff
def set_obj(slot, typ, frame=0, qual=0, status=0, assoc=0, x=0, y=0, z=0):
    w16(u6.U6_ObjShapeType + slot*2, (typ & 0x3ff) | (frame << 10))
    w16(u6.U6_Amount + slot*2, qual << 8)
    w8 (u6.U6_ObjStatus + slot, status)
    if status & 0x18:                                    # held: ObjPos[0..1] = holder slot
        w16(u6.U6_ObjPos + slot*3, assoc)
    else:                                                # LOCXYZ: packed x10|y10|z4
        v = (x & 0x3ff) | ((y & 0x3ff) << 10) | ((z & 0xf) << 20)
        MEM[u6.U6_ObjPos+slot*3:u6.U6_ObjPos+slot*3+3] = bytes([v&0xff,(v>>8)&0xff,(v>>16)&0xff])

# --- party/control: Active=0, Party[0]=member slot 1 (the avatar), at (10,10,0) ---
w8(u6.U6_Active, 0); w8(u6.U6_PartySize, 1); w8(u6.U6_Party, 1)
set_obj(1, 0x172, status=0, x=10, y=10, z=0)             # avatar object @ (10,10)

# --- engine model (the stub send_key) ---
SECOND = {0x040, 0x03f, 0x113, 0x057}                    # types that re-arm an 'On' prompt
state = {"await": False, "door": None}
def set_ready():     w16(u6.U6_AllowMouseMov,1); MEM[u6.U6_SelectMode]=0
def set_selecting(): w16(u6.U6_AllowMouseMov,0); MEM[u6.U6_SelectMode]=1
rec=[]
def eng_send(k):
    rec.append(k)
    if k in ("f1","f2","f3","f4","f5","f6","f7","f8"):
        w16(u6.U6_StatusDisplay, 0x92); w16(u6.U6_PanelChar, int(k[1])-1)
    elif k == "u":
        set_selecting()
    elif k == "tab":
        if u6._rd16(u6.U6_StatusDisplay) == 0x92: MEM[u6.U6_SelectMode]=2; w16(u6.U6_AllowMouseMov,0)
    elif k == "enter":
        col=MEM[u6.U6_PanelCol]; row=MEM[u6.U6_PanelRow]; idx=row*4+(col-3)
        pack=u6._visible_backpack(0); sel=pack[idx] if 0<=idx<12 else 0
        w16(u6.U6_Sel_obj, sel)
        if sel and u6._obj_tfq(0, sel)[0] in SECOND: set_selecting(); state["await"]=True
        else: set_ready()
    elif state["await"] and (k in tuple("12345678") or k in ("up","down","left","right")):
        state["await"]=False; set_ready()
        if k in ("up","down","left","right") and state["door"] is not None:   # key flow: unlock
            d=state["door"]; sh=u6._rd16(u6.U6_ObjShapeType+d*2)
            w16(u6.U6_ObjShapeType+d*2, (sh & 0x3ff) | (4 << 10))             # frame -> 4 (unlocked)
    elif k == "esc":
        state["await"]=False; set_ready()
    return f"[{k}]"
u6.inp = types.SimpleNamespace(send_key=eng_send, send_text=lambda t: "[txt]")

ok=True
def chk(label, cond):
    global ok; ok &= bool(cond); print(f"  [{'OK' if cond else 'FAIL'}] {label}")

print("pure decisions:")
chk("_parse_slot inv:0x305 -> 773", u6._parse_slot("inv:0x305")==773)
chk("_parse_slot 0x305 -> 773",     u6._parse_slot("0x305")==773)
chk("_parse_slot 773 -> 773",       u6._parse_slot("773")==773)
chk("_parse_slot 'north' -> None",  u6._parse_slot("north") is None)
chk("_parse_slot 'here' -> None",   u6._parse_slot("here") is None)

# member 1 owns directly: key qual5 @0x307, key qual9 @0x308, lockpick @0x309;
# and a CONTAINED key qual11 @0x321 inside bag 0x320 (bag held by member 1).
set_obj(0x307, 0x040, qual=5, status=0x10, assoc=1)
set_obj(0x308, 0x040, qual=9, status=0x10, assoc=1)
set_obj(0x309, 0x03f, qual=0, status=0x10, assoc=1)
set_obj(0x320, 0x056, status=0x10, assoc=1)              # a bag in member 1's pack
set_obj(0x321, 0x040, qual=11, status=0x08, assoc=0x320) # key inside the bag (CONTAINED)
chk("_find_matching_key qual5 -> (0x307,-1) direct", u6._find_matching_key(0,1,5)==(0x307,-1))
chk("_find_matching_key qual9 -> (0x308,-1)",        u6._find_matching_key(0,1,9)==(0x308,-1))
chk("_find_matching_key qual3 -> (-1,-1) none",      u6._find_matching_key(0,1,3)==(-1,-1))
chk("_find_matching_key qual0 -> lockpick (0x309,-1)", u6._find_matching_key(0,1,0)==(0x309,-1))
chk("_find_matching_key qual11 -> CONTAINED (0x321,0x320)", u6._find_matching_key(0,1,11)==(0x321,0x320))

# Names[0]="Avatar"; resolve a member
MEM[u6.U6_Names:u6.U6_Names+7]=b"Avatar\x00"
chk("_resolve_member '2' -> '2'",    u6._resolve_member(0,"2")=="2")
chk("_resolve_member 'avatar' -> '1'", u6._resolve_member(0,"avatar")=="1")
chk("_resolve_member 'nobody' -> None", u6._resolve_member(0,"nobody") is None)

def reset_panel(items):
    for i in range(12): w16(u6.U6_VisBackpack+i*2, items[i] if i<len(items) else 0)
    w8(u6.U6_PanelCol,3); w8(u6.U6_PanelRow,0); set_ready(); state["await"]=False; state["door"]=None; rec.clear()

print("inventory single-item USE (food, no second input):")
set_obj(0x305, 0x05f, status=0x10, assoc=1)              # a food item (not a SECOND type)
reset_panel([0x305])                                     # at cell (0,0)
r = u6.u6_use("inv:0x305")
chk("sequence f1,u,tab,enter", rec==["f1","u","tab","enter"])
chk("cursor written to (col3,row0)", MEM[u6.U6_PanelCol]==3 and MEM[u6.U6_PanelRow]==0)
chk("committed + COMMAND_READY", "now COMMAND_READY" in r and "0x305" in r)

print("potion needs on=member (abort when missing, digit when given):")
set_obj(0x306, 0x113, status=0x10, assoc=1)              # a potion
reset_panel([0x306]); r = u6.u6_use("inv:0x306")          # no on=
chk("missing on -> ESC abort + asks", "needs a target" in r and rec[-1]=="esc")
reset_panel([0x306]); r = u6.u6_use("inv:0x306", on="2")  # on=member 2
chk("on=2 -> sends member digit", rec==["f1","u","tab","enter","2"] and "on member 2" in r)

print("locked-door key flow (auto-find the matching key, U->key->door):")
set_obj(0x400, 0x129, frame=8, qual=5, status=0, x=10, y=9, z=0)   # locked door north of avatar
reset_panel([0x307]); state["door"]=0x400                 # the key (qual5) is visible at cell 0
r = u6.u6_use("north")
chk("used the qual-matched key 0x307", "0x307" in r)
chk("door reported unlocked", "unlocked" in r)
chk("drove panel-select then the door arrow", rec==["f1","u","tab","enter","up"])

set_obj(0x401, 0x129, frame=8, qual=7, status=0, x=10, y=9, z=0)   # door needs qual7 (none owned)
set_obj(0x400, 0, status=0)                               # remove the qual5 door
reset_panel([0x307])
r = u6.u6_use("north")
chk("no matching key -> reports it, no panel drive", "no matching" in r and rec==[])

print("locked door whose only matching key is CONTAINED -> reported, not (mis)driven:")
set_obj(0x401, 0, status=0)                               # clear the qual7 door
set_obj(0x402, 0x129, frame=8, qual=11, status=0, x=10, y=9, z=0)  # door needs qual11 = the bagged key
reset_panel([])                                          # nothing in the visible backpack
r = u6.u6_use("north")
chk("contained key -> 'INSIDE ... take it out', no panel drive",
    "INSIDE" in r and "take it out" in r and "0x321" in r and "0x320" in r and rec==[])

print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
