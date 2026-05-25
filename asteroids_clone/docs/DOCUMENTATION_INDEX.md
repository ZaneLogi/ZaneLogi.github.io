# asteroids_clone — Complete Documentation Index

**Date:** 2026-05-25
**Status:** Implementation phase essentially complete for the
single-player educational port. I-7 through I-13 all **done**:
ship rotates + thrusts + fires + hyperspaces, asteroids spawn /
split / collide / re-spawn-after-wave-clear, saucer spawns + AI +
fires + dies, ship dies + respawns + game-overs, HUD shows score +
lives + high-score table during attract, scoring covers all
collision pairs (bonus life at 10k), coin → start → game →
game-over → attract loop runs end-to-end. **Temp lives-replenish
stub retired** as planned by I-12e.
Remaining: I-14 (sound, R-G dependency). Dropped per
`user_retro_port_goal`: 2-player support (I-12c), high-score
letter entry (I-12g), power-on test pattern, demo AI in attract.

**Total docs:** 9 research docs (~4,500 lines) — added
`research_game_state_machine.md` as pre-research for I-12.

---

## Quick Navigation

### Research docs (under `docs/`)

| Document | Focus | Key Sections | Length |
|----------|-------|--------------|--------|
| **research_hardware.md** | 6502 CPU, memory map, NMI vs frame timing, I/O | §1 CPU, §2 memory map, §3 NMI handler ($7B65), §4 frame timing (~62.5 Hz via $5B gate), §6 I/O (lamps/RAMSEL/sound/switches) | 308 lines |
| **research_dvg.md** | Display-list spec, opcodes, canvas interpreter | §2 memory model, §3 coords (1024×1024, Y-flip), §4 scale (global+local, /512..\/1), §5 brightness (3 canvas options), §6 opcode reference, §10 interpreter pseudocode | 476 lines |
| **research_position_math.md** | 16-bit positions, signed velocities, sub-pixel motion, screen wrap | §1 position arrays, §2 velocity, §3 carry-propagation update ($6FC7), §4 toroidal wrap, §5 ship dual-precision velocity, §6 **three-layer coord model**, §7 port deviation (Float64) | 391 lines |
| **research_main_loop.md** | $6800 dispatch loop, per-frame task sequence, state machine | §2 preamble, §3 the 15 JSRs, §4 delayBeforePlay gate, §5 state machine diagram, §6 wave progression, §7 two-player RAMSEL, §9 port spec | 448 lines |
| **research_collisions.md** | Geometric collision tests + dispatch + resolution + scoring | §2 dispatch (X-shooter / Y-target), §3 kernel ($6A0A) — **incl. step 2 LSR/ROR correction (|dx|/2 fold; effective radii 2× table)**, §4 (no) wrap-awareness, §5 resolution + scoring + split, **§5.1 $75EC decoded**, **§5.2 shrapnel render path (Pattern 4→1; mod-16 gs growth)**, §6 port spec (source-faithful BB after I-11's revert of the earlier Euclidean port deviation), **§7 deferred questions (resolved: collision-tightness, saucer-adjust block dead code, score-table 3-byte direct lookup, ship-vs-saucer X-swap; open: $745A/$745C slot-scanner decode)** | 599 lines |
| **research_vector_rom.md** | 2 KB vector ROM — subroutine inventory + port spec | §1 overview, §3 inventory (ship, asteroid, UFO, shrapnel, characters), §3.8 ship-direction table + reflection, §5 port spec (keep ROM raw) | 379 lines |
| **research_hud_coords.md** | HUD coordinate system — `$7C03` byte→DVG mapping + `$72FE` +128 playfield Y-offset + HUD callsite decode | §1 LABS-emit helper, §2 per-slot dispatcher Y-offset, §3 visible coordinate bounds, §4 HUD callsites (score gs=1, lives gs=14), §6 digit emit pattern + Char_O alias | 438 lines |
| **research_ship_explosion.md** | Ship explosion 6-fragment animator — `$7465-$7508` decode + port summary | §3 ROM data (ShipExplosion + SHIP_EXPLOSION_VELOCITY), §4 init phase, §5 per-frame phase + fragment count formula, §6 status-increment formula (fastTimer-bit-0 gate), §8 port summary as landed in I-11e (six deviations) | 487 lines |
| **research_game_state_machine.md** | numPlayers state machine + `$6885` playerMgmt + `$6960` game-over + `$765C` placement + `$68F0` burst + `$77F6` PrintPackedMsg + 2-player bank-swap → PerPlayerState mapping | §1 state machine, §2 revised 15-JSR dispatch, §3 playerMgmt, §4 game-start burst, §5 game-over flow, §6 placement detector, §7 PrintPackedMsg format + 11 messages + LABS coord table, §8 bank-swap → PerPlayerState, §9 port deviations | ~720 lines |

### Source-of-truth files (in the ComputerArcheology mirror)

Path: see `../CLAUDE.md` "Source of truth". Local clone at
`C:\Z_Temp\computer_archeology_asteroids\content\Arcade\Asteroids\`.

| Document | Focus | Length |
|----------|-------|--------|
| `Code.md` | Full 6502 disassembly + commentary | ~187 KB / ~3,200 lines |
| `Hardware.md` | CPU + memory + display + sound + input | 3 KB |
| `RAMUse.md` | RAM layout for $0000-$03FF with labels | 10 KB |
| `DVG.md` | DVG hardware spec + opcode set | 8 KB |
| `VectorROM.md` | Vector ROM dump + breakdown (Rev 2) | 72 KB |
| `VectorROM1.md` | Vector ROM (Rev 1) — text-string differences only | 70 KB |
| `roms/035127.02` | Raw vector ROM binary (2 KB) | 2 KB |

---

## Architecture Overview

### The four layers

```
┌──────────────────────────────────────────────────────────────┐
│  GAME LOGIC (state machine, input, per-object motion, AI)    │
│  research_main_loop.md §3,§5; research_position_math.md      │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  COLLISION + SCORING (geometric tests, resolution, BCD score)│
│  research_collisions.md §3-§5; research_hardware.md §1 (BCD) │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  DVG INTERPRETER (display-list parser → canvas line draws)   │
│  research_dvg.md §10 (pseudocode); research_vector_rom.md §5 │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  HARDWARE MODEL (CPU model, frame timing, NMI, I/O ports)    │
│  research_hardware.md §1-§4, §6                              │
└──────────────────────────────────────────────────────────────┘
```

### Data flow per frame (from `research_main_loop.md §8`)

```
0. (NMI tick at 250 Hz — increments $5B, $5C; lamp output; one sound channel)
   research_hardware.md §3

1. Frame-sync gate ($6811-$6813) — wait for NMI to tick $5B
   research_hardware.md §4

2. Preamble — DVG HALT wait, GODVG kick, watchdog ping, double-buffer toggle
   research_main_loop.md §2

3. Task sequence (15 JSRs)
   research_main_loop.md §3
   ├─ playerMgmt → attractText → highScoreMgmt → highScoreEntry?
   ├─ [if delayBeforePlay == 0:]
   │   playerFire → shipControl → shipSpawnPhys → saucerSpawn
   ├─ asteroidUpdate
   │   research_position_math.md §3 (carry-propagated 16-bit motion)
   ├─ collisions
   │   research_collisions.md §3 (BB ∩ Manhattan threshold)
   └─ scoreLivesDraw → soundDispatch → (closing $7C03 emit) → advanceRNG → emitHalt
       research_dvg.md §10 (opcode emit), research_vector_rom.md §3 (JSR targets)
       — per-object draws were emitted inside their update routines
         above (callers of $7C03); exact gs values are read from
         source during the per-object port steps (I-8/I-9/I-10/I-12)

4. Wave-progression trailer ($6876-$6883)
   research_main_loop.md §6

5. (DVG runs the just-built list while CPU enters next frame — parallelism)
   research_dvg.md §9; in the port, canvas.stroke() is synchronous
```

### Object model

35 game objects, all using the same position/velocity layout
(`research_position_math.md §1`):

| Slot         | Count | Status array slot |
|--------------|-------|-------------------|
| Asteroids    | 27    | `$0200-$021A`     |
| Ship         | 1     | `$021B`           |
| Saucer       | 1     | `$021C`           |
| Saucer shots | 2     | `$021D-$021E`     |
| Ship shots   | 4     | `$021F-$0222`     |

Per-object state at the same X index across the parallel arrays at
`$0200-$02F4`. Two-player game banks `$0200-$03FF` via RAMSEL (port
models this as two state objects + active pointer; see
`research_hardware.md §6` + `research_main_loop.md §7`).

---

## Cross-Document Reference Map

### research_hardware.md

| §  | Topic | Cross-refs |
|----|-------|-----------|
| §1 | 6502 CPU, BCD scoring (SED at $7397/$7402) | collisions §5 (saucer score), main_loop §3 (advanceRNG) |
| §2 | Memory map ($0000-$7FFF, upper-line-ignored) | dvg §2 (CPU/DVG bus share), vector_rom §2 |
| §3 | NMI handler $7B65 (250 Hz) — counters, lamps, one sound | main_loop §2 (frame-sync uses $5B), main_loop §3 task #19 (advanceRNG NOT here) |
| §4 | Frame timing (~62.5 Hz via $5B LSR/BCC at $6811) | main_loop §2 (the gate code) |
| §5 | DVG/CPU parallelism (double-buffered) | dvg §9 (display-list lifecycle), main_loop §2 (cursor toggle at $681A) |
| §6 | I/O hardware — lamps + RAMSEL (bit 3 / mask $04), sound regs, switches | main_loop §7 (RAMSEL for 2P), collisions §5 (sound on hit) |

### research_dvg.md

| §  | Topic | Cross-refs |
|----|-------|-----------|
| §2 | Memory model (CPU bytes ↔ DVG words) | hardware §2, vector_rom §2 |
| §3 | Coordinate system (1024×1024, Y-flip for canvas) | position_math §6 (full three-layer model: game ↔ DVG ↔ canvas) |
| §4 | Scale model (global + local, power-of-2) | vector_rom §3.6 (asteroid-size = LABS global scale) |
| §5 | Brightness (3 canvas options — alpha/width/bloom) | (port-side decision, no source cross-ref) |
| §6 | Opcode reference (all 7) | vector_rom §3.10 (JSR targets characters) |
| §10 | Interpreter pseudocode | vector_rom §5 (JSR transparently bridges into ROM) |

### research_position_math.md

| §  | Topic | Cross-refs |
|----|-------|-----------|
| §1 | Position arrays ($0269-$02F4) | RAMUse.md, main_loop §3 (asteroidUpdate iterates all 35 slots) |
| §2 | Velocity arrays ($0223-$0268) — signed 8-bit, ±63 magnitude | collisions §3 (dx/dy computation) |
| §3 | Canonical position update at $6FC7 — carry-propagation | main_loop §3 task #13 (asteroidUpdate) |
| §4 | Toroidal wrap (X mask, Y compare/branch) | collisions §4 (NOT wrap-aware) |
| §5 | Ship dual-precision velocity ($023E + $64) | main_loop §3 task #11 (shipSpawnPhys $703F) |
| §6 | **Three-layer coord model** (game-coord, DVG-coord, canvas-coord; conversion at `Ship.dvgPos()` and `toCanvasY`; shared-cursor pattern) | dvg §3 (1024×1024 DVG space), vector_rom §3.6 |
| §7 | **Port deviation: Float64 collapse** | (all subsequent position-related sites cite this) |

### research_main_loop.md

| §  | Topic | Cross-refs |
|----|-------|-----------|
| §1 | Cold path ($6803-$6809) | hardware §6 (sound reset $6EFA), §2 (memory init) |
| §2 | Frame loop top — sync, DVG kick, double-buffer | hardware §4, §5; dvg §9 |
| §3 | Task sequence (15 JSRs) | position_math §3 (asteroidUpdate), collisions §3 (collisions JSR), dvg §10 ($7C03 list-build helper / emitHalt) |
| §4 | delayBeforePlay gate | (governs which task-seq entries run) |
| §5 | Game state machine | (ship/saucer/timer/lives state transitions) |
| §6 | Wave progression ($6876-$6883) | position_math (asteroid count decrements on hit), collisions §5 (DEC curAsteroidCount) |
| §7 | Two-player RAMSEL | hardware §6 (the bit) |
| §9 | Port implementation spec | (combines all upstream specs) |

### research_collisions.md

| §  | Topic | Cross-refs |
|----|-------|-----------|
| §2 | Dispatch — outer X (shooter), inner Y (target) | position_math §1 (slot layout), main_loop §3 task #14 |
| §3 | Collision kernel at $6A0A — abs(dx/dy), radius lookup, BB+Manhattan tests | position_math §1, position_math §3 (16-bit position model) |
| §4 | Not wrap-aware | position_math §4 (wrap is per-axis; kernel doesn't honor it) |
| §5 | Resolution $6B0F — case split: ship/asteroid/saucer/shots | hardware §1 (BCD score add at $7397), main_loop §5 (state machine for explosion) |
| §6 | **Port deviation: clean Euclidean** | (cleaner than BB∩Manhattan; visually indistinguishable) |

### research_vector_rom.md

| §  | Topic | Cross-refs |
|----|-------|-----------|
| §1 | Overview — 2 KB ROM at $5000-$57FF | hardware §2 (memory map), dvg §2 (CPU/DVG addressing) |
| §3.4 | Ship explosion + velocity table | (used by ship-death animation) |
| §3.5 | Shrapnel patterns × 4 | collisions §5 (spawned on hit) |
| §3.6 | Rock patterns × 4 + size-by-scale | collisions §3 (size in status low 2 bits selects radius, NOT shape) |
| §3.8 | Ship-direction table (17 shapes + mirror trick) | main_loop §3 task #11 (shipSpawnPhys updates direction $61), position_math §5 (direction → thrust via $77D2/$77D5) |
| §5 | Port spec — keep ROM raw as Uint8Array | dvg §10 (interpreter handles JSR into ROM transparently) |

---

## Key port-side decisions (all collected here)

These are the deviations from byte-faithful porting, decided in
research:

| Decision | Where decided | Rationale |
|----------|---------------|-----------|
| Position math as Float64 (not 16-bit `{hi,lo}`) | position_math §7 | Drift acceptable; cleaner code; cite at affected JS sites |
| Collision test as clean Euclidean (not BB ∩ Manhattan) | collisions §6 | Visually indistinguishable; simpler code |
| Wrap-awareness in collision — match source (NOT wrap-aware) | collisions §4 | Faithful to original; minor visible quirk only at wrap edges |
| Sound deferred to R-G post-silent-game | progress.md (research plan) | Lower-priority for educational port |
| Vector glow rendering — alpha-mapped default, bloom optional | dvg §5 + progress.md | Cheapest faithful default; can upgrade later |
| DVG prototype not built during research | progress.md (decided 2026-05-22) | Architecture validated by framework reasoning; interpreter built proper in implementation phase |
| Ship-direction shapes — 64 pre-rendered or canvas-rotate (NOT 17 + mirror) | vector_rom §3.8 | JS isn't space-constrained; cleaner code |

---

## What's not in research (open / deferred)

These items will be addressed during the implementation phase by
reading source on-demand and cross-checking against Mikstas's
alternate disassembly where the upstream disasm has gaps:

- ~~**`$75EC`** — body in the un-disassembled ~20%~~ — **fully
  decoded 2026-05-24**; see [`research_collisions.md §5.1`](research_collisions.md).
  Calls `$6A9D` (split-copy) + `$7203` (velocity perturbation) to
  spawn 0-2 child asteroids; score table at `$7659` (2 bytes).
- ~~**`$77B5` advanceRNG body** — likely 8-bit LFSR~~ — **actually
  a 16-bit Galois LFSR** over `$5F:$60`, fully decoded; see
  [`research_main_loop.md §10`](research_main_loop.md).
- ~~**Collision kernel `$6A22-$6A25` "extract sign bit"**~~ —
  **misread; corrected 2026-05-24 (post-I-9h)**. The LSR/ROR/ASL
  sequence is a 16-bit unsigned right shift folding `|dx|` to
  `|dx|/2` before comparing to the radius table. Effective radii in
  raw sub-tile units are **2× the table** (84/144/264 sub-tile =
  10.5/18/33 DVG ≈ Rock1 visible extent). Resolves the deferred
  "collision feels tight vs cabinet" question. See
  [`research_collisions.md §3 step 2 + step 4 + §7`](research_collisions.md).
- ~~**Across-sweep shrapnel scale expansion**~~ — **decoded
  2026-05-24 during I-9e**. Source's `$6FA4-$6FA9 + $7321` LABS-
  emit cycles globalScale `$B → $0` across explosion stages,
  exploiting the same mod-16 wrap trick as asteroid sizing
  (14/15/0). The `$7324-$7339 $90` emit loop confirmed as no-op
  DVG padding per MAME's `avgdvg dvg_generate_vector_list`. See
  [`research_dvg.md §4` "Confirmed reappearance" + `§12`](research_dvg.md)
  and [`research_collisions.md §5.2`](research_collisions.md).
- ~~**DVG-list builders `$7C03`/`$7CDE`**~~ — **decoded 2026-05-25
  during I-11a** ([`research_hud_coords.md §1`](research_hud_coords.md)).
  `$7C03` emits 4-byte LABS from (A, X) register values × 4 with a
  scale byte from `ram.$00`; A → DVG-X, X → DVG-Y (CPU register
  names are OPPOSITE the DVG coordinate they drive). `$72FE`
  per-slot variant skips `$7C03`'s register-multiplication and adds
  `+$0400/8 = +128` to DVG-y for the playfield offset before jumping
  into `$7C03`'s emit tail at `$7C1C`.
- ~~**`$724F scoreLivesDraw`** + per-object draw emit sites~~ —
  **all per-object emit sites decoded 2026-05-25**. Player-1 score
  LABS at DVG (100, 876) gs=1 ([`research_hud_coords.md §4.1`](research_hud_coords.md));
  player-1 lives LABS at DVG (160, 852) gs=14
  ([`research_hud_coords.md §4.2`](research_hud_coords.md)).
  2-player branch + high-score display deferred to I-12. `$7555`
  was previously mislabeled here as `mainListBuild`; it is the
  per-frame sound-channel update (R-G).
- ~~**Ship-explosion fragment animator `$7465-$7508`**~~ —
  **decoded 2026-05-25 during I-11e** ([`research_ship_explosion.md`](research_ship_explosion.md)).
  Six fragment positions in zero-page RAM ($7D-$94); per-frame
  position += velocity from `SHIP_EXPLOSION_VELOCITY` table at
  `$50EC`; fragment count from `((~status) & $70) >> 4`. Port
  landed with 6 documented deviations to fit canvas without CRT
  phosphor emulation.
- ~~**Packed-string format at `$77F6 PrintPackedMsg`**~~ —
  **decoded 2026-05-25 during I-12a**
  ([`research_game_state_machine.md §7`](research_game_state_machine.md)).
  5-bit-per-char format, 3 chars in 2 bytes, low bit of byte 1 =
  terminator. 11 messages at offset table `$571E`. LABS coord
  table at `$7871`. Glyph dispatch reuses the `$56D2` Char_X
  cross-reference table (same one HUD digits use).
- **Saucer firing direction logic at `$6C54-$6CC4`** — saucer AI
  (decoded in I-10d, used by I-10/I-11; no standalone doc needed).
- **`$77D2`/`$77D5` sin/cos tables** — direction → thrust components
  (port uses `Math.cos`/`Math.sin` instead).
- **`$745A`/`$745C` asteroid-slot scanner** — visible in source but
  not decoded; port still uses `Array.find` placeholder. Future
  cleanup chip; not gameplay-affecting.
- ~~**`$6885 playerMgmt`** — game-over / attract-mode transition~~ —
  **decoded + ported 2026-05-25 during I-12a/d/e**
  ([`research_game_state_machine.md §3 + §5`](research_game_state_machine.md)).
  Temp lives-replenish stub in `Ship.kill` retired at I-12e
  via `$6960`'s body catching the `$80` marker frame.
- ~~**`$6E74` shipControl / hyperspace teleport** + `$7052-$7081`~~
  — **decoded + ported 2026-05-25 during I-13**. SWHYPER →
  vanish + random reappear with counter-intuitive fail-flag
  logic per `$6EB6-$6EC4`.
- ~~**`$73C4`**~~ — **decoded 2026-05-25 during I-12f**. Body
  draws the attract-mode HIGH SCORE table; corrects an earlier
  task_seq.js stub mislabel that called it the entry-input.
- **Sound subsystem** — full R-G doc deferred until silent game is
  validated (which is now — I-12 will start R-G work).

Reference for the gaps: Nicholas Mikstas's alternate disassembly at
<https://www.nicholasmikstas.com/games/>.

---

## How to use this index

- **Starting a new gameplay subsystem port?** Find the relevant
  research doc in Quick Navigation and read it end-to-end first.
- **Hunting a specific routine?** Search across research docs for the
  `$xxxx` address (every claim in the docs cites one) — the citation
  will lead to the right doc and §.
- **Modifying the docs?** Update the relevant entry in this index
  in the same commit if you changed sections, added new ones, or
  resolved an "Open" item.
- **Resuming work after a break?** Read `progress.md` first, then
  use this index to recover whatever subsystem context you need.
