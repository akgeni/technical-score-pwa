# Technical Score (PWA)

On-device technical-analysis scoring for NSE/BSE stocks — no backend service. Everything
(data fetch, indicator math, breakout-pattern detection, storage) runs in the browser on your
phone. Ported from the Flask app in `../technical-analysis-scores`, starting with the
**Best-Evidenced Setup Only** rule (composite signal = strict `Entry` AND breakout pattern =
`Double bottom`) as the headline feature.

## Run it

This is a plain static site (no build step) — it just needs to be served over HTTP for the
service worker and "Add to Home Screen" to work (opening `index.html` directly via `file://`
won't register the service worker). Live at: https://akgeni.github.io/technical-score-pwa/

Locally, from this directory:
```
python3 -m http.server 8080
```
then open `http://localhost:8080` in Chrome.

## First-time setup

Data comes from Yahoo Finance (free, no API key, effectively unlimited) — the same source the
parent Flask app already uses via `yfinance`. Yahoo's response is missing the CORS header
browsers require though, so a tiny relay you deploy yourself adds it back. This replaced an
earlier Twelve Data integration whose free tier (8 req/min, 800/day) turned out too tight in
practice even for a small watchlist.

1. **Deploy the proxy Worker (~1 minute, one-time):**
   - Sign up free at [workers.cloudflare.com](https://workers.cloudflare.com) (no card needed;
     free tier is 100,000 requests/day).
   - Create a Worker, open its online code editor ("Edit code"), delete the placeholder, paste
     in the full contents of [`cloudflare-worker/yahoo-proxy.js`](cloudflare-worker/yahoo-proxy.js),
     click **Deploy**.
   - Copy the Worker's URL — looks like `https://yahoo-proxy.YOUR-SUBDOMAIN.workers.dev`.
2. Open the app, tap the ⚙ Settings icon, paste that URL in.
3. Search for a stock (NSE or BSE) and tap a result to add it to your watchlist.
4. Tap the stock or "Refresh All" to compute its score.
5. In Chrome's menu, "Add to Home Screen" to install it like an app.

Refreshing many stocks at once is lightly paced (~2/sec) — a full watchlist refresh should
finish in seconds, not minutes.

## What's deliberately not included yet (see the parent app for the full feature set)

- Event Score (LLM news-catalyst) metric — always reports unavailable, weight redistributed.
- Sector-specific benchmarking — Relative Strength uses the Nifty 50 index (`^NSEI`) for every
  stock instead of a per-sector index.
- The "weak stock history" Entry-signal caveat, sector trend, smart money, backtesting, email.

## Dev tool

`test-engine.html` runs the ported engine against synthetic OHLCV data in the browser console
— useful for a quick sanity check after changing any engine file. Not linked from the app.

## Known open item

`js/api/yahooFinance.js`'s `chart()` parser was built against real Yahoo Finance responses
captured via live `curl` checks during planning (not just docs), including the
`open/high/low/close/volume` + `adjclose` shape and the split/dividend rescaling logic — but
this session couldn't deploy an actual Cloudflare Worker itself (account creation is outside
what this session does), so the full request path (app → your Worker → Yahoo) hasn't been
exercised end-to-end yet. If something doesn't parse right after you deploy, that's the first
place to check.
