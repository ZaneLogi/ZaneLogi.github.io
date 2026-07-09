# 02 — Portals

**Goal of this stage:** find the **doorways between empty leaves** — the open
spans of the splitter lines where you can pass from one leaf into the next.
These portals are the graph edges the PVS is computed over (doc 03), and they
also supply the missing edges that finally let a leaf be drawn as a filled
polygon.

Read `00_overview.md` (sign conventions, the JSON seam) and `01_leaf_tree.md`
(nodes, leaves, `classify` / `split`) first — this stage builds directly on both.

---

## 1. What it is

### A portal is the open part of a splitter line

Every internal node stores a splitter **line**. Along that line, some stretches
have a real wall lying on them (a solid boundary) and some stretches are **empty
on both sides** — those open stretches are **doorways**. A **portal** is one
such open segment, and it connects the empty leaf on the line's front side to
the empty leaf on its back side.

Recall the loose end from doc 01: a leaf's stored `walls` do **not** close its
convex cell — the missing edges are exactly the splitter lines of the nodes
above it. **Portals are those missing edges.** So portals do double duty:

- they are the **adjacency graph** between leaves (what PVS needs), and
- they are the **closing edges** that turn a leaf's wall fragments into a full
  convex polygon (what the renderer needs to fill it).

### The data

One portal is a segment plus the two leaves it joins:

```json
{ "seg": [ax, ay, bx, by], "leaves": [i, j] }
```

By convention `leaves[0]` is the leaf on the line's **front** (normal) side and
`leaves[1]` the **back** side, so the portal's orientation is recoverable from
the pair order. Each leaf also gets an index list of the portals on its border.

---

## 2. How it works

### The idea: an oversized candidate, carved down to its openings

We do **not** try to compute a doorway analytically. Instead, for each node we
lay down **one big candidate portal** covering the whole line, then **push it
down the tree** and let the tree itself carve the candidate into the pieces that
are empty on both sides. Those surviving pieces are the real doorways.

Three steps: build the candidate, clip it, keep the good fragments.

### Step A — the initial portal (per node)

On the node's line, build a segment long enough to cover everything the node
governs:

- centre it at the node's **bounding-box centre projected onto the line**,
- give it a half-length equal to the box's **half-diagonal** (`|boxMax − boxCentre|`).

That segment is guaranteed to overshoot the node's region along the line; the
clip step trims the overshoot away. (This is where 3D collapses to 2D: the
tutorial builds a *quad* from two in-plane axes; a 2D line has only **one**
in-plane direction, so the portal is a **segment**.)

### Step B — clip it down the tree, from the root

Push the candidate from the **root**. At every node it meets, classify the
portal segment against that node's line with the **same FRONT / BACK / ON /
SPANNING test from doc 01**, and route it:

```
clip(node, portal):                       # returns the surviving fragments
  case classify(portal, node.line):

    FRONT:    front is empty-ward.
              node.front is a leaf → portal landed in it; record that leaf.
              else                 → recurse into node.front.

    BACK:     back is solid-ward.
              node.back is solid   → drop the fragment (backed by solid — no door).
              else                 → recurse into node.back.

    SPANNING: split the segment at the line into (pf, pb);
              send pf down the front, pb down the back (pb dropped if back solid);
              return whatever survives from each.

    ON-LINE:  the portal has reached its OWN origin node (coincident line).
              Send it down the FRONT to pick up the front leaf,
              then send that fragment down the BACK to pick up the back leaf.
```

Every surviving fragment carries a running list of **leaf owners**. The crucial
asymmetry: `FRONT` and `BACK` each record at most **one** owner, so only the
**ON-LINE** case — which walks *both* sides of the origin node — can end a
fragment with **two** owners. Ancestors above the origin node only trim the
oversized candidate (that is why we push from the root); the origin node is
where the two leaves are actually collected.

### Step C — keep the real portals

From the fragments a node's candidate produces:

1. **Keep only the 2-owner fragments.** One owner means the line was open on one
   side but solid on the other (a wall, not a door); zero means it landed
   entirely in solid. Both are discarded.
2. **Dedup by leaf pair.** If a portal for the same `{i, j}` pair already
   exists, keep the **longer** segment and drop the shorter — a shorter
   collinear fragment is redundant.
3. **Register** the portal index in each of its two leaves' portal lists.

### Worked result on the room

The 4-leaf ring (top / right / bottom / left strips from doc 01) yields exactly
**four portals**, one per shared edge, forming a cycle:

```
        leaf0 (top)
       P1 /       \ P2
    leaf3          leaf1
       P4 \       / P3
        leaf2 (bottom)

  P1  leaf0–leaf3   [ 50,250 , 350,250 ]   (y=250, left of the obstacle)
  P2  leaf0–leaf1   [450,250 , 750,250 ]   (y=250, right of the obstacle)
  P3  leaf1–leaf2   [450,350 , 450,550 ]   (x=450, below the obstacle)
  P4  leaf2–leaf3   [ 50,350 , 350,350 ]   (y=350, left of the obstacle)
```

The spans **across the obstacle** (e.g. `y=250, x∈[350,450]`) are dropped in
step C — solid on one side. The four **outer-wall** nodes produce no portals at
all: their back side is solid, so every fragment comes back with a single owner.
So the doorways land precisely where two floor strips meet, and nowhere else.

### The render payoff: filled leaves

With portals in hand, a leaf's boundary is finally complete: **its wall
fragments plus its portal segments** enclose the convex cell. Because the cell
is convex, the renderer can order those boundary segments by angle around the
leaf centroid and fill the polygon — the distinct-colour cells promised in
doc 01's Figure 1.1, now solid instead of outline-only.

---

## 3. How we build it

### New code

- **`compiler/portals.py`** — `initial_portal(node)`, `clip_portal(root,
  portal)`, and `build_portals(tree)` (loops every node, applies the 2-owner
  filter and the dedup-by-pair-keep-longer merge).
- A portal is just a **segment carrying the origin node's normal plus a
  leaf-owner list**, so it reuses `geom2d`'s `classify_wall` and `split_wall`
  unchanged — split pieces inherit the portal's normal exactly as wall pieces do.

### What this stage writes to `levels/<scene>.json`

- `portals[]` — one `{ "seg": [ax, ay, bx, by], "leaves": [front, back] }` per
  doorway.
- each `leaves[k].portals` — the list of portal indices on that leaf's border
  (was an empty array after stage 1).

`compile.py` calls `build_portals` after `build_tree` and before serializing.

### The demo

`demos/02_portals.html` draws the portals (the doorway segments, distinct from
walls) and upgrades the leaf rendering from outline to **filled convex
polygons** (walls + portals, ordered around the centroid).

### Deliberately deferred

- **PVS (doc 03).** Portals are the edges; the PVS walks leaf → leaf *through*
  these portals and computes, for each leaf, the set it can possibly see. That
  is the next and final core stage.
