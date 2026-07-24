#!/usr/bin/env node

import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.dirname(path.dirname(SCRIPT_PATH));
const DEFAULT_INPUT = path.join(
  REPO_ROOT,
  "docs/seed-content/simulation/physical-economy/physical-economy-simulation-input-v2.json",
);
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  "docs/operations/contracts/beta-seed-downstream-consumer-contract-v1.json",
);
const BUILD_SCRIPT = path.join(REPO_ROOT, "scripts/build-physical-economy-runtime-pack.mjs");

function parseArgs(argv) {
  const result = {
    input: DEFAULT_INPUT,
    outputDir: path.join(REPO_ROOT, "player-terminal/test-results/physical-economy-v2"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--input") result.input = path.resolve(argv[++index]);
    else if (key === "--output-dir") result.outputDir = path.resolve(argv[++index]);
    else if (key === "--require-pass") result.requirePass = true;
    else throw new Error(`Unknown argument: ${key}`);
  }
  return result;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
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
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value, digits = 9) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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

function clamp(value, minimumValue, maximumValue) {
  return Math.max(minimumValue, Math.min(maximumValue, value));
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function buildRuntimePack({ contract, outputFile }) {
  const sourceCommit = text(contract.acceptedImplementationSourceSha);
  requireCondition(/^[a-f0-9]{40}$/.test(sourceCommit), "Seed consumer contract source SHA is invalid");
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
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`Physical-economy pack build failed: ${String(result.stderr || result.stdout).slice(0, 4000)}`);
  }
}

function validateSimulationInput(input) {
  requireCondition(
    input.schemaVersion === "econovaria-physical-economy-simulation-input-v2",
    "Simulation input schema is invalid",
  );
  requireCondition(input.activationAuthorized === false, "Candidate input must not authorize activation");
  const run = record(input.runConfiguration);
  requireCondition(array(run.countries).length === 10, "Simulation requires ten countries");
  requireCondition(array(run.difficulties).length === 4, "Simulation requires four difficulties");
  requireCondition(array(run.scenarios).length === 4, "Simulation requires four scenarios");
  requireCondition(number(run.seeds) === 100, "Simulation requires 100 seeds");
  requireCondition(number(run.playersPerCountry) === 12, "Simulation requires twelve Players per country");
  requireCondition(number(run.cycles) === 30, "Simulation requires thirty cycles");
  const safety = record(input.safety);
  requireCondition(safety.hiddenCraftFailureRollAllowed === false, "Hidden Crafting failure rolls are prohibited");
  requireCondition(safety.durabilityEnabled === false, "Durability remains disabled");
  requireCondition(safety.repairEnabled === false, "Repair remains disabled");
  requireCondition(safety.systemBuybackAssumed === false, "The simulation must not assume a system buyback");
  requireCondition(safety.productionActivationAllowed === false, "Production activation must remain disabled");
}

function validateRuntimePack(pack) {
  requireCondition(pack.schemaVersion === "econovaria-physical-economy-runtime-pack-v1", "Runtime pack schema is invalid");
  requireCondition(pack.durabilityEnabled === false, "Runtime pack durability must remain disabled");
  requireCondition(pack.repairEnabled === false, "Runtime pack repair must remain disabled");
  requireCondition(array(pack.items).length > 0, "Runtime pack contains no items");
  requireCondition(array(pack.recipes).length > 0, "Runtime pack contains no recipes");
  requireCondition(array(pack.recipes).every((recipe) => recipe.deterministic === true), "All Crafting recipes must remain deterministic");
}

function createModel(pack, input) {
  const items = array(pack.items);
  const recipes = array(pack.recipes);
  const economics = array(pack.itemEconomics);
  const matrix = array(pack.difficultyResolvedMatrix?.records);
  const substitutions = array(pack.substitutions);
  const itemByKey = new Map(items.map((item) => [item.itemKey, item]));
  const economicsByKey = new Map(economics.map((item) => [item.itemKey, item]));
  const matrixByRecipe = new Map(matrix.map((entry) => [entry.recipeKey, entry]));
  const substitutionsByGroup = new Map();
  for (const option of substitutions) {
    const values = substitutionsByGroup.get(option.groupKey) ?? [];
    values.push(option);
    substitutionsByGroup.set(option.groupKey, values);
  }
  const recipesByTier = new Map();
  for (const recipe of recipes) {
    const values = recipesByTier.get(recipe.tier) ?? [];
    values.push(recipe);
    recipesByTier.set(recipe.tier, values);
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

function itemScarcityBand(item) {
  const policy = record(item?.scarcityPolicy);
  return text(policy.band || policy.sourceDefinition || "default").toLowerCase() || "default";
}

function itemProbability(model, itemKey, country, difficulty, scenario) {
  const item = model.itemByKey.get(itemKey);
  const availability = record(model.input.availabilityModel);
  const bands = record(availability.scarcityBandProbability);
  const difficultyPolicy = record(model.pack.difficultyPolicy?.scarcityLink?.[difficulty]);
  const scenarioPolicy = record(model.input.scenarioModel?.[scenario]);
  const domestic = !item?.sourceCountryCode || item.sourceCountryCode === country;
  const band = itemScarcityBand(item);
  const base = number(bands[band], number(bands.default, 0.75));
  const difficultyMultiplier = number(difficultyPolicy.supplyMultiplier, 1);
  const geographyMultiplier = domestic
    ? number(availability.domesticMultiplier, 1)
    : number(availability.importMultiplier, 0.8);
  const scenarioMultiplier = domestic
    ? number(scenarioPolicy.domesticSupplyMultiplier, 1)
    : number(scenarioPolicy.importSupplyMultiplier, 1);
  const safetyStockMultiplier = number(difficultyPolicy.safetyStockMultiplier, 1);
  return clamp(
    base * difficultyMultiplier * geographyMultiplier * scenarioMultiplier * Math.sqrt(safetyStockMultiplier),
    number(availability.minimumProbability, 0.03),
    number(availability.maximumProbability, 0.995),
  );
}

function itemUnitPrice(model, itemKey, country, difficulty, scenario) {
  const item = model.itemByKey.get(itemKey);
  const economics = model.economicsByKey.get(itemKey);
  const scenarioPolicy = record(model.input.scenarioModel?.[scenario]);
  const difficultyPolicy = record(model.pack.difficultyPolicy?.scarcityLink?.[difficulty]);
  const domestic = !item?.sourceCountryCode || item.sourceCountryCode === country;
  const scenarioMultiplier = domestic
    ? number(scenarioPolicy.domesticPriceMultiplier, 1)
    : number(scenarioPolicy.importPriceMultiplier, 1.1);
  const scarcitySensitivity = number(difficultyPolicy.scarcityPriceSensitivity, 1);
  return Math.max(0.01, number(economics?.referencePrice, 1) * scenarioMultiplier * scarcitySensitivity);
}

function resolvedRecipeInputs(model, recipe, difficulty) {
  const matrix = model.matrixByRecipe.get(recipe.recipeKey);
  const resolved = record(matrix?.[difficulty]);
  const order = array(matrix?.ingredientOrder);
  const quantities = array(resolved.quantities);
  if (order.length && order.length === quantities.length) {
    return order.map((itemKey, index) => {
      const source = array(recipe.inputs).find((line) => line.itemKey === itemKey);
      return {
        ...source,
        itemKey,
        baseQuantity: Math.max(1, Math.round(number(quantities[index], source?.baseQuantity ?? 1))),
      };
    });
  }
  return array(recipe.inputs);
}

function recipeEligible(recipe, country, unlockedTier) {
  if (number(recipe.tier, 1) > unlockedTier) return false;
  const countries = array(recipe.countryCodes);
  return countries.length === 0 || countries.includes(country);
}

function selectRecipe(model, player, country, rng) {
  const candidates = [];
  for (let tier = 1; tier <= player.unlockedTier; tier += 1) {
    for (const recipe of model.recipesByTier.get(tier) ?? []) {
      if (recipeEligible(recipe, country, player.unlockedTier)) candidates.push(recipe);
    }
  }
  if (!candidates.length) return null;
  const leastCrafted = Math.min(...candidates.map((recipe) => player.recipeCrafts.get(recipe.recipeKey) ?? 0));
  const balanced = candidates.filter((recipe) => (player.recipeCrafts.get(recipe.recipeKey) ?? 0) <= leastCrafted + 1);
  return balanced[Math.floor(rng() * balanced.length)] ?? balanced[0] ?? null;
}

function consumeInventory(player, itemKey, required) {
  const current = number(player.inventory.get(itemKey), 0);
  const consumed = Math.min(current, required);
  if (consumed > 0) {
    const remaining = current - consumed;
    if (remaining > 0) player.inventory.set(itemKey, remaining);
    else player.inventory.delete(itemKey);
  }
  return required - consumed;
}

function chooseSubstitution(model, line, country, difficulty, scenario, rng) {
  if (!line.substitutionGroup) return null;
  const options = (model.substitutionsByGroup.get(line.substitutionGroup) ?? [])
    .filter((option) => option.enabled !== false)
    .filter((option) => !option.permitKey)
    .filter((option) => !array(option.countryCodes).length || array(option.countryCodes).includes(country))
    .filter((option) => !array(option.difficultyKeys).length || array(option.difficultyKeys).includes(difficulty));
  for (const option of options) {
    if (rng() <= itemProbability(model, option.itemKey, country, difficulty, scenario)) return option;
  }
  return null;
}

function attemptCraft(model, player, recipe, country, difficulty, scenario, rng) {
  const inputs = resolvedRecipeInputs(model, recipe, difficulty);
  let totalCost = 0;
  let importCost = 0;
  let domesticCost = 0;
  let substitutionExecutions = 0;
  const purchases = [];

  for (const line of inputs) {
    let required = consumeInventory(player, line.itemKey, number(line.baseQuantity, 1));
    if (required <= 0) continue;
    let purchasedItemKey = line.itemKey;
    let purchasedQuantity = required;
    let available = rng() <= itemProbability(model, line.itemKey, country, difficulty, scenario);
    if (!available) {
      const substitution = chooseSubstitution(model, line, country, difficulty, scenario, rng);
      if (!substitution) return { outcome: "supply_failure", substitutionExecutions };
      purchasedItemKey = substitution.itemKey;
      purchasedQuantity = Math.ceil(
        required * number(substitution.ratioNumerator, 1) /
          Math.max(1, number(substitution.ratioDenominator, 1)),
      );
      substitutionExecutions += 1;
      available = true;
    }
    if (!available) return { outcome: "supply_failure", substitutionExecutions };
    const item = model.itemByKey.get(purchasedItemKey);
    const cost = itemUnitPrice(model, purchasedItemKey, country, difficulty, scenario) * purchasedQuantity;
    const imported = Boolean(item?.sourceCountryCode) && item.sourceCountryCode !== country;
    totalCost += cost;
    if (imported) importCost += cost;
    else domesticCost += cost;
    purchases.push({ itemKey: purchasedItemKey, quantity: purchasedQuantity });
  }

  if (totalCost > player.funds + 1e-9) {
    return { outcome: "affordability_failure", substitutionExecutions };
  }

  player.funds -= totalCost;
  player.importSpend += importCost;
  player.domesticSpend += domesticCost;
  for (const output of array(recipe.outputs)) {
    const quantity = Math.max(1, number(output.quantity, 1));
    player.inventory.set(output.itemKey, number(player.inventory.get(output.itemKey), 0) + quantity);
    const economics = model.economicsByKey.get(output.itemKey);
    player.funds += number(economics?.referencePrice, 0) * quantity *
      number(model.input.playerEconomy?.outputRetentionValueRatio, 0.35);
  }
  return { outcome: "success", substitutionExecutions, purchases };
}

function updateUnlocks(player, input) {
  const thresholds = record(input.runConfiguration?.tierUnlockCrafts);
  if (player.unlockedTier === 1 && number(player.craftsByTier.get(1), 0) >= number(thresholds.tier2, 2)) {
    player.unlockedTier = 2;
  }
  if (player.unlockedTier === 2 && number(player.craftsByTier.get(2), 0) >= number(thresholds.tier3, 2)) {
    player.unlockedTier = 3;
  }
}

function createPlayer(input, difficulty) {
  return {
    funds: number(input.playerEconomy?.startingFunds?.[difficulty], 500),
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

function simulateRun(model, country, difficulty, scenario, seed) {
  const input = model.input;
  const run = record(input.runConfiguration);
  const players = Array.from(
    { length: number(run.playersPerCountry, 12) },
    (_, index) => createPlayer(input, difficulty, index),
  );
  const rng = createRng(country, difficulty, scenario, seed);
  const scenarioPolicy = record(input.scenarioModel?.[scenario]);
  const attemptsPerCycle = Math.max(1, number(input.playerEconomy?.maximumCraftAttemptsPerCycle, 1));

  for (let cycle = 1; cycle <= number(run.cycles, 30); cycle += 1) {
    for (const player of players) {
      player.funds += number(input.playerEconomy?.cycleIncome?.[difficulty], 100) *
        number(scenarioPolicy.incomeMultiplier, 1);
      for (let attemptIndex = 0; attemptIndex < attemptsPerCycle; attemptIndex += 1) {
        const recipe = selectRecipe(model, player, country, rng);
        if (!recipe) continue;
        player.attempts += 1;
        const result = attemptCraft(model, player, recipe, country, difficulty, scenario, rng);
        player.substitutionExecutions += number(result.substitutionExecutions, 0);
        if (result.outcome === "supply_failure") {
          player.supplyFailures += 1;
          continue;
        }
        if (result.outcome === "affordability_failure") {
          player.affordabilityFailures += 1;
          continue;
        }
        player.successfulCrafts += 1;
        const tier = number(recipe.tier, 1);
        player.craftsByTier.set(tier, number(player.craftsByTier.get(tier), 0) + 1);
        player.recipeCrafts.set(recipe.recipeKey, number(player.recipeCrafts.get(recipe.recipeKey), 0) + 1);
        if (tier === 1 && player.firstTier1Cycle === null) player.firstTier1Cycle = cycle;
        if (cycle <= 5 && tier === 1) player.tier1ByCycle5 = true;
        updateUnlocks(player, input);
      }
    }
  }

  const totalAttempts = players.reduce((sum, player) => sum + player.attempts, 0);
  const totalCrafts = players.reduce((sum, player) => sum + player.successfulCrafts, 0);
  const totalSupplyFailures = players.reduce((sum, player) => sum + player.supplyFailures, 0);
  const totalAffordabilityFailures = players.reduce((sum, player) => sum + player.affordabilityFailures, 0);
  const importSpend = players.reduce((sum, player) => sum + player.importSpend, 0);
  const domesticSpend = players.reduce((sum, player) => sum + player.domesticSpend, 0);
  const firstTierCycles = players.map((player) => player.firstTier1Cycle ?? number(run.cycles, 30) + 1);
  return {
    country,
    difficulty,
    scenario,
    seed,
    craftSuccessRate: totalAttempts ? totalCrafts / totalAttempts : 0,
    supplyFailureRate: totalAttempts ? totalSupplyFailures / totalAttempts : 0,
    affordabilityFailureRate: totalAttempts ? totalAffordabilityFailures / totalAttempts : 0,
    firstTier1MedianCycle: median(firstTierCycles),
    tier1ByCycle5Rate: players.filter((player) => player.tier1ByCycle5).length / players.length,
    tier3AccessRate: players.filter((player) => player.unlockedTier >= 3).length / players.length,
    importSpendShare: importSpend + domesticSpend > 0 ? importSpend / (importSpend + domesticSpend) : 0,
    substitutionExecutions: players.reduce((sum, player) => sum + player.substitutionExecutions, 0),
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
      craftSuccessMinimum: round(minimum(values.map((value) => value.craftSuccessRate))),
      supplyFailureMean: round(mean(values.map((value) => value.supplyFailureRate))),
      supplyFailureMaximum: round(maximum(values.map((value) => value.supplyFailureRate))),
      affordabilityFailureMean: round(mean(values.map((value) => value.affordabilityFailureRate))),
      affordabilityFailureMaximum: round(maximum(values.map((value) => value.affordabilityFailureRate))),
      firstTier1MedianCycleMean: round(mean(values.map((value) => value.firstTier1MedianCycle))),
      firstTier1MedianCycleMaximum: round(maximum(values.map((value) => value.firstTier1MedianCycle))),
      tier1ByCycle5Mean: round(mean(values.map((value) => value.tier1ByCycle5Rate))),
      tier1ByCycle5Minimum: round(minimum(values.map((value) => value.tier1ByCycle5Rate))),
      tier3AccessMean: round(mean(values.map((value) => value.tier3AccessRate))),
      importSpendShareMean: round(mean(values.map((value) => value.importSpendShare))),
      substitutionExecutions: values.reduce((sum, value) => sum + value.substitutionExecutions, 0),
    };
  }).sort((left, right) =>
    `${left.difficulty}:${left.scenario}:${left.country}`.localeCompare(
      `${right.difficulty}:${right.scenario}:${right.country}`,
    )
  );
}

function salvageRecraftLoops(model) {
  const outputRecipeByItem = new Map();
  for (const recipe of array(model.pack.recipes)) {
    for (const output of array(recipe.outputs)) {
      const values = outputRecipeByItem.get(output.itemKey) ?? [];
      values.push(recipe);
      outputRecipeByItem.set(output.itemKey, values);
    }
  }
  const loops = [];
  for (const rule of array(model.pack.salvageRules)) {
    const recipes = outputRecipeByItem.get(rule.equipmentItemKey) ?? [];
    for (const recipe of recipes) {
      const inputCost = array(recipe.inputs).reduce((sum, line) =>
        sum + itemUnitPrice(model, line.itemKey, "NORTHREACH", "moderate", "baseline") * number(line.baseQuantity, 1), 0);
      const recoveredValue = array(rule.outputs).reduce((sum, output) =>
        sum + itemUnitPrice(model, output.itemKey, "NORTHREACH", "moderate", "baseline") * number(output.quantity, 1), 0) *
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

function evaluateGates(model, aggregate) {
  const gates = record(model.input.gates);
  const run = record(model.input.runConfiguration);
  const failures = [];
  const warnings = [];
  const difficultySummary = {};

  for (const difficulty of array(run.difficulties)) {
    const baseline = aggregate.filter((row) => row.difficulty === difficulty && row.scenario === "baseline");
    const border = aggregate.filter((row) => row.difficulty === difficulty && row.scenario === "border_disruption");
    const baselineCraftMinimum = minimum(baseline.map((row) => row.craftSuccessMean));
    const borderSupplyMaximum = maximum(border.map((row) => row.supplyFailureMean));
    const tier1ByCycle5Minimum = minimum(baseline.map((row) => row.tier1ByCycle5Mean));
    const firstTierMaximum = maximum(baseline.map((row) => row.firstTier1MedianCycleMean));
    const countryFirstTierRange = maximum(baseline.map((row) => row.firstTier1MedianCycleMean)) -
      minimum(baseline.map((row) => row.firstTier1MedianCycleMean));
    const maximumImportSpendShare = maximum(
      aggregate.filter((row) => row.difficulty === difficulty).map((row) => row.importSpendShareMean),
    );
    difficultySummary[difficulty] = {
      baselineCraftSuccessMinimumObserved: round(baselineCraftMinimum),
      borderDisruptionSupplyFailureMaximumObserved: round(borderSupplyMaximum),
      tier1ByCycle5MinimumObserved: round(tier1ByCycle5Minimum),
      baselineFirstTier1MedianCycleMaximumObserved: round(firstTierMaximum),
      countryFirstTier1RangeObserved: round(countryFirstTierRange),
      baselineTier3GlobalMeanObserved: round(mean(baseline.map((row) => row.tier3AccessMean))),
      baselineImportSpendShareMean: round(mean(baseline.map((row) => row.importSpendShareMean))),
      maximumImportSpendShareMeanAcrossScenarios: round(maximumImportSpendShare),
    };

    const craftThreshold = number(gates.baselineCraftSuccessMinimum?.[difficulty]);
    const supplyThreshold = number(gates.borderDisruptionSupplyFailureMaximum?.[difficulty]);
    const tier1Threshold = number(gates.tier1ByCycle5Minimum?.[difficulty]);
    const firstTierThreshold = number(gates.baselineFirstTier1MedianCycleMaximum?.[difficulty]);
    const rangeThreshold = number(gates.countryFirstTier1RangeMaximum?.[difficulty]);

    for (const row of baseline) {
      if (row.craftSuccessMean < craftThreshold) {
        failures.push({ country: row.country.toLowerCase(), difficulty, gate: "baseline_craft_success_minimum", observed: row.craftSuccessMean, threshold: craftThreshold });
      }
      if (row.tier1ByCycle5Mean < tier1Threshold) {
        failures.push({ country: row.country.toLowerCase(), difficulty, gate: "tier1_by_cycle5_minimum", observed: row.tier1ByCycle5Mean, threshold: tier1Threshold });
      }
      if (row.firstTier1MedianCycleMean > firstTierThreshold) {
        failures.push({ country: row.country.toLowerCase(), difficulty, gate: "baseline_first_tier1_median_cycle_maximum", observed: row.firstTier1MedianCycleMean, threshold: firstTierThreshold });
      }
    }
    for (const row of border) {
      if (row.supplyFailureMean > supplyThreshold) {
        failures.push({ country: row.country.toLowerCase(), difficulty, gate: "border_disruption_supply_failure_maximum", observed: row.supplyFailureMean, threshold: supplyThreshold });
      }
    }
    if (countryFirstTierRange > rangeThreshold) {
      failures.push({ country: "all", difficulty, gate: "country_first_tier1_range_maximum", observed: round(countryFirstTierRange), threshold: rangeThreshold });
    }
    if (maximumImportSpendShare > number(gates.maximumImportSpendShareWarning, 0.8)) {
      warnings.push({ difficulty, gate: "import_spend_share", observed: round(maximumImportSpendShare), threshold: number(gates.maximumImportSpendShareWarning, 0.8) });
    }
  }

  const substitutionExecutions = aggregate.reduce((sum, row) => sum + row.substitutionExecutions, 0);
  if (substitutionExecutions < number(gates.minimumSubstitutionExecutions, 1)) {
    failures.push({ country: "all", difficulty: "all", gate: "minimum_substitution_executions", observed: substitutionExecutions, threshold: number(gates.minimumSubstitutionExecutions, 1) });
  }

  const recraftLoops = salvageRecraftLoops(model);
  const guaranteedBuybackArbitrage = model.input.safety?.systemBuybackAssumed === true ? 1 : 0;
  if (guaranteedBuybackArbitrage > number(gates.guaranteedSystemBuybackArbitrageMaximum, 0)) {
    failures.push({ country: "all", difficulty: "all", gate: "guaranteed_system_buyback_arbitrage_maximum", observed: guaranteedBuybackArbitrage, threshold: number(gates.guaranteedSystemBuybackArbitrageMaximum, 0) });
  }
  if (recraftLoops.length > number(gates.positiveSalvageRecraftLoopsMaximum, 0)) {
    failures.push({ country: "all", difficulty: "all", gate: "positive_salvage_recraft_loops_maximum", observed: recraftLoops.length, threshold: number(gates.positiveSalvageRecraftLoopsMaximum, 0) });
  }

  return {
    schemaVersion: "econovaria-physical-economy-gate-summary-v2",
    status: "executed-candidate-calibration",
    activationAuthorized: failures.length === 0,
    decision: failures.length === 0 ? "candidate_pass_requires_authority_review" : "recalibrate_do_not_activate",
    runConfiguration: {
      countries: array(run.countries).length,
      difficulties: array(run.difficulties).length,
      scenarios: array(run.scenarios).length,
      seeds: number(run.seeds),
      playersPerCountry: number(run.playersPerCountry),
      cycles: number(run.cycles),
      runCount: array(run.countries).length * array(run.difficulties).length * array(run.scenarios).length * number(run.seeds),
    },
    difficultySummary,
    integrityGates: {
      guaranteedSystemBuybackArbitrage: guaranteedBuybackArbitrage,
      positiveSalvageRecraftLoops: recraftLoops.length,
      recraftLoopEvidence: recraftLoops,
      substitutionExecutions,
    },
    gateCounts: {
      failed: failures.length,
      passed: Math.max(0, 5 * array(run.difficulties).length + 3 - failures.length),
      implemented: 5 * array(run.difficulties).length + 3,
      unresolved: 0,
    },
    failures,
    warnings,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(options.outputDir, { recursive: true });
  const input = await readJson(options.input);
  const contract = await readJson(CONTRACT_PATH);
  validateSimulationInput(input);

  const runtimePackPath = path.join(options.outputDir, "physical-economy-runtime-pack-v2-candidate.json");
  buildRuntimePack({ contract, outputFile: runtimePackPath });
  const pack = await readJson(runtimePackPath);
  validateRuntimePack(pack);
  const model = createModel(pack, input);

  const rawRuns = [];
  const run = record(input.runConfiguration);
  for (const country of array(run.countries)) {
    for (const difficulty of array(run.difficulties)) {
      for (const scenario of array(run.scenarios)) {
        for (let seed = 1; seed <= number(run.seeds, 100); seed += 1) {
          rawRuns.push(simulateRun(model, country, difficulty, scenario, seed));
        }
      }
    }
  }

  const aggregate = aggregateRuns(rawRuns);
  const gateSummary = evaluateGates(model, aggregate);
  const rawJsonl = rawRuns.map((row) => JSON.stringify(row)).join("\n") + "\n";
  const aggregateContent = canonicalJson({
    schemaVersion: "econovaria-physical-economy-aggregate-results-v2",
    rows: aggregate,
  });
  const gateContent = canonicalJson(gateSummary);
  const inputContent = await readFile(options.input);
  const scriptContent = await readFile(SCRIPT_PATH);
  const rawArchive = gzipSync(rawJsonl, { level: 9, mtime: 0 });
  const manifest = {
    schemaVersion: "econovaria-physical-economy-run-manifest-v2",
    status: "repository-ingested-candidate-evidence",
    activationAuthorized: false,
    runConfiguration: gateSummary.runConfiguration,
    files: {
      input: path.relative(REPO_ROOT, options.input).split(path.sep).join("/"),
      script: path.relative(REPO_ROOT, SCRIPT_PATH).split(path.sep).join("/"),
      aggregateResults: "physical-economy-aggregate-results-v2.json",
      gateSummary: "physical-economy-gate-summary-v2.json",
      rawResults: "physical-economy-raw-results-v2.jsonl",
      rawResultsArchive: "physical-economy-raw-results-v2.jsonl.gz",
    },
    sha256: {
      input: sha256(inputContent),
      script: sha256(scriptContent),
      aggregateResults: sha256(aggregateContent),
      gateSummary: sha256(gateContent),
      rawResults: sha256(rawJsonl),
      rawResultsArchive: sha256(rawArchive),
    },
    decision: gateSummary.decision,
    failedGates: gateSummary.gateCounts.failed,
  };

  await Promise.all([
    writeFile(path.join(options.outputDir, "physical-economy-aggregate-results-v2.json"), aggregateContent),
    writeFile(path.join(options.outputDir, "physical-economy-gate-summary-v2.json"), gateContent),
    writeFile(path.join(options.outputDir, "physical-economy-raw-results-v2.jsonl"), rawJsonl),
    writeFile(path.join(options.outputDir, "physical-economy-raw-results-v2.jsonl.gz"), rawArchive),
    writeFile(path.join(options.outputDir, "physical-economy-run-manifest-v2.json"), canonicalJson(manifest)),
  ]);

  console.log(canonicalJson({
    runCount: rawRuns.length,
    decision: gateSummary.decision,
    activationAuthorized: gateSummary.activationAuthorized,
    failedGates: gateSummary.gateCounts.failed,
    warnings: gateSummary.warnings.length,
    substitutionExecutions: gateSummary.integrityGates.substitutionExecutions,
    positiveSalvageRecraftLoops: gateSummary.integrityGates.positiveSalvageRecraftLoops,
    guaranteedSystemBuybackArbitrage: gateSummary.integrityGates.guaranteedSystemBuybackArbitrage,
    outputDir: options.outputDir,
  }).trimEnd());

  if (options.requirePass && !gateSummary.activationAuthorized) process.exitCode = 1;
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
