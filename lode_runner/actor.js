"use strict"

class Actor {
    static MOVE = {
        NONE:0, RUN_LEFT:1, RUN_RIGHT:2, CLIMB_UP:3, CLIMB_DOWN:4, FALL_DOWN:5,
        // hero's moves
        DIG_LEFT:6, DIG_RIGHT:7,
        // guard's moves
        RESPAWN:8, IN_HOLE:9, SHAKE_LEFT:10, SHAKE_RIGHT:11, BIRTH0:12, BIRTH1:13, BIRTH2:14
    };

    constructor(stage) {
        this.stage = stage;
        this.moveToTile(0,0);
        this.goldCount = 0;
    }

    moveToTile(xTile, yTile) {
        this.xTile = xTile;
        this.yTile = yTile;
        this.lookLeft = false;
        this.xAdjust = 0;
        this.yAdjust = 0;
        this.currentMove = Actor.MOVE.NONE;
    }

    /** Check if this character should fall */
    shouldFall() {
        const currentType = this.stage.getTileBehavior(this.xTile, this.yTile);
        const bottomType = this.stage.getTileBehavior(this.xTile, this.yTile + 1);

        // no fall if on a ladder or on a rope at exact sprite row (ie, yAdjust == 0)
        if (currentType == Stage.TILE.LADDER ||
            (currentType == Stage.TILE.BAR && this.yAdjust == 0))
        {
            return false;
        }

        // fall if slightly above the sprite row (ie, yAdjust < 0)
        if (this.yAdjust < 0)
            return true;

        // Don't fall if standing on brick, or concrete, or at the top of a ladder
        if (bottomType == Stage.TILE.BLOCK ||
            bottomType == Stage.TILE.SOLID ||
            bottomType == Stage.TILE.LADDER)
        {
            return false;
        }

        return true;
    }

    /** Take the chest at this character's tile position */
    takeChest() {
        if (this.stage.getTileType(this.xTile, this.yTile) == Stage.TILE.GOLD &&
            this.xAdjust == 0 && this.yAdjust == 0)
        {
            this.goldCount++;
            this.stage.setTileType(this.xTile, this.yTile, Stage.TILE.EMPTY);
            return true;
        }
        return false;
    }

    /** Check if this character can perform a given move */
    canMoveTo(x, y, move) {
        switch (move) {
        case Actor.MOVE.RUN_LEFT:
        case Actor.MOVE.RUN_RIGHT:
        {
            // Can't run into brick, trap or concrete
            const nextType = this.stage.getTileBehavior(x, y);
            return (nextType != Stage.TILE.BLOCK
                && nextType != Stage.TILE.TRAP
                && nextType != Stage.TILE.SOLID);
        }
        case Actor.MOVE.CLIMB_UP:
        {
            // Need a ladder to climb up. Can't climb up into brick, trap or concrete 
            const center = this.stage.getTileBehavior(x, y);
            const bottom = this.stage.getTileBehavior(x, y + 1);
            return (bottom == Stage.TILE.LADDER
                && center != Stage.TILE.BLOCK
                && center != Stage.TILE.TRAP
                && center != Stage.TILE.SOLID);
        }
        case Actor.MOVE.CLIMB_DOWN:
        {
            // This move can also be used to force this character to fall (eg. from a rope)
            // Can't climb down (or fall down) into brick or concrete (but trap is OK).
            const center = this.stage.getTileBehavior(x, y);
            return (center != Stage.TILE.BLOCK
                && center != Stage.TILE.SOLID);
        }
        case Actor.MOVE.DIG_LEFT:
        case Actor.MOVE.DIG_RIGHT:
        {
            const center = this.stage.getTileBehavior(x, y);
            const top = this.stage.getTileBehavior(x, y - 1);
            const topType = this.stage.getTileType(x, y - 1);
            const isGuardAt = this.stage.isGuardAt(x, y - 1);

            return (center == Stage.TILE.BLOCK &&
                top == Stage.TILE.EMPTY &&
                topType != Stage.TILE.GOLD &&
                !isGuardAt);
        }
        default:
            return false;
        }
    }
}