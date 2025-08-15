import { U7Palettes } from './u7palettes.js';
import { ShapeFile } from "./shapefile.js";
import { U7Chunks } from "./u7chunks.js";
import { ShapeDims } from "./shape_dims.js";
import { TFA } from "./tfa.js";
import { WorldMap } from './world_map.js';
import { TimeQueue } from './time_queue.js';

export const palettes = new U7Palettes();
export const shapesVga = new ShapeFile();
export const terrains = new U7Chunks();
export const shpdims = new ShapeDims();
export const tfa = new TFA();
export const worldMap = new WorldMap();
export const timeQueue = new TimeQueue();
