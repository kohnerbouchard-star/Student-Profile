import { handleStaffContractRequest } from "./staffContractHttpHandler.ts";
import {
  CONTRACT_ID,
  contractsRoute,
  createContractBody,
  dependencies,
  GAME_SESSION_ID,
  MockContractRepository,
  OTHER_GAME_SESSION_ID,
  OTHER_STAFF_ID,
  request,
  STAFF_ID,
} from "./staffContractHttpHandler.test.requestFixtures.support.ts";
import {
  assertEquals,
  assertErrorResponse,
  contractRecord,
} from "./staffContractHttpHandler.test.persistenceFixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("staff contract route lists contracts for a game session", async () => {
  const repository = new MockContractRepository([
    contractRecord({ id: CONTRACT_ID, gameSessionId: GAME_SESSION_ID }),
  ]);

  const response = await handleStaffContractRequest(
    request("GET"),
    contractsRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(
    body.contracts.map((contract: { contractId: string }) =>
      contract.contractId
    ),
    [
      CONTRACT_ID,
    ],
  );
  assertEquals(repository.listInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    visibility: null,
  });
});

Deno.test("staff contract list excludes other game sessions", async () => {
  const repository = new MockContractRepository([
    contractRecord({ id: CONTRACT_ID, gameSessionId: GAME_SESSION_ID }),
    contractRecord({
      id: "00000000-0000-4000-8000-000000000102",
      gameSessionId: OTHER_GAME_SESSION_ID,
      contractKey: "other-game-contract",
    }),
  ]);

  const response = await handleStaffContractRequest(
    request("GET"),
    contractsRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(
    body.contracts.map((contract: { gameSessionId: string }) =>
      contract.gameSessionId
    ),
    [
      GAME_SESSION_ID,
    ],
  );
});

Deno.test("staff contract list supports status sourceType and visibility filters", async () => {
  const repository = new MockContractRepository([
    contractRecord({
      id: CONTRACT_ID,
      status: "active",
      sourceType: "teacher",
      visibility: "public",
    }),
    contractRecord({
      id: "00000000-0000-4000-8000-000000000102",
      status: "draft",
      sourceType: "teacher",
      visibility: "public",
    }),
    contractRecord({
      id: "00000000-0000-4000-8000-000000000103",
      status: "active",
      sourceType: "system",
      visibility: "public",
    }),
    contractRecord({
      id: "00000000-0000-4000-8000-000000000104",
      status: "active",
      sourceType: "teacher",
      visibility: "hidden",
    }),
  ]);

  const response = await handleStaffContractRequest(
    request("GET", {
      query: "status=active&sourceType=teacher&visibility=public",
    }),
    contractsRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(
    body.contracts.map((contract: { contractId: string }) =>
      contract.contractId
    ),
    [
      CONTRACT_ID,
    ],
  );
  assertEquals(repository.listInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    statuses: ["active"],
    sourceTypes: ["teacher"],
    visibility: "public",
  });
});

Deno.test("staff contract list rejects invalid filters", async () => {
  const response = await handleStaffContractRequest(
    request("GET", { query: "status=posted" }),
    contractsRoute(),
    dependencies(),
  );
  const empty = await handleStaffContractRequest(
    request("GET", { query: "sourceType=" }),
    contractsRoute(),
    dependencies(),
  );

  await assertErrorResponse(response, 400, "invalid_contract_status_filter");
  await assertErrorResponse(empty, 400, "invalid_contract_source_type_filter");
});

Deno.test("staff can create teacher contract", async () => {
  const repository = new MockContractRepository();
  const response = await handleStaffContractRequest(
    request("POST", { body: createContractBody() }),
    contractsRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 201);
  assertEquals(body.ok, true);
  assertEquals(body.contract.contractId, "created-contract");
  assertEquals(body.contract.sourceType, "teacher");
  assertEquals(repository.createInputs[0]?.sourceType, "teacher");
  assertEquals(repository.createInputs[0]?.createdByStaffId, STAFF_ID);
  assertEquals(repository.createInputs[0]?.gameSessionId, GAME_SESSION_ID);
});

Deno.test("staff contract create rejects client-supplied createdByStaffId", async () => {
  const response = await handleStaffContractRequest(
    request("POST", {
      body: {
        ...createContractBody(),
        createdByStaffId: OTHER_STAFF_ID,
      },
    }),
    contractsRoute(),
    dependencies(),
  );

  await assertErrorResponse(response, 400, "created_by_staff_id_not_allowed");
});

Deno.test("staff contract create rejects non-teacher sourceType", async () => {
  const response = await handleStaffContractRequest(
    request("POST", {
      body: {
        ...createContractBody(),
        sourceType: "system",
      },
    }),
    contractsRoute(),
    dependencies(),
  );

  await assertErrorResponse(response, 400, "source_type_not_allowed");
});

Deno.test("staff contract create rejects invalid payloads and enums", async () => {
  const invalidPayload = await handleStaffContractRequest(
    request("POST", {
      body: {
        ...createContractBody(),
        targetingPayload: [],
      },
    }),
    contractsRoute(),
    dependencies(),
  );
  const invalidEnum = await handleStaffContractRequest(
    request("POST", {
      body: {
        ...createContractBody(),
        visibility: "classroom",
      },
    }),
    contractsRoute(),
    dependencies(),
  );
  const invalidCreateStatus = await handleStaffContractRequest(
    request("POST", {
      body: {
        ...createContractBody(),
        status: "paused",
      },
    }),
    contractsRoute(),
    dependencies(),
  );

  await assertErrorResponse(invalidPayload, 400, "invalid_contract_request");
  await assertErrorResponse(invalidEnum, 400, "invalid_contract_request");
  await assertErrorResponse(
    invalidCreateStatus,
    400,
    "invalid_contract_status",
  );
});
