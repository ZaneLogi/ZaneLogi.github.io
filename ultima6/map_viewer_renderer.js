// === Shader Source ===
const vsSource = `#version 300 es
in uint a_tileIndex;
in vec2 a_tilePos;

uniform vec2 u_resolution;
uniform float u_tileSize;
uniform float u_tilesPerRow;
uniform float u_atlasW;
uniform float u_atlasH;

out vec2 v_uv;

const vec2 quadVerts[6] = vec2[6](
  vec2(0.0, 0.0),
  vec2(1.0, 0.0),
  vec2(0.0, 1.0),
  vec2(0.0, 1.0),
  vec2(1.0, 0.0),
  vec2(1.0, 1.0)
);

void main() {
  vec2 offset = a_tilePos * u_tileSize;
  vec2 pos = (quadVerts[gl_VertexID] * u_tileSize) + offset;

  vec2 normalized = (pos / u_resolution * 2.0 - 1.0) * vec2(1.0, -1.0);
  gl_Position = vec4(normalized, 0, 1);

  float tx = float(a_tileIndex % uint(u_tilesPerRow));
  float ty = float(a_tileIndex / uint(u_tilesPerRow));
  vec2 uv0 = vec2(tx * u_tileSize / u_atlasW, ty * u_tileSize / u_atlasH);
  vec2 uv1 = uv0 + vec2(u_tileSize / u_atlasW, u_tileSize / u_atlasH);

  v_uv = mix(uv0, uv1, quadVerts[gl_VertexID]);
}`;

const fsSource = `#version 300 es
precision mediump float;
uniform sampler2D u_indexedTexture;
uniform sampler2D u_paletteTexture;
in vec2 v_uv;
out vec4 outColor;
void main() {
  float index = texture(u_indexedTexture, v_uv).r * 255.0;
  float paletteU = (index + 0.5) / 256.0;
  outColor = texture(u_paletteTexture, vec2(paletteU, 0.5));
}`;

// === Shader Utilities ===
function createShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

export const Shader = {
  canvas: null,
  gl: null,
  program: null,
  u_resolution: null,
  u_indexed: null,
  u_palette: null,
  tileSize: 0,
  tileIndexBuffer: null,
  tilePosBuffer: null,
  groundVAO: null,
  objectTileIndexBuffer: null,
  objectPosBuffer: null,
  objectVAO: null,
  tileLayers: [],

  init(canvas, tileSize, tilesPerRow, atlasW, atlasH) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2");
    if (!this.gl) throw new Error("WebGL2 not supported");

    const gl = this.gl;
    this.program = gl.createProgram();
    const program = this.program;
    gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);
    gl.useProgram(program);

    // enable alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // === Uniforms ===
    this.u_resolution = gl.getUniformLocation(program, 'u_resolution');
    gl.uniform2f(this.u_resolution, canvas.width, canvas.height);
    this.u_indexed = gl.getUniformLocation(program, 'u_indexedTexture');
    this.u_palette = gl.getUniformLocation(program, 'u_paletteTexture');
    gl.uniform1i(this.u_indexed, 0);
    gl.uniform1i(this.u_palette, 1);

    gl.uniform1f(gl.getUniformLocation(program, "u_tileSize"), tileSize);
    gl.uniform1f(gl.getUniformLocation(program, "u_tilesPerRow"), tilesPerRow);
    gl.uniform1f(gl.getUniformLocation(program, "u_atlasW"), atlasW);
    gl.uniform1f(gl.getUniformLocation(program, "u_atlasH"), atlasH);

    this.tileSize = tileSize;
  },

  createVAO(tileIndices, tilePositions) {
    const gl = this.gl;
    const program = this.program;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Tile index buffer
    const tileIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tileIndexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, tileIndices, gl.DYNAMIC_DRAW);
    const locIdx = gl.getAttribLocation(program, 'a_tileIndex');
    gl.enableVertexAttribArray(locIdx);
    gl.vertexAttribIPointer(locIdx, 1, gl.UNSIGNED_SHORT, 0, 0);
    gl.vertexAttribDivisor(locIdx, 1);

    // Tile position buffer
    const tilePosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tilePosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, tilePositions, gl.STATIC_DRAW);
    const locPos = gl.getAttribLocation(program, 'a_tilePos');
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(locPos, 1);

    gl.bindVertexArray(null);

    const instanceCount = tileIndices.length;

    return {
      vao,
      tileIndexBuffer,
      tilePosBuffer,
      instanceCount
    };
  },

  createLayer(index, tileIndices, tilePositions) {
    const gl = this.gl;
    if (this.tileLayers[index]) {
      // If layer already exists, delete it
      const layer = this.tileLayers[index];
      if (layer.tileIndexBuffer) gl.deleteBuffer(layer.tileIndexBuffer);
      if (layer.tilePosBuffer) gl.deleteBuffer(layer.tilePosBuffer);
      if (layer.vao) gl.deleteVertexArray(layer.vao);
    }
    const layer = this.createVAO(tileIndices, tilePositions);
    this.tileLayers[index] = layer;
  },

  getUpdateThresholdRatio(tileCount) {
    if (tileCount < 500) return 0.15;     // Small map: be more aggressive with full update
    if (tileCount < 2000) return 0.25;    // Medium map: default ratio
    return 0.35;                          // Large map: tolerate more partial updates
  },

  calculateUpdateThreshold(tileCount, minThreshold = 16) {
    const ratio = this.getUpdateThresholdRatio(tileCount);
    return Math.max(tileCount * ratio, minThreshold);
  },

  shouldUseFullUpdate(tileCount, modifiedCount, minThreshold = 16) {
    const threshold = this.calculateUpdateThreshold(tileCount, minThreshold);
    return modifiedCount > threshold;
  },

  updateLayer(index, tileIndices, modifiedIndices = null) {
    const layer = this.tileLayers?.[index];
    if (!layer || (layer.instanceCount ?? 0) === 0) return;

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, layer.tileIndexBuffer);

    if (modifiedIndices == null || modifiedIndices.size === 0) {
      // Full update
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, tileIndices);
      return;
    }

    const tileCount = tileIndices.length;
    const modifiedCount = modifiedIndices.size;

    if (this.shouldUseFullUpdate(tileCount, modifiedCount)) {
      // Too many updates, treat as full
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, tileIndices);
      return;
    }

    // === Consolidate continuous index ranges ===
    const sorted = Array.from(modifiedIndices).filter(i => i < tileCount).sort((a, b) => a - b);

    let start = sorted[0];
    let end = start + 1;

    for (let i = 1; i <= sorted.length; ++i) {
      const current = sorted[i];
      if (current === end) {
        end++;
      } else {
        const byteOffset = start * 2;
        const sub = tileIndices.subarray(start, end);
        gl.bufferSubData(gl.ARRAY_BUFFER, byteOffset, sub);

        start = current;
        end = current + 1;
      }
    }
  },

  renderLayer(layer) {
    if ((layer?.instanceCount ?? 0) === 0) return;
    const gl = this.gl;
    gl.bindVertexArray(layer.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, layer.instanceCount);
    gl.bindVertexArray(null);
  },

  render(frame, PaletteManager) {
    const gl = this.gl;
    PaletteManager.colorCycling(gl, frame);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.0, 0.2, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.uniform2f(this.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_tileSize"), this.tileSize);

    // 0:gournd, 1:lower objects, 2:actors, 3:top objects
    const visible = [true, true, true, true, true, true, true, true];

    for (let i = 0; i < this.tileLayers.length; ++i) {
      if (!visible[i]) continue; // Skip hidden layers
      const layer = this.tileLayers[i];
      this.renderLayer(layer);
    }
  },
};