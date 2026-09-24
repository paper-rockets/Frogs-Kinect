// Offline support: once the wall has loaded with internet, it keeps working without it.
//  - Page, code and styles: network first (edits show up straight away), cache as fallback.
//  - 3D models, icons and the three.js library: cache first (big, rarely change).
// Bump VERSION to drop everything cached by an older build.
const VERSION = 'jungle-wall-v5';
const SHELL = ['./', './index.html', './main.js', './audio.js', './style.css', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

// Everything main.js loads is read from main.js itself (models and three.js files), so
// the list stays right when models change. GLTFLoader pulls in one helper on its own.
const LOADER_HELPERS = ['https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/utils/BufferGeometryUtils.js'];

async function precache() {
  const cache = await caches.open(VERSION);
  await cache.addAll(SHELL);
  const sources = ['./main.js', './audio.js'];
  const code = (await Promise.all(sources.map(async (file) => (await fetch(file, { cache: 'no-store' })).text()))).join(' ');
  const models = [...new Set(code.match(/\.\/[\w./-]+\.(?:glb|mp3)/g) || [])];
  const library = [...new Set(code.match(/https:\/\/cdn\.jsdelivr\.net\/[^'"\s]+\.js/g) || [])];
  await Promise.all([...models, ...library, ...LOADER_HELPERS].map((url) => cache.add(url).catch(() => {})));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isHeavyAsset(url) {
  return url.hostname === 'cdn.jsdelivr.net' || /\.(glb|mp3|png|webp|jpg)$/i.test(url.pathname);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(VERSION)).put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(VERSION)).put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin && url.hostname !== 'cdn.jsdelivr.net') return;
  event.respondWith(isHeavyAsset(url) ? cacheFirst(request) : networkFirst(request));
});
