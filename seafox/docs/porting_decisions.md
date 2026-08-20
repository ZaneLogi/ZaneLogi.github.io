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
- One object changes colour during its life: the depth charge, on the single odd
  step at the end of its arc. It bakes as two variants.

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

Presentation is an `AudioWorklet` holding a one-bit cone, toggled every
`5 × pitch + 24` CPU cycles at 1,020,484 Hz, `duration` times, then idle until
the next pair. That reproduces both the pitches and the burst-and-gap texture,
and it runs off-thread, so playing a sound costs no tick time.

A gentle one-pole low-pass models the physical cone. Tunable, default on.

### 5. Presentation: Canvas2D first

`color` reaches the screen through a palette lookup and `putImageData`. The
WebGL indexed path is a later optimisation and needs no change to either buffer:
`color` is already the texture it wants, and `stencil` is core state that never
touches presentation.

### 6. Sprite assets carry their original byte width

Each sprite exports as `{w, h, byteWidth, ink, color}`.

Blocks in the original reserve at least six blank right columns as working
space, and the box test sizes itself to the ink by deriving the extent from the
**byte** width rather than the pixel width. We strip the padding, so boxes must
still be computed from the stored `byteWidth` — recomputing them from the
stripped bitmap yields tighter hitboxes and a game that feels stingier than it
should in a way that is hard to attribute.

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
| effects step on a consistent schedule from the first one created | see below |

### The round-start holds

The launch sequence and the fly-in each pause with nothing moving. The original produces
that pause as a counted busy-wait — three nested loops of a fixed count — so its duration
is a consequence of processor speed rather than a number anyone chose, and it is the only
visible duration in the game that no table determines.

We specify **33 ticks**, which reproduces it at the default rate. An implementation may
tune it without breaking anything else.

### The effect step countdown

The original's effect-creation template carries a step-countdown field that only the
death-burst creator ever writes, and it ships at 160. So until the first death of a
session every effect waits 160 ticks before its first step — a one-tick trail mark
lingers far past its lifetime and the 32 effect slots saturate — and from the first death
onward the value is 1 permanently.

It is a template field one creator overwrites and never restores. We initialise the
countdown from the same field its reload uses, so an effect's first step is timed like
every later one. Reproducing the original here would mean reproducing an artifact whose
only effect is that the opening seconds of a cold boot look wrong.
