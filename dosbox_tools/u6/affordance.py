"""u6.affordance -- predict what USE *does* to an object (the "what happens if I USE
this" layer), so the agent can DEDUCE a plan instead of pulling levers to see what
moves.

Ports the EFFECT + TARGETING logic of U6's USE handlers (`seg_27a1.c`). `USE_DISPATCH`
below is an EXHAUSTIVE mirror of the engine's `switch(GetType(obj))` (seg_27a1.c:3016-
3158) -- one row per case-group, in source order, every branch labelled (A/B/C/TBD)
with its handler fn + line. Nothing is silently dropped: if a branch isn't decoded yet
it is a TBD row ("read C_27A1_xxxx"), so revisiting later misses nothing. Same
predict-from-source approach as the passability oracle (`navigate` ports `C_1E0F_000F`).

WHY (castle-escape play-test, 2026-06-27): the gate puzzle was solved by trial-and-
observe. It is actually deterministic -- the mechanism handlers link by the `qual`
field: crank (C_27A1_433D) -> drawbridge (OBJ_10D) same qual; lever (C_27A1_4479) ->
doorway (OBJ_12D) same qual -> add/delete a portcullis (OBJ_136) at that tile;
switch (C_27A1_4672) -> qual-matched target. So "USE this lever -> opens the portcullis
at (307,384)" is a deduction, not a probe.

SCOPE (agreed 2026-06-27) -- operate-mechanic (fair) vs quest-gated outcome (withheld):
  A  MECHANISMS (crank/lever/switch/door/chest/key/bell) -- FULL prediction incl. the
     resolved target. Pure physics.
  B  UTILITY (light/consume/instrument/vehicle/produce/view) -- operate-mechanic + the
     immediate generic effect.
  C  QUEST items (orb/moonstone/rune/silver horn/balloon plans/VORTEX CUBE) -- ONLY the
     operate-mechanic ("how to use it once you have it"); the quest-gated OUTCOME (where
     the moongate leads, the rune+mantra answer, the win) is WITHHELD -- discovered by
     play. We deliberately do NOT decode the quest payload (orb's `C_27A1_5F43`, rune's
     `C_27A1_4B98`, cube's `C_27A1_5FAC` are left unread past the operate level).
  TBD  a branch in the dispatch we have not characterised yet -- row carries the
     handler + line so it can be read later. Disposition (A/B/C) decided then.

Consumed by the #1 query layer (`cartography`: `u6_at`/`u6_interactables_near` surface
the predicted "USE -> effect"); composes with `act`'s `u6_use_object` (predict here,
drive the keys there). New leaf at the `decode` level of the DAG.

PLANNED -- scaffold: every predictor returns `_NOT_IMPL` (a loud runtime "report me");
`USE_DISPATCH` is the data manifest.
Implement A-first (qual_toggle + open_close + unlock + _use_target), then B, then
C-operate-mechanic; resolve the TBD rows as they come up.
"""
from u6.constants import *  # noqa: F401,F403
from u6.ctx import *        # noqa: F401,F403
from u6.decode import *     # noqa: F401,F403


# Scope tags.
AFF_MECHANISM = "A"
AFF_UTILITY   = "B"
AFF_QUEST     = "C"
AFF_TBD       = "TBD"

# Targeting rules (how a handler finds the object it AFFECTS).
TGT_SELF      = "self"        # acts on the used object itself
TGT_QUAL      = "qual"        # SearchArea for a type with MATCHING qual
TGT_QUAL_TILE = "qual_tile"   # qual-matched anchor, then a tile-object search
TGT_SELECTION = "selection"   # acts on a second selected object (key->lock)
TGT_NONE      = "none"        # no world target (consume / view / mount)

# Stub sentinel -- every predictor + the tool returns this until implemented, so a live
# call is a LOUD "report me", never a silent None.
_NOT_IMPL = ("u6.affordance NOT IMPLEMENTED -- scaffold only (USE_DISPATCH covers all 85 "
             "source USE cases, but no predictor is built yet). If you hit this at runtime, "
             "REPORT IT to the user and do NOT rely on the result.")


# --- mechanism object types (the A-set targets; module-local per the convention) -----
# Used only here, so they travel with this module (constants.py is for cross-module).
OBJ_CRANK      = 0x120   # use crank -> qual-linked drawbridge
OBJ_DRAWBRIDGE = 0x10D   # head frame 3 = open, 6 = closed (C_27A1_3F47)
OBJ_LEVER      = 0x10C   # use lever -> qual-linked doorway -> add/del portcullis
OBJ_SWITCH     = 0x0AE   # use switch -> qual-linked doorway -> add/del force field
OBJ_DOORWAY    = 0x12D   # the qual-keyed anchor a lever/switch acts through (not a door)
OBJ_PORTCULLIS = 0x136   # toggled at the doorway tile by a lever
OBJ_FORCEFIELD = 0x0AF   # toggled at the doorway tile by a switch
OBJ_KEY        = 0x040   # qual-keyed key (unlocks a same-qual lock)
OBJ_LOCKPICK   = 0x03F   # lockpick (unlocks a qual-0 lock; dex-test break risk)
_BELL_CHAIN    = frozenset((0x0EC, 0x1A3))   # ring bell / pull chain: sound only, no target

_DRAWBRIDGE_OPEN_HEAD   = 3   # the crank's drawbridge head tile when the span is DOWN/open
_DRAWBRIDGE_CLOSED_HEAD = 6   # ... when the span is UP/closed


# --- the SearchArea / __SearchTypeAt port (how a handler finds its target) -----------
# The C_27A1_* mechanism handlers locate their target with SearchArea(0,0,0x3ff,0x3ff)
# (whole-map scan, filtered by type [+ qual]) and __SearchTypeAt(x,y,z,type) (a specific
# tile). Both reduce to a single pass over the world-object slots (0x100..) that are
# LOCXYZ on the relevant level -- the same loop u6_objects_near / _door_at_tile use.

def _load_objs(base):
    """One read of the four parallel object arrays (status/pos/shape/amount)."""
    return (dm.read(S.handle, base + U6_ObjStatus, U6_MAX_SLOTS),
            dm.read(S.handle, base + U6_ObjPos, U6_MAX_SLOTS * 3),
            dm.read(S.handle, base + U6_ObjShapeType, U6_MAX_SLOTS * 2),
            dm.read(S.handle, base + U6_Amount, U6_MAX_SLOTS * 2))

def _slot_tfqxyz(objs, i):
    """(type, frame, qual, x, y, z) for slot i from loaded arrays."""
    _st, pos, shape, amount = objs
    sh = shape[i * 2] | (shape[i * 2 + 1] << 8)
    v = pos[i * 3] | (pos[i * 3 + 1] << 8) | (pos[i * 3 + 2] << 16)
    return (sh & 0x3ff, sh >> 10, amount[i * 2 + 1],
            v & 0x3ff, (v >> 10) & 0x3ff, (v >> 20) & 0xf)

def _search_area(objs, want_type, z0, qual=None):
    """Port of SearchArea(0,0,0x3ff,0x3ff) filtered to `want_type` (+ optional `qual`)
    on level z0: yield (slot, x, y, frame) for each matching LOCXYZ world object. Source
    order (low slot first), like the engine's NextArea() walk."""
    status, _pos, _shape, _amount = objs
    for i in range(0x100, U6_MAX_SLOTS):
        if status[i] & 0x18:                       # not LOCXYZ
            continue
        typ, frm, ql, x, y, z = _slot_tfqxyz(objs, i)
        if typ != want_type or z != z0:
            continue
        if qual is not None and ql != qual:
            continue
        yield i, x, y, frm

def _search_type_at(objs, want_type, tx, ty, z0):
    """Port of __SearchTypeAt(x,y,z,type): the first LOCXYZ `want_type` object on tile
    (tx,ty,z0) -> (slot, frame), else None."""
    status, _pos, _shape, _amount = objs
    for i in range(0x100, U6_MAX_SLOTS):
        if status[i] & 0x18:
            continue
        typ, frm, _ql, x, y, z = _slot_tfqxyz(objs, i)
        if typ == want_type and x == tx and y == ty and z == z0:
            return i, frm
    return None


# --- affordance PATTERN predictors (the shared logic; ~one per behaviour) ------
# Each takes (base, slot) -> the structured prediction dict (see predict_use).

def _aff(category, verb, effect, target_slot=-1, target_xy=None,
         current=None, predicted=None):
    """Build a uniform prediction dict (predict_use adds type/handler)."""
    return {"category": category, "verb": verb, "effect": effect,
            "target_slot": target_slot, "target_xy": target_xy,
            "current_state": current, "predicted_state": predicted}


def _predict_qual_toggle(objs, used, z0):
    """A. crank/lever/switch/bell -- resolve the `qual`-linked target + the toggle.
    Ports C_27A1_433D (crank->drawbridge OBJ_10D), _4479 (lever->portcullis OBJ_136 at
    doorway OBJ_12D), _4672 (switch->force-field OBJ_0AF at doorway), and _338D
    (bell/chain). Reading 338D resolved its old `pat:None`: it only animates + plays a
    note -- a mechanism with NO world target (the qual-link was a guess; there isn't one)."""
    typ, frm, qual, _ux, _uy = used
    if typ in _BELL_CHAIN:
        return _aff(AFF_MECHANISM, "ring",
                    "rings (sound + animation); no world state change")
    if typ == OBJ_CRANK:
        head = next((h for h in _search_area(objs, OBJ_DRAWBRIDGE, z0, qual)
                     if h[3] in (_DRAWBRIDGE_OPEN_HEAD, _DRAWBRIDGE_CLOSED_HEAD)), None)
        if head is None:
            return _aff(AFF_MECHANISM, "turn",
                        f"no correspondent drawbridge (qual {qual})")
        slot, x, y, f = head
        opened = (f == _DRAWBRIDGE_OPEN_HEAD)
        return _aff(AFF_MECHANISM, "turn",
                    f"{'closes' if opened else 'opens'} the drawbridge at ({x},{y})",
                    target_slot=slot, target_xy=(x, y),
                    current="down (open)" if opened else "up (closed)",
                    predicted="up (closed)" if opened else "down (open)")
    if typ in (OBJ_LEVER, OBJ_SWITCH):
        tgt_type = OBJ_PORTCULLIS if typ == OBJ_LEVER else OBJ_FORCEFIELD
        name = "portcullis" if typ == OBJ_LEVER else "force field"
        verb = "pull" if typ == OBJ_LEVER else "flip"
        res = _use_target(objs, TGT_QUAL_TILE, qual, z0, OBJ_DOORWAY, at_tile_type=tgt_type)
        if res is None:
            return _aff(AFF_MECHANISM, verb,
                        f"no qual-linked doorway (qual {qual}) -- nothing happens")
        ax, ay, present_slot, _pf = res
        present = present_slot >= 0
        return _aff(AFF_MECHANISM, verb,
                    f"{'opens' if present else 'closes'} the {name} at ({ax},{ay})",
                    target_slot=present_slot, target_xy=(ax, ay),
                    current="present (closed)" if present else "clear (open)",
                    predicted="removed (open)" if present else "added (closed)")
    return _NOT_IMPL


def _predict_open_close(objs, used, z0):
    """A. door (OBJ_129..12C, C_27A1_2A44) / chest (OBJ_062, C_27A1_2BBC): open / close /
    blocked-by-lock from the object's own frame -- via decode._door_state/_chest_state
    (the same frame bands the handlers switch on). A bare USE toggles an unlocked door/
    chest; a locked one bounces ("locked") -- opening it needs the key flow (_predict_unlock)."""
    typ, frm, qual, _ux, _uy = used
    if typ == 0x062:
        state, locked = _chest_state(frm)
        kind = "chest"
    else:
        state, locked = _door_state(frm)
        kind = "door"
    if state == "open":
        return _aff(AFF_MECHANISM, "use", f"closes the {kind}",
                    current="open", predicted="closed")
    if state == "closed":
        return _aff(AFF_MECHANISM, "use", f"opens the {kind}",
                    current="closed", predicted="open")
    if state == "locked":
        return _aff(AFF_MECHANISM, "use",
                    f"{kind} is locked (needs a qual-{qual} key) -- a bare USE won't open it; "
                    f"USE a matching key on it instead",
                    current="locked", predicted="locked")
    return _aff(AFF_MECHANISM, "use",
                f"{kind} is magically locked -- needs a dispel/unlock spell, not a key",
                current="magically locked", predicted="magically locked")


def _predict_unlock(objs, used, z0):
    """A. key (OBJ_040) / lockpick (OBJ_03F), C_27A1_2D8E: USE this item, then SELECT a
    locked door/chest -- a key unlocks a lock of MATCHING qual; a lockpick picks a qual-0
    (non-magical) lock and may break on a failed DEX test. (act._use_key_flow drives the
    selection; here we just predict what the item can open.)"""
    typ, _frm, qual, _ux, _uy = used
    if typ == OBJ_KEY:
        return _aff(AFF_MECHANISM, "use-key",
                    f"unlocks a selected locked door/chest of matching qual {qual} "
                    f"(SELECT the lock after USE; u6_use's key flow auto-matches)")
    return _aff(AFF_MECHANISM, "use-lockpick",
                "picks a selected qual-0 (non-magical) lock; may break on a failed DEX test")


# ---- B (utility) predictors: operate-mechanic + the immediate generic effect ----------
# Source-derived verbs/effects; where current state matters (a light source) we read the
# frame, else a per-type effect string. These are operate-level -- e.g. WHICH potion does
# what is the item's payload, not an operate fact, so the note stays generic.

_LIGHT_NAMES = {0x07A: "candle", 0x091: "candelabra", 0x0A4: "fireplace",
                0x0CE: "brazier", 0x0FD: "campfire"}                      # C_27A1_31F6 switch
_CONSUME = {                                                             # single-use items
    0x113: ("drink", "drink the potion -- consumed (the effect depends on the potion)"),
    0x0DF: ("detonate", "detonate the powder keg -- it explodes (consumed)"),
    0x05A: ("light", "light the torch -- a held light source that burns down over time"),
}
_VEHICLE = {                                                            # board / mount / ...
    0x19C: ("board", "board the ship (then sail it)"),
    0x19E: ("board", "board the ship (then sail it)"),
    0x19F: ("board", "board the raft"),
    0x1A7: ("board", "board the skiff"),
    0x1A4: ("inflate", "inflate & board the balloon (only from the surface / a balloon level)"),
    0x1AE: ("mount", "mount the horse (ride it)"),
    0x1AF: ("dismount", "dismount the horse"),
}
_SIMPLE = {                                                            # produce / view, no target
    0x0B6: "gather honey from the beehive",
    0x0B5: "churn butter",
    0x1AC: "milk the cow",
    0x09B: "gaze into the crystal ball (scry)",
    0x108: "fish with the pole (at water)",
    0x0EA: "drink from the fountain",
    0x09A: "look through the telescope",
}


def _predict_light(objs, used, z0):
    """B. light sources (C_27A1_31F6): toggle lit<->doused from frame bit0 (lit = frm&1)."""
    typ, frm, _q, _x, _y = used
    nm = _LIGHT_NAMES.get(typ, "light source")
    lit = bool(frm & 1)
    return _aff(AFF_UTILITY, "douse" if lit else "light",
                f"{'douses' if lit else 'lights'} the {nm}",
                current="lit" if lit else "unlit",
                predicted="unlit" if lit else "lit")


def _predict_consume(objs, used, z0):
    """B. single-use potion (C_27A1_3832) / powder keg (3B59) / torch (2FD1)."""
    typ, _frm, _q, _x, _y = used
    verb, eff = _CONSUME.get(typ, ("use", "single-use item -- consumed on use"))
    return _aff(AFF_UTILITY, verb, eff)


def _predict_eat(objs, used, z0):
    """B. food (C_27A1_5F43 -- the shared handler is just 'You eat the food.', consumed)."""
    return _aff(AFF_UTILITY, "eat", "eat it -- food, consumed (reduces hunger)")


def _predict_vehicle(objs, used, z0):
    """B. ship/raft/skiff/balloon/horse (C_27A1_5289/49C3/5503/55F0): board/mount/dismount."""
    typ, _frm, _q, _x, _y = used
    verb, eff = _VEHICLE.get(typ, ("board", "board/mount the vehicle"))
    return _aff(AFF_UTILITY, verb, eff)


def _predict_play(objs, used, z0):
    """B. instruments (C_27A1_335A): play / tune (pass on=<digits 0-9> to pick notes)."""
    return _aff(AFF_UTILITY, "play",
                "play the instrument (pass on=<digits 0-9> to pick the notes/tune)")


def _predict_simple(objs, used, z0):
    """B. produce/view with no world target (cow/churn/beehive/fishing/fountain/crystal
    ball/telescope): the generic immediate effect."""
    typ, _frm, _q, _x, _y = used
    return _aff(AFF_UTILITY, "use", _SIMPLE.get(typ, "use it (produces an item / a view)"))


# ---- C (quest) predictors: the OPERATE-MECHANIC ONLY -- never the quest-gated outcome ---
# Blind-discovery rule: tell the agent HOW to operate the item once it has it; NEVER the
# moongate destination, the rune mantra, the summon, or the win. The source handlers were
# read only to the operate surface; their quest payloads are deliberately NOT encoded here.
_QUEST_OPERATE = {
    0x057: ("aim", "USE the Orb of the Moons (from inventory) -> pass on=<n/s/e/w> ('where'); "
                   "a red moongate opens on a nearby open tile. WHERE it leads is yours to "
                   "discover."),
    0x049: ("bury", "USE the moonstone -> it buries in open ground/sand under you and a "
                    "moongate forms here. Its destination is yours to discover."),
    0x0F2: ("attune", "USE a virtue rune at its shrine -> you are prompted for the Mantra (a "
                      "short word). The correct mantra is yours to discover."),
    0x139: ("sound", "USE the silver horn -> it sounds and summons. What it calls and why is "
                     "yours to discover."),
    0x10E: ("assemble", "USE the balloon plans -> assembles the hot-air balloon from its parts "
                        "(mammoth silk bag, basket, burner, cable) when you have them."),
    0x03E: ("activate", "USE the Vortex Cube -> the endgame device. Its effect is the "
                        "main-quest climax -- withheld; discover it by playing."),
}


def _predict_quest_mechanic(objs, used, z0):
    """C. orb/moonstone/rune/silver horn/balloon plans/vortex cube: ONLY the operate-mechanic,
    NEVER the quest-gated outcome / destination / win. The 8 virtue runes (0xF2..0xF9) share
    one note. Outcome is deliberately withheld (blind-discovery)."""
    typ, _frm, _q, _x, _y = used
    key = 0x0F2 if 0x0F2 <= typ <= 0x0F9 else typ
    verb, eff = _QUEST_OPERATE.get(key, ("use", "a quest item -- operate-mechanic only; the "
                                                "outcome is yours to discover"))
    return _aff(AFF_QUEST, verb, eff)


# ---- former-TBD rows now characterised (the 4 quick wins) ------------------------------
def _predict_weathervane(objs, used, z0):
    """B. weathervane (C_27A1_60D6): USE rotates WindDir by one ('you feel a breeze')."""
    return _aff(AFF_UTILITY, "turn", "rotates the wind direction one step (you feel a breeze)")


def _predict_study(objs, used, z0):
    """B. scroll (C_27A1_47E0): USE studies it ('you study the scroll'; sets a progress flag)."""
    return _aff(AFF_UTILITY, "study", "study the scroll -- you learn something from it")


def _predict_squeak(objs, used, z0):
    """B. squeak toy (C_27A1_60BD): USE makes a 'Squeak!' sound; no world effect."""
    return _aff(AFF_UTILITY, "squeeze", "squeaks (just a sound); no world state change")


def _predict_self_toggle(objs, used, z0):
    """A. self-toggling object (C_27A1_32FA): USE flips frame bit0 (its own on/off state);
    no qual-linked target."""
    _typ, frm, _q, _x, _y = used
    on = bool(frm & 1)
    return _aff(AFF_MECHANISM, "use", "toggles its own state (frame flips); no linked target",
                current="on" if on else "off", predicted="off" if on else "on")


# --- USE_DISPATCH: exhaustive mirror of seg_27a1.c:3016-3158 (source order) -----
# row = {"t": [types...], "h": handler fn, "ln": dispatch line, "cat": A/B/C/TBD,
#        "pat": pattern fn or None, "note": one-line ground truth}
USE_DISPATCH = [
    {"t": [0x073, 0x074, 0x075], "h": "C_27A1_4E6F", "ln": 3019, "cat": AFF_TBD, "pat": None, "note": "TBD -- read C_27A1_4E6F"},
    {"t": [0x19C, 0x19E, 0x19F, 0x1A7], "h": "C_27A1_5289", "ln": 3027, "cat": AFF_UTILITY, "pat": _predict_vehicle, "note": "use ship/skiff/raft/balloon (board)"},
    {"t": [0x10E], "h": "C_27A1_47F3", "ln": 3029, "cat": AFF_QUEST, "pat": _predict_quest_mechanic, "note": "use balloon plans (assemble) -- quest item"},
    {"t": [0x0BA, 0x0C0], "h": "C_27A1_09A1", "ln": 3036, "cat": AFF_TBD, "pat": None, "note": "TBD (frame-gated) -- read C_27A1_09A1"},
    {"t": [0x0EC, 0x1A3], "h": "C_27A1_338D", "ln": 3039, "cat": AFF_MECHANISM, "pat": _predict_qual_toggle, "note": "use bell / pull chain -- RESOLVED: animation + OSI_playWavedNote only, NO world target (the qual-link guess was wrong)"},
    {"t": [0x0B6], "h": "C_27A1_37D3", "ln": 3040, "cat": AFF_UTILITY, "pat": _predict_simple, "note": "use beehive (honey)"},
    {"t": [0x07A, 0x091, 0x0A4, 0x0CE, 0x0FD], "h": "C_27A1_31F6", "ln": 3049, "cat": AFF_UTILITY, "pat": _predict_light, "note": "light sources: candle/candelabra/fireplace/brazier/campfire -- light/extinguish"},
    {"t": [0x05F, 0x060, 0x080, 0x081, 0x082, 0x083, 0x084, 0x085, 0x087, 0x0B4, 0x0B8, 0x0D1, 0x0D2, 0x109], "h": "C_27A1_5F43", "ln": 3064, "cat": AFF_UTILITY, "pat": _predict_eat, "note": "FOOD -- handler is just 'You eat the food.' (consumed). RESOLVED: the old 'incl. 0x87 Orb' note was WRONG; the Orb of the Moons is OBJ_057 (C_27A1_5789), not here"},
    {"t": [0x0DD], "h": "C_27A1_3A35", "ln": 3065, "cat": AFF_TBD, "pat": None, "note": "TBD -- read C_27A1_3A35"},
    {"t": [0x129, 0x12A, 0x12B, 0x12C], "h": "C_27A1_2A44", "ln": 3069, "cat": AFF_MECHANISM, "pat": _predict_open_close, "note": "use door -- open/close/locked"},
    {"t": [0x062], "h": "C_27A1_2BBC", "ln": 3074, "cat": AFF_MECHANISM, "pat": _predict_open_close, "note": "use chest (container)"},
    {"t": [0x0B5], "h": "C_27A1_376D", "ln": 3076, "cat": AFF_UTILITY, "pat": _predict_simple, "note": "use churn (butter)"},
    {"t": [0x1AC], "h": "C_27A1_36E7", "ln": 3077, "cat": AFF_UTILITY, "pat": _predict_simple, "note": "use cow (milk)"},
    {"t": [0x120], "h": "C_27A1_433D", "ln": 3078, "cat": AFF_MECHANISM, "pat": _predict_qual_toggle, "note": "use crank -> qual-linked drawbridge (OBJ_10D)"},
    {"t": [0x09B], "h": "C_27A1_5935", "ln": 3079, "cat": AFF_UTILITY, "pat": _predict_simple, "note": "use crystal ball (view)"},
    {"t": [0x1A4], "h": "C_27A1_49C3", "ln": 3084, "cat": AFF_UTILITY, "pat": _predict_vehicle, "note": "use deflated balloon (z-gated) -- inflate/board"},
    {"t": [0x0D4], "h": "C_27A1_60D6", "ln": 3086, "cat": AFF_UTILITY, "pat": _predict_weathervane, "note": "use weathervane -> rotate wind direction (WindDir++)"},
    {"t": [0x108], "h": "C_27A1_4D46", "ln": 3087, "cat": AFF_UTILITY, "pat": _predict_simple, "note": "use fishing pole"},
    {"t": [0x0EA], "h": "C_27A1_4E9B", "ln": 3088, "cat": AFF_UTILITY, "pat": _predict_simple, "note": "use fountain (drink/effect)"},
    {"t": [0x061], "h": "C_27A1_47E0", "ln": 3089, "cat": AFF_UTILITY, "pat": _predict_study, "note": "use scroll -> 'study the scroll' (sets a progress flag D_2CA8)"},
    {"t": [0x04D], "h": "C_27A1_319F", "ln": 3090, "cat": AFF_TBD, "pat": None, "note": "TBD -- read C_27A1_319F"},
    {"t": [0x09D], "h": "C_27A1_335A", "ln": 3091, "cat": AFF_UTILITY, "pat": _predict_play, "note": "instrument (335A arg 2)"},
    {"t": [0x09C], "h": "C_27A1_335A", "ln": 3092, "cat": AFF_UTILITY, "pat": _predict_play, "note": "instrument (335A arg 3)"},
    {"t": [0x1AE], "h": "C_27A1_5503", "ln": 3093, "cat": AFF_UTILITY, "pat": _predict_vehicle, "note": "use un-mounted horse (mount)"},
    {"t": [0x1AF], "h": "C_27A1_55F0", "ln": 3094, "cat": AFF_UTILITY, "pat": _predict_vehicle, "note": "use mounted horse (dismount)"},
    {"t": [0x03F, 0x040], "h": "C_27A1_2D8E", "ln": 3096, "cat": AFF_MECHANISM, "pat": _predict_unlock, "note": "use lockpick/key -> unlock selected"},
    {"t": [0x131], "h": "C_101C_089E", "ln": 3099, "cat": AFF_TBD, "pat": None, "note": "TBD (solo-mode gated; seg_101C) -- read C_101C_089E"},
    {"t": [0x10C], "h": "C_27A1_4479", "ln": 3103, "cat": AFF_MECHANISM, "pat": _predict_qual_toggle, "note": "use lever -> qual-linked portcullis@doorway"},
    {"t": [0x09E], "h": "C_27A1_335A", "ln": 3104, "cat": AFF_UTILITY, "pat": _predict_play, "note": "instrument (335A arg 0x12)"},
    {"t": [0x049], "h": "C_27A1_3425", "ln": 3105, "cat": AFF_QUEST, "pat": _predict_quest_mechanic, "note": "use moonstone (bury -> moongate) -- quest"},
    {"t": [0x057], "h": "C_27A1_5789", "ln": 3110, "cat": AFF_QUEST, "pat": _predict_quest_mechanic, "note": "use Orb of the Moons (inventory) -> on=<where>; a red moongate appears [C: operate only, destination withheld]"},
    {"t": [0x099], "h": "C_27A1_335A", "ln": 3112, "cat": AFF_UTILITY, "pat": _predict_play, "note": "instrument (335A arg 0x13)"},
    {"t": [0x116, 0x118], "h": "C_27A1_5DF2", "ln": 3114, "cat": AFF_TBD, "pat": None, "note": "TBD -- read C_27A1_5DF2"},
    {"t": [0x067, 0x068], "h": "C_27A1_4FC6", "ln": 3118, "cat": AFF_TBD, "pat": None, "note": "TBD (equip-gated) -- read C_27A1_4FC6"},
    {"t": [0x113], "h": "C_27A1_3832", "ln": 3122, "cat": AFF_UTILITY, "pat": _predict_consume, "note": "use potion (drink)"},
    {"t": [0x0DF], "h": "C_27A1_3B59", "ln": 3123, "cat": AFF_UTILITY, "pat": _predict_consume, "note": "use powder keg (detonate)"},
    {"t": [0x0A9], "h": "C_27A1_60BD", "ln": 3124, "cat": AFF_UTILITY, "pat": _predict_squeak, "note": "use -> 'Squeak!' (sound toy; no world effect)"},
    {"t": [0x0F2, 0x0F3, 0x0F4, 0x0F5, 0x0F6, 0x0F7, 0x0F8, 0x0F9], "h": "C_27A1_4B98", "ln": 3132, "cat": AFF_QUEST, "pat": _predict_quest_mechanic, "note": "use rune (at a shrine, mantra) -- the 8 virtue runes; quest"},
    {"t": [0x14E], "h": "C_27A1_32FA", "ln": 3133, "cat": AFF_MECHANISM, "pat": _predict_self_toggle, "note": "use -> toggles its own frame bit0 (on/off); no qual-linked target"},
    {"t": [0x05D], "h": "C_1944_42AC", "ln": 3138, "cat": AFF_TBD, "pat": None, "note": "TBD (z-gated; seg_1944) -- read C_1944_42AC"},
    {"t": [0x139], "h": "C_27A1_5BCF", "ln": 3140, "cat": AFF_QUEST, "pat": _predict_quest_mechanic, "note": "use silver horn (summon) -- quest"},
    {"t": [0x04E], "h": "C_27A1_3537", "ln": 3145, "cat": AFF_TBD, "pat": None, "note": "TBD (equip-gated) -- read C_27A1_3537"},
    {"t": [0x0AE], "h": "C_27A1_4672", "ln": 3149, "cat": AFF_MECHANISM, "pat": _predict_qual_toggle, "note": "use switch -> qual-linked target"},
    {"t": [0x09A], "h": "C_27A1_5A97", "ln": 3150, "cat": AFF_UTILITY, "pat": _predict_simple, "note": "use telescope (view)"},
    {"t": [0x05A], "h": "C_27A1_2FD1", "ln": 3151, "cat": AFF_UTILITY, "pat": _predict_consume, "note": "use torch (light/consume)"},
    {"t": [0x03E], "h": "C_27A1_5FAC", "ln": 3153, "cat": AFF_QUEST, "pat": _predict_quest_mechanic, "note": "use VORTEX CUBE -- MAIN-QUEST WIN; operate-mechanic only, outcome withheld"},
    {"t": [0x0E9], "h": "C_27A1_3661", "ln": 3156, "cat": AFF_TBD, "pat": None, "note": "TBD -- read C_27A1_3661"},
    {"t": [0x128], "h": "C_27A1_335A", "ln": 3157, "cat": AFF_UTILITY, "pat": _predict_play, "note": "instrument (335A arg 0x14)"},
]

# type (int) -> its USE_DISPATCH row, for predict_use lookup.
_BY_TYPE = {t: row for row in USE_DISPATCH for t in row["t"]}


def _use_target(objs, rule, qual, z0, target_type, at_tile_type=None):
    """Resolve the object USE would AFFECT, by the row's targeting rule -- mirroring the
    SearchArea / __SearchTypeAt logic in the C_27A1_* handlers.

      TGT_QUAL       -> first `target_type` with matching `qual`:
                        returns (target_slot, tx, ty, target_frame) or None.
      TGT_QUAL_TILE  -> first OBJ_DOORWAY with matching `qual` (the anchor), then
                        `at_tile_type` AT that tile (lever->portcullis, switch->field):
                        returns (anchor_x, anchor_y, present_slot or -1, present_frame
                        or None) -- present=None means the tile is currently clear.

    qual==0 has no link (the engine guards `if(objQual)`), so TGT_QUAL_TILE returns
    None then. Lowest matching slot wins (engine NextArea() order)."""
    if rule == TGT_QUAL:
        for slot, x, y, frm in _search_area(objs, target_type, z0, qual):
            return slot, x, y, frm
        return None
    if rule == TGT_QUAL_TILE:
        if not qual:                                   # `if(objQual)` guard
            return None
        for _anchor, ax, ay, _frm in _search_area(objs, OBJ_DOORWAY, z0, qual):
            hit = _search_type_at(objs, at_tile_type, ax, ay, z0)
            if hit is None:
                return ax, ay, -1, None
            return ax, ay, hit[0], hit[1]
        return None
    return None


def _undecoded_note(row):
    """The graceful 'not decoded this slice' operate-note for a B/C/TBD row."""
    cat = {"A": "mechanism", "B": "utility", "C": "quest",
           "TBD": "uncharacterised"}.get(row["cat"], row["cat"])
    return (f"category {row['cat']} ({cat}): USE effect not decoded this slice "
            f"(first step = A-mechanisms); handler {row['h']} -- \"{row['note']}\"")


def predict_use(base, slot, z0=None):
    """Core predictor: look up _BY_TYPE[GetType(slot)] and run its `pat` against LIVE
    state, returning {type, handler, category, verb, effect, target_slot, target_xy,
    current_state, predicted_state, decoded}. A-mechanism rows return the resolved target
    + toggle; a B/C/TBD row (not built this slice) returns decoded=False with a graceful
    operate-note (NOT the loud _NOT_IMPL); a type absent from the dispatch says USE
    likely does nothing. Consumed by the #1 query layer."""
    objs = _load_objs(base)
    typ, frm, qual, x, y, z = _slot_tfqxyz(objs, slot)
    if z0 is None:
        z0 = z
    row = _BY_TYPE.get(typ)
    if row is None:
        return {"type": typ, "category": None, "decoded": False,
                "effect": f"type 0x{typ:03x} is not in the USE dispatch -- USE likely does nothing"}
    pat = row["pat"]
    if pat is not None:
        res = pat(objs, (typ, frm, qual, x, y), z0)
        if isinstance(res, dict):
            res.setdefault("type", typ)
            res.setdefault("handler", row["h"])
            res.setdefault("decoded", True)
            return res
    return {"type": typ, "category": row["cat"], "handler": row["h"], "decoded": False,
            "effect": _undecoded_note(row)}


def _resolve_slot(base, target, z0, x0, y0):
    """`target` -> object slot. Accepts a SLOT ('0x4e8'/'1256') or a NAME ('lever') ->
    the NEAREST world object on level z0 whose LOOK.LZD name contains it (case-insensitive).
    Returns (slot, None) or (None, error-string)."""
    t = target.strip()
    try:
        return (int(t, 0) if t.lower().startswith(("0x", "-0x")) else int(t)), None
    except ValueError:
        pass
    objs = _load_objs(base)
    status = objs[0]
    needle = t.lower()
    best = None
    for i in range(0x100, U6_MAX_SLOTS):
        if status[i] & 0x18:
            continue
        typ, _frm, _ql, x, y, z = _slot_tfqxyz(objs, i)
        if typ == 0 or z != z0:
            continue
        nm = _obj_name(base, i)
        if needle in nm.lower():
            d = max(abs(x - x0), abs(y - y0))
            if best is None or d < best[0]:
                best = (d, i)
    if best is None:
        return None, f"No world object named like '{target}' on this level."
    return best[1], None


def _format_affordance(name, slot, p):
    """Render a predict_use dict as agent-readable text."""
    typ = p.get("type", 0)
    catname = {"A": "A mechanism", "B": "B utility", "C": "C quest",
               "TBD": "TBD", None: "not in USE dispatch"}.get(p.get("category"),
                                                              str(p.get("category")))
    lines = [f"USE {name} (slot 0x{slot:03x}, type 0x{typ:03x})  [{catname}]",
             f"  -> {p.get('effect', '(no effect)')}"]
    if p.get("verb"):
        lines.append(f"  verb: {p['verb']}")
    cur, nxt = p.get("current_state"), p.get("predicted_state")
    if cur is not None or nxt is not None:
        lines.append(f"  state: {cur} -> {nxt}")
    tslot, txy = p.get("target_slot", -1), p.get("target_xy")
    if txy is not None and tslot is not None and tslot >= 0:
        lines.append(f"  target: slot 0x{tslot:03x} at {txy}")
    elif txy is not None:
        lines.append(f"  target tile: {txy}")
    if not p.get("decoded", True):
        lines.append("  (not fully decoded this slice -- operate-note only)")
    return "\n".join(lines)


@hot_tool
def u6_affordance(target: str, segment: int = -1) -> str:
    """Ultima VI: "what does USE do to this object?" -- predict the effect of USE on
    `target` WITHOUT doing it, so the agent can DEDUCE a plan instead of trial-and-
    observe. `target` is an object SLOT ('0x4e8'/'1256') or a NAME ('lever','crank' --
    nearest match). MECHANISM (A): names the resolved target + resulting state, e.g.
    "USE -> opens the portcullis at (307,384)". UTILITY (B) / QUEST item (C: orb/
    moonstone/rune/cube): currently the operate-note only -- those predictors are the
    next build slice (the quest OUTCOME stays withheld for blind discovery regardless).
    Backed by USE_DISPATCH, an exhaustive port of the seg_27a1.c USE handlers."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base = S.membase + (ds << 4)
    try:
        x0, y0, z0 = _controlled_xyz(base)
        slot, rerr = _resolve_slot(base, target, z0, x0, y0)
        if rerr:
            return rerr
        name = _obj_name(base, slot)
        pred = predict_use(base, slot, z0)
    except OSError as ex:
        return f"Read failed (DS=0x{ds:04x}): {ex}"
    return _format_affordance(name, slot, pred)


__all__ = [
    "AFF_MECHANISM", "AFF_UTILITY", "AFF_QUEST", "AFF_TBD",
    "TGT_SELF", "TGT_QUAL", "TGT_QUAL_TILE", "TGT_SELECTION", "TGT_NONE",
    "OBJ_CRANK", "OBJ_DRAWBRIDGE", "OBJ_LEVER", "OBJ_SWITCH", "OBJ_DOORWAY",
    "OBJ_PORTCULLIS", "OBJ_FORCEFIELD", "OBJ_KEY", "OBJ_LOCKPICK", "_BELL_CHAIN",
    "_DRAWBRIDGE_OPEN_HEAD", "_DRAWBRIDGE_CLOSED_HEAD",
    "_load_objs", "_slot_tfqxyz", "_search_area", "_search_type_at",
    "_aff", "_predict_qual_toggle", "_predict_open_close", "_predict_unlock",
    "_predict_light", "_predict_consume", "_predict_eat", "_predict_vehicle",
    "_predict_play", "_predict_simple", "_predict_quest_mechanic",
    "_predict_weathervane", "_predict_study", "_predict_squeak", "_predict_self_toggle",
    "USE_DISPATCH", "_BY_TYPE", "_use_target", "_undecoded_note", "predict_use",
    "_resolve_slot", "_format_affordance", "u6_affordance",
]
