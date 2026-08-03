// Sector-Neutral Relative Strength (benchmarked against the Nifty 50 index for every stock in
// this app, in place of the Flask app's per-sector index map — see plan for rationale).
// Port of services/metrics/relative_strength.py.
import { diffLog, stddev, clamp, round } from "../indicators.js";

export function compute(ohlcv, benchOhlcv) {
  if (!benchOhlcv || benchOhlcv.close.length === 0) {
    return { rawValue: null, score: 0.0, details: { error: "No benchmark data available", dataStatus: "NOT_AVAILABLE" } };
  }

  let stockClose = ohlcv.close;
  let sectorClose = benchOhlcv.close;
  const minLen = Math.min(stockClose.length, sectorClose.length);
  if (minLen < 22) {
    return { rawValue: null, score: 0.0, details: { error: "Insufficient overlapping data", dataStatus: "NOT_AVAILABLE" } };
  }
  stockClose = stockClose.slice(stockClose.length - minLen);
  sectorClose = sectorClose.slice(sectorClose.length - minLen);

  const windows = { "21d": 21, "63d": 63 };
  const results = {};
  let sectorVsmVal = null;

  for (const [label, w] of Object.entries(windows)) {
    if (minLen < w) continue;
    const stockRet = Math.log(stockClose[stockClose.length - 1] / stockClose[stockClose.length - w]);
    const sectorRet = Math.log(sectorClose[sectorClose.length - 1] / sectorClose[sectorClose.length - w]);

    const sectorTail = sectorClose.slice(sectorClose.length - w);
    const sectorLogReturns = diffLog(sectorTail);
    const sectorVol = sectorLogReturns.length > 1 ? stddev(sectorLogReturns) * Math.sqrt(w) : 1.0;

    if (label === "63d") {
      sectorVsmVal = sectorVol > 1e-10 ? sectorRet / sectorVol : 0.0;
    }

    const excess = stockRet - sectorRet;
    const stockTail = stockClose.slice(stockClose.length - w);
    const stockLogReturns = diffLog(stockTail);
    const diffSeries = stockLogReturns.map((v, i) => v - sectorLogReturns[i]);
    const excessVol = stddev(diffSeries);

    const zScore = excessVol > 1e-10 ? excess / excessVol : 0.0;
    results[label] = round(zScore, 4);
  }

  if (Object.keys(results).length === 0) {
    return { rawValue: null, score: 0.0, details: { error: "Insufficient data", dataStatus: "NOT_AVAILABLE" } };
  }

  const primary = results["63d"] !== undefined ? results["63d"] : (results["21d"] !== undefined ? results["21d"] : 0.0);

  let score;
  if (primary > 1.5) score = 2.0;
  else if (primary > 1.0) score = 1.0 + (primary - 1.0) * 2.0;
  else if (primary > 0.5) score = 0.5 + (primary - 0.5) * 1.0;
  else if (primary > -0.5) score = primary;
  else if (primary > -1.0) score = -0.5 - (Math.abs(primary) - 0.5) * 1.0;
  else if (primary > -1.5) score = -1.0 - (Math.abs(primary) - 1.0) * 2.0;
  else score = -2.0;

  // Sector-weakness is penalized once, at the composite-weighting layer (compositeScorer
  // halves this metric's composite weight when sectorWeaknessFilterApplied is set) — the raw
  // score here stays the true, unadjusted signal so it isn't double-counted.
  const sectorWeak = sectorVsmVal !== null && sectorVsmVal < -1.0;

  score = clamp(round(score, 2), -2.0, 2.0);

  return {
    rawValue: round(primary, 4),
    score,
    details: {
      zScoresByHorizon: results,
      sectorVsm: sectorVsmVal !== null ? round(sectorVsmVal, 4) : null,
      sectorWeaknessFilterApplied: sectorWeak,
      dataStatus: "OK",
      interpretation: interpret(score, sectorWeak),
    },
  };
}

function interpret(score, sectorWeak) {
  const prefix = sectorWeak ? "(Benchmark in downtrend — RS weight capped) " : "";
  if (score >= 1.0) return prefix + "Significant outperformance vs benchmark — likely durable alpha";
  if (score >= 0.3) return prefix + "Moderate outperformance vs benchmark";
  if (score > -0.3) return prefix + "Moving in-line with benchmark — no relative edge";
  if (score > -1.0) return prefix + "Underperforming benchmark";
  return prefix + "Significant underperformance — negative alpha";
}
