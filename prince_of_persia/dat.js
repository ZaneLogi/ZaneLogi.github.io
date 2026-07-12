// dat.js — Prince of Persia DAT container reader (browser side).
//
// Faithful port of the container parse in SDLPoP seg009.c (the same logic
// tools/extract_level.py's read_resource and extract_masks.py use in Python).
// A DAT's first u32 is the index offset; the index is a u16 count followed by
// count × {u16 id, u32 offset, u16 size}; each resource is a single checksum
// byte followed by its data. This reads the CONTAINER only (no image decode) —
// all LEVELS.DAT needs, since its payloads are raw level_type structs.
//
// Input `blob` is a Uint8Array (e.g. new Uint8Array(await file.arrayBuffer())).

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// Every resource in the container's index: {id, offset, size}. The payload begins
// at offset+1 (past the 1-byte checksum) and runs `size` bytes.
export function listResources(blob) {
  const indexOff = u32(blob, 0), count = u16(blob, indexOff);
  const out = [];
  let p = indexOff + 2;
  for (let i = 0; i < count; i++) {
    out.push({ id: u16(blob, p), offset: u32(blob, p + 2), size: u16(blob, p + 6) });
    p += 8;
  }
  return out;
}

// The payload bytes (a Uint8Array view of `blob`) for resource `id`, or null if absent.
export function readResource(blob, id) {
  for (const r of listResources(blob))
    if (r.id === id) return blob.subarray(r.offset + 1, r.offset + 1 + r.size);
  return null;
}
