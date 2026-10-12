'use strict';
/* =========================================================
 * tools/smoke-test.js — 无头冒烟测试
 * 用法：node tools\smoke-test.js
 * 伪造 DOM/Canvas/输入，驱动 game.update/draw 跑完整战斗：
 *   1) 全角色覆盖（CHARS.length 名角色各 1400 帧）
 *   2) 无尽深渊模式回路检查（Boss 波 / 精英波 / 难度缩放）
 * 保证数据表全部内容与流程代码无运行时异常。
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
const fakeDoc = { getElementById: id => ({ id, getContext: () => ctxStub, width: 1280, height: 720, focus: noop }) };

const vm = require('vm');
const sandbox = {
  window: fakeWindow, document: fakeDoc,
  console, performance, Math, JSON,
  requestAnimationFrame: noop,
};
vm.createContext(sandbox);
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const G = sandbox.window.G;
if (!G) throw new Error('window.G 未建立');
// 浏览器中 window.G 自动成为裸全局 G，Node vm 需手动补绑定
vm.runInContext('this.G = window.G;', sandbox);
const CHAR_COUNT = vm.runInContext('CHARS.length', sandbox);
console.log('角色总数:', CHAR_COUNT);

/* ----- 输入模拟（时序：keydown 于 update 前，keyup 于 update 后） ----- */
function press(key) {
  for (const f of listeners.keydown || []) f({ key, repeat: false, preventDefault: noop });
  for (const f of listeners.keyup || []) f({ key, preventDefault: noop });
}
function pressNoRelease(k) { for (const f of listeners.keydown || []) f({ key: k, repeat: false, preventDefault: noop }); }
function keyup(k) { for (const f of listeners.keyup || []) f({ key: k, preventDefault: noop }); }

/* ----- 简单战斗机器人：贴近出招、被打翻滚拉开 ----- */
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
  if (botHurtT > 0 && near && nd < 170) { botDir = P.x < near.x ? -1 : 1; keymapHeld[botDir > 0 ? 'right' : 'left'] = 1; }
  else if (near && nd > 120) { botDir = Math.sign(near.x - P.x) || botDir; keymapHeld[botDir > 0 ? 'right' : 'left'] = 1; }
}
const downKeys = new Set();
function tap(k, queue) { if (!downKeys.has(k)) { queue.push(k); downKeys.add(k); } }

const dt = 1 / 60;
function runBot(frames) {
  for (let i = 0; i < frames; i++) {
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
    if (i % 40 === 10) tap('Shift', taps);
    if (i % 100 === 60) { tap('q', taps); tap('ArrowRight', taps); tap('ArrowRight', taps); tap('ArrowLeft', taps); }
    const release = [...downKeys];
    for (const k of taps) pressNoRelease(k);
    G.update(dt);
    G.draw();
    for (const k of release) { keyup(k); downKeys.delete(k); }
  }
}

/* ================= 1) 全角色覆盖 ================= */
for (let ci = 0; ci < CHAR_COUNT; ci++) {
  G.startBattle(ci);
  runBot(1400);
  console.log(`角色 #${String(ci + 1).padStart(2, '0')} ${G.player.def.name} -> 场景=${G.scene} 击杀=${G.kills} 连段=${G.maxCombo} 时长=${G.battleT.toFixed(1)}s`);
}

/* ================= 2) 无尽深渊回路 ================= */
G.startBattle(1);
runBot(400);
G.startEndless();
for (let pass = 0; pass < 6; pass++) {
  const before = G.endlessN;
  runBot(1500);   // 每 25 秒一阶段，应可推进至少 1 波
  if (G.scene !== 'battle' && G.scene !== 'lose') break;
  console.log(`无尽 pass${pass + 1}: 第 ${G.endlessN} 波(前=${before}) 击杀=${G.kills} dScale=${G.dScale.toFixed(2)} 场景=${G.scene}`);
  if (G.scene === 'lose') { console.log('（无尽中阵亡——正常结局，回路仍有效）'); break; }
}
console.log('死验状态: endlessN=' + G.endlessN + ' dScale=' + G.dScale.toFixed(2) + ' HP缩放敌= ' + G.ens.filter(e => e.maxhp > (e.def.hp || 0) * 1.01).length);
console.log('全角色覆盖 + 无尽深渊 冒烟测试通过 ✓');
