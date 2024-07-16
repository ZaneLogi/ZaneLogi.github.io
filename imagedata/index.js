"use strict"

function draw() {
    const canvas = document.querySelector('canvas')
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = "rgb(200, 0, 0)";
    ctx.fillRect(10, 10, 50, 50);

    ctx.fillStyle = "rgba(0, 0, 200, 0.5)";
    ctx.fillRect(30, 30, 50, 50);
        
    const width = 16;
    const height = 16;
    const imgData = ctx.createImageData(16, 16);
    const data = imgData.data;
    let i = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            data[i] = 0x00; // red
            data[i+1] = 0xff; // green
            data[i+2] = 0x00; // blue
            data[i+3] = 0xff; // alpha
            i += 4;
        }
    }

    ctx.putImageData(imgData, 100, 100);
}

window.addEventListener("load", draw);
