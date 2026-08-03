// Volatility-Scaled Momentum at multiple horizons. Port of services/metrics/vsm.py.
import { diffLog, mean, stddev, clamp, round } from "../indicators.js";

export function compute(ohlcv) {
  const close = ohlcv.close;
  const logReturns = diffLog(close);

  const windows = { "21d": 21, "63d": 63, "126d": 126 };
  const results = {};
  const available = {};

  for (const [label, w] of Object.entries(windows)) {
    if (logReturns.length < w) {
      results[label] = null;
      continue;
    }
    const slice = logReturns.slice(logReturns.length - w);
    const cumReturn = slice.reduce((a, b) => a + b, 0);
    const vol = stddev(slice) * Math.sqrt(w);
    const vsm = vol > 1e-10 ? cumReturn / vol : 0.0;
    results[label] = round(vsm, 4);
    available[label] = vsm;
  }

  if (Object.keys(available).length === 0) {
    return { rawValue: null, score: 0.0, details: { error: "Insufficient data", dataStatus: "NOT_AVAILABLE" } };
  }

  const blendKeys = ["63d", "126d", "21d"].filter((k) => k in available);
  let blended;
  if ("63d" in available && "126d" in available) {
    blended = 0.6 * available["63d"] + 0.4 * available["126d"];
  } else if (blendKeys.length > 0) {
    blended = available[blendKeys[0]];
  } else {
    blended = 0.0;
  }

  let momentumDecay = false;
  if ("126d" in available && "21d" in available) {
    if (available["126d"] > 0.3 && available["21d"] < 0) momentumDecay = true;
  }
  if ("63d" in available && "21d" in available) {
    if (available["63d"] > 0.3 && available["21d"] < -0.3) momentumDecay = true;
  }

  let score;
  if (blended > 1.0) score = 2.0;
  else if (blended > 0.5) score = 1.0 + (blended - 0.5) * 2.0;
  else if (blended > 0.3) score = 0.5 + (blended - 0.3) * 2.5;
  else if (blended > -0.3) score = (blended / 0.3) * 0.5;
  else if (blended > -0.5) score = -0.5 - (Math.abs(blended) - 0.3) * 2.5;
  else if (blended > -1.0) score = -1.0 - (Math.abs(blended) - 0.5) * 2.0;
  else score = -2.0;

  if (momentumDecay && score > 0) score *= 0.5;

  score = clamp(round(score, 2), -2.0, 2.0);

  return {
    rawValue: round(blended, 4),
    score,
    details: {
      vsmByHorizon: results,
      blendedVsm: round(blended, 4),
      momentumDecayDetected: momentumDecay,
      dataStatus: "OK",
      interpretation: interpret(score, momentumDecay),
    },
  };
}

function interpret(score, decay) {
  if (decay) return "Momentum is losing steam — long-horizon positive but short-horizon turning negative";
  if (score >= 1.5) return "Strong risk-adjusted uptrend across horizons";
  if (score >= 0.5) return "Moderate positive momentum";
  if (score > -0.5) return "No clear directional edge";
  if (score > -1.5) return "Moderate downward drift";
  return "Strong risk-adjusted downtrend";
}
