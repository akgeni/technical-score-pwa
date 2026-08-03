// VWAP deviation + Volume Surge + Amihud illiquidity. Port of services/metrics/vwap_volume.py.
import { diffLog, mean, stddev, clamp, round } from "../indicators.js";

export function compute(ohlcv) {
  const { close, high, low, volume } = ohlcv;
  if (close.length < 20) {
    return { rawValue: null, score: 0.0, details: { error: "Need >=20 bars", dataStatus: "NOT_AVAILABLE" } };
  }

  const n = close.length;
  const typicalPrice = close.map((c, i) => (high[i] + low[i] + c) / 3.0);
  const tp20 = typicalPrice.slice(n - 20);
  const vol20 = volume.slice(n - 20);
  let totalTurnover = 0, totalVolume = 0;
  for (let i = 0; i < 20; i++) { totalTurnover += tp20[i] * vol20[i]; totalVolume += vol20[i]; }
  const vwap20 = totalVolume > 0 ? totalTurnover / totalVolume : close[n - 1];
  const vwapDeviation = vwap20 > 0 ? (close[n - 1] - vwap20) / vwap20 : 0.0;

  const avgVol20 = mean(vol20);
  const volStd20 = vol20.length > 1 ? stddev(vol20) : 1.0;
  const volumeZ = volStd20 > 0 ? (volume[n - 1] - avgVol20) / volStd20 : 0.0;

  const recent5Vol = volume.slice(Math.max(0, n - 5));
  const elevatedDays = recent5Vol.filter((v) => v > avgVol20 * 1.2).length;
  const volumePersistent = elevatedDays >= 3;

  const returnsAbs = diffLog(close).map(Math.abs);
  const rupeeVolume = [];
  for (let i = 1; i < n; i++) rupeeVolume.push(close[i] * volume[i]);

  let amihudTrend;
  if (returnsAbs.length >= 40) {
    const recentR = returnsAbs.slice(returnsAbs.length - 20);
    const recentV = rupeeVolume.slice(rupeeVolume.length - 20);
    const priorR = returnsAbs.slice(returnsAbs.length - 40, returnsAbs.length - 20);
    const priorV = rupeeVolume.slice(rupeeVolume.length - 40, rupeeVolume.length - 20);
    const recentAmihud = mean(recentR.map((r, i) => r / (recentV[i] > 0 ? recentV[i] : 1e-10)));
    const priorAmihud = mean(priorR.map((r, i) => r / (priorV[i] > 0 ? priorV[i] : 1e-10)));
    amihudTrend = recentAmihud > priorAmihud * 1.2 ? "deteriorating"
      : recentAmihud < priorAmihud * 0.8 ? "improving" : "stable";
  } else {
    amihudTrend = "insufficient_data";
  }

  let vwapScore;
  if (vwapDeviation > 0.03 && volumeZ > 1.5 && volumePersistent) vwapScore = 2.0;
  else if (vwapDeviation > 0.02 && volumeZ > 1.0) vwapScore = 1.5;
  else if (vwapDeviation > 0.01 && volumeZ > 0.5) vwapScore = 1.0;
  else if (vwapDeviation > 0.005) vwapScore = 0.5;
  else if (vwapDeviation > -0.005) vwapScore = 0.0;
  else if (vwapDeviation > -0.01) vwapScore = -0.5;
  else if (vwapDeviation > -0.02 && volumeZ > 1.0) vwapScore = -1.5;
  else if (vwapDeviation < -0.03 && volumeZ > 1.5) vwapScore = -2.0;
  else vwapScore = -1.0;

  if (!volumePersistent && Math.abs(vwapScore) > 1.0) vwapScore *= 0.7;

  const score = clamp(round(vwapScore, 2), -2.0, 2.0);

  return {
    rawValue: round(vwapDeviation * 100, 4),
    score,
    details: {
      vwapDeviationPct: round(vwapDeviation * 100, 4),
      volumeZScore: round(volumeZ, 2),
      volumeSurgeDays5d: elevatedDays,
      volumePersistent,
      amihudTrend,
      dataStatus: "OK",
      interpretation: interpret(score, vwapDeviation, volumeZ, volumePersistent, amihudTrend),
    },
  };
}

function interpret(score, vwapDev, volZ, persistent, amihud) {
  const parts = [];
  if (vwapDev > 0.02 && volZ > 1.0 && persistent) parts.push("Price above VWAP with sustained high volume — likely real accumulation");
  else if (vwapDev > 0.01 && volZ > 0.5) parts.push("Moderate bullish VWAP deviation with some volume support");
  else if (vwapDev < -0.02 && volZ > 1.0) parts.push("Price below VWAP with high volume — distribution pattern");
  else if (Math.abs(vwapDev) < 0.005) parts.push("Price near VWAP — no clear accumulation/distribution signal");
  else parts.push(`VWAP deviation ${(vwapDev * 100).toFixed(1)}% with volume Z=${volZ.toFixed(1)}`);

  if (!persistent && Math.abs(score) > 1) parts.push("Volume spike is not sustained (< 3 of 5 days) — possible climax, lower conviction");
  if (amihud === "deteriorating") parts.push("Liquidity deteriorating — consider smaller position size");

  return parts.join("; ");
}
