const STYLESHEET_PATH = "./css/marketplace-lifecycle.css";
const STYLESHEET_MARKER = "data-admin-marketplace-lifecycle-stylesheet";

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

await loadStylesheet();
await import("./marketplace-lifecycle-client.js");
await import("./marketplace-lifecycle-surface.js");
