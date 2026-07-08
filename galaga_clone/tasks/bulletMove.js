// NOTE: f_1DD2 is NOT bullet movement — it is the game timer decrementer
// running at 2 Hz (always-on). It is implemented as tickGameTimers() in
// main.js and runs unconditionally outside the task table.
//
// Player bullet movement and hit detection are handled by f_23DD (objectStates),
// which processes the full object table at 0x8800 each frame.
//
// This file is kept as a reference note only and is not imported by main.js.
