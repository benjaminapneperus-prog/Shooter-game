// Alle 3D-modeller bygges af simple former (ingen eksterne filer)
import * as THREE from 'three';
import { WEAPON_BY_ID } from './data.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...o });
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };

// ---------- Kasser ----------
function crateTexture(base, edge, kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  if (kind === 'wood') {
    g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 2;
    for (let y = 21; y < 128; y += 21) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
  }
  if (kind === 'metal') {
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 4;
    for (let y = 32; y < 128; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
  }
  g.strokeStyle = edge; g.lineWidth = 14; g.strokeRect(7, 7, 114, 114);
  if (kind === 'wood') {
    g.lineWidth = 10; g.beginPath(); g.moveTo(14, 14); g.lineTo(114, 114); g.moveTo(114, 14); g.lineTo(14, 114); g.stroke();
  }
  if (kind === 'metal') {
    g.fillStyle = '#e8eef2';
    [[16, 16], [112, 16], [16, 112], [112, 112]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); });
  }
  if (kind === 'gold') {
    g.fillStyle = '#fff6c2'; g.font = 'bold 84px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', 64, 70);
  }
  if (kind === 'tnt') {
    g.fillStyle = '#fff'; g.font = 'bold 42px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TNT', 64, 66);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const BOX_DEFS = {
  wood:  ['#d49a5a', '#8a5a2b'],
  metal: ['#a9b6c2', '#5d6b78'],
  gold:  ['#ffd54a', '#c79a00'],
  tnt:   ['#e53935', '#8e0000'],
};
const boxMats = {};
export function boxMaterial(type) {
  if (!boxMats[type]) {
    const [b, e] = BOX_DEFS[type];
    boxMats[type] = std(0xffffff, { map: crateTexture(b, e, type), metalness: type === 'metal' ? 0.5 : type === 'gold' ? 0.4 : 0.05, roughness: type === 'metal' ? 0.35 : 0.6 });
  }
  return boxMats[type];
}
export const boxColor = (type) => parseInt(BOX_DEFS[type][0].slice(1), 16);

// ---------- Våbenmodeller (pegerer mod +x) ----------
export function makeWeaponModel(id) {
  const g = new THREE.Group();
  const col = WEAPON_BY_ID[id].hex;
  const body = std(col, { metalness: 0.3 });
  const dark = std(0x2b3040, { metalness: 0.5 });
  const glow = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2 });
  switch (id) {
    case 'blaster':
      g.add(mesh(new THREE.BoxGeometry(0.55, 0.26, 0.2), body, 0, 0, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10).rotateZ(Math.PI / 2), dark, 0.45, 0.03, 0));
      g.add(mesh(new THREE.SphereGeometry(0.08, 8, 8), glow(0x80d8ff), 0.72, 0.03, 0));
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.28, 0.16), dark, -0.12, -0.2, 0));
      break;
    case 'bomb':
      g.add(mesh(new THREE.SphereGeometry(0.3, 14, 12), body, 0.1, 0, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.3, 12).rotateZ(Math.PI / 2), dark, -0.2, 0, 0));
      g.add(mesh(new THREE.SphereGeometry(0.17, 12, 10), std(0x222222), 0.45, 0.05, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), std(0xbca27a), 0.45, 0.25, 0));
      g.add(mesh(new THREE.SphereGeometry(0.045, 6, 6), glow(0xffee58), 0.45, 0.33, 0));
      break;
    case 'flame':
      g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.55, 12), body, -0.1, 0.12, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8).rotateZ(Math.PI / 2), dark, 0.3, -0.02, 0));
      g.add(mesh(new THREE.ConeGeometry(0.12, 0.2, 10).rotateZ(-Math.PI / 2), glow(0xff9800), 0.65, -0.02, 0));
      break;
    case 'saw': {
      const disc = new THREE.Group();
      disc.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 20).rotateX(Math.PI / 2), body));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const t = mesh(new THREE.BoxGeometry(0.12, 0.1, 0.07), dark, Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0);
        t.rotation.z = a; disc.add(t);
      }
      disc.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 10).rotateX(Math.PI / 2), glow(0xff5252)));
      disc.userData.spin = true;
      g.add(disc); g.userData.disc = disc;
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.12, 0.1), dark, -0.35, 0, 0));
      break;
    }
    case 'lightning':
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 10).rotateZ(Math.PI / 2), body, 0.05, 0, 0));
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 14).rotateY(Math.PI / 2), dark, -0.1 + i * 0.18, 0, 0));
      g.add(mesh(new THREE.SphereGeometry(0.12, 10, 10), glow(0xfff176), 0.45, 0, 0));
      break;
    case 'rocket':
      for (let i = 0; i < 3; i++) {
        const y = (i - 1) * 0.17, z = i === 1 ? 0 : 0.0;
        g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 10).rotateZ(Math.PI / 2), body, 0.05, y, z));
        g.add(mesh(new THREE.ConeGeometry(0.08, 0.2, 10).rotateZ(-Math.PI / 2), std(0xffffff), 0.45, y, z));
      }
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.08, 0.3), dark, 0.0, -0.3, 0));
      break;
    case 'disco': {
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshStandardMaterial({ color: col, metalness: 0.9, roughness: 0.15, flatShading: true, emissive: col, emissiveIntensity: 0.25 }));
      ball.castShadow = true; ball.userData.spin = true;
      g.add(ball); g.userData.ball = ball;
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), dark, 0, 0.38, 0));
      break;
    }
    case 'confetti':
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.12, 0.6, 14).rotateZ(-Math.PI / 2), body, 0.15, 0, 0));
      g.add(mesh(new THREE.TorusGeometry(0.28, 0.04, 6, 16).rotateY(Math.PI / 2), glow(0xffeb3b), 0.45, 0, 0));
      g.add(mesh(new THREE.BoxGeometry(0.22, 0.2, 0.16), dark, -0.22, -0.18, 0));
      break;
  }
  return g;
}

// ---------- Spilleren: en lille orange robot-ræv ----------
export function makePlayer() {
  const g = new THREE.Group();
  const fur = std(0xff9a2e), belly = std(0xffe3b8), dark = std(0x39425c), white = std(0xffffff), pupil = std(0x111111);
  const body = mesh(new THREE.CapsuleGeometry(0.36, 0.45, 6, 14), fur, 0, 0.95, 0);
  g.add(body);
  const bl = mesh(new THREE.SphereGeometry(0.3, 12, 10), belly, 0.12, 0.95, 0); bl.scale.set(0.8, 1.2, 0.85); g.add(bl);
  // hoved
  const head = new THREE.Group(); head.position.set(0.05, 1.72, 0); g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.42, 18, 14), fur));
  const snout = mesh(new THREE.SphereGeometry(0.2, 12, 10), belly, 0.36, -0.08, 0); snout.scale.set(1.1, 0.8, 0.9); head.add(snout);
  head.add(mesh(new THREE.SphereGeometry(0.06, 8, 8), pupil, 0.55, -0.02, 0));
  for (const z of [-0.17, 0.17]) {
    head.add(mesh(new THREE.SphereGeometry(0.11, 10, 10), white, 0.3, 0.1, z));
    head.add(mesh(new THREE.SphereGeometry(0.055, 8, 8), pupil, 0.39, 0.1, z));
    const ear = mesh(new THREE.ConeGeometry(0.13, 0.5, 10), fur, -0.05, 0.5, z * 1.6); ear.rotation.z = -0.15; head.add(ear);
  }
  // hjelm-antenne
  head.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 6), dark, -0.1, 0.6, 0));
  head.add(mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ color: 0x4dd0e1, emissive: 0x4dd0e1, emissiveIntensity: 1 }), -0.1, 0.75, 0));
  // hale
  const tail = new THREE.Group(); tail.position.set(-0.3, 0.8, 0); g.add(tail);
  const tl = mesh(new THREE.CapsuleGeometry(0.1, 0.55, 4, 8), fur, -0.3, 0.1, 0); tl.rotation.z = 1.1; tail.add(tl);
  tail.add(mesh(new THREE.SphereGeometry(0.12, 8, 8), white, -0.6, 0.3, 0));
  // ben
  const legs = [];
  for (const z of [-0.18, 0.18]) {
    const leg = new THREE.Group(); leg.position.set(0, 0.6, z); g.add(leg);
    leg.add(mesh(new THREE.CapsuleGeometry(0.1, 0.3, 4, 8), dark, 0, -0.25, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.34, 0.14, 0.2), dark, 0.08, -0.52, 0));
    legs.push(leg);
  }
  // arme
  const armBack = new THREE.Group(); armBack.position.set(0.0, 1.1, -0.4); g.add(armBack);
  armBack.add(mesh(new THREE.CapsuleGeometry(0.08, 0.3, 4, 8), fur, 0, -0.2, 0));
  const arm = new THREE.Group(); arm.position.set(0.05, 1.1, 0.4); g.add(arm);
  arm.add(mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8), fur, 0.0, -0.18, 0));
  // våbenholder (følger armen)
  const holder = new THREE.Group(); holder.position.set(0.5, 0.98, 0.42); g.add(holder);
  return { group: g, head, tail, legs, arm, armBack, holder, body };
}

// ---------- Dekoration ----------
export function makeDecor(kind, rng) {
  const g = new THREE.Group();
  const s = 0.8 + rng() * 1.1;
  if (kind === 'tree') {
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.6, 8), std(0x8d5a2b), 0, 0.8, 0));
    const c = [0x2e9b3e, 0x3fae4a, 0x58c24f][Math.floor(rng() * 3)];
    g.add(mesh(new THREE.SphereGeometry(1.3, 10, 8), std(c), 0, 2.4, 0));
    g.add(mesh(new THREE.SphereGeometry(0.9, 10, 8), std(c), 0.6, 3.2, 0.2));
  } else if (kind === 'cactus') {
    const m = std(0x4caf50);
    g.add(mesh(new THREE.CapsuleGeometry(0.28, 1.8, 4, 10), m, 0, 1.2, 0));
    const a = mesh(new THREE.CapsuleGeometry(0.16, 0.6, 4, 8), m, 0.5, 1.5, 0); g.add(a);
    g.add(mesh(new THREE.CapsuleGeometry(0.16, 0.4, 4, 8), m, 0.5, 1.95, 0));
    g.add(mesh(new THREE.CapsuleGeometry(0.15, 0.5, 4, 8), m, -0.45, 1.1, 0));
  } else if (kind === 'pine') {
    g.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.8, 8), std(0x6d4c41), 0, 0.4, 0));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.ConeGeometry(1.3 - i * 0.3, 1.5, 10), std(i % 2 ? 0xffffff : 0x2f8f6b), 0, 1.4 + i * 0.9, 0));
  } else if (kind === 'lolly') {
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 8), std(0xffffff), 0, 1.2, 0));
    const c = [0xff4081, 0x7c4dff, 0x00e5ff, 0xffeb3b][Math.floor(rng() * 4)];
    g.add(mesh(new THREE.SphereGeometry(1.0, 14, 10), std(c), 0, 2.9, 0));
    g.add(mesh(new THREE.TorusGeometry(0.7, 0.12, 6, 16), std(0xffffff), 0, 2.9, 0.55));
  } else {
    const c = [0x4dd0e1, 0xba68c8, 0x81d4fa][Math.floor(rng() * 3)];
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, roughness: 0.2, flatShading: true });
    g.add(mesh(new THREE.ConeGeometry(0.5, 2.2, 5), m, 0, 1.1, 0));
    g.add(mesh(new THREE.ConeGeometry(0.35, 1.5, 5), m, 0.6, 0.75, 0.2));
  }
  g.scale.setScalar(s);
  return g;
}
