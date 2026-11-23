// node tools/simtest.mjs : ブラウザなしで両モードの戦闘をボットで回す
import { Session } from "../src/sim/session.js";
for (const mode of ["tower", "dungeon"]) {
  const S = new Session(mode); S.addPlayer("a", "A"); S.addPlayer("b", "B"); S.start();
  for (const p of S.players) {
    if (mode === "dungeon") S.action(p.id, { type: "char", id: p.id === "a" ? "summoner" : "knight" });
    else S.action(p.id, { type: "pick", ult: p.ultOffer[0], spell: p.offer[0], slot: 0 });
  }
  let ticks = 0, lastFloor = S.floor;
  while (ticks < 30 * 60 * 6 && S.phase === "battle") {
    const w = S.world;
    for (const p of w.players) {
      const e = w.mode === "dungeon" ? (w.boss.state === "sleep" ? null : w.nearest(p.x, p.y)) : w.nearest(p.x, p.y);
      let tx, ty;
      if (w.gate) [tx, ty] = [w.gate.x, w.gate.y];
      else if (w.mode === "dungeon") { const t = w.mins.find((m) => m.hp > 0) || w.boss; [tx, ty] = [t.x, t.y]; }
      else [tx, ty] = e ? [e.x, e.y] : [0, 0];
      const d = Math.hypot(tx - p.x, ty - p.y) || 1;
      if (w.mode === "dungeon") { p.x = tx - (tx - p.x) / d * Math.min(d, 30); p.y = ty - (ty - p.y) / d * Math.min(d, 30); }
      S.input(p.id, { mx: (tx - p.x) / d, my: (ty - p.y) / d });
      S.act(p.id, { a: "cast", s: ticks % 3 }); if (p.uc >= 1) S.act(p.id, { a: "ult" });
      p.hp = p.mh; // ボットは死なない(進行の確認だけ)
    }
    S.tick(); ticks++;
    if (S.floor !== lastFloor || S.phase !== "battle") { console.log(mode, "floor", lastFloor, "->", S.phase, S.floor, "t=", (ticks / 30).toFixed(0) + "s"); lastFloor = S.floor; if (S.phase === "reward") { for (const p of S.players) S.action(p.id, { type: "reward", id: p.rewardOffer[0] }); for (const p of S.players) if (S.phase === "pick") S.action(p.id, { type: "pick", spell: p.offer[0], slot: 0 }); } if (lastFloor > 3) break; }
  }
  const w = S.world; console.log(mode, "end", S.phase, S.floor, w && { boss: Math.round(w.boss.hp), mins: w.mins.length, items: w.items?.length, lv: w.players.map((p) => p.level), wpn: w.players.map((p) => p.wname) });
}
