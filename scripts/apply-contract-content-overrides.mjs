#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, readJson, sha256, sha256File, walkFiles, writeJson } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const PACK_ROOT = path.join(SEED_ROOT, 'executable', 'beta-pack-v1');
const SOURCE_PATH = path.join(SEED_ROOT, 'contracts', 'contract-content-source-v2.json');
const COUNTRY_IDS = ['northreach','yrethia','thaloris','solvend','eldoran','valerion','lumenor','xalvoria','dravenlok','syndalis'];
const FAMILIES = ['arrival','livelihood','market','resilience','community'];
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

function buildCountryRecords(country, profile) {
  const arrival = {
    id: `contract.arrival.${country}.stabilization.v1`, country, family: 'arrival',
    playerFacingDescription: `${profile.agency} needs a practical first-week plan before it will clear your settlement support. You must resolve ${profile.arrival} without spending the emergency reserve that protects you from an early setback.`,
    objective: `Produce a verified first-week stabilization plan for ${profile.city} that resolves ${profile.arrival} and preserves a minimum emergency reserve.`,
    instructions: [
      `Review the official ${profile.city} arrival notice and list every deadline, deposit, document, or service requirement.`,
      'Select one verified housing or address path and calculate its first-week cash commitment.',
      `Confirm one lawful income, training, public-service, or enterprise lead tied to ${profile.sector}.`,
      `Document a fallback through ${profile.agency} and state the amount of cash that remains protected.`,
    ],
    submissionRequirement: 'Submit a four-part stabilization dossier: requirement checklist, selected address path, first-week cash plan, and verified fallback contact.',
    estimatedDurationMinutes: 25,
  };
  const livelihood = {
    id: `contract.core.${country}.livelihood.v1`, country, family: 'livelihood',
    playerFacingDescription: `Two legitimate income paths are available in ${profile.city}: ${profile.livelihood_a} and ${profile.livelihood_b}. Compare the real costs, timing, and risks before committing your limited starting capital.`,
    objective: `Compare ${profile.livelihood_a} with ${profile.livelihood_b} and select the path that best preserves liquidity under ${profile.risk}.`,
    instructions: [
      'Record expected first-week income, required equipment or transport, and the earliest realistic payment date for each option.',
      `Explain how ${profile.risk} could reduce or delay each option’s value.`,
      'Reject any option that depends on an unavailable mechanic, unverified employer, or unlicensed transaction.',
      'Choose one path and define a fallback trigger that would cause you to switch.',
    ],
    submissionRequirement: 'Submit a side-by-side livelihood comparison with cash timing, required inputs, risk adjustment, selected path, and fallback trigger.',
    estimatedDurationMinutes: 35,
  };
  const market = {
    id: `contract.core.${country}.market.v1`, country, family: 'market',
    playerFacingDescription: `A local operator wants a concise opportunity brief on ${profile.market_opportunity}. The brief must identify a credible buyer, a realistic constraint, and evidence that the opportunity is more than speculative hype.`,
    objective: `Evaluate the commercial potential of ${profile.market_opportunity} in ${profile.city} and identify the most important downside created by ${profile.risk}.`,
    instructions: [
      `Define the customer problem inside ${profile.sector} and name the buyer or institution most likely to pay.`,
      'Use approved market, Store, Contract, or country information to support one demand claim.',
      `Quantify or rank the downside caused by ${profile.risk}.`,
      'Recommend a bounded first transaction or pilot that does not require unsupported features.',
    ],
    submissionRequirement: 'Submit a market brief containing customer, problem, evidence, downside risk, and a bounded pilot recommendation.',
    estimatedDurationMinutes: 35,
  };
  const resilience = {
    id: `contract.core.${country}.resilience.v1`, country, family: 'resilience',
    playerFacingDescription: `A local supply chain relies on ${profile.dependency}. A disruption would halt essential work, so the operator needs a lawful substitute plan before committing inventory or credit.`,
    objective: `Map the dependency on ${profile.dependency} and test whether ${profile.substitute} can maintain a minimum viable service.`,
    instructions: [
      'Identify the affected product, service, Contract, or community need and the point where the dependency enters the chain.',
      'State the disruption trigger, expected duration, and the inventory or cash exposure at risk.',
      `Evaluate ${profile.substitute} for cost, quality, timing, and legal eligibility.`,
      'Define a recovery sequence that limits losses and avoids duplicate claims or unsupported inventory.',
    ],
    submissionRequirement: 'Submit a dependency map, disruption trigger, substitute comparison, and ordered recovery sequence.',
    estimatedDurationMinutes: 40,
  };
  const community = {
    id: `contract.core.${country}.community.v1`, country, family: 'community',
    playerFacingDescription: `${profile.agency} is commissioning a small public-service task: ${profile.community}. The work must produce evidence that another resident or local operator can actually use.`,
    objective: `Complete and document the following verified service in ${profile.city}: ${profile.community}.`,
    instructions: [
      'Confirm the beneficiary, scope, and acceptance standard before beginning.',
      'Use only approved public information, available inventory, and supported Contract evidence.',
      'Record the completed work with a checklist, calculation, map, or verification log appropriate to the task.',
      'Explain one measurable local benefit and one limitation that remains unresolved.',
    ],
    submissionRequirement: 'Submit completion evidence, the beneficiary’s acceptance criteria, one measurable impact, and one unresolved limitation.',
    estimatedDurationMinutes: 40,
  };
  return [arrival, livelihood, market, resilience, community];
}

function buildRecords(source) {
  requireCondition(source.countryCount === 10, 'Contract content source must declare ten countries.');
  requireCondition(JSON.stringify(source.families) === JSON.stringify(FAMILIES), 'Contract content families are incomplete or out of order.');
  const records = [];
  for (const country of COUNTRY_IDS) {
    const profile = source.profiles?.[country];
    requireCondition(profile, `Missing Contract content profile for ${country}.`);
    for (const field of ['city','agency','sector','arrival','livelihood_a','livelihood_b','risk','market_opportunity','dependency','substitute','community']) {
      assertText(profile[field], field === 'city' ? 4 : 12, `${country}.${field}`);
    }
    records.push(...buildCountryRecords(country, profile));
  }
  requireCondition(records.length === 50, `Expected 50 authored Contract records; found ${records.length}.`);
  requireCondition(new Set(records.map((record) => record.id)).size === 50, 'Authored Contract identities must be unique.');
  for (const record of records) {
    assertText(record.playerFacingDescription, 120, `${record.id} description`);
    assertText(record.objective, 75, `${record.id} objective`);
    requireCondition(record.instructions.length === 4, `${record.id} must have four instructions.`);
    record.instructions.forEach((instruction, index) => assertText(instruction, 45, `${record.id} instruction ${index + 1}`));
    assertText(record.submissionRequirement, 70, `${record.id} submission requirement`);
  }
  return records;
}

async function rebuildIntegrityManifest(pack) {
  const files = await walkFiles(PACK_ROOT, (file) => path.basename(file) !== 'integrity-manifest-v1.json');
  const entries = [];
  for (const filePath of files) {
    entries.push({
      path: path.relative(PACK_ROOT, filePath).replaceAll(path.sep, '/'),
      sha256: await sha256File(filePath),
      bytes: (await readFile(filePath)).byteLength,
    });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const packEntry = entries.find((entry) => entry.path === 'pack-v1.json');
  const manifest = {
    schemaVersion: 'econovaria-beta-integrity-manifest-v1',
    packId: pack.packId,
    version: pack.version,
    status: 'approved-for-isolated-staging',
    productionAuthorized: false,
    activationAuthorized: false,
    hashAlgorithm: 'sha256',
    fileCount: entries.length,
    packSha256: packEntry?.sha256 ?? null,
    files: entries,
    manifestContentSha256: sha256(canonicalJson(entries)),
  };
  await writeJson(path.join(PACK_ROOT, 'integrity-manifest-v1.json'), manifest);
  return manifest;
}

export async function applyContractContentOverrides() {
  const [source, tutorial, pack] = await Promise.all([
    readJson(SOURCE_PATH),
    readJson(path.join(PACK_ROOT, 'tutorial-contract-chains-v1.json')),
    readJson(path.join(PACK_ROOT, 'pack-v1.json')),
  ]);
  const records = buildRecords(source);
  const byId = new Map(records.map((record) => [record.id, record]));
  requireCondition(tutorial.templateCount === 30 && tutorial.templates?.length === 30, 'Generated tutorial Contract pack must contain 30 active templates.');
  const enrichedTemplates = tutorial.templates.map((template) => {
    const content = byId.get(template.stableId);
    requireCondition(content, `${template.stableId} has no authored Contract content.`);
    return {
      ...template,
      description: content.playerFacingDescription,
      instructions: content.instructions.join('\n'),
      estimatedDurationMinutes: content.estimatedDurationMinutes,
      requirementsPayload: {
        ...template.requirementsPayload,
        objective: content.objective,
        submissionRequirement: content.submissionRequirement,
      },
      metadata: {
        ...template.metadata,
        contentRevision: 'contract-content-v2',
        authoredFamily: content.family,
      },
    };
  });
  requireCondition(new Set(enrichedTemplates.map((entry) => entry.description)).size === 30, 'Active tutorial Contract descriptions must be unique.');
  requireCondition(new Set(enrichedTemplates.map((entry) => entry.instructions)).size === 30, 'Active tutorial Contract instructions must be unique.');

  const generatedContent = {
    schemaVersion: 'econovaria-beta-contract-content-v2',
    packId: pack.packId,
    version: pack.version,
    status: 'approved-for-isolated-staging',
    productionAuthorized: false,
    activationAuthorized: false,
    contentRevision: 'contract-content-v2',
    recordCount: records.length,
    countryCount: COUNTRY_IDS.length,
    families: FAMILIES,
    records,
  };
  const enrichedTutorial = {
    ...tutorial,
    contentRevision: 'contract-content-v2',
    descriptionPolicy: 'country-specific-authored-player-facing-copy',
    authoredDefinitionCount: records.length,
    activeTemplateContentCount: enrichedTemplates.length,
    templates: enrichedTemplates,
  };
  pack.domainFiles.contractContent = 'contract-content-v2.json';
  pack.boundedCounts.authoredContractDefinitions = records.length;
  pack.contentRevisions = { ...(pack.contentRevisions ?? {}), contracts: 'contract-content-v2' };
  pack.contentQuality = {
    ...(pack.contentQuality ?? {}),
    authoredContractDefinitions: records.length,
    activeTutorialContractDescriptions: enrichedTemplates.length,
    repeatedGenericTutorialInstructions: 0,
    placeholderContractDescriptions: 0,
  };
  await writeJson(path.join(PACK_ROOT, 'contract-content-v2.json'), generatedContent);
  await writeJson(path.join(PACK_ROOT, 'tutorial-contract-chains-v1.json'), enrichedTutorial);
  await writeJson(path.join(PACK_ROOT, 'pack-v1.json'), pack);
  const integrity = await rebuildIntegrityManifest(pack);
  return { authoredContractDefinitions: records.length, activeTemplatesEnriched: enrichedTemplates.length, integrityFiles: integrity.fileCount };
}

async function main() {
  const result = await applyContractContentOverrides();
  console.log(JSON.stringify({ result: 'CONTRACT_CONTENT_APPLIED', ...result }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
