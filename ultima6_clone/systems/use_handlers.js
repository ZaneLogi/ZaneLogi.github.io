// systems/use_handlers.js
//
// I-10c+ — USE object-type handlers. Each registers into Commands.useHandlers via
// registerUse (source's USE switch fall-through, C_27A1_6179); the dispatcher's
// shared USE wrap (command_dispatch.js) does the re-pick + lookup, so a handler
// does ONLY its type-specific effect. Adding a usable type is a one-liner here and
// never touches the dispatcher.

import { Commands } from '../resources/commands.js';
import { ObjType, Amount, Position } from '../components/components.js';
import { setObjectFrame, addMapObject, deleteMapObject, findObjectsByTypeQuality, objAtCell, actorAtCell } from '../world_loader.js';
import { registerCrank } from './use_drawbridge.js';
import { useLadder } from './use_ladder.js';

// Doors (obj.h:620-627): Oaken / Windowed / Cedar / Steel — all four route to one
// handler (source's USE switch sends OBJ_129..12C to C_27A1_2A44, seg_27a1.c:3069).
// OBJ_12D (Doorway) is the open opening, not a door object.
const DOORS = [0x129, 0x12A, 0x12B, 0x12C];

// Door frame model (C_27A1_2A44, seg_27a1.c:1280): the low 2 bits are the door's
// orientation/variant; bits 2-3 are the state —
//   0 open · 1 closed (unlocked) · 2 key-locked · 3 magically locked.
// In SOURCE, plain USE (flags 0,0,0) toggles the open<->closed bit on an UNLOCKED
// door and refuses a locked one ("locked" / "magically locked!"); unlocking needs
// the matching key or a spell (the bp0a/bp08/bp06 arms, via C_27A1_2D8E / magic).
//
// TEMPORARY LOCK BYPASS (Zane 2026-06-04): the clone force-opens a locked door
// instead of refusing. Reason — the faithful unlock needs (a) the matching key
// (e.g. the quality-1 key for the steel door at (304,382) gating the castle
// drawbridge/portcullis), which U6 hands the player through LORD BRITISH'S
// CONVERSATION (the conversation VM = I-13, not built), and (b) a USE-an-
// inventory-item-on-a-target front-end (deferred). Without both, a locked door
// dead-ends progress. REVERT to the source-faithful refusal + key/lockpick unlock
// (C_27A1_2D8E) once I-13 + the key mechanism land.
//
// Updating the frame flips passability for free: the closed frame's tile is
// IsTerrainImpassable, the open frame's isn't, and canStandAt reads the live tile
// flags (research_map_render / I-4) — so an opened door becomes walkable with no
// special-case here.
function useDoor({ world, target, message }) {
  const objs = world.store(ObjType);
  const i = world.resolve(target.entity);
  if (i === -1) return;
  const frame = objs.frame[i];
  const orient = frame & 3;          // low 2 bits = orientation/variant (preserved)
  const state = frame >> 2;          // 0 open · 1 closed · 2 key-locked · 3 magic-locked
  if (state === 0) {                 // open -> close (to unlocked-closed; state 1)
    setObjectFrame(world, target.entity, orient | 4);
    message('You close the door.');
  } else {                           // closed OR locked -> open (state 0; lock bypassed)
    setObjectFrame(world, target.entity, orient);
    message(state >= 2 ? 'You force the door open.' : 'You open the door.');
  }
}

// --- I-10d: quality-linked controls (lever / switch) ----------------------------
const OBJ_DOORWAY = 0x12D;      // 301 — marker tiles a control's quality links to
const OBJ_PORTCULLIS = 0x136;   // 310 — the lever's gate
const OBJ_ELEC_FIELD = 0x0AF;   // 175 — the switch's gate (Electric Field)

// Shared toggle for a quality-linked control (lever C_27A1_4479 / switch
// C_27A1_4672, seg_27a1.c:2092/2140): flip the control's own frame, then for every
// OBJ_12D marker whose quality matches the control's, ADD the gate object if absent
// (refusing if an actor blocks it) or DELETE it if present — i.e. the gate
// drops/raises by add/delete, not a frame-toggle. Passability follows automatically
// (the gate tile is impassable; deleting it clears the cell). Lever and switch
// differ only in the gate object, its frame, and whether occupancy is checked.
function markerToggle({ world, target, message }, { gateObj, gateFrameFor, checkOccupancy, gateName }) {
  const objs = world.store(ObjType), amts = world.store(Amount), pos = world.store(Position);
  const i = world.resolve(target.entity);
  if (i === -1) return;
  setObjectFrame(world, target.entity, objs.frame[i] ^ 1);     // flip the lever/switch
  const quality = amts.quality[i];
  // Window the circuit-quality scan to the control's ~40x40 active area + level
  // (source's SearchArea bound — see world_loader.findObjectsByTypeQuality).
  const near = { x: pos.x[i], y: pos.y[i], z: pos.z[i] };
  let result = 0;     // 0 nothing happened · 1 toggled · 2 blocked
  if (quality) {
    for (const markerH of findObjectsByTypeQuality(world, OBJ_DOORWAY, quality, near)) {
      const mi = world.resolve(markerH);
      const mx = pos.x[mi], my = pos.y[mi];
      const existing = objAtCell(world, mx, my, gateObj);
      if (existing === null) {
        if (checkOccupancy && actorAtCell(world, mx, my)) { result = 2; break; }
        addMapObject(world, { objNumber: gateObj, frame: gateFrameFor(objs.frame[mi]), x: mx, y: my });
        result = 1;
      } else {
        deleteMapObject(world, existing);
        result = 1;
      }
    }
  }
  message(result === 2 ? `You can't close the ${gateName}.` : result === 1 ? 'You hear a noise.' : 'Nothing happens.');
}

// Lever -> portcullis (C_27A1_4479): frame 3 if the marker's bit 2 is set, else 1;
// refuses to drop the gate onto an actor.
function useLever(ctx) {
  markerToggle(ctx, { gateObj: OBJ_PORTCULLIS, gateFrameFor: (mf) => (mf & 2) ? 3 : 1, checkOccupancy: true, gateName: 'portcullis' });
}
// Switch -> electric field (C_27A1_4672): always frame 0, no occupancy gate.
function useSwitch(ctx) {
  markerToggle(ctx, { gateObj: OBJ_ELEC_FIELD, gateFrameFor: () => 0, checkOccupancy: false, gateName: 'field' });
}

export function registerUseHandlers(world) {
  const commands = world.getResource(Commands);
  commands.registerUse(DOORS, useDoor);
  commands.registerUse([0x10C], useLever);    // I-10d: lever -> portcullis
  commands.registerUse([0x0AE], useSwitch);   // I-10d: switch -> electric field (same mechanism)
  registerCrank(world);                        // I-10e: crank -> drawbridge (own module, geometry-heavy)
  commands.registerUse([0x131], useLadder);   // I-19d: ladder -> change level (C_101C_089E, own module)
  // Later lantern · food · … register here as one-liners, each citing
  // its C_27A1_* counterpart.
}
