// メニュー、HUD、タッチ操作。DOM で作る(文字をくっきり読めるように)。
import { SPELLS, ULTS, ELEMENTS, REWARDS, BOSSES, THEMES, MAX_SLOTS, MAX_RANK, FLOORS, spellCd, spellDmg, CHARS, DWEAPONS, RARITY, STAGES, TILE } from "../sim/data.js";
import { normCode, CODE_LEN } from "../net/p2p.js";

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === "on") for (const ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
    else if (k === "style" && typeof attrs.style === "object") Object.assign(e.style, attrs.style);
    else if (k === "class") e.className = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const TIER = { 1: "基本", 2: "上級" };
const KEYS = ["J", "K", "L", "I"];

export class UI {
  constructor(game) {
    this.G = game; this.root = $("#ui"); this.hud = $("#hud"); this.sel = {};
    this.touch = matchMedia("(pointer: coarse)").matches;
    document.body.classList.toggle("touch", this.touch);
  }
  clear() { this.root.innerHTML = ""; this.root.className = ""; }
  btn(label, fn, cls = "") { return h("button", { class: "btn " + cls, on: { click: () => { this.G.sfx.play("ui"); fn(); } } }, label); }
  panel(...kids) { this.clear(); const p = h("div", { class: "panel" }, ...kids); this.root.append(p); this.root.className = "show"; return p; }

  // ───── タイトル ─────
  title() {
    this.hideHud();
    const G = this.G, best = G.record.best;
    this.clear(); this.root.className = "show title";
    this.root.append(h("div", { class: "logo" },
      h("div", { class: "logo-sub" }, "まほうせんそう"),
      h("h1", {}, "魔法戦争", h("span", {}, "3D")),
      h("p", {}, "3Dドット絵の魔法ローグライク — 迷宮を探索するか、塔でボスと戦うか"),
    ), h("div", { class: "menu" },
      G.hasSave() ? this.btn("つづきから", () => G.continueSolo(), "primary") : null,
      h("div", { class: "modes" },
        h("button", { class: "mode", on: { click: () => { G.sfx.play("ui"); G.startSolo("dungeon"); } } }, h("b", {}, "迷宮モード"), h("small", {}, "部屋を探索・宝箱・武器・ゲート"), h("i", {}, "4人のキャラから選ぶ")),
        h("button", { class: "mode", on: { click: () => { G.sfx.play("ui"); G.startSolo("tower"); } } }, h("b", {}, "塔モード"), h("small", {}, "円形の闘技場でボス連戦"), h("i", {}, "魔法を選んで育てる")),
      ),
      this.btn("仲間と挑む(2〜4人)", () => this.multiMenu()),
      this.btn("遊び方", () => this.howto()),
    ), h("div", { class: "foot" }, best ? `塔: 第${Math.min(best, FLOORS)}層${best > FLOORS ? "(踏破!)" : ""}  ` : "", G.record.dbest ? `迷宮: ステージ${Math.min(G.record.dbest, STAGES)}${G.record.dbest > STAGES ? "(踏破!)" : ""}` : "", G.canInstall() ? h("button", { class: "link", on: { click: () => G.install() } }, "ホーム画面に追加") : null));
  }
  howto() {
    this.panel(
      h("h2", {}, "遊び方"),
      h("ul", { class: "howto" },
        h("li", {}, "迷宮モード: 剣士・弓使い・魔導士・召喚師から選び、部屋をめぐって敵を倒す。宝箱から武器(5段階のレア度)、敵から回復薬。最奥のボスを倒すとゲートが開き、全員で入ると次のステージへ(全10ステージ)。"),
        h("li", {}, "塔モード: 各層のはじめに魔法を1つ選ぶ。同じ魔法を選ぶとランクアップ(最大5)。持てる魔法は4つまで。"),
        h("li", {}, "魔法は自動で一番近い敵を狙う。赤い印は敵の攻撃が来る場所。よけよう。"),
        h("li", {}, "敵にダメージを与えると究極魔法が溜まる。溜まったら発動 — 時が止まり、カットシーンが始まる。"),
        h("li", {}, "ボスを倒すと強化を1つ選べる。全滅すると第1層からやり直し。"),
        h("li", {}, "マルチでは倒れても、誰かがボスに勝てば次の層で復活する。"),
      ),
      h("table", { class: "keys" },
        h("tr", {}, h("th", {}, "移動"), h("td", {}, "WASD / 矢印 ・ スマホは左側をドラッグ")),
        h("tr", {}, h("th", {}, "攻撃 / 魔法"), h("td", {}, "J(押しっぱなしで連続)  K L I または 1 2 3 4")),
        h("tr", {}, h("th", {}, "回避"), h("td", {}, "スペース")),
        h("tr", {}, h("th", {}, "究極魔法"), h("td", {}, "E")),
        h("tr", {}, h("th", {}, "一時停止 / 消音"), h("td", {}, "Esc / M")),
      ),
      this.btn("もどる", () => this.title()),
    );
  }
  multiMenu(msg = "") {
    this.hideHud();
    const G = this.G;
    const name = h("input", { maxlength: 10, placeholder: "なまえ", value: G.myName || "" });
    // maxlength は付けない(日本語入力の全角や空白が混ざると5文字に届かず切れるため)。normCode でそろえる。
    const code = h("input", { placeholder: "ルームコード", class: "code", autocapitalize: "characters", autocomplete: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "go" });
    const mode = h("select", {}, h("option", { value: "dungeon" }, "迷宮モード"), h("option", { value: "tower" }, "塔モード"));
    const save = () => { G.myName = name.value.trim(); try { localStorage.setItem("mw3d-name", G.myName); } catch {} };
    this.panel(
      h("h2", {}, "仲間と挑む"),
      h("p", { class: "note" }, "部屋を作るとコードが出ます。仲間は同じページを開いて、そのコードで入ります。"),
      h("label", {}, "なまえ", name),
      h("div", { class: "row" }, mode, this.btn("部屋を作る", () => { save(); G.hostRoom(name.value.trim(), mode.value); }, "primary")),
      h("div", { class: "row" }, code, this.btn("部屋に入る", () => {
        save();
        const c = normCode(code.value);
        if (c.length !== CODE_LEN) return this.multiMenu(`コードは英数字${CODE_LEN}文字です(いま「${code.value.trim() || "なし"}」)。`);
        G.joinRoom(c, name.value.trim());
      })),
      msg ? h("p", { class: "msg" }, msg) : null,
      this.btn("もどる", () => { G.toTitle(); }),
    );
  }

  // ───── 進行に応じた画面 ─────
  state(st) {
    const G = this.G, me = st.players.find((p) => p.id === G.selfId);
    if (st.phase === "battle") { this.clear(); return this.buildHud(st); }
    this.hideHud();
    if (st.phase === "lobby") return this.lobby(st);
    if (!me) return;
    if (st.phase === "pick") return st.mode === "dungeon" ? this.charPick(st, me) : this.pick(st, me);
    if (st.phase === "reward") return this.reward(st, me);
    if (st.phase === "defeat" || st.phase === "victory") return this.end(st, me);
  }
  waiting(st) {
    return h("div", { class: "wait" }, st.players.map((p) => h("span", { class: p.ready ? "ok" : "", style: { borderColor: p.color } }, p.name + (p.ready ? " ✓" : " …"))));
  }
  lobby(st) {
    const G = this.G, isHost = G.mode === "host";
    this.panel(
      h("h2", {}, "部屋 — " + (st.mode === "dungeon" ? "迷宮モード" : "塔モード")),
      h("div", { class: "roomcode" }, G.code || "-----"),
      h("p", { class: "note" }, "このコードを仲間に伝えてください(最大4人)"),
      h("div", { class: "plist" }, st.players.map((p) => h("div", { class: "pl", style: { borderColor: p.color } }, h("i", { style: { background: p.color } }), p.name))),
      isHost ? this.btn("冒険を始める", () => G.action({ type: "start" }), "primary") : h("p", { class: "note" }, "部屋を作った人が始めるのを待っています…"),
      this.btn("部屋を出る", () => G.toTitle()),
    );
  }
  floorHead(st) {
    const B = BOSSES[st.floor - 1], T = THEMES[B.theme];
    return h("div", { class: "floorhead" }, h("div", { class: "fl" }, `第${st.floor}層`, h("small", {}, ` / ${FLOORS}`)), h("div", { class: "place" }, T.name + " — " + B.name),
      h("div", { class: "weak" }, B.weak.length ? "弱点: " + B.weak.map((e) => ELEMENTS[e].name).join("・") : "弱点なし", B.resist.length ? "  耐性: " + B.resist.map((e) => ELEMENTS[e].name).join("・") : ""));
  }
  spellCard(id, me, on, sel) {
    const S = SPELLS[id], E = ELEMENTS[S.elem], own = me.slots.find((s) => s.id === id), r = own ? own.rank + 1 : 1;
    return h("button", { class: "card" + (sel ? " sel" : "") + (S.tier === 2 ? " t2" : ""), style: { "--c": E.color }, on: { click: on } },
      h("div", { class: "ct" }, h("b", { class: "el" }, E.name), h("span", { class: "tier" }, TIER[S.tier])),
      h("div", { class: "cn" }, S.name),
      h("div", { class: "cd" }, S.desc),
      h("div", { class: "cs" }, (S.dmg ? `威力 ${Math.round(spellDmg(S, r))}  ` : "") + `再使用 ${spellCd(S, r).toFixed(1)}秒`, h("span", { class: "rk" }, own ? `ランク${own.rank}→${r}` : "新しい魔法")));
  }
  pick(st, me) {
    const G = this.G, s = this.sel;
    if (s.floor !== st.floor) { this.sel = { floor: st.floor }; }
    const sel = this.sel;
    if (me.ready) {
      return this.panel(this.floorHead(st), h("h3", {}, "準備完了"), h("p", { class: "note" }, "仲間の選択を待っています…"), this.waiting(st));
    }
    const needSlot = sel.spell && !me.slots.find((q) => q.id === sel.spell) && me.slots.length >= MAX_SLOTS;
    const can = sel.spell && (me.ult || sel.ult) && (!needSlot || sel.slot != null);
    const redraw = () => this.pick(st, me);
    this.panel(
      this.floorHead(st),
      !me.ult ? [h("h3", {}, "究極魔法をひとつ選ぶ", h("small", {}, "(この挑戦の間ずっと使う)")),
        h("div", { class: "cards" }, me.ultOffer.map((id) => {
          const U = ULTS[id], E = ELEMENTS[U.elem];
          return h("button", { class: "card ult" + (sel.ult === id ? " sel" : ""), style: { "--c": E.color }, on: { click: () => { sel.ult = id; G.sfx.play("ui2"); redraw(); } } },
            h("div", { class: "ct" }, h("b", { class: "el" }, E.name), h("span", { class: "tier" }, "究極")), h("div", { class: "cn" }, U.name), h("div", { class: "cd" }, U.desc));
        }))] : null,
      h("h3", {}, "魔法をひとつ選ぶ"),
      h("div", { class: "cards" }, me.offer.map((id) => this.spellCard(id, me, () => { sel.spell = id; sel.slot = null; G.sfx.play("ui2"); redraw(); }, sel.spell === id))),
      needSlot ? [h("h3", { class: "warn" }, "魔法は4つまで — 入れ替える魔法を選ぶ"), h("div", { class: "slots" }, me.slots.map((q, i) => {
        const S = SPELLS[q.id];
        return h("button", { class: "slot" + (sel.slot === i ? " sel" : ""), style: { "--c": ELEMENTS[S.elem].color }, on: { click: () => { sel.slot = i; redraw(); } } }, h("b", {}, ELEMENTS[S.elem].name), S.name, h("small", {}, ` R${q.rank}`));
      }))] : null,
      me.slots.length && !needSlot ? h("div", { class: "owned" }, "所持: ", me.slots.map((q) => h("span", { style: { color: ELEMENTS[SPELLS[q.id].elem].color } }, `${SPELLS[q.id].name} R${q.rank}`))) : null,
      h("button", { class: "btn primary" + (can ? "" : " off"), on: { click: () => { if (!can) return; G.sfx.play("ui2"); G.action({ type: "pick", spell: sel.spell, ult: sel.ult, slot: sel.slot }); } } }, "決定して挑む"),
      G.mode !== "solo" ? this.waiting(st) : null,
    );
  }
  reward(st, me) {
    const G = this.G;
    if (me.ready) return this.panel(h("h2", { class: "win" }, `第${st.floor}層 突破!`), h("p", { class: "note" }, "仲間の選択を待っています…"), this.waiting(st));
    this.panel(
      h("h2", { class: "win" }, `第${st.floor}層 突破!`),
      h("h3", {}, "強化をひとつ選ぶ"),
      h("div", { class: "cards" }, me.rewardOffer.map((id) => h("button", { class: "card rw", on: { click: () => { G.sfx.play("ui2"); G.action({ type: "reward", id }); } } }, h("div", { class: "cn" }, REWARDS[id].name), h("div", { class: "cd" }, REWARDS[id].desc)))),
      G.mode !== "solo" ? this.waiting(st) : null,
    );
  }
  end(st) {
    const G = this.G, win = st.phase === "victory", isHost = G.mode !== "client";
    this.panel(
      h("h2", { class: win ? "win" : "lose" }, win ? (st.mode === "dungeon" ? "迷宮を踏破した!" : "塔を踏破した!") : "全滅…"),
      h("p", {}, win ? "魔法戦争の王を打ち倒した。" : st.mode === "dungeon" ? `ステージ${st.floor}で倒れた。武器もレベルもすべて失われる。` : `第${st.floor}層で倒れた。魔法と強化はすべて失われる。`),
      h("p", { class: "note" }, st.mode === "dungeon" ? `最高到達: ステージ${Math.min(st.best, STAGES)}` : `最高到達: 第${Math.min(st.best, FLOORS)}層`),
      isHost ? this.btn("第1層から挑み直す", () => G.action({ type: "retry" }), "primary") : h("p", { class: "note" }, "部屋を作った人の操作を待っています…"),
      this.btn("タイトルへ", () => G.toTitle()),
    );
  }

  // ───── 戦闘中の HUD ─────
  hideHud() { this.hud.className = "hidden"; this.hudBuilt = null; }
  buildHud(st) {
    const G = this.G, me = st.players.find((p) => p.id === G.selfId), B = BOSSES[st.floor - 1];
    if (this.hudBuilt === st.floor + ":" + G.selfId) return;
    this.hudBuilt = st.floor + ":" + G.selfId;
    this.hud.className = "";
    this.hud.innerHTML = "";
    const dun = st.mode === "dungeon", C = dun && me?.char ? CHARS[me.char] : null;
    const ids = C ? C.skills : (me?.slots || []).map((q) => q.id);
    const slots = ids.map((id, i) => {
      const S = SPELLS[id], E = ELEMENTS[S.elem], atk = dun && i === 0;
      const b = h("button", { class: "sp t" + S.tier + (atk ? " atk" : ""), style: { "--c": atk ? "#e8d8c0" : E.color }, "data-i": i }, h("b", {}, atk ? "攻撃" : E.name), h("small", {}, S.name), h("i", { class: "cdv" }), h("em", { class: "key" }, KEYS[i]));
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); if (atk) G.hold = true; G.cast(i); });
      if (atk) for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => (G.hold = false));
      return b;
    });
    const U = (C ? ULTS[C.ult] : me?.ult && ULTS[me.ult]);
    const ult = h("button", { class: "ultb", style: { "--c": U ? ELEMENTS[U.elem].color : "#fff" } }, h("b", {}, "究極"), h("small", {}, U ? U.name : ""), h("i", { class: "ring" }), h("em", { class: "key" }, "E"));
    ult.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); G.ult(); });
    const dash = h("button", { class: "dashb" }, "回避", h("em", { class: "key" }, "Space"));
    dash.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); G.dash(); });
    this.hud.append(
      h("div", { class: "boss" + (dun ? " hidden" : "") }, h("div", { class: "bn" }, B.name), h("div", { class: "bar" }, h("i", { class: "bf" }), h("i", { class: "bd" }))),
      dun ? h("canvas", { class: "mini", width: 92, height: 80 }) : null,
      h("div", { class: "party" }),
      h("div", { class: "pause" }, G.mode === "solo" ? h("button", { on: { click: () => G.setPaused(true) } }, "Ⅱ") : null, h("button", { on: { click: () => { G.sfx.muted = !G.sfx.muted; } } }, "♪")),
      h("div", { class: "pad" }, dash, h("div", { class: "spells" }, slots), ult),
      h("div", { class: "stick" }, h("i")),
      h("div", { class: "floortag" }, dun ? `ステージ${st.floor} ${THEMES[B.theme].name}` : `第${st.floor}層`),
    );
    this.stick = $(".stick", this.hud);
  }
  /** 毎フレーム: スナップショットから HUD を更新。 */
  frame(s) {
    if (!this.hudBuilt || !s) return;
    const G = this.G, b = s.bo;
    if (b && s.mode === "d") $(".boss", this.hud).classList.toggle("hidden", b.st === "sleep" || b.hp <= 0);
    if (b) { const f = Math.max(0, b.hp / b.mh); $(".bf", this.hud).style.width = f * 100 + "%"; const bd = $(".bd", this.hud); bd.style.width = Math.max(parseFloat(bd.style.width || 100) - .4, f * 100) + "%"; $(".boss", this.hud).classList.toggle("p2", b.ph === 2); }
    const party = $(".party", this.hud);
    if (party.childElementCount !== s.pl.length) { party.innerHTML = ""; for (const p of s.pl) party.append(h("div", { class: "pm" + (p.id === G.selfId ? " me" : ""), "data-id": p.id }, h("span", { style: { color: p.c } }, p.n), h("em", { class: "lv" }), h("div", { class: "hp" }, h("i")), p.ch ? h("div", { class: "xp" }, h("i")) : null)); }
    for (const p of s.pl) {
      const el = party.querySelector(`[data-id="${p.id}"]`); if (!el) continue;
      el.querySelector(".hp i").style.width = Math.max(0, p.hp / p.mh) * 100 + "%";
      if (p.ch) { el.querySelector(".xp i").style.width = p.xp * 100 + "%"; const lv = el.querySelector(".lv"), t = `Lv${p.lv} ${p.wn}`; if (lv.textContent !== t) { lv.textContent = t; lv.style.color = RARITY[p.wr].color; } }
      el.classList.toggle("down", !!p.dn);
    }
    const me = s.pl.find((p) => p.id === G.selfId); if (!me) return;
    const btns = this.hud.querySelectorAll(".sp");
    me.sl.forEach((q, i) => { const bt = btns[i]; if (!bt) return; const f = q[3] ? q[2] / q[3] : 0; bt.querySelector(".cdv").style.height = f * 100 + "%"; bt.classList.toggle("cool", q[2] > 0); });
    const ub = $(".ultb", this.hud);
    ub.style.setProperty("--p", Math.min(1, me.uc) * 360 + "deg"); ub.classList.toggle("ready", me.uc >= 1);
    $(".dashb", this.hud).classList.toggle("cool", me.dc > 0);
    this.hud.classList.toggle("dead", !!me.dn);
    if (s.mode === "d" && (this.mf = (this.mf || 0) + 1) % 8 === 0) this.minimap(s);
  }
  charPick(st, me) {
    const G = this.G;
    if (me.ready) return this.panel(h("h2", {}, "迷宮モード"), h("p", { class: "note" }, "仲間の選択を待っています…"), this.waiting(st));
    this.panel(
      h("h2", {}, "迷宮モード — キャラクターを選ぶ"),
      h("p", { class: "note" }, "部屋をめぐって宝箱から武器を集め、最奥のボスを倒してゲートへ。全10ステージ。"),
      h("div", { class: "cards chars" }, Object.entries(CHARS).map(([id, C]) => {
        const [a, s1, s2] = C.skills.map((k) => SPELLS[k]), U = ULTS[C.ult];
        return h("button", { class: "card char", style: { "--c": me.color }, on: { click: () => { G.sfx.play("ui2"); G.action({ type: "char", id }); } } },
          h("div", { class: "cn" }, C.name, h("small", {}, `  HP ${C.hp}`)),
          h("div", { class: "cd" }, C.desc),
          h("div", { class: "sk" }, h("span", {}, "攻撃: " + a.name + "(" + C.weapons.map((w) => DWEAPONS[w].name).join("・") + ")")),
          h("div", { class: "sk" }, h("span", { class: "t1" }, "基本"), s1.name), h("div", { class: "sk" }, h("span", { class: "t2" }, "上級"), s2.name),
          h("div", { class: "sk" }, h("span", { class: "t3" }, "究極"), U.name));
      })),
      G.mode !== "solo" ? this.waiting(st) : null,
    );
  }
  minimap(s) {
    const c = this.hud.querySelector(".mini"), M = this.G.view.M, seen = this.G.view.seen; if (!c || !M) return;
    const g = c.getContext("2d"), k = Math.min(c.width / M.W, c.height / M.H);
    g.clearRect(0, 0, c.width, c.height); g.fillStyle = "rgba(10,6,18,.75)"; g.fillRect(0, 0, c.width, c.height);
    // 迷宮の向き(画面と同じに左右反転)
    const X = (tx) => tx * k;
    for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) if (M.g[y * M.W + x] && seen[y * M.W + x]) { g.fillStyle = "#5c5274"; g.fillRect(X(x), y * k, k, k); }
    const dot = (wx, wy, col, r = 2) => { g.fillStyle = col; g.fillRect(Math.round(X(wx / TILE) - r / 2 + k / 2), Math.round(wy / TILE * k - r / 2), r, r); };
    for (const [, x, y, open] of s.ch || []) if (!open && seen[Math.floor(y / TILE) * M.W + Math.floor(x / TILE)]) dot(x, y, "#ffd060");
    const br = M.boss; if (seen[br.cy * M.W + br.cx]) { g.strokeStyle = "#ff4a5a"; g.strokeRect(X(br.x + br.w - 1), br.y * k, br.w * k, br.h * k); }
    if (s.gate) dot(s.gate[0], s.gate[1], "#e0a8ff", 4);
    for (const p of s.pl) dot(p.x, p.y, p.id === this.G.selfId ? "#ffffff" : p.c, 3);
  }
  toast(text, color = "#fff") {
    const c = h("div", { class: "toast", style: { color } }, text);
    $("#banners").append(c);
    setTimeout(() => c.remove(), 1800);
  }
  setStick(on, x, y, dx, dy) {
    const s = this.stick; if (!s) return;
    s.classList.toggle("on", on);
    if (on) { s.style.left = x + "px"; s.style.top = y + "px"; s.firstChild.style.transform = `translate(${dx}px, ${dy}px)`; }
  }
  ultCard(e) {
    const c = h("div", { class: "ultcard", style: { "--c": e.color } }, h("small", {}, "究極魔法"), h("div", {}, e.name));
    $("#banners").append(c);
    setTimeout(() => c.remove(), 2400);
  }
  banner(text, cls = "") {
    const c = h("div", { class: "banner " + cls }, text);
    $("#banners").append(c);
    setTimeout(() => c.remove(), 2200);
  }
  pauseMenu(on) {
    if (!on) { const p = $(".pausemenu"); if (p) p.remove(); return; }
    const G = this.G;
    this.root.append(h("div", { class: "pausemenu panel" }, h("h2", {}, "一時停止"), this.btn("つづける", () => G.setPaused(false), "primary"), this.btn("あきらめてタイトルへ", () => G.toTitle())));
    this.root.className = "show";
  }
}
