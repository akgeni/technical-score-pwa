// Double bottom: two similar lows separated by a meaningful rebound. Port of
// breakout_scan.py's detect_double_bottom — the one detector the Best-Evidenced Setup rule
// checks for by name.
import { CFG } from "../config.js";
import { findPivots } from "../pivots.js";
import { pct } from "../utils.js";

export function detectDoubleBottom(d) {
  const { high: h, low: l, close: c } = d;
  const n = c.length;
  const { ph, pl } = findPivots(h, l, CFG.pivotK);
  let best = null;

  for (const a of pl) {
    const candidatesB = pl.filter((i) => (i - a) >= 10 && (i - a) <= 70);
    for (const b of candidatesB) {
      if (Math.abs(l[b] - l[a]) / l[a] > 0.05) continue;
      const mids = ph.filter((i) => i > a && i < b);
      if (mids.length === 0) continue;
      const peak = mids.reduce((max, i) => (h[i] > h[max] ? i : max), mids[0]);
      const bottomMin = Math.min(l[a], l[b]);
      const rise = (h[peak] - bottomMin) / bottomMin;
      if (rise < 0.08) continue;
      const quality = 0.5 * Math.min(1.0, rise / 0.25) + 0.5 * (1 - Math.abs(l[b] - l[a]) / l[a] / 0.05);
      if (best === null || quality > best.quality) {
        best = {
          name: "Double bottom", start: a, end: n - 1,
          pivot: h[peak], stopRef: bottomMin,
          bottomGapPct: pct(Math.abs(l[b] - l[a]) / l[a]),
          necklineRisePct: pct(rise), barsBetweenBottoms: b - a,
          quality: Math.round(quality * 1000) / 1000,
        };
      }
    }
  }
  return best;
}
