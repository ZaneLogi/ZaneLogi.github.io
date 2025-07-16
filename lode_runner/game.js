"use strict"

const ACTION = {
    NONE: 0, LEFT:1, RIGHT:2, UP:3, DOWN:4, DIG_LEFT:5, DIG_RIGHT:6,
    NEXT_LEVEL: 7, PREVIOUS_LEVEL:8
};

const game = {}

game.init = function() {
    this.levelNum = 0;
    this.stage = new Stage;
    this.stage.levelStatus = Stage.LEVEL_STATUS.NEW_LEVEL;

    sys_evt.init();
    gfx.init();

    this.action = ACTION.NONE;

    const FPS = 30;
    runloop.start(() => this.doFrame(), 1000/FPS);
}

game.doFrame = function() {
    switch (this.stage.levelStatus) {
        case Stage.LEVEL_STATUS.NEW_LEVEL:
            this.levelNum = (this.levelNum < 150 ? this.levelNum + 1 : 1);

            this.stage.buildLevelMap(classicData[this.levelNum-1]);
            this.stage.levelStatus = Stage.LEVEL_STATUS.WAIT_START;

            iris_wipe.start(140, 88, 5, 280, 176);
            break;
        case Stage.LEVEL_STATUS.CAPTURED:
            this.stage.buildLevelMap(classicData[this.levelNum-1]);
            this.stage.levelStatus = Stage.LEVEL_STATUS.WAIT_START;

            iris_wipe.start(140, 88, 5, 280, 176);
            break;
    }

    if (iris_wipe.stop) {
        this.processEvents();
        this.processInput();
        this.stage.update();
    }
    else {
        sys_evt.reset();
        iris_wipe.step();
    }
    this.render();
}

game.render = function() {
    gfx.clearScreen();
    gfx.drawStage(this.stage);
    if (!iris_wipe.stop)
        iris_wipe.render(gfx.canvas_ctx);
    gfx.drawStatus();

    // play sound
    /*
    auto move = hero->getCurrentMove();
    if (move == LodeRunnerCharacter::FALL_DOWN)
    {
        playSound(ResourceManager::FALL_DOWN, false);
    }
    else if (move == LodeRunnerCharacter::DIG_LEFT || move == LodeRunnerCharacter::DIG_RIGHT)
    {
        playSound(ResourceManager::DIG);
    }
    else if (m_lastSoundPlaying == ResourceManager::FALL_DOWN)
    {
        stopSound();
    }
    */
}

game.processInput = function() {
    if (this.stage.levelStatus == Stage.LEVEL_STATUS.WAIT_START) {
        if (this.action != ACTION.NONE)
            this.stage.levelStatus = Stage.LEVEL_STATUS.RUNNING;
    }

    switch (this.action) {
    case ACTION.LEFT:
        this.stage.hero.userMove(Actor.MOVE.RUN_LEFT);
        break;
    case ACTION.RIGHT:
        this.stage.hero.userMove(Actor.MOVE.RUN_RIGHT);
        break;
    case ACTION.UP:
        this.stage.hero.userMove(Actor.MOVE.CLIMB_UP);
        break;
    case ACTION.DOWN:
        this.stage.hero.userMove(Actor.MOVE.CLIMB_DOWN);
        break;
    case ACTION.DIG_LEFT:
        this.stage.hero.userMove(Actor.MOVE.DIG_LEFT);
        break;
    case ACTION.DIG_RIGHT:
        this.stage.hero.userMove(Actor.MOVE.DIG_RIGHT);
        break;
    case ACTION.NEXT_LEVEL:
        this.levelNum = (this.levelNum < 150 ? this.levelNum + 1 : 1);
        this.stage.buildLevelMap(classicData[this.levelNum-1]);
        this.stage.levelStatus = Stage.LEVEL_STATUS.WAIT_START;
        break;
    case ACTION.PREVIOUS_LEVEL:
        this.levelNum = (this.levelNum > 1 ? this.levelNum - 1 : 150);
        this.stage.buildLevelMap(classicData[this.levelNum-1]);
        this.stage.levelStatus = Stage.LEVEL_STATUS.WAIT_START;
        break;
    }

    this.action = ACTION.NONE;
}

game.processEvents = function () {
    for (const e of sys_evt.events) {
        switch(e.type) {
        case sys_evt.KEY_DOWN:
        {
            const code = e.context.code;
            if (code == "KeyA") {
                this.action = ACTION.LEFT;
            }
            else if (code == "KeyD") {
                this.action = ACTION.RIGHT;
            }
            else if (code == "KeyW") {
                this.action = ACTION.UP;
            }
            else if (code == "KeyS") {
                this.action = ACTION.DOWN;
            }
            else if (code == "BracketLeft") {
                this.action = ACTION.DIG_LEFT;
            }
            else if (code == "BracketRight") {
                this.action = ACTION.DIG_RIGHT;
            }
            else {
                this.action = ACTION.NONE;
            }
            break;
        }
        case sys_evt.KEY_UP:
        {
            const code = e.context.code;
            if (code == "Digit0") {
                this.action = ACTION.NEXT_LEVEL;
            }
            else if (code == "Digit9") {
                this.action = ACTION.PREVIOUS_LEVEL;
            }
            break;
        }} // switch
    }

    sys_evt.reset();
}
