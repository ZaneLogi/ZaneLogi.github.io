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

  rotateColors(start, end) {
    const temp = new Uint8Array(4);
    const lastIndex = (end - 1) * 4;

    const data = this.data;

    // Copy last color
    temp.set(data.subarray(lastIndex, lastIndex + 4));

    // Shift colors backward
    data.copyWithin(start * 4 + 4, start * 4, lastIndex);

    // Put last color at the front
    data.set(temp, start * 4);
  }

  draw(frameBuffer) {
    const {p, width, height, pitch} = frameBuffer;
    const palW = Math.min(width, 256);
    const palH = Math.min(height, 256);
    for (let y = 0; y < palH; y++) {
      const offsetBase = y * width;
      const colorBase = Math.floor(y/16) * 16;
      for (let x = 0; x < palW; x++) {
        p[offsetBase + x] = colorBase + Math.floor(x/16);
      }
    }
  }
}
