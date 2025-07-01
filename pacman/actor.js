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
    }

    init() {
        this.dir = DIR.LEFT; // start direction
        this.pos = i2(14*8, 26*8+4); // start positioin

        const SPRITE_PACMAN = 0;
        const sprite = gfx.sprite[SPRITE_PACMAN];
        sprite.enabled= true;
        sprite.color = COLOR_PACMAN;
        Actor.game.input_dir = DIR.LEFT;
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
                const test_pos = pixel_to_tile_pos(add_i2(this.pos, i2(Math.floor(TILE_WIDTH/2), 0)));
                if (equal_i2(test_pos, i2(14, 20))) {
                    Actor.game.trig_fruit_eaten.start();
                    const score = levelspec(Actor.game.round).bonus_score;
                    Actor.game.score += score;
                    gfx.vid_fruit_score(Actor.game.active_fruit);
                    Actor.game.active_fruit = FRUIT.NONE;
                    //snd_start(2, &snd_eatfruit);
                }
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
        this.trig_frightened;
        this.trig_eaten;
        this.dot_counter;
        this.dot_limit;
    }

    // set sprite to animated ghost
    spr_anim_ghost(ghost_type) {
        const tiles = [
            [ 32, 33 ], // right
            [ 34, 35 ], // down
            [ 36, 37 ], // left
            [ 38, 39 ], // up
        ];
        const spr = gfx.sprite[ghost_type+1];
        const phase = Math.floor(this.anim_tick / 8) & 1;
        spr.tile = tiles[this.dir][phase];
        spr.color = COLOR_BLINKY + 2 * ghost_type;
        spr.flipx = false;
        spr.flipy = false;
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
                if (nearequal_i2(this.pos, ghost_house_target_pos[this.type], 1)) {
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
                    if ((this.type == GHOSTTYPE.PINKY) && (Actor.game.global_dot_counter == 7)) {
                        new_state = GHOSTSTATE.LEAVEHOUSE;
                    }
                    else if ((this.type == GHOSTTYPE.INKY) && (Actor.game.global_dot_counter == 17)) {
                        new_state = GHOSTSTATE.LEAVEHOUSE;
                    }
                    else if ((this.type == GHOSTTYPE.CLYDE) && (Actor.game.global_dot_counter == 32)) {
                        new_state = GHOSTSTATE_LEAVEHOUSE;
                        // NOTE that global dot counter is deactivated if (and only if) Clyde
                        // is in the house and the dot counter reaches 32
                        Actor.game.global_dot_counter_active = false;
                    }
                }
                else if (this.dot_counter == this.dot_limit) {
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
                    // a ghost that was eaten is immune to frighten until Pacman eats enother pill
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
                    this.next_dir = DIR_UP;
                }
                else if (pos.y < mid_y) {
                    this.next_dir = DIR_DOWN;
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
            const pos = this.actor.pos;
            const tile_pos = pixel_to_tile_pos(pos);
            const tgt_pos = ghost_house_target_pos[this.type];
            if (tile_pos.y == 14) {
                if (pos.x != ANTEPORTAS_X) {
                    this.next_dir = (pos.x < ANTEPORTAS_X) ? DIR_RIGHT:DIR_LEFT;
                }
                else {
                    this.next_dir = DIR_DOWN;
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
}



class GhostBlinky extends Ghost {
    constructor() {
        super();
    }

    init() {
        this.dir = DIR.LEFT;
        this.pos = ghost_starting_pos[GHOSTTYPE.BLINKY];
        this.type = GHOSTTYPE.BLINKY;
        this.next_dir = DIR.LEFT;
        this.state = GHOSTSTATE.SCATTER;
        this.trig_frightened = new Trigger();
        this.trig_eaten = new Trigger();
        this.dot_counter = 0;
        this.dot_limit = 0;

        const SPRITE_BLINKY = 1;
        const sprite = gfx.sprite[SPRITE_BLINKY];
        sprite.enabled= true;
        sprite.color = COLOR_BLINKY;
    }

    spr_anim_ghost() {
        super.spr_anim_ghost(GHOSTTYPE.BLINKY);
    }

    update_ghost_target() {
        let pos = this.target_pos;
        switch (this.state) {
            case GHOSTSTATE.SCATTER:
                // when in scatter mode, each ghost heads to its own scatter
                // target position in the playfield corners
                pos = ghost_scatter_targets[GHOSTTYPE.BLINKY];
                break;
            case GHOSTSTATE.CHASE:
                // when in chase mode, each ghost has its own particular
                // chase behaviour (see the Pacman Dossier for details)
                {
                    const pm = Actor.game.pacman;
                    const pm_pos = pixel_to_tile_pos(pm.pos);
                    const pm_dir = DIR_VEC[pm.dir];
                    pos = pm_pos;
                }
                break;
            case GHOSTSTATE_FRIGHTENED:
                // in frightened state just select a random target position
                // this has the effect that ghosts in frightened state
                // move in a random direction at each intersection
                pos = i2(xorshift32() % DISPLAY_TILES_X, xorshift32() % DISPLAY_TILES_Y);
                break;
            case GHOSTSTATE_EYES:
                // move towards the ghost house door
                pos = i2(13, 14);
                break;
            default:
                break;
        }
        this.target_pos = pos;
    }
}