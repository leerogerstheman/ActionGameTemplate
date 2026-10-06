'use strict';
/* 临时调试：观察判定与AI状态 */
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = 'D:/ActionGameTemplate';
const noop = () => {}; const grad = () => ({ addColorStop: noop });
const ctxStub = Object.assign({ createLinearGradient: grad, createRadialGradient: grad },
  ['setTransform','clearRect','fillRect','strokeRect','beginPath','moveTo','lineTo','arc','arcTo','ellipse','quadraticCurveTo','closePath','fill','stroke','save','restore','translate','scale','rotate','setLineDash','fillText','strokeText'].reduce((o, k) => (o[k] = noop, o), {}));
const listeners = {};
const fakeWindow = { addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); }, removeEventListener: noop, AudioContext: undefined, webkitAudioContext: undefined };
const sandbox = { window: fakeWindow, document: { getElementById: id => ({ id, getContext: () => ctxStub, width: 1280, height: 720, focus: noop }) }, console, performance, Math, JSON, requestAnimationFrame: noop };
vm.createContext(sandbox);
for (const f of ['core/engine.js', 'data/characters.js', 'data/enemies.js', 'core/entities.js', 'core/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
vm.runInContext('this.G = window.G;', sandbox);
const run = code => vm.runInContext(code, sandbox);
function pressNoRelease(k) { for (const f of listeners.keydown || []) f({ key: k, repeat: false, preventDefault: noop }); }
function keyup(k) { for (const f of listeners.keyup || []) f({ key: k, preventDefault: noop }); }

run(`
G.startBattle(0);
let hitLog = [];
const oh = G.hitAbs.bind(G);
G.hitAbs = function(cx, cy, w, h, opts) { hitLog.push('team=' + opts.team + ' x=' + (cx|0) + ' y=' + (cy|0) + ' dmg=' + opts.dmg); return oh(cx, cy, w, h, opts); };
const apply = G._applyHit.bind(G);
G._applyHit = function(foe, src) { console.log('  APPLY -> ' + (foe.def ? foe.def.id : 'player') + ' dmg=' + src.dmg); return apply(foe, src); };
`);
pressNoRelease('d'); // 常驻向右
for (let i = 0; i < 300; i++) {
  if (i === 2) pressNoRelease('e'); // title -> select
  if (i > 4) {
    if (i % 20 === 0) pressNoRelease('j');
    if (i % 20 === 1) keyup('j');
  }
  run('G.update(1/60); G.draw();');
  if (i % 30 === 0) run(`
    console.log('[frame ' + ${i} + '] scene=' + G.scene
      + ' P=' + (G.player && (G.player.state + ' hp=' + (G.player.hp | 0) + ' x=' + (G.player.x | 0)))
      + ' hits=' + G.hitboxes.length + ' ens=' + G.ens.length
      + ' ' + JSON.stringify(G.ens.map(e => e.def.id + ':' + e.state + ':' + (e.x | 0) + '/' + (e.hp | 0))));
    if (hitLog.length) { console.log('  hitAbs:', hitLog.slice(-4).join(' | ')); hitLog.length = 0; }
  `);
}
