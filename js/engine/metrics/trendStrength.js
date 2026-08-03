// Average Directional Index (ADX) for trend strength. Port of services/metrics/trend_strength.py.
import { wilderSmooth, clamp, round } from "../indicators.js";

export function compute(ohlcv) {
  const { high, low, close } = ohlcv;
  if (high.length < 28) {
    return { rawValue: null, score: 0.0, details: { error: "Need >=28 bars for ADX(14)", dataStatus: "NOT_AVAILABLE" } };
  }

  const n = high.length;
  const period = 14;
  const plusDm = new Array(n).fill(0);
  const minusDm = new Array(n).fill(0);
  const tr = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = high[i] - high[i - 1];
    const downMove = low[i - 1] - low[i];
    plusDm[i] = (upMove > downMove && upMove > 0) ? upMove : 0.0;
    minusDm[i] = (downMove > upMove && downMove > 0) ? downMove : 0.0;
    tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  }

  const trSliced = tr.slice(1);
  const plusDmSliced = plusDm.slice(1);
  const minusDmSliced = minusDm.slice(1);

  const atrSeries = wilderSmooth(trSliced, period);
  const plusDi = wilderSmooth(plusDmSliced, period).map((v, i) => 100.0 * v / (atrSeries[i] > 0 ? atrSeries[i] : 1e-10));
  const minusDi = wilderSmooth(minusDmSliced, period).map((v, i) => 100.0 * v / (atrSeries[i] > 0 ? atrSeries[i] : 1e-10));

  const dx = plusDi.map((pd, i) => {
    const md = minusDi[i];
    const denom = (pd + md) > 0 ? (pd + md) : 1e-10;
    return 100.0 * Math.abs(pd - md) / denom;
  });
  const adx = wilderSmooth(dx, period);

  const currentAdx = adx.length > 0 ? adx[adx.length - 1] : 0.0;
  const currentPlusDi = plusDi.length > 0 ? plusDi[plusDi.length - 1] : 0.0;
  const currentMinusDi = minusDi.length > 0 ? minusDi[minusDi.length - 1] : 0.0;

  const bullishTrend = currentPlusDi > currentMinusDi;
  const trending = currentAdx > 25.0;

  let score;
  if (trending && bullishTrend) {
    score = currentAdx > 40 ? 2.0 : 1.0 + (currentAdx - 25.0) / 15.0;
  } else if (trending && !bullishTrend) {
    score = currentAdx > 40 ? -2.0 : -1.0 - (currentAdx - 25.0) / 15.0;
  } else {
    score = 0.0;
  }

  score = clamp(round(score, 2), -2.0, 2.0);

  return {
    rawValue: round(currentAdx, 2),
    score,
    details: {
      adx: round(currentAdx, 2),
      plusDi: round(currentPlusDi, 2),
      minusDi: round(currentMinusDi, 2),
      trending,
      direction: bullishTrend ? "bullish" : "bearish",
      atr14: atrSeries.length > 0 ? round(atrSeries[atrSeries.length - 1], 2) : null,
      dataStatus: "OK",
      interpretation: interpret(currentAdx, bullishTrend, trending),
    },
  };
}

function interpret(adx, bullish, trending) {
  if (!trending) return `ADX=${adx.toFixed(0)} — market is ranging, no clear trend. Momentum signals may be noise`;
  const direction = bullish ? "bullish" : "bearish";
  if (adx > 40) return `ADX=${adx.toFixed(0)} — strong ${direction} trend confirmed`;
  return `ADX=${adx.toFixed(0)} — moderate ${direction} trend developing`;
}
