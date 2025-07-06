"use strict"

function draw(img, x, y) {
    const createBuffer = function (source) {
        const buffer = document.createElement('canvas');
        buffer.width = source.width;
        buffer.height = source.height;
        const buffer_ctx = buffer.getContext('2d');
        buffer_ctx.drawImage(source, 0, 0);
        return buffer;
    }

    const setColorKey = function (source, color_key) {
        const source_ctx = source.getContext('2d');
        const imageData = source_ctx.getImageData(0, 0, source.width, source.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            if (data[i] == color_key[0] &&
                data[i + 1] == color_key[1] &&
                data[i + 2] == color_key[2]) {
                // set alpha = 0
                data[i + 3] = 0;
            }
        }

        source_ctx.putImageData(imageData, 0, 0);
    };

    function draw_flip_images(img, x, y, flip_h, flip_v) {
        let sx = 1, sy = 1;
        let tx = 0, ty = 0;
        if (flip_v) {
            // flip image vertically
            y = -y;
            sy = -1;
            ty = -img.height;
        }

        if (flip_h) {
            // flip image horizontally
            x = -x;
            sx = -1;
            tx = -img.width;
        }

        console.log(sx, sy, tx, ty)

        canvas_ctx.save();
        canvas_ctx.scale(sx, sy);
        canvas_ctx.translate(tx, ty);
        canvas_ctx.drawImage(img, x, y);
        canvas_ctx.restore();
    }

    function draw_rotate_images(img) {
        // when drawing the image, (x, y) is always at the left-top corner

        x = 72, y = 64 + 24;
        canvas_ctx.drawImage(img, x, y);

        // rotate image 90 degree clockwise
        x = 96, y = 64;
        canvas_ctx.save();
        // rotate the image 90 degree clockwise
        canvas_ctx.rotate(Math.PI / 2);
        // align the image to the top-left corner
        canvas_ctx.translate(0, -img.height);
        // swap x, y and right is negative, down is positive
        canvas_ctx.drawImage(img, y, -x);
        canvas_ctx.restore();

        // rotate image 180 degree clockwise
        x = 72 + 24 + 32, y = 64 + 24;
        canvas_ctx.save();
        canvas_ctx.rotate(Math.PI);
        // algin the image to the top-left corner
        canvas_ctx.translate(-img.width, -img.height);
        // right is negative and down is negative
        canvas_ctx.drawImage(img, -x, -y);
        canvas_ctx.restore();

        // rotate image 270 degree clockwise
        x = 72 + 24, y = 64 + 32 + 24;
        canvas_ctx.save();
        canvas_ctx.rotate(-Math.PI / 2);
        // align the image to the top-left corner
        canvas_ctx.translate(-img.width, 0);
        // swap x, y, right is positive, down is negative
        canvas_ctx.drawImage(img, -y, x);
        canvas_ctx.restore();
    }

    const buffer = createBuffer(img);
    setColorKey(buffer, [0xff, 0x00, 0xff]);

    canvas_ctx.fillStyle = "rgb(128, 128, 128)";
    canvas_ctx.fillRect(x, y, img.width * 2, img.height);
    canvas_ctx.drawImage(img, x, y);
    canvas_ctx.drawImage(buffer, img.width, y);

    y += img.height;
    draw_flip_images(img, x, y, false, false);
    draw_flip_images(img, x + img.width, y, true, false);
    draw_flip_images(img, x + img.width * 2, y, false, true);
    draw_flip_images(img, x + img.width * 3, y, true, true);

    draw_rotate_images(img);
}


const canvas = document.querySelector('canvas');
const canvas_ctx = canvas.getContext('2d');

const img = new Image();
img.src = "data:image/bmp;base64,Qk02CQAAAAAAADYAAAAoAAAAGAAAACAAAAABABgAAAAAAAAJAADEDgAAxA4AAAAAAAAAAAAAAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCI/wD//wD//wD//wD//wD//wD/AHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCI/wD//wD//wD//wD//wD//wD/AHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCI/wD//wD/AHCIAHCIAHCIAHCIAHCIAHCIAHCI/wD//wD//wD//wD//wD//wD/AHCIAHCIAHCIAHCIAHCIAHCIAHCI/wD//wD//wD//wD/AHCIAHCIAHCIAHCIAHCIAHCIAHCI/wD//wD//wD//wD//wD//wD/AHCIAHCIAHCIAHCIAHCIAHCIAHCI/wD//wD//wD//wD//wD//wD/ACjYACjYACjYACjYACjYACjYACjY/wD//wD/ACjYACjYACjYACjYACjYACjYACjY/wD//wD//wD//wD//wD//wD//wD//wD/ACjYACjYACjYACjYACjYACjYACjY/wD//wD/ACjYACjYACjYACjYACjYACjYACjY/wD//wD//wD//wD/OJj8OJj8OJj8OJj8OJj8ACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYOJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8ACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYOJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8ACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYOJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8ACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYOJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8AHCIAHCIACjYACjYOJj8OJj8ACjYACjYACjYACjYOJj8OJj8ACjYAHCIAHCIOJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8AHCIAHCIACjYACjYOJj8OJj8ACjYACjYACjYACjYOJj8OJj8ACjYAHCIAHCIOJj8OJj8OJj8OJj8AHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIACjYACjYACjYACjYACjYACjYACjYACjYAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIAHCIACjYACjYACjYACjYACjYACjYACjYACjYAHCIAHCIAHCIAHCIAHCIAHCIAHCI/wD//wD/AHCIAHCIAHCIAHCIAHCIAHCIAHCIACjYACjYAHCIAHCIAHCIAHCIACjYACjYAHCIAHCIAHCIAHCIAHCI/wD//wD//wD//wD/AHCIAHCIAHCIAHCIAHCIAHCIAHCIACjYACjYAHCIAHCIAHCIAHCIACjYACjYAHCIAHCIAHCIAHCIAHCI/wD//wD//wD//wD//wD//wD/AHCIAHCIAHCIAHCIAHCIACjYACjYAHCIAHCIAHCIAHCIAHCIAHCI/wD//wD//wD//wD//wD//wD//wD//wD//wD//wD//wD/AHCIAHCIAHCIAHCIAHCIACjYACjYAHCIAHCIAHCIAHCIAHCIAHCI/wD//wD//wD//wD//wD//wD//wD//wD//wD//wD//wD//wD/OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8/wD//wD//wD//wD//wD//wD//wD//wD//wD/OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8/wD//wD//wD//wD//wD//wD/AHCIAHCIAHCIAHCIAHCIOJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8AHCIAHCIAHCIAHCIAHCIAHCIAHCI/wD//wD//wD//wD/AHCIAHCIAHCIAHCIAHCIOJj8OJj8OJj8OJj8OJj8OJj8OJj8OJj8AHCIAHCIAHCIAHCIAHCIAHCIAHCI/wD//wD//wD//wD/AHCIAHCIAHCIOJj8OJj8AHCIAHCIAHCIAHCIOJj8OJj8OJj8OJj8OJj8OJj8AHCIOJj8OJj8OJj8OJj8OJj8OJj8/wD//wD/AHCIAHCIAHCIOJj8OJj8AHCIAHCIAHCIAHCIOJj8OJj8OJj8OJj8OJj8OJj8AHCIOJj8OJj8OJj8OJj8OJj8OJj8/wD//wD/AHCIAHCIAHCIOJj8OJj8AHCIAHCIOJj8OJj8OJj8OJj8OJj8OJj8AHCIAHCIOJj8OJj8OJj8OJj8OJj8/wD//wD//wD//wD/AHCIAHCIAHCIOJj8OJj8AHCIAHCIOJj8OJj8OJj8OJj8OJj8OJj8AHCIAHCIOJj8OJj8OJj8OJj8OJj8/wD//wD//wD//wD//wD//wD/AHCIAHCIAHCIAHCIAHCIAHCIAHCIOJj8OJj8OJj8OJj8AHCIAHCIOJj8/wD//wD//wD//wD//wD//wD//wD//wD//wD//wD/AHCIAHCIAHCIAHCIAHCIAHCIAHCIOJj8OJj8OJj8OJj8AHCIAHCIOJj8/wD//wD//wD//wD//wD//wD//wD//wD//wD//wD/ACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjY/wD//wD//wD//wD//wD//wD/ACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjY/wD//wD//wD//wD//wD//wD//wD/ACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjY/wD//wD//wD//wD//wD//wD//wD//wD//wD//wD//wD//wD/ACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjYACjY/wD//wD//wD//wD//wD//wD//wD/";

img.onload = function () {
    draw(img, 0, 0);
}