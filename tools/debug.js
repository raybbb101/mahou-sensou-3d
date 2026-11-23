// テスト用: 仮想時間でゲームを1コマずつ進めて、画面を並べて見る。
import { clock } from "../src/render/view.js";
let vt = 0;
const G = () => window.game;
export function manual() { const g = G(); g.manual = true; vt = performance.now(); clock.now = () => vt; }
export function step(n = 1) { const g = G(); for (let i = 0; i < n; i++) { vt += 1000 / 30; g.tick(); g.frame(vt); } }
export function quick(ult, floor = 1, spells = ["fireball", "meteor", "spark", "black-hole"]) {
  const g = G(); manual(); g.startSolo();
  const S = g.session, p = S.players[0];
  p.ult = ult; p.slots = spells.map((id) => ({ id, rank: 2 })); S.floor = floor; S.beginBattle(); S.dirty = true; g.afterAction();
  step(60);
}
export function ultNow() { const w = G().session.world; w.players[0].uc = 1; G().ult(); }
/** times(秒)ごとに画面を撮って並べる。 */
export function grab(times, cols = 2, each = null) {
  const c = document.getElementById("game"), shots = [];
  let t = 0;
  for (const tt of times) { while (t < tt) { if (each) each(t); step(1); t += 1 / 30; } shots.push(c.toDataURL()); }
  let ov = document.getElementById("ovg");
  if (!ov) { ov = document.createElement("canvas"); ov.id = "ovg"; ov.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;object-fit:contain;z-index:99;image-rendering:pixelated;background:#000"; document.body.appendChild(ov); ov.onclick = () => (ov.style.display = "none"); }
  const rows = Math.ceil(shots.length / cols);
  ov.width = c.width * cols; ov.height = c.height * rows;
  const g = ov.getContext("2d");
  shots.forEach((src, i) => { const im = new Image(); im.onload = () => g.drawImage(im, (i % cols) * c.width, Math.floor(i / cols) * c.height); im.src = src; });
  ov.style.display = "block";
}
export function hide() { const o = document.getElementById("ovg"); if (o) o.style.display = "none"; }
export function dquick(char = "knight", stage = 1) {
  const g = G(); manual(); g.startSolo("dungeon");
  const S = g.session; S.floor = stage; S.action("solo", { type: "char", id: char }); g.afterAction();
  step(45);
}
/** 自分を (x, y) へ瞬間移動 */
export function tp(x, y) { const p = G().session.world.players[0]; p.x = x; p.y = y; }
