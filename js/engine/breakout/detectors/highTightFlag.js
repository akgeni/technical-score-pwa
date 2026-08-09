// High and tight flag: a much more aggressive continuation pattern than Bull flag/pennant --
// requires an extreme prior advance (classically ~90-100%+ within roughly 8 weeks, O'Neil/IBD's
// original definition) followed by an unusually SHALLOW, TIGHT pullback (<=25%, vs. regular
// bull flag's 40%) on fading volume. Rare in practice, high-reward when it resolves, but also
// widely considered higher-risk since the extreme prior move often signals speculative,
// unsustainable buying -- exactly the kind of claim not taken on faith here; see the backtest
// this shipped with rather than the tier weight in scorer.js.
//
// Not part of the original breakout-pattern skill this engine was ported from -- added here
// directly (unlike the Flask app's vendored breakout_scan.py, nothing in this PWA's breakout
// engine is a "pristine copy" of anything, so this is a normal addition, not an extension file).
import { mean } from "../../indicators.js";
import { pct, r2 } from "../utils.js";

const CFG_EXT = {
  flagPoleMinMove: 0.90,   // >=90% advance -- the "high" in "high and tight"
  flagPoleMinBars: 10,
  flagPoleMaxBars: 40,     // within ~8 weeks
  flagMaxRetrace: 0.25,    // <=25% pullback -- the "tight" part (regular bull flag allows 40%)
  flagMaxLen: 25,
};

export function detectHighTightFlag(d) {
  const { high: h, low: l, volume: v } = d;
  const n = h.length;
  let best = null;

  for (let flagLen = 3; flagLen <= CFG_EXT.flagMaxLen; flagLen++) {
    const fs = n - flagLen;
    if (fs < 30) break;
    for (let pole = CFG_EXT.flagPoleMinBars; pole <= CFG_EXT.flagPoleMaxBars; pole++) {
      const ps = fs - pole;
      if (ps < 1) break;
      const move = (h[fs - 1] - l[ps]) / l[ps];
      if (move < CFG_EXT.flagPoleMinMove) continue;
      const top = Math.max(...h.slice(fs - 1));
      const flagLow = Math.min(...l.slice(fs));
      const retrace = (top - flagLow) / (h[fs - 1] - l[ps]);
      if (retrace > CFG_EXT.flagMaxRetrace) continue;
      const vp = mean(v.slice(ps, fs));
      const vf = mean(v.slice(fs));
      const vr = vp > 0 ? (vf / vp) : null;
      // Same shape as bull flag's quality formula, rescaled: the move component is normalized
      // against 1.8x the (much higher) minimum move so a "just qualifies" 90% move and a
      // "textbook" ~160% move span the same 0-1 range bull flag's move/0.35 does for its own,
      // much lower, threshold.
      const quality = (
        0.45 * Math.min(1.0, move / (CFG_EXT.flagPoleMinMove * 1.8))
        + 0.30 * Math.max(0.0, 1 - retrace / CFG_EXT.flagMaxRetrace)
        + 0.25 * (vr !== null ? Math.max(0.0, 1 - vr) : 0.15)
      );
      if (best === null || quality > best.quality) {
        best = {
          name: "High and tight flag", start: ps, end: n - 1,
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
