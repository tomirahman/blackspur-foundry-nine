// Sound with no files. Every crack, step and beep is synthesised from noise and oscillators, which
// keeps the entry free of assets while still giving each weapon its own report.

const VOICE_LIMIT = 18;

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let voices = 0;
  let muted = false;

  const ensure = () => {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.6);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  };

  const voice = () => {
    if (voices >= VOICE_LIMIT) return false;
    voices += 1;
    return true;
  };

  const noise = (duration, filterHz, gain, type = 'lowpass', q = 1) => {
    if (!ctx || !voice() || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = filterHz;
    filt.Q.value = q;
    const env = ctx.createGain();
    const now = ctx.currentTime;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filt);
    filt.connect(env);
    env.connect(master);
    src.start(now);
    src.stop(now + duration + 0.02);
    src.onended = () => { voices = Math.max(0, voices - 1); };
  };

  const tone = (freq, duration, gain, type = 'sine', slideTo = null) => {
    if (!ctx || !voice() || muted) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(env);
    env.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
    osc.onended = () => { voices = Math.max(0, voices - 1); };
  };

  const shotgun = { pistol: [1400, 0.1, 0.34], smg: [1800, 0.08, 0.26], rifle: [1200, 0.13, 0.4], sniper: [700, 0.22, 0.5], shotgun: [480, 0.2, 0.46] };

  const api = {
    resume() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    get ready() { return !!ctx; },
    shot(kind) {
      const v = shotgun[kind] ?? shotgun.rifle;
      noise(v[1], v[0], v[2], 'lowpass', 1.1);
      tone(kind === 'sniper' ? 90 : 130, 0.11, 0.16, 'triangle', 45);
    },
    step(quiet) {
      noise(0.06, quiet ? 700 : 1400, quiet ? 0.05 : 0.11, 'bandpass', 1.4);
    },
    reload() {
      noise(0.05, 2600, 0.13, 'bandpass', 2);
      setTimeout(() => noise(0.05, 1900, 0.1, 'bandpass', 2), 140);
    },
    hit() {
      tone(1180, 0.05, 0.1, 'square', 900);
    },
    headshot() {
      tone(1600, 0.07, 0.13, 'square', 1200);
    },
    hurt() {
      noise(0.16, 500, 0.2, 'lowpass', 0.8);
    },
    kill() {
      tone(420, 0.12, 0.12, 'triangle', 260);
    },
    planted() {
      tone(880, 0.08, 0.12, 'square');
    },
    explode() {
      noise(0.7, 220, 0.55, 'lowpass', 0.7);
      tone(60, 0.6, 0.3, 'sine', 28);
    },
    defused() {
      tone(660, 0.1, 0.12, 'square', 990);
      setTimeout(() => tone(990, 0.16, 0.12, 'square', 1320), 110);
    },
    nade(kind) {
      if (kind === 'flash') {
        noise(0.5, 3200, 0.42, 'highpass', 0.7);
        tone(1400, 0.4, 0.1, 'sine', 300);
      } else if (kind === 'smoke') {
        noise(0.9, 900, 0.2, 'lowpass', 0.6);
      } else {
        noise(0.4, 400, 0.4, 'lowpass', 0.8);
      }
    },
    roundStart() {
      tone(320, 0.12, 0.1, 'triangle', 480);
      setTimeout(() => tone(480, 0.16, 0.1, 'triangle', 640), 130);
    },
    roundEnd(win) {
      if (win) {
        tone(520, 0.14, 0.12, 'triangle', 700);
        setTimeout(() => tone(780, 0.22, 0.12, 'triangle', 900), 140);
      } else {
        tone(300, 0.2, 0.1, 'triangle', 200);
      }
    },
    beep() {
      tone(1500, 0.05, 0.08, 'square');
    },
    mute(on) { muted = !!on; if (master) master.gain.value = muted ? 0 : 0.55; },
    get muted() { return muted; },
  };

  return api;
}