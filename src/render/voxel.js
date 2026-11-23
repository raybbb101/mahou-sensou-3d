// ボクセル体積 → 水平スライス → スプライトスタック。sprite-stack-3d スキルの方法をこのゲーム用に縮めたもの。
// モデル座標: x = 前(顔の向き), y = 右, z = 上。
export const TAU = Math.PI * 2;
export const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

// 4 段の色(奥・側面・上面・ふち)。色相を少しずらしたランプ。
const PAL = {
  stone: ["#232030", "#3c3648", "#5e5868", "#8c8494"], moss: ["#10261a", "#1f4a2a", "#3f7a3a", "#86c060"],
  skin: ["#5a2e2a", "#a0584a", "#e09a7c", "#ffd2b0"], wood: ["#2a160e", "#5a3018", "#8c5426", "#c8843c"],
  gold: ["#3f220e", "#94561a", "#eaa92e", "#fff0a2"], metal: ["#14121c", "#2a2738", "#4a4560", "#7b7496"],
  steel: ["#1c2434", "#3a4a64", "#6e84a4", "#b8cce4"], ice: ["#1c3350", "#4b7fa8", "#a8d8f0", "#f2fbff"],
  slime: ["#0e2a5a", "#1c58a8", "#3a9df0", "#a6e2ff"], red: ["#43142c", "#8e2242", "#d9404c", "#ff9c78"],
  orange: ["#371820", "#82352a", "#d27236", "#f6c272"], bone: ["#3a3028", "#7a6a58", "#c8b89c", "#f4ead4"],
  dark: ["#0c0a14", "#18142a", "#2a2440", "#40385c"], purp: ["#201038", "#47206b", "#8840ad", "#d27de6"],
  white: ["#4d5576", "#8f99bb", "#d3d9ee", "#ffffff"], black: ["#06060a", "#100e18", "#1c1828", "#2c2840"],
  rock: ["#241a22", "#46323c", "#73575a", "#a5877c"], lava: ["#1c0c0c", "#3a1612", "#5e2418", "#8a3a22"],
  green: ["#0d3326", "#1b6e45", "#45b86a", "#b4f0a0"], cryst: ["#0f2b40", "#1b7286", "#47d9c3", "#c6ffee"],
  navy: ["#0c1024", "#1a2244", "#2c3a6c", "#4c64a4"], crimson: ["#1c0610", "#3c0c1c", "#6c1830", "#a8304a"],
};
const EMIS = {
  fire: "#ffe68a", fire2: "#ff9a3c", fire3: "#ff4a32", cyan: "#7ff6ff", red: "#ff3a52", green: "#7dff8a",
  yellow: "#fff27a", violet: "#c69bff", white: "#ffffff", blue: "#6ab0ff", lava: "#ff7a2a", pink: "#ff8ad8", ice: "#d6f8ff",
};
export const MATS = [null];
export const MID = {};
for (const k in PAL) addRamp(k, PAL[k]);
for (const k in EMIS) addEmis("e_" + k, EMIS[k]);
export function addRamp(name, ramp) { if (MID[name]) return; MID[name] = MATS.length; MATS.push({ rgbs: ramp.map(hex) }); }
export function addEmis(name, col) { if (MID[name]) return; MID[name] = MATS.length; MATS.push({ emis: hex(col) }); }
/** 1色から 4 段のランプを作る(影は青紫寄り、光は黄寄り)。 */
export function rampFrom(name, base) {
  if (MID[name]) return name;
  const c = hex(base), mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  addRamp(name, [toHex(mix(c, [16, 10, 40], .72)), toHex(mix(c, [30, 16, 60], .4)), toHex(c), toHex(mix(c, [255, 246, 210], .45))]);
  return name;
}

export function hash3(x, y, z, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177) ^ Math.imul((s | 0) + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
    r += hash3(xi + dx, yi + dy, zi + dz, s) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  return r;
}

export class Vol {
  constructor(w, h, d) { this.w = w; this.h = h; this.d = d; this.m = new Uint8Array(w * h * d); }
  idx(x, y, z) { return (z * this.h + y) * this.w + x; }
  get(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d ? this.m[this.idx(x, y, z)] : 0; }
  put(x, y, z, mat) { x |= 0; y |= 0; z |= 0; if (x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d) this.m[this.idx(x, y, z)] = mat ? MID[mat] : 0; }
  region(bb, test, mat) {
    const x0 = Math.max(0, Math.floor(bb[0])), x1 = Math.min(this.w - 1, Math.ceil(bb[1]));
    const y0 = Math.max(0, Math.floor(bb[2])), y1 = Math.min(this.h - 1, Math.ceil(bb[3]));
    const z0 = Math.max(0, Math.floor(bb[4])), z1 = Math.min(this.d - 1, Math.ceil(bb[5]));
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + .5, py = y + .5, pz = z + .5;
      if (!test(px, py, pz)) continue;
      const m = typeof mat === "function" ? mat(px, py, pz) : mat;
      if (m !== undefined) this.m[this.idx(x, y, z)] = m ? MID[m] : 0;
    }
  }
  paint(test, mat) {
    for (let z = 0; z < this.d; z++) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = this.idx(x, y, z); if (!this.m[i]) continue;
      const px = x + .5, py = y + .5, pz = z + .5;
      if (!test(px, py, pz)) continue;
      const m = typeof mat === "function" ? mat(px, py, pz) : mat;
      if (m !== undefined) this.m[i] = m ? MID[m] : 0;
    }
  }
  box(x0, y0, z0, x1, y1, z1, mat) { this.region([x0, x1, y0, y1, z0, z1], (x, y, z) => x >= x0 && x < x1 && y >= y0 && y < y1 && z >= z0 && z < z1, mat); }
  ell(cx, cy, cz, rx, ry, rz, mat) {
    this.region([cx - rx, cx + rx, cy - ry, cy + ry, cz - rz, cz + rz], (x, y, z) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1, mat);
  }
  cyl(cx, cy, r, z0, z1, mat) { this.region([cx - r, cx + r, cy - r, cy + r, z0, z1], (x, y, z) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r && z >= z0 && z < z1, mat); }
  cone(ax, ay, az, bx, by, bz, r0, r1, mat) {
    const R = Math.max(r0, r1), dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz || 1;
    this.region([Math.min(ax, bx) - R, Math.max(ax, bx) + R, Math.min(ay, by) - R, Math.max(ay, by) + R, Math.min(az, bz) - R, Math.max(az, bz) + R], (x, y, z) => {
      let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - x, qy = ay + dy * t - y, qz = az + dz * t - z, r = r0 + (r1 - r0) * t;
      return qx * qx + qy * qy + qz * qz <= r * r;
    }, mat);
  }
  seg(ax, ay, az, bx, by, bz, r, mat) { this.cone(ax, ay, az, bx, by, bz, r, r, mat); }
  torus(cx, cy, cz, R, r, mat) {
    this.region([cx - R - r, cx + R + r, cy - R - r, cy + R + r, cz - r, cz + r], (x, y, z) => (Math.hypot(x - cx, y - cy) - R) ** 2 + (z - cz) ** 2 <= r * r, mat);
  }
}

/** 体積を下から順のスライス(canvas)に焼く。上が空いた面は明るく、埋もれた面は暗く。 */
export function bake(vol) {
  const { w, h, d } = vol, slices = [];
  for (let z = 0; z < d; z++) {
    let img = null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const id = vol.m[vol.idx(x, y, z)]; if (!id) continue;
      const M = MATS[id];
      if (!img) img = new ImageData(w + 2, h + 2);
      const i = ((y + 1) * (w + 2) + x + 1) * 4;
      let col;
      if (M.emis) col = M.emis;
      else {
        const up = vol.get(x, y, z + 1);
        const side = !vol.get(x - 1, y, z) || !vol.get(x + 1, y, z) || !vol.get(x, y - 1, z) || !vol.get(x, y + 1, z);
        let t = !up ? (side ? 3 : 2) : side ? (vol.get(x, y, z - 1) ? 1 : 0) : 0;
        // 左上から光が来る: 右下を向いた側面は一段暗く
        if (side && up && (!vol.get(x + 1, y, z) || !vol.get(x, y + 1, z)) && t > 0 && hash3(x, y, z, 3) < .7) t--;
        col = M.rgbs[t];
      }
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
    if (img) { const c = document.createElement("canvas"); c.width = w + 2; c.height = h + 2; c.getContext("2d").putImageData(img, 0, 0); slices.push(c); }
    else slices.push(null);
  }
  return { w, h, d, slices };
}

/** モデル = { frames: [bake結果...], px, py (足元の中心), buckets, outline } と角度ごとのスプライトキャッシュ。 */
export class Model {
  constructor(frames, o = {}) {
    this.frames = frames; this.px = o.px ?? frames[0].w / 2; this.py = o.py ?? frames[0].h / 2;
    this.buckets = o.buckets || 32; this.outline = hex(o.outline || "#0e0a16"); this.cache = new Map();
    this.noOutline = !!o.noOutline;
  }
}

export class Stacker {
  constructor(pitch) { this.setPitch(pitch); this.count = 0; }
  setPitch(p) { this.pitch = p; this.sq = Math.sin(p); this.cf = Math.cos(p); }
  /** 相対角度 rel(モデルの向き − カメラの向き)で見たスプライト。{c, ax, ay} を返す(ax, ay = 足元の位置)。 */
  sprite(m, frame, rel) {
    const N = m.buckets, b = ((Math.round(rel / TAU * N) % N) + N) % N, key = frame * 256 + b;
    let s = m.cache.get(key);
    if (s) return s;
    const F = m.frames[frame % m.frames.length], { sq, cf } = this;
    const S = Math.ceil(Math.hypot(F.w, F.h)) + 4, H = Math.ceil(S * sq + F.d * cf) + 6;
    const c = document.createElement("canvas"); c.width = S; c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true }); g.imageSmoothingEnabled = false;
    const a = b / N * TAU, co = Math.cos(a), si = Math.sin(a), cx = S / 2, cy = H - S / 2 * sq - 3;
    for (let z = 0; z < F.d; z++) {
      const sl = F.slices[z]; if (!sl) continue;
      g.setTransform(co, -si * sq, -si, -co * sq, cx, cy - z * cf);
      g.drawImage(sl, -m.px - 1, -m.py - 1);
      // 縦に間が空かないよう、カメラが寝ているときは半段ずらしてもう一度
      if (cf > .75) { g.setTransform(co, -si * sq, -si, -co * sq, cx, cy - (z + .5) * cf); g.drawImage(sl, -m.px - 1, -m.py - 1); }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const id = g.getImageData(0, 0, S, H), d = id.data, mask = new Uint8Array(S * H);
    for (let i = 0, p = 0; p < S * H; p++, i += 4) { if (d[i + 3] >= 128) { mask[p] = 1; d[i + 3] = 255; } else d[i + 3] = 0; }
    if (!m.noOutline) {
      const o = m.outline;
      for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) {
        const p = y * S + x; if (mask[p]) continue;
        if ((x > 0 && mask[p - 1]) || (x < S - 1 && mask[p + 1]) || (y > 0 && mask[p - S]) || (y < H - 1 && mask[p + S])) {
          const i = p * 4; d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = 255;
        }
      }
    }
    g.putImageData(id, 0, 0);
    s = { c, ax: cx, ay: cy };
    m.cache.set(key, s);
    this.count++;
    return s;
  }
}
