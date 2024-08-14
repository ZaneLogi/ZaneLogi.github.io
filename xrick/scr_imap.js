"use strict"

const screen_introMap = {
    seq: 0,
};

screen_introMap.do_frame = function() {
    switch (this.seq) {
    case 0:
        framebuffer.clear();
        draw_context.draw_tilesBank = 0;
        draw_context.draw_tllst = screen_imaptext[game_context.game_map];
        draw_context.draw_tllst_index = 0;
        draw_setfb(32, 0);
        draw_tilesSubList();

        draw_setfb(32, 96);
        draw_tilesList();

        this.init();
        this.nextstep();
        this.drawcenter();
        this.drawtb();
        this.drawlr();
        this.drawsprite();

        game.setmusic(map_maps[game_context.game_map].tune, 1);

        this.seq = 1;
        break;

    case 1:  /* top and bottom borders */
        this.drawtb();
        this.seq = 2;
        break;

    case 2:  /* background and sprite */
        this.anim();
        this.drawcenter();
        this.drawsprite();
        this.seq = 3;
        break;

    case 3:  /* all borders */
        this.drawtb();
        this.drawlr();
        this.seq = 1;
        break;

    case 4:  /* wait for key release */
        if (!(control.control_status & CONTROL_FIRE))
            this.seq = 5;
        break;
    }

    if (control.control_status & CONTROL_FIRE) {  /* end as soon as key pressed */
        this.seq = 4;
    }

    if (control.control_status & CONTROL_EXIT)  /* check for exit request */
        return SCREEN_EXIT;

    if (this.seq == 5) {  /* end as soon as key pressed */
        framebuffer.clear();
        this.seq = 0;
        return SCREEN_DONE;
    }
    else
        return SCREEN_RUNNING;
};

screen_introMap.init = function() {
    this.run = true;
    this.flipflop = 0;
    this.step = screen_imapsofs[game_context.game_map];
    this.spx = screen_imapsteps[this.step].dx;
    this.spy = screen_imapsteps[this.step].dy;
    this.step++;
    this.spnum = 0;
};

screen_introMap.nextstep = function() {
    if (screen_imapsteps[this.step].count) {
        this.count = screen_imapsteps[this.step].count;
        this.spdx = screen_imapsteps[this.step].dx;
        this.spdy = screen_imapsteps[this.step].dy;
        this.spbase = screen_imapsteps[this.step].base;
        this.spoffs = 0;
        this.step++;
    }
    else {
        this.run = false;
    }
};

screen_introMap.anim = function() {
    if (this.run) {
        let i = screen_imapsl[this.spbase + this.spoffs];
        if (i == 0) {
            this.spoffs = 0;
            i = screen_imapsl[this.spbase];
        }
        this.spnum = i;
        this.spoffs++;
        this.spx += this.spdx;
        this.spy += this.spdy;
        this.count--;
        if (this.count == 0)
            this.nextstep();
  }
}

screen_introMap.drawcenter = function() {
    const tn0 = [ 0x07, 0x5B, 0x7F, 0xA3, 0xC7 ];

    let tn = tn0[game_context.game_map];
    for (let i = 0; i < 6; i++) {
        draw_setfb(128, (24 + 8 * i));
        for (let j = 0; j < 6; j++)
            draw_tile(tn++);
  }
};

screen_introMap.drawtb = function() {
    this.flipflop++;
    if (this.flipflop & 0x01) {
        draw_setfb(128, 16);
        for (let i = 0; i < 6; i++)
            draw_tile(0x40);
        draw_setfb(128, 72);
        for (let i = 0; i < 6; i++)
            draw_tile(0x06);
    }
    else {
        draw_setfb(128, 16);
        for (let i = 0; i < 6; i++)
            draw_tile(0x05);
        draw_setfb(128, 72);
        for (let i = 0; i < 6; i++)
            draw_tile(0x40);
    }
};

screen_introMap.drawlr = function() {
    if (this.flipflop & 0x02) {
        for (let i = 0; i < 8; i++) {
            draw_setfb(120, 16 + i * 8);
            draw_tile(0x04);
            draw_setfb(176, 16 + i * 8);
            draw_tile(0x04);
        }
      }
      else {
        for (let i = 0; i < 8; i++) {
            draw_setfb(120, 16 + i * 8);
            draw_tile(0x2B);
            draw_setfb(176, 16 + i * 8);
            draw_tile(0x2B);
        }
    }
};

screen_introMap.drawsprite = function() {
    draw_sprite(this.spnum, 128 + ((this.spx << 1) & 0x1C), 24 + (this.spy << 1));
};
