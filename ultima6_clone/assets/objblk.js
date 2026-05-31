// OBJBLK decode — one 128x128-tile region's world objects. File layout
// (research_world_data.md "File format"; legacy obj.js record + obj_manager.js:371
// loadSuperchunk): a u16 count, then count x 8-byte records:
//   byte 0     ObjStatus      packed flags; coord-use at bits 0x18
//   bytes 1..3 ObjPos         x(10) y(10) z(4), packed into the same word as status
//   bytes 4..5 ObjShapeType   objNumber(10) + frame(6)
//   byte 6     Amount.quantity
//   byte 7     Amount.quality
// For CONTAINED / INVEN / EQUIP objects the position bytes are reused as an
// association ref (source's GetAssoc = *(unsigned int *)&ObjPos[i], a 16-bit
// reinterpretation of the first two pos bytes); exposed as `assoc` alongside
// x/y/z so the loader can resolve INVEN/EQUIP holders (NPC slot ID 0..0xFF) and
// CONTAINED parents (in-file index up to ~3071, needs the full 16 bits).

export const CoordUse = { LOCXYZ: 0x00, CONTAINED: 0x08, INVEN: 0x10, EQUIP: 0x18 };

export function decodeObjblk(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = dv.getUint16(0, true);
  const records = new Array(count);
  let p = 2;
  for (let i = 0; i < count; i++, p += 8) {
    const lo = dv.getUint32(p, true);        // bytes 0..3: status + packed pos
    const shape = dv.getUint16(p + 4, true); // bytes 4..5: objNumber + frame
    const status = lo & 0xff;
    records[i] = {
      status,
      coordUse: status & 0x18,
      x: (lo >>> 8) & 0x3ff,
      y: (lo >>> 18) & 0x3ff,
      z: (lo >>> 28) & 0xf,
      assoc: (lo >>> 8) & 0xffff,            // 16-bit GetAssoc for non-LOCXYZ records
      objNumber: shape & 0x3ff,
      frame: (shape >>> 10) & 0x3f,
      quantity: dv.getUint8(p + 6),
      quality: dv.getUint8(p + 7),
    };
  }
  return records;
}
