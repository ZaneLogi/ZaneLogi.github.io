// chr_tiles.js -- the ROM's CHR, decoded once.
//
// A small composition module sitting ABOVE chr_decoder (the general algorithms,
// no project data) and dat_tiles (the generated data, no logic): it wires the two
// and exports the decoded tile sheet as a shared singleton, so the 8K CHR decode
// happens a SINGLE time rather than once per sprite/tile builder that needs it.
// The dependency arrows point down -- decoder <- here -> data -- never sideways.

import { CHR_BASE64 } from './assets/dat_tiles.js';
import { decodeChrBase64, decodeTiles } from './chr_decoder.js';

/**
 * The ROM's whole CHR, decoded to pixel indices: one Uint8Array(64) per tile,
 * row-major, values 0..3. Tiles 0..255 are the sprite pattern table (PPU $0000);
 * 256..511 are the background pattern table (PPU $1000).
 * @type {Uint8Array[]}
 */
export const tiles = decodeTiles(decodeChrBase64(CHR_BASE64));
