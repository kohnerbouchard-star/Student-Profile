const RESET_SELECTOR = '[data-admin-terminal-action="reset-game-code"]';
const HIDDEN_CODE_LABELS = new Set(["Generate Code", "Create Replacement Code"]);

function normalizeText(value) {
  return String(value || "").trim();
}

function enhanceResetButton(button) {
  if (!(button instanceof HTMLButtonElement)) return;
  const label = normalizeText(button.textContent);
  if (label !== "Generate Code") return;

  button.textContent = "Create Replacement Code";
  button.title =
    "The readable code is unavailable in this browser session. Creating a replacement invalidates any active code and shared link.";

  const container = button.closest(".admin-terminal-share-modal-code");
  const message = container?.querySelector("[data-econovaria-game-code-message]");
  if (message) {
    message.textContent =
      "A server-side code may already be active. Create a replacement only when you intentionally want to invalidate the existing code.";
  }
}

function enhanceRenderedButtons(root = document) {
  root.querySelectorAll(RESET_SELECTOR).forEach(enhanceResetButton);
}

document.addEventListener(
  "click",
  (event) => {
    const button = event.target?.closest?.(RESET_SELECTOR);
    if (!(button instanceof HTMLButtonElement)) return;

    const label = normalizeText(button.textContent);
    if (!HIDDEN_CODE_LABELS.has(label)) return;

    const confirmed = window.confirm(
      "Create a replacement game code? A code may already be active but hidden because this browser session does not retain its readable value. Continuing immediately invalidates the current code and all previously shared links.",
    );

    if (confirmed) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  },
  true,
);

const observer = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches(RESET_SELECTOR)) enhanceResetButton(node);
      enhanceRenderedButtons(node);
    }
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

enhanceRenderedButtons();
