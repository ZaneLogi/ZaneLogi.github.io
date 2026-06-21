// Explosion animator — bug death-burst (Z80 case_24B2, gg1-3.s:945) and the
// player-ship explosion (case_243C, gg1-3.s:850).
//
// Not a 1:1 Z80 task: it stands in for the disposition-4 / disposition-8 sprite
// state machines the clone hadn't modeled (enemyStatus used to jump alive→dead
// with no exploding frames, and the player just vanished). Bursts are spawned by
// enemyStatus (bug kill) and bombUpdate/gameController (ship death); this task
// advances each burst's frame and draws it, then frees the slot.
//
// An explosion entry (state.explosions[]):
//   { alive, x, y, frames: HTMLCanvasElement[], frame, timer, holdFrames }
// The sprite is drawn centered on (x, y), so 16×16 (bug) and 32×32 (ship) bursts
// both work without per-kind sizing.

// Spawn a death-burst at (x, y). `frames` is the decoded sprite array (e.g.
// resource.explosionBug); `holdFrames` is how many game-frames each frame shows.
export function spawnExplosion(state, x, y, frames, holdFrames = 4) {
    if (!frames || !frames.length) return;
    let ex = state.explosions.find(e => !e.alive);
    if (!ex) { ex = {}; state.explosions.push(ex); }
    ex.alive      = true;
    ex.x          = x | 0;
    ex.y          = y | 0;
    ex.frames     = frames;
    ex.frame      = 0;
    ex.holdFrames = holdFrames;
    ex.timer      = holdFrames;
}

export function update(state) {
    for (const ex of state.explosions) {
        if (!ex.alive) continue;
        if (--ex.timer > 0) continue;
        ex.timer = ex.holdFrames;
        if (++ex.frame >= ex.frames.length) ex.alive = false;   // past the last frame → done
    }
}

export function render(state) {
    const ctx = state.ctx;
    for (const ex of state.explosions) {
        if (!ex.alive) continue;
        const sprite = ex.frames[ex.frame];
        if (sprite) ctx.drawImage(sprite, ex.x - (sprite.width >> 1), ex.y - (sprite.height >> 1));
    }
}
