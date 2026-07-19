import { isEndpointEnabled } from "../../api/capabilities.js";
import { playerSafeErrorMessage } from "../../api/errors.js";
import { PlayerApi } from "../../api/player-api.js";
import { setButtonProcessing } from "../../core/dom.js";
import { renderBankingPage } from "../../pages/banking-page.js";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function mergeBankingPages(currentBanking, incomingBanking) {
  const current = object(currentBanking);
  const incoming = object(incomingBanking);
  const transactions = new Map();
  for (const entry of [...list(current.transactions), ...list(incoming.transactions)]) {
    const id = String(entry?.id || "").trim();
    if (id) transactions.set(id, entry);
  }
  return {
    ...current,
    ...incoming,
    balances: list(incoming.balances).length
      ? list(incoming.balances)
      : list(current.balances),
    transactions: [...transactions.values()],
    pagination: {
      ...object(current.pagination),
      ...object(incoming.pagination),
    },
  };
}

export function resolveBankingReadFailure(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").trim().toUpperCase();
  if (status === 429) {
    return "Banking activity is being requested too quickly. Try again shortly.";
  }
  if (
    status >= 500 ||
    ["NETWORK_ERROR", "OFFLINE", "REQUEST_TIMEOUT"].includes(code)
  ) {
    return "Banking activity is temporarily unavailable. Loaded transactions remain visible.";
  }
  if (status || code) return playerSafeErrorMessage({ status, code });
  return "The next Banking page could not be loaded safely.";
}

function dispatchInvalidSession(error, config, runtime = globalThis) {
  if (Number(error?.status) !== 401) return false;
  const detail = Object.freeze({
    reason: "invalid_player_session",
    terminal: "player",
    status: 401,
    code: String(error?.code || "SESSION_INVALID"),
    requestId: String(error?.requestId || ""),
  });
  try {
    config.onSessionInvalid?.(detail);
  } catch {
    // Host callbacks cannot block the reviewed safe-exit event.
  }
  const eventName = String(
    config.sessionInvalidEvent || "econovaria:player-session-invalid",
  );
  runtime.dispatchEvent?.(new runtime.CustomEvent(eventName, { detail }));
  return true;
}

function replaceBankingPage(mount, terminal, banking) {
  const state = terminal.getState();
  if (state?.route !== "banking" || !state.data) return;
  state.data.banking = banking;
  const currentPage = mount.querySelector('[data-page="banking"]');
  if (!currentPage) return;
  const template = document.createElement("template");
  template.innerHTML = renderBankingPage(state.data).trim();
  const nextPage = template.content.firstElementChild;
  if (nextPage) currentPage.replaceWith(nextPage);
}

function showPageError(mount, message) {
  const host = mount.querySelector("[data-player-banking-page-error]");
  if (!host) return;
  host.textContent = message;
  host.hidden = false;
}

export function installBankingReadFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };
  if (!terminal || typeof terminal.getState !== "function") {
    throw new TypeError("The Banking read flow requires an active player terminal.");
  }

  const api = new PlayerApi(config);
  let loading = false;
  let destroyed = false;

  async function loadNextPage(button) {
    if (destroyed || loading) return;
    const state = terminal.getState();
    const banking = state?.data?.banking;
    const cursor = String(banking?.pagination?.nextCursor || "").trim();
    if (
      state?.route !== "banking" ||
      !cursor ||
      banking?.pagination?.hasMore !== true ||
      !isEndpointEnabled(state.data?.capabilities, "banking")
    ) return;

    loading = true;
    const restore = setButtonProcessing(button, "Loading activity");
    try {
      api.setSession(config);
      const nextPage = await api.request("banking", {
        payload: {
          limit: Number(banking.pagination.limit) || 50,
          cursor,
        },
        force: true,
      });
      const merged = mergeBankingPages(banking, nextPage);
      replaceBankingPage(mount, terminal, merged);
      const nextButton = mount.querySelector("[data-player-banking-load-more]");
      nextButton?.focus?.({ preventScroll: true });
      restore("Completed");
      setTimeout(() => restore(), 900);
    } catch (error) {
      restore();
      if (dispatchInvalidSession(error, config)) return;
      showPageError(mount, resolveBankingReadFailure(error));
      button.focus?.({ preventScroll: true });
    } finally {
      loading = false;
    }
  }

  function handleClick(event) {
    const button = event.target.closest?.("[data-player-banking-load-more]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!button.disabled && button.getAttribute("aria-disabled") !== "true") {
      void loadNextPage(button);
    }
  }

  mount.addEventListener("click", handleClick, true);
  return {
    destroy() {
      destroyed = true;
      mount.removeEventListener("click", handleClick, true);
    },
  };
}
