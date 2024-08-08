"use strict"

class Player extends Tank {
    static PLAYER1 = 0;
    static PLAYER2 = 1;

    static initSprites(spriteSheet) {
        const W = 13 * 2;
        const H = 13 * 2;
        let ctx;

        const createSprites = function (x, y) {
            const sprites = {};
            sprites.image_up = createOffscreenCanvas(W, H);
            ctx = sprites.image_up.getContext('2d');
            ctx.drawImage(spriteSheet, x, y, W, H, 0, 0, W, H);

            sprites.image_right = createOffscreenCanvas(W, H);
            ctx = sprites.image_right.getContext('2d');
            ctx.save();
            ctx.translate(W / 2, H / 2);
            ctx.rotate(Math.PI / 2);
            ctx.translate(-W / 2, -H / 2);
            ctx.drawImage(sprites.image_up, 0, 0, W, H, 0, 0, W, H);
            ctx.restore();

            sprites.image_down = createOffscreenCanvas(W, H);
            ctx = sprites.image_down.getContext('2d');
            ctx.save();
            ctx.translate(W / 2, H / 2);
            ctx.rotate(Math.PI);
            ctx.translate(-W / 2, -H / 2);
            ctx.drawImage(sprites.image_up, 0, 0, W, H, 0, 0, W, H);
            ctx.restore();

            sprites.image_left = createOffscreenCanvas(W, H);
            ctx = sprites.image_left.getContext('2d');
            ctx.save();
            ctx.translate(W / 2, H / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.translate(-W / 2, -H / 2);
            ctx.drawImage(sprites.image_up, 0, 0, W, H, 0, 0, W, H);
            ctx.restore();

            return sprites;
        };

        this.sprites = [
            createSprites(0, 0),
            createSprites(16 * 2, 0)
        ]
    }

    constructor(level, position, direction, player_no) {
        super(level, Tank.SIDE.PLAYER, null, null);

        this.start_positin = position;
        this.start_direction = direction;

        this.lives = 3;

        this.score = 0;

        this.trophies = { bonus: 0, enemy0: 0, enemy1: 0, enemy2: 0, enemy3: 0 };

        const sprites = Player.sprites[player_no];

        this.image_up = sprites.image_up;
        this.image_right = sprites.image_right;
        this.image_down = sprites.image_down;
        this.image_left = sprites.image_left;

        if (direction == null)
            this.rotate(Tank.DIR.UP, false);
        else
            this.rotate(direction, false);
    }


    move(direction) {
        if (this.state == Tank.STATE.EXPLODING) {
            if (!this.explosion.active) {
                this.state = Tank.STATE.DEAD;
                delete this.explosion;
            }
        }

        if (this.state != Tank.STATE.ALIVE)
            return;

        if (this.direction != direction)
            this.rotate(direction);

        if (this.paralised)
            return;

        let new_position;
        switch (direction) {
            case Tank.DIR.UP:
                new_position = [this.rect.x, this.rect.y - this.speed];
                if (new_position[1] < 0) return;
                break;
            case Tank.DIR.RIGHT:
                new_position = [this.rect.x + this.speed, this.rect.y];
                if (new_position[0] > (416 - 26)) return;
                break;
            case Tank.DIR.DOWN:
                new_position = [this.rect.x, this.rect.y + this.speed];
                if (new_position[1] > (416 - 26)) return;
                break;
            case Tank.DIR.LEFT:
                new_position = [this.rect.x - this.speed, this.rect.y];
                if (new_position[0] < 0) return;
                break;
        }

        const player_rect = {x: new_position[0], y: new_position[1], w:26, h:26};
        // collide test

        // collide another player

        // collide enemies

        // collide bonuses

        // if no collision, move player
        this.rect.x = new_position[0];
        this.rect.y = new_position[1];
    }

    reset() {
        this.rotate(this.start_direction, false);
        this.rect = {
            x: this.start_positin.x,
            y: this.start_positin.y,
            w: 26,
            h: 26
        };
        this.superpowers = 0;
        this.max_active_bullets = 1;
        this.health = 100;
        this.paralised = false;
        this.paused = false;
        this.pressed = [];
        this.state = Tank.STATE.ALIVE;
    }
}