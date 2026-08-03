# Technical Score (PWA)

On-device technical-analysis scoring for NSE/BSE stocks — no backend service. Everything
(data fetch, indicator math, breakout-pattern detection, storage) runs in the browser on your
phone. Ported from the Flask app in `../technical-analysis-scores`, starting with the
**Best-Evidenced Setup Only** rule (composite signal = strict `Entry` AND breakout pattern =
`Double bottom`) as the headline feature.

## Run it

This is a plain static site (no build step) — it just needs to be served over HTTP for the
service worker and "Add to Home Screen" to work (opening `index.html` directly via `file://`
won't register the service worker).

Locally, from this directory:
```
python3 -m http.server 8080
```
then open `http://localhost:8080` in Chrome.

To use it on your **phone**: either serve it from your computer and open your computer's LAN
IP from your phone's Chrome (same Wi-Fi), or deploy the folder as-is to any static host (e.g.
GitHub Pages, Netlify) — it's just files, no server code, no environment variables needed.

## First-time setup

1. Open the app, tap the ⚙ Settings icon, and add a free [Twelve Data](https://twelvedata.com/pricing)
   API key (self-registered, no card). Search (adding stocks) works without a key; refreshing
   scores needs one.
2. Search for a stock (NSE or BSE) and tap a result to add it to your watchlist.
3. Tap the stock or "Refresh All" to compute its score.
4. In Chrome's menu, "Add to Home Screen" to install it like an app.

Free tier: 8 requests/minute, 800/day. Refreshing many stocks at once is automatically paced
to stay under that — a full watchlist refresh can take a few minutes.

## What's deliberately not included yet (see the parent app for the full feature set)

- Event Score (LLM news-catalyst) metric — always reports unavailable, weight redistributed.
- Sector-specific benchmarking — Relative Strength uses NIFTYBEES (Nifty 50 ETF) for every
  stock instead of a per-sector index.
- The "weak stock history" Entry-signal caveat, sector trend, smart money, backtesting, email.

## Dev tool

`test-engine.html` runs the ported engine against synthetic OHLCV data in the browser console
— useful for a quick sanity check after changing any engine file. Not linked from the app.

## Known open item

This session had no way to test a real Twelve Data API call end-to-end (only their restricted
"demo" key). Parsing is written against their documented response shape; if the live shape
differs, that's the first place to check `js/api/twelveData.js`'s `timeSeries()`.
