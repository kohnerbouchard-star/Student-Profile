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
function persistFailure(error) {
  const message = error instanceof Error
    ? `${error.stack || error.message}\n`
    : `${String(error)}\n`;
  mkdirSync(path.dirname(diagnosticPath), { recursive: true });
  writeFileSync(diagnosticPath, message, "utf8");
  console.error(message.trimEnd());
  process.exitCode = 1;
}
process.on("uncaughtException", persistFailure);
process.on("unhandledRejection", persistFailure);

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
  path.join(recipeRoot, text(recipeManifest.files?.[key]?.path)),
);
const substitutionFile = path.join(recipeRoot, text(recipeManifest.files?.substitutions?.path));
const maintenanceFile = path.join(recipeRoot, text(recipeManifest.files?.maintenanceAndSalvage?.path));

await validateSeedConsumerContract({
  contract: consumerContract,
  sourceCommit: options.sourceCommit,
  approvedSourceCommit: options.approvedSourceCommit,
  packKey: options.packKey,
  contentVersion: options.contentVersion,
  sourceRoot,
});

const itemDocs = await Promise.all(itemFiles.map(async (file) => ({
  file,
  value: JSON.parse(await readFile(file, "utf8")),
})));
const recipeDocs = await Promise.all(recipeFiles.map(async (file) => ({
  file,
  value: JSON.parse(await readFile(file, "utf8")),
})));
const substitutionDoc = JSON.parse(await readFile(substitutionFile, "utf8"));
const maintenanceDoc = JSON.parse(await readFile(maintenanceFile, "utf8"));

const items = [];
for (const { file, value } of itemDocs) {
  const definitions = requiredArray(value, "definitions", file);
  for (const definition of definitions) {
    items.push(normalizeItem(definition, file));
  }
}
assertUnique(items, "itemKey", "items");
if (items.length !== catalogManifest.totalItemDefinitions) {
  throw new Error(
    `Item count mismatch: manifest=${catalogManifest.totalItemDefinitions} runtime=${items.length}`,
  );
}

const itemKeys = new Set(items.map((item) => item.itemKey));
const itemEconomics = normalizeItemEconomics(
  consumerContract,
  itemKeys,
);
const economicsByKey = new Map(itemEconomics.map((entry) => [entry.itemKey, entry]));
for (const item of items) {
  const economics = economicsByKey.get(item.itemKey);
  if (!economics) throw new Error(`Missing economics for ${item.itemKey}`);
  item.economics = economics;
}

const recipes = [];
for (const { file, value } of recipeDocs) {
  const definitions = requiredArray(value, "recipes", file);
  for (const definition of definitions) {
    recipes.push(normalizeRecipe(definition, file, itemKeys));
  }
}
assertUnique(recipes, "recipeKey", "recipes");
if (recipes.length !== recipeManifest.totalRecipeDefinitions) {
  throw new Error(
    `Recipe count mismatch: manifest=${recipeManifest.totalRecipeDefinitions} runtime=${recipes.length}`,
  );
}

const substitutions = normalizeSubstitutions(substitutionDoc, substitutionFile, itemKeys);
const salvageRules = normalizeSalvageRules(maintenanceDoc, maintenanceFile, itemKeys);

const sourceContracts = {
  downstreamContract: relative(sourceRoot, consumerContractPath),
  catalogManifest: relative(sourceRoot, catalogManifestPath),
  recipeManifest: relative(sourceRoot, recipeManifestPath),
  packDigest: consumerContract.packDigest,
  acceptedImplementationSourceSha: consumerContract.acceptedImplementationSourceSha,
};
const activationAuthorization = {
  catalogAuthorized: consumerContract.activationAuthorization?.catalogAuthorized === true,
  recipeAuthorized: consumerContract.activationAuthorization?.recipeAuthorized === true,
  calibrationAuthorized: consumerContract.activationAuthorization?.calibrationAuthorized === true,
  downstreamContractValidated:
    consumerContract.activationAuthorization?.downstreamContractValidated === true,
  productionAuthorized: consumerContract.activationAuthorization?.productionAuthorized === true,
  blockers: requiredArray(
    consumerContract.activationAuthorization,
    "blockers",
    consumerContractPath,
  ).map((value) => text(value)),
};

const pack = {
  schemaVersion: "econovaria-physical-economy-runtime-pack-v1",
  packKey: options.packKey,
  contentVersion: options.contentVersion,
  definitionAuthority: "PR #163",
  sourceCommit: options.sourceCommit,
  sourceContracts,
  activationAuthorization,
  calibrationEvidence: consumerContract.calibrationEvidence,
  policy: {
    durabilityEnabled: false,
    repairEnabled: false,
    maintenanceMode: "definition-only-fail-closed",
    reservationSourceOfTruth: "inventory_reservations",
  },
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
