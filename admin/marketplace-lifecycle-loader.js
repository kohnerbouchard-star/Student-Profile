const STYLESHEET_PATH = "./css/marketplace-lifecycle.css";
const STYLESHEET_MARKER = "data-admin-marketplace-lifecycle-stylesheet";
const LOAD_DELAYS = [0, 80, 200, 500];
let loading = null;

function loadStylesheet() {
  const existing = document.querySelector(`link[${STYLESHEET_MARKER}]`);
  if (existing) return Promise.resolve(existing);

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL(STYLESHEET_PATH, import.meta.url).href;
  stylesheet.setAttribute(STYLESHEET_MARKER, "");

  const loaded = new Promise((resolve, reject) => {
    stylesheet.addEventListener("load", () => resolve(stylesheet), { once: true });
    stylesheet.addEventListener("error", () => reject(new Error("Marketplace lifecycle styles could not be loaded.")), { once: true });
  });
  document.head.append(stylesheet);
  return loaded;
}

function marketplaceSelected() {
  return [...document.querySelectorAll('[data-admin-section="marketplace"]')].some((node) =>
    node.getAttribute("aria-current") === "page" ||
    node.getAttribute("aria-selected") === "true" ||
    node.classList.contains("active") ||
    node.classList.contains("is-active")
  );
}

function loadMarketplaceLifecycle() {
  if (!marketplaceSelected()) return Promise.resolve(false);
  if (!loading) {
    loading = loadStylesheet()
      .then(() => import("./marketplace-lifecycle-client.js"))
      .then(() => import("./marketplace-lifecycle-surface.js"))
      .then(() => true)
      .catch((error) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

function scheduleMarketplaceLoad() {
  LOAD_DELAYS.forEach((delay) => setTimeout(() => void loadMarketplaceLifecycle(), delay));
}

document.addEventListener("click", (event) => {
  if (event.target.closest?.('[data-admin-section="marketplace"]')) scheduleMarketplaceLoad();
});
globalThis.addEventListener("hashchange", scheduleMarketplaceLoad);
globalThis.addEventListener("popstate", scheduleMarketplaceLoad);
document.addEventListener("econovaria:admin-data-state-changed", scheduleMarketplaceLoad);
document.addEventListener("econovaria:admin-request-lifecycle", scheduleMarketplaceLoad);
scheduleMarketplaceLoad();
