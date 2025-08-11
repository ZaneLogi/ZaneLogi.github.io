"use strict"

function mod(n, m) {
  return ((n % m) + m) % m;
}

class ResizableFloat32Buffer {
  constructor() {
    this.buffer = new Float32Array(1024);
    this.length = 0;
    this.prevGPUSize = 0;
  }

  clear() {
    this.length = 0;
  }

  append(array) {
    if (this.length + array.length > this.buffer.length) {
      let newSize = this.buffer.length * 2;
      while (newSize < this.length + array.length) newSize *= 2;
      const newBuf = new Float32Array(newSize);
      newBuf.set(this.buffer);
      this.buffer = newBuf;
    }
    this.buffer.set(array, this.length);
    this.length += array.length;
  }

  subarray() {
    return this.buffer.subarray(0, this.length);
  }
}

class ResizableUint16Buffer {
  constructor() {
    this.buffer = new Uint16Array(1024);
    this.length = 0;
    this.prevGPUSize = 0;
  }

  clear() {
    this.length = 0;
  }

  append(array) {
    if (this.length + array.length > this.buffer.length) {
      let newSize = this.buffer.length * 2;
      while (newSize < this.length + array.length) newSize *= 2;
      const newBuf = new Uint16Array(newSize);
      newBuf.set(this.buffer);
      this.buffer = newBuf;
    }
    this.buffer.set(array, this.length);
    this.length += array.length;
  }

  subarray() {
    return this.buffer.subarray(0, this.length);
  }
}

class TileRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2");
    if (!this.gl) throw new Error("WebGL2 not supported");

    this._initShaders();
  }

  _initShaders() {
    const gl = this.gl;
    // Shader sources
    const vsSource = `#version 300 es
      in vec2 a_position;
      in vec2 a_uv;
      out vec2 v_uv;
      uniform vec2 u_resolution;
      void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 zeroToTwo = zeroToOne * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        v_uv = a_uv;
      }`;

    const fsSource = `#version 300 es
      precision mediump float;
      uniform sampler2D u_tileTexture;
      uniform sampler2D u_palette;
      in vec2 v_uv;
      out vec4 outColor;
      void main() {
        float index = texture(u_tileTexture, v_uv).r;
        outColor = texture(u_palette, vec2(index, 0.5));
      }`;

      this.program = this._createProgram(vsSource, fsSource);
      gl.useProgram(this.program);
  }

  _createShader(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  _createProgram(vsSrc, fsSrc) {
    const gl = this.gl;
    const p = gl.createProgram();
    gl.attachShader(p, this._createShader(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, this._createShader(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  initTextures(paletteData, tileTextureData) {
    const gl = this.gl;

    this.posLoc = gl.getAttribLocation(this.program, "a_position");
    this.uvLoc = gl.getAttribLocation(this.program, "a_uv");
    this.resolutionLoc = gl.getUniformLocation(this.program, "u_resolution");

    const paletteTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, paletteData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);

    const tileTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tileTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, TILE_ATLAS_WIDTH, TILE_ATLAS_HEIGHT, 0, gl.RED, gl.UNSIGNED_BYTE, tileTextureData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Uniform binding
    const tileTexLoc = gl.getUniformLocation(this.program, "u_tileTexture");
    const paletteTexLoc = gl.getUniformLocation(this.program, "u_palette");
    gl.uniform1i(tileTexLoc, 0);
    gl.uniform1i(paletteTexLoc, 1);
  }

  initBuffers() {
    const gl = this.gl;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.posBuffer = gl.createBuffer();
    this.uvBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();

    this.positionsBuf = new ResizableFloat32Buffer();
    this.uvsBuf = new ResizableFloat32Buffer();
    this.indicesBuf = new ResizableUint16Buffer();

    this.indexOffset = 0;
  }

  addTile(x, y, tileIndex) {
    const screenX = x * TILE_SIZE;
    const screenY = y * TILE_SIZE;
    const tu = tileIndex % TILES_PER_ROW;
    const tv = Math.floor(tileIndex / TILES_PER_ROW);
    const u0 = tu * TILE_SIZE / TILE_ATLAS_WIDTH;
    const v0 = tv * TILE_SIZE / TILE_ATLAS_HEIGHT;
    const u1 = (tu + 1) * TILE_SIZE / TILE_ATLAS_WIDTH;
    const v1 = (tv + 1) * TILE_SIZE / TILE_ATLAS_HEIGHT;

    const x0 = screenX;
    const y0 = screenY;
    const x1 = screenX + TILE_SIZE;
    const y1 = screenY + TILE_SIZE;

    this.positionsBuf.append([x0, y0, x1, y0, x0, y1, x1, y1]);
    this.uvsBuf.append([u0, v0, u1, v0, u0, v1, u1, v1]);
    this.indicesBuf.append([
      this.indexOffset, this.indexOffset + 1, this.indexOffset + 2,
      this.indexOffset + 2, this.indexOffset + 1, this.indexOffset + 3
    ]);
    this.indexOffset += 4;
  }

  updateBuffers() {
    const gl = this.gl;

    this.positionsBuf.clear();
    this.uvsBuf.clear();
    this.indicesBuf.clear();
    this.indexOffset = 0;

    const startTileX = Math.floor(dragOffset.x / TILE_SIZE);
    const startTileY = Math.floor(dragOffset.y / TILE_SIZE);
    const tilesX = Math.ceil(canvas.width / TILE_SIZE) + 1;
    const tilesY = Math.ceil(canvas.height / TILE_SIZE) + 1;

    for (let y = 0; y < tilesY; y++) {
      for (let x = 0; x < tilesX; x++) {
        const mapX = x + startTileX;
        const mapY = y + startTileY;
        if (mapX < 0 || mapY < 0 || mapX >= MAP_WIDTH || mapY >= MAP_HEIGHT) continue;
        const tile = mapData[mapY * MAP_WIDTH + mapX];
        const pixelOffsetX = mod(dragOffset.x, TILE_SIZE);
        const pixelOffsetY = mod(dragOffset.y, TILE_SIZE);
        this.addTile(x - pixelOffsetX / TILE_SIZE, y - pixelOffsetY / TILE_SIZE, tile);
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    if (this.positionsBuf.length * 4 > this.positionsBuf.prevGPUSize) {
      gl.bufferData(gl.ARRAY_BUFFER, this.positionsBuf.length * 4, gl.DYNAMIC_DRAW);
      this.positionsBuf.prevGPUSize = this.positionsBuf.length * 4;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positionsBuf.subarray());
    gl.enableVertexAttribArray(this.posLoc);
    gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, 0, 0);


    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    if (this.uvsBuf.length * 4 > this.uvsBuf.prevGPUSize) {
      gl.bufferData(gl.ARRAY_BUFFER, this.uvsBuf.length * 4, gl.DYNAMIC_DRAW);
      this.uvsBuf.prevGPUSize = this.uvsBuf.length * 4;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.uvsBuf.subarray());
    gl.enableVertexAttribArray(this.uvLoc);
    gl.vertexAttribPointer(this.uvLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    if (this.indicesBuf.length * 2 > this.indicesBuf.prevGPUSize) {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indicesBuf.length * 2, gl.DYNAMIC_DRAW);
      this.indicesBuf.prevGPUSize = this.indicesBuf.length * 2;
    }
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.indicesBuf.subarray());

    return this.indicesBuf.length;
  }

  render() {
    const gl = this.gl;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(this.resolutionLoc, this.canvas.width, this.canvas.height);
    gl.bindVertexArray(this.vao);
    const count = this.updateBuffers();
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
  }
}