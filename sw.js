// Service worker: caches the app shell (HTML/CSS/JS) for offline load. Deliberately does NOT
// intercept or cache Yahoo Finance/Worker-proxy calls (different origin, and price data must
// always be fetched fresh) -- only same-origin static-file requests go through the cache.
const CACHE_NAME = "technical-score-v4";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/api/yahooFinance.js",
  "./js/api/nseData.js",
  "./js/api/miniZip.js",
  "./js/storage/localStore.js",
  "./js/ui/components.js",
  "./js/ui/dashboard.js",
  "./js/ui/detail.js",
  "./js/engine/indicators.js",
  "./js/engine/compositeScorer.js",
  "./js/engine/runAnalysis.js",
  "./js/engine/smartMoney.js",
  "./js/engine/metrics/vsm.js",
  "./js/engine/metrics/relativeStrength.js",
  "./js/engine/metrics/vwapVolume.js",
  "./js/engine/metrics/trendStrength.js",
  "./js/engine/metrics/meanReversion.js",
  "./js/engine/breakout/config.js",
  "./js/engine/breakout/utils.js",
  "./js/engine/breakout/pivots.js",
  "./js/engine/breakout/contextMetrics.js",
  "./js/engine/breakout/state.js",
  "./js/engine/breakout/scorer.js",
  "./js/engine/breakout/tradeFrame.js",
  "./js/engine/breakout/scanEngine.js",
  "./js/engine/breakout/detectors/flatBase.js",
  "./js/engine/breakout/detectors/ascendingTriangle.js",
  "./js/engine/breakout/detectors/vcp.js",
  "./js/engine/breakout/detectors/cupHandle.js",
  "./js/engine/breakout/detectors/bullFlag.js",
  "./js/engine/breakout/detectors/doubleBottom.js",
  "./js/engine/breakout/detectors/inverseHns.js",
  "./js/engine/breakout/detectors/highTightFlag.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin (Worker proxy) calls
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return resp;
      });
    }).catch(() => caches.match("./index.html"))
  );
});
