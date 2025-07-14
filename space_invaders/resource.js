"use strict"

const resource = {};

resource.init = function() {
    const green = [0x00, 0xff, 0x00, 0xff];
    const white = [0xff, 0xff, 0xff, 0xff];
    const black = [0x00, 0x00, 0x00, 0xff];
    this.playerImage = this.loadSprite(sprites_data.player, 16, 8, green);
    this.playerBlowupImages = [
        this.loadSprite(sprites_data.player_blowup1, 16, 8, green),
        this.loadSprite(sprites_data.player_blowup2, 16, 8, green),
    ];

    this.playerShotImage = this.loadSprite(sprites_data.player_shot, 1, 8, white, true);
    this.shotExplodingImage = this.loadSprite(sprites_data.shot_exploding, 8, 8, white, true);
    this.shotExplodingRemoveImage = this.loadSprite(sprites_data.shot_exploding, 8, 8, black, true);

    this.shieldImage = this.loadSprite(sprites_data.shield, 22, 16, green);

    this.alienImages = [
        // big
        [
            this.loadSprite(sprites_data.alien_a0, 16, 8, white),
            this.loadSprite(sprites_data.alien_a1, 16, 8, white)
        ],
        // medium
        [
            this.loadSprite(sprites_data.alien_b0, 16, 8, white),
            this.loadSprite(sprites_data.alien_b1, 16, 8, white)
        ],
        // small
        [
            this.loadSprite(sprites_data.alien_c0, 16, 8, white),
            this.loadSprite(sprites_data.alien_c1, 16, 8, white)
        ],
        // Small alien pushing Y back onto screen
        [
            this.loadSprite(sprites_data.alien_carry0, 16, 8, white),
            this.loadSprite(sprites_data.alien_carry1, 16, 8, white)
        ],
        // Alien sprite type C pulling upside down Y
        [
            this.loadSprite(sprites_data.alien_cya, 16, 8, white),
            this.loadSprite(sprites_data.alien_cyb, 16, 8, white),
        ],
    ];

    this.alienExplodingImage = this.loadSprite(sprites_data.alien_exploding, 16, 8, white);

    this.alienShotImages = [
        [
            this.loadSprite(sprites_data.roll_shot[0], 3, 8, white),
            this.loadSprite(sprites_data.roll_shot[1], 3, 8, white),
            this.loadSprite(sprites_data.roll_shot[2], 3, 8, white),
            this.loadSprite(sprites_data.roll_shot[3], 3, 8, white),
        ],
        [
            this.loadSprite(sprites_data.pluger_shot[0], 3, 8, white),
            this.loadSprite(sprites_data.pluger_shot[1], 3, 8, white),
            this.loadSprite(sprites_data.pluger_shot[2], 3, 8, white),
            this.loadSprite(sprites_data.pluger_shot[3], 3, 8, white),
        ],
        [
            this.loadSprite(sprites_data.squigly_shot[0], 3, 8, white),
            this.loadSprite(sprites_data.squigly_shot[1], 3, 8, white),
            this.loadSprite(sprites_data.squigly_shot[2], 3, 8, white),
            this.loadSprite(sprites_data.squigly_shot[3], 3, 8, white),
        ]
    ];

    this.alienShotExplodingImage = this.loadSprite(sprites_data.alien_shot_explding, 6, 8, white, true);
    this.alienShotExplodingRemoveImage = this.loadSprite(sprites_data.alien_shot_explding, 6, 8, black, true);
    
    this.saucerImages = [
        this.loadSprite(sprites_data.saucer, 24, 8, white),
        this.loadSprite(sprites_data.saucer_exploding, 24, 8, white)
    ];

    this.chrImages = [];
    for (const chData of sprites_data.characters) {
        this.chrImages.push(this.loadSprite(chData, 8, 8, white));
    }
    // insert empty characters
    this.chrImages.splice(0x2A, 0, ...new Array(0x38 - 0x2A).fill(0));
    this.chrImages.splice(0x39, 0, ...new Array(0x3F - 0x39).fill(0));
}

resource.loadSprite = function(spriteData, width, height, color, transparent = false, log = false) {
    const heightBytes = Math.floor((height+7)/8);
    const widthBytes = width;
    console.assert(spriteData.length == heightBytes * widthBytes);
    const pixels = this.bytesTo2DArray(spriteData, heightBytes, widthBytes);
    if (log)
        console.log(pixels);

    const source = this.createOffscreenCanvas(pixels[0].length, pixels.length);
    const source_ctx = source.getContext('2d');
    const imageData = source_ctx.getImageData(0, 0, source.width, source.height);
    const data = imageData.data;

    const blank = [0x00, 0x00, 0x00, (transparent ? 0x00 : 0xff)];

    let offset = 0;
    for (const row of pixels) {
        for (const bit of row) {
            data.set((bit ? color : blank), offset);
            offset += 4;
        }
    }

    source_ctx.putImageData(imageData, 0, 0);
    return source;
}

resource.createOffscreenCanvas = function(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

resource.bytesTo2DArray = function(columnBytes, heightBytes = 1, width = 8) {
    const height = heightBytes * 8;
    const result = [];

    for (let row = 0; row < height; row++) {
        const rowPixels = [];
        const byteIndexInColumn = heightBytes - 1 - Math.floor(row / 8);
        const bitIndexInByte = 7 - (row % 8); // MSB is top

        for (let col = 0; col < width; col++) {
            const byte = columnBytes[col * heightBytes + byteIndexInColumn];
            const bit = (byte >> bitIndexInByte) & 1;
            rowPixels.push(bit);
        }

        result.push(rowPixels);
    }

    return result;
}

