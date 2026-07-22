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
  const consumerContract = JSON.parse(await readFile(consumerContractPath, "utf8"));
  const catalogManifest = JSON.parse(await readFile(catalogManifestPath, "utf8"));
  const recipeManifest = JSON.parse(await readFile(recipeManifestPath, "utf8"));

  assertSchema(
    consumerContract,
    "econovaria-beta-seed-downstream-consumer-contract-v1",
    consumerContractPath,
  );
  assertSchema(catalogManifest, "econovaria-base-item-manifest-v1", catalogManifestPath);
  assertSchema(recipeManifest, "econovaria-recipe-manifest-v1", recipeManifestPath);

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
  const calibrationPath = path.join(seedRoot, "executable/beta-pack-v1/physical-economy-calibration-v1.json");
  const gateSummaryPath = path.join(
    seedRoot,
    "simulation/physical-economy/physical-economy-gate-summary-v1.json",
  );

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
  const calibration = JSON.parse(await readFile(calibrationPath, "utf8"));
  const balanceGateSummary = JSON.parse(await readFile(gateSummaryPath, "utf8"));
  await validateSeedConsumerContract({
    contract: consumerContract,
    sourceCommit: options.sourceCommit,
    approvedSourceCommit: options.approvedSourceCommit,
    packKey: options.packKey,
    contentVersion: options.contentVersion,
    sourceRoot,
  });
  const substitutions = normalizeSubstitutions(substitutionDocument, itemByKey, substitutionsPath);
  const salvageRules = normalizeSalvageRules(salvageDocument, itemByKey, salvagePath);
  const itemEconomics = normalizeItemEconomics(calibration, itemByKey);

  const pack = {
    schemaVersion: "econovaria-physical-economy-runtime-pack-v1",
    packKey: options.packKey,
    contentVersion: options.contentVersion,
    sourceCommit: options.sourceCommit,
    definitionAuthority: "PR #163",
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
      calibrationPath: relative(calibrationPath, sourceRoot),
      balanceGateSummaryPath: relative(gateSummaryPath, sourceRoot),
    },
    activationAuthorization: {
      catalogAuthorized: catalogManifest.validation?.productionImportApproved === true,
      recipeAuthorized: recipeManifest.rules?.backendActivationAuthorized === true,
      calibrationAuthorized: calibration.activationAuthorized === true,
      downstreamContractValidated: true,
      productionAuthorized: consumerContract.productionAuthorized === true,
      requiredBindings: consumerContract.activationApproval?.requiredBindings ?? {},
    },
    calibrationEvidence: {
      exploitChecks: calibration.exploitChecks ?? {},
      concurrencySimulation: calibration.concurrencySimulation ?? {},
      balanceGateSummary,
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
