// Port of services/composite.py's score_from_metrics / _classify_regime / _generate_signal.
//
// One deliberate omission vs the Flask app: no "weak stock history" signal caveat
// (_regime_history_is_weak in composite.py) — that depends on the walk-forward backtest
// engine (services/backtest.py), a separate feature out of scope for this v1. The Entry
// signal here only ever carries the "weak volume" caveat.
import { clamp, round } from "./indicators.js";

export const COMPOSITE_WEIGHTS = {
  vsm: 0.30,
  relativeStrength: 0.20,
  vwapVolume: 0.20,
  trendStrength: 0.10,
  meanReversion: 0.10,
  eventScore: 0.10,
};

// Event Score needs a paid LLM call from a public client (an API-key-in-a-public-client
// problem, unlike the rest of this app's data fetching, which needs no secret at all) --
// always reported NOT_AVAILABLE, exactly like the Flask app already does
// whenever its DeepSeek call fails, so this exercises an already-existing fallback path,
// not new behavior. Weight is redistributed across the other 5 metrics below.
export function stubEventScore() {
  return {
    rawValue: null,
    score: 0.0,
    details: { dataStatus: "NOT_AVAILABLE", reason: "Event Score (LLM) not available in this app" },
  };
}

export function scoreFromMetrics(results, currentPrice) {
  const weights = { ...COMPOSITE_WEIGHTS };

  for (const metricName of Object.keys(weights)) {
    const dataStatus = results[metricName]?.details?.dataStatus ?? "OK";
    if (dataStatus !== "OK") weights[metricName] = 0.0;
  }

  const adxVal = results.trendStrength?.details?.adx;
  if (adxVal !== null && adxVal !== undefined && adxVal > 25) {
    weights.meanReversion = 0.0;
  }

  if (results.relativeStrength?.details?.sectorWeaknessFilterApplied) {
    weights.relativeStrength *= 0.5;
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (totalWeight > 0) {
    for (const k of Object.keys(weights)) weights[k] = weights[k] / totalWeight;
  }

  let weightedSum = 0;
  let positiveCount = 0;
  for (const [metricName, w] of Object.entries(weights)) {
    const s = results[metricName].score;
    weightedSum += s * w;
    if (s > 0.1) positiveCount += 1;
  }

  const compositeScore = clamp(round(weightedSum, 2), -2.0, 2.0);
  const regime = classifyRegime(compositeScore);

  const volumeZ = results.vwapVolume?.details?.volumeZScore ?? 0;
  const signal = generateSignal(compositeScore, positiveCount, volumeZ);

  const atr14 = results.trendStrength?.details?.atr14;
  let stopLoss = null, target = null;
  if (currentPrice && atr14) {
    if (regime === "Bearish" || regime === "Strong Bearish") {
      // Short-style bracket: target below price (the downside move that would validate the
      // bearish call), stop above (protects against a rally against the call).
      stopLoss = round(currentPrice + 2.0 * atr14, 2);
      target = round(currentPrice - 1.5 * atr14, 2);
    } else {
      stopLoss = round(currentPrice - 2.0 * atr14, 2);
      target = round(currentPrice + 1.5 * atr14, 2);
    }
  }

  const details = {
    metricScores: Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, { score: v.score, rawValue: v.rawValue }])
    ),
    positiveMetrics: positiveCount,
    volumeConfirming: volumeZ > 0,
    atr14: atr14 ?? null,
  };

  return {
    score: compositeScore,
    regime,
    signal,
    stopLoss,
    target,
    currentPrice,
    weights,
    details,
    metrics: results,
  };
}

function classifyRegime(score) {
  if (score > 1.2) return "Strong Bullish";
  if (score > 0.5) return "Bullish";
  if (score > -0.5) return "Neutral";
  if (score > -1.2) return "Bearish";
  return "Strong Bearish";
}

function generateSignal(score, positiveCount, volumeZ) {
  if (!(score >= 0.5 && positiveCount >= 3)) {
    return score <= -0.3 ? "Exit" : "Hold";
  }
  const caveats = [];
  if (volumeZ <= 0) caveats.push("weak volume");
  return caveats.length > 0 ? `Entry (${caveats.join(", ")})` : "Entry";
}
