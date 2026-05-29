// Decode a U6 256-colour palette (`u6pal`, 768 bytes of 6-bit RGB) into RGBA.
// GL upload + colour cycling live in the render layer (I-1c); this is pure decode.

export function decodePalette(u6pal, useTransparent = false) {
  const rgba = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    rgba[i * 4 + 0] = u6pal[i * 3 + 0] * 4;   // 6-bit -> 8-bit
    rgba[i * 4 + 1] = u6pal[i * 3 + 1] * 4;
    rgba[i * 4 + 2] = u6pal[i * 3 + 2] * 4;
    rgba[i * 4 + 3] = 255;
  }
  if (useTransparent) rgba[255 * 4 + 3] = 0;   // palette index 255 = colourkey transparent
  return rgba;
}
