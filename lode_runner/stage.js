"use strict"
const level001 =
"                  S         " +
"    $             S         " +
"#######H#######   S         " +
"       H----------S    $    " +
"       H    ##H   #######H##" +
"       H    ##H          H  " +
"     0 H    ##H       $0 H  " +
"##H#####    ########H#######" +
"  H                 H       " +
"  H           0     H       " +
"#########H##########H       " +
"         H          H       " +
"       $ H----------H   $   " +
"    H######         #######H" +
"    H         &  $         H" +
"############################";

/* 
the guard update rate =
    sum(GUARD_MOVE_POLICY[guard count]) / ((guard count) * 4) per frame per gaurd
*/
const GUARD_MOVE_POLICY =
[
    [ 0, 0, 0, 0 ],
    [ 0, 1, 0, 1 ], // guard count = 1, ( 0 + 1 + 0 + 1 ) / (1 * 4) = 0.5
    [ 1, 1, 1, 1 ], // guard count = 2, ( 1 + 1 + 1 + 1 ) / (2 * 4) = 0.5
    [ 2, 1, 2, 1 ], // guard count = 3, ( 2 + 1 + 2 + 1 ) / (3 * 4) = 0.5
    [ 2, 2, 2, 2 ], // guard count = 4, ( 2 + 2 + 2 + 2 ) / (4 * 4) = 0.5
    [ 3, 2, 3, 2 ], // guard count = 5, ( 3 + 2 + 3 + 2 ) / (5 * 4) = 0.5
    [ 3, 3, 3, 3 ], // guard count = 6, ( 3 + 3 + 3 + 3 ) / (6 * 4) = 0.5
    [ 4, 3, 4, 3 ], // guard count = 7, ( 4 + 3 + 4 + 3 ) / (7 * 4) = 0.5
    [ 4, 4, 4, 4 ], // guard count = 8, ( 4 + 4 + 4 + 4 ) / (8 * 4) = 0.5
    [ 5, 4, 5, 4 ], // guard count = 9, ( 5 + 4 + 5 + 4 ) / (9 * 4) = 0.5
];

class Stage {
    static STAGE_WIDTH = 28;
    static STAGE_HEIGHT = 16;
    static STAGE_XMIN = 0;
    static STAGE_XMAX = Stage.STAGE_WIDTH - 1;
    static STAGE_YMIN = 0;
    static STAGE_YMAX = Stage.STAGE_HEIGHT - 1;

    static TILE = {
        EMPTY: 0, BLOCK: 1, SOLID: 2, LADDER: 3, BAR: 4, TRAP: 5, HLADR: 6, GOLD: 7, GUARD: 8, RUNNER: 9,
        GROUND: 10,
        OUTSIDE: 10,       /** Volatile tile type constant used for tiles out of stage boundaries */
        HOLE_FULL: 11,     /** Volatile tile type constant used for brick just being digged (still considered full) */
        HOLE_EMPTY: 12,    /** Volatile tile type constant used for brick completely digged (considered empty, can trap guards) */
    };

    static LEVEL_STATUS = { RUNNING:0, NEW_LEVEL:1, CAPTURED:2 };

    constructor() {
        this.map;

        this.hero;
        this.guards;
        this.holes;

        this.goldCount;
        this.exitEnabled;
        this.levelStatus;
        this.levelScore;
        this.guardMapIndex;
        this.guardLastGuardIndex;
    }

    buildLevelMap(levelMap) {
        this.goldCount = 0;
        this.exitEnabled = false;
        this.levelStatus = Stage.LEVEL_STATUS.RUNNING;
        this.levelScore = 0;
        this.hero = null;
        this.holes = [];
        this.guards = [];

        this.guardMapIndex = 0;
        this.lastGuardIndex = 0;

        this.map = [];
        let count = 0;
        let i = 0;
        let row = new Array(Stage.STAGE_WIDTH);
        for (const chr of levelMap) {
            switch (chr) {
                case " ": row[i] = Stage.TILE.EMPTY; break;
                case "#": row[i] = Stage.TILE.BLOCK; break;
                case "@": row[i] = Stage.TILE.SOLID; break;
                case "H": row[i] = Stage.TILE.LADDER; break;
                case "-": row[i] = Stage.TILE.BAR; break;
                case "X": row[i] = Stage.TILE.TRAP; break;
                case "S": row[i] = Stage.TILE.HLADR; break;
                case "$": row[i] = Stage.TILE.GOLD; this.goldCount++; break;
                case "0": row[i] = Stage.TILE.EMPTY;
                    {
                        const g = new Guard(this);
                        g.moveToTile(count % Stage.STAGE_WIDTH, Math.floor(count / Stage.STAGE_WIDTH));
                        this.guards.push(g);
                    }
                    break;
                case "&": row[i] = Stage.TILE.EMPTY;
                    {
                        this.hero = new Hero(this);
                        this.hero.moveToTile(count % Stage.STAGE_WIDTH, Math.floor(count / Stage.STAGE_WIDTH));
                    }
                    break;
                default: console.assert(false, chr); break;
            }

            count++;
            i++;
            if (count % Stage.STAGE_WIDTH == 0) {
                this.map.push(row);
                row = new Array(Stage.STAGE_WIDTH);
                i = 0;
            }
        }

        console.assert(this.map.length == Stage.STAGE_HEIGHT);
    }

    getTileType(x, y) {
        if (x < Stage.STAGE_XMIN || x > Stage.STAGE_XMAX || y < Stage.STAGE_YMIN || y > Stage.STAGE_YMAX)
            return Stage.TILE.OUTSIDE;
        return this.map[y][x];
    }

    setTileType(x, y, type) {
        if (x < Stage.STAGE_XMIN || x > Stage.STAGE_XMAX || y < Stage.STAGE_YMIN || y > Stage.STAGE_YMAX)
            return;
        this.map[y][x] = type;
    }

    getTileBehavior(x, y, forGuard) {
        const tile = this.getTileType(x, y);
        switch (tile) {
            case Stage.TILE.GOLD:
            case Stage.TILE.GUARD:
            case Stage.TILE.RUNNER:
            case Stage.TILE.HOLE_EMPTY:
                return forGuard ? Stage.TILE.BLOCK : Stage.TILE.EMPTY;
            case Stage.TILE.HOLE_FULL:
                return Stage.TILE.BLOCK;
            case Stage.TILE.OUTSIDE:
                return Stage.TILE.SOLID;
            case Stage.TILE.HLADR:
                return (this.exitEnabled ? Stage.TILE.LADDER : Stage.TILE.EMPTY);
            default:
                return tile;
        }
    }

    getTileAppearance(x, y) {
        const tile = this.getTileType(x, y);
        switch (tile) {
            case Stage.TILE.TRAP:
                return Stage.TILE.BLOCK;
            case Stage.TILE.GUARD:
            case Stage.TILE.RUNNER:
            case Stage.TILE.HOLE_FULL:
            case Stage.TILE.HOLE_EMPTY:
                return Stage.TILE.EMPTY;
            case Stage.TILE.HLADR:
                return (this.exitEnabled ? Stage.TILE.LADDER : Stage.TILE.EMPTY);
            default:
                return tile;
        }
    }

    addHole(x, y) {
        this.holes.push(new Hole(x, y));
    }

    /** Check if the given tile is occupied by a guard */
    isGuardAt(xTile, yTile, includeRespawning) {
        for (const guard of this.guards) {
            if (guard.xTile == xTile && guard.yTile == yTile &&
                (includeRespawning || guard.currentMove != Actor.MOVE.RESPAWN)) {
                return true;
            }
        }
        return false;
    }

    update() {
        if (this.levelStatus != Stage.LEVEL_STATUS.RUNNING)
            return;

        // update hero
        this.hero.update();
        const heroX = this.hero.xTile;
        const heroY = this.hero.yTile;
        this.exitEnabled = (this.goldCount == this.hero.goldCount);
        if (heroY == 0 && this.hero.yAdjust == 0 && this.exitEnabled) {
            this.levelStatus = Stage.LEVEL_STATUS.NEW_LEVEL;
            return;
        }

        // updat holes
        for (let i = this.holes.length - 1; i >= 0; i--) {
            const hole = this.holes[i];
            hole.update();
            if (hole.life == 0) {
                const x = hole.x;
                const y = hole.y;
                this.setTileType(hole.x, hole.y, Stage.TILE.BLOCK);

                this.holes.splice(i, 1);

                // check the hero
                if (this.hero.xTile == x && this.hero.yTile == y) {
                    this.levelStatus = Stage.LEVEL_STATUS.CAPTURED;
                    return;
                }

                // check guards
                for (const guard of this.guards) {
                    if (guard.xTile == x && guard.yTile == y) {
                        if (guard.goldCount > 0) {
                            --this.goldCount; // the guard died with a gold
                        }
                        // kill the guard and respawn it
                        guard.respawn();
                    }
                }

                // check golds, if a gold is buried, decrease the gold count 
                if (this.getTileType(x, y) == Stage.TILE.GOLD) {
                    --this.goldCount;
                }
            }
        }

        // update guards
        let moveCount = GUARD_MOVE_POLICY[this.guards.length][this.guardMapIndex];
        this.guardMapIndex = (this.guardMapIndex + 1) % GUARD_MOVE_POLICY[0].length;
        while (moveCount--) {
            const guard = this.guards[this.lastGuardIndex];
            guard.update();

            console.assert(guard.currentMove != undefined, "Guard erro %o", guard);

            this.lastGuardIndex = (this.lastGuardIndex + 1) % this.guards.length;

            if (heroX == guard.xTile && heroY == guard.yTile) {
                this.levelStatus = Stage.LEVEL_STATUS.CAPTURED;
                return;
            }
        }
    }
}