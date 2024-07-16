"use strict"

let game = {
  fps: 30,
  frames: 0,

  init: function() {
    this.canvas = document.querySelector('canvas')
    this.context = this.canvas.getContext('2d')
    this.msPerFrame = 1000 / this.fps
    this.msPrev = window.performance.now()
    
    window.requestAnimationFrame(() => this.gameloop())

    setInterval((g) => {
      console.log(g.frames)
    }, 1000, this)
  },

  gameloop: function() {
    window.requestAnimationFrame(() => this.gameloop())

    const msNow = window.performance.now()
    const msPassed = msNow - game.msPrev

    if (msPassed < this.msPerFrame) return

    this.draw()

    const excessTime = msPassed % this.msPerFrame
    this.msPrev = msNow - excessTime

    this.frames++
  }
}

window.onload = () => game.init()
