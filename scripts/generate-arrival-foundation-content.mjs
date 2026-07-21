import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedRoot = path.join(repoRoot, "docs", "seed-content");
const packagesPath = path.join(seedRoot, "players", "arrival-packages-v1.json");
const messagesPath = path.join(seedRoot, "messages", "arrival-messages-v1.json");
const tutorialsPath = path.join(seedRoot, "tutorials", "arrival-tutorials-v1.json");
const contractsPath = path.join(seedRoot, "contracts", "arrival", "arrival-contracts-v1.json");
const checkOnly = process.argv.includes("--check");

const profiles = {
  northreach: { city: "Frostgate", housing: "moderate-high", expenses: "high", support: "employer-accommodation-window", firstAction: "confirm your temporary housing deadline and review essential heating and transport costs" },
  yrethia: { city: "Sableport", housing: "high", expenses: "moderate-high", support: "supervised-records-correction", firstAction: "correct your address and work-document mismatch before accepting port work" },
  thaloris: { city: "Dusk Harbor", housing: "moderate", expenses: "moderate", support: "community-guarantor-and-cooperative", firstAction: "verify lodging and a legally recognized work contact" },
  solvend: { city: "Aurora Spire", housing: "high", expenses: "high", support: "provisional-skills-assessment", firstAction: "validate your credentials or book a provisional skills assessment" },
  eldoran: { city: "Crescent Bay", housing: "low-moderate", expenses: "low-moderate", support: "food-security-and-market-placement", firstAction: "secure affordable housing and identify reliable food-market access" },
  valerion: { city: "Glassfall", housing: "very-high", expenses: "high", support: "shared-housing-and-public-service-placement", firstAction: "satisfy the address and deposit requirements without exhausting your emergency buffer" },
  lumenor: { city: "Starfall", housing: "high", expenses: "moderate-high", support: "settlement-address-and-public-housing-review", firstAction: "secure a recognized address for work, banking, and residency processing" },
  xalvoria: { city: "Emberhall", housing: "high", expenses: "high", support: "development-authority-placement-and-debt-counseling", firstAction: "establish a bankable identity, address, and verified sponsor" },
  dravenlok: { city: "Ironhold", housing: "moderate", expenses: "moderate", support: "worker-housing-and-technical-placement", firstAction: "complete technical placement and confirm worker-housing eligibility" },
  syndalis: { city: "Blacklight", housing: "high", expenses: "high", support: "identity-appeal-and-community-access", firstAction: "establish verified digital identity while securing temporary physical housing" },
};

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function compareOrWrite(filePath, expected) {
  let current = null;
  try { current = await readFile(filePath, "utf8"); } catch {}
  if (current === expected) return false;
  if (checkOnly) {
    console.error(`Arrival-content drift: ${path.relative(repoRoot, filePath)}`);
    return true;
  }
  await writeFile(filePath, expected, "utf8");
  return true;
}

const registry = await readJson(packagesPath);
if (!Array.isArray(registry.packages) || registry.packages.length !== 10) throw new Error("Arrival registry must contain exactly ten packages.");

const messages = [];
const tutorials = [];
const contracts = [];
const packageIds = new Set();

registry.packages = registry.packages.map((arrival) => {
  const profile = profiles[arrival.country];
  if (!profile) throw new Error(`No arrival profile exists for ${arrival.country}.`);
  if (packageIds.has(arrival.id)) throw new Error(`Duplicate arrival package ${arrival.id}.`);
  packageIds.add(arrival.id);

  const messageId = `message.arrival.${arrival.country}.welcome.v1`;
  const tutorialId = `tutorial.arrival.${arrival.country}.first-steps.v1`;
  const contractId = `contract.arrival.${arrival.country}.stabilization.v1`;

  messages.push({
    id: messageId,
    country: arrival.country,
    channel: "system-arrival",
    title: `Welcome to ${profile.city}`,
    body: `Your immediate priority is to ${profile.firstAction}. Protect your emergency buffer, verify every offer, and use the official recovery route if the first plan fails.`,
    relatedArrivalPackageId: arrival.id,
    relatedTutorialId: tutorialId,
    relatedContractId: contractId,
    deliveryStatus: "definition-only",
    activationAuthorized: false,
  });

  tutorials.push({
    id: tutorialId,
    country: arrival.country,
    title: `${profile.city} First Steps`,
    relatedArrivalPackageId: arrival.id,
    completionRewardStatus: "none-until-authoritative-tutorial-capability",
    steps: [
      { order: 1, action: "verify-identity-and-address", instruction: "Confirm your Player identity, country assignment, address status, and official local currency." },
      { order: 2, action: "review-starting-budget", instruction: "Review housing, ordinary expenses, and the protected emergency-buffer target before spending." },
      { order: 3, action: "review-market-and-store-access", instruction: "Identify which banking, Store, and market functions are currently available rather than assuming every feature is active." },
      { order: 4, action: "accept-introductory-contract", instruction: "Review and accept the official stabilization Contract only after checking its objective, deadline, and reward policy." },
      { order: 5, action: "record-recovery-route", instruction: "Save the named recovery route and use it before taking high-cost debt or unverified employment." },
    ],
    runtimeSupport: "definition-only",
    activationAuthorized: false,
  });

  contracts.push({
    id: contractId,
    country: arrival.country,
    sourceType: "system-seeded",
    title: `${profile.city} Arrival Stabilization`,
    objective: profile.firstAction,
    instructions: [
      "Review the official arrival message and local cost bands.",
      "Confirm one valid housing or address path.",
      "Identify one verified employment, training, public-service, or enterprise lead.",
      "Record the official recovery route and preserve the emergency buffer.",
    ],
    submissionRequirement: "Submit a short stabilization plan naming the selected housing path, verified opportunity, first-week budget priorities, and fallback route.",
    targetArrivalPackageId: arrival.id,
    rewardPolicy: {
      type: "local-currency-candidate-band",
      amountBand: "one-week-basic-needs-offset",
      calibrationStatus: "simulation-pending",
      issuanceStatus: "blocked-until-authoritative-contract-reward-capability",
    },
    difficultyPolicy: "The objective and reward value remain stable; harder sessions may tighten availability, timing, and substitute options only after simulation.",
    recoveryCritical: true,
    runtimeSupport: "definition-only",
    activationAuthorized: false,
  });

  return {
    ...arrival,
    startingCashBand: "three-week-basic-needs-buffer-candidate",
    housingCostBand: profile.housing,
    ordinaryExpenseBand: profile.expenses,
    initialSupportBand: profile.support,
    firstMessageId: messageId,
    firstContractId: contractId,
    firstTutorialId: tutorialId,
    bankingAccessStatus: "basic-read-and-policy-review-definition-only",
    storeAccessStatus: "bounded-essential-catalog-definition-only",
    marketAccessStatus: "bounded-country-candidate-definition-only",
    balanceStatus: "relative-bands-complete-numeric-calibration-pending",
    activationAuthorized: false,
  };
});

registry.maturity = "mechanical-references-complete-numeric-calibration-pending";
registry.productionAuthorized = false;
registry.balancePolicy = {
  commonStartingBufferTarget: "three-week-basic-needs-buffer-candidate",
  countryCostDifferences: "offset through named support and recovery paths before numerical approval",
  numericValuesApproved: false,
  simulationRequired: true,
};
registry.contentReferences = {
  messages: "../messages/arrival-messages-v1.json",
  tutorials: "../tutorials/arrival-tutorials-v1.json",
  contracts: "../contracts/arrival/arrival-contracts-v1.json",
};

const outputs = [
  [packagesPath, registry],
  [messagesPath, { registryId: "registry.arrival-messages.v1", version: "1.0.0-design", recordCount: messages.length, productionAuthorized: false, messages }],
  [tutorialsPath, { registryId: "registry.arrival-tutorials.v1", version: "1.0.0-design", recordCount: tutorials.length, productionAuthorized: false, tutorials }],
  [contractsPath, { registryId: "registry.arrival-contracts.v1", version: "1.0.0-design", recordCount: contracts.length, productionAuthorized: false, contracts }],
];

let differences = 0;
for (const [filePath, document] of outputs) {
  if (await compareOrWrite(filePath, `${JSON.stringify(document)}\n`)) differences += 1;
}

if (checkOnly && differences > 0) process.exitCode = 1;
else console.log(`${checkOnly ? "Verified" : "Generated"} ten arrival packages, messages, tutorials, and stabilization Contracts.`);
