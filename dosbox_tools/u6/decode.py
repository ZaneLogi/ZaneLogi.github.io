"""u6.decode -- interpret raw object/tile bytes into meaning: type/frame/qual,
LOOK.LZD names, gear (equip slot/weight), door & chest state, NPC allegiance, and
the per-cell actor map. Pure decoders over guest RAM; no tool registration.
"""

from u6.constants import *  # noqa: F401,F403
from u6.ctx import *        # noqa: F401,F403  -- dm, S, _rd*, _read_far_ptr, _static_table, _world_to_cell, _controlled_*

try:                                    # committed name table decoded from LOOK.LZD
    from u6.look_names import tile_name as _tile_name
except Exception:                       # module missing in deployment -> numeric fallback
    def _tile_name(_tile):
        return f"tile{_tile}"


_ACTOR_RANK = {"party": 0, "ally": 1, "npc": 1, "enemy": 2}


def _obj_tfq(base_addr, slot):
    """(type, frame, qual) for an object slot."""
    sh = _rd16(base_addr + U6_ObjShapeType + slot * 2)
    am = _rd16(base_addr + U6_Amount + slot * 2)
    return sh & 0x3ff, sh >> 10, am >> 8

def _party_member_slot(base_addr, idx):
    """Object slot of party member `idx` (Party[idx])."""
    return _rd8(base_addr + U6_Party + idx)

def _holder_party_index(base_addr, holder_slot):
    """Party index (0..7) whose object slot == `holder_slot` (an item's INVEN/EQUIP
    assoc), or -1 if the holder isn't a party member."""
    psize = _rd8(base_addr + U6_PartySize)
    for i in range(min(psize, 8)):
        if _rd8(base_addr + U6_Party + i) == holder_slot:
            return i
    return -1

def _visible_backpack(base_addr):
    """The 12 visible backpack object slots (D_E70F); 0 = an empty cell."""
    n = U6_BACKPACK_COLS * U6_BACKPACK_ROWS
    raw = dm.read(S.handle, base_addr + U6_VisBackpack, n * 2)
    return [raw[i * 2] | (raw[i * 2 + 1] << 8) for i in range(n)]

def _door_at_tile(base_addr, tx, ty, tz):
    """A door (OBJ_129..12C) on tile (tx,ty,tz) -> (slot, type, frame, qual), else None."""
    status = dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS)
    pos    = dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3)
    shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2)
    amount = dm.read(S.handle, base_addr + U6_Amount, U6_MAX_SLOTS * 2)
    for i in range(0x100, U6_MAX_SLOTS):
        if status[i] & 0x18:                              # not LOCXYZ
            continue
        typ = (shape[i * 2] | (shape[i * 2 + 1] << 8)) & 0x3ff
        if typ not in _U6_DOOR_TYPES:
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        if (v & 0x3ff) == tx and ((v >> 10) & 0x3ff) == ty and ((v >> 20) & 0xf) == tz:
            return i, typ, (shape[i * 2 + 1] >> 2), amount[i * 2 + 1]   # frame=sh>>10, qual=am>>8
    return None

def _equip_slot(tile, weapon_tiles):
    """Port of STAT_GetEquipSlot (seg_155D.c:129): given an object's TILE id
    (BaseTile[type] + frame), return its equip slot 0..9 (see _EQUIP_SLOT_NAME) or
    -1 if it can't be readied. Checks run in SOURCE ORDER -- first match wins -- so
    the 0x219 overlap correctly resolves to NECK (tested before CHST). weapon_tiles
    is the D_07DD right-hand-weapon tile set."""
    s = tile
    if s in (0x21A, 0x21B):                                       return 7   # FEET
    if s == 0x258 or 0x37D <= s <= 0x37F:                         return 9   # RING
    if s in (0x219, 0x217, 0x101) or 0x250 <= s <= 0x252:         return 1   # NECK
    if 0x200 <= s <= 0x207:                                       return 0   # HEAD
    if (0x210 <= s <= 0x216) or s in (0x218, 0x219, 0x28C, 0x28E, 0x29D, 0x257):
        return 4                                                             # CHST
    if s in (0x228, 0x229, 0x231, 0x235) or 0x22B <= s <= 0x22E:  return 8   # 2HND
    if (0x208 <= s <= 0x20F) or s == 0x222:                       return 5   # LHND
    if s in weapon_tiles:                                         return 2   # RHND
    return -1

def _gear_tables(base_addr):
    """(BaseTile, TypeWeight, weapon-tile set) from the lazy static cache. BaseTile
    maps object type -> base tile; TypeWeight maps type -> weight (comparable to the
    STR*N caps); the weapon set is D_07DD (RHND tiles for the equip-slot decode)."""
    basetile = _static_table(base_addr, U6_BaseTile_ptr, _BASETILE_N * 2, "basetile")
    tw = _static_table(base_addr, U6_TypeWeight_ptr, _BASETILE_N, "typeweight")
    raw = _static_table(base_addr, U6_EquipWeaponTbl, 33 * 2, "d07dd", far=False)
    weapons = frozenset((raw[i * 2] | (raw[i * 2 + 1] << 8)) for i in range(33))
    return basetile, tw, weapons

def _gear_of(sh, basetile, tw, weapons):
    """For a packed ObjShapeType `sh` -> (tile, weight, equip_slot). equip_slot is
    -1 (not readyable) or 0..9. tile = BaseTile[type] + frame."""
    typ = sh & 0x3ff
    if typ >= _BASETILE_N:
        return -1, 0, -1
    tile = (basetile[typ * 2] | (basetile[typ * 2 + 1] << 8)) + (sh >> 10)
    wt = tw[typ] if typ < len(tw) else 0
    eslot = _equip_slot(tile, weapons) if 0 <= tile < 0x800 else -1
    return tile, wt, eslot

def _obj_name(base_addr, slot):
    """LOOK.LZD name for an object slot (tile = BaseTile[type]+frame, via _gear_of)."""
    sh = int.from_bytes(dm.read(S.handle, base_addr + U6_ObjShapeType + slot * 2, 2), "little")
    basetile, tw, weapons = _gear_tables(base_addr)
    tile, _wt, _es = _gear_of(sh, basetile, tw, weapons)
    return _tile_name(tile)

def _door_state(frame):
    """Door frame band -> (state, locked) per C_27A1_2A44 (seg_27a1.c:1285-1322):
    0-3 open, 4-7 closed (unlocked), 8-0xB locked (key, qual-match), 0xC-0xF magically
    locked."""
    if frame < 4:   return "open", False
    if frame < 8:   return "closed", False
    if frame < 0xc: return "locked", True
    return "magically locked", True

def _chest_state(frame):
    """Chest frame -> (state, locked) per C_27A1_2BBC (seg_27a1.c:1331-1373): 0 open,
    1 closed (unlocked), 2 locked (key, qual-match), 3 magically locked."""
    return (("open", False), ("closed", False),
            ("locked", True), ("magically locked", True))[frame & 3]

def _compass(dx, dy):
    ns = "N" if dy < 0 else ("S" if dy > 0 else "")
    ew = "E" if dx > 0 else ("W" if dx < 0 else "")
    return (ns + ew) or "@"

def _dir_to(dx, dy):
    if dx == 1:
        return "e"
    if dx == -1:
        return "w"
    return "s" if dy == 1 else "n"

def _npc_class(st):
    """Allegiance of an actor from its NPCStatus byte (u6.h:120-123): 'party'
    (PLRCONTROL -- your own), 'enemy' (Is_ATKPLR, hostile to the player), 'ally'
    (Is_ATKMON, fights monsters for you) or 'npc' (neutral)."""
    if st & U6_NPC_PLRCONTROL: return "party"
    if st & U6_NPC_ATKPLR:     return "enemy"
    if st & U6_NPC_ATKMON:     return "ally"
    return "npc"

def _actor_map(base_addr, z0, ax, ay, self_slot=1):
    """Per-cell ACTOR classification for the local window -- the dynamic half of
    C_1E0F_000F's legality (seg_1E0F.c:191-213), now telling friend from foe.
    Returns {(r, c): (category, blocks)} for every in-world actor (slot 1..0xFF,
    LOCXYZ, same level) except the walk-through field/effect types and the mover
    itself (`self_slot`):

        category  meaning                          blocks the controlled mover?
        'party'   player-controlled (PLRCONTROL)   NO  -- avatar<->party SWAP
        'enemy'   alignment Is_ATKPLR (0x20)       yes (a threat)
        'ally'    alignment Is_ATKMON (0x40)       yes (fights monsters for you)
        'npc'     neutral townsfolk                yes

    The party-pass mirrors the gate exactly (seg_1E0F.c:191): for a player-
    controlled mover, a blocker that is ALSO player-controlled and not
    incapacitated (Isbis_0016 = DEAD|ASLEEP|PARALYZED) nor dragged-under
    (NPCFlag&0x10) is SKIPPED -- the engine then swaps them in C_1E0F_1B0E. A
    dead/asleep party member keeps blocking. Threat is the engine's own NPCStatus
    alignment bits (u6.h:120-123), not a shape-name guess. Kept separate from
    _build_grid so the planner can route optimistically through a transient NPC."""
    status = dm.read(S.handle, base_addr + U6_ObjStatus, 0x100)
    pos    = dm.read(S.handle, base_addr + U6_ObjPos, 0x100 * 3)
    shape  = dm.read(S.handle, base_addr + U6_ObjShapeType, 0x100 * 2)
    npcst  = dm.read(S.handle, base_addr + U6_NPCStatus, 0x100)
    try:
        npcflag = dm.read(S.handle, _read_far_ptr(base_addr, U6_NPCFlag_ptr), 0x100)
    except OSError:
        npcflag = bytes(0x100)
    out = {}
    for i in range(0x100):
        if i == self_slot or (status[i] & 0x18) != 0:       # the mover / not in world
            continue
        typ = (shape[i * 2] | (shape[i * 2 + 1] << 8)) & 0x3ff
        if typ == 0 or typ in _PASSABLE_ACTOR_TYPES:
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        if ((v >> 20) & 0xf) != z0:
            continue
        cell = _world_to_cell(v & 0x3ff, (v >> 10) & 0x3ff, ax, ay)
        if cell is None:
            continue
        st = npcst[i]
        if st & U6_NPC_PLRCONTROL:                           # party member
            incap = (st & U6_NPC_INCAP) or (npcflag[i] & U6_NPCFLAG_DRAGGED)
            cat, blocks = "party", bool(incap)               # swap-through unless down
        elif st & U6_NPC_ATKPLR:
            cat, blocks = "enemy", True
        elif st & U6_NPC_ATKMON:
            cat, blocks = "ally", True
        else:
            cat, blocks = "npc", True
        prev = out.get(cell)
        if prev is None:
            out[cell] = (cat, blocks)
        else:                                                # >1 actor on a tile
            top = cat if _ACTOR_RANK[cat] > _ACTOR_RANK[prev[0]] else prev[0]
            out[cell] = (top, prev[1] or blocks)
    return out

def _actor_cells(base_addr, z0, ax, ay, self_slot=1):
    """Cells that BLOCK the controlled mover -- the set the planner / legality
    probe consume. Derived from _actor_map: every classified actor cell except a
    party member the avatar swaps through (C_1E0F_1B0E). Kept as a bare set for
    back-compat with _build_grid's planner and u6_validate_passability."""
    return {cell for cell, (cat, blk) in
            _actor_map(base_addr, z0, ax, ay, self_slot).items() if blk}

def _npc_xyz(base_addr, slot):
    """(x, y, z, coorduse) for an object/NPC slot."""
    st = dm.read(S.handle, base_addr + U6_ObjStatus + slot, 1)[0]
    pos = dm.read(S.handle, base_addr + U6_ObjPos + slot * 3, 3)
    v = pos[0] | (pos[1] << 8) | (pos[2] << 16)
    return v & 0x3ff, (v >> 10) & 0x3ff, (v >> 20) & 0xf, st & 0x18


__all__ = [
    "_tile_name", "_ACTOR_RANK",
    "_obj_tfq",
    "_obj_name",
    "_gear_tables",
    "_gear_of",
    "_equip_slot",
    "_door_state",
    "_chest_state",
    "_npc_class",
    "_actor_map",
    "_actor_cells",
    "_door_at_tile",
    "_holder_party_index",
    "_party_member_slot",
    "_visible_backpack",
    "_npc_xyz",
    "_compass",
    "_dir_to",
]
