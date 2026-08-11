import { parseStoryCondition } from "../contracts/storyConditionContracts.ts";
import { parseStoryEffect } from "../contracts/storyEffectContracts.ts";

export {};

declare const Deno: {
  readonly args: readonly string[];
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

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

type InteractionRecord = {
  readonly day: number;
  readonly choices: ReadonlySet<string>;
};

type CallbackRecord = {
  readonly day: number;
  readonly interactionKey: string;
  readonly choiceKey: string;
};

Deno.test("monthly Story content pack satisfies shared parser, callback, coverage, and privacy contracts", async () => {
  const packPath = Deno.args[0];
  if (!packPath) throw new Error("Pass the monthly Story content pack path after --.");
  const pack = JSON.parse(await Deno.readTextFile(packPath)) as RecordValue;

  safePublicKey(pack.packId, "packId");
  const days = recordField(pack.days, "days");
  const startDay = integerField(days, "start");
  const endDay = integerField(days, "end");
  if (startDay < 1 || endDay < startDay || endDay > 334) {
    throw new Error(`Invalid monthly day range ${startDay}-${endDay}.`);
  }

  const acceptance = recordField(pack.acceptance, "acceptance");
  const expectedCountryCount = integerField(acceptance, "countryCount");
  if (expectedCountryCount !== 10) throw new Error("All standard campaign packs must target 10 countries.");

  const countries = arrayOfRecords(pack.countries, "countries");
  assertEquals(countries.length, expectedCountryCount);
  assertEquals(
    countries.map((country) => String(country.countryCode)).sort(),
    [...COUNTRY_CODES].sort(),
  );

  const events = arrayOfRecords(pack.storyEvents, "storyEvents");
  const news = arrayOfRecords(pack.news, "news");
  const contracts = arrayOfRecords(pack.contractPlans, "contractPlans");
  const systems = arrayOfRecords(pack.systemBindingPlans, "systemBindingPlans");
  const quietDays = numberArray(pack.noForcedInterruptionDays, "noForcedInterruptionDays");
  const deferred = Array.isArray(pack.deferredCallbacks)
    ? arrayOfRecords(pack.deferredCallbacks, "deferredCallbacks")
    : [];

  const interactions = new Map<string, InteractionRecord>();
  const callbacks: CallbackRecord[] = [];
  const characterMessagesByCountry = new Map<string, number>();
  const coveredDays = new Set<number>();

  for (const event of events) {
    const day = integerField(event, "day");
    assertDayInRange(day, startDay, endDay, "Story event");
    coveredDays.add(day);
    safePublicKey(event.eventKey, `Day ${day} eventKey`);

    for (const rule of arrayOfRecords(event.playerRules, `Day ${day} playerRules`)) {
      safePublicKey(rule.ruleKey, `Day ${day} ruleKey`);
      const condition = parseStoryCondition(rule.condition);
      const countryCode = countryCodeFromCondition(condition);
      if (condition.type === "player_story_choice_is") {
        callbacks.push({ day, interactionKey: condition.interactionKey, choiceKey: condition.choiceKey });
      }

      for (const rawEffect of arrayOfRecords(rule.effects, `Day ${day} effects`)) {
        const effect = parseStoryEffect(rawEffect);
        if (effect.type === "character_message") {
          safePublicKey(effect.characterKey, `Day ${day} characterKey`);
          if (countryCode) {
            characterMessagesByCountry.set(
              countryCode,
              (characterMessagesByCountry.get(countryCode) ?? 0) + 1,
            );
          }
          if (effect.responseWindow) {
            if (!effect.interactionKey) throw new Error(`Day ${day} response window has no interactionKey.`);
            if (interactions.has(effect.interactionKey)) {
              throw new Error(`Duplicate interactionKey ${effect.interactionKey}.`);
            }
            if (effect.responseWindow.durationSeconds === null) {
              throw new Error(`Consequential interaction ${effect.interactionKey} must have a finite close time.`);
            }
            interactions.set(effect.interactionKey, {
              day,
              choices: new Set(effect.responseWindow.options.map((option) => option.choiceKey)),
            });
          }
        }
        if (effect.type === "relationship_adjust") {
          safePublicKey(effect.characterKey, `Day ${day} relationship characterKey`);
        }
      }
    }
  }

  for (const item of deferred) {
    const day = integerField(item, "day");
    if (day <= endDay || day > 334) {
      throw new Error(`Deferred callback Day ${day} must occur after this monthly pack.`);
    }
    safePublicKey(item.eventKey, "deferred eventKey");
    const condition = parseStoryCondition(item.condition);
    if (condition.type !== "player_story_choice_is") {
      throw new Error("Deferred callback must use player_story_choice_is.");
    }
    callbacks.push({ day, interactionKey: condition.interactionKey, choiceKey: condition.choiceKey });
  }

  for (const callback of callbacks) {
    const interaction = interactions.get(callback.interactionKey);
    if (!interaction) {
      throw new Error(`Callback references unknown interaction ${callback.interactionKey}.`);
    }
    if (callback.day <= interaction.day) {
      throw new Error(`Callback for ${callback.interactionKey} must be later than source Day ${interaction.day}.`);
    }
    if (!interaction.choices.has(callback.choiceKey)) {
      throw new Error(`Callback choice ${callback.choiceKey} is not authored on ${callback.interactionKey}.`);
    }
  }

  if (acceptance.requireEveryChoiceCallback === true) {
    const callbackKeys = new Set(callbacks.map((callback) => callback.interactionKey));
    for (const key of interactions.keys()) {
      if (!callbackKeys.has(key)) throw new Error(`Interaction ${key} has no later callback.`);
    }
  }

  const requiredChoiceDays = numberArray(acceptance.requiredChoiceDays, "acceptance.requiredChoiceDays");
  const actualChoiceDays = [...new Set([...interactions.values()].map((item) => item.day))].sort((a, b) => a - b);
  assertEquals(actualChoiceDays, [...requiredChoiceDays].sort((a, b) => a - b));

  const minimumMessages = optionalIntegerField(acceptance, "minimumCharacterMessagesPerCountry") ?? 0;
  for (const country of COUNTRY_CODES) {
    const count = characterMessagesByCountry.get(country) ?? 0;
    if (count < minimumMessages) {
      throw new Error(`Expected at least ${minimumMessages} character messages for ${country}, found ${count}.`);
    }
  }

  const minimumNews = optionalIntegerField(acceptance, "minimumNewsRecords") ?? 0;
  if (news.length < minimumNews) throw new Error(`Expected at least ${minimumNews} News records, found ${news.length}.`);

  const expectedContracts = optionalIntegerField(acceptance, "expectedContractPlans");
  if (expectedContracts !== null && contracts.length !== expectedContracts) {
    throw new Error(`Expected ${expectedContracts} Contract plans, found ${contracts.length}.`);
  }

  for (const item of news) {
    assertDayInRange(integerField(item, "day"), startDay, endDay, "News");
    coveredDays.add(integerField(item, "day"));
    safePublicKey(item.newsKey, "newsKey");
  }

  for (const item of contracts) {
    assertDayInRange(integerField(item, "day"), startDay, endDay, "Contract plan");
    coveredDays.add(integerField(item, "day"));
    safePublicKey(item.contractKey, "contractKey");
    if (item.bindingStatus !== "PLANNED_BINDING") {
      throw new Error(`Contract ${String(item.contractKey)} must remain PLANNED_BINDING until adapter work lands.`);
    }
  }

  for (const item of systems) {
    assertDayInRange(integerField(item, "day"), startDay, endDay, "System binding plan");
    coveredDays.add(integerField(item, "day"));
    safePublicKey(item.bindingKey, "bindingKey");
    if (item.bindingStatus !== "PLANNED_BINDING") {
      throw new Error(`System binding ${String(item.bindingKey)} must remain PLANNED_BINDING until adapter work lands.`);
    }
  }

  for (const day of quietDays) {
    assertDayInRange(day, startDay, endDay, "Quiet day");
    coveredDays.add(day);
  }

  for (let day = startDay; day <= endDay; day += 1) {
    if (!coveredDays.has(day)) throw new Error(`Day ${day} has no authored monthly coverage.`);
  }

  assertNoUuidShapedPublicKeys(pack);
  if (acceptance.prohibitHiddenCanonTerms === true) {
    const serialized = JSON.stringify(pack);
    for (const term of HIDDEN_CANON_TERMS) {
      if (serialized.includes(term)) throw new Error(`Hidden canon leaked into monthly pack: ${term}`);
    }
  }
});

function countryCodeFromCondition(condition: ReturnType<typeof parseStoryCondition>): string | null {
  return "type" in condition && condition.type === "player_current_country_is"
    ? condition.countryCode
    : null;
}

function assertNoUuidShapedPublicKeys(value: unknown, currentPath = "pack"): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoUuidShapedPublicKeys(child, `${currentPath}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${currentPath}.${key}`;
    if ((key.endsWith("Key") || key.endsWith("Id")) && typeof child === "string" && UUID_SHAPED.test(child)) {
      throw new Error(`UUID-shaped public identifier leaked at ${childPath}.`);
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

function assertDayInRange(day: number, start: number, end: number, label: string): void {
  if (day < start || day > end) throw new Error(`${label} Day ${day} is outside ${start}-${end}.`);
}

function integerField(record: RecordValue, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${field} must be an integer.`);
  return value;
}

function optionalIntegerField(record: RecordValue, field: string): number | null {
  const value = record[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${field} must be an integer.`);
  return value;
}

function arrayOfRecords(value: unknown, field: string): RecordValue[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`${field}[${index}] must be an object.`);
    return item;
  });
}

function numberArray(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "number" || !Number.isInteger(item))) {
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
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}
