// 粒子と、小さなスプライトのキャッシュ(炎の玉、光、数字、床の輪・魔法陣)。
// pixelfx の考え方: 色は段階的なランプ + ディザ、光は別の層に足す。
import { hex } from "./voxel.js";

export const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + .5) / 16);
const bay = (x, y) => BAY[(y & 3) * 4 + (x & 3)];
const mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

// 暗 → 明 のランプ(pixelfx の色を元にしている)
export const RAMPS = {
  fire: ["#2a0c10", "#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
  ice: ["#0c1a30", "#1c3350", "#2c5a8a", "#4b7fa8", "#6ab0e0", "#8fd0ff", "#a8e0ff", "#d6f4ff", "#f2fbff", "#ffffff"],
  thunder: ["#1a1430", "#2c2850", "#4a4890", "#7a78d0", "#a8a8ff", "#d0d0ff", "#fff27a", "#ffe14a", "#fffbd0", "#ffffff"],
  holy: ["#2a2010", "#4a3a18", "#7a5a20", "#b08a30", "#e0b840", "#ffd860", "#ffe88a", "#fff09a", "#fff8d0", "#ffffff"],
  shadow: ["#06040a", "#120a1e", "#24123a", "#3a1a5a", "#5a2a86", "#7a3ab0", "#a060e0", "#c69bff", "#e8d0ff", "#ffffff"],
  wind: ["#06201a", "#0c3a2a", "#145a3a", "#1f7a4a", "#2fa060", "#45c878", "#7ae09a", "#a8f0b8", "#d8fce0", "#ffffff"],
  smoke: ["#0e0c12", "#1d1a22", "#2e2a35", "#433e4b", "#5c5664", "#7b7484", "#a39cab", "#c8c2d0", "#e0dce6", "#ffffff"],
  red: ["#1a0408", "#3a0810", "#6a1018", "#a01822", "#d42a2a", "#ff4a3a", "#ff7a5a", "#ffaa8a", "#ffd8c8", "#ffffff"],
  violet: ["#100818", "#20102e", "#381a50", "#562a78", "#7a3aa8", "#a050d8", "#c878ff", "#e0a8ff", "#f4dcff", "#ffffff"],
  gold: ["#201406", "#3f220e", "#6a3c14", "#94561a", "#c47a22", "#eaa92e", "#ffd060", "#fff0a2", "#fffae0", "#ffffff"],
};
const RGB = {};
for (const k in RAMPS) RGB[k] = RAMPS[k].map(hex);
export const ELEM_RAMP = { fire: "fire", ice: "ice", thunder: "thunder", holy: "holy", shadow: "shadow", wind: "wind" };

const cache = new Map();
const cached = (key, fn) => { let v = cache.get(key); if (!v) { v = fn(); cache.set(key, v); } return v; };

/** 炎のかたまり: 中心ほど熱い、ディザ付きの円。lvl 0..9 は中心の明るさ。 */
export function puff(ramp, r, lvl) {
  r = Math.max(1, Math.round(r)); lvl = Math.max(0, Math.min(9, Math.round(lvl)));
  return cached(`p|${ramp}|${r}|${lvl}`, () => {
    const s = 2 * r + 1, c = mk(s, s), g = c.getContext("2d"), id = g.createImageData(s, s), P = RGB[ramp];
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = (x - r) / (r + .5), dy = (y - r) / (r + .5), d = Math.hypot(dx, dy);
      if (d > 1) continue;
      const h = lvl * (1.05 - .6 * d) - dy * 1.1 - dx * .4 + (bay(x, y) - .5) * 1.2;
      let k = Math.floor(h); if (k < 1) { if (d > .7) continue; k = 1; }
      const col = P[Math.min(9, k)], i = (y * s + x) * 4;
      id.data[i] = col[0]; id.data[i + 1] = col[1]; id.data[i + 2] = col[2]; id.data[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  });
}
/** 半透明の煙(上が明るい)。 */
export function smoke(r) {
  r = Math.max(1, Math.round(r));
  return cached(`s|${r}`, () => {
    const s = 2 * r + 1, c = mk(s, s), g = c.getContext("2d"), id = g.createImageData(s, s), P = RGB.smoke;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = (x - r) / (r + .5), dy = (y - r) / (r + .5), d = Math.hypot(dx, dy); if (d > 1) continue;
      const k = Math.max(1, Math.min(6, Math.floor(3.5 - dy * 2.2 - dx * .8 + bay(x, y) - .5))), col = P[k], i = (y * s + x) * 4;
      id.data[i] = col[0]; id.data[i + 1] = col[1]; id.data[i + 2] = col[2]; id.data[i + 3] = d > .78 ? 150 : 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  });
}
/** 加算で重ねる光。 */
export function glowSprite(color) {
  return cached(`g|${color}`, () => {
    const c = mk(64, 64), g = c.getContext("2d"), [r, gg, b] = hex(color);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${gg},${b},1)`); gr.addColorStop(.35, `rgba(${r},${gg},${b},.45)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  });
}
/** 足元の影(楕円)。 */
export function shadow(r, sq) {
  r = Math.max(2, Math.round(r));
  return cached(`sh|${r}|${sq.toFixed(2)}`, () => {
    const w = 2 * r + 1, h = Math.max(2, Math.round(2 * r * sq)) + 1, c = mk(w, h), g = c.getContext("2d"), id = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - r) / (r + .5), dy = (y - (h - 1) / 2) / ((h - 1) / 2 + .5), d = Math.hypot(dx, dy); if (d > 1) continue;
      id.data[(y * w + x) * 4 + 3] = d < .65 ? 110 : 60;
    }
    g.putImageData(id, 0, 0);
    return c;
  });
}
/** 床に貼る輪(上から見た図)。 */
export function ringTex(r, color, th = 1.4) {
  r = Math.max(2, Math.round(r));
  return cached(`r|${r}|${color}|${th}`, () => {
    const s = 2 * r + 3, c = mk(s, s), g = c.getContext("2d"), id = g.createImageData(s, s), col = hex(color), o = r + 1;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const d = Math.hypot(x - o, y - o); if (Math.abs(d - r + th / 2) > th / 2 + .3) continue;
      const i = (y * s + x) * 4; id.data[i] = col[0]; id.data[i + 1] = col[1]; id.data[i + 2] = col[2]; id.data[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  });
}
/** 魔法陣(上から見た図)。二重の輪、ルーンの刻み、内側の星。 */
export function circleTex(elem, r) {
  r = Math.max(8, Math.round(r / 4) * 4);
  return cached(`c|${elem}|${r}`, () => {
    const s = 2 * r + 3, c = mk(s, s), g = c.getContext("2d"), id = g.createImageData(s, s), P = RGB[ELEM_RAMP[elem] || elem], o = r + 1, d8 = id.data;
    const put = (x, y, k) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= s || y >= s) return; const i = (y * s + x) * 4, col = P[k]; d8[i] = col[0]; d8[i + 1] = col[1]; d8[i + 2] = col[2]; d8[i + 3] = 255; };
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const d = Math.hypot(x - o, y - o), a = Math.atan2(y - o, x - o);
      if (Math.abs(d - r + .7) < .8) put(x, y, 8);
      else if (Math.abs(d - (r - 5)) < .6) put(x, y, 6);
      else if (d < r - 1.5 && d > r - 4.5 && ((a / Math.PI * 12 + 24) % 2) < .35) put(x, y, 7);
      else if (Math.abs(d - r * .55) < .6) put(x, y, 7);
    }
    // 六芒星
    for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) {
      const a0 = (i / 3 + k / 6) * Math.PI * 2, a1 = ((i + 1) / 3 + k / 6) * Math.PI * 2, R = r - 5;
      const x0 = o + Math.cos(a0) * R, y0 = o + Math.sin(a0) * R, x1 = o + Math.cos(a1) * R, y1 = o + Math.sin(a1) * R, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let j = 0; j <= n; j++) put(x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n, 9);
    }
    g.putImageData(id, 0, 0);
    return c;
  });
}

// 3x5 の数字フォント
const FONT = { 0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001", 5: "111100111001111", 6: "111100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001111", "+": "000010111010000", "!": "010010010000010" };
export function textSprite(str, color) {
  return cached(`t|${str}|${color}`, () => {
    const w = str.length * 4 + 1, c = mk(w + 2, 8), g = c.getContext("2d");
    for (let pass = 0; pass < 2; pass++) {
      g.fillStyle = pass ? color : "#140a14";
      for (let i = 0; i < str.length; i++) {
        const f = FONT[str[i]]; if (!f) continue;
        for (let k = 0; k < 15; k++) if (f[k] === "1") {
          const x = 1 + i * 4 + (k % 3), y = 1 + Math.floor(k / 3);
          if (pass) g.fillRect(x, y, 1, 1); else g.fillRect(x - 1, y - 1, 3, 3);
        }
      }
    }
    return c;
  });
}
export function clearTextCache() { for (const k of cache.keys()) if (k.startsWith("t|")) cache.delete(k); }

/** 粒子。種類: puff(炎のかたまり) smoke dot spark chip glint text */
export class Particles {
  constructor() { this.l = []; }
  add(p) { if (this.l.length < 900) this.l.push(Object.assign({ z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, age: 0, life: 1, ramp: "fire", r0: 2, r1: 3, lvl: 8 }, p)); }
  burst(n, x, y, z, o) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = (o.up ?? .3) + Math.random() * (o.spread ?? .8), sp = (o.sp ?? 60) * (.4 + Math.random() * .8);
      this.add({ ...o, x: x + (Math.random() - .5) * (o.jit || 0), y: y + (Math.random() - .5) * (o.jit || 0), z: z + Math.random() * (o.zj || 0),
        vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(a) * Math.cos(e) * sp, vz: Math.sin(e) * sp * (o.vzk ?? 1), life: (o.life || .6) * (.6 + Math.random() * .7) });
    }
  }
  update(dt) {
    const l = this.l;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.age += dt;
      if (p.age >= p.life) { l[i] = l[l.length - 1]; l.pop(); continue; }
      if (p.orbit) {
        // 中心へ渦を巻いて吸い込まれる
        const dx = p.x - p.orbit.x, dy = p.y - p.orbit.y, d = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx) + dt * p.spin * 40 / (d + 8);
        const nd = Math.max(0, d - p.pull * dt);
        p.x = p.orbit.x + Math.cos(a) * nd; p.y = p.orbit.y + Math.sin(a) * nd; p.z += (p.orbit.z - p.z) * Math.min(1, dt * 2);
        continue;
      }
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.vz -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z < 0) { if (p.bounce) { p.z = 0; p.vz = -p.vz * p.bounce; p.vx *= .6; p.vy *= .6; } else if (p.g > 0) { p.z = 0; p.vz = 0; p.vx *= .5; p.vy *= .5; } }
    }
  }
}

export function drawParticle(g, p, sx, sy, sq) {
  const u = p.age / p.life;
  switch (p.t) {
    case "puff": {
      const r = p.r0 + (p.r1 - p.r0) * (1 - (1 - u) * (1 - u)), s = puff(p.ramp, r, p.lvl * (1 - u * .85));
      g.drawImage(s, Math.round(sx - s.width / 2), Math.round(sy - s.height / 2));
      break;
    }
    case "smoke": {
      const r = p.r0 + (p.r1 - p.r0) * u, s = smoke(r);
      g.globalAlpha = .45 * (1 - u) * Math.min(1, p.age * 8); g.drawImage(s, Math.round(sx - s.width / 2), Math.round(sy - s.height / 2)); g.globalAlpha = 1;
      break;
    }
    case "dot": case "glint": {
      const P = RAMPS[p.ramp], k = Math.max(1, Math.min(9, Math.round((p.lvl || 9) * (1 - u * .8))));
      g.fillStyle = P[k];
      const s = p.size || 1;
      g.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
      if (p.t === "glint" && u < .5) { g.fillRect(Math.round(sx) - 1, Math.round(sy), 3, 1); g.fillRect(Math.round(sx), Math.round(sy) - 1, 1, 3); }
      break;
    }
    case "spark": {
      const P = RAMPS[p.ramp], k = Math.max(2, Math.round(9 * (1 - u)));
      g.fillStyle = P[k];
      const tx = sx - p.vx * .025, ty = sy + p.vz * .025 * .8 - p.vy * .025 * sq, n = Math.max(1, Math.ceil(Math.hypot(tx - sx, ty - sy)));
      for (let i = 0; i <= n; i++) g.fillRect(Math.round(sx + (tx - sx) * i / n), Math.round(sy + (ty - sy) * i / n), 1, 1);
      break;
    }
    case "chip": {
      const P = RAMPS[p.ramp || "smoke"];
      g.fillStyle = P[p.z < .5 && u > .5 ? 2 : 5];
      g.fillRect(Math.round(sx), Math.round(sy), 2, (p.age * 20 | 0) % 2 ? 1 : 2);
      break;
    }
    case "text": {
      const s = textSprite(p.text, p.color), rise = Math.min(1, u * 4);
      g.globalAlpha = u > .75 ? (1 - u) * 4 : 1;
      g.drawImage(s, Math.round(sx - s.width / 2), Math.round(sy - s.height / 2 - rise * 6 - u * 6));
      g.globalAlpha = 1;
      break;
    }
  }
}
