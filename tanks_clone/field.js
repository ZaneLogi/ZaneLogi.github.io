// field.js — Field / battlefield  (the central shared service)
//
// Coordinates: the buffer is a full 32x30 nametable. The 13x13-block play grid is
// drawn at tile origin (2,2) = pixel (16,16); everything around it is the $11 grey
// border. Tank/bullet positions are screen pixels, so pixelToCell = (x>>3, y>>3)
// matches $D706 with no offset.
//
// Absorbs:
//   sub_F000_draw_stage ($F000) + sub_D7CC ($D7CC) + sub_D80B ($D80B)  -> loadStage
//   sub_D706/D709/D713 (pixel -> cell)                                 -> pixelToCell
//   sub_E181_ice_detection ($E181)                    -> iceDetectAndMarkOccupancy
//   sub_E1FA ($E1FA)                                   -> occupancyWriteback
// See docs/research_field.md and docs/research_system_interaction_map.md §5 (S2).

import { Tilemap, TILEMAP_COLS, TILEMAP_ROWS } from './tilemap.js';
import { BLOCK_TILES, BLOCK_ATTRIBUTE } from './assets/dat_chr.js';
import {
  TILE, TILE_DRIVE_OVER_MIN, FIELD_ORIGIN_COL, FIELD_ORIGIN_ROW,
  STAGE_COLS, STAGE_ROWS,
} from './constants.js';

/** @typedef {import('./tank_roster.js').TankRoster} TankRoster */

export class Field {
  constructor() {
    this.tilemap = new Tilemap();   // terrain tile ids (the $0400 buffer)
    // 1 = a tank occupies this cell. The ROM's bit7, pulled out of the tile byte.
    // Same 32-wide indexing as the tilemap, so cell = row * TILEMAP_COLS + col.
    this.occupancy = new Uint8Array(TILEMAP_COLS * TILEMAP_ROWS);
  }

  // sub_F000_draw_stage ($F000) + sub_D7CC ($D7CC) + sub_D80B ($D80B).
  // `blockGrid` is a decoded STAGE_ROWS x STAGE_COLS grid of block codes ($0-$D) —
  // LEVELS[n] or DEMO_STAGE. $D7CC fills the whole buffer with the grey border, then
  // the 169 blocks (which exactly cover the 26x26 play grid) draw over the middle.
  /** @param {number[][]} blockGrid  STAGE_ROWS x STAGE_COLS of block codes ($0-$D). */
  loadStage(blockGrid) {
    const tm = this.tilemap;
    tm.tiles.fill(TILE.BORDER);   // $D7CC — $11 everywhere ("undestructable grey tile")
    tm.palettes.fill(0);          // $D7DF — clear the attribute table
    tm.version++;
    for (let r = 0; r < STAGE_ROWS; r++) {
      for (let c = 0; c < STAGE_COLS; c++) {
        this._drawBlock(blockGrid[r][c],
          FIELD_ORIGIN_COL + c * 2, FIELD_ORIGIN_ROW + r * 2);
      }
    }
  }

  // sub_D80B — one block's 2x2 tiles (tbl_DACB) in its shared palette (tbl_DABB), at
  // tile (col,row). BLOCK_TILES[code] = [TL, TR, BL, BR].
  _drawBlock(code, col, row) {
    const t = BLOCK_TILES[code];
    const pal = BLOCK_ATTRIBUTE[code];
    const tm = this.tilemap;
    tm.setTile(col, row, t[0]);         tm.setPalette(col, row, pal);
    tm.setTile(col + 1, row, t[1]);     tm.setPalette(col + 1, row, pal);
    tm.setTile(col, row + 1, t[2]);     tm.setPalette(col, row + 1, pal);
    tm.setTile(col + 1, row + 1, t[3]); tm.setPalette(col + 1, row + 1, pal);
  }

  // sub_D706/D713 — pixel (x,y) -> the 8x8 cell it lands in. The buffer is 32-wide,
  // so gameplay reads back at cell = row * TILEMAP_COLS + col.
  pixelToCell(x, y) { return { col: x >> 3, row: y >> 3 }; }

  // --- terrain queries (read by tank movement & bullet collision) ---
  terrainAt(col, row) { return this.tilemap.tileAt(col, row); }

  // sub_DCD5 ($DCD5): a tank passes on $00 (BEQ) or tile >= $20 (CMP #$20 / BCC
  // blocks); every solid tile is $01-$1F. One compare classifies terrain because the
  // ids were arranged for it (#3; constants.js TILE_DRIVE_OVER_MIN). Occupancy is a
  // separate grid, so nothing to mask here.
  isPassable(col, row) {
    const t = this.terrainAt(col, row);
    return t === 0 || t >= TILE_DRIVE_OVER_MIN;
  }

  // sub_E181 ($E181) compares the tile under a player to $21.
  isIce(col, row) { return this.terrainAt(col, row) === TILE.ICE; }

  // --- terrain mutation (the terrain edit; the DECISION to make it is bullet logic,
  // $E604, step 4) ---

  // A normal bullet chips ONE 4x4 quadrant of a brick — sub_D743 ($D743).
  chipQuadrant(px, py) { this.tilemap.setQuadrant(px, py, false); }

  // A power bullet clears a whole 8x8 tile — sub_D784 with A=$00 ($E6DE).
  clearTile(col, row) { this.tilemap.setTile(col, row, 0); }

  // --- occupancy (the ROM's bit7 overlay, here its own grid). Pipeline steps 1 & 4.
  //
  // The two-pass shape is faithful and load-bearing (#2): $E181 marks EVERY tank's
  // footprint (step 1) BEFORE any tank moves (step 3), so a moving tank sees the
  // others at their frame-START cells; $E1FA clears them (step 4). Net: occupancy is
  // scratch, alive only across the movement pass. ---

  // sub_E181_ice_detection ($E181) — for every drivable tank: find its cell, set the
  // player ice flag, and mark its footprint. Runs before movement (step 1).
  /** @param {TankRoster} roster */
  iceDetectAndMarkOccupancy(roster) {
    for (const tank of roster.tanks) {
      if (!tank.isDrivable) continue;                 // $E189/$E18D — skip exploding/respawning
      // ice under a PLAYER — the tile at the footprint's base cell (pointer + $21).
      if (tank.isPlayer) {                            // $E1AC CPX #$02 / BCS enemy
        const cell = this.pixelToCell(tank.x - 8, tank.y - 8);   // $E192/$E198 then D706
        tank.onIce = this.isIce(cell.col + 1, cell.row + 1);     // $E1B0-$E1B8 tile==$21
      }
      tank.occupancyCells = this.markTankFootprint(tank.x, tank.y);
    }
  }

  // sub_E1FA ($E1FA) — clear exactly the cells each tank marked in step 1. A tank
  // destroyed during movement is no longer drivable and is SKIPPED here, exactly as
  // the ROM skips it ($E202/$E206) — its marks leak until re-marked, a faithful quirk.
  /** @param {TankRoster} roster */
  occupancyWriteback(roster) {
    for (const tank of roster.tanks) {
      if (!tank.isDrivable || !tank.occupancyCells) continue;    // $E202/$E206
      for (const i of tank.occupancyCells) this.occupancy[i] = 0;   // $E234 clear_bit7
      tank.occupancyCells = null;
    }
  }

  clearOccupancy() { this.occupancy.fill(0); }

  // sub_E1C9-$E1EB — mark a tank's footprint. The base cell (pointer + $21) is always
  // set; the +$20 (left) and +$01 (up) neighbors are added only when the tank is
  // 8-aligned on that axis, so a tank straddling a boundary blocks what it straddles
  // into. Returns the marked linear cells for the writeback. $E1F3 does the OR.
  markTankFootprint(px, py) {
    const cell = this.pixelToCell(px - 8, py - 8);              // $E192/$E198 then D706
    const base = cell.row * TILEMAP_COLS + cell.col;
    const cells = [base + 0x21];                                // $E1C9 — base cell
    if ((px & 7) === 0) cells.push(base + 0x20);                // $E1CC-$E1DA — x aligned
    if ((py & 7) === 0) cells.push(base + 0x01);                // $E1DD-$E1EB — y aligned
    for (const i of cells) this.occupancy[i] = 1;               // $E1F3 set_bit7
    return cells;
  }

  isOccupied(col, row) { return this.occupancy[row * TILEMAP_COLS + col] !== 0; }
}
