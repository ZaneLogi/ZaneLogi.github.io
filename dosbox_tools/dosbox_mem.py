#!/usr/bin/env python3
"""
DOSBox memory-access core (shared library).

Low-level Windows process-memory access for DOSBox reverse engineering, plus
MemBase calibration (BDA scan) and `register_base_tools(mcp, S)` -- which gives
ANY FastMCP server the routine tools every DOSBox variant needs: attach,
calibrate, read/write, status, disconnect.

This module has NO game-specific knowledge and NO investigation tools. The
discovery workbench (scan_* / fuzzy_* / struct_dump / table_*) lives in the
`dosbox-memory` server; game decoders (u6_inventory, ...) live in per-game
servers (dosbox-u6, ...). All of them import THIS for the shared base.

Key concept: DOSBox stores its emulated 8086 memory as one contiguous block in
its own process, starting at MemBase. A DOS address is segment:offset, so:
    host address = MemBase + (seg*16 + off)
Calibrate MemBase once (find_membase_auto / set_membase_from), then read any
variable by its seg:off.
"""

import ctypes
import ctypes.wintypes as wt
import struct
from types import SimpleNamespace
from typing import Optional


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
# Shared hint strings, so every server points at the same consistent next step.
# ----------------------------------------------------------------------------
HINT_NO_PROC = "Not attached to DOSBox. Call find_dosbox() first."
HINT_NO_MEMBASE = ("MemBase not set. Calibrate first: find_membase_auto(...) "
                   "(optionally with a known variable), or set_membase_from.")


# ----------------------------------------------------------------------------
# Low level: open process, enumerate regions, read/write
# ----------------------------------------------------------------------------
def open_process(pid: int) -> int:
    k32 = _k32()
    h = k32.OpenProcess(ACCESS, False, pid)
    if not h:
        raise OSError(f"OpenProcess failed (pid={pid}); if DOSBox is running "
                      f"elevated, run elevated to match. "
                      f"err={ctypes.get_last_error()}")
    return h


def iter_regions(handle: int):
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


def read(handle: int, addr: int, size: int) -> bytes:
    k32 = _k32()
    buf = ctypes.create_string_buffer(size)
    n = ctypes.c_size_t(0)
    ok = k32.ReadProcessMemory(wt.HANDLE(handle), ctypes.c_void_p(addr),
                               buf, size, ctypes.byref(n))
    if not ok:
        raise OSError(f"ReadProcessMemory failed @0x{addr:x} err={ctypes.get_last_error()}")
    return buf.raw[:n.value]


def write(handle: int, addr: int, data: bytes) -> int:
    k32 = _k32()
    n = ctypes.c_size_t(0)
    ok = k32.WriteProcessMemory(wt.HANDLE(handle), ctypes.c_void_p(addr),
                                data, len(data), ctypes.byref(n))
    if not ok:
        raise OSError(f"WriteProcessMemory failed @0x{addr:x} err={ctypes.get_last_error()}")
    return n.value


# ----------------------------------------------------------------------------
# Type system (shared by typed scans, struct dumps, and the address table)
# ----------------------------------------------------------------------------
# Each type maps to a struct format and a byte width.
TYPES = {
    "u8":  ("<B", 1), "i8":  ("<b", 1),
    "u16": ("<H", 2), "i16": ("<h", 2),
    "u32": ("<I", 4), "i32": ("<i", 4),
    "float": ("<f", 4), "double": ("<d", 8),
}


def type_width(vtype: str) -> int:
    if vtype == "string":
        return 0  # variable; handled separately
    return TYPES[vtype][1]


def encode(value, vtype: str) -> bytes:
    """Encode a Python value into raw little-endian bytes for the given type."""
    if vtype == "string":
        return value.encode("latin-1") if isinstance(value, str) else bytes(value)
    fmt, _ = TYPES[vtype]
    if vtype in ("float", "double"):
        return struct.pack(fmt, float(value))
    return struct.pack(fmt, int(value))


def decode(raw: bytes, vtype: str):
    """Decode raw bytes into a Python value for the given type."""
    if vtype == "string":
        return raw
    fmt, w = TYPES[vtype]
    return struct.unpack(fmt, raw[:w])[0]


def pack(value: int, width: int) -> bytes:
    """Pack an integer into 1/2/4 little-endian bytes (masked)."""
    return {1: struct.pack("<B", value & 0xFF),
            2: struct.pack("<H", value & 0xFFFF),
            4: struct.pack("<I", value & 0xFFFFFFFF)}[width]


# ----------------------------------------------------------------------------
# Per-session state: handle + MemBase. Game / workbench servers subclass this to
# add their own state (e.g. the workbench adds scan/fuzzy/table fields and
# extends reset()). The base tools below operate on whatever Session you pass.
# ----------------------------------------------------------------------------
class Session:
    def __init__(self):
        self.pid: Optional[int] = None
        self.handle: Optional[int] = None
        self.membase: Optional[int] = None   # DOSBox emulated-memory base (host)

    def reset(self):
        """Close any open handle and clear core per-process state. Subclasses
        override to also clear their own state, calling super().reset()."""
        if self.handle:
            try:
                _k32().CloseHandle(wt.HANDLE(self.handle))
            except Exception:
                pass
        self.handle = None
        self.pid = None
        self.membase = None

    def attach(self, pid: int):
        """Reset, then open `pid`. Raises OSError if the process can't be opened."""
        self.reset()
        self.handle = open_process(pid)
        self.pid = pid


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


def detect_membase_bda(handle: int, known: Optional[tuple] = None) -> tuple:
    """Find MemBase by locating the DOS BIOS Data Area in every large region.
    Anchors the search on two stable BDA bytes -- the COM1 port word (0x03F8) and
    the 640-KB conventional-memory word -- validates the surrounding BDA with
    _score_bda, and derives MemBase = host(BDA) - 0x400. A known variable
    (seg, off, value, width), if given, is verified with a live read as a
    decisive tie-breaker. Returns (membase, evidence_list, others) where `others`
    is a short list of runner-up (score, hex_addr); (None, [], []) on failure."""
    WINDOW = 0x200000  # 2 MB from each region start covers the BDA + low DS data
    found = {}         # membase -> (score, evidence)
    for base, size in iter_regions(handle):
        if size < 0x110000:        # DOSBox emulated RAM is at least ~1 MB
            continue
        try:
            buf = read(handle, base, min(size, WINDOW))
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
                cur = int.from_bytes(read(handle, mb + (seg << 4) + koff, w), "little")
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


# ----------------------------------------------------------------------------
# Base tools: registered on ANY DOSBox MCP server (workbench or per-game).
# They close over the passed-in Session `S`, so each server process keeps its
# own attach/calibrate/read/write state. Returns the callables in a namespace so
# a host server can invoke them internally (e.g. a one-shot session_init).
# ----------------------------------------------------------------------------
def register_base_tools(mcp, S: "Session"):
    @mcp.tool()
    def find_dosbox() -> str:
        """Find a running DOSBox process and open it. Returns the pid and exe.
        Needs elevation only if DOSBox itself runs elevated."""
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
            return "No DOSBox process found. Make sure DOSBox is running."
        pid, name = found[0]
        try:
            S.attach(pid)  # closes any previous handle + clears stale state
        except OSError as ex:
            return f"Found DOSBox pid={pid} ({name}) but could not open it: {ex}"
        extra = ""
        if len(found) > 1:
            extra = f"\n(Multiple found: {found}; selected the first.)"
        return (f"Opened DOSBox: pid={pid} exe={name}{extra}\n"
                f"Next: find_membase_auto() to calibrate MemBase.")

    @mcp.tool()
    def find_membase_auto(known_segment: int = -1, known_offset: int = -1,
                          known_value: int = -1, known_width: int = 2) -> str:
        """Auto-detect DOSBox's MemBase without a manual scan, using the DOS BIOS
        Data Area (BDA) as the footprint.

        DOSBox maps no ROM BIOS at segment F000 (no reset vector / date string),
        so this does NOT use PC-BIOS fingerprints. Instead it locates the BDA at
        its fixed linear address 0x400 -- the COM/LPT port table, equipment word,
        the 640-KB conventional-memory word and the live timer tick -- and derives
        MemBase = host(BDA) - 0x400. Because it scans for the signature, it works
        even when MemBase is not at the region start, and with only the DOSBox
        shell loaded (no game needed).

        Pass a known variable (known_segment/offset/value/width) for a decisive
        cross-check; without it, detection rests on the BDA signature alone. On
        success MemBase is set directly."""
        if not S.handle:
            return HINT_NO_PROC
        known = None
        if known_segment >= 0 and known_offset >= 0 and known_value >= 0:
            known = (known_segment, known_offset, known_value, known_width)
        best, evidence, others = detect_membase_bda(S.handle, known)
        if best is None:
            return ("Auto-detect failed: no region exposed a recognizable DOS BIOS "
                    "Data Area (BDA) signature.\nFall back to a manual flow (scan a "
                    "value you can see, then set_membase_from).")
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
    def set_membase_from(host_addr: int, segment: int, offset: int) -> str:
        """Derive DOSBox's MemBase from a known variable's host address plus its
        DOS segment:offset (e.g. from your disassembly). Once set, use read_dos to
        read any variable."""
        linear = (segment << 4) + offset
        S.membase = host_addr - linear
        return (f"MemBase set to 0x{S.membase:x}\n"
                f"(host 0x{host_addr:x} maps to DOS {segment:04X}:{offset:04X}, "
                f"linear=0x{linear:x})\n"
                f"You can now read variables with read_dos(seg, off, width).")

    @mcp.tool()
    def read_dos(segment: int, offset: int, width: int = 2) -> str:
        """Read a variable by DOS segment:offset (MemBase must be set)."""
        if S.membase is None:
            return HINT_NO_MEMBASE
        linear = (segment << 4) + offset
        host = S.membase + linear
        try:
            raw = read(S.handle, host, width)
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
            raw = read(S.handle, host, size)
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
            n = write(S.handle, host, pack(value, width))
        except OSError as ex:
            return (f"Write failed at DOS {segment:04X}:{offset:04X} (host 0x{host:x}): {ex}\n"
                    f"Check the address is mapped and MemBase is calibrated (status()).")
        return f"Wrote {n} bytes: DOS {segment:04X}:{offset:04X} <- {value}"

    @mcp.tool()
    def status() -> str:
        """Show the current connection and calibration state."""
        parts = [f"pid={S.pid}",
                 f"membase={'0x%x' % S.membase if S.membase else 'unset'}"]
        # Include workbench/game-specific counters if the Session exposes them.
        if hasattr(S, "last_scan"):
            parts.append(f"last_scan={len(S.last_scan)} addresses")
        if hasattr(S, "fuzzy_addrs"):
            parts.append(f"fuzzy={len(S.fuzzy_addrs)} candidates")
        if hasattr(S, "table"):
            parts.append(f"table={len(S.table)} entries")
        return " ".join(parts)

    @mcp.tool()
    def disconnect() -> str:
        """Detach from DOSBox: close the process handle and clear MemBase/scan
        state. Any persistent address table is kept. Useful before reopening a
        different DOSBox, or to release the handle when done."""
        had = S.pid
        S.reset()
        return (f"Disconnected from pid={had}; handle closed and state cleared."
                if had else "Nothing was connected.")

    return SimpleNamespace(
        find_dosbox=find_dosbox, find_membase_auto=find_membase_auto,
        set_membase_from=set_membase_from, read_dos=read_dos,
        read_linear=read_linear, write_dos=write_dos,
        status=status, disconnect=disconnect)
