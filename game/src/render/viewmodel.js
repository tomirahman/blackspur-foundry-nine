// The first-person weapon and the hands that hold it. It hangs off the camera, kicks with recoil,
// sways with the mouse and tips away to reload, so the hands read as part of the world rather than
// an overlay. One builder covers every weapon: the proportions change, the parts do not.

import * as THREE from 'three';
import { activeDef } from '../weapons.js';

const STEEL = 0x33393f;
const POLY = 0x272c32;
const FURNITURE = 0x6f5232;
const GLOVE = 0x23282d;
const SLEEVE = 0x4a4034;

function part(w, h, d, colour, metalness = 0.45, roughness = 0.6) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: colour, roughness, metalness }),
  );
}

function limb(w, h, d, colour) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9, metalness: 0.05 }),
  );
}

const SHAPES = {
  pistol: { receiver: 0.24, barrel: 0.14, stock: false, mag: 0.13, scope: false },
  smg: { receiver: 0.42, barrel: 0.24, stock: true, mag: 0.2, scope: false },
  rifle: { receiver: 0.58, barrel: 0.36, stock: true, mag: 0.22, scope: false },
  sniper: { receiver: 0.7, barrel: 0.62, stock: true, mag: 0.16, scope: true },
  shotgun: { receiver: 0.5, barrel: 0.46, stock: true, mag: 0, scope: false },
};

function buildModel(kind) {
  const shape = SHAPES[kind] ?? SHAPES.rifle;
  const g = new THREE.Group();

  const receiver = part(0.078, 0.105, shape.receiver, STEEL);
  g.add(receiver);

  const barrel = part(0.032, 0.032, shape.barrel, POLY, 0.6, 0.45);
  barrel.position.set(0, 0.014, -(shape.receiver / 2 + shape.barrel / 2));
  g.add(barrel);

  const muzzleRing = part(0.044, 0.044, 0.035, POLY, 0.7, 0.4);
  muzzleRing.position.set(0, 0.014, -(shape.receiver / 2 + shape.barrel + 0.01));
  g.add(muzzleRing);

  // rear sight and front post: the silhouette a player actually aims with
  const rear = part(0.05, 0.022, 0.02, STEEL);
  rear.position.set(0, 0.064, -0.06);
  g.add(rear);
  const post = part(0.008, 0.026, 0.008, 0xe9a13b);
  post.position.set(0, 0.062, -(shape.receiver / 2 + 0.06));
  g.add(post);

  if (shape.stock) {
    const stock = part(0.058, 0.088, 0.24, FURNITURE, 0.1, 0.75);
    stock.position.set(0, -0.012, shape.receiver / 2 + 0.11);
    g.add(stock);
    const cheek = part(0.05, 0.03, 0.12, FURNITURE, 0.1, 0.75);
    cheek.position.set(0, 0.04, shape.receiver / 2 + 0.06);
    g.add(cheek);
  }

  const grip = part(0.05, 0.14, 0.062, FURNITURE, 0.1, 0.8);
  grip.position.set(0, -0.105, 0.045);
  grip.rotation.x = 0.26;
  g.add(grip);

  if (shape.mag > 0) {
    const mag = part(0.042, shape.mag, 0.075, POLY);
    mag.position.set(0, -0.105 - shape.mag * 0.18, -0.02);
    mag.rotation.x = -0.08;
    g.add(mag);
  }

  if (shape.scope) {
    const scope = part(0.048, 0.048, 0.26, POLY, 0.5, 0.5);
    scope.position.set(0, 0.085, -0.02);
    g.add(scope);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.021, 12),
      new THREE.MeshBasicMaterial({ color: 0x7fd4ff }),
    );
    lens.position.set(0, 0.085, -0.152);
    lens.rotation.y = Math.PI;
    g.add(lens);
  }

  if (kind === 'shotgun') {
    const pump = part(0.056, 0.056, 0.18, FURNITURE, 0.1, 0.8);
    pump.position.set(0, -0.038, -(shape.receiver / 2 + 0.16));
    g.add(pump);
  }

  // hands: a palm on the grip and a support hand under the handguard
  const rightPalm = limb(0.07, 0.09, 0.1, GLOVE);
  rightPalm.position.set(0.005, -0.115, 0.055);
  rightPalm.rotation.x = 0.26;
  g.add(rightPalm);
  const rightSleeve = limb(0.085, 0.085, 0.34, SLEEVE);
  rightSleeve.position.set(0.03, -0.17, 0.25);
  rightSleeve.rotation.set(0.36, -0.1, 0.06);
  g.add(rightSleeve);

  const leftPalm = limb(0.08, 0.075, 0.12, GLOVE);
  leftPalm.position.set(-0.02, -0.055, -(shape.receiver / 2 + 0.06));
  g.add(leftPalm);
  const leftSleeve = limb(0.085, 0.085, 0.36, SLEEVE);
  leftSleeve.position.set(-0.13, -0.15, -(shape.receiver / 2 - 0.06));
  leftSleeve.rotation.set(0.15, 0.62, 0.2);
  g.add(leftSleeve);

  return g;
}

export function createViewmodel(camera) {
  const holder = new THREE.Group();
  camera.add(holder);

  // A short-range fill light keeps the weapon readable against dark walls without lighting the
    // map, and a cool rim from behind separates its silhouette from whatever it points at.
  const fill = new THREE.PointLight(0xe4ecf5, 2.6, 2.6, 2);
  fill.position.set(0.26, 0.06, 0.06);
  camera.add(fill);
  const rim = new THREE.PointLight(0x9fd0ff, 1.4, 2.2, 2);
  rim.position.set(-0.22, 0.16, -0.62);
  camera.add(rim);

  const models = new Map();
  for (const kind of Object.keys(SHAPES)) {
    const model = buildModel(kind);
    model.visible = false;
    models.set(kind, model);
    holder.add(model);
  }

  const muzzle = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.13),
    new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  holder.add(muzzle);
  const flashLight = new THREE.PointLight(0xffc07a, 0, 6, 2);
  holder.add(flashLight);

  const state = { swayX: 0, swayY: 0, kick: 0, kickYaw: 0, flash: 0, bob: 0 };
  const base = new THREE.Vector3(0.155, -0.155, -0.46);

  return {
    holder,
    state,
    show(kind) {
      for (const [key, model] of models) model.visible = key === kind;
      const shape = SHAPES[kind] ?? SHAPES.rifle;
      muzzle.position.set(0, 0.014, -(shape.receiver / 2 + shape.barrel + 0.06));
      flashLight.position.copy(muzzle.position);
    },
    flash(strength = 1) {
      state.flash = Math.min(1.4, state.flash + strength);
    },
    kick(amount, yaw) {
      state.kick = Math.min(0.13, state.kick + amount);
      state.kickYaw += yaw;
    },
    update(dt, actor, mouseDelta) {
      state.swayX += (-mouseDelta.x * 0.0015 - state.swayX) * Math.min(1, dt * 11);
      state.swayY += (mouseDelta.y * 0.0013 - state.swayY) * Math.min(1, dt * 11);
      state.kick *= Math.exp(-12 * dt);
      state.kickYaw *= Math.exp(-9 * dt);
      state.flash = Math.max(0, state.flash - dt * 9);

      const speed = Math.hypot(actor.vel.x, actor.vel.z);
      state.bob += dt * (2.4 + speed * 1.5);
      const bobX = Math.sin(state.bob) * 0.007 * Math.min(1, speed / 6);
      const bobY = Math.abs(Math.cos(state.bob)) * 0.007 * Math.min(1, speed / 6);

      const def = activeDef(actor);
      const reloading = actor.reloadT > 0 && def ? 1 - actor.reloadT / def.reloadTime : 0;
      const dip = reloading > 0 ? Math.sin(Math.min(1, reloading) * Math.PI) * 0.24 : 0;

      holder.position.set(
        base.x + state.swayX * 0.55 + bobX,
        base.y + state.swayY * 0.45 + bobY - dip,
        base.z + state.kick * 1.6,
      );
      holder.rotation.set(
        state.kick * 1.4 + dip * 0.9,
        state.swayX * 1.1 + state.kickYaw * 0.7,
        state.swayX * 1.5 + dip * 0.5,
      );

      muzzle.material.opacity = Math.min(0.72, state.flash);
      muzzle.scale.setScalar(0.75 + state.flash * 0.5);
      flashLight.intensity = state.flash * 2.2;
    },
  };
}