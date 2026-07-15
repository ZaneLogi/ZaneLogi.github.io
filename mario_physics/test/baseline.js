// ----------------------
// Blessed fingerprint — the reference Mario
// ----------------------
// This file is DATA, not code. It records what the physics did at a known-good
// commit, so a behaviour-preserving change (inverting the loop, moving movement
// onto the type, hoisting gravity) can be proven to have changed nothing.
//
// Re-bless ONLY when a physics change is INTENTIONAL: open test/fingerprint.html,
// copy the emitted block over BASELINE, and say in the commit message why the
// numbers moved. Re-blessing to turn a red harness green defeats the point — at
// that moment the harness is theatre.
//
// Blessed at: 20caad4 ("[mario_physics] port FullScreenMario movement feel")
// Engine:     V8 (Chrome 148 / Electron 42). The comparison is exact-match, and
//             Math.pow is not guaranteed bit-identical across JS engines — the
//             physics uses it for friction^step and jumpLev^mod. Expect possible
//             false failures on a non-V8 engine; re-bless there if you move.

export const BASELINE = {
  "run_and_settle": {
    "hash": "4d42da9b",
    "scalars": {
      "plateauVx": 4.767,
      "distAtRelease": 2626.618,
      "distFinal": 2746.311,
      "ticksToStopAfterRelease": 65
    }
  },
  "run_reverse_settle": {
    "hash": "df77e7a0",
    "scalars": {
      "peakDist": 2695.986,
      "peakTick": 632,
      "turnaroundTick": 633,
      "skidTicks": 33,
      "leftVxAtEnd": -4.745,
      "distFinal": 1541.385
    }
  },
  "jump_release_sweep": {
    "hash": "17a88e6d",
    "scalars": {
      "peaks": [37.646, 65.263, 98.462, 124.344, 139.88, 144.961],
      "landTicks": [25, 33, 42, 49, 54, 57]
    }
  },
  "terminal_fall": {
    "hash": "a297d9d9",
    "scalars": {
      "terminalTick": 16,
      "terminalVy": 8,
      "landTick": 127,
      "fallDist": 959.99
    }
  },
  "air_control": {
    "hash": "b14822bb",
    "scalars": {
      "airVxAtTick100": 4.147,
      "airVxMax": 4.75,
      "terminalVy": 8,
      "landTick": 279
    }
  },
  "sprint": {
    "hash": "e7a5c7d2",
    "scalars": {
      "plateauVx": 5.4,
      "clampTick": 41,
      "distAtEnd": 1202.849
    }
  },
  "qblock_bump": {
    "hash": "6a2f22df",
    "scalars": {
      "tileBefore": 3,
      "tileAfter": 5,
      "bumpTick": 15,
      "hopSeen": true
    }
  },
  "anim_states": {
    "hash": "f2689def",
    "scalars": {
      "statesSeen": ["idle", "walk", "run", "skid", "jump", "fall"],
      "finalState": "walk"
    }
  },
  // Added when the Goomba landed. Re-blessed once, deliberately: its speed went
  // 1.0 -> 0.84 to match the reference. Mario's eight kept their hashes through
  // both, so nothing else moved.
  "goomba_walks": {
    "hash": "f3bf2971",
    "scalars": {
      "turns": 3,
      "minX": 0,
      "maxX": 287.99,
      "speed": 0.84,
      "state": "walk",
      "restsOnFloor": true
    }
  }
};
