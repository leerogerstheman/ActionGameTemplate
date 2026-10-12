'use strict';
/* =========================================================
 * game.js — 游戏流程 / 波次 / 风格评级 / HUD
 * 场景：title → select → battle → win / lose
 * ========================================================= */

const RANKS = [
  { m: 0, l: 'D', c: '#8a8f9c' }, { m: 60, l: 'C', c: '#6ee7c8' },
  { m: 140, l: 'B', c: '#5ec8ff' }, { m: 260, l: 'A', c: '#b48cff' },
  { m: 420, l: 'S', c: '#ffd23c' }, { m: 620, l: 'SS', c: '#ff8c3a' },
  { m: 860, l: 'SSS', c: '#ff4d6d' },
];
const ARROWS = { U: '▲', D: '▼', L: '◀', R: '▶' };

class Game {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.fx = new Fx();
    this.scene = 'title'; this.sel = 0; this.selT = 0;
    this.player = null; this.ens = []; this.summons = [];
    this.hitboxes = []; this.projs = []; this.props = [];
    this.timers = [];
    this.hitstop = 0; this.slowT = 0; this.slowF = 1; this.shakeAmt = 0;
    this.bannerMsg = { t: 0, text: '', sub: '' };
    this.style = { pts: 0, tag: '', cool: 0, rank: 0 };
    this.combo = 0; this.comboT = 0; this.maxCombo = 0;
    this.kills = 0; this.battleT = 0; this.dmgDealt = 0;
    this.waveIdx = -1; this.pending = []; this.interT = 0;
    this.codeState = null; this.paused = false;
    this.deadT = 0; this.prevRank = 0;
    this.endless = false; this.endlessN = 0; this.dScale = 1;  // 无尽深渊
    this.dilT = 0;   // 时停领域（敌人行动放缓）
    this.rankPop = 0; // 风格评级升级弹跳动画
    window.G = this;  // 数据层(角色技能/敌人AI)通过全局 G 调用 API
  }
  get warn() { return 0; }

  /* ================= 对外 API（数据层调用） ================= */
  hitRel(src, ox, oy, w, h, opts) {
    const cx = src.x + ox, cy = src.y + (oy || -Math.min(46, h * 0.4));
    this.hitboxes.push(new Hitbox(Object.assign({ x: cx, y: cy, w, h, team: src.team, dir: src.facing }, opts)));
  }
  hitAbs(cx, cy, w, h, opts) {
    this.hitboxes.push(new Hitbox(Object.assign({ x: cx, y: cy, w, h }, opts)));
  }
  proj(p) { this.projs.push(new Projectile(p)); }
  shock(p) { this.props.push(new Shock(p)); }
  beam(p) { this.props.push(new Beam(p)); }
  fire(p) { this.props.push(new FireZone(p)); }
  orb(x, y) { this.props.push(new HealOrb(x, y)); }
  meteors(x, n, dmg, team, color, scale = 1.6) {
    SFX.play('warn');
    for (let i = 0; i < n; i++) {
      const tx = UT.clamp(x + UT.rand(-120, 120), CONFIG.XMIN, CONFIG.XMAX);
      this.delayed(i * 0.14, () => {
        if (this.scene !== 'battle') return;
        this.proj({ x: tx, y: -80, vx: UT.rand(-50, 50), vy: 1250, r: 15 * scale, dmg,
          team, color: color || '#ff7a33', life: 3, kind: 'meteor', sc: 5 });
      });
    }
  }
  spawn(id, x) {
    let e = null;
    if (id === 'boss') e = new Boss(BOSS_DEF, x);
    else if (ELITES[id]) e = new Enemy(ELITES[id], x, true);
    else if (MOBS[id]) e = new Enemy(MOBS[id], x, false);
    if (!e) return;
    if (this.dScale > 1) { e.maxhp = Math.ceil(e.maxhp * this.dScale); e.hp = e.maxhp; }
    this.ens.push(e);
    this.fx.ring(x, CONFIG.FLOOR - 10, '#ff5566', 12, 320);
  }
  /* 同时出手的杂兵数（攻击令牌编排） */
  attackers() {
    return this.ens.filter(e => !e.dead && !e.elite && !e.boss && (e.state === 'tele' || e.state === 'act')).length;
  }
  delayed(t, fn) { this.timers.push({ t, fn }); }
  slowmo(t, f = 0.4) { this.slowT = Math.max(this.slowT, t); this.slowF = f; }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  banner(text, sub = '', t = 1.6) { this.bannerMsg = { t, text, sub, max: t }; }
  addStyle(n, tag) {
    if (tag === 'kill') n = 12;
    if (tag === this.style.tag && tag !== 'kill') n *= 0.55;
    this.style.tag = tag; this.style.cool = 1.1;
    this.style.pts = Math.min(1100, this.style.pts + n);
  }
  onEnemyDead(e) {
    this.kills++;
    this.addStyle(0, 'kill');
    this.makeText(e.x, e.y - e.h * 0.7, e.elite ? e.name + ' 击破!' : '击破!', '#ffd23c');
    if (UT.chance(e.elite ? 1 : 0.18)) this.orb(e.x, e.y - 40);
  }
  makeText(x, y, s, c) { this.fx.text(x, y, s, c, 18); }
  onPlayerHurt() { this.style.pts = Math.max(0, this.style.pts * 0.5 - 30); this.combo = 0; }
  onPlayerDead() { this.banner('你已陨落……', '灰烬将继续燃烧', 2.5); this.deadT = 1.8; }

  /* ================= 场景切换 ================= */
  startBattle(defIdx) {
    this.sel = defIdx;
    const def = CHARS[defIdx];
    this.player = new Player(def, 320);
    this.ens = []; this.hitboxes = []; this.projs = []; this.props = []; this.timers = [];
    this.style = { pts: 0, tag: '', cool: 0, rank: 0 };
    this.combo = 0; this.maxCombo = 0; this.kills = 0; this.battleT = 0; this.dmgDealt = 0;
    this.waveIdx = -1; this.pending = []; this.interT = 0.01; this.codeState = null;
    this.paused = false; this.deadT = 0;
    this.endless = false; this.endlessN = 0; this.dScale = 1; this.dilT = 0; this.rankPop = 0;
    this.scene = 'battle';
    this.banner(def.name, '敌方部队接近中！', 2.2);
    SFX.play('ok');
  }
  /* ---- 无尽深渊：胜利后可继续挑战，每波难度递增 ---- */
  startEndless() {
    if (!this.player) return;
    this.endless = true; this.endlessN = 0; this.dScale = 1;
    this.ens = []; this.pending = []; this.hitboxes = []; this.projs = []; this.props = []; this.timers = [];
    this.player.dead = false; this.player.hp = this.player.maxhp; this.player.ult = 0;
    this.player.state = 'free'; this.player.invuln = 1;
    this.interT = 0.01; this.deadT = 0; this.paused = false;
    this.scene = 'battle';
    this.banner('无尽深渊', '每波难度递增——坚持到底，直到倒下', 2.4);
    SFX.play('rankup');
  }
  genEndlessWave() {
    this.endlessN++;
    const spawns = [];
    const bossWave = this.endlessN % 5 === 0;
    const eliteWave = this.endlessN % 3 === 0;
    if (bossWave) spawns.push(['boss', 1.2, 1020]);
    if (eliteWave) spawns.push([UT.pick(['warden', 'shrieker', 'asura']), 0.6, UT.pick([220, 1020])]);
    const mobIds = ['runner', 'imp', 'caster', 'brute', 'lancer', 'zealot'];
    const n = 4 + Math.min(10, this.endlessN);
    for (let i = 0; i < n; i++)
      spawns.push([UT.pick(mobIds), 0.5 + i * 0.65 + UT.rand(0, 0.5), UT.pick([160, 300, 640, 950, 1120])]);
    this.pending = spawns.map(s => ({ id: s[0], t: s[1], x: s[2] }));
    this.dScale = 1 + this.endlessN * 0.12;
    this.banner('无尽深渊 · 第 ' + this.endlessN + ' 波',
      bossWave ? 'BOSS 波！凝神！' : eliteWave ? '精英波！注意走位' : '难度上升', 2.2);
    if (this.player && !this.player.dead) this.player.heal(10);
  }
  toSelect() { this.scene = 'select'; this.player = null; this.ens = []; this.fx.p = []; this.fx.t = []; }

  /* ================= 主更新 ================= */
  update(rdt) {
    SFX.beat(rdt);
    this.fx.update(rdt);
    this.shakeAmt *= Math.pow(0.001, rdt);
    if (this.bannerMsg.t > 0) this.bannerMsg.t -= rdt;

    switch (this.scene) {
      case 'title': {
        this.selT += rdt;
        if (input.any) { this.scene = 'select'; SFX.play('ok'); }
        break;
      }
      case 'select': {
        this.selT += rdt;
        if (input.pressed('left')) this.sel = (this.sel + CHARS.length - 1) % CHARS.length, SFX.play('ui');
        if (input.pressed('right')) this.sel = (this.sel + 1) % CHARS.length, SFX.play('ui');
        if (input.pressed('up')) this.sel = (this.sel + CHARS.length - 5) % CHARS.length, SFX.play('ui');
        if (input.pressed('down')) this.sel = (this.sel + 5) % CHARS.length, SFX.play('ui');
        if (input.pressed('confirm')) this.startBattle(this.sel);
        break;
      }
      case 'battle': {
        if (input.pressed('pause')) this.paused = !this.paused;
        if (this.paused) {
          if (input.pressed('confirm')) { this.toSelect(); this.paused = false; }
          break;
        }
        const lbl = input.pressed('music');
        if (lbl) { SFX.musicOn = !SFX.musicOn; SFX.play('ui'); }
        this._updateBattle(rdt);
        break;
      }
      case 'win': case 'lose': {
        if (this.scene === 'win' && input.pressed('s1')) { this.startEndless(); this.selT = 0; break; }
        if (input.pressed('confirm')) { SFX.play('ok'); this.toSelect(); }
        break;
      }
    }
  }

  _updateBattle(rdt) {
    const P = this.player;
    if (this.slowT > 0) this.slowT -= rdt;
    let dt = rdt * (this.slowT > 0 ? this.slowF : 1);
    if (this.codeState) dt *= 0.35;
    if (this.hitstop > 0) { this.hitstop -= rdt; dt *= 0.05; }
    if (this.dilT > 0) this.dilT -= rdt;
    const eDt = dt * (this.dilT > 0 ? 0.4 : 1);   // 时停领域：敌方时间轴放缓
    this.battleT += rdt;

    if (this.deadT > 0) {
      this.deadT -= rdt;
      if (this.deadT <= 0) this.scene = 'lose';
    }

    /* --- 支援律令方向码输入 --- */
    this._updateCode(rdt);

    /* --- 实体更新 --- */
    if (P) P.update(dt);
    for (const e of this.ens) e.update(eDt);
    this.ens = this.ens.filter(e => !e.dead);
    for (const h of this.hitboxes) h.update(h.team === 'enemy' ? eDt : dt);
    this.hitboxes = this.hitboxes.filter(h => !h.dead);
    for (const pr of this.projs) pr.update(pr.team === 'enemy' ? eDt : dt);
    this.projs = this.projs.filter(p => !p.dead);
    for (const z of this.props) z.update((z.team === 'enemy' && z instanceof Shock) ? eDt : dt);
    this.props = this.props.filter(z => !z.dead);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const q = this.timers[i]; q.t -= dt;
      if (q.t <= 0) { this.timers.splice(i, 1); try { q.fn(); } catch (err) { console.error(err); } }
    }

    this._resolve();

    /* --- 回复球拾取 --- */
    for (const z of this.props) {
      if (z instanceof HealOrb && P && !P.dead) {
        if (UT.d2(z.x, z.y, P.x, P.y) < 44 * 44) {
          z.dead = true; P.heal(8); SFX.play('heal');
          this.fx.ring(z.x, z.y - 10, '#5fff9a', 10, 220);
        }
      }
    }

    /* --- 风格评级衰减 --- */
    const s = this.style;
    if (s.cool > 0) s.cool -= rdt;
    else s.pts = Math.max(0, s.pts - (16 + s.rank * 12) * rdt);
    let rk = 0;
    for (let i = RANKS.length - 1; i >= 0; i--) if (s.pts >= RANKS[i].m) { rk = i; break; }
    if (rk > s.rank) { SFX.play('rankup'); this.rankPop = 1; }
    s.rank = rk;
    this.rankPop = Math.max(0, this.rankPop - rdt * 2.4);
    this.comboT -= rdt;
    if (this.comboT <= 0) this.combo = 0;

    /* --- 波次逻辑 --- */
    this._updateWaves(rdt);
  }

  _updateCode(rdt) {
    const P = this.player;
    if (!P || P.dead) { this.codeState = null; return; }
    if (!this.codeState) {
      if (input.pressed('code') && P.cds.strat <= 0 && (P.state === 'free' || P.state === 'atk')) {
        this.codeState = { seq: P.def.strat.code, i: 0, t: 3.6, flash: 0 };
        SFX.play('warn');
      }
      return;
    }
    const cs = this.codeState;
    cs.t -= rdt; cs.flash = Math.max(0, cs.flash - rdt);
    const keymap = { up: 'U', down: 'D', left: 'L', right: 'R' };
    let acted = false;
    for (const k in keymap) {
      if (acted) break;
      if (input.pressed(k)) {
        acted = true;
        if (keymap[k] === cs.seq[cs.i]) {
          cs.i++; cs.flash = 1; SFX.play('ui');
          if (cs.i >= cs.seq.length) {
            this.codeState = null;
            P.tryStrat();
            SFX.play('ok');
            this.slowmo(0.2, 0.5);
            return;
          }
        } else {
          SFX.play('fizz');
          this.makeText(P.x, P.y - 130, '律令中断!', '#ff5566');
          P.cds.strat = Math.max(P.cds.strat, 3);
          this.codeState = null;
          return;
        }
      }
    }
    if (cs.t <= 0) {
      SFX.play('fizz');
      this.makeText(P.x, P.y - 130, '律令超时', '#ff5566');
      P.cds.strat = Math.max(P.cds.strat, 3);
      this.codeState = null;
    }
  }

  _updateWaves(rdt) {
    /* 波间过渡 */
    if (this.interT > 0) {
      this.interT -= rdt;
      if (this.interT <= 0) {
        if (this.endless) { this.genEndlessWave(); return; }
        this.waveIdx++;
        if (this.waveIdx >= WAVES.length) {
          this.scene = 'win';
          this.bannerMsg = { t: 0, text: '', sub: '' };
          SFX.play('rankup');
          return;
        }
        const cur = WAVES[this.waveIdx];
        this.pending = cur.spawns.map(s => ({ id: s[0], t: s[1], x: s[2] }));
        this.banner(cur.name, cur.sub || '', 2.4);
        if (this.player && !this.player.dead) this.player.heal(18);
      }
      return;
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const q = this.pending[i]; q.t -= rdt;
      if (q.t <= 0) { this.spawn(q.id, q.x); this.pending.splice(i, 1); }
    }
    if (this.pending.length === 0 && this.ens.length === 0) {
      if (this.endless) {
        if (this.player && !this.player.dead) {
          this.interT = 1.6;
          this.banner('肃清', '深渊将继续坍塌……', 1.4);
          this.player.heal(12);
          SFX.play('ok');
        }
        return;
      }
      if (this.waveIdx >= WAVES.length - 1) {
        this.scene = 'win'; SFX.play('rankup');   // 最终波（Boss）被消灭
      } else {
        this.interT = 1.8;
        this.banner('CLEAN — 区域肃清', '回复少量 HP，准备下一波', 1.7);
        SFX.play('ok');
      }
    }
  }

  /* ================= 判定解算 ================= */
  _foes(team) { return team === 'player' ? this.ens : (this.player ? [this.player] : []); }
  _hitRect(h) { return { l: h.x - h.w / 2, t: h.y - h.h / 2, r: h.x + h.w / 2, b: h.y + h.h / 2 }; }
  _applyHit(foe, src) {
    const dmg = src.dmg || 0;
    this.fx.spark(foe.x + UT.rand(-8, 8), foe.y - foe.h * 0.55, src.color || '#fff', 7, 340);
    if (foe.team === 'player') {
      foe.takeHit(dmg, { dir: src.dir || 0, kb: src.kx || 220, launch: src.launch, ky: src.ky });
    } else {
      if (src.slow && foe.applySlow) foe.applySlow(src.slow);
      if (src.freeze && foe.stun !== undefined) foe.stun = Math.max(foe.stun, src.freeze);
      foe.takeHit(dmg, { dir: src.dir || 0, kx: src.kx, ky: src.ky, launch: src.launch });
      if (this.player && !this.player.dead) {
        this.combo++; this.comboT = 1.4;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.dmgDealt += dmg;
        this.addStyle(src.sc || 3, 'atk' + (src.id || ''));
        this.player.ult = Math.min(100, this.player.ult + dmg * 0.4);
        this.fx.dmg(foe.x, foe.y - foe.h * 0.7, Math.round(dmg), (src.sc || 3) >= 6);
        SFX.play(src.sfx || 'hit');
        this.hitstop = Math.max(this.hitstop, (src.sc || 3) >= 6 ? 0.07 : 0.035);
        if (src.sc >= 6) this.shake(4);
        if (src.leech) this.player.heal(src.leech);
      }
    }
  }
  _resolve() {
    /* hitbox vs 目标 */
    for (const h of this.hitboxes) {
      const hr = this._hitRect(h);
      for (const foe of this._foes(h.team)) {
        if (foe.dead || h.hits.has(foe)) continue;
        const fr = foe.rect;
        if (hr.l < fr.r && hr.r > fr.l && hr.t < fr.b && hr.b > fr.t) {
          h.hits.add(foe);
          this._applyHit(foe, h);
          if (!h.pierce) { h.dead = true; break; }
        }
      }
    }
    /* 冲击环 */
    for (const s of this.props) {
      if (!(s instanceof Shock)) continue;
      for (const foe of this._foes(s.team)) {
        if (foe.dead || s.hitset.has(foe)) continue;
        const dx = Math.abs(foe.x - s.x);
        const verticalOK = Math.abs(foe.y - s.y) < 60 + 190 * s.tall;
        if (dx < s.r && dx > Math.max(0, s.r - 120) && verticalOK) {
          s.hitset.add(foe);
          this._applyHit(foe, {
            dmg: s.dmg, dir: Math.sign(foe.x - s.x) || 1, kx: 260, color: s.color, sc: s.sc, sfx: 'boom',
            launch: s.ky < -160, ky: s.ky, slow: s.slow, freeze: s.freeze,
          });
        }
      }
    }
    /* 光柱 */
    for (const b of this.props) {
      if (!(b instanceof Beam) || !b.active) continue;
      for (const foe of this._foes(b.team)) {
        if (foe.dead || b.hitset.has(foe)) continue;
        if (Math.abs(foe.x - b.x) < b.w / 2 + foe.r) {
          b.hitset.add(foe);
          this._applyHit(foe, { dmg: b.dmg, dir: 0, kx: 100, color: b.color, sc: 7, sfx: 'beam', slow: b.slow, freeze: b.freeze });
        }
      }
    }
    /* 弹幕 */
    for (const pr of this.projs) {
      if (pr.kind === 'bomb' || pr.kind === 'meteor') continue;   // 触地自爆即结算
      const foes = this._foes(pr.team);
      for (const foe of foes) {
        if (foe.dead || pr.hitset.has(foe)) continue;
        const fc = { x: UT.clamp(pr.x, foe.rect.l, foe.rect.r), y: UT.clamp(pr.y, foe.rect.t, foe.rect.b) };
        if (UT.d2(fc.x, fc.y, pr.x, pr.y) < pr.r * pr.r) {
          pr.hitset.add(foe);
          this._applyHit(foe, { dmg: pr.dmg, dir: Math.sign(pr.vx) || 1, kx: 160, color: pr.color, sc: pr.sc, sfx: 'zap', slow: pr.slow, freeze: pr.freeze });
          if (pr.leech && this.player) this.player.heal(pr.leech);
          if (pr.chain > 0) {
            let best = null, bd = 420 * 420;
            for (const o of this.ens) {
              if (o === foe || o.dead) continue;
              const d = UT.d2(o.x, o.y - o.h * 0.5, pr.x, pr.y);
              if (d < bd && !pr.hitset.has(o)) { bd = d; best = o; }
            }
            if (best) {
              this.proj({ x: pr.x, y: pr.y, vx: (best.x - pr.x) * 2.2, vy: ((best.y - best.h * 0.5) - pr.y) * 2.2, r: pr.r, dmg: pr.dmg, team: pr.team, color: pr.color, life: 0.5, chain: pr.chain - 1, sc: pr.sc });
              this.fx.spark(pr.x, pr.y, pr.color, 6, 260);
              SFX.play('zap');
            }
          }
          if (!pr.pierce) { pr.dead = true; break; }
        }
      }
    }
  }

  /* ================= 绘制 ================= */
  draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CONFIG.W, CONFIG.H);
    if (this.scene === 'title') { this._drawTitle(ctx); return; }
    if (this.scene === 'select') { this._drawSelect(ctx); return; }
    // battle / win / lose 都画战场
    ctx.save();
    if (this.shakeAmt > 0.3) ctx.translate(UT.rand(-this.shakeAmt, this.shakeAmt), UT.rand(-this.shakeAmt, this.shakeAmt) * 0.6);
    this._drawBattle(ctx);
    ctx.restore();
    if (this.scene === 'win') this._drawEnd(ctx, true);
    if (this.scene === 'lose') this._drawEnd(ctx, false);
    this.fx.draw(ctx);
  }

  _drawTitle(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, CONFIG.H);
    g.addColorStop(0, '#0b0918'); g.addColorStop(1, '#241231');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
    ctx.fillStyle = 'rgba(255,106,51,.14)';
    ctx.beginPath(); ctx.arc(880, 210, 150 + Math.sin(this.selT * 2) * 6, 0, 7); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5f1e6';
    ctx.font = 'bold 90px "Segoe UI",sans-serif';
    ctx.fillText('STYLISH ACTION', CONFIG.W / 2, 270 - Math.sin(this.selT * 1.6) * 5);
    ctx.font = '26px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#c8b090';
    ctx.fillText('鬼泣式连段 × 地狱潜兵律令 × 血技极技 — 动作游戏模板 Demo', CONFIG.W / 2, 324);
    ctx.font = '20px "Microsoft YaHei",sans-serif';
    if (Math.sin(this.selT * 4) > -0.3) {
      ctx.fillStyle = '#fff';
      ctx.fillText('—— 按任意键开始 ——', CONFIG.W / 2, 430);
    }
    ctx.fillStyle = '#7d7468';
    ctx.font = '16px "Microsoft YaHei",sans-serif';
    ctx.fillText('模板代码即文档：data/characters.js 改角色 · data/enemies.js 改敌人与波次', CONFIG.W / 2, 640);
  }

  _drawSelect(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, CONFIG.H);
    g.addColorStop(0, '#0d0b1a'); g.addColorStop(1, '#1c1026');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5f1e6'; ctx.font = 'bold 34px "Microsoft YaHei",sans-serif';
    ctx.fillText('选择你的猎魔者', CONFIG.W / 2, 66);
    ctx.font = '16px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#9a8f80';
    ctx.fillText('←→↑↓ 选择 · Enter 出击', CONFIG.W / 2, 96);
    const cw = 216, ch = 148, gx = (CONFIG.W - 5 * cw - 4 * 14) / 2, gy0 = 118;
    CHARS.forEach((c, i) => {
      const row = Math.floor(i / 5);
      const col = i % 5;
      const x = gx + col * (cw + 14), y = gy0 + row * (ch + 10);
      const on = i === this.sel;
      ctx.fillStyle = on ? 'rgba(255,106,51,.2)' : 'rgba(255,255,255,.045)';
      roundRect(ctx, x, y, cw, ch, 12); ctx.fill();
      ctx.strokeStyle = on ? '#ff6a33' : 'rgba(255,255,255,.12)';
      ctx.lineWidth = on ? 3 : 1.5;
      roundRect(ctx, x, y, cw, ch, 12); ctx.stroke();
      ctx.fillStyle = c.col.c3; ctx.globalAlpha = on ? 1 : 0.55;
      ctx.font = 'bold 46px sans-serif';
      ctx.fillText(c.glyph, x + cw / 2, y + 60 + (on ? -3 : 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = on ? '#fff' : '#c9c0b4';
      ctx.font = 'bold 16px "Microsoft YaHei",sans-serif';
      ctx.fillText(c.name, x + cw / 2, y + 88);
      ctx.font = '12px "Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#9a8f80';
      ctx.fillText(c.en + ' · HP ' + (c.hp + 10) + ' · 速 ' + c.spd, x + cw / 2, y + 108);
      ctx.font = '13px "Microsoft YaHei",sans-serif'; ctx.fillStyle = c.col.c3;
      ctx.fillText(c.skills[0].name + ' / ' + c.skills[1].name, x + cw / 2, y + 128);
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#7d7468';
      ctx.fillText(c.strat.code.map(k => ARROWS[k]).join('  '), x + cw / 2, y + 144);
    });
    const c = CHARS[this.sel];
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8dfce'; ctx.font = '17px "Microsoft YaHei",sans-serif';
    ctx.fillText('「' + c.quip + '」', gx, 606);
    ctx.fillStyle = '#9a8f80'; ctx.font = '14px "Microsoft YaHei",sans-serif';
    ctx.fillText('支援律令：' + c.strat.name + ' —— 按 Q 后依次输入 ' + c.strat.code.map(a => ARROWS[a]).join(' ') + '　·　奥义：' + c.ult.name, gx, 632);
    ctx.fillText('流派对参考：鬼泣连段 / 血咒血技 / 传说极技 / 地狱潜兵支援呼叫', gx, 656);
    ctx.textAlign = 'center';
  }

  _drawBattle(ctx) {
    /* --- 战场整体绘制 --- */
    this._drawBg(ctx);
    /* 时停领域色调 */
    if (this.dilT > 0) {
      ctx.globalAlpha = Math.min(0.22, this.dilT * 0.3);
      ctx.fillStyle = '#7fd0ff';
      ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
      ctx.globalAlpha = 1;
    }
    for (const z of this.props) z.draw(ctx);
    for (const e of this.ens) e.draw(ctx);
    if (this.player) this.player.draw(ctx);
    for (const h of this.hitboxes) h.draw(ctx);
    for (const pr of this.projs) pr.draw(ctx);
    /* 低血量警示暗角 */
    if (this.player && !this.player.dead && this.player.hp / this.player.maxhp < 0.3) {
      const va = 0.16 + 0.08 * Math.sin(this.battleT * 8);
      const vg = ctx.createRadialGradient(CONFIG.W / 2, CONFIG.H / 2, 240, CONFIG.W / 2, CONFIG.H / 2, 760);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(190,30,50,' + va + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
    }
    this._drawHUD(ctx);
  }

  _drawBg(ctx) {
    /* 波次进度切换场景调色板：血港(0/1) → 冰蓝走廊(2/3) → 灰烬王座(4)；无尽模式循环 */
    const PALS = [
      { s0: '#0b0918', s1: '#20142e', s2: '#341c30', moon: 'rgba(255,190,150,.16)', mFill: 'rgba(255,220,190,.5)', hill: '#171124', tower: '#100d1c', ground: '#191220', edge: '#2c1b2a', lamp: 'rgba(255,106,51,.12)', brazier: '#241820', torch: 'rgba(255,150,70,.8)' },
      { s0: '#0a0d18', s1: '#101c30', s2: '#1d2740', moon: 'rgba(160,210,255,.18)', mFill: 'rgba(210,235,255,.55)', hill: '#111827', tower: '#0c1220', ground: '#12161e', edge: '#242e3e', lamp: 'rgba(110,190,255,.12)', brazier: '#141c26', torch: 'rgba(140,210,255,.8)' },
      { s0: '#170a10', s1: '#2a0f14', s2: '#3a1a1a', moon: 'rgba(255,120,90,.2)', mFill: 'rgba(255,170,140,.5)', hill: '#1d0f14', tower: '#16090e', ground: '#1c1214', edge: '#38201e', lamp: 'rgba(255,66,66,.14)', brazier: '#2a1310', torch: 'rgba(255,90,60,.85)' },
    ];
    const pi = this.endless ? (this.endlessN % PALS.length)
      : ([0, 0, 1, 1, 2][UT.clamp(this.waveIdx, 0, 4)] || 0);
    const PAL = PALS[pi];
    const g = ctx.createLinearGradient(0, 0, 0, CONFIG.FLOOR);
    g.addColorStop(0, PAL.s0); g.addColorStop(0.65, PAL.s1); g.addColorStop(1, PAL.s2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, CONFIG.W, CONFIG.FLOOR);
    // 月
    ctx.fillStyle = PAL.moon;
    ctx.beginPath(); ctx.arc(990, 150, 92, 0, 7); ctx.fill();
    ctx.fillStyle = PAL.mFill;
    ctx.beginPath(); ctx.arc(990, 150, 60, 0, 7); ctx.fill();
    // 远山
    ctx.fillStyle = PAL.hill;
    ctx.beginPath();
    ctx.moveTo(0, 470); ctx.lineTo(180, 330); ctx.lineTo(360, 460); ctx.lineTo(560, 310);
    ctx.lineTo(760, 470); ctx.lineTo(1000, 340); ctx.lineTo(1280, 470);
    ctx.lineTo(1280, CONFIG.FLOOR); ctx.lineTo(0, CONFIG.FLOOR); ctx.closePath(); ctx.fill();
    // 尖塔群
    ctx.fillStyle = PAL.tower;
    for (let i = 0; i < 7; i++) {
      const bx = 60 + i * 180, bh = 120 + (i % 3) * 70;
      ctx.fillRect(bx, CONFIG.FLOOR - bh - 62, 46, bh + 62);
      ctx.beginPath();
      ctx.moveTo(bx - 8, CONFIG.FLOOR - bh - 62); ctx.lineTo(bx + 23, CONFIG.FLOOR - bh - 130); ctx.lineTo(bx + 54, CONFIG.FLOOR - bh - 62);
      ctx.closePath(); ctx.fill();
    }
    // 地面
    ctx.fillStyle = PAL.ground; ctx.fillRect(0, CONFIG.FLOOR, CONFIG.W, CONFIG.H - CONFIG.FLOOR);
    ctx.fillStyle = PAL.edge; ctx.fillRect(0, CONFIG.FLOOR, CONFIG.W, 12);
    ctx.fillStyle = PAL.lamp;
    ctx.fillRect(0, CONFIG.FLOOR + 12, CONFIG.W, 4);
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    for (let x = 0; x <= CONFIG.W; x += 96) { ctx.beginPath(); ctx.moveTo(x, CONFIG.FLOOR + 14); ctx.lineTo(x - 50, CONFIG.H); ctx.stroke(); }
    // 边界火盆
    for (const x of [26, CONFIG.W - 26]) {
      ctx.fillStyle = PAL.brazier; ctx.fillRect(x - 7, CONFIG.FLOOR - 74, 14, 74);
      ctx.fillStyle = PAL.torch;
      const fl = 8 + Math.sin(this.battleT * 9 + x) * 4;
      ctx.beginPath(); ctx.arc(x, CONFIG.FLOOR - 80, fl, 0, 7); ctx.fill();
    }
  }

  _drawHUD(ctx) {
    const P = this.player;
    if (!P) return;
    /* --- 左下：玩家 --- */
    const bx = 26, by = CONFIG.H - 104;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    roundRect(ctx, bx - 8, by - 52, 396, 140, 10); ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8dfce'; ctx.font = 'bold 16px "Microsoft YaHei",sans-serif';
    ctx.fillText(P.def.name + (P.dead ? '  —— 阵亡 ——' : ''), bx, by - 28);
    // HP
    ctx.fillStyle = '#3a1f28'; ctx.fillRect(bx, by - 18, 360, 18);
    const hpk = Math.max(0, P.hp / P.maxhp);
    const hg = ctx.createLinearGradient(bx, 0, bx + 360, 0);
    hg.addColorStop(0, '#ff5f6d'); hg.addColorStop(1, '#ffb35f');
    ctx.fillStyle = hg; ctx.fillRect(bx, by - 18, 360 * hpk, 18);
    ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif';
    ctx.fillText(Math.ceil(Math.max(0, P.hp)) + ' / ' + P.maxhp, bx + 6, by - 5);
    // 奥义计量
    ctx.fillStyle = '#2a2440'; ctx.fillRect(bx, by + 6, 360, 8);
    ctx.fillStyle = P.ult >= 100 ? (Math.sin(this.battleT * 12) > 0 ? '#ffd23c' : '#fff') : '#8f6aff';
    ctx.fillRect(bx, by + 6, 360 * (P.ult / 100), 8);
    ctx.fillStyle = '#9a8f80'; ctx.font = '11px "Microsoft YaHei",sans-serif';
    ctx.fillText('奥义计量 O · 满 100 释放', bx, by + 30);
    // 技能格
    P.def.skills.forEach((sk, i) => {
      const sx = bx + i * 54, sy = by + 40, sz = 44;
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      roundRect(ctx, sx, sy, sz, sz, 8); ctx.fill();
      ctx.strokeStyle = sk.color; ctx.lineWidth = 2;
      roundRect(ctx, sx, sy, sz, sz, 8); ctx.stroke();
      const cd = P.cds[sk.key], tot = sk.cd;
      if (cd > 0) {
        ctx.fillStyle = 'rgba(0,0,0,.68)';
        ctx.fillRect(sx, sy, sz, sz * (cd / tot));
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif';
        ctx.fillText(Math.ceil(cd), sx + sz / 2 - 6, sy + sz / 2 + 6);
      } else {
        ctx.fillStyle = sk.color; ctx.font = 'bold 22px sans-serif';
        ctx.fillText(sk.icon, sx + 11, sy + 30);
      }
      ctx.fillStyle = '#9a8f80'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText(sk.key.toUpperCase(), sx + 4, sy + sz + 14);
      ctx.fillStyle = '#cfc6ba'; ctx.font = '12px "Microsoft YaHei",sans-serif';
      ctx.fillText(sk.name, sx + 24, sy + sz + 14);
    });
    /* 律令芯片 */
    const sy = by + 40, sz = 44;
    const qxx = bx + P.def.skills.length * 54 + 10;
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    roundRect(ctx, qxx, sy, sz + 96, sz, 8); ctx.fill();
    ctx.strokeStyle = P.def.strat.color; ctx.lineWidth = 2;
    roundRect(ctx, qxx, sy, sz + 96, sz, 8); ctx.stroke();
    ctx.fillStyle = P.cds.strat > 0 ? 'rgba(20,16,24,.7)' : P.def.strat.color;
    ctx.fillRect(qxx, sy, sz, cdFrac(P.cds.strat, P.def.strat.cd) * sz);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px "Microsoft YaHei",sans-serif';
    ctx.fillText('Q', qxx + 16, sy + 29);
    ctx.fillStyle = '#fff'; ctx.font = '15px "Microsoft YaHei",sans-serif';
    P.def.strat.code.forEach((a, i) => {
      ctx.fillStyle = i < (this.codeState ? this.codeState.i : 0) ? '#5fff9a' : P.def.strat.color;
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(ARROWS[a], qxx + sz + 10 + i * 26, sy + 29);
    });
    ctx.fillStyle = '#9a8f80'; ctx.font = '10px "Microsoft YaHei",sans-serif';
    ctx.fillText('支援律令', qxx + sz + 12, sy + sz - 6);

    /* --- 右侧：风格评级 --- */
    const s = this.style, rk = RANKS[s.rank];
    ctx.textAlign = 'right';
    ctx.fillStyle = rk.c;
    const rsize = (128 - rk.l.length * 22 + Math.sin(this.battleT * 8) * 3) * (1 + this.rankPop * 0.22);
    ctx.font = `italic bold ${rsize}px Georgia,serif`;
    ctx.shadowColor = rk.c; ctx.shadowBlur = 26;
    ctx.globalAlpha = 0.92;
    ctx.fillText(rk.l, CONFIG.W - 40, 210);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.font = 'bold 16px "Segoe UI",sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.fillText('STYLE', CONFIG.W - 44, 236);
    if (this.combo > 1) {
      const ps = 1 + Math.max(0, this.comboT - 1.2) * 2.4;
      ctx.fillStyle = '#fff'; ctx.font = `bold ${34 * ps}px Georgia,serif`;
      ctx.fillText(this.combo, CONFIG.W - 40, 296);
      ctx.font = 'bold 15px "Segoe UI",sans-serif'; ctx.fillStyle = '#ffd23c';
      ctx.fillText('COMBO', CONFIG.W - 42, 316);
    }

    /* --- 顶部：波次 --- */
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = 'bold 17px "Microsoft YaHei",sans-serif';
    const w = WAVES[this.waveIdx];
    ctx.fillText(w ? w.name : (this.endless ? '无尽深渊 · 第 ' + this.endlessN + ' 波' : ''), 26, 34);
    /* --- Boss 血条 --- */
    const boss = this.ens.find(e => e.boss);
    if (boss && !boss.dead) {
      const bw = 560, x0 = (CONFIG.W - bw) / 2, y0 = 58;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e8dfce'; ctx.font = 'bold 19px "Microsoft YaHei",sans-serif';
      ctx.fillText(boss.def.name + '   Phase ' + (boss.phaseIdx + 1), CONFIG.W / 2, y0 - 8);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x0 - 3, y0 - 3, bw + 6, 22);
      ctx.fillStyle = '#521'; ctx.fillRect(x0, y0, bw, 16);
      const gg = ctx.createLinearGradient(x0, 0, x0 + bw, 0);
      gg.addColorStop(0, '#ff6a33'); gg.addColorStop(1, '#ffd23c');
      ctx.fillStyle = gg; ctx.fillRect(x0, y0, bw * UT.clamp(boss.hp / boss.maxhp, 0, 1), 16);
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      for (const until of boss.def.phases.slice(1)) ctx.fillRect(x0 + bw * until - 1, y0, 2, 16);
      ctx.textAlign = 'left';
    }

    /* --- 律令输入大字 --- */
    if (this.codeState) {
      const cs = this.codeState;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      roundRect(ctx, CONFIG.W / 2 - 190, CONFIG.H - 226, 380, 128, 14); ctx.fill();
      ctx.fillStyle = P.def.strat.color;
      ctx.font = 'bold 22px "Microsoft YaHei",sans-serif';
      ctx.fillText('支援律令：' + P.def.strat.name, CONFIG.W / 2, CONFIG.H - 190);
      cs.seq.forEach((a, i) => {
        const ax = CONFIG.W / 2 - cs.seq.length * 30 + i * 60 + 30;
        ctx.fillStyle = i < cs.i ? '#5fff9a' : (i === cs.i ? '#fff' : 'rgba(255,255,255,.4)');
        ctx.font = 'bold 44px sans-serif';
        ctx.fillText(ARROWS[a], ax, CONFIG.H - 132);
        if (i === cs.i) {
          ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 2;
          ctx.strokeRect(ax - 24, CONFIG.H - 178, 48, 58);
        }
      });
      ctx.fillStyle = cs.t < 1 ? '#ff5566' : '#9a8f80';
      ctx.font = '13px sans-serif';
      ctx.fillText('剩余 ' + Math.ceil(cs.t) + ' 秒', CONFIG.W / 2, CONFIG.H - 106);
      ctx.textAlign = 'left';
    }

    /* --- 横幅 --- */
    if (this.bannerMsg.t > 0) {
      const b = this.bannerMsg;
      const k = b.t / b.max;
      const a = Math.min(1, k * 4) * Math.min(1, (1 - k) * 9 + 0.35);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f5f1e6';
      ctx.font = 'bold 46px "Microsoft YaHei",sans-serif';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 12;
      ctx.fillText(b.text, CONFIG.W / 2, 300);
      if (b.sub) {
        ctx.font = '19px "Microsoft YaHei",sans-serif';
        ctx.fillStyle = '#c8b090';
        ctx.fillText(b.sub, CONFIG.W / 2, 336);
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    /* --- 操作提示（前 12 秒） --- */
    if (this.battleT < 12 && !P.dead) {
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, (12 - this.battleT) * 0.5);
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.font = '14px "Microsoft YaHei",sans-serif';
      ctx.fillText('J 轻击连段 · K 重击 · L 挑空 → 空中 J 追打 · Shift 翻滚(无敌) · U/I 技能 · Q 支援律令 · O 奥义', CONFIG.W / 2, CONFIG.H - 30);
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }

    if (this.paused) {
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.font = 'bold 40px "Microsoft YaHei",sans-serif';
      ctx.fillText('已暂停', CONFIG.W / 2, 330);
      ctx.font = '17px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#9a8f80';
      ctx.fillText('Esc 继续 · Enter 撤退至角色选择', CONFIG.W / 2, 380);
      ctx.textAlign = 'left';
    }
  }

  _drawEnd(ctx, win) {
    ctx.fillStyle = win ? 'rgba(10,30,20,.72)' : 'rgba(40,8,12,.72)';
    ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
    ctx.textAlign = 'center';
    ctx.fillStyle = win ? '#5fff9a' : '#ff5566';
    ctx.font = 'bold 64px "Microsoft YaHei",sans-serif';
    ctx.fillText(win ? 'VICTORY — 竞技场肃清' : 'MISSION FAILED', CONFIG.W / 2, 250);
    ctx.fillStyle = '#e8dfce'; ctx.font = '22px "Microsoft YaHei",sans-serif';
    const rk = RANKS[this.style.rank];
    const depth = (this.endless && this.endlessN > 0) ? ' · 抵达无尽第 ' + this.endlessN + ' 波' : '';
    ctx.fillText(`用时 ${this.battleT.toFixed(1)}s · 击杀 ${this.kills} · 最高连段 ${this.maxCombo} · 最终风格 ${rk.l}${depth}`, CONFIG.W / 2, 320);
    ctx.font = '17px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#9a8f80';
    ctx.fillText(win ? 'Enter 返回角色选择 ｜ U 直接进入无尽深渊（每波难度递增）' : 'Enter 返回角色选择，换一个流派再战', CONFIG.W / 2, 386);
    ctx.textAlign = 'left';
  }
}

/* 小工具 */
function cdFrac(cd, tot) { return tot <= 0 ? 1 : Math.max(0, cd / tot); }

/* ============ 启动 ============ */
const game = new Game(document.getElementById('cv'));

let _last = performance.now();
function _loop(ts) {
  const rdt = Math.min(0.033, (ts - _last) / 1000);
  _last = ts;
  game.update(rdt);
  game.draw();
  input.endFrame();
  requestAnimationFrame(_loop);
}
requestAnimationFrame(_loop);
