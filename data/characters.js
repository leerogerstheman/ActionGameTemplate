'use strict';
/* =========================================================
 * characters.js — 10 名可操作角色（纯数据 + 技能函数）
 * ---------------------------------------------------------
 * 连段结构参考《鬼泣》：轻击 N 连 → 缓冲接续，挑空(L)后可浮空追打。
 * 每名角色拥有：
 *   combo   轻击连段（J 连按）
 *   heavy   重击（K）、launcher 挑空（L）、air 浮空攻击
 *   skills  两个主动技能（U / I，走冷却）
 *   strat   支援律令（按 Q 后依法阵顺序输入方向码，参考《地狱潜兵》）
 *   ult     奥义（O，需 100 计量，参考《传说》系列秘奥义的演出感）
 * 技能函数可用 API（见 game.js 实现）：
 *   G.hitRel( 身体, 前向偏移, 高度偏移(负=上), 宽, 高, {dmg,kx,ky,launch,w,sfx,life} )
 *   G.proj({x,y,vx,vy,r,dmg,team,color,life,kind,trail,sc})
 *   G.shock({x,y,team,r0,r1,dur,dmg,ky,color})  扩散冲击环
 *   G.beam({x,w,warn,dur,dmg,color,team})       轨道光柱(预警→落下)
 *   G.meteors(x, n, dmg, team)                  天降陨石束
 *   G.fire({x,y,r,dur,dps,team,color})          地面火圈/持续伤害区
 *   G.spawn(id,x) / G.delayed(t,fn) / G.slowmo(t,f) / G.shake(a) / G.orb(x,y)
 * ========================================================= */

// 近战连段 move 工厂：box = [前向起, 前向止, 顶部y, 底部y]（相对脚底，y 负为向上）
const M = o => Object.assign({
  n: '攻击', dur: 0.34, win: [0.1, 0.24], box: [-95, 105, -78, 0],
  dmg: 9, kx: 140, ky: 0, launch: false, w: 3, sfx: 'slash', drift: 130, armor: false,
}, o);

/* ---- 技能小工具 ---- */
function _dashHit(P, reach, opts) {            // 突进多段判定
  const step = opts.step || 70;
  for (let i = 0; i < opts.count; i++) {
    G.delayed(i * (opts.gap || 0.06), () => {
      G.hitRel(P, P.facing * (50 + i * step), 0, 110, 120,
        Object.assign({ dmg: opts.dmg / 2, kx: 60, w: 2, sfx: 'slash', life: 0.1 }, opts));
    });
  }
}

const CHARS = [
/* ================= 1. 烬火领骑（大剑 / 血咒之城·燎原血技） ================= */
{
  id: 'ashen', name: '烬火领骑·艾德蒙', en: 'Ashen Vanguard',
  weap: 'greatsword', glyph: '⚔',
  col: { c1: '#7a2028', c2: '#e8b23a', c3: '#ff6a33', hair: '#2b1a1a' },
  hp: 130, spd: 300,
  quip: '灰烬之下，皆为薪柴。',
  combo: [
    M({ n: '燎袭·壹', dmg: 10, box: [-100, 115, -80, 0] }),
    M({ n: '燎袭·贰', dmg: 11, box: [-110, 105, -84, 0] }),
    M({ n: '灰烬横扫', dmg: 13, box: [-150, 150, -80, 0], kx: 180 }),
    M({ n: '焚圆终式', dmg: 17, box: [-165, 165, -95, 0], kx: 260, w: 6, sfx: 'heavy' }),
  ],
  heavy: M({ n: '沉重斩击', dur: 0.55, win: [0.24, 0.4], box: [-190, 200, -105, 0], dmg: 24, kx: 420, w: 7, sfx: 'heavy' }),
  launcher: M({ n: '燃升龙斩', dur: 0.4, win: [0.12, 0.26], box: [-70, 90, -190, 10], dmg: 13, ky: -680, launch: true, w: 6, sfx: 'launch' }),
  air: M({ n: '斜阳坠斩', dur: 0.32, win: [0.08, 0.22], box: [-105, 115, -30, 90], dmg: 12, ky: 220, w: 4 }),
  skills: [
    { key: 's1', name: '燎原血技', icon: '炎', cd: 5, color: '#ff6a33',
      desc: '喷吐一道灼热血焰穿透前方。',
      cast(P) {
        G.proj({ x: P.x + P.facing * 45, y: P.y - 48, vx: P.facing * 850, vy: 0, r: 30, dmg: 18, team: P.team, color: '#ff6a33', life: 1.05, trail: 'ember', sc: 8 });
        G.fx.arc(P.x + P.facing * 30, P.y - 45, P.facing, '#ff6a33'); SFX.play('casting');
      } },
    { key: 's2', name: '灰烬壁构', icon: '盾', cd: 8, color: '#ffd27a',
      desc: '血之壁构：1.1 秒无敌，回复 6 HP。',
      cast(P) { P.invuln = Math.max(P.invuln, 1.1); P.heal(6); G.fx.ring(P.x, P.y - 40, '#ffd27a', 18, 240); SFX.play('casting'); } },
  ],
  strat: { name: '支援律令：灰烬风暴', code: ['R', 'R', 'L'], cd: 17, color: '#ff6a33',
    desc: '呼叫轨道齐射，五道火柱横扫全场。',
    cast(P) {
      G.banner('支援律令：灰烬风暴', '', 1.4); SFX.play('warn');
      for (let i = 0; i < 5; i++) G.delayed(0.25 + i * 0.22, () => G.beam({ x: 140 + i * 255, w: 66, warn: 0.5, dur: 0.42, dmg: 20, color: '#ff6a33', team: P.team }));
    } },
  ult: { name: '奥义·焚天一閃', desc: '化作灰烬风暴贯穿全场。',
    cast(P) {
      G.slowmo(0.5, 0.3); P.invuln = Math.max(P.invuln, 0.9);
      G.banner('奥义·焚天一閃', '', 1.1);
      G.fx.hitFlash(0.3, '#ff6a33'); G.shake(16); SFX.play('beam');
      P.x = UT.clamp(P.x + P.facing * 300, CONFIG.XMIN, CONFIG.XMAX);
      for (let i = 0; i < 9; i++)
        G.delayed(i * 0.045, () => G.hitRel(P, P.facing * (55 + i * 62), 0, 130, 160, { dmg: 7, kx: 130, w: 2, sfx: 'slash', life: 0.12 }));
      G.fx.spark(P.x, P.y - 50, '#ff6a33', 40, 700);
    } },
},
/* ================= 2. 苍雷剑姬（细剑 / 传说系多段极技） ================= */
{
  id: 'azure', name: '苍雷剑姬·希尔达', en: 'Azure Storm',
  weap: 'rapier', glyph: '⚡',
  col: { c1: '#223f6b', c2: '#7fd4ff', c3: '#8fd0ff', hair: '#cfe6ff' },
  hp: 105, spd: 365,
  quip: '雷光过处，无物可立。',
  combo: [
    M({ n: '闪刺·壹', dur: 0.28, dmg: 8, box: [-95, 125, -80, 0] }),
    M({ n: '闪刺·贰', dur: 0.28, dmg: 8, box: [-100, 130, -80, 0] }),
    M({ n: '雷光三连', dur: 0.34, dmg: 12, box: [-120, 120, -84, 0], kx: 120 }),
    M({ n: '苍穹终式', dmg: 15, box: [-140, 140, -90, 0], kx: 260, w: 6, sfx: 'slash' }),
  ],
  heavy: M({ n: '雷爪强袭', dur: 0.5, win: [0.2, 0.38], box: [-170, 190, -100, 0], dmg: 21, kx: 380, w: 6, sfx: 'heavy' }),
  launcher: M({ n: '飞燕升雷', dur: 0.36, win: [0.1, 0.24], box: [-65, 85, -200, 10], dmg: 11, ky: -720, launch: true, w: 6, sfx: 'launch' }),
  air: M({ n: '流光坠刺', dur: 0.3, win: [0.06, 0.2], box: [-90, 110, -20, 95], dmg: 11, ky: 260, w: 4 }),
  skills: [
    { key: 's1', name: '雷神疾影', icon: '雷', cd: 6, color: '#8fd0ff',
      desc: '穿身而过留下三道斩击残光。',
      cast(P) {
        G.slowmo(0.25, 0.4); SFX.play('zap');
        P.x = UT.clamp(P.x + P.facing * 230, CONFIG.XMIN, CONFIG.XMAX);
        P.invuln = Math.max(P.invuln, 0.4);
        G.fx.spark(P.x - P.facing * 90, P.y - 45, '#8fd0ff', 22, 500);
        _dashHit(P, 0, { count: 3, step: 140, gap: 0.05, dmg: 8, color: '#8fd0ff' });
      } },
    { key: 's2', name: '苍破刃', icon: '波', cd: 5, color: '#7fd4ff',
      desc: '射出嘈五音的雷光刃波。',
      cast(P) {
        G.proj({ x: P.x + P.facing * 40, y: P.y - 46, vx: P.facing * 780, vy: 0, r: 24, dmg: 15, team: P.team, color: '#7fd4ff', life: 0.95, kind: 'wave', sc: 7 });
        SFX.play('casting');
      } },
  ],
  strat: { name: '支援律令：唤雷之仪', code: ['U', 'R', 'D'], cd: 16, color: '#8fd0ff',
    desc: '天穹落下三道雷柱惩罚敌人。',
    cast(P) {
      G.banner('支援律令：唤雷之仪', '', 1.3); SFX.play('warn');
      const foes = G.ens.filter(e => !e.dead);
      for (let i = 0; i < 3; i++) {
        const tx = foes[i] ? foes[i].x : P.x + P.facing * 250 * (i + 1);
        G.delayed(0.3 + i * 0.35, () => G.beam({ x: UT.clamp(tx, CONFIG.XMIN, CONFIG.XMAX), w: 60, warn: 0.4, dur: 0.35, dmg: 22, color: '#9fd8ff', team: P.team }));
      }
    } },
  ult: { name: '秘奥义·闪空翔斩', desc: '雷柱连舞，将敌人钉入苍穹。',
    cast(P) {
      G.slowmo(0.6, 0.3); P.invuln = Math.max(P.invuln, 1);
      G.banner('秘奥义·闪空翔斩', '', 1.2);
      G.fx.hitFlash(0.35, '#9fd8ff'); G.shake(14); SFX.play('zap');
      for (let i = 0; i < 6; i++)
        G.delayed(i * 0.09, () => {
          G.hitRel(P, P.facing * UT.rand(-40, 80), 0, 150, 190, { dmg: 8, kx: 40, w: 2, sfx: 'slash', life: 0.14 });
          G.fx.spark(P.x + P.facing * UT.rand(0, 100), P.y - UT.rand(20, 110), '#8fd0ff', 8, 300);
        });
      G.delayed(0.6, () => G.hitRel(P, P.facing * 120, 0, 170, 210, { dmg: 18, kx: 420, w: 8, sfx: 'heavy', launch: true, ky: -560, life: 0.16 }));
    } },
},
/* ================= 3. 轨道游侠（步枪 / 地狱潜兵式火力呼叫） ================= */
{
  id: 'ranger', name: '轨道游侠·凯尔', en: 'Orbital Ranger',
  weap: 'rifle', glyph: '🛰',
  col: { c1: '#3f4b2f', c2: '#b8d84a', c3: '#ffd23c', hair: '#46341f' },
  hp: 115, spd: 320,
  quip: '解放民主火力的时刻到了。',
  combo: [
    M({ n: '枪托击打', dur: 0.3, dmg: 8, box: [-70, 95, -80, 0], sfx: 'hit' }),
    M({ n: '枪刃斩', dur: 0.3, dmg: 9, box: [-90, 105, -80, 0] }),
    M({ n: '刺刀突刺', dur: 0.34, dmg: 12, box: [-115, 135, -84, 0], kx: 150 }),
    M({ n: '战术翻锤', dmg: 15, box: [-150, 150, -90, 0], kx: 280, w: 6, sfx: 'heavy' }),
  ],
  heavy: M({ n: '无后坐力点射', dur: 0.46, win: [0.2, 0.36], box: [-160, 170, -95, 0], dmg: 20, kx: 340, w: 6, sfx: 'boom' }),
  launcher: M({ n: '榴弹上抛', dur: 0.38, win: [0.12, 0.26], box: [-80, 100, -180, 10], dmg: 12, ky: -640, launch: true, w: 6, sfx: 'launch' }),
  air: M({ n: '空降俯冲', dur: 0.3, win: [0.06, 0.2], box: [-95, 105, -20, 90], dmg: 11, ky: 240, w: 4 }),
  skills: [
    { key: 's1', name: '轨道狙击标记', icon: '瞄', cd: 7, color: '#ffd23c',
      desc: '标记最近敌人，0.6 秒后轨道炮沿标记落下。',
      cast(P) {
        let best = null, bd = 1e9;
        for (const e of G.ens) if (!e.dead) { const d = UT.d2(e.x, e.y, P.x, P.y); if (d < bd) { bd = d; best = e; } }
        SFX.play('warn'); G.fx.text(P.x, P.y - 100, '已标记!', '#ffd23c', 18);
        const tx = best ? best.x : UT.clamp(P.x + P.facing * 300, CONFIG.XMIN, CONFIG.XMAX);
        G.delayed(0.6, () => G.beam({ x: best && !best.dead ? best.x : tx, w: 46, warn: 0.25, dur: 0.3, dmg: 26, color: '#ffd23c', team: P.team }));
      } },
    { key: 's2', name: '高爆榴弹', icon: '爆', cd: 6, color: '#b8d84a',
      desc: '抛射榴弹，落地炸开冲击环。',
      cast(P) {
        G.proj({ x: P.x + P.facing * 30, y: P.y - 60, vx: P.facing * 520, vy: -460, r: 16, dmg: 0, team: P.team, color: '#b8d84a', life: 3, kind: 'bomb', blast: 22 });
        SFX.play('casting');
      } },
  ],
  strat: { name: '支援律令：弹幕齐射', code: ['D', 'D', 'U'], cd: 18, color: '#ffd23c',
    desc: '呼叫舰队对地面实施横向覆盖炮击。',
    cast(P) {
      G.banner('支援律令：弹幕齐射', '', 1.3); SFX.play('warn');
      for (let i = 0; i < 8; i++)
        G.delayed(0.35 + i * 0.16, () => G.beam({ x: 120 + i * 152, w: 70, warn: 0.4, dur: 0.3, dmg: 14, color: '#ffd23c', team: P.team }));
    } },
  ult: { name: '奥义：500KG 把炸弹', desc: '民主，从天而降。',
    cast(P) {
      G.slowmo(0.7, 0.25); P.invuln = Math.max(P.invuln, 1.1);
      G.banner('奥义：500KG 把炸弹', '', 1.4);
      const tx = UT.clamp(P.x + P.facing * 240, CONFIG.XMIN, CONFIG.XMAX);
      G.delayed(0.35, () => {
        SFX.play('boom'); G.shake(24); G.fx.hitFlash(0.5, '#ffd23c');
        G.shock({ x: tx, y: CONFIG.FLOOR, team: P.team, r0: 20, r1: 400, dur: 0.5, dmg: 55, ky: -560, color: '#ffd23c', w: 10 });
        G.fx.spark(tx, CONFIG.FLOOR - 60, '#ffd23c', 60, 900);
      });
    } },
},
/* ================= 4. 血刻修女（镰刀 / 血咒之城·血潮） ================= */
{
  id: 'revenant', name: '血刻修女·塞拉', en: 'Blood Revenant',
  weap: 'scythe', glyph: '🩸',
  col: { c1: '#3a1230', c2: '#c22a5a', c3: '#ff5f8f', hair: '#e8d8e8' },
  hp: 118, spd: 330,
  quip: '以血为约，死亡领唱。',
  combo: [
    M({ n: '血镰·壹', dur: 0.34, dmg: 9, box: [-105, 110, -85, 0] }),
    M({ n: '血镰·贰', dur: 0.34, dmg: 9, box: [-125, 95, -88, 0] }),
    M({ n: '回旋血舞', dmg: 13, box: [-165, 165, -90, 0], kx: 200, w: 5 }),
    M({ n: '葬送终礼', dmg: 16, box: [-175, 175, -100, 0], kx: 300, w: 6, sfx: 'heavy' }),
  ],
  heavy: M({ n: '死亡收割', dur: 0.52, win: [0.22, 0.4], box: [-185, 185, -110, 0], dmg: 22, kx: 360, w: 7, sfx: 'heavy' }),
  launcher: M({ n: '升天怨镰', dur: 0.4, win: [0.12, 0.28], box: [-80, 95, -200, 10], dmg: 12, ky: -660, launch: true, w: 6, sfx: 'launch' }),
  air: M({ n: '血鸦坠', dur: 0.32, win: [0.08, 0.22], box: [-100, 110, -25, 92], dmg: 11, ky: 240, w: 4 }),
  skills: [
    { key: 's1', name: '血潮迸发', icon: '血', cd: 7, color: '#ff5f8f',
      desc: '前方扇形血浪，命中每个敌人回复 3 HP。',
      cast(P) {
        for (let i = -1; i <= 1; i++)
          G.proj({ x: P.x + P.facing * 40, y: P.y - 48 + i * 26, vx: P.facing * 660, vy: i * 90, r: 22, dmg: 13, team: P.team, color: '#ff5f8f', life: 0.85, kind: 'wave', leech: 3, sc: 6 });
        SFX.play('casting');
      } },
    { key: 's2', name: '影缝', icon: '影', cd: 6, color: '#c22a5a',
      desc: '瞬移至最近敌人身后并斩击。',
      cast(P) {
        let best = null, bd = 1e9;
        for (const e of G.ens) if (!e.dead) { const d = UT.d2(e.x, e.y, P.x, P.y); if (d < bd) { bd = d; best = e; } }
        if (best) {
          P.x = UT.clamp(best.x + (best.facing || 1) * 40, CONFIG.XMIN, CONFIG.XMAX);
          P.facing = -1 * (best.facing || 1); P.invuln = Math.max(P.invuln, 0.35);
          G.fx.spark(best.x, best.y - 40, '#c22a5a', 20, 420); SFX.play('dodge');
          G.hitRel(P, P.facing * 40, 0, 120, 130, { dmg: 16, kx: 220, w: 7, sfx: 'slash', life: 0.12 });
        } else SFX.play('fizz');
      } },
  ],
  strat: { name: '支援律令：血月降临', code: ['R', 'R', 'D'], cd: 18, color: '#ff5f8f',
    desc: '血月当空，降下血雨减轻敌群。',
    cast(P) {
      G.banner('支援律令：血月降临', '', 1.3); SFX.play('warn');
      G.meteors(P.x + P.facing * 200, 6, 14, P.team, '#ff5f8f');
    } },
  ult: { name: '奥义·死亡领唱', desc: '镰刀之诗，大成共鸣。',
    cast(P) {
      G.slowmo(0.6, 0.3); P.invuln = Math.max(P.invuln, 1);
      G.banner('奥义·死亡领唱', '', 1.2);
      G.fx.hitFlash(0.35, '#ff5f8f'); SFX.play('beam');
      G.shock({ x: P.x, y: P.y, team: P.team, r0: 30, r1: 360, dur: 0.55, dmg: 34, ky: -620, color: '#ff5f8f', w: 9 });
      P.heal(12);
      for (let i = 0; i < 3; i++)
        G.delayed(0.25 + i * 0.2, () => G.shock({ x: P.x, y: P.y, team: P.team, r0: 30, r1: 320, dur: 0.4, dmg: 8, ky: -200, color: '#c22a5a', w: 3 }));
    } },
},
/* ================= 5. 电弧特工（长枪 / 特斯拉链电） ================= */
{
  id: 'arc', name: '电弧特工·罗恩', en: 'Arc Trooper',
  weap: 'spear', glyph: '⚡',
  col: { c1: '#14333d', c2: '#39e5c8', c3: '#9ff55f', hair: '#1b2a2e' },
  hp: 112, spd: 340,
  quip: '接好——高压电来了！',
  combo: [
    M({ n: '电刺·壹', dur: 0.3, dmg: 8, box: [-105, 135, -82, 0] }),
    M({ n: '电刺·贰', dur: 0.3, dmg: 8, box: [-110, 140, -82, 0] }),
    M({ n: '弧光横扫', dmg: 12, box: [-155, 155, -86, 0], kx: 180 }),
    M({ n: '放电阻头', dmg: 15, box: [-150, 170, -92, 0], kx: 300, w: 6, sfx: 'zap' }),
  ],
  heavy: M({ n: '高压突刺', dur: 0.48, win: [0.22, 0.38], box: [-190, 230, -95, 0], dmg: 21, kx: 400, w: 6, sfx: 'heavy' }),
  launcher: M({ n: '电磁弹射', dur: 0.36, win: [0.1, 0.24], box: [-70, 90, -195, 10], dmg: 11, ky: -690, launch: true, w: 6, sfx: 'launch' }),
  air: M({ n: '闪电下劈', dur: 0.3, win: [0.06, 0.2], box: [-90, 110, -20, 95], dmg: 11, ky: 250, w: 4 }),
  skills: [
    { key: 's1', name: '弧光投掷', icon: '链', cd: 5, color: '#9ff55f',
      desc: '掷出电矛，链式跳跃至最多 3 个目标。',
      cast(P) {
        SFX.play('zap');
        G.proj({ x: P.x + P.facing * 40, y: P.y - 50, vx: P.facing * 920, vy: 0, r: 18, dmg: 14, team: P.team, color: '#9ff55f', life: 0.9, chain: 2, sc: 7 });
      } },
    { key: 's2', name: '电磁屏障', icon: '屏', cd: 9, color: '#39e5c8',
      desc: '展开屏障 1.6 秒：无敌并反弹弹幕。',
      cast(P) {
        P.invuln = Math.max(P.invuln, 1.6); P.reflect = 1.6;
        G.fx.ring(P.x, P.y - 45, '#39e5c8', 22, 260); SFX.play('casting');
      } },
  ],
  strat: { name: '支援律令：轨道雷电', code: ['D', 'L', 'R'], cd: 16, color: '#9ff55f',
    desc: '六道随机雷击撕开战线。',
    cast(P) {
      G.banner('支援律令：轨道雷电', '', 1.2); SFX.play('warn');
      for (let i = 0; i < 6; i++)
        G.delayed(0.25 + i * 0.18, () => G.beam({ x: 120 + UT.rand(0, 1000), w: 56, warn: 0.35, dur: 0.28, dmg: 13, color: '#b8ff6a', team: P.team }));
    } },
  ult: { name: '奥义·特斯拉领域', desc: '以自身为中心展开电暴领域。',
    cast(P) {
      G.slowmo(0.6, 0.3); P.invuln = Math.max(P.invuln, 1.2);
      G.banner('奥义·特斯拉领域', '', 1.3);
      G.fx.hitFlash(0.3, '#39e5c8'); SFX.play('zap'); G.shake(14);
      for (let i = 0; i < 4; i++)
        G.delayed(i * 0.18, () => G.shock({ x: P.x, y: P.y, team: P.team, r0: 40, r1: 300 + i * 60, dur: 0.35, dmg: 10, ky: -260, color: '#39e5c8', w: 4 }));
      G.hitRel(P, 0, 0, 220, 200, { dmg: 16, kx: 260, w: 8, sfx: 'heavy', life: 0.2 });
    } },
},
/* ================= 6. 燎原术士（法杖 / 火焰投放） ================= */
{
  id: 'pyro', name: '燎原术士·焰', en: 'Pyroclast',
  weap: 'staff', glyph: '🔥',
  col: { c1: '#4a1d10', c2: '#ff8c3a', c3: '#ffd76a', hair: '#ff9a4a' },
  hp: 100, spd: 315,
  quip: '烧尽一切，灰烬会记得。',
  combo: [
    M({ n: '杖击·壹', dur: 0.3, dmg: 7, box: [-85, 95, -80, 0], sfx: 'hit' }),
    M({ n: '杖击·贰', dur: 0.3, dmg: 8, box: [-95, 100, -82, 0], sfx: 'hit' }),
    M({ n: '火星横扫', dmg: 11, box: [-140, 140, -86, 0], kx: 170 }),
    M({ n: '龙息收束', dmg: 15, box: [-160, 160, -95, 0], kx: 280, w: 6, sfx: 'heavy' }),
  ],
  heavy: M({ n: '爆燃重轰', dur: 0.5, win: [0.22, 0.4], box: [-170, 175, -100, 0], dmg: 20, kx: 360, w: 6, sfx: 'boom' }),
  launcher: M({ n: '火柱上升', dur: 0.38, win: [0.12, 0.26], box: [-75, 90, -200, 10], dmg: 11, ky: -700, launch: true, w: 6, sfx: 'launch' }),
  air: M({ n: '火雨坠打', dur: 0.3, win: [0.06, 0.2], box: [-95, 105, -20, 92], dmg: 10, ky: 230, w: 4 }),
  skills: [
    { key: 's1', name: '龙息喷射', icon: '喷', cd: 5, color: '#ff8c3a',
      desc: '持续 0.7 秒的锥形火焰多段灼烧。',
      cast(P) {
        SFX.play('casting');
        for (let i = 0; i < 6; i++)
          G.delayed(i * 0.12, () => G.hitRel(P, P.facing * 130, 0, 250, 110, { dmg: 5, kx: 70, w: 1.5, sfx: 'boom', life: 0.12 }));
      } },
    { key: 's2', name: '陨石术', icon: '陨', cd: 8, color: '#ff7a33',
      desc: '召唤一颗小陨石砸向前方。',
      cast(P) {
        SFX.play('warn');
        const tx = UT.clamp(P.x + P.facing * 300, CONFIG.XMIN, CONFIG.XMAX);
        G.delayed(0.35, () => G.meteors(tx, 1, 26, P.team, '#ff7a33', 2.2));
      } },
  ],
  strat: { name: '支援律令：燃烧空袭', code: ['U', 'U', 'R'], cd: 18, color: '#ff8c3a',
    desc: '凝固汽油弹覆盖前线，留下持续火圈。',
    cast(P) {
      G.banner('支援律令：燃烧空袭', '', 1.3); SFX.play('warn');
      for (let i = 0; i < 3; i++)
        G.delayed(0.35, () => G.fire({ x: UT.clamp(P.x + P.facing * (160 + i * 130), CONFIG.XMIN, CONFIG.XMAX), y: CONFIG.FLOOR, r: 90, dur: 4.5, dps: 9, team: P.team, color: '#ff8c3a' }));
    } },
  ult: { name: '奥义·灾变星期三', desc: '一切都化为流星。',
    cast(P) {
      G.slowmo(0.8, 0.25); P.invuln = Math.max(P.invuln, 1.2);
      G.banner('奥义·灾变星期三', '', 1.4);
      G.fx.hitFlash(0.45, '#ff8c3a'); SFX.play('boom'); G.shake(22);
      G.meteors(P.x + P.facing * 220, 6, 16, P.team, '#ff7a33', 2.4);
      G.delayed(0.7, () => G.shock({ x: P.x, y: P.y, team: P.team, r0: 30, r1: 420, dur: 0.55, dmg: 26, ky: -620, color: '#ffd76a', w: 9 }));
    } },
},
/* ================= 7. 迅影舞刃（太刀 / 最速居合） ================= */
{
  id: 'blade', name: '迅影舞刃·凌', en: 'Blade Dancer',
  weap: 'katana', glyph: '🌑',
  col: { c1: '#191926', c2: '#a0a8ff', c3: '#e0e4ff', hair: '#1c2b3a' },
  hp: 95, spd: 400,
  quip: '在你眨眼之前，已过三刀。',
  combo: [
    M({ n: '疾影·壹', dur: 0.24, dmg: 7, box: [-100, 120, -80, 0] }),
    M({ n: '疾影·贰', dur: 0.24, dmg: 8, box: [-95, 115, -80, 0] }),
    M({ n: '三日月', dur: 0.3, dmg: 12, box: [-140, 145, -84, 0], kx: 160 }),
    M({ n: '无想终幕', dmg: 15, box: [-155, 160, -90, 0], kx: 300, w: 6, sfx: 'heavy' }),
  ],
  heavy: M({ n: '居合·月读', dur: 0.5, win: [0.26, 0.4], box: [-230, 30, -100, 0], dmg: 22, kx: 350, w: 7, sfx: 'heavy' }),
  launcher: M({ n: '燕返升天', dur: 0.34, win: [0.1, 0.22], box: [-65, 85, -205, 10], dmg: 10, ky: -740, launch: true, w: 6, sfx: 'launch' }),
  air: M({ n: '月坠落斩', dur: 0.28, win: [0.06, 0.18], box: [-95, 105, -18, 95], dmg: 10, ky: 240, w: 4 }),
  skills: [
    { key: 's1', name: '一闪', icon: '斬', cd: 6, color: '#a0a8ff',
      desc: '纳刀后一瞬拔刀，贯穿直线全敌人。',
      cast(P) {
        G.slowmo(0.3, 0.4); SFX.play('slash');
        for (let i = 0; i < 5; i++)
          G.delayed(i * 0.035, () => G.hitRel(P, P.facing * (70 + i * 190), 0, 130, 130, { dmg: 9, kx: 90, w: 2.5, sfx: 'slash', life: 0.1 }));
        G.fx.arc(P.x + P.facing * 200, P.y - 48, P.facing, '#e0e4ff');
      } },
    { key: 's2', name: '影子残像', icon: '残', cd: 7, color: '#6f75c9',
      desc: '身周爆发残像三连斩并推开敌群。',
      cast(P) {
        SFX.play('slash');
        for (let i = 0; i < 3; i++)
          G.delayed(i * 0.12, () => G.shock({ x: P.x, y: P.y, team: P.team, r0: 20, r1: 190, dur: 0.3, dmg: 8, ky: -300, color: '#a0a8ff', w: 4 }));
      } },
  ],
  strat: { name: '支援律令：风间连闪', code: ['R', 'U', 'L'], cd: 17, color: '#e0e4ff',
    desc: '四面八方落下斩击光柱。',
    cast(P) {
      G.banner('支援律令：风间连闪', '', 1.2); SFX.play('warn');
      for (let i = 0; i < 5; i++)
        G.delayed(0.3 + i * 0.22, () => G.beam({ x: 150 + UT.rand(0, 900), w: 58, warn: 0.35, dur: 0.26, dmg: 14, color: '#c8ccff', team: P.team }));
    } },
  ult: { name: '奥义·千剑之舞', desc: '残影七连突，剑光如雨。',
    cast(P) {
      G.slowmo(0.7, 0.28); P.invuln = Math.max(P.invuln, 1.1);
      G.banner('奥义·千剑之舞', '', 1.2);
      SFX.play('slash'); G.fx.hitFlash(0.35, '#e0e4ff');
      for (let i = 0; i < 7; i++)
        G.delayed(i * 0.09, () => {
          const dir = (i % 2 === 0 ? 1 : -1);
          G.hitRel(P, dir * (40 + i * 55), 0, 140, 180, { dmg: 8, kx: 90 * dir, w: 2.5, sfx: 'slash', life: 0.12 });
        });
      G.delayed(0.66, () => G.hitRel(P, 0, 0, 240, 220, { dmg: 16, kx: 380, w: 8, launch: true, ky: -520, sfx: 'heavy', life: 0.18 }));
    } },
},
/* ================= 8. 苍穹哨卫（风枪 / 制空连段） ================= */
{
  id: 'gale', name: '苍穹哨卫·尤娜', en: 'Gale Sentinel',
  weap: 'glaive', glyph: '🌪',
  col: { c1: '#1d3a34', c2: '#6ee7c8', c3: '#bffcf0', hair: '#dff6ef' },
  hp: 108, spd: 350,
  quip: '风起时，我当先抵达。',
  combo: [
    M({ n: '旋风·壹', dur: 0.3, dmg: 8, box: [-100, 125, -82, 0] }),
    M({ n: '旋风·贰', dur: 0.3, dmg: 8, box: [-105, 130, -82, 0] }),
    M({ n: '气刃回环', dmg: 12, box: [-150, 150, -86, 0], kx: 180 }),
    M({ n: '风暴叩首', dmg: 15, box: [-160, 165, -95, 0], kx: 300, w: 6, sfx: 'heavy' }),
  ],
  heavy: M({ n: '裂空强击', dur: 0.46, win: [0.2, 0.36], box: [-175, 185, -100, 0], dmg: 20, kx: 380, w: 6, sfx: 'heavy' }),
  launcher: M({ n: '升龙卷', dur: 0.38, win: [0.12, 0.26], box: [-75, 95, -205, 10], dmg: 11, ky: -700, launch: true, w: 6, sfx: 'launch' }),
  air: M({ n: '坠风突', dur: 0.3, win: [0.06, 0.2], box: [-95, 110, -20, 95], dmg: 11, ky: 260, w: 4 }),
  skills: [
    { key: 's1', name: '突风吐息', icon: '风', cd: 6, color: '#6ee7c8',
      desc: '吹出锥形强风，重击推开并吹空杂兵。',
      cast(P) {
        SFX.play('casting');
        G.hitRel(P, P.facing * 140, 0, 260, 120, { dmg: 12, kx: 320, launch: true, ky: -420, w: 6, sfx: 'boom', life: 0.2 });
        G.fx.spark(P.x + P.facing * 110, P.y - 45, '#bffcf0', 26, 500, 100);
      } },
    { key: 's2', name: '飞燕落·改', icon: '落', cd: 7, color: '#4dbfa4',
      desc: '跃起后俯冲砸地，生成气爆冲击环。',
      cast(P) {
        P.vy = -620; P.invuln = Math.max(P.invuln, 0.5); SFX.play('launch');
        G.delayed(0.6, () => {
          G.shock({ x: P.x, y: P.y, team: P.team, r0: 30, r1: 300, dur: 0.4, dmg: 18, ky: -440, color: '#6ee7c8', w: 7 });
          G.fx.spark(P.x, CONFIG.FLOOR - 30, '#bffcf0', 30, 560);
        });
      } },
  ],
  strat: { name: '支援律令：气旋风暴', code: ['U', 'L', 'R'], cd: 18, color: '#bffcf0',
    desc: '召唤游走龙卷清扫全场。',
    cast(P) {
      G.banner('支援律令：气旋风暴', '', 1.3); SFX.play('warn');
      G.delayed(0.35, () => {
        for (let i = 0; i < 4; i++)
          G.delayed(i * 0.5, () => {
            if (G.scene !== 'battle') return;
            const tx = UT.clamp(P.x + (i % 2 ? 1 : -1) * (140 + i * 90), CONFIG.XMIN, CONFIG.XMAX);
            G.shock({ x: tx, y: CONFIG.FLOOR, team: P.team, r0: 20, r1: 200, dur: 0.5, dmg: 12, ky: -380, color: '#bffcf0', w: 5, tall: 1.6 });
          });
      });
    } },
  ult: { name: '奥义·逐风连舞', desc: '乘上升气流的多段连舞。',
    cast(P) {
      G.slowmo(0.6, 0.3); P.invuln = Math.max(P.invuln, 1.1);
      G.banner('奥义·逐风连舞', '', 1.2);
      G.fx.hitFlash(0.3, '#6ee7c8'); SFX.play('boom');
      for (let i = 0; i < 5; i++)
        G.delayed(i * 0.13, () => G.hitRel(P, P.facing * UT.rand(-30, 70), -i * 26, 150, 170, { dmg: 9, kx: 80, w: 2.5, sfx: 'slash', launch: i === 4, ky: i === 4 ? -620 : -160, life: 0.14 }));
      G.fx.ring(P.x, P.y - 60, '#bffcf0', 26, 420);
    } },
},
/* ================= 9. 幻影射手（弩 / 穿透与集束空袭） ================= */
{
  id: 'ghost', name: '幻影射手·薇儿', en: 'Ghost Injector',
  weap: 'crossbow', glyph: '🏹',
  col: { c1: '#2c2440', c2: '#b48cff', c3: '#e6d4ff', hair: '#8f7bb5' },
  hp: 98, spd: 335,
  quip: '影子说过，箭必中环。',
  combo: [
    M({ n: '弩托击', dur: 0.28, dmg: 7, box: [-75, 90, -80, 0], sfx: 'hit' }),
    M({ n: '点射·壹', dur: 0.28, dmg: 8, box: [-110, 130, -80, 0] }),
    M({ n: '点射·贰', dur: 0.32, dmg: 11, box: [-115, 135, -84, 0], kx: 150 }),
    M({ n: '齐射收束', dmg: 14, box: [-135, 150, -90, 0], kx: 280, w: 6, sfx: 'heavy' }),
  ],
  heavy: M({ n: '重弩贯射', dur: 0.46, win: [0.2, 0.36], box: [-30, 260, -95, 0], dmg: 20, kx: 340, w: 6, sfx: 'heavy' }),
  launcher: M({ n: '上挑射击', dur: 0.36, win: [0.12, 0.26], box: [-80, 100, -190, 10], dmg: 11, ky: -660, launch: true, w: 6, sfx: 'launch' }),
  air: M({ n: '空中齐射', dur: 0.3, win: [0.06, 0.2], box: [-100, 110, -20, 90], dmg: 10, ky: 240, w: 4 }),
  skills: [
    { key: 's1', name: '贯穿矢', icon: '穿', cd: 5, color: '#b48cff',
      desc: '射出穿透全场的魔力箭。',
      cast(P) {
        G.proj({ x: P.x + P.facing * 40, y: P.y - 48, vx: P.facing * 1050, vy: 0, r: 14, dmg: 13, team: P.team, color: '#e6d4ff', life: 1.3, pierce: true, trail: 'spark', sc: 6 });
        SFX.play('casting');
      } },
    { key: 's2', name: '散射列阵', icon: '散', cd: 6, color: '#c8a8ff',
      desc: '向前上方扇形射出五支魔矢。',
      cast(P) {
        for (let i = -2; i <= 2; i++)
          G.proj({ x: P.x + P.facing * 30, y: P.y - 55, vx: P.facing * 720, vy: i * 150, r: 12, dmg: 9, team: P.team, color: '#b48cff', life: 0.9, trail: 'spark', sc: 3 });
        SFX.play('casting');
      } },
  ],
  strat: { name: '支援律令：集束空袭', code: ['D', 'D', 'R'], cd: 17, color: '#d8bcff',
    desc: '标记后落下成片集束光爆。',
    cast(P) {
      G.banner('支援律令：集束空袭', '', 1.3); SFX.play('warn');
      for (let i = 0; i < 7; i++)
        G.delayed(0.3 + i * 0.13, () => G.beam({ x: 140 + i * 165, w: 44, warn: 0.35, dur: 0.24, dmg: 11, color: '#d8bcff', team: P.team }));
    } },
  ult: { name: '奥义·万箭穿心', desc: '箭雨自夜空倾泻而下。',
    cast(P) {
      G.slowmo(0.7, 0.26); P.invuln = Math.max(P.invuln, 1.1);
      G.banner('奥义·万箭穿心', '', 1.3);
      G.fx.hitFlash(0.3, '#d8bcff'); SFX.play('beam');
      for (let i = 0; i < 6; i++)
        G.delayed(i * 0.1, () => G.meteors(P.x + P.facing * (100 + i * 130), 1, 12, P.team, '#d8bcff', 1.4));
      G.delayed(0.7, () => G.hitRel(P, P.facing * 150, 0, 220, 160, { dmg: 18, kx: 340, w: 8, sfx: 'heavy', life: 0.16 }));
    } },
},
/* ================= 10. 磐岩重拳（拳套 / 霸体重装） ================= */
{
  id: 'titan', name: '磐岩重拳·布雷德', en: 'Titan Fist',
  weap: 'gauntlet', glyph: '🪨',
  col: { c1: '#3d332a', c2: '#d9a05b', c3: '#ffd9a0', hair: '#263238' },
  hp: 165, spd: 260,
  quip: '大地，就是我的拳套。',
  combo: [
    M({ n: '重拳·壹', dur: 0.36, dmg: 11, box: [-85, 100, -85, 0], sfx: 'hit' }),
    M({ n: '重拳·贰', dur: 0.36, dmg: 12, box: [-95, 110, -85, 0], sfx: 'hit' }),
    M({ n: '双臂合击', dmg: 16, box: [-130, 140, -90, 0], kx: 220, w: 5 }),
    M({ n: '岩锤终结', dmg: 20, box: [-155, 165, -100, 0], kx: 340, w: 7, sfx: 'heavy' }),
  ],
  heavy: M({ n: '崩山重击', dur: 0.6, win: [0.3, 0.48], box: [-190, 200, -115, 0], dmg: 27, kx: 460, w: 8, sfx: 'heavy', armor: true }),
  launcher: M({ n: '裂地升拳', dur: 0.44, win: [0.14, 0.3], box: [-85, 100, -205, 10], dmg: 13, ky: -640, launch: true, w: 6, sfx: 'launch' }),
  air: M({ n: '陨铁落下', dur: 0.34, win: [0.08, 0.24], box: [-110, 120, -25, 95], dmg: 13, ky: 280, w: 4 }),
  skills: [
    { key: 's1', name: '地裂拳', icon: '地', cd: 6, color: '#d9a05b',
      desc: '砸地生成两道冲击环，霸体。',
      cast(P) {
        P.armor = Math.max(P.armor, 0.6); SFX.play('boom'); G.shake(10);
        G.shock({ x: P.x, y: P.y, team: P.team, r0: 20, r1: 280, dur: 0.4, dmg: 17, ky: -460, color: '#ffd9a0', w: 7 });
        G.delayed(0.18, () => G.shock({ x: P.x, y: P.y, team: P.team, r0: 20, r1: 380, dur: 0.45, dmg: 10, ky: -280, color: '#d9a05b', w: 4 }));
      } },
    { key: 's2', name: '霸体突进', icon: '突', cd: 8, color: '#c98f4a',
      desc: '带着超级装甲冲击推进，碾过敌阵。',
      cast(P) {
        P.armor = Math.max(P.armor, 0.9); SFX.play('heavy');
        P.vx = P.facing * 760; P.invulnMove = 0.9;
        G.delayed(0, () => G.hitRel(P, P.facing * 60, 0, 130, 130, { dmg: 18, kx: 380, w: 7, sfx: 'hit', life: 0.5, pierce: true }));
        G.delayed(0.9, () => { P.vx *= 0.2; P.invulnMove = 0; });
      } },
  ],
  strat: { name: '支援律令：重装迫击', code: ['U', 'L', 'D'], cd: 18, color: '#ffd9a0',
    desc: '呼叫重炮，对斜线纵深实施覆盖。',
    cast(P) {
      G.banner('支援律令：重装迫击', '', 1.3); SFX.play('warn');
      for (let i = 0; i < 6; i++)
        G.delayed(0.35, () => G.meteors(UT.clamp(P.x + P.facing * (120 + i * 170), CONFIG.XMIN, CONFIG.XMAX), 1, 15, P.team, '#ffd9a0', 1.7));
    } },
  ult: { name: '奥义·世界破灭拳', desc: '把整个竞技场当成打击面。',
    cast(P) {
      G.slowmo(0.9, 0.22); P.invuln = Math.max(P.invuln, 1.3); P.armor = 1.3;
      G.banner('奥义·世界破灭拳', '', 1.5);
      SFX.play('boom'); G.shake(28); G.fx.hitFlash(0.5, '#ffd9a0');
      G.delayed(0.35, () => {
        G.shock({ x: P.x, y: CONFIG.FLOOR, team: P.team, r0: 40, r1: 620, dur: 0.7, dmg: 48, ky: -700, color: '#ffd9a0', w: 10 });
        G.fx.spark(P.x, CONFIG.FLOOR - 40, '#ffd9a0', 70, 950);
      });
    } },
},
/* ================= 11. 凛冬枪骑（冰枪 / 减速+冻结控场） ================= */
{
  id: 'frost', name: '凛冬枪骑·凛', en: 'Frostlance',
  weap: 'spear', glyph: '❄',
  col: { c1: '#1c3742', c2: '#9fe8ff', c3: '#d4f6ff', hair: '#cfeef7' },
  hp: 118, spd: 325,
  quip: '凛冬，从不迟到。',
  combo: [
    M({ n: '霜刺·壹', dur: 0.3, dmg: 8, box: [-105, 135, -82, 0] }),
    M({ n: '霜刺·贰', dur: 0.3, dmg: 8, box: [-112, 138, -82, 0] }),
    M({ n: '冰晶横扫', dmg: 12, box: [-150, 158, -86, 0], kx: 190 }),
    M({ n: '极光终结', dmg: 16, box: [-160, 168, -94, 0], kx: 300, w: 6, sfx: 'heavy' }),
  ],
  heavy: M({ n: '冻裂突刺', dur: 0.46, win: [0.2, 0.36], box: [-30, 250, -95, 0], dmg: 20, kx: 360, w: 6, sfx: 'heavy' }),
  launcher: M({ n: '冰雾喷涌', dur: 0.38, win: [0.12, 0.26], box: [-75, 95, -200, 10], dmg: 11, ky: -700, launch: true, w: 6, sfx: 'launch' }),
  air: M({ n: '碎冰坠', dur: 0.3, win: [0.06, 0.2], box: [-95, 110, -20, 95], dmg: 11, ky: 250, w: 4 }),
  skills: [
    { key: 's1', name: '冰晶投枪', icon: '冰', cd: 6, color: '#9fe8ff',
      desc: '掷出寒冰长枪，命中使敌人减速 2 秒。',
      cast(P) {
        G.proj({ x: P.x + P.facing * 40, y: P.y - 52, vx: P.facing * 900, vy: 0, r: 15, dmg: 15, team: P.team, color: '#d4f6ff', life: 1.1, slow: 2.0, sc: 7 });
        SFX.play('casting');
      } },
    { key: 's2', name: '凛冬领域', icon: '冻', cd: 9, color: '#d4f6ff',
      desc: '冰封周身：范围内敌人冻结 1.2 秒。',
      cast(P) {
        SFX.play('casting'); G.shake(5);
        G.shock({ x: P.x, y: P.y, team: P.team, r0: 24, r1: 250, dur: 0.4, dmg: 10, ky: -120, color: '#9fe8ff', freeze: 1.2, sc: 6 });
        G.fx.ring(P.x, P.y - 40, '#d4f6ff', 22, 300);
      } },
  ],
  strat: { name: '支援律令：轨道冻结炮', code: ['U', 'D', 'R'], cd: 17, color: '#9fe8ff',
    desc: '冻结光束直击敌阵中心。',
    cast(P) {
      G.banner('支援律令：轨道冻结炮', '', 1.3); SFX.play('warn');
      let tx = P.x + P.facing * 260;
      const foes = G.ens.filter(e => !e.dead);
      if (foes.length) { let best = foes[0], bd = 1e9; for (const f of foes) { const d = UT.d2(f.x, f.y, P.x, P.y); if (d < bd) { bd = d; best = f; } } tx = best.x; }
      G.delayed(0.35, () => G.beam({ x: tx, w: 72, warn: 0.5, dur: 0.45, dmg: 18, color: '#c9f2ff', team: P.team, freeze: 1.5, sc: 8 }));
    } },
  ult: { name: '奥义·凛冬已至', desc: '三重冰暴把整个战场冻结。',
    cast(P) {
      G.slowmo(0.7, 0.3); P.invuln = Math.max(P.invuln, 1.2);
      G.banner('奥义·凛冬已至', '', 1.3);
      G.fx.hitFlash(0.4, '#c9f2ff'); SFX.play('beam'); G.shake(12);
      for (let i = 0; i < 3; i++)
        G.delayed(i * 0.22, () => G.shock({
          x: P.x, y: P.y, team: P.team, r0: 30,
          r1: 320 + i * 130, dur: 0.5, dmg: 12, ky: -420,
          color: '#c9f2ff', freeze: 1.2, w: 7,
        }));
    } },
},
/* ================= 12. 时空覆写（双剑 / 时滞残影连斩） ================= */
{
  id: 'tempo', name: '时空覆写·零', en: 'Tempo Rewriter',
  weap: 'twin', glyph: '⧗',
  col: { c1: '#2a1e4e', c2: '#c9a4ff', c3: '#f0e2ff', hair: '#e6daff' },
  hp: 100, spd: 390,
  quip: '时间，站在我这边。',
  combo: [
    M({ n: '刃·壹', dur: 0.24, dmg: 7, box: [-100, 118, -80, 0] }),
    M({ n: '刃·贰', dur: 0.24, dmg: 7, box: [-92, 112, -80, 0] }),
    M({ n: '剪影三连', dur: 0.3, dmg: 12, box: [-135, 140, -84, 0], kx: 150 }),
    M({ n: '回环终结', dmg: 15, box: [-150, 155, -90, 0], kx: 290, w: 6, sfx: 'heavy' }),
  ],
  heavy: M({ n: '双剪·断界', dur: 0.42, win: [0.18, 0.34], box: [-180, 195, -98, 0], dmg: 20, kx: 360, w: 6, sfx: 'heavy' }),
  launcher: M({ n: '时跃升斩', dur: 0.32, win: [0.1, 0.22], box: [-68, 88, -215, 10], dmg: 10, ky: -760, launch: true, w: 6, sfx: 'launch' }),
  air: M({ n: '环刃坠', dur: 0.28, win: [0.06, 0.18], box: [-100, 110, -20, 95], dmg: 10, ky: 240, w: 4 }),
  skills: [
    { key: 's1', name: '相位残影', icon: '相', cd: 6, color: '#c9a4ff',
      desc: '残影穿身三连斩，期间无敌。',
      cast(P) {
        G.slowmo(0.25, 0.4); SFX.play('dodge');
        P.x = UT.clamp(P.x + P.facing * 250, CONFIG.XMIN, CONFIG.XMAX);
        P.invuln = Math.max(P.invuln, 0.45);
        G.fx.spark(P.x - P.facing * 100, P.y - 45, '#c9a4ff', 20, 460);
        _dashHit(P, 0, { count: 3, step: 120, gap: 0.05, dmg: 8, color: '#c9a4ff' });
      } },
    { key: 's2', name: '时滞领域', icon: '刻', cd: 10, color: '#f0e2ff',
      desc: '时停领域 3 秒：敌人行动大幅放缓。',
      cast(P) {
        G.dilT = Math.max(G.dilT, 3);
        G.fx.ring(P.x, P.y - 46, '#f0e2ff', 24, 420);
        G.fx.text(P.x, P.y - 110, '时停 3 秒!', '#c9a4ff', 20);
        SFX.play('casting');
      } },
  ],
  strat: { name: '支援律令：相位乱流', code: ['R', 'U', 'L'], cd: 16, color: '#c9a4ff',
    desc: '时之残像自虚空斩落五连。',
    cast(P) {
      G.banner('支援律令：相位乱流', '', 1.2); SFX.play('warn');
      for (let i = 0; i < 5; i++)
        G.delayed(0.3 + i * 0.2, () => {
          const foes = G.ens.filter(e => !e.dead);
          const e = UT.pick(foes);
          if (!e) return;
          G.hitAbs(e.x, e.y - e.h * 0.55, 130, 150, { dmg: 10, kx: 130, dir: P.facing, team: P.team, sfx: 'slash', life: 0.12, color: '#c9a4ff' });
          G.fx.spark(e.x, e.y - e.h * 0.55, '#c9a4ff', 14, 380);
        });
    } },
  ult: { name: '奥义·终焉回环', desc: '连续覆写 8 次，斩尽残响。',
    cast(P) {
      G.slowmo(0.9, 0.28); P.invuln = Math.max(P.invuln, 1.25);
      G.banner('奥义·终焉回环', '', 1.2);
      G.fx.hitFlash(0.35, '#c9a4ff'); SFX.play('zap');
      for (let i = 0; i < 8; i++)
        G.delayed(0.1 + i * 0.09, () => {
          let best = null, bd = 1e9;
          for (const e of G.ens) if (!e.dead) { const d = UT.d2(e.x, e.y, P.x, P.y); if (d < bd) { bd = d; best = e; } }
          if (!best) return;
          P.x = UT.clamp(best.x + UT.pick([-44, 44]), CONFIG.XMIN, CONFIG.XMAX);
          P.facing = Math.sign(best.x - P.x) || 1;
          G.hitRel(P, P.facing * 45, 0, 135, 155, { dmg: 7, kx: 90, w: 2, sfx: 'slash', life: 0.12 });
          G.fx.spark(P.x, P.y - 45, '#f0e2ff', 10, 380);
        });
      G.delayed(0.9, () => G.hitRel(P, 0, 0, 230, 200, { dmg: 14, kx: 340, w: 8, launch: true, ky: -560, sfx: 'heavy', life: 0.18 }));
    } },
},
];
