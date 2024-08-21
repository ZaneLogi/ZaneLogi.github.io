"use strict"

const resource = {
    'res/images/blockq_0': 0,
    'res/images/blockq_1': 0,
    'res/images/blockq_2': 0,
    'res/images/blockq1_0': 0,
    'res/images/blockq1_1': 0,
    'res/images/blockq1_2': 0,
    'res/images/brick1': 0,
    'res/images/brick2': 0,
    'res/images/brickred': 0,
    'res/images/bush_center_0': 0,
    'res/images/bush_center_1': 0,
    'res/images/bush_left': 0,
    'res/images/bush_right': 0,
    'res/images/bush_top': 0,
    'res/images/castle0_brick': 0,
    'res/images/castle0_center_center': 0,
    'res/images/castle0_center_center_top': 0,
    'res/images/castle0_center_left': 0,
    'res/images/castle0_center_right': 0,
    'res/images/castle0_top0': 0,
    'res/images/castle0_top1': 0,
    'res/images/castle1_brick': 0,
    'res/images/castle1_center_center': 0,
    'res/images/castle1_center_center_top': 0,
    'res/images/castle1_center_left': 0,
    'res/images/castle1_center_right': 0,
    'res/images/castle1_top0': 0,
    'res/images/castle1_top1': 0,
    'res/images/cloud_center_bot': 0,
    'res/images/cloud_center_bot1': 0,
    'res/images/cloud_center_top': 0,
    'res/images/cloud_center_top1': 0,
    'res/images/cloud_left_bot': 0,
    'res/images/cloud_left_bot1': 0,
    'res/images/cloud_left_top': 0,
    'res/images/cloud_right_bot': 0,
    'res/images/cloud_right_top': 0,
    'res/images/coin_use00': 0,
    'res/images/coin_use0': 0,
    'res/images/coin_use01': 0,
    'res/images/coin_use1': 0,
    'res/images/coin_use02': 0,
    'res/images/coin_use2': 0,
    'res/images/coin_use30': 0,
    'res/images/coin_use31': 0,
    'res/images/coin_use32': 0,
    'res/images/end0_dot': 0,
    'res/images/end0_flag': 0,
    'res/images/end0_l': 0,
    'res/images/end1_dot': 0,
    'res/images/end1_flag': 0,
    'res/images/end1_l': 0,
    'res/images/gnd_4': 0,
    'res/images/gnd_5': 0,
    'res/images/gnd_red_1': 0,
    'res/images/gnd_red2': 0,
    'res/images/gnd1': 0,
    'res/images/gnd1_2': 0,
    'res/images/gnd2': 0,
    'res/images/gnd2_2': 0,
    'res/images/grass_center': 0,
    'res/images/grass_left': 0,
    'res/images/grass_right': 0,
    'res/images/pipe_hor_bot_center': 0,
    'res/images/pipe_hor_bot_left': 0,
    'res/images/pipe_hor_bot_right': 0,
    'res/images/pipe_hor_top_center': 0,
    'res/images/pipe_hor_top_left': 0,
    'res/images/pipe_hor_top_right': 0,
    'res/images/pipe_left_bot': 0,
    'res/images/pipe_left_top': 0,
    'res/images/pipe_right_bot': 0,
    'res/images/pipe_right_top': 0,
    'res/images/pipe1_hor_bot_center': 0,
    'res/images/pipe1_hor_bot_left': 0,
    'res/images/pipe1_hor_bot_right': 0,
    'res/images/pipe1_hor_top_center': 0,
    'res/images/pipe1_hor_top_left': 0,
    'res/images/pipe1_hor_top_right': 0,
    'res/images/pipe1_left_bot': 0,
    'res/images/pipe1_left_top': 0,
    'res/images/pipe1_right_bot': 0,
    'res/images/pipe1_right_top': 0,
    'res/images/pipe2_hor_bot_center': 0,
    'res/images/pipe2_hor_bot_left': 0,
    'res/images/pipe2_hor_bot_right': 0,
    'res/images/pipe2_hor_top_center': 0,
    'res/images/pipe2_hor_top_left': 0,
    'res/images/pipe2_hor_top_right': 0,
    'res/images/pipe2_left_bot': 0,
    'res/images/pipe2_left_top': 0,
    'res/images/pipe2_right_bot': 0,
    'res/images/pipe2_right_top': 0,
    'res/images/pipe3_hor_bot_center': 0,
    'res/images/pipe3_hor_bot_left': 0,
    'res/images/pipe3_hor_bot_right': 0,
    'res/images/pipe3_hor_top_center': 0,
    'res/images/pipe3_hor_top_left': 0,
    'res/images/pipe3_hor_top_right': 0,
    'res/images/pipe3_left_bot': 0,
    'res/images/pipe3_left_top': 0,
    'res/images/pipe3_right_bot': 0,
    'res/images/pipe3_right_top': 0,
    'res/images/pipe4_left_bot': 0,
    'res/images/pipe4_left_top': 0,
    'res/images/pipe4_right_bot': 0,
    'res/images/pipe4_right_top': 0,
    'res/images/pipe5_left_bot': 0,
    'res/images/pipe5_left_top': 0,
    'res/images/pipe5_right_bot': 0,
    'res/images/pipe5_right_top': 0,
    'res/images/pipe6_left_bot': 0,
    'res/images/pipe6_left_top': 0,
    'res/images/pipe6_right_bot': 0,
    'res/images/pipe6_right_top': 0,
    'res/images/transp': 0,
    'res/images/uw_0': 0,
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