// NSE archive data client, routed through the same Worker proxy as Yahoo Finance (see
// cloudflare-worker/yahoo-proxy.js's /nse-bhav and /nse-fo routes). Port of the fetch/parse
// layer in services/nse_fetcher.py -- only the two endpoints Tier 2/3 of Smart Money need
// (sec_bhavdata_full and the F&O bhavcopy zip); bulk.csv/block.csv (Tier 1) are intentionally
// not ported here, see the plan for why Tier 1 doesn't work in a backend-less app.
//
// Caching: in-memory only, per page session (module-level Maps), not persisted to
// localStorage. This mirrors the Python app's @lru_cache (which also resets per process) but
// not its disk cache (which persists forever across restarts, since these reports are
// immutable once published) -- a deliberate scope cut to avoid localStorage's ~5-10MB budget
// getting eaten by multi-MB daily bhavcopy dumps. Practical effect: this cache makes a single
// "Refresh All" fetch each unique day's data only once regardless of watchlist size (the
// expensive part), but a fresh page load starts the trading-day walk over.
import { unzipSingleEntry } from "./miniZip.js";

function requireWorkerUrl(workerUrl) {
  if (!workerUrl) throw new Error("No proxy Worker URL set. Add one in Settings.");
  return workerUrl.replace(/\/$/, "");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ddmmyyyy(d) {
  return `${pad2(d.getDate())}${pad2(d.getMonth() + 1)}${d.getFullYear()}`;
}

function yyyymmdd(d) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

// Simple comma-split CSV parser (no quoted-field support) -- sufficient for these two NSE
// report formats, which were checked directly and contain no embedded commas or quotes.
// Trims header and value whitespace, matching services/nse_fetcher.py's _strip_strings.
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const row = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = (cells[c] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function num(row, key) {
  const v = parseFloat(row[key]);
  return Number.isFinite(v) ? v : null;
}

const bhavCache = new Map(); // ddmmyyyy -> rows | null
const foCache = new Map();   // yyyymmdd -> rows | null
const tradingDaysCache = new Map(); // "n:ddmmyyyy(end)" -> Date[] (oldest to newest)

// Tier 3 source: per-symbol daily bhavcopy (delivery qty/%, turnover, trade count). Any date
// works (full historical archive); returns null for a date with no published report (holiday,
// weekend, or not-yet-published today) rather than throwing -- callers treat that as "skip".
export async function fetchBhavcopy(dateObj, workerUrl) {
  const tag = ddmmyyyy(dateObj);
  if (bhavCache.has(tag)) return bhavCache.get(tag);
  const base = requireWorkerUrl(workerUrl);
  let rows = null;
  try {
    const resp = await fetch(`${base}/nse-bhav/${tag}`);
    if (resp.ok) {
      const text = await resp.text();
      rows = parseCsv(text);
    }
  } catch (e) {
    rows = null;
  }
  bhavCache.set(tag, rows);
  return rows;
}

// Tier 2 source: per-contract F&O bhavcopy (stock futures + options), downloaded as a zip and
// unzipped client-side (js/api/miniZip.js).
export async function fetchFoBhavcopy(dateObj, workerUrl) {
  const tag = yyyymmdd(dateObj);
  if (foCache.has(tag)) return foCache.get(tag);
  const base = requireWorkerUrl(workerUrl);
  let rows = null;
  try {
    const resp = await fetch(`${base}/nse-fo/${tag}`);
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      const unzipped = await unzipSingleEntry(buf);
      const text = new TextDecoder("utf-8").decode(unzipped);
      rows = parseCsv(text);
    }
  } catch (e) {
    rows = null;
  }
  foCache.set(tag, rows);
  return rows;
}

// Last n trading days (oldest to newest) up to and including endDate (default: today),
// determined by probing fetchBhavcopy backward one calendar day at a time. Port of
// services/nse_fetcher.py's recent_trading_days. Shared/cached across every stock in a
// refresh batch (the trading-day calendar doesn't depend on symbol).
export async function recentTradingDays(n, workerUrl, endDate = new Date()) {
  const cacheKey = `${n}:${ddmmyyyy(endDate)}`;
  if (tradingDaysCache.has(cacheKey)) return tradingDaysCache.get(cacheKey);

  const found = [];
  const d = new Date(endDate);
  const maxLookback = n * 2 + 15;
  let checked = 0;
  while (found.length < n && checked < maxLookback) {
    const rows = await fetchBhavcopy(d, workerUrl);
    if (rows && rows.length > 0) found.push(new Date(d));
    d.setDate(d.getDate() - 1);
    checked++;
  }
  found.reverse(); // walked newest -> oldest; callers need chronological order
  tradingDaysCache.set(cacheKey, found);
  return found;
}

export { num as csvNum };
