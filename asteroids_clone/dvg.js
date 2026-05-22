// asteroids_clone/dvg.js
//
// DVG interpreter for the decoded-object format from vector_rom_data.js.
// Spec: docs/research_dvg.md §11 (format) + §4-§6 (opcode semantics).
//
// The interpreter is renderer-agnostic — it computes endpoints in DVG
// coordinate space and calls `drawSegment(fromX, fromY, toX, toY, bri)`
// for each visible vector. Coordinate transform + actual canvas API
// calls live in the caller (main.js).

// Scale arithmetic (per R-B §4 / DVG.md "Scaling-factor" table):
//   The scale factor is a power-of-two divisor: 0→/512, 9→/1.
//   For VEC, total = local + global; for SVEC, mul applies first then global divides.
//   Hardware barrel shifter saturates: if total > 9, treat as 9 (divisor /1).
//   Negative shift is never produced — the DVG can't enlarge beyond raw.

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
        const shift = Math.max(0, 9 - (op.localScale + globalScale));
        cursor.x += op.dx >> shift;
        cursor.y += op.dy >> shift;
        if (op.bri > 0) drawSegment(fromX, fromY, cursor.x, cursor.y, op.bri);
        break;
      }

      case 'SVEC': {
        const fromX = cursor.x, fromY = cursor.y;
        const mul = 1 << (op.scaleMode + 1);   // ×2 / ×4 / ×8 / ×16
        const shift = Math.max(0, 9 - globalScale);
        cursor.x += (op.dx * mul) >> shift;
        cursor.y += (op.dy * mul) >> shift;
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
