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
// Pins:   Super Mario Bros.' own movement, ported from the 6502 source —
//         horizontal is a linear adder to a hard clamp, and the jump is an
//         *impulse* launch (−8, or −10 above 3.125 px/tick) with variable height
//         from gravity *selection* (0.25 rising with the button held, 0.875
//         released). Every scalar is ROM-derived; the derivations, and the
//         hand-checks that confirm them, live in docs/research_smb_physics.md.
// Engine: V8 (Chrome 148 / Electron 42), which produced these numbers.

export const BASELINE = {
  "run_and_settle": {
    "hash": "499ab556",
    "scalars": {
      "plateauVx": 3,
      "distAtRelease": 1740.859,
      "distFinal": 1800,
      "ticksToStopAfterRelease": 40
    }
  },
  "run_reverse_settle": {
    "hash": "c68d150c",
    "scalars": {
      "peakDist": 1766.172,
      "peakTick": 611,
      "turnaroundTick": 612,
      "skidTicks": 12,
      "leftVxAtEnd": -3,
      "distFinal": 899.246
    }
  },
  "jump_release_sweep": {
    "hash": "48fb9ff4",
    "scalars": {
      "peaks": [
        46.25,
        57,
        76.25,
        99.875,
        121.25,
        132
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
    "hash": "278d91e9",
    "scalars": {
      "terminalTick": 25,
      "terminalVy": 8,
      "landTick": 132,
      "fallDist": 959.99
    }
  },
  "air_control": {
    "hash": "e859f2f6",
    "scalars": {
      "airVxAtTick100": 3,
      "airVxMax": 3,
      "terminalVy": 8,
      "landTick": 284
    }
  },
  "sprint": {
    "hash": "9228bc45",
    "scalars": {
      "plateauVx": 5,
      "clampTick": 44,
      "distAtEnd": 1090.215
    }
  },
  "qblock_bump": {
    "hash": "333ee3ab",
    "scalars": {
      "tileBefore": 3,
      "tileAfter": 5,
      "bumpTick": 15,
      "hopSeen": true
    }
  },
  "anim_states": {
    "hash": "fa44f978",
    "scalars": {
      "statesSeen": [
        "idle",
        "walk",
        "run",
        "skid",
        "jump",
        "fall"
      ],
      "finalState": "walk"
    }
  },
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
