# research_sound.md — R-G (dropped, not deferred)

**Status: dropped 2026-05-25.** Sound is not ported. This doc
characterizes *why* and points to references for any future
revisit; it is intentionally short.

## §1. Why R-G is dropped

Asteroids' sound is **discrete analog circuitry**, not software-
emulated even on the cabinet. The 6502 doesn't generate any audio
samples or waveform data — it pokes one byte into one of nine
memory-mapped registers, and a dedicated analog circuit on the
PCB (op-amps, voltage-controlled oscillators, filters, noise
generator) converts that byte into continuous audio.

There is therefore no "sound code" to port. A Web Audio version
would be a *re-design* of the analog circuit topology in
JavaScript — substantively different from the routine-level
translation that defines the rest of this port (see the repo-root
CLAUDE.md "Architecture principle for retro ports"). The educational
goal of the port — exercising 6502 → JS translation against a
real cabinet ROM — gains nothing from synthesizing analog circuits
that have no software counterpart.

I-14 (sound implementation) is dropped as a consequence.

## §2. What the source-side surface area looks like (for the record)

Even though we won't port it, the gameplay-side trigger machinery
is fully visible in the disassembly and worth documenting once
in case anyone ever revisits.

### §2.1 Memory-mapped sound registers (Hardware.md)

Nine bytes total. CPU writes; circuit reads.

| Addr   | Symbol      | Purpose                                  |
|--------|-------------|------------------------------------------|
| `$3600`| `SNDEXP`    | explosion                                |
| `$3A00`| `SNDTHUMP`  | thump (low-freq tone, speeds up per wave)|
| `$3C00`| `SNDSAUCR`  | saucer presence drone                    |
| `$3C01`| `SNDSFIRE`  | saucer fire                              |
| `$3C02`| `SNDSELSAU` | saucer-size select (large vs small)      |
| `$3C03`| `SNDTHRUST` | ship thrust (rumble)                     |
| `$3C04`| `SNDFIRE`   | ship fire                                |
| `$3C05`| `SNDBONUS`  | bonus life                               |
| `$3E00`| `SNDRESET`  | noise generator LFSR reset               |

### §2.2 RAM state (`RAMUse.md` `$66-$6E`)

Per-sound timers + alternation flags + thump phase state.

| Addr | Symbol               | Role                                |
|------|----------------------|-------------------------------------|
| `$66`| `sndTimePlayerFire`  | timer: player-fire duration         |
| `$67`| `sndTimeSaucerFire`  | timer: saucer-fire duration         |
| `$68`| `sndTimeBonusShip`   | timer: bonus-ship duration          |
| `$69`| `sndTimeExplosion`   | timer: explosion duration           |
| `$6A`| `sndAltFirePlayer`   | flip-flop for two-pitch player fire |
| `$6B`| `sndAltFireSaucer`   | flip-flop for two-pitch saucer fire |
| `$6C`| `sndThump`           | current volume + freq for thump     |
| `$6D`| `sndThumpOn`         | timer: thump-on phase               |
| `$6E`| `sndThumpOff`        | timer: thump-off phase (speeds up)  |

### §2.3 Dispatch architecture

1. Gameplay code arms a timer or sets an alt-flip-flop when an
   event occurs (e.g. `STA $69` on asteroid explosion at
   `$6B56`; `STA $66` on player fire).
2. `$7555 soundDispatch` runs once per frame (15-JSR slot 11),
   decrements timers, and writes the corresponding hardware
   register based on timer state.
3. A few sites bypass the dispatch and poke the register
   directly: `$70A7`/`$70E3` for thrust (immediate on the
   thrust-apply/decel sites), `$6937` for `SNDRESET` (game-start
   noise re-seed), `$6EFC-$6F0E` for the bulk-clear at attract
   transition, `$7BB7` for bonus-life sound (NMI handler $7B65
   region), `$7DE5` for thump (test path).

### §2.4 Byte → audio mapping (the part NOT in the disassembly)

Each register's byte format is determined by the analog circuit,
not the CPU code. Rough characterization:

- `SNDEXP`, `SNDTHUMP`: bit-fields for volume + frequency feeding
  voltage-controlled filters.
- `SNDSAUCR`: frequency byte for a VCO that drives the drone.
- `SNDFIRE`, `SNDSFIRE`: the LSB toggles between two pitched zaps
  (matched to the source's `sndAltFire*` flip-flops at `$6A`/`$6B`).
- `SNDTHRUST`: on/off + modulation depth into a noise generator.
- `SNDSELSAU`: single bit, picks one of two notch filters.
- `SNDBONUS`: triggers a one-shot envelope on a fixed-pitch
  oscillator.
- `SNDRESET`: pulse re-seeds the noise generator's LFSR.

The exact bit-field decomposition per register lives in the Atari
schematic and MAME's discrete netlist (see §3), not anywhere in
the 6502 source.

## §3. References (for any future revisit)

If anyone ever decides to port the sound, three external sources
fill the gap left by the disassembly:

- **MAME's discrete netlist for Asteroids** — Atari's analog sound
  hardware is reimplemented in MAME as a node-by-node circuit
  simulation. Historically in `src/mame/audio/asteroid.cpp`;
  modern path may be a separate netlist file under
  `src/mame/atari/`. Gives the exact circuit topology + component
  values.
- **Atari Asteroids schematic** — publicly available with the
  arcade operator's manual. Shows the op-amp networks, filter
  components, and which CPU register-write bits drive which
  analog stages directly.
- **Nicholas Mikstas's Asteroids HDL**
  (<https://nmikstas.github.io/portfolio/asteroidsHDL/asteroidsHDL.html>)
  — FPGA reimplementation that includes a clean digital equivalent
  of each analog sound circuit. Already cited in
  [`research_dvg.md`](research_dvg.md) for the DVG scale formula;
  same source for sound.

## §4. Web Audio port shape (if ever pursued)

For completeness, the three port options:

- **(a) Mirror analog topology** — per channel, build a Web Audio
  graph (OscillatorNode + BiquadFilterNode + GainNode) approximating
  the cabinet circuit. Highest fidelity, most code.
- **(b) Sampled playback** — record each sound from a cabinet
  / MAME, play back .ogg on each trigger. Trivial; one fixed
  pitch per sound (can't modulate saucer drone, thrust, thump,
  fire-pitch alternation).
- **(c) Hybrid** — synthesize parameterized sounds (saucer drone,
  thrust, thump) that need continuous frequency control; sample
  the one-shots (fire, bonus, explosion).

(b) would be the "visual-effect path" deviation; (a) or (c)
would be the source-faithful path.

## §5. Status pointers in the port

- `task_seq.js` `soundDispatch()` is an intentional no-op with
  a comment referencing this doc.
- Every gameplay-side sound trigger (e.g. `Ship.kill`'s
  `STA $69` analog) is documented at site as "sound dropped —
  analog hardware; not ported" with the source address citation
  preserved.
- `progress.md` and `DOCUMENTATION_INDEX.md` both mark R-G and
  I-14 as dropped, not deferred.
