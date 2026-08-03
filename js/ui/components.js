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

export function isBestEvidenced(result) {
  return !!(result && result.composite && result.breakout
    && result.composite.signal === "Entry"
    && result.breakout.pattern === "Double bottom");
}

export function showToast(message, ms = 3500) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, ms);
}
