"""u6.hook -- u6_hook: attach + BDA-calibrate (via the shared base tools) and
DERIVE the per-run U6 data segment from the avatar name (Names[0] @ DS:0x3236).
"""

from u6.constants import *  # noqa: F401,F403
from u6.ctx import *        # noqa: F401,F403  -- mcp, S, dm, _derive_ds, _ds


@hot_tool
def u6_hook(avatar_name: str = "") -> str:
    """Hook DOSBox for Ultima VI: attach, BDA-calibrate MemBase, and DERIVE the
    U6 data segment (DS) from the avatar's name.

    DS is the program's DOS load segment -- it shifts with the memory layout
    (drivers/TSRs/env/config), so it must NOT be hardcoded. Pass the avatar's
    name (as shown in-game); this finds its bytes in RAM (Names[0] @ DS:0x3236)
    and computes DS = (name_linear - 0x3236) / 16. After this, u6_inventory /
    u6_object work with no DS argument. Omit the name only to calibrate MemBase
    alone (then you must pass segment= to the decoders)."""
    r1 = base.find_dosbox()
    if not r1.startswith("Opened DOSBox"):
        return r1
    r2 = base.find_membase_auto()
    if not r2.startswith("MemBase auto-set"):
        return f"Attached, but MemBase calibration failed:\n{r2}"

    if not avatar_name:
        return (f"Attached, MemBase=0x{S.membase:x}. DS NOT derived (no avatar "
                f"name given). Pass the avatar's name -- u6_hook('Monica') -- so "
                f"DS can be pinned, or call the decoders with an explicit segment=.")

    cands = _derive_ds(avatar_name)
    if not cands:
        return (f"MemBase=0x{S.membase:x}, but the name {avatar_name!r} was not "
                f"found at any Names[0] boundary. Check the exact in-game spelling, "
                f"or the game may not be at a state with the party loaded.")
    ds, host = cands[0]
    S.u6_ds = ds
    # Read the name back as a confirmation.
    try:
        raw = dm.read(S.handle, S.membase + (ds << 4) + U6_Names, 14)
        readback = raw.split(b"\x00", 1)[0].decode("latin-1", "replace")
    except OSError:
        readback = "<unreadable>"
    extra = ""
    if len(cands) > 1:
        extra = f"\n(Multiple name hits: {[(hex(d), hex(h)) for d, h in cands[:4]]}; used the first.)"
    return (f"Hooked U6: MemBase=0x{S.membase:x}, DS=0x{ds:04x} "
            f"(derived from {avatar_name!r} @ host 0x{host:x}).\n"
            f"Names[0] reads back as {readback!r}.{extra}\n"
            f"Ready -- read: u6_avatar / u6_party / u6_roster_status / u6_input_state "
            f"/ u6_object / u6_inventory / u6_panel_state / u6_npcs_near / u6_objects_near "
            f"/ u6_walkable / u6_conversation; act: u6_move / u6_talk / u6_say / u6_look / u6_get "
            f"/ u6_use / u6_ready / u6_key; navigate: u6_pathfind / u6_goto / u6_talk_to; verify: "
            f"u6_validate_passability. Avatar = slot 1.")


__all__ = ["u6_hook"]
