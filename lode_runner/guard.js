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
                this.currentMove = IN_HOLE;
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

        const move = this.bestMove(); // TODO: check function or variable?

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
                (this.canMoveTo(m_xTile, m_yTile + 1, Actor.MOVE.CLIMB_DOWN) &&
                 !this.stage.isGuardAt(m_xTile, m_yTile + 1)))
            {
                this.moveStep(Actor.MOVE.CLIMB_DOWN);
                this.currentMove = Actor.MOVE.CLIMB_DOWN;
                return;
            }
            break;
        case Actor.MOVE.RUN_LEFT:
            if (this.xAdjust > 0 ||
                (this.canMoveTo(m_xTile - 1, m_yTile, Actor.MOVE.RUN_LEFT) &&
                 !this.stage.isGuardAt(m_xTile - 1, m_yTile)))
            {
                this.moveStep(Actor.MOVE.RUN_LEFT);
                this.currentMove = Actor.MOVE.RUN_LEFT;
                this.lookLeft = true;
                return;
            }
            break;
        case Actor.MOVE.RUN_RIGHT:
            if (this.xAdjust < 0 ||
                (this.canMoveTo(m_xTile + 1, m_yTile, Actor.MOVE.RUN_RIGHT) &&
                 !this.stage.isGuardAt(m_xTile + 1, m_yTile)))
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
        const centerX = Stage.TILE.NONE; // used to adjust the center of the horizontal when the hero is moving vertically
        const centerY = Stage.TILE.NONE; // used to adjust the cetner of the vertical when the hero is mvoing horizontally

        switch (move) {
        // the hero is moving vertically
        case Actor.MOVE.CLIMB_UP:
        case Actor.MOVE.CLIMB_DOWN:
        case Actor.MOVE.FALL_DOWN:
            if (this.xAdjust < 0) // the hero is at the left side of the center, move the hero right
                centerX = Actor.MOVE.RUN_RIGHT;
            else if (this.xAdjust > 0) // the hero is at the right side of the center, move the hero left
                centerX = Actor.MOVE.RUN_LEFT;
            break;
        // the hero is moving horizontally
        case Actor.MOVE.RUN_LEFT:
        case Actor.MOVE.RUN_RIGHT:
            if (this.yAdjust < 0) // the hero is above the center, move the hero down
                centerY = Actor.MOVE.CLIMB_DOWN;
            else if (this.yAdjust > 0) // the hero is below the center, move the hero up
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
                m_yAdjust--;
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
            if (m_xAdjust <= -2) {
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
            this.currentMove = Stage.TILE.BIRTH0;
        else if (this.countdownTimer > 10)
            this.currentMove = Stage.TILE.BIRTH1;
        else if (this.countdownTimer > 0)
            this.currentMove = Stage.TILE.BIRTH2;
        else {
            this.rebirth = false;
            this.currentMove = Stage.TILE.FALL_DOWN;
        }

        return true;
    }

    handleInHole() {
/*
bool LodeRunnerGuard::handleInHole()
{
    if (!m_isTrapped)
        return false;

    if (--m_countdownTimer <= SHAKE_START)
    {
        if (m_countdownTimer > SHAKE_END)
        {
            m_currentMove = (m_countdownTimer % 2) ? SHAKE_LEFT : SHAKE_RIGHT;
        }
        else if (m_countdownTimer <= 0)
        {
            auto stage = m_stage.lock();
            if (!stage)
                return true;

            if (m_yTile == m_trapHoleY)
            {
                // climb out
                auto top = stage->getTileBehavior(m_xTile, m_yTile - 1);
                if (top != LodeRunnerStage::BLOCK && top != LodeRunnerStage::SOLID)
                {
                    moveStep(CLIMB_UP);
                    m_currentMove = CLIMB_UP;
                }
            }
            else if (m_xTile == m_trapHoleX)
            {
                MOVE move = bestMove();
                if (move == RUN_LEFT)
                    m_lookLeft = true;
                else if (move == RUN_RIGHT)
                    m_lookLeft = false;

                auto left = stage->getTileBehavior(m_xTile - 1, m_yTile);
                auto right = stage->getTileBehavior(m_xTile + 1, m_yTile);
                if (m_lookLeft && (left == LodeRunnerStage::BLOCK || left == LodeRunnerStage::SOLID))
                    m_lookLeft = false;
                if (!m_lookLeft && (right == LodeRunnerStage::BLOCK || right == LodeRunnerStage::SOLID))
                    m_lookLeft = true;

                if (m_lookLeft && left != LodeRunnerStage::BLOCK && left != LodeRunnerStage::SOLID)
                {
                    moveStep(RUN_LEFT);
                    m_currentMove = RUN_LEFT;
                }
                else if (!m_lookLeft && right != LodeRunnerStage::BLOCK && right != LodeRunnerStage::SOLID)
                {
                    moveStep(RUN_RIGHT);
                    m_currentMove = RUN_RIGHT;
                }
                else
                {
                    m_isTrapped = false; // no way to go, and not trapped.
                }
            }
            else
            {
                m_isTrapped = false; // not trapped and not on the top of the hole
            }
        }
    }

    return true;
}
*/
    }

    respawn() {
        // scan the possible position to spawn the guard
        const first_rnd = random.rnd();
        let x = first_rnd;
        const y = 1;
        while (this.stage.getTileType(x, y) != Stage.EMPTY) {
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
        this.currentMove = Stage.TILE.BIRTH0;
        this.rebirth = true;
        this.goldCount = 0; // lost gold if it owns
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
            center == Stage.xTile.EMPTY &&
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

    bestMove() {
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
/*
void LodeRunnerGuard::scanUp(int x, MOVE desireMove)
{
    auto stage = m_stage.lock();
    if (!stage)
        return;

    auto hero = stage->getHero();
    int heroX = hero->getXTile();
    int heroY = hero->getYTile();

    // seach up until it can move horizontally and above hero's position
    int y = m_yTile;

    while (y > LodeRunnerStage::STAGE_YMIN &&
        stage->getTileBehavior(x, y) == LodeRunnerStage::LADDER)
    {
        // can go up
        y--;

        if (x > LodeRunnerStage::STAGE_XMIN) // if not at left edge check left side
        {
            auto center = stage->getTileBehavior(x - 1, y);
            auto bottom = stage->getTileBehavior(x - 1, y + 1, true);
            if (bottom == LodeRunnerStage::BLOCK || bottom == LodeRunnerStage::SOLID || bottom == LodeRunnerStage::LADDER ||
                center == LodeRunnerStage::LADDER || center == LodeRunnerStage::BAR)
            {
                // can move left, ignroe walls
                if (y <= heroY)
                    // above hero
                    break;
            }
        }
        
        if (x < LodeRunnerStage::STAGE_XMAX) // if not at right edge check right side
        {
            auto center = stage->getTileBehavior(x + 1, y);
            auto bottom = stage->getTileBehavior(x + 1, y + 1, true);
            if (bottom == LodeRunnerStage::BLOCK || bottom == LodeRunnerStage::SOLID || bottom == LodeRunnerStage::LADDER ||
                center == LodeRunnerStage::LADDER || center == LodeRunnerStage::BAR)
            {
                // can move right, ignroe walls
                if (y <= heroY)
                    // above hero
                    break;
            }
        }
    }

    int value = 200; // 0: best, 100:mid, 200:worse
    if (y == heroY) // same level
    {
        value = abs(m_xTile - x);
        // two version:
        // abs(heroX - x):   the guard will try to run at the same x position as possible then run to the hero vertically
        // abs(m_xTile - x): the guard will try to run at the same y position as possible then run to the hero horizontally
    }
    else if (y > heroY) // below hero
    {
        value = y - heroY + 200;
    }
    else // over hero
    {
        value = heroY - y + 100;
    }    

    if (value < m_bestValue)
    {
        m_bestValue = value;
        m_bestMove = desireMove;
    }
}
*/
    }

    scanDown(x, desireMove) {
/*
void LodeRunnerGuard::scanDown(int x, MOVE desireMove)
{
    auto stage = m_stage.lock();
    if (!stage)
        return;

    auto hero = stage->getHero();
    int heroX = hero->getXTile();
    int heroY = hero->getYTile();

    // seach down until it can move horizontally and below hero's position
    int y = m_yTile;

    while (y < LodeRunnerStage::STAGE_YMAX)
    {
        auto bottom = stage->getTileBehavior(x, y + 1);
        if (bottom == LodeRunnerStage::BLOCK || bottom == LodeRunnerStage::SOLID)
        {
            break; // can't go down
        }

        auto center = stage->getTileBehavior(x, y);
        if (center == LodeRunnerStage::LADDER || center == LodeRunnerStage::BAR)
        {
            // if not falling...
            if (x > LodeRunnerStage::STAGE_XMIN)
            {
                auto bottom = stage->getTileBehavior(x - 1, y + 1, true);
                auto center = stage->getTileBehavior(x - 1, y);
                if (bottom == LodeRunnerStage::BLOCK || bottom == LodeRunnerStage::SOLID || bottom == LodeRunnerStage::LADDER ||
                    center == LodeRunnerStage::LADDER || center == LodeRunnerStage::BAR)
                {
                    // can move left
                    if (y >= heroY)
                        // below hero
                        break;
                }
            }

            if (x < LodeRunnerStage::STAGE_XMAX)
            {
                auto bottom = stage->getTileBehavior(x + 1, y + 1, true);
                auto center = stage->getTileBehavior(x + 1, y);
                if (bottom == LodeRunnerStage::BLOCK || bottom == LodeRunnerStage::SOLID || bottom == LodeRunnerStage::LADDER ||
                    center == LodeRunnerStage::LADDER || center == LodeRunnerStage::BAR)
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

    int value = 200; // 0: best, 100:mid, 200:worse
    if (y == heroY) // same level
    {
        value = abs(m_xTile - x);
        // two version:
        // abs(heroX - x):   the guard will try to run at the same x position as possible then run to the hero vertically
        // abs(m_xTile - x): the guard will try to run at the same y position as possible then run to the hero horizontally
    }
    else if (y > heroY) // below hero
    {
        value = y - heroY + 200;
    }
    else // over hero
    {
        value = heroY - y + 100;
    }

    if (value < m_bestValue)
    {
        m_bestValue = value;
        m_bestMove = desireMove;
    }
}
*/
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
    if (this.random == this.m_rnd_org)
        this.ix = (this.ix + 1) % 7;
    return this.random;
}

random.reset = function() {
    this.rnd_org = (this.random &= 0xf);
}

random.startNewSequence = function() {
}