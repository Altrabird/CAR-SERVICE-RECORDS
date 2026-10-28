// Offline app shell. Bump VERSION when shipping changes.
const VERSION = 'v4';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'db.js', 'vendor/supabase.js', 'schedule.js', 'icons.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'vendor/fonts/fira-sans-latin-400-normal.woff2', 'vendor/fonts/fira-sans-latin-600-normal.woff2',
  'vendor/fonts/fira-sans-latin-700-normal.woff2', 'vendor/fonts/fira-code-latin-500-normal.woff2'];

self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Network first so updates show up, cache as offline fallback. Supabase API calls are cross-origin and never cached.
  // no-cache: revalidate with the server so GitHub Pages' 10-minute HTTP cache can't serve a stale file after an update.
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then(res => {
    const copy = res.clone();
    if (res.ok) caches.open(VERSION).then(c => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data?.url || './'));
});
