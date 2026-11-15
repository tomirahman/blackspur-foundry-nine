// The bot brain: what it can see, what it is trying to do, and how it moves and shoots while doing
// it. One entry point, updateBot, called from the simulation's fixed step.

import { BOT, PHYSICS, WEAPONS } from './config.js';
import { clearLine } from './collision.js';
import { activeDef, canFire, fireWeapon, magOf, startReload, switchSlot, throwNade, currentSpread } from './weapons.js';
import { findPath, nearestWalkable } from './nav.js';
import { clamp, dist2D, yawTo, angleDelta, approachAngle, viewDirection } from './mathx.js';
import { MAP, insideSite } from './map.js';

const scratchDir = { x: 0, y: 0, z: 0 };
const scratchEye = { x: 0, y: 0, z: 0 };

function eyeOf(actor) {
  scratchEye.x = actor.pos.x;
  scratchEye.y = actor.pos.y + actor.eye * 0.92;
  scratchEye.z = actor.pos.z;
  return scratchEye;
}

export function canSee(world, bot, target) {
  if (!target.alive) return false;
  const eye = eyeOf(bot);
  const tx = target.pos.x;
  const ty = target.pos.y + target.height * 0.72;
  const tz = target.pos.z;
  const dx = tx - eye.x;
  const dy = ty - eye.y;
  const dz = tz - eye.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > BOT.viewRange) return false;
  const yawToTarget = Math.atan2(-dx, -dz);
  if (Math.abs(angleDelta(bot.yaw, yawToTarget)) > BOT.fov * 0.62 && dist > 4) return false;
  return clearLine(world, eye.x, eye.y, eye.z, tx, ty, tz);
}

export function acquireTarget(sim, bot) {
  let best = null;
  let bestScore = Infinity;
  const enemies = sim.actors;
  for (let i = 0; i < enemies.length; i += 1) {
    const other = enemies[i];
    if (!other.alive || other.team === bot.team) continue;
    if (!canSee(sim.world, bot, other)) continue;
    const eye = eyeOf(bot);
    const d = dist2D(eye, other.pos);
    const facing = Math.abs(angleDelta(bot.yaw, yawTo(eye, other.pos)));
    const score = d + facing * 6;
    if (score < bestScore) {
      bestScore = score;
      best = other;
    }
  }
  return best;
}

function pickSite(bot, sim) {
  if (bot.ai.site) return bot.ai.site;
  // A team commits to one site per round; the round sets it, and a lone bot falls back to its own.
  const site = sim.match.atkSite ?? MAP.sites[sim.rng.int(0, MAP.sites.length - 1)].id;
  bot.ai.site = site;
  return site;
}

// Keeps a squad from standing in one spot: a small push away from any teammate closer than a metre.
export function separateFromCrowd(sim, bot) {
  const intent = bot.intent;
  if (!intent) return;
  let ax = 0;
  let az = 0;
  for (let i = 0; i < sim.actors.length; i += 1) {
    const other = sim.actors[i];
    if (other === bot || !other.alive) continue;
    const dx = bot.pos.x - other.pos.x;
    const dz = bot.pos.z - other.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1.69 || d2 < 1e-4) continue;
    const d = Math.sqrt(d2);
    const push = 1 - d / 1.3;
    ax += (dx / d) * push;
    az += (dz / d) * push;
  }
  if (ax === 0 && az === 0) return;
  const fx = -Math.sin(bot.yaw);
  const fz = -Math.cos(bot.yaw);
  const rx = Math.cos(bot.yaw);
  const rz = -Math.sin(bot.yaw);
  intent.forward += ax * fx + az * fz;
  intent.right += ax * rx + az * rz;
}

function setGoal(bot, sim, x, z) {
  const pathSpent = !bot.ai.path || bot.ai.pathIndex >= bot.ai.path.length;
  const same = bot.ai.goal && Math.abs(bot.ai.goal.x - x) < 0.6 && Math.abs(bot.ai.goal.z - z) < 0.6;
  if (same && !pathSpent) return;
  if (same && bot.ai.path && dist2D(bot.pos, { x, z }) < 1.6) return;
  bot.ai.goal = { x, z };
  bot.ai.path = findPath(sim.world, sim.nav, bot.pos.x, bot.pos.z, x, z);
  bot.ai.pathIndex = 0;
  bot.ai.repathAt = sim.time + BOT.repathTime;
}

function routeStep(bot, sim, route) {
  let idx = bot.ai.routeIndex ?? 0;
  if (idx > route.length - 1) idx = route.length - 1;
  const point = route[idx];
  // A waypoint counts as taken from two metres out; a bot that overshoots a tight corner would
  // otherwise stand still waiting for a distance it cannot close.
  if (idx < route.length - 1 && dist2D(bot.pos, point) < 2.0) {
    bot.ai.routeIndex = idx + 1;
    idx += 1;
  }
  bot.ai.routeIndex = idx;
  setGoal(bot, sim, route[idx].x, route[idx].z);
}

function holdSpotFor(bot, sim, list) {
  if (bot.ai.holdSpot) return bot.ai.holdSpot;
  const site = pickSite(bot, sim);
  const options = list.filter((h) => !h.site || h.site === site);
  const pool = options.length > 0 ? options : list;
  bot.ai.holdSpot = pool[sim.rng.int(0, pool.length - 1)];
  return bot.ai.holdSpot;
}

function moveIntent(bot, dirX, dirZ, walk) {
  if (!Number.isFinite(dirX) || !Number.isFinite(dirZ)) {
    dirX = 0;
    dirZ = 0;
  }
  const fx = -Math.sin(bot.yaw);
  const fz = -Math.cos(bot.yaw);
  const rx = Math.cos(bot.yaw);
  const rz = -Math.sin(bot.yaw);
  const intent = bot.intent;
  intent.forward = dirX * fx + dirZ * fz;
  intent.right = dirX * rx + dirZ * rz;
  intent.walk = !!walk;
  intent.crouch = false;
  intent.jump = false;
  const len = Math.hypot(intent.forward, intent.right);
  if (len > 1) {
    intent.forward /= len;
    intent.right /= len;
  }
}

function followPath(bot, sim, walk) {
  const path = bot.ai.path;
  if (!path || path.length === 0) {
    bot.intent.forward = 0;
    bot.intent.right = 0;
    return false;
  }
  let wp = path[bot.ai.pathIndex];
  while (wp && dist2D(bot.pos, wp) < 0.9) {
    bot.ai.pathIndex += 1;
    wp = path[bot.ai.pathIndex];
  }
  if (!wp) {
    bot.intent.forward = 0;
    bot.intent.right = 0;
    return false;
  }
  const dx = wp.x - bot.pos.x;
  const dz = wp.z - bot.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  moveIntent(bot, dx / len, dz / len, walk);
  return true;
}

function aimAt(bot, target, dt, jitterScale) {
  const eye = eyeOf(bot);
  const tx = target.pos.x - eye.x;
  const ty = target.pos.y + target.height * 0.66 - eye.y;
  const tz = target.pos.z - eye.z;
  const desiredYaw = Math.atan2(-tx, -tz);
  const horiz = Math.hypot(tx, tz) || 1;
  const desiredPitch = Math.atan2(ty, horiz);

  const jitter = BOT.aimJitter * jitterScale;
  const aimYaw = desiredYaw + Math.sin(bot.id * 2.7 + bot.ai.jitterPhase) * jitter;
  const aimPitch = desiredPitch + Math.cos(bot.id * 1.9 + bot.ai.jitterPhase) * jitter * 0.6;

  const turn = BOT.turnSpeed * dt * (bot.crouched ? 0.85 : 1);
  bot.yaw = approachAngle(bot.yaw, aimYaw, turn);
  bot.pitch = clamp(bot.pitch + clamp(aimPitch - bot.pitch, -turn, turn), -1.2, 1.2);
  return Math.abs(angleDelta(bot.yaw, desiredYaw));
}

function combat(sim, bot, target, dt, events) {
  const def = activeDef(bot);
  if (!def) return;
  const dist = dist2D(bot.pos, target.pos);
  const jitterScale = clamp(18 / Math.max(6, dist), 0.35, 1.35);
  const offAim = aimAt(bot, target, dt, jitterScale);

  if (bot.ai.reactionAt === 0) bot.ai.reactionAt = sim.time + sim.rng.range(BOT.reactionMin, BOT.reactionMax);

  // Aim for the head at range when the shot is already close, otherwise centre mass.
  if (dist > 18 && bot.ai.burstLeft <= 0) bot.pitch += 0.012;

  bot.ai.strafeUntil -= dt;
  if (bot.ai.strafeUntil <= 0) {
    bot.ai.strafeUntil = sim.rng.range(BOT.strafeMin, BOT.strafeMax);
    bot.ai.strafeDir = sim.rng.sign();
  }

  const peek = dist < 26;
  moveIntent(bot, 0, 0, false);
  if (peek) {
    const fx = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    moveIntent(bot, -fz * bot.ai.strafeDir * 0.6, fx * bot.ai.strafeDir * 0.6, false);
  }
  bot.intent.crouch = dist > 20 && bot.ai.strafeDir > 0;

  if (bot.ai.burstLeft <= 0 && sim.time > bot.ai.reactionAt) {
    bot.ai.burstLeft = sim.rng.int(BOT.burstMin, BOT.burstMax);
    bot.ai.reactionAt = sim.time + 0.18;
  }

  const wantFire = sim.time > bot.ai.reactionAt && offAim < 0.09 && bot.ai.burstLeft > 0;
  if (wantFire && canFire(bot)) {
    const spread = currentSpread(bot, def);
    const aim = viewDirection(bot.yaw, bot.pitch, scratchDir);
    // Fire only when the cone is small enough to plausibly land, so recoil is real for bots too.
    if (spread < 0.11) {
      fireWeapon(sim, bot, aim);
      bot.ai.burstLeft -= 1;
    }
  }
  if (magOf(bot, bot.slot === 'primary' ? bot.weapons.primary : bot.weapons.secondary) === 0) {
    startReload(bot, events);
  }
  if (def.kind === 'sniper' && dist > 24 && !bot.scoped) bot.scoped = true;
}

function maybeNade(sim, bot) {
  if (!bot.nades.shard) return false;
  if (sim.rng() > 0.02) return false;
  const target = bot.ai.targetId ? sim.actorsById.get(bot.ai.targetId) : null;
  if (!target || !target.alive) return false;
  const dist = dist2D(bot.pos, target.pos);
  if (dist < 6 || dist > 24) return false;
  const eye = eyeOf(bot);
  const tx = target.pos.x - eye.x;
  const ty = target.pos.y + 1.2 - eye.y + dist * 0.16;
  const tz = target.pos.z - eye.z;
  const len = Math.hypot(tx, ty, tz) || 1;
  const aim = { x: tx / len, y: ty / len, z: tz / len };
  return throwNade(sim, bot, 'shard', aim, 1);
}

function objective(sim, bot, events) {
  const bomb = sim.bomb;
  const isAtk = bot.team === 'atk';

  if (isAtk) {
    const site = MAP.sites.find((s) => s.id === pickSite(bot, sim)) ?? MAP.sites[0];
    if (bomb.state === 'planted') {
      const hold = holdSpotFor(bot, sim, MAP.holds.atkPostPlant);
      setGoal(bot, sim, hold.x, hold.z);
      if (dist2D(bot.pos, hold) < 1.2) {
        bot.intent.forward = 0;
        bot.intent.right = 0;
        bot.yaw = approachAngle(bot.yaw, hold.yaw, 3 * sim.dt);
        return;
      }
      followPath(bot, sim, false);
      return;
    }
    if (bomb.carrier === bot.id) {
      if (insideSite(site, bot.pos.x, bot.pos.z)) {
        bot.intent.forward = 0;
        bot.intent.right = 0;
        // Keep watching the lane the charge is guarding rather than spinning on the spot.
        bot.yaw = Math.sin(sim.time * 0.9) * 0.85 + Math.PI;
        return;
      }
      routeStep(bot, sim, MAP.routes[site.id] ?? MAP.routes.A);
      followPath(bot, sim, false);
      return;
    }
    // Escorts follow the carrier's lane but hold a few metres short of the site.
    routeStep(bot, sim, MAP.routes[site.id] ?? MAP.routes.A);
    followPath(bot, sim, false);
    return;
  }

  // Defenders: hold the site's angles, then rotate onto the charge when it is down.
  if (bomb.state === 'planted') {
    const site = MAP.sites.find((s) => s.id === bomb.site) ?? MAP.sites[0];
    const dx = bomb.x - bot.pos.x;
    const dz = bomb.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    setGoal(bot, sim, bomb.x, bomb.z);
    if (dist < 1.1 && bot.ai.pathIndex >= (bot.ai.path?.length ?? 0)) {
      bot.intent.forward = 0;
      bot.intent.right = 0;
      bot.ai.state = 'defuse';
      return;
    }
    followPath(bot, sim, dist > 14);
    void site;
    return;
  }

  const hold = holdSpotFor(bot, sim, MAP.holds.defSite);
  setGoal(bot, sim, hold.x, hold.z);
  if (dist2D(bot.pos, hold) < 1.0) {
    bot.intent.forward = 0;
    bot.intent.right = 0;
    bot.yaw = approachAngle(bot.yaw, hold.yaw, 2.4 * sim.dt);
    return;
  }
  followPath(bot, sim, dist2D(bot.pos, hold) < 9);
  void events;
}

export function updateBot(sim, bot, dt, events) {
  if (!bot.alive) return;
  if (!bot.intent) bot.intent = { forward: 0, right: 0, jump: false, crouch: false, walk: false };
  bot.intent.jump = false;

  if (bot.weapons.primary && bot.slot !== 'primary') switchSlot(bot, 'primary', events);

  const target = acquireTarget(sim, bot);
  if (target) {
    bot.ai.targetId = target.id;
    bot.ai.seenAt = sim.time;
    bot.ai.lastKnown = { x: target.pos.x, z: target.pos.z };
    bot.ai.jitterPhase += dt * 6.5;
    combat(sim, bot, target, dt, events);
    if (sim.rng() < 0.004) maybeNade(sim, bot);
    return;
  }

  bot.ai.targetId = null;
  bot.ai.reactionAt = 0;
  bot.ai.burstLeft = 0;
  bot.scoped = false;

  if (bot.reloadT <= 0 && magOf(bot, bot.slot === 'primary' ? bot.weapons.primary : bot.weapons.secondary) < 4) {
    startReload(bot, events);
  }

  if (bot.ai.lastKnown) {
    const d = dist2D(bot.pos, bot.ai.lastKnown);
    if (d > 3) {
      setGoal(bot, sim, bot.ai.lastKnown.x, bot.ai.lastKnown.z);
      followPath(bot, sim, true);
      return;
    }
    bot.ai.lastKnown = null;
  }

  objective(sim, bot, events);
}

export function botHearsNoise(sim, bot, x, z, radius) {
  if (!bot.alive) return;
  const d = Math.hypot(bot.pos.x - x, bot.pos.z - z);
  if (d > radius) return;
  bot.ai.lastKnown = { x, z };
  bot.ai.alertUntil = sim.time + 3;
}

export function initialiseBot(bot, sim) {
  bot.ai.routeIndex = 0;
  bot.ai.jitterPhase = bot.id * 1.37;
  bot.ai.reactionAt = 0;
  bot.ai.burstLeft = 0;
  bot.ai.strafeUntil = 0;
  bot.ai.lastKnown = null;
  bot.ai.path = null;
  bot.ai.pathIndex = 0;
  bot.ai.goal = null;
  bot.ai.holdSpot = null;
  bot.ai.site = null;
  bot.intent = bot.intent ?? { forward: 0, right: 0, jump: false, crouch: false, walk: false };
  void PHYSICS;
  void nearestWalkable;
  void WEAPONS;
}