# 01 — The Leaf BSP Tree

**Goal of this stage:** turn a flat list of walls into a tree whose leaves are
**convex regions of empty space**. Those leaves are what portals connect
(doc 02) and what the PVS is computed over (doc 03).

Read `00_overview.md` first — the sign conventions and the solid-leaf idea
used below are defined there.

---

## 1. What it is

### Node tree vs. leaf tree

A *plain node* BSP keeps subdividing until **every single wall** has been used
as a splitting line — one wall per node. That is fine for sorting, but it
never gives you *regions*; it just gives you a wall at every node.

A *leaf* tree stops earlier. The insight:

> If a group of walls all face **towards each other's front** (none is behind
> another), then, with back-face culling, **none of them can occlude any
> other**. They already form a convex boundary — there is no reason to keep
> cutting. Dump the whole group into a **leaf** and stop.

So a leaf tree produces two kinds of thing:

- **nodes** — an internal split, storing only the splitting *line*, and
- **leaves** — convex bundles of walls bounding a region of empty space.

That second kind is the prize: a leaf *is* a region, and visibility is a
statement about regions.

### The trick: a splitter is *kept*, not consumed

In a plain node tree, once a wall is chosen as the splitter it is removed and
stored at the node. The leaf build does something subtler:

1. Choose a wall; store its **line** as the node's splitter.
2. **Mark that wall as "used as a splitter"** — but **leave it in the list.**
3. Send it down the front side with everything else. It can still be *split*
   by later nodes; it just can never be *chosen* as a splitter again.
4. If a used wall is later split into two, **both halves inherit the "used"
   flag** (so neither can be re-chosen).

Only the *line* is needed to partition space; the wall itself is still real
geometry that belongs in whatever leaf it ends up in.

### When is a list a leaf? (the convex test)

Because used walls stay in the list, the convex test becomes trivial:

> A front list in which **every wall is already marked "used as a splitter"**
> is convex → make it a **leaf**.

Concretely: count the walls in the front list that are **not yet** used as a
splitter. If that count is **0**, no wall could ever be chosen to cut this
group again, which means they are all mutually front-facing → convex → leaf.
No explicit geometry test is needed; the flag *is* the test.

### Front = empty, back = solid

Normals point into empty space (a convention from doc 00), so the *front*
(normal) side of every boundary is the *open* side. Two consequences:

- A front list that goes convex bounds a pocket of **empty** space → an
  **empty leaf**.
- A **back list that comes back empty** means that side is fully enclosed by
  solid boundary → **solid**, and (solid-leaf convention) we store *nothing*
  there.

This is why leaves only ever appear on the **front** side of a node, and the
back side is only ever another node or solid. The asymmetry isn't imposed —
it falls out of the normals and the convex test.

---

## 2. How it works

### The build, step by step

```
build_node(walls):

  1. line = select_best_splitter(walls)      # stores the line, marks its wall "used"

  2. front, back = [], []
     for wall in walls:
        case classify(wall, line):           # see §Classify below
          FRONT    : front.append(wall)
          BACK     : back.append(wall)
          ON-LINE  : append to front if wall.normal agrees with line.normal,
                     else to back
          SPANNING : wf, wb = split(wall, line)   # both inherit wall's "used" flag
                     front.append(wf); back.append(wb)

  3. compute bounding boxes                   # front-list box + combined box (needed by doc 02)

  4. FRONT child:
        if count(w in front where not w.used) == 0:
            front child = EMPTY LEAF holding `front`
        else:
            front child = build_node(front)   # recurse

  5. BACK child:
        if back is empty:
            back child = SOLID                 # nothing stored
        else:
            back child = build_node(back)      # recurse
```

Notes:

- **Leaves are created only in step 4** (the front side). The back side is
  always either another node (step 5 recursion) or solid. Empty regions that
  happen to sit on a "back" side still get their own leaves later — via the
  *front* side of the deeper nodes that the back list recurses into.
- **The on-line case needs the normal comparison** because a wall lying
  exactly on the splitter could face either way; it belongs with the side its
  own normal agrees with. (Two normals "agree" when they point the same
  direction within a small tolerance — a fuzzy compare, not `==`, because of
  float error.)

### Choosing the best splitter

Not every wall makes an equally good cut. A bad splitter slices many other
walls (creating fragments and bloating the tree) or wildly imbalances the two
sides. We score each *candidate* (each wall not yet used as a splitter):

```
select_best_splitter(walls):
  best = None; best_score = +inf
  for cand in walls where not cand.used:
     front = back = spanning = 0
     for other in walls:
        case classify(other, cand.line):
          FRONT    : front    += 1
          BACK     : back     += 1
          SPANNING : spanning += 1
          ON-LINE  : (ignored)
     score = abs(front - back) + spanning * K      # K = split cost, ~3
     if score < best_score: best_score, best = score, cand
  mark best.used = true
  store best.line as a plane
  return best.line
```

- `abs(front - back)` rewards a **balanced** cut.
- `spanning * K` penalises **splits**. `K` trades the two off: larger `K`
  favours fewer fragments over balance. `K = 3` is a reasonable start and is
  the single knob to tune if the tree comes out lopsided or fragment-heavy.

### Classifying a point and a wall (the 2D math)

Straight from the conventions in doc 00. For a line `(P, N)` and point `Q`:

```
s = (Q - P) · N
s >  +ε → FRONT
s <  -ε → BACK
|s| ≤ ε → ON
```

For a wall with endpoints `A`, `B`, classify both and combine:

| A endpoint | B endpoint | wall result |
|------------|------------|-------------|
| front/on   | front/on   | **FRONT**   |
| back/on    | back/on    | **BACK**    |
| on         | on         | **ON-LINE** |
| front      | back       | **SPANNING**|
| back       | front      | **SPANNING**|

### Splitting a wall at a line (the 2D math)

When a wall spans the splitter, cut it at the crossing point. Wall `A → B`,
line `(P, N)`:

```
t = ((P - A) · N) / ((B - A) · N)      # fraction along A→B where it crosses
I = A + t · (B - A)                    # the crossing point
```

`I` splits the wall into `A→I` and `I→B`. Assign each piece to the side its
*outer* endpoint fell on (the one that was front → front piece, etc.). Both
pieces keep the parent's line/normal and inherit its "used" flag.

**Snap to endpoints.** If `I` lands within `ε` of `A` or `B`, snap it exactly
onto that endpoint and drop the zero-length sliver — otherwise tiny numerical
fragments accumulate and pollute later stages.

### Bounding boxes — why compute them now

Each node and each leaf gets an axis-aligned bounding box (AABB) of the walls
under it, built during the recursion (cheap — just min/max over vertices).
They aren't used *in* this stage; they are needed in **doc 02**, where the
initial portal on a node's line is sized to that node's box. Computing them
here, while we already have the wall lists in hand, avoids a second pass.

---

## 3. How we build it

### A worked shape

Take a rectangular room with one interior obstacle (the shape the root
`bsp2d.js` sketch uses): an outer rectangle whose walls face *inward* (empty
is inside) and an inner block whose walls face *outward* (empty is around it).
Feeding those walls to `build_node`:

- The compiler picks balanced splitters (an outer wall's line, then others),
  routing walls into front/back lists and splitting the few that span.
- Each time a front list becomes all-"used", a convex **empty leaf** is
  emitted — together these leaves **tile the open floor** of the room around
  the obstacle.
- The obstacle's interior and everything outside the room end up as **solid**
  (empty back lists) → no leaves there.

The result is a set of empty leaves covering exactly the walkable space, plus
an implicit solid everywhere else.

> **Figure 1.1 (renderer output).** The compiled `room` scene: four convex
> empty leaves tiling the floor around the central obstacle, each leaf's wall
> fragments drawn a distinct colour; solid space (outside the room, inside the
> obstacle) left blank. Leaves are drawn by *segments*, not filled — the fill
> needs the splitter-line edges that portals supply (doc 02).

### What this stage writes to `levels/<scene>.json`

- `planes[]` — one entry per chosen splitter line (`{ p, n }`).
- `nodes[]` — internal nodes with `plane`, `front`, `back`, `bbox`.
- `leaves[]` — each with its `walls` and `bbox`; `portals` and `pvs` are
  **empty arrays** at this stage (filled by 02 / 03).

### Deliberately deferred

- **Portals (02) and PVS (03)** — the next two stages.
- **Filling a leaf as a polygon.** A leaf's stored `walls` do **not** fully
  enclose its convex cell: the cell is *also* bounded by the splitter lines of
  the nodes above it, which aren't in the wall list. So a leaf cannot be drawn
  as a filled polygon from its walls alone — attempting it produces open or
  self-crossing shapes. The **portals from doc 02 supply the missing edges**;
  proper leaf fill waits until then. Until portals exist, the renderer draws
  leaves by their wall segments only.
