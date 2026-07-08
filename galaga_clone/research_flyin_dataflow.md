# Fly-in data flow — from stage load to the fly-in flock

How the game turns a **stage number + difficulty rank** into the fly-in flock:
first the per-bug resolution (flight path + launch position), then how a whole
**wave** of bugs is assembled and played. This is the "follow the data" companion
to `research_stage_init.md` (table layouts) and `research_path_data.md` (the path
bytecode + motion interpreter).

- **Source:** `gg1-3.s` (tables + launcher), `gg1-5.s` (path blocks).
- **Port:** `paths.js` — tables + `buildWaveStream` (= `c_25A2`), `resolveWaveByte`
  + `getPathByIndex` (= `l_29D1` decode); `tasks/launchAttackWave.js` —
  `runFlyInWave` (= `f_2916`, the launcher).

## The pipeline

```
 stage index + rank index
        │   flat = rank * 17 + stage
        ▼
 D_COMBAT_STG_DAT_IDX[flat]  ──►  byte offset (a multiple of 18)
        │
        ▼
 D_COMBAT_STG_DAT  (18-byte group = 2 header + 5 triplets + 0xFF)
        │   triplet = [ transient-ctrl , member-0 path byte , member-1 path byte ]
        ▼
 path byte ── bits 0-5 ──►  PATH_INDEX[i] = { addr, variant }
        │                        │ addr                    │ variant (+ bit 6)
        │                        ▼                         ▼
        │                  PATH_BY_ADDR[addr]        VARIANTS[variant*2 + bit6]
        │                  = flight bytecode         = start { y, x, rotHi }
        └── bit 6 → member + negate-rotation · bit 7 → launch gate · bit 0 → bomb counter
```

## Step by step

### 1. Keys: stage index + rank index

The two inputs at stage start are the **stage index** and the **difficulty
rank** (0-3). Note the stage index is **0-based**: stage index `0` = stage 1,
stage index `1` = stage 2, and so on.

### 2. `D_COMBAT_STG_DAT_IDX` → caravan-row offset

The index table is 4 ranks × 17 entries, addressed directly as
`flat = rank * 17 + stage` (source: `gg1-3.s:1197`, `gg1-3.s:1437`). Each entry
is a **byte offset** into `D_COMBAT_STG_DAT`, always a multiple of 18.

### 3. `D_COMBAT_STG_DAT` → the 18-byte caravan group

The offset lands on one 18-byte group (`group index = offset / 18`). Its layout
is **not** six triplets — it is:

```
[0,1]     2-byte header  → byte0 = bomb-counter reload (b_92E2[0])
                           byte1 = fly-in bomb-enable bits (b_92E2[1]); 0 = no fly-in bombs
[2..16]   5 wave triplets (3 bytes each)
[17]      0xFF terminator
```

Each **triplet** is `[byte0, byte1, byte2]`:

```
byte0 = transient-attack control  (ignored by the clone)
byte1 = member 0's path byte       (the 1st bug of the pair, by launch order)
byte2 = member 1's path byte       (the 2nd bug of the pair)
```

So a triplet describes **two bugs** — one per path byte. The index / gate /
bomb-counter / member selection are all bit-fields packed **inside a single
path byte**, not three separate bytes of the triplet.

### 4. Path byte bit layout (`gg1-3.s:1450-1458`)

```
bits 0-5  index into PATH_INDEX (db_2A3C)
bit 6     pair-member selector AND negate-rotation flag
          → picks VARIANTS[variant*2 + 0] (clear) or [variant*2 + 1] (set);
            when set, the path's per-segment rotation is negated (mirrored arc)
bit 7     launch gate: CLEAR → wait for frame_cnt & 0x07 == 0 (paced to the
          8-frame beat); SET → launch immediately (wing-man)
bit 0     OVERLOADED — also the low bit of the 0-5 index; read again as the
          bomb-counter init: 0 → 0x08 (top entrant), 1 → 0x44 (side entrant)
```

### 5. `PATH_INDEX[i]` → `{ addr, variant }`

Bits 0-5 index `PATH_INDEX` (`db_2A3C`, `gg1-3.s:1918`). Each entry packs a path
**address** and a **variant** (0-7).

### 6a. `addr` → `PATH_BY_ADDR[addr]` → the flight bytecode

The `addr` keys `PATH_BY_ADDR`, giving the path block (`db_flv_*`,
`gg1-5.s:82+`) — the sequence of 3-byte motion segments and tokens the bug flies.

### 6b. `variant` + bit 6 → `VARIANTS[...]` → start position

The `VARIANTS` entry is `variant * 2 + (bit6 ? 1 : 0)` (`db_2A6C`,
`gg1-3.s:1928`). It supplies the launch `{ y, x, rotHi }` — initial position and
rotation high byte.

> **Coordinate caveat.** `VARIANTS` `y`/`x` are **internal** coordinates, not
> canvas pixels. The renderer **inverts Y** (`canvas_Y ≈ ~(y + 0x4F) & 0xFF`, the
> `cpl` at `gg1-5.s:2314`), so internal Y is **up-positive**: a *larger* `y` sits
> *higher* on screen. `y = 0x9B → canvas_Y ≈ 11` (top); `y = 0x23 → canvas_Y ≈
> 251` (bottom). X is left-positive (`canvas_X = x*2 − 9`).

---

## Worked example — rank 2, stage index 1

**1. Index table lookup.** `flat = 2 * 17 + 1 = 35`, so `D_COMBAT_STG_DAT_IDX[35]
= 0x12`. (Stage index 1 yields `0x12` for *every* rank, so this is the stage-2
caravan regardless of difficulty.)

**2. Caravan group.** `0x12 = 18`, so `group index = 18 / 18 = 1`. Group 1 is:

```
0x14,0x01,  0x00,0x42,0x02+0x80,  0x00,0x03,0x05+0x80,  0x00,0x43,0x45+0x80,
            0x00,0x42,0x44+0x80,  0x00,0x02,0x04+0x80,  0xFF
```

**3. Header.** `0x14, 0x01` → bomb-counter reload `0x14`, fly-in bomb-enable
`0x01` (non-zero → stage 2+ fly-in bugs can drop bombs).

**4. First triplet:** `0x00, 0x42, 0x02+0x80` (= `0x00, 0x42, 0x82`).

| | byte0 `0x00` | byte1 `0x42` (member 0) | byte2 `0x82` (member 1) |
|---|---|---|---|
| role | transient-ctrl (ignored) | path byte, 1st bug | path byte, 2nd bug |
| index = bits 0-5 | — | `0x42 & 0x3F` = **2** | `0x82 & 0x3F` = **2** |
| `PATH_INDEX[2]` | — | `{ 0x009F, variant 2 }` | `{ 0x009F, variant 2 }` |
| path (`PATH_BY_ADDR`) | — | **`path_009F`** | **`path_009F`** |
| bit 6 → variant | — | 1 → `VARIANTS[5]`, **negate ON** | 0 → `VARIANTS[4]`, no negate |
| start `{y,x,rotHi}` | — | `{0x9B, 0x4C, 0x03}` (top, mid-right) | `{0x9B, 0x2C, 0x03}` (top, mid-left) |
| bit 7 → gate | — | 0 → delayed (8-frame beat) | 1 → immediate (wing-man) |
| bit 0 → bomb | — | 0 → `0x08` (top entrant) | 0 → `0x08` (top entrant) |

So group 1's first pair both fly **`path_009F`** (index 2), entering from the top
— member 0 mid-right with mirrored rotation, member 1 mid-left — with member 1
launching one frame behind member 0.

---

## Scaling up: from one bug to a wave (the runtime stream)

The pipeline above resolves **one** bug. A wave is 4+ such bugs; two more tables
and two functions turn a caravan group into the actual spawn sequence.

| What | Where | Role |
|---|---|---|
| `ATTK_WAV_IDS` | `paths.js` (`db_attk_wav_IDs`, gg1-3.s:1489) | **Who** — 5 waves × 8 formation-slot IDs |
| `SPRT_FMTN_HPOS` | `paths.js` (`sprt_fmtn_hpos`, gg1-5.s:185) | Each ID → its **home slot** (row/col) it homes to |
| `buildWaveStream` | `paths.js` (`c_25A2`, gg1-3.s:1168) | Builds the spawn **stream** |
| `runFlyInWave` | `tasks/launchAttackWave.js` (`f_2916`, gg1-3.s:1658) | **Plays** the stream, launching bugs |

### The runtime stream (`buildWaveStream` = `c_25A2`)

For each of the 5 waves the builder emits a `0x7E` marker, then a run of 4-byte
pair records; the whole stream ends with `0x7F`:

```
0x7E,                                 ; wave-start marker
byte1, ID_lefty,  byte2, ID_righty,   ; pair 1  (member 0 / member 1)
byte1, ID_lefty,  byte2, ID_righty,   ; pair 2
... (4 pairs when there are no transients) ...
0x7E, ...                             ; next wave
0x7F                                  ; end-of-fly-in marker
```

- `byte1`/`byte2` are the wave's **shared** path bytes (from that wave's triplet).
  So *every* lefty in the wave flies the identical member-0 path/variant and
  *every* righty the identical mirrored member-1 path — they differ only in
  **ID → home slot**.
- Each 4-byte record is two `[path byte, ID]` pairs. The `path byte` drives the
  per-bug pipeline above; the `ID` selects the destination formation slot via
  `SPRT_FMTN_HPOS` (where the bug homes when its path hits `FB` TURN_HOME).

### The `tmp[16]` pairing buffer

Each wave is assembled in a 16-slot buffer — **two halves of 8**: lefty = `0-7`,
righty = `8-15`. Slot `i` pairs with slot `i+8` to make one emitted duo
(`[byte1, tmp[i], byte2, tmp[i+8]]`).

Only **4** formation members are needed per half; the buffer is 8-wide to leave
**headroom for transients**. Two fill passes:

1. **Transients first** — `byte0 & 0x0F` of them, scattered into each half's low
   range. Their IDs are *computed* (the `0x38` pattern), not from `ATTK_WAV_IDS`.
2. **Formation IDs next** — the 8 from `ATTK_WAV_IDS` backfill the first 4 free
   slots per half. With no transients: exactly slots `0-3` and `8-11`.

Emission walks `i = 0…` and stops at the first empty (`0xFF`) lefty slot:

- **No transients** → `0-3`/`8-11` filled → 4 pairs; slots `4-7`/`12-15` stay
  `0xFF`, never emitted. (True for stages 1-3 and all challenge stages —
  byte-identical to a plain 4-pairs-from-`ATTK_WAV_IDS` builder.)
- **With transients** → the filled run extends into `4-7`/`12-15` → more than
  4 pairs.

So slots `4-7`/`12-15` aren't separately constructed — they're the **overflow
region** of the same fill logic, used only when `byte0` requests transients.

### Transient deployment

A transient bug has two parts: an **ID byte** (computed) and a **path byte**
(inherited from the wave). Nothing about a transient is truly random except
*which slot* it lands in.

**ID byte** — placement loop `l_2612` ([paths.js:1176](paths.js)):

```
ID = (b << 1) | 0x38 | (typeBit ? 0x40 : 0)
```

- **`b << 1`** — `b` counts *down* from `count = byte0 & 0x0F` to 1; `b*2` gives
  an even base value.
- **`| 0x38`** — the transient **marker** (bits 3,4,5). No formation fly-in ID
  carries this pattern, so it uniquely tags a transient.
- **`| 0x40`** — the creature **type** (red moth / yellow bee), pulled from
  `byte0`'s bits MSB-first (rotated `RLC` each iteration). So `byte0` does double
  duty: low nibble = *how many*, high bits = *what type* each one is.

**ID range.** `(b<<1)|0x38` only ever yields `{0x38, 0x3A, 0x3C, 0x3E}`; with the
type bit, `{0x78, 0x7A, 0x7C, 0x7E}`. The first four are exactly the
butterfly-corner **"bonus-bee" slots** (`0x30-0x3E = boss + bonus-bee`) that
`ATTK_WAV_IDS` deliberately omits — so transients reuse that free range. The
`0x78-0x7E` variants sit *beyond* the 48 formation IDs (`0x00-0x5E`) entirely.
(Boss row 0's `0x00-0x06`, also absent from `ATTK_WAV_IDS`, are **not** transient
IDs — a transient always carries the `0x38` marker.)

**Slot placement.** Each transient drops into a random free slot: `slot = rng % E`
with `E = (count>>1)+4`, `+8` when `b` is odd (odd → righty half), re-rolled on
collision. That slot is the *only* thing that decides its path byte (next).

**Path byte — inherited, not computed.** A transient gets no path byte of its own.
At emission every filled slot is paired with the wave's shared bytes — `byte1` for
a lefty slot (`0-7`), `byte2` for a righty slot (`8-15`) — transient or formation
alike (gg1-3.s:1356: *"B and C … select the bug motion depending whether he is a
'lefty' or a 'righty'"*). So a transient flies the **same path block** as that
wave's formation bugs; it just entered at a different slot.

**Why it diverges — the `0x38` marker meets `F7`.** The shared path carries an
`F7` (ATTACK_TURN) token that tests `(obj_id & 0x38) == 0x38`. A transient always
matches → `F7` jumps it onto the **swoop-and-leave sub-path** (`path_*.subPaths`,
ending in `FF` off-screen). A formation bug never matches → `F7` is skipped and it
continues to `FB` TURN_HOME. So the whole feature: `byte0` says how many + what
type, the ID gets the `0x38` tag, the path byte is borrowed by half, and the
path's own `F7` gate routes transient vs. joiner. Full decode:
`research_transients.md`.

### Bonus-bee ("clone-attack") — a separate feature

Easy to confuse with a transient, but **not part of this fly-in stream.** A
bonus-bee is **not pre-set in the formation**: late in a **stage-4+** round (once
the active-bug count drops below the per-stage threshold), the manager `f_1A80`
plucks a *resting formation bee*, flashes it (~1 s), repaints it to a bonus sprite
(the scorpion / `0x5x` groups), and launches it as the leader of a 3-bug **"X3"
convoy** dive — so it's promoted *out of* the formation at runtime, not deployed
into it. Full spec: **`research_bonus_bee.md`**.

### Playback (`runFlyInWave` = `f_2916`)

Runs once per frame, advancing a cursor through the stream, doing **at most one
action per frame**:

- **`0x7E`** (wave-start): release the next wave only when `bugs_flying == 0` —
  i.e. wait until the **previous** wave has fully reached formation. Advances the
  cursor +1 when it fires.
- **`0x7F`** (end-of-fly-in — *not* end of stage): wait for the last wave to
  land, then **disable the launcher and hand off to the attack phase**
  (`l_2A29`, gg1-3.s:1899, enables `f_1B65` bomber-attack + `f_1A80` bonus-bee).
  Dives begin here; the stage ends only when all enemies are destroyed.
- **pair record** (2 bytes): launch one bug — read `[path byte, ID]`, run the
  per-bug resolve (`l_29D1`), advance the cursor +2.

The launch **gate** (path byte bit 7) makes "one action per frame" a *maximum*:
a gated launch returns without advancing on frames where `frame & 7 != 0`, and a
`0x7E` returns without advancing while bugs are still flying — so many frames are
deliberate waits.

The gate is evaluated **per byte, not per pair** — each path byte carries its own
bit 7. Consecutive **gated** bytes launch 8 frames apart (each waits for the next
`frame & 7 == 0` beat); an **ungated** byte (bit 7 set) launches the very next
frame after the gated one before it. So a pair's spacing depends on its two bytes:
a gated leader + ungated wing-man enter one frame apart (a tight duo), whereas two
gated members enter 8 frames apart.

---

## Path-data construction — three block types

Path blocks aren't all built the same way — it depends on whether a block
cross-references other bytecode, and how:

- **Type 1 — plain array.** A self-contained `Uint8Array` of 3-byte segments
  ending in END (`0xFF`); no branch tokens. The bug runs it start to finish.
- **Type 2 — array + `.subPaths` map.** Carries `F7`/`F0` branch tokens whose
  2-byte targets are *separate* small arrays, hung off a `.subPaths` map keyed by
  Z80 address. (The targets are interleaved in ROM with non-path data, so they
  can't be one contiguous array — `bugMotion.js` looks them up by address.)
- **Type 3 — region array + `.z80Base`.** A whole contiguous ROM region as one
  flat array with sub-paths inline; internal `FD`/`FA`/`EF`/`F2` jumps resolve by
  `offset = addr − z80Base`. May add `.entryOffset` for multiple entry points.

**The 24 fly-in paths use only Types 1 & 2.** Type 3 is the dive/attack family,
which loads *outside* `PATH_INDEX` (via `getAttackPath` / `getConvoyPath`).

### The 24 `PATH_INDEX` entries (`db_2A3C`)

| # | Z80 addr | JS name | Type | Note |
|---|---|---|---|---|
| 0 | `0x001D` | `path_001D` | **2 — `.subPaths`** | F7→`004B`, F0→`005E` |
| 1 | `0x0067` | `path_0067` | **2 — `.subPaths`** | F7→`0084`, F0→`0097` |
| 2 | `0x009F` | `path_009F` | **2 — `.subPaths`** | F7→`00B6`, F0→`00CC` |
| 3 | `0x00D4` | `path_00D4` | **2 — `.subPaths`** | F7→`0160`, F0→`0173` |
| 4 | `0x017B` | `path_017B` | **2 — `.subPaths`** | F7→`0192`, F0→`01A8` |
| 5 | `0x01B0` | `path_01B0` | **2 — `.subPaths`** | F7→`01CA`, F0→`01E0` |
| 6 | `0x01E8` | `path_01E8` | 1 — plain | token-free |
| 7 | `0x01F5` | `path_01F5` | 1 — plain | token-free |
| 8 | `0x020B` | `path_020B` | 1 — plain | token-free |
| 9 | `0x021B` | `path_021B` | 1 — plain | token-free |
| 10 | `0x022B` | `path_022B` | 1 — plain | token-free (variant 4) |
| 11 | `0x0241` | `path_0241` | 1 — plain | token-free |
| 12 | `0x025D` | `path_025D` | 1 — plain | token-free (variant 4) |
| 13 | `0x0279` | `path_0279` | 1 — plain | token-free (longest, ~12 seg) |
| 14 | `0x029E` | `path_029E` | 1 — plain | token-free |
| 15 | `0x02BA` | `path_02BA` | 1 — plain | token-free |
| 16 | `0x02D9` | `path_02D9` | 1 — plain | token-free |
| 17 | `0x02FB` | `path_02FB` | 1 — plain | token-free |
| 18 | `0x031D` | `path_031D` | 1 — plain | token-free (short) |
| 19 | `0x0333` | `path_0333` | 1 — plain | token-free |
| 20 | `0x0FDA` | `path_0FDA` | 1 — plain | challenge-stage |
| 21 | `0x0FF0` | `path_0FF0` | 1 — plain | challenge-stage (shortest) |
| 22 | `0x022B` | `path_022B` | 1 — plain | **alias of #10**, variant 5 |
| 23 | `0x025D` | `path_025D` | 1 — plain | **alias of #12**, variant 5 |

**Counts:** 24 entries → 22 unique blocks (#22 & #23 reuse #10 & #12). Of the 22:
**6 are Type 2** (`.subPaths`, the low addresses `0x001D–0x01B0` that carry the
F7/F0 branches) and **16 are Type 1** (plain, everything from `0x01E8` up).

### Type 3 — not in the 24 (attack / boss / convoy)

| Z80 base | JS name | Type | Loaded via |
|---|---|---|---|
| `0x34F` | `ATTACK_PATH_YELLOW` | **3 — `.z80Base`** | `getAttackPath('yellow')` |
| `0x3A9` | `ATTACK_PATH_RED` | **3 — `.z80Base`** | `getAttackPath('red')` |
| `0x40C` | `ATTACK_PATH_BOSS` | **3 — `.z80Base` + `.entryOffset`** | `getAttackPath('boss')` |
| `0x0473` | `CONVOY_REGION` | **3 — `.z80Base` + `.entryOffset`** | `getConvoyPath(color)` |

If a path is reached through `PATH_INDEX`, it's a plain array or a `.subPaths`
array — never a `.z80Base` region.

> **⏳ TODO — Type-3 attack-path interpretation (deferred, discuss later).** How
> the dive/attack paths — `ATTACK_PATH_YELLOW` / `ATTACK_PATH_RED` /
> `ATTACK_PATH_BOSS` (and `CONVOY_REGION`) — are interpreted isn't walked through
> here yet: the `z80Base` offset math for the inline `FD`/`FA`/`EF`/`F2` jumps, the
> `.entryOffset` entry points, and the embedded (not `.subPaths`) sub-paths. To be
> added later. Deep specs: `research_attack_paths.md` (yellow/red),
> `research_boss_capture.md` (boss), `research_bonus_bee.md` (convoy).

### Type 2 in action — `path_001D`

The cleanest Type-2 example: one block carrying **both** branch tokens (`F7` and
`F0`), so it encodes three trajectories. Decoded (`db_flv_001d`, gg1-5.s:82):

```
off  bytes        meaning
 0   23 06 16     segment A   vx3 vy2, rot +6,  dur 22
 3   23 00 19     segment B   vx3 vy2, rot  0,  dur 25
 6   F7 4B 00     token F7 → sub-path 0x004B  (transient gate)
 9   23 F0 02     segment C   vx3 vy2, rot −16, dur 2
12   F0 5E 00     token F0 → sub-path 0x005E  (stage-8+ gate)
15   23 F0 24     segment D   vx3 vy2, rot −16, dur 36
18   FB           TURN_HOME → leave the interpreter, fly to formation slot
19   23 00 FF FF  home tail / END
```

```js
path_001D.subPaths = { 0x004B: path_004B, 0x005E: path_005E };
```

**Taking a sub-path.** When the interpreter hits `F7`/`F0` and the gate is *true*,
it jumps — pointer-replace, no return ([bugMotion.js:658](tasks/bugMotion.js) / `:632`):

```js
const target = (hi << 8) | lo;              // embedded 2-byte address
e.pathBase   = e.pathBase.subPaths[target]; // map lookup (NOT z80Base offset math)
e.pathOffset = 0;                           // run the sub-path from its start
```

If the gate is *false*, it does `pathOffset += 3` (skip token + address) and
continues. Gates: `F7` = `(objectId & 0x38)==0x38` (transient); `F0` =
`newStageParms[8] != 0` (stage 8+).

**The three routes** — a bug runs exactly one, whichever fires first:

| Bug / stage | Trace | Ends |
|---|---|---|
| Normal, stage 1-7 | A, B, F7 skip, C, F0 skip, D, **FB** | homes |
| Transient (any stage) | A, B, **F7 → `path_004B`** → segs → `FE` (target player) → **FF** | despawns |
| Formation, stage 8+ | A, B, F7 skip, C, **F0 → `path_005E`** → seg → **FB** | homes |

- **`path_004B`** (`p_flv_004b`): two segments → `FE` player-targeting turn → a
  segment → `FF` despawn. The transient swoops and leaves; it never reaches `F0`/`FB`.
- **`path_005E`** (`p_flv_005e`): one steep segment → `FB` home. The stage-8+ bug
  takes a sharper final approach and homes via *this* FB, never reaching segment D.

Because each taken jump **replaces** the path pointer, the rest of `path_001D`
after that token is never executed — one block, three mutually-exclusive routes.

---

## Watch-outs (subtleties that are easy to miss)

- **Stage index is 0-based.** Stage index `1` is **stage 2**, not stage 1
  (`D_COMBAT_STG_DAT_IDX` entry 0 = stage 1).
- **A triplet is not "index, gate, bomb."** It is `[transient-ctrl, member-0
  path byte, member-1 path byte]`. Those three fields live *inside* one
  path byte, one per bug.
- **Positional member ≠ variant member.** `byte1`/`byte2` fix the *launch order*
  (1st/2nd bug). Which VARIANTS entry each one uses — and whether its rotation is
  negated — is chosen by **that byte's own bit 6**, independently. They don't
  have to line up: e.g. stage-1 group 0's first triplet has member 0 → variant 0
  (no negate) and member 1 → variant 1 (negate); stage-2 group 1's first triplet
  has them **swapped** (member 0 negated, member 1 not).
- **Bit 0 is shared, not duplicated.** It is the low bit of the 0-5 path index
  *and* the bomb-counter selector; the table is built so index parity matches
  top-vs-side entry (see `research_path_data.md` / `paths.js` VARIANTS notes).
- **`0x7F` is end of *fly-in*, not end of stage.** It hands off to the attack
  phase (`f_1B65` — dives start); the stage ends only when all enemies die.
- **`0x7E` waits on the *previous* wave.** It releases the next wave only once
  `bugs_flying == 0` (the prior wave has fully homed).
- **`tmp[16]` is two halves of 8, not 4.** Lefty `0-7` / righty `8-15`, slot `i`
  pairs with `i+8`. Only `0-3`/`8-11` are used without transients; `4-7`/`12-15`
  are transient overflow.
- **`ATTK_WAV_IDS` lists 40 of the 48 formation IDs.** The 8 gaps split evenly:
  boss row 0 (`0x00-0x06`) — never flown in, *not* transient — and the butterfly
  corners (`0x38-0x3E`) — the bonus-bee/transient ID range. Transients reuse the
  second group; the `0x78-0x7E` transient variants fall outside the 48 entirely.
