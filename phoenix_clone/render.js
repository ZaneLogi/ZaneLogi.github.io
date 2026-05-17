import { gfx } from './gfx.js';
import { state } from './state.js';
import { runloop } from './runloop.js';
import { input } from './input.js';
import { resource } from './resource.js';
import {
    ALIEN_SHAPE_TABLE,    // source T1420
    ALIEN_EXPLOSION_ROM,  // source $17B0+
    BIRD_T3EC0,           // source T3EC0 — shape → draw-routine entry LSB (= column count)
    BIRD_T3E08,           // source $3E00..$3E7F — shape×frame → tile-data MSB:LSB
    BIRD_TILE_DATA,       // source $3C00..$3DBF — actual bird-sprite tile bytes
} from './data.js';

// research_rendering.md §5 — per-frame: clear → drawBackground → walk objects.
// Skeleton draws a debug grid in place of the BG tile-grid; per-object draws
// go via gfx.drawObject (player) or drawAlien (aliens; Bit3 dispatch mirror).
//
// Press G to cycle the tile-ROM debug overlay: off → fg → bg → off.

const GRID_OFF = 0;
const GRID_FG  = 1;
const GRID_BG  = 2;

export const render = {
    gridMode: GRID_OFF,   // Default OFF so first boot no shows the decoded tiles.

    checkHotkeys() {
        if (input.gridEdge()) this.gridMode = (this.gridMode + 1) % 3;
    },

    frame() {
        gfx.clear();
        this.drawBackground();
        this.drawDebugGrid();
        if (this.gridMode !== GRID_OFF) this.drawTileRomOverlay();
        for (const row of state.staticTextRows) gfx.drawObject(row);
        for (const alien of state.aliens) this.drawAlien(alien);
        for (const bird of state.birds) this.drawBird(bird);
        if (state.player.alive) this.drawPlayer();
        if (state.player.bullet.active) this.drawPlayerBullet();
        this.drawEnemyBullets();
        this.drawExplosions();
        this.drawBonusExplosions();
        this.drawHud();
        this.drawSpiralOverlay();
    },

    // $2230 spiral-fill overlay — draws asterisk tiles ($1F) on top of
    // all other FG content at the canvas positions computed by
    // states.spiralDrawCells. Empty (deleted) entries are simply not
    // present in the Map, so phase-2 erases automatically un-draw cells.
    // Drawn LAST in the frame to match source's "spiral covers score
    // during transition" overlay behavior.
    drawSpiralOverlay() {
        if (state.fgOverlay.size === 0) return;
        const ctx = gfx.ctx;
        const images = resource.fgTileImages;
        for (const [key, tile] of state.fgOverlay) {
            const sep = key.indexOf(',');
            const x = +key.slice(0, sep);
            const y = +key.slice(sep + 1);
            ctx.drawImage(images[tile], x, y);
        }
    },

    // Mirror of Bit3Controller ($0740) draw-side. controlA bit 3 enables
    // draw; bits 0-2 dispatch the layout via T0759:
    //   low3=0  L076D  Draw 1×1  → single tile = controlB raw (fade-in path)
    //   low3=1  L0788  Draw 2×1  → ALIEN_SHAPE_TABLE[b..+1] horizontal (16w × 8h)
    //   low3=3  L07AA  Draw 1×2  → ALIEN_SHAPE_TABLE[b..+1] vertical   (8w × 16h)
    //   low3=4  L07D2  Draw 2×2  → ALIEN_SHAPE_TABLE[b..+3] grid       (16w × 16h)
    // The source's delete-then-draw double-buffer (bit 4 in controlA) is a
    // no-op in the canvas port — the per-frame canvas clear replaces it.
    //
    // ALIEN_SHAPE_TABLE indexing note: source loads `H=$14, L=controlB` so
    // the lookup address is $1400+controlB, not $1420+controlB. The source
    // T1420 table (our ALIEN_SHAPE_TABLE) happens to start at $1420, so
    // controlB values < $20 would index outside it. Subtract $20 from
    // controlB to get the array offset.
    drawAlien(alien) {
        if (!alien.alive) return;
        if ((alien.controlA & 0x08) === 0) return;
        const ctx = gfx.ctx;
        const images = resource.fgTileImages;
        const low3 = alien.controlA & 0x07;
        const b = alien.controlB;
        // Variant-mode dispatches (1, 3, 4) use AlienAnimationUpdate's
        // pre-shifted tile variants — the chosen tile carries the sub-cell
        // pixel offset, so we draw at the tile-cell boundary (x & ~7,
        // y & ~7) to let the variant supply the sub-tile shift. Drawing
        // at exact (x, y) would double-count it (visible as 4-px jitter
        // during X drift). low3=0 (raw fade-in tile) has no variant cycling.
        const tx = alien.x & ~7;
        const ty = alien.y & ~7;
        switch (low3) {
            case 0:                                       // L076D Draw 1×1
                if (b !== 0) ctx.drawImage(images[b], alien.x, alien.y);
                break;
            case 1: {                                     // L0788 Draw 2×1
                const idx = b - 0x20;
                const t0 = ALIEN_SHAPE_TABLE[idx], t1 = ALIEN_SHAPE_TABLE[idx + 1];
                if (t0 !== 0) ctx.drawImage(images[t0], tx,     ty);
                if (t1 !== 0) ctx.drawImage(images[t1], tx + 8, ty);
                break;
            }
            case 3: {                                     // L07AA Draw 1×2
                const idx = b - 0x20;
                const t0 = ALIEN_SHAPE_TABLE[idx], t1 = ALIEN_SHAPE_TABLE[idx + 1];
                if (t0 !== 0) ctx.drawImage(images[t0], tx, ty);
                if (t1 !== 0) ctx.drawImage(images[t1], tx, ty + 8);
                break;
            }
            case 4: {                                     // L07D2 Draw 2×2
                // Tile order is COLUMN-MAJOR in ALIEN_SHAPE_TABLE because
                // Phoenix's CRT is rotated; source's screen-RAM addressing
                // (`INC DE` = visually down, `RightOneColumn` = visually
                // right) lays out the 4 bytes as [UL, LL, UR, LR], not
                // [UL, UR, LL, LR] (research_rendering.md §2.5).
                //
                // PORT DEVIATION — full-sprite + exact-position draw:
                // Source's SHAPE_LSB_TABLE cycle includes "partial" variants
                // (e.g. controlB=0xA0 has tiles [0x8B, 0x9B, 0, 0]) that
                // rely on the previous frame's tiles still being in screen
                // RAM. Our canvas-cleared-per-frame model can't reproduce
                // that, so partial sprites would render with missing halves.
                // Instead: keep the alien's most recently-seen FULL controlB
                // and substitute it when the current controlB is partial.
                // Draw at exact (alien.x, alien.y) — canvas pixel-accurate
                // positioning replaces source's tile pre-shifting trick.
                let idx = b - 0x20;
                let tiles = [
                    ALIEN_SHAPE_TABLE[idx    ],   // UL
                    ALIEN_SHAPE_TABLE[idx + 1],   // LL
                    ALIEN_SHAPE_TABLE[idx + 2],   // UR
                    ALIEN_SHAPE_TABLE[idx + 3],   // LR
                ];
                if (tiles[0] === 0 || tiles[1] === 0 ||
                    tiles[2] === 0 || tiles[3] === 0) {
                    // Partial — fall back to alien's last-known full variant.
                    const fb = alien.lastFullControlB ?? 0xA8;
                    const fbIdx = fb - 0x20;
                    tiles = [
                        ALIEN_SHAPE_TABLE[fbIdx    ],
                        ALIEN_SHAPE_TABLE[fbIdx + 1],
                        ALIEN_SHAPE_TABLE[fbIdx + 2],
                        ALIEN_SHAPE_TABLE[fbIdx + 3],
                    ];
                } else {
                    // Full — remember as the fallback for future partial frames.
                    alien.lastFullControlB = b;
                }
                // Exact-position draw (no tile-boundary snap).
                ctx.drawImage(images[tiles[0]], alien.x,     alien.y    );
                ctx.drawImage(images[tiles[1]], alien.x,     alien.y + 8);
                ctx.drawImage(images[tiles[2]], alien.x + 8, alien.y    );
                ctx.drawImage(images[tiles[3]], alien.x + 8, alien.y + 8);
                break;
            }
        }
    },

    // Bird sprite render — ports DrawBirdObject $34C0 + Draw7x2..Draw1x2
    // entry sequence at $3520+. Source writes bird tiles to BG screen RAM
    // at the bird's stored MSB:LSB; we draw directly to canvas at the
    // position that MSB:LSB would have mapped to (same conversion as
    // states.js bgWrite, minus the bgTiles write).
    //
    // Sprite dimensions: ALL bird sprites are 2 rows tall (16 px) and
    // vary in width from 2 to 7 cols (16-56 px). The column count is
    // encoded in T3EC0[shape] as the entry-point LSB into $3520+:
    //   LSB $20 → enter Draw7x2 → 7 cols   LSB $38 → Draw4x2 → 4 cols
    //   LSB $28 → Draw6x2     → 6 cols     LSB $40 → Draw3x2 → 3 cols
    //   LSB $30 → Draw5x2     → 5 cols     LSB $48 → Draw2x2 → 2 cols
    //                                       LSB $50 → Draw1x2 → 1 col
    // Each entry block is 8 bytes; width = (0x58 - lsb) >> 3.
    //
    // Tile-data address: source $34D0-$34D7 computes
    //   tIdx = ((shape << 3) + bird[+3]) & 0x7E
    //   addr = (T3E08[tIdx] << 8) | T3E08[tIdx + 1]
    // Bird[+3] (anim-phase counter, cycled 0..7 by $36C0 motion) varies
    // the frame within a shape — egg → cracking → wings spread on the
    // animated shapes. Shapes that use $35E0 motion keep bird[+3]=0 so
    // they show only frame 0 (matches our $35E0 no-op stub state).
    //
    // Tile layout in BIRD_TILE_DATA: column-major pairs,
    // [col0_row0, col0_row1, col1_row0, col1_row1, ..., colN_row0, colN_row1].
    // Birds use BG palette → resource.bgTileImages (source writes bird
    // tiles to the BG plane $48XX-$4BXX, never FG).
    //
    // Inactive slots (shape == 0) are skipped — matches $34C0
    // "LD A,(HL); AND A; RET Z" gate.
    drawBird(bird) {
        if (bird.shape === 0) return;
        const off = ((bird.screenMsb << 8) | bird.screenLsb) - 0x4800;
        if (off < 0 || off >= 832) return;
        const baseX = (25 - ((off >> 5) & 0x1F)) * 8;
        // BG-scroll Y offset (port-side equivalent of source's $5800
        // scroll register applied to the BG plane). CounterB9 decrements
        // each frame inside bgUpdateIfAlienStage, so `-counterB9 & 0xFF`
        // grows linearly per frame; the final canvas Y is wrapped mod
        // 256 so birds re-enter from the top after passing the bottom,
        // matching the BG plane's cyclical scroll. Source-level
        // semantics: source writes adjusted CounterB9 to $5800, BG
        // hardware shifts both stars + bird tiles together by that
        // amount.
        const scrollY = (-state.counterB9) & 0xFF;
        const baseY = (((off & 0x1F) * 8) + scrollY) & 0xFF;

        const lsb = BIRD_T3EC0[bird.shape] ?? 0;
        const width = (0x58 - lsb) >> 3;       // 1..7
        if (width < 1 || width > 7) return;

        const tIdx = ((bird.shape << 3) + bird.field3) & 0x7E;
        const dataAddr = (BIRD_T3E08[tIdx] << 8) | BIRD_T3E08[tIdx + 1];
        const dataOff  = dataAddr - 0x3C00;
        if (dataOff < 0 || dataOff + width * 2 > BIRD_TILE_DATA.length) return;

        const ctx = gfx.ctx;
        const images = resource.bgTileImages;
        for (let c = 0; c < width; c++) {
            const t0 = BIRD_TILE_DATA[dataOff + c * 2    ];
            const t1 = BIRD_TILE_DATA[dataOff + c * 2 + 1];
            if (t0 !== 0) ctx.drawImage(images[t0], baseX + c * 8, baseY);
            if (t1 !== 0) ctx.drawImage(images[t1], baseX + c * 8, baseY + 8);
        }
    },

    // 2×2 ship drawn at (X & ~7, Y). T1600 variant selected in playerUpdate
    // encodes the sub-pixel X offset; snapping to tile boundary lets it work.
    drawPlayer() {
        const p = state.player;
        const ctx = gfx.ctx;
        const images = resource.fgTileImages;
        const tx = p.x & ~7;
        const ty = p.y;
        ctx.drawImage(images[p.tiles[0]], tx,     ty);
        ctx.drawImage(images[p.tiles[1]], tx + 8, ty);
        ctx.drawImage(images[p.tiles[2]], tx,     ty + 8);
        ctx.drawImage(images[p.tiles[3]], tx + 8, ty + 8);
    },

    // L0930 / L07D2 — single 8×8 tile at bullet (x, y).
    drawPlayerBullet() {
        const b = state.player.bullet;
        gfx.ctx.drawImage(resource.fgTileImages[b.tile], b.x, b.y);
    },

    // EnemyBulletDataController $0CD8 — draw active enemy bullets. Each
    // bullet is a single 8×8 fg tile in the range $58-$5F (shape stored on
    // the bullet itself; L0C84 animates by toggling bit 2 between $58/$5C,
    // $59/$5D, etc.). Inactive slots (state & 0x08 == 0) are skipped.
    drawEnemyBullets() {
        const ctx = gfx.ctx;
        const images = resource.fgTileImages;
        for (const b of state.enemyBullets) {
            if ((b.state & 0x08) === 0) continue;
            ctx.drawImage(images[b.shape], b.x, b.y);
        }
    },

    // Alien-kill explosion sprites — 2 slots, mirror of L0FC0's Draw3x2.
    // explosionUpdate (states.js) stores the active T17B0 frame LSB on
    // each slot; this function reads it, walks the 6-byte tile list at
    // (frameLsb - 0xB0) inside ALIEN_EXPLOSION_ROM, and draws each tile.
    //
    // 3x2 column-major layout (consistent with the rotated-CRT tile
    // ordering documented in research_rendering.md §2.5):
    //   tiles[0]  → (x,    y)         col1 top
    //   tiles[1]  → (x,    y+8)       col1 bot
    //   tiles[2]  → (x+8,  y)         col2 top
    //   tiles[3]  → (x+8,  y+8)       col2 bot
    //   tiles[4]  → (x+16, y)         col3 top
    //   tiles[5]  → (x+16, y+8)       col3 bot
    //
    // tile==0 is the blank/empty character; skip its drawImage call so
    // frame #5 (all zeros) and the sparse cells of frames #3/#4 stay
    // transparent (canvas already cleared per frame).
    drawExplosions() {
        const ctx = gfx.ctx;
        const images = resource.fgTileImages;
        for (const e of state.explosions) {
            if (e.counter === 0) continue;
            const base = e.frameLsb - 0xB0;
            for (let c = 0; c < 3; c++) {
                for (let r = 0; r < 2; r++) {
                    const tile = ALIEN_EXPLOSION_ROM[base + c * 2 + r];
                    if (tile === 0) continue;
                    ctx.drawImage(images[tile], e.x + c * 8, e.y + r * 8);
                }
            }
        }
    },

    // Bonus-kill explosion sprites — 2 slots, mirror of L3758's combined
    // 6×2 sprite (T17D0 left half + T17D6 right half = 48w × 16h) with
    // the BCD score digits overlaid in the middle via L37B0.
    //
    // Source layout: 6 columns × 2 rows, column-major (same convention
    // as alien explosion):
    //   col 0  C4 D4  ┐
    //   col 1  C5 D5  ├ left half (T17D0)
    //   col 2  C3 C3  ┘  ← placeholder
    //   col 3  C3 C3  ┐  ← placeholder (right half T17D6)
    //   col 4  C6 D6  ├ right half (T17D6)
    //   col 5  C7 D7  ┘
    //
    // Source L37B0 walks 3 cells writing [hi-digit, lo-digit, '0'] going
    // left-to-right via LeftOneColumn / RightOneColumn. The middle two
    // columns of the sprite are dedicated placeholders ($C3); the third
    // digit ('0') lands one column to the right, overwriting a real
    // sprite tile (C6/D6 area). Port matches this by drawing digit tiles
    // at sprite cols 2, 3, 4 on the top row.
    //
    // (e.x, e.y) is the top-left pixel of the 48×16 bonus sprite; spawn
    // centers it on the alien's bounding box (see onAlienHit / step 10.7.4).
    //
    // Offsets into ALIEN_EXPLOSION_ROM (slice starts at $17B0):
    //   $17D0 left half  → offset 32 (= $20)
    //   $17D6 right half → offset 38 (= $26)
    drawBonusExplosions() {
        const ctx = gfx.ctx;
        const images = resource.fgTileImages;
        const T17D0_OFFSET = 0x17D0 - 0x17B0;   // 32
        const T17D6_OFFSET = 0x17D6 - 0x17B0;   // 38
        for (const e of state.bonusExplosions) {
            if (e.counter === 0) continue;

            // L3758 spread animation: the two halves move apart over the
            // 16-tick lifetime, exposing the score digits in the middle.
            // Source formula (Code.md $3764-$376C):
            //   A = ($0F - counter) & $0E, then A *= 16
            // Source draws left half at screen-RAM addr `DE + $60 + A` and
            // right half at `DE - A`. In source's rotated screen RAM,
            // LeftOneColumn ($0210) adds 32 to the address (= 1 display
            // column left = 8 display pixels), so the byte-to-pixel ratio
            // is A_source / 4. Bigger source-RAM offset → smaller display
            // X for the left half (moves LEFT), more negative for the
            // right half → larger display X (moves RIGHT). The base $60
            // = 24 px = 3 columns maps to the touching-at-spawn position
            // in the port (left half at e.x, right half at e.x + 24).
            //
            // Per-side pixel offset = (($0F - counter) & $0E) * 4:
            //   walks 0, 0, 8, 8, 16, 16, ..., 56 over the 16 ticks.
            // Two halves separate from touching to 112 px apart at end.
            //
            // Spawn-frame edge case: counter starts at $10. If the very
            // first drawBonusExplosions happens BEFORE the first
            // bonusExplosionUpdate (e.g. kill lands on a lane that doesn't
            // run bonus update this tick), counter is still $10 at render.
            // The `counter > 0x0F` clamp pins spread to 0 for that frame.
            const spread = e.counter > 0x0F
                ? 0
                : (((0x0F - e.counter) & 0x0E) << 2);
            const leftX  = (e.x - spread) & 0xFF;
            const rightX = (e.x + 24 + spread) & 0xFF;

            // Left half — 3 columns × 2 rows at (leftX, e.y).
            for (let c = 0; c < 3; c++) {
                for (let r = 0; r < 2; r++) {
                    const tile = ALIEN_EXPLOSION_ROM[T17D0_OFFSET + c * 2 + r];
                    if (tile === 0) continue;
                    ctx.drawImage(images[tile], leftX + c * 8, e.y + r * 8);
                }
            }
            // Right half — 3 columns × 2 rows at (rightX, e.y).
            for (let c = 0; c < 3; c++) {
                for (let r = 0; r < 2; r++) {
                    const tile = ALIEN_EXPLOSION_ROM[T17D6_OFFSET + c * 2 + r];
                    if (tile === 0) continue;
                    ctx.drawImage(images[tile], rightX + c * 8, e.y + r * 8);
                }
            }
            // Score digits overlay — STAY at the original middle position
            // even as the halves spread (matches source L37B0, which reads
            // the slot's stored screen address — never updated — for the
            // digit anchor). 3 cells: hi, lo, always-'0'. Top row.
            // Source L37B0: hi-digit = scoreBcd >> 4, lo-digit = scoreBcd & 0xF.
            // Tile code = $20 | digit (matches scoring.js printNumber convention).
            const hi = (e.scoreBcd >> 4) & 0x0F;
            const lo =  e.scoreBcd       & 0x0F;
            ctx.drawImage(images[0x20 | hi], e.x + 16, e.y);
            ctx.drawImage(images[0x20 | lo], e.x + 24, e.y);
            ctx.drawImage(images[0x20      ], e.x + 32, e.y);
        }
    },

    // BG plane — 26 cols × 33 rows. Row 0 is the "hidden" row above the
    // visible area (canvas y = -8..-1 + scrollPixel). Rows 1..32 are
    // visible, each at canvas y = (r-1)*8 + scrollPixel, so they cover
    // y = 0..255 when scrollPixel = 0 and y = 7..262 when scrollPixel = 7.
    // The 8th step (scrollPixel == 8) is the rollover: starsScrollDown
    // shifts the buffer down by one row, refills the new row 0 from ROM,
    // and resets scrollPixel to 0 — so the fill always lands fully
    // off-screen, never visible to the player. State.scrollPixel is the
    // smooth per-pixel scroll offset (0..7) updated each game tick.
    drawBackground() {
        const ctx = gfx.ctx;
        const images = resource.bgTileImages;
        if (!images) return;
        const tiles = state.bgTiles;
        const scrollPixel = state.scrollPixel;
        for (let r = 0; r <= 32; r++) {
            const y = (r - 1) * 8 + scrollPixel;
            if (y >= 256 || y <= -8) continue;
            for (let c = 0; c < 26; c++) {
                const tile = tiles[r * 26 + c];
                if (tile === 0) continue;
                ctx.drawImage(images[tile], c * 8, y);
            }
        }
    },

    drawDebugGrid() {
        const ctx = gfx.ctx;
        ctx.strokeStyle = "#101010";
        ctx.lineWidth = 1;
        for (let x = 0; x <= gfx.width; x += 8) {
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, gfx.height);
            ctx.stroke();
        }
        for (let y = 0; y <= gfx.height; y += 8) {
            ctx.beginPath();
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(gfx.width, y + 0.5);
            ctx.stroke();
        }
    },

    drawTileRomOverlay() {
        // 16×16 grid of 8×8 tiles = 128×128, top-left corner.
        const ctx = gfx.ctx;
        const images = (this.gridMode === GRID_FG)
            ? resource.fgTileImages
            : resource.bgTileImages;
        if (!images) return;
        for (let i = 0; i < 256; i++) {
            const col = i & 0x0F;
            const row = i >> 4;
            ctx.drawImage(images[i], col * 8, row * 8);
        }
    },

    drawHud() {
        const hud = document.getElementById('hud');
        if (!hud) return;
        const gridLabel = ["off", "fg", "bg"][this.gridMode];
        const stage = state.levelAndRound & 0x0F;
        const round = state.levelAndRound >> 4;
        const scoreHex =
            state.score1[2].toString(16).padStart(2,'0') +
            state.score1[1].toString(16).padStart(2,'0') +
            state.score1[0].toString(16).padStart(2,'0');
        hud.textContent =
            `tick=${runloop.tickCount}  state=${state.gameState}  stage=${stage} round=${round}\n` +
            `counterA5=${state.counterA5}  counterB4=${state.stageBlock[9]}  counterB9=${state.counterB9.toString(16).padStart(2,'0')}  lane=${state.combatLane & 3}\n` +
            `aliens=${state.aliensLeft}  birds=${state.birdsLeft}  mat=${state.maturity.toString(16).padStart(2,'0')}  score=${scoreHex}  grid=${gridLabel}\n` +
            `keys: ←/→ move · space fire · shift barrier · 5 coin · 1 start · g cycle tile-ROM overlay`;
    },
};
