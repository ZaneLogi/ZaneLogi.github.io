"use strict"

const resource = {};

resource.init = function() {
    this.playerImage = this.loadSprite(sprites_data.player, 16, 8);
    this.playerShotImage = this.loadSprite(sprites_data.player_shot, 1, 8);
    this.shotExplodingImage = this.loadSprite(sprites_data.shot_exploding, 8, 8);

    this.shieldImage = this.loadSprite(sprites_data.shield, 22, 16);

    this.alienImages = [
        [
            this.loadSprite(sprites_data.alien_a0, 16, 8),
            this.loadSprite(sprites_data.alien_a1, 16, 8)
        ],
        [
            this.loadSprite(sprites_data.alien_b0, 16, 8),
            this.loadSprite(sprites_data.alien_b1, 16, 8)
        ],
        [
            this.loadSprite(sprites_data.alien_c0, 16, 8),
            this.loadSprite(sprites_data.alien_c1, 16, 8)
        ]
    ];

    this.saucerImages = [
        this.loadSprite(sprites_data.saucer, 24, 8),
        this.loadSprite(sprites_data.saucer_exploding, 24, 8)
    ];

    this.chrImages = [];
    for (const chData of sprites_data.characters) {
        this.chrImages.push(this.loadSprite(chData, 8, 8));
    }
}

resource.loadSprite = function(spriteData, width, height, log = false) {
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

    let offset = 0;
    for (const row of pixels) {
        for (const bit of row) {
            data.set((bit ? [0x00, 0xff, 0x00, 0xff] : [0x00, 0x00, 0x00, 0xff]), offset);
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

