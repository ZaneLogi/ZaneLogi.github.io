# research_hardware.md — Asteroids hardware model

Source-of-truth references: `Hardware.md` and `Code.md` in the
ComputerArcheology Asteroids listing (path in `../CLAUDE.md`).
Citations use the `$xxxx` address or routine label form.

## §1. CPU

**MOS 6502 @ 1.5 MHz.**

The CPU runs a fixed-frequency clock at 1.5 MHz with a non-maskable
interrupt (NMI) clocked at 250 Hz from the cabinet hardware. There is
no maskable IRQ source; the IRQ/BRK vector is wired to point at the
RESET routine (`$7FFE → $7CF3`), so any IRQ or BRK effectively
restarts the machine.

**Decimal mode is used selectively for BCD scoring.** Routines that
maintain the player score (`$7397`, `$7402`) toggle decimal mode
around the score-add then clear it (`SED…CLD`). All other code paths
run with decimal mode cleared. Both the NMI (`$7B6A`) and RESET
(`$7CF6`) handlers begin with `CLD` to guarantee a known state in
case an interrupt arrives mid-BCD operation.

**Port implication:** the port does not model the 6502 at the
instruction level — routines port as plain JS functions. BCD scoring
ports as either a string of decimal digits or a JS number with care
around carry; the source's pair of score storage bytes at
`$52-$55` is the model.

## §2. Memory map

The upper address line is **ignored** by the address decoder. The
ROM region `$6000-$7FFF` is physically the only memory there, but it
also responds at `$E000-$FFFF`, which is why the standard 6502
interrupt-vector addresses `$FFFA/$FFFC/$FFFE` map to the ROM bytes
at `$7FFA/$7FFC/$7FFE`. The ROM was assembled with `$6000-$7FFF`
labels.

| Range         | Size | Purpose                                     | Notes |
|---------------|------|---------------------------------------------|-------|
| `$0000-$03FF` | 1 KB | Game RAM                                    | $0000-$01FF = zero page + stack; $0200-$03FF = object tables (two banks via RAMSEL) |
| `$2001-$2007` | 7    | IN0 read switches (one bit per address)     | hyperspace, fire, diag, slam, self-test, plus 3 KHz clock + DVG HALT |
| `$2400-$2407` | 8    | IN1 read switches                           | coin (×3), start (×2), thrust, rotate-left, rotate-right |
| `$2800-$2803` | 4    | DSW1 DIP switches                           | coinage, multipliers, starting lives, language |
| `$3000`       | 1    | `GODVG` (write)                             | Any write starts the DVG drawing the current list |
| `$3200`       | 1    | `LMPSCNS` (write)                           | Lamp + RAMSEL + coin-counter bits — see §6 |
| `$3400`       | 1    | `WATCHDOG` (write)                          | Any write resets the cabinet watchdog |
| `$3600`       | 1    | `SNDEXP` (write)                            | Explosion sound trigger |
| `$3A00`       | 1    | `SNDTHUMP` (write)                          | Thump sound trigger |
| `$3C00-$3C05` | 6    | Saucer / thrust / fire / bonus sound regs   | See §6 |
| `$3E00`       | 1    | `SNDRESET` (write)                          | Noise reset / slam-detected siren |
| `$4000-$47FF` | 2 KB | Vector RAM (`VRAM`)                         | Display list, written by CPU, read by DVG as 1 K of 16-bit words |
| `$4800-$4FFF` | 2 KB | Unused VRAM (expansion space)               | Decoded but not populated |
| `$5000-$57FF` | 2 KB | Vector ROM (`VROM`)                         | DVG subroutines (ship/asteroid/UFO/letters) |
| `$5800-$5FFF` | 2 KB | Unused VROM                                 | Decoded but not populated |
| `$6000-$7FFF` | 8 KB | Game ROM                                    | 6 KB game code + 2 KB vector subroutines image; vectors live at `$7FFA-$7FFF` |

**DVG/CPU bus sharing.** The DVG and CPU share `$4000-$5FFF` as 8 KB
seen by the CPU but 4 K-words seen by the DVG (the DVG reads
little-endian 16-bit words). The mapping is:

| CPU byte range | DVG word range |
|----------------|----------------|
| `$4000-$4FFF`  | RAM `$0000-$07FF` |
| `$5000-$5FFF`  | ROM `$0800-$0FFF` |

(Only the lower half of each region is populated.)

**Port implication:** Two-player RAM banking via RAMSEL (`$3200` bit
3 = mask `$04`, see §6 for the bit-numbering convention) swaps the
active `$0200-$03FF` bank between physical RAM banks. The port can
model this as two JS state objects + an active-pointer; no need to
literally bank-swap memory.

## §3. The NMI handler ($7B65, 250 Hz)

The NMI fires every 4 ms. The handler is short and does only what
must happen at that rate:

```
$7B65  PHA / TYA / PHA / TXA / PHA   ; save A/X/Y
$7B6A  CLD                            ; guarantee binary mode
$7B6B  Stack-bounds sanity check:
         LDA $01FF  / ORA $01D0
         BNE *      ; trap on overflow/underflow → watchdog reset
$7B73  INC $5E                        ; 250 Hz tick counter
       AND #$03 → BNE skip            ; every 4th NMI:
$7B7B    INC $5B                      ;   ~62.5 Hz frame-sync token
         CMP #$04 → BCS *             ;   trap if main loop is too slow
$7B83  JSR $7A93                      ; (input/lamp polling subroutine)
$7B86  Compose lamp byte from $74/$75/$76, write to $6F + $3200
$7BA1  Slam-switch path → write $80 to $3E00 (siren)
       else bonus-ship sound timer → write to $3C05
$7BBA  PLA/TAX / PLA/TAY / PLA / RTI
```

What runs at 250 Hz, then: **stack-sanity check, two timer counters
(`$5E`, `$5B`), lamp output, one sound-channel update**. That is all.
Input, gameplay, drawing, and most sound do NOT run here.

The "stack got out of bounds" infinite loop at `$7B71` is intentional
— it lets the cabinet watchdog (`$3400`, ~16 ms timeout) reset the
system if the stack went rogue.

**Port implication:** The 250 Hz tick is not a render rate. The JS
port models it as a small `nmiTick()` callback firing at 250 Hz only
if we need stable counter cadence; otherwise the counters `$5E` /
`$5B` can be derived from a single per-frame increment because the
main loop's frame-sync gate (see §4) is the only consumer that cares
about precise NMI counting. Either is acceptable; pick the simpler
one in `research_main_loop.md`.

## §4. Main loop frame timing (~62.5 Hz)

`$5B` is the **frame-sync token** between the NMI and the main loop.

| Actor      | Effect on `$5B` |
|------------|-----------------|
| NMI        | `INC $5B` once every 4 NMIs (`$5E AND #$03 == 0`), i.e. ~62.5 Hz |
| Main loop  | `LSR $5B` at the top of each frame, blocks until the LSB becomes 1 |

The main loop block is:

```
$6811  LSR $5B            ; shift LSB into carry, also halves $5B
$6813  BCC $680C          ; if LSB was 0, loop back and try again
$6815  LDA $2002 ; BMI *  ; wait for DVG HALT (previous frame done)
$681A  ... toggle $4001 bit 1 ...
$6822  STA $3000          ; GODVG — kick this frame's DVG list
$6825  STA $3400          ; reset watchdog
$6828  INC $5C            ; fast timer; on overflow INC $5D (slow)
       …
       6-step task sequence (see below)
       …
$687E  branch back to $680C
```

So **frame rate ≈ 250 Hz / 4 = 62.5 Hz**, with two caveats:

1. The `LSR $5B` is destructive — main loop *halves* `$5B` each
   pass. Combined with NMI's `INC`, the steady-state is `$5B`
   alternating 0/1 at ~62.5 Hz.
2. If main-loop work overruns its budget, `$5B` grows past 4 and
   NMI's watchdog-trigger fires (`BCS $7B81`), resetting the cabinet.
   This sets the per-frame compute budget at **roughly 16 ms** before
   the watchdog kicks in.

The frame is not perfectly NTSC-aligned (62.5 Hz vs 59.94 Hz); the
real arcade vector monitor's refresh is dictated by how long the
DVG takes to draw the current list, not by a fixed scanout. The
62.5 Hz figure is the *upper bound* of game-logic frequency.

**Port implication:** In JS, drive the game loop at the host display
refresh (typically 60 Hz via `requestAnimationFrame`) but maintain
**internal 62.5 Hz logic ticks** with a fixed-timestep accumulator
(same pattern as `mario_physics/`). The DVG list is built once per
logic tick. The 0.4 % rate mismatch is well below the threshold
where it would matter.

## §5. DVG/CPU parallelism

The main loop is double-buffered against the DVG:

```
[frame N main loop body] [build DVG list for N+1]
                                                  ↓
                                       [STA $3000 — start DVG]
                                                  ↓
[frame N+1 main loop body]   ...   [DVG draws frame N+1's list]
```

Two pieces of evidence:

1. The main loop's first action after the frame gate is `LDA $2002
   ; BMI *` (`$6815`) — wait for `HALT` from the DVG (i.e. wait for
   the *previous* frame's draw to finish).
2. `STA $3000` (`$6822`) kicks the DVG to draw the list that was
   built during the *previous* frame. Game logic + new-list-build
   happen after `STA $3000`, so the CPU works while the DVG draws.

**Port implication:** No equivalent parallelism is needed in canvas
— each frame, run logic, then `ctx.stroke()` the new list synchronously.
The double-buffer mechanism is a historical artifact of the vector
hardware, not a gameplay-mechanism dependency.

## §6. I/O hardware detail

### Lamps + RAMSEL ($3200, LMPSCNS)

Single output port with mixed-purpose bits. `Hardware.md` lists bits
as **1-indexed from the LSB** (so "Bit 1" = mask `$01`, "Bit 3" =
mask `$04`). The byte-mask column below is the unambiguous form:

| Mask  | Hardware.md name | Meaning |
|-------|------------------|---------|
| `$01` | Bit 1            | 2-Player Start Lamp |
| `$02` | Bit 2            | 1-Player Start Lamp |
| `$04` | **Bit 3, RAMSEL**| Swap active `$0200-$03FF` bank (Player 1 / Player 2) |
| `$08` | Bit 4            | Left Coin Counter |
| `$10` | Bit 5            | Center Coin Counter |
| `$20` | Bit 6            | Right Coin Counter |
| `$40-$80` | —            | Unused |

Verified at `$68C6`: `ORA #$04` ; "Set Bit 3, RAMSEL (Swap In $0200
Memory)" — followed by `STA $3200`. The port will treat bank swap as
a 1-line "active pointer flip" — there's no need to map bits
authentically.

### Sound register file ($3600 / $3A00 / $3C00-$3C05 / $3E00)

Eight write-only registers. Each register triggers a discrete
hardware sound generator (not sample playback). Values written
control trigger / pitch / volume depending on the channel.

| Addr     | Name        | Use                                  |
|----------|-------------|--------------------------------------|
| `$3600`  | `SNDEXP`    | Explosion (asteroid + ship)          |
| `$3A00`  | `SNDTHUMP`  | Low-frequency thump (gameplay rhythm) |
| `$3C00`  | `SNDSAUCR`  | Saucer presence sound                |
| `$3C01`  | `SNDSFIRE`  | Saucer fires                         |
| `$3C02`  | `SNDSELSAU` | Large vs small saucer voice select   |
| `$3C03`  | `SNDTHRUST` | Ship thrust                          |
| `$3C04`  | `SNDFIRE`   | Ship fires                           |
| `$3C05`  | `SNDBONUS`  | Bonus life ding                      |
| `$3E00`  | `SNDRESET`  | Noise-channel reset / slam-detect siren |

**Port implication:** Faithful path is Web Audio synthesis — model
each register as a synth voice triggered/parameterised by the write
value. Visual-effect path is sampled playback. Decision deferred to
`research_sound.md`; until then the port runs silent.

### Switches (IN0, IN1, DSW1)

Each switch occupies one address; the CPU reads the sign bit (`BMI`
test pattern is common). Active-low conventions vary by switch.

| Addr     | Name         | Switch                            |
|----------|--------------|-----------------------------------|
| `$2001`  | `CLCK3KHZ`   | 3 KHz clock (free-running)        |
| `$2002`  | `HALT`       | DVG HALT signal (read by main loop) |
| `$2003`  | `SWHYPER`    | Hyperspace button                 |
| `$2004`  | `SWFIRE`     | Fire button                       |
| `$2005`  | `SWDIAGST`   | Diagnostic step button            |
| `$2006`  | `SWSLAM`     | Slam (cabinet tamper)             |
| `$2007`  | `SWTEST`     | Self-test                         |
| `$2400`  | `SWLCOIN`    | Left coin                         |
| `$2401`  | `SWCCOIN`    | Center coin                       |
| `$2402`  | `SWRCOIN`    | Right coin                        |
| `$2403`  | `SW1START`   | 1-Player Start                    |
| `$2404`  | `SW2START`   | 2-Player Start                    |
| `$2405`  | `SWTHRUST`   | Thrust                            |
| `$2406`  | `SWROTRGHT`  | Rotate Right                      |
| `$2407`  | `SWROTLEFT`  | Rotate Left                       |
| `$2800-3`| `DSW1`       | Coinage, multipliers, lives, language |

**Port implication:** Keyboard maps directly to the IN1 switches.
DIP switches can either be hard-coded (1 coin / 1 credit, 3 lives,
English) or surfaced through a settings UI; the source reads them
once and stores at `$71` (`holdDIP`).

### Watchdog ($3400)

Any write to `$3400` resets the watchdog. The main loop writes once
per frame (`$6825`); the NMI does not. If the main loop hangs
(stalled past ~16 ms — exact timing per cabinet), the watchdog
issues a hard reset.

**Port implication:** Not modeled in the port. Optionally surface as
a console warning if a frame compute exceeds 16 ms — useful for
catching performance regressions.

## §7. Port implications — summary

What the JS runtime MUST model:

- 6502 routines as JS functions, citing the `$xxxx` label
- Memory map only for the regions actually touched by gameplay code:
  the `$0200-$03FF` object tables (as JS state), `$0000-$01FF` for
  scalars (zero page) and game-state flags
- The frame loop: 62.5 Hz logic tick, single canvas `stroke()` per
  tick, internal accumulator vs RAF
- The RAMSEL bank swap: as a two-state-object + active-pointer
- The switch inputs: keyboard-mapped, polled at frame rate
- BCD scoring: as JS numbers or digit strings — the source uses
  pairs of bytes at `$52-$55`

What the JS runtime can omit:

- The watchdog ($3400)
- The DVG/CPU parallelism (canvas draw is synchronous)
- The 250 Hz NMI as a literal interrupt — its consumed counters
  ($5E, $5B) can be approximated by frame-tick math
- The unused expansion regions ($4800-$4FFF, $5800-$5FFF)
- The IRQ/BRK vector (wired to RESET, never expected to fire)
- Decimal-mode toggling: JS handles BCD trivially without a mode flag

## Citations summary (for grep)

- Main loop top: `$6800-$6883` (`Top:` in `Code.md`)
- NMI handler: `$7B65-$7BBF` (`NMI:`)
- RESET handler: `$7CF3-$7E…` (`RESET:`)
- Frame-sync gate: `$6811 LSR $5B / $6813 BCC $680C`
- DVG HALT wait: `$6815 LDA $2002 / $6818 BMI $6815`
- DVG GO: `$6822 STA $3000`
- Watchdog ping: `$6825 STA $3400`
- Lamp/RAMSEL output: `$7B9E STA $3200`
- BCD score: `SED $7397 / $7402`, `CLD $73B0 / $7405`
- Interrupt vectors: `$7FFA-$7FFF`
