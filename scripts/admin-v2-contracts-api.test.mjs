import assert from "node:assert/strict";
import test from "node:test";

import { createContractsApiClient } from "../admin/v2/src/api/contracts-api-client.js";
import {
  createContractsController,
  normalizeContractDetail,
  normalizeContractsReadModel,
} from "../admin/v2/src/routes/contracts/ContractsController.js";
import { ADMIN_DATA_STATES } from "../admin/v2/src/core/data-state.js";
import { getAdminNavigationRoute, isMigratedAdminRoute } from "../admin/v2/src/core/navigation-registry.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const CONTRACT_ID = "20000000-0000-4000-8000-000000000002";
const PROGRESS_ID = "30000000-0000-4000-8000-000000000003";
const PLAYER_ID = "40000000-0000-4000-8000-000000000004";
const IDEMPOTENCY = "admin.contracts.test.50000000-0000-4000-8000-000000000005.1";

function response(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function contract(overrides = {}) {
  return {
    id: CONTRACT_ID,
    contractId: CONTRACT_ID,
    contractKey: "market-evidence",
    title: "시장 증거 분석",
    description: `Explain interconnected effects without exposing ${PLAYER_ID} in presentation copy.`,
    instructions: "Write a concise evidence-based response.",
    category: "economics",
    status: "active",
    visibility: "targeted",
    sourceType: "teacher",
    targetingPayload: { countryCodes: ["NORTHREACH", "YRETHIA"], playerIds: [PLAYER_ID] },
    requirementsPayload: { manualText: "Submit written evidence." },
    rewardPayload: { cash: { amount: 75, currencyCode: "NRC" }, items: [{ storeItemId: PLAYER_ID, quantity: 2 }] },
    completionMode: "manual_review",
    deadlineAt: "2027-01-20T08:00:00.000Z",
    progressCount: 3,
    submittedCount: 1,
    completedCount: 1,
    rewardIssuedCount: 1,
    metadata: { difficulty: "Advanced", materials: [{ type: "link", title: "Guide" }], reviewNote: "Use the rubric." },
    createdAt: "2026-08-07T01:00:00.000Z",
    updatedAt: "2026-08-07T02:00:00.000Z",
    ...overrides,
  };
}

function displayProjection(model) {
  return model.contracts.map(({ resourceId: _resourceId, ...row }) => row);
}

test("Contracts navigation is source-owned V2 and permission-bound without a legacy handoff", () => {
  const route = getAdminNavigationRoute("contracts");
  assert.equal(route.migration, "v2");
  assert.equal(route.migrated, true);
  assert.equal(route.legacyDestination, null);
  assert.deepEqual(route.permission.allOf, ["contracts.manage"]);
  assert.equal(isMigratedAdminRoute("contracts"), true);
  assert.equal(getAdminNavigationRoute("overview").migration, "v2");
  assert.equal(getAdminNavigationRoute("store").migration, "v2");
  assert.equal(getAdminNavigationRoute("market").migration, "v2");
});

test("Contracts read model covers zero, one, many, Korean, long content, lifecycle summaries, and no display UUID leakage", () => {
  const empty = normalizeContractsReadModel({ data: { contracts: [] } });
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.summary.totalCount, 0);

  const one = normalizeContractsReadModel({ data: { contracts: [contract()] } });
  assert.equal(one.isEmpty, false);
  assert.equal(one.contracts[0].title, "시장 증거 분석");
  assert.equal(one.contracts[0].description.includes(PLAYER_ID), false);
  assert.equal(one.contracts[0].targeting, "NORTHREACH, YRETHIA · 1 specifically targeted player");
  assert.equal(one.contracts[0].reward.label, "75 NRC + 2 items");
  assert.equal(one.contracts[0].submittedCount, 1);
  assert.equal(one.contracts[0].completedCount, 1);
  assert.doesNotMatch(JSON.stringify(displayProjection(one)), /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);

  const long = "긴 설명 ".repeat(2_000);
  const many = normalizeContractsReadModel({
    data: {
      contracts: [
        contract(),
        contract({ id: "21000000-0000-4000-8000-000000000002", contractId: "21000000-0000-4000-8000-000000000002", contractKey: "draft-one", title: "Draft", status: "draft", description: long }),
        contract({ id: "22000000-0000-4000-8000-000000000002", contractId: "22000000-0000-4000-8000-000000000002", contractKey: "archived-one", title: "Archived", status: "archived", submittedCount: 0, completedCount: 2 }),
      ],
    },
  });
  assert.equal(many.contracts.length, 3);
  assert.equal(many.contracts[1].description.length <= 8_000, true);
  assert.deepEqual(many.statuses, ["active", "archived", "draft"]);
  assert.equal(many.summary.totalCount, 3);
  assert.equal(many.summary.activeCount, 1);
  assert.equal(many.summary.completedCount, 4);
});

test("Contract detail joins player-safe submissions to authoritative progress and exposes review/reward lifecycle only", () => {
  const list = normalizeContractsReadModel({ data: { contracts: [contract()] } });
  const detail = normalizeContractDetail({
    progress: {
      ok: true,
      contract: { contractId: CONTRACT_ID, title: "시장 증거 분석", status: "active" },
      progress: [
        {
          progressId: PROGRESS_ID,
          contractId: CONTRACT_ID,
          playerId: PLAYER_ID,
          status: "submitted",
          evidencePayload: { writtenResponse: "수요가 증가했습니다." },
          resultPayload: {},
          submittedAt: "2026-08-07T02:00:00.000Z",
          completedAt: null,
          rewardIssuedAt: null,
        },
        {
          progressId: "31000000-0000-4000-8000-000000000003",
          contractId: CONTRACT_ID,
          playerId: PLAYER_ID,
          status: "completed",
          evidencePayload: {},
          resultPayload: { feedback: "Approved" },
          submittedAt: "2026-08-07T02:00:00.000Z",
          completedAt: "2026-08-07T03:00:00.000Z",
          rewardIssuedAt: null,
        },
      ],
    },
    submissions: {
      data: {
        submissions: [
          {
            progressId: PROGRESS_ID,
            playerId: PLAYER_ID,
            displayName: "김하늘",
            rosterLabel: "Y10-07",
            country: "NORTHREACH",
            status: "submitted",
            evidence: "수요가 증가했습니다.",
          },
        ],
      },
    },
  }, list.contracts[0]);

  assert.equal(detail.summary.participantCount, 2);
  assert.equal(detail.participants[0].playerName, "김하늘");
  assert.equal(detail.participants[0].canReview, true);
  assert.equal(detail.participants[0].canIssueReward, false);
  assert.equal(detail.participants[1].playerName, "Player");
  assert.equal(detail.participants[1].canReview, false);
  assert.equal(detail.participants[1].canIssueReward, true);
  for (const participant of detail.participants) {
    const visible = { ...participant, resourceId: undefined };
    assert.doesNotMatch(JSON.stringify(visible), /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  }
});

test("Contracts API stays on the cookie-bound Admin BFF and uses existing authoritative endpoints", async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith(`/games/${GAME_ID}/contracts`) && init.method === "GET") {
      return response({ data: { contracts: [contract()] } });
    }
    if (url.endsWith(`/games/${GAME_ID}/contracts/${CONTRACT_ID}/progress`)) {
      return response({ ok: true, contract: { contractId: CONTRACT_ID }, progress: [] });
    }
    if (url.endsWith(`/games/${GAME_ID}/contracts/${CONTRACT_ID}/submissions`)) {
      return response({ data: { submissions: [] } });
    }
    if (url.endsWith(`/games/${GAME_ID}/contracts`) && init.method === "POST") {
      return response({ ok: true, contract: contract({ status: "draft" }) });
    }
    if (url.endsWith(`/games/${GAME_ID}/contracts/${CONTRACT_ID}`) && init.method === "PATCH") {
      return response({ ok: true, contract: contract({ status: "draft", ...(requests.at(-1)?.body || {}) }) });
    }
    if (url.endsWith(`/games/${GAME_ID}/contracts/${CONTRACT_ID}/publish`)) {
      return response({ ok: true, contract: contract({ status: "active" }) });
    }
    if (url.endsWith(`/games/${GAME_ID}/contracts/${CONTRACT_ID}/archive`)) {
      return response({ data: { archived: true, contract: contract({ status: "archived" }) } });
    }
    if (url.endsWith(`/games/${GAME_ID}/contracts/${CONTRACT_ID}/duplicate`)) {
      return response({ data: { duplicated: true, contract: contract({ status: "draft" }) } });
    }
    if (url.endsWith(`/games/${GAME_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`)) {
      return response({ ok: true, contract: { contractId: CONTRACT_ID }, progress: { progressId: PROGRESS_ID, status: "completed" } });
    }
    if (url.endsWith(`/games/${GAME_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`)) {
      return response({ ok: true, rewardIssued: true, alreadyIssued: false, contract: { contractId: CONTRACT_ID }, progress: { progressId: PROGRESS_ID, status: "completed" }, rewardResult: {} });
    }
    return response({ code: "not_found" }, 404);
  };
  const api = createContractsApiClient({ fetchImpl });

  await api.readContracts({ gameId: GAME_ID });
  await api.readContractDetail({ gameId: GAME_ID, contractId: CONTRACT_ID });
  await api.createContract({ gameId: GAME_ID, contract: { title: "Draft", instructions: "Do it." }, idempotencyKey: IDEMPOTENCY });
  await api.updateContract({ gameId: GAME_ID, contractId: CONTRACT_ID, contract: { title: "Edited draft" }, idempotencyKey: `${IDEMPOTENCY}.update` });
  await api.publishContract({ gameId: GAME_ID, contractId: CONTRACT_ID, idempotencyKey: `${IDEMPOTENCY}.publish` });
  await api.archiveContract({ gameId: GAME_ID, contractId: CONTRACT_ID, idempotencyKey: `${IDEMPOTENCY}.archive` });
  await api.duplicateContract({ gameId: GAME_ID, contractId: CONTRACT_ID, idempotencyKey: `${IDEMPOTENCY}.duplicate` });
  await api.reviewProgress({ gameId: GAME_ID, contractId: CONTRACT_ID, progressId: PROGRESS_ID, action: "request_revision", feedback: "Add evidence.", idempotencyKey: `${IDEMPOTENCY}.review` });
  await api.issueRewards({ gameId: GAME_ID, contractId: CONTRACT_ID, progressId: PROGRESS_ID, idempotencyKey: `${IDEMPOTENCY}.rewards` });

  assert.ok(requests.every(({ url }) => url.startsWith("/api/admin/games/")));
  assert.ok(requests.every(({ init }) => init.credentials === "include"));
  assert.ok(requests.every(({ init }) => !("Authorization" in (init.headers || {}))));
  const update = requests.find(({ url, init }) => url.endsWith(`/contracts/${CONTRACT_ID}`) && init.method === "PATCH");
  assert.deepEqual(update.body, { title: "Edited draft" });
  const review = requests.find(({ url }) => url.endsWith(`/progress/${PROGRESS_ID}/review`));
  assert.deepEqual(review.body, { action: "request_revision", resultPayload: { feedback: "Add evidence." } });
  assert.equal(review.body.playerId, undefined);
  assert.equal(review.body.staffId, undefined);
  const writes = requests.filter(({ init }) => ["POST", "PATCH"].includes(init.method));
  assert.ok(writes.every(({ init }) => /^admin\.contracts\./.test(init.headers["Idempotency-Key"])));
});

test("Contracts API normalizes validation and backend failures without exposing raw details", async () => {
  const api = createContractsApiClient({
    fetchImpl: async () => response({
      code: "postgres_query_failed",
      message: "SELECT * FROM private.player_contract_progress using service_role",
      fieldErrors: { title: "private unique constraint", internalUuid: PLAYER_ID },
      requestId: "req-contracts-safe",
    }, 500),
  });
  await assert.rejects(
    api.readContracts({ gameId: GAME_ID }),
    (error) => {
      assert.equal(error.code, "SERVICE_UNAVAILABLE");
      assert.equal(error.userMessage.includes("SELECT"), false);
      assert.equal(JSON.stringify(error).includes("service_role"), false);
      assert.equal(JSON.stringify(error).includes(PLAYER_ID), false);
      return true;
    },
  );

  const invalid = createContractsApiClient({ fetchImpl: async () => response({ ok: true }) });
  await assert.rejects(invalid.readContracts({ gameId: GAME_ID }), (error) => error.code === "INVALID_RESPONSE");
  await assert.rejects(
    invalid.reviewProgress({ gameId: GAME_ID, contractId: CONTRACT_ID, progressId: PROGRESS_ID, action: "invented", idempotencyKey: IDEMPOTENCY }),
    (error) => error.code === "VALIDATION_FAILED",
  );
});

test("Contracts controller denies reads and writes without contracts.manage and preserves six-state loading semantics", async () => {
  let reads = 0;
  const api = {
    readContracts: async () => { reads += 1; return { data: { contracts: [] } }; },
    readContractDetail: async () => ({ progress: { ok: true, contract: {}, progress: [] }, submissions: { data: { submissions: [] } } }),
    createContract: async () => ({ ok: true, contract: {} }),
    updateContract: async () => ({ ok: true, contract: {} }),
    publishContract: async () => ({ ok: true, contract: {} }),
    archiveContract: async () => ({ data: { contract: {} } }),
    duplicateContract: async () => ({ data: { contract: {} } }),
    reviewProgress: async () => ({ ok: true, progress: {} }),
    issueRewards: async () => ({ ok: true, progress: {}, rewardResult: {} }),
    cancelContractsRequest: () => false,
    cancelContractDetailRequest: () => false,
  };
  const denied = createContractsController({ api, selectedGameId: GAME_ID, hasPermission: () => false });
  assert.equal(denied.getState().status, ADMIN_DATA_STATES.INITIAL_LOADING);
  await denied.load();
  assert.equal(reads, 0);
  const mutation = await denied.createContract({ title: "Denied" });
  assert.equal(mutation.ok, false);
  assert.equal(mutation.error.code, "PERMISSION_DENIED");
  denied.destroy();

  const allowed = createContractsController({ api, selectedGameId: GAME_ID, hasPermission: (permission) => permission === "contracts.manage" });
  await allowed.load();
  assert.equal(reads, 1);
  assert.equal(allowed.getState().status, ADMIN_DATA_STATES.EMPTY);
  allowed.destroy();
});
