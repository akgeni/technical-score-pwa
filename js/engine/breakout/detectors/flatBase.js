// Flat base / rectangle / Darvas box: horizontal consolidation with repeated touches of a
// well-defined ceiling. Port of breakout_scan.py's detect_flat_base.
import { mean, stddev0 } from "../../indicators.js";
import { pct } from "../utils.js";
import { CFG } from "../config.js";

export function detectFlatBase(d) {
  const { high: h, low: l, close: c } = d;
  const n = c.length;
  let best = null;

  for (let endOff = 0; endOff < 16; endOff++) {
    const end = n - 1 - endOff;
    for (let length = CFG.flatBaseMinLen; length <= CFG.flatBaseMaxLen; length++) {
      const start = end - length + 1;
      if (start < 1) break;
      const segH = h.slice(start, end + 1);
      const segL = l.slice(start, end + 1);
      const segC = c.slice(start, end + 1);
      const top = Math.max(...segH);
      const bot = Math.min(...segL);
      const depth = (top - bot) / top;
      if (depth > CFG.flatBaseMaxDepth || depth < 0.02) continue;
      const topTouch = segH.filter((x) => x >= top * 0.98).length;
      const botTouch = segL.filter((x) => x <= bot * 1.03).length;
      if (topTouch < 2 || botTouch < 2) continue;
      const tight = stddev0(segC) / mean(segC);
      const pre = Math.max(0, start - 40);
      const prior = (start - pre >= 10) ? (c[start] / c[pre] - 1) : 0.0;
      let quality = (
        0.35 * Math.min(1.0, (topTouch + botTouch) / 6)
        + 0.30 * Math.max(0.0, 1 - depth / CFG.flatBaseMaxDepth)
        + 0.20 * Math.max(0.0, 1 - tight / 0.08)
        + 0.15 * Math.min(1.0, Math.max(0.0, prior / 0.20))
      );
      quality *= Math.min(1.0, length / 25);
      if (best === null || quality > best.quality) {
        best = {
          name: "Flat base / rectangle", start, end,
          pivot: top, stopRef: bot,
          depthPct: pct(depth), lengthBars: length,
          touchesTop: topTouch, touchesBottom: botTouch,
          closeTightnessPct: pct(tight),
          priorAdvancePct: pct(prior), quality: Math.round(quality * 1000) / 1000,
        };
      }
    }
  }
  return best;
}
