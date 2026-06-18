// Move economy (I-14) — the DEXTE-paced movement-speed model. A *modern rewrite* of
// source's MovePts/DEXTE round economy (C_1E0F_4E0A + SubTerrainMov), NOT a port of the
// turn-loop round driver: instead of a shared pool refilled per round, each actor carries
// a continuous `moveCredit` accumulator (components/components.js MoveSpeed) that fills at
// a per-actor rate and pays a per-tile cost to step. Same observable mechanic (DEX = speed,
// terrain = cost, faster actors stagger), expressed continuously so it fits the clone's
// heartbeat instead of bursting per round. Full design: progress.md §"I-14 scope" +
// §"Post-I-9 — deviation audit" → "SETTLED MODEL".
//
// This module owns the calibration: how the source DEXTE stat (1..30) maps to a real-time
// step rate, and how a tile's terrain weight becomes a step cost. The accumulator tick that
// consumes these lives in systems/npc_tick_system.js (I-14b); the player's cooldown
// (I-14c) reuses stepCostAt. The WORLD_SPEED master scalar (I-14d) multiplies rate().

import { TileRegistry } from '../resources/tile_registry.js';
import { MapLevel } from '../resources/map_level.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { Renderable } from '../components/components.js';

// --- Calibration (tuned live; see progress.md §"I-14 scope" sub-step e) ---------------
// DEXTE is a *speed meter*, mapped into a feel-calibrated band — NOT used at its raw scale.
// Anchor: a reference-dexterity actor on open ground walks REF_TILES_PER_SEC. A FLOOR keeps
// the slowest creatures from crawling; the fast end (DEX 30) falls out at ~2× the reference.
export const BASE_COST = 5;             // SubTerrainMov base (seg_1E0F.c:1402 `pts = 5`)
export const REF_DEX = 15;              // a "typical" walker
export const REF_TILES_PER_SEC = 2.5;   // its open-ground pace at WORLD_SPEED 1
export const DEX_FLOOR = 6;             // effective-DEX floor (slowest ≈ REF×FLOOR/REF_DEX tiles/s)

// credit gained per millisecond, per DEX point, at WORLD_SPEED 1. Derived so that a
// REF_DEX actor on BASE_COST terrain reaches one step's cost in (1000/REF_TILES_PER_SEC) ms:
//   rate(REF_DEX) × stepMs = BASE_COST  →  K × REF_DEX × (1000/REF_TILES_PER_SEC) = BASE_COST.
const K = (BASE_COST * REF_TILES_PER_SEC) / (1000 * REF_DEX);

// Per-actor fill rate (credit/ms) for a given dexterity, scaled by the WORLD_SPEED master
// slider (I-14d). Floors the effective dexterity so nothing is unwatchably slow. At
// worldSpeed 0 the rate is 0 → the actor (and, with the decoupled clock, the world) freezes.
export function rate(dexterity, worldSpeed = 1) {
  return K * Math.max(dexterity, DEX_FLOOR) * worldSpeed;
}

// Heartbeat sample interval (ms) for the accumulator tick (I-14b) — the cadence at which
// credit is integrated and at most one tile is stepped per actor. Matches the TurnClock
// idle interval (main.js `new TurnClock(100)`); kept here so the move systems share it.
export const HEARTBEAT_MS = 100;

// Clamp on a single integration step (ms). A backgrounded tab or a closed modal can leave a
// large gap since the last sample; without a clamp that gap would bank into a multi-tile
// jump on resume. Clamping caps the catch-up to a couple of heartbeats.
export const MAX_ELAPSED_MS = 250;

// Player open-ground step interval (ms). FIXED-BRISK: the avatar's pace on open ground is
// constant regardless of its dexterity (we deliberately do NOT DEXTE-scale the player — a
// sluggish low-DEX avatar everywhere just feels bad; the player-facing point is terrain
// speed). Stretched by terrain via stepCostAt below. Independent of WORLD_SPEED so input
// stays responsive even when the ambient world is slowed (I-14c).
export const PLAYER_STEP_MS = 150;

// Per-tile step cost — source's SubTerrainMov (seg_1E0F.c:1402): BASE_COST plus the terrain
// nibble of the actor's own tile and of every object stacked at its cell (impassable tiles
// don't contribute — they block instead). Used as both the accumulator's per-step price and
// the credit cap (so an actor banks at most one step). Objects are read at their anchor cell
// (spatial.at), matching source's FindLoc/NextLoc chain walk; multi-tile object weights are
// approximated by the anchor tile (object terrain weight is rare — terrain cost is dominated
// by the base map tile: swamp/forest/mountain).
export function stepCostAt(world, x, y, z = 0) {
  const reg = world.getResource(TileRegistry);
  const mapLevel = world.getResource(MapLevel);
  let pts = BASE_COST;
  const terr = mapLevel.tileAt(x, y);
  if (!reg.isTerrainImpassable(terr)) pts += reg.terrainCost(terr);
  const ents = world.getResource(SpatialIndex).at(x, y);
  if (ents) {
    const rend = world.store(Renderable);
    for (const h of ents) {
      const i = world.resolve(h);
      if (i === -1) continue;
      const t = rend.tileId[i];
      if (!reg.isTerrainImpassable(t)) pts += reg.terrainCost(t);
    }
  }
  return pts;
}
