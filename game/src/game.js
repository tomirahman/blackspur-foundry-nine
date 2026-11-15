// The simulation: one fixed step that advances the world with no renderer in sight. The renderer
// and the HUD read what this writes, and the audio queue drains sim.events.

import { MATCH, PHYSICS, TEAM, WEAPONS, NADES } from './config.js';
import { MAP } from './map.js';
import { buildWorld, rayWorld } from './collision.js';
import { buildNav } from './nav.js';
import { makeRng } from './rng.js';
import { createActor, stepMovement, decayRecoil, eyePosition } from './actor.js';
import { updateBot, separateFromCrowd } from './bot.js';
import { tickWeapon, activeDef, activeWeaponId } from './weapons.js';
import { createMatchState, createBomb, startRound, tickRound } from './round.js';

const NADE_RADIUS = 0.12;

export function createSimulation(seed = 20261115) {
  const world = buildWorld(MAP);
  const nav = buildNav(world);
  const sim = {
    world,
    nav,
    rng: makeRng(seed),
    time: 0,
    tick: 0,
    actors: [],
    actorsById: new Map(),
    nades: [],
    smokes: [],
    events: [],
    match: createMatchState(),
    bomb: createBomb(),
    input: {
      forward: 0, right: 0, jump: false, crouch: false, walk: false,
      fire: false, reload: false, plant: false, defuse: false,
      yaw: 0, pitch: 0, scoped: false,
    },
  };

  const player = createActor(0, TEAM.ATK, 'you', true);
  player.money = 800;
  sim.player = player;
  sim.actors.push(player);
  sim.actorsById.set(player.id, player);

  const atkNames = ['Rook', 'Marrow', 'Juno', 'Pike'];
  const defNames = ['Sable', 'Crater', 'Vesper', 'Nine', 'Deacon'];
  let id = 1;
  for (let i = 0; i < MATCH.botCount; i += 1) {
    const bot = createActor(id, TEAM.ATK, atkNames[i], false);
    bot.money = 800;
    sim.actors.push(bot);
    sim.actorsById.set(bot.id, bot);
    id += 1;
  }
  for (let i = 0; i < MATCH.botCount + 1; i += 1) {
    const bot = createActor(id, TEAM.DEF, defNames[i], false);
    bot.money = 800;
    sim.actors.push(bot);
    sim.actorsById.set(bot.id, bot);
    id += 1;
  }

  sim.drainEvents = () => {
    const out = sim.events;
    sim.events = [];
    return out;
  };
  sim.eye = { x: 0, y: 0, z: 0 };

  startRound(sim);
  return sim;
}

// One tick. `intent` is the player's input for this step; the bots read their own brains.
export function stepSimulation(sim, intent, dt) {
  sim.time += dt;
  sim.tick += 1;
  sim.dt = dt;

  const player = sim.player;
  const frozen = sim.match.phase === 'freeze';

  if (player.alive) {
    player.yaw = intent.yaw;
    player.pitch = intent.pitch;
    if (!frozen) {
      stepMovement(sim.world, player, {
        forward: intent.forward,
        right: intent.right,
        jump: intent.jump,
        crouch: intent.crouch,
        walk: intent.walk,
      }, dt);
      if (player.fallDamage) {
        sim.events.push({ type: 'fall', actor: player, amount: player.fallDamage });
        player.health = Math.max(0, player.health - player.fallDamage);
        player.fallDamage = 0;
        if (player.health <= 0) {
          player.alive = false;
          sim.events.push({ type: 'kill', attacker: null, victim: player, weaponId: 'fall' });
        }
      }
    }
    decayRecoil(player, dt);
  }

  for (let i = 0; i < sim.actors.length; i += 1) {
    const a = sim.actors[i];
    if (a.isPlayer) continue;
    if (!a.alive) {
      a.deadT += dt;
      continue;
    }
    if (frozen) {
      a.intent.forward = 0;
      a.intent.right = 0;
      continue;
    }
    if (a.fallDamage) {
      sim.events.push({ type: 'fall', actor: a, amount: a.fallDamage });
      a.health = Math.max(0, a.health - a.fallDamage);
      a.fallDamage = 0;
      if (a.health <= 0) {
        a.alive = false;
        sim.events.push({ type: 'kill', attacker: null, victim: a, weaponId: 'fall' });
      }
    }
  }

  // bots think, then everyone moves with the same physics
  const events = sim.events;
  for (let i = 0; i < sim.actors.length; i += 1) {
    const a = sim.actors[i];
    if (a.isPlayer || !a.alive) continue;
    if (frozen) continue;
    updateBot(sim, a, dt, events);
    separateFromCrowd(sim, a);
  }

  for (let i = 0; i < sim.actors.length; i += 1) {
    const a = sim.actors[i];
    if (!a.alive) continue;
    if (a.isPlayer) {
      tickWeapon(a, dt, events);
      continue;
    }
    if (frozen) continue;
    stepMovement(sim.world, a, a.intent, dt);
    decayRecoil(a, dt);
    tickWeapon(a, dt, events);
    if (a.madeStep) {
      a.madeStep = false;
      sim.events.push({ type: 'step', actor: a, quiet: a.intent.walk || a.crouched });
    }
  }

  if (player.alive && player.madeStep) {
    player.madeStep = false;
    sim.events.push({ type: 'step', actor: player, quiet: player.crouched || intent.walk });
  }

  updateNades(sim, dt);
  updateSmokes(sim, dt);

  if (player.alive) eyePosition(player, sim.eye);

  tickRound(sim, dt);
}

function updateSmokes(sim, dt) {
  for (let i = sim.smokes.length - 1; i >= 0; i -= 1) {
    const s = sim.smokes[i];
    s.life -= dt;
    s.age += dt;
    if (s.life <= 0) sim.smokes.splice(i, 1);
  }
}

// Grenades are thrown objects with gravity and a bounce, and each kind does its own thing when it
// goes off: the charge's cousin kills, the glare blinds, the veil smokes a lane off.
function updateNades(sim, dt) {
  const world = sim.world;
  for (let i = sim.nades.length - 1; i >= 0; i -= 1) {
    const n = sim.nades[i];
    n.fuse -= dt;
    n.vy -= PHYSICS.gravity * 0.9 * dt;

    const ox = n.x;
    const oy = n.y;
    const oz = n.z;
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    n.z += n.vz * dt;

    if (n.y < NADE_RADIUS) {
      n.y = NADE_RADIUS;
      n.vy = -n.vy * 0.42;
      n.vx *= 0.72;
      n.vz *= 0.72;
      if (Math.abs(n.vy) < 0.6) n.vy = 0;
    }

    const dx = n.x - ox;
    const dz = n.z - oz;
    const horiz = Math.hypot(dx, dz);
    if (horiz > 1e-5) {
      const wall = rayWorld(world, ox, oy, oz, dx / horiz, 0, dz / horiz, horiz + NADE_RADIUS);
      if (wall) {
        n.x = ox + (dx / horiz) * Math.max(0, wall.dist - NADE_RADIUS);
        n.z = oz + (dz / horiz) * Math.max(0, wall.dist - NADE_RADIUS);
        const dot = n.vx * wall.nx + n.vz * wall.nz;
        n.vx -= 2 * dot * wall.nx;
        n.vz -= 2 * dot * wall.nz;
        n.vx *= 0.55;
        n.vz *= 0.55;
      }
    }

    if (n.fuse <= 0) {
      detonate(sim, n);
      sim.nades.splice(i, 1);
    }
  }
}

function detonate(sim, n) {
  const def = NADES[n.kind];
  sim.events.push({ type: 'detonate', kind: n.kind, x: n.x, y: n.y, z: n.z, radius: def.radius });

  if (n.kind === 'veil') {
    sim.smokes.push({ x: n.x, y: n.y + 1.1, z: n.z, r: def.radius, life: def.duration, age: 0 });
    return;
  }

  for (let i = 0; i < sim.actors.length; i += 1) {
    const a = sim.actors[i];
    if (!a.alive) continue;
    const dx = a.pos.x - n.x;
    const dy = a.pos.y + a.height * 0.5 - n.y;
    const dz = a.pos.z - n.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > def.radius) continue;

    const wall = rayWorld(sim.world, n.x, n.y + 0.15, n.z, dx / (dist || 1), dy / (dist || 1), dz / (dist || 1), dist);
    if (wall) continue;

    const falloff = 1 - dist / def.radius;

    if (n.kind === 'shard') {
      const dmg = def.damage * falloff * falloff;
      if (a.team !== n.team || a.id === n.owner) {
        sim.events.push({ type: 'damage', target: a, attacker: null, part: 'torso', amount: Math.round(dmg) });
        a.health -= Math.round(dmg);
        if (a.health <= 0) {
          a.health = 0;
          a.alive = false;
          sim.events.push({ type: 'kill', attacker: null, victim: a, weaponId: 'shard' });
        }
      }
    } else if (n.kind === 'glare') {
      const eye = a.isPlayer ? sim.eye : { x: a.pos.x, y: a.pos.y + a.eye, z: a.pos.z };
      const vl = Math.hypot(n.x - eye.x, n.y - eye.y, n.z - eye.z) || 1;
      const facing = ((n.x - eye.x) / vl) * -Math.sin(a.yaw) + ((n.z - eye.z) / vl) * -Math.cos(a.yaw);
      const openness = Math.max(0.18, (facing + 1) * 0.5);
      const blindFor = 3.4 * falloff * openness;
      a.blind = Math.max(a.blind, blindFor);
      if (a.isPlayer) sim.events.push({ type: 'flashed', amount: blindFor });
    }
  }
}

// Convenience for the HUD: how many of each team are up.
export function teamStatus(sim) {
  let atk = 0;
  let def = 0;
  for (let i = 0; i < sim.actors.length; i += 1) {
    const a = sim.actors[i];
    if (!a.alive) continue;
    if (a.team === TEAM.ATK) atk += 1; else def += 1;
  }
  return { atk, def };
}

export function playerWeaponName(sim) {
  const def = activeDef(sim.player);
  return def ? def.name : '—';
}

export function playerAmmo(sim) {
  const id = activeWeaponId(sim.player);
  if (!id) return { mag: 0, reserve: 0 };
  const ammo = sim.player.ammo[id];
  return { mag: ammo ? ammo.mag : 0, reserve: ammo ? ammo.reserve : 0 };
}

export const CONSTANTS = { MATCH, WEAPONS, MAP };