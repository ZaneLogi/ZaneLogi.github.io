// WorldSpeed resource (I-14d) — the single master "world pace" scalar. Multiplies BOTH the
// NPC movement-credit fill rate (systems/move_economy.js rate()) AND the decoupled game
// clock (systems/world_clock_system.js), so one slider scales the whole ambient world
// together: slow → everything ambles, value 0 → frozen (NPCs + clock stop, but the player
// stays responsive — the avatar cooldown is deliberately WORLD_SPEED-independent), fast →
// everything bustles. value 1 is the calibrated default (DEX 15 ≈ 2.5 tiles/s). Driven by
// the world-clock UI slider (view/dev_hud.js); read by the npc tick + clock systems.
export class WorldSpeed {
  constructor(value = 1) { this.value = value; }
}
