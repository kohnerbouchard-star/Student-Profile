import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateSeedConsumerContract } from "./lib/physical-economy-pack-contract.mjs";
import {
  normalizeItem, normalizeItemEconomics, normalizeRecipe, normalizeSalvageRules,
  normalizeSubstitutions,
} from "./lib/physical-economy-pack-normalizers.mjs";
import {
  assertSchema, assertUnique, by, parseArgs, relative, requireObject, requiredArray, text,
} from "./lib/physical-economy-pack-utils.mjs";

const diagnosticPath = path.resolve(
  "player-terminal/test-results/crafting-seed-build.log",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertEvidenceHash(authority, key, content, filePath) {
  const expected = authority.calibrationEvidence?.sha256?.[key];
  if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error(`Activation authority is missing the ${key} SHA-256 binding.`);
  }
  const actual = sha256(content);
  if (actual !== expected) {
    throw new Error(`${filePath} SHA-256 mismatch: expected ${expected}, got ${actual}`);
  }
}

function validateActivationAuthority({
  authority,
  catalogManifest,
  recipeManifest,
  balanceGateSummary,
  runManifest,
  inputContent,
  scriptContent,
  gateSummaryContent,
  inputPath,
  scriptPath,
  gateSummaryPath,
}) {
  assertSchema(
    authority,
    "econovaria-physical-economy-activation-authorization-v2",
    "physical-economy activation authority",
  );
  if (authority.status !== "approved_non_production") {
    throw new Error("Physical-economy activation authority is not approved.");
  }
  if (
    authority.catalogAuthorized !== true ||
    authority.recipeAuthorized !== true ||
    authority.calibrationAuthorized !== true ||
    authority.productionAuthorized !== false
  ) {
    throw new Error("Physical-economy authority must approve catalog, recipes, and calibration while denying production.");
  }
  const environments = Array.isArray(authority.approvedEnvironments)
    ? authority.approvedEnvironments
    : [];
  for (const environment of ["local", "test", "staging"]) {
    if (!environments.includes(environment)) {
      throw new Error(`Physical-economy authority is missing ${environment} approval.`);
    }
  }
  if (
    authority.definitions?.catalogSchemaVersion !== catalogManifest.schemaVersion ||
    authority.definitions?.recipeSchemaVersion !== recipeManifest.schemaVersion ||
    Number(authority.definitions?.itemCount) !== Number(catalogManifest.totalItemDefinitions) ||
    Number(authority.definitions?.recipeCount) !== Number(recipeManifest.totalRecipes) ||
    authority.definitions?.durabilityEnabled !== false ||
    authority.definitions?.repairEnabled !== false ||
    authority.definitions?.hiddenCraftFailureRollAllowed !== false
  ) {
    throw new Error("Physical-economy authority does not match the current definition manifests.");
  }
  if (
    balanceGateSummary.schemaVersion !== "econovaria-physical-economy-gate-summary-v3" ||
    balanceGateSummary.calibrationPassed !== true ||
    balanceGateSummary.gateCounts?.failed !== 0 ||
    balanceGateSummary.gateCounts?.unresolved !== 0 ||
    balanceGateSummary.gateCounts?.implemented !== 167 ||
    !Array.isArray(balanceGateSummary.failures) ||
    balanceGateSummary.failures.length !== 0
  ) {
    throw new Error("Physical-economy V3 calibration evidence has not passed all executable gates.");
  }
  if (
    runManifest.schemaVersion !== "econovaria-physical-economy-run-manifest-v3" ||
    runManifest.calibrationPassed !== true ||
    runManifest.failedGates !== 0 ||
    runManifest.runConfiguration?.runCount !== 16000
  ) {
    throw new Error("Physical-economy V3 run manifest is invalid.");
  }
  assertEvidenceHash(authority, "input", inputContent, inputPath);
  assertEvidenceHash(authority, "script", scriptContent, scriptPath);
  assertEvidenceHash(authority, "gateSummary", gateSummaryContent, gateSummaryPath);
  if (runManifest.sha256?.input !== authority.calibrationEvidence.sha256.input ||
      runManifest.sha256?.script !== authority.calibrationEvidence.sha256.script ||
      runManifest.sha256?.gateSummary !== authority.calibrationEvidence.sha256.gateSummary) {
    throw new Error("Physical-economy run manifest does not match the activation authority.");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceRoot = path.resolve(options.sourceRoot);
  const seedRoot = path.join(sourceRoot, "docs/seed-content");
  const consumerContractPath = path.join(
    sourceRoot,
    "docs/operations/contracts/beta-seed-downstream-consumer-contract-v1.json",
  );
  const catalogManifestPath = path.join(seedRoot, "items/catalog-manifest-v1.json");
  const recipeRoot = path.join(seedRoot, "items/recipes");
  const recipeManifestPath = path.join(recipeRoot, "recipe-manifest-v1.json");
  const economicsCalibrationPath = path.join(
    seedRoot,
    "executable/beta-pack-v1/physical-economy-calibration-v1.json",
  );
  const activationAuthorityPath = path.join(
    seedRoot,
    "authorizations/physical-economy-activation-authorization-v2.json",
  );
  const simulationRoot = path.join(seedRoot, "simulation/physical-economy");
  const gateSummaryPath = path.join(
    simulationRoot,
    "physical-economy-gate-summary-v3.json",
  );
  const runManifestPath = path.join(
    simulationRoot,
    "physical-economy-run-manifest-v3.json",
  );
  const simulationInputPath = path.join(
    simulationRoot,
    "physical-economy-simulation-input-v3.json",
  );
  const simulationScriptPath = path.join(
    sourceRoot,
    "scripts/simulate-physical-economy-activation-v3.mjs",
  );

  const [
    consumerContract,
    catalogManifest,
    recipeManifest,
    economicsCalibration,
    activationAuthority,
    balanceGateSummary,
    runManifest,
    inputContent,
    scriptContent,
    gateSummaryContent,
  ] = await Promise.all([
    readFile(consumerContractPath, "utf8").then(JSON.parse),
    readFile(catalogManifestPath, "utf8").then(JSON.parse),
    readFile(recipeManifestPath, "utf8").then(JSON.parse),
    readFile(economicsCalibrationPath, "utf8").then(JSON.parse),
    readFile(activationAuthorityPath, "utf8").then(JSON.parse),
    readFile(gateSummaryPath, "utf8").then(JSON.parse),
    readFile(runManifestPath, "utf8").then(JSON.parse),
    readFile(simulationInputPath),
    readFile(simulationScriptPath),
    readFile(gateSummaryPath),
  ]);

  assertSchema(
    consumerContract,
    "econovaria-beta-seed-downstream-consumer-contract-v1",
    consumerContractPath,
  );
  assertSchema(catalogManifest, "econovaria-base-item-manifest-v1", catalogManifestPath);
  assertSchema(recipeManifest, "econovaria-recipe-manifest-v1", recipeManifestPath);
  validateActivationAuthority({
    authority: activationAuthority,
    catalogManifest,
    recipeManifest,
    balanceGateSummary,
    runManifest,
    inputContent,
    scriptContent,
    gateSummaryContent,
    inputPath: simulationInputPath,
    scriptPath: simulationScriptPath,
    gateSummaryPath,
  });

  const itemFiles = catalogManifest.files.map((entry) => {
    requireObject(entry, "catalog manifest file");
    return path.join(seedRoot, text(entry.path));
  });
  const recipeFileKeys = ["tier1", "tier2", "tier3", "regulated"];
  const recipeFiles = recipeFileKeys.map((key) =>
    path.join(recipeRoot, text(recipeManifest.files?.[key]))
  );
  const substitutionsPath = path.join(recipeRoot, text(recipeManifest.files?.substitutions));
  const salvagePath = path.join(recipeRoot, text(recipeManifest.files?.maintenanceSalvage));
  const difficultyPolicyPath = path.join(recipeRoot, text(recipeManifest.files?.difficultyPolicy));
  const difficultyMatrixPath = path.join(recipeRoot, text(recipeManifest.files?.difficultyResolvedMatrix));

  const items = [];
  for (const file of itemFiles) {
    const document = JSON.parse(await readFile(file, "utf8"));
    const records = requiredArray(document.records, `records in ${file}`);
    if (Number(document.count) !== records.length) {
      throw new Error(`${file} count mismatch: declared ${document.count}, read ${records.length}`);
    }
    for (const raw of records) items.push(normalizeItem(raw, file, sourceRoot));
  }

  assertUnique(items, "itemKey");
  if (items.length !== Number(catalogManifest.totalItemDefinitions)) {
    throw new Error(`Catalog count mismatch: expected ${catalogManifest.totalItemDefinitions}, got ${items.length}`);
  }
  const itemByKey = new Map(items.map((item) => [item.itemKey, item]));

  const recipes = [];
  for (const file of recipeFiles) {
    const document = JSON.parse(await readFile(file, "utf8"));
    const records = requiredArray(document.records, `records in ${file}`);
    if (Number(document.count) !== records.length) {
      throw new Error(`${file} count mismatch: declared ${document.count}, read ${records.length}`);
    }
    for (const raw of records) recipes.push(normalizeRecipe(raw, file, itemByKey, sourceRoot));
  }
  assertUnique(recipes, "recipeKey");
  if (recipes.length !== Number(recipeManifest.totalRecipes)) {
    throw new Error(`Recipe count mismatch: expected ${recipeManifest.totalRecipes}, got ${recipes.length}`);
  }
  for (const recipe of recipes) {
    for (const line of [...recipe.inputs, ...recipe.outputs]) {
      if (!itemByKey.has(line.itemKey)) {
        throw new Error(`${recipe.recipeKey} references unknown item ${line.itemKey}`);
      }
    }
  }

  const substitutionDocument = JSON.parse(await readFile(substitutionsPath, "utf8"));
  const salvageDocument = JSON.parse(await readFile(salvagePath, "utf8"));
  const difficultyPolicy = JSON.parse(await readFile(difficultyPolicyPath, "utf8"));
  const difficultyResolvedMatrix = JSON.parse(await readFile(difficultyMatrixPath, "utf8"));
  await validateSeedConsumerContract({
    contract: consumerContract,
    sourceCommit: options.sourceCommit,
    approvedSourceCommit: options.approvedSourceCommit,
    packKey: options.packKey,
    contentVersion: options.contentVersion,
    sourceRoot,
  });
  const substitutions = normalizeSubstitutions(
    substitutionDocument,
    itemByKey,
    substitutionsPath,
  );
  const salvageRules = normalizeSalvageRules(
    salvageDocument,
    itemByKey,
    salvagePath,
  );
  const itemEconomics = normalizeItemEconomics(economicsCalibration, itemByKey);
  if (
    items.length !== Number(activationAuthority.definitions.itemCount) ||
    recipes.length !== Number(activationAuthority.definitions.recipeCount) ||
    substitutions.length !== Number(activationAuthority.definitions.substitutionCount) ||
    salvageRules.length !== Number(activationAuthority.definitions.salvageRuleCount)
  ) {
    throw new Error("Physical-economy definition counts do not match the activation authority.");
  }

  const authorizedBalanceGateSummary = {
    ...balanceGateSummary,
    activationAuthorized: true,
    authorizationId: activationAuthority.authorizationId,
    approvedBy: activationAuthority.approvedBy,
    approvedAt: activationAuthority.approvedAt,
    approvedEnvironments: activationAuthority.approvedEnvironments,
    productionAuthorized: false,
    acceptedStagingRisks: activationAuthority.acceptedStagingRisks,
  };

  const pack = {
    schemaVersion: "econovaria-physical-economy-runtime-pack-v1",
    packKey: options.packKey,
    contentVersion: options.contentVersion,
    sourceCommit: options.sourceCommit,
    definitionAuthority: "PR #163 with bounded V3 staging activation authority",
    durabilityEnabled: false,
    repairEnabled: false,
    sourceContracts: {
      downstreamConsumerContractSchemaVersion: consumerContract.schemaVersion,
      downstreamConsumerContractPath: relative(consumerContractPath, sourceRoot),
      acceptedImplementationSourceSha: consumerContract.acceptedImplementationSourceSha,
      packDigest: consumerContract.packDigest,
      consumerRules: consumerContract.consumerRules,
      lifecycleSemantics: consumerContract.lifecycleSemantics,
      maintenanceDefinitionStatus: salvageDocument.status ?? "definition-only",
      catalogSchemaVersion: catalogManifest.schemaVersion,
      catalogVersion: catalogManifest.catalogVersion,
      recipeSchemaVersion: recipeManifest.schemaVersion,
      substitutionSchemaVersion: substitutionDocument.schemaVersion,
      salvageSchemaVersion: salvageDocument.schemaVersion,
      difficultyPolicySchemaVersion: difficultyPolicy.schemaVersion,
      difficultyMatrixSchemaVersion: difficultyResolvedMatrix.schemaVersion,
      economicsCalibrationPath: relative(economicsCalibrationPath, sourceRoot),
      activationAuthorityPath: relative(activationAuthorityPath, sourceRoot),
      balanceGateSummaryPath: relative(gateSummaryPath, sourceRoot),
      runManifestPath: relative(runManifestPath, sourceRoot),
    },
    activationAuthorization: {
      catalogAuthorized: activationAuthority.catalogAuthorized === true,
      recipeAuthorized: activationAuthority.recipeAuthorized === true,
      calibrationAuthorized: activationAuthority.calibrationAuthorized === true,
      downstreamContractValidated: true,
      productionAuthorized: consumerContract.productionAuthorized === true,
      approvedEnvironments: activationAuthority.approvedEnvironments,
      authorizationId: activationAuthority.authorizationId,
      approvedBy: activationAuthority.approvedBy,
      approvedAt: activationAuthority.approvedAt,
      expiresAt: activationAuthority.expiresAt,
      requiredBindings: consumerContract.activationApproval?.requiredBindings ?? {},
    },
    calibrationEvidence: {
      exploitChecks: economicsCalibration.exploitChecks ?? {},
      concurrencySimulation: economicsCalibration.concurrencySimulation ?? {},
      balanceGateSummary: authorizedBalanceGateSummary,
      runManifest,
      acceptedStagingRisks: activationAuthority.acceptedStagingRisks,
    },
    difficultyPolicy,
    difficultyResolvedMatrix,
    itemEconomics,
    items: items.sort(by("itemKey")),
    recipes: recipes.sort(by("recipeKey")),
    substitutions,
    salvageRules,
  };
  const canonical = `${JSON.stringify(pack)}\n`;
  const digest = createHash("sha256").update(canonical).digest("hex");
  const output = {
    ...pack,
    contentDigest: digest,
    counts: {
      items: items.length,
      recipes: recipes.length,
      substitutions: substitutions.length,
      salvageRules: salvageRules.length,
    },
  };
  await writeFile(options.output, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({
    output: options.output,
    contentDigest: digest,
    ...output.counts,
    activationAuthorized: true,
    approvedEnvironments: activationAuthority.approvedEnvironments,
    productionAuthorized: false,
    durabilityEnabled: false,
    repairEnabled: false,
  }, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error
    ? `${error.stack || error.message}\n`
    : `${String(error)}\n`;
  mkdirSync(path.dirname(diagnosticPath), { recursive: true });
  writeFileSync(diagnosticPath, message, "utf8");
  console.error(message.trimEnd());
  process.exitCode = 1;
});
