import { LinkedList } from "./linked_list.js";
import { MapObject } from "./map_object.js";
import { shapesVga, terrains, prevChunk, nextChunk, ShapeID, worldMap } from "./globals.js";

// === Ground ===
class Ground {
  constructor(xtile, ytile, shapeId) {
    this.x = xtile * 8 + 7; // hotspot (7,7)
    this.y = ytile * 8 + 7;
    this.frameImage = shapesVga.shapes[shapeId.type].frames[shapeId.frame];
    this.reflected = shapeId.reflected;
  }

  draw(frameBuffer, ox, oy) {
    this.frameImage.draw(frameBuffer, ox + this.x, oy + this.y, null, this.reflected);
  }
}

// === MapChunk ===
export class MapChunk {
  constructor(xchunk, ychunk, terrainId) {
    this.xchunk = xchunk;
    this.ychunk = ychunk;
    this.terrainId = terrainId;
    this.ground = [];
    this.terrainOverlay = [];
    this.objList = new LinkedList();

    const shapeArray = terrains.getChunk(terrainId).shapeArray;
    const shapes = shapesVga.shapes;

    this.fromBelow = 0;
    this.fromRight = 0;
    this.fromBelowRight = 0;

    for (let y = 0; y < 16; y++) {
      const baseIndex = y * 16;
      for (let x = 0; x < 16; x++) {
        const shapeId = new ShapeID(shapeArray.getValue(baseIndex + x));
        const frameImage = shapes[shapeId.type].frames[shapeId.frame];

        if (frameImage.rle) {
          //for debug:
          //if (xchunk !== 26 || ychunk !== 18) continue;
          const obj = new MapObject(xchunk, ychunk, x, y, 0, shapeId);
          this.addObj(obj);
        }
        else {
          this.ground.push(new Ground(x, y, shapeId));
        }
      }
    }
  }

  addObj(obj) {
    if (this.xchunk !== obj.xchunk || this.ychunk !== obj.ychunk) {
      throw new Error(
        `Mismatch chunk coordinares, expected(${this.xchunk}, ${this.ychunk}) !== obtained(${xchunk},${ychunk})`);
    }

    if (obj.z > 0 || obj.spaceInfo.nz > 0) { // not flat
      //for debug:
      //console.log(obj);
      this.addDependencies(obj);

      if (this.fromBelow) // Overlaps from below?
        this.addOutsideDependencies(this.xchunk, nextChunk(this.ychunk), obj);

      if (this.fromRight ) // Overlaps from right?
        this.addOutsideDependencies(nextChunk(this.xchunk), this.ychunk, obj);

      if (this.fromBelowRight)
        this.addOutsideDependencies(nextChunk(this.xchunk), nextChunk(this.ychunk), obj);

      // See if newobj extends outside.
      // ...
      // why we need this?
      // For painting algorithm, we draw chunks' objects diagonally NE.
      // We don't care whether the paiting areas of the objects extrude on top and left chunks or not,
      // the painting algorithm can deal with it. But when a object physically extend to the top or left chunks,
      // we need to deal with it by the relation of dependencies.
      const extLeft =  (obj.xtile - obj.spaceInfo.nx) < 0;
      const extAbove = (obj.ytile - obj.spaceInfo.ny) < 0;

      if (extLeft ) {
        this.addOutsideDependencies(prevChunk(this.xchunk), this.ychunk, obj).fromRight++;
        if (extAbove) {
          this.addOutsideDependencies(prevChunk(this.xchunk), prevChunk(this.ychunk), obj).fromBelowRight++;
        }
      }

      if (extAbove) {
        this.addOutsideDependencies(this.xchunk, prevChunk(this.ychunk), obj).fromBelow++;
      }

      this.objList.pushFront(obj);
    }
    else {
      this.terrainOverlay.push(obj);
    }
  }

  addDependencies(newObj) {
    this.objList.forEach(obj => {
      const newcmp = newObj.compare(obj);
      const cmp = (newcmp === -1) ? 1 : (newcmp === 1) ? 0 : -1;
      if (!cmp) { // Bigger than this object?
        newObj.dependencies.pushBack(obj);
        obj.dependors.pushBack(newObj);
      }
      else if (cmp === 1) { // Smaller than?
        obj.dependencies.pushBack(newObj);
        newObj.dependors.pushBack(obj);
      }
    });
  }

  addOutsideDependencies(xchunk, uchunk, newObj) {
    const mapChunk = worldMap.getMapChunk(xchunk,uchunk);
    mapChunk.addDependencies(newObj);
    return mapChunk;
  }

  removeObj(obj) {
    const b = this.objList.removeValue(obj);
    if (!b)
      return null;

    obj.clearDependencies();

    if (obj.z > 0 || obj.spaceInfo.nz) {
      const extLeft =  (obj.xtile - obj.spaceInfo.nx) < 0;
      const extAbove = (obj.ytile - obj.spaceInfo.ny) < 0;

      if (extLeft ) {
        worldMap.getMapChunk(prevChunk(this.xchunk), this.ychunk).fromRight--;
        if (extAbove) {
          worldMap.getMapChunk(prevChunk(this.xchunk), prevChunk(this.ychunk)).fromBelowRight--;
        }
      }

      if (extAbove) {
        worldMap.getMapChunk(this.xchunk, prevChunk(this.ychunk)).fromBelow--;
      }
    }

    return obj;
  }

  drawBase(frameBuffer, ox, oy) {
    // (ox, oy): the (x, y) coordinates of the map chunk in the screen coordinates
    for (const g of this.ground) {
      g.draw(frameBuffer, ox, oy);
    }
  }

  drawTerrainOverlay(frameBuffer, ox, oy) {
    // (ox, oy): the (x, y) coordinates of the map chunk in the screen coordinates
    for (const t of this.terrainOverlay) {
      t.draw(frameBuffer, ox, oy);
    }
  }

  drawObjects(frameBuffer, ox, oy) {
    // (ox, oy): the (x, y) coordinates of the map chunk in the screen coordinates
    for (const node of this.objList) {
      node.value.draw(frameBuffer, ox, oy, true);
    }
  }

  findObjects(maxZ, ox, oy, hitX, hitY, found) {
    // (ox, oy): the (x, y) coordinates of the map chunk in the screen coordinates
    // (hitX, hitY): the (x, y) in the screen coordinates
    if (this.objList.empty())
      return;

    for (const node of this.objList) {
      const obj = node.value;
      if (obj.z > maxZ)
        continue;

      if (obj.hit(ox, oy, hitX, hitY)) {
        found.push(obj);
      }
    }
  }
}