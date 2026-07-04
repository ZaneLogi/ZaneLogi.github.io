// masksheet.js — load & render 1-bpp silhouette mask sheets produced by
// tools/extract_masks.py (the kid_masks.json format).
//
// A sheet is { source, count, frames:[ { id, w, h, data } ] } where `data`
// is base64 of a 1-bpp bitmap: row-major, MSB-first, each row padded to a
// whole byte. Bit 1 = opaque (silhouette), bit 0 = transparent.
//
// The sheet keeps the raw mask bits; colour is applied at draw time and the
// rasterised result is cached per colour. This keeps tint a runtime knob
// (the demo's colour picker) and stays efficient for an animation loop
// (one rasterise per frame per colour, then plain drawImage each tick).
//
// Browser-side (uses <canvas>). No build step; import directly.

function b64ToBytes(b64) {
  const bin = atob(b64), a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function parseColor(c) {
  if (Array.isArray(c)) return c;                       // [r,g,b]
  if (c[0] === '#') return [parseInt(c.slice(1, 3), 16),
                            parseInt(c.slice(3, 5), 16),
                            parseInt(c.slice(5, 7), 16)];
  return [0, 0, 0];                                     // default: black
}

export class MaskSprite {
  constructor(id, w, h, bits) {
    this.id = id;
    this.w = w;
    this.h = h;
    this.bits = bits;                 // Uint8Array, 1-bpp MSB-first, rows byte-aligned
    this.rowbytes = (w + 7) >> 3;
    // Content bounding box of the opaque pixels. `content.maxy` (the bottom) is used to
    // sit the feet on the ground line; the per-frame draw offsets (frame.dx/dy) and the
    // facing flip are applied by the demo's draw() from frame_table_kid, not here.
    let cminx = w, cmaxx = -1, cminy = h, cmaxy = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      if (this.bit(x, y)) { if (x<cminx)cminx=x; if(x>cmaxx)cmaxx=x; if(y<cminy)cminy=y; if(y>cmaxy)cmaxy=y; }
    this.content = cmaxx < 0 ? { minx: 0, maxx: w - 1, miny: 0, maxy: h - 1 }
                             : { minx: cminx, maxx: cmaxx, miny: cminy, maxy: cmaxy };
    // Content centre x. NOTE: deliberately NOT the mirror axis — the flip is about the
    // registration point (obj_x), per PoP's draw_mid. Mirroring about cx was tried and
    // rejected (it amplifies the per-frame content-centre swing ~3x and jitters the gait).
    // See CLAUDE.md "Sprite registration". Kept only as that cautionary reference point.
    this.cx = (this.content.minx + this.content.maxx + 1) / 2;
    this._cache = new Map();          // colorKey -> offscreen canvas
  }

  // Sample the silhouette bit at (x, y): 1 = opaque, 0 = transparent.
  bit(x, y) {
    return (this.bits[y * this.rowbytes + (x >> 3)] >> (7 - (x & 7))) & 1;
  }

  // Rasterise the mask to an offscreen canvas of the given colour (cached).
  toCanvas(color = '#000000') {
    const key = Array.isArray(color) ? color.join(',') : color;
    let cv = this._cache.get(key);
    if (cv) return cv;
    const [r, g, b] = parseColor(color);
    cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(this.w, this.h), d = img.data;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.bit(x, y)) {
          const o = (y * this.w + x) * 4;
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
        }
    ctx.putImageData(img, 0, 0);
    this._cache.set(key, cv);
    return cv;
  }

  // Blit the sprite at (x, y). Options: color, scale. Pixels stay crisp.
  draw(ctx, x, y, { color = '#000000', scale = 1 } = {}) {
    const src = this.toCanvas(color);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, this.w, this.h,
                  x, y, this.w * scale, this.h * scale);
  }
}

export class MaskSheet {
  constructor(meta, sprites) {
    this.source = meta.source;
    this.count = meta.count;
    this.sprites = sprites;           // Map<id, MaskSprite>, insertion order = sheet order
    this.all = [...sprites.values()]; // ordered array (demo grid, iteration)
    this.ids = [...sprites.keys()];
  }

  get(id) { return this.sprites.get(id); }

  static async load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MaskSheet.load: ${url} -> HTTP ${res.status}`);
    const doc = await res.json();
    const sprites = new Map();
    for (const fr of doc.frames)
      sprites.set(fr.id, new MaskSprite(fr.id, fr.w, fr.h, b64ToBytes(fr.data)));
    return new MaskSheet(doc, sprites);
  }
}
