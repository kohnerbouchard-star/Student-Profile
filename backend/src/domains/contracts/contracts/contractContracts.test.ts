import {
  buildContractTemplateInsertRow,
  buildGameSessionContractInsertRow,
  buildPlayerContractProgressInsertRow,
  CONTRACT_SOURCE_TYPES,
  parseContractTemplateConfig,
  parseGameSessionContractConfig,
  parsePlayerContractProgressConfig,
} from "./contractContracts.ts";
import { ContractContractError } from "./contractContractErrors.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("contract template parser accepts reusable reward and requirement placeholders", () => {
  const template = parseContractTemplateConfig({
    templateKey: "starter-import-license",
    title: "Starter Import License",
    description: "Learn the basics of contract completion.",
    instructions: "Submit the required trade memo for review.",
    category: "trade",
    difficulty: "intro",
    estimatedDurationMinutes: 15,
    requirementsPayload: {
      manualText: "Explain why the import is useful.",
      requiredItemIds: ["item-import-permit"],
      requiredStockTrade: {
        ticker: "AUR",
        side: "buy",
        minimumQuantity: 1,
      },
      requiredAttendance: {
        minimumScans: 1,
      },
      requiredStoryFlags: [
        {
          flagKey: "orientation_complete",
          value: true,
        },
      ],
    },
    rewardPayload: {
      cash: {
        amount: 250,
        currencyCode: "ECO",
      },
      items: [
        {
          itemId: "item-trade-badge",
          quantity: 1,
        },
      ],
      scoreModifier: {
        points: 3,
        label: "Trade readiness",
      },
      storyFlagsToSet: [
        {
          flagKey: "starter_import_license_complete",
          value: true,
        },
      ],
    },
    metadata: {
      seedPack: "econovaria-core",
    },
  });

  assertEquals(template.templateKey, "starter-import-license");
  assertEquals(template.estimatedDurationMinutes, 15);
  assertEquals(template.requirementsPayload.requiredItemIds, [
    "item-import-permit",
  ]);
  assertEquals(template.rewardPayload.cash, {
    amount: 250,
    currencyCode: "ECO",
  });

  const row = buildContractTemplateInsertRow(template);

  assertEquals(row.template_key, "starter-import-license");
  assertEquals(row.is_active, true);
  assertEquals(row.reward_payload.storyFlagsToSet, [
    {
      flagKey: "starter_import_license_complete",
      value: true,
    },
  ]);
});

Deno.test("game session contract parser accepts teacher targeting, requirements, and rewards", () => {
  const contract = parseGameSessionContractConfig(validContract({
    sourceType: "teacher",
    createdByStaffId: "00000000-0000-4000-8000-000000000010",
    status: "active",
    visibility: "targeted",
    targetingPayload: {
      allPlayers: false,
      countryCodes: ["AURORA"],
      playerIds: ["00000000-0000-4000-8000-000000000020"],
      rosterLabels: ["period-1"],
      storyFlagConditions: [
        {
          flagKey: "northreach_border_closed",
          equals: true,
        },
      ],
    },
    completionMode: "manual_review",
  }));

  assertEquals(contract.sourceType, "teacher");
  assertEquals(contract.status, "active");
  assertEquals(contract.visibility, "targeted");
  assertEquals(contract.targetingPayload.countryCodes, ["AURORA"]);
  assertEquals(contract.requirementsPayload.requiredAttendance, {
    minimumScans: 2,
  });
  assertEquals(contract.rewardPayload.items, [
    {
      itemId: "item-export-license",
      quantity: 1,
    },
  ]);

  const row = buildGameSessionContractInsertRow(contract);

  assertEquals(row.game_session_id, "00000000-0000-4000-8000-000000000001");
  assertEquals(row.contract_key, "aurora-export-drive");
  assertEquals(row.source_type, "teacher");
  assertEquals(row.completion_mode, "manual_review");
});

Deno.test("game session contract parser accepts every contract source type", () => {
  const parsedSourceTypes = CONTRACT_SOURCE_TYPES.map((sourceType) =>
    parseGameSessionContractConfig(validContract({
      sourceType,
      sourceId: sourceType === "teacher"
        ? null
        : "00000000-0000-4000-8000-000000000030",
    })).sourceType
  );

  assertEquals(parsedSourceTypes, ["teacher", "system", "story_event"]);
});

Deno.test("player contract progress parser accepts evidence and result placeholders", () => {
  const progress = parsePlayerContractProgressConfig({
    gameSessionId: "00000000-0000-4000-8000-000000000001",
    contractId: "00000000-0000-4000-8000-000000000040",
    playerId: "00000000-0000-4000-8000-000000000020",
    status: "submitted",
    evidencePayload: {
      note: "Completed the trade and attached a memo.",
      attachments: [
        {
          kind: "text",
          value: "memo-1",
        },
      ],
    },
    resultPayload: {
      reviewerStaffId: "00000000-0000-4000-8000-000000000010",
      decision: "pending",
    },
    submittedAt: "2026-06-25T12:00:00.000Z",
  });

  assertEquals(progress.status, "submitted");
  assertEquals(progress.completedAt, null);
  assertEquals(progress.rewardIssuedAt, null);
  assertEquals(
    progress.evidencePayload.note,
    "Completed the trade and attached a memo.",
  );

  const row = buildPlayerContractProgressInsertRow(progress);

  assertEquals(row.status, "submitted");
  assertEquals(row.submitted_at, "2026-06-25T12:00:00.000Z");
  assertEquals(row.reward_issued_at, null);
});

Deno.test("contract parsers reject invalid enum values", () => {
  assertThrows(
    () =>
      parseGameSessionContractConfig(validContract({ sourceType: "admin" })),
    ContractContractError,
  );
  assertThrows(
    () => parseGameSessionContractConfig(validContract({ status: "posted" })),
    ContractContractError,
  );
  assertThrows(
    () =>
      parseGameSessionContractConfig(validContract({ visibility: "class" })),
    ContractContractError,
  );
  assertThrows(
    () =>
      parseGameSessionContractConfig(validContract({
        completionMode: "cash_check",
      })),
    ContractContractError,
  );
  assertThrows(
    () =>
      parsePlayerContractProgressConfig({
        gameSessionId: "00000000-0000-4000-8000-000000000001",
        contractId: "00000000-0000-4000-8000-000000000040",
        playerId: "00000000-0000-4000-8000-000000000020",
        status: "approved",
      }),
    ContractContractError,
  );
});

Deno.test("contract parsers reject non-object payloads", () => {
  assertThrows(
    () =>
      parseGameSessionContractConfig(validContract({ targetingPayload: [] })),
    ContractContractError,
  );
  assertThrows(
    () =>
      parseGameSessionContractConfig(validContract({
        requirementsPayload: "manual submission",
      })),
    ContractContractError,
  );
  assertThrows(
    () => parseGameSessionContractConfig(validContract({ rewardPayload: 100 })),
    ContractContractError,
  );
  assertThrows(
    () =>
      parsePlayerContractProgressConfig({
        gameSessionId: "00000000-0000-4000-8000-000000000001",
        contractId: "00000000-0000-4000-8000-000000000040",
        playerId: "00000000-0000-4000-8000-000000000020",
        evidencePayload: ["memo"],
      }),
    ContractContractError,
  );
});

function validContract(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    gameSessionId: "00000000-0000-4000-8000-000000000001",
    contractTemplateId: "00000000-0000-4000-8000-000000000050",
    contractKey: "aurora-export-drive",
    sourceType: "teacher",
    sourceId: null,
    createdByStaffId: null,
    title: "Aurora Export Drive",
    description: "Prepare a basic export plan for Aurora-made goods.",
    instructions: "Submit a short plan and complete the required trade.",
    category: "trade",
    status: "draft",
    visibility: "public",
    targetingPayload: {
      allPlayers: true,
    },
    requirementsPayload: {
      manualText: "Submit a trade memo.",
      requiredStockTrade: {
        ticker: "AUR",
        side: "buy",
        minimumQuantity: 1,
      },
      requiredAttendance: {
        minimumScans: 2,
      },
      requiredStoryFlags: [
        {
          flagKey: "orientation_complete",
          value: true,
        },
      ],
    },
    rewardPayload: {
      cash: {
        amount: 500,
        currencyCode: "ECO",
      },
      items: [
        {
          itemId: "item-export-license",
          quantity: 1,
        },
      ],
      scoreModifier: {
        points: 5,
      },
      storyFlagsToSet: [
        {
          flagKey: "aurora_export_drive_unlocked",
          value: true,
        },
      ],
    },
    completionMode: "manual_review",
    publishedAt: "2026-06-25T12:00:00.000Z",
    deadlineAt: "2026-06-30T12:00:00.000Z",
    expiresAt: "2026-07-01T12:00:00.000Z",
    metadata: {
      storylineEventKey: "aurora-export-drive",
    },
    ...overrides,
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
