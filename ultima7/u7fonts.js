import { ShapeFile, Shape } from "./shapefile.js";

class U7Font {
  constructor(shape) {
    const frames = shape.frames;
    const count = frames.length;
    let height = 0, baseline = 0;
    for (let i = 0; i < count; i++) {
      const frame = frames[i];
      const h = frame.height;
      const base = frame.HotSpotY;
      if (h > height)
        height = h;
      if (base > baseline)
        baseline = base;
    }
    this.height = height;
    this.baseline = baseline;
    this.shape = shape;
  }

  draw(frameBuffer, x, ybase, text, clipRect = null) {
    const frames = this.shape.frames;
    for (const c of text) {
      const value = c.charCodeAt(0);
      const frame = frames[value];
      frame.draw(frameBuffer, x, ybase, clipRect);
      x += frame.width - 2;
    }
  }
}

export class U7Fonts {
  constructor() {
    this.fonts = [];
  }

  load(uint8) {
    const fontsVga = new ShapeFile();
    fontsVga.load(uint8);
    // the last two fonts are invalid
    const count = fontsVga.shapes.length;
    for (let i = 0; i < count; i++) {
      const shape = fontsVga.shapes[i];
      if (shape instanceof Shape) {
        const font = new U7Font(fontsVga.shapes[i]);
        this.fonts.push(font);
      }
      else {
        this.fonts.push("Invalid font here!");
      }
    }
  }
} 