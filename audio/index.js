"use strict"

let audioCtx;
let buffer;
let source;

// Get UI elements
const play = document.getElementById("play");
const stop = document.getElementById("stop");

play.addEventListener("click", async () => {
    if (!audioCtx) {
        audioCtx = new AudioContext();
        await loadAudio();
    } else {
        playBuffer();
    }
});
      
stop.addEventListener("click", () => {
    source.stop();
    play.disabled = false;
    stop.disabled = true;
});

function playBuffer() {
    source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
    play.disabled = true;
    stop.disabled = false;
}

async function loadAudio() {
    try {
        //const response = await fetch("sounds/tune0.wav");
        const response = await fetch("sounds/gamestart.ogg");
        audioCtx.decodeAudioData(await response.arrayBuffer(), (buf) => {
            // executes when buffer has been decoded
            buffer = buf;
            play.disabled = false; // buffer loaded, enable play button
            playBuffer();
        });
    } catch (err) {
        console.error(`Unable to fetch the audio file. Error: ${err.message}`);
    }
}
