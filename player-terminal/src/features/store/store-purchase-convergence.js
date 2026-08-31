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

  try {
    const refresh = await terminal.refreshResources(current.invalidatedResources);
    if (!requestIsCurrent(requestGeneration)) return null;
    if (Object.keys(refresh?.errors || {}).length) {
      warnings.push("The purchase completed, but some current Checking, Banking FX, Store stock, or inventory evidence could not be refreshed.");
    }
  } catch {
    if (!requestIsCurrent(requestGeneration)) return null;
    warnings.push("The purchase completed, but current Checking, Banking FX, Store, and inventory evidence could not be refreshed. Use Retry refresh to safely try those reads again.");
  }
  return warnings;
}
