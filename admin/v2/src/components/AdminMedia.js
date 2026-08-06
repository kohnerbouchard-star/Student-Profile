import { AdminIcon } from "./AdminIcon.js";
import { createElement } from "./dom.js";

export function AdminMedia({
  src,
  alt = "",
  aspect = "square",
  fit = "cover",
  fallbackLabel = "Media unavailable",
  loading = "lazy",
  width,
  height,
  className = "",
} = {}) {
  const root = createElement("figure", {
    className: `admin-media${className ? ` ${className}` : ""}`,
    dataset: { aspect, fit, state: src ? "loading" : "fallback" },
  });
  const fallback = createElement("div", {
    className: "admin-media__fallback",
    attrs: { role: "img", "aria-label": fallbackLabel },
    children: [AdminIcon({ name: "image", size: 24 }), createElement("span", { text: fallbackLabel })],
  });

  if (!src) {
    root.append(fallback);
    return root;
  }

  const image = createElement("img", {
    className: "admin-media__image",
    attrs: { src, alt, loading, decoding: "async", width, height },
  });
  image.addEventListener("load", () => {
    root.dataset.state = "ready";
  });
  image.addEventListener("error", () => {
    image.remove();
    root.dataset.state = "fallback";
    root.append(fallback);
  }, { once: true });
  root.append(image);
  return root;
}
