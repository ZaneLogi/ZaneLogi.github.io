// I-13a unit tests for the conversation VM (systems/conversation/conversation_vm.js).
// Pure: no U6 data, no world. A tiny label-aware assembler builds synthetic scripts;
// the VM generator is driven by a stub host that feeds inputs + answers queries, and
// we assert the emitted effect stream. Proves the standalone-VM design (the effect
// stream is fully testable with no host wiring).

import { ConversationVM, strICompare } from '../systems/conversation/conversation_vm.js';
import { OP } from '../systems/conversation/opcodes.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

// --- mini-assembler: items are numbers (bytes/opcodes), strings (ASCII), or
//     {label}/{u32} for GOTO targets. Two passes resolve label positions. ---
function asm(items) {
  const flat = [];
  for (const it of items) {
    if (typeof it === 'number') flat.push({ kind: 'b', v: it });
    else if (typeof it === 'string') for (const ch of it) flat.push({ kind: 'b', v: ch.charCodeAt(0) });
    else if (it.label !== undefined) flat.push({ kind: 'label', name: it.label });
    else if (it.u32 !== undefined) flat.push({ kind: 'u32', name: it.u32 });
  }
  const pos = {};
  let p = 0;
  for (const f of flat) { if (f.kind === 'label') pos[f.name] = p; else p += (f.kind === 'u32' ? 4 : 1); }
  const out = [];
  for (const f of flat) {
    if (f.kind === 'b') out.push(f.v & 0xff);
    else if (f.kind === 'u32') { const t = pos[f.name]; out.push(t & 0xff, (t >> 8) & 0xff, (t >> 16) & 0xff, (t >> 24) & 0xff); }
  }
  return new Uint8Array(out);
}

const INPUT_EFFECTS = new Set(['ask', 'getString', 'getInt', 'getDigit', 'getChar', 'getChoice']);
const PURE_EFFECTS = new Set(['say', 'pause', 'portrait', 'showInventory', 'delay', 'setFlag', 'clrFlag',
  'give', 'take', 'moveObj', 'transferObj', 'addKarma', 'subKarma', 'setMode', 'resurrect', 'heal',
  'cure', 'spawnHorse', 'rest', 'unknownOp']);

// Drive the VM to completion. inputs[] feed input effects in order; queries(eff)
// answers query / read-write / npcName effects. Returns the full effect list.
function drive(vm, { inputs = [], queries = () => 0 } = {}) {
  const effects = [];
  const gen = vm.run();
  let r = gen.next();
  let ii = 0, guard = 0;
  while (!r.done) {
    if (++guard > 10000) throw new Error('VM did not terminate (effect loop guard)');
    const eff = r.value;
    effects.push(eff);
    let answer;
    if (INPUT_EFFECTS.has(eff.type)) answer = inputs[ii++];
    else if (PURE_EFFECTS.has(eff.type)) answer = undefined;
    else answer = queries(eff);            // query / read-write / npcName
    r = gen.next(answer);
  }
  return effects;
}

const says = (effs) => effs.filter(e => e.type === 'say').map(e => e.text).join('');

// ============================ strICompare (the matcher) ====================
{
  check('strICompare: keyword prefix of input word', strICompare('name', 'name', 4) === true);
  check('strICompare: longer input word still matches keyword prefix', strICompare('name', 'named', 4) === true);
  check('strICompare: any word in input matches', strICompare('job', 'what is thy job', 3) === true);
  check('strICompare: case-insensitive', strICompare('Bye', 'BYE', 3) === true);
  check('strICompare: no match', strICompare('name', 'job', 4) === false);
  check('strICompare: ? wildcard', strICompare('n?me', 'name', 4) === true);
  check('strICompare: too-short input word fails', strICompare('name', 'nam', 4) === false);
}

// ============================ a real-shaped script =========================
// ID 5 "Iolo" DESC "a bard." MAIN "Hail!" ASK { name/who, job, bye(LEAVE), * } each
// response GOTOs back to ASK (except bye → LEAVE). This is the canonical layout.
function bardScript() {
  return asm([
    OP.ID, 5, 'Iolo',
    OP.DESC, 'a bard.',
    OP.MAIN, 'Hail!',
    { label: 'ASK' }, OP.ASKTOP,
    OP.KEY, 'name,who', OP.RES, 'I am $N.', OP.GOTO, { u32: 'ASK' }, OP.ENDRES,
    OP.KEY, 'job', OP.RES, 'I play the lute.', OP.GOTO, { u32: 'ASK' }, OP.ENDRES,
    OP.KEY, 'bye', OP.RES, 'Farewell!', OP.LEAVE, OP.ENDRES,
    OP.KEY, '*', OP.RES, 'I cannot help thee.', OP.GOTO, { u32: 'ASK' }, OP.ENDRES,
  ]);
}

// open flow: name parsed, "You see a bard." + greeting before first ask
{
  const vm = new ConversationVM(bardScript());
  const effs = drive(vm, { inputs: ['bye'] });
  check('open: $N parsed from script', vm.npcName === 'Iolo', `got "${vm.npcName}"`);
  check('open: "You see a bard." emitted', says(effs).includes('You see a bard.'), says(effs));
  check('open: greeting "Hail!" before first ask', says(effs).indexOf('Hail!') >= 0);
  check('open: first effect after greeting is an ask',
    effs.some(e => e.type === 'ask'));
}

// keyword "name" → "I am Iolo." ($N expanded), then loops back to ask; "bye" → Farewell + done
{
  const vm = new ConversationVM(bardScript());
  const effs = drive(vm, { inputs: ['name', 'bye'] });
  check('keyword name → $N-expanded response', says(effs).includes('I am Iolo.'), says(effs));
  check('keyword name does NOT also fire catch-all', !says(effs).includes('I cannot help thee.'));
  check('bye → Farewell! + conversation ends', says(effs).includes('Farewell!') && vm.done);
  const asks = effs.filter(e => e.type === 'ask').length;
  check('two asks consumed (name, then bye)', asks === 2, `asks=${asks}`);
}

// catch-all '*' for unrecognised input
{
  const vm = new ConversationVM(bardScript());
  const effs = drive(vm, { inputs: ['flibberty', 'bye'] });
  check("unrecognised input → '*' catch-all", says(effs).includes('I cannot help thee.'), says(effs));
}

// empty input → "bye"
{
  const vm = new ConversationVM(bardScript());
  const effs = drive(vm, { inputs: [''] });
  check('empty input → bye response, ends', says(effs).includes('Farewell!') && vm.done);
}

// ============================ IF + evaluate (query) ========================
// MAIN "Hail!" ASK KEY "test" RES IF (TST self,3) "flag set." ELSE "flag clear." ENDIF GOTO ASK
function ifScript() {
  return asm([
    OP.ID, 7, 'Sage', OP.DESC, 'a sage.', OP.MAIN, 'Hm.',
    { label: 'ASK' }, OP.ASKTOP,
    OP.KEY, 'test', OP.RES,
      OP.IF, OP.BYTE, OP.NPC, OP.BYTE, 3, OP.TST, OP.END_OF_FACTOR,
        'flag set.',
      OP.ELSE,
        'flag clear.',
      OP.ENDIF,
      OP.GOTO, { u32: 'ASK' }, OP.ENDRES,
    OP.KEY, 'bye', OP.RES, 'Bye.', OP.LEAVE, OP.ENDRES,
  ]);
}
{
  // flag query returns 1 → IF-true branch
  const vmT = new ConversationVM(ifScript());
  const effsT = drive(vmT, { inputs: ['test', 'bye'], queries: (e) => (e.type === 'flag' ? 1 : 0) });
  check('IF true branch when flag query=1', says(effsT).includes('flag set.') && !says(effsT).includes('flag clear.'), says(effsT));

  // flag query returns 0 → ELSE branch
  const vmF = new ConversationVM(ifScript());
  const effsF = drive(vmF, { inputs: ['test', 'bye'], queries: (e) => 0 });
  check('IF else branch when flag query=0', says(effsF).includes('flag clear.') && !says(effsF).includes('flag set.'), says(effsF));

  // the flag query carries the resolved self-npc + bit
  const vmQ = new ConversationVM(ifScript());
  let seen = null;
  drive(vmQ, { inputs: ['test', 'bye'], queries: (e) => { if (e.type === 'flag') seen = e; return 0; } });
  check('flag query resolves NPC self-ref + bit', seen && seen.npc === 7 && seen.bit === 3, JSON.stringify(seen));
}

// ============================ $/# expansion + seed =========================
{
  const vm = new ConversationVM(
    asm([OP.ID, 9, 'Gwenno', OP.DESC, 'x.', OP.MAIN, 'Hello $P, it is $T. Karma #K.', OP.ASKTOP,
         OP.KEY, 'bye', OP.RES, 'Bye.', OP.LEAVE, OP.ENDRES]),
    { vars: { '$P': 'Avatar', '$T': 'morning', '#K': 42 } });
  const effs = drive(vm, { inputs: ['bye'] });
  check('$P/$T/#K expanded from seed', says(effs).includes('Hello Avatar, it is morning. Karma 42.'), says(effs));
}

// ============================ pause (inline '*') ==========================
{
  const vm = new ConversationVM(
    asm([OP.ID, 1, 'P', OP.DESC, 'x.', OP.MAIN, 'Line one.*Line two.', OP.ASKTOP,
         OP.KEY, 'bye', OP.RES, 'Bye.', OP.LEAVE, OP.ENDRES]));
  const effs = drive(vm, { inputs: ['bye'] });
  check('inline * emits a pause effect', effs.some(e => e.type === 'pause'));
  check('text split around the pause', says(effs).includes('Line one.') && says(effs).includes('Line two.'));
}

// ============== indexed string table (C_1703_1494 / _followAddress) ==========
// PRINTSTR/LET ADDRESS forms select the si-th packed string, where si is a factor.
// Regression for the stray-unknownOp leak (NPCs 35/123/135, e.g. a wounded NPC's
// random groan): the old _followAddress never parsed the index factor, so it always
// printed entry #0 and leaked the factor bytes to statement level. The table sits
// after a LEAVE, in a region only reached via the ADDRESS jump (data, not code).
function tableScript(indexFactor) {
  return asm([
    OP.ID, 9, 'P', OP.DESC, 'x.', OP.MAIN, 'Hi.',
    { label: 'ASK' }, OP.ASKTOP,
    OP.KEY, 'say', OP.RES,
      OP.PRINTSTR, OP.ADDRESS, { u32: 'TBL' }, ...indexFactor,
      OP.GOTO, { u32: 'ASK' }, OP.ENDRES,
    OP.KEY, 'bye', OP.RES, 'Bye.', OP.LEAVE, OP.ENDRES,
    { label: 'TBL' }, 'alpha', 0, 'beta', 0, 'gamma', 0,
  ]);
}
{
  // BYTE 1 → second packed string
  const vm1 = new ConversationVM(tableScript([OP.BYTE, 1, OP.END_OF_FACTOR]));
  const e1 = drive(vm1, { inputs: ['say', 'bye'] });
  check('indexed table: BYTE 1 selects entry #1 (beta)',
    says(e1).includes('beta') && !says(e1).includes('alpha') && !says(e1).includes('gamma'), says(e1));
  check('indexed table: no unknownOp leaked to statement level', !e1.some(x => x.type === 'unknownOp'));

  // BYTE 0 → first string
  const vm0 = new ConversationVM(tableScript([OP.BYTE, 0, OP.END_OF_FACTOR]));
  const e0 = drive(vm0, { inputs: ['say', 'bye'] });
  check('indexed table: BYTE 0 selects entry #0 (alpha)',
    says(e0).includes('alpha') && !says(e0).includes('beta'), says(e0));

  // RND(0,2) index with injected rng → max → third string (gamma) — the real-script shape
  const vmR = new ConversationVM(tableScript([OP.BYTE, 0, OP.BYTE, 2, OP.RND, OP.END_OF_FACTOR]), { rng: (lo, hi) => hi });
  const eR = drive(vmR, { inputs: ['say', 'bye'] });
  check('indexed table: RND index honored (gamma at rng-high)', says(eR).includes('gamma'), says(eR));
}

// ---- summary ----
console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : ''}`);
window.__TEST_RESULT = { pass, fail, results };
const out = document.getElementById('out');
if (out) out.textContent = results.map(r => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`).join('\n') + `\n\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : ''}`;
