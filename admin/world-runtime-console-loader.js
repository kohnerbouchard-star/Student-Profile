const WORLD_STYLESHEET = "./css/world-runtime-console.css";

function ensureWorldStylesheet() {
  const existing = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .find((link) => link.getAttribute("href") === WORLD_STYLESHEET);
  if (existing) return Promise.resolve(existing);

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = WORLD_STYLESHEET;
  link.setAttribute("data-admin-world-stylesheet", "");
  const loaded = new Promise((resolve, reject) => {
    link.addEventListener("load", () => resolve(link), { once: true });
    link.addEventListener(
      "error",
      () => reject(new Error("World administrator styles could not be loaded.")),
      { once: true },
    );
  });
  document.head.append(link);
  return loaded;
}

await ensureWorldStylesheet();
await import("./world-runtime-console.js");
