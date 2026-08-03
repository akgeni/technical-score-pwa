// 0-100 confidence scoring. Components are scored independently so a good shape in a bad
// regime cannot carry the score on its own. Port of breakout_scan.py's contraction_at() +
// score().
import { atr, mean, clamp, round } from "../indicators.js";
import { pct, r2 } from "./utils.js";

// Base reliability tier per pattern (see references/pattern-definitions.md in the original skill).
const TIER = {
  "Flat base / rectangle": 1.00,
  "VCP (volatility contraction)": 0.95,
  "Ascending triangle": 0.90,
  "Cup with handle": 0.85,
  "Bull flag / pennant": 0.85,
  "Cup (handle not yet formed)": 0.60,
  "Double bottom": 0.70,
  "Inverse head & shoulders": 0.65,
};

// Reversal patterns form by definition well below the 52w high, so the proximity-to-high
// penalty applies only to continuation patterns.
const CONTINUATION = new Set([
  "Flat base / rectangle", "VCP (volatility contraction)", "Ascending triangle",
  "Cup with handle", "Cup (handle not yet formed)", "Bull flag / pennant",
]);

// Volatility contraction measured AS OF the end of the base (not today's bar, which the
// breakout itself would have already expanded). Port of breakout_scan.py's contraction_at.
function contractionAt(d, endIdx) {
  const { high: h, low: l, close: c } = d;
  const i = Math.max(20, Math.min(endIdx, c.length - 1));
  const aFull = atr(h, l, c, 20); // equivalent to computing on h[:i+1] etc. -- see scorer.js comment
  const out = { asOfIndex: i, atrRatio: null, rangePercentile: null };

  // Faithfully mirrors the Python original's index arithmetic: a[-63] on an (i+1)-length
  // truncated array is position i-62, while the price divisor uses index i-63 -- a genuine
  // off-by-one between the two in the source engine, preserved here rather than "fixed", so
  // this stays numerically identical to the already-working Python app.
  const atrIdx63 = i - 62;
  if (i + 1 > 63 && Number.isFinite(aFull[i]) && atrIdx63 >= 0 && Number.isFinite(aFull[atrIdx63]) && i - 63 >= 0 && c[i - 63] > 0) {
    out.atrRatio = r2((aFull[i] / c[i]) / (aFull[atrIdx63] / c[i - 63]));
  }
  if (i >= 40) {
    const bw = (Math.max(...h.slice(i - 19, i + 1)) - Math.min(...l.slice(i - 19, i + 1))) / c[i];
    const hist = [];
    for (let j = 20; j <= i; j++) {
      hist.push((Math.max(...h.slice(j - 20, j)) - Math.min(...l.slice(j - 20, j))) / c[j - 1]);
    }
    const histTail = hist.slice(Math.max(0, hist.length - 250));
    out.rangePercentile = pct(mean(histTail.map((x) => (x <= bw ? 1 : 0))));
  }
  return out;
}

export function score(ctx, pat, st, d = null) {
  const comp = {};
  const notes = [];

  let q = pat.quality * (TIER[pat.name] ?? 0.7);
  const off = ctx.pctOff52wHigh;
  if (CONTINUATION.has(pat.name) && off !== null && off !== undefined) {
    if (off < -35) {
      q *= 0.5;
      notes.push(`Consolidation sits ${Math.abs(off).toFixed(0)}% below the 52-week high — that is a pause in a downtrend, not a base. Continuation logic does not apply here.`);
    } else if (off < -20) {
      q *= 0.8;
      notes.push(`Base is ${Math.abs(off).toFixed(0)}% off the 52-week high — deeper than a first-stage base; overhead supply is a live risk.`);
    }
  }
  comp.patternQuality = { max: 25, score: round(25 * Math.min(1.0, q), 1) };

  const tested = ctx.trendTemplateTested;
  const trend = tested ? ctx.trendTemplatePassed / tested : 0.0;
  const conf = 0.5 + 0.5 * Math.min(1.0, tested / 6);
  if (tested < 4) {
    notes.push(`Trend template only partially testable (${tested} of 6 sub-tests) — short price history, so this component is discounted to ${(conf * 100).toFixed(0)}% of its weight.`);
  }
  comp.trendContext = { max: 20, score: round(20 * trend * conf, 1) };

  let cr = ctx.atrContractionRatioVs3mAgo;
  let pctl = ctx.range20dPercentile1y;
  if (d !== null && st.barsSinceTrigger !== null && st.barsSinceTrigger !== undefined) {
    const ca = contractionAt(d, pat.end ?? (d.close.length - 1));
    cr = ca.atrRatio !== null ? ca.atrRatio : cr;
    pctl = ca.rangePercentile !== null ? ca.rangePercentile : pctl;
    notes.push("Contraction measured at the last bar of the base (pre-breakout), since the breakout bar itself expands range by construction.");
  }
  let vCon = 0.0;
  if (cr !== null && cr !== undefined) {
    vCon += 0.5 * clamp((1.15 - cr) / 0.45, 0, 1);
  }
  if (pctl !== null && pctl !== undefined) {
    vCon += 0.5 * clamp((60 - pctl) / 50, 0, 1);
  }
  if ((cr === null || cr === undefined) && (pctl === null || pctl === undefined)) {
    notes.push("Volatility contraction not computable — insufficient history.");
  }
  comp.volatilityContraction = { max: 15, score: round(15 * vCon, 1) };

  let vs = 0.0;
  const dry = ctx.volRatio10dVs50d;
  if (dry !== null && dry !== undefined) {
    vs += 0.4 * clamp((1.10 - dry) / 0.40, 0, 1);
  }
  const bvr = st.breakoutVolumeRatio;
  if (bvr !== null && bvr !== undefined) {
    vs += 0.6 * clamp((bvr - 0.9) / 1.1, 0, 1);
  } else if (st.state.startsWith("FORMING") || st.state.startsWith("AT PIVOT")) {
    vs += 0.3;
    notes.push("No breakout bar yet — volume confirmation is pending, not failed.");
  }
  comp.volumeSignature = { max: 15, score: round(15 * Math.min(1.0, vs), 1) };

  const rs = ctx.relativeStrength;
  if (rs) {
    const exc = Object.values(rs).map((w) => w.excessPct).filter((x) => x !== null && x !== undefined);
    const avg = exc.length > 0 ? exc.reduce((a, b) => a + b, 0) / exc.length : 0;
    comp.relativeStrength = { max: 15, score: round(15 * clamp((avg + 5) / 20, 0, 1), 1) };
  } else {
    comp.relativeStrength = { max: 15, score: null, note: "NOT_AVAILABLE — no benchmark series supplied" };
    notes.push("Relative strength unavailable; weight renormalised across remaining components.");
  }

  const to = ctx.medianDailyTurnoverCr;
  if (to === null || to === undefined) {
    comp.liquidity = { max: 10, score: null, note: "NOT_AVAILABLE — no volume data" };
  } else {
    comp.liquidity = { max: 10, score: round(10 * clamp(Math.log10(Math.max(to, 0.01)) / 1.7, 0, 1), 1) };
  }

  let got = 0, maxi = 0;
  for (const c of Object.values(comp)) {
    if (c.score !== null && c.score !== undefined) { got += c.score; maxi += c.max; }
  }
  let total = maxi ? round(100 * got / maxi, 1) : 0.0;

  if (st.state.startsWith("FAILED")) {
    total = Math.min(total, 35.0);
    notes.push("Score capped at 35: the breakout already failed. A failed base needs to rebuild before it counts again.");
  }
  if (st.state.startsWith("EXTENDED")) {
    total = Math.min(total, 55.0);
    notes.push("Score capped at 55: setup is valid but the low-risk entry has passed.");
  }

  let band;
  if (total >= 75) band = "HIGH CONVICTION";
  else if (total >= 60) band = "CONSTRUCTIVE";
  else if (total >= 45) band = "MARGINAL — watchlist only";
  else band = "LOW — stand aside";

  return { components: comp, total, band, renormalisedOverMax: maxi, notes };
}
