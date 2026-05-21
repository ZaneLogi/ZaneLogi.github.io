# Galaga Coordinate System — Verified Specification

**Status: resolved.** Y conversion fix landed via `rawYToCanvasY −40`,
formation row shift, player Y derivation; X conversion fix landed via
`rawXToCanvasX −16`, formation col shift, player X derivation, movement
limits. Canvas extended from 256→288 to match actual hardware.

This doc captures the research arc that got us here: **why the issue
existed, what made it hard, and how we resolved it without guessing**.

## 1. The presenting symptoms

In order of discovery:

1. **Wave 2 enemies entered from the WRONG SIDE of the screen.** Real
   Galaga shows wave 2 entering from the bottom-left; our port showed
   them entering from the top-left.
2. **Wave 2 enemies overlapped the lives-icon area** (canvas Y 272-288)
   when we did get them rendering at the bottom.
3. **Player ship Y was a hardcoded `208`** that no one had derived from
   the Z80 source — it was just "looked OK".
4. **Curve sizes felt smaller than the original game** (turned out to be
   a separate motion-model issue, but *also* a coordinate question
   because canvas height affected what a "small curve" meant relative
   to the screen).

Each symptom looked separate. They all turned out to be **one root
cause**: we had been treating the Z80's sprite-register byte as if it
were the canvas pixel position directly.

## 2. Why this was hard to research

Three things made this harder than the stage-data or path-bytecode
research:

### 2.1 The Z80 ROM doesn't know the answer

For things like wave-byte semantics or path-bytecode tokens, we could
trace what the Z80 ROM did and have a complete answer. The ROM defined
the format; the format was 100% in the ROM.

For sprite Y → canvas Y, **the ROM never decides where on the screen
the pixel goes**. It writes `0x29` to `ds_sprite_posn[0x63]` and `1` to
`ds_sprite_ctrl[0x63]` — and that's it. The actual translation from
those register values to a screen pixel happens in the **Namco custom
sprite chip** on the arcade PCB, not in any Z80 instruction.

So no amount of tracing the Z80 source could give us the answer. We
had to look outside.

### 2.2 The disassembly's comments were partially misleading

The hackbar_galaga disassembly comments said things like "SPRCTRL.1[n]:0
... sy<8>" for the byte we eventually identified as the Y bit-8 carrier.
That comment was *correct*, but **MAME's `draw_sprites` uses the same
byte for `flipx`** — making it look like the comment was wrong. We
spent multiple turns chasing the apparent contradiction.

The resolution: MAME's labelling and the Z80 author's labelling
disagree on what bit means what. The Z80 author was right (verified by
harbaum/galagino emulator). MAME's variable names were a slightly
different reverse-engineering interpretation, but its behaviour
(combined with rotation handling we hadn't traced) produces the same
final pixels.

### 2.3 Multiple plausible formulas, all "looking OK"

For most of the journey, our own formula `canvas_Y = sprite_Y` produced
visuals that *looked OK* for the cases we'd tested. Wave 1 enemies
appeared at the top. Pair members swooped symmetrically (after the
negate-rotation fix). It wasn't until we noticed that **wave 2's
canvas_Y = 283 overlapped the lives-icon area** that we had concrete
evidence the formula was off.

Even then, it could have been off by:
- A constant offset (turned out to be true: −40)
- A bit-8 misinterpretation (it wasn't — bit 8 IS used for Y)
- A canvas-height mismatch (true also — we were on 256 instead of 288)
- A rotation/flip we hadn't accounted for (false — but had to rule out)

Each hypothesis required separate verification. It took ~10 turns of
back-and-forth with the user (verifying visually, ruling out
hypotheses, eventually finding the right reference) to converge.

## 3. The investigation — turn by turn

### Phase 1: assumed canvas was 256 and ignored bit 8

Initial state: canvas 256-tall, `rawYToCanvasY` returned `((~(rawY +
0x4F)) & 0xFF) × 2 + 1) & 0xFF` — masking with `& 0xFF` to keep within
8-bit byte. This produced `canvas_Y = 27` for variant 2, putting them
visibly at the TOP of the screen. User (via gameplay comparison)
reported wave 2 should be at the bottom. ❌

### Phase 2: discovered Galaga screen is 224×288, not 224×256

Traced bomb-motion code (`f_1EA4`, gg1-2_fx.s:1737) — bombs increment
sprite_Y to move toward the player. Player Z80 sprite_Y = 297 (gg1-2.s:1051-1062),
which doesn't fit a 256-tall canvas. Combined with multiple web-source
confirmations that Galaga is 224×288, we extended canvas to 288 and
removed the `& 0xFF` mask. Variant 2 now at canvas_Y = 283 (bottom). ✓
visually.

But: variant 2 at Y=283 overlapped lives icons at Y 272-288. And
player at Y=297 didn't fit in 288-canvas. **Two separate problems.**

### Phase 3: dug into the Z80 source for player Y

User instructed: "trace the Z80 source for the player position." Result:
- Player Y is hardcoded ONCE at `c_133A` (gg1-2.s:1051-1062).
- Value: sprite_Y_byte = 0x29 = 41, sprite_ctrl bit 0 = 1, total
  sprite_Y = 297.
- No other code modifies player Y; it's read only for X (movement,
  collision).

So the Z80 source confirmed sprite_Y = 297 but couldn't tell us where
that maps in canvas pixels. **The ROM had been milked for everything
it could give.**

### Phase 4: dug into MAME's source

`m_screen->set_raw(MASTER_CLOCK/3, 384, 0, 288, 264, 0, 224)` —
confirmed hardware screen is 288 wide × 224 tall (rotated to 224×288
in display).

MAME's `draw_sprites` formula: `sy = ((257 - byte) & 0xff) - 32` — 8-bit
only, no bit 8. This produced canvas_Y values that didn't match user
observations. Plus we had to account for ROT90 rotation, which we
couldn't fully derive without reading more of MAME's screen pipeline.

### Phase 5: the breakthrough — harbaum/galagino

User shared Paolo Severini's Galaga blog post. Following the breadcrumbs
led to two community-validated emulators:
- **Paolo Severini's C++/HTML5 emulator**
- **harbaum/galagino** (ESP32 emulator that's *played* on the device)

Paolo's `ScreenDevice.cpp` used the same MAME formula (with the
unaddressed rotation issue).

**harbaum's `galaga.h` had a different formula** that bypasses the
rotation pipeline by working in display-orientation directly:

```c
spr.x = sprite_base_ptr[0x1380] - 16;
spr.y = sprite_base_ptr[0x1380 + 1]
      + 0x100 * (sprite_base_ptr[0x1b80 + 1] & 1)   // bit 8 from sprite_ctrl
      - 40;
```

Plus the visible-range check `if((spr.y > -16) && (spr.y < 288) ...)`
confirmed the −16 to 288 display Y range.

Applying this:
- Variant 0 (sprite_Y_byte=43, bit_8=0): canvas_Y = 43 − 40 = **3**
- Variant 2 (sprite_Y_byte=27, bit_8=1): canvas_Y = 283 − 40 = **243**
- Player (sprite_Y_byte=41, bit_8=1): canvas_Y = 297 − 40 = **257**
- Formation row 0 (sprite_Y_byte=60, bit_8=0): canvas_Y = 60 − 40 = **20**

**Every value made visual sense, including the 7-px gap above lives
icons that real Galaga shows.** This was the answer.

## 4. Root cause

**Galaga's sprite chip applies hardware offsets that the Z80 ROM has
no knowledge of.**

The arcade PCB has separate components:
1. **Z80 CPU(s)** — runs the ROM code. Writes to sprite registers.
2. **Sprite chip (Namco custom)** — reads sprite registers, draws pixels.

The sprite chip applies these constants when rendering:
- **−16 px** on X (the left-border area of the unrotated hardware)
- **−40 px** on Y (the top-border area of the unrotated hardware,
  which becomes the bottom-border in display orientation due to
  rotation)

The ROM author can hardcode `0x7A` for player X knowing "the ship will
appear at the right place" — but only because they know the chip's
behaviour. In our JS port, **we ARE the sprite chip**, so we have to
know its behaviour too.

The Z80 ROM author *partially* documents this in comments
("SPRCTRL.1[n]:0 ... sy<8>") but never spells out the canvas
offsets — those were just intrinsic to the hardware.

Once you recognise this distinction, the fix is one constant per axis.

## 5. The solution

### 5.1 Verified formulas

```
canvas_X = sprite_X_byte − 16
canvas_Y = sprite_Y_byte + 256 × bit_8 − 40
canvas size = 224 × 288
```

For variant table entries (db_2A6C), the sprite chip applies a `× 2`
shift on the X high byte (gg1-5.s:2287-2288 `rla`), so:
```
canvas_X = rawX × 2 − 16
```

For formation rows, the Z80 pre-converts rawY via c_12C3
(`(~(rawY + 0x4F)) & 0xFF) × 2`, no `+1`); for the bug-render
pipeline, via gg1-5.s:2305-2321 (with the `dec e; rr e; rla` chain
that adds the `+1`). Then the −40 offset applies in both cases.

### 5.2 Files changed

| File | Change |
|------|--------|
| `paths.js` | `rawYToCanvasY` adds `− 40`; `rawXToCanvasX` changes `−10` → `−16` |
| `state.js` | `_ROWS` Y values shift by −40 (60→20, 76→36, 92→52, 104→64, 116→76, 128→88) |
| `state.js` | `_COL_X` shifts by −6 (each value: 39→33, 55→49, ...) |
| `state.js` | `player.x` 112→106; `player.y` 208→257 |
| `tasks/playerMove.js` | `X_MIN: 8→2`, `X_MAX: 215→209` |
| `index.html` | canvas height 256→288 |
| `main.js` | `fillRect` height 256→288 |
| `tasks/bombUpdate.js` | despawn threshold 256→288 |
| `tasks/starfield.js` | star Y range 256→288 |
| `CLAUDE.md` | coordinate-system section rewritten with both verified formulas |

## 6. Sources used (with confidence levels)

| Source | Confidence | Used for |
|--------|------------|----------|
| `hackbar_galaga` Z80 disassembly | **High** for ROM behaviour, **misleading** for hardware-chip details | sprite register values, where player Y is set, formation conversion, etc. |
| MAME `galaga.cpp` source | **High** for hardware specs (screen size, raw clock), **inconclusive** for sprite Y mapping (would need ROT90 trace we didn't complete) | screen geometry confirmation (288×224 hardware) |
| Paolo Severini's emulator | Same MAME formula; same gap as MAME for our specific problem | corroborated MAME's formula structure |
| **harbaum/galagino** | **Very high** — emulator runs on real ESP32 hardware and is community-validated by playing actual Galaga | **The verified formulas** (canvas_X − 16, canvas_Y derivation with bit 8 + −40) |
| User's own gameplay observation (online Galaga) | **High** for relative positions ("wave 2 enters from bottom-left") | Disambiguating which hypothesis was right at multiple junctures |

The reason harbaum/galagino was decisive: it bypasses MAME's rotation
pipeline by working **in display orientation directly** (since it
renders to an ESP32 display that's natively in the right orientation).
That meant its formulas could be applied as-is to our display-oriented
canvas, no rotation interpretation needed.

## 7. What we learned (general principles)

### 7.1 Z80 ROM ≠ arcade hardware

The Z80 source is the **truth about ROM behaviour** but only **part of
the truth about the arcade machine**. Hardware chips (sprite, sound,
tile renderer) have intrinsic behaviours not captured in the ROM.

When porting, separate the two questions:
- "What does the ROM do?" → trace Z80 source
- "What does the hardware do with what the ROM writes?" → look at
  emulator source, hardware specs, or observed behaviour

### 7.2 Multiple emulators provide cross-checking

For hardware-chip behaviour, having **two or more independently
reverse-engineered emulators** that agree is much stronger evidence
than one. MAME alone left us uncertain (rotation pipeline opaque).
harbaum + Paolo Severini (Paolo's matched MAME, harbaum filled in the
display-orientation gap) gave us decisive answers.

### 7.3 Visual "looks OK" can hide systematic offsets

Our `canvas_Y = sprite_Y` formula was off by exactly 40 px globally.
Because formation, fly-in start, and bomb-target Y all used the same
formula, **the relative positions were internally consistent** —
fly-in enemies still landed in formation, bombs still hit the player
area. The visual was self-consistent, just shifted.

The smoking gun was overlap with a sprite from a *different* coordinate
system (lives icons, which use the tile system, NOT the sprite system).
Two coord systems disagreeing forced the issue to surface.

**Lesson: when verifying a coordinate mapping, look for cases where it
interacts with another coordinate system (tile-vs-sprite,
display-vs-internal, fixed-vs-derived). Internal consistency isn't
enough.**

### 7.4 Comments in disassembly are hypotheses, not facts

The hackbar_galaga comments saved us hours of work by labelling things
like "sy<8>" — but those comments are the **disassembler's
interpretation**. They can be wrong, partially right, or right but
ambiguous. Always verify against actual code behaviour or external
emulator sources.

In our case the "sy<8>" comment turned out to be correct — but for
several turns we doubted it because MAME's `draw_sprites` used the
same byte for `flipx`. Resolving that required external evidence
(harbaum's formula uses the byte exactly as the disassembly comment
predicted).

## 8. Verification status

After applying the fixes, all of these were eyeball-verified by the
user against gameplay of online Galaga:

- ✅ Wave 1 enters from top-center (variants 0/1, canvas_Y ≈ 3)
- ✅ Wave 2 enters from bottom-left (variant 2, canvas_Y ≈ 243, X ≈ −16)
- ✅ Wave 3 enters from bottom-right (variant 3, canvas_Y ≈ 243, X ≈ 224)
- ✅ Wave 4/5 enter from top-center
- ✅ Pair members swoop in mirrored arcs (negate-rotation flag)
- ✅ Player ship sits just above the (would-be) lives-icon area
- ✅ Whole playfield positions match the original game

The coordinate system is now **fully Z80-faithful end-to-end** with
hardware verification from a community-validated emulator.

## 9. Future work

The verified formulas should hold for all sprite categories. If a
future feature shows an unexpected position offset, it's likely:
- A new sprite-coordinate path that needs the conversion applied
  (look for direct `sprite_posn` writes that bypass `rawXToCanvasX` /
  `rawYToCanvasY`)
- A tile-vs-sprite coordinate confusion (tiles use their own system
  via the Pac-Man hardware mapping)
- A flip-screen feature (`b_9215_flip_screen`) that we haven't ported

For each, follow the same playbook:
1. Identify the symptom (what's off?)
2. Trace Z80 source — what does ROM write?
3. If hardware behaviour is unclear, check harbaum/galagino +
   Paolo Severini's emulator + MAME (in that order)
4. Cross-verify with gameplay observation
5. Update CLAUDE.md if a new coord-system rule emerges
