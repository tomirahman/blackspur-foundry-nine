// Development hooks, loaded only when the page is opened with ?dev. A headless browser uses them to
// play-test the game and take the screenshots in screenshots/ from this same code.

import { MATCH, TEAM, WEAPONS } from './config.js';
import { buyWeapon, ensureAmmo, throwNade } from './weapons.js';
import { viewDirection } from './mathx.js';

export function installDev(ctx) {
  const { sim, audio, begin } = ctx;
  const p = sim.player;
  const aim = () => viewDirection(p.yaw + p.recoil.yaw, p.pitch + p.recoil.pitch, { x: 0, y: 0, z: 0 });

  window.__blk = {
    sim,
    play() { begin(); },
    live() { sim.match.phase = 'live'; sim.match.clock = MATCH.roundTime; begin(); },
    freeze() { sim.match.phase = 'freeze'; sim.match.clock = MATCH.freezeTime; },
    hideStart() { document.getElementById('start').classList.add('off'); },
    hideBanner() { const b = document.getElementById('banner'); if (b) b.className = ''; },
    armory() { ctx.buy?.open(); },
    aim(yaw, pitch) { p.yaw = yaw; p.pitch = pitch; ctx.input.state.yaw = yaw; ctx.input.state.pitch = pitch; },
    warp(x, z, y = 0) { p.pos.x = x; p.pos.z = z; p.pos.y = y; p.vel.x = 0; p.vel.y = 0; p.vel.z = 0; },
    give(id) {
      const def = WEAPONS[id];
      if (!def) return;
      if (def.kind === 'pistol') { p.weapons.secondary = id; p.slot = 'secondary'; }
      else { p.weapons.primary = id; p.slot = 'primary'; }
      const ammo = ensureAmmo(p, id);
      ammo.mag = def.magSize;
      ammo.reserve = def.reserve;
    },
    money(n) { p.money = n; },
    armor(n = 100) { p.armor = n; p.helmet = true; },
    health(n) { p.health = n; },
    botAt(name, x, z) {
      const b = sim.actors.find((a) => a.name === name);
      if (b) { b.pos.x = x; b.pos.z = z; b.pos.y = 0; }
    },
    // Disarms the bots so a posed screenshot is not a firefight, and holds them where they are put.
    calm() {
      for (const a of sim.actors) {
        if (a.isPlayer) continue;
        a.weapons.primary = null;
        a.weapons.secondary = null;
        a.nades.shard = 0;
        a.nades.glare = 0;
        a.nades.veil = 0;
      }
    },
    spray(count = 8, gapMs = 40) {
      let left = count;
      const tick = setInterval(() => {
        p.fireCd = 0;
        ctx.fireOnce(aim());
        left -= 1;
        if (left <= 0) clearInterval(tick);
      }, gapMs);
    },
    nade(kind = 'shard') { throwNade(sim, p, kind, viewDirection(p.yaw, p.pitch + 0.2, { x: 0, y: 0, z: 0 })); },
    plant() {
      sim.bomb.state = 'planted';
      sim.bomb.x = p.pos.x;
      sim.bomb.y = p.pos.y;
      sim.bomb.z = p.pos.z;
      sim.bomb.timer = MATCH.bombTime;
      sim.match.phase = 'live';
      audio.planted();
    },
    buy(id) { return buyWeapon(p, id, WEAPONS[id]?.price ?? 0); },
    score() { return { atk: sim.match.score[TEAM.ATK], def: sim.match.score[TEAM.DEF], phase: sim.match.phase }; },
  };
}