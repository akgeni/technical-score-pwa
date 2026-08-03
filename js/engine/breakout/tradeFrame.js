// Pivot / buy zone / invalidation stop / measured-move targets.
// Port of breakout_scan.py's trade_frame.
import { CFG } from "./config.js";
import { pct, r2 } from "./utils.js";

export function tradeFrame(d, pat, st, ctx) {
  const c = d.close;
  const a = ctx.atr20 || 0;
  const pivot = pat.pivot, baseLow = pat.stopRef;
  const entry = Math.max(c[c.length - 1], pivot * (1 + CFG.breakoutBuffer));
  const stopStruct = baseLow * 0.995;
  const stopAtr = a ? entry - 1.75 * a : stopStruct;
  let stop = Math.max(stopStruct, stopAtr);
  if (stop >= entry) stop = entry * 0.94;
  const risk = (entry - stop) / entry;
  const depth = pivot - baseLow;
  const t1 = pivot + depth, t2 = pivot + 2 * depth;

  return {
    pivot: r2(pivot),
    buyZone: [r2(pivot * 1.002), r2(pivot * 1.03)],
    referenceEntry: r2(entry),
    invalidationStop: r2(stop),
    stopBasis: stop === stopStruct ? "base low" : "1.75x ATR20",
    riskPerSharePct: pct(risk),
    measuredMoveTarget1: r2(t1),
    measuredMoveTarget2: r2(t2),
    rewardRiskToTarget1: entry > stop ? r2((t1 - entry) / (entry - stop)) : null,
  };
}
