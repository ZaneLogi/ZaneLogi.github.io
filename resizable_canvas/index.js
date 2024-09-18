// Refer to https://stackoverflow.com/questions/1664785/resize-html5-canvas-to-fit-window
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
let width = 300;
let height = 150;

const observer = new ResizeObserver((entries) => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
});

observer.observe(canvas)

const hsla = (h, s, l, a) => `hsla(${h * 360}, ${s * 100}%, ${l * 100}%, ${a})`;

function render(time) {
    canvas.width = width;
    canvas.height = height;

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(time * 0.0001);
  
    const range = Math.max(width, height) * 0.8;
    const size = 64 + Math.sin(time * 0.001) * 50;
    for (let i = 0; i < range; i += size) {
        ctx.fillStyle = hsla(i / range * 0.3 + time * 0.0001, 1, 0.5, 1);
        ctx.fillRect( i, -range, size, range * 2);
        ctx.fillRect(-i, -range, size, range * 2);
    }
  
    ctx.restore();

    requestAnimationFrame(render)
}

requestAnimationFrame(render)
