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
6064  JMP $60E5            ; skip countdown, lifetime and move -- into the CLIP,
                           ; which falls through to the draw and then into:
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

### The dolphin's three rules — where our spec was thin

Also not a decision, and the mirror image of the one above: there the reference was
wrong and we followed it; here the reference was **right and complete**, and our spec
lost two thirds of it in the compression. Recorded because the mechanism that lost them
is structural, so it will do it again somewhere else.

**What was missing.** `entry_75DC` is a four-way branch on *who touched the dolphin*, and
`entry_8592` splices two writes into its removal handoff. Our spec carried one of the
four arms and neither write:

| the source | our spec said |
|---|---|
| player and payload are both harmless to it | "exempts the player" |
| the two player torpedoes summon the avenger | "spawns the avenger **when destroyed**" |
| anything else kills it with no retaliation | — |
| **its removal drops the payload** — dY +4, dX 0 | — |

The port implemented that row exactly, so a mine kill summoned an avenger, the escort
could destroy its own cargo, and the resupply floated serenely on after its dolphin died.

**It is not staleness.** Both facts are in the reference's first commit; nothing was
added later. They were available the whole time.

**Three causes, and the first is the one to remember.**

1. **We inherited the reference's tables and dropped its prose.** Every fact our
   § 13.8.2 / § 16.5 did carry — the globals, the release offsets, the ∓5 placement, the
   three sites that clear the live flag — is a **table** in the reference. Both missing
   facts are **trailing prose paragraphs** under those same headings, one of them under a
   heading that literally counts them: *"Shoot the dolphin and three things happen."* We
   wrote down thing one. A summary that keeps the tables looks complete, because tables
   are what a reader checks against — and that is exactly why it isn't.
2. **§ 14.6 had no column for what a row *does*.** It is indexed as *who exempts whom*, so
   a branch that also creates an entity, or also skips a state clear, has nowhere to go
   but a note — and an effect keyed to a type's **removal** rather than to a contact has
   no row at all. The table's shape decided what could be written in it. § 14.7 now says
   so, and § 16.5.1 is a section because it could never have been a row.
3. **A test locked it in, with a false explanation attached.** `test_catalogue` asserted
   that all fourteen types appear in an attract run, explaining that "the demo eventually
   shoots a dolphin." It does not. Measured over the same 6000-tick run, the demo's only
   dolphin death is at tick 4119, killed by a **magnetic mine** — and the avenger appeared
   because our trigger was wrong. The assertion was on a real observation; the sentence
   next to it was invented to explain it, and being plausible, it was never checked.

**The rule this yields**, and it is not "read more carefully": when a spec section is
condensed from a reference section, **the prose between its tables is where the
non-tabular mechanisms live** — side effects, ordering, and anything triggered by
something other than the event the table is indexed on. Read a heading that counts
("three things") as a checklist with a required count. And when a test's detail string
explains *why* a result holds, that explanation is a claim like any other: this one was
wrong for as long as it existed, in a suite that was otherwise green.

### The effects bounds rectangle — where our spec was thin, twice

The third in this sequence, and the least excusable: both defects are in § 15.3, both
were found by re-reading bytes we had **already disassembled once**, and one of them was
introduced by the correction two sections above.

**Defect 1 — a literal re-expressed as a derivation.** `$627A-$627F` are four file
constants no instruction writes: left **6**, right **330**, bottom 181, top 7. Our
§ 15.3 wrote the two X limits as *"22 px beyond the left edge"* and *"22 px beyond the
right edge"* — one margin, applied symmetrically. Against § 2.3's visible span of 28-307
that yields 6 ✓ and **329 ✗**. The ROM's slack is 22 px on the left and **23** on the
right, and nothing makes it symmetric; the symmetry was ours. `EFFECT_BOUNDS` took the
spec at its word and culled effects one column early.

**Defect 2 — an address described by its sequel instead of its content.** The entry above
gets the step delay right and, in the very listing that proves it, writes:

```
6064  JMP $60E5            ; skip countdown, lifetime and move; draw, then fall into:
```

`$60E5` is not the draw. **`$60E5` is the clip** — the first of the four bounds tests —
and it falls through to the draw at `$611C` only for an effect that passes it. So a
just-created effect is bounds-tested before it is ever drawn, and one born outside the
rectangle is reaped on its first visit having never appeared. Our § 15.2, § 15.3 and
§ 15.9 all said "skips straight to the draw", and `walkEffects` had no clip on that path.

It is reachable, not a corner: § 15.8 offsets debris up to 27 px right of the dying
entity, so a Destroyer killed near the right edge should lose the two records carrying
that offset, and did not.

**The lesson, and it sharpens the one above rather than repeating it.** That entry's
lesson was *follow the branch before quoting the conclusion*. We did follow the branch —
and then annotated its destination with **what happens after it** rather than **what is
at it**, which is the same compression one level down. Two rules, both cheap:

- **A constant is quoted, never derived.** If the source holds a number, the spec holds
  that number. A derivation is a second claim smuggled in beside the first, and it is the
  one nobody re-checks — § 15.3 now carries all four limits as literals and says outright
  that they are not a symmetric margin.
- **Annotate an address with its own instruction.** `JMP $60E5` means "go to the clip",
  not "go and draw". Naming a jump for its eventual effect discards every step between,
  and those steps are exactly where a port loses behaviour.

### The gameplay audit — three gaps, and a test whose witness moved

A pass over Chapters 12, 13, 14, 16 and 19 against the reference. Those chapters
hold up in detail — § 13.7's depth charge is complete down to the torpedo exploding on
a charge, § 14.3 derives that a third entity can confirm a contact, § 19's latching and
two-layer sound toggle match `$7036-$7190` instruction for instruction. Three things
were missing, and they share the shape the two entries above name: **the reference
carried them in prose, our spec kept the tables.**

**1. The horizontal torpedo's drift sign — a shipped behaviour bug.** § 13.2's table said
`±1 in Y every 5 updates` and never said what picks the sign, so the port picked one:
`scratch2 = 1`, every shot drifting down. The reference says it in a paragraph, and
`$7993` says it in six bytes:

```
7993  LDA $7E16 / ROL / PHP / ROR / PLP / ROR / STA $17AB,Y
```

That is an arithmetic halving of **the player's live Y velocity** — −2/0/+2 to −1/0/+1 —
read at launch and never again, and `$7F41 ADC $17AB,X` adds it to Y. Fire while climbing
and the shot climbs with you. It is the only weapon in the game that reads the state of
the controls at launch, and the port had every shot on the same curve.

**2. The enemy submarine's draw sequence.** § 12.4 said "two generator draws"; § 8.4 said
the entry side "draws one bit"; neither said how they order or whether the right-only
rungs draw at all — and every draw shifts the shared stream. `$79DE-$7A46`: three draws on
missions 1–2 (side, mask, depth), two elsewhere, because `$79E7 BNE $7A12` skips the side
draw outright; **bit 1 set selects the left side.** `spawners.js` had carried this as an
open `ASSUMPTION ... resolve at Chapter 13 against the disassembly`. The guess was right;
the note is now the fact.

**3. The supply submarine's countdown is reset on one round-start path only.** § 12.3 said
the spawner cooldowns are shipped values "that nothing resets", and `session.js` said so
too. `$6C74-$6C7D` reloads `$84B1`/`$84B2` from 1000 four instructions before placing the
player at (100, 100) — the fresh-submarine path — and the mission-cleared fly-in at
`$6C95` does not touch it. So a new submarine always gets the full interval; a cleared
mission inherits whatever was left and the next resupply can arrive at once.

Two smaller documentation gaps went with them: killing a supply submarine before it
releases shifts the resupply counter's parity, so the first resupply actually received
that mission arrives contested rather than free (the code already did this by
construction); and the payload's 2 px/tick leftward drift was implied by § 16.5.1 but
never stated.

**The part worth keeping: fixing #1 falsified a passing test, and the test was not
wrong about the rule.** `test_catalogue` asserted that no avenger appears in a
6000-tick attract run, on a measurement showing the demo's only dolphin loss was to a
magnetic mine. That measurement was taken with the drift bug in place. Correcting the
drift moved every demo-fired shot, and the demo now shoots a dolphin around tick 3133 —
so an avenger appears and the assertion fails.

Nothing about the avenger changed. What changed is a **trajectory**, and the test had
been using a trajectory as its witness for a **rule**. That is a hostage: an emergent
path through 6000 ticks depends on every mechanic it touches, so any correction anywhere
can break it, and the failure names the wrong culprit — it points at the avenger while
the actual change is two chapters away in a torpedo.

The rule it meant to guard — § 14.6 row 15 keying the avenger to the *toucher*, not the
death — was already tested directly in `test_collision.js`'s `theDolphin()`, against all
five toucher classes. That is the guard. The attract check now asserts only what an
attract run is good for, **coverage** — that all thirteen spawnable types appear — and
says in a comment that the avenger's presence is an observation it deliberately does not
assert either way.

**The rule:** assert a rule where the rule lives. A long emergent run is evidence about
*reachability* — that a type spawns, that a class does not lock — and it is worth having
for that. It is not evidence about a branch, and pinning a branch to it buys a test that
fails for reasons it cannot name. The entry above says a test's *explanation* is a claim
like any other; this one adds that a test's *witness* is too, and that the witness rots
faster than the explanation does.

### Chapter 19: keyboard now, gamepad later — and where the pause lives

Two deliberate departures, recorded because both are visible and neither is drift.

**The gamepad landed one commit later, and the prediction held.** This section first
recorded it as unbuilt: the keyboard shipped alone at Zane's direction, and the claim was
that adding the second scheme would be additive rather than a rework, because § 19.3's
"the two schemes never meet" already had `core/input.js` returning early unless
`session.controller` matched. That turned out to be true and is worth recording as a
result rather than a hope — the whole addition was one new `platform/` file, one
`pollGamepad` beside the existing keyboard half, and two session fields. **Oracle 4 stayed
green through it**, which is the useful part: the demo's frames are byte-identical, so
nothing about the existing scheme moved.

**The two sources are shaped differently, and that is § 19.2 rather than an
inconsistency.** The keyboard is latched, so its source is an event-driven one-key
register that reports only when something happened. The gamepad is hold-to-move, so its
source is sampled fresh every tick and reports the current state, **zero included**.
Release-to-centre cannot be expressed by an event, and a persisting direction cannot be
expressed by a sample — trying to serve both from one shape is how a port ends up with a
keyboard that needs a key-up or a stick that sticks.

**The fire buttons are level-triggered, checked against the bytes rather than assumed.**
`$717A`/`$7182` are `LDA BUTN1 / BPL / JSR` — read every frame, no edge detection and no
debounce — so a held button re-attempts every tick and what paces it is the cap of one
shot in flight plus the horizontal's six-tick cooldown, never anything in the input path.
Edge-triggering would have been the natural modern instinct and would have made both
weapons quietly slower than the original's. The one place either scheme debounces anything
is the pad's *start* button (§ 10.5.3, `$71BC`), which must be seen released first —
without it a pad resting on its button never shows the demo, and the press that ends one
game starts the next.

**The pause freezes at the top of the tick, not inside the input routine.** The original's
ESC handler busy-waits on `KBD` at `$704F`, freezing the whole game mid-tick at § 9.2's
step 2. A browser loop does not get to block, so `pollPause` runs ahead of everything and
returns "stay frozen". The difference is between step 1 and step 2 of a tick in which no
time passes, so nothing observable sits in the gap — and the tick counter deliberately does
not advance either, because a frozen game should not age.

**One thing that looked like a deviation and is not.** § 19.7 describes the sound toggle as
two layers: a stored preference, copied to the live setting only while a mission runs. The
port stores one field. That is not a shortcut — `outputFor` already *derives* suppression
from the mission counter rather than storing it, so a preference set on the silent title
screen takes effect the moment the counter leaves zero, which is the whole of what § 19.7
asks for. Storing the second layer would be a second thing to keep in step, and § 1.4 puts
storage layout on the free side of the line.

**Why the key source is one slot and not a queue.** The Apple's `KBD` latch holds only the
most recent key until the strobe clears it. Modelling that literally — a single-slot
register with a clearing `read()` — buys two of the chapter's rules for free rather than as
code: a flurry of presses between polls collapses to one (§ 19.4), and a key pressed during
a Chapter 11 transition, when nothing polls, is still there for the first poll afterwards
(§ 19.8, deferred not discarded). A queue would have needed explicit handling for both, and
would have got the first one wrong by default.

### Oracle 4 is a regression net, not an external oracle

§ 20.1 defines an oracle as something that "checks the implementation against something
that is not a reading". Oracles 1-3 clear that bar: the generator's algebra, the cold-boot
spawn cadence and the demo trajectory are all derived from the disassembly, so they check
this port against the original.

**Oracle 4's golden frames do not.** There is no way to capture a real frame from the 1982
machine here, so the digests in `tests/golden_frames.js` were captured from this port.
They check it against its own past. That is a different and lesser thing, and the file
says so at the top rather than letting a future reader assume otherwise.

It is still worth having, and the drift bug two entries above is the argument: correcting
it moved every demo-fired shot, and the first sign was a test in another chapter failing
for a reason it could not name. Oracle 4 would have said "tick 1200 differs, rows 0-15 and
64-79, 257 fewer lit bytes" the moment it happened. **Verified by mutation rather than
asserted:** reintroducing that exact bug turns the page red at ticks 1200, 3000 and 6000
and leaves 1-300 green, which is the honest signature of a change that takes time to
diverge.

**So the page has a second half that is external.** The anchors check the frame against
the *spec* -- § 3.4's six palette indices, § 3.5's waterline row, § 19.9's HUD row, § 2.4.1's
empty row above it. Those would catch a renderer that has been consistently wrong since the
day it was written, which no self-captured digest can.

**And the rule that keeps it honest: a golden failure is a question, not a verdict.** Ask
what changed and whether it was meant; regenerate only after answering. Regenerating to
turn a page green promotes a bug to the reference, and from then on the oracle defends it.
Regeneration is deliberately not a button -- `seafoxRegenerateGoldens()` in the console,
sharing the checker's own digest function so the two cannot drift.
