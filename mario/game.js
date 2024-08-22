"use strict"

const LEFT = false;
const RIGHT = true;

const game = {
    canvas: null,
    canvas_ctx: null,
    window_width: 0,
    window_height: 0,
};

game.init = function() {
    this.canvas = document.querySelector('canvas');
    this.canvas_ctx = this.canvas.getContext('2d');
    this.window_width = this.canvas.width;
    this.window_height = this.canvas.height;

    this.loadResources();
};

game.loadResources = function() {
    res_loader.start(() => this.loadResourceCompletion());
};

game.loadResourceCompletion = function() {
    map.init();
    runloop.start(() => this.doFrame(), 16);
}

game.doFrame = function() {
    map.setBackgroundColor(this.canvas_ctx);
    map.draw(this.canvas_ctx);
};

game.ticks = function() {
    return window.performance.now();
}
