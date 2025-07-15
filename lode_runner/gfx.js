"use strict"

const gfx = {
    TILE_WIDTH: 10,
    TILE_HEIGHT: 11,
};

gfx.init = function() {
    this.canvas = document.querySelector('canvas');
    this.canvas_ctx = this.canvas.getContext('2d');
    this.canvas_width = this.canvas.width;
    this.canvas_height = this.canvas.height;

    this.sprites = [];
    for (let i = 0; i < 104; i++ ) {
        const spr = this.loadSprite(sprites_data[i], i); 
        this.sprites.push(spr);
    }
}

gfx.clearScreen = function() {
    this.canvas_ctx.fillStyle = "#000000";
    this.canvas_ctx.fillRect(0, 0, this.canvas_width, this.canvas_height);
}

gfx.createOffscreenCanvas = function(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

gfx.loadSprite = function(data, tag) {
    const pixels = decodeApple2HiresSprite(data);

    const imageWidth = 14;
    const imageHeight = 11;

    // patch
    if ([1, 2, 31, 32, 33, 34, 100].includes(tag)) {
        for (let h = 0; h < imageHeight; h++) {
            const row = pixels[h];
            row[9] = row[8];
        }
    }

    const image = this.createOffscreenCanvas(imageWidth, imageHeight);
    const imageCtx = image.getContext('2d');
    const imageData = imageCtx.createImageData(imageWidth, imageHeight);
    const pixelData = imageData.data;

    const bytesPerPixel = 4;
    const bytesPerLine = imageWidth * bytesPerPixel;

    const colorMap = [
        [0x00, 0x00, 0x00, 0x00], // black
        [0xff, 0x50, 0x00, 0xff], // orange
        [0x00, 0xaf, 0xff, 0xff], // blue
        [0xff, 0xff, 0xff, 0xff]  // white
    ];

    let offset = 0;
    for (let h = 0; h < imageHeight; h++) {
        const row = pixels[h];
        for (let w = 0, xoff = offset; w < imageWidth; w++, xoff += 4) {
            pixelData.set(colorMap[row[w]], xoff);
        }
        offset += bytesPerLine;
    }

    imageCtx.putImageData(imageData, 0, 0);
    return image;
}

gfx.drawSprite = function(index, x, y) {
    this.canvas_ctx.drawImage(this.sprites[index], x, y);
}

gfx.drawGround = function() {
    const y = this.TILE_HEIGHT * Stage.STAGE_HEIGHT - 5;
    let x = 0;
    for (let i = Stage.STAGE_XMIN; i <= Stage.STAGE_XMAX; i++, x += this.TILE_WIDTH) {
        this.drawSprite(100, x, y);
    }
}

gfx.drawStage = function(stage) {
    // draw the level tiles
    for (let y = 0, sy = 0; y < Stage.STAGE_HEIGHT; y++, sy += 11) {
        for (let x = 0, sx = 0; x < Stage.STAGE_WIDTH; x++, sx += 10) {
            const tileIndex = stage.getTileAppearance(x, y);
            gfx.drawSprite(tileIndex, sx, sy);
        }
    }

    gfx.drawHero(stage.hero);
    gfx.drawHeroDigging(stage.hero);

    this.drawHoles(stage.holes);
    this.drawGuards(stage.guards);
    this.drawGround();

    // draw information
    /*drawText("SCORE", 0, SCREEN_INFO_Y);
    drawText("00000", 5 * ResourceManager::CHAR_WIDTH, SCREEN_INFO_Y);
    drawText("MEN", 12 * ResourceManager::CHAR_WIDTH, SCREEN_INFO_Y);
    drawText("005", 15 * ResourceManager::CHAR_WIDTH, SCREEN_INFO_Y);
    drawText("LEVEL", 20 * ResourceManager::CHAR_WIDTH, SCREEN_INFO_Y);
    drawText(formatMessage("%03d", m_currentLevel+1),
        25 *ResourceManager::CHAR_WIDTH, SCREEN_INFO_Y);*/
}

gfx.getTileScreenAt = function(xTile, yTile) {
    if (this.tile_xoffsets == undefined) {
        this.tile_xoffsets = Array.from({length: 28}, (_, index) => index * this.TILE_WIDTH);
        this.tile_yoffsets = Array.from({length: 16}, (_, index) => index * this.TILE_HEIGHT);
    }
    return {x:this.tile_xoffsets[xTile], y:this.tile_yoffsets[yTile]};
}

gfx.getActorScreenAt = function(actor) {
    if (this.actor_xoffsets == undefined) {
        this.actor_xoffsets = Array.from({length: 6}, (_, index) => Math.floor((index-2) * this.TILE_WIDTH / 6));
        this.actor_yoffsets = Array.from({length: 5}, (_, index) => Math.floor((index-2) * this.TILE_HEIGHT / 5));
    }

    const pt = this.getTileScreenAt(actor.xTile, actor.yTile);

    return {
        x: pt.x + this.actor_xoffsets[actor.xAdjust + 2],
        y: pt.y + this.actor_yoffsets[actor.yAdjust + 2]
    };
}

gfx.getHeroAppearance = function(hero, bar) {
    let tile;
    const move = hero.currentMove != Actor.MOVE.NONE
        ? hero.currentMove
        : (hero.lookLeft ? Actor.MOVE.RUN_LEFT : Actor.MOVE.RUN_RIGHT);

    switch (move) {
    case Actor.MOVE.RUN_LEFT:
        if (!bar)
            tile = [11, 12, 13][(6 - hero.xAdjust) % 3];
        else
            tile = [24, 25, 26][(6 - hero.xAdjust) % 3];
        break;
    case Actor.MOVE.RUN_RIGHT:
        if (!bar)
            tile = [9, 16, 17][(hero.xAdjust + 6) % 3];
        else
            tile = [21, 22, 23][(hero.xAdjust + 6) % 3];
        break;
    case Actor.MOVE.FALL_DOWN:
        tile = hero.lookLeft ? 19 : 20;
        break;
    case Actor.MOVE.CLIMB_UP:
    case Actor.MOVE.CLIMB_DOWN:
        tile = [14, 18][(hero.yTile * 5 + hero.yAdjust) % 2];
        break;
    case Actor.MOVE.DIG_LEFT:
        tile = 15;
        break;
    case Actor.MOVE.DIG_RIGHT:
        tile = 37;
        break;
    default:
        console.assert(false, "Hero Move is invalid, %o", hero);
        break;
    }

    return tile;
}

gfx.drawHero = function(hero) {
    const pt = this.getActorScreenAt(hero);
    const tileBehavior = hero.stage.getTileBehavior(hero.xTile, hero.yTile);
    const tile = this.getHeroAppearance(hero, tileBehavior == Stage.TILE.BAR);
    this.drawSprite(tile, pt.x, pt.y);
}

gfx.getGuardAppearance = function(guard, bar) {
    let tile;
    const move = guard.currentMove != Actor.MOVE.NONE
        ? guard.currentMove
        : (guard.lookLeft ? Actor.MOVE.RUN_LEFT : Actor.MOVE.RUN_RIGHT);

    switch (move) {
    case Actor.MOVE.RUN_LEFT:
        if (!bar)
            tile = [8, 43, 44][(6 - guard.xAdjust) % 3];
        else
            tile = [48, 49, 50][(6 - guard.xAdjust) % 3];
        break;
    case Actor.MOVE.RUN_RIGHT:
        if (!bar)
            tile = [40, 41, 42][(guard.xAdjust + 6) % 3];
        else
            tile = [45, 46, 47][(guard.xAdjust + 6) % 3];
        break;
    case Actor.MOVE.IN_HOLE:
    case Actor.MOVE.FALL_DOWN:
        tile = guard.lookLeft ? 54 : 53;
        break;
    case Actor.MOVE.CLIMB_UP:
    case Actor.MOVE.CLIMB_DOWN:
        tile = [51, 52][(guard.yTile * 5 + guard.yAdjust) % 2];
        break;
    case Actor.MOVE.RESPAWN:
        tile = 57;
        break;
    case Actor.MOVE.SHAKE_LEFT:
    case Actor.MOVE.SHAKE_RIGHT:
        tile = guard.lookLeft ? 54: 53;
        break;
    case Actor.MOVE.BIRTH1:
        tile = 57;
        break;
    case Actor.MOVE.BIRTH2:
        tile = 58;
        break;
    case Actor.MOVE.BIRTH0:
        tile = 0;
        break;
    default:
        console.assert(false, "Guard Move is invalid, %o", guard);
        break;
    }

    return tile;
}

gfx.drawGuard = function(guard) {
    const pt = this.getActorScreenAt(guard);
    const tileBehavior = guard.stage.getTileBehavior(guard.xTile, guard.yTile);
    const tile = this.getGuardAppearance(guard, tileBehavior == Stage.TILE.BAR);

    if (guard.currentMove == Actor.MOVE.SHAKE_LEFT)
        pt.x -= 1;
    else if (guard.currentMove == Actor.MOVE.SHAKE_RIGHT)
        pt.x += 1;

    this.drawSprite(tile, pt.x, pt.y);
}

gfx.drawGuards = function(guards) {
    for (const guard of guards) {
        this.drawGuard(guard);
    }
}

gfx.getDiggingAppearance = function(hero) {
    // dig cycle: 1 - 12
    // hole: 31 - 36
    // mud splash: left 27, 28 right 38, 39 ending 29, 30
    const index = hero.digCycle - 1;
    const holeSprite = 31 + Math.floor(index/2);
    const mudSprite = hero.lookLeft
        ? [27, 28, 29, 30][Math.floor(index/3)]
        : [38, 39, 29, 30][Math.floor(index/3)];

    return [holeSprite, mudSprite];
}

gfx.drawHeroDigging = function(hero) {
    if (hero.digging) {
        const tiles = this.getDiggingAppearance(hero);
        const x = this.TILE_WIDTH *
            (hero.lookLeft ? (hero.xTile - 1) : (hero.xTile + 1));
        const y = (hero.yTile + 1) * this.TILE_HEIGHT;
        this.drawSprite(tiles[0], x, y);
        this.drawSprite(tiles[1], x, y - this.TILE_HEIGHT);
    }
}

gfx.getHoleAppearance = function(hole) {
    // phase: 0 - 3
    const index = [0, 55, 56, 1][hole.phase()]
    return index;
}

gfx.drawHoles = function(holes) {
    for (const hole of holes) {
        const tile = this.getHoleAppearance(hole);
        const pt = this.getTileScreenAt(hole.x, hole.y);
        this.drawSprite(tile, pt.x, pt.y);
    }
}
