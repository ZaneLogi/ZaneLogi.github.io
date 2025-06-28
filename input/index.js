"use strict"

const info = document.getElementById("info");
const framerate_label = document.getElementById("framerate");

const main = {
    keys: {},
    frameCount: 0,
}

main.init = function() {
    sys_evt.init();
    runloop.start(() => this.doFrame(), 50);

    this.timerId = setInterval((ctx) => {ctx.updateFrameRate()}, 1000, this);
}

main.processEvents = function() {
    for (const e of sys_evt.events) {
        switch(e.type) {
        case sys_evt.KEY_DOWN:
        {
            const context = e.context;
            let data = this.keys[context.code] || { count: 0 };
            console.assert(data.count >= 0);
            data.e = context;
            data.count++;
            this.keys[context.code] = data;
            break;
        }
        case sys_evt.KEY_UP:
        {
            const context = e.context;
            let data = this.keys[context.code];
            console.assert(data);
            delete this.keys[context.code];
            break;
        }
        }
    }

    sys_evt.reset();
}

main.updateInfo = function() {
    const strings = Object.values(main.keys).map(
        data => `[code(${data.e.code}):key(${data.e.key}):${data.count}`);
    info.innerHTML = strings.length > 0 ? strings.join(", ") : "[Press any key]";
}

main.updateFrameRate = function() {
    framerate_label.innerHTML = `Frame Rate: ${this.frameCount}`;
    this.frameCount = 0;
}

main.doFrame = function() {
   this.processEvents();
   this.updateInfo();
   this.frameCount++;
}

window.addEventListener("load", () => main.init());