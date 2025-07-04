"use strict"

const audio = {
    node: null, // AudioWorkletNode for sound processing
};

// clear all active sound effects and start outputting silence
audio.snd_clear = function() {
    if (this.node) {
        this.node.port.postMessage({type: 'stop_sound'});
    }
}

// start a sound effect
audio.snd_start = function(slot, type) {
    if (this.node) {
        this.node.port.postMessage({type: type, slot: slot});
    }
}

// stop a sound effect
audio.snd_stop = function() {
}

audio.game_tick = function() {
    if (this.node) {
        // send the current game tick to the audio processor
        this.node.port.postMessage({type: 'game_tick'});
    }
}


document.getElementById('godmode-button').addEventListener('click', () => {
    game.god_mode = !game.god_mode;
    const button = document.getElementById('godmode-button');
    if (game.god_mode) {
        button.innerText = "Normal";
    }
    else {
        button.innerText = "God Mode";
    }
});

async function audio_init(muted = true) {
    if (!audio.node) {
        const context = new AudioContext();
        await context.audioWorklet.addModule('namco_audio_processor.js?v=' + Date.now());
        const node = new AudioWorkletNode(context, 'namco_audio_processor');
        node.connect(context.destination);
        await context.resume();
        audio.node = node;
        console.log('AudioWorklet initialized');

        if (muted) {
            audio.node.port.postMessage({type: 'toggle_sound'});
        }
    }
}

document.getElementById('mute-button').addEventListener('click', async() => {
    if (!audio.node) {
        await audio_init(false);
        const button = document.getElementById('mute-button');
        button.innerText = "Mute";
    }
    else {
        audio.node.port.postMessage({type: 'toggle_sound'});
        const button = document.getElementById('mute-button');
        if (button.innerText == "Mute") {
            button.innerText = "Unmute";
        }
        else {
            button.innerText = "Mute";
        }
    }
});

document.getElementById('test-sound-button').addEventListener('click', async () => {
    if (!audio.node) {
        await audio_init(false);
        const button = document.getElementById('mute-button');
        button.innerText = "Mute";
    }
    audio.snd_start(2, 'dead');
});

/*
document.getElementById('start-button').addEventListener('click', async () => {
    if (!audio.node) {
        const context = new AudioContext();
        await context.audioWorklet.addModule('namco_audio_processor.js?v=' + Date.now());
        const node = new AudioWorkletNode(context, 'namco_audio_processor');
        node.connect(context.destination);
        await context.resume();
        audio.node = node;
        console.log('AudioWorklet initialized');

        const button = document.getElementById('start-button');
        button.innerText = "Mute";
    }
    else {
        audio.node.port.postMessage({type: 'toggle_sound'});
        const button = document.getElementById('start-button');
        if (button.innerText == "Mute") {
            button.innerText = "Unmute";
        }
        else {
            button.innerText = "Mute";
        }
    }

    /*audio.node.port.postMessage({
        type: 'updateVoice',
        voice: 0,
        data: { frequency: 5000, waveform: 1, volume: 10 }
    });*/

    /*audio.node.port.postMessage({
        type: 'eatdot1',
        slot: 2
    });
    
    audio.snd_start(0, 'prelude');
    audio.snd_start(2, 'dead');
    audio.snd_start(2, 'eatdot1');
    audio.snd_start(2, 'eatdot2');
    audio.snd_start(2, 'eatghost');
    audio.snd_start(2, 'eatfruit');
    audio.snd_start(1, 'weeooh');
    audio.snd_start(1, 'frightened');
});
*/

const debug_wavetable = false;
if (debug_wavetable) {
    for (let w = 0; w < 8; w++) {
        console.log(`Waveform ${w}:`);
        let line = '';
        for (let i = 0; i < 32; i++) {
            let sample = wavetable1[(w << 5) + i] & 0xF;
            line += sample.toString(16).toUpperCase() + ' ';
        }
        console.log(line);
    }
}