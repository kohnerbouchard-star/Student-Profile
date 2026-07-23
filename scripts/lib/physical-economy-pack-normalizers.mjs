import {
  COUNTRY_CODES, DIFFICULTIES, DISABLED_EFFECT_TOKENS, ITEM_CLASSES, ITEM_KEY,
  RECIPE_KEY, SAFE_EFFECT_CODES,
} from "./physical-economy-pack-policy.mjs";
import {
  arrayFrom, assertSchema, assertUnique, boundedInteger, by, decimalRatio,
  inferClass, normalizeEnum, nullableCountry, nullableText, objectValue,
  relative, requireObject, requiredArray, stringArray, text, tierFromFile,
} from "./physical-economy-pack-utils.mjs";

export function normalizeItem(raw, file, sourceRoot) {
  requireObject(raw, `item in ${file}`);
  const itemKey = text(raw.itemKey ?? raw.key).toLowerCase();
  if (!ITEM_KEY.test(itemKey)) throw new Error(`Invalid item key ${itemKey} in ${file}`);
  const inferredClass = inferClass(file, raw);
  const itemClass = text(raw.itemClass ?? raw.class ?? raw.category ?? inferredClass).toLowerCase();
  if (!ITEM_CLASSES.has(itemClass)) throw new Error(`Invalid item class ${itemClass} for ${itemKey}`);
  const sourceCountryCode = nullableCountry(
    raw.sourceCountryCode ?? raw.sourceCountry ?? raw.countryCode ?? raw.source,
  );
  const effectCode = nullableText(raw.effectCode ?? raw.effect?.code)?.toUpperCase() ?? null;
  const disabledEffect = effectCode !== null &&
    DISABLED_EFFECT_TOKENS.some((token) => effectCode.includes(token));
  const equipmentSlot = itemClass === "equipment"
    ? normalizeEnum(
      raw.equipmentSlot ?? raw.slot ?? raw.metadata?.equipmentSlot,
      ["field", "utility", "analysis", "operations"],
      "utility",
    )
    : null;
  const durationSeconds = boundedInteger(
    raw.effect?.durationSeconds ?? raw.effectDurationSeconds ?? 0,
    0,
    2_592_000,
  );
  const cooldownSeconds = boundedInteger(
    raw.effect?.cooldownSeconds ?? raw.cooldownSeconds ?? 0,
    0,
    2_592_000,
  );
  const stackingRule = normalizeEnum(
    raw.effect?.stackingRule ?? raw.stackingRule,
    ["nonstacking", "refresh", "max", "add_bounded", "replace"],
    "nonstacking",
  );
  const effectScope = normalizeEnum(
    raw.effect?.scope ?? raw.effectScope,
    ["player", "account", "contract", "crafting", "market", "country"],
    "player",
  );
  const scarcityBand = text(raw.scarcityPolicy?.band ?? raw.scarcity ?? "available").toLowerCase();
  return {
    itemKey,
    name: text(raw.name ?? raw.displayName ?? itemKey),
    description: nullableText(raw.description) ?? "",
    itemClass,
    subtype: text(raw.subtype ?? raw.type ?? "general").toLowerCase(),
    sourceCountryCode,
    currencyCode: text(raw.currencyCode ?? raw.currency ?? "SOURCE-COUNTRY").toUpperCase(),
    stackable: itemClass !== "equipment" && !["blueprint", "authorization"].includes(itemClass),
    equipmentSlot,
    effectCode,
    effectEnabled: Boolean(effectCode) && !disabledEffect && SAFE_EFFECT_CODES.has(effectCode),
    toolTags: stringArray(raw.toolTags ?? raw.tags ?? []),
    scarcityPolicy: objectValue(raw.scarcityPolicy, {
      band: scarcityBand,
      sourceDefinition: raw.scarcity ?? null,
    }),
    availabilityPolicy: objectValue(raw.availabilityPolicy, {
      countryCodes: sourceCountryCode ? [sourceCountryCode] : [],
      sourceCountryCode,
    }),
    effect: effectCode
      ? {
        scope: effectScope,
        durationSeconds,
        stackingRule,
        maxStacks: boundedInteger(raw.effect?.maxStacks ?? raw.maxStacks ?? 1, 1, 20),
        cooldownSeconds,
        summary: nullableText(raw.effect?.summary ?? raw.effectSummary) ??
          (disabledEffect
            ? "Repair, maintenance, and durability effects are disabled."
            : SAFE_EFFECT_CODES.has(effectCode)
            ? "Approved bounded item effect."
            : "Effect is definition-only until a reviewed handler is approved."),
      }
      : null,
    metadata: {
      sourceFile: relative(file, sourceRoot),
      sourceDefinition: raw,
      durabilityEnabled: false,
      repairEnabled: false,
    },
  };
}

export function normalizeRecipe(raw, file, itemByKey, sourceRoot) {
  requireObject(raw, `recipe in ${file}`);
  const recipeKey = text(raw.recipeKey ?? raw.key).toLowerCase();
  if (!RECIPE_KEY.test(recipeKey)) throw new Error(`Invalid recipe key ${recipeKey} in ${file}`);
  const inputsRaw = arrayFrom(raw, ["inputs", "ingredients", "materials"]);
  const outputsRaw = arrayFrom(raw, ["outputs", "results"]);
  if (!inputsRaw.length || !outputsRaw.length) throw new Error(`${recipeKey} must have inputs and outputs`);
  const inputs = inputsRaw.map((line, index) => normalizeInput(line, index, recipeKey));
  const outputs = outputsRaw.map((line, index) =>
    normalizeOutput(line, index, recipeKey, itemByKey)
  );
  const tier = boundedInteger(raw.tier ?? tierFromFile(file), 1, 10);
  const countryCodes = stringArray(
    raw.countryCodes ?? raw.availableCountries ?? raw.countryAvailability ?? [],
  ).map((country) => country.toUpperCase()).filter((country) => COUNTRY_CODES.has(country));
  return {
    recipeKey,
    name: text(raw.name ?? raw.displayName ?? recipeKey),
    category: text(raw.category ?? "general").toLowerCase(),
    tier,
    workshopTier: boundedInteger(raw.workshopTier ?? raw.requiredWorkshopTier ?? tier, 1, 10),
    baseDurationSeconds: Math.max(1, boundedInteger(
      raw.baseDurationSeconds ??
        (Number(raw.baseDurationMinutes ?? raw.durationMinutes ?? 1) * 60),
      1,
      604_800,
    )),
    difficultyProfile: text(raw.difficultyProfile ?? raw.difficulty ?? "standard").toLowerCase(),
    requiredEntitlements: stringArray(raw.requiredEntitlements ?? raw.unlockRequirements ?? []),
    requiredTools: stringArray(raw.requiredTools ?? raw.toolRequirements ?? []),
    countryCodes,
    deterministic: raw.randomFailure !== true && raw.deterministic !== false,
    failureRule: "release_all",
    qualityRule: raw.qualityRule ? text(raw.qualityRule).toLowerCase() : "fixed",
    regulated: Boolean(raw.regulated ?? raw.requiresApproval ?? false),
    inputs,
    outputs,
    metadata: {
      sourceFile: relative(file, sourceRoot),
      sourceDefinition: raw,
      durabilityEnabled: false,
      repairEnabled: false,
    },
  };
}

export function normalizeInput(raw, index, recipeKey) {
  requireObject(raw, `input ${index} of ${recipeKey}`);
  const itemKey = text(raw.itemKey ?? raw.item ?? raw.materialKey).toLowerCase();
  if (!ITEM_KEY.test(itemKey)) throw new Error(`Invalid input item ${itemKey} in ${recipeKey}`);
  return {
    lineKey: text(raw.lineKey ?? `input_${String(index + 1).padStart(2, "0")}`).toLowerCase(),
    itemKey,
    baseQuantity: boundedInteger(raw.baseQuantity ?? raw.quantity ?? raw.requiredQuantity, 1, 100_000),
    scalingClass: normalizeEnum(
      raw.scalingClass,
      ["fixed", "elastic_common", "fixed_identity", "fixed_strategic"],
      "fixed",
    ),
    role: normalizeEnum(raw.role, ["ingredient", "tool_charge", "catalyst"], "ingredient"),
    substitutionGroup: nullableText(raw.substitutionGroup ?? raw.substitutionGroupKey)?.toLowerCase() ?? null,
  };
}

export function normalizeOutput(raw, index, recipeKey, itemByKey) {
  requireObject(raw, `output ${index} of ${recipeKey}`);
  const itemKey = text(raw.itemKey ?? raw.item ?? raw.outputItemKey).toLowerCase();
  if (!ITEM_KEY.test(itemKey)) throw new Error(`Invalid output item ${itemKey} in ${recipeKey}`);
  const item = itemByKey.get(itemKey);
  return {
    lineKey: text(raw.lineKey ?? `output_${String(index + 1).padStart(2, "0")}`).toLowerCase(),
    itemKey,
    quantity: boundedInteger(raw.quantity ?? raw.outputQuantity ?? 1, 1, 100_000),
    outputKind: item?.itemClass === "equipment" ? "equipment" : "stackable",
  };
}

export function normalizeSubstitutions(document, itemByKey, substitutionsPath) {
  assertSchema(document, "econovaria-recipe-substitution-groups-v1", substitutionsPath);
  const result = [];
  for (const group of requiredArray(document.groups, "substitution groups")) {
    requireObject(group, "substitution group");
    const groupKey = text(group.groupKey).toLowerCase();
    for (const member of requiredArray(group.members, `members of ${groupKey}`)) {
      requireObject(member, `member of ${groupKey}`);
      const itemKey = text(member.itemKey).toLowerCase();
      if (!itemByKey.has(itemKey)) throw new Error(`Unknown substitution item ${itemKey}`);
      const [ratioNumerator, ratioDenominator] = decimalRatio(member.quantityRatio ?? 1);
      result.push({
        groupKey,
        itemKey,
        ratioNumerator,
        ratioDenominator,
        qualityPenaltyBasisPoints: 0,
        permitKey: nullableText(member.requiresEntitlement),
        countryCodes: [],
        difficultyKeys: DIFFICULTIES,
        enabled: true,
        metadata: {
          durationDeltaSeconds: boundedInteger(
            Number(member.durationDeltaMinutes ?? 0) * 60,
            0,
            604_800,
          ),
          sourceSchemaVersion: document.schemaVersion,
        },
      });
    }
  }
  return result.sort((a, b) =>
    `${a.groupKey}:${a.itemKey}`.localeCompare(`${b.groupKey}:${b.itemKey}`)
  );
}

export function normalizeSalvageRules(document, itemByKey, salvagePath) {
  assertSchema(document, "econovaria-equipment-maintenance-salvage-v1", salvagePath);
  const recoveryCapBasisPoints = Math.round(
    Math.min(...Object.values(document.difficultyRecoveryCeilings ?? { insane: 0.4 }).map(Number)) *
      10_000,
  );
  if (!(recoveryCapBasisPoints > 0 && recoveryCapBasisPoints <= 4000)) {
    throw new Error(`Unsafe salvage recovery cap ${recoveryCapBasisPoints}`);
  }
  const result = [];
  for (const record of requiredArray(document.records, "salvage records")) {
    requireObject(record, "salvage record");
    const equipmentItemKey = text(record.equipmentItemKey).toLowerCase();
    if (itemByKey.get(equipmentItemKey)?.itemClass !== "equipment") {
      throw new Error(`Salvage record references non-equipment ${equipmentItemKey}`);
    }
    const salvage = objectValue(record.salvage, {});
    if (salvage.destroysEquipmentInstance !== true) {
      throw new Error(`${equipmentItemKey} salvage must destroy the instance`);
    }
    const candidates = [
      ...arrayFrom(salvage, ["materialRecoveryCandidates"]),
      ...arrayFrom(salvage, ["componentRecoveryCandidates"]),
    ];
    const outputs = candidates.map((candidate) => {
      requireObject(candidate, `salvage candidate for ${equipmentItemKey}`);
      const itemKey = text(candidate.itemKey).toLowerCase();
      if (!itemByKey.has(itemKey)) throw new Error(`Unknown salvage output ${itemKey}`);
      return {
        itemKey,
        quantity: boundedInteger(candidate.maximumBaseQuantity ?? 1, 1, 100),
      };
    });
    if (!outputs.length) throw new Error(`${equipmentItemKey} requires salvage outputs`);
    result.push({
      equipmentItemKey,
      outputs,
      recoveryCapBasisPoints,
      recraftCooldownSeconds: 300,
      enabled: true,
      metadata: {
        requiresItemKey: nullableText(salvage.requiresItemKey),
        advancedRecoveryPermitKey: nullableText(salvage.advancedComponentRecoveryRequires),
        sourceCountryCode: nullableCountry(record.sourceCountry),
        sourceSchemaVersion: document.schemaVersion,
        durabilityEnabled: false,
        repairEnabled: false,
      },
    });
  }
  if (Number(document.count) !== result.length) {
    throw new Error(`Salvage count mismatch: expected ${document.count}, got ${result.length}`);
  }
  return result.sort(by("equipmentItemKey"));
}

export function normalizeItemEconomics(calibration, itemByKey) {
  const prices = requiredArray(calibration.itemPrices, "physical-economy itemPrices");
  const result = [];
  for (const raw of prices) {
    requireObject(raw, "item economic calibration");
    const itemKey = text(raw.itemKey).toLowerCase();
    if (!itemByKey.has(itemKey)) throw new Error(`Unknown calibrated item ${itemKey}`);
    const referencePrice = Number(raw.referencePrice);
    const salvageValue = Number(raw.salvageValue);
    if (!Number.isFinite(referencePrice) || referencePrice <= 0 ||
        !Number.isFinite(salvageValue) || salvageValue < 0 ||
        salvageValue > referencePrice * 0.4 + 0.01) {
      throw new Error(`Unsafe item calibration for ${itemKey}`);
    }
    result.push({
      itemKey,
      currencyCode: text(raw.currencyCode).toUpperCase(),
      sourceCountryCode: nullableCountry(raw.sourceCountry),
      referencePrice,
      salvageValue,
      minimumSubstitutionDiscountPct: Number(raw.minimumSubstitutionDiscountPct ?? 0),
      maximumSubstitutionPremiumPct: Number(raw.maximumSubstitutionPremiumPct ?? 0),
      stableId: text(raw.stableId),
    });
  }
  assertUnique(result, "itemKey");
  if (result.length !== itemByKey.size || Number(calibration.itemCount) !== itemByKey.size) {
    throw new Error(`Item economics count mismatch: expected ${itemByKey.size}, got ${result.length}`);
  }
  return result.sort(by("itemKey"));
}
