// Tile footprint geometry — the cells occupied by an object placed at
// (anchorCol, anchorRow), with the per-cell tile ID and an extension flag.
//
// Source's double-tile expansion (C_1184_35EA): each U6 tile draws into ONE cell;
// "double" objects are 2 or 4 tile IDs in a row in the atlas (t, t-1, [t-2, t-3])
// whose visible anchor lives at the SE corner. DoubleWidth → extension at (col-1,
// row); DoubleHeight → extension at (col, row-1); both → 2×2 with extensions
// (col-1,row), (col,row-1), (col-1,row-1). One callback per occupied cell.
//
// Two consumers:
//   - WorldRenderSystem (I-2c) — per-cell painter zones; needs both per-cell tile
//     IDs (for atlas lookup) and the isExt flag (foreground extension vs hotspot
//     routing to fgExt vs fgHot).
//   - Passability (I-4c) — "what blocks at (x,y)"; given a 1-tile query cell, the
//     check expands each candidate anchor and tests whether the footprint covers
//     (x,y). Doesn't use tile-id or isExt, just the cell coords.
//
// Same expansion `__ComputeResistance` (seg_1E0F.c:1866-1922) reuses for the
// pathfinder's per-cell cost map.

export function forEachOccupiedCell(reg, tile, anchorCol, anchorRow, cb) {
  cb(tile, anchorCol, anchorRow, false);
  const dw = reg.isDoubleWidth(tile), dh = reg.isDoubleHeight(tile);
  if (dw) {
    cb(tile - 1, anchorCol - 1, anchorRow, true);
    if (dh) {
      cb(tile - 2, anchorCol,     anchorRow - 1, true);
      cb(tile - 3, anchorCol - 1, anchorRow - 1, true);
    }
  } else if (dh) {
    cb(tile - 1, anchorCol, anchorRow - 1, true);
  }
}
