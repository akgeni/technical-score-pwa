// Bollinger Band %B — only active when ADX < 25 (ranging market).
// Port of services/metrics/mean_reversion.py.
import { mean, stddev, clamp, round } from "../indicators.js";

export function compute(ohlcv, adxValue = null) {
  const { close } = ohlcv;
  if (close.length < 20) {
    return { rawValue: null, score: 0.0, details: { error: "Need >=20 bars", dataStatus: "NOT_AVAILABLE" } };
  }

  const trending = adxValue !== null && adxValue !== undefined && adxValue > 25.0;

  const n = close.length;
  const window = close.slice(n - 20);
  const sma20 = mean(window);
  const std20 = stddev(window);

  const upperBand = sma20 + 2.0 * std20;
  const lowerBand = sma20 - 2.0 * std20;
  const bandWidth = upperBand - lowerBand;

  const pctB = bandWidth > 0 ? (close[n - 1] - lowerBand) / bandWidth : 0.5;

  let score, status;
  if (trending) {
    score = 0.0;
    status = "disabled_trending";
  } else {
    if (pctB > 1.1) score = -2.0;
    else if (pctB > 1.0) score = -1.0 - (pctB - 1.0) * 10.0;
    else if (pctB > 0.8) score = -0.5;
    else if (pctB > 0.2) score = 0.0;
    else if (pctB > 0.0) score = 0.5;
    else if (pctB > -0.1) score = 1.0 + Math.abs(pctB) * 10.0;
    else score = 2.0;
    status = "active_ranging";
  }

  score = clamp(round(score, 2), -2.0, 2.0);

  return {
    rawValue: round(pctB, 4),
    score,
    details: {
      pctB: round(pctB, 4),
      upperBand: round(upperBand, 2),
      lowerBand: round(lowerBand, 2),
      sma20: round(sma20, 2),
      adxGating: trending ? "ADX > 25 — metric disabled (trending market)" : "ADX <= 25 — metric active (ranging market)",
      status,
      dataStatus: "OK",
      interpretation: interpret(pctB, trending),
    },
  };
}

function interpret(pctB, trending) {
  if (trending) return "Bollinger %B disabled — market is trending (ADX > 25), overextension is normal in trends";
  if (pctB > 1.0) return `%B=${pctB.toFixed(2)} — price above upper band in a ranging market, overbought/overextended`;
  if (pctB > 0.8) return `%B=${pctB.toFixed(2)} — price near upper band, mild overbought`;
  if (pctB > 0.2) return `%B=${pctB.toFixed(2)} — price within normal range`;
  if (pctB > 0.0) return `%B=${pctB.toFixed(2)} — price near lower band, mild oversold`;
  return `%B=${pctB.toFixed(2)} — price below lower band in a ranging market, oversold/mean-reversion candidate`;
}
