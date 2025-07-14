"use strict"

const tWait = {
    init: function(context) {
        this.ticks = context.ticks;
    },
    tick: function() {
        if (--this.ticks == 0)
            return false;
        return true;
    }
};

const tPrintMessage = {
    init: function(context) {
        this.x = context.x;
        this.y = context.y;
        this.str = context.str;
        this.delay = 7;
        this.i = 0;
        this.wait = 0;
    },
    tick: function() {
        if (this.wait == 0) {
            const ch = this.str[this.i];
            gfx.drawChar(this.x, this.y, ch);
            this.x += 8;
            this.i++;
            if (this.i >= this.str.length)
                return false;
            if (this.delay != 0)
                this.wait++;
            return true;
        }
        else {
            if (this.wait >= this.delay) {
                this.wait = 0;
            }
            else {
                this.wait++;
            }
            return true;
        }
    }
};

const tDrawScoreTableSprites = {
    init: function() {},
    tick: function() {
        gfx.drawSprite(96-4, 112, resource.saucerImages[0]);
        gfx.drawSprite(96, 96, resource.alienImages[2][0]);
        gfx.drawSprite(96, 80, resource.alienImages[1][1]);
        gfx.drawSprite(96, 64, resource.alienImages[0][0]);
        return false;
    }
};

const tAnimateSprite = {
    init: function(context) {
        Object.assign(this, context);
    },
    tick: function() {
        this.image_form++;
        this.x_coord += this.delta_x;
        this.y_coord += this.delta_y;
        if (this.x_coord == this.x_target)
            return false;
        gfx.drawSprite(this.x_coord, this.y_coord,
            resource.alienImages[this.base_image][this.image_form & 0x04 ? 1 : 0]);
        return true;
    }
};

const tEraseRect = {
    init: function(context) {
        Object.assign(this, context);
    },
    tick: function() {
        gfx.eraseRect(this.x, this.y, this.w, this.h);
    }
};

const tClearPlayField = {
    init: function(context) {
    },
    tick: function() {
        gfx.clearPlayField();
        return false;
    }
};

const tIF = {
    init: function(context) {this.context = context},
    tick: function() {
        if (!this.context.test()) {
            while (++game.taskIndex < taskList.length) {
                const task = taskList[game.taskIndex];
                if (task.type == tTAG && task.context.tag == this.context.OR) {
                    break;
                }
            }
        }

        return false; // goto next task
    }
};

const tGOTO = {
    init: function(context) {this.context = context},
    tick: function() {
        while (++game.taskIndex < taskList.length) {
            const task = taskList[game.taskIndex];
            if (task.type == tTAG && task.context.tag == this.context.GOTO) {
                break;
            }
        }
        return false; // goto next task
    }
};

const tTAG = {
    init: function(context) {this.context = context},
    tick: function() {
        return false;
    }
};

const taskList = [
    { type: tWait, context: {ticks: 0x40}},
    { type: tIF, context: {test: () => game.splashAnimate, OR: "play_y"}},
        { type: tPrintMessage, context: {x:128, y:184, str:message_play_uy}},
        { type: tGOTO, context: {GOTO: "endif_play_y"}},
    { type: tTAG, context: {tag: "play_y"}},
        { type: tPrintMessage, context: {x:128, y:184, str:message_play_y}},
    { type: tTAG, context: {tag: "endif_play_y"}},
    { type: tPrintMessage, context: {x:88, y:160, str:message_invaders}},
    { type: tWait, context: {ticks: 0x40}},
    { type: tPrintMessage, context: {x:64, y:128, str:message_adv}},
    { type: tDrawScoreTableSprites, context: null},
    { type: tWait, context: {ticks: 0x40}},
    { type: tPrintMessage, context: {x:112, y:112, str:message_myst}},
    { type: tPrintMessage, context: {x:112, y:96, str:message_30_pts}},
    { type: tPrintMessage, context: {x:112, y:80, str:message_20_pts}},
    { type: tPrintMessage, context: {x:112, y:64, str:message_10_pts}},
    { type: tWait, context: {ticks: 0x80}},
    { type: tIF, context: {test: () => game.splashAnimate, OR: "no_anim_uy"}},
        // Animate sprite from Y=FE to Y=9E step -1
        { type: tAnimateSprite, context: splash_screen_animation[0]},
        // Animate sprite from Y=98 to Y=FF step 1
        { type: tAnimateSprite, context: splash_screen_animation[1]},
        { type: tWait, context: {ticks: 0x40}},
        // Animate sprite from Y=FF to Y=97 step 1
        { type: tAnimateSprite, context: splash_screen_animation[2]},
        { type: tWait, context: {ticks: 0x40}},
        { type: tEraseRect, context: {x:158, y:184, w:10, h:8}},
        { type: tWait, context: {ticks: 0x80}},
    { type: tTAG, context: {tag: "no_anim_uy"}},
    { type: tClearPlayField, context: null},
    { type: tPrintMessage, context: {x:96, y:136, str:message_coin}},
    { type: tIF, context: {test: () => game.splashAnimate, OR: "no_char_c"}},
        { type: tPrintMessage, context: {x:152, y:136, str:[0x02]}},
    { type: tTAG, context: {tag: "no_char_c"}},
    { type: tPrintMessage, context: {x:80, y:104, str:message_p1or2}},
    { type: tPrintMessage, context: {x:80, y:80, str:message_1_coin}},
    { type: tPrintMessage, context: {x:80, y:56, str:message_2_coins}},
    { type: tIF, context: {test: () => game.splashAnimate, OR: "no_anim_c"}},
        { type: tAnimateSprite, context: splash_screen_animation[3]},
        // TODO: shoot the letter 'C'
        { type: tPrintMessage, context: {x:152, y:136, str:[0x26]}},
    { type: tTAG, context: {tag: "no_anim_c"}},
    { type: tWait, context: {ticks: 0x80}},
    { type: tClearPlayField, context: null},
];