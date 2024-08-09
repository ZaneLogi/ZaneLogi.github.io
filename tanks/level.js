"use strict"

class Level {
    static TILE = { EMPTY: 0, BRICK: 1, STEEL: 2, WATER: 3, GRASS: 4, FROZE: 5 };
    static TILE_SIZE = 16;

    static initSprites(spriteSheet) {
        this.tile_empty = createOffscreenCanvas(16, 16);
        this.tile_brick1 = createSprite(spriteSheet, 48 * 2, 64 * 2, 16, 16);
        this.tile_brick2 = createSprite(spriteSheet, 56 * 2, 64 * 2, 16, 16);
        this.tile_water1 = createSprite(spriteSheet, 64 * 2, 64 * 2, 16, 16);
        this.tile_water2 = createSprite(spriteSheet, 72 * 2, 64 * 2, 16, 16);
        this.tile_steel = createSprite(spriteSheet, 48 * 2, 72 * 2, 16, 16);
        this.tile_grass = createSprite(spriteSheet, 56 * 2, 72 * 2, 16, 16);
        this.tile_froze = createSprite(spriteSheet, 64 * 2, 72 * 2, 16, 16);

        this.tile_images = [
            this.tile_empty,
            this.tile_brick1,
            this.tile_steel,
            this.tile_water1,
            this.tile_grass,
            this.tile_froze,
        ];
    }

    // set number of enemies by types (basic, fast, power, armor) according to level
    static levels_enemies = [
        [18, 2, 0, 0], [14, 4, 0, 2], [14, 4, 0, 2], [2, 5, 10, 3], [8, 5, 5, 2],
        [9, 2, 7, 2], [7, 4, 6, 3], [7, 4, 7, 2], [6, 4, 7, 3], [12, 2, 4, 2],
        [5, 5, 4, 6], [0, 6, 8, 6], [0, 8, 8, 4], [0, 4, 10, 6], [0, 2, 10, 8],
        [16, 2, 0, 2], [8, 2, 8, 2], [2, 8, 6, 4], [4, 4, 4, 8], [2, 8, 2, 8],
        [6, 2, 8, 4], [6, 8, 2, 4], [0, 10, 4, 6], [10, 4, 4, 2], [0, 8, 2, 10],
        [4, 6, 4, 6], [2, 8, 2, 8], [15, 2, 2, 1], [0, 4, 10, 6], [4, 8, 4, 4],
        [3, 8, 3, 6], [6, 4, 2, 8], [4, 4, 4, 8], [0, 10, 4, 6], [0, 6, 4, 10]
    ];

    constructor(level_nr) {
        let enemies_l;
        if (level_nr <= 35)
            enemies_l = Level.levels_enemies[level_nr - 1];
        else
            enemies_l = Level.levels_enemies[34]

        // TODO:
        //    self.level.enemies_left = [0]*enemies_l[0] + [1]*enemies_l[1] + [2]*enemies_l[2] + [3]*enemies_l[3]
        //    random.shuffle(self.level.enemies_left)

        level_nr = level_nr ? level_nr % 35 : 1;
        if (level_nr == 0)
            level_nr = 35;





        this.loadLevel(level_nr);

        // tiles' rects on map, tanks cannot move over
        this.obstacle_rects = []

        // update these tiles
        this.updateObstacleRects()
    }

    loadLevel(level_nr) {
        const data = level_data[level_nr].split('\n').slice(1, -1);
        const mapr_brick = [];
        const mapr_steel = [];
        const mapr_water = [];
        const mapr_grass = [];
        const mapr_forze = [];
        this.mapr = [];
        this.mapr[Level.TILE.BRICK] = mapr_brick;
        this.mapr[Level.TILE.STEEL] = mapr_steel;
        this.mapr[Level.TILE.WATER] = mapr_water;
        this.mapr[Level.TILE.GRASS] = mapr_grass;
        this.mapr[Level.TILE.FROZE] = mapr_forze;

        let x = 0, y = 0;
        for (const row of data) {
            for (const ch of row) {
                if (ch == "#")
                    mapr_brick.push({ x: x, y: y, w: Level.TILE_SIZE, h: Level.TILE_SIZE });
                else if (ch == "@")
                    mapr_steel.push({ x: x, y: y, w: Level.TILE_SIZE, h: Level.TILE_SIZE });
                else if (ch == "~")
                    mapr_water.push({ x: x, y: y, w: Level.TILE_SIZE, h: Level.TILE_SIZE });
                else if (ch == "%")
                    mapr_grass.push({ x: x, y: y, w: Level.TILE_SIZE, h: Level.TILE_SIZE });
                else if (ch == "-")
                    mapr_forze.push({ x: x, y: y, w: Level.TILE_SIZE, h: Level.TILE_SIZE });
                x += Level.TILE_SIZE
            }
            x = 0
            y += Level.TILE_SIZE
        }
    }

    draw(ctx, tile_set) {
        tile_set = tile_set
            ? tile_set
            : [Level.TILE.BRICK, Level.TILE.STEEL, Level.TILE.WATER,
            Level.TILE.GRASS, Level.TILE.FROZE];

        for (const type of tile_set) {
            const image = Level.tile_images[type];
            for (const tile of this.mapr[type]) {
                ctx.drawImage(image, tile.x, tile.y);
            }
        }
    }

    updateObstacleRects() {
        // Set this.obstacle_rects to all tiles' rects that players can destroy
        // with bullets

        // TODO: self.obstacle_rects = [castle.rect]

        const obstacles = [Level.TILE.BRICK, Level.TILE.STEEL, Level.TILE.WATER];

        //TODO
        /*for (const tile of this.mapr) {
            if (obstacles.includes(tile.type))
                this.obstacle_rects.push(tile);
        }*/
    }

    intersectObstacles(rect) {
        if (intersectRect(rect, game.castle.rect))
            return true;

        const intersectRects = function (rects) {
            for (const test of rects) {
                if (intersectRect(rect, test))
                    return true;
            }
            return false;
        }

        if (intersectRects(this.mapr[Level.TILE.BRICK]))
            return true;
        if (intersectRects(this.mapr[Level.TILE.STEEL]))
            return true;
        if (intersectRects(this.mapr[Level.TILE.WATER]))
            return true;

        return false;
    }

    hitTiles(bullet) {
        const srcRect = bullet.rect;
        const play_sound = (bullet.owner == Tank.SIDE.PLAYER);
        let collided = false;

        this.mapr[Level.TILE.BRICK] = this.mapr[Level.TILE.BRICK].filter(dstRect => {
            if (intersectRect(srcRect, dstRect)) {
                collided = true;
                return false;
            }
            return true;
        });

        this.mapr[Level.TILE.STEEL] = this.mapr[Level.TILE.STEEL].filter(dstRect => {
            if (intersectRect(srcRect, dstRect)) {
                collided = true;
                return bullet.power != 2;
            }
            return true;
        });

        return collided;
    }

}