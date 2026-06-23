// lunar_lander/dvg.js
//
// Copy of asteroids_clone/dvg.js — Lunar Lander runs on the SAME Atari DVG
// (Digital Vector Generator) as Asteroids, so the interpreter is reused. The
// code AND comments below are identical to asteroids_clone/dvg.js; per repo
// convention (self-contained games, no shared library) it is kept as a
// per-project copy. Authoritative spec: asteroids_clone/docs/research_dvg.md.
//
// DVG interpreter for the decoded-object format from vector_rom_data.js.
// Spec: asteroids_clone/docs/research_dvg.md §11 (format) + §4-§6 (opcode semantics).
//
// The interpreter is renderer-agnostic — it computes endpoints in DVG
// coordinate space and calls `drawSegment(fromX, fromY, toX, toY, bri)`
// for each visible vector. Coordinate transform + actual canvas API
// calls live in the caller (demos/vector_rom.js for the dev demo;
// main.js once the runtime/game ports land).

// Scale arithmetic — corrected 2026-05-23 against MAME avgdvg.c (lines 631-641
// and 785-799 of the DVG handler). Both VEC and SVEC use the same model:
//
//   1. total = (localScale + globalScale) & 0x0f   ← 4-bit MASK (hardware wraps)
//   2. if (total > 9) total = -1                   ← saturation to "shift by 10"
//   3. shift = 9 - total                           ← divisor exponent
//   4. rendered = magnitude >> shift                ← pixel delta
//
// The 4-bit mask is critical: when local + global ≥ 16 the sum wraps modulo 16,
// often dropping back into the 0..9 range and producing a visible-small render.
// This is why the cabinet can use gs=14 for ship + small asteroid (apparent
// "out of range") and still get visible output — local + 14 wraps.
//
// VEC:  local = opcode nibble (0..9), magnitude = raw 10-bit (signed -512..+511)
// SVEC: local = scaleMode + 2 (i.e. 2..5), magnitude = raw 2-bit << 8
//                (i.e. 0, 256, 512, or 768 — top 2 bits of a 10-bit field)
//
// Saturation (total > 9 after mask): MAME sets temp=-1 → shift=10 → delta =
// magnitude/1024. For VEC this is small-but-possibly-visible; for SVEC at
// integer-pixel granularity the fraction truncates to 0 (sub-pixel detail lost,
// matches our integer-cursor implementation — full fixed-point fidelity would
// preserve sub-pixel accumulation across multiple SVECs).
//
// Rounding: hardware shifts an unsigned magnitude and re-applies sign — i.e.
// truncation toward zero. JS `>>` sign-extends so we use Math.trunc instead.

// X/Y flip — JS analog of source $6AD3's EOR-during-VRAM-copy mirroring at
// $6AD3 lines $6ADC (EOR $09 on dy sign-bit) and $6AF6 (EOR $08 on dx sign-bit).
// Source flips the sign bit (bit 2 of byte +1 for dy, bit 2 of byte +3 for dx)
// in the encoded opcodes; we negate the decoded dx/dy in the interpreter
// instead, which is geometrically identical and avoids re-encoding. Flips
// propagate through JSR — only matters if a flipped subroutine itself JSRs;
// ShipDirN doesn't, but keeping it consistent costs nothing.
export function runList(VROM, list, cursor, globalScale, drawSegment, xFlip = false, yFlip = false) {
  for (const op of list) {
    switch (op.op) {
      case 'LABS':
        cursor.x = op.x;
        cursor.y = op.y;
        globalScale = op.globalScale;
        break;

      case 'VEC': {
        const fromX = cursor.x, fromY = cursor.y;
        let total = (op.localScale + globalScale) & 0x0f;
        if (total > 9) total = -1;
        const div = 1 << (9 - total);
        const dx = xFlip ? -op.dx : op.dx;
        const dy = yFlip ? -op.dy : op.dy;
        cursor.x += Math.trunc(dx / div);
        cursor.y += Math.trunc(dy / div);
        if (op.bri > 0) drawSegment(fromX, fromY, cursor.x, cursor.y, op.bri);
        break;
      }

      case 'SVEC': {
        const fromX = cursor.x, fromY = cursor.y;
        let total = ((op.scaleMode + 2) + globalScale) & 0x0f;
        if (total > 9) total = -1;
        // Hardware: pixel delta = (raw_2bit << 8) >> (9 - total). Equivalent
        // integer-pixel form: delta = raw * 2^(total - 1) for total ≥ 1,
        // else 0 (sub-pixel — truncates).
        const mul = total >= 1 ? 1 << (total - 1) : 0;
        const dx = xFlip ? -op.dx : op.dx;
        const dy = yFlip ? -op.dy : op.dy;
        cursor.x += dx * mul;
        cursor.y += dy * mul;
        if (op.bri > 0) drawSegment(fromX, fromY, cursor.x, cursor.y, op.bri);
        break;
      }

      case 'JSR':
        runList(VROM, VROM[op.target], cursor, globalScale, drawSegment, xFlip, yFlip);
        break;

      case 'JMP':
        return runList(VROM, VROM[op.target], cursor, globalScale, drawSegment, xFlip, yFlip);

      case 'RTS':
        return;

      case 'HALT':
        return 'halt';
    }
  }
}
