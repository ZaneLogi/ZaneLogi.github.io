// LZW decompression for U6 compressed files (12-bit max code).
// Copied-then-owned from the legacy ultima6/ port; pure, no dependencies.

export function lzwDecode(data, bitCount = 8) {
  const CLEAR_CODE = 1 << bitCount;
  const END_CODE = CLEAR_CODE + 1;
  const MAX_BITS = 12;
  const MAX_DICT_SIZE = 1 << MAX_BITS;

  let dict = new Array(MAX_DICT_SIZE);
  for (let i = 0; i < CLEAR_CODE; i++) dict[i] = { prefix: -1, char: i };

  let bitPos = 0;
  const getCode = (bits) => {
    const bytePos = Math.floor(bitPos / 8);
    const shift = bitPos % 8;
    const value = data[bytePos] | (data[bytePos + 1] << 8) | (data[bytePos + 2] << 16);
    const code = (value >> shift) & ((1 << bits) - 1);
    bitPos += bits;
    return code;
  };

  let codeSize = bitCount + 1;
  let nextCode = END_CODE + 1;
  const output = [];

  const getString = (code) => {
    const chars = [];
    while (code >= 0 && dict[code]) {
      chars.unshift(dict[code].char);
      code = dict[code].prefix;
    }
    return chars;
  };

  let prevCode = getCode(codeSize);
  if (prevCode !== CLEAR_CODE) throw new Error('Invalid LZW stream: missing CLEAR_CODE');

  codeSize = bitCount + 1;
  nextCode = END_CODE + 1;

  prevCode = getCode(codeSize);
  output.push(...getString(prevCode));

  while (true) {
    const currCode = getCode(codeSize);
    if (currCode === END_CODE) break;
    if (currCode === CLEAR_CODE) {
      dict = new Array(MAX_DICT_SIZE);
      for (let i = 0; i < CLEAR_CODE; i++) dict[i] = { prefix: -1, char: i };
      codeSize = bitCount + 1;
      nextCode = END_CODE + 1;
      prevCode = getCode(codeSize);
      output.push(...getString(prevCode));
      continue;
    }

    let chars;
    if (dict[currCode]) {
      chars = getString(currCode);
    } else {
      const prevChars = getString(prevCode);
      chars = [...prevChars, prevChars[0]];
    }
    output.push(...chars);

    if (nextCode < MAX_DICT_SIZE) {
      dict[nextCode++] = { prefix: prevCode, char: chars[0] };
      if (nextCode === (1 << codeSize) && codeSize < MAX_BITS) codeSize++;
    }
    prevCode = currCode;
  }

  return new Uint8Array(output);
}

function isValidCompressedFile(data) {
  if (data.length < 6) return false;
  if (data[3] !== 0) return false;
  const uncompressedSize = data[0] + (data[1] << 8) + (data[2] << 16);
  if (uncompressedSize <= data.length - 4) return false;
  const check = data[4] + ((data[5] & 1) << 8);
  return check === 0x100;
}

// U6 ".vga"-style files carry a 4-byte uncompressed-size header before the stream.
export function decompressCompressedFile(data) {
  if (!isValidCompressedFile(data)) throw new Error('Invalid compressed file');
  return lzwDecode(data.slice(4), 8);
}
