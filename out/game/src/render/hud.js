// The head-up display: health, plate, money, ammunition, the round clock, the score, the kill feed
// and the radar. It reads the simulation and writes the DOM; it never changes the game.

import { MAP } from '../map.js';
import { activeDef } from '../weapons.js';
import { fmtClock } from '../mathx.js';
import { MATCH, TEAM } from '../config.js';
import { teamStatus } from '../game.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    clock: $('clock'),
    phase: $('phase'),
    scoreAtk: $('score-atk'),
    scoreDef: $('score-def'),
    hpFill: $('hp-fill'),
    hpNum: $('hp-num'),
    armorFill: $('armor-fill'),
    armorNum: $('armor-num'),
    money: $('money'),
    kit: $('kit'),
    weaponName: $('weapon-name'),
    mag: $('ammo-mag'),
    reserve: $('ammo-reserve'),
    reload: $('reload-hint'),
    nades: $('nades'),
    feed: $('feed'),
    hitmarker: $('hitmarker'),
    damage: $('damage'),
    flash: $('flash'),
    prompt: $('prompt'),
    banner: $('banner'),
    bannerHead: $('banner-head'),
    bannerSub: $('banner-sub'),
    crosshair: $('crosshair'),
  };

  const radar = $('radar');
  const rctx = radar.getContext('2d');
  const radarBase = document.createElement('canvas');
  radarBase.width = radar.width;
  radarBase.height = radar.height;
  drawRadarBase(radarBase.getContext('2d'), radar.width);

  let hitTimer = 0;
  let damageFlash = 0;
  let bannerTimer = 0;
  const feedRows = [];

  return {
    hitmarker(head) {
      el.hitmarker.classList.add('on');
      el.hitmarker.style.filter = head ? 'drop-shadow(0 0 3px #e9a13b)' : 'none';
      hitTimer = head ? 0.24 : 0.16;
    },
    damage(amount) {
      damageFlash = Math.min(1, damageFlash + amount / 55);
    },
    flash(seconds) {
      el.flash.style.opacity = String(Math.min(0.98, seconds / 3.2));
    },
    banner(head, sub, team) {
      el.bannerHead.textContent = head;
      el.bannerSub.textContent = sub;
      el.banner.className = `on ${team ?? ''}`;
      bannerTimer = 2.6;
    },
    feed(killer, victim, weapon) {
      const row = document.createElement('div');
      row.className = 'row';
      const k = document.createElement('span');
      k.className = killer && killer.team === TEAM.ATK ? 'atk' : 'def';
      k.textContent = killer ? killer.name : 'world';
      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = '▸ ' + weapon.toUpperCase();
      const v = document.createElement('span');
      v.className = victim.team === TEAM.ATK ? 'atk' : 'def';
      v.textContent = victim.name;
      row.append(k, w, v);
      el.feed.prepend(row);
      feedRows.push({ row, life: 5 });
      while (feedRows.length > 5) {
        const old = feedRows.shift();
        old.row.remove();
      }
    },
    update(sim, dt) {
      const p = sim.player;
      const m = sim.match;

      el.hpNum.textContent = String(Math.max(0, Math.round(p.health)));
      el.hpFill.style.width = `${Math.max(0, Math.min(100, p.health))}%`;
      el.hpFill.style.background = p.health < 32 ? '#c9583a' : 'var(--chalk)';
      el.armorNum.textContent = String(Math.round(p.armor));
      el.armorFill.style.width = `${Math.max(0, Math.min(100, p.armor))}%`;
      el.money.textContent = `$${p.money}`;
      el.kit.textContent = p.hasKit ? 'CUT KIT' : '';

      const def = activeDef(p);
      el.weaponName.textContent = def ? def.name : '—';
      const ammo = def ? p.ammo[def.id] ?? { mag: 0, reserve: 0 } : { mag: 0, reserve: 0 };
      el.mag.textContent = String(ammo.mag);
      el.reserve.textContent = `/ ${ammo.reserve}`;
      el.mag.classList.toggle('low', ammo.mag <= Math.max(1, Math.ceil((def?.magSize ?? 10) * 0.25)));
      el.reload.textContent = p.reloadT > 0 ? 'RELOADING' : ammo.mag === 0 ? 'PRESS R' : '';
      const nadeLine = [];
      if (p.nades.shard) nadeLine.push('SHARD');
      if (p.nades.glare) nadeLine.push('GLARE');
      if (p.nades.veil) nadeLine.push('VEIL');
      el.nades.textContent = nadeLine.join(' · ');

      el.scoreAtk.textContent = String(m.score[TEAM.ATK]);
      el.scoreDef.textContent = String(m.score[TEAM.DEF]);
      const planted = sim.bomb.state === 'planted';
      el.clock.textContent = planted ? fmtClock(sim.bomb.timer) : fmtClock(Math.max(0, m.clock));
      el.clock.classList.toggle('alarm', planted || (m.phase === 'live' && m.clock < 15));
      el.phase.textContent = planted
        ? 'CHARGE ARMED'
        : m.phase === 'freeze' ? 'BUY' : m.phase === 'over' ? 'ROUND OVER' : `ROUND ${m.roundNo}`;

      // crosshair grows with the real cone of fire
      const spread = def ? 4 + (p.spreadKick + def.spread) * 420 : 4;
      const gap = Math.min(28, 4 + spread * 0.5);
      el.crosshair.style.setProperty('--gap', `${gap}px`);
      const ticks = el.crosshair.children;
      ticks[0].style.top = `${18 - gap}px`;
      ticks[1].style.bottom = `${18 - gap}px`;
      ticks[2].style.left = `${18 - gap}px`;
      ticks[3].style.right = `${18 - gap}px`;

      el.damage.style.opacity = String(damageFlash * 0.8);
      damageFlash = Math.max(0, damageFlash - dt * 1.6);

      if (hitTimer > 0) {
        hitTimer -= dt;
        if (hitTimer <= 0) el.hitmarker.classList.remove('on');
      }

      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) el.banner.className = '';
      }

      for (let i = feedRows.length - 1; i >= 0; i -= 1) {
        feedRows[i].life -= dt;
        if (feedRows[i].life <= 0) {
          feedRows[i].row.remove();
          feedRows.splice(i, 1);
        }
      }

      // prompts: plant, defuse, buy
      let prompt = '';
      if (p.alive) {
        const bomb = sim.bomb;
        if (bomb.state === 'carried' && bomb.carrier === p.id) {
          const site = MAP.sites.find((s) => Math.hypot(p.pos.x - s.x, p.pos.z - s.z) <= s.r);
          if (site) prompt = `HOLD E — PLANT ON ${site.name} (${Math.round((1 - bomb.plantProgress / MATCH.plantTime) * 100)}%)`;
          else prompt = 'CARRY THE CHARGE TO A SITE';
        }
        if (bomb.state === 'planted' && p.team === TEAM.DEF) {
          const d = Math.hypot(p.pos.x - bomb.x, p.pos.z - bomb.z);
          if (d < 1.6) prompt = 'HOLD E — CUT THE FUSE';
        }
        if (bomb.state === 'planted' && p.team === TEAM.ATK) prompt = 'DEFEND THE CHARGE';
        if (m.phase === 'freeze') prompt = 'B — ARMORY';
      }
      el.prompt.textContent = prompt;
      el.prompt.classList.toggle('on', prompt.length > 0);

      el.flash.style.opacity = String(Math.max(0, Math.min(0.98, p.blind / 2.4)));

      drawRadar(rctx, sim);
    },
  };
}

function drawRadarBase(g, size) {
  const { minX, maxX, minZ, maxZ } = MAP.bounds;
  const sx = size / (maxX - minX);
  const sz = size / (maxZ - minZ);
  g.clearRect(0, 0, size, size);
  g.fillStyle = 'rgba(13,15,17,0.62)';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(120,132,144,0.5)';
  g.lineWidth = 1.5;
  for (let i = 0; i < MAP.solids.length; i += 1) {
    const s = MAP.solids[i];
    if (s.h < 1.0) continue;
    const x = (s.x - s.w / 2 - minX) * sx;
    const y = (s.z - s.d / 2 - minZ) * sz;
    g.strokeRect(x, y, s.w * sx, s.d * sz);
  }
  for (let i = 0; i < MAP.sites.length; i += 1) {
    const site = MAP.sites[i];
    g.strokeStyle = site.id === 'A' ? 'rgba(233,161,59,0.55)' : 'rgba(142,198,255,0.55)';
    g.beginPath();
    g.arc((site.x - minX) * sx, (site.z - minZ) * sz, site.r * sx, 0, Math.PI * 2);
    g.stroke();
  }
}

function drawRadar(g, sim) {
  const size = 336;
  const { minX, maxX, minZ, maxZ } = MAP.bounds;
  const sx = size / (maxX - minX);
  const sz = size / (maxZ - minZ);
  g.clearRect(0, 0, size, size);
  g.drawImage(radarCanvasCache(), 0, 0);
  const p = sim.player;

  g.save();
  g.translate((p.pos.x - minX) * sx, (p.pos.z - minZ) * sz);
  g.rotate(-p.yaw);
  g.fillStyle = 'rgba(233,161,59,0.16)';
  g.beginPath();
  g.moveTo(0, 0);
  g.arc(0, 0, 46, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
  g.closePath();
  g.fill();
  g.restore();

  for (let i = 0; i < sim.actors.length; i += 1) {
    const a = sim.actors[i];
    if (!a.alive) continue;
    if (a.team === TEAM.ATK || a.isPlayer) {
      g.fillStyle = a.isPlayer ? '#ffffff' : '#e07a4a';
    } else {
      const seen = a.id === p.lastDamage.from && sim.time - p.lastDamage.t < 1.4;
      if (!seen) continue;
      g.fillStyle = '#c9583a';
    }
    const x = (a.pos.x - minX) * sx;
    const z = (a.pos.z - minZ) * sz;
    g.beginPath();
    g.arc(x, z, a.isPlayer ? 4 : 3.2, 0, Math.PI * 2);
    g.fill();
  }

  if (sim.bomb.state === 'planted') {
    g.fillStyle = '#ff3b2f';
    g.beginPath();
    g.arc((sim.bomb.x - minX) * sx, (sim.bomb.z - minZ) * sz, 4, 0, Math.PI * 2);
    g.fill();
  }
  void teamStatus;
}

let radarCache = null;
function radarCanvasCache() {
  if (!radarCache) {
    radarCache = document.createElement('canvas');
    radarCache.width = 336;
    radarCache.height = 336;
    drawRadarBase(radarCache.getContext('2d'), 336);
  }
  return radarCache;
}