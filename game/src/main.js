// Boot and the frame loop. This is the only file that owns a clock: everything below it runs on the
// simulation's fixed step, so physics, recoil and bot timing do not change with frame rate.

import * as THREE from 'three';
import { createScene } from './render/scene.js';
import { buildLevel } from './render/level.js';
import { createEffects } from './render/effects.js';
import { createViewmodel } from './render/viewmodel.js';
import { createHud } from './render/hud.js';
import { createCharacterRig, poseCharacter } from './render/characters.js';
import { createAudio } from './audio.js';
import { createSimulation, stepSimulation } from './game.js';
import { createInput } from './input.js';
import { createBuyMenu } from './ui/buy.js';
import {
  fireWeapon, switchSlot, throwNade, startReload, activeDef,
} from './weapons.js';
import { SIM, TEAM } from './config.js';
import { viewDirection } from './mathx.js';

const host = document.getElementById('viewport');
const startEl = document.getElementById('start');
const startBtn = document.getElementById('start-btn');

const view = createScene(host);
const { renderer, scene, camera } = view;
scene.add(camera);
buildLevel(scene);

const effects = createEffects(scene);
const viewmodel = createViewmodel(camera);
const hud = createHud();
const audio = createAudio();
const input = createInput(renderer.domElement);
const sim = createSimulation(20261115);
const buy = createBuyMenu();
buy.setSimulation(sim);

const rigs = new Map();
for (let i = 0; i < sim.actors.length; i += 1) {
  const a = sim.actors[i];
  if (a.isPlayer) continue;
  const rig = createCharacterRig(a);
  scene.add(rig);
  rigs.set(a.id, rig);
}

let running = false;
let lastTime = 0;
let accumulator = 0;
const aimDir = { x: 0, y: 0, z: 0 };
const mouseDelta = { x: 0, y: 0 };
let deathTilt = 0;

// Every camera-visible consequence of a simulation event lands here, once per frame.
function consumeEvents(events) {
  const p = sim.player;
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    switch (ev.type) {
      case 'shot': {
        const d = Math.hypot(ev.x - p.pos.x, ev.y - p.pos.y, ev.z - p.pos.z);
        if (d < 46) audio.shot(ev.sound);
        if (ev.actor && ev.actor.isPlayer) {
          viewmodel.flash(0.9);
          viewmodel.kick(0.02 + (ev.weaponId === 'longspur' ? 0.05 : 0.01), (Math.random() - 0.5) * 0.01);
        } else {
          effects.tracer(sim, ev);
        }
        break;
      }
      case 'impact': effects.impact(ev); break;
      case 'damage':
        if (ev.target && ev.target.isPlayer) {
          hud.damage(ev.amount);
          audio.hurt();
        }
        break;
      case 'hitmark':
        hud.hitmarker(ev.head);
        if (ev.killer === p.id) (ev.head ? audio.headshot() : audio.hit)();
        break;
      case 'kill':
        hud.feed(ev.attacker, ev.victim, ev.weaponId);
        if (ev.attacker && ev.attacker.isPlayer) audio.kill();
        break;
      case 'roundStart':
        hud.banner(`ROUND ${ev.roundNo}`, sim.match.score[TEAM.ATK] + ' — ' + sim.match.score[TEAM.DEF], '');
        audio.roundStart();
        buy.close();
        break;
      case 'roundEnd': {
        const won = ev.winner === sim.player.team;
        const label = ev.reason === 'exploded' ? 'CHARGE DETONATED'
          : ev.reason === 'defused' ? 'FUSE CUT'
            : ev.reason === 'timeout' ? 'TIME OUT' : 'TEAM ELIMINATED';
        hud.banner(won ? 'ROUND WON' : 'ROUND LOST', `${label} · ${ev.winner === TEAM.ATK ? 'VANGUARD' : 'SENTINEL'}`, won ? 'atk' : 'def');
        audio.roundEnd(won);
        break;
      }
      case 'matchEnd':
        hud.banner(ev.winner === sim.player.team ? 'RUN TAKEN' : 'RUN LOST', `${sim.match.score[TEAM.ATK]} — ${sim.match.score[TEAM.DEF]}`, ev.winner === TEAM.ATK ? 'atk' : 'def');
        break;
      case 'planted':
        audio.planted();
        hud.banner('CHARGE ARMED', `SITE ${ev.site}`, 'atk');
        break;
      case 'defused':
        audio.defused();
        break;
      case 'exploded':
        audio.explode();
        effects.boom(ev.x, ev.y, ev.z, 8);
        hud.flash(0.9);
        break;
      case 'detonate':
        audio.nade(ev.kind);
        effects.boom(ev.x, ev.y, ev.z, ev.radius * 0.5);
        break;
      case 'step': {
        const d = Math.hypot(ev.actor.pos.x - p.pos.x, ev.actor.pos.z - p.pos.z);
        if (d < 26) audio.step(ev.quiet);
        break;
      }
      case 'reload':
        if (ev.actor.isPlayer) audio.reload();
        break;
      case 'flashed':
        hud.flash(ev.amount);
        break;
      case 'nadeThrow':
        if (ev.actor.isPlayer) audio.beep();
        break;
      case 'live':
        buy.close();
        break;
      default: break;
    }
  }
}

function playerAim() {
  const p = sim.player;
  return viewDirection(p.yaw + p.recoil.yaw, p.pitch + p.recoil.pitch, aimDir);
}

function stepOnce(dt) {
  const intent = {
    forward: input.state.forward,
    right: input.state.right,
    jump: input.state.jump,
    crouch: input.state.crouch,
    walk: input.state.walk,
    yaw: input.state.yaw,
    pitch: input.state.pitch,
  };
  stepSimulation(sim, intent, dt);

  const p = sim.player;
  if (p.alive && sim.match.phase !== 'freeze') {
    if (input.state.fire) fireWeapon(sim, p, playerAim());
    if (input.state.reload) startReload(p, sim.events);
  }
}

function syncCamera(dt) {
  const p = sim.player;
  const eye = p.alive ? p.eye : 0.42;
  camera.position.set(p.pos.x, p.pos.y + eye, p.pos.z);
  camera.rotation.y = p.yaw + p.recoil.yaw;
  if (p.alive) {
    camera.rotation.x = p.pitch + p.recoil.pitch;
    deathTilt = 0;
  } else {
    deathTilt = Math.min(1, deathTilt + dt * 2.2);
    camera.rotation.x = -0.6 * deathTilt;
    camera.rotation.z = 0.5 * deathTilt;
  }

  for (let i = 0; i < sim.actors.length; i += 1) {
    const a = sim.actors[i];
    const rig = rigs.get(a.id);
    if (!rig) continue;
    rig.visible = a.alive;
    if (a.alive) poseCharacter(rig, a, sim.time);
  }

  const def = activeDef(p);
  viewmodel.show(def ? def.kind : 'pistol');
  viewmodel.update(dt, p, mouseDelta);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!running) return;
  const dt = Math.min(0.09, (now - lastTime) / 1000 || 0);
  lastTime = now;

  mouseDelta.x = input.state.mouseDX;
  mouseDelta.y = input.state.mouseDY;
  input.sample(dt);

  accumulator += dt;
  let steps = 0;
  while (accumulator >= SIM.dt && steps < SIM.maxSteps) {
    stepOnce(SIM.dt);
    accumulator -= SIM.dt;
    steps += 1;
  }
  if (steps === SIM.maxSteps) accumulator = 0;

  const events = sim.drainEvents();
  consumeEvents(events);

  effects.update(dt, sim);
  syncCamera(dt);
  hud.update(sim, dt);

  if (sim.match.phase === 'freeze') buy.refresh();

  if (!window.__blkSkipRender) renderer.render(scene, camera);
}

function begin() {
  if (running) return;
  running = true;
  startEl.classList.add('off');
  audio.resume();
  input.lock();
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

startBtn.addEventListener('click', begin);
renderer.domElement.addEventListener('click', () => {
  if (running && !input.state.locked) input.lock();
});
document.addEventListener('pointerlockchange', () => {
  if (running && !input.state.locked && document.pointerLockElement !== renderer.domElement) {
    buy.close();
  }
});

input.on('buy', () => {
  if (!running) return;
  buy.toggle();
});
input.on('slot', (slot) => {
  const p = sim.player;
  if (!p.alive) return;
  if (slot === 'last') {
    switchSlot(p, p.slot === 'primary' ? 'secondary' : 'primary', sim.events);
  } else {
    switchSlot(p, slot, sim.events);
  }
});
input.on('nade', (kind) => {
  const p = sim.player;
  if (!p.alive || !p.nades[kind]) return;
  throwNade(sim, p, kind, playerAim());
});

requestAnimationFrame(frame);

// A development hook for headless play-tests and screenshots. It only exists when the page is opened
// with ?dev, so the shipped game has no automation surface.
if (new URLSearchParams(window.location.search).has('dev')) {
  const { installDev } = await import('./dev.js');
  installDev({
    sim,
    camera,
    renderer,
    scene,
    viewmodel,
    hud,
    audio,
    buy,
    begin,
    input,
    fireOnce: (dir) => fireWeapon(sim, sim.player, dir),
  });
}