import * as store from "../storage/localStore.js";
import { refreshOneById } from "./dashboard.js";
import {
  escapeHtml, regimeBadge, signalBadge, scoreClass, fmtScore, fmtPrice, isBestEvidenced, showToast,
} from "./components.js";

const METRIC_LABELS = {
  vsm: "Volatility-Scaled Momentum",
  relativeStrength: "Relative Strength (vs Nifty 50)",
  vwapVolume: "VWAP + Volume",
  trendStrength: "Trend Strength (ADX)",
  meanReversion: "Mean Reversion (%B)",
  eventScore: "Event Score (LLM)",
};

export function renderDetail(container, stockId) {
  const stock = store.getWatchlist().find((s) => s.id === stockId);
  if (!stock) {
    container.innerHTML = `<div class="empty-state">Stock not found. <a href="#/">Back to dashboard</a></div>`;
    return;
  }
  const result = store.getResult(stockId);
  const composite = result?.composite;
  const breakout = result?.breakout;

  container.innerHTML = `
    <div class="detail-header">
      <a href="#/" class="back">←</a>
      <div>
        <h2>${escapeHtml(stock.symbol)} <span style="font-weight:400;color:var(--text-muted);font-size:0.8rem;">${escapeHtml(stock.exchange)}</span></h2>
        <div class="sub">${escapeHtml(stock.name)}</div>
      </div>
    </div>

    <div style="display:flex; gap:8px; margin-bottom:12px;">
      <button class="btn btn-sm" id="btn-refresh-detail">Refresh</button>
      <button class="btn btn-sm" id="btn-remove-detail" style="margin-left:auto; color: var(--red);">Remove from watchlist</button>
    </div>

    ${!result ? `<div class="card empty-state">Not yet computed — tap Refresh.</div>` : `

    ${isBestEvidenced(result) ? `
    <div class="card" style="border-color: var(--green);">
      <span class="badge badge-green">★ Best-Evidenced Setup</span>
      <p style="font-size:0.82rem; color: var(--text-muted); margin: 8px 0 0;">
        Composite signal is a strict Entry AND the breakout engine's top-ranked pattern is Double
        bottom — the one combination this project's backtest found held up in-sample and
        out-of-sample (out-of-sample: 44.4% win rate vs 29.8% baseline). A backtested historical
        association, not a guarantee.
      </p>
    </div>` : ""}

    <div class="card">
      <div class="section-title">Composite Score</div>
      <div style="display:flex; align-items:baseline; gap:12px;">
        <span class="score-value ${scoreClass(composite?.score)}" style="font-size:1.8rem;">${fmtScore(composite?.score)}</span>
        ${regimeBadge(composite?.regime)}
        ${signalBadge(composite?.signal)}
      </div>
      <div style="display:flex; gap:16px; margin-top:12px; font-size:0.85rem;">
        <div><div class="tf-label">Price</div><div class="tf-value">${fmtPrice(result.currentPrice)}</div></div>
        <div><div class="tf-label">Stop Loss</div><div class="tf-value" style="color:var(--red);">${fmtPrice(composite?.stopLoss)}</div></div>
        <div><div class="tf-label">Target</div><div class="tf-value" style="color:var(--green);">${fmtPrice(composite?.target)}</div></div>
      </div>
    </div>

    <div class="section-title">Metric Breakdown</div>
    <div class="card">
      ${renderMetrics(composite)}
    </div>

    <div class="section-title">Breakout Pattern</div>
    <div class="card">
      ${renderBreakout(breakout)}
    </div>
    `}
  `;

  container.querySelector("#btn-refresh-detail").addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Refreshing…";
    try {
      await refreshOneById(stockId);
      renderDetail(container, stockId);
    } catch (err) {
      showToast(`Refresh failed: ${err.message}`);
      e.target.disabled = false;
      e.target.textContent = "Refresh";
    }
  });

  container.querySelector("#btn-remove-detail").addEventListener("click", () => {
    if (!confirm(`Remove ${stock.symbol} from watchlist?`)) return;
    store.removeFromWatchlist(stockId);
    window.location.hash = "#/";
  });
}

function renderMetrics(composite) {
  if (!composite) return "";
  return Object.entries(METRIC_LABELS).map(([key, label]) => {
    const m = composite.metrics[key];
    if (!m) return "";
    const pct = ((m.score + 2) / 4) * 100;
    const barColor = m.score > 0.1 ? "var(--green)" : m.score < -0.1 ? "var(--red)" : "var(--amber)";
    const weight = composite.weights[key] || 0;
    return `
      <div class="metric-row">
        <div class="metric-head">
          <span class="metric-name">${escapeHtml(label)}</span>
          <span class="score-value ${scoreClass(m.score)}">${fmtScore(m.score)} <span style="color:var(--text-muted); font-weight:400;">(${(weight * 100).toFixed(0)}%)</span></span>
        </div>
        <div class="metric-interp">${escapeHtml(m.details.interpretation || m.details.reason || m.details.dataStatus)}</div>
        <div class="metric-bar"><div class="metric-bar-fill" style="width:${pct}%; background:${barColor};"></div></div>
      </div>
    `;
  }).join("");
}

function renderBreakout(breakout) {
  if (!breakout) return `<div class="empty-state">Not enough price history to scan (need 60+ bars).</div>`;
  if (!breakout.pattern || breakout.band === "NO SETUP") {
    return `<div class="empty-state">No qualifying breakout setup detected right now. The scan ran successfully — that's a valid answer, not an error.</div>`;
  }
  const primary = breakout.details.primary;
  const tf = primary.tradeFrame;
  const bandCls = breakout.band === "HIGH CONVICTION" || breakout.band === "CONSTRUCTIVE" ? "badge-green"
    : breakout.band.startsWith("MARGINAL") ? "badge-amber" : "badge-muted";

  const others = breakout.details.patterns.slice(1);

  return `
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
      <span class="badge ${bandCls}">${escapeHtml(breakout.band)}</span>
      <span style="font-weight:700; font-size:1.1rem;">${breakout.score}<span style="color:var(--text-muted); font-size:0.8rem;">/100</span></span>
      <span class="badge badge-muted">${escapeHtml(breakout.pattern)}</span>
    </div>
    <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:10px;">${escapeHtml(breakout.state)}</div>

    <div class="section-title">Trade Frame</div>
    <div class="trade-frame-grid">
      <div class="tf-item"><span class="tf-label">Pivot</span><span class="tf-value">${tf.pivot}</span></div>
      <div class="tf-item"><span class="tf-label">Reference entry</span><span class="tf-value">${tf.referenceEntry}</span></div>
      <div class="tf-item"><span class="tf-label">Invalidation stop</span><span class="tf-value" style="color:var(--red);">${tf.invalidationStop} <span style="color:var(--text-muted); font-size:0.7rem;">(${escapeHtml(tf.stopBasis)})</span></span></div>
      <div class="tf-item"><span class="tf-label">Target 1 (measured move)</span><span class="tf-value" style="color:var(--green);">${tf.measuredMoveTarget1}</span></div>
      <div class="tf-item"><span class="tf-label">Target 2</span><span class="tf-value" style="color:var(--green);">${tf.measuredMoveTarget2}</span></div>
      <div class="tf-item"><span class="tf-label">Reward:Risk to T1</span><span class="tf-value">${tf.rewardRiskToTarget1 ?? "—"}</span></div>
    </div>

    <div class="section-title">Score Components</div>
    ${Object.entries(primary.score.components).map(([k, c]) => {
      const avail = c.score !== null && c.score !== undefined;
      const pct = avail ? (c.score / c.max) * 100 : 0;
      return `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:0.8rem;">
          <span style="width:140px; flex-shrink:0;">${escapeHtml(camelToTitle(k))}</span>
          <div class="metric-bar" style="flex:1; margin-top:0;"><div class="metric-bar-fill" style="width:${pct}%; background:var(--accent);"></div></div>
          <span style="width:50px; text-align:right; flex-shrink:0;">${avail ? `${c.score}/${c.max}` : "n/a"}</span>
        </div>
      `;
    }).join("")}

    ${primary.score.notes.length > 0 ? `
    <ul class="note-list">
      ${primary.score.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}
    </ul>` : ""}

    ${others.length > 0 ? `
    <div class="section-title">Other patterns detected (lower-ranked)</div>
    <div style="display:flex; flex-wrap:wrap; gap:6px;">
      ${others.map((p) => `<span class="badge badge-muted">${escapeHtml(p.name)} — ${p.score.total}/100</span>`).join("")}
    </div>` : ""}
  `;
}

function camelToTitle(s) {
  return s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}
