// Orchestrates the breakout engine: run all 9 detectors, attach state/score/trade-frame to
// each, rank by score, pick the primary (highest-scoring) pattern.
// Port of services/breakout_pattern.py's compute().
//
// `d` / `bench` are plain {date, open, high, low, close, volume} objects (arrays, ascending
// date order) -- the same shape the Yahoo Finance parser produces, so no separate "build
// engine dict" step is needed here unlike the Python adapter (which converts from a pandas
// DataFrame).
import { CFG } from "./config.js";
import { contextMetrics } from "./contextMetrics.js";
import { breakoutState } from "./state.js";
import { score } from "./scorer.js";
import { tradeFrame } from "./tradeFrame.js";
import { detectFlatBase } from "./detectors/flatBase.js";
import { detectAscendingTriangle } from "./detectors/ascendingTriangle.js";
import { detectVcp } from "./detectors/vcp.js";
import { detectCupHandle } from "./detectors/cupHandle.js";
import { detectBullFlag } from "./detectors/bullFlag.js";
import { detectDoubleBottom } from "./detectors/doubleBottom.js";
import { detectInverseHns } from "./detectors/inverseHns.js";
import { detectHighTightFlag } from "./detectors/highTightFlag.js";
import { detectSymmetricalTriangle } from "./detectors/symmetricalTriangle.js";

const DETECTORS = [
  detectFlatBase, detectAscendingTriangle, detectVcp,
  detectCupHandle, detectBullFlag, detectDoubleBottom, detectInverseHns, detectHighTightFlag,
  detectSymmetricalTriangle,
];

export function computeBreakout(d, bench = null) {
  if (d === null || d === undefined || d.close.length < CFG.minBars) {
    return null; // can't run -- "not yet computed", distinct from "no setup"
  }

  const ctx = contextMetrics(d, bench);

  const found = [];
  for (const fn of DETECTORS) {
    let p;
    try {
      p = fn(d);
    } catch (e) {
      continue; // a detector must never kill the scan
    }
    if (!p) continue;
    try {
      p.startDate = String(d.date[p.start]);
      p.endDate = String(d.date[Math.min(p.end, d.date.length - 1)]);
      p.state = breakoutState(d, p);
      p.score = score(ctx, p, p.state, d);
      p.tradeFrame = tradeFrame(d, p, p.state, ctx);
    } catch (e) {
      continue;
    }
    found.push(p);
  }

  const ranked = found.filter((p) => p.score).sort((a, b) => b.score.total - a.score.total);

  const contextSummary = {
    asOf: ctx.lastDate,
    bars: ctx.barsAvailable,
    lastClose: ctx.lastClose,
    pctOff52wHigh: ctx.pctOff52wHigh,
    atr20PctOfPrice: ctx.atr20PctOfPrice,
    volRatio10dVs50d: ctx.volRatio10dVs50d,
    medianDailyTurnoverCr: ctx.medianDailyTurnoverCr,
    trendTemplatePassed: ctx.trendTemplatePassed,
    trendTemplateTested: ctx.trendTemplateTested,
    relativeStrength: ctx.relativeStrength,
    new52wHighToday: ctx.new52wHighToday,
  };

  if (ranked.length === 0) {
    return {
      score: 0, band: "NO SETUP", pattern: null, state: null,
      details: { patterns: [], primary: null, context: contextSummary },
    };
  }

  const primary = ranked[0];
  return {
    score: primary.score.total,
    band: primary.score.band,
    pattern: primary.name,
    state: primary.state.state,
    details: { patterns: ranked, primary, context: contextSummary },
  };
}
