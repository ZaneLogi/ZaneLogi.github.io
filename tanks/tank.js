"use strict"

class Tank {
    static DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };
    static STATE = { SPAWNING: 0, DEAD: 1, ALIVE: 2, EXPLODING: 3 };
    static SIDE = { PLAYER: 0, ENEMY: 1 };

    static initSprites(spriteSheet) {
        const createImage = function (x, y, w, h) {
            const image = createOffscreenCanvas(w, h);
            const ctx = image.getContext('2d');
            ctx.drawImage(spriteSheet, x, y, w, h, 0, 0, w, h);
            return image;
        };

        this.shield_images = [
            createImage(0, 48 * 2, 16 * 2, 16 * 2),
            createImage(16 * 2, 48 * 2, 16 * 2, 16 * 2)
        ];

        this.spawn_images = [
            createImage(32 * 2, 48 * 2, 16 * 2, 16 * 2),
            createImage(48 * 2, 48 * 2, 16 * 2, 16 * 2)
        ];

    }

    constructor(level, side, position, direction) {
        // health. 0 health means dead
        this.health = 100;

        // tank can't move but can rotate and shoot
        this.paralised = false;

        // tank can't do anything
        this.paused = false;

        // tank is protected from bullets
        this.shielded = false;

        // px per move
        this.speed = 2;

        // how many bullets can tank fire simultaneously
        this.max_active_bullets = 1;

        // friend or foe
        this.side = side;

        // flashing state. 0-off, 1-on
        this.flash = 0;

        // 0 - no superpowers
        // 1 - faster bullets
        // 2 - can fire 2 bullets
        // 3 - can destroy steel
        this.superpowers = 0;

        // each tank can pick up 1 bonus
        this.bonus = null;

        // navigation keys: fire, up, right, down, left
        this.controls = [];

        // currently pressed buttons
        this.pressed = [];

        this.shield_image = Tank.shield_images[0];
        this.shield_index = 0;

        this.spawn_image = Tank.spawn_images[0];
        this.spawn_index = 0;

        this.level = level;

        this.rect = position
            ? { x: position.x, y: position.y, w: 26, h: 26 }
            : { x: 0, y: 0, w: 26, h: 26 };

        this.direction = direction
            ? direction
            : random_choice([Tank.DIR.RIGHT, Tank.DIR.DOWN, Tank.DIR.LEFT]);

        this.state = Tank.STATE.SPAWNING;

        // spawning animation
        this.timer_no_spawn = gtimer.add(100, () => this.toggleSpawnImage());

        // duration of spawning
        this.timer_no_spawn_end = gtimer.add(1000, () => this.endSpawning());
    }

    endSpawning() {
        // end spawning, player becomes operational
        this.state = Tank.STATE.ALIVE;
        gtimer.destroy(this.timer_no_spawn_end);
    }

    toggleSpawnImage() {
        // advance to the next spawn image
        if (this.state != Tank.STATE.SPAWNING) {
            gtimer.destroy(this.timer_no_spawn);
            return;
        }

        this.spawn_index++;
        if (this.spawn_index >= Tank.spawn_images.length)
            this.spawn_index = 0;
        this.spawn_image = Tank.spawn_images[this.spawn_index];
    }

    toggleShieldImage() {
        // advance to the next shield image
        if (this.state != Tank.STATE.ALIVE)
            return;

        if (this.shielded) {
            this.shield_index++;
            if (this.shield_index >= Tank.shield_images.length)
                this.shield_index = 0;
            this.shield_image = Tank.shield_images[this.shield_index];
        }
    }

    draw(ctx) {
        // draw Tank
        switch (this.state) {
            case Tank.STATE.ALIVE:
                ctx.drawImage(this.image, this.rect.x, this.rect.y);
                if (this.shielded) {
                    ctx.drawImage(this.shield_image, this.rect.x - 3, this.rect.y - 3);
                }
                break;
            case Tank.STATE.EXPLODING:
                this.explosion.draw(ctx);
                break;
            case Tank.STATE.SPAWNING:
                ctx.drawImage(this.spawn_image, this.rect.x, this.rect.y);
                break;
        }
    }

    explode() {
        // start tanks's explosion
        if (this.state != Tank.STATE.DEAD) {
            this.state = Tank.STATE.EXPLODING;
            //this.explosion = new Explosion(this.rect.x, this.rect.y)
            //if (this.bonus) game.spawnBonus()
        }
    }

    fire() {

    }

    rotate(direction, fix_position = true) {
        this.direction = direction;

        switch (direction) {
            case Tank.DIR.UP: this.image = this.image_up; break;
            case Tank.DIR.RIGHT: this.image = this.image_right; break;
            case Tank.DIR.DOWN: this.image = this.image_down; break;
            case Tank.DIR.LEFT: this.image = this.image_left; break;
        }

        if (fix_position) {
            const new_x = nearest(this.rect.x, 8) + 3;
            const new_y = nearest(this.rect.y, 8) + 3;

            if (Math.abs(this.rect.x - new_x) < 5) this.rect.x = new_x;
            if (Math.abs(this.rect.y - new_y) < 5) this.rect.y = new_y;
        }
    }

    turnAround() {

    }

    update() {

    }

    nearest() {

    }

    bulletImpact() {

    }

    setParalised() {

    }
}
