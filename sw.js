// 缓存的名称和版本 - 修改此处版本号即可自动更新所有用户
const CACHE_NAME = 'qiqi-phone-cache-v2.15364';

// 需要缓存的核心文件列表
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './main.js',
  './style.css',
  './voice-bubble-fix.css',
  './chat-settings-page.css',
  './GLOBAL_MENU_FIX.js',
  './settings-ios-style.js',
  'https://i.postimg.cc/s2n0gxBB/appicon.png',
  'https://i.postimg.cc/s2n0gxBB/appicon.png'
];

// 1. 安装 Service Worker
self.addEventListener('install', event => {
  // 强制立即进入 waiting 状态，触发 activate
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache:', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. 激活 Service Worker - 清理旧缓存
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 如果当前缓存名称不在白名单中，或者是旧版本的缓存
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // 立即接管所有客户端，确保新版本立即生效（无需重新加载页面）
      return self.clients.claim();
    })
  );
});

// 3. 拦截网络请求 - 混合策略 (Smart Hybrid Strategy)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 0. 忽略非 GET 请求 (如 POST API 调用)
  // Service Worker 默认不支持缓存 POST 请求，且 API 调用通常不需要 SW 介入
  if (event.request.method !== 'GET') {
    return;
  }
  
  // 策略 A: Network First (网络优先)
  // 适用于: HTML, JS, CSS, 根路径, 以及明确需要绕过缓存的请求
  // 目的: 确保用户总是第一时间获取到最新的代码和样式更新，无需手动清理缓存，只需刷新一次
  if (event.request.headers.get('Cache-Control') === 'no-cache' || 
      url.pathname.endsWith('.html') || 
      url.pathname.endsWith('/') || 
      url.pathname.endsWith('manifest.json') ||
      url.pathname.endsWith('.js') || 
      url.pathname.endsWith('.css')) {
      
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // 网络成功：更新缓存并返回
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // 网络失败：回退到缓存
          console.log('Network failed, falling back to cache for:', event.request.url);
          return caches.match(event.request).then(cachedResponse => {
              // 如果缓存也没有，只能返回通过 Promise.reject 或构建一个新的 Response
              // 为了防止 "Load failed"，这里可以返回一个简单的离线提示或者 null
              if (cachedResponse) return cachedResponse;
              // 最后的兜底：如果是 HTML 请求且没网没缓存，可以返回一个简单的离线 HTML (可选)
              return new Response('Offline: Network request failed and no cache available.', { status: 503, statusText: 'Service Unavailable' });
          });
        })
    );
    return;
  }

  // 策略 B: Cache First (缓存优先)
  // 适用于: 图片, 字体等静态大资源
  // 目的: 最大化加载速度，节省流量
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        
        // 缓存未命中，发起网络请求
        return fetch(event.request).then(response => {
          // 检查响应是否有效
          if(!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // 克隆响应放入缓存
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          
          return response;
        }).catch(err => {
            // 网络请求失败 (例如处于后台断网)
            console.warn('SW Fetch failed (Strategy B):', err);
            // 对于图片，可以返回一个透明占位图或什么都不做(让浏览器显示破图)
            // 但决不能抛出异常导致 "Load failed" 这里的错误
            // 返回一个 404 响应是比较安全的做法
            return new Response('', { status: 404, statusText: 'Not Found' });
        });
      })
  );
});
