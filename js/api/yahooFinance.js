// Yahoo Finance client, routed through a user-deployed Cloudflare Worker (see
// cloudflare-worker/yahoo-proxy.js) that only exists to add the CORS header Yahoo's own
// response doesn't send -- the data itself is free and effectively unlimited (no API key,
// no meaningful rate limit for a personal watchlist), unlike the Twelve Data free tier this
// replaced (8 req/min, 800/day -- too tight in practice).
//
// This is the same data source (query1.finance.yahoo.com's chart API) the parent Flask
// project already relies on via yfinance, so response shape was verified against real live
// responses captured during planning (not just docs) -- see chart()'s comments below.

export class YahooFinanceError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "YahooFinanceError";
    this.code = code;
  }
}

function requireWorkerUrl(workerUrl) {
  if (!workerUrl) {
    throw new YahooFinanceError("No proxy Worker URL set. Add one in Settings.", "NO_WORKER");
  }
  return workerUrl.replace(/\/$/, "");
}

// No exchange param needed -- Yahoo bakes it into the symbol suffix (.NS / .BO), matching
// the parent Flask app's own ticker convention exactly.
export async function symbolSearch(query, workerUrl) {
  if (!query || query.trim().length === 0) return [];
  const base = requireWorkerUrl(workerUrl);
  const resp = await fetch(`${base}/search/${encodeURIComponent(query.trim())}`);
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data) {
    throw new YahooFinanceError(`Symbol search failed (HTTP ${resp.status})`, resp.status);
  }
  const quotes = data.quotes || [];
  return quotes
    .filter((q) => q.quoteType === "EQUITY" && typeof q.symbol === "string"
      && (q.symbol.endsWith(".NS") || q.symbol.endsWith(".BO")))
    .map((q) => ({
      symbol: q.symbol,
      exchange: q.symbol.endsWith(".NS") ? "NSE" : "BSE",
      name: q.longname || q.shortname || q.symbol,
    }));
}

// Real response shape (verified via live curl during planning, not just docs):
//   { chart: { result: [{ meta: {...}, timestamp: [epochSeconds...],
//              indicators: { quote: [{open,high,low,close,volume}], adjclose: [{adjclose}] } }],
//              error: null | {code, description} } }
//
// Split/dividend adjustment: Yahoo's `close` is raw and `adjclose` is split+dividend-adjusted
// (matches yfinance's auto_adjust=True, used server-side by the Flask app). Using adjclose
// alone while leaving open/high/low raw would break OHLC internal consistency across a split
// (adjusted close could fall outside the raw high/low range) -- so every field is rescaled by
// the same per-bar ratio (adjclose/close), exactly mirroring what auto_adjust=True does.
export async function chart(symbol, workerUrl, range = "2y") {
  const base = requireWorkerUrl(workerUrl);
  const resp = await fetch(`${base}/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`);
  const data = await resp.json().catch(() => null);
  if (!data) {
    throw new YahooFinanceError(`Non-JSON response for ${symbol} (HTTP ${resp.status})`, resp.status);
  }
  const err = data.chart?.error;
  if (err) {
    throw new YahooFinanceError(err.description || `Yahoo Finance error for ${symbol}`, err.code);
  }
  const result = data.chart?.result?.[0];
  if (!resp.ok || !result) {
    throw new YahooFinanceError(`No chart data returned for ${symbol} (HTTP ${resp.status})`, resp.status);
  }

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adjcloseArr = result.indicators?.adjclose?.[0]?.adjclose || null;
  const { open = [], high = [], low = [], close = [], volume = [] } = quote;

  const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

  const dates = [], oOut = [], hOut = [], lOut = [], cOut = [], vOut = [];
  for (let i = 0; i < timestamps.length; i++) {
    // Skip bars with no close (holidays / gaps Yahoo still lists in the timestamp index).
    if (close[i] === null || close[i] === undefined) continue;
    if (open[i] === null || high[i] === null || low[i] === null) continue;

    const rawClose = close[i];
    const adjClose = adjcloseArr && adjcloseArr[i] !== null && adjcloseArr[i] !== undefined ? adjcloseArr[i] : rawClose;
    const ratio = rawClose > 0 ? adjClose / rawClose : 1;

    dates.push(dateFmt.format(new Date(timestamps[i] * 1000))); // en-CA -> YYYY-MM-DD
    oOut.push(open[i] * ratio);
    hOut.push(high[i] * ratio);
    lOut.push(low[i] * ratio);
    cOut.push(adjClose);
    vOut.push(volume[i] || 0);
  }

  if (cOut.length === 0) {
    throw new YahooFinanceError(`No usable bars for ${symbol}`, "EMPTY");
  }

  return {
    date: dates, open: oOut, high: hOut, low: lOut, close: cOut, volume: vOut,
    longName: result.meta?.longName || result.meta?.shortName || symbol,
  };
}

// --- Light pacing queue -----------------------------------------------------------------
// The Worker's own free tier (100k requests/day) doesn't need Twelve-Data-style throttling,
// but a burst of 30+ simultaneous requests is still worth spacing out a little, both to be a
// reasonable citizen toward Yahoo's undocumented endpoint and to avoid tripping Cloudflare's
// own abuse heuristics. Used for batch refresh; single-stock actions call chart() directly.
const MAX_PER_WINDOW = 20;
const WINDOW_MS = 10_000; // ~2/sec sustained

class RateLimitedQueue {
  constructor() {
    this._queue = [];
    this._requestTimes = [];
    this._running = false;
  }

  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this._queue.push({ fn, resolve, reject });
      this._pump();
    });
  }

  async _pump() {
    if (this._running) return;
    this._running = true;
    while (this._queue.length > 0) {
      const now = Date.now();
      this._requestTimes = this._requestTimes.filter((t) => now - t < WINDOW_MS);
      if (this._requestTimes.length >= MAX_PER_WINDOW) {
        const oldest = this._requestTimes[0];
        await sleep(WINDOW_MS - (now - oldest) + 50);
        continue;
      }
      const { fn, resolve, reject } = this._queue.shift();
      this._requestTimes.push(Date.now());
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      }
    }
    this._running = false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export const refreshQueue = new RateLimitedQueue();
