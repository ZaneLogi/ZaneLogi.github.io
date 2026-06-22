#!/usr/bin/env python3
"""
DOSBox Memory Inspector - MCP Server (Windows)

Inspects DOSBox's emulated memory like Cheat Engine, for reverse
engineering 16-bit real-mode DOS programs.

Key concept: DOSBox stores its emulated 8086 memory as one contiguous
block in its own process, starting at MemBase. A DOS address is
segment:offset, so:  host address = MemBase + (seg*16 + off)
Calibrate MemBase once (via scan or find_membase_auto), then read any
variable by its seg:off. See README for the full workflow.
"""

import ctypes
import ctypes.wintypes as wt
import json
import os
import struct
import sys
from typing import Optional

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("dosbox-memory-inspector")

# ----------------------------------------------------------------------------
# Windows API bindings
# ----------------------------------------------------------------------------
PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_VM_READ           = 0x0010
PROCESS_VM_WRITE          = 0x0020
PROCESS_VM_OPERATION      = 0x0008
ACCESS = (PROCESS_QUERY_INFORMATION | PROCESS_VM_READ
          | PROCESS_VM_WRITE | PROCESS_VM_OPERATION)

MEM_COMMIT  = 0x1000
PAGE_READABLE = {0x02, 0x04, 0x08, 0x20, 0x40, 0x80}  # readable protection flags


class MEMORY_BASIC_INFORMATION64(ctypes.Structure):
    _fields_ = [
        ("BaseAddress", ctypes.c_ulonglong),
        ("AllocationBase", ctypes.c_ulonglong),
        ("AllocationProtect", wt.DWORD),
        ("__alignment1", wt.DWORD),
        ("RegionSize", ctypes.c_ulonglong),
        ("State", wt.DWORD),
        ("Protect", wt.DWORD),
        ("Type", wt.DWORD),
        ("__alignment2", wt.DWORD),
    ]


def _k32():
    return ctypes.WinDLL("kernel32", use_last_error=True)


# ----------------------------------------------------------------------------
# Global state (kept for the lifetime of a single session)
# ----------------------------------------------------------------------------
class State:
    pid: Optional[int] = None
    handle: Optional[int] = None
    membase: Optional[int] = None          # DOSBox emulated-memory base (host addr)
    last_scan: list[int] = []              # host addresses hit by the last scan
    # Fuzzy-scan working set: parallel lists kept server-side, never returned whole.
    fuzzy_addrs: list[int] = []            # candidate host addresses
    fuzzy_prev: list[int] = []             # their values at the previous fuzzy step
    fuzzy_width: int = 2                   # byte width used for the fuzzy session
    # Address table: list of dicts {name, segment, offset, type, note}.
    # Stores DOS seg:off (stable), NEVER host addresses (which change per run).
    table: list = []
    table_path: Optional[str] = None       # last file used, for convenience saves

S = State()


# ----------------------------------------------------------------------------
# Shared hint strings, so every tool points at the same consistent next step.
# Each error/edge return should tell the AI what to do next, not just what failed.
# ----------------------------------------------------------------------------
HINT_NO_PROC   = "Not attached to DOSBox. Call find_dosbox() first."
HINT_NO_MEMBASE = ("MemBase not set. Calibrate first: find_membase_auto(...) "
                   "(ideally with a known variable), or scan_value -> next_scan "
                   "-> set_membase_from.")
HINT_EMPTY_TABLE = ("Address table is empty. Add entries with table_add(...) "
                    "or load a file with table_load(path).")


# ----------------------------------------------------------------------------
# Low level: open process, enumerate regions, read/write
# ----------------------------------------------------------------------------
def _open(pid: int) -> int:
    k32 = _k32()
    h = k32.OpenProcess(ACCESS, False, pid)
    if not h:
        raise OSError(f"OpenProcess failed (pid={pid}); run as Administrator."
                      f" err={ctypes.get_last_error()}")
    return h


def _reset_session():
    """Close any open process handle and clear all per-process state.
    Called before attaching to a (possibly different) DOSBox so nothing from a
    previous session leaks: an unclosed kernel handle, or a stale MemBase / scan
    set that would be garbage for a new process. The persistent address table is
    intentionally NOT cleared (it holds stable seg:off, reusable across runs)."""
    if S.handle:
        try:
            _k32().CloseHandle(wt.HANDLE(S.handle))
        except Exception:
            pass
    S.handle = None
    S.pid = None
    S.membase = None
    S.last_scan = []
    S.fuzzy_addrs = []
    S.fuzzy_prev = []


def _iter_regions(handle: int):
    """Yield every committed, readable memory region in the target process."""
    k32 = _k32()
    VirtualQueryEx = k32.VirtualQueryEx
    VirtualQueryEx.restype = ctypes.c_size_t
    addr = 0
    mbi = MEMORY_BASIC_INFORMATION64()
    max_addr = 0x7FFFFFFFFFFF
    while addr < max_addr:
        ok = VirtualQueryEx(wt.HANDLE(handle), ctypes.c_void_p(addr),
                            ctypes.byref(mbi), ctypes.sizeof(mbi))
        if not ok:
            break
        if (mbi.State == MEM_COMMIT
                and (mbi.Protect & 0xFF) in PAGE_READABLE
                and mbi.RegionSize > 0):
            yield mbi.BaseAddress, mbi.RegionSize
        nxt = mbi.BaseAddress + mbi.RegionSize
        if nxt <= addr:
            break
        addr = nxt


def _read(handle: int, addr: int, size: int) -> bytes:
    k32 = _k32()
    buf = ctypes.create_string_buffer(size)
    n = ctypes.c_size_t(0)
    ok = k32.ReadProcessMemory(wt.HANDLE(handle), ctypes.c_void_p(addr),
                               buf, size, ctypes.byref(n))
    if not ok:
        raise OSError(f"ReadProcessMemory failed @0x{addr:x} err={ctypes.get_last_error()}")
    return buf.raw[:n.value]


def _write(handle: int, addr: int, data: bytes) -> int:
    k32 = _k32()
    n = ctypes.c_size_t(0)
    ok = k32.WriteProcessMemory(wt.HANDLE(handle), ctypes.c_void_p(addr),
                                data, len(data), ctypes.byref(n))
    if not ok:
        raise OSError(f"WriteProcessMemory failed @0x{addr:x} err={ctypes.get_last_error()}")
    return n.value


# ----------------------------------------------------------------------------
# Type system for typed scanning
# ----------------------------------------------------------------------------
# Each type maps to a struct format and a byte width.
# Integer types cover signed/unsigned 1/2/4 bytes; plus float/double.
TYPES = {
    "u8":  ("<B", 1), "i8":  ("<b", 1),
    "u16": ("<H", 2), "i16": ("<h", 2),
    "u32": ("<I", 4), "i32": ("<i", 4),
    "float": ("<f", 4), "double": ("<d", 8),
}


def _type_width(vtype: str) -> int:
    if vtype == "string":
        return 0  # variable; handled separately
    return TYPES[vtype][1]


def _encode(value, vtype: str) -> bytes:
    """Encode a Python value into raw little-endian bytes for the given type."""
    if vtype == "string":
        return value.encode("latin-1") if isinstance(value, str) else bytes(value)
    fmt, _ = TYPES[vtype]
    if vtype in ("float", "double"):
        return struct.pack(fmt, float(value))
    return struct.pack(fmt, int(value))


def _decode(raw: bytes, vtype: str):
    """Decode raw bytes into a Python value for the given type."""
    if vtype == "string":
        return raw
    fmt, w = TYPES[vtype]
    return struct.unpack(fmt, raw[:w])[0]


# Legacy helper kept for the original integer tools (width = 1/2/4).
def _pack(value: int, width: int) -> bytes:
    return {1: struct.pack("<B", value & 0xFF),
            2: struct.pack("<H", value & 0xFFFF),
            4: struct.pack("<I", value & 0xFFFFFFFF)}[width]


# ----------------------------------------------------------------------------
# MCP tools
# ----------------------------------------------------------------------------
@mcp.tool()
def find_dosbox() -> str:
    """Find a running DOSBox process and open it.
    Returns the pid and executable name. This server must run as Administrator."""
    k32 = _k32()
    TH32CS_SNAPPROCESS = 0x2

    class PROCESSENTRY32(ctypes.Structure):
        _fields_ = [("dwSize", wt.DWORD), ("cntUsage", wt.DWORD),
                    ("th32ProcessID", wt.DWORD), ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
                    ("th32ModuleID", wt.DWORD), ("cntThreads", wt.DWORD),
                    ("th32ParentProcessID", wt.DWORD), ("pcPriClassBase", ctypes.c_long),
                    ("dwFlags", wt.DWORD), ("szExeFile", ctypes.c_char * 260)]

    snap = k32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    entry = PROCESSENTRY32()
    entry.dwSize = ctypes.sizeof(PROCESSENTRY32)
    found = []
    if k32.Process32First(snap, ctypes.byref(entry)):
        while True:
            name = entry.szExeFile.decode(errors="ignore")
            if "dosbox" in name.lower():
                found.append((entry.th32ProcessID, name))
            if not k32.Process32Next(snap, ctypes.byref(entry)):
                break
    k32.CloseHandle(snap)

    if not found:
        return "No DOSBox process found. Make sure DOSBox is running with the target program loaded."
    pid, name = found[0]
    # Close the previous handle and clear stale per-process state before
    # attaching to this process, so nothing leaks or carries over.
    _reset_session()
    S.pid = pid
    S.handle = _open(pid)
    extra = ""
    if len(found) > 1:
        extra = f"\n(Multiple found: {found}; selected the first.)"
    return f"Opened DOSBox: pid={pid} exe={name}{extra}\nNext: run scan_value on a known value."


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


@mcp.tool()
def set_membase_from(host_addr: int, segment: int, offset: int) -> str:
    """Derive DOSBox's MemBase from a known variable's host address plus its
    DOS segment:offset (e.g. from your disassembly). Once set, use read_dos to
    read any variable."""
    linear = (segment << 4) + offset
    S.membase = host_addr - linear
    return (f"MemBase set to 0x{S.membase:x}\n"
            f"(host 0x{host_addr:x} maps to DOS {segment:04X}:{offset:04X}, linear=0x{linear:x})\n"
            f"You can now read variables with read_dos(seg, off, width), or load a "
            f"table and use read_var(name) / table_read_all().")


@mcp.tool()
def read_dos(segment: int, offset: int, width: int = 2) -> str:
    """Read a variable by DOS segment:offset (MemBase must be set)."""
    if S.membase is None:
        return HINT_NO_MEMBASE
    linear = (segment << 4) + offset
    host = S.membase + linear
    try:
        raw = _read(S.handle, host, width)
    except OSError as ex:
        return (f"Read failed at DOS {segment:04X}:{offset:04X} (host 0x{host:x}): {ex}\n"
                f"Check the address is mapped and MemBase is calibrated (status()).")
    val = int.from_bytes(raw, "little")
    return (f"DOS {segment:04X}:{offset:04X} (host 0x{host:x}) = {val} "
            f"(0x{val:x}) raw={raw.hex()}")


@mcp.tool()
def read_linear(linear: int, size: int = 16) -> str:
    """Read a block of memory by 8086 linear address and show a hex dump
    (MemBase must be set)."""
    if S.membase is None:
        return HINT_NO_MEMBASE
    host = S.membase + linear
    try:
        raw = _read(S.handle, host, size)
    except OSError as ex:
        return (f"Read failed at linear 0x{linear:x} (host 0x{host:x}): {ex}\n"
                f"Check the address is mapped and MemBase is calibrated (status()).")
    return f"linear=0x{linear:x} (host 0x{host:x}):\n{raw.hex(' ')}"


@mcp.tool()
def write_dos(segment: int, offset: int, value: int, width: int = 2) -> str:
    """Write a variable (change a value). Use with care; save the program state first."""
    if S.membase is None:
        return HINT_NO_MEMBASE
    host = S.membase + (segment << 4) + offset
    try:
        n = _write(S.handle, host, _pack(value, width))
    except OSError as ex:
        return (f"Write failed at DOS {segment:04X}:{offset:04X} (host 0x{host:x}): {ex}\n"
                f"Check the address is mapped and MemBase is calibrated (status()).")
    return f"Wrote {n} bytes: DOS {segment:04X}:{offset:04X} <- {value}"


# ----------------------------------------------------------------------------
# MemBase auto-detection via the DOS BIOS Data Area (BDA)
#
# DOSBox does NOT map a ROM BIOS image at segment F000 -- the reset vector at
# linear 0xFFFF0 and the BIOS date string are absent (read back as zero), so the
# classic PC-BIOS fingerprints are useless here. What IS always present, even
# with only the DOSBox shell loaded, is the BIOS Data Area at the fixed linear
# address 0x400 (segment 0x40): the COM/LPT I/O-port table, the equipment word,
# the conventional-memory size (DOSBox = 640 KB), and a live timer-tick counter.
# We locate the BDA by that signature and derive MemBase = host(BDA) - 0x400.
# MemBase is NOT necessarily the region start (observed +0x20 on real DOSBox), so
# we scan for the signature rather than probing a few fixed offsets.
# ----------------------------------------------------------------------------
BDA_COM1    = 0x400   # word: COM1 I/O port   (DOSBox default 0x03F8)
BDA_LPT1    = 0x408   # word: LPT1 I/O port   (DOSBox default 0x0378)
BDA_EQUIP   = 0x410   # word: equipment list  (non-zero, not 0xFFFF)
BDA_BASEMEM = 0x413   # word: conventional memory in KB (DOSBox = 640 = 0x280)
BDA_TIMER   = 0x46C   # dword: timer-tick count, increments ~18.2 Hz

# Plausible I/O-port values across common DOSBox / PC configs.
_COM_PORTS = {0x3F8, 0x2F8, 0x3E8, 0x2E8}
_LPT_PORTS = {0x378, 0x278, 0x3BC}


def _score_bda(buf: bytes, off: int) -> tuple[int, list]:
    """Score a candidate MemBase sitting at byte offset `off` within `buf`, by
    checking BDA invariants at their fixed linear addresses. Returns
    (score, evidence), or (0, []) if this is not a BDA.

    The conventional-memory word @40:13 is the decisive discriminator: DOSBox
    invariably reports 640 KB (639 with an EBDA), a value that -- combined with
    the COM1/LPT1 ports at their exact relative offsets -- is far too specific to
    hit by chance. A loose range here produced false positives in DOSBox's own
    host heap (e.g. a 511-KB word next to a stray 0x03F8), so it is mandatory."""
    def word(linear):
        p = off + linear
        return int.from_bytes(buf[p:p + 2], "little") if 0 <= p and p + 2 <= len(buf) else None

    def dword(linear):
        p = off + linear
        return int.from_bytes(buf[p:p + 4], "little") if 0 <= p and p + 4 <= len(buf) else None

    basemem = word(BDA_BASEMEM)
    if basemem not in (639, 640):        # mandatory: not a DOSBox BDA otherwise
        return 0, []
    com1, lpt1 = word(BDA_COM1), word(BDA_LPT1)
    com1_ok, lpt1_ok = com1 in _COM_PORTS, lpt1 in _LPT_PORTS
    if not (com1_ok or lpt1_ok):         # mandatory: the I/O-port table is the
        return 0, []                     # real signature; 640 KB alone is not enough
    score = 3
    ev = [f"BDA base memory @40:13 = {basemem} KB"]
    if com1_ok:
        score += 1
        ev.append(f"BDA COM1 @40:00 = {com1:#06x}")
    if lpt1_ok:
        score += 1
        ev.append(f"BDA LPT1 @40:08 = {lpt1:#06x}")
    equip = word(BDA_EQUIP)
    if equip not in (None, 0x0000, 0xFFFF):
        score += 1
        ev.append(f"BDA equipment word @40:10 = {equip:#06x}")
    tick = dword(BDA_TIMER)
    if tick not in (None, 0, 0xFFFFFFFF):
        score += 1
        ev.append(f"BDA timer tick @40:6C = {tick}")
    return score, ev


def _detect_membase_bda(handle: int, known: Optional[tuple] = None) -> tuple:
    """Find MemBase by locating the DOS BIOS Data Area in every large region.
    Anchors the search on two stable BDA bytes -- the COM1 port word (0x03F8) and
    the 640-KB conventional-memory word -- validates the surrounding BDA with
    _score_bda, and derives MemBase = host(BDA) - 0x400. A known variable
    (seg, off, value, width), if given, is verified with a live read as a
    decisive tie-breaker. Returns (membase, evidence_list, others) where `others`
    is a short list of runner-up (score, hex_addr); (None, [], []) on failure."""
    WINDOW = 0x200000  # 2 MB from each region start covers the BDA + low DS data
    found = {}         # membase -> (score, evidence)
    for base, size in _iter_regions(handle):
        if size < 0x110000:        # DOSBox emulated RAM is at least ~1 MB
            continue
        try:
            buf = _read(handle, base, min(size, WINDOW))
        except OSError:
            continue
        for anchor, anchor_linear in ((b"\xf8\x03", BDA_COM1),     # COM1 = 0x03F8
                                      (b"\x80\x02", BDA_BASEMEM)):  # basemem = 640
            start = 0
            while len(found) <= 64:
                i = buf.find(anchor, start)
                if i < 0:
                    break
                start = i + 1
                off = i - anchor_linear
                if off < 0:
                    continue
                cand = base + off
                if cand in found:
                    continue
                score, ev = _score_bda(buf, off)
                if score >= 5:        # mandatory base memory (3) + >=2 corroborators
                    found[cand] = (score, ev)
    if not found:
        return None, [], []

    ranked = sorted(((sc, mb, ev) for mb, (sc, ev) in found.items()), reverse=True)

    # A known variable is decisive: prefer candidates whose live read matches.
    if known:
        seg, koff, val, w = known
        mask = (1 << (8 * w)) - 1
        confirmed = []
        for sc, mb, ev in ranked:
            try:
                cur = int.from_bytes(_read(handle, mb + (seg << 4) + koff, w), "little")
            except OSError:
                continue
            if cur == (val & mask):
                confirmed.append((sc + 5, mb,
                                  ev + [f"known var {seg:04X}:{koff:04X} == {val}"]))
        if confirmed:
            ranked = sorted(confirmed, reverse=True)
        # If nothing matched, fall through to the BDA-only ranking: the supplied
        # value may be wrong or the program may not be in that state yet.

    best_score, best, best_ev = ranked[0]
    others = [(s, hex(a)) for s, a, _ in ranked[1:4]]
    return best, [f"(match score {best_score})"] + best_ev, others


@mcp.tool()
def find_membase_auto(known_segment: int = -1, known_offset: int = -1,
                      known_value: int = -1, known_width: int = 2) -> str:
    """Auto-detect DOSBox's MemBase without a manual scan, using the DOS BIOS
    Data Area (BDA) as the footprint.

    DOSBox maps no ROM BIOS at segment F000 (no reset vector / date string), so
    this does NOT use PC-BIOS fingerprints. Instead it locates the BDA at its
    fixed linear address 0x400 -- the COM/LPT port table, equipment word, the
    640-KB conventional-memory word and the live timer tick -- and derives
    MemBase = host(BDA) - 0x400. Because it scans for the signature, it works
    even when MemBase is not at the region start, and with only the DOSBox shell
    loaded (no game needed).

    Pass a known variable (known_segment/offset/value/width) for a decisive
    cross-check; without it, detection rests on the BDA signature alone. On
    success MemBase is set directly."""
    if not S.handle:
        return HINT_NO_PROC

    known = None
    if known_segment >= 0 and known_offset >= 0 and known_value >= 0:
        known = (known_segment, known_offset, known_value, known_width)

    best, evidence, others = _detect_membase_bda(S.handle, known)
    if best is None:
        return ("Auto-detect failed: no region exposed a recognizable DOS BIOS "
                "Data Area (BDA) signature.\nFall back to the manual flow "
                "(scan_value -> next_scan -> set_membase_from), or pin any value "
                "you can see on screen and use set_membase_from.")

    S.membase = best
    detail = "\n  - ".join(evidence)
    extra = f"\n(Other candidates: {others}; picked the highest score.)" if others else ""
    return (f"MemBase auto-set to 0x{best:x}\n"
            f"Evidence:\n  - {detail}{extra}\n"
            f"You can now read variables directly with read_dos / read_linear."
            + ("" if known else
               "\nTip: no known-variable check was provided; the BDA signature is "
               "reliable, but you can verify once with read_dos against a value you know."))


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
    r1 = find_dosbox()
    ok1 = r1.startswith("Opened DOSBox")
    lines.append(f"  [1] find_dosbox      -> {'OK' if ok1 else 'FAILED'}")
    lines.append(f"      {r1.splitlines()[0]}")
    if not ok1:
        lines.append("  Stopped: could not attach. Make sure DOSBox is running, "
                     "then call session_init again.")
        return "\n".join(lines)

    # Step 2: calibrate MemBase
    r2 = find_membase_auto(known_segment, known_offset, known_value, known_width)
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
    """Parse an AOB pattern like '8B 46 ?? 50 E8' into (regex_bytes, mask).
    Tokens of '??' or '?' are wildcards. Returns a list of (byte_or_None)."""
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


@mcp.tool()
def disconnect() -> str:
    """Detach from DOSBox: close the process handle and clear MemBase and scan
    state. The saved address table is kept. Useful before reopening a different
    DOSBox, or to release the handle when done."""
    had = S.pid
    _reset_session()
    return (f"Disconnected from pid={had}; handle closed and scan/MemBase state cleared."
            if had else "Nothing was connected.")


@mcp.tool()
def status() -> str:
    """Show the current connection and calibration state."""
    return (f"pid={S.pid} membase="
            f"{'0x%x' % S.membase if S.membase else 'unset'} "
            f"last_scan={len(S.last_scan)} addresses "
            f"fuzzy={len(S.fuzzy_addrs)} candidates "
            f"table={len(S.table)} entries")


if __name__ == "__main__":
    mcp.run()
