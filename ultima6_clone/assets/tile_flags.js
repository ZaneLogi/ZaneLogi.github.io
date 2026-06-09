// Per-tile flag table, keyed by tile ID (0..2047). Decoded from the U6 `tileflag`
// file. Source loads it as FOUR planes (seg_0903.c:229-232): TerrainType@0,
// TileFlag@0x800, TypeWeight@0x1000 (0x400 bytes), D_B3EF@0x1400. We mirror three
// tile-ID planes — flags1 = TerrainType (@0), flags2 = TileFlag (@0x800), flags3 =
// D_B3EF (@0x1400) — plus the per-object-TYPE TypeWeight plane (@0x1000), which is
// the GET/MOVE "is this gettable?" gate (TypeWeight 0 = fixed scenery).
//
// Accessor names follow the SOURCE macros (u6.h), not the legacy port's labels,
// which misread two of them: the legacy "isTopTile" is really IsTileFor
// (Foreground) and "isForceLowerTile" is really IsTileBr (Breakthrough, an
// AI/movement flag — NOT render). The real render-bottom flag is IsTileBa
// (Background), which the legacy port didn't decode at all.
//
// These are tile-type data (shared across all objects of a tile), so they live
// here in the registry, not on per-entity Renderable components.

const TILE_COUNT = 2048;
const TYPE_COUNT = 1024;        // object types — the TypeWeight plane is 0x400 = 1024 bytes

export class TileFlags {
  constructor(tileflagData) {
    this.flags1 = new Uint8Array(TILE_COUNT);
    this.flags2 = new Uint8Array(TILE_COUNT);
    this.flags3 = new Uint8Array(TILE_COUNT);
    for (let i = 0; i < TILE_COUNT; i++) {
      this.flags1[i] = tileflagData[i];
      this.flags2[i] = tileflagData[0x800 + i];
      this.flags3[i] = tileflagData[0x1400 + i];
    }
    this.typeWeight = new Uint8Array(TYPE_COUNT);   // TypeWeight@0x1000, indexed by object type
    for (let i = 0; i < TYPE_COUNT; i++) this.typeWeight[i] = tileflagData[0x1000 + i];
  }

  isForeground(t)        { return (this.flags2[t] & 0x10) !== 0; }   // IsTileFor    (was "isTopTile")
  isDoubleHeight(t)      { return (this.flags2[t] & 0x40) !== 0; }   // IsTileDoubleV
  isDoubleWidth(t)       { return (this.flags2[t] & 0x80) !== 0; }   // IsTileDoubleH
  isBackground(t)        { return (this.flags3[t] & 0x20) !== 0; }   // IsTileBa  — replaces terrain (render bottom)
  isBreakthrough(t)      { return (this.flags3[t] & 0x04) !== 0; }   // IsTileBr  — AI/movement, NOT render (was "isForceLowerTile")
  isTileIgnore(t)        { return (this.flags3[t] & 0x10) !== 0; }   // IsTileIg  — Breakthrough scan does NOT short-circuit
  isTerrainWet(t)        { return (this.flags1[t] & 0x01) !== 0; }   // IsTerrainWet
  isTerrainImpassable(t) { return (this.flags1[t] & 0x02) !== 0; }   // IsTerrainImpass
  isTerrainWall(t)       { return (this.flags1[t] & 0x04) !== 0; }   // IsTerrainWall    — blocks flight
  isTerrainDamage(t)     { return (this.flags1[t] & 0x08) !== 0; }   // IsTerrainDamage  — hazard tile

  // Movement-cost nibble: source's `TerrainType[tile] >> 4` (the high nibble of the
  // TerrainType plane). Used by SubTerrainMov (move-point spend) and the pathfinder
  // cost map (__ComputeResistance, seg_1E0F.c:1880: resist = (TerrainType>>4) + 1).
  terrainCost(t)         { return this.flags1[t] >> 4; }            // TerrainType[t] >> 4

  // Per-object-TYPE weight (`TypeWeight[type]`, source's GET/MOVE gettable gate;
  // GetWeight at seg_155D.c:165). 0 = fixed scenery/furniture (can't GET/MOVE); 255 =
  // the "too heavy" sentinel (source maps a computed weight of 255 → 10000 → refuse).
  weightOf(objType)      { return this.typeWeight[objType] ?? 0; }
}
