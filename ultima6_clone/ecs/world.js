// ECS runtime ground — see docs/architecture_ecs.md.
// World is a uniform generic container: entity allocator + component stores +
// resources, all keyed by type, hard-coding no domain type. Systems are plain
// functions (world, dt) => void held in two ordered lists.

// --- Generational handle packing ----------------------------------------
// A handle is {index, generation} packed into one JS Number: index in the low
// INDEX_BITS, generation above. generation bumps on BOTH create and destroy, so
// its low bit doubles as occupancy (odd = alive, even = free) and a stale handle
// is caught at resolve() by a generation mismatch.
const INDEX_BITS = 24;                 // up to 16,777,216 simultaneously-live slots
const GEN_MULT = 2 ** INDEX_BITS;      // generation up to ~2^29 before exceeding 2^53

export function handleIndex(h) { return h % GEN_MULT; }
export function handleGen(h) { return Math.floor(h / GEN_MULT); }
function makeHandle(index, generation) { return index + generation * GEN_MULT; }

// --- Component definition -------------------------------------------------
// A component is a descriptor: a name + a map of field name -> TypedArray ctor.
// A tag component has no fields (membership is the bit alone).
export function defineComponent(name, fields = {}) {
  return { name, fields };
}

class ComponentStore {
  constructor(def, capacity) {
    this.def = def;
    this._ctors = def.fields || {};
    this.fields = {};                  // field name -> TypedArray (length = capacity)
    for (const [name, Ctor] of Object.entries(this._ctors)) {
      this.fields[name] = new Ctor(capacity);
    }
  }
  _grow(capacity) {
    for (const [name, Ctor] of Object.entries(this._ctors)) {
      const next = new Ctor(capacity);
      next.set(this.fields[name]);
      this.fields[name] = next;        // swap in place so cached `fields` refs stay valid
    }
  }
  write(i, values) {
    for (const name in values) {
      const arr = this.fields[name];
      if (arr) arr[i] = values[name];
    }
  }
}

// --- TurnClock resource ---------------------------------------------------
// Turn-driver state for the two-clock tick model (docs/architecture_ecs.md §6).
// suspendCount (not a bool) so nested blockers suspend/resume correctly.
export class TurnClock {
  constructor(idleInterval = 1000) {
    this.lastTurnAt = 0;
    this.idleInterval = idleInterval;
    this.suspendCount = 0;
    this.pendingAction = false;
  }
  commitAction() { this.pendingAction = true; }
  suspend() { this.suspendCount++; }
  resume() { if (this.suspendCount > 0) this.suspendCount--; }
}

// --- World ----------------------------------------------------------------
export class World {
  constructor(initialCapacity = 1024) {
    this.capacity = initialCapacity;
    this.highWater = 0;                // next never-yet-used index
    this.freeStack = [];               // recycled free indices
    this.generation = new Uint32Array(this.capacity); // 0 = free/never-used (even)
    this.sigLo = new Uint32Array(this.capacity);       // component bits 0..31
    this.sigHi = new Uint32Array(this.capacity);       // component bits 32..63

    this._components = new Map();       // def -> { bit, store }
    this._nextBit = 0;
    this._resources = new Map();        // constructor -> instance

    this.renderSystems = [];           // run every frame
    this.simSystems = [];              // run only when a turn fires
  }

  _grow(min) {
    let cap = this.capacity;
    while (cap < min) cap *= 2;
    const regrow = (arr) => { const n = new Uint32Array(cap); n.set(arr); return n; };
    this.generation = regrow(this.generation);
    this.sigLo = regrow(this.sigLo);
    this.sigHi = regrow(this.sigHi);
    for (const { store } of this._components.values()) store._grow(cap);
    this.capacity = cap;
  }

  // --- component registration ---
  registerComponent(def) {
    if (this._components.has(def)) return this;
    const bit = this._nextBit++;
    if (bit >= 64) throw new Error('component bit overflow (max 64)');
    this._components.set(def, { bit, store: new ComponentStore(def, this.capacity) });
    return this;
  }
  _entry(def) {
    const e = this._components.get(def);
    if (!e) throw new Error(`component not registered: ${def && def.name}`);
    return e;
  }
  // Returns the store's raw field arrays: `const pos = world.store(Position); pos.x[id]`.
  store(def) { return this._entry(def).store.fields; }

  // --- entity lifecycle ---
  create() {
    let i;
    if (this.freeStack.length) {
      i = this.freeStack.pop();
    } else {
      i = this.highWater++;
      if (i >= this.capacity) this._grow(i + 1);
    }
    this.generation[i]++;              // -> odd = alive
    this.sigLo[i] = 0; this.sigHi[i] = 0;
    return makeHandle(i, this.generation[i]);
  }
  destroy(h) {
    const i = handleIndex(h);
    if (i >= this.highWater || this.generation[i] !== handleGen(h)) return false;
    this.generation[i]++;              // -> even = free; invalidates old handles
    this.sigLo[i] = 0; this.sigHi[i] = 0;
    this.freeStack.push(i);
    return true;
  }
  resolve(h) {
    const i = handleIndex(h);
    return (i < this.highWater && this.generation[i] === handleGen(h)) ? i : -1;
  }
  isAlive(h) { return this.resolve(h) !== -1; }
  // Inverse of resolve(): pack index + current generation back into a handle.
  // Useful when query() yields an index and a caller needs the handle (e.g. for
  // SpatialIndex ops or canStandAt's actorId exclusion).
  handleOf(i) { return i + this.generation[i] * GEN_MULT; }

  // --- components on entities ---
  add(h, def, values) {
    const i = this.resolve(h);
    if (i === -1) throw new Error('add() on a dead/stale handle');
    const { bit, store } = this._entry(def);
    if (bit < 32) this.sigLo[i] = (this.sigLo[i] | (1 << bit)) >>> 0;
    else this.sigHi[i] = (this.sigHi[i] | (1 << (bit - 32))) >>> 0;
    if (values) store.write(i, values);
    return this;
  }
  remove(h, def) {
    const i = this.resolve(h);
    if (i === -1) return this;
    const { bit } = this._entry(def);
    if (bit < 32) this.sigLo[i] = (this.sigLo[i] & ~(1 << bit)) >>> 0;
    else this.sigHi[i] = (this.sigHi[i] & ~(1 << (bit - 32))) >>> 0;
    return this;
  }
  has(h, def) {
    const i = this.resolve(h);
    if (i === -1) return false;
    const { bit } = this._entry(def);
    return bit < 32 ? (this.sigLo[i] & (1 << bit)) !== 0
                    : (this.sigHi[i] & (1 << (bit - 32))) !== 0;
  }

  // --- query: generator yielding live ids whose signature has every listed component ---
  *query(...defs) {
    let maskLo = 0, maskHi = 0;
    for (const def of defs) {
      const { bit } = this._entry(def);
      if (bit < 32) maskLo |= (1 << bit); else maskHi |= (1 << (bit - 32));
    }
    maskLo >>>= 0; maskHi >>>= 0;
    const { sigLo, sigHi, generation, highWater } = this;
    for (let i = 0; i < highWater; i++) {
      if ((generation[i] & 1) === 0) continue;           // even = free, skip
      if (((sigLo[i] & maskLo) >>> 0) === maskLo &&
          ((sigHi[i] & maskHi) >>> 0) === maskHi) yield i;
    }
  }

  // --- resources (typed Map; the class is the key) ---
  setResource(instance) { this._resources.set(instance.constructor, instance); return this; }
  getResource(Type) { return this._resources.get(Type); }

  // --- scheduler ---
  addRenderSystem(fn) { this.renderSystems.push(fn); return this; }
  addSimSystem(fn) { this.simSystems.push(fn); return this; }

  // frame: poll -> decide turn -> maybe sim -> render. Returns whether a turn fired.
  // The turn-driver is World orchestration (not a registered system); its state is
  // a TurnClock resource. `now` is the wall-clock the idle heartbeat watches.
  frame(dt, now) {
    const clock = this.getResource(TurnClock);
    let runSim = false;
    if (clock) {
      if (clock.pendingAction) {
        runSim = true; clock.pendingAction = false; clock.lastTurnAt = now;
      } else if (clock.suspendCount === 0 && (now - clock.lastTurnAt) >= clock.idleInterval) {
        runSim = true; clock.lastTurnAt = now;
      }
    }
    if (runSim) for (const s of this.simSystems) s(this, dt);
    for (const s of this.renderSystems) s(this, dt);
    return runSim;
  }
}
