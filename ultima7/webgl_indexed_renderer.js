export class WebGLIndexedRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2");
    if (!this.gl) throw new Error("WebGL2 not supported");

    this.frameBuffer = {p:null, pitch:0, width:0, height:0};
    this.fbWidth = 0;
    this.fbHeight = 0;

    this._initGL();
    this._initShaders();
    this._initQuad();
    this._initTextures();
  }

  _initGL() {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  _initShaders() {
    const gl = this.gl;

    const vsSource = `#version 300 es
      in vec2 a_position;
      out vec2 v_uv;
      void main() {
        v_uv = (a_position + 1.0) * 0.5;
        gl_Position = vec4(a_position, 0, 1);
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

    const vs = this._compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fsSource);

    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error("Shader link error: " + gl.getProgramInfoLog(this.program));
    }

    gl.useProgram(this.program);
  }

  _compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile error: " + gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  _initQuad() {
    const gl = this.gl;
    const quad = new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1,  1, 1, -1,  1, 1
    ]);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  }

  _initTextures() {
    const gl = this.gl;

    // Palette texture (256x1 RGBA)
    const palette = new Uint8Array(256 * 4);
    for (let i = 0, offset = 0; i < 256; i++, offset += 4) {
      palette[offset] = i;
      palette[offset+1] = i;
      palette[offset+2] = i;
      palette[offset+3] = 255;
    }

    this.paletteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, palette);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);

    // Framebuffer texture (will resize on demand)
    const {width, height} = this.canvas;
    const p = new Uint8Array(width * height);
    this.frameBuffer.p = p;
    this.frameBuffer.pitch = width;
    this.frameBuffer.width = width;
    this.frameBuffer.height = height;

    this.indexTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.indexTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, p);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const u_indexed = gl.getUniformLocation(this.program, "u_indexedTexture");
    const u_palette = gl.getUniformLocation(this.program, "u_paletteTexture");
    gl.uniform1i(u_indexed, 0);
    gl.uniform1i(u_palette, 1);
  }

  setPalette(paletteUint8Array) {
    const gl = this.gl;
    if (paletteUint8Array.length !== 256 * 4) {
      throw new Error("Palette must be 256 * 4 = 1024 bytes (RGBA format)");
    }
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, paletteUint8Array);
  }

  resize(width, height) {
    const gl = this.gl;

    gl.viewport(0, 0, width, height);

    this.frameBuffer.p = new Uint8Array(width * height);
    this.frameBuffer.pitch = width;
    this.frameBuffer.width = width;
    this.frameBuffer.height = height;

    gl.bindTexture(gl.TEXTURE_2D, this.indexTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  getBuffer() {
    return this.frameBuffer;
  }

  render() {
    const gl = this.gl;
    const { width, height } = this.frameBuffer;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.indexTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.UNSIGNED_BYTE, this.frameBuffer.p);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}