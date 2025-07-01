"use strict"

const FRUIT = {
    NONE: 0,
    CHERRIES: 1,
    STRAWBERRY: 2,
    PEACH: 3,
    APPLE: 4,
    GRAPES: 5,
    GALAXIAN: 6,
    BELL: 7,
    KEY: 8,
    NUM_FRUITS: 9
};

// fruit tiles, sprite tiles and colors
const fruit_tiles_colors = [
    [ 0, 0, 0 ],   // FRUIT_NONE
    [ TILE_CHERRIES,    SPRITETILE_CHERRIES,    COLOR_CHERRIES ],
    [ TILE_STRAWBERRY,  SPRITETILE_STRAWBERRY,  COLOR_STRAWBERRY ],
    [ TILE_PEACH,       SPRITETILE_PEACH,       COLOR_PEACH ],
    [ TILE_APPLE,       SPRITETILE_APPLE,       COLOR_APPLE ],
    [ TILE_GRAPES,      SPRITETILE_GRAPES,      COLOR_GRAPES ],
    [ TILE_GALAXIAN,    SPRITETILE_GALAXIAN,    COLOR_GALAXIAN ],
    [ TILE_BELL,        SPRITETILE_BELL,        COLOR_BELL ],
    [ TILE_KEY,         SPRITETILE_KEY,         COLOR_KEY ]
];

// the tiles for displaying the bonus-fruit-score, this is a number built from 4 tiles
const fruit_score_tiles = [
    [ 0x40, 0x40, 0x40, 0x40 ], // FRUIT_NONE
    [ 0x40, 0x81, 0x85, 0x40 ], // FRUIT_CHERRIES: 100
    [ 0x40, 0x82, 0x85, 0x40 ], // FRUIT_STRAWBERRY: 300
    [ 0x40, 0x83, 0x85, 0x40 ], // FRUIT_PEACH: 500
    [ 0x40, 0x84, 0x85, 0x40 ], // FRUIT_APPLE: 700
    [ 0x40, 0x86, 0x8D, 0x8E ], // FRUIT_GRAPES: 1000
    [ 0x87, 0x88, 0x8D, 0x8E ], // FRUIT_GALAXIAN: 2000
    [ 0x89, 0x8A, 0x8D, 0x8E ], // FRUIT_BELL: 3000
    [ 0x8B, 0x8C, 0x8D, 0x8E ], // FRUIT_KEY: 5000
];