"use strict"

class Enemy extends Tank {
    static TYPE = { BASIC: 0, FAST: 1, POWER: 2, ARMOR: 3 };
    static initSprites(spriteSheet) {
        const W = 13 * 2;
        const H = 15 * 2;
        const S = H;
        let ctx;

        this.images_up = [];
        for (let i = 0; i < 8; i++) {
            const bmp = createOffscreenCanvas(S, S);
            ctx = bmp.getContext('2d');
            ctx.drawImage(spriteSheet,
                (i % 4 + 2) * 16 * 2, Math.floor(i / 4) * 16 * 2, W, H,
                2, 0, W, H);
            this.images_up[i] = bmp;
        }

        this.images_right = [];
        for (let i = 0; i < 8; i++) {
            const bmp = createOffscreenCanvas(S, S);
            ctx = bmp.getContext('2d');
            ctx.save();
            ctx.translate(S / 2, S / 2);
            ctx.rotate(Math.PI / 2);
            ctx.translate(-S / 2, -S / 2);
            ctx.drawImage(this.images_up[i], 0, 0, S, S, 0, 0, S, S);
            ctx.restore();
            this.images_right[i] = bmp;
        }

        this.images_down = [];
        for (let i = 0; i < 8; i++) {
            const bmp = createOffscreenCanvas(S, S);
            ctx = bmp.getContext('2d');
            ctx.save();
            ctx.translate(S / 2, S / 2);
            ctx.rotate(Math.PI);
            ctx.translate(-S / 2, -S / 2);
            ctx.drawImage(this.images_up[i], 0, 0, S, S, 0, 0, S, S);
            ctx.restore();
            this.images_down[i] = bmp;
        }

        this.images_left = [];
        for (let i = 0; i < 8; i++) {
            const bmp = createOffscreenCanvas(S, S);
            ctx = bmp.getContext('2d');
            ctx.save();
            ctx.translate(S / 2, S / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.translate(-S / 2, -S / 2);
            ctx.drawImage(this.images_up[i], 0, 0, S, S, 0, 0, S, S);
            ctx.restore();
            this.images_left[i] = bmp;
        }
    }

    constructor(level, type, position, direction) {
        super(level, Tank.SIDE.Enemy, null, null);

        // if true, do not fire
        this.bullet_queued = false;

        // choose type on random
        if (level.enemies_left.length > 0)
            this.type = level.enemies_left.pop()
        else {
            this.state = Tank.STATE.DEAD;
            return;
        }

        switch (this.type) {
            case Enemy.TYPE.BASIC: this.speed = 1; break;
            case Enemy.TYPE.FAST: this.speed = 3; break;
            case Enemy.TYPE.POWER: this.superpowers = 1; break;
            case Enemy.TYPE.ARMOR: this.health = 400; break;
        }

        // 1 in 5 chance this will be bonus carrier, but only if no other tank is
        if (Math.floor(Math.random() * 5) == 1) {
            this.bonus = true;
            for (const enemy of enemies) {
                if (enemy.bonus) {
                    this.bonus = false;
                    break;
                }
            }
        }

        this.image_up = Enemy.images_up[this.type];
        this.image_right = Enemy.images_rihgt[this.type];
        this.image_down = Enemy.images_down[this.type];
        this.images_left = Enemy.images_left[this.type];
        this.image = this.image_up;

        if (this.bonus) {
            this.image1_up = this.image_up;
            this.image1_right = this.image_right;
            this.image1_down = this.image_down;
            this.image1_left = this.image1_left;

            this.image2_up = Enemy.images_up[this.type + 4];
            this.image2_right = Enemy.images_rihgt[this.type + 4];
            this.image2_down = Enemy.images_down[this.type + 4];
            this.image2_left = Enemy.images_left[this.type + 4];
            this.image2 = this.image2_up;
        }

        this.rotate(this.direction, false);

        if (position == null) {
            this.rect = this.getFreeSpawningPosition();
            if (this.rect == false) {
                this.state = Tank.STATE.DEAD;
                return;
            }

        }

        // list of map coords where tank should go next
        this.path = this.generatePath(this.direction)

        // 1000 is duration between shots
        //this.timer_uuid_fire = gtimer.add(1000, lambda :self.fire())

        // turn on flashing
        //if (this.bonus)
        //    this.timer_uuid_flash = gtimer.add(200, lambda :self.toggleFlash())
    }




    getFreeSpawningPosition() {
        const available_positions = [
            [(Level.TILE_SIZE * 2 - this.rect.w) / 2, (Level.TILE_SIZE * 2 - this.rect.h) / 2],
            [12 * Level.TILE_SIZE + (Level.TILE_SIZE * 2 - this.rect.w) / 2, (Level.TILE_SIZE * 2 - this.rect.h) / 2],
            [24 * Level.TILE_SIZE + (Level.TILE_SIZE * 2 - this.rect.w) / 2, (Level.TILE_SIZE * 2 - this.rect.h) / 2]
        ]

        random_shuffle(available_positions);

        for (const pos of available_positions) {
            const enemy_rect = { x: pos[0], y: pos[1], w: 26, h: 26 };

            // collisions with other enemies
            let collision = false;
            for (const enemy of game.enemies) {
                if (intersectRect(enemy_rect, enemy.rect)) {
                    collision = true;
                    break;
                }
            }

            if (collision)
                continue;

            // collisions with players
            collision = false;
            for (const player of game.players) {
                if (intersectRect(enemy_rect, player.rect)) {
                    collision = true;
                    break;
                }
            }

            if (collision)
                continue;

            return pos;
        }
        return false;
    }
}