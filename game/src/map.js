// Foundry Nine: an original plant. Two sites at the north end, three ways in from a southern
// spawn, one central hall splitting the middle. Coordinates are metres; +z is the attackers' side.
//
// The layout is built from axis-aligned blocks so collision, sightlines and the navigation grid
// are all derived from the same numbers rather than hand-drawn twice.

const box = (x, z, w, d, h, y, mat) => ({ x, z, w, d, h, y, mat });

export const MAP = {
  name: 'Foundry Nine',
  subtitle: 'Crucible · Coolant',
  bounds: { minX: -34, maxX: 34, minZ: -34, maxZ: 34 },
  sky: 0x4d6285,
  fog: { color: 0x7a5a4a, near: 16, far: 66 },

  spawns: {
    atk: [
      { x: -3.2, z: 27.0 }, { x: 0, z: 25.4 }, { x: 3.2, z: 27.0 },
      { x: -5.6, z: 29.2 }, { x: 5.6, z: 29.2 },
    ],
    def: [
      { x: -3.2, z: -27.0 }, { x: 0, z: -25.4 }, { x: 3.2, z: -27.0 },
      { x: -5.6, z: -29.2 }, { x: 5.6, z: -29.2 },
    ],
  },

  sites: [
    { id: 'A', name: 'CRUCIBLE', x: 21.5, z: -21.0, r: 6.4 },
    { id: 'B', name: 'COOLANT', x: -21.5, z: -21.0, r: 6.4 },
  ],

  solids: [
    // outer shell
    box(0, 33.5, 70, 3, 11, 0, 'wall'),
    box(0, -33.5, 70, 3, 11, 0, 'wall'),
    box(33.5, 0, 3, 70, 11, 0, 'wall'),
    box(-33.5, 0, 3, 70, 11, 0, 'wall'),

    // service bays closed off behind the lanes, so the only way north is a lane and not the wall
    box(28.5, 6, 8, 40, 9, 0, 'hall'),
    box(-28.5, 6, 8, 40, 9, 0, 'hall'),

    // the central hall: a solid block the lanes run around
    box(0, -6, 22, 14, 8.5, 0, 'hall'),

    // hall flanks: narrow the two bypasses to seven metres
    box(-14, -8, 6, 10, 7, 0, 'wall'),
    box(14, -8, 6, 10, 7, 0, 'wall'),

    // spawn throats
    box(-11.5, 26, 3, 10, 6.5, 0, 'wall'),
    box(11.5, 26, 3, 10, 6.5, 0, 'wall'),

    // lane dividers, with a doorway at z 12..16 on each side
    box(12, 19, 2, 6, 6.5, 0, 'wall'),
    box(12, 9, 2, 6, 6.5, 0, 'wall'),
    box(-12, 19, 2, 6, 6.5, 0, 'wall'),
    box(-12, 9, 2, 6, 6.5, 0, 'wall'),

    // north blocks: keep the defender run out of the sites' sightlines
    box(-11, -17.5, 8, 5, 7.5, 0, 'wall'),
    box(11, -17.5, 8, 5, 7.5, 0, 'wall'),

    // defender spawn shoulders
    box(-9, -27, 4, 6, 7, 0, 'wall'),
    box(9, -27, 4, 6, 7, 0, 'wall'),

    // site fronts, a door left at x 21..24 (and mirrored)
    box(18, -14, 6, 2, 5.5, 0, 'rust'),
    box(26, -14, 4, 2, 5.5, 0, 'rust'),
    box(-18, -14, 6, 2, 5.5, 0, 'rust'),
    box(-26, -14, 4, 2, 5.5, 0, 'rust'),

    // yard cover
    box(-6, 3, 2.6, 2.6, 2.6, 0, 'crate'),
    box(5, 4, 2.6, 2.6, 2.6, 0, 'crate'),
    box(0, 12.6, 9, 1.2, 1.5, 0, 'rust'),
    box(2.9, 9.2, 1.5, 1.5, 2.2, 0, 'crate'),
    box(-3.4, 17.2, 1.5, 1.5, 2.2, 0, 'crate'),

    // east lane
    box(20, 18, 4, 8, 3.2, 0, 'container'),
    box(15.2, 6.4, 3, 6, 3.2, 0, 'container'),
    box(22.2, 8.2, 3.4, 3.4, 2.4, 0, 'crate'),
    box(18.4, 0.4, 3, 3, 2.4, 0, 'crate'),

    // west lane
    box(-20, 18, 4, 8, 3.2, 0, 'container'),
    box(-15.2, 6.4, 3, 6, 3.2, 0, 'container'),
    box(-22.2, 8.2, 3.4, 3.4, 2.4, 0, 'crate'),
    box(-18.4, 0.4, 3, 3, 2.4, 0, 'crate'),

    // site A cover
    box(20.2, -20.4, 2.4, 2.4, 2.4, 0, 'crate'),
    box(24.4, -24.2, 2.4, 2.4, 2.4, 0, 'crate'),
    box(26.2, -18.2, 1.8, 3.4, 1.4, 0, 'rust'),
    box(17.4, -25.4, 3, 3, 3.4, 0, 'tank'),
    box(24.0, -16.6, 4.4, 1.4, 1.2, 0, 'low'),

    // site B cover
    box(-20.2, -20.4, 2.4, 2.4, 2.4, 0, 'crate'),
    box(-24.4, -24.2, 2.4, 2.4, 2.4, 0, 'crate'),
    box(-26.2, -18.2, 1.8, 3.4, 1.4, 0, 'rust'),
    box(-17.4, -25.4, 3, 3, 3.4, 0, 'tank'),
    box(-24.0, -16.6, 4.4, 1.4, 1.2, 0, 'low'),

    // a raised deck at each site, reachable by the crate stairs beside it
    box(28.0, -28.0, 8, 8, 1.1, 0, 'deck'),
    box(-28.0, -28.0, 8, 8, 1.1, 0, 'deck'),
    box(25.6, -27.0, 2.2, 2.2, 0.55, 0, 'crate'),
    box(-25.6, -27.0, 2.2, 2.2, 0.55, 0, 'crate'),
  ],

  // Purely visual: pipes, lamps, hanging cable trays. No collision.
  decor: [
    { kind: 'pipe', x: 0, z: 30.5, y: 6.4, len: 60, axis: 'x', r: 0.22 },
    { kind: 'pipe', x: -30.5, z: 0, y: 5.6, len: 58, axis: 'z', r: 0.18 },
    { kind: 'pipe', x: 30.5, z: 0, y: 5.6, len: 58, axis: 'z', r: 0.18 },
    { kind: 'pipe', x: 0, z: -13.5, y: 8.2, len: 56, axis: 'x', r: 0.26 },
    { kind: 'pipe', x: 15.5, z: -30, y: 4.2, len: 12, axis: 'x', r: 0.14 },
    { kind: 'pipe', x: -15.5, z: -30, y: 4.2, len: 12, axis: 'x', r: 0.14 },
  ],

  lamps: [
    { x: 0, z: 26, y: 7.4, color: 0xffb774, intensity: 26, distance: 26 },
    { x: 0, z: -26, y: 7.4, color: 0xbcd2ff, intensity: 26, distance: 26 },
    { x: 0, z: 10, y: 6.6, color: 0xffc98a, intensity: 30, distance: 30 },
    { x: 21.5, z: -21, y: 6.2, color: 0xff8f5a, intensity: 34, distance: 26 },
    { x: -21.5, z: -21, y: 6.2, color: 0x9fd0ff, intensity: 34, distance: 26 },
    { x: 19, z: 6, y: 6.2, color: 0xffd0a0, intensity: 22, distance: 24 },
    { x: -19, z: 6, y: 6.2, color: 0xffd0a0, intensity: 22, distance: 24 },
  ],

  // Where a bot may choose to sit when it is holding. `site` ties a spot to an objective.
  holds: {
    atkPostPlant: [
      { site: 'A', x: 24.6, z: -17.4, yaw: 2.4 }, { site: 'A', x: 19.0, z: -16.8, yaw: 3.1 },
      { site: 'A', x: 22.4, z: -25.8, yaw: 0.4 },
      { site: 'B', x: -24.6, z: -17.4, yaw: 0.7 }, { site: 'B', x: -19.0, z: -16.8, yaw: 3.1 },
      { site: 'B', x: -22.4, z: -25.8, yaw: -0.4 },
    ],
    defSite: [
      { site: 'A', x: 25.4, z: -23.0, yaw: -1.2 }, { site: 'A', x: 18.6, z: -18.0, yaw: 2.7 },
      { site: 'A', x: 23.4, z: -15.6, yaw: 3.0 },
      { site: 'B', x: -25.4, z: -23.0, yaw: 1.2 }, { site: 'B', x: -18.6, z: -18.0, yaw: -2.7 },
      { site: 'B', x: -23.4, z: -15.6, yaw: -3.0 },
    ],
    // A defender watching the middle from the north run.
    defMid: [
      { x: 0, z: -16.5, yaw: 3.14 },
      { x: 3.2, z: -23.0, yaw: 3.0 },
    ],
  },

  // Named points the bots route through so their movement reads as play rather than pathing.
  routes: {
    A: [
      { x: 0, z: 20 }, { x: 3, z: 12 }, { x: 14, z: 13.8 }, { x: 20, z: 6 },
      { x: 20.4, z: -2 }, { x: 21, z: -9 }, { x: 22.4, z: -14.2 }, { x: 21.5, z: -19 },
    ],
    B: [
      { x: 0, z: 20 }, { x: -3, z: 12 }, { x: -14, z: 13.8 }, { x: -20, z: 6 },
      { x: -20.4, z: -2 }, { x: -21, z: -9 }, { x: -22.4, z: -14.2 }, { x: -21.5, z: -19 },
    ],
    mid: [
      { x: 0, z: 20 }, { x: 0, z: 10 }, { x: 0, z: 4 }, { x: -8, z: -1 },
      { x: -10, z: -8 }, { x: -8, z: -14 }, { x: 0, z: -16 },
    ],
  },
};

export function siteFor(id) {
  return MAP.sites.find((s) => s.id === id) ?? MAP.sites[0];
}

export function insideSite(site, x, z) {
  const dx = x - site.x;
  const dz = z - site.z;
  return dx * dx + dz * dz <= site.r * site.r;
}