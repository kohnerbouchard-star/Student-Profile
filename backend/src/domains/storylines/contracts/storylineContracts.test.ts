import {
  buildStorylineEventInsertRow,
  parseStorylineEventConfig,
} from "./storylineContracts.ts";
import { StorylineContractError } from "./storylineContractErrors.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("storyline event parser accepts valid cutscene/news/player rule payload", () => {
  const event = parseStorylineEventConfig({
    eventKey: "northreach-border-closure",
    title: "Northern Border Closure",
    priority: "major",
    triggerType: "elapsed_time",
    scheduledOffsetSeconds: 1800,
    reveal: {
      notificationType: "story_cutscene",
      displayMode: "modal_on_next_login",
      videoAssetKey: "northreach-border-closure-v1",
      posterAssetKey: "northreach-border-closure-poster",
      headline: "Northreach closes northern migration corridors",
      summary: "Border restrictions escalate after security concerns.",
      requiresAcknowledgement: true,
    },
    publicNews: {
      headline: "Northreach closes northern migration corridors",
      explanation: "Security restrictions disrupt northern logistics corridors.",
      category: "geopolitical",
      scope: "country",
      targetKey: "NORTHREACH",
      sentiment: "negative",
      impactStrength: "medium",
      durationTicks: 5,
      source: "system",
      metadata: {
        storylineEventKey: "northreach-border-closure",
      },
    },
    playerRules: [
      {
        ruleKey: "northreach-location-tax",
        condition: {
          type: "player_current_country_is",
          countryCode: "NORTHREACH",
        },
        effects: [
          {
            type: "cash_debit",
            amount: 150,
            label: "Emergency security levy",
            reason: "You were located in Northreach when the border closure occurred.",
          },
        ],
      },
    ],
    policies: [
      {
        policyKey: "northreach-outbound-freeze",
        policyType: "immigration_lock",
        scopeType: "country",
        scopeKey: "NORTHREACH",
        durationSeconds: 1200,
        payload: {
          blockedDirection: "outbound",
        },
      },
    ],
    flags: [
      {
        flagKey: "northreach_border_closed",
        value: true,
      },
    ],
  });

  assertEquals(event.eventKey, "northreach-border-closure");
  assertEquals(event.triggerType, "elapsed_time");
  assertEquals(event.scheduledOffsetSeconds, 1800);
  assertEquals(event.reveal?.displayMode, "modal_on_next_login");
  assertEquals(event.publicNews?.category, "geopolitical");
  assertEquals(event.playerRules[0]?.effects[0]?.type, "cash_debit");
  assertEquals(event.policies[0]?.policyType, "immigration_lock");
  assertEquals(event.flags[0]?.flagKey, "northreach_border_closed");

  const row = buildStorylineEventInsertRow("storyline-1", event);

  assertEquals(row.storyline_id, "storyline-1");
  assertEquals(row.event_key, "northreach-border-closure");
  assertEquals(row.trigger_type, "elapsed_time");
  assertEquals(row.priority, "major");
  assertEquals(row.player_rules.length, 1);
});

Deno.test("storyline event parser rejects invalid trigger types", () => {
  const error = assertThrows(
    () =>
      parseStorylineEventConfig({
        eventKey: "bad-trigger",
        title: "Bad Trigger",
        triggerType: "timer",
      }),
    StorylineContractError,
  );

  assertEquals(error.code, "invalid_storyline_contract");
});

Deno.test("storyline event parser rejects invalid condition types", () => {
  assertThrows(
    () =>
      parseStorylineEventConfig({
        eventKey: "bad-condition",
        title: "Bad Condition",
        triggerType: "elapsed_time",
        scheduledOffsetSeconds: 1,
        playerRules: [
          {
            ruleKey: "bad-rule",
            condition: {
              type: "player_is_lucky",
            },
            effects: [
              {
                type: "notification_impact",
                title: "Impact",
              },
            ],
          },
        ],
      }),
    StorylineContractError,
  );
});

Deno.test("storyline event parser rejects invalid effect types", () => {
  assertThrows(
    () =>
      parseStorylineEventConfig({
        eventKey: "bad-effect",
        title: "Bad Effect",
        triggerType: "elapsed_time",
        scheduledOffsetSeconds: 1,
        playerRules: [
          {
            ruleKey: "bad-rule",
            condition: {
              type: "player_cash_above",
              amount: 100,
            },
            effects: [
              {
                type: "cash_teleport",
                amount: 100,
              },
            ],
          },
        ],
      }),
    StorylineContractError,
  );
});

Deno.test("storyline event parser rejects invalid reveal payloads", () => {
  assertThrows(
    () =>
      parseStorylineEventConfig({
        eventKey: "bad-reveal",
        title: "Bad Reveal",
        triggerType: "manual",
        reveal: {
          notificationType: "story_cutscene",
          displayMode: "floating_banner",
          videoAssetKey: "cutscene-1",
          headline: "Invalid display mode",
        },
      }),
    StorylineContractError,
  );
});

Deno.test("storyline event parser rejects invalid policy payloads", () => {
  assertThrows(
    () =>
      parseStorylineEventConfig({
        eventKey: "bad-policy",
        title: "Bad Policy",
        triggerType: "manual",
        policies: [
          {
            policyKey: "bad-policy",
            policyType: "free_money",
            scopeType: "country",
            scopeKey: "NORTHREACH",
          },
        ],
      }),
    StorylineContractError,
  );
});

Deno.test("storyline event parser rejects invalid flag payloads", () => {
  assertThrows(
    () =>
      parseStorylineEventConfig({
        eventKey: "bad-flag",
        title: "Bad Flag",
        triggerType: "manual",
        flags: [
          {
            flagKey: "",
            value: true,
          },
        ],
      }),
    StorylineContractError,
  );
});

Deno.test("storyline event parser accepts condition triggers with logical operators", () => {
  const event = parseStorylineEventConfig({
    eventKey: "condition-event",
    title: "Condition Event",
    triggerType: "condition",
    triggerCondition: {
      all: [
        {
          type: "story_flag_equals",
          flagKey: "northreach_border_closed",
          value: true,
        },
        {
          not: {
            type: "player_cash_below",
            amount: 100,
          },
        },
      ],
    },
  });

  assertEquals(event.triggerType, "condition");
  assertEquals(event.triggerCondition !== null, true);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}

function assertThrows<TError extends Error>(
  run: () => unknown,
  expectedErrorClass: new (...args: never[]) => TError,
): TError {
  try {
    run();
  } catch (error) {
    if (error instanceof expectedErrorClass) {
      return error;
    }

    throw new Error(`Expected ${expectedErrorClass.name}, got ${String(error)}`);
  }

  throw new Error(`Expected ${expectedErrorClass.name} to be thrown.`);
}
