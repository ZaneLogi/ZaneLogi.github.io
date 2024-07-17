let devtools = new function() {
    this.seq = 0;

    this.run = function() {
        if (this.seq == 0) {
            framebuffer.clear();
            this.pos = 0;
            this.pos2 = 0;
            this.seq = 1;
        }

        console.log("currnet seq = %d", this.seq)

        let k = 0;

        switch(this.seq) {
        case 1: // draw tiles
            framebuffer.clear();
            draw_tilesBank = 0;
            draw_setfb(4, 4);
            draw_tilesListImm(`TILES@BANK@${this.pos}\xFE`);
        
            for (let i = 0; i < 0x10; i++) {
                draw_setfb(80 + i * 0x0a, 14);
                draw_tile((i<10?0x30:'A'.charCodeAt()-10) + i);
                draw_setfb(64, 30 + i * 0x0a);
                draw_tile((i<10?0x30:'A'.charCodeAt()-10) + i);
            }
        
            draw_tilesBank = this.pos;
            for (let i = 0; i < 0x10; i++) {
                for (let j = 0; j < 0x10; j++) {
                    draw_setfb(80 + j * 0x0a, 30 + i * 0x0a);
                    draw_tile(k++);
                }
            }

            this.seq = 10;
            framebuffer.updateCanvas();
            break;

        case 10:  /* wait for key pressed */
            if (control_status.fire())
                this.seq = 98;
            if (control_status.up())
                this.seq = 12;
            if (control_status.down())
                this.seq = 13;
            if (control_status.right())
                this.seq = 11;
            break;

        case 11:  /* wait for key released */
            if (!control_status.right()) {
                this.pos = 0;
                this.seq = 21;
                this.run();
                return;
            }
            break;

        case 12:  /* wait for key released */
            if (!control_status.up()) {
                if (this.pos < 2) this.pos++;
                this.seq = 1;
                this.run();
                return;
            }
            break;

        case 13:  /* wait for key released */
            if (!control_status.down()) {
                if (this.pos > 0) this.pos--;
                this.seq = 1;
                this.run();
                return;
            }
            break;

        case 21: // draw sprites
            framebuffer.clear();
            draw_tilesBank = 0;
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
            framebuffer.updateCanvas();
            break;

        case 30:  /* wait for key pressed */
            if (control_status.fire())
                this.seq = 98;
            if (control_status.up())
                this.seq = 32;
            if (control_status.down())
                this.seq = 33;
            if (control_status.left())
                this.seq = 31;
            if (control_status.right())
                this.seq = 40;
            break;

        case 31:  /* wait for key released */
            if (!control_status.left()) {
                this.pos = 0;
                this.seq = 1;
                this.run();
                return;
            }
            break;

        case 32:  /* wait for key released */
            if (!control_status.up()) {
                if (this.pos < SPRITES_NBR_SPRITES - 32) this.pos += 32;
                this.seq = 21;
                this.run();
                return;
            }
            break;

        case 33:  /* wait for key released */
            if (!control_status.down()) {
                if (this.pos > 0) this.pos -= 32;
                this.seq = 21;
                this.run();
                return;
            }
            break;

        case 40: // draw blocks
            framebuffer.clear();
            if (this.pos2 == 0) this.pos2 = 1;
            draw_setfb(4, 4);
            draw_tilesBank = 0;
            let s = "BLOCKS@0X" + this.pos.toString(16).toUpperCase()
                + "@TO@0X" + (this.pos+4*8-1).toString(16).toUpperCase()
                 + "@WITH@BANK@" + this.pos2.toString() + "\xFE";
            draw_tilesListImm(s);
            draw_tilesBank = this.pos2;
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
                        for (j = 0; j < 4; j++) { // tile col
                            draw_setfb(page_xoff + j * 8 + l * block_spacing, page_yoff + i * 8 + k * block_spacing);
                            draw_tile(block[i * 4 + j]);
                        }
                    }
                }
            }
            this.seq = 41;
            framebuffer.updateCanvas();
            break;

        case 41:
            if (control_status.fire())
                this.seq = 98;
            if (control_status.up())
                this.seq = 42;
            if (control_status.down())
                this.seq = 43;
            if (control_status.left())
                this.seq = 44;
            if (control_status.pause())
                this.seq = 45;
            break;

        case 42:
            if (!control_status.up()) {
                if (this.pos < MAP_NBR_BLOCKS - 8*4) this.pos += 8 * 4;
                this.seq = 40;
                this.run();
                return;
            }
            break;
            
        case 43:
            if (!control_status.down()) {
                if (this.pos > 0) this.pos -= 8 * 4;
                this.seq = 40;
                this.run();
                return;
            }
            break;
            
        case 44:
            if (!control_status.left()) {
                this.pos = 0;
                this.pos2 = 0;
                this.seq = 21;
                this.run();
                return;
            }
            break;

        case 45:
            if (!control_status.pause()) {
                // change the tile bank
                if (this.pos2 == 1) this.pos2 = 2;
                else this.pos2 = 1;
                this.seq = 40;
                this.run();
                return;
            }
            break;

        case 98:
            if (!control_status.fire()) {
                this.seq = 99;
            }
            break;
        } // end of switch

        if (this.seq == 99) {
            // reset from start
            this.seq = 0;
            this.run();
            return;
        }
    }
}
