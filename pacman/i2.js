"use strict"

// create an i2
function i2(x, y) {
    return {x: x, y: y};
}

// add two i2
function add_i2(v0, v1) {
    return {x: v0.x + v1.x, y: v0.y + v1.y};
}

// subtract two i2
function sub_i2(v0, v1) {
    return {x: v0.x - v1.x, y: v0.y - v1.y};
}

// multiply i2 with scalar
function mul_i2(v, scalar) {
    return {x: v.x * scalar, y: v.y * scalar};
}

// squared-distance between two int2_t
function squared_distance_i2(v0, v1) {
    const dx = v1.x - v0.x;
    const dy = v1.y - v0.y;
    return dx * dx + dy * dy;
}

// check if two int2_t are equal
function equal_i2(v0, v1) {
    return (v0.x == v1.x) && (v0.y == v1.y);
}

// check if two int2_t are nearly equal
function nearequal_i2(v0, v1, tolerance) {
    return (Math.abs(v1.x - v0.x) <= tolerance) && (Math.abs(v1.y - v0.y) <= tolerance);
}