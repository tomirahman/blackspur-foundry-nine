// Keyboard, mouse and pointer lock. Everything is accumulated here and handed to the simulation as
// one intent per frame, so the simulation never listens to a DOM event.

export function createInput(canvas) {
  const keys = new Set();
  const state = {
    forward: 0,
    right: 0,
    jump: false,
    crouch: false,
    walk: false,
    fire: false,
    reload: false,
    plant: false,
    defuse: false,
    mouseDX: 0,
    mouseDY: 0,
    yaw: Math.PI,
    pitch: 0,
    sensitivity: 0.0022,
    locked: false,
  };

  const listeners = { buy: [], nade: [], slot: [] };

  const onKeyDown = (e) => {
    if (e.repeat) {
      if (e.code === 'KeyB') return;
    }
    keys.add(e.code);
    switch (e.code) {
      case 'KeyB': listeners.buy.forEach((fn) => fn()); e.preventDefault(); break;
      case 'Digit1': listeners.slot.forEach((fn) => fn('primary')); break;
      case 'Digit2': listeners.slot.forEach((fn) => fn('secondary')); break;
      case 'KeyQ': listeners.slot.forEach((fn) => fn('last')); break;
      case 'KeyH': listeners.nade.forEach((fn) => fn('shard')); break;
      case 'KeyF': listeners.nade.forEach((fn) => fn('glare')); break;
      case 'KeyV': listeners.nade.forEach((fn) => fn('veil')); break;
      case 'Space': e.preventDefault(); break;
      case 'Tab': e.preventDefault(); break;
      default: break;
    }
  };
  const onKeyUp = (e) => keys.delete(e.code);

  const onMouseMove = (e) => {
    if (!state.locked) return;
    state.mouseDX += e.movementX || 0;
    state.mouseDY += e.movementY || 0;
  };

  const onMouseDown = (e) => {
    if (e.button === 0) state.fire = true;
    if (e.button === 2) state.aim = true;
  };
  const onMouseUp = (e) => {
    if (e.button === 0) state.fire = false;
    if (e.button === 2) state.aim = false;
  };
  const onContext = (e) => e.preventDefault();

  const onLockChange = () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.fire = false;
    }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('contextmenu', onContext);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    state,
    on(event, fn) { listeners[event]?.push(fn); },
    lock() {
      if (canvas.requestPointerLock) canvas.requestPointerLock();
    },
    unlock() {
      if (document.exitPointerLock) document.exitPointerLock();
    },
    // Builds one frame's intent from the held keys and this frame's mouse movement.
    sample(dt) {
      state.yaw -= state.mouseDX * state.sensitivity;
      state.pitch -= state.mouseDY * state.sensitivity;
      if (state.pitch > 1.45) state.pitch = 1.45;
      if (state.pitch < -1.45) state.pitch = -1.45;

      const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      state.forward = fwd;
      state.right = right;
      state.jump = keys.has('Space');
      state.crouch = keys.has('ControlLeft') || keys.has('ControlRight');
      state.walk = keys.has('ShiftLeft') || keys.has('ShiftRight');
      state.reload = keys.has('KeyR');
      state.plant = keys.has('KeyE');
      state.defuse = keys.has('KeyE');

      const delta = { x: state.mouseDX, y: state.mouseDY };
      state.mouseDX = 0;
      state.mouseDY = 0;
      void dt;
      return delta;
    },
  };
}