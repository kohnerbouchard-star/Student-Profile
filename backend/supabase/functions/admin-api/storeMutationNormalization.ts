import {
  object,
  readJson,
  optionalText,
  firstDefined,
  optionalNumber,
  optionalInteger,
  text,
  slug,
  array,
  compactObject,
} from "./mutationValues.ts";


export async function normalizeStoreMutation(
  request: Request,
  method: string,
): Promise<any> {
  const source = object(await readJson(request));
  const payload = object(source.payload);
  const nestedItem = object(
    source.item || source.storeItem || payload.item || payload.storeItem,
  );
  // The v606 terminal keeps presentation fields under payload.item while its
  // create adapter adds authoritative, canonical values at payload root. Merge
  // both envelopes and let the canonical outer fields win.
  const body = { ...nestedItem, ...payload, ...source };
  const normalized: Record<string, any> = {};

  const name = optionalText(body, ["name", "title", "itemName"]);
  const description = firstDefined(body, ["description", "details"]);
  const category = optionalText(body, ["category", "type"]);
  const price = optionalNumber(body, ["price", "unitPrice", "cost"]);
  const currencyCode = optionalText(body, [
    "currencyCode",
    "currency",
    "currency_code",
  ]);
  const stockQuantity = optionalInteger(body, [
    "stockQuantity",
    "stock",
    "quantity",
    "inventory",
  ]);
  const status = optionalText(body, ["status", "itemStatus"]);
  const visibility = optionalText(body, ["visibility"]);
  const sortOrder = optionalInteger(body, ["sortOrder", "order", "sort_order"]);
  const itemKey = optionalText(body, ["itemKey", "key", "slug", "sku"]);

  if (name !== undefined) normalized.name = name;
  if (description !== undefined) {
    normalized.description = description === null
      ? null
      : text(description) || null;
  }
  if (category !== undefined) normalized.category = slug(category).slice(0, 32);
  if (price !== undefined) normalized.price = Math.max(0, price);
  if (currencyCode !== undefined) {
    normalized.currencyCode = currencyCode.toUpperCase();
  }
  if (stockQuantity !== undefined) normalized.stockQuantity = stockQuantity;
  if (status !== undefined) {
    normalized.status = normalizeStoreStatus(status);
  }
  if (visibility !== undefined) {
    normalized.visibility = normalizeStoreVisibility(visibility);
  }
  if (sortOrder !== undefined) normalized.sortOrder = sortOrder;
  if (itemKey !== undefined && method === "POST") {
    normalized.itemKey = slug(itemKey).slice(0, 64);
  }

  if (method === "DELETE") {
    return {
      method: "PATCH",
      body: { status: "archived", visibility: "hidden" },
    };
  }

  return { method: method === "PUT" ? "PATCH" : method, body: normalized };
}


export function normalizeStoreStatus(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "archived") return "archived";
  if (["disabled", "inactive", "paused"].includes(normalized)) {
    return "disabled";
  }
  return normalized;
}


export function normalizeStoreVisibility(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (["all players", "public", "visible"].includes(normalized)) {
    return "visible";
  }
  if (["admin only", "private", "hidden"].includes(normalized)) {
    return "hidden";
  }
  return normalized;
}


export function normalizeTargeting(body: Record<string, any>): Record<string, any> {
  const explicit = object(body.targetingPayload || body.targeting);
  const locations = array(
    firstDefined(body, [
      "locations",
      "countries",
      "countryCodes",
      "targetLocations",
    ]),
  ).map((value) =>
    text(object(value).code || object(value).countryCode || value)
  )
    .filter(Boolean);
  const allPlayers = explicit.allPlayers === true ||
    locations.some((value) =>
      ["all", "all locations", "all countries"].includes(value.toLowerCase())
    );
  const countryCodes = locations
    .filter((value) =>
      !["all", "all locations", "all countries"].includes(value.toLowerCase())
    )
    .map((value) => value.toUpperCase());

  return compactObject({
    ...explicit,
    allPlayers: allPlayers || explicit.allPlayers === true ? true : undefined,
    countryCodes: countryCodes.length
      ? [...new Set(countryCodes)]
      : explicit.countryCodes,
    playerIds: array(body.playerIds).length
      ? array(body.playerIds)
      : explicit.playerIds,
    rosterLabels: array(body.rosterLabels).length
      ? array(body.rosterLabels)
      : explicit.rosterLabels,
  });
}


export function normalizeContractRewards(
  body: Record<string, any>,
): Record<string, any> {
  const explicit = object(body.rewardPayload || body.rewards);
  const explicitCash = object(explicit.cash || body.cashReward);
  const cashAmount = optionalNumber(explicitCash, ["amount", "value"]) ??
    optionalNumber(body, [
      "cashRewardAmount",
      "rewardCash",
      "cashAmount",
      "rewardAmount",
    ]);
  const currencyCode =
    optionalText(explicitCash, ["currencyCode", "currency"]) ||
    optionalText(body, ["rewardCurrencyCode", "currencyCode", "currency"]) ||
    "ECO";

  const rawItems = array(explicit.items).length ? array(explicit.items) : array(
    firstDefined(body, ["itemRewards", "rewardItems", "attachedItemRewards"]),
  );
  const items = rawItems.map((value) => {
    const item = object(value);
    const storeItemId = optionalText(item, [
      "storeItemId",
      "itemUuid",
      "id",
      "value",
    ]);
    const quantity = optionalInteger(item, ["quantity", "qty", "amount"]);
    if (!storeItemId || !quantity || quantity < 1) return null;
    return { storeItemId, quantity };
  }).filter(Boolean);

  return compactObject({
    cash: cashAmount !== undefined && cashAmount > 0
      ? {
        amount: Math.round(cashAmount * 100) / 100,
        accountType: optionalText(explicitCash, ["accountType"]) || "checking",
        currencyCode: currencyCode.toUpperCase(),
      }
      : explicit.cash === null
      ? null
      : undefined,
    items: items.length ? items : undefined,
  });
}
