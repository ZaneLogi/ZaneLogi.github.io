"""u6.perceive -- read-only perception tools: avatar/party/input-state/roster,
NPCs & objects nearby, single-object decode, member inventory, and the status
panel view. All read guest RAM via the decoders; none send input.
"""

from u6.constants import *  # noqa: F401,F403
from u6.ctx import *        # noqa: F401,F403
from u6.decode import *     # noqa: F401,F403


@hot_tool
def u6_object(slot: int, segment: int = -1) -> str:
    """Ultima VI: decode one object/NPC slot from the parallel arrays
    (ObjStatus/ObjPos/ObjShapeType/Amount). Shows CoordUse + world x/y/z (LOCXYZ)
    or assoc holder (CONTAINED/INVEN/EQUIP), plus shape type/frame, quan/qual, and
    gear metadata (tile, weight, and the equip slot or 'not readyable'). DS comes
    from u6_hook unless you override it with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base_addr = S.membase + (ds << 4)
    try:
        st  = dm.read(S.handle, base_addr + U6_ObjStatus + slot, 1)[0]
        pos = dm.read(S.handle, base_addr + U6_ObjPos + slot * 3, 3)
        sh  = int.from_bytes(dm.read(S.handle, base_addr + U6_ObjShapeType + slot * 2, 2), "little")
        am  = int.from_bytes(dm.read(S.handle, base_addr + U6_Amount + slot * 2, 2), "little")
        basetile, tw, weapons = _gear_tables(base_addr)
    except OSError as ex:
        return f"Read failed for slot 0x{slot:x} (DS=0x{ds:04x}): {ex}"
    cu = st & 0x18
    V = pos[0] | (pos[1] << 8) | (pos[2] << 16)
    where = (f"x={V & 0x3ff} y={(V >> 10) & 0x3ff} z={(V >> 20) & 0xf}"
             if cu == 0 else f"assoc=0x{V & 0xffff:x}")
    tile, wt, eslot = _gear_of(sh, basetile, tw, weapons)
    name = _tile_name(tile)                                  # LOOK.LZD name for this tile
    ready = "not readyable" if eslot < 0 else f"ready->{_EQUIP_SLOT_NAME[eslot]}"
    return (f"slot 0x{slot:x} '{name}': status=0x{st:02x} {_COORDUSE.get(cu, '?')}  {where}  "
            f"type={sh & 0x3ff} frame={sh >> 10}  quan={am & 0xff} qual={am >> 8}  "
            f"tile={tile}  weight={wt}  {ready}")

@hot_tool
def u6_inventory(npc_slot: int, segment: int = -1,
                 max_slots: int = U6_MAX_SLOTS) -> str:
    """Ultima VI: list an NPC's inventory -- every object flagged INVEN or EQUIP
    whose assoc (holder slot) == npc_slot. Walks the whole object-slot range
    in-process and returns the decoded items (slot, INVEN/EQUIP, shape type,
    frame, quan, qual, and the LOOK.LZD name). The Avatar is its roster[0] slot
    (usually 1). DS comes from u6_hook unless you override it with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base_addr = S.membase + (ds << 4)
    try:
        status = dm.read(S.handle, base_addr + U6_ObjStatus, max_slots)
        pos    = dm.read(S.handle, base_addr + U6_ObjPos, max_slots * 3)
        shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, max_slots * 2)
        amount = dm.read(S.handle, base_addr + U6_Amount, max_slots * 2)
        basetile, tw, weapons = _gear_tables(base_addr)
    except OSError as ex:
        return f"Read failed walking object arrays (DS=0x{ds:04x}): {ex}"
    rows = []
    for i in range(min(max_slots, len(status))):
        cu = status[i] & 0x18
        if cu not in (0x10, 0x18):
            continue
        assoc = pos[i * 3] | (pos[i * 3 + 1] << 8)
        if assoc != npc_slot:
            continue
        sh = shape[i * 2] | (shape[i * 2 + 1] << 8)
        if (sh & 0x3ff) == 0:                                  # freed/empty slot (husk) -- no object
            continue
        am = amount[i * 2] | (amount[i * 2 + 1] << 8)
        tile, _wt, _es = _gear_of(sh, basetile, tw, weapons)   # tile -> LOOK.LZD name
        rows.append((i, "EQUIP" if cu == 0x18 else "INVEN",
                     sh & 0x3ff, sh >> 10, am & 0xff, am >> 8, _tile_name(tile)))
    if not rows:
        return f"No INVEN/EQUIP objects with assoc={npc_slot} (DS=0x{ds:04x})."
    out = [f"{len(rows)} item(s) held by NPC slot {npc_slot} (DS=0x{ds:04x}):",
           "  slot   use    type  frame  quan  qual  name"]
    for slot, use, typ, frame, quan, qual, name in rows:
        out.append(f"  0x{slot:03x}  {use:<5}  {typ:>4}  {frame:>5}  {quan:>4}  "
                   f"{qual:>4}  {name}")
    return "\n".join(out)

@hot_tool
def u6_container(slot: int, segment: int = -1, max_slots: int = U6_MAX_SLOTS) -> str:
    """Ultima VI: list the CONTENTS of a container (bag/chest/etc.) -- every object whose
    CoordUse is CONTAINED and whose assoc (holder) == `slot`, recursing into nested
    containers. This is the read u6_inventory CANNOT do: u6_inventory lists only INVEN/
    EQUIP items directly held by an NPC, so a carried bag's contents (and items left
    CONTAINED-under-a-member by a take-out-of-bag move) are invisible to it -- this closes
    that gap. Pure read; no keyboard. DS from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    b = S.membase + (ds << 4)
    try:
        status = dm.read(S.handle, b + U6_ObjStatus, max_slots)
        pos    = dm.read(S.handle, b + U6_ObjPos, max_slots * 3)
        shape  = dm.read(S.handle, b + U6_ObjShapeType, max_slots * 2)
        amount = dm.read(S.handle, b + U6_Amount, max_slots * 2)
        basetile, tw, weapons = _gear_tables(b)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    n = min(max_slots, len(status))
    def children(parent):
        kids = []
        for i in range(n):
            if (status[i] & 0x18) != 0x08:                       # CONTAINED only
                continue
            if (pos[i * 3] | (pos[i * 3 + 1] << 8)) != parent:   # assoc (holder) == parent
                continue
            sh = shape[i * 2] | (shape[i * 2 + 1] << 8)
            if (sh & 0x3ff) == 0:                                # freed/empty slot -- skip
                continue
            am = amount[i * 2] | (amount[i * 2 + 1] << 8)
            tile, _w, _e = _gear_of(sh, basetile, tw, weapons)
            kids.append((i, sh & 0x3ff, sh >> 10, am & 0xff, am >> 8, _tile_name(tile)))
        return kids
    lines = []
    def walk(parent, depth):
        for (i, typ, frame, quan, qual, name) in children(parent):
            lines.append(f"  {'  ' * depth}0x{i:03x}  type={typ} frame={frame} "
                         f"quan={quan} qual={qual}  {name}")
            walk(i, depth + 1)                                   # nested container
    walk(slot, 0)
    head = f"Container 0x{slot:03x} '{_obj_name(b, slot)}' contents (DS=0x{ds:04x}):"
    return head + ("\n" + "\n".join(lines) if lines else "\n  (empty)")

@hot_tool
def u6_panel_state(segment: int = -1) -> str:
    """Ultima VI: read the STATUS-PANEL state -- the agent's "eyes" into the inventory
    UI that a USE/READY on a CARRIED item must drive by keyboard (the engine offers no
    way to target inventory except through the panel). Reports the current view
    (PORTRAIT/PARTY/INVENTORY = StatusDisplay CMD_90/91/92), which member's panel is
    shown (D_04B3), the backpack cursor (D_0499 col / D_049A row) and scroll (D_07CE),
    the visible 4x3 backpack slots (D_E70F[12], decoded, the cursor cell marked), the
    equipped items (Equipment[8] by slot), and the live Selection (x/y/obj at
    B6AF/B6B1/B6B3 -- what a commit would act on). The keyboard route to target a
    carried item: F<member> -> view becomes INVENTORY (CMD_92); <tab> -> SelectMode==2
    (panel cursor); arrows move the cursor to the item's (row,col); Enter commits.
    Read-only. DS from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    b = S.membase + (ds << 4)
    try:
        sd    = int.from_bytes(dm.read(S.handle, b + U6_StatusDisplay, 2), "little")
        pch   = int.from_bytes(dm.read(S.handle, b + U6_PanelChar, 2), "little")
        col   = dm.read(S.handle, b + U6_PanelCol, 1)[0]
        row   = dm.read(S.handle, b + U6_PanelRow, 1)[0]
        scr   = dm.read(S.handle, b + U6_InvScroll, 1)[0]
        pack  = dm.read(S.handle, b + U6_VisBackpack, U6_BACKPACK_COLS * U6_BACKPACK_ROWS * 2)
        equip = dm.read(S.handle, b + U6_Equipment, 8 * 2)
        sx   = int.from_bytes(dm.read(S.handle, b + U6_Sel_x, 2), "little", signed=True)
        sy   = int.from_bytes(dm.read(S.handle, b + U6_Sel_y, 2), "little", signed=True)
        sobj = int.from_bytes(dm.read(S.handle, b + U6_Sel_obj, 2), "little", signed=True)
        ptrx = int.from_bytes(dm.read(S.handle, b + U6_PointerX, 2), "little")
        ptry = int.from_bytes(dm.read(S.handle, b + U6_PointerY, 2), "little")
    except OSError as ex:
        return f"Panel read failed (DS=0x{ds:04x}): {ex}"
    view = _PANEL_VIEW.get(sd, f"0x{sd:02x}")
    # The LIVE select cursor is PointerX/Y, NOT PanelCol/Row (which is the USE/READY nav
    # cursor and goes stale during a D/M move). Report the live one; keep Col/Row as a note.
    loc = _ptr_loc(ptrx, ptry)
    if loc[0] == "owner":
        live = "owner-icon (give-to/take-out of the displayed member/container)"
    elif loc[0] == "cell":
        live = f"cell (row{loc[2]},col{loc[1]})"
    else:
        live = f"off-grid/map (x={ptrx},y={ptry})"
    out = [f"Panel (DS=0x{ds:04x}): view={view} char#={pch} scroll={scr}",
           f"  live cursor (PointerX/Y) = {live}   [PanelCol/Row=(col{col},row{row}), stale during a move]"]
    # visible backpack: 4 cols x 3 rows, index = row*4 + col; 0 = empty cell
    rows_seen = []
    for i in range(U6_BACKPACK_COLS * U6_BACKPACK_ROWS):
        slot = pack[i * 2] | (pack[i * 2 + 1] << 8)
        if slot == 0:
            continue
        r, c = divmod(i, U6_BACKPACK_COLS)
        mark = " <-cursor" if (loc[0] == "cell" and loc[1] == c and loc[2] == r) else ""
        rows_seen.append(f"  ({r},{c}) slot 0x{slot:03x} {_obj_name(b, slot)}{mark}")
    out.append(f"backpack ({len(rows_seen)} visible):" if rows_seen
               else "backpack: none visible")
    out.extend(rows_seen)
    # equipped silhouette: 0/1 = empty slot (the C_155D_130E self-ref guard)
    eq = []
    for s in range(8):
        slot = equip[s * 2] | (equip[s * 2 + 1] << 8)
        if slot > 1:
            eq.append(f"  {_EQUIP_SLOT_NAME[s]}: 0x{slot:03x} {_obj_name(b, slot)}")
    out.append("equipped:" if eq else "equipped: none")
    out.extend(eq)
    sel = "none" if sobj < 0 else f"0x{sobj:03x} {_obj_name(b, sobj)}"
    out.append(f"Selection: obj={sel}  x={sx} y={sy}")
    return "\n".join(out)

@hot_tool
def u6_avatar(segment: int = -1) -> str:
    """Ultima VI: world position (x/y/z) + facing of the actor you currently
    CONTROL -- the closed-loop nav primitive (confirm a move actually happened).
    In PARTY mode that's the avatar (slot 1); in SOLO mode it's the detached
    member you drive (Party[Active]), which is what u6_move actually steers, so
    this tracks the right actor in both. Use u6_party for the full mode/roster.
    DS from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        slot, idx, in_veh = _controlled_slot(base)
        x, y, z = _controlled_xyz(base)
        d = dm.read(S.handle, _read_far_ptr(base, U6_NPCFlag_ptr) + slot, 1)[0] & 7
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    who = "avatar" if slot == 1 else f"party idx {idx}"
    veh = "  [aboard vehicle]" if in_veh else ""
    return f"controlled: slot 0x{slot:x} ({who})  x={x} y={y} z={z}  dir(NPCFlag&7)={d}{veh}"

@hot_tool
def u6_time(segment: int = -1) -> str:
    """Ultima VI: the in-game CLOCK + date. U6 is turn-based: time advances ~1 MINUTE
    per step/turn (the move scheduler, seg_1E0F.c); LOOK / TALK / USE are FREE (0
    minutes). NPCs follow DAILY SCHEDULES keyed off the hour -- the time of day
    decides where an NPC is and whether a shop is open -- so check this before a long
    detour. A U6 month is 28 days (D_2C4A.c). DS from u6_hook unless overridden."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        mm = dm.read(S.handle, base + U6_Time_M, 1)[0]
        hh = dm.read(S.handle, base + U6_Time_H, 1)[0]
        dd = dm.read(S.handle, base + U6_Date_D, 1)[0]
        mo = dm.read(S.handle, base + U6_Date_M, 1)[0]
        yy = int.from_bytes(dm.read(S.handle, base + U6_Date_Y, 2), "little")
        karma = dm.read(S.handle, base + U6_KARMA, 1)[0]
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    # day-phase for NPC schedules: the engine's sundial calls >20h or <5h "night"
    # (seg_0A33.c:901).
    if hh > 20 or hh < 5:
        phase = "NIGHT (most NPCs asleep / shops shut)"
    elif hh < 12:
        phase = "morning"
    elif hh < 17:
        phase = "afternoon"
    else:
        phase = "evening"
    return (f"In-game time: {hh:02d}:{mm:02d}  -- day {dd}, month {mo}, year {yy}  [{phase}]\n"
            f"karma={karma}.  (a step = ~1 game minute; look/talk/use = free; "
            f"NPCs follow daily schedules.)")

@hot_tool
def u6_party(segment: int = -1) -> str:
    """Ultima VI: party control state -- whether the game is in PARTY mode (the
    whole party marches together, led by the avatar) or SOLO mode (one detached
    member is driven on its own), WHO the player controls right now, and whether
    a fight is on (InCombat). In combat the player's moves are leashed to within
    Chebyshev 8 of the combat centre (TryStraightMove), so this also tells the
    agent when to switch from roaming to attacking ('a') / breaking off.

    Mode is the engine's D_2CC3 (seg_0A33.c SetPartyMode/solo handler): < 0 =>
    PARTY mode (Active forced to 0, the avatar/leader); >= 0 => SOLO mode (the
    value equals Active, the chosen member). Active is the party index the
    keystrokes drive; the controlled object slot is Party[Active] and the map is
    centred on it. Active == PartySize means the party is aboard a vehicle (moved
    as one). The roster is listed with the controlled member marked '*'. DS from
    u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        solo_b = dm.read(S.handle, base + U6_SoloFlag, 1)[0]
        active = dm.read(S.handle, base + U6_Active, 1)[0]
        psize  = dm.read(S.handle, base + U6_PartySize, 1)[0]
        party  = dm.read(S.handle, base + U6_Party, 17)
        names  = dm.read(S.handle, base + U6_Names, (psize + 1) * 14)
        objpos = dm.read(S.handle, base + U6_ObjPos, 0x100 * 3)
        incombat = dm.read(S.handle, base + U6_InCombat, 1)[0]
        enemies  = int.from_bytes(dm.read(S.handle, base + U6_EnemiesNum, 2), "little")
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    if not 0 < psize <= 16:
        return (f"PartySize={psize} out of range -- DS likely wrong or no game "
                f"loaded (DS=0x{ds:04x}). Re-run u6_hook with the avatar name.")
    solo = solo_b - 256 if solo_b >= 128 else solo_b    # D_2CC3 is a signed char
    in_vehicle = (active == psize)
    mode = "SOLO" if solo >= 0 else "PARTY"
    combat = f"COMBAT (enemies={enemies})" if incombat else "no combat"

    def name_of(k):
        raw = names[k * 14:k * 14 + 14]
        return raw.split(b"\x00", 1)[0].decode("latin-1", "replace") or f"<member {k}>"

    def xyz(slot):
        v = objpos[slot * 3] | (objpos[slot * 3 + 1] << 8) | (objpos[slot * 3 + 2] << 16)
        return v & 0x3ff, (v >> 10) & 0x3ff, (v >> 20) & 0xf

    out = [f"Party control: mode={mode}  {combat}  PartySize={psize}  "
           f"Active(idx)={active}" + ("  [aboard vehicle]" if in_vehicle else "")]
    if incombat:
        out.append(f"  In combat: player moves are leashed to Chebyshev <= "
                   f"{COMBAT_LEASH} of the combat centre (TryStraightMove); use 'a' "
                   f"to attack, or break off combat to roam freely.")
    if in_vehicle:
        veh = party[psize] if psize < len(party) else 0
        out.append(f"Controlled now: the whole party is aboard a vehicle "
                   f"(slot 0x{veh:x}) -- moves as one.")
    else:
        cs = party[active]
        cx, cy, cz = xyz(cs)
        tail = "" if solo >= 0 else "  (avatar / leader -- the party follows in formation)"
        out.append(f"Controlled now: party index {active} -> slot 0x{cs:x} "
                   f"{name_of(active)!r} at ({cx},{cy},z{cz}){tail}")
    out.append("   idx  slot    x    y   z  name")
    for k in range(psize):
        slot = party[k]
        x, y, z = xyz(slot)
        mark = "*" if (not in_vehicle and k == active) else " "
        out.append(f" {mark} {k:>3}  0x{slot:02x}  {x:>4} {y:>4} {z:>2}  {name_of(k)}")
    return "\n".join(out)

@hot_tool
def u6_input_state(segment: int = -1) -> str:
    """Ultima VI: what input the engine will accept RIGHT NOW -- the turn-readiness
    gate. U6 is turn-based and DOS keyboard input is buffered, so a key sent in the
    wrong context is consumed wrongly, not lost. Poll this before acting. States:
    COMMAND_READY (your turn -- send a move/command), CONVERSATION (answer via
    u6_say), SELECTING (a command awaits a target/direction), MOUSE_MODE (keyboard
    play wants this off), BUSY (turn processing/animating -- wait). Derived from
    AllowMouseMov/IsInConversation/SelectMode/MouseMode (game loop C_0A33_1CB4).
    DS from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        state, flags = _input_state(base)
        slot, idx, _veh = _controlled_slot(base)
        nm = dm.read(S.handle, base + U6_Names + idx * 14, 14).split(b"\x00", 1)[0]
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    who = nm.decode("latin-1", "replace") or f"idx{idx}"
    fl = "  ".join(f"{k}={v}" for k, v in flags.items())
    note = {"COMMAND_READY": "your turn -- send a move/command",
            "CONVERSATION": "in dialogue -- reply with u6_say",
            "SELECTING": "a command is awaiting a target/direction",
            "MOUSE_MODE": "mouse UI mode -- keyboard commands may not land",
            "BUSY": "engine processing the turn -- wait"}[state]
    return f"input_state = {state}  ({note})\n  controlled: {who} (slot 0x{slot:x})\n  {fl}"

@hot_tool
def u6_roster_status(segment: int = -1) -> str:
    """Ultima VI: per-member STR/DEX/INT/Level + load (carried & readied vs max) --
    the inputs for deciding who can use/bear which gear. Max carry = STR*20, max
    readied = STR*10 (engine caps). Current load is summed from each member's
    INVEN/EQUIP items by TypeWeight (top-level held items; contents of carried
    containers are not recursed). DS from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        psize  = dm.read(S.handle, base + U6_PartySize, 1)[0]
        party  = dm.read(S.handle, base + U6_Party, 17)
        names  = dm.read(S.handle, base + U6_Names, (psize + 1) * 14)
        stren  = dm.read(S.handle, base + U6_STREN, 0x100)
        dexte  = dm.read(S.handle, base + U6_DEXTE, 0x100)
        intel  = dm.read(S.handle, base + U6_INTEL, 0x100)
        level  = dm.read(S.handle, _read_far_ptr(base, U6_Level_ptr), 0x100)
        status = dm.read(S.handle, base + U6_ObjStatus, U6_MAX_SLOTS)
        objpos = dm.read(S.handle, base + U6_ObjPos, U6_MAX_SLOTS * 3)
        shape  = dm.read(S.handle, base + U6_ObjShapeType, U6_MAX_SLOTS * 2)
        amount = dm.read(S.handle, base + U6_Amount, U6_MAX_SLOTS * 2)
        _bt, tw, _wp = _gear_tables(base)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    if not 0 < psize <= 16:
        return (f"PartySize={psize} out of range -- DS likely wrong or no game "
                f"loaded (DS=0x{ds:04x}).")
    # Current load per holder: INVEN -> carried, EQUIP -> readied.
    carried, readied = {}, {}
    for i in range(0x100, U6_MAX_SLOTS):
        cu = status[i] & 0x18
        if cu not in (0x10, 0x18):
            continue
        holder = objpos[i * 3] | (objpos[i * 3 + 1] << 8)
        typ = (shape[i * 2] | (shape[i * 2 + 1] << 8)) & 0x3ff
        quan = amount[i * 2] or 1
        w = (tw[typ] if typ < len(tw) else 0) * quan
        d = readied if cu == 0x18 else carried
        d[holder] = d.get(holder, 0) + w
    out = [f"Party roster status ({psize} members):",
           "  idx  slot  name           STR DEX INT Lvl   carry(cur/max)  ready(cur/max)"]
    for k in range(psize):
        s = party[k]
        nm = (names[k * 14:k * 14 + 14].split(b"\x00", 1)[0]
              .decode("latin-1", "replace") or f"<{k}>")
        STR = stren[s]
        out.append(f"  {k:>3}  0x{s:02x}  {nm:<13}  {STR:>3} {dexte[s]:>3} {intel[s]:>3} "
                   f"{level[s]:>3}   {carried.get(s, 0):>5}/{STR * CARRY_PER_STR:<5}  "
                   f"{readied.get(s, 0):>4}/{STR * EQUIP_PER_STR:<4}")
    return "\n".join(out)

@hot_tool
def u6_npcs_near(radius: int = 12, segment: int = -1) -> str:
    """Ultima VI: NPCs/creatures placed in the world (LOCXYZ) within `radius`
    (Chebyshev) of the CONTROLLED actor (where you are -- the avatar in party
    mode, the active member in solo) on the same level. Reports slot, position,
    compass direction, distance, shape type, name (party members by their Names[]
    name; creatures/NPCs by LOOK.LZD appearance -- rat/guard/...) and CLASS -- the
    allegiance read from each actor's NPCStatus (u6.h:120-123): `party` (your own,
    walk-through -- the avatar swaps with it), `enemy` (Is_ATKPLR, hostile to YOU
    -- the threat), `ally` (Is_ATKMON, fights monsters for you) or `npc` (neutral).
    This is the agent's friend-or-foe gate, not a shape-name guess. DS from u6_hook
    unless overridden."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        self_slot, _idx, _veh = _controlled_slot(base)
        x0, y0, z0 = _controlled_xyz(base)
        psize = dm.read(S.handle, base + U6_PartySize, 1)[0]
        party = dm.read(S.handle, base + U6_Party, 17)
        names = dm.read(S.handle, base + U6_Names, (psize + 1) * 14) if 0 < psize <= 16 else b""
        status = dm.read(S.handle, base + U6_ObjStatus, 0x100)
        pos = dm.read(S.handle, base + U6_ObjPos, 0x100 * 3)
        shape = dm.read(S.handle, base + U6_ObjShapeType, 0x100 * 2)
        npcst = dm.read(S.handle, base + U6_NPCStatus, 0x100)
        basetile, tw, weapons = _gear_tables(base)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    # party object-slot -> roster index, so party members show their Names[] name
    # (GetObjectString's IsPlrControl path, seg_1184.c:1921) rather than a tile appearance.
    party_idx = {party[k]: k for k in range(psize)} if 0 < psize <= 16 else {}
    rows = []
    for i in range(0x100):
        if i == self_slot or (status[i] & 0x18) != 0:   # the controlled actor / not in world
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        x, y, z = v & 0x3ff, (v >> 10) & 0x3ff, (v >> 20) & 0xf
        sh = shape[i * 2] | (shape[i * 2 + 1] << 8)
        typ = sh & 0x3ff
        if typ == 0 or z != z0:                          # empty slot / other level
            continue
        dist = max(abs(x - x0), abs(y - y0))
        if dist > radius:
            continue
        if i in party_idx:                               # party member -> personal name
            k = party_idx[i]
            nm = names[k * 14:(k + 1) * 14].split(b"\x00", 1)[0].decode("latin-1", "replace")
        else:                                            # creature / NPC -> LOOK.LZD appearance
            tile, _w, _e = _gear_of(sh, basetile, tw, weapons)
            nm = _tile_name(tile)
        rows.append((dist, i, x, y, _compass(x - x0, y - y0), typ, _npc_class(npcst[i]), nm))
    if not rows:
        return f"No NPCs within {radius} of you ({x0},{y0},z{z0})."
    rows.sort()
    out = [f"NPCs within {radius} of you ({x0},{y0},z{z0}):",
           "  dist  slot     x    y   dir  type  class  name"]
    for dist, i, x, y, comp, typ, cls, nm in rows:
        out.append(f"  {dist:>4}  0x{i:02x}  {x:>4} {y:>4}  {comp:<3}  {typ:>4}  {cls:<5}  {nm}")
    return "\n".join(out)

@hot_tool
def u6_objects_near(radius: int = 8, max_items: int = 30, segment: int = -1) -> str:
    """Ultima VI: world OBJECTS (slot >= 0x100, placed on the map) within `radius`
    (Chebyshev) of the controlled actor on the same level -- find gear/items to
    Look or Get. Reports slot, position, compass dir, distance, type, weight, and
    the equip slot if readyable. Capped at the nearest `max_items` (any dropped are
    noted). DS from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        x0, y0, z0 = _controlled_xyz(base)
        status = dm.read(S.handle, base + U6_ObjStatus, U6_MAX_SLOTS)
        pos = dm.read(S.handle, base + U6_ObjPos, U6_MAX_SLOTS * 3)
        shape = dm.read(S.handle, base + U6_ObjShapeType, U6_MAX_SLOTS * 2)
        basetile, tw, weapons = _gear_tables(base)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    rows = []
    for i in range(0x100, U6_MAX_SLOTS):
        if (status[i] & 0x18) != 0:                      # only LOCXYZ (loose on the map)
            continue
        sh = shape[i * 2] | (shape[i * 2 + 1] << 8)
        typ = sh & 0x3ff
        if typ == 0:                                     # empty slot
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        x, y, z = v & 0x3ff, (v >> 10) & 0x3ff, (v >> 20) & 0xf
        if z != z0:
            continue
        dist = max(abs(x - x0), abs(y - y0))
        if dist > radius:
            continue
        tile, wt, eslot = _gear_of(sh, basetile, tw, weapons)
        rows.append((dist, i, x, y, _compass(x - x0, y - y0), typ, wt, eslot,
                     _tile_name(tile)))
    if not rows:
        return f"No world objects within {radius} of you ({x0},{y0},z{z0})."
    rows.sort()
    dropped = max(0, len(rows) - max_items)
    rows = rows[:max_items]
    out = [f"World objects within {radius} of you ({x0},{y0},z{z0}):",
           "  dist  slot     x    y   dir  type  weight  ready  name"]
    for dist, i, x, y, comp, typ, wt, eslot, name in rows:
        rd = "-" if eslot < 0 else _EQUIP_SLOT_NAME[eslot]
        out.append(f"  {dist:>4}  0x{i:03x}  {x:>4} {y:>4}  {comp:<3}  {typ:>4}  "
                   f"{wt:>6}  {rd:<4}  {name}")
    if dropped:
        out.append(f"  (+{dropped} more beyond the nearest {max_items}; "
                   f"raise max_items or lower radius)")
    return "\n".join(out)


__all__ = [
    "u6_object",
    "u6_inventory",
    "u6_container",
    "u6_panel_state",
    "u6_avatar",
    "u6_time",
    "u6_party",
    "u6_input_state",
    "u6_roster_status",
    "u6_npcs_near",
    "u6_objects_near",
]
