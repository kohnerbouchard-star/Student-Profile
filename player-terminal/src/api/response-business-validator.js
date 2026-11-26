import { ApiRequestError } from "./errors.js";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const BUSINESS_STOCKROOM_LOCATION_KEYS = Object.freeze(["warehouse", "work_in_progress", "finished_goods", "in_transit"]);
function invalidResponse(endpointKey, requestId, path) {
  return new ApiRequestError("This section received incomplete data and could not be opened safely.", {
    code: "INVALID_RESPONSE", endpointKey, requestId, path,
  });
}
function validateBusinessManufacturingJobs(value, context) {
  if (!Array.isArray(value.manufacturingJobs)) throw invalidResponse("business", context.requestId, context.path);
  for (const job of value.manufacturingJobs) {
    if (
      !job || typeof job !== "object" || Array.isArray(job) || UUID.test(JSON.stringify(job)) ||
      !/^mfg_[0-9a-f]{32}$/u.test(String(job.jobKey || "")) ||
      !/^biz_[0-9a-f]{32}$/u.test(String(job.businessKey || "")) ||
      !/^bpr_[0-9a-f]{32}$/u.test(String(job.productKey || "")) ||
      !new Set(["queued", "in_progress", "completed", "cancelled", "failed"]).has(String(job.status || "")) ||
      !Number.isSafeInteger(job.quantity) || job.quantity < 1 ||
      !Number.isSafeInteger(job.completedOutputQuantity) || job.completedOutputQuantity < 0 ||
      typeof job.canCancel !== "boolean"
    ) throw invalidResponse("business", context.requestId, context.path);
  }
}
function validateBusinessWorkforceUtilization(value, context) {
  const utilization = value.workforceUtilization;
  if (utilization === undefined || utilization === null) return;
  if (
    typeof utilization !== "object" || Array.isArray(utilization) || UUID.test(JSON.stringify(utilization)) ||
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
    for (const key of ["capacityMinutes", "reservedMinutes", "consumedMinutes", "utilizedMinutes", "availableMinutes", "idleMinutes", "utilizationBasisPoints"]) {
      if (!Number.isSafeInteger(employee[key]) || employee[key] < 0) throw invalidResponse("business", context.requestId, context.path);
    }
    if (
      employee.utilizationBasisPoints > 10000 ||
      employee.utilizedMinutes !== employee.reservedMinutes + employee.consumedMinutes ||
      employee.availableMinutes > employee.capacityMinutes || employee.idleMinutes !== employee.availableMinutes
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
export function validateBusinessStockroom(value, context) {
  if (
    UUID.test(JSON.stringify(value)) || !/^biz_[0-9a-f]{32}$/u.test(String(value.businessKey || "")) ||
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
      !finiteMoney(location.quantityOwned) || !finiteMoney(location.quantityReserved) || !finiteMoney(location.quantityAvailable) ||
      location.quantityReserved > location.quantityOwned ||
      round4(location.quantityOwned - location.quantityReserved) !== round4(location.quantityAvailable) ||
      locations.has(locationKey)
    ) throw invalidResponse("businessStockroom", context.requestId, context.path);
    locations.set(locationKey, location);
  }
  if (BUSINESS_STOCKROOM_LOCATION_KEYS.some((key) => !locations.has(key))) throw invalidResponse("businessStockroom", context.requestId, context.path);
  const aggregates = new Map(BUSINESS_STOCKROOM_LOCATION_KEYS.map((key) => [key, {
    itemCount: 0, quantityOwned: 0, quantityReserved: 0, quantityAvailable: 0,
  }]));
  const itemIdentities = new Set();
  for (const item of value.items) {
    const locationKey = String(item?.locationKey || "");
    const location = locations.get(locationKey);
    const identity = `${locationKey}:${String(item?.itemKey || "")}`;
    if (
      !item || typeof item !== "object" || Array.isArray(item) || !location ||
      String(item.accountKey || "") !== location.accountKey ||
      !/^itm_[0-9a-f]{32}$/u.test(String(item.itemKey || "")) ||
      !/^[a-z0-9][a-z0-9._:-]{0,127}$/u.test(String(item.canonicalKey || "")) ||
      typeof item.name !== "string" || !item.name.trim() ||
      typeof item.itemClass !== "string" || !item.itemClass.trim() ||
      typeof item.subtype !== "string" || !item.subtype.trim() ||
      !finiteMoney(item.quantityOwned) || !finiteMoney(item.quantityReserved) || !finiteMoney(item.quantityAvailable) ||
      item.quantityReserved > item.quantityOwned ||
      round4(item.quantityOwned - item.quantityReserved) !== round4(item.quantityAvailable) ||
      !finiteMoney(item.averageUnitCost) ||
      !(item.costCurrencyCode === null || /^[A-Z0-9_]{3,16}$/u.test(String(item.costCurrencyCode || ""))) ||
      !Number.isSafeInteger(item.version) || item.version < 0 || itemIdentities.has(identity)
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
export function validateBusinessRecipes(value, context) {
  if (UUID.test(JSON.stringify(value))) throw invalidResponse("businessRecipes", context.requestId, context.path);
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
      typeof availability.enabled !== "boolean" || typeof availability.availableInBusinessCountry !== "boolean" ||
      typeof availability.availableNow !== "boolean" || typeof availability.scarcityBand !== "string" || !availability.scarcityBand.trim() ||
      !finiteMoney(availability.eventDurationMultiplier) || !finiteMoney(availability.routeDisruptionMultiplier) ||
      typeof recipe.sourceType !== "string" || !recipe.sourceType.trim() || !validTimestamp(recipe.grantedAt) ||
      accessKeys.has(recipe.accessKey) || recipeKeys.has(recipe.recipeKey)
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
    (configured && !/^biz_[0-9a-f]{32}$/u.test(businessKey)) || (!configured && businessKey !== "") ||
    (configured && !/^[A-Z0-9_]{3,16}$/u.test(currencyCode)) || (!configured && currencyCode !== "") ||
    !Array.isArray(snapshot.sales) || !Array.isArray(snapshot.activity)
  ) throw invalidResponse("business", context.requestId, context.path);
  for (const key of ["recentReceiptCount", "recentQuantitySold"]) {
    if (!Number.isSafeInteger(snapshot[key]) || snapshot[key] < 0) throw invalidResponse("business", context.requestId, context.path);
  }
  for (const key of ["recentGrossRevenue", "recentCostOfGoodsSold"]) {
    if (!finiteMoney(snapshot[key])) throw invalidResponse("business", context.requestId, context.path);
  }
  if (!finiteMoney(snapshot.recentGrossMargin, { allowNegative: true })) throw invalidResponse("business", context.requestId, context.path);
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
    if (salesByReceipt.has(sale.receiptKey) || saleQuoteKeys.has(sale.quoteKey)) throw invalidResponse("business", context.requestId, context.path);
    salesByReceipt.set(sale.receiptKey, sale);
    saleQuoteKeys.add(sale.quoteKey);
  }
  const activityKeys = new Set();
  const activityReceiptKeys = new Set();
  for (const activity of snapshot.activity) {
    if (
      !activity || typeof activity !== "object" || Array.isArray(activity) ||
      !/^bae_[0-9a-f]{32}$/u.test(String(activity.activityKey || "")) ||
      activity.eventType !== "business.store.sale.completed" || activity.reasonCode !== "business_store_offer_purchase" ||
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
      activityKeys.has(activity.activityKey) || activityReceiptKeys.has(activity.receiptKey) || !sale ||
      activity.quoteKey !== sale.quoteKey || activity.offerKey !== sale.offerKey || activity.quantity !== sale.quantity ||
      activity.grossRevenue !== sale.grossRevenue || activity.costOfGoodsSold !== sale.costOfGoodsSold ||
      activity.grossMargin !== sale.grossMargin || activity.currencyCode !== sale.currencyCode
    ) throw invalidResponse("business", context.requestId, context.path);
    activityKeys.add(activity.activityKey);
    activityReceiptKeys.add(activity.receiptKey);
  }
  if (activityReceiptKeys.size !== salesByReceipt.size) throw invalidResponse("business", context.requestId, context.path);
  const totals = snapshot.sales.reduce((result, sale) => ({
    quantity: result.quantity + sale.quantity,
    revenue: result.revenue + sale.grossRevenue,
    cost: result.cost + sale.costOfGoodsSold,
    margin: result.margin + sale.grossMargin,
  }), { quantity: 0, revenue: 0, cost: 0, margin: 0 });
  if (
    snapshot.recentReceiptCount !== snapshot.sales.length || snapshot.recentQuantitySold !== totals.quantity ||
    snapshot.recentGrossRevenue !== round4(totals.revenue) || snapshot.recentCostOfGoodsSold !== round4(totals.cost) ||
    snapshot.recentGrossMargin !== round4(totals.margin)
  ) throw invalidResponse("business", context.requestId, context.path);
}
export function validateBusinessRead(value, context) {
  validateBusinessManufacturingJobs(value, context);
  validateBusinessWorkforceUtilization(value, context);
  validateBusinessStoreSales(value, context);
}
