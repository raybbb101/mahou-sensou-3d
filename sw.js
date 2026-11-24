// オフラインでも遊べるように、ゲームのファイルを保存しておく(オンライン協力はネットが必要)。
const CACHE = "mahou-sensou-3d-v4";
const FILES = ["./", "index.html", "style.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png",
  "src/main.js", "src/net/p2p.js", "src/ui/ui.js", "src/sim/data.js", "src/sim/world.js", "src/sim/session.js", "src/sim/dungeon.js",
  "src/render/view.js", "src/render/voxel.js", "src/render/models.js", "src/render/fx.js", "src/render/audio.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // まずネットから(更新をすぐ反映)、だめなら保存したもの
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
