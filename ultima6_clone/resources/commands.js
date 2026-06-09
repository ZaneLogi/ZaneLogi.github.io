// resources/commands.js
//
// I-10b — the command dispatch registries. The verb->handler split is lifted from
// source's shared targeting block (seg_0A33.c:1231-1278; research_game_loop.md):
// look/talk/get/drop/move/use share one targeting front-end and differ only at a
// final switch. We model that as two registry levels:
//
//   verbHandlers — keyed by VERB, for the single-function verbs (USE/LOOK/GET/
//                  DROP, later TALK/MOVE). One entry per verb.
//   useHandlers  — keyed by OBJECT TYPE, for USE's additive ~40-case table
//                  (C_27A1_6179). Each usable type registers independently.
//
// The maps hold only PORTED handlers — an unregistered USE type falls back to a
// refusal (the "Not possible!" path; an echo during I-10b before real handlers
// exist). registerUse takes a list so a fall-through group (e.g. the door quartet
// OBJ_129-12C) registers as one call.

export class Commands {
  constructor() {
    this.verbHandlers = new Map();   // verb string -> fn(ctx)
    this.useHandlers = new Map();    // objNumber   -> fn(ctx)
  }

  register(verb, fn) { this.verbHandlers.set(verb, fn); return this; }

  registerUse(types, fn) { for (const t of types) this.useHandlers.set(t, fn); return this; }
}
