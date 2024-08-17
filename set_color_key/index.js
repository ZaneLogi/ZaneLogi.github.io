const canvas = document.querySelector('canvas');
const canvas_ctx = canvas.getContext('2d');

const sprite = new Image();
sprite.onload = function () {
    draw(sprite);
}

sprite.src = "mario.bmp";

function draw(img) {
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

    canvas_ctx.drawImage(buffer, 0, 0);
} 