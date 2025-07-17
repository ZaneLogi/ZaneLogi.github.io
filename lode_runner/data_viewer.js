"use strict"

const canvas = document.querySelector('canvas');
const canvas_ctx = canvas.getContext('2d');
const canvas_width = canvas.width;
const canvas_height = canvas.height;
const imageData = canvas_ctx.createImageData(canvas_width, canvas_height);
const sprites = [];
const SPRITE_W = 14;
const SPRITE_H = 11;

const TILE_W = 9;
const TILE_H = 11;
const X_TILE_NUM = 28;
const Y_TILE_NUM = 17; // 187 pixels high

const print = {
    col_num: 0,
    row_num: 10,

    charToSpriteNum: function(code) {
        if (65 <= code && code <= 90) {
            return code - 65 + 69; // A - Z
        }
        else if (48 <= code && code <= 57) {
            return code - 48 + 59; // 0 - 9
        }
        else if (code == 62) { return 95; } // >
        else if (code == 46) { return 96; } // .
        else if (code == 40) { return 97; } // (
        else if (code == 41) { return 98; } // )
        else if (code == 47) { return 99; } // /
        else if (code == 45) { return 100;} // -
        else if (code == 60) { return 101;} // <
        else { return 0; }
    },

    cursor: function(x, y) {
        this.col_num = x;
        this.row_num = y;
    },

    newline: function() {
        this.col_num = 0;
        this.row_num++;
    },

    putChar: function(chr) {
        const code = chr.charCodeAt(0);
        if (code == 10)
            this.newline();
        else {
            const sprite_num = this.charToSpriteNum(code);
            const x = 14 + this.col_num * TILE_W;
            const y = 181;//this.row_num * TILE_H;
            drawSprite(x, y, sprite_num);
            this.col_num++;
            if (this.col_num >= X_TILE_NUM) {
                this.col_num = 0;
                this.row_num++;
            }
        }
    },

    putString: function(str) {
        for (const chr of str) {
            this.putChar(chr);
        }
    },
};

function renderScreen() {
    for (let i = 0; i < 104; i++) {
        const x = (i%10) * 14;
        const y = Math.floor(i/10) * 11 + 192;
        drawSprite(x, y, i);
    }

    //print.putString("ABCZ\n0129\n<.>/(-)");

    let x = 14;
    for (let i = 0; i < 28; i++) {
        drawSprite(x, 170, 100);
        x += 9;
    }
    print.cursor(0, 16);
    print.putString("SCORE");
    print.putString("0000000");
    print.putString(" ");
    print.putString("MEN");
    print.putString("000");
    print.putString(" ");
    print.putString("LEVEL");
    print.putString("001");

    drawMap(levelMap);

    canvas_ctx.putImageData(imageData, 0, 0);
}

function drawSprite(x, y, index) {
    const bytesPerPixel = 4;
    const bytesPerLine = 280 * bytesPerPixel;

    const colorMap = [
        [0x00, 0x00, 0x00, 0xff], // black
        [0xff, 0x50, 0x00, 0xff], // orange
        [0x00, 0xaf, 0xff, 0xff], // blue
        [0xff, 0xff, 0xff, 0xff]  // white
    ];

    const pixelData = imageData.data;

    let offset = y * bytesPerLine + x * bytesPerPixel;

    let pixels = sprites[index];
    if (pixels == undefined) {
        pixels = decodeApple2HiresSprite(sprites_data[index]);
    }

    for (let h = 0; h < 11; h++) {
        const row = pixels[h];
        for (let w = 0, xoff = offset; w < 14; w++, xoff += 4) {
            pixelData.set(colorMap[row[w]], xoff);
        }
        offset += bytesPerLine;
    }

    sprites[index] = pixels;
}

//value | Character | Type
//------+-----------+-----------
//  0x0 |  <space>  | Empty space
//  0x1 |     #     | Normal Brick
//  0x2 |     @     | Solid Brick
//  0x3 |     H     | Ladder
//  0x4 |     -     | Hand-to-hand bar (Line of rope)
//  0x5 |     X     | False brick
//  0x6 |     S     | Ladder appears at end of level
//  0x7 |     $     | Gold chest
//  0x8 |     0     | Guard
//  0x9 |     &     | Player	

const EMPTY_T  = 0x00; 
const BLOCK_T  = 0x01; 
const SOLID_T  = 0x02; 
const LADDR_T  = 0x03; 
const BAR_T    = 0x04; 
const TRAP_T   = 0x05; 
const HLADR_T  = 0x06; 
const GOLD_T   = 0x07;
const GUARD_T  = 0x08;
const RUNNER_T = 0x09;

const REBORN_T = 0x10; //template: for reborn

const level001 =
"                  S         " +
"    $             S         " +
"#######H#######   S         " +
"       H----------S    $    " +
"       H    ##H   #######H##" +
"       H    ##H          H  " +
"     0 H    ##H       $0 H  " +
"##H#####    ########H#######" +
"  H                 H       " +
"  H           0     H       " +
"#########H##########H       " +
"         H          H       " +
"       $ H----------H   $   " +
"    H######         #######H" +
"    H         &  $         H" +
"############################";

function buildLevelMap(levelData) {
    const levelMap = [];
    let count = 0;
    let i = 0;
    let row = new Array(28);
    for (const chr of levelData) {
        switch (chr) {
            case " ": row[i] = EMPTY_T; break;
            case "#": row[i] = BLOCK_T; break;
            case "@": row[i] = SOLID_T; break;
            case "H": row[i] = LADDR_T; break;
            case "-": row[i] = BAR_T; break;
            case "X": row[i] = TRAP_T; break;
            case "S": row[i] = HLADR_T; break;
            case "$": row[i] = GOLD_T; break;
            case "0": row[i] = GUARD_T; break;
            case "&": row[i] = RUNNER_T; break;
            default: console.assert(false, chr); break;
        }

        count++;
        i++;
        if (count % 28 == 0) {
            levelMap.push(row);
            row = new Array(28);
            i = 0;
        }
    }
    return levelMap;
}

function drawMap(levelMap) {
    let y = 0;
    for (const row of levelMap) {
        let x = 14;
        for (const block of row) {
            drawSprite(x, y, block);
            x += 9;
        }
        y += 11;
    }
}

const levelMap = buildLevelMap(level001);
console.log(levelMap);

window.addEventListener("load", () => renderScreen());