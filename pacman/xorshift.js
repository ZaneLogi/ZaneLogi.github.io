"use strict"

let xorshift = 0x12345678;   // random-number-generator seed

// xorshift random number generator
function xorshift32() {
    let x = xorshift;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return (xorshift = x);
}