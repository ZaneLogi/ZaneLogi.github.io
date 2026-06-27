"""u6.act -- the action verbs and the keyboard mechanisms behind them: cursor
targeting (look/get/talk), the status-panel drive (use-on-item / ready), the USE
dispatch (map tiles, carried items, the auto locked-door key flow), say/key, and
the goto+talk one-liner. Sends input via the shared channel; reads via decoders.
"""

import time

from u6.constants import *  # noqa: F401,F403
from u6.ctx import *        # noqa: F401,F403
from u6.decode import *     # noqa: F401,F403
from u6.converse import *   # noqa: F401,F403  -- u6_say peeks the converse VM
from u6.navigate import *   # noqa: F401,F403  -- u6_talk_to drives u6_goto


_U6_DIR = {
    "n": "up", "north": "up", "up": "up",
    "s": "down", "south": "down", "down": "down",
    "w": "left", "west": "left", "left": "left",
    "e": "right", "east": "right", "right": "right",
}

_U6_DIR8 = {
    "n": ["up"], "north": ["up"], "up": ["up"],
    "s": ["down"], "south": ["down"], "down": ["down"],
    "w": ["left"], "west": ["left"], "left": ["left"],
    "e": ["right"], "east": ["right"], "right": ["right"],
    "ne": ["up", "right"], "northeast": ["up", "right"],
    "nw": ["up", "left"], "northwest": ["up", "left"],
    "se": ["down", "right"], "southeast": ["down", "right"],
    "sw": ["down", "left"], "southwest": ["down", "left"],
}

_TALK_SINGLEKEY_OPS = {0xf8, 0xfa, 0xfc, 0xcb}  # GET, GETCHR, GETDIGIT, WAIT

_CURSOR_STEP = 0.12   # seconds between cursor keystrokes -- let DOSBox consume each

_PAGE_ADVANCE_SETTLE = 0.3

_USE_POTION     = 0x113                              # potion -> on = a party member

_USE_ORB        = 0x057                              # orb of the moons -> on = a 'where' (map dir)

_USE_DIR        = frozenset((0x067, 0x068, 0x09a))   # pick/shovel/telescope -> on = a direction

_USE_INSTRUMENT = frozenset((0x09d, 0x09c, 0x09e, 0x099, 0x128))  # -> on = a digit tune

_DOOR_LOCKED    = range(8, 0xc)                      # door frame band: locked (key, qual match)

_EQUIP_CELL = {0: (1, 0), 1: (0, 0), 2: (0, 1), 3: (0, 2),
               4: (2, 0), 5: (2, 1), 6: (2, 2), 7: (1, 2)}

_DRAIN_SETTLE = 0.5

_ARROW_DXY = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}

_U6_CHEST_TYPE = 0x062


def _begin_select(base_addr, letter, verb):
    """Enter a cursor command: wait for COMMAND_READY (the letter must land as a fresh
    command), press `letter`, confirm the cross-cursor came up (SELECTING). Returns an
    error string on failure, or None on success."""
    _wait_command_ready(base_addr)
    inp.send_key(letter)
    st, _ = _wait_state(base_addr, "SELECTING")
    if st != "SELECTING":
        return f"{verb}: '{letter.upper()}' did not enter select mode (state={st})."
    return None

def _walk_cursor(keys, commit_enter):
    """Walk the cross-cursor: press each key in `keys` a _CURSOR_STEP apart, then -- for
    a SelectRange=7 command -- press Enter to commit. For SelectRange=-1 the arrow
    itself auto-commits (commit_enter=False, no Enter). Reproduces the talk/look (Enter)
    and get/use (auto-commit; `here`=Enter) sequences."""
    for k in keys:
        time.sleep(_CURSOR_STEP)
        inp.send_key(k)
    if commit_enter:
        time.sleep(_CURSOR_STEP)
        inp.send_key("enter")

def _blind_cursor_cmd(verb, letter, keys, commit_enter):
    """Not-hooked fallback for a cursor command: press the letter, the cursor keys, then
    (if commit_enter) Enter -- ungated best-effort, no state gate. Returns the result
    string."""
    inp.send_key(letter); time.sleep(0.15)
    for k in keys:
        inp.send_key(k); time.sleep(_CURSOR_STEP)
    if commit_enter:
        inp.send_key("enter")
    seq = "+".join([letter, *keys] + (["enter"] if commit_enter else []))
    return f"{verb}: sent {seq} blind (not hooked)."

def _guarded_send(base_addr, key, want, timeout=2.5):
    """Send `key`, then poll until confirmed. `want` is a state name / an iterable of
    names (checked against _input_state) OR a zero-arg predicate () -> bool that reads
    whatever memory it needs. Returns (ok, last_state). The receipt is the read."""
    inp.send_key(key)
    if callable(want):
        test = want
    else:
        targets = (want,) if isinstance(want, str) else tuple(want)
        test = lambda: _input_state(base_addr)[0] in targets
    deadline = time.time() + timeout
    ok = test()
    while not ok and time.time() < deadline:
        time.sleep(0.03)
        ok = test()
    return ok, _input_state(base_addr)[0]

def _abort_to_ready(base_addr, cap=8):
    """Universal bail: ESC -> drain to COMMAND_READY (the engine's own cancel -- first
    ESC clears SelectMode, the next clears MouseMode). Bounded; returns the final state.
    A USE that aborts BEFORE its commit costs no turn, so bailing is cheap and safe."""
    for _ in range(cap):
        state, _ = _input_state(base_addr)
        if state == "COMMAND_READY":
            return state
        inp.send_key("esc")
        time.sleep(_CURSOR_STEP)
    return _input_state(base_addr)[0]

@mcp.tool()
def u6_move(direction: str) -> str:
    """Ultima VI: step the party one tile. direction = n/s/e/w (also
    north/south/east/west or up/down/left/right). Sends the arrow key via
    SendInput (DOSBox focused first). Verify the binding live."""
    key = _U6_DIR.get(direction.strip().lower())
    if not key:
        return f"Unknown direction {direction!r}. Use n/s/e/w."
    b = _session_base()
    if b is not None:
        _wait_command_ready(b)          # act only on our turn (input is buffered)
    return inp.send_key(key)

@mcp.tool()
def u6_talk(direction: str) -> str:
    """Ultima VI: open a conversation with the NPC in `direction` (n/s/e/w, or a
    diagonal ne/nw/se/sw). TALK is a CURSOR-targeting command like LOOK (source
    seg_0A33.c:1061 -- SelectMode=1, SelectRange=7): it presses 'T', walks the
    cross-cursor onto the NPC's tile, then ENTER to commit (Enter->CMD_8E at
    seg_0C9C.c:1206; arrows only move the cursor, they do NOT commit). On a valid NPC
    this starts a conversation
    (IsInConversation=1 -> state CONVERSATION); then poll u6_conversation() and reply
    with u6_say()/u6_key(). Turn-gated."""
    arrows = _U6_DIR8.get(direction.strip().lower())
    if not arrows:
        return (f"Unknown direction {direction!r}. Use n/s/e/w or a diagonal "
                f"(ne/nw/se/sw).")
    b = _session_base()
    if b is None:                                    # not hooked: best-effort blind
        return _blind_cursor_cmd(f"talk {direction}", "t", arrows, True)
    err = _begin_select(b, "t", f"talk {direction}")  # 'T' as a fresh command -> SELECTING
    if err:
        return err
    _walk_cursor(arrows, True)                        # onto the NPC, then Enter -> TALK_talkTo
    state, _ = _wait_state(b, ("CONVERSATION", "COMMAND_READY"), timeout=3.0)
    if state == "CONVERSATION":
        return (f"talk {direction}: conversation started. "
                f"Poll u6_conversation(); reply with u6_say()/u6_key().")
    state, _ = _drain_to_ready(b)                     # clear any "no response" message
    return (f"talk {direction}: no conversation (now {state}). "
            f"Is a talkable NPC adjacent that way?")

@mcp.tool()
def u6_look(direction: str) -> str:
    """Ultima VI: LOOK at the adjacent tile in `direction` (n/s/e/w, or a diagonal
    ne/nw/se/sw). LOOK is a CURSOR-targeting command (source seg_0A33.c:1070 --
    SelectMode=1, SelectRange=7, so the cursor may move diagonally and up to 7 tiles):
    it presses 'L', walks the cross-cursor onto the target tile, then ENTER to
    commit (Enter->CMD_8E at seg_0C9C.c:1206). The result prints to the message scroll
    -- an NPC shows name + portrait, an object its name/weight, a container/book its
    contents (which can span several pages). This drives the whole sequence and then
    DRAINS the result back to COMMAND_READY (dismiss key = Enter) so variable-length
    output needs no key-counting. Because the agent cannot read the scroll, the return
    also lists the NOTABLE objects (weight>0 or readyable) now on the looked tile: LOOK's
    search surfaces a corpse/container's hidden items to LOCXYZ, and reading that state
    is the agent's real result (e.g. a looted corpse's club/helm appear here). Floor and
    scenery are omitted (use u6_walkable for terrain). Turn-gated."""
    arrows = _U6_DIR8.get(direction.strip().lower())
    if not arrows:
        return (f"Unknown direction {direction!r}. Use n/s/e/w or a diagonal "
                f"(ne/nw/se/sw).")
    b = _session_base()
    if b is None:                                    # not hooked: best-effort blind
        return _blind_cursor_cmd(f"look {direction}", "l", arrows, True)
    err = _begin_select(b, "l", f"look {direction}")  # 'L' as a fresh command -> SELECTING
    if err:
        return err
    _walk_cursor(arrows, True)                        # onto the target tile, then Enter (commit)
    state, pages = _drain_to_ready(b)                 # dismiss the result page(s)
    # The agent can't read the scroll, so report the notable objects now on the looked
    # tile -- LOOK's search surfaces a corpse/container's hidden items to LOCXYZ, and
    # that state change IS the readable result.
    note = ""
    try:
        tx, ty, z0 = _target_tile(b, arrows)
        items = _notable_at_tile(b, tx, ty, z0)
        if items:
            desc = ", ".join(
                f"{name} (0x{i:03x} type{typ} w{wt}"
                + ("" if e < 0 else f" {_EQUIP_SLOT_NAME[e]}") + ")"
                for i, name, typ, wt, e in items)
            note = f" Notable at ({tx},{ty}): {desc}."
        else:
            note = f" No notable objects at ({tx},{ty})."
    except OSError:
        note = ""
    return f"look {direction}: committed; dismissed {pages} page(s); now {state}.{note}"

@mcp.tool()
def u6_get(direction: str) -> str:
    """Ultima VI: GET (pick up) the object on the adjacent tile in `direction`
    (n/s/e/w). GET is adjacent-ONLY (source seg_0A33.c:1079 -- SelectMode=1,
    SelectRange=-1), so the direction arrow AUTO-COMMITS to that tile -- NO Enter is
    sent (seg_0C9C.c:1242: SelectRange==-1 -> CMD_8E on the arrow). This presses 'G',
    sends the arrow to commit, then drains the result message back to COMMAND_READY.
    The avatar must be next to the object and within the carry cap (see
    u6_roster_status); on success the object's CoordUse flips LOCXYZ -> INVEN
    (assoc = the member). Confirm via u6_inventory / u6_object(slot). Turn-gated."""
    key = _U6_DIR.get(direction.strip().lower())
    if not key:
        return (f"Invalid GET direction {direction!r}. GET is adjacent-only "
                f"(cardinal n/s/e/w) -- its arrow auto-commits (SelectRange=-1), so "
                f"diagonal/far tiles aren't reachable by keyboard.")
    b = _session_base()
    if b is None:                                    # not hooked: best-effort blind
        return _blind_cursor_cmd(f"get {direction}", "g", [key], False)
    err = _begin_select(b, "g", f"get {direction}")   # 'G' as a fresh command -> SELECTING
    if err:
        return err
    _walk_cursor([key], False)                        # the arrow auto-commits (SelectRange==-1)
    state, msgs = _drain_to_ready(b)                  # clear the result message(s)
    return (f"get {direction}: committed; cleared {msgs} message(s); now {state}. "
            f"Confirm pickup via u6_inventory / u6_object.")

def _find_matching_key(base_addr, member_slot, lock_qual):
    """The member's owned key that opens a lock of `lock_qual` (an OBJ_040 with qual ==
    lock_qual, qual != 0; or a lockpick OBJ_03F on a qual-0 lock) -- searching CONTAINED
    items too (a key inside a bag still belongs to the member). Returns
    (key_slot, container_slot): container_slot is -1 when the key is held DIRECTLY
    (INVEN/EQUIP, so USE can reach it), else the bag/chest it sits inside (the agent must
    take it out first -- USE can't target a contained item). (-1, -1) if none owned. The
    agent does the ownership/qual check the engine skips (seg_27a1.c:1410)."""
    status = dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS)
    pos    = dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3)
    shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    amount = dm.read(S.handle, base_addr + U6_Amount, U6_MAX_SLOTS * 2)

    def owner(slot):
        """Walk the held-by chain (INVEN/EQUIP/CONTAINED assoc) up to the < 0x100 holder
        -- a member slot, or a world slot if the chain roots in a ground container."""
        for _ in range(64):
            if slot < 0x100 or not (status[slot] & 0x18):
                break
            slot = pos[slot * 3] | (pos[slot * 3 + 1] << 8)
        return slot

    for i in range(0x100, U6_MAX_SLOTS):
        cu = status[i] & 0x18
        if cu not in (0x08, 0x10, 0x18):                  # CONTAINED / INVEN / EQUIP
            continue
        typ = (shape[i * 2] | (shape[i * 2 + 1] << 8)) & 0x3ff
        qual = amount[i * 2 + 1]
        if not ((lock_qual and typ == 0x040 and qual == lock_qual)
                or (not lock_qual and typ == 0x03f)):
            continue
        if owner(i) != member_slot:                       # not in this member's possession
            continue
        container = (pos[i * 3] | (pos[i * 3 + 1] << 8)) if cu == 0x08 else -1
        return i, container
    return -1, -1

def _resolve_member(base_addr, on):
    """`on` -> a party-select digit '1'..'8' (route 3: a digit selects Party[n-1],
    seg_0C9C.c:1298). Accepts a digit or a member NAME (matched against Names[]).
    Returns the digit char, or None."""
    on = (on or "").strip()
    if on in tuple("12345678"):
        return on
    if not on:
        return None
    psize = _rd8(base_addr + U6_PartySize)
    for i in range(min(psize, 8)):
        nm = dm.read(S.handle, base_addr + U6_Names + i * 14, 14).split(b"\x00", 1)[0]
        if nm.decode("latin-1", "replace").lower() == on.lower():
            return str(i + 1)
    return None

def _parse_slot(t):
    """A USE target string -> an inventory object slot int, or None if it's a map
    direction. Accepts `inv:0x305` / `inv:773` / `0x305` / `773`."""
    s = t[4:] if t.startswith("inv:") else t
    try:
        if s.startswith("0x"):
            return int(s, 16)
        if s.isdigit():
            return int(s)
    except ValueError:
        pass
    return None

def _panel_commit(base_addr, member_index, command, locate, confirm):
    """Shared status-panel drive for inventory-target commands (USE-on-item, READY/
    UNREADY) -- the only route to an inventory target. Opens the target member's
    INVENTORY panel robustly, then drives the cursor. Steps, each confirmed by a memory
    read:
      OPEN (the view left by the prior action is NOT deterministic -- esp. after a
      conversation it may be PORTRAIT or INVENTORY -- and F<member> only opens INVENTORY
      from the ROSTER/INVENTORY view; from PORTRAIT it just swaps the portrait's member,
      seg_0C9C.c:1345-1371): '/' (only if not already roster) -> roster CMD_91;
      F<member+1> -> that member's INVENTORY (CMD_92), setting D_04B3=member DIRECTLY so
      any party member works, not just the Avatar (:1369-1371); '*' (defensive, only if
      it somehow landed in PORTRAIT) -> INVENTORY (:1351).
      THEN: `locate()` finds the target's cursor cell (col,row) in the now-shown panel
      (or None); [`command` -> SELECTING, for a verb like USE; None for the command-less
      Ready toggle]; <tab> -> panel cursor (SelectMode==2 -- arriving via F<member> into
      CMD_92, this TAB skips the D_04B3=Active reset gated on StatusDisplay!=CMD_92 at
      :1185, so a non-Avatar target is preserved); **WRITE D_0499/D_049A to the cell**
      (the Enter redraw C_0C9C_1AE5(2) sets PointerX/Y = D_054B[col]/D_0559[row][col], so
      the write lands exactly); <enter> -> `confirm()`.
    Any mismatch ESC-aborts to COMMAND_READY (a command that aborts before its effect
    costs no turn). Returns (ok, err)."""
    # A prior panel op leaves the cursor armed (SelectMode=2); the open keys are only
    # interpreted from a clean COMMAND_READY, so clear any lingering select mode first
    # (also the per-tool postcondition, belt-and-suspenders against a dirty entry).
    _abort_to_ready(base_addr)
    # OPEN: normalize to roster, then F<member> -> that member's INVENTORY (CMD_92).
    sd = lambda: _rd16(base_addr + U6_StatusDisplay)
    if sd() != 0x91:                                       # CMD_91 = roster
        ok, _ = _guarded_send(base_addr, "/", lambda: sd() == 0x91)
        if not ok:
            _abort_to_ready(base_addr)
            return False, "could not reach the roster view to open the panel (StatusDisplay != CMD_91)"
    fkey = f"f{member_index + 1}"                          # F1..F8 -> that member's INVENTORY
    _guarded_send(base_addr, fkey, lambda: sd() in (0x90, 0x92))
    if sd() == 0x90:                                       # defensive: F landed in PORTRAIT
        _guarded_send(base_addr, "*", lambda: sd() == 0x92)
    if sd() != 0x92:
        _abort_to_ready(base_addr)
        return False, (f"could not open member {member_index}'s INVENTORY view "
                       f"(F{member_index + 1}; StatusDisplay=0x{sd():04x})")
    cell = locate()
    if cell is None:
        _abort_to_ready(base_addr)
        return False, "target not on the panel (a carried item must be on the visible backpack page -- scroll first)"
    col, row = cell
    if command:
        ok, _ = _guarded_send(base_addr, command, "SELECTING")
        if not ok:
            _abort_to_ready(base_addr); return False, f"'{command.upper()}' did not enter select mode"
    # Arm the panel cursor. In the INVENTORY view (CMD_92) a SINGLE TAB sets SelectMode=2
    # directly (seg_0C9C.c:1313-1316: TAB in CMD_92 -> 2; and a map-select(1) -> 2 too).
    # Reliable because the clean entry (SelectMode=0) above means the open lands squarely
    # in CMD_92 before this TAB.
    sm = lambda: _rd8(base_addr + U6_SelectMode)
    if sm() != 2:
        _guarded_send(base_addr, "tab", lambda: sm() == 2)
    if sm() != 2:
        _abort_to_ready(base_addr); return False, "<tab> did not arm the panel cursor (SelectMode != 2)"
    dm.write(S.handle, base_addr + U6_PanelCol, bytes([col]))
    dm.write(S.handle, base_addr + U6_PanelRow, bytes([row]))
    ok, _ = _guarded_send(base_addr, "enter", confirm)
    if not ok:
        _abort_to_ready(base_addr); return False, "commit did not take effect"
    return True, ""

def _select_backpack_item(base_addr, member_index, target_slot):
    """USE-commit on `target_slot` in member `member_index`'s backpack: _panel_commit
    with the 'u' command, the backpack cell, and confirm = Selection.obj == target."""
    def locate():
        pack = _visible_backpack(base_addr)
        if target_slot not in pack:
            return None
        r, c = divmod(pack.index(target_slot), U6_BACKPACK_COLS)
        return (c + 3, r)             # backpack col c -> cursor col c+3 (cols 0-2 = equip silhouette)
    return _panel_commit(base_addr, member_index, "u", locate,
                         lambda: _rd16s(base_addr + U6_Sel_obj) == target_slot)

def _use_key_flow(base_addr, keys, door, label):
    """Open a LOCKED door (frame 8-0xB) by USE-ing the matching key: find the owned key
    (the qual/ownership check the engine skips), select it in the panel, then the
    engine's "On " prompt (C_27A1_2D8E) targets the door -- the arrow auto-commits
    (SelectRange=-1 from 'U')."""
    slot, _typ, _frame, qual = door
    ai = _controlled_slot(base_addr)[1]
    member_slot = _party_member_slot(base_addr, ai)
    key, container = _find_matching_key(base_addr, member_slot, qual)
    if key < 0:
        need = f"a key (OBJ_040) of qual {qual}" if qual else "a lockpick (OBJ_03F)"
        return f"{label}: door locked (qual={qual}); no matching {need} in inventory."
    if container >= 0:                                          # key exists but is in a bag/chest
        return (f"{label}: door locked (qual={qual}); the matching key {_obj_name(base_addr, key)} "
                f"(0x{key:03x}) is INSIDE {_obj_name(base_addr, container)} (0x{container:03x}) -- "
                f"take it out of the container first (USE can't reach a contained item).")
    ok, err = _select_backpack_item(base_addr, ai, key)
    if not ok:
        return f"{label}: locked door; couldn't select the key -- {err}"
    st, _ = _wait_state(base_addr, "SELECTING", timeout=2.0)   # the "On <target>" prompt
    if st != "SELECTING":
        _abort_to_ready(base_addr)
        return f"{label}: key selected but the 'On <target>' prompt didn't appear (state={st})."
    inp.send_key(keys[0] if keys else "enter")                 # the door direction (auto-commits)
    state, _ = _drain_to_ready(base_addr)
    nframe = _obj_tfq(base_addr, slot)[1]
    verdict = f"unlocked (frame {nframe})" if nframe < 8 else f"still locked (frame {nframe})"
    return f"{label}: used key 0x{key:03x} on the door -> {verdict}; now {state}."

def _use_map(base_addr, keys, self_use, on, label):
    """Map-tile USE: a plain USE on the target tile -- EXCEPT a LOCKED door, where the
    tool auto-runs the key flow (find the matching owned key, drive U->key->door)."""
    try:
        tx, ty, tz = _target_tile(base_addr, keys)
        door = _door_at_tile(base_addr, tx, ty, tz)
    except OSError:
        door = None
    if door and door[2] in _DOOR_LOCKED:
        return _use_key_flow(base_addr, keys, door, label)
    err = _begin_select(base_addr, "u", label)
    if err:
        return err
    _walk_cursor(keys, self_use)                               # commit on the target tile
    state, msgs = _drain_to_ready(base_addr)
    note = ""
    try:
        tx, ty, tz = _target_tile(base_addr, keys)
        items = _use_result_at_tile(base_addr, tx, ty, tz)
        note = (f" Now at ({tx},{ty}): " + "; ".join(items) + "."
                if items else f" No notable objects at ({tx},{ty}).")
    except OSError:
        note = ""
    return f"{label}: committed; cleared {msgs} message(s); now {state}.{note}"

def _use_inventory(base_addr, slot, on):
    """USE a CARRIED item (`slot` from u6_inventory / u6_panel_state): drive the panel
    select, then supply any second SEMANTIC input the item needs from `on` (potion ->
    member, orb -> where, pick/shovel/telescope -> direction, instrument -> digit tune);
    single-use items (food/drink/torch/gem/...) just drain. If a needed `on` is missing
    it ESC-aborts (no turn) and asks -- it never guesses."""
    try:
        ai = _controlled_slot(base_addr)[1]
        typ, frame, _q = _obj_tfq(base_addr, slot)
        name = _obj_name(base_addr, slot)
    except OSError as ex:
        return f"use inv 0x{slot:03x}: read failed ({ex})."
    label = f"use {name} (0x{slot:03x})"
    ok, err = _select_backpack_item(base_addr, ai, slot)
    if not ok:
        return f"{label}: {err}"
    second = ""
    if typ == _USE_POTION:
        m = _resolve_member(base_addr, on)
        if not m:
            _abort_to_ready(base_addr)
            return f"{label}: a potion needs a target -- re-call with on=<member 1..8 or name>."
        inp.send_key(m); second = f" on member {m}"
    elif typ == _USE_ORB:
        a = _U6_DIR.get(on)
        if not a:
            _abort_to_ready(base_addr)
            return f"{label}: the orb needs a destination -- re-call with on=<n/s/e/w>."
        inp.send_key(a); second = f" where={on}"
    elif typ in _USE_DIR:
        a = _U6_DIR.get(on)
        if not a:
            _abort_to_ready(base_addr)
            return f"{label}: needs a direction -- re-call with on=<n/s/e/w>."
        inp.send_key(a); second = f" dir={on}"
    elif typ in _USE_INSTRUMENT:
        for ch in on:
            if ch.isdigit():
                inp.send_key(ch); time.sleep(_CURSOR_STEP)
        inp.send_key("enter"); second = f" tune={on!r}"
    state, _ = _drain_to_ready(base_addr)
    ntyp, nframe, _nq = _obj_tfq(base_addr, slot)
    res = ("consumed" if ntyp == 0 else
           f"frame {frame}->{nframe}" if nframe != frame else "used")
    return f"{label}{second}: {res}; now {state}."

@mcp.tool()
def u6_use(target: str, on: str = "") -> str:
    """Ultima VI: USE an object. `target` is EITHER a MAP tile -- a cardinal direction
    (n/s/e/w) or `here`/`self` for the tile you stand on (ladders) -- OR a CARRIED item
    by object slot: `inv:0x305` / `inv:773` / `0x305` / `773` (get the slot from
    u6_inventory / u6_panel_state). The tool absorbs the keyboard mechanism; the agent
    supplies a SEMANTIC choice via `on=` only when an item needs one:
      * a LOCKED door (map target): NO `on` -- the tool auto-finds the matching owned
        key (OBJ_040, qual match; or a lockpick on a qual-0 lock) and drives
        U->key->door, so the door 'just opens' (or it reports no matching key).
      * a potion: on=<member 1..8 or name>.  * the orb: on=<n/s/e/w> ('where').
      * pick/shovel/telescope: on=<n/s/e/w>.  * an instrument: on=<digits 0-9> (tune).
    Single-use items (food/drink/torch/gem/book) and unlocked map objects need no `on`.
    If a required `on` is missing the tool ESC-aborts (no turn spent) and asks -- it
    never guesses. The inventory route drives the status panel (normalize to roster ->
    F<member> -> INVENTORY view, <tab> -> panel cursor, Enter -> commit), each step confirmed by a memory read
    (the agent can't see the screen). The return reports the resulting STATE (door
    open/closed/locked, item consumed / frame change). Sources: dispatch seg_0A33.c:1115,
    handler C_27A1_6179, key C_27A1_2D8E:1410, panel C_155D_1267. Turn-gated."""
    t = target.strip().lower()
    b = _session_base()
    slot = _parse_slot(t)
    if slot is not None:                              # carried-item USE (the panel route)
        if b is None:
            return f"use inv 0x{slot:03x}: not hooked (inventory USE needs the panel state)."
        return _use_inventory(b, slot, on.strip())
    self_use = t in ("here", "self", "@")             # map-tile USE
    arrow = None if self_use else _U6_DIR.get(t)
    if not self_use and not arrow:
        return (f"Invalid USE target {target!r}. Use a map tile (n/s/e/w or here/self) "
                f"or a carried item (inv:<slot> / 0x... / a slot number).")
    keys = [] if self_use else [arrow]
    if b is None:                                     # not hooked: best-effort blind
        return _blind_cursor_cmd(f"use {t}", "u", keys, self_use)
    return _use_map(b, keys, self_use, on.strip(), f"use {t}")

@mcp.tool()
def u6_ready(target: str) -> str:
    """Ultima VI: READY (equip) a carried item, or UNREADY (take off) an equipped one
    -- the inventory-panel toggle. Ready is NOT a letter command (R is Rest); it's the
    panel interaction the manual describes: <tab> to the panel, move to the item, <enter>
    to ready/unready. `target` = an object slot (`inv:0x305` / `0x305` / `773`, from
    u6_inventory / u6_panel_state). The tool reads the item's holder + current state and
    figures out the rest: which party member's panel to open, and whether to READY
    (INVEN->EQUIP, a backpack item) or UNREADY (EQUIP->INVEN, an equipped item). It then
    drives the panel (normalize to roster -> F<member> -> INVENTORY, <tab> -> cursor,
    place on the item's cell, <enter> -> C_155D_144B Ready / C_155D_1738 Unready), each
    step confirmed by a memory read, and leaves the panel. Result = the item's CoordUse flip. A READY can be refused
    by the engine (no equip slot / too heavy > STR*10 / that slot occupied -- printed to
    the scroll the agent can't see); the tool detects the no-flip and says so, and the
    agent can diagnose via u6_object (equip-slot), u6_roster_status (STR*10 cap), and
    u6_panel_state (which slots are occupied). Ready is a free action (no turn). DS from
    u6_hook."""
    b = _session_base()
    if b is None:
        return "ready: not hooked (panel state needed)."
    slot = _parse_slot(target.strip().lower())
    if slot is None:
        return (f"Invalid ready target {target!r}. Give an object slot "
                f"(inv:<slot> / 0x.. / a number) from u6_inventory / u6_panel_state.")
    try:
        cu = _rd8(b + U6_ObjStatus + slot) & 0x18
        assoc = _rd16(b + U6_ObjPos + slot * 3)           # INVEN/EQUIP: first 2 bytes = holder slot
        name = _obj_name(b, slot)
    except OSError as ex:
        return f"ready 0x{slot:03x}: read failed ({ex})."
    if cu not in (0x10, 0x18):
        return (f"ready {name} (0x{slot:03x}): not in a member's inventory "
                f"(CoordUse=0x{cu:02x}) -- only a carried or worn item can be readied.")
    mi = _holder_party_index(b, assoc)
    if mi < 0:
        return f"ready {name} (0x{slot:03x}): its holder (slot 0x{assoc:03x}) isn't a party member."

    if cu == 0x10:                                         # INVEN -> READY (equip)
        def locate():
            pack = _visible_backpack(b)
            if slot not in pack:
                return None
            r, c = divmod(pack.index(slot), U6_BACKPACK_COLS)
            return (c + 3, r)
        equipped = lambda: (_rd8(b + U6_ObjStatus + slot) & 0x18) == 0x18
        ok, err = _panel_commit(b, mi, None, locate, equipped)
        _abort_to_ready(b)                                 # Ready stays in the panel -> ESC out
        if equipped():
            return f"ready {name} (0x{slot:03x}): equipped (INVEN -> EQUIP) on member {mi + 1}."
        return (f"ready {name} (0x{slot:03x}): NOT equipped -- {err}. If the panel drove OK, "
                f"the engine refused (no equip slot / too heavy / that slot occupied); check "
                f"u6_object equip-slot, u6_roster_status STR*10 cap, u6_panel_state free slot.")

    # EQUIP -> UNREADY (take off)
    def locate():
        equip = dm.read(S.handle, b + U6_Equipment, 8 * 2)
        for s in range(8):
            if (equip[s * 2] | (equip[s * 2 + 1] << 8)) == slot:
                return _EQUIP_CELL[s]
        return None
    stowed = lambda: (_rd8(b + U6_ObjStatus + slot) & 0x18) == 0x10
    ok, err = _panel_commit(b, mi, None, locate, stowed)
    _abort_to_ready(b)
    if stowed():
        return f"unready {name} (0x{slot:03x}): taken off (EQUIP -> INVEN) on member {mi + 1}."
    return (f"unready {name} (0x{slot:03x}): NOT removed -- {err} "
            f"(a cursed/locked item can't be unreadied).")

def _advance_conv_input(base_addr, max_pages=8):
    """Clear any '*' page-pause(s) blocking the keyword prompt so a typed reply's
    leading char isn't eaten advancing a page. Sends ENTER only WHILE a page-pause is
    showing (PromptCh==1); stops the instant CON_gets is live (D_049B==1) and NEVER
    sends a key once D_049B==1 (that would submit an empty line / exit). Also returns
    early on a non-paused single-key prompt (PromptCh!=1, D_049B!=1 -- nothing to
    clear). Returns the number of pages advanced."""
    pages = 0
    for _ in range(max_pages):
        if _rd8(base_addr + U6_LineInput) == 1:        # keyword line input is live
            break
        if _rd16(base_addr + U6_PromptCh) != 1:        # no page-pause -> nothing to clear
            break
        inp.send_key("enter")                          # dismiss this page
        pages += 1
        time.sleep(_PAGE_ADVANCE_SETTLE)
    return pages

@mcp.tool()
def u6_say(text: str, segment: int = -1) -> str:
    """Ultima VI: answer the current conversation prompt. First advances past any '*'
    page-pause so the leading char isn't eaten dismissing a page (a long greeting/
    reply pauses for a keypress -- see _advance_conv_input), then peeks the
    converse-VM opcode at Talk_PC: at a single-key prompt (GET/GETCHR/GETDIGIT/WAIT)
    it sends just the first character; otherwise (ASKTOP/GETSTR/GETINT) it types
    `text` + Enter. Falls back to line input if the VM state can't be read. DS from
    u6_hook."""
    single, pages = False, 0
    if S.membase is not None:
        ds, err = _ds(segment)
        if not err:
            base_addr = S.membase + (ds << 4)
            try:
                if dm.read(S.handle, base_addr + U6_IsInConversation, 1)[0]:
                    pages = _advance_conv_input(base_addr)   # clear page-pauses first
                pc = int.from_bytes(dm.read(S.handle, base_addr + U6_Talk_PC, 2), "little")
                fp = dm.read(S.handle, base_addr + U6_TalkBuf_ptr, 4)
                tb_lin = ((fp[2] | (fp[3] << 8)) << 4) + (fp[0] | (fp[1] << 8))
                op = dm.read(S.handle, S.membase + tb_lin + pc, 1)[0]
                single = op in _TALK_SINGLEKEY_OPS
            except OSError:
                pass
    adv = f" (advanced {pages} page-pause(s))" if pages else ""
    if single:
        ch = text[:1]
        return f"[single-key]{adv} {inp.send_key(ch if ch else 'enter')}"
    out = inp.send_text(text)
    ent = inp.send_key("enter")
    return f"[line]{adv} {out} [{ent}]"

@mcp.tool()
def u6_key(key: str) -> str:
    """Ultima VI: send one keypress (for single-key conversation prompts, menus,
    or any raw key). `key` = a single char or a name (enter/esc/space/up/...)."""
    return inp.send_key(key)

def _wait_state(base_addr, targets, timeout=2.5, poll=0.03):
    """Block until _input_state is one of `targets` (a str or an iterable of states),
    else return the last-seen (state, flags) on timeout. Lets a cursor-command verb
    wait for the cross-cursor to come up (SELECTING) or for a talk to land
    (CONVERSATION) before it sends the next keystroke."""
    if isinstance(targets, str):
        targets = (targets,)
    deadline = time.time() + timeout
    state, flags = _input_state(base_addr)
    while state not in targets and time.time() < deadline:
        time.sleep(poll)
        state, flags = _input_state(base_addr)
    return state, flags

def _drain_to_ready(base_addr, key="enter", cap=40, settle=_DRAIN_SETTLE):
    """Dismiss whatever result/page waits a look/get/talk left behind, until the engine
    is back at the top-level command prompt (COMMAND_READY) -- count-free, by state.

    Every read is taken AFTER a `settle` pause, so it reflects the engine's RESTING state
    rather than a mid-redraw transient -- and a transient (the processing/redraw between
    the handler returning and the prompt coming back) has resolved to COMMAND_READY by
    read time. So ANY non-COMMAND_READY state we still see after settling is a genuine
    "press a key to continue" wait and gets an Enter. Those waits come in two flavors:
      - MOUSE_MODE: the NPC-look portrait/inventory getch, run while the dispatch's
        MouseMode=1 (seg_0A33.c:1248) is still set (seg_27a1.c:258).
      - BUSY (all flags 0): a container / empty-corpse look's down-arrow prompt, e.g.
        the "Searching here, you find nothing." page (seg_27a1.c:507-509).
    COMMAND_READY (AllowMouseMov=1, raised ONLY at the top-level getch, seg_0A33.c:1029)
    is the exact, count-free end signal -- a 2-item and a 20-item container end there
    alike. A stray re-entered command (SELECTING) is cancelled with ESC x2 rather than
    committed. `cap` bounds total iterations. If a slower box still over-fires, raise
    _DRAIN_SETTLE (0.5 -> 1.0)."""
    sent = 0
    time.sleep(settle)                          # let the just-committed result finish drawing
    for _ in range(cap):
        state, _ = _input_state(base_addr)
        if state == "COMMAND_READY":
            break
        if state == "SELECTING":                # a command got re-entered -> cancel it
            inp.send_key("esc"); time.sleep(0.12)
            inp.send_key("esc")
        else:                                   # MOUSE_MODE or BUSY: a real dismiss wait
            inp.send_key(key)
            sent += 1
        time.sleep(settle)                      # so the next read is of the RESTING state
    state, _ = _input_state(base_addr)
    return state, sent

def _target_tile(base_addr, keys):
    """The world tile the cursor lands on for a cursor command whose walk is `keys`
    (an _U6_DIR8/_U6_DIR arrow list; an empty list = the controlled actor's own tile).
    Sums the per-arrow deltas onto the controlled actor's position. Shared by the
    LOOK/USE result read-back."""
    x0, y0, z0 = _controlled_xyz(base_addr)
    dx = sum(_ARROW_DXY[k][0] for k in keys)
    dy = sum(_ARROW_DXY[k][1] for k in keys)
    return x0 + dx, y0 + dy, z0

def _notable_at_tile(base_addr, tx, ty, tz, cap=12):
    """World objects (LOCXYZ, slot >= 0x100) on tile (tx,ty,tz) that the agent would ACT
    on -- weight>0 (carryable) OR readyable (has an equip slot). Floor/scenery (weight 0,
    not readyable) is dropped: the agent has u6_walkable for terrain and never decides on
    floor type. Returns decoded (slot, name, type, weight, eslot) tuples (name from the
    LOOK.LZD table via _tile_name), capped at `cap`. This is the perception path for a
    LOOK/search result -- LOOK surfaces hidden/contained items to LOCXYZ, and reading
    that change here is how the agent 'sees' the loot (the 'you find a ...' scroll text
    is invisible to it)."""
    status = dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS)
    pos = dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3)
    shape = dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    basetile, tw, weapons = _gear_tables(base_addr)
    out = []
    for i in range(0x100, U6_MAX_SLOTS):
        if (status[i] & 0x18) != 0:                  # not LOCXYZ (held/contained/equipped)
            continue
        sh = shape[i * 2] | (shape[i * 2 + 1] << 8)
        typ = sh & 0x3ff
        if typ == 0:                                 # empty slot
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        if (v & 0x3ff) != tx or ((v >> 10) & 0x3ff) != ty or ((v >> 20) & 0xf) != tz:
            continue
        tile, wt, eslot = _gear_of(sh, basetile, tw, weapons)
        if wt <= 0 and eslot < 0:                     # floor/scenery -> not actionable
            continue
        out.append((i, _tile_name(tile), typ, wt, eslot))  # name via LOOK.LZD table
        if len(out) >= cap:
            break
    return out

def _use_result_at_tile(base_addr, tx, ty, tz, cap=12):
    """LOCXYZ objects on tile (tx,ty,tz) after a USE, reported as the STATE the agent
    needs to read back -- it can't see the "opened!"/"locked" scroll. Doors
    (0x129-0x12C) and chests (0x062) always report their open/closed/locked frame state
    (and, when locked with a nonzero qual, the lock-id a matching key OBJ_040 must
    carry); other objects report only if actionable (weight>0 or readyable), so floor /
    scenery is dropped (u6_walkable covers terrain). Returns human strings, capped at
    `cap`."""
    status = dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS)
    pos    = dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3)
    shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    amount = dm.read(S.handle, base_addr + U6_Amount, U6_MAX_SLOTS * 2)
    basetile, tw, weapons = _gear_tables(base_addr)
    out = []
    for i in range(0x100, U6_MAX_SLOTS):
        if (status[i] & 0x18) != 0:                  # not LOCXYZ (held/contained/equipped)
            continue
        sh = shape[i * 2] | (shape[i * 2 + 1] << 8)
        typ = sh & 0x3ff
        if typ == 0:                                 # empty slot
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        if (v & 0x3ff) != tx or ((v >> 10) & 0x3ff) != ty or ((v >> 20) & 0xf) != tz:
            continue
        frame = sh >> 10
        qual = amount[i * 2 + 1]                      # high byte of Amount = qual (lock-id)
        tile, wt, eslot = _gear_of(sh, basetile, tw, weapons)
        name = _tile_name(tile)
        if typ in _U6_DOOR_TYPES or typ == _U6_CHEST_TYPE:
            kind = "door" if typ in _U6_DOOR_TYPES else "chest"
            state, locked = (_door_state if kind == "door" else _chest_state)(frame)
            extra = f", key qual={qual}" if (locked and qual) else ""
            out.append(f"{name} (0x{i:03x} {kind}: {state}{extra})")
        elif wt > 0 or eslot >= 0:                    # actionable item (else floor/scenery)
            out.append(f"{name} (0x{i:03x} type{typ} frame{frame})")
        if len(out) >= cap:
            break
    return out

@mcp.tool()
def u6_talk_to(npc_slot: int, max_steps: int = 60, segment: int = -1) -> str:
    """Ultima VI: the demo one-liner -- u6_goto(npc) then open the conversation
    (T + direction). On success, poll u6_conversation() and reply with u6_say().
    DS from u6_hook unless overridden with segment=."""
    r = u6_goto(npc_slot, max_steps, segment)
    if S.membase is None:
        return r
    ds, err = _ds(segment)
    if err:
        return r
    base = S.membase + (ds << 4)
    try:
        x0, y0, _ = _controlled_xyz(base)
        nx, ny, _nz, _cu = _npc_xyz(base, npc_slot)
    except OSError:
        return r + "\n(could not re-read positions; talk skipped)"
    if abs(nx - x0) + abs(ny - y0) != 1:
        return r + "\n(not adjacent; talk skipped)"
    td = _dir_to(nx - x0, ny - y0)
    return f"{r}\n{u6_talk(td)}\nNow poll u6_conversation() and reply with u6_say()."


@mcp.tool()
def u6_use_object(target: str, max_steps: int = 40, segment: int = -1) -> str:
    """Ultima VI: CLOSED-LOOP "go to an object and USE it" -- the one-call version of
    the lever/crank dance from the castle-escape run (find a walkable cell adjacent to
    the object, route there, face it, USE). `target` is an object SLOT ('0x4e6' /
    '1254') or a NAME ('lever', 'crank' -- nearest match). The tool resolves the
    object's world cell, picks an adjacent WALKABLE cell (handling diagonally-placed
    mechanisms whose own neighbours are blocked by other objects), drives there with
    the closed-loop navigator (u6_goto_xy), then issues the cardinal USE in the
    object's direction (composing the existing u6_use map / inventory / key sub-flows).
    Removes the manual repositioning the agent had to do to reach the crank.
    PLANNED -- stub (#2 from the castle-escape experiment, 2026-06-27; not yet
    implemented)."""
    pass


__all__ = [
    "u6_use_object",
    "_USE_POTION",
    "_USE_ORB",
    "_USE_DIR",
    "_USE_INSTRUMENT",
    "_DOOR_LOCKED",
    "_U6_CHEST_TYPE",
    "_U6_DIR",
    "_U6_DIR8",
    "_TALK_SINGLEKEY_OPS",
    "_EQUIP_CELL",
    "_CURSOR_STEP",
    "_PAGE_ADVANCE_SETTLE",
    "_DRAIN_SETTLE",
    "_ARROW_DXY",
    "_begin_select",
    "_walk_cursor",
    "_blind_cursor_cmd",
    "_guarded_send",
    "_abort_to_ready",
    "u6_move",
    "u6_talk",
    "u6_look",
    "u6_get",
    "_find_matching_key",
    "_resolve_member",
    "_parse_slot",
    "_panel_commit",
    "_select_backpack_item",
    "_use_key_flow",
    "_use_map",
    "_use_inventory",
    "u6_use",
    "u6_ready",
    "_advance_conv_input",
    "u6_say",
    "u6_key",
    "_wait_state",
    "_drain_to_ready",
    "_target_tile",
    "_notable_at_tile",
    "_use_result_at_tile",
    "u6_talk_to",
]
