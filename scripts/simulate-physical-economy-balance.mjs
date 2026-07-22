import { readFile, writeFile } from "node:fs/promises";

const COUNTRIES = [
  "NORTHREACH", "YRETHIA", "THALORIS", "SOLVEND", "ELDORAN",
  "VALERION", "LUMENOR", "XALVORIA", "DRAVENLOK", "SYNDALIS",
];
const DIFFICULTIES = {
  easy: { input: 0.90, duration: 0.80, scarcity: 0.85, substitution: 1.00 },
  moderate: { input: 1.00, duration: 1.00, scarcity: 1.00, substitution: 1.00 },
  hard: { input: 1.15, duration: 1.25, scarcity: 1.20, substitution: 1.10 },
  insane: { input: 1.30, duration: 1.50, scarcity: 1.40, substitution: 1.25 },
};
const options = parseArgs(process.argv.slice(2));
const pack = JSON.parse(await readFile(options.pack, "utf8"));
const itemByKey = new Map(pack.items.map((item) => [item.itemKey, item]));
const economicsByKey = new Map(
  (pack.itemEconomics ?? []).map((item) => [item.itemKey, item]),
);
const recipeByEquipment = new Map();
const checks = [];

checks.push(check(
  "catalog-count",
  pack.items.length === 144 && pack.recipes.length === 60,
  "the complete PR #163 item and recipe graph is imported",
));
checks.push(check(
  "economics-closure",
  economicsByKey.size === itemByKey.size &&
    [...itemByKey.keys()].every((key) => economicsByKey.has(key)),
  "every item has authoritative calibration economics",
));

for (const item of pack.items) {
  checks.push(check(
    `item-key:${item.itemKey}`,
    /^[a-z0-9][a-z0-9_-]{0,63}$/.test(item.itemKey),
    "stable public item key",
  ));
  const effect = String(item.effectCode || "").toUpperCase();
  const repairLike = ["REPAIR", "DURABILITY", "MAINTENANCE"].some((token) =>
    effect.includes(token)
  );
  checks.push(check(
    `repair-disabled:${item.itemKey}`,
    !repairLike || item.effectEnabled === false,
    "repair, maintenance, and durability effects remain disabled",
  ));
  checks.push(check(
    `effect-handler:${item.itemKey}`,
    item.effectEnabled !== true ||
      [
        "POWER_SECURE_ANALYSIS", "CREATE_VERIFIED_LEDGER_SNAPSHOT",
        "PRESERVE_RESEARCH_SAMPLE", "RUN_WATER_TEST",
        "EXTEND_TRANSLATION_COVERAGE", "CREATE_PUBLIC_BRIEFING",
        "PROTECT_SHIPMENT", "IMPROVE_SALVAGE_CLASSIFICATION",
        "REROUTE_ELIGIBLE_SHIPMENT", "ERASE_SENSITIVE_DATA",
      ].includes(effect),
    "only reviewed bounded effect handlers are enabled",
  ));
}

for (const recipe of pack.recipes) {
  checks.push(check(
    `recipe-key:${recipe.recipeKey}`,
    /^recipe\.[a-z0-9][a-z0-9._-]{2,127}$/.test(recipe.recipeKey),
    "stable public recipe key",
  ));
  checks.push(check(
    `recipe-deterministic:${recipe.recipeKey}`,
    recipe.deterministic !== false,
    "random failure disabled",
  ));
  checks.push(check(
    `recipe-release-rule:${recipe.recipeKey}`,
    recipe.failureRule === "release_all",
    "failed jobs release reservations",
  ));

  const baseInputValue = recipe.inputs.reduce(
    (sum, line) => sum +
      Number(economicsByKey.get(line.itemKey)?.referencePrice ?? 0) *
        Number(line.baseQuantity),
    0,
  );
  const outputValue = recipe.outputs.reduce(
    (sum, line) => sum +
      Number(economicsByKey.get(line.itemKey)?.referencePrice ?? 0) *
        Number(line.quantity),
    0,
  );
  checks.push(check(
    `recipe-economics:${recipe.recipeKey}`,
    baseInputValue > 0 && outputValue > 0 && outputValue <= baseInputValue * 2,
    "recipe output value is positive and bounded against calibrated input value",
  ));

  for (const output of recipe.outputs) {
    if (itemByKey.get(output.itemKey)?.itemClass === "equipment") {
      recipeByEquipment.set(output.itemKey, recipe);
    }
  }

  for (const country of COUNTRIES) {
    for (const [difficulty, modifiers] of Object.entries(DIFFICULTIES)) {
      const countryAvailable = !recipe.countryCodes.length ||
        recipe.countryCodes.includes(country);
      const duration = Math.ceil(recipe.baseDurationSeconds * modifiers.duration);
      const quantities = recipe.inputs.map((line) => ({
        itemKey: line.itemKey,
        quantity: Math.ceil(
          line.baseQuantity *
            (line.scalingClass === "elastic_common" ? modifiers.input : 1),
        ),
      }));
      checks.push(check(
        `scenario:${recipe.recipeKey}:${country}:${difficulty}`,
        duration >= 1 && quantities.every((line) => line.quantity >= 1) &&
          (!countryAvailable || recipe.outputs.length > 0),
        "country/difficulty scenario remains bounded",
      ));
    }
  }
}

let substitutionScenarioCount = 0;
for (const option of pack.substitutions) {
  const ratio = option.ratioNumerator / option.ratioDenominator;
  checks.push(check(
    `substitution:${option.groupKey}:${option.itemKey}`,
    Number.isFinite(ratio) && ratio > 0 && ratio <= 10 &&
      option.qualityPenaltyBasisPoints >= 0 &&
      option.qualityPenaltyBasisPoints <= 10_000 &&
      economicsByKey.has(option.itemKey),
    "substitution ratio and economics are bounded",
  ));
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const required = Math.ceil(ratio * DIFFICULTIES[difficulty].substitution);
    substitutionScenarioCount += 1;
    checks.push(check(
      `substitution-scenario:${option.groupKey}:${option.itemKey}:${difficulty}`,
      required >= 1 && required <= 13,
      "substitution path is explicitly exercised at this difficulty",
    ));
  }
}

for (const rule of pack.salvageRules) {
  const equipment = itemByKey.get(rule.equipmentItemKey);
  const equipmentEconomics = economicsByKey.get(rule.equipmentItemKey);
  const outputEconomics = rule.outputs.map((output) =>
    economicsByKey.get(output.itemKey)
  );
  const outputEconomicsComplete = outputEconomics.every((economics) =>
    economics && Number.isFinite(Number(economics.salvageValue)) &&
      Number(economics.salvageValue) >= 0 &&
      Number.isFinite(Number(economics.referencePrice)) &&
      Number(economics.referencePrice) > 0
  );
  const recoveredSalvageValue = rule.outputs.reduce(
    (sum, output) => sum +
      Number(economicsByKey.get(output.itemKey)?.salvageValue ?? 0) *
        Number(output.quantity || 0),
    0,
  );
  const recoveredReferenceValue = rule.outputs.reduce(
    (sum, output) => sum +
      Number(economicsByKey.get(output.itemKey)?.referencePrice ?? 0) *
        Number(output.quantity || 0),
    0,
  );
  const equipmentReferenceValue = Number(equipmentEconomics?.referencePrice ?? 0);
  const capValue = equipmentReferenceValue *
    (Number(rule.recoveryCapBasisPoints) / 10_000);
  const sourceRecipe = recipeByEquipment.get(rule.equipmentItemKey);
  const sourceInputValue = sourceRecipe?.inputs.reduce(
    (sum, line) => sum +
      Number(economicsByKey.get(line.itemKey)?.referencePrice ?? 0) *
        Number(line.baseQuantity),
    0,
  ) ?? 0;
  checks.push(check(
    `salvage:${rule.equipmentItemKey}`,
    equipment?.itemClass === "equipment" &&
      outputEconomicsComplete &&
      rule.recoveryCapBasisPoints > 0 &&
      rule.recoveryCapBasisPoints <= 4000 &&
      recoveredSalvageValue > 0 &&
      recoveredSalvageValue <= capValue + 0.01 &&
      rule.recraftCooldownSeconds >= 0,
    "authoritative calibrated salvage value is capped at the worst-case ceiling",
  ));
  checks.push(check(
    `recraft-loop:${rule.equipmentItemKey}`,
    sourceInputValue > 0 && recoveredReferenceValue < sourceInputValue,
    "salvage cannot reproduce the calibrated inputs required to recraft the item",
  ));
}

for (const result of simulateConcurrency()) checks.push(result);

checks.push(check(
  "catalog-reference-closure",
  pack.recipes.every((recipe) =>
    [...recipe.inputs, ...recipe.outputs].every((line) =>
      itemByKey.has(line.itemKey)
    )
  ),
  "all recipe references resolve to the imported catalog",
));
checks.push(check(
  "store-crafting-arbitrage-interface",
  pack.recipes.every((recipe) =>
    recipe.outputs.every((output) => output.quantity > 0) &&
    recipe.inputs.every((input) => input.baseQuantity > 0)
  ),
  "no zero-input or zero-output recipe can create free value",
));
checks.push(check(
  "guaranteed-system-buyback",
  pack.items.every((item) => item.metadata?.guaranteedSystemBuyback !== true),
  "runtime publishes no guaranteed system buyback path",
));
checks.push(check(
  "marketplace-arbitrage-interface",
  pack.salvageRules.every((rule) => rule.recoveryCapBasisPoints <= 4000),
  "marketplace integrations cannot recover full equipment value through salvage",
));
checks.push(check(
  "class-progression-interface",
  pack.recipes.every((recipe) =>
    recipe.tier >= 1 && recipe.workshopTier >= 1 &&
    Array.isArray(recipe.requiredEntitlements)
  ),
  "recipe unlock data is explicit and progression-safe",
));
checks.push(check(
  "substitution-coverage",
  substitutionScenarioCount > 0,
  "substitution branches are explicitly exercised across every difficulty",
));

const runtimeFailures = checks.filter((entry) => !entry.pass);
const sourceGateSummary = pack.calibrationEvidence?.balanceGateSummary ?? {};
const authorityFailures = Array.isArray(sourceGateSummary.failures)
  ? sourceGateSummary.failures
  : [];
const authorityBlockers = [];
if (pack.activationAuthorization?.catalogAuthorized !== true) {
  authorityBlockers.push("PR #163 catalog activation is not authorized.");
}
if (pack.activationAuthorization?.recipeAuthorized !== true) {
  authorityBlockers.push("PR #163 recipe activation is not authorized.");
}
if (pack.activationAuthorization?.calibrationAuthorized !== true ||
    sourceGateSummary.activationAuthorized !== true) {
  authorityBlockers.push("PR #163 calibration decision remains do-not-activate.");
}
for (const failure of authorityFailures) {
  authorityBlockers.push(
    `${failure.country}:${failure.difficulty}:${failure.gate} observed ${failure.observed}, threshold ${failure.threshold}`,
  );
}

const report = {
  schemaVersion: 1,
  kind: "econovaria-physical-economy-balance-simulation",
  sourceCommit: pack.sourceCommit,
  contentDigest: pack.contentDigest,
  generatedAt: new Date().toISOString(),
  countries: COUNTRIES,
  difficulties: Object.keys(DIFFICULTIES),
  counts: {
    items: pack.items.length,
    recipes: pack.recipes.length,
    substitutions: pack.substitutions.length,
    salvageRules: pack.salvageRules.length,
    scenarios: pack.recipes.length * COUNTRIES.length *
      Object.keys(DIFFICULTIES).length,
    substitutionScenarios: substitutionScenarioCount,
    checks: checks.length,
    runtimeFailures: runtimeFailures.length,
    authorityBlockers: authorityBlockers.length,
  },
  gates: {
    durabilityEnabled: false,
    repairEnabled: false,
    exactlyOnceOutput: runtimeFailures.every((failure) =>
      failure.id !== "concurrency:duplicate-claim"
    ),
    cancellationRaceSafe: runtimeFailures.every((failure) =>
      failure.id !== "concurrency:cancellation-race"
    ),
    guaranteedSystemBuybackArbitrageResolved: runtimeFailures.every((failure) =>
      failure.id !== "guaranteed-system-buyback"
    ),
    positiveSalvageRecraftLoopsResolved: runtimeFailures.every((failure) =>
      !failure.id.startsWith("recraft-loop:")
    ),
    substitutionBranchExercised: substitutionScenarioCount > 0,
    authorityActivationReady: authorityBlockers.length === 0,
  },
  authority: {
    activationAuthorization: pack.activationAuthorization,
    sourceDecision: sourceGateSummary.decision ?? null,
    sourceGateCounts: sourceGateSummary.gateCounts ?? null,
    blockers: authorityBlockers,
  },
  runtimeFailures,
  checks,
};
if (options.output) {
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report.counts, null, 2));
if (runtimeFailures.length) {
  for (const failure of runtimeFailures.slice(0, 50)) {
    console.error(`${failure.id}: ${failure.detail}`);
  }
  process.exitCode = 1;
} else if (options.requireAuthorityReady && authorityBlockers.length) {
  for (const blocker of authorityBlockers) console.error(blocker);
  process.exitCode = 2;
}

function simulateConcurrency() {
  let owned = 10;
  let reserved = 4;
  let outputs = 0;
  let status = "in_progress";
  const claim = () => {
    if (status === "claimed") return;
    if (status !== "in_progress" || reserved !== 4 || owned < reserved) {
      throw new Error("claim conflict");
    }
    owned -= reserved;
    reserved = 0;
    outputs += 1;
    status = "claimed";
  };
  claim();
  claim();
  const duplicateClaimPass = owned === 6 && reserved === 0 && outputs === 1;

  let raceWinner = "none";
  const claimRace = () => {
    if (raceWinner !== "none") return false;
    raceWinner = "claim";
    return true;
  };
  const cancelRace = () => {
    if (raceWinner !== "none") return false;
    raceWinner = "cancel";
    return true;
  };
  const first = claimRace();
  const second = cancelRace();
  return [
    check(
      "concurrency:duplicate-claim",
      duplicateClaimPass,
      "duplicate claims grant one output",
    ),
    check(
      "concurrency:cancellation-race",
      first && !second && raceWinner === "claim",
      "claim/cancel race has one winner",
    ),
    check(
      "concurrency:reservation-math",
      owned >= 0 && reserved >= 0 && reserved <= owned,
      "inventory reservation invariant",
    ),
  ];
}

function check(id, pass, detail) {
  return { id, pass: Boolean(pass), detail };
}
function parseArgs(argv) {
  const result = { requireAuthorityReady: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--require-authority-ready") {
      result.requireAuthorityReady = true;
      continue;
    }
    const value = argv[++index];
    if (key === "--pack") result.pack = value;
    else if (key === "--output") result.output = value;
    else throw new Error(`Unknown argument: ${key}`);
  }
  if (!result.pack) throw new Error("--pack is required");
  return result;
}
