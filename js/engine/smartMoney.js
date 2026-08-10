// Per-stock "smart money" flow read -- Tier 2 (unattributed stock-futures OI buildup/
// unwinding) and Tier 3 (delivery-weighted accumulation + average-trade-size) only. Port of
// services/smart_money.py's _tier2/_tier3/_agreement_label/compute.
//
// Tier 1 (named bulk/block deal counterparties) is NOT ported -- it works in the Flask app by
// accumulating one daily snapshot into a database over 10+ days, which only works because that
// app is a server that's always running. A PWA only fetches when the user opens it, so Tier 1
// would have permanent gaps and likely never reach its own minimum sample size. See the plan.
//
// Standalone display feature -- does not feed the composite -2..+2 score, same as the Flask
// app's version, and for the same reason: blending unvalidated signals into one number that
// looks more authoritative than it is is a mistake this project already made and fixed once.
import { mean, stddev0, median } from "./indicators.js";
import { fetchBhavcopy, fetchFoBhavcopy, recentTradingDays, csvNum } from "../api/nseData.js";

const TIER3_FLOW_WINDOW = 20;
// Widened from 60 so the strided comparison sample below (see TIER3_WINDOW_STRIDE) still has
// enough points after striding cuts the raw daily count roughly 5x. Kept in sync with
// services/smart_money.py's TIER3_BASELINE_LOOKBACK.
const TIER3_BASELINE_LOOKBACK = 100;
// Adjacent DAILY rolling-flow sums share (WINDOW-1)/WINDOW of their underlying days -- 19 of 20
// for a 20-day window, i.e. 95% overlap. Z-scoring today's reading against a population built
// from every single day understates how much an independent ~20-day flow reading actually
// varies. Striding the comparison population by 5 trading days cuts that overlap to at most
// 75% between consecutive comparison points. Kept in sync with services/smart_money.py.
const TIER3_WINDOW_STRIDE = 5;
const TIER3_MIN_STRIDED_SAMPLES = 8;
const TIER2_WINDOW = 15;
const TIER2_CONVICTION_THRESHOLD = 2.0;
const Z_THRESHOLD = 0.5;

// Fresh positioning (OI actively building alongside the price move) is a stronger tell than
// the price move alone; unwinding is weaker -- see services/smart_money.py for the full
// rationale (tallying price-up vs price-down days alone would throw away the OI dimension).
const TIER2_STATE_WEIGHTS = {
  "Long Buildup": 1.5, "Short Covering": 0.5,
  "Short Buildup": -1.5, "Long Unwinding": -0.5,
};

async function tier3(nseSymbol, workerUrl) {
  const tradingDays = await recentTradingDays(TIER3_BASELINE_LOOKBACK, workerUrl);
  const records = [];

  for (const d of tradingDays) {
    const bhav = await fetchBhavcopy(d, workerUrl);
    if (!bhav) continue;
    const eq = bhav.filter((r) => r.SERIES === "EQ");

    const atsValues = [];
    for (const r of eq) {
      const trades = csvNum(r, "NO_OF_TRADES");
      const turnover = csvNum(r, "TURNOVER_LACS");
      if (trades) atsValues.push((turnover * 1e5) / trades);
    }
    if (atsValues.length === 0) continue;
    const marketAts = median(atsValues);

    const row = eq.find((r) => r.SYMBOL === nseSymbol);
    if (!row || !Number.isFinite(marketAts) || marketAts <= 0) continue;

    const noTrades = csvNum(row, "NO_OF_TRADES");
    if (!noTrades) continue;
    const turnover = csvNum(row, "TURNOVER_LACS");
    const stockAts = (turnover * 1e5) / noTrades;

    const delivQty = csvNum(row, "DELIV_QTY");
    const closePrice = csvNum(row, "CLOSE_PRICE");
    const avgPrice = csvNum(row, "AVG_PRICE");
    const delivPer = csvNum(row, "DELIV_PER");
    if (delivQty === null || closePrice === null || avgPrice === null || delivPer === null) continue;
    if (avgPrice <= 0) continue;

    records.push({
      date: d,
      // Signed magnitude of how far close deviated from the day's average price, not just its
      // sign -- a close 5% above average is a stronger accumulation signature than one 0.1%
      // above. Scale doesn't matter downstream (only ever feeds a z-score), so this is a
      // strict information improvement over the old sign()-only version, not a threshold
      // recalibration. Kept in sync with services/smart_money.py's _tier3.
      flow: delivQty * ((closePrice - avgPrice) / avgPrice),
      atsRatio: stockAts / marketAts,
      delivPer,
    });
  }

  if (records.length < TIER3_FLOW_WINDOW + 10) {
    return { status: "insufficient_data" };
  }

  const flows = records.map((r) => r.flow);
  const rollingSums = [];
  for (let i = TIER3_FLOW_WINDOW - 1; i < flows.length; i++) {
    let s = 0;
    for (let j = i - TIER3_FLOW_WINDOW + 1; j <= i; j++) s += flows[j];
    rollingSums.push(s);
  }
  // Sample backward from the latest rolling sum in TIER3_WINDOW_STRIDE-day steps instead of
  // using every single day -- see the constant's comment above. Walking backward from the end
  // guarantees the latest reading is always the "current" value being z-scored.
  const stridedSums = [];
  for (let i = rollingSums.length - 1; i >= 0; i -= TIER3_WINDOW_STRIDE) stridedSums.unshift(rollingSums[i]);
  if (stridedSums.length < TIER3_MIN_STRIDED_SAMPLES) return { status: "insufficient_data" };
  const stridedStd = stddev0(stridedSums);
  if (stridedStd === 0) return { status: "insufficient_data" };
  const flowZ = (stridedSums[stridedSums.length - 1] - mean(stridedSums)) / stridedStd;

  let atsZ = null;
  const ratioSeries = records.map((r) => r.atsRatio);
  const ratioStd = stddev0(ratioSeries);
  if (ratioStd > 0) {
    atsZ = (ratioSeries[ratioSeries.length - 1] - mean(ratioSeries)) / ratioStd;
  }

  const direction = flowZ > Z_THRESHOLD ? "Bullish" : flowZ < -Z_THRESHOLD ? "Bearish" : "Neutral";
  return {
    status: "ok",
    direction,
    flowZ: round1(flowZ, 2),
    atsZ: atsZ !== null ? round1(atsZ, 2) : null,
    latestDelivPer: round1(records[records.length - 1].delivPer, 1),
    windowDays: records.length,
  };
}

async function tier2(nseSymbol, workerUrl) {
  const tradingDays = await recentTradingDays(TIER2_WINDOW, workerUrl);
  const dailyStates = [];
  let prevExpiry = null;

  for (const d of tradingDays) {
    const fo = await fetchFoBhavcopy(d, workerUrl);
    if (!fo) continue;
    const stf = fo.filter((r) => r.FinInstrmTp === "STF" && r.TckrSymb === nseSymbol);
    if (stf.length === 0) continue;
    stf.sort((a, b) => (a.XpryDt < b.XpryDt ? -1 : a.XpryDt > b.XpryDt ? 1 : 0));
    const r = stf[0]; // nearest-expiry (front-month) contract
    const expiry = r.XpryDt;
    // The front-month contract's own reported OI change is unreliable on the day it rolls over
    // to a new expiry (ramping up from a low base, or the old one collapsing toward expiry) --
    // that's rollover mechanics, not a change in conviction. Skip the transition day.
    if (prevExpiry !== null && expiry !== prevExpiry) {
      prevExpiry = expiry;
      continue;
    }
    prevExpiry = expiry;

    const clsPric = csvNum(r, "ClsPric");
    const prvsClsgPric = csvNum(r, "PrvsClsgPric");
    const chngInOi = csvNum(r, "ChngInOpnIntrst");
    if (clsPric === null || prvsClsgPric === null || chngInOi === null) continue;

    const priceUp = clsPric > prvsClsgPric;
    const oiUp = chngInOi > 0;
    let state;
    if (priceUp && oiUp) state = "Long Buildup";
    else if (priceUp && !oiUp) state = "Short Covering";
    else if (!priceUp && oiUp) state = "Short Buildup";
    else state = "Long Unwinding";
    dailyStates.push({ date: d, state });
  }

  if (dailyStates.length === 0) return null;
  if (dailyStates.length < 5) return { status: "insufficient_data" };

  const conviction = dailyStates.reduce((sum, s) => sum + TIER2_STATE_WEIGHTS[s.state], 0);
  const direction = conviction > TIER2_CONVICTION_THRESHOLD ? "Bullish"
    : conviction < -TIER2_CONVICTION_THRESHOLD ? "Bearish" : "Neutral";
  const bullishDays = dailyStates.filter((s) => s.state === "Long Buildup" || s.state === "Short Covering").length;
  const bearishDays = dailyStates.filter((s) => s.state === "Short Buildup" || s.state === "Long Unwinding").length;

  return {
    status: "ok",
    direction,
    latestState: dailyStates[dailyStates.length - 1].state,
    conviction: round1(conviction, 1),
    bullishDays,
    bearishDays,
    windowDays: dailyStates.length,
  };
}

// Requires both tiers to have an actual directional (non-Neutral) read to say anything (same
// bar as before). But "Cross-Confirmed" now requires BOTH tiers that computed (status "ok"),
// INCLUDING an explicit Neutral read, to point the same way -- a computed-but-neutral tier
// used to be silently dropped, letting the other tier's direction claim "Cross-Confirmed" on
// its own. Kept in sync with services/smart_money.py's _agreement_label.
function agreementLabel(tier2Result, tier3Result) {
  const okTiers = [tier2Result, tier3Result].filter((t) => t && t.status === "ok");
  const directional = okTiers.filter((t) => t.direction === "Bullish" || t.direction === "Bearish");
  if (directional.length < 2) return "Insufficient Data";
  const allDirections = okTiers.map((t) => t.direction);
  if (allDirections.every((d) => d === "Bullish")) return "Cross-Confirmed Accumulation";
  if (allDirections.every((d) => d === "Bearish")) return "Cross-Confirmed Distribution";
  return "Mixed";
}

export async function compute(nseSymbol, workerUrl) {
  const [t2, t3] = await Promise.all([
    tier2(nseSymbol, workerUrl),
    tier3(nseSymbol, workerUrl),
  ]);
  const agreement = agreementLabel(t2, t3);
  return {
    agreement,
    tier2Status: t2 ? t2.status : "no_futures",
    tier3Status: t3 ? t3.status : "insufficient_data",
    details: { tier2: t2, tier3: t3 },
  };
}

function round1(x, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round(x * f) / f;
}
