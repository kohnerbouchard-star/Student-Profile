import { ApiRequestError } from "./errors.js";
import { validateStoreResponse } from "./response-store-validator.js";
import { normalizeBusinessTreasurySnapshot } from "../features/business-treasury/business-treasury-read-model.js";

const ARRAY_READS = new Set(["countries", "notifications"]);
const READ_ENDPOINTS = new Set([
  "session",
  "dashboard",
  "countries",
  "country",
  "news",
  "worldRuntime",
  "market",
  "portfolio",
  "business",
  "businessWorkforce",
  "businessTreasury",
  "businessStockroom",
  "businessRecipes",
  "store",
  "marketplace",
  "contracts",
  "inventory",
  "crafting",
  "banking",
  "bankingFx",
  "bankingFxHistory",
  "bankingFxOrders",
  "loans",
  "messages",
  "progression",
  "notifications",
  "notificationsPage",
  "storyDeliveries",
]);
const REQUIRED_ARRAY_FIELDS = Object.freeze({
  dashboard: Object.freeze(["worldEvents", "marketPulse"]),
  news: Object.freeze(["categories", "items"]),
  market: Object.freeze(["sectors", "assets"]),
  portfolio: Object.freeze(["history", "allocation", "countryExposure"]),
  business: Object.freeze(["products", "suppliers"]),
  businessWorkforce: Object.freeze(["candidates"]),
  businessStockroom: Object.freeze(["locations", "items"]),
  businessRecipes: Object.freeze(["recipes"]),
  store: Object.freeze(["categories", "items"]),
  marketplace: Object.freeze(["categories", "listings", "myListings"]),
  contracts: Object.freeze(["tabs", "lifecycle", "items"]),
  inventory: Object.freeze(["categories", "items"]),
  crafting: Object.freeze(["recipes", "queue"]),
  banking: Object.freeze(["transactions"]),
  bankingFx: Object.freeze(["currencies", "balances", "pendingOrders", "completedOrders"]),
  bankingFxHistory: Object.freeze(["points"]),
  bankingFxOrders: Object.freeze(["orders"]),
  loans: Object.freeze(["offers", "activeLoans", "schedule"]),
  messages: Object.freeze(["threads"]),
  progression: Object.freeze(["reputation", "milestones", "skills", "achievements", "licenses"]),
  notificationsPage: Object.freeze(["items"]),
  storyDeliveries: Object.freeze(["items"]),
});
const REQUIRED_OBJECT_FIELDS = Object.freeze({
  business: Object.freeze(["company", "operations"]),
  banking: Object.freeze(["checking", "savings"]),
  bankingFxHistory: Object.freeze(["pagination"]),
  bankingFxOrders: Object.freeze(["pagination"]),
  loans: Object.freeze(["nextPayment"]),
  notificationsPage: Object.freeze(["page", "summary"]),
  worldRuntime: Object.freeze(["arrival", "travel"]),
});
const MAX_DEPTH = 12;
const MAX_ARRAY_LENGTH = 1000;
const MAX_OBJECT_KEYS = 300;
const MAX_STRING_LENGTH = 5000;
const URL_KEY = /(?:image|imageUrl|avatar|photo|thumbnail|assetUrl|currencySymbolAsset)$/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const BUSINESS_STOCKROOM_LOCATION_KEYS = Object.freeze([
  "warehouse",
  "work_in_progress",
  "finished_goods",
  "in_transit",
]);

function invalidResponse(endpointKey, requestId, path) {
  return new ApiRequestError("This section received incomplete data and could not be opened safely.", {
    code: "INVALID_RESPONSE",
    endpointKey,
    requestId,
    path,
  });
}

function allowedRemoteUrl(value, config) {
  const text = String(value || "").trim();
  if (!text || /^\s*(?:javascript|vbscript|file):/i.test(text) || text.startsWith("//")) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) return text.slice(0, MAX_STRING_LENGTH);
  try {
    const parsed = new URL(text);
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) return "";
    const allowed = new Set((config.allowedImageHosts || []).map((host) => String(host).toLowerCase()));
    const currentHost = String(globalThis.location?.hostname || "").toLowerCase();
    if (currentHost) allowed.add(currentHost);
    return allowed.has(parsed.hostname.toLowerCase()) ? parsed.href.slice(0, MAX_STRING_LENGTH) : "";
  } catch {
    return "";
  }
}

function sanitizeValue(value, config, depth = 0, key = "") {
  if (depth > MAX_DEPTH) return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return URL_KEY.test(key)
    ? allowedRemoteUrl(value, config)
    : value.slice(0, MAX_STRING_LENGTH);
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, config, depth + 1));
  if (typeof value !== "object") return null;
  const output = {};
  for (const [childKey, childValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
    if (["__proto__", "constructor", "prototype"].includes(childKey)) continue;
    output[childKey] = sanitizeValue(childValue, config, depth + 1, childKey);
  }
  return output;
}

function unwrap(endpointKey, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  if (
    endpointKey === "progression" &&
    raw.progression &&
    typeof raw.progression === "object" &&
    !Array.isArray(raw.progression)
  ) return raw.progression;
  if (
    endpointKey === "worldRuntime" &&
    raw.context &&
    typeof raw.context === "object" &&
    !Array.isArray(raw.context)
  ) return raw.context;
  if (Object.prototype.hasOwnProperty.call(raw, "data") && (raw.ok === true || Object.keys(raw).length <= 3)) return raw.data;
  return raw;
}

function applySafeDefaults(endpointKey, value) {
  if (endpointKey === "business" && !Array.isArray(value.manufacturingJobs)) {
    value.manufacturingJobs = [];
  }
  if (endpointKey === "news" && !Array.isArray(value.categories)) value.categories = ["All"];
  if (endpointKey === "store" && !Array.isArray(value.categories)) value.categories = ["All"];
  if (endpointKey === "market" && !Array.isArray(value.sectors)) value.sectors = ["All"];
  if (
    endpointKey === "progression" &&
    !Number.isSafeInteger(value.currentLevelXp) &&
    Number.isSafeInteger(value.xp) && value.xp >= 0
  ) value.currentLevelXp = 0;
  return value;
}

function validateWorldRuntime(value, context) {
  if (UUID.test(JSON.stringify(value))) throw invalidResponse("worldRuntime", context.requestId, context.path);
  if (typeof value.arrival.required !== "boolean") throw invalidResponse("worldRuntime", context.requestId, context.path);
  if (!(value.campaign === null || (typeof value.campaign === "object" && !Array.isArray(value.campaign)))) {
    throw invalidResponse("worldRuntime", context.requestId, context.path);
  }
  if (!(value.residency === null || (typeof value.residency === "object" && !Array.isArray(value.residency)))) {
    throw invalidResponse("worldRuntime", context.requestId, context.path);
  }
  if (!(value.world === null || (
    typeof value.world === "object" && !Array.isArray(value.world) &&
    Array.isArray(value.world.locations) && Array.isArray(value.world.routes)
  ))) throw invalidResponse("worldRuntime", context.requestId, context.path);
  if (!(value.travel.state === null || (typeof value.travel.state === "object" && !Array.isArray(value.travel.state)))) {
    throw invalidResponse("worldRuntime", context.requestId, context.path);
  }
}

function validateBusinessManufacturingJobs(value, context) {
  if (!Array.isArray(value.manufacturingJobs)) {
    throw invalidResponse("business", context.requestId, context.path);
  }
  for (const job of value.manufacturingJobs) {
    if (
      !job || typeof job !== "object" || Array.isArray(job) ||
      UUID.test(JSON.stringify(job)) ||
      !/^mfg_[0-9a-f]{32}$/u.test(String(job.jobKey || "")) ||
      !/^biz_[0-9a-f]{32}$/u.test(String(job.businessKey || "")) ||
      !/^bpr_[0-9a-f]{32}$/u.test(String(job.productKey || "")) ||
      !new Set(["queued", "in_progress", "completed", "cancelled", "failed"]).has(String(job.status || "")) ||
      !Number.isSafeInteger(job.quantity) || job.quantity < 1 ||
      !Number.isSafeInteger(job.completedOutputQuantity) ||
      job.completedOutputQuantity < 0 ||
      typeof job.canCancel !== "boolean"
    ) {
      throw invalidResponse("business", context.requestId, context.path);
    }
  }
}

function validateBusinessWorkforceUtilization(value, context) {
  const utilization = value.workforceUtilization;
  if (utilization === undefined || utilization === null) return;
  if (
    typeof utilization !== "object" || Array.isArray(utilization) ||
    UUID.test(JSON.stringify(utilization)) ||
    !/^biz_[0-9a-f]{32}$/u.test(String(utilization.businessKey || "")) ||
    !/^payroll:[1-9][0-9]*$/u.test(String(utilization.payrollPeriodKey || "")) ||
    !utilization.payroll || typeof utilization.payroll !== "object" || Array.isArray(utilization.payroll) ||
    !Array.isArray(utilization.employees)
  ) throw invalidResponse("business", context.requestId, context.path);

  for (const employee of utilization.employees) {
    if (
      !employee || typeof employee !== "object" || Array.isArray(employee) ||
      !/^emp_[0-9a-f]{32}$/u.test(String(employee.employeeKey || ""))
    ) throw invalidResponse("business", context.requestId, context.path);
    for (const key of [
      "capacityMinutes",
      "reservedMinutes",
      "consumedMinutes",
      "utilizedMinutes",
      "availableMinutes",
      "idleMinutes",
      "utilizationBasisPoints",
    ]) {
      if (!Number.isSafeInteger(employee[key]) || employee[key] < 0) {
        throw invalidResponse("business", context.requestId, context.path);
      }
    }
    if (
      employee.utilizationBasisPoints > 10000 ||
      employee.utilizedMinutes !== employee.reservedMinutes + employee.consumedMinutes ||
      employee.availableMinutes > employee.capacityMinutes ||
      employee.idleMinutes !== employee.availableMinutes
    ) throw invalidResponse("business", context.requestId, context.path);
  }
}

function finiteMoney(value, { allowNegative = false } = {}) {
  return typeof value === "number" && Number.isFinite(value) && (allowNegative || value >= 0);
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function round4(value) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function validateBusinessStockroom(value, context) {
  if (
    UUID.test(JSON.stringify(value)) ||
    !/^biz_[0-9a-f]{32}$/u.test(String(value.businessKey || "")) ||
    value.locations.length !== BUSINESS_STOCKROOM_LOCATION_KEYS.length
  ) throw invalidResponse("businessStockroom", context.requestId, context.path);

  const locations = new Map();
  for (const location of value.locations) {
    const locationKey = String(location?.locationKey || "");
    if (
      !location || typeof location !== "object" || Array.isArray(location) ||
      !/^iac_[0-9a-f]{32}$/u.test(String(location.accountKey || "")) ||
      !BUSINESS_STOCKROOM_LOCATION_KEYS.includes(locationKey) ||
      typeof location.label !== "string" || !location.label.trim() ||
      !Number.isSafeInteger(location.itemCount) || location.itemCount < 0 ||
      !finiteMoney(location.quantityOwned) ||
      !finiteMoney(location.quantityReserved) ||
      !finiteMoney(location.quantityAvailable) ||
      location.quantityReserved > location.quantityOwned ||
      round4(location.quantityOwned - location.quantityReserved) !== round4(location.quantityAvailable) ||
      locations.has(locationKey)
    ) throw invalidResponse("businessStockroom", context.requestId, context.path);
    locations.set(locationKey, location);
  }
  if (BUSINESS_STOCKROOM_LOCATION_KEYS.some((key) => !locations.has(key))) {
    throw invalidResponse("businessStockroom", context.requestId, context.path);
  }

  const aggregates = new Map(BUSINESS_STOCKROOM_LOCATION_KEYS.map((key) => [key, {
    itemCount: 0,
    quantityOwned: 0,
    quantityReserved: 0,
    quantityAvailable: 0,
  }]));
  const itemIdentities = new Set();
  for (const item of value.items) {
    const locationKey = String(item?.locationKey || "");
    const location = locations.get(locationKey);
    const identity = `${locationKey}:${String(item?.itemKey || "")}`;
    if (
      !item || typeof item !== "object" || Array.isArray(item) ||
      !location ||
      String(item.accountKey || "") !== location.accountKey ||
      !/^itm_[0-9a-f]{32}$/u.test(String(item.itemKey || "")) ||
      !/^[a-z0-9][a-z0-9._:-]{0,127}$/u.test(String(item.canonicalKey || "")) ||
      typeof item.name !== "string" || !item.name.trim() ||
      typeof item.itemClass !== "string" || !item.itemClass.trim() ||
      typeof item.subtype !== "string" || !item.subtype.trim() ||
      !finiteMoney(item.quantityOwned) ||
      !finiteMoney(item.quantityReserved) ||
      !finiteMoney(item.quantityAvailable) ||
      item.quantityReserved > item.quantityOwned ||
      round4(item.quantityOwned - item.quantityReserved) !== round4(item.quantityAvailable) ||
      !finiteMoney(item.averageUnitCost) ||
      !(
        item.costCurrencyCode === null ||
        /^[A-Z0-9_]{3,16}$/u.test(String(item.costCurrencyCode || ""))
      ) ||
      !Number.isSafeInteger(item.version) || item.version < 0 ||
      itemIdentities.has(identity)
    ) throw invalidResponse("businessStockroom", context.requestId, context.path);
    itemIdentities.add(identity);
    const aggregate = aggregates.get(locationKey);
    aggregate.itemCount += 1;
    aggregate.quantityOwned += item.quantityOwned;
    aggregate.quantityReserved += item.quantityReserved;
    aggregate.quantityAvailable += item.quantityAvailable;
  }

  for (const locationKey of BUSINESS_STOCKROOM_LOCATION_KEYS) {
    const location = locations.get(locationKey);
    const aggregate = aggregates.get(locationKey);
    if (
      location.itemCount !== aggregate.itemCount ||
      round4(location.quantityOwned) !== round4(aggregate.quantityOwned) ||
      round4(location.quantityReserved) !== round4(aggregate.quantityReserved) ||
      round4(location.quantityAvailable) !== round4(aggregate.quantityAvailable)
    ) throw invalidResponse("businessStockroom", context.requestId, context.path);
  }
}

function validateBusinessRecipes(value, context) {
  if (UUID.test(JSON.stringify(value))) {
    throw invalidResponse("businessRecipes", context.requestId, context.path);
  }
  const accessKeys = new Set();
  const recipeKeys = new Set();
  for (const recipe of value.recipes) {
    const availability = recipe?.availability;
    if (
      !recipe || typeof recipe !== "object" || Array.isArray(recipe) ||
      !/^bra_[0-9a-f]{32}$/u.test(String(recipe.accessKey || "")) ||
      !/^[a-z0-9][a-z0-9._:-]{0,127}$/u.test(String(recipe.recipeKey || "")) ||
      typeof recipe.name !== "string" || !recipe.name.trim() ||
      typeof recipe.category !== "string" || !recipe.category.trim() ||
      !Number.isSafeInteger(recipe.tier) || recipe.tier < 0 ||
      !Number.isSafeInteger(recipe.workshopTier) || recipe.workshopTier < 0 ||
      !Number.isSafeInteger(recipe.baseDurationSeconds) || recipe.baseDurationSeconds < 0 ||
      typeof recipe.difficultyProfile !== "string" || !recipe.difficultyProfile.trim() ||
      typeof recipe.description !== "string" ||
      !availability || typeof availability !== "object" || Array.isArray(availability) ||
      typeof availability.enabled !== "boolean" ||
      typeof availability.availableInBusinessCountry !== "boolean" ||
      typeof availability.availableNow !== "boolean" ||
      typeof availability.scarcityBand !== "string" || !availability.scarcityBand.trim() ||
      !finiteMoney(availability.eventDurationMultiplier) ||
      !finiteMoney(availability.routeDisruptionMultiplier) ||
      typeof recipe.sourceType !== "string" || !recipe.sourceType.trim() ||
      !validTimestamp(recipe.grantedAt) ||
      accessKeys.has(recipe.accessKey) ||
      recipeKeys.has(recipe.recipeKey)
    ) throw invalidResponse("businessRecipes", context.requestId, context.path);
    accessKeys.add(recipe.accessKey);
    recipeKeys.add(recipe.recipeKey);
  }
}

function validateBusinessStoreSales(value, context) {
  const snapshot = value.storeSales;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || UUID.test(JSON.stringify(snapshot))) {
    throw invalidResponse("business", context.requestId, context.path);
  }
  const configured = value.configured !== false;
  const businessKey = String(snapshot.businessKey || "");
  const currencyCode = String(snapshot.currencyCode || "");
  if (
    (configured && !/^biz_[0-9a-f]{32}$/u.test(businessKey)) ||
    (!configured && businessKey !== "") ||
    (configured && !/^[A-Z0-9_]{3,16}$/u.test(currencyCode)) ||
    (!configured && currencyCode !== "") ||
    !Array.isArray(snapshot.sales) ||
    !Array.isArray(snapshot.activity)
  ) throw invalidResponse("business", context.requestId, context.path);

  for (const key of ["recentReceiptCount", "recentQuantitySold"]) {
    if (!Number.isSafeInteger(snapshot[key]) || snapshot[key] < 0) {
      throw invalidResponse("business", context.requestId, context.path);
    }
  }
  for (const key of ["recentGrossRevenue", "recentCostOfGoodsSold"]) {
    if (!finiteMoney(snapshot[key])) throw invalidResponse("business", context.requestId, context.path);
  }
  if (!finiteMoney(snapshot.recentGrossMargin, { allowNegative: true })) {
    throw invalidResponse("business", context.requestId, context.path);
  }

  const salesByReceipt = new Map();
  const saleQuoteKeys = new Set();
  for (const sale of snapshot.sales) {
    if (
      !sale || typeof sale !== "object" || Array.isArray(sale) ||
      !/^spr_[0-9a-f]{32}$/u.test(String(sale.receiptKey || "")) ||
      !/^quote_[0-9a-f]{32}$/u.test(String(sale.quoteKey || "")) ||
      !/^sof_[0-9a-f]{32}$/u.test(String(sale.offerKey || "")) ||
      !/^[a-z0-9_-]{1,64}$/u.test(String(sale.itemKey || "")) ||
      !Number.isSafeInteger(sale.quantity) || sale.quantity < 1 ||
      !finiteMoney(sale.grossRevenue) || !finiteMoney(sale.costOfGoodsSold) ||
      !finiteMoney(sale.grossMargin, { allowNegative: true }) ||
      sale.grossMargin !== round4(sale.grossRevenue - sale.costOfGoodsSold) ||
      sale.currencyCode !== currencyCode || !validTimestamp(sale.completedAt)
    ) throw invalidResponse("business", context.requestId, context.path);
    if (salesByReceipt.has(sale.receiptKey) || saleQuoteKeys.has(sale.quoteKey)) {
      throw invalidResponse("business", context.requestId, context.path);
    }
    salesByReceipt.set(sale.receiptKey, sale);
    saleQuoteKeys.add(sale.quoteKey);
  }

  const activityKeys = new Set();
  const activityReceiptKeys = new Set();
  for (const activity of snapshot.activity) {
    if (
      !activity || typeof activity !== "object" || Array.isArray(activity) ||
      !/^bae_[0-9a-f]{32}$/u.test(String(activity.activityKey || "")) ||
      activity.eventType !== "business.store.sale.completed" ||
      activity.reasonCode !== "business_store_offer_purchase" ||
      !/^spr_[0-9a-f]{32}$/u.test(String(activity.receiptKey || "")) ||
      !/^quote_[0-9a-f]{32}$/u.test(String(activity.quoteKey || "")) ||
      !/^sof_[0-9a-f]{32}$/u.test(String(activity.offerKey || "")) ||
      !Number.isSafeInteger(activity.quantity) || activity.quantity < 1 ||
      !finiteMoney(activity.grossRevenue) || !finiteMoney(activity.costOfGoodsSold) ||
      !finiteMoney(activity.grossMargin, { allowNegative: true }) ||
      activity.grossMargin !== round4(activity.grossRevenue - activity.costOfGoodsSold) ||
      activity.currencyCode !== currencyCode || !validTimestamp(activity.occurredAt)
    ) throw invalidResponse("business", context.requestId, context.path);
    const sale = salesByReceipt.get(activity.receiptKey);
    if (
      activityKeys.has(activity.activityKey) ||
      activityReceiptKeys.has(activity.receiptKey) ||
      !sale ||
      activity.quoteKey !== sale.quoteKey || activity.offerKey !== sale.offerKey ||
      activity.quantity !== sale.quantity || activity.grossRevenue !== sale.grossRevenue ||
      activity.costOfGoodsSold !== sale.costOfGoodsSold || activity.grossMargin !== sale.grossMargin ||
      activity.currencyCode !== sale.currencyCode
    ) throw invalidResponse("business", context.requestId, context.path);
    activityKeys.add(activity.activityKey);
    activityReceiptKeys.add(activity.receiptKey);
  }
  if (activityReceiptKeys.size !== salesByReceipt.size) {
    throw invalidResponse("business", context.requestId, context.path);
  }

  const totals = snapshot.sales.reduce((result, sale) => ({
    quantity: result.quantity + sale.quantity,
    revenue: result.revenue + sale.grossRevenue,
    cost: result.cost + sale.costOfGoodsSold,
    margin: result.margin + sale.grossMargin,
  }), { quantity: 0, revenue: 0, cost: 0, margin: 0 });
  if (
    snapshot.recentReceiptCount !== snapshot.sales.length ||
    snapshot.recentQuantitySold !== totals.quantity ||
    snapshot.recentGrossRevenue !== round4(totals.revenue) ||
    snapshot.recentCostOfGoodsSold !== round4(totals.cost) ||
    snapshot.recentGrossMargin !== round4(totals.margin)
  ) throw invalidResponse("business", context.requestId, context.path);
}

function validateEndpointShape(endpointKey, value, context) {
  for (const key of REQUIRED_ARRAY_FIELDS[endpointKey] || []) {
    if (!Array.isArray(value[key])) throw invalidResponse(endpointKey, context.requestId, context.path);
  }
  for (const key of REQUIRED_OBJECT_FIELDS[endpointKey] || []) {
    if (!value[key] || typeof value[key] !== "object" || Array.isArray(value[key])) {
      throw invalidResponse(endpointKey, context.requestId, context.path);
    }
  }
  if (endpointKey === "worldRuntime") validateWorldRuntime(value, context);
  if (endpointKey === "business") {
    validateBusinessManufacturingJobs(value, context);
    validateBusinessWorkforceUtilization(value, context);
    validateBusinessStoreSales(value, context);
  }
  if (endpointKey === "businessStockroom") validateBusinessStockroom(value, context);
  if (endpointKey === "businessRecipes") validateBusinessRecipes(value, context);
  if (endpointKey === "store") validateStoreResponse(value, context);
  if (endpointKey === "businessWorkforce" && UUID.test(JSON.stringify(value))) {
    throw invalidResponse(endpointKey, context.requestId, context.path);
  }
  if (endpointKey === "progression") {
    if (
      !Number.isSafeInteger(value.level) || value.level < 1 || value.level > 20 ||
      !Number.isSafeInteger(value.xp) || value.xp < 0 ||
      !Number.isSafeInteger(value.currentLevelXp) || value.currentLevelXp < 0 ||
      value.currentLevelXp > value.xp ||
      !Number.isSafeInteger(value.nextLevelXp) || value.nextLevelXp < value.xp ||
      !Number.isSafeInteger(value.skillPoints) || value.skillPoints < 0 || value.skillPoints > 200 ||
      typeof value.playerName !== "string" || typeof value.title !== "string" || typeof value.summary !== "string"
    ) throw invalidResponse(endpointKey, context.requestId, context.path);
  }
  if (endpointKey === "notificationsPage") {
    const unreadCount = value.summary.unreadCount;
    const returned = value.page.returned;
    const hasMore = value.page.hasMore;
    const nextCursor = value.page.nextCursor;
    if (!Number.isSafeInteger(unreadCount) || unreadCount < 0 || !Number.isSafeInteger(returned) || returned < 0 || returned !== value.items.length || typeof hasMore !== "boolean" || !(nextCursor === null || typeof nextCursor === "string")) {
      throw invalidResponse(endpointKey, context.requestId, context.path);
    }
  }
}

export function normalizeApiResponse(endpointKey, raw, context = {}) {
  let value = sanitizeValue(unwrap(endpointKey, raw), context.config || {});
  if (!READ_ENDPOINTS.has(endpointKey)) return value;
  if (endpointKey === "businessTreasury") {
    return normalizeBusinessTreasurySnapshot(value);
  }
  if (ARRAY_READS.has(endpointKey)) {
    if (!Array.isArray(value)) throw invalidResponse(endpointKey, context.requestId, context.path);
  } else if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidResponse(endpointKey, context.requestId, context.path);
  }
  if (endpointKey === "session") {
    for (const key of ["displayName", "currencyCode"]) {
      if (typeof value[key] !== "string" || !value[key].trim()) throw invalidResponse(endpointKey, context.requestId, context.path);
    }
  }
  if (!ARRAY_READS.has(endpointKey)) {
    value = applySafeDefaults(endpointKey, value);
    validateEndpointShape(endpointKey, value, context);
  }
  return value;
}
