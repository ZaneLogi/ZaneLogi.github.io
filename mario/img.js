import { resource } from "./resource.js";

export class IMG {
  #red_id;
  #image;

  constructor(res_id) {
    this.#red_id = res_id;
  }

  get image() {
    if (!this.#image) {
      this.#image = resource["res/images/" + this.#red_id];
      console.assert(this.#image, "No resource " + this.#red_id);
    }
    return this.#image;
  }

  draw(ctx, x, y, mirror) {
    mirror = mirror || false;

    if (!mirror) {
      const image = this.image;
      ctx.drawImage(image, x, y);
    } else {
      this.drawFlipH(ctx, x, y);
    }
  }

  drawVert(ctx, x, y) {

  }

  drawFlipV(ctx, x, y) {
    // flip image vertically
    const image = this.image;
    ctx.save();
    ctx.scale(1, -1);
    ctx.translate(0, -image.height);
    ctx.drawImage(image, x, -y);
    ctx.restore();
  }

  drawFlipH(ctx, x, y) {
    // flip image horizontally
    const image = this.image;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-image.width, 0);
    ctx.drawImage(image, -x, y);
    ctx.restore();
  }
}