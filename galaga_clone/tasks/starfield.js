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

// ── Star palette ───────────────────────────────────────────────────────────
// The original hardware produces stars in 6 colours. We approximate with two
// sets: dim (slow layer) and bright (fast layer).
const COLORS_SLOW = ['#336', '#448', '#446', '#558', '#667', '#778'];
const COLORS_FAST = ['#88a', '#99b', '#aac', '#bbf', '#cce', '#fff'];

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
            y:     Math.random() * 256,
            color: colors[Math.floor(Math.random() * colors.length)],
        });
    }
    return stars;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

export function init(state) {
    if (!ready) {
        slowStars = createLayer(COUNT_SLOW, COLORS_SLOW);
        fastStars = createLayer(COUNT_FAST, COLORS_FAST);
        ready = true;
    }
    // Start scrolling immediately when task is enabled via dev panel.
    // In the real game flow this is controlled by the ship being on screen.
    state.starCtrl.scrollEnable = true;
}

export function update(state) {
    if (!state.starCtrl.scrollEnable) return;  // frozen when ship off screen

    const speed = state.starCtrl.speed;

    for (const s of slowStars) {
        s.y += SPEED_SLOW * speed;
        if (s.y >= 256) s.y -= 256;
    }
    for (const s of fastStars) {
        s.y += SPEED_FAST * speed;
        if (s.y >= 256) s.y -= 256;
    }
}

export function render(state) {
    if (!state.tasks.starfield) return;

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
