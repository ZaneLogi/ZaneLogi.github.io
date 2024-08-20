"use strict"

const game = {

};

game.init = function() {
    this.loadResources();
};

game.loadResources = function() {
    runloop.start(this.doFrame);
};

game.doFrame = function() {

};

