// systems/command_dispatch.js
//
// I-10b — the object-action dispatch core + the verb-first front-end.
//
// `dispatch({verb, target})` is the shared interaction contract (the ECS analog of
// source's global Selection {x,y,obj}, but local): resolve -> validate (adjacency)
// -> [face / move-point cost: deferred] -> verb handler. The dispatcher never
// learns which front-end called it, so the deferred target-first route (click a
// cell -> verb menu) can be added later with no core change.
//
// We lift the STRUCTURE of source's shared targeting block (verb-agnostic
// targeting + a verb->handler split, seg_0A33.c:1231-1278) but NOT its substrate
// (the CMD_* opcode ints, the blocking double CON_getch, the global Selection /
// MouseMode / D_04C2, the giant switch) — that's 1990 input-loop residue per the
// modern-UX anchor (CLAUDE.md). The mechanic is (verb, actor, target) -> validate
// -> effect.
//
// I-10b ships the dispatcher proven against USE with a trivial echo handler; the
// real USE effects (door, crank, …) and the other verbs land in I-10c+.

import { Commands } from '../resources/commands.js';
import { Position, ObjType, ContainedIn, Actor, PartyMember, AIMode, Alignment } from '../components/components.js';
import { displayName } from '../view/inspector.js';
import { makeConversationHost } from './conversation/conversation_system.js';
import { MapLevel } from '../resources/map_level.js';
import { moveToInventory, dropToMap, moveMapObject, inventoryOf, setEquipped, readyItem } from '../world_loader.js';
import { equipSlotForTile, buildEquipment, resolveReadySlot } from './equip_slots.js';
import { canStandAt } from './passability.js';
import { DIR_DX, DIR_DY, dirFromKeyEvent } from './avatar_move_system.js';
import { AI_SLEEP } from './ai_modes.js';

const CLOSE_ENOUGH = 1;                 // Chebyshev reach for adjacency verbs (USE etc.)
const WORLD = 1024;                     // tile-torus width (matches the render/probe wrap)
const ALIGN_EVIL = 0x20, ALIGN_CHAOTIC = 0x60;   // NPCStatus alignment bits (u6.h:116/118)

// Verb-first key bindings. Extended as verbs land (U=use, L=look, G=get, M=move, …).
const VERB_KEYS = { u: 'use', l: 'look', g: 'get', m: 'move', t: 'talk' };
// Verbs that target anything in view rather than an adjacent cell. LOOK reads the
// pointer cell with no adjacency gate (C_27A1_0C67); USE/GET/… stay adjacency-gated.
const VIEWPORT_VERBS = new Set(['look']);
// Per-verb Chebyshev reach (default CLOSE_ENOUGH=1). DROP throws to a cell up to
// SelectRange=7 (seg_0A33.c:1095). LOOK is in VIEWPORT_VERBS (no reach check).
const VERB_REACH = { drop: 7, talk: 7 };   // talk = SelectRange 7 (seg_0A33.c:1068), the DROP/ATTACK reach

// Indefinite article for a LOOK descriptor — approximates C_27A1_061E's a/an/the (its
// exact per-tile article data is deferred): proper nouns (leading capital, e.g. named
// NPCs) take no article, vowel-leading names take "an", else "a". The stack count-prefix
// (C_27A1_0841, gated on QuanType) is deferred too — without the QuanType table we can't
// tell stackables from non-stackables, and prefixing raw quantity mislabels them
// ("10 crate"); most LOOK targets are singletons.
function withArticle(name) {
  if (/^[A-Z]/.test(name)) return name;
  return (/^[aeiou]/i.test(name) ? 'an ' : 'a ') + name;
}

// MOVE push-legality (C_27A1_1DAB, seg_27a1.c:924) — can the object at (ox,oy) slide one
// tile in `dir`? Returns true = clear. The destination must be passable (canStandAt, the
// clone's C_1E0F_000F proxy — the same predicate DROP placement uses); for a DIAGONAL
// push, at least one of the two flanking cardinals (dir±1) must ALSO be passable, so an
// object can't be squeezed through a wall corner. `actorId` excludes the object itself
// from the per-cell scan. Deferred vs source: the IsTileSu "table-surface accept"
// (C_27A1_1330) is treated as no surface — you can't push an object onto a tabletop yet.
function canPushTo(world, handle, ox, oy, dir) {
  const dx = (ox + DIR_DX[dir]) & 0x3ff, dy = (oy + DIR_DY[dir]) & 0x3ff;
  if (!canStandAt(world, dx, dy, { actorId: handle })) return false;   // destination blocked
  if (!(dir & 1)) return true;                                         // cardinal: open destination is enough
  const aDir = (dir + 7) & 7, bDir = (dir + 1) & 7;                    // diagonal: the two flanking cardinals
  const ax = (ox + DIR_DX[aDir]) & 0x3ff, ay = (oy + DIR_DY[aDir]) & 0x3ff;
  if (canStandAt(world, ax, ay, { actorId: handle })) return true;
  const bx = (ox + DIR_DX[bDir]) & 0x3ff, by = (oy + DIR_DY[bDir]) & 0x3ff;
  return canStandAt(world, bx, by, { actorId: handle });
}

export function installCommandDispatch(world, { pickAtCell, probe, canvas, cellEl, avatarRef, reg, objlist, message, uiStack, portraits, scripts }) {
  const commands = world.getResource(Commands);
  const posStore = world.store(Position);
  const objStore = world.store(ObjType);
  const mapLevel = world.getResource(MapLevel);
  const aiStore = world.store(AIMode);          // I-11c: asleep gate (AIMode.AI_SLEEP)
  const alignStore = world.store(Alignment);    // I-11c: evil/chaotic gate (Alignment, carried from NPCStatus)

  // --- targeting cue (decision #3): a verb label pinned to the #probe-cell
  //     highlight + a recolor, instead of source's textual "Use-" prompt echo. ---
  const label = document.createElement('span');
  label.className = 'probe-verb-label';
  cellEl.appendChild(label);

  let pendingVerb = null;
  let pendingDropItem = null;            // the carried item awaiting a DROP location
  let pendingMoveObj = null;             // the ground object awaiting a MOVE push direction (stage 2)
  let awaitingDir = false;               // MOVE stage 2: the next key is a push direction, not a cell
  // The #probe-cell targeting cue (armed recolor + a verb label): the cell/direction verbs
  // (arm/disarm) recolor the probe rectangle + show a verb label while you point at a cell.
  function showCue(text) {
    cellEl.classList.add('armed');
    label.textContent = text;
    label.style.display = 'block';
  }
  function hideCue() {
    cellEl.classList.remove('armed');
    label.style.display = 'none';
  }
  function arm(verb) {
    pendingVerb = verb;
    showCue(verb[0].toUpperCase() + verb.slice(1));   // "Use" / "Drop" / "Move"
  }
  function disarm() {
    pendingVerb = null;
    pendingDropItem = null;
    pendingMoveObj = null;
    awaitingDir = false;
    hideCue();
  }
  // Confirm the armed cell (Enter or left-click): run the verb at the highlighted cell.
  // MOVE may transition to stage 2 (awaitingDir) rather than completing here, so only
  // disarm when it didn't — keeping the object pending for the push-direction key.
  function confirm(cell) {
    if (!cell) { message('What?', 'miss'); disarm(); return; }
    dispatch({ verb: pendingVerb, target: { x: cell.x, y: cell.y }, item: pendingDropItem });
    if (!awaitingDir) disarm();
  }
  // DROP's two-stage target: the inventory picker (main.js) calls this with the chosen
  // carried item, which arms the map cursor for the location pick. Mirrors source's `D`
  // → switch panel to inventory + SelectMode/SelectRange (seg_0A33.c:1088), then the
  // handler's "Location:" prompt (C_27A1_14DA).
  function armDrop(itemHandle) {
    pendingDropItem = itemHandle;
    arm('drop');
  }

  // --- I-18e give: the inventory window's `G` opens an in-stack recipient-picker (the party minus
  //     the giver — view/party_status.js openRecipientPicker); selecting a member calls giveItem
  //     directly. Source's give = remove from the giver + InsertObj INVEN to the recipient
  //     (C_27A1_1E8B else-branch, :1101-1118); party members need no adjacency. Refusals mirror
  //     source: self → "yourself.", non-party → "Only within the party!". The picker offers only
  //     valid recipients, so those are belt-and-suspenders — but the stale-item check still matters
  //     (the item can move between opening the picker and selecting). Deferred (faithful, as
  //     GET/DROP): STREN*20 carry-weight, unequip-on-give, put-into-a-container. (I-18e replaced the
  //     old armGive/giveTo bare-map recipient dance — progress.md §"I-18 scope".) ---
  function giveItem(item, giver, recipient) {
    if (recipient == null || world.resolve(recipient) === -1) { message('nobody.', 'miss'); return; }
    if (recipient === giver) { message('yourself.', 'miss'); return; }                       // give to self = no-op (:1140)
    if (!(world.has(recipient, Actor) && world.has(recipient, PartyMember))) {
      message('Only within the party!', 'miss'); return;                                     // C_27A1_1E8B:1118
    }
    if (item == null || world.resolve(item) === -1) { message('What?', 'miss'); return; }    // stale item
    const name = displayName(world, item, { reg, objlist });
    const who = displayName(world, recipient, { reg, objlist });
    moveToInventory(world, item, recipient);
    message(`You give ${withArticle(name)} to ${who}.`);
  }

  // --- I-18j equip toggle: the inventory window's `E` readies (worn) or unreadies (carried) the
  //     highlighted item. Source's "Ready"/"Unready" (C_155D_144B / C_155D_1738) with the same gates:
  //     not-equippable, too-heavy (equip weight + the item > STR×10, :546), and a FULL target slot
  //     REFUSES ("No place to put!", :569 — source does NOT swap). The 2-hand / ring / hand spill is
  //     resolveReadySlot. **Ready RE-PARENTS the item to the member** (`readyItem` = source's
  //     `InsertObj(item, di=outermost-holder, EQUIP)`, :572-581), so readying an item nested in a bag
  //     pulls it out onto the member — hence `E` works on a bagged equippable too (the item is read
  //     from the stores, not the member's direct inventory). General move-in/out for non-equip items
  //     is I-18k. Cursed-item lock (OBJ_04C) + the ring/cloak magic FX are deferred. ---
  function equipToggle(itemHandle, holder, str) {
    const i = itemHandle != null ? world.resolve(itemHandle) : -1;
    if (i === -1 || !world.has(itemHandle, ContainedIn)) { message('What?', 'miss'); return; }
    const objs = world.store(ObjType), ci = world.store(ContainedIn);
    const name = displayName(world, itemHandle, { reg, objlist });
    if (ci.equipped[i]) {                                                                     // Unready (C_155D_1738)
      setEquipped(world, itemHandle, false);                                                  // worn -> carried; the holder (member) is unchanged
      message(`You remove ${withArticle(name)}.`);
      return;
    }
    const slot = equipSlotForTile(reg.tileForObject(objs.objNumber[i], objs.frame[i]));       // Ready (C_155D_144B)
    if (slot === -1) { message(`You can't ready ${withArticle(name)}.`, 'miss'); return; }    // :544 Can't be readied!
    const equipped = inventoryOf(world, holder).filter((it) => it.equipped);                  // the member's current worn set
    const wEquip = equipped.reduce((s, it) => s + reg.weightOf(it.objNumber), 0);
    if (reg.weightOf(objs.objNumber[i]) + wEquip > (str | 0) * 10) { message('Too heavy!', 'miss'); return; }   // :546
    const eq = buildEquipment(equipped, reg);
    if (eq[resolveReadySlot(slot, eq)]) { message('No place to put it!', 'miss'); return; }   // :569 refuse (no swap)
    readyItem(world, itemHandle, holder);                                                     // :581 re-parent to the member + EQUIP (pulls a bagged item out)
    message(`You ready ${withArticle(name)}.`);
  }

  function avatarPos() {
    const i = avatarRef.handle !== undefined ? world.resolve(avatarRef.handle) : -1;
    return i === -1 ? null : { x: posStore.x[i], y: posStore.y[i] };
  }
  // wrap-aware Chebyshev on the tile torus.
  function withinReach(target, reach = CLOSE_ENOUGH) {
    const a = avatarPos();
    if (!a) return false;
    const dx = Math.min((a.x - target.x + WORLD) % WORLD, (target.x - a.x + WORLD) % WORLD);
    const dy = Math.min((a.y - target.y + WORLD) % WORLD, (target.y - a.y + WORLD) % WORLD);
    return Math.max(dx, dy) <= reach;
  }

  // --- the dispatch pipeline ---
  function dispatch({ verb, target, item }) {
    const handler = commands.verbHandlers.get(verb);
    if (!handler) { message('What?', 'miss'); return; }            // unknown verb
    // Range is per-verb: LOOK sees anything in view, DROP throws to reach 7, rest adjacency.
    if (!VIEWPORT_VERBS.has(verb) && !withinReach(target, VERB_REACH[verb] ?? CLOSE_ENOUGH)) {
      message('Out of range!', 'miss'); return;
    }
    // face-the-target + move-point cost are deferred to the real handlers;
    // time already advances on the turn heartbeat, so the echo needs neither.
    handler({ world, target, message, item });
  }

  // MOVE stage 2: the picked object slides one tile in `dir` (the arrow/numpad key after
  // the object pick) — source's AdvanceDir branch (C_27A1_1E8B:1009-1041). canPushTo is
  // the corner-clearance gate; moveMapObject is source's MoveObj. One push attempt per M:
  // a blocked direction prints the refusal and the caller disarms (source returns at
  // :1016), so the player re-presses M to retry. SubMov(5) is deferred (move-point economy
  // is still project-wide deferred, as for GET/DROP).
  function resolveMove(handle, dir) {
    if (handle == null || world.resolve(handle) === -1) { message('What?', 'miss'); return; }   // stale pick
    const oi = world.resolve(handle);
    const ox = posStore.x[oi], oy = posStore.y[oi];
    const name = displayName(world, handle, { reg, objlist });
    if (!canPushTo(world, handle, ox, oy, dir)) { message("You can't move it there."); return; }
    moveMapObject(world, handle, (ox + DIR_DX[dir]) & 0x3ff, (oy + DIR_DY[dir]) & 0x3ff);
    message(`You move ${withArticle(name)}.`);
  }

  // --- USE verb-handler: the shared wrap around the object-type table ---
  // Source's C_27A1_6179 writes everything around the switch once (re-pick,
  // usability gate, cost); the per-type handlers do only the effect. I-10b ships
  // the wrap + a trivial echo for unported types — which is EVERY type until I-10c,
  // so this both proves the plumbing and is the eventual "unregistered -> refusal"
  // path (it tightens to "Not possible!" once real handlers + a usability flag
  // exist to tell usable-but-unported from never-usable).
  commands.register('use', ({ world, target, message }) => {
    const pick = pickAtCell(target.x, target.y, { forUse: true });  // C_27A1_0919 re-pick (objects only)
    if (pick === null) { message('Nothing happens.'); return; }
    const objNum = objStore.objNumber[world.resolve(pick)];
    const fn = commands.useHandlers.get(objNum);
    if (fn) { fn({ world, target: { ...target, entity: pick }, message }); return; }
    const name = displayName(world, pick, { reg, objlist });
    message(`Nothing happens. (${name})`);
    console.warn(`USE: no handler for obj #${objNum} (${name})`);
  });

  // --- LOOK verb-handler (C_27A1_0C67): a source-faithful "Thou dost see …" line in
  //     the message channel — a pure scroll verb. Source's LOOK NEVER opens a panel or
  //     lists container contents: its only "structured" branch is book/sign READING
  //     (C_27A1_06D7 CanRead → C_27A1_078F reads BOOK.DAT), not contents; seeing inside
  //     a container is a USE/GET interaction (D_E709 open-container view). So LOOK is
  //     line-only here, and the separate `I` Inspect hotkey (main.js) owns the detail
  //     modal. Range is viewport (handled in dispatch). Source's weight / damage /
  //     book-sign text / spellbook / clock / portrait / darkness extras need subsystems
  //     the clone lacks → deferred (incl. the QuanType-gated count-prefix); withArticle
  //     approximates only the a/an/the article.
  commands.register('look', ({ world, target, message }) => {
    const pick = pickAtCell(target.x, target.y);                   // 3-tier pick incl. NPCs (NOT the USE re-pick)
    if (pick === null) {                                           // empty / invisible → name the terrain (C_27A1_0C67:496-510)
      const tile = mapLevel.tileAt(target.x, target.y);
      const terr = reg.tiles?.getTileLook?.(tile, 1);
      message(`Thou dost see ${terr && terr !== 'Unknown' ? terr : 'nothing'}.`);
      if (withinReach(target)) message('Searching here, you find nothing.');   // adjacent search (no hidden items yet)
      return;
    }
    const name = displayName(world, pick, { reg, objlist });
    message(`Thou dost see ${withArticle(name)}.`);
  });

  // --- GET verb-handler (C_27A1_18F5): pick up an adjacent ground object into the
  //     active party member's inventory. Adjacency is the dispatch gate (CLOSE_ENOUGH 1).
  //     The re-pick (forUse) skips NPCs / decorative tiles (C_27A1_0919). The
  //     TypeWeight==0 "fixed object" gate IS ported (scenery/furniture refuse) — its
  //     data rides in the tileflag file (reg.weightOf). Deferred: the carry-capacity
  //     (STREN*20) gate, terrain-damage-on-grab, theft/karma, lit-torch-to-hand,
  //     stack-merge (GiveObj), per-type fixups.
  commands.register('get', ({ world, target, message }) => {
    const pick = pickAtCell(target.x, target.y, { forUse: true });   // objects only (skip NPC/ignore)
    if (pick === null || !world.has(pick, Position)) { message('Nothing to get.'); return; }   // not on the ground
    const objNum = objStore.objNumber[world.resolve(pick)];
    const w = reg.weightOf(objNum);
    if (w === 0 || w === 255 || objNum === 0x19B) {                  // fixed / immovable (C_27A1_18F5:857-861)
      message("You can't get that.");
      return;
    }
    const holder = avatarRef.handle;
    if (holder === undefined) return;
    const name = displayName(world, pick, { reg, objlist });
    moveToInventory(world, pick, holder);
    message(`You get ${withArticle(name)}.`);
  });

  // --- DROP verb-handler (C_27A1_14DA): place the picked inventory item at a target
  //     cell (reach 7). `item` is the carried object chosen via the inventory picker
  //     (armDrop); `target` is the armed-cursor cell. Validates placement legality
  //     (canStandAt — the clone's C_1E0F_000F analog). Deferred: the missile-arc throw
  //     animation, break-if-fragile-and-far, the quantity prompt, drop-into-container.
  commands.register('drop', ({ world, target, message, item }) => {
    if (item == null || world.resolve(item) === -1) { message('What?', 'miss'); return; }   // stale pick
    if (!canStandAt(world, target.x, target.y)) { message("You can't drop it there."); return; }
    const ai = world.resolve(avatarRef.handle);
    const z = ai === -1 ? 0 : posStore.z[ai];
    const name = displayName(world, item, { reg, objlist });
    dropToMap(world, item, target.x, target.y, z);
    message(`You drop ${withArticle(name)}.`);
  });

  // --- MOVE verb-handler, Mode 1 — push a ground object (C_27A1_1E8B, seg_27a1.c:953,
  //     LOCXYZ branch). Stage 1 (here): pick the adjacent object (forUse re-pick, objects
  //     only) + apply the fixed-object gate, then ARM a push direction (stage 2). The
  //     arrow/numpad key that follows runs resolveMove (above) — source's "To " + AdvanceDir
  //     getch (:983). Adjacency is the dispatch's CLOSE_ENOUGH-1 gate (MOVE isn't a viewport
  //     verb). Mode 2 (give/transfer a carried item, the `else` branch :1044) is I-10j.
  //     Deferred (faithful, like GET/DROP): SubMov(5) move-point cost, push-into-container
  //     (InsertObj CONTAINED), directional-object facing frames (cannonball OBJ_0DD), and
  //     source's target-then-refuse-an-NPC message (the forUse re-pick skips NPCs at the
  //     pick instead — same outcome, friendlier).
  commands.register('move', ({ world, target, message }) => {
    const pick = pickAtCell(target.x, target.y, { forUse: true });   // objects only (skip NPC/ignore)
    if (pick === null || !world.has(pick, Position)) { message('Nothing to move.'); return; }
    const objNum = objStore.objNumber[world.resolve(pick)];
    const w = reg.weightOf(objNum);
    if (w === 0 || w === 255 || objNum === 0x19B) { message("You can't move it."); return; }   // fixed (C_27A1_1E8B:995)
    // Valid pushable object → stage 2: keep it pending, await a push direction. The cursor
    // stays armed on the object's cell; the label/prompt cue the direction input.
    pendingMoveObj = pick;
    awaitingDir = true;
    label.textContent = 'Move…';
    message('Push it which way? (arrow / numpad keys)');
  });

  // --- openConversation — the seam I-12 (dialog window) + I-13 (conversation VM) reopen.
  //     I-12 swaps the I-11 message-echo placeholder for the dialog window (openDialog):
  //     the second UI surface on the I-7 substrate. Opens for ALL talkable targets the
  //     I-11 filter accepts (NPC / shrine OBJ_189 / statue OBJ_18D-18F) — the window is
  //     automatic through this one seam. I-13 wires the window's body to the conversation
  //     VM; the talk handler never changes again. ---
  // I-13: the conversation host owns the VM + dialog driver. openConversation just
  // hands it the (already-gated) target; "Funny, no response." (no script) is the
  // host's call. The talk handler below never changes again.
  const conversationHost = makeConversationHost(world, { reg, objlist, portraits, uiStack, message, scripts, avatarRef });
  function openConversation(target) {
    if (world.resolve(target) === -1) return;
    conversationHost.start(target);
  }

  // --- canTalk(npc) — TalkDriver's precondition gate (seg_1703.c:1022-1079), the arms with a
  //     LIVE clone signal. Returns a refusal string, or null to proceed. Two substitutions
  //     (docs/research_save_load.md §"NPCStatus decomposition"): source reads the NPCStatus byte
  //     (asleep / dead / paralyzed / alignment) which the clone parses-then-drops, so we use
  //     AIMode.AI_SLEEP for asleep (set in lock-step with SetAsleep at __AtDestination,
  //     seg_1E0F.c:1014-1033) and the Alignment component (carried from NPCStatus & 0x60, I-11a).
  //     The other arms (dead / paralyzed / poisoned / AI_VIGILANTE/FEAR/RETREAT/ARREST / seance /
  //     IsArmageddon / solo-mode / party-off-screen) have no live signal yet — deferred with
  //     their subsystem, tracked per-bit in that doc. ---
  function canTalk(npc) {
    const i = world.resolve(npc);
    if (i === -1) return null;
    if (world.has(npc, AIMode) && aiStore.mode[i] === AI_SLEEP)                      // IsAsleep (seg_1703.c:1045)
      return `${displayName(world, npc, { reg, objlist })} is fast asleep.`;
    if (world.has(npc, Alignment)) {
      const a = alignStore.value[i];
      if (a === ALIGN_EVIL || a === ALIGN_CHAOTIC) return 'No response.';            // EVIL/CHAOTIC (seg_1703.c:1050)
    }
    return null;
  }

  // --- TALK verb-handler (TALK_talkTo seg_16E1.c:60 → TalkDriver seg_1703.c:1016). The
  //     ONLY verb whose handler isn't in seg_27a1.c. Reach 7 (VERB_REACH — the DROP/ATTACK
  //     SelectRange, seg_0A33.c:1068; the reach gate lives in dispatch), single-stage (one
  //     pick → fire). pickAtCell's 3-tier pick (NPCs first) is the target; the talkable
  //     filter accepts an NPC (Actor) OR a shrine OBJ_189 / statue OBJ_18D-18F (else
  //     "nothing!", TALK_talkTo:86). The active member itself → "Talking to yourself?"
  //     (D_E796[1]==[0], seg_1703.c:1061). The canTalk gate (I-11c) runs for NPCs; on a
  //     pass, openConversation is the I-12/I-13 seam. Facing (MkDirection→C_1E0F_0664) is
  //     deferred, as in the other handlers.
  commands.register('talk', ({ world, target, message }) => {
    const pick = pickAtCell(target.x, target.y);                  // 3-tier pick, NPCs first
    if (pick === null) { message('There is no one to talk to.', 'miss'); return; }
    const i = world.resolve(pick);
    const objNum = objStore.objNumber[i];
    const isActor = world.has(pick, Actor);
    const isShrineStatue = objNum === 0x189 || (objNum >= 0x18D && objNum <= 0x18F);
    if (!isActor && !isShrineStatue) { message('There is no one to talk to.', 'miss'); return; }   // "nothing!"
    if (isActor && i === world.resolve(avatarRef.handle)) { message('Talking to yourself?', 'miss'); return; }
    if (isActor) { const refusal = canTalk(pick); if (refusal) { message(refusal, 'miss'); return; } }   // I-11c gate
    openConversation(pick);
  });

  // --- verb-first front-end: arm a verb key, confirm the highlighted cell with
  //     Enter OR a left-click, Esc cancels. Both source input routes (mouse click
  //     seg_0C9C.c:820 / keyboard Enter in SelectMode seg_0C9C.c:1208) produce CMD_8E
  //     with Selection filled; both are wired here. Esc / a no-cell confirm -> "What?"
  //     mirrors source printing WhatMsg when the second getch isn't CMD_8E. ---
  document.addEventListener('keydown', (e) => {
    if (!uiStack.isEmpty()) return;          // a modal owns the keyboard
    if (probe.isDragging()) return;
    // MOVE stage 2 (C_27A1_1E8B): an object is picked, awaiting a push direction. Capture
    // arrow/numpad HERE and stopPropagation so the avatar's window-level keydown (which
    // fires AFTER this document-level one in the bubble) doesn't also walk on the same key.
    if (awaitingDir) {
      const dir = dirFromKeyEvent(e);
      if (dir !== -1) {
        e.preventDefault(); e.stopPropagation();
        resolveMove(pendingMoveObj, dir);
        disarm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        message('Never mind.', 'miss');
        disarm();
      }
      return;                                // swallow the aim; other keys are inert here
    }
    const k = e.key.toLowerCase();
    if (pendingVerb) {
      if (e.key === 'Enter') { confirm(probe.getLastCell()); e.preventDefault(); }
      else if (e.key === 'Escape') { message('What?', 'miss'); disarm(); e.preventDefault(); }
      else if (VERB_KEYS[k]) { arm(VERB_KEYS[k]); e.preventDefault(); }   // re-arm to a different verb
      return;
    }
    if (VERB_KEYS[k]) { arm(VERB_KEYS[k]); e.preventDefault(); }
  });

  // Left-click confirm: while a verb is armed, a click on the map executes it at the
  // highlighted cell — the same target Enter uses (source's native targeting route).
  // dev_probe suppresses drag-to-pan while armed (isVerbArmed), so no drag/click
  // disambiguation is needed.
  canvas.addEventListener('click', () => {
    if (!pendingVerb || !uiStack.isEmpty() || awaitingDir) return;   // stage 2 takes a direction key, not a click
    confirm(probe.getLastCell());
  });

  return {
    dispatch, armDrop, giveItem, equipToggle,
    isPending: () => pendingVerb !== null,
  };
}
