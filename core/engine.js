'use strict';
/* =========================================================
 * engine.js — 引擎底座
 * 常量 / 数学工具 / 输入 / WebAudio 音效 / 粒子特效
 * ========================================================= */

const CONFIG = {
  W: 1280, H: 720,        // 逻辑分辨率
  FLOOR: 620,             // 地面 y（角色脚底）
  XMIN: 70, XMAX: 1210,   // 竞技场水平边界
  GRAV: 2000,             // 常规重力
  JGRAV: 0.42,            // 被挑空连段(juggle)时的重力倍率
};

const UT = {
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a),
  ri: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: arr => arr[Math.random() * arr.length | 0],
  chance: p => Math.random() < p,
  d2: (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
};

/* ---------------- 输入 ---------------- */
const KEYMAP = {
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ' ': 'jump', j: 'light', k: 'heavy', l: 'launch',
  u: 's1', i: 's2', o: 'ult', q: 'code',
  e: 'confirm', Enter: 'confirm', Shift: 'dodge',
  Escape: 'pause', m: 'music',
};

class Input {
  constructor() { this.down = {}; this.edge = {}; this.any = false; }
  init() {
    window.addEventListener('keydown', e => {
      const k = KEYMAP[e.key] || KEYMAP[(e.key || '').toLowerCase()];
      SFX.init();                                  // 首次按键激活音频
      if (k) { e.preventDefault(); if (!e.repeat) { this.down[k] = true; this.edge[k] = true; this.any = true; } }
      else this.any = true;
    });
    window.addEventListener('keyup', e => {
      const k = KEYMAP[e.key] || KEYMAP[(e.key || '').toLowerCase()];
      if (k) { this.down[k] = false; this.edge[k] = false; }
    });
    window.addEventListener('blur', () => { this.down = {}; });
  }
  isDown(k) { return !!this.down[k]; }
  pressed(k) { return !!this.edge[k]; }
  endFrame() { this.edge = {}; this.any = false; }
}
const input = new Input();

/* ---------------- 音效（WebAudio 合成，无素材依赖） ---------------- */
const SFX = {
  ctx: null, master: null, musicOn: false, beatT: 0, beatN: 0,
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(f0, f1, dur, type = 'sine', vol = 0.16, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.2, cut = 900, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t);
  },
  play(n) {
    if (!this.ctx) return;
    switch (n) {
      case 'slash':  this.noise(0.09, 0.22, 1400); this.tone(300, 120, 0.08, 'sawtooth', 0.08); break;
      case 'hit':    this.tone(180, 60, 0.07, 'square', 0.18); this.noise(0.06, 0.18, 800); break;
      case 'heavy':  this.tone(110, 40, 0.16, 'sawtooth', 0.25); this.noise(0.14, 0.25, 500); break;
      case 'launch': this.tone(240, 700, 0.16, 'square', 0.14); this.noise(0.12, 0.2, 1600); break;
      case 'casting':this.tone(440, 880, 0.18, 'sine', 0.12); break;
      case 'zap':    this.tone(1100, 160, 0.09, 'square', 0.15); this.noise(0.06, 0.12, 3000); break;
      case 'boom':   this.noise(0.35, 0.35, 420); this.tone(90, 30, 0.3, 'sawtooth', 0.28); break;
      case 'beam':   this.tone(1400, 500, 0.35, 'sawtooth', 0.2); this.noise(0.3, 0.2, 5000); break;
      case 'warn':   this.tone(1300, 1300, 0.08, 'square', 0.14); this.tone(1300, 1300, 0.08, 'square', 0.14, 0.12); break;
      case 'hurt':   this.tone(260, 90, 0.14, 'sawtooth', 0.2); break;
      case 'die':    this.noise(0.3, 0.28, 700); this.tone(300, 40, 0.3, 'sawtooth', 0.2); break;
      case 'rankup': this.tone(523, 1046, 0.12, 'square', 0.14); this.tone(1046, 2093, 0.14, 'square', 0.1, 0.1); break;
      case 'ui':     this.tone(660, 660, 0.05, 'square', 0.1); break;
      case 'ok':     this.tone(520, 780, 0.1, 'square', 0.12); break;
      case 'heal':   this.tone(520, 1020, 0.2, 'sine', 0.14); break;
      case 'dodge':  this.noise(0.08, 0.14, 2200); break;
      case 'roar':   this.tone(70, 45, 0.55, 'sawtooth', 0.3); this.noise(0.5, 0.25, 350); break;
      case 'fizz':   this.tone(220, 150, 0.12, 'square', 0.12); break;
    }
  },
  beat(dt) { // 极简节拍底鼓（M 键开关），可整体删除不影响玩法
    if (!this.musicOn || !this.ctx) return;
    this.beatT -= dt;
    if (this.beatT <= 0) {
      this.beatN++;
      this.beatT = 0.24;
      this.tone(this.beatN % 8 === 4 ? 110 : 55, 40, 0.1, 'square', 0.12);
      if (this.beatN % 4 === 0) this.noise(0.05, 0.05, 6000);
    }
  },
};
input.init();

/* ---------------- 特效系统（粒子 / 飘字 / 屏幕闪） ---------------- */
class Fx {
  constructor() { this.p = []; this.t = []; this.flash = 0; this.flashC = '#fff'; }
  spark(x, y, c, n = 10, sp = 320, g = 700, life = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = UT.rand(0, Math.PI * 2), s = UT.rand(sp * 0.3, sp);
      this.p.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - sp * 0.25, r: UT.rand(2, 5), life: UT.rand(life * 0.5, life), t: 0, c, g, kind: 'part' });
    }
  }
  ring(x, y, c, n = 14, sp = 380) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      this.p.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 3, life: 0.4, t: 0, c, g: 0, kind: 'part' });
    }
  }
  arc(x, y, f, c) { // 攻击挥击弧光
    for (let i = 0; i < 12; i++) {
      const a = UT.rand(-1.1, 1.1);
      const s = UT.rand(380, 640);
      this.p.push({ x, y, vx: f * Math.cos(a) * s, vy: Math.sin(a) * s, r: UT.rand(3, 6), life: 0.22, t: 0, c, g: 0, kind: 'slash' });
    }
  }
  trail(x, y, c, r = 4) {
    this.p.push({ x, y, vx: UT.rand(-30, 30), vy: UT.rand(-40, -8), r, life: 0.35, t: 0, c, g: -60, kind: 'part' });
  }
  text(x, y, s, c = '#fff', size = 20) {
    this.t.push({ x, y, s, c, size, life: 0.95, t: 0, vy: -64 });
  }
  dmg(x, y, v, big = false) {
    this.text(x + UT.rand(-14, 14), y - 70, '' + v, big ? '#ffd23c' : '#ffffff', big ? 26 : 19);
  }
  hitFlash(a = 0.25, c = '#fff') { this.flash = Math.max(this.flash, a); this.flashC = c; }
  update(dt) {
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i]; q.t += dt;
      q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.t >= q.life) this.p.splice(i, 1);
    }
    for (let i = this.t.length - 1; i >= 0; i--) {
      const q = this.t[i]; q.t += dt; q.y += q.vy * dt;
      if (q.t >= q.life) this.t.splice(i, 1);
    }
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }
  draw(ctx) {
    for (const q of this.p) {
      const k = 1 - q.t / q.life;
      ctx.globalAlpha = k;
      ctx.fillStyle = q.c;
      if (q.kind === 'slash') {
        ctx.fillRect(q.x - q.r * 2.2, q.y - 1.5, q.r * 4.4, 3);
      } else {
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * k, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const q of this.t) {
      const k = 1 - q.t / q.life;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.font = `bold ${q.size}px 'Segoe UI',sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = q.c;
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
      ctx.strokeText(q.s, q.x, q.y); ctx.fillText(q.s, q.x, q.y);
    }
    ctx.globalAlpha = 1;
    if (this.flash > 0.01) {
      ctx.globalAlpha = this.flash; ctx.fillStyle = this.flashC;
      ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
      ctx.globalAlpha = 1;
    }
  }
}
