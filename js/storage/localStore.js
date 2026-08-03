// localStorage-backed persistence: the user's proxy Worker URL, watchlist, and each stock's
// last-computed composite/breakout result. Chosen over IndexedDB for simplicity -- a few dozen
// stocks' worth of small JSON is nowhere near localStorage's ~5-10MB limit, and the synchronous
// API avoids IndexedDB's async ceremony for data this small.

const KEY_WORKER_URL = "tsw.workerUrl";
const KEY_WATCHLIST = "tsw.watchlist";
const KEY_RESULTS = "tsw.results";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// --- Worker URL (user's own deployed cloudflare-worker/yahoo-proxy.js) ---
export function getWorkerUrl() {
  return localStorage.getItem(KEY_WORKER_URL) || "";
}

export function setWorkerUrl(url) {
  localStorage.setItem(KEY_WORKER_URL, url.trim().replace(/\/$/, ""));
}

// --- Watchlist: [{id, symbol, exchange, name, addedAt}] ---
export function getWatchlist() {
  return readJson(KEY_WATCHLIST, []);
}

function saveWatchlist(list) {
  writeJson(KEY_WATCHLIST, list);
}

export function addToWatchlist(symbol, exchange, name) {
  const list = getWatchlist();
  const exists = list.find((s) => s.symbol === symbol && s.exchange === exchange);
  if (exists) return exists;
  const entry = {
    id: `${exchange}:${symbol}`,
    symbol,
    exchange,
    name: name || symbol,
    addedAt: new Date().toISOString(),
  };
  list.push(entry);
  saveWatchlist(list);
  return entry;
}

export function removeFromWatchlist(id) {
  const list = getWatchlist().filter((s) => s.id !== id);
  saveWatchlist(list);
  const results = getAllResults();
  delete results[id];
  writeJson(KEY_RESULTS, results);
}

// --- Results: { [stockId]: {composite, breakout, currentPrice, computedAt} } ---
export function getAllResults() {
  return readJson(KEY_RESULTS, {});
}

export function getResult(stockId) {
  return getAllResults()[stockId] || null;
}

export function saveResult(stockId, result) {
  const all = getAllResults();
  all[stockId] = { ...result, computedAt: new Date().toISOString() };
  writeJson(KEY_RESULTS, all);
}
