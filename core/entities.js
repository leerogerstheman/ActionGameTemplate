'use strict';
/* =========================================================
 * entities.js — 战斗实体层
 *   Hitbox / Projectile / Shock / Beam / FireZone / HealOrb
 *   Actor（物理基类）→ Player / Enemy / Boss
 * 对外只依赖 window.G（game.js 实例）与 CONFIG/UT/SFX/Gfx。
 * ========================================================= */

/* ---------------- 判定体：近战 hitbox ---------------- */
class Hitbox {
  constructor(p) {
    this.x = p.x; this.y = p.y; this.w = p.w; this.h = p.h;
    this.dmg = p.dmg; this.kx = p.kx || 0; this.ky = p.ky || 0;
    this.launch = !!p.launch; this.life = p.life || 0.1; this.t = 0;
    this.team = p.team; this.dir = p.dir || 1; this.sfx = p.sfx || 'hit';
    this.sc = p.sc || 3; this.pierce = !!p.pierce; this.color = p.color || '#fff';
    this.hits = new Set(); this.dead = false; this.drawFx = true;
    if (p.follow) {  // 判定体跟随宿主移动（用于冲锋等持续位移攻击）
      this.follow = p.follow; this.foff = this.x - p.follow.x;
    }
  }
  update(dt) {
    this.t += dt;
    if (this.follow) {
      if (this.follow.dead) this.dead = true;
      else this.x = this.follow.x + this.foff;
    }
    if (this.t >= this.life) this.dead = true;
  }
  draw(ctx) {
    if (!this.drawFx || this.t > this.life * 0.9) return;
    const k = 1 - this.t / this.life;
    ctx.globalAlpha = 0.14 * k;
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.ellipse(this.x, this.y + this.h * 0.4, this.w * 0.75, this.h * 0.62, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ---------------- 弹幕 ---------------- */
class Projectile {
  constructor(p) {
    Object.assign(this, {
      x: p.x, y: p.y, vx: p.vx || 0, vy: p.vy || 0, r: p.r || 12,
      dmg: p.dmg || 0, team: p.team, color: p.color || '#fff', life: p.life || 2,
      kind: p.kind || 'bolt', trail: p.trail || null, sc: p.sc || 4,
      chain: p.chain || 0, leech: p.leech || 0, blast: p.blast || 0,
      pierce: !!p.pierce, t: 0, dead: false, hitset: new Set(), src: p.src || null,
    });
  }
  update(dt) {
    this.t += dt; this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.trail && Math.random() < 0.7) {
      G.fx.trail(this.x - this.vx * 0.02, this.y - this.vy * 0.02, this.color,
        this.kind === 'meteor' ? 7 : 4);
    }
    if (this.kind === 'bomb' && this.y >= CONFIG.FLOOR) { this.explode(120, 18, 480); return; }
    if (this.kind === 'meteor' && this.y >= CONFIG.FLOOR) { this.explode(170, this.dmg || 20, 700); return; }
    if (this.t >= this.life) this.dead = true;
  }
  explode(r, dmg, ky) {
    this.dead = true;
    G.shake(this.kind === 'meteor' ? 10 : 6);
    SFX.play('boom');
    G.fx.spark(this.x, CONFIG.FLOOR - 30, this.color, 30, 620);
    G.fx.ring(this.x, CONFIG.FLOOR - 40, this.color, 16, 420);
    G.shock({ x: this.x, y: CONFIG.FLOOR, team: this.team, r0: 20, r1: r, dur: 0.35, dmg, ky: -ky, color: this.color, sc: this.sc });
  }
  draw(ctx) {
    ctx.save();
    if (this.kind === 'meteor') {
      const g = ctx.createRadialGradient(this.x, this.y - 90, 4, this.x, this.y, 120);
      g.addColorStop(0, 'rgba(255,170,80,.5)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.fillRect(this.x - 120, this.y - 240, 240, 260);
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.ellipse(this.x, this.y - 14, this.r + 8, this.r * 2.4 + 12, 0, 0, 7); ctx.fill();
    } else if (this.kind === 'wave') {
      ctx.globalAlpha = 0.85; ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.r + 14, this.r * 2.1, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.ellipse(this.x - Math.sign(this.vx) * 16, this.y, this.r, this.r * 1.6, 0, 0, 7); ctx.fill();
    } else {
      ctx.shadowColor = this.color; ctx.shadowBlur = 12;
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, 7); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
}

/* ---------------- 扩散冲击环 ---------------- */
class Shock {
  constructor(p) {
    this.x = p.x; this.y = p.y; this.team = p.team;
    this.r0 = p.r0 || 20; this.r1 = p.r1 || 300; this.dur = p.dur || 0.4;
    this.dmg = p.dmg || 0; this.ky = p.ky || 0; this.color = p.color || '#fff';
    this.sc = p.sc || 5; this.tall = p.tall || 1; this.t = 0; this.dead = false;
    this.hitset = new Set();
  }
  get r() { return UT.lerp(this.r0, this.r1, Math.min(1, this.t / this.dur)); }
  update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; }
  draw(ctx) {
    const k = Math.min(1, this.t / this.dur);
    ctx.save();
    ctx.globalAlpha = 0.75 * (1 - k * 0.8);
    ctx.strokeStyle = this.color; ctx.lineWidth = 10 - 6 * k;
    ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r, this.r * this.tall * 0.32, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha = 0.25 * (1 - k);
    ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 0.7, this.r * this.tall * 0.22, 0, 0, 7); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  }
}

/* ---------------- 轨道光柱（预警 → 落下） ---------------- */
class Beam {
  constructor(p) {
    this.x = p.x; this.w = p.w || 50; this.warn = p.warn || 0.4;
    this.dur = p.dur || 0.35; this.dmg = p.dmg || 10; this.color = p.color || '#ffd23c';
    this.team = p.team; this.t = 0; this.dead = false; this.hitset = new Set();
    this.sc = p.sc || 6; this.boomed = false;
  }
  update(dt) {
    this.t += dt;
    if (this.t >= this.warn && !this.boomed) {
      this.boomed = true; SFX.play('beam'); G.shake(7);
      G.fx.spark(this.x, CONFIG.FLOOR - 20, this.color, 24, 520);
      G.fx.hitFlash(0.12, this.color);
    }
    if (this.t >= this.warn + this.dur) this.dead = true;
  }
  get active() { return this.t >= this.warn && this.t < this.warn + this.dur; }
  draw(ctx) {
    if (!this.active) {
      const k = this.t / this.warn;
      ctx.globalAlpha = 0.3 + 0.4 * Math.abs(Math.sin(this.t * 18));
      ctx.strokeStyle = this.color; ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(this.x - this.w / 2, CONFIG.FLOOR - 400, this.w, 400);
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.ellipse(this.x, CONFIG.FLOOR, this.w / 2, 10, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      const k = 1 - (this.t - this.warn) / this.dur;
      ctx.globalAlpha = 0.9 * k + 0.1;
      const g = ctx.createLinearGradient(this.x - this.w / 2, 0, this.x + this.w / 2, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, this.color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(this.x - this.w / 2, -40, this.w, CONFIG.FLOOR + 40);
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.8 * k;
      ctx.fillRect(this.x - this.w * 0.12, -40, this.w * 0.24, CONFIG.FLOOR + 40);
      ctx.globalAlpha = 1;
    }
  }
}

/* ---------------- 地面持续伤害区 ---------------- */
class FireZone {
  constructor(p) {
    this.x = p.x; this.y = p.y; this.r = p.r || 80; this.dur = p.dur || 4;
    this.dps = p.dps || 8; this.team = p.team; this.color = p.color || '#ff8c3a';
    this.t = 0; this.tick = 0; this.dead = false;
  }
  update(dt) {
    this.t += dt; this.tick -= dt;
    if (Math.random() < 0.5) G.fx.trail(this.x + UT.rand(-this.r, this.r), this.y - UT.rand(0, 10), this.color, UT.rand(3, 6));
    if (this.tick <= 0) {
      this.tick = 0.25;
      const foes = this.team === 'player' ? G.ens : [G.player, ...(G.summons || [])];
      for (const f of foes) {
        if (!f || f.dead) continue;
        if (Math.abs(f.x - this.x) < this.r && f.y >= this.y - 90)
          this._apply(f);
      }
    }
    if (this.t >= this.dur) this.dead = true;
  }
  _apply(f) {
    f.takeHit(this.dps * 0.25, { dir: 0, kb: 0, dot: true });
  }
  draw(ctx) {
    const fl = Math.sin(this.t * 12) * 4;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r, 18, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 4; i++) {
      const h = 30 + fl + Math.sin(this.t * 7 + i * 1.7) * 14;
      ctx.fillRect(this.x - this.r + i * this.r * 0.55, this.y - h, 10, h);
    }
    ctx.globalAlpha = 1;
  }
}

/* ---------------- 回复球 ---------------- */
class HealOrb {
  constructor(x, y) { this.x = x; this.y = y; this.vy = -120; this.t = 0; this.dead = false; }
  update(dt) {
    this.t += dt; this.vy += 500 * dt; this.y += this.vy * dt;
    if (this.y > CONFIG.FLOOR) { this.y = CONFIG.FLOOR; this.vy = 0; }
    if (this.t > 9) this.dead = true;
  }
  draw(ctx) {
    const b = Math.sin((this.dead ? 20 : this.t) * 6) * 3;
    ctx.save();
    ctx.shadowColor = '#5fff9a'; ctx.shadowBlur = 14;
    ctx.fillStyle = G.player.artifact ? '#5fff9a' : '#fff';
    ctx.beginPath(); ctx.arc(this.x, this.y - 10 - b, 8, 0, 7); ctx.fill();
    ctx.restore();
  }
}

/* =========================================================
 * Actor — 物理基类
 * ========================================================= */
class Actor {
  constructor(x, team) {
    this.x = x; this.y = CONFIG.FLOOR; this.vx = 0; this.vy = 0;
    this.facing = 1; this.team = team; this.r = 20; this.h = 60;
    this.grounded = true; this.juggle = 0; this.flash = 0; this.dead = false;
    this.fly = 0; this.hoverY = CONFIG.FLOOR - 170; this.stun = 0; this.age = 0;
  }
  get rect() { return { l: this.x - this.r, t: this.y - this.h, r: this.x + this.r, b: this.y }; }
  overlaps(o) {
    const a = this.rect, b = o.rect;
    return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  }
  phys(dt) {
    this.age += dt;
    const airborne = !this.fly || this.stun > 0;
    if (airborne) {
      const g = this.juggle > 0 ? CONFIG.GRAV * CONFIG.JGRAV : CONFIG.GRAV;
      this.vy += g * dt;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (airborne) this.juggle = Math.max(0, this.juggle - dt);
    this.x = UT.clamp(this.x, CONFIG.XMIN, CONFIG.XMAX);
    if (this.fly && this.stun <= 0) {  // 飞行单位悬浮
      const target = this.hoverY + Math.sin(this.age * 2.4) * 12;
      this.y += (target - this.y) * Math.min(1, dt * 3.2);
      this.vy = 0;
    }
    if (this.y >= CONFIG.FLOOR) {
      if (!this.grounded && this.juggle > 0) { G.fx.spark(this.x, this.y, '#888', 8, 250); }
      this.y = CONFIG.FLOOR; this.vy = 0; this.grounded = true; this.juggle = 0;
    } else this.grounded = false;
  }
  faceTo(x) { if (Math.abs(x - this.x) > 4) this.facing = x > this.x ? 1 : -1; }
}

/* =========================================================
 * Player — 玩家状态机
 * ========================================================= */
class Player extends Actor {
  constructor(def, x) {
    super(x, 'player');
    this.def = def; this.r = 22; this.h = 62;
    this.hp = def.hp + 10; this.maxhp = this.hp;  // 基准 HP + 缓冲
    this.state = 'free'; this.t = 0; this.lockT = 0;
    this.move = null; this.hitDone = false; this.buf = false;
    this.cds = { s1: 0, s2: 0, strat: 0 };
    this.ult = 0; this.invuln = 0; this.armor = 0; this.reflect = 0;
    this.dodgeCd = 0; this.airJumps = 1; this.comboIdx = 0; this.chainT = 0;
    this.trailT = 0;
  }
  heal(n) {
    if (this.dead) return;
    const before = this.hp;
    this.hp = Math.min(this.maxhp, this.hp + n);
    if (this.hp > before) G.fx.text(this.x, this.y - 90, '+' + Math.round(this.hp - before), '#5fff9a', 18);
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.armor = Math.max(0, this.armor - dt);
    this.reflect = Math.max(0, this.reflect - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.chainT -= dt;
    if (this.chainT <= 0) this.comboIdx = 0;
    if (this.dead) { this.vx *= 0.9; this.phys(dt); return; }

    const L = input.isDown('left'), R = input.isDown('right');
    const dir = (R ? 1 : 0) - (L ? 1 : 0);
    this.trailT -= dt;

    switch (this.state) {
      case 'free': {
        this.vx = dir * this.def.spd;
        if (dir) this.facing = dir;
        if (this.grounded) this.airJumps = 1;
        if (this.trailT <= 0 && Math.abs(this.vx) > 200 && this.grounded) {
          G.fx.trail(this.x, this.y - 4, this.def.col.c3, 3); this.trailT = 0.12;
        }
        if (input.pressed('jump')) {
          if (this.grounded) { this.vy = -820; this.grounded = false; SFX.play('dodge'); }
          else if (this.airJumps > 0) {
            this.vy = -720; this.airJumps--;
            G.fx.ring(this.x, this.y, this.def.col.c3, 10, 220);
            SFX.play('dodge');
          }
        }
        if (input.pressed('dodge') && this.dodgeCd <= 0) {
          this.state = 'dodge'; this.t = 0; this.dodgeCd = 0.62;
          this.vx = (dir || this.facing) * this.def.spd * 2.1;
          this.invuln = Math.max(this.invuln, 0.3);
          G.fx.spark(this.x, this.y - 10, '#9db4ff', 10, 300); SFX.play('dodge');
        }
        else if (input.pressed('light')) this._light();
        else if (input.pressed('heavy')) this.startMove(this.def.heavy);
        else if (input.pressed('launch')) this.startMove(this.def.launcher);
        else if (input.pressed('s1')) this._skill(0);
        else if (input.pressed('s2')) this._skill(1);
        else if (input.pressed('ult')) this._ult();
        break;
      }
      case 'atk': {
        this.t += dt;
        const mv = this.move;
        this.vx *= Math.pow(0.02, dt);
        if (this.t >= mv.win[0] && !this.hitSpawned) {
          this.hitSpawned = true;
          const cx = this.x + this.facing * ((mv.box[0] + mv.box[1]) / 2);
          const cy = this.y + (mv.box[2] + mv.box[3]) / 2;
          G.hitAbs(cx, cy, Math.abs(mv.box[1] - mv.box[0]), Math.abs(mv.box[3] - mv.box[2]),
            { dmg: mv.dmg, kx: mv.kx, ky: mv.ky, launch: mv.launch, w: mv.w, sfx: mv.sfx, dir: this.facing, color: this.def.col.c3, team: this.team, life: 0.14 });
          G.fx.arc(cx, this.y - 45, this.facing, mv.sfx === 'heavy' ? '#fff' : this.def.col.c3);
          SFX.play(mv.sfx);
        }
        if (this.t >= mv.win[0] * 0.9 && this.t <= mv.dur && input.pressed('light')) this.buf = true;
        if (this.t >= mv.dur) {
          if (this.buf && this.grounded) {
            this.buf = false;
            const next = this.def.combo[this.comboIdx % this.def.combo.length];
            this.comboIdx++;
            this.startMove(next, true);
          } else { this.buf = false; this.state = 'free'; this.move = null; this.chainT = 0.9; }
        }
        break;
      }
      case 'dodge': {
        this.t += dt; this.vx *= Math.pow(0.15, dt);
        if (this.t >= 0.36) this.state = 'free';
        break;
      }
      case 'skill': {
        this.t += dt; this.lockT -= dt;
        this.vx *= Math.pow(0.05, dt);
        if (input.pressed('dodge') && this.dodgeCd <= 0) { this.state = 'dodge'; this.t = 0; this.dodgeCd = 0.62; this.invuln = Math.max(this.invuln, 0.3); SFX.play('dodge'); }
        else if (this.lockT <= 0) this.state = 'free';
        break;
      }
      case 'hurt': {
        this.t += dt; this.vx *= Math.pow(0.1, dt);
        if (this.t >= 0.32) this.state = 'free';
        break;
      }
    }
    this.phys(dt);
  }

  _light() {
    if (!this.grounded) { this.startMove(this.def.air); return; }
    const mv = this.def.combo[this.comboIdx % this.def.combo.length];
    this.comboIdx++;
    this.startMove(mv);
  }
  startMove(mv, keepIdx) {
    this.state = 'atk'; this.t = 0; this.move = mv; this.hitDone = false;
    this.hitSpawned = false; this.buf = false; this.chainT = Math.max(this.chainT, 0.9);
    this.vx = this.facing * (mv.drift || 0);
    if (!keepIdx) this.chainT = 0.9;
  }
  _skill(i) {
    const s = this.def.skills[i];
    if (!s || this.cds[s.key] > 0) { if (s) G.fx.text(this.x, this.y - 110, s.name + ' 冷却中', '#aaa', 14); return; }
    this.cds[s.key] = s.cd;
    this.state = 'skill'; this.t = 0; this.lockT = 0.22;
    G.addStyle(6, 'skill');
    s.cast(this);
  }
  _skillByKey(key) {
    const i = this.def.skills.findIndex(s => s.key === key);
    if (i >= 0) this._skill(i);
  }
  _ult() {
    if (this.ult < 100) { G.fx.text(this.x, this.y - 110, '奥义计量不足', '#ffd23c', 15); return; }
    this.ult = 0;
    this.state = 'skill'; this.t = 0; this.lockT = 0.5; this.invuln = Math.max(this.invuln, 0.6);
    G.addStyle(12, 'ult');
    this.def.ult.cast(this);
  }
  tryStrat() {
    if (this.cds.strat > 0 || this.dead) return false;
    this.cds.strat = this.def.strat.cd;
    G.addStyle(8, 'strat');
    this.def.strat.cast(this);
    return true;
  }
  takeHit(dmg, opts = {}) {
    if (this.dead) return;
    if (this.invuln > 0) {
      G.fx.text(this.x + UT.rand(-20, 20), this.y - 80, 'MISS', '#8fd0ff', 15);
      if (this.reflect > 0) { // 反弹：弹回敌方弹幕
        G.fx.text(this.x, this.y - 100, '反弹!', '#39e5c8', 16);
        G.hitAbs(this.x + this.facing * 60, this.y - 45, 180, 160, { dmg: 6, kx: 160, dir: this.facing, team: this.team, sfx: 'zap', life: 0.15 });
      }
      return;
    }
    this.hp -= dmg;
    this.flash = 0.14;
    SFX.play('hurt');
    G.onPlayerHurt(dmg);
    if (this.armor > 0) { // 霸体：不掉招
      G.fx.spark(this.x, this.y - 45, '#ffd9a0', 8, 260);
      if (this.hp <= 0) this.die();
      return;
    }
    this.state = 'hurt'; this.t = 0; this.move = null;
    this.vx = (opts.dir || 0) * (opts.kb || 240);
    if (opts.launch) { this.vy = opts.ky; this.juggle = 0.7; }
    G.fx.spark(this.x, this.y - 45, '#ff5f5f', 10, 320);
    G.shake(6);
    if (this.hp <= 0) this.die();
  }
  die() {
    this.hp = 0; this.dead = true; this.state = 'dead';
    SFX.play('die'); G.shake(12);
    G.fx.spark(this.x, this.y - 40, '#ff5f5f', 40, 600);
    G.onPlayerDead();
  }
  /* ------- 绘制 ------- */
  draw(ctx) {
    if (this.dead && this.age % 1 < 0.5 && this.state === 'dead') return;
    drawHumanoid(ctx, this, this.def);
    if (this.reflect > 0) {
      ctx.globalAlpha = Math.min(1, this.reflect);
      ctx.strokeStyle = '#39e5c8'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.x, this.y - 42, 44, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.armor > 0) {
      ctx.globalAlpha = Math.min(1, this.armor * 2);
      ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.x, this.y - 42, 38, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

/* =========================================================
 * Enemy — 杂兵 / 精英 AI
 * ========================================================= */
class Enemy extends Actor {
  constructor(def, x, elite) {
    super(x, 'enemy');
    this.def = def; this.elite = !!elite || !!def.seq;
    this.maxhp = def.hp * (elite && def.hp < 300 ? 1 : 1);
    this.hp = this.maxhp; this.r = def.r; this.h = def.h;
    this.spd = def.spd;
    this.fly = def.fly || 0;
    if (this.fly) { this.hoverY = CONFIG.FLOOR - (def.hover || 170); }
    this.state = 'chase'; this.t = 0; this.cur = null; this.atkCd = UT.rand(0.5, 1.4);
    this.seqIdx = 0; this.armorF = def.armorF || 0;
    this.name = def.name;
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.atkCd -= dt; this.stun -= dt;
    if (this.dead) return;
    const P = G.player;
    // 浮空/眩晕：无法行动（飞行单位因悬浮本就不落地，不算浮空）
    if (this.stun > 0 || (!this.grounded && !this.fly)) {
      this.vx *= Math.pow(0.2, dt);
      this.phys(dt);
      if (this.grounded && this.stun <= 0) this.stun = 0.12;
      return;
    }
    this.faceTo(P.x);
    switch (this.state) {
      case 'chase': {
        const dx = P.x - this.x, adx = Math.abs(dx);
        const A = this.cur || this.def.atk;
        if (this.def.keepAway && adx < (A.minRange || 160)) {
          this.vx = -Math.sign(dx) * this.spd * 0.8;
        } else if (adx > A.range * 0.92) {
          this.vx = Math.sign(dx) * this.spd;
          if (Math.random() < dt * 2) G.fx.trail(this.x, this.y - 4, this.def.col.c2, 3);
        } else {
          this.vx = Math.sin(this.age * 3) * this.spd * 0.3;
          if (this.atkCd <= 0) this._begin();
        }
        break;
      }
      case 'tele': {
        this.t -= dt; this.vx = 0;
        if (Math.random() < dt * 14) G.fx.trail(this.x + UT.rand(-this.r, this.r), this.y - this.h * UT.rand(0.3, 0.9), this.def.col.c2, UT.rand(2, 4));
        if (this.t <= 0) { this._payload(); this.state = 'act'; this.t = this.cur.dur; }
        break;
      }
      case 'act': {
        this.t -= dt;
        if (this.cur.payload === 'dash') this.vx = this.facing * this.cur.dash;
        if (this.t <= 0) { this.state = 'rec'; this.t = this.cur.rec; }
        break;
      }
      case 'rec': {
        this.t -= dt; this.vx *= Math.pow(0.05, dt);
        if (this.t <= 0) {
          this.state = 'chase'; this.cur = null;
          this.atkCd = (this.def.atkCd || 1.2) * UT.rand(0.7, 1.25);
        }
        break;
      }
    }
    this.phys(dt);
  }
  _begin() {
    const def = this.def;
    if (def.seq) {          // 精英：按序列循环
      const key = def.seq[this.seqIdx % def.seq.length];
      this.cur = def.atks[key]; this.seqIdx++;
    } else this.cur = def.atk;
    this.state = 'tele'; this.t = this.cur.tele;
    this.faceTo(G.player.x);
  }
  _payload() {
    const c = this.cur, P = G.player, dir = Math.sign(P.x - this.x) || this.facing;
    switch (c.payload) {
      case 'melee':
        G.hitAbs(this.x + dir * ((c.box[0] + c.box[1]) / 2), this.y + (c.box[2] + c.box[3]) / 2,
          Math.abs(c.box[1] - c.box[0]), Math.abs(c.box[3] - c.box[2]),
          { dmg: c.dmg, kx: c.kx || 260, dir, team: 'enemy', sfx: c.sfx, life: 0.14, color: this.def.col.c2 });
        G.fx.arc(this.x + dir * 60, this.y - this.h * 0.5, dir, this.def.col.c2);
        SFX.play(c.sfx || 'slash');
        break;
      case 'dash':
        G.hitAbs(this.x + dir * 40, this.y - this.h * 0.55, Math.abs(c.box[1] - c.box[0]), Math.abs(c.box[3] - c.box[2]),
          { dmg: c.dmg, kx: 340, dir, team: 'enemy', sfx: c.sfx, life: c.dur, color: this.def.col.c2, follow: this });
        break;
      case 'proj': {
        const pr = c.proj, n = pr.n || 1;
        for (let i = 0; i < n; i++) {
          const off = n > 1 ? (i - (n - 1) / 2) * (pr.spread || 200) : 0;
          const ang = Math.atan2((P.y - 40) - (this.y - this.h * 0.6), P.x - this.x + Math.sign(P.x - this.x) * 40);
          const vy = Math.sin(ang) * pr.spd + off * 0.55;
          const vx = Math.cos(ang) * pr.spd;
          G.proj({ x: this.x + dir * 24, y: this.y - this.h * 0.65, vx, vy, r: pr.r, dmg: pr.dmg, team: 'enemy', color: pr.color, life: 3, kind: 'bolt' });
        }
        SFX.play(c.sfx || 'casting');
        break;
      }
      case 'shock': {
        const s = c.shock;
        SFX.play(c.sfx || 'boom'); G.shake(9);
        G.fx.spark(this.x, CONFIG.FLOOR - 20, this.def.col.c2, 26, 480);
        G.shock({ x: this.x, y: CONFIG.FLOOR, team: 'enemy', r0: 30, r1: s.r1, dur: s.dur, dmg: s.dmg, ky: s.ky, color: this.def.col.c2, sc: 1 });
        break;
      }
      case 'summon':
        SFX.play('roar'); G.banner(this.def.name + '：僭主号令！', '', 1.1);
        for (const id of c.spawn) G.spawn(id, UT.clamp(this.x + UT.rand(-260, 260), CONFIG.XMIN, CONFIG.XMAX));
        break;
      case 'blink':
        SFX.play('dodge');
        G.fx.spark(this.x, this.y - this.h * 0.5, this.def.col.c2, 18, 380);
        this.x = UT.clamp(P.x - P.facing * 120, CONFIG.XMIN, CONFIG.XMAX);
        this.facing = Math.sign(P.x - this.x) || 1;
        G.fx.spark(this.x, this.y - this.h * 0.5, this.def.col.c2, 18, 380);
        this.atkCd = 0.15; this.state = 'chase'; this.cur = this.def.atks ?
          this.def.atks.cleave : this.cur;
        return;   // 不进入 act
      case 'rain': {
        G.meteors(P.x + UT.rand(-90, 90), c.rain.n, c.rain.dmg, 'enemy', this.def.col.c2, 1.6);
        break;
      }
    }
  }
  takeHit(dmg, opts = {}) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flash = 0.12;
    if (!opts.dot) {
      const tStun = opts.launch ? 0.42 : 0.17;
      this.stun = Math.max(this.stun, tStun * (1 - this.armorF));
      if (!opts.launch) {
        this.vx += (opts.dir || 0) * (opts.kx || 140) * 0.5;
        this.vx = UT.clamp(this.vx, -400, 400);
      }
      if (opts.launch) {
        this.vy = opts.ky || -640; this.juggle = 1.15;
        this.facing = -(opts.dir || this.facing);
        if (this.fly) this.stun = Math.max(this.stun, 0.55);
      }
    }
    if (this.hp <= 0) this.die();
  }
  die() {
    if (this.dead) return;
    this.dead = true; this.hp = 0;
    SFX.play('die');
    G.fx.spark(this.x, this.y - this.h * 0.5, this.def.col.c2, 26, 520);
    G.fx.ring(this.x, this.y - this.h * 0.5, '#fff', 10, 360);
    G.onEnemyDead(this);
  }
  draw(ctx) { drawShape(ctx, this, this.def); }
}

/* =========================================================
 * Boss — 灰烬僭主（三阶段阶段机）
 * ========================================================= */
class Boss extends Enemy {
  constructor(def, x) {
    super(def, x, true);
    this.boss = true;
    this.phaseIdx = 0; this.thinkCd = 1.6; this.pool = def.phases[0].pool;
    this.cdScale = def.phases[0].cd;
    this.invulnB = 0;
    this.subT = 0;
  }
  update(dt) {
    this._phaseCheck();
    if (this.dead) return;
    if (this.state === 'chase' && !this.cur) {  // Boss 思考节奏
      if (this.thinkCd <= 0) {
        this.thinkCd = this.cdScale * UT.rand(0.8, 1.2);
        const P = G.player;
        const dx = Math.abs(P.x - this.x);
        const pool = this.pool.filter(k => {
          const a = this.def.atks[k];
          if (a.minRange && dx < a.minRange) return false;
          if (a.range < 9999 && dx > a.range * 1.4) return false;
          return true;
        });
        this.cur = this.def.atks[UT.pick(pool.length ? pool : this.pool)];
        this.state = 'tele'; this.t = this.cur.tele;
        G.fx.text(this.x, this.y - this.h - 46, this.cur.n, this.def.col.c2, 22);
        SFX.play('warn');
        return;
      }
      // 追击
      const P = G.player, dx = P.x - this.x;
      this.vx = Math.sign(dx) * this.spd * (this.phaseIdx >= 1 ? 1.15 : 0.9);
      if (this.grounded && Math.random() < dt * 0.2) { if (this.phaseIdx >= 2 && Math.abs(dx) > 300) { this.vy = -700; } }
      this.phys(dt);
      this.thinkCd -= dt;
      return;
    }
    super.update(dt);
  }
  _phaseCheck() {
    if (this.dead) return;
    const ratio = this.hp / this.maxhp;
    const next = this.def.phases[this.phaseIdx + 1];
    if (next && ratio <= next.until) {
      this.phaseIdx++;
      this.pool = this.def.phases[this.phaseIdx].pool;
      this.cdScale = this.def.phases[this.phaseIdx].cd;
      this.cur = null; this.state = 'rec'; this.t = 1.1; this.stun = 0;
      this.invulnB = 1.1;
      G.banner('遗迹震颤——摩迪凯进入第 ' + (this.phaseIdx + 1) + ' 阶段!', '战斗变得更激烈了', 2);
      SFX.play('roar'); G.shake(18); G.fx.hitFlash(0.35, '#ff6a33');
      G.shock({ x: this.x, y: CONFIG.FLOOR, team: 'enemy', r0: 40, r1: 420, dur: 0.6, dmg: 10, ky: -420, color: '#ff6a33', sc: 0 });
      G.spawn('runner', UT.clamp(this.x - 320, CONFIG.XMIN, CONFIG.XMAX));
      G.spawn('imp', UT.clamp(this.x + 320, CONFIG.XMIN, CONFIG.XMAX));
    }
  }
  takeHit(dmg, opts) {
    if (this.invulnB > 0) { G.fx.text(this.x, this.y - this.h - 40, 'IMMUNE', '#aaa', 14); return; }
    super.takeHit(dmg, opts);
  }
}
Boss.prototype.invulnB = 0;

/* Boss update 里 invulnB 计时（挂到原型上执行） */
const _bossRealUpdate = Boss.prototype.update;
Boss.prototype.update = function (dt) { this.invulnB = Math.max(0, this.invulnB - dt); _bossRealUpdate.call(this, dt); };

/* =========================================================
 * 绘制：人形角色 + 武器
 * ========================================================= */
function drawHumanoid(ctx, e, def) {
  const c = def.col, f = e.facing;
  let lean = 0, armA = -2.2, bob = Math.sin(e.age * 4) * 2;
  if (e.state === 'atk' && e.move) {
    const k = UT.clamp(e.t / e.move.dur, 0, 1);
    lean = f * 0.35 * Math.sin(k * Math.PI);
    armA = UT.lerp(-2.2, 1.1, k);
  } else if (e.state === 'hurt') lean = -f * 0.3;
  else if (e.state === 'dodge') lean = f * 0.5;
  if (e.juggle > 0 || !e.grounded) ctx.translate(0, 0);

  // 影子
  ctx.globalAlpha = 0.3 * (1 - UT.clamp((CONFIG.FLOOR - e.y) / 300, 0, 0.7));
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(e.x, CONFIG.FLOOR + 6, e.r + 6, 7, 0, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(e.x, e.y + Math.sin(e.age * 3) * (e.grounded ? 1 : 0) * 0 + bob * 0.4);
  if (e.juggle > 0) ctx.rotate(Math.sin(e.age * 10) * 0.25);
  ctx.scale(f, 1);
  const H = e.h;
  // 腿
  ctx.strokeStyle = c.c1; ctx.lineWidth = 7; ctx.lineCap = 'round';
  const walk = e.grounded && Math.abs(e.vx) > 40 ? Math.sin(e.age * 12) : 0;
  ctx.beginPath(); ctx.moveTo(-2, -H * 0.34); ctx.lineTo(-7 + walk * 9, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, -H * 0.34); ctx.lineTo(7 - walk * 9, 0); ctx.stroke();
  // 披风（背）
  if (def.weap === 'greatsword' || def.weap === 'scythe' || def.weap === 'staff') {
    ctx.fillStyle = c.c1;
    ctx.beginPath();
    ctx.moveTo(-6, -H * 0.72);
    ctx.quadraticCurveTo(-26 - Math.abs(e.vx) * 0.02, -H * 0.5, -14 - Math.abs(e.vx) * 0.015, -H * 0.08);
    ctx.lineTo(-2, -H * 0.34); ctx.closePath(); ctx.fill();
  }
  // 躯干
  ctx.save();
  ctx.translate(0, -H * 0.3); ctx.rotate(lean);
  ctx.fillStyle = c.c1;
  roundRect(ctx, -9, -H * 0.42, 18, H * 0.44, 7); ctx.fill();
  ctx.fillStyle = c.c2;
  roundRect(ctx, -9, -H * 0.42, 18, H * 0.16, 6); ctx.fill();
  // 手臂 + 武器
  ctx.save();
  ctx.translate(6, -H * 0.32); ctx.rotate(armA * (e.state === 'atk' ? 1 : 0.55));
  ctx.strokeStyle = c.c1; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, 0); ctx.stroke();
  drawWeapon(ctx, def.weap, c);
  ctx.restore();
  // 头
  ctx.fillStyle = c.hair;
  ctx.beginPath(); ctx.arc(2, -H * 0.62, 9, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffd8b8';
  ctx.beginPath(); ctx.arc(3, -H * 0.6, 6.4, 0, 7); ctx.fill();
  ctx.fillStyle = c.hair;
  ctx.beginPath(); ctx.arc(1, -H * 0.64, 6.6, Math.PI * 1.05, Math.PI * 2.1); ctx.fill();
  ctx.restore();
  ctx.restore();

  // 受击闪白
  if (e.flash > 0) {
    ctx.globalAlpha = Math.min(0.8, e.flash * 6);
    ctx.fillStyle = '#fff';
    ctx.fillRect(e.x - e.r, e.y - e.h, e.r * 2, e.h);
    ctx.globalAlpha = 1;
  }
  // 无敌帧闪烁
  if (e.invuln > 0 && !e.dead) {
    ctx.globalAlpha = Math.sin(e.age * 40) * 0.3 + 0.3;
    ctx.strokeStyle = def.col.c3; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y - e.h * 0.55, e.r + 12, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawWeapon(ctx, type, c) {
  ctx.lineWidth = 5; ctx.strokeStyle = c.c2; ctx.fillStyle = c.c3;
  switch (type) {
    case 'greatsword': ctx.strokeStyle = '#c9a86a'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(72, -6); ctx.stroke();
      ctx.fillStyle = '#e8b23a'; ctx.fillRect(2, -8, 8, 16); break;
    case 'rapier': ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(66, -3); ctx.stroke(); break;
    case 'rifle': ctx.fillStyle = '#333'; ctx.fillRect(4, -4, 58, 8);
      ctx.fillStyle = c.c3; ctx.fillRect(14, -2, 20, 3); break;
    case 'scythe': ctx.strokeStyle = '#775'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(6, 4); ctx.lineTo(54, -40); ctx.stroke();
      ctx.beginPath(); ctx.arc(54, -46, 22, -2.6, -0.4);
      ctx.strokeStyle = c.c3; ctx.lineWidth = 7; ctx.stroke(); break;
    case 'spear': ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(70, -10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(70, -10); ctx.lineTo(84, -16); ctx.lineTo(72, -2); ctx.fill(); break;
    case 'staff': ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(6, 8); ctx.lineTo(58, -26); ctx.stroke();
      ctx.beginPath(); ctx.arc(60, -28, 8, 0, 7); ctx.fill(); break;
    case 'katana': ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(78, -8); ctx.stroke();
      ctx.strokeStyle = '#eef'; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(78, -8); ctx.stroke(); break;
    case 'glaive': ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(4, 6); ctx.lineTo(64, -18); ctx.stroke();
      ctx.beginPath(); ctx.arc(66, -20, 10, 0.4, 3.4); ctx.stroke(); break;
    case 'crossbow': ctx.strokeStyle = '#553'; ctx.lineWidth = 4;
      ctx.fillRect(4, -3, 44, 6);
      ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(28, -14); ctx.lineTo(36, 0); ctx.stroke(); break;
    case 'gauntlet': ctx.fillStyle = c.c2;
      ctx.beginPath(); ctx.arc(14, 0, 9, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(-2, 2, 8, 0, 7); ctx.fill(); break;
  }
}

/* =========================================================
 * 绘制：敌人剪影（多形态）
 * ========================================================= */
function drawShape(ctx, e, def) {
  const c = def.col, f = e.facing, sh = def.shape;
  let teleRing = e.state === 'tele';
  // 影子
  ctx.globalAlpha = 0.3 * (1 - UT.clamp((CONFIG.FLOOR - e.y) / 320, 0, 0.7));
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(e.x, CONFIG.FLOOR + 6, e.r + 10, 7, 0, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.juggle > 0) ctx.rotate(Math.sin(e.age * 9) * 0.3);
  ctx.scale(f, 1);
  const H = e.h;
  ctx.lineCap = 'round';
  const walk = Math.abs(e.vx) > 30 ? Math.sin(e.age * 12) : 0;
  switch (sh) {
    case 'hound': {
      ctx.strokeStyle = c.c1; ctx.lineWidth = 5;
      for (const [lx, ph] of [[-12, 1], [-5, -1], [8, -1], [15, 1]]) {
        ctx.beginPath(); ctx.moveTo(lx, -H * 0.45 + 6); ctx.lineTo(lx + ph * walk * 6, 0); ctx.stroke();
      }
      ctx.fillStyle = c.c1;
      ctx.beginPath(); ctx.ellipse(0, -H * 0.55, e.r + 6, H * 0.32, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(e.r + 8, -H * 0.72, 10, 8, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-e.r, -H * 0.6); ctx.lineTo(-e.r - 14, -H * 0.95); ctx.lineTo(-e.r - 2, -H * 0.68); ctx.fill();
      ctx.fillStyle = c.eye; ctx.beginPath(); ctx.arc(e.r + 12, -H * 0.74, 2.4, 0, 7); ctx.fill();
      break;
    }
    case 'imp': {
      const flap = Math.sin(e.age * 14) * 8;
      ctx.fillStyle = c.c2;
      ctx.beginPath(); ctx.moveTo(-6, -H * 0.6); ctx.quadraticCurveTo(-30, -H * 0.9 - flap, -34, -H * 0.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6, -H * 0.6); ctx.quadraticCurveTo(30, -H * 0.9 - flap, 34, -H * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c.c1;
      ctx.beginPath(); ctx.arc(0, -H * 0.5, e.r, 0, 7); ctx.fill();
      ctx.strokeStyle = c.c1; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-5, -H * 0.78); ctx.lineTo(-8, -H * 1.0); ctx.moveTo(5, -H * 0.78); ctx.lineTo(8, -H * 1.0); ctx.stroke();
      ctx.fillStyle = c.eye; ctx.beginPath(); ctx.arc(-4, -H * 0.55, 2.6, 0, 7); ctx.arc(4, -H * 0.55, 2.6, 0, 7); ctx.fill();
      break;
    }
    case 'robe': {
      ctx.fillStyle = c.c1;
      ctx.beginPath();
      ctx.moveTo(-e.r, 0); ctx.quadraticCurveTo(0, -H * 0.2, e.r * 0.9, 0);
      ctx.lineTo(6, -H); ctx.lineTo(-6, -H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a2030';
      ctx.beginPath(); ctx.arc(0, -H * 0.88, 10, 0, 7); ctx.fill();
      ctx.fillStyle = c.eye;
      ctx.beginPath(); ctx.arc(-3, -H * 0.89, 2, 0, 7); ctx.arc(3, -H * 0.89, 2, 0, 7); ctx.fill();
      break;
    }
    case 'brute': {
      ctx.strokeStyle = c.c1; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(-12, -H * 0.3); ctx.lineTo(-14 + walk * 8, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(12, -H * 0.3); ctx.lineTo(14 - walk * 8, 0); ctx.stroke();
      ctx.fillStyle = c.c1;
      ctx.beginPath(); ctx.ellipse(0, -H * 0.62, e.r + 8, H * 0.4, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = c.c1; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(-e.r, -H * 0.75); ctx.lineTo(-e.r - 16 + Math.sin(e.age * 3) * 4, -H * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e.r, -H * 0.75); ctx.lineTo(e.r + 16 - Math.sin(e.age * 3) * 4, -H * 0.35); ctx.stroke();
      ctx.fillStyle = c.eye; ctx.beginPath(); ctx.arc(6, -H * 0.92, 3, 0, 7); ctx.fill();
      break;
    }
    case 'knight': {
      ctx.strokeStyle = c.c1; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(-10, -H * 0.3); ctx.lineTo(-12 + walk * 9, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -H * 0.3); ctx.lineTo(12 - walk * 9, 0); ctx.stroke();
      ctx.fillStyle = c.c1;
      roundRect(ctx, -16, -H * 0.78, 32, H * 0.5, 9); ctx.fill();
      ctx.fillStyle = c.c2; roundRect(ctx, -16, -H * 0.78, 32, 10, 4); ctx.fill();
      ctx.fillStyle = '#c9c9d6';
      ctx.beginPath(); ctx.arc(6, -H * 0.87, 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#5a5f74';
      ctx.fillRect(-26, -H * 0.62, 12, 34);
      ctx.fillStyle = c.c2; ctx.fillRect(-24, -H * 0.56, 8, 5);
      // 长枪
      ctx.strokeStyle = '#aab'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(10, -H * 0.5); ctx.lineTo(64, -H * 0.72); ctx.stroke();
      break;
    }
    case 'ghost': {
      const fl2 = Math.sin(e.age * 3) * 10;
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = c.c1;
      ctx.beginPath();
      ctx.moveTo(-e.r, 0);
      ctx.quadraticCurveTo(-e.r, -H * 0.6, 0, -H * 0.95);
      ctx.quadraticCurveTo(e.r, -H * 0.6, e.r, 0);
      for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(e.r - e.r * (2 * i + 1) / 4, (i % 2 ? 8 : -4) + fl2, e.r - e.r * (i + 1) / 2, 0);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.eye;
      ctx.beginPath(); ctx.arc(-6, -H * 0.72, 3.4, 0, 7); ctx.arc(6, -H * 0.72, 3.4, 0, 7); ctx.fill();
      break;
    }
    case 'tyrant': {
      // 巨型魔王
      ctx.fillStyle = '#12101c';
      ctx.beginPath();
      ctx.moveTo(-e.r - 34, -10);
      ctx.quadraticCurveTo(-e.r - 40, -H * 0.5, -18, -H * 0.82);
      ctx.lineTo(-6, -H * 0.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c.c1; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(-14, -H * 0.3); ctx.lineTo(-16 + walk * 10, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, -H * 0.3); ctx.lineTo(16 - walk * 10, 0); ctx.stroke();
      const raise = e.state === 'tele' ? Math.sin(e.t * 9) * 6 : Math.sin(e.age * 3) * 4;
      ctx.strokeStyle = c.c1;
      ctx.beginPath(); ctx.moveTo(-30, -H * 0.78); ctx.lineTo(-52, -H * 0.42 + raise); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, -H * 0.78); ctx.lineTo(52, -H * 0.42 - raise); ctx.stroke();
      ctx.fillStyle = c.c1;
      ctx.beginPath(); ctx.ellipse(0, -H * 0.68, e.r + 6, H * 0.34, 0, 0, 7); ctx.fill();
      ctx.fillStyle = c.c2;
      ctx.beginPath(); ctx.arc(0, -H * 0.95, 15, 0, 7); ctx.fill();
      // 双角
      ctx.strokeStyle = '#c9b4a0'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-10, -H * 1.02); ctx.quadraticCurveTo(-26, -H * 1.28, -14, -H * 1.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -H * 1.02); ctx.quadraticCurveTo(26, -H * 1.28, 14, -H * 1.4); ctx.stroke();
      ctx.fillStyle = c.eye;
      ctx.beginPath(); ctx.arc(-6, -H * 0.96, 3.4, 0, 7); ctx.arc(8, -H * 0.96, 3.4, 0, 7); ctx.fill();
      break;
    }
  }
  ctx.restore();

  // 精英光环
  if (def.seq) {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = c.c2; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(e.x, CONFIG.FLOOR + 4, e.r + 16, 9, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // 起手预警
  if (teleRing) {
    const k = e.t / (e.cur.tele || 0.4);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = k > 0.6 ? '#ff4444' : '#ffd23c';
    ctx.beginPath();
    ctx.moveTo(e.x, e.y - e.h - 26);
    ctx.lineTo(e.x - 7, e.y - e.h - 42);
    ctx.lineTo(e.x + 7, e.y - e.h - 42);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 受击闪白
  if (e.flash > 0) {
    ctx.globalAlpha = Math.min(0.75, e.flash * 6);
    ctx.fillStyle = '#fff';
    ctx.fillRect(e.x - e.r - 8, e.y - e.h - 8, e.r * 2 + 16, e.h + 8);
    ctx.globalAlpha = 1;
  }
  // 血条
  if (e.hp < e.maxhp && !e.boss && !e.dead) {
    const w = Math.max(46, e.r * 2.6), y0 = e.y - e.h - 18;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(e.x - w / 2, y0, w, 5);
    ctx.fillStyle = def.seq ? '#ffd23c' : '#ff5566';
    ctx.fillRect(e.x - w / 2, y0, w * UT.clamp(e.hp / e.maxhp, 0, 1), 5);
  }
}
