// In-memory verification for the ECS core (I-1a). No rendering — pure logic.
// Open tests/test_core.html through the dev server; results log to console + page.
import { World, TurnClock, defineComponent, handleIndex, handleGen } from '../ecs/world.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

// --- components ---
const Position = defineComponent('Position', { x: Int16Array, y: Int16Array, z: Uint8Array });
const Renderable = defineComponent('Renderable', { tileId: Uint16Array });

const w = new World(8); // small capacity to exercise growth
w.registerComponent(Position).registerComponent(Renderable);

// --- spawn + add components ---
const ents = [];
for (let k = 0; k < 5; k++) {
  const h = w.create();
  w.add(h, Position, { x: k * 10, y: k * 20, z: 0 });
  if (k < 3) w.add(h, Renderable, { tileId: 100 + k });
  ents.push(h);
}

// --- query yields the right ids ---
const posIds = [...w.query(Position)];
const rendIds = [...w.query(Position, Renderable)];
check('query(Position) yields all 5', posIds.length === 5);
check('query(Position, Renderable) yields 3', rendIds.length === 3);

// --- field values are stored correctly (store-handle access) ---
const pos = w.store(Position);
const rend = w.store(Renderable);
check('Position fields read back', pos.x[handleIndex(ents[4])] === 40 && pos.y[handleIndex(ents[4])] === 80);
check('Renderable field read back', rend.tileId[handleIndex(ents[2])] === 102);

// --- destroy one Renderable entity ---
const dead = ents[1];
const deadIndex = handleIndex(dead);
check('destroy() returns true', w.destroy(dead) === true);
check('destroy() again returns false (already dead)', w.destroy(dead) === false);
check('query(Position) now yields 4', [...w.query(Position)].length === 4);
check('query(Position, Renderable) now yields 2', [...w.query(Position, Renderable)].length === 2);

// --- stale handle caught by generation mismatch ---
check('resolve(dead) === -1', w.resolve(dead) === -1);
check('isAlive(dead) === false', w.isAlive(dead) === false);
let threw = false;
try { w.add(dead, Position, { x: 0, y: 0, z: 0 }); } catch { threw = true; }
check('add() on dead handle throws', threw);

// --- slot reuse: new entity reuses the freed slot, old handle stays stale ---
const reused = w.create();
check('reused slot index matches freed slot', handleIndex(reused) === deadIndex);
check('reused generation > old generation', handleGen(reused) > handleGen(dead));
check('old handle still stale after reuse', w.resolve(dead) === -1);
check('new handle resolves live', w.resolve(reused) === deadIndex);

// --- capacity growth: push past initial capacity of 8 ---
for (let k = 0; k < 20; k++) { const h = w.create(); w.add(h, Position, { x: 1, y: 2, z: 3 }); }
check('capacity grew past 8', w.capacity > 8);
// 4 originals with Position + 20 new; `reused` was created without Position, so it's excluded.
check('all live entities still queryable after growth', [...w.query(Position)].length === 4 + 20);
// field survived reallocation
check('Position field survived growth', pos.x[handleIndex(ents[4])] === 40);

// --- 64-bit signature boundary: register tags so a component lands in the hi word ---
const tags = [];
for (let k = 0; k < 40; k++) tags.push(defineComponent('Tag' + k));
for (const t of tags) w.registerComponent(t);
const hiTag = tags[39];          // bit well above 32 -> hi word
const e = w.create();
w.add(e, Position, { x: 7, y: 7, z: 0 });
w.add(e, hiTag);
check('has() works for a hi-word (bit>=32) component', w.has(e, hiTag) === true);
check('query across lo+hi words finds the entity', [...w.query(Position, hiTag)].length === 1);
check('query(hiTag alone) finds exactly it', [...w.query(hiTag)].length === 1);
w.remove(e, hiTag);
check('remove() clears the hi-word bit', w.has(e, hiTag) === false);

// --- resources (typed Map) ---
const clock = new TurnClock(1000);
w.setResource(clock);
check('getResource(TurnClock) returns the instance', w.getResource(TurnClock) === clock);

// --- scheduler / frame: poll -> decide turn -> maybe sim -> render ---
let simRuns = 0, renderRuns = 0;
w.addSimSystem(() => { simRuns++; });
w.addRenderSystem(() => { renderRuns++; });

clock.lastTurnAt = 0;
// (a) no pending action, within idle interval -> render only
let fired = w.frame(16, 500);
check('frame within idle interval: no sim turn', fired === false && simRuns === 0 && renderRuns === 1);

// (b) player commits an action -> sim turn fires immediately + resets
clock.commitAction();
fired = w.frame(16, 600);
check('frame after commitAction: sim turn fires', fired === true && simRuns === 1 && renderRuns === 2);
check('pendingAction cleared after firing', clock.pendingAction === false);
check('lastTurnAt reset to now', clock.lastTurnAt === 600);

// (c) idle interval elapses -> sim turn fires anyway
fired = w.frame(16, 1700); // 1700 - 600 >= 1000
check('frame after idle interval: sim turn fires', fired === true && simRuns === 2 && renderRuns === 3);

// (d) suspended -> idle turn does NOT fire
clock.suspend();
fired = w.frame(16, 4000);
check('frame while suspended: idle turn suppressed', fired === false && simRuns === 2 && renderRuns === 4);
clock.resume();

// --- report ---
const summary = `${pass} passed, ${fail} failed`;
console.log(`\n=== I-1a ECS core: ${summary} ===`);
if (typeof document !== 'undefined') {
  const el = document.getElementById('out');
  if (el) {
    el.innerHTML =
      `<h2 class="${fail ? 'fail' : 'pass'}">I-1a ECS core: ${summary}</h2>` +
      results.map(r => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}</div>`).join('');
  }
}
window.__I1A_RESULT__ = { pass, fail, results };
