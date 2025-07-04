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


document.getElementById('start-button').addEventListener('click', async () => {
    const context = new AudioContext();
    await context.audioWorklet.addModule('namco_audio_processor.js?v=' + Date.now());
    audio.node = new AudioWorkletNode(context, 'namco_audio_processor');
    audio.node.connect(context.destination);
    await context.resume(); // 確保啟動音訊
    console.log('AudioWorklet initialized');

    /*game.audioNode.port.postMessage({
        type: 'updateVoice',
        voice: 0,
        data: { frequency: 5000, waveform: 1, volume: 10 }
    });*/

    /*game.audioNode.port.postMessage({
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
    */
});


document.getElementById('test-sound-button').addEventListener('click', () => {
    audio.node.port.postMessage({
        type: 'dead',
        slot: 2
    });
});

document.getElementById('stop-sound-button').addEventListener('click', () => {
    audio.snd_clear();
});