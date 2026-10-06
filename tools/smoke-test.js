'use strict';
/* =========================================================
 * tools/smoke-test.js — 无头冒烟测试
 * 用法：node tools\smoke-test.js
 * 伪造 DOM/Canvas/输入，驱动 game.update/draw 跑一场完整战斗，
 * 保证任何角色下整个波次+Boss 流程无运行时异常。
 * ========================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'core/engine.js', 'data/characters.js', 'data/enemies.js',
  'core/entities.js', 'core/game.js',
];

function noop() {}
function makeGradient() { return { addColorStop: noop }; }
const ctxStub = {
  canvas: null,
  setTransform: noop, clearRect: noop, fillRect: noop, strokeRect: noop,
  beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop,
  ellipse: noop, quadraticCurveTo: noop, closePath: noop, fill: noop,
  stroke: noop, save: noop, restore: noop, translate: noop, scale: noop,
  rotate: noop, setLineDash: noop, fillText: noop, strokeText: noop,
  createLinearGradient: makeGradient, createRadialGradient: makeGradient,
};

const listeners = {};
const fakeWindow = {
  addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
  removeEventListener: noop,
  AudioContext: undefined, webkitAudioContext: undefined,
};
fakeWindow.window = fakeWindow;
const fakeDoc = { getElementById: id => ({ id, getContext: () => ctxStub, width: 1280, height: 720, focus: noop, }) };

const vm = require('vm');
const sandbox = {
  window: fakeWindow, document: fakeDoc,
  console, performance, Math, JSON,
  requestAnimationFrame: noop,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  vm.runInContext(src, sandbox, { filename: f });
}
const G = sandbox.window.G;
if (!G) throw new Error('window.G 未建立');
// 浏览器中 window.G 会自动成为裸全局 G，Node vm 需手动补上该绑定
vm.runInContext('this.G = window.G;', sandbox);

/* ----- 模拟按键 -----
 * 注意时序：keydown 必须在 G.update 之前、keyup 必须在 update 之后，
 * 否则 edge 状态先被 keyup 清除，update 读不到“按下沿”。
 */
function press(key) {
  for (const f of listeners.keydown || []) f({ key, repeat: false, preventDefault: noop });
  for (const f of listeners.keyup || []) f({ key, preventDefault: noop });
}
function pressNoRelease(k) { for (const f of listeners.keydown || []) f({ key: k, repeat: false, preventDefault: noop }); }
function keyup(k) { for (const f of listeners.keyup || []) f({ key: k, preventDefault: noop }); }

const script = [];  // (预留扩展：按帧充塞自定义动作)
/* 剧本：每帧调用 press 列表 */
const PLAN = {
  5: ['d'], 30: ['j'], 33: ['j'], 36: ['j'], 45: ['j'], 55: ['l'],
  58: ['j'], 60: ['d'], 75: ['u'], 100: ['i'], 130: ['k'], 150: ['shift'],
  200: ['q'], 202: ['ArrowRight'], 204: ['ArrowRight'], 206: ['ArrowLeft'],
  230: [' '], 240: [' '], 260: ['o'], 320: ['j'], 322: ['j'],
};

let dt = 1 / 60;
// 标题 → 选人 → 开战
G.update(dt); press('e');
G.update(dt);
for (let i = 0; i < 10; i++) press(['a', 'd', 'ArrowLeft', 'ArrowRight'][i % 4]);
G.update(dt);
G.startBattle(0);

function pressNoRelease(k) { for (const f of listeners.keydown || []) f({ key: k, repeat: false, preventDefault: noop }); }
function keyup(k) { for (const f of listeners.keyup || []) f({ key: k, preventDefault: noop }); }
function pressNoRelease(k) { for (const f of listeners.keydown || []) f({ key: k, repeat: false, preventDefault: noop }); }

/* ---- 简单战斗机器人：贴近出招、被打翻滚拉开 ---- */
let botLastHp = 1e9, botHurtT = 0, botDir = 1;
const keymapHeld = { left: 0, right: 0 };
function botThink() {
  const P = G.player;
  if (!P || P.dead || G.scene !== 'battle') { keymapHeld.left = 0; keymapHeld.right = 0; return; }
  if (P.hp < botLastHp) botHurtT = 0.8;
  botLastHp = P.hp;
  botHurtT = Math.max(0, botHurtT - 1 / 60);
  let near = null, nd = 1e9;
  for (const e of G.ens) if (!e.dead) { const d = Math.abs(e.x - P.x); if (d < nd) { nd = d; near = e; } }
  keymapHeld.left = 0; keymapHeld.right = 0;
  if (botHurtT > 0 && near && nd < 170) { botDir = P.x < near.x ? -1 : 1; keymapHeld[botDir > 0 ? 'right' : 'left'] = 1; } // 被打：撤离
  else if (near && nd > 120) { botDir = Math.sign(near.x - P.x) || botDir; keymapHeld[botDir > 0 ? 'right' : 'left'] = 1; }
}

const frames = 1600;
const downKeys = new Set();
function tap(k, queue) { if (!downKeys.has(k)) { queue.push(k); downKeys.add(k); } }

for (let i = 0; i < frames; i++) {
  if (PLAN[i]) for (const k of PLAN[i]) { press(k); }
  botThink();
  const taps = [];
  if (keymapHeld.left) tap('a', taps);
  if (keymapHeld.right) tap('d', taps);
  if (i % 8 === 0) tap('j', taps);
  if (i % 34 === 30) tap('k', taps);
  if (i % 55 === 40) tap('l', taps);
  if (i % 50 === 20) tap('u', taps);
  if (i % 70 === 45) tap('i', taps);
  if (i % 80 === 30) tap('o', taps);
  if (i % 65 === 0) tap(' ', taps);
  if (i % 100 === 60) { tap('q', taps); tap('ArrowRight', taps); tap('ArrowRight', taps); tap('ArrowLeft', taps); }
  // 本帧松开所有已按住的键（先记下再放，保证 down 一帧有效）
  const release = [...downKeys];
  // keydown（藏在 update 前）
  for (const k of taps) pressNoRelease(k);
  G.update(dt);
  G.draw();
  // update 之后统一 keyup
  for (const k of release) { keyup(k); downKeys.delete(k); }
}
console.log('首轮:', frames, '帧 · 场景:', G.scene, '· 击杀:', G.kills, '· 最高连段:', G.maxCombo, '· 风格:', G.style.rank, '· 时长:', G.battleT.toFixed(1) + 's');

/* ============================== 多角色覆盖 ============================== */
// 依次让 10 名角色各跑 1400 帧战斗，验证数据表全部内容无运行时错误
for (let ci = 0; ci < 10; ci++) {
  G.startBattle(ci);
  const frames2 = 1400;
  for (let i = 0; i < frames2; i++) {
    botThink();
    const taps = [];
    if (keymapHeld.left) tap('a', taps);
    if (keymapHeld.right) tap('d', taps);
    if (i % 8 === 0) tap('j', taps);
    if (i % 34 === 30) tap('k', taps);
    if (i % 55 === 40) tap('l', taps);
    if (i % 50 === 20) tap('u', taps);
    if (i % 70 === 45) tap('i', taps);
    if (i % 80 === 30) tap('o', taps);
    if (i % 65 === 0) tap(' ', taps);
    if (i % 100 === 60) { tap('q', taps); tap('ArrowRight', taps); tap('ArrowRight', taps); tap('ArrowLeft', taps); }
    if (i % 40 === 10) tap('Shift', taps);
    const release = [...downKeys];
    for (const k of taps) pressNoRelease(k);
    G.update(dt);
    G.draw();
    for (const k of release) { keyup(k); downKeys.delete(k); }
  }
  console.log(`角色 #${String(ci + 1).padStart(2, '0')} ${G.player.def.name} -> 场景=${G.scene} 击杀=${G.kills} 连段=${G.maxCombo} 时长=${G.battleT.toFixed(1)}s`);
}
console.log('全角色覆盖冒烟测试通过 ✓');
