// Small render helpers shared between dashboard and detail views.

export function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function regimeBadge(regime) {
  if (!regime) return `<span class="badge badge-muted">Unscored</span>`;
  const cls = regime.includes("Bullish") ? "badge-green" : regime.includes("Bearish") ? "badge-red" : "badge-amber";
  return `<span class="badge ${cls}">${escapeHtml(regime)}</span>`;
}

export function signalBadge(signal) {
  if (!signal) return `<span class="badge badge-muted">—</span>`;
  const cls = signal.startsWith("Entry") ? "badge-green" : signal === "Exit" ? "badge-red" : "badge-amber";
  return `<span class="badge ${cls}">${escapeHtml(signal)}</span>`;
}

export function breakoutBadge(breakout) {
  if (!breakout || !breakout.band || breakout.band === "NO SETUP") {
    return `<span class="badge badge-muted">No setup</span>`;
  }
  const cls = breakout.band === "HIGH CONVICTION" ? "badge-green"
    : breakout.band === "CONSTRUCTIVE" ? "badge-green"
    : breakout.band.startsWith("MARGINAL") ? "badge-amber" : "badge-muted";
  return `<span class="badge ${cls}">${escapeHtml(breakout.pattern)} · ${breakout.score}</span>`;
}

export function smartMoneyBadge(smartMoney) {
  if (!smartMoney || !smartMoney.agreement) return `<span class="badge badge-muted">—</span>`;
  const cls = smartMoney.agreement === "Cross-Confirmed Accumulation" ? "badge-green"
    : smartMoney.agreement === "Cross-Confirmed Distribution" ? "badge-red"
    : smartMoney.agreement === "Mixed" ? "badge-amber" : "badge-muted";
  return `<span class="badge ${cls}">${escapeHtml(smartMoney.agreement)}</span>`;
}

export function scoreClass(score) {
  if (score === null || score === undefined) return "neu";
  return score > 0.5 ? "pos" : score < -0.5 ? "neg" : "neu";
}

export function fmtScore(score) {
  if (score === null || score === undefined) return "—";
  return (score > 0 ? "+" : "") + score.toFixed(2);
}

export function fmtPrice(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return "—";
  return p.toFixed(2);
}

const BEST_EVIDENCED_PATTERNS = ["Double bottom", "Bull flag / pennant"];

// Prebaked combinations from the pattern x band x signal walk-forward scan: an Entry-family
// signal (Entry or Entry (weak volume)) AND one of the two patterns whose edge held up
// same-direction in both backtest splits AND the MARGINAL conviction band specifically -- not
// "any band". Supersedes the old all-bands-pooled "Entry (strict) + Double bottom" rule, which
// mixed this same Marginal slice with a Constructive slice that flipped sign between splits.
export function isBestEvidenced(result) {
  if (!result || !result.composite || !result.breakout) return false;
  const signal = result.composite.signal || "";
  const band = result.breakout.band;
  const pattern = result.breakout.pattern;
  return signal.startsWith("Entry") && band === "MARGINAL — watchlist only"
    && BEST_EVIDENCED_PATTERNS.includes(pattern);
}

export function matchesBestEvidencedCombo(result, combo) {
  if (!combo || combo === "Off") return true;
  if (!result || !result.composite || !result.breakout) return false;
  const signal = result.composite.signal || "";
  if (!signal.startsWith("Entry")) return false;
  if (result.breakout.band !== "MARGINAL — watchlist only") return false;
  if (combo === "Entry + Double Bottom + Marginal") return result.breakout.pattern === "Double bottom";
  if (combo === "Entry + Bull Flag/Pennant + Marginal") return result.breakout.pattern === "Bull flag / pennant";
  return false;
}

export function showToast(message, ms = 3500) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, ms);
}
