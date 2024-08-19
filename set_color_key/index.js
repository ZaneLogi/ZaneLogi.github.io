const canvas = document.querySelector('canvas');
const canvas_ctx = canvas.getContext('2d');

const sprite = new Image();
sprite.onload = function () {
    draw(sprite, 0, 0);
}

sprite.src = "mario.bmp";

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

    const buffer = createBuffer(img);
    setColorKey(buffer, [0xff, 0x00, 0xff]);

    canvas_ctx.fillStyle = "rgb(128, 255, 128)";
    canvas_ctx.fillRect(x, y, img.width, img.height);
    canvas_ctx.drawImage(buffer, x, y);
}

// experiment
// refer to https://developer.mozilla.org/zh-TW/docs/Web/API/XMLHttpRequest_API/Using_XMLHttpRequest
// refer to https://stackoverflow.com/questions/11089732/display-image-from-blob-using-javascript-and-websockets

const req = new XMLHttpRequest();
req.open("GET", "mario.bmp", true);
req.responseType = "arraybuffer";

req.onprogrss = (pe) => {
    console.log('onprogress', pe);
};

req.onloadstart = (pe) => {
    console.log('onstart', pe);
};

req.onloadend = (pe) => {
    console.log('onend', pe);
};

req.onload = (progressEvent) => {
    console.log('onload', progressEvent);

    let urlObjRef = 2;

    const arrayBuffer = req.response; // Note: not req.responseText
    const urlObject = URL.createObjectURL(new Blob([arrayBuffer]));

    // html img tag
    const imgElm = document.getElementById('my-img');
    imgElm.onload = function () {
        console.log("imgElm width %d, height %d", imgElm.width, imgElm.height);
        draw(imgElm, 0, 64);

        if (--urlObjRef == 0) {
            console.log("revokeObjectURL at html img tag.");
            URL.revokeObjectURL(urlObject);
        }
    };
    imgElm.src = urlObject;

    // The Image() constructor creates a new HTMLImageElement instance.
    // It is functionally equivalent to document.createElement('img').
    const imgObj = new Image();
    imgObj.onload = function () {
        console.log("imgObj width %d, height %d", imgObj.width, imgObj.height);

        draw_flip_images(imgObj);
        draw_rotate_images(imgObj);

        if (--urlObjRef == 0) {
            console.log("revokeObjectURL at new Image.");
            URL.revokeObjectURL(urlObject);
        }
    }
    imgObj.src = urlObject;
};

req.send(null);

function draw_flip_images(img) {
    // flip image vertically
    let x = 32, y = 64;
    canvas_ctx.save();
    canvas_ctx.scale(1, -1);
    canvas_ctx.translate(0, -img.height);
    draw(img, x, -y);
    canvas_ctx.restore();

    // flip image horizontally
    x = 64, y = 64;
    canvas_ctx.save();
    canvas_ctx.scale(-1, 1);
    canvas_ctx.translate(-img.width, 0);
    draw(img, -x, y);
    canvas_ctx.restore();
}

function draw_rotate_images(img) {
    // rotate image 90 degree clockwise
    x = 96, y = 64;
    canvas_ctx.save();
    // rotate the image 90 degree clockwise
    canvas_ctx.rotate(Math.PI / 2);
    // align the image to the top-left corner
    canvas_ctx.translate(0, -img.height);
    // swap x, y and right is negative, down is positive
    draw(img, y, -x);
    canvas_ctx.restore();

    // rotate image 180 degree clockwise
    x = 128, y = 64 + 24;
    canvas_ctx.save();
    canvas_ctx.rotate(Math.PI);
    // algin the image to the top-left corner
    canvas_ctx.translate(-img.width, -img.height);
    // right is negative and down is negative
    draw(img, -x, -y);
    canvas_ctx.restore();

    // rotate image 270 degree clockwise
    x = 96, y = 64 + 32 + 24;
    canvas_ctx.save();
    canvas_ctx.rotate(-Math.PI / 2);
    // align the image to the top-left corner
    canvas_ctx.translate(-img.width, 0);
    // swap x, y, right is positive, down is negative
    draw(img, -y, x);
    canvas_ctx.restore();
}