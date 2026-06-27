# U6 AI Agent — design, capabilities, and milestones

The "AI plays Ultima VI" project. An LLM agent plays the **real** DOS Ultima VI
running under DOSBox, by reading live game state out of DOSBox's emulated memory
and injecting input — all through the `dosbox-u6` MCP server. The aim is to show
an LLM can perceive, navigate, converse, and pursue goals in U6 like a (blind)
human player.

This doc is the cross-PC source of truth for the effort. The authoritative spec
for memory offsets is the code (`dosbox_tools/dosbox_u6_server.py`); this doc is
the design + plan around it. The agent-facing **capability manifest** — premise,
how-to-play (the U6 keyboard command model), and the perceive/act tool surface
with source citations — is `dosbox_u6_passability.md`'s sibling
`u6_agent_capabilities.md`.

## 1. How the agent operates

Mental model: **the LLM is the brain; the `dosbox-u6` tools are its eyes and
hands.** The tools absorb all the mechanics so the agent reasons at the *verb*
level ("go to Iolo", "say *name*"), never at the keystroke/byte level.

| Lives in the tools (mechanics) | Lives in the agent (judgment) |
|---|---|
| keystroke timing, scancodes, window focus | which NPC/place to approach |
| step-confirm + replanning around moving NPCs | what keyword to say next |
| line-vs-single-key conversation input | when a goal is met / when to stop |
| memory offsets, DS calibration | interpreting dialogue; recovering from "stuck" |

Loop: **perceive → reason → act → observe**, repeated. Boot once with
`u6_hook`, then orient (`u6_avatar`/`u6_npcs_near`), pick a target, drive a
batteries-included verb (`u6_goto`, `u6_talk`), read the text result, repeat.

The **conversation sub-loop** is where "AI plays" really happens, and the
turn-based VM makes it clean: `u6_conversation` (decoded dialogue + the askable
keywords) → LLM picks a keyword → `u6_say` → repeat. Because
the VM *blocks* on input, the read→decide→say rhythm matches the game with no
race.

**Input is focus-dependent.** DOSBox reads the keyboard via DirectInput, so
`SendInput` only lands while the DOSBox SDL window is foreground; the tools focus
it first. This is swappable later to an injection-DLL backend (calling DOSBox's
internal `KEYBOARD_AddKey`) for focus-independent input, with no change to the
tools or the agent.

**Focus rule (binding for the agent):** the DOSBox SDL window MUST be the
foreground window for input to register. The action tools
(`send_key`/`send_text` → `u6_move`/`u6_talk`/`u6_say`/`u6_key`/`u6_goto`)
auto-focus first (the `SetForegroundWindow` dance via `focus_window`), but the
agent should still:
- call `focus_window()` once at the **start** of a session (DOSBox may not be
  focused when the agent begins), and
- re-focus whenever input may not have landed — a `send_*` returns a "could not
  bring to foreground" error, OR `u6_avatar` shows the Avatar did **not** move
  after a step. In that case call `focus_window()` and retry the action; if it
  still won't focus, the human must click the DOSBox window (or switch to the
  injection-DLL backend).

## 2. Capabilities — the `dosbox-u6` tools

Implemented (logic verified; **memory offsets pending live verification** — see
§6):

- **Boot:** `u6_hook(avatar_name)` — attach, BDA-calibrate MemBase, derive DS
  from the avatar's name.
- **Perceive:** `u6_avatar` (pos+facing of the **controlled actor** — the
  move-confirm primitive; the avatar in party mode, the active member in solo),
  `u6_party` (solo/party mode, combat on/off, and who's controlled now),
  `u6_input_state` (**turn-readiness** — poll for `COMMAND_READY` before acting;
  U6 is turn-based with buffered input), `u6_roster_status` (per-member
  STR/DEX/INT/Level + carry/equip load), `u6_object(slot)` (incl. tile/weight/
  equip-slot), `u6_inventory(npc_slot)`, `u6_panel_state` (which side panel is up +
  the inventory cursor/scroll/visible slots/Selection — the eyes for the inventory
  route), `u6_npcs_near(radius)`,
  `u6_objects_near(radius)` (map items + gear hints), `u6_walkable` (40×40 ASCII
  passability grid), `u6_conversation` (**decoded** dialogue + askable keywords;
  `keyword=` previews a response; unknown opcode → `DECODER_STOP`, halt + report).
- **Act:** `u6_move(dir)`, `u6_talk(dir)`, `u6_say(text)`, `u6_look(dir)`,
  `u6_get(dir)`, `u6_use(target, on)` (map tile **or** carried item; auto key flow
  for a locked door), `u6_ready(slot)` (equip/unequip via the panel), `u6_key(key)`.
- **Navigate:** `u6_pathfind(npc_slot)` (planner), `u6_goto(npc_slot)`
  (closed-loop), `u6_goto_xy(x,y)` (closed-loop to a tile, live 40x40 window),
  `u6_talk_to(npc_slot)` (goto + talk), and `u6_route(x,y)` — a **whole-level**
  planner over the BAKED static terrain (`mapdata`: `MAP`+`CHUNKS` expanded to the full
  1024x1024 surface / 5x256x256 dungeons), so the agent can plan to a tile it can't
  currently see, beyond the live window. Terrain-only (doorways passable; a closed door
  is opened at move time); see the egress finding in §2b.
- **Verify:** `u6_validate_passability` (predict-vs-live fidelity gate for the
  passability oracle — see `dosbox_u6_passability.md`).
- **Inherited:** base tools (`read_dos`/`write_dos`/`status`/…) and input tools
  (`find_window`/`focus_window`/`send_key`/`send_text`) — escape hatches; the
  agent normally stays in the `u6_*` verbs.

Planned (gaps — see the milestones for which are needed when):

- `u6_read` (books/signs → `BOOK.DAT`, by driving LOOK then reading `TalkBuf`),
  `u6_drop` / `u6_move`-object (inventory↔map / push / transfer between members —
  the two-selection idiom, and the route to extract a key stuck in a container),
  `u6_cast` (the spell subsystem), `u6_rest`, combat (`u6_attack` / begin-combat),
  and a **durable agent journal** (the long-horizon backbone). *(Built since the
  first draft and now under Perceive/Act above: `u6_look`, `u6_get`, `u6_use` (map
  tiles + carried items + the **auto** locked-door key flow), `u6_ready`
  (equip/unequip via the inventory panel), `u6_panel_state`, `u6_objects_near`,
  `u6_roster_status`, and the `u6_conversation` decoder. The inventory-panel verbs
  are built but **live-unconfirmed** — see §6. Full per-verb source + MCP-driving
  model: `u6_verb_mechanism.md`.)*

## 2b. Castle-escape play-test + the tool roadmap (2026-06-27)

A directed end-to-end play-test (the human gave 7 high-level steps; the agent discovered
all specifics LIVE, **no oracle docs**): hold LB's key → drive south → confirm the
portcullis closed → find the qual-1 gatehouse doors → unlock + enter → pull the lever
(opens the portcullis) + turn the crank (lowers the drawbridge) → walk OUT across the
lowered bridge. **It succeeded** — the full perceive→reason→act→observe loop held across
navigation, a locked door, a key, a two-part mechanism, and egress.

It also exposed the agent's real weaknesses (efficiency, not capability), which set the
build order:
- **#1 (urgent) structured spatial queries** — `u6_at` / `u6_nearest` /
  `u6_interactables_near` (stubbed in `cartography`): the agent kept mis-counting ASCII
  grid columns and re-surveying the same area; it should query decoded, decision-ready
  facts (terrain + object + state + how-to-reach) instead of parsing maps.
- **#2 (urgent) `u6_use_object`** (stubbed in `act`): one-call "go adjacent + USE",
  removing the manual repositioning the diagonally-placed crank forced (~3 wasted rounds).
- **#3 (after #1/#2)** give `u6_route` a door-as-passable object-overlay — then it could
  plan the whole castle→gate route; today only the live-grid driver `u6_goto_xy` crosses
  closed doors / the lowered drawbridge.
- **#4/#5 (later)** persistent spatial memory (the "big picture" — kill re-surveying) and
  decoded mechanism states (portcullis/drawbridge open/closed vs raw frames).

**Egress finding (validates the terrain-only / live-grid split):** `u6_route` (terrain-
only) correctly **cannot** cross the moat, while `u6_goto_xy` (live grid, objects
included) **crossed the lowered drawbridge** fine. So castle egress works at drive-time
the moment the bridge is down; the object-overlay (#3) is only needed for the *planner*
to predict a path out, not for actually leaving.

## 3. Pathfinding

4-connected **weighted Dijkstra** over a walkable+cost grid that is a faithful
port of the engine's land-walker move gate `C_1E0F_000F` (terrain + objects incl.
multi-tile spread + bridge/breakthrough overrides; NPCs kept off the plan as a
separate dynamic layer so routes re-plan around them — see
`dosbox_u6_passability.md`), with per-cell cost `(TerrainType[ground]>>4)+1` so
routes skirt forest/swamp instead of cutting through. Moving NPCs are handled
**reactively** by `u6_goto`'s closed loop (plan → one step → confirm via
`u6_avatar` → replan on block, stuck-guard), mirroring how the engine resolves
NPC-vs-NPC collisions at step time. A\* is reserved for a future global
(chunk-based) routing upgrade beyond the local 40×40 window; at 40×40, A\* and
Dijkstra are equivalent so simplicity wins.

## 4. The blind-discovery principle (no cheating)

The agent must **discover** U6's story through play like a human — it is **not**
given the decoded quest chain. The split is "what did a 1990 player have on day
one?":

- **Starts with (fair):** *how to play* (controls/verbs/conversation-keyword
  convention — deduced from the source, which is authoritative) + *the premise &
  world* (Avatar summoned, gargoyle war, shrines/virtues — from the player
  manual). A human had these.
- **Discovers (earns through play, withheld):** the specific quest chain — who
  holds what, the gates, the false-prophet/gargoyle-peace twist.
- **The flip:** the decoded quest material (`ultima6_clone/docs/quest_log.md`,
  `research_main_quest.md`, `research_npc_scripts.md`) is the **evaluation
  oracle** — used to score "did the agent discover X?" — and is **never** placed
  in the agent's context.

Discovery loop: explore → interrogate NPCs (keyword convention: ask `name`/`job`,
chase keywords surfaced in replies — how U6 leaks its plot) → read books/signs →
maintain the agent's **own** journal (clues/names/leads = its discovered
knowledge, built like a human's notebook).

## 5. Milestones

### Milestone 1 — "live in the castle" (tutorial run)

Small enough to prove the agent can *live* in the world before the (very large)
full-quest scope. Exercises all four interaction modes; no combat.

**Setup:** a fixed game **save** that starts AFTER the opening gargoyle combat —
Avatar + party inside Lord British's castle. A fixed save gives a reproducible
start and repeatable scoring.

**Goal (phases):**

| Phase | Agent does | Tools |
|---|---|---|
| A. Talk to LB | go to Lord British, converse, learn the story + the gear list | have |
| B. Explore the castle | walk the rooms, build a mental map | have |
| C. Leave the castle | navigate to the gate, walk out (success = Avatar outside the castle bounds) | have; `u6_use` opens/leaves a gate — and **auto-opens a *locked* one** (finds the matching owned key), live-unconfirmed |
| D. Collect the gear LB named | find the items, pick them up | `u6_objects_near` + `u6_look`/`u6_get` (LOOK/GET live-verified) |
| E. Equip the party | ready the gear onto each member | `u6_ready` **built** (equip/unequip via the panel; live-unconfirmed) |

LB is the **task-giver** — the agent learns *what gear* by reading LB's dialogue
live, not from a list we hand it. Consistent with §4.

**Sequencing (dovetails with live-test-first):**
- **Slice 1 = A + B + C** — the live-test target for the perceive/act/nav stack
  (validates hooking, conversation, navigation, the turn-readiness gate, the exit
  check, and the offsets in one run). `u6_use` (incl. the **auto** key flow) is
  built, so a locked gate is covered too — live-unconfirmed.
- **Slice 2 = D (collect)** — gear **perception** done (`u6_roster_status`,
  `u6_objects_near`, `u6_object` tile/weight/equip-slot) + the collect verbs
  `u6_look`/`u6_get` **live-verified**.
- **Slice 3 = E (equip)** — `u6_ready` **built** (equip/unequip via the panel;
  live-unconfirmed) — the last M1 tool. **The M1 toolset is now complete**;
  Slices 2–3 await the live run.

**Success criteria:** talked to LB and extracted the gear list; collected the
named gear; equipped the party; Avatar exited the castle. Each phase is
independently checkable.

**Open wrinkles to pin:**
1. Does LB literally enumerate the gear in dialogue, or is it "the armory
   equipment lying around"? (decides the collect success-check.)
2. Equip via keystroke-driven UI vs memory poke — **resolved**: `u6_ready` drives
   the real panel keys (`F<member>`/`<tab>`/`<enter>`) but *places the cursor* by a
   memory write (the commit + ready toggle still run in the engine). Confirm live.
3. Define the castle bounding box for the leave-check.

## 6. Status & verification

- Tools are implemented and **offline-verified where the logic is checkable**: the
  pure memory-reads (faithful passability `C_1E0F_000F`, party/control + combat, the
  `u6_input_state` turn gate, gear-perception, the conversation-VM decoder), the
  panel-state decode, AND the **inventory-action sequences/decisions** (`u6_use`
  carried-item + the key flow, `u6_ready` equip/unequip, the `_panel_commit` panel
  drive) — all with stub unit tests against the real functions (in
  `dosbox_tools/tests/`); pathfinding/helpers too.
- **Live-verified on an in-castle save** (avatar "Monica"): the memory offsets +
  the read tools (`u6_avatar`/`u6_party`/`u6_input_state` cross-consistent;
  `u6_roster_status` caps = STR×20 / STR×10) + `u6_move` (a confirmed step) +
  `u6_look` (drains to `COMMAND_READY` across NPC / diagonal / empty-corpse /
  corpse-with-contents, no stray GET) + `u6_get` (a helm `LOCXYZ → INVEN`) + the
  `LOOK.LZD` naming (cross-checked vs the game's own scroll).
- **Still live-unconfirmed:** `u6_talk`/`u6_say` (deferred from that run); `u6_use`
  (map-tile, carried-item, key flow); `u6_ready`; `u6_panel_state` + its offsets
  (`StatusDisplay`/`Selection`/`D_E70F`/`Equipment`/`D_0499`-`049A`/`D_07CE`). These
  send keys and/or read new offsets — *bindings prove out only live*; run
  `u6_panel_state` first (confirm the inventory reads), then the inventory verbs.
  Re-run the §7 validation gate each session before trusting reads.
- 4-connected movement only (cardinal arrows); diagonals (numpad + 8-connected
  search) and global chunk routing are deferred.

**Next step:** live-test Milestone 1 — Slice 1 (talk to LB → explore → leave),
then the gear slices (collect → equip). The **M1 toolset is complete**, so this is
the live-validation pass: confirm the offsets/bindings + `u6_panel_state`, then run
`u6_use`/`u6_ready` for the locked gate + equip.

## 7. Running the agent (per session)

**One-time per PC:** pull the `dosbox` branch; `pip install "mcp[cli]"`; register
the server — `claude mcp add dosbox-u6 python <path>\dosbox_tools\dosbox_u6_server.py`
(or `.mcp.json`; see `README.md`); have DOSBox + U6 + the prepared post-intro
castle save.

**Each session:**
1. Launch DOSBox, load U6, load the castle save so the Avatar + party are in the
   castle at the playable prompt. Keep DOSBox the **foreground** window
   (`SendInput` needs focus). Same-user / non-elevated is fine unless DOSBox runs
   elevated.
2. Open Claude Code with the `dosbox-u6` MCP connected (`/mcp` to confirm the
   `u6_*` tools loaded; reload config if just registered). This session is "the
   agent."
3. **Validation gate — the agent MUST do this before playing, then PAUSE for the
   human.** The offsets are live-unverified, and the agent **cannot see the
   DOSBox screen**, so the final visual match is the human's call. Do not start
   the play loop until this gate passes and the human confirms.
   - *Agent self-checks (no vision needed):*
     a. `u6_hook('<exact in-game avatar name>')` → the name must **read back**
        correctly (confirms DS derivation + the Names offset). If not, stop.
     b. `focus_window()`, then **test step:** `u6_avatar` → `u6_move('n')` →
        `u6_avatar` → the Avatar's `y` must change by 1 (try another direction if
        blocked). This one check validates input injection + focus + the
        avatar-position offset + the move binding together — the strongest single
        self-test.
     c. `u6_walkable()` → a **sane** grid: an `@`, and a mix of `.`/`#` (NOT
        all-open or all-blocked, which signals a bad terrain/origin offset).
     d. `u6_npcs_near()` → NPCs at plausible distances (LB + party should be near
        in the castle).
   - *Human check (needs eyes on the game):* does the `u6_walkable` grid match the
     castle layout on screen, and the Avatar position look right?
   - **Then PAUSE: report the self-check results + the grid, and wait for the
     human to confirm the map matches before playing.** A failed self-check
     pinpoints which offset to fix (§6) first — e.g. DS calibration (name read-
     back) or the `AreaX/AreaY` terrain-window origin.
4. Give the agent the goal and let it loop. Starter prompt:

   > You are playing Ultima VI through the dosbox-u6 MCP tools. Read
   > `dosbox_tools/docs/u6_ai_agent.md` for how the tools work and the rules. Do
   > NOT read the ultima6_clone quest docs — discover the story yourself. Step 1:
   > run the §7 **validation gate** first (hook name-readback; a test `u6_move`
   > that changes `u6_avatar`; a sane `u6_walkable` grid; `u6_npcs_near`), then
   > **PAUSE and report the results + the grid and wait for my OK** — do NOT start
   > playing until I confirm the map matches the screen. After I confirm: Milestone
   > 1 Slice 1 — find and talk to Lord British (learn the story + the gear list),
   > explore the castle, then leave it. Keep DOSBox foreground; if a move/say
   > doesn't register (Avatar didn't move), call `focus_window()` and retry. Keep a
   > journal of what you learn. Go one step at a time and confirm each action.

For the **first** run keep a human in the loop — step through and check each
tool's output against the screen rather than letting it sprint, so offset errors
surface early. A fully autonomous / headless run (Claude SDK) is the later form.

## 8. Error handling & escalation (binding for the agent)

Tools report problems as plain-text results, not exceptions. The agent MUST read
every tool result and act on errors — **never assume success, never fabricate
state, never loop the same failing call.** "Escalate" = stop, and report to the
human (or halt a headless run): what you were doing, the exact tool + error, what
you tried, and your best guess at the cause/fix.

**Two phases — and right now we are in BRING-UP.** The tools are not yet proven
against a live U6, so escalation is NOT a dead end — it is the trigger to **fix
the tool**:
- **Bring-up phase (current, until the tools pass validation + a clean Slice-1
  run):** the DEFAULT suspicion for any tool error or tripped consistency check
  is **tool un-readiness** — a wrong offset, a bug, or a bad assumption (e.g. a
  wrong DS or terrain-window origin). The agent HALTS and escalates; the developer DIAGNOSES and
  **fixes the tool**, then re-runs the §7 validation gate; only then does play
  resume. Do NOT let the agent "work around" a flaky tool or keep playing on
  unverified reads — fix the root cause first.
- **Operation phase (after the tools are proven):** the tools are trusted, so a
  failure is more likely real game state (blocked path, dead-end dialogue); tool
  bugs become the less-likely (but still possible) cause.

Policy by failure class:
- **Not attached / MemBase not set / name not found at hook / no DOSBox window**
  → a setup problem needing the human (launch DOSBox, load the save, fix the
  exact avatar name). **Escalate immediately** with the specific fix.
- **"could not bring to foreground"** → `focus_window()` and retry **once**; if
  it still fails, **escalate** ("click the DOSBox window").
- **Move blocked / "Stuck …" / "No path"** → usually a legitimate game state;
  let the closed loop replan or pick another route/target. Once `u6_goto`'s
  built-in stuck-guard gives up, **escalate** rather than re-issuing the same
  call.
- **"Read failed: …" (OSError)** → retry **once**; if it persists, DOSBox likely
  closed/crashed or an offset is wrong → **escalate**.
- **Plausible-but-WRONG data (the insidious one)** — a bad offset can return data
  that *looks* valid; the agent can't always detect it directly. Run cheap
  consistency checks during play and **HALT + escalate** when one trips, rather
  than playing through:
  - `u6_avatar` should change by ±1 per step — an impossible jump, or no change
    after a move that didn't report "blocked", is a red flag.
  - `u6_walkable` should stay sane (not suddenly all-`#` or all-`.`).
  - `u6_conversation` should report a real NPC name, not garbage. **If it returns
    `status=DECODER_STOP`, HALT and report the opcode + hex** — the converse
    decoder hit a bytecode it can't handle; acting on partial dialogue could miss
    or misread quest info. (Random-flavor `[either: A | B]` branches are normal;
    only `DECODER_STOP` halts.)

**Discipline:** bounded retries only (≈1–2, never an infinite loop); on a genuine
block, STOP and report. **When in doubt, escalate rather than act** — input goes
to the REAL game, and this bias matters most on early runs while the offsets are
still unverified.

## 9. References

- Memory layout is baked into `dosbox_tools/dosbox_u6_server.py` (constants with
  citations) — the authoritative offset spec.
- Server/tool reference + setup: `dosbox_tools/README.md`.
- Command (verb) mechanism + how the MCP drives each: `u6_verb_mechanism.md`.
  Movement passability: `dosbox_u6_passability.md`. Object naming (`LOOK.LZD` →
  `u6_look_names.py`): `u6_object_naming.md`. Agent-facing capability manifest
  (premise / how-to-play / tool surface): `u6_agent_capabilities.md`.
- Ground truth for U6 internals: the ergonomy-joe `u6-decompiled` C source
  (`seg_1703.c` talk VM, `seg_101C.c` `GetTileAtXYZ`, `seg_1E0F.c`
  `__ComputeResistance`, `u6.h`, `ai.h`, `tile.h`).
- Evaluation oracle (developer-only, never fed to the agent):
  `ultima6_clone/docs/quest_log.md`, `research_main_quest.md`,
  `research_npc_scripts.md`.
