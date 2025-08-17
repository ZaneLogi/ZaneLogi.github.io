import { U7Palettes } from './u7palettes.js';
import { ShapeFile } from "./shapefile.js";
import { U7Chunks } from "./u7chunks.js";
import { ShapeDims } from "./shape_dims.js";
import { TFA } from "./tfa.js";
import { Occlude } from './occlude.js';
import { WorldMap } from './world_map.js';
import { TimeQueue } from './time_queue.js';

export const PIXELS_PER_TILE = 8;
export const TILES_PER_CHUNK = 16;
export const CHUNKS_PER_SUPERCHUNK = 16;
export const SUPERCHUNKS_PER_WORLD = 12;

export const CHUNKS_PER_WORLD = CHUNKS_PER_SUPERCHUNK * SUPERCHUNKS_PER_WORLD;    // 192

export const PIXELS_PER_CHUNK = PIXELS_PER_TILE * TILES_PER_CHUNK;                // 128
export const PIXELS_PER_SUPERCHUNK = PIXELS_PER_CHUNK * CHUNKS_PER_SUPERCHUNK;    // 2048
export const PIXELS_PER_WORLD = PIXELS_PER_SUPERCHUNK * SUPERCHUNKS_PER_WORLD;

export const nextChunk = (current) => current + 1 < CHUNKS_PER_WORLD ? current + 1 : 0;
export const prevChunk = (current) => current - 1 >= 0 ? current - 1 : CHUNKS_PER_WORLD - 1;

export class ShapeID {
  static cache = {type:0, frame:0, reflected:0};
  static decode(value) {
    const out = ShapeID.cache;
    out.type = value & 0x03ff;
    out.frame = (value >> 10) & 0x1f;
    out.reflected = (value >> 15) & 1;
    return out;
  }

  constructor(value) {
    this.type = value & 0x03ff;
    this.frame = (value >> 10) & 0x1f;
    this.reflected = (value >> 15) & 1;
  }

  toString() {
    return `ShapeID(type=${this.type}, frame=${this.frame}, reflected=${this.reflected}, value=0x${this.value.toString(16)})`;
  }
}

export const palettes = new U7Palettes();
export const shapesVga = new ShapeFile();
export const terrains = new U7Chunks();
export const shpdims = new ShapeDims();
export const tfa = new TFA();
export const occlude = new Occlude();
export const worldMap = new WorldMap();
export const timeQueue = new TimeQueue();

