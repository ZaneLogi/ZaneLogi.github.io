export const IndexedTextureManager = {
  texture: null,
  data: null,
  width: 0,
  height: 0,
  tile_count: 0,
  tile_size: 0,
  tiles_per_row: 0,

  init(gl, tileCount, tileSize, tilesPerRow) {
    this.tile_count = tileCount;
    this.tile_size = tileSize;
    this.tiles_per_row = tilesPerRow;
    this.generateAtlas();
    this.createTexture(gl);
  },

  generateAtlas() {
    const tileCount = this.tile_count;
    const tileSize = this.tile_size;
    const tilesPerRow = this.tiles_per_row;

    const tilesPerCol = Math.ceil(tileCount / tilesPerRow);
    this.width = tilesPerRow * tileSize;
    this.height = tilesPerCol * tileSize;
    this.data = new Uint8Array(this.width * this.height);

    for (let i = 0; i < tileCount; i++) {
      const index = i % 256;
      const tx = i % tilesPerRow;
      const ty = Math.floor(i / tilesPerRow);
      const baseX = tx * tileSize;
      const baseY = ty * tileSize;
      for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
          const dstX = baseX + x;
          const dstY = baseY + y;
          this.data[dstY * this.width + dstX] = index;
        }
      }
    }
  },

  createTexture(gl) {
    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R8,
      this.width, this.height, 0,
      gl.RED, gl.UNSIGNED_BYTE, this.data
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  },

  getIndex(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.data[y * this.width + x];
  },

  blitTile(srcPixels, xTile, yTile) {
    const tileSize = this.tile_size;
    let dstOffset = yTile * 16 * this.width + xTile * 16;
    for (let ty = 0, srcOffset = 0; ty < tileSize; ty++, srcOffset += 16) {
      this.data.set(srcPixels.subarray(srcOffset, srcOffset + tileSize), dstOffset);
      dstOffset += this.width;
    }
  },

  update(gl, tileManager) {
    const tileCount = this.tile_count;
    const tilesPerRow = this.tiles_per_row;
    for (let i = 0; i < tileCount; i++) {
      const tileIndex = i;
      const pixels = tileManager.getTilePixels(tileIndex);
      const xTile = i % tilesPerRow;
      const yTile = Math.floor(i / tilesPerRow);
      this.blitTile(pixels, xTile, yTile);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RED, gl.UNSIGNED_BYTE, this.data);
  },
};
