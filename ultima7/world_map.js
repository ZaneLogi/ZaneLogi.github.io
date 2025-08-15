import { shapesVga, terrains, shpdims, tfa } from "./globals.js";

class FrameAnimator {
  constructor(obj) {
    this.obj = obj;
  }

  update(timestamp, context) {

  }
}

class MapComponent {
  constructor(xchunk, ychunk, xtile, ytile, lift) {
    this.xchunk = xchunk;
    this.ychunk = ychunk;
    this.xtile = xtile;
    this.ytile = ytile;
    this.lift = lift;
  }
}

class Ground {
  constructor(xtile, ytile, frameImage) {
    this.x = xtile * 8 + 7; // hotspot (7,7)
    this.y = ytile * 8 + 7;
    this.frameImage = frameImage;
  }

  draw(frameBuffer, ox, oy) {
    this.frameImage.draw(frameBuffer, ox + this.x, oy + this.y);
  }
}

class TerrainOverlay {
  constructor(xtile, ytile, frameImage, shapeId) {
    this.x = xtile * 8 + 7; // hotspot (7,7)
    this.y = ytile * 8 + 7;
    this.frameImage = frameImage;
    this.shapeType = shapeId.type;
    this.shapeFrame = shapeId.frame;
    this.reflected = shapeId.reflected;
    if (tfa.getReusableView(this.shapeType).isAnimated) {
      const animator = {
        firstFrame: 0,
        lastFrame: shapeId.frame,
        frames: shapesVga.shapes[shapeId.type].frames.length
      };
    }
  }

  draw(frameBuffer, ox, oy) {
    this.frameImage.draw(frameBuffer, ox + this.x, oy + this.y, null, this.reflected);
  }
}

class MapChunk {
  constructor(xchunk, ychunk, terrainId) {
    this.xchunk = xchunk;
    this.ychunk = ychunk;
    this.terrainId = terrainId;
    this.ground = [];
    this.terrainOverlay = [];

    const shapeId = {type:0, frame:0, reflected:0};
    const shapeArray = terrains.getChunk(terrainId).shapeArray;
    const shapes = shapesVga.shapes;

    for (let y = 0; y < 16; y++) {
      const baseIndex = y * 16;
      for (let x = 0; x < 16; x++) {
        shapeArray.decodeAt(baseIndex + x, shapeId);
        const frameImage = shapes[shapeId.type].frames[shapeId.frame];
        if (frameImage.rle) {
          this.terrainOverlay.push(new TerrainOverlay(x, y, frameImage, shapeId));
        }
        else {
          this.ground.push(new Ground(x, y, frameImage));
        }
      }
    }
  }

  drawBase(frameBuffer, ox, oy) {
    for (const g of this.ground) {
      g.draw(frameBuffer, ox, oy);
    }
  }

  drawTerrainOverlay(frameBuffer, ox, oy) {
    for (const t of this.terrainOverlay) {
      t.draw(frameBuffer, ox, oy);
    }
  }
}

export class WorldMap {
  constructor() {
    this.mapChunks = new Array(192 * 192);
    this.viewArea = {x:0, y:0, width:16, height:16};
  }

  load(fileMap) {
    this.loadU7Map(fileMap.get("static/u7map"));

    terrains.load(fileMap.get("static/u7chunks"));
    shpdims.load(fileMap.get("static/shpdims.dat"));
    tfa.load(fileMap.get("static/tfa.dat"));
  }

  loadU7Map(uint8) {
    const u7map = new Uint16Array(uint8.buffer, uint8.byteOffset, uint8.byteLength / 2);

    const WIDTH = 192;
    const HEIGHT = 192;
    const CHUNKS_PER_SUPERCHUNK = 16;
    const SUPERCHUNK_COUNT = 12;

    const baseMap = new Uint16Array(WIDTH * HEIGHT);

    let offset = 0;
    for (let sy = 0; sy < SUPERCHUNK_COUNT; sy++) {
      for (let sx = 0; sx < SUPERCHUNK_COUNT; sx++) {
        for (let cy = 0; cy < CHUNKS_PER_SUPERCHUNK; cy++) {
          const mapY = sy * CHUNKS_PER_SUPERCHUNK + cy;
          let baseIndex = mapY * WIDTH + sx * CHUNKS_PER_SUPERCHUNK;
          for (let cx = 0; cx < CHUNKS_PER_SUPERCHUNK; cx++) {
            baseMap[baseIndex + cx] = u7map[offset++];
          }
        }
      }
    }
    this.baseMap = baseMap;
  }

  getChunk(x, y) {
    const offset = (y << 7) + (y << 6) + x; // y*192 = y*128 + y*64
    let mapChunk = this.mapChunks[offset];
    if (!mapChunk) {
      mapChunk = new MapChunk(x, y, this.baseMap[offset]);
      this.mapChunks[offset] = mapChunk;
    }
    return mapChunk;
  }

  draw(frameBuffer, originX, originY) {
    // (originX, originY) is placed at (0, 0) of the frame buffer
    if (originX < 0 || originY < 0) {
      throw new Error("Invalid origin!");
    }
    const PIXELS_PER_CHUNK = 128;
    const CHUNKS_PER_MAP = 192;
    const {width, height} = frameBuffer;
    const alignedOriginX = originX - (originX % PIXELS_PER_CHUNK); // chunk_size = 128
    const alignedOriginY = originY - (originY % PIXELS_PER_CHUNK);
    const startChunkX = Math.floor(alignedOriginX / PIXELS_PER_CHUNK);
    const startChunkY = Math.floor(alignedOriginY / PIXELS_PER_CHUNK);
    const chunksW = Math.floor(((originX - alignedOriginX) + width + 127) / PIXELS_PER_CHUNK);
    const chunksH = Math.floor(((originY - alignedOriginY) + height + 127) / PIXELS_PER_CHUNK);
    const endChunkX = (startChunkX + (chunksW + 1) + 1) % CHUNKS_PER_MAP; // wrap?
    const endChunkY = (startChunkY + (chunksH + 1) + 1) % CHUNKS_PER_MAP;
    // add one more chunk because a chunk is influenced by its neighbor chunks.

    const nextChunk = (current) => current + 1 < CHUNKS_PER_MAP ? current + 1 : 0;

    if (!this.done) {
      console.log(`${startChunkX}, ${startChunkY}, ${endChunkX}, ${endChunkY}`);
      this.done = true;
    }

    // Paint all the flat scenery.
    for (let chky = startChunkY, offy = (alignedOriginY-originY);
      chky != endChunkY;
      chky = nextChunk(chky), offy += PIXELS_PER_CHUNK)
    {
      for (let chkx = startChunkX, offx = (alignedOriginX-originX);
        chkx != endChunkX;
        chkx = nextChunk(chkx), offx += PIXELS_PER_CHUNK)
      {
        const mapChunk = this.getChunk(chkx, chky);
        mapChunk.drawBase(frameBuffer, offx, offy);
        mapChunk.drawTerrainOverlay(frameBuffer, offx, offy);
      }
    }
  }
}