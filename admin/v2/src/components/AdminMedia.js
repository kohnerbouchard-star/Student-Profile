import { createElement } from "./dom.js";

export function AdminMedia({
  src,
  alt = "",
  aspect = "square",
  fit = "cover",
  fallbackLabel = "Media unavailable",
  fallbackSrc = "",
  fallbackAlt = fallbackLabel,
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
    attrs: { role: "img", "aria-label": fallbackAlt },
  });

  if (fallbackSrc) {
    fallback.classList.add("admin-media__fallback--image");
    const fallbackImage = createElement("img", {
      className: "admin-media__fallback-image",
      attrs: {
        src: fallbackSrc,
        alt: "",
        "aria-hidden": "true",
        loading,
        decoding: "async",
        width,
        height,
      },
    });
    fallbackImage.addEventListener("error", () => {
      fallback.replaceChildren(createElement("span", { text: fallbackLabel }));
    }, { once: true });
    fallback.append(fallbackImage);
  } else {
    fallback.append(createElement("span", { text: fallbackLabel }));
  }

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
