# Research: U6 world data — OBJBLK, chunks, in-memory linkage

**Status:** first pass, 2026-05-27. Covers the data layer feeding the
renderer — OBJBLK file format, chunk-cache strategy, in-memory linked
list, MapObjPtr per-cell index, slot-ID space, sort order.

**Cross-checked** against three tertiary sources:
- `../ultima6/doc/u6tech.txt` (Nuvie's file-format spec, dated 2001)
- `../ultima6/doc/investigation.txt` (Zane's pre-decode notes —
  treasure map of function addresses in u6-decompiled)
- `maporg.htm` from Zane's
  [`U6WorldEditor`](https://github.com/ZaneLogi/U6WorldEditor/tree/master/doc)
  doc folder (internet-collected reference, fetched via the GitHub
  API on 2026-05-27; not mirrored to `ultima6/doc/`, only in the
  C++ project's doc folder)
- `../ultima6/u6_chunk_viewer.js` + `../ultima6/tile.js` (legacy JS
  viewers — implicit format validation: they render correctly)

Tech-doc sources are easier to read but can be stale OR confidently
wrong (see the maporg.htm chunks-format disagreement under "Tile
layer" below). **Source (u6-decompiled) wins on disagreement.**

Function citations use Borland-segment naming: `seg_<addr>.c:<func>`.
Function-body line numbers may shift if upstream re-derives — names
are stable.

## World geometry

- **World extent**: 1024 × 1024 tiles. From the `GetCoordX/Y` macros
  in `u6.h:256-257` masking with `0x3ff`, X and Y are 10-bit each.
- **Z (level)**: 4 bits, from `(o).raw[2] >> 4`. Values: `0` =
  overworld, `1..5` = dungeon levels (per `C_1184_30A6` accepting
  `z` in `0..5` and the seg_101C top comment "levels 1~5 are in 4
  16x16x(1.5) parts").
- **Dungeon level dimensions**: per `maporg.htm` (in Zane's
  U6WorldEditor doc folder), each of the 5 dungeon levels is a
  `[0..31, 0..31]` array of chunks → 32 × 32 chunks × 8 tiles per
  chunk = **256 × 256 tiles per dungeon level**. Substantially
  smaller than the 1024 × 1024 overworld. Each level is its own
  `objblk` file (`objblkAI..objblkEI`, per the dungeon filename
  pattern in `seg_1184.c:1518-1519`).
- **Region grid**: world divided into **8 × 8 = 64 regions** of
  128 × 128 tiles each, identified by `MK_MAP_ID(x, y) = (x>>7) +
  ((y>>4) & 0x38)` at `seg_101C.c:20`. ASCII art at `seg_101C.c:56-75`
  enumerates 60 active regions (rows 00-07, 10-17, ..., 60-67, plus
  partial row 70-73 — last row holds only 4 active). The remaining
  4 of 64 region IDs are unused / open ocean / off-map.
- **Working area**: `AreaTiles[40][40]` (u6.h:489) — a 40×40 tile
  window of the world, anchored at `(AreaX, AreaY)` (u6.h:541-542).
  Shifts as the player walks across region boundaries.
- **Visible viewport**: `Tile_11x11[11][11]` (u6.h:554) and
  `Obj_11x11[11][11]` (u6.h:556) — the 11×11 onscreen tiles drawn
  in the left half of the screen. Pulled from the 40×40 working
  area as a window centered on the player.

## Tile layer — chunk cache

The tile layer is the BACKGROUND map (terrain/floor under the
objects). Separate data path from OBJBLK.

### On-disk

- **`chunks`** file: flat array of 8 × 8 tile-class chunks, **64
  bytes per chunk, 1 byte per cell** (`OSI_read(D_05CC, chunkIdx <<
  6, 0x40, ...)` at `seg_101C.c:44`). Each byte is a tile-class
  index 0..255. Resolves via the `tileindx.vga` indirection (see
  below), so chunks address only the first 256 of U6's 2048 total
  tile types — the **terrain/background** subset. Object tiles
  reach the renderer through OBJBLK's `ObjShapeType` field
  (10-bit type + 6-bit frame → resolved via `BaseTile[]`, see
  "Tile resolution" below).

  **Verified against the legacy port**: `../ultima6/u6_chunk_viewer.js`
  reads chunks identically (64 bytes per chunk, each byte → direct
  `tileManager.getTilePixels(byteValue)` call). Both source and
  legacy port agree on the 1-byte-per-cell layout.

  > **Tech-doc disagreement worth flagging**: `maporg.htm` in
  > Zane's `U6WorldEditor/doc` folder (a tech doc collected from
  > the internet years ago) says the chunks file is "an array
  > [0..1023, 0..7, 0..7] of Word" — i.e. **2 bytes per cell, 128
  > bytes per chunk, 1024 chunks total**. This is **wrong** for
  > the shipped game: source's `OSI_read(..., 0x40, ...)` reads 64
  > bytes per chunk into a `unsigned char[8][8]` buffer, and the
  > legacy viewer reads single bytes — two independent
  > confirmations that cells are u8, not u16. Possible
  > explanations: maporg.htm describes a pre-release format, an
  > internal map-editor format, or just got it wrong. Whatever the
  > reason, **source wins**. Recorded here as a precedent: tech
  > docs from the internet era can be confidently wrong on the
  > exact byte layout — always verify against source + a working
  > viewer.
- **`map`** file: per-region chunk-index map; tells you "for each
  position in the world, which chunk-ID is here." Loaded per
  region into `D_B7A4` (u6.h:538).

### In-memory

- **`D_B7C8[16][8][8]`** (u6.h:540) — **16-slot LRU chunk cache**,
  each slot holds 8×8 tile-IDs for one chunk.
- **`D_B7A8[16]`** (u6.h:539) — chunk-IDs currently in each cache
  slot.
- **`D_B784[16]`** (u6.h:537) — LRU "age" per slot; incremented
  every cache-miss, oldest entry gets evicted.
- **`D_05D2[4]`** (`seg_101C.c:15`) — IDs of the 4 currently-loaded
  region chunk-maps (you can be straddling up to 4 of the 8×8
  regions at the working-area edges).
- **`AreaX`, `AreaY`** (u6.h:541) — top-left world-coords of the
  current 40×40 working area.

### Tile resolution (chunks AND OBJBLK both go through `tileindx.vga`)

- **`tileindx.vga`** (LZW-compressed on disk) is a 2048-entry u16
  table mapping any tile-type ID to an offset within the combined
  `alltiles` blob (`maptiles.vga` decompressed + `objtiles.vga`
  appended). Per `../ultima6/tile.js:96-99`:
  ```js
  getTileOffset(index) {
    const lo = this.tileindex[index * 2];
    const hi = this.tileindex[index * 2 + 1];
    return (hi << 8 | lo) * 16;
  }
  ```
- **Chunk path** (terrain): chunks file byte (0..255) →
  `tileindx[byte]` → offset in `alltiles` → tile pixels.
- **OBJBLK path** (objects): `ObjShapeType[i]` (16 bits) splits
  into `GetType(i) = ObjShapeType[i] & 0x3ff` (10-bit type, 0..1023)
  + `GetFrame(i) = ObjShapeType[i] >> 10` (6-bit frame, 0..63). The
  actual tile index for rendering is given by `TILE_FRAME(objNum)`
  macro at `u6.h:285`:
  ```c
  #define TILE_FRAME(objNum) (BaseTile[GetType(objNum)] + GetFrame(objNum))
  ```
  So tile = `BaseTile[type] + frame`. `BaseTile[]` (u6.h:466) is a
  per-type table mapping object-type → base tileindx index.
  Resulting tile index can address the full 0..2047 range.

The terrain and object paths converge at `tileindx.vga` — one shared
indirection table, two distinct entry points (chunks for 0..255,
OBJBLK+BaseTile for 0..2047).

**Animation overlay** (orthogonal): `animdata` file maintains a set
of "live" tile-pointer overrides (see `u6tech.txt` "Multiple
Animation Frames" + `../ultima6/anim_data_manager.js`). The
animation system rewrites the tile pointer at certain `tileindx`
entries to cycle through a sequence of underlying tiles based on
`game_timer & and_mask`. Means: the same tile-type ID can resolve
to different pixels frame-to-frame for animated tiles (water,
fountains, fires, flags). Out of scope for this doc — covered when
the render path is read.

### Cache strategy (`cacheChunk` at `seg_101C.c:22-54`)

1. Probe `D_B7A8[]` for `chunkIdx`. Hit: refresh age + return.
2. Miss: pick the oldest slot (max `D_B784`), evict, read 64 bytes
   from the `chunks` file (`OSI_read(D_05CC, chunkIdx<<6, 0x40,
   D_B7C8[slot])`).
3. Update ages: every slot with a smaller age increments; the new
   slot's age = 0.

LRU is approximated by per-access counters, not a linked list.

## Object layer — OBJBLK files

The OBJECTS layer sits on top of the tile layer. This is where
items, doors, NPCs (via slot-0..0xFF special-casing), furniture,
fields, etc. live.

### On-disk — overworld

Files: `savegame/objblkAA` through `savegame/objblkHH` — up to 64
files, one per 128×128-tile region. Filename pattern from
`seg_1184.c:31-32`:

```c
static char __Sav_file[] = "savegame\\objblkaa";
static char __Tmp_file[] = "savegame\\objblkaa.tmp";
```

The two letter positions (offsets 15 and 16 in the path) get
overwritten with `'A' + (area_id & 7)` and `'A' + (area_id >> 3)`
respectively (`seg_1184.c:1438-1439` for `__Sav_file`). So area
`MK_MAP_ID(x, y) = id` → filename `objblk<id&7+'A'><id>>3+'A'>`.

### On-disk — dungeons

Files: `objblk{A,B,C,D,E}I` — 5 dungeon levels. Filename pattern
from `C_1184_2FB3` at `seg_1184.c:1518-1519`:

```c
__Tmp_file[15] = z - 1 + 'A';   /* dungeon level 1..5 → 'A'..'E' */
__Tmp_file[16] = 'I';            /* fixed second char */
```

### `.tmp` vs primary

`D_065C[64]` (u6.h:404) is the "this region's been dirtied" tracker.
On read at `seg_1184.c:1437-1445`:

```c
if (!D_065C[area_id])
    di = OSI_open(__Sav_file);   /* read from primary objblkXX */
else
    di = OSI_open(__Tmp_file);   /* read from in-flight objblkXX.tmp */
```

So loads from `.tmp` if the area has been modified since the last
sync; otherwise from the primary. The rename/sync logic lives
nearby at `seg_1184.c:1228-1248` (write side).

### File format

From `C_1184_2DEF` (read objblk) at `seg_1184.c:1429-1454`:

```
+0:   u16  num_objects (count, capped at 0xc00 = 3072)
+2:   num_objects × 8 bytes — object records
```

The 8-byte record matches `struct t_9E39.inner[]` in u6.h:307-312:

```c
struct {
    unsigned char _00;  /* ObjStatus  (1 byte) */
    struct coord _01;   /* ObjPos     (3 bytes: 10x + 10y + 4z packed) */
    int _04;            /* ObjShapeType (2 bytes: 10-bit type + 6-bit frame) */
    int _06;            /* Amount      (2 bytes: quan + qual) */
} inner[0xc00];
```

Total per-region object capacity: **3072 (0xc00)**. The savegame
encodes each object in 8 bytes, period — no inventory chain on-disk
(containment is rebuilt via the `GetAssoc()` field at load time, see
"Containment" below).

> **Tech-docs disagreement**: `u6tech.txt` (Nuvie) doesn't describe
> the OBJBLK format directly. `investigation.txt` correctly named
> the relevant functions. The on-disk record layout is verified
> from the read code, not from tech docs.

## In-memory object data

### Slot-ID space

- **`0x00 .. 0xFF`** (256 slots) — NPCs. These hold the named party-
  members + every speakable NPC in the world. Per-NPC extended
  attributes live in their own parallel arrays (`NPCStatus[]`,
  `NPCFlag[]`, `NPCMode[]`, `NPCComMode[]`, `STREN[]`, `DEXTE[]`,
  `INTEL[]`, `MAGIC[]`, `HitPoints[]`, `ExpPoints[]`, `Level[]`,
  `MovePts[]`, `Schedule[]`/`SchedIndex[]`, `Names[]`, `TalkFlags[]`,
  etc. — all declared in u6.h, all size 256 or indexed 0..0xFF).
  Loaded once from the savegame `objlist` file (see `objlist.txt`).
- **`0x100 .. 0xCFF`** (up to 3072 slots) — world objects. Loaded
  per-area from OBJBLK files into the same `ObjStatus[] / ObjPos[]
  / ObjShapeType[] / Amount[]` arrays as NPCs (the arrays are
  oversized to cover both ranges).

### Parallel arrays (all indexed by slot ID)

Per-object (used for NPCs AND world objects):

- `ObjStatus[i]` (1 byte) — packed flags: CoordUse (LOCXYZ /
  CONTAINED / INVEN / EQUIP at bits 0x18) + OWNED + INVISIBLE +
  CHARMED + LOCAL + CURSED|MUTANT|HATCHED (overloaded on 0x40) +
  LIT
- `ObjPos[i]` (3 bytes, type `struct coord`) — packed 10x+10y+4z
- `ObjShapeType[i]` (2 bytes) — 10-bit type + 6-bit frame
- `Amount[i]` (2 bytes) — `(quality << 8) | quantity`
- `OrigShapeType[i]` (2 bytes, NPC-only — for shapeshift recovery)

NPC-only extras (slot IDs 0..0xFF, also covered in
`../ultima6/doc/objlist.txt`):

- `NPCStatus[i]`, `NPCFlag[i]`, `NPCMode[i]`, `NPCComMode[i]`,
  `STREN[i]`, `DEXTE[i]`, `INTEL[i]`, `MAGIC[i]`, `HitPoints[i]`,
  `ExpPoints[i]` (2 bytes), `Level[i]`, `MovePts[i]`, `Schedule[]`
  (600 × 5 bytes, indexed via `SchedIndex[i]`), `Leader[i]`,
  `Names[]` (16 × 13 bytes for party).

### `Link[]` — the global sorted linked list

`Link[i]` (u6.h:550) is the **next-object pointer** for slot `i`.
Allocated at offset $BDDA, size ~3072 entries.

Dual-purpose:
- **Active sorted list**: traverse `for (si = Link[0x100]; si >= 0;
  si = Link[si])` to walk all world objects in sort order. `Link[0x100]`
  is the dummy head; the head's `Link[]` points at the first real
  object.
- **Free list**: inactive (unused) world slots are chained through
  `Link[]` too, with `D_D5DA` (u6.h:551) holding the head of the
  free chain and `D_E6E0` (u6.h:558) holding the free-slot count.
  When a new slot is needed: `si = D_D5DA; D_D5DA = Link[si];
  D_E6E0--;` (see deserialize at `seg_1184.c:1381-1384`).

### Sort order — `C_1184_29C4` comparator

Body at `seg_1184.c:1308-1341`. Comparator semantics:

```
Containers: unwind CONTAINED chains via GetAssoc() to find the
            outermost holding object → compare positions of holders
INVEN/EQUIP (CoordUse bit 0x10):
            unwind one more level via GetAssoc() (the NPC the item
            belongs to)
Mixed LOCXYZ vs non-LOCXYZ:
            inventory/equipped items sort relative to the LOCXYZ
            holder, NOT independently
Primary:    Y ascending  (GetY(assoc_0) - GetY(assoc_1))
Secondary:  X ascending
Tertiary:   Z DESCENDING (note REVERSED operands: GetZ(1) - GetZ(0))
Tie:        comparator returns 0; relative order resolved by the
            merge-sort that consumes it
```

**Tie-break is NOT undefined — it's file order.** For two LOCXYZ
objects at identical (x, y, z) with different slot IDs, the comparator
returns 0 (the `assoc_0 == assoc_1` override at lines 1334-1339 only
fires when the two slots are the same object, which they aren't).
The merge-sort in `__ObjectsDeserialize` resolves the tie:

- `seg_1184.c:1394-1422` walks both chains and uses an inner-while-loop
  to splice **contiguous runs** of new equal-key elements as a single
  block. Within the block, the loop advances `di` through the run
  while `C_1184_29C4(di, Link[di]) <= 0`. For equal-key new
  elements (`compare == 0`, `0 <= 0` is true), `di` keeps advancing
  → the entire equal-key run lands in the chain in **file order**:
  first-in-file at the run's head position, last-in-file at the
  tail.

So if OBJBLK file order at cell (x, y, z) is `[Door (idx 721),
Doorway (idx 722)]`, the resulting Link[] chain at that cell is
`[..., Door, Doorway, ...]` — Door closer to the chain head, Doorway
behind it. This is load-bearing for the cell-pick rule (see
[`research_object_interaction.md`](research_object_interaction.md)
§"Cell-pick (`C_2337_08F1`)"): `FindLoc/NextLoc` walks head-first, so
Door is returned first.

### `MapObjPtr[40][40]` — per-cell head pointer

Rebuilt by `C_1184_2ECC` at `seg_1184.c:1456-1474`:

```c
/* Clear */
for (diff_y = 0; diff_y < AREA_H; diff_y++)
    for (diff_x = 0; diff_x < AREA_W; diff_x++)
        MapObjPtr[diff_y][diff_x] = -1;

/* Walk Link[] forward, set head per cell on first encounter */
for (si = Link[0x100]; si >= 0; si = Link[si]) {
    if (GetCoordUse(si) == LOCXYZ) {
        diff_x = (GetX(si) - AreaX) & 0x3ff;
        diff_y = (GetY(si) - AreaY) & 0x3ff;
        if (diff_x < AREA_W && diff_y < AREA_H
            && MapObjPtr[diff_y][diff_x] == -1)
            MapObjPtr[diff_y][diff_x] = si;
    }
}
```

Key behaviors:

- **Only the FIRST encountered object per cell** gets stored in
  `MapObjPtr[][]`. Subsequent objects in the same cell are still in
  `Link[]` but `MapObjPtr` doesn't point to them.
- Because Link[] is sorted by (Y, X, Z↓), **multiple objects in the
  same (y, x) cell are CONSECUTIVE in Link[]** — to iterate all of
  them at cell (y, x), start at `MapObjPtr[y][x]` and walk forward
  in `Link[]` until `GetX` or `GetY` changes.
- The `0x3ff` mask handles world-wrap; if a coord wraps past the
  area window, the `< AREA_W/H` check filters it.

There are two suspicious `/*__unused__ => bug?*/` comments at lines
1468-1469 — the original code computed `__unused__ = GetZ(si)?0xff:0x3ff`
but then used a hardcoded `0x3ff` mask. The Z-aware variant was apparently
intended but dead. Not relevant to our use case (we control the rebuild).

## Containment

`GetCoordUse(i)` returns bits 0x18 of `ObjStatus[i]`:

- `LOCXYZ = 0` — object is at world position `(GetX, GetY, GetZ)`
- `CONTAINED = 8` — object is inside another object; the "other"
  object is stored in `GetAssoc(i)` (= `*(unsigned int *)&ObjPos[i]`,
  reusing the position bytes as a container slot-ID since the
  coords aren't meaningful for contained objects)
- `INVEN = 0x10` — object is in an NPC's inventory; `GetAssoc(i)` =
  the NPC's slot ID
- `EQUIP = 0x18` — object is equipped on an NPC; `GetAssoc(i)` =
  the NPC's slot ID

**Containment is rebuilt on load**: the OBJBLK file stores
`GetAssoc()` as an **in-file relative index**. The deserialize
loop at `seg_1184.c:1389-1390` translates it to the live slot ID
via `ScratchBuf->_6000[bp_06]` (the in-file-index → live-slot-ID
translation table built during the same loop).

## Read/install pipeline

`C_1184_2DEF(area_id)` (`seg_1184.c:1429`):

1. Resolve filename (Sav vs Tmp via `D_065C[]`).
2. Read 2 bytes (u16) count → `bp_02`. Cap at `0xc00`.
3. Read `count × 8` bytes into `ScratchBuf` (the temp buffer the
   8-byte records get stored in raw).
4. Call `__ObjectsDeserialize(count)`.

`__ObjectsDeserialize(num_obj)` (`seg_1184.c:1370-1426`):

1. For each in-file object, pop a free slot from the `D_D5DA`
   chain, copy ObjStatus/ObjPos/ObjShapeType/Amount into the live
   arrays at that slot, and record the slot ID in
   `ScratchBuf->_6000[in_file_idx]` (the translation table).
2. Fix up `GetAssoc()` for CONTAINED objects: replace the in-file
   container-index with the live slot ID via `_6000[]`.
3. Merge-sort the new objects into the existing `Link[]` list
   using `C_1184_29C4` as the comparator. The merge walks both
   lists starting from `Link[0x100]` and `ScratchBuf->_6000[0]`,
   splicing in. **Equal-key new elements stay in file order
   within the merged chain** (see "Sort order" above for the
   inner-while-loop mechanism that preserves run order).

After deserialize, `C_1184_2ECC()` is called separately to rebuild
`MapObjPtr[][]` from the now-sorted `Link[]`.

## Runtime mutation — `AddMapObj` and `MoveObj`

Two routines splice into `Link[]` outside of bulk load. Both insert
the affected slot at the **chain head** of the destination cell.

### `AddMapObj` (`seg_1184.c:642`)

Brand-new world object placed at `(x, y, z)`:

```c
bp_04 = C_1184_02FA(x, y, 1);   // find chain anchor for the cell
D_D5DA = Link[D_D5DA]; D_E6E0 --;
ObjStatus[objNum] = status | LOCAL;
SetXYZ(objNum, x, y, z);
ObjShapeType[objNum] = shapeType;
Amount[objNum] = amount;
Link[objNum] = Link[bp_04];     // <-- new.next = anchor.next
Link[bp_04] = objNum;           // <-- anchor.next = new (splice in front)
// MapObjPtr[y][x] = objNum     // anchor updated to point at the new head
```

### `MoveObj` (`seg_1184.c:927`)

Existing object relocated from `(GetX(objNum), GetY(objNum))` to
`(to_x, to_y, to_z)`:

```c
bp_0a = C_1184_1D60(objNum);
Link[bp_0c] = Link[bp_0a];                     // unlink from old cell
... (handle dirty flags) ...
bp_0e = C_1184_02FA(to_x, to_y, 1);            // find chain anchor for new cell
Link[bp_0a] = Link[bp_0e];                     // moved.next = anchor.next
Link[bp_0e] = objNum;                          // anchor.next = moved
SetXYZ(objNum, to_x, to_y, to_z);
// MapObjPtr[y][x] = objNum
```

Both `AddMapObj` and `MoveObj` make the arriving object the chain's
new head at the destination, so the next `FindLoc(x, y)` returns it
first. This is the U6 design intent: **the most-recently-placed
entity at a cell sits at the chain head and gets picked first by
LOOK/USE.** The renderer uses the inverse: head-first walking + a
"insert NEW at HEAD" pass during composition makes the same chain-head
entity end up *drawn last = visually on top* — both behaviours fall
out of the same head-insertion rule (see `research_map_render.md`
§"Painter's algorithm — within-tier order").

`AddMonster` (`seg_1184.c:689`), `AddInvObj` (`:668`), `InsertObj`
(`:998`), and the various combat-spawn paths all use the same
head-splice pattern at their respective destination chains.

## Clone correspondence — `SpatialIndex` API

`resources/spatial_index.js` maps source's chain ops to our sparse
`Map<packedXY → entity[]>`:

| Source op | Clone API | spatial.at semantics |
|---|---|---|
| `__ObjectsDeserialize` batch merge | `insert(x, y, h)` (`push`) | initial-load: spatial.at[0] = first-loaded = chain head (file order preserved by `loadRegion`'s forward iteration) |
| `AddMapObj` / `MoveObj` / `InsertObj` | `insertAtHead(x, y, h)` (`unshift`) | runtime: spatial.at[0] = newest arrival = chain head |
| `C_1184_1665` / unlink | `remove(x, y, h)` | drops handle from its current cell; drops the cell entry when empty |

The convention is enforced by API naming — `insert` is for batch
load only; runtime mutation systems (NPC schedule snap at
`systems/npc_schedule_system.js`, future avatar step in I-8,
DROP/GET/throw/teleport in I-9+) must use `insertAtHead`. Calling
plain `insert` at runtime would silently pile the new arrival at the
tail of spatial.at, and the inspector (forward-iter) would pick the
wrong target.

## Write/serialize pipeline

`C_1184_2722(num_obj, area_id)` (`seg_1184.c:1222`+) writes a count
+ N×8-byte records to `objblkXX.tmp`. See line 1228+:
`di = OSI_create(__Tmp_file)`. The wrapper at line 1262
`C_1184_2888(area_id)` triggers writes "if out of the area" (when
the working area shifts off this region, the dirty objects need
to flush to disk). Promotion from `.tmp` → primary happens via
`OSI_delete` + `OSI_rename` at lines 1242-1244 — typical
"write-tmp-then-rename" atomicity pattern, common in save-game
code.

For dungeon levels, `C_1184_2FB3(z)` (`seg_1184.c:1477-1521`)
filters Link[] for `GetZ() == z` and serializes only those,
unlinking them from `Link[]` as it goes (this is "leave a dungeon
level" — the objects must persist somewhere while you're elsewhere,
and they get pulled back on re-entry via `C_1184_30A6`).

## Pillar-bug audit — resolved

Each OBJBLK record stores **one object at one (x, y, z) position**;
pillars are NOT stored as two objects (head + base). The double-cell
appearance is driven by `TileFlag[tile]` bit 0x40 = `IsTileDoubleV`
(or 0x80 = `IsTileDoubleH` for 2-wide). The renderer + cell-pick
walk a SE-anchored 2×2 footprint expansion at query time (source's
`NextLoc` recognises extensions at `(x+1, y)` / `(x, y+1)` / `(x+1,
y+1)` via the double-tile flag; clone's `forEachOccupiedCell` and
the 4-anchor gather in `WorldRenderSystem`/inspector do the same).

The within-cell stacking order is fully decoded:

- **Cross-zone** order (background → normal → fgHot → fgExt) follows
  each tile's own `IsTileBa` / `IsTileFor` flags, matching source's
  `ShowObject` chain-position routing. See
  [`research_map_render.md`](research_map_render.md) §"Painter's
  algorithm".
- **Within-zone** order for same-key objects: source's
  `__ObjectsDeserialize` merge preserves file order (see "Sort
  order" above); source's `ShowObject` then inserts non-FG tiles at
  the per-cell render-list HEAD, so first-inserted ends up
  drawn-last = on top. The clone reproduces this by iterating
  `spatial.at` in REVERSE during the gather phase. See
  `research_map_render.md` §"Painter's algorithm — within-tier".

CURSED / MUTANT / HATCHED overload on 0x40 is intentional per
u6.h:80-82 — disambiguation requires per-object-type dispatch at call
sites. Already covered in
[`research_engine_overview.md`](research_engine_overview.md).

## Open targets

These are the genuinely-unanswered items, in priority order:

1. **`LoadNewRegions`** (`seg_1184.c:1550`) — triggers + inputs;
   matters for the streaming-load systems but not for the
   demand-load + keep-loaded-for-session model the clone uses
   ([`../CLAUDE.md`](../CLAUDE.md) §"no region unloading in scope").
2. **`C_1184_3B1D`** (`seg_1184.c:1849`) — major init called from
   main(); allocates the world arrays. Body unread.
3. **Animation overlay timing** — when `animdata` rewrites
   `tileindx` pointers, does it run per-frame at fixed rate, or
   gated by game-loop input? Covered in
   [`research_animation.md`](research_animation.md) and the clone
   already has `TileAnimationSystem` driving it on the render tick.
