"use strict"

const original_div = document.getElementById("original");
const encoded_div = document.getElementById("encoded");
const decoded_div = document.getElementById("decoded");

function toHexString(byteArray) {
    return Array.from(byteArray, function(byte) {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join(' ')
}
/*
Encoded: 00 c3 88 19 43 46 e0 c0 80
1 0000 0000 : clear code 0x100
0 0110 0001 : 0x61
0 0110 0010 : 0x62
0 0110 0011 : 0x63
0 0110 0100 : 0x64 
1 0000 0010 : 0x102 
1 0000 0011 : 0x103
1 0000 0001 : end code 0x101


Original: 61 62 63 64 61 62 62 63

index RM    NC
==============
0     -1    0
1     -1    1
2     -1    2
...
0xff  -1    255
0x100 -1    256 clear code 
0x101 -1    257 end code

0x102 0x61  0x62
0x103 0x62  0x63
0x104 0x63  0x64
0x105 0x64  0x61
0x106 0x102 0x62
*/

let lzw;

function dic_dump(dic) {
    const indexColWidth = 4;
    const rmColWidth = 4;
    const ncColWidth = 4;

    const titleIndex = 'ID'.padEnd(indexColWidth, ' ');
    const titleRM = 'RM'.padStart(rmColWidth, ' ');
    const titleNC = 'NC'.padStart(ncColWidth, ' ');

    console.log(`|${titleIndex}|${titleRM}|${titleNC}|`);

    for (let code = dic.END_CODE + 1; code <= dic.dic_last_position; code++) {
        const indexC = code.toString().padEnd(indexColWidth, ' ');
        const rmC = dic.dic[code].prefix.toString().padStart(rmColWidth, ' ');
        const ncC = dic.dic[code].character.toString().padStart(ncColWidth, ' ');
        console.log(`|${indexC}|${rmC}|${ncC}|`);
    }
}

function test() {
    let data = [];
    for (const ch of "abcdabbc") {
        data.push(ch.charCodeAt(0));
    }

    original_div.innerHTML = "Original: " + toHexString(data);
    //console.log("Original: ", data);

    lzw = new LZW();
    let encoded = [];
    lzw.encode(data, encoded, 8);

    encoded_div.innerHTML = "Encoded: " + toHexString(encoded);
    //console.log("Encoded: ", encoded);

    let decoded = [];
    lzw.decode(encoded, decoded, 8);

    decoded_div.innerHTML = "Decoded: " + toHexString(decoded);
    //console.log("Decoded: ", decoded);
}

window.addEventListener("load", () => test());