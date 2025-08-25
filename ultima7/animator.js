import { timeQueue } from "./globals.js";

export class FrameAnimator {
  static LOOPING = 0;

  constructor(obj) {
    this.obj = obj;
    this.starting = false;
    this.firstFrame = 0;
    this.created = 0;
    this.delay = 100;
    this.type = FrameAnimator.LOOPING;
    this.frameCount = this.obj.frameImages.length;
  }

  requestAnimation() {
    if (!this.starting) {
      this.startAnimation();
    }
  }

  startAnimation() {
    timeQueue.remove(this);
    timeQueue.add(performance.now() + 20, this, null);
    this.starting = true;
  }

  handleEvent(curTime, context) {
    let frameNum = Math.floor((curTime / this.delay) + this.created);
    frameNum %= this.frameCount;
    frameNum += this.firstFrame;
    this.obj.updateFrame(frameNum);

    if (this.starting) {
      timeQueue.add(curTime + this.delay - (curTime % this.delay), this, context);
    }
  }
}