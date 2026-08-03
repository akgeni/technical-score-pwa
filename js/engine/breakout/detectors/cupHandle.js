// Cup with handle: rounded correction, right rim near left rim, then a shallow drift on
// dried-up volume. Port of breakout_scan.py's detect_cup_handle.
import { mean } from "../../indicators.js";
import { CFG } from "../config.js";
import { findPivots } from "../pivots.js";
import { pct, r2 } from "../utils.js";

export function detectCupHandle(d) {
  const { high: h, low: l, close: c, volume: v } = d;
  const n = c.length;
  const { ph, pl } = findPivots(h, l, CFG.pivotK);
  let best = null;

  const lefts = ph.filter((i) => i <= n - CFG.cupMinLen);
  for (const left of lefts) {
    const cands = pl.filter((i) => i >= left + 8 && i <= left + CFG.cupMaxLen);
    if (cands.length === 0) continue;
    const bottom = cands.reduce((min, i) => (l[i] < l[min] ? i : min), cands[0]);
    const depth = (h[left] - l[bottom]) / h[left];
    if (!(depth >= CFG.cupMinDepth && depth <= CFG.cupMaxDepth)) continue;

    const rights = ph.filter((i) => i >= bottom + 8 && i <= Math.min(n - 1, left + CFG.cupMaxLen));
    if (rights.length === 0) continue;
    const right = rights.reduce((max, i) => (h[i] > h[max] ? i : max), rights[0]);

    const cupLen = right - left;
    if (!(cupLen >= CFG.cupMinLen && cupLen <= CFG.cupMaxLen)) continue;
    if (h[right] < h[left] * 0.90) continue;

    const pos = (bottom - left) / Math.max(1, cupLen);
    if (!(pos >= 0.30 && pos <= 0.75)) continue;

    const rim = Math.max(h[left], h[right]);
    let handle = null;
    if (right < n - CFG.handleMinLen) {
      const hl = Math.min(...l.slice(right + 1));
      const hdepth = (h[right] - hl) / h[right];
      const hbars = n - 1 - right;
      if (hdepth <= CFG.handleMaxDepth && hbars >= CFG.handleMinLen && hbars <= CFG.handleMaxLen
          && hl > l[bottom] + 0.5 * (rim - l[bottom])) {
        const ve = right > left ? mean(v.slice(left, right)) : 0;
        const vh = mean(v.slice(right + 1));
        handle = { depthPct: pct(hdepth), bars: hbars, low: r2(hl), volumeVsCup: ve > 0 ? r2(vh / ve) : null };
      }
    }

    const quality = (
      0.35 * (1 - Math.abs(pos - 0.5) * 2)
      + 0.25 * Math.max(0.0, 1 - Math.abs(depth - 0.22) / 0.22)
      + 0.20 * Math.min(1.0, h[right] / h[left])
      + 0.20 * (handle ? 1.0 : 0.0)
    );

    if (best === null || quality > best.quality) {
      best = {
        name: handle ? "Cup with handle" : "Cup (handle not yet formed)",
        start: left, end: n - 1,
        pivot: handle === null ? h[right] : Math.max(h[right], rim * 0.995),
        stopRef: handle ? handle.low : l[bottom],
        cupDepthPct: pct(depth), cupLengthBars: cupLen,
        bottomPositionInCup: r2(pos),
        rightRimVsLeftRim: r2(h[right] / h[left]),
        handle, quality: Math.round(quality * 1000) / 1000,
      };
    }
  }
  return best;
}
