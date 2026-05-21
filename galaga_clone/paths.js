// Galaga path-data tables — verified extraction from the Z80 source.
//
// Sources:
//   Path-data blocks: gg1-5.s (db_flv_XXXX labels)
//   Pointer index:    gg1-3.s:1918 (db_2A3C — 24 entries)
//   Variant table:    gg1-3.s:1928 (db_2A6C — initial position/angle per variant)
//   Slot lookup:      gg1-5.s:185  (sprt_fmtn_hpos — object ID → row/col)
//
// All 22 unique path-data blocks referenced from db_2A3C are now ported.
// Token-bearing paths (those that use F7/F0 sub-calls or FB turn-home)
// will not execute correctly until phase 3e wires up token semantics —
// the current interpreter only handles 0xFF END and skips other tokens
// 1 byte at a time, which mis-reads .dw arguments as segment data.
// Porting the bytes here so the data is in place when that lands.

// ── Path-data blocks (in numeric address order) ───────────────────────
// Each is a Uint8Array of 3-byte segments (byte0 = 0xYX nibbles → vy hi /
// vx lo signed 4-bit; byte1 = signed rotation rate; byte2 = duration in
// frames) plus tokens (≥ 0xEF, dispatched by the interpreter).

// gg1-5.s:82 — token-bearing (F7 + F0 sub-calls, FB turn-home).
const path_001D = new Uint8Array([
    0x23, 0x06, 0x16, 0x23, 0x00, 0x19,
    0xF7, 0x4B, 0x00,                    // CALL p_flv_004B
    0x23, 0xF0, 0x02,
    0xF0, 0x5E, 0x00,                    // CALL p_flv_005E
    0x23, 0xF0, 0x24, 0xFB, 0x23, 0x00, 0xFF, 0xFF,
]);

// gg1-5.s:144 — token-bearing.
const path_0067 = new Uint8Array([
    0x23, 0x08, 0x08, 0x23, 0x03, 0x1B, 0x23, 0x08, 0x0F, 0x23, 0x16, 0x15,
    0xF7, 0x84, 0x00,                    // CALL p_flv_0084
    0x23, 0x16, 0x03,
    0xF0, 0x97, 0x00,                    // CALL p_flv_0097
    0x23, 0x16, 0x19, 0xFB, 0x23, 0x00, 0xFF, 0xFF,
]);

// gg1-5.s:158 — token-bearing.
const path_009F = new Uint8Array([
    0x33, 0x06, 0x18, 0x23, 0x00, 0x18,
    0xF7, 0xB6, 0x00,                    // CALL p_flv_00B6
    0x23, 0xF0, 0x08,
    0xF0, 0xCC, 0x00,                    // CALL p_flv_00CC
    0x23, 0xF0, 0x20, 0xFB, 0x23, 0x00, 0xFF, 0xFF,
]);

// gg1-5.s:172 — token-bearing.
const path_00D4 = new Uint8Array([
    0x23, 0x03, 0x18, 0x33, 0x04, 0x10, 0x23, 0x08, 0x0A, 0x44, 0x16, 0x12,
    0xF7, 0x60, 0x01,                    // CALL p_flv_0160
    0x44, 0x16, 0x03,
    0xF0, 0x73, 0x01,                    // CALL p_flv_0173 (stage 13)
    0x44, 0x16, 0x1D, 0xFB, 0x23, 0x00, 0xFF, 0xFF,
]);

// gg1-5.s:201 — token-bearing.
const path_017B = new Uint8Array([
    0x23, 0x06, 0x18, 0x23, 0x00, 0x18,
    0xF7, 0x92, 0x01,                    // CALL p_flv_0192
    0x44, 0xF0, 0x08,
    0xF0, 0xA8, 0x01,                    // CALL p_flv_01A8
    0x44, 0xF0, 0x20, 0xFB, 0x23, 0x00, 0xFF, 0xFF,
]);

// gg1-5.s:215 — token-bearing.
const path_01B0 = new Uint8Array([
    0x23, 0x03, 0x20, 0x23, 0x08, 0x0F, 0x23, 0x16, 0x12,
    0xF7, 0xCA, 0x01,                    // CALL p_flv_01CA
    0x23, 0x16, 0x03,
    0xF0, 0xE0, 0x01,                    // CALL p_flv_01E0
    0x23, 0x16, 0x1D, 0xFB, 0x23, 0x00, 0xFF, 0xFF,
]);

// gg1-5.s:229 — token-free; phase 2 test target.
const path_01E8 = new Uint8Array([
    0x23, 0x00, 0x10,   // vx=+3 vy=+2 rot= 0    dur=16
    0x23, 0x01, 0x40,   // vx=+3 vy=+2 rot=+1    dur=64
    0x22, 0x0c, 0x37,   // vx=+2 vy=+2 rot=+12   dur=55
    0x23, 0x00, 0xff,   // vx=+3 vy=+2 rot= 0    dur=255  (long tail)
    0xff,               // END
]);

// gg1-5.s:232 — token-free.
const path_01F5 = new Uint8Array([
    0x23, 0x02, 0x3A, 0x23, 0x10, 0x09, 0x23, 0x00, 0x18, 0x23, 0x20, 0x10,
    0x23, 0x00, 0x18, 0x23, 0x20, 0x0D, 0x23, 0x00, 0xFF, 0xFF,
]);

// gg1-5.s:236 — token-free.
const path_020B = new Uint8Array([
    0x23, 0x00, 0x10, 0x23, 0x01, 0x30, 0x00, 0x40, 0x08, 0x23, 0xFF, 0x30,
    0x23, 0x00, 0xFF, 0xFF,
]);

// gg1-5.s:239 — token-free; tight maneuver with 1-frame sharp-turn segment.
const path_021B = new Uint8Array([
    0x23, 0x00, 0x30,
    0x23, 0x05, 0x80,
    0x23, 0x05, 0x4c,
    0x23, 0x04, 0x01,   // 1-frame burst — rapid heading change
    0x23, 0x00, 0x50,
    0xff,
]);

// gg1-5.s:242 — token-free; includes a pure-spin segment.
const path_022B = new Uint8Array([
    0x23, 0x00, 0x28,
    0x23, 0x06, 0x1d,
    0x23, 0x00, 0x11,
    0x00, 0x40, 0x08,   // vx=0 vy=0 rot=+64 dur=8  → half-revolution spin
    0x23, 0x00, 0x11,
    0x23, 0xfa, 0x1d,   // rot=−6 (signed 0xfa)
    0x23, 0x00, 0x50,
    0xff,
]);

// gg1-5.s:246 — token-free.
const path_0241 = new Uint8Array([
    0x23, 0x00, 0x21, 0x00, 0x20, 0x10, 0x23, 0xF8, 0x20, 0x23, 0xFF, 0x20,
    0x23, 0xF8, 0x1B, 0x23, 0xE8, 0x0B, 0x23, 0x00, 0x21, 0x00, 0x20, 0x08,
    0x23, 0x00, 0x42, 0xFF,
]);

// gg1-5.s:250 — token-free; PATH_INDEX entries 12 & 23 form a variant pair.
const path_025D = new Uint8Array([
    0x23, 0x00, 0x08, 0x00, 0x20, 0x08, 0x23, 0xF0, 0x20, 0x23, 0x10, 0x20,
    0x23, 0xF0, 0x40, 0x23, 0x10, 0x20, 0x23, 0xF0, 0x20, 0x00, 0x20, 0x08,
    0x23, 0x00, 0x30, 0xFF,
]);

// gg1-5.s:254 — token-free; longest of the simple paths (~12 segments).
const path_0279 = new Uint8Array([
    0x23, 0x10, 0x0C, 0x23, 0x00, 0x20, 0x23, 0xE8, 0x10, 0x23, 0xF4, 0x10,
    0x23, 0xE8, 0x10, 0x23, 0xF4, 0x32, 0x23, 0xE8, 0x10, 0x23, 0xF4, 0x32,
    0x23, 0xE8, 0x10, 0x23, 0xF4, 0x10, 0x23, 0xE8, 0x0E, 0x23, 0x02, 0x30,
    0xFF,
]);

// gg1-5.s:259 — token-free.
const path_029E = new Uint8Array([
    0x23, 0xF1, 0x08, 0x23, 0x00, 0x10, 0x23, 0x05, 0x3C, 0x23, 0x07, 0x42,
    0x23, 0x0A, 0x40, 0x23, 0x10, 0x2D, 0x23, 0x20, 0x19, 0x00, 0xFC, 0x14,
    0x23, 0x02, 0x4A, 0xFF,
]);

// gg1-5.s:263 — token-free; symmetric back-and-forth pattern.
const path_02BA = new Uint8Array([
    0x23, 0x04, 0x20, 0x23, 0x00, 0x16, 0x23, 0xF0, 0x30, 0x23, 0x00, 0x12,
    0x23, 0x10, 0x30, 0x23, 0x00, 0x12, 0x23, 0x10, 0x30, 0x23, 0x00, 0x16,
    0x23, 0x04, 0x20, 0x23, 0x00, 0x10, 0xFF,
]);

// gg1-5.s:267 — token-free.
const path_02D9 = new Uint8Array([
    0x23, 0x00, 0x15, 0x00, 0x20, 0x08, 0x23, 0x00, 0x11, 0x00, 0xE0, 0x08,
    0x23, 0x00, 0x18, 0x00, 0x20, 0x08, 0x23, 0x00, 0x13, 0x00, 0xE0, 0x08,
    0x23, 0x00, 0x1F, 0x00, 0x20, 0x08, 0x23, 0x00, 0x30, 0xFF,
]);

// gg1-5.s:272 — token-free.
const path_02FB = new Uint8Array([
    0x23, 0x02, 0x0E, 0x23, 0x00, 0x34, 0x23, 0x12, 0x19, 0x23, 0x00, 0x20,
    0x23, 0xE0, 0x0E, 0x23, 0x00, 0x12, 0x23, 0x20, 0x0E, 0x23, 0x00, 0x0C,
    0x23, 0xE0, 0x0E, 0x23, 0x1B, 0x08, 0x23, 0x00, 0x10, 0xFF,
]);

// gg1-5.s:277 — token-free; short.
const path_031D = new Uint8Array([
    0x23, 0x00, 0x0D, 0x00, 0xC0, 0x04, 0x23, 0x00, 0x21, 0x00, 0x40, 0x06,
    0x23, 0x00, 0x51, 0x00, 0xC0, 0x06, 0x23, 0x00, 0x73, 0xFF,
]);

// gg1-5.s:281 — token-free; symmetric back-and-forth.
const path_0333 = new Uint8Array([
    0x23, 0x08, 0x20, 0x23, 0x00, 0x16, 0x23, 0xE0, 0x0C, 0x23, 0x02, 0x0B,
    0x23, 0x11, 0x0C, 0x23, 0x02, 0x0B, 0x23, 0xE0, 0x0C, 0x23, 0x00, 0x16,
    0x23, 0x08, 0x20, 0xFF,
]);

// gg1-5.s:2893 — token-free; challenge-stage path.
const path_0FDA = new Uint8Array([
    0x23, 0x00, 0x1B, 0x23, 0xF0, 0x40, 0x23, 0x00, 0x09, 0x23, 0x05, 0x11,
    0x23, 0x00, 0x10, 0x23, 0x10, 0x40, 0x23, 0x04, 0x30, 0xFF,
]);

// gg1-5.s:2896 — token-free; challenge-stage path; shortest.
const path_0FF0 = new Uint8Array([
    0x23, 0x02, 0x35, 0x23, 0x08, 0x10, 0x23, 0x10, 0x3C, 0x23, 0x00, 0xFF, 0xFF,
]);

// ── Attack-dive path tables (step 8) ──────────────────────────────────
// Verified from gg1-5.s:285 (yellow) and gg1-5.s:311 (red). Unlike fly-in
// (24-entry pointer index → many small db_flv_XXXX blocks), attack dives
// are TWO flat self-contained byte arrays. Each enemy class loads one of
// these as its full path; sub-paths are embedded inline (called via FD
// JUMP / F7 ATTACK_TURN with .dw addresses, not separate exports).
//
// Loaded by: case_bmbr_yellow (gg1-2_fx.s:973) and case_bmbr_red (1004).
// See architecture.html §5b for full research findings.
//
// Note: byte 0 of each table is just the first segment's opcode (vy hi /
// vx lo nibbles), not a special "header" — the launcher passes the table
// start address straight to the interpreter, which begins executing
// immediately at offset 0.

// gg1-5.s:285 — yellow alien (capture-capable bee), 90 bytes total.
// Uses tokens F3, F6, F7, EF, F8, F9, FA, FB, FC, FD + flow-control.
// Sub-paths embedded inline at offsets matching p_flv_0352, _0358,
// _0363, _036C, _037C, _039E.
export const ATTACK_PATH_YELLOW = new Uint8Array([
    // header / first segment
    0x12, 0x18, 0x1E,
    // p_flv_0352 (offset 3)
    0x12, 0x00, 0x34, 0x12, 0xFB, 0x26,
    // p_flv_0358 (offset 9)
    0x12, 0x00, 0x02, 0xFC, 0x2E, 0x12, 0xFA, 0x3C, 0xFA, 0x9E, 0x03,
    // p_flv_0363 (offset 20)
    0x12, 0xF8, 0x10, 0x12, 0xFA, 0x5C, 0x12, 0x00, 0x23,
    // p_flv_036C (offset 29)
    0xF8, 0xF9, 0xEF, 0x7C, 0x03, 0xF6, 0xAB,
    0x12, 0x01, 0x28, 0x12, 0x0A, 0x18, 0xFD, 0x52, 0x03,
    // p_flv_037C (offset 45)
    0xF6, 0xB0,
    0x23, 0x08, 0x1E, 0x23, 0x00, 0x19, 0x23, 0xF8, 0x16, 0x23, 0x00, 0x02, 0xFC,
    0x30, 0x23, 0xF7, 0x26, 0xFA, 0x9E, 0x03,
    0x23, 0xF0, 0x0A, 0x23, 0xF5, 0x31, 0x23, 0x00, 0x10, 0xFD, 0x6C, 0x03,
    // p_flv_039E (offset 79) — shared return
    0x12, 0xF8, 0x10, 0x12, 0x00, 0x40, 0xFB, 0x12, 0x00, 0xFF, 0xFF,
]);

// gg1-5.s:311 — red moth (free-flight bomber), 104 bytes total.
// Uses tokens F3 (×2 — targeting), F6 (×3 — free-flight), EF, F8, F9,
// FA, FB, FD + flow-control. Sub-paths embedded inline at offsets
// matching p_flv_03AC, _03CC, _03D7, _040C.
export const ATTACK_PATH_RED = new Uint8Array([
    // header / first segment
    0x12, 0x18, 0x1D,
    // p_flv_03AC (offset 3)
    0x12, 0x00, 0x28, 0x12, 0xFA, 0x02, 0xF3,
    0x3F, 0x3B, 0x36, 0x32, 0x28, 0x26, 0x24, 0x22,
    0x12, 0x04, 0x30, 0x12, 0xFC, 0x30, 0x12, 0x00, 0x18, 0xF8, 0xF9, 0xFA, 0x0C, 0x04,
    0xEF, 0xD7, 0x03,
    // p_flv_03CC (offset 35)
    0xF6, 0xB0,
    0x12, 0x01, 0x28, 0x12, 0x0A, 0x15, 0xFD, 0xAC, 0x03,
    // p_flv_03D7 (offset 46)
    0xF6, 0xC0,
    0x23, 0x08, 0x10, 0x23, 0x00, 0x23, 0x23, 0xF8, 0x0F, 0x23, 0x00, 0x48, 0xF8, 0xF9, 0xFA, 0x0C, 0x04,
    0xF6, 0xB0,
    0x23, 0x08, 0x20, 0x23, 0x00, 0x08, 0x23, 0xF8, 0x02, 0xF3,
    0x34, 0x31, 0x2D, 0x29, 0x22, 0x26, 0x1F, 0x18,
    0x23, 0x08, 0x18, 0x23, 0xF8, 0x18, 0x23, 0x00, 0x10, 0xF8, 0xF9, 0xFD, 0xCC, 0x03,
    // p_flv_040C (offset 99) — shared return
    0xFB, 0x12, 0x00, 0xFF, 0xFF,
]);

// Z80 ROM base addresses for FD JUMP / FA LOOP_TOP address translation.
// .dw addresses inside these arrays are absolute Z80 addresses; the path
// interpreter computes JS offset = z80_addr − z80Base.
//
// Yellow: db_flv_atk_yllw is at 0x34F (verified: p_flv_039e at JS offset
//   79 has .dw value 0x9E,0x03 = 0x39E → base = 0x39E − 79 = 0x34F).
// Red:    db_flv_atk_red  is at 0x3A9 (verified: p_flv_040c at JS offset
//   99 has .dw value 0x0C,0x04 = 0x40C → base = 0x40C − 99 = 0x3A9).
ATTACK_PATH_YELLOW.z80Base = 0x34F;
ATTACK_PATH_RED.z80Base    = 0x3A9;

// Convenience accessor for type-driven launches.
export function getAttackPath(type) {
    if (type === 'yellow') return ATTACK_PATH_YELLOW;
    if (type === 'red')    return ATTACK_PATH_RED;
    return null;
}

// All path data keyed by Z80 hex address (matches PATH_INDEX below).
export const PATH_BY_ADDR = {
    0x001D: path_001D,
    0x0067: path_0067,
    0x009F: path_009F,
    0x00D4: path_00D4,
    0x017B: path_017B,
    0x01B0: path_01B0,
    0x01E8: path_01E8,
    0x01F5: path_01F5,
    0x020B: path_020B,
    0x021B: path_021B,
    0x022B: path_022B,
    0x0241: path_0241,
    0x025D: path_025D,
    0x0279: path_0279,
    0x029E: path_029E,
    0x02BA: path_02BA,
    0x02D9: path_02D9,
    0x02FB: path_02FB,
    0x031D: path_031D,
    0x0333: path_0333,
    0x0FDA: path_0FDA,
    0x0FF0: path_0FF0,
};

// ── db_2A3C — 24-entry pointer index ──────────────────────────────────
// Each .dw entry encodes (addr_low_13_bits) | (variant << 13).
// Source: gg1-3.s:1918.
// Entries 22 & 23 reuse paths 0x022B and 0x025D with different variants —
// same data, different start positions for pair members.
export const PATH_INDEX = [
    { addr: 0x001D, variant: 0 },
    { addr: 0x0067, variant: 1 },
    { addr: 0x009F, variant: 2 },
    { addr: 0x00D4, variant: 1 },
    { addr: 0x017B, variant: 0 },
    { addr: 0x01B0, variant: 3 },
    { addr: 0x01E8, variant: 0 },  // ← phase 2 test target
    { addr: 0x01F5, variant: 1 },
    { addr: 0x020B, variant: 0 },
    { addr: 0x021B, variant: 1 },
    { addr: 0x022B, variant: 4 },
    { addr: 0x0241, variant: 1 },
    { addr: 0x025D, variant: 4 },
    { addr: 0x0279, variant: 1 },
    { addr: 0x029E, variant: 0 },
    { addr: 0x02BA, variant: 1 },
    { addr: 0x02D9, variant: 0 },
    { addr: 0x02FB, variant: 1 },
    { addr: 0x031D, variant: 0 },
    { addr: 0x0333, variant: 1 },
    { addr: 0x0FDA, variant: 0 },
    { addr: 0x0FF0, variant: 1 },
    { addr: 0x022B, variant: 5 },
    { addr: 0x025D, variant: 5 },
];

// ── db_2A6C — variant table ────────────────────────────────────────────
// 12 entries × 3 bytes (Y, X, rotHi) — initial position + rotation high
// byte at launch. Source: gg1-3.s:1928-1941.
//
// Indexed as PAIRS: variant_bits N from PATH_INDEX selects pair N
// (entries 2N and 2N+1). Wave-byte bit 6 picks WHICH MEMBER of the pair:
// clear = entry 2N, set = entry 2N+1. So variant_bits N gives 2 possible
// start positions; the wave byte chooses one. See gg1-3.s:1844-1873 for
// the Z80 decoder (rld + and 0x0E + ×3 + bit-7-of-shifted-byte test).
//
// Step 9 phase INT-2c correction: previously this table had only 8
// entries and getPathByIndex used `VARIANTS[entry.variant]` directly,
// which gave wrong start positions for any variant_bits > 0. The
// existing INT-2a test wave looked correct purely by coincidence
// (variants 4 and 5 happened to differ in X). Fixed by expanding to 12
// entries (matching db_2A6C) + reading via resolveWaveByte().
//
// X is ROM sprite coords (canvas_X = X − 10).
export const VARIANTS = [
    { y: 0x9B, x: 0x34, rotHi: 0x03 },  // 0  — pair 0 member 0 (low-bottom-left)
    { y: 0x9B, x: 0x44, rotHi: 0x03 },  // 1  — pair 0 member 1 (low-bottom-right)
    { y: 0x23, x: 0x00, rotHi: 0x00 },  // 2  — pair 1 member 0 (top-left edge)
    { y: 0x23, x: 0x78, rotHi: 0x02 },  // 3  — pair 1 member 1 (top-right edge)
    { y: 0x9B, x: 0x2C, rotHi: 0x03 },  // 4  — pair 2 member 0 (low-bottom, wider)
    { y: 0x9B, x: 0x4C, rotHi: 0x03 },  // 5  — pair 2 member 1
    { y: 0x2B, x: 0x00, rotHi: 0x00 },  // 6  — pair 3 member 0 (mid-top edges)
    { y: 0x2B, x: 0x78, rotHi: 0x02 },  // 7  — pair 3 member 1
    { y: 0x9B, x: 0x34, rotHi: 0x03 },  // 8  — pair 4 member 0 (== pair 0 member 0)
    { y: 0x9B, x: 0x34, rotHi: 0x03 },  // 9  — pair 4 member 1 (== pair 0 member 0; both same)
    { y: 0x9B, x: 0x44, rotHi: 0x03 },  // 10 — pair 5 member 0 (== pair 0 member 1)
    { y: 0x9B, x: 0x44, rotHi: 0x03 },  // 11 — pair 5 member 1 (== pair 0 member 1; both same)
];

// ── sprt_fmtn_hpos — formation slot lookup ────────────────────────────
// 96-byte table at gg1-5.s:185, decoded as 48 entries × (Y_code, X_code).
// Object IDs are BYTE OFFSETS into this table — all even, 0x00–0x5E.
// Entries are scattered to optimise fly-in pairing: pair members occupy
// adjacent IDs (0/1, 2/3, ...) and land in symmetric formation slots.
//
//   Y_code = 0x14 + 2*rowIdx   rows 0-5 = boss / boss / butterfly /
//                                          butterfly / wasp / wasp
//   X_code = 2*colIdx          cols 0-9
export const SPRT_FMTN_HPOS = new Uint8Array([
    // entries 0-7   (IDs 0x00–0x0E)  — boss row 0 then wasp corners
    0x14,0x06, 0x14,0x0c, 0x14,0x08, 0x14,0x0a,
    0x1c,0x00, 0x1c,0x12, 0x1e,0x00, 0x1e,0x12,
    // entries 8-15  (IDs 0x10–0x1E)  — wasp inner cols
    0x1c,0x02, 0x1c,0x10, 0x1e,0x02, 0x1e,0x10,
    0x1c,0x04, 0x1c,0x0e, 0x1e,0x04, 0x1e,0x0e,
    // entries 16-23 (IDs 0x20–0x2E)  — wasp center cols
    0x1c,0x06, 0x1c,0x0c, 0x1e,0x06, 0x1e,0x0c,
    0x1c,0x08, 0x1c,0x0a, 0x1e,0x08, 0x1e,0x0a,
    // entries 24-31 (IDs 0x30–0x3E)  — boss row 1 then butterfly corners
    0x16,0x06, 0x16,0x0c, 0x16,0x08, 0x16,0x0a,
    0x18,0x00, 0x18,0x12, 0x1a,0x00, 0x1a,0x12,
    // entries 32-39 (IDs 0x40–0x4E)  — butterfly inner cols
    0x18,0x02, 0x18,0x10, 0x1a,0x02, 0x1a,0x10,
    0x18,0x04, 0x18,0x0e, 0x1a,0x04, 0x1a,0x0e,
    // entries 40-47 (IDs 0x50–0x5E)  — butterfly center cols
    0x18,0x06, 0x18,0x0c, 0x1a,0x06, 0x1a,0x0c,
    0x18,0x08, 0x18,0x0a, 0x1a,0x08, 0x1a,0x0a,
]);

// Reverse lookup: (rowIdx, colIdx) → objectId. Built once at module load.
// Lets state.js stamp each formation enemy with its Z80-equivalent ID.
const _SLOT_TO_ID = new Map();
for (let id = 0; id < SPRT_FMTN_HPOS.length; id += 2) {
    const yCode = SPRT_FMTN_HPOS[id];
    const xCode = SPRT_FMTN_HPOS[id + 1];
    const row = (yCode - 0x14) / 2;
    const col = xCode / 2;
    _SLOT_TO_ID.set(row * 10 + col, id);
}

export function getObjectIdForSlot(rowIdx, colIdx) {
    return _SLOT_TO_ID.get(rowIdx * 10 + colIdx) ?? null;
}

// ── db_attk_wav_IDs — formation IDs grouped by wave (gg1-3.s:1489) ────
// 5 waves × 8 IDs = 40 enemies per stage. Each wave row supplies 4
// consecutive ID PAIRS (slots 0/1, 2/3, 4/5, 6/7) — the pair members
// share the same wave-byte triplet from STAGE_WAVES, differing only in
// formation slot.
export const ATTK_WAV_IDS = new Uint8Array([
    0x58, 0x5A, 0x5C, 0x5E, 0x28, 0x2A, 0x2C, 0x2E,   // wave 1
    0x30, 0x34, 0x36, 0x32, 0x50, 0x52, 0x54, 0x56,   // wave 2
    0x42, 0x46, 0x40, 0x44, 0x4A, 0x4E, 0x48, 0x4C,   // wave 3
    0x1A, 0x1E, 0x20, 0x24, 0x22, 0x26, 0x18, 0x1C,   // wave 4
    0x08, 0x0C, 0x12, 0x16, 0x10, 0x14, 0x0A, 0x0E,   // wave 5
]);

// ── d_combat_stg_dat — per-stage wave triplets (gg1-3.s:1461) ─────────
// Each stage = 5 wave triplets [byte0, byte1, byte2]:
//   byte0 — transient-attack control (currently ignored — TODO step 10)
//   byte1 — path-byte for member 1 of every pair in this wave
//   byte2 — path-byte for member 2 of every pair in this wave
// Wave-byte bit layout (per gg1-3.s:1450-1458):
//   bits 0-5  index into PATH_INDEX (db_2A3C)
//   bit 6     pair-member selector AND negate-rotation flag — picks
//             VARIANTS[v*2 + 0] or [v*2 + 1], and (when set) inverts the
//             path's per-segment rotRate so partners fly mirrored arcs.
//             See resolveWaveByte for the full semantics.
//   bit 7     per-byte launch gate. CLEAR → this launch waits for
//             frame_cnt & 0x07 == 0 before firing. SET → no gate,
//             fires the frame the launcher reads it.
//   bit 0     bomb-counter init (0 → 0x08, 1 → 0x44).
//
// INT-2c: only stage 1 is ported. Stages 2+ fall back to stage 1 in
// buildWaveStream so the game still runs end-to-end.
const STAGE_WAVES = {
    1: [
        // Source: gg1-3.s:1462 (after expanding `+0x80` constants).
        [0x00, 0x00, 0xC0],   // wave 1 — paired pairs (bit 7 set on m2)
        [0x00, 0x01, 0x01],   // wave 2 — trailing string (bit 7 clear)
        [0x00, 0x41, 0x41],   // wave 3 — trailing string (m1+m2 both pair-member-1)
        [0x00, 0x40, 0x40],   // wave 4 — trailing string (both pair-member-1, path 0)
        [0x00, 0x00, 0x00],   // wave 5 — trailing string (both pair-member-0, path 0)
    ],
};

// ── bmbr_stg_cfg_dat — per-stage difficulty (new_stage.s:143-198) ─────
// 4 sub-tables × 26 stages × 5 bytes per stage (10 packed nibbles).
// Each row supplies the per-stage difficulty parameters that drive the
// continuous-attack manager (f_1B65) and bomb-drop logic.
//
// Sub-table 0 = "rank A" path (per the bmbr_stg_cfg_lut indirection at
// new_stage.s:124-128: index 3 → sub-table 0). Default rank in our port
// is 3 (= rank A — the typical Galaga DIP-switch default for "Easy").
//
// Note: the labeled rank meanings (A/B/C/D) come from typical Galaga
// DIP-switch convention but the exact mapping isn't documented in the
// hackbar disassembly. What IS verified is the data layout: 4 sub-tables
// of 130 (= 0x82) bytes each, indexed via RANK_TO_SUBTABLE below.
const BMBR_STG_CFG_DAT = new Uint8Array([
    // ── Sub-table 0 (rank A — easiest, typical default) ──
    0x00,0x00,0x22,0xC6,0x00, 0x00,0x11,0x23,0xC7,0x00,    // stages 1-2
    0x00,0x00,0x00,0xC0,0x00, 0x11,0x12,0x23,0x97,0x00,    // stages 3-4
    0x11,0x23,0x23,0x98,0x00, 0x21,0x24,0x33,0x98,0x00,    // stages 5-6
    0x00,0x00,0x00,0x90,0x00, 0x22,0x25,0x33,0x99,0x10,    // stages 7-8
    0x22,0x36,0x34,0x69,0x10, 0x10,0x11,0x23,0x97,0x00,    // stages 9-10
    0x00,0x00,0x00,0x60,0x00, 0x32,0x46,0x34,0x67,0x11,    // stages 11-12
    0x32,0x67,0x44,0x68,0x11, 0x32,0x67,0x45,0x68,0x11,    // stages 13-14
    0x00,0x00,0x00,0x60,0x00, 0x42,0x78,0x45,0x69,0x11,    // stages 15-16
    0x42,0x78,0x45,0x69,0x11, 0x11,0x22,0x23,0x97,0x11,    // stages 17-18
    0x00,0x00,0x00,0x60,0x00, 0x52,0x88,0x46,0x3A,0x11,    // stages 19-20
    0x52,0x88,0x56,0x3A,0x11, 0x52,0x88,0x56,0x3C,0x11,    // stages 21-22
    0x00,0x00,0x00,0x30,0x00, 0x62,0x89,0x57,0x3C,0x11,    // stages 23-24
    0x62,0x99,0x57,0x3C,0x11, 0x62,0x99,0x57,0x3C,0x11,    // stages 25-26
    // ── Sub-table 1 ──
    0x00,0x00,0x12,0xC6,0x00, 0x00,0x11,0x22,0xC6,0x00,
    0x00,0x00,0x00,0xC0,0x00, 0x11,0x12,0x23,0x97,0x00,
    0x11,0x12,0x23,0x97,0x00, 0x00,0x11,0x23,0xC7,0x00,
    0x00,0x00,0x00,0x90,0x00, 0x21,0x23,0x33,0x98,0x10,
    0x21,0x24,0x33,0x98,0x10, 0x21,0x25,0x34,0x98,0x10,
    0x00,0x00,0x00,0x60,0x00, 0x22,0x25,0x34,0x68,0x11,
    0x32,0x36,0x44,0x68,0x11, 0x11,0x11,0x23,0x67,0x01,
    0x00,0x00,0x00,0x60,0x00, 0x32,0x36,0x45,0x68,0x11,
    0x32,0x46,0x45,0x69,0x11, 0x32,0x67,0x45,0x69,0x11,
    0x00,0x00,0x00,0x60,0x00, 0x42,0x67,0x46,0x3A,0x11,
    0x42,0x78,0x56,0x3A,0x11, 0x52,0x78,0x56,0x3A,0x11,
    0x00,0x00,0x00,0x30,0x00, 0x52,0x88,0x56,0x3C,0x11,
    0x62,0x99,0x57,0x3C,0x11, 0x62,0x99,0x57,0x3C,0x11,
    // ── Sub-table 2 ──
    0x00,0x00,0x23,0xC6,0x00, 0x10,0x11,0x23,0x97,0x00,
    0x00,0x00,0x00,0xC0,0x00, 0x11,0x12,0x33,0x98,0x00,
    0x21,0x23,0x34,0x68,0x00, 0x21,0x24,0x34,0x68,0x00,
    0x00,0x00,0x00,0x90,0x00, 0x32,0x36,0x34,0x67,0x10,
    0x32,0x46,0x44,0x68,0x10, 0x11,0x11,0x23,0x97,0x10,
    0x00,0x00,0x00,0x60,0x00, 0x42,0x67,0x45,0x68,0x11,
    0x42,0x67,0x45,0x69,0x11, 0x42,0x78,0x46,0x69,0x11,
    0x00,0x00,0x00,0x60,0x00, 0x52,0x78,0x46,0x3A,0x11,
    0x52,0x88,0x56,0x3A,0x11, 0x52,0x88,0x56,0x3A,0x11,
    0x00,0x00,0x00,0x60,0x00, 0x62,0x88,0x56,0x3C,0x11,
    0x62,0x89,0x57,0x3C,0x11, 0x62,0x89,0x57,0x3E,0x11,
    0x00,0x00,0x00,0x30,0x00, 0x72,0x99,0x57,0x3E,0x11,
    0x72,0x99,0x68,0x3E,0x11, 0x72,0x99,0x68,0x3E,0x11,
    // ── Sub-table 3 (rank D — hardest) ──
    0x00,0x00,0x23,0xC6,0x00, 0x10,0x11,0x23,0x97,0x00,
    0x00,0x00,0x00,0xC0,0x00, 0x11,0x12,0x34,0x98,0x00,
    0x21,0x23,0x34,0x68,0x00, 0x21,0x24,0x34,0x68,0x00,
    0x00,0x00,0x00,0x90,0x00, 0x32,0x36,0x45,0x67,0x11,
    0x32,0x46,0x46,0x68,0x11, 0x32,0x56,0x46,0x69,0x11,
    0x00,0x00,0x00,0x60,0x00, 0x42,0x67,0x56,0x6A,0x11,
    0x42,0x67,0x56,0x6A,0x11, 0x42,0x78,0x57,0x6A,0x11,
    0x00,0x00,0x00,0x60,0x00, 0x52,0x78,0x57,0x3A,0x11,
    0x52,0x88,0x57,0x3A,0x11, 0x52,0x88,0x68,0x3C,0x11,
    0x00,0x00,0x00,0x60,0x00, 0x62,0x88,0x68,0x3C,0x11,
    0x62,0x89,0x68,0x3C,0x11, 0x62,0x89,0x68,0x3E,0x11,
    0x00,0x00,0x00,0x30,0x00, 0x72,0x99,0x68,0x3E,0x11,
    0x72,0x99,0x68,0x3E,0x11, 0x72,0x99,0x68,0x3E,0x11,
]);

// Rank → sub-table index mapping (bmbr_stg_cfg_lut, new_stage.s:124-128).
// state.rank is the index INTO this table; the value IS the sub-table.
const RANK_TO_SUBTABLE = [1, 2, 3, 0];

// ── loadStageParms (Z80 c_2C00, new_stage.s:28-119) ───────────────────
// Returns an 11-element Uint8Array of the per-stage difficulty params:
//   [0]  bomb-drop enable flags
//   [1]  bomber-type 0 launch counter init  (boss, per game_ctrl.s:1426)
//   [2]  bomber-type 1 launch counter init  (red,  per game_ctrl.s:1431)
//   [3]  bomber-type 2 launch counter init  (yellow, per game_ctrl.s:1436)
//   [4]  max_bombers (initial cap)
//   [5]  max_bombers_increase (over-time bump)
//   [6]  captured_boss flag init
//   [7]  continuous_bomb_threshold
//   [8]  stage 8+ attack-wave reload flag
//   [9]  stage 8+ bombing reload flag
//   [10] clone-attack alien count (computed, not packed)
//
// Stage cycling: after stage 27 (0x1B), the Z80 keeps subtracting 4
// until <= 27, so the last 4 stages cycle indefinitely. We mirror this.
//
// For stage 1, rank 3 (sub-table 0): byte 2 = 0x22 → params[4] = 2,
// params[5] = 2. So MAX_BOMBERS for stage 1 (easy rank) = 2.
export function loadStageParms(stage, rank = 3) {
    // Stage cycling (Z80 lines 30-35)
    let adjStage = stage;
    while (adjStage > 0x1B) adjStage -= 4;

    // Sub-table base offset (each sub-table is 0x82 = 130 bytes)
    const subtable     = RANK_TO_SUBTABLE[rank & 3];
    const subtableBase = subtable * 0x82;

    // Per-stage offset within sub-table = (adjStage - 1) × 5
    // (Z80 lines 38-44: dec a; rlca; rlca; add a, l → A * 5)
    const stageOffset = (adjStage - 1) * 5;
    const baseOffset  = subtableBase + stageOffset;

    // Unpack 5 bytes into 10 nibbles (Z80 lines 61-79)
    const params = new Uint8Array(11);
    for (let i = 0; i < 5; i++) {
        const b = BMBR_STG_CFG_DAT[baseOffset + i];
        params[i * 2 + 0] = (b >> 4) & 0x0F;   // upper nibble
        params[i * 2 + 1] = b & 0x0F;          // lower nibble
    }

    // Index 10: clone-attack alien count (Z80 lines 82-98)
    //   stage < 3:                     0
    //   challenge stage (stage % 4 == 3):  0
    //   else:                          0x0A
    if (stage < 3) {
        params[10] = 0;
    } else if ((stage & 0x03) === 0x03) {
        params[10] = 0;
    } else {
        params[10] = 0x0A;
    }

    return params;
}

// ── Phase C INT-7: bomber reload-value lookup tables ──────────────────
// Z80 sources at game_ctrl.s:1503-1539. Used by f_0857 (the per-frame
// bomber-config task) to compute reload values for boss/red/yellow timers
// based on per-stage params + current bug count + elapsed stage time.
//
// The original game has these as separate labels (d_08CD, d_08EB, d_0909
// followed by d_0929 in contiguous memory). We mirror the layout so the
// lookup math (offset into a flat array) matches Z80 byte-for-byte.

// d_08CD — red-moth reload table (game_ctrl.s:1503-1513).
// 10 rows × 3 cols. Row index = newStageParms[2] (0-9 nibble).
// Col selection by elapsed stage time (gameTimers[2]):
//   tmr >= 0x28 → col 0 (slowest reload, early stage)
//   0 < tmr < 0x28 → col 1 (mid)
//   tmr == 0     → col 2 (fastest, late stage)
export const D_08CD_RED_RELOAD = new Uint8Array([
    0x09, 0x07, 0x05,
    0x08, 0x06, 0x04,
    0x07, 0x05, 0x04,
    0x06, 0x04, 0x03,
    0x05, 0x03, 0x03,
    0x04, 0x03, 0x03,
    0x04, 0x02, 0x02,
    0x03, 0x03, 0x02,
    0x03, 0x02, 0x02,
    0x02, 0x02, 0x02,
]);

// d_08EB — yellow-bee reload table (game_ctrl.s:1514-1524). Same shape.
// Row index = newStageParms[3]. Col selection identical to d_08CD.
export const D_08EB_YELLOW_RELOAD = new Uint8Array([
    0x06, 0x05, 0x04,
    0x05, 0x04, 0x03,
    0x05, 0x03, 0x03,
    0x04, 0x03, 0x02,
    0x04, 0x02, 0x02,
    0x03, 0x03, 0x02,
    0x03, 0x02, 0x01,
    0x02, 0x02, 0x01,
    0x02, 0x01, 0x01,
    0x01, 0x01, 0x01,
]);

// d_0909 + d_0929 — contiguous in Z80 memory. d_0909 has 8 rows × 4 cols
// for bomb-drop enable flags (indexed by newStageParms[0] + bugs/10).
// d_0929 has 3 rows × 4 cols for boss reload (indexed by newStageParms[1]
// + bugs/10) — but reached as `d_0909 + 0x20` (8*4 = 32 byte offset).
//
// Note: Z80 c_08BE intentionally allows reading "col 4" (overflow into
// next row) when bugs/10 = 4; the data layout makes this give a smooth
// transition. Our 48-enemy port hits bugs/10 = 4 at full count; we do
// the same flat-array indexing so behavior matches.
export const D_0909_0929_BOMB_BOSS = new Uint8Array([
    // d_0909 (bomb-drop enable flags) — 8 rows × 4 cols
    0x03, 0x03, 0x01, 0x01,    // row 0
    0x03, 0x03, 0x03, 0x01,    // row 1
    0x07, 0x03, 0x03, 0x01,    // row 2
    0x07, 0x03, 0x03, 0x03,    // row 3
    0x07, 0x07, 0x03, 0x03,    // row 4
    0x0F, 0x07, 0x03, 0x03,    // row 5
    0x0F, 0x07, 0x07, 0x03,    // row 6
    0x0F, 0x07, 0x07, 0x07,    // row 7
    // d_0929 (boss reload) — 3 rows × 4 cols, starts at offset 0x20
    0x06, 0x0A, 0x0F, 0x0F,    // row 0 (= newStageParms[1] = 0)
    0x04, 0x08, 0x0D, 0x0D,    // row 1
    0x04, 0x06, 0x0A, 0x0A,    // row 2
]);

// ── c_08AD — red/yellow reload lookup (game_ctrl.s:1451-1468) ─────────
// Z80:
//   HL = base table + A*3   (3-byte rows, A from newStageParms[2 or 3])
//   if (gameTmrs[2] >= 0x28):  col 0
//   else if (gameTmrs[2] != 0): col 1
//   else:                       col 2
//   return table[HL + col]
export function c_08AD(table, paramNibble, gameTmr2) {
    const rowBase = (paramNibble & 0x0F) * 3;
    let col;
    if (gameTmr2 >= 0x28)        col = 0;
    else if (gameTmr2 !== 0)     col = 1;
    else                         col = 2;
    return table[rowBase + col];
}

// ── c_08BE — boss-reload + bomb-drop lookup (game_ctrl.s:1482-1499) ───
// Z80:
//   HL = base + A*4   (A from newStageParms[0 or 1])
//   col = (bugs * 256) / 10 → upper byte ≈ bugs/10  (range 0-4)
//   return table[HL + col]
//
// Note: bugs/10 = 4 reads byte at row*4 + 4 = first byte of next row.
// This is intentional in Z80 — see D_0909_0929_BOMB_BOSS comment.
export function c_08BE(table, baseOffset, paramNibble, bugsActv) {
    const rowBase = baseOffset + (paramNibble & 0x0F) * 4;
    const col     = Math.floor(bugsActv / 10);   // 0-4
    return table[rowBase + col];
}

// ── Coordinate conversions (Z80 sprite hardware) ─────────────────────
// Variant X/Y bytes from db_2A6C are the HIGH byte of internal 16-bit
// position registers (9.7 fixed-point). Both axes are doubled by the
// renderer (left-shift by 1 — see gg1-5.s:2287-2288 for X, 2305-2321
// for Y) before being written to the sprite-position registers.
//
// X conversion (gg1-5.s:2287-2299, not-flipped path):
//   sprite_X = rawX × 2     (`rla` on high byte = shift-left)
//   canvas_X = sprite_X − 16  (16-px hardware offset; see CLAUDE.md)
//
// Y conversion (gg1-5.s:2305-2321, not-flipped path):
//   sprite_Y = (~(rawY + 0x4F) × 2 + 1) & 0xFF
//   canvas_Y = sprite_Y       (no horizontal-style offset on Y)
// The +1 comes from the `dec e; rr e` chain that complements the
// integer-low-bit and feeds it back into the result. State.js's
// formation-row formula approximates this as `2 × ~(rawY + 0x4F)`
// (no +1) — close enough for hardcoded row positions but slightly
// off for derived values.
//
// Worked example: variant 0 has rawY=0x9B, rawX=0x34.
//   pixel_Y = (~0xEA × 2 + 1) & 0xFF = (0x15 × 2 + 1) = 43
//   pixel_X = 0x34 × 2 = 0x68 = 104 → canvas_X = 94
// → start position (94, 43) — centre-top, in line with what real
// Galaga shows for stage 1 wave 1. (Pre-fix: (42, 42).)
function rawYToCanvasY(rawY) {
    // The Z80 sprite-Y is 9-bit: bits 7:0 in ds_sprite_posn and bit 8
    // in ds_sprite_ctrl (gg1-5.s:2336-2340). Galaga's hardware screen
    // is 224×288.
    //
    // Sprite-chip mapping (verified against harbaum/galagino, an ESP32
    // Galaga emulator that's community-validated by playing the actual
    // game — see harbaum/galagino galaga.h galaga_prepare_frame()):
    //
    //     canvas_Y = sprite_Y_byte + 256 × bit_8 − 40
    //
    // The −40 is the Galaga sprite chip's hardware bottom-border
    // offset. Both MAME's draw_sprites and harbaum's emulator
    // include this constant; it accounts for the unused scanlines
    // at the top of the unrotated hardware bitmap.
    //
    // Worked example for variant 2 (rawY=0x23):
    //   inner    = ~(0x23 + 0x4F) & 0xFF = 0x8D
    //   sprite_Y = inner × 2 + 1 = 283  (= 256 + 27, bit 8 = 1)
    //   canvas_Y = 283 − 40 = 243  →  bottom area, just above lives
    //                                 icons (which are at canvas Y
    //                                 272-288)
    //
    // For variant 0 (rawY=0x9B): canvas_Y = 43 − 40 = 3 (very top edge).
    // For player ship (sprite_Y full = 297): canvas_Y = 297 − 40 = 257.
    return ((~(rawY + 0x4F)) & 0xFF) * 2 + 1 - 40;
}

function rawXToCanvasX(rawX) {
    // Variant table X is the high byte of internal X. Sprite hardware
    // doubles it (rla shift, gg1-5.s:2287-2288), then the canvas
    // mapping subtracts 16 (Galaga's hardware left-border offset, per
    // harbaum/galagino's verified formula `spr.x = sprite_X_byte − 16`).
    return rawX * 2 - 16;
}

// ── Wave-byte decoder (step 9 phase INT-2c) ───────────────────────────
// JS port of the Z80 logic at gg1-3.s:1718-1894 (l_2953_next_pair +
// l_29D1_finalize_object_setup). Decodes one wave byte into the complete
// launch info the Z80 derives from it.
//
// EVERY bit's effect is enumerated below — no guessing, no hiding.
//
// Bit layout (gg1-3.s:1450-1458 + verified against the decoder code):
//
//   bits 0-5  Index into PATH_INDEX (db_2A3C). Max 0x17 (24 entries).
//             gg1-3.s:1733 (sla c → byte offset), gg1-3.s:1838-1842.
//
//   bit 0     ALSO: selects bomb-drop counter init at 0x0E(ix) —
//             clear → 0x08 ("top entry"), set → 0x44 ("sides entry").
//             gg1-3.s:1828-1834 (after sla c, this is bit 1 of C).
//
//   bit 6     (a) Pair-member selector. Picks VARIANTS[2N] (clear) or
//                 VARIANTS[2N+1] (set), where N = entry.variant.
//                 gg1-3.s:1868-1873.
//             (b) NEGATE-ROTATION flag. Stored at 0x13(ix) bit 7 by
//                 gg1-3.s:1892-1894 (or d ; and 0x81). The path
//                 interpreter at gg1-5.s:2014-2018 negates the
//                 segment's rotRate byte when this flag is set →
//                 partner sweeps a MIRRORED arc.
//
//   bit 7     Launch gate. CLEAR → this single launch waits for
//             frame_cnt & 0x07 == 0 before firing (≈8-frame interval
//             between successive gated launches). SET → fires the
//             frame f_2916 reads it. gg1-3.s:1723-1728.
//
// Returns { bytes, startX, startY, startAngle, negateRotation,
//          bombCounterInit, launchGated } or null if undecodable.
export function resolveWaveByte(byte) {
    const idx              = byte & 0x3F;
    const member           = (byte & 0x40) ? 1 : 0;
    const negateRotation   = (byte & 0x40) !== 0;       // same bit, two effects
    const launchGated      = (byte & 0x80) === 0;
    const bombCounterInit  = (byte & 0x01) ? 0x44 : 0x08;
    const entry = PATH_INDEX[idx];
    if (!entry) return null;
    const bytes = PATH_BY_ADDR[entry.addr];
    if (!bytes) return null;
    const v = VARIANTS[entry.variant * 2 + member];
    if (!v) return null;
    return {
        bytes,
        startX:          rawXToCanvasX(v.x),
        startY:          rawYToCanvasY(v.y),
        startAngle:      v.rotHi << 8,
        negateRotation,
        bombCounterInit,
        launchGated,
    };
}

// ── Wave-stream builder (mirrors Z80 c_25A2, gg1-3.s:1168-1423) ──────
//
// Z80 runtime layout at ds_8920 (per gg1-3.s:1357-1383 and the
// l_2944_attack_wave_start handler at gg1-3.s:1704):
//
//   0x7E,                           ; wave-start marker
//   byte_lefty, ID_lefty,           ; pair 1 member 0
//   byte_righty, ID_righty,         ; pair 1 member 1
//   byte_lefty, ID_lefty,           ; pair 2 member 0
//   byte_righty, ID_righty,         ; pair 2 member 1
//   ... (4 pairs per wave) ...
//   0x7E,                           ; (next wave's start marker)
//   ...
//   0x7F                            ; end-of-stage marker
//
// f_2916 walks this byte-by-byte, consuming 2 bytes per launch
// (path byte + object ID) and the markers verbatim. Per-byte launch
// gating (bit 7 of the path byte) and per-byte negate-rotation
// (bit 6) live in the bytes themselves — pair structure is implicit
// in the byte order, NOT a separate field.
//
// Stage 1 (5 waves × 4 pairs × 2 members + 6 markers) = 86 bytes.
export function buildWaveStream(stage) {
    const triplets = STAGE_WAVES[stage] ?? STAGE_WAVES[1];
    const stream = [];
    triplets.forEach((triplet, waveIdx) => {
        const byte1   = triplet[1];
        const byte2   = triplet[2];
        const idsBase = waveIdx * 8;
        stream.push(0x7E);                          // wave-start marker
        for (let i = 0; i < 8; i += 2) {
            stream.push(byte1, ATTK_WAV_IDS[idsBase + i]);     // lefty
            stream.push(byte2, ATTK_WAV_IDS[idsBase + i + 1]); // righty
        }
    });
    stream.push(0x7F);                              // end-of-stage marker
    return new Uint8Array(stream);
}

// ── Verification helper (JS-only — no Z80 counterpart) ────────────────
// Walks buildWaveStream(stage) and produces a fully decoded launch list
// you can console.log + eyeball against expected stage-1 behaviour.
//
// This is a JS-side debug utility — the Z80 has no equivalent; it just
// runs the launcher and you watch the screen. We need it because we
// want to verify the DATA is correct in isolation from the launcher
// CODE (a workaround for the fact that we're reverse-engineering the
// data layer separately from the runtime).
//
// Each launch entry includes EVERY decoded field — no hidden state.
//
// Usage from console: `import('./paths.js').then(m => console.table(m.dumpStageLaunches(1)))`
export function dumpStageLaunches(stage) {
    const stream = buildWaveStream(stage);
    const launches = [];
    let wave = 0;
    let pair = 0;
    let memberInPair = 0;
    let i = 0;
    while (i < stream.length) {
        const b = stream[i];
        if (b === 0x7F) break;
        if (b === 0x7E) {
            wave += 1;
            pair = 0;
            memberInPair = 0;
            i += 1;
            continue;
        }
        if (memberInPair === 0) { pair += 1; memberInPair = 1; }
        else                     { memberInPair = 2; }
        const objectId = stream[i + 1];
        const decoded  = resolveWaveByte(b);
        const idx      = b & 0x3F;
        const idxEntry = PATH_INDEX[idx];
        launches.push({
            wave,
            pair,
            member:    memberInPair,
            objectId:  '0x' + objectId.toString(16).padStart(2, '0').toUpperCase(),
            pathByte:  '0x' + b.toString(16).padStart(2, '0').toUpperCase(),
            pathIdx:   idx,
            pathAddr:  idxEntry ? '0x' + idxEntry.addr.toString(16).padStart(4, '0').toUpperCase() : '?',
            varBits:   idxEntry ? idxEntry.variant : '?',
            ...(decoded ? {
                startX:          decoded.startX,
                startY:          decoded.startY,
                startAngleDeg:   ((decoded.startAngle / 1024) * 360).toFixed(0) + '°',
                negateRotation:  decoded.negateRotation,
                bombCounterInit: '0x' + decoded.bombCounterInit.toString(16).toUpperCase().padStart(2, '0'),
                launchGated:     decoded.launchGated,
            } : { error: 'undecodable (path bytes not ported?)' }),
        });
        if (memberInPair === 2) memberInPair = 0;
        i += 2;
    }
    return launches;
}

// ── Convenience accessor ──────────────────────────────────────────────
// Returns { bytes, startX (canvas), startY (canvas), startAngle (10-bit) }
// for the given index 0–23, or null if the path isn't ported yet. Defaults
// to pair member 0 (bit 6 clear) — pass `member=1` for the partner.
export function getPathByIndex(idx, member = 0) {
    const entry = PATH_INDEX[idx];
    if (!entry) return null;

    const bytes = PATH_BY_ADDR[entry.addr];
    if (!bytes) return null;

    const v = VARIANTS[entry.variant * 2 + member];
    if (!v) return null;
    return {
        bytes,
        startX:     rawXToCanvasX(v.x),  // Z80 internal-X high byte → canvas X
        startY:     rawYToCanvasY(v.y),  // Z80 internal-Y high byte → canvas Y
        startAngle: v.rotHi << 8,        // high byte of 10-bit angle
    };
}
