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
// Pins:   Super Mario Bros.' own movement, ported from the 6502 source at 1:1 —
//         every constant IS the ROM's byte. Horizontal is a linear adder to a hard
//         clamp; the jump is an *impulse* launch (−4, or −5 above 1.5625 px/tick)
//         with variable height from gravity *selection* (0.125 rising with the
//         button held, 0.4375 released). Derivations, and the hand-checks that
//         confirm them, live in docs/research_smb_physics.md.
//
//         The world is still 32 px/tile while the physics is 1:1, so Mario moves at
//         SMB's speed through blocks twice SMB's size — a deliberate design choice,
//         not a half-finished conversion. See CLAUDE.md "Movement model".
// Engine: V8 (Chrome 148 / Electron 42), which produced these numbers.

export const BASELINE = {
  "run_and_settle": {
    "hash": "804d92d3",
    "scalars": {
      "plateauVx": 1.5,
      "distAtRelease": 870.43,
      "distFinal": 900,
      "ticksToStopAfterRelease": 40
    }
  },
  "run_reverse_settle": {
    "hash": "08c24cac",
    "scalars": {
      "peakDist": 883.086,
      "peakTick": 611,
      "turnaroundTick": 612,
      "skidTicks": 11,
      "leftVxAtEnd": -1.5,
      "distFinal": 449.623
    }
  },
  "jump_release_sweep": {
    "hash": "bdface9f",
    "scalars": {
      "peaks": [
        23.125,
        28.5,
        38.125,
        49.938,
        60.625,
        66
      ],
      "landTicks": [
        20,
        23,
        28,
        35,
        44,
        53
      ]
    }
  },
  "terminal_fall": {
    "hash": "646d66ca",
    "scalars": {
      "terminalTick": 25,
      "terminalVy": 4,
      "landTick": 252,
      "fallDist": 959.99
    }
  },
  "air_control": {
    "hash": "eb4bfea0",
    "scalars": {
      "airVxAtTick100": 1.5,
      "airVxMax": 1.5,
      "terminalVy": 4,
      "landTick": 556
    }
  },
  "sprint": {
    "hash": "0bbc5add",
    "scalars": {
      "plateauVx": 2.5,
      "clampTick": 44,
      "distAtEnd": 545.107
    }
  },
  "qblock_bump": {
    "hash": "15c89906",
    "scalars": {
      "tileBefore": 3,
      "tileAfter": 5,
      "bumpTick": 16,
      "hopSeen": true
    }
  },
  "anim_states": {
    "hash": "45241608",
    "scalars": {
      "statesSeen": [
        "idle",
        "walk",
        "run",
        "skid",
        "jump",
        "fall"
      ],
      "finalState": "run"
    }
  },
  "goomba_walks": {
    "hash": "fd83a541",
    "scalars": {
      "turns": 1,
      "minX": 38.09,
      "maxX": 287.99,
      "speed": 0.42,
      "state": "walk",
      "restsOnFloor": true
    }
  }
};
