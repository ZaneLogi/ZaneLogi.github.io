import { shapesVga, tfa, occlude, worldMap, ShapeID } from "./globals.js";
import { LinkedList } from "./linked_list.js";
import { FrameAnimator } from "./animator.js";
import {
  uilevel,
  PIXELS_PER_TILE,
  PIXELS_PER_CHUNK,
  PIXELS_PER_WORLD,
  TILES_PER_CHUNK
} from "./globals.js";

// === MapObject ===
export class MapObject {
  constructor(xchunk, ychunk, xtile, ytile, lift, shapeId) {
    this.xchunk = xchunk;
    this.ychunk = ychunk;
    this.xtile = xtile;
    this.ytile = ytile;
    this.z = lift;
    this.shapeId = shapeId;

    const z = this.z * 4;
    this.xoffset = xtile * PIXELS_PER_TILE + 7 - z;
    this.yoffset = ytile * PIXELS_PER_TILE + 7 - z;

    this.frameImages = shapesVga.shapes[shapeId.type].frames;
    this.frameImage = this.frameImages[shapeId.frame];

    this.dependencies = new LinkedList(); // Objects which must be painted before this can be rendered.
    this.dependors = new LinkedList();    // Objects which must be painted after.

    this.renderSeq = 0;

    this.tileCoord = {
      x: xchunk * TILES_PER_CHUNK + xtile,
      y: ychunk * TILES_PER_CHUNK + ytile,
      z: lift
    };

    const objTFA = tfa.getReusableView(shapeId.type);
    const tx = this.tileCoord.x;
    const ty = this.tileCoord.y;
    const tz = this.tileCoord.z;
    let nx, ny, nz;
    if (!shapeId.reflected) {
      nx = objTFA.shapeXSize;
      ny = objTFA.shapeYSize;
    }
    else {
      nx = objTFA.shapeYSize;
      ny = objTFA.shapeXSize;
    }
    nz = objTFA.shapeHeight;

    const xleft = tx - nx + 1;
    const xright = tx;
    const yfar = ty - ny + 1;
    const ynear = ty;
    const ztop = tz + nz - 1;
    const zbot = tz - (nz === 0 ? 1 : 0); // flat?

    const occluded = occlude.get(shapeId.type);

    // space info in tile unit
    this.spaceInfo = {
      tx, ty, tz, nx, ny, nz,
      xleft, xright, yfar, ynear, ztop, zbot,
      occluded
    };

    const frameImage = this.frameImage;
    const left = tx * PIXELS_PER_TILE + 7 - frameImage.hotspotX;
    const right = left + frameImage.width;
    const top = ty * PIXELS_PER_TILE + 7 - frameImage.hotspotY;
    const bottom = top + frameImage.height;

    // map area in pixel unit
    this.area = {left, right, top, bottom, width:right-left, height:bottom-top};

    // isAnimated?
    if (objTFA.isAnimated) {
      this.animator = new FrameAnimator(this);
    }
  }

  clearDependencies() {
    // Remove this from dependencies' dependors
    this.dependencies.forEach(obj => obj.dependors.removeValue(this));
    this.dependencies.clear();

    // Remove this from dependors' dependencies
    this.dependors.forEach(obj => obj.dependencies.removeValue(this));
    this.dependors.clear();
  }

  updateFrame(frameIndex) {
    this.frameImage = this.frameImages[frameIndex];
  }

  draw(frameBuffer, ox, oy, dependent=false) {
    // (ox, oy): the (x, y) coordinates of the map chunk in the screen coordinates
    const renderSequence = worldMap.currentRenderSequence();
    if (this.renderSeq === renderSequence)
      return;

    this.animator?.requestAnimation(); // add this to timeQueue if available

    this.renderSeq = renderSequence;

    if (dependent) {
      for (const node of this.dependencies) {
        const dep = node.value;
        if (dep.renderSeq != renderSequence) {
          dep.draw(
            frameBuffer,
            ox + PIXELS_PER_CHUNK * (dep.xchunk - this.xchunk),
            oy + PIXELS_PER_CHUNK * (dep.ychunk - this.ychunk),
            true 
          );
        }
      }
    }

    if (this.z > uilevel.highestVisibleLevel)
      return;

    // Finally, paint this one.
    ox += this.xoffset;
    oy += this.yoffset;

    //if ( ShapeInfo().tfas[m_ShapeID.type].has_translucency )
    //{
    //  ShapesVga().ShapeFrame( m_ShapeID.type, m_ShapeID.frame ).DrawTranslucent( ox, oy, pib, prcClip, g_Xforms, 11 );
    //}
    //else
    //{
    //  ASSERT( (m_dwClassType & CT_PLAYER) || !m_ShapeID.reflected );
      // only NPCs need to do reflection?
    //  ShapesVga().Draw( m_ShapeID.type, m_ShapeID.frame, ox, oy, pib, prcClip, m_ShapeID.reflected );
    //}
    this.frameImage.draw(frameBuffer, ox, oy, null, this.shapeId.reflected);
  }

  hit(ox, oy, hitX, hitY) {
    // (ox, oy): the (x, y) coordinates of the map chunk in the screen coordinates
    ox += this.xoffset;
    oy += this.yoffset;
    return this.frameImage.hit(ox, oy, hitX, hitY, this.shapeId.reflected);
  }

  compare(obj) {
    if (!intersectArea(this.area, obj.area))
      return 0;

    const objSI = obj.spaceInfo;
    const thisSI = this.spaceInfo;

    const xcr = compareRange(thisSI.xleft, thisSI.xright, objSI.xleft, objSI.xright);
    const ycr = compareRange(thisSI.yfar,  thisSI.ynear,  objSI.yfar,  objSI.ynear);
    const zcr = compareRange(thisSI.zbot,  thisSI.ztop,   objSI.zbot,  objSI.ztop);

    const objArea = obj.area;
    const thisArea = this.area;

    const w1 = thisArea.width;
    const h1 = thisArea.height;
    const w2 = objArea.width;
    const h2 = objArea.height;

    if (!xcr.cmp && !ycr.cmp && !zcr.cmp)
      // Same space?
      // Paint biggest area sec. (Fixes plaque at Penumbra's.)
      return (w1 < w2  && h1 < h2) ? -1 : 
        (w1 > w2 && h1 > h2) ? 1 : 0;

    if (xcr.overlap & ycr.overlap & zcr.overlap)
      // Complete overlap?
      if (!this.spaceInfo.nz)
        // Flat one is always drawn first.
        return !obj.spaceInfo.nz ? 0 : -1;
      else if (!obj.spaceInfo.nz)
        return 1;

    if (xcr.cmp >= 0 && ycr.cmp >= 0 && zcr.cmp >= 0)
      return 1;    // GTE in all dimensions.

    if (xcr.cmp <= 0 && ycr.cmp <= 0 && zcr.cmp <= 0)
      return -1;    // LTE in all dimensions.

    // Y's overlap.
    if (ycr.overlap) {
      if (xcr.overlap) // X's too?
        return zcr.cmp;
      else if (zcr.overlap)  // Y's and Z's?
        return xcr.cmp;
      // Just Y's overlap.
      else if (!zcr.cmp) // Z's equal?
        return xcr.cmp;
      else // See if X and Z dirs. agree.
        if (xcr.cmp == zcr.cmp)
          return xcr.cmp;
        /* Woohoo!  Seems to work without messing up N. Trinsic gate. */
        // Experiment:  Fixes Trinsic mayor
        //   statue-through-roof.
        else if (this.spaceInfo.ztop/5 < obj.spaceInfo.zbot/5 && obj.occluded)
          return -1;  // A floor above/below.
        else if (obj.spaceInfo.ztop/5 < this.spaceInfo.zbot/5 && this.occluded)
          return 1;
      else
        return 0;
    }
    // X's overlap.
    else if (xcr.overlap) {
      if (zcr.overlap)    // X's and Z's?
        return ycr.cmp;
      else if (!zcr.cmp)    // Z's equal?
        return ycr.cmp;
      else
        return ycr.cmp == zcr.cmp ? ycr.cmp : 0;
    }
    // Neither X nor Y overlap.
    else if (xcr.cmp == -1) { // o1 X before o2 X?
      if (ycr.cmp == -1)    // o1 Y before o2 Y?
        // If Z agrees or overlaps, it's LT.
        return (zcr.overlap || zcr.cmp <= 0) ? -1 : 0;
    }
    // o1 Y after o2 Y?
    else if (ycr.cmp == 1)
      if (zcr.overlap || zcr.cmp >= 0)
        return 1;
      /* So far, this seems to work without causing problems: */
      // Experiment:  Fixes Brit. museum
      //   statue-through-roof.
      else if (this.spaceInfo.ztop/5 < obj.spaceInfo.zbot/5)
        return -1;  // A floor above.
      else
        return 0;
    return 0;
  }
}

function intersectArea(area1, area2) {
  // 在chunk(54,90)的地方，繪圖有問題，
  // 因為某一物件之右緣剛好碰到另一物件的左緣，
  // 裁定為沒有接觸，因此排列順序錯誤了。
  // 現在把area的上緣和左緣各多減去4，以避免這類的問題。
  const a1 = {
    left:   (area1.left-4 + PIXELS_PER_WORLD) % PIXELS_PER_WORLD,
    top:    (area1.top-4  + PIXELS_PER_WORLD) % PIXELS_PER_WORLD,
    right:  (area1.right  + PIXELS_PER_WORLD) % PIXELS_PER_WORLD,
    bottom: (area1.bottom + PIXELS_PER_WORLD) % PIXELS_PER_WORLD};
  const a2 = {
    left:   (area2.left-4 + PIXELS_PER_WORLD) % PIXELS_PER_WORLD,
    top:    (area2.top-4  + PIXELS_PER_WORLD) % PIXELS_PER_WORLD,
    right:  (area2.right  + PIXELS_PER_WORLD) % PIXELS_PER_WORLD,
    bottom: (area2.bottom + PIXELS_PER_WORLD) % PIXELS_PER_WORLD};

  const rc1 = new Array(4);
  let cnt1 = 0;
  if (a1.left > a1.right) {
    if (a1.top > a1.bottom) {
      cnt1 = 4;
      rc1[0] = {left:a1.left, top:a1.top, right:PIXELS_PER_WORLD, bottom:PIXELS_PER_WORLD};
      rc1[1] = {left:0,       top:a1.top, right:a1.right,         bottom:PIXELS_PER_WORLD};
      rc1[2] = {left:a1.left, top:0,      right:PIXELS_PER_WORLD, bottom:a1.bottom};
      rc1[3] = {left:0,       top:0,      right:a1.right,         bottom:a1.bottom};
    }
    else {
      cnt1 = 2;
      rc1[0] = {left:a1.left, top:a1.top, right:PIXELS_PER_WORLD, bottom:a1.bottom};
      rc1[1] = {left:0,       top:a1.top, right:a1.right,         bottom:a1.bottom};
    }
  }
  else {
    if (a1.top > a1.bottom) {
      cnt1 = 2;
      rc1[0] = {left:a1.left, top:a1.top, right:a1.right, bottom:PIXELS_PER_WORLD};
      rc1[1] = {left:a1.left, top:0,      right:a1.right, bottom:a1.bottom};
    }
    else {
      cnt1 = 1;
      rc1[0] = a1;
    }
  }

  const rc2 = new Array(4);
  let cnt2 = 0;
  if (a2.left > a2.right) {
    if (a2.top > a2.bottom) {
      cnt2 = 4;
      rc2[0] = {left:a2.left, top:a2.top, right:PIXELS_PER_WORLD, bottom:PIXELS_PER_WORLD};
      rc2[1] = {left:0,       top:a2.top, right:a2.right,         bottom:PIXELS_PER_WORLD};
      rc2[2] = {left:a2.left, top:0,      right:PIXELS_PER_WORLD, bottom:a2.bottom};
      rc2[3] = {left:0,       top:0,      right:a2.right,         bottom:a2.bottom};
    }
    else {
      cnt1 = 2;
      rc2[0] = {left:a2.left, top:a2.top, right:c_num_pixels, bottom:a2.bottom};
      rc2[1] = {left:0,       top:a2.top, right:a2.right,     bottom:a2.bottom};
    }
  }
  else {
    if (a2.top > a2.bottom) {
      cnt1 = 2;
      rc2[0] = {left:a2.left, top:a2.top, right:a2.right, bottom:c_num_pixels};
      rc2[1] = {left:a2.left, top:0,      right:a2.right, bottom:a2.bottom};
    }
    else {
      cnt2 = 1;
      rc2[0] = a2;
    }
  }

  if (cnt1 !== 1 || cnt2 !== 1) {
    throw new Error("just want to know where cnt1 != 1 || cnt2 != 1")
  }

  for (let c1 = 0; c1 < cnt1; c1++) {
    for (let c2 = 0; c2 < cnt2; c2++) {
      const prc1 = rc1[c1];
      const prc2 = rc2[c2];

      if (prc1.left   >= prc2.right  ||
          prc1.right  <= prc2.left   ||
          prc1.top    >= prc2.bottom ||
          prc1.bottom <= prc2.top )
      {
        // no intersection!
      }
      else {
        return true;
      }
    }
  }

  return false;
}

function compareRange(from1, to1, from2, to2) {
  // cmp: -1 if 1st < 2nd, 1 if 1st > 2nd, 0 if equal.
  // overlap: true if they overlap.
  let overlap, cmp;
  if (to1 < from2) {
    overlap = false;
    cmp = -1;
  }
  else if (to2 < from1) {
    overlap = false;
    cmp = 1;
  }
  else // X's overlap.
  {
    overlap = true;
    if (from1 < from2)
      cmp = -1;
    else if (from1 > from2)
      cmp = 1;
    else if (to1 - from1 < to2 - from2)
      cmp = 1;
    else if (to1 - from1 > to2 - from2)
      cmp = -1;
    else
      cmp = 0;
  }

  return {cmp, overlap};
}

// === IregObject ===
class IregObject extends MapObject {
  constructor(uint8, xchunk, ychunk, z) {
    super(xchunk, ychunk,
      uint8[0] & 0x0f,
      uint8[1] & 0x0f,
      z,
      new ShapeID(uint8[2] | uint8[3] << 8));
    this.data = uint8;
  }
}

export class StandardIregObject extends IregObject {
  constructor(uint8, xchunk, ychunk) {
    super(uint8, xchunk, ychunk, (uint8[4] >> 4) & 0x0f);
  }
}

export class ExtendedIregObject extends IregObject {
  constructor(uint8, xchunk, ychunk) {
    super(uint8, xchunk, ychunk, (uint8[9] >> 4) & 0x0f);
  }
}

export class ContainerObject extends ExtendedIregObject {
  constructor(uint8, xchunk, ychunk) {
    super(uint8, xchunk, ychunk);
    this.objList = [];
  }

  get type() {return this.data[4] | this.data[5] << 8;}
  get region() {return this.data[6];}
  get quality() {return this.data[7];}
  get quantity() {return this.data[8];}
  get regionRef() {return this.data[9] & 0x0f;}
  get resist() {return this.data[10];}
  get flags() {return this.data[11];}
}

export class SpellbookObject extends ExtendedIregObject {
  constructor(uint8, xchunk, ychunk) {
    super(uint8, xchunk, ychunk);
  }

  get circle1() {return this.data[4];}
  get circle2() {return this.data[5];}
  get circle3() {return this.data[6];}
  get circle4() {return this.data[7];}
  get circle5() {return this.data[8];}
  get circle6() {return this.data[10];}
  get circle7() {return this.data[11];}
  get circle8() {return this.data[12];}
  get circle9() {return this.data[13];}
  get flags() {return this.data[14] | this.data[15] << 8 | this.data[16] << 16 | this.data[17] << 24;}
}

export class NpcObject extends MapObject {
  constructor(xchunk, ychunk, xtile, ytile, z, shapeId) {
    super(xchunk, ychunk, xtile, ytile, z, shapeId);
    this.objList = [];
  }
}