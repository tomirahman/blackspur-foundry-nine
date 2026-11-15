// Tuning for BLACKSPUR. Every number a designer would touch lives here and nowhere else.

export const TEAM = Object.freeze({ ATK: 'atk', DEF: 'def' });

export const MATCH = Object.freeze({
  roundsToWin: 8,
  freezeTime: 8,
  roundTime: 95,
  plantTime: 3.2,
  bombTime: 40,
  defuseTime: 10,
  defuseKitTime: 5,
  postRoundTime: 4.5,
  botCount: 4,
});

export const PHYSICS = Object.freeze({
  gravity: 19.6,
  jumpSpeed: 6.2,
  walkSpeed: 6.4,
  quietSpeed: 3.1,
  crouchSpeed: 2.7,
  groundAccel: 11.0,
  airAccel: 2.4,
  friction: 9.5,
  stopSpeed: 1.2,
  height: 1.82,
  crouchHeight: 1.28,
  eyeHeight: 1.64,
  crouchEyeHeight: 1.12,
  radius: 0.32,
  stepHeight: 0.44,
  maxFallSpeed: 38,
  fallDamageSpeed: 12.5,
});

export const ECONOMY = Object.freeze({
  start: 800,
  cap: 12000,
  winReward: 3250,
  lossStep: 500,
  lossBase: 1400,
  lossMax: 3400,
  plantReward: 800,
  defuseReward: 300,
  surviveLossReward: 0,
});

// damage is per bullet at point blank, before range falloff and hitbox multipliers.
export const WEAPONS = Object.freeze({
  vx9: {
    id: 'vx9', name: 'VX-9', kind: 'pistol', price: 0, killReward: 300,
    damage: 27, rpm: 400, magSize: 20, reserve: 60, reloadTime: 1.9,
    spread: 0.0022, moveSpread: 0.055, airSpread: 0.16, spreadPerShot: 0.006,
    recoilPitch: 0.9, recoilYaw: 0.22, recoilRecover: 9.0, range: 85,
    falloffStart: 22, falloffEnd: 85, falloffMin: 0.62, auto: false, pellets: 1,
    sound: 'pistol',
  },
  wasp: {
    id: 'wasp', name: 'WASP-9', kind: 'smg', price: 1250, killReward: 600,
    damage: 24, rpm: 760, magSize: 30, reserve: 90, reloadTime: 2.4,
    spread: 0.0075, moveSpread: 0.075, airSpread: 0.2, spreadPerShot: 0.005,
    recoilPitch: 0.72, recoilYaw: 0.3, recoilRecover: 10.0, range: 70,
    falloffStart: 16, falloffEnd: 70, falloffMin: 0.55, auto: true, pellets: 1,
    sound: 'smg',
  },
  falchion: {
    id: 'falchion', name: 'FALCHION-7', kind: 'rifle', price: 2700, killReward: 300,
    damage: 34, rpm: 600, magSize: 30, reserve: 90, reloadTime: 2.6,
    spread: 0.0018, moveSpread: 0.09, airSpread: 0.24, spreadPerShot: 0.0075,
    recoilPitch: 1.05, recoilYaw: 0.3, recoilRecover: 8.4, range: 110,
    falloffStart: 30, falloffEnd: 110, falloffMin: 0.7, auto: true, pellets: 1,
    sound: 'rifle',
  },
  breach: {
    id: 'breach', name: 'BREACH-12', kind: 'shotgun', price: 900, killReward: 900,
    damage: 13, rpm: 78, magSize: 7, reserve: 32, reloadTime: 0.55,
    spread: 0.055, moveSpread: 0.03, airSpread: 0.1, spreadPerShot: 0.004,
    recoilPitch: 2.6, recoilYaw: 0.5, recoilRecover: 6.0, range: 28,
    falloffStart: 6, falloffEnd: 28, falloffMin: 0.22, auto: false, pellets: 9,
    shellReload: true, sound: 'shotgun',
  },
  longspur: {
    id: 'longspur', name: 'LONGSPUR', kind: 'sniper', price: 4750, killReward: 100,
    damage: 112, rpm: 44, magSize: 5, reserve: 20, reloadTime: 3.2,
    spread: 0.0006, moveSpread: 0.16, airSpread: 0.3, spreadPerShot: 0.02,
    recoilPitch: 3.4, recoilYaw: 0.4, recoilRecover: 5.2, range: 160,
    falloffStart: 120, falloffEnd: 160, falloffMin: 0.9, auto: false, pellets: 1,
    scoped: true, sound: 'sniper',
  },
  kindle: {
    id: 'kindle', name: 'KINDLE-45', kind: 'pistol', price: 500, killReward: 300,
    damage: 34, rpm: 300, magSize: 12, reserve: 36, reloadTime: 2.2,
    spread: 0.0028, moveSpread: 0.07, airSpread: 0.18, spreadPerShot: 0.009,
    recoilPitch: 1.6, recoilYaw: 0.26, recoilRecover: 8.0, range: 90,
    falloffStart: 24, falloffEnd: 90, falloffMin: 0.6, auto: false, pellets: 1,
    sound: 'pistol',
  },
});

export const NADES = Object.freeze({
  shard: { id: 'shard', name: 'SHARD', price: 300, fuse: 1.7, radius: 6.5, damage: 78, throwSpeed: 17, sound: 'he' },
  glare: { id: 'glare', name: 'GLARE', price: 200, fuse: 1.4, radius: 9, throwSpeed: 18, sound: 'flash' },
  veil: { id: 'veil', name: 'VEIL', price: 300, fuse: 1.6, radius: 5.2, duration: 14, throwSpeed: 15, sound: 'smoke' },
});

export const GEAR = Object.freeze({
  armor: { id: 'armor', name: 'PLATE + HELM', price: 650 },
  kit: { id: 'kit', name: 'CUT KIT', price: 400, team: TEAM.DEF },
});

// hitboxes: damage multiplier and what a shot at that part does to a body.
export const HITBOX = Object.freeze({
  head: { mult: 4.0 },
  torso: { mult: 1.0 },
  legs: { mult: 0.72 },
});

export const BOT = Object.freeze({
  reactionMin: 0.17,
  reactionMax: 0.34,
  aimJitter: 0.018,
  aimJitterClose: 0.009,
  turnSpeed: 6.4,
  repathTime: 1.6,
  hearingShot: 46,
  hearingStep: 13,
  fov: 1.9,
  viewRange: 78,
  strafeMin: 0.35,
  strafeMax: 1.1,
  burstMin: 3,
  burstMax: 9,
});

export const SIM = Object.freeze({ dt: 1 / 120, maxSteps: 6 });