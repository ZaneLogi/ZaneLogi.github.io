# Phoenix Player Ship — Death, Explosion, Lives, Game Over, Shield

Source-of-truth: a local clone of the computerarcheology.com Phoenix
project (8085 disassembly produced from the original ROM).

- **Disassembly** — `Code.md` (labels like `L0AEA`, `L0CB4`, `T1A00`).
- **RAM map** — `RAMUse.md` (every `$43xx` / `$4Bxx` label resolves
  there).

These files live in the local ComputerArcheology Phoenix clone — see
`../CLAUDE.md` for the per-PC path.

Every claim is tagged **[verified]** with an address citation,
**[inferred]** when reasoning beyond what the listing makes explicit,
or **[uncertain]** when the source itself is ambiguous.

This doc covers everything that happens between "player gets hit" and
"player respawns or game ends" — i.e. `GameState` 4 (player
explosion), `GameState` 5 (GAME OVER), the lives counter, the
enemy-bullet → player hit path, and the **shield**. Player input,
movement, and animation are in `research_player_movement.md`; this
doc is the death-side companion.

For top-level context — GameState 4/5 in the dispatch table — read
`research_code_flow.md §3` first. For the per-frame structure see
`research_code_flow.md §2.1`.

---

## 1. The death cycle in one diagram

```
   GameState  Handler  CounterA5
   ─────────  ───────  ─────────
   3          $0800    (gameplay)
   │
   │  alien body hit OR enemy bullet hit
   │  ↓ writes GameState := 4, CounterA5 := $60,
   │    ParticleExplosion ($4363) := $10
   ↓
   4          $0AEA    $60 → $00 over 96 frames (~1.6 s)
                       │
                       ├─ CounterA5 > $20 → L0BBA (early phase, sprite + particles)
                       ├─ CounterA5 == $20 → ClearForeground ($0380)
                       ├─ CounterA5 <  $20 → L0BA0 (late phase; on stages 4-9
                       │                            also resets scroll register)
                       └─ CounterA5 == $00 → L0B15 (respawn-vs-game-over)
                                                │
                                       ┌────────┴────────┐
                                       │                 │
                              lives still > 0      lives == 0
                              GameState := 0       GameState stays 5
                                       │                 │
                                       ↓                 ↓
                                       0 (game-start)    5 ($0B60 GAME OVER)
                                       │                 │  (banner + CounterA5++)
                                       │                 │  at $80, GameState := 0
                                       │                 │  (only if both players' lives == 0)
                                       ↓                 ↓
                                       1 → 2 → 3         0 (new game / attract)
```

Source: `Code.md:$0AEA` (state 4), `$0B15` (decision), `$0B60` (state
5). The enemy-bullet hit path that *enters* state 4 is at `$0CC4`. The
alien-body hit path enters state 4 the same way but via
`alienVsPlayerCollision` (`Code.md:$0CF4` family) calling the
equivalent of `onPlayerHit`. [verified]

---

## 2. GameState 4 — `$0AEA` PlayerExplosion

### 2.1 Top-level dispatch

```
0AEA: 21 B9 43        LD   HL,$43B9     ; CounterB9
0AED: 7E              LD   A,(HL)
0AEE: E6 F8           AND  $F8          ; clear low 3 bits (snap to 8-px)
0AF0: 77              LD   (HL),A
0AF1: 32 00 58        LD   ($5800),A    ; scroll register := snapped CounterB9
0AF4: 2E E2           LD   L,$E2        ; PlayerShipMSB
0AF6: 56              LD   D,(HL)
0AF7: 2C              INC  L            ; PlayerShipLSB
0AF8: 5E              LD   E,(HL)
0AF9: CD 10 02        CALL $0210        ; LeftOneColumn
0AFC: 1B              DEC  DE
0AFD: 00              NOP
0AFE: 2E A5           LD   L,$A5        ; CounterA5
0B00: 35              DEC  (HL)         ; CounterA5--
0B01: 7E              LD   A,(HL)
0B02: CA 15 0B        JP   Z,$0B15      ; CounterA5 == 0 → L0B15 (decision)
0B05: FE 20           CP   $20
0B07: DA A0 0B        JP   C,$0BA0      ; CounterA5  < $20 → late phase
0B0A: CA 80 03        JP   Z,$0380      ; CounterA5 == $20 → ClearForeground
0B0D: C3 BA 0B        JP   $0BBA        ; CounterA5  > $20 → early phase
```

[verified — `Code.md:$0AEA-$0B0D`]

The first 5 bytes (`$0AEA-$0AF1`) align the background scroll register
to an 8-px boundary every frame the player is exploding — keeps the
starfield from drifting during the explosion. The `$0AF4-$0AFD` block
walks back one screen column from the player's last screen-RAM
address; this is a tile-erase helper the source uses to wipe one
trailing column of the ship sprite each frame. The canvas port has no
screen RAM, so these are no-ops in the port.

### 2.2 Early phase — `L0BBA`

```
0BBA: 47              LD   B,A          ; B := CounterA5
0BBB: 0F              RRCA              ; CY := old bit 0
0BBC: D2 C0 0F        JP   NC,$0FC0     ; bit-0 even → L0FC0 alien-kill anims
0BBF: 0F              RRCA              ; (only reached on odd bit-0)
0BC0: 78              LD   A,B          ; restore A
0BC1: DA 70 20        JP   C,$2070      ; old bit 1 of A set → L2070
0BC4: C3 E8 20        JP   $20E8        ; else → L20E8
```

[verified — `Code.md:$0BBA-$0BC4`]

Bit-0 of `CounterA5` alternates each frame between **L0FC0** (continue
animating any still-running dead-alien explosions from before the
player was hit — same routine `stageClearUpdate` uses) and one of the
two player-explosion draws. Among the odd-bit-0 frames, bit-1 of the
counter picks between `L2070` and `L20E8`.

**`L2070` body** — entry point to the shared particle-blit engine at
`L2085`:

```
2070-2079:                                ; arithmetic on screen-RAM ptr
207A: 7E              LD   A,(HL)         ; A := control byte at HL
207B: 11 00 28        LD   DE,$2800       ; T2800 — fragment tile data (256 B)
207E: 21 00 29        LD   HL,$2900       ; T2900 — bitmask control data (256 B)
2081: C3 85 20        JP   $2085          ; tail to particle engine
```

`L2085` (the engine, ~64 bytes at `$2085-$20E2`) walks an 8-cell-wide ×
N-row screen-RAM region: at each cell, ALWAYS writes 0 (clear), then if
the corresponding control bit in T2900 is set, overwrites with the
parallel-indexed fragment tile from T2800. 256 bytes of control × 8
bits → 2048 scanned cells. Result: dense scatter of small debris
fragments replacing the ship sprite. [verified — `Code.md:$2070`,
`$2085-$20E2`]

The mothership explosion uses the same `L2085` engine via `L2426`
(supplies T2A00 / T2B00 instead). One engine, two callers, two data
sets. [verified — `Code.md:$2426`]

**`L20E8` body** — 4×4-tile sprite blit via `DrawImageCbyB`:

```
20E8-20FB:                                ; screen-ptr arithmetic
20FC: 78              LD   A,B            ; B := CounterA5
20FD-20FE:            RRCA / RRCA         ; A >>= 2
20FF: E6 0E           AND  $0E            ; (CounterA5 >> 2) & 0x0E → 0..14
2101: C6 90           ADD  $90
2103-2104:                                ; HL := $1B90 + offset
2106-2109:            (HL) → real ptr     ; deref T1B90 pointer table
210A: 01 04 04        LD   BC,$0404       ; image is 4 cols × 4 rows
210D: C3 D6 0A        JP   $0AD6          ; tail DrawImageCbyB
```

`T1B90` is a pointer table indexed by `(CounterA5 >> 2) & 0x0E`,
returning a pointer to a 4×4 = 16-tile sprite drawn at the
pre-computed screen position. As CounterA5 ticks $60 → $20, the index
walks 0, 2, 4, 6, 8, A, C, E (with collisions from the `>>2` truncation),
cycling 8 different particle frames. [verified — `Code.md:$20E8`]

The same `T1B90` pipeline already drives the mothership particle
explosion in the port (step 12.9 — see `progress.md` step 12 row).

### 2.3 `ClearForeground` checkpoint — `$0380`

At exactly `CounterA5 == $20`, `L0AEA` jumps to `ClearForeground`
($0380) instead of drawing. This wipes the FG plane — everything
that paints there: player sprite, player + enemy bullets, alien
formation tiles, bird sprites, in-flight explosions, particle
overlay. After this single frame, the late phase takes over.
[verified — `Code.md:$0AEA:$0B0A`]

In the canvas port, FG is redrawn every frame from `state` —
`state4_PlayerExplosion` mirrors the wipe at `a5 === 0x20` by
clearing each field that contributes to FG-plane rendering:

- `state.fgOverlay.clear()` — particle overlay accumulated by
  `_drawPlayerParticleFrame`
- `state.aliens[*]`: `controlA &= ~0x08` + `alive = false`
- `state.birds[*]`: `shape = 0`
- `state.enemyBullets[*]`: `state &= ~0x08`
- `state.player.bullet.active = false`
- `state.explosions[*]` + `state.bonusExplosions[*]`: `counter = 0`

Source-faithful effect: by the time state 5 GAME OVER fires (32 frames
later, when `CounterA5` ticks from $20 → 0), the FG plane has been
clean for half a second — banner sits on a clear screen.

### 2.4 Late phase — `L0BA0`

```
0BA0: 21 B8 43        LD   HL,$43B8     ; LevelAndRound
0BA3: 7E              LD   A,(HL)
0BA4: E6 0F           AND  $0F          ; stage low nibble
0BA6: FE 04           CP   $04
0BA8: D8              RET  C            ; stage < 4 → return
0BA9: FE 09           CP   $09
0BAB: D0              RET  NC           ; stage >= 9 → return
0BAC: 2C              INC  L            ; CounterB9
0BAD: AF              XOR  A
0BAE: 77              LD   (HL),A       ; CounterB9 := 0
0BAF: 32 00 58        LD   ($5800),A    ; scroll register := 0
0BB2: C3 A0 03        JP   $03A0        ; ClearBackground (tail call)
```

[verified — `Code.md:$0BA0-$0BB2`]

Only runs on stages 4-8 (intro stages — spiral-fill / bird / mothership
intros). Resets scroll + clears the background plane on each late-phase
frame. On the alien combat stages (0-3, A-B) this is a return, so the
starfield + game state survive the player explosion intact.

### 2.5 Port deviation — skip `L2070` serpentine scatter

The port reuses the `L20E8` / `T1B90` 4×4-tile particle cycle (already
wired for the mothership explosion at step 12.9) and **skips the
`L2070` / `T2800` / `T2900` serpentine scatter entirely**.

Reason — same medium-gap as the mothership deviation in
`research_mothership.md §10`. `L2085` is screen-RAM-native: its
"clear-cell, optionally overwrite with fragment tile" semantics depend
on tile cells persisting across frames, which the canvas port has no
analog for. Replicating it faithfully would require:

1. Decoding T2900 (256 B bitmask) + T2800 (256 B fragment tiles) into
   an explicit `(canvas_x, canvas_y, tileId)` set at build time.
2. Tracking which fragments are visible on each of the ~48 early-phase
   frames (source's per-frame `L0BBA` bit-0 / bit-1 alternation
   between `L0FC0`, `L2070`, `L20E8` modulates what's drawn).
3. Adding a new render path (`state.playerExplosion[]` + canvas blit)
   for one explosion.

vs. the visual-effect approach: reuse the existing 4×4 particle
cycle, get a perceptually-similar "debris" look in ~10 lines of code.

**Decision (2026-05-19):** visual-effect approach. This extends the
mothership scatter deviation (already documented at
`research_mothership.md §10`) to also cover the player explosion. One
trade-off pattern, two applications. Parked for post-project review.

---

## 3. `L0B15` — respawn vs game over

```
0B15: 2D              DEC  L            ; from CounterA5 ($A5) to GameState ($A4)
0B16: 36 05           LD   (HL),$05     ; GameState := 5 (GAME OVER, speculative)
0B18: 2D              DEC  L            ; → GameAndDemoOrSplash ($A3)
0B19: 7E              LD   A,(HL)
0B1A: C6 90           ADD  $90          ; A := $A3 + $90 = $33; combined with high
                                         ; byte $43 → $4390/$4391 (P1/P2 lives)
0B1C: 6F              LD   L,A
0B1D: 7E              LD   A,(HL)       ; A := Player{1,2}Lives
0B1E: A7              AND  A
0B1F: C8              RET  Z            ; lives == 0 already → leave GameState=5
0B20: 35              DEC  (HL)         ; lives--
0B21: E5              PUSH HL
0B22: CD 67 03        CALL $0367        ; UpdateLivesScreen
0B25: E1              POP  HL
0B26: 7E              LD   A,(HL)       ; reload post-decrement
0B27: A7              AND  A
0B28: C8              RET  Z            ; lives now 0 → leave GameState=5
0B29: 2E A4           LD   L,$A4        ; GameState
0B2B: 36 00           LD   (HL),$00     ; GameState := 0 (respawn via cold path)
0B2D: C9              RET
```

[verified — `Code.md:$0B15-$0B2D`]

**Respawn goes through state 0**, not direct to state 3. That means
the player waits through state 0 (game-start init, 1 frame) → state 1
(score flash, 128 frames) → state 2 (per-stage init, 1 frame) → state
3 (gameplay). Total: ~130 frames (~2.2 s) between explosion-end and
regained control. [verified — `research_code_flow.md §3`]

**State-2 init wipes leftover combat state** — both source and port
take this path on respawn (not just on new-stage entry). Two clears
matter for respawn correctness:

- `$0547 InitPlayerDataStructure` copies T0560 (32 bytes) into
  `$43C0..$43DF`. Bytes 12..31 cover the 5 enemy-bullet slots
  (`$43CC..$43DF`); the T0560 template has every State byte = 0, so
  the copy deactivates them. Port `initPlayerDataStructure` now mirrors
  this with `for (const b of state.enemyBullets) b.state = 0;`.
  Without this, bullets that were close to the ship at the moment of
  death stay in flight and re-kill the respawning ship.
- `$0532 L0532` head: `ClearBbytesAtHL $4B50, $A0` wipes all 16 alien
  slots' data ($4B50-$4BEF). The per-slot writes ($05EC / $0650 /
  $0610) only touch slots `0..aliensLeft-1`, so slots beyond that
  range stay zero. Port `initAlienData` now pre-clears all 16 slots
  before the formation writes. Without this, an alien left swooping
  in slot N ≥ `aliensLeft` keeps its bit-3-alive `controlA` and swoop
  `alienMovePtr` and continues the swoop from its (untouched)
  pre-death position.

**Two zero-checks** — one pre-decrement (handles the impossible-in-game
case of state-4 being entered with lives already 0, defensive) and one
post-decrement (the actual "you died with your last life" case). Both
leave `GameState` at the speculatively-written `5`.

**`UpdateLivesScreen $0367`** — redraws the lives-icon row in screen
RAM. Body not quoted by the research pass; the port will need to do
its equivalent (clear-and-redraw the bottom-left ship icons from
`state.player1Lives`). **[verify at port time, read `Code.md:$0367`]**

---

## 4. GameState 5 — `$0B60` GAME OVER

```
0B60: 21 A5 43        LD   HL,$43A5     ; CounterA5
0B63: 34              INC  (HL)         ; CounterA5++ (note: incrementing, not --)
0B64: 7E              LD   A,(HL)
0B65: FE 40           CP   $40
0B67: CA A0 03        JP   Z,$03A0      ; CounterA5 == $40 → ClearBackground
0B6A: 21 00 1A        LD   HL,$1A00     ; T1A00 — GAME OVER text table
0B6D: 0E 01           LD   C,$01        ; PrintTextLines arg: 1 row
0B6F: FE 80           CP   $80
0B71: C2 95 0B        JP   NZ,$0B95     ; CounterA5 != $80 → L0B95 (PrintTextLines)
0B74: 21 A4 43        LD   HL,$43A4     ; GameState
0B77: 36 00           LD   (HL),$00     ; GameState := 0
0B79: 2E 90           LD   L,$90        ; Player1Lives
0B7B: 7E              LD   A,(HL)
0B7C: 2C              INC  L            ; Player2Lives
0B7D: B6              OR   (HL)         ; A := P1Lives | P2Lives
0B7E: C0              RET  NZ           ; either has lives → keep going
0B7F: AF              XOR  A
0B80: 2E 98           LD   L,$98        ; Counter98
0B82: 77              LD   (HL),A
0B83: 2C              INC  L            ; Counter98+1
0B84: 77              LD   (HL),A       ; Counter98(16-bit) := 0 → return to attract
```

[verified — `Code.md:$0B60-$0B84`]

**State 5 ticks UP, not down** — CounterA5 was at 0 entering state 5
(L0B15 wrote 5 to GameState on the same frame CounterA5 hit 0). It
counts up from 0, clearing background at $40 and writing `GameState :=
0` at $80 (~128 frames after entry, ~2.1 s of banner display).

**At $80** — only when *both* players' lives are 0 does `Counter98`
reset to 0 (drops back into attract mode). Otherwise control returns
to the caller leaving GameState=0; the next frame state 0 runs and
the surviving player takes the next turn. (2P mode handles the swap
via `CopyMemoryBank` paths not covered here — port has only 1P.)

**Cross-cutting reset for the next game** — source's $0140
ClearForeAndBackground (called by attract-mode PrintCopyright at
counter98 $0001/$01B0 and by PromptForStartGame at coin-up) includes
a $0154 chunk that zeroes 8 bytes at $43B8 onwards (LevelAndRound,
CounterB9, AliensLeft, BirdsLeft, …) and re-seeds AliensLeft to $10.
By the time the player coins up and presses start, that reset has
already fired, so the next game always opens on stage 0 (alien wave
1 fade-in) with 16 aliens. Port mirrors the chunk inside
`_enterIntroMode` (`states_intro.js`) — without it, post-game-over
coin+start would resume on the death-stage with the death-time alien
count, leaving the player facing a depleted formation (possibly
mid-mothership or mid-bird wave).

**Score reset + hi-score capture at start-press** — source's start-press
chain inside PromptForStartGame is `$02B0 UpdateHiScore → $02B3
ClearAndPrintScores`. UpdateHiScore reads Score1/Score2 and bumps
HiScore ($438B-$438D) if either exceeds it, then ClearAndPrintScores
zeroes the player scores and repaints. Port's `_promptForStartGame`
start-edge mirrors this order: `scoring.updateHiScore()` first
(capture peak), then zero `state.score1`/`state.score2` and repaint
via `scoring.printNumber`. UpdateHiScore also repaints the 6 HI-SCORE
digits at `staticTextRows[1].tiles[10..15]` (= source $4141), so the
header column stays in sync with `state.hiScore` across the cycle.
Without the UpdateHiScore call the HI-SCORE column would show
"000000" forever; without the score-zero step the previous game's
final score would carry forward.

### 4.1 T1A00 text-table bytes

```
1A00: 43 28           ; screen-RAM destination (high $43, low $28)
1A02: FF FF FF FF     ; (likely padding / terminator block — verify)
1A06: 00 00 00 00 00 00 00 00         ; 8 spaces
      07 01 0D 05                     ; "GAME"
      00 00                           ; "  "
      0F 16 05 12                     ; "OVER"
      00 00 00 00 00 00 00 00 00 00   ; trailing spaces
```

[verified — `Code.md:$1A00`]

Phoenix character mapping (per existing port T1800 work):
- `00` = space
- `01` = A, `02` = B, … `07` = G, … `0D` = M, … `0F` = O, `12` = R,
  `15` = U, `16` = V, …

The row is centered with leading + trailing spaces so the screen-RAM
destination at `$4328` lands the "GAME  OVER" in the middle of the
display. **[verified — char codes resolved via cross-check with
existing T1800 score-row port at `tools/build_data.py`]**

The byte layout (`{addr-high addr-low (FF padding?) char-stream}`)
needs to be cross-checked against the `PrintTextLines $01D0` decoder.
The existing port's static-text extractor in `tools/build_data.py`
already understands T1800 rows; T1A00 should fit the same shape. If
the `FF FF FF FF` bytes turn out to be a row-terminator marker or a
length field, that's a `PrintTextLines` decode detail to confirm at
port time. **[uncertain — verify against `Code.md:$01D0`]**

---

## 5. Enemy bullet → player (`L0CB4` / `L0CC4`) — NO direct shield check

```
0CB4: FE DC           CP   $DC          ; bullet Y < $DC → return
0CB6: D8              RET  C
0CB7: FE E9           CP   $E9          ; bullet Y >= $E9 → return
0CB9: D0              RET  NC
0CBA: 3A 9F 43        LD   A,($439F)    ; mapped player right X
0CBD: BE              CP   (HL)         ; vs bullet X
0CBE: D8              RET  C            ; player.right < bullet.x → miss
0CBF: 3A 9E 43        LD   A,($439E)    ; mapped player left X
0CC2: BE              CP   (HL)
0CC3: D0              RET  NC           ; player.left >= bullet.x → miss
0CC4: 3E 04           LD   A,$04
0CC6: 32 A4 43        LD   ($43A4),A    ; GameState := 4
0CC9: 3E 60           LD   A,$60
0CCB: 32 A5 43        LD   ($43A5),A    ; CounterA5 := $60
0CCE: 3E 10           LD   A,$10
0CD0: 32 63 43        LD   ($4363),A    ; ParticleExplosion := $10
0CD3: C9              RET
```

[verified — `Code.md:$0CB4-$0CD3`]

**`$4362 PlayerShieldState` is not consulted** anywhere in
`L0CB4-$0CD3`. The Y-range check (`$DC ≤ y < $E9`) constrains the
bullet to the player row before doing the X overlap.

How the source actually prevents bullets from killing a shielded
player: at `Code.md:$0CA8` (just before `L0CB4`), the enemy-bullet
update reads the FG-screen tile at the bullet's *current screen
position*. If it sees shield tile `$E8`, it jumps to `L096E` to clear
the bullet's `state & 0x08` (deactivate) without ever reaching
`L0CB4`. So the shield blocks bullets by being a physical tile on the
play-field that absorbs them — a screen-RAM side effect, not a flag
check. **[verified — agent quoted the `$0CA8` branch path during R2]**

The same is true for alien-body collision (`L0CF4` family) — also no
flag check; the alien sprite isn't blocked by the shield tile because
the shield is a screen-RAM artifact, not a hitbox. So even in source,
shielded players are vulnerable to alien *bodies* during swoop dives.

### 5.1 Port deviation — shield absorption via explicit flag check

The canvas port has **no FG screen RAM** — sprites are drawn directly
to canvas pixels each frame, and bullets exist only as `state.enemyBullets[]`
entries. There is no tile to inspect at the bullet's position, so the
source's tile-`$E8`-absorption mechanism doesn't translate.

The port chose to add an explicit shield-flag check at
`onPlayerHit()`: when the hit fires, consult `state.player.shield`
(the existing shield-counter ported in step 7); if active, suppress
the hit. This is **functionally close to source** (shielded player
survives bullets) but **mechanism differs** (port reads a flag, source
inspects a tile). One observable consequence: in the port the shield
also blocks alien-body hits, where source does not — this is a
side-effect of the port unifying both collision paths under one flag.

This is flagged as a **faithful-vs-visual-effect trade-off** — the
same pattern the port already applies to the mothership particle
explosion (`research_mothership.md §10`, and again here at §2.5 for
the player explosion). The port replaces screen-RAM-native source
mechanisms with state-driven canvas equivalents whenever the medium
gap is large. All such deviations are parked for post-project review.

**Resolution decided 2026-05-19:** keep the explicit flag check. The
alternative — modeling FG screen RAM purely so bullets can collide
with shield tiles — would require shadowing every sprite blit into a
tile grid and is disproportionate work for one collision case.

---

## 6. Port mapping plan (summary)

| Source                | Port location (target)                                    |
|-----------------------|-----------------------------------------------------------|
| `L0AEA` state 4       | `states.js:state4_PlayerExplosion` (replaces stub)        |
| `L0BBA` early phase   | inside `state4_PlayerExplosion`                           |
| `L20E8` particle blit | reuse existing T1B90 / 4×4 particle path from step 12.9   |
| `L2070` serpentine    | **skipped** — see §2.5 port deviation                     |
| `L0BA0` late phase    | inside `state4_PlayerExplosion`                           |
| `ClearForeground`     | state-4 `a5==$20` branch: clear `fgOverlay`, all alien `controlA & 0x08`, bird `shape`, `enemyBullets[*].state & 0x08`, `player.bullet.active`, explosion + bonusExplosion counters — see §2.3 |
| `L0B15` decision      | inside `state4_PlayerExplosion`, at CounterA5==0          |
| `UpdateLivesScreen`   | `scoring.updateLivesScreen()` — **landed in step 13.A**   |
| `L0B60` state 5       | `states.js:state5_GameOver` (replaces stub)               |
| `T1A00` GAME OVER     | new export from `tools/build_data.py` → consumed by render|
| `L0CC4` hit-write     | `onPlayerHit()` already does this — re-enable callers     |
| `L0CB4` AABB          | inline inside re-enabled `enemyBulletUpdate` player path  |
| Shield flag gate      | new — `if (state.player.shield > 0) return` at hit entry  |

Lives counter (`Player1Lives` `$4390`) is already a `state.player1Lives`
field initialized to 3. Bonus-life-at-threshold (`$015F`, `$278F`,
`$2799`, `$279C`, `$27A2`) is a separate concern documented in
`progress.md` and not covered here.

---

## 7. Open questions / follow-up reads

These are deferrable to port-time but each touches one source routine
that the research pass did not quote:

- `Code.md:$01D0 PrintTextLines` — confirm the T1A00 row header
  (`43 28 FF FF FF FF` then chars) decodes the same way as the
  existing T1800 score rows; if so, `tools/build_data.py` extension
  is trivial.
- `Code.md:$0CA8` — quote the tile-absorption check that diverts
  shield-blocked bullets to `L096E`, for completeness in §5.

None of these are blockers for the Phase B-D implementation plan in
`progress.md` follow-up — they are read-once-while-porting items.
