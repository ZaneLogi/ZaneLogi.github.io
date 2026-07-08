# DOSBox Tools

A small toolkit that lets Claude Code (or any MCP client) **inspect and drive**
programs running under DOSBox on Windows — read and write the emulated memory
like a programmable Cheat Engine, *and* inject keystrokes to control the program.
Built for reverse-engineering and agent-driving 16-bit real-mode DOS software.

It is **layered**: two shared cores provide the primitives, and per-purpose MCP
servers compose them — a generic memory workbench, plus per-game decoders.

## Components

| File | Role |
|------|------|
| `dosbox_mem.py` | Shared **perception** core: attach, MemBase calibration, read/write. Exposes `register_base_tools(mcp, S)`. No game/UI knowledge. |
| `dosbox_input.py` | Shared **action** core: find/focus the DOSBox window, send keys/text via SendInput. Exposes `register_input_tools(mcp, S)`. Game-agnostic. |
| `dosbox_mcp_server.py` | The **`dosbox-memory`** server — a generic Cheat-Engine-style discovery workbench (scan / fuzzy / AOB / struct dump / address table). Use when reverse-engineering something new. |
| `dosbox_u6_server.py` | The **`dosbox-u6`** server — an Ultima VI decoder (avatar/party/NPCs/objects, inventory, roster, passability, live conversation) **plus** U6 action + navigation verbs (move / look / get / use / talk / goto / …). Composes both cores. Design + per-verb mechanism in `docs/`. |

How they stack:

```
dosbox_mem   (read / write / calibrate) ─┐
                                         ├─►  dosbox-u6 server   (U6 decode + verbs)
dosbox_input (window / focus / keys)   ──┘
dosbox_mem  ─────────────────────────────►  dosbox-memory server (RE workbench)
```

A per-game server is self-sufficient: it pulls the routine plumbing from the
shared cores and adds only its own game knowledge.

## How it works — perception

DOSBox stores its emulated 8086 memory as one contiguous block inside its own
process, starting at a pointer called `MemBase`. A DOS address is
`segment:offset`, so once you know `MemBase`, any `seg:off` from your disassembly
maps straight to a real host address:

```
host address = MemBase + (segment * 16 + offset)
```

The whole perception side is built around one idea: **calibrate `MemBase` once,
then read any variable by its `seg:off`.** Reads are done from outside the
process with `ReadProcessMemory`, so it works with any DOSBox variant (staging,
-x, vanilla) without patching it. (The per-game `dosbox-u6` server additionally
derives the program's data segment `DS` per run — see its section below.)

## How it works — action

DOSBox (SDL 1.2) forces the DirectX video backend on Windows, so it reads the
keyboard via **DirectInput**. DirectInput sees real injected input (Win32
`SendInput`) but maps SDL keysyms to DOS scancodes — so `dosbox_input` sends
hardware **scancode** events, and **focuses the DOSBox SDL window first**
(DirectInput only delivers input while DOSBox is the foreground window). The MCP
tool boundary keeps this swappable: a future injection-DLL backend that calls
DOSBox's internal `KEYBOARD_AddKey` would drop the foreground requirement without
changing the tools or the agent that calls them.

## Requirements

- Windows
- Python 3.10+
- MCP SDK:

```powershell
pip install "mcp[cli]"
```

Keep the shared libraries (`dosbox_mem.py`, `dosbox_input.py`) in the **same
folder** as the server(s) that import them, e.g. `C:\tools\dosbox_tools\`.

## Register with Claude Code

Register whichever server(s) you need (run inside your project folder, or add
`--scope user` to make them available everywhere):

```powershell
# generic reverse-engineering workbench
claude mcp add dosbox-memory python C:\tools\dosbox_tools\dosbox_mcp_server.py
# Ultima VI decoder + action verbs
claude mcp add dosbox-u6 python C:\tools\dosbox_tools\dosbox_u6_server.py
```

Or edit `.mcp.json` by hand (note the doubled backslashes on Windows paths):

```json
{
  "mcpServers": {
    "dosbox-memory": {
      "command": "python",
      "args": ["C:\\tools\\dosbox_tools\\dosbox_mcp_server.py"]
    },
    "dosbox-u6": {
      "command": "python",
      "args": ["C:\\tools\\dosbox_tools\\dosbox_u6_server.py"]
    }
  }
}
```

**Elevation — only if DOSBox is elevated.** For the usual case (DOSBox and Claude
Code both launched normally by the same user), `OpenProcess` /
`ReadProcessMemory` and `SendInput` work **without** Administrator — same-user,
same-integrity access is allowed. You only need to run Claude Code elevated if
DOSBox itself was started elevated (or by another user). (Verified: a
non-elevated, medium-integrity shell opens and reads/writes a normally-launched
DOSBox fine.)

The servers have no dependency on DOSBox being open — they register their tools
and wait. Load them before or after launching DOSBox; they only touch the
emulator when you call a tool (`find_dosbox` / `u6_hook`), by which point DOSBox
should be at its prompt so its BDA and program values are in memory.

---

# The `dosbox-memory` server (RE workbench)

A generic, Cheat-Engine-style server for reverse-engineering an unknown DOS
program: scan for values, narrow them down, dump structs, and persist what you
find. It exposes the shared `dosbox_mem` base tools plus the discovery toolkit.

## Calibrating MemBase

Everything depends on `MemBase`. There are two ways to get it.

### Fast path: auto-detect

`find_membase_auto` locates DOSBox's **BIOS Data Area (BDA)** — a small fixed
structure the emulator keeps at linear `0x400`, present even with only the DOS
shell loaded — and derives `MemBase = host(BDA) - 0x400`.

It deliberately does **not** rely on a ROM BIOS. DOSBox maps no BIOS image at
segment `F000`, so the reset vector (`0xFFFF0`) and BIOS date string read back as
zero — the classic PC-BIOS fingerprints are useless here. The BDA, however, is
always populated. Detection scans each large (>=1MB) region for the BDA
signature at its exact relative offsets:

- conventional-memory size @ `40:13` — DOSBox invariably reports **640 KB**; this
  is the decisive discriminator (a loose range here matches stray data in
  DOSBox's own heap)
- COM/LPT I/O-port table @ `40:00` / `40:08` — e.g. `0x03F8` / `0x0378`; at least
  one valid port is required, as the port table is the real structural signature
- equipment word @ `40:10` and a live timer tick @ `40:6C` — corroborating

Because it scans for the signature rather than assuming `MemBase` is at a
region's start, it finds the base even when it sits at an odd offset (real DOSBox
places it a little above the allocation start). For an extra-decisive lock, pass
a variable you can confirm in the program right now:

```
# BDA signature only — works with no game loaded
find_membase_auto()

# with a known-variable cross-check (most reliable)
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
session_init(table_path="C:\\tools\\dosbox_tools\\vars.json",
             known_segment=0x1234, known_offset=0x10, known_value=50)
```

Passing a known variable makes calibration decisive; without it, detection rests
on the BDA signature alone (still reliable, and works with no game loaded). The
individual tools (`find_dosbox`, `find_membase_auto`, `table_load`) remain
available for when you need finer control.

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
table_save("C:\\tools\\dosbox_tools\\vars.json")

# next session
find_dosbox()
find_membase_auto(known_segment=0x1234, known_offset=0x10, known_value=50)
table_load("C:\\tools\\dosbox_tools\\vars.json")
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
| `find_membase_auto(...)` | Auto-detect MemBase via the DOS BIOS Data Area (BDA) |
| `session_init(table_path, known_*)` | One-shot: attach + calibrate + load table |
| `set_membase_from(host_addr, seg, off)` | Derive MemBase from a known address |
| `scan_value(value, width, dos_only)` | Exact-value first scan (integer) |
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

---

# The `dosbox-u6` server (Ultima VI)

A per-game **decoder + driver** for Ultima VI. It bakes in U6's in-memory layout
(the parallel object arrays, the conversation VM) from the
[u6-decompiled](https://github.com/ergonomy-joe/u6-decompiled) source, and it
registers the shared `dosbox_mem` (read/write) and `dosbox_input` (keys) tools —
so this **one server both perceives and acts** on the same DOSBox session. It
does **not** include the RE workbench; use `dosbox-memory` for new RE.

## Hooking

```
u6_hook("<avatar name>")
```

Attaches, auto-calibrates MemBase, and **derives the U6 data segment `DS`** from
the avatar's name. `DS` is the program's DOS load segment — it shifts with the
memory layout (drivers/TSRs/env/config), so it is never hardcoded; the name's
bytes pin `Names[0]` at `DS:0x3236`, giving `DS = (name_linear - 0x3236) / 16`.
After this, the decoders work with no `segment=` argument.

## Perception

- `u6_avatar` / `u6_party` — the controlled actor's position+facing; solo/party
  mode, combat on/off, and who's controlled now.
- `u6_time` — the in-game clock + date. U6 is turn-based: ~0.5–1 min per step (time
  advances per move-round), LOOK/TALK/USE are free; NPCs run daily schedules.
- `u6_input_state` — turn-readiness (`COMMAND_READY`/`CONVERSATION`/`SELECTING`/
  `MOUSE_MODE`/`BUSY`); poll before acting (U6 is turn-based, input is buffered).
- `u6_roster_status` — per-member STR/DEX/INT/Level + carry/equip load vs caps.
- `u6_object(slot)` — decode one object/NPC slot: world `x/y/z` (or holder),
  shape type/frame, quantity/quality, tile/weight/equip-slot. Avatar is slot 1;
  NPCs are `0..0xFF`.
- `u6_inventory(npc_slot)` — list everything an NPC holds (INVEN/EQUIP).
- `u6_panel_state()` — the status-panel state the inventory verbs drive: which view
  is up (PORTRAIT/PARTY/INVENTORY), the panel cursor/scroll, the visible backpack
  slots + equipped gear, and the live `Selection`.
- `u6_npcs_near(radius)` / `u6_objects_near(radius)` — nearby NPCs / map items
  (with gear hints), named via `LOOK.LZD` (see `docs/u6_object_naming.md`).
- `u6_walkable` — a 40×40 ASCII passability grid (faithful `C_1E0F_000F` port;
  see `docs/dosbox_u6_passability.md`).
- `u6_area(radius=24)` — a **bigger** bird's-eye map than the 40×40: baked terrain +
  the loaded objects (the 2×2 OBJBLK region in RAM) over a (2·radius+1) square, so a
  whole castle/area is one glance (`@`=you, `P`/`E`/`a`/`N` actors, `D`=door, `.`/`#`).
- `u6_conversation()` / `u6_script_disasm()` — read the live talk VM. On talk
  start the engine loads the NPC's whole script from `converse.a` into **`TalkBuf`**
  and interprets it with **`Talk_PC`** as the program counter; it prints text then
  **blocks on input**, so a conversation is turn-based and both the NPC's text and
  the valid keyword branches live in `TalkBuf`. `u6_conversation` **decodes** it into
  readable dialogue — greeting, askable keywords, the `@`-marked highlighted cues,
  and (with `keyword=`) a preview of that keyword's response, `IF` evaluated against
  live memory. `u6_script_disasm` dumps the **whole** script as an addressed,
  assembly-like listing (opcodes, GOTO labels, factor exprs, side-effects,
  `??? 0xNN` for unknowns). Driving replies is `u6_say` (with a page-pause advance
  that fixes the first-char-eaten bug). **Full subsystem: `docs/u6_conversation.md`.**
- `u6_npc_flags(npc=-1)` — the NPC's `TalkFlags` byte (keyword-gated progression: a
  keyword's `SET self,<bit>` flips a bit; read before/after a keyword to track state;
  `-1` = the current conversation interlocutor).

## Action verbs

Built on `dosbox_input` (SendInput; DOSBox is focused first). Each verb is
turn-gated (`u6_input_state == COMMAND_READY`) and drains its result back to the
prompt. The full per-verb source mechanism + driving model is
`docs/u6_verb_mechanism.md`.

- `u6_move(dir)` — step one tile (`n/s/e/w`, or north/…/up/down/left/right).
- `u6_look(dir)` — examine/search the tile in `dir` (8-way); reports the notable
  objects the search surfaces (the agent reads state, not the scroll).
- `u6_get(dir)` — pick up the adjacent object in `dir` (`LOCXYZ → INVEN`).
- `u6_use(target, on="")` — operate a MAP tile (`n/s/e/w` or `here`) **or** a
  CARRIED item (`inv:<slot>`): open/close doors & chests, leave the gate, ladders,
  drink/eat/light a held item. **Auto-opens a locked door** (finds the matching owned
  key; container-aware — reports a key stuck in a bag). `on=` supplies a needed second
  choice (potion→member, dig→direction, …). Reports the resulting state.
- `u6_ready(slot)` — equip (`INVEN→EQUIP`) a carried item, or unequip an equipped
  one, via the inventory panel; auto-detects the member + ready/unready from the
  item's state.
- `u6_talk(dir)` — open a conversation with the NPC in `dir` (8-way).
- `u6_say(text)` — answer the current prompt; peeks the opcode at `Talk_PC` and
  types a line + Enter (`ASKTOP`/`GETSTR`) or sends a single key
  (`GET`/`GETCHR`/`WAIT`).
- `u6_continue()` — page a conversation to the next **decision point**: dismiss every
  page-pause and stop at a keyword / single-key prompt or `LEAVE`. The fluent loop is
  `u6_talk → u6_conversation → u6_continue → u6_say → u6_continue → …`.
- `u6_key(key)` — send one raw keypress.

Navigation (closed-loop, replanning around moving NPCs):

- `u6_pathfind(npc_slot)` — plan a route (weighted Dijkstra).
- `u6_goto(npc_slot)` — walk the route step-by-step, confirming each move.
- `u6_talk_to(npc_slot)` — `u6_goto` then `u6_talk`.
- `u6_validate_passability` — predict-vs-live fidelity gate for the passability
  oracle.

The server also exposes the shared base tools (`find_dosbox`, `read_dos`,
`write_dos`, `status`, …) and input tools (`find_window`, `focus_window`,
`send_key`, `send_text`).

## Tools

| Tool | Purpose |
|------|---------|
| `u6_hook(avatar_name)` | Attach + calibrate MemBase + derive DS from the avatar name |
| `u6_avatar` / `u6_party` | Controlled actor pos+facing; solo/party + combat + who's controlled |
| `u6_input_state` | Turn-readiness (poll for `COMMAND_READY` before acting) |
| `u6_roster_status` | Per-member STR/DEX/INT/Level + carry/equip load |
| `u6_object(slot, segment=-1)` | Decode one object/NPC slot (incl. tile/weight/equip-slot) |
| `u6_inventory(npc_slot, segment=-1)` | List an NPC's INVEN/EQUIP items |
| `u6_panel_state(segment=-1)` | Status-panel state (view + inventory cursor/slots/Selection) |
| `u6_npcs_near(radius)` / `u6_objects_near(radius)` | Nearby NPCs / map items (named) |
| `u6_walkable` | 40×40 ASCII passability grid |
| `u6_conversation(keyword="", raw=0, segment=-1)` | Decoded dialogue + askable keywords + highlighted cues; `keyword=` previews a response |
| `u6_script_disasm(segment=-1, max_bytes=4096)` | Whole NPC script as an addressed assembly listing |
| `u6_move(direction)` | Step the party one tile |
| `u6_look(direction)` | Examine/search the tile (8-way) |
| `u6_get(direction)` | Pick up the adjacent object |
| `u6_use(target, on="")` | Operate a map tile or a carried item; auto-opens a locked door |
| `u6_ready(slot)` | Equip / unequip a carried/worn item via the inventory panel |
| `u6_talk(direction)` | Start a conversation with the NPC in `direction` |
| `u6_say(text, segment=-1)` | Answer the current conversation prompt |
| `u6_key(key)` | Send one keypress |
| `u6_pathfind` / `u6_goto` / `u6_talk_to` | Plan / walk a route / goto+talk |
| `u6_validate_passability` | Predict-vs-live passability fidelity gate |
| `find_window` / `focus_window` | Locate / foreground the DOSBox window |
| `send_key(key)` / `send_text(text)` | Generic scancode injection |

---

## Notes

- **Tests:** `dosbox_tools/tests/` — stub-based offline tests (no DOSBox needed).
  Each stubs `mcp`/`dosbox_mem`/`dosbox_input`, imports the real `dosbox_u6_server`,
  and asserts against the actual functions (verb key sequences, passability, gear,
  the converse decoder). Run: `python tests/test_*.py` (or loop them).
- `width`: 16-bit values use `2`; single-byte flags use `1`.
- **Save the program state before writing memory.**
- Slow first scan just means the process is large; it gets fast after one or two
  narrowing steps. Setting `dos_only=True` (once `MemBase` is known) keeps scans
  inside the ~1MB emulated window and is much faster.
- **Input needs focus.** `SendInput` only reaches DOSBox while its SDL window is
  the foreground window; the input tools focus it first. The window is matched by
  the `"cpu speed"` signature in its title (the real SDL render window), not just
  any window containing "dosbox".
- All state (handle, `MemBase`, derived `DS`, scan sets, cached window) lives in
  the running server process for the session. Restarting Claude Code or reloading
  the MCP config resets it; reopening DOSBox requires re-calibration.
