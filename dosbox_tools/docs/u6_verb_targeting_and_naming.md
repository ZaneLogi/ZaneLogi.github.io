# U6 cursor-targeting verbs, result-drain, perception & object naming

Scope: the `dosbox-u6` action/perception layer landed in the session of
2026-06-25, on top of `da1dec5`. Supplements `u6_agent_capabilities.md`
(tool surface) and `dosbox_u6_passability.md` (movement). Everything here
is verified against a live in-castle save (avatar "Monica") except TALK,
which is **not yet verified** (deferred).

All claims cite the decompiled source under `C:\Z_Temp\u6_decompiled\SRC`.

---

## 1. The cursor-targeting command model (LOOK / TALK / GET / USE …)

These are **not** "press letter + direction" commands. Pressing the command
letter enters a select-cursor mode and the command only fires on an explicit
**commit**:

- `case 'L'/'T'/'G'/…` sets `SelectMode=1` and seeds the cursor at the actor
  (`AimX=AimY=5`) — `seg_0A33.c:1061/1070/1079`.
- The dispatch sets `MouseMode=1`, prints `"<Cmd>-"` (e.g. `"Look-"`), then
  blocks in `CON_getch()` — `seg_0A33.c:1248-1255` + `:1251`.
- The handler runs only when `CON_getch` returns **`CMD_8E`** (commit):
  `seg_0A33.c:1256-1264` (`CMD_84→C_27A1_0C67` look, `CMD_85→…18F5` get,
  `CMD_83→TALK_talkTo` talk).
- **Commit key = Enter** (`'\r'` in `SelectMode` → `CMD_8E`,
  `seg_0C9C.c:1206-1208`); a mouse click commits too (`:820`).
- **Cancel = ESC ×2**: the first ESC clears `SelectMode` (→ `MOUSE_MODE`),
  the second clears `MouseMode` (→ `COMMAND_READY`).

**`SelectRange` splits the family** (`seg_0C9C.c:1229-1247`):

| Cmd | SelectRange | Arrow behavior | Commit |
|---|---|---|---|
| LOOK / TALK / ATTACK | `7` (`seg_0A33.c:1068/1077/1042`) | **moves** the cross-cursor (≤7 tiles, diagonals) | needs **Enter** |
| GET / MOVE | `-1` (`seg_0A33.c:1086/1113`) | **auto-commits** to the adjacent tile (`:1242 ch=CMD_8E`) | the arrow *is* the commit — **no Enter** |

This is why GET is cardinal-adjacent-only by keyboard, while LOOK/TALK can
reach diagonal and distant tiles.

## 2. The verbs (`dosbox_u6_server.py`)

- `u6_look(dir)` / `u6_talk(dir)`: `L`/`T` → poll `SELECTING` → arrow(s) →
  **Enter** → drain. 8-way via `_U6_DIR8` (a diagonal = two arrows, e.g.
  `nw=[up,left]`).
- `u6_get(dir)`: `G` → poll `SELECTING` → arrow (**auto-commits**) → drain.
  Cardinal only; diagonals are rejected with an explanation.
- `u6_talk`: after commit, waits for `CONVERSATION`; if none appears it drains
  a "no response" and reports.

## 3. Result-dismiss drain — `_drain_to_ready`

`_input_state` classifies the engine from `IsInConversation / AllowMouseMov /
SelectMode / MouseMode` → `COMMAND_READY | CONVERSATION | SELECTING |
MOUSE_MODE | BUSY`.

**The end signal is exact and count-free:** `AllowMouseMov==1`
(`==COMMAND_READY`) is raised **only** around the top-level command `getch`
(`seg_0A33.c:1028-1031`) and dropped right after; every other getch — the
select loop, message page-waits, the result dismiss — runs with it 0. So we
never count container items: a 2-item and a 20-item corpse both *end* at the
top-level prompt.

A look/get **result** waits for a dismiss key in one of two states:
- `MOUSE_MODE` — the NPC portrait/inventory getch (`seg_27a1.c:258`), run
  while the dispatch's `MouseMode=1` is still set.
- `BUSY` (all flags 0) — a container / corpse / "Searching here, you find
  nothing." down-arrow prompt (`seg_27a1.c:507-509`).

`_drain_to_ready`: **send Enter** on any non-`COMMAND_READY`/non-`SELECTING`
state (i.e. `MOUSE_MODE` **or** `BUSY`), **`time.sleep(_DRAIN_SETTLE=0.5)`**,
re-read, repeat; stop at `COMMAND_READY`; a stray re-entered command
(`SELECTING`) is cancelled with ESC ×2.

**Why the settle (the bug it fixes):** the portrait/inventory redraw (DOSBox
throttled to ~3000 cycles) holds `MouseMode=1`; reading the state too soon
mistook that transition for another page and **over-fired one Enter into the
command prompt**, which repeated the default command — surfacing as
`">What?"` (a re-entered LOOK that didn't commit) or `"Not possible"` (a
re-entered GET on the floor). Reading only the **settled/resting** state makes
the key count exact. Bump `_DRAIN_SETTLE` to 1.0 if a slower box still races.

## 4. Perception: the agent reads STATE, not the scroll

The agent receives only the tool's **return string** — it cannot read the
DOSBox message scroll, so a LOOK's "you find a club…" text is invisible to it.
But LOOK's adjacent-search (`C_27A1_09A1`, `seg_27a1.c:634`) **surfaces
hidden/contained items to visible `LOCXYZ` world objects**, and *that* state
change is the agent's real signal.

So `u6_look` re-reads the looked tile after draining and appends the
**notable** objects there — `weight>0` OR readyable; floor/scenery dropped
(`u6_walkable` covers terrain). Helpers: `_notable_at_tile` + `_ARROW_DXY`
(direction → tile offset). Example return:
`Notable at (310,356): club (0x715 type34 w15 RHND), leather helm (0x716 type1 w4 HEAD), dead body (0x894 type339 w160)`.

## 5. Object names — `u6_look_names.py`

`GetObjectString` (`seg_1184.c:1912`) → `GetTileString(TILE_FRAME(obj))`
(`seg_1184.c:1892`) → a name from **`LOOK.LZD`**, keyed by the object's
**tile = `BaseTile[type] + frame`**. Party members are special-cased to
`Names[]` (`:1921`).

`LOOK.LZD` is LZW-compressed and the game **re-decodes it into `ScratchBuf`
on every name lookup** (`:1899`); `ScratchBuf` is the *shared video scratch
buffer* (`__MemAlloc 0x7900`, `seg_0903.c:545`, reused for screen rendering),
so **there is no stable decoded table in RAM to read**. We therefore decode
it **once** (repo's U6 LZW, `ultima6/lzw_decoder.js`) into a committed module:

- `dosbox_tools/u6_look_names.py` — 514 `(tile, name)` records + `tile_name()`
  bisect = "first record whose tile ≥ query" (faithful to `GetTileString`).
- Spot-checks: `tile 545→club`, `512→leather helm`, `1270→dead body`,
  `1→grass`. Immutable game data → committed verbatim, no runtime decode, no
  game-data-path dependency.

Names wired into `u6_object`, `u6_objects_near`, the `u6_look` report,
`u6_inventory`, and `u6_npcs_near`. **`u6_npcs_near` = option A**: party
members show their `Names[]` name; creatures/NPCs show the LOOK.LZD
appearance (`rat`/`guard`/…). The conversation-name tier
(`C_1703_0116`, for named townsfolk) is **deferred** — marginal for the
tool's target-picking purpose and the agent learns those names by talking.

## 6. Verification record (live, save "Monica", in castle)

- Reads cross-consistent: `u6_avatar`/`u6_party`/`u6_input_state` agree on the
  controlled actor; `u6_roster_status` carry/equip caps match STR×20 / STR×10
  exactly.
- `u6_move south`: position re-read confirms the step; party follows in
  formation.
- `u6_look`: NPC (Shamino — name+portrait), diagonal (`nw` corpse), empty
  corpse (`BUSY` "find nothing"), corpse-with-contents (club + leather helm) —
  **all drain to `COMMAND_READY`, no stray GET / `">What?"`**.
- `u6_get south`: leather helm (`0x716`) picked up — confirmed **gone from the
  tile** AND **present in Monica's inventory** (`LOCXYZ → INVEN`).
- Names cross-checked against the game's own scroll (club/leather helm/dead
  body) and `u6_object 0x715 → 'club' tile=545`.
- **PENDING: `u6_talk` → `u6_conversation` / `u6_say`** (deferred this session).

## Deployment note

The MCP server runs from a **deployment copy** at
`C:\Z_Temp\tools\dosbox_mcp\`; both `dosbox_u6_server.py` **and**
`u6_look_names.py` must be copied there. Impl-only changes need a **server
reconnect**; adding new tools / changing tool signatures needs a **full Claude
restart**. `read_linear`/`read_dos` take **decimal** ints, not `0x..` strings.
