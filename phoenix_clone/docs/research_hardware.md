# Phoenix Hardware Architecture — Research for JS Port

Source-of-truth walk through the
[computerarcheology.com Phoenix section](https://www.computerarcheology.com/Arcade/Phoenix/),
cross-checked against the MAME `phoenix.cpp` driver and the local
disassembly clone.

This is a **port-planning** document, not a hardware reference. Every
section ends with what it implies for `phoenix_clone` JS structure.

## 1. CPU

| Item | Value | Source |
|------|-------|--------|
| Main CPU | Intel **8085A** | computerarcheology index ("INTEL 8085 and variants (P8085AH-2)"); MAME `I8085A(config, m_maincpu, CPU_CLOCK)` |
| Clock | **2.75 MHz** | MAME `phoenix.cpp` `CPU_CLOCK` constant |
| Sound CPU | **None — memory-mapped melody chip only** | computerarcheology Hardware page; MAME uses `TMS36XX` (with `MM6221AA` for Phoenix) as a sound *device*, not a CPU |
| Sound chip | **Matsushita MN6221AA** (rare variant MN6221AB) | Hardware.html, verbatim: "Melody chip used is a 18 pin DIL IC: Matsushita MN6221AA" |

**Note on the 8085 vs Z80 question.** The site offers both an 8085 and a
Z80 disassembly because "the Z80 microprocessor… uses the register block
and instruction set of the 8085 as a subset". The actual hardware is
8085. The Z80 listing is a porting aid for readers more familiar with
Z80 syntax. **Trust the 8085 mnemonics for hardware behaviour** (e.g.
the absence of `RST n.5` calls in the listing tells us the game does
not use 8085-specific masked interrupts — see §6).

**Implication for JS:**
- One execution context. No CPU↔CPU sound queue to model.
- 2.75 MHz × 8085 average ~2 cycles/instruction ≈ 1.4M instructions/sec.
  We are not instruction-accurate; we operate at the *game-tick* level
  (see §6).

## 2. ROM layout

| Address | Contents | Source |
|--------|----------|--------|
| `0x0000 – 0x3FFF` | Program ROM (16 KB) | computerarcheology RAMUse.html / Hardware.html; MAME map |
| `0x0000` | Reset / cold-start vector — `NOP` then jump to init at `$0008` | Code.html: `0000: 00 NOP ; Start/restart and interrupts end up at 0008` |
| `0x0008` | Stack init (`LD SP,$4BFF`) and main entry | Code.html |

There is no bank-switched program ROM — all 16 KB is permanently
mapped. Only the *video* RAM area is banked (§4).

**Implication for JS:**
- Treat the ROM as a static data blob — **but we are not running 8085
  code**. We're porting *behaviour*. The ROM is consulted as a reference
  for game logic, lookup tables (alien movement patterns at the
  `T14xx`/`T1400` tables, etc.), and tile/sprite data.
- Tile shape data and the alien movement-pattern tables (referenced
  from RAM at `4B50-4B6F`) live in ROM and should be ported as JS
  arrays / JSON.

## 3. RAM layout

The Phoenix machine has **two 4 KB video RAM banks at `0x4000–0x4FFF`**,
selected by the low bit of the video register at `0x5000`. Phoenix only
uses 3 KB of each bank (`0x4000–0x4BFF`). The high 1 KB of each bank
(`0x4C00–0x4FFF`) is unused. RAMUse.html: *"The Phoenix game only uses
3K from each bank (4000 - 4BFF)."*

The two banks aren't game-state-A vs game-state-B — they are
**foreground plane vs background plane** of the display, see §4. Game
state lives in the gaps between the two visible tile regions.

### 3.1 Top-level regions (per bank)

| Range | Size | Purpose |
|-------|------|---------|
| `4000-433F` | 832 B | Foreground tile screen (32×26) |
| `4340-43FF` | 192 B | Game-state variables (player, bullets, scores, IO mirrors) |
| `4400-47FF` | 1 KB | More game state / pattern pointers |
| `4800-4B3F` | 832 B | Background tile screen (32×26) |
| `4B40-4BEF` | ~176 B | Alien table (movement pointers, state, screen pointers) |
| `4BF0-4BFF` | 16 B | **Stack** (grows down from `4BFF`) |

### 3.2 Game-state variable map (selected, from RAMUse.html)

| Addr | Label | Meaning |
|------|-------|---------|
| `4350` | `M4350` | Alien behaviour state (0–6) |
| `4360` | `PlayerMoved` | Player-moved-this-frame flag |
| `4361` | `BulletTriggered` | Player shot status / counter |
| `4362` | `M4362` | **Shield active flag and animation** (Phoenix-specific) |
| `4363` | `ParticleExplosion` | Particle explosion animation state |
| `4368` | `M4368` | **Bird maturity stage (egg → adult)** (Phoenix wave-5 boss) |
| `438C-438D` | `SoundControlA / SoundControlB` | RAM mirrors of `0x6000` / `0x6800` writes |
| `438F` | `CoinCount` | Coins inserted (max 9) |
| `4390-4391` | `Player1Lives, Player2Lives` | Lives per player |
| `43A0` | `IN0Current` | Input snapshot (bit0 coin, bit1 1P, bit2 2P, bit4 fire, bit5 right, bit6 left, bit7 shield) |
| `43A2` | `GameOrAttract` | 0 = attract, 1 = 1P, 2 = 2P |
| `43A4` | `GameState` | Game-state machine (0–7) |
| `43B8` | `LevelAndRound` | low nibble = level, high nibble = round |
| `43BA-43BB` | `AliensLeft`, `BirdsLeft` | Active enemy counts |
| `4381-4387` | `Score1`, `Score2` (BCD, 3 bytes each) | Scores |
| `4389-438B` | `HiScore` (BCD, 3 bytes) | High score |
| `43C0-43CB` | `PlayerState`, `PlayerShape`, `PlayerShipX/Y`, `PlayerBullet*`, `AbovePlayerBullet*` | Player object |
| `43CC-43DF` | five enemy-bullet slots × (state, shape, X, Y) | Enemy bullets |
| `43E0-43FF` | screen-RAM cached pointers (old/new MSB+LSB) for player ship, bullet, enemy bullets | Used to erase last frame |
| `4B50-4B6F` | 16 × 2-byte movement-pattern pointer per alien (`Alien0…AlienF`) | ROM table addresses |
| `4B70-4BAF` | 16 × 4-byte alien data block (state A, state B, X, Y) | Aliens |
| `4BB0-4BEF` | 16 × 4-byte alien screen-RAM pointers (old + current) | Erase/redraw bookkeeping |

**Implication for JS:**
- The game already uses an "object pool" pattern: 16 alien slots, 5
  enemy-bullet slots, 1 player. JS can mirror this — fixed-size arrays
  of plain objects, not dynamic allocation.
- The "old screen-RAM pointer" pattern (`OldPlayerShipMSB/LSB` etc.)
  is a 1980s erase-then-redraw optimisation. **We don't need this in
  JS** — we clear the canvas every frame. Skip the bookkeeping.
- BCD scores are an 8085 nicety (DAA instruction). In JS just use
  numbers and format on draw.
- The two screen planes (FG `4000-433F`, BG `4800-4B3F`) are real and
  must be preserved (§4).

## 4. Video memory

Phoenix has **two independent tile planes**: foreground and background,
each a 32×26 grid of 8×8 tiles, each with its own tile-character ROM,
its own colour palette, and **its own scroll register** (background
scrolls; foreground does not).

| Plane | RAM range (within bank) | Size | Scroll? | Char ROM |
|-------|-------------------------|------|---------|---------|
| Foreground | `0x4000-0x433F` (visible) + `0x4340-0x47FF` (overflow / game state) | 832 visible bytes | No | `fgtiles` |
| Background | `0x4800-0x4B3F` (visible) + `0x4B40-0x4FFF` (overflow / aliens / stack) | 832 visible bytes | **Yes** via `0x5800` | `bgtiles` |

The two planes **share the address window `0x4000-0x4FFF`** via
bank-switching: the low bit of the video register at `0x5000` selects
which plane the CPU sees on a write. So `MOV (HL),A` with `HL = 0x4000`
writes to either FG or BG depending on the current bank latch.

> Hardware.html: "Lower bit selects the RAM bank" and the
> next-to-lowest bit "control[s] the color palette for both foreground
> and background."

There is **no separate sprite RAM**. All moving objects (player ship,
bullets, aliens, birds) are drawn by writing tile codes into the
foreground plane at the addresses cached in
`OldPlayerShipMSB/LSB`-style pointers. "Sprite" in Phoenix means "tile
that gets erased and redrawn at a new tile cell each frame" — the
hardware draws tile cells, not free-positioned sprites.

The tile grid is **rotated 90°** for display (the cabinet is portrait):
RAMUse.html notes "adding 32 to a screen memory pointer moves 1 column
left" — i.e. consecutive bytes go *down* one row in display
orientation, and stride 32 jumps one column.

### 4.1 Scroll register

| Addr | Use |
|------|-----|
| `0x5800-0x5BFF` | Background scroll value, **single 8-bit byte** (write-only) |

Foreground does not scroll. The background tile plane scrolls smoothly
in the vertical direction (which is the *long* axis of the rotated
display) to give the falling-stars / scrolling-starfield effect.

The scroll register is a **single 8-bit write** (every site does
`LD ($5800),A` — there is no write to `$5801` anywhere in the
disassembly). **Units are pixels, not tile rows.**

The canonical write site is `StarsScrollDown` at `$067A`:

```
067A: LD HL,$43B9       ; CounterB9 (8-bit backwards counter)
067D: LD A,(HL)
067E: DEC (HL)          ; counter ticks down by 1 every frame
067F: LD ($5800),A      ; scroll register ← whole counter value
0682: AND $07           ; mask low 3 bits
0684: RET NZ            ; only fall through every 8th frame to refresh BG tiles
```

The fact that the code masks `$07` and only refreshes background tile
contents every 8 counter values confirms the register counts in
**pixels**, with the tile-content refresh wrapping at the 8-pixel tile
boundary. A 1-byte counter decremented every frame gives a 256-frame
(~4.3 s) full-cycle scroll.

**Direction:** the variable is named `StarsScrollDown` and counts
*backwards* (`DEC (HL)`), so the register value decreases over time.
Increasing pixel-offset = scroll *down* in display orientation. The
exact sign is determined by the hardware shifter — for the JS port,
implement as `bgScrollY = (frame * −1) & 0xFF` and verify visually.

Other writes to `$5800`:

| PC | Source | Purpose |
|----|--------|---------|
| `$067F` | `StarsScrollDown` | Per-frame star scroll |
| `$07F3` | `L07F0` | Reload register from CounterB9 after score-flash interrupt |
| `$0AF1` | (level start) | Reload from CounterB9 |
| `$0BAF` | `L0BA0` | **Reset CounterB9 + scroll register to 0** between alien/mothership levels |
| `$2129`, `$22E5`, `$2433`, `$263C` | various stage transitions | Reload scroll value |
| `$005A` | `InitSoundScreen` | Cold-init to `$00` |

**Implication for JS:**
- Two `<canvas>` (or two offscreen layers composited each frame): one
  for FG, one for BG. BG is drawn at a `scrollY` offset; FG is drawn at
  a fixed origin.
- We model both planes as `Uint8Array(32*26)` of tile indices. Drawing
  is "for each cell, blit 8×8 tile from the tilesheet". No sprite
  layer.
- The bank-select bit at `0x5000` doesn't need to be modelled as a
  bank switch — in JS the two planes are separate JS arrays, and game
  code just writes to whichever it means. (The bank switch was an
  8085 address-space conservation hack we don't need.)
- Implement display rotation as a property of the renderer (canvas
  size 208×256 in display orientation = 26 cols × 8 px wide rotated to
  rows; 32 rows × 8 px tall rotated to cols), or store and process in
  the rotated form natively. **Pick one and stick with it** — the
  Galaga port's coordinate-system disaster (`research_coordinate_system.md`)
  was caused exactly by mixing internal and display coordinate spaces.

## 5. Sound

Phoenix has **no sound CPU**. Sound is two memory-mapped registers and
a melody chip:

| Addr | Register | Source |
|------|----------|--------|
| `0x6000-0x63FF` | `control_a_w` — sound A | Hardware.html / MAME |
| `0x6800-0x6BFF` | `control_b_w` — sound B | Hardware.html / MAME |

The sound chip is the **Matsushita MN6221AA** melody chip with four
preset tunes (alarm tone, *Für Elise*, the Phoenix theme, and single
notes). MAME models it as the `TMS36XX` device. Game code writes a
small command byte to `0x6000` or `0x6800`; the chip plays the
corresponding effect or tune autonomously.

### 5.1 The two ports are bit-fields, not enumerated commands

Every write to `$60xx` / `$68xx` in Code.md follows a consistent
convention — code does `OR $xx` / `AND $xx` to *mutate individual
bits* of the RAM mirrors `SoundControlA` (`$438C`) and
`SoundControlB` (`$438D`) and then bulk-copies them to the hardware
via `UpdateSoundControlHW` at `$27A8`.

**SoundControlA (`$6000`) — synth + noise generator:**

| Bits | Meaning | Set by |
|------|---------|--------|
| `bit 7` (`$80`) | Frequency divider / explosion-loud bit | `$27EC` writes `$8F` for ship explosion |
| `bit 6` (`$40`) | **Noise generator on** | `$27D5` `OR $40` for player-bullet sound; `$27DD` `AND $BF` to clear |
| `bits 5..3` (`$10`–`$38`) | Sound-variation speed / frequency divider | `$27D8 LD (HL),$18`; `$3A56 OR $10` for enemy hit |
| `bits 2..0` (`$07`) | Tone-data nibble | bird-wing hit `OR $04` at `$3A7E`; alien-attack background `OR $25..$2D` at `$3AC8` |
| `$0F` written | Mute (the documented mute command at `$002D`) | bottom 4 bits set, no melody trigger; whole register `$0F` = "tone idle" |

**SoundControlB (`$6800`) — melody trigger + synth:**

| Bits | Meaning | Set by |
|------|---------|--------|
| `bits 7..6` | **Melody chip select** (the only place tunes are picked) | `$00` = no melody; `$80` = Tune 2 *Für Elise* (mothership-score, `$392C`); `$C0` = Tune 3 *ESTUDIO* (Phoenix theme, attract `$3A1A`); `$40` = Tune 1 alarm (inferred — Hardware.md says alarm exists; not directly asserted by game code) |
| `bits 5..0` | Synth tone data — **shield ringtone, bird-wave background, mothership rumble, bonus-life jingle**, all share these bits | shield `$3B30` (bits 3..2 from animation counter); bonus-life `$3B40` `OR $07` + `AND $08`; mothership-bg `$3B10` `LD (HL),$0A` then `$3B18` `LD (HL),$1C`; bird-bg `$3AE0` mixes bits 4..2 from `$438E` |

### 5.2 Effect → write mapping (catalogued from disassembly)

| Effect | Port | Bits set | Code site |
|--------|------|----------|-----------|
| Mute (idle) | A & B | both ← `$0F` then both ← `$00` (boot) | `$002D-$0034`, `$0050-$0056` |
| Player bullet "pew" | A | `OR $40` (noise on) | `L27BD` at `$27D5` |
| Player ship exploding | A | `LD $8F` (noise + freq divider) | `L27E2` at `$27EC` |
| Enemy hit | A | `(animation>>1) AND $07 OR $10` | `L3A40` at `$3A56` |
| Bird wing hit | A | `(prev AND $08) OR $04` | `L3A62` at `$3A7E` |
| Alien-wave background "terrible attack" sound | A | `(prev AND $C0) OR ($25 + count)`, count from aliens-in-loop | `L3A98` at `$3AC8` |
| Bird-wave background sound | B | `(prev AND $C0) OR (bit-mux from T3DE0)` | `L3AD0` |
| Mothership-stage background rumble | B | alternating `$0A` / `$1C` from `Counter9A+1` | `L3B02` |
| Player shield ringtone | B | `(animation AND $06) << 1` | `L3B1B` at `$3B30` |
| Bonus-life jingle | B | `(counter AND $08) OR $07` | `L3B33` at `$3B40` |
| Tune 2 — *Für Elise* (mothership-score celebration) | B | `(prev AND $3F) OR $80` | `L3923` at `$392C` |
| Tune 3 — *ESTUDIO* (Phoenix theme, attract mode) | B | `LD $CF` (`1100_1111`) | `UpdateSounds` at `$3A1A` |
| Stop melody (without changing synth bits) | B | `AND $3F` | `L3A82` at `$3A8E` |

The shield activation is the bits 5..3 of port B, modulated by `M4362`
(the shield animation counter). Code at `$3B30` writes
`((M4362 AND $06) << 1)`, giving the iconic shield warble.

**Implication for JS:**
- **Bit-field, not enum.** Don't ship a `SOUND_A_TABLE[byte]` lookup
  — the same byte means different things depending on which bits the
  game just OR'd in. Instead, decode the write into voices:

  ```js
  // pseudocode
  function writeSoundA(byte) {
      noiseGen.gain = (byte & 0x40) ? 1 : 0;          // bit 6
      tone.frequency = freqFromBits((byte >> 3) & 7); // bits 5..3
      tone.subOsc    = noteFromBits(byte & 7);        // bits 2..0
  }
  function writeSoundB(byte) {
      const melody = (byte >> 6) & 3;                 // 00=none, 01=alarm,
                                                      // 10=Elise, 11=ESTUDIO
      if (melody !== currentMelody) startMelody(melody);
      synthB.update(byte & 0x3F);                     // bits 5..0 = synth
  }
  ```

- For the four MN6221AA tunes, ship pre-recorded WAVs. The tune select
  is bits 7..6 of port B; only changes (edges) trigger playback.
- For the noise/synth bits (bird-wing, shield warble, alien-wave
  rumble), synthesise via WebAudio `AudioWorklet` or `OscillatorNode`
  + a noise buffer — these are dirt-simple TTL-era sounds.

## 6. Interrupt model

**Phoenix uses polled VBLANK, not hardware interrupts.** This is
important — it changes the JS frame loop substantially.

Code.html, the `WaitVBlankCoin` routine at `$0080`:

```
WaitVBlankCoin:
0080: 26 78           LD      H,$78               ; 78xx DSW0 Check ...
0082: 7E              LD      A,(HL)              ; ... screen blanking flag
0083: E6 80           AND     $80                 ; Wait for it ...
0085: CA 80 00        JP      Z,[WaitVBlankCoin]  ; ... to set
0088: 7E              LD      A,(HL)              ; Check screen blanking flag
0089: E6 80           AND     $80                 ; Wait for it ...
008B: C2 88 00        JP      NZ,[L0088]          ; ... to clear (0=in blanking)
```

The game **busy-waits** on bit 7 of `0x7800` (the DSW0 port doubles as
the VBLANK status register). It waits for the bit to *set* (entering
blanking) and then to *clear* (entering active scan), giving it a
deterministic frame edge. There are no `EI`, `DI`, `RST 5.5`, `RST
6.5`, `RST 7.5`, or `TRAP` references in the disassembly — the 8085's
maskable-interrupt mechanism is unused.

The cold-start at `$0000`/`$0008` is reached via reset, not an
interrupt return. The "Start/restart and interrupts end up at 0008"
comment is the canonical 8085 reset behaviour, not evidence of an ISR.

VBLANK rate at NTSC arcade timings is **~60.6 Hz** (MAME computes it
from `PIXEL_CLOCK / (HTOTAL × VTOTAL)`). Hardware.md does not state
the rate explicitly. The game **busy-waits** on the blanking flag —
it does not assume any specific rate; it consumes whatever VBLANK the
hardware produces.

**60 Hz is fine for the JS port.** The 0.6 Hz delta
(1.0%) is below the threshold at which the game's tile-grid movement
constants would visibly change behaviour (movements are `INC (HL)` /
`DEC (HL)` of integer X/Y values, with most enemies moving every Nth
frame via counters — see `M435F`, `Counter9A`, `CounterB9`). A 1%
faster game tick is imperceptible. Match `requestAnimationFrame` to
the browser's display refresh and run game logic on a fixed `1/60` s
timestep. Do **not** try to emulate 60.6 Hz precisely.

**Implication for JS — this is the biggest one:**
- Frame loop is **not** "every interrupt do X". It's:
  1. Wait for next display frame (`requestAnimationFrame`)
  2. Run the per-frame game tick (one full pass of what the 8085 did
     between two `WaitVBlankCoin` calls)
  3. Render
- Use a **fixed timestep** of 1/60 s for game logic, with `rAF` driving
  the redraw. If the JS thread misses a frame, run an extra logic tick
  before drawing. Same pattern as `mini_mario`.
- No interrupt re-entrancy to worry about — game logic and "render"
  (the writes into video RAM) happen in one straight-line pass per
  frame, exactly like the 8085 ROM does.

## 7. I/O ports

All I/O is memory-mapped (the 8085 has dedicated `IN`/`OUT` opcodes,
but Phoenix doesn't use them; everything is `LD (HL),A` / `LD A,(HL)`
to addresses in the `0x5000-0x7FFF` range).

### 7.1 Inputs

| Addr | Name | Bits |
|------|------|------|
| `0x7000` | `IN0` (player input, active-low) | See table below |
| `0x7800` | `DSW0` (DIP switches + VBLANK) | bit 7 = VBLANK status (0 = in vblank); bits 0–6 = DIP `LL_BB_C_xx_M` (lives, bonus thresholds, coinage, cabinet) |

`IN0` byte values when one button is pressed (Hardware.html, *active
low*, so `0xFF` = nothing pressed):

| Value | Button |
|-------|--------|
| `0xBF` | Left |
| `0xDF` | Right |
| `0xEF` | Fire |
| `0x7F` | **Shield** (Phoenix-specific 4th button) |
| `0xFD` | 1-player start |
| `0xFB` | 2-player start |
| `0xFE` | Coin insert |
| `0xFF` | (no input) |

The game reads `0x7000` once per frame into `IN0Current` at `0x43A0`
(see §3.2). **There is no bit remap on read.** The `WaitVBlankCoin`
routine at `$008E-$0097` does:

```
008E: LD H,$70           ; 70xx IN0
0090: LD A,(HL)          ; read raw active-low byte
0091: LD HL,$43A0        ; IN0Current
0094: LD B,(HL)          ; save previous
0095: LD (HL),A          ; store raw byte verbatim
0096: INC L
0097: LD (HL),B          ; previous → IN0Previous ($43A1)
```

The byte is stored **as-is, still active-low.** The RAMUse.md table's
"bit 4 = fire / bit 5 = right / bit 6 = left / bit 7 = shield"
description gives the *bit positions*, not their polarity — a button is
pressed when that bit is **0**, matching the hardware byte. Game code
inverts at use-sites: e.g. `L0900` (player X update) does `CPL ; AND
$60` to test left/right, and `CheckInputBits` at `$00BB` does the same
`CPL ; AND B ; AND (HL)` pattern for edge detection.

So the JS `currentInput` snapshot can either:
- mirror the hardware byte (1 = released, 0 = pressed) and `CPL` at
  use-sites — bit-exact to the ROM, or
- store positive-logic booleans (`fire`, `left`, `right`, `shield`,
  `coin`, `start1`, `start2`) and skip the `CPL` — easier to debug.

The second option is recommended; the conversion is trivial and the
ROM's `CPL` patterns become natural-reading conditionals.

### 7.2 Outputs

| Addr | Name | Purpose |
|------|------|---------|
| `0x5000` | Video register | bit 0 = VRAM bank select / cocktail flip; bit 1 = palette select (both planes); bits 7..2 unused by the game |
| `0x5800` | Scroll register | Background vertical scroll, 8-bit pixels (see §4.1) |
| `0x6000` | Sound A (`control_a_w`) | Synth + noise generator bit-field (see §5) |
| `0x6800` | Sound B (`control_b_w`) | Melody trigger + synth bit-field (see §5) |

**Video register `$5000` bit layout** (from `SetBitsVideoRegister` at `$041E`):

```
041E: LD A,($43A3)       ; GameAndDemoOrSplash
0421: AND $01            ; mask bit 0
0423: LD B,A
0424: LD A,($43B8)       ; LevelAndRound
0427: AND $02            ; mask bit 1
0429: OR B               ; combine
042A: LD ($5000),A       ; write video register
```

| Bit | Function | Driven by |
|-----|----------|-----------|
| `bit 0` | VRAM bank / cocktail screen-flip (per Hardware.md, the same bit does both: bank-1 = player-2 view = flipped) | Low bit of `GameAndDemoOrSplash` (`$43A3`): 0 for player 1, 1 for player 2 |
| `bit 1` | Colour palette select (FG and BG, both planes) | Bit 1 of `LevelAndRound` (`$43B8`) — palette flips every other level for visual variety |
| `bits 7..2` | **Unused by game code.** Every write to `$5000` is either the masked `(bit0|bit1)` value above, or the bare values `$00` and `$01` (e.g. `InitSoundScreen`, `CopyMemoryBank`) | — |

The cocktail flip is a side-effect of the bank-select bit, not a
separate bit. So there is no extra "flip-screen" bit to model. The
"flip when 2P serves" behaviour comes for free from the bank-select
machinery.

There is **no per-sprite enable register** (no sprite hardware), and
**no DMA-style sprite-list trigger**. Per-frame "sprite" placement is
just tile-write traffic into `0x4000-0x4FFF`.

**Implication for JS:**
- Input handling: one `keydown`/`keyup` listener that maintains the
  current pressed-buttons set, sampled once at the top of each frame
  tick into a `currentInput` object that mirrors `IN0Current` semantics
  (bit 7 = shield, etc.). Don't process keystrokes mid-frame.
- Output handling: replace memory-mapped writes with direct method
  calls. `writeSoundA(byte)` instead of `mem[0x6000] = byte`. The
  scroll register becomes a single `bgScrollY` integer on the
  background-layer object.
- The bank-select bit at `0x5000` doesn't need a JS analog — see §4.

## 8. Implications for the JS port (summary)

| Hardware fact | JS port consequence |
|---------------|---------------------|
| Single 8085 @ 2.75 MHz, no sound CPU | One execution context. No CPU↔CPU queues. |
| 16 KB ROM, 6 KB RAM (3 KB × 2 banks), no bank-switching for code | Static data tables transcribed to JS. |
| FG + BG tile planes, both 32×26, **no sprites** | Two `Uint8Array(832)` tile grids + tilesheet blits. No sprite layer. Player and aliens write tile codes into the FG plane. |
| BG plane scrolls; FG does not | Render BG with a `scrollY` offset; FG at fixed origin. |
| Display rotated 90° (portrait cabinet) | Tile-grid for game state, separate pixel offset for BG scroll, render rotates to portrait at composite time (`research_code_flow.md` §5.3). |
| Polled VBLANK, no interrupts | Single per-frame logic tick at 1/60 s, driven by `requestAnimationFrame`. Fixed-timestep, like `mini_mario`. |
| MN6221AA melody chip, two write-only command ports | WebAudio sample playback dispatched from `writeSoundA(byte)` / `writeSoundB(byte)`. |
| Inputs polled once per frame from `0x7000` | One `currentInput` snapshot per tick; don't sample mid-tick. |
| Phoenix-specific shield is a single button (`0x7F` on IN0) gated by `M4362` (`0x4362`) | Map to e.g. spacebar; track shield state in player object; trigger sound write to `0x6000`/`0x6800` on shield-on edge. |
| Phoenix bird-boss matures egg→adult via `M4368` (`0x4368`) | One state-machine variable on the boss object; ROM has the animation/behaviour table at `T14xx` to be ported. |

## 9. Sources

| Source | Confidence | Used for |
|--------|------------|----------|
| computerarcheology.com [Phoenix index](https://www.computerarcheology.com/Arcade/Phoenix/) | High | CPU = 8085, sound chip = MN6221AA |
| computerarcheology.com [Hardware.html](https://www.computerarcheology.com/Arcade/Phoenix/Hardware.html) | High | Memory map, IN0/DSW0 layout, video/scroll/sound port addresses, sound chip part number |
| computerarcheology.com [RAMUse.html](https://www.computerarcheology.com/Arcade/Phoenix/RAMUse.html) | High | Per-byte RAM map, two-bank video memory structure, alien/player object layout |
| computerarcheology.com [Code.html](https://www.computerarcheology.com/Arcade/Phoenix/Code.html) (local clone: `D:\tmp\computer_archeology_phonenix\content\Arcade\Phoenix\Code.md`) | High | Polled VBLANK confirmation, sound mute example, reset/init at `$0008`; **scroll register width/units (§4.1), full sound bit-field map (§5.1, §5.2), IN0 raw-store confirmation (§7.1), video-register bit map (§7.2)** |
| MAME [`phoenix.cpp`](https://github.com/mamedev/mame/blob/master/src/mame/phoenix/phoenix.cpp) | High | 2.75 MHz CPU clock; address-map handler names (`phoenix_videoram_w`, `phoenix_videoreg_w`, `phoenix_scroll_w`, `control_a_w`, `control_b_w`); sound device modelling (`TMS36XX` with `MM6221AA`) |

The Hardware.html page is the source of truth for memory geometry; MAME
fills in the clock and exact handler names; Code.html is the source of
truth for runtime behaviour (interrupt model, sound writes).
