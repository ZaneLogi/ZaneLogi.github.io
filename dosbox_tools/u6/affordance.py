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


# --- affordance PATTERN predictors (the shared logic; ~one per behaviour) ------
# Each takes (base, slot) -> the structured prediction dict (see predict_use). Stubs.

def _predict_qual_toggle(base, slot):
    """A. crank/lever/switch: resolve the `qual`-linked target (drawbridge OBJ_10D /
    portcullis OBJ_136 at doorway OBJ_12D), read its frame, report toggle + result.
    Ports C_27A1_433D / _4479 / _4672. PLANNED -- stub."""
    return _NOT_IMPL


def _predict_open_close(base, slot):
    """A. door (C_27A1_2A44) / chest (C_27A1_2BBC): open / close / blocked-by-lock from
    the object's own frame+lock state. PLANNED -- stub."""
    return _NOT_IMPL


def _predict_unlock(base, slot):
    """A. lockpick/key (C_27A1_2D8E): USE unlocks the SELECTED locked door/chest if the
    key qual matches (the flow `act._use_key_flow` drives). PLANNED -- stub."""
    return _NOT_IMPL


def _predict_light(base, slot):
    """B. light sources (C_27A1_31F6): light <-> extinguish from the frame. PLANNED."""
    return _NOT_IMPL


def _predict_consume(base, slot):
    """B. single-use (potion/torch/powder keg): immediate generic effect + consumed.
    PLANNED -- stub."""
    return _NOT_IMPL


def _predict_vehicle(base, slot):
    """B. horse / ship / balloon: mount/dismount/board + the movement-type granted
    (Phase-2 nav). PLANNED -- stub."""
    return _NOT_IMPL


def _predict_play(base, slot):
    """B. instruments (C_27A1_335A): 'play / tune' (the on=<digits> sub-flow). PLANNED."""
    return _NOT_IMPL


def _predict_simple(base, slot):
    """B. produce/view with no world target (cow/churn/beehive/fishing/fountain/crystal
    ball/telescope): the generic effect. PLANNED -- stub."""
    return _NOT_IMPL


def _predict_quest_mechanic(base, slot):
    """C. orb/moonstone/rune/silver horn/balloon plans/vortex cube: report ONLY the
    operate-mechanic ("USE the orb -> choose a direction -> a moongate opens"). NEVER
    the quest-gated outcome / flag / destination / win. PLANNED -- stub; do NOT decode
    the handler's quest payload here."""
    return _NOT_IMPL


# --- USE_DISPATCH: exhaustive mirror of seg_27a1.c:3016-3158 (source order) -----
# row = {"t": [types...], "h": handler fn, "ln": dispatch line, "cat": A/B/C/TBD,
#        "pat": pattern fn or None, "note": one-line ground truth}
USE_DISPATCH = [
    {"t": [0x073, 0x074, 0x075], "h": "C_27A1_4E6F", "ln": 3019, "cat": AFF_TBD, "pat": None, "note": "TBD -- read C_27A1_4E6F"},
    {"t": [0x19C, 0x19E, 0x19F, 0x1A7], "h": "C_27A1_5289", "ln": 3027, "cat": AFF_UTILITY, "pat": _predict_vehicle, "note": "use ship/skiff/raft/balloon (board)"},
    {"t": [0x10E], "h": "C_27A1_47F3", "ln": 3029, "cat": AFF_QUEST, "pat": _predict_quest_mechanic, "note": "use balloon plans (assemble) -- quest item"},
    {"t": [0x0BA, 0x0C0], "h": "C_27A1_09A1", "ln": 3036, "cat": AFF_TBD, "pat": None, "note": "TBD (frame-gated) -- read C_27A1_09A1"},
    {"t": [0x0EC, 0x1A3], "h": "C_27A1_338D", "ln": 3039, "cat": AFF_MECHANISM, "pat": None, "note": "use bell / pull chain -- mechanism; pattern TBD (qual-linked? read C_27A1_338D)"},
    {"t": [0x0B6], "h": "C_27A1_37D3", "ln": 3040, "cat": AFF_UTILITY, "pat": _predict_simple, "note": "use beehive (honey)"},
    {"t": [0x07A, 0x091, 0x0A4, 0x0CE, 0x0FD], "h": "C_27A1_31F6", "ln": 3049, "cat": AFF_UTILITY, "pat": _predict_light, "note": "light sources: candle/candelabra/fireplace/brazier/campfire -- light/extinguish"},
    {"t": [0x05F, 0x060, 0x080, 0x081, 0x082, 0x083, 0x084, 0x085, 0x087, 0x0B4, 0x0B8, 0x0D1, 0x0D2, 0x109], "h": "C_27A1_5F43", "ln": 3064, "cat": AFF_QUEST, "pat": _predict_quest_mechanic, "note": "shared handler; incl. 0x87 Orb of the Moons [C: operate=choose dir->moongate]; rest TBD -- read C_27A1_5F43"},
    {"t": [0x0DD], "h": "C_27A1_3A35", "ln": 3065, "cat": AFF_TBD, "pat": None, "note": "TBD -- read C_27A1_3A35"},
    {"t": [0x129, 0x12A, 0x12B, 0x12C], "h": "C_27A1_2A44", "ln": 3069, "cat": AFF_MECHANISM, "pat": _predict_open_close, "note": "use door -- open/close/locked"},
    {"t": [0x062], "h": "C_27A1_2BBC", "ln": 3074, "cat": AFF_MECHANISM, "pat": _predict_open_close, "note": "use chest (container)"},
    {"t": [0x0B5], "h": "C_27A1_376D", "ln": 3076, "cat": AFF_UTILITY, "pat": _predict_simple, "note": "use churn (butter)"},
    {"t": [0x1AC], "h": "C_27A1_36E7", "ln": 3077, "cat": AFF_UTILITY, "pat": _predict_simple, "note": "use cow (milk)"},
    {"t": [0x120], "h": "C_27A1_433D", "ln": 3078, "cat": AFF_MECHANISM, "pat": _predict_qual_toggle, "note": "use crank -> qual-linked drawbridge (OBJ_10D)"},
    {"t": [0x09B], "h": "C_27A1_5935", "ln": 3079, "cat": AFF_UTILITY, "pat": _predict_simple, "note": "use crystal ball (view)"},
    {"t": [0x1A4], "h": "C_27A1_49C3", "ln": 3084, "cat": AFF_UTILITY, "pat": _predict_vehicle, "note": "use deflated balloon (z-gated) -- inflate/board"},
    {"t": [0x0D4], "h": "C_27A1_60D6", "ln": 3086, "cat": AFF_TBD, "pat": None, "note": "TBD -- read C_27A1_60D6"},
    {"t": [0x108], "h": "C_27A1_4D46", "ln": 3087, "cat": AFF_UTILITY, "pat": _predict_simple, "note": "use fishing pole"},
    {"t": [0x0EA], "h": "C_27A1_4E9B", "ln": 3088, "cat": AFF_UTILITY, "pat": _predict_simple, "note": "use fountain (drink/effect)"},
    {"t": [0x061], "h": "C_27A1_47E0", "ln": 3089, "cat": AFF_TBD, "pat": None, "note": "TBD -- read C_27A1_47E0"},
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
    {"t": [0x057], "h": "C_27A1_5789", "ln": 3110, "cat": AFF_TBD, "pat": None, "note": "TBD (inventory-gated) -- read C_27A1_5789"},
    {"t": [0x099], "h": "C_27A1_335A", "ln": 3112, "cat": AFF_UTILITY, "pat": _predict_play, "note": "instrument (335A arg 0x13)"},
    {"t": [0x116, 0x118], "h": "C_27A1_5DF2", "ln": 3114, "cat": AFF_TBD, "pat": None, "note": "TBD -- read C_27A1_5DF2"},
    {"t": [0x067, 0x068], "h": "C_27A1_4FC6", "ln": 3118, "cat": AFF_TBD, "pat": None, "note": "TBD (equip-gated) -- read C_27A1_4FC6"},
    {"t": [0x113], "h": "C_27A1_3832", "ln": 3122, "cat": AFF_UTILITY, "pat": _predict_consume, "note": "use potion (drink)"},
    {"t": [0x0DF], "h": "C_27A1_3B59", "ln": 3123, "cat": AFF_UTILITY, "pat": _predict_consume, "note": "use powder keg (detonate)"},
    {"t": [0x0A9], "h": "C_27A1_60BD", "ln": 3124, "cat": AFF_TBD, "pat": None, "note": "TBD -- read C_27A1_60BD"},
    {"t": [0x0F2, 0x0F3, 0x0F4, 0x0F5, 0x0F6, 0x0F7, 0x0F8, 0x0F9], "h": "C_27A1_4B98", "ln": 3132, "cat": AFF_QUEST, "pat": _predict_quest_mechanic, "note": "use rune (at a shrine, mantra) -- the 8 virtue runes; quest"},
    {"t": [0x14E], "h": "C_27A1_32FA", "ln": 3133, "cat": AFF_TBD, "pat": None, "note": "TBD -- read C_27A1_32FA"},
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


def _use_target(base, slot, rule=None):
    """Resolve the object USE on `slot` would AFFECT, by the row's targeting rule
    (TGT_QUAL / TGT_QUAL_TILE / TGT_SELECTION / TGT_SELF / TGT_NONE) -- mirroring the
    SearchArea / __SearchTypeAt logic in the C_27A1_* handlers. Returns the target's
    slot + world (x,y), or None ("No correspondent ..."). PLANNED -- stub."""
    return _NOT_IMPL


def predict_use(base, slot):
    """Core predictor: look up _BY_TYPE[GetType(slot)] and run its `pat` against LIVE
    state, returning {category, verb, target_slot, target_xy, current_state,
    predicted_state}. Category-C rows return only the operate-mechanic. A TBD row (or a
    type absent from the dispatch) returns a "not characterised -- handler C_27A1_xxxx"
    note rather than guessing. Consumed by the #1 query layer. PLANNED -- stub."""
    return _NOT_IMPL


@mcp.tool()
def u6_affordance(target: str, segment: int = -1) -> str:
    """Ultima VI: "what does USE do to this object?" -- predict the effect of USE on
    `target` WITHOUT doing it, so the agent can DEDUCE a plan instead of trial-and-
    observe. `target` is an object SLOT ('0x4e8'/'1256') or a NAME ('lever','crank' --
    nearest match). MECHANISM (A): names the resolved target + resulting state, e.g.
    "USE -> opens the portcullis at (307,384)". UTILITY (B): operate-mechanic + generic
    effect. QUEST item (C: orb/moonstone/rune/cube): ONLY how to operate it (the quest
    outcome is yours to discover by play). Backed by USE_DISPATCH, an exhaustive port of
    the seg_27a1.c USE handlers.
    PLANNED -- stub (the affordance layer for the #1 query work; not yet implemented)."""
    return _NOT_IMPL


__all__ = [
    "AFF_MECHANISM", "AFF_UTILITY", "AFF_QUEST", "AFF_TBD",
    "TGT_SELF", "TGT_QUAL", "TGT_QUAL_TILE", "TGT_SELECTION", "TGT_NONE",
    "_predict_qual_toggle", "_predict_open_close", "_predict_unlock", "_predict_light",
    "_predict_consume", "_predict_vehicle", "_predict_play", "_predict_simple",
    "_predict_quest_mechanic",
    "USE_DISPATCH", "_BY_TYPE", "_use_target", "predict_use", "u6_affordance",
]
