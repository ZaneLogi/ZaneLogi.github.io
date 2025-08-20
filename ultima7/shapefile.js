import { FlexFile } from './flexfile.js';

function clip(seg, clipStart, clipEnd)
{
  let skip = 0;

  // clip start
  if ( seg.start < clipStart ) {
    skip = clipStart - seg.start;
    seg.start = clipStart;
  }

  // clip end
  if ( seg.end > clipEnd ) {
    seg.end = clipEnd;
  }

  return skip;
}

function drawPlain(frameBuffer, x, y, shapeFrame) {
  const {p, pitch} = frameBuffer;
  const {width, height} = shapeFrame;
  const uint8 = shapeFrame.uint8;
  const left = x - shapeFrame.hotspotX;
  const top = y - shapeFrame.hotspotY;
  let di = top * pitch + left;
  let si = 0;
  for (let h = height; h > 0; --h) {
    p.set(uint8.subarray(si, si + width), di);
    di += pitch;
    si += width;
  }
}

function drawPlainClip(frameBuffer, x, y, clipRect, shapeFrame) {
  const {p, pitch} = frameBuffer;
  const {width, height} = shapeFrame;
  const uint8 = shapeFrame.uint8;
  const left = x - shapeFrame.hotspotX;
  const top = y - shapeFrame.hotspotY;
  let di = top * pitch + left;
  let si = 0;

  let h = height;
  // clip top
  if ( top < clipRect.top ) {
    const diff = clipRect.top - top;
    h -= diff;
    if ( h <= 0 )
      return; // completely outside
    di += diff * pitch;
    si += diff * width;
  }
  // clip bottom
  if ( top + height > clipRect.bottom ) {
    const diff = top + height - clipRect.bottom;
    h -= diff;
    if ( h <= 0 )
      return; // completely outside
  }
  // clip left
  let w = width;
  if (left < clipRect.left ) {
    const diff = clipRect.left - left;
    w -= diff;
    if ( w <= 0 )
      return; // completely outside
    di += diff;
    si += diff;
  }
  // clip right
  if ( left + width > clipRect.right ) {
    const diff = left + width - clipRect.right;
    w -= diff;
    if ( w <= 0 )
      return; // completely outside
  }

  for (; h > 0; --h) {
    p.set(uint8.subarray(si, si + w), di);
    di += pitch;
    si += shapeFrame.width;
  }
}

function drawPlainReflect(frameBuffer, x, y, shapeFrame) {
  // this is only correct for the square image with the hotspot on the diagonal
  const {p, pitch} = frameBuffer;
  const {width, height} = shapeFrame;
  const uint8 = shapeFrame.uint8;
  const left = x - shapeFrame.hotspotY;
  const top = y - shapeFrame.hotspotX;
  let di = top * pitch + left;
  let si = 0;
  // draw the vertical lines from the horizontal lines of the plain image
  for (let h = height; h > 0; --h, di++) {
    for (let w = width, offset = di; w > 0; --w, offset += pitch) {
      p[offset] = uint8[si++];
    }
  }
}

function drawPlainReflectClip(frameBuffer, x, y, clipRect, shapeFrame) {
  // this is only correct for the square image with the hotspot on the diagonal
  const {p, pitch} = frameBuffer;
  const {width, height} = shapeFrame;
  const uint8 = shapeFrame.uint8;
  let left = x - shapeFrame.hotspotY;
  const top = y - shapeFrame.hotspotX;
  const skipLeft = (clipRect.top > top) ? (clipRect.top - top) : 0;
  const skipRight = (top + width >= clipRect.bottom) ? top + width - clipRect.bottom : 0;

  let di = top * pitch + left;
  let si = 0;
  // draw the vertical lines from the horizontal lines of the plain image
  for (let h = height; h > 0; --h, di++, left++) {
    if (left < clipRect.left) {
      si += width; // skip one line from the horizontal line of the image
    }
    else if (left >= clipRect.right) {
      break; // skip all remained horizontal lines of the image
    }
    else {
      let offset = di;
      let w = width;
      for (let i = 0; i < skipLeft; i++) {
        --w;
        ++si;
        offset += pitch;
      }

      w -= skipRight;
      while (w-- > 0) {
        p[offset] = uint8[si++];
        offset += pitch;
      }

      si += skipRight;
    }
  }
}

function drawRle(frameBuffer, x, y, shapeFrame) {
  const {p, pitch} = frameBuffer;
  const height = shapeFrame.height;
  const uint8 = shapeFrame.uint8;
  const uint8Length = uint8.length;
  let si = 8; // skip 4 shorts (8 bytes)

  while (si + 2 <= uint8Length) {
    const slength = uint8[si] | (uint8[si+1] << 8);
    si += 2;
    if (slength === 0) break; // end of RLE

    const type_of_slice = slength & 1;  // b0    =type of slice (0=standard, 1=compressed)
    let length_in_pixel = slength >> 1; // b1..bF=length in pixel

    if (si + 4 > uint8Length) break;

    let xoff = uint8[si] | (uint8[si + 1] << 8);
    if (xoff & 0x8000) xoff -= 0x10000; // signed
    si += 2;
    let yoff = uint8[si] | (uint8[si + 1] << 8);
    if (yoff & 0x8000) yoff -= 0x10000; // signed
    si += 2;

    // there is an illegal case for the shape 10 @SPRITES.VGA
    if (yoff + shapeFrame.hotspotY > height) {
      throw new Error("Illegal shape: y-offset out of bounds");
    }

    const di = (y + yoff) * pitch + x;

    if (type_of_slice == 0) { // scontent= set of pixel  (if standard slice)
      if (si + length_in_pixel > uint8Length) break;
      p.set(uint8.subarray(si, si + length_in_pixel), di + xoff);
      si += length_in_pixel;
    }
    else { // scontent= set of block  (if compressed slice)
      while (length_in_pixel > 0) {
        if (si >= uint8Length) break;

        const blength = uint8[si++];
        const type_of_block = blength & 1; // b0    =type of block (0=standard, 1=repeated pixel)
        const block_length = blength >> 1; // b1..b7=length in pixel

        if (type_of_block == 0) { // set of pixel  (if standard block)
          if (si + block_length > uint8Length) break;
          p.set(uint8.subarray(si, si + block_length), di + xoff);
          si += block_length;
          xoff += block_length;
        }
        else { // pixel (if repeated pixel block)
          if (si >= uint8Length) break;
          const pixel = uint8[si++];
          p.fill(pixel, di + xoff, di + xoff + block_length);
          xoff += block_length;
        }
        length_in_pixel -= block_length;  
      } // compressed slice
    } // if type_of_slice
  } // while(true)
}

function drawRleClip(frameBuffer, x, y, clipRect, shapeFrame) {
  const {p, pitch} = frameBuffer;
  const height = shapeFrame.height;
  const uint8 = shapeFrame.uint8;
  const uint8Length = uint8.length;
  let si = 8; // skip 4 shorts (8 bytes)

  while (si + 2 <= uint8Length) {
    const slength = uint8[si] | (uint8[si+1] << 8);
    si += 2;
    if (slength === 0) break; // end of RLE

    const type_of_slice = slength & 1;  // b0    =type of slice (0=standard, 1=compressed)
    let length_in_pixel = slength >> 1; // b1..bF=length in pixel

    if (si + 4 > uint8Length) break;

    let xoff = uint8[si] | (uint8[si + 1] << 8);
    if (xoff & 0x8000) xoff -= 0x10000; // signed xoffset
    si += 2;
    let yoff = uint8[si] | (uint8[si + 1] << 8);
    if (yoff & 0x8000) yoff -= 0x10000; // signed yoffset
    si += 2;

    // there is an illegal case for the shape 10 @SPRITES.VGA
    if (yoff + shapeFrame.hotspotY > height) {
      throw new Error("Illegal shape: y-offset out of bounds");
    }

    const curY = y + yoff;
    let startX = x + xoff;
    let endX   = startX + length_in_pixel;
    if (curY >= clipRect.bottom || curY < clipRect.top || endX < clipRect.left || startX >= clipRect.right) {
      // Skip the slice entirely
      if (type_of_slice === 0) { si += length_in_pixel;}
      else { // Skip compressed blocks without decoding
        let remain = length_in_pixel;
        while (remain > 0 && si < uint8Length) {
          const blength = uint8[si++];
          const block_length = blength >> 1;
          si += (blength & 1) ? 1 : block_length;
          remain -= block_length;
        }
      }
      continue;
    }

    const di = (y + yoff) * pitch + x;

    if (type_of_slice == 0) { // scontent= set of pixel  (if standard slice)
      if (si + length_in_pixel > uint8Length) break;
      const seg = {start:startX, end:endX};
      const skip = clip(seg, clipRect.left, clipRect.right);
      const len = seg.end - seg.start;
      if (len > 0) {
        p.set(uint8.subarray(si + skip, si + skip + len), di + (seg.start - x));
      }
      si += length_in_pixel;
    }
    else { // scontent= set of block  (if compressed slice)
      while (length_in_pixel > 0) {
        if (si >= uint8Length) break;

        const blength = uint8[si++];
        const type_of_block = blength & 1; // b0    =type of block (0=standard, 1=repeated pixel)
        const block_length = blength >> 1; // b1..b7=length in pixel

        if (type_of_block == 0) { // set of pixel  (if standard block)
          if (si + block_length > uint8Length) break;
          endX = startX + block_length;
          const seg = {start:startX, end:endX};
          const skip = clip(seg, clipRect.left, clipRect.right);
          const len = seg.end - seg.start;
          if (len > 0 ) {
            p.set(uint8.subarray(si + skip, si + skip + len), di + (seg.start - x));
          }
          si += block_length;
          startX = endX;
        }
        else { // pixel (if repeated pixel block)
          if (si >= uint8Length) break;
          endX = startX + block_length;
          const seg = {start:startX, end:endX};
          clip(seg, clipRect.left, clipRect.right);
          const len = seg.end - seg.start;
          if (len > 0) {
            const pixel = uint8[si];
            const base = di + (seg.start - x);
            p.fill(pixel, base, base + len);
          }
          si++;
          startX = endX;
        }
        length_in_pixel -= block_length;
      } // compressed slice
    } // if type_of_slice
  } // while(true)
}

function drawRleReflect(frameBuffer, x, y, shapeFrame) {
  const {p, pitch} = frameBuffer;
  const height = shapeFrame.height;
  const uint8 = shapeFrame.uint8;
  const uint8Length = uint8.length;
  let si = 8; // skip 4 shorts (8 bytes)

  while (si + 2 <= uint8Length) {
    const slength = uint8[si] | (uint8[si+1] << 8);
    si += 2;
    if (slength === 0) break; // end of RLE

    const type_of_slice = slength & 1;  // b0    =type of slice (0=standard, 1=compressed)
    let length_in_pixel = slength >> 1; // b1..bF=length in pixel

    if (si + 4 > uint8Length) break;

    let xoff = uint8[si] | (uint8[si + 1] << 8);
    if (xoff & 0x8000) xoff -= 0x10000; // signed
    si += 2;
    let yoff = uint8[si] | (uint8[si + 1] << 8);
    if (yoff & 0x8000) yoff -= 0x10000; // signed
    si += 2;

    // there is an illegal case for the shape 10 @SPRITES.VGA
    if (yoff + shapeFrame.hotspotY > height) {
      throw new Error("Illegal shape: y-offset out of bounds");
    }

    if (type_of_slice == 0) { // scontent= set of pixel  (if standard slice)
      if (si + length_in_pixel > uint8Length) break;
      let i = (y + xoff) * pitch + (x + yoff);
      // vertical drawing
      while (length_in_pixel-- > 0) {
        p[i] = uint8[si++];
        i += pitch;
      }
    }
    else { // scontent= set of block  (if compressed slice)
      while (length_in_pixel > 0) {
        if (si >= uint8Length) break;

        const blength = uint8[si++];
        const type_of_block = blength & 1; // b0    =type of block (0=standard, 1=repeated pixel)
        let block_length = blength >> 1; // b1..b7=length in pixel

        length_in_pixel -= block_length;

        if (type_of_block == 0) { // set of pixel  (if standard block)
          if (si + block_length > uint8Length) break;
          let i = (y + xoff) * pitch + (x + yoff);
          xoff += block_length;
          // vertical drawing
          while (block_length-- > 0) {
            p[i] = uint8[si++];
            i += pitch;
          }
        }
        else { // pixel (if repeated pixel block)
          if (si >= uint8Length) break;
          let i = (y + xoff) * pitch + (x + yoff);
          xoff += block_length;
          const pixel = uint8[si++];
          while (block_length-- > 0) {
            p[i] = pixel;
            i += pitch;
          }
        }
      } // compressed slice
    } // if type_of_slice
  } // while(true)
}

function drawRleReflectClip(frameBuffer, x, y, clipRect, shapeFrame) {
  const {p, pitch} = frameBuffer;
  const height = shapeFrame.height;
  const uint8 = shapeFrame.uint8;
  const uint8Length = uint8.length;
  let si = 8; // skip 4 shorts (8 bytes)

  while (si + 2 <= uint8Length) {
    const slength = uint8[si] | (uint8[si+1] << 8);
    si += 2;
    if (slength === 0) break; // end of RLE

    const type_of_slice = slength & 1;  // b0    =type of slice (0=standard, 1=compressed)
    let length_in_pixel = slength >> 1; // b1..bF=length in pixel

    if (si + 4 > uint8Length) break;

    let xoff = uint8[si] | (uint8[si + 1] << 8);
    if (xoff & 0x8000) xoff -= 0x10000; // signed
    si += 2;
    let yoff = uint8[si] | (uint8[si + 1] << 8);
    if (yoff & 0x8000) yoff -= 0x10000; // signed
    si += 2;

    // there is an illegal case for the shape 10 @SPRITES.VGA
    if (yoff + shapeFrame.hotspotY > height) {
      throw new Error("Illegal shape: y-offset out of bounds");
    }

    // reflection, (x,y) is the position of the hot spot, (offx,offy) is the offset from the hot spot
    const curX = x + yoff;
    let startY = y + xoff;
    let endY   = startY + length_in_pixel;
    if (curX >= clipRect.right || curX < clipRect.left || endY < clipRect.top || startY >= clipRect.bottom) {
      // Skip the slice entirely
      if (type_of_slice === 0) { si += length_in_pixel;}
      else { // Skip compressed blocks without decoding
        let remain = length_in_pixel;
        while (remain > 0 && si < uint8Length) {
          const blength = uint8[si++];
          const block_length = blength >> 1;
          si += (blength & 1) ? 1 : block_length;
          remain -= block_length;
        }
      }
      continue;
    }

    if (type_of_slice == 0) { // scontent= set of pixel  (if standard slice)
      if (si + length_in_pixel > uint8Length) break;
      const seg = {start:startY, end:endY};
      const skip = clip(seg, clipRect.top, clipRect.bottom);
			let len = seg.end - seg.start;
      let j = si + skip;
      si += length_in_pixel;
      if (len > 0) {
        let i = seg.start * pitch + (x + yoff);
        // vertical drawing
        while (len-- > 0) {
          p[i] = uint8[j++];
          i += pitch;
        }
      }
    }
    else { // scontent= set of block  (if compressed slice)
      while (length_in_pixel > 0) {
        if (si >= uint8Length) break;

        const blength = uint8[si++];
        const type_of_block = blength & 1; // b0    =type of block (0=standard, 1=repeated pixel)
        let block_length = blength >> 1; // b1..b7=length in pixel

        length_in_pixel -= block_length;

        if (type_of_block == 0) { // set of pixel  (if standard block)
          if (si + block_length > uint8Length) break;

          endY = startY + block_length;
          const seg = {start: startY, end: endY};
          const skip = clip(seg, clipRect.top, clipRect.bottom);
			    let len = seg.end - seg.start;
          let j = si + skip;
          si += block_length;
          if (len > 0) {
            let i = seg.start * pitch + (x + yoff);
            // vertical drawing
            while (len-- > 0) {
              p[i] = uint8[j++];
              i += pitch;
            }
          }
          startY = endY;
        }
        else { // pixel (if repeated pixel block)
          if (si >= uint8Length) break;

          endY = startY + block_length;
          const seg = {start: startY, end: endY};
          clip(seg, clipRect.top, clipRect.bottom);
			    let len = seg.end - seg.start;
          if (len > 0) {
            let i = seg.start * pitch + (x + yoff);
            const pixel = uint8[si];
            // vertical drawing
            while (len-- > 0) {
              p[i] = pixel;
              i += pitch;
            }
          }
          si++;
          startY = endY;
        }
      } // compressed slice
    } // if type_of_slice
  } // while(true)
}

function hasPointPlain() {
  return false;
}

function hasPointPlainReflect() {
  return false;
}

function hasPointRle(anchorX, anchorY, hitX, hitY, shapeFrame) {
  const height = shapeFrame.height;
  const uint8 = shapeFrame.uint8;
  const uint8Length = uint8.length;
  let si = 8; // skip 4 shorts (8 bytes)

  while (si + 2 <= uint8Length) {
    const slength = uint8[si] | (uint8[si+1] << 8);
    si += 2;
    if (slength === 0) break; // end of RLE

    const type_of_slice = slength & 1;  // b0    =type of slice (0=standard, 1=compressed)
    let length_in_pixel = slength >> 1; // b1..bF=length in pixel

    let xoff = uint8[si] | (uint8[si + 1] << 8);
    if (xoff & 0x8000) xoff -= 0x10000; // signed
    si += 2;
    let yoff = uint8[si] | (uint8[si + 1] << 8);
    if (yoff & 0x8000) yoff -= 0x10000; // signed
    si += 2;

    // there is an illegal case for the shape 10 @SPRITES.VGA
    if (yoff + shapeFrame.hotspotY > height) {
      return false;
    }

    const currentY = anchorY + yoff;
    if (currentY === hitY) {
      const currentX = anchorX + xoff;
      if (currentX <= hitX && hitX < currentX + length_in_pixel)
        return true;
    }

    if (currentY > hitY)
      return false;

    if (type_of_slice == 0) { // scontent= set of pixel  (if standard slice)
      si += length_in_pixel;
    }
    else { // scontent= set of block  (if compressed slice)
      while (length_in_pixel > 0) {
        const blength = uint8[si++];
        const type_of_block = blength & 1; // b0    =type of block (0=standard, 1=repeated pixel)
        const block_length = blength >> 1; // b1..b7=length in pixel

        if (type_of_block == 0) { // set of pixel  (if standard block)
          si += block_length;
        }
        else { // pixel (if repeated pixel block)
          si++;
        }
        length_in_pixel -= block_length;  
      } // compressed slice
    } // if type_of_slice
  } // while(true)
}

function hasPointRleReflect(anchorX, anchorY, hitX, hitY, shapeFrame) {
  const height = shapeFrame.height;
  const uint8 = shapeFrame.uint8;
  const uint8Length = uint8.length;
  let si = 8; // skip 4 shorts (8 bytes)

  while (si + 2 <= uint8Length) {
    const slength = uint8[si] | (uint8[si+1] << 8);
    si += 2;
    if (slength === 0) break; // end of RLE

    const type_of_slice = slength & 1;  // b0    =type of slice (0=standard, 1=compressed)
    let length_in_pixel = slength >> 1; // b1..bF=length in pixel

    let xoff = uint8[si] | (uint8[si + 1] << 8);
    if (xoff & 0x8000) xoff -= 0x10000; // signed
    si += 2;
    let yoff = uint8[si] | (uint8[si + 1] << 8);
    if (yoff & 0x8000) yoff -= 0x10000; // signed
    si += 2;

    // there is an illegal case for the shape 10 @SPRITES.VGA
    if (yoff + shapeFrame.hotspotY > height) {
      return false;
    }

    const currentX = anchorX + yoff;
    if (currentX === hitX) {
      const currentY = anchorY + xoff;
      if (currentY <= hitY && hitY < currentY + length_in_pixel)
        return true;
    }

    if (currentX > hitX)
      return false;


    if (type_of_slice == 0) { // scontent= set of pixel  (if standard slice)
      si += length_in_pixel;
    }
    else { // scontent= set of block  (if compressed slice)
      while (length_in_pixel > 0) {
        const blength = uint8[si++];
        const type_of_block = blength & 1; // b0    =type of block (0=standard, 1=repeated pixel)
        let block_length = blength >> 1; // b1..b7=length in pixel

        length_in_pixel -= block_length;

        if (type_of_block == 0) { // set of pixel  (if standard block)
          si += block_length;
        }
        else { // pixel (if repeated pixel block)
          si++;
        }
      } // compressed slice
    } // if type_of_slice
  } // while(true)
}

class ShapeFrame {
  rle;
  uint8;
  hotspotX;
  hotspotY;
  width;
  height;
  drawFrame;
  drawFrameClip;
  drawFrameReflect;
  drawFrameReflectClip;
  hasPoint;
  hasPointReflect;

  constructor(rle, uint8) {
    this.rle = rle;
    this.uint8 = uint8;
    if (rle) {
      const view = new DataView(uint8.buffer, uint8.byteOffset);
      const xRight = view.getInt16(0, true);
      const xLeft  = view.getInt16(2, true);
      const yAbove = view.getInt16(4, true);
      const yBelow = view.getInt16(6, true);

      this.hotspotX = xLeft;
      this.hotspotY = yAbove;
      this.width = xLeft + xRight + 1;
      this.height = yAbove + yBelow + 1;

      this.drawFrame = drawRle;
      this.drawFrameClip = drawRleClip;
      this.drawFrameReflect = drawRleReflect;
      this.drawFrameReflectClip = drawRleReflectClip;
      this.hasPoint = hasPointRle;
      this.hasPointReflect = hasPointRleReflect;
    }
    else {
      this.hotspotX = 7;
      this.hotspotY = 7;
      this.width    = 8;
      this.height   = 8;

      this.drawFrame = drawPlain;
      this.drawFrameClip = drawPlainClip;
      this.drawFrameReflect = drawPlainReflect;
      this.drawFrameReflectClip = drawPlainReflectClip;
      this.hasPoint = hasPointPlain;
      this.hasPointReflect = hasPointPlainReflect;
    }
  }

  draw(frameBuffer, x, y, clipRect, reflected = false) {
    clipRect = clipRect ? clipRect : {top:0, left:0, bottom:frameBuffer.height, right:frameBuffer.width};

    let left, top, width, height;
    if ( !reflected ) {
      left  = x - this.hotspotX;
      top  = y - this.hotspotY;
      width  = this.width;
      height = this.height;
    } else {
      left  = x - this.hotspotY;
      top  = y - this.hotspotX;
      width  = this.height;
      height  = this.width;
    }

    if (left >= clipRect.right || top >= clipRect.bottom ||
      left + width <= clipRect.left || top + height <= clipRect.top)
    {
      return; // completely outside
    }

    if (left < clipRect.left || top < clipRect.top ||
      left + width > clipRect.right || top + height > clipRect.bottom)
    {
      // partially inside
      if (reflected)
        this.drawFrameReflectClip(frameBuffer, x, y, clipRect, this);
      else
        this.drawFrameClip(frameBuffer, x, y, clipRect, this);
    }
    else {
      // completely inside
      if (reflected)
        this.drawFrameReflect(frameBuffer, x, y, this);
      else
        this.drawFrame(frameBuffer, x, y, this);
    }
  }

  hit(anchorX, anchorY, hitX, hitY, reflected) {
    let left, top, width, height;
    if ( !reflected ) {
      left  = anchorX - this.hotspotX;
      top  = anchorY - this.hotspotY;
      width  = this.width;
      height = this.height;
    } else {
      left  = anchorX - this.hotspotY;
      top  = anchorY - this.hotspotX;
      width  = this.height;
      height  = this.width;
    }

    if (hitX < left || hitX >= left + width || hitY < top || hitY >= top + height)
      return false;

    return reflected
      ? this.hasPointReflect(anchorX, anchorY, hitX, hitY, this)
      : this.hasPoint(anchorX, anchorY, hitX, hitY, this);
  }

  toString() {
    return `${this.rle?"RLE":"Plain"} hotspot(${this.hotspotX},${this.hotspotY}) size(${this.width},${this.height})`;
  }
}

class Shape {
  constructor(uint8) {
    const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
    const entrySize = view.getUint32(0, true);
    const hdrLen = view.getUint32(4, true);

    const frames = [];
    if ( entrySize === uint8.length ) {
      // RLE compression
      const frameCount = (hdrLen-4)/4;
      for (let frame = 0; frame < frameCount; frame++ ) {
        const frameOffset = view.getUint32(4 + frame * 4, true);
        const nextOffset = (frame + 1 < frameCount)
          ? view.getUint32(4 + (frame + 1) * 4, true)
          : uint8.length;
        const frameLength = nextOffset - frameOffset;
        const shapeFrame = new ShapeFrame(true,
          new Uint8Array(uint8.buffer, uint8.byteOffset + frameOffset, frameLength));
        frames.push(shapeFrame);
      }
    } else {
      // plain buffer
      const frameCount = Math.floor(uint8.length / 64);
      for (let frame = 0; frame < frameCount; frame++) {
        const frameOffset = frame * 64;
        const shapeFrame = new ShapeFrame(false,
          new Uint8Array(uint8.buffer, uint8.byteOffset + frameOffset, 64));
        frames.push(shapeFrame);
      }
    }
    this.frames = frames;
  }

  toString() {
    return `frame count = ${this.frames.length}`;
  }
}

export class ShapeFile {
  constructor(uint8) {
    if (uint8) {
      this.load(uint8);
    }
  }

  load(uint8) {
    const file = new FlexFile();
    const b = file.open(uint8);
    if (!b) throw new Error("failed to load the shape file!");

    const shapes = [];
    for (const obj of file.objects) {
      const shape = new Shape(obj.data);
      shapes.push(shape);
    }
    this.shapes = shapes;
  }

  collectSize() {
    const a = [];
    for (const shape of this.shapes) {
      for (const frame of shape.frames) {
        a.push([frame.width, frame.height]);
      }
    }
    return a;
  }

  toString() {
    return `shape count = ${this.shapes.length}`;
  }
}