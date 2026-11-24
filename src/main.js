// 魔法戦争 3D エントリーポイント。
// ソロ: 自分のブラウザで Session を回す。マルチ: 部屋を作った人のブラウザで回し、仲間には状態を送る(PeerJS)。
import { Session, MAX_PLAYERS } from "./sim/session.js";
import { World, TICK } from "./sim/world.js";
import { BOSSES, SPELL_IDS, ULT_IDS, PLAYER_COLORS, FLOORS, THEMES } from "./sim/data.js";
import { View } from "./render/view.js";
import { UI } from "./ui/ui.js";
import { P2PHost, P2PClient } from "./net/p2p.js";
import { RARITY } from "./sim/data.js";

const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
const SAVE = "mw3d-save", REC = "mw3d-record";

class Game {
  constructor() {
    this.view = new View(document.getElementById("game"));
    this.sfx = this.view.sfx;
    this.ui = new UI(this);
    this.mode = "title"; this.selfId = null; this.session = null; this.link = null; this.state = null;
    this.keys = new Set(); this.stickV = [0, 0]; this.paused = false; this.lastIn = ""; this.tickN = 0; this.pend = [];
    this.myName = store.get("mw3d-name") || "";
    try { this.record = JSON.parse(store.get(REC)) || { best: 0, runs: 0 }; } catch { this.record = { best: 0, runs: 0 }; }
    this.view.onEvent = (e) => this.onViewEvent(e);
    this.wire();
    this.startDemo();
    this.ui.title();
    setInterval(() => { if (!this.manual) this.tick(); }, TICK * 1000);
    const loop = (t) => { if (!this.manual) this.frame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ───── 入力 ─────
  wire() {
    addEventListener("resize", () => { this.view.resize(); });
    addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      this.keys.add(e.code);
      this.sfx.unlock();
      const k = { KeyJ: 0, Digit1: 0, KeyK: 1, Digit2: 1, KeyL: 2, Digit3: 2, KeyI: 3, Digit4: 3 }[e.code];
      if (k != null && (!e.repeat || k === 0)) this.cast(k);
      if (e.code === "Space" && !e.repeat) this.dash();
      if ((e.code === "KeyE" || e.code === "KeyQ") && !e.repeat) this.ult();
      if (e.code === "Escape" && this.mode === "solo" && this.state?.phase === "battle") this.setPaused(!this.paused);
      if (e.code === "KeyM") this.sfx.muted = !this.sfx.muted;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => { this.keys.clear(); this.stickV = [0, 0]; this.ui.setStick(false); });
    // 仮想スティック: 画面の左側をドラッグ
    const st = document.getElementById("stage");
    let sid = null, sx = 0, sy = 0;
    st.addEventListener("pointerdown", (e) => {
      this.sfx.unlock();
      if (this.state?.phase !== "battle" || this.mode === "title" || e.target.closest("button")) return;
      if (e.clientX > innerWidth * .55 && e.pointerType !== "mouse") return;
      if (e.pointerType === "mouse" && !this.ui.touch) return;
      sid = e.pointerId; sx = e.clientX; sy = e.clientY; st.setPointerCapture(sid);
      this.ui.setStick(true, sx, sy, 0, 0);
    });
    st.addEventListener("pointermove", (e) => {
      if (e.pointerId !== sid) return;
      let dx = e.clientX - sx, dy = e.clientY - sy; const l = Math.hypot(dx, dy), R = 44;
      if (l > R) { sx += dx * (1 - R / l); sy += dy * (1 - R / l); dx = e.clientX - sx; dy = e.clientY - sy; }
      const m = Math.min(1, Math.hypot(dx, dy) / R * 1.3), a = Math.atan2(dy, dx);
      this.stickV = Math.hypot(dx, dy) < 5 ? [0, 0] : [Math.cos(a) * m, Math.sin(a) * m];
      this.ui.setStick(true, sx, sy, dx, dy);
    });
    const end = (e) => { if (e.pointerId !== sid) return; sid = null; this.stickV = [0, 0]; this.ui.setStick(false); };
    st.addEventListener("pointerup", end); st.addEventListener("pointercancel", end);
    addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); this.installEv = e; if (this.mode === "title") this.ui.title(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden && this.mode === "solo" && this.state?.phase === "battle") this.setPaused(true); });
  }
  canInstall() { return !!this.installEv; }
  install() { const e = this.installEv; if (!e) return; e.prompt(); this.installEv = null; }

  moveDir() {
    let x = 0, y = 0; const K = this.keys;
    if (K.has("KeyA") || K.has("ArrowLeft")) x--; if (K.has("KeyD") || K.has("ArrowRight")) x++;
    if (K.has("KeyW") || K.has("ArrowUp")) y--; if (K.has("KeyS") || K.has("ArrowDown")) y++;
    if (!x && !y) [x, y] = this.stickV;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    const [mx, my] = this.view.screenToWorldDir(x, y);
    return { mx: Math.round(mx * 100) / 100, my: Math.round(my * 100) / 100 };
  }
  battleAct(a) {
    if (this.state?.phase !== "battle" || this.paused) return;
    if (this.mode === "client") this.link.send({ t: "act", a });
    else if (this.session) this.session.act(this.selfId, a);
  }
  cast(i) { this.battleAct({ a: "cast", s: i }); }
  dash() { this.battleAct({ a: "dash" }); }
  ult() { this.battleAct({ a: "ult" }); }

  // ───── 進行 ─────
  action(a) {
    if (this.mode === "client") return this.link.send({ t: "a", a });
    if (!this.session) return;
    this.session.action(this.selfId, a);
    this.afterAction();
  }
  afterAction() {
    const S = this.session;
    if (!S || !S.dirty) return;
    S.dirty = false;
    const st = S.publicState();
    const bk = st.mode === "dungeon" ? "dbest" : "best";
    if (st.best > (this.record[bk] || 0)) { this.record[bk] = st.best; store.set(REC, JSON.stringify(this.record)); }
    if (this.mode === "host") this.link.broadcast({ t: "state", s: st, code: this.code });
    if (this.mode === "solo") {
      if (st.mode !== "dungeon" && (st.phase === "pick" || st.phase === "reward")) store.set(SAVE, JSON.stringify({ v: 1, floor: S.floor, phase: S.phase, p: S.players[0] }));
      if (st.phase === "defeat" || st.phase === "victory") store.del(SAVE);
    }
    this.applyState(st);
  }
  applyState(st) {
    const prev = this.state?.phase;
    this.state = st;
    if (st.phase === "battle" && (prev !== "battle" || this.lastFloor !== st.floor)) {
      this.lastFloor = st.floor;
      this.demo = null;
      this.view.reset(); this.view.selfId = this.selfId; this.view.spin = 0;
      this.view.baseYaw = this.view.yaw = Math.PI - .35;
      if (st.mode === "dungeon") {
        this.view.setDungeon(st.seed, st.floor);
        this.ui.banner(`ステージ${st.floor}  ${THEMES[BOSSES[st.floor - 1].theme].name}`, "big");
        if (this.mode === "solo") { const p = st.players[0]; store.set(SAVE, JSON.stringify({ v: 2, mode: "dungeon", floor: st.floor, seed: st.seed, p: { char: p.char, weapon: p.weapon, level: p.level, uc: p.uc } })); }
      } else {
        this.view.setTheme(BOSSES[st.floor - 1].theme);
        this.ui.banner(`第${st.floor}層  ${BOSSES[st.floor - 1].name}`, "big");
      }
      this.sfx.play("boss-cast");
    }
    if (st.phase !== "battle" && prev === "battle") {
      if (st.phase === "reward") this.sfx.play("win");
    }
    if (st.phase !== "battle" && st.phase !== "lobby" && !this.demo && this.mode !== "title") this.startDemo(st.floor);
    this.ui.state(st);
  }
  hasSave() { return !!store.get(SAVE); }
  startSolo(mode = "tower") {
    this.leaveLink(); store.del(SAVE);
    this.mode = "solo"; this.selfId = "solo"; this.paused = false;
    this.session = new Session(mode); this.session.best = (mode === "dungeon" ? this.record.dbest : this.record.best) || 0;
    this.session.addPlayer("solo", "あなた");
    this.session.start();
    this.afterAction();
  }
  continueSolo() {
    let d; try { d = JSON.parse(store.get(SAVE)); } catch {}
    if (!d) return this.startSolo();
    this.leaveLink();
    this.mode = "solo"; this.selfId = "solo"; this.paused = false;
    if (d.mode === "dungeon") {
      const S = this.session = new Session("dungeon"); S.best = this.record.dbest || 0;
      const p = S.addPlayer("solo", "あなた");
      Object.assign(p, d.p, { xp: 0 }); S.floor = d.floor; S.seed = d.seed; S.beginBattle(); S.dirty = true;
      return this.afterAction();
    }
    const S = this.session = new Session(); S.best = this.record.best;
    const p = S.addPlayer("solo", "あなた");
    Object.assign(p, d.p, { id: "solo" });
    S.floor = d.floor;
    if (d.phase === "reward") { S.phase = "reward"; p.ready = false; } else S.beginPick();
    S.dirty = true;
    this.afterAction();
  }
  setPaused(v) {
    if (this.mode !== "solo") return;
    this.paused = v; this.ui.pauseMenu(v);
  }
  toTitle() {
    this.leaveLink();
    this.mode = "title"; this.session = null; this.state = null; this.paused = false; this.selfId = null;
    this.ui.pauseMenu(false);
    this.startDemo();
    this.ui.title();
  }
  leaveLink() { if (this.link) { try { this.link.close(); } catch {} this.link = null; } this.code = null; }

  // ───── マルチ(PeerJS) ─────
  hostRoom(name, mode = "dungeon") {
    if (!window.Peer) return this.ui.multiMenu("通信ライブラリを読み込めませんでした。インターネット接続を確認してください。");
    this.leaveLink();
    this.ui.multiMenu("部屋を作っています…");
    const ids = new Map(); let next = 2;
    const h = new P2PHost({
      ready: (code) => {
        this.mode = "host"; this.code = code; this.selfId = "p1";
        this.session = new Session(mode); this.session.best = (mode === "dungeon" ? this.record.dbest : this.record.best) || 0;
        this.session.addPlayer("p1", name || undefined);
        this.afterAction();
      },
      error: (t) => this.ui.multiMenu(t),
      status: (t) => { if (t) this.ui.banner(t, "red"); else this.ui.banner("通信が戻りました"); },
      message: (conn, m) => {
        const S = this.session; if (!S) return;
        if (m.t === "join") {
          if (ids.has(conn)) return;
          if (S.phase !== "lobby") return h.send(conn, { t: "error", msg: "この部屋はもう冒険を始めています。" });
          if (S.players.length >= MAX_PLAYERS) return h.send(conn, { t: "error", msg: "この部屋は満員です。" });
          const id = "p" + next++;
          S.addPlayer(id, String(m.name || "").slice(0, 10) || undefined);
          ids.set(conn, id);
          h.send(conn, { t: "joined", id, code: this.code });
          this.afterAction();
          return;
        }
        const id = ids.get(conn); if (!id) return;
        if (m.t === "a") { S.action(id, m.a); this.afterAction(); }
        else if (m.t === "in") S.input(id, m.i);
        else if (m.t === "act") S.act(id, m.a);
      },
      leave: (conn) => { const id = ids.get(conn); if (!id || !this.session) return; ids.delete(conn); this.session.removePlayer(id); this.afterAction(); },
    });
    this.link = h;
  }
  joinRoom(code, name) {
    if (!window.Peer) return this.ui.multiMenu("通信ライブラリを読み込めませんでした。インターネット接続を確認してください。");
    this.leaveLink();
    this.ui.multiMenu("部屋を探しています…");
    const c = new P2PClient(code, {
      open: () => c.send({ t: "join", name }),
      message: (m) => {
        if (m.t === "error") { this.leaveLink(); this.mode = "title"; this.ui.multiMenu(m.msg); }
        else if (m.t === "joined") { this.mode = "client"; this.selfId = m.id; this.code = m.code; }
        else if (m.t === "state") { this.code = m.code; this.applyState(m.s); }
        else if (m.t === "snap") { if (this.state?.phase === "battle") this.view.push(m.s); }
      },
      close: () => { if (this.mode === "client") { this.toTitle(); this.ui.multiMenu("部屋との接続が切れました。"); } },
      error: (t) => { this.mode = "title"; this.ui.multiMenu(t); },
    });
    this.link = c;
  }

  // ───── 30Hz の計算 ─────
  tick() {
    if (this.demo) this.demoTick();
    if (this.mode === "client") {
      if (this.state?.phase === "battle") {
        const i = this.moveDir(), key = i.mx + "," + i.my;
        if (key !== this.lastIn || ++this.tickN % 10 === 0) { this.lastIn = key; this.link.send({ t: "in", i }); }
        if (this.hold && this.tickN % 3 === 0) this.link.send({ t: "act", a: { a: "cast", s: 0 } });
      }
      return;
    }
    const S = this.session;
    if (!S || S.phase !== "battle" || this.paused) return;
    S.input(this.selfId, this.moveDir());
    if (this.hold && !this.paused) S.act(this.selfId, { a: "cast", s: 0 });
    S.tick();
    if (S.world) {
      const snap = S.world.snap();
      this.view.push(snap);
      if (this.mode === "host") {
        this.pend.push(...snap.ev);
        if (++this.tickN % 2 === 0 || snap.cut) { this.link.broadcast({ t: "snap", s: { ...snap, ev: this.pend } }); this.pend = []; }
      }
    }
    if (S.dirty) {
      if (S.phase !== "battle") setTimeout(() => this.afterAction(), 0);
      else this.afterAction();
    }
  }

  // タイトルや選択画面の背景: ボットが実際の戦闘ロジックで魔法を撃ち合う
  startDemo(floor) {
    const f = floor || 1 + Math.floor(Math.random() * FLOORS);
    const bots = [0, 1].map((i) => {
      const slots = [...SPELL_IDS].sort(() => Math.random() - .5).slice(0, 4).map((id) => ({ id, rank: 3 }));
      return { id: "d" + i, name: "", color: PLAYER_COLORS[(i + f) % 4], slots, ult: ULT_IDS[(f + i) % ULT_IDS.length], uc: .6, stats: { hp: 0, atk: 0, cdr: 2, spd: 0, ultc: 0 } };
    });
    const w = new World(f, bots);
    for (const p of w.players) { p.mh = p.hp = 1e9; }
    w.boss.hp = w.boss.mh = 1e9; w.ultNeed = 4000;
    this.demo = { w, t: 0 };
    this.view.reset(); this.view.selfId = null; this.view.spin = .12;
    this.view.setTheme(BOSSES[f - 1].theme);
  }
  demoTick() {
    const d = this.demo, w = d.w; d.t += TICK;
    w.players.forEach((p, i) => {
      const a = d.t * .5 + i * Math.PI;
      w.input(p.id, { mx: Math.cos(a) * .6, my: Math.sin(a) * .6 });
      if (Math.random() < .05) w.act(p.id, { a: "cast", s: Math.floor(Math.random() * 4) });
      if (p.uc >= 1 && Math.random() < .02) w.act(p.id, { a: "ult" });
      p.hp = p.mh;
    });
    w.step();
    w.boss.hp = w.boss.mh;
    this.view.push(w.snap());
  }

  // ───── 描画 ─────
  frame(t) {
    this.view.render(t);
    if (this.state?.phase === "battle" && this.view.cur) this.ui.frame(this.view.cur);
  }
  onViewEvent(e) {
    if (e.t === "ultcard" && !this.demo) this.ui.ultCard(e);
    if (e.t === "hurtme") { const v = document.getElementById("vignette"); v.classList.remove("hit"); void v.offsetWidth; v.classList.add("hit"); }
    if (e.t === "phase" && !this.demo) this.ui.banner("ボスが怒り狂った!", "red");
    if (this.demo) return;
    if (e.t === "pickup") this.ui.toast(e.pot ? "回復薬 +35%" : e.eq ? `${e.name} を装備した!` : `${e.name} — 今の武器が強いので経験値に変えた`, e.pot ? "#ff8a9a" : RARITY[e.r].color);
    if (e.t === "lvup") this.ui.banner(`レベルアップ! Lv${e.lv}`);
    if (e.t === "gate") this.ui.banner("ゲートが開いた! 全員で入ると次のステージへ", "big");
    if (e.t === "bosswake" && this.state) this.ui.banner(BOSSES[this.state.floor - 1].name, "red");
  }
}

window.game = new Game();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
