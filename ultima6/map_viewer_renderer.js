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

  createBuffers(mapTileIndices, mapTilePositions) {
    const gl = this.gl;

    // delete old buffers
    if (this.tileIndexBuffer) gl.deleteBuffer(this.tileIndexBuffer);
    if (this.tilePosBuffer) gl.deleteBuffer(this.tilePosBuffer);
    if (this.groundVAO) gl.deleteVertexArray(this.groundVAO);

    this.groundVAO = gl.createVertexArray();
    gl.bindVertexArray(this.groundVAO);

    // a_tileIndex buffer
    this.tileIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tileIndexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mapTileIndices, gl.DYNAMIC_DRAW);
    const locIdx = gl.getAttribLocation(this.program, 'a_tileIndex');
    gl.enableVertexAttribArray(locIdx);
    gl.vertexAttribIPointer(locIdx, 1, gl.UNSIGNED_SHORT, 0, 0);
    gl.vertexAttribDivisor(locIdx, 1);

    // a_tilePos buffer
    this.tilePosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tilePosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mapTilePositions, gl.STATIC_DRAW);
    const locPos = gl.getAttribLocation(this.program, 'a_tilePos');
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(locPos, 1);

    gl.bindVertexArray(null);
  },

  updateTileIndexBuffer(mapTileIndices, modifiedIndices = null) {
    const gl = this.gl;

    if (modifiedIndices == null) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tileIndexBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mapTileIndices);
    }
    else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tileIndexBuffer);

      const MAX_PER_TILE_UPDATES = 64;

      if (modifiedIndices.size > MAX_PER_TILE_UPDATES) {
        // Too many changes, update the whole buffer at once
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, mapTileIndices);
      } else {
        // Few changes, only update the modified parts
        for (const i of modifiedIndices) {
          const byteOffset = i * 2; // Uint16 = 2 bytes
          gl.bufferSubData(gl.ARRAY_BUFFER, byteOffset, mapTileIndices.subarray(i, i + 1));
        }
      }
    }
  },

  updateObjectBuffers(objectTileIndices, objectPositions) {
    const gl = this.gl;

    if (this.objectVAO) gl.deleteVertexArray(this.objectVAO);
    if (this.objectTileIndexBuffer) gl.deleteBuffer(this.objectTileIndexBuffer);
    if (this.objectPosBuffer) gl.deleteBuffer(this.objectPosBuffer);

    this.objectVAO = gl.createVertexArray();
    gl.bindVertexArray(this.objectVAO);

    // a_tileIndex
    this.objectTileIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.objectTileIndexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, objectTileIndices, gl.DYNAMIC_DRAW);
    const locIdx = gl.getAttribLocation(this.program, 'a_tileIndex');
    gl.enableVertexAttribArray(locIdx);
    gl.vertexAttribIPointer(locIdx, 1, gl.UNSIGNED_SHORT, 0, 0);
    gl.vertexAttribDivisor(locIdx, 1);

    // a_tilePos
    this.objectPosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.objectPosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, objectPositions, gl.DYNAMIC_DRAW);
    const locPos = gl.getAttribLocation(this.program, 'a_tilePos');
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(locPos, 1);

    gl.bindVertexArray(null);
  },

  updateObjTileIndexBuffer(objTileIndices, modifiedIndices = null) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.objectTileIndexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, objTileIndices);
  },

  render(frame, PaletteManager, groundTileLength, objectTileLength) {
    const gl = this.gl;
    PaletteManager.colorCycling(gl, frame);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.0, 0.2, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.renderGround(groundTileLength);
    this.renderObjects(objectTileLength);
  },

  renderGround(groundTileLength) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform2f(this.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_tileSize"), this.tileSize);

    gl.bindVertexArray(this.groundVAO);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, groundTileLength);
    gl.bindVertexArray(null);
  },

  renderObjects(objectTileLength) {
    if (objectTileLength === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform2f(this.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_tileSize"), this.tileSize);

    gl.bindVertexArray(this.objectVAO);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, objectTileLength);
    gl.bindVertexArray(null);
  },
};