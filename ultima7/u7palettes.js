import { FlexFile } from "./flexfile.js";

export class U7Palettes {
  constructor() {
    this.data = new Uint8Array(256 * 4),
    this.u7pal;

    const uint8 = this.data;
    for (let i = 0, offset = 0; i < 256; i++, offset += 4) {
      uint8[offset + 0] = i;
      uint8[offset + 1] = i;
      uint8[offset + 2] = i;
      uint8[offset + 3] = 255;
    }
  }

  current() {
    return this.data;
  }

  load(uint8) {
    this.u7pal = new FlexFile();
    this.u7pal.open(uint8);
  }

  select(index, transparentColor = -1) {
    if (!this.u7pal) throw new Error("u7pal is not ready!");
    if (index >= this.u7pal.objCount) throw new Error("index is out of range!");

    const u7pal = this.u7pal.objData(index);

    const uint8 = this.data;
    for (let i = 0, si = 0, di = 0; i < 256; i++, si += 3, di += 4) {
      uint8[di + 0] = u7pal[si + 0] * 4;
      uint8[di + 1] = u7pal[si + 1] * 4;
      uint8[di + 2] = u7pal[si + 2] * 4;
      uint8[di + 3] = 255;
    }

    if (0 <= transparentColor && transparentColor < 256) {
      this.data[transparentColor * 4 + 3] = 0;
    }
  }
}
