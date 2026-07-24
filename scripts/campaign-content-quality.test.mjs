#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const PACK_ROOT = path.join(SEED_ROOT, 'executable', 'beta-pack-v1');
const SOURCE_PATH = path.join(SEED_ROOT, 'events', 'campaign-content-source-v2.json');
const EVENT_V1_PATH = path.join(SEED_ROOT, 'events', 'core-event-catalog-v1.json');
const NEWS_V1_PATH = path.join(SEED_ROOT, 'news', 'core-news-templates-v1.json');
const NOTIFICATION_V1_PATH = path.join(SEED_ROOT, 'notifications', 'notification-templates-v1.json');
const EVENTS_PATH = path.join(PACK_ROOT, 'campaign-events-v2.json');
const NEWS_PATH = path.join(PACK_ROOT, 'campaign-news-v2.json');
const NOTIFICATIONS_PATH = path.join(PACK_ROOT, 'campaign-notifications-v2.json');
const PACK_PATH = path.join(PACK_ROOT, 'pack-v1.json');

const COUNTRIES = ['northreach','yrethia','thaloris','solvend','eldoran','valerion','lumenor','xalvoria','dravenlok','syndalis'];
const GLOBAL_KEYS = ['meridian-disruption','confidence-shock','cyber-coordination','food-energy-squeeze','reconstruction-cycle'];
const PLACEHOLDER_PATTERNS = [/bounded beta/i,/stable source/i,/placeholder/i,/lorem ipsum/i,/\btbd\b/i,/\btodo\b/i,/\breplace[- ]?me\b/i];

function assertPlayerFacingText(value, minimum, label) {
  const text = String(value ?? '').trim();
  assert.ok(text.length >= minimum, `${label} is too short`);
  assert.equal(PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text)), false, `${label} contains placeholder or internal seed language`);
}

async function documents() {
  return Promise.all([
    readJson(SOURCE_PATH), readJson(EVENT_V1_PATH), readJson(NEWS_V1_PATH), readJson(NOTIFICATION_V1_PATH),
    readJson(EVENTS_PATH), readJson(NEWS_PATH), readJson(NOTIFICATIONS_PATH), readJson(PACK_PATH),
  ]);
}

test('Campaign source provides substantive opportunity, pressure, news, and notification content for ten countries', async () => {
  const [source] = await documents();
  assert.equal(source.schemaVersion, 'econovaria-campaign-content-source-v2');
  assert.equal(source.countryCount, 10);
  assert.equal(source.globalEventCount, 5);
  assert.deepEqual(Object.keys(source.countryProfiles).sort(), [...COUNTRIES].sort());
  assert.deepEqual(source.globalEvents.map((entry) => entry.key).sort(), [...GLOBAL_KEYS].sort());

  for (const country of COUNTRIES) {
    const profile = source.countryProfiles[country];
    for (const [family, detail] of [['opportunity', profile.opportunity], ['pressure', profile.pressure]]) {
      assertPlayerFacingText(detail.name, 18, `${country}.${family}.name`);
      assertPlayerFacingText(detail.summary, 100, `${country}.${family}.summary`);
      assert.equal(detail.confirmedFacts.length, 2);
      detail.confirmedFacts.forEach((entry, index) => assertPlayerFacingText(entry, 40, `${country}.${family}.fact.${index + 1}`));
      assertPlayerFacingText(detail.uncertainty, 55, `${country}.${family}.uncertainty`);
      assert.equal(detail.playerHooks.length, 3);
      detail.playerHooks.forEach((entry, index) => assertPlayerFacingText(entry, 12, `${country}.${family}.hook.${index + 1}`));
      assert.ok(detail.civilianRisks.length >= 2);
      detail.civilianRisks.forEach((entry, index) => assertPlayerFacingText(entry, 12, `${country}.${family}.risk.${index + 1}`));
      assertPlayerFacingText(detail.recovery, 70, `${country}.${family}.recovery`);
    }
    assert.equal(Object.keys(profile.news).length, 6);
    assert.equal(Object.keys(profile.notifications).length, 6);
    for (const [key, value] of Object.entries(profile.news)) assertPlayerFacingText(value, key.endsWith('Headline') ? 22 : 105, `${country}.news.${key}`);
    for (const [key, value] of Object.entries(profile.notifications)) assertPlayerFacingText(value, key.endsWith('Title') ? 18 : 95, `${country}.notifications.${key}`);
  }
});

test('Campaign event output preserves all 25 event, 10 chain, and 5 crisis identities', async () => {
  const [, eventV1, , , events] = await documents();
  assert.equal(events.schemaVersion, 'econovaria-beta-campaign-events-v2');
  assert.equal(events.contentRevision, 'campaign-content-v2');
  assert.equal(events.eventCount, 25);
  assert.equal(events.chainCount, 10);
  assert.equal(events.crisisArcCount, 5);
  assert.deepEqual(events.events.map((entry) => entry.id).sort(), eventV1.events.map((entry) => entry.id).sort());
  assert.deepEqual(events.chains.map((entry) => entry.id).sort(), eventV1.chains.map((entry) => entry.id).sort());
  assert.deepEqual(events.crisisArcs.map((entry) => entry.id).sort(), eventV1.crisisArcs.map((entry) => entry.id).sort());
  assert.equal(new Set(events.events.map((entry) => entry.playerFacingSummary)).size, 25);
  assert.equal(new Set(events.chains.map((entry) => entry.playerFacingSummary)).size, 10);
  assert.equal(new Set(events.crisisArcs.map((entry) => entry.playerFacingSummary)).size, 5);

  const v1ById = new Map(eventV1.events.map((entry) => [entry.id, entry]));
  for (const event of events.events) {
    const original = v1ById.get(event.id);
    assert.ok(original);
    assert.deepEqual(event.effectIntent, original.effectIntent);
    assert.equal(event.effectBand, original.effectBand);
    assert.equal(event.triggerIntent, original.triggerIntent);
    assert.equal(event.runtimeSupport, original.runtimeSupport);
    assert.equal(event.activationAuthorized, false);
    assertPlayerFacingText(event.playerFacingSummary, 100, `${event.id}.summary`);
    assert.equal(event.confirmedFacts.length, 2);
    assertPlayerFacingText(event.uncertainty, 55, `${event.id}.uncertainty`);
    assert.ok(event.playerHooks.length >= 3);
    assert.ok(event.civilianRisks.length >= 2);
    assertPlayerFacingText(event.recoveryGuidance, 70, `${event.id}.recovery`);
  }
  for (const arc of events.crisisArcs) {
    assert.equal(arc.requiredRecovery, true);
    assert.equal(arc.irreversibleLossPolicy, 'prohibited-for-base-beta');
    assert.equal(arc.activationAuthorized, false);
  }
});

test('Campaign news output preserves 30 IDs and uses unique evidence-aware copy', async () => {
  const [, , newsV1, , , news] = await documents();
  assert.equal(news.schemaVersion, 'econovaria-beta-campaign-news-v2');
  assert.equal(news.templateCount, 30);
  assert.deepEqual(news.newsTemplates.map((entry) => entry.id).sort(), newsV1.newsTemplates.map((entry) => entry.id).sort());
  assert.equal(new Set(news.newsTemplates.map((entry) => entry.headlineTemplate)).size, 30);
  assert.equal(new Set(news.newsTemplates.map((entry) => entry.bodyTemplate)).size, 30);
  for (const template of news.newsTemplates) {
    assertPlayerFacingText(template.headlineTemplate, 22, `${template.id}.headline`);
    assertPlayerFacingText(template.bodyTemplate, 95, `${template.id}.body`);
    assertPlayerFacingText(template.linkedContentId, 20, `${template.id}.linkedContentId`);
    assert.equal(template.evidenceLabelPolicy, 'separate-confirmed-facts-uncertainty-and-corrections');
    assert.equal(template.correctionPolicy, 'publish-linked-correction-without-deleting-original-audit-history');
    assert.equal(template.activationAuthorized, false);
  }
});

test('Campaign notifications preserve 30 IDs and provide unique actionable copy', async () => {
  const [, , , notificationV1, , , notifications] = await documents();
  assert.equal(notifications.schemaVersion, 'econovaria-beta-campaign-notifications-v2');
  assert.equal(notifications.templateCount, 30);
  assert.deepEqual(notifications.notificationTemplates.map((entry) => entry.id).sort(), notificationV1.notificationTemplates.map((entry) => entry.id).sort());
  assert.equal(new Set(notifications.notificationTemplates.map((entry) => entry.titleTemplate)).size, 30);
  assert.equal(new Set(notifications.notificationTemplates.map((entry) => entry.bodyTemplate)).size, 30);
  for (const template of notifications.notificationTemplates) {
    assertPlayerFacingText(template.titleTemplate, 18, `${template.id}.title`);
    assertPlayerFacingText(template.bodyTemplate, 95, `${template.id}.body`);
    assertPlayerFacingText(template.recommendedAction, 65, `${template.id}.recommendedAction`);
    assert.equal(template.deliveryPolicy, 'authoritative-state-change-only');
    assert.equal(template.deduplicationPolicy, 'stable-event-and-recipient-key-required');
    assert.equal(template.activationAuthorized, false);
  }
});

test('Executable pack advertises complete authored campaign coverage and remains fail closed', async () => {
  const [, , , , events, news, notifications, pack] = await documents();
  assert.equal(pack.domainFiles.campaignEvents, 'campaign-events-v2.json');
  assert.equal(pack.domainFiles.campaignNews, 'campaign-news-v2.json');
  assert.equal(pack.domainFiles.campaignNotifications, 'campaign-notifications-v2.json');
  assert.equal(pack.boundedCounts.campaignEvents, 25);
  assert.equal(pack.boundedCounts.campaignEventChains, 10);
  assert.equal(pack.boundedCounts.campaignCrisisArcs, 5);
  assert.equal(pack.boundedCounts.campaignNewsTemplates, 30);
  assert.equal(pack.boundedCounts.campaignNotificationTemplates, 30);
  assert.equal(pack.contentRevisions.campaign, 'campaign-content-v2');
  assert.equal(pack.contentQuality.authoredCampaignEvents, 25);
  assert.equal(pack.contentQuality.authoredCampaignNewsTemplates, 30);
  assert.equal(pack.contentQuality.authoredCampaignNotificationTemplates, 30);
  assert.equal(pack.contentQuality.uniqueCampaignEventSummaries, 25);
  assert.equal(pack.contentQuality.uniqueCampaignNewsBodies, 30);
  assert.equal(pack.contentQuality.uniqueCampaignNotificationBodies, 30);
  assert.equal(pack.contentQuality.placeholderCampaignContent, 0);
  assert.equal(events.activationAuthorized, false);
  assert.equal(news.activationAuthorized, false);
  assert.equal(notifications.activationAuthorized, false);
});
