#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, readJson, sha256, sha256File, walkFiles, writeJson } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const PACK_ROOT = path.join(SEED_ROOT, 'executable', 'beta-pack-v1');
const SOURCE_PATH = path.join(SEED_ROOT, 'events', 'campaign-content-source-v2.json');
const EVENT_PATH = path.join(SEED_ROOT, 'events', 'core-event-catalog-v1.json');
const NEWS_PATH = path.join(SEED_ROOT, 'news', 'core-news-templates-v1.json');
const NOTIFICATION_PATH = path.join(SEED_ROOT, 'notifications', 'notification-templates-v1.json');
const COUNTRY_IDS = ['northreach','yrethia','thaloris','solvend','eldoran','valerion','lumenor','xalvoria','dravenlok','syndalis'];
const GLOBAL_EVENT_KEYS = ['meridian-disruption','confidence-shock','cyber-coordination','food-energy-squeeze','reconstruction-cycle'];
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

function validateDetail(detail, label) {
  assertText(detail.name, 18, `${label}.name`);
  assertText(detail.summary, 150, `${label}.summary`);
  requireCondition(detail.confirmedFacts?.length === 2, `${label} must contain two confirmed facts.`);
  detail.confirmedFacts.forEach((entry, index) => assertText(entry, 55, `${label}.confirmedFacts.${index + 1}`));
  assertText(detail.uncertainty, 80, `${label}.uncertainty`);
  requireCondition(detail.playerHooks?.length === 3, `${label} must contain three player hooks.`);
  detail.playerHooks.forEach((entry, index) => assertText(entry, 24, `${label}.playerHooks.${index + 1}`));
  requireCondition(detail.civilianRisks?.length >= 2, `${label} must contain at least two civilian risks.`);
  detail.civilianRisks.forEach((entry, index) => assertText(entry, 30, `${label}.civilianRisks.${index + 1}`));
  assertText(detail.recovery, 90, `${label}.recovery`);
}

function validateSource(source) {
  requireCondition(source.schemaVersion === 'econovaria-campaign-content-source-v2', 'Campaign source schema is invalid.');
  requireCondition(source.countryCount === 10, 'Campaign source must declare ten countries.');
  requireCondition(source.globalEventCount === 5, 'Campaign source must declare five global events.');
  requireCondition(JSON.stringify(Object.keys(source.countryProfiles).sort()) === JSON.stringify([...COUNTRY_IDS].sort()), 'Campaign country profile coverage is incomplete.');
  requireCondition(source.globalEvents?.length === 5, 'Campaign source must contain five global event records.');
  requireCondition(new Set(source.globalEvents.map((entry) => entry.key)).size === 5, 'Global campaign event keys must be unique.');

  for (const country of COUNTRY_IDS) {
    const profile = source.countryProfiles[country];
    validateDetail(profile.opportunity, `${country}.opportunity`);
    validateDetail(profile.pressure, `${country}.pressure`);
    for (const key of ['openingHeadline','openingBody','pressureHeadline','pressureBody','recoveryHeadline','recoveryBody']) {
      assertText(profile.news[key], key.endsWith('Headline') ? 24 : 130, `${country}.news.${key}`);
    }
    for (const key of ['contractTitle','contractBody','marketTitle','marketBody','recoveryTitle','recoveryBody']) {
      assertText(profile.notifications[key], key.endsWith('Title') ? 20 : 120, `${country}.notifications.${key}`);
    }
  }
  for (const event of source.globalEvents) {
    requireCondition(GLOBAL_EVENT_KEYS.includes(event.key), `Unexpected global event key ${event.key}.`);
    assertText(event.name, 24, `global.${event.key}.name`);
    assertText(event.phase, 6, `global.${event.key}.phase`);
    assertText(event.summary, 150, `global.${event.key}.summary`);
    requireCondition(event.confirmedFacts?.length === 2, `global.${event.key} must contain two confirmed facts.`);
    event.confirmedFacts.forEach((entry, index) => assertText(entry, 55, `global.${event.key}.confirmedFacts.${index + 1}`));
    assertText(event.uncertainty, 80, `global.${event.key}.uncertainty`);
    requireCondition(event.civilianRisks?.length === 3, `global.${event.key} must contain three civilian risks.`);
    requireCondition(event.playerHooks?.length === 3, `global.${event.key} must contain three player hooks.`);
    assertText(event.recovery, 90, `global.${event.key}.recovery`);
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

function eventKeyFromId(id) {
  const match = /^event\.core\.global\.(.+)\.v1$/.exec(id);
  return match?.[1] ?? null;
}

function countryEventContent(event, profile) {
  if (event.id === `event.core.${event.country}.sector-expansion.v1`) return { ...profile.opportunity, storyPhase: 'opportunity' };
  if (event.id === `event.core.${event.country}.system-pressure.v1`) return { ...profile.pressure, storyPhase: 'pressure' };
  throw new Error(`Unexpected country event identity ${event.id}.`);
}

export async function applyCampaignContentOverrides() {
  const [source, eventRegistry, newsRegistry, notificationRegistry, pack] = await Promise.all([
    readJson(SOURCE_PATH), readJson(EVENT_PATH), readJson(NEWS_PATH), readJson(NOTIFICATION_PATH), readJson(path.join(PACK_ROOT, 'pack-v1.json')),
  ]);
  validateSource(source);
  requireCondition(eventRegistry.events?.length === 25, 'Core event registry must contain 25 events.');
  requireCondition(eventRegistry.chains?.length === 10, 'Core event registry must contain 10 chains.');
  requireCondition(eventRegistry.crisisArcs?.length === 5, 'Core event registry must contain 5 crisis arcs.');
  requireCondition(newsRegistry.newsTemplates?.length === 30, 'Core news registry must contain 30 templates.');
  requireCondition(notificationRegistry.notificationTemplates?.length === 30, 'Core notification registry must contain 30 templates.');

  const globalByKey = new Map(source.globalEvents.map((entry) => [entry.key, entry]));
  const enrichedEvents = eventRegistry.events.map((event) => {
    const globalKey = eventKeyFromId(event.id);
    const detail = globalKey ? globalByKey.get(globalKey) : countryEventContent(event, source.countryProfiles[event.country]);
    requireCondition(detail, `${event.id} has no authored campaign content.`);
    return {
      ...event,
      name: detail.name,
      contentRevision: 'campaign-content-v2',
      storyPhase: detail.storyPhase ?? detail.phase,
      playerFacingSummary: detail.summary,
      confirmedFacts: detail.confirmedFacts,
      uncertainty: detail.uncertainty,
      playerHooks: detail.playerHooks,
      civilianRisks: detail.civilianRisks,
      recoveryGuidance: detail.recovery,
    };
  });
  requireCondition(new Set(enrichedEvents.map((entry) => entry.playerFacingSummary)).size === 25, 'Campaign event summaries must be unique.');

  const eventById = new Map(enrichedEvents.map((entry) => [entry.id, entry]));
  const enrichedChains = eventRegistry.chains.map((chain) => {
    const events = chain.eventIds.map((id) => eventById.get(id));
    requireCondition(events.every(Boolean), `${chain.id} references a missing event.`);
    return {
      ...chain,
      contentRevision: 'campaign-content-v2',
      playerFacingSummary: `${events[0].name} creates an economic opening before ${events[1].name} tests local resilience. The chain then connects the player to ${events[2].name}, where recovery depends on verified evidence, legal substitutes, and protection of essential civilian activity.`,
      civilianFocus: [...new Set(events.flatMap((entry) => entry.civilianRisks))],
      recoveryGuidance: events.map((entry) => ({ eventId: entry.id, guidance: entry.recoveryGuidance })),
    };
  });
  const enrichedCrisisArcs = eventRegistry.crisisArcs.map((arc) => {
    const members = arc.chainIds.map((id) => id.split('.')[1]);
    return {
      ...arc,
      contentRevision: 'campaign-content-v2',
      playerFacingSummary: `${arc.name} links the civilian economies of ${members.join(' and ')}. The arc may disrupt jobs, prices, housing, services, and trust, but every severe step retains a documented recovery path and prohibits irreversible base-beta lockout.`,
      civilianConsequencePolicy: 'show-jobs-prices-housing-services-trust-and-recovery-before-escalation',
    };
  });

  const enrichedNews = newsRegistry.newsTemplates.map((template) => {
    const profile = source.countryProfiles[template.country];
    const key = template.id.split('.').at(-2);
    const map = {
      opening: ['openingHeadline','openingBody',`event.core.${template.country}.sector-expansion.v1`],
      pressure: ['pressureHeadline','pressureBody',`event.core.${template.country}.system-pressure.v1`],
      recovery: ['recoveryHeadline','recoveryBody',`event-chain.${template.country}.adaptation.v1`],
    };
    const [headlineKey, bodyKey, linkedContentId] = map[key] ?? [];
    requireCondition(headlineKey, `${template.id} has an unsupported news state.`);
    return {
      ...template,
      headlineTemplate: profile.news[headlineKey],
      bodyTemplate: profile.news[bodyKey],
      linkedContentId,
      contentRevision: 'campaign-content-v2',
      evidenceLabelPolicy: 'separate-confirmed-facts-uncertainty-and-corrections',
    };
  });
  requireCondition(new Set(enrichedNews.map((entry) => entry.headlineTemplate)).size === 30, 'Campaign news headlines must be unique.');
  requireCondition(new Set(enrichedNews.map((entry) => entry.bodyTemplate)).size === 30, 'Campaign news bodies must be unique.');

  const enrichedNotifications = notificationRegistry.notificationTemplates.map((template) => {
    const profile = source.countryProfiles[template.country];
    const key = template.id.split('.').at(-2);
    const map = {
      contract: ['contractTitle','contractBody','Open the linked Contract and verify its current requirements, deadline, evidence, and reward status.'],
      market: ['marketTitle','marketBody','Open the linked market or event evidence and review downside risk, availability, and timing before acting.'],
      recovery: ['recoveryTitle','recoveryBody','Open the verified recovery route, check eligibility and expiration, and preserve the evidence required for review.'],
    };
    const [titleKey, bodyKey, recommendedAction] = map[key] ?? [];
    requireCondition(titleKey, `${template.id} has an unsupported notification category.`);
    return {
      ...template,
      titleTemplate: profile.notifications[titleKey],
      bodyTemplate: profile.notifications[bodyKey],
      recommendedAction,
      contentRevision: 'campaign-content-v2',
      evidencePolicy: 'link-authoritative-state-and-preserve-correction-history',
    };
  });
  requireCondition(new Set(enrichedNotifications.map((entry) => entry.titleTemplate)).size === 30, 'Campaign notification titles must be unique.');
  requireCondition(new Set(enrichedNotifications.map((entry) => entry.bodyTemplate)).size === 30, 'Campaign notification bodies must be unique.');

  const campaignEvents = {
    schemaVersion: 'econovaria-beta-campaign-events-v2', packId: pack.packId, version: pack.version,
    status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
    contentRevision: 'campaign-content-v2', eventCount: enrichedEvents.length, chainCount: enrichedChains.length, crisisArcCount: enrichedCrisisArcs.length,
    events: enrichedEvents, chains: enrichedChains, crisisArcs: enrichedCrisisArcs,
  };
  const campaignNews = {
    schemaVersion: 'econovaria-beta-campaign-news-v2', packId: pack.packId, version: pack.version,
    status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
    contentRevision: 'campaign-content-v2', templateCount: enrichedNews.length, newsTemplates: enrichedNews,
  };
  const campaignNotifications = {
    schemaVersion: 'econovaria-beta-campaign-notifications-v2', packId: pack.packId, version: pack.version,
    status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
    contentRevision: 'campaign-content-v2', templateCount: enrichedNotifications.length, notificationTemplates: enrichedNotifications,
  };

  pack.domainFiles.campaignEvents = 'campaign-events-v2.json';
  pack.domainFiles.campaignNews = 'campaign-news-v2.json';
  pack.domainFiles.campaignNotifications = 'campaign-notifications-v2.json';
  pack.boundedCounts.campaignEvents = 25;
  pack.boundedCounts.campaignEventChains = 10;
  pack.boundedCounts.campaignCrisisArcs = 5;
  pack.boundedCounts.campaignNewsTemplates = 30;
  pack.boundedCounts.campaignNotificationTemplates = 30;
  pack.contentRevisions = { ...(pack.contentRevisions ?? {}), campaign: 'campaign-content-v2' };
  pack.contentQuality = {
    ...(pack.contentQuality ?? {}),
    authoredCampaignEvents: 25,
    authoredCampaignNewsTemplates: 30,
    authoredCampaignNotificationTemplates: 30,
    uniqueCampaignEventSummaries: 25,
    uniqueCampaignNewsBodies: 30,
    uniqueCampaignNotificationBodies: 30,
    severeEventsWithRecovery: enrichedEvents.filter((entry) => String(entry.effectBand).includes('severe')).length,
    placeholderCampaignContent: 0,
  };

  await writeJson(path.join(PACK_ROOT, 'campaign-events-v2.json'), campaignEvents);
  await writeJson(path.join(PACK_ROOT, 'campaign-news-v2.json'), campaignNews);
  await writeJson(path.join(PACK_ROOT, 'campaign-notifications-v2.json'), campaignNotifications);
  await writeJson(path.join(PACK_ROOT, 'pack-v1.json'), pack);
  const integrity = await rebuildIntegrityManifest(pack);
  return { events: 25, chains: 10, crisisArcs: 5, newsTemplates: 30, notificationTemplates: 30, integrityFiles: integrity.fileCount };
}

async function main() {
  const result = await applyCampaignContentOverrides();
  console.log(JSON.stringify({ result: 'CAMPAIGN_CONTENT_APPLIED', ...result }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
