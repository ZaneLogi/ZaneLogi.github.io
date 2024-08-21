"use strict"

const resource = {
    'res/images/gnd_red_1': 0,
    'res/images/transp': 0,
};

const res_loader = {
    count: 0,
    total: 0,
    completion: null,
}

res_loader.start = function (completion) {
    this.count = 0;
    this.total = Object.keys(resource).length;
    this.completion = completion;

    Object.keys(resource).forEach(key => {
        this.loadImage(key + ".bmp").then(image => {
            console.log("Image '" + key + "' is ready.");
            const buffer = this.createOffscreenCanvas(image.width, image.height);
            const ctx = buffer.getContext('2d');
            ctx.drawImage(image, 0, 0);
            resource[key] = buffer;
            this.progress();
        }).catch(error => {
            console.log(error);
        });
    });
};

res_loader.progress = function() {
    if (++this.count >= this.total) {
        this.completion();
    }
};

res_loader.loadImage = function (url) {
    return new Promise((resolve, reject) => {
        let image = new Image();
        image.src = url;
        if (image.complete) {
            resolve(image);
        } else {
            image.onload = function () {
                resolve(image);
            }
        }
    });
};

res_loader.createOffscreenCanvas = function (width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
};