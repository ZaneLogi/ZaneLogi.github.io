"use strict"

const DIR = { RIGHT:0, DOWN:1, LEFT:2, UP:3 };
const DIR_VEC = [i2(1, 0), i2(0, 1), i2(-1, 0), i2(0, -1)];



// compute the distance of a pixel coordinate to the next tile midpoint
function dist_to_tile_mid(pos) {
    return i2(
        Math.floor(TILE_WIDTH/2) - pos.x % TILE_WIDTH,
        Math.floor(TILE_HEIGHT/2) - pos.y % TILE_HEIGHT
    );
}

// convert pixel position to tile position
function pixel_to_tile_pos(pix_pos) {
    return i2(
        Math.floor(pix_pos.x / TILE_WIDTH),
        Math.floor(pix_pos.y / TILE_HEIGHT)
    );
}

// clamp tile pos to valid playfield coords
function clamped_tile_pos(tile_pos) {
    let res = i2(tile_pos.x, tile_pos.y);
    if (res.x < 0) {
        res.x = 0;
    }
    else if (res.x >= DISPLAY_TILES_X) {
        res.x = DISPLAY_TILES_X - 1;
    }
    if (res.y < 3) {
        res.y = 3;
    }
    else if (res.y >= (DISPLAY_TILES_Y-2)) {
        res.y = DISPLAY_TILES_Y - 3;
    }
    return res;
}

// return tile code at tile position
function tile_code_at(tile_pos) {
    console.assert((tile_pos.x >= 0) && (tile_pos.x < DISPLAY_TILES_X));
    console.assert((tile_pos.y >= 0) && (tile_pos.y < DISPLAY_TILES_Y));
    return gfx.video_ram[tile_pos.y][tile_pos.x];
}

// check if a tile position contains a blocking tile (walls and ghost house door)
function is_blocking_tile(tile_pos) {
    return tile_code_at(tile_pos) >= 0xC0;
}

// check if a tile position contains a dot tile
function is_dot(tile_pos) {
    return tile_code_at(tile_pos) == TILE_DOT;
}

// check if a tile position contains a pill tile
function is_pill(tile_pos) {
    return tile_code_at(tile_pos) == TILE_PILL;
}

// check if a tile position is in the teleport tunnel
function is_tunnel(tile_pos) {
    return (tile_pos.y == 17) && ((tile_pos.x <= 5) || (tile_pos.x >= 22));
}



class Actor {
    static game = undefined;

    constructor() {
        this.dir;
        this.pos;
        this.anim_tick = 0;
    }

    // test if movement from a pixel position in a wanted direction is possible,
    // allow_cornering is Pacman's feature to take a diagonal shortcut around corners
    can_move(wanted_dir, allow_cornering) {
        const dir_vec = DIR_VEC[wanted_dir];
        const dist_mid = dist_to_tile_mid(this.pos);

        // distance to midpoint in move direction and perpendicular direction
        let move_dist_mid, perp_dist_mid;
        if (dir_vec.y != 0) {
            move_dist_mid = dist_mid.y;
            perp_dist_mid = dist_mid.x;
        }
        else {
            move_dist_mid = dist_mid.x;
            perp_dist_mid = dist_mid.y;
        }

        // look one tile ahead in movement direction
        const tile_pos = pixel_to_tile_pos(this.pos);
        const check_pos = clamped_tile_pos(add_i2(tile_pos, dir_vec));
        const is_blocked = is_blocking_tile(check_pos);
        if ((!allow_cornering && (0 != perp_dist_mid)) || (is_blocked && (0 == move_dist_mid))) {
            // way is blocked
            return false;
        }
        else {
            // way is free
            return true;
        }
    }

    // compute a new pixel position along a direction (without blocking check!)
    move(allow_cornering) {
        const dir_vec = DIR_VEC[this.dir];
        this.pos = add_i2(this.pos, dir_vec);

        // if cornering is allowed, drag the position towards the center-line
        if (allow_cornering) {
            const dist_mid = dist_to_tile_mid(this.pos);
            if (dir_vec.x != 0) {
                if (dist_mid.y < 0)      { this.pos.y--; }
                else if (dist_mid.y > 0) { this.pos.y++; }
            }
            else if (dir_vec.y != 0) {
                if (dist_mid.x < 0)      { this.pos.x--; }
                else if (dist_mid.x > 0) { this.pos.x++; }
            }
        }

        // wrap x-position around (only possible in the teleport-tunnel)
        if (this.pos.x < 0) {
            this.pos.x = DISPLAY_PIXELS_X - 1;
        }
        else if (this.pos.x >= DISPLAY_PIXELS_X) {
            this.pos.x = 0;
        }
    }

    // convert an actor pos (origin at center) to sprite pos (origin top left)
    actor_to_sprite_pos() {
        return {
            x: this.pos.x - Math.floor(SPRITE_WIDTH/2),
            y: this.pos.y - Math.floor(SPRITE_HEIGHT/2)
        }
    }
}

class Pacman extends Actor {
    constructor() {
        super();
    }

    init() {
        this.dir = DIR.LEFT; // start direction
        this.pos = i2(14*8, 26*8+4); // start positioin
    }

    update() {
        if (this.should_move()) {            
            // move Pacman with cornering allowed
            const wanted_dir = Actor.game.input_dir;
            const allow_cornering = true;
            // look ahead to check if the wanted direction is blocked
            if (this.can_move(wanted_dir, allow_cornering)) {
                this.dir = wanted_dir;
            }
            // move into the selected direction
            if (this.can_move(this.dir, allow_cornering)) {
                this.move(allow_cornering);
                this.anim_tick++;
            }
            // eat dot or energizer pill?
            const tile_pos = pixel_to_tile_pos(this.pos);
            if (is_dot(tile_pos)) {
                gfx.vid_tile(tile_pos, TILE_SPACE);
                Actor.game.score += 1;
                Actor.game.trig_dot_eaten.start();
                Actor.game.trig_force_leave_house.start();
                Actor.game.game_update_dots_eaten();
                Actor.game.game_update_ghosthouse_dot_counters();
            }
            if (is_pill(tile_pos)) {
                gfx.vid_tile(tile_pos, TILE_SPACE);
                Actor.game.score += 5;
                Actor.game.game_update_dots_eaten();
                Actor.game.trig_pill_eaten.start();
                Actor.game.num_ghosts_eaten = 0;
                //for (int i = 0; i < NUM_GHOSTS; i++) {
                //    start(&state.game.ghost[i].frightened);
                //}
                //snd_start(1, &snd_frightened);
            }
            // check if Pacman eats the bonus fruit
            if (Actor.game.active_fruit != FRUIT.NONE) {
            }
            // check if Pacman collides with any ghost
        }
    }

    // return true if Pacman should move in this tick, when eating dots, Pacman
    // is slightly slower than ghosts, otherwise slightly faster
    should_move() {
        if (Actor.game.trig_dot_eaten.now()) {
            // eating a dot causes Pacman to stop for 1 tick
            return false;
        }
        else if (Actor.game.trig_pill_eaten.since() < 3) {
            // eating an energizer pill causes Pacman to stop for 3 ticks
            return false;
        }
        else {
            return 0 != (Actor.game.ticks % 8);
        }
    }

    // set sprite to animated Pacman
    spr_anim_pacman() {
        // animation frames for horizontal and vertical movement
        const tiles = [
            [44, 46, 48, 46], // horizontal (needs flipx)
            [45, 47, 48, 47]  // vertical (needs flipy)
        ];
        const spr = gfx.sprite[0];
        const phase = Math.floor(this.anim_tick / 2) & 3; // 2 ticks per frame, 4 frame cycling
        spr.tile  = tiles[this.dir & 1][phase];
        spr.color = COLOR_PACMAN;
        spr.flipx = (this.dir == DIR.LEFT);
        spr.flipy = (this.dir == DIR.UP);
    }
}

class GhostX extends Actor {
    constructor() {
        super();
    }
}