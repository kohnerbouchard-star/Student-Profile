import { number, object, readJson, text } from "./common.ts";
import { loadSettings } from "./reads.ts";

export function normalizeCreatePlayerBody(body) {
  return {
    displayName: text(body.displayName || body.name || body.playerName || body.fullName),
    rosterLabel: text(body.rosterLabel || body.label || body.studentId || body.studentNumber || body.identifier) || null,
  };
}

export function normalizeAttendanceScanBody(body) {
  return {
    playerId: text(body.playerId || body.playerID || body.accessCode || body.studentCode || body.code || body.value || body.scanValue),
    deviceTimezone: text(body.deviceTimezone || body.timezone || body.timeZone || body.deviceTimeZone) || "Asia/Seoul",
  };
}

export function normalizeStoreBody(body, mode) {
  const result = {};
  const name = text(body.name || body.title || body.itemName);
  if (mode === "create" || name) result.name = name;
  if (mode === "create" || body.description !== undefined) result.description = text(body.description) || null;
  if (mode === "create" || body.category !== undefined) result.category = text(body.category, "general").toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  if (mode === "create" || body.price !== undefined || body.basePrice !== undefined || body.cost !== undefined) result.price = number(body.price ?? body.basePrice ?? body.cost);
  if (mode === "create" || body.currencyCode !== undefined || body.currency !== undefined) result.currencyCode = text(body.currencyCode || body.currency || body.priceCurrency, "NRC").toUpperCase();
  if (mode === "create" || body.stockQuantity !== undefined || body.stock !== undefined || body.quantity !== undefined) result.stockQuantity = Math.max(0, Math.floor(number(body.stockQuantity ?? body.stock ?? body.quantity)));
  if (mode === "create" || body.status !== undefined) result.status = text(body.status, "active").toLowerCase();
  if (mode === "create" || body.visibility !== undefined) result.visibility = text(body.visibility, "visible").toLowerCase();
  if (mode === "create" || body.sortOrder !== undefined || body.order !== undefined) result.sortOrder = Math.floor(number(body.sortOrder ?? body.order));
  if (mode === "create") {
    const key = text(body.itemKey || body.key || body.sku).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
    if (key) result.itemKey = key;
  }
  return result;
}

export function normalizeContractBody(body) {
  const sourceMetadata = object(body.metadata);
  const metadata = {
    ...sourceMetadata,
    materials: body.materials || body.contractMaterials || sourceMetadata.materials || [],
    submissionRequirements: body.submissionRequirements || body.submissionRequirement || sourceMetadata.submissionRequirements || [],
  };
  const contractKey = text(body.contractKey || body.key).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || `teacher_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const scheduleAt = body.scheduleAt || body.scheduledAt || body.publishAt || null;
  const itemRewards = body.itemRewards || body.rewardItems || [];
  return {
    contractKey,
    sourceType: "teacher",
    title: text(body.title || body.name, "Untitled contract"),
    description: text(body.description),
    instructions: text(body.instructions || body.details),
    category: text(body.category, "general").toLowerCase(),
    status: text(body.status || (scheduleAt ? "scheduled" : "draft"), "draft").toLowerCase(),
    visibility: text(body.visibility, "public").toLowerCase(),
    targetingPayload: body.targetingPayload || body.targeting || {
      allPlayers: body.allPlayers !== false && !(body.countryCodes || body.locations || body.playerIds),
      countryCodes: body.countryCodes || body.locations || [],
      playerIds: body.playerIds || [],
    },
    requirementsPayload: body.requirementsPayload || body.requirements || { manualText: text(body.requirementText) },
    rewardPayload: body.rewardPayload || body.rewards || {
      cash: number(body.rewardAmount ?? body.cashReward) > 0 ? { amount: number(body.rewardAmount ?? body.cashReward), currencyCode: text(body.rewardCurrencyCode || body.currencyCode, "NRC") } : undefined,
      items: itemRewards,
    },
    completionMode: text(body.completionMode, "manual_review"),
    publishedAt: body.publishedAt || scheduleAt || null,
    deadlineAt: body.deadlineAt || body.deadline || null,
    expiresAt: body.expiresAt || null,
    metadata,
  };
}

export async function updateSettings(request, context, gameId) {
  const body = await readJson(request);
  const difficulty = text(body.difficultyPreset || body.difficulty || body.backendDifficultyPreset || body.difficultyBasePreset).toLowerCase();
  const gamePatch = {};
  if (difficulty && difficulty !== "custom") gamePatch.difficulty_preset = difficulty;
  if (body.attendanceWindow) gamePatch.attendance_window = body.attendanceWindow;
  if (body.businessMarketWindow) gamePatch.business_market_window = body.businessMarketWindow;
  if (body.stockMarketWindow) gamePatch.stock_market_window = body.stockMarketWindow;
  if (body.newsSchedule) gamePatch.news_schedule = body.newsSchedule;
  if (Object.keys(gamePatch).length) {
    const result = await context.service.from("game_settings").update(gamePatch).eq("game_session_id", gameId);
    if (result.error) throw result.error;
  }

  const policyPatch = {};
  const mappings = {
    priceMultiplier: "price_modifier",
    incomeMultiplier: "income_modifier",
    shockFrequency: "event_volatility_modifier",
    shockSeverity: "scarcity_modifier",
    tradeMultiplier: "trade_modifier",
    recoverySupport: "credit_modifier",
    bankruptcyProtection: "credit_modifier",
  };
  for (const [input, column] of Object.entries(mappings)) {
    if (body[input] !== undefined && Number.isFinite(Number(body[input]))) {
      policyPatch[column] = Math.min(2, Math.max(0.5, number(body[input], 1)));
    }
  }

  if (difficulty && difficulty !== "custom") {
    const preset = await context.service.from("difficulty_policy_profiles").select("*").eq("preset_key", difficulty).eq("status", "active").maybeSingle();
    if (preset.error) throw preset.error;
    if (!preset.data) throw new Error("Difficulty preset was not found.");
    Object.assign(policyPatch, {
      difficulty_policy_profile_id: preset.data.id,
      difficulty_preset: preset.data.preset_key,
      source: "preset",
      custom_label: null,
      price_modifier: policyPatch.price_modifier ?? number(preset.data.price_modifier, 1),
      event_volatility_modifier: policyPatch.event_volatility_modifier ?? number(preset.data.event_volatility_modifier, 1),
      scarcity_modifier: policyPatch.scarcity_modifier ?? number(preset.data.scarcity_modifier, 1),
      income_modifier: policyPatch.income_modifier ?? number(preset.data.income_modifier, 1),
      trade_modifier: policyPatch.trade_modifier ?? number(preset.data.trade_modifier, 1),
      credit_modifier: policyPatch.credit_modifier ?? number(preset.data.credit_modifier, 1),
    });
  } else if (difficulty === "custom" || Object.keys(policyPatch).length) {
    Object.assign(policyPatch, {
      difficulty_policy_profile_id: null,
      difficulty_preset: "custom",
      custom_label: "Custom",
      source: "custom",
    });
  }

  if (Object.keys(policyPatch).length) {
    const result = await context.service.from("game_difficulty_policy_settings").update(policyPatch).eq("game_session_id", gameId);
    if (result.error) throw result.error;
  }
  return loadSettings(context.service, gameId);
}

export async function archiveContract(context, gameId, contractId) {
  const result = await context.service.from("game_session_contracts").update({ status: "archived" }).eq("game_session_id", gameId).eq("id", contractId).select("*").maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  const audit = await context.service.from("audit_log").insert({
    game_session_id: gameId,
    actor_type: "staff",
    actor_id: context.staff.id,
    action: "contract.archived",
    target_type: "game_session_contract",
    target_id: contractId,
    metadata: { source: "admin_api" },
  });
  if (audit.error) throw audit.error;
  return result.data;
}
