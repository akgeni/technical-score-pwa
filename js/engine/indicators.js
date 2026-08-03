// Shared numeric primitives used by the metrics and breakout engines.
// Direct ports of the numpy helpers in services/metrics/*.py and services/breakout_scan.py.
// All functions take/return plain arrays of numbers (no external deps).

export function mean(arr) {
  if (arr.length === 0) return NaN;
  let s = 0;
  for (const x of arr) s += x;
  return s / arr.length;
}

// Sample standard deviation (ddof=1), matching numpy's np.std(..., ddof=1).
export function stddev(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (const x of arr) s += (x - m) * (x - m);
  return Math.sqrt(s / (n - 1));
}

// Population standard deviation (ddof=0), matching numpy's default np.std().
export function stddev0(arr) {
  const n = arr.length;
  if (n === 0) return 0;
  const m = mean(arr);
  let s = 0;
  for (const x of arr) s += (x - m) * (x - m);
  return Math.sqrt(s / n);
}

export function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function sum(arr) {
  let s = 0;
  for (const x of arr) s += x;
  return s;
}

export function diffLog(closes) {
  // np.diff(np.log(close))
  const out = new Array(closes.length - 1);
  for (let i = 1; i < closes.length; i++) out[i - 1] = Math.log(closes[i]) - Math.log(closes[i - 1]);
  return out;
}

// Simple moving average, NaN-padded for indices before the window is full.
// Mirrors breakout_scan.py's sma(a, n).
export function sma(arr, n) {
  const len = arr.length;
  const out = new Array(len).fill(NaN);
  if (len < n) return out;
  let windowSum = 0;
  for (let i = 0; i < n; i++) windowSum += arr[i];
  out[n - 1] = windowSum / n;
  for (let i = n; i < len; i++) {
    windowSum += arr[i] - arr[i - n];
    out[i] = windowSum / n;
  }
  return out;
}

export function trueRange(high, low, close) {
  const n = high.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const prevClose = i === 0 ? close[0] : close[i - 1];
    out[i] = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - prevClose),
      Math.abs(low[i] - prevClose)
    );
  }
  return out;
}

export function atr(high, low, close, n = 20) {
  return sma(trueRange(high, low, close), n);
}

// Wilder's smoothing (used by ADX). Mirrors trend_strength.py's _wilder_smooth.
export function wilderSmooth(data, period) {
  const n = data.length;
  const out = new Array(n).fill(0);
  if (n < period) return out;
  let s = 0;
  for (let i = 0; i < period; i++) s += data[i];
  out[period - 1] = s / period;
  for (let i = period; i < n; i++) {
    out[i] = (out[i - 1] * (period - 1) + data[i]) / period;
  }
  return out;
}

// Ordinary least-squares slope of y against x = 0..n-1. Mirrors np.polyfit(x, y, 1)[0].
export function linregSlope(y) {
  const n = y.length;
  if (n < 3) return 0.0;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += y[i];
    sumXY += i * y[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0.0;
  return (n * sumXY - sumX * sumY) / denom;
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export function round(x, decimals = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return x;
  const f = Math.pow(10, decimals);
  return Math.round(x * f) / f;
}

export function isFinite(x) {
  return x !== null && x !== undefined && Number.isFinite(x);
}
