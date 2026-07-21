import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedRoot = path.join(repoRoot, "docs", "seed-content");
const checkOnly = process.argv.includes("--check");

const countries = [
  { key: "northreach", name: "Northreach", currency: "NRC", capital: "Frostgate", sector: "strategic resources", pressure: "winter logistics and energy security", institution: "Strategic Resources Office" },
  { key: "yrethia", name: "Yrethia", currency: "YRC", capital: "Sableport", sector: "shipping and trade finance", pressure: "port congestion and customs compliance", institution: "Maritime Insurance Council" },
  { key: "thaloris", name: "Thaloris", currency: "THD", capital: "Dusk Harbor", sector: "repair and re-export trade", pressure: "legitimacy, salvage quality, and route volatility", institution: "Trade Legitimacy Commission" },
  { key: "solvend", name: "Solvend", currency: "SLV", capital: "Aurora Spire", sector: "advanced technology and aerospace", pressure: "skills scarcity and cyber concentration", institution: "Advanced Systems Consortium" },
  { key: "eldoran", name: "Eldoran", currency: "ELD", capital: "Crescent Bay", sector: "food and wholesale distribution", pressure: "harvest variability and affordability", institution: "Commodity Stability Board" },
  { key: "valerion", name: "Valerion", currency: "VAL", capital: "Glassfall", sector: "water, clean energy, and premium services", pressure: "water allocation and high living costs", institution: "Water Energy Commission" },
  { key: "lumenor", name: "Lumenor", currency: "LUM", capital: "Starfall", sector: "education, media, and arbitration", pressure: "credential recognition and public trust", institution: "Starfall Public Media Trust" },
  { key: "xalvoria", name: "Xalvoria", currency: "XAL", capital: "Emberhall", sector: "banking and infrastructure finance", pressure: "debt concentration and project accountability", institution: "Project Accountability Office" },
  { key: "dravenlok", name: "Dravenlok", currency: "DRV", capital: "Ironhold", sector: "heavy industry and rail", pressure: "energy intensity and worker safety", institution: "Workers Congress" },
  { key: "syndalis", name: "Syndalis", currency: "SYN", capital: "Blacklight", sector: "cybersecurity and digital finance", pressure: "identity integrity and infrastructure concentration", institution: "Data Rights Tribunal" },
];

const contractFamilies = [
  { key: "livelihood", title: "Verified Livelihood Plan", objective: "compare two verified income paths and select one that preserves the emergency buffer", submission: "a one-page income, cost, and fallback comparison", reward: "one-week-basic-needs-offset" },
  { key: "market", title: "Local Market Brief", objective: "explain one local industry opportunity and one downside risk using approved market information", submission: "a concise market brief with sources and a risk statement", reward: "analysis-service-band" },
  { key: "resilience", title: "Supply Resilience Check", objective: "identify one vulnerable input or route and propose a legal substitute or recovery path", submission: "a dependency map and bounded mitigation proposal", reward: "resilience-service-band" },
  { key: "community", title: "Community Stabilization Task", objective: "complete a verified public, cooperative, or small-business service that improves local recovery capacity", submission: "completion evidence and a short impact reflection", reward: "community-service-band" },
];

const interactionFamilies = [
  { key: "employment", actor: "verified-employer", prompt: "A verified employer offers a faster income path with a demanding schedule.", options: ["accept after reviewing costs", "request a trial period", "decline and preserve flexibility"] },
  { key: "support", actor: "public-support-office", prompt: "A public office offers temporary support tied to a documented stabilization plan.", options: ["apply with full documentation", "seek cooperative support instead", "continue without support"] },
  { key: "banking", actor: "licensed-bank", prompt: "A licensed bank presents a basic account and a higher-friction credit-building option.", options: ["open the basic account", "review the credit option", "defer until income is stable"] },
  { key: "supplier", actor: "local-supplier", prompt: "A supplier offers a lower-cost input with uncertain delivery reliability.", options: ["use the verified standard supplier", "pilot the lower-cost supplier", "split the order and diversify"] },
  { key: "crisis", actor: "local-coordination-office", prompt: "A local disruption requires a choice between speed, cost control, and resilience.", options: ["prioritize essential continuity", "protect cash reserves", "coordinate a shared recovery response"] },
];

const bankingProducts = [
  ["basic-transaction-account", "Basic Transaction Account", "transaction", "low", "no-credit"],
  ["protected-savings-account", "Protected Savings Account", "savings", "low", "no-credit"],
  ["emergency-reserve-account", "Emergency Reserve Account", "savings", "low", "restricted-withdrawal"],
  ["fixed-term-deposit", "Fixed-Term Deposit", "deposit", "low-moderate", "liquidity-tradeoff"],
  ["credit-builder-line", "Credit Builder Line", "credit", "moderate", "small-secured-limit"],
  ["education-and-training-loan", "Education and Training Loan", "credit", "moderate", "verified-program-only"],
  ["equipment-finance-plan", "Equipment Finance Plan", "credit", "moderate-high", "asset-linked"],
  ["small-business-operating-account", "Small Business Operating Account", "business", "moderate", "cash-management"],
  ["trade-settlement-facility", "Trade Settlement Facility", "trade-finance", "high", "verified-contract-only"],
  ["recovery-restructure-plan", "Recovery Restructure Plan", "recovery", "moderate", "hardship-review"],
];

function ensureUnique(records, label) {
  const ids = new Set();
  for (const record of records) {
    if (!record.id || ids.has(record.id)) throw new Error(`${label} contains a missing or duplicate ID: ${record.id ?? "<missing>"}.`);
    ids.add(record.id);
  }
}

function buildContracts() {
  return countries.flatMap((country) => contractFamilies.map((family, index) => ({
    id: `contract.core.${country.key}.${family.key}.v1`,
    country: country.key,
    currencyCode: country.currency,
    sourceType: "system-seeded",
    family: family.key,
    title: `${country.name} ${family.title}`,
    objective: `${family.objective} in ${country.capital}, accounting for ${country.pressure}`,
    instructions: [
      `Use verified information relevant to ${country.sector}.`,
      `Name the principal risk created by ${country.pressure}.`,
      "Include a legal substitute, fallback, or recovery step.",
      "Do not assume unavailable Store, market, banking, or event capabilities are active.",
    ],
    submissionRequirement: family.submission,
    rewardPolicy: {
      type: "local-currency-candidate-band",
      amountBand: family.reward,
      calibrationStatus: "simulation-pending",
      issuanceStatus: "blocked-until-authoritative-contract-reward-capability",
    },
    difficultyPolicy: "Difficulty may tighten time, availability, and substitution constraints after simulation; it does not silently multiply reward value.",
    sequence: index + 1,
    recoveryCritical: family.key === "resilience" || family.key === "community",
    runtimeSupport: "definition-only",
    activationAuthorized: false,
  })));
}

function buildBanking() {
  return bankingProducts.map(([key, name, type, riskBand, accessPolicy], index) => ({
    id: `banking-product.${key}.v1`,
    name,
    productType: type,
    riskBand,
    accessPolicy,
    availability: "country-policy-and-capability-dependent",
    pricingPolicy: "rates-fees-and-limits-unapproved-until-affordability-simulation",
    disclosureRequirements: ["total-cost-band", "liquidity-or-lockup", "missed-payment-or-default-treatment", "recovery-and-appeal-path"],
    prohibitedBehavior: ["hidden-fees", "guaranteed-profit-language", "automatic-cross-game-ownership", "direct-unreviewed-ledger-write"],
    recoveryPath: type === "credit" || type === "trade-finance" ? "hardship-review-restructure-or-supervised-exit" : "fee-review-and-account-transfer",
    displayOrder: index + 1,
    runtimeSupport: "definition-only",
    activationAuthorized: false,
  }));
}

function buildProgression() {
  const levelNames = ["New Arrival", "Settled Resident", "Reliable Earner", "Careful Saver", "Market Observer", "Skilled Operator", "Resilient Builder", "Trusted Partner", "Economic Strategist", "National Contributor"];
  const levels = levelNames.map((name, index) => ({
    id: `progression.level.${String(index + 1).padStart(2, "0")}.v1`,
    level: index + 1,
    name,
    thresholdBand: index === 0 ? "starting-state" : `progress-band-${String(index + 1).padStart(2, "0")}`,
    qualifyingDomains: ["contracts", "financial-literacy", "reputation", "recovery", "responsible-market-participation"],
    unlockPolicy: "cosmetic-guidance-and-reviewed-capabilities-only",
    numericThresholdStatus: "calibration-pending",
    runtimeSupport: "definition-only",
    activationAuthorized: false,
  }));

  const achievementSpecs = [
    ["first-contract", "First Contract", "complete one approved Contract"],
    ["revision-recovery", "Better on Revision", "complete a Contract after a revision request"],
    ["emergency-buffer", "Buffer Built", "maintain the approved emergency-buffer band"],
    ["verified-income", "Verified Income", "complete a verified earning path"],
    ["essential-purchase", "Essential Purchase", "buy an approved essential item without breaching the emergency buffer"],
    ["responsible-credit", "Responsible Credit", "complete a reviewed credit cycle without distress"],
    ["recovery-plan", "Recovery Ready", "record and use an approved recovery route"],
    ["market-brief", "Market Reader", "complete a sourced market-analysis Contract"],
    ["diversified-watchlist", "Broad View", "review multiple sectors without claiming guaranteed returns"],
    ["risk-disclosure", "Risk Disclosed", "identify material downside before a financial decision"],
    ["local-contributor", "Local Contributor", "complete a community stabilization task"],
    ["supply-substitute", "Substitute Found", "identify a legal substitute during a supply disruption"],
    ["cross-country-context", "Regional Context", "compare two countries without treating either as strictly superior"],
    ["news-verifier", "Source Checker", "distinguish confirmed news from unverified claims"],
    ["attendance-streak", "Reliable Presence", "meet the approved attendance consistency band"],
    ["skills-path", "Skills Path", "complete a verified training or credential step"],
    ["small-business-plan", "Enterprise Planner", "complete a bounded small-business operating plan"],
    ["crisis-continuity", "Continuity Planner", "preserve essential activity during a crisis event"],
    ["ethical-choice", "Trusted Decision", "choose a transparent option over a hidden-risk shortcut"],
    ["long-session-resilience", "Built to Last", "recover from a major setback without an irreversible lockout"],
  ];
  const achievements = achievementSpecs.map(([key, name, description], index) => ({
    id: `achievement.${key}.v1`,
    name,
    description,
    category: ["contracts", "resilience", "financial-literacy", "community", "progression"][index % 5],
    criteriaStatus: "semantic-complete-numeric-threshold-pending",
    rewardPolicy: "recognition-first-no-economic-reward-until-calibrated",
    hidden: false,
    runtimeSupport: "definition-only",
    activationAuthorized: false,
  }));
  return { levels, achievements };
}

function buildEvents() {
  const events = [];
  for (const country of countries) {
    events.push({
      id: `event.core.${country.key}.sector-expansion.v1`,
      country: country.key,
      name: `${country.name} ${country.sector} Expansion`,
      eventType: "economic-opportunity",
      triggerIntent: "scheduled-or-condition-based-after-market-capability-review",
      effectIntent: ["income-opportunity-up", "selected-input-demand-up", "concentration-risk-up"],
      effectBand: "moderate",
      recoveryPath: "diversification-and-capacity-investment",
      runtimeSupport: "definition-only",
      activationAuthorized: false,
    });
    events.push({
      id: `event.core.${country.key}.system-pressure.v1`,
      country: country.key,
      name: `${country.name} ${country.pressure} Alert`,
      eventType: "economic-pressure",
      triggerIntent: "scheduled-or-condition-based-after-event-authority-review",
      effectIntent: ["availability-down", "cost-pressure-up", "public-confidence-down"],
      effectBand: "moderate-severe",
      recoveryPath: `coordination-through-${country.institution.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      runtimeSupport: "definition-only",
      activationAuthorized: false,
    });
  }
  const globalEvents = [
    ["meridian-disruption", "Meridian Corridor Disruption", ["shipping-cost-up", "route-availability-down", "substitution-demand-up"], "alternate-routes-and-repair"],
    ["confidence-shock", "Regional Confidence Shock", ["risk-appetite-down", "liquidity-pressure-up", "safe-asset-demand-up"], "transparent-briefings-and-liquidity-support"],
    ["cyber-coordination", "Cross-Border Cyber Coordination", ["verification-friction-up", "security-demand-up", "fraud-risk-down-after-recovery"], "shared-security-and-identity-recovery"],
    ["food-energy-squeeze", "Food and Energy Affordability Squeeze", ["essential-cost-up", "discretionary-demand-down", "public-support-demand-up"], "targeted-support-and-supply-substitution"],
    ["reconstruction-cycle", "Regional Reconstruction Cycle", ["infrastructure-demand-up", "materials-demand-up", "debt-and-capacity-risk-up"], "phased-procurement-and-accountability"],
  ];
  for (const [key, name, effects, recovery] of globalEvents) {
    events.push({ id: `event.core.global.${key}.v1`, country: "global", name, eventType: "regional-system", triggerIntent: "story-or-condition-based-after-authority-review", effectIntent: effects, effectBand: "severe-bounded", recoveryPath: recovery, runtimeSupport: "definition-only", activationAuthorized: false });
  }

  const chains = countries.map((country, index) => ({
    id: `event-chain.${country.key}.adaptation.v1`,
    name: `${country.name} Adaptation Chain`,
    country: country.key,
    eventIds: [
      `event.core.${country.key}.sector-expansion.v1`,
      `event.core.${country.key}.system-pressure.v1`,
      `event.core.global.${["meridian-disruption", "confidence-shock", "cyber-coordination", "food-energy-squeeze", "reconstruction-cycle"][index % 5]}.v1`,
    ],
    progressionPolicy: "resolution-and-recovery-gated",
    cancellationPolicy: "no-later-step-after-terminal-resolution",
    runtimeSupport: "definition-only",
    activationAuthorized: false,
  }));

  const crisisArcs = [
    ["corridor-fracture", "Corridor Fracture", ["northreach", "yrethia"]],
    ["food-and-water", "Food and Water Emergency", ["eldoran", "valerion"]],
    ["technology-confidence", "Technology Confidence Crisis", ["solvend", "syndalis"]],
    ["industrial-reconstruction", "Industrial Reconstruction", ["dravenlok", "xalvoria"]],
    ["legitimacy-and-information", "Legitimacy and Information Crisis", ["thaloris", "lumenor"]],
  ].map(([key, name, members]) => ({
    id: `crisis-arc.${key}.v1`,
    name,
    chainIds: members.map((country) => `event-chain.${country}.adaptation.v1`),
    severityCeiling: "severe-bounded",
    requiredRecovery: true,
    irreversibleLossPolicy: "prohibited-for-base-beta",
    runtimeSupport: "definition-only",
    activationAuthorized: false,
  }));
  return { events, chains, crisisArcs };
}

function buildInteractions() {
  return countries.flatMap((country) => interactionFamilies.map((family) => ({
    id: `interaction.core.${country.key}.${family.key}.v1`,
    country: country.key,
    actorType: family.actor,
    title: `${country.name} ${family.key.replace(/-/g, " ")} decision`,
    prompt: `${family.prompt} The decision is shaped by ${country.pressure}.`,
    options: family.options.map((label, index) => ({
      key: `option-${index + 1}`,
      label,
      consequenceIntent: index === 0 ? "faster-progress-with-reviewed-cost" : index === 1 ? "balanced-information-and-delay" : "lower-immediate-risk-with-opportunity-cost",
    })),
    disclosurePolicy: "show-material-cost-risk-and-recovery-before-choice",
    runtimeSupport: "definition-only",
    activationAuthorized: false,
  })));
}

function buildNews() {
  return countries.flatMap((country) => [
    { key: "opening", headline: `${country.name} officials publish a new ${country.sector} outlook`, state: "opportunity", body: `The report highlights potential growth while warning that ${country.pressure} remains material.` },
    { key: "pressure", headline: `${country.name} faces renewed ${country.pressure} concerns`, state: "pressure", body: `${country.institution} says continuity measures and transparent verification will determine the economic impact.` },
    { key: "recovery", headline: `${country.name} begins a measured recovery program`, state: "recovery", body: `The program prioritizes essential continuity, accountable financing, and substitutes linked to ${country.sector}.` },
  ].map((template) => ({
    id: `news-template.${country.key}.${template.key}.v1`,
    country: country.key,
    headlineTemplate: template.headline,
    bodyTemplate: template.body,
    state: template.state,
    variablePolicy: ["verified-date", "approved-severity-band", "named-institution", "linked-event-id"],
    correctionPolicy: "publish-linked-correction-without-deleting-original-audit-history",
    runtimeSupport: "definition-only",
    activationAuthorized: false,
  })));
}

function buildNotifications() {
  return countries.flatMap((country) => [
    { key: "contract", category: "contract", title: `${country.name} Contract update`, body: "An approved Contract changed state. Review its deadline, requirements, and reward status." },
    { key: "market", category: "market", title: `${country.name} market notice`, body: "A material market condition changed. Review the source, downside risk, and current availability before acting." },
    { key: "recovery", category: "recovery", title: `${country.name} recovery option`, body: "A verified recovery or support path is available. Review eligibility, cost, and expiration details." },
  ].map((template) => ({
    id: `notification-template.${country.key}.${template.key}.v1`,
    country: country.key,
    category: template.category,
    titleTemplate: template.title,
    bodyTemplate: template.body,
    deliveryPolicy: "authoritative-state-change-only",
    deduplicationPolicy: "stable-event-and-recipient-key-required",
    priorityBand: template.key === "recovery" ? "high" : "standard",
    modalPolicy: "nonmodal-unless-safety-or-story-reveal-requires-review",
    runtimeSupport: "definition-only",
    activationAuthorized: false,
  })));
}

const outputs = [
  ["contracts/core/core-contracts-v1.json", { registryId: "registry.core-contracts.v1", version: "1.0.0-design", productionAuthorized: false, contracts: buildContracts() }],
  ["banking/banking-products-v1.json", { registryId: "registry.banking-products.v1", version: "1.0.0-design", productionAuthorized: false, products: buildBanking() }],
  ["progression/progression-v1.json", { registryId: "registry.progression.v1", version: "1.0.0-design", productionAuthorized: false, ...buildProgression() }],
  ["events/core-event-catalog-v1.json", { registryId: "registry.core-events.v1", version: "1.0.0-design", productionAuthorized: false, ...buildEvents() }],
  ["interactions/core-interactions-v1.json", { registryId: "registry.core-interactions.v1", version: "1.0.0-design", productionAuthorized: false, interactions: buildInteractions() }],
  ["news/core-news-templates-v1.json", { registryId: "registry.core-news.v1", version: "1.0.0-design", productionAuthorized: false, newsTemplates: buildNews() }],
  ["notifications/notification-templates-v1.json", { registryId: "registry.notifications.v1", version: "1.0.0-design", productionAuthorized: false, notificationTemplates: buildNotifications() }],
];

for (const [, document] of outputs) {
  for (const key of ["contracts", "products", "levels", "achievements", "events", "chains", "crisisArcs", "interactions", "newsTemplates", "notificationTemplates"]) {
    if (Array.isArray(document[key])) ensureUnique(document[key], key);
  }
}

async function compareOrWrite(relativePath, document) {
  const filePath = path.join(seedRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const expected = `${JSON.stringify(document)}\n`;
  let current = null;
  try { current = await readFile(filePath, "utf8"); } catch {}
  if (current === expected) return false;
  if (checkOnly) {
    console.error(`Core-gameplay content drift: ${relativePath}`);
    return true;
  }
  await writeFile(filePath, expected, "utf8");
  return true;
}

let differences = 0;
for (const [relativePath, document] of outputs) {
  if (await compareOrWrite(relativePath, document)) differences += 1;
}

const counts = Object.fromEntries(outputs.flatMap(([, document]) => Object.entries(document)
  .filter(([, value]) => Array.isArray(value))
  .map(([key, value]) => [key, value.length])));
if (counts.contracts !== 40 || counts.products !== 10 || counts.levels !== 10 || counts.achievements !== 20 || counts.events !== 25 || counts.chains !== 10 || counts.crisisArcs !== 5 || counts.interactions !== 50 || counts.newsTemplates !== 30 || counts.notificationTemplates !== 30) {
  throw new Error(`Unexpected core-content counts: ${JSON.stringify(counts)}.`);
}

if (checkOnly && differences > 0) process.exitCode = 1;
else console.log(`${checkOnly ? "Verified" : "Generated"} core gameplay registries: ${JSON.stringify(counts)}.`);
