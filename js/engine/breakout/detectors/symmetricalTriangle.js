// Symmetrical triangle: a converging consolidation -- ceiling falling, floor rising, both
// toward an apex -- distinct from Ascending Triangle (flat ceiling specifically). Added
// because this project's own watchlist skews toward high-beta capex/defense/EMS momentum
// names that consolidate this way after a sharp advance; VCP (the closest existing analog)
// turned out to be the rarest-firing pattern in this universe despite that same profile.
//
// Not part of the original breakout-pattern skill this engine was ported from -- added here
// directly (unlike the Flask app's vendored breakout_scan.py, nothing in this PWA's breakout
// engine is a "pristine copy" of anything). Port of
// services/breakout_scan_ext.py's detect_symmetrical_triangle -- same find_pivots/linregSlope
// scaffolding, same CFG.pivotK, same treat-pivots-as-equally-spaced convention linregSlope
// already uses for the vendored triangle/flat-base detectors (not "fixed" here to stay
// consistent with the rest of the codebase).
import { mean, linregSlope } from "../../indicators.js";
import { pct } from "../utils.js";
import { CFG } from "../config.js";
import { findPivots } from "../pivots.js";

const SYM_TRI_CFG = {
  minLen: 25,
  maxLen: 130,
  minSlopePctPerBar: 0.0005,
  maxLateRangeRatio: 0.85,
};

export function detectSymmetricalTriangle(d) {
  const { high: h, low: l } = d;
  const n = l.length;
  const { ph, pl } = findPivots(h, l, CFG.pivotK);
  let best = null;

  const lengthLimit = Math.min(SYM_TRI_CFG.maxLen, n - 1);
  for (let length = SYM_TRI_CFG.minLen; length < lengthLimit; length++) {
    const start = n - length, end = n - 1;
    const hiP = ph.filter((i) => i >= start && i <= end);
    const loP = pl.filter((i) => i >= start && i <= end);
    if (hiP.length < 2 || loP.length < 2) continue;
    const hv = hiP.map((i) => h[i]);
    const lv = loP.map((i) => l[i]);
    const hiSlope = linregSlope(hv) / Math.max(1e-9, mean(hv));
    const loSlope = linregSlope(lv) / Math.max(1e-9, mean(lv));
    if (hiSlope >= -SYM_TRI_CFG.minSlopePctPerBar || loSlope <= SYM_TRI_CFG.minSlopePctPerBar) continue;

    const mid = start + Math.floor(length / 2);
    const earlyHi = hiP.filter((i) => i < mid);
    const earlyLo = loP.filter((i) => i < mid);
    const lateHi = hiP.filter((i) => i >= mid);
    const lateLo = loP.filter((i) => i >= mid);
    if (!earlyHi.length || !earlyLo.length || !lateHi.length || !lateLo.length) continue;

    const earlyRange = Math.max(...earlyHi.map((i) => h[i])) - Math.min(...earlyLo.map((i) => l[i]));
    const lateRange = Math.max(...lateHi.map((i) => h[i])) - Math.min(...lateLo.map((i) => l[i]));
    if (earlyRange <= 0) continue;
    const apexRatio = lateRange / earlyRange;
    if (apexRatio > SYM_TRI_CFG.maxLateRangeRatio) continue;

    const pivot = Math.max(...lateHi.map((i) => h[i]));
    const stopRef = Math.min(...lateLo.map((i) => l[i]));
    const quality = (
      0.35 * Math.min(1.0, (hiP.length + loP.length) / 6)
      + 0.40 * Math.max(0.0, 1 - apexRatio / SYM_TRI_CFG.maxLateRangeRatio)
      + 0.25 * Math.min(1.0, length / 40)
    );
    if (best === null || quality > best.quality) {
      best = {
        name: "Symmetrical triangle", start, end,
        pivot, stopRef,
        ceilingSlopePctPerBar: pct(hiSlope), floorSlopePctPerBar: pct(loSlope),
        rangeContractionPct: pct(1 - apexRatio),
        ceilingTouches: hiP.length, floorTouches: loP.length,
        lengthBars: length, quality: Math.round(quality * 1000) / 1000,
      };
    }
  }
  return best;
}
