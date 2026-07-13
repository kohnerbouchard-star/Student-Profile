import { number, object, readJson, text } from "./common.ts";

function firstDefined(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function optionalText(record, keys) {
  const value = firstDefined(record, keys);
  if (value === undefined || value === null) return undefined;
  const normalized = text(value);
  return normalized || undefined;
}

function optionalNumber(record, keys) {
  const value = firstDefined(record, keys);
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = number(value, Number.NaN);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function optionalInteger(record, keys) {
  const value = optionalNumber(record, keys);
  return value === undefined ? undefined : Math.max(0, Math.trunc(value));
}

export async function normalizeStoreMutation(request, method) {
  const source = object(await readJson(request));
  const body = object(source.item || source.storeItem || source.payload || source);
  const normalized = {};

  const name = optionalText(body, ["name", "title", "itemName"]);
  const description = firstDefined(body, ["description", "details"]);
  const category = optionalText(body, ["category", "type"]);
  const price = optionalNumber(body, ["price", "unitPrice", "cost"]);
  const currencyCode = optionalText(body, ["currencyCode", "currency", "currency_code"]);
  const stockQuantity = optionalInteger(body, ["stockQuantity", "stock", "quantity", "inventory"]);
  const status = optionalText(body, ["status", "itemStatus"]);
  const visibility = optionalText(body, ["visibility"]);
  const sortOrder = optionalInteger(body, ["sortOrder", "order", "sort_order"]);
  const itemKey = optionalText(body, ["itemKey", "key", "slug", "sku"]);

  if (name !== undefined) normalized.name = name;
  if (description !== undefined) normalized.description = description === null ? null : text(description) || null;
  if (category !== undefined) normalized.category = category;
  if (price !== undefined) normalized.price = Math.max(0, price);
  if (currencyCode !== undefined) normalized.currencyCode = currencyCode.toUpperCase();
  if (stockQuantity !== undefined) normalized.stockQuantity = stockQuantity;
  if (status !== undefined) normalized.status = status === "inactive" ? "disabled" : status;
  if (visibility !== undefined) normalized.visibility = visibility === "private" ? "hidden" : visibility;
  if (sortOrder !== undefined) normalized.sortOrder = sortOrder;
  if (itemKey !== undefined && method === "POST") normalized.itemKey = itemKey.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

  if (method === "DELETE") {
    return { method: "PATCH", body: { status: "archived", visibility: "hidden" } };
  }

  return { method: method === "PUT" ? "PATCH" : method, body: normalized };
}

export async function normalizeSettingsMutation(request) {
  const source = object(await readJson(request));
  const body = object(source.settings || source.payload || source);
  const gameSettings = {};
  const policySettings = {};

  const difficultyPreset = optionalText(body, ["difficultyPreset", "difficulty", "preset", "difficultyBasePreset"]);
  const attendanceWindow = firstDefined(body, ["attendanceWindow", "attendance"]);
  const businessMarketWindow = firstDefined(body, ["businessMarketWindow", "businessMarket"]);
  const stockMarketWindow = firstDefined(body, ["stockMarketWindow", "stockMarket"]);
  const newsSchedule = firstDefined(body, ["newsSchedule", "news"]);

  if (difficultyPreset !== undefined) gameSettings.difficultyPreset = difficultyPreset;
  if (attendanceWindow !== undefined) gameSettings.attendanceWindow = object(attendanceWindow);
  if (businessMarketWindow !== undefined) gameSettings.businessMarketWindow = object(businessMarketWindow);
  if (stockMarketWindow !== undefined) gameSettings.stockMarketWindow = object(stockMarketWindow);
  if (newsSchedule !== undefined) gameSettings.newsSchedule = object(newsSchedule);

  const policyAliases = [
    ["priceMultiplier", "priceModifier", "price_modifier"],
    ["incomeMultiplier", "incomeModifier", "income_modifier"],
    ["shockFrequency", "eventVolatilityModifier", "event_volatility_modifier"],
    ["shockSeverity", "scarcityModifier", "scarcity_modifier"],
    ["tradeMultiplier", "tradeModifier", "trade_modifier"],
    ["recoverySupport", "bankruptcyProtection", "creditModifier", "credit_modifier"],
  ];
  const policyColumns = [
    "price_modifier",
    "income_modifier",
    "event_volatility_modifier",
    "scarcity_modifier",
    "trade_modifier",
    "credit_modifier",
  ];

  policyAliases.forEach((aliases, index) => {
    const value = optionalNumber(body, aliases);
    if (value !== undefined) policySettings[policyColumns[index]] = Math.min(2, Math.max(0.5, value));
  });

  if (Object.keys(policySettings).length > 0) {
    policySettings.difficulty_preset = "custom";
    policySettings.source = "custom";
    policySettings.custom_label = optionalText(body, ["customLabel"]) || "Custom";
    policySettings.difficulty_policy_profile_id = null;
  } else if (difficultyPreset !== undefined) {
    policySettings.difficulty_preset = difficultyPreset;
  }

  return { gameSettings, policySettings };
}

export async function applyDifficultyPolicy(service, gameId, policySettings) {
  if (!policySettings || Object.keys(policySettings).length === 0) return null;

  const existing = await service
    .from("game_difficulty_policy_settings")
    .select("id,difficulty_policy_profile_id,difficulty_preset,custom_label,source,price_modifier,event_volatility_modifier,scarcity_modifier,income_modifier,trade_modifier,credit_modifier,status,metadata")
    .eq("game_session_id", gameId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) throw new Error("difficulty_policy_settings_not_found");

  const patch = { ...policySettings };
  if (patch.source !== "custom") {
    delete patch.custom_label;
    delete patch.difficulty_policy_profile_id;
  }

  const result = await service
    .from("game_difficulty_policy_settings")
    .update(patch)
    .eq("game_session_id", gameId)
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
