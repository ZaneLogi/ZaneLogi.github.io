// Bird-stage subsystem — extracted from states.js.
// L3400 (stageBirdCombat) + $3462 (stageBirdClear) + $32B0 (initBirdData).
// research_bird_stage.md covers the full dispatch structure and motion engine.

import { state } from './state.js';
import { scoring } from './scoring.js';
import {
    ALIEN_BIRD_PARTITION, // source T1760 — used by stageBirdClear
    BIRD_INIT_TABLE,
    BIRD_T3E80,
    BIRD_T3F00,
    BIRD_T3EC0,
    BIRD_T3DC0,
    BIRD_T3DB8,
} from './data.js';

// AABB overlap test (research_rendering.md §6.1).
// Duplicated here from states.js because birdBulletCollision and
// birdVsPlayerCollision both use it; aabbHit is removed from states.js
// once all bird methods move here.
function aabbHit(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export const birdMixin = {
    // $32B0 ports — clears all 8 bird struct slots, then on bird stages
    // (BirdsLeft > 0) copies the last `birdsLeft` 8-byte rows from the
    // selected init table into the corresponding bird slots. Selection:
    //   bit 1 of LevelAndRound == 0 → T3F80 (bird wave 1, stages 4/5)
    //   bit 1 of LevelAndRound == 1 → T3FC0 (bird wave 2, stages 6/7)
    // The "trailing slots" behaviour is source-faithful: surviving birds
    // re-spawn at the table-tail positions, dead birds stay at struct head
    // as zeros (an edge case in practice — $2204 resets BirdsLeft to 8 at
    // every transition, so this only matters at cold start with a custom
    // BirdsLeft, e.g. debug-start). research_bird_stage.md §2.
    initBirdData() {
        // Clear all 8 birds and the maturity byte ($4368). Source zeroes
        // these unconditionally before the BirdsLeft check.
        for (const b of state.birds) {
            b.shape = 0; b.screenMsb = 0; b.screenLsb = 0; b.field3 = 0;
            b.advanceCtr = 0; b.gridX = 0; b.field6 = 0; b.gridY = 0;
        }
        state.maturity = 0;

        if (state.birdsLeft === 0) return;

        // Table base: bit 1 of LevelAndRound picks which 64-byte half of
        // BIRD_INIT_TABLE to copy from (see comment above).
        const tableBase = (state.levelAndRound & 0x02) ? 64 : 0;
        // Trailing-slot offset: $4B70 + (8 - birdsLeft)*8 in source; mirror
        // by indexing into `state.birds` starting at `8 - birdsLeft`.
        const slotBase  = 8 - state.birdsLeft;
        for (let i = 0; i < state.birdsLeft; i++) {
            const b = state.birds[slotBase + i];
            const off = tableBase + (slotBase + i) * 8;
            b.shape      = BIRD_INIT_TABLE[off + 0];
            b.screenMsb  = BIRD_INIT_TABLE[off + 1];
            b.screenLsb  = BIRD_INIT_TABLE[off + 2];
            b.field3     = BIRD_INIT_TABLE[off + 3];
            b.advanceCtr = BIRD_INIT_TABLE[off + 4];
            b.gridX      = BIRD_INIT_TABLE[off + 5];
            b.field6     = BIRD_INIT_TABLE[off + 6];
            b.gridY      = BIRD_INIT_TABLE[off + 7];
        }
    },

    stageBirdClear() {
        if ((state.counter9a & 1) !== 0) return;   // odd parity: nothing

        // Residual physics during the pause.
        this.enemyBulletUpdate();
        this.explosionUpdate();
        this.bonusExplosionUpdate();

        // L2204 countdown.
        const cnt = (state.stageBlock[11] - 1) & 0xFF;
        state.stageBlock[11] = cnt;
        if (cnt >= 0xA0) return;

        state.gameState = 2;
        state.player.shieldCount = 0;
        state.levelAndRound = (state.levelAndRound + 1) & 0xFF;
        // (Stop-gap removed in 12.10 — stages 8-B are all reachable now.)

        const waveIdx = (state.levelAndRound >> 1) & 7;
        const waveByte = ALIEN_BIRD_PARTITION[waveIdx];
        if (waveByte & 0x80) {
            state.birdsLeft  = waveByte & 0x7F;
            state.aliensLeft = 0;
        } else {
            state.aliensLeft = waveByte;
            state.birdsLeft  = 0;
        }
    },

    // L3400 — bird-combat handler for JT4 stages 5 and 7.
    // research_bird_stage.md §1 (dispatch structure).
    //
    // Architectural note: $3400 is NOT a Counter93 lane round-robin like
    // $2000 (alien combat). It runs a fixed call sequence at the top, then
    // forks on `BirdsLeft`:
    //   - == 0  → $3462 stage-clear tail (residual physics + countdown).
    //              Deferred to step 11.5; for now we just stop work and let
    //              the global stop-gap wrap LR. With no hit detection yet
    //              (step 11.4), this branch is unreachable in normal play.
    //   - <  4  → both half-flock updates every frame (analogue of the alien
    //              `AliensLeft<5` speed-up, but implicit from the count).
    //   - >= 4  → split into two halves by `Counter9A+1` bit 0 (= 30 Hz per
    //              half-flock). Even parity: birds 0..3 + bullets. Odd
    //              parity: birds 4..7 + explosion animation tick.
    //
    // 11.2 scope = dispatch skeleton + player render. The per-bird update
    // engine (drawFirst4/Second4 bodies, $3560 randomizer, $3498/$34AA
    // L35B0 dispatch, $3930 player-relative scan, $3800 collision) is
    // **stubbed** here as TODO comments — birds will appear as static
    // placeholder tiles via render.drawBirds() until step 11.3 wires up
    // the movement/animation engine.
    stageBirdCombat() {
        // $3400 head — every frame regardless of BirdsLeft.
        state.player.alive = true;
        this.playerUpdate();                          // L0876
        // $3403 / $3409 — bird collision detection (source calls $3800
        // twice, before and after $2600). The port collapses to a single
        // call: $2600 is mostly NOP'd in source and the port doesn't
        // touch the bird positions between the two scans, so the second
        // call would always re-scan the same positions.
        this.birdBulletCollision();                   // $3800
        // $2600 — port-side approximation. Source's `$2600` builds an
        // adjusted CounterB9 value and writes it to the `$5800` BG
        // scroll register. The hardware shifts the entire BG plane;
        // since birds in source are drawn to BG memory, they scroll
        // with it. Crucially, source has TWO paths:
        //   - main ($2618-$2649): `CounterB9 -= D` (scroll down)
        //   - alt  ($2650-$2662): `CounterB9 += T3ED0[...]` (scroll up)
        // The path is chosen by comparing M4BD1 vs M4BD3 (extended bird
        // storage maintained by `$26D0`/`$26AA`/`$2668`). The net effect
        // is a back-and-forth oscillation of the scroll register —
        // birds visibly bob up AND down, not just descend monotonically.
        //
        // Port-side simplification: instead of porting the full M4BD0+
        // extended-storage state machine (~50 lines), use bit 6 of
        // Counter9A's low byte as a coarse direction toggle. Bit 6
        // flips every 64 frames (~1 sec at 60 Hz), so counterB9 walks
        // ±64 around a center value, producing ~2-second
        // up-down-up-down cycles that visually approximate the source's
        // oscillation. With the M4BD0+ state machine, source's exact
        // amplitude / period differ but the visual character (bobbing
        // birds) is preserved.
        //
        // Bird stages in arcade Phoenix have NO visible starfield, no
        // planets, no galaxies — so we DON'T call `bgUpdate` here
        // (which would write those into bgTiles). bgTiles stays at the
        // zeros from state-2 init → solid black BG.
        // research_bird_stage.md §10 item 6 (closed, port-side).
        // Bird-count-dependent scroll, mirroring source's $2476 reseed
        // where M4BD1 grows with `(8 - BirdsLeft)`. Larger M4BD1 →
        // main path (DOWN/decrement) fires more aggressively → larger
        // scroll amplitude. So full flock = small bounded oscillation;
        // last bird = continuous downward drift.
        //
        // Port simplification (not the full $2600 state machine — see
        // research_bird_stage.md §10 item 12):
        //   BirdsLeft >= 2: counterB9 oscillates in signed [-SCROLL_MAX..0]
        //                   (downward bob only — render.drawBird handles
        //                   wrap via split-draw when baseY >= 240).
        //   BirdsLeft == 1: counterB9 decrements monotonically each
        //                   frame → continuous downward scroll. The
        //                   last bird visually exits the bottom edge
        //                   and re-emerges from the top via split-
        //                   draw, cycling forever until killed.
        //
        // SCROLL_MAX = 100 keeps all 8 birds visible: bird 7 (top row)
        // baseY ∈ [0..100], bird 0 (bottom row) baseY ∈ [112..212].
        // No wrap with full flock. Source's bidirectional bob isn't
        // reproduced exactly, but the visual character (birds bobbing
        // vertically, last bird wraps around) matches arcade footage.
        if (state.birdsLeft <= 1) {
            state.counterB9 = (state.counterB9 - 1) & 0xFF;
        } else {
            const SCROLL_MAX = 100;
            const scrollDir = (state.counter9a & 0x40) ? +1 : -1;
            let cbSigned = state.counterB9 >= 128 ? state.counterB9 - 256 : state.counterB9;
            cbSigned = Math.max(-SCROLL_MAX, Math.min(0, cbSigned + scrollDir));
            state.counterB9 = cbSigned & 0xFF;
        }
        // $3980 — bird-body-vs-player collision (shield-aware). Source
        // calls this once per bird-stage frame from $340C. The prior
        // TODO marked this "cosmetic" — wrong; this is the actual
        // bird-kills-player path. See birdVsPlayerCollision.
        this.birdVsPlayerCollision();

        // $340F-$3413 — BirdsLeft check. When all birds are gone, hand
        // off to the bird-stage-clear tail ($3462) for the post-clear
        // pause + countdown.
        if (state.birdsLeft === 0) {
            return this.stageBirdClear();        // $3462
        }

        // $3416-$3418 — fork on BirdsLeft >= 4.
        // `Counter9A+1` bit 0 is the parity gate (source $342A/$3438 reads
        // $439B and RRCAs the bit-0 into carry). $439B is the **LSB** of
        // the 16-bit Counter9A (per AddOneToMem at $0200: HL=$439B is
        // incremented first, with carry into $439A). So $439B flips bit 0
        // every frame, giving smooth per-frame alternation between the
        // two half-flocks. **Bug fixed 2026-05-17**: my first port read
        // (counter9a >> 8) & 1 which is the MSB ($439A, flips every 256
        // frames) — that froze half the flock for ~4 seconds at a time.
        const counter9bBit0 = state.counter9a & 1;

        if (state.birdsLeft < 4) {
            // $341B-$3434 — depleted flock: both halves move + dispatch
            // every frame; bullets fire on even parity, explosions on odd.
            // TODO 11.3-followup: drawFirst4/Second4 horizontal-movement
            //   step (separate from $35B0; the source `DrawFirst4BirdObjects
            //   $3474` body includes its own per-bird X update before the
            //   draw — that body isn't ported yet).
            this.birdRandomize();                     // $3560
            this.birdMaturityDispatchFirst4();        // $3498
            this.birdMaturityDispatchSecond4();       // $34AA
            if (counter9bBit0) {
                // $342E JP C $0FC0 — explosion animation tick on odd parity.
                this.explosionUpdate();
                this.bonusExplosionUpdate();
            } else {
                // $3431 CALL $3930 + $3434 JP $0C40 — bird fire scan
                // + enemy bullet update on even parity.
                this.birdFireScanAndSpawn();          // $3930
                this.enemyBulletUpdate();
            }
        } else {
            // $3438-$345B — full-flock parity split. Each frame, ONE
            // half-flock gets updated; over 2 frames, all 8 birds get a
            // motion step (= 30 Hz per bird).
            this.birdRandomize();                     // $3560 fires in both halves
            if (counter9bBit0) {
                // Odd parity: source draws birds 4..7, $34AA dispatch,
                // then JP $0FC0 (explosion animation tick).
                this.birdMaturityDispatchSecond4();   // $34AA
                this.explosionUpdate();
                this.bonusExplosionUpdate();
            } else {
                // Even parity: source draws birds 0..3, $3498 dispatch,
                // CALL $3930, JP $0C40 (enemy bullets).
                this.birdMaturityDispatchFirst4();    // $3498
                this.birdFireScanAndSpawn();          // $3930
                this.enemyBulletUpdate();
            }
        }
    },

    // $3930 — bird-fire scan and spawn. Picks a subset of birds via T3DC0
    // (indexed by $4BD2 bits 4..1; port substitutes counter9a), gates by
    // counter9a bit 1 ($3A00 rate gate = effective 15 Hz fire attempt),
    // and for each candidate checks shape>=5 (working wings) + gridX
    // inside a player-relative X-band that widens as BirdsLeft shrinks.
    // The first eligible bird spawns ONE enemy-bullet into the first-free
    // slot (round-capped at 3/4/5). Spawn position derives the bullet's
    // randomized Y from bird.screenLsb + counter — bullets appear at
    // varied vertical positions, not at the bird's actual Y (source
    // behavior; documented in research_bird_stage.md §8.4).
    //
    // Reuses enemyBullets[] / enemyBulletUpdate() — no separate bird-bullet
    // pool, just shared bullets ticked at +4 y/tick and deactivated at y>=$F9.
    // research_bird_stage.md §8.
    birdFireScanAndSpawn() {
        // $3A00 — bit-1 gate (every 2nd of 2-frame even-parity windows;
        // net cadence = once per 4 frames ≈ 15 Hz).
        if ((state.counter9a & 0x02) === 0) return;

        // $3942-$394B — fire X-band derived from mapped player position.
        // D = $0C - BirdsLeft → small flock = wider band.
        const D = (0x0C - state.birdsLeft) & 0xFF;
        const { left, right } = this.mappedPlayerX();
        const bandLo = (left  - D) & 0xFF;  // source B = M439E - D
        const bandHi = (right + D) & 0xFF;  // source C = M439F + D

        // $3933-$393C — T3DC0 entry pick. Source uses $4BD2 & $1E (M4BD0+
        // state machine not ported — see research §10 item 1). Substitute
        // with counter9a so the index cycles through all 16 subsets every
        // 32 frames; visible character (bullets from different birds over
        // time) is preserved.
        const idx     = state.counter9a & 0x1E;
        const loopCnt = BIRD_T3DC0[idx];
        const startLsb = BIRD_T3DC0[idx + 1];
        const startBird = (startLsb - 0x70) >> 3;   // bird index 0..7

        // $394C loop — first eligible bird wins (source's $25DD/$25FD
        // POP+POP+RET unwinds two stack frames after one spawn).
        const round   = (state.levelAndRound >> 4) & 0x0F;
        const slotCap = round < 1 ? 3 : round < 2 ? 4 : 5;

        for (let i = 0; i < loopCnt; i++) {
            const birdIdx = startBird + i;
            if (birdIdx >= 8) break;
            const bird = state.birds[birdIdx];

            // $395C filter.
            if (bird.shape < 5) continue;
            // gridX in [bandLo, bandHi). Mod-256 compare unwraps cleanly
            // because the X-band stays in the visible range (~ $09..$C8).
            if (bird.gridX < bandLo || bird.gridX >= bandHi) continue;

            // $25CD — first-free slot up to round cap.
            let slot = -1;
            for (let j = 0; j < slotCap; j++) {
                if ((state.enemyBullets[j].state & 0x08) === 0) { slot = j; break; }
            }
            if (slot < 0) return;   // source POP+POP+RET — no spawn this call

            // $395C / $25E0 — spawn coords. After source's intermediate
            // -4/+4 trick: bullet.x = bird.gridX, bullet.y = randomized
            // value spread across most of the visible vertical range.
            const bulletX = bird.gridX & 0xFF;
            const randY   = (((state.counter9a + bird.screenLsb) & 0x1F) << 3) + 0x08;
            const bulletY = (randY + 0x0C) & 0xFF;

            const b = state.enemyBullets[slot];
            b.state = 0x08;
            b.shape = 0x58 + (((bulletX >> 1) & 0x03) + (bulletY & 0x04));
            b.x     = bulletX;
            b.y     = bulletY;
            return;   // only ONE bullet per dispatched frame
        }
    },

    // $3800 — bird collision detection (player bullet → bird).
    //
    // Source does tile-mask collision via screen RAM: read the BG plane
    // byte where the bullet currently lives, look up T3B60 mask for that
    // tile, AND with a bullet-sub-cell mask. If non-zero, the bullet
    // pixel overlaps the bird sprite → either CALL $3844 (body hit) or
    // fall through to L38BC → $38E9 (wing hit) depending on which tile
    // range was hit.
    //
    // The port uses a coarser approach: AABB between the player bullet
    // and each live bird's drawn-sprite bounding box, with a wing-vs-
    // body split based on bullet distance from the bird's center. Width
    // is taken from T3EC0[shape] (= draw-routine entry LSB, same lookup
    // render.drawBird uses), height is always 16 px.
    //
    // Wing-vs-body split:
    //   - Sprite width < 5 cols: no wings (egg/small bird) → any hit is
    //     a body kill via onBirdHit.
    //   - Sprite width >= 5 cols: bullet within ±(width/4)*8 px of bird
    //     center → body kill. Bullet farther out (on either side) →
    //     wing hit via onBirdWingHit (= bird shrinks, regrows over time
    //     via the maturity engine).
    birdBulletCollision() {
        const b = state.player.bullet;
        if (!b.active) return;
        for (let i = 0; i < 8; i++) {
            const bird = state.birds[i];
            if (bird.shape === 0) continue;
            const pos = this.birdCanvasPos(bird);
            if (!pos) continue;
            const lsb = BIRD_T3EC0[bird.shape] ?? 0;
            const widthCols = (0x58 - lsb) >> 3;       // 1..7
            if (widthCols < 1 || widthCols > 7) continue;
            const widthPx = widthCols * 8;
            if (!aabbHit(pos.x, pos.y, widthPx, 16, b.x, b.y, 8, 8)) continue;

            // Bullet overlaps bird bounding box. Pick wing vs body.
            if (widthCols >= 5) {
                const birdCenterX = pos.x + (widthPx >> 1);
                const bulletCenterX = b.x + 4;
                const distFromCenter = Math.abs(bulletCenterX - birdCenterX);
                const bodyHalfWidth = widthPx >> 2;     // = widthPx / 4
                if (distFromCenter > bodyHalfWidth) {
                    this.onBirdWingHit(bird, i);
                    b.active = false;
                    break;                              // one bullet, one bird
                }
            }
            this.onBirdHit(bird, i);
            b.active = false;
            break;
        }
    },

    // Helper: convert a bird's BG-plane screen-RAM addr ($48xx-$4Bxx) to
    // its canvas (x, y) — same math drawBird uses, INCLUDING the
    // CounterB9-driven Y scroll offset, so collision boxes track the
    // visible sprite (not the unshifted memory position). Returns null
    // if the address falls outside the 832-byte visible BG plane.
    birdCanvasPos(bird) {
        const off = ((bird.screenMsb << 8) | bird.screenLsb) - 0x4800;
        if (off < 0 || off >= 832) return null;
        const col = 25 - ((off >> 5) & 0x1F);
        const row = off & 0x1F;
        const scrollY = (-state.counterB9) & 0xFF;
        return { x: col * 8, y: ((row * 8) + scrollY) & 0xFF };
    },

    // $38BC / $38E9 wing-hit path — bullet glances bird wing. Source
    // outcome depends on bird.shape:
    //   - shape ∈ {$0B, $0C, $0D}: tile-swap via T3DB8 (bird keeps
    //     flying but its visible sprite changes to a "wing-damaged"
    //     variant). Source code at $38C7-$38E8:
    //         side    = (PlayerBulletX < bird.gridX) ? 4 : 0
    //         newShape = T3DB8[ side | (bird.shape - $0B) ]
    //         bird.shape = newShape
    //     Then fall through to $38E9.
    //   - any other shape ($01-$0A, $0E, $0F): no shape change at all
    //     ($38CA / $38CF early-exits to $38E9). Bird keeps flying with
    //     its current sprite unchanged.
    //   - $38E9 always: set M4366 := $FF (wing-hit sound flag) +
    //     spawnExplosion (alien-slot, counter=$07, scoreBcd=$02 = 20 pts).
    //   - BirdsLeft NEVER decremented.
    //
    // The previous port behavior — always downgrade to shape 1 — was
    // too aggressive: source only ever moves shape WITHIN {$0B-$0E},
    // not all the way back to egg. The 2026-05-17 fix replaces the
    // shape=1 reset with the source-faithful T3DB8 lookup (gated on
    // shape ∈ {$0B-$0D}; for other shapes, only the explosion +
    // 20 pts fire).
    //
    // Port deviation (kept): collision detection itself is AABB +
    // center-distance wing/body split (`birdBulletCollision`), not
    // source's tile-mask check via T3B60/T3BB0. That deviation only
    // affects WHICH bullets register as wing-hits — once we're inside
    // this function, the response now matches source byte-for-byte.
    onBirdWingHit(bird, idx) {
        // $38C7-$38D1 — shape-gate for tile swap.
        if (bird.shape >= 0x0B && bird.shape <= 0x0D) {
            // $38D8-$38DC — side derived from PlayerBulletX vs gridX
            // via `CP (HL); RLA`. Carry flag from CP is set when
            // PlayerBulletX < bird.gridX (bullet hits LEFT side of bird).
            const side = (state.player.bullet.x < bird.gridX) ? 4 : 0;
            const idxInTable = side | (bird.shape - 0x0B);
            const newShape   = BIRD_T3DB8[idxInTable];
            // T3DB8 only has 6 valid entries ($FF padding at offsets
            // 3 and 7); the source's early-exits at $38CA/$38CF prevent
            // those from ever being indexed. Guard anyway.
            if (newShape !== 0xFF) {
                bird.shape = newShape;
            }
        }
        // $38E9 — always-on tail: wing-hit explosion + 20 pts.
        const pos = this.birdCanvasPos(bird) || { x: 0, y: 0 };
        // Alien explosion is 24w × 16h — center on the bird's current
        // sprite. Width derived from the (possibly just-updated) shape
        // via the same T3EC0 lookup drawBird uses.
        const lsb = BIRD_T3EC0[bird.shape] ?? 0x40;
        const widthCols = Math.max(1, Math.min(7, (0x58 - lsb) >> 3));
        const widthPx = widthCols * 8;
        const ex = (pos.x + (widthPx >> 1) - 12) & 0xFF;
        const ey = (pos.y + 4 -  8) & 0xFF;
        this.spawnExplosion(0x07, 0x02, ex, ey);
        scoring.addPoints(20, state.gameAndDemoOrSplash);
    },

    // $3844 body-hit path — bird killed by player bullet. Source:
    //   - Clear bird tile in BG screen RAM (LD (DE),$00 at $3851)
    //   - DEC BirdsLeft at $385C
    //   - Compute scoreBcd from bird.shape (cached at $3850 before the
    //     slot is cleared) and bird[+4] (= advanceCtr at $3857). See
    //     $385D-$388D + $3894 in Code.md.
    //   - JP $38FB / $38F8 — populate first-free explosion slot
    //     (bonus-slot for shape >= $0B, alien-slot for shape < $0B)
    //   - On bonus-explosion animation END at $3A37: M4368 := $00,
    //     M4366 := $00 (reset maturity + wing-hit flag)
    //
    // Source scoring table (research_bird_stage.md §6.3):
    //   shape <  $0B → scoreBcd = $05 → 50 pts, alien-slot explosion
    //                  (no popup; matches "egg / cracking" kill)
    //   shape == $0F → scoreBcd = $10 → 100 pts, bonus-slot popup
    //                  (matches "mature bird in formation/drift")
    //   shape == $0E → scoreBcd = ((advanceCtr >> 1) & $7C) + $30
    //                  (typically $30-$78 → 300-780 pts), bonus-slot
    //   shape == $0D → above >> 1 (typically 150-380 pts), bonus-slot
    //   shape == $0C → above >> 1 (same as $0D — second halving is
    //                  gated `JP NC,$38FB` on shape >= $0C; only $0B
    //                  takes the third halving), bonus-slot
    //   shape == $0B → above >> 2 (typically 75-195 pts), bonus-slot
    //
    // The variable shapes ($0B-$0E) cover transient diving/swooping
    // states; in arcade play, most body kills land on shape $0F (100 pts)
    // and the egg path (50 pts) with occasional bonus values when you
    // catch a bird mid-swoop. Some computed scoreBcd values produce
    // invalid BCD nibbles (e.g. $38 >> 1 = $1C); the popup renders the
    // raw nibble through the same $20|nibble tile lookup as digit '0'-'9'
    // (so $0C displays as the tile right after '9'), and addPoints
    // takes the literal hi*10 + lo decode (matches the L37B0 display
    // semantics — invalid BCD is a source-side artifact, not corrected
    // here so the score on display always equals the score awarded).
    //
    // Maturity reset: port does it immediately on kill rather than at
    // bonus-explosion-animation end. Visible difference is ~16 frames
    // (the bonus sprite's life); the player sees `mat=00` in the HUD
    // right after a kill instead of after a half-second delay. Same
    // net behaviour — surviving birds re-process maturity from $00.
    onBirdHit(bird, idx) {
        // Cache shape + advanceCtr before clearing the slot ($3850-$3857).
        const shape  = bird.shape;
        const advCtr = bird.advanceCtr;

        bird.shape = 0;                                // free the slot
        state.birdsLeft = Math.max(0, state.birdsLeft - 1);
        state.maturity = 0;                            // $3A37 cleanup

        // $385D-$388D / $3894 — scoreBcd + slot-type decision.
        let scoreBcd;
        let isBonus;
        if (shape < 0x0B) {
            // $3894 — egg / cracking / small-bird kill.
            scoreBcd = 0x05;
            isBonus  = false;
        } else if (shape === 0x0F) {
            // $386F JP Z,$38FB — mature bird, default BC=$1010.
            scoreBcd = 0x10;
            isBonus  = true;
        } else {
            // $3874-$388D — compute from advanceCtr.
            let c = (((advCtr >> 1) & 0x7C) + 0x30) & 0xFF;
            if (shape <= 0x0D) c = (c >> 1) & 0xFF;     // $0B/$0C/$0D — halve once
            if (shape === 0x0B) c = (c >> 1) & 0xFF;    // $0B — halve again
            scoreBcd = c;
            isBonus  = true;
        }

        // BCD → decimal × 10 (matches L37B0 popup's hi/lo nibble render).
        const hi = (scoreBcd >> 4) & 0x0F;
        const lo =  scoreBcd       & 0x0F;
        const points = (hi * 10 + lo) * 10;

        const pos = this.birdCanvasPos(bird) || { x: 0, y: 0 };
        if (isBonus) {
            // 48w × 16h bonus sprite — center on the bird:
            //   ex = bird-center - sprite-half-width  = (px+4) - 24
            //   ey = bird-center - sprite-half-height = (py+4) -  8
            const ex = (pos.x + 4 - 24) & 0xFF;
            const ey = (pos.y + 4 -  8) & 0xFF;
            this.spawnBonusExplosion(0x10, scoreBcd, ex, ey);
        } else {
            // 24w × 16h alien-slot sprite (no popup), matches $38F8 path.
            // Source loads B=$0D as the slot counter ($3894 BC=$0D05).
            const ex = (pos.x + 4 - 12) & 0xFF;
            const ey = (pos.y + 4 -  8) & 0xFF;
            this.spawnExplosion(0x0D, scoreBcd, ex, ey);
        }

        scoring.addPoints(points, state.gameAndDemoOrSplash);
    },

    // $3498 — call $35B0 for birds 0..3.
    birdMaturityDispatchFirst4() {
        for (let i = 0; i < 4; i++) this.birdUpdate(state.birds[i]);
    },

    // $34AA — call $35B0 for birds 4..7.
    birdMaturityDispatchSecond4() {
        for (let i = 4; i < 8; i++) this.birdUpdate(state.birds[i]);
    },

    // $35B0 — per-bird update dispatcher. Walks the T3F00 entry for the
    // bird's current shape and chains a motion routine then a maturity-
    // advance routine, both pulled from the entry.
    //
    // Source uses a PUSH/RET-as-call trick on the 8085 stack: push 4
    // payload bytes (B,C,D,E from T3F00[shape] bytes 0..3), then push the
    // two routine addresses (bytes 4..5 = maturity, bytes 6..7 = motion),
    // then RET → pops the LAST push (motion). When motion routine RETs,
    // it pops the NEXT entry (maturity). Maturity routines start with
    // POP DE / POP BC / POP HL to recover the payloads. Port translates
    // this to a normal function call sequence: motion(bird, B, C, D, E),
    // then maturity(bird, B, C, D, E). Same semantic, no stack abuse.
    //
    // Per-frame work BEFORE the dispatch:
    //   - Read bird[+0] = shape. If 0, return (slot empty / dead bird).
    //   - Read bird[+4] = advanceCtr. If non-zero, DEC it. (If zero,
    //     don't DEC and don't reset — gates the maturity-advance fire.)
    //
    // research_bird_stage.md §5.1 (T3F00), §4 (maturity gates), §1.4
    // (motion routines).
    birdUpdate(bird) {
        const shape = bird.shape;
        if (shape === 0) return;
        if (bird.advanceCtr !== 0) {
            bird.advanceCtr = (bird.advanceCtr - 1) & 0xFF;
        }
        const base = shape << 3;                      // T3F00[shape] base
        const b = BIRD_T3F00[base + 0];
        const c = BIRD_T3F00[base + 1];
        const d = BIRD_T3F00[base + 2];
        const e = BIRD_T3F00[base + 3];
        // Bytes 4..5 = "first call" address ($35D1-$35D4 PUSH) — the
        // maturity-advance routine. Bytes 6..7 = "second call" address
        // ($35D6-$35D9 PUSH) — the motion routine. Source RETs into the
        // second push first, so MOTION fires first, then maturity when
        // motion returns and pops the next stack frame.
        const maturityAddr = (BIRD_T3F00[base + 4] << 8) | BIRD_T3F00[base + 5];
        const motionAddr   = (BIRD_T3F00[base + 6] << 8) | BIRD_T3F00[base + 7];
        switch (motionAddr) {
            case 0x36C0: this.birdMotion36C0(bird); break;
            case 0x35E0: this.birdMotion35E0(bird); break;
            // Shape 0 falls through (all $FF — RET Z handled above);
            // any unknown value silently skipped.
        }
        switch (maturityAddr) {
            case 0x36D2: this.birdMaturity36D2(bird, b, c, d, e); break;
            case 0x36EA: this.birdMaturity36EA(bird, b, c, d, e); break;
            case 0x370A: this.birdMaturity370A(bird, b, c, d, e); break;
            case 0x36CC: /* no-op — shapes C/D, stack-unwind only */    break;
        }
    },

    // $36D2 — maturity advance for shapes 1, 2, 3 (OR $01 into M4368).
    // Gate: bird[+4] (advanceCtr) must be 0 — i.e. countdown finished.
    // Writes B → bird[+4] (reset countdown), D → bird[+0] (new shape).
    birdMaturity36D2(bird, b, c, d, e) {
        if (bird.advanceCtr !== 0) return;
        bird.advanceCtr = b;
        bird.shape = d;
        state.maturity = (state.maturity | 0x01) & 0xFF;
    },

    // $36EA — maturity advance for shapes 4, 5, 8, 9, B, E (OR $02).
    // Gates: bird[+4] == 0 AND (bird[+6] & $0F) == 0.
    birdMaturity36EA(bird, b, c, d, e) {
        if (bird.advanceCtr !== 0) return;
        if ((bird.field6 & 0x0F) !== 0) return;
        bird.advanceCtr = b;
        bird.shape = d;
        state.maturity = (state.maturity | 0x02) & 0xFF;
    },

    // $370A — maturity advance for shapes 6, 7, A, F (OR $04, and
    // conditionally OR $08 with shape/counter override). Same gate as
    // $36EA; after the OR $04, an additional gate on (M436F & E) & $F0
    // decides whether to take the OR $08 override path. With M436F = 0
    // (cold start, before $3560 has produced randomness), the override
    // fires unconditionally — but $3560 runs every frame in
    // stageBirdCombat, so by the time a bird reaches shape 6/7/A/F,
    // M436F is randomized and the override fires probabilistically.
    birdMaturity370A(bird, b, c, d, e) {
        if (bird.advanceCtr !== 0) return;
        if ((bird.field6 & 0x0F) !== 0) return;
        bird.advanceCtr = b;
        bird.shape = d;
        state.maturity = (state.maturity | 0x04) & 0xFF;
        // Override gate: (M436F & E) & $F0 must be 0 to fire OR $08.
        if (((state.m436F & e) & 0xF0) !== 0) return;
        // Override: install shape = E & $0F, advanceCtr = C, OR $08.
        bird.shape = e & 0x0F;
        bird.advanceCtr = c;
        state.maturity = (state.maturity | 0x08) & 0xFF;
    },

    // $36C0 — anim-cycle motion for shapes 1, 5, 6, 7, 8, 9, A. Only
    // ticks bird[+3] (anim phase 0..7) on even-advanceCtr frames.
    birdMotion36C0(bird) {
        if ((bird.advanceCtr & 1) !== 0) return;
        bird.field3 = (bird.field3 + 1) & 0x07;
    },

    // $35E0 — main sweep motion for shapes 2, 3, 4, B, C, D, E, F.
    //
    // Geometry: each bird oscillates horizontally between a current X
    // (bird[+5]) and a target X (bird[+7]). bird[+6] is the per-tick
    // step size AND the direction encoding:
    //   bird[+6] <  $10  → main path: gridX += step, screen moves right
    //                      (screenLsb -= $20 on anim-overflow)
    //   bird[+6] >= $10  → alt path:  gridX -= step, screen moves left
    //                      (screenLsb += $20 on anim-borrow)
    // When the bird reaches its target (gridY == gridX), $3672 / $3695
    // pick a new target from `PlayerShipX & $F8` plus randomness via
    // `M436D` — that's the player-tracking dive that gives Phoenix's
    // birds their characteristic "swoop toward the ship" behavior.
    //
    // bird[+3] (anim phase) is also bumped by step each tick and wraps
    // at 8 — this drives the egg/wing animation cycle for the static
    // shapes (the 4-frame T3E08 lookup uses bird[+3] >> 1).
    //
    // Screen address (bird[+1]:bird[+2]) updates use source's screen-RAM
    // semantics: `$20` in screenLsb = high 5 bits = 1 display column.
    // Subtracting $20 with no borrow = +1 col display (right); with
    // borrow = +1 col + screenMsb-- (wrap to previous row of cols).
    // Adding $20 = -1 col display (left); carry → screenMsb++.
    //
    // Helpers are split per source label to keep the dispatch readable;
    // each helper's HL convention is documented in its comment.
    // research_bird_stage.md §10 item 7.
    birdMotion35E0(bird) {
        const f6 = bird.field6;
        if (f6 >= 0x10) {
            this._birdMotion3628(bird, f6);
            return;
        }
        // Main path: bird[+6] < $10
        const b = f6;                          // save step
        bird.gridX  = (bird.gridX  + b) & 0xFF;  // bird[+5] += b
        const sum = (bird.field3 + b) & 0xFF;
        bird.field3 = sum;
        if (sum < 0x08) {
            this._birdMotion366A(bird, b);
            return;
        }
        bird.field3 = sum & 0x07;              // wrap anim phase
        // bird[+2] -= $20  (with borrow → bird[+1]--)
        let lsbNew = bird.screenLsb - 0x20;
        if (lsbNew < 0) {
            bird.screenLsb = (lsbNew + 0x100) & 0xFF;
            bird.screenMsb = (bird.screenMsb - 1) & 0xFF;
        } else {
            bird.screenLsb = lsbNew;
        }
        // Fall through to $3604
        this._birdMotion3604(bird, b);
    },

    // $3604 — main-path tail. Computes (bird[+7] - bird[+5]) and uses
    // it (after some bit-shifting) to pick the next bird[+6] step.
    // bird[+6] is reset to $10 unconditionally first; the subsequent
    // writes overwrite that based on three conditions:
    //   - exact target match (a == 0)  → $3672 (pick new target X)
    //   - bit-shifted diff < B (orig)  → bird[+6] = (diff & $1F) + 1
    //   - else if M436E == B           → bird[+6] = M436E (no-op write)
    //   - else                         → bird[+6] = B + 1
    // The randomization via M436E lets the swoop amplitude wobble each
    // sweep without becoming pathological.
    _birdMotion3604(bird, b) {
        const c = bird.gridX;                  // saved bird[+5]
        const a0 = bird.gridY;                 // bird[+7] target
        bird.field6 = 0x10;                    // tentative: switch to alt mode
        const diff = (a0 - c) & 0xFF;
        if (diff === 0) {
            this._birdMotion3672(bird);
            return;
        }
        let a = (diff - 1) & 0xFF;
        a = ((a >> 3) | (a << 5)) & 0xFF;      // RRCA × 3
        a &= 0x1F;
        const cpBorrow = a < b;                // CP B
        a = (a + 1) & 0xFF;
        bird.field6 = a;
        if (cpBorrow) return;
        a = state.m436E;
        bird.field6 = a;
        if (a === b) return;
        bird.field6 = (b + 1) & 0xFF;
    },

    // $366A — main-path helper for "anim phase didn't overflow yet."
    // If bird[+6] was already 0 (step disabled), bump it to 1 to start
    // motion next frame. Otherwise return — anim phase is still pre-8,
    // no column step needed.
    _birdMotion366A(bird, b) {
        if (b !== 0) return;
        bird.field6 = (bird.field6 + 1) & 0xFF;
    },

    // $3672 — pick a new target X (bird[+7]) when the bird has reached
    // its sweep limit on the main path. Clamps to `min(gridX,
    // PlayerShipX & $F8)`, then subtracts (M436D pre-add) to seed the
    // sweep amplitude. M436D advances by $08 each call (source-faithful
    // — sets up the next bird's sweep with a different starting offset).
    _birdMotion3672(bird) {
        let b = bird.gridX;
        const px = state.player.x & 0xF8;
        if (px < b) b = px;
        const cVal = state.m436D;
        state.m436D = (state.m436D + 0x08) & 0xFF;
        const a = (b - cVal) & 0xFF;
        const borrow = b < cVal;
        bird.gridY = 0x08;                     // unconditional fallback
        if (borrow) return;
        if (a < 0x08) return;
        bird.gridY = a;
    },

    // $3628 — alt path (bird[+6] >= $10). Mirror of main path but
    // direction-reversed: screen moves left, anim phase decrements.
    // Low nibble of bird[+6] = step magnitude; high nibble bit-4 stays
    // set (so subsequent ticks stay in alt path).
    _birdMotion3628(bird, f6) {
        let a = f6 & 0x0F;
        if (a === 0) {
            this._birdMotion3744(bird);
            return;
        }
        const b = a;
        bird.gridX = (bird.gridX - b) & 0xFF;
        const newAnim = (bird.field3 - b) & 0xFF;
        const animBorrow = bird.field3 < b;
        bird.field3 = newAnim;
        if (!animBorrow) {
            this._birdMotion3695(bird, b);
            return;
        }
        bird.field3 = newAnim & 0x07;
        // bird[+2] += $20  (with carry → bird[+1]++)
        let lsbNew = bird.screenLsb + 0x20;
        if (lsbNew > 0xFF) {
            bird.screenLsb = lsbNew & 0xFF;
            bird.screenMsb = (bird.screenMsb + 1) & 0xFF;
        } else {
            bird.screenLsb = lsbNew;
        }
        // Fall through to $3648
        this._birdMotion3648(bird, b);
    },

    // $3648 — alt-path tail. Computes (bird[+5] - bird[+7]) with the
    // same bit-shift / CP / M436E logic as $3604, then OR's $10 into
    // the result so the next tick stays in alt path.
    _birdMotion3648(bird, b) {
        const v5 = bird.gridX;
        let a = (v5 - bird.gridY) & 0xFF;
        a = ((a >> 3) | (a << 5)) & 0xFF;      // RRCA × 3
        a &= 0x1F;
        const cpBorrow = a < b;
        a = (a + 1) & 0xFF;
        if (!cpBorrow) {
            const me = state.m436E;
            if (me !== b) {
                a = (b + 1) & 0xFF;
            } else {
                a = me;
            }
        }
        bird.field6 = (a | 0x10) & 0xFF;
    },

    // $3695 — alt-path target-reached check. Only fires when bird[+7]
    // == bird[+5] (sweep limit). Clears bird[+6] so the next tick exits
    // alt path naturally, then picks a new bird[+7] target additively
    // (capped at $C8).
    //
    // ⚠ Source reads B = bird[+5] then A = bird[+7] then `CP B; RET NZ`
    // — comparing gridY against the just-read gridX. (My port previously
    // compared against the step parameter `b`, which broke the alt→main
    // transition: 2026-05-17 fix.)
    //
    // ⚠ The PlayerShipX clamp uses **max**(playerX, bird[+5]) here, but
    // $3672's analogous clamp uses **min** — source $3695's `JP C` at
    // $36A7 skips `B = A` when A < B (so B ends up as max), while
    // $3672's `JP NC` at $367C skips when A >= B (B ends up as min).
    // The two routines drive the LEFT and RIGHT sweep targets
    // respectively.
    _birdMotion3695(bird, b) {
        // bird[+7] vs bird[+5] — NOT vs step parameter.
        if (bird.gridY !== bird.gridX) return;
        const bx = bird.gridX;                 // captured for downstream
        bird.field6 = 0;
        const px = state.player.x & 0xF8;
        // max(px, bx)
        let bb = bx;
        if (px >= bx) bb = px;
        const cVal = state.m436D;
        state.m436D = (state.m436D + 0x08) & 0xFF;
        // Source: A = (m436D pre-add) + $08; then ADD A,B → effective
        // (m436D + 8 + B). The "$08" is added between the m436D read
        // and the post-read store, but the value used downstream is
        // the POST-store one (= pre-add + 8).
        const sum = (cVal + 0x08 + bb);
        bird.gridY = 0xC8;                     // unconditional fallback
        if (sum > 0xFF) return;
        if ((sum & 0xFF) >= 0xC8) return;
        bird.gridY = sum & 0xFF;
    },

    // $3744 — alt-path transition when bird[+6]'s low nibble hits 0.
    // Resets bird[+6] to $11 (alt path, step 1), bumps bird[+5] DOWN,
    // resets anim phase to $07, and steps the screen LSB by +$20 (with
    // carry into MSB). This is the "kick the bird back into motion"
    // path when the alt-path step magnitude underflows to 0.
    _birdMotion3744(bird) {
        bird.field6 = 0x11;
        bird.gridX = (bird.gridX - 1) & 0xFF;
        bird.field3 = 0x07;
        let lsbNew = bird.screenLsb + 0x20;
        if (lsbNew > 0xFF) {
            bird.screenLsb = lsbNew & 0xFF;
            bird.screenMsb = (bird.screenMsb + 1) & 0xFF;
        } else {
            bird.screenLsb = lsbNew;
        }
    },

    // $3560 — bird randomizer. Picks a T3E80 entry from (LevelAndRound
    // round bits + BirdsLeft density + Counter9A bit + PRNG byte) and
    // exposes the entry's (shape, delta) to motion/maturity via M436E/D,
    // plus a bit-mixed PRNG byte via M436F. Runs once per half-flock
    // dispatch in stageBirdCombat. research_bird_stage.md §3.
    birdRandomize() {
        // 4-bit PRNG output (port's getRandomNumber is masked to $0F —
        // see comment at $30AA implementation). Source returns a full
        // byte; the port's narrowing is a pre-existing limitation that
        // doesn't break maturity/motion gates.
        const rnd = this.getRandomNumber() & 0xFF;
        // C = rnd << 2 (after 2 RLCAs on a value with high nibble 0,
        // this is just shift-left; high bits don't wrap).
        const c = (rnd << 2) & 0xFF;
        // 4 RLCAs total: nibble swap. With high nibble = 0, result is
        // rnd << 4. OR with original rnd → byte with both nibbles = rnd.
        const m436f = (((rnd << 4) | rnd) & 0xFF);
        state.m436F = m436f;

        // Round contribution: cap LevelAndRound at $30 if >= $40, mask
        // to bits 5..4, RRCA once (→ bits 4..3 of B).
        let lrCapped = state.levelAndRound;
        if (lrCapped >= 0x40) lrCapped = 0x30;
        let bAcc = (lrCapped & 0x30) >> 1;            // bits 4..3
        // Density contribution: min(BirdsLeft - 1, 3) << 1 → bits 3..2.
        let dens = (state.birdsLeft - 1) & 0xFF;
        if (dens >= 4) dens = 3;
        bAcc = ((bAcc << 1) | (dens << 1)) & 0xFF;
        // Counter9A parity contribution: source reads $439A (= MSB byte
        // of the 16-bit counter, flips every 256 frames). After RLCA × 2
        // and AND $20, the resulting bit-5 of the contribution flips
        // every 8 × 256 = 2048 frames (~34 s) — a long-period jitter on
        // the T3E80 lookup. **Bug fixed 2026-05-17**: previous port
        // mistakenly read $439B (LSB, fast); the lookup over-randomized.
        let c9 = ((state.counter9a >> 8) & 0xFF) << 2;
        c9 &= 0x20;
        bAcc = (bAcc | c9) & 0xFF;
        // Final index: bAcc + $80 → T3E80 entry. Subtract $80 since
        // BIRD_T3E80 is extracted starting at $3E80 (relative offset 0).
        const off = ((bAcc + 0x80) - 0x80) & 0xFF;
        if (off >= BIRD_T3E80.length) {
            state.m436E = 0;
            state.m436D = 0;
            return;
        }
        state.m436E = BIRD_T3E80[off];
        const byte1 = BIRD_T3E80[off + 1] ?? 0;
        state.m436D = (byte1 + c) & 0xF8;
    },

    // $3980 — bird-body-vs-player collision (source's "scan upward from
    // player using PlayerBullet position as a probe" trick). Source flow:
    //   - $3980 gates the scan on M4BD2 in [$0C, $1C) (port skips this
    //     timing gate — bird positions themselves provide the natural
    //     "near player" filter via AABB).
    //   - Backs up PlayerBulletState to $4BC0+ ($3989-$3998), then sets
    //     PlayerBullet position = PlayerShip position ($399B-$39A7),
    //     activates the bullet bit-3, and runs $3800 in a loop walking
    //     up one row per iteration ($39C3 loop).
    //   - $3800 detects bird sprites by reading the tile at the probe
    //     position; on hit, $3851 zeroes the bird's shape (kills it) +
    //     $385C decrements BirdsLeft + awards points/bonus explosion.
    //   - When the bullet gets deactivated by a kill ($39CC JP Z,$39F0),
    //     dispatches on ShieldCount: sc >= $C0 → SUB $01 (extra shield
    //     dec, bird kill cost), continue; sc < $C0 → JP $0CC4 player dies.
    //
    // Port simplification: direct AABB between each bird's bounding box
    // and the player's 2×2 ship hitbox. Faithful in OUTCOME (bird dies,
    // shield-aware player fate) but skips the screen-RAM tile-probe
    // mechanism — same trade-off as enemyBulletUpdate and
    // alienVsPlayerCollision use elsewhere (port has no FG screen RAM).
    //
    // Wired in stageBirdCombat after birdBulletCollision, replacing the
    // prior "cosmetic TODO" stub. Source's $3980 fires from $340C inside
    // L3400 each bird-stage frame; port matches by calling once per
    // bird-stage tick.
    birdVsPlayerCollision() {
        if (!state.player.alive) return;
        const px = state.player.x & ~7;
        const py = state.player.y;
        for (let i = 0; i < 8; i++) {
            const bird = state.birds[i];
            if (bird.shape === 0) continue;
            const pos = this.birdCanvasPos(bird);
            if (!pos) continue;
            const lsb = BIRD_T3EC0[bird.shape] ?? 0;
            const widthCols = (0x58 - lsb) >> 3;
            if (widthCols < 1 || widthCols > 7) continue;
            const widthPx = widthCols * 8;
            if (!aabbHit(pos.x, pos.y, widthPx, 16, px, py, 16, 16)) continue;

            // Hit. Kill the bird via the standard onBirdHit path ($3851
            // zeroes shape + $385C decrements BirdsLeft + awards points
            // + spawns bonus explosion when shape >= $0B). This fires
            // even on shielded hits — source $3800 always kills the
            // bird before $39F0 dispatches on shield.
            this.onBirdHit(bird, i);

            if (state.player.shieldCount > 0xC0) {
                // $39F8-$39FA — extra shield-counter decrement. The
                // bird kill "costs" one frame of shield duration on top
                // of the per-frame DrawShields dec.
                state.player.shieldCount = (state.player.shieldCount - 1) & 0xFF;
            } else {
                // $39F5 JP C,$0CC4 — no shield, player dies.
                this.onPlayerHit();
            }
            return;
        }
    },
};
