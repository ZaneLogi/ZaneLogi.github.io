"""u6.combat -- combat-SAFETY verbs the agent prepares and the player triggers
manually during a fight (the standing rule is: combat = the user drives, the agent
stands down). These are NOT tactical-combat tools; they are direct guest-RAM writes
that let the user avoid or survive fights without the agent acting in combat:

  u6_pacify(radius)  -- set every freshly-SPAWNED hostile near the avatar to
                        alignment NEUTRAL, so it stops choosing the party as a target.
  u6_heal_party()    -- restore living party members to MAX HP and clear the
                        poison/asleep/paralyzed ailments.

Both are one-shot byte writes (no keystrokes), so they don't perturb the turn.

WHY ALIGNMENT WORKS (u6-decompiled): an actor decides to attack the avatar purely
from its alignment in NPCStatus bits 0x60 (u6.h:115-123). EVIL (0x20) / CHAOTIC
(0x60) set Is_ATKPLR -> the party (GOOD) is a valid opponent. The target is
re-picked EVERY turn (COMBAT_pickOpponent @ seg_2337.c:1489 is called fresh at the
top of COMBAT_AI_Assault :1538 -- no latched target), and a NEUTRAL actor selects
NO opponent (the objAln==NEUTRAL filter, seg_2337.c:1508) and is counted by no
combat trigger (the Is_ATKPLR scan, seg_1E0F.c:1990). So writing NPCStatus &= ~0x60
stops an in-progress attacker on its next tick. This is exactly what the engine's
own Charm spell does (save+overwrite alignment, seg_1944.c:793). CAVEAT the user
must respect: if the party then STRIKES a pacified actor, C_2337_1C1E (seg_2337.c:
998) flips it to CHAOTIC + AI_ASSAULT -- pacify is durable only if not provoked.

SCOPE (user-set 2026-06-29): u6_pacify touches ONLY the temporary monster spawn
pool, slots 0xE0-0xFF. AddMonster allocates spawns (eggs seg_2E2D.c:129, slime
splits seg_2337.c:800) exclusively from this range's free-list (seg_1184.c:689),
tagging them LOCAL|OWNED and culling them past 20 tiles (seg_1184.c:802). Persistent
/ placed monsters and townsfolk (slots 0x00-0xDF) are left hostile ON PURPOSE -- the
user deals with those by fighting or fleeing, so a meaningful encounter is never
silently neutered.

WHY MAX HP IS SAFE: HitPoints[] is a plain unsigned-char array (u6.h:464); writing
HP = MaxHP is the exact write the Heal spell uses (seg_1944.c:936). MaxHP = min(255,
Level*30) with a floor of 1 (MaxHP @ seg_2337.c:226). Death is decided as
HitPoints[i] <= incoming-damage INSIDE the damaging call (LooseHP @ seg_2337.c:736),
so heal-to-max guards against attrition across rounds, not a single one-shot.
"""

from u6.constants import *  # noqa: F401,F403  -- addresses + NPCStatus bit masks
from u6.ctx import *        # noqa: F401,F403  -- mcp, S, dm, _ds, hot_tool, _read_far_ptr, _controlled_xyz
from u6.decode import *     # noqa: F401,F403  -- _gear_tables/_gear_of/_tile_name/_npc_class for creature names

# Temporary monster spawn pool (eggs / slime-splits / runtime AddMonster). u6_pacify
# is scoped to this range only; persistent NPCs (0x00-0xDF) are left for the user.
_SPAWN_LO = 0xE0
_SPAWN_HI = 0x100

# NPCStatus bit layout (u6.h:115-130) -- AUTHORITATIVE. NOTE: do not reuse the
# converse module's POISONED_BIT (0x10): that constant is the OP_POISONNED test
# value and 0x10 is actually the DEAD bit here. The combat ailment bits are:
_ALIGN_MASK = 0x60   # GetAlignment; clearing it == SetAlignment(NEUTRAL)
_POISONED   = 0x08   # POISONED (u6.h:128)
# _ASLEEP (0x04) and _PARALYZED (0x02) come from constants as U6_NPC_ASLEEP/PARALYZED.
_AILMENTS   = _POISONED | U6_NPC_ASLEEP | U6_NPC_PARALYZED   # 0x0e -- "heal" clears these


@hot_tool
def u6_pacify(radius: int = 8, segment: int = -1) -> str:
    """Ultima VI: COMBAT-AVOIDANCE -- set every freshly-spawned hostile within
    `radius` (Chebyshev tiles) of the avatar to alignment NEUTRAL, so it stops
    targeting the party on its next turn (and no longer triggers/maintains combat).
    A manual verb the user calls during a fight; the agent does not act in combat
    otherwise. SCOPE: only the temporary monster spawn pool, slots 0xE0-0xFF (eggs,
    slime-splits, runtime monsters). PERSISTENT placed monsters / townsfolk
    (0x00-0xDF) are deliberately NOT touched -- the user fights or flees those.
    Writes NPCStatus[i] &= ~0x60 (SetAlignment NEUTRAL, the same state the Charm
    spell produces). The effect lands on the actor's next AI tick because the target
    is re-picked every turn (seg_2337.c:1538). CAVEAT: do not then STRIKE a pacified
    actor -- being hit by the party re-aggros it to CHAOTIC (seg_2337.c:998). Returns
    the list of what was pacified. DS from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        x0, y0, z0 = _controlled_xyz(base)
        status = dm.read(S.handle, base + U6_ObjStatus, 0x100)
        pos    = dm.read(S.handle, base + U6_ObjPos, 0x100 * 3)
        shape  = dm.read(S.handle, base + U6_ObjShapeType, 0x100 * 2)
        npcst  = dm.read(S.handle, base + U6_NPCStatus, 0x100)
        basetile, tw, weapons = _gear_tables(base)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    pacified = []
    for i in range(_SPAWN_LO, _SPAWN_HI):
        st = npcst[i]
        if (status[i] & 0x18) != 0:                 # not on the map (CoordUse != LOCXYZ)
            continue
        sh = shape[i * 2] | (shape[i * 2 + 1] << 8)
        typ = sh & 0x3ff
        if typ == 0:                                # empty slot
            continue
        if st & (U6_NPC_DEAD | U6_NPC_PLRCONTROL):  # dead, or a (charmed-away) party member
            continue
        if not (st & U6_NPC_ATKPLR):                # not hostile to the player -> skip
            continue
        v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
        x, y, z = v & 0x3ff, (v >> 10) & 0x3ff, (v >> 20) & 0xf
        if z != z0:                                 # other level
            continue
        dist = max(abs(x - x0), abs(y - y0))
        if dist > radius:
            continue
        dm.write(S.handle, base + U6_NPCStatus + i, bytes([st & ~_ALIGN_MASK]))
        tile, _w, _e = _gear_of(sh, basetile, tw, weapons)
        pacified.append((dist, i, x, y, typ, _tile_name(tile), _npc_class(st)))
    if not pacified:
        return (f"No hostiles in the spawn pool (0xE0-0xFF) within {radius} of you "
                f"({x0},{y0},z{z0}). Persistent monsters (0x00-0xDF) are not touched "
                f"-- fight or flee those.")
    pacified.sort()
    out = [f"Pacified {len(pacified)} spawned hostile(s) -> NEUTRAL "
           f"(slots 0xE0-0xFF within {radius} of {x0},{y0},z{z0}):",
           "  dist  slot     x    y  type  name              was"]
    for dist, i, x, y, typ, nm, was in pacified:
        out.append(f"  {dist:>4}  0x{i:02x}  {x:>4} {y:>4}  0x{typ:03x}  {nm:<16}  {was}")
    out.append("Do NOT strike a pacified creature -- a hit re-aggros it (seg_2337.c:998).")
    return "\n".join(out)


@hot_tool
def u6_heal_party(segment: int = -1) -> str:
    """Ultima VI: restore the LIVING party to MAX HP and clear poison/asleep/
    paralyzed -- the user's "heal" verb. For each member Party[0..PartySize-1]:
    HitPoints = MaxHP (= min(255, Level*30); the Heal-spell write, seg_1944.c:936)
    and NPCStatus &= ~0x0e (clears POISONED 0x08 / ASLEEP 0x04 / PARALYZED 0x02 per
    u6.h; PROTECTED and charm are left alone). DEAD members are SKIPPED (not revived
    -- on death the engine splices them out of Party[], so reviving is a separate
    operation) and reported. One-shot byte writes, no keystrokes. DS from u6_hook
    unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        psize = dm.read(S.handle, base + U6_PartySize, 1)[0]
        party = dm.read(S.handle, base + U6_Party, 17)
        names = dm.read(S.handle, base + U6_Names, (psize + 1) * 14) if 0 < psize <= 16 else b""
        level = dm.read(S.handle, _read_far_ptr(base, U6_Level_ptr), 0x100)
        hp    = dm.read(S.handle, base + U6_HitPoints, 0x100)
        npcst = dm.read(S.handle, base + U6_NPCStatus, 0x100)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    if not 0 < psize <= 16:
        return (f"PartySize={psize} out of range -- DS likely wrong or no game "
                f"loaded (DS=0x{ds:04x}).")
    healed, skipped = [], []
    for k in range(psize):
        s = party[k]
        nm = (names[k * 14:(k + 1) * 14].split(b"\x00", 1)[0]
              .decode("latin-1", "replace") or f"<{k}>")
        st = npcst[s]
        if st & U6_NPC_DEAD:
            skipped.append((k, s, nm))
            continue
        maxhp = min(255, max(1, level[s] * 30))
        before = hp[s]
        if before != maxhp:
            dm.write(S.handle, base + U6_HitPoints + s, bytes([maxhp]))
        cleared = [n for bit, n in ((_POISONED, "poison"), (U6_NPC_ASLEEP, "asleep"),
                                    (U6_NPC_PARALYZED, "paralyzed")) if st & bit]
        if st & _AILMENTS:
            dm.write(S.handle, base + U6_NPCStatus + s, bytes([st & ~_AILMENTS]))
        healed.append((k, s, nm, before, maxhp, cleared))
    out = [f"Healed {len(healed)} party member(s) to MAX HP:",
           "  idx  slot  name           hp(before->max)  cleared"]
    for k, s, nm, before, maxhp, cleared in healed:
        out.append(f"  {k:>3}  0x{s:02x}  {nm:<13}  {before:>3} -> {maxhp:<3}      "
                   f"{', '.join(cleared) if cleared else '-'}")
    for k, s, nm in skipped:
        out.append(f"  {k:>3}  0x{s:02x}  {nm:<13}  DEAD -- skipped (not revived)")
    return "\n".join(out)


__all__ = ["u6_pacify", "u6_heal_party"]
