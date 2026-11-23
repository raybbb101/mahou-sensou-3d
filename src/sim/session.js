// 進行: ロビー → 魔法選択 → ボス戦 → 報酬 → 次の層 … 全滅で第1層へ。ソロでもマルチでも同じ。
import { SPELL_IDS, SPELLS, MAX_RANK, MAX_SLOTS, ULT_IDS, REWARD_IDS, FLOORS, PLAYER_COLORS, isAttack } from "./data.js";
import { World } from "./world.js";
import { DWorld, starterWeapon } from "./dungeon.js";
import { CHAR_IDS, STAGES } from "./data.js";

export const MAX_PLAYERS = 4;
const shuffle = (l) => { for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };

export class Session {
  constructor(mode = "tower") {
    this.mode = mode; this.seed = (Math.random() * 1e9) | 0;
    this.players = []; this.phase = "lobby"; this.floor = 1; this.world = null;
    this.best = 0; this.runs = 0; this.dirty = true; this.result = null;
  }
  addPlayer(id, name) {
    if (this.players.length >= MAX_PLAYERS) return null;
    const used = new Set(this.players.map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[0];
    const p = { id, name: name || `魔法使い${this.players.length + 1}`, color };
    this.reset(p);
    this.players.push(p);
    this.dirty = true;
    return p;
  }
  reset(p) {
    Object.assign(p, { char: null, weapon: null, level: 1, xp: 0, slots: [], ult: null, uc: 0, stats: { hp: 0, atk: 0, cdr: 0, spd: 0, ultc: 0 }, offer: [], ultOffer: [], rewardOffer: [], ready: false });
  }
  removePlayer(id) {
    const i = this.players.findIndex((p) => p.id === id);
    if (i < 0) return;
    this.players.splice(i, 1);
    if (this.world) { const w = this.world.pl(id); if (w) { w.down = true; w.hp = 0; } }
    this.dirty = true;
    this.maybeAdvance();
  }

  start() {
    this.floor = 1; this.seed = (Math.random() * 1e9) | 0;
    for (const p of this.players) this.reset(p);
    this.beginPick();
  }
  beginPick() {
    this.phase = "pick"; this.world = null;
    for (const p of this.players) {
      p.ready = false;
      if (this.mode === "dungeon") { p.offer = CHAR_IDS; p.ultOffer = []; continue; }
      p.offer = this.rollOffer(p);
      p.ultOffer = p.ult ? [] : shuffle([...ULT_IDS]).slice(0, 3);
    }
    this.dirty = true;
  }
  rollOffer(p) {
    const rank = (id) => p.slots.find((s) => s.id === id)?.rank || 0;
    let pool = SPELL_IDS.filter((id) => rank(id) < MAX_RANK && !SPELLS[id].dungeon);
    if (this.floor === 1) pool = pool.filter((id) => SPELLS[id].tier === 1);
    if (p.slots.length >= MAX_SLOTS) {
      // 枠が埋まっていたら、持っている魔法のランクアップを少なくとも1つ混ぜる
      const own = shuffle(pool.filter((id) => rank(id))), rest = shuffle(pool.filter((id) => !rank(id)));
      return [...own.slice(0, 1), ...shuffle([...own.slice(1), ...rest])].slice(0, 3);
    }
    shuffle(pool);
    const out = pool.slice(0, 3);
    if (!p.slots.some((s) => isAttack(s.id)) && !out.some(isAttack)) out[0] = pool.find(isAttack);
    return out;
  }

  action(pid, a) {
    const p = this.players.find((q) => q.id === pid);
    if (!p) return;
    this.dirty = true;
    if (a.type === "start" && this.phase === "lobby") this.start();
    else if (a.type === "pick") this.pick(p, a);
    else if (a.type === "char" && this.phase === "pick" && !p.ready && CHAR_IDS.includes(a.id)) { Object.assign(p, { char: a.id, weapon: starterWeapon(a.id), level: 1, xp: 0, uc: 0, ready: true }); }
    else if (a.type === "reward") this.reward(p, a.id);
    else if (a.type === "retry" && (this.phase === "defeat" || this.phase === "victory")) this.start();
    else if (a.type === "rename" && this.phase === "lobby") p.name = String(a.name || "").slice(0, 10) || p.name;
    this.maybeAdvance();
  }
  pick(p, a) {
    if (this.phase !== "pick" || p.ready) return;
    if (!p.ult) { if (!p.ultOffer.includes(a.ult)) return; }
    if (!p.offer.includes(a.spell)) return;
    const own = p.slots.find((s) => s.id === a.spell);
    if (own) own.rank = Math.min(MAX_RANK, own.rank + 1);
    else if (p.slots.length < MAX_SLOTS) p.slots.push({ id: a.spell, rank: 1 });
    else {
      const i = a.slot | 0;
      if (i < 0 || i >= MAX_SLOTS) return;
      p.slots[i] = { id: a.spell, rank: 1 };
    }
    if (!p.ult) p.ult = a.ult;
    p.ready = true;
  }
  reward(p, id) {
    if (this.phase !== "reward" || p.ready || !p.rewardOffer.includes(id)) return;
    if (id === "rank") { const l = p.slots.filter((s) => s.rank < MAX_RANK); if (l.length) l[Math.floor(Math.random() * l.length)].rank++; }
    else p.stats[id]++;
    p.ready = true;
  }
  maybeAdvance() {
    if (!this.players.length) return;
    if (this.phase === "pick" && this.players.every((p) => p.ready)) this.beginBattle();
    else if (this.phase === "reward" && this.players.every((p) => p.ready)) {
      this.floor++;
      if (this.floor > FLOORS) { this.phase = "victory"; this.floor = FLOORS; this.best = FLOORS + 1; }
      else this.beginPick();
    }
  }
  beginBattle() {
    this.phase = "battle";
    this.world = this.mode === "dungeon" ? new DWorld(this.floor, this.players, this.seed) : new World(this.floor, this.players);
    this.dirty = true;
  }

  input(pid, i) { if (this.world) this.world.input(pid, i); }
  act(pid, a) { if (this.world && this.phase === "battle") this.world.act(pid, a); }

  /** 1 ティック進める。戦闘が終わったら進行を切り替える。 */
  tick() {
    const w = this.world;
    if (this.phase !== "battle" || !w) return;
    w.step();
    if (!w.result) return;
    for (const wp of w.players) { const p = this.players.find((q) => q.id === wp.id); if (p) { p.uc = wp.uc; if (wp.char) Object.assign(p, { weapon: wp.weapon, level: wp.level, xp: wp.xp }); } }
    if (w.result === "next") {
      this.best = Math.max(this.best, this.floor);
      if (this.floor >= STAGES) { this.phase = "victory"; this.best = STAGES + 1; this.world = null; }
      else { this.floor++; this.beginBattle(); }
    } else if (w.result === "win") {
      this.best = Math.max(this.best, this.floor);
      this.phase = "reward";
      for (const p of this.players) {
        p.ready = false;
        const pool = REWARD_IDS.filter((id) => id !== "rank" || p.slots.some((s) => s.rank < MAX_RANK));
        p.rewardOffer = shuffle(pool).slice(0, 3);
      }
    } else {
      this.phase = "defeat"; this.runs++;
      this.best = Math.max(this.best, this.floor - 1);
    }
    this.dirty = true;
  }

  publicState() {
    return {
      mode: this.mode, phase: this.phase, floor: this.floor, best: this.best, runs: this.runs, seed: this.seed,
      players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color, char: p.char, level: p.level, weapon: p.weapon, slots: p.slots, ult: p.ult, uc: p.uc, stats: p.stats, offer: p.offer, ultOffer: p.ultOffer, rewardOffer: p.rewardOffer, ready: p.ready })),
    };
  }
}
