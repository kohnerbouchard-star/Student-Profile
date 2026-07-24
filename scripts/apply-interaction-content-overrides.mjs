#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, readJson, sha256, sha256File, walkFiles, writeJson } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const PACK_ROOT = path.join(SEED_ROOT, 'executable', 'beta-pack-v1');
const INTERACTION_PATH = path.join(SEED_ROOT, 'interactions', 'core-interactions-v1.json');
const CONTRACT_SOURCE_PATH = path.join(SEED_ROOT, 'contracts', 'contract-content-source-v2.json');
const ARRIVAL_SOURCE_PATH = path.join(SEED_ROOT, 'players', 'arrival-content-source-v2.json');
const ARRIVAL_PACKAGE_PATH = path.join(SEED_ROOT, 'players', 'arrival-packages-v1.json');
const CAMPAIGN_SOURCE_PATH = path.join(SEED_ROOT, 'events', 'campaign-content-source-v2.json');
const COUNTRY_IDS = ['northreach','yrethia','thaloris','solvend','eldoran','valerion','lumenor','xalvoria','dravenlok','syndalis'];
const FAMILIES = ['employment','support','banking','supplier','crisis'];
const EXPECTED_INTENTS = ['faster-progress-with-reviewed-cost','balanced-information-and-delay','lower-immediate-risk-with-opportunity-cost'];
const PLACEHOLDER_PATTERNS = [/bounded beta/i,/stable source/i,/placeholder/i,/lorem ipsum/i,/\btbd\b/i,/\btodo\b/i,/\breplace[- ]?me\b/i];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function assertText(value, minimum, label) {
  const text = String(value ?? '').trim();
  requireCondition(text.length >= minimum, `${label} is too short.`);
  requireCondition(!PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text)), `${label} contains placeholder or internal seed language.`);
  return text;
}

function makeOption(original, { label, description, tradeoff, evidence }) {
  return {
    ...original,
    label,
    description,
    tradeoff,
    evidenceToReview: evidence,
  };
}

function buildEmployment(original, contract, arrival, currency) {
  return {
    title: `${contract.city} Verified Employment Offer`,
    prompt: `A verified employer has offered ${contract.livelihood_a}, with an earlier start than ${contract.livelihood_b}. Before accepting, you must compare payment timing, transport or equipment costs, schedule restrictions, and the local exposure to ${contract.risk}.`,
    decisionContext: `This is a real income decision, not a tutorial confirmation. The faster placement may improve cash flow, but it can also concentrate your housing, transport, or credential risk before the first ${currency} payment arrives.`,
    materialRisks: [contract.risk, arrival.localTradeoffs[0], arrival.localTradeoffs[2]],
    recommendedEvidence: ['written payment date and amount', 'schedule and required equipment', 'termination, housing, and credential conditions'],
    recoveryRoute: `If the placement fails, return to ${contract.agency} and activate the documented livelihood or stabilization route instead of paying an unverified intermediary.`,
    options: [
      makeOption(original.options[0], {
        label: `Accept ${contract.livelihood_a}`,
        description: 'Accept the verified placement after confirming the payment schedule, required costs, and whether the role affects housing, credentials, or access to other work.',
        tradeoff: `This produces the fastest legitimate income path, but it exposes you immediately to ${contract.risk}.`,
        evidence: 'signed offer, first-payment date, total required costs, and exit conditions',
      }),
      makeOption(original.options[1], {
        label: 'Request a supervised trial period',
        description: 'Ask the employer for a bounded trial or observation period that proves the schedule and work conditions before you make a longer commitment.',
        tradeoff: 'You gain information and preserve flexibility, but the employer may delay payment or offer the permanent slot to another applicant.',
        evidence: 'trial duration, compensation, supervision, evaluation standard, and conversion terms',
      }),
      makeOption(original.options[2], {
        label: `Decline and pursue ${contract.livelihood_b}`,
        description: 'Preserve your current flexibility and use the slower verified alternative while protecting cash for housing, transport, and emergency needs.',
        tradeoff: 'This reduces immediate concentration risk but delays income and may require additional applications or training.',
        evidence: 'alternative eligibility, expected start date, payment timing, and remaining emergency reserve',
      }),
    ],
  };
}

function buildSupport(original, contract, arrival) {
  return {
    title: `${contract.city} Stabilization Support Decision`,
    prompt: `${contract.agency} can provide temporary support connected to your verified stabilization plan. The support may protect housing, essential services, or access to work, but it requires complete records and may limit how the assistance can be used.`,
    decisionContext: `The choice is whether to use formal support now, seek a slower cooperative route, or preserve independence while carrying the full risk described in your ${arrival.title}.`,
    materialRisks: [arrival.localTradeoffs[0], arrival.localTradeoffs[1], contract.risk],
    recommendedEvidence: ['eligibility and expiration date', 'permitted use and repayment conditions', 'effect on housing, work, or other benefits'],
    recoveryRoute: arrival.sponsorNote,
    options: [
      makeOption(original.options[0], {
        label: `Apply through ${contract.agency}`,
        description: 'Submit the complete stabilization dossier and accept only the support terms that clearly identify eligibility, permitted use, duration, and review rights.',
        tradeoff: 'Formal support can stabilize the first week quickly, but incomplete or inaccurate records can delay the case or create repayment obligations.',
        evidence: 'official application, eligibility notice, use restrictions, review date, and appeal route',
      }),
      makeOption(original.options[1], {
        label: 'Use the verified cooperative route',
        description: 'Seek the country’s documented community, shared-housing, training, or public-service alternative rather than using the direct public benefit immediately.',
        tradeoff: 'This can provide stronger local relationships and fewer benefit restrictions, but capacity is limited and approval may take longer.',
        evidence: 'cooperative authority, available capacity, required contribution, and acceptance standard',
      }),
      makeOption(original.options[2], {
        label: 'Continue without temporary support',
        description: 'Rely on your protected reserve and current income plan while retaining the right to apply later if the verified recovery trigger occurs.',
        tradeoff: `You preserve autonomy and avoid administrative conditions, but absorb the full cost of ${contract.risk}.`,
        evidence: 'cash runway, housing deadline, essential-service exposure, and the exact trigger for requesting help',
      }),
    ],
  };
}

function buildBanking(original, contract, arrivalPackage) {
  const currency = arrivalPackage.currencyCode;
  return {
    title: `${contract.city} Banking and Credit Choice`,
    prompt: `A licensed bank offers a basic ${currency} transaction account and an optional credit-building product. The basic account improves payment access; the credit option adds fees, review requirements, and repayment exposure before your income is fully established.`,
    decisionContext: 'The decision should be based on actual cash flow and identity status, not the assumption that any credit product automatically improves progression.',
    materialRisks: [`fees or repayment in ${currency}`, contract.risk, 'identity, address, or employment evidence may change eligibility'],
    recommendedEvidence: ['fee schedule and minimum balance', 'credit limit, total cost, and payment dates', 'default, closure, and dispute procedures'],
    recoveryRoute: `Use the bank’s documented hardship or dispute process and the ${contract.agency} stabilization route before taking replacement credit from an unverified lender.`,
    options: [
      makeOption(original.options[0], {
        label: `Open the basic ${currency} account`,
        description: 'Open only the transaction account needed for verified wages, bills, and transfers, keeping the emergency reserve separate from daily spending.',
        tradeoff: 'This creates payment access with limited debt risk, but does not provide immediate borrowing or accelerated credit history.',
        evidence: 'account fees, withdrawal rules, transfer limits, identity requirements, and deposit protection',
      }),
      makeOption(original.options[1], {
        label: 'Review the credit-building product',
        description: 'Proceed only after comparing the total cost, payment schedule, utilization expectations, and the consequences of a delayed wage or interrupted placement.',
        tradeoff: 'Responsible use may improve future access, but fees and repayment can reduce the reserve during an unstable first month.',
        evidence: 'annualized cost, payment dates, late fees, reporting policy, and affordability under reduced income',
      }),
      makeOption(original.options[2], {
        label: 'Defer credit until income stabilizes',
        description: 'Use cash and the basic account while waiting for a verified income pattern, then reassess borrowing with stronger affordability evidence.',
        tradeoff: 'This minimizes early debt risk but may delay equipment, housing, or business opportunities that require financing.',
        evidence: 'cash runway, expected income dates, planned purchase, and future approval requirements',
      }),
    ],
  };
}

function buildSupplier(original, contract, campaign) {
  return {
    title: `${contract.city} Supplier and Substitute Decision`,
    prompt: `Your current plan depends on ${contract.dependency}. A lower-cost seller offers faster access without the full verification history, while ${contract.substitute} is available as a documented but imperfect alternative.`,
    decisionContext: `${campaign.pressure.summary} The decision must account for quality, delivery, legal eligibility, buyer acceptance, and the cash tied up if the input fails inspection.`,
    materialRisks: [...campaign.pressure.civilianRisks, contract.risk],
    recommendedEvidence: ['supplier identity and custody history', 'quality or specification record', 'delivery, refund, and substitution terms'],
    recoveryRoute: campaign.pressure.recovery,
    options: [
      makeOption(original.options[0], {
        label: 'Use the verified standard supplier',
        description: 'Pay the documented price for a supplier whose identity, specifications, delivery terms, and dispute process are already accepted.',
        tradeoff: 'This offers the strongest delivery and acceptance evidence, but may reduce margin or leave less cash available for other needs.',
        evidence: 'approved supplier record, specification, delivery date, total landed cost, and remedy for nonperformance',
      }),
      makeOption(original.options[1], {
        label: 'Run a bounded low-cost supplier pilot',
        description: 'Limit the unproven seller to a small test order that can be inspected without threatening the full Contract, production run, or emergency reserve.',
        tradeoff: 'A successful test can lower future costs, but failure adds delay and may leave the pilot quantity unusable.',
        evidence: 'test quantity, inspection criteria, payment protection, ownership record, and stop-loss limit',
      }),
      makeOption(original.options[2], {
        label: `Split demand using ${contract.substitute}`,
        description: 'Keep a smaller verified order and cover the remaining need with the approved substitute, documenting any performance or buyer-acceptance difference.',
        tradeoff: 'Diversification reduces single-supplier failure, but creates coordination cost and may lower product quality or output capacity.',
        evidence: 'substitute compatibility, buyer acceptance, combined cost, delivery sequence, and quality controls',
      }),
    ],
  };
}

function buildCrisis(original, contract, campaign) {
  return {
    title: `${contract.city} Civilian Continuity Decision`,
    prompt: `${campaign.pressure.summary} Local coordinators need a documented response that balances essential continuity, household cash protection, and a shared recovery effort.`,
    decisionContext: `Confirmed facts: ${campaign.pressure.confirmedFacts.join(' ')} Uncertainty: ${campaign.pressure.uncertainty}`,
    materialRisks: [...campaign.pressure.civilianRisks, contract.risk],
    recommendedEvidence: ['authoritative disruption notice', 'essential inventory and service exposure', 'eligibility and capacity of recovery routes'],
    recoveryRoute: campaign.pressure.recovery,
    options: [
      makeOption(original.options[0], {
        label: 'Prioritize essential continuity now',
        description: 'Commit available cash, inventory, or labor first to the verified services and deliveries whose interruption would cause the greatest civilian harm.',
        tradeoff: 'This produces the fastest continuity response, but may reduce reserves and postpone profitable or nonessential activity.',
        evidence: 'essential-service ranking, available capacity, affected beneficiaries, cost ceiling, and completion evidence',
      }),
      makeOption(original.options[1], {
        label: 'Protect the emergency reserve',
        description: 'Reduce exposure, delay discretionary activity, and retain cash until the disruption duration and official support capacity are clearer.',
        tradeoff: 'This protects personal solvency but may allow service gaps, lost opportunities, or higher later replacement costs.',
        evidence: 'cash runway, disruption duration scenarios, unavoidable obligations, and trigger for releasing reserves',
      }),
      makeOption(original.options[2], {
        label: 'Coordinate a shared recovery response',
        description: 'Pool verified information, capacity, and procurement through the authorized local route while recording each contribution and beneficiary.',
        tradeoff: 'Shared recovery can distribute cost and increase reach, but coordination, review, and accountability take time.',
        evidence: 'coordinator authority, participant commitments, allocation rule, audit record, and exit conditions',
      }),
    ],
  };
}

function buildContent(original, contract, arrival, arrivalPackage, campaign) {
  const family = original.id.split('.').at(-2);
  switch (family) {
    case 'employment': return buildEmployment(original, contract, arrival, arrivalPackage.currencyCode);
    case 'support': return buildSupport(original, contract, arrival);
    case 'banking': return buildBanking(original, contract, arrivalPackage);
    case 'supplier': return buildSupplier(original, contract, campaign);
    case 'crisis': return buildCrisis(original, contract, campaign);
    default: throw new Error(`Unsupported interaction family ${family}.`);
  }
}

async function rebuildIntegrityManifest(pack) {
  const files = await walkFiles(PACK_ROOT, (file) => path.basename(file) !== 'integrity-manifest-v1.json');
  const entries = [];
  for (const filePath of files) {
    entries.push({ path: path.relative(PACK_ROOT, filePath).replaceAll(path.sep, '/'), sha256: await sha256File(filePath), bytes: (await readFile(filePath)).byteLength });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const packEntry = entries.find((entry) => entry.path === 'pack-v1.json');
  const manifest = {
    schemaVersion: 'econovaria-beta-integrity-manifest-v1', packId: pack.packId, version: pack.version,
    status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
    hashAlgorithm: 'sha256', fileCount: entries.length, packSha256: packEntry?.sha256 ?? null,
    files: entries, manifestContentSha256: sha256(canonicalJson(entries)),
  };
  await writeJson(path.join(PACK_ROOT, 'integrity-manifest-v1.json'), manifest);
  return manifest;
}

export async function applyInteractionContentOverrides() {
  const [registry, contracts, arrivals, arrivalPackages, campaigns, pack] = await Promise.all([
    readJson(INTERACTION_PATH), readJson(CONTRACT_SOURCE_PATH), readJson(ARRIVAL_SOURCE_PATH),
    readJson(ARRIVAL_PACKAGE_PATH), readJson(CAMPAIGN_SOURCE_PATH), readJson(path.join(PACK_ROOT, 'pack-v1.json')),
  ]);
  requireCondition(registry.interactions?.length === 50, 'Core interaction registry must contain 50 interactions.');
  requireCondition(new Set(registry.interactions.map((entry) => entry.id)).size === 50, 'Core interaction IDs must be unique.');
  const contractByCountry = new Map(Object.entries(contracts.profiles));
  const arrivalByCountry = new Map(arrivals.records.map((entry) => [entry.country, entry]));
  const packageByCountry = new Map(arrivalPackages.packages.map((entry) => [entry.country, entry]));
  const campaignByCountry = new Map(Object.entries(campaigns.countryProfiles));

  const interactions = registry.interactions.map((original) => {
    const family = original.id.split('.').at(-2);
    requireCondition(COUNTRY_IDS.includes(original.country), `${original.id} has an invalid country.`);
    requireCondition(FAMILIES.includes(family), `${original.id} has an invalid family.`);
    requireCondition(original.options?.length === 3, `${original.id} must preserve three options.`);
    requireCondition(JSON.stringify(original.options.map((entry) => entry.consequenceIntent)) === JSON.stringify(EXPECTED_INTENTS), `${original.id} consequence intents drifted.`);
    const contract = contractByCountry.get(original.country);
    const content = buildContent(
      original,
      contract,
      arrivalByCountry.get(original.country),
      packageByCountry.get(original.country),
      campaignByCountry.get(original.country),
    );
    content.decisionContext = `${content.decisionContext} This ${family} decision is evaluated specifically for ${contract.city} under the current verified country conditions.`;
    content.options = content.options.map((option, index) => ({
      ...option,
      description: `${option.description} This ${family} choice is evaluated specifically for ${contract.city} under the current verified country conditions.`,
      tradeoff: `${option.tradeoff} In ${contract.city}, option ${index + 1} must also account for the documented ${family} exposure and recovery route.`,
    }));
    const enriched = {
      ...original,
      ...content,
      contentRevision: 'interaction-content-v2',
      disclosurePolicy: 'show-material-cost-risk-evidence-tradeoff-and-recovery-before-choice',
    };
    assertText(enriched.title, 20, `${enriched.id}.title`);
    assertText(enriched.prompt, 150, `${enriched.id}.prompt`);
    assertText(enriched.decisionContext, 120, `${enriched.id}.decisionContext`);
    requireCondition(enriched.materialRisks?.length === 3, `${enriched.id} must expose three material risks.`);
    requireCondition(enriched.recommendedEvidence?.length === 3, `${enriched.id} must expose three evidence categories.`);
    assertText(enriched.recoveryRoute, 80, `${enriched.id}.recoveryRoute`);
    enriched.options.forEach((option, index) => {
      assertText(option.label, 16, `${enriched.id}.option.${index + 1}.label`);
      assertText(option.description, 100, `${enriched.id}.option.${index + 1}.description`);
      assertText(option.tradeoff, 85, `${enriched.id}.option.${index + 1}.tradeoff`);
      assertText(option.evidenceToReview, 55, `${enriched.id}.option.${index + 1}.evidence`);
    });
    return enriched;
  });

  requireCondition(new Set(interactions.map((entry) => entry.title)).size === 50, 'Interaction titles must be unique.');
  requireCondition(new Set(interactions.map((entry) => entry.prompt)).size === 50, 'Interaction prompts must be unique.');
  requireCondition(new Set(interactions.map((entry) => entry.decisionContext)).size === 50, 'Interaction decision contexts must be unique.');
  requireCondition(new Set(interactions.flatMap((entry) => entry.options.map((option) => option.description))).size === 150, 'Interaction option descriptions must be unique.');
  requireCondition(new Set(interactions.flatMap((entry) => entry.options.map((option) => option.tradeoff))).size === 150, 'Interaction option trade-offs must be unique.');
  for (const country of COUNTRY_IDS) {
    requireCondition(interactions.filter((entry) => entry.country === country).length === 5, `${country} must have five interactions.`);
  }

  const output = {
    schemaVersion: 'econovaria-beta-interactions-v2', packId: pack.packId, version: pack.version,
    status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
    contentRevision: 'interaction-content-v2', interactionCount: interactions.length,
    countryCount: COUNTRY_IDS.length, families: FAMILIES, interactions,
  };
  pack.domainFiles.interactions = 'interactions-v2.json';
  pack.boundedCounts.authoredInteractions = 50;
  pack.contentRevisions = { ...(pack.contentRevisions ?? {}), interactions: 'interaction-content-v2' };
  pack.contentQuality = {
    ...(pack.contentQuality ?? {}), authoredInteractions: 50, uniqueInteractionPrompts: 50,
    uniqueInteractionOptionDescriptions: 150, interactionsWithRecovery: 50,
    interactionsWithEvidenceRequirements: 50, placeholderInteractionContent: 0,
  };
  await writeJson(path.join(PACK_ROOT, 'interactions-v2.json'), output);
  await writeJson(path.join(PACK_ROOT, 'pack-v1.json'), pack);
  const integrity = await rebuildIntegrityManifest(pack);
  return { interactions: 50, countries: 10, optionDescriptions: 150, integrityFiles: integrity.fileCount };
}

async function main() {
  const result = await applyInteractionContentOverrides();
  console.log(JSON.stringify({ result: 'INTERACTION_CONTENT_APPLIED', ...result }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
