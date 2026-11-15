import { ContractRepositoryError } from "../contracts/contractRepositoryContracts.ts";
import { SupabaseContractRepository } from "./supabaseContractRepository.ts";
import {
  assertEquals,
  assertRejects,
  baseTables,
  contractTemplateRow,
  FakeClient,
  gameSessionContractRow,
  validContractInput,
} from "./supabaseContractRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("contract repository creates and maps template rows", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseContractRepository(client as never);

  const template = await repository.createContractTemplate({
    templateKey: "starter-import-license",
    title: "Starter Import License",
    description: "Learn the basics of importing goods.",
    instructions: "Submit a memo for teacher review.",
    category: "trade",
    difficulty: "intro",
    estimatedDurationMinutes: 15,
    requirementsPayload: {
      manualText: "Explain why the import matters.",
    },
    rewardPayload: {
      cash: {
        amount: 250,
        currencyCode: "ECO",
      },
    },
    metadata: {
      seedPack: "core",
    },
    isActive: true,
  });

  assertEquals(template.id, "contract_templates-1");
  assertEquals(template.templateKey, "starter-import-license");
  assertEquals(
    template.requirementsPayload.manualText,
    "Explain why the import matters.",
  );
  assertEquals(
    client.tables.contract_templates[0]?.template_key,
    "starter-import-license",
  );
});

Deno.test("contract repository gets template by key and returns null when missing", async () => {
  const client = new FakeClient(baseTables({
    contract_templates: [
      contractTemplateRow({
        template_key: "starter-import-license",
        is_active: false,
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const template = await repository.getContractTemplateByKey(
    "starter-import-license",
  );
  const missing = await repository.getContractTemplateByKey("missing-template");

  assertEquals(template?.templateKey, "starter-import-license");
  assertEquals(template?.isActive, false);
  assertEquals(missing, null);
});

Deno.test("contract repository rejects duplicate template keys cleanly", async () => {
  const client = new FakeClient(baseTables({
    contract_templates: [
      contractTemplateRow({ template_key: "starter-import-license" }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const error = await assertRejects(
    () =>
      repository.createContractTemplate({
        templateKey: "starter-import-license",
        title: "Duplicate Template",
        description: "Duplicate template key.",
        instructions: "No-op.",
        category: "trade",
        difficulty: "intro",
      }),
    ContractRepositoryError,
  );

  assertEquals(error.code, "contract_template_conflict");
  assertEquals(error.tableName, "contract_templates");
});

Deno.test("contract repository creates teacher, system, and story_event contracts", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseContractRepository(client as never);

  const teacher = await repository.createGameSessionContract(
    validContractInput({
      sourceType: "teacher",
      createdByStaffId: "staff-1",
    }),
  );
  const system = await repository.createGameSessionContract(validContractInput({
    contractKey: "system-contract",
    sourceType: "system",
    sourceId: "00000000-0000-4000-8000-000000000001",
  }));
  const story = await repository.createGameSessionContract(validContractInput({
    contractKey: "story-contract",
    sourceType: "story_event",
    sourceId: "00000000-0000-4000-8000-000000000002",
  }));

  assertEquals(
    [teacher.sourceType, system.sourceType, story.sourceType],
    ["teacher", "system", "story_event"],
  );
  assertEquals(client.tables.game_session_contracts.length, 3);
});

Deno.test("contract repository lists game session contracts and excludes other sessions", async () => {
  const client = new FakeClient(baseTables({
    game_session_contracts: [
      gameSessionContractRow({
        id: "contract-new",
        game_session_id: "game-1",
        contract_key: "new-contract",
        published_at: "2026-06-25T12:10:00.000Z",
        created_at: "2026-06-25T12:00:00.000Z",
      }),
      gameSessionContractRow({
        id: "contract-draft",
        game_session_id: "game-1",
        contract_key: "draft-contract",
        status: "draft",
        published_at: null,
        created_at: "2026-06-25T12:15:00.000Z",
      }),
      gameSessionContractRow({
        id: "contract-other",
        game_session_id: "game-2",
        contract_key: "other-contract",
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const contracts = await repository.listGameSessionContracts({
    gameSessionId: "game-1",
  });

  assertEquals(contracts.map((contract) => contract.id), [
    "contract-new",
    "contract-draft",
  ]);
});

Deno.test("contract repository gets game session contract by scoped id", async () => {
  const client = new FakeClient(baseTables({
    game_session_contracts: [
      gameSessionContractRow({
        id: "contract-1",
        game_session_id: "game-1",
      }),
      gameSessionContractRow({
        id: "contract-1",
        game_session_id: "game-2",
        contract_key: "other-game-contract",
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const contract = await repository.getGameSessionContractById({
    gameSessionId: "game-1",
    contractId: "contract-1",
  });
  const missing = await repository.getGameSessionContractById({
    gameSessionId: "game-1",
    contractId: "missing-contract",
  });

  assertEquals(contract?.gameSessionId, "game-1");
  assertEquals(contract?.contractKey, "contract-1");
  assertEquals(missing, null);
});

Deno.test("contract repository updates contract status scoped by game session", async () => {
  const client = new FakeClient(baseTables({
    game_session_contracts: [
      gameSessionContractRow({
        id: "contract-1",
        game_session_id: "game-1",
        status: "draft",
        published_at: null,
      }),
      gameSessionContractRow({
        id: "contract-1",
        game_session_id: "game-2",
        status: "draft",
        published_at: null,
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const updated = await repository.updateGameSessionContractStatus({
    gameSessionId: "game-1",
    contractId: "contract-1",
    status: "active",
    publishedAt: "2026-06-25T12:30:00.000Z",
  });
  const missing = await repository.updateGameSessionContractStatus({
    gameSessionId: "game-1",
    contractId: "missing-contract",
    status: "active",
    publishedAt: "2026-06-25T12:30:00.000Z",
  });

  assertEquals(updated?.status, "active");
  assertEquals(updated?.publishedAt, "2026-06-25T12:30:00.000Z");
  assertEquals(
    client.tables.game_session_contracts.find((row) =>
      row.game_session_id === "game-2"
    )?.status,
    "draft",
  );
  assertEquals(missing, null);
});

Deno.test("contract repository filters game session contracts by status and source type", async () => {
  const client = new FakeClient(baseTables({
    game_session_contracts: [
      gameSessionContractRow({
        id: "active-teacher",
        status: "active",
        source_type: "teacher",
      }),
      gameSessionContractRow({
        id: "scheduled-system",
        status: "scheduled",
        source_type: "system",
      }),
      gameSessionContractRow({
        id: "active-story",
        status: "active",
        source_type: "story_event",
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const contracts = await repository.listGameSessionContracts({
    gameSessionId: "game-1",
    statuses: ["active"],
    sourceTypes: ["teacher", "story_event"],
  });

  assertEquals(contracts.map((contract) => contract.id), [
    "active-teacher",
    "active-story",
  ]);
});
