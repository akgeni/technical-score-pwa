# Technical Score (PWA)

On-device technical-analysis scoring for NSE/BSE stocks — no backend service. Everything
(data fetch, indicator math, breakout-pattern detection, smart-money read, storage) runs in
the browser on your phone. Ported from the Flask app in `../technical-analysis-scores`,
starting with the **Best-Evidenced Setup Only** rule (composite signal = strict `Entry` AND
breakout pattern = `Double bottom`) as the headline feature.

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

Data comes from Yahoo Finance (free, no API key, effectively unlimited — the same source the
parent Flask app already uses via `yfinance`) and NSE's public archive reports (also free, no
key, used for the Smart Money feature). Both are missing the CORS header a browser requires,
so a tiny relay you deploy yourself adds it back for both.

1. **Deploy the proxy Worker (~1 minute, one-time):**
   - Sign up free at [workers.cloudflare.com](https://workers.cloudflare.com) (no card needed;
     free tier is 100,000 requests/day).
   - Create a Worker — pick **"Start with Hello World!"**, not "Import a repository" (that
     deploys your git repo as a static site instead of running the relay script, which is the
     wrong product for what this needs).
   - Open its online code editor ("Edit code"), delete the placeholder, paste in the full
     contents of [`cloudflare-worker/yahoo-proxy.js`](cloudflare-worker/yahoo-proxy.js), click
     **Deploy**.
   - Copy the Worker's URL — looks like `https://yahoo-proxy.YOUR-SUBDOMAIN.workers.dev`.
   - **Already have this Worker deployed from before Smart Money was added?** Re-open its code
     editor and re-paste the current file — it now also proxies two NSE routes the old version
     didn't have.
2. Open the app, tap the ⚙ Settings icon, paste that URL in.
3. Search for a stock (NSE or BSE) and tap a result to add it to your watchlist.
4. Tap the stock or "Refresh All" to compute its score.
5. In Chrome's menu, "Add to Home Screen" to install it like an app.

Refreshing many stocks at once is lightly paced (~2/sec) for the Yahoo Finance calls. The
first Smart Money computation in a session is slower (building a 60-trading-day NSE calendar
from scratch, one request per calendar day probed, plus ~15 zipped F&O bhavcopy downloads,
~1MB each) — that cost is paid once per page load, not per stock, since results are cached in
memory and shared across the whole watchlist. A fresh page load starts it over (see the Smart
Money section below for why this isn't persisted to disk).

## What's deliberately not included yet (see the parent app for the full feature set)

- Event Score (LLM news-catalyst) metric — always reports unavailable, weight redistributed.
- Sector-specific benchmarking — Relative Strength uses the Nifty 50 index (`^NSEI`) for every
  stock instead of a per-sector index.
- The "weak stock history" Entry-signal caveat, sector trend, backtesting, email.

## Smart Money (Tier 2 + 3 only)

Cross-tier NSE flow read: stock-futures OI buildup/unwinding (Tier 2, unattributed — NSE's
free report has no per-stock FII breakdown) and delivery-weighted accumulation + trade-size
z-score (Tier 3). Standalone display, doesn't feed the composite score — same as the Flask
app, and for the same reason (blending unvalidated signals into one number that looks more
authoritative than it is is a mistake this project already made and fixed once).

**Tier 1 (named bulk/block deal counterparties) is intentionally not included.** It works in
the Flask app by accumulating one daily snapshot into a database over 10+ days, which only
works because that app is a server that's always running. A PWA only fetches when you open it,
so Tier 1 would have permanent gaps and likely never reach its own minimum sample size.

Fetch/parse layer (`js/api/nseData.js`, `js/api/miniZip.js`) caches in memory only, not to
localStorage — the daily bhavcopy files are multi-MB, and localStorage's ~5-10MB budget would
fill up fast. This trades persistence (the Flask app's disk cache never expires, since these
reports are immutable once published) for simplicity; a fresh page load rebuilds the session
cache from scratch.

## Dev tools

- `test-engine.html` runs the ported engine (metrics, composite scorer, breakout detectors,
  the zip parser) against synthetic OHLCV data and one real downloaded fixture, in the browser
  — useful for a quick sanity check after changing any engine file. Not linked from the app.
- `test-fo-bhavcopy.zip` is a real NSE F&O bhavcopy download (~1MB), used by
  `test-engine.html` to verify `js/api/miniZip.js`'s hand-written ZIP/deflate extraction
  against real data (byte-exact decompressed size, matching a Python `zipfile` reference
  check made during planning) rather than only synthetic input.

## Known open items

- `js/api/yahooFinance.js`'s `chart()` parser was built against real Yahoo Finance responses
  captured via live `curl` checks during planning (not just docs), including the
  `open/high/low/close/volume` + `adjclose` shape and the split/dividend rescaling logic.
- `js/api/nseData.js`'s bhavcopy/F&O parsing was checked against real downloaded CSVs and a
  real zip (see Dev tools above) for shape/column-name fidelity, and `js/engine/smartMoney.js`'s
  Tier 2/3 math was transcribed line-by-line from `services/smart_money.py` — but this session
  could not deploy an actual Cloudflare Worker itself (account creation is outside what this
  session does), so the full request path (app → your Worker → Yahoo/NSE) hasn't been
  exercised end-to-end yet for either data source. If something doesn't parse right after you
  deploy, that's the first place to check.
