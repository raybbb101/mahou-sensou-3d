// 迷宮モード: 部屋と通路のステージを自由に歩き、宝箱と武器を集め、最奥のボスを倒すとゲートが開く。
// 戦闘の仕組み(魔法・弾・ボスの技・究極魔法)は塔モードの World をそのまま受け継ぐ。
import { World, TICK } from "./world.js";
import { TILE, SPELLS, spellDmg, spellCd, DWEAPONS, RARITY, AFFIX_IDS, AFFIX, CHARS, SUMMON, MINIONS } from "./data.js";

const TAU = Math.PI * 2;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
export function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 同じ seed と stage からは、どのブラウザでも同じ迷宮ができる。 */
export function genDungeon(seed, stage) {
  const R = mulberry(seed * 31 + stage * 7919), ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const W = 46, H = 40, g = new Uint8Array(W * H), rooms = [];
  const tryRoom = (w, h) => {
    for (let k = 0; k < 400; k++) {
      const x = ri(2, W - w - 3), y = ri(2, H - h - 3);
      if (rooms.every((o) => x + w + 3 < o.x || o.x + o.w + 3 < x || y + h + 3 < o.y || o.y + o.h + 3 < y)) {
        const r = { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) }; rooms.push(r); return r;
      }
    }
    return null;
  };
  const set = (x, y) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) g[y * W + x] = 1; };
  const boss = tryRoom(15, 12); boss.boss = 1;
  const n = 6 + Math.min(3, stage >> 1);
  for (let i = 0; i < n; i++) tryRoom(ri(7, 11), ri(6, 9));
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y);
  const d2 = (a, b) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
  let start = rooms[1];
  for (const r of rooms) if (!r.boss && d2(r, boss) > d2(start, boss)) start = r;
  start.start = 1;
  const corridor = (a, b) => {
    let x = a.cx, y = a.cy;
    const step = (tx, ty) => { while (x !== tx || y !== ty) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + dy); if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); } };
    if (R() < .5) { step(b.cx, a.cy); step(b.cx, b.cy); } else { step(a.cx, b.cy); step(b.cx, b.cy); }
  };
  // 最小全域木 + ループを少し(ボス部屋へは1本だけ)
  const done = [start], rest = rooms.filter((r) => r !== start && !r.boss);
  while (rest.length) {
    let best = null, bd = 1e9;
    for (const a of done) for (const b of rest) { const d = d2(a, b); if (d < bd) { bd = d; best = [a, b]; } }
    corridor(best[0], best[1]); done.push(best[1]); rest.splice(rest.indexOf(best[1]), 1);
  }
  for (let i = 0; i < 2; i++) { const a = done[ri(0, done.length - 1)], b = done[ri(0, done.length - 1)]; if (a !== b) corridor(a, b); }
  let near = done[0];
  for (const r of done) if (d2(r, boss) < d2(near, boss)) near = r;
  corridor(near, boss);
  return { W, H, g, rooms, boss, start, R };
}

export function rollWeapon(char, stage, minR = 0, rnd = Math.random) {
  const C = CHARS[char], b = C.weapons[Math.floor(rnd() * C.weapons.length)];
  let roll = rnd() * 100 - stage * 2.5, r = roll < 3 ? 4 : roll < 12 ? 3 : roll < 32 ? 2 : roll < 62 ? 1 : 0;
  r = Math.max(r, minR);
  const ax = [...AFFIX_IDS].sort(() => rnd() - .5).slice(0, r);
  return { b, r, ax, lv: stage, name: (ax[0] ? AFFIX[ax[0]].pre : "") + DWEAPONS[b].name };
}
export const weaponPower = (w) => { const W = DWEAPONS[w.b]; return W.dmg / W.rate * RARITY[w.r].mult * (1 + .12 * (w.lv - 1)) * (1 + .1 * w.ax.length); };
export const starterWeapon = (char) => ({ b: CHARS[char].weapons[0], r: 0, ax: [], lv: 1, name: DWEAPONS[CHARS[char].weapons[0]].name });
const xpNeed = (lv) => 50 + lv * 30;
const rankFor = (lv) => Math.min(5, 1 + Math.floor((lv - 1) / 2));

export class DWorld extends World {
  constructor(stage, players, seed) {
    super(stage, players.map((p) => ({ ...p, stats: { hp: 0, atk: 0, cdr: 0, spd: 0, ultc: 0 }, slots: [] })));
    this.mode = "dungeon"; this.seed = seed;
    const M = this.M = genDungeon(seed, stage), R = M.R, T = TILE;
    const sx = (M.start.cx + .5) * T, sy = (M.start.cy + .5) * T;
    this.players.forEach((p, i) => {
      const sp = players[i], C = CHARS[sp.char];
      p.char = sp.char; p.level = sp.level || 1; p.xp = sp.xp || 0;
      p.mh = p.hp = C.hp + (p.level - 1) * 10; p.spd = C.spd; p.atk = 1 + (p.level - 1) * .06; p.ult = C.ult;
      p.slots = C.skills.map((id) => ({ id, rank: rankFor(p.level), cd: 0, max: 1 }));
      p.x = sx + (i % 2 ? 14 : -14); p.y = sy + (i < 2 ? -6 : 10); p.f = 0; p.revT = 0;
      this.applyWeapon(p, sp.weapon || starterWeapon(p.char));
    });
    const b = this.boss, br = M.boss;
    b.x = (br.cx + .5) * T; b.y = (br.cy + .5) * T; b.state = "sleep"; b.mh = b.hp = Math.round(b.mh * .7); b.f = Math.PI / 2;
    this.ultNeed = .28 * b.mh / Math.sqrt(players.length);
    this.room = { x0: br.x * T, y0: br.y * T, x1: (br.x + br.w) * T, y1: (br.y + br.h) * T };
    // 雑魚と宝箱
    const pool = stage < 2 ? ["slime", "bat"] : ["slime", "bat", "skull"], hpMul = (1 + stage * .22) * (1 + .5 * (players.length - 1));
    const rooms = M.rooms.filter((r) => !r.boss && !r.start);
    for (const r of rooms) {
      const n = 3 + Math.floor(R() * 3) + Math.floor(stage / 3);
      for (let i = 0; i < n; i++) {
        const k = pool[Math.floor(R() * pool.length)], Mi = MINIONS[k], elite = R() < .08 + stage * .02, mh = Mi.hp * hpMul * (elite ? 3 : 1);
        this.mins.push({ id: this.nid++, k, x: (r.x + 1 + R() * (r.w - 2)) * T, y: (r.y + 1 + R() * (r.h - 2)) * T, z: Mi.fly || 0, f: R() * TAU, hp: mh, mh, r: Mi.r * (elite ? 1.3 : 1), elite, sht: 1 + R() * 2, frozen: 0, slowT: 0, ag: 0 });
      }
    }
    this.chests = [...rooms].sort(() => R() - .5).slice(0, 3).map((r) => ({ id: this.nid++, x: (r.cx + .5) * T, y: (r.cy + .5) * T, open: 0 }));
    this.items = []; this.su = []; this.gate = null; this.gT = 0;
  }

  // ───── 壁 ─────
  solid(x, y) { const M = this.M, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx < 0 || ty < 0 || tx >= M.W || ty >= M.H || !M.g[ty * M.W + tx]; }
  blocked(x, y, pad) { const p = pad * .8; return this.solid(x - p, y - p) || this.solid(x + p, y - p) || this.solid(x - p, y + p) || this.solid(x + p, y + p); }
  move(o, dx, dy, pad) {
    if (!this.blocked(o.x + dx, o.y, pad)) o.x += dx;
    if (!this.blocked(o.x, o.y + dy, pad)) o.y += dy;
  }
  bound(o, pad) {
    if (o === this.boss) { const R = this.room; o.x = Math.max(R.x0 + pad, Math.min(R.x1 - pad, o.x)); o.y = Math.max(R.y0 + pad, Math.min(R.y1 - pad, o.y)); }
  }
  outside(q) { return this.solid(q.x, q.y); }

  applyWeapon(p, w) {
    const W = DWEAPONS[w.b], m = RARITY[w.r].mult * (1 + .12 * (w.lv - 1)), has = (a) => w.ax.includes(a);
    p.weapon = w; p.wname = w.name;
    p.wdmg = W.dmg * m * (has("burn") ? 1.2 : 1); p.wrate = W.rate * (has("swift") ? .82 : 1); p.wpow = m;
    p.crit = has("crit") ? .15 : 0; p.vamp = has("vamp") ? .05 : 0; p.frost = has("frost") ? 1.5 : 0;
  }

  // ───── 攻撃(通常攻撃は武器から、召喚は使い魔を呼ぶ) ─────
  cast(p, slot) {
    const s = p.slots[slot];
    if (!s || s.cd > 0) return;
    const S = SPELLS[s.id];
    if (S.kind !== "melee" && S.kind !== "wbolt" && S.kind !== "summon") return super.cast(p, slot);
    const W = DWEAPONS[p.weapon.b];
    s.cd = s.max = slot === 0 ? p.wrate : spellCd(S, s.rank) / p.cdr;
    const tgt = this.nearest(p.x, p.y, 220), a = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.f;
    p.ca = .22;
    if (S.kind === "melee") {
      p.f = a;
      const dmg = p.wdmg * p.atk;
      for (const e of this.enemies()) {
        const d = Math.hypot(e.x - p.x, e.y - p.y); if (d > W.range + e.r) continue;
        let da = Math.atan2(e.y - p.y, e.x - p.x) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > W.arc / 2 && d > e.r + 4) continue;
        this.hurt(e, dmg, "wind", p);
        if (p.frost) e.slowT = p.frost;
        if (e !== this.boss && e.hp > 0) this.move(e, Math.cos(a) * 6, Math.sin(a) * 6, 6);
      }
      this.ev.push({ t: "slash", p: p.id, x: p.x, y: p.y, a, r: W.range, arc: W.arc, w: p.weapon.b });
    } else if (S.kind === "wbolt") {
      p.f = a;
      this.proj.push({ id: this.nid++, k: W.proj, side: "p", owner: p.id, x: p.x + Math.cos(a) * 6, y: p.y + Math.sin(a) * 6, z: 9, vx: Math.cos(a) * W.speed, vy: Math.sin(a) * W.speed,
        r: 4, dmg: p.wdmg * p.atk, life: 1.6, homing: W.homing, slow: p.frost, elem: S.elem, hit: new Set(), speed: W.speed });
      this.ev.push({ t: "cast", s: S.id, p: p.id, x: p.x, y: p.y, a });
    } else {
      const U = SUMMON[S.su], n = S.n || 1, dmg = spellDmg(S, s.rank) * p.atk * p.wpow;
      for (let i = 0; i < n; i++) {
        const mine = this.su.filter((u) => u.owner === p.id && u.k === S.su);
        if (mine.length >= U.cap) mine[0].life = 0, this.su.splice(this.su.indexOf(mine[0]), 1);
        const aa = a + (i - (n - 1) / 2) * 1.6;
        const u = { id: this.nid++, k: S.su, owner: p.id, x: p.x + Math.cos(aa) * 14, y: p.y + Math.sin(aa) * 14, z: S.su === "golem" ? 0 : 12, f: a, life: U.life, dmg, atkT: .3, ang: aa };
        if (S.su === "golem" && this.blocked(u.x, u.y, 8)) { u.x = p.x; u.y = p.y; }
        this.su.push(u);
        this.ev.push({ t: "summon", x: u.x, y: u.y, p: 1 });
      }
      this.ev.push({ t: "cast", s: S.id, p: p.id, x: p.x, y: p.y, a });
    }
  }

  stepSummons(dt) {
    for (const u of this.su) {
      u.life -= dt; u.atkT -= dt;
      const o = this.pl(u.owner); if (!o) { u.life = 0; continue; }
      const U = SUMMON[u.k];
      if (u.k === "wisp") {
        u.ang += dt * 2.6; u.x = o.x + Math.cos(u.ang) * 20; u.y = o.y + Math.sin(u.ang) * 20; u.z = 16 + Math.sin(u.ang * 2) * 3; u.f = u.ang + Math.PI / 2;
        if (u.atkT <= 0) {
          const e = this.nearest(u.x, u.y, 170);
          if (e) { const a = Math.atan2(e.y - u.y, e.x - u.x); this.proj.push({ id: this.nid++, k: "magic-bolt", side: "p", owner: o.id, x: u.x, y: u.y, z: u.z, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, r: 4, dmg: u.dmg, life: 1.2, elem: "holy", hit: new Set(), speed: 250 }); }
          u.atkT = U.atk;
        }
        continue;
      }
      const e = this.nearest(u.x, u.y, u.k === "golem" ? 220 : 180);
      const tx = e ? e.x : o.x + Math.cos(u.ang) * 18, ty = e ? e.y : o.y + Math.sin(u.ang) * 18, d = Math.hypot(tx - u.x, ty - u.y), a = Math.atan2(ty - u.y, tx - u.x);
      const reach = e ? e.r + (u.k === "golem" ? 12 : 4) : 6;
      if (d > reach) this.move(u, Math.cos(a) * U.speed * dt, Math.sin(a) * U.speed * dt, 5);
      u.f = a;
      if (u.k === "bat") u.z = 10 + Math.sin(this.t * 9 + u.id) * 3;
      if (e && d <= reach + 2 && u.atkT <= 0) {
        u.atkT = U.atk;
        if (u.k === "golem") { for (const f of this.enemies()) if (Math.hypot(f.x - u.x, f.y - u.y) < U.r + f.r) this.hurt(f, u.dmg, "fire", o); this.ev.push({ t: "gslam", x: u.x, y: u.y }); }
        else this.hurt(e, u.dmg, "shadow", o);
      }
    }
    this.su = this.su.filter((u) => u.life > 0);
  }

  // ───── 敵 ─────
  stepBoss(dt) {
    const b = this.boss;
    if (b.state === "sleep") {
      const R = this.room;
      if (this.alive().some((p) => p.x > R.x0 + 8 && p.x < R.x1 - 8 && p.y > R.y0 + 8 && p.y < R.y1 - 8)) { b.state = "intro"; b.st = 1.4; this.ev.push({ t: "bosswake", x: b.x, y: b.y }); }
      return;
    }
    super.stepBoss(dt);
  }
  stepMinion(m, dt) {
    if (m.hp <= 0) return;
    if (m.frozen > 0) { m.frozen -= dt; return; }
    m.slowT = Math.max(0, m.slowT - dt);
    const M = MINIONS[m.k], T = this.target(m); if (!T) return;
    const d = Math.hypot(T.x - m.x, T.y - m.y);
    if (!m.ag) { if (d < 120) { m.ag = 1; this.ev.push({ t: "aggro", x: m.x, y: m.y }); } else return; }
    if (d > 320) { m.ag = 0; return; }
    const a = Math.atan2(T.y - m.y, T.x - m.x), sp = M.speed * (m.slowT > 0 ? .6 : 1);
    m.f = a;
    let dir = 1;
    if (M.shoot) { dir = d > 100 ? 1 : d < 70 ? -1 : 0; m.sht -= dt; if (m.sht <= 0) { m.sht = M.shoot; this.ebullet(m.x, m.y, a, 95, M.dmg * (1 + this.floor * .08)); } }
    const wob = m.k === "bat" ? Math.sin(this.t * 6 + m.id) * .8 : 0;
    this.move(m, (Math.cos(a) * dir - Math.sin(a) * wob) * sp * dt, (Math.sin(a) * dir + Math.cos(a) * wob) * sp * dt, m.r);
    if (m.k === "bat") m.z = M.fly + Math.sin(this.t * 5 + m.id) * 3;
    if (d < m.r + 6) this.hurtPlayer(T, M.dmg * (1 + this.floor * .08) * (m.elite ? 1.5 : 1));
  }
  hurtPlayer(p, dmg) {
    if (p.down || p.inv > 0) return;
    // 塔モードと違い、ボスが倒れていても雑魚の攻撃は当たる
    const hp = this.boss.hp; if (hp <= 0) this.boss.hp = 1;
    super.hurtPlayer(p, dmg);
    this.boss.hp = hp;
  }
  hurt(e, dmg, elem, p) {
    const was = e.hp > 0;
    super.hurt(e, dmg, elem, p);
    if (was && e.hp <= 0) this.killed(e);
  }
  killed(e) {
    const boss = e === this.boss, xp = boss ? 90 + this.floor * 25 : (e.elite ? 24 : 8) * (1 + this.floor * .12);
    for (const p of this.players) this.addXp(p, xp);
    if (boss) return;
    if (Math.random() < (e.elite ? .5 : .12)) this.drop("pot", e.x, e.y);
    if (e.elite && Math.random() < .4) { const p = this.players[Math.floor(Math.random() * this.players.length)]; this.drop("w", e.x, e.y, rollWeapon(p.char, this.floor, 1)); }
  }
  addXp(p, n) {
    p.xp += n;
    while (p.xp >= xpNeed(p.level)) {
      p.xp -= xpNeed(p.level); p.level++;
      p.mh += 10; if (!p.down) p.hp = Math.min(p.mh, p.hp + 10 + p.mh * .25); p.atk += .06;
      for (const s of p.slots) s.rank = rankFor(p.level);
      this.ev.push({ t: "lvup", p: p.id, lv: p.level, x: p.x, y: p.y });
    }
  }
  drop(k, x, y, w) {
    const a = Math.random() * TAU, d = 6 + Math.random() * 8;
    const it = { id: this.nid++, k, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, w, age: 0 };
    if (this.blocked(it.x, it.y, 4)) { it.x = x; it.y = y; }
    this.items.push(it);
  }

  // 究極魔法は近くの敵だけを巻き込む(迷宮全体には届かない)
  canUlt() { return !this.result && !!this.nearest(0, 0, 1e9); }
  ultAim(p) { return this.nearest(p.x, p.y, 260) || p; }
  ultTargets(c) { return this.enemies().filter((e) => Math.hypot(e.x - c.tx, e.y - c.ty) < 230 || Math.hypot(e.x - c.x, e.y - c.y) < 200); }

  // ───── 1 ティック ─────
  step() {
    super.step();
    if (this.cut || this.result) return;
    const dt = TICK;
    this.stepSummons(dt);
    for (const c of this.chests) {
      if (c.open) continue;
      const p = this.alive().find((q) => Math.hypot(q.x - c.x, q.y - c.y) < 16);
      if (!p) continue;
      c.open = 1;
      this.ev.push({ t: "chest", x: c.x, y: c.y });
      this.drop("w", c.x, c.y, rollWeapon(p.char, this.floor, this.floor > 5 ? 1 : 0));
      if (Math.random() < .6) this.drop("pot", c.x, c.y);
    }
    for (const it of this.items) {
      it.age += dt;
      if (it.age < .5) continue;
      for (const p of this.alive()) {
        if (Math.hypot(p.x - it.x, p.y - it.y) > 11) continue;
        if (it.k === "pot") {
          if (p.hp >= p.mh) continue;
          p.hp = Math.min(p.mh, p.hp + p.mh * .35); it.gone = 1;
          this.ev.push({ t: "healed", p: p.id, x: p.x, y: p.y }); this.ev.push({ t: "pickup", p: p.id, pot: 1 });
          break;
        }
        if (!CHARS[p.char].weapons.includes(it.w.b)) continue;
        const better = weaponPower(it.w) > weaponPower(p.weapon);
        if (better) this.applyWeapon(p, it.w); else this.addXp(p, 15 + it.w.r * 15);
        this.ev.push({ t: "pickup", p: p.id, name: it.w.name, r: it.w.r, eq: better ? 1 : 0 });
        it.gone = 1;
        break;
      }
    }
    this.items = this.items.filter((i) => !i.gone);
    // 倒れた仲間のそばに立つと起こせる
    for (const p of this.players) {
      if (!p.down) continue;
      const helper = this.alive().some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 20);
      p.revT = helper ? p.revT + dt : 0;
      if (p.revT > 2) { p.down = false; p.hp = p.mh * .4; p.inv = 1.5; p.revT = 0; this.ev.push({ t: "revive", p: p.id, x: p.x, y: p.y }); }
    }
  }
  checkEnd(dt) {
    const b = this.boss;
    if (!this.alive().length) { this.endT += dt; if (this.endT > 1.6) this.result = "lose"; return; }
    if (b.hp > 0) return;
    if (!this.gate) {
      this.endT += dt;
      if (this.endT > 1.6) {
        this.gate = { x: b.x, y: b.y };
        this.ev.push({ t: "gate", x: b.x, y: b.y });
        for (const p of this.players) this.drop("w", b.x, b.y, rollWeapon(p.char, this.floor, 2));
      }
      return;
    }
    const all = this.alive().every((p) => Math.hypot(p.x - this.gate.x, p.y - this.gate.y) < 20);
    this.gT = all ? this.gT + dt : 0;
    if (this.gT > .6) this.result = "next";
  }

  snap() {
    const s = super.snap();
    s.mode = "d"; s.seed = this.seed;
    s.pl.forEach((q, i) => { const p = this.players[i]; q.ch = p.char; q.lv = p.level; q.xp = r2(p.xp / xpNeed(p.level)); q.wn = p.wname; q.wr = p.weapon.r; q.rv = r2(p.revT / 2); });
    s.mi.forEach((m, i) => { const e = this.mins[i]; if (e?.elite) m.push(1); });
    s.su = this.su.map((u) => [u.id, u.k, r1(u.x), r1(u.y), r1(u.z), r2(u.f)]);
    s.ch = this.chests.map((c) => [c.id, c.x, c.y, c.open]);
    s.it = this.items.map((i) => [i.id, i.k, r1(i.x), r1(i.y), i.w ? i.w.b : "", i.w ? i.w.r : 0]);
    s.gate = this.gate && [this.gate.x, this.gate.y, r2(this.gT)];
    return s;
  }
}
