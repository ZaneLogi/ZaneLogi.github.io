---
name: sim
description: >-
  Drive the running ultima6_clone like a player — reload, step (8-dir, incl. walking
  into a dungeon/cave), the full verb set (LOOK / USE / GET / MOVE / DROP), changing
  dungeon levels by ladder, and a full TALK conversation with an NPC. Invoke as
  `/sim <action…>`. Everything goes through the game's REAL input surface
  (`window.__U6.cmd` + synthetic key events + the dialog DOM), so it behaves exactly
  as if Zane were playing. Use when asked to simulate player actions / "play" the game.
scope: ultima6_clone — needs the running preview, booted, with the user's U6 data dropped. ENGINE/PLAYER-DRIVE (mutates the live sim like a player would); nothing committed. Not a quest-content tool — never writes quest_log / research_npc_scripts / Journal.
---

# /sim — drive the running game as a player

A committed project dev-skill (see `ultima6_clone/CLAUDE.md` §"Project dev-skills"). On
`/sim …`, read and follow this file. **Don't re-derive the mechanics — the concrete
recipes are below; substitute the args and run them via `preview_eval`.** Every recipe
uses the game's own wired input, so the result is the genuine player path (the same
handlers, gates, and modals a keypress would hit).

Pairs with `/teleport_to` (go to a tile), `/locate` (find a tile), `/decode_npc` (read a
script before talking), `/decode_egg` (eggs). This skill is the "do it" layer.

## 0. Prereqs
- `preview_list` → grab the `u6` serverId; `preview_start("u6")` if none. All evals run via
  `preview_eval`. The game must be booted (`!!window.__U6 && !!window.__U6.world`).

## 1. The dev input surface (what you drive)
- **`window.__U6.cmd.dispatch({ verb, target:{x,y}, item })`** — the wired verb front-end WITH
  full modal context (opens the conversation / book / Orb-cursor just like a keypress). Verbs:
  **`use` · `look` · `get` · `move` · `talk`** (+ `drop`, which needs `item`). Enforces per-verb
  reach + the talk gate.
- **`window.__U6.cmd.useItem(handle)`** — USE a HELD item by handle (inventory USE).
- **Movement** = a synthetic **`keydown` on `window`** (the avatar move handler listens there).
- **`window.__U6.message`** / the `MessageLog` resource — read the result text (§6).
- **`window.__U6.checkDungeonEntry()`** — run the walk-onto-hole check at the avatar's current
  cell (for entering without stepping). `window.__U6.probe.getLastCell()` — the cursor cell.
- A **modal open** (inventory / dialog / book) makes the avatar-move handler ignore keys
  (`isBlocked`). Press **Esc** (dispatch a keydown) to close it before stepping.

## 2. Reload / restart the game
The avatar reboots in front of LB's throne; the user's dropped data persists (IndexedDB).
```js
(async () => { window.location.href = '/'; return 'restarting'; })()
```
Then poll readiness in a follow-up eval: `(() => ({ booted: !!(window.__U6 && window.__U6.world) }))()`.

## 3. Move one step (8-dir) — and enter a dungeon / cave
Dispatch a real `keydown` on `window`. **Cardinals use `key`; diagonals use `code` (numpad).**
Direction ids: `0 N · 1 NE · 2 E · 3 SE · 4 S · 5 SW · 6 W · 7 NW`.

| Dir | key / code |
|---|---|
| N / E / S / W | `key: 'ArrowUp' / 'ArrowRight' / 'ArrowDown' / 'ArrowLeft'` |
| NE / SE / SW / NW | `code: 'Numpad9' / 'Numpad3' / 'Numpad1' / 'Numpad7'` |

```js
(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '__KEY__', code: '__CODE__', bubbles: true })); return 'stepped'; })()
```
(Set the one you need — `{key:'ArrowUp'}` for N, or `{code:'Numpad9'}` for NE.) After a successful
step the game **auto-runs `checkGateEntry || checkDungeonEntry`**, so:
- stepping onto a **moongate** travels; stepping onto a **dungeon/cave hole** (`OBJ_146`/`OBJ_134`)
  **descends** — no extra call. (To enter while already standing on the hole: `window.__U6.checkDungeonEntry()`.)
- Read the landing in a follow-up eval (`__U6.stores.pos` at `__U6.avatarRef`), and/or `preview_screenshot`.

## 4. Change a dungeon level / leave a dungeon (ladders)
Surface holes are walk-onto (§3); **in-dungeon ladders (`OBJ_131`) are USE'd.** Stand adjacent to
the ladder and USE it — an **up-ladder (frame 1) ascends**, a down-ladder descends; from level 5 it
ascends. (Find the ladder's cell with `/locate obj 305` — `OBJ_131` = 0x131 = 305.)
```js
(() => { window.__U6.cmd.dispatch({ verb: 'use', target: { x: __X__, y: __Y__ } }); return 'used ladder'; })()
```
Keep using up-ladders to climb back to the surface.

## 5. The verb set — LOOK / USE / GET / MOVE / DROP
All via `__U6.cmd.dispatch`. **Reach matters** (the avatar must be close enough; `/teleport_to` or
step adjacent first): **LOOK = anything in view · USE / GET / MOVE = adjacent (1) · DROP = reach 7.**
```js
// LOOK at a cell (works anywhere in view):
(() => { window.__U6.cmd.dispatch({ verb: 'look', target: { x: __X__, y: __Y__ } }); return 'looked'; })()
// USE the object at a cell (door / lever / ladder / switch / sign…) — must be adjacent:
(() => { window.__U6.cmd.dispatch({ verb: 'use', target: { x: __X__, y: __Y__ } }); return 'used'; })()
// GET the object at a cell — adjacent:
(() => { window.__U6.cmd.dispatch({ verb: 'get', target: { x: __X__, y: __Y__ } }); return 'got'; })()
```
- **MOVE (push)** is two-stage: `dispatch({verb:'move', target})` picks the object, then it awaits a
  **push direction** — send a direction `keydown` on `window` (§3 keys) to slide it one tile.
- **DROP** needs a carried `item` handle (normally chosen in the inventory window):
  `dispatch({ verb:'drop', target:{x,y}, item: <handle> })`. Inventory-side actions (open the bag,
  equip `E`, give `G`) are driven through `__U6.openInventoryWindow(holder, onVerb)`.
- Read every verb's outcome from the message log (§6).

## 6. Read the result (the message log)
Verb/step outcomes ("You enter.", a LOOK descriptor, "Out of range!", …) land in the `MessageLog`:
```js
(async () => { const { MessageLog } = await import('/resources/message_log.js');
  return window.__U6.world.getResource(MessageLog).lines.slice(-6).map(l => l.text); })()
```
Use `preview_screenshot` for the visual.

## 7. Talk with an NPC (the conversation)
The genuine TALK path → the I-13 dialog window. Five steps:

**(a) Get within reach 7 of the NPC** (`/teleport_to` next to it, or step). Find the NPC's live cell —
`/locate <name>`, or inline: scan `actorIndex` for the slot and read `__U6.stores.pos`.

**(b) Open the conversation** at the NPC's cell:
```js
(() => { window.__U6.cmd.dispatch({ verb: 'talk', target: { x: __NPCX__, y: __NPCY__ } }); return 'talk dispatched'; })()
```
Refusals come back on the message log: asleep → "…is fast asleep.", EVIL/CHAOTIC → "No response.",
self → "Talking to yourself?", nothing there → "There is no one to talk to."

**(c) Read the dialog** — the window is `.ui-modal.dialog-window`; the transcript is `.dialog-text`:
```js
(() => { const t = document.querySelector('.dialog-text'); const f = document.querySelector('.dialog-field');
  return { open: !!t, transcript: t ? t.innerText : null,
    awaiting: !f ? 'none' : (f.disabled ? 'key/pause (read .dialog-cue)' : 'text keyword'),
    cue: (document.querySelector('.dialog-cue')||{}).innerText || '' }; })()
```

**(d) Say a keyword.** When a **text** input is awaited (the `.dialog-field` is enabled), set its
value and press Enter (empty Enter = "bye"). Openers are **`name`** then **`job`**; after that, the
replies highlight the askable `@keywords` (and `/decode_npc <name>` lists them all up front).
```js
(() => { const f = document.querySelector('.dialog-field');
  if (!f || f.disabled) return 'no text input awaited (see .dialog-cue)';
  f.value = '__KEYWORD__'; f.focus();
  f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 'said: __KEYWORD__'; })()
```
Then re-read `.dialog-text` (step c) for the reply. A **Y/N / digit / choice** prompt (buy, join, a
quiz) has **no field** — the `.dialog-cue` says which keys; answer by dispatching that `keydown` on
**`document`** (the UIStack's document-level listener routes it to the dialog's `onKey`), e.g.
`document.dispatchEvent(new KeyboardEvent('keydown',{key:'y',bubbles:true}))`, or a digit. A
**{pause}** ("press a key to continue") advances on any such `document` key OR a click on `.dialog-text`.

**(e) End** — say `bye` (or empty Enter), or dispatch **`{ key: 'Escape' }` on `document`** (NOT
window — the UIStack listens on `document`). Dev force-close any modal: `window.__U6.uiStack.clear()`.

## Notes / gotchas
- `cmd.dispatch` enforces reach + the `canTalk` gate; **LOOK is the only "anywhere in view" verb** —
  USE/GET/MOVE need adjacency, so position the avatar first.
- **Input targets differ — get this right:** movement keydowns go on **`window`** (the avatar move
  handler); the dialog text keyword goes on the **`.dialog-field`** element (Enter); **all other modal
  keys — Y/N/digit answers, {pause} advance, and Esc — go on `document`** (the UIStack's document-level
  listener routes them to the modal's `onKey` and Esc-pops). A keydown on `window` will NOT reach the
  `document` listener.
- Close any modal before stepping (an open modal blocks the move handler): Esc on `document`, or
  `__U6.uiStack.clear()`.
- This **drives the live sim like a player** (mutates state) — a dev/exploration action, nothing
  committed; no game data is touched. To restart clean, §2.
