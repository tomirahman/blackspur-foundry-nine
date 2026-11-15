// Everything that flashes, sparks or smokes. All of it is pooled: the game allocates its effects at
// boot and reuses them, so a firefight never triggers a garbage collection mid-round.

import * as THREE from 'three';

function sparkTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,236,190,1)');
  grad.addColorStop(0.45, 'rgba(233,161,59,0.65)');
  grad.addColorStop(1, 'rgba(233,161,59,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(216,220,224,0.85)');
  grad.addColorStop(0.55, 'rgba(190,196,202,0.45)');
  grad.addColorStop(1, 'rgba(180,186,192,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createEffects(scene) {
  const spark = sparkTexture();
  const puff = puffTexture();

  // tracers
  const tracerCount = 28;
  const tracers = [];
  for (let i = 0; i < tracerCount; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0, max: 0.09 });
  }

  // impact sparks
  const impactCount = 48;
  const impacts = [];
  for (let i = 0; i < impactCount; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ map: spark, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.visible = false;
    scene.add(mesh);
    impacts.push({ mesh, life: 0 });
  }

  // explosions
  const booms = [];
  for (let i = 0; i < 4; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.visible = false;
    scene.add(mesh);
    booms.push({ mesh, life: 0 });
  }

  // smoke volumes, one group per live veil
  const smokeGroups = [];
  const freeSmoke = [];
  const makeSmokeGroup = () => {
    const group = new THREE.Group();
    const sprites = [];
    for (let i = 0; i < 10; i += 1) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puff, transparent: true, opacity: 0, depthWrite: false, color: 0xc8ccd0,
      }));
      group.add(sprite);
      sprites.push(sprite);
    }
    return { group, sprites, life: 0 };
  };

  const nadeMeshes = new Map();
  const nadeGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const nadeMats = {
    shard: new THREE.MeshStandardMaterial({ color: 0x4a5a3c, roughness: 0.7 }),
    glare: new THREE.MeshStandardMaterial({ color: 0xb8b8c0, roughness: 0.5, metalness: 0.4 }),
    veil: new THREE.MeshStandardMaterial({ color: 0x6d7480, roughness: 0.6 }),
  };

  const bombMesh = new THREE.Group();
  const bombBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.18, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.5 }),
  );
  const bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3b2f }),
  );
  bombLight.position.set(0, 0.13, 0);
  bombMesh.add(bombBody, bombLight);
  bombMesh.visible = false;
  scene.add(bombMesh);

  let impactCursor = 0;
  let tracerCursor = 0;
  let boomCursor = 0;

  return {
    tracer(sim, ev) {
      const t = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % tracerCount;
      const len = 3.4;
      const arr = t.line.geometry.attributes.position.array;
      arr[0] = ev.x; arr[1] = ev.y; arr[2] = ev.z;
      arr[3] = ev.x + ev.dx * len; arr[4] = ev.y + ev.dy * len; arr[5] = ev.z + ev.dz * len;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.life = t.max;
      void sim;
    },

    impact(ev) {
      const it = impacts[impactCursor];
      impactCursor = (impactCursor + 1) % impactCount;
      it.mesh.visible = true;
      it.mesh.position.set(ev.x + ev.nx * 0.02, ev.y + ev.ny * 0.02, ev.z + ev.nz * 0.02);
      it.mesh.lookAt(ev.x + ev.nx, ev.y + ev.ny, ev.z + ev.nz);
      it.mesh.material.opacity = 1;
      it.mesh.material.color.setHex(ev.flesh ? 0xff7d6a : 0xffd9a0);
      it.life = ev.flesh ? 0.16 : 0.1;
    },

    boom(x, y, z, radius) {
      const b = booms[boomCursor];
      boomCursor = (boomCursor + 1) % booms.length;
      b.mesh.visible = true;
      b.mesh.position.set(x, y + 0.4, z);
      b.mesh.scale.setScalar(0.5);
      b.mesh.material.opacity = 0.92;
      b.radius = radius;
      b.life = 0.55;
    },

    update(dt, sim) {
      for (let i = 0; i < tracers.length; i += 1) {
        const t = tracers[i];
        if (t.life <= 0) {
          if (t.line.material.opacity !== 0) t.line.material.opacity = 0;
          continue;
        }
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / t.max) * 0.9;
      }

      for (let i = 0; i < impacts.length; i += 1) {
        const it = impacts[i];
        if (it.life <= 0) continue;
        it.life -= dt;
        it.mesh.material.opacity = Math.max(0, it.life / 0.16);
        it.mesh.scale.setScalar(1 + (0.16 - Math.max(0, it.life)) * 2.2);
        if (it.life <= 0) it.mesh.visible = false;
      }

      for (let i = 0; i < booms.length; i += 1) {
        const b = booms[i];
        if (b.life <= 0) continue;
        b.life -= dt;
        const t = 1 - b.life / 0.55;
        b.mesh.scale.setScalar(0.5 + t * b.radius);
        b.mesh.material.opacity = Math.max(0, 1 - t) * 0.9;
        if (b.life <= 0) b.mesh.visible = false;
      }

      // grenade bodies
      for (let i = 0; i < sim.nades.length; i += 1) {
        const n = sim.nades[i];
        let mesh = nadeMeshes.get(i);
        if (!mesh) {
          mesh = new THREE.Mesh(nadeGeo, nadeMats[n.kind] ?? nadeMats.shard);
          scene.add(mesh);
          nadeMeshes.set(i, mesh);
        }
        mesh.visible = true;
        mesh.position.set(n.x, n.y, n.z);
      }
      for (const [i, mesh] of nadeMeshes) {
        if (i >= sim.nades.length) mesh.visible = false;
      }

      // smoke volumes
      while (smokeGroups.length < sim.smokes.length) {
        const g = freeSmoke.pop() ?? makeSmokeGroup();
        g.group.visible = true;
        scene.add(g.group);
        smokeGroups.push(g);
      }
      while (smokeGroups.length > sim.smokes.length) {
        const g = smokeGroups.pop();
        scene.remove(g.group);
        g.group.visible = false;
        freeSmoke.push(g);
      }
      for (let i = 0; i < sim.smokes.length; i += 1) {
        const s = sim.smokes[i];
        const g = smokeGroups[i];
        const grow = Math.min(1, s.age / 1.1);
        for (let k = 0; k < g.sprites.length; k += 1) {
          const sprite = g.sprites[k];
          const a = (k / g.sprites.length) * Math.PI * 2 + s.age * 0.35;
          const r = s.r * 0.62 * grow * (0.6 + (k % 3) * 0.22);
          sprite.position.set(
            s.x + Math.cos(a) * r,
            s.y + Math.sin(k * 1.7 + s.age * 0.6) * 0.5,
            s.z + Math.sin(a) * r,
          );
          sprite.scale.setScalar(s.r * (1.35 + (k % 4) * 0.2) * grow);
          sprite.material.opacity = Math.min(0.62, (0.62 * grow) * Math.min(1, s.life / 1.4));
        }
      }

      // the charge
      if (sim.bomb.state === 'planted') {
        bombMesh.visible = true;
        bombMesh.position.set(sim.bomb.x, sim.bomb.y + 0.1, sim.bomb.z);
        const blink = (Math.sin(sim.time * 14) + 1) * 0.5;
        bombLight.material.color.setRGB(1, 0.2 + blink * 0.5, 0.18);
      } else {
        bombMesh.visible = false;
      }
    },
  };
}