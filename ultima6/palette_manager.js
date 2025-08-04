export const PaletteManager = {
  texture: null,
  data: new Uint8Array(256 * 4),

  init(gl) {
    for (let i = 0; i < 256; i++) {
      this.data[i*4 + 0] = (i * 97) % 256;
      this.data[i*4 + 1] = (i * 47) % 256;
      this.data[i*4 + 2] = (i * 67) % 256;
      this.data[i*4 + 3] = 255;
    }
    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    console.log("PaletteManager initialized");
  },

  setFromU6(gl, u6pal, useTransparent = false) {
    for (let i = 0; i < 256; i++) {
      this.data[i*4 + 0] = u6pal[i*3] * 4;
      this.data[i*4 + 1] = u6pal[i*3 + 1] * 4;
      this.data[i*4 + 2] = u6pal[i*3 + 2] * 4;
      this.data[i*4 + 3] = 255;
    }
    if (useTransparent) {
      this.data[255 * 4 + 3] = 0;
    }
    this.update(gl);
  },

  update(gl) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
  },

  getColor(index) {
    const offset = index * 4;
    return {
      r: this.data[offset],
      g: this.data[offset + 1],
      b: this.data[offset + 2],
    };
  },

  colorCycling(gl, frame) {
    const rotate = function(data, start, end) {
      const temp = new Uint8Array(4);
      const base = start * 4;
      // Copy first color into temp
      temp.set(data.subarray(base, base + 4));
      // Move colors forward (7 colors)
      data.copyWithin(base, base + 4, end * 4);
      // Put saved first color at the end
      data.set(temp, (end - 1) * 4);
    };
    let updated = false;
    // 8-entry intervals: cycle every 4 frames
    if (frame % 4 === 0) {
      rotate(this.data, 0xe0, 0xe8);
      rotate(this.data, 0xe8, 0xf0);
      updated = true;
    }
    // 4-entry intervals: cycle every 8 frames
    if (frame % 8 === 0) {
      rotate(this.data, 0xf0, 0xf4);
      rotate(this.data, 0xf4, 0xf8);
      rotate(this.data, 0xf8, 0xfc);
      updated = true;
    }
    if (updated) this.update(gl);
  },
};