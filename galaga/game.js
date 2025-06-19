const game = {
    canvas: null,
    canvas_ctx: null,
    window_width: 0,
    window_height: 0,
};

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

    for (let sprIdx = 0; sprIdx < 16; sprIdx++) {
        const drawY = sprIdx * 32;
        for (let i = 0; i < 8; i++) {
            this.draw_sprite(i * 32, drawY, resource.spriteList[sprIdx * 8 + i], resource.palettes[9]);
        }
    }

    this.currentSprite = 0;
    this.seqence = [
        0, 1, 2, 3, 4, 5,
        6, 5, 4, 3, 2, 1,
        0, 1, 2, 3, 4, 5,
        6, 5, 4, 3, 2, 1,
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
    for (let i = 1; i < path.length; i++) {
        this.canvas_ctx.lineTo(path[i].x, path[i].y);
    }
    this.canvas_ctx.stroke();

    runloop.start(() => this.doFrame(), 200);
};

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
};

game.doFrame = function () {
    const ANIM_X = 256, ANIM_Y = 0;

    const spriteIndex = this.seqence[this.currentSprite];
    let mirrorX, mirrorY;

    if (this.currentSprite < 6) {
        mirrorX = false; mirrorY = false;
    }
    else if (this.currentSprite < 12) {
        mirrorX = true; mirrorY = false;
    }
    else if (this.currentSprite < 18) {
        mirrorX = true; mirrorY = true;
    }
    else {
        mirrorX = false; mirrorY = true;
    }

    for (let i = 0; i < 16; i++) {
        this.draw_sprite(ANIM_X, ANIM_Y + i * 32, resource.spriteList[spriteIndex + i * 8], resource.palettes[2], mirrorX, mirrorY);
    }

    this.currentSprite = (this.currentSprite + 1) % this.seqence.length;
};

