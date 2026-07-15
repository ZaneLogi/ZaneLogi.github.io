// palette.js -- the NES 2C02 master palette.
//
// This table is NOT in the ROM and is not ported from it: the game stores 6-bit
// COLOR INDICES (tbl_D555 sprites / tbl_D565 background, e.g. $0F $17 $06 $00),
// and the PPU turns each index into an analog colour. So the index->RGB map is
// hardware, the same way the AY-3-8910's oscillators are hardware in
// block_breaker (which vendors ayumi rather than hand-rolling them). We supply a
// standard 2C02 table and port the code that drives it.
//
// Indices are 6-bit ($00-$3F), laid out as 4 rows of 16.

const HEX = [
  // $00-$0F
  '666666', '002A88', '1412A7', '3B00A4', '5C007E', '6E0040', '6C0600', '561D00',
  '333500', '0B4800', '005200', '004F08', '00404D', '000000', '000000', '000000',
  // $10-$1F
  'ADADAD', '155FD9', '4240FF', '7527FE', 'A01ACC', 'B71E7B', 'B53120', '994E00',
  '6B6D00', '388700', '0C9300', '008F32', '007C8D', '000000', '000000', '000000',
  // $20-$2F
  'FFFEFF', '64B0FF', '9290FF', 'C676FF', 'F36AFF', 'FE6ECC', 'FE8170', 'EA9E22',
  'BCBE00', '88D800', '5CE430', '45E082', '48CDDE', '4F4F4F', '000000', '000000',
  // $30-$3F
  'FFFEFF', 'C0DFFF', 'D3D2FF', 'E8C8FF', 'FBC2FF', 'FEC4EA', 'FECCC5', 'F7D8A5',
  'E4E594', 'CFEF96', 'BDF4AB', 'B3F3CC', 'B5EBF2', 'B8B8B8', '000000', '000000',
];

/** 64 x [r, g, b], indexed by NES colour index $00-$3F. */
export const NES_PALETTE = HEX.map((h) => [
  parseInt(h.slice(0, 2), 16),
  parseInt(h.slice(2, 4), 16),
  parseInt(h.slice(4, 6), 16),
]);

/** NES colour index -> [r, g, b]. Indices are masked to 6 bits, as the PPU does. */
export function nesRgb(index) {
  return NES_PALETTE[index & 0x3F];
}

/** NES colour index -> '#rrggbb', for CSS. */
export function nesHex(index) {
  return '#' + HEX[index & 0x3F];
}
