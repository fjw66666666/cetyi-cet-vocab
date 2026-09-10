// 离线缓存：应用外壳 + 已加载的词库分片 + 下载文件后台缓存
const CACHE = 'cetyi-v5';
const DOWNLOAD_CACHE = 'cetyi-downloads-v1';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== DOWNLOAD_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // 词库分片与应用外壳：缓存优先，后台更新
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fetched = fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fetched;
    }),
  );
});

// 后台下载缓存：页面通过 postMessage 发送 { type: 'cache-download', url }
self.addEventListener('message', (e) => {
  if (e.data?.type === 'cache-download') {
    const { url } = e.data;
    e.waitUntil(
      caches.open(DOWNLOAD_CACHE).then((cache) =>
        fetch(url)
          .then((res) => {
            if (res.ok) cache.put(url, res.clone());
          })
          .catch(() => {}),
      ),
    );
  }
});
