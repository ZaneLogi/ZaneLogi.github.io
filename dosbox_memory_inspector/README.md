# DOSBox Memory Inspector

An MCP server that lets Claude Code inspect (and optionally modify) DOSBox's
emulated memory, like a programmable Cheat Engine. Built for reverse
engineering 16-bit real-mode DOS programs running under DOSBox on Windows.

## How it works

DOSBox stores its emulated 8086 memory as one contiguous block inside its own
process, starting at a pointer called `MemBase`. A DOS address is
`segment:offset`, so once you know `MemBase`, any `seg:off` from your
disassembly maps straight to a real host address:

```
host address = MemBase + (segment * 16 + offset)
```

The whole tool is built around one idea: **calibrate `MemBase` once, then read
any variable by its `seg:off`.** Reads are done from outside the process with
`ReadProcessMemory`, so it works with any DOSBox variant (staging, -x, vanilla)
without patching it.

## Requirements

- Windows
- Python 3.10+
- MCP SDK:

```powershell
pip install "mcp[cli]"
```

Put `dosbox_mcp_server.py` somewhere stable, e.g. `C:\tools\dosbox_mcp\`.

## Register with Claude Code

Easiest via the CLI (run inside your project folder, or add `--scope user` to
make it available everywhere):

```powershell
claude mcp add dosbox-memory python C:\tools\dosbox_mcp\dosbox_mcp_server.py
```

Or edit `.mcp.json` by hand (note the doubled backslashes on Windows paths):

```json
{
  "mcpServers": {
    "dosbox-memory": {
      "command": "python",
      "args": ["C:\\tools\\dosbox_mcp\\dosbox_mcp_server.py"]
    }
  }
}
```

**Run as Administrator.** Claude Code spawns this server as a child process,
and `ReadProcessMemory`/`OpenProcess` need elevation. Start DOSBox elevated and
start Claude Code elevated, otherwise opening the process is denied.

The server itself has no dependency on DOSBox being open — it just registers its
tools and waits. You can load it before or after launching DOSBox. It only
touches the emulator when you call `find_dosbox()`, and by then the target
program should be running so its values and the BIOS fingerprints are in memory.

## Calibrating MemBase

Everything depends on `MemBase`. There are two ways to get it.

### Fast path: auto-detect

`find_membase_auto` exploits the fact that DOSBox emulates a PC, so its memory
contains fixed PC BIOS fingerprints that pin `MemBase`:

- reset vector @ `0xFFFF0` — first boot instruction, always a far jump (`EA`)
- BIOS date string @ `0xFFFF5` — `MM/DD/YY` format
- BIOS Data Area @ `0x400` — equipment word, base-memory size

It checks these on every large (>=1MB) region, scores them, and picks the best.
For a decisive lock, pass a variable you can confirm in the program right now:

```
# fingerprints only (quick, looser threshold)
find_membase_auto()

# with a known-variable check (most reliable, recommended)
find_membase_auto(known_segment=0x1234, known_offset=0x10,
                  known_value=50, known_width=2)
```

### One-shot startup

`session_init` runs the usual boot sequence in a single call: attach to DOSBox,
auto-detect MemBase, and (optionally) load a saved address table. It returns a
step-by-step boot report and stops early with guidance if any step fails (e.g.
the program isn't loaded yet), so you don't have to chain three calls yourself.

```
# first run, no table yet:
session_init(known_segment=0x1234, known_offset=0x10, known_value=50)

# later runs, with a saved table:
session_init(table_path="C:\\tools\\dosbox_mcp\\vars.json",
             known_segment=0x1234, known_offset=0x10, known_value=50)
```

Passing a known variable makes calibration decisive; without it, detection is
fingerprint-only. The individual tools (`find_dosbox`, `find_membase_auto`,
`table_load`) remain available for when you need finer control.

### Manual path: scan and derive

If auto-detect can't lock on, pin a variable yourself, then derive `MemBase`
from it:

1. `find_dosbox()` — locate and open the emulator
2. `scan_value(50)` (or `scan_typed`) — find all addresses holding a value you
   can see on screen
3. change that value, `next_scan(48)` — repeat until one address remains
4. look up that variable's DOS `seg:off` in your disassembly, then
   `set_membase_from(host_addr, 0x1234, 0x56)`
5. read freely: `read_dos(0x1234, 0x78)`

Calibrate once and every variable is readable for the rest of the session.
**Reopening DOSBox changes `MemBase`** (new PID, new base), so you recalibrate
after each restart.

## Scanning toolkit

Beyond exact-value scans, the server offers a fuller Cheat-Engine-style kit.

**Typed scans** — `scan_typed` / `next_scan_typed` support
`u8/i8/u16/i16/u32/i32/float/double/string`, plus `alignment` (drop hits not on
a 2- or 4-byte boundary) and `dos_only` (restrict to the emulated DOS window
once `MemBase` is known, for speed).

**AOB (signature) scan** — `scan_aob` searches a byte pattern with `??`
wildcards, e.g. `8B 46 ?? 50 E8`. Because it matches code/data signatures rather
than values, the hits stay valid as values change — useful as stable anchors.

**Fuzzy scan** — `fuzzy_new` / `fuzzy_next` find a variable when you DON'T know
its exact value. `fuzzy_new` snapshots every slot in the window; then you change
the value in the program and filter with `increased`, `decreased`, `changed`,
`unchanged`, `increased_by`, or `decreased_by`, repeating until one address
remains. The candidate list and snapshot stay entirely server-side; only counts
and a tiny sample are returned, so this never bloats the AI context.

**Structure dump** — `struct_dump` reads a block at `seg:off` and parses it
against a field spec like `x:u16, y:u16, z:u8, hp:i16, name:string8`, printing
each field's offset and value. Handy for verifying struct layouts against your
disassembly. With no spec, it just hex-dumps.

## Address table (persistent variable list)

Once you've found variables, save them so you don't have to re-find them. The
table stores **stable DOS `seg:off` identifiers** (plus name, type, note) as
JSON — never host addresses or MemBase, which change every run. So a saved table
stays valid across DOSBox restarts; you just recalibrate MemBase once per
session and resolve the whole table against it.

```
JSON table (seg:off)  +  this session's MemBase  ->  live values
```

Typical flow:

```
# build it up as you find variables
table_add("player_x", 0x1234, 0x10, "u16", "world X coordinate")
table_add("player_hp", 0x1234, 0x20, "i16", "current hit points")
table_save("C:\\tools\\dosbox_mcp\\vars.json")

# next session
find_dosbox()
find_membase_auto(known_segment=0x1234, known_offset=0x10, known_value=50)
table_load("C:\\tools\\dosbox_mcp\\vars.json")
table_read_all          # dumps every variable's current value at once
```

`table_read_all` is the payoff: one call shows the live state of every known
variable. `segment`/`offset` accept hex strings (`"0x1234"`) or ints in both the
tools and the JSON file.

Once a variable is in the table, prefer **name-based access**: `read_var("hp")`
and `write_var("hp", "-5")` look the name up and resolve it against the current
MemBase for you. This keeps the stable handle (the name) in play and avoids
carrying volatile host addresses or re-specifying seg:off on every call. Strings
are written padded/truncated to the declared `stringN` length; numeric values
accept decimal or hex (`"0x10"`).

Table tools: `table_add`, `table_remove`, `table_list`, `table_save`,
`table_load` (replace or `merge=True`), `table_read_all`, plus `read_var` /
`write_var` for name-based access.

## Tools

| Tool | Purpose |
|------|---------|
| `find_dosbox()` | Locate and open the DOSBox process |
| `find_membase_auto(...)` | Auto-detect MemBase via BIOS fingerprints |
| `session_init(table_path, known_*)` | One-shot: attach + calibrate + load table |
| `set_membase_from(host_addr, seg, off)` | Derive MemBase from a known address |
| `scan_value(value, width)` | Exact-value first scan (integer) |
| `next_scan(value, width)` | Narrow an integer scan |
| `scan_typed(value, vtype, alignment, dos_only)` | Typed first scan |
| `next_scan_typed(value, vtype)` | Narrow a typed scan |
| `scan_aob(pattern, dos_only, max_hits)` | Byte-pattern scan with wildcards |
| `fuzzy_new(vtype, dos_only, max_candidates)` | Start an unknown-value scan |
| `fuzzy_next(op, delta)` | Filter fuzzy candidates by change |
| `read_dos(seg, off, width)` | Read a variable by seg:off |
| `read_linear(linear, size)` | Hex-dump a block by linear address |
| `write_dos(seg, off, value, width)` | Write a value (use with care) |
| `struct_dump(seg, off, fields, size)` | Parse a struct at seg:off |
| `table_add(name, seg, off, vtype, note)` | Add/update a variable in the table |
| `table_remove(name)` | Remove a table entry |
| `table_list()` | List table entries |
| `table_save(path)` | Save table to JSON |
| `table_load(path, merge)` | Load table from JSON |
| `table_read_all()` | Read live value of every table entry |
| `read_var(name)` | Read a variable by table name |
| `write_var(name, value)` | Write a variable by table name |
| `disconnect()` | Close the handle, clear scan/MemBase state (keeps table) |
| `status()` | Show connection and calibration state |

## Notes

- `width`: 16-bit values use `2`; single-byte flags use `1`.
- Save the program state before writing memory.
- Slow first scan just means the process is large; it gets fast after one or two
  narrowing steps. Setting `dos_only=True` (once `MemBase` is known) keeps scans
  inside the ~1MB emulated window and is much faster.
- All state (handle, `MemBase`, scan sets) lives in the running server process
  for the session. Restarting Claude Code or reloading the MCP config resets it.
