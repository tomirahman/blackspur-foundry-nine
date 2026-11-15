// Round and match flow: the freeze, the round timer, the charge, who wins and what it pays.
// Nothing here renders; it only moves the numbers the HUD and the level read.

import { MATCH, ECONOMY, TEAM, WEAPONS, NADES, GEAR, PHYSICS } from './config.js';
import { MAP } from './map.js';
import { resetActorForRound, aliveCount } from './actor.js';
import { buyWeapon, ensureAmmo } from './weapons.js';
import { initialiseBot } from './bot.js';

export function createMatchState() {
  return {
    phase: 'freeze',
    clock: MATCH.freezeTime,
    roundNo: 0,
    score: { [TEAM.ATK]: 0, [TEAM.DEF]: 0 },
    lossStreak: { [TEAM.ATK]: 0, [TEAM.DEF]: 0 },
    winner: null,
    reason: '',
    over: false,
  };
}

export function createBomb() {
  return {
    state: 'carried',
    carrier: null,
    site: null,
    x: 0,
    y: 0,
    z: 0,
    timer: 0,
    plantProgress: 0,
    defuseProgress: 0,
    defuserId: null,
    defuseStartedAt: -1,
  };
}

function moneyFor(actor) {
  return actor.money ?? ECONOMY.start;
}

export function startRound(sim) {
  const m = sim.match;
  m.roundNo += 1;
  m.phase = 'freeze';
  m.clock = MATCH.freezeTime;
  m.winner = null;
  m.reason = '';
  sim.bomb = createBomb();
  sim.nades.length = 0;
  sim.smokes.length = 0;

  const spawns = MAP.spawns;
  const atkSpawn = sim.rng.int(0, spawns.atk.length - 1);
  const defSpawn = sim.rng.int(0, spawns.def.length - 1);

  let atkIndex = 0;
  let defIndex = 0;
  for (let i = 0; i < sim.actors.length; i += 1) {
    const a = sim.actors[i];
    const isAtk = a.team === TEAM.ATK;
    const list = isAtk ? spawns.atk : spawns.def;
    const base = isAtk ? atkSpawn + atkIndex : defSpawn + defIndex;
    const spawn = list[base % list.length];
    if (isAtk) atkIndex += 1; else defIndex += 1;
    resetActorForRound(a, WEAPONS, spawn, isAtk ? 0 : Math.PI, moneyFor(a));
    a.yaw = isAtk ? 0 : Math.PI;
    if (!a.isPlayer) {
      initialiseBot(a, sim);
      botBuy(sim, a);
    }
  }

  // The charge goes to one attacker; the player carries it when the player is an attacker.
  const attackers = sim.actors.filter((a) => a.team === TEAM.ATK);
  const carrier = sim.player ? sim.player : attackers[0];
  sim.bomb.carrier = carrier.id;

  assignRoles(sim);

  sim.events.push({ type: 'roundStart', roundNo: m.roundNo });
}

// Roles make the bots read as a team: every attacker pushes the same site, and the defence splits
// its anchors so both sites are covered before the charge is even down.
function assignRoles(sim) {
  const site = MAP.sites[sim.rng.int(0, MAP.sites.length - 1)];
  sim.match.atkSite = site.id;
  if (sim.bomb.carrier !== null) {
    const carrier = sim.actorsById.get(sim.bomb.carrier);
    if (carrier) carrier.ai.site = site.id;
  }

  const spotsA = MAP.holds.defSite.filter((h) => h.site === 'A');
  const spotsB = MAP.holds.defSite.filter((h) => h.site === 'B');
  let ia = 0;
  let ib = 0;
  for (let i = 0; i < sim.actors.length; i += 1) {
    const a = sim.actors[i];
    if (a.team === TEAM.ATK) {
      a.ai.site = site.id;
      continue;
    }
    if (a.isPlayer) continue;
    const takeA = ia <= ib && ia < spotsA.length;
    let spot = null;
    if (takeA) {
      spot = spotsA[ia];
      ia += 1;
    } else if (ib < spotsB.length) {
      spot = spotsB[ib];
      ib += 1;
    }
    if (spot) {
      a.ai.site = spot.site;
      a.ai.holdSpot = spot;
    } else {
      a.ai.holdSpot = MAP.holds.defMid[sim.rng.int(0, MAP.holds.defMid.length - 1)];
    }
  }
}

// Bots spend the same money the player does, and they commit to a loadout before the round starts.
function botBuy(sim, bot) {
  const team = bot.team;
  const wantSniper = sim.rng() < 0.14;
  if (bot.money >= WEAPONS.longspur.price && wantSniper) {
    buyWeapon(bot, 'longspur', WEAPONS.longspur.price);
  } else if (bot.money >= WEAPONS.falchion.price) {
    buyWeapon(bot, 'falchion', WEAPONS.falchion.price);
  } else if (bot.money >= WEAPONS.wasp.price && sim.rng() < 0.55) {
    buyWeapon(bot, 'wasp', WEAPONS.wasp.price);
  } else if (bot.money >= WEAPONS.breach.price && sim.rng() < 0.3) {
    buyWeapon(bot, 'breach', WEAPONS.breach.price);
  }
  if (bot.money >= GEAR.armor.price + 100) {
    bot.money -= GEAR.armor.price;
    bot.armor = 100;
    bot.helmet = true;
  }
  if (team === TEAM.DEF && bot.money >= GEAR.kit.price && sim.rng() < 0.4) {
    bot.money -= GEAR.kit.price;
    bot.hasKit = true;
  }
  const slot = bot.slot === 'primary' ? 'primary' : 'secondary';
  const id = slot === 'primary' ? bot.weapons.primary : bot.weapons.secondary;
  if (id) ensureAmmo(bot, id).reserve = WEAPONS[id].reserve;
  if (bot.money >= NADES.shard.price + 200 && sim.rng() < 0.6) {
    bot.money -= NADES.shard.price;
    bot.nades.shard = 1;
  }
  if (bot.money >= NADES.glare.price + 200 && sim.rng() < 0.4) {
    bot.money -= NADES.glare.price;
    bot.nades.glare = 1;
  }
}

function payRound(sim, winner, reason) {
  const m = sim.match;
  const loser = winner === TEAM.ATK ? TEAM.DEF : TEAM.ATK;
  m.score[winner] += 1;
  m.lossStreak[winner] = 0;
  m.lossStreak[loser] = Math.min(4, m.lossStreak[loser] + 1);

  const lossMoney = Math.min(
    ECONOMY.lossMax,
    ECONOMY.lossBase + ECONOMY.lossStep * (m.lossStreak[loser] - 1),
  );

  for (let i = 0; i < sim.actors.length; i += 1) {
    const a = sim.actors[i];
    if (a.team === winner) {
      a.money = Math.min(ECONOMY.cap, a.money + ECONOMY.winReward);
    } else {
      a.money = Math.min(ECONOMY.cap, a.money + lossMoney);
    }
  }
  if (sim.bomb.state === 'planted' || reason === 'exploded') {
    for (let i = 0; i < sim.actors.length; i += 1) {
      const a = sim.actors[i];
      if (a.team === TEAM.ATK) a.money = Math.min(ECONOMY.cap, a.money + ECONOMY.plantReward);
    }
  }
  if (reason === 'defused') {
    for (let i = 0; i < sim.actors.length; i += 1) {
      const a = sim.actors[i];
      if (a.team === TEAM.DEF) a.money = Math.min(ECONOMY.cap, a.money + ECONOMY.defuseReward);
    }
  }
}

export function endRound(sim, winner, reason) {
  const m = sim.match;
  if (m.phase === 'over') return;
  m.phase = 'over';
  m.clock = MATCH.postRoundTime;
  m.winner = winner;
  m.reason = reason;
  payRound(sim, winner, reason);
  sim.events.push({ type: 'roundEnd', winner, reason });
  if (m.score[winner] >= MATCH.roundsToWin) {
    m.over = true;
    sim.events.push({ type: 'matchEnd', winner });
  }
}

// The charge: a carrier plants it inside a site, defenders cut the fuse.
function tickBomb(sim, dt) {
  const bomb = sim.bomb;
  const input = sim.input;
  const player = sim.player;

  if (bomb.state === 'carried') {
    const carrier = sim.actorsById.get(bomb.carrier);
    if (!carrier || !carrier.alive) {
      const other = sim.actors.find((a) => a.team === TEAM.ATK && a.alive);
      bomb.carrier = other ? other.id : null;
      if (!other) return;
    }
    const holder = sim.actorsById.get(bomb.carrier);
    const site = MAP.sites.find((s) => insideSiteRaw(s, holder.pos.x, holder.pos.z));
    const wantsPlant = holder.isPlayer ? input.plant : holder.ai.state !== 'defuse';
    if (site && wantsPlant) {
      bomb.plantProgress += dt;
      bomb.site = site.id;
      if (bomb.plantProgress >= MATCH.plantTime) {
        bomb.state = 'planted';
        bomb.x = holder.pos.x;
        bomb.y = holder.pos.y;
        bomb.z = holder.pos.z;
        bomb.timer = MATCH.bombTime;
        bomb.plantProgress = 0;
        bomb.carrier = null;
        sim.match.phase = 'live';
        sim.events.push({ type: 'planted', site: site.id, x: bomb.x, y: bomb.y, z: bomb.z });
      }
    } else if (bomb.plantProgress > 0) {
      bomb.plantProgress = Math.max(0, bomb.plantProgress - dt * 1.6);
    }
    void player;
    return;
  }

  if (bomb.state !== 'planted') return;

  bomb.timer -= dt;
  if (bomb.timer <= 0) {
    bomb.state = 'exploded';
    sim.events.push({ type: 'exploded', x: bomb.x, y: bomb.y, z: bomb.z });
    endRound(sim, TEAM.ATK, 'exploded');
    return;
  }

  // Defusing: any defender standing on the charge and holding the key makes progress.
  let defuser = null;
  for (let i = 0; i < sim.actors.length; i += 1) {
    const a = sim.actors[i];
    if (!a.alive || a.team !== TEAM.DEF) continue;
    const d = Math.hypot(a.pos.x - bomb.x, a.pos.z - bomb.z);
    if (d > 1.4) continue;
    const wants = a.isPlayer ? input.defuse : a.ai.state === 'defuse';
    if (wants) {
      defuser = a;
      break;
    }
  }

  if (defuser) {
    if (bomb.defuserId !== defuser.id) {
      bomb.defuserId = defuser.id;
      bomb.defuseProgress = 0;
    }
    bomb.defuseProgress += dt;
    const need = defuser.hasKit ? MATCH.defuseKitTime : MATCH.defuseTime;
    if (bomb.defuseProgress >= need) {
      bomb.state = 'defused';
      sim.events.push({ type: 'defused', x: bomb.x, y: bomb.y, z: bomb.z });
      endRound(sim, TEAM.DEF, 'defused');
    }
  } else {
    bomb.defuserId = null;
    bomb.defuseProgress = Math.max(0, bomb.defuseProgress - dt * 2.2);
  }
}

function insideSiteRaw(site, x, z) {
  const dx = x - site.x;
  const dz = z - site.z;
  return dx * dx + dz * dz <= site.r * site.r;
}

export function tickRound(sim, dt) {
  const m = sim.match;
  if (m.over) return;
  m.clock -= dt;

  if (m.phase === 'freeze') {
    if (m.clock <= 0) {
      m.phase = 'live';
      m.clock = MATCH.roundTime;
      sim.events.push({ type: 'live' });
    }
    return;
  }

  if (m.phase === 'over') {
    if (m.clock <= 0 && !m.over) startRound(sim);
    return;
  }

  tickBomb(sim, dt);

  const atkAlive = aliveCount(sim.actors, TEAM.ATK);
  const defAlive = aliveCount(sim.actors, TEAM.DEF);
  const bomb = sim.bomb;

  if (defAlive === 0) {
    endRound(sim, TEAM.ATK, 'eliminated');
    return;
  }
  if (atkAlive === 0 && bomb.state !== 'planted') {
    endRound(sim, TEAM.DEF, 'eliminated');
    return;
  }
  if (m.clock <= 0 && bomb.state !== 'planted') {
    endRound(sim, TEAM.DEF, 'timeout');
  }
}

export function speedScale(actor, intent) {
  if (!intent) return 1;
  if (actor.crouched) return PHYSICS.crouchSpeed / PHYSICS.walkSpeed;
  if (intent.walk) return PHYSICS.quietSpeed / PHYSICS.walkSpeed;
  return 1;
}