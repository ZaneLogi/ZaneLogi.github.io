// canvas_controls.js
import { setWorldPosition, getWorldPosition } from "./map_viewer.js";
import { onResizeCanvas } from "./map_viewer.js";

export function setupCanvasDragging(canvas, PIXELS_PER_WORLD) {
  // --- Canvas Dragging ---
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let lastX, lastY;

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);

    isDragging = true;

    const rect = canvas.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    const { x, y } = getWorldPosition();
    lastX = x;
    lastY = y;

    e.preventDefault();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!isDragging) return;

    let newX = lastX - Math.floor(e.clientX - dragOffsetX);
    let newY = lastY - Math.floor(e.clientY - dragOffsetY);

    // wrap-around
    newX = (newX + PIXELS_PER_WORLD) % PIXELS_PER_WORLD;
    newY = (newY + PIXELS_PER_WORLD) % PIXELS_PER_WORLD;

    setWorldPosition(newX, newY);
  });

  canvas.addEventListener("pointerup", (e) => {
    canvas.releasePointerCapture(e.pointerId);
    isDragging = false;
  });

  // --- Canvas Resizing ---
  function resizeCanvas() {
    //const dpr = window.devicePixelRatio || 1;
    const dpr = 1;
    const displayWidth = Math.floor(canvas.clientWidth * dpr);
    const displayHeight = Math.floor(canvas.clientHeight * dpr);
    console.log(`Resize canvas to ${displayWidth}x${displayHeight} (DPR: ${dpr})`);
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      onResizeCanvas(displayWidth, displayHeight);
    }
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas(); // trigger first time
}
