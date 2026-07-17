# SMB player-vs-background collision

How Super Mario Bros. decides that Mario touched the level, and what it does about
it. Decoded from `SMBDIS.ASM` (doppelganger); every claim cites a label + line.

**Notation.** `$18` is hex (24), `24` is decimal. The source's own comments mix the
two without saying so — `ChkUnderEnemy` (line 12707) is commented "check the bottom
middle (8,18) of enemy object" and those are the *hex bytes* `$08,$18`, i.e. **(8,
24) decimal**. Read as decimal it puts the probe 6 px up inside the enemy. This doc
always marks hex with `$`.

## Scope

Covers **detection and stopping**: the probes, the buffer they read, how a metatile
is classified, and how Mario is halted. Stops where game logic begins — awarding the
coin, bumping a block's contents, spawning a vine, sounds, scoring. Those are the
port's *react* phase (`World` + `TILES.onBump`) and want their own doc.

That split is **ours, not the source's.** SMB interleaves them: `PlayerBGCollision`
probes, classifies and reacts inline, with `jsr CheckForCoinMTiles / bcs
AwardTouchedCoin` three instructions after the foot probe. The port's "resolver
detects; the world decides" invariant is a deliberate reorganisation. Branch points
into game logic, so a react doc has anchors:

| Branch | From | Line |
|---|---|---|
| `AwardTouchedCoin` | head + foot probes | 11952, 11982 |
| `PlayerHeadCollision` | head probe, solid hit | 11964 |
| `HandleClimbing` | side probe | 12068 |
| `HandleCoinMetatile` | side probe | 12070 |
| `HandleAxeMetatile` | foot probe | 12004 |
| `HandlePipeEntry` | foot probe, landing | 12019 |
| `ChkForLandJumpSpring` | foot probe, landing | 12015 |

## The block buffer

`Block_Buffer_1 = $0500`, `Block_Buffer_2 = $05d0` (lines 452-453). Two buffers of
`$d0` = 208 bytes. Each holds **metatile ids** — one byte per 16×16 px cell, not per
8×8 tile.

Layout falls out of the addressing (`BlockBufferCollision`, line 13053):

- **16 columns per buffer**, two buffers = 32 columns = two screens' width.
- **13 rows**, indexed by a byte that steps by 16 (`and #%11110000`), so the row
  index *is* `row * 16`. 13 × 16 px = 208 px = the screen's 240 minus the 32 px
  status bar.
- Address = `column_base + row*16`, i.e. row-major with stride 16.

`GetBlockBufferAddr` (line 4328) takes one byte: **high nybble selects the buffer**
(0 or 1), **low nybble is the column** (0-15).

```
      lsr / lsr / lsr / lsr    ;high nybble to low
      tay
      lda BlockBufferAddr+2,y  ;high byte of Block_Buffer_1 / _2
      sta $07
      pla
      and #%00001111           ;low nybble = column
      adc BlockBufferAddr,y
      sta $06
```

**This is the port's `LevelMap`.** It is a game-maintained collision grid, not video
memory — so it ports directly and raises none of the screen-RAM-mapping question in
the root `CLAUDE.md`.

## The probe set — there is no hitbox

SMB never tests a box against the level. It **point-samples the buffer** at fixed
offsets from the sprite block's origin.

`ChkCollSize` (line 11929) picks a base index by player state:

```
ChkCollSize:
         ldy #$02                    ;default
         lda CrouchingFlag
         bne GBBAdr                  ;crouching -> 2
         lda PlayerSize
         bne GBBAdr                  ;small -> 2
         dey                         ;big, not crouching -> 1
         lda SwimmingFlag
         bne GBBAdr                  ;swimming -> 1
         dey                         ;big, not crouching, not swimming -> 0
GBBAdr:  lda BlockBufferAdderData,y
         sta $eb                     ;the base, kept for the whole frame
```

`BlockBufferAdderData: .db $00, $07, $0e` — three 7-entry groups in
`BlockBuffer_X_Adder` / `BlockBuffer_Y_Adder` (28 bytes each).

Resolved, in decimal, relative to the **16×32 sprite block's top-left**:

| probe | index | big standing | big crouch/swim | small |
|---|---|---|---|---|
| head | base+0 | (8, 4) | (8, 2) | (8, 18) |
| foot left | base+1 | (3, 32) | (3, 32) | (3, 32) |
| foot right | base+2 | (12, 32) | (12, 32) | (12, 32) |
| side L upper | base+3 | (2, 8) | (2, 8) | (2, 24) |
| side L lower | base+4 | (2, 24) | (2, 24) | (2, 24) |
| side R upper | base+5 | (13, 8) | (13, 8) | (13, 24) |
| side R lower | base+6 | (13, 24) | (13, 24) | (13, 24) |

Three things this makes plain:

- **Horizontal span is 12 px** (x+2 .. x+13) for every state — the side probes never
  move. Feet sit inside that at x+3 and x+12.
- **Small Mario's upper and lower side probes are the same point** (both y+24),
  because he is 16 px tall. The duplicated `$02,$02` / `$0d,$0d` in the table is not
  padding; it is what makes one loop serve both sizes.
- **The offsets are relative to the block, not the ink.** Feet at y+32 is the block's
  bottom edge; the small head probe at y+18 is just inside his ink (which starts at
  y=16). Collision geometry and art share one origin — which is why the block is the
  registration and trimming a sprite would break both.

## `BlockBufferCollision`'s contract

Line 13053. Entry points (lines 13042-13051):

```
BlockBufferColli_Feet:  iny            ;next set of adders
BlockBufferColli_Head:  lda #$00       ;flag: return VERTICAL coordinate
                        .db $2c        ;BIT opcode -- swallows the next 2 bytes
BlockBufferColli_Side:  lda #$01       ;flag: return HORIZONTAL coordinate
                        ldx #$00       ;object offset: the player
```

The `.db $2c` is a `BIT abs` whose operand eats `lda #$01`, so falling in at `_Head`
skips the `_Side` load. Classic size trick; the effect is a 0/1 flag.

- **In:** `X` = object offset (`$00` = player), `Y` = adder index, `A` = 0 for a
  vertical coordinate / 1 for horizontal.
- **Out:** `A` = the metatile id at that point (0 = empty). `$04` = **the low nybble
  of the probed coordinate** — Y for head/feet, X for sides. `$02` = the row index,
  `$06/$07` = the buffer address (both used by the react paths to erase a metatile).

`$04` is the important one: it says **how deep into the 16 px cell the probe landed**,
and two gates hang off it.

## The gates — depth decides the meaning

**Head** (line 11956): only counts if the probe is ≥ 4 px into the cell.

```
         ldy $04
         cpy #$04
         bcc DoFootCheck   ;low nybble < 4 -> ignore
```

**Foot** (line 12010): this one is a mechanism, not a tolerance.

```
          ldy $04
          cpy #$05
          bcc LandPlyr           ;< 5 px into the block -> LAND on it
          lda Player_MovingDir
          sta $00
          jmp ImpedePlayerMove   ;>= 5 px in -> you RAN INTO it
```

**The same foot probe serves as both a floor test and a wall test, and the depth
decides which.** Shallow means you are standing on it; deep means you walked into its
side. Nothing in our resolver expresses this — it is the one genuine structural gap.

**`$05` is almost certainly `maxFall + 1`, not a fraction of the cell.** The player's
vertical move sets max fall to `$04` — 4 px/frame:

```
NoJSChk: lda VerticalForce          ;line 7594
         sta $00
         lda #$04                   ;set maximum vertical speed here
         jmp ImposeGravitySprObj
```

So a foot probe ≤ 4 px into a cell *could* have got there by falling; at ≥ 5 it could
not, and the only remaining way in is horizontally. That is exactly the question the
gate answers, and it is why one probe can serve both roles.

**Flagged as inference** — the source states `#$05` and justifies nothing. But 5 = 4+1
against a 4 px/frame terminal fall is hard to read as coincidence, and no reading as a
cell fraction explains 5/16 rather than, say, 8/16. Treat as strong-but-unproven; if a
port step ever depends on it, re-derive.

**It matters because the gate does not scale with the tile.** See "Three scales" below.

## The responses

**Landing** — `LandPlyr` (line 12015):

```
LandPlyr: jsr ChkForLandJumpSpring
          lda #$f0
          and Player_Y_Position   ;snap to the 16 px grid = the block's top
          sta Player_Y_Position
          jsr HandlePipeEntry
          lda #$00
          sta Player_Y_Speed      ;stop vertical movement
          sta Player_Y_MoveForce
          sta StompChainCounter
```

Y is **snapped** to a 16 px boundary and vertical speed zeroed.

**Horizontal** — `ImpedePlayerMove` (line 12318). Notably it does **not** snap:

```
NXSpd: ldy #$10
       sty SideCollisionTimer   ;blocks re-collision for 16 frames
       ldy #$00
       sty Player_X_Speed       ;nullify horizontal speed
       ...
       adc Player_X_Position    ;nudge X by +1 or -1
```

Speed is zeroed and X is **nudged one pixel** out of the wall — no flush snap, and a
`SideCollisionTimer` of `$10` gates the next side collision. `StopPlayerMove` (line
12115) is just `jsr ImpedePlayerMove / rts`.

Direction is decided by `$00`, which the *caller* sets — the foot path passes
`Player_MovingDir` (line 12012), the side path passes the side being probed.

## The side loop probes four points, not two

`DoPlayerSideCheck` (line 12027):

```
      ldy $eb / iny / iny      ;base+2
      lda #$02 / sta $00       ;counter = 2
SideCheckLoop:
       iny                     ;base+3, then base+5
       jsr BlockBufferColli_Side
       ...
BHalf: ldy $eb / iny           ;base+4, then base+6
       jsr BlockBufferColli_Side
       ...
       dec $00 / bne SideCheckLoop
```

Two iterations × two probes = **four**: `base+3..base+6`. The pair inside one
iteration is the **upper and lower half of one side** ("one half of player" / "other
half of player" in the source's comments); the loop runs left side, then right.

Vertical gates differ between the two probes — the first skips when Y < `$20` (status
bar) or ≥ `$e4`; the second when Y < `$08` or ≥ `$d0`.

## Metatile classification

Detection needs "is this solid?", which is a set of id-range tests, not a flag:

| routine | line | tests |
|---|---|---|
| `CheckForSolidMTiles` | 12358 | head-bump solids |
| `CheckForClimbMTiles` | 12366 | vines / climbables |
| `CheckForCoinMTiles` | 12371 | coin ids |
| `ChkInvisibleMTiles` | 12238 | hidden coin / 1-up blocks |
| `ChkForNonSolids` | 12712 | `$26` vine-blank, `$c2`/`$c3` coins, `$5f` hidden block |

`ChkForNonSolids` is the enemy-side counterpart and is worth noting: **a coin is not
solid** — enemies and Mario pass through it, which is why coins are detected by a
separate check rather than by the solidity test.

## Enemies share the tables

`ChkUnderEnemy` (line 12707):

```
      lda #$00                  ;flag: return vertical coordinate
      ldy #$15                  ;index $15 = 21 -> (8, 24) decimal
      jmp BlockBufferChk_Enemy
```

Index `$15` is the start of the fourth group (21-27), past the player's three. `(8,
24)` is the **bottom middle of a 2×3 enemy block** (16×24 px) — one probe, where the
player gets two feet. That single probe is why enemies walk off ledges the moment
their midpoint clears, and it is already described from the movement side in
`research_smb_physics.md`.

Indices 22-27 (`$00,$10,$04,$14,$04,$04` X / `$14,$14,$06,$06,$08,$10` Y) are used by
other object types — **not yet traced.**

## Three scales — SMB's `16` is doing three jobs

**The most important thing in this doc, and it is not visible from the source.** SMB
never changes its tile size, so three independent quantities are all spelled `16` and
look like one number:

| quantity | actually depends on | in SMB |
|---|---|---|
| probe offsets (2, 3, 12, 13 / 4, 8, 18, 24, 32) | **actor geometry** — where the feet and shoulders sit on a 16×32 block | 16 |
| snap grid + row addressing (`and #$f0`, `coord & $0f`) | **tile size** | 16 |
| depth gate (`cpy #$05`) | **max fall speed** (`$04`, +1) | 4+1 |

Consequences for any port that does not use a 16 px tile:

- **Probe offsets do not scale with the tile at all.** They are positions on the actor.
  Change the tile to 64 and they do not move. They belong on the `ACTOR_TYPES` entry,
  beside `physics` and `sprites` — 7 probes for the player, 1 for an enemy — and `w`/`h`
  stop being collision geometry.
- **Snap and row addressing take `levelMap.tileSize`.** `$f0` is only how "snap to the
  tile grid" is spelled when the grid is 16; `floor(y / TILE_SIZE) * TILE_SIZE` is the
  same mechanism and generalises for free. `resolveCollision` already reads `tileSize`.
- **The gate must NOT be expressed as a fraction of the tile.** Scaling 5→10 for a 32 px
  tile happens to land near-right only because a *uniform* ×2 scales speed and tile
  together. Change the tile alone — 32 → 48, actor unchanged — and a tile-fraction gate
  gives 15, so the player "lands" while 14 px inside a block. `maxFall + 1` gives 9 and
  stays correct.

**A uniform world scale hides all of this**, which is why it only surfaces if you ask
what happens when `LevelMap`'s block size changes on its own.

### The one limit of point-sampling

A solid **narrower than the probe spacing** can sit between two probes and be missed —
the player falls through a real platform. The reverse never happens: a *hole* narrower
than the spacing is bridged by both feet, which is correct behaviour and matches what a
box would do.

In a tile grid the narrowest possible solid is **one tile**, so the condition is:

> **`tileSize` ≥ probe spacing**, where foot spacing is 9/16 of the actor's block width.

SMB: spacing 9, tile 16 — safe. The port: spacing **9** (the probes are the ROM's and
were not scaled) against a **32** px tile — safer still, since Mario is half a tile
wide here. Only a tile shrinking *relative to the actor* breaks it: below ~9 px a lone
tile could hide between his feet.

## What the port does with this

**Ported.** `resolveCollision` point-samples a probe table the `ACTOR_TYPES` entry
names, in actor space — no box. Mario's table is this doc's, verbatim:

```js
probes: {
  head:  { xs: [8], y: 18 },     // ONE probe, at centre
  feet:  { xs: [3, 12], y: 32 }, // TWO — supported if EITHER finds solid
  left:  { x: 2,  ys: [24] },    // big Mario would be ys: [8, 24]
  right: { x: 13, ys: [24] },
}
```

`size` is now the drawn extent (16×32, the CHR block) and `probes` the collision
geometry; they are different things. A type naming no probes gets box-derived ones,
which reproduce the old box model exactly — which is how the Goomba, still on BMP art,
is provably unaffected. It will want its own table (the enemy's single bottom-middle
probe) when enemies are ported; that is a real behaviour change, not a port detail.

The result matches the art: left edge flush with the ink, feet landing on it, and 2 px
of ink past the right probe — SMB's own geometry, since the ROM's side probes sit at
x+2/x+13 inside a 14-wide standing sprite.

**Deliberately NOT ported — the `$05` depth gate.** SMB is single-pass: it integrates
both axes and probes once, which makes a foot probe ambiguous (landed on it, or walked
into it?) and depth is how it decides. The port resolves **per axis**, so the same
question is answered structurally — a hit in the X pass IS a wall, a hit in the Y pass
IS a floor. The gate is that constraint's solution, not a behaviour, so porting it into
an axis-separated resolver would be cargo-cult. (`$04`, the head gate, is a genuine
tolerance rather than a disambiguation — it lets Mario's head enter a block 4 px before
it bumps — and is not ported either. Worth revisiting if bumps feel early.)

**Deliberately NOT ported — the horizontal response.** SMB zeroes X speed, nudges 1 px
out, and gates the next side collision for 16 frames (`SideCollisionTimer`). The port
snaps flush. Different resting position against a wall.

**Re-derived, not copied — the `16`.** Root `CLAUDE.md` corollary 6c: a number in a
coordinate space we chose not to reproduce gets re-derived in ours. `$f0` is only how
"snap to the tile grid" is spelled when the grid is 16; the port reads
`levelMap.tileSize`. The probe pattern, the two feet, and the head-at-centre are
**mechanism** and port as they are. Getting that line wrong in either direction is the
trap: copying `$f0` literally breaks at any other tile size, and "re-deriving" the
depth gate as a tile fraction breaks the moment the tile moves on its own.
