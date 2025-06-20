const game = {
    canvas: null,
    canvas_ctx: null,
    window_width: 0,
    window_height: 0,
}

game.init = function () {
    this.canvas = document.querySelector('canvas');
    this.canvas_ctx = this.canvas.getContext('2d');
    this.window_width = this.canvas.width;
    this.window_height = this.canvas.height;

    function getRandomInt(max) {
        return Math.floor(Math.random() * max);
    }

    for (let y = 0; y < this.window_height; y += 8) {
        for (let x = 0; x < this.window_width; x += 8) {
            let r = getRandomInt(64);
            let g = getRandomInt(64);
            let b = getRandomInt(64);

            this.canvas_ctx.fillStyle = `rgb(${r} ${g} ${b})`
            this.canvas_ctx.fillRect(x, y, 8, 8);
        }
    }

    resource.init();

    this.drawSpriteList();

    this.currentSprite = 0;
    this.seqence = [
        0, 1, 2, 3, 4, 5, // degree 180 - 270
        6, 5, 4, 3, 2, 1, // degree 270 - 0
        0, 1, 2, 3, 4, 5, // degree 0 - 90
        6, 5, 4, 3, 2, 1, // degree 90 - 180
    ];

    this.path = new BezierPath()
    const curve = new BezierCurve({x:400, y:-10}, {x:400, y:-20}, {x:400, y: 30}, {x:400, y:20});
    this.path.addCurve(curve, 1);

    this.path.addCurve(new BezierCurve({x:400, y:20}, {x:400, y:100}, {x:75, y:325}, {x:75, y:425}), 25);
    this.path.addCurve(new BezierCurve({x:75, y:425}, {x:75, y:650}, {x:350, y:650}, {x:350, y:425}), 25);
    const path = this.path.doSampling();

    this.canvas_ctx.strokeStyle = 'green';
    this.canvas_ctx.lineWidth = 2;
    this.canvas_ctx.beginPath();
    this.canvas_ctx.moveTo(path[0].x, path[0].y);

    this.movement = [];
    this.movement[0] = {pt:path[0], dx:0, dy:0, steps:0};

    for (let i = 1; i < path.length; i++) {
        this.canvas_ctx.lineTo(path[i].x, path[i].y);

        const dirX = path[i].x - path[i-1].x;
        const dirY = path[i].y - path[i-1].y;
        const length = Math.hypot(dirX, dirY);

        const dx = dirX / length;
        const dy = dirY / length;

        this.movement[i-1].dx = dx;
        this.movement[i-1].dy = dy;
        this.movement[i-1].steps = length;

        // As the Y-axis increases downward and the X-axis increases to the right,
        // in this coordinate system, 0 degrees points to the right,
        // 90 degrees points downward, 180 degrees points to the left,
        // and 270 degrees points upward.

        let angle = NaN, mirrorX = false, mirrorY = false, seq = undefined;
        if (dx != NaN && dy != NaN) {
            angle = Math.atan2(dy, dx);
            if (angle != NaN) {
                angle = Math.floor(angle * 180 / Math.PI);
                if (angle < 0) {
                    angle += 360;
                }

                if (angle < 90) {
                    mirrorX = true; mirrorY = true; seq = Math.floor(angle/15);
                }
                else if (angle < 180) {
                    mirrorX = false; mirrorY = true; seq = 6 - Math.floor((angle-90)/15);
                }
                else if (angle < 270) {
                    mirrorX = false; mirrorY = false; seq = Math.floor((angle-180)/15);
                }
                else {
                    mirrorX = true; mirrorY = false; seq = 6 - Math.floor((angle-270)/15);
                }
            }
        }
        this.movement[i-1].angle = angle;
        this.movement[i-1].mirrorX = mirrorX;
        this.movement[i-1].mirrorY = mirrorY;
        this.movement[i-1].seq = seq;

        this.movement[i] = {pt:path[i], dx:0, dy:0, steps:0};
    }
    this.canvas_ctx.stroke();

    // initiate the movement
    this.moveSpeed = 15;
    this.currentWaypoint = 0;
    this.currentMove = this.movement[this.currentWaypoint];
    this.currentPt = this.currentMove.pt;
    this.currentSteps = 0;
    this.currentSeq = this.currentMove.seq;
    this.currentMirrorX = this.currentMove.mirrorX;
    this.currentMirrorY = this.currentMove.mirrorY;
    this.drawStep();

    runloop.start(() => this.doFrame(), 100);
}

game.drawSpriteList = function() {
    for (let sprIdx = 0; sprIdx < 16; sprIdx++) {
        const drawY = sprIdx * 32;
        for (let i = 0; i < 8; i++) {
            this.draw_sprite(i * 32, drawY, resource.spriteList[sprIdx * 8 + i], resource.palettes[9]);
        }
    }
}

game.drawRotatedSpriteList = function() {
    const ANIM_X = 256, ANIM_Y = 0;

    const spriteIndex = this.seqence[this.currentSprite];
    let mirrorX, mirrorY;

    // frome left to up, degree 180 - 270
    if (this.currentSprite < 6) {
        mirrorX = false; mirrorY = false;
    }
    // from up to right, degree 270 - 0
    else if (this.currentSprite < 12) {
        mirrorX = true; mirrorY = false;
    }
    // from right to down, degree 0 - 90
    else if (this.currentSprite < 18) {
        mirrorX = true; mirrorY = true;
    }
    // from down to left, degree 90 - 180
    else {
        mirrorX = false; mirrorY = true;
    }

    for (let i = 0; i < 16; i++) {
        this.draw_sprite(ANIM_X, ANIM_Y + i * 32, resource.spriteList[spriteIndex + i * 8], resource.palettes[2], mirrorX, mirrorY);
    }

    this.currentSprite = (this.currentSprite + 1) % this.seqence.length;
}

game.drawStep = function() {
    const sprIdx = 1;
    this.draw_sprite(this.currentPt.x-16, this.currentPt.y-16,
        resource.spriteList[sprIdx * 8 + this.currentSeq], resource.palettes[9],
        this.currentMirrorX, this.currentMirrorY
    );

    //this.canvas_ctx.fillStyle = `rgb(255 255 0)`;
    //this.canvas_ctx.fillRect(this.currentPt.x-1, this.currentPt.y-1, 3, 3);
}

game.draw_sprite_with_angle = function(x, y, spriteIdx, palIdx, angle) {
    let mirrorX = false, mirrorY = false, seq = undefined;

    if (angle < 90) {
        mirrorX = true; mirrorY = true; seq = Math.floor(angle/15);
    }
    else if (angle < 180) {
        mirrorX = false; mirrorY = true; seq = 6 - Math.floor((angle-90)/15);
    }
    else if (angle < 270) {
        mirrorX = false; mirrorY = false; seq = Math.floor((angle-180)/15);
    }
    else {
        mirrorX = true; mirrorY = false; seq = 6 - Math.floor((angle-270)/15);
    }

    this.draw_sprite(x - 16, y - 16,
        resource.spriteList[spriteIdx + seq], resource.palettes[palIdx],
        mirrorX, mirrorY);
}

game.draw_sprite = function(canvasX, canvasY, sprite, palette, mirrorX, mirrorY) {
    const pw = 2, ph = 2;

    if (!mirrorX) {
        if (!mirrorY) {
            let screenY = canvasY;
            for (let y = 0; y < 16; y++) {
                let screenX = canvasX;
                for (let x = 0; x < 16; x++) {
                    this.canvas_ctx.fillStyle = palette[sprite[y][x]];
                    this.canvas_ctx.fillRect(screenX, screenY, pw, ph);
                    screenX += pw;
                }
                screenY += ph;
            }
        }
        else { // mirror Y
            let screenY = canvasY + 15 * ph;
            for (let y = 0; y < 16; y++) {
                let screenX = canvasX;
                for (let x = 0; x < 16; x++) {
                    this.canvas_ctx.fillStyle = palette[sprite[y][x]];
                    this.canvas_ctx.fillRect(screenX, screenY, pw, ph);
                    screenX += pw;
                }
                screenY -= ph;
            }
        }
    }
    else { // mirror X
        if (!mirrorY) {
            let screenY = canvasY;
            for (let y = 0; y < 16; y++) {
                let screenX = canvasX + 15 * pw;
                for (let x = 0; x < 16; x++) {
                    this.canvas_ctx.fillStyle = palette[sprite[y][x]];
                    this.canvas_ctx.fillRect(screenX, screenY, pw, ph);
                    screenX -= pw;
                }
                screenY += ph;
            }
        }
        else { // mirror Y
            let screenY = canvasY + 15 * ph;
            for (let y = 0; y < 16; y++) {
                let screenX = canvasX + 15 * pw;
                for (let x = 0; x < 16; x++) {
                    this.canvas_ctx.fillStyle = palette[sprite[y][x]];
                    this.canvas_ctx.fillRect(screenX, screenY, pw, ph);
                    screenX -= pw;
                }
                screenY -= ph;
            }
        }
    }
}

game.doFrame = function () {
    this.drawRotatedSpriteList();

    //this.canvas_ctx.fillStyle = `rgb(0, 0, 0)`;
    //this.canvas_ctx.fillRect(0, 0, 800, 600);
    //this.draw_sprite_with_angle(ANIM_X, ANIM_Y+16, 0, 2, 0);


    // update the current position
    // check if it is still moving
    if (this.currentWaypoint < this.movement.length) {
        this.currentSteps += this.moveSpeed;
        // check if exceeds the steps in the current segment
        if (this.currentSteps >= this.currentMove.steps) {
            // consume the steps unitl it is less than the steps of the segment
            while (this.currentSteps >= this.currentMove.steps) {
                this.currentSteps -= this.currentMove.steps;
                this.currentWaypoint++;
                // check if it is run out of the movement
                if (this.currentWaypoint >= this.movement.length) {
                    break;
                }
                // move to the next waypoint
                this.currentMove = this.movement[this.currentWaypoint]
                this.currentPt = this.currentMove.pt;
                if (this.currentMove.seq != undefined) {
                    this.currentSeq = this.currentMove.seq;
                    this.currentMirrorX = this.currentMove.mirrorX;
                    this.currentMirrorY = this.currentMove.mirrorY;
                }
            }

            if (this.currentWaypoint < this.movement.length) {
                // move to the next position
                this.currentPt.x += this.currentMove.dx * this.currentSteps;
                this.currentPt.y += this.currentMove.dy * this.currentSteps;
            }
            else {
                // stop at the last position
                this.currentPt = this.movement[this.currentWaypoint-1].pt;
            }
        }
        else {
            // move to the next position
            this.currentPt.x += this.currentMove.dx * this.moveSpeed;
            this.currentPt.y += this.currentMove.dy * this.moveSpeed;
        }
    }

    this.drawStep();
}

