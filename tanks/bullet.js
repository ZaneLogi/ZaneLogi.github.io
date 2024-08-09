"use strict"

class Bullet {
    static DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };
    static STATE = { REMOVED: 0, ACTIVE: 1, EXPLODING: 2 };
    static OWNER = { PLAYER: 0, ENEMY: 1 };

    static initSprites(sprite_sheet) {
        this.image_up = createSprite(sprite_sheet, 75 * 2, 74 * 2, 3 * 2, 4 * 2, true);
        this.image_right = rotateSprite(this.image_up, Math.PI / 2);
        this.image_down = rotateSprite(this.image_up, Math.PI);
        this.image_left = rotateSprite(this.image_up, -Math.PI / 2);

        this.explosion_images = [
            createSprite(sprite_sheet, 0, 80 * 2, 32 * 2, 32 * 2),
            createSprite(sprite_sheet, 32 * 2, 80 * 2, 32 * 2, 32 * 2),
        ]
    }

    constructor(level, shooter, damage = 100, speed = 5) {
        this.level = level;
        this.rect = shooter.rect;
        this.direction = shooter.direction;
        this.damage = damage;
        this.speed = speed;
        this.owner = shooter.side;
        this.owner_class = shooter;

        // if superpower level is at least 1
		if (shooter.superpowers > 0)
            this.speed = 8;

        // if superpower level is at least 3
        if (shooter.superpowers > 2)
            this.power = 2;
        else
            this.power = 1; // 1: regular, 2: can destroy steel

        // position is player's top left corner, so we'll need to
        // recalculate a bit. also rotate image itself.
        const xoff = Math.floor((shooter.rect.w - 8) / 2);
        const yoff = Math.floor((shooter.rect.h - 8) / 2);
        switch (this.direction) {
            case Bullet.DIR.UP:
                this.image = Bullet.image_up;
                this.rect = { x: shooter.rect.x + xoff, y: shooter.rect.y - 8, w: 8, h: 8 };
                break;
            case Bullet.DIR.RIGHT:
                this.image = Bullet.image_right;
                this.rect = { x: shooter.rect.x + shooter.rect.w, y: shooter.rect.y + yoff, w: 8, h: 8 };
                break;
            case Bullet.DIR.DOWN:
                this.image = Bullet.image_down;
                this.rect = { x: shooter.rect.x + xoff, y: shooter.rect.y + shooter.rect.h, w: 8, h: 8 };
                break;
            case Bullet.DIR.LEFT:
                this.image = Bullet.image_left;
                this.rect = { x: shooter.rect.x - 8, y: shooter.rect.y + yoff, w: 8, h: 8 };
                break;
        }

        this.state = Bullet.STATE.ACTIVE;

        game.bullets.push(this);
    }

    draw(ctx) {
        // draw bullet
        switch (this.state) {
            case Bullet.STATE.ACTIVE:
                ctx.drawImage(this.image, this.rect.x, this.rect.y);
                break;
            case Bullet.STATE.EXPLODING:
                this.explosion.draw(ctx);
                break;
        }
    }

    update() {
        if (this.state == Bullet.STATE.EXPLODING) {
            if (!this.explosion.active) {
                this.destroy();
                delete this.explosion;
            }
        }

        if (this.state != Bullet.STATE.ACTIVE)
            return;

        // move bullet
        switch (this.direction) {
            case Bullet.DIR.UP:
                this.rect.y -= this.speed;
                if (this.rect.y < 0) {
                    //if play_sounds and self.owner == self.OWNER_PLAYER:
                    //	sounds["steel"].play()
                    this.explode();
                    return;
                }
                break;
            case Bullet.DIR.RIGHT:
                this.rect.x += this.speed;
                if (this.rect.x > 416 - this.rect.w) {
                    this.explode();
                    return;
                }
                break;
            case Bullet.DIR.DOWN:
                this.rect.y += this.speed;
                if (this.rect.y > 416 - this.rect.h) {
                    this.explode();
                    return;
                }
                break;
            case Bullet.DIR.LEFT:
                this.rect.x -= this.speed;
                if (this.rect.x < 0) {
                    this.explode();
                    return;
                }
                break;
        }

        let has_collided = false;


    }

    explode() {
        // start bullets's explosion
        if (this.state != Bullet.STATE.REMOVED) {
            this.state = Bullet.STATE.EXPLODING;
            this.explosion = new Explosion({ x: this.rect.x - 13, y: this.rect.y - 13 },
                null, Bullet.explosion_images);
        }
    }

    destroy() {
        this.state = Bullet.STATE.REMOVED;
    }
}