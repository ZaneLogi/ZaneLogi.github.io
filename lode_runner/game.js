"use strict"

const game = {}

game.init = function() {
    this.stage = new Stage;
    this.stage.buildLevelMap(level001);
    console.log(this.stage);

    sys_evt.init();
    gfx.init();

    this.render();

    this.processEvents();
}

game.render = function() {
    /*
    let index = 0;
    for (let j = 0, y = 0; j < 10; j++, y += 11) {
        for (let i = 0, x = 10; i < 10; i++, x += 10, index++) {
            gfx.drawSprite(index, x, y);
        }
    }

    return;
    */

    gfx.drawStage(this.stage);
    

    // play sound
}


/*
void LodeRunnerApp::processInput()
{
    switch (m_gameAction) {
    case ACTION_LEFT:
        m_stage->getHero()->requestMove(LodeRunnerCharacter::MOVE::RUN_LEFT);
        break;
    case ACTION_RIGHT:
        m_stage->getHero()->requestMove(LodeRunnerCharacter::MOVE::RUN_RIGHT);
        break;
    case ACTION_UP:
        m_stage->getHero()->requestMove(LodeRunnerCharacter::MOVE::CLIMB_UP);
        break;
    case ACTION_DOWN:
        m_stage->getHero()->requestMove(LodeRunnerCharacter::MOVE::CLIMB_DOWN);
        break;
    case ACTION_DIG_LEFT:
        m_stage->getHero()->requestMove(LodeRunnerCharacter::MOVE::DIG_LEFT);
        break;
    case ACTION_DIG_RIGHT:
        m_stage->getHero()->requestMove(LodeRunnerCharacter::MOVE::DIG_RIGHT);
        break;
    case ACTION_NEXT_LEVEL:
        if (m_currentLevel < 149)
        {
            m_currentLevel++;
            m_stage->buildLevelMap(CLASSIC_LEVEL_MAPS[m_currentLevel]);
        }
        break;
    case ACTION_PREVIOUS_LEVEL:
        if (m_currentLevel > 0)
        {
            m_currentLevel--;
            m_stage->buildLevelMap(CLASSIC_LEVEL_MAPS[m_currentLevel]);
        }
        break;
    }

    m_gameAction = ACTION_NONE;
}

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

void LodeRunnerApp::renderGame()
{
    //Clear screen
    SDL_RenderClear(m_renderer);

    renderStage();
}

void LodeRunnerApp::paintScreen()
{
    //Update screen
    SDL_RenderPresent(m_renderer);
}











*/

const input = {
    enabled: false,
    has_input: false,

    left_pressed: false,
    right_pressed: false,
    fire_pressed: false,

    enable: function() {
        this.enabled = true;
        this.has_input = false;
    },

    disable: function() {
        this.enabled = false;
        this.has_input = false;
    },
};

game.processEvents = function () {
    if (input.enabled) {
        for (const e of sys_evt.events) {
            switch(e.type) {
                case sys_evt.KEY_DOWN:
                {
                    const code = e.context.code;
                    if (code == "KeyA") {
                        input.left_pressed = true;
                    }
                    else if (code == "KeyD") {
                        input.right_pressed = true;
                    }
                    else if (code == "KeyW") {
                        input.fire_pressed = true;
                    }

                    input.has_input = true;
                    break;
                }
                case sys_evt.KEY_UP:
                {
                    const code = e.context.code;
                    if (code == "KeyA") {
                        input.left_pressed = false;
                    }
                    else if (code == "KeyD") {
                        input.right_pressed = false;
                    }
                    else if (code == "KeyW") {
                        input.fire_pressed = false;
                    }

                    break;
                }
            }
        }
    }

    sys_evt.reset();
}
