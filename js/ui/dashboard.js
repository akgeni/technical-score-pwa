import * as store from "../storage/localStore.js";
import { symbolSearch, refreshQueue } from "../api/yahooFinance.js";
import { runAnalysis, fetchBenchmark } from "../engine/runAnalysis.js";
import {
  escapeHtml, regimeBadge, signalBadge, breakoutBadge, smartMoneyBadge, scoreClass, fmtScore,
  fmtPrice, isBestEvidenced, showToast,
} from "./components.js";

let bestEvidencedOnly = false;
let searchResults = [];
let searchQuery = "";
let refreshingAll = false;
let refreshProgress = { done: 0, total: 0 };

export function renderDashboard(container) {
  const existingSearchInput = container.querySelector("#search-input");
  const searchInputHadFocus = existingSearchInput && document.activeElement === existingSearchInput;
  const caretPos = searchInputHadFocus ? existingSearchInput.selectionStart : null;

  const watchlist = store.getWatchlist();
  const results = store.getAllResults();

  const rows = watchlist.map((s) => ({ stock: s, result: results[s.id] || null }));
  const visibleRows = bestEvidencedOnly ? rows.filter((r) => isBestEvidenced(r.result)) : rows;

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

    <label class="filter-toggle">
      <input type="checkbox" id="best-evidenced-toggle" ${bestEvidencedOnly ? "checked" : ""}>
      <span>
        <span class="ft-title">Best-Evidenced Setup Only</span><br>
        <span class="ft-desc">Composite signal = Entry (strict) AND breakout pattern = Double bottom — the one combination this project's backtest found held up in-sample and out-of-sample. Everything else tested (regime alone, signal alone, breakout band alone) showed no consistent edge. A backtested historical association, not a guarantee.</span>
      </span>
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

  const toggle = container.querySelector("#best-evidenced-toggle");
  if (toggle) toggle.addEventListener("change", () => {
    bestEvidencedOnly = toggle.checked;
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
