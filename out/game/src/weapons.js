// One trigger pull. Handles the cadence, the magazine, the cone of fire and the recoil kick, then
// asks the ballistics module where the bullet landed. Grenades live beside it in the same file
// because they share the throw arc.

import { WEAPONS, NADES } from './config.js';
import { applyDamage, damageFor, spreadCone, traceShot, clampSpread } from './ballistics.js';
import { clamp } from './mathx.js';

export function weaponDef(id) {
  return WEAPONS[id] ?? null;
}

export function nadeDef(id) {
  return NADES[id] ?? null;
}

export function activeWeaponId(actor) {
  return actor.slot === 'primary' ? actor.weapons.primary : actor.weapons.secondary;
}

export function activeDef(actor) {
  return weaponDef(activeWeaponId(actor));
}

export function ensureAmmo(actor, id) {
  if (!id) return null;
  if (!actor.ammo[id]) {
    const def = WEAPONS[id];
    actor.ammo[id] = { mag: def.magSize, reserve: def.reserve };
  }
  return actor.ammo[id];
}

export function magOf(actor, id) {
  return ensureAmmo(actor, id)?.mag ?? 0;
}

export function reserveOf(actor, id) {
  return ensureAmmo(actor, id)?.reserve ?? 0;
}

export function canReload(actor) {
  const id = activeWeaponId(actor);
  const def = weaponDef(id);
  if (!def || actor.reloadT > 0) return false;
  const ammo = ensureAmmo(actor, id);
  return ammo.mag < def.magSize && ammo.reserve > 0;
}

export function startReload(actor, events) {
  if (!canReload(actor)) return false;
  const def = activeDef(actor);
  actor.reloadT = def.reloadTime;
  if (events) events.push({ type: 'reload', actor, weaponId: def.id });
  return true;
}

// Projected cone size for the crosshair: the same numbers the bullets use, so the reticle never
// lies about accuracy.
export function currentSpread(actor, def) {
  const speed = Math.hypot(actor.vel.x, actor.vel.z);
  let s = def.spread;
  s += def.moveSpread * clamp(speed / 6.4, 0, 1.25);
  if (!actor.onGround) s += def.airSpread;
  if (actor.crouched) s *= 0.6;
  s += actor.spreadKick;
  return clampSpread(s);
}

export function canFire(actor) {
  const def = activeDef(actor);
  if (!def) return false;
  if (actor.fireCd > 0 || actor.reloadT > 0) return false;
  const ammo = ensureAmmo(actor, activeWeaponId(actor));
  return ammo.mag > 0;
}

// Returns the number of hits registered, so callers can drive a hit marker.
export function fireWeapon(sim, actor, aim) {
  if (!canFire(actor)) {
    if (actor.fireCd <= 0 && actor.reloadT <= 0 && activeDef(actor) && magOf(actor, activeWeaponId(actor)) === 0) {
      startReload(actor, sim.events);
    }
    return 0;
  }
  const def = activeDef(actor);
  const ammo = ensureAmmo(actor, activeWeaponId(actor));
  ammo.mag -= 1;
  actor.fireCd = 60 / def.rpm;
  actor.recoil.index += 1;
  actor.recoil.lastShot = sim.time;

  const kick = def.recoilPitch * (actor.crouched ? 0.82 : 1);
  actor.recoil.pitch += kick * (Math.PI / 180) * 0.6;
  const sway = Math.sin(actor.recoil.index * 1.7) * def.recoilYaw * 0.6;
  actor.recoil.yaw += sway * (Math.PI / 180) * 0.6;
  actor.spreadKick = Math.min(0.09, actor.spreadKick + def.spreadPerShot);

  const spread = currentSpread(actor, def);
  const originX = actor.pos.x;
  const originY = actor.pos.y + actor.eye - 0.05;
  const originZ = actor.pos.z;
  const dir = { x: aim.x, y: aim.y, z: aim.z };

  sim.events.push({
    type: 'shot', actor, weaponId: def.id, sound: def.sound,
    x: originX, y: originY, z: originZ, dx: dir.x, dy: dir.y, dz: dir.z,
  });

  let hits = 0;
  const pellets = def.pellets;
  for (let p = 0; p < pellets; p += 1) {
    const d = spreadCone(sim.rng, { x: dir.x, y: dir.y, z: dir.z }, pellets > 1 ? def.spread : spread);
    const hit = traceShot(sim.world, sim.actors, originX, originY, originZ, d.x, d.y, d.z, def.range, actor.id);
    if (!hit) continue;
    if (hit.kind === 'world') {
      sim.events.push({
        type: 'impact', x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz,
      });
      continue;
    }
    const target = hit.actor;
    if (target.team === actor.team) {
      sim.events.push({ type: 'impact', x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz });
      continue;
    }
    const dmg = damageFor(def, hit.part, hit.dist, target.helmet);
    applyDamage(sim, target, actor, dmg, hit.part, def.id);
    sim.events.push({
      type: 'impact', x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz, flesh: true,
    });
    hits += 1;
    if (actor.isPlayer || actor.ai.targetId === target.id) {
      sim.events.push({ type: 'hitmark', head: hit.part === 'head', killer: actor.id });
    }
  }

  if (ammo.mag === 0) startReload(actor, sim.events);
  return hits;
}

export function tickWeapon(actor, dt, events) {
  if (actor.fireCd > 0) actor.fireCd -= dt;
  if (actor.reloadT > 0) {
    const def = activeDef(actor);
    actor.reloadT -= dt;
    if (actor.reloadT <= 0) {
      actor.reloadT = 0;
      if (def) {
        const ammo = ensureAmmo(actor, activeWeaponId(actor));
        const need = def.magSize - ammo.mag;
        const take = Math.min(need, ammo.reserve);
        ammo.mag += take;
        ammo.reserve -= take;
      }
      if (events) events.push({ type: 'reloaded', actor });
    }
  }
}

export function switchSlot(actor, slot, events) {
  if (actor.slot === slot) return;
  if (slot === 'primary' && !actor.weapons.primary) return;
  actor.slot = slot;
  actor.reloadT = 0;
  actor.fireCd = 0.32;
  actor.scoped = false;
  if (events) events.push({ type: 'switch', actor, weaponId: activeWeaponId(actor) });
}

// --- grenades -------------------------------------------------------------------------------

export function throwNade(sim, actor, kind, aim, power = 1) {
  const def = NADES[kind];
  if (!def || !actor.nades[kind]) return false;
  actor.nades[kind] -= 1;
  const speed = def.throwSpeed * power;
  const gx = aim.x * speed;
  const gy = aim.y * speed + 2.2;
  const gz = aim.z * speed;
  sim.nades.push({
    kind,
    x: actor.pos.x + aim.x * 0.4,
    y: actor.pos.y + actor.eye - 0.1,
    z: actor.pos.z + aim.z * 0.4,
    vx: gx,
    vy: gy,
    vz: gz,
    fuse: def.fuse,
    owner: actor.id,
    team: actor.team,
    rest: 0,
  });
  sim.events.push({ type: 'nadeThrow', kind, actor });
  return true;
}

export function buyWeapon(actor, id, price) {
  const def = WEAPONS[id];
  if (!def) return false;
  if (actor.money < price) return false;
  const slot = def.kind === 'pistol' ? 'secondary' : 'primary';
  if (slot === 'primary' && actor.weapons.primary) return false;
  actor.money -= price;
  actor.weapons[slot] = id;
  const ammo = ensureAmmo(actor, id);
  ammo.mag = def.magSize;
  ammo.reserve = def.reserve;
  actor.slot = slot;
  return true;
}