import * as THREE from 'three';
import { WEAPONS, WEAPON_BY_ID, MAX_LEVEL, upgradeCost, stats, loadSave, writeSave, freshSave } from './data.js';
import { initAudio, sfx, setMuted, isMuted } from './audio.js';
import { makePlayer, makeWeaponModel, makeDecor, boxMaterial, boxColor } from './models.js';

const $ = (id) => document.getElementById(id);
let save = loadSave();

// ---------------------------------------------------------------- three.js opsætning
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOV = 38;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 260);
const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa77, 1.2);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 14, bottom: -6, near: 1, far: 70 });
sun.shadow.bias = -0.0005;
scene.add(hemi, sun, sun.target);

let world = null;               // statisk bane (rebuild pr. bane)
const dyn = new THREE.Group();  // bevægelige ting: kasser, skud, effekter
scene.add(dyn);

let camDist = 14;
function resize() {
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camDist = Math.min(34, Math.max(11, (camera.aspect < 1 ? 11 : 17) / (2 * Math.tan((FOV * Math.PI) / 360) * camera.aspect)));
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- hjælpere
const rngFactory = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);

const basicCache = {}, stdCache = {};
const basic = (c, o = {}) => basicCache[c + JSON.stringify(o)] || (basicCache[c + JSON.stringify(o)] = new THREE.MeshBasicMaterial({ color: c, ...o }));
const stdMat = (c) => stdCache[c] || (stdCache[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 10, 8),
  crate: new THREE.BoxGeometry(0.98, 0.98, 0.98),
  plate: new THREE.BoxGeometry(0.3, 0.3, 0.08),
};
const plateMat = new THREE.MeshStandardMaterial({ color: 0xd5dde3, metalness: 0.9, roughness: 0.25, emissive: 0x30404c });

// ---------------------------------------------------------------- tema
const THEMES = [
  { sky: 0x8fd8ff, ground: '#6fcf5a', ground2: '#64c250', path: '#e8d49a', deco: 'tree', hill: 0x5cbf55, hemi: 0x88aa77 },
  { sky: 0xffd9a0, ground: '#f2c882', ground2: '#ebbd72', path: '#dcae60', deco: 'cactus', hill: 0xe3a65a, hemi: 0xc9a070 },
  { sky: 0xcfe8ff, ground: '#f6fbff', ground2: '#e6f1fb', path: '#c3d9ee', deco: 'pine', hill: 0xdceaf7, hemi: 0xaabbd0 },
  { sky: 0xffc9ea, ground: '#ffa6d6', ground2: '#ff96cc', path: '#fff0a8', deco: 'lolly', hill: 0xff8fc7, hemi: 0xd090b0 },
  { sky: 0x1a1c4d, ground: '#4a4f9a', ground2: '#42478c', path: '#8a90e0', deco: 'crystal', hill: 0x2e3270, hemi: 0x6064b0, stars: true },
];

function checkerTexture(c1, c2, rx, ry) {
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  const g = c.getContext('2d');
  g.fillStyle = c1; g.fillRect(0, 0, 2, 2);
  g.fillStyle = c2; g.fillRect(0, 0, 1, 1); g.fillRect(1, 1, 1, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.repeat.set(rx, ry);
  return t;
}

// ---------------------------------------------------------------- spiltilstand
const BOX_STATS = {
  wood:  { hp: 2,   drop: [1, 2] },
  metal: { hp: 5,   drop: [3, 4] },
  gold:  { hp: 3,   drop: [8, 10] },
  tnt:   { hp: 1.5, drop: [2, 3] },
};

const G = {
  mode: 'menu',          // menu | playing | pickup | choosing | finishing | shop
  level: 1,
  length: 100,
  boxes: [],
  projectiles: [],
  fx: [],
  drops: [],
  timers: [],
  pickups: [],
  holding: [false, false],
  cd: [0, 0], cdMax: [1, 1],
  earned: 0,
  shake: 0,
  stabilize: 0,
  walkT: 0,
  pending: null,  // våben der er ved at blive samlet op
  camX: 0,
};
window.__G = G; // til test/fejlsøgning
window.__save = () => save;

const player = makePlayer();
player.group.position.set(0, 0, 0);
scene.add(player.group);
let heldId = null;
let heldModel = null;
const P = { x: 0, recoil: 0, blocked: false };
G.P = P;

function setHeld(id) {
  if (heldId === id) return;
  heldId = id;
  if (heldModel) player.holder.remove(heldModel);
  heldModel = makeWeaponModel(id);
  heldModel.scale.setScalar(0.9);
  player.holder.add(heldModel);
}

// ---------------------------------------------------------------- bane-opbygning
function addTimer(t, fn) { G.timers.push({ t, fn }); }

function buildLevel(n) {
  if (world) scene.remove(world);
  dyn.clear();
  G.boxes.length = 0; G.projectiles.length = 0; G.fx.length = 0; G.drops.length = 0; G.timers.length = 0; G.pickups.length = 0;
  world = new THREE.Group();
  scene.add(world);

  const theme = THEMES[(n - 1) % THEMES.length];
  const rng = rngFactory(n * 7919 + 13);
  const R = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const length = Math.min(90 + n * 14, 210);
  G.length = length; G.level = n;

  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.sky, 45, 130);
  hemi.groundColor.setHex(theme.hemi);

  // jord
  const gw = length + 300, gd = 300;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), new THREE.MeshStandardMaterial({ map: checkerTexture(theme.ground, theme.ground2, gw / 4, gd / 4), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(length / 2, 0, -50); ground.receiveShadow = true;
  world.add(ground);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(gw, 4.2), new THREE.MeshStandardMaterial({ map: checkerTexture(theme.path, theme.path, 1, 1), roughness: 1 }));
  path.rotation.x = -Math.PI / 2; path.position.set(length / 2, 0.02, 0); path.receiveShadow = true;
  world.add(path);

  // bakker
  for (let x = -60; x < length + 120; x += rand(18, 30)) {
    const r = rand(10, 18);
    const h = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), stdMat(theme.hill));
    h.scale.y = 0.55; h.position.set(x, -r * 0.2, -rand(55, 90)); world.add(h);
  }
  // skyer
  for (let x = -40; x < length + 100; x += rand(14, 26)) {
    const c = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rand(1.6, 2.6), 10, 8), basic(theme.stars ? 0x5a5fb0 : 0xffffff));
      s.position.set(i * 2 - 3, rand(-0.4, 0.6), rand(-1, 1)); s.scale.y = 0.7; c.add(s);
    }
    c.position.set(x, rand(13, 22), -rand(35, 70)); world.add(c);
  }
  if (theme.stars) {
    const pts = [];
    for (let i = 0; i < 400; i++) pts.push(rand(-60, length + 120), rand(8, 60), -rand(80, 120));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    world.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, fog: false })));
  }
  // dekoration bag banen + lidt foran
  for (let x = -20; x < length + 40; x += rand(3, 6)) {
    const d = makeDecor(theme.deco, rng);
    d.position.set(x, 0, -rand(4.5, 28)); d.rotation.y = rand(0, 6); world.add(d);
  }
  for (let x = -20; x < length + 30; x += rand(2.5, 5)) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(rand(0.15, 0.4), 8, 6), stdMat([0xffeb3b, 0xff5252, 0xffffff, 0xff80ab][Math.floor(rng() * 4)]));
    s.position.set(x, 0.08, -rand(2.7, 4.5)); s.scale.setScalar(0.6); s.castShadow = true; world.add(s);
  }

  // målstreg
  buildFinish(length);

  // våben-pickups
  const equipped = save.slots;
  const undiscovered = WEAPONS.map((w) => w.id).filter((id) => !save.discovered.includes(id) && !equipped.includes(id));
  const pool = WEAPONS.map((w) => w.id).filter((id) => !equipped.includes(id));
  const chosen = [];
  const pickFrom = (arr) => arr.filter((id) => !chosen.includes(id));
  for (const frac of [0.33, 0.66]) {
    const cand = pickFrom(undiscovered).length ? pickFrom(undiscovered) : pickFrom(pool);
    const id = cand[Math.floor(rng() * cand.length)];
    chosen.push(id);
    makePickup(Math.round(length * frac), id);
  }

  // kasser
  const kinds = ['pyramid', 'tower', 'wall', 'stairs', 'scatter'];
  let x = 14;
  while (x < length - 14) {
    const near = G.pickups.find((p) => Math.abs(p.x - x) < 9);
    if (near) { x = near.x + 9; continue; }
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const { cells, width } = patternCells(kind, rng, R);
    const nearEnd = G.pickups.find((p) => x < p.x && x + width > p.x - 9);
    if (nearEnd) { x = nearEnd.x + 9; continue; }
    for (const [dx, row] of cells) {
      const r = rng();
      const type = r < 0.08 ? 'tnt' : r < 0.15 ? 'gold' : r < 0.27 + Math.min(0.25, n * 0.03) ? 'metal' : 'wood';
      addBox(type, x + dx, row);
    }
    x += width + R(5, 9) - Math.min(3, Math.floor(n / 3));
  }
}

function patternCells(kind, rng, R) {
  const cells = []; let width = 1;
  if (kind === 'pyramid') {
    const h = R(3, 5);
    for (let r = 0; r < h; r++) for (let i = 0; i < h - r; i++) cells.push([i + r * 0.5, r]);
    width = h;
  } else if (kind === 'tower') {
    const h = R(3, 7);
    for (let r = 0; r < h; r++) cells.push([0, r]);
  } else if (kind === 'wall') {
    const w = R(2, 3), h = R(3, 5);
    for (let i = 0; i < w; i++) for (let r = 0; r < h; r++) cells.push([i, r]);
    width = w;
  } else if (kind === 'stairs') {
    const w = R(3, 5);
    for (let i = 0; i < w; i++) for (let r = 0; r <= i; r++) cells.push([i, r]);
    width = w;
  } else {
    const k = R(3, 5);
    for (let i = 0; i < k; i++) { const h = R(1, 2); for (let r = 0; r < h; r++) cells.push([i * 2.2, r]); }
    width = k * 2.2;
  }
  return { cells, width };
}

function addBox(type, x, row) {
  const m = new THREE.Mesh(GEO.crate, boxMaterial(type));
  m.castShadow = true; m.receiveShadow = true;
  const b = { mesh: m, type, x, y: row + 0.5, vy: 0, hp: BOX_STATS[type].hp, pop: 0, alive: true };
  m.position.set(x, b.y, 0);
  dyn.add(m);
  G.boxes.push(b);
  return b;
}

function buildFinish(L) {
  const g = new THREE.Group();
  const pole = stdMat(0xeeeeee), red = stdMat(0xe53935);
  for (const dx of [-2.2, 2.2]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.6, 0.4), pole); p.position.set(dx, 2.3, 0); p.castShadow = true; g.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.5, 0.5), red); beam.position.set(0, 4.6, 0); beam.castShadow = true; g.add(beam);
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#ffd54a'; x.fillRect(0, 0, 256, 96);
  x.fillStyle = '#c62828'; x.font = 'bold 64px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('MÅL!', 128, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.35), new THREE.MeshBasicMaterial({ map: t }));
  ban.position.set(0, 3.7, 0.3); g.add(ban);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 4.2), new THREE.MeshBasicMaterial({ map: checkerTexture('#ffffff', '#222222', 2, 10) }));
  line.rotation.x = -Math.PI / 2; line.position.set(0, 0.04, 0); g.add(line);
  g.position.set(L, 0, 0);
  world.add(g);
}

function makePickup(x, weaponId) {
  const g = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.6, 16), stdMat(0x78909c)); ped.position.y = 0.3; ped.castShadow = true; g.add(ped);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 8, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 }));
  ring.position.y = 0.62; g.add(ring);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false }));
  halo.position.y = 1.7; g.add(halo);
  const holder = new THREE.Group(); holder.position.y = 1.7; g.add(holder);
  g.position.set(x, 0, 0);
  world.add(g);
  const pk = { x, weaponId, group: g, holder, halo, ring, model: null, taken: false, skipped: false };
  setPickupModel(pk, weaponId);
  G.pickups.push(pk);
}
function setPickupModel(pk, id) {
  pk.weaponId = id;
  if (pk.model) pk.holder.remove(pk.model);
  pk.model = makeWeaponModel(id);
  pk.model.scale.setScalar(2.1);
  pk.holder.add(pk.model);
  const c = WEAPON_BY_ID[id].hex;
  pk.halo.material.color.setHex(c);
  pk.ring.material.color.setHex(c); pk.ring.material.emissive.setHex(c);
}

// ---------------------------------------------------------------- effekter
function addFx(mesh, update) { dyn.add(mesh); G.fx.push({ mesh, update }); return mesh; }

function particle(x, y, z, vx, vy, vz, { color = 0xffffff, size = 0.15, life = 0.6, g = 14, std: useStd = false, spin = 6, shrink = true } = {}) {
  const m = new THREE.Mesh(GEO.box, useStd ? stdMat(color) : basic(color));
  m.scale.setScalar(size); m.position.set(x, y, z);
  let t = 0;
  const rx = rand(-spin, spin), rz = rand(-spin, spin);
  addFx(m, (dt) => {
    t += dt;
    m.position.x += vx * dt; m.position.y += vy * dt; m.position.z += vz * dt;
    vy -= g * dt;
    if (m.position.y < size / 2) { m.position.y = size / 2; vy = Math.abs(vy) * 0.3; vx *= 0.7; vz *= 0.7; }
    m.rotation.x += rx * dt; m.rotation.z += rz * dt;
    if (shrink) m.scale.setScalar(size * Math.max(0, 1 - t / life));
    return t < life;
  });
}
function burst(x, y, color, n = 8, speed = 5, size = 0.14, opts = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(speed * 0.4, speed);
    particle(x, y, rand(-0.3, 0.3), Math.cos(a) * s, Math.sin(a) * s + 1, rand(-2, 2), { color, size: size * rand(0.7, 1.3), life: rand(0.3, 0.7), ...opts });
  }
}
function ring(x, y, color, maxR, dur = 0.35) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.position.set(x, y, 0.3);
  let t = 0;
  addFx(m, (dt) => {
    t += dt;
    const k = t / dur;
    m.scale.setScalar(Math.max(0.01, maxR * k)); m.material.opacity = 0.9 * (1 - k);
    if (k >= 1) { m.material.dispose(); m.geometry.dispose(); return false; }
    return true;
  });
}
function explode(x, y, radius, dmg, color = 0xffa040) {
  sfx.boom();
  G.shake = Math.max(G.shake, 0.35);
  const ball = new THREE.Mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.95, depthWrite: false }));
  ball.position.set(x, y, 0.2);
  let t = 0;
  addFx(ball, (dt) => {
    t += dt;
    const k = t / 0.35;
    ball.scale.setScalar(radius * (0.4 + k * 0.8));
    ball.material.color.setHex(k < 0.4 ? 0xfff1a8 : color);
    ball.material.opacity = 0.95 * (1 - k);
    if (k >= 1) { ball.material.dispose(); return false; }
    return true;
  });
  burst(x, y, color, 14, 8, 0.22, { g: 10 });
  burst(x, y, 0x555555, 6, 4, 0.3, { g: -2, life: 0.8 });
  for (const b of G.boxes.slice()) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d <= radius + 0.5) damageBox(b, dmg * (1 - 0.25 * Math.min(1, d / (radius + 0.5))));
  }
}

// ---------------------------------------------------------------- kasser: skade, ødelæggelse, fald
function damageBox(b, d) {
  if (!b.alive) return;
  b.hp -= d;
  b.pop = 1;
  if (b.hp <= 0) destroyBox(b);
}
function destroyBox(b) {
  b.alive = false;
  dyn.remove(b.mesh);
  const i = G.boxes.indexOf(b);
  if (i >= 0) G.boxes.splice(i, 1);
  G.stabilize = 3;
  sfx.crack();
  const col = boxColor(b.type);
  for (let k = 0; k < 7; k++) {
    particle(b.x, b.y, rand(-0.3, 0.3), rand(-4, 4), rand(1, 6), rand(-2, 2), { color: col, size: rand(0.18, 0.32), life: rand(0.5, 0.9), std: true, shrink: true });
  }
  burst(b.x, b.y, 0xffffff, 4, 3, 0.1);
  const [lo, hi] = BOX_STATS[b.type].drop;
  const n = lo + Math.floor(Math.random() * (hi - lo + 1));
  for (let k = 0; k < n; k++) spawnDrop(b.x, b.y);
  if (b.type === 'tnt') addTimer(0.12, () => explode(b.x, b.y, 2.4, 3.5, 0xff7043));
}

function stabilizeBoxes(dt) {
  let moving = false;
  for (const b of G.boxes) {
    if (Math.abs(b.x - P.x) > 50) continue;
    let support = 0;
    for (const o of G.boxes) {
      if (o === b || o.y >= b.y - 0.01) continue;
      if (Math.abs(o.x - b.x) < 0.98) support = Math.max(support, o.y + 0.5);
    }
    const target = support + 0.5;
    if (b.y > target + 0.001) {
      b.vy -= 22 * dt;
      b.y = Math.max(target, b.y + b.vy * dt);
      if (b.y <= target + 0.0001) { b.vy = 0; b.pop = Math.max(b.pop, 0.3); }
      moving = true;
    } else {
      b.vy = 0;
    }
  }
  if (moving) G.stabilize = Math.max(G.stabilize, 0.3);
}

function boxesAt(x, y, r) {
  const out = [];
  for (const b of G.boxes) {
    if (Math.abs(b.x - x) > 0.5 + r + 0.05) continue;
    const dx = Math.max(Math.abs(x - b.x) - 0.5, 0), dy = Math.max(Math.abs(y - b.y) - 0.5, 0);
    if (dx * dx + dy * dy <= r * r) out.push(b);
  }
  return out;
}
function boxAt(x, y, r) {
  let best = null;
  for (const b of boxesAt(x, y, r)) if (!best || Math.abs(b.x - x) < Math.abs(best.x - x)) best = b;
  return best;
}

// ---------------------------------------------------------------- jernfirkanter
function spawnDrop(x, y) {
  const m = new THREE.Mesh(GEO.plate, plateMat);
  m.castShadow = true;
  m.position.set(x, y, rand(-0.2, 0.2));
  dyn.add(m);
  G.drops.push({ mesh: m, vx: rand(-3, 3), vy: rand(4, 8), vz: rand(-1, 1), t: 0, mag: 0 });
}
function updateDrops(dt) {
  const tx = P.x + 0.1, ty = 1.1;
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const d = G.drops[i], m = d.mesh;
    d.t += dt;
    m.rotation.y += dt * 8;
    if (d.t < 0.5) {
      d.vy -= 20 * dt;
      m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt;
      if (m.position.y < 0.15) { m.position.y = 0.15; d.vy = Math.abs(d.vy) * 0.45; d.vx *= 0.7; }
    } else {
      d.mag += dt * 30;
      const dx = tx - m.position.x, dy = ty - m.position.y, dz = -m.position.z;
      const dist = Math.hypot(dx, dy, dz);
      const s = Math.min(dist, d.mag * dt * 1.2 + 6 * dt);
      m.position.x += (dx / dist) * s; m.position.y += (dy / dist) * s; m.position.z += (dz / dist) * s;
      if (dist < 0.5) {
        dyn.remove(m); G.drops.splice(i, 1);
        collectSquare();
      }
    }
  }
}
let squaresEl = $('squares');
function collectSquare() {
  save.squares++; G.earned++;
  squaresEl.textContent = save.squares;
  squaresEl.parentElement.classList.remove('pop'); void squaresEl.offsetWidth; squaresEl.parentElement.classList.add('pop');
  sfx.coin();
}

// ---------------------------------------------------------------- våben og skud
function muzzle() { return { x: P.x + 0.95, y: 0.95 }; }

function fireSlot(s) {
  const id = save.slots[s];
  const st = stats(id, save.levels[id] || 1);
  G.cd[s] = G.cdMax[s] = st.cooldown;
  setHeld(id);
  P.recoil = 1;
  sfx.shoot(id);
  const m = muzzle();
  switch (st.kind) {
    case 'bullet': {
      const mesh = new THREE.Mesh(GEO.sphere, basic(0x80e8ff));
      mesh.scale.set(0.35, 0.16, 0.16); mesh.position.set(m.x, m.y, 0);
      dyn.add(mesh);
      G.projectiles.push({ kind: 'bullet', x: m.x, y: m.y, vx: 28, vy: 0, r: 0.2, dmg: st.dmg, life: 1.2, mesh });
      burst(m.x, m.y, 0x80e8ff, 3, 3, 0.08);
      break;
    }
    case 'lob': {
      const mesh = new THREE.Mesh(GEO.sphere, stdMat(0x222222));
      mesh.scale.setScalar(0.28); mesh.position.set(m.x, m.y, 0);
      const fuse = new THREE.Mesh(GEO.sphere, basic(0xffee58)); fuse.scale.setScalar(0.35); fuse.position.y = 1.1; mesh.add(fuse);
      mesh.castShadow = true;
      dyn.add(mesh);
      G.projectiles.push({ kind: 'bomb', x: m.x, y: m.y, vx: 7.5, vy: 4.5, r: 0.6, dmg: st.dmg, radius: st.radius, life: 3, mesh });
      break;
    }
    case 'flame': {
      const mesh = new THREE.Mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.9, depthWrite: false }));
      mesh.scale.setScalar(0.25); mesh.position.set(m.x, m.y, 0.1);
      dyn.add(mesh);
      G.projectiles.push({ kind: 'flame', x: m.x, y: m.y, vx: 13 + rand(-1, 1), vy: rand(-0.6, 0.9), r: 0.3, dmg: st.dmg, life: 0.42, age: 0, hit: new Set(), mesh });
      break;
    }
    case 'disc': {
      const mesh = makeWeaponModel('saw').children[0].clone();
      mesh.position.set(m.x, m.y, 0); mesh.scale.setScalar(1.1);
      dyn.add(mesh);
      G.projectiles.push({ kind: 'saw', x: m.x, y: m.y, vx: 15, vy: 0, r: 0.38, dmg: st.dmg, pierce: st.pierce, hits: 0, hit: new Set(), life: 1.5, mesh });
      break;
    }
    case 'beam': fireLightning(st, m); break;
    case 'rocket': {
      const targets = G.boxes.filter((b) => b.x > m.x - 0.5).sort((a, b) => a.x - b.x).slice(0, 6);
      for (let i = 0; i < st.count; i++) {
        addTimer(i * 0.13, () => {
          const mesh = new THREE.Group();
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8).rotateZ(Math.PI / 2), stdMat(0xffffff));
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 8).rotateZ(-Math.PI / 2), stdMat(0xec407a)); tip.position.x = 0.35;
          mesh.add(body, tip);
          const mm = muzzle();
          mesh.position.set(mm.x, mm.y, 0);
          dyn.add(mesh);
          const ang = (i - (st.count - 1) / 2) * 0.42 + 0.15;
          G.projectiles.push({ kind: 'rocket', x: mm.x, y: mm.y, ang, speed: 8, r: 0.25, dmg: st.dmg, radius: st.radius, target: targets.length ? targets[i % targets.length] : null, life: 2.6, smoke: 0, mesh });
          sfx.shoot('rocket');
        });
      }
      break;
    }
    case 'disco': {
      const mesh = makeWeaponModel('disco').children[0].clone();
      mesh.material = mesh.material.clone();
      mesh.scale.setScalar(1.5); mesh.position.set(m.x, m.y, 0);
      dyn.add(mesh);
      G.projectiles.push({ kind: 'disco', x: m.x, y: m.y, vx: 7, vy: 3.2, r: 0.5, dmg: st.dmg, radius: st.radius, pulses: st.pulses, stage: 'fly', age: 0, pulseT: 0, mesh });
      break;
    }
    case 'spread': {
      for (let i = 0; i < st.count; i++) {
        const a = (i - (st.count - 1) / 2) * (0.5 / Math.max(1, st.count - 1)) + rand(-0.04, 0.04);
        const sp = rand(17, 21);
        const mesh = new THREE.Mesh(GEO.box, basic([0xff5252, 0xffeb3b, 0x69f0ae, 0x40c4ff, 0xe040fb][i % 5]));
        mesh.scale.set(0.2, 0.2, 0.06); mesh.position.set(m.x, m.y, 0);
        dyn.add(mesh);
        G.projectiles.push({ kind: 'pellet', x: m.x, y: m.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 0.18, dmg: st.dmg, life: 0.55, mesh });
      }
      burst(m.x, m.y, 0xffeb3b, 8, 6, 0.1, { g: 6 });
      break;
    }
  }
}

function fireLightning(st, m) {
  const range = 18;
  let first = null;
  for (const b of G.boxes) {
    if (b.x - 0.5 < m.x - 0.3 || b.x - m.x > range) continue;
    if (Math.abs(b.y - m.y) > 0.62) continue;
    if (!first || b.x < first.x) first = b;
  }
  const pts = [{ x: m.x, y: m.y }];
  if (first) {
    const hit = new Set([first]);
    pts.push({ x: first.x - 0.5, y: first.y });
    let cur = first;
    for (let i = 0; i < st.chain; i++) {
      let best = null, bd = 3.3;
      for (const b of G.boxes) {
        if (hit.has(b)) continue;
        const d = Math.hypot(b.x - cur.x, b.y - cur.y);
        if (d < bd) { bd = d; best = b; }
      }
      if (!best) break;
      hit.add(best); pts.push({ x: best.x, y: best.y }); cur = best;
    }
    for (const b of hit) { burst(b.x, b.y, 0xfff176, 5, 5, 0.12); }
    pts.forEach((p, i) => { if (i > 0) ring(p.x, p.y, 0xfff176, 0.9, 0.25); });
    for (const b of hit) damageBox(b, st.dmg);
  } else {
    pts.push({ x: m.x + range * 0.55, y: m.y });
  }
  drawBolt(pts);
}
function drawBolt(pts) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff59d });
  const core = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const segs = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 0.8));
    let px = a.x, py = a.y;
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      const nx = a.x + (b.x - a.x) * t, ny = a.y + (b.y - a.y) * t + (s < segs ? rand(-0.35, 0.35) : 0);
      const len = Math.hypot(nx - px, ny - py);
      for (const [mt, th] of [[mat, 0.2], [core, 0.08]]) {
        const seg = new THREE.Mesh(GEO.box, mt);
        seg.scale.set(len + 0.05, th, th);
        seg.position.set((px + nx) / 2, (py + ny) / 2, 0.2);
        seg.rotation.z = Math.atan2(ny - py, nx - px);
        g.add(seg);
      }
      px = nx; py = ny;
    }
  }
  let t = 0;
  addFx(g, (dt) => {
    t += dt;
    g.children.forEach((c) => { c.scale.y = c.scale.z = Math.max(0.01, c.scale.y * (1 - dt * 6)); });
    return t < 0.18;
  });
}

function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i];
    const alive = stepProjectile(p, dt);
    if (!alive) {
      dyn.remove(p.mesh);
      if (p.mesh.material && p.kind === 'flame') p.mesh.material.dispose();
      G.projectiles.splice(i, 1);
    }
  }
}

function stepProjectile(p, dt) {
  switch (p.kind) {
    case 'bullet':
    case 'pellet': {
      if (p.kind === 'pellet') { p.vy -= 5 * dt; p.mesh.rotation.z += dt * 15; }
      const steps = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy) * dt) / 0.3));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        p.x += p.vx * h; p.y += p.vy * h;
        const b = boxAt(p.x, p.y, p.r);
        if (b) { damageBox(b, p.dmg); burst(p.x, p.y, p.kind === 'bullet' ? 0x80e8ff : 0xffeb3b, 4, 4, 0.1); return false; }
      }
      p.mesh.position.set(p.x, p.y, 0);
      if (p.y < 0.05) return false;
      p.life -= dt;
      return p.life > 0;
    }
    case 'bomb': {
      p.vy -= 24 * dt;
      const steps = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy) * dt) / 0.3));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        p.x += p.vx * h; p.y += p.vy * h;
        if (boxAt(p.x, p.y, p.r) || p.y < 0.3) { explode(p.x, p.y, p.radius, p.dmg, 0xffa040); return false; }
      }
      p.mesh.position.set(p.x, p.y, 0); p.mesh.rotation.z -= dt * 9;
      p.life -= dt;
      return p.life > 0;
    }
    case 'flame': {
      p.age += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 1.5 * dt;
      const k = p.age / p.life;
      const rr = p.r + k * 0.5;
      for (const b of boxesAt(p.x, p.y, rr)) {
        if (!p.hit.has(b)) { p.hit.add(b); damageBox(b, p.dmg); burst(p.x, p.y, 0xff9800, 2, 3, 0.1); }
      }
      p.mesh.position.set(p.x, p.y, 0.1);
      p.mesh.scale.setScalar(0.25 + k * 0.7);
      p.mesh.material.color.setHex(k < 0.35 ? 0xffeb3b : k < 0.7 ? 0xff7043 : 0x757575);
      p.mesh.material.opacity = 0.9 * (1 - k * 0.8);
      return p.age < p.life;
    }
    case 'saw': {
      const steps = Math.max(1, Math.ceil((p.vx * dt) / 0.3));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        p.x += p.vx * h;
        for (const b of boxesAt(p.x, p.y, p.r)) {
          if (p.hit.has(b)) continue;
          p.hit.add(b); p.hits++;
          damageBox(b, p.dmg);
          burst(p.x, p.y, 0xffd54f, 6, 6, 0.1);
          if (p.hits >= p.pierce) return false;
        }
      }
      p.mesh.position.set(p.x, p.y, 0); p.mesh.rotation.z -= dt * 22;
      p.life -= dt;
      return p.life > 0;
    }
    case 'rocket': {
      if (!p.target || !p.target.alive) {
        let best = null;
        for (const b of G.boxes) if (b.x > p.x - 0.3 && (!best || Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y))) best = b;
        p.target = best;
      }
      p.speed = Math.min(p.speed + 26 * dt, 19);
      if (p.target) {
        const want = Math.atan2(p.target.y - p.y, p.target.x - p.x);
        let diff = want - p.ang;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = 4.5 * dt;
        p.ang += clamp(diff, -maxTurn, maxTurn);
      } else p.ang *= 0.95;
      const steps = Math.max(1, Math.ceil((p.speed * dt) / 0.3));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        p.x += Math.cos(p.ang) * p.speed * h; p.y += Math.sin(p.ang) * p.speed * h;
        if (boxAt(p.x, p.y, p.r) || p.y < 0.2) { explode(p.x, p.y, p.radius, p.dmg, 0xff7043); return false; }
      }
      p.mesh.position.set(p.x, p.y, 0); p.mesh.rotation.z = p.ang;
      p.smoke -= dt;
      if (p.smoke <= 0) { p.smoke = 0.035; particle(p.x - Math.cos(p.ang) * 0.3, p.y - Math.sin(p.ang) * 0.3, 0, rand(-0.5, 0.5), rand(0, 1), 0, { color: 0xeeeeee, size: 0.22, life: 0.45, g: -1 }); }
      p.life -= dt;
      if (p.life <= 0) { explode(p.x, p.y, p.radius, p.dmg, 0xff7043); return false; }
      return true;
    }
    case 'disco': {
      p.age += dt;
      p.mesh.rotation.y += dt * 5;
      p.mesh.material.emissive.setHSL((p.age * 1.5) % 1, 1, 0.5);
      p.mesh.material.emissiveIntensity = 0.8;
      if (p.stage === 'fly') {
        p.vy -= 3 * dt;
        p.x += p.vx * dt; p.y = Math.max(1.4, p.y + p.vy * dt);
        if (boxAt(p.x + 0.4, p.y, p.r) || p.age > 0.9) { p.stage = 'pulse'; p.pulseT = 0.1; }
      } else {
        p.mesh.position.y = p.y + Math.sin(p.age * 6) * 0.12;
        p.pulseT -= dt;
        if (p.pulseT <= 0) {
          p.pulseT = 0.42; p.pulses--;
          sfx.shoot('disco');
          const hue = (p.age * 0.8) % 1;
          ring(p.x, p.y, new THREE.Color().setHSL(hue, 1, 0.6), p.radius, 0.4);
          burst(p.x, p.y, new THREE.Color().setHSL(hue, 1, 0.65).getHex(), 10, 7, 0.14, { g: 4 });
          for (const b of G.boxes.slice()) if (Math.hypot(b.x - p.x, b.y - p.y) <= p.radius + 0.5) damageBox(b, p.dmg);
          G.shake = Math.max(G.shake, 0.12);
          if (p.pulses <= 0) { burst(p.x, p.y, 0xffffff, 16, 8, 0.16); return false; }
        }
      }
      p.mesh.position.x = p.x;
      if (p.stage === 'fly') p.mesh.position.y = p.y;
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- input (knapper)
const btns = [$('btn0'), $('btn1')];
function renderButtons() {
  btns.forEach((b, i) => {
    const id = save.slots[i], w = WEAPON_BY_ID[id], lvl = save.levels[id] || 1;
    b.style.setProperty('--c', w.color);
    b.innerHTML = `<span class="cd"></span><span class="ic">${w.icon}</span><span class="nm">${w.name}</span><span class="pips">${'●'.repeat(lvl)}<i>${'●'.repeat(MAX_LEVEL - lvl)}</i></span>`;
  });
}
function fireAllowed() { return G.mode === 'playing' || G.mode === 'pickup'; }

btns.forEach((b, i) => {
  const down = (e) => {
    e.preventDefault();
    initAudio();
    if (G.mode === 'choosing') { swapWeapon(i); return; }
    if (fireAllowed()) { G.holding[i] = true; b.classList.add('down'); }
  };
  const up = () => { G.holding[i] = false; b.classList.remove('down'); };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('pointerleave', up);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const slot = ['KeyZ', 'KeyA', 'Space', 'ArrowLeft'].includes(e.code) ? 0 : ['KeyX', 'KeyS', 'ArrowRight'].includes(e.code) ? 1 : -1;
  if (slot < 0) return;
  e.preventDefault(); initAudio();
  if (G.mode === 'choosing') swapWeapon(slot); else if (fireAllowed()) G.holding[slot] = true;
});
window.addEventListener('keyup', (e) => {
  if (['KeyZ', 'KeyA', 'Space', 'ArrowLeft'].includes(e.code)) G.holding[0] = false;
  if (['KeyX', 'KeyS', 'ArrowRight'].includes(e.code)) G.holding[1] = false;
});

// ---------------------------------------------------------------- pickups
const banner = $('banner'), bannerText = $('banner-text'), cancelBtn = $('cancel-pick'), pkHint = $('pk-hint');
let bannerTimer = 0;
function showBanner(html, ms = 0, withCancel = false) {
  banner.classList.remove('hidden');
  bannerText.innerHTML = html;
  cancelBtn.classList.toggle('hidden', !withCancel);
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => banner.classList.add('hidden'), ms);
}
function hideBanner() { banner.classList.add('hidden'); }

function currentPickup() { return G.pickups.find((p) => !p.taken && !p.skipped && p.x - 3.4 <= P.x + 0.01); }

stage.addEventListener('pointerdown', (e) => {
  initAudio();
  if (G.mode !== 'pickup') return;
  const pk = currentPickup();
  if (!pk) return;
  const rect = stage.getBoundingClientRect();
  const v = new THREE.Vector3(pk.x, 1.7, 0).project(camera);
  const sx = (v.x * 0.5 + 0.5) * rect.width, sy = (-v.y * 0.5 + 0.5) * rect.height;
  const dist = Math.hypot(e.clientX - rect.left - sx, e.clientY - rect.top - sy);
  if (dist < Math.max(80, rect.height * 0.2)) startChoosing(pk);
});

function startChoosing(pk) {
  // hvis våbnet allerede sidder i en slot, byt det ud med et andet
  if (save.slots.includes(pk.weaponId)) {
    const others = WEAPONS.map((w) => w.id).filter((id) => !save.slots.includes(id));
    setPickupModel(pk, others[Math.floor(Math.random() * others.length)]);
  }
  G.mode = 'choosing'; G.pending = pk;
  G.holding[0] = G.holding[1] = false;
  pkHint.classList.add('hidden');
  const w = WEAPON_BY_ID[pk.weaponId];
  sfx.ui();
  showBanner(`<span class="big-ic">${w.icon}</span> <b>${w.name}</b><br>Tryk på det våben du vil bytte ud ⬇️`, 0, true);
  btns.forEach((b) => b.classList.add('choose'));
}
function endChoosing() {
  btns.forEach((b) => b.classList.remove('choose'));
  hideBanner();
}
function swapWeapon(slot) {
  const pk = G.pending; if (!pk) return;
  const id = pk.weaponId;
  save.slots[slot] = id;
  if (!save.discovered.includes(id)) save.discovered.push(id);
  save.levels[id] = save.levels[id] || 1;
  writeSave(save);
  pk.taken = true;
  world.remove(pk.group);
  burst(pk.x, 1.7, WEAPON_BY_ID[id].hex, 24, 8, 0.2, { g: 6 });
  ring(pk.x, 1.7, WEAPON_BY_ID[id].hex, 3, 0.5);
  sfx.pickup();
  setHeld(id);
  renderButtons();
  endChoosing();
  G.pending = null;
  G.mode = 'playing';
}
cancelBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  const pk = G.pending; if (pk) pk.skipped = true;
  G.pending = null; endChoosing(); G.mode = 'playing'; sfx.ui();
});

// ---------------------------------------------------------------- skærme / flow
const startScreen = $('screen-start'), shopScreen = $('screen-shop');

$('play').addEventListener('click', () => { initAudio(); sfx.ui(); startLevel(save.level); });
$('reset').addEventListener('click', () => {
  if (confirm('Vil du starte helt forfra?')) { save = freshSave(); writeSave(save); squaresEl.textContent = 0; renderButtons(); updateStartLabel(); }
});
$('next').addEventListener('click', () => { initAudio(); sfx.ui(); save.level = G.level + 1; writeSave(save); startLevel(save.level); });
$('mute').addEventListener('click', () => { initAudio(); setMuted(!isMuted()); $('mute').textContent = isMuted() ? '🔇' : '🔊'; });
function updateStartLabel() { $('play').textContent = save.level > 1 ? `Spil bane ${save.level} ▶` : 'Spil ▶'; }

function startLevel(n) {
  buildLevel(n);
  P.x = 0; P.recoil = 0; G.earned = 0; G.walkT = 0; G.stabilize = 0; G.camX = 3.8;
  G.holding[0] = G.holding[1] = false; G.cd[0] = G.cd[1] = 0;
  setHeld(save.slots[0]);
  startScreen.classList.add('hidden'); shopScreen.classList.add('hidden');
  $('level-label').textContent = `Bane ${n}`;
  squaresEl.textContent = save.squares;
  renderButtons();
  G.mode = 'playing';
  showBanner(`Bane ${n} – skyd kasserne! 💥`, 2500);
}

function finishLevel() {
  G.mode = 'finishing';
  G.holding[0] = G.holding[1] = false;
  sfx.win();
  for (let i = 0; i < 70; i++) {
    addTimer(i * 0.02, () => particle(G.length + rand(-3, 3), rand(3, 5), rand(-1, 1), rand(-3, 3), rand(2, 9), rand(-2, 2), { color: [0xff5252, 0xffeb3b, 0x69f0ae, 0x40c4ff, 0xe040fb][Math.floor(Math.random() * 5)], size: 0.2, life: 1.6, g: 6 }));
  }
  save.level = G.level;
  writeSave(save);
  addTimer(2.0, openShop);
}

function openShop() {
  G.mode = 'shop';
  hideBanner();
  $('shop-earned').innerHTML = `Du samlede <b>${G.earned}</b> <span class="sq"></span> på banen!`;
  renderShop();
  shopScreen.classList.remove('hidden');
}
function renderShop() {
  $('shop-squares').textContent = save.squares;
  squaresEl.textContent = save.squares;
  const list = $('shop-list');
  list.innerHTML = '';
  for (const id of save.discovered) {
    const w = WEAPON_BY_ID[id], lvl = save.levels[id] || 1, cost = upgradeCost(lvl), maxed = lvl >= MAX_LEVEL;
    const card = document.createElement('div');
    card.className = 'wcard';
    card.style.setProperty('--c', w.color);
    const s = stats(id, lvl);
    card.innerHTML = `
      <div class="wc-top"><span class="ic">${w.icon}</span><div><b>${w.name}</b><div class="pips">${'●'.repeat(lvl)}<i>${'●'.repeat(MAX_LEVEL - lvl)}</i></div></div></div>
      <div class="wc-slots">${[0, 1].map((n) => `<button data-slot="${n}" class="${save.slots[n] === id ? 'on' : ''}">Knap ${n + 1}</button>`).join('')}</div>
      <button class="up" ${maxed || save.squares < cost ? 'disabled' : ''}>${maxed ? 'MAX ⭐' : `Opgradér <span class="sq"></span>${cost}`}</button>`;
    card.querySelector('.up').addEventListener('click', () => {
      if (maxed || save.squares < cost) return;
      initAudio(); save.squares -= cost; save.levels[id] = lvl + 1; writeSave(save); sfx.upgrade(); renderShop(); renderButtons();
    });
    card.querySelectorAll('[data-slot]').forEach((btn) => btn.addEventListener('click', () => {
      initAudio();
      const n = +btn.dataset.slot;
      const other = save.slots[n];
      const cur = save.slots.indexOf(id);
      if (cur === n) return;
      if (cur >= 0) save.slots[cur] = other;
      save.slots[n] = id;
      writeSave(save); sfx.ui(); renderShop(); renderButtons();
    }));
    list.appendChild(card);
  }
}

// ---------------------------------------------------------------- hoved-loop
const clock = new THREE.Clock();
const progressFill = $('progress-fill');

function updatePlayer(dt) {
  const active = G.mode === 'playing';
  // blokeret af kasse?
  let blocked = false;
  const front = P.x + 1.6;
  for (const b of G.boxes) {
    if (b.x > P.x - 0.2 && b.x - 0.5 < front && b.y - 0.5 < 1.7) { blocked = true; break; }
  }
  P.blocked = blocked;
  let walking = false;
  if (active) {
    // stop ved våben-pickup
    const pk = currentPickup();
    if (pk) {
      G.mode = 'pickup';
      showBanner('Nyt våben! Tryk på det 👆');
    } else if (!blocked) {
      P.x += 3.6 * dt; walking = true;
      if (P.x >= G.length) finishLevel();
    }
  } else if (G.mode === 'finishing') {
    P.x += 3.6 * dt; walking = true;
  }
  G.walkT += dt * (walking ? 1 : 0.35);
  const t = G.walkT * 10;
  const sw = walking ? 0.8 : 0.05;
  player.legs[0].rotation.z = Math.sin(t) * sw;
  player.legs[1].rotation.z = -Math.sin(t) * sw;
  player.armBack.rotation.z = Math.sin(t) * sw * 0.8;
  player.body.position.y = 0.95 + (walking ? Math.abs(Math.sin(t)) * 0.06 : Math.sin(G.walkT * 4) * 0.015);
  player.tail.rotation.z = Math.sin(G.walkT * 8) * 0.25;
  player.head.rotation.z = walking ? Math.sin(t * 2) * 0.03 : 0;
  P.recoil = Math.max(0, P.recoil - dt * 6);
  player.arm.rotation.z = 1.2 + P.recoil * 0.2; // armen peger frem
  player.holder.position.x = 0.5 - P.recoil * 0.12;
  player.group.position.x = P.x;
  if (heldModel && heldModel.userData.disc) heldModel.userData.disc.rotation.z -= dt * 10;
  if (heldModel && heldModel.userData.ball) heldModel.userData.ball.rotation.y += dt * 3;
}

function updatePickups(dt, time) {
  for (const pk of G.pickups) {
    if (pk.taken) continue;
    pk.holder.position.y = 1.7 + Math.sin(time * 2 + pk.x) * 0.15;
    pk.holder.rotation.y += dt * 1.8;
    pk.halo.scale.setScalar(1 + Math.sin(time * 4) * 0.06);
    pk.ring.rotation.y += dt;
  }
  // hint-pil over pickup
  if (G.mode === 'pickup') {
    const pk = currentPickup();
    if (pk) {
      const v = new THREE.Vector3(pk.x, 3.5, 0).project(camera);
      pkHint.style.left = `${(v.x * 0.5 + 0.5) * stage.clientWidth}px`;
      pkHint.style.top = `${(-v.y * 0.5 + 0.5) * stage.clientHeight}px`;
      pkHint.classList.remove('hidden');
    }
  }
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (G.mode !== 'shop') {
    // skydning
    if (fireAllowed()) {
      for (let s = 0; s < 2; s++) {
        G.cd[s] = Math.max(0, G.cd[s] - dt);
        if (G.holding[s] && G.cd[s] <= 0) fireSlot(s);
      }
    } else { G.cd[0] = Math.max(0, G.cd[0] - dt); G.cd[1] = Math.max(0, G.cd[1] - dt); }

    updatePlayer(dt);
    updatePickups(dt, time);
    updateProjectiles(dt);
    if (G.stabilize > 0) { G.stabilize -= dt; stabilizeBoxes(dt); }
    for (const b of G.boxes) {
      b.pop = Math.max(0, b.pop - dt * 5);
      const sc = 1 + Math.sin(b.pop * Math.PI) * 0.18;
      b.mesh.scale.set(sc, sc, sc);
      b.mesh.position.set(b.x, b.y, 0);
    }
    updateDrops(dt);
    for (let i = G.fx.length - 1; i >= 0; i--) {
      const f = G.fx[i];
      if (!f.update(dt)) { dyn.remove(f.mesh); G.fx.splice(i, 1); }
    }
    for (let i = G.timers.length - 1; i >= 0; i--) {
      G.timers[i].t -= dt;
      if (G.timers[i].t <= 0) { const fn = G.timers[i].fn; G.timers.splice(i, 1); fn(); }
    }
    progressFill.style.width = `${clamp((P.x / G.length) * 100, 0, 100)}%`;
  }

  // knapper: nedkøling
  btns.forEach((b, i) => {
    const cd = b.firstElementChild;
    if (cd) cd.style.height = `${clamp(G.cd[i] / G.cdMax[i], 0, 1) * 100}%`;
  });

  // kamera
  G.camX += (P.x + 4.2 - G.camX) * Math.min(1, dt * 5);
  G.shake = Math.max(0, G.shake - dt * 1.6);
  const sx = (Math.random() - 0.5) * G.shake, sy = (Math.random() - 0.5) * G.shake;
  const cx = G.camX;
  camera.position.set(cx - 2.6 + sx, 3.6 + sy, camDist);
  camera.lookAt(cx, 1.9, 0);
  sun.position.set(cx + 9, 16, 11);
  sun.target.position.set(cx, 0, 0);
  sun.target.updateMatrixWorld();

  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- start
resize();
buildLevel(save.level);   // baggrund til startskærmen
setHeld(save.slots[0]);
renderButtons();
updateStartLabel();
squaresEl.textContent = save.squares;
G.camX = 3.8;
frame();
