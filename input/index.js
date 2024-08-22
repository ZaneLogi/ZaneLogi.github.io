"use strict"

const info = document.getElementById("info");

const keys = {};

function onkeydown(e) {
    let data = keys[e.code] || { count: 0 };
    console.assert(data.count >= 0);
    data.e = e;
    data.count++;
    keys[e.code] = data;
    updateInfo();
}

function onkeyup(e) {
    let data = keys[e.code];
    console.assert(data);
    delete keys[e.code];
    updateInfo();
}

function updateInfo() {
    const strings = Object.values(keys).map(
        data => `[code(${data.e.code}):key(${data.e.key}):${data.count}`);
    info.innerHTML = strings.length > 0 ? strings.join(", ") : "[Press any key]";
}


window.addEventListener("keydown", (e) => onkeydown(e));
window.addEventListener("keyup", (e) => onkeyup(e));