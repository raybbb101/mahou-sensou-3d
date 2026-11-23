// 3D ドット絵の描画。床は 1 枚の上面テクスチャを傾けて重ね(厚みも重ねで出す)、キャラと魔法はスプライトスタック。
// 角度ごとのスプライトはキャッシュするので、毎フレームの仕事は drawImage が中心(スマホでも軽い)。
import { Stacker, TAU, addRamp, hash3, vnoise, hex } from "./voxel.js";
import { model, BOSS_MODEL, MINION_MODEL, PROJ_MODEL, CHAR_MODEL } from "./models.js";
import { genDungeon } from "../sim/dungeon.js";
import { Particles, drawParticle, puff, glowSprite, shadow, ringTex, circleTex, RAMPS, ELEM_RAMP } from "./fx.js";
import { ARENA_R, THEMES, BOSSES, SPELLS, ULTS, ELEMENTS, CUT_DUR, CUT_HIT, TILE, RARITY } from "../sim/data.js";
import { Sfx } from "./audio.js";

/** 時計(テストでは仮想時間に差し替える) */
export const clock = { now: () => performance.now() };
export const BASE_YAW = Math.PI - .35, PITCH = .76;
const RP = ARENA_R + 18, VH = 216;
const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpA = (a, b, t) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; };
const rr = (a, b) => a + (b - a) * Math.random();
const ELEM_COL = { fire: "#ff8a3a", ice: "#8fd0ff", thunder: "#fff27a", holy: "#ffe88a", shadow: "#a060e0", wind: "#7ae09a" };

export class View {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext("2d");
    this.wc = mk(320, VH); this.g = this.wc.getContext("2d");
    this.st = new Stacker(PITCH); this.sq = Math.sin(PITCH); this.cf = Math.cos(PITCH);
    this.fx = new Particles(); this.decals = []; this.bolts = []; this.props = []; this.glows = [];
    this.baseYaw = BASE_YAW; this.yaw = BASE_YAW; this.spin = 0;
    this.cam = { x: 0, y: 20 }; this.zoom = 1; this.shake = 0; this.flash = 0; this.flashCol = "#ffffff";
    this.selfId = null; this.prev = null; this.cur = null; this.tSnap = 0; this.interval = 33;
    this.sfx = new Sfx(); this.onEvent = () => {}; this.cut = null; this.last = clock.now();
    this.theme = null; this.motes = [];
    this.resize();
  }

  resize() {
    const ar = innerWidth / innerHeight;
    this.H = VH; this.W = Math.max(240, Math.min(470, Math.round(VH * ar)));
    for (const c of [this.cv, this.wc]) { c.width = this.W; c.height = this.H; }
    this.ctx.imageSmoothingEnabled = false; this.g.imageSmoothingEnabled = false;
    this.cv.style.width = innerWidth + "px"; this.cv.style.height = innerHeight + "px";
    if (this.theme) this.buildBg();
  }

  // ───── 床と背景 ─────
  setTheme(key) {
    this.mode = "arena"; this.M = null;
    if (this.themeKey === key && !this.wasDungeon) return;
    this.wasDungeon = false;
    this.themeKey = key; this.theme = THEMES[key];
    const T = this.theme;
    addRamp("th_" + key, T.floor);
    this.pillarM = model("pillar", "th_" + key);
    this.buildFloorTex(); this.buildBg(); this.floorYaw = null;
    this.motes = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), s: rr(.2, 1), p: Math.random() * TAU }));
    this.decals = []; this.props = []; this.fx.l.length = 0; this.bolts = [];
  }
  buildBg() {
    const T = this.theme, c = mk(this.W, this.H), g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, this.H);
    gr.addColorStop(0, T.bg[0]); gr.addColorStop(1, T.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, this.W, this.H);
    // 遠くの星と柱の影(視差なしの飾り)
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${(hash3(i, 1, 2) * .35).toFixed(2)})`; g.fillRect(Math.floor(hash3(i, 2, 3) * this.W), Math.floor(hash3(i, 4, 5) * this.H * .5), 1, 1); }
    this.bg = c;
  }
  buildFloorTex() {
    const T = this.theme, S = RP * 2, c = mk(S, S), g = c.getContext("2d"), id = g.createImageData(S, S), d = id.data;
    const F = T.floor.map(hex), acc = hex(T.accent), rune = hex(T.rune), seed = this.themeKey.length * 7;
    const glowGrout = ["lava", "ember", "machine", "apex"].includes(this.themeKey);
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const X = i - RP + .5, Y = j - RP + .5, r = Math.hypot(X, Y);
      if (r > RP - .5) continue;
      const a = Math.atan2(Y, X);
      let col;
      if (r > ARENA_R + 4) {
        const sf = (a + Math.PI) / TAU * 56, seg = Math.floor(sf), gap = sf - seg < .07 || r < ARENA_R + 5.3;
        let k = r > RP - 2.2 ? 3 : 2; if (hash3(seg, 9, seed) > .7) k--; if (gap) k = 0;
        col = F[k];
      } else if (r < 14) {
        const star = Math.abs(Math.sin(a * 4)) * 10 > r - 3 && r > 4;
        col = Math.abs(r - 13) < .7 || star ? mix(F[1], rune, .55) : F[r < 4 ? 3 : 2];
      } else {
        const ring = Math.floor((r - 14) / 15), r0 = 14 + ring * 15, segs = Math.max(6, Math.round(TAU * (r0 + 7.5) / 19));
        const sf = (a + Math.PI) / TAU * segs + ring * .5, seg = Math.floor(sf), along = (sf - seg) * TAU * (r0 + 7.5) / segs;
        const grout = r - r0 < 1.1 || along < 1.1;
        if (grout) col = glowGrout && vnoise(X * .1, Y * .1, 0, seed) > .48 ? mix(F[0], acc, .65) : F[0];
        else {
          const tv = hash3(ring, seg, seed), n = vnoise(X * .12, Y * .12, 1, seed);
          let k = 1 + (tv > .5 ? 1 : 0) + (n > .62 ? 1 : 0);
          if (r - r0 < 2.6 || along < 2.6) k = Math.min(3, k + 1);
          if (hash3(i, j, 2) > .965) k = Math.max(0, k - 1);
          col = F[k];
          if (this.themeKey === "moss" && vnoise(X * .07, Y * .07, 5, 1) > .6) col = mix(col, [60, 120, 50], .55);
          if (this.themeKey === "flood" && vnoise(X * .06, Y * .06, 5, 2) > .64) col = mix(col, acc, .3);
          if (this.themeKey === "ice" && hash3(i, j, 7) > .985) col = [230, 248, 255];
          if (this.themeKey === "crypt" && hash3(i, j, 8) > .992) col = [200, 190, 170];
        }
        // 彫り込まれたルーンの輪
        if (Math.abs(r - 70) < .8 || Math.abs(r - 79) < .8 || (r > 71.5 && r < 77.5 && ((a / TAU * 40 + 40) % 1) < .13)) col = mix(F[1], rune, .6);
      }
      const p = (j * S + i) * 4; d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    this.floorTex = c;
    const side = (k, m) => { const s = mk(S, S), sg = s.getContext("2d"), cc = F[k].map((v) => Math.round(v * m)); sg.fillStyle = `rgb(${cc})`; sg.beginPath(); sg.arc(RP, RP, RP - .5, 0, TAU); sg.fill(); return s; };
    this.side1 = side(1, .85); this.side2 = side(0, .8);
  }
  renderFloorCache() {
    const { sq, cf } = this, FW = RP * 2 + 8, FH = Math.ceil(RP * 2 * sq + 20 * cf) + 8;
    if (!this.fc) { this.fc = mk(FW, FH); this.fcg = this.fc.getContext("2d"); }
    const g = this.fcg, ca = Math.cos(this.yaw), sa = Math.sin(this.yaw), ox = FW / 2, oy = RP * sq + 4;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, FW, FH); g.imageSmoothingEnabled = false;
    for (let z = 16; z >= 1; z--) { g.setTransform(ca, sa * sq, sa, -ca * sq, ox, oy + z * cf); g.drawImage(z > 4 ? this.side2 : this.side1, -RP, -RP); }
    g.setTransform(ca, sa * sq, sa, -ca * sq, ox, oy); g.drawImage(this.floorTex, -RP, -RP);
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.fox = ox; this.foy = oy; this.floorYaw = this.yaw;
  }

  // ───── 迷宮 ─────
  setDungeon(seed, stage) {
    const key = BOSSES[stage - 1].theme;
    this.themeKey = null; this.setTheme(key); this.mode = "dungeon"; this.wasDungeon = true;
    const M = this.M = genDungeon(seed, stage), T = this.theme, F = T.floor.map(hex), acc = hex(T.accent);
    addRamp("th_" + key + "w", T.floor.map((c, i) => T.floor[Math.min(3, i + 1)]));
    this.wallM = model("wall", "th_" + key + "w");
    const S = TILE, w = M.W * S, h = M.H * S, c = mk(w, h), g = c.getContext("2d"), id = g.createImageData(w, h), d = id.data;
    const fl = (x, y) => x >= 0 && y >= 0 && x < M.W && y < M.H && M.g[y * M.W + x];
    for (let ty = 0; ty < M.H; ty++) for (let tx = 0; tx < M.W; tx++) {
      if (!fl(tx, ty)) continue;
      const tv = hash3(tx, ty, 3), big = (tx + ty) % 2;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const X = tx * S + i, Y = ty * S + j, grout = i === 0 || j === 0 || (i === 8 && j < 8) || (j === 8 && i >= 8 && big);
        let k = 1 + (tv > .5 ? 1 : 0) + (vnoise(X * .1, Y * .1, 1, 4) > .64 ? 1 : 0);
        if (i < 2 || j < 2) k = Math.min(3, k + 1);
        if (hash3(X, Y, 2) > .965) k = Math.max(0, k - 1);
        let col = grout ? F[0] : F[k];
        if (!grout && this.themeKey === "moss" && vnoise(X * .06, Y * .06, 5, 1) > .62) col = [col[0] * .6 + 24, col[1] * .6 + 48, col[2] * .6 + 20];
        if (grout && ["lava", "ember", "machine", "apex"].includes(this.themeKey) && vnoise(X * .08, Y * .08, 0, 7) > .55) col = acc;
        // 壁ぎわは影
        const shade = (!fl(tx, ty - 1) && j < 5) || (!fl(tx - 1, ty) && i < 3) ? .62 : 1;
        const p = (Y * w + X) * 4, sh = shade * .78; d[p] = col[0] * sh; d[p + 1] = col[1] * sh; d[p + 2] = col[2] * sh; d[p + 3] = 255;
      }
    }
    // スタートとボス部屋の床に魔法陣を刻む
    g.putImageData(id, 0, 0);
    for (const r of [M.start, M.boss]) { const tex = circleTex("holy", Math.min(r.w, r.h) * S * .36); g.globalAlpha = .28; g.drawImage(tex, (r.cx + .5) * S - tex.width / 2, (r.cy + .5) * S - tex.height / 2); g.globalAlpha = 1; }
    this.dfloor = c;
    this.walls = []; this.torches = [];
    for (let ty = 0; ty < M.H; ty++) for (let tx = 0; tx < M.W; tx++) {
      if (fl(tx, ty)) continue;
      let near = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (fl(tx + dx, ty + dy)) near = true;
      if (!near) continue;
      this.walls.push([(tx + .5) * S, (ty + .5) * S]);
      if (fl(tx, ty + 1) && !fl(tx, ty - 1) && hash3(tx, ty, 9) < .2) this.torches.push([(tx + .5) * S, (ty + 1) * S + 1, hash3(tx, ty, 4) * 6]);
    }
    this.seen = new Uint8Array(M.W * M.H);
    this.yaw = this.baseYaw = Math.PI - .5; // 斜めから見下ろして壁の側面も見せる
  }

  // ───── 投影 ─────
  setCam() {
    this.ca = Math.cos(this.yaw); this.sa = Math.sin(this.yaw);
    const s = this.shake;
    this.ox = this.W / 2 + (s ? Math.round(rr(-s, s)) : 0); this.oy = this.H * .56 + (s ? Math.round(rr(-s, s)) : 0);
  }
  proj(X, Y, Z = 0) {
    const dx = X - this.cam.x, dy = Y - this.cam.y, u = dx * this.ca + dy * this.sa, v = -dx * this.sa + dy * this.ca;
    return [this.ox + u, this.oy - v * this.sq - Z * this.cf, v];
  }
  floorT(g) {
    const [e, f] = this.proj(0, 0, 0);
    g.setTransform(this.ca, this.sa * this.sq, this.sa, -this.ca * this.sq, e, f);
  }
  /** 画面上の方向(右, 下) → 世界の方向 */
  screenToWorldDir(jx, jy) {
    const ca = Math.cos(this.baseYaw), sa = Math.sin(this.baseYaw);
    return [jx * ca + jy * sa, jx * sa - jy * ca];
  }

  // ───── スナップショット ─────
  push(s) {
    const now = clock.now();
    if (this.cur) { const iv = now - this.tSnap; if (iv > 5 && iv < 400) this.interval = this.interval * .8 + iv * .2; }
    this.prev = this.cur || s; this.cur = s; this.tSnap = now;
    if (s.cut && !this.cut) this.startCut(s.cut, now);
    for (const ev of s.ev || []) this.event(ev, s);
  }
  reset() { this.prev = this.cur = null; this.cut = null; this.decals = []; this.props = []; this.bolts = []; this.fx.l.length = 0; this.zoom = 1; this.flash = 0; }

  interp() {
    const P = this.prev, C = this.cur; if (!C) return null;
    const a = Math.min(1.25, (clock.now() - this.tSnap) / this.interval), frozen = !!C.cut;
    const k = frozen ? 1 : Math.min(1, a);
    const byId = (l, id) => l && l.find((o) => o.id === id);
    const pl = C.pl.map((p) => { const q = byId(P.pl, p.id) || p; return { ...p, x: lerp(q.x, p.x, k), y: lerp(q.y, p.y, k), f: lerpA(q.f, p.f, k), mv: Math.hypot(p.x - q.x, p.y - q.y) > .3 }; });
    const bo = C.bo && P.bo ? { ...C.bo, x: lerp(P.bo.x, C.bo.x, k), y: lerp(P.bo.y, C.bo.y, k), z: lerp(P.bo.z, C.bo.z, k), f: lerpA(P.bo.f, C.bo.f, k) } : C.bo;
    const pm = new Map((P.mi || []).map((m) => [m[0], m]));
    const mi = (C.mi || []).map((m) => { const q = pm.get(m[0]) || m; return { id: m[0], k: m[1], x: lerp(q[2], m[2], k), y: lerp(q[3], m[3], k), z: lerp(q[4], m[4], k), f: lerpA(q[5], m[5], k), hp: m[6], fr: m[7], el: m[8] }; });
    const dtE = frozen ? 0 : (a - 1) * this.interval / 1000;
    const pr = (C.pr || []).map((q) => ({ id: q[0], k: q[1], x: q[2] + q[5] * dtE, y: q[3] + q[6] * dtE, z: q[4], vx: q[5], vy: q[6] }));
    const zt = frozen ? 0 : Math.max(0, a - 1) * this.interval / 1000;
    const zo = (C.zo || []).map((z) => ({ ...z, t: z.t + zt }));
    const ps = new Map((P.su || []).map((u) => [u[0], u]));
    const su = (C.su || []).map((u) => { const q = ps.get(u[0]) || u; return { id: u[0], k: u[1], x: lerp(q[2], u[2], k), y: lerp(q[3], u[3], k), z: lerp(q[4], u[4], k), f: lerpA(q[5], u[5], k) }; });
    return { pl, bo, mi, pr, zo, su, it: C.it || [], ch: C.ch || [], gate: C.gate };
  }

  // ───── イベント → 見た目と音 ─────
  event(e, s) {
    const fx = this.fx, me = e.p === this.selfId;
    switch (e.t) {
      case "cast": {
        const S = SPELLS[e.s], R = ELEM_RAMP[S.elem];
        fx.burst(6, e.x + Math.cos(e.a) * 6, e.y + Math.sin(e.a) * 6, 14, { t: "glint", ramp: R, sp: 30, life: .4, up: .2 });
        this.sfx.play("cast-" + S.elem);
        if (S.kind === "nova") { if (S.elem === "ice") this.nova(e.x, e.y, S.r, "ice"); else { this.decal({ k: "ring", x: e.x, y: e.y, r0: 6, r1: S.r, life: .25, color: "#d8fce0" }); fx.burst(18, e.x, e.y, 8, { t: "glint", ramp: "wind", sp: 130, up: 0, spread: .2, life: .35 }); } }
        break;
      }
      case "nova": break;
      case "hit": {
        const col = e.c ? "#ffe14a" : e.w > 0 ? "#ff9a3c" : e.w < 0 ? "#8a8aa0" : "#ffffff";
        fx.add({ t: "text", text: e.d + (e.c ? "!" : ""), color: col, x: e.x, y: e.y, z: e.z, life: .8 });
        fx.burst(4, e.x, e.y, e.z * .6, { t: "spark", ramp: ELEM_RAMP[e.e] || "fire", sp: 70, life: .25, g: 60 });
        this.sfx.play("hit-boss");
        break;
      }
      case "boom": this.boom(e); break;
      case "pop": {
        const R = e.k === "eb" ? this.enemyRamp() : ELEM_RAMP[SPELLS[e.k]?.elem] || "fire";
        fx.burst(5, e.x, e.y, 9, { t: "spark", ramp: R, sp: 60, life: .22 });
        this.glow(e.x, e.y, 9, 16, RAMPS[R][7], .5, .12);
        break;
      }
      case "chain": {
        for (let i = 1; i < e.pts.length; i++) this.bolt(e.pts[i - 1], e.pts[i], .2, 1);
        for (const p of e.pts.slice(1)) this.glow(p[0], p[1], p[2], 22, "#fff27a", .8, .2);
        this.sfx.play("thunder");
        break;
      }
      case "strike":
        if (e.k === "arrow-rain") { this.bolts.push({ pts: [[e.x - 10, e.y - 6, 150], [e.x, e.y, 0]], age: 0, life: .12, w: 0, col: "#e8d8b0" }); fx.burst(5, e.x, e.y, 1, { t: "chip", ramp: "smoke", sp: 40, life: .5, g: 200, up: .9 }); this.decal({ k: "ring", x: e.x, y: e.y, r0: 2, r1: 14, life: .2, color: "#e8d8b0" }); this.sfx.play("hit-wind"); }
        else this.strike(e.x, e.y, e.big);
        break;
      case "heal": this.decal({ k: "circle", elem: "holy", x: e.x, y: e.y, r: e.r * .5, life: .9 }); fx.burst(20, e.x, e.y, 2, { t: "glint", ramp: "holy", sp: 30, up: 1.2, spread: .2, life: 1, jit: 40, g: -10 }); this.sfx.play("heal"); break;
      case "healed": fx.burst(8, e.x, e.y, 6, { t: "glint", ramp: "wind", sp: 20, up: 1.3, spread: .2, life: .9, jit: 10 }); break;
      case "blink":
        for (const [x, y] of [[e.x0, e.y0], [e.x, e.y]]) fx.burst(14, x, y, 8, { t: "glint", ramp: "wind", sp: 50, life: .45, up: 0, zj: 14 });
        this.sfx.play("dash");
        break;
      case "dash": fx.burst(5, e.x, e.y, 1, { t: "smoke", r0: 1.5, r1: 3.5, sp: 20, life: .5, up: .1 }); if (e.p === this.selfId) this.sfx.play("dash"); break;
      case "hurt":
        fx.add({ t: "text", text: String(e.d), color: "#ff4a5a", x: e.x, y: e.y, z: 26, life: .7 });
        fx.burst(6, e.x, e.y, 10, { t: "spark", ramp: "red", sp: 60, life: .3 });
        if (me) { this.shake = Math.max(this.shake, 3); this.sfx.play("hurt"); this.onEvent({ t: "hurtme" }); }
        break;
      case "down": fx.burst(14, e.x, e.y, 6, { t: "smoke", r0: 2, r1: 5, sp: 25, life: 1, up: .8 }); this.sfx.play("down"); break;
      case "revive": fx.burst(26, e.x, e.y, 0, { t: "glint", ramp: "holy", sp: 30, up: 1.3, spread: .2, life: 1.2, jit: 16 }); break;
      case "die": {
        const R = e.k === "skull" ? "violet" : e.k === "bat" ? "shadow" : "ice";
        fx.burst(10, e.x, e.y, 6, { t: "puff", ramp: R, r0: 2, r1: 4, lvl: 6, sp: 40, life: .4 });
        fx.burst(8, e.x, e.y, 4, { t: "smoke", r0: 2, r1: 4, sp: 20, life: .7, up: .9 });
        break;
      }
      case "bossdie": this.bossDie(e.x, e.y); break;
      case "bosscast": if (this.cur?.bo) this.glow(this.cur.bo.x, this.cur.bo.y, 20, 40, RAMPS[this.enemyRamp()][7], .6, .3); this.sfx.play("boss-cast"); break;
      case "bossdash": fx.burst(8, e.x, e.y, 1, { t: "smoke", r0: 2, r1: 5, sp: 30, life: .6, up: .1 }); this.sfx.play("boss-dash"); break;
      case "eboom": this.eboom(e); break;
      case "summon": this.decal({ k: "ring", x: e.x, y: e.y, r0: 2, r1: 14, life: .5, color: "#c878ff" }); fx.burst(8, e.x, e.y, 2, { t: "puff", ramp: "violet", r0: 1, r1: 3, lvl: 7, sp: 20, up: 1, life: .5 }); break;
      case "phase": this.shake = 6; this.flash = .5; this.flashCol = "#ff4a3a"; this.onEvent({ t: "phase" }); this.sfx.play("boom"); break;
      case "ult": this.startCut(e, clock.now()); break;
      case "slash": {
        const R = { sword: "#f2fbff", axe: "#ffd060", spear: "#a8e0ff" }[e.w] || "#ffffff";
        this.decal({ k: "arc", x: e.x, y: e.y, a: e.a, r: e.r, arc: e.arc, life: .16, color: R });
        this.sfx.play("dash");
        break;
      }
      case "gslam": this.decal({ k: "ring", x: e.x, y: e.y, r0: 4, r1: 34, life: .3, color: "#ff8ad8" }); fx.burst(8, e.x, e.y, 2, { t: "chip", sp: 70, life: .8, g: 260, bounce: .4, up: .9 }); this.shake = Math.max(this.shake, 2); this.sfx.play("boom"); break;
      case "chest": fx.burst(24, e.x, e.y, 8, { t: "glint", ramp: "gold", sp: 70, up: 1, spread: .4, life: .9, g: 60 }); this.glow(e.x, e.y, 10, 40, "#ffd060", 1, .5); this.sfx.play("win"); break;
      case "pickup": if (e.p === this.selfId) { this.onEvent({ t: "pickup", ...e }); this.sfx.play(e.pot ? "heal" : "ui2"); } break;
      case "lvup": fx.burst(20, e.x, e.y, 2, { t: "glint", ramp: "gold", sp: 30, up: 1.3, spread: .2, life: 1, jit: 12 }); if (e.p === this.selfId) { this.onEvent({ t: "lvup", lv: e.lv }); this.sfx.play("perfect"); } break;
      case "gate": this.decal({ k: "circle", elem: "shadow", x: e.x, y: e.y, r: 34, life: 999, grow: 1, spin: 1 }); this.flash = .5; this.flashCol = "#e0a8ff"; this.onEvent({ t: "gate" }); this.sfx.play("ult"); break;
      case "bosswake": this.shake = 6; this.onEvent({ t: "bosswake" }); this.sfx.play("boss-dead"); break;
      case "aggro": fx.add({ t: "text", text: "!", color: "#ff6a5a", x: e.x, y: e.y, z: 18, life: .6 }); break;
    }
  }
  enemyRamp() { const b = this.cur?.bo; const el = b ? BOSSES.find((B) => B.id === b.k)?.elem : "shadow"; return { fire: "red", ice: "ice", thunder: "thunder", holy: "gold", shadow: "violet", wind: "wind" }[el] || "red"; }

  glow(x, y, z, r, color, a, life = 0) { if (life) this.glows.push({ x, y, z, r, color, a, life, age: 0 }); else this.frameGlows.push({ x, y, z, r, color, a }); }
  decal(d) { this.decals.push({ age: 0, ...d }); }
  bolt(a, b, life, w) {
    // ギザギザの稲妻(世界座標の点列)
    const pts = [a], n = Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 10));
    for (let i = 1; i < n; i++) { const t = i / n, j = 7 * Math.sin(t * Math.PI); pts.push([lerp(a[0], b[0], t) + rr(-j, j), lerp(a[1], b[1], t) + rr(-j, j), lerp(a[2], b[2], t) + rr(-j, j) * .7]); }
    pts.push(b);
    this.bolts.push({ pts, age: 0, life, w });
  }
  strike(x, y, big) {
    const top = [x + rr(-30, 30), y + rr(-30, 30), 260];
    this.bolt(top, [x, y, 0], big ? .32 : .22, big ? 2 : 1);
    if (big) this.bolt([x + rr(-40, 40), y + rr(-40, 40), 260], [x, y, 0], .2, 1);
    this.glow(x, y, 20, big ? 70 : 44, "#fff2a0", big ? .55 : .75, .22);
    this.fx.burst(big ? 18 : 10, x, y, 2, { t: "spark", ramp: "thunder", sp: 110, life: .4, up: .6, g: 160, bounce: .3 });
    this.fx.burst(6, x, y, 2, { t: "smoke", r0: 2, r1: 5, sp: 20, life: .8, up: .9 });
    this.decal({ k: "scorch", x, y, r: big ? 16 : 10, life: 4 });
    this.decal({ k: "ring", x, y, r0: 3, r1: big ? 40 : 24, life: .3, color: "#fff27a" });
    if (big) { this.shake = Math.max(this.shake, 5); this.flash = Math.max(this.flash, .12); this.flashCol = "#fffbe0"; }
    this.sfx.play("thunder");
  }
  nova(x, y, r, el) {
    this.decal({ k: "ring", x, y, r0: 4, r1: r, life: .35, color: "#d6f4ff" });
    this.decal({ k: "ring", x, y, r0: 2, r1: r * .8, life: .45, color: "#6ab0e0" });
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; this.props.push({ m: "spike", x: x + Math.cos(a) * r * .7, y: y + Math.sin(a) * r * .7, f: a, age: -i * .015, life: .7, scale: .6 }); }
    this.fx.burst(20, x, y, 4, { t: "glint", ramp: "ice", sp: 120, up: .2, life: .5, drag: 3 });
  }
  boom(e) {
    const fx = this.fx, k = e.k;
    if (k === "fireball") {
      fx.burst(14, e.x, e.y, 8, { t: "puff", ramp: "fire", r0: 2, r1: 5, lvl: 9, sp: 50, life: .45, drag: 4, g: -30 });
      fx.burst(10, e.x, e.y, 8, { t: "spark", ramp: "fire", sp: 110, life: .5, g: 150, bounce: .3 });
      fx.burst(6, e.x, e.y, 8, { t: "smoke", r0: 2, r1: 5, sp: 20, life: 1, up: 1 });
      this.glow(e.x, e.y, 8, 40, "#ff9a3c", .9, .3);
      this.decal({ k: "ring", x: e.x, y: e.y, r0: 3, r1: e.r, life: .25, color: "#ffc23d" });
      this.decal({ k: "scorch", x: e.x, y: e.y, r: 8, life: 3 });
      this.sfx.play("hit-fire");
    } else if (k === "meteor") {
      fx.burst(36, e.x, e.y, 4, { t: "puff", ramp: "fire", r0: 3, r1: 7, lvl: 9, sp: 90, life: .7, drag: 3, g: -40, up: .2 });
      fx.burst(18, e.x, e.y, 2, { t: "chip", ramp: "smoke", sp: 120, life: 1.4, g: 260, bounce: .4, up: .8 });
      fx.burst(24, e.x, e.y, 4, { t: "spark", ramp: "fire", sp: 180, life: .7, g: 150, bounce: .3, up: .5 });
      fx.burst(12, e.x, e.y, 6, { t: "smoke", r0: 3, r1: 7, sp: 30, life: 1.4, up: 1 });
      this.glow(e.x, e.y, 10, 90, "#ff8a2a", 1, .5);
      this.decal({ k: "ring", x: e.x, y: e.y, r0: 6, r1: e.r * 1.6, life: .4, color: "#ffe26b" });
      this.decal({ k: "scorch", x: e.x, y: e.y, r: e.r * .7, life: 6 });
      this.shake = Math.max(this.shake, 6); this.flash = Math.max(this.flash, .25); this.flashCol = "#fff3a6";
      this.sfx.play("boom");
    } else if (k === "holy-pillar") {
      fx.burst(30, e.x, e.y, 4, { t: "glint", ramp: "holy", sp: 90, life: .8, up: .9, drag: 2 });
      this.glow(e.x, e.y, 30, 80, "#fff09a", 1, .45);
      this.decal({ k: "ring", x: e.x, y: e.y, r0: 4, r1: e.r * 1.4, life: .4, color: "#fff09a" });
      this.flash = Math.max(this.flash, .2); this.flashCol = "#fff8d0";
      this.sfx.play("hit-holy");
    } else if (k === "quake") {
      const c = Math.cos(e.a), s = Math.sin(e.a);
      for (let d = 8; d < e.len; d += 9) { fx.add({ t: "puff", ramp: "fire", x: e.x + c * d + rr(-5, 5), y: e.y + s * d + rr(-5, 5), z: 2, vz: rr(30, 70), r0: 2, r1: 5, lvl: 9, life: .5 }); if (d % 27 < 9) fx.burst(2, e.x + c * d, e.y + s * d, 1, { t: "chip", sp: 50, life: .8, g: 260, up: 1 }); }
      this.decal({ k: "scorch", x: e.x + c * e.len / 2, y: e.y + s * e.len / 2, r: 10, life: 3 });
      this.shake = Math.max(this.shake, 4); this.sfx.play("boom");
    } else if (k === "ice-spikes") {
      const c = Math.cos(e.a), s = Math.sin(e.a);
      for (let d = 12, i = 0; d < e.len; d += 13, i++) this.props.push({ m: "spike", x: e.x + c * d + rr(-4, 4), y: e.y + s * d + rr(-4, 4), f: rr(0, TAU), age: -i * .03, life: .9, scale: 1 });
      fx.burst(16, e.x + c * e.len / 2, e.y + s * e.len / 2, 4, { t: "glint", ramp: "ice", sp: 60, life: .6, jit: 60, up: .8 });
      this.sfx.play("hit-ice");
    } else {
      const R = ELEM_RAMP[SPELLS[k]?.elem] || "fire";
      fx.burst(10, e.x, e.y, 8, { t: "puff", ramp: R, r0: 2, r1: 4, lvl: 8, sp: 50, life: .4 });
    }
  }
  eboom(e) {
    const R = this.enemyRamp(), fx = this.fx;
    if (e.k === "dashline") return;
    if (e.sh === "circle") {
      fx.burst(Math.min(30, 6 + e.r / 3), e.x, e.y, 2, { t: "puff", ramp: R, r0: 2, r1: 5, lvl: 8, sp: e.r * 1.4, life: .45, up: .15, drag: 3 });
      fx.burst(6, e.x, e.y, 2, { t: "chip", sp: 80, life: 1, g: 260, bounce: .4, up: .9 });
      this.decal({ k: "ring", x: e.x, y: e.y, r0: e.r * .3, r1: e.r, life: .3, color: RAMPS[R][7] });
      this.decal({ k: "scorch", x: e.x, y: e.y, r: e.r * .5, life: 2.5 });
      this.glow(e.x, e.y, 6, e.r * 1.4, RAMPS[R][6], .7, .25);
      if (e.r > 50) this.shake = Math.max(this.shake, 4);
    } else {
      const c = Math.cos(e.a), s = Math.sin(e.a), L = e.len || 100;
      for (let d = 10; d < L; d += 16) {
        const w = e.sh === "cone" ? Math.tan(e.ang / 2) * d : 0, j = rr(-w, w);
        fx.add({ t: "puff", ramp: R, x: e.x + c * d - s * j, y: e.y + s * d + c * j, z: 3, vz: 30, r0: 2, r1: 5, lvl: 8, life: .4 + Math.random() * .2 });
      }
    }
    this.sfx.play("boom");
  }
  bossDie(x, y) {
    this.dying = { x, y, age: 0 };
    for (let i = 0; i < 6; i++) setTimeout(() => {
      const px = x + rr(-20, 20), py = y + rr(-20, 20);
      this.fx.burst(16, px, py, rr(4, 24), { t: "puff", ramp: "fire", r0: 3, r1: 6, lvl: 9, sp: 70, life: .5, drag: 3 });
      this.glow(px, py, 16, 60, "#ffc23d", 1, .3); this.shake = 5; this.sfx.play("boom");
    }, i * 180);
    setTimeout(() => {
      this.flash = 1; this.flashCol = "#ffffff"; this.shake = 10;
      this.fx.burst(60, x, y, 10, { t: "puff", ramp: "fire", r0: 3, r1: 8, lvl: 9, sp: 140, life: .9, drag: 2.5, g: -30 });
      this.fx.burst(40, x, y, 10, { t: "spark", ramp: "gold", sp: 220, life: 1, g: 150, bounce: .4, up: .6 });
      this.decal({ k: "ring", x, y, r0: 10, r1: 170, life: .7, color: "#fff3a6" });
      this.sfx.play("boss-dead");
    }, 1150);
  }

  // ───── 究極魔法のカットシーン ─────
  startCut(c, now) {
    if (this.cut) return;
    this.cut = { ...c, t0: now - (c.t || 0) * 1000, fired: new Set(), el: ULTS[c.id].elem };
    const U = ULTS[c.id];
    this.onEvent({ t: "ultcard", name: U.name, elem: U.elem, color: ELEMENTS[U.elem].color, who: c.p });
    this.sfx.play("ult");
  }
  cutCam(t) {
    const yo = t < 2.3 ? ease(t / 2.3) * 1.45 : t < 2.6 ? 1.45 : 1.45 * (1 - ease((t - 2.6) / .95));
    const z = t < .45 ? 1 + ease(t / .45) : t < 1.4 ? 2 + (t - .45) * .2 : t < 1.85 ? lerp(2.19, 1, ease((t - 1.4) / .45)) : 1;
    const fk = ease((t - 1.35) / .5);
    return { yo, z, fk };
  }
  updateCut(now, dt) {
    const c = this.cut;
    if (!c) { this.lb = Math.max(0, (this.lb || 0) - dt * 4); this.dark = Math.max(0, (this.dark || 0) - dt * 3); this.tint = null; return; }
    const t = (now - c.t0) / 1000;
    if (t > CUT_DUR + .05) { this.cut = null; this.ultObj = null; this.ultTornado = null; this.onEvent({ t: "ultend" }); return; }
    c.t = t;
    const { yo, z, fk } = this.cutCam(t);
    this.yaw = this.baseYaw + yo; this.zoom = z;
    this.lb = t < CUT_DUR - .3 ? Math.min(1, t / .25) : Math.max(0, (CUT_DUR - t) / .3);
    this.dark = t < .15 ? t / .15 * .5 : t < CUT_HIT ? .5 + (c.id === "thunder-god" || c.id === "void-maw" ? .2 : 0) : Math.max(0, .5 - (t - CUT_HIT) * 1.5);
    this.camFocus = [lerp(c.x, c.tx, fk), lerp(c.y, c.ty, fk)];
    this.ultFx(c, t, dt);
  }
  once(c, key, cond) { if (cond && !c.fired.has(key)) { c.fired.add(key); return true; } return false; }
  ultFx(c, t, dt) {
    const fx = this.fx, R = ELEM_RAMP[c.el], col = ELEM_COL[c.el], hit = t >= CUT_HIT;
    // 溜め: 足元の魔法陣と立ちのぼる光
    if (this.once(c, "circle", true)) { this.decal({ k: "circle", elem: c.el, x: c.x, y: c.y, r: 36, life: 2.4, grow: 1 }); this.decal({ k: "circle", elem: c.el, x: c.x, y: c.y, r: 20, life: 2.4, grow: 1, spin: -2 }); }
    if (t < 1.5) {
      for (let i = 0; i < 3; i++) { const a = rr(0, TAU), d = rr(6, 30); fx.add({ t: "glint", ramp: R, x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d, z: rr(0, 6), vz: rr(30, 70), life: .8, lvl: 9 }); }
      this.glow(c.x, c.y, 12, 30 + t * 20, col, .5 + t * .3);
    }
    switch (c.id) {
      case "sky-meteor": {
        if (t > 1.5 && !hit && !c.fired.has("hit")) {
          const u = Math.min(1, (t - 1.5) / (CUT_HIT - 1.5)), x = c.tx - (1 - u) * 110, y = c.ty - (1 - u) * 70, z = 300 * (1 - u) * (1 - u) + 10;
          this.ultObj = { m: "p_meteor_big", x, y, z, f: Math.atan2(70, 110) };
          for (let i = 0; i < 3; i++) fx.add({ t: "puff", ramp: "fire", x: x + rr(-10, 10), y: y + rr(-10, 10), z: z + rr(0, 14), vx: -30, vy: -20, vz: 20, r0: 3, r1: 8, lvl: 9, life: .5 });
          fx.add({ t: "smoke", x: x + rr(-10, 10), y: y + rr(-10, 10), z: z + 10, r0: 4, r1: 9, life: 1, vz: 10 });
          this.glow(x, y, z + 14, 80, "#ff8a2a", .9);
          this.glow(c.tx, c.ty, 0, 60 * u, "#ff5a20", .5 * u);
          this.decalOnce(c, "mc", { k: "circle", elem: "fire", x: c.tx, y: c.ty, r: 60, life: 1.2, grow: 1 });
        }
        if (this.once(c, "hit", hit)) {
          this.ultObj = null; this.flash = 1; this.flashCol = "#fff3a6"; this.shake = 12;
          for (const [r1, l, cc] of [[180, .7, "#fff3a6"], [130, .5, "#ff8a2a"]]) this.decal({ k: "ring", x: c.tx, y: c.ty, r0: 10, r1, life: l, color: cc });
          this.decal({ k: "scorch", x: c.tx, y: c.ty, r: 60, life: 8 });
          fx.burst(110, c.tx, c.ty, 6, { t: "puff", ramp: "fire", r0: 3, r1: 9, lvl: 9, sp: 150, life: 1, drag: 2.4, g: -40, up: .3 });
          fx.burst(40, c.tx, c.ty, 6, { t: "chip", sp: 200, life: 1.6, g: 260, bounce: .4, up: .9 });
          fx.burst(40, c.tx, c.ty, 6, { t: "spark", ramp: "fire", sp: 260, life: 1, g: 150, bounce: .3, up: .6 });
          fx.burst(24, c.tx, c.ty, 10, { t: "smoke", r0: 4, r1: 10, sp: 60, life: 2, up: 1 });
          this.glow(c.tx, c.ty, 10, 220, "#ff9a3c", 1, .9);
          this.sfx.play("boom");
        }
        break;
      }
      case "absolute-zero": {
        if (t > 1.45) this.tint = ["rgba(90,170,255,", Math.min(.14, (t - 1.45) * .3)];
        for (let w = 0; w < 5; w++) if (this.once(c, "w" + w, t > 1.5 + w * .18)) {
          const r = 30 + w * 30, n = Math.round(r / 9);
          for (let i = 0; i < n; i++) { const a = i / n * TAU + w; this.props.push({ m: "crystal", x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, f: rr(0, TAU), age: rr(-.05, 0), life: 2.2 - w * .1, scale: 1 }); }
          this.decal({ k: "ring", x: c.x, y: c.y, r0: r - 10, r1: r + 8, life: .3, color: "#d6f4ff" });
          this.sfx.play("hit-ice");
        }
        if (t > 1.4) for (let i = 0; i < 2; i++) fx.add({ t: "dot", ramp: "ice", x: this.camFocus[0] + rr(-160, 160), y: this.camFocus[1] + rr(-160, 160), z: rr(60, 140), vz: -40, vx: 30, life: 2.5, lvl: 9 });
        if (this.once(c, "hit", hit)) {
          this.flash = .55; this.flashCol = "#d6f4ff"; this.shake = 6;
          this.decal({ k: "ring", x: c.x, y: c.y, r0: 10, r1: 190, life: .6, color: "#ffffff" });
          for (const e of this.enemyPositions()) { fx.burst(24, e[0], e[1], 14, { t: "glint", ramp: "ice", sp: 90, life: .8, up: .6 }); this.glow(e[0], e[1], 14, 50, "#d6f4ff", 1, .5); }
        }
        break;
      }
      case "thunder-god": {
        if (t > .3 && t < CUT_HIT && Math.random() < .25) { const a = rr(0, TAU); this.bolt([c.x, c.y, 18], [c.x + Math.cos(a) * 30, c.y + Math.sin(a) * 30, rr(0, 30)], .1, 1); }
        if (t > 1.5 && t < CUT_HIT && Math.random() < .12) { this.flash = .25; this.flashCol = "#c8c8ff"; }
        if (t > 1.6 && t < CUT_HIT) this.glow(c.x, c.y, 30, 60, "#fff27a", .6);
        if (this.once(c, "hit", hit)) { this.strike(c.tx, c.ty, 1); this.flash = .7; this.flashCol = "#ffffff"; this.shake = 8; }
        break;
      }
      case "judgment": {
        this.decalOnce(c, "jc", t > 1.4 && { k: "circle", elem: "holy", x: c.tx, y: c.ty, r: 72, life: 2.2, grow: 1, spin: 1 });
        this.decalOnce(c, "jc2", t > 1.5 && { k: "circle", elem: "holy", x: c.tx, y: c.ty, r: 44, life: 2.1, grow: 1, spin: -1.5 });
        if (t > 1.6 && t < CUT_HIT + .8) {
          const u = Math.min(1, (t - 1.6) / (CUT_HIT - 1.6)), top = 320 - 300 * u, fade = t > CUT_HIT ? 1 - (t - CUT_HIT) / .8 : 1;
          for (let z = top; z < 320; z += 18) this.glow(c.tx, c.ty, z, 38, "#fff09a", .55 * fade);
          this.glow(c.tx, c.ty, 0, 60, "#fff8d0", .6 * u * fade);
          for (let i = 0; i < 2; i++) fx.add({ t: "glint", ramp: "holy", x: c.tx + rr(-90, 90), y: c.ty + rr(-90, 90), z: rr(80, 160), vz: -35, vx: rr(-10, 10), life: 2.5, lvl: 9, size: 2 });
        }
        if (this.once(c, "hit", hit)) {
          this.flash = 1; this.flashCol = "#fffbe0"; this.shake = 8;
          this.decal({ k: "ring", x: c.tx, y: c.ty, r0: 10, r1: 170, life: .6, color: "#fff09a" });
          fx.burst(80, c.tx, c.ty, 10, { t: "glint", ramp: "holy", sp: 160, life: 1.1, up: .6, drag: 2 });
          for (const p of this.cur?.pl || []) fx.burst(16, p.x, p.y, 2, { t: "glint", ramp: "wind", sp: 20, up: 1.3, spread: .2, life: 1.2, jit: 12 });
          this.sfx.play("heal");
        }
        break;
      }
      case "void-maw": {
        if (t > 1.4 && t < CUT_HIT) {
          const u = Math.min(1, (t - 1.4) / (CUT_HIT - 1.4));
          this.ultObj = { orb: 6 + 26 * ease(u), x: c.tx, y: c.ty, z: 30 };
          for (let i = 0; i < 6; i++) { const a = rr(0, TAU), d = rr(60, 150); fx.add({ t: i % 3 ? "dot" : "chip", ramp: i % 2 ? "violet" : "shadow", x: c.tx + Math.cos(a) * d, y: c.ty + Math.sin(a) * d, z: rr(0, 40), orbit: { x: c.tx, y: c.ty, z: 30 }, spin: 3, pull: 120, life: 1.2, lvl: 8, size: 2 }); }
          this.glow(c.tx, c.ty, 30, 70, "#7a3ab0", .5);
          this.decalOnce(c, "vc", { k: "circle", elem: "shadow", x: c.tx, y: c.ty, r: 80, life: 1.4, grow: 1, spin: 3 });
        }
        if (this.once(c, "hit", hit)) {
          this.ultObj = null; this.flash = .8; this.flashCol = "#e0a8ff"; this.shake = 10;
          for (const [r1, l, cc] of [[190, .7, "#e0a8ff"], [120, .5, "#7a3ab0"]]) this.decal({ k: "ring", x: c.tx, y: c.ty, r0: 6, r1, life: l, color: cc });
          fx.burst(80, c.tx, c.ty, 30, { t: "puff", ramp: "shadow", r0: 3, r1: 8, lvl: 8, sp: 170, life: .9, drag: 2.5, up: 0, spread: 1.4 });
          fx.burst(40, c.tx, c.ty, 30, { t: "glint", ramp: "violet", sp: 220, life: .8, up: 0, spread: 1.4 });
          this.glow(c.tx, c.ty, 30, 200, "#c878ff", 1, .8);
          this.sfx.play("boom");
        }
        break;
      }
      case "wind-god": {
        if (t > 1.4) { const u = Math.min(1, (t - 1.4) / 1); this.ultTornado = { x: c.x, y: c.y, r: 20 + 60 * u, h: 60 + 90 * u, n: 90 + 70 * u | 0 }; }
        if (t > 1.4) for (let i = 0; i < 2; i++) { const a = rr(0, TAU), d = rr(40, 110); fx.add({ t: "glint", ramp: "wind", x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d, z: rr(0, 40), orbit: { x: c.x, y: c.y, z: rr(40, 120) }, spin: 6, pull: 20, life: 1.4, lvl: 9 }); }
        if (this.once(c, "hit", hit)) {
          this.flash = .6; this.flashCol = "#d8fce0"; this.shake = 7;
          this.decal({ k: "ring", x: c.x, y: c.y, r0: 10, r1: 200, life: .6, color: "#a8f0b8" });
          fx.burst(60, c.x, c.y, 10, { t: "glint", ramp: "wind", sp: 200, life: .8, up: .3, drag: 2 });
          this.ultTornado = null;
        }
        break;
      }
    }
  }
  decalOnce(c, key, d) { if (d && this.once(c, key, true)) this.decal(d); }
  enemyPositions() { const l = []; const C = this.cur; if (C?.bo && C.bo.hp > 0) l.push([C.bo.x, C.bo.y]); for (const m of C?.mi || []) l.push([m[2], m[3]]); return l; }

  // ───── 描画 ─────
  render(now) {
    const dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    if (!this.theme) return;
    const S = this.interp();
    this.frameGlows = [];
    this.ultObj = this.cut ? this.ultObj : null;
    if (!this.cut) { this.baseYaw += this.spin * dt; this.yaw = this.baseYaw; this.zoom = 1; this.ultTornado = null; }
    this.updateCut(now, dt);
    this.fx.update(dt);
    this.shake = Math.max(0, this.shake - dt * 16); this.flash = Math.max(0, this.flash - dt * 3);

    // カメラ: 自分を追う(カットシーン中は詠唱者 → 標的)
    let fx0 = 0, fy0 = 25;
    const me = S?.pl.find((p) => p.id === this.selfId) || S?.pl[0];
    if (this.cut && this.camFocus) [fx0, fy0] = this.camFocus;
    else if (me) { if (this.mode === "dungeon") { fx0 = me.x; fy0 = me.y; } else { fx0 = me.x * .7; fy0 = me.y * .7 + 8; } }
    const k = this.cut ? Math.min(1, dt * 8) : Math.min(1, dt * 4);
    this.cam.x = lerp(this.cam.x, fx0, k); this.cam.y = lerp(this.cam.y, fy0, k);
    this.setCam();

    const g = this.g, W = this.W, H = this.H, T = now / 1000;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.drawImage(this.bg, 0, 0);
    const acc = this.theme.accent;
    g.fillStyle = acc;
    for (const m of this.motes) { const y = ((m.y - T * .02 * m.s) % 1 + 1) % 1, x = (m.x + Math.sin(T * .5 + m.p) * .01 + this.yaw * .15) % 1; g.globalAlpha = .25 * m.s; g.fillRect(Math.floor(((x + 1) % 1) * W), Math.floor(y * H), 1, 1); }
    g.globalAlpha = 1;

    if (this.mode === "dungeon") { g.save(); this.floorT(g); g.drawImage(this.dfloor, 0, 0); g.restore(); this.markSeen(me); }
    else {
      if (this.floorYaw !== this.yaw) this.renderFloorCache();
      const [e0, f0] = this.proj(0, 0, 0);
      g.drawImage(this.fc, Math.round(e0 - this.fox), Math.round(f0 - this.foy));
    }

    this.drawDecals(g, dt, S);
    const list = [];
    this.collect(list, S, T, dt);
    list.sort((a, b) => b.v - a.v);
    for (const it of list) it.d(g);
    this.drawBolts(g, dt);

    // 暗転と色味(光は暗転の上に足すので、魔法だけが浮かび上がる)
    if (this.dark > 0) { g.fillStyle = `rgba(4,2,10,${this.dark.toFixed(2)})`; g.fillRect(0, 0, W, H); }
    if (this.tint) { g.fillStyle = this.tint[0] + this.tint[1] + ")"; g.fillRect(0, 0, W, H); }
    if (this.mode === "dungeon") {
      if (!this.vig || this.vig.w !== W) { const gr = g.createRadialGradient(W / 2, H * .56, 30, W / 2, H * .56, W * .62); gr.addColorStop(0, "rgba(4,2,10,0)"); gr.addColorStop(1, "rgba(4,2,10,.78)"); this.vig = { gr, w: W }; }
      g.fillStyle = this.vig.gr; g.fillRect(0, 0, W, H);
    }
    this.drawGlows(g, dt);
    this.drawOverheads(g, S);
    if (this.flash > 0) { g.globalAlpha = Math.min(1, this.flash); g.fillStyle = this.flashCol; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }

    // 画面へ(カットシーンではドットのまま拡大)
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (Math.abs(this.zoom - 1) < .01) c.drawImage(this.wc, 0, 0);
    else {
      const w = W / this.zoom, h = H / this.zoom, x0 = Math.max(0, Math.min(W - w, W / 2 - w / 2)), y0 = Math.max(0, Math.min(H - h, H * .56 - h * .62));
      c.drawImage(this.wc, x0, y0, w, h, 0, 0, W, H);
    }
    if (this.lb > 0) { const bh = Math.round(this.lb * 22); c.fillStyle = "#000"; c.fillRect(0, 0, W, bh); c.fillRect(0, H - bh, W, bh); }
  }

  drawDecals(g, dt, S) {
    g.save(); this.floorT(g);
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]; d.age += dt;
      if (d.age >= d.life) { this.decals.splice(i, 1); continue; }
      const u = d.age / d.life;
      if (d.k === "arc") { g.globalAlpha = 1 - u; g.strokeStyle = d.color; g.lineWidth = 3 * (1 - u) + 1; g.beginPath(); g.arc(d.x, d.y, d.r * (.7 + .3 * u), d.a - d.arc / 2, d.a + d.arc / 2); g.stroke(); g.globalAlpha = 1; continue; }
      if (d.k === "scorch") { g.globalAlpha = .4 * Math.min(1, (1 - u) * 3); g.fillStyle = "#050308"; g.beginPath(); g.ellipse(d.x, d.y, d.r, d.r * .85, 0, 0, TAU); g.fill(); }
      else if (d.k === "ring") { const r = lerp(d.r0, d.r1, 1 - (1 - u) ** 3), tex = ringTex(r, d.color, 2); g.globalAlpha = 1 - u * u; g.drawImage(tex, d.x - tex.width / 2, d.y - tex.height / 2); }
      else if (d.k === "circle") {
        const r = d.grow ? d.r * ease(Math.min(1, d.age / .4)) : d.r, tex = circleTex(d.elem, Math.max(8, r));
        g.globalAlpha = Math.min(1, (1 - u) * 4) * .9;
        g.save(); g.translate(d.x, d.y); g.rotate(d.age * (d.spin ?? 1.2)); g.drawImage(tex, -tex.width / 2, -tex.height / 2); g.restore();
      }
    }
    g.globalAlpha = 1;
    if (S) {
      const ec = "#ff4a3a";
      for (const z of S.zo) {
        const u = Math.min(1, z.t / (z.d || 1));
        if (z.side === "e") this.tele(g, z, u, z.k === "dashline" ? "#ffb040" : ec);
        else if (z.k === "meteor" || z.k === "holy-pillar") {
          const tex = circleTex(z.k === "meteor" ? "fire" : "holy", z.r);
          g.globalAlpha = .9; g.save(); g.translate(z.x, z.y); g.rotate(z.t * 2); g.drawImage(tex, -tex.width / 2, -tex.height / 2); g.restore(); g.globalAlpha = 1;
        } else if (z.k === "ice-spikes") {
          g.globalAlpha = .5 + .5 * u; g.fillStyle = "#a8e0ff"; g.save(); g.translate(z.x, z.y); g.rotate(z.a); g.fillRect(0, -1, z.len * Math.min(1, u * 2), 2); g.restore(); g.globalAlpha = 1;
        } else if (z.k === "black-hole") {
          const tex = circleTex("shadow", z.r); g.save(); g.translate(z.x, z.y); g.rotate(-z.t * 3); g.drawImage(tex, -tex.width / 2, -tex.height / 2); g.restore();
        } else if (z.k === "flame-ring") {
          const r = z.r * Math.min(1, u), tex = ringTex(r, "#ffc23d", 3); g.drawImage(tex, z.x - tex.width / 2, z.y - tex.height / 2);
        }
      }
    }
    g.restore();
  }
  tele(g, z, u, col) {
    g.save(); g.translate(z.x, z.y);
    const pulse = .16 + .06 * Math.sin(z.t * 18);
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 1.2;
    if (z.sh === "circle") {
      g.globalAlpha = pulse; g.beginPath(); g.arc(0, 0, z.r, 0, TAU); g.fill();
      g.globalAlpha = .38; g.beginPath(); g.arc(0, 0, z.r * u, 0, TAU); g.fill();
      g.globalAlpha = .9; g.beginPath(); g.arc(0, 0, z.r, 0, TAU); g.stroke();
    } else if (z.sh === "line") {
      g.rotate(z.a);
      g.globalAlpha = pulse; g.fillRect(0, -z.wid / 2, z.len, z.wid);
      g.globalAlpha = .38; g.fillRect(0, -z.wid / 2, z.len * u, z.wid);
      g.globalAlpha = .9; g.strokeRect(0, -z.wid / 2, z.len, z.wid);
    } else if (z.sh === "cone") {
      g.rotate(z.a);
      const wedge = (L) => { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, L, -z.ang / 2, z.ang / 2); g.closePath(); };
      g.globalAlpha = pulse; wedge(z.len); g.fill();
      g.globalAlpha = .38; wedge(z.len * u); g.fill();
      g.globalAlpha = .9; wedge(z.len); g.stroke();
    }
    g.restore(); g.globalAlpha = 1;
  }

  sprite(g, m, frame, face, x, y, z, alpha = 1) {
    const s = this.st.sprite(m, frame, face - this.yaw), [sx, sy] = this.proj(x, y, z);
    if (alpha < 1) g.globalAlpha = alpha;
    g.drawImage(s.c, Math.round(sx - s.ax), Math.round(sy - s.ay));
    if (alpha < 1) g.globalAlpha = 1;
    return [sx, sy, s];
  }
  shadowAt(g, x, y, r, a = 1) { const [sx, sy] = this.proj(x, y, 0), s = shadow(r, this.sq); g.globalAlpha = a; g.drawImage(s, Math.round(sx - s.width / 2), Math.round(sy - s.height / 2)); g.globalAlpha = 1; }

  collect(list, S, T, dt) {
    const push = (x, y, d) => { const [, , v] = this.proj(x, y, 0); list.push({ v, d }); };
    // 外周の柱と篝火
    if (this.mode === "dungeon") this.collectDungeon(list, S, T, dt, push);
    else if (this.pillarM) for (let i = 0; i < 8; i++) {
      const a = (i + .5) / 8 * TAU, x = Math.cos(a) * (ARENA_R + 11), y = Math.sin(a) * (ARENA_R + 11);
      push(x, y, (g) => {
        const [, , v] = this.proj(x, y, 0);
        this.sprite(g, this.pillarM, Math.floor(T * 8 + i) % 3, a, x, y, 0, v < -60 && !this.cut ? .35 : 1);
        this.frameGlows.push({ x, y, z: 44, r: 26 + Math.sin(T * 9 + i) * 3, color: "#ff9a3c", a: .55 });
      });
    }
    if (S) {
      const fr = Math.floor(T * 4);
      // ボス
      const b = S.bo;
      if (b && (b.hp > 0 || b.dead < 1.3)) {
        const m = model(BOSS_MODEL[b.k]), B = BOSSES.find((q) => q.id === b.k);
        push(b.x, b.y, (g) => {
          const sink = b.hp <= 0 ? Math.max(0, b.dead - .3) * 30 : 0, jit = b.st === "dashwind" ? rr(-1, 1) : 0;
          this.shadowAt(g, b.x, b.y, B.r * 1.1, Math.max(0, .9 - b.z / 120));
          if (b.hp <= 0) { g.save(); const [, gy] = this.proj(b.x, b.y, 0); g.beginPath(); g.rect(0, 0, this.W, gy + 4); g.clip(); }
          const flick = b.hp <= 0 && Math.floor(T * 20) % 2;
          this.sprite(g, m, b.fr ? 0 : fr, b.f, b.x + jit, b.y, b.z - sink, flick ? .5 : 1);
          if (b.hp <= 0) g.restore();
          if (b.fr) this.iceBlock(g, b.x, b.y, B.r);
          if (b.ph === 2 && b.hp > 0) this.frameGlows.push({ x: b.x, y: b.y, z: b.z + 14, r: 40 + Math.sin(T * 10) * 4, color: "#ff3a3a", a: .35 });
        });
      }
      for (const mi of S.mi) {
        const m = model(MINION_MODEL[mi.k]);
        push(mi.x, mi.y, (g) => { this.shadowAt(g, mi.x, mi.y, 6, .8); this.sprite(g, m, fr, mi.f, mi.x, mi.y, mi.z); if (mi.fr) this.iceBlock(g, mi.x, mi.y, 7); });
        if (mi.el) this.frameGlows.push({ x: mi.x, y: mi.y, z: 8, r: 18, color: "#ffb340", a: .45 });
      }
      // プレイヤー
      for (const p of S.pl) {
        const m = model(CHAR_MODEL[p.ch] || "mage", p.c);
        push(p.x, p.y, (g) => {
          this.shadowAt(g, p.x, p.y, 6, p.dn ? .4 : .9);
          if (p.inv && !p.dn && Math.floor(T * 15) % 2) return;
          const frame = p.ca ? 2 : p.mv ? 1 + (Math.floor(T * 8) % 2) - 1 : 0, bob = p.mv && !p.ca ? Math.abs(Math.sin(T * 12)) * 1.2 : 0;
          if (p.h) for (let k = 1; k <= 2; k++) this.sprite(g, m, frame, p.f, p.x - Math.cos(p.f) * k * 6, p.y - Math.sin(p.f) * k * 6, 0, .25 / k);
          this.sprite(g, m, p.dn ? 0 : frame, p.f, p.x, p.y, bob, p.dn ? .35 : 1);
          if (!p.dn) this.frameGlows.push({ x: p.x + Math.cos(p.f) * 2, y: p.y + Math.sin(p.f) * 2, z: 18, r: 9, color: "#7ff6ff", a: .35 });
        });
      }
      // 弾
      for (const q of S.pr) {
        if (q.k === "eb") {
          const R = this.enemyRamp();
          push(q.x, q.y, (g) => { const [sx, sy] = this.proj(q.x, q.y, q.z), s = puff(R, 2, 9); g.drawImage(s, Math.round(sx - 2), Math.round(sy - 2)); this.frameGlows.push({ x: q.x, y: q.y, z: q.z, r: 11, color: RAMPS[R][7], a: .6 }); });
          continue;
        }
        const m = model(PROJ_MODEL[q.k] || "p_fireball"), el = SPELLS[q.k]?.elem || "fire", face = q.k === "wind-cutter" ? T * 18 : Math.atan2(q.vy, q.vx);
        push(q.x, q.y, (g) => { this.shadowAt(g, q.x, q.y, 3, .5); this.sprite(g, m, Math.floor(T * 12), face, q.x, q.y, q.z - 4); });
        this.frameGlows.push({ x: q.x, y: q.y, z: q.z, r: q.k === "fireball" ? 26 : 18, color: ELEM_COL[el], a: .6 });
        if (Math.random() < dt * 40) {
          if (q.k === "fireball") this.fx.add({ t: "puff", ramp: "fire", x: q.x + rr(-2, 2), y: q.y + rr(-2, 2), z: q.z + rr(-2, 2), vz: 14, r0: 1, r1: 3, lvl: 8, life: .3 });
          else this.fx.add({ t: "dot", ramp: ELEM_RAMP[el], x: q.x, y: q.y, z: q.z, vz: rr(-5, 10), life: .35 });
        }
      }
      // 持続する魔法
      for (const z of S.zo) {
        if (z.side !== "p") continue;
        const u = Math.min(1, z.t / (z.d || 1));
        if (z.k === "meteor") {
          const x = z.x - (1 - u) * 50, y = z.y - (1 - u) * 30, h = 200 * (1 - u) ** 1.5 + 4;
          push(x, y, (g) => this.sprite(g, model("p_rock"), Math.floor(T * 8), .6, x, y, h));
          this.frameGlows.push({ x, y, z: h + 8, r: 40, color: "#ff8a2a", a: .8 });
          if (Math.random() < .7) this.fx.add({ t: "puff", ramp: "fire", x: x + rr(-4, 4), y: y + rr(-4, 4), z: h + 8, vz: 30, r0: 2, r1: 5, lvl: 9, life: .35 });
        } else if (z.k === "holy-pillar") {
          for (let h = 220 * (1 - u); h < 220; h += 16) this.frameGlows.push({ x: z.x, y: z.y, z: h, r: 22, color: "#fff09a", a: .4 });
          if (Math.random() < .5) this.fx.add({ t: "glint", ramp: "holy", x: z.x + rr(-z.r, z.r) * .6, y: z.y + rr(-z.r, z.r) * .6, z: rr(0, 80), vz: -40, life: .6 });
        } else if (z.k === "black-hole") {
          push(z.x, z.y, (g) => { const [sx, sy] = this.proj(z.x, z.y, 14), r = 9 + Math.sin(z.t * 8), s = puff("shadow", r, 3); g.drawImage(s, Math.round(sx - r), Math.round(sy - r)); });
          this.frameGlows.push({ x: z.x, y: z.y, z: 14, r: 34, color: "#7a3ab0", a: .5 });
          for (let i = 0; i < 2; i++) { const a = rr(0, TAU), d = rr(z.r * .6, z.r * 1.3); this.fx.add({ t: "dot", ramp: "violet", x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d, z: rr(0, 20), orbit: { x: z.x, y: z.y, z: 14 }, spin: 4, pull: 60, life: .8, lvl: 8 }); }
        } else if (z.k === "tornado" || z.k === "ult-tornado") {
          const big = z.k === "ult-tornado";
          this.tornado(list, z.x, z.y, big ? 70 : 26, big ? 140 : 56, big ? 150 : 60, T, z.t > z.d - .5 ? (z.d - z.t) * 2 : 1);
        } else if (z.k === "flame-ring") {
          const r = z.r * Math.min(1, u);
          for (let i = 0; i < 10; i++) { const a = rr(0, TAU); this.fx.add({ t: "puff", ramp: "fire", x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r, z: 2, vz: rr(20, 50), r0: 2, r1: 4, lvl: 9, life: .35 }); }
        }
      }
    }
    if (this.ultTornado) { const u = this.ultTornado; this.tornado(list, u.x, u.y, u.r, u.h, u.n, T, 1); }
    if (this.ultObj) {
      const o = this.ultObj;
      push(o.x, o.y, (g) => {
        if (o.m) this.sprite(g, model(o.m), Math.floor(T * 8), o.f, o.x, o.y, o.z);
        else { const [sx, sy] = this.proj(o.x, o.y, o.z), r = Math.round(o.orb), s = puff("shadow", r, 2); g.drawImage(s, Math.round(sx - r), Math.round(sy - r)); g.strokeStyle = "#c878ff"; g.beginPath(); g.arc(Math.round(sx) + .5, Math.round(sy) + .5, r + 1, 0, TAU); g.stroke(); }
      });
    }
    // 立ち上がる氷柱など
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i]; p.age += dt;
      if (p.age >= p.life) { this.props.splice(i, 1); continue; }
      if (p.age < 0) continue;
      const m = model(p.m), rise = Math.min(1, p.age / .12), sink = Math.max(0, (p.age - p.life + .3) / .3);
      push(p.x, p.y, (g) => {
        const [, gy] = this.proj(p.x, p.y, 0), h = m.frames[0].d;
        g.save(); g.beginPath(); g.rect(0, 0, this.W, Math.round(gy) + 3); g.clip();
        this.sprite(g, m, 0, p.f, p.x, p.y, -h * ((1 - rise) + sink) * (p.scale || 1));
        g.restore();
      });
      if (p.m === "crystal" && rise < 1 && (i & 3) === 0) this.frameGlows.push({ x: p.x, y: p.y, z: 10, r: 22, color: "#8fd0ff", a: .3 });
    }
    // 粒子
    for (const p of this.fx.l) {
      const [sx, sy, v] = this.proj(p.x, p.y, p.z);
      if (sx < -20 || sx > this.W + 20 || sy < -40 || sy > this.H + 40) continue;
      list.push({ v: v - .5, d: (g) => drawParticle(g, p, sx, sy, this.sq) });
      if (p.t === "puff" && p.lvl > 6 && p.age < p.life * .5 && (p.ramp === "fire" || p.ramp === "holy")) this.frameGlows.push({ x: p.x, y: p.y, z: p.z, r: p.r1 * 3, color: p.ramp === "fire" ? "#ff8a2a" : "#fff09a", a: .12 });
    }
  }
  markSeen(me) {
    if (!me || !this.seen || (this.seenN = (this.seenN || 0) + 1) % 6) return;
    const M = this.M, tx = Math.floor(me.x / TILE), ty = Math.floor(me.y / TILE);
    for (let y = ty - 8; y <= ty + 8; y++) for (let x = tx - 10; x <= tx + 10; x++) if (x >= 0 && y >= 0 && x < M.W && y < M.H) this.seen[y * M.W + x] = 1;
  }
  collectDungeon(list, S, T, dt, push) {
    const W = this.W, H = this.H, me = S?.pl.find((p) => p.id === this.selfId);
    const [mx, my] = me ? this.proj(me.x, me.y, 0) : [-999, -999];
    for (const [x, y] of this.walls) {
      const [sx, sy, v] = this.proj(x, y, 0);
      if (sx < -20 || sx > W + 20 || sy < -10 || sy > H + 30) continue;
      // 手前の壁がキャラを隠すときは透かす
      const fade = me && sy > my - 2 && sy < my + 44 && Math.abs(sx - mx) < 26 ? .35 : 1;
      list.push({ v, d: (g) => this.sprite(g, this.wallM, 0, 0, x, y, 0, fade) });
    }
    for (const [x, y, ph] of this.torches) {
      const [sx, sy] = this.proj(x, y, 0); if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 40) continue;
      const fl = .8 + .2 * Math.sin(T * 11 + ph) * Math.sin(T * 7 + ph);
      push(x, y + 1, (g) => { const [px, py] = this.proj(x, y, 20); g.fillStyle = "#ffe26b"; g.fillRect(Math.round(px), Math.round(py) - 2, 1, 2); g.fillStyle = "#ff8a2a"; g.fillRect(Math.round(px) - 1, Math.round(py), 3, 1); g.fillStyle = "#5a3018"; g.fillRect(Math.round(px), Math.round(py) + 1, 1, 3); });
      this.frameGlows.push({ x, y: y + 4, z: 18, r: 44 * fl, color: "#ff9a3c", a: .55 });
      if (Math.random() < dt * 3) this.fx.add({ t: "dot", ramp: "fire", x, y, z: 21, vz: 18, vx: rr(-3, 3), life: .6, lvl: 8 });
    }
    if (!S) return;
    for (const [id, x, y, open] of S.ch) {
      push(x, y, (g) => { this.shadowAt(g, x, y, 8, .7); this.sprite(g, model("chest"), open ? 1 : 0, Math.PI / 2, x, y, 0); });
      if (!open) this.frameGlows.push({ x, y, z: 6, r: 16 + Math.sin(T * 4) * 2, color: "#ffd060", a: .35 });
    }
    for (const [id, k, x, y, b, r] of S.it) {
      const bob = 4 + Math.sin(T * 3 + id) * 1.5, col = k === "pot" ? "#ff4a5a" : RARITY[r].color;
      push(x, y, (g) => { this.shadowAt(g, x, y, 4, .5); this.sprite(g, model("item", k === "pot" ? "pot" : b), 0, T * 1.6 + id, x, y, bob); });
      this.frameGlows.push({ x, y, z: 6, r: 14 + r * 3, color: col, a: .5 });
      if (k !== "pot" && r >= 2) for (let z = 10; z < 30 + r * 10; z += 8) this.frameGlows.push({ x, y, z, r: 6, color: col, a: .25 });
    }
    if (S.gate) {
      const [x, y, gT] = S.gate;
      push(x, y, (g) => {
        // 縦に立つ光の輪
        for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 72; i++) {
          const a = i / 72 * TAU + T * (2 + ring), R = 15 - ring * 4, [sx, sy] = this.proj(x, y, 22 + Math.sin(a) * R * 1.3);
          g.fillStyle = ring === 2 ? "#ffffff" : i % 3 ? "#c878ff" : "#fff6c4"; g.fillRect(Math.round(sx + Math.cos(a) * R), Math.round(sy), 2, 2);
        }
      });
      this.frameGlows.push({ x, y, z: 18, r: 40 + gT * 30, color: "#c878ff", a: .7 }, { x, y, z: 2, r: 30, color: "#fff6c4", a: .4 });
      if (Math.random() < .6) this.fx.add({ t: "glint", ramp: "violet", x: x + rr(-14, 14), y: y + rr(-4, 4), z: rr(0, 10), vz: rr(20, 50), life: .9, lvl: 9 });
    }
    for (const u of S.su) {
      const m = model("su_" + u.k);
      push(u.x, u.y, (g) => { this.shadowAt(g, u.x, u.y, u.k === "golem" ? 8 : 4, .6); this.sprite(g, m, Math.floor(T * 6), u.f, u.x, u.y, u.z); });
      this.frameGlows.push({ x: u.x, y: u.y, z: u.z + 6, r: u.k === "wisp" ? 18 : 12, color: u.k === "wisp" ? "#fff09a" : "#ff8ad8", a: u.k === "wisp" ? .6 : .3 });
    }
  }
  tornado(list, x, y, r, h, n, T, a) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const hh = (i / n) * h, ang = T * 7 + i * 2.39996, rad = r * (.25 + .75 * hh / h) * (.8 + .2 * Math.sin(i * 1.7 + T * 3));
      const px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
      pts.push([px, py, hh, i]);
    }
    const [, , v] = this.proj(x, y, 0);
    list.push({ v, d: (g) => {
      g.globalAlpha = a;
      for (const [px, py, pz, i] of pts) {
        const [sx, sy] = this.proj(px, py, pz);
        g.fillStyle = RAMPS.wind[4 + (i % 6)];
        g.fillRect(Math.round(sx), Math.round(sy), i % 5 ? 1 : 2, 1);
      }
      g.globalAlpha = 1;
    } });
    this.frameGlows.push({ x, y, z: h * .4, r: r * 1.2, color: "#45c878", a: .3 * a });
  }
  iceBlock(g, x, y, r) {
    const [sx, sy] = this.proj(x, y, 0), w = Math.round(r * 2.2), hgt = Math.round(r * 2.6);
    g.globalAlpha = .45; g.fillStyle = "#a8e0ff"; g.fillRect(Math.round(sx - w / 2), Math.round(sy - hgt), w, hgt);
    g.globalAlpha = .9; g.fillStyle = "#f2fbff"; g.fillRect(Math.round(sx - w / 2), Math.round(sy - hgt), w, 1); g.fillRect(Math.round(sx - w / 2), Math.round(sy - hgt), 1, hgt);
    g.globalAlpha = 1;
  }
  drawBolts(g, dt) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.age += dt;
      if (b.age >= b.life) { this.bolts.splice(i, 1); continue; }
      const pts = b.pts.map((p) => this.proj(p[0], p[1], p[2]));
      for (let pass = 0; pass < 2; pass++) {
        g.fillStyle = b.col ? (pass ? "#ffffff" : b.col) : pass ? "#ffffff" : b.age < b.life * .5 ? "#fff27a" : "#a8a8ff";
        const w = pass ? 1 : 1 + b.w;
        for (let j = 1; j < pts.length; j++) {
          const [x0, y0] = pts[j - 1], [x1, y1] = pts[j], n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
          for (let k = 0; k <= n; k++) g.fillRect(Math.round(x0 + (x1 - x0) * k / n - (w - 1) / 2), Math.round(y0 + (y1 - y0) * k / n), w, 1);
        }
      }
    }
  }
  drawGlows(g, dt) {
    g.globalCompositeOperation = "lighter"; g.imageSmoothingEnabled = true;
    const one = (o, a) => { const [sx, sy] = this.proj(o.x, o.y, o.z), s = glowSprite(o.color), r = o.r; g.globalAlpha = Math.min(1, a); g.drawImage(s, sx - r, sy - r * .8, r * 2, r * 1.6); };
    for (const o of this.frameGlows) one(o, o.a);
    for (let i = this.glows.length - 1; i >= 0; i--) { const o = this.glows[i]; o.age += dt; if (o.age >= o.life) { this.glows.splice(i, 1); continue; } one(o, o.a * (1 - o.age / o.life)); }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.imageSmoothingEnabled = false;
  }
  drawOverheads(g, S) {
    if (!S || this.cut) return;
    for (const p of S.pl) {
      if (p.dn) continue;
      const [sx, sy] = this.proj(p.x, p.y, 30);
      if (p.id !== this.selfId) {
        g.fillStyle = p.c; g.fillRect(Math.round(sx) - 1, Math.round(sy) - 2, 3, 1); g.fillRect(Math.round(sx), Math.round(sy) - 1, 1, 1);
      }
      const w = 14, f = Math.max(0, p.hp / p.mh);
      g.fillStyle = "#140a14"; g.fillRect(Math.round(sx - w / 2) - 1, Math.round(sy) - 6, w + 2, 3);
      g.fillStyle = f > .35 ? "#45c878" : "#ff4a5a"; g.fillRect(Math.round(sx - w / 2), Math.round(sy) - 5, Math.round(w * f), 1);
    }
    for (const m of S.mi) {
      if (m.hp >= 1) continue;
      const [sx, sy] = this.proj(m.x, m.y, m.z + 16);
      g.fillStyle = "#140a14"; g.fillRect(Math.round(sx) - 6, Math.round(sy), 12, 3);
      g.fillStyle = "#ff6a5a"; g.fillRect(Math.round(sx) - 5, Math.round(sy) + 1, Math.round(10 * m.hp), 1);
    }
  }
}
