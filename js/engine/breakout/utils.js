// pct/r2 ports of breakout_scan.py's pct()/r2() rounding helpers, shared across the breakout
// engine's context/detector/state/score/trade-frame modules.
export function pct(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  return Math.round(100 * x * 100) / 100;
}

export function r2(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  return Math.round(x * 100) / 100;
}
