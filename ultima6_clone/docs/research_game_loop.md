# Research: U6 game loop and input dispatch

**Status:** decoded 2026-05-27. Game loop body, command dispatch
catalog, NPC tick, time-advance, and input polling architecture are
read end-to-end. The animation tick site is identified but the
animation channels themselves live in
[`research_animation.md`](research_animation.md) since they cross
multiple subsystems.

Citations use relative paths within the u6-decompiled clone (e.g.,
`seg_0A33.c:1020`). The clone's absolute path is per-PC; see
[`../CLAUDE.md`](../CLAUDE.md) §"Source of truth".

## Headline structure

U6's game loop is **turn-based blocking**, not a real-time render
loop. The shape is:

```
do {
    RefreshStatus();           // dirty-flag-gated UI redraw
    ch = CON_getch();          // polls until input arrives (or autocmd fires)
    /* phase 1: keystroke → CMD_* translation + targeting setup */
    /* phase 2: digit → party-mode / solo-mode switch */
    /* phase 3: action dispatch on the translated CMD_* */
C_262D:
    if(ch != 0x12D /*exit*/) {
        autorestore / autosave hooks;
        C_1E0F_4E0A();         // per-action NPC tick (drives time)
        C_0A33_117A();         // erupting object follow-up
        prompt next command;
    }
} while(ch != 0x12D);
```

Body: `C_0A33_1CB4()` at `seg_0A33.c:1020-1405`, called from `main()`
at `seg_0903.c:617` with the explicit comment `/*-- game loop --*/`.

**Time advances when, and only when, NPCs run out of move points** —
inside `C_1E0F_4E0A`. The game-loop iteration itself does not advance
time; it just kicks the NPC tick once per player action.

## Three-phase command dispatch

After `CON_getch()` returns a key code, the body runs three switch
statements in sequence on the same variable `ch`.

### Phase 1 — keystroke translation (`seg_0A33.c:1034-1139`)

Single-letter commands get translated into the engine's `CMD_*`
opcodes and set up the targeting cursor / selection mode. The
translated `ch` value carries forward into phases 2 and 3.

| Key | CMD_* | Side effects |
|-----|-------|--------------|
| `A` | `CMD_81` (attack) | `SelectMode = 1`, `AimX/Y = 5`, `SelectRange = 7`; if `D_04A7 >= 0` (existing aim target) computes AimX/Y from target position |
| `C` | `CMD_82` (cast) | `SelectMode = 3`, same aim defaults |
| `T` | `CMD_83` (talk) | `SelectMode = 1`, `SelectRange = 7` |
| `L` | `CMD_84` (look) | `SelectMode = 1`, `SelectRange = 7` |
| `G` | `CMD_85` (get) | `SelectMode = 1`, `SelectRange = -1` (no range cap) |
| `D` | `CMD_86` (drop) | `SelectMode = 2`, `SelectRange = 7`; switches `StatusDisplay = CMD_92` (inventory) |
| `M` | `CMD_87` (move) | `SelectMode = 1`, `SelectRange = -1` |
| `U` | `CMD_88` (use) | `SelectMode = 1`, `SelectRange = -1` |
| `R` | `CMD_89` (rest) | `SelectMode = 1`, `SelectRange = 7` |
| `^S` | `CMD_AA` (save) | — |
| `B` | `CMD_8A` (begin/break combat) | — |

Every case also calls `C_0C9C_1AE5(0)` to clear the prompt area and
sets `D_0497 = 0` (input-mode reset). The attack case has an extra
optimization: if a previous aim target is still valid (`D_04A7 >= 0`
and within the 11×11 viewport), it pre-positions AimX/Y so the player
can just press Return to re-attack.

### Phase 2 — party/solo mode toggle (`seg_0A33.c:1142-1199`)

`'0'`-`'9'` (capped at `PartySize + '1'`) toggles party formation. `'0'`
restores party mode (`SetPartyMode()` at `seg_0A33.c:966`); `'1'-'9'`
puts a specific member into solo mode (`SetActive()` at
`seg_0A33.c:954`). Both paths gate on `IN_VEHICLE` / `InCombat` and
print error messages. `'0'` additionally requires `CLOSE_ENOUGH(8, …)`
for every party member (party-mode demands proximity).

### Phase 3 — action dispatch (`seg_0A33.c:1201-1387`)

Big switch on the (possibly translated) `ch`. Action handlers:

| ch | Action | Calls |
|-----|--------|-------|
| `CMD_80` (advance) | Walk in `AdvanceDir` direction | `C_1E0F_1B0E(AdvanceDir)` |
| `5`, `17`, `0x12D` | Exit to DOS | Y/N prompt → set `ch = 0x12D` to break loop |
| `CMD_81` | Attack | `COMBAT_attack()` (seg_2337) |
| `CMD_8A` | Begin/break combat | `COMBAT_breakOff()` / `COMBAT_begin()` |
| `CMD_82` (cast) | Two-phase spell flow | sets `MouseMode = 1`, calls `C_1944_4C2F()` |
| `CMD_83`-`88` (talk/look/get/drop/move/use) | Target selection then dispatch | After second `CON_getch`, if `di == CMD_8E` dispatch to `C_27A1_0C67` (look), `C_27A1_14DA` (drop), `C_27A1_18F5` (get), `C_27A1_1E8B` (move), `C_27A1_6179` (use), or `TALK_talkTo(Active, Selection.obj, 1)` (talk) — then `MUS_09A8()` |
| `CMD_89` (rest) | Sleep/heal | `C_3200_055D()` with music mute via `MUS_091A(8)` and unmute on completion |
| `CMD_AA` (save) | Save game | Y/N prompt → `C_0C9C_089F()` |
| `18` (^R) | Restore | Y/N prompt → `C_0C9C_0397()` |
| `27`, `' '`, `CMD_8F` | Pass turn | Zeros `MovePts[Party[Active]]`, advances ship if in vehicle and wind blows, calls `MoveFollowers(Party[Active], 1)` |
| `26` (^Z) | Sound toggle | Flips `SoundFlag`, calls `MUS_091A(0)` / `MUS_09A8()` |
| `8` (^H) | Help toggle | Flips `D_04A1` |
| `0x119` (Alt+P) | Palette | `C_0903_0776()` |
| `22` (^V) | Version | Prints `VersionMsg` |
| `213` (Alt 2 1 3) | Peer/info debug | Prints KARMA + clock + map position; calls `C_2FC1_1FD6()` |
| `214` (Alt 2 1 4) | Goto-coord debug teleport | `__GetHex(3)` for x, y, z then `PartyTeleport(x, y, z, 0)` |
| `215` (Alt 2 1 5) | +60 minutes debug | `C_0A33_1355(60)` with `AllowNPCTeleport` set, then `C_1E0F_464A()` |
| default | Unknown | Prints `WhatMsg` |

The two-phase "select target then act" commands (look/get/drop/move/
use) re-enter `CON_getch` inside the handler — this is how mouse
clicks / arrow-key cursor moves get bound to the original command.

### End-of-iteration epilogue (`seg_0A33.c:1389-1403`)

After phase 3 (label `C_262D`):

1. Two autosave/autorestore hooks: if `D_2E9E == 'R'` → restore, if
   `D_2E9E == 'G'` → save. (Likely set by gameplay events like
   resurrect-via-Lord-British or "near-death" auto-save.)
2. **`C_1E0F_4E0A()`** — per-action NPC tick (drives time
   advance, see below).
3. **`C_0A33_117A()`** — `Erupting > 1` follow-up (lava / volcano
   shake + spawn detonate effect).
4. If `ch != CMD_80` → `PromptFlag = 1`. Advance-command (`CMD_80`)
   keeps the player moving without a re-prompt; everything else
   prints a fresh "ActiveCharName:\n>" prompt.

## NPC tick — `C_1E0F_4E0A()` at `seg_1E0F.c:2147`

This is THE function that runs the world between player actions.
Called once per command from the game-loop epilogue. Structure:

```c
C_1E0F_4E0A() {
    C_1E0F_4B6A();   // ?
    C_1E0F_4746();   // ?
    C_1E0F_464A();   // path / schedule maintenance
    bp_08 = Party[Active];
    do {
        do {
            // for each NPC: skip if motionless/asleep/dead/no-movepts/
            //               wrong-Z/off-area
            // find highest-priority NPC by (MovePts, DEXTE) ratio
            // pick the one with most movepts vs dexterity
            if (di <= 0) {
                // round exhausted — replenish MovePts, advance time 1 min
                for (i = 0; i < 0x100; i++) MovePts[i] = ... + DEXTE[i];
                C_0A33_1355(1);
            }
        } while (di <= 0);
        if (!C_1E0F_0FA9(bp_08)) {
            // NPC could not act — handle path / schedule retry
            C_1E0F_3E6A(bp_08);
            C_1E0F_4B6A();
            C_0A33_0D06();   // composite-dirty render
        }
    } while (NPCMode[bp_08] != AI_COMMAND || IsDraggedUnder(bp_08));
    // return when active party member is back in player-control
}
```

**Mechanism**:

- Each NPC has `DEXTE[i]` (dexterity) move points per round and
  `MovePts[i]` (remaining budget).
- The inner loop scans all 256 NPC slots looking for the highest-
  priority candidate by `MovePts[i] * bp_06 - DEXTE[i] * di`
  (`seg_1E0F.c:2200`) — favors high-movepts, low-dexterity, but
  ties broken by latest discovery.
- Selected NPC acts via `C_1E0F_0FA9(npcId)`. If it can't act (no
  legal move?), `C_1E0F_3E6A` reconsiders its schedule, then
  `C_0A33_0D06` triggers a composite redraw if needed.
- When `di <= 0` (no NPC has positive movepts), **time advances by
  1 minute** via `C_0A33_1355(1)` and movepts replenish.
- The outer loop exits when the active party member's `NPCMode`
  returns to `AI_COMMAND` (= "player turn ready").

**Implication**: 1 player action = at minimum 1 minute of game time
(if the player's DEXTE is high enough to act first in the new round)
but commonly many minutes (each round = ~1 minute, and slow players
may wait several rounds for their turn). Time advances entirely
inside this function — the game-loop body never calls `C_0A33_1355`
directly except for the debug +60-minute hotkey.

## Time-advance — `C_0A33_1355(int minutes)` at `seg_0A33.c:715-937`

The system-level update per N minutes. Called from `C_1E0F_4E0A`
with `minutes = 1`, from `main()` with `minutes = 0` (initial state
stamp), and from the Alt+215 debug hotkey with `minutes = 60`.

Phases (in order, simplified):

1. **Spell-FX timer decrement** (lines 722-740) — `SpellFx[14]`
   (time stop) special-cases (sets `D_ECC4->_0e` to gate animation,
   then early-return); other 15 entries decrement uniformly.
2. **Powder keg timer** (742-747) — `D_2CA4` countdown; `Detonate`
   at 0.
3. **Random eruption roll** (749-750) — 1/8 chance to set
   `Erupting = 1` (the `Erupting > 1` check in `C_0A33_117A` only
   fires if a subsequent action upgrades it; here it just primes).
4. **Per-player-controlled inventory walk** (754-823) — for each
   `IsPlrControl(i)` NPC:
   - **Torch (OBJ_05A frame 1)**: 50% chance per tick to consume
     fuel via `SubQuan(di, minutes)`; delete + `PromptFlag = 1` on
     burnout.
   - **Invisibility ring (OBJ_102)**: 1/1000 chance of catastrophic
     vanish — `ClrInvisible`, `ScreenFade`, `C_0A33_09CE(1)` redraw,
     delete ring.
   - **Regeneration ring (OBJ_101)**: heal `HitPoints[i]` by
     `minutes` up to `MaxHP(i)`; 1/1000 chance of vanish.
   - **Storm cloak (OBJ_051)**: 1/1000 chance of vanish (cancels
     `SpellFx[13]`).
5. **Per-minute status-effect rolls** (826-843) — loops
   `bp_14 < minutes`, rolling random clears for `IsInvisible`,
   `IsProtected`, `IsCursed`, `IsCharmed`, `IsParalyzed`, `IsAsleep`,
   `IsPoisoned`. Each effect has its own probability + INT/STR check.
   Poison damages 1 HP per fail.
6. **Hour rollover** (853-885) — outer `for(bp_12 = Time_M + minutes;
   bp_12 > 59; )` loop. Per hour: `Time_H++`, with cascade to `Date_D`
   (28 days/month), `Date_M` (12 months), `Date_Y`. Per hour also:
   `NextSleep--` / `DrunkCounter--`, `C_1E0F_5165()` (NPC schedule
   re-check), MP regen for party members with mana classes.
7. **Hourly hooks** (888-913) — once per hour: `MUS_Clock` update
   (12-hour cycle for music selection), sundial tile update
   (`GR_4B` on `BaseTile[OBJ_0EB]` selecting `TIL_148+(Time_H-5)>>1`
   for daytime, `TIL_13C` for night), moon phase recompute (`D_2CC6`
   / `D_2CC7` / `D_2CC8` / `D_2CC9` from `D_036A` lookup),
   `C_2FC1_19C5()` (graphics callback), `C_0A33_121A()`
   (moongates spawn/despawn based on phase).
8. **Wind reroll** (915) — `C_0A33_12F6(0)` (1/64 chance, overworld /
   sky only; sets to -1 in dungeons).
9. **Ambient light bucket** (918-931) — `D_2C55` recompute based on
   `Time_H` + `Time_M`:
   - `Time_H == 5` (dawn): `D_2C55 = Time_M / 10 + 1` (6 steps)
   - `Time_H == 19` (dusk): `D_2C55 = (59 - Time_M) / 10 + 1`
   - 6 ≤ Time_H ≤ 18: `D_2C55 = 7` (full daylight)
   - Else / eclipse / dungeon: `D_2C55 = 0` (full dark)
   - Torch (`bp_0c`) or LightSpell (`SpellFx[0]`) sets floor at 4
   - **If bucket changed → `C_1100_0306()`** (full viewport
     recompose).
10. **Display refresh** (933-936) — print `DateMsg` (date + wind
    direction) into the status-text region.

**Key takeaway**: the only render side-effect of normal time-advance
is the conditional ambient-light recompose at step 9. Sunrise and
sunset thus produce **stepped redraws every 10 minutes of game time**
during 5:00-5:59 and 19:00-19:59 (6 steps each). Other transitions
are invisible to the composite pass — animation is the palette /
animdata channels' job (see [`research_animation.md`](research_animation.md)).

## Input polling — `CON_getch` → `C_0C9C_1D59` → `CON_prompt`

The "blocking keystroke wait" is layered:

### `CON_getch` = `C_0C9C_2A59` at `seg_0C9C.c:1423-...`

Wrapper that handles UI-mode commands (status panel selection, party
selection, container open/close, spellbook page-flips, etc.). On a
UI command, it sets a dirty flag and re-loops without returning;
only "real" game commands return to the caller.

```c
CON_getch() {
    if(D_0578) { D_0578 = 0; return CMD_8E; }  // pending default fire
    do {
        endLoop = 0;
        ch = C_0C9C_1D59();             // <-- actual poll
        switch(ch) {
            case CMD_A9: /*default*/    ch = DefaultCommand; ...; endLoop=1;
            case CMD_91: /*status full*/ StatusDisplay = CMD_91; ...;
            case CMD_90/92/93/94/95/96/99/9A/9F/A0/A2/A5/A7/A8: UI; no endLoop
            ...
        }
    } while(!endLoop);
    return ch;
}
```

### `C_0C9C_1D59()` at `seg_0C9C.c:1023-...`

The polling layer. `while(!ch)` loop with three things per iteration:

1. **Mouse poll** (`MOUSE_SERVE`): build `mkMouseCommand()` if a
   button is pressed → return immediately.
2. **Keyboard poll** (`CON_prompt`): scan + return any key code.
3. **Translate ALT+letter** (lines 1077-1086) to `setDefaultCommand`
   then `ch = 0` (re-loop). Sets `DefaultCommand` so next CMD_A9
   fires that action.
4. **Translate arrow keys** (lines 1069-1076) to `CMD_80` + set
   `AdvanceDir` (0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW).
5. **SelectMode dispatch** (lines 1094-...) — when actively
   targeting (after Phase 1's `SelectMode = 1/2/3` setup), arrow
   keys move the AimX/AimY cursor inside the 11×11 viewport,
   Tab/Space/Enter/Esc resolve the selection.

### `CON_prompt` = `C_0C9C_0E6E` at `seg_0C9C.c:483-520`

The leaf-level keyboard scan. **This is the animation tick site.**

```c
CON_prompt() {
    ...
    ch = C_31FA_000C(D_04AB);       // non-blocking keyboard scan
    if(ch == 0) {                   // no key pressed → idle tick
        (*D_04CC)(PromptCh + ((PromptCnt++) & 3), promptX, promptY);  // animated cursor
        D_033E = 1;
        if(D_049C) {                // animations enabled
            OtherAnimations();
            PaletteAnimation();
        } else {
            OSI_delay(1);            // no-anim: yield 1 tick
        }
        ServeMouse;
    }
    ...
    return ch;
}
```

When `D_049C` is set (the "play animations" flag), every idle
iteration runs both animation channels. When clear (during menus,
dialogs, fades, etc.), it just `OSI_delay(1)` — yields CPU without
animating.

The animated cursor (`PromptCh + (PromptCnt++ & 3)`) is a 4-frame
text-cell cycle drawn at the prompt position — separate from the
graphics-tile animation channels.

## Implications for the rebuild

The game-loop structure has clear ECS-pipeline mappings:

- **`InputSystem`** → handles `pointermove`/`pointerdown`/keyboard
  events. Translates raw input to a `Command` resource (the modern
  equivalent of `CMD_*`). NO blocking `getch` analog needed — JS
  event loop is async.
- **`CommandDispatchSystem`** → consumes `Command`, kicks off the
  appropriate action system (combat, talk, get, drop, etc.).
- **`NPCTickSystem`** → runs after each player action. Iterates
  NPCs by movepts, advances `WorldClock` resource when round
  exhausted. Mirrors `C_1E0F_4E0A` but expressed as ECS queries.
- **`WorldClockSystem`** → equivalent to `C_0A33_1355`. Drains
  spell durations, ticks light bucket, runs hourly schedule
  re-check. No render side-effects — render channels read clock
  state.
- **`RenderSystem`** → continuous, driven by animation channels +
  drag-scroll input (NOT by game state changes). Reads
  `WorldClock`, `TileRegistry`, `MapObjPtr` and produces frames.
  Source's "render on state change" pattern is not preserved per
  the modern-UX anchor (`../CLAUDE.md` §"Modern-browser UX as
  architectural anchor").

The two-phase "select target then act" commands (look/get/drop/
move/use) don't need a nested `CON_getch` — modern UX is "click
to select" with the cursor pre-positioned, or arrow-key cursor
movement with Enter/Esc resolution. The state machine can be a
single `SelectingTargetForCommand{cmd, range, mode}` resource
that the input system populates.

The autosave/autorestore hooks (`D_2E9E`) are useful precedent —
gameplay events set a flag, the next game-loop iteration acts.
ECS-equivalent: an `AutosaveRequest` component or a `Save`/`Load`
resource.

## Open questions for follow-up research

1. **`C_0A33_0073()` body** (`seg_0A33.c:56`) — called from
   `OtherAnimations` when `D_0340` is set. Likely a render-state
   refresh; needs body read.
2. ~~**`C_1E0F_4B6A()` / `C_1E0F_4746()` / `C_1E0F_464A()`**~~ —
   **RESOLVED** in [`research_npc_ai.md`](research_npc_ai.md)
   §"Pre-tick maintenance". Party-leadership reassignment, combat
   gravity-center computation, and AI_FINDPATH path service
   respectively.
3. ~~**`C_1E0F_0FA9(npcId)`**~~ — **RESOLVED** in
   [`research_npc_ai.md`](research_npc_ai.md). **Correction:**
   `C_1E0F_0FA9` is NOT the action dispatcher — it is only the
   corpser-drag-under gate (returns 1 if the NPC is stuck
   struggling). The real per-mode dispatcher is **`C_1E0F_3E6A`**
   (`seg_1E0F.c:1733`), which switches on `NPCMode` to route each
   NPC's turn (combat handlers, wander, schedule movement, path
   following, etc.).
4. **`C_1944_4C2F()` (Cast)** and the `C_27A1_*` action handlers
   (look/get/drop/move/use) — six sibling functions. Each is a
   separate `seg_27A1` decoding effort.
5. ~~**`TALK_talkTo(Active, Selection.obj, 1)`**~~ — **RESOLVED** in
   [`research_conversation_vm.md`](research_conversation_vm.md).
   Entry point to the conversation VM (`seg_16E1` → `seg_1703`).

## Cross-references

- [`research_engine_overview.md`](research_engine_overview.md) —
  subsystem map; items 1 (game loop), 4 (seg_155D), 7 (conversation
  VM) of the original open-questions list are now partly addressed.
- [`research_world_data.md`](research_world_data.md) — `MapObjPtr`,
  `Link[]` iteration, OBJBLK layout that the action handlers read.
- [`research_map_render.md`](research_map_render.md) — composite
  render path (`C_1100_0306` / `C_0A33_09CE`) called from the
  game-loop epilogue and ambient-light step.
- [`research_animation.md`](research_animation.md) — the three
  animation channels driven by `CON_prompt`'s idle tick.
- [`../CLAUDE.md`](../CLAUDE.md) §"Modern-browser UX as architectural
  anchor" — why the rebuild's render-cadence doesn't follow source's
  on-demand pattern.
