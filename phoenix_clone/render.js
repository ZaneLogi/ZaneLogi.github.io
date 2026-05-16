import { gfx } from './gfx.js';
import { state } from './state.js';
import { runloop } from './runloop.js';
import { input } from './input.js';
import { resource } from './resource.js';
import { ALIEN_SHAPE_TABLE } from './data.js';   // source T1420

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
        this.drawDebugGrid();
        if (this.gridMode !== GRID_OFF) this.drawTileRomOverlay();
        for (const row of state.staticTextRows) gfx.drawObject(row);
        for (const alien of state.aliens) this.drawAlien(alien);
        if (state.player.alive) this.drawPlayer();
        if (state.player.bullet.active) this.drawPlayerBullet();
        this.drawHud();
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
        hud.textContent =
            `tick=${runloop.tickCount}  ` +
            `state=${state.gameState}  ` +
            `stage=${stage} round=${round}  ` +
            `counterA5=${state.counterA5}  ` +
            `counterB4=${state.stageBlock[9]}  ` +
            `lane=${state.combatLane & 3}  ` +
            `aliens=${state.aliensLeft}  ` +
            `score=${state.score1[2].toString(16).padStart(2,'0')}${state.score1[1].toString(16).padStart(2,'0')}${state.score1[0].toString(16).padStart(2,'0')}  ` +
            `grid=${gridLabel}\n` +
            `keys: ←/→ move · space fire · shift barrier · 5 coin · 1 start · g cycle tile-ROM overlay`;
    },
};
