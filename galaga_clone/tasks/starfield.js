// f_1D76 — starfield scroll control
//
// The original arcade has dedicated starfield hardware with two independent
// scroll accumulators driving stars at different speeds — creating a parallax
// effect. We simulate this with two star layers.
//
// Enabled:  when stage begins (game_ctrl.s:312)
// Disabled: during attract / game-over (game_ctrl.s:179)
// Frozen:   when state.starCtrl.scrollEnable = false (ship off screen)
// Note:     flip_screen (cocktail cabinet direction reversal) is not applicable
//           to an HTML5 game and is intentionally omitted.

// ── Star palette (faithful 2-2-2 RGB) ──────────────────────────────────────
// The Galaga star circuit is pure hardware — the Z80 only writes scroll/freeze
// bits to $A000-$A005 (task_man.s:358-382); it has NO colour control. Each star
// is a 6-bit colour: 2 bits per gun (R,G,B), each gun mapped through the four
// resistor-network levels {0x00,0x47,0x97,0xDE} (MAME PALETTE_INIT(galaga),
// `map[4]`). That's 63 visible full-spectrum colours — red/green/blue/yellow/
// cyan/magenta/white and every mix — not the old blue/purple/white tints.
// See research_starfield.md. Brightness comes from the colour itself, so both
// scroll layers draw from the same set (the 2-speed split is a parallax
// approximation, separate from the palette).
const STAR_LEVELS = [0x00, 0x47, 0x97, 0xDE];
const STAR_COLORS = (() => {
    const out = [];
    for (const r of STAR_LEVELS)
        for (const g of STAR_LEVELS)
            for (const b of STAR_LEVELS)
                if (r || g || b) out.push(`rgb(${r},${g},${b})`);
    return out;   // 63 colours (the 64th, 0,0,0, is an invisible/black star)
})();

// ── Star counts matching the original dual-generator hardware ──────────────
const COUNT_SLOW = 32;
const COUNT_FAST = 31;

// ── Scroll speeds (pixels per logic tick at 60 Hz) ────────────────────────
// Slow layer ≈ 0.25 px/frame, fast layer ≈ 0.5 px/frame.
// Both scale by starCtrl.speed (1–4, set by stage number).
const SPEED_SLOW = 0.25;
const SPEED_FAST = 0.50;

// Module-level star arrays — persist across enable/disable cycles just as
// the hardware starfield persists across gameplay events.
let slowStars = [];
let fastStars = [];
let ready = false;

function createLayer(count, colors) {
    const stars = [];
    for (let i = 0; i < count; i++) {
        stars.push({
            x:     Math.random() * 224,
            y:     Math.random() * 288,
            color: colors[Math.floor(Math.random() * colors.length)],
        });
    }
    return stars;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

export function init(state) {
    if (!ready) {
        slowStars = createLayer(COUNT_SLOW, STAR_COLORS);
        fastStars = createLayer(COUNT_FAST, STAR_COLORS);
        ready = true;
    }
    // Start scrolling immediately when task is enabled via dev panel.
    // In the real game flow this is controlled by the ship being on screen.
    state.starCtrl.scrollEnable = true;
}

export function update(state) {
    if (!ready) init(state);  // lazy init on first enabled tick
    if (!state.starCtrl.scrollEnable) return;  // frozen when ship off screen

    const speed = state.starCtrl.speed;

    // Scroll REVERSES (stars go UP) during the tractor-beam pull. Z80: the
    // star_ctrl[1] (99BA) flag flips f_1D76's scroll value to the reverse
    // direction (gg1-2_fx.s:1423-1447, the `neg`); it's SET at l_236D
    // (gg1-3.s:691) when f_20F2 starts pulling the ship, and CLEARED at
    // capture-complete (l_2305) / boss-shot-mid-capture (l_2327). The clone's
    // pullShip task is active for exactly that window. Wrap handles both edges.
    const dir = state.tasks.pullShip ? -1 : 1;

    for (const s of slowStars) {
        s.y = (s.y + SPEED_SLOW * speed * dir + 288) % 288;
    }
    for (const s of fastStars) {
        s.y = (s.y + SPEED_FAST * speed * dir + 288) % 288;
    }
}

export function render(state) {
    if (!state.tasks.starfield || !ready) return;

    const ctx = state.ctx;

    for (const s of slowStars) {
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x | 0, s.y | 0, 1, 1);
    }
    for (const s of fastStars) {
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x | 0, s.y | 0, 1, 1);
    }
}

export function destroy(state) {
    // Freeze stars but keep positions — matches hardware behaviour where
    // stars stop scrolling but don't disappear when the task is disabled.
    state.starCtrl.scrollEnable = false;
}
