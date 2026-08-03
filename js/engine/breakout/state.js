// Breakout state classification (FORMING / AT PIVOT / CONFIRMED / EXTENDED / FAILED / BROKEN
// OUT). Port of breakout_scan.py's breakout_state.
import { sma } from "../indicators.js";
import { CFG } from "./config.js";
import { pct, r2 } from "./utils.js";

export function breakoutState(d, pat) {
  const { close: c, volume: v } = d;
  const n = c.length;
  const pivot = pat.pivot;
  const trig = pivot * (1 + CFG.breakoutBuffer);
  const v50 = sma(v, 50);

  const searchStart = Math.max(pat.end ?? 0, n - 40);
  const idx = [];
  for (let i = searchStart; i < n; i++) if (c[i] > trig) idx.push(i);

  const st = {
    pivot: r2(pivot), triggerPrice: r2(trig), lastClose: r2(c[n - 1]),
    distanceToPivotPct: pct((pivot - c[n - 1]) / c[n - 1]),
  };

  if (idx.length === 0) {
    st.state = "FORMING — no trigger yet";
    st.barsSinceTrigger = null;
    st.breakoutVolumeRatio = null;
    const near = (pivot - c[n - 1]) / c[n - 1];
    if (near >= 0 && near <= 0.03) st.state = "AT PIVOT — within 3% of trigger";
    return st;
  }

  const first = idx[0];
  st.breakoutDate = String(d.date[first]);
  st.barsSinceTrigger = n - 1 - first;
  const vr = (first < v50.length && Number.isFinite(v50[first]) && v50[first] > 0)
    ? v[first] / v50[first] : null;
  st.breakoutVolumeRatio = vr !== null ? r2(vr) : null;
  st.volumeConfirmed = vr !== null && vr >= CFG.volConfirmMult;

  const ext = (c[n - 1] - pivot) / pivot;
  st.extensionAbovePivotPct = pct(ext);

  if (c[n - 1] < pat.stopRef) {
    st.state = "FAILED — closed back below the base low";
  } else if (c[n - 1] < pivot * 0.98) {
    st.state = "FAILED/UNDERCUT — trigger fired then price fell back inside the base";
  } else if (ext > CFG.extendedPct) {
    st.state = "EXTENDED — broke out but is now beyond a low-risk entry";
  } else if (st.barsSinceTrigger <= CFG.maxBarsSinceTrigger) {
    st.state = "CONFIRMED BREAKOUT — actionable";
  } else {
    st.state = "BROKEN OUT — holding above pivot but past the entry window";
  }
  return st;
}
