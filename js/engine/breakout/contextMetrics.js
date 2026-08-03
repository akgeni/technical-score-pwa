// Context preconditions computed independently of any pattern shape (trend, contraction,
// volume, liquidity, relative strength). Port of breakout_scan.py's context_metrics().
//
// Omission vs the Python original: the Donchian-high booleans
// (close_above_{55,125,250}d_donchian_high) are computed by the engine but never actually
// read anywhere downstream — services/breakout_pattern.py's own context_summary already drops
// them before they reach the Flask app's UI. Skipped here as genuinely dead computation.
import { sma, atr, mean, median } from "../indicators.js";
import { pct, r2 } from "./utils.js";

export function contextMetrics(d, bench = null) {
  const { high: h, low: l, close: c, volume: v } = d;
  const n = c.length;
  const last = c[n - 1];
  const m = { barsAvailable: n, lastClose: r2(last), lastDate: String(d.date[n - 1]) };

  const s50 = sma(c, 50), s150 = sma(c, 150), s200 = sma(c, 200);
  m.sma50 = n >= 50 ? r2(s50[n - 1]) : null;
  m.sma150 = n >= 150 ? r2(s150[n - 1]) : null;
  m.sma200 = n >= 200 ? r2(s200[n - 1]) : null;

  let tt = 0;
  const ttDetail = {};
  if (n >= 50) {
    const ok = last > s50[n - 1];
    tt += ok ? 1 : 0;
    ttDetail["close>50dma"] = ok;
  }
  if (n >= 150) {
    const ok = s50[n - 1] > s150[n - 1];
    tt += ok ? 1 : 0;
    ttDetail["50dma>150dma"] = ok;
  }
  if (n >= 200) {
    let ok = s150[n - 1] > s200[n - 1];
    tt += ok ? 1 : 0;
    ttDetail["150dma>200dma"] = ok;
    ok = s200[n - 1] > s200[n - 21];
    tt += ok ? 1 : 0;
    ttDetail["200dma_rising_1m"] = ok;
  }

  const win = Math.min(n, 250);
  const hi52 = Math.max(...h.slice(n - win));
  const lo52 = Math.min(...l.slice(n - win));
  m.windowDaysFor52w = win;
  m.high52w = r2(hi52);
  m.low52w = r2(lo52);
  m.pctOff52wHigh = pct((last - hi52) / hi52);
  m.pctAbove52wLow = pct((last - lo52) / lo52);
  if (win >= 200) {
    let ok = (last - hi52) / hi52 >= -0.25;
    tt += ok ? 1 : 0;
    ttDetail["within_25pct_of_52w_high"] = ok;
    ok = (last - lo52) / lo52 >= 0.30;
    tt += ok ? 1 : 0;
    ttDetail["30pct_above_52w_low"] = ok;
  }
  m.trendTemplatePassed = tt;
  m.trendTemplateTested = Object.keys(ttDetail).length;
  m.trendTemplateDetail = ttDetail;

  const a20 = atr(h, l, c, 20);
  m.atr20 = r2(a20[n - 1]);
  m.atr20PctOfPrice = Number.isFinite(a20[n - 1]) ? pct(a20[n - 1] / last) : null;
  if (n >= 90 && Number.isFinite(a20[n - 63])) {
    m.atrContractionRatioVs3mAgo = r2((a20[n - 1] / last) / (a20[n - 63] / c[n - 63]));
  } else {
    m.atrContractionRatioVs3mAgo = null;
  }
  if (n >= 20) {
    const bw = (Math.max(...h.slice(n - 20)) - Math.min(...l.slice(n - 20))) / last;
    m.range20dPct = pct(bw);
    const hist = [];
    for (let i = 20; i <= n; i++) {
      hist.push((Math.max(...h.slice(i - 20, i)) - Math.min(...l.slice(i - 20, i))) / c[i - 1]);
    }
    const histTail = hist.slice(Math.max(0, hist.length - Math.min(hist.length, 250)));
    m.range20dPercentile1y = pct(mean(histTail.map((x) => (x <= bw ? 1 : 0))));
  } else {
    m.range20dPct = null;
    m.range20dPercentile1y = null;
  }

  const vol50Window = v.slice(n - 50 >= 0 ? n - 50 : 0);
  if (n >= 50 && vol50Window.reduce((a, b) => a + b, 0) > 0) {
    const v50 = mean(vol50Window);
    m.vol50dAvg = r2(v50);
    m.volRatio10dVs50d = v50 ? r2(mean(v.slice(n - 10)) / v50) : null;
    m.volRatioLastBar = v50 ? r2(v[n - 1] / v50) : null;
    const turnoverArr = [];
    for (let i = n - 20; i < n; i++) turnoverArr.push(v[i] * c[i]);
    const turnover = median(turnoverArr);
    m.medianDailyTurnoverCr = r2(turnover / 1e7);
  } else {
    m.vol50dAvg = null;
    m.volRatio10dVs50d = null;
    m.volRatioLastBar = null;
    m.medianDailyTurnoverCr = null;
  }

  m.new52wHighToday = n > 250 && last >= Math.max(...h.slice(n - 250));

  m.relativeStrength = null;
  if (bench !== null && bench !== undefined) {
    const rs = {};
    const bd = new Map();
    bench.date.forEach((dt, i) => bd.set(String(dt), i));
    const windows = [[21, "1m"], [63, "3m"], [126, "6m"]];
    for (const [w, label] of windows) {
      if (n <= w) continue;
      const d0 = String(d.date[n - w - 1]);
      const d1 = String(d.date[n - 1]);
      if (bd.has(d0) && bd.has(d1)) {
        const sr = c[n - 1] / c[n - w - 1] - 1;
        const br = bench.close[bd.get(d1)] / bench.close[bd.get(d0)] - 1;
        rs[label] = { stockPct: pct(sr), benchPct: pct(br), excessPct: pct(sr - br) };
      }
    }
    if (Object.keys(rs).length > 0) m.relativeStrength = rs;
  }

  return m;
}
