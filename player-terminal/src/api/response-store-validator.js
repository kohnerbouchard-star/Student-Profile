import { ApiRequestError } from "./errors.js";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function invalidStoreResponse(context) {
  return new ApiRequestError("This section received incomplete data and could not be opened safely.", {
    code: "INVALID_RESPONSE",
    endpointKey: "store",
    requestId: context.requestId,
    path: context.path,
  });
}

function finiteMoney(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validStoreOfferPurchasability(kind, availableQuantity, purchasable) {
  if (typeof purchasable !== "boolean") return false;
  if (availableQuantity === 0) return purchasable === false;
  if (kind === "seeded" || kind === "npc") return purchasable === true;
  return kind === "business";
}

function derivedOfferAggregates(offers) {
  const actionable = offers.filter((offer) =>
    offer.status === "active" && offer.purchasable === true && offer.availableQuantity > 0
  );
  const currencies = new Set(actionable.map((offer) => offer.currencyCode));
  const comparable = currencies.size <= 1;
  const best = comparable && actionable.length
    ? Math.min(...actionable.map((offer) => offer.unitPrice))
    : null;
  return {
    total: actionable.reduce((sum, offer) => sum + offer.availableQuantity, 0),
    best,
    bestOffer: best === null
      ? null
      : actionable.find((offer) => offer.unitPrice === best)?.offerKey ?? null,
    sellers: new Set(actionable.map((offer) => offer.sellerPartyKey || offer.sellerKey)).size,
  };
}

export function validateStoreResponse(value, context) {
  if (UUID.test(JSON.stringify(value))) throw invalidStoreResponse(context);
  if (value.products !== undefined) {
    if (!Array.isArray(value.products)) throw invalidStoreResponse(context);
    const productFields = [
      "catalogItemKey", "canonicalItemKey", "storeItemKey", "name", "description",
      "category", "currencyCode", "bestOfferKey", "bestUnitPrice",
      "totalAvailableQuantity", "sellerCount", "offerCount", "offers", "updatedAt",
    ].sort();
    const offerFields = [
      "offerKey", "sellerKind", "sellerPartyKey", "sellerName", "businessKey",
      "businessName", "unitPrice", "currencyCode", "availableQuantity", "status",
      "purchasability", "purchasable", "version",
    ].sort();
    for (const product of value.products) {
      const keys = product && typeof product === "object" && !Array.isArray(product)
        ? Object.keys(product).sort()
        : [];
      if (
        keys.length !== productFields.length || keys.some((key, index) => key !== productFields[index]) ||
        !/^itm_[0-9a-f]{32}$/u.test(String(product.catalogItemKey || "")) ||
        !/^[a-z0-9][a-z0-9._-]{0,159}$/u.test(String(product.canonicalItemKey || "")) ||
        !/^[a-z0-9_-]{1,64}$/u.test(String(product.storeItemKey || "")) ||
        typeof product.name !== "string" || !product.name.trim() ||
        !(product.description === null || typeof product.description === "string") ||
        !/^[a-z0-9_-]{1,32}$/u.test(String(product.category || "")) ||
        !/^[A-Z0-9_]{3,16}$/u.test(String(product.currencyCode || "")) ||
        !(product.bestOfferKey === null || /^sof_[0-9a-f]{32}$/u.test(String(product.bestOfferKey))) ||
        !(product.bestUnitPrice === null || finiteMoney(product.bestUnitPrice)) ||
        !Number.isSafeInteger(product.totalAvailableQuantity) || product.totalAvailableQuantity < 0 ||
        !Number.isSafeInteger(product.sellerCount) || product.sellerCount < 0 ||
        !Number.isSafeInteger(product.offerCount) || product.offerCount < 0 ||
        !Array.isArray(product.offers) || !validTimestamp(product.updatedAt)
      ) throw invalidStoreResponse(context);
      for (const offer of product.offers) {
        const offerKeys = offer && typeof offer === "object" && !Array.isArray(offer)
          ? Object.keys(offer).sort()
          : [];
        const kind = String(offer?.sellerKind || "");
        const expectedPurchasability = kind === "business"
          ? "business_offer"
          : "system_offer";
        if (
          offerKeys.length !== offerFields.length || offerKeys.some((key, index) => key !== offerFields[index]) ||
          !/^sof_[0-9a-f]{32}$/u.test(String(offer.offerKey || "")) ||
          !new Set(["seeded", "npc", "business"]).has(kind) ||
          !/^pty_[0-9a-f]{32}$/u.test(String(offer.sellerPartyKey || "")) ||
          typeof offer.sellerName !== "string" || !offer.sellerName.trim() ||
          (kind === "business" && (
            !/^biz_[0-9a-f]{32}$/u.test(String(offer.businessKey || "")) ||
            typeof offer.businessName !== "string" || !offer.businessName.trim()
          )) ||
          (kind !== "business" && (offer.businessKey !== null || offer.businessName !== null)) ||
          !finiteMoney(offer.unitPrice) || (kind === "business" && offer.unitPrice <= 0) ||
          !/^[A-Z0-9_]{3,16}$/u.test(String(offer.currencyCode || "")) ||
          !Number.isSafeInteger(offer.availableQuantity) || offer.availableQuantity < 0 ||
          offer.status !== "active" || offer.purchasability !== expectedPurchasability ||
          !validStoreOfferPurchasability(kind, offer.availableQuantity, offer.purchasable) ||
          !Number.isSafeInteger(offer.version) || offer.version < 1
        ) throw invalidStoreResponse(context);
      }
      const { total, best, bestOffer, sellers } = derivedOfferAggregates(product.offers);
      if (
        product.offerCount !== product.offers.length ||
        product.totalAvailableQuantity !== total || product.bestUnitPrice !== best ||
        product.bestOfferKey !== bestOffer || product.sellerCount !== sellers
      ) throw invalidStoreResponse(context);
    }
  }
  for (const item of value.items) {
    const itemKey = String(item?.storeItemKey || item?.itemKey || item?.id || "");
    if (
      !item || typeof item !== "object" || Array.isArray(item) ||
      !/^[a-z0-9_-]{1,64}$/u.test(itemKey) ||
      (item.catalogItemKey && !/^itm_[0-9a-f]{32}$/u.test(String(item.catalogItemKey))) ||
      (item.canonicalItemKey && !/^[a-z0-9][a-z0-9._-]{0,159}$/u.test(String(item.canonicalItemKey))) ||
      typeof item.name !== "string" || !item.name.trim() ||
      !finiteMoney(item.price ?? item.bestUnitPrice)
    ) throw invalidStoreResponse(context);
    if (item.offers === undefined) continue;
    if (!Array.isArray(item.offers)) throw invalidStoreResponse(context);
    for (const offer of item.offers) {
      const kind = String(offer?.sellerKind || "");
      const mode = String(offer?.purchasability || "");
      const validOfferKey = /^sof_[0-9a-f]{32}$/u.test(String(offer?.offerKey || ""));
      const sellerPartyKey = String(offer?.sellerPartyKey || offer?.sellerKey || "");
      const validSellerKey = /^pty_[0-9a-f]{32}$/u.test(sellerPartyKey);
      if (
        !offer || typeof offer !== "object" || Array.isArray(offer) ||
        !new Set(["seeded", "npc", "business"]).has(kind) ||
        !new Set(["system_offer", "business_offer"]).has(mode) ||
        !validOfferKey || !validSellerKey ||
        typeof offer.sellerName !== "string" || !offer.sellerName.trim() ||
        !finiteMoney(offer.unitPrice) || (kind === "business" && offer.unitPrice <= 0) ||
        !/^[A-Z0-9_]{3,16}$/u.test(String(offer.currencyCode || "")) ||
        !Number.isSafeInteger(offer.availableQuantity) || offer.availableQuantity < 0 ||
        offer.status !== "active" ||
        !validStoreOfferPurchasability(kind, offer.availableQuantity, offer.purchasable) ||
        !Number.isSafeInteger(offer.version) || offer.version < 1 ||
        (kind === "business" && (
          mode !== "business_offer" || !/^sof_/.test(offer.offerKey) ||
          !/^biz_[0-9a-f]{32}$/u.test(String(offer.businessKey || "")) ||
          typeof offer.businessName !== "string" || !offer.businessName.trim()
        )) ||
        (kind !== "business" && (offer.businessKey !== null || offer.businessName !== null)) ||
        (kind !== "business" && mode !== "system_offer")
      ) throw invalidStoreResponse(context);
    }
    const { total, best, bestOffer, sellers: sellerCount } = derivedOfferAggregates(item.offers);
    if (
      (item.offerCount !== undefined && item.offerCount !== item.offers.length) ||
      (item.sellerCount !== undefined && item.sellerCount !== sellerCount) ||
      (item.totalAvailableQuantity !== undefined && item.totalAvailableQuantity !== total) ||
      (item.stock !== undefined && item.stock !== total) ||
      (item.bestUnitPrice !== undefined && item.bestUnitPrice !== best) ||
      (item.bestOfferKey !== undefined && item.bestOfferKey !== bestOffer)
    ) throw invalidStoreResponse(context);
  }
}
