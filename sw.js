// vite.config.ts が版とファイル一覧のプレースホルダーを置き換えて sw.js として出力する。
const PREFIX = 'sinus-rescue-';
const CACHE = `${PREFIX}f1c3f976f5ab`;
const PRECACHE = ["./","manifest.webmanifest","assets/index-BHufbXcD.js","assets/index-CpM_qvuZ.css","assets/sinus-map-CWar1bBw.webp","icon-180.png","icon-192.png","icon-512.png"];
const NAVIGATION_TIMEOUT_MS = 3000;
// モジュールの読み込みは Origin ヘッダーが付くので、Vary で不一致にならないようにする。
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // github.io では同じオリジンに他のサイトが同居するので、自分のキャッシュだけを消す。
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function networkFirst(request) {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAVIGATION_TIMEOUT_MS));
  return Promise.race([fetch(request), timeout]).catch(() => caches.match('./', MATCH));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(caches.match(request, MATCH).then((cached) => cached ?? fetch(request)));
});
