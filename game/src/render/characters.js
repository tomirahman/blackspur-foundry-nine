// Bodies for the bots. Each one is a small rig of boxes so the silhouette reads at range: rust for
// Vanguard, slate for Sentinel, with a lit visor so a headshot target is obvious.

import * as THREE from 'three';

const TEAM_COLOUR = { atk: 0xd4692f, def: 0x2f7f86 };

function part(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function createCharacterRig(actor) {
  const group = new THREE.Group();
  // A dark body with the team's own colour only on the markers: at range a figure has to read as a
  // person against tan crates, and a body painted in the accent colour reads as another crate.
  const body = new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.78, metalness: 0.16 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.85, metalness: 0.1 });
  const visor = new THREE.MeshBasicMaterial({ color: TEAM_COLOUR[actor.team] });

  const torso = part(new THREE.BoxGeometry(0.52, 0.62, 0.3), body, 0, 1.16, 0);
  const hips = part(new THREE.BoxGeometry(0.44, 0.24, 0.28), dark, 0, 0.82, 0);
  const head = part(new THREE.BoxGeometry(0.26, 0.26, 0.26), body, 0, 1.62, 0);
  const face = part(new THREE.BoxGeometry(0.2, 0.07, 0.03), visor, 0, 1.63, -0.14);
  const armL = part(new THREE.BoxGeometry(0.14, 0.5, 0.14), dark, -0.32, 1.18, 0);
  const armR = part(new THREE.BoxGeometry(0.14, 0.5, 0.14), dark, 0.32, 1.18, 0);
  const legL = part(new THREE.BoxGeometry(0.17, 0.78, 0.18), dark, -0.13, 0.4, 0);
  const legR = part(new THREE.BoxGeometry(0.17, 0.78, 0.18), dark, 0.13, 0.4, 0);
  // A lit stripe across the chest: at range this is what tells the two sides apart, and it reads
  // even when the body is in shadow.
  const stripe = part(new THREE.BoxGeometry(0.46, 0.06, 0.02), visor, 0, 1.34, -0.155);
  const shoulder = part(new THREE.BoxGeometry(0.06, 0.06, 0.2), visor, 0, 1.46, 0);

  const gun = new THREE.Group();
  const receiver = part(new THREE.BoxGeometry(0.08, 0.1, 0.52), new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.6, metalness: 0.5 }), 0, 0, 0);
  const barrel = part(new THREE.BoxGeometry(0.04, 0.04, 0.34), new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.5, metalness: 0.6 }), 0, 0.01, -0.4);
  gun.add(receiver);
  gun.add(barrel);
  gun.position.set(0.3, 1.1, -0.24);

  group.add(torso, hips, head, face, armL, armR, legL, legR, gun, stripe, shoulder);
  group.userData.parts = { torso, hips, head, face, armL, armR, legL, legR, gun, body, stripe, shoulder };
  return group;
}

// Reads the actor and poses the rig. No allocation: every value lands on existing objects.
export function poseCharacter(rig, actor) {
  const parts = rig.userData.parts;
  rig.position.set(actor.pos.x, actor.pos.y, actor.pos.z);
  rig.rotation.y = actor.yaw;

  const crouch = actor.crouched ? 0.72 : 1;
  parts.torso.position.y = 1.16 * crouch;
  parts.hips.position.y = 0.82 * crouch;
  parts.head.position.y = 1.62 * crouch;
  parts.face.position.y = 1.63 * crouch;
  parts.armL.position.y = 1.18 * crouch;
  parts.armR.position.y = 1.18 * crouch;
  parts.gun.position.y = 1.1 * crouch;
  parts.stripe.position.y = 1.34 * crouch;
  parts.shoulder.position.y = 1.46 * crouch;

  const speed = Math.hypot(actor.vel.x, actor.vel.z);
  const swing = Math.sin(actor.bobPhase * 2.2) * Math.min(speed * 0.12, 0.5);
  parts.legL.rotation.x = swing;
  parts.legR.rotation.x = -swing;
  parts.legL.position.z = swing * 0.1;
  parts.legR.position.z = -swing * 0.1;

  // The weapon points where the bot is aiming, which is also where its bullets go.
  parts.gun.rotation.x = -actor.pitch * 0.9;
  parts.armR.rotation.x = -0.4 - actor.pitch * 0.4;

  parts.face.material.color.setHex(TEAM_COLOUR[actor.team]);
}

export function setCharacterHidden(rig, hidden) {
  rig.visible = !hidden;
}