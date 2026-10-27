const CACHE = "qianfen-v6";
const FILES = [
  "./",
  "./index.html",
  "./css/game.css",
  "./js/main.js",
  "./js/sim.js",
  "./js/present.js",
  "./js/share.js",
  "./js/rng.js",
  "./data/world.json",
  "./data/economy.json",
  "./data/content.json",
  "./data/events.json",
  "./data/narrative.json",
  "./assets/favicon.svg",
  "./assets/fonts/DroidSansFallbackFull.ttf",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(event.request).then((hit) => hit || caches.match("./index.html")))
  );
});
