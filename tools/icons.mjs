// node tools/icons.mjs : アイコン(ドット絵の魔法使いの帽子と火の玉)を PNG で書き出す。依存なし。
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
const N = 32, px = new Array(N * N).fill([18, 12, 30]);
const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) px[y * N + x] = c; };
// 背景のグラデーションと魔法陣
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = Math.hypot(x - 15.5, y - 17); px[y * N + x] = d < 13 && d > 12 ? [120, 80, 180] : [18 + y, 12 + y * .4, 30 + y * .8].map(Math.round); }
// 帽子
const hat = [60, 44, 100], hatL = [96, 72, 150], band = [216, 72, 106];
for (let y = 6; y < 22; y++) { const w = (y - 6) * .42; for (let x = Math.round(14 - w - (21 - y) * .15); x <= Math.round(14 + w - (21 - y) * .15); x++) set(x, y, x < 13 ? hatL : hat); }
for (let x = 5; x <= 23; x++) { set(x, 22, hat); set(x, 23, [36, 26, 60]); }
for (let x = 9; x <= 19; x++) set(x, 20, band), set(x, 21, band);
// 火の玉
const F = [[255, 255, 255], [255, 226, 107], [255, 138, 42], [201, 40, 31]];
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const d = Math.hypot(x - 23, y - 8), t = Math.max(0, (x - 23) * -.1);
  if (d < 2) set(x, y, F[0]); else if (d < 3.4) set(x, y, F[1]); else if (d < 4.6) set(x, y, F[2]);
}
for (let i = 0; i < 6; i++) set(24 + i, 9 + Math.round(i * .7), F[3]), set(25 + i, 8 + Math.round(i * .7), F[2]);
function png(size) {
  const s = size / N, raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) { const c = px[Math.floor(y / s) * N + Math.floor(x / s)], o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255; } }
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const v of b) r = t[(r ^ v) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(size, 0); ih.writeUInt32BE(size, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
for (const s of [180, 192, 512]) writeFileSync(new URL(`../icons/icon-${s}.png`, import.meta.url), png(s));
console.log("icons written");
