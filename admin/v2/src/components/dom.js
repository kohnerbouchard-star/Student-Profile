let generatedId = 0;

export function createId(prefix = "admin-v2") {
  generatedId += 1;
  return `${prefix}-${generatedId}`;
}

export function appendContent(parent, content) {
  if (content == null || content === false) return parent;

  const values = Array.isArray(content) ? content : [content];
  values.forEach((value) => {
    if (value == null || value === false) return;
    if (value instanceof Node) {
      parent.append(value);
      return;
    }
    parent.append(document.createTextNode(String(value)));
  });
  return parent;
}

export function createElement(tagName, options = {}) {
  const element = document.createElement(tagName);
  const {
    className,
    text,
    attrs = {},
    dataset = {},
    children,
  } = options;

  if (className) element.className = className;
  if (text != null) element.textContent = String(text);

  Object.entries(attrs).forEach(([name, value]) => {
    if (value == null || value === false) return;
    if (value === true) {
      element.setAttribute(name, "");
      return;
    }
    element.setAttribute(name, String(value));
  });

  Object.entries(dataset).forEach(([name, value]) => {
    if (value != null) element.dataset[name] = String(value);
  });

  appendContent(element, children);
  return element;
}

export function replaceContent(parent, content) {
  parent.replaceChildren();
  appendContent(parent, content);
  return parent;
}

export function setText(element, value, fallback = "") {
  element.textContent = value == null || value === "" ? fallback : String(value);
}

export function setHidden(element, hidden) {
  element.hidden = Boolean(hidden);
  element.setAttribute("aria-hidden", hidden ? "true" : "false");
}

export function isFocusable(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.closest("[hidden], [inert]")) return false;
  if (element.matches(":disabled, [aria-disabled='true']")) return false;
  if (element.tabIndex < 0) return false;

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function getFocusableElements(container) {
  const selector = [
    "a[href]",
    "area[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "iframe",
    "audio[controls]",
    "video[controls]",
    "[contenteditable='true']",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  return [...container.querySelectorAll(selector)].filter(isFocusable);
}

export function focusFirst(container, preferredSelector = "[data-autofocus]") {
  const preferred = preferredSelector ? container.querySelector(preferredSelector) : null;
  const target = (preferred && isFocusable(preferred))
    ? preferred
    : getFocusableElements(container)[0] || container;

  if (target instanceof HTMLElement) {
    target.focus({ preventScroll: true });
  }
  return target;
}

export function toNode(value, className) {
  if (value instanceof Node) return value;
  return createElement("span", { className, text: value ?? "" });
}

const modalDocuments = new WeakMap();

function restoreIsolation(record) {
  record.baselines.forEach((baseline, element) => {
    if (!element.isConnected) return;
    element.inert = baseline.inert;
    if (baseline.ariaHidden == null) {
      element.removeAttribute("aria-hidden");
    } else {
      element.setAttribute("aria-hidden", baseline.ariaHidden);
    }
  });
}

function refreshIsolation(documentRef, record) {
  restoreIsolation(record);
  const topLayer = record.layers.at(-1);
  if (!topLayer) return;

  [...documentRef.body.children].forEach((element) => {
    if (!record.baselines.has(element)) {
      record.baselines.set(element, {
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden"),
      });
    }

    const isActiveLayer = element === topLayer || element.contains(topLayer);
    if (!isActiveLayer) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }
  });
}

export function isolateModalLayer(layer) {
  const documentRef = layer.ownerDocument;
  let record = modalDocuments.get(documentRef);

  if (!record) {
    record = {
      layers: [],
      baselines: new Map(),
      hadModalOpenClass: documentRef.body.classList.contains("admin-v2-modal-open"),
    };
    modalDocuments.set(documentRef, record);
    documentRef.body.classList.add("admin-v2-modal-open");
  }

  record.layers.push(layer);
  refreshIsolation(documentRef, record);

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const index = record.layers.lastIndexOf(layer);
    if (index >= 0) record.layers.splice(index, 1);

    if (record.layers.length > 0) {
      refreshIsolation(documentRef, record);
      return;
    }

    restoreIsolation(record);
    if (!record.hadModalOpenClass) documentRef.body.classList.remove("admin-v2-modal-open");
    modalDocuments.delete(documentRef);
  };
}

export function asControllerElement(value) {
  return value?.element instanceof Node ? value.element : value;
}
