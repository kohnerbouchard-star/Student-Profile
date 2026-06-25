import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import { parseStoryEffect } from "../contracts/storyEffectContracts.ts";
import { StorylineContractError } from "../contracts/storylineContractErrors.ts";
import type {
  StoryCashAdjustmentWriteInput,
  StoryContractCreateWriteInput,
  StoryEffectExecutionDependencies,
  StoryFlagWriteInput,
  StoryPlayerImpactWriteInput,
  StoryPolicyWriteInput,
} from "../contracts/storyEffectExecutionContracts.ts";
import {
  executeStoryEffect,
  executeStoryEffects,
} from "./storyEffectEngine.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("story effect engine applies cash_credit through ledger and impact dependencies", async () => {
  const dependencies = createFakeDependencies();
  const result = await executeStoryEffect({
    ...baseExecutionInput(dependencies),
    effect: parseStoryEffect({
      type: "cash_credit",
      amount: 125,
      label: "Emergency subsidy",
      reason: "You held protected resources when aid was issued.",
      payload: { resourceKey: "grain" },
    }),
    playerContext: basePlayerStoryContext,
  });

  assertEquals(result.status, "applied");
  assertEquals(dependencies.writes.cashAdjustments.length, 1);
  assertEquals(
    dependencies.writes.cashAdjustments[0]?.effectType,
    "cash_credit",
  );
  assertEquals(dependencies.writes.cashAdjustments[0]?.amount, 125);
  assertEquals(dependencies.writes.cashAdjustments[0]?.signedAmount, 125);
  assertEquals(dependencies.writes.impacts.length, 1);
  assertEquals(
    dependencies.writes.impacts[0]?.impactLabel,
    "Emergency subsidy",
  );
  assertEquals(
    dependencies.writes.impacts[0]?.impactReason,
    "You held protected resources when aid was issued.",
  );
  assertEquals(dependencies.writes.impacts[0]?.amount, 125);
});

Deno.test("story effect engine applies cash_debit as a negative ledger and impact amount", async () => {
  const dependencies = createFakeDependencies();
  const result = await executeStoryEffect({
    ...baseExecutionInput(dependencies),
    effect: parseStoryEffect({
      type: "cash_debit",
      amount: 150,
      label: "Emergency security levy",
      reason: "You were located in Northreach when the levy resolved.",
    }),
    playerContext: basePlayerStoryContext,
  });

  assertEquals(result.status, "applied");
  assertEquals(dependencies.writes.cashAdjustments[0]?.signedAmount, -150);
  assertEquals(dependencies.writes.impacts[0]?.amount, -150);
});

Deno.test("story effect engine skips cash effects without player context", async () => {
  const dependencies = createFakeDependencies();
  const result = await executeStoryEffect({
    ...baseExecutionInput(dependencies),
    effect: parseStoryEffect({
      type: "cash_credit",
      amount: 25,
      label: "Small grant",
      reason: "This should not apply without a player.",
    }),
  });

  assertEquals(result.status, "skipped");
  assertSkippedReason(result, "missing_player_context");
  assertEquals(dependencies.writes.cashAdjustments.length, 0);
  assertEquals(dependencies.writes.impacts.length, 0);
});

Deno.test("story effect engine applies immigration_lock as a player-scoped policy and impact", async () => {
  const dependencies = createFakeDependencies();
  const result = await executeStoryEffect({
    ...baseExecutionInput(dependencies),
    effect: parseStoryEffect({
      type: "immigration_lock",
      policyKey: "northreach-outbound-freeze",
      durationSeconds: 1200,
      label: "Outbound immigration freeze",
      reason: "Northreach restricted outbound movement.",
      payload: { blockedDirection: "outbound" },
    }),
    playerContext: basePlayerStoryContext,
  });

  assertEquals(result.status, "applied");
  assertEquals(dependencies.writes.policies.length, 1);
  assertEquals(dependencies.writes.policies[0]?.policyType, "immigration_lock");
  assertEquals(dependencies.writes.policies[0]?.scopeType, "player");
  assertEquals(dependencies.writes.policies[0]?.scopeKey, "player-1");
  assertEquals(
    dependencies.writes.policies[0]?.expiresAt,
    "2026-06-25T12:20:00.000Z",
  );
  assertEquals(dependencies.writes.impacts.length, 1);
  assertEquals(
    dependencies.writes.impacts[0]?.impactLabel,
    "Outbound immigration freeze",
  );
  assertEquals(dependencies.writes.impacts[0]?.amount, null);
});

Deno.test("story effect engine applies tax_modifier to an explicit country policy scope", async () => {
  const dependencies = createFakeDependencies();
  const result = await executeStoryEffect({
    ...baseExecutionInput(dependencies),
    effect: parseStoryEffect({
      type: "tax_modifier",
      policyKey: "northreach-security-tax",
      durationSeconds: 300,
      label: "Temporary security tax",
      reason: "Country-wide levy.",
      payload: { multiplier: 1.1 },
    }),
    policyScope: {
      scopeType: "country",
      scopeKey: "NORTHREACH",
    },
  });

  assertEquals(result.status, "applied");
  assertEquals(dependencies.writes.policies[0]?.policyType, "tax_modifier");
  assertEquals(dependencies.writes.policies[0]?.scopeType, "country");
  assertEquals(dependencies.writes.policies[0]?.scopeKey, "NORTHREACH");
  assertEquals(dependencies.writes.impacts.length, 0);
});

Deno.test("story effect engine skips default policy effects without player context", async () => {
  const dependencies = createFakeDependencies();
  const result = await executeStoryEffect({
    ...baseExecutionInput(dependencies),
    effect: parseStoryEffect({
      type: "tax_modifier",
      policyKey: "player-tax",
      durationSeconds: 300,
    }),
  });

  assertEquals(result.status, "skipped");
  assertSkippedReason(result, "missing_player_context");
  assertEquals(dependencies.writes.policies.length, 0);
});

Deno.test("story effect engine applies story_flag_set through flag dependency", async () => {
  const dependencies = createFakeDependencies();
  const result = await executeStoryEffect({
    ...baseExecutionInput(dependencies),
    effect: parseStoryEffect({
      type: "story_flag_set",
      flagKey: "northreach_border_closed",
      value: true,
    }),
  });

  assertEquals(result.status, "applied");
  assertEquals(dependencies.writes.flags.length, 1);
  assertEquals(
    dependencies.writes.flags[0]?.flagKey,
    "northreach_border_closed",
  );
  assertEquals(dependencies.writes.flags[0]?.value, true);
});

Deno.test("story effect engine creates story contracts from contract_unlock", async () => {
  const dependencies = createFakeDependencies({ enableContracts: true });
  const result = await executeStoryEffect({
    ...baseExecutionInput(dependencies),
    effect: parseStoryEffect({
      type: "contract_unlock",
      contractKey: "northreach_market_brief",
      label: "Northreach Market Brief",
      reason: "A new market research contract was unlocked.",
      payload: {
        title: "Northreach Market Brief",
        description: "Analyze the Northreach border closure.",
        instructions: "Submit a short market brief before the deadline.",
        category: "research",
        targetingPayload: { countryCodes: ["NORTHREACH"] },
        requirementsPayload: { evidenceType: "written_brief" },
        rewardPayload: { cash: { amount: 100, currencyCode: "SLV" } },
        metadata: { source: "storyline" },
      },
    }),
    playerContext: basePlayerStoryContext,
  });

  assertEquals(result.status, "applied");
  assertEquals(dependencies.writes.contracts.length, 1);
  assertEquals(dependencies.writes.contracts[0]?.gameSessionId, "game-1");
  assertEquals(
    dependencies.writes.contracts[0]?.contractKey,
    "northreach_market_brief",
  );
  assertEquals(dependencies.writes.contracts[0]?.sourceType, "story_event");
  assertEquals(dependencies.writes.contracts[0]?.sourceId, "event-1");
  assertEquals(dependencies.writes.contracts[0]?.createdByStaffId, null);
  assertEquals(
    dependencies.writes.contracts[0]?.title,
    "Northreach Market Brief",
  );
  assertEquals(dependencies.writes.contracts[0]?.status, "active");
  assertEquals(dependencies.writes.contracts[0]?.visibility, "public");
  assertEquals(
    dependencies.writes.contracts[0]?.completionMode,
    "manual_review",
  );
  assertEquals(
    dependencies.writes.contracts[0]?.publishedAt,
    "2026-06-25T12:00:00.000Z",
  );
  assertEquals(dependencies.writes.contracts[0]?.rewardPayload, {
    cash: { amount: 100, currencyCode: "SLV" },
  });
});

Deno.test("story effect engine skips unsupported parsed effect types", async () => {
  const dependencies = createFakeDependencies();
  const result = await executeStoryEffect({
    ...baseExecutionInput(dependencies),
    effect: parseStoryEffect({
      type: "contract_unlock",
      contractKey: "future-contract",
    }),
    playerContext: basePlayerStoryContext,
  });

  assertEquals(result.status, "skipped");
  assertSkippedReason(result, "unsupported_effect_type");
  assertEquals(dependencies.writes.cashAdjustments.length, 0);
  assertEquals(dependencies.writes.policies.length, 0);
  assertEquals(dependencies.writes.flags.length, 0);
  assertEquals(dependencies.writes.impacts.length, 0);
});

Deno.test("story effect engine reports failed dependency writes without throwing", async () => {
  const dependencies = createFakeDependencies({
    failLedger: true,
  });
  const result = await executeStoryEffect({
    ...baseExecutionInput(dependencies),
    effect: parseStoryEffect({
      type: "cash_credit",
      amount: 125,
      label: "Emergency subsidy",
      reason: "Ledger dependency fails in this test.",
    }),
    playerContext: basePlayerStoryContext,
  });

  assertEquals(result.status, "failed");
  assertFailedMessage(result, "ledger unavailable");
  assertEquals(dependencies.writes.cashAdjustments.length, 0);
  assertEquals(dependencies.writes.impacts.length, 0);
});

Deno.test("story effect engine batch reports applied skipped and failed counts", async () => {
  const dependencies = createFakeDependencies({
    failFlags: true,
  });
  const result = await executeStoryEffects({
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    now: "2026-06-25T12:00:00.000Z",
    playerContext: basePlayerStoryContext,
    dependencies,
    effects: [
      parseStoryEffect({
        type: "cash_credit",
        amount: 25,
        label: "Grant",
        reason: "Batch success.",
      }),
      parseStoryEffect({
        type: "contract_unlock",
        contractKey: "future-contract",
      }),
      parseStoryEffect({
        type: "story_flag_set",
        flagKey: "flag_that_fails",
        value: true,
      }),
    ],
  });

  assertEquals(result.appliedCount, 1);
  assertEquals(result.skippedCount, 1);
  assertEquals(result.failedCount, 1);
  assertEquals(result.results.map((item) => item.status), [
    "applied",
    "skipped",
    "failed",
  ]);
});

Deno.test("story effect parser still rejects invalid effect shapes", () => {
  assertThrows(
    () =>
      parseStoryEffect({
        type: "cash_teleport",
        amount: 50,
      }),
    StorylineContractError,
  );
});

interface FakeStoryEffectDependencies extends StoryEffectExecutionDependencies {
  readonly writes: {
    readonly cashAdjustments: StoryCashAdjustmentWriteInput[];
    readonly policies: StoryPolicyWriteInput[];
    readonly flags: StoryFlagWriteInput[];
    readonly impacts: StoryPlayerImpactWriteInput[];
    readonly contracts: StoryContractCreateWriteInput[];
  };
}

interface FakeFailureOptions {
  readonly failLedger?: boolean;
  readonly failPolicies?: boolean;
  readonly failFlags?: boolean;
  readonly failImpacts?: boolean;
  readonly enableContracts?: boolean;
  readonly failContracts?: boolean;
}

const basePlayerStoryContext: PlayerStoryContext = {
  playerId: "player-1",
  gameSessionId: "game-1",
  homeCountryId: "country-home",
  homeCountryCode: "YRETHIA",
  currentCountryId: "country-current",
  currentCountryCode: "NORTHREACH",
  cashBalance: 500,
  resources: {},
  sectorExposurePct: {},
  countryExposurePct: {},
  activeContractKeys: [],
  completedContractKeys: [],
  storyFlags: {},
};

function baseExecutionInput(dependencies: StoryEffectExecutionDependencies) {
  return {
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    now: "2026-06-25T12:00:00.000Z",
    dependencies,
  };
}

function createFakeDependencies(
  options: FakeFailureOptions = {},
): FakeStoryEffectDependencies {
  const writes: FakeStoryEffectDependencies["writes"] = {
    cashAdjustments: [],
    policies: [],
    flags: [],
    impacts: [],
    contracts: [],
  };

  return {
    writes,
    ledger: {
      async recordCashAdjustment(input) {
        if (options.failLedger) {
          throw new Error("ledger unavailable");
        }

        writes.cashAdjustments.push(input);
        return { id: `ledger-${writes.cashAdjustments.length}` };
      },
    },
    policies: {
      async upsertPolicy(input) {
        if (options.failPolicies) {
          throw new Error("policy repository unavailable");
        }

        writes.policies.push(input);
        return { id: `policy-${writes.policies.length}` };
      },
    },
    flags: {
      async setStoryFlag(input) {
        if (options.failFlags) {
          throw new Error("flag repository unavailable");
        }

        writes.flags.push(input);
        return { id: `flag-${writes.flags.length}` };
      },
    },
    impacts: {
      async createPlayerImpact(input) {
        if (options.failImpacts) {
          throw new Error("impact repository unavailable");
        }

        writes.impacts.push(input);
        return { id: `impact-${writes.impacts.length}` };
      },
    },
    contracts: options.enableContracts
      ? {
        async createGameSessionContract(input) {
          if (options.failContracts) {
            throw new Error("contract repository unavailable");
          }

          writes.contracts.push(input);
          return { id: `contract-${writes.contracts.length}` };
        },
      }
      : undefined,
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}

function assertSkippedReason(
  result: Awaited<ReturnType<typeof executeStoryEffect>>,
  expected: string,
): void {
  if (result.status !== "skipped") {
    throw new Error(`Expected skipped result, got ${result.status}`);
  }

  assertEquals(result.reason, expected);
}

function assertFailedMessage(
  result: Awaited<ReturnType<typeof executeStoryEffect>>,
  expected: string,
): void {
  if (result.status !== "failed") {
    throw new Error(`Expected failed result, got ${result.status}`);
  }

  assertEquals(result.errorMessage, expected);
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

    throw new Error(
      `Expected ${expectedErrorClass.name}, got ${String(error)}`,
    );
  }

  throw new Error(`Expected ${expectedErrorClass.name} to be thrown.`);
}
