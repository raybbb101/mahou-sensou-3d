// 協力プレイの通信。ブラウザ同士を WebRTC で直接つなぐので、ゲーム用のサーバーは要らない。
// 相手を見つける(シグナリング)には Trystero を使い、公開の nostr リレーを何十か所も同時に使う。
// (以前は PeerJS の無料サーバー1か所に頼っていて、そこが遅い・落ちていると部屋に入れなかった)
// 部屋を作った人のブラウザが戦闘を計算し、仲間には結果を送る。
const APP_ID = "raybbb101/mahou-sensou-3d";
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 見間違えやすい文字は除く
export const CODE_LEN = 5;
const JOIN_TIMEOUT_MS = 30000;
// 相手と直接つながらない回線(スマホのモバイル回線どうし等)のための中継。つながらない時だけ使われる。
const TURN = [{ urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" }];

/** 入力されたコードをそろえる。日本語キーボードの全角(ＡＢＣ１２)→半角、小文字→大文字、空白や記号は消す。 */
export const normCode = (s) => String(s || "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");

// 相手を見つけるのに使う nostr リレー。部屋主と仲間は「同じリレーのどれか1つ」に両方つながれば出会える。
// Trystero に任せると appId から小さなリレーを5つだけ選び、そこが落ちている・弾かれると誰とも会えなかった。
// なので利用者の多い大きなリレー(+日本のリレー)をこちらで指定し、全部に同時につなぐ。
const RELAYS = [
  "wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net", "wss://relay.snort.social",
  "wss://relay.nostr.net", "wss://nostr.mom", "wss://offchain.pub", "wss://relay.nostr.band",
  "wss://yabu.me", "wss://relay-jp.nostr.wirednet.jp", "wss://r.kojira.io", "wss://nostr-pub.wellorder.net",
];
// ?relay=ws://…(カンマ区切りで複数可)を付けると、そのリレーだけを使う(手元でのテスト用)。
const relayParam = new URLSearchParams(location.search).get("relay");
const relayUrls = relayParam ? relayParam.split(",") : RELAYS;

const open = async (code) => {
  const { joinRoom } = await import("./trystero/trystero/index.js");
  const room = joinRoom({ appId: APP_ID, identity: "none", turnConfig: TURN, relayConfig: { urls: relayUrls } }, "room-" + code);
  const act = room.makeAction("m");
  return { room, act };
};
const errText = (e) => {
  const c = e && e.code;
  if (c === "relay-failed") return "接続サーバーに届きません。インターネット接続を確認してください。";
  if (c === "peer-connect-failed") return "相手は見つかりましたが、回線どうしが直接つながりませんでした。片方を Wi-Fi に(または両方を同じ Wi-Fi に)して試してください。";
  return null;
};

/** 部屋を作る側。handlers: { ready(code), message(conn, msg), leave(conn), error(text), status(text|null) }
 *  conn は相手の peerId(文字列)。 */
export class P2PHost {
  constructor(H) {
    this.H = H; this.conns = new Set(); this.closed = false;
    let code = "";
    for (let i = 0; i < CODE_LEN; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
    open(code).then(({ room, act }) => {
      if (this.closed) return room.leave();
      this.room = room; this.act = act; this.code = code;
      // 入ってきた人に「ここが部屋主」と知らせる。仲間はこれを受け取ってから参加を申し込む。
      room.onPeerJoin(({ peerId }) => { this.conns.add(peerId); act.send({ t: "host" }, { target: peerId }).catch(() => {}); }, { replay: true });
      room.onPeerLeave(({ peerId }) => { if (this.conns.delete(peerId)) H.leave(peerId); });
      act.onMessage((m, { peerId }) => { if (m && m.t) H.message(peerId, m); });
      room.onError((e) => { const t = e?.code === "relay-failed" ? errText(e) : null; if (t) H.status?.(t); });
      H.ready(code);
    }, (e) => H.error("通信の準備ができませんでした(" + (e?.message || e) + ")"));
  }
  send(conn, m) { if (this.conns.has(conn)) this.act.send(m, { target: conn }).catch(() => {}); }
  broadcast(m) { if (this.act && this.conns.size) this.act.send(m).catch(() => {}); }
  close() { this.closed = true; try { this.room?.leave(); } catch {} }
}

/** 部屋に入る側。handlers: { open(), message(msg), close(), error(text) } */
export class P2PClient {
  constructor(code, H) {
    this.H = H; this.closed = false;
    code = normCode(code);
    let settled = false, lastErr = null;
    const fail = (t) => { if (!settled) { settled = true; clearTimeout(this.timer); H.error(t); this.close(); } };
    if (code.length !== CODE_LEN) { setTimeout(() => fail(`コードは英数字${CODE_LEN}文字です。`), 0); return; }
    this.timer = setTimeout(() => fail(lastErr || "部屋が見つかりません。コードを確認して、部屋を作った人にゲーム画面を開いたままにしてもらってください。"), JOIN_TIMEOUT_MS);
    open(code).then(({ room, act }) => {
      if (this.closed) return room.leave();
      this.room = room; this.act = act;
      act.onMessage((m, { peerId }) => {
        if (!m || !m.t) return;
        if (m.t === "host") {
          if (this.host) return;
          this.host = peerId; settled = true; clearTimeout(this.timer); H.open();
          return;
        }
        if (peerId === this.host) H.message(m);
      });
      room.onPeerLeave(({ peerId }) => { if (peerId === this.host && settled && !this.closed) H.close(); });
      room.onError((e) => { const t = errText(e); if (t) { lastErr = t; if (e.code === "relay-failed") fail(t); } });
    }, (e) => fail("通信の準備ができませんでした(" + (e?.message || e) + ")"));
  }
  send(m) { if (this.host) this.act.send(m, { target: this.host }).catch(() => {}); }
  close() { this.closed = true; clearTimeout(this.timer); try { this.room?.leave(); } catch {} }
}
