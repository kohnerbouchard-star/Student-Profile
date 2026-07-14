function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

async function readJson(request: Request): Promise<Record<string, any>> {
  try {
    return object(await request.json());
  } catch {
    return {};
  }
}

function firstDefined(record: Record<string, any>, keys: readonly string[]): any {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function optionalText(record: Record<string, any>, keys: readonly string[]): string | undefined {
  const value = firstDefined(record, keys);
  if (value === undefined || value === null) return undefined;
  const normalized = text(value);
  return normalized || undefined;
}

function optionalNumber(record: Record<string, any>, keys: readonly string[]): number | undefined {
  const value = firstDefined(record, keys);
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = number(value, Number.NaN);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function optionalInteger(record: Record<string, any>, keys: readonly string[]): number | undefined {
  const value = optionalNumber(record, keys);
  return value === undefined ? undefined : Math.max(0, Math.trunc(value));
}

function compactObject(record: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function slug(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function normalizeStoreMutation(request: Request, method: string): Promise<any> {
  const source = object(await readJson(request));
  const body = object(source.item || source.storeItem || source.payload || source);
  const normalized: Record<string, any> = {};

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
  if (itemKey !== undefined && method === "POST") {
    normalized.itemKey = slug(itemKey).slice(0, 64);
  }

  if (method === "DELETE") {
    return { method: "PATCH", body: { status: "archived", visibility: "hidden" } };
  }

  return { method: method === "PUT" ? "PATCH" : method, body: normalized };
}

function normalizeTargeting(body: Record<string, any>): Record<string, any> {
  const explicit = object(body.targetingPayload || body.targeting);
  const locations = array(
    firstDefined(body, ["locations", "countries", "countryCodes", "targetLocations"]),
  ).map((value) => text(object(value).code || object(value).countryCode || value))
    .filter(Boolean);
  const allPlayers = explicit.allPlayers === true ||
    locations.some((value) => ["all", "all locations", "all countries"].includes(value.toLowerCase()));
  const countryCodes = locations
    .filter((value) => !["all", "all locations", "all countries"].includes(value.toLowerCase()))
    .map((value) => value.toUpperCase());

  return compactObject({
    ...explicit,
    allPlayers: allPlayers || explicit.allPlayers === true ? true : undefined,
    countryCodes: countryCodes.length ? [...new Set(countryCodes)] : explicit.countryCodes,
    playerIds: array(body.playerIds).length ? array(body.playerIds) : explicit.playerIds,
    rosterLabels: array(body.rosterLabels).length ? array(body.rosterLabels) : explicit.rosterLabels,
  });
}

function normalizeContractRewards(body: Record<string, any>): Record<string, any> {
  const explicit = object(body.rewardPayload || body.rewards);
  const explicitCash = object(explicit.cash || body.cashReward);
  const cashAmount = optionalNumber(explicitCash, ["amount", "value"]) ??
    optionalNumber(body, ["cashRewardAmount", "rewardCash", "cashAmount", "rewardAmount"]);
  const currencyCode = optionalText(explicitCash, ["currencyCode", "currency"]) ||
    optionalText(body, ["rewardCurrencyCode", "currencyCode", "currency"]) ||
    "ECO";

  const rawItems = array(explicit.items).length
    ? array(explicit.items)
    : array(firstDefined(body, ["itemRewards", "rewardItems", "attachedItemRewards"]));
  const items = rawItems.map((value) => {
    const item = object(value);
    const storeItemId = optionalText(item, ["storeItemId", "itemUuid", "id", "value"]);
    const quantity = optionalInteger(item, ["quantity", "qty", "amount"]);
    if (!storeItemId || !quantity || quantity < 1) return null;
    return { storeItemId, quantity };
  }).filter(Boolean);

  return compactObject({
    cash: cashAmount !== undefined && cashAmount > 0
      ? {
          amount: Math.round(cashAmount * 100) / 100,
          accountType: optionalText(explicitCash, ["accountType"]) || "cash",
          currencyCode: currencyCode.toUpperCase(),
        }
      : explicit.cash === null ? null : undefined,
    items: items.length ? items : undefined,
  });
}

export async function normalizeContractCreate(request: Request): Promise<Record<string, any>> {
  const source = object(await readJson(request));
  const body = object(source.contract || source.assignment || source.payload || source);
  const title = optionalText(body, ["title", "name"]) || "";
  const instructions = optionalText(body, ["instructions", "details", "taskInstructions"]) || "";
  const description = optionalText(body, ["description", "summary"]) || instructions;
  const scheduledAt = optionalText(body, ["scheduledAt", "scheduleAt", "postAt", "publishAt"]);
  const requestedStatus = (optionalText(body, ["status", "publishStatus"]) || "").toLowerCase();
  const status = scheduledAt
    ? "scheduled"
    : ["draft", "scheduled", "active"].includes(requestedStatus)
      ? requestedStatus
      : body.publishNow === true
        ? "active"
        : "draft";
  const targetingPayload = normalizeTargeting(body);
  const metadata = {
    ...object(body.metadata),
    materials: array(firstDefined(body, ["materials", "attachments", "resources"])),
    submissionRequirements: array(
      firstDefined(body, ["submissionRequirements", "studentWork", "requiredSubmissions"]),
    ),
  };
  const rewardPayload = normalizeContractRewards(body);
  const explicitRequirements = object(body.requirementsPayload || body.requirements);
  const requirementsPayload = compactObject({
    ...explicitRequirements,
    manualText: explicitRequirements.manualText || instructions || undefined,
  });
  const suppliedKey = optionalText(body, ["contractKey", "key", "slug"]);
  const generatedKey = `${slug(title) || "contract"}-${crypto.randomUUID().slice(0, 8)}`;
  const visibility = optionalText(body, ["visibility"]) ||
    (targetingPayload.allPlayers === true ? "public" : "targeted");

  return compactObject({
    contractKey: suppliedKey ? slug(suppliedKey).slice(0, 64) : generatedKey,
    title,
    description,
    instructions,
    category: optionalText(body, ["category"]) || "general",
    status,
    visibility,
    targetingPayload,
    requirementsPayload,
    rewardPayload,
    completionMode: optionalText(body, ["completionMode"]) || "manual_review",
    publishedAt: scheduledAt || optionalText(body, ["publishedAt"]),
    deadlineAt: optionalText(body, ["deadlineAt", "deadline", "dueAt", "dueDate"]),
    expiresAt: optionalText(body, ["expiresAt", "expirationAt"]),
    metadata,
  });
}

export async function normalizeContractReview(request: Request): Promise<Record<string, any>> {
  const source = object(await readJson(request));
  const body = object(source.review || source.payload || source);
  const rawAction = (optionalText(body, ["action", "decision", "status"]) || "").toLowerCase();
  const actionMap: Record<string, string> = {
    approve: "approve",
    approved: "approve",
    complete: "approve",
    completed: "approve",
    accept: "approve",
    accepted: "approve",
    reject: "reject",
    rejected: "reject",
    fail: "reject",
    failed: "reject",
    request_revision: "request_revision",
    revision: "request_revision",
    revise: "request_revision",
    changes_requested: "request_revision",
  };
  const feedback = optionalText(body, ["feedback", "comment", "note", "message"]);
  return {
    action: actionMap[rawAction] || rawAction,
    resultPayload: {
      ...object(body.resultPayload || body.result),
      ...(feedback ? { feedback } : {}),
    },
  };
}

export async function normalizeSettingsMutation(request: Request): Promise<any> {
  const source = object(await readJson(request));
  const body = object(source.settings || source.payload || source);
  const gameSettings: Record<string, any> = {};
  const policySettings: Record<string, any> = {};

  const difficultyPreset = optionalText(body, [
    "difficultyPreset",
    "difficulty",
    "preset",
    "difficultyBasePreset",
  ]);
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
    if (value !== undefined) {
      policySettings[policyColumns[index]] = Math.min(2, Math.max(0.5, value));
    }
  });

  if (Object.keys(policySettings).length > 0) {
    policySettings.difficulty_preset = "custom";
    policySettings.source = "custom";
    policySettings.custom_label = optionalText(body, ["customLabel"]) || "Custom";
    policySettings.difficulty_policy_profile_id = null;
  } else if (difficultyPreset !== undefined) {
    policySettings.difficulty_preset = difficultyPreset.toLowerCase();
    policySettings.source = "preset";
  }

  return { gameSettings, policySettings };
}

export async function applyDifficultyPolicy(service: any, gameId: string, policySettings: Record<string, any>): Promise<any> {
  if (!policySettings || Object.keys(policySettings).length === 0) return null;

  const existing = await service
    .from("game_difficulty_policy_settings")
    .select(
      "id,difficulty_policy_profile_id,difficulty_preset,custom_label,source,price_modifier,event_volatility_modifier,scarcity_modifier,income_modifier,trade_modifier,credit_modifier,status,metadata",
    )
    .eq("game_session_id", gameId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) throw new Error("difficulty_policy_settings_not_found");

  let patch: Record<string, any>;
  if (policySettings.source === "preset") {
    const presetKey = text(policySettings.difficulty_preset).toLowerCase();
    const profile = await service
      .from("difficulty_policy_profiles")
      .select(
        "id,preset_key,label,price_modifier,event_volatility_modifier,scarcity_modifier,income_modifier,trade_modifier,credit_modifier,status",
      )
      .eq("preset_key", presetKey)
      .eq("status", "active")
      .maybeSingle();
    if (profile.error) throw profile.error;
    if (!profile.data) throw new Error("difficulty_policy_profile_not_found");

    patch = {
      difficulty_policy_profile_id: profile.data.id,
      difficulty_preset: profile.data.preset_key,
      custom_label: null,
      source: "preset",
      price_modifier: profile.data.price_modifier,
      event_volatility_modifier: profile.data.event_volatility_modifier,
      scarcity_modifier: profile.data.scarcity_modifier,
      income_modifier: profile.data.income_modifier,
      trade_modifier: profile.data.trade_modifier,
      credit_modifier: profile.data.credit_modifier,
      status: "active",
    };
  } else {
    patch = {
      ...policySettings,
      difficulty_policy_profile_id: null,
      difficulty_preset: "custom",
      custom_label: text(policySettings.custom_label, "Custom"),
      source: "custom",
      status: "active",
    };
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
