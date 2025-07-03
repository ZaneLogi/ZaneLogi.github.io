"use strict"

// xorshift random number generator
const xorshift32 = function(seed) {
    var xorshift = seed;   // random-number-generator seed

    return function() {
        let x = xorshift;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        return (xorshift = x);
    }
}(0x12345678);
