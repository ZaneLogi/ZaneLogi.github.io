"use strict"

class Guard extends Actor {
    static HOLE_TIME = 30;  // waiting time before climbing the hole
    static SHAKE_START = 13;// when waiting time reaches to this value, the guard starts shaking
    static SHAKE_END = 7;   // when waiting time reaches to this value, the guard stop shaking
    static DEAD_TIME = 20;  // waiting time before rebirth
    static GOLD_TIME = 25;

    constructor(stage) {
        super(stage);

        this.countdownTimer;
        this.goldTimer;
        this.rebirth;

        /**
        * Is this vilain trapped in a digged hole?
        * - if currentMove equals MOVE_FALL_DOWN, he is falling into the hole
        * - if currentMove equals MOVE_NONE, he is already trapped inside the hole
        * - if currentMove equals MOVE_CLIMB_HOLE, he is climbing outside the hole
        */
        this.isTrapped;
        this.trapHoleX;
        this.trapHoleY;

        this.bestValue;
        this.bestMove;
    }

    moveToTile(x, y) {
        super.moveToTile(x, y);
        this.lookLeft = true;
        this.isTrapped = false;
    }

    update() {
        this.previousMove = this.currentMove;

        if (this.handleRebirth())
            return;

        if (this.handleInHole())
            return;

        // check if trapped
        if (this.currentMove == Actor.MOVE.FALL_DOWN) {
            if (this.stage.getTileType(this.xTile, this.yTile) == Stage.TILE.HOLE_EMPTY &&
                this.yAdjust == 0)
            {
                this.isTrapped = true;
                this.currentMove = Actor.MOVE.IN_HOLE;
                this.countdownTimer = Guard.HOLE_TIME;
                this.trapHoleX = this.xTile;
                this.trapHoleY = this.yTile;

                if (this.goldCount > 0 &&
                    this.stage.getTileType(this.xTile, this.yTile - 1) == Stage.TILE.EMPTY)
                {
                    this.stage.setTileType(this.xTile, this.yTile - 1, Stage.TILE.GOLD);
                    this.goldCount = 0;
                }
                return;
            }
        }

        // handle falling
        if (this.shouldFall()) {
            this.moveStep(Actor.MOVE.FALL_DOWN);
            this.currentMove = Actor.MOVE.FALL_DOWN;
            return;
        }

        const move = this.thinkMove();

        switch (move) {
        case Actor.MOVE.CLIMB_UP:
            if (this.yAdjust > 0 ||
                (this.canMoveTo(this.xTile, this.yTile - 1, Actor.MOVE.CLIMB_UP) &&
                 !this.stage.isGuardAt(this.xTile, this.yTile - 1)))
            {
                this.moveStep(Actor.MOVE.CLIMB_UP);
                this.currentMove = Actor.MOVE.CLIMB_UP;
                return;
            }
            break;
        case Actor.MOVE.CLIMB_DOWN:
            if (this.yAdjust < 0 ||
                (this.canMoveTo(this.xTile, this.yTile + 1, Actor.MOVE.CLIMB_DOWN) &&
                 !this.stage.isGuardAt(this.xTile, this.yTile + 1)))
            {
                this.moveStep(Actor.MOVE.CLIMB_DOWN);
                this.currentMove = Actor.MOVE.CLIMB_DOWN;
                return;
            }
            break;
        case Actor.MOVE.RUN_LEFT:
            if (this.xAdjust > 0 ||
                (this.canMoveTo(this.xTile - 1, this.yTile, Actor.MOVE.RUN_LEFT) &&
                 !this.stage.isGuardAt(this.xTile - 1, this.yTile)))
            {
                this.moveStep(Actor.MOVE.RUN_LEFT);
                this.currentMove = Actor.MOVE.RUN_LEFT;
                this.lookLeft = true;
                return;
            }
            break;
        case Actor.MOVE.RUN_RIGHT:
            if (this.xAdjust < 0 ||
                (this.canMoveTo(this.xTile + 1, this.yTile, Actor.MOVE.RUN_RIGHT) &&
                 !this.stage.isGuardAt(this.xTile + 1, this.yTile)))
            {
                this.moveStep(Actor.MOVE.RUN_RIGHT);
                this.currentMove = Actor.MOVE.RUN_RIGHT;
                this.lookLeft = false;
                return;
            }
            break;
        }
    }

    moveStep(move) {
        let centerX = Stage.TILE.NONE; // used to adjust the center of the horizontal when the hero is moving vertically
        let centerY = Stage.TILE.NONE; // used to adjust the cetner of the vertical when the hero is mvoing horizontally

        switch (move) {
        // the hero is moving vertically
        case Actor.MOVE.CLIMB_UP:
        case Actor.MOVE.CLIMB_DOWN:
        case Actor.MOVE.FALL_DOWN:
            if (this.xAdjust < 0) // the guard is at the left side of the center, move the guard right
                centerX = Actor.MOVE.RUN_RIGHT;
            else if (this.xAdjust > 0) // the guard is at the right side of the center, move the guard left
                centerX = Actor.MOVE.RUN_LEFT;
            break;
        // the hero is moving horizontally
        case Actor.MOVE.RUN_LEFT:
        case Actor.MOVE.RUN_RIGHT:
            if (this.yAdjust < 0) // the guard is above the center, move the hero down
                centerY = Actor.MOVE.CLIMB_DOWN;
            else if (this.yAdjust > 0) // the guard is below the center, move the hero up
                centerY = Actor.MOVE.CLIMB_UP;
            break;
        case Actor.MOVE.RESPAWN: // TODO: check if it is used
        case Actor.MOVE.IN_HOLE:
            // force the character in the center of the position
            this.xAdjust = 0;
            this.yAdjust = 0;
            break;
        }

        if (move == Actor.MOVE.CLIMB_UP || centerY == Actor.MOVE.CLIMB_UP) {
            if (this.yAdjust <= -2) {
                this.dropChest();
                this.yTile--;
                this.yAdjust = 2;
            }
            else {
                this.yAdjust--;
            }
        }

        if (move == Actor.MOVE.CLIMB_DOWN ||
            move == Actor.MOVE.FALL_DOWN ||
            centerY == Actor.MOVE.CLIMB_DOWN)
        {
            if (this.yAdjust >= 2) {
                this.dropChest();
                this.yTile++;
                this.yAdjust = -2;
            }
            else {
                this.yAdjust++;
            }
        }

        if (move == Actor.MOVE.RUN_LEFT || centerX == Actor.MOVE.RUN_LEFT) {
            if (this.xAdjust <= -2) {
                this.dropChest();
                this.xTile--;
                this.xAdjust = 3;
            }
            else {
                this.xAdjust--;
            }
        }

        if (move == Actor.MOVE.RUN_RIGHT || centerX == Actor.MOVE.RUN_RIGHT) {
            if (this.xAdjust >= 3) {
                this.dropChest();
                this.xTile++;
                this.xAdjust = -2;
            }
            else {
                this.xAdjust++;
            }
        }

        this.takeChest();
    }

    handleRebirth() {
        if (!this.rebirth)
            return false;

        --this.countdownTimer;
        if (this.countdownTimer > 19)
            this.currentMove = Actor.MOVE.BIRTH0;
        else if (this.countdownTimer > 10)
            this.currentMove = Actor.MOVE.BIRTH1;
        else if (this.countdownTimer > 0)
            this.currentMove = Actor.MOVE.BIRTH2;
        else {
            this.rebirth = false;
            this.currentMove = Actor.MOVE.FALL_DOWN;
        }

        return true;
    }

    handleInHole() {
        if (!this.isTrapped)
            return false;

        if (--this.countdownTimer <= Guard.SHAKE_START) {
            if (this.countdownTimer > Guard.SHAKE_END) {
                this.currentMove = (this.countdownTimer % 2)
                    ? Actor.MOVE.SHAKE_LEFT : Actor.MOVE.SHAKE_RIGHT;
            }
            else if (this.countdownTimer <= 0) {
                if (this.yTile == this.trapHoleY) {
                    // climb out
                    const top = this.stage.getTileBehavior(this.xTile, this.yTile - 1);
                    if (top != Stage.TILE.BLOCK && top != Stage.TILE.SOLID) {
                        this.moveStep(Actor.MOVE.CLIMB_UP);
                        this.currentMove = Actor.MOVE.CLIMB_UP;
                    }
                }
                else if (this.xTile == this.trapHoleX) {
                    const move = this.thinkMove();
                    if (move == Actor.MOVE.RUN_LEFT)
                        this.lookLeft = true;
                    else if (move == Actor.MOVE.RUN_RIGHT)
                        this.lookLeft = false;

                    const left = this.stage.getTileBehavior(this.xTile - 1, this.yTile);
                    const right = this.stage.getTileBehavior(this.xTile + 1, this.yTile);
                    if (this.lookLeft && (left == Stage.TILE.BLOCK || left == Stage.TILE.SOLID))
                        this.lookLeft = false;
                    if (!this.lookLeft && (right == Stage.TILE.BLOCK || right == Stage.TILE.SOLID))
                        this.lookLeft = true;

                    if (this.lookLeft && left != Stage.TILE.BLOCK && left != Stage.TILE.SOLID) {
                        this.moveStep(Actor.MOVE.RUN_LEFT);
                        this.currentMove = Actor.MOVE.RUN_LEFT;
                    }
                    else if (!this.lookLeft && right != Stage.TILE.BLOCK && right != Stage.TILE.SOLID) {
                        this.moveStep(Actor.MOVE.RUN_RIGHT);
                        this.currentMove = Actor.MOVE.RUN_RIGHT;
                    }
                    else
                    {
                        this.isTrapped = false; // no way to go, and not trapped.
                    }
                }
                else {
                    this.isTrapped = false; // not trapped and not on the top of the hole
                }
            }
        }

        return true;
    }

    respawn() {
        // scan the possible position to spawn the guard
        const first_rnd = random.rnd();
        let x = first_rnd;
        let y = 1;
        while (this.stage.getTileType(x, y) != Stage.TILE.EMPTY) {
            x = random.rnd();
            if (x == first_rnd) {
                y++;
                if (y > Stage.STAGE_YMAX) {
                    y--; // keep y on the screen
                    break;
                }
            }
        }

        this.moveToTile(x, y);

        this.countdownTimer = Guard.DEAD_TIME;
        this.currentMove = Actor.MOVE.BIRTH0;
        this.rebirth = true;
        this.goldCount = 0; // lost gold if it owns, stage.update() handles this case
    }

    takeChest() {
        const rand = random.rnd();

        const center = this.stage.getTileType(this.xTile, this.yTile);
        if (center == Stage.TILE.GOLD &&
            this.xAdjust == 0 && this.yAdjust == 0 &&
            this.goldCount == 0 && rand < 14)
        {
            this.goldCount++;
            this.goldTimer = Guard.GOLD_TIME + rand;
            this.stage.setTileType(this.xTile, this.yTile, Stage.TILE.EMPTY);
            return true;
        }
        return false;
    }

    /**
    * Drop this vilain's chest, if any, at current tile position, if empty.
    * - always, if falling into a hole
    * - at random, if otherwise standing on brick, concrete or on top of a ladder
    */
    dropChest() {
        if (this.goldCount == 0 || --this.goldTimer > 0 )
            return;

        const center = this.stage.getTileType(this.xTile, this.yTile);
        const bottom = this.stage.getTileBehavior(this.xTile, this.yTile + 1);

        if (!this.isTrapped &&
            this.goldCount > 0 &&
            this.currentMove != Actor.MOVE.FALL_DOWN &&
            center == Stage.TILE.EMPTY &&
            (bottom == Stage.TILE.BLOCK || bottom == Stage.TILE.SOLID || bottom == Stage.TILE.LADDER))
        {
            this.goldCount--;
            this.stage.setTileType(this.xTile, this.yTile, Stage.TILE.GOLD);
        }
    }

    /**
    * Check if this guard should fall.
    * - a guard trapped into a digged hole doesn't fall further down
    * - a guard on top of another trapped guard doesn't fall further down
    */
    shouldFall() {
        return super.shouldFall() &&
            !this.isTrapped &&
            !(this.stage.isGuardAt(this.xTile, this.yTile + 1) &&
            this.stage.getTileBehavior(this.xTile, this.yTile + 1) == Stage.EMPTY);
    }

    thinkMove() {
        const hero = this.stage.hero;
        const heroX = hero.xTile;
        const heroY = hero.yTile;

        if (this.yTile == heroY) {
            // at the same level
            let x = this.xTile;
            const dir = this.xTile < heroX ? 1 : -1;
            while (x != heroX) {
                const center = this.stage.getTileBehavior(x, this.yTile);
                const bottom = this.stage.getTileBehavior(x, this.yTile + 1, true);

                // scan for a path ignoring walls, only check if can stay at the position, no check blocking
                if (center == Stage.TILE.LADDER ||
                    center == Stage.TILE.BAR ||
                    bottom == Stage.TILE.BLOCK ||
                    bottom == Stage.TILE.SOLID ||
                    bottom == Stage.TILE.LADDER ||
                    this.stage.isGuardAt(x, this.yTile + 1))
                {
                    x += dir;
                }
                else
                    break;
            }

            if (x == heroX)  {
                // finding a path ignoring walls is succeeded.
                if (this.xTile < heroX)
                    return Actor.MOVE.RUN_RIGHT;
                else if (this.xTile > heroX)
                    return Actor.MOVE.RUN_LEFT;
                else if (this.xAdjust < hero.xAdjust)
                    return Actor.MOVE.RUN_RIGHT;
                else
                    return Actor.MOVE.RUN_LEFT;
            }
        }

        // not the same level or not reachable
        return this.scanFloor();
    }

    scanFloor() {
        this.bestValue = 99999;
        this.bestMove = Actor.MOVE.NONE;

        let leftEnd = this.xTile;
        let rightEnd = this.xTile;
        const y = this.yTile;

        // get the left-most postion that can reach
        while (leftEnd > Stage.STAGE_XMIN) {
            const center = this.stage.getTileBehavior(leftEnd - 1, y);
            if (center == Stage.TILE.BLOCK || center == Stage.TILE.SOLID)
                break; // blocked, can't move anymore, stop checking

            const bottom = this.stage.getTileBehavior(leftEnd - 1, y + 1, true);
            if (center == Stage.TILE.LADDER ||
                center == Stage.TILE.BAR ||
                bottom == Stage.TILE.BLOCK ||
                bottom == Stage.TILE.SOLID ||
                bottom == Stage.TILE.LADDER)
            {
                --leftEnd; // can stay at, check next
            }
            else {
                --leftEnd; // can't stay at, but can reach and will fall, stop checking
                break;
            }
        }

        // get the right-most position that can reach
        while (rightEnd < Stage.STAGE_XMAX) {
            const center = this.stage.getTileBehavior(rightEnd + 1, y);
            if (center == Stage.TILE.BLOCK || center == Stage.TILE.SOLID)
                break; // blocked, can't move anymore, stop checking

            const bottom = this.stage.getTileBehavior(rightEnd + 1, y + 1, true);
            if (center == Stage.TILE.LADDER ||
                center == Stage.TILE.BAR ||
                bottom == Stage.TILE.BLOCK ||
                bottom == Stage.TILE.SOLID ||
                bottom == Stage.TILE.LADDER)
            {
                ++rightEnd; // can stay at, check next
            }
            else {
                ++rightEnd; // can't stay at, but can reach and will fall, stop checking
                break;
            }
        }

        // scan the current vertical line (up/down directions)
        if (this.canMoveTo(this.xTile, this.yTile + 1, Actor.MOVE.CLIMB_DOWN))
            this.scanDown(this.xTile, Actor.MOVE.CLIMB_DOWN);

        if (this.canMoveTo(this.xTile, this.yTile - 1, Actor.MOVE.CLIMB_UP))
            this.scanUp(this.xTile, Actor.MOVE.CLIMB_UP);

        let move = Actor.MOVE.RUN_LEFT;
        // scan the left & right sides
        for (let x = leftEnd; x <= rightEnd; x++) {
            if (x == this.xTile) {
                move = Actor.MOVE.RUN_RIGHT;
                continue;
            }

            if (this.canMoveTo(x, this.yTile + 1, Actor.MOVE.CLIMB_DOWN))
                this.scanDown(x, move);

            if (this.canMoveTo(x, this.yTile - 1, Actor.MOVE.CLIMB_UP))
                this.scanUp(x, move);
        }

        return this.bestMove;
    }

    scanUp(x, desireMove) {
        const hero = this.stage.hero;
        const heroY = hero.yTile;

        // seach up until it can move horizontally and above hero's position
        let y = this.yTile;

        while (y > Stage.STAGE_YMIN && this.stage.getTileBehavior(x, y) == Stage.LADDER) {
            // can go up
            y--;

            if (x > Stage.STAGE_XMIN) {
                // if not at left edge check left side
                const center = this.stage.getTileBehavior(x - 1, y);
                const bottom = this.stage.getTileBehavior(x - 1, y + 1, true);
                if (bottom == Stage.TILE.BLOCK || bottom == Stage.TILE.SOLID || bottom == Stage.TILE.LADDER ||
                    center == Stage.TILE.LADDER || center == Stage.TILE.BAR)
                {
                    // can move left, ignroe walls
                    if (y <= heroY)
                        // above hero
                        break;
                }
            }

            if (x < Stage.STAGE_XMAX) {
                // if not at right edge check right side
                const center = this.stage.getTileBehavior(x + 1, y);
                const bottom = this.stage.getTileBehavior(x + 1, y + 1, true);
                if (bottom == Stage.TILE.BLOCK || bottom == Stage.TILE.SOLID || bottom == Stage.TILE.LADDER ||
                    center == Stage.TILE.LADDER || center == Stage.TILE.BAR)
                {
                    // can move right, ignroe walls
                    if (y <= heroY)
                        // above hero
                        break;
                }
            }
        }

        let value = 200; // 0: best, 100:mid, 200:worse
        if (y == heroY) // same level
        {
            value = Math.abs(this.xTile - x);
            // two version:
            // abs(hero.xTile - x): the guard will try to run at the same x position as possible then run to the hero vertically
            // abs(this.xTile - x): the guard will try to run at the same y position as possible then run to the hero horizontally
        }
        else if (y > heroY) // below hero
        {
            value = y - heroY + 200;
        }
        else // over hero
        {
            value = heroY - y + 100;
        }    

        if (value < this.bestValue) {
            this.bestValue = value;
            this.bestMove = desireMove;
        }
    }

    scanDown(x, desireMove) {
        const hero = this.stage.hero;
        const heroY = hero.yTile;

        // seach down until it can move horizontally and below hero's position
        let y = this.yTile;

        while (y < Stage.STAGE_YMAX) {
            const bottom = this.stage.getTileBehavior(x, y + 1);
            if (bottom == Stage.TILE.BLOCK || bottom == Stage.TILE.SOLID) {
                break; // can't go down
            }

            const center = this.stage.getTileBehavior(x, y);
            if (center == Stage.TILE.LADDER || center == Stage.TILE.BAR) {
                // if not falling...
                if (x > Stage.STAGE_XMIN) {
                    const bottom = this.stage.getTileBehavior(x - 1, y + 1, true);
                    const center = this.stage.getTileBehavior(x - 1, y);
                    if (bottom == Stage.TILE.BLOCK || bottom == Stage.TILE.SOLID || bottom == Stage.TILE.LADDER ||
                        center == Stage.TILE.LADDER || center == Stage.TILE.BAR)
                    {
                        // can move left
                        if (y >= heroY)
                            // below hero
                            break;
                    }
                }

                if (x < Stage.STAGE_XMAX) {
                    const bottom = this.stage.getTileBehavior(x + 1, y + 1, true);
                    const center = this.stage.getTileBehavior(x + 1, y);
                    if (bottom == Stage.TILE.BLOCK || bottom == Stage.TILE.SOLID || bottom == Stage.TILE.LADDER ||
                        center == Stage.TILE.LADDER || center == Stage.TILE.BAR)
                    {
                        // can move right
                        if (y >= heroY)
                            // below hero
                            break;
                    }
                }
            }
            y++;
        }

        let value = 200; // 0: best, 100:mid, 200:worse
        if (y == heroY) // same level
        {
            value = Math.abs(this.xTile - x);
            // two version:
            // abs(hero.xTile - x): the guard will try to run at the same x position as possible then run to the hero vertically
            // abs(this.xTile - x): the guard will try to run at the same y position as possible then run to the hero horizontally
        }
        else if (y > heroY) // below hero
        {
            value = y - heroY + 200;
        }
        else // over hero
        {
            value = heroY - y + 100;
        }

        if (value < this.bestValue) {
            this.bestValue = value;
            this.bestMove = desireMove;
        }
    }
}


const random = {
    ix: 0,
    random: 0,
    rnd_org: 0,

    delta: [7, 10, 1, 1, 17, 3, 23, 15]
};

random.rnd = function() {
    this.random += this.delta[this.ix];
    if (this.random > Stage.STAGE_XMAX)
        this.random -= Stage.STAGE_XMAX;
    if (this.random == this.rnd_org)
        this.ix = (this.ix + 1) % 7;
    return this.random;
}

random.reset = function() {
    this.rnd_org = (this.random &= 0xf);
}

random.startNewSequence = function() {
}