"""Converse-VM decoder test: text + keyword list + response preview + IF-on-flag
(deterministic, both values) + RND (both branches) + unknown op (DECODER_STOP),
against the REAL _ConverseVM with a synthetic TalkBuf and a stub env."""
import sys, types, os
# minimal stubs so the server module imports
dm = types.ModuleType("dosbox_mem")
class _S:
    def __init__(s): s.handle=None; s.membase=None
    def reset(s): pass
dm.Session=_S; dm.register_base_tools=lambda m,S: types.SimpleNamespace()
dm.register_input_tools=lambda m,S: types.SimpleNamespace()
dm.read=lambda h,a,n: b"\x00"*n; dm.iter_regions=lambda h:[]; dm.HINT_NO_MEMBASE="x"
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

def env(flag=1):
    return types.SimpleNamespace(npc=5, varint=lambda i:0, varstr=lambda i:"",
                                 query=lambda kind,**kw: flag if kind=="flag" else 0)

# opcode shortcuts
KEY,RES,ASK,ENDRES=0xef,0xf6,0xf7,0xee
IF,ELSE,ENDIF,EOF=0xa1,0xa3,0xa2,0xa7
BYTE,TST,RND=0xd3,0xab,0xa0
def T(s): return list(s.encode("latin-1"))

ok=True
def chk(label, cond):
    global ok; ok &= bool(cond); print(f"  [{'OK' if cond else 'FAIL'}] {label}")

# 1) plain text stops at ASKTOP
vm=u6._ConverseVM(bytes(T("Hello there.")+[ASK]), env())
chk("text decode", vm.decode_block(set())=="Hello there.")

# 2) keyword list (comma-separated -> split; '*' -> (anything))
script=bytes([KEY]+T("name")+[RES]+T("r1")+[KEY]+T("job,work")+[RES]+T("r2")+
             [KEY]+T("*")+[RES]+T("r3")+[ENDRES])
vm=u6._ConverseVM(script, env());
chk("keyword list", vm.keyword_list()==["name","job","work","(anything)"])

# 3) find + decode the 'job' response
vm=u6._ConverseVM(script, env())
chk("find_response job", vm.find_response("job") and vm.decode_block(set())=="r2")
# abbreviation: 'wor' matches 'work'
vm=u6._ConverseVM(script, env()); chk("abbrev 'wor'->work", vm.find_response("wor"))

# 4) IF on a flag (deterministic): "A" IF(TST npc,bit) "B" ELSE "C" ENDIF "D"
ifblk=bytes(T("A")+[IF,BYTE,5,BYTE,0,TST,EOF]+T("B")+[ELSE]+T("C")+[ENDIF]+T("D")+[ASK])
chk("IF flag=1 -> ABD", u6._ConverseVM(ifblk, env(flag=1)).decode_block(set())=="ABD")
chk("IF flag=0 -> ACD", u6._ConverseVM(ifblk, env(flag=0)).decode_block(set())=="ACD")

# 5) RND -> both branches annotated
rndblk=bytes([IF,BYTE,1,BYTE,3,RND,EOF]+T("X")+[ELSE]+T("Y")+[ENDIF]+[ASK])
res=u6._ConverseVM(rndblk, env()).decode_block(set())
chk("RND -> [either: X | Y]", "[either:" in res and "X" in res and "Y" in res)

# 6) unknown STATEMENT opcode -> _DecoderStop (decode_block is a closed set)
try:
    u6._ConverseVM(bytes(T("hi")+[0x88]+T("bye")+[ASK]), env()).decode_block(set())
    chk("unknown stmt op raises", False)
except u6._DecoderStop as st:
    chk("unknown stmt op -> DecoderStop", st.op==0x88)

# 7) factor-level: a bare byte (neither a tagged literal nor an operator) is pushed
#    as a LITERAL value, NOT a DecoderStop (seg_1703.c:314-322 default case).
chk("bare literal 5 -> value 5", u6._ConverseVM(bytes([0x05, EOF]), env()).evaluate()==(5, False))
chk("bare literal 0 -> value 0", u6._ConverseVM(bytes([0x00, EOF]), env()).evaluate()==(0, False))

# 8) regression for the Shamino 'name' false-stop: a response body of SET self,0
#    (OP_SET=0xa4, 2 factors: BYTE 0xeb=self, then a BARE 0x00=bit 0) followed by
#    text must decode cleanly without raising. factor2 packs its operand as a bare
#    byte -- the exact shape that tripped DECODER_STOP before the fix.
SET=0xa4
namebody=bytes([KEY]+T("name")+[RES, SET, BYTE,0xeb, EOF, 0x00, EOF]+T("I am Shamino.")+[ENDRES])
vm=u6._ConverseVM(namebody, env())
chk("SET self,0 + text decodes (no stop)",
    vm.find_response("name") and vm.decode_block(set())=="I am Shamino.")

# 8a) OP_WAIT (0xcb, a mid-response "press a key" pause) is a 0-operand no-op for
#     decoding -- it must NOT DECODER_STOP (it's < 0xf0, so decode_block sees it).
WAIT=0xcb
waitbody=bytes([KEY]+T("job")+[RES]+T("I am ")+[WAIT]+T("a ranger.")+[ENDRES])
vm=u6._ConverseVM(waitbody, env)
chk("OP_WAIT decodes as a no-op pause (no stop)",
    vm.find_response("job") and vm.decode_block(set())=="I am a ranger.")

# 8b) keyword scan is robust past a COMPLEX body (SET + GOTO) and enumerates ALL
#     keywords. The old hand-rolled _skip_body desynced on SET/GOTO and lost every
#     keyword after the first complex body -- the real reason only 'name' ever showed
#     for live NPCs. _skip_body now reuses decode_block (GOTO NOT followed).
GOTO=0xb0
multi=bytes([KEY]+T("name")+[RES, SET,BYTE,0xeb,EOF,0x00,EOF, GOTO,0,0,0,0]
            +[KEY]+T("job")+[RES]+T("r2")
            +[KEY]+T("*")+[RES]+T("r3")+[ENDRES])
chk("enumerate past SET+GOTO body -> all keywords",
    u6._ConverseVM(multi, env).keyword_list()==["name","job","(anything)"])
vm=u6._ConverseVM(multi, env)
chk("find_response reaches 'job' past the complex 'name' body",
    vm.find_response("job") and vm.decode_block(set())=="r2")

# 9) '@' highlight markup: strip from prose, return the highlighted cue words
#    (seg_0C9C.c:1880 -- '@' colours the next word, consumed; word ends at a
#    terminator " ,.:;!?'-\"\n"). These are the on-screen "ask me about this" cues.
clean, hl = u6._extract_highlights("Find the @gargoyles near the @castle, friend.")
chk("highlight: prose stripped of '@'", clean=="Find the gargoyles near the castle, friend.")
chk("highlight: words collected", hl==["gargoyles","castle"])
clean, hl = u6._extract_highlights("the @Avatar's quest")          # apostrophe terminates
chk("highlight: apostrophe ends the word", clean=="the Avatar's quest" and hl==["Avatar"])
clean, hl = u6._extract_highlights("ends here@")                   # trailing '@' -> nothing
chk("highlight: trailing '@' drops, no word", clean=="ends here" and hl==[])
clean, hl = u6._extract_highlights("@gold @GOLD @gold and @silver")  # case-insensitive dedup
chk("highlight: dedup case-insensitively, first-seen order", hl==["gold","silver"])
clean, hl = u6._extract_highlights("no markers at all.")
chk("highlight: plain text unchanged, no words", clean=="no markers at all." and hl==[])

# 10) list-element LET `@a[idx] a8 @b[idx] a7` -- the value is an a8-SEPARATED factor
#     chain. The old _let read a single factor after the ADDRESS dest and desynced
#     -> DECODER_STOP mid-conversation (Budo). The fix consumes the whole chain, so
#     the body decodes cleanly to the trailing text.
ADDR, B4 = 0xd2, 0xb4
listlet = bytes([KEY]+T("x")+[RES]
                + [0xa6, ADDR, 0x1b,0x11,0,0, BYTE,0, B4, 0xa8, ADDR, 0x2b,0x11,0,0, BYTE,0, B4, EOF]
                + T("done.")+[ENDRES])
vm=u6._ConverseVM(listlet, env())
chk("list-element LET decodes, no DECODER_STOP",
    vm.find_response("x") and vm.decode_block(set())=="done.")

# 11) LOOP back-edge: a GOTO to an ALREADY-decoded addr (e.g. Lord British's 'heal'
#     keyword iterates the party with `IF(cnt<=size) GOTO L ENDIF`) must be SKIPPED,
#     not followed -- the read-only decoder can't run the loop counter, so following
#     the back-edge spins forever and tripped the depth guard (mis-reported as opcode
#     0xa1=IF). Skipping it lets decode fall through to the post-loop text.
prefix = [KEY]+T("x")+[RES]
Loff = len(prefix)                                   # addr of the loop body start
loopbody = (T("Heal. ") + [IF,BYTE,5,BYTE,0,TST,EOF]   # IF(flag) ...
            + [GOTO, Loff,0,0,0]                        #   GOTO L  (back-edge, addr already seen)
            + [ENDIF] + T("Party healed."))            # ENDIF; post-loop text
loopbuf = bytes(prefix + loopbody + [ENDRES])
vm=u6._ConverseVM(loopbuf, env(flag=1))
chk("loop back-edge GOTO skipped -> post-loop text reached (no DECODER_STOP)",
    vm.find_response("x") and vm.decode_block(set())=="Heal. Party healed.")

# 11a) the same all-side-effect IF body must not leave an empty '[either: «»]' when the
#      condition is nondeterministic (RND/Wounded): an [either] with both branches blank
#      is suppressed (heal's `IF Wounded HEAL ENDIF` produces no readable text).
emptyeither = bytes([IF,BYTE,1,BYTE,3,RND,EOF]+[ENDIF]+T("Done.")+[ASK])
chk("nd IF with empty branches -> no stray [either]",
    u6._ConverseVM(emptyeither, env()).decode_block(set())=="Done.")

# 12) Bug A: `IF cond GOTO L ENDIF <fallthrough> LEAVE` -- the linear say-and-leave
#     NPC idiom (Geoffrey). The decoder must follow REAL control flow: take the live
#     branch, NOT decode the not-taken branch's GOTO (which jumps to another speech
#     ending in LEAVE and left the pc in garbage past the script -> DECODER_STOP).
#     LEAVE ends the whole decode.
LEAVE = 0xb6
geo = bytes([IF,BYTE,5,BYTE,0,TST,EOF, GOTO,19,0,0,0, ENDIF] + T("Main.") + [LEAVE]
            + T("Alt.") + [LEAVE, ASK])   # L_alt = offset 19 ("Alt.")
chk("Bug A: cond false -> fall through to 'Main.' (no not-taken-GOTO desync)",
    u6._ConverseVM(geo, env(flag=0)).decode_block(set())=="Main.")
chk("Bug A: cond true -> follow the GOTO to 'Alt.'",
    u6._ConverseVM(geo, env(flag=1)).decode_block(set())=="Alt.")

# 13) NPC name from the TalkBuf script header (fixes the stale U6_NpcName read):
#     OP_ID (0xff), npcId, ASCII name up to OP_DESC (0xf1). Always the NPC actually
#     loaded NOW -- reliable even when the shared name buffer lags to the prior NPC.
DESC = 0xf1
chk("npc name from header 'Geoffrey'",
    u6._npc_name_from_script(bytes([0xff, 7] + T("Geoffrey") + [DESC] + T("a tall man."))) == "Geoffrey")
chk("npc name with a space 'Lord British'",
    u6._npc_name_from_script(bytes([0xff, 5] + T("Lord British") + [DESC])) == "Lord British")
chk("npc name bad header -> '' (caller falls back to live buffer)",
    u6._npc_name_from_script(bytes([0x00, 0x00, 0x41])) == "")

print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
