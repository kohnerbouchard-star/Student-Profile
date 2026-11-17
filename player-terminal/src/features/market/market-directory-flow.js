import { PlayerApi } from "../../api/player-api.js";
import { isRouteEnabled } from "../../api/capabilities.js";
import { setButtonProcessing } from "../../core/dom.js";
import { updateStoreFromSnapshot } from "../../core/store.js";

import { nextMarketPage, appendMarketPage } from "./market-directory-model.js";

export function installMarketDirectoryFlow({ mount, terminal, config }) {
  const freshness = terminal.freshness;
  const api = new PlayerApi(config, { freshness, deferFreshnessSettlement: true });
  let active = null, destroyed = false, generation = 0, publishing = false;
  let previous = terminal.getState();
  function current(operation) {
    const state = terminal.getState();
    if (destroyed || active !== operation || operation.generation !== generation
      || state?.status !== "ready" || state.route !== "market" || state.routeLoading?.market || state.modal
      || state.data?.market !== operation.market) return false;
    try { api.syncFreshnessSession(); } catch { return false; }
    return !freshness || freshness.isCurrent(operation.ticket);
  }
  function retire() {
    generation++;
    if (active) { active.controller.abort(); active.restore(); active = null; }
  }
  const unsubscribe = terminal.subscribe?.((state) => {
    if (state.route !== previous?.route || state.status !== previous?.status || state.modal !== previous?.modal
      || Boolean(state.routeLoading?.market) !== Boolean(previous?.routeLoading?.market)
      || (!publishing && active && state.data?.market !== active.market)) retire();
    previous = state;
  });
  async function load(button) {
    const state = terminal.getState(), request = nextMarketPage(state.data?.market);
    if (destroyed || active || !request || state.status !== "ready" || state.route !== "market"
      || state.routeLoading?.market || state.modal || !isRouteEnabled(state.data?.capabilities, "market")
      || (state.data?.capabilities?.endpointKeys != null && state.data.capabilities.endpointKeys.market !== true)) return;
    api.setSession(config);
    const operation = { market: state.data.market, generation, ticket: freshness?.capture(["market"]),
      controller: new AbortController(), focusedAtStart: button === document.activeElement,
      restore: setButtonProcessing(button, "Loading instruments") };
    active = operation;
    try {
      const page = await api.request("market", { payload: request, force: true, signal: operation.controller.signal });
      if (!current(operation)) return;
      const market = appendMarketPage(operation.market, page, request);
      const orderDrafts = [...(mount.querySelectorAll?.("form[data-player-market-order-form]") || [])].map((form) => ({
        kind: form.dataset.playerMarketOrderForm,
        focusedName: [...form.elements].find((field) => field === document.activeElement)?.name || "",
        fields: [...form.elements].filter((field) => field.name && !field.disabled && field.type !== "hidden" && field.type !== "submit")
          .map((field) => [field.name, field.value]),
      }));
      const search = mount.querySelector("[data-player-market-search]");
      const searchValue = search?.value || "";
      const searchFocused = search === document.activeElement;
      const buttonFocused = button === document.activeElement
        || (operation.focusedAtStart && document.activeElement === document.body);
      const searchOpen = mount.querySelector("[data-player-market-search-panel]")?.hidden === false;
      let accepted;
      publishing = true;
      try { accepted = updateStoreFromSnapshot(terminal.getState(), (latest) => ({ ...latest, data: { ...latest.data, market } })); }
      finally { publishing = false; }
      if (!accepted) return;
      operation.market = market;
      // Keep local filtering usable across appended pages without claiming
      // that this loaded-only search is a server-wide search.
      const input = mount.querySelector("[data-player-market-search]");
      const panel = mount.querySelector("[data-player-market-search-panel]");
      if (input && panel && searchOpen) {
        panel.hidden = false;
        mount.querySelector('[data-player-local-action="market-search"]')?.setAttribute("aria-expanded", "true");
        input.value = searchValue;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      // Generic draft restoration also runs after shell replacement. Restore
      // each buy/sell ticket by its distinct form identity after that microtask.
      queueMicrotask(() => {
        if (destroyed || generation !== operation.generation || terminal.getState().data?.market !== market
          || terminal.getState().route !== "market" || (freshness && !freshness.isCurrent(operation.ticket))) return;
        for (const draft of orderDrafts) {
          const form = mount.querySelector(`form[data-player-market-order-form="${draft.kind}"]`);
          for (const [name, value] of draft.fields) {
            const field = form?.elements.namedItem(name);
            if (field && !field.disabled) field.value = value;
          }
          form?.dispatchEvent(new Event("input", { bubbles: true }));
          if (draft.focusedName) form?.elements.namedItem(draft.focusedName)?.focus?.({ preventScroll: true });
        }
        if (searchFocused) input?.focus?.({ preventScroll: true });
        else if (buttonFocused) mount.querySelector("[data-player-market-directory-status]")?.focus?.({ preventScroll: true });
      });
      // Never settle a whole-market invalidation with this partial page.
    } catch (error) {
      if (!current(operation) || ["REQUEST_ABORTED", "REQUEST_SUPERSEDED"].includes(error?.code)) return;
      if (Number(error?.status) === 401) {
        const detail = { reason: "invalid_player_session", terminal: "player", status: 401, code: "SESSION_INVALID" };
        try { config.onSessionInvalid?.(detail); } catch { /* Host cannot block safe exit. */ }
        globalThis.dispatchEvent?.(new CustomEvent(config.sessionInvalidEvent || "econovaria:player-session-invalid", { detail }));
      } else {
        terminal.showToast?.("More instruments could not be loaded. Your current list is unchanged; try again.", "amber");
      }
    } finally {
      operation.restore();
      if (active === operation) active = null;
    }
  }
  function click(event) {
    const button = event.target.closest?.("[data-player-market-load-more]");
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!button.disabled && button.getAttribute("aria-disabled") !== "true") void load(button);
  }
  mount.addEventListener("click", click, true);
  return { destroy() {
    if (destroyed) return;
    destroyed = true; retire(); unsubscribe?.();
    mount.removeEventListener("click", click, true);
    api.abortSessionRequests(false);
  } };
}
