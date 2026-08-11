import { parseStoryCondition } from "../contracts/storyConditionContracts.ts";
import { parseStoryEffect } from "../contracts/storyEffectContracts.ts";

export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const PACK_URL = new URL(
  "../../../../../docs/seed-content/story/content/act1-august-content-pack-v1.json",
  import.meta.url,
);

const COUNTRY_CODES = [
  "NORTHREACH",
  "YRETHIA",
  "THALORIS",
  "SOLVEND",
  "ELDORAN",
  "VALERION",
  "LUMENOR",
  "XALVORIA",
  "DRAVENLOK",
  "SYNDALIS",
] as const;

const UUID_SHAPED =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HIDDEN_CANON_TERMS = [
  "Continuity Compact",
  "Ilyra Morn",
  "Karo Mesen",
  "Orel Tannis",
  "Davren Korr",
  "Alys Merrow",
] as const;

type RecordValue = Record<string, unknown>;

Deno.test("August Story content pack is complete, parser-valid, and callback-reachable", async () => {
  const pack = JSON.parse(await Deno.readTextFile(PACK_URL)) as RecordValue;

  assertEquals(pack.packId, "story.content.act1.august.v1");
  assertEquals(pack.version, "1.0.0");
  assertEquals(pack.campaign, "CEE100");

  const countries = arrayOfRecords(pack.countries, "countries");
  assertEquals(countries.length, 10);
  assertEquals(
    countries.map((country) => String(country.countryCode)).sort(),
    [...COUNTRY_CODES].sort(),
  );

  const events = arrayOfRecords(pack.storyEvents, "storyEvents");
  const news = arrayOfRecords(pack.news, "news");
  const contracts = arrayOfRecords(pack.contractPlans, "contractPlans");
  const systems = arrayOfRecords(pack.systemBindingPlans, "systemBindingPlans");
  const quietDays = numberArray(pack.noForcedInterruptionDays, "noForcedInterruptionDays");

  assertEquals(events.length, 14);
  assertEquals(contracts.length, 40);
  if (news.length < 50) {
    throw new Error(`Expected at least 50 August News records, found ${news.length}.`);
  }

  const interactionDay = new Map<string, number>();
  const interactionChoices = new Map<string, ReadonlySet<string>>();
  const callbackConditions: Array<{
    readonly day: number;
    readonly interactionKey: string;
    readonly choiceKey: string;
  }> = [];
  const characterMessageCountByCountry = new Map<string, number>();

  for (const event of events) {
    const day = integerField(event, "day");
    if (day < 1 || day > 31) throw new Error(`Story event day out of range: ${day}`);
    safePublicKey(event.eventKey, "eventKey");

    for (const rule of arrayOfRecords(event.playerRules, `event Day ${day} playerRules`)) {
      safePublicKey(rule.ruleKey, `Day ${day} ruleKey`);
      const condition = parseStoryCondition(rule.condition);
      const country = countryCodeFromCondition(condition);

      if ("type" in condition && condition.type === "player_story_choice_is") {
        callbackConditions.push({
          day,
          interactionKey: condition.interactionKey,
          choiceKey: condition.choiceKey,
        });
      }

      for (const rawEffect of arrayOfRecords(rule.effects, `Day ${day} effects`)) {
        const effect = parseStoryEffect(rawEffect);

        if (effect.type === "character_message") {
          safePublicKey(effect.characterKey, `Day ${day} characterKey`);
          if (effect.interactionKey) safePublicKey(effect.interactionKey, `Day ${day} interactionKey`);

          if (country) {
            characterMessageCountByCountry.set(
              country,
              (characterMessageCountByCountry.get(country) ?? 0) + 1,
            );
          }

          if (effect.responseWindow) {
            if (!effect.interactionKey) {
              throw new Error(`Day ${day} response window has no interactionKey.`);
            }
            if (interactionDay.has(effect.interactionKey)) {
              throw new Error(`Duplicate interactionKey: ${effect.interactionKey}`);
            }
            interactionDay.set(effect.interactionKey, day);
            interactionChoices.set(
              effect.interactionKey,
              new Set(effect.responseWindow.options.map((option) => option.choiceKey)),
            );
            if (effect.responseWindow.durationSeconds === null) {
              throw new Error(`Consequential August interaction ${effect.interactionKey} must close.`);
            }
          }
        }

        if (effect.type === "relationship_adjust") {
          safePublicKey(effect.characterKey, `Day ${day} relationship characterKey`);
        }
      }
    }
  }

  assertEquals(interactionDay.size, 40);

  for (const callback of callbackConditions) {
    const sourceDay = interactionDay.get(callback.interactionKey);
    if (sourceDay === undefined) {
      throw new Error(`Callback references unknown interaction ${callback.interactionKey}.`);
    }
    if (callback.day <= sourceDay) {
      throw new Error(
        `Callback for ${callback.interactionKey} must be later than source Day ${sourceDay}.`,
      );
    }
    const choices = interactionChoices.get(callback.interactionKey);
    if (!choices?.has(callback.choiceKey)) {
      throw new Error(
        `Callback choice ${callback.choiceKey} is not authored on ${callback.interactionKey}.`,
      );
    }
  }

  const requiredChoiceDays = numberArray(
    recordField(pack.acceptance, "acceptance").requiredChoiceDays,
    "acceptance.requiredChoiceDays",
  );
  const requiredCallbackDays = numberArray(
    recordField(pack.acceptance, "acceptance").requiredCallbackDays,
    "acceptance.requiredCallbackDays",
  );
  assertEquals(requiredChoiceDays, [7, 13, 20, 26]);
  assertEquals(requiredCallbackDays, [11, 16, 21, 28]);

  for (const country of COUNTRY_CODES) {
    const count = characterMessageCountByCountry.get(country) ?? 0;
    if (count < 9) {
      throw new Error(`Expected at least 9 recurring-character messages for ${country}, found ${count}.`);
    }
  }

  const contractKeys = new Set<string>();
  for (const contract of contracts) {
    const key = safePublicKey(contract.contractKey, "contractKey");
    if (contractKeys.has(key)) throw new Error(`Duplicate contractKey ${key}.`);
    contractKeys.add(key);
    if (contract.bindingStatus !== "PLANNED_BINDING") {
      throw new Error(`August Contract ${key} must remain explicitly PLANNED_BINDING until adapter work lands.`);
    }
  }

  for (const item of systems) {
    const key = safePublicKey(item.bindingKey, "bindingKey");
    if (item.bindingStatus !== "PLANNED_BINDING") {
      throw new Error(`August system binding ${key} must remain explicitly PLANNED_BINDING until adapter work lands.`);
    }
  }

  const newsKeys = new Set<string>();
  for (const item of news) {
    const key = safePublicKey(item.newsKey, "newsKey");
    if (newsKeys.has(key)) throw new Error(`Duplicate newsKey ${key}.`);
    newsKeys.add(key);
  }

  const coveredDays = new Set<number>();
  for (const event of events) coveredDays.add(integerField(event, "day"));
  for (const item of news) coveredDays.add(integerField(item, "day"));
  for (const contract of contracts) coveredDays.add(integerField(contract, "day"));
  for (const item of systems) coveredDays.add(integerField(item, "day"));
  for (const day of quietDays) coveredDays.add(day);

  for (let day = 1; day <= 31; day += 1) {
    if (!coveredDays.has(day)) throw new Error(`August Day ${day} has no authored coverage.`);
  }

  const forumEvent = events.find((event) => event.eventKey === "event.meridian.forum-announced.v1");
  if (!forumEvent || forumEvent.day !== 29) {
    throw new Error("Day 29 Meridian Forum announcement anchor is missing or displaced.");
  }

  assertNoUuidShapedPublicKeys(pack);

  const serialized = JSON.stringify(pack);
  for (const term of HIDDEN_CANON_TERMS) {
    if (serialized.includes(term)) {
      throw new Error(`Hidden canon leaked into Player-facing August pack: ${term}`);
    }
  }
});

function countryCodeFromCondition(condition: ReturnType<typeof parseStoryCondition>): string | null {
  if ("type" in condition && condition.type === "player_current_country_is") {
    return condition.countryCode;
  }
  return null;
}

function assertNoUuidShapedPublicKeys(value: unknown, path = "pack"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUuidShapedPublicKeys(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if ((key.endsWith("Key") || key.endsWith("Id")) && typeof child === "string") {
      if (UUID_SHAPED.test(child)) {
        throw new Error(`UUID-shaped public identifier leaked at ${childPath}.`);
      }
    }
    assertNoUuidShapedPublicKeys(child, childPath);
  }
}

function safePublicKey(value: unknown, field: string): string {
  const key = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(key) || UUID_SHAPED.test(key)) {
    throw new Error(`${field} is not a safe stable public/content key: ${String(value)}`);
  }
  return key;
}

function integerField(record: RecordValue, field: string): number {
  const value = record[field];
  if (!Number.isInteger(value)) throw new Error(`${field} must be an integer.`);
  return value as number;
}

function arrayOfRecords(value: unknown, field: string): RecordValue[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`${field}[${index}] must be an object.`);
    return item;
  });
}

function numberArray(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item))) {
    throw new Error(`${field} must be an integer array.`);
  }
  return value as number[];
}

function recordField(value: unknown, field: string): RecordValue {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`);
  return value;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`Expected ${right}, received ${left}`);
  }
}
