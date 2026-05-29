// TileRenderer — the WebGL2 "graphics driver" for the tile layers. Consolidates
// the legacy port's Shader + IndexedTextureManager + palette-texture upload into
// one GL-owning object. It is the modern analog of Origin's GR_42 dispatch (see
// docs/research_i1_render_slice.md §8): an R8 atlas of palette indices + a 256x1
// palette texture, and a fragment shader doing the index->RGB lookup the VGA DAC
// did. Instanced draw: one quad per (tileId, tilePos) instance, per layer.

const VS = `#version 300 es
in uint a_tileIndex;
in vec2 a_tilePos;
uniform vec2 u_resolution;
uniform vec2 u_scroll;          // sub-tile pixel scroll offset
uniform float u_tileSize;
uniform float u_tilesPerRow;
uniform float u_atlasW;
uniform float u_atlasH;
out vec2 v_uv;
const vec2 quad[6] = vec2[6](
  vec2(0.,0.), vec2(1.,0.), vec2(0.,1.),
  vec2(0.,1.), vec2(1.,0.), vec2(1.,1.));
void main() {
  vec2 pos = (quad[gl_VertexID] * u_tileSize) + a_tilePos * u_tileSize - u_scroll;
  vec2 ndc = (pos / u_resolution * 2.0 - 1.0) * vec2(1.0, -1.0);
  gl_Position = vec4(ndc, 0, 1);
  float tx = float(a_tileIndex % uint(u_tilesPerRow));
  float ty = float(a_tileIndex / uint(u_tilesPerRow));
  vec2 uv0 = vec2(tx * u_tileSize / u_atlasW, ty * u_tileSize / u_atlasH);
  vec2 uv1 = uv0 + vec2(u_tileSize / u_atlasW, u_tileSize / u_atlasH);
  v_uv = mix(uv0, uv1, quad[gl_VertexID]);
}`;

const FS = `#version 300 es
precision mediump float;
uniform sampler2D u_indexed;
uniform sampler2D u_palette;
in vec2 v_uv;
out vec4 outColor;
void main() {
  float index = texture(u_indexed, v_uv).r * 255.0;
  outColor = texture(u_palette, vec2((index + 0.5) / 256.0, 0.5));
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

export class TileRenderer {
  constructor(canvas, { tileSize = 16, tilesPerRow = 64, tileCount = 2048 } = {}) {
    this.canvas = canvas;
    this.tileSize = tileSize;
    this.tilesPerRow = tilesPerRow;
    this.tileCount = tileCount;
    this.atlasW = tilesPerRow * tileSize;
    this.atlasH = Math.ceil(tileCount / tilesPerRow) * tileSize;
    this.layers = [];

    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    this.program = p;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.u_scroll = gl.getUniformLocation(p, 'u_scroll');
    this.u_resolution = gl.getUniformLocation(p, 'u_resolution');
    gl.uniform1i(gl.getUniformLocation(p, 'u_indexed'), 0);
    gl.uniform1i(gl.getUniformLocation(p, 'u_palette'), 1);
    gl.uniform1f(gl.getUniformLocation(p, 'u_tileSize'), tileSize);
    gl.uniform1f(gl.getUniformLocation(p, 'u_tilesPerRow'), tilesPerRow);
    gl.uniform1f(gl.getUniformLocation(p, 'u_atlasW'), this.atlasW);
    gl.uniform1f(gl.getUniformLocation(p, 'u_atlasH'), this.atlasH);
    gl.uniform2f(this.u_scroll, 0, 0);

    // Index atlas (TEXTURE0, R8) + palette (TEXTURE1, RGBA 256x1).
    this.atlasTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.atlasW, this.atlasH, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    this.paletteTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    this.resize(canvas.width, canvas.height);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    this.gl.uniform2f(this.u_resolution, w, h);
  }

  setScroll(px, py) { this.gl.uniform2f(this.u_scroll, px, py); }

  // Build the R8 index atlas from a TileRegistry (each tile's 16x16 palette indices).
  uploadAtlas(tileRegistry) {
    const { gl, tileSize, tilesPerRow, atlasW } = this;
    const data = new Uint8Array(atlasW * this.atlasH);
    for (let i = 0; i < this.tileCount; i++) {
      const px = tileRegistry.pixels(i);
      const bx = (i % tilesPerRow) * tileSize;
      const by = Math.floor(i / tilesPerRow) * tileSize;
      let dst = by * atlasW + bx;
      for (let row = 0, src = 0; row < tileSize; row++, src += 16, dst += atlasW) {
        data.set(px.subarray(src, src + tileSize), dst);
      }
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, atlasW, this.atlasH, gl.RED, gl.UNSIGNED_BYTE, data);
  }

  uploadPalette(rgba /* Uint8Array(256*4) */) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }

  // Create/replace a layer: instanced quads from a Uint16 tile-index buffer +
  // a Float32 (col,row) position buffer.
  setLayer(index, tileIndices, tilePositions) {
    const gl = this.gl;
    const old = this.layers[index];
    if (old) { gl.deleteBuffer(old.idxBuf); gl.deleteBuffer(old.posBuf); gl.deleteVertexArray(old.vao); }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ARRAY_BUFFER, tileIndices, gl.DYNAMIC_DRAW);
    const li = gl.getAttribLocation(this.program, 'a_tileIndex');
    gl.enableVertexAttribArray(li);
    gl.vertexAttribIPointer(li, 1, gl.UNSIGNED_SHORT, 0, 0);
    gl.vertexAttribDivisor(li, 1);
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, tilePositions, gl.STATIC_DRAW);
    const lp = gl.getAttribLocation(this.program, 'a_tilePos');
    gl.enableVertexAttribArray(lp);
    gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(lp, 1);
    gl.bindVertexArray(null);

    this.layers[index] = { vao, idxBuf, posBuf, count: tileIndices.length };
  }

  // Re-upload a layer's tile indices (positions unchanged).
  updateLayer(index, tileIndices) {
    const layer = this.layers[index];
    if (!layer) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, layer.idxBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, tileIndices);
  }

  render() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const layer of this.layers) {
      if (!layer || layer.count === 0) continue;
      gl.bindVertexArray(layer.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, layer.count);
    }
    gl.bindVertexArray(null);
  }
}
