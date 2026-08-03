// Volatility contraction: successive pullbacks, each shallower than the last, on fading
// volume. Port of breakout_scan.py's detect_vcp.
import { mean } from "../../indicators.js";
import { CFG } from "../config.js";
import { findPivots } from "../pivots.js";
import { pct, r2 } from "../utils.js";

export function detectVcp(d) {
  const { high: h, low: l, close: c, volume: v } = d;
  const n = c.length;
  const { ph, pl } = findPivots(h, l, 3);
  if (ph.length < 2 || pl.length < 2) return null;

  let piv = [...ph.map((i) => [i, "H"]), ...pl.map((i) => [i, "L"])];
  piv.sort((a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  piv = piv.filter((p) => p[0] >= n - 160);

  const legs = [];
  for (let j = 0; j < piv.length - 1; j++) {
    const [i0, t0] = piv[j], [i1, t1] = piv[j + 1];
    if (t0 === "H" && t1 === "L") {
      legs.push({ hiI: i0, loI: i1, depth: (h[i0] - l[i1]) / h[i0], bars: i1 - i0 });
    }
  }
  if (legs.length < 2) return null;

  let seq = legs.slice(Math.max(0, legs.length - CFG.vcpMaxContractions));
  let contract = true;
  for (let k = 0; k < seq.length - 1; k++) {
    if (!(seq[k + 1].depth < seq[k].depth * 0.85)) { contract = false; break; }
  }
  if (!contract) {
    if (seq.length > 2) {
      seq = seq.slice(seq.length - 2);
      contract = seq[1].depth < seq[0].depth * 0.85;
    }
    if (!contract) return null;
  }

  const start = seq[0].hiI;
  const pivot = Math.max(...h.slice(start));
  const lastDepth = seq[seq.length - 1].depth;
  if (lastDepth > 0.15) return null;

  const vEarly = (n - start > 10) ? mean(v.slice(start, start + Math.max(5, Math.floor((n - start) / 3)))) : 0;
  const vLate = mean(v.slice(Math.max(start, n - 10)));
  const dryup = vEarly > 0 ? (vLate / vEarly) : null;

  const quality = (
    0.4 * Math.min(1.0, seq.length / 3)
    + 0.3 * Math.max(0.0, 1 - lastDepth / 0.15)
    + 0.3 * (dryup !== null ? Math.max(0.0, 1 - dryup) : 0.15)
  );

  return {
    name: "VCP (volatility contraction)", start, end: n - 1,
    pivot, stopRef: l[seq[seq.length - 1].loI],
    contractions: seq.map((s) => ({ depthPct: pct(s.depth), bars: s.bars })),
    finalContractionPct: pct(lastDepth),
    volumeDryupRatio: dryup !== null ? r2(dryup) : null,
    lengthBars: n - 1 - start, quality: Math.round(quality * 1000) / 1000,
  };
}
