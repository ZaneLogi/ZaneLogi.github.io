// lunar_lander/state.js
//
// Shared mutable game state — the software analog of the source's ZERO PAGE
// (A34573.1A :173-260). One place for the cross-cutting values every module
// reads/writes, the same role the 6502's zero page plays. This is the first of
// the two "seams" the port is built on (CLAUDE.md "Planned gameplay module
// layout": a shared state for the zero-page values; the render layer is the
// other seam — render.js).
//
// Values are the source's own BOOT defaults — no invented numbers (CLAUDE.md
// "no fakes; port the real data flow"). Naming: descriptive names; the source's
// mnemonic is kept in the comment at each declaration (CLAUDE.md "Naming style").
//
// WHO WRITES WHAT (shared mutable state needs this — keep it current):
//   • lifecycle transitions (newGame; land/crash/game-over) → the named
//     functions in THIS file — grep here for the "big" changes.
//   • per-frame motion (shipRotation, thrustLevel, velX/velY, posX/posY, fuel)
//     → the physics stepper ONLY (one hot-path owner).
//   • scrollX/scrollY/camera + zoomedOut → landscape + the zoom transition.
//   • collisionStatus → the collision verdict (collision.js, cleared+set per tick);
//     outcomeStatus/lastPoints/messagePick/explosionPattern/sequenceStep → the
//     outcome lifecycle here (beginOutcome/finishOutcome) + main.js's MOTCHK tick.
//   Reads are free anywhere; writes stay with their owner above.

// Collision / landing status — the source's COLFLG values (:243). The enum keeps
// the source's OWN bytes ($80/$C0/$8F; bit 7 = "in contact", low nibble = crash)
// so any bit-level source logic still ports 1:1, but code reads by name.
export const CollisionStatus = {
  SAFE_FLY:  0x00,    // no contact this frame
  GOOD_LAND: 0x80,    // successful landing
  HARD_LAND: 0xC0,    // hard landing → the bounce
  CRASH:     0x8F,    // collision / crash
};

// Game mode — the source's GAMODE values (:196), kept as the source's own bytes.
// (The source also has $10 free-play and $20 ready-to-play — those arrive with
// the GAMODE state-machine step.)
export const GameMode = {
  IDLE:    0x00,      // attract / start screen
  PLAY:    0x40,      // mission in flight
  OUTCOME: 0x80,      // land/crash sequence running (PLYCHK `ASL GAMODE` :574)
};

export const state = {
  // --- craft attitude & motion (zero page :174-248) --------------------------
  shipRotation: 8,    // SHIP (:175) — rotation step 0-31 (11.25°/step), 8 = upright.
                      // Float here (finer thrust angle; the pose fold snaps). ATRINIT seeds 8.
  angularVelocity: 0, // SHPINE (:176) — rotational-inertia spin, Command mode only
  thrustLevel: 0,     // THRUST (:174, "ROCKET THRUST X.05") — the dialed throttle level 0-15
  throttle: 0,        // ACTUAL thrust output 0..1 (0 when the tank is empty) — drives the flame
  velX: 0, velY: 0,   // VELX/VELY (:247-248) — velocity, 16-bit source units
  posX: 0, posY: 0,   // ship position WITHIN its screen window (XCURADJ/YCURADJ analog, :178),
                      // DVG units, Y-up; the on-screen draw point = this directly (POSTMOD does
                      // XCURADJ>>6, and we hold posX/posY already un-scaled). NOT a world/terrain
                      // position and NOT the scape scroll — that offset is scrollX/scrollY.

  // --- resources -------------------------------------------------------------
  fuel: 0,            // FUEL — remaining fuel; set from the start-fuel picker (research_physics.md §7.2)
  fuelUsed: 0,        // FLUSE (:295) — cumulative fuel BURNED this drop (thrust + rotation); vs the
                      //   par below, DEDUCT destroys the shortfall on a crash (the anti-hoarding rule)
  fuelPar: 0,         // FLMIN (:294) — "min fuel that should be used" = FLFACT(8) per game-second (A34573.1D:366)
  fuelLost: 0,        // FLDED (:284) — fuel the last crash destroyed (the "NN FUEL UNITS LOST" value)
  fuelLostTimer: 0,   // MSCNT1 — frames the fuel-lost message stays up after a crash (DEDCNT 127, :57)
  score: 0,           // SCORE (:296) — BCD in source, plain int here. STUB scoring: base
                      // POINTS × factor 1 (see beginOutcome); real TBSTFT[site] = GAMODE step

  // --- game clock (:271-293) -------------------------------------------------
  // GMTIME = the MM:SS the HUD shows; TIMVAL counts NMIs down to one game-second.
  // Ticked by tickClock() below (the source's NMI handler A34573.1D:360, PLAY only).
  clockSeconds: 0,    // GMTIME — seconds 0-59 (BCD in source)
  clockMinutes: 0,    // GMTIME+1 — minutes
  nmiCountdown: 250,  // TIMVAL (:271) — counts SECCNT NMIs down to the next second

  // --- scape scroll & zoom (:232-236) ----------------------------------------
  scrollX: 0,         // SCROLL (:234) — horizontal scape scroll, world DVG units
  scrollY: 0,         // SCRADD (:235) — vertical scape scroll (minor-view dead-zone)
  zoomedOut: true,    // LUNARNUM's V-bit (`SCAPE BIT LUNARNUM/BVS MAJOR` :1098):
                      // true = MAJOR (far/zoom-out), false = MINOR (near/zoom-in).
                      // Boots major (ATRINIT/REINIT :671-672).

  // --- game / difficulty / sequence -------------------------------------------
  gameMode: GameMode.IDLE,  // GAMODE (:196)
  difficulty: 0,      // PLYMOD (:201) — 0 Training … 3 Command (indexes the physics profiles)
  sequenceStep: 0,    // INDEX (:237) — the land/crash (later abort) sequence counter, 1→127
  collisionStatus: CollisionStatus.SAFE_FLY,  // this frame's verdict (COLFLG :243)
  frame: 0,           // FRAME (:443) — free-running per-tick counter (source INC FRAME each main loop);
                      //   drives the LOW-ON-FUEL blink (FRAME&10). NOT reset per drop.
  activeSites: [],    // TABSIT (:213) — the 4 designated site ranks that flash + pay a bonus this
                      //   drop (indices into landscape.sites); picked per drop by pickBonusSites (:609)

  // --- land/crash outcome (set by beginOutcome, read by the sequence + display) --
  outcomeStatus: CollisionStatus.SAFE_FLY,  // the latched verdict the sequence animates (M.CLFL :553)
  lastPoints: 0,      // points awarded by the last verdict (NUMB1 analog) — the "NN POINTS" line
  messagePick: 0,     // 0-3 outcome-message pick (RNDOM :1671)
  explosionPattern: 0,// 0-3 BOOM pattern pick (RNDOM at the BOOM setup)
};

// Scape / zoom geometry (research_physics.md §9/§9.1) — the single source for the
// dead-zone window, the zoom thresholds, and the transition ship-reset positions.
// Units are the logical/screen frame (= posX/posY, DVG Y-up). The zoom thresholds are
// ALTITUDE in world/native units: they map the source's SCPDST gates (YMJMIN 96
// major-units, YMISCR 520 minor-units) into one world scale — IN = 96×4, OUT = 520.
export const GEOM = {
  // All in LOGICAL (posX/posY) units = the source's "adjusted" figures × 4 (§9: adjusted
  // XMIN 32 ↔ logical 128). §9.1 quotes resets as the ÷4 adjusted values; ×4 back to logical.
  WIN_XMIN: 128, WIN_XMAX: 896,   // horizontal dead-zone (§9: XCURADJ+1∈[32,224] → logical [128,896])
  WIN_YMIN: 256, WIN_YMAX: 660,   // vertical dead-zone (minor), §9 [YMIMIN 256, YMIMAX 660] logical
  ZOOM_IN_ALT: 384,               // alt < this → zoom IN  (YMJMIN 96 major-units × 4)
  ZOOM_OUT_ALT: 520,              // alt ≥ this (+ascending+high) → zoom OUT (YMISCR 520 minor-units)
  ZOOM_IN_SHIP_X: 512,            // ship SCREEN pos after the zoom-IN snap (MINSTX/MINSTY,
  ZOOM_IN_SHIP_Y: 632,            //   §9.1 512/4·632/4 adjusted → ×4 logical)
  ZOOM_OUT_SHIP_X: 512,           // ship SCREEN X after the zoom-OUT snap (RMJRX, §9.1; Y is computed)
};

// Game-clock constants (A34573.1A :56/:59). One source frame = FRMECNT NMIs; one
// game-second = SECCNT NMIs. Keeping the countdown in NMI units (decrement FRMECNT
// per 24 ms tick) makes the second boundary land exactly where the hardware's does.
const SECCNT = 250, FRMECNT = 6;
const FUEL_PAR_RATE = 8;   // FLFACT (:58) — the par fuel a mission "should" burn per game-second
const DEDCNT = 127;        // DEDCNT (:57) — frames the crash "FUEL UNITS LOST" message stays up

// PLYINIT bonus-site pick (:609-627) — ported faithfully. `INTCNT` (the free-running interrupt
// counter, :257/:339) seeds a deterministic-but-timing-varied pick with a FIXED structure that
// gives every drop two easy + two hard bonuses AND a stable geometry (this is what makes the MAME
// `5X 5X 2X 2X` layout):
//   TABSIT[0] = INTCNT & 3               — a low-band 2X site (0-3)
//   TABSIT[1] = (TABSIT[0] + 1) & 3      — the NEXT low index: two ADJACENT 2X pads
//   TABSIT[2] = BNSITE((INTCNT>>2)&F)    — a high-band site (4-14), 15→4 clamp (:617-621)
//   TABSIT[3] = BNSITE(TABSIT[2] ^ 0x0F) — the COMPLEMENT: the two high pads land spread apart
// We use `state.frame` (our free-running per-tick counter, source INC FRAME :443) as the INTCNT
// analog — timing-varied, faithful in effect (labeled: FRAME ticks at 41.7 Hz vs INTCNT's 250 Hz;
// only the seed cadence differs, not the pick structure). `MAXSITE=4` (:1925). This REPLACES an
// earlier "2 random-distinct per band" pick, which dropped the adjacent-low + complementary-high
// structure (so its pads clustered wrong — see research_physics.md §11.3).
function bnsite(v) {                                // BNSITE :675 — map a <4 value up into the high band
  return v >= 4 ? v : ((v + 1) | 0x0A);            //   (ADC I,1 ; ORA I,0A)
}
function pickBonusSites() {
  const seed = state.frame;                         // INTCNT analog (free-running, timing-varied)
  const s0 = seed & 3;
  const s1 = (s0 + 1) & 3;
  let hi = (seed >> 2) & 0x0F;
  if (hi === 0x0F) hi = 4;                           // PLYINIT :617-621 — 15 maps to 4
  const s2 = bnsite(hi);
  state.activeSites = [s0, s1, s2, bnsite(s2 ^ 0x0F)];
}

// Advance the game clock one tick, PLAY only (the source's NMI increment, D:360).
// nmiCountdown counts down SECCNT NMIs; on rollover, seconds++ (minute carry).
// Minutes cap at 99 to stay in the 2-digit MM field. Each whole game-second also grows
// the fuel par FLMIN by FLFACT (A34573.1D:366) — the baseline DEDUCT measures hoarding against.
export function tickClock() {
  state.nmiCountdown -= FRMECNT;
  if (state.nmiCountdown > 0) return;
  state.nmiCountdown += SECCNT;
  state.fuelPar += FUEL_PAR_RATE;   // FLMIN += FLFACT per game-second (A34573.1D:366-375)
  if (++state.clockSeconds >= 60) { state.clockSeconds = 0; if (state.clockMinutes < 99) state.clockMinutes++; }
}

// The zoom state (LUNARNUM V-bit): true ⇒ MAJOR (zoom-out) scape is displayed.
export const isMajor = () => state.zoomedOut;

// PLAY = a mission in flight (vs attract/idle/outcome).
export const isPlaying = () => state.gameMode === GameMode.PLAY;

// The LAND/CRASH outcome sequence is running.
export const isOutcome = () => state.gameMode === GameMode.OUTCOME;

// The camera. Atari model: the lander moves within its screen window and the WORLD
// SCROLLS (scrollX/scrollY). These are the shared camera *values*; the DVG→screen
// transform math lives in render.js (the render seam).
//   scale = DVG units → screen px. Major/zoom-out ≈ 0.25 (fits the 4096-wide
//   loop into the 1024 screen); minor/zoom-in ≈ 1 (close-up). See
//   research_vector_usage.md §3.1 and the landscape.js ¼ derivation.
export const camera = {
  x: 0,               // world DVG X shown at the screen's left edge
  y: 0,               // world DVG Y shown at the screen's bottom edge
  scale: 0.25,        // major/zoom-out default
};

// New Game — the IDLE→PLAY lifecycle transition (the PLYINIT analog, :609-673).
// Every "big" state reset lives HERE (one findable place) so external modules don't
// scatter state writes. All seed values are the source's own (research_physics.md §14).
//
// INTXCUR/INTYCUR (:3747-8) store the ADJUSTED-window position ×$40 (×64), so the logical
// seed is (64, 682) DVG **Y-UP**. The source draws the ship at XCURR/YCURR = XCURADJ>>6
// (POSTMOD/ROTATE :1295/:2019) = that same (64, 682) — i.e. the ×$40 form shifted back down,
// so our un-scaled posX/posY ARE the screen point. (64, 682) is upper-LEFT, near the top of the
// 768 field: the ship enters top-left (lying on its side, §14) and drifts in — it is NOT centred
// (SCAPCHG dead-zone window, physics_arcade). The renderer flips Y→canvas at draw (SCREEN_H − y).
const INIT_X = 64, INIT_Y = 682;    // INTXCUR/INTYCUR ÷ $40 — source start position, DVG/screen (Y-up)

// Seed the FLIGHT state (position, velocity, attitude, scape) to the play-start —
// shared by newGame (fresh game) and resetFlight (off-top-of-major restart). Does NOT
// touch score / clock / fuel — those are the caller's to set/keep.
//
// INVELX/INVELY (:3749-50, hex) → velX/velY (PLYINIT :628-636); REINIT clears the sign
// bytes → both POSITIVE = rightward / up (SCAPCHG :2683/:2703). Source 16-bit units
// (screen px = velocity/16384/tick): velX 12800 ⇒ ~0.78 px/tick rightward drift; velY 16
// is a negligible up-seed (~0.001 px/tick) gravity (−17/tick) overtakes on frame 1.
function seedFlight() {
  state.velX = 0x3200;   // INVELX = $3200 = 12800 — initial rightward drift (the ship enters and drifts in)
  state.velY = 0x10;     // INVELY = $0010 = 16     — ~0 vertical; descent begins immediately
  state.thrustLevel = 0; state.throttle = 0;   // throttle level 0-15 (dialed by ↑/↓); starts at idle
  state.shipRotation = 16;           // ON ITS SIDE, heading right (PLYINIT :651, decimal 16);
                                     // upright is 8 — the ship enters sideways and the
                                     // player rotates it upright (MAME-confirmed; §14).
  state.angularVelocity = 0;         // no rotational momentum at start
  state.posX = INIT_X;
  state.posY = INIT_Y;
  state.scrollX = 0; state.scrollY = 0;  // scape scroll cleared (REINIT :657)
  state.sequenceStep = 0; state.collisionStatus = CollisionStatus.SAFE_FLY;
  state.zoomedOut = true;            // major / zoom-out (boots high; REINIT :672)
  // PLYINIT clears the mission clock + fuel accounting every drop (:640-644, the Y=7 clear loop
  // over GMTIME + FLMIN + FLUSE). So each drop is timed and fuel-scored on its own; the re-drop
  // path (finishOutcome / off-top) runs through PLYINIT too, so it resets here, not just at newGame.
  state.clockSeconds = 0; state.clockMinutes = 0; state.nmiCountdown = 250;
  state.fuelUsed = 0; state.fuelPar = 0;
  pickBonusSites();                  // fresh 4 bonus sites this drop (PLYINIT :609-627)
  state.gameMode = GameMode.PLAY;    // (PLYINIT :646)
}

export function newGame(settings) {
  state.difficulty = settings.difficulty;
  state.fuel = settings.startFuel;
  state.score = 0;                  // fresh score (DOGAME RTP-init :351-352; PLYINIT itself keeps it)
  state.fuelLost = 0; state.fuelLostTimer = 0;   // no stale fuel-loss message on a brand-new game
  seedFlight();                     // PLYINIT also clears the clock + fuel par/used (see above)
}

// Off-top-of-major restart (SCAPMJR INTWAIT→DEDCTA→PLYSTRT :2837-2841): deduct fuel,
// reseed the flight, but KEEP score + clock. (Minimal — the full PLYSTRT/GAMODE cycle
// is the state-machine step; here it just re-drops the ship into the major view.)
export function resetFlight(fuelPenalty = 0) {
  state.fuel = Math.max(0, state.fuel - fuelPenalty);
  seedFlight();
}

// Reset to the boot / attract stage (isPlaying() → false; SPACE re-launches). The
// PLAY→IDLE lifecycle transition; the caller (main.js) re-frames the camera to major.
export function toIdle() {
  state.gameMode = GameMode.IDLE;
  state.scrollX = 0; state.scrollY = 0;
}

// Hard-landing bounce seed (:577-578): the source stores M.HRDY = 10 into the
// velocity HIGH byte → 10·256 in our 16-bit units. Upward — the craft pops off
// the ground; BOUNCE_GRAVITY (main.js, M.HRDG) then pulls it back down.
const BOUNCE_VELOCITY = 10 * 256;

// DEDUCT (:1816-1859) — a CRASH destroys the fuel you were hoarding below par. Only crashes
// deduct: COLFLG's low nibble is 0 on a landing (80 good / C0 hard) and F on a crash (8F), so
// `& 0x0F` gates it (:1817-1818). Loss = fuelPar − fuelUsed (how far under the 8/sec par you
// flew this drop), capped at 99 (:1832) and at the fuel actually present (:1849-1852); it feeds
// the "NN FUEL UNITS LOST" message (FLDED/MSCNT1). Fly economically then crash → you lose your
// reserve; fly at/over par → nothing lost. (Source keeps FLMIN/FLUSE in BCD; we hold both float.)
function deductFuel(status) {
  if ((status & 0x0F) === 0) { state.fuelLost = 0; return; }   // no deduct on a landing (:1817-1818)
  let lost = Math.floor(state.fuelPar - state.fuelUsed);
  if (lost <= 0) { state.fuelLost = 0; return; }               // used ≥ par → nothing destroyed (:1830)
  lost = Math.min(lost, 99);                                   // MAX FUEL LOST = 99 (:1832-1833)
  lost = Math.min(lost, Math.floor(Math.max(0, state.fuel)));  // can't lose more than present (:1849-1852)
  state.fuel = Math.max(0, state.fuel - lost);
  state.fuelLost = lost;                                       // FLDED — the message quantity (:1853)
  state.fuelLostTimer = DEDCNT;                                // MSCNT1 — show it for 127 frames (:1857)
}

// The verdict fired — enter the LAND/CRASH outcome mode (the PLYCHK collision
// path, :551-581): score, bonus fuel, sequence setup. main.js then runs the
// MOTCHK sequence (INDEX clock + hard bounce) each tick until finishOutcome.
export function beginOutcome(status, siteFactor = 1) {
  const good = status === CollisionStatus.GOOD_LAND;
  // Scoring (LNDADR :1863 + POINTS :3311): base 50 good / 15 hard / 5 crash × the site's TBSTFT
  // factor. `siteFactor` (1..5) is the multiplier of the ACTIVE bonus site under the landing X,
  // computed by main.js from landscape.siteAt + state.activeSites (1 = not on an active site, the
  // LNDADR default :1898). Applies to every outcome — the source scores base×factor for crashes
  // too (POINTS reads COLFLG for the base; LNDADR runs on any COLFLG bit-7).
  const base = good ? 50 : (status === CollisionStatus.HARD_LAND ? 15 : 5);
  const points = base * siteFactor;
  state.lastPoints = points;
  state.score += points;
  if (good) state.fuel += 50;              // BNFUEL — good landings only (:554-558)
  deductFuel(status);                      // DEDUCT — a crash destroys hoarded fuel (:559)
  state.outcomeStatus = status;            // keep the verdict for the sequence (M.CLFL :552-553)
  state.messagePick = Math.floor(Math.random() * 4);       // RNDOM message pick (:1670-1672)
  state.explosionPattern = Math.floor(Math.random() * 4);  // RNDOM explosion pattern (BOOM setup)
  // The :561-571 zero loop — velocities, thrust, collision flag:
  state.velX = 0; state.velY = 0; state.thrustLevel = 0; state.throttle = 0;
  state.collisionStatus = CollisionStatus.SAFE_FLY;
  // The source seeds the bounce velocity unconditionally (:577-578) but only the
  // hard path consumes it (MOTCHK gates on M.CLFL bit 6); we seed only then so
  // the HUD speed reads live 0s otherwise.
  if (status === CollisionStatus.HARD_LAND) state.velY = BOUNCE_VELOCITY;
  state.gameMode = GameMode.OUTCOME;       // ASL GAMODE: play → land/crash (:574)
  state.sequenceStep = 1;                  // sequence counter start (INDEX :575-576)
}

// Sequence end — the step counter ran past 127 (MOTCHK :525-529). Interim mission
// cycle (the full DOGAME machine is the GAMODE step): fuel left → a fresh drop into
// the major view (fuel/score/clock kept — the real game's continuing mission);
// tank empty → attract (the OUT OF FUEL → attract path).
export function finishOutcome() {
  state.outcomeStatus = CollisionStatus.SAFE_FLY;
  state.sequenceStep = 0;
  if (state.fuel >= 1) seedFlight();
  else toIdle();
}
