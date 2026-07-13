# Research — the Arkanoid MSX PSG sound engine (sequencer port)

The **hardware seam** (register shadow → ayumi-js AY-3-8910) is already done and
verified (see `CLAUDE.md` Audio §). This doc characterises the missing half: the
**software sequencer** that writes that shadow — the bytecode player + effect
generators — so it can be ported routine-for-routine.

Source of truth (external, not in the repo):
`C:\Z_Temp\arkanoid_msx_disasm\` — `sound.asm` (RAM layout), `sounds.asm` (the
sound-ID `equ` table), `sound_src.asm` (the ~1400-line player, ORG 0xB400),
plus the queue + ISR hook in `disassembly.asm`.

This is a genuine register-driven sequencer (not an analog-only subsystem), so
it **ports** — the AY chip does the oscillation, the code does the scheduling.

---

## 0. Dataflow at a glance

```
game event ──ADD_SOUND──▶ SOUNDS_BUFFER (queue, cap 7)
                                │  drained ONE id / frame
                                ▼
                          PLAY_SOUND(id)
                                │  id→descriptor(s)→stream struct(s)
                                ▼
   SOUND_BUFFER_1 (stream 1, plays ch A)     SOUND_BUFFER_2 (stream 2, plays ch B/C)
                                │
        each 60 Hz VBLANK ──▶ SOUND_ISR_UPDATE:
          1. flush the MASKED 14-reg shadow → PSG  (uses last tick's mask)
          2. advance stream 1, dispatch its commands  → writes shadow + sets mask
          3. advance stream 2, dispatch its commands
          4. run period / volume / delayed-repeat effect generators → shadow
                                │
                                ▼
                   SOUNDS_REGS_BUFFER (14-byte shadow) ── flushToAyumi ─▶ ayumi
```

The flush is **one tick behind** the writes: the ISR flushes the mask/shadow
accumulated by the *previous* tick's step 2-4, then re-runs 2-4 to stage the next.
A 1-frame (16 ms) pipeline — port it as flush-then-advance.

---

## 1. The 14-register shadow — and a naming trap

`SOUNDS_REGS_BUFFER` @ `0xE5C4` is 14 contiguous bytes = a shadow of PSG regs
0..13. The flush (`sound_src.asm:541-593`) walks them in order and `out`s each to
the chip, gated by `SOUND_REG_MASK`.

**Trap (important):** the `sound.asm` variable names for the bytes at regs 8-13
are **mislabelled**. The faithful mapping is by *address → register index*, not by
name. The port must use register indices; treat the names as citations only.

| addr    | sound.asm name          | **actual PSG reg** |
|---------|-------------------------|--------------------|
| 0xE5C4  | SOUNDS_REGS_BUFFER      | R0  ch A tone lo   |
| 0xE5C5  | PERIOD_EFFECT0_DELTA    | R1  ch A tone hi   |
| 0xE5C6  | SOUND_PERIOD_CONTROL    | R2  ch B tone lo   |
| 0xE5C7  | SOUND_PERIOD_CONTROL_HI | R3  ch B tone hi   |
| 0xE5C8  | AUX_TONE_PERIOD_LO      | R4  ch C tone lo   |
| 0xE5C9  | AUX_TONE_PERIOD_HI      | R5  ch C tone hi   |
| 0xE5CA  | SOUND_NOISE             | R6  noise period   |
| 0xE5CB  | SOUND_VOICE_CONTROL     | R7  mixer          |
| 0xE5CC  | SOUND_VOLUME_CONTROL    | R8  ch A amplitude |
| 0xE5CD  | PSG_ENVELOPE_SHAPE ⚠    | R9  ch B amplitude |
| 0xE5CE  | SOUND_VOLUME            | R10 ch C amplitude |
| 0xE5CF  | COMPLEX_EFFECT_PARAM_A ⚠| R11 env period lo  |
| 0xE5D0  | COMPLEX_EFFECT_PARAM_B ⚠| R12 env period hi  |
| 0xE5D1  | COMPLEX_EFFECT_FLAGS ⚠  | R13 env shape      |

⚠ = mislabel. E.g. `CMD_LOAD_TWO_BYTE_CONTROL` writes `COMPLEX_EFFECT_FLAGS` /
`_PARAM_A` / `_PARAM_B` — that is really *set the envelope* (shape R13 + period
R11/R12), and it marks mask bit 7 (the envelope group), confirming the mapping.

### 1a. `SOUND_REG_MASK` @ 0xE5C3 — an 8-bit "which reg group is dirty" mask

The flush (`WRITE_MASKED_PSG_REG_AND_ADVANCE` @ `sound_src.asm:469`) rotates the
mask (`rrc c`) once per register *group*; a group is written to the chip only if
its bit is set. Mapping (derived by tracing the `rrc`/`rlc` pattern at :541-579):

| bit | registers gated        |
|-----|------------------------|
| 0   | R0,R1  (ch A tone)     |
| 1   | R2,R3  (ch B tone)     |
| 2   | R4,R5  (ch C tone)     |
| 3   | R6     (noise)         |
| 4   | R8     (ch A amp)      |
| 5   | R9     (ch B amp)      |
| 6   | R10    (ch C amp)      |
| 7   | R11,R12,R13 (envelope) |

R7 (mixer) is gated separately by **bit 7 of `SOUND_VOICE_CONTROL`** itself (see
`WRITE_PSG_REG7_PRESERVING_IO_BITS` @ :431 — it preserves the chip's I/O-dir bits
6-7 and only writes when the shadow's bit 7 flags "changed"). R14 (parallel port)
is gated by a separate flag bit and is effectively unused.

**Port consequence:** because ayumi's tone/noise/amp/env-period setters are
idempotent, `flushToAyumi` can keep pushing the whole shadow every tick. The mask
matters for exactly one thing — **writing R13 retriggers the AY envelope** — so
the port retriggers ayumi's envelope shape only when mask **bit 7** was set this
flush. `Psg._shapeDirty` already models this; drive it from the mask.

The `d` register that each handler passes to the mask-set tail (`lb759h`,
:850) is the group bit for what it touched: note ch A/B/C → `d`=1/2/4;
volume-delay → `d`=0x10; noise → `d`=0x08; env → `d`=0x80; etc.

---

## 2. The queue (disassembly.asm)

- `ADD_SOUND` (`disassembly.asm:2566`): append `A` to `SOUNDS_BUFFER` @ `0xE520`
  at index `SOUNDS_COUNT` @ `0xE51E`, then `SOUNDS_COUNT = min(count+1, 7)`.
  Suppressed while `LASERS_FIRING` (n/a — we have no lasers).
- Drain (`go_on_after_transition`, `disassembly.asm:400-437`): once per game
  frame, if `SOUNDS_BUFFER[0] != 0`, set `SOUND_NUMBER` and `call PLAY_SOUND`,
  then shift the 8-slot buffer down one and `dec SOUNDS_COUNT`. So **one
  PLAY_SOUND per frame**, FIFO.
- ISR hook: `VDP_HOOK_HANDLER` (`disassembly.asm:484`) → `call SOUND_ISR_UPDATE`
  every VBLANK (60 Hz).

Port: the worklet already ticks at 60 Hz on the audio clock. Add a 1-id/frame
queue drain calling `playSound()` just before `isrUpdate()`.

---

## 3. PLAY_SOUND — id → stream struct(s)  (`sound_src.asm:202`)

`TBL_SOUND_PARAMS` @ `0xB406` is a 28-entry **pointer table** (low bytes of
`0xB4xx`) followed by 28 **5-byte descriptor blocks** at `0xB422+` and the
`SOUND_EFFECT_PRESET_TABLE` @ `0xB4AE`.

Id ranges (`:212-253`):
- **id < 128:** index = id (BC = `0xB406 + id` → pointer → block). One block →
  `SOUND_BUFFER_1`.
- **128..191:** index = (id + 144) & 0xFF. One block → `SOUND_BUFFER_2`.
- **192..239:** two blocks. `A=(id-240+48)*2+16` → block into BUFFER_1;
  `A+1` → block into BUFFER_2. (This is how music gets two voices.)
- **≥240:** immediate control commands (mixer/enable pokes), no stream —
  `sound_more_eq_240` @ :402. Not needed for the wired sounds; port as a small
  dispatch for faithfulness/NOP behaviour.

**5-byte descriptor block** `B0 B1 B2 B3 B4`:
- B0: hi nibble = priority, lo nibble = **chain_count**
- B1: **follow_sound_id** (0xFF = none)
- B2: hi nibble = class/priority-store, lo nibble = **repeat_count**
- B3,B4: **stream pointer** (lo,hi) into `SOUND_SEQUENCES`

`QUEUE_SOUND_DESCRIPTOR` (`:276`) checks `CAN_ADD_SOUND` and priority (a lower
priority than the currently-playing one on that buffer aborts), then writes the
**10-byte stream struct**:

| off | field                | source              |
|-----|----------------------|---------------------|
| 0   | active               | 1                   |
| 1   | priority/class       | B2 & 0xF0           |
| 2   | follow_sound_id      | B1                  |
| 3   | chain_count          | B0 & 0x0F           |
| 4   | repeat_count         | B2 & 0x0F           |
| 5,6 | desc_ptr (→ B2)      | BC (points at B2)   |
| 7,8 | stream_ptr           | B3,B4               |
| 9   | ticks_countdown      | 1                   |

Structs: `SOUND_BUFFER_1` @ `0xE5D3`, `SOUND_BUFFER_2` @ `0xE5E9`. `SOUND_PTR_1`
@ `0xE5DA` **aliases** struct1 bytes 7,8 (same for PTR_2/struct2).

**Wired-sound descriptors** (verified against the bytes):
- id 2 (`SOUND_BRICK_DESTROYED`) → pointer[2]=0x2C → block @0xB42C =
  `81 FF 81 / 6A B8` → **stream 0xB86A**, BUFFER_1.
- id 196 (`SOUND_LEVEL_START_MUSIC`) → block @0xB47C = `C1 00 C1 / 68 BA`
  → **stream 0xBA68** BUFFER_1; block @0xB481 = `C1 FF C1 / 8B BA` →
  **stream 0xBA8B** BUFFER_2.
- ids 1/3/7 map similarly (short SFX streams).

---

## 4. Stream advance + the bytecode format  (`ADVANCE_SOUND_STREAM_IF_READY` :130)

Per tick, per active stream: `dec ticks_countdown`; return (nothing) unless it
hit 0. At 0, read `*stream_ptr`:

```
 stream := ( delay cmd* )*  0x00
```
- **delay** = a byte with **bit 7 clear, nonzero** (`:151` `and a; scf; ret nz`
  returns it as the new `ticks_countdown`). It is the step/note duration in
  frames. The commands that follow it are executed **immediately** (this tick);
  the delay is how long before the next step.
- **cmd** = a byte with **bit 7 set** — dispatched (§5), consumed by the loop
  `lb5d9h`/`lb5f2h` (`:604-625`) which `inc bc` then reads; it stops at the first
  bit-7-clear byte (the next delay or the 0x00 terminator).
- **0x00** = phrase end / chain-repeat marker (`:156-188`): decrement
  `repeat_count` → if >0, reload the stream ptr from `desc_ptr` and replay;
  else decrement `chain_count` → if >0, advance `desc_ptr` to the next block;
  else `active=0` and set `SOUND_NUMBER = follow_sound_id` and fall through into
  PLAY_SOUND (a finished sound can **chain** to a follow-on; 0xFF resolves to a
  benign immediate NOP).

Worked trace (stream 0xB86A, id 2): `0C`? no — first byte `7F`=delay 127; then
cmds `9F`(vol-delay), `A9`(period-eff), `80 4C`(note ch A, tone=0x04C), `A2`
(period-eff); then `4C`=delay 76; then `C7`(delayed-repeat)… The 127-frame hold
is a *decaying* note: the vol-delay effect ramps R8 down fast, so it's a chirp,
not a 2-second tone — which is why the effect generators are load-bearing.

---

## 5. Command dispatch  (`:656-715`)

A command byte `1fff pppp`: bits 6-4 (`fff`) index one of 8 handler offsets; bits
3-0 (`pppp`) = inline param → `E` (and `A`, with Z = param==0). Stream 1 uses
`TBL_SECONDARY_SOUND_CMD_ENTRY_OFFSETS` (`:694`), stream 2 uses
`TBL_PRIMARY_...` (`:705`); both index into `SOUND_CMD_HANDLER_BLOCK` @ `0xB676`.
(The "primary/secondary" labels are swapped vs the stream they serve — ignore the
names, follow the offsets.)

**Stream 1 handlers** (offsets 00,0E,22,38,43,41,50,4E):
| fff | name / addr                     | effect |
|-----|---------------------------------|--------|
| 0 | CMD_NOTE_CH1_AND_EFFECT @B676     | note on ch A (R0/R1) + period-eff reinit + delayed-effect preset init + set R8 vol-control |
| 1 | CMD_STREAM1_VOLUME_DELAY @B684    | set R8 vol-control = param, mark bit4; arm DELAYED_REPEAT_STATUS |
| 2 | CMD_STREAM1_PERIOD_EFFECT @B698   | configure PERIOD_EFFECT_STATE_1 (pitch slide/vibrato) from param bits; may build mixer |
| 3 | CMD_STREAM1_DELAYED_EFFECT_A @B6AE| DELAYED_EFFECT_STATE_A = param (arms the preset id INIT reads) |
| 4 | CMD_STREAM1_DELAYED_REPEAT @B6B9  | DELAYED_REPEAT_STATUS / DELAYED_EFFECT_STATE_C from param |
| 5 | ..._FORCED @B6B7                  | as (4) with value \|= 0x10 |
| 6 | CMD_SET_NOISE @B6C6               | R6 noise = param, mark bit3 |
| 7 | CMD_SET_NOISE_FORCED @B6C4        | R6 = param\|0x10, mark bit3 |

**Stream 2 handlers** (offsets 6B,A7,9A,AF,BF,CF,DD,EB):
| fff | name / addr                     | effect |
|-----|---------------------------------|--------|
| 0 | CMD_NOTE_CH2 @B6E1                 | note on ch B (R2/R3) + period-eff reinit |
| 1 | CMD_SET_STREAM2_CONTROL_A @B71D    | R9 (ch B amp) = param, mark bit5 |
| 2 | CMD_STREAM2_PERIOD_EFFECT @B710    | configure PERIOD_EFFECT_STATE_2 |
| 3 | CMD_SET_PARALLEL_CONTROL @B725     | SOUND_PARALLEL flag / COMPLEX flags path |
| 4 | CMD_LOAD_TWO_BYTE_CONTROL @B735    | set envelope: R13 shape + R11/R12 period from 2 payload bytes, mark bit7 |
| 5 | CMD_NOTE_CH3 @B745                 | note on ch C (R4/R5) via lb700h (skips period-eff reinit) + delayed-effect-A stream2 init |
| 6 | CMD_SET_STREAM2_CONTROL_B @B753    | R10 (ch C amp) = param, mark bit6 |
| 7 | CMD_STREAM2_DELAYED_OR_ENABLE @B761| mixer enable / delayed-effect stream2 |

The handler block is one shared code blob with fall-throughs and cross-`jr`s
(e.g. hn0 note falls into the hn1 tail at `lb690h`); the port mirrors each entry
address as a function that may `return`-into the shared tail. Every entry cites
its `sound_src.asm` address.

### 5a. Note handler `CMD_SET_ONE_NOTE_ON_CHANNEL` (`:785`)
Input HL = the target tone-hi shadow byte (R1/R3/R5), D = channel bit (1/2/4),
E = param (cmd lo nibble). It (a) reinits the channel's PERIOD_EFFECT_STATE
(countdown = flags&7; conditional step-sign flip), then at `lb700h`: writes
`R[hi] = E`, reads the **next stream byte** as the payload → `R[lo] = payload`.
So a note = a **12-bit tone period** `(E<<8)|payload`. Then marks the tone group
bit via `lb759h`. CH3 enters at `lb700h` directly (no period-eff reinit).

---

## 6. Effect generators (run every tick in the ISR tail, `:626-654`)

Each modifies the shadow after the streams have staged notes/volumes.

- **UPDATE_PERIOD_EFFECT** (`:892`) — periodic pitch modulation on a tone period.
  State = `[flags, countdown, step]` at stream-buffer+0x0B (i.e.
  `PERIOD_EFFECT_STATE_1/2`). bit7 = active, bit6 = **alternate sign each apply**
  (→ vibrato) vs constant (→ slide), low 3 bits = reload. Every reload+1 ticks:
  add signed `step` to BC (the tone period), write back. ISR calls it for R0/R1
  (state 1, mark bit0) and R2/R3 (state 2, mark bit1).
- **UPDATE_VOLUME_EFFECT** (`:931`) — a **segmented volume envelope**. State =
  `[flags, countdown, steps, segptr, repeat]`. bit7 active, bit6 = ramp
  up(+2)/down(-1), low nibble = reload. Every reload+1 ticks, step the volume
  (clamp 0..15); when `steps` hits 0, either `LOAD_NEXT_EFFECT_PRESET_STEP`
  (next segment) or deactivate. ISR runs it for R8 (state 1, `d`=0x10) and R10
  (state 2, `d`=0x40). This is the SFX "chirp/decay" shaper.
- **UPDATE_DELAYED_REPEAT_EFFECT** (`:990`) — re-arms a repeating effect off
  `DELAYED_REPEAT_STATUS` after a countdown; ties the vol-effect to the repeat.
- **INIT_EFFECT_FROM_PRESET** (`:1016`) + **LOAD_NEXT_EFFECT_PRESET_STEP**
  (`:1044`) — the preset engine. `INIT` (called by every note-ch1) looks at
  `DELAYED_EFFECT_STATE_A` (0 = skip); if armed, indexes `SOUND_EFFECT_PRESET_TABLE`
  @0xB4AE → a `0xB4xx` preset pointer, and seeds the vol-envelope state's segptr
  (+3) / repeat (+4). `LOAD_NEXT...` decodes one preset byte at `0xB4:(segptr)`
  into (flags, countdown, steps) — bits 7-6 → direction/active `d`, bits 6-3 →
  step count, bits 2-0 → reload. **These preset bytes live at `0xB4xx`
  addresses the disassembler rendered as CODE** (e.g. preset value 0xCC →
  0xB4CC, inside ADVANCE) — see §8, the extraction driver.
- **Mixer** `UPDATE_MIXER_FROM_CHANNEL_MASK` / `CONFIGURE_CHANNEL_ENABLES`
  (`:1093`) — builds R7 (`SOUND_VOICE_CONTROL`) tone/noise-enable bits from the
  existing value + a stream byte + DE masks; sets the "R7 changed" flag (bit7).

---

## 7. Event → sound-ID (the faithful wiring set)

From the `ld a,SOUND_*` sites just before `ADD_SOUND`/`PLAY_SOUND`:

| game event (we implement)            | id  | source site (disassembly.asm) |
|--------------------------------------|-----|-------------------------------|
| ball caught / bounced on paddle      | 1   | :7228, :7780                  |
| normal/capsule brick destroyed       | 2   | :8034                         |
| hard (gray) brick hit, not broken    | 3   | :8076                         |
| ball lost (vaus destroyed)           | 7   | :6239, :7657                  |
| level start music                    | 196 | level-init                    |

**Ball↔wall is silent** — the ID table has no wall-bounce sound. Out-of-scope
events (lasers/aliens/DOH/portal/capsule/extra-life) keep their sites unwired.

---

## 8. Extraction (build-time, into `assets/dat_sound.js`)

The player + data span `0xB400..0xC000`. Two problems for a `db`-only parser:
(1) some sound data (§6 preset bytes) lives at addresses the disassembler
rendered as **code**; (2) no Z80 assembler is installed. Solution — build the
full byte image from `sound_src.asm` using BOTH:
- **data lines** (`db`/`dw`): parse operands (existing `build_addr_map` style);
  resolve the one symbolic operand `dw SOUND_SEQUENCES` = 0xB855.
- **code lines**: z80dasm emits the raw opcode bytes in each line's
  `;<addr>\t<xx xx ..>\t<ascii>` comment — parse the tab-delimited byte field.

Emit `export const SOUND = { base: 0xB400, rom: [ …0x0C00 bytes… ], ids: {…} }`
(names from `sounds.asm`). All engine pointer math is `rom[addr - base]`, exactly
mirroring the Z80's absolute addressing.

**Anchor asserts** (fail the build if the image is misaligned):
- `rom[0x000]..[0x002]` = `C3 E8 B4` (`jp PLAY_SOUND`)
- `rom[0x003]..[0x005]` = `C3 94 B5` (`jp SOUND_ISR_UPDATE`)
- `rom[0x455]` = `0x01` (`SOUND_SEQUENCES[0]` @0xB855)
- `rom[0x668]` = `0x0C` (stream 0xBA68 first byte — sfx-196 primary)
- `rom[0x46A]` = `0x7F` (stream 0xB86A first byte — sfx-2)

---

## 9. Port plan (this doc is the spec)

`src/psg/sound_engine.js` — keep `Psg` (the seam) untouched; replace the
`SoundEngine` skeleton with the interpreter: RAM state (2 stream structs, 2
period + 2 volume + delayed states, control bytes, `SOUND_REG_MASK`), `playSound`
(=PLAY_SOUND §3), `isrUpdate` (=SOUND_ISR_UPDATE: masked flush §1a → advance both
streams + dispatch §4-5 → effect gens §6). Every method cites its
`sound_src.asm` label/address. `psg_worklet.js` drains the queue 1/frame §2.
`game.js` fires §7's five triggers. Verify per the plan's headless selfTest
(hand-traced note timeline for streams 0xBA68 / 0xB86A) + audible check.
