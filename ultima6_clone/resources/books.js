// resources/books.js
//
// I-book — reader for BOOK.DAT, the in-game book/sign text store. LOOK at a readable
// object (seg_27a1.c C_27A1_06D7 CanRead → C_27A1_078F) pulls its text from here,
// keyed by the object's QUALITY. BOOK.DAT layout (seg_27a1.c C_27A1_078F):
//
//   - a u16 little-endian OFFSET TABLE: entry (quality-1) → byte offset of that book's
//     text. The table runs from byte 0 up to the first text offset, so the entry count
//     is `firstOffset / 2`.
//   - then NUL-terminated raw text blocks at those offsets.
//
// No compression (unlike converse.*/portrait.*, which are lib_32 LZW). The text carries
// U6 inline markup (<>gargoyle, @highlight, & section-marker, * paragraph, \ plural) —
// left intact here; view/book_window.js renders it.

export class Books {
  // bytes — the raw BOOK.DAT (Uint8Array | undefined). OPTIONAL data: when absent (the
  // user hasn't dropped book.dat) every lookup returns null and the LOOK book-read no-ops.
  constructor(bytes) {
    this.bytes = bytes && bytes.length >= 2 ? bytes : null;
    this.count = this.bytes ? ((this.bytes[0] | (this.bytes[1] << 8)) >> 1) : 0;
  }

  // True if quality q (1-based) indexes a real entry.
  has(q) { return this.bytes != null && q >= 1 && q <= this.count; }

  // The raw text for book/sign quality q (1-based), or null. Markup left intact.
  get(q) {
    if (!this.has(q)) return null;
    const b = this.bytes;
    const off = b[(q - 1) * 2] | (b[(q - 1) * 2 + 1] << 8);
    if (off >= b.length) return null;
    let s = '';
    for (let i = off; i < b.length && b[i] !== 0; i++) s += String.fromCharCode(b[i]);
    return s;
  }
}
