import {
  object,
  readJson,
  optionalText,
  firstDefined,
  optionalNumber,
  text,
} from "./mutationValues.ts";


export async function normalizeSettingsMutation(
  request: Request,
): Promise<any> {
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
  const attendanceWindow = firstDefined(body, [
    "attendanceWindow",
    "attendance",
  ]);
  const businessMarketWindow = firstDefined(body, [
    "businessMarketWindow",
    "businessMarket",
  ]);
  const stockMarketWindow = firstDefined(body, [
    "stockMarketWindow",
    "stockMarket",
  ]);
  const newsSchedule = firstDefined(body, ["newsSchedule", "news"]);

  if (difficultyPreset !== undefined) {
    gameSettings.difficultyPreset = difficultyPreset;
  }
  if (attendanceWindow !== undefined) {
    gameSettings.attendanceWindow = object(attendanceWindow);
  }
  if (businessMarketWindow !== undefined) {
    gameSettings.businessMarketWindow = object(businessMarketWindow);
  }
  if (stockMarketWindow !== undefined) {
    gameSettings.stockMarketWindow = object(stockMarketWindow);
  }
  if (newsSchedule !== undefined) {
    gameSettings.newsSchedule = object(newsSchedule);
  }

  const policyAliases = [
    ["priceMultiplier", "priceModifier", "price_modifier"],
    ["incomeMultiplier", "incomeModifier", "income_modifier"],
    ["shockFrequency", "eventVolatilityModifier", "event_volatility_modifier"],
    ["shockSeverity", "scarcityModifier", "scarcity_modifier"],
    ["tradeMultiplier", "tradeModifier", "trade_modifier"],
    [
      "recoverySupport",
      "bankruptcyProtection",
      "creditModifier",
      "credit_modifier",
    ],
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
    policySettings.custom_label = optionalText(body, ["customLabel"]) ||
      "Custom";
    policySettings.difficulty_policy_profile_id = null;
  } else if (difficultyPreset !== undefined) {
    policySettings.difficulty_preset = difficultyPreset.toLowerCase();
    policySettings.source = "preset";
  }

  return { gameSettings, policySettings };
}


export async function readDifficultyProfile(
  service: any,
  presetKey: string,
): Promise<Record<string, any>> {
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
  return profile.data;
}


export async function readDifficultyBaseline(
  service: any,
  gameId: string,
): Promise<Record<string, any>> {
  const settings = await service
    .from("game_settings")
    .select("difficulty_preset")
    .eq("game_session_id", gameId)
    .maybeSingle();
  if (settings.error) throw settings.error;
  const requestedPreset = text(settings.data?.difficulty_preset, "standard")
    .toLowerCase();
  const presetKey = !requestedPreset || requestedPreset === "custom"
    ? "standard"
    : requestedPreset;
  const profile = await readDifficultyProfile(service, presetKey);
  return {
    difficulty_policy_profile_id: profile.id,
    difficulty_preset: profile.preset_key,
    custom_label: null,
    source: "preset",
    price_modifier: profile.price_modifier,
    event_volatility_modifier: profile.event_volatility_modifier,
    scarcity_modifier: profile.scarcity_modifier,
    income_modifier: profile.income_modifier,
    trade_modifier: profile.trade_modifier,
    credit_modifier: profile.credit_modifier,
    status: "active",
    metadata: {},
  };
}


export async function applyDifficultyPolicy(
  service: any,
  gameId: string,
  policySettings: Record<string, any>,
): Promise<any> {
  if (!policySettings || Object.keys(policySettings).length === 0) return null;

  const existing = await service
    .from("game_difficulty_policy_settings")
    .select(
      "id,difficulty_policy_profile_id,difficulty_preset,custom_label,source,price_modifier,event_volatility_modifier,scarcity_modifier,income_modifier,trade_modifier,credit_modifier,status,metadata",
    )
    .eq("game_session_id", gameId)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const baseline = existing.data ||
    await readDifficultyBaseline(service, gameId);
  let patch: Record<string, any>;
  if (policySettings.source === "preset") {
    const presetKey = text(policySettings.difficulty_preset).toLowerCase();
    const profile = await readDifficultyProfile(service, presetKey);
    patch = {
      difficulty_policy_profile_id: profile.id,
      difficulty_preset: profile.preset_key,
      custom_label: null,
      source: "preset",
      price_modifier: profile.price_modifier,
      event_volatility_modifier: profile.event_volatility_modifier,
      scarcity_modifier: profile.scarcity_modifier,
      income_modifier: profile.income_modifier,
      trade_modifier: profile.trade_modifier,
      credit_modifier: profile.credit_modifier,
      status: "active",
    };
  } else {
    patch = {
      price_modifier: policySettings.price_modifier ?? baseline.price_modifier,
      event_volatility_modifier: policySettings.event_volatility_modifier ??
        baseline.event_volatility_modifier,
      scarcity_modifier: policySettings.scarcity_modifier ??
        baseline.scarcity_modifier,
      income_modifier: policySettings.income_modifier ??
        baseline.income_modifier,
      trade_modifier: policySettings.trade_modifier ?? baseline.trade_modifier,
      credit_modifier: policySettings.credit_modifier ??
        baseline.credit_modifier,
      difficulty_policy_profile_id: null,
      difficulty_preset: "custom",
      custom_label: text(policySettings.custom_label, "Custom"),
      source: "custom",
      status: "active",
    };
  }

  if (existing.data) {
    const result = await service
      .from("game_difficulty_policy_settings")
      .update(patch)
      .eq("game_session_id", gameId)
      .select("*")
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }

  const result = await service
    .from("game_difficulty_policy_settings")
    .insert({
      game_session_id: gameId,
      ...patch,
      metadata: object(baseline.metadata),
    })
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
