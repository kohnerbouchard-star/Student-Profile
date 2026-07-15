(function initEconovariaAdminStabilization() {
  "use strict";

  const GLYPH_ONLY = new Map([
    ["×", "close"],
    ["⌄", "chevron-down"],
    ["⌃", "chevron-up"],
    ["‹", "chevron-left"],
    ["›", "chevron-right"],
    ["↗", "external"],
  ]);

  const ICON_PATHS = {
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    external: '<path d="M14 5h5v5M19 5l-9 9"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    "chevron-down": '<path d="m7 10 5 5 5-5"/>',
    "chevron-up": '<path d="m7 14 5-5 5 5"/>',
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  };

  let reconcileQueued = false;

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.classList.add("admin-terminal-ui-icon");
    svg.innerHTML = ICON_PATHS[name] || ICON_PATHS.external;
    return svg;
  }

  function labelNode(value) {
    const span = document.createElement("span");
    span.textContent = value;
    return span;
  }

  function setButtonContent(button, label, iconName, options = {}) {
    if (!(button instanceof HTMLButtonElement)) return;
    const normalizedLabel = text(label);
    button.replaceChildren();
    if (options.iconOnly !== true && normalizedLabel) {
      if (options.iconAfter !== true) button.append(icon(iconName));
      button.append(labelNode(normalizedLabel));
      if (options.iconAfter === true) button.append(icon(iconName));
    } else {
      button.append(icon(iconName));
    }
    button.dataset.adminStabilizedIcon = "true";
    if (options.iconOnly === true && !button.getAttribute("aria-label")) {
      button.setAttribute("aria-label", normalizedLabel || iconName);
    }
  }

  function reconcileKnownButtons(root) {
    root.querySelectorAll?.(".admin-terminal-action-arrow, .admin-terminal-share-arrow")
      .forEach((node) => {
        if (node.dataset.adminStabilizedIcon === "true") return;
        node.replaceChildren(icon("external"));
        node.dataset.adminStabilizedIcon = "true";
      });

    root.querySelectorAll?.(".admin-terminal-side-code-compact")
      .forEach((button) => setButtonContent(
        button,
        button.getAttribute("aria-label") || "Share game code",
        "external",
        { iconOnly: true },
      ));

    root.querySelectorAll?.(".admin-terminal-hud-close")
      .forEach((button) => {
        if (button.dataset.adminStabilizedIcon === "true") return;
        const visibleLabel = text(button.querySelector("span")?.textContent) || "Close";
        const span = labelNode(visibleLabel);
        const badge = document.createElement("b");
        badge.append(icon("close"));
        button.replaceChildren(span, badge);
        button.dataset.adminStabilizedIcon = "true";
      });

    const labeledActions = [
      ["stage-cash-reward", "Cash", "plus"],
      ["stage-item-reward", "Item", "plus"],
      ["add-contract-quiz-question", "Add question", "plus"],
    ];
    for (const [action, label, iconName] of labeledActions) {
      root.querySelectorAll?.(`[data-admin-terminal-action="${action}"]`)
        .forEach((button) => {
          if (button.dataset.adminStabilizedIcon === "true") return;
          setButtonContent(button, label, iconName);
        });
    }

    const iconOnlyActions = [
      ["toggle-contract-post-menu", "More post options", "chevron-down"],
      ["close-contract-material-builder", "Close material builder", "close"],
      ["close-contract-schedule-picker", "Close schedule picker", "close"],
      ["contract-schedule-prev-month", "Previous month", "chevron-left"],
      ["contract-schedule-next-month", "Next month", "chevron-right"],
    ];
    for (const [action, label, iconName] of iconOnlyActions) {
      root.querySelectorAll?.(`[data-admin-terminal-action="${action}"]`)
        .forEach((button) => {
          if (button.dataset.adminStabilizedIcon === "true") return;
          setButtonContent(button, label, iconName, { iconOnly: true });
        });
    }

    root.querySelectorAll?.(".admin-terminal-location-toggle")
      .forEach((button) => {
        const strong = button.querySelector("strong");
        const badge = button.querySelector("b") || document.createElement("b");
        if (strong) strong.textContent = text(strong.textContent).replace(/[⌄⌃]+$/u, "").trim();
        badge.replaceChildren(icon(
          button.getAttribute("aria-expanded") === "true" ? "chevron-up" : "chevron-down",
        ));
        badge.dataset.adminStabilizedIcon = "true";
        if (!badge.parentElement) button.append(badge);
      });

    root.querySelectorAll?.(".admin-terminal-contract-advanced-v495 summary")
      .forEach((summary) => {
        const existing = summary.querySelector(":scope > .admin-terminal-ui-icon");
        existing?.remove();
        summary.append(icon(summary.parentElement?.open ? "chevron-up" : "chevron-down"));
      });

    root.querySelectorAll?.(".admin-terminal-drawer-action")
      .forEach((button) => {
        if (button.dataset.adminStabilizedIcon === "true") return;
        const label = text(button.textContent).replace(/[↗]+$/u, "").trim() || "View more";
        setButtonContent(button, label, "external", { iconAfter: true });
      });
  }

  function reconcileResidualGlyphButtons(root) {
    root.querySelectorAll?.("button")
      .forEach((button) => {
        if (button.dataset.adminStabilizedIcon === "true") return;
        const value = text(button.textContent);
        const iconName = GLYPH_ONLY.get(value);
        if (!iconName) return;
        setButtonContent(
          button,
          button.getAttribute("aria-label") || iconName,
          iconName,
          { iconOnly: true },
        );
      });
  }

  function parseNumber(value) {
    const normalized = text(value).replace(/,/g, "");
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatMoneyNode(node) {
    if (!(node instanceof HTMLElement)) return;
    const value = parseNumber(node.textContent);
    if (value == null) return;
    const original = text(node.textContent);
    const prefix = original.match(/^[^\d-]+/)?.[0] || "";
    const suffix = original.match(/[^\d.]+$/)?.[0] || "";
    const formatted = value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const next = `${prefix}${formatted}${suffix}`;
    if (node.textContent !== next) node.textContent = next;
  }

  function reconcileNumericFormatting(root) {
    root.querySelectorAll?.(
      ".admin-terminal-currency-number, .admin-terminal-currency-single-amount > b",
    ).forEach(formatMoneyNode);

    root.querySelectorAll?.('input[type="number"]')
      .forEach((input) => {
        const name = text(input.getAttribute("name")).toLowerCase();
        const context = text(input.closest("label, .admin-terminal-field, .admin-terminal-reward-stage-row")?.textContent)
          .toLowerCase();
        if (/(price|amount|cash|balance|reward|cost)/.test(`${name} ${context}`)) {
          if (!input.getAttribute("step") || input.getAttribute("step") === "1") {
            input.setAttribute("step", "0.01");
          }
          input.setAttribute("inputmode", "decimal");
        }
      });
  }

  function reconcile(root = document) {
    reconcileKnownButtons(root);
    reconcileResidualGlyphButtons(root);
    reconcileNumericFormatting(root);
  }

  function scheduleReconcile() {
    if (reconcileQueued) return;
    reconcileQueued = true;
    window.requestAnimationFrame(() => {
      reconcileQueued = false;
      reconcile(document);
    });
  }

  const observerRoot = document.body || document.documentElement;
  if (observerRoot && typeof MutationObserver === "function") {
    const observer = new MutationObserver(scheduleReconcile);
    observer.observe(observerRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-expanded", "open"],
    });
  }

  document.addEventListener("toggle", scheduleReconcile, true);
  window.addEventListener("load", () => reconcile(document), { once: true });
  reconcile(document);

  window.EconovariaAdminStabilization = {
    reconcile,
    formatMoneyNode,
  };
})();
