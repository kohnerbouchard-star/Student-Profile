#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.dirname(path.dirname(SCRIPT_PATH));
const DEFAULT_INPUT = path.join(
  REPO_ROOT,
  "docs/seed-content/simulation/physical-economy/physical-economy-simulation-input-v3.json",
);
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  "docs/operations/contracts/beta-seed-downstream-consumer-contract-v1.json",
);
const BUILD_SCRIPT = path.join(
  REPO_ROOT,
  "scripts/build-physical-economy-runtime-pack.mjs",
);

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    outputDir: path.join(
      REPO_ROOT,
      "player-terminal/test-results/physical-economy-v3",
    ),
    requirePass: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--input") options.input = path.resolve(argv[++index]);
    else if (key === "--output-dir") {
      options.outputDir = path.resolve(argv[++index]);
    } else if (key === "--require-pass") options.requirePass = true;
    else throw new Error(`Unknown argument: ${key}`);
  }
  return options;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function round(value, digits = 9) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function minimum(values) {
  return values.length ? Math.min(...values) : 0;
}

function maximum(values) {
  return values.length ? Math.max(...values) : 0;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function hashSeed(...parts) {
  const digest = createHash("sha256").update(parts.join("|")).digest();
  return digest.readUInt32BE(0) || 1;
}

function createRng(...parts) {
  let state = hashSeed(...parts) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function buildRuntimePack(contract, outputFile) {
  const sourceCommit = text(contract.acceptedImplementationSourceSha);
  requireCondition(
    /^[a-f0-9]{40}$/.test(sourceCommit),
    "Seed consumer contract source SHA is invalid",
  );
  const result = spawnSync(
    process.execPath,
    [
      BUILD_SCRIPT,
      "--source-root",
      REPO_ROOT,
      "--output",
      outputFile,
      "--source-commit",
      sourceCommit,
      "--approved-source-commit",
      sourceCommit,
      "--pack-key",
      text(contract.packId),
      "--content-version",
      text(contract.packVersion),
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Physical-economy pack build failed: ${String(
        result.stderr || result.stdout,
      ).slice(0, 4000)}`,
    );
  }
}

function validateInput(input) {
  requireCondition(
    input.schemaVersion === "econovaria-physical-economy-simulation-input-v3",
    "Simulation input schema is invalid",
  );
  requireCondition(
    input.activationAuthorized === false,
    "Candidate input must not authorize activation",
  );
  const run = object(input.runConfiguration);
  requireCondition(array(run.countries).length === 10, "Expected ten countries");
  requireCondition(
    array(run.difficulties).length === 4,
    "Expected four difficulties",
  );
  requireCondition(array(run.scenarios).length === 4, "Expected four scenarios");
  requireCondition(number(run.seeds) === 100, "Expected 100 seeds");
  requireCondition(
    number(run.playersPerCountry) === 12,
    "Expected twelve Players per country",
  );
  requireCondition(number(run.cycles) === 30, "Expected thirty cycles");
  const safety = object(input.safety);
  requireCondition(
    safety.hiddenCraftFailureRollAllowed === false,
    "Hidden Crafting failure rolls are prohibited",
  );
  requireCondition(safety.durabilityEnabled === false, "Durability is disabled");
  requireCondition(safety.repairEnabled === false, "Repair is disabled");
  requireCondition(
    safety.systemBuybackAssumed === false,
    "System buyback must not be assumed",
  );
  requireCondition(
    safety.productionActivationAllowed === false,
    "Production activation must remain disabled",
  );
}

function validatePack(pack) {
  requireCondition(
    pack.schemaVersion === "econovaria-physical-economy-runtime-pack-v1",
    "Runtime pack schema is invalid",
  );
  requireCondition(pack.durabilityEnabled === false, "Durability boundary changed");
  requireCondition(pack.repairEnabled === false, "Repair boundary changed");
  requireCondition(array(pack.items).length > 0, "Runtime pack has no items");
  requireCondition(array(pack.recipes).length > 0, "Runtime pack has no recipes");
  requireCondition(
    array(pack.recipes).every((recipe) => recipe.deterministic === true),
    "Every Crafting recipe must remain deterministic",
  );
}

function buildModel(input, pack) {
  const itemByKey = new Map(
    array(pack.items).map((item) => [item.itemKey, item]),
  );
  const economicsByKey = new Map(
    array(pack.itemEconomics).map((item) => [item.itemKey, item]),
  );
  const matrixByRecipe = new Map(
    array(pack.difficultyResolvedMatrix?.records).map((record) => [
      record.recipeKey,
      record,
    ]),
  );
  const substitutionsByGroup = new Map();
  for (const option of array(pack.substitutions)) {
    const values = substitutionsByGroup.get(option.groupKey) ?? [];
    values.push(option);
    substitutionsByGroup.set(option.groupKey, values);
  }
  const recipesByTier = new Map();
  for (const recipe of array(pack.recipes)) {
    if (number(recipe.tier, 1) > 3) continue;
    const values = recipesByTier.get(number(recipe.tier, 1)) ?? [];
    values.push(recipe);
    recipesByTier.set(number(recipe.tier, 1), values);
  }
  for (const values of recipesByTier.values()) {
    values.sort((left, right) => left.recipeKey.localeCompare(right.recipeKey));
  }
  return Object.freeze({
    input,
    pack,
    itemByKey,
    economicsByKey,
    matrixByRecipe,
    substitutionsByGroup,
    recipesByTier,
  });
}

function scarcityBand(item) {
  const policy = object(item?.scarcityPolicy);
  return text(policy.band || policy.sourceDefinition || "default").toLowerCase() ||
    "default";
}

function cycleSupplyState(model, country, difficulty, scenario, seed, cycle) {
  const rng = createRng(country, difficulty, scenario, seed, cycle, "supply");
  const supplyModel = object(model.input.supplyStateModel);
  const riskConfig = object(
    supplyModel.stockoutRisk?.[scenario]?.[difficulty],
  );
  const multipliers = object(supplyModel.scarcityRiskMultiplier);
  const state = new Map();
  for (const [itemKey, item] of model.itemByKey.entries()) {
    const domestic = !item.sourceCountryCode || item.sourceCountryCode === country;
    const baseRisk = number(
      domestic ? riskConfig.domestic : riskConfig.imported,
      0,
    );
    const riskMultiplier = number(
      multipliers[scarcityBand(item)],
      number(multipliers.default, 1),
    );
    const stockoutRisk = clamp(baseRisk * riskMultiplier, 0, 0.95);
    state.set(itemKey, rng() >= stockoutRisk);
  }
  return state;
}

function scenarioEconomy(model, scenario) {
  return object(model.input.scenarioEconomy?.[scenario]);
}

function unitPrice(model, itemKey, country, scenario) {
  const item = model.itemByKey.get(itemKey);
  const economics = model.economicsByKey.get(itemKey);
  const settings = scenarioEconomy(model, scenario);
  const domestic = !item?.sourceCountryCode || item.sourceCountryCode === country;
  const multiplier = number(
    domestic
      ? settings.domesticPriceMultiplier
      : settings.importPriceMultiplier,
    1,
  );
  return Math.max(0.01, number(economics?.referencePrice, 1) * multiplier);
}

function resolvedInputs(model, recipe, difficulty) {
  const matrix = model.matrixByRecipe.get(recipe.recipeKey);
  const resolved = object(matrix?.[difficulty]);
  const order = array(matrix?.ingredientOrder);
  const quantities = array(resolved.quantities);
  if (order.length > 0 && order.length === quantities.length) {
    return order.map((itemKey, index) => {
      const source = array(recipe.inputs).find(
        (line) => line.itemKey === itemKey,
      );
      return {
        ...source,
        itemKey,
        baseQuantity: Math.max(
          1,
          Math.round(number(quantities[index], source?.baseQuantity ?? 1)),
        ),
      };
    });
  }
  return array(recipe.inputs);
}

function availableSubstitution(
  model,
  line,
  supply,
  country,
  difficulty,
  scenario,
) {
  if (!line.substitutionGroup) return null;
  const options = (model.substitutionsByGroup.get(line.substitutionGroup) ?? [])
    .filter((option) => option.enabled !== false)
    .filter((option) => !option.permitKey)
    .filter((option) =>
      !array(option.countryCodes).length ||
      array(option.countryCodes).includes(country)
    )
    .filter((option) =>
      !array(option.difficultyKeys).length ||
      array(option.difficultyKeys).includes(difficulty)
    )
    .filter((option) => supply.get(option.itemKey) !== false);
  if (!options.length) return null;
  return options.sort((left, right) => {
    const leftRatio = number(left.ratioNumerator, 1) /
      Math.max(1, number(left.ratioDenominator, 1));
    const rightRatio = number(right.ratioNumerator, 1) /
      Math.max(1, number(right.ratioDenominator, 1));
    return unitPrice(model, left.itemKey, country, scenario) * leftRatio -
      unitPrice(model, right.itemKey, country, scenario) * rightRatio;
  })[0];
}

function consumeInventory(player, itemKey, quantity) {
  const owned = number(player.inventory.get(itemKey), 0);
  const consumed = Math.min(owned, quantity);
  if (consumed > 0) {
    const remaining = owned - consumed;
    if (remaining > 0) player.inventory.set(itemKey, remaining);
    else player.inventory.delete(itemKey);
  }
  return quantity - consumed;
}

function planRecipe(model, player, recipe, supply, country, difficulty, scenario) {
  let totalCost = 0;
  let importCost = 0;
  let substitutionExecutions = 0;
  const purchases = [];
  const inventoryConsumption = [];

  for (const line of resolvedInputs(model, recipe, difficulty)) {
    const required = Math.max(1, number(line.baseQuantity, 1));
    const owned = number(player.inventory.get(line.itemKey), 0);
    const fromInventory = Math.min(owned, required);
    let remaining = required - fromInventory;
    if (fromInventory > 0) {
      inventoryConsumption.push({ itemKey: line.itemKey, quantity: fromInventory });
    }
    if (remaining <= 0) continue;

    let itemKey = line.itemKey;
    let quantity = remaining;
    if (supply.get(itemKey) === false) {
      const substitution = availableSubstitution(
        model,
        line,
        supply,
        country,
        difficulty,
        scenario,
      );
      if (!substitution) return null;
      itemKey = substitution.itemKey;
      quantity = Math.ceil(
        remaining * number(substitution.ratioNumerator, 1) /
          Math.max(1, number(substitution.ratioDenominator, 1)),
      );
      substitutionExecutions += 1;
    }

    const cost = unitPrice(model, itemKey, country, scenario) * quantity;
    const item = model.itemByKey.get(itemKey);
    const imported = Boolean(item?.sourceCountryCode) &&
      item.sourceCountryCode !== country;
    totalCost += cost;
    if (imported) importCost += cost;
    purchases.push({ itemKey, quantity });
  }

  return {
    totalCost,
    importCost,
    domesticCost: totalCost - importCost,
    substitutionExecutions,
    purchases,
    inventoryConsumption,
  };
}

function createPlayer(model, difficulty) {
  return {
    funds: number(model.input.playerEconomy?.startingFunds?.[difficulty], 500),
    inventory: new Map(),
    recipeCrafts: new Map(),
    craftsByTier: new Map(),
    unlockedTier: 1,
    firstTier1Cycle: null,
    tier1ByCycle5: false,
    successfulCrafts: 0,
    attempts: 0,
    supplyFailures: 0,
    affordabilityFailures: 0,
    substitutionExecutions: 0,
    importSpend: 0,
    domesticSpend: 0,
  };
}

function eligibleRecipes(model, player, country) {
  const result = [];
  for (let tier = 1; tier <= player.unlockedTier; tier += 1) {
    for (const recipe of model.recipesByTier.get(tier) ?? []) {
      if (
        array(recipe.countryCodes).length > 0 &&
        !array(recipe.countryCodes).includes(country)
      ) continue;
      result.push(recipe);
    }
  }
  return result;
}

function selectPreferredRecipe(model, player, country, rng) {
  const candidates = eligibleRecipes(model, player, country);
  if (!candidates.length) return null;
  const leastCrafted = minimum(
    candidates.map((recipe) =>
      number(player.recipeCrafts.get(recipe.recipeKey), 0)
    ),
  );
  const balanced = candidates.filter((recipe) =>
    number(player.recipeCrafts.get(recipe.recipeKey), 0) <= leastCrafted + 1
  );
  return balanced[Math.floor(rng() * balanced.length)] ?? balanced[0] ?? null;
}

function unlockProgression(model, player) {
  const thresholds = object(model.input.runConfiguration?.tierUnlockCrafts);
  if (
    player.unlockedTier === 1 &&
    number(player.craftsByTier.get(1), 0) >= number(thresholds.tier2, 2)
  ) {
    player.unlockedTier = 2;
  }
  if (
    player.unlockedTier === 2 &&
    number(player.craftsByTier.get(2), 0) >= number(thresholds.tier3, 2)
  ) {
    player.unlockedTier = 3;
  }
}

function applySuccessfulCraft(model, player, recipe, plan, cycle) {
  for (const line of plan.inventoryConsumption) {
    consumeInventory(player, line.itemKey, line.quantity);
  }
  player.funds -= plan.totalCost;
  player.importSpend += plan.importCost;
  player.domesticSpend += plan.domesticCost;
  player.substitutionExecutions += plan.substitutionExecutions;

  const retentionRatio = number(
    model.input.playerEconomy?.outputRetentionValueRatio,
    0.35,
  );
  for (const output of array(recipe.outputs)) {
    const quantity = Math.max(1, number(output.quantity, 1));
    player.inventory.set(
      output.itemKey,
      number(player.inventory.get(output.itemKey), 0) + quantity,
    );
    player.funds += number(
      model.economicsByKey.get(output.itemKey)?.referencePrice,
      0,
    ) * quantity * retentionRatio;
  }

  player.successfulCrafts += 1;
  player.recipeCrafts.set(
    recipe.recipeKey,
    number(player.recipeCrafts.get(recipe.recipeKey), 0) + 1,
  );
  const tier = number(recipe.tier, 1);
  player.craftsByTier.set(tier, number(player.craftsByTier.get(tier), 0) + 1);
  if (tier === 1 && player.firstTier1Cycle === null) {
    player.firstTier1Cycle = cycle;
  }
  if (tier === 1 && cycle <= 5) player.tier1ByCycle5 = true;
  unlockProgression(model, player);
}

function simulateRun(model, country, difficulty, scenario, seed) {
  const run = object(model.input.runConfiguration);
  const playerCount = number(run.playersPerCountry, 12);
  const players = Array.from(
    { length: playerCount },
    () => createPlayer(model, difficulty),
  );
  const choiceRng = createRng(country, difficulty, scenario, seed, "choices");
  const attemptsPerCycle = Math.max(
    1,
    number(model.input.playerEconomy?.maximumCraftAttemptsPerCycle, 1),
  );
  const economy = scenarioEconomy(model, scenario);

  for (let cycle = 1; cycle <= number(run.cycles, 30); cycle += 1) {
    const supply = cycleSupplyState(
      model,
      country,
      difficulty,
      scenario,
      seed,
      cycle,
    );
    for (const player of players) {
      player.funds += number(
        model.input.playerEconomy?.cycleIncome?.[difficulty],
        100,
      ) * number(economy.incomeMultiplier, 1);
      for (let attempt = 0; attempt < attemptsPerCycle; attempt += 1) {
        const recipe = selectPreferredRecipe(model, player, country, choiceRng);
        if (!recipe) continue;
        player.attempts += 1;
        const plan = planRecipe(
          model,
          player,
          recipe,
          supply,
          country,
          difficulty,
          scenario,
        );
        if (!plan) {
          player.supplyFailures += 1;
          continue;
        }
        player.substitutionExecutions += plan.substitutionExecutions;
        if (plan.totalCost > player.funds + 1e-9) {
          player.affordabilityFailures += 1;
          continue;
        }
        player.substitutionExecutions -= plan.substitutionExecutions;
        applySuccessfulCraft(model, player, recipe, plan, cycle);
      }
    }
  }

  const attempts = players.reduce((sum, player) => sum + player.attempts, 0);
  const importSpend = players.reduce(
    (sum, player) => sum + player.importSpend,
    0,
  );
  const domesticSpend = players.reduce(
    (sum, player) => sum + player.domesticSpend,
    0,
  );
  return {
    country,
    difficulty,
    scenario,
    seed,
    craftSuccessRate: attempts
      ? players.reduce((sum, player) => sum + player.successfulCrafts, 0) /
        attempts
      : 0,
    supplyFailureRate: attempts
      ? players.reduce((sum, player) => sum + player.supplyFailures, 0) /
        attempts
      : 0,
    affordabilityFailureRate: attempts
      ? players.reduce(
          (sum, player) => sum + player.affordabilityFailures,
          0,
        ) / attempts
      : 0,
    firstTier1MedianCycle: median(
      players.map((player) =>
        player.firstTier1Cycle ?? number(run.cycles, 30) + 1
      ),
    ),
    tier1ByCycle5Rate: players.filter((player) => player.tier1ByCycle5)
      .length / players.length,
    tier3AccessRate: players.filter((player) => player.unlockedTier >= 3)
      .length / players.length,
    importSpendShare: importSpend + domesticSpend > 0
      ? importSpend / (importSpend + domesticSpend)
      : 0,
    substitutionExecutions: players.reduce(
      (sum, player) => sum + player.substitutionExecutions,
      0,
    ),
  };
}

function aggregateRuns(rawRuns) {
  const groups = new Map();
  for (const run of rawRuns) {
    const key = `${run.country}|${run.difficulty}|${run.scenario}`;
    const values = groups.get(key) ?? [];
    values.push(run);
    groups.set(key, values);
  }
  return [...groups.entries()].map(([key, values]) => {
    const [country, difficulty, scenario] = key.split("|");
    return {
      country,
      difficulty,
      scenario,
      seeds: values.length,
      craftSuccessMean: round(mean(values.map((value) => value.craftSuccessRate))),
      craftSuccessMinimum: round(
        minimum(values.map((value) => value.craftSuccessRate)),
      ),
      supplyFailureMean: round(
        mean(values.map((value) => value.supplyFailureRate)),
      ),
      supplyFailureMaximum: round(
        maximum(values.map((value) => value.supplyFailureRate)),
      ),
      affordabilityFailureMean: round(
        mean(values.map((value) => value.affordabilityFailureRate)),
      ),
      affordabilityFailureMaximum: round(
        maximum(values.map((value) => value.affordabilityFailureRate)),
      ),
      firstTier1MedianCycleMean: round(
        mean(values.map((value) => value.firstTier1MedianCycle)),
      ),
      firstTier1MedianCycleMaximum: round(
        maximum(values.map((value) => value.firstTier1MedianCycle)),
      ),
      tier1ByCycle5Mean: round(
        mean(values.map((value) => value.tier1ByCycle5Rate)),
      ),
      tier1ByCycle5Minimum: round(
        minimum(values.map((value) => value.tier1ByCycle5Rate)),
      ),
      tier3AccessMean: round(
        mean(values.map((value) => value.tier3AccessRate)),
      ),
      importSpendShareMean: round(
        mean(values.map((value) => value.importSpendShare)),
      ),
      substitutionExecutions: values.reduce(
        (sum, value) => sum + value.substitutionExecutions,
        0,
      ),
    };
  }).sort((left, right) =>
    `${left.difficulty}:${left.scenario}:${left.country}`.localeCompare(
      `${right.difficulty}:${right.scenario}:${right.country}`,
    )
  );
}

function salvageRecraftLoops(model) {
  const outputRecipes = new Map();
  for (const recipe of array(model.pack.recipes)) {
    for (const output of array(recipe.outputs)) {
      const values = outputRecipes.get(output.itemKey) ?? [];
      values.push(recipe);
      outputRecipes.set(output.itemKey, values);
    }
  }
  const loops = [];
  for (const rule of array(model.pack.salvageRules)) {
    for (const recipe of outputRecipes.get(rule.equipmentItemKey) ?? []) {
      const inputCost = array(recipe.inputs).reduce((sum, line) =>
        sum + number(
          model.economicsByKey.get(line.itemKey)?.referencePrice,
          0,
        ) * number(line.baseQuantity, 1), 0);
      const recoveredValue = array(rule.outputs).reduce((sum, output) =>
        sum + number(
          model.economicsByKey.get(output.itemKey)?.referencePrice,
          0,
        ) * number(output.quantity, 1), 0) *
        number(rule.recoveryCapBasisPoints, 0) / 10_000;
      if (recoveredValue > inputCost + 0.01) {
        loops.push({
          equipmentItemKey: rule.equipmentItemKey,
          recipeKey: recipe.recipeKey,
          inputCost: round(inputCost, 4),
          recoveredValue: round(recoveredValue, 4),
        });
      }
    }
  }
  return loops;
}

function evaluate(model, aggregate) {
  const gates = object(model.input.gates);
  const run = object(model.input.runConfiguration);
  const failures = [];
  const warnings = [];
  const difficultySummary = {};

  for (const difficulty of array(run.difficulties)) {
    const baseline = aggregate.filter((row) =>
      row.difficulty === difficulty && row.scenario === "baseline"
    );
    const border = aggregate.filter((row) =>
      row.difficulty === difficulty && row.scenario === "border_disruption"
    );
    const craftThreshold = number(
      gates.baselineCraftSuccessMinimum?.[difficulty],
    );
    const supplyThreshold = number(
      gates.borderDisruptionSupplyFailureMaximum?.[difficulty],
    );
    const tierThreshold = number(gates.tier1ByCycle5Minimum?.[difficulty]);
    const firstTierThreshold = number(
      gates.baselineFirstTier1MedianCycleMaximum?.[difficulty],
    );
    const rangeThreshold = number(
      gates.countryFirstTier1RangeMaximum?.[difficulty],
    );

    for (const row of baseline) {
      if (row.craftSuccessMean < craftThreshold) {
        failures.push({
          country: row.country.toLowerCase(),
          difficulty,
          gate: "baseline_craft_success_minimum",
          observed: row.craftSuccessMean,
          threshold: craftThreshold,
        });
      }
      if (row.tier1ByCycle5Mean < tierThreshold) {
        failures.push({
          country: row.country.toLowerCase(),
          difficulty,
          gate: "tier1_by_cycle5_minimum",
          observed: row.tier1ByCycle5Mean,
          threshold: tierThreshold,
        });
      }
      if (row.firstTier1MedianCycleMean > firstTierThreshold) {
        failures.push({
          country: row.country.toLowerCase(),
          difficulty,
          gate: "baseline_first_tier1_median_cycle_maximum",
          observed: row.firstTier1MedianCycleMean,
          threshold: firstTierThreshold,
        });
      }
    }
    for (const row of border) {
      if (row.supplyFailureMean > supplyThreshold) {
        failures.push({
          country: row.country.toLowerCase(),
          difficulty,
          gate: "border_disruption_supply_failure_maximum",
          observed: row.supplyFailureMean,
          threshold: supplyThreshold,
        });
      }
    }

    const firstTierValues = baseline.map((row) =>
      row.firstTier1MedianCycleMean
    );
    const countryRange = maximum(firstTierValues) - minimum(firstTierValues);
    if (countryRange > rangeThreshold) {
      failures.push({
        country: "all",
        difficulty,
        gate: "country_first_tier1_range_maximum",
        observed: round(countryRange),
        threshold: rangeThreshold,
      });
    }

    const importWarning = number(gates.maximumImportSpendShareWarning, 0.8);
    const maximumImportSpend = maximum(
      aggregate.filter((row) => row.difficulty === difficulty).map((row) =>
        row.importSpendShareMean
      ),
    );
    if (maximumImportSpend > importWarning) {
      warnings.push({
        difficulty,
        gate: "import_spend_share",
        observed: round(maximumImportSpend),
        threshold: importWarning,
      });
    }

    difficultySummary[difficulty] = {
      baselineCraftSuccessMinimumObserved: round(
        minimum(baseline.map((row) => row.craftSuccessMean)),
      ),
      borderDisruptionSupplyFailureMaximumObserved: round(
        maximum(border.map((row) => row.supplyFailureMean)),
      ),
      tier1ByCycle5MinimumObserved: round(
        minimum(baseline.map((row) => row.tier1ByCycle5Mean)),
      ),
      baselineFirstTier1MedianCycleMaximumObserved: round(
        maximum(firstTierValues),
      ),
      countryFirstTier1RangeObserved: round(countryRange),
      baselineTier3GlobalMeanObserved: round(
        mean(baseline.map((row) => row.tier3AccessMean)),
      ),
      baselineImportSpendShareMean: round(
        mean(baseline.map((row) => row.importSpendShareMean)),
      ),
      maximumImportSpendShareMeanAcrossScenarios: round(maximumImportSpend),
    };
  }

  const substitutionExecutions = aggregate.reduce(
    (sum, row) => sum + row.substitutionExecutions,
    0,
  );
  if (substitutionExecutions < number(gates.minimumSubstitutionExecutions, 1)) {
    failures.push({
      country: "all",
      difficulty: "all",
      gate: "minimum_substitution_executions",
      observed: substitutionExecutions,
      threshold: number(gates.minimumSubstitutionExecutions, 1),
    });
  }

  const recraftLoops = salvageRecraftLoops(model);
  const guaranteedBuyback = model.input.safety?.systemBuybackAssumed === true
    ? 1
    : 0;
  if (
    guaranteedBuyback >
      number(gates.guaranteedSystemBuybackArbitrageMaximum, 0)
  ) {
    failures.push({
      country: "all",
      difficulty: "all",
      gate: "guaranteed_system_buyback_arbitrage_maximum",
      observed: guaranteedBuyback,
      threshold: number(gates.guaranteedSystemBuybackArbitrageMaximum, 0),
    });
  }
  if (
    recraftLoops.length >
      number(gates.positiveSalvageRecraftLoopsMaximum, 0)
  ) {
    failures.push({
      country: "all",
      difficulty: "all",
      gate: "positive_salvage_recraft_loops_maximum",
      observed: recraftLoops.length,
      threshold: number(gates.positiveSalvageRecraftLoopsMaximum, 0),
    });
  }

  const countryChecks = array(run.countries).length *
    array(run.difficulties).length * 4;
  const rangeChecks = array(run.difficulties).length;
  const integrityChecks = 3;
  const implemented = countryChecks + rangeChecks + integrityChecks;
  const calibrationPassed = failures.length === 0;

  return {
    schemaVersion: "econovaria-physical-economy-gate-summary-v3",
    status: "executed-candidate-calibration",
    calibrationPassed,
    activationAuthorized: false,
    decision: calibrationPassed
      ? "candidate_pass_requires_authority_review"
      : "recalibrate_do_not_activate",
    runConfiguration: {
      countries: array(run.countries).length,
      difficulties: array(run.difficulties).length,
      scenarios: array(run.scenarios).length,
      seeds: number(run.seeds),
      playersPerCountry: number(run.playersPerCountry),
      cycles: number(run.cycles),
      runCount: array(run.countries).length *
        array(run.difficulties).length *
        array(run.scenarios).length *
        number(run.seeds),
    },
    difficultySummary,
    integrityGates: {
      guaranteedSystemBuybackArbitrage: guaranteedBuyback,
      positiveSalvageRecraftLoops: recraftLoops.length,
      recraftLoopEvidence: recraftLoops,
      substitutionExecutions,
    },
    gateCounts: {
      failed: failures.length,
      passed: Math.max(0, implemented - failures.length),
      implemented,
      unresolved: 0,
    },
    failures,
    warnings,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(options.outputDir, { recursive: true });
  const [input, contract] = await Promise.all([
    readJson(options.input),
    readJson(CONTRACT_PATH),
  ]);
  validateInput(input);

  const runtimePackPath = path.join(
    options.outputDir,
    "physical-economy-runtime-pack-v3-candidate.json",
  );
  buildRuntimePack(contract, runtimePackPath);
  const pack = await readJson(runtimePackPath);
  validatePack(pack);
  const model = buildModel(input, pack);

  const run = object(input.runConfiguration);
  const rawRuns = [];
  for (const country of array(run.countries)) {
    for (const difficulty of array(run.difficulties)) {
      for (const scenario of array(run.scenarios)) {
        for (let seed = 1; seed <= number(run.seeds, 100); seed += 1) {
          rawRuns.push(
            simulateRun(model, country, difficulty, scenario, seed),
          );
        }
      }
    }
  }

  const aggregate = aggregateRuns(rawRuns);
  const summary = evaluate(model, aggregate);
  const rawJsonl = `${rawRuns.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const aggregateContent = canonical({
    schemaVersion: "econovaria-physical-economy-aggregate-results-v3",
    rows: aggregate,
  });
  const summaryContent = canonical(summary);
  const inputContent = await readFile(options.input);
  const scriptContent = await readFile(SCRIPT_PATH);
  const rawArchive = gzipSync(rawJsonl, { level: 9, mtime: 0 });
  const manifest = {
    schemaVersion: "econovaria-physical-economy-run-manifest-v3",
    status: "repository-ingested-candidate-evidence",
    activationAuthorized: false,
    calibrationPassed: summary.calibrationPassed,
    runConfiguration: summary.runConfiguration,
    files: {
      input: path.relative(REPO_ROOT, options.input).split(path.sep).join("/"),
      script: path.relative(REPO_ROOT, SCRIPT_PATH).split(path.sep).join("/"),
      aggregateResults: "physical-economy-aggregate-results-v3.json",
      gateSummary: "physical-economy-gate-summary-v3.json",
      rawResults: "physical-economy-raw-results-v3.jsonl",
      rawResultsArchive: "physical-economy-raw-results-v3.jsonl.gz",
    },
    sha256: {
      input: sha256(inputContent),
      script: sha256(scriptContent),
      aggregateResults: sha256(aggregateContent),
      gateSummary: sha256(summaryContent),
      rawResults: sha256(rawJsonl),
      rawResultsArchive: sha256(rawArchive),
    },
    decision: summary.decision,
    failedGates: summary.gateCounts.failed,
  };

  await Promise.all([
    writeFile(
      path.join(options.outputDir, "physical-economy-aggregate-results-v3.json"),
      aggregateContent,
    ),
    writeFile(
      path.join(options.outputDir, "physical-economy-gate-summary-v3.json"),
      summaryContent,
    ),
    writeFile(
      path.join(options.outputDir, "physical-economy-raw-results-v3.jsonl"),
      rawJsonl,
    ),
    writeFile(
      path.join(options.outputDir, "physical-economy-raw-results-v3.jsonl.gz"),
      rawArchive,
    ),
    writeFile(
      path.join(options.outputDir, "physical-economy-run-manifest-v3.json"),
      canonical(manifest),
    ),
  ]);

  console.log(canonical({
    runCount: rawRuns.length,
    decision: summary.decision,
    calibrationPassed: summary.calibrationPassed,
    activationAuthorized: false,
    failedGates: summary.gateCounts.failed,
    implementedGates: summary.gateCounts.implemented,
    substitutionExecutions: summary.integrityGates.substitutionExecutions,
    positiveSalvageRecraftLoops:
      summary.integrityGates.positiveSalvageRecraftLoops,
    guaranteedSystemBuybackArbitrage:
      summary.integrityGates.guaranteedSystemBuybackArbitrage,
    outputDir: options.outputDir,
  }).trimEnd());

  if (options.requirePass && !summary.calibrationPassed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
