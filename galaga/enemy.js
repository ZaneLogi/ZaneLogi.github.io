class Enemy {
    static sPath = [];
    static createPath() {
        const path = new BezierPath();
        const curve = new BezierCurve({x:400, y:-10}, {x:400, y:-20}, {x:400, y: 30}, {x:400, y:20});
        path.addCurve(curve, 1);

        path.addCurve(new BezierCurve({x:400, y:20}, {x:400, y:100}, {x:75, y:325}, {x:75, y:425}), 25);
        path.addCurve(new BezierCurve({x:75, y:425}, {x:75, y:650}, {x:350, y:650}, {x:350, y:425}), 25);
        this.sPath.push(path.doSampling());
    }

    static drawPath(ctx, pathIndex) {
        const path = this.sPath[pathIndex];

        ctx.strokeStyle = 'green';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);

        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }

        ctx.stroke();
    }

    constructor(sprite) {
        this.sprite = sprite;

        this.setFlyInPath(0);
    }

    setFlyInPath(pathIndex) {
        const path = Enemy.sPath[pathIndex];

        this.movement = [];
        this.movement[0] = {pt:path[0], dx:0, dy:0, steps:0};

        for (let i = 1; i < path.length; i++) {
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

        // initiate the movement
        this.moveSpeed = 30;
        this.currentWaypoint = 0;
        this.currentMove = this.movement[this.currentWaypoint];
        this.currentPt = this.currentMove.pt;
        this.currentSteps = 0;
        this.currentSeq = this.currentMove.seq;
        this.currentMirrorX = this.currentMove.mirrorX;
        this.currentMirrorY = this.currentMove.mirrorY;
    }

    update() {
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

            console.log(this.currentPt);
        }
    }

    draw(ctx) {
        this.drawImage(ctx, this.currentPt.x, this.currentPt.y,
            this.sprite[this.currentSeq], this.currentMirrorX, this.currentMirrorY);
    }

    drawImage = function(ctx, canvasX, canvasY, image, mirrorX, mirrorY) {
        const WIDTH = 32;
        const HEIGHT = 32;
        const WIDTH_HALF = 16;
        const HEIGHT_HALF = 16;

        // code below is to test if the image is drawn correctly
        //ctx.fillStyle = `rgb(128,128,128)`;
        //ctx.fillRect(canvasX-WIDTH_HALF, canvasY-HEIGHT_HALF, WIDTH, HEIGHT);

        if (!mirrorX) {
            if (!mirrorY) {
                ctx.drawImage(image, canvasX-WIDTH_HALF, canvasY-HEIGHT_HALF, WIDTH, HEIGHT);
            }
            else { // mirror Y
                // flip image vertically
                ctx.save();
                ctx.scale(1, -1);
                ctx.translate(-WIDTH_HALF, -HEIGHT_HALF);
                ctx.drawImage(image, canvasX, -canvasY, WIDTH, HEIGHT);
                ctx.restore();
            }
        }
        else { // mirror X
            if (!mirrorY) {
                // flip image horizontally
                ctx.save();
                ctx.scale(-1, 1);
                ctx.translate(-WIDTH_HALF, -HEIGHT_HALF);
                ctx.drawImage(image, -canvasX, canvasY, WIDTH, HEIGHT);
                ctx.restore();
            }
            else { // mirror Y
                // flip image both horizontally and vertically
                ctx.save();
                ctx.scale(-1, -1);
                ctx.translate(-WIDTH_HALF, -HEIGHT_HALF);
                ctx.drawImage(image, -canvasX, -canvasY, WIDTH, HEIGHT);
                ctx.restore();
            }
        }
    }
}

