// systems/conversation/conversation_system.js
//
// I-13d — the conversation HOST: the thin translation layer between the standalone
// VM (conversation_vm.js) and the world / dialog UI. It seeds the VM's variables
// (the relocated seg_16E1.c TALK_initTalk table), drives the generator, and maps
// each yielded effect to either the dialog window (output/input) or a world
// handler (query / sink / read-and-write). Pre-flight gates ("No response", etc.)
// run in the caller (systems/command_dispatch.js canTalk); by here the talk is
// allowed. Design + effect taxonomy: docs/research_i13_conversation_vm.md.
//
// I-13d wires output + input + the loader; world effects are STUBS that keep
// conversations flowing (queries → 0, sinks → no-op, reads → default). I-13e
// fills the queries, I-13f the sinks + read-writes — no VM edits, per the
// stub-when-deferred design.

import { ConversationVM } from './conversation_vm.js';
import { OP } from './opcodes.js';
import { createDialogUI } from '../../view/dialog_window.js';
import { Actor, Amount, Position, ObjType, AIMode, MoveSpeed } from '../../components/components.js';
import { WorldClock } from '../../resources/world_clock.js';
import { ActorIndex } from '../../resources/actor_index.js';
import { Camera } from '../../resources/camera.js';
import { Viewport } from '../../resources/viewport.js';
import { inventoryOf, addMapObject, moveToInventory, deleteMapObject } from '../../world_loader.js';
import { maxHP } from '../stat_formulas.js';

const OBJ_HORSE = 0x1af;                 // ridable horse object type (seg_1703.c HORSED/GETHORSE)
const POISONED = 0x08;                   // NPCStatus poison bit (u6.h:128)

// --- dev introspection helpers (for the window.__U6.inspectConversation hook) ---
const OPNAME = Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k]));
const idxName = (i) => (i < 10 ? String(i) : String.fromCharCode(i + 0x37));   // VarStr/VarInt index → '0'..'9' / 'A'..'Z'
// Decode `count` tokens of the script from `start` into readable strings (text runs,
// KEY(keywords), opcode names, operand values) — shows what the VM is sitting on / about to do.
function disasmAt(d, start, count) {
  let pc = start; const out = []; let text = '';
  const flush = () => { if (text) { out.push(JSON.stringify(text)); text = ''; } };
  while (pc < d.length && out.length < count) {
    const op = d[pc++];
    if (op < 0x80) { text += String.fromCharCode(op); continue; }
    flush();
    const nm = OPNAME[op] || ('0x' + op.toString(16));
    if (op === OP.KEY) { let kw = ''; while (pc < d.length && d[pc] !== OP.RES) kw += String.fromCharCode(d[pc++]); out.push('KEY(' + kw + ')'); }
    else if (op === OP.BYTE) { out.push('BYTE ' + d[pc]); pc += 1; }
    else if (op === OP.WORD) { out.push('WORD ' + (d[pc] | (d[pc + 1] << 8))); pc += 2; }
    else if (op === OP.ADDRESS || op === OP.GOTO) { out.push(nm + ' @' + ((d[pc] | (d[pc + 1] << 8) | (d[pc + 2] << 16) | (d[pc + 3] << 24)) >>> 0)); pc += 4; }
    else out.push(nm);
  }
  flush();
  return out;
}

const timeOfDay = (h) => (h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening');

export function makeConversationHost(world, deps) {
  const { objlist, scripts } = deps;
  let active = null;                       // the live conversation session (dev hook), or null

  // The conversation ID for a target: an NPC uses its slot (Actor.npcId); a shrine
  // / statue uses its quality (GetQual, seg_1703.c:1033) — generic/quality scripts
  // are mostly deferred, so those usually fall through to "Funny, no response."
  function convId(target, id) {
    if (world.has(target, Actor)) return world.store(Actor).npcId[id];
    return world.has(target, Amount) ? world.store(Amount).quality[id] : 0;
  }

  // Relocated TALK_initTalk (seg_16E1.c:14-37): gather the game-derived seed the
  // VM starts from. The VM overrides $N from the script's own name bytes.
  function seedVars(npcSlot) {
    const clock = world.getResource(WorldClock);
    const avatar = objlist.actors[objlist.party[0]] || {};
    const npc = objlist.actors[npcSlot] || {};
    const g = objlist.globals || {};
    const gender = g.gender ?? 0;
    return {
      '$G': gender ? 'milady' : 'milord',
      '$N': npc.name || '',
      '$P': avatar.name || 'Avatar',
      '$T': timeOfDay(clock ? clock.Time_H : 9),
      '#A': avatar.dexterity | 0, '#D': clock ? clock.Date_D | 0 : 0, '#E': avatar.exp | 0,
      '#G': gender | 0, '#H': clock ? clock.Time_H | 0 : 0, '#I': avatar.intelligence | 0,
      '#K': g.karma | 0, '#L': 0, '#M': clock ? clock.Date_M | 0 : 0, '#O': (objlist.partySize - 1) | 0,
      '#P': avatar.hp | 0, '#S': avatar.strength | 0, '#W': npc.npcMode | 0, '#Y': clock ? clock.Date_Y | 0 : 0,
    };
  }

  // --- world access helpers (slot id -> entity) ---
  const A = (slot) => objlist.actors[slot] || {};
  const handleOf = (slot) => world.getResource(ActorIndex).get(slot);
  // MoveSpeed.dexterity is a hot-path CACHE of the canonical objlist dexterity (move_economy's
  // rate() reads it per tick). A dex-training effect must refresh the cache too, or trained
  // dexterity never reaches the accumulator and the NPC's movement speed never changes (the
  // latent bug this fixes). The objlist stays the source of truth; this just re-syncs the cache.
  function refreshMoveSpeedDex(slot, dex) {
    const h = handleOf(slot);
    if (h === undefined || !world.isRegistered(MoveSpeed)) return;
    const i = world.resolve(h);
    if (i === -1 || !world.has(h, MoveSpeed)) return;
    world.store(MoveSpeed).dexterity[i] = dex;
  }
  function entObjType(slot) {                       // object type of an NPC's entity, or -1
    const h = handleOf(slot); if (h === undefined) return -1;
    const id = world.resolve(h); return id === -1 ? -1 : world.store(ObjType).objNumber[id];
  }
  function inParty(slot) { return objlist.party.slice(0, objlist.partySize).includes(slot); }
  function onScreen(slot) {
    const h = handleOf(slot); if (h === undefined) return false;
    const id = world.resolve(h); if (id === -1 || !world.has(h, Position)) return false;
    const cam = world.getResource(Camera), vp = world.getResource(Viewport);
    if (!cam || !vp) return false;
    const ps = world.store(Position), left = Math.floor(cam.worldX / 16), top = Math.floor(cam.worldY / 16);
    return ps.x[id] >= left && ps.x[id] < left + vp.cols && ps.y[id] >= top && ps.y[id] < top + vp.rows;
  }
  const invOf = (slot) => { const h = handleOf(slot); return h === undefined ? [] : inventoryOf(world, h); };
  function avatarCell() {
    const h = deps.avatarRef && deps.avatarRef.handle;
    if (h === undefined) return null;
    const id = world.resolve(h);
    if (id === -1 || !world.has(h, Position)) return null;
    const ps = world.store(Position);
    return { x: ps.x[id], y: ps.y[id], z: ps.z[id] };
  }
  function setNpcMode(slot, mode) {
    const a = A(slot); if (a) a.npcMode = mode;
    const h = handleOf(slot); if (h === undefined) return;
    const id = world.resolve(h);
    if (id !== -1 && world.has(h, AIMode)) world.store(AIMode).mode[id] = mode;
  }
  // GiveObj (seg_1703.c:816): create an object + place it in the holder's inventory.
  function giveObj(slot, objNumber, quality, quantity) {
    const h = handleOf(slot); if (h === undefined) return;
    const at = avatarCell() || { x: 0, y: 0, z: 0 };
    const item = addMapObject(world, { objNumber, frame: 0, x: at.x, y: at.y, z: at.z, quality, quantity: quantity || 1 });
    moveToInventory(world, item, h);          // unlinks from the map, attaches to the holder
  }
  // TakeObj (seg_1703.c:814): remove matching object(s) from the holder's inventory.
  // (Per-stack quantity decrement deferred — removes whole matching entities.)
  function takeObj(slot, objNumber, quantity) {
    let left = quantity || 1;
    for (const it of invOf(slot)) {
      if (it.objNumber !== objNumber) continue;
      deleteMapObject(world, it.handle);
      if (--left <= 0) break;
    }
  }

  // World-effect dispatch. I-13e implements the QUERY reads against the live world;
  // sinks + read-and-writes are still stubbed → I-13f. (Object queries that need a
  // TypeWeight table / GetAssoc are best-effort or deferred, noted inline.)
  function handleWorld(eff) {
    switch (eff.type) {
      case 'npcName': return A(eff.npc).name || 'someone';
      // --- queries (I-13e) ---
      case 'flag': return ((A(eff.npc).talkFlags || 0) >> eff.bit) & 1;
      case 'wounded': return maxHP(A(eff.npc).level) > (A(eff.npc).hp || 0) ? 1 : 0;
      case 'poisoned': return (A(eff.npc).status & POISONED) ? 1 : 0;
      case 'inParty': return inParty(eff.npc) ? 1 : 0;
      case 'onScreen': return onScreen(eff.npc) ? 1 : 0;
      case 'isHorse': return entObjType(eff.npc) === OBJ_HORSE ? 1 : 0;
      case 'objType': { const t = entObjType(eff.obj); return t >= 0 ? t : 0; }
      case 'canCarry': return Math.max(0, (A(eff.npc).strength || 0) * 200);   // carried-weight term deferred
      case 'owns': return invOf(eff.npc).some((it) => it.objNumber === eff.obj) ? 1 : 0;   // quality match deferred
      case 'hasObj': return invOf(eff.npc).filter((it) => it.objNumber === eff.obj).length;
      case 'whosGot': {
        for (const slot of objlist.party.slice(0, objlist.partySize)) if (invOf(slot).some((it) => it.objNumber === eff.obj)) return slot;
        return 0x8001;                                                         // source's "nobody" sentinel
      }
      case 'partyMember': { const m = objlist.party[eff.index]; return eff.index < objlist.partySize && m !== undefined ? m : 0; }
      case 'owner': return 0;          // GetAssoc — deferred
      case 'weight': return 0;         // TypeWeight table not loaded — deferred

      // --- read-and-writes (I-13f) — attribute trainers mutate + return new value ---
      case 'addExp': { const a = A(eff.npc); a.exp = Math.min(9999, (a.exp || 0) + eff.n); return a.exp; }
      case 'addLvl': { const a = A(eff.npc); a.level = (a.level || 0) + eff.n; return a.level; }
      case 'addStr': { const a = A(eff.npc); a.strength = Math.min(30, (a.strength || 0) + eff.n); return a.strength; }
      case 'addInt': { const a = A(eff.npc); a.intelligence = Math.min(30, (a.intelligence || 0) + eff.n); return a.intelligence; }
      case 'addDex': { const a = A(eff.npc); a.dexterity = Math.min(30, (a.dexterity || 0) + eff.n); refreshMoveSpeedDex(eff.npc, a.dexterity); return a.dexterity; }
      // join/leave need ECS party + follower integration → DEFERRED (stub-when-deferred,
      // research_i13_conversation_vm.md). Membership is NOT mutated; codes keep dialogue sane.
      case 'join': return inParty(eff.npc) ? 3 : 0;     // 3=already in party, 0=success (not actually added)
      case 'leave': return inParty(eff.npc) ? 0 : 2;    // 0=success (not actually removed), 2=not in party
      case 'selectObject': return 0;                    // mouse item-pick — deferred

      // --- sinks (I-13f) ---
      case 'setFlag': { const a = A(eff.npc); a.talkFlags = (a.talkFlags || 0) | (1 << eff.bit); return 0; }
      case 'clrFlag': { const a = A(eff.npc); a.talkFlags = (a.talkFlags || 0) & ~(1 << eff.bit); return 0; }
      case 'addKarma': { objlist.globals.karma = Math.min(99, (objlist.globals.karma || 0) + eff.n); return 0; }
      case 'subKarma': { objlist.globals.karma = Math.max(0, (objlist.globals.karma || 0) - eff.n); return 0; }
      case 'heal': { const a = A(eff.npc); a.hp = maxHP(a.level); return 0; }
      case 'cure': { const a = A(eff.npc); a.status = (a.status || 0) & ~POISONED; return 0; }
      case 'setMode': setNpcMode(eff.npc, eff.mode); return 0;
      case 'give': giveObj(eff.npc, eff.obj, eff.qual, eff.qty); return 0;
      case 'take': takeObj(eff.npc, eff.obj, eff.qty); return 0;
      case 'spawnHorse': { const at = avatarCell(); if (at) addMapObject(world, { objNumber: OBJ_HORSE, frame: 0, x: at.x, y: at.y, z: at.z, quality: 0, quantity: 1 }); return 0; }
      case 'rest': { for (const slot of objlist.party.slice(0, objlist.partySize)) { const a = A(slot); a.hp = maxHP(a.level); } return 0; }   // time-skip deferred
      // resurrect / moveObj / transferObj → deferred (corpse handling / obj-ref resolution).
      default: return 0;
    }
  }

  // Drive the VM generator to completion (or until the window closes), mapping
  // effects to the dialog UI / world. Async because input effects await the user.
  async function drive(vm, ui, session) {
    const gen = vm.run();
    let r = gen.next();
    while (!r.done && !ui.isClosed()) {
      const eff = r.value;
      let answer;
      if (session && (eff.type === 'pause' || eff.type.startsWith('get') || eff.type === 'ask')) session.waitingOn = eff.type;
      switch (eff.type) {
        case 'say': ui.say(eff.text); if (session) { session.log.push(eff.text); if (session.log.length > 100) session.log.shift(); } break;
        case 'pause': await ui.pause(); break;
        case 'ask': answer = await ui.askText("type a keyword — or 'bye'"); break;
        case 'getString': answer = await ui.askText('type your answer'); break;
        case 'getInt': answer = await ui.askText('type a number'); break;
        case 'getDigit': answer = await ui.askKey('digit'); break;
        case 'getChar': answer = await ui.askKey('char'); break;
        case 'getChoice': answer = await ui.askKey('choice', eff.allowed); break;
        case 'portrait': ui.showPortrait(eff.npc); break;
        case 'showInventory': ui.meta('(trade interface — I-13f)'); break;
        case 'delay': break;                 // dramatic pause — no animation hook yet
        case 'unknownOp': break;             // diagnostic only
        default: answer = handleWorld(eff);
      }
      if (session) session.waitingOn = null;
      if (ui.isClosed()) break;              // window closed (Esc) mid-effect → end
      r = gen.next(answer);
    }
    if (!ui.isClosed()) ui.close();          // VM ended → close the dialog
    if (active === session) { active = null; if (typeof window !== 'undefined' && window.__U6) window.__U6.conversation = null; }
  }

  // Open + run a conversation with `target` (gates already passed). Returns true
  // if a script was found and started.
  function start(target) {
    const id = world.resolve(target);
    if (id === -1) return false;
    const npcSlot = convId(target, id);
    const bytes = scripts ? scripts.get(npcSlot) : null;
    if (!bytes || bytes.length < 3) { deps.message?.('Funny, no response.', 'miss'); return false; }
    const vm = new ConversationVM(bytes, { vars: seedVars(npcSlot) });
    const ui = createDialogUI(world, target, deps.uiStack, { reg: deps.reg, objlist, portraits: deps.portraits });
    const session = { vm, target, npcSlot, waitingOn: null, log: [] };   // dev-hook session
    active = session;
    if (typeof window !== 'undefined' && window.__U6) window.__U6.conversation = session;
    drive(vm, ui, session);                   // fire-and-forget; the UI owns its lifetime
    return true;
  }

  // Dev hook (read-only): inspect the ACTIVE conversation VM live, alongside the other
  // window.__U6 helpers. window.__U6.conversation = the live session (or null);
  // window.__U6.inspectConversation() = a readable snapshot — npc, pc, live vars,
  // last input, what it's waiting on, the current question, and a disasm of what's next
  // (e.g. the KEY answer-keywords the VM is about to match).
  function inspectConversation() {
    if (!active) return null;
    const vm = active.vm, vars = {};
    for (let i = 0; i < 36; i++) {
      if (vm.VarStr[i]) vars['$' + idxName(i)] = vm.VarStr[i];
      if (vm.VarInt[i]) vars['#' + idxName(i)] = vm.VarInt[i];
    }
    return {
      npc: { id: vm.npcId, name: vm.npcName },
      pc: vm.pc, done: vm.done, inResponse: vm.inResponse,
      lastInput: vm.lastInput,
      waitingOn: active.waitingOn,
      lastQuestion: [...active.log].reverse().find((t) => t.includes('?')) || null,
      recentSaid: active.log.slice(-6),
      vars,
      upcoming: disasmAt(vm.data, vm.pc, 24),
    };
  }
  if (typeof window !== 'undefined' && window.__U6) {
    window.__U6.conversation = null;
    window.__U6.inspectConversation = inspectConversation;
  }

  return { start, seedVars, handleWorld, inspectConversation };
}
