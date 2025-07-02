"use strict"

// xorshift random number generator
const xorshift32 = function() {
    var xorshift = 0x12345678;   // random-number-generator seed

    return function() {
        let x = xorshift;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        return (xorshift = x);
    }
}();
