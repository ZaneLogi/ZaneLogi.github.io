import { FlexFile } from "./flexfile.js";
import { MapChunk } from "./map_chunk.js";
import { MapObject, StandardIregObject, ContainerObject, SpellbookObject } from "./map_object.js";
import { ShapeClass } from "./tfa.js";
import { terrains, shpdims, tfa, occlude, ShapeID, worldMap } from "./globals.js";

import {
  CHUNKS_PER_SUPERCHUNK,
  SUPERCHUNKS_PER_WORLD,
  CHUNKS_PER_WORLD,
  PIXELS_PER_CHUNK,
  PIXELS_PER_SUPERCHUNK,
  prevChunk,
  nextChunk
} from "./globals.js";


export class WorldMap {
  constructor() {
    this.mapChunks = new Array(192 * 192);
    this.superChunkRead = new Array(SUPERCHUNKS_PER_WORLD * SUPERCHUNKS_PER_WORLD).fill(false);
    this.viewport = {x:0, y:0, width:16, height:16};
    this.renderSequence = 0;
  }

  currentRenderSequence() {
    return this.renderSequence;
  }

  nextRenderSequence() {
    this.renderSequence++;
  }

  getSuperChunkIndex(sx, sy) {
    return sy * SUPERCHUNKS_PER_WORLD + sx;
  }

  markSuperChunkRead(sx, sy) {
    this.superChunkRead[this.getSuperChunkIndex(sx, sy)] = true;
  }

  isSuperChunkRead(sx, sy) {
    return this.superChunkRead[this.getSuperChunkIndex(sx, sy)];
  }

  load(fileMap) {
    this.fileMap = fileMap;
    this.loadU7Map(fileMap.get("static/u7map"));
    terrains.load(fileMap.get("static/u7chunks"));
    shpdims.load(fileMap.get("static/shpdims.dat"));
    tfa.load(fileMap.get("static/tfa.dat"));
    occlude.load(fileMap.get("static/occlude.dat"));
  }

  loadU7Map(uint8) {
    const u7map = new Uint16Array(uint8.buffer, uint8.byteOffset, uint8.byteLength / 2);

    const baseMap = new Uint16Array(CHUNKS_PER_WORLD * CHUNKS_PER_WORLD);

    let offset = 0;
    for (let sy = 0; sy < SUPERCHUNKS_PER_WORLD; sy++) {
      for (let sx = 0; sx < SUPERCHUNKS_PER_WORLD; sx++) {
        for (let cy = 0; cy < CHUNKS_PER_SUPERCHUNK; cy++) {
          const mapY = sy * CHUNKS_PER_SUPERCHUNK + cy;
          let baseIndex = mapY * CHUNKS_PER_WORLD + sx * CHUNKS_PER_SUPERCHUNK;
          for (let cx = 0; cx < CHUNKS_PER_SUPERCHUNK; cx++) {
            baseMap[baseIndex + cx] = u7map[offset++];
          }
        }
      }
    }
    this.baseMap = baseMap;
  }

  getMapChunk(x, y) {
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

    const {width, height} = frameBuffer;

    this.viewport.x = 0;
    this.viewport.y = 0;
    this.viewport.width = width;
    this.viewport.height = height;

    this.readAreaMap(originX, originY, width, height);

    const alignedOriginX = originX - (originX % PIXELS_PER_CHUNK); // chunk_size = 128
    const alignedOriginY = originY - (originY % PIXELS_PER_CHUNK);
    const startChunkX = Math.floor(alignedOriginX / PIXELS_PER_CHUNK);
    const startChunkY = Math.floor(alignedOriginY / PIXELS_PER_CHUNK);
    const chunksW = Math.floor(((originX - alignedOriginX) + width + 127) / PIXELS_PER_CHUNK);
    const chunksH = Math.floor(((originY - alignedOriginY) + height + 127) / PIXELS_PER_CHUNK);
    const endChunkX = (startChunkX + (chunksW + 1) + 1) % CHUNKS_PER_WORLD; // wrap?
    const endChunkY = (startChunkY + (chunksH + 1) + 1) % CHUNKS_PER_WORLD;
    // add one more chunk because a chunk is influenced by its neighbor chunks.

    this.nextRenderSequence();

    // Paint all the flat scenery.
    for (let chky = startChunkY, offy = (alignedOriginY-originY);
      chky != endChunkY;
      chky = nextChunk(chky), offy += PIXELS_PER_CHUNK)
    {
      for (let chkx = startChunkX, offx = (alignedOriginX-originX);
        chkx != endChunkX;
        chkx = nextChunk(chkx), offx += PIXELS_PER_CHUNK)
      {
        const mapChunk = this.getMapChunk(chkx, chky);
        mapChunk.drawBase(frameBuffer, offx, offy);
      }
    }

    // Now the flat RLE terrain.
    for (let chky = startChunkY, offy = (alignedOriginY-originY);
      chky != endChunkY;
      chky = nextChunk(chky), offy += PIXELS_PER_CHUNK)
    {
      for (let chkx = startChunkX, offx = (alignedOriginX-originX);
        chkx != endChunkX;
        chkx = nextChunk(chkx), offx += PIXELS_PER_CHUNK)
      {
        const mapChunk = this.getMapChunk(chkx, chky);
        mapChunk.drawTerrainOverlay(frameBuffer, offx, offy);
      }
    }

    // Draw the chunks' objects diagonally NE.

    // part 1
    const tmp_stop_y = prevChunk(startChunkY);
    for (let chky = startChunkY, offy = (alignedOriginY-originY);
      chky != endChunkY;
      chky = nextChunk(chky), offy += PIXELS_PER_CHUNK)
    {
      for (let chkx = startChunkX, dy = chky, offx = (alignedOriginX-originX), y0 = offy;
        chkx != endChunkX && dy != tmp_stop_y;
        chkx = nextChunk(chkx), dy = prevChunk(dy), offx += PIXELS_PER_CHUNK, y0 -= PIXELS_PER_CHUNK)
      {
        const mapChunk = this.getMapChunk(chkx, dy);
        mapChunk.drawObjects(frameBuffer, offx, y0);
      }
    }

    // part 2
    const bottom_y = (alignedOriginY-originY) + PIXELS_PER_CHUNK * (chunksH+1);
    for (let chkx = nextChunk(startChunkX), offx = (alignedOriginX-originX) + PIXELS_PER_CHUNK;
      chkx != endChunkX;
      chkx = nextChunk(chkx), offx += PIXELS_PER_CHUNK)
    {
      for (let dx = chkx, dy = prevChunk(endChunkY), x0 = offx, y0 = bottom_y;
        dx != endChunkX && dy != tmp_stop_y;
        dx = nextChunk(dx), dy = prevChunk(dy), x0 += PIXELS_PER_CHUNK, y0 -= PIXELS_PER_CHUNK)
      {
        const mapChunk = this.getMapChunk(dx, dy);
        mapChunk.drawObjects(frameBuffer, x0, y0);
      }
    }
  }

  readAreaMap(mapOx, mapOy, viewWidth, viewHeight) {
    // calculate superchunk indices
    const beginSx = Math.floor(mapOx / PIXELS_PER_SUPERCHUNK);
    let endSx = Math.floor((mapOx + viewWidth + PIXELS_PER_CHUNK * 2) / PIXELS_PER_SUPERCHUNK) % SUPERCHUNKS_PER_WORLD;
    endSx = (endSx + 1) % SUPERCHUNKS_PER_WORLD;

    const beginSy = Math.floor(mapOy / PIXELS_PER_SUPERCHUNK);
    let endSy = Math.floor((mapOy + viewHeight + PIXELS_PER_CHUNK * 2) / PIXELS_PER_SUPERCHUNK) % SUPERCHUNKS_PER_WORLD;
    endSy = (endSy + 1) % SUPERCHUNKS_PER_WORLD;

    return this.readMapData(beginSx, beginSy, endSx, endSy);
  }

  readMapData(beginSx, beginSy, endSx, endSy) {
    for (let sy = beginSy; sy !== endSy; sy = (sy + 1) % SUPERCHUNKS_PER_WORLD) {
      for (let sx = beginSx; sx !== endSx; sx = (sx + 1) % SUPERCHUNKS_PER_WORLD) {
        if (!this.isSuperChunkRead(sx, sy)) {
          console.log(`Loading objects for superchunk (${sx}, ${sy})`);
          if (!this.loadSuperChunkObjects(sx, sy)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  loadSuperChunkObjects(sx, sy) {
    if (!this.loadIfixObjects(sx, sy)) return false;
    if (!this.loadIregObjects(sx, sy)) return false;

    this.markSuperChunkRead(sx, sy);
    return true;
  }

  loadIfixObjects(sx, sy) {
    // compute filename (e.g., "static/u7ifix00")
    const index = sx + sy * SUPERCHUNKS_PER_WORLD;
    const hex = index.toString(16).padStart(2, "0");
    const filename = `static/u7ifix${hex}`;

    const file = new FlexFile();
    file.open(this.fileMap.get(filename));

    // 16 x 16 = 256 chunks per superchunk
    console.assert(file.objCount === 256);

    // calculate absolute chunk coordinates
    const absChunkX = sx * CHUNKS_PER_SUPERCHUNK;
    const absChunkY = sy * CHUNKS_PER_SUPERCHUNK;
    let itemsLoaded = 0;

    for (let y = 0, baseIndex = 0; y < CHUNKS_PER_SUPERCHUNK;
      y++, baseIndex += CHUNKS_PER_SUPERCHUNK)
    {
      for (let x = 0; x < CHUNKS_PER_SUPERCHUNK; x++) {
        const chunkIndex = baseIndex + x;

        //debug
        //if (absChunkX + x != 24 || absChunkY + y != 19)
        //  continue;

        const n = this.loadIfixChunkObjects(
          file.objData(chunkIndex),
          absChunkX + x,
          absChunkY + y
        );
        itemsLoaded += n;
      }
    }

    console.log(`${filename} (${itemsLoaded} items loaded)`);
    return true;
  }

  loadIregObjects(sx, sy) {
    // compute filename (e.g., "gamedat/u7ireg00")
    const index = sx + sy * SUPERCHUNKS_PER_WORLD;
    const hex = index.toString(16).padStart(2, "0");
    const filename = `gamedat/u7ireg${hex}`;

    const uint8 = this.fileMap.get(filename);
    const stream = {data:uint8, offset:0};

    // reg_items = 16x16 chk_items (one for each chunk of the region)
    // chk_items = item, item, ..., item, 00 (or just 00 if no item for this chunk)
    const absChunkX = sx * CHUNKS_PER_SUPERCHUNK;
    const absChunkY = sy * CHUNKS_PER_SUPERCHUNK;
    let itemsLoaded = 0;

    for (let y = 0, baseIndex = 0; y < CHUNKS_PER_SUPERCHUNK;
      y++, baseIndex += CHUNKS_PER_SUPERCHUNK)
    {
      for (let x = 0; x < CHUNKS_PER_SUPERCHUNK; x++) {

        const n = this.loadIregChunkObjects(
          stream,
          absChunkX + x,
          absChunkY + y
        );
        itemsLoaded += n;
      }
    }

    console.log(`${filename} (${itemsLoaded} items loaded)`);
    return true;
  }

  loadIfixChunkObjects(chunkData, absChunkX, absChunkY) {
    const ITEM_SIZE = 4; // define as appropriate

    if ((chunkData?.length ?? -1) <= 0) return 0;

    console.assert(chunkData.length % ITEM_SIZE === 0);

    const mapChunk = this.getMapChunk(absChunkX, absChunkY);

    for (let itemOffset = 0; itemOffset < chunkData.length; itemOffset += ITEM_SIZE) {
      const b0 = chunkData[itemOffset];
      const b1 = chunkData[itemOffset+1];
      const ytile = b0 & 0x0f;
      const xtile = (b0 >> 4) & 0x0f;
      const z = b1 & 0x0f;

      const word = chunkData[itemOffset + 2] | chunkData[itemOffset + 3] << 8;
      const shapeId = {
        type:word & 0x03ff,
        frame:(word >> 10) & 0x1f,
        reflected:(word >> 15) & 1
      };

      const obj = new MapObject(absChunkX, absChunkY, xtile, ytile, z, shapeId);
      mapChunk.addObj(obj);
    }

    return Math.floor(chunkData.length / ITEM_SIZE);
  }

  loadIregChunkObjects(stream, absChunkX, absChunkY, container = null) {
    const xchunkInS = absChunkX % CHUNKS_PER_SUPERCHUNK;
    const ychunkInS = absChunkY % CHUNKS_PER_SUPERCHUNK;
    let itemCount = 0;

    //for debug
    //const test = (absChunkX === 24 && absChunkY === 19);

    while (stream.offset + 1 < stream.data.length) {
      const entlen = stream.data[stream.offset++];
      if (entlen === 0) {// end of a chunk
        if (container) throw new Error("Unexpected value 0");
        return itemCount;
      }

      if (entlen === 1) {// end of items in a container
        if (!container) throw new Error("Unpexted value 1");
        return itemCount;
      }

      if (entlen != 6 && entlen != 12 && entlen != 18)
        throw new Error("Invalid entry length!");

      const data = stream.data.subarray(stream.offset, stream.offset + entlen);
      stream.offset += entlen;
      itemCount++;

      const xchunk = (data[0] >> 4) & 0x0f;
      const ychunk = (data[1] >> 4) & 0x0f; 
      const shapeId = new ShapeID(data[2] | data[3] << 8);

      if (!container && (xchunk !== xchunkInS || ychunk !== ychunkInS ))
        throw new Error("Mismatch chunk location!");

      const shapeClass = tfa.getReusableView(shapeId.type).shapeClass;
      if (shapeClass === ShapeClass.spellbook) {
        const obj = new SpellbookObject(data, absChunkX, absChunkY);

        if (container) {
          container.objList.push(obj);
        } else {
          const mapChunk = worldMap.getMapChunk(absChunkX, absChunkY);
          mapChunk.addObj(obj);
        }
      }
      else if (shapeClass === ShapeClass.hatchable) {

      }
      else if (shapeClass === ShapeClass.barge) {

      }
      else if (shapeClass === ShapeClass.virtueStone) {

      }
      else if (shapeClass === ShapeClass.container) {
        const obj = new ContainerObject(data, absChunkX, absChunkY);

        if (container) {
          container.objList.push(obj);
        }
        else {
          const mapChunk = worldMap.getMapChunk(absChunkX, absChunkY);
          mapChunk.addObj(obj);
        }

        if (obj.type > 0) { // (0000 if empty)
          itemCount += this.loadIregChunkObjects(stream,
            !container ? -1 : absChunkX-1, obj.type, obj);
        }
      }
      else {
        if (entlen !== 6)
          throw new Error("the entry length !== 6");

        const obj = new StandardIregObject(data, absChunkX, absChunkY);

        if (container) {
          container.objList.push(obj);
        } else {
          const mapChunk = worldMap.getMapChunk(absChunkX, absChunkY);
          mapChunk.addObj(obj);
        }
      }
    }

    return itemCount;
  }
}