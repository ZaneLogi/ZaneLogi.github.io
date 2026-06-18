// Party resource — singleton state for the player's party that has nowhere
// per-entity to live. Per-member identity is the PartyMember component
// (world.query(PartyMember) sorted by slotIndex IS the canonical member list);
// this resource holds only the singleton fields. Keeping membership in the
// component and only singletons here avoids the dual-bookkeeping trap (a
// members[] array that drifts out of sync with the tagged entities).
//
// Source: the party is the Party[] / Active / PartySize globals (u6.h). The
// Avatar is just Party[0] — there is no separate "avatar" marker — mirrored here
// by PartyMember.slotIndex 0. `Active` selects the member currently acting.

export class Party {
  constructor({ activeIndex = 0, mode = 'follow' } = {}) {
    // Which slot is currently acting / "talking" (source's `Active`). Stays 0
    // until the active-member cycle lands (I-11, when different members elicit
    // different conversations); no consumer mutates it before then.
    this.activeIndex = activeIndex;
    // 'follow' (β: companions trail the leader) | 'solo' (combat/puzzle era;
    // the slot is reserved now, the toggle UI defers with combat).
    this.mode = mode;
  }

  setActive(index) { this.activeIndex = index; }
}
