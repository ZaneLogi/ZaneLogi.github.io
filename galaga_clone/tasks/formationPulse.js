// f_1DE6 — formation expand/contract pulse at 15 Hz (every 4 frames)
// Bitmap-controlled per-column (X) and per-row (Y) pixel offsets.
// Active only at steady state; f_2A90 hands off to this task.

// d_1E64_bitmap_tables — ported verbatim from gg1-2_fx.s:1721
// 4 rows × 16 bytes: bytes 0-9 = column offsets, bytes 10-15 = row offsets.
// Each byte is circularly right-rotated (rrc) each tick; carry bit = update.
// Outer bytes (0xFF) produce a carry every tick; inner bytes (0x10) rarely.
const BITMAP_ROWS = [
    [0xFF,0x77,0x55,0x14,0x10,0x10,0x14,0x55,0x77,0xFF, 0x00,0x10,0x14,0x55,0x77,0xFF],
    [0xFF,0x77,0x55,0x51,0x10,0x10,0x51,0x55,0x77,0xFF, 0x00,0x10,0x51,0x55,0x77,0xFF],
    [0xFF,0x77,0x57,0x15,0x10,0x10,0x15,0x57,0x77,0xFF, 0x00,0x10,0x15,0x57,0x77,0xFF],
    [0xFF,0xF7,0xD5,0x91,0x10,0x10,0x91,0xD5,0xF7,0xFF, 0x00,0x10,0x91,0xD5,0xF7,0xFF],
];

export function update(state) {
    if (state.frameCount % 4 !== 0) return;

    const f = state.formation;
    const expanding = (f.pulseCounter & 0x80) === 0;
    const dir = expanding ? 1 : -1;

    // rrc each bitmap byte (circular right rotate).
    // Carry (former bit 0) → update this slot's offset.
    // Left cols 0-4: invert direction (expand leftward when expanding).
    // Right cols 5-9 and all rows 10-15: use dir directly.
    for (let i = 0; i < 16; i++) {
        const b = f.pulseBitmap[i];
        const carry = b & 1;
        f.pulseBitmap[i] = ((b >>> 1) | (carry << 7)) & 0xFF;
        if (carry) {
            f.pulseOffsets[i] += (i < 5) ? -dir : dir;
        }
    }

    // Advance pulse counter; toggle phase at boundaries.
    // Expanding: 0x00 → 0x1F (32 steps), then jump to 0xA0 (set bit 7).
    // Contracting: 0xA0 → 0x81 (31 steps), then jump to 0x00 (clear bit 7).
    if (expanding) {
        f.pulseCounter = (f.pulseCounter === 0x1F) ? 0xA0 : f.pulseCounter + 1;
    } else {
        f.pulseCounter = (f.pulseCounter === 0x81) ? 0x00 : f.pulseCounter - 1;
    }

    // Reload bitmap row when lower 3 bits of updated counter are zero
    // (a full 8-rrc cycle has completed for all bytes in the current row).
    if ((f.pulseCounter & 0x07) === 0) {
        const row = (f.pulseCounter & 0x18) >> 3;
        f.pulseBitmap = [...BITMAP_ROWS[row]];
    }
}
