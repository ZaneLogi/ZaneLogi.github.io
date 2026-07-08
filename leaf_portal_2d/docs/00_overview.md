# leaf_portal_2d — Overview

*Inspired by the "Mr-GameMaker.com" BSP tutorial series by Gary Simmons and
Adam Hoult — reworked from the ground up in 2D.*

---

## What this is

A **2D Binary Space Partitioning (BSP) tree creator with Potentially Visible
Set (PVS) support.** It has two halves that meet at a single data file:

- **`compiler/` (Python)** — takes a set of 2D walls and *precomputes* a
  dataset: the BSP tree, the convex leaves of empty space, the portals
  (doorways) between them, and each leaf's PVS. Runs offline.
- **`render.js` (JavaScript)** — loads that dataset in the browser and draws
  it: the leaves, the portals, and — given a point — which leaves are
  potentially visible from it.

They communicate through JSON files under **`levels/`** — **one per scene**
(`levels/room.json`, `levels/maze.json`, …). A demo loads one via
`?level=<scene>` (default `room`). Changing a scene's walls means re-running
the Python compiler and refreshing the page.

That trade — a build step inside an otherwise build-free repo — is
deliberate. BSP + PVS is a **precompute-then-render** design: the whole idea
is to do the expensive visibility work *once*, offline, and ship a small
lookup table the renderer reads instantly. Splitting the compiler (Python)
from the renderer (JS) mirrors that intent exactly.

## Why BSP + PVS (in 2D)

A BSP tree recursively cuts space in half with lines until each remaining
region is **convex**. That buys three classic things:

1. **A spatial index** — given any point, walk the tree to find which region
   (leaf) it is in, in a handful of comparisons.
2. **Ordering** — the tree can be traversed to visit regions in strict
   front-to-back or back-to-front order from any viewpoint.
3. **Visibility (the payoff here)** — once space is carved into leaves
   connected by **portals** (the gaps between them), we can precompute, for
   every leaf, the **set of leaves that could possibly be seen from anywhere
   inside it** — the PVS. At runtime the renderer draws only the current
   leaf's PVS and skips everything else.

The PVS is the reason for the whole exercise. Everything before it (tree,
leaves, portals) exists to make the PVS computable.

## The pipeline

```
 walls
   │
   ▼
 [ leaf BSP build ]      →  tree of nodes + convex EMPTY leaves     (doc 01)
   │
   ▼
 [ portal generation ]   →  portals: the doorways between leaves     (doc 02)
   │
   ▼
 [ PVS calculation ]     →  per-leaf "what can I see" sets           (doc 03)
   │
   ▼
 levels/<scene>.json  ──►  render.js  (draw leaves / portals / PVS)
```

Four stages, one doc each:

| Doc                | Stage                                    | Status  |
|--------------------|------------------------------------------|---------|
| `00_overview.md`   | This file — concepts, conventions, seam  | current |
| `01_leaf_tree.md`  | Build the tree; carve convex empty leaves| current |
| `02_portals.md`    | Find the doorways between empty leaves    | later   |
| `03_pvs.md`        | Through the doorways, compute visibility  | later   |
| *(optional)*       | View-frustum rejection at render time     | later   |

Frustum rejection (the tutorial's 4th topic) is a *runtime render*
optimisation, not part of the compiled dataset, so it is optional polish —
not part of the "creator + PVS" goal.

## Coordinate system & primitives

- **2D, canvas convention:** X to the right, **Y downward**, origin at the
  top-left. (This matches the `<canvas>` the renderer draws to.)
- **Point** — `(x, y)`.
- **Line** (a splitting line) — an *infinite* line, stored as a point `P` on
  it plus a unit **normal** `N`. `N` points into *empty* space (see below).
- **Wall / segment** — a *finite* piece of solid boundary: endpoints `A`,
  `B`, lying on a line. The input to the compiler is a list of walls.
- **Node** — an internal tree node: one splitting line + a front child + a
  back child.
- **Leaf** — a convex region of *empty* space (see the solid-leaf convention).
- **Portal** — a segment lying on a node's line that forms a *doorway*
  between two empty leaves.
- **PVS** — for each leaf, the set of leaves potentially visible from it.

## Sign conventions (pin these down once)

Every later stage depends on these, so they are fixed here:

- A line (or wall) has a point `P` and a **unit normal `N`**, and
  **`N` points into empty (front) space.**
- **Classify a point `Q`** against a line: let `s = (Q − P) · N`.
  - `s > +ε` → **front** (the empty side)
  - `s < −ε` → **back** (the solid side)
  - `|s| ≤ ε` → **on** the line
  - `ε ≈ 1e-4`, to absorb floating-point error.
- **Classify a wall/segment** by classifying its two endpoints:
  - both front (front or on) → **front**
  - both back → **back**
  - both on → **on-line**
  - one front, one back → **spanning** (it must be split by the line)
- A wall's normal is a 90° rotation of its direction `A → B`. Input walls are
  **wound** so that this normal faces empty space. The rotation sign, confirmed
  against the compiled `room`, is **`N = (−dy, dx)`** for a direction
  `(dx, dy)` — equivalently, *front* (empty) is the right-hand side of `A → B`
  in the Y-down canvas. A wrong sign silently inverts front/back, so it was
  confirmed against real output (the room's floor probes resolve to empty, its
  solid regions to solid) rather than asserted.

## The solid-leaf convention (important)

This is a **solid-leaf** tree: **only empty leaves are stored.** Solid space
is implicit.

- The **front** child of a node is empty-ward. It is either another **node**
  or an **empty leaf**.
- The **back** child is solid-ward. It is either another **node** or
  **solid** — and "solid" is represented by *nothing at all* (no leaf).

Why the asymmetry? We only ever render, stand in, or see *empty* space. Solid
space has no geometry to draw and no visibility to compute, so it needs no
leaf. Consequently **every enumerated leaf is empty** — which is precisely
what portals connect and what the PVS is computed over. Doc 01 shows how this
falls out of the build for free.

## The JSON seam — `levels/<scene>.json` (v1 target shape)

The browser-friendly stand-in for the tutorial's binary `.bsp`. **One file per
scene** (`levels/room.json`, `levels/maze.json`, …): the compiler writes one
from each input wall-set, and a demo loads one via `?level=<scene>` (default
`room`). The file is **cumulative** — the same scene's file gains `portals`
then `pvs` as those stages land; there is never a separate per-stage file.
Fields fill in as stages land (`portals` / `pvs` are empty arrays until their
stage):

```json
{
  "bounds": { "min": [0, 0], "max": [800, 600] },

  "planes": [
    { "p": [50, 50], "n": [0, 1] }
  ],

  "nodes": [
    {
      "plane": 0,
      "front": { "kind": "node", "index": 1 },
      "back":  { "kind": "solid" },
      "bbox":  { "min": [50, 50], "max": [250, 150] }
    }
  ],

  "leaves": [
    {
      "walls":   [ [50, 50, 250, 50] ],
      "bbox":    { "min": [50, 50], "max": [250, 150] },
      "portals": [],
      "pvs":     []
    }
  ],

  "portals": []
}
```

- `planes[]` — the splitting lines, each `{ p, n }` (point + unit normal).
- `nodes[]` — internal nodes. `front.kind ∈ {node, leaf}`,
  `back.kind ∈ {node, solid}`; `index` refers into `nodes[]` or `leaves[]`.
- `leaves[]` — empty regions. `walls` are the wall fragments that landed in
  the leaf (each `[ax, ay, bx, by]`); `portals` / `pvs` are index lists filled
  by stages 2 / 3.
- `portals[]` — `{ seg: [ax, ay, bx, by], leaves: [i, j] }`, one per doorway.

## Folder layout

```
leaf_portal_2d/
  compiler/            # Python — the dataset builder
    geom2d.py          #   points, lines, classify, split, bbox
    bsp.py             #   build tree, select splitter
    portals.py         #   portal generation           (stage 2)
    pvs.py             #   PVS + anti-penumbra          (stage 3)
    compile.py         #   compile.py <scene> → levels/<scene>.json
  scenes/              # inputs — one wall-set per scene (room, maze, …)
  levels/              # outputs — one compiled JSON per scene (committed)
  docs/
    00_overview.md     # this file
    01_leaf_tree.md
    02_portals.md      #                                (stage 2)
    03_pvs.md          #                                (stage 3)
  index.html           # menu — links each stage's demo + doc
  demos/               # one page per stage
    01_leaf_tree.html
    02_portals.html    #                                (stage 2)
    03_pvs.html        #                                (stage 3)
  render.js            # JS — shared draw lib the demos import
```

The compiled `levels/*.json` are committed so the demos work with no Python at
view time (the same way the tutorial ships its prebuilt level).

## How to read these docs

Each stage doc follows the same three beats:

1. **What it is** — the concept and the intuition.
2. **How it works** — the 2D algorithm, step by step.
3. **How we build it** — the data it reads and writes, and the decisions
   specific to this 2D implementation.

The current `bsp2d.js` at the project root is an early single-file JS sketch
of the leaf-build half; its build logic is superseded by the Python compiler
described here, and its rendering is superseded by `render.js`.
