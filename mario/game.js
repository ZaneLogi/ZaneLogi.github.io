"use strict"

const game = {
    canvas: null,
    canvas_ctx: null,
};

game.init = function() {
    this.canvas = document.querySelector('canvas');
    this.canvas_ctx = this.canvas.getContext('2d');

    this.loadResources();

    map.init();
};

game.loadResources = function() {
    runloop.start(() => this.doFrame(), 16);
};

game.doFrame = function() {
    map.setBackgroundColor(this.canvas_ctx);
    map.draw(this.canvas_ctx);
};

