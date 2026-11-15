// The armory. Keys 1-9 and clicks both work, and every row shows the same price the simulation
// charges, because both read the same table.

import { WEAPONS, NADES, GEAR } from '../config.js';
import { buyWeapon, ensureAmmo } from '../weapons.js';

const ROWS = [
  { id: 'kindle', kind: 'weapon', price: WEAPONS.kindle.price, label: 'KINDLE-45', note: 'heavy sidearm · 34 dmg' },
  { id: 'vx9', kind: 'weapon', price: 0, label: 'VX-9', note: 'free sidearm · 27 dmg' },
  { id: 'wasp', kind: 'weapon', price: WEAPONS.wasp.price, label: 'WASP-9', note: 'smg · 760 rpm · pays $600 a kill' },
  { id: 'breach', kind: 'weapon', price: WEAPONS.breach.price, label: 'BREACH-12', note: 'shotgun · 9 pellets · pays $900' },
  { id: 'falchion', kind: 'weapon', price: WEAPONS.falchion.price, label: 'FALCHION-7', note: 'rifle · 34 dmg · 4x head' },
  { id: 'longspur', kind: 'weapon', price: WEAPONS.longspur.price, label: 'LONGSPUR', note: 'bolt rifle · one shot to the head' },
  { id: 'armor', kind: 'gear', price: GEAR.armor.price, label: 'PLATE + HELM', note: 'halves incoming damage' },
  { id: 'kit', kind: 'gear', price: GEAR.kit.price, label: 'CUT KIT', note: 'defuse in 5s instead of 10' },
  { id: 'shard', kind: 'nade', price: NADES.shard.price, label: 'SHARD', note: 'frag · 78 at the centre' },
  { id: 'glare', kind: 'nade', price: NADES.glare.price, label: 'GLARE', note: 'flash · blinds a lane' },
];

export function createBuyMenu({ onBuy } = {}) {
  const root = document.getElementById('buy');
  const grid = document.getElementById('buy-grid');
  const moneyLabel = document.getElementById('buy-money');
  const hint = document.getElementById('buy-hint');
  let open = false;
  let sim = null;
  const buttons = [];

  ROWS.forEach((row, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const name = document.createElement('span');
    name.className = 'n';
    name.textContent = `${index + 1}. ${row.label}`;
    const detail = document.createElement('span');
    detail.className = 'd';
    detail.textContent = row.note;
    const left = document.createElement('span');
    left.append(name, detail);
    const price = document.createElement('span');
    price.className = 'k';
    price.textContent = row.price === 0 ? 'FREE' : `$${row.price}`;
    btn.append(left, price);
    btn.addEventListener('click', () => attempt(row));
    grid.appendChild(btn);
    buttons.push({ btn, row });
  });

  function attempt(row) {
    const p = sim?.player;
    if (!p) return;
    if (!canBuy()) {
      hint.textContent = 'The armory is shut: you can buy in the freeze and for the first ten seconds of a round.';
      return;
    }
    const ok = purchase(row);
    hint.textContent = ok ? `Bought ${row.label}.` : `Not enough for ${row.label}, or you already carry it.`;
    refresh();
    onBuy?.(row, ok);
  }

  function purchase(row) {
    const p = sim.player;
    if (row.kind === 'weapon') {
      if (row.id === 'vx9') {
        p.weapons.secondary = 'vx9';
        ensureAmmo(p, 'vx9');
        p.slot = 'secondary';
        return true;
      }
      return buyWeapon(p, row.id, row.price);
    }
    if (row.kind === 'gear') {
      if (row.id === 'armor') {
        if (p.money < row.price || p.armor >= 100) return false;
        p.money -= row.price;
        p.armor = 100;
        p.helmet = true;
        return true;
      }
      if (p.money < row.price || p.hasKit) return false;
      p.money -= row.price;
      p.hasKit = true;
      return true;
    }
    if (p.money < row.price || p.nades[row.id]) return false;
    p.money -= row.price;
    p.nades[row.id] = 1;
    return true;
  }

  function canBuy() {
    if (!sim) return false;
    if (sim.match.phase === 'freeze') return true;
    return sim.match.phase === 'live' && sim.match.clock > 85;
  }

  function refresh() {
    if (!sim) return;
    const p = sim.player;
    moneyLabel.textContent = `$${p.money}`;
    for (let i = 0; i < buttons.length; i += 1) {
      const { btn, row } = buttons[i];
      let owned = false;
      if (row.kind === 'weapon') {
        const slot = WEAPONS[row.id].kind === 'pistol' ? 'secondary' : 'primary';
        owned = p.weapons[slot] === row.id;
      } else if (row.kind === 'gear') {
        owned = row.id === 'armor' ? p.armor >= 100 : p.hasKit;
      } else {
        owned = !!p.nades[row.id];
      }
      btn.disabled = owned || p.money < row.price || !canBuy();
    }
  }

  return {
    setSimulation(s) { sim = s; },
    get isOpen() { return open; },
    toggle(force) {
      open = force === undefined ? !open : force;
      root.classList.toggle('on', open);
      if (open) refresh();
    },
    open() { this.toggle(true); },
    close() { this.toggle(false); },
    pick(index) {
      const entry = buttons[index];
      if (entry && !entry.btn.disabled) attempt(entry.row);
    },
    refresh,
  };
}