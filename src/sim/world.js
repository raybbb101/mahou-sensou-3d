// 戦闘シミュレーション。描画に依存しない。ソロでは自分のブラウザ、マルチでは部屋を作った人のブラウザで動く。
import { ARENA_R, SPELLS, spellDmg, spellCd, ULTS, CUT_DUR, CUT_HIT, BOSSES, MINIONS, BASE } from "./data.js";

export const TICK = 1 / 30;
const TAU = Math.PI * 2;
const rr = (a, b) => a + (b - a) * Math.random();
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

export class World {
  constructor(floor, players) {
    this.floor = floor; this.t = 0; this.ev = []; this.nid = 1;
    const B = BOSSES[floor - 1], n = players.length;
    this.B = B;
    const hpMul = 1 + .65 * (n - 1);
    this.players = players.map((sp, i) => {
      const mh = BASE.hp + 25 * sp.stats.hp;
      const a = (i - (n - 1) / 2) * .5 + Math.PI / 2;
      return {
        id: sp.id, n: sp.name, c: sp.color, x: Math.cos(a) * 85, y: Math.sin(a) * 85, f: -Math.PI / 2,
        hp: mh, mh, atk: 1 + .15 * sp.stats.atk, cdr: 1 + .1 * sp.stats.cdr, spd: BASE.spd * (1 + .1 * sp.stats.spd), ultc: 1 + .25 * sp.stats.ultc,
        slots: sp.slots.map((s) => ({ id: s.id, rank: s.rank, cd: 0, max: 1 })), ult: sp.ult, uc: sp.uc || 0,
        dashCd: 0, dashT: 0, dx: 0, dy: 0, inv: 0, down: false, mx: 0, my: 0, q: [], ca: 0, slowT: 0, haste: 0,
      };
    });
    const mh = Math.round(B.hp * hpMul);
    this.boss = { k: B.id, x: 0, y: -55, z: B.fly || 0, f: Math.PI / 2, hp: mh, mh, r: B.r, state: "intro", st: 1.6, cool: 1.2, frozen: 0, slowT: 0, phase: 1, spin: 0, dead: 0 };
    this.mins = []; this.proj = []; this.zones = []; this.later = [];
    this.cut = null; this.result = null; this.endT = 0;
    this.ultNeed = .32 * mh / Math.sqrt(n);
  }

  // ───── 入力 ─────
  input(pid, i) { const p = this.pl(pid); if (p) { const l = Math.hypot(i.mx || 0, i.my || 0); p.mx = l > 1 ? i.mx / l : i.mx || 0; p.my = l > 1 ? i.my / l : i.my || 0; } }
  act(pid, a) { const p = this.pl(pid); if (p && p.q.length < 6) p.q.push(a); }
  pl(id) { return this.players.find((p) => p.id === id); }

  enemies() { const l = this.mins.filter((m) => m.hp > 0); if (this.boss.hp > 0 && this.boss.state !== "intro" && this.boss.state !== "sleep") l.push(this.boss); return l; }
  nearest(x, y, range = 1e9, skip) {
    let best = null, bd = range;
    for (const e of this.enemies()) { if (skip && skip.has(e)) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  alive() { return this.players.filter((p) => !p.down); }

  // ───── 1 ティック ─────
  step() {
    const dt = TICK;
    if (this.result) return;
    if (this.cut) {
      this.cut.t += dt;
      if (!this.cut.hit && this.cut.t >= CUT_HIT) { this.cut.hit = 1; this.applyUlt(this.cut); }
      if (this.cut.hit) this.runLater(dt);
      if (this.cut.t >= CUT_DUR) this.cut = null;
      return;
    }
    this.t += dt;
    this.runLater(dt);
    for (const p of this.players) this.stepPlayer(p, dt);
    if (this.cut) return;
    this.stepBoss(dt);
    for (const m of this.mins) this.stepMinion(m, dt);
    this.stepProj(dt);
    this.stepZones(dt);
    this.mins = this.mins.filter((m) => m.hp > 0);
    this.checkEnd(dt);
  }
  checkEnd(dt) {
    if (this.boss.hp <= 0) {
      this.endT += dt;
      if (this.endT > 2.2) this.result = "win";
    } else if (!this.alive().length) {
      this.endT += dt;
      if (this.endT > 1.6) this.result = "lose";
    }
  }

  runLater(dt) { for (let i = this.later.length - 1; i >= 0; i--) { const l = this.later[i]; if ((l.t -= dt) <= 0) { this.later.splice(i, 1); l.fn(); } } }

  stepPlayer(p, dt) {
    if (p.down) { p.q.length = 0; return; }
    const sp = p.haste > 0 ? 2 : 1;
    p.inv = Math.max(0, p.inv - dt); p.ca = Math.max(0, p.ca - dt); p.slowT = Math.max(0, p.slowT - dt); p.haste = Math.max(0, p.haste - dt);
    p.dashCd -= dt;
    for (const s of p.slots) s.cd = Math.max(0, s.cd - dt * sp);
    while (p.q.length) {
      const a = p.q.shift();
      if (a.a === "cast") this.cast(p, a.s);
      else if (a.a === "dash") this.dash(p);
      else if (a.a === "ult") { this.ultStart(p); if (this.cut) return; }
    }
    if (p.dashT > 0) {
      p.dashT -= dt; this.move(p, p.dx * 250 * dt, p.dy * 250 * dt, 8);
    } else {
      const v = p.spd * (p.slowT > 0 ? .6 : 1) * (p.haste > 0 ? 1.35 : 1) * (p.ca > 0 ? .75 : 1);
      this.move(p, p.mx * v * dt, p.my * v * dt, 8);
      if (p.mx || p.my) { if (p.ca <= 0) p.f = Math.atan2(p.my, p.mx); }
    }
    this.bound(p, 8);
  }
  /** 位置を場の中に戻す(塔: 円形の闘技場。迷宮では壁との当たり判定に置き換える)。 */
  bound(o, pad) { const R = Math.hypot(o.x, o.y), lim = ARENA_R - pad; if (R > lim) { o.x *= lim / R; o.y *= lim / R; } }
  outside(q) { return Math.hypot(q.x, q.y) > ARENA_R + 40; }
  move(o, dx, dy, pad) { o.x += dx; o.y += dy; this.bound(o, pad); }

  dash(p) {
    if (p.dashCd > 0 || p.dashT > 0) return;
    let dx = p.mx, dy = p.my;
    if (!dx && !dy) { dx = Math.cos(p.f); dy = Math.sin(p.f); }
    const l = Math.hypot(dx, dy); p.dx = dx / l; p.dy = dy / l;
    p.dashT = .22; p.inv = Math.max(p.inv, .3); p.dashCd = 1.1;
    this.ev.push({ t: "dash", p: p.id, x: p.x, y: p.y, a: Math.atan2(p.dy, p.dx) });
  }

  // ───── 魔法 ─────
  cast(p, slot) {
    const s = p.slots[slot];
    if (!s || s.cd > 0) return;
    const S = SPELLS[s.id], dmg = spellDmg(S, s.rank) * p.atk;
    s.cd = s.max = spellCd(S, s.rank) / p.cdr;
    const tgt = this.nearest(p.x, p.y, 340);
    const a = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.f;
    if (S.kind !== "blink" && S.kind !== "heal") p.f = a;
    p.ca = .28;
    const ev = { t: "cast", s: S.id, p: p.id, x: p.x, y: p.y, a };
    this.ev.push(ev);
    const point = () => {
      let tx = tgt ? tgt.x : p.x + Math.cos(a) * 110, ty = tgt ? tgt.y : p.y + Math.sin(a) * 110;
      const d = Math.hypot(tx - p.x, ty - p.y), R = S.range || 260;
      if (d > R) { tx = p.x + (tx - p.x) * R / d; ty = p.y + (ty - p.y) * R / d; }
      return [tx, ty];
    };
    switch (S.kind) {
      case "bolt": {
        const n = S.n || 1;
        for (let i = 0; i < n; i++) {
          const aa = a + (n > 1 ? (i - (n - 1) / 2) * S.spread : 0);
          this.proj.push({ id: this.nid++, k: S.id, side: "p", owner: p.id, x: p.x + Math.cos(aa) * 8, y: p.y + Math.sin(aa) * 8, z: 9, vx: Math.cos(aa) * S.speed, vy: Math.sin(aa) * S.speed,
            r: S.r, dmg, life: 2.4, pierce: S.pierce, homing: S.homing, splash: S.splash, slow: S.slow, elem: S.elem, hit: new Set(), speed: S.speed });
        }
        break;
      }
      case "boomerang":
        this.proj.push({ id: this.nid++, k: S.id, side: "p", owner: p.id, x: p.x, y: p.y, z: 8, vx: Math.cos(a) * S.speed, vy: Math.sin(a) * S.speed, r: S.r, dmg, life: 4, pierce: 1,
          elem: S.elem, hit: new Set(), boom: S.range, went: 0, speed: S.speed });
        break;
      case "chain": {
        const pts = [[p.x, p.y, 14]], hit = new Set();
        let cur = this.nearest(p.x, p.y, S.range + 60);
        for (let i = 0; cur && i <= S.chains; i++) {
          hit.add(cur); pts.push([cur.x, cur.y, (cur.z || 0) + 10]);
          this.hurt(cur, dmg * (i ? .8 : 1), S.elem, p);
          cur = this.nearest(cur.x, cur.y, S.range, hit);
        }
        if (pts.length === 1) pts.push([p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60, 4]);
        this.ev.push({ t: "chain", pts });
        break;
      }
      case "nova":
        for (const e of this.enemies()) if (dist(e, p) < S.r + e.r) { this.hurt(e, dmg, S.elem, p); e.slowT = S.slow; }
        this.ev.push({ t: "nova", s: S.id, x: p.x, y: p.y, r: S.r });
        break;
      case "heal":
        for (const q of this.alive()) if (dist(q, p) < S.r) { q.hp = Math.min(q.mh, q.hp + q.mh * S.heal); this.ev.push({ t: "healed", p: q.id, x: q.x, y: q.y }); }
        this.ev.push({ t: "heal", x: p.x, y: p.y, r: S.r });
        break;
      case "blink": {
        let dx = p.mx, dy = p.my;
        if (!dx && !dy) { dx = Math.cos(p.f); dy = Math.sin(p.f); }
        const l = Math.hypot(dx, dy), fx = p.x, fy = p.y;
        for (let k = 0; k < 8; k++) this.move(p, dx / l * S.dist / 8, dy / l * S.dist / 8, 8);
        p.inv = Math.max(p.inv, .4);
        this.ev.push({ t: "blink", x0: fx, y0: fy, x: p.x, y: p.y });
        break;
      }
      case "ground": {
        const [tx, ty] = point();
        this.zones.push({ id: this.nid++, k: S.id, side: "p", owner: p.id, sh: "circle", x: tx, y: ty, r: S.r, delay: S.delay, t: 0, dmg, elem: S.elem, healIn: S.healIn });
        break;
      }
      case "ring":
        this.zones.push({ id: this.nid++, k: S.id, side: "p", owner: p.id, sh: "ring", x: p.x, y: p.y, r: S.r, dur: S.dur, t: 0, dmg, elem: S.elem, hit: new Set() });
        break;
      case "line":
        this.zones.push({ id: this.nid++, k: S.id, side: "p", owner: p.id, sh: "line", x: p.x, y: p.y, a, len: S.len, wid: S.wid, delay: S.delay, t: 0, dmg, elem: S.elem, slow: S.slow });
        break;
      case "storm":
        for (let i = 0; i < S.n; i++) this.later.push({ t: i * S.gap + .05, fn: () => {
          const l = this.enemies(); const e = l.length ? l[Math.floor(Math.random() * l.length)] : null;
          const x = e ? e.x + rr(-8, 8) : p.x + rr(-80, 80), y = e ? e.y + rr(-8, 8) : p.y + rr(-80, 80);
          this.strike(x, y, S.r, dmg, S.elem, p, S.id);
        } });
        break;
      case "zone": {
        const [tx, ty] = S.move ? [p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30] : point();
        this.zones.push({ id: this.nid++, k: S.id, side: "p", owner: p.id, sh: "zone", x: tx, y: ty, r: S.r, dur: S.dur, t: 0, tick: S.tick, tt: 0, dmg, elem: S.elem, pull: S.pull, move: S.move, a });
        break;
      }
    }
  }

  strike(x, y, r, dmg, elem, p, k) {
    for (const e of this.enemies()) if (Math.hypot(e.x - x, e.y - y) < r + e.r) this.hurt(e, dmg, elem, p);
    this.ev.push({ t: "strike", x, y, k });
  }

  hurt(e, dmg, elem, p) {
    if (e.hp <= 0) return;
    let mul = 1, w = 0;
    if (e === this.boss) {
      if (this.B.weak.includes(elem)) { mul = 1.5; w = 1; }
      else if (this.B.resist.includes(elem)) { mul = .5; w = -1; }
    }
    if (e.frozen > 0) mul *= 1.3;
    const crit = Math.random() < .1 + (p?.crit || 0);
    if (crit) mul *= 1.5;
    const d = dmg * mul;
    e.hp -= d;
    if (p) { p.uc = Math.min(1, p.uc + d / this.ultNeed * p.ultc); if (p.vamp && !p.down) p.hp = Math.min(p.mh, p.hp + d * p.vamp); }
    this.ev.push({ t: "hit", x: r1(e.x), y: r1(e.y), z: (e.z || 0) + (e === this.boss ? e.r * 1.6 : 12), d: Math.round(d), c: crit ? 1 : 0, w, e: elem });
    if (e.hp <= 0) {
      e.hp = 0;
      if (e === this.boss) {
        this.ev.push({ t: "bossdie", x: e.x, y: e.y });
        for (const m of this.mins) { m.hp = 0; this.ev.push({ t: "die", x: m.x, y: m.y, k: m.k }); }
        this.proj = this.proj.filter((q) => q.side === "p"); this.zones = this.zones.filter((z) => z.side === "p");
      } else this.ev.push({ t: "die", x: e.x, y: e.y, k: e.k });
    }
  }

  hurtPlayer(p, dmg) {
    if (p.down || p.inv > 0 || this.boss.hp <= 0) return;
    p.hp -= dmg; p.inv = .55;
    p.uc = Math.min(1, p.uc + dmg / 420 * p.ultc);
    this.ev.push({ t: "hurt", p: p.id, x: p.x, y: p.y, d: Math.round(dmg) });
    if (p.hp <= 0) { p.hp = 0; p.down = true; p.dashT = 0; this.ev.push({ t: "down", p: p.id, x: p.x, y: p.y }); }
  }

  // ───── 究極魔法 ─────
  ultStart(p) {
    if (!p.ult || p.uc < 1 || this.cut || !this.canUlt()) return;
    p.uc = 0;
    const b = this.ultAim(p);
    this.cut = { id: p.ult, p: p.id, t: 0, x: p.x, y: p.y, tx: b.x, ty: b.y };
    this.ev.push({ t: "ult", id: p.ult, p: p.id, x: p.x, y: p.y, tx: b.x, ty: b.y });
  }
  canUlt() { return this.boss.hp > 0 && this.boss.state !== "intro"; }
  ultTargets() { return this.enemies(); }
  ultAim(p) { return this.boss; }
  applyUlt(c) {
    const p = this.pl(c.p), atk = p ? p.atk : 1, b = this.boss;
    this.proj = this.proj.filter((q) => q.side === "p");
    this.zones = this.zones.filter((z) => z.side === "p");
    const E = () => this.ultTargets(c);
    const big = (base, pct) => { for (const e of E()) this.hurt(e, e === b ? base * atk + pct * b.mh : base * atk * 2, ULTS[c.id].elem, null); };
    switch (c.id) {
      case "sky-meteor": big(380, .15); break;
      case "absolute-zero": for (const e of E()) e.frozen = 5; big(220, .08); break;
      case "thunder-god":
        for (let i = 0; i < 12; i++) this.later.push({ t: i * .09, fn: () => {
          const l = E(); const e = l.length ? l[Math.floor(Math.random() * l.length)] : null; if (!e) return;
          this.hurt(e, e === b ? 55 * atk + .013 * b.mh : 120 * atk, "thunder", null);
          this.ev.push({ t: "strike", x: e.x + rr(-10, 10), y: e.y + rr(-10, 10), big: 1 });
        } });
        break;
      case "judgment":
        big(300, .1);
        for (const q of this.players) {
          if (q.down) { q.down = false; q.hp = q.mh * .5; this.ev.push({ t: "revive", p: q.id, x: q.x, y: q.y }); }
          else q.hp = q.mh;
          q.inv = 3;
        }
        break;
      case "void-maw":
        big(340, .13);
        for (const m of E()) if (m !== b && m.hp > 0) this.hurt(m, m.hp + 1, "shadow", null);
        break;
      case "wind-god":
        for (const q of this.alive()) q.haste = 8;
        if (p) this.zones.push({ id: this.nid++, k: "ult-tornado", side: "p", owner: p.id, sh: "zone", x: p.x, y: p.y, r: 80, dur: 8, t: 0, tick: .25, tt: 0, dmg: 22 * atk, elem: "wind", follow: p.id, pull: 30 });
        break;
    }
    // 着弾で生き残った敵が凍結していたら(絶対零度以外)解除
    if (c.id !== "absolute-zero") for (const e of this.enemies()) e.frozen = 0;
  }

  // ───── ボス ─────
  target(from) {
    const l = this.alive(); if (!l.length) return null;
    let best = l[0], bd = 1e9;
    for (const p of l) { const d = dist(p, from) + (p.id.charCodeAt(1) * 7 + Math.floor(this.t / 4) * 13) % 40; if (d < bd) { bd = d; best = p; } }
    return best;
  }
  stepBoss(dt) {
    const b = this.boss, B = this.B;
    if (b.hp <= 0) { b.dead += dt; return; }
    if (b.frozen > 0) { b.frozen -= dt; return; }
    b.slowT = Math.max(0, b.slowT - dt);
    if (b.phase === 1 && b.hp < b.mh * .5) { b.phase = 2; this.ev.push({ t: "phase", x: b.x, y: b.y }); b.cool = Math.min(b.cool, .6); }
    const T = this.target(b), sp = B.speed * (b.slowT > 0 ? .6 : 1);
    const contact = () => { for (const p of this.alive()) if (dist(p, b) < b.r + 6) this.hurtPlayer(p, 14 + this.floor * 1.5); };
    b.st -= dt;
    switch (b.state) {
      case "intro": if (b.st <= 0) b.state = "idle"; return;
      case "idle": {
        if (T) {
          const d = dist(T, b), a = Math.atan2(T.y - b.y, T.x - b.x);
          b.f += angDiff(a, b.f) * Math.min(1, dt * 5);
          const want = B.fly ? 70 : 55, dir = d > want ? 1 : d < want - 25 ? -.6 : 0;
          const side = Math.sin(this.t * .7 + this.floor) * .5;
          b.x += (Math.cos(a) * dir - Math.sin(a) * side) * sp * dt; b.y += (Math.sin(a) * dir + Math.cos(a) * side) * sp * dt;
        }
        contact();
        b.cool -= dt;
        if (b.cool <= 0 && T) this.bossAttack(b, T);
        break;
      }
      case "cast": if (b.st <= 0) b.state = "idle"; break;
      case "dashwind": if (b.st <= 0) { b.state = "dash"; b.st = b.dashDur; this.ev.push({ t: "bossdash", x: b.x, y: b.y }); } break;
      case "dash":
        b.x += Math.cos(b.f) * b.dashSp * dt; b.y += Math.sin(b.f) * b.dashSp * dt; contact();
        if (b.st <= 0) { b.state = "idle"; }
        break;
      case "leap": {
        const u = 1 - Math.max(0, b.st) / b.leapT;
        b.x = b.lx0 + (b.lx1 - b.lx0) * u; b.y = b.ly0 + (b.ly1 - b.ly0) * u; b.z = (B.fly || 0) + Math.sin(u * Math.PI) * 60;
        if (b.st <= 0) { b.z = B.fly || 0; b.state = "idle"; this.radial(b, 10, 70, 9, rr(0, TAU)); }
        break;
      }
      case "spiral":
        b.spT -= dt;
        while (b.spT <= 0) {
          b.spT += 1 / b.sp.rate; b.spin += .27;
          this.radial(b, b.sp.arms, b.sp.speed, b.sp.dmg, b.spin);
        }
        if (b.st <= 0) b.state = "idle";
        break;
    }
    this.bound(b, b.r * .6);
  }

  radial(b, n, speed, dmg, off) {
    for (let i = 0; i < n; i++) { const a = off + i / n * TAU; this.ebullet(b.x, b.y, a, speed, dmg); }
  }
  ebullet(x, y, a, speed, dmg) {
    this.proj.push({ id: this.nid++, k: "eb", side: "e", x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 10, z: 10, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 4, dmg: dmg * (1 + this.floor * .04), life: 6 });
  }
  tele(o) { this.zones.push({ id: this.nid++, side: "e", t: 0, elem: this.B.elem, ...o, dmg: o.dmg * (1 + this.floor * .04) }); }

  bossAttack(b, T) {
    const B = this.B, list = b.phase === 2 ? B.atk.concat(B.p2) : B.atk;
    let pick = list[Math.floor(Math.random() * list.length)];
    if (pick[0] === b.lastAtk && list.length > 1) pick = list[(list.indexOf(pick) + 1) % list.length];
    b.lastAtk = pick[0];
    const [kind, o] = pick, a = Math.atan2(T.y - b.y, T.x - b.x);
    b.cool = B.every * (b.phase === 2 ? .75 : 1) * rr(.85, 1.15);
    this.ev.push({ t: "bosscast", k: kind, x: b.x, y: b.y });
    switch (kind) {
      case "slam": this.tele({ sh: "circle", x: b.x, y: b.y, r: o.r, delay: o.delay, dmg: o.dmg, k: "slam" }); b.state = "cast"; b.st = o.delay; break;
      case "rain": {
        const ps = this.alive();
        for (let i = 0; i < o.n; i++) {
          const p = ps[i % ps.length], j = i < ps.length ? 6 : 50;
          this.tele({ sh: "circle", x: p.x + rr(-j, j), y: p.y + rr(-j, j), r: o.r, delay: o.delay + i * .08, dmg: o.dmg, k: "rain" });
        }
        b.state = "cast"; b.st = .5;
        break;
      }
      case "ring": this.radial(b, o.n, o.speed, o.dmg, rr(0, TAU)); b.state = "cast"; b.st = .35; break;
      case "aimed": for (let i = 0; i < o.n; i++) this.ebullet(b.x, b.y, a + (o.n > 1 ? (i / (o.n - 1) - .5) * o.spread : 0), o.speed, o.dmg); b.f = a; b.state = "cast"; b.st = .35; break;
      case "lines": {
        const off = rr(0, TAU);
        for (let i = 0; i < o.n; i++) this.tele({ sh: "line", x: b.x, y: b.y, a: off + i / o.n * TAU, len: o.len, wid: o.wid, delay: o.delay, dmg: o.dmg, k: "lines" });
        if (o.rot) for (let i = 0; i < o.n; i++) this.tele({ sh: "line", x: b.x, y: b.y, a: off + (i + .5) / o.n * TAU, len: o.len, wid: o.wid, delay: o.delay + .6, dmg: o.dmg, k: "lines" });
        b.state = "cast"; b.st = o.delay + (o.rot ? .6 : 0);
        break;
      }
      case "cone": b.f = a; this.tele({ sh: "cone", x: b.x, y: b.y, a, len: o.len, ang: o.ang, delay: o.delay, dmg: o.dmg, k: "cone" }); b.state = "cast"; b.st = o.delay + .2; break;
      case "dash": {
        b.f = a; b.dashSp = o.speed; b.dashDur = .45; b.state = "dashwind"; b.st = o.delay;
        this.tele({ sh: "line", x: b.x, y: b.y, a, len: o.speed * .45 + b.r, wid: b.r * 2, delay: o.delay, dmg: 0, k: "dashline" });
        break;
      }
      case "leap": {
        b.state = "leap"; b.leapT = o.delay; b.st = o.delay; b.lx0 = b.x; b.ly0 = b.y; b.lx1 = T.x; b.ly1 = T.y;
        this.tele({ sh: "circle", x: T.x, y: T.y, r: o.r, delay: o.delay, dmg: o.dmg, k: "slam" });
        break;
      }
      case "summon": {
        const cap = 6 + this.players.length * 2;
        for (let i = 0; i < o.n && this.mins.length < cap; i++) {
          const aa = rr(0, TAU), M = MINIONS[o.kind], mh = M.hp * (1 + this.floor * .12);
          this.mins.push({ id: this.nid++, k: o.kind, x: b.x + Math.cos(aa) * 30, y: b.y + Math.sin(aa) * 30, z: M.fly || 0, f: aa, hp: mh, mh, r: M.r, sht: rr(.5, 2), frozen: 0, slowT: 0 });
          this.ev.push({ t: "summon", x: b.x + Math.cos(aa) * 30, y: b.y + Math.sin(aa) * 30 });
        }
        b.state = "cast"; b.st = .5;
        break;
      }
      case "spiral": b.state = "spiral"; b.st = o.dur; b.sp = o; b.spT = 0; break;
    }
  }

  stepMinion(m, dt) {
    if (m.hp <= 0) return;
    if (m.frozen > 0) { m.frozen -= dt; return; }
    m.slowT = Math.max(0, m.slowT - dt);
    const M = MINIONS[m.k], T = this.target(m); if (!T) return;
    const d = dist(T, m), a = Math.atan2(T.y - m.y, T.x - m.x), sp = M.speed * (m.slowT > 0 ? .6 : 1);
    m.f = a;
    let dir = 1;
    if (M.shoot) { dir = d > 110 ? 1 : d < 80 ? -1 : 0; m.sht -= dt; if (m.sht <= 0) { m.sht = M.shoot; this.ebullet(m.x, m.y, a, 90, M.dmg); } }
    const wob = m.k === "bat" ? Math.sin(this.t * 6 + m.id) * .8 : 0;
    m.x += (Math.cos(a) * dir - Math.sin(a) * wob) * sp * dt; m.y += (Math.sin(a) * dir + Math.cos(a) * wob) * sp * dt;
    if (m.k === "bat") m.z = M.fly + Math.sin(this.t * 5 + m.id) * 3;
    if (d < m.r + 6) this.hurtPlayer(T, M.dmg * (1 + this.floor * .04));
    this.bound(m, 6);
  }

  stepProj(dt) {
    for (const q of this.proj) {
      q.life -= dt;
      if (q.side === "p") {
        if (q.homing) {
          const e = this.nearest(q.x, q.y, 260);
          if (e) { const a = Math.atan2(e.y - q.y, e.x - q.x), c = Math.atan2(q.vy, q.vx), n = c + angDiff(a, c) * Math.min(1, q.homing * dt); q.vx = Math.cos(n) * q.speed; q.vy = Math.sin(n) * q.speed; }
        }
        if (q.boom) {
          q.went += q.speed * dt;
          if (q.went > q.boom && !q.back) { q.back = 1; q.hit.clear(); }
          if (q.back) {
            const o = this.pl(q.owner);
            if (o) { const a = Math.atan2(o.y - q.y, o.x - q.x); q.vx = Math.cos(a) * q.speed; q.vy = Math.sin(a) * q.speed; if (Math.hypot(o.x - q.x, o.y - q.y) < 10) q.life = 0; }
          }
        }
        q.x += q.vx * dt; q.y += q.vy * dt;
        for (const e of this.enemies()) {
          if (q.life <= 0) break;
          if (q.hit.has(e) || Math.hypot(e.x - q.x, e.y - q.y) > e.r + q.r) continue;
          q.hit.add(e);
          if (q.splash) {
            for (const f of this.enemies()) if (Math.hypot(f.x - q.x, f.y - q.y) < q.splash + f.r) this.hurt(f, f === e ? q.dmg : q.dmg * .5, q.elem, this.pl(q.owner));
            this.ev.push({ t: "boom", k: q.k, x: q.x, y: q.y, r: q.splash });
          } else { this.hurt(e, q.dmg, q.elem, this.pl(q.owner)); this.ev.push({ t: "pop", k: q.k, x: q.x, y: q.y }); }
          if (q.slow) e.slowT = q.slow;
          if (!q.pierce) q.life = 0;
        }
      } else {
        q.x += q.vx * dt; q.y += q.vy * dt;
        for (const p of this.alive()) if (Math.hypot(p.x - q.x, p.y - q.y) < 6 + q.r) { this.hurtPlayer(p, q.dmg); q.life = 0; this.ev.push({ t: "pop", k: "eb", x: q.x, y: q.y }); break; }
      }
      if (this.outside(q)) q.life = 0;
    }
    this.proj = this.proj.filter((q) => q.life > 0);
  }

  inShape(z, x, y, pad) {
    const dx = x - z.x, dy = y - z.y;
    if (z.sh === "circle") return Math.hypot(dx, dy) < z.r + pad;
    const c = Math.cos(z.a), s = Math.sin(z.a), u = dx * c + dy * s, v = -dx * s + dy * c;
    if (z.sh === "line") return u > -pad && u < z.len + pad && Math.abs(v) < z.wid / 2 + pad;
    if (z.sh === "cone") return u > 0 && Math.hypot(dx, dy) < z.len + pad && Math.abs(Math.atan2(v, u)) < z.ang / 2;
    return false;
  }

  stepZones(dt) {
    for (const z of this.zones) {
      z.t += dt;
      if (z.side === "e") {
        if (z.t >= z.delay) {
          z.done = 1;
          if (z.dmg > 0) for (const p of this.alive()) if (this.inShape(z, p.x, p.y, 4)) this.hurtPlayer(p, z.dmg);
          this.ev.push({ t: "eboom", k: z.k, sh: z.sh, x: z.x, y: z.y, r: z.r, a: z.a, len: z.len, wid: z.wid, ang: z.ang });
        }
        continue;
      }
      const owner = this.pl(z.owner);
      if (z.sh === "circle" || z.sh === "line") {
        if (z.t >= z.delay) {
          z.done = 1;
          for (const e of this.enemies()) if (this.inShape(z, e.x, e.y, e.r)) { this.hurt(e, z.dmg, z.elem, owner); if (z.slow) e.slowT = z.slow; }
          if (z.healIn) for (const p of this.alive()) if (this.inShape(z, p.x, p.y, 0)) { p.hp = Math.min(p.mh, p.hp + p.mh * z.healIn); this.ev.push({ t: "healed", p: p.id, x: p.x, y: p.y }); }
          this.ev.push({ t: "boom", k: z.k, sh: z.sh, x: z.x, y: z.y, r: z.r, a: z.a, len: z.len, wid: z.wid });
        }
      } else if (z.sh === "ring") {
        const rad = z.r * Math.min(1, z.t / z.dur);
        for (const e of this.enemies()) { const d = Math.hypot(e.x - z.x, e.y - z.y); if (!z.hit.has(e) && d < rad + e.r && d > rad - 16 - e.r) { z.hit.add(e); this.hurt(e, z.dmg, z.elem, owner); } }
        if (z.t >= z.dur) z.done = 1;
      } else if (z.sh === "zone") {
        if (z.follow) { const f = this.pl(z.follow); if (f) { z.x = f.x; z.y = f.y; } }
        if (z.move) {
          const e = this.nearest(z.x, z.y, 300);
          const a = e ? Math.atan2(e.y - z.y, e.x - z.x) : z.a;
          z.a += angDiff(a, z.a) * Math.min(1, dt * 2);
          z.x += Math.cos(z.a) * z.move * dt; z.y += Math.sin(z.a) * z.move * dt;
        }
        if (z.pull) for (const e of this.enemies()) {
          const d = Math.hypot(e.x - z.x, e.y - z.y); if (d > z.r * 1.4 || d < 3) continue;
          const k = e === this.boss ? .25 : 1;
          e.x -= (e.x - z.x) / d * z.pull * k * dt; e.y -= (e.y - z.y) / d * z.pull * k * dt;
        }
        z.tt -= dt;
        if (z.tt <= 0) { z.tt = z.tick; for (const e of this.enemies()) if (Math.hypot(e.x - z.x, e.y - z.y) < z.r + e.r) this.hurt(e, z.dmg, z.elem, owner); }
        if (z.t >= z.dur) z.done = 1;
      }
    }
    this.zones = this.zones.filter((z) => !z.done);
  }

  // ───── 送信用 ─────
  snap() {
    const b = this.boss;
    const s = {
      t: r2(this.t), fl: this.floor,
      pl: this.players.map((p) => ({ id: p.id, n: p.n, c: p.c, x: r1(p.x), y: r1(p.y), f: r2(p.f), hp: Math.ceil(p.hp), mh: p.mh, dn: p.down ? 1 : 0, da: p.dashT > 0 ? 1 : 0, inv: p.inv > 0 ? 1 : 0, ca: p.ca > 0 ? 1 : 0,
        uc: r2(p.uc), u: p.ult, h: p.haste > 0 ? 1 : 0, dc: r1(Math.max(0, p.dashCd)), sl: p.slots.map((q) => [q.id, q.rank, r1(q.cd), r1(q.max)]) })),
      bo: { k: b.k, x: r1(b.x), y: r1(b.y), z: r1(b.z), f: r2(b.f), hp: Math.ceil(b.hp), mh: b.mh, st: b.state, fr: b.frozen > 0 ? 1 : 0, ph: b.phase, dead: r2(b.dead) },
      mi: this.mins.map((m) => [m.id, m.k, r1(m.x), r1(m.y), r1(m.z), r2(m.f), r2(m.hp / m.mh), m.frozen > 0 ? 1 : 0]),
      pr: this.proj.map((q) => [q.id, q.k, r1(q.x), r1(q.y), r1(q.z), r1(q.vx), r1(q.vy)]),
      zo: this.zones.map((z) => ({ id: z.id, k: z.k, side: z.side, sh: z.sh, x: r1(z.x), y: r1(z.y), r: z.r, a: z.a != null ? r2(z.a) : 0, len: z.len, wid: z.wid, ang: z.ang, t: r2(z.t), d: z.delay || z.dur })),
      cut: this.cut && { id: this.cut.id, p: this.cut.p, t: r2(this.cut.t), x: r1(this.cut.x), y: r1(this.cut.y), tx: r1(this.cut.tx), ty: r1(this.cut.ty) },
      ev: this.ev,
    };
    this.ev = [];
    return s;
  }
}
