const CACHE_NAME = 'chuanxun-v4';

// 本地文件 - 离线核心缓存
const LOCAL_FILES = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/backup-engine.js',
  './js/config.js',
  './js/core.js',
  './js/data.js',
  './js/features.js',
  './js/features/call.js',
  './js/features/envelope.js',
  './js/features/group-chat.js',
  './js/features/mood.js',
  './js/features/reply-library.js',
  './js/features/theme-editor.js',
  './js/games.js',
  './js/listeners.js',
  './js/onboarding.js',
  './js/state.js',
  './js/utils.js',
  './js/yy-remote-cards.js',
  './manifest.json'
];

// CDN 资源 - 尝试缓存但不阻塞安装
const CDN_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// 安装：缓存所有本地文件
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // 先缓存本地文件（必须成功）
      return cache.addAll(LOCAL_FILES).then(() => {
        // 再尝试缓存CDN资源（失败不影响安装）
        return Promise.allSettled(
          CDN_FILES.map(url => cache.add(url).catch(() => console.log('CDN缓存跳过:', url)))
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 拦截请求：JS和JSON文件走网络优先（保证更新及时），其他走缓存优先
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // 只处理 GET 请求，跳过 chrome-extension 等非 http(s) 请求
  if (event.request.method !== 'GET' || !url.startsWith('http')) return;

  // JS、JSON、HTML 文件：网络优先，失败了再用缓存
  if (url.endsWith('.js') || url.endsWith('.json') || url.endsWith('.html') || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // 其他文件（CSS、图片等）：缓存优先
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
