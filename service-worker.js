const CACHE='klabs-studio-build030c-v1';
const ASSETS=['/','/index.html','/manifest.json','/css/theme.css','/css/layout.css','/css/components.css','/css/animations.css','/css/studio.css','/js/config.js','/js/storage.js','/js/guide-layout.js','/js/studio-visuals.js','/js/navigation.js','/js/ui.js','/js/app.js','/assets/logo.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
