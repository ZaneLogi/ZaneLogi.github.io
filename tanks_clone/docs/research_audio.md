# research_audio.md — the `$EA7E` sound engine (S11 / Audio)

Faithful decode of Battle City's SFX subsystem, for the Layer-2 port. Layer 1
(the Web Audio voice backend) is validated in `demo/audio_test.html`; this doc
covers Layer 2 — the ROM's **bytecode SFX sequencer**, its data, and how it maps
onto the Layer-1 voices.

Governing test as everywhere in this port: **faithful to what the player can
*hear*; free with what only the CPU can observe.**

---

## 0. The shape in one paragraph

The game never touches the APU directly. Gameplay routines raise a **request flag**
(`ram_sfx_*`, the 28 bytes `$0300-$031B`); once per NMI, `sub_EA7E` ($EA7E) scans
those flags and runs, per active sound, a tiny **bytecode program** that maintains
four "$4000-style" register bytes and writes them to one of the 4 APU channels.
Each SFX in ROM is that bytecode (a note/duration/loop stream), pointed to by
`tbl_ECFE` ($ECFE); pitches come from a 12-entry table `tbl_ECE6` ($ECE6). So an
SFX is *data* (content the player hears — kept verbatim) interpreted by a *routine*
(timing/rules — ported) that pokes *registers* (CPU-only plumbing — dropped; we
decode the register bytes to Web Audio voice params instead).

Two mode transitions **wait on this engine**: `GameOver` ($C630) and `HallOfFame`
($C495) spin until their jingle finishes — the sound *is* the timer. So the port
must expose `isPlaying(id)`. (progress.md "NOT SOURCE".)

---

## 1. Where it runs

- **`sub_EA7E_sound_driver` ($EA7E)** — called from the NMI at **$D439**, once per
  logic frame (60.0988 Hz). Not part of the `$C2E6` battle pipeline; it is a
  peer of it, like `sub_DEA6` render. In our tick order (`$D400`: input → **audio**
  → counter → update) it runs *before* `update()`, consuming the prior frame's
  requests — the same one-frame pipeline the rest of the port honors.
- **Pause gate ($EA7E-$EA8C):** reads `ram_pause_flag` ($6D). Not paused → scan
  all 28 slots; paused → scan **only slot 0** (`ram_sfx_pause`). This is why the
  demo is silent and why pausing mutes everything but the pause blip.
- **`sub_EA51_clear_sound_engine_data` ($EA51)** — `$4015=$0F` (enable pulse1/
  pulse2/triangle/noise, no DMC), `$4017=$C0` (frame counter), zero the `se_data`
  blocks + `ram_sounds`. Called at boot, stage reset ($C15C/$C253), game-over
  ($C63E).
- **Movement SFX, pipeline step 16 — `sub_DB0B` ($DB0B):** decides from roster
  motion whether to (re)trigger `ram_sfx_movement_player`/`_enemy`/`_ice` each
  frame. Sustained sounds; the `$F9` main-loop control byte keeps them ringing
  (see §4).

---

## 2. Channels, type, and priority

`ram_sounds[i]` (i = slot 0..$1B) is the request flag **and** the slot index *is*
the sound id *is* the `tbl_ECFE` index. Each sound's `se_data` block carries a
**type byte** = **channel + 1**:

| type | channel | APU regs | Web Audio voice |
|---|---|---|---|
| `$01` | 0 | `$4000-$4003` | PulseVoice |
| `$02` | 1 | `$4004-$4007` | PulseVoice |
| `$03` | 2 | `$4008-$400B` | TriangleVoice |
| `$04` | 3 | `$400C-$400F` | NoiseVoice |

**Priority arbitration (`ram_00F9_se[4]`, $EAF8-$EB0F):** pass 1 scans slots in id
order; the first to claim a channel wins (`SBC #$05` promotes a claimed sound's
type by +5 so later frames just re-affirm), and a lower-priority sound finding its
channel busy is skipped and its channel silenced. **Type is NOT genre** — the game
spreads SFX across channels for polyphony, e.g. HQ-explosion is pulse2 (`$02`),
brick-hit is triangle (`$03`); only 3 SFX use noise.

> **Deviation — DROP arbitration (Zane, unlimited-voices add-on).** We keep
> **type → waveform** but drop the 4-channel exclusivity: each active sound gets
> its own voice, nothing is cut off. The audible consequence (two pulse2 sounds
> both sounding instead of one winning) is exactly what Zane is evaluating; revert
> to 4 voices + arbitration if it muddies gameplay. Multi-part jingles survive for
> free because their parts already use distinct types (§5).

---

## 3. The `se_data` state block (8 bytes/slot, `$031C+`)

Walked 8-at-a-time by the driver (`ADC #$08`). Indices (`con_se_index_*`):

| idx | meaning | maps to |
|---|---|---|
| 0 | type/state (0=idle; 1-4 = channel+1; +5 = "claimed", faithful arb only) | — |
| 1 | register A | `$4000/$4004/$4008/$400C` — duty+vol / ctrl |
| 2 | register B | `$4001/$4005/$4009/$400D` — **pulse sweep** (the shot's pew, the engine warble) |
| 3 | register C | `$4002/$400A/$400E` — timer-lo / **noise period** |
| 4 | register D | `$4003/$400B/$400F` — timer-hi+len / len |
| 5 | data pointer (byte **offset** into the stream) | — |
| 6 | step duration (frames) | set by `$61-$E7` |
| 7 | step countdown | copied from idx6 per note, DEC'd each frame |

The driver has **two passes**: pass 1 emits idx1-4 → the channel (with arb);
pass 2 advances the sequencer (countdown idx7; at 0, read next bytes → update
idx1-4 for next frame). We **fuse** them per-voice (no arb → no cross-sound emit
ordering to preserve); the 1-frame emit/advance offset is CPU-only (dropped).

> **Deviation — split the packed state into fields**, like `Tank` flags / `Base` /
> `Bullet` (data-model rule): `{type, regA, regB, regC, regD, pc, stepLen,
> stepLeft, loops[3]}`. The 3 loop counters are ROM zero-page **globals** ($F6-$F8)
> that the data carefully keeps disjoint across simultaneous sounds; per-sound
> counters give identical behavior and can't clobber (CPU-only storage detail).

---

## 4. Control-byte vocabulary (complete — the opcode set is closed)

A stream = a **header** then a **body** of tokens. Dispatch: `$00-$5F` note,
`$60` hold, `$61-$E7` duration, `$E8-$FF` control (jump table `$EBE6`).

**Header** (loaded at `loc_EB4F`, 4 raw bytes → idx 0,1,2,4; **type `$04` reads a
5th** → idx3): `{type, regA, regB, regD [, regC]}`. Header bytes are **raw
register values, not opcodes** (e.g. bonus_appear's `$60` at the regA slot is the
literal `$4004` value, not "hold").

**Body tokens:**

| byte | name | effect |
|---|---|---|
| `$00-$5F` | **note** | `X=(b & $F8)>>2` indexes `tbl_ECE6` → 16-bit base period; `oct=b & $07` right-shifts it `oct` times; split → idx3 = period-lo, idx4 = (idx4 & $F8)\|(period-hi & 7). Then idx6→idx7 and the note holds `stepLen` frames. Authored as `semitone*4 + octave`. |
| `$60` | hold | re-emit current registers for the step (no pitch change) |
| `$61-$E7` | **duration** | `stepLen = b - $60` (frames per subsequent note) |
| `$E8` | **stop** | mark slot idle (`ram_sounds[i]=0`) → sound ends |
| `$E9` | set regB sweep | read byte → idx2 = (idx2 & $3F)\|byte |
| `$EA` | **set regA lo6** | read byte → idx1 = (idx1 & $C0)\|byte — **manual volume/envelope step** |
| `$EB` | set regA lo4 | read byte → idx1 = (idx1 & $F0)\|byte (volume nibble) |
| `$EC` | set regB | read byte → idx2 = (idx2 & $F0)... → `$4001/5/9/D` |
| `$ED` | set regD | read byte → idx4 |
| `$EE` | set regA | read byte → idx1 (full) |
| `$EF` | clear loop counters | zero the 3 loop counters |
| `$F0/$F1/$F2` | **loop 1/2/3** | read `count`; `++loop[k]`; if `!= count` → read `target`, `pc = target` (jump back); else reset + skip `target` (fall through). Loop body plays `count` times. |
| `$F3-$F8` | pc += 1 | (loop-done fall-through; skips the target byte) |
| `$F9` | **main loop** | read `target` → `pc = target` — unconditional jump (sustained movement SFX loop here forever until the request is cleared) |

`target` bytes are **offsets from the stream start** (idx5 is a byte offset;
`sub_ECBE` reads `stream[idx5++]`).

---

## 5. The data — extracted verbatim into `dat_sfx.js`

### 5a. Pitch table `tbl_ECE6` ($ECE6) — 12 × 16-bit base periods
Stored big-endian (`.byte hi, lo`), one octave, indexed by `(note & $F8)>>2`:

```
$07F2 $0780 $0714 $06AE $0643 $05F4 $059E $054E $0502 $04BA $0476 $0436
```
(A note's `octave` field right-shifts the chosen value 0-7 times.)

### 5b. Pointer table `tbl_ECFE` ($ECFE) — 28 ids → streams
Slot id = `ram_sfx_*` index. **id `$08` is unused** (a dead "shot" variant — keep
the slot, never triggered). Type (§2) and trigger site per sound:

| id | name | type/chan | requested at |
|---|---|---|---|
| 00 | pause | 2 pulse2 | $C218 |
| 01 | stage_load_1 | 1 pulse1 | $C1C7 |
| 02 | stage_load_2 | 3 tri | $C1CA |
| 03 | stage_load_3 | 2 pulse2 | $C1CD |
| 04 | gain_life_1 | 1 pulse1 | $D163 / $EA42 |
| 05 | gain_life_2 | 2 pulse2 | $D166 / $EA45 |
| 06 | bonus_pickup | 2 pulse2 | $E9C7 |
| 07 | explosion_player | **4 noise** | $E6B7 / $E765 |
| 08 | *(unused)* | 2 | — |
| 09 | bonus_appear | 2 pulse2 | $E8C0 |
| 0A | explosion_enemy | **4 noise** | $E7F8 / $EA1D |
| 0B | explosion_hq | 2 pulse2 | $E6B4 |
| 0C | bullet_hit_brick | 3 tri | $E6E5 / $E6F7 |
| 0D | bullet_hit_wall | 2 pulse2 | $E706 |
| 0E | bullet_hit_tank | 2 pulse2 | $E7EC |
| 0F | shot | 1 pulse1 | $E096 |
| 10 | movement_ice | 1 pulse1 | $DBC4 |
| 11 | movement_player | 2 pulse2 | $DB20/$DB34 |
| 12 | movement_enemy | 2 pulse2 | $C22C/$C38C |
| 13 | score_count_1 | 2 pulse2 | $CD2A/$CD48 |
| 14 | score_count_2 | **4 noise** | $CD2D/$CD4B |
| 15 | hiscore_1 | 1 pulse1 | $C47D |
| 16 | hiscore_2 | 2 pulse2 | $C480 |
| 17 | hiscore_3 | 3 tri | $C483 |
| 18 | game_over_1 | 1 pulse1 | $C61B |
| 19 | game_over_2 | 2 pulse2 | $C61E |
| 1A | game_over_3 | 3 tri | $C621 |
| 1B | bonus_1000 | 2 pulse2 | $CE7E/$CED9 |

*(Types come from each stream's byte-0 header, read at extract time.
`explosion_player` header `$04,$1F,$7F,$30,$0A`: type 4, regA=$1F, regB=$7F,
regD=$30, regC=$0A — the 5-byte type-4 form. The last five were `?` until the
extractor ran; both jingles are the same pulse1+pulse2+triangle trio.
`dat_sfx.js` carries a `type` for all 28. Resolved 2026-07-20; was an open `[?]` in §10, since removed as empty.)*

### 5c. Streams — parsed from `bank_FF.asm`
The extractor reads the **raw hex byte** column (`00:ADDR: BYTE`), not the `.byte`
expression, for every address in each `_off000_sfx_*` label's range. No decoding
at build time — the runtime interpreter walks the raw bytes. (Same discipline as
the stage/CHR extraction: `extract.py` validates, emits ES modules, runtime never
decodes.)

---

## 6. Register bytes → Web Audio voice params (the decode layer)

Per frame the interpreter yields idx1-4 for each voice; the voice decodes:

- **Pulse (type 1/2):** duty `= regA>>6`; `T = ((regD & 7)<<8) | regC`;
  `freq = 1789773/(16·(T+1))`, muted if `T<8`. Volume from regA bit4 (constant
  → `regA & $0F`) **or envelope** (bit4=0 → decay 15→0; see below).
  - **Sweep (regB / `$4001`) — DON'T DROP IT.** bit7 enable, bits6-4 divider
    period, bit3 negate, bits2-0 shift. When enabled it steps the timer period
    every `(period+1)` half-frames (~120 Hz): `p ± (p >> shift)`, muting when `p`
    leaves `[8, $7FF]`. This IS the **shot's descending "pew"** (`regB=$82`: 1165→66 Hz
    over ~117 ms, then silence) and the **tank-engine warble** (`$94`). Only a few
    streams enable it — most carry `$7F` (bit7 = 0, off). Ported as a scheduled
    frequency trajectory on the pulse voice (`SWEEP_CLOCK_HZ`, tunable). *Originally
    (wrongly) dropped as "unused"; the flat-beep shot exposed it.*
- **Triangle (type 3):** `T` as above; `freq = 1789773/(32·(T+1))`, muted if `T<2`;
  on/off gate (no volume).
- **Noise (type 4):** period index `= regC & $0F`, mode `= regC & $80` (the note
  token drives this via the same pitch mechanism); volume from regA (bit4/env).

### Volume / envelope — reproduce the *audible* decay, not the divider
- **Manual decay** (`$EA` steps, e.g. explosions 14→8): set voice gain per step.
  Faithful and trivial.
- **Hardware envelope** (regA bit4=0, e.g. shot `$8F` → env period 15): the NES
  envelope decays 15→0, `(period+1)` quarter-frames per step (~240 Hz clock). We
  reproduce it as a **GainNode ramp** over `15·(period+1)/240` s, restarted per
  note — "re-derive in our view." Emulating the quarter-frame divider is CPU-only.
  - The constant **shipped unchanged**: `decodeVolume` in `audio.js` is literally
    `15 * ((regA & $0F) + 1) / 240`, and Zane's by-ear pass on the 28-button harness
    plus real play accepted it, so the "tune if needed" never became needed. (The
    shot's wrongness turned out to be the dropped **sweep**, not the ramp — §6's
    sweep bullet.) *(Resolved 2026-07-20; was an open `[?]` in §10, since removed as empty.)*
- **Length counter** (regD/regA bit5 + len bits): auto-silence unit. The SFX drive
  timing from **explicit durations + `$E8`**, so the length counter is redundant
  plumbing here — **dropped** (sequencer timing is what's observable).
  - *Confirmed against the extracted data, not just assumed:* all 28 streams in
    `dat_sfx.js` terminate on their own. 26 end on `$E8`; the only two that do not
    are `movement_player` / `movement_enemy`, which loop on `$F9` **by design** —
    they are the engine hums, and the game stops them explicitly at `$C229`/`$C22C`
    (and `$C22C`/`$C38C` restarts the enemy one). So no stream was relying on the
    length counter to end, and dropping it silences nothing.
    *(Resolved 2026-07-20; was an open `[?]` in §10, since removed as empty.)*

---

## 7. Governing-test verdicts (design vs artifact)

| source mechanism | verdict | why |
|---|---|---|
| SFX streams + `tbl_ECE6` | **keep verbatim** (dat_sfx.js) | the content the player hears |
| bytecode interpreter (notes/dur/loops/`$F9`) | **port** (timing/rules) | the sound's structure is observable |
| type → waveform | **port** | which channel a sound sings on is audible |
| 4-channel priority arbitration | **drop** (unlimited voices, Zane) | deliberate add-on; revert if muddy |
| register pokes `$4000-$400F` | **drop** → decode to voice params | pure APU plumbing (emulator's job) |
| hardware envelope divider | **re-derive** as gain ramp | audible decay yes; the 240 Hz divider no |
| pulse **sweep** unit (regB) | **port** as a scheduled freq trajectory | the shot's pew + engine warble are the whole point |
| length counter auto-silence | **drop** | superseded by explicit stream timing |
| 2-pass emit/advance, 1-frame prime | **fuse per-voice** | ordering only matters under arb; 16 ms |
| loop counters in ZP globals | **per-sound fields** | storage location unobservable |

---

## 8. The build (Layer 2)

- **`tools/extract.py` → `assets/dat_sfx.js`** — parse `tbl_ECE6` (12 words),
  `tbl_ECFE` (28 ids + names), and each `_off000_sfx_*` stream (raw bytes).
  Validate: every stream terminates (`$E8` or `$F9` loop), all pointer targets
  in range, 28 ids. Emit `SFX` id enum + `PITCH_TABLE` + `SFX_STREAMS`.
- **`audio.js` — the real module** (rewrite from stub):
  - `PulseVoice` / `TriangleVoice` / `NoiseVoice` — the Layer-1 backend, promoted
    from `demo/audio_test.html` (decoded-param API).
  - `SoundEngine` — owns the voices + the interpreter. `request(id)` (the
    `ram_sfx_*` flag), `tick()` (advance every active sound one frame → voice
    params; the fused pass), `isPlaying(id)`, `clear()` (`$EA51`), and
    `movementSfx(roster)` (`$DB0B`). Unlimited voices: one voice per active sound.
- **`demo/audio_test.html` becomes the harness** — instead of hand-authored SFX,
  it imports `SoundEngine` + `dat_sfx.js` and gives 28 buttons that `request(id)`
  the **real ROM streams**. The Layer-1 interactive channel strips stay (still the
  fastest way to poke a voice). This is the "extract for the demo" deliverable.
- **Integration (later, completes the S11 phase):** wire the `ram_sfx_*` requests
  into the subsystems at their §5b sites (fire→shot, hits→bullet_hit_*, explosions,
  movement via step 16, jingles at stage-load/game-over/hiscore), and point
  `GameOver`/`HallOfFame` at `isPlaying(...)` to retire the `NOT SOURCE` timer debt.

---

## 9. Verification plan

- **Deterministic (headless):** the interpreter is reproducible — step a sound N
  frames, assert the register-byte trace matches a hand-decode of its stream
  (e.g. explosion_player's `$1E→$18` volume ramp; stage_load_1's loop counts;
  a `$F9` movement sound loops forever). Assert all 28 streams run to a terminal
  state without out-of-range reads. `isPlaying` true→false at the decoded length.
- **By ear (Zane):** the 28-button harness — do the real streams sound right, and
  does unlimited-voice overlap feel OK in the gameplay burst?
