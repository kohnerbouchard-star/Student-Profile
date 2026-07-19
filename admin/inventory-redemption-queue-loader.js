const STYLESHEET_PATH = "./css/inventory-redemption-queue.css";
const STYLESHEET_MARKER = "data-admin-inventory-redemption-stylesheet";

function loadStylesheet() {
  const existing = document.querySelector(`link[${STYLESHEET_MARKER}]`);
  if (existing) return Promise.resolve(existing);

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL(STYLESHEET_PATH, import.meta.url).href;
  stylesheet.setAttribute(STYLESHEET_MARKER, "");

  const loaded = new Promise((resolve, reject) => {
    stylesheet.addEventListener("load", () => resolve(stylesheet), { once: true });
    stylesheet.addEventListener("error", () => reject(new Error("Inventory redemption styles could not be loaded.")), { once: true });
  });
  document.head.append(stylesheet);
  return loaded;
}

await loadStylesheet();
await import("./inventory-redemption-queue-surface.js");
