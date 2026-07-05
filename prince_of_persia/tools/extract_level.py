#!/usr/bin/env python3
"""
extract_level.py -- decode one Prince of Persia (DOS) level from LEVELS.DAT into
a JS data module carrying the COLLISION + gameplay data only (no graphics).

Level N is stored as resource 2000+N inside LEVELS.DAT (load_level, seg000.c:1152),
as a verbatim 2305-byte dump of level_type (SDLPoP types.h:228; guaranteed by the
sizeof(level_type)==2305 compile assert). The LEVELS.DAT container is the SAME
format extract_masks.py parses -- only the payload differs: a raw struct, so no
image decode / decompression is needed.

We emit every gameplay field the engine actually reads, and drop the ones it
never does:
  KEEP  fg tile TYPE (byte & 0x1F, seg006.c:37), bg modifier byte,
        roomlinks {left,right,up,down}, used_rooms, start_{room,pos,dir},
        doorlinks (button->gate chain, seg007.c:720-746),
        guards (tile,dir,skill,color) for rooms with a guard (guards_tile < 30).
  DROP  roomxs/roomys (Mechner editor grid), fill_1/2/3 (unused),
        the fg high 3 bits (engine masks &0x1F everywhere incl. drawing,
        seg008.c:246 -- inert), and guards_x / guards_seq_lo / guards_seq_hi
        (0xFF in the file; the engine derives them at spawn, pos_guards seg003.c:661).

Faithful port of the level_type field layout + doorlink bit-packing from SDLPoP
(GPLv3) -- see the project NOTICE.

Usage:  python extract_level.py [level_number] [LEVELS.DAT] [out.js]
        defaults: level 1, C:/Z_Temp/POP/GAME/LEVELS.DAT, ../res/level<N>.js
"""
import sys, os

def u16(b, o): return b[o] | (b[o+1] << 8)
def u32(b, o): return b[o] | (b[o+1] << 8) | (b[o+2] << 16) | (b[o+3] << 24)
def sbyte(v):  return v - 256 if v > 127 else v

TILES_6_CLOSER  = 6    # drop button
TILES_15_OPENER = 15   # raise button

def read_resource(blob, res_id):
    """DAT container parse (same as extract_masks.py / seg009.c:2848): 6-byte
    header {u32 index_off, u16 index_size}; index = u16 count then count x
    {u16 id, u32 offset, u16 size}; resource = 1 checksum byte + data."""
    index_off = u32(blob, 0); count = u16(blob, index_off)
    p = index_off + 2
    for _ in range(count):
        rid = u16(blob, p); off = u32(blob, p+2); size = u16(blob, p+6); p += 8
        if rid == res_id:
            return blob[off+1 : off+1+size]
    raise SystemExit(f"resource {res_id} not found in DAT")

def js_row(vals):
    return "[" + ",".join(str(v) for v in vals) + "]"

def main():
    level = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    dat   = sys.argv[2] if len(sys.argv) > 2 else r"C:\Z_Temp\POP\GAME\LEVELS.DAT"
    out   = sys.argv[3] if len(sys.argv) > 3 else os.path.join(
                os.path.dirname(__file__), "..", "res", f"level{level}.js")
    out = os.path.abspath(out)

    blob = open(dat, "rb").read()
    d = read_resource(blob, 2000 + level)
    if len(d) != 2305:
        raise SystemExit(f"level payload is {len(d)} bytes, expected 2305 "
                         f"(sizeof level_type) -- not a raw level struct?")

    # --- level_type field slices (types.h:228, verified offsets) ---
    fg  = d[0:720]; bg = d[720:1440]
    dl1 = d[1440:1696]; dl2 = d[1696:1952]
    rlk = d[1952:2048]; used = d[2048]
    s_room, s_pos, s_dir = d[2112], d[2113], sbyte(d[2114])
    g_tile  = d[2119:2143]; g_dir   = d[2143:2167]
    g_skill = d[2215:2239]; g_color = d[2263:2287]

    # --- doorlink accessors (seg007.c:720-746) ---
    def dl_tile(i):  return dl1[i] & 0x1F                                # tile 0..29
    def dl_room(i):  return ((dl1[i] & 0x60) >> 5) + ((dl2[i] & 0xE0) >> 3)
    def dl_next(i):  return not (dl1[i] & 0x80)                          # bit7 clear = chain continues
    def dl_timer(i): return dl2[i] & 0x1F

    # doorlinks1/2 are 256 entries, but only indices reachable from a button are
    # ever read: trigger_button + get_tile_to_draw both index by the button tile's
    # bg modifier, walking i, i+1, ... while .next. Everything past the last
    # reachable index is never touched, so we trim there (drops the garbage tail).
    max_idx = -1
    for r in range(used):
        for pos in range(30):
            t = fg[r*30 + pos] & 0x1F
            if t == TILES_6_CLOSER or t == TILES_15_OPENER:
                i = bg[r*30 + pos]; steps = 0
                while i < 256 and steps < 256:
                    max_idx = max(max_idx, i)
                    if not dl_next(i): break
                    i += 1; steps += 1
    door_links = [(dl_room(i), dl_tile(i), dl_timer(i), dl_next(i))
                  for i in range(max_idx + 1)]

    # --- per-room records ---
    rooms = []
    for r in range(1, used+1):
        base = (r-1)*30
        L, R, U, D = rlk[(r-1)*4 : (r-1)*4+4]
        fgrid = [[fg[base + row*10 + c] & 0x1F for c in range(10)] for row in range(3)]
        bgrid = [[bg[base + row*10 + c]        for c in range(10)] for row in range(3)]
        gt = g_tile[r-1]
        guard = None if gt >= 30 else (gt, sbyte(g_dir[r-1]),
                                       g_skill[r-1] & 0x0F, g_color[r-1] & 0x0F)
        rooms.append((L, R, U, D, fgrid, bgrid, guard))

    # --- emit JS module ---
    NAME = f"LEVEL{level}"
    H = [
      f"// GENERATED by tools/extract_level.py from LEVELS.DAT resource {2000+level} (level {level}).",
      "// Prince of Persia collision + gameplay data (NO graphics). (c) Ubisoft; see ../NOTICE.",
      "// Ported field layout from SDLPoP level_type (GPLv3, types.h:228). The engine reads",
      "// fg&0x1F (tile type) + the full bg byte (modifier); the high 3 fg bits are inert.",
      "//",
      "// Shape:",
      "//   start {room,pos,dir}                 kid spawn; dir -1=left, 0=right",
      "//   rooms[roomNumber-1] = {",
      "//     links {left,right,up,down}          neighbor room #, 0 = void (reads as wall)",
      "//     fg [3 rows][10 cols]                tile TYPE 0..30 (legend below)",
      "//     bg [3 rows][10 cols]                modifier byte (gate open-state / potion",
      "//                                         type / button->doorLinks index / loose ...)",
      "//     guard  null | {tile,dir,skill,color}    present when guards_tile < 30",
      "//   }",
      "//   doorLinks[i] {room,tile,timer,next}  a button's bg modifier indexes here; follow",
      "//                                         i, i+1, ... while .next is true (seg007.c:720)",
      "//",
      "// tile-type legend: 0 empty 1 floor 2 spike 3 pillar 4 gate 5 stuck 6 drop-button",
      "//   7 doortop+floor 8/9 bigpillar 10 potion 11 loose 12 doortop 13 mirror 14 debris",
      "//   15 raise-button 16/17 exit-door 18 chomper 19 torch 20 wall 21 skeleton 22 sword",
      "//   23/24 balcony 25-29 lattice 30 torch+debris",
    ]
    lines = H + [
      f"export const {NAME} = {{",
      f"  number: {level},",
      f"  usedRooms: {used},",
      f"  start: {{ room: {s_room}, pos: {s_pos}, dir: {s_dir} }},",
      "  rooms: [",
    ]
    for idx, (L, R, U, D, fgrid, bgrid, guard) in enumerate(rooms):
        g = "null" if guard is None else \
            f"{{ tile: {guard[0]}, dir: {guard[1]}, skill: {guard[2]}, color: {guard[3]} }}"
        lines.append(f"    // room {idx + 1}")   # rooms[idx] is room idx+1 (1-based)
        lines.append(f"    {{ links: {{ left: {L}, right: {R}, up: {U}, down: {D} }}, guard: {g},")
        lines.append(f"      fg: [{js_row(fgrid[0])},{js_row(fgrid[1])},{js_row(fgrid[2])}],")
        lines.append(f"      bg: [{js_row(bgrid[0])},{js_row(bgrid[1])},{js_row(bgrid[2])}] }},")
    lines.append("  ],")
    lines.append("  doorLinks: [")
    for (room, tile, timer, nxt) in door_links:
        lines.append(f"    {{ room: {room}, tile: {tile}, timer: {timer}, next: {'true' if nxt else 'false'} }},")
    lines.append("  ],")
    lines.append("};")
    lines.append("")

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    n_guards = sum(1 for r in rooms if r[6] is not None)
    print(f"level            : {level}  (resource {2000+level})")
    print(f"used_rooms       : {used}")
    print(f"start            : room={s_room} pos={s_pos} dir={s_dir}")
    print(f"guards           : {n_guards}  in rooms {[i+1 for i,r in enumerate(rooms) if r[6]]}")
    print(f"doorLinks        : {len(door_links)}  (reachable range; file holds 256 raw)")
    print(f"wrote            : {out}  ({os.path.getsize(out)} bytes)")

if __name__ == "__main__":
    main()
