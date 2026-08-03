// Data relay -- deploy this as a Cloudflare Worker (free tier: 100,000 requests/day, no
// credit card needed to sign up). Proxies two unrelated free data sources this app needs,
// both of which are reachable fine server-to-server but missing the CORS header a browser
// requires:
//   - Yahoo Finance's chart/search API (query1/query2.finance.yahoo.com)
//   - NSE's public archive reports (archives.nseindia.com / nsearchives.nseindia.com) -- used
//     for the Smart Money feature's Tier 2 (stock-futures OI) and Tier 3 (delivery-weighted
//     accumulation) reads. These archive endpoints don't need NSE's session/cookie dance the
//     way www.nseindia.com does; a plain server-side fetch works.
//
// Deploy (no CLI needed):
//   1. workers.cloudflare.com -> sign up free -> "Create Worker" (start from "Hello World!",
//      not an "Import a repository" flow -- that deploys your git repo as a static site
//      instead of running this script, which is the wrong product for what this needs).
//   2. Open the online code editor ("Edit code"), delete the placeholder, paste this whole
//      file, click "Deploy".
//   3. Copy the worker's URL (looks like https://yahoo-proxy.YOUR-SUBDOMAIN.workers.dev)
//      into this app's Settings screen.
//
// Usage from the app:
//   GET {workerUrl}/chart/RELIANCE.NS?range=2y&interval=1d
//   GET {workerUrl}/search/RELIANCE
//   GET {workerUrl}/nse-bhav/31072026        (ddmmyyyy -- Tier 3 source, plain CSV)
//   GET {workerUrl}/nse-fo/20260731          (yyyymmdd -- Tier 2 source, zipped CSV)

const ALLOWED_HOSTS = [
  "query1.finance.yahoo.com", "query2.finance.yahoo.com",
  "archives.nseindia.com", "nsearchives.nseindia.com",
];

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    let target;
    const chartMatch = url.pathname.match(/^\/chart\/(.+)$/);
    const searchMatch = url.pathname.match(/^\/search\/(.+)$/);
    const bhavMatch = url.pathname.match(/^\/nse-bhav\/(\d{8})$/);
    const foMatch = url.pathname.match(/^\/nse-fo\/(\d{8})$/);

    if (chartMatch) {
      target = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${chartMatch[1]}`);
      target.search = url.search;
    } else if (searchMatch) {
      target = new URL("https://query2.finance.yahoo.com/v1/finance/search");
      target.searchParams.set("q", decodeURIComponent(searchMatch[1]));
      target.searchParams.set("quotesCount", "8");
      target.searchParams.set("newsCount", "0");
    } else if (bhavMatch) {
      target = new URL(`https://archives.nseindia.com/products/content/sec_bhavdata_full_${bhavMatch[1]}.csv`);
    } else if (foMatch) {
      target = new URL(`https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${foMatch[1]}_F_0000.csv.zip`);
    } else {
      return new Response(JSON.stringify({
        error: "Use /chart/{symbol}, /search/{query}, /nse-bhav/{ddmmyyyy}, or /nse-fo/{yyyymmdd}",
      }), {
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
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      });
      // Stream the body through as-is rather than buffering via .text() -- the F&O route
      // returns a binary zip, and forcing it through a text decode/re-encode would corrupt it.
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
          ...corsHeaders(),
        },
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
