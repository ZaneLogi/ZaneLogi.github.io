"""Structural test for the cursor-targeting verbs u6_look / u6_get / u6_use / u6_talk:
correct key sequence (letter + cursor walk + commit), turn-gated on COMMAND_READY,
the SELECTING gate, and direction validation -- against the REAL functions with a
send_key stub that MODELS the engine's COMMAND_READY <-> SELECTING transitions (the
0040769 cursor-targeting model: a command letter arms the cross-cursor; a cursor key
commits). Updated 2026-06-25 alongside the shared cursor-skeleton refactor + u6_use."""
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
from u6 import act  # action tools live here now; patch inp/time on it
u6.S.handle=1; u6.S.membase=0; u6.S.u6_ds=0
# instant sleeps (state transitions are synchronous in the stub) -- keep real time.time
act.time = types.SimpleNamespace(time=_time.time, sleep=lambda s: None)

def w16(a,v): MEM[a]=v&0xff; MEM[a+1]=(v>>8)&0xff
def set_ready():     w16(u6.U6_AllowMouseMov,1); MEM[u6.U6_SelectMode]=0   # COMMAND_READY
def set_selecting(): w16(u6.U6_AllowMouseMov,0); MEM[u6.U6_SelectMode]=1   # SELECTING
MEM[u6.U6_IsInConversation]=0; w16(u6.U6_MouseMode,0)

# Engine model: at COMMAND_READY a command letter (t/l/g/u) arms the cross-cursor
# (-> SELECTING); any cursor key (arrow/enter) commits -> COMMAND_READY (so the drain
# returns at once). Records every key for sequence assertions.
rec=[]
def stub_send_key(k):
    rec.append(k)
    set_selecting() if k in ("t","l","g","u") else set_ready()
    return f"[{k}]"
act.inp = types.SimpleNamespace(send_key=stub_send_key,
                               send_text=lambda t: rec.append("TXT:"+t) or "[txt]")

ok=True
def chk(label, cond):
    global ok; ok &= bool(cond); print(f"  [{'OK' if cond else 'FAIL'}] {label}")
def run(verb, arg):
    rec.clear(); set_ready(); r=verb(arg); return list(rec), r

print("cursor-verb key sequences (turn-gated; SELECTING gate; letter + walk + commit):")
seq,_ = run(u6.u6_get,  "e");    chk("get e    -> ['g','right']            (range -1: arrow auto-commits)", seq==["g","right"])
seq,_ = run(u6.u6_get,  "north");chk("get north-> ['g','up']", seq==["g","up"])
seq,_ = run(u6.u6_look, "s");    chk("look s   -> ['l','down','enter']     (range 7: Enter commits)", seq==["l","down","enter"])
seq,_ = run(u6.u6_look, "nw");   chk("look nw  -> ['l','up','left','enter'] (diagonal = two arrows)", seq==["l","up","left","enter"])
seq,_ = run(u6.u6_use,  "e");    chk("use e    -> ['u','right']            (range -1: arrow auto-commits)", seq==["u","right"])
seq,_ = run(u6.u6_use,  "here"); chk("use here -> ['u','enter']            (self: Enter at centre)", seq==["u","enter"])
seq,_ = run(u6.u6_talk, "s");    chk("talk s   -> ['t','down','enter']", seq==["t","down","enter"])

print("direction validation (no key sent on a bad target):")
seq,r = run(u6.u6_get,  "x");    chk("get x  -> no send + 'Invalid GET'", seq==[] and "Invalid GET" in r)
seq,r = run(u6.u6_look, "x");    chk("look x -> no send + 'Unknown'",     seq==[] and "Unknown" in r)
seq,r = run(u6.u6_use,  "ne");   chk("use ne -> no send + 'Invalid USE' (diagonal not reachable)", seq==[] and "Invalid USE" in r)

print("blind (not-hooked) fallback still emits the right keys + a clear message:")
u6.S.membase=None                                  # _session_base() -> None
seq,r = run(u6.u6_use, "n");     chk("use n (blind) -> ['u','up'] + 'not hooked'", seq==["u","up"] and "not hooked" in r)
u6.S.membase=0

print("page-pause advance (u6_say dismisses '*' pauses before typing -- first-char-eaten fix):")
def w16r(a): return MEM[a] | (MEM[a+1] << 8)
# stub: an ENTER while a page-pause shows (PromptCh==1) advances to the live line prompt
def pause_stub(k):
    rec.append(k)
    if k == "enter" and w16r(u6.U6_PromptCh) == 1:
        MEM[u6.U6_LineInput] = 1; w16(u6.U6_PromptCh, 5)
    return f"[{k}]"
act.inp = types.SimpleNamespace(send_key=pause_stub,
                               send_text=lambda t: rec.append("TXT:"+t) or "[txt]")

MEM[u6.U6_LineInput]=0; w16(u6.U6_PromptCh,1)               # a page-pause is blocking
rec.clear(); pages=u6._advance_conv_input(0)
chk("pause -> 1 ENTER advances to live line input", pages==1 and rec==["enter"] and MEM[u6.U6_LineInput]==1)

MEM[u6.U6_LineInput]=1; w16(u6.U6_PromptCh,5)               # line input already live
rec.clear(); pages=u6._advance_conv_input(0)
chk("line input live -> NO key (never submit/exit), 0 pages", pages==0 and rec==[])

MEM[u6.U6_LineInput]=0; w16(u6.U6_PromptCh,5)               # single-key prompt, no pause
rec.clear(); pages=u6._advance_conv_input(0)
chk("non-paused single-key -> NO key, 0 pages", pages==0 and rec==[])

# u6_say end-to-end through a pause: advance, THEN type the full word (no eaten char).
# Talk_PC=0/TalkBuf_ptr=0 -> the opcode peek reads MEM[0]=0 (not single-key) -> line path.
MEM[u6.U6_LineInput]=0; w16(u6.U6_PromptCh,1); MEM[u6.U6_IsInConversation]=1
rec.clear(); r=u6.u6_say("name")
chk("u6_say through a pause: ENTER then types full 'name'+enter",
    rec==["enter","TXT:name","enter"] and "advanced 1" in r)

# restore shared stub + state
MEM[u6.U6_IsInConversation]=0; MEM[u6.U6_LineInput]=0; w16(u6.U6_PromptCh,5)
act.inp=types.SimpleNamespace(send_key=stub_send_key,
                             send_text=lambda t: rec.append("TXT:"+t) or "[txt]")

print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
