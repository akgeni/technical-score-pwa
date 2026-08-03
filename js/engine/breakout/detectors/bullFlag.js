// Sharp advance (pole) then a tight, shallow, low-volume drift.
// Port of breakout_scan.py's detect_bull_flag.
import { mean } from "../../indicators.js";
import { CFG } from "../config.js";
import { pct, r2 } from "../utils.js";

export function detectBullFlag(d) {
  const { high: h, low: l, volume: v } = d;
  const n = h.length;
  let best = null;

  for (let flagLen = 3; flagLen <= CFG.flagMaxLen; flagLen++) {
    const fs = n - flagLen;
    if (fs < 30) break;
    for (let pole = 5; pole <= CFG.flagPoleMaxBars; pole++) {
      const ps = fs - pole;
      if (ps < 1) break;
      const move = (h[fs - 1] - l[ps]) / l[ps];
      if (move < CFG.flagPoleMinMove) continue;
      const top = Math.max(...h.slice(fs - 1));
      const flagLow = Math.min(...l.slice(fs));
      const retrace = (top - flagLow) / (h[fs - 1] - l[ps]);
      if (retrace > CFG.flagMaxRetrace) continue;
      const vp = mean(v.slice(ps, fs));
      const vf = mean(v.slice(fs));
      const vr = vp > 0 ? (vf / vp) : null;
      const quality = (
        0.4 * Math.min(1.0, move / 0.35)
        + 0.3 * Math.max(0.0, 1 - retrace / CFG.flagMaxRetrace)
        + 0.3 * (vr !== null ? Math.max(0.0, 1 - vr) : 0.15)
      );
      if (best === null || quality > best.quality) {
        best = {
          name: "Bull flag / pennant", start: ps, end: n - 1,
          pivot: top, stopRef: flagLow,
          poleMovePct: pct(move), poleBars: pole,
          flagBars: flagLen, retracementOfPolePct: pct(retrace),
          volumeFlagVsPole: vr !== null ? r2(vr) : null,
          quality: Math.round(quality * 1000) / 1000,
        };
      }
    }
  }
  return best;
}
