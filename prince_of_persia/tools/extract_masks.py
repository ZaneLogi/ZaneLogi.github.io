#!/usr/bin/env python3
"""
extract_masks.py -- extract a Prince of Persia (DOS) character DAT into 1-bit
silhouette masks in a single JSON file. Works on any of the character sprite
DATs (KID / GUARD / SHADOW / SKEL / FAT / VIZIER) -- they share one format.

Faithful pure-Python port of SDLPoP's DAT + image decoder
(NagyD/SDLPoP, src/seg009.c). SDLPoP is GPLv3, so this port is a GPLv3
derivative work -- see the project NOTICE for attribution. We stop at the
8-bpp palette-index buffer: for a silhouette, palette index 0 = transparent,
anything else = opaque. The palette (PRINCE.DAT / the shpl resource) is
therefore never needed.

Container format (verified vs KID.DAT bytes + seg009.c:2848-2880):
  header:  u32 index_offset, u16 index_size
  index @ index_offset:  u16 res_count, then res_count x { u16 id, u32 offset, u16 size }
  each resource:  file[offset] = 1 checksum byte, then `size` data bytes.

Image resource (image_data_type types.h:444; decode_image seg009.c:840):
  u16 height, u16 width, u16 flags, then packed pixel data.
    depth  = ((flags >> 12) & 7) + 1     # bits per pixel
    cmeth  = (flags >> 8) & 0x0F         # compression method 0..4
    stride = (depth*width + 7) // 8
  compression (decompr_img seg009.c:792):
    0 raw LR | 1 RLE LR | 2 RLE UD | 3 LZG LR | 4 LZG UD

Usage:  python extract_masks.py <CHARACTER.DAT> [out.json]
        out.json defaults to ../gfx/<datname>_masks.json  (KID.DAT -> kid_masks.json)
"""
import sys, os, json, base64

def u16(b, o): return b[o] | (b[o + 1] << 8)
def u32(b, o): return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)

# --- decompressors (ported verbatim from seg009.c) -------------------------

def decompress_rle_lr(src, dest_length):
    # seg009.c:608 -- signed run-length, left-to-right.
    out = bytearray(); si = 0; rem = dest_length
    while rem > 0:
        count = src[si]; si += 1
        if count < 0x80:                 # literal run of count+1 bytes
            for _ in range(count + 1):
                if rem == 0: break
                out.append(src[si]); si += 1; rem -= 1
        else:                            # repeat next byte (256-count) times
            val = src[si]; si += 1
            for _ in range(256 - count):
                if rem == 0: break
                out.append(val); rem -= 1
    return out

def _col_major_put(dest, stride, height):
    # UD variants walk down a column, wrap at height -> column-major fill of
    # a stride*height buffer. Returns a put(val) closure.
    st = {'k': 0}
    def put(val):
        k = st['k']; dest[(k % height) * stride + (k // height)] = val; st['k'] = k + 1
    return put

def decompress_rle_ud(src, dest_length, stride, height):
    # seg009.c:639 -- signed run-length, up-to-down (column-major).
    dest = bytearray(dest_length); put = _col_major_put(dest, stride, height)
    si = 0; rem = dest_length
    while rem > 0:
        count = src[si]; si += 1
        if count < 0x80:
            for _ in range(count + 1):
                if rem == 0: break
                put(src[si]); si += 1; rem -= 1
        else:
            val = src[si]; si += 1
            for _ in range(256 - count):
                if rem == 0: break
                put(val); rem -= 1
    return dest

def decompress_lzg_lr(src, dest_length):
    # seg009.c:685 -- LZ with 1KB ring window, left-to-right.
    window = bytearray(0x400); wpos = 0x400 - 0x42; wend = 0x400
    out = bytearray(); si = 0; rem = dest_length; mask = 0
    while rem > 0:
        mask >>= 1
        if (mask & 0xFF00) == 0:
            mask = src[si] | 0xFF00; si += 1
        if mask & 1:                     # literal
            b = src[si]; si += 1
            window[wpos] = b; out.append(b); wpos += 1
            if wpos >= wend: wpos = 0
            rem -= 1
        else:                            # window copy
            info = (src[si] << 8) | src[si + 1]; si += 2
            csrc = info & 0x3FF; clen = (info >> 10) + 3
            while rem > 0 and clen > 0:
                b = window[csrc]; window[wpos] = b; out.append(b)
                wpos += 1; csrc += 1
                if csrc >= wend: csrc = 0
                if wpos >= wend: wpos = 0
                rem -= 1; clen -= 1
    return out

def decompress_lzg_ud(src, dest_length, stride, height):
    # seg009.c:733 -- LZ ring window, up-to-down (column-major).
    window = bytearray(0x400); wpos = 0x400 - 0x42; wend = 0x400
    dest = bytearray(dest_length); put = _col_major_put(dest, stride, height)
    si = 0; rem = dest_length; mask = 0
    while rem > 0:
        mask >>= 1
        if (mask & 0xFF00) == 0:
            mask = src[si] | 0xFF00; si += 1
        if mask & 1:
            b = src[si]; si += 1
            window[wpos] = b; put(b); wpos += 1
            if wpos >= wend: wpos = 0
            rem -= 1
        else:
            info = (src[si] << 8) | src[si + 1]; si += 2
            csrc = info & 0x3FF; clen = (info >> 10) + 3
            while rem > 0 and clen > 0:
                b = window[csrc]; window[wpos] = b; put(b)
                wpos += 1; csrc += 1
                if csrc >= wend: csrc = 0
                if wpos >= wend: wpos = 0
                rem -= 1; clen -= 1
    return dest

def conv_to_8bpp(packed, width, height, stride, depth):
    # seg009.c:819 -- unpack depth-bpp rows (MSB-first) to one index/byte.
    out = bytearray(width * height); ppb = 8 // depth; mask = (1 << depth) - 1
    for y in range(height):
        in_row = y * stride; out_row = y * width; xp = 0
        for xb in range(stride):
            v = packed[in_row + xb]; shift = 8
            for _ in range(ppb):
                if xp >= width: break
                shift -= depth; out[out_row + xp] = (v >> shift) & mask; xp += 1
    return out

def decode_image(data):
    # data = resource payload (after checksum). -> (w,h,depth,cmeth,idx8bpp) or None
    height = u16(data, 0)
    if height == 0: return None
    width = u16(data, 2); flags = u16(data, 4)
    depth = ((flags >> 12) & 7) + 1; cmeth = (flags >> 8) & 0x0F
    stride = (depth * width + 7) // 8; dest_size = stride * height
    body = data[6:]
    if   cmeth == 0:
        packed = bytearray(body[:dest_size])
        if len(packed) < dest_size: packed.extend(b'\x00' * (dest_size - len(packed)))
    elif cmeth == 1: packed = decompress_rle_lr(body, dest_size)
    elif cmeth == 2: packed = decompress_rle_ud(body, dest_size, stride, height)
    elif cmeth == 3: packed = decompress_lzg_lr(body, dest_size)
    elif cmeth == 4: packed = decompress_lzg_ud(body, dest_size, stride, height)
    else: return None
    return (width, height, depth, cmeth, conv_to_8bpp(packed, width, height, stride, depth))

def pack_mask_1bpp(width, height, idx):
    # 1 = opaque (index != 0), 0 = transparent. row-major, MSB-first, byte-aligned rows.
    rowbytes = (width + 7) // 8; out = bytearray(rowbytes * height)
    for y in range(height):
        base = y * width; obase = y * rowbytes
        for x in range(width):
            if idx[base + x] != 0:
                out[obase + (x >> 3)] |= (0x80 >> (x & 7))
    return out

def main():
    if len(sys.argv) < 2:
        print("usage: python extract_masks.py <CHARACTER.DAT> [out.json]"); return
    dat_path = sys.argv[1]
    if len(sys.argv) > 2:
        out_path = sys.argv[2]
    else:
        base = os.path.splitext(os.path.basename(dat_path))[0].lower()   # KID.DAT -> kid
        out_path = os.path.join(os.path.dirname(__file__), "..", "gfx", f"{base}_masks.json")
    out_path = os.path.abspath(out_path)

    with open(dat_path, "rb") as f: blob = f.read()
    index_off = u32(blob, 0); count = u16(blob, index_off)

    frames, skipped, stats = [], [], {}
    p = index_off + 2
    for _ in range(count):
        rid = u16(blob, p); offset = u32(blob, p + 2); size = u16(blob, p + 6); p += 8
        data = blob[offset + 1: offset + 1 + size]      # skip 1 checksum byte
        try:
            res = decode_image(data)
        except Exception as e:
            skipped.append((rid, size, type(e).__name__)); continue
        if res is None:
            skipped.append((rid, size, "not-image")); continue
        w, h, depth, cmeth, idx = res
        if not (1 <= w <= 512 and 1 <= h <= 512):
            skipped.append((rid, size, f"dims {w}x{h}")); continue
        mask = pack_mask_1bpp(w, h, idx)
        frames.append({"id": rid, "w": w, "h": h,
                       "data": base64.b64encode(bytes(mask)).decode("ascii")})
        stats[(depth, cmeth)] = stats.get((depth, cmeth), 0) + 1

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({"source": os.path.basename(dat_path), "count": len(frames),
                   "frames": frames}, f)

    print(f"source             : {os.path.basename(dat_path)}")
    print(f"resources in index : {count}")
    print(f"frames extracted   : {len(frames)}")
    print(f"skipped            : {len(skipped)} -> {skipped[:10]}")
    print("depth/cmeth (n)    :")
    for k in sorted(stats): print(f"    depth={k[0]} cmeth={k[1]} : {stats[k]}")
    if frames:
        ws = [fr['w'] for fr in frames]; hs = [fr['h'] for fr in frames]
        print(f"dims               : w {min(ws)}..{max(ws)}, h {min(hs)}..{max(hs)}")
        print(f"id range           : {frames[0]['id']}..{frames[-1]['id']}")
    print(f"wrote              : {out_path} ({os.path.getsize(out_path)} bytes)")

if __name__ == "__main__":
    main()
