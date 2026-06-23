#!/usr/bin/env python3
"""
DOSBox Memory Inspector - generic "dosbox-memory" MCP server (Windows).

The INVESTIGATION WORKBENCH: Cheat-Engine-style discovery tools for reverse
engineering 16-bit DOS programs under DOSBox -- value/typed/AOB/fuzzy scans, a
struct dumper, and a persistent address table. Its output (discovered memory
layouts) is what you bake into a per-game decoder server (dosbox-u6, ...).

The routine plumbing (attach, calibrate via BDA scan, read/write, status,
disconnect) comes from the shared `dosbox_mem` library -- registered here with
register_base_tools, and reused unchanged by every game server. This file adds
ONLY the discovery tools on top. See README for the full workflow.
"""

import json
from typing import Optional

from mcp.server.fastmcp import FastMCP

import dosbox_mem as dm

mcp = FastMCP("dosbox-memory")


# ----------------------------------------------------------------------------
# Session state: core (handle/MemBase) from dm.Session + workbench fields
# (last scan set, fuzzy working set, address table). reset() also clears the
# workbench state so re-attaching to a new DOSBox doesn't leak stale host addrs.
# ----------------------------------------------------------------------------
class WorkbenchState(dm.Session):
    def __init__(self):
        super().__init__()
        self.last_scan: list[int] = []          # host addresses hit by last scan
        self.fuzzy_addrs: list[int] = []        # fuzzy candidate host addresses
        self.fuzzy_prev: list[int] = []         # their values at the previous step
        self.fuzzy_width: int = 2
        self.table: list = []                   # [{name, segment, offset, type, note}]
        self.table_path: Optional[str] = None

    def reset(self):
        super().reset()
        self.last_scan = []
        self.fuzzy_addrs = []
        self.fuzzy_prev = []


S = WorkbenchState()

# Register the shared base tools (find_dosbox / find_membase_auto /
# set_membase_from / read_dos / read_linear / write_dos / status / disconnect)
# on this server, operating on S. `base` lets us call them internally below.
base = dm.register_base_tools(mcp, S)

# Re-bind the shared primitives to the local names the workbench tool bodies use,
# so those bodies stay identical to the standalone version.
_read = dm.read
_write = dm.write
_iter_regions = dm.iter_regions
_pack = dm.pack
_encode = dm.encode
_decode = dm.decode
_type_width = dm.type_width
TYPES = dm.TYPES
HINT_NO_PROC = dm.HINT_NO_PROC
HINT_NO_MEMBASE = dm.HINT_NO_MEMBASE
HINT_EMPTY_TABLE = ("Address table is empty. Add entries with table_add(...) "
                    "or load a file with table_load(path).")


@mcp.tool()
def session_init(table_path: str = "",
                 known_segment: int = -1, known_offset: int = -1,
                 known_value: int = -1, known_width: int = 2) -> str:
    """One-shot startup: attach to DOSBox, auto-detect MemBase, and optionally
    load an address table -- the usual boot sequence in a single call.

    Pass a known variable (known_segment/offset/value/width) so MemBase
    calibration is cross-checked decisively; without it, detection rests on the
    DOS BIOS Data Area (BDA) signature alone (still reliable, and game-free).
    Pass table_path to also load a saved variable table; omit it on first run
    when no table exists yet.

    Returns a step-by-step boot report. If a step fails (e.g. DOSBox isn't
    running, or no large region exposed a BDA), the report says where it stopped
    and what to do next, and later steps are skipped."""
    lines = ["session_init:"]

    # Step 1: attach
    r1 = base.find_dosbox()
    ok1 = r1.startswith("Opened DOSBox")
    lines.append(f"  [1] find_dosbox      -> {'OK' if ok1 else 'FAILED'}")
    lines.append(f"      {r1.splitlines()[0]}")
    if not ok1:
        lines.append("  Stopped: could not attach. Make sure DOSBox is running, "
                     "then call session_init again.")
        return "\n".join(lines)

    # Step 2: calibrate MemBase
    r2 = base.find_membase_auto(known_segment, known_offset, known_value, known_width)
    ok2 = r2.startswith("MemBase auto-set")
    lines.append(f"  [2] find_membase_auto -> {'OK' if ok2 else 'FAILED'}")
    lines.append(f"      {r2.splitlines()[0]}")
    if not ok2:
        lines.append("  Stopped: MemBase not calibrated. The BDA signature wasn't "
                     "found -- DOSBox may still be starting up, or has an unusual "
                     "memory config. Retry once DOSBox is at its prompt, pass "
                     "known_segment/offset/value for a cross-check, or use the "
                     "manual scan flow.")
        return "\n".join(lines)
    had_known = (known_segment >= 0 and known_offset >= 0 and known_value >= 0)
    if not had_known:
        lines.append("      (no known variable supplied; calibration rests on the "
                     "BDA signature -- verify once with read_dos if unsure.)")

    # Step 3: optional table load
    if table_path:
        r3 = table_load(table_path)
        ok3 = r3.startswith("Loaded")
        lines.append(f"  [3] table_load        -> {'OK' if ok3 else 'FAILED'}")
        lines.append(f"      {r3.splitlines()[0]}")
        if not ok3:
            lines.append("  Note: attached and calibrated fine, but the table "
                         "didn't load. Fix the path or skip it; reads still work "
                         "via read_dos.")
            return "\n".join(lines)
    else:
        lines.append("  [3] table_load        -> skipped (no table_path)")

    # Final status + next step
    tail = ("table_read_all() to dump every known variable, or read_var(name)."
            if (table_path and S.table) else
            "read_dos(seg, off) now; add variables with table_add and table_save.")
    lines.append(f"  Ready. {tail}")
    return "\n".join(lines)


# ----------------------------------------------------------------------------
# Exact-value integer scanning
# ----------------------------------------------------------------------------
@mcp.tool()
def scan_value(value: int, width: int = 2) -> str:
    """First scan: find every address in the DOSBox process whose value equals `value`.
    `width` is the byte width (1/2/4); 16-bit values use 2.
    Results are stored; change the in-game value and call next_scan to narrow down."""
    if not S.handle:
        return HINT_NO_PROC
    needle = _pack(value, width)
    hits: list[int] = []
    CAP = 200_000
    for base, size in _iter_regions(S.handle):
        try:
            data = _read(S.handle, base, min(size, 64 * 1024 * 1024))
        except OSError:
            continue
        start = 0
        while True:
            i = data.find(needle, start)
            if i < 0:
                break
            hits.append(base + i)
            start = i + 1
            if len(hits) >= CAP:
                break
        if len(hits) >= CAP:
            break
    S.last_scan = hits
    return (f"First scan done: {len(hits)} addresses equal {value} (width={width}).\n"
            f"Change this value in-game, then call next_scan(new_value) to narrow down.")


@mcp.tool()
def next_scan(value: int, width: int = 2) -> str:
    """Subsequent scan: keep only addresses from the last hit list that now equal `value`.
    Repeat until 1 to a few addresses remain; that is your target variable."""
    if not S.last_scan:
        return "No scan results to narrow. Run scan_value(value, width) first."
    needle = _pack(value, width)
    survivors: list[int] = []
    for addr in S.last_scan:
        try:
            cur = _read(S.handle, addr, width)
        except OSError:
            continue
        if cur == needle:
            survivors.append(addr)
    S.last_scan = survivors
    sample = [hex(a) for a in survivors[:16]]
    note = ""
    if len(survivors) == 1:
        note = (f"\nPinned a single address {hex(survivors[0])}!"
                f"\nNext: if you know its DOS seg:off, call "
                f"set_membase_from({survivors[0]}, seg, off) to derive MemBase.")
    return f"Narrowed to {len(survivors)} addresses: {sample}{note}"


# ----------------------------------------------------------------------------
# Shared scan helpers
# ----------------------------------------------------------------------------
def _scan_regions(limit_to_dos: bool):
    """Yield (base, size) regions to scan. If limit_to_dos is True and MemBase
    is known, restrict to the 1MB+HMA emulated DOS window for speed/relevance."""
    if limit_to_dos and S.membase is not None:
        yield S.membase, 0x110000
        return
    for base, size in _iter_regions(S.handle):
        yield base, size


def _find_all(needle: bytes, alignment: int, limit_to_dos: bool, cap: int):
    """Find every offset of `needle`, optionally honoring alignment. Returns a
    list of host addresses (capped)."""
    hits: list[int] = []
    for base, size in _scan_regions(limit_to_dos):
        try:
            data = _read(S.handle, base, min(size, 64 * 1024 * 1024))
        except OSError:
            continue
        start = 0
        while True:
            i = data.find(needle, start)
            if i < 0:
                break
            addr = base + i
            if alignment <= 1 or addr % alignment == 0:
                hits.append(addr)
            start = i + 1
            if len(hits) >= cap:
                return hits
    return hits


# ----------------------------------------------------------------------------
# (1) Typed scanning with options
# ----------------------------------------------------------------------------
@mcp.tool()
def scan_typed(value: str, vtype: str = "u16", alignment: int = 1,
               dos_only: bool = True) -> str:
    """First scan with full type support.
    vtype: one of u8/i8/u16/i16/u32/i32/float/double/string.
    value: the value to find (numbers as text, e.g. "50" or "3.14"; for string
           the literal text).
    alignment: keep only hits whose address is a multiple of this (1 = no filter;
               2 or 4 cuts false positives for 16/32-bit values).
    dos_only: if MemBase is set, restrict to the emulated DOS memory window.
    Results are stored in last_scan for narrowing with next_scan_typed."""
    if not S.handle:
        return HINT_NO_PROC
    if vtype != "string" and vtype not in TYPES:
        return (f"Unknown vtype '{vtype}'. Retry with one of: "
                f"{', '.join(list(TYPES) + ['string'])}.")
    try:
        needle = _encode(float(value) if vtype in ("float", "double") else
                         (value if vtype == "string" else int(value, 0)), vtype)
    except ValueError:
        return (f"Could not parse value '{value}' as {vtype}. "
                f"Give a number for numeric types (e.g. 50 or 0x32), or plain text for string.")
    hits = _find_all(needle, alignment, dos_only, cap=200_000)
    S.last_scan = hits
    sample = [hex(a) for a in hits[:16]]
    return (f"Typed scan: {len(hits)} matches for {vtype} {value} "
            f"(alignment={alignment}, dos_only={dos_only}).\n"
            f"Sample: {sample}\n"
            f"Change the value in-game, then call next_scan_typed(new_value, vtype).")


@mcp.tool()
def next_scan_typed(value: str, vtype: str = "u16") -> str:
    """Narrow the stored last_scan to addresses that now equal `value` (typed)."""
    if not S.last_scan:
        return "No scan results to narrow. Run scan_typed(value, vtype) first."
    try:
        needle = _encode(float(value) if vtype in ("float", "double") else
                         (value if vtype == "string" else int(value, 0)), vtype)
    except ValueError:
        return (f"Could not parse value '{value}' as {vtype}. "
                f"Give a number for numeric types (e.g. 50 or 0x32), or plain text for string.")
    w = len(needle)
    survivors = []
    for addr in S.last_scan:
        try:
            if _read(S.handle, addr, w) == needle:
                survivors.append(addr)
        except OSError:
            continue
    S.last_scan = survivors
    sample = [hex(a) for a in survivors[:16]]
    note = ""
    if len(survivors) == 1:
        note = (f"\nPinned a single address {hex(survivors[0])}! "
                f"If you know its DOS seg:off, call set_membase_from.")
    return f"Narrowed to {len(survivors)} addresses: {sample}{note}"


# ----------------------------------------------------------------------------
# (2) AOB (array-of-bytes) pattern scan with wildcards
# ----------------------------------------------------------------------------
def _parse_aob(pattern: str):
    """Parse an AOB pattern like '8B 46 ?? 50 E8' into a list of (byte_or_None).
    Tokens of '??' or '?' are wildcards."""
    tokens = pattern.replace(",", " ").split()
    out = []
    for t in tokens:
        if t in ("??", "?", "*"):
            out.append(None)
        else:
            out.append(int(t, 16))
    return out


@mcp.tool()
def scan_aob(pattern: str, dos_only: bool = True, max_hits: int = 50) -> str:
    """Array-of-bytes scan. `pattern` is hex bytes with '??' wildcards, e.g.
    '8B 46 ?? 50 E8 ?? ??'. Finds code/data signatures that do NOT change with
    values, useful as stable anchors. Returns matching host addresses."""
    if not S.handle:
        return HINT_NO_PROC
    try:
        pat = _parse_aob(pattern)
    except ValueError:
        return (f"Could not parse AOB pattern '{pattern}'. "
                f"Use hex bytes with ?? wildcards, e.g. '8B 46 ?? 50 E8'.")
    if not pat:
        return "Empty pattern. Provide hex bytes with ?? wildcards, e.g. '8B 46 ?? 50 E8'."
    plen = len(pat)
    # Build a quick matcher; anchor search on the first non-wildcard byte.
    anchor_idx = next((i for i, b in enumerate(pat) if b is not None), 0)
    anchor = bytes([pat[anchor_idx]]) if pat[anchor_idx] is not None else None
    hits = []
    for base, size in _scan_regions(dos_only):
        try:
            data = _read(S.handle, base, min(size, 64 * 1024 * 1024))
        except OSError:
            continue
        start = 0
        n = len(data)
        while start <= n - plen:
            if anchor is not None:
                j = data.find(anchor, start + anchor_idx)
                if j < 0:
                    break
                pos = j - anchor_idx
                if pos < 0:
                    start = j + 1
                    continue
            else:
                pos = start
            ok = True
            for k in range(plen):
                if pat[k] is not None and data[pos + k] != pat[k]:
                    ok = False
                    break
            if ok:
                hits.append(base + pos)
                if len(hits) >= max_hits:
                    break
            start = pos + 1
        if len(hits) >= max_hits:
            break
    S.last_scan = hits
    sample = [hex(a) for a in hits[:max_hits]]
    return (f"AOB scan: {len(hits)} matches for '{pattern}' (dos_only={dos_only}).\n"
            f"{sample}\n"
            f"Use a stable hit as an anchor; if you know its DOS seg:off, "
            f"set_membase_from(host_addr, seg, off).")


# ----------------------------------------------------------------------------
# (3) Fuzzy scan  (snapshot stays server-side; only a summary is returned)
# ----------------------------------------------------------------------------
def _read_vals(addrs, width):
    """Read current integer values (unsigned little-endian) at each address."""
    out = []
    for a in addrs:
        try:
            out.append(int.from_bytes(_read(S.handle, a, width), "little"))
        except OSError:
            out.append(None)
    return out


@mcp.tool()
def fuzzy_new(vtype: str = "u16", dos_only: bool = True,
              max_candidates: int = 4_000_000) -> str:
    """Start a fuzzy (unknown-initial-value) scan. Snapshots every aligned slot
    in the scan window so you can later filter by increased/decreased/changed
    WITHOUT knowing the exact value. Use this for HP, coordinates, etc. where you
    only know the value 'went up' or 'changed'.
    The candidate list and snapshot are stored server-side and never returned;
    only counts come back, so this does not burden the AI context."""
    if not S.handle:
        return HINT_NO_PROC
    # Fuzzy comparisons (increased/decreased) only make sense for integer types.
    if vtype not in TYPES or vtype in ("float", "double"):
        return (f"Fuzzy scan needs an integer type, got '{vtype}'. "
                f"Retry with one of: u8/i8/u16/i16/u32/i32.")
    width = _type_width(vtype)
    addrs, prev = [], []
    total_bytes = 0
    for base, size in _scan_regions(dos_only):
        try:
            data = _read(S.handle, base, min(size, 64 * 1024 * 1024))
        except OSError:
            continue
        total_bytes += len(data)
        # step by width for natural alignment; this bounds memory use
        for off in range(0, len(data) - width + 1, width):
            chunk = data[off:off + width]
            addrs.append(base + off)
            prev.append(int.from_bytes(chunk, "little"))
            if len(addrs) >= max_candidates:
                break
        if len(addrs) >= max_candidates:
            break
    S.fuzzy_addrs = addrs
    S.fuzzy_prev = prev
    S.fuzzy_width = width
    return (f"Fuzzy scan started: {len(addrs)} candidate slots snapshotted "
            f"({vtype}, {total_bytes // 1024} KB scanned, dos_only={dos_only}).\n"
            f"Now change the value in-game, then call fuzzy_next with an operator: "
            f"increased / decreased / changed / unchanged / increased_by / decreased_by.")


@mcp.tool()
def fuzzy_next(op: str, delta: int = 0) -> str:
    """Filter the fuzzy candidate set by comparing current values to the previous
    snapshot. op: increased | decreased | changed | unchanged | increased_by |
    decreased_by | same_as_before. delta is used by *_by operators.
    Returns only the surviving count and a small sample (context-safe)."""
    if not S.fuzzy_addrs:
        return "No fuzzy session. Start one with fuzzy_new(vtype) first."
    w = S.fuzzy_width
    cur = _read_vals(S.fuzzy_addrs, w)
    keep_a, keep_p = [], []
    for addr, old, now in zip(S.fuzzy_addrs, S.fuzzy_prev, cur):
        if now is None:
            continue
        ok = (
            (op == "increased" and now > old) or
            (op == "decreased" and now < old) or
            (op == "changed" and now != old) or
            (op in ("unchanged", "same_as_before") and now == old) or
            (op == "increased_by" and now - old == delta) or
            (op == "decreased_by" and old - now == delta)
        )
        if ok:
            keep_a.append(addr)
            keep_p.append(now)  # advance snapshot to current
    S.fuzzy_addrs = keep_a
    S.fuzzy_prev = keep_p
    sample = [hex(a) for a in keep_a[:16]]
    note = ""
    if len(keep_a) == 1:
        note = (f"\nPinned {hex(keep_a[0])}! Look up its DOS seg:off in "
                f"your disassembly and call set_membase_from to calibrate.")
    elif len(keep_a) == 0:
        note = "\nNo survivors; the operator may not match. Start over with fuzzy_new."
    return f"Fuzzy '{op}': {len(keep_a)} candidates remain. Sample: {sample}{note}"


# ----------------------------------------------------------------------------
# (4) Structure dump
# ----------------------------------------------------------------------------
@mcp.tool()
def struct_dump(segment: int, offset: int, fields: str = "", size: int = 64) -> str:
    """Dump a structure at DOS seg:off and parse fields (MemBase must be set).
    `fields` is a comma-separated spec of name:type pairs in order, e.g.
    'x:u16, y:u16, z:u8, hp:i16, name:string8'. Types: u8/i8/u16/i16/u32/i32/
    float/double, or stringN for an N-byte string. If `fields` is empty, just
    show a raw hex dump of `size` bytes. Great for verifying struct layouts
    against your disassembly."""
    if S.membase is None:
        return HINT_NO_MEMBASE
    base_lin = (segment << 4) + offset
    host = S.membase + base_lin
    if not fields.strip():
        try:
            raw = _read(S.handle, host, size)
        except OSError as ex:
            return (f"Read failed at {segment:04X}:{offset:04X} (host 0x{host:x}): {ex}\n"
                    f"Check the address is mapped and MemBase is calibrated (status()).")
        return (f"struct @ {segment:04X}:{offset:04X} (host 0x{host:x}), {size} bytes:\n{raw.hex(' ')}\n"
                f"Pass fields='name:type, ...' to parse this into labelled values.")

    lines = [f"struct @ {segment:04X}:{offset:04X} (host 0x{host:x}):"]
    cur = 0
    for spec in fields.split(","):
        spec = spec.strip()
        if not spec or ":" not in spec:
            continue
        name, t = (s.strip() for s in spec.split(":", 1))
        if t.startswith("string"):
            n = int(t[6:]) if len(t) > 6 else 1
            try:
                raw = _read(S.handle, host + cur, n)
            except OSError as ex:
                lines.append(f"  +{cur:#04x} {name:<12} string[{n}] = <read error: {ex}>")
                cur += n
                continue
            text = raw.split(b"\x00", 1)[0].decode("latin-1", "replace")
            lines.append(f"  +{cur:#04x} {name:<12} string[{n}] = {text!r} ({raw.hex()})")
            cur += n
        elif t in TYPES:
            w = _type_width(t)
            try:
                raw = _read(S.handle, host + cur, w)
            except OSError as ex:
                lines.append(f"  +{cur:#04x} {name:<12} {t:<6} = <read error: {ex}>")
                cur += w
                continue
            val = _decode(raw, t)
            lines.append(f"  +{cur:#04x} {name:<12} {t:<6} = {val} ({raw.hex()})")
            cur += w
        else:
            lines.append(f"  +{cur:#04x} {name:<12} ?? unknown type '{t}'")
    return "\n".join(lines)


# ----------------------------------------------------------------------------
# Address table persistence
#
# The table stores stable DOS seg:off identifiers, never host addresses or
# MemBase (those change every run). Workflow: calibrate MemBase once per
# session, then table_read_all resolves every entry's seg:off into a live value.
# ----------------------------------------------------------------------------
def _norm_int(v) -> int:
    """Accept an int or a string like '0x1234' / '4660' and return an int."""
    if isinstance(v, int):
        return v
    return int(str(v), 0)


def _valid_type(t: str) -> bool:
    return t in TYPES or t == "string" or t.startswith("string")


@mcp.tool()
def table_add(name: str, segment: int, offset: int,
              vtype: str = "u16", note: str = "") -> str:
    """Add (or update) a variable in the address table.
    Stores DOS segment:offset plus name/type/note. segment and offset may be
    given as ints or hex strings like '0x1234'. If `name` already exists it is
    overwritten. This does not save to disk; call table_save to persist."""
    try:
        seg = _norm_int(segment)
        off = _norm_int(offset)
    except (ValueError, TypeError):
        return "segment/offset must be an integer or a hex string like '0x1234'."
    if not _valid_type(vtype):
        return (f"Invalid type '{vtype}'. Retry with "
                f"u8/i8/u16/i16/u32/i32/float/double/stringN.")
    entry = {"name": name, "segment": seg, "offset": off, "type": vtype, "note": note}
    for i, e in enumerate(S.table):
        if e["name"] == name:
            S.table[i] = entry
            return (f"Updated '{name}' -> {seg:04X}:{off:04X} {vtype}. "
                f"Table has {len(S.table)} entries. Call table_save(path) to persist.")
    S.table.append(entry)
    return (f"Added '{name}' -> {seg:04X}:{off:04X} {vtype}. "
            f"Table has {len(S.table)} entries. read_var('{name}') once MemBase is set; "
            f"table_save(path) to persist.")


@mcp.tool()
def table_remove(name: str) -> str:
    """Remove a variable from the address table by name."""
    before = len(S.table)
    S.table = [e for e in S.table if e["name"] != name]
    if len(S.table) == before:
        return f"No entry named '{name}'. Use table_list() to see current entries."
    return f"Removed '{name}'. Table has {len(S.table)} entries."


@mcp.tool()
def table_list() -> str:
    """List all entries in the address table (names, seg:off, types, notes)."""
    if not S.table:
        return HINT_EMPTY_TABLE
    lines = [f"Address table ({len(S.table)} entries):"]
    for e in S.table:
        note = f"  -- {e['note']}" if e.get("note") else ""
        lines.append(f"  {e['name']:<16} {e['segment']:04X}:{e['offset']:04X} "
                     f"{e['type']}{note}")
    return "\n".join(lines)


@mcp.tool()
def table_save(path: str = "") -> str:
    """Save the address table to a JSON file. If `path` is omitted, reuses the
    last path from table_load/table_save. Stores only stable seg:off data, so the
    file stays valid across DOSBox restarts."""
    target = path or S.table_path
    if not target:
        return "No path given and none remembered. Call table_save(path) with a file path."
    data = {"version": 1, "entries": S.table}
    try:
        with open(target, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except OSError as ex:
        return f"Could not write '{target}': {ex}"
    S.table_path = target
    return f"Saved {len(S.table)} entries to {target}."


@mcp.tool()
def table_load(path: str, merge: bool = False) -> str:
    """Load an address table from a JSON file. By default this replaces the
    current table; set merge=True to add to it (entries with the same name are
    overwritten). Does not need MemBase; you still calibrate separately, then use
    table_read_all to resolve values."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as ex:
        return f"Could not read '{path}': {ex}"
    entries = data.get("entries", []) if isinstance(data, dict) else []
    # Normalize and validate each entry; tolerate hex strings for seg/off.
    clean = []
    for e in entries:
        try:
            clean.append({
                "name": str(e["name"]),
                "segment": _norm_int(e["segment"]),
                "offset": _norm_int(e["offset"]),
                "type": e.get("type", "u16"),
                "note": e.get("note", ""),
            })
        except (KeyError, ValueError, TypeError):
            continue
    if merge:
        by_name = {e["name"]: e for e in S.table}
        for e in clean:
            by_name[e["name"]] = e
        S.table = list(by_name.values())
    else:
        S.table = clean
    S.table_path = path
    return (f"Loaded {len(clean)} entries from {path} "
            f"(table now has {len(S.table)}). "
            f"Calibrate MemBase, then call table_read_all.")


@mcp.tool()
def table_read_all() -> str:
    """Read the current value of every entry in the table using the calibrated
    MemBase. This is the payoff: one call dumps the live state of all your known
    variables. Requires MemBase to be set."""
    if S.membase is None:
        return HINT_NO_MEMBASE
    if not S.table:
        return HINT_EMPTY_TABLE
    lines = [f"Live values ({len(S.table)} entries, MemBase=0x{S.membase:x}):"]
    for e in S.table:
        seg, off, t = e["segment"], e["offset"], e["type"]
        host = S.membase + (seg << 4) + off
        try:
            if t.startswith("string"):
                n = int(t[6:]) if len(t) > 6 else 1
                raw = _read(S.handle, host, n)
                val = repr(raw.split(b"\x00", 1)[0].decode("latin-1", "replace"))
            else:
                w = _type_width(t)
                val = _decode(_read(S.handle, host, w), t)
        except (OSError, KeyError) as ex:
            val = f"<read error: {ex}>"
        note = f"  ({e['note']})" if e.get("note") else ""
        lines.append(f"  {e['name']:<16} {seg:04X}:{off:04X} {t:<8} = {val}{note}")
    return "\n".join(lines)


# ----------------------------------------------------------------------------
# Name-based access: operate on a variable by its table name (a stable handle),
# so the AI never has to carry volatile host addresses or re-specify seg:off.
# ----------------------------------------------------------------------------
def _lookup(name: str) -> Optional[dict]:
    for e in S.table:
        if e["name"] == name:
            return e
    return None


@mcp.tool()
def read_var(name: str) -> str:
    """Read a variable by its table name (the preferred way to read).
    Looks up name -> seg:off/type in the address table and reads the live value
    using the calibrated MemBase. Add entries with table_add or table_load first."""
    if S.membase is None:
        return HINT_NO_MEMBASE
    e = _lookup(name)
    if e is None:
        names = ", ".join(x["name"] for x in S.table) or "(table is empty)"
        return f"No variable named '{name}'. Known: {names}. Add one with table_add."
    seg, off, t = e["segment"], e["offset"], e["type"]
    host = S.membase + (seg << 4) + off
    try:
        if t.startswith("string"):
            n = int(t[6:]) if len(t) > 6 else 1
            raw = _read(S.handle, host, n)
            val = repr(raw.split(b"\x00", 1)[0].decode("latin-1", "replace"))
        else:
            val = _decode(_read(S.handle, host, _type_width(t)), t)
    except (OSError, KeyError) as ex:
        return f"Read error for '{name}' @ {seg:04X}:{off:04X}: {ex}"
    note = f"  ({e['note']})" if e.get("note") else ""
    return f"{name} = {val}  [{seg:04X}:{off:04X} {t}]{note}"


@mcp.tool()
def write_var(name: str, value: str) -> str:
    """Write a variable by its table name (the preferred way to write).
    Looks up name -> seg:off/type, encodes `value` per the entry's type, and
    writes it. Use with care; save the program state first.
    `value` is text: a number for numeric types, or the literal text for strings."""
    if S.membase is None:
        return HINT_NO_MEMBASE
    e = _lookup(name)
    if e is None:
        names = ", ".join(x["name"] for x in S.table) or "(table is empty)"
        return f"No variable named '{name}'. Known: {names}."
    seg, off, t = e["segment"], e["offset"], e["type"]
    host = S.membase + (seg << 4) + off
    try:
        if t.startswith("string"):
            n = int(t[6:]) if len(t) > 6 else 1
            data = value.encode("latin-1")[:n].ljust(n, b"\x00")
        elif t in ("float", "double"):
            data = _encode(float(value), t)
        else:
            data = _encode(int(value, 0), t)
    except (ValueError, KeyError) as ex:
        return f"Could not encode '{value}' as {t}: {ex}"
    try:
        written = _write(S.handle, host, data)
    except OSError as ex:
        return f"Write error for '{name}' @ {seg:04X}:{off:04X}: {ex}"
    return f"Wrote {name} <- {value}  ({written} bytes @ {seg:04X}:{off:04X} {t})"


if __name__ == "__main__":
    mcp.run()
