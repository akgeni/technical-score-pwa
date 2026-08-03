// Flat ceiling, rising floor: supply absorbed at a fixed price.
// Port of breakout_scan.py's detect_ascending_triangle.
import { mean, linregSlope } from "../../indicators.js";
import { pct } from "../utils.js";
import { CFG } from "../config.js";
import { findPivots } from "../pivots.js";

export function detectAscendingTriangle(d) {
  const { high: h, low: l, close: c } = d;
  const n = c.length;
  const { ph, pl } = findPivots(h, l, CFG.pivotK);
  let best = null;

  const lengthLimit = Math.min(130, n - 1);
  for (let length = 25; length < lengthLimit; length++) {
    const start = n - length, end = n - 1;
    const hiP = ph.filter((i) => i >= start && i <= end);
    const loP = pl.filter((i) => i >= start && i <= end);
    if (hiP.length < 2 || loP.length < 2) continue;
    const hv = hiP.map((i) => h[i]);
    const lv = loP.map((i) => l[i]);
    const top = Math.max(...hv);
    if ((top - Math.min(...hv)) / top > 0.04) continue;
    const loSlope = linregSlope(lv) / Math.max(1e-9, mean(lv));
    if (loSlope <= 0.0005) continue;
    const floorNow = Math.min(...l.slice(Math.max(start, end - 10), end + 1));
    const conv = (top - floorNow) / top;
    const quality = (
      0.4 * Math.min(1.0, hiP.length / 3)
      + 0.3 * Math.min(1.0, loP.length / 3)
      + 0.3 * Math.max(0.0, 1 - conv / 0.15)
    );
    if (best === null || quality > best.quality) {
      best = {
        name: "Ascending triangle", start, end,
        pivot: top, stopRef: floorNow,
        ceilingTouches: hiP.length, floorTouches: loP.length,
        floorSlopePctPerBar: pct(loSlope),
        apexGapPct: pct(conv), lengthBars: length,
        quality: Math.round(quality * 1000) / 1000,
      };
    }
  }
  return best;
}
