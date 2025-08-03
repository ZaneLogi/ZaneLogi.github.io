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

  makeInstancedBuffer(attr, size, type, data, isInteger = false) {
    const gl = this.gl;
    const loc = gl.getAttribLocation(this.program, attr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    gl.enableVertexAttribArray(loc);

    if (isInteger) {
      gl.vertexAttribIPointer(loc, size, type, 0, 0); // 注意是 IPointer（整數）
    } else {
      gl.vertexAttribPointer(loc, size, type, false, 0, 0);
    }

    gl.vertexAttribDivisor(loc, 1);
    return buf;
  },

  createBuffers(mapTileIndices, mapTilePositions) {
    const gl = this.gl;
    this.tileIndexBuffer = Shader.makeInstancedBuffer('a_tileIndex', 1, gl.UNSIGNED_SHORT, mapTileIndices, true);
    this.tilePosBuffer = Shader.makeInstancedBuffer('a_tilePos', 2, gl.FLOAT, mapTilePositions);
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

  render(frame, AnimDataManager, PaletteManager, map) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u_resolution, this.canvas.width, this.canvas.height);

    PaletteManager.colorCycling(gl, frame);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, map.length); // 6 個 vertex、N 個 instance
  },

};