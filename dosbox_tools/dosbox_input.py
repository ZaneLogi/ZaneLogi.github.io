#!/usr/bin/env python3
"""
DOSBox keyboard-injection core (shared library).

Game-agnostic keystroke injection into a running DOSBox via Win32 SendInput,
plus `register_input_tools(mcp, S)` -- which gives ANY DOSBox MCP server the
ACTION counterpart to dosbox_mem's perception (read/write): find the DOSBox SDL
window, focus it, and send key events.

NO game-specific knowledge lives here -- semantic verbs (u6_move/u6_talk/u6_say)
belong in the per-game server, built on these primitives.

Why SendInput + hardware scancodes
----------------------------------
DOSBox (SDL 1.2) forces the "directx" video backend on Windows, so it reads the
keyboard via DirectInput. DirectInput sees REAL injected input (SendInput) but
maps SDL keysyms to DOS scancodes -- so KEYEVENTF_SCANCODE is required;
virtual-key events are the wrong path. DirectInput also delivers input only while
DOSBox is the FOREGROUND window, so the send tools focus it first.

The MCP-tool boundary is deliberate: a future injection-DLL backend that calls
DOSBox's internal KEYBOARD_AddKey directly would remove the foreground
requirement WITHOUT changing these tools or the agent that calls them.
"""
import ctypes
import time
from ctypes import wintypes
from types import SimpleNamespace

user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

# Prototypes -- REQUIRED on 64-bit so HWND/pointer returns aren't truncated.
user32.GetForegroundWindow.restype = wintypes.HWND
user32.GetWindowThreadProcessId.restype = wintypes.DWORD
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, wintypes.LPDWORD]
user32.SetForegroundWindow.restype = wintypes.BOOL
user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.BringWindowToTop.argtypes = [wintypes.HWND]
user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
user32.IsWindow.argtypes = [wintypes.HWND]
user32.IsWindow.restype = wintypes.BOOL
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]

ULONG_PTR = wintypes.WPARAM  # pointer-sized integer


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD),
                ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
                ("dwExtraInfo", ULONG_PTR)]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG),
                ("mouseData", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
                ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]


class _INPUTunion(ctypes.Union):
    _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", _INPUTunion)]


user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
user32.SendInput.restype = wintypes.UINT

EnumProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
user32.EnumWindows.argtypes = [EnumProc, wintypes.LPARAM]
user32.EnumWindows.restype = wintypes.BOOL

INPUT_KEYBOARD = 1
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_SCANCODE = 0x0008
SW_RESTORE = 9
_LALT_SCAN = 0x38

# Set-1 (XT) make codes for printable characters. Letters are sent without Shift
# (lowercase); DOS and U6 keyword matching are case-insensitive, so that's fine.
SCAN = {
    'a': 0x1E, 'b': 0x30, 'c': 0x2E, 'd': 0x20, 'e': 0x12, 'f': 0x21, 'g': 0x22,
    'h': 0x23, 'i': 0x17, 'j': 0x24, 'k': 0x25, 'l': 0x26, 'm': 0x32, 'n': 0x31,
    'o': 0x18, 'p': 0x19, 'q': 0x10, 'r': 0x13, 's': 0x1F, 't': 0x14, 'u': 0x16,
    'v': 0x2F, 'w': 0x11, 'x': 0x2D, 'y': 0x15, 'z': 0x2C,
    '1': 0x02, '2': 0x03, '3': 0x04, '4': 0x05, '5': 0x06, '6': 0x07, '7': 0x08,
    '8': 0x09, '9': 0x0A, '0': 0x0B,
    ' ': 0x39, '-': 0x0C, '=': 0x0D, '[': 0x1A, ']': 0x1B, ';': 0x27,
    "'": 0x28, '`': 0x29, '\\': 0x2B, ',': 0x33, '.': 0x34, '/': 0x35,
}

# Named non-printing keys -> (scancode, is_extended). Arrow keys are the
# dedicated (extended, 0xE0-prefixed) variants, not the numeric keypad.
KEYNAMES = {
    "enter": (0x1C, False), "return": (0x1C, False),
    "esc": (0x01, False), "escape": (0x01, False),
    "space": (0x39, False), "backspace": (0x0E, False), "tab": (0x0F, False),
    "up": (0x48, True), "down": (0x50, True), "left": (0x4B, True), "right": (0x4D, True),
    "f1": (0x3B, False), "f2": (0x3C, False), "f3": (0x3D, False), "f4": (0x3E, False),
    "f5": (0x3F, False), "f6": (0x40, False), "f7": (0x41, False), "f8": (0x42, False),
    "f9": (0x43, False), "f10": (0x44, False),
}


def _enum_windows():
    """Return [(hwnd, title, pid)] for every visible window whose title contains
    'dosbox' (case-insensitive)."""
    matches = []

    @EnumProc
    def _cb(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        n = user32.GetWindowTextLengthW(hwnd)
        if n > 0:
            buf = ctypes.create_unicode_buffer(n + 1)
            user32.GetWindowTextW(hwnd, buf, n + 1)
            title = buf.value
            if "dosbox" in title.lower():
                wpid = wintypes.DWORD(0)
                user32.GetWindowThreadProcessId(hwnd, ctypes.byref(wpid))
                matches.append((int(hwnd), title, wpid.value))
        return True

    user32.EnumWindows(_cb, 0)
    return matches


def _pick(matches, pid_filter):
    """Choose the real DOSBox SDL render window. Only it carries 'cpu speed' in
    its title -- REQUIRING that avoids matching editors/terminals that merely have
    'dosbox' in their title (e.g. an open dosbox_*.py file) and the separate
    'DOSBox Status Window' console. If the attached pid is known, the SDL window
    of that exact process wins (disambiguates multiple DOSBoxes)."""
    sdl = [m for m in matches if "cpu speed" in m[1].lower()]
    if not sdl:
        return None
    if pid_filter:
        own = [m for m in sdl if m[2] == pid_filter]
        if own:
            return own[0]
    return sdl[0]


def register_input_tools(mcp, S):
    """Register the generic DOSBox input tools on `mcp`, closing over session `S`
    (uses S.pid, if set, to bind the window to the attached DOSBox). Returns a
    namespace so a host server can call the primitives internally for its own
    semantic verbs."""
    IST = SimpleNamespace(hwnd=None)

    def _resolve(key):
        """Map a key spec (single char, or a name) to (scancode, is_extended)."""
        if not key:
            return None
        if len(key) == 1:
            sc = SCAN.get(key.lower())
            if sc is not None:
                return (sc, False)
        return KEYNAMES.get(key.lower())

    def _send_scan(scan, keyup, extended):
        flags = KEYEVENTF_SCANCODE | (KEYEVENTF_KEYUP if keyup else 0)
        if extended:
            flags |= KEYEVENTF_EXTENDEDKEY
        rec = INPUT(type=INPUT_KEYBOARD,
                    u=_INPUTunion(ki=KEYBDINPUT(0, scan, flags, 0, 0)))
        return user32.SendInput(1, ctypes.byref(rec), ctypes.sizeof(INPUT))

    def _tap(scan, extended, hold_ms):
        _send_scan(scan, False, extended)
        time.sleep(hold_ms / 1000.0)
        _send_scan(scan, True, extended)
        time.sleep(0.03)

    def _locate():
        if IST.hwnd and user32.IsWindow(IST.hwnd):
            return IST.hwnd
        m = _pick(_enum_windows(), getattr(S, "pid", None))
        IST.hwnd = m[0] if m else None
        return IST.hwnd

    def _focus(hwnd):
        if int(user32.GetForegroundWindow() or 0) == hwnd:
            return True
        user32.ShowWindow(hwnd, SW_RESTORE)
        _send_scan(_LALT_SCAN, False, False)   # ALT tap releases the foreground lock
        _send_scan(_LALT_SCAN, True, False)
        fg = int(user32.GetForegroundWindow() or 0)
        cur = kernel32.GetCurrentThreadId()
        tgt = user32.GetWindowThreadProcessId(hwnd, None)
        fgt = user32.GetWindowThreadProcessId(fg, None) if fg else 0
        user32.AttachThreadInput(cur, tgt, True)
        if fgt:
            user32.AttachThreadInput(cur, fgt, True)
        user32.BringWindowToTop(hwnd)
        user32.SetForegroundWindow(hwnd)
        user32.AttachThreadInput(cur, tgt, False)
        if fgt:
            user32.AttachThreadInput(cur, fgt, False)
        time.sleep(0.12)
        return int(user32.GetForegroundWindow() or 0) == hwnd

    def _ensure():
        hwnd = _locate()
        if not hwnd:
            return None, "No DOSBox window found (is DOSBox running?)."
        if not _focus(hwnd):
            return hwnd, ("Found the DOSBox window but could not bring it to the "
                          "foreground; SendInput needs it focused. Click DOSBox "
                          "and retry (or move to the injection-DLL backend).")
        return hwnd, None

    @mcp.tool()
    def find_window(title: str = "dosbox") -> str:
        """Locate the DOSBox SDL window and cache its handle for sends. Prefers
        the window of the attached DOSBox process, then the SDL render window."""
        m = _pick(_enum_windows(), getattr(S, "pid", None))
        if not m:
            return "No DOSBox window found. Make sure DOSBox is running."
        IST.hwnd = m[0]
        return f"DOSBox window: hwnd=0x{m[0]:x} pid={m[2]} title={m[1]!r}"

    @mcp.tool()
    def focus_window() -> str:
        """Bring the DOSBox window to the foreground. Required before SendInput
        delivers keys, because DOSBox reads the keyboard via DirectInput (which
        only sees input while DOSBox is the active window)."""
        hwnd, err = _ensure()
        if err:
            return err
        return f"DOSBox focused (hwnd=0x{hwnd:x})."

    @mcp.tool()
    def send_key(key: str, hold_ms: int = 40) -> str:
        """Send ONE keypress to DOSBox via SendInput (hardware scancode). `key` =
        a single character (a-z 0-9 punctuation) or a name: enter/return/esc/
        space/backspace/tab/up/down/left/right/f1..f10. Focuses DOSBox first."""
        res = _resolve(key)
        if res is None:
            return f"Unknown key {key!r}."
        hwnd, err = _ensure()
        if err:
            return err
        scan, ext = res
        _tap(scan, ext, hold_ms)
        return f"sent {key!r} (scan=0x{scan:02x}{' ext' if ext else ''})."

    @mcp.tool()
    def send_text(text: str, per_key_ms: int = 35) -> str:
        """Type a string into DOSBox via SendInput (scancodes), char by char.
        Unmappable characters are skipped. Case-insensitive on the wire (DOS and
        U6 keyword matching ignore case). Focuses DOSBox first. Does NOT press
        Enter -- call send_key('enter') afterward, or use a per-game verb."""
        hwnd, err = _ensure()
        if err:
            return err
        sent, skipped = 0, []
        for ch in text:
            res = _resolve(ch)
            if res is None:
                skipped.append(ch)
                continue
            _tap(res[0], res[1], per_key_ms)
            sent += 1
        msg = f"typed {sent} char(s) of {text!r}."
        if skipped:
            msg += f" skipped (unmappable): {''.join(skipped)!r}"
        return msg

    return SimpleNamespace(find_window=find_window, focus_window=focus_window,
                           send_key=send_key, send_text=send_text,
                           resolve=_resolve, tap=_tap, locate=_locate)
