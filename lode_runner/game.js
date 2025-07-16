"use strict"

const ACTION = {
    NONE: 0, LEFT:1, RIGHT:2, UP:3, DOWN:4, DIG_LEFT:5, DIG_RIGHT:6,
    NEXT_LEVEL: 7, PREVIOUS_LEVEL:8
};

const game = {}

game.init = function() {
    this.stage = new Stage;
    this.stage.buildLevelMap(level001);
    console.log(this.stage);

    sys_evt.init();
    gfx.init();

    this.action = ACTION.NONE;

    const FPS = 30;
    runloop.start(() => this.doFrame(), 1000/FPS);
}

game.doFrame = function() {
    this.processEvents();
    this.processInput();
    this.stage.update();
    this.render();
}

game.render = function() {
    gfx.clearScreen();
    gfx.drawStage(this.stage);

    // play sound
}


/*


void LodeRunnerApp::renderStage()
{
    // play sound
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
}

void LodeRunnerApp::drawText(const char* text, int x, int y)
{
    SDL_Rect rcSrc, rcDst;
    char ch;

    rcDst.x = x;
    rcDst.y = y;

    while ((ch = *text++) != '\0')
    {
        auto tex = m_resMgr.getCharAppearance(ch, rcSrc);
        rcDst.w = rcSrc.w;
        rcDst.h = rcSrc.h;
        SDL_RenderCopy(m_renderer, tex, &rcSrc, &rcDst);  
        rcDst.x += rcSrc.w;
    }
}


void LodeRunnerApp::onEvent(const SDL_Event& e)
{
    if (e.type == SDL_KEYDOWN)
    {
        switch (e.key.keysym.scancode) {
        case SDL_SCANCODE_LEFT:
            m_gameAction = ACTION_LEFT;
            break;
        case SDL_SCANCODE_RIGHT:
            m_gameAction = ACTION_RIGHT;
            break;
        case SDL_SCANCODE_UP:
            m_gameAction = ACTION_UP;
            break;
        case SDL_SCANCODE_DOWN:
            m_gameAction = ACTION_DOWN;
            break;
        case SDL_SCANCODE_Z:
            m_gameAction = ACTION_DIG_LEFT;
            break;
        case SDL_SCANCODE_X:
            m_gameAction = ACTION_DIG_RIGHT;
            break;
        default:
            m_gameAction = ACTION_NONE;
            break;
        }
    }
    else if (e.type == SDL_KEYUP)
    {
        switch (e.key.keysym.scancode) {
        case SDL_SCANCODE_UP:
        case SDL_SCANCODE_RIGHT:
            if (e.key.keysym.mod && (KMOD_LCTRL | KMOD_RCTRL))
            {
                m_gameAction = ACTION_NEXT_LEVEL;
            }
            break;
        case SDL_SCANCODE_DOWN:
        case SDL_SCANCODE_LEFT:
            if (e.key.keysym.mod && (KMOD_LCTRL | KMOD_RCTRL))
            {
                m_gameAction = ACTION_PREVIOUS_LEVEL;
            }
            break;
        }
    }
}

************************************
void LodeRunnerApp::update()
{
    updateGame();
}

void LodeRunnerApp::render()
{
    renderGame();
    paintScreen();
}
*************************************

void LodeRunnerApp::updateGame()
{
    processInput();

    m_stage->update();

    switch (m_stage->getStatus()) {
    case LodeRunnerStage::NEW_LEVEL:
    {
        if (m_currentLevel < 149)
        {
            m_currentLevel++;
            m_stage->buildLevelMap(CLASSIC_LEVEL_MAPS[m_currentLevel]);
        }
        break;
    }
    case LodeRunnerStage::CAPTURED:
    {
        m_stage->buildLevelMap(CLASSIC_LEVEL_MAPS[m_currentLevel]);
        break;
    }
    }
}

*/
game.processInput = function() {
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
        /*if (m_currentLevel < 149)
        {
            m_currentLevel++;
            m_stage->buildLevelMap(CLASSIC_LEVEL_MAPS[m_currentLevel]);
        }*/
        break;
    case ACTION.PREVIOUS_LEVEL:
        /*if (m_currentLevel > 0)
        {
            m_currentLevel--;
            m_stage->buildLevelMap(CLASSIC_LEVEL_MAPS[m_currentLevel]);
        }*/
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
            break;
        }
        }
    }

    sys_evt.reset();
}
