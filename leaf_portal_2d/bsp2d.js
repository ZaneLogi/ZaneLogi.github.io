class Line {
  constructor(x1, y1, x2, y2) {
    this.point = {x:x1, y:y1};
    const vx = x2 - x1;
    const vy = y2 - y1;
    const len = Math.sqrt(vx * vx + vy * vy);
    if (len === 0) throw new Error("Invalid line!"); // not allow a dot
    this.direction = {x:vx/len, y:vy/len};
  }

  // Test which side a point is on
  side(x, y) {
    const dx = x - this.point.x;
    const dy = y - this.point.y;
    const cross = this.direction.x * dy - this.direction.y * dx;

    // in the downward Y-axis system
    if (cross > 0) return "right";
    if (cross < 0) return "left";
    return "on";
  }

}

class LineSegment {
  constructor(x1, y1, x2, y2) {
    this.x1 = x1; this.y1 = y1;
    this.x2 = x2; this.y2 = y2;
  }

  intersect(line) {
    const x1 = this.x1, y1 = this.y1;
    const x2 = this.x2, y2 = this.y2;
    const x3 = line.point.x, y3 = line.point.y;
    const x4 = x3 + line.direction.x, y4 = y3 + line.direction.y;

    const denom = (x1 - x2)*(y3 - y4) - (y1 - y2)*(x3 - x4);
    if (denom === 0) return null; // parallel or coincident

    const t = ((x1 - x3)*(y3 - y4) - (y1 - y3)*(x3 - x4)) / denom;

    // intersection point along the segment
    if (t < 0 || t > 1) return null; // outside the segment

    let ix = x1 + t * (x2 - x1);
    let iy = y1 + t * (y2 - y1);

    // --- Snap to endpoints to avoid slivers ---
    const EPS = 1e-5;
    if (Math.hypot(ix - x1, iy - y1) < EPS) { ix = x1; iy = y1; }
    if (Math.hypot(ix - x2, iy - y2) < EPS) { ix = x2; iy = y2; }

    return { x: ix, y: iy };
  }
}

class Wall {
  constructor(x1, y1, x2, y2) {
    this.line = new Line(x1, y1, x2, y2);
    this.lineSegment = new LineSegment(x1, y1, x2, y2);
    this.beenUsedAsSplitter = false;
  }

  get x1() {return this.lineSegment.x1;}
  get y1() {return this.lineSegment.y1;}
  get x2() {return this.lineSegment.x2;}
  get y2() {return this.lineSegment.y2;}

  // Test which side a point is on
  side(px, py) {
    return this.line.side(px, py) === "left" ? "back" : "front";
  }

  split(splitter) {
    const ls = this.lineSegment;
    const side1 = splitter.side(ls.x1, ls.y1);
    const side2 = splitter.side(ls.x2, ls.y2);

    // Entirely on one side
    if (side1 === "front" && side2 === "front") return [this, null];
    if (side1 === "back" && side2 === "back") return [null, this];

    // Split needed
    const inter = this.lineSegment.intersect(splitter.line);
  
    if (!inter) {
      // Wall straddles splitter but lines are parallel → assign to front
      return [this, null];
    }

    const EPS = 1e-5;

    let frontPart = null, backPart = null;
    if (side1 === "front") {
      // Front segment
      if (Math.hypot(inter.x - this.x1, inter.y - this.y1) > EPS) {
        frontPart = new Wall(this.x1, this.y1, inter.x, inter.y);
      }
      // Back segment
      if (Math.hypot(this.x2 - inter.x, this.y2 - inter.y) > EPS) {
        backPart = new Wall(inter.x, inter.y, this.x2, this.y2);
      }
    } else {
      // Back segment
      if (Math.hypot(inter.x - this.x1, inter.y - this.y1) > EPS) {
        backPart = new Wall(this.x1, this.y1, inter.x, inter.y);
      }
      // Front segment
      if (Math.hypot(this.x2 - inter.x, this.y2 - inter.y) > EPS) {
        frontPart = new Wall(inter.x, inter.y, this.x2, this.y2);
      }
    }

    if (frontPart) frontPart.beenUsedAsSplitter = this.beenUsedAsSplitter;
    if (backPart) backPart.beenUsedAsSplitter = this.beenUsedAsSplitter;

    return [frontPart, backPart];
  } 
}

class BSPNode {
  constructor() {
    this.splitter = null;  // wall that splits space
    this.front = null;     // BSPNode or Leaf
    this.back = null;      // BSPNode or Leaf
    this.isLeaf = false;   // true for leaf
    this.free = false;     // if leaf, is this free space?
    this.walls = null;     // convex hull
  }
}

function chooseSplitter(walls) {
  let bestWall = null;
  let bestScore = Infinity;

  for (let wall of walls) {
    if (wall.beenUsedAsSplitter) continue;

    let F = 0, B = 0, S = 0;
    for (let other of walls) {
      if (other === wall) continue;

      const side1 = wall.side(other.x1, other.y1);
      const side2 = wall.side(other.x2, other.y2);

      if (side1 === "front" && side2 === "front") F++;
      else if (side1 === "back" && side2 === "back") B++;
      else S++;
    }

    const score = (F - B) ** 2 + S * 5; // 5 = split cost, tweakable
    if (score < bestScore) {
      bestScore = score;
      bestWall = wall;
    }
  }

  return bestWall;
}

function buildBSP(walls, defaultFree = true) {
  // Optimized splitter selection
  const splitter = chooseSplitter(walls);
  if (splitter === null) {
    const leaf = new BSPNode();
    leaf.isLeaf = true;
    leaf.free = defaultFree;
    leaf.walls = walls;
    return leaf;
  }

  const node = new BSPNode();
  node.splitter = splitter;
  splitter.beenUsedAsSplitter = true;

  const frontWalls = [];
  const backWalls = [];

  for (let wall of walls) {
    if (wall === splitter) {
      frontWalls.push(wall);
      continue;
    }
    const side1 = splitter.side(wall.x1, wall.y1);
    const side2 = splitter.side(wall.x2, wall.y2);

    if (side1 === "front" && side2 === "front") frontWalls.push(wall);
    else if (side1 === "back" && side2 === "back") backWalls.push(wall);
    else {
      const [frontPart, backPart] = wall.split(splitter);
      if (frontPart) frontWalls.push(frontPart);
      if (backPart) backWalls.push(backPart);
    }
  }

  node.front = buildBSP(frontWalls, true);
  node.back = buildBSP(backWalls, false);

  // === Compute portal ===
  // Portal is initially the splitter segment
  node.portal = { x1: splitter.x1, y1: splitter.y1, x2: splitter.x2, y2: splitter.y2 };
  return node;
}



// --------------------------
// Create Rectangle Room
// --------------------------
// Rectangle coordinates
const xMin = 50, yMin = 50, xMax = 250, yMax = 150;

// Walls
const outerWalls = [
    new Wall(xMin, yMin, xMax, yMin),   // top wall, normal down
    new Wall(xMax, yMin, xMax, yMax),  // right wall, normal left
    new Wall(xMax, yMax, xMin, yMax),  // bottom wall, normal up
    new Wall(xMin, yMax, xMin, yMin)    // left wall, normal right
];

// --------------------------
// Inner Rectangle Obstacle
// --------------------------
const ixMin = 100, iyMin = 100, ixMax = 200, iyMax = 125;

// Inner walls
const innerWalls = [
    new Wall(ixMin, iyMin, ixMin, iyMax), // left wall, normal left
    new Wall(ixMin, iyMax, ixMax+25, iyMax), // top wall, normal down
    new Wall(ixMax+25, iyMax, ixMax, iyMin), // right wall, normal right
    new Wall(ixMax, iyMin, ixMin, iyMin)  // bottom wall, normal up
];

// Combine
const walls = [...innerWalls, ...outerWalls];

// --------------------------
// Build BSP Tree
// --------------------------
const bspRoot = buildBSP(walls);
console.log(bspRoot);

// --------------------------
// Test: Find leaf for a point
// --------------------------
function findLeaf(node, px, py) {
  if (node.isLeaf) return node;
  const side = node.splitter.side(px, py);
  return side === "front" ? findLeaf(node.front, px, py)
                          : findLeaf(node.back, px, py);
}

console.log("position 75,75:", findLeaf(bspRoot, 75, 75));


function collectFreeLeaves(node, result = []) {
  if (!node) return result;

  if (node.isLeaf) {
    if (node.free) result.push(node);
    return result;
  }

  // Traverse front and back children
  collectFreeLeaves(node.front, result);
  collectFreeLeaves(node.back, result);

  return result;
}

const freeLeaves = collectFreeLeaves(bspRoot);
console.log("Number of free leaves:", freeLeaves.length);
for (const leaf of freeLeaves) {
  console.log(leaf);
}

function getRandomColor() {
  const r = Math.floor(Math.random() * 256); // 0-255
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `rgb(${r},${g},${b})`;
}

function fillLeafPolygon(node, ctx) {
  if (!node) return;

  if (node.isLeaf && node.free && node.walls.length > 0) {
    ctx.fillStyle = getRandomColor();

    ctx.beginPath();
    // Start from the first wall's first point
    let firstWall = node.walls[0];
    ctx.moveTo(firstWall.x1, firstWall.y1);
    ctx.lineTo(firstWall.x2, firstWall.y2);

    // Trace all wall endpoints in order
    for (let i = 1; i < node.walls.length; i++) {
      const wall = node.walls[i];
      ctx.lineTo(wall.x1, wall.y1);
      ctx.lineTo(wall.x2, wall.y2);
    }

    // Close the polygon
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = getRandomColor();
    for (let wall of node.walls) {
      ctx.beginPath();
      ctx.moveTo(wall.x1, wall.y1);
      ctx.lineTo(wall.x2, wall.y2);
      ctx.stroke();
    }

    return;
  }

  // Recurse front and back
  fillLeafPolygon(node.front, ctx);
  fillLeafPolygon(node.back, ctx);
}

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

fillLeafPolygon(bspRoot, ctx);