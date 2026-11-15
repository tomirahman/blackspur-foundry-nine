// Hitscan traces and damage. A shot is a ray; a body is a head sphere over two boxes, so a hit is
// found against the body's real shape and reports which part it struck.

import { HITBOX, WEAPONS } from './config.js';
import { rayAABB, raySphere, rayWorld } from './collision.js';
import { clamp } from './mathx.js';

const HEAD_R = 0.155;
const TORSO_HX = 0.24;
const TORSO_HZ = 0.24;
const LEG_HX = 0.21;
const LEG_HZ = 0.21;

export function headCentre(actor, out = { x: 0, y: 0, z: 0 }) {
  out.x = actor.pos.x;
  out.y = actor.pos.y + actor.height - 0.17;
  out.z = actor.pos.z;
  return out;
}

// Nearest body a ray touches, ignoring `excludeId`. Returns null when the ray misses everyone.
export function traceActors(actors, ox, oy, oz, dx, dy, dz, maxDist, excludeId, teamFilter) {
  let best = null;
  for (let i = 0; i < actors.length; i += 1) {
    const a = actors[i];
    if (!a.alive || a.id === excludeId) continue;
    if (teamFilter && a.team !== teamFilter) continue;

    const headY = a.pos.y + a.height - 0.17;
    const th = raySphere(ox, oy, oz, dx, dy, dz, a.pos.x, headY, a.pos.z, HEAD_R);
    if (th < maxDist && (!best || th < best.dist)) {
      best = { dist: th, actor: a, part: 'head' };
    }

    const torsoY = a.pos.y + a.height * 0.66;
    const torsoHy = a.height * 0.19;
    const tt = rayAABB(ox, oy, oz, dx, dy, dz, a.pos.x, torsoY, a.pos.z, TORSO_HX, torsoHy, TORSO_HZ, maxDist);
    if (tt < maxDist && (!best || tt < best.dist)) {
      best = { dist: tt, actor: a, part: 'torso' };
    }

    const legY = a.pos.y + a.height * 0.3;
    const legHy = a.height * 0.3;
    const tl = rayAABB(ox, oy, oz, dx, dy, dz, a.pos.x, legY, a.pos.z, LEG_HX, legHy, LEG_HZ, maxDist);
    if (tl < maxDist && (!best || tl < best.dist)) {
      best = { dist: tl, actor: a, part: 'legs' };
    }
  }
  return best;
}

export function traceShot(world, actors, ox, oy, oz, dx, dy, dz, maxDist, excludeId) {
  const wall = rayWorld(world, ox, oy, oz, dx, dy, dz, maxDist);
  const wallDist = wall ? wall.dist : maxDist;
  const body = traceActors(actors, ox, oy, oz, dx, dy, dz, wallDist, excludeId, null);
  if (body) {
    return {
      kind: 'body',
      dist: body.dist,
      actor: body.actor,
      part: body.part,
      x: ox + dx * body.dist,
      y: oy + dy * body.dist,
      z: oz + dz * body.dist,
      nx: -dx,
      ny: -dy,
      nz: -dz,
    };
  }
  if (wall) {
    return {
      kind: 'world',
      dist: wall.dist,
      x: ox + dx * wall.dist,
      y: oy + dy * wall.dist,
      z: oz + dz * wall.dist,
      nx: wall.nx,
      ny: wall.ny,
      nz: wall.nz,
    };
  }
  return null;
}

export function falloff(def, dist) {
  if (dist <= def.falloffStart) return 1;
  if (dist >= def.falloffEnd) return def.falloffMin;
  const t = (dist - def.falloffStart) / (def.falloffEnd - def.falloffStart);
  return 1 + (def.falloffMin - 1) * t;
}

// Damage before armour. Headshots on a helmeted body lose a quarter of their multiplier.
export function damageFor(def, part, dist, helmet) {
  const hit = HITBOX[part] ?? HITBOX.torso;
  let mult = hit.mult;
  if (part === 'head' && helmet) mult *= 0.78;
  return def.damage * falloff(def, dist) * mult;
}

export function applyDamage(sim, target, attacker, amount, part, weaponId) {
  if (!target.alive) return 0;
  let toHealth = amount;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, amount * 0.5);
    target.armor = Math.max(0, target.armor - absorbed);
    toHealth = amount - absorbed;
  }
  toHealth = Math.max(1, Math.round(toHealth));
  target.health -= toHealth;
  target.lastDamage = { from: attacker ? attacker.id : null, t: sim.time, part };
  sim.events.push({ type: 'damage', target, attacker, part, amount: toHealth });

  if (target.health <= 0) {
    target.health = 0;
    target.alive = false;
    target.deadT = 0;
    sim.events.push({ type: 'kill', attacker, victim: target, weaponId });
  }
  return toHealth;
}

export function weaponOf(state, id) {
  return id ? WEAPONS[id] ?? null : null;
}

export function spreadCone(rng, dir, spread) {
  if (spread <= 0) return dir;
  const r = Math.sqrt(rng()) * spread;
  const theta = rng() * Math.PI * 2;
  // Build a basis around the shot direction and tilt the ray inside the cone.
  const upX = Math.abs(dir.y) > 0.9 ? 1 : 0;
  const upY = Math.abs(dir.y) > 0.9 ? 0 : 1;
  let ux = upY * dir.z - 0 * dir.y;
  let uy = 0 * dir.x - upX * dir.z;
  let uz = upX * dir.y - upY * dir.x;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const vx = dir.y * uz - dir.z * uy;
  const vy = dir.z * ux - dir.x * uz;
  const vz = dir.x * uy - dir.y * ux;

  const ox = Math.cos(theta) * r;
  const oy = Math.sin(theta) * r;
  const x = dir.x + ux * ox + vx * oy;
  const y = dir.y + uy * ox + vy * oy;
  const z = dir.z + uz * ox + vz * oy;
  const len = Math.hypot(x, y, z) || 1;
  dir.x = x / len;
  dir.y = y / len;
  dir.z = z / len;
  return dir;
}

export function clampSpread(s) {
  return clamp(s, 0, 0.4);
}