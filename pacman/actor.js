"use strict"

const DIR = { RIGHT:0, DOWN:1, LEFT:2, UP:3 };
const NUM_DIRS = 4;
const DIR_VEC = [i2(1, 0), i2(0, 1), i2(-1, 0), i2(0, -1)];

// return the reverse direction
function reverse_dir(dir) {
    switch (dir) {
        case DIR.RIGHT: return DIR.LEFT;
        case DIR.DOWN:  return DIR.UP;
        case DIR.LEFT:  return DIR.RIGHT;
        default:        return DIR.DOWN;
    }
}


const SPRITE = {
    PACMAN: 0,
    BLINKY: 1,
    PINKY: 2,
    INKY: 3,
    CLYDE: 4,
    FRUIT: 5,
    MAX: 6
};


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

// check if a tile position contains a blocking tile (walls and ghost house door)
function is_blocking_tile(tile_pos) {
    return gfx.tile_code_at(tile_pos) >= 0xC0;
}

// check if a tile position contains a dot tile
function is_dot(tile_pos) {
    return gfx.tile_code_at(tile_pos) == TILE_DOT;
}

// check if a tile position contains a pill tile
function is_pill(tile_pos) {
    return gfx.tile_code_at(tile_pos) == TILE_PILL;
}

// check if a tile position is in the teleport tunnel
function is_tunnel(tile_pos) {
    return (tile_pos.y == 17) && ((tile_pos.x <= 5) || (tile_pos.x >= 22));
}

// check if a position is in the ghost's red zone, where upward movement is forbidden
// (see Pacman Dossier "Areas To Exploit")
function is_redzone(tile_pos) {
    return ((tile_pos.x >= 11) && (tile_pos.x <= 16) && ((tile_pos.y == 14) || (tile_pos.y == 26)));
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

        this.trig_dot_eaten = new Trigger();
        this.trig_pill_eaten = new Trigger();
        this.trig_pacman_eaten = new Trigger();
        this.trig_ghost_eaten = new Trigger();
    }

    pacman_sprite() {
        return gfx.sprite[SPRITE.PACMAN];
    }

    init() {
        this.dir = DIR.LEFT; // start direction
        this.pos = i2(14*8, 26*8+4); // start positioin

        this.trig_dot_eaten.disable();
        this.trig_pill_eaten.disable();
        this.trig_pacman_eaten.disable();
        this.trig_ghost_eaten.disable();

        const sprite = this.pacman_sprite();
        sprite.enabled= true;
        sprite.color = COLOR_PACMAN;
        input.input_dir = DIR.LEFT;
    }

    update() {
        if (!this.should_move())
            return;

        // move Pacman with cornering allowed
        const wanted_dir = input.input_dir;
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
            this.trig_dot_eaten.start();
            Actor.game.score += 1;
            Actor.game.trig_force_leave_house.start();
            Actor.game.game_update_dots_eaten();
            Actor.game.game_update_ghosthouse_dot_counters();
        }
        if (is_pill(tile_pos)) {
            gfx.vid_tile(tile_pos, TILE_SPACE);
            this.trig_pill_eaten.start();
            Actor.game.score += 5;
            Actor.game.game_update_dots_eaten();
            Actor.game.num_ghosts_eaten = 0;
            for (const ghost of Actor.game.ghosts) {
                ghost.trig_frightened.start()
            }
            //snd_start(1, &snd_frightened);
        }
        // check if Pacman eats the bonus fruit
        if (Actor.game.fruit.active_fruit != FRUIT.NONE) {
            const test_pos = pixel_to_tile_pos(add_i2(this.pos, i2(Math.floor(TILE_WIDTH/2), 0)));
            if (equal_i2(test_pos, Actor.game.fruit.pos)) {
                Actor.game.fruit.trig_fruit_eaten.start();
                const score = levelspec(Actor.game.round).bonus_score;
                Actor.game.score += score;
                gfx.vid_fruit_score(Actor.game.fruit.active_fruit);
                Actor.game.fruit.active_fruit = FRUIT.NONE;
                //snd_start(2, &snd_eatfruit);
            }
        }
        // check if Pacman collides with any ghost
        for (const ghost of Actor.game.ghosts) {
            const ghost_tile_pos = pixel_to_tile_pos(ghost.pos);
            if (!equal_i2(tile_pos, ghost_tile_pos))
                continue;

            if (ghost.state == GHOSTSTATE.FRIGHTENED) {
                // Pacman eats a frightened ghost
                ghost.state = GHOSTSTATE.EYES;
                ghost.trig_eaten.start();
                this.trig_ghost_eaten.start();
                Actor.game.num_ghosts_eaten++;
                // increase score by 20, 40, 80, 160
                Actor.game.score += 10 * (1<<Actor.game.num_ghosts_eaten);
                Actor.game.freeze |= FREEZETYPE.EAT_GHOST;
                //snd_start(2, &snd_eatghost);
            }
            else if (!Actor.game.god_mode && ((ghost.state == GHOSTSTATE.CHASE) || (ghost.state == GHOSTSTATE.SCATTER))) {
                // otherwise, ghost eats Pacman, Pacman loses a life
                //snd_clear();
                this.trig_pacman_eaten.start();
                Actor.game.freeze |= FREEZETYPE.DEAD;
                // if Pacman has any lives left start a new round, otherwise start the game-over sequence
                if (Actor.game.num_lives > 0) {
                    Actor.game.trig_ready_started.start_after(PACMAN_EATEN_TICKS+PACMAN_DEATH_TICKS);
                }
                else {
                    Actor.game.trig_game_over.start_after(PACMAN_EATEN_TICKS+PACMAN_DEATH_TICKS);
                }
            }
        }
    }

    // return true if Pacman should move in this tick, when eating dots, Pacman
    // is slightly slower than ghosts, otherwise slightly faster
    should_move() {
        if (this.trig_dot_eaten.now()) {
            // eating a dot causes Pacman to stop for 1 tick
            return false;
        }
        else if (this.trig_pill_eaten.since() < 3) {
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
        const spr = this.pacman_sprite();
        const phase = Math.floor(this.anim_tick / 2) & 3; // 2 ticks per frame, 4 frame cycling
        spr.tile  = tiles[this.dir & 1][phase];
        spr.color = COLOR_PACMAN;
        spr.flipx = (this.dir == DIR.LEFT);
        spr.flipy = (this.dir == DIR.UP);
    }

    // set sprite to Pacman's death sequence
    spr_anim_pacman_death(tick) {
        // the death animation tile sequence starts at sprite tile number 52 and ends at 63
        const spr = this.pacman_sprite();
        let tile = 52 + Math.floor(tick / 8);
        if (tile > 63) {
            tile = 63;
        }
        spr.tile = tile;
        spr.flipx = spr.flipy = false;
    }

    update_sprite() {
        const sprite = this.pacman_sprite();
        if (!sprite.enabled)
            return;

        sprite.pos = this.actor_to_sprite_pos();
        if (Actor.game.freeze & FREEZETYPE.EAT_GHOST) {
            // hide Pacman shortly after he's eaten a ghost (via an invisible Sprite tile)
            sprite.tile = SPRITETILE_INVISIBLE;
        }
        else if (Actor.game.freeze & (FREEZETYPE.PRELUDE|FREEZETYPE.READY)) {
            // special case game frozen at start of round, show Pacman with 'closed mouth'
            sprite.tile = SPRITETILE_PACMAN_CLOSED_MOUTH;
        }
        else if (Actor.game.freeze & FREEZETYPE.DEAD) {
            // play the Pacman-death-animation after a short pause
            if (this.trig_pacman_eaten.after(PACMAN_EATEN_TICKS)) {
                this.spr_anim_pacman_death(this.trig_pacman_eaten.since() - PACMAN_EATEN_TICKS);
            }
        }
        else {
            // regular Pacman animation
            this.spr_anim_pacman();
        }
    }
}



const GHOSTTYPE = {
    BLINKY: 0,
    PINKY: 1,
    INKY: 2,
    CLYDE: 3,
};

const NUM_GHOSTS = 4;

// starting positions for ghosts (pixel coords)
const ghost_starting_pos = [
    i2( 14*8, 14*8 + 4 ),
    i2( 14*8, 17*8 + 4 ),
    i2( 12*8, 17*8 + 4 ),
    i2( 16*8, 17*8 + 4 )
];

// scatter target positions (in tile coords)
const ghost_scatter_targets = [
    i2( 25, 0 ), i2( 2, 0 ), i2( 27, 34 ), i2( 0, 34 )
];

// target positions for ghost entering the ghost house (pixel coords)
const ghost_house_target_pos = [
    i2( 14*8, 17*8 + 4 ),
    i2( 14*8, 17*8 + 4 ),
    i2( 12*8, 17*8 + 4 ),
    i2( 16*8, 17*8 + 4 ),
];

const GHOSTSTATE = {
    NONE: 0,
    CHASE: 1,           // currently chasing Pacman
    SCATTER: 2,         // currently heading to the corner scatter targets
    FRIGHTENED: 3,      // frightened after Pacman has eaten an energizer pill
    EYES: 4,            // eaten by Pacman and heading back to the ghost house
    HOUSE: 5,           // currently inside the ghost house
    LEAVEHOUSE: 6,      // currently leaving the ghost house
    ENTERHOUSE: 7       // currently entering the ghost house
};

// return the current global scatter or chase phase
function game_scatter_chase_phase() {
    const t = game.trig_round_started.since();
    if (t < 7*60)       return GHOSTSTATE.SCATTER;
    else if (t < 27*60) return GHOSTSTATE.CHASE;
    else if (t < 34*60) return GHOSTSTATE.SCATTER;
    else if (t < 54*60) return GHOSTSTATE.CHASE;
    else if (t < 59*60) return GHOSTSTATE.SCATTER;
    else if (t < 79*60) return GHOSTSTATE.CHASE;
    else if (t < 84*60) return GHOSTSTATE.SCATTER;
    else return GHOSTSTATE.CHASE;
}

class Ghost extends Actor {
    constructor() {
        super();

        this.type;
        this.next_dir;
        this.target_pos;
        this.state;
        this.trig_frightened = new Trigger();
        this.trig_eaten = new Trigger();
        this.dot_counter;
        this.dot_limit;
    }

    init() {
        this.trig_frightened.disable();
        this.trig_eaten.disable();
    }

    update() {
        // handle ghost-state transitions
        this.update_ghost_state();
        // update the ghost's target position
        this.update_ghost_target();
        // finally, move the ghost towards the current target position
        const num_move_ticks = this.ghost_speed();
        for (let i = 0; i < num_move_ticks; i++) {
            const force_move = this.update_ghost_dir();
            const allow_cornering = false;
            if (force_move || this.can_move(this.dir, allow_cornering)) {
                this.move(allow_cornering);
                this.anim_tick++;
            }
        }
    }

    update_ghost_state() {
        let new_state = this.state;
        switch (this.state) {
            case GHOSTSTATE.EYES:
                // When in eye state (heading back to the ghost house), check if the
                // target position in front of the ghost house has been reached, then
                // switch into ENTERHOUSE state. Since ghosts in eye state move faster
                // than one pixel per tick, do a fuzzy comparison with the target pos
                if (nearequal_i2(this.pos, i2(ANTEPORTAS_X, ANTEPORTAS_Y), 1)) {
                    new_state = GHOSTSTATE.ENTERHOUSE;
                }
                break;
            case GHOSTSTATE.ENTERHOUSE:
                // Ghosts that enter the ghost house during the gameplay loop immediately
                // leave the house again after reaching their target position inside the house.
                if (nearequal_i2(this.pos, this.house_target(), 1)) {
                    new_state = GHOSTSTATE.LEAVEHOUSE;
                }
                break;
            case GHOSTSTATE.HOUSE:
                // Ghosts only remain in the "house state" after a new game round
                // has been started. The conditions when ghosts leave the house
                // are a bit complicated, best to check the Pacman Dossier for the details.
                if (Actor.game.trig_force_leave_house.after_once(4*60)) {
                    // if Pacman hasn't eaten dots for 4 seconds, the next ghost
                    // is forced out of the house
                    // FIXME: time is reduced to 3 seconds after round 5
                    new_state = GHOSTSTATE.LEAVEHOUSE;
                    Actor.game.trig_force_leave_house.start();
                }
                else if (Actor.game.global_dot_counter_active) {
                    // if Pacman has lost a life this round, the global dot counter is used
                    new_state = this.check_global_dot_counter();
                }
                else if (this.dot_counter >= this.dot_limit) {
                    // in the normal case, check the ghost's personal dot counter
                    new_state = GHOSTSTATE.LEAVEHOUSE;
                }
                break;
            case GHOSTSTATE.LEAVEHOUSE:
                // ghosts immediately switch to scatter mode after leaving the ghost house
                if (this.pos.y == ANTEPORTAS_Y) {
                    new_state = GHOSTSTATE.SCATTER;
                }
                break;
            default:
                // switch between frightened, scatter and chase mode
                if (this.trig_frightened.before(levelspec(Actor.game.round).fright_ticks)) {
                    new_state = GHOSTSTATE.FRIGHTENED;
                }
                else {
                    new_state = game_scatter_chase_phase();
                }
        }
        // handle state transitions
        if (new_state != this.state) {
            switch (this.state) {
                case GHOSTSTATE.LEAVEHOUSE:
                    // after leaving the ghost house, head to the left
                    this.next_dir = this.dir = DIR.LEFT;
                    break;
                case GHOSTSTATE.ENTERHOUSE:
                    // a ghost that was eaten is immune to frighten until Pacman eats another pill
                    this.trig_frightened.disable();
                    break;
                case GHOSTSTATE.FRIGHTENED:
                    // don't reverse direction when leaving frightened state
                    break;
                case GHOSTSTATE.SCATTER:
                case GHOSTSTATE.CHASE:
                    // any transition from scatter and chase mode causes a reversal of direction
                    this.next_dir = reverse_dir(this.dir);
                    break;
                default:
                    break;
            }
            this.state = new_state;
        }
    }

    update_ghost_target() {
        let pos = this.target_pos;
        switch (this.state) {
            case GHOSTSTATE.SCATTER:
                // when in scatter mode, each ghost heads to its own scatter
                // target position in the playfield corners
                pos = this.scatter_target();
                break;
            case GHOSTSTATE.CHASE:
                // when in chase mode, each ghost has its own particular
                // chase behaviour (see the Pacman Dossier for details)
                pos = this.chase_target();
                break;
            case GHOSTSTATE.FRIGHTENED:
                // in frightened state just select a random target position
                // this has the effect that ghosts in frightened state
                // move in a random direction at each intersection
                pos = this.firghtened_target();
                break;
            case GHOSTSTATE.EYES:
                // move towards the ghost house door
                pos = this.eye_target();
                break;
            default:
                break;
        }
        this.target_pos = pos;
    }

    firghtened_target() {
        return i2(xorshift32() % DISPLAY_TILES_X, xorshift32() % DISPLAY_TILES_Y);
    }

    eye_target() {
        return i2(13, 14);
    }

    ghost_speed() {
        switch (this.state) {
            case GHOSTSTATE.HOUSE:
            case GHOSTSTATE.LEAVEHOUSE:
                // inside house at half speed (estimated)
                return Actor.game.ticks & 1;
            case GHOSTSTATE.FRIGHTENED:
                // move at 50% speed when frightened
                return Actor.game.ticks & 1;
            case GHOSTSTATE.EYES:
            case GHOSTSTATE.ENTERHOUSE:
                // estimated 1.5x when in eye state, Pacman Dossier is silent on this
                return (Actor.game.ticks & 1) ? 1 : 2;
            default:
                if (is_tunnel(pixel_to_tile_pos(this.pos))) {
                    // move drastically slower when inside tunnel
                    return ((Actor.game.ticks * 2) % 4) ? 1 : 0;
                }
                else {
                    // otherwise move just a bit slower than Pacman
                    return (Actor.game.ticks % 7) ? 1 : 0;
                }
        }
    }

    update_ghost_dir() {
        // inside ghost-house, just move up and down
        if (this.state == GHOSTSTATE.HOUSE) {
            if (this.pos.y <= 17*TILE_HEIGHT) {
                this.next_dir = DIR.DOWN;
            }
            else if (this.pos.y >= 18*TILE_HEIGHT) {
                this.next_dir = DIR.UP;
            }
            this.dir = this.next_dir;
            // force movement
            return true;
        }
        // navigate the ghost out of the ghost house
        else if (this.state == GHOSTSTATE.LEAVEHOUSE) {
            const pos = this.pos;
            if (pos.x == ANTEPORTAS_X) {
                if (pos.y > ANTEPORTAS_Y) {
                    this.next_dir = DIR.UP;
                }
            }
            else {
                const mid_y = 17*TILE_HEIGHT + Math.floor(TILE_HEIGHT/2);
                if (pos.y > mid_y) {
                    this.next_dir = DIR.UP;
                }
                else if (pos.y < mid_y) {
                    this.next_dir = DIR.DOWN;
                }
                else {
                    this.next_dir = (pos.x > ANTEPORTAS_X) ? DIR.LEFT : DIR.RIGHT;
                }
            }
            this.dir = this.next_dir;
            return true;
        }
        // navigate towards the ghost house target pos
        else if (this.state == GHOSTSTATE.ENTERHOUSE) {
            const pos = this.pos;
            const tile_pos = pixel_to_tile_pos(pos);
            const tgt_pos = this.house_target();
            if (tile_pos.y == 14) {
                if (pos.x != ANTEPORTAS_X) {
                    this.next_dir = (pos.x < ANTEPORTAS_X) ? DIR.RIGHT:DIR.LEFT;
                }
                else {
                    this.next_dir = DIR.DOWN;
                }
            }
            else if (pos.y == tgt_pos.y) {
                this.next_dir = (pos.x < tgt_pos.x) ? DIR.RIGHT : DIR.LEFT;
            }
            this.dir = this.next_dir;
            return true;
        }
        // scatter/chase/frightened: just head towards the current target point
        else {
            // only compute new direction when currently at midpoint of tile
            const dist_to_mid = dist_to_tile_mid(this.pos);
            if ((dist_to_mid.x == 0) && (dist_to_mid.y == 0)) {
                // new direction is the previously computed next-direction
                this.dir = this.next_dir;

                // compute new next-direction
                const dir_vec = DIR_VEC[this.dir];
                const lookahead_pos = add_i2(pixel_to_tile_pos(this.pos), dir_vec);

                // try each direction and take the one that moves closest to the target
                let min_dist = 100000;
                let dist = 0;
                for (const dir of [DIR.UP, DIR.LEFT, DIR.DOWN, DIR.RIGHT]) {
                    // if ghost is in one of the two 'red zones', forbid upward movement
                    // (see Pacman Dossier "Areas To Exploit")
                    if (is_redzone(lookahead_pos) && (dir == DIR.UP) && (this.state != GHOSTSTATE.EYES)) {
                        continue;
                    }
                    const revdir = reverse_dir(dir);
                    const test_pos = clamped_tile_pos(add_i2(lookahead_pos, DIR_VEC[dir]));
                    if ((revdir != this.dir) && !is_blocking_tile(test_pos)) {
                        if ((dist = squared_distance_i2(test_pos, this.target_pos)) < min_dist) {
                            min_dist = dist;
                            this.next_dir = dir;
                        }
                    }
                }
            }
            return false;
        }
    }

    // set sprite to animated ghost
    spr_anim_ghost(dir) {
        const tiles = [
            [ 32, 33 ], // right
            [ 34, 35 ], // down
            [ 36, 37 ], // left
            [ 38, 39 ], // up
        ];
        const spr = this.ghost_sprite();
        const phase = Math.floor(this.anim_tick / 8) & 1;
        spr.tile = tiles[dir][phase];
        spr.color = this.ghost_color();
        spr.flipx = false;
        spr.flipy = false;
    }

    // set sprite to frightened ghost
    spr_anim_ghost_frightened() {
        const tick = this.trig_frightened.since();
        const tiles = [ 28, 29 ];
        const spr = this.ghost_sprite();
        const phase = Math.floor(tick / 4) & 1;
        spr.tile = tiles[phase];
        if (tick > (levelspec(Actor.game.round).fright_ticks - 60)) {
            // towards end of frightening period, start blinking
            spr.color = (tick & 0x10) ? COLOR_FRIGHTENED : COLOR_FRIGHTENED_BLINKING;
        }
        else {
            this.color = COLOR_FRIGHTENED;
        }
        this.flipx = false;
        this.flipy = false;
    }

    /* set sprite to ghost eyes, these are the normal ghost sprite
    images but with a different color code which makes
    only the eyes visible
    */
    spr_anim_ghost_eyes(dir) {
        const tiles = [ 32, 34, 36, 38 ];
        const spr = this.ghost_sprite();
        spr.tile = tiles[dir];
        spr.color = COLOR_EYES;
        spr.flipx = false;
        spr.flipy = false;
    }

    update_sprite() {
        const sprite = this.ghost_sprite();
        if (!sprite.enabled)
            return;

        sprite.pos = this.actor_to_sprite_pos();
        // if Pacman has just died, hide ghosts
        if (Actor.game.freeze & FREEZETYPE.DEAD) {
            if (Actor.game.pacman.trig_pacman_eaten.after(PACMAN_EATEN_TICKS)) {
                sprite.tile = SPRITETILE_INVISIBLE;
            }
        }
        // if Pacman has won the round, hide ghosts
        else if (Actor.game.freeze & FREEZETYPE.WON) {
            sprite.tile = SPRITETILE_INVISIBLE;
        }
        else {
            switch (this.state) {
                case GHOSTSTATE.EYES:
                    if (this.trig_eaten.before(GHOST_EATEN_FREEZE_TICKS)) {
                        // if the ghost was *just* eaten by Pacman, the ghost's sprite
                        // is replaced with a score number for a short time
                        // (200 for the first ghost, followed by 400, 800 and 1600)
                        sprite.tile = SPRITETILE_SCORE_200 + Actor.game.num_ghosts_eaten - 1;
                        sprite.color = COLOR_GHOST_SCORE;
                    }
                    else {
                        // afterwards, the ghost's eyes are shown, heading back to the ghost house
                        this.spr_anim_ghost_eyes(this.next_dir);
                    }
                    break;
                case GHOSTSTATE.ENTERHOUSE:
                    // ...still show the ghost eyes while entering the ghost house
                    this.spr_anim_ghost_eyes(this.dir);
                    break;
                case GHOSTSTATE.FRIGHTENED:
                    // when inside the ghost house, show the normal ghost images
                    // (FIXME: ghost's inside the ghost house also show the
                    // frightened appearance when Pacman has eaten an energizer pill)
                    this.spr_anim_ghost_frightened();
                    break;
                default:
                    // show the regular ghost sprite image, the ghost's
                    // 'next_dir' is used to visualize the direction the ghost
                    // is heading to, this has the effect that ghosts already look
                    // into the direction they will move into one tile ahead
                    this.spr_anim_ghost(this.next_dir);
                    break;
            }
        }
    }
}



class GhostBlinky extends Ghost {
    constructor() {
        super();
    }

    ghost_sprite() {
        return gfx.sprite[SPRITE.BLINKY];
    }

    ghost_color() {
        return COLOR_BLINKY;
    }

    // Blinky starts outside the ghost house, looking to the left, and in scatter mode
    init() {
        super.init();

        this.dir = DIR.LEFT;
        this.pos = ghost_starting_pos[GHOSTTYPE.BLINKY];
        this.type = GHOSTTYPE.BLINKY;
        this.next_dir = this.dir;
        this.state = GHOSTSTATE.SCATTER;
        this.dot_counter = 0;
        this.dot_limit = 0;

        const sprite = this.ghost_sprite();
        sprite.enabled= true;
        sprite.color = COLOR_BLINKY;
    }

    scatter_target() {
        return ghost_scatter_targets[GHOSTTYPE.BLINKY];
    }

    chase_target() {
        // Blinky directly chases Pacman
        const pm = Actor.game.pacman;
        const pm_pos = pixel_to_tile_pos(pm.pos);
        return pm_pos;
    }

    house_target() {
        return ghost_house_target_pos[GHOSTTYPE.BLINKY];
    }

    check_global_dot_counter() {
        return this.state;
    }
}



class GhostPinky extends Ghost {
    constructor() {
        super();
    }

    ghost_sprite() {
        return gfx.sprite[SPRITE.PINKY];
    }

    ghost_color() {
        return COLOR_PINKY;
    }

    // Pinky starts in the middle slot of the ghost house, moving down
    init() {
        super.init();

        this.dir = DIR.DOWN;
        this.pos = ghost_starting_pos[GHOSTTYPE.PINKY];
        this.type = GHOSTTYPE.PINKY;
        this.next_dir = this.dir;
        this.state = GHOSTSTATE.HOUSE;
        this.dot_counter = 0;
        this.dot_limit = 0;

        const sprite = this.ghost_sprite();
        sprite.enabled= true;
        sprite.color = COLOR_PINKY;
    }

    scatter_target() {
        return ghost_scatter_targets[GHOSTTYPE.PINKY];
    }

    chase_target() {
        // Pinky target is 4 tiles ahead of Pacman
        // FIXME: does not reproduce 'diagonal overflow'
        const pm = Actor.game.pacman;
        const pm_pos = pixel_to_tile_pos(pm.pos);
        const pm_dir = DIR_VEC[pm.dir];
        return add_i2(pm_pos, mul_i2(pm_dir, 4));
    }

    house_target() {
        return ghost_house_target_pos[GHOSTTYPE.PINKY];
    }

    check_global_dot_counter() {
        if (Actor.game.global_dot_counter == 7) {
            return GHOSTSTATE.LEAVEHOUSE;
        }
        return this.state;
    }
}



class GhostInky extends Ghost {
    constructor() {
        super();
    }

    ghost_sprite() {
        return gfx.sprite[SPRITE.INKY];
    }

    ghost_color() {
        return COLOR_INKY;
    }

    // Inky starts in the left slot of the ghost house moving up
    init() {
        super.init();

        this.dir = DIR.UP;
        this.pos = ghost_starting_pos[GHOSTTYPE.INKY];
        this.type = GHOSTTYPE.INKY;
        this.next_dir = this.dir;
        this.state = GHOSTSTATE.HOUSE;
        this.dot_counter = 0;
        this.dot_limit = 30; // FIXME: needs to be adjusted by current round!

        const sprite = this.ghost_sprite();
        sprite.enabled= true;
        sprite.color = COLOR_INKY;
    }

    scatter_target() {
        return ghost_scatter_targets[GHOSTTYPE.INKY];
    }

    chase_target() {
        // Inky targets an extrapolated pos along a line two tiles
        // ahead of Pacman through Blinky
        // target = blinky_pos + ((pm_pos + pm_dir * 2) - blinky_pos) * 2
        const pm = Actor.game.pacman;
        const pm_pos = pixel_to_tile_pos(pm.pos);
        const pm_dir = DIR_VEC[pm.dir];
        const blinky_pos = pixel_to_tile_pos(Actor.game.blinky.pos);
        const p = add_i2(pm_pos, mul_i2(pm_dir, 2));
        const d = sub_i2(p, blinky_pos);
        return add_i2(blinky_pos, mul_i2(d, 2));
    }

    house_target() {
        return ghost_house_target_pos[GHOSTTYPE.INKY];
    }

    check_global_dot_counter() {
        if (Actor.game.global_dot_counter == 17) {
            return GHOSTSTATE.LEAVEHOUSE;
        }
        return this.state;
    }
}



class GhostClyde extends Ghost {
    constructor() {
        super();
    }

    ghost_sprite() {
        return gfx.sprite[SPRITE.CLYDE];
    }

    ghost_color() {
        return COLOR_CLYDE;
    }

    // Clyde starts in the right slot of the ghost house, moving up
    init() {
        super.init();

        this.dir = DIR.UP;
        this.pos = ghost_starting_pos[GHOSTTYPE.CLYDE];
        this.type = GHOSTTYPE.CLYDE;
        this.next_dir = this.dir;
        this.state = GHOSTSTATE.HOUSE;
        this.dot_counter = 0;
        this.dot_limit = 60; // FIXME: needs to be adjusted by current round!

        const sprite = this.ghost_sprite();
        sprite.enabled= true;
        sprite.color = COLOR_CLYDE;
    }

    scatter_target() {
        return ghost_scatter_targets[GHOSTTYPE.CLYDE];
    }

    chase_target() {
        // if Clyde is far away from Pacman, he chases Pacman,
        // but if close he moves towards the scatter target
        const pm = Actor.game.pacman;
        const pm_pos = pixel_to_tile_pos(pm.pos);
        if (squared_distance_i2(pixel_to_tile_pos(this.pos), pm_pos) > 64) {
            return pm_pos;
        }
        else {
            return ghost_scatter_targets[GHOSTTYPE.CLYDE];
        }
    }

    house_target() {
        return ghost_house_target_pos[GHOSTTYPE.CLYDE];
    }

    check_global_dot_counter() {
        if (Actor.game.global_dot_counter == 32) {
            // NOTE that global dot counter is deactivated if (and only if) Clyde
            // is in the house and the dot counter reaches 32
            Actor.game.global_dot_counter_active = false;
            return GHOSTSTATE.LEAVEHOUSE;
        }
        return this.state;
    }
}