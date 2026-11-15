// The three.js side of the game: one renderer, one camera, a dusk lighting rig and a resize hook.
// Nothing in this file knows about the simulation.

import * as THREE from 'three';
import { MAP } from '../map.js';

// A vertical gradient rather than a flat colour: the foundry sits under a dusk sky, and the eye
// reads depth from that band even where the walls leave it visible.
function skyGradient() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2b3a4c');
  grad.addColorStop(0.45, '#1d2733');
  grad.addColorStop(1, '#0d1114');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A cheap volume of light under each lamp. It is two cones, not a shadow-casting material, so it
// costs nothing and still puts a shaft in the air.
function addLightShaft(scene, lamp) {
  const height = lamp.y - 0.2;
  const radius = Math.min(6.5, height * 0.92);
  const geo = new THREE.ConeGeometry(radius, height, 14, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: lamp.color,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
  });
  const cone = new THREE.Mesh(geo, mat);
  cone.position.set(lamp.x, height / 2, lamp.z);
  scene.add(cone);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.42, height * 0.9, 12, 1, true), mat.clone());
  inner.material.opacity = 0.05;
  inner.position.copy(cone.position);
  scene.add(inner);
}

export function createScene(host) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = skyGradient();
  scene.fog = new THREE.Fog(MAP.fog.color, MAP.fog.near, MAP.fog.far);

  const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.04, 220);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight(0xbcd2e6, 0x3a2f26, 1.35);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0x8fa2b4, 0.35));

  const key = new THREE.DirectionalLight(0xffe0bb, 2.15);
  key.position.set(26, 42, 18);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 130;
  key.shadow.camera.left = -46;
  key.shadow.camera.right = 46;
  key.shadow.camera.top = 46;
  key.shadow.camera.bottom = -46;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.03;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x6ea8ff, 0.55);
  rim.position.set(-22, 16, -30);
  scene.add(rim);

  for (let i = 0; i < MAP.lamps.length; i += 1) {
    const lamp = MAP.lamps[i];
    const light = new THREE.PointLight(lamp.color, lamp.intensity * 2.1, lamp.distance, 1.85);
    light.position.set(lamp.x, lamp.y, lamp.z);
    scene.add(light);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      new THREE.MeshBasicMaterial({ color: lamp.color }),
    );
    bulb.position.set(lamp.x, lamp.y + 0.24, lamp.z);
    scene.add(bulb);
    addLightShaft(scene, lamp);
  }

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, resize, key };
}