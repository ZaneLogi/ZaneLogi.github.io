"use strict"

function levelspec_init(bonus_fruit, bonus_score, fright_ticks) {
    return {
        bonus_fruit: bonus_fruit,
        bonus_score: bonus_score,
        fright_ticks: fright_ticks
    };
}

const MAX_LEVELSPEC = 21;

const levelspec_table = [
    levelspec_init(FRUIT.CHERRIES,   10,  6*60),
    levelspec_init(FRUIT.STRAWBERRY, 30,  5*60),
    levelspec_init(FRUIT.PEACH,      50,  4*60),
    levelspec_init(FRUIT.PEACH,      50,  3*60),
    levelspec_init(FRUIT.APPLE,      70,  2*60),
    levelspec_init(FRUIT.APPLE,      70,  5*60),
    levelspec_init(FRUIT.GRAPES,     100, 2*60),
    levelspec_init(FRUIT.GRAPES,     100, 2*60),
    levelspec_init(FRUIT.GALAXIAN,   200, 1*60),
    levelspec_init(FRUIT.GALAXIAN,   200, 5*60),
    levelspec_init(FRUIT.BELL,       300, 2*60),
    levelspec_init(FRUIT.BELL,       300, 1*60),
    levelspec_init(FRUIT.KEY,        500, 1*60),
    levelspec_init(FRUIT.KEY,        500, 3*60),
    levelspec_init(FRUIT.KEY,        500, 1*60),
    levelspec_init(FRUIT.KEY,        500, 1*60),
    levelspec_init(FRUIT.KEY,        500, 1   ),
    levelspec_init(FRUIT.KEY,        500, 1*60),
    levelspec_init(FRUIT.KEY,        500, 1   ),
    levelspec_init(FRUIT.KEY,        500, 1   ),
    levelspec_init(FRUIT.KEY,        500, 1   ),
    // from here on repeating
];

// get level spec for a game round
function levelspec(round) {
    console.assert(round >= 0);
    if (round >= MAX_LEVELSPEC) {
        round = MAX_LEVELSPEC-1;
    }
    return levelspec_table[round];
}
