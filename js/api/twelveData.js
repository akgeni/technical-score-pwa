// Twelve Data API client. Verified (via live curl checks during planning) to send proper
// CORS headers (access-control-allow-origin: *), unlike Yahoo Finance -- see the plan for why
// this app uses Twelve Data instead of the yfinance-backed Flask app's data source.
//
// symbolSearch() needs no API key at all. timeSeries() needs a free self-registered key
// (settings screen). Free tier: 8 credits/minute, 800/day, 1 credit per symbol per
// time_series call (confirmed from Twelve Data's pricing page) -- refreshQueue below paces
// calls to stay safely under that.
//
// NOTE: this session could not test timeSeries() end-to-end with a real API key (Twelve
// Data's "demo" key is restricted). Parsing is written defensively against their documented
// response shape (numeric fields as strings, "values" array newest-first). If the live shape
// differs once a real key is added, this is the first place to check.

const BASE_URL = "https://api.twelvedata.com";

export class TwelveDataError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "TwelveDataError";
    this.code = code;
  }
}

async function getJson(path, params) {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString());
  let data;
  try {
    data = await resp.json();
  } catch (e) {
    throw new TwelveDataError(`Non-JSON response (HTTP ${resp.status})`, resp.status);
  }
  if (data && data.status === "error") {
    throw new TwelveDataError(data.message || "Twelve Data API error", data.code);
  }
  if (!resp.ok) {
    throw new TwelveDataError(`HTTP ${resp.status}`, resp.status);
  }
  return data;
}

// No API key required. Returns [{symbol, instrumentName, exchange, country, currency}, ...]
export async function symbolSearch(query) {
  if (!query || query.trim().length === 0) return [];
  const data = await getJson("/symbol_search", { symbol: query.trim() });
  const rows = data.data || [];
  return rows.map((r) => ({
    symbol: r.symbol,
    instrumentName: r.instrument_name,
    exchange: r.exchange,
    country: r.country,
    currency: r.currency,
  }));
}

// Requires an API key. Returns {date, open, high, low, close, volume} arrays, ascending date
// order, adjusted for splits+dividends (adjust=all -- matches yfinance's auto_adjust=True
// used server-side by the Flask app this is modeled on).
export async function timeSeries(symbol, exchange, apiKey, outputsize = 500) {
  if (!apiKey) throw new TwelveDataError("No Twelve Data API key set. Add one in Settings.", "NO_KEY");
  const data = await getJson("/time_series", {
    symbol, exchange, interval: "1day", outputsize, adjust: "all", apikey: apiKey,
  });
  const values = data.values || [];
  if (values.length === 0) {
    throw new TwelveDataError(`No time series data returned for ${symbol}`, "EMPTY");
  }
  // Twelve Data returns newest-first; the engine expects ascending date order.
  const ascending = [...values].reverse();
  return {
    date: ascending.map((v) => v.datetime),
    open: ascending.map((v) => parseFloat(v.open)),
    high: ascending.map((v) => parseFloat(v.high)),
    low: ascending.map((v) => parseFloat(v.low)),
    close: ascending.map((v) => parseFloat(v.close)),
    volume: ascending.map((v) => parseFloat(v.volume) || 0),
  };
}

// --- Rate-limited queue -----------------------------------------------------------------
// Paces calls to stay under Twelve Data's free-tier 8 credits/minute. Used for batch refresh
// (many stocks); individual user-initiated actions (search, add one stock, refresh one stock)
// call timeSeries()/symbolSearch() directly instead of going through this queue.
const MAX_PER_MINUTE = 7; // stay a little under the documented 8/min limit
const WINDOW_MS = 60_000;

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

  get pending() {
    return this._queue.length;
  }

  async _pump() {
    if (this._running) return;
    this._running = true;
    while (this._queue.length > 0) {
      const now = Date.now();
      this._requestTimes = this._requestTimes.filter((t) => now - t < WINDOW_MS);
      if (this._requestTimes.length >= MAX_PER_MINUTE) {
        const oldest = this._requestTimes[0];
        const waitMs = WINDOW_MS - (now - oldest) + 50;
        await sleep(waitMs);
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
