"use strict"

let game = {
  fps: 30,
  frames: 0,

  init: function() {
    game.canvas = document.querySelector('canvas')
    game.context = game.canvas.getContext('2d')
    game.msPerFrame = 1000 / game.fps
    game.msPrev = window.performance.now()
    
    window.requestAnimationFrame(game.gameloop)

    setInterval((g) => {
      console.log(g.frames)
    }, 1000, game)
  },

  gameloop: function() {
    window.requestAnimationFrame(game.gameloop)

    const msNow = window.performance.now()
    const msPassed = msNow - game.msPrev

    if (msPassed < game.msPerFrame) return

    game.draw()

    const excessTime = msPassed % game.msPerFrame
    game.msPrev = msNow - excessTime

    game.frames++
  }
}

window.onload = game.init
