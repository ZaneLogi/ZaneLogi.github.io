// lemmings/src/interactive_object.js
//
// The interactive-object runtime (design_spec §17.2, §17.5) — the per-object state
// the trap interpreter reads. An interactive object that participates in object
// interaction (a trap, water, fire, an entrance opening) carries a small record:
// its animation type and current frame, plus — for a TRIGGERED trap — the
// `triggered` flag that gates its kill (§17.4) and its re-arm (§17.5).
//
// This is the read side that §17.4 was missing: object_interaction.js looks a trap
// up here by its object-map index and triggers it; simulation.js advances every
// object here in frame phase 7 (§17.5), which is what re-arms a trap.
//
// The VALUES here are level data, not engine constants (§1.4). Real ones come from
// each tileset's GROUND?O.DAT object records (Chapter 8 — trigger effect, frame
// count, sound id); a synthetic level authors them directly. The interpreter is
// identical either way — it reads the shape, never the source.

/**
 * §17.5 animation types — how an interactive object advances its frame.
 * @type {Readonly<Record<string, number>>}
 */
export const ANIM_TYPE = {
  NONE: 0,        // static — never advances
  TRIGGERED: 1,   // advances only while triggered; clears the flag on wrap (traps)
  CONTINUOUS: 2,  // advances every frame, wrapping forever (water, fire)
  ONCE: 3,        // advances once to the last frame, then holds (an entrance opening)
};

/**
 * A triggered trap (§17.4). `frameCount` is the length of its animation and thus
 * its BUSY period — how long it ignores lemmings after a kill before re-arming
 * (§17.5); a longer animation catches fewer lemmings. `startFrame` is the
 * Chapter-20 variant: the frame the animation begins on when triggered (0, or 1 in
 * the skip-frame-0 form). `soundId` is carried for Chapter 24 and unused here.
 * @param {{ frameCount: number, startFrame?: number, soundId?: number }} spec
 * @returns {{animType:number, frameCount:number, startFrame:number, soundId:number, triggered:boolean, frame:number}}
 */
export function makeTrap({ frameCount, startFrame = 0, soundId = 0 }) {
  return {
    animType: ANIM_TYPE.TRIGGERED,
    frameCount,
    startFrame,
    soundId,
    triggered: false,   // armed; a lemming on it dies and sets this (§17.4)
    frame: 0,           // current animation frame (advances only while triggered)
  };
}

/**
 * §17.5 (frame phase 7) — advance one interactive object's animation by a frame.
 *   - TRIGGERED: advance only while `triggered`; when the frame wraps back to 0,
 *     clear the flag — the trap RE-ARMS (§17.4's busy period ends here).
 *   - CONTINUOUS: advance every frame, wrapping (endless water/fire loop).
 *   - ONCE: advance to the last frame, then hold (an entrance finishing opening).
 *   - NONE: static, never advances.
 * @param {{animType:number, frame:number, frameCount:number, triggered:boolean}} obj
 * @returns {void}
 */
export function advanceObject(obj) {
  switch (obj.animType) {
    case ANIM_TYPE.TRIGGERED:
      if (obj.triggered) {
        obj.frame += 1;
        if (obj.frame >= obj.frameCount) { obj.frame = 0; obj.triggered = false; }  // re-arm
      }
      break;
    case ANIM_TYPE.CONTINUOUS:
      obj.frame += 1;
      if (obj.frame >= obj.frameCount) obj.frame = 0;
      break;
    case ANIM_TYPE.ONCE:
      if (obj.frame < obj.frameCount - 1) obj.frame += 1;
      break;
    // ANIM_TYPE.NONE: nothing.
  }
}
