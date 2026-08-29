# Porting decisions

Why this port is shaped the way it is.

`docs/design_spec.md` is the authority for *what to build* and is self-contained.
This document is the authority for *why we build it that way* — it is the only
place that compares our design against the research it came from, and the only
place permitted to talk about the original machine.

**Research input:** <https://github.com/ZaneLogi/DisassemblySeafox> — a complete
disassembly of the 1982 Apple II release, with a proposed port architecture.
Its findings about the original are evidence. Its proposals are input, not
instructions: it optimises for "not an Apple II" and stops there, without a
target platform in view. Everything below is our call.

## The governing test

**Faithful to what the player can observe; free with everything that exists
because of the hardware.** The original spends most of its code working around a
1 MHz CPU and a bit-packed framebuffer. None of that is gameplay.

The goal is that the game *plays* correctly and *looks* like itself, using its
own assets. It is not to reproduce the machine.

## Architecture

Routine-level translation: behaviour ports as functions, data tables port
verbatim, and the core is deterministic, integer-only and steppable with no
renderer and no browser attached.

The core owns the entity array, the type tables, the RNG, the spawners,
collision, the session state machine, the sound queue and the stencil buffer
(§ Collision). It does not own the colour buffer, the canvas, the audio device
or the clock.

Target: ES6 modules, no build step, matching the rest of this repository.

## The six decisions

### 1. Fixed tick rate

The simulation advances at a fixed rate. Every "N frames" quantity in the design
is a tick count and acquires its wall-clock meaning here.

The original varies its own rate with the live entity count, which makes it run
faster with three entities on screen than with one. That is a property of a
1 MHz budget, not a design intent, and reproducing it would make the game's pace
depend on how much is happening.

### 2. One byte per pixel, indexed colour

The framebuffer is 280 × 192 bytes of palette index. Colour is resolved into the
sprite assets when they are baked, not computed while drawing.

On the original, a pixel's hue is an artifact of the column it lands in and a
palette bit shared by its seven neighbours, and the game steers both to keep
each object a stable colour. We take the outcome and skip the mechanism: each
sprite is baked at the parity and palette its spawner actually gives it, so
objects arrive already the right colour.

Consequences we accept:

- Two objects whose pixels land adjacent no longer merge to white.
- Column parity is cosmetic for entities. It stays load-bearing for the merchant
  roster, whose per-record flag byte selects both the spawn column and the
  palette — that is what pins the ten targets to four distinct hues, so those
  bake as ten coloured variants.
- The depth charge takes a single odd step at the end of its arc, so its parity
  changes during its life — and it still bakes as one variant per sprite,
  because the arc bitmap is a solid pair that renders white either way and the
  sinking bitmap is only drawn after the step. The odd step fixes the sinking
  form's hue rather than changing the arc's.
- Exactly one object's colour cannot be baked: the death-burst debris, whose
  parity nothing fixes. Both parities ship and the draw picks on the particle's
  current X. It is the only draw-time colour decision in the port.

### 3. Collision reads a stencil, not the picture

Two buffers, both 280 × 192, one byte per pixel:

| buffer | contents | owner |
|---|---|---|
| `color` | palette index | presentation |
| `stencil` | 0 empty, 1..32 entity slot + 1 | **core** |

`stencil` is written from each sprite's **ink mask**; `color` from its
**blended colour bitmap**. The two footprints differ — an isolated coloured
pixel occupies a two-pixel chroma cell, so the colour image can extend one pixel
to the **right** of the ink, never to the left. Collision uses the ink; the
screen uses the colour.

Collision is three parts:

1. **Broad phase** — a rectangle overlap against every other live entity.
2. **Box test** — extents from the sprite header, inclusive on both axes.
3. **Confirm** — a read-only scan of the subject's own footprint:

   ```
   confirm = ∃ p ∈ subject footprint : ink[p] ∧ stencil[p] ∉ {0, subjectSlot}
   ```

The confirm does not depend on which candidate is being tested, so it is
computed once per subject per tick and cached; the sweep then does box tests
only. This is not a simplification imposed on the design — it is what the
original computes, because its own confirm measures the whole subject sprite
against the whole screen.

**The stencil is maintained incrementally**, during the entity walk: when an
entity's handler runs, its old footprint is cleared and its new one written.
Rebuilding the whole stencil at the top of a tick would place entities later in
the walk at their new positions when earlier ones test against them, shifting
contact by up to a step per entity.

Identity in the buffer is what removes the need for the original's
erase-and-redraw sequence, which exists only because a one-bit framebuffer can
report that a pixel is lit but not what lit it.

**The waterline is not in the stencil.** It is a decoration that shares memory
with the objects on the original and can therefore register as contact there.
ID 255 is reserved for scenery should that ever need to come back.

### 4. Audio: a simulated speaker

The core owns the sound queue and hands out exactly one `(pitch, duration)` pair
per tick. Queue discipline is preserved: append-only, never pre-empting, so a
sound that arrives during a long one waits its turn and the audio lags the
picture under load.

Presentation schedules **one band-limited square burst per pair**, on a cursor
that advances by exactly one tick, behind a two-method backend interface
(`burst(pitch, duration, atTime)` / `stopAll()`). Nothing blocks the simulation:
scheduling is all the tick does, and the work happens on the audio thread.

**Not the one-bit cone, and the reasoning is the governing test.** § 18.9
describes holding a cone state and toggling it every `5 × pitch + 24` cycles,
and § 18.10 makes the synthesis path free. What a player can observe is pitch,
rhythm, the burst-and-gap texture and the queue's lag — all four survive a
band-limited square, and the physical cone low-passes the hard edges away in any
case. The flip-flop is the device, not the mechanism.

What the 1-bit path would add is the edge transients and the aliasing above the
cone corner. That is audible only if the grit is judged to *be* the sound, so the
backend is a seam rather than a decision: an `AudioWorklet` implementing the same
two methods swaps in without touching the queue, the tick clock or any core code.

A gentle one-pole low-pass models the physical cone — an `IIRFilterNode` carrying
the actual one-pole difference equation rather than a two-pole biquad, so it
matches the reference renderer the sequences were auditioned against. Tunable,
default on at 6 kHz.

Bursts are gated by starting and stopping the oscillator rather than by a gain
envelope. The hardware's own transient is a step — the cone begins moving — so
the click is authentic and the low-pass is what softens it; an envelope would be
shaping something the device does not shape. Scheduling runs two ticks ahead of
`currentTime` because ticks arrive on a rAF loop that jitters and can stall, and
audio placed at the moment its tick arrives would inherit that jitter as audible
unevenness.

**Why this differs from the original in one respect.** The original's player
blocked: it played a pair to completion inside the frame, so its audio *was*
frame time and a long burst simply made the frame longer. Ours cannot stretch a
tick, so it schedules instead. § 18.9 requires that change, and requires § 18.4's
lag to survive it — it does, because the lag lives in the queue rather than in
playback.

**That non-blocking choice is what puts a ceiling on the tick rate: 51.5 ticks
per second.** A burst is timed in CPU cycles, so raising the rate shortens the
silence after a burst but never the burst itself. Above the ceiling a burst
outlasts its tick and the next pair sounds on top of it — two voices at once,
which one bit and one speaker cannot produce. Sequence 17, the launch tone
(`15,200`, 19.4 ms), sets it at 1000/19.4; it is nearly double the next longest,
and sequence 3 (`100,20`, 10.3 ms) does not follow until 97 Hz. At the chosen 30
ticks/s the longest burst fills 58% of a tick, so there is close to 2× headroom
and nothing else comes near.

Raising the rate past 51.5 would need a monophonic guard in the backend: stop the
sounding burst when the next one begins. That is arguably the more faithful
model in any case, since a single cone does not fall silent and restart — it
begins toggling at the new rate. It is a no-op at 30 ticks/s, which is why it is
not there.

### 5. Presentation: Canvas2D first

`color` reaches the screen through a palette lookup and `putImageData`. The
WebGL indexed path is a later optimisation and needs no change to either buffer:
`color` is already the texture it wants, and `stencil` is core state that never
touches presentation.

### 6. Sprite assets carry their original byte width

Each sprite exports as `{w, h, byteWidth, rows, minX, minY, ink, color}`.

Blocks in the original reserve at least six blank right columns as working
space, and the box test sizes itself to the ink by deriving the extent from the
**byte** width rather than the pixel width. We strip the padding, so boxes must
still be computed from the stored `byteWidth` and `rows` — recomputing them from
the stripped bitmap yields tighter hitboxes and a game that feels stingier than
it should in a way that is hard to attribute.

Stripping is not free in the other direction either. Nine of the sixty-nine
blocks are blank down their left edge or across their top row, and an object's
position is its **block's** top-left, not its ink's — so the crop offset is kept
on the asset as `minX`/`minY` and put back by everything that places a bitmap:
the stencil write, the confirm, and the renderer. Dropping it slides those nine
one or two pixels up or left of where the game puts them, in the picture and in
the collision footprint alike, and the five mission numerals are the ones that
show: they sit at a fixed X beside the word `MISSION`.

### 7. Input: a gamepad takes the analogue stick's place

The original's two schemes converge on one two-byte interface — an X velocity and a Y
velocity, each one of three values. Adding a gamepad adds a writer to that pair and
changes nothing else.

It is the **analogue scheme**, not a third one. The original's analogue read sorts each
axis into three buckets and throws the magnitude away, so a stick with a deadzone
reproduces it exactly. The bucketing lives in `platform/`; `core/` sees only the three
values, which is what keeps it integer-only.

The two control models differ in feel and both are kept:

- **Keyboard is latched.** A direction persists until another direction replaces it,
  which is why the layout carries a dedicated stop key.
- **Analogue is hold-to-move.** Axes are written every tick, zero included, so releasing
  to centre stops the sub. A gamepad inherits this and has no use for a stop key.

**The scheme is locked by how the game is started** and never changes for the session:
the start key selects keyboard, a fire button selects gamepad. This also suits the
browser, where a gamepad is not visible until the player presses something on it.

**Buttons keep the original assignment** — primary face button fires the horizontal
torpedo, secondary fires the vertical. It reads backwards to a modern player; it is one
line to swap if it proves annoying in play.

**Axis inversion is not carried over.** It exists in the original because 1982 analogue
sticks had no wiring convention and the game could not know which way a given stick was
wired. Standard gamepad mapping fixes the axis senses, so pushing up moves the sub up
with no configuration. Inverted-Y as a *player preference* is a different feature and
would be built as one.

**Key bindings are fixed.** The original ships a live rebinding screen; we ship the
default layout. The binding table stays a table, so adding an editor later is additive.

## Kept exactly

These are observable, and changing any of them changes the game.

- 32 slots, dense array, swap-with-last. Walk order decides collision resolution
  order and slot reuse.
- Two-phase removal: request, then confirm. Collapsing it leaks the population
  caps, because only a type's own handler decrements its class counter.
- Class counters, separate from the live entity count.
- The per-entity update-rate divider. Speed is *step ÷ divider*, never *step*.
- The RNG, bit-exact. Every spawn interval, depth, variant and the demo's
  auto-fire descends from it.
- BCD scoring semantics.
- The type byte resolving into two static tables — behaviour in one, data in the
  other.
- Tick order: spawners run before the entity walk, so an entity created this
  tick is walked and drawn on the same tick.
- One engine, not two. The attract demo is the same loop with the mission
  counter at zero and seven rules suspended.
- The shared supply-chain state: the escort and the clam derive position from
  the payload every tick.
- The six vestigial entity types keep their slots.

## Dropped as hardware

Pre-shifted sprite slots and the shift generator. The coordinate lookup tables.
Sentinel-based clipping. Per-page blit records and the dirty bit. The
screen-pixel pre-filter ahead of collision, which buys rejection and nothing
else. The frame governor. The blocking speaker player. The per-byte palette bit.

## Behaviour changes, deliberate

Each of these is a place where the port and the original differ in something a
player could in principle notice.

| change | reason |
|---|---|
| pace no longer varies with entity count | § 1 |
| adjacent objects do not merge to white | § 2 |
| the waterline cannot confirm a hit | § 3 |
| an object under another no longer keeps a hole punched in it until redrawn | the hole is an artifact of erasing to test |

### The round-start holds

The launch sequence and the fly-in each pause with nothing moving. The original produces
that pause as a counted busy-wait — three nested loops of a fixed count — so its duration
is a consequence of processor speed rather than a number anyone chose, and it is the only
visible duration in the game that no table determines.

We specify **33 ticks**, which reproduces it at the default rate. An implementation may
tune it without breaking anything else.

### Where the spare-submarine rack starts

§ 19.9.3 gave the 30-pixel step between icons but not the X the first one sits at, and
the rack is only on screen for two holds, so it is not recoverable by watching.

`$6BBB` loads `#$54` into the player block's own X field before the icon loop, and the
loop adds `#$1E` per icon. World X 84 is screen 56 — byte column 8, the column the fuel
gauge occupies in the next HUD state. The spec now states the 56.

### The HUD erase bar

Chapter 19 describes a HUD state change as drawing a blank bar over screen
columns 0–174 — sized to stop exactly where `SCORE` begins, so the score
survives every transition without being redrawn.

That is incremental repair of a framebuffer nobody clears. Our renderer rebuilds
`color` from state every tick, so the question the bar answers — what is still
on the line from the last state? — cannot arise, and a state change is simply a
different set of fields being drawn. The bar's artwork is still extracted, since
it is a real strip on the disk; nothing draws it.

The observable half is preserved exactly: `SCORE` and its six digits appear in
all three states, and the three left-hand displays replace one another.

### The chroma cell is clipped to the ink, not rounded rightward

A colour cell on this hardware is **two dots wide and straddles its dot**, so no integer
grid holds it and the bake has to round it somewhere. § 6.3.1 rounds it *inward*: an
isolated pixel colours the column to its right only when a lit pixel lies further right
on the same row. Three rules were on the table, and each is a different way to be wrong:

| rule | `#.#` renders | rendered box vs the bitmap | isolated pixel alone on its row |
|---|---|---|---|
| rounded wholly right | 4 solid columns | wide on 293 of 505 ink rows | 2 columns |
| cell dropped | 2 columns and a hole | exact | 1 column |
| **clipped to the row's ink** | **3 solid columns** | **exact** | 1 column |

**We shipped rounding-right first**, and the **vertical torpedoes** are what killed it:
their rows alternate `#.#` and `###`, rendering 4 columns against 3, and the shaft came
out visibly ragged. `DisassemblySeafox` reaches the same verdict from its own sprite
tool and recommends its `flat` mode — the cell dropped — for cutting sprites, having
measured the same overhang across its 66 tiles.

**We did not take `flat`, because the gaps matter more than the overhang.** Dropping the
cell blacks out 2,908 pixels the hardware fills — measured across our 79 blocks — and
those are not incidental: every text strip is drawn as `#.#.#.` runs, so `SUBS` stops
being two-pixel strokes and becomes a stipple of single dots. That the hardware fills
them is not our inference; the reference's own hardware notes say a renderer painting
only the lit column "leaves black gaps the hardware never shows." Clipping keeps every
one of those 2,908 fills and still lands the box exactly on the bitmap, on all 505 rows.

**What it costs** is the case the other two rules split: a lit pixel standing alone on
its row keeps one column instead of two. That is the death-burst dot and spark
particles, and the last pixel of each strip row. Against a signal model of the composite
path the correct answer there is closer to two — a lone pixel measures full brightness on
its own column and about two-thirds on the next — so this is the one place the shipped
rule under-renders rather than merely rounds.

Runs of three or more are the other known simplification, in the opposite direction:
they render as flat white, where the hardware keeps a coloured fringe at each end
(a 3-run holds ~21% residual chroma, phase inverted). Modelling that means demodulating
a composite signal rather than classifying patterns, which is a display-layer concern
(§ 17.5) and not baked artwork.

### The effect step delay — where the research was wrong

Not a decision. A correction, recorded because the research document this port was built
from states the opposite and someone will read it again.

**`DisassemblySeafox`'s account of the effect step countdown is wrong in two linked
ways.** It says the creation template's `+6` field seeds a new effect's first step delay,
that the field ships as `$A0` = 160 and is written only by the death burst, and — as a
"corollary worth having when reimplementing" — that for a lifetime-1 object the mode
byte's step-delay field is *dead*, being consulted only at `$6122`, "the reload after a
completed step, which a one-step object never reaches."

The instruction path says otherwise. `sub_6000` sets bit 5 of the mode byte at creation
(`$602E`, `$6279` = `$20`), and the walk tests it **first**:

```
6056  LDA $6288,X          ; the mode byte
6059  BIT $6279            ; the new-object bit
605C  BEQ $6067            ; not new -> DEC the step countdown
605E  EOR $6279            ; new -> clear the bit
6064  JMP $60E5            ; skip countdown, lifetime and move; draw, then fall into:
611F  LDA $6288,X
6122  AND #$1F
6124  STA $6289,X          ; the step countdown, from the MODE BYTE
```

So `$6122` is reached on an effect's **first** visit, not only after a completed step.
The copied `+6` is overwritten before it is ever decremented — it is the dead field, and
the mode byte's low five bits are the live one. The corollary is exactly inverted.

The difference is visible, which is how it was caught. The vertical torpedo's mark is
created with mode `$9F` (`$7E7C`), so its delay is 31; at one dot every four frames
behind a shot climbing a pixel a frame that is **eight dots**, with the oldest dropping
off as each new one appears — which is what the game shows. The 160 story predicts a
trail growing to fill the screen, and the "dead field" story predicts a single blinking
pixel. We shipped the second, then the first, before reading the branch at `$605C`.

Every creation site's mode byte was then read directly, and they corroborate: `$0A` for
the horizontal torpedo (≈3 blobs), `$85` for the enemy's (≈3 dots), `$82`/`$10` for the
depth charge's splash and bubbles, `$41`/`$01` in all twelve debris templates, and — the
one that shows the design — `$17A8,X ORA #$C0` for a ship's wake, so a wake's delay is
its own ship's update divider and each ship holds exactly one wake mark.

**The lesson, which cost three wrong answers:** this repository treats the disassembly as
an arbiter, and an arbiter's prose is still a claim. Its *addresses* have been reliable;
its *summaries* have not. Follow the branch before quoting the conclusion — especially a
conclusion offered as advice to a reimplementer, which is exactly the kind that gets
copied instead of checked.
