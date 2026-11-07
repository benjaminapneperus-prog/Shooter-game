// Våben, statistik og gemte data

export const WEAPONS = [
  { id: 'blaster',   name: 'Blaster',       icon: '🔫', color: '#29b6f6', hex: 0x29b6f6, kind: 'bullet',   cooldown: 0.28,  dmg: 1 },
  { id: 'bomb',      name: 'Bombehandske',  icon: '💣', color: '#ff8a3d', hex: 0xff8a3d, kind: 'lob',      cooldown: 0.95,  dmg: 3, radius: 1.9 },
  { id: 'flame',     name: 'Flammekaster',  icon: '🔥', color: '#ff5722', hex: 0xff5722, kind: 'flame',    cooldown: 0.075, dmg: 0.4 },
  { id: 'saw',       name: 'Savklinger',    icon: '⚙️', color: '#b0bec5', hex: 0xb0bec5, kind: 'disc',     cooldown: 0.85,  dmg: 2, pierce: 3 },
  { id: 'lightning', name: 'Lynkanon',      icon: '⚡', color: '#ffd600', hex: 0xffd600, kind: 'beam',     cooldown: 0.65,  dmg: 2, chain: 3 },
  { id: 'rocket',    name: 'Raketbatteri',  icon: '🚀', color: '#ec407a', hex: 0xec407a, kind: 'rocket',   cooldown: 1.4,   dmg: 2, radius: 1.3, count: 3 },
  { id: 'disco',     name: 'Diskokugle',    icon: '🔮', color: '#ab47bc', hex: 0xab47bc, kind: 'disco',    cooldown: 2.2,   dmg: 1.3, radius: 3.0, pulses: 5 },
  { id: 'confetti',  name: 'Konfettikanon', icon: '🎉', color: '#26c281', hex: 0x26c281, kind: 'spread',   cooldown: 0.75,  dmg: 0.8, count: 7 },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const MAX_LEVEL = 8;
export const upgradeCost = (lvl) => 25 * lvl;

export function stats(id, lvl = 1) {
  const w = WEAPON_BY_ID[id];
  const k = lvl - 1;
  return {
    ...w,
    level: lvl,
    dmg: w.dmg * (1 + 0.4 * k),
    cooldown: w.cooldown / (1 + 0.07 * k),
    radius: (w.radius || 0) * (1 + 0.08 * k),
    count: (w.count || 0) + (id === 'confetti' ? Math.floor(k / 2) : id === 'rocket' ? Math.floor(k / 3) : 0),
    chain: (w.chain || 0) + Math.floor(k / 2),
    pierce: (w.pierce || 0) + Math.floor(k / 2),
    pulses: (w.pulses || 0) + Math.floor(k / 2),
  };
}

const KEY = 'kasse-boom-save-v1';
const defaults = () => ({
  squares: 0,
  level: 1,
  levels: { blaster: 1, bomb: 1 },
  discovered: ['blaster', 'bomb'],
  slots: ['blaster', 'bomb'],
});

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.slots)) return { ...defaults(), ...s };
  } catch (e) { /* ignore */ }
  return defaults();
}
export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}
export function freshSave() { return defaults(); }
