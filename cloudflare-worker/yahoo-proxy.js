// Yahoo Finance CORS relay -- deploy this as a Cloudflare Worker (free tier: 100,000
// requests/day, no credit card needed to sign up).
//
// Why this exists: Yahoo Finance's chart API (query1.finance.yahoo.com) has no
// Access-Control-Allow-Origin header, so a browser's fetch() from this PWA is blocked by
// CORS even though the data itself is free and unlimited. This Worker is a thin relay that
// runs the actual request server-side (where CORS doesn't apply) and adds the header back.
//
// It only forwards to Yahoo's own chart endpoint (path-scoped, not a generic "?url=" open
// proxy) so it can't be repurposed to fetch arbitrary sites.
//
// Deploy (no CLI needed):
//   1. workers.cloudflare.com -> sign up free -> "Create Worker"
//   2. Open the online code editor ("Quick Edit" / "Edit code"), delete the placeholder,
//      paste this whole file, click "Deploy".
//   3. Copy the worker's URL (looks like https://yahoo-proxy.YOUR-SUBDOMAIN.workers.dev)
//      into this app's Settings screen.
//
// Usage from the app:
//   GET {workerUrl}/chart/RELIANCE.NS?range=2y&interval=1d
//   GET {workerUrl}/search/RELIANCE

const ALLOWED_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    let target;
    const chartMatch = url.pathname.match(/^\/chart\/(.+)$/);
    const searchMatch = url.pathname.match(/^\/search\/(.+)$/);
    if (chartMatch) {
      target = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${chartMatch[1]}`);
      target.search = url.search;
    } else if (searchMatch) {
      target = new URL("https://query2.finance.yahoo.com/v1/finance/search");
      target.searchParams.set("q", decodeURIComponent(searchMatch[1]));
      target.searchParams.set("quotesCount", "8");
      target.searchParams.set("newsCount", "0");
    } else {
      return new Response(JSON.stringify({ error: "Use /chart/{symbol}?range=...&interval=... or /search/{query}" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    if (!ALLOWED_HOSTS.includes(target.hostname)) {
      return new Response(JSON.stringify({ error: "Host not allowed" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    try {
      const upstream = await fetch(target.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; technical-score-pwa)" },
      });
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Upstream fetch failed", detail: String(e) }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
