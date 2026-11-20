import { PlayerApi } from "../../api/player-api.js";
import { setButtonProcessing } from "../../core/dom.js";
import { updateStoreFromSnapshot } from "../../core/store.js";
import { syncFxSourceControls } from "./banking-read-helpers.js";

// Banking publishes into the terminal store. Endpoint names such as
// bankingFxHistory are not the generation of the aggregate they will modify.
export function createBankingReadOwner({ mount, terminal, config }) {
  const freshness = terminal.freshness;
  const api = new PlayerApi(config, { freshness, deferFreshnessSettlement: true });
  const active = new Map(), frames = new Set();
  let destroyed = false, viewVersion = 0, intentVersion = 0;
  let previous = terminal.getState();

  function current(operation) {
    const state = terminal.getState();
    if (!operation || destroyed || operation.retired || operation.viewVersion !== viewVersion
      || state?.route !== "banking" || state.status !== "ready" || !state.data || state.routeLoading?.banking
      || (operation.intentVersion !== null && operation.intentVersion !== intentVersion)) return false;
    try { api.syncFreshnessSession(); } catch { return false; }
    return (!freshness || freshness.isCurrent(operation.ticket))
      && operation.resources.every(([key, value]) => state.data[key] === value);
  }

  function finish(operation) {
    if (!operation) return;
    operation.restore();
    operation.restore = () => {};
    if (active.get(operation.lane) !== operation) return;
    active.delete(operation.lane);
    operation.panel?.removeAttribute("aria-busy");
  }

  function retire() {
    viewVersion++;
    for (const operation of active.values()) {
      operation.retired = true;
      operation.controller.abort();
      finish(operation);
    }
    for (const id of frames) cancelAnimationFrame(id);
    frames.clear();
  }

  const unsubscribe = terminal.subscribe?.((state) => {
    if (state.route !== previous?.route || state.status !== previous?.status
      || Boolean(state.routeLoading?.banking) !== Boolean(previous?.routeLoading?.banking)) retire();
    previous = state;
  });

  function begin(lane, keys, button, label, { intent = false } = {}) {
    const state = terminal.getState();
    if (destroyed || state?.route !== "banking" || state.status !== "ready" || !state.data || state.routeLoading?.banking) return null;
    const prior = active.get(lane);
    if (prior && current(prior)) return null;
    if (prior) { prior.retired = true; prior.controller.abort(); finish(prior); }
    api.setSession(config);
    const operation = {
      lane, ticket: freshness?.capture(keys), viewVersion,
      resources: keys.map((key) => [key, state.data[key]]),
      intentVersion: intent ? intentVersion : null,
      controller: new AbortController(), restore: setButtonProcessing(button, label),
      panel: lane === "fx" ? mount.querySelector(".player-terminal-fx-panel") : null,
    };
    active.set(lane, operation);
    operation.panel?.setAttribute("aria-busy", "true");
    return operation;
  }

  function commit(patch) {
    const form = mount.querySelector('[data-player-banking-fx-form="quote"]');
    const names = ["sourceAccountKey", "targetCurrencyCode", "sourceAmount", "product"];
    const draft = names.map((name) => [name, form?.elements.namedItem(name)?.value]);
    const focused = form?.contains?.(document.activeElement) ? document.activeElement : null;
    const selection = focused && [focused.selectionStart, focused.selectionEnd];
    const accepted = updateStoreFromSnapshot(terminal.getState(), (state) => ({
      ...state, data: { ...state.data, ...patch },
    }));
    if (accepted) {
      const nextForm = mount.querySelector('[data-player-banking-fx-form="quote"]');
      for (const [name, value] of draft) {
        const field = nextForm?.elements.namedItem(name);
        if (field && value !== undefined) field.value = value;
      }
      const source = nextForm?.elements.namedItem("sourceAccountKey");
      if (source) syncFxSourceControls(source);
      const nextFocus = focused && nextForm?.elements.namedItem(focused.name);
      nextFocus?.focus?.({ preventScroll: true });
      if (nextFocus && selection?.every(Number.isInteger)) nextFocus.setSelectionRange?.(...selection);
    }
    return accepted;
  }

  function publish(operation, patch, focusSelector = "") {
    if (!current(operation)) return false;
    const accepted = commit(patch);
    if (!accepted) return false;
    operation.resources = operation.resources.map(([key, value]) => [key, patch[key] ?? value]);
    // These are partial pages, histories, orders or quotes. Only the existing
    // full-resource publisher may settle an aggregate invalidation.
    if (focusSelector) {
      const id = requestAnimationFrame(() => {
        frames.delete(id);
        if (current(operation)) mount.querySelector(focusSelector)?.focus?.({ preventScroll: true });
      });
      frames.add(id);
    }
    return true;
  }

  return {
    api, begin, current, finish, publish,
    acceptsError: (operation, error) => current(operation)
      && !["REQUEST_ABORTED", "REQUEST_SUPERSEDED"].includes(error?.code),
    clearQuote() {
      const state = terminal.getState();
      if (destroyed || state?.route !== "banking" || !state.data?.bankingFx?.currentQuote) return false;
      return commit({ bankingFx: { ...state.data.bankingFx, currentQuote: null } });
    },
    changeIntent() {
      intentVersion++;
      const operation = active.get("fx");
      if (operation?.intentVersion !== null) {
        operation?.controller.abort();
        finish(operation);
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      retire();
      unsubscribe?.();
      // Retiring this adapter must not reset the other terminal publishers.
      api.abortSessionRequests(false);
    },
  };
}
