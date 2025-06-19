"use strict"

class Vector2 {
    constructor(x=0, y=0) {
        this.x = x;
        this.y = y;
    }

    lengthSqr() {
        return this.x * this.x + this.y * this.y;
    }

    length() {
        return Math.hypot(this.x, this.y);
    }

    normalized() {
        const len = this.length(); 
        return new Vector2(this.x / len, this.y / len);
    }

    static lerp(start, end, ratio) {
        if (ratio <= 0) {
            return new Vector2(start.x, start.y);
        }

        if (ratio >= 1) {
            return new Vector2(end.x, end.y);
        }

        let dirX = end.x - start.x;
        let dirY = end.y - start.y;
        const len = Math.hypot(dirX, dirY);
        dirX /= len;
        dirY /= len;
        return new Vector2(start.x + dirX * len * ratio, start.y + dirY * len * ratio);
    }
}

class BezierCurve {
    constructor(p0, p1, p2, p3) {
        this.p0 = p0;
        this.p1 = p1;
        this.p2 = p2;
        this.p3 = p3;
    }

    calculateCurvePoint(t) {
        const tt = t * t;
        const ttt = tt * t;
        const u = 1.0 - t;
        const uu = u * u;
        const uuu = uu * u;
        const uut3 = uu * t * 3;
        const utt3 = u * tt * 3;

        const point = {};
        point.x = (uuu * this.p0.x) + (uut3 * this.p1.x) + (utt3 * this.p2.x) + (ttt * this.p3.x);
        point.y = (uuu * this.p0.y) + (uut3 * this.p1.y) + (utt3 * this.p2.y) + (ttt * this.p3.y);

        return point;
    }
}

class BezierPath {
    constructor() {
        this.data = [];
    }
    
    addCurve(curve, samples) {
        this.data.push({curve:curve, samples:samples});
    }

    doSampling() {
        const path = [];
        
        for (const datum of this.data) {
            const step = 1.0 / datum.samples;
            for (let t = 0; t <= 1.0; t += step ) {
                path.push(datum.curve.calculateCurvePoint(t))
            }
        }

        return path;
    }
}