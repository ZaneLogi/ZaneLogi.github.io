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

        this.u8buf = new Uint8ClampedArray(this.width * this.height);
        this.u8buf_offsets = [0];
        for (let i = 1; i < this.height; i++) {
            this.u8buf_offsets[i] = this.u8buf_offsets[i-1] + this.width;
        }

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

        const line8 = new Uint8ClampedArray(this.width);
        for (let i = 0, offset = 0; i < this.height; i++, offset += this.width) {
            this.u8buf.set(line8, offset);
        }
    }

    this.updateCanvas = function() {
        this.ctx.putImageData(this.imgData, 0, 0);
    }

    this.getOffset = function(x, y) {
        return y * this.ypitch + x * this.xbytes;
    }

    this.dump = function(filename) {
        let p = 0;
        let out = [];
        for (let i = 0; i < this.height; i++) {
            let offset = this.u8buf_offsets[i];
            for (let j = 0; j < this.width; j++) {
                out[p++] = this.u8buf[offset+j].toString(16);
            }
            out[p++] = "\n";
        }

        const a = document.createElement('a');
        const blob = new Blob(out);
        a.href = URL.createObjectURL(blob);
        a.download = filename;                     //filename to download
        a.click();
    }
};
