window.Econovaria = window.Econovaria || {};

(function installLoginRetryCountdown(runtime) {
  "use strict";

  const RETRY_PATTERN = /^(.*?)(?:\s+Try again in\s+)(\d{1,5})\s+seconds?\.$/u;
  const MAX_RETRY_SECONDS = 86_400;
  const active = new WeakMap();

  function submitButton(node) {
    return node?.closest?.("form")?.querySelector?.("button[type='submit']") || null;
  }

  function stop(node, restoreButton = true) {
    const state = active.get(node);
    if (!state) return;
    runtime.clearInterval(state.timer);
    runtime.clearTimeout(state.followup);
    active.delete(node);
    delete node.dataset.retryCountdownActive;
    if (restoreButton && state.button) {
      state.button.disabled = state.button.getAttribute("aria-busy") === "true";
    }
  }

  function render(node, state) {
    const remaining = Math.max(
      0,
      Math.ceil((state.deadline - Date.now()) / 1000)
    );

    if (remaining <= 0) {
      stop(node, false);
      node.textContent = "You can try signing in again now.";
      node.classList.remove("hidden", "bad");
      if (state.button) {
        state.button.disabled = state.button.getAttribute("aria-busy") === "true";
      }
      return;
    }

    const unit = remaining === 1 ? "second" : "seconds";
    state.renderedText = `${state.base} Try again in ${remaining} ${unit}.`;
    node.textContent = state.renderedText;
    node.classList.remove("hidden");
    node.classList.add("bad");
    node.dataset.retryCountdownActive = "true";
    if (state.button) state.button.disabled = true;
  }

  function start(node, base, retrySeconds) {
    stop(node);
    const seconds = Math.max(
      1,
      Math.min(MAX_RETRY_SECONDS, Math.ceil(Number(retrySeconds) || 0))
    );
    const state = {
      base: String(base || "Too many failed sign-in attempts.").trim(),
      deadline: Date.now() + seconds * 1000,
      button: submitButton(node),
      timer: 0,
      followup: 0,
      renderedText: ""
    };
    active.set(node, state);
    render(node, state);
    state.followup = runtime.setTimeout(() => render(node, state), 0);
    state.timer = runtime.setInterval(() => render(node, state), 250);
  }

  function inspect(node) {
    if (!node) return;
    const state = active.get(node);
    const value = String(node.textContent || "").trim();
    if (state && value === state.renderedText) return;

    const match = RETRY_PATTERN.exec(value);
    if (!match) {
      if (state && value !== "You can try signing in again now.") stop(node);
      return;
    }

    start(node, match[1], Number(match[2]));
  }

  function initialize() {
    const nodes = Array.from(runtime.document.querySelectorAll(".login-message"));
    nodes.forEach(inspect);

    const observer = new MutationObserver((mutations) => {
      const changed = new Set();
      mutations.forEach((mutation) => {
        const target = mutation.target?.nodeType === 3
          ? mutation.target.parentElement
          : mutation.target;
        const node = target?.closest?.(".login-message");
        if (node) changed.add(node);
      });
      changed.forEach(inspect);
    });
    observer.observe(runtime.document.body, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  runtime.Econovaria.loginRetryCountdown = Object.freeze({
    inspect,
    start,
    stop
  });

  if (runtime.document.readyState === "loading") {
    runtime.document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})(window);
