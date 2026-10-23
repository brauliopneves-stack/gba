// Offline cache for the app shell. Bump VERSION whenever any file changes so
// installed copies pick up the update.
const VERSION = 'gba-link-v1';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'app/style.css',
  'app/main.js',
  'app/db.js',
  'app/zip.js',
  'app/machine.js',
  'app/runner.js',
  'app/link.js',
  'app/input.js',
  'core/util.js',
  'core/core.js',
  'core/arm.js',
  'core/thumb.js',
  'core/mmu.js',
  'core/io.js',
  'core/audio.js',
  'core/video.js',
  'core/software.js',
  'core/irq.js',
  'core/keypad.js',
  'core/sio.js',
  'core/savedata.js',
  'core/gpio.js',
  'core/gba.js',
  'core/bios.bin',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)),
  );
});
