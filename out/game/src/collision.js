// Static collision against the map's block list, plus the ray casts the gunplay and the bots
// share. Everything here is pure: it takes a world and numbers, and returns numbers.

import { PHYSICS } from './config.js';

export function buildWorld(map) {
  const solids = map.solids.map((s) => ({
    minX: s.x - s.w / 2,
    maxX: s.x + s.w / 2,
    minY: s.y,
    maxY: s.y + s.h,
    minZ: s.z - s.d / 2,
    maxZ: s.z + s.d / 2,
    mat: s.mat,
  }));
  return { solids, bounds: map.bounds, map };
}

export function pointInBlock(b, x, y, z) {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ;
}

// True when a vertical capsule of `radius` at (x, z) would overlap any block between y and y+height.
export function blocked(world, x, z, y, height, radius) {
  const ry0 = y + 0.001;
  const ry1 = y + height;
  for (let i = 0; i < world.solids.length; i += 1) {
    const b = world.solids[i];
    if (b.maxY <= ry0 || b.minY >= ry1) continue;
    const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
    const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

// Highest walkable surface under (x, z) that the body could stand on, given it is at or above `y`.
export function floorAt(world, x, z, y, radius) {
  let best = 0;
  for (let i = 0; i < world.solids.length; i += 1) {
    const b = world.solids[i];
    if (b.maxY > y + PHYSICS.stepHeight) continue;
    if (b.maxY <= best) continue;
    const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
    const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < radius * radius * 0.85) best = b.maxY;
  }
  return best;
}

// Moves a capsule by `dx, dz` on the horizontal plane, resolving each axis so a body slides along
// walls instead of sticking, and steps up ledges within stepHeight.
export function slideMove(world, pos, dx, dz, height, radius) {
  const step = PHYSICS.stepHeight;
  if (dx !== 0) {
    const nx = pos.x + dx;
    if (!blocked(world, nx, pos.z, pos.y + step, height - step, radius)) {
      pos.x = nx;
    } else if (!blocked(world, nx, pos.z, pos.y, height, radius)) {
      pos.x = nx;
    }
  }
  if (dz !== 0) {
    const nz = pos.z + dz;
    if (!blocked(world, pos.x, nz, pos.y + step, height - step, radius)) {
      pos.z = nz;
    } else if (!blocked(world, pos.x, nz, pos.y, height, radius)) {
      pos.z = nz;
    }
  }
}

// Ray against an axis-aligned block. Returns the entry distance or Infinity.
export function rayBlock(b, ox, oy, oz, dx, dy, dz, maxT) {
  let tmin = 0;
  let tmax = maxT;
  let axis = -1;
  let sign = 1;

  if (Math.abs(dx) < 1e-8) {
    if (ox < b.minX || ox > b.maxX) return Infinity;
  } else {
    const inv = 1 / dx;
    let t1 = (b.minX - ox) * inv;
    let t2 = (b.maxX - ox) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }

  if (Math.abs(dy) < 1e-8) {
    if (oy < b.minY || oy > b.maxY) return Infinity;
  } else {
    const inv = 1 / dy;
    let t1 = (b.minY - oy) * inv;
    let t2 = (b.maxY - oy) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }

  if (Math.abs(dz) < 1e-8) {
    if (oz < b.minZ || oz > b.maxZ) return Infinity;
  } else {
    const inv = 1 / dz;
    let t1 = (b.minZ - oz) * inv;
    let t2 = (b.maxZ - oz) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }

  if (axis < 0) return Infinity;
  const n = { x: 0, y: 0, z: 0 };
  if (axis === 0) n.x = sign; else if (axis === 1) n.y = sign; else n.z = sign;
  return { t: tmin, nx: n.x, ny: n.y, nz: n.z };
}

// Nearest blocked distance along a ray, or maxDist.
export function rayWorld(world, ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  let hit = null;
  const solids = world.solids;
  for (let i = 0; i < solids.length; i += 1) {
    const r = rayBlock(solids[i], ox, oy, oz, dx, dy, dz, best);
    if (r !== Infinity && r.t < best) {
      best = r.t;
      hit = r;
    }
  }
  return hit ? { dist: best, nx: hit.nx, ny: hit.ny, nz: hit.nz } : null;
}

export function clearLine(world, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-5) return true;
  const h = rayWorld(world, ax, ay, az, dx / len, dy / len, dz / len, len);
  return h === null;
}

// Ray against a sphere the body's hitboxes are built from. Returns distance or Infinity.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

// Ray against an axis-aligned box given as centre and half extents.
export function rayAABB(ox, oy, oz, dx, dy, dz, cx, cy, cz, hx, hy, hz, maxT) {
  const b = {
    minX: cx - hx, maxX: cx + hx,
    minY: cy - hy, maxY: cy + hy,
    minZ: cz - hz, maxZ: cz + hz,
  };
  const r = rayBlock(b, ox, oy, oz, dx, dy, dz, maxT);
  return r === Infinity ? Infinity : r.t;
}