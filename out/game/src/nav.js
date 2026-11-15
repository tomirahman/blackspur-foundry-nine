// A navigation grid baked from the map's blocks, with A* and a line-of-sight smoother. The grid is
// built once at boot; every bot shares it, and a path is a list of {x, z} waypoints.

import { blocked, floorAt, clearLine } from './collision.js';

const CELL = 1.0;
const AGENT_RADIUS = 0.46;
const BODY_HEIGHT = 1.5;

export function buildNav(world) {
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const ox = minX;
  const oz = minZ;
  const w = Math.ceil((maxX - minX) / CELL);
  const h = Math.ceil((maxZ - minZ) / CELL);
  const walkable = new Uint8Array(w * h);
  const floor = new Float32Array(w * h);

  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const x = ox + (i + 0.5) * CELL;
      const z = oz + (j + 0.5) * CELL;
      const f = floorAt(world, x, z, 0.6, AGENT_RADIUS);
      if (f > 1.3) continue;
      if (blocked(world, x, z, f + 0.06, BODY_HEIGHT, AGENT_RADIUS)) continue;
      walkable[j * w + i] = 1;
      floor[j * w + i] = f;
    }
  }

  return { cell: CELL, w, h, ox, oz, walkable, floor, blockedCell: new Uint8Array(w * h) };
}

const key = (i, j) => j * 1e6 + i;

export function cellOf(nav, x, z) {
  const i = Math.floor((x - nav.ox) / nav.cell);
  const j = Math.floor((z - nav.oz) / nav.cell);
  return { i, j };
}

export function isWalkable(nav, i, j) {
  if (i < 0 || j < 0 || i >= nav.w || j >= nav.h) return false;
  return nav.walkable[j * nav.w + i] === 1;
}

export function cellCenter(nav, i, j) {
  return { x: nav.ox + (i + 0.5) * nav.cell, z: nav.oz + (j + 0.5) * nav.cell };
}

export function nearestWalkable(nav, x, z) {
  const { i: si, j: sj } = cellOf(nav, x, z);
  if (isWalkable(nav, si, sj)) return { i: si, j: sj };
  for (let r = 1; r <= 14; r += 1) {
    for (let dj = -r; dj <= r; dj += 1) {
      for (let di = -r; di <= r; di += 1) {
        if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
        const i = si + di;
        const j = sj + dj;
        if (isWalkable(nav, i, j)) return { i, j };
      }
    }
  }
  return null;
}

const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

// A* over the grid. Returns world-space waypoints from the first step to the goal, or null.
export function findPath(world, nav, fromX, fromZ, toX, toZ) {
  const start = nearestWalkable(nav, fromX, fromZ);
  const goal = nearestWalkable(nav, toX, toZ);
  if (!start || !goal) return null;

  const total = nav.w * nav.h;
  const gScore = new Float32Array(total).fill(Infinity);
  const came = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const startIdx = start.j * nav.w + start.i;
  const goalIdx = goal.j * nav.w + goal.i;
  gScore[startIdx] = 0;

  // A binary heap keeps the open set cheap on a grid this size.
  const heap = [];
  const push = (node) => {
    heap.push(node);
    let n = heap.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (heap[p].f <= heap[n].f) break;
      const tmp = heap[p]; heap[p] = heap[n]; heap[n] = tmp;
      n = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let n = 0;
      for (;;) {
        const l = n * 2 + 1;
        const r = l + 1;
        let m = n;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === n) break;
        const tmp = heap[m]; heap[m] = heap[n]; heap[n] = tmp;
        n = m;
      }
    }
    return top;
  };

  const heur = (i, j) => Math.hypot(i - goal.i, j - goal.j);
  push({ idx: startIdx, i: start.i, j: start.j, f: heur(start.i, start.j) });

  let guard = 0;
  while (heap.length > 0 && guard < 24000) {
    guard += 1;
    const cur = pop();
    if (cur.idx === goalIdx) break;
    if (closed[cur.idx]) continue;
    closed[cur.idx] = 1;
    for (let n = 0; n < NEIGHBOURS.length; n += 1) {
      const [di, dj, cost] = NEIGHBOURS[n];
      const i = cur.i + di;
      const j = cur.j + dj;
      if (!isWalkable(nav, i, j)) continue;
      if (di !== 0 && dj !== 0) {
        if (!isWalkable(nav, cur.i + di, cur.j) || !isWalkable(nav, cur.i, cur.j + dj)) continue;
      }
      const idx = j * nav.w + i;
      if (closed[idx]) continue;
      const tentative = gScore[cur.idx] + cost;
      if (tentative < gScore[idx]) {
        gScore[idx] = tentative;
        came[idx] = cur.idx;
        push({ idx, i, j, f: tentative + heur(i, j) });
      }
    }
  }

  if (gScore[goalIdx] === Infinity) return null;

  const cells = [];
  let idx = goalIdx;
  let steps = 0;
  while (idx !== startIdx && idx >= 0 && steps < 4096) {
    cells.push({ i: idx % nav.w, j: Math.floor(idx / nav.w) });
    idx = came[idx];
    steps += 1;
  }
  cells.reverse();

  const points = cells.map((c) => cellCenter(nav, c.i, c.j));
  points.push({ x: toX, z: toZ });
  return smooth(world, fromX, fromZ, points);
}

// Drops every waypoint the body can already see past, so paths are straight runs between corners.
function smooth(world, fromX, fromZ, points) {
  const out = [];
  let ax = fromX;
  let az = fromZ;
  let i = 0;
  while (i < points.length) {
    let best = i;
    for (let j = points.length - 1; j > i; j -= 1) {
      const p = points[j];
      if (clearLine(world, ax, 0.9, az, p.x, 0.9, p.z)) { best = j; break; }
    }
    const p = points[best];
    out.push(p);
    ax = p.x;
    az = p.z;
    i = best + 1;
  }
  return out;
}