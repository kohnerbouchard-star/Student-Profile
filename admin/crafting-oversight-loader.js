const STYLE = "./css/crafting-oversight.css";
const MARKER = "data-admin-crafting-oversight-stylesheet";
async function stylesheet() {
  if (document.querySelector(`link[${MARKER}]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL(STYLE, import.meta.url).href;
  link.setAttribute(MARKER, "");
  const loaded = new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error("Crafting oversight styles failed to load.")), { once: true });
  });
  document.head.append(link);
  await loaded;
}
await stylesheet();
await import("./crafting-oversight-client.js");
await import("./crafting-oversight-surface.js");
