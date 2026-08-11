import fs from "node:fs";
import path from "node:path";

const contentDir = path.resolve("docs/seed-content/story/content");
const packFiles = [
  "act1-august-content-pack-v1.json",
  "act2-september-content-pack-v1.json",
  "act2-october-content-pack-v1.json",
  "act3-november-content-pack-v1.json",
  "act3-december-content-pack-v1.json",
  "act4-january-content-pack-v1.json",
  "act4-february-content-pack-v1.json",
  "act5-march-content-pack-v1.json",
  "act6-april-content-pack-v1.json",
  "act7-may-content-pack-v1.json",
  "act8-june-content-pack-v1.json",
];

const packs = packFiles.map((file) => {
  const filePath = path.join(contentDir, file);
  if (!fs.existsSync(filePath)) throw new Error(`Missing authored content pack ${file}.`);
  return { file, data: JSON.parse(fs.readFileSync(filePath, "utf8")) };
});

const expectedRanges = [
  [1, 31], [32, 61], [62, 92], [93, 122], [123, 153], [154, 184],
  [185, 212], [213, 243], [244, 273], [274, 304], [305, 334],
];

const eventKeys = new Map();
const newsKeys = new Map();
const contractKeys = new Map();
const interactionKeys = new Map();
let eventCount = 0;
let newsCount = 0;
let contractCount = 0;
let systemPlanCount = 0;
let characterMessageCount = 0;
let relationshipAdjustmentCount = 0;
let quietDayCount = 0;

for (let index = 0; index < packs.length; index += 1) {
  const { file, data } = packs[index];
  const [expectedStart, expectedEnd] = expectedRanges[index];
  if (data.days?.start !== expectedStart || data.days?.end !== expectedEnd) {
    throw new Error(`${file} expected Days ${expectedStart}-${expectedEnd}, found ${data.days?.start}-${data.days?.end}.`);
  }
  if (!Array.isArray(data.countries) || data.countries.length !== 10) {
    throw new Error(`${file} must carry all 10 country contexts.`);
  }

  for (const storyEvent of data.storyEvents ?? []) {
    eventCount += 1;
    uniqueKey(eventKeys, storyEvent.eventKey, `${file} Day ${storyEvent.day}`);
    assertNoSpoilerKey(storyEvent.eventKey, storyEvent.day, `${file} eventKey`);
    assertHiddenCanonTiming(storyEvent, storyEvent.day, `${file} story event`);
    for (const rule of storyEvent.playerRules ?? []) {
      assertNoSpoilerKey(rule.ruleKey, storyEvent.day, `${file} ruleKey`);
      for (const effect of rule.effects ?? []) {
        if (effect.type === "character_message") {
          characterMessageCount += 1;
          assertNoSpoilerKey(effect.characterKey, storyEvent.day, `${file} characterKey`);
          if (effect.interactionKey) {
            uniqueKey(interactionKeys, effect.interactionKey, `${file} Day ${storyEvent.day}`);
            assertNoSpoilerKey(effect.interactionKey, storyEvent.day, `${file} interactionKey`);
          }
        }
        if (effect.type === "relationship_adjust") relationshipAdjustmentCount += 1;
        assertHiddenCanonTiming(effect, storyEvent.day, `${file} Story effect`);
      }
    }
  }

  for (const item of data.news ?? []) {
    newsCount += 1;
    uniqueKey(newsKeys, item.newsKey, `${file} Day ${item.day}`);
    assertNoSpoilerKey(item.newsKey, item.day, `${file} newsKey`);
    assertHiddenCanonTiming(item, item.day, `${file} News`);
  }

  for (const item of data.contractPlans ?? []) {
    contractCount += 1;
    uniqueKey(contractKeys, item.contractKey, `${file} Day ${item.day}`);
    assertNoSpoilerKey(item.contractKey, item.day, `${file} contractKey`);
    if (item.bindingStatus !== "PLANNED_BINDING") {
      throw new Error(`${file} Contract ${item.contractKey} must remain PLANNED_BINDING until adapter work lands.`);
    }
  }

  for (const item of data.systemBindingPlans ?? []) {
    systemPlanCount += 1;
    assertNoSpoilerKey(item.bindingKey, item.day, `${file} bindingKey`);
    if (item.bindingStatus !== "PLANNED_BINDING") {
      throw new Error(`${file} system ${item.bindingKey} must remain PLANNED_BINDING until adapter work lands.`);
    }
  }

  quietDayCount += (data.noForcedInterruptionDays ?? []).length;
}

const anchors = new Map([
  [1, "event.campaign.d001.arrival.v1"],
  [29, "event.meridian.forum-announced.v1"],
  [64, "event.campaign.d064.competing-models-formal.v1"],
  [99, "event.meridian.sableport-capacity-warning.v1"],
  [127, "event.campaign.d127.structural-stress-synthesis.v1"],
  [162, "event.meridian.customs-security-intrusion.v1"],
  [176, "event.campaign.d176.attribution-crisis.v1"],
  [190, "event.campaign.d190.emergency-access-debate.v1"],
  [199, "event.meridian.attack.v1"],
  [204, "event.campaign.d204.emergency-controls.v1"],
  [213, "event.campaign.d213.retaliation.v1"],
  [220, "event.campaign.d220.open-war.v1"],
  [241, "event.campaign.d241.attribution-correction.v1"],
  [253, "event.campaign.d253.network-pressure.v1"],
  [267, "event.campaign.d267.profiteering-review.v1"],
  [281, "event.campaign.d281.war-exhaustion.v1"],
  [288, "event.campaign.d288.continuity-compact-breakthrough.v1"],
  [302, "event.campaign.d302.peace-architectures.v1"],
  [309, "event.campaign.d309.ceasefire.v1"],
  [323, "event.campaign.d323.personal-future.v1"],
  [330, "event.campaign.d330.final-reckoning.v1"],
]);

for (const [day, key] of anchors) {
  const source = eventKeys.get(key);
  if (!source || !source.includes(`Day ${day}`)) {
    throw new Error(`Fixed story anchor Day ${day} / ${key} is missing or displaced.`);
  }
}

const june = packs.at(-1).data;
if (!(june.noForcedInterruptionDays ?? []).includes(334)) {
  throw new Error("Day 334 must remain an intentional quiet campaign closure.");
}
if (!Array.isArray(june.worldEndingPlans) || june.worldEndingPlans.length !== 4) {
  throw new Error("June pack must define four primary world ending architectures.");
}
if (!Array.isArray(june.personalEndingFamilies) || june.personalEndingFamilies.length !== 10) {
  throw new Error("June pack must define ten personal ending families.");
}

const handoffs = [
  ["story.content.act2.september.v1", 61, 64, "story.content.act2.october.v1"],
  ["story.content.act3.december.v1", 153, 155, "story.content.act4.january.v1"],
  ["story.content.act5.march.v1", 243, 245, "story.content.act6.april.v1"],
  ["story.content.act7.may.v1", 302, 306, "story.content.act8.june.v1"],
];

for (const [sourcePackId, sourceDay, targetDay, targetPackId] of handoffs) {
  const source = packs.find(({ data }) => data.packId === sourcePackId)?.data;
  const target = packs.find(({ data }) => data.packId === targetPackId)?.data;
  if (!source || !target) throw new Error(`Missing callback handoff pack ${sourcePackId} -> ${targetPackId}.`);
  const deferred = (source.deferredCallbacks ?? []).filter((item) => item.day === targetDay);
  if (deferred.length === 0) throw new Error(`${sourcePackId} is missing deferred callback plans for Day ${targetDay}.`);
  const incoming = (target.incomingCallbackPlans ?? []).some((item) => item.sourceDay === sourceDay && (item.targetDay === targetDay || item.targetDay === undefined));
  if (!incoming) throw new Error(`${targetPackId} does not acknowledge the Day ${sourceDay} -> Day ${targetDay} callback handoff.`);
}

if (eventCount < 120) throw new Error(`Expected at least 120 Story event nodes, found ${eventCount}.`);
if (characterMessageCount < 700) throw new Error(`Expected at least 700 character-message effects, found ${characterMessageCount}.`);
if (interactionKeys.size < 350) throw new Error(`Expected at least 350 structured interactions, found ${interactionKeys.size}.`);
if (newsCount < 450) throw new Error(`Expected at least 450 News records, found ${newsCount}.`);
if (contractCount < 400) throw new Error(`Expected at least 400 country Contract plans, found ${contractCount}.`);
if (systemPlanCount < 45) throw new Error(`Expected at least 45 system binding plans, found ${systemPlanCount}.`);
if (quietDayCount < 35) throw new Error(`Expected at least 35 deliberate quiet-day declarations, found ${quietDayCount}.`);

console.log(JSON.stringify({
  packs: packs.length,
  eventNodes: eventCount,
  characterMessages: characterMessageCount,
  structuredInteractions: interactionKeys.size,
  relationshipAdjustments: relationshipAdjustmentCount,
  newsRecords: newsCount,
  contractPlans: contractCount,
  systemBindingPlans: systemPlanCount,
  quietDayDeclarations: quietDayCount,
}, null, 2));

function uniqueKey(map, value, source) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing stable key at ${source}.`);
  if (map.has(value)) throw new Error(`Duplicate stable key ${value}: ${map.get(value)} and ${source}.`);
  map.set(value, source);
}

function assertNoSpoilerKey(value, day, label) {
  if (typeof value !== "string") return;
  const lower = value.toLowerCase();
  if (lower.includes("false-calm")) throw new Error(`${label} contains author-only spoiler phrase false-calm.`);
  if (lower.includes("pre-attack")) throw new Error(`${label} contains author-only spoiler phrase pre-attack.`);
  if (day < 199 && /(^|[._:-])attack([._:-]|$)/.test(lower)) throw new Error(`${label} reveals attack before Day 199.`);
  if (day < 220 && lower.includes("open-war")) throw new Error(`${label} reveals open war before Day 220.`);
  if (day < 288 && lower.includes("continuity-compact")) throw new Error(`${label} reveals Continuity Compact before Day 288.`);
}

function assertHiddenCanonTiming(value, day, label) {
  if (day >= 288) return;
  const text = JSON.stringify(value);
  for (const term of ["Continuity Compact", "Ilyra Morn", "Karo Mesen", "Orel Tannis", "Davren Korr", "Alys Merrow"]) {
    if (text.includes(term)) throw new Error(`${label} leaks hidden canon term ${term} before Day 288.`);
  }
}
