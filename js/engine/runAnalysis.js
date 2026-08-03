// Orchestration layer: fetch OHLCV via Twelve Data, run all 5 metrics + composite scorer +
// breakout engine. JS equivalent of services/composite.py's compute_all_metrics, minus the
// DB writes (the caller persists via storage/localStore.js) and minus Event Score/stock-
// history (see plan for why).
import { timeSeries } from "../api/twelveData.js";
import * as vsm from "./metrics/vsm.js";
import * as relativeStrength from "./metrics/relativeStrength.js";
import * as vwapVolume from "./metrics/vwapVolume.js";
import * as trendStrength from "./metrics/trendStrength.js";
import * as meanReversion from "./metrics/meanReversion.js";
import { scoreFromMetrics, stubEventScore } from "./compositeScorer.js";
import { computeBreakout } from "./breakout/scanEngine.js";

export const BENCHMARK_SYMBOL = "NIFTYBEES";
export const BENCHMARK_EXCHANGE = "NSE";
const OUTPUT_SIZE = 500;

export async function fetchBenchmark(apiKey) {
  return timeSeries(BENCHMARK_SYMBOL, BENCHMARK_EXCHANGE, apiKey, OUTPUT_SIZE);
}

export async function runAnalysis(symbol, exchange, apiKey, benchData) {
  const ohlcv = await timeSeries(symbol, exchange, apiKey, OUTPUT_SIZE);
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

  return { composite, breakout, currentPrice };
}
