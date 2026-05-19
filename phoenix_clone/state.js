// Mutable game state. Field names mirror Phoenix source RAM labels where
// possible (research_code_flow.md §5.3, RAMUse.md). Game-object data lives
// on the objects themselves (research_rendering.md §4).

import { STATIC_TEXT_ROWS, GAME_OVER_TEXT } from './data.js';

export const state = {
    init() {
        // RAM-labeled fields ($43xx region)
        this.gameOrIntro          = 0;  // $43A2 — 0=intro (splash + attract demo), 1=P1 game, 2=P2 game; source label "GameOrAttract"
        this.gameAndDemoOrSplash  = 0;  // $43A3 — 0=P1, 1=P2 (selects active score row in state 1)
        this.gameState            = 0;  // $43A4 — 8-state machine
        this.counterA5            = 0;  // $43A5 — state-1 frame countdown
        this.counter9a            = 0;  // $439A — free-running frame counter
        this.counter98            = 0;  // $4398:$4399 — 16-bit free-running splash/attract-mode counter
        this.levelAndRound        = 0;  // $43B8 — low nibble = JT4 stage index

        // Source `$0350 GetPlayerLivesFromDip` reads DSW0 and picks one
        // of 3/4/5/6 lives. Port hardcodes 3 until DIP modeling lands.
        this.player1Lives = 3;          // $4390
        this.player2Lives = 0;          // $4391  (1P mode; P2 stays 0)

        // $4383-$4385 / $4387-$4389 — 3-byte packed BCD (low, mid, high).
        // Each byte holds two digits; PrintNumber ($00C4) draws low-nibble
        // first then high-nibble, walking screen-RAM left.
        this.score1 = [0, 0, 0];
        this.score2 = [0, 0, 0];

        // Per-stage block — mirror of $43AB-$43B6 (12 bytes), populated by
        // InitGlobalLevelData ($0580) on each state-2 entry. Decoded byte
        // roles in research_stage_structure.md §4.1; index 9 = CounterB4
        // (alien-stage countdown), index 11 = bird/mothership countdown.
        this.stageBlock = new Uint8Array(12);

        // $43BA AliensLeft / $43BB BirdsLeft. Drive scoring + the
        // less-than-5-aliens speed-up flag, but NOT stage-clear (that's
        // counterB4 / stageBlock[9]). Defaults are written by stage-clear
        // paths from T1760; new game starts in stage 0 with 16 aliens.
        this.aliensLeft = 0x10;
        this.birdsLeft  = 0;

        // Player ship — position is now reset by InitPlayerDataStructure
        // ($0547) on every state-2 entry. Tiles are the player-ship-intact
        // shape from $1770; color-map switches (#CM1 / #CM7) in the source
        // shape are ignored for now (uniform debug palette).
        // alive=false until a combat stage handler (L2000/L3400) runs the
        // PlayerUpdate path. Mirrors source: state-2 init writes the player
        // data structure but doesn't draw; only PlayerUpdate ($0876, called
        // from L2000 and L3400) draws the ship. So during boot, score-flash,
        // state-2 init, and stage-0 fade-in (L0834 — no PlayerUpdate call)
        // the ship stays invisible. It first appears when stage 1 combat
        // begins.
        //
        // Tiles are T1400 frame #1 (`30 31 / 40 41`) — the bare regular
        // ship sprite, 2×2 = 16w × 16h. The 4×4 / 32-pixel block at T1770
        // is the SHIELDED variant; the source draws shields as a separate
        // overlay via DrawShields ($0AA0) only when the shield counter is
        // active. Source's PlayerShape = $10 (T0560 byte 1) selects T1400
        // frame #5 to handle X & 7 sub-pixel shifting; we drop that here
        // and always use frame #1 since canvas drawImage takes integer X/Y
        // (research_rendering.md §2.2).
        this.player = {
            x: 0,
            y: 0,
            alive: false,
            w: 16,
            h: 16,
            tiles: [0x30, 0x31, 0x40, 0x41],
            // $43A6 ShieldCount — 255 frames (~4.25 s) when shield is active.
            shieldCount: 0,
            // Mirror of $43C4-$43C7 PlayerBulletState/Shape/X/Y.
            // active mirrors bit3 of PlayerBulletState; tile is fixed $50
            // (T1620[0]) — source selects T1620[X%8] for sub-pixel shifting
            // but the canvas port skips pre-shifted variants (same decision
            // as player ship tiles).
            bullet: { active: false, x: 0, y: 0, tile: 0x50 },
        };

        // Enemy bullets — 5 slots, mirror of $43CC-$43DF (4 bytes per slot:
        // State, Shape, X, Y). research_enemy_motion.md (step 9 work) and
        // RAMUse.md $43CC-$43DF. Source spawns bullets via L25E0; they fall
        // at y += 4 per EnemyBulletUpdate tick (L0C84). `state` mirrors bit 3
        // of the source $08-flag (active when set); `shape` is a tile code
        // in $58-$5F (animation toggles bit 2 between $58/$5C, etc.).
        // Inactive slots stay at state=0 and are skipped by render.
        this.enemyBullets = Array.from({ length: 5 }, () => ({
            state: 0,    // $43CC+i*4
            shape: 0,    // $43CD+i*4
            x: 0,        // $43CE+i*4
            y: 0,        // $43CF+i*4
        }));

        // Alien-kill explosion slots — 2 slots, mirror of $4370/$4374
        // (4 bytes each: counter, score-BCD, MSB, LSB). research note for
        // step 10. L38F8 allocates the first slot whose counter==0;
        // L0FC0 / L0FD8 animates each non-zero slot down to 0 (counter--
        // each tick, tile lookup via T17B0[(counter & 0x0E) >> 1]).
        // Port maps the MSB/LSB screen-RAM pair to canvas (x, y) of the
        // sprite top-left, since canvas draws by pixel coords directly.
        // Bonus explosion slots ($4378/$437C) used by birds and mothership
        // are intentionally not modeled here — that's step 11 territory.
        this.explosions = Array.from({ length: 2 }, () => ({
            counter:  0,  // $4370 / $4374 — 0 = slot free
            scoreBcd: 0,  // $4371 / $4375 — BCD score (last digit always 0)
            x: 0,         // port mirror of $4372/$4373 MSB:LSB → canvas X
            y: 0,         // port mirror of $4372/$4373 MSB:LSB → canvas Y
            // Frame LSB chosen this tick by explosionUpdate (=T17B0[idx]).
            // Stored so drawExplosions reads the PRE-decrement tile lookup,
            // matching source L0FDB→L0FE6 (save counter, then DEC, then use
            // the saved value for the T17B0 lookup). Not a source-mirrored
            // field — port-only bookkeeping.
            frameLsb: 0,
        }));

        // Bonus explosion slots — 2 slots, mirror of $4378/$437C. Source
        // routes 200-pt kills here (alien path byte 7 or 8 at hit time,
        // see L0C00); the bonus slot animates a 6×2 sprite (T17D0 left
        // half + T17D6 right half) and overlays the BCD score digits in
        // the middle (T17D6's $C3 placeholder tiles) via L37B0. Counter
        // starts at $10 (16 ticks vs alien slot's $0C = 12). Step 10.7.
        //
        // Same field shape as state.explosions; no `frameLsb` field needed
        // because the bonus sprite isn't a counter-indexed cycle — the
        // sprite tiles are constant (T17D0 + T17D6), only the score
        // digits overlay them. drawBonusExplosions reads scoreBcd
        // directly each frame.
        this.bonusExplosions = Array.from({ length: 2 }, () => ({
            counter:  0,  // $4378 / $437C — 0 = slot free
            scoreBcd: 0,  // $4379 / $437D — BCD score (last digit always 0)
            x: 0,         // port mirror of $437A/$437B MSB:LSB → canvas X
            y: 0,         // port mirror of $437A/$437B MSB:LSB → canvas Y
        }));

        // 16 alien slots, mirror of $4B70-$4BAF (4 bytes per alien:
        // controlA, controlB, X, Y). InitAlienControlStates ($05EC) sets
        // controlA/B from T1500; InitAlienPositions ($0610) sets x/y from
        // the T1540+ formation table chosen via T063A. controlA bit 3 =
        // draw-enabled; bits 0-2 dispatch the draw-mode (1×1 / 2×1 / 1×2 /
        // 2×2) per Bit3Controller ($0740) and T0759. See gfx.js / render.js.
        this.aliens = Array.from({ length: 16 }, () => ({
            x: 0, y: 0, controlA: 0, controlB: 0, alive: false,
        }));
        // Per-alien movement-pattern pointer (mirror of $4B50-$4B6F, 2
        // bytes per alien). Copied from T1520 by $0650 each state-2.
        // Stored as a 16-bit ROM address (high byte from T1520[i*2], low
        // byte from T1520[i*2+1]); AlienMovementUpdate ($0D1C) walks
        // MOTION_PATH_BASE at offset (ptr - 0x1000), advancing one byte
        // per 8-px grid crossing. End-of-list (path byte = 0) resets to
        // (alienPathSeedHi, alienPathSeedLo) below — see L0DDE.
        this.alienMovePtr = new Uint16Array(16);

        // L2000 4-frame round-robin counter — mirror of ($435F & 3).
        // Each combat-stage frame increments and dispatches a different
        // sub-set of work (research_enemy_motion.md §1):
        //   lane 0: draw + behavior + alien-vs-player collision
        //   lane 1: enemy bullets + AlienMovementUpdate
        //   lane 2: AlienAnimationUpdate + L2560 (enemy fire trigger)
        //   lane 3: enemy bullets + L0A6C + L0FC0
        // Step 6 only runs lanes 1 and 2 (motion + anim).
        this.combatLane = 0;

        // Path-list reset target — mirror of $4394 (MSB) / $4395 (LSB).
        // L0DDE writes these into a per-alien path pointer when its
        // current path byte is 0 (end-marker). Init'd at state-2 end by
        // copying the high byte of alienMovePtr[0] (= T1520[stage*2])
        // and clearing the low byte — mirrors L0506 ($0506-$0513).
        // For all stages T1520 = (0x10, 0x00), so the seed always points
        // at T1000 / MOTION_PATH_BASE[0]. AlienBehaviorUpdate ($3000 —
        // deferred) is what would mutate these to redirect aliens onto
        // a swoop pattern; with $3000 unported, the seed is constant.
        this.alienPathSeedHi = 0x10;
        this.alienPathSeedLo = 0x00;

        // AlienBehaviorUpdate ($3000) state — mirrors $4393/$4350-$4357 region.
        // Initialised to 0 in state-2 init ($32B0 clears $4350-$437F).
        // research_enemy_motion.md §6.
        this.counter93           = 0;   // $4393 — incremented every lane-0 tick
        this.alienBehaviorState  = 0;   // $4350 — 0=idle,1=triggered,2=count,3=alien,4=angry-ready,5=pattern,6=scan-done
        this.alienSwoopPatternHi = 0;   // $4351 — MSB of chosen swoop pattern address
        this.alienSwoopPatternLo = 0;   // $4352 — LSB of chosen swoop pattern address
        this.alienSwoopCount     = 0;   // $4353 — number of aliens to swoop this cycle
        this.alienSwoopTarget    = 0xFF;// $4354 — chosen alien index (0xFF = none)
        this.alienSwoopLsb       = 0;   // $4356 — saved old $4395 used for commit match
        this.alienPhaseCount     = 0;   // $4357 — angry-pattern fire count (0-3 max per round)
        this.alienPhaseTimer     = 0;   // $4358 — angry-pattern countdown; 0 = needs init
        this.alienCooldown       = 0;   // $4355 — primary swoop cooldown; 0 triggers L30E4 reseed
        // L30BA secondary cooldown timers — three independent decrementing slots that
        // gate the C-rotation in L3112 during L30E4 reseed. Each starts at 0 (L32B0
        // zero-fill); L3112 seeds one of them to 12 per reseed when their slot is 0.
        this.alienCooldownTimer1 = 0;   // $4359
        this.alienCooldownTimer2 = 0;   // $435A
        this.alienCooldownTimer3 = 0;   // $435B

        // 8 bird slots, mirror of $4B70-$4BAF (8 bytes per bird). Init'd by
        // $32B0 at state-2 tail when LevelAndRound bit 2 selects a bird stage
        // (4-7). Per-byte semantics in research_bird_stage.md §2.3:
        //   +0 shape       — maturity-payload as shape-index (0 = slot empty,
        //                    1..F = T3F00-dispatched shape, init from table = $01)
        //   +1 screenMsb   — MSB of screen-RAM address for top tile
        //   +2 screenLsb   — LSB of screen-RAM address (advanced when bird scrolls)
        //   +3 field3      — uncertain; RAMUse marks ?, no writers found in
        //                    walked paths. Init from table = $00 for all 16 entries.
        //   +4 advanceCtr  — maturity-advance gate counter ($35B0 decrements;
        //                    each maturity-advance routine fires when this hits 0
        //                    AND the relevant preconditions hold)
        //   +5 gridX       — bird X coord (init from table)
        //   +6 field6      — uncertain; init from table = $00 or $10 depending
        //                    on bird index. Possibly a flags / direction byte.
        //   +7 gridY       — bird Y coord (init from table)
        // research_bird_stage.md §1 (combat dispatch), §2 (init), §4 (maturity).
        this.birds = Array.from({ length: 8 }, () => ({
            shape: 0,
            screenMsb: 0,
            screenLsb: 0,
            field3: 0,
            advanceCtr: 0,
            gridX: 0,
            field6: 0,
            gridY: 0,
        }));

        // $4368 M4368 — flock-wide bird-maturity bitfield. Cleared by $32B0
        // zero-fill of $4350-$437F at state-2 init. OR'd progressively to
        // $0F by the four maturity-advance routines L36D2/EA/0A
        // (research_bird_stage.md §4); reset to $00 by $3A37 on every kill.
        // Stays at 0 outside bird stages (no advance path runs).
        this.maturity = 0;

        // $4368-$436F port mirrors — shared bird-randomizer outputs from
        // $3560, consumed by $35E0 motion ($436E used as shape candidate;
        // $436D used in screen-RAM math) and the $370A maturity-advance
        // gate ($436F & E mask). Cleared by $32B0's zero-fill. Only the
        // bird-stage code paths read/write these; alien stages don't run
        // $3560. research_bird_stage.md §3, §4.
        this.m436D = 0;   // $436D — (T3E80[idx+1] + (rnd<<2)) & $F8
        this.m436E = 0;   // $436E — T3E80[idx] (shape candidate)
        this.m436F = 0;   // $436F — bit-mixed PRNG (gates $370A override)

        // L2000 depleted-formation sticky flag — mirror of $435E.
        // Source L2017-L202A: when AliensLeft<5 and the masked counter is 0,
        // latch $435E := $FF. Once set, dispatch goes via L2146 (2-state
        // bit-0 cycle) instead of L2130 (4-state full-formation), packing
        // movement and behavior twice as often. Cleared by L32B0 (state-2
        // init zero-fills $4350-$437F).
        this.aliensLeftFlag = 0;        // $435E

        // $43A7 AnimationCounter — used by $2322 mothership antenna/pilot
        // animation: ticked each call, bits 0-2 select the 8-frame cycle
        // (frame data at T1BC0 + (m43A7 & 7) * 8). Wraps freely modulo 256.
        this.m43A7 = 0;

        // $43AA M43AA — mothership-stage cadence counter, incremented
        // by motherShipBgUpdate ($24C4) on each call (= 30 Hz from
        // alien-combat lane round-robin during stage B). Drives the
        // 4-frame split between belt animation (when m43AA & 3 == 0)
        // and antenna/pilot animation (other 3 frames). Also gates the
        // mothership scroll inside $24E0 by (m43AA & $0F) == 0.
        // Cleared at cold-start ($0154 init range).
        this.m43AA = 0;

        // $439C — spiral-fill animation counter, ticked by stageSpiralFill
        // ($2230) at stages 4/6/8. Source uses it as a shared general-purpose
        // counter elsewhere too; port keeps it dedicated to spiral-fill
        // since no other ported routine reads/writes it currently. Reset to
        // 0 on spiral-fill exit (port deviation; source leaves it as-is).
        this.spiralFillCounter = 0;

        // FG-plane overlay map: "x,y" → tile code. Currently populated only
        // by spiral-fill's per-position cell writes (asterisk `$1F` during
        // phase 1, deleted on phase 2 erase). render.drawSpiralOverlay
        // draws each entry on top of all other FG content. Empty during
        // normal play; matches source's "spiral overlay covers score
        // during transition" visual.
        this.fgOverlay = new Map();

        // BG tile plane — 26 cols × 33 rows (1 extra "hidden" row at the
        // top, above the visible area). research_hardware.md §4 describes
        // the source's two independent tile planes (FG and BG each 32×26
        // visible tiles). The port adds one extra row at index 0 that
        // sits at canvas y = -8..-1 + scrollPixel — fully off-screen at
        // scroll boundary, partially revealed as scroll progresses. The
        // row-fill in starsScrollDown writes into this hidden row, then
        // the buffer rotates by one row when scrollPixel crosses 8 → the
        // fresh content scrolls into view from the top without the user
        // ever seeing the fill or erase. Port-only design choice (source
        // uses 32 rows and the user sees the erase artifact briefly at
        // display row 0).
        // tile === 0 → transparent (skip drawImage).
        this.bgTiles = new Uint8Array(26 * 33);

        // $43B9 CounterB9 — 8-bit backwards-counting frame counter,
        // decremented by StarsScrollDown ($067A) each fade-in frame.
        // Written verbatim to the BG scroll register ($5800 mirror →
        // bgScrollY). Wraps freely modulo 256.
        this.counterB9 = 0;            // $43B9
        this.bgScrollY = 0;            // $5800 scroll register (legacy mirror; not consumed by drawBackground in the 33-row design)

        // Per-pixel scroll offset within the current 8-pixel tile-row band.
        // Starts at 0 at the moment a row-shift+refill happens; increments
        // by 1 each scroll tick; resets to 0 on the next 8-tick boundary.
        // drawBackground draws bgTiles[r] at canvas y = (r-1)*8 + scrollPixel.
        this.scrollPixel = 0;

        // Cold-init mirror of $0008 → $0050 → $01D0 (research_code_flow.md §1).
        // The 8085 boot sequence clears VRAM/scroll/sound regs (no-op in port —
        // canvas-clear-per-frame replaces the VRAM model; sound regs not yet
        // wired) and then calls PrintTextLines on T1800 to lay down the three
        // score/coin rows. In the port that "PrintTextLines" reduces to copying
        // the parsed records (STATIC_TEXT_ROWS in data.js, T1800 in source)
        // into the object-list as static FG rows. See research_rendering.md §4.3.
        this.staticTextRows = STATIC_TEXT_ROWS.map(r => ({ ...r, w: 208, h: 8 }));

        // T1A00 — "GAME OVER" row, drawn by render.frame() only while
        // gameState === 5 (per source $0B95 PrintTextLines inside L0B60).
        // Single row (GAME_OVER_TEXT is a 1-element array from build_data.py).
        this.gameOverRow = { ...GAME_OVER_TEXT[0], w: 208, h: 8 };
    },
};
