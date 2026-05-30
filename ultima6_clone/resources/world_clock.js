// WorldClock resource — game-time state + the sun-strength byte D_2C55 + an
// hourly hook list. Ports the time-advance core of C_0A33_1355
// (seg_0A33.c:715-937), scoped to the I-3 surface (see docs/progress.md "I-3
// scope — world clock"):
//
//   - minute -> hour (>=60) -> day (==24) -> month (>28) -> year (>12) cascade
//     (seg_0A33.c:853-885)
//   - D_2C55 recompute, overworld-only:
//     5:00..5:59 dawn ramp 1..6; 6..18 day=7; 19:00..19:59 dusk ramp 6..1;
//     else 0 (seg_0A33.c:918-931). Eclipse, dungeon (MapZ), torch and
//     light-spell conditions are deferred to their owning subsystems.
//   - onHour(cb) registration; hooks fire once per hour-rollover during
//     advance(). Ships empty at I-3; I-5's NPC schedule re-check
//     (C_1E0F_5165) will be the first registrant.
//
// D_2C55 is the SUN-STRENGTH INPUT to the lighting flood-fill, NOT a
// render-side knob — see docs/research_map_render.md §"Lighting + visibility
// model". At I-3 the byte is stored but unconsumed.

export class WorldClock {
  constructor({ Time_H = 9, Time_M = 0, Date_D = 1, Date_M = 1, Date_Y = 161 } = {}) {
    this.Time_H = Time_H;
    this.Time_M = Time_M;
    this.Date_D = Date_D;
    this.Date_M = Date_M;
    this.Date_Y = Date_Y;
    this.D_2C55 = 7;
    this.hourlyHooks = [];
    this.recomputeD_2C55();
  }

  onHour(cb) { this.hourlyHooks.push(cb); return this; }

  advance(minutes) {
    let m = this.Time_M + minutes;
    while (m >= 60) {
      this.Time_H++;
      m -= 60;
      if (this.Time_H === 24) {
        this.Time_H = 0;
        this.Date_D++;
        if (this.Date_D > 28) {
          this.Date_D = 1;
          this.Date_M++;
          if (this.Date_M > 12) { this.Date_M = 1; this.Date_Y++; }
        }
      }
      for (const cb of this.hourlyHooks) cb(this);
    }
    this.Time_M = m;
    this.recomputeD_2C55();
  }

  recomputeD_2C55() {
    const h = this.Time_H, m = this.Time_M;
    if (h < 5 || h > 19) this.D_2C55 = 0;
    else if (h === 5) this.D_2C55 = Math.floor(m / 10) + 1;
    else if (h === 19) this.D_2C55 = Math.floor((59 - m) / 10) + 1;
    else this.D_2C55 = 7;
  }
}
