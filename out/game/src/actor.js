// What a body is and how it walks. One actor shape serves the player and every bot, so recoil,
// collision and damage behave identically for all of them.

import { PHYSICS, MATCH } from './config.js';
import { blocked, floorAt, slideMove } from './collision.js';
import { clamp, yawBasis } from './mathx.js';

export function createActor(id, team, name, isPlayer) {
  return {
    id,
    team,
    name,
    isPlayer,
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    health: 100,
    armor: 0,
    helmet: false,
    hasKit: false,
    crouched: false,
    onGround: true,
    height: PHYSICS.height,
    eye: PHYSICS.eyeHeight,
    spreadKick: 0,
    bobPhase: 0,
    footstepT: 0,
    weapons: { primary: null, secondary: 'vx9' },
    slot: 'secondary',
    ammo: {},
    recoil: { pitch: 0, yaw: 0, index: 0, lastShot: -99 },
    reloadT: 0,
    fireCd: 0,
    scoped: false,
    nades: { shard: 0, glare: 0, veil: 0 },
    lastDamage: { from: null, t: -99 },
    blind: 0,
    deadT: 0,
    // bot brain state, unused by the player
    ai: {
      state: 'idle',
      goal: null,
      path: null,
      pathIndex: 0,
      repathAt: 0,
      targetId: null,
      seenAt: -99,
      reactionAt: 0,
      strafeDir: 1,
      strafeUntil: 0,
      burstLeft: 0,
      lastKnown: null,
      holdSpot: null,
      jumpiness: 0,
      site: null,
    },
  };
}

export function currentWeapon(actor, resolve) {
  const id = actor.slot === 'primary' ? actor.weapons.primary : actor.weapons.secondary;
  return id ? resolve(id) : null;
}

export function eyePosition(actor, out = { x: 0, y: 0, z: 0 }) {
  out.x = actor.pos.x;
  out.y = actor.pos.y + actor.eye;
  out.z = actor.pos.z;
  return out;
}

export function canStand(world, actor) {
  return !blocked(world, actor.pos.x, actor.pos.z, actor.pos.y + 0.02, PHYSICS.height - 0.02, PHYSICS.radius);
}

export function setCrouch(world, actor, want) {
  if (want === actor.crouched) return;
  if (want && !canStand(world, actor)) return;
  actor.crouched = want;
  actor.height = want ? PHYSICS.crouchHeight : PHYSICS.height;
  actor.eye = want ? PHYSICS.crouchEyeHeight : PHYSICS.eyeHeight;
}

// Intent: {forward, right, jump, crouch, walk}. Speeds follow the tactical rule that a moving body
// is a loud, inaccurate body: walking quiet is slower, crouching is slower still and steadies aim.
export function stepMovement(world, actor, intent, dt) {
  const wishForward = intent.forward ?? 0;
  const wishRight = intent.right ?? 0;
  const basis = yawBasis(actor.yaw);

  let wishX = basis.fx * wishForward + basis.rx * wishRight;
  let wishZ = basis.fz * wishForward + basis.rz * wishRight;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1e-4) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  const maxSpeed = actor.crouched
    ? PHYSICS.crouchSpeed
    : intent.walk ? PHYSICS.quietSpeed : PHYSICS.walkSpeed;
  const targetX = wishX * maxSpeed;
  const targetZ = wishZ * maxSpeed;

  if (actor.onGround) {
    const speed = Math.hypot(actor.vel.x, actor.vel.z);
    if (speed > 0.01) {
      const drop = Math.max(speed, PHYSICS.stopSpeed) * PHYSICS.friction * dt;
      const scale = Math.max(0, speed - drop) / speed;
      actor.vel.x *= scale;
      actor.vel.z *= scale;
    }
    const accel = PHYSICS.groundAccel * maxSpeed * dt;
    const dvx = targetX - actor.vel.x;
    const dvz = targetZ - actor.vel.z;
    const dvLen = Math.hypot(dvx, dvz);
    if (dvLen > accel && dvLen > 1e-5) {
      actor.vel.x += (dvx / dvLen) * accel;
      actor.vel.z += (dvz / dvLen) * accel;
    } else {
      actor.vel.x = targetX;
      actor.vel.z = targetZ;
    }
  } else {
    const accel = PHYSICS.airAccel * dt;
    actor.vel.x += wishX * accel;
    actor.vel.z += wishZ * accel;
  }

  if (intent.jump && actor.onGround && !actor.crouched) {
    actor.vel.y = PHYSICS.jumpSpeed;
    actor.onGround = false;
  }

  stepCrouch(world, actor, intent, dt);

  actor.vel.y -= PHYSICS.gravity * dt;
  if (actor.vel.y < -PHYSICS.maxFallSpeed) actor.vel.y = -PHYSICS.maxFallSpeed;

  const before = actor.vel.y;
  slideMove(world, actor.pos, actor.vel.x * dt, actor.vel.z * dt, actor.height, PHYSICS.radius);

  const floor = floorAt(world, actor.pos.x, actor.pos.z, actor.pos.y + 0.05, PHYSICS.radius);
  actor.pos.y += actor.vel.y * dt;

  if (actor.pos.y <= floor) {
    if (!actor.onGround && before < -PHYSICS.fallDamageSpeed) {
      const excess = -before - PHYSICS.fallDamageSpeed;
      actor.fallDamage = excess * 4.5;
    }
    actor.pos.y = floor;
    actor.vel.y = 0;
    actor.onGround = true;
  } else {
    actor.onGround = false;
  }

  if (actor.pos.y < floor) actor.pos.y = floor;

  const horizontal = Math.hypot(actor.vel.x, actor.vel.z);
  actor.bobPhase += dt * horizontal * 1.35;

  // Footsteps are what a bot hears, so only a moving body on the ground makes them.
  if (actor.onGround && horizontal > 1.6) {
    actor.footstepT -= dt;
    if (actor.footstepT <= 0) {
      actor.footstepT = intent.walk || actor.crouched ? 0.62 : 0.42;
      actor.madeStep = true;
    }
  } else {
    actor.footstepT = Math.min(actor.footstepT, 0.12);
  }
}

function stepCrouch(world, actor, intent, dt) {
  if (intent.crouch && !actor.crouched) {
    setCrouch(world, actor, true);
  } else if (!intent.crouch && actor.crouched) {
    if (!blocked(world, actor.pos.x, actor.pos.z, actor.pos.y + 0.02, PHYSICS.height - 0.02, PHYSICS.radius)) {
      setCrouch(world, actor, false);
    }
  }
  void dt;
}

// Recoil decays toward zero; the view kick is applied by whoever owns the camera.
export function decayRecoil(actor, dt) {
  const rate = 9.0;
  const k = Math.exp(-rate * dt);
  actor.recoil.pitch *= k;
  actor.recoil.yaw *= k;
  if (Math.abs(actor.recoil.pitch) < 1e-4) actor.recoil.pitch = 0;
  if (Math.abs(actor.recoil.yaw) < 1e-4) actor.recoil.yaw = 0;
  actor.spreadKick *= Math.exp(-7.5 * dt);
  if (actor.spreadKick < 1e-4) actor.spreadKick = 0;
  if (actor.blind > 0) actor.blind = Math.max(0, actor.blind - dt);
}

export function resetActorForRound(actor, weaponIds, spawn, yaw, money) {
  actor.alive = true;
  actor.deadT = 0;
  actor.pos.x = spawn.x;
  actor.pos.y = 0;
  actor.pos.z = spawn.z;
  actor.vel.x = 0;
  actor.vel.y = 0;
  actor.vel.z = 0;
  actor.yaw = yaw;
  actor.pitch = 0;
  actor.health = 100;
  actor.armor = 0;
  actor.helmet = false;
  actor.crouched = false;
  actor.height = PHYSICS.height;
  actor.eye = PHYSICS.eyeHeight;
  actor.spreadKick = 0;
  actor.recoil.pitch = 0;
  actor.recoil.yaw = 0;
  actor.recoil.index = 0;
  actor.reloadT = 0;
  actor.fireCd = 0;
  actor.scoped = false;
  actor.blind = 0;
  actor.weapons.primary = null;
  actor.weapons.secondary = 'vx9';
  actor.slot = 'secondary';
  actor.nades.shard = 0;
  actor.nades.glare = 0;
  actor.nades.veil = 0;
  actor.hasKit = false;
  actor.ammo = {};
  actor.ammo.vx9 = { mag: 20, reserve: 60 };
  actor.ai.state = 'idle';
  actor.ai.path = null;
  actor.ai.pathIndex = 0;
  actor.ai.targetId = null;
  actor.ai.lastKnown = null;
  actor.ai.holdSpot = null;
  actor.ai.site = null;
  actor.money = money;
  void weaponIds;
  void MATCH;
}

export function aliveCount(actors, team) {
  let n = 0;
  for (let i = 0; i < actors.length; i += 1) {
    const a = actors[i];
    if (a.team === team && a.alive) n += 1;
  }
  return n;
}

export function clampPitch(pitch) {
  return clamp(pitch, -1.45, 1.45);
}