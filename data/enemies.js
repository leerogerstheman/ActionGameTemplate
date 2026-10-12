'use strict';
/* =========================================================
 * enemies.js — 敌人图鉴（杂兵 / 精英 / Boss，纯数据）
 * ---------------------------------------------------------
 * payload 字段由 entities.js 的 AI 解释：
 *   melee : box 相对帧 + dmg（近战挥击）
 *   proj  : {spd, dy, dmg, r, color, n(扇形数量)}（远程弹幕）
 *   shock : {r1, dur, dmg, ky}（砸地冲击环）
 *   rain  : {n, dmg}（落石/陨石雨）
 * elites: 精英按顺序循环 attacks 列表，且带霸体（stun 减免）。
 * ========================================================= */

const MOBS = {
  runner: {
    id: 'runner', name: '疾魔犬', hp: 42, spd: 330, r: 20, h: 40, shape: 'hound',
    col: { c1: '#5a2b33', c2: '#ff5566', eye: '#ffd23c' }, xp: 8, atkCd: 1.5, keepAway: 0,
    atk: { n: '扑咬', tele: 0.34, dur: 0.2, rec: 0.3, range: 86, payload: 'melee',
      box: [-46, 58, -44, 0], dmg: 5, kx: 220, sfx: 'slash' },
  },
  imp: {
    id: 'imp', name: '浮火小鬼', hp: 34, spd: 260, r: 17, h: 34, shape: 'imp',
    col: { c1: '#4a235a', c2: '#ff8c3a', eye: '#ffe08a' }, xp: 10, atkCd: 1.5, fly: 1, hover: 180,
    atk: { n: '火球', tele: 0.4, dur: 0.15, rec: 0.4, range: 520, minRange: 180, payload: 'proj',
      proj: { spd: 480, dmg: 6, r: 14, color: '#ff8c3a', n: 1 }, sfx: 'casting' },
  },
  caster: {
    id: 'caster', name: '邪教法师', hp: 55, spd: 210, r: 20, h: 58, shape: 'robe',
    col: { c1: '#28304a', c2: '#7f5cff', eye: '#b48cff' }, xp: 14, atkCd: 1.8, keepAway: 1,
    atk: { n: '三连邪弹', tele: 0.48, dur: 0.25, rec: 0.5, range: 560, minRange: 200, payload: 'proj',
      proj: { spd: 430, dmg: 7, r: 16, color: '#9f6cff', n: 3, spread: 220 }, sfx: 'casting' },
  },
  brute: {
    id: 'brute', name: '腐肉巨人', hp: 150, spd: 150, r: 34, h: 84, shape: 'brute',
    col: { c1: '#4a3a20', c2: '#a06a30', eye: '#ffd23c' }, xp: 24, atkCd: 2.0,
    atk: { n: '砸地', tele: 0.75, dur: 0.25, rec: 0.7, range: 130, payload: 'shock',
      shock: { r1: 300, dur: 0.45, dmg: 12, ky: -420 }, dmg: 12, sfx: 'boom' },
  },
  lancer: {
    id: 'lancer', name: '掷矛骷髅', hp: 60, spd: 240, r: 20, h: 56, shape: 'lancer',
    col: { c1: '#cfc9b4', c2: '#8fd894', eye: '#5fd4a0' }, xp: 14, atkCd: 1.9, keepAway: 1,
    atk: { n: '骨矛投掷', tele: 0.5, dur: 0.2, rec: 0.5, range: 620, minRange: 240, payload: 'proj',
      proj: { spd: 560, dmg: 8, r: 12, color: '#e8e6d8', n: 1 }, sfx: 'casting' },
  },
  zealot: {
    id: 'zealot', name: '狂信徒', hp: 70, spd: 430, r: 21, h: 64, shape: 'zealot',
    col: { c1: '#4a1626', c2: '#ff4d6d', eye: '#ffd23c' }, xp: 16, atkCd: 2.2,
    atk: { n: '自灭突进', tele: 0.55, dur: 0.45, rec: 0.9, range: 420, payload: 'dash',
      dash: 700, box: [-50, 80, -70, 0], dmg: 12, sfx: 'heavy' },
  },
};

const ELITES = {
  warden: {
    id: 'warden', name: '圣殿看守', hp: 320, spd: 250, r: 32, h: 104, shape: 'knight',
    col: { c1: '#2b2f45', c2: '#c8b04a', eye: '#ffe08a' }, xp: 70, atkCd: 1.5,
    armorF: 0.45,  // 受击硬直减免（霸体）
    seq: ['rush', 'slam', 'spin'],  // 精英按列表循环出招
    atks: {
      rush: { n: '盾冲', tele: 0.5, dur: 0.55, rec: 0.5, range: 420, payload: 'dash',
        dash: 720, box: [-60, 90, -110, 0], dmg: 13, sfx: 'heavy' },
      slam: { n: '圣锤砸地', tele: 0.65, dur: 0.3, rec: 0.6, range: 150, payload: 'shock',
        shock: { r1: 340, dur: 0.5, dmg: 17, ky: -500 }, dmg: 17, sfx: 'boom' },
      spin: { n: '回旋横扫', tele: 0.4, dur: 0.5, rec: 0.55, range: 190, payload: 'melee',
        box: [-170, 170, -115, 0], dmg: 15, kx: 320, sfx: 'slash' },
    },
  },
  shrieker: {
    id: 'shrieker', name: '尖啸使', hp: 240, spd: 300, r: 28, h: 92, shape: 'ghost',
    col: { c1: '#3a2038', c2: '#c86ad4', eye: '#ff9ff3' }, xp: 60, atkCd: 1.3,
    armorF: 0.4,
    seq: ['scream', 'darts', 'scream'],
    atks: {
      scream: { n: '尖啸波', tele: 0.5, dur: 0.4, rec: 0.5, range: 380, payload: 'shock',
        shock: { r1: 360, dur: 0.5, dmg: 12, ky: -300 }, dmg: 12, sfx: 'casting' },
      darts: { n: '幻影飞镖', tele: 0.45, dur: 0.2, rec: 0.45, range: 620, minRange: 140, payload: 'proj',
        proj: { spd: 620, dmg: 10, r: 14, color: '#e08cff', n: 2, spread: 260 }, sfx: 'casting' },
    },
  },
  asura: {
    id: 'asura', name: '阿修罗机兵', hp: 380, spd: 260, r: 34, h: 110, shape: 'mech',
    col: { c1: '#2a3138', c2: '#40f0ff', eye: '#ff5566' }, xp: 80, atkCd: 1.5,
    armorF: 0.35,
    seq: ['laser', 'missiles', 'stomp'],
    atks: {
      laser:   { n: '扫射激光', tele: 0.7, dur: 0.4, rec: 0.6, range: 9999, payload: 'melee',
        box: [-300, 300, -150, 0], dmg: 18, kx: 280, sfx: 'beam' },
      missiles:{ n: '轨道导弹', tele: 0.5, dur: 0.25, rec: 0.55, range: 9999, minRange: 90, payload: 'proj',
        proj: { spd: 420, dmg: 9, r: 15, color: '#ff8c3a', n: 3, spread: 380 }, sfx: 'casting' },
      stomp:   { n: '践踏冲击', tele: 0.65, dur: 0.3, rec: 0.65, range: 170, payload: 'shock',
        shock: { r1: 360, dur: 0.5, dmg: 16, ky: -480 }, dmg: 16, sfx: 'boom' },
    },
  },
};

const BOSS_DEF = {
  id: 'boss', name: '灰烬僭主·摩迪凯', hp: 1500, spd: 310, r: 46, h: 150, shape: 'tyrant',
  col: { c1: '#241a38', c2: '#ff6a33', eye: '#ffd23c' }, xp: 200,
  armorF: 0.28,
  /* 阶段：hp 比例降到 until 以下时切换；每阶段不同出招池/节奏 */
  phases: [
    { until: 1.0,  cd: 1.5, pool: ['cleave', 'fireball', 'dashslash'] },
    { until: 0.6,  cd: 1.1, pool: ['cleave', 'quake', 'dashslash', 'summon'] },
    { until: 0.25, cd: 0.85, pool: ['cleave', 'quake', 'fireball', 'blink', 'meteor'] },
  ],
  atks: {
    cleave:   { n: '灰烬双连斩', tele: 0.52, dur: 0.22, rec: 0.45, range: 200, payload: 'melee',
      box: [-150, 190, -160, 0], dmg: 14, kx: 420, sfx: 'heavy' },
    fireball: { n: '灰烬魔弹', tele: 0.42, dur: 0.2, rec: 0.5, range: 640, minRange: 120, payload: 'proj',
      proj: { spd: 480, dmg: 11, r: 20, color: '#ff6a33', n: 3, spread: 300 }, sfx: 'casting' },
    dashslash:{ n: '僭主突斩', tele: 0.6, dur: 0.5, rec: 0.5, range: 460, payload: 'dash',
      dash: 860, box: [-80, 130, -160, 0], dmg: 16, sfx: 'slash' },
    quake:    { n: '大地崩裂', tele: 0.75, dur: 0.3, rec: 0.7, range: 180, payload: 'shock',
      shock: { r1: 430, dur: 0.55, dmg: 18, ky: -520 }, dmg: 18, sfx: 'boom' },
    summon:   { n: '僭主号令', tele: 1.0, dur: 0.2, rec: 0.5, range: 9999, payload: 'summon',
      spawn: ['runner', 'imp'], sfx: 'roar' },
    blink:    { n: '灰烬逆位', tele: 0.3, dur: 0.15, rec: 0.3, range: 9999, payload: 'blink',
      sfx: 'dodge' },
    meteor:   { n: '焚天陨雨', tele: 0.95, dur: 0.2, rec: 0.6, range: 9999, payload: 'rain',
      rain: { n: 5, dmg: 15 }, sfx: 'warn' },
  },
};

/* ---------------- 波次脚本（关卡流程） ---------------- */
const WAVES = [
  { name: '第一波 · 血港潮涌', sub: '热身先拿个 C', spawns: [
    ['runner', 0.3, 1050], ['runner', 0.8, 200], ['imp', 1.5, 1120],
    ['runner', 2.2, 300], ['imp', 2.8, 180], ['runner', 3.6, 1080],
  ]},
  { name: '第二波 · 邪念增援', sub: '注意远程弹幕', spawns: [
    ['brute', 0.3, 1100], ['caster', 1.2, 200], ['runner', 1.8, 950],
    ['caster', 2.4, 1080], ['lancer', 3.0, 240], ['runner', 3.8, 1000],
    ['lancer', 4.4, 1060],
  ]},
  { name: '第三波 · 精英来袭', sub: '圣殿看守', elite: 1, spawns: [
    ['warden', 0.5, 1020, 1], ['runner', 2.0, 260], ['runner', 2.6, 1000],
    ['imp', 3.2, 180], ['zealot', 4.0, 500], ['imp', 4.8, 1100],
  ]},
  { name: '第四波 · 双重威胁', sub: '双精英压阵', elite: 1, spawns: [
    ['warden', 0.5, 1060, 1], ['shrieker', 1.6, 220, 1],
    ['runner', 3.0, 300], ['caster', 3.6, 1000], ['lancer', 4.2, 1060],
    ['zealot', 4.8, 480],
  ]},
  { name: '最终波 · 灰烬僭主', sub: 'BOSS 摩迪凯降临', boss: 1, spawns: [
    ['boss', 1.0, 1020, 1],
  ]},
];
