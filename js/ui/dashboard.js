import * as store from "../storage/localStore.js";
import { symbolSearch, refreshQueue } from "../api/yahooFinance.js";
import { runAnalysis, fetchBenchmark } from "../engine/runAnalysis.js";
import {
  escapeHtml, regimeBadge, signalBadge, breakoutBadge, smartMoneyBadge, scoreClass, fmtScore,
  fmtPrice, isBestEvidenced, matchesBestEvidencedCombo, showToast,
} from "./components.js";

let breakoutPatternFilter = "All";
let bandFilter = "All";
let signalFilter = "All";
let bestEvidencedCombo = "Off";
let searchResults = [];
let searchQuery = "";
let refreshingAll = false;
let refreshProgress = { done: 0, total: 0 };

// Order matches services/breakout_scan.py's TIER dict (highest reliability first) in the
// parent Flask app, with the extension pattern (highTightFlag.js) appended at the end.
const BREAKOUT_PATTERN_OPTIONS = [
  "All", "Flat base / rectangle", "VCP (volatility contraction)", "Ascending triangle",
  "Cup with handle", "Bull flag / pennant", "Cup (handle not yet formed)",
  "Double bottom", "Inverse head & shoulders", "High and tight flag",
];
// Mirrors app.py's BREAKOUT_FILTER_OPTIONS (band/state, distinct from the pattern-name filter
// above).
const BAND_OPTIONS = ["All", "Any Setup", "High Conviction", "Constructive+", "Marginal",
  "Confirmed / At Pivot", "No Setup"];
const SIGNAL_OPTIONS = ["All", "Entry", "Hold", "Exit"];
// Mirrors app.py's BEST_EVIDENCED_OPTIONS -- see components.js's matchesBestEvidencedCombo for
// the matching logic and the pattern x band x signal scan for where these numbers came from.
const BEST_EVIDENCED_OPTIONS = ["Off", "Entry + Double Bottom + Marginal", "Entry + Bull Flag/Pennant + Marginal"];

function matchesBand(result, filterValue) {
  if (!filterValue || filterValue === "All") return true;
  const breakout = result && result.breakout;
  const band = breakout ? breakout.band : null;
  const state = (breakout && breakout.state) || "";
  const hasSetup = band != null && band !== "NO SETUP";
  if (filterValue === "Any Setup") return hasSetup;
  if (filterValue === "No Setup") return !hasSetup;
  if (filterValue === "High Conviction") return band === "HIGH CONVICTION";
  if (filterValue === "Constructive+") return band === "HIGH CONVICTION" || band === "CONSTRUCTIVE";
  if (filterValue === "Marginal") return band === "MARGINAL — watchlist only";
  if (filterValue === "Confirmed / At Pivot") return hasSetup && (state.includes("CONFIRMED") || state.includes("AT PIVOT"));
  return true;
}

function matchesSignal(result, filterValue) {
  if (!filterValue || filterValue === "All") return true;
  const signal = (result && result.composite && result.composite.signal) || "";
  if (filterValue === "Entry") return signal.startsWith("Entry");
  return signal === filterValue;
}

export function renderDashboard(container) {
  const existingSearchInput = container.querySelector("#search-input");
  const searchInputHadFocus = existingSearchInput && document.activeElement === existingSearchInput;
  const caretPos = searchInputHadFocus ? existingSearchInput.selectionStart : null;

  const watchlist = store.getWatchlist();
  const results = store.getAllResults();

  const rows = watchlist.map((s) => ({ stock: s, result: results[s.id] || null }));
  let visibleRows = rows;
  if (breakoutPatternFilter !== "All") {
    visibleRows = visibleRows.filter((r) => (r.result?.breakout || {}).pattern === breakoutPatternFilter);
  }
  visibleRows = visibleRows.filter((r) => matchesBand(r.result, bandFilter));
  visibleRows = visibleRows.filter((r) => matchesSignal(r.result, signalFilter));
  visibleRows = visibleRows.filter((r) => matchesBestEvidencedCombo(r.result, bestEvidencedCombo));

  const summary = {
    total: rows.length,
    bullish: rows.filter((r) => r.result?.composite?.regime?.includes("Bullish")).length,
    bearish: rows.filter((r) => r.result?.composite?.regime?.includes("Bearish")).length,
    other: rows.filter((r) => !r.result?.composite?.regime || r.result.composite.regime === "Neutral").length,
  };

  const hasWorker = !!store.getWorkerUrl();

  container.innerHTML = `
    ${!hasWorker ? `
    <div class="card" style="border-color: var(--amber);">
      <strong>No proxy Worker URL set.</strong>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin: 6px 0 10px;">
        You can browse, but fetching live scores needs your own free Cloudflare Worker relay — see Settings.
      </p>
      <button class="btn btn-primary btn-sm" id="btn-open-settings-banner">Add Worker URL</button>
    </div>` : ""}

    <div class="summary-row">
      <div class="card summary-card"><div class="num">${summary.total}</div><div class="label">Total</div></div>
      <div class="card summary-card"><div class="num" style="color: var(--green);">${summary.bullish}</div><div class="label">Bullish</div></div>
      <div class="card summary-card"><div class="num" style="color: var(--red);">${summary.bearish}</div><div class="label">Bearish</div></div>
      <div class="card summary-card"><div class="num" style="color: var(--amber);">${summary.other}</div><div class="label">Neutral/Unscored</div></div>
    </div>

    <div class="add-stock-row">
      <input type="text" id="search-input" placeholder="Search NSE/BSE stock, e.g. RELIANCE" value="${escapeHtml(searchQuery)}" autocomplete="off">
      ${searchResults.length > 0 ? `
      <div class="search-results" id="search-results">
        ${searchResults.map((r, i) => `
          <div class="search-result-item" data-idx="${i}">
            <div class="sym">${escapeHtml(r.symbol)} <span style="color: var(--text-muted); font-weight: 400;">${escapeHtml(r.exchange)}</span></div>
            <div class="name">${escapeHtml(r.name)}</div>
          </div>`).join("")}
      </div>` : ""}
    </div>

    <div class="filter-row">
      <label for="breakout-pattern-filter">Breakout Pattern</label>
      <select id="breakout-pattern-filter" class="filter-select">
        ${BREAKOUT_PATTERN_OPTIONS.map((opt) =>
          `<option value="${escapeHtml(opt)}" ${opt === breakoutPatternFilter ? "selected" : ""}>${escapeHtml(opt)}</option>`
        ).join("")}
      </select>
    </div>

    <div class="filter-row">
      <label for="band-filter" title="Filter by the detected breakout chart-pattern setup quality/state.">Breakout Setup</label>
      <select id="band-filter" class="filter-select">
        ${BAND_OPTIONS.map((opt) =>
          `<option value="${escapeHtml(opt)}" ${opt === bandFilter ? "selected" : ""}>${escapeHtml(opt)}</option>`
        ).join("")}
      </select>
    </div>

    <div class="filter-row">
      <label for="signal-filter" title="The composite Entry/Hold/Exit gate — distinct from Regime. 'Entry' matches both 'Entry' and 'Entry (weak volume)'.">Signal</label>
      <select id="signal-filter" class="filter-select">
        ${SIGNAL_OPTIONS.map((opt) =>
          `<option value="${escapeHtml(opt)}" ${opt === signalFilter ? "selected" : ""}>${escapeHtml(opt)}</option>`
        ).join("")}
      </select>
    </div>

    <label class="filter-toggle" style="display: block;">
      <span class="ft-title">Best-Evidenced Combo (pattern x band x signal)</span><br>
      <span class="ft-desc">Prebaked combinations from the pattern x band x signal walk-forward scan. Entry + Double Bottom + Marginal: in-sample +1.68pp / out-of-sample +1.91pp win-rate edge, 24/19 tickers — the largest well-powered sample in the scan. Entry + Bull Flag/Pennant + Marginal: in-sample +5.43pp / out-of-sample +3.97pp, 12/10 tickers — the single largest edge found, on a narrower sample. Both require an Entry-family signal AND the MARGINAL band specifically — pooling all bands together (the old rule) hid a Constructive-band slice that flipped sign between splits. Backtested historical associations, not guarantees.</span>
      <select id="best-evidenced-combo" class="filter-select" style="display: block; width: 100%; margin-top: 8px;">
        ${BEST_EVIDENCED_OPTIONS.map((opt) =>
          `<option value="${escapeHtml(opt)}" ${opt === bestEvidencedCombo ? "selected" : ""}>${escapeHtml(opt)}</option>`
        ).join("")}
      </select>
    </label>

    <div class="card" style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 0.85rem; color: var(--text-muted);">
        ${refreshingAll ? `Refreshing… ${refreshProgress.done}/${refreshProgress.total}` : `${watchlist.length} stock(s) tracked`}
      </span>
      <button class="btn btn-sm" id="btn-refresh-all" ${refreshingAll || !hasWorker || watchlist.length === 0 ? "disabled" : ""}>
        Refresh All
      </button>
    </div>
    ${refreshingAll ? `
    <div class="progress-bar-outer"><div class="progress-bar-inner" style="width:${refreshProgress.total ? (100 * refreshProgress.done / refreshProgress.total) : 0}%"></div></div>
    <div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 8px;">Lightly paced (~2/sec) — should finish quickly even for a large watchlist.</div>
    ` : ""}

    <div class="card" style="padding: 0;">
      ${visibleRows.length === 0 ? `
        <div class="empty-state">
          ${watchlist.length === 0 ? "No stocks yet — search above to add one." : "No stocks match the current filter."}
        </div>` : visibleRows.map((r) => renderStockRow(r)).join("")}
    </div>
  `;

  wireEvents(container, searchInputHadFocus, caretPos);
}

function renderStockRow({ stock, result }) {
  const composite = result?.composite;
  const breakout = result?.breakout;
  const smartMoney = result?.smartMoney;
  const price = result?.currentPrice;
  const best = isBestEvidenced(result);
  return `
    <div class="stock-row" data-id="${escapeHtml(stock.id)}">
      <div class="stock-left">
        <div class="ticker">${escapeHtml(stock.symbol)} <span style="font-weight:400;color:var(--text-muted);font-size:0.75rem;">${escapeHtml(stock.exchange)}</span></div>
        <div class="name">${escapeHtml(stock.name)}</div>
      </div>
      <div class="stock-right">
        <div class="stock-price">${fmtPrice(price)}</div>
        <div class="badge-row">
          ${best ? '<span class="badge badge-green">★ Best-Evidenced</span>' : ""}
          <span class="score-value ${scoreClass(composite?.score)}">${fmtScore(composite?.score)}</span>
          ${regimeBadge(composite?.regime)}
          ${signalBadge(composite?.signal)}
          ${breakoutBadge(breakout)}
          ${smartMoneyBadge(smartMoney)}
        </div>
      </div>
    </div>
  `;
}

function wireEvents(container, restoreFocus, caretPos) {
  const searchInput = container.querySelector("#search-input");
  if (searchInput) {
    searchInput.addEventListener("input", onSearchInput);
    if (restoreFocus) {
      searchInput.focus();
      const pos = caretPos !== null ? caretPos : searchQuery.length;
      searchInput.setSelectionRange(pos, pos);
    }
  }

  container.querySelectorAll(".search-result-item").forEach((el) => {
    el.addEventListener("click", () => onSelectSearchResult(parseInt(el.dataset.idx, 10)));
  });

  const bannerBtn = container.querySelector("#btn-open-settings-banner");
  if (bannerBtn) bannerBtn.addEventListener("click", () => document.getElementById("btn-settings").click());

  const comboSelect = container.querySelector("#best-evidenced-combo");
  if (comboSelect) comboSelect.addEventListener("change", () => {
    bestEvidencedCombo = comboSelect.value;
    renderDashboard(container);
  });

  const patternFilter = container.querySelector("#breakout-pattern-filter");
  if (patternFilter) patternFilter.addEventListener("change", () => {
    breakoutPatternFilter = patternFilter.value;
    renderDashboard(container);
  });

  const bandSelect = container.querySelector("#band-filter");
  if (bandSelect) bandSelect.addEventListener("change", () => {
    bandFilter = bandSelect.value;
    renderDashboard(container);
  });

  const signalSelect = container.querySelector("#signal-filter");
  if (signalSelect) signalSelect.addEventListener("change", () => {
    signalFilter = signalSelect.value;
    renderDashboard(container);
  });

  const refreshAllBtn = container.querySelector("#btn-refresh-all");
  if (refreshAllBtn) refreshAllBtn.addEventListener("click", () => onRefreshAll(container));

  container.querySelectorAll(".stock-row").forEach((el) => {
    el.addEventListener("click", () => { window.location.hash = `#/stock/${encodeURIComponent(el.dataset.id)}`; });
  });
}

let searchDebounceTimer = null;
function onSearchInput(e) {
  searchQuery = e.target.value;
  clearTimeout(searchDebounceTimer);
  if (searchQuery.trim().length < 2) {
    searchResults = [];
    renderDashboard(document.getElementById("app"));
    return;
  }
  searchDebounceTimer = setTimeout(async () => {
    try {
      // symbolSearch() already scopes results to NSE/BSE equities.
      searchResults = (await symbolSearch(searchQuery, store.getWorkerUrl())).slice(0, 8);
    } catch (e) {
      searchResults = [];
    }
    const app = document.getElementById("app");
    if (app.querySelector("#search-input")) renderDashboard(app);
  }, 350);
}

function onSelectSearchResult(idx) {
  const picked = searchResults[idx];
  if (!picked) return;
  const entry = store.addToWatchlist(picked.symbol, picked.exchange, picked.name);
  searchResults = [];
  searchQuery = "";
  renderDashboard(document.getElementById("app"));
  showToast(`Added ${entry.symbol} (${entry.exchange})`);

  const workerUrl = store.getWorkerUrl();
  if (workerUrl) refreshOne(entry, workerUrl).catch((e) => showToast(`Refresh failed: ${e.message}`));
}

async function refreshOne(stock, workerUrl) {
  const bench = await fetchBenchmark(workerUrl);
  const { composite, breakout, smartMoney, currentPrice } = await runAnalysis(stock.symbol, workerUrl, bench);
  store.saveResult(stock.id, { composite, breakout, smartMoney, currentPrice });
  const app = document.getElementById("app");
  if (app.querySelector(".stock-row")) renderDashboard(app);
}

export async function refreshOneById(stockId) {
  const stock = store.getWatchlist().find((s) => s.id === stockId);
  const workerUrl = store.getWorkerUrl();
  if (!stock || !workerUrl) return;
  await refreshOne(stock, workerUrl);
}

async function onRefreshAll(container) {
  const workerUrl = store.getWorkerUrl();
  if (!workerUrl) { showToast("Add a proxy Worker URL in Settings first."); return; }
  const watchlist = store.getWatchlist();
  if (watchlist.length === 0) return;

  refreshingAll = true;
  refreshProgress = { done: 0, total: watchlist.length };
  renderDashboard(container);

  try {
    const bench = await fetchBenchmark(workerUrl); // fetched once, shared across the whole batch
    await Promise.all(watchlist.map((stock) =>
      refreshQueue.enqueue(async () => {
        try {
          const { composite, breakout, smartMoney, currentPrice } = await runAnalysis(stock.symbol, workerUrl, bench);
          store.saveResult(stock.id, { composite, breakout, smartMoney, currentPrice });
        } catch (e) {
          console.error(`Refresh failed for ${stock.symbol}:`, e);
        } finally {
          refreshProgress.done += 1;
          renderDashboard(document.getElementById("app"));
        }
      })
    ));
  } catch (e) {
    showToast(`Benchmark fetch failed: ${e.message}`);
  } finally {
    refreshingAll = false;
    renderDashboard(document.getElementById("app"));
  }
}
