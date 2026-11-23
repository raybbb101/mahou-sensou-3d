// このゲームのオリジナルのボクセルモデル。最初に使われたときに焼く。
import { Vol, bake, Model, rampFrom, vnoise, hash3, hex } from "./voxel.js";

const frames = (n, fn) => Array.from({ length: n }, (_, f) => bake(fn(f, n)));
const wing = (V, cx, cy, side, x0, x1, span, z, flap, mat, tip) => {
  // 板状の翼。side = ±1、flap で根元から先端へ傾く
  V.region([x0 - 1, x1 + 1, side > 0 ? cy : cy - span - 1, side > 0 ? cy + span + 1 : cy, 0, V.d], (x, y, zz) => {
    const s = (y - cy) * side; if (s < 2 || s > span) return false;
    const u = s / span, xl = x0 + (x1 - x0) * u * .55, xr = x1 - (x1 - x0) * u * .15;
    if (x < xl || x > xr) return false;
    const zc = z + flap * s * .45 + Math.sin(u * 3) * .6;
    return Math.abs(zz - zc) < 1.1;
  }, (x, y) => (tip && Math.abs(y - cy) > span * .78 ? tip : mat));
};

const B = {
  mage(color) {
    const robe = rampFrom("robe" + color, color), hat = rampFrom("hat", "#3a2c5c");
    return new Model(frames(3, (f) => {
      const V = new Vol(14, 14, 24), c = 7, sw = f === 1 ? .9 : 0;
      V.cone(c + sw, c, 0, c, c, 11, 4.8, 3, robe);
      V.paint((x, y, z) => z < 1.6, hat);
      V.ell(c, c, 11.5, 3, 3.3, 2.3, robe);
      V.paint((x, y, z) => z > 8.6 && z < 9.7, "gold");
      V.ell(c + .4, c, 14.2, 2.5, 2.5, 2.6, "skin");
      V.put(c + 2.8, c - 1, 14, "black"); V.put(c + 2.8, c + 1, 14, "black");
      V.cyl(c, c, 5.6, 16, 17, hat);
      V.cone(c, c, 16, c - 3, c, 23.8, 3.6, .5, hat);
      V.torus(c, c, 17.3, 3.3, .65, robe);
      if (f === 2) { V.seg(c + 1, c + 4.6, 4, c + 5.5, c + 4.6, 17, .75, "wood"); V.ell(c + 5.8, c + 4.6, 18, 1.4, 1.4, 1.4, "e_cyan"); V.ell(c + 3.6, c + 3.8, 10.5, 1.3, 1.3, 1.3, "skin"); }
      else { V.seg(c + .5, c + 4.6, 1, c + 1, c + 4.6, 17, .75, "wood"); V.ell(c + 1, c + 4.6, 18, 1.4, 1.4, 1.4, "e_cyan"); V.ell(c + 1.4, c + 3.8, 9.5, 1.3, 1.3, 1.3, "skin"); }
      return V;
    }), { buckets: 32 });
  },

  golem() {
    return new Model(frames(2, (f) => {
      const V = new Vol(34, 34, 31), c = 17, a = f ? 1 : 0;
      V.cyl(c - 1, c - 6, 3.6, 0, 9, "stone"); V.cyl(c - 1, c + 6, 3.6, 0, 9, "stone");
      V.ell(c, c, 15, 9, 12, 9, "stone");
      V.ell(c + 5, c, 23.5, 5, 5.5, 4.5, "stone");
      V.ell(c + 2, c - 12.5, 14 + a, 4.5, 4, 7, "stone"); V.ell(c + 2, c + 12.5, 14 - a, 4.5, 4, 7, "stone");
      V.ell(c + 5, c - 13, 6 + a, 4, 4, 4, "rock"); V.ell(c + 5, c + 13, 6 - a, 4, 4, 4, "rock");
      V.paint((x, y, z) => z > 17 && vnoise(x * .3, y * .3, z * .3, 2) > .42, "moss");
      V.box(c + 9, c - 3, 23, c + 11, c - 1, 25, "e_green"); V.box(c + 9, c + 1, 23, c + 11, c + 3, 25, "e_green");
      V.paint((x, y, z) => x > c + 7.4 && Math.abs(y - c) < 1.3 && z > 11 && z < 19, "e_green");
      return V;
    }), { buckets: 32 });
  },
  slime() {
    return new Model(frames(2, (f) => {
      const V = new Vol(36, 36, 28), c = 18, k = f ? 1.06 : 1, kz = f ? .9 : 1;
      V.region([0, 36, 0, 36, 0, 28], (x, y, z) => ((x - c) / (15 * k)) ** 2 + ((y - c) / (15 * k)) ** 2 + ((z - 9 * kz) / (10 * kz)) ** 2 <= 1 && z >= 0, "slime");
      V.paint((x, y, z) => hash3(x, y, z, 5) > .93, "ice");
      V.ell(c + 12, c - 4, 12 * kz, 1.8, 1.8, 2.2, "black"); V.ell(c + 12, c + 4, 12 * kz, 1.8, 1.8, 2.2, "black");
      V.put(c + 13.5, c - 4, 13 * kz, "white"); V.put(c + 13.5, c + 4, 13 * kz, "white");
      const top = 19 * kz;
      V.torus(c, c, top, 5, 1, "gold");
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; V.cone(c + Math.cos(a) * 5, c + Math.sin(a) * 5, top, c + Math.cos(a) * 5.5, c + Math.sin(a) * 5.5, top + 4.5, 1.2, .3, "gold"); }
      V.ell(c + 5, c, top + .5, 1.3, 1.3, 1.3, "e_red");
      return V;
    }), { buckets: 32 });
  },
  salamander() {
    return new Model(frames(2, (f) => {
      const V = new Vol(46, 24, 17), cy = 12, s = f ? 1 : -1;
      V.ell(24, cy, 6.5, 10, 5.2, 4.2, "red");
      V.ell(36, cy, 7.5, 5.2, 4.2, 3.6, "red"); V.ell(40, cy, 6, 3.6, 3, 2, "red");
      for (let i = 0; i < 6; i++) { const t = i / 5; V.seg(15 - t * 12, cy + Math.sin(t * 3) * 3 * s, 6 - t * 2.5, 15 - (t + .2) * 12, cy + Math.sin((t + .2) * 3) * 3 * s, 6 - (t + .2) * 2.5, 3 - t * 2, "red"); }
      for (const [x, y] of [[30, -1], [30, 1], [18, -1], [18, 1]]) V.seg(x, cy + y * 4, 4, x + y * s * 2, cy + y * 8, 0, 1.4, "red");
      V.paint((x, y, z) => z < 4.5, "orange");
      for (let x = 15; x <= 33; x += 3) V.cone(x, cy, 9.5, x - 1.5, cy, 12.5 + ((x / 3) % 2) * 2 + s * .5, 1.6, .3, x % 2 ? "e_fire2" : "e_fire");
      V.put(39, cy - 3, 9, "e_yellow"); V.put(39, cy + 3, 9, "e_yellow");
      return V;
    }), { buckets: 48 });
  },
  iceknight() {
    return new Model(frames(2, (f) => {
      const V = new Vol(26, 26, 35), c = 13, s = f ? 1 : 0;
      V.cyl(c - s, c - 3, 2.2, 0, 10, "steel"); V.cyl(c + s, c + 3, 2.2, 0, 10, "steel");
      V.ell(c, c, 15.5, 5, 6, 7, "steel");
      V.paint((x, y, z) => x > c + 3 && z > 11 && z < 20, "ice");
      V.box(c - 6, c - 5, 5, c - 4, c + 5, 21, "navy");
      V.ell(c, c, 24, 4, 4, 4.6, "steel");
      V.box(c + 3, c - 2.5, 24, c + 5, c + 2.5, 25, "e_ice");
      V.cone(c, c - 3, 26, c - 2, c - 6, 31, 1.2, .3, "ice"); V.cone(c, c + 3, 26, c - 2, c + 6, 31, 1.2, .3, "ice");
      V.ell(c, c - 7.5, 19, 2.4, 2, 2.4, "steel"); V.ell(c, c + 7.5, 19, 2.4, 2, 2.4, "steel");
      V.box(c - 1, c - 10, 7, c + 5, c - 8, 22, "ice"); V.paint((x, y, z) => y < c - 7.6 && Math.abs(z - 14.5) < .6, "e_ice");
      V.seg(c + 2, c + 9, 10, c + 12, c + 9, 23, 1, "e_ice"); V.seg(c + 1, c + 7, 12, c + 3, c + 11, 12, .7, "gold");
      return V;
    }), { buckets: 32 });
  },
  raven() {
    return new Model(frames(2, (f) => {
      const V = new Vol(30, 46, 18), cy = 23, fl = f ? .5 : -.35;
      V.ell(14, cy, 8, 8, 5, 4.5, "black");
      V.ell(21, cy, 10, 4, 3.5, 3.5, "black");
      V.cone(24, cy, 10, 29, cy, 9, 1.6, .3, "gold");
      V.put(23, cy - 2.5, 11, "e_yellow"); V.put(23, cy + 2.5, 11, "e_yellow");
      wing(V, 14, cy, -1, 9, 20, 21, 8, fl, "navy", "black"); wing(V, 14, cy, 1, 9, 20, 21, 8, fl, "navy", "black");
      V.paint((x, y, z) => Math.abs(y - cy) > 6 && hash3(x, y, 0, 7) > .86, "e_yellow");
      V.box(1, cy - 3, 6, 7, cy + 3, 8, "navy");
      return V;
    }), { buckets: 48 });
  },
  necro() {
    return new Model(frames(2, (f) => {
      const V = new Vol(22, 22, 33), c = 11, s = f ? .6 : 0;
      V.cone(c, c, 0, c, c, 19, 7, 4, "dark");
      V.paint((x, y, z) => z < 2.5 || (z > 16 && z < 17.5), "purp");
      V.ell(c - .5, c, 21.5, 4.3, 4.5, 4.5, "dark");
      V.ell(c + .8, c, 21.5, 3.4, 3.4, 3.8, "bone");
      V.put(c + 3.8, c - 1.3, 22, "e_violet"); V.put(c + 3.8, c + 1.3, 22, "e_violet");
      V.ell(c + 2, c - 5.5, 13, 1.5, 1.5, 1.5, "bone");
      V.seg(c + 2, c + 6.5, 0, c + 2.5, c + 6.5, 28, .8, "bone");
      V.ell(c + 2.5, c + 6.5, 29.5 + s, 2.3, 2.3, 2.3, "e_violet");
      V.ell(c + 2, c + 5.5, 13, 1.5, 1.5, 1.5, "bone");
      return V;
    }), { buckets: 32 });
  },
  mech() {
    return new Model(frames(2, (f) => {
      const V = new Vol(40, 40, 23), c = 20;
      V.ell(c, c, 11, 10, 9, 5.5, "metal"); V.ell(c - 1, c, 15, 6, 6, 4, "steel");
      V.ell(c + 9, c, 11, 2.6, 2.6, 2.6, "e_cyan");
      V.paint((x, y, z) => Math.abs(z - 10.5) < .55 && Math.abs(y - c) > 5, "e_cyan");
      for (let i = 0; i < 6; i++) {
        const a = (i + .5) / 6 * Math.PI * 2, up = (i + f) % 2 ? 1.8 : 0;
        const kx = c + Math.cos(a) * 14, ky = c + Math.sin(a) * 14;
        V.seg(c + Math.cos(a) * 7, c + Math.sin(a) * 7, 10, kx, ky, 16 + up, 1.3, "metal");
        V.seg(kx, ky, 16 + up, c + Math.cos(a) * 18.5, c + Math.sin(a) * 18.5, up * .5, 1.1, "steel");
      }
      return V;
    }), { buckets: 32 });
  },
  angel() {
    return new Model(frames(2, (f) => {
      const V = new Vol(26, 46, 35), cx = 13, cy = 23, fl = f ? .35 : -.15;
      V.cone(cx, cy, 0, cx, cy, 18, 5.5, 3, "white");
      V.paint((x, y, z) => z < 1.5, "gold");
      V.ell(cx, cy, 19, 3, 3.6, 4, "white");
      V.ell(cx + .5, cy, 25, 2.8, 2.8, 3, "skin");
      V.ell(cx - .8, cy, 26, 3, 3.2, 2.8, "gold");
      V.torus(cx, cy, 31, 3.6, .6, "e_yellow");
      wing(V, cx - 2, cy, -1, 3, 12, 21, 20, .3 + fl, "white", "crimson"); wing(V, cx - 2, cy, 1, 3, 12, 21, 20, .3 + fl, "white", "crimson");
      V.seg(cx + 3, cy + 4, 10, cx + 10, cy + 4, 24, .7, "e_yellow");
      return V;
    }), { buckets: 48 });
  },
  drake() {
    return new Model(frames(2, (f) => {
      const V = new Vol(54, 42, 33), cy = 21, s = f ? 1 : -1;
      V.ell(24, cy, 12, 13, 9, 8, "lava");
      V.seg(33, cy, 15, 42, cy, 22, 3.6, "lava");
      V.ell(45, cy, 23, 5.5, 4.2, 3.6, "lava"); V.ell(50, cy, 21, 3, 3, 2, "lava");
      V.cone(43, cy - 3, 26, 38, cy - 5, 31, 1.2, .3, "bone"); V.cone(43, cy + 3, 26, 38, cy + 5, 31, 1.2, .3, "bone");
      for (let i = 0; i < 6; i++) { const t = i / 6; V.seg(12 - t * 11, cy + Math.sin(t * 3) * 4 * s, 10 - t * 6, 12 - (t + .17) * 11, cy + Math.sin((t + .17) * 3) * 4 * s, 10 - (t + .17) * 6, 4 - t * 2.6, "lava"); }
      for (const [x, y] of [[32, -1], [32, 1], [16, -1], [16, 1]]) V.seg(x, cy + y * 6, 6, x, cy + y * 8, 0, 2.6, "lava");
      wing(V, 26, cy, -1, 16, 32, 19, 19, .25, "crimson"); wing(V, 26, cy, 1, 16, 32, 19, 19, .25, "crimson");
      V.paint((x, y, z) => z < 7 && Math.abs(y - cy) < 8, "orange");
      V.paint((x, y, z) => vnoise(x * .35, y * .35, z * .35, 4) > .66, "e_lava");
      V.put(48, cy - 3, 25, "e_yellow"); V.put(48, cy + 3, 25, "e_yellow");
      return V;
    }), { buckets: 48 });
  },
  warlord() {
    return new Model(frames(2, (f) => {
      const V = new Vol(30, 30, 37), c = 15, s = f ? 1 : 0;
      V.cone(c, c, 0, c, c, 20, 7, 4.5, "black");
      V.paint((x, y, z) => z < 2 || (z > 9 && z < 10.2), "gold");
      V.box(c - 7, c - 6, 3, c - 5, c + 6, 24, "crimson");
      V.ell(c, c, 21.5, 4.5, 5.5, 5, "black");
      V.ell(c, c - 6, 24, 3, 2.6, 2.4, "gold"); V.ell(c, c + 6, 24, 3, 2.6, 2.4, "gold");
      V.ell(c + .5, c, 28.5, 3, 3, 3.3, "black");
      V.box(c + 2.6, c - 2, 28.5, c + 4, c + 2, 29.5, "e_pink");
      V.cyl(c, c, 3.4, 31, 32.5, "gold");
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; V.cone(c + Math.cos(a) * 3, c + Math.sin(a) * 3, 32, c + Math.cos(a) * 3.2, c + Math.sin(a) * 3.2, 35.5, .9, .2, "gold"); }
      V.ell(c + 5, c - 11, 17 + s, 2.6, 2.6, 2.6, "e_violet"); V.ell(c + 5, c + 11, 18 - s, 2.6, 2.6, 2.6, "e_pink");
      return V;
    }), { buckets: 32 });
  },

  m_slime() {
    return new Model(frames(2, (f) => {
      const V = new Vol(14, 14, 10), c = 7, k = f ? 1.1 : 1, kz = f ? .85 : 1;
      V.region([0, 14, 0, 14, 0, 10], (x, y, z) => ((x - c) / (5.5 * k)) ** 2 + ((y - c) / (5.5 * k)) ** 2 + ((z - 3.6 * kz) / (4.2 * kz)) ** 2 <= 1, "slime");
      V.put(c + 4.5, c - 2, 4 * kz, "black"); V.put(c + 4.5, c + 1, 4 * kz, "black");
      return V;
    }), { buckets: 16 });
  },
  m_skull() {
    return new Model(frames(2, (f) => {
      const V = new Vol(12, 12, 16), c = 6;
      V.cone(c - 1, c, 1 + f, c, c, 6, .4, 2.6, "e_violet");
      V.ell(c, c, 9.5, 4, 3.8, 3.8, "bone");
      V.box(c + 1, c - 2, 5, c + 4, c + 2, 7, "bone");
      V.put(c + 3.5, c - 1.6, 10, "e_violet"); V.put(c + 3.5, c + 1.6, 10, "e_violet");
      return V;
    }), { buckets: 16 });
  },
  m_bat() {
    return new Model(frames(2, (f) => {
      const V = new Vol(12, 24, 8), c = 6, cy = 12;
      V.ell(c, cy, 4, 3, 2.6, 2.6, "dark");
      wing(V, c, cy, -1, 2, 9, 10, 4, f ? .5 : -.4, "purp"); wing(V, c, cy, 1, 2, 9, 10, 4, f ? .5 : -.4, "purp");
      V.put(c + 2.5, cy - 1, 5, "e_red"); V.put(c + 2.5, cy + 1, 5, "e_red");
      return V;
    }), { buckets: 16 });
  },

  // ── 魔法の弾 ──
  p_fireball() {
    return new Model(frames(4, (f) => {
      const V = new Vol(16, 10, 10), cy = 5, cz = 5;
      V.region([0, 16, 0, 10, 0, 10], (x, y, z) => {
        const dx = x - 11, r = Math.hypot(dx, y - cy, z - cz), t = Math.max(0, -dx / 10);
        const n = vnoise(x * .5 + f * 2, y * .5, z * .5, 11);
        const dens = Math.max(1 - r / 3.6, x < 11.5 ? 1 - Math.hypot(y - cy, z - cz - t * 1.5) / (3.4 * (1 - t)) : -1) + (n - .5) * .7;
        return dens > 0;
      }, (x, y, z) => {
        const h = 1 - Math.hypot(x - 11, y - cy, z - cz) / 6 + (vnoise(x * .6, y * .6, z * .6 + f, 3) - .5) * .4;
        return h > .62 ? "e_white" : h > .42 ? "e_fire" : h > .18 ? "e_fire2" : "e_fire3";
      });
      return V;
    }), { buckets: 24, outline: "#3a0c0c" });
  },
  p_ice() {
    return new Model([bake((() => { const V = new Vol(14, 6, 6); V.cone(13, 3, 3, 5, 3, 3, .3, 2.3, "ice"); V.cone(5, 3, 3, 1, 3, 3, 2.3, .4, "ice"); V.seg(11, 3, 3, 3, 3, 3, .6, "e_ice"); return V; })())], { buckets: 24, outline: "#0c1a30" });
  },
  p_holy() {
    return new Model([bake((() => { const V = new Vol(16, 6, 6); V.seg(1, 3, 3, 11, 3, 3, .7, "e_yellow"); V.cone(11, 3, 3, 15, 3, 3, 2, .2, "e_white"); V.box(1, 1, 2, 4, 5, 4, "gold"); return V; })())], { buckets: 24, outline: "#4a3a10" });
  },
  p_shadow() {
    return new Model(frames(2, (f) => { const V = new Vol(12, 12, 12); V.ell(6, 6, 6, 4.6, 4.6, 4.6, "black"); V.paint((x, y, z) => vnoise(x * .6 + f * 3, y * .6, z * .6, 2) > .58, "e_violet"); return V; }), { buckets: 16, outline: "#3a1060" });
  },
  p_wind() {
    return new Model([bake((() => { const V = new Vol(14, 14, 4); V.region([0, 14, 0, 14, 0, 4], (x, y, z) => { const r = Math.hypot(x - 7, y - 7); return r > 3.4 && r < 6.2 && x > 5 && z > 1 && z < 3; }, (x, y) => (Math.hypot(x - 7, y - 7) > 5.2 ? "e_green" : "green")); return V; })())], { buckets: 32, outline: "#0a3020" });
  },
  p_rock() {
    return new Model(frames(2, (f) => { const V = new Vol(16, 16, 16); V.region([0, 16, 0, 16, 0, 16], (x, y, z) => Math.hypot(x - 8, y - 8, z - 8) < 6.4 + (vnoise(x * .4, y * .4, z * .4, 6) - .5) * 3, "rock"); V.paint((x, y, z) => vnoise(x * .5, y * .5, z * .5 + f * 3, 8) > .6, f ? "e_fire2" : "e_lava"); return V; }), { buckets: 16 });
  },
  p_meteor_big() {
    return new Model(frames(2, (f) => { const V = new Vol(34, 34, 34), c = 17; V.region([0, 34, 0, 34, 0, 34], (x, y, z) => Math.hypot(x - c, y - c, z - c) < 14 + (vnoise(x * .2, y * .2, z * .2, 6) - .5) * 6, "rock"); V.paint((x, y, z) => vnoise(x * .3, y * .3, z * .3 + f * 2, 8) > .56 || z < 12, (x, y, z) => (z < 9 ? "e_fire" : z < 13 ? "e_fire2" : "e_lava")); return V; }), { buckets: 16 });
  },


  // ── 迷宮モードのキャラクター(色 = プレイヤーの色) ──
  knight(color) {
    const cape = rampFrom("robe" + color, color);
    return new Model(frames(3, (f) => {
      const V = new Vol(16, 16, 22), c = 8, sw = f === 1 ? .9 : 0;
      V.cyl(c - sw, c - 2, 1.6, 0, 7, "steel"); V.cyl(c + sw, c + 2, 1.6, 0, 7, "steel");
      V.ell(c, c, 10, 3.4, 4, 4.4, "steel");
      V.box(c - 4.5, c - 4, 4, c - 3, c + 4, 13, cape);
      V.ell(c, c - 4.6, 12, 1.8, 1.6, 1.8, "steel"); V.ell(c, c + 4.6, 12, 1.8, 1.6, 1.8, "steel");
      V.ell(c + .3, c, 16.5, 2.9, 2.9, 3.1, "steel");
      V.box(c + 2.2, c - 2, 16, c + 3.4, c + 2, 17, "black");
      V.cone(c - .5, c, 19, c - 3, c, 21.5, 1.3, .3, cape);
      V.box(c - 1, c - 7.5, 4, c + 3, c - 6, 13, cape); V.paint((x, y, z) => y < c - 5.9 && Math.abs(z - 8.5) < .7, "gold");
      if (f === 2) V.seg(c + 2, c + 5, 10, c + 8, c + 5, 11, .7, "white"); else V.seg(c + 1, c + 5, 8, c + 2.5, c + 5, 17, .7, "white");
      V.ell(c + 1, c + 4.8, 9, 1.1, 1.1, 1.1, "gold");
      return V;
    }), { buckets: 32 });
  },
  archer(color) {
    const cl = rampFrom("robe" + color, color);
    return new Model(frames(3, (f) => {
      const V = new Vol(16, 16, 20), c = 8, sw = f === 1 ? .9 : 0;
      V.cyl(c - sw, c - 1.8, 1.4, 0, 7, "wood"); V.cyl(c + sw, c + 1.8, 1.4, 0, 7, "wood");
      V.ell(c, c, 10, 2.8, 3.4, 4, "green");
      V.ell(c - .5, c, 12, 3.2, 3.8, 2.4, cl);
      V.ell(c + .4, c, 15.5, 2.5, 2.5, 2.6, "skin");
      V.ell(c - .5, c, 16.5, 3, 3, 3, cl); V.cone(c - 1, c, 17, c - 4.5, c, 19.5, 1.6, .3, cl);
      V.region([0, 16, 0, 16, 0, 20], (x, y, z) => x > c + 1.5 && Math.abs(y - c) < 2.4 && z > 14 && z < 16.6, "");
      V.put(c + 2, c - 1, 15.5, "black"); V.put(c + 2, c + 1, 15.5, "black");
      V.box(c - 4, c + 1, 9, c - 2.5, c + 3, 16, "wood");
      const bx = f === 2 ? c + 5 : c + 3;
      V.region([0, 16, 0, 16, 0, 20], (x, y, z) => Math.abs(Math.hypot(x - bx + 3, z - 11) - 4.5) < .7 && x > bx - 1 && Math.abs(y - (c - 4)) < .6, "wood");
      return V;
    }), { buckets: 32 });
  },
  summoner(color) {
    const robe = rampFrom("robe" + color, color);
    return new Model(frames(3, (f) => {
      const V = new Vol(16, 16, 24), c = 8, sw = f === 1 ? .8 : 0;
      V.cone(c + sw, c, 0, c, c, 12, 4.6, 2.8, robe);
      V.paint((x, y, z) => (z > 4 && z < 5) || z < 1.2, "pink");
      V.ell(c, c, 12.5, 3, 3.3, 2.3, robe);
      V.ell(c + .4, c, 15.5, 2.5, 2.5, 2.6, "skin");
      V.ell(c - .6, c, 16.5, 3, 3.2, 3, "purp");
      V.region([0, 16, 0, 16, 0, 24], (x, y, z) => x > c + 1.4 && Math.abs(y - c) < 2.3 && z > 14 && z < 16.8, "");
      V.put(c + 2.4, c - 1, 15.5, "black"); V.put(c + 2.4, c + 1, 15.5, "black");
      V.cone(c - 1, c - 2, 18, c - 2, c - 3.5, 22, 1, .3, "purp"); V.cone(c - 1, c + 2, 18, c - 2, c + 3.5, 22, 1, .3, "purp");
      V.ell(c + (f === 2 ? 5 : 3), c + 5, 13 + (f % 2), 1.6, 1.6, 1.6, "e_pink");
      V.torus(c + (f === 2 ? 5 : 3), c + 5, 13 + (f % 2), 2.5, .35, "gold");
      return V;
    }), { buckets: 32 });
  },
  su_bat() {
    return new Model(frames(2, (f) => {
      const V = new Vol(12, 22, 8), c = 6, cy = 11;
      V.ell(c, cy, 4, 2.6, 2.3, 2.3, "pink");
      wing(V, c, cy, -1, 2, 9, 9, 4, f ? .5 : -.4, "purp"); wing(V, c, cy, 1, 2, 9, 9, 4, f ? .5 : -.4, "purp");
      V.put(c + 2.2, cy - 1, 5, "e_yellow"); V.put(c + 2.2, cy + 1, 5, "e_yellow");
      return V;
    }), { buckets: 16 });
  },
  su_wisp() {
    return new Model(frames(2, (f) => {
      const V = new Vol(10, 16, 8), c = 5, cy = 8;
      V.ell(c, cy, 4, 2.4, 2.4, 2.4, "e_white"); V.ell(c, cy, 4, 3, 3, 3, (x, y, z) => (Math.hypot(x - c, y - cy, z - 4) > 2.4 ? "e_yellow" : undefined));
      wing(V, c, cy, -1, 1, 7, 7, 4, f ? .6 : -.2, "e_ice"); wing(V, c, cy, 1, 1, 7, 7, 4, f ? .6 : -.2, "e_ice");
      return V;
    }), { buckets: 16, outline: "#3a3010" });
  },
  su_golem() {
    return new Model(frames(2, (f) => {
      const V = new Vol(18, 18, 20), c = 9, a = f ? 1 : 0;
      V.cyl(c - 1, c - 3, 2.2, 0, 6, "rock"); V.cyl(c - 1, c + 3, 2.2, 0, 6, "rock");
      V.ell(c, c, 10, 5, 6, 5, "rock");
      V.ell(c + 3, c, 15, 3, 3.2, 2.8, "rock");
      V.ell(c + 1, c - 7, 9 + a, 2.4, 2.2, 4, "rock"); V.ell(c + 1, c + 7, 9 - a, 2.4, 2.2, 4, "rock");
      V.put(c + 5.6, c - 1.3, 15.5, "e_pink"); V.put(c + 5.6, c + 1.3, 15.5, "e_pink");
      V.paint((x, y, z) => x > c + 4 && Math.abs(y - c) < .8 && z > 7 && z < 12, "e_pink");
      return V;
    }), { buckets: 16 });
  },
  chest() {
    return new Model(frames(2, (f) => {
      const V = new Vol(14, 10, 12), c = 7, cy = 5;
      V.box(1, 1, 0, 13, 9, 6, "wood");
      if (!f) { V.region([0, 14, 0, 10, 0, 12], (x, y, z) => x > 1 && x < 13 && Math.hypot(y - cy, z - 6) < 4.2 && z >= 6, "wood"); V.paint((x, y, z) => Math.abs(x - c) < 1 && z > 4, "gold"); }
      else { V.box(1, 1, 6, 13, 2.4, 12, "wood"); V.box(2, 2, 5, 12, 8, 6, "e_yellow"); }
      V.paint((x, y, z) => (x < 2 || x > 12) && z < 7, "gold");
      V.box(c - .8, 8.5, 3, c + .8, 9.6, 5.5, "gold");
      return V;
    }), { buckets: 16 });
  },
  item(base) {
    return new Model([bake((() => {
      const V = new Vol(14, 6, 6), c = 3;
      if (base === "sword") { V.seg(2, c, 3, 13, c, 3, .7, "white"); V.box(3, 1, 2, 4, 5, 4, "gold"); V.seg(0, c, 3, 3, c, 3, .6, "wood"); }
      else if (base === "axe") { V.seg(0, c, 3, 12, c, 3, .6, "wood"); V.box(9, .5, 1, 13, 5.5, 5, "steel"); }
      else if (base === "spear") { V.seg(0, c, 3, 11, c, 3, .5, "wood"); V.cone(11, c, 3, 14, c, 3, 1.4, .2, "white"); }
      else if (base === "bow" || base === "xbow") { V.region([0, 14, 0, 6, 0, 6], (x, y, z) => Math.abs(Math.hypot(x - 7, (y - c) * 2.2) - 5.5) < .8 && x < 9, "wood"); V.seg(7 - 5.5 + 1, c, 3, 7 - 5.5 + 1, c, 3, .3, "white"); if (base === "xbow") V.seg(2, c, 3, 12, c, 3, .6, "steel"); }
      else if (base === "staff") { V.seg(0, c, 3, 11, c, 3, .6, "wood"); V.ell(12, c, 3, 1.6, 1.6, 1.6, "e_cyan"); }
      else if (base === "tome") { V.box(3, .5, 1, 11, 5.5, 5, "crimson"); V.box(3.5, 1, 1.5, 10.5, 5, 4.5, "white"); V.paint((x, y, z) => z > 4.4, "crimson"); }
      else if (base === "orb") { V.ell(7, c, 3, 2.6, 2.6, 2.6, "e_pink"); V.torus(7, c, 3, 3.2, .4, "gold"); }
      else { V.ell(7, c, 2.6, 2.4, 2.4, 2.6, "e_red"); V.box(6, c - 1, 4.5, 8, c + 1, 6, "wood"); }
      return V;
    })())], { buckets: 16 });
  },
  p_arrow() { return new Model([bake((() => { const V = new Vol(14, 4, 4); V.seg(1, 2, 2, 11, 2, 2, .45, "wood"); V.cone(11, 2, 2, 14, 2, 2, 1.2, .2, "white"); V.box(0, .5, 1.5, 3, 3.5, 2.5, "white"); return V; })())], { buckets: 24, outline: "#20140c" }); },
  p_magic() { return new Model(frames(2, (f) => { const V = new Vol(10, 10, 10); V.ell(5, 5, 5, 3.2, 3.2, 3.2, "e_cyan"); V.ell(5.5, 5, 5, 1.8, 1.8, 1.8, "e_white"); if (f) V.paint((x, y, z) => Math.hypot(x - 5, y - 5, z - 5) > 2.6, "e_blue"); return V; }), { buckets: 16, outline: "#0c2040" }); },
  wall(rampName) {
    return new Model([bake((() => {
      const V = new Vol(16, 16, 28);
      V.box(0, 0, 0, 16, 16, 28, rampName);
      // 石積み: 段ごとに目地をずらす
      V.paint((x, y, z) => { const row = Math.floor(z / 6), fz = z % 6, o = row % 2 ? 4 : 0; return fz < 1 || ((Math.floor(x) + o) % 8 === 0 && (y < 1 || y > 15)) || ((Math.floor(y) + o) % 8 === 0 && (x < 1 || x > 15)); }, "dark");
      V.paint((x, y, z) => z < 2, "black");
      V.paint((x, y, z) => z > 26.5, "dark");
      return V;
    })())], { buckets: 32, noOutline: true, px: 8, py: 8 });
  },
  // ── 置物・魔法で出てくる立体 ──
  spike() { return new Model([bake((() => { const V = new Vol(12, 12, 26), c = 6; V.cone(c, c, 0, c, c, 25, 3.8, .3, "ice"); V.cone(c + 1, c - 2, 0, c + 3, c - 4, 9, 1.8, .3, "cryst"); V.cone(c - 1, c + 2, 0, c - 3, c + 4, 11, 1.8, .3, "ice"); return V; })())], { buckets: 16, outline: "#0c1a30" }); },
  crystal() { return new Model([bake((() => { const V = new Vol(16, 16, 40), c = 8; V.cone(c, c, 0, c + 1, c, 39, 5.5, .4, "ice"); V.cone(c + 2, c - 3, 0, c + 5, c - 6, 16, 2.6, .3, "cryst"); V.cone(c - 2, c + 3, 0, c - 5, c + 5, 20, 2.8, .3, "ice"); V.paint((x, y, z) => Math.abs(x - c - .5) < 1 && Math.abs(y - c) < 1, "e_ice"); return V; })())], { buckets: 16, outline: "#0c1a30" }); },
  pillar(rampName) {
    return new Model(frames(3, (f) => {
      const V = new Vol(14, 14, 46), c = 7;
      V.box(1, 1, 0, 13, 13, 3, rampName); V.cyl(c, c, 4.2, 3, 34, rampName); V.box(1.5, 1.5, 34, 12.5, 12.5, 37, rampName);
      V.paint((x, y, z) => z > 3 && z < 34 && (Math.atan2(y - c, x - c) * 8 / Math.PI + 8) % 2 < .5, "black");
      V.torus(c, c, 38.5, 3.6, 1.2, "metal");
      V.cone(c, c, 38, c + (f - 1) * .8, c, 44 + (f % 2), 3, .3, "e_fire2"); V.cone(c, c, 38, c, c, 41.5 + f * .7, 2, .3, "e_fire");
      return V;
    }), { buckets: 16 });
  },
};

const built = new Map();
/** 名前(と色などの引数)からモデルを得る。初回だけ焼く。 */
export function model(name, arg) {
  const key = arg ? name + ":" + arg : name;
  let m = built.get(key);
  if (!m) { m = B[name](arg); built.set(key, m); }
  return m;
}
export const BOSS_MODEL = { golem: "golem", slime: "slime", salamander: "salamander", iceknight: "iceknight", raven: "raven", necro: "necro", mech: "mech", angel: "angel", drake: "drake", warlord: "warlord" };
export const MINION_MODEL = { slime: "m_slime", skull: "m_skull", bat: "m_bat" };
export const PROJ_MODEL = { fireball: "p_fireball", "ice-shard": "p_ice", "holy-arrow": "p_holy", "shadow-orb": "p_shadow", "wind-cutter": "p_wind", arrow: "p_arrow", multishot: "p_arrow", "magic-bolt": "p_magic" };
export const CHAR_MODEL = { knight: "knight", archer: "archer", mage: "mage", summoner: "summoner" };
