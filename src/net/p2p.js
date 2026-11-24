// PeerJS(WebRTC)でブラウザ同士を直接つなぐ。サーバーを置かなくても GitHub Pages だけで部屋を作れる。
// 部屋を作った人のブラウザが戦闘を計算し、仲間には結果を送る。
const PREFIX = "mahou-sensou-3d-";
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 見間違えやすい文字は除く
export const CODE_LEN = 5;
const JOIN_TIMEOUT_MS = 25000;   // 部屋に入るまでの待ち時間の上限
const JOIN_RETRIES = 4;          // 「見つからない」ときにつなぎ直す回数(部屋主がつなぎ直し中のことがある)
const JOIN_RETRY_MS = 2500;

/** 入力されたコードをそろえる。日本語キーボードの全角(ＡＢＣ１２)→半角、小文字→大文字、空白や記号は消す。 */
export const normCode = (s) => String(s || "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");

const errText = (err) => {
  const t = err && err.type;
  if (t === "peer-unavailable") return "その部屋が見つかりません。コードを確認するか、部屋を作った人にこの画面を開いたままにしてもらってください。";
  if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed") return "接続サーバーに届きません。インターネット接続を確認してください。";
  if (t === "browser-incompatible") return "このブラウザはオンライン協力に対応していません。";
  return "接続できませんでした(" + (t || err) + ")";
};

/** 部屋を作る側。handlers: { ready(code), conn(conn), message(conn, msg), leave(conn), error(text), status(text|null) }
 *  コードは一度決まったら変えない。スマホで別のアプリ(LINE など)に切り替えて接続サーバーとの通信が切れても、
 *  同じコードのままつなぎ直す。 */
export class P2PHost {
  constructor(H) {
    this.H = H; this.conns = new Set(); this.closed = false; this.retryT = 0; this.tries = 0;
    this.wake = () => { if (document.visibilityState !== "hidden") this.revive(); };
    document.addEventListener("visibilitychange", this.wake);
    addEventListener("online", this.wake);
    addEventListener("pageshow", this.wake);
    this.open();
  }
  open() {
    if (this.closed) return;
    let code = "";
    for (let i = 0; i < CODE_LEN; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
    this.bind(new window.Peer(PREFIX + code, { debug: 0 }), code);
  }
  bind(peer, code) {
    this.peer = peer;
    peer.on("open", () => {
      this.tries = 0;
      if (!this.code) { this.code = code; this.H.ready(code); }
      else this.H.status?.(null);
    });
    peer.on("error", (err) => {
      if (this.closed || peer !== this.peer) return;
      const t = err && err.type;
      if (!this.code) {
        // まだコードが決まっていない: 使われていたら別のコードで作り直す
        if (t === "unavailable-id") { peer.destroy(); this.open(); }
        else this.H.error(errText(err));
        return;
      }
      // 部屋ができた後のエラー。仲間がいなくなった等(peer-unavailable)は気にしない。
      // 接続サーバーとの通信が切れた / 前の接続がまだ残っていて同じIDが使えない → 少し待って同じコードでつなぎ直す
      if (t !== "peer-unavailable") { this.H.status?.("通信が切れました。つなぎ直しています…"); this.later(); }
    });
    peer.on("disconnected", () => {
      if (this.closed || peer !== this.peer || !this.code) return;
      this.H.status?.("通信が切れました。つなぎ直しています…");
      this.later();
    });
    peer.on("connection", (conn) => {
      const add = () => this.conns.add(conn);
      if (conn.open) add(); else conn.on("open", add);
      conn.on("data", (m) => { this.conns.add(conn); if (m && m.t) this.H.message(conn, m); });
      const gone = () => { if (this.conns.delete(conn)) this.H.leave(conn); };
      conn.on("close", gone);
      conn.on("error", gone);
    });
  }
  // 少し待ってつなぎ直す。失敗が続くほど間をあける(最大8秒)。
  later(ms) {
    if (this.closed || this.retryT) return;
    const wait = ms ?? Math.min(8000, 1000 * 2 ** Math.min(this.tries, 3));
    this.retryT = setTimeout(() => { this.retryT = 0; this.tries++; this.revive(); }, wait);
  }
  revive() {
    if (this.closed || !this.code) return;
    const p = this.peer;
    if (p && !p.destroyed && !p.disconnected) return;   // つながっている
    if (p && !p.destroyed) { try { p.reconnect(); } catch { this.later(); } return; }
    // peer が壊れていたら、同じコードで作り直す
    this.bind(new window.Peer(PREFIX + this.code, { debug: 0 }), this.code);
  }
  send(conn, m) { if (conn.open) conn.send(m); }
  broadcast(m) { for (const c of this.conns) if (c.open) c.send(m); }
  close() {
    this.closed = true; clearTimeout(this.retryT);
    document.removeEventListener("visibilitychange", this.wake);
    removeEventListener("online", this.wake);
    removeEventListener("pageshow", this.wake);
    try { this.peer?.destroy(); } catch {}
  }
}

/** 部屋に入る側。handlers: { open(), message(msg), close(), error(text) } */
export class P2PClient {
  constructor(code, H) {
    this.H = H;
    code = normCode(code);
    let settled = false, tries = 0, timer = 0;
    const fail = (t) => { if (!settled) { settled = true; clearTimeout(timer); clearTimeout(this.retryT); H.error(t); this.close(); } };
    if (code.length !== CODE_LEN) { setTimeout(() => fail(`コードは英数字${CODE_LEN}文字です。`), 0); return; }
    const peer = this.peer = new window.Peer({ debug: 0 });
    const tryConnect = () => {
      if (settled || peer.destroyed) return;
      try { this.conn?.close(); } catch {}
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: "json" });
      this.conn = conn;
      if (!conn) return retry({ type: "peer-unavailable" });
      conn.on("open", () => { if (this.conn !== conn) return; settled = true; clearTimeout(timer); clearTimeout(this.retryT); H.open(); });
      conn.on("data", (m) => { if (m && m.t) H.message(m); });
      conn.on("close", () => { if (settled && this.conn === conn) H.close(); });
      conn.on("error", () => {});
    };
    // 部屋が見つからないときは、すぐあきらめずに何度か探し直す(部屋主のスマホがつなぎ直し中のことがある)
    const retry = (err) => {
      if (settled) return;
      if (++tries > JOIN_RETRIES) return fail(errText(err));
      clearTimeout(this.retryT);
      this.retryT = setTimeout(tryConnect, JOIN_RETRY_MS);
    };
    peer.on("error", (err) => {
      if (settled) return;
      if (err?.type === "peer-unavailable") retry(err);
      else if (err?.type === "network" || err?.type === "disconnected") { try { peer.reconnect(); } catch { fail(errText(err)); } }
      else fail(errText(err));
    });
    peer.on("open", tryConnect);
    timer = setTimeout(() => fail("接続がタイムアウトしました。部屋を作った人にゲーム画面を開いたままにしてもらい、もう一度試してください。"), JOIN_TIMEOUT_MS);
  }
  send(m) { if (this.conn?.open) this.conn.send(m); }
  close() { clearTimeout(this.retryT); try { this.peer?.destroy(); } catch {} }
}
