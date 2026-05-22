// asteroids_clone/dvg.js
//
// DVG interpreter for the decoded-object format from vector_rom_data.js.
// Spec: docs/research_dvg.md §11 (format) + §4-§6 (opcode semantics).
//
// The interpreter is renderer-agnostic — it computes endpoints in DVG
// coordinate space and calls `drawSegment(fromX, fromY, toX, toY, bri)`
// for each visible vector. Coordinate transform + actual canvas API
// calls live in the caller (demos/vector_rom.js for the dev demo;
// main.js once the runtime/game ports land).

// Scale arithmetic — corrected 2026-05-22 against MAME avgdvg.c + Nick Mikstas's
// Asteroids HDL. Both VEC and SVEC use ADDITIVE total scale (local + global)
// with the same barrel-shifter:
//   - VEC:  local = opcode nibble (0..9), magnitude = raw 10-bit (0..1023)
//   - SVEC: local = scaleMode + 2 (i.e. 2..5), magnitude = raw 2-bit << 8
//                  (i.e. 0, 256, 512, or 768 — top 2 bits of a 10-bit field)
//   - Rendered delta = magnitude >> (9 - total) for both.
//
// Saturation: if total > 9, the hardware decoder turns on all output bits and
// the delta becomes ≈ 0 integer units. Well-formed cabinet ROMs choose per-
// object gs values that avoid this; if we see a vanishing segment in our port
// it means the gs picked for that object is too high.
//
// Rounding: the hardware shifts an unsigned magnitude and re-applies the
// sign — i.e. truncation toward zero. JS `>>` is sign-extending and rounds
// toward -∞ for negatives, so we use Math.trunc(dx / div) instead.

export function runList(VROM, list, cursor, globalScale, drawSegment) {
  for (const op of list) {
    switch (op.op) {
      case 'LABS':
        cursor.x = op.x;
        cursor.y = op.y;
        globalScale = op.globalScale;
        break;

      case 'VEC': {
        const fromX = cursor.x, fromY = cursor.y;
        const div = 1 << Math.max(0, 9 - (op.localScale + globalScale));
        cursor.x += Math.trunc(op.dx / div);
        cursor.y += Math.trunc(op.dy / div);
        if (op.bri > 0) drawSegment(fromX, fromY, cursor.x, cursor.y, op.bri);
        break;
      }

      case 'SVEC': {
        const fromX = cursor.x, fromY = cursor.y;
        const total = (op.scaleMode + 2) + globalScale;
        // Saturation: hardware delta becomes ~0 when total > 9. Skip the cursor
        // update (and still emit a zero-length segment if the SVEC is a draw).
        const mul = total > 9 ? 0 : 1 << (op.scaleMode + 1 + globalScale);
        cursor.x += op.dx * mul;
        cursor.y += op.dy * mul;
        if (op.bri > 0) drawSegment(fromX, fromY, cursor.x, cursor.y, op.bri);
        break;
      }

      case 'JSR':
        runList(VROM, VROM[op.target], cursor, globalScale, drawSegment);
        break;

      case 'JMP':
        return runList(VROM, VROM[op.target], cursor, globalScale, drawSegment);

      case 'RTS':
        return;

      case 'HALT':
        return 'halt';
    }
  }
}
