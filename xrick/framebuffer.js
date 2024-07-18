"use strict"

const framebuffer = new function() {

    this.init = function(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.xbytes = 4;
        this.ypitch = this.xbytes * this.width;
        this.imgData = this.ctx.createImageData(canvas.width, canvas.height);

        this.clear();
    }

    this.clear = function(c) {
        const black = [0, 0, 0, 0xff];
        c = c || black;

        const line = new Uint8ClampedArray(this.ypitch);
        for (let i = 0; i < this.ypitch; i += 4) {
            line.set(c, i);
        }

        for (let i = 0, offset = 0; i < this.height; i++, offset += this.ypitch) {
            this.imgData.data.set(line, offset);
        }
    }

    this.updateCanvas = function() {
        this.ctx.putImageData(this.imgData, 0, 0);
    }

    this.getOffset = function(x, y) {
        return y * this.ypitch + x * this.xbytes; 
    }
};
