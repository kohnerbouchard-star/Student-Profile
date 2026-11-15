import { handleStaffContractRequest } from "./staffContractHttpHandler.ts";
import {
  CONTRACT_ID,
  contractsRoute,
  dependencies,
  GAME_SESSION_ID,
  MockContractRepository,
  NOW,
  OTHER_GAME_SESSION_ID,
  OTHER_STAFF_ID,
  publishRoute,
  request,
} from "./staffContractHttpHandler.test.requestFixtures.support.ts";
import {
  assertEquals,
  assertErrorResponse,
  contractRecord,
  FakeServiceClient,
} from "./staffContractHttpHandler.test.persistenceFixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("staff contract publish updates draft contract to active", async () => {
  const repository = new MockContractRepository([
    contractRecord({
      id: CONTRACT_ID,
      status: "draft",
      publishedAt: null,
    }),
  ]);
  const response = await handleStaffContractRequest(
    request("POST"),
    publishRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.contract.status, "active");
  assertEquals(body.contract.publishedAt, NOW);
  assertEquals(repository.updateStatusInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    status: "active",
    publishedAt: NOW,
  });
});

Deno.test("staff contract publish rejects not-found contract", async () => {
  const response = await handleStaffContractRequest(
    request("POST"),
    publishRoute(),
    dependencies({ repository: new MockContractRepository() }),
  );

  await assertErrorResponse(response, 404, "contract_not_found");
});

Deno.test("staff contract publish is scoped by gameSessionId", async () => {
  const repository = new MockContractRepository([
    contractRecord({
      id: CONTRACT_ID,
      gameSessionId: OTHER_GAME_SESSION_ID,
      status: "draft",
    }),
  ]);
  const response = await handleStaffContractRequest(
    request("POST"),
    publishRoute(),
    dependencies({ repository }),
  );

  await assertErrorResponse(response, 404, "contract_not_found");
  assertEquals(repository.updateStatusInputs.length, 0);
});

Deno.test("staff contract publish rejects non-draft scheduled contracts", async () => {
  const repository = new MockContractRepository([
    contractRecord({
      id: CONTRACT_ID,
      status: "active",
      publishedAt: NOW,
    }),
  ]);
  const response = await handleStaffContractRequest(
    request("POST"),
    publishRoute(),
    dependencies({ repository }),
  );

  await assertErrorResponse(response, 409, "contract_not_publishable");
});

Deno.test("staff contract route rejects missing staff session", async () => {
  const response = await handleStaffContractRequest(
    request("GET"),
    contractsRoute(),
    dependencies({ staffAuth: "missing" }),
  );

  await assertErrorResponse(response, 401, "missing_staff_auth_user");
});

Deno.test("staff contract route rejects unauthorized game session", async () => {
  const response = await handleStaffContractRequest(
    request("GET"),
    contractsRoute(),
    dependencies({
      serviceClient: new FakeServiceClient([
        {
          id: GAME_SESSION_ID,
          name: "Period 1",
          status: "active",
          owner_staff_user_id: OTHER_STAFF_ID,
        },
      ]),
    }),
  );

  await assertErrorResponse(response, 404, "game_session_not_found");
});
