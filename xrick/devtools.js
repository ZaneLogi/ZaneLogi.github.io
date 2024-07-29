"use strict"

const devtools = new function() {
    this.seq = 0;
    this.pos = 0;
    this.pos2 = 0;

    this.do_frame = function() {
        if (this.seq == 0) {
            framebuffer.clear();
            this.seq = 1;
        }

        let k = 0;

        switch(this.seq) {
        case 1: // draw tiles
            framebuffer.clear();
            draw_context.draw_tilesBank = 0;
            draw_setfb(4, 4);
            draw_tilesListImm(`TILES@BANK@${this.pos}\xFE`);

            for (let i = 0; i < 0x10; i++) {
                draw_setfb(80 + i * 0x0a, 14);
                draw_tile((i<10?0x30:'A'.charCodeAt()-10) + i);
                draw_setfb(64, 30 + i * 0x0a);
                draw_tile((i<10?0x30:'A'.charCodeAt()-10) + i);
            }

            draw_context.draw_tilesBank = this.pos;
            for (let i = 0; i < 0x10; i++) {
                for (let j = 0; j < 0x10; j++) {
                    draw_setfb(80 + j * 0x0a, 30 + i * 0x0a);
                    draw_tile(k++);
                }
            }

            this.seq = 10;
            //framebuffer.dump(`tiles_bank_${this.pos}`);
            break;

        case 10:  /* wait for key pressed */
            if (control.control_status & CONTROL_FIRE)
                this.seq = 98;
            if (control.control_status & CONTROL_UP)
                this.seq = 12;
            if (control.control_status & CONTROL_DOWN)
                this.seq = 13;
            if (control.control_status & CONTROL_RIGHT)
                this.seq = 11;
            break;

        case 11:  /* wait for key released */
            if (!(control.control_status & CONTROL_RIGHT)) {
                this.pos = 0;
                this.seq = 21;
            }
            break;

        case 12:  /* wait for key released */
            if (!(control.control_status & CONTROL_UP)) {
                if (this.pos < 2) this.pos++;
                this.seq = 1;
            }
            break;

        case 13:  /* wait for key released */
            if (!(control.control_status & CONTROL_DOWN)) {
                if (this.pos > 0) this.pos--;
                this.seq = 1;
            }
            break;

        case 21: // draw sprites
            framebuffer.clear();
            draw_context.draw_tilesBank = 0;
            draw_setfb(4, 4);
            draw_tilesListImm("SPRITES\xFE");
            for (let i = 0; i < 8; i++) {
                draw_setfb(0x08 + 0x20 + i * 0x20, 0x30 - 26);
                draw_tile((i<10?0x30:'A'.charCodeAt()-10) + i);
                draw_setfb(0x08 + 0x20 + i * 0x20, 0x30 - 16);
                draw_tile((i+8<10?0x30:'A'.charCodeAt()-10) + i+8);
            }
            for (let i = 0; i < 4; i++) {
                k = this.pos + i * 8;
                draw_setfb(0x20 - 16, 0x08 + 0x30 + i * 0x20);
                let j = k%16;
                k = Math.floor(k/16);
                draw_tile((j<10?0x30:'A'.charCodeAt()-10) + j);
                draw_setfb(0x20 - 26, 0x08 + 0x30 + i * 0x20);
                j = k%16;
                draw_tile((j<10?0x30:'A'.charCodeAt()-10) + j);
            }
            k = this.pos;
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 8; j++) {
                    if (k < SPRITES_NBR_SPRITES)
                        draw_sprite(k++, 0x20 + j * 0x20, 0x30 + i * 0x20);
                }
            }
            this.seq = 30;
            //framebuffer.dump(`sprites_${this.pos}`);
            break;

        case 30:  /* wait for key pressed */
            if (control.control_status & CONTROL_FIRE)
                this.seq = 98;
            if (control.control_status & CONTROL_UP)
                this.seq = 32;
            if (control.control_status & CONTROL_DOWN)
                this.seq = 33;
            if (control.control_status & CONTROL_LEFT)
                this.seq = 31;
            if (control.control_status & CONTROL_RIGHT)
                this.seq = 40;
            break;

        case 31:  /* wait for key released */
            if (!(control.control_status & CONTROL_LEFT)) {
                this.pos = 0;
                this.seq = 1;
            }
            break;

        case 32:  /* wait for key released */
            if (!(control.control_status & CONTROL_UP)) {
                if (this.pos < SPRITES_NBR_SPRITES - 32) this.pos += 32;
                this.seq = 21;
            }
            break;

        case 33:  /* wait for key released */
            if (!(control.control_status & CONTROL_DOWN)) {
                if (this.pos > 0) this.pos -= 32;
                this.seq = 21;
            }
            break;

        case 40: // draw blocks
            framebuffer.clear();
            if (this.pos2 == 0) this.pos2 = 1;
            draw_setfb(4, 4);
            draw_context.draw_tilesBank = 0;
            let s = "BLOCKS@0X" + this.pos.toString(16).toUpperCase()
                + "@TO@0X" + (this.pos+4*8-1).toString(16).toUpperCase()
                 + "@WITH@BANK@" + this.pos2.toString() + "\xFE";
            draw_tilesListImm(s);
            draw_context.draw_tilesBank = this.pos2;
            // draw 32 blocks in one page, row first then col
            const page_xoff = 20;
            const page_yoff = 30;
            const block_spacing = 36;
            for (let l = 0; l < 8; l++) {// block col
                for (let k = 0; k < 4; k++) { // block row
                    const block_index = this.pos + l + k * 8;
                    if (block_index >= MAP_NBR_BLOCKS)
                        continue;
                    let block = map_blocks[block_index];
                    // a block consists of 16 tiles (4 x 4)
                    for (let i = 0; i < 4; i++) { // tile row
                        for (let j = 0; j < 4; j++) { // tile col
                            draw_setfb(page_xoff + j * 8 + l * block_spacing, page_yoff + i * 8 + k * block_spacing);
                            draw_tile(block[i * 4 + j]);
                        }
                    }
                }
            }
            this.seq = 41;
            break;

        case 41:
            if (control.control_status & CONTROL_FIRE)
                this.seq = 98;
            if (control.control_status & CONTROL_UP)
                this.seq = 42;
            if (control.control_status & CONTROL_DOWN)
                this.seq = 43;
            if (control.control_status & CONTROL_LEFT)
                this.seq = 44;
            if (control.control_status & CONTROL_PAUSE)
                this.seq = 45;
            break;

        case 42:
            if (!(control.control_status & CONTROL_UP)) {
                if (this.pos < MAP_NBR_BLOCKS - 8*4) this.pos += 8 * 4;
                this.seq = 40;
            }
            break;

        case 43:
            if (!(control.control_status & CONTROL_DOWN)) {
                if (this.pos > 0) this.pos -= 8 * 4;
                this.seq = 40;
            }
            break;

        case 44:
            if (!(control.control_status & CONTROL_LEFT)) {
                this.pos = 0;
                this.pos2 = 0;
                this.seq = 21;
            }
            break;

        case 45:
            if (!(control.control_status & CONTROL_PAUSE)) {
                // change the tile bank
                if (this.pos2 == 1) this.pos2 = 2;
                else this.pos2 = 1;
                this.seq = 40;
            }
            break;

        case 98:
            if (!(control.control_status & CONTROL_FIRE)) {
                this.seq = 99;
            }
            break;
        } // end of switch

        if (control.control_status & CONTROL_EXIT)  /* check for exit request */
           return SCREEN_EXIT;

        if (this.seq == 99) { /* we're done */
            framebuffer.clear();
            this.seq = 0;
            return SCREEN_DONE;
        }

        return SCREEN_RUNNING;
    };
};
