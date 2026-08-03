// Orchestration layer: fetch OHLCV via Yahoo Finance (through the user's Worker proxy), run
// all 5 metrics + composite scorer + breakout engine. JS equivalent of services/composite.py's
// compute_all_metrics, minus the DB writes (the caller persists via storage/localStore.js) and
// minus Event Score/stock-history (see plan for why).
import { chart } from "../api/yahooFinance.js";
import * as vsm from "./metrics/vsm.js";
import * as relativeStrength from "./metrics/relativeStrength.js";
import * as vwapVolume from "./metrics/vwapVolume.js";
import * as trendStrength from "./metrics/trendStrength.js";
import * as meanReversion from "./metrics/meanReversion.js";
import { scoreFromMetrics, stubEventScore } from "./compositeScorer.js";
import { computeBreakout } from "./breakout/scanEngine.js";

// The Nifty 50 index itself (^NSEI) -- back to the same benchmark the Flask app effectively
// uses (NIFTY50 as its sector-index fallback), now that Yahoo Finance is reachable directly
// via the Worker proxy. The earlier Twelve Data version used the NIFTYBEES ETF as a proxy for
// this because index symbols were unverified on Twelve Data's free tier; ^NSEI is confirmed
// reachable through Yahoo's chart API.
export const BENCHMARK_SYMBOL = "^NSEI";
const RANGE = "2y";

export async function fetchBenchmark(workerUrl) {
  return chart(BENCHMARK_SYMBOL, workerUrl, RANGE);
}

export async function runAnalysis(symbol, workerUrl, benchData) {
  const ohlcv = await chart(symbol, workerUrl, RANGE);
  const currentPrice = ohlcv.close[ohlcv.close.length - 1];

  const trend = trendStrength.compute(ohlcv);
  const results = {
    vsm: vsm.compute(ohlcv),
    relativeStrength: relativeStrength.compute(ohlcv, benchData),
    vwapVolume: vwapVolume.compute(ohlcv),
    trendStrength: trend,
    meanReversion: meanReversion.compute(ohlcv, trend.details.adx),
    eventScore: stubEventScore(),
  };

  const composite = scoreFromMetrics(results, currentPrice);
  const breakout = computeBreakout(ohlcv, benchData);

  return { composite, breakout, currentPrice, name: ohlcv.longName };
}
