// Inverse head & shoulders. Port of breakout_scan.py's detect_inverse_hns.
import { CFG } from "../config.js";
import { findPivots } from "../pivots.js";
import { pct } from "../utils.js";

export function detectInverseHns(d) {
  const { high: h, low: l, close: c } = d;
  const n = c.length;
  const { ph, pl } = findPivots(h, l, CFG.pivotK);
  let best = null;

  for (let i = 0; i < pl.length - 2; i++) {
    const ls = pl[i], head = pl[i + 1], rs = pl[i + 2];
    if (!(l[head] < l[ls] && l[head] < l[rs])) continue;
    if (Math.abs(l[ls] - l[rs]) / l[ls] > 0.10) continue;
    const n1 = ph.filter((j) => j > ls && j < head);
    const n2 = ph.filter((j) => j > head && j < rs);
    if (n1.length === 0 || n2.length === 0) continue;
    const peak1 = n1.reduce((max, j) => (h[j] > h[max] ? j : max), n1[0]);
    const peak2 = n2.reduce((max, j) => (h[j] > h[max] ? j : max), n2[0]);
    const neck = Math.max(h[peak1], h[peak2]);
    if ((neck - l[head]) / neck < 0.08) continue;
    if (n - 1 - rs > 30) continue;
    const quality = (
      0.5 * (1 - Math.abs(l[ls] - l[rs]) / l[ls] / 0.10)
      + 0.5 * Math.min(1.0, ((neck - l[head]) / neck) / 0.30)
    );
    if (best === null || quality > best.quality) {
      best = {
        name: "Inverse head & shoulders", start: ls, end: n - 1,
        pivot: neck, stopRef: Math.min(l[ls], l[rs]),
        shoulderSymmetryPct: pct(Math.abs(l[ls] - l[rs]) / l[ls]),
        headDepthBelowNecklinePct: pct((neck - l[head]) / neck),
        quality: Math.round(quality * 1000) / 1000,
      };
    }
  }
  return best;
}
