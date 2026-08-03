// Strict swing highs/lows: extreme within +/- k bars. Port of breakout_scan.py's find_pivots.
export function findPivots(high, low, k) {
  const n = high.length;
  const ph = [], pl = [];
  for (let i = k; i < n - k; i++) {
    let windowHighMax = -Infinity, windowLowMin = Infinity;
    for (let j = i - k; j <= i + k; j++) {
      if (high[j] > windowHighMax) windowHighMax = high[j];
      if (low[j] < windowLowMin) windowLowMin = low[j];
    }
    if (high[i] >= windowHighMax && high[i] > high[i - 1]) ph.push(i);
    if (low[i] <= windowLowMin && low[i] < low[i - 1]) pl.push(i);
  }
  return { ph, pl };
}
