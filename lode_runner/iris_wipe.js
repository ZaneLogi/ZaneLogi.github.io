"use strict"

const iris_wipe = {
    cx: 0,
    cy: 0,
    raidus: 0,
    width: 0,
    height: 0,
    stop: true,
}

iris_wipe.start = function(cx, cy, radius, w, h) {
    this.cx = cx;
    this.cy = cy;
    this.radius = radius;
    this.width = w;
    this.height = h;
    this.stop = false;
    this.lines = Array(h).fill().map(() => [cx+1, cx-1]);
}

iris_wipe.step = function() {
    this.drawCircleFill();

    const fps = 1000/runloop.frame_period;
    this.radius += 3;
}

iris_wipe.render = function(canvas_ctx) {
    let noDraw = true;
    for (const [y, line] of this.lines.entries()) {
        const x1 = line[0];
        const x2 = line[1];
        canvas_ctx.fillStyle = "#000000";
        if (x1 > 0) {
            canvas_ctx.fillRect(0, y, x1, 1);
            noDraw = false;
        }
        if (this.width - x2 > 2) {
            canvas_ctx.fillRect(x2 + 1, y, (this.width - x2 - 1), 1);
            noDraw = false;
        }
    }

    if (noDraw)
        this.stop = true;
}

iris_wipe.drawLine = function(x1, x2, y) {
    if (y < 0 || y >= this.height)
        return;

    const line = this.lines[y];
    if (x1 <= 0)
        line[0] = 0;
    else if (x1 < line[0])
        line[0] = x1;

    if (x2 >= this.width - 1)
        line[1] = this.width - 1;
    else if (x2 > line[1])
        line[1] = x2;
}

iris_wipe.drawCircleFill = function() {
    const cx = this.cx;
    const cy = this.cy;
    const radius = this.radius;
    let x = 0;
    let y = radius;

    let d = 1 - radius;
    let deltaE = 3;                  // corresponds to 2*x + 3
    let deltaSE = -2 * radius + 5;   // corresponds to 2*(x - y) + 5

    while (x <= y) {
        this.drawLine(cx - x, cx + x, cy + y);
        this.drawLine(cx - x, cx + x, cy - y);
        this.drawLine(cx - y, cx + y, cy + x);
        this.drawLine(cx - y, cx + y, cy - x);

        if (d < 0) {
            d += deltaE;
            deltaE += 2;
            deltaSE += 2;
        }
        else {
            d += deltaSE;
            deltaE += 2;
            deltaSE += 4;
            y--;
        }
        x++;
    }
}