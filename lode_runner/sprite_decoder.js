/**
 * Decode one Apple II hi-res graphics row (2 bytes, 14 bits of pixel data).
 * Returns an array of 14 pixel values (0–3).
 */
function decodeApple2HiresRow(byteLow, byteHigh) {
  // Extract bits 0–6 from each byte (ignoring high bit for now)
  const bitsLow = Array.from({ length: 7 }, (_, i) => (byteLow >> i) & 1);
  const bitsHigh = Array.from({ length: 7 }, (_, i) => (byteHigh >> i) & 1);
  const bits = bitsLow.concat(bitsHigh);

  // Get high bit of each byte
  const highBitLow = (byteLow >> 7) & 1;
  const highBitHigh = (byteHigh >> 7) & 1;

  // Function to determine pixel color based on bit and position
  function colorForPixel(bit, pos, highBit) {
    if (bit === 0) return 0;
    // Even column: violet(2) if high bit clear, blue(2) if set
    // Odd column: green(1) if high bit clear, orange(1) if set
    return (pos % 2 === 0) ? 2 : 1;
  }

  const pixels = new Array(14).fill(0);

  // Initial coloring
  for (let i = 0; i < 14; i++) {
    const hb = (i < 7) ? highBitLow : highBitHigh;
    pixels[i] = colorForPixel(bits[i], i, hb);
  }

  // Rule: two consecutive 1s become white (3)
  for (let i = 0; i < 13; i++) {
    if (bits[i] === 1 && bits[i + 1] === 1) {
      pixels[i] = 3;
      pixels[i + 1] = 3;
    }
  }

  // Rule: 101 pattern ⇒ color the middle 0 based on the position of the first 1
  for (let i = 0; i < 12; i++) {
    if (bits[i] === 1 && bits[i + 1] === 0 && bits[i + 2] === 1) {
      const hb = (i + 1 < 7) ? highBitLow : highBitHigh;
      pixels[i + 1] = colorForPixel(1, i, hb);
    }
  }

  return pixels;
}

/**
 * Decode a full Apple II hi-res sprite of 22 bytes (11 rows * 2 bytes each).
 * Returns an array of 11 rows, each row is an array of 14 pixel values (0-3).
 * @param {Uint8Array | number[]} data - 22-byte input array
 * @returns {number[][]} Array of 11 pixel rows
 */
function decodeApple2HiresSprite(data) {
    if (data.length !== 22) {
        throw new Error("Input data must be exactly 22 bytes");
    }

    const spritePixels = [];
    for (let row = 0; row < 11; row++) {
        const byteLow = data[row * 2];
        const byteHigh = data[row * 2 + 1];
        const rowPixels = decodeApple2HiresRow(byteLow, byteHigh);
        spritePixels.push(rowPixels);
    }

    return spritePixels;
}
