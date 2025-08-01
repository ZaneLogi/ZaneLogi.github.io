// === Shader Source ===
/*
code below is refactored by gl_InstanceID and gl_VertexID

const vsSource = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
uniform vec2 u_resolution;
out vec2 v_uv;
void main() {
  vec2 normalized = (a_position / u_resolution * 2.0 - 1.0) * vec2(1.0, -1.0);
  gl_Position = vec4(normalized, 0, 1);
  v_uv = a_uv;
}`;
*/
const vsSource = `#version 300 es
in float a_tileIndex;
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

  float tx = mod(a_tileIndex, u_tilesPerRow);
  float ty = floor(a_tileIndex / u_tilesPerRow);
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

/* original version:
float index = texture(u_indexedTexture, v_uv).r;
outColor = texture(u_paletteTexture, vec2(index, 0.5));

as WebGL normalizes values from 0–255 to the range 0.0–1.0,
'index' is the value from 0.0-1.0, need to convert it back to 0-255
so it should do ('index' * 255.0 + 0.5) / 256.0
:index = 0 → paletteU = 0.5 / 256 = center of the 0th texel
:index = 1 → paletteU = 255.5 / 256 = center of the last (255th) texel
:This ensures alignment with the exact centers of all 256 texels → no sampling error, no black pixels
*/

// === Shader Utilities ===
function createShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

// === Program Setup ===
const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl2');
export const program = gl.createProgram();
gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vsSource));
gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fsSource));
gl.linkProgram(program);
gl.useProgram(program);