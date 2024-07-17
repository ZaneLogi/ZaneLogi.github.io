let control_status = new function() {
    this.upKey = false;
    this.downKey = false;
    this.leftKey = false;
    this.rightKey = false;

    this.up = function() {
        return this.upKey;
    }

    this.down = function() {
        return this.downKey;
    }

    this.left = function() {
        return this.leftKey;
    }

    this.right = function() {
        return this.rightKey;
    }

    this.fire = function() {
        return this.fireKey;
    }

    this.pause = function() {
        return this.pauseKey;
    }

    this.onKeyDown = function(e){
        switch (e.keyCode) {
        case 38: control_status.upKey = true; break;
        case 40: control_status.downKey = true; break;
        case 37: control_status.leftKey = true; break;
        case 39: control_status.rightKey = true; break;
        case 32: control_status.fireKey = true; break; // space bar
        case 80: control_status.pauseKey = true; break; // P key
        }
        devtools.run();
    }

    this.onKeyUp = function(e) {
        switch (e.keyCode) {
        case 38: control_status.upKey = false; break;
        case 40: control_status.downKey = false; break;
        case 37: control_status.leftKey = false; break;
        case 39: control_status.rightKey = false; break;
        case 32: control_status.fireKey = false; break;
        case 80: control_status.pauseKey = false; break;
        }
        devtools.run();
    }
}

window.addEventListener("keydown", control_status.onKeyDown);
window.addEventListener("keyup", control_status.onKeyUp);
