// Små syntetiserede lydeffekter (ingen lydfiler nødvendige)
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
let lastCoin = 0;

export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }
export function isMuted() { return muted; }

function tone({ type = 'square', f0 = 440, f1 = null, dur = 0.15, vol = 0.2, delay = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise({ dur = 0.2, vol = 0.25, freq = 1200, delay = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(100, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.02);
}

export const sfx = {
  shoot(id) {
    switch (id) {
      case 'blaster': tone({ f0: 900, f1: 250, dur: 0.12, vol: 0.15 }); break;
      case 'bomb': tone({ type: 'sine', f0: 300, f1: 90, dur: 0.25, vol: 0.3 }); break;
      case 'flame': noise({ dur: 0.1, vol: 0.12, freq: 3000 }); break;
      case 'saw': tone({ type: 'sawtooth', f0: 200, f1: 700, dur: 0.25, vol: 0.12 }); break;
      case 'lightning': tone({ type: 'sawtooth', f0: 1500, f1: 80, dur: 0.22, vol: 0.14 }); noise({ dur: 0.15, vol: 0.12, freq: 6000 }); break;
      case 'rocket': noise({ dur: 0.4, vol: 0.2, freq: 2500 }); tone({ type: 'sine', f0: 200, f1: 500, dur: 0.3, vol: 0.12 }); break;
      case 'disco': [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.2, vol: 0.14, delay: i * 0.06 })); break;
      case 'confetti': noise({ dur: 0.2, vol: 0.2, freq: 5000 }); tone({ type: 'triangle', f0: 600, f1: 1200, dur: 0.12, vol: 0.12 }); break;
    }
  },
  crack() { noise({ dur: 0.18, vol: 0.22, freq: 2500 }); tone({ type: 'square', f0: 180, f1: 70, dur: 0.12, vol: 0.1 }); },
  boom() { noise({ dur: 0.55, vol: 0.45, freq: 1500 }); tone({ type: 'sine', f0: 140, f1: 40, dur: 0.45, vol: 0.4 }); },
  coin() {
    const now = performance.now();
    if (now - lastCoin < 40) return;
    lastCoin = now;
    tone({ type: 'square', f0: 1200 + Math.random() * 300, f1: 1800, dur: 0.07, vol: 0.06 });
  },
  pickup() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.18, vol: 0.2, delay: i * 0.07 })); },
  ui() { tone({ type: 'triangle', f0: 700, f1: 1000, dur: 0.1, vol: 0.18 }); },
  upgrade() { [440, 554, 659, 880].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.12, vol: 0.12, delay: i * 0.06 })); },
  win() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.25, vol: 0.2, delay: i * 0.12 })); },
};
