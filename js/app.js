import * as store from "./storage/localStore.js";
import { renderDashboard } from "./ui/dashboard.js";
import { renderDetail } from "./ui/detail.js";
import { showToast } from "./ui/components.js";

const app = document.getElementById("app");

function route() {
  const hash = window.location.hash || "#/";
  const stockMatch = hash.match(/^#\/stock\/(.+)$/);
  if (stockMatch) {
    renderDetail(app, decodeURIComponent(stockMatch[1]));
  } else {
    renderDashboard(app);
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
route();

// --- Settings dialog ---
const settingsDialog = document.getElementById("settings-dialog");
const settingsForm = document.getElementById("settings-form");
const apiKeyInput = document.getElementById("api-key-input");

document.getElementById("btn-settings").addEventListener("click", () => {
  apiKeyInput.value = store.getApiKey();
  settingsDialog.showModal();
});
document.getElementById("btn-cancel-settings").addEventListener("click", () => settingsDialog.close());
settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  store.setApiKey(apiKeyInput.value);
  settingsDialog.close();
  showToast("Settings saved.");
  route();
});

// --- Service worker (offline app-shell caching) ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed:", e));
  });
}
