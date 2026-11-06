import { PlayerApi } from "../../api/player-api.js";
import { validateImmutableBusinessOfferReceipt } from "./store-purchase-contract.js";

export function unavailableStoreSelection(current, refreshPending = false) {
  return {
    item: current.item,
    offer: {
      ...current.offer,
      status: "unavailable",
      purchasable: false,
      availableQuantity: 0,
    },
    refreshPending,
  };
}

export async function refreshStaleStoreOffer({
  current,
  terminal,
  requestGeneration,
  requestIsCurrent,
}) {
  let refresh;
  try {
    refresh = await terminal.refreshResources(["store"]);
  } catch {
    if (!requestIsCurrent(requestGeneration)) return null;
    return unavailableStoreSelection(current, true);
  }
  if (!requestIsCurrent(requestGeneration)) return null;
  if (refresh?.errors?.store || !Object.prototype.hasOwnProperty.call(refresh?.data || {}, "store")) {
    return unavailableStoreSelection(current, true);
  }
  const itemKey = String(current.item.storeItemKey || current.item.itemKey || current.item.id);
  const offerKey = String(current.offer.offerKey || "");
  const item = terminal.getState()?.data?.store?.items?.find((candidate) =>
    String(candidate.storeItemKey || candidate.itemKey || candidate.id) === itemKey
  );
  const offer = Array.isArray(item?.offers)
    ? item.offers.find((candidate) => candidate.offerKey === offerKey)
    : null;
  return item && offer
    ? { item, offer, refreshPending: false }
    : unavailableStoreSelection(current);
}

export async function convergeCommittedStorePurchase({
  current,
  api,
  config,
  terminal,
  requestGeneration,
  requestIsCurrent,
  signal,
}) {
  if (!requestIsCurrent(requestGeneration)) return null;
  const warnings = [];
  api.setSession(config);
  if (current.purchaseMode === "business_offer") {
    try {
      const immutable = await api.request("storeOfferReceipt", {
        params: { receiptKey: current.receipt.receiptKey },
        force: true,
        signal,
      });
      if (!requestIsCurrent(requestGeneration)) return null;
      validateImmutableBusinessOfferReceipt(immutable, {
        item: current.item,
        offer: current.offer,
        quote: current.quote,
        committedReceipt: current.receipt,
      });
    } catch (error) {
      if (!requestIsCurrent(requestGeneration)) return null;
      if (Number(error?.status) === 401) throw error;
      warnings.push("The purchase completed, but the immutable receipt could not be reloaded yet.");
    }
  }

  if (!requestIsCurrent(requestGeneration)) return null;
  // Navigation/realtime can supersede this aggregate publication. Delegate one
  // fresh attempt to the same terminal publisher; never retry settlement or
  // introduce a private cache/publisher. Further contention stays pending.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const refresh = await terminal.refreshResources(current.invalidatedResources);
      if (!requestIsCurrent(requestGeneration)) return null;
      if (Object.keys(refresh?.errors || {}).length) {
        warnings.push("The purchase completed, but some current Checking, Banking FX, Store stock, or inventory evidence could not be refreshed.");
      }
      break;
    } catch (error) {
      if (!requestIsCurrent(requestGeneration)) return null;
      if (attempt === 0 && error?.code === "REQUEST_SUPERSEDED") continue;
      warnings.push("The purchase completed, but current Checking, Banking FX, Store, and inventory evidence could not be refreshed. Use Retry refresh to safely try those reads again.");
      break;
    }
  }
  return warnings;
}

// Own modal effects separately from committed read convergence. Closing a
// receipt retires its view, but does not roll back settlement or cancel the
// same-session authoritative refresh. The terminal remains the read publisher.
export function createStorePurchaseOwner({ terminal, config, retire }) {
  const freshness = terminal.freshness;
  const api = new PlayerApi(config, { freshness, deferFreshnessSettlement: true });
  let generation = 0, active = null, destroyed = false;
  let previous = terminal.getState();
  const available = () => {
    const state = terminal.getState();
    return !destroyed && state?.route === "store" && state.status === "ready"
      && Boolean(state.data) && !state.routeLoading?.store;
  };
  function sessionCurrent(request) {
    if (destroyed || !request) return false;
    try { api.syncFreshnessSession(); } catch { return false; }
    return request.sessionVersion === api.sessionVersion
      && (!freshness || freshness.isCurrent(request.sessionTicket));
  }
  function current(request) {
    return available() && request?.generation === generation && sessionCurrent(request)
      && (!request.resourceTicket || freshness.isCurrent(request.resourceTicket))
      && request.resources.every(([key, value]) => terminal.getState().data[key] === value);
  }
  function finish(request) {
    request?.restore?.();
    if (request) request.restore = () => {};
    if (active === request) active = null;
  }
  function cancel() {
    generation++;
    active?.controller.abort();
    finish(active);
  }
  const unsubscribe = terminal.subscribe?.((state) => {
    const changed = state.route !== previous?.route || state.status !== previous?.status
      || Boolean(state.routeLoading?.store) !== Boolean(previous?.routeLoading?.store);
    previous = state;
    if (changed) retire();
  });
  return {
    api, available, current, sessionCurrent, cancel, finish,
    captureSession() {
      api.setSession(config);
      return { sessionVersion: api.sessionVersion, sessionTicket: freshness?.capture() };
    },
    begin({ quote = false, settlement = false, restore = () => {} } = {}) {
      cancel();
      api.setSession(config);
      const keys = quote ? ["store", "banking", "bankingFx", "session"] : [];
      const request = {
        generation, sessionVersion: api.sessionVersion, sessionTicket: freshness?.capture(),
        resourceTicket: quote && freshness ? freshness.capture(keys) : null,
        resources: keys.map((key) => [key, terminal.getState().data[key]]),
        controller: new AbortController(), restore,
      };
      active = request;
      return { requestGeneration: request, signal: settlement ? null : request.controller.signal };
    },
    destroy() {
      destroyed = true; cancel(); unsubscribe?.();
      api.abortSessionRequests(false);
    },
  };
}
