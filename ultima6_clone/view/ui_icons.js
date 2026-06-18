// Atlas-icon DOM renderer (I-7b). The render path's atlas is a GPU texture
// (view/renderer.js), so DOM consumers like the object inspector can't sample
// it directly. tileIcon() builds a small <canvas>, blits one tile's pixel
// indices through the palette (both kept in CPU memory: Tiles.cache via
// getTilePixels — assets/tiles.js:82, and TileRegistry.palette as RGBA —
// assets/palette.js), and returns the element. Cheap (one 16×16 ImageData),
// no caching needed for inventory-sized lists.

// Returns a <canvas> with the tile blitted at its native 16×16 size.
// CSS in index.html ('.ui-icon') scales it up via `image-rendering: pixelated`
// so the caller doesn't compose scaling into the canvas.
export function tileIcon(reg, tileId) {
  const canvas = document.createElement('canvas');
  canvas.width = 16; canvas.height = 16;
  canvas.className = 'ui-icon';
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(16, 16);
  const px = reg.tiles.getTilePixels(tileId);   // Uint8Array(256) palette indices
  const pal = reg.palette;                       // Uint8Array(256*4) RGBA
  for (let i = 0; i < 256; i++) {
    const p = px[i] * 4;
    const di = i * 4;
    img.data[di    ] = pal[p    ];
    img.data[di + 1] = pal[p + 1];
    img.data[di + 2] = pal[p + 2];
    img.data[di + 3] = pal[p + 3];               // colourkey idx 255 -> alpha 0
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
