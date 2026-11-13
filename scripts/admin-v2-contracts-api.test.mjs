import assert from "node:assert/strict";
import test from "node:test";

import { createContractsApiClient } from "../admin/v2/src/api/contracts-api-client.js";
import {
  createContractsController,
  normalizeContractDetail,
  normalizeContractsReadModel,
} from "../admin/v2/src/routes/contracts/ContractsController.js";
import { ContractForm } from "../admin/v2/src/routes/contracts/ContractForm.js";
import { createAccountDocument } from "./admin-account-controls-dom-fixture.mjs";
import { normalizeContractCreate } from "../backend/supabase/functions/admin-api/mutationAdapters.ts";
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


function editForm(t, original, changes = {}, mode = "edit") {
  const saved = Object.fromEntries(["document", "Node", "HTMLElement"].map((key) => [key, globalThis[key]]));
  const { document, Element } = createAccountDocument();
  document.createElementNS = (_namespace, tag) => document.createElement(tag);
  Object.assign(globalThis, { document, Node: Element, HTMLElement: Element });
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  const model = normalizeContractsReadModel({ contracts: [original] }).contracts[0];
  const form = ContractForm({ mode, contract: model });
  // This minimal DOM is not a native input implementation. Seed actual control
  // values explicitly; production validation and payload construction stay real.
  const values = {
    title: model.title, description: model.description, instructions: model.instructions,
    category: model.category, status: model.status, visibility: model.visibility,
    countryCodes: model.targetCountryCodes.join(", "), completionMode: model.completionMode,
    requirementsText: model.requirementsText, rewardAmount: String(model.reward.cashAmount ?? ""),
    difficulty: model.metadata.difficulty, reviewNote: model.metadata.reviewNote,
    scheduledAt: "", deadlineAt: "", expiresAt: "", ...changes,
  };
  for (const [key, value] of Object.entries(values)) form.fields[key].setValue(value);
  return { model, form };
}

async function normalizeFormPayload(form, method = "PATCH") {
  const payload = form.validate();
  assert.ok(payload, "the unchanged fixture must be a valid contract form");
  return normalizeContractCreate(new Request("https://example.test/contracts/synthetic", {
    method, body: JSON.stringify(payload),
  }), "contracts-edit-regression");
}

test("UUID-only and mixed player targeting cannot pass the draft/scheduled edit guard", async () => {
  let writes = 0;
  const controller = createContractsController({
    api: Object.fromEntries([
      "readContracts", "readContractDetail", "createContract", "updateContract", "publishContract",
      "archiveContract", "duplicateContract", "reviewProgress", "issueRewards",
    ].map((method) => [method, async () => { writes += 1; return {}; }])),
    selectedGameId: GAME_ID, hasPermission: () => true,
  });
  for (const status of ["draft", "scheduled"]) {
    for (const targetingPayload of [
      { playerIds: [PLAYER_ID] },
      { playerIds: [PLAYER_ID], countryCodes: ["NORTHREACH"] },
      { rosterLabels: [PLAYER_ID] },
      { storyFlagConditions: [{ key: "lesson", value: true }] },
    ]) {
      const model = normalizeContractsReadModel({ contracts: [contract({ status, targetingPayload })] });
      assert.equal(model.contracts[0].targetingEditable, false);
      assert.equal((await controller.updateContract(model.contracts[0], { title: "Unrelated edit" })).ok, false);
      assert.doesNotMatch(JSON.stringify(displayProjection(model)), new RegExp(PLAYER_ID));
    }
  }
  assert.equal(writes, 0);
  controller.destroy();
});

test("an unrelated contract edit preserves cash destination and unrepresented metadata", async (t) => {
  const original = contract({
    status: "draft", targetingPayload: { countryCodes: ["NORTHREACH"] },
    rewardPayload: { cash: { amount: 75, currencyCode: "NRC", accountType: "savings", source: "lesson" }, items: [{ storeItemId: PLAYER_ID, quantity: 2 }] },
    requirementsPayload: { manualText: "Submit written evidence.", rubric: { minSources: 2 } },
    metadata: { difficulty: "Advanced", reviewNote: "Use the rubric.", materials: [{ title: "Guide" }], submissionRequirements: ["diagram"], custom: { version: 1 } },
  });
  const { form } = editForm(t, original, { title: "Edited title" });
  const payload = await normalizeFormPayload(form);
  // Model the existing SQL's shallow JSONB update. Omitted keys must remain
  // omitted at the API boundary; this is not a live database proof.
  assert.deepEqual({ ...original.rewardPayload, ...payload.rewardPayload }, original.rewardPayload);
  assert.deepEqual({ ...original.metadata, ...payload.metadata }, original.metadata);
  assert.deepEqual({ ...original.requirementsPayload, ...payload.requirementsPayload }, original.requirementsPayload);
  assert.deepEqual(payload.targetingPayload.countryCodes, ["NORTHREACH"]);
});

test("changing cash amount retains savings and original currency", async (t) => {
  const { form } = editForm(t, contract({
    status: "draft", targetingPayload: { countryCodes: ["NORTHREACH"] },
    rewardPayload: { cash: { amount: 75, currencyCode: "NRC", accountType: "savings" } },
  }), { rewardAmount: "90.25" });
  const payload = await normalizeFormPayload(form);
  assert.deepEqual(payload.rewardPayload.cash, { amount: 90.25, currencyCode: "NRC", accountType: "savings" });
});

test("explicit cash removal remains distinct from an unchanged reward", async (t) => {
  const { form } = editForm(t, contract({ status: "draft", targetingPayload: { allPlayers: true }, visibility: "public" }), { rewardAmount: "0" });
  const payload = await normalizeFormPayload(form);
  assert.equal(payload.rewardPayload.cash, null);
});

test("metadata updates distinguish omitted arrays, nested arrays and deliberate clearing", async () => {
  for (const method of ["POST", "PATCH"]) {
    const normalize = (body) => normalizeContractCreate(new Request("https://example.test/contracts", {
      method, body: JSON.stringify({ title: "Test", instructions: "Do it", ...body }),
    }), "metadata-test");
    const nested = { materials: [{ title: "Guide" }], submissionRequirements: ["diagram"], custom: "retained" };
    assert.deepEqual((await normalize({ metadata: nested })).metadata, nested);
    assert.deepEqual((await normalize({ metadata: nested, materials: [], submissionRequirements: [] })).metadata,
      { ...nested, materials: [], submissionRequirements: [] });
    const omitted = (await normalize({ metadata: { reviewNote: "Updated" } })).metadata;
    assert.deepEqual(omitted, method === "PATCH" ? { reviewNote: "Updated" }
      : { reviewNote: "Updated", materials: [], submissionRequirements: [] });
  }
});

test("new Contracts keep ECO/checking cash defaults and creation metadata defaults", async (t) => {
  const { form } = editForm(t, contract({ status: "draft", targetingPayload: { allPlayers: true }, visibility: "public" }), { rewardAmount: "12.34" }, "create");
  const payload = await normalizeFormPayload(form, "POST");
  assert.deepEqual(payload.rewardPayload.cash, { amount: 12.34, accountType: "checking", currencyCode: "ECO" });
  assert.deepEqual(payload.metadata.materials, []);
  assert.deepEqual(payload.metadata.submissionRequirements, []);
});

test("Contracts normalization preserves accepted envelopes, rejects malformed responses and freezes bounded projections", () => {
  const row = contract();
  const expected = normalizeContractsReadModel([row]);
  for (const envelope of [
    { contracts: [row] }, { assignments: [row] }, { value: { contracts: [row] } },
    { data: { assignments: [row] } }, { data: { data: { contracts: [row] } } },
    { payload: { assignments: [row] } },
  ]) assert.deepEqual(normalizeContractsReadModel(envelope), expected);
  for (const malformed of [null, {}, { data: { contracts: {} } }, { contracts: "invalid" }]) {
    assert.throws(() => normalizeContractsReadModel(malformed), (error) => error.code === "INVALID_RESPONSE" && error.retryable);
  }
  assert.throws(() => normalizeContractDetail({ progress: [] }, expected.contracts[0]), (error) => error.code === "INVALID_RESPONSE");
  const bounded = normalizeContractsReadModel([...Array(2_001).fill(row), null]);
  assert.equal(bounded.contracts.length, 2_000);
  assert.deepEqual(normalizeContractsReadModel([null, 7, [], row]).contracts, [expected.contracts[0]]);
  for (const value of [expected, expected.contracts, expected.contracts[0], expected.contracts[0].reward,
    expected.contracts[0].targetCountryCodes, expected.statuses, expected.categories, expected.summary]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { expected.contracts[0].title = "Changed"; }, TypeError);
});

test("Contracts display fields retain UUID stripping, identifier normalization and safe defaults", () => {
  const secret = "ABCDEFAB-ABCD-4ABC-8ABC-ABCDEFABCDEF";
  const row = normalizeContractsReadModel([contract({
    id: ` ${secret} `, contractKey: `key ${secret}`, title: secret,
    description: `Before ${secret} after`, instructions: secret, category: secret,
    sourceType: " SYSTEM ", status: " PAUSED ", visibility: " HIDDEN ", completionMode: " AUTO_CHECK ",
    targetingPayload: { countryCodes: [`kr ${secret}`], rosterLabels: [`Class ${secret}`], playerIds: [secret] },
    requirementsPayload: { manualText: `Task ${secret}` },
    rewardPayload: { cash: { amount: "12.5", currencyCode: `krw ${secret}` }, items: [{ quantity: 2 }, { quantity: -1 }, { quantity: 1.2 }] },
    metadata: { difficulty: secret, reviewNote: secret },
    progressCount: -1, submittedCount: 1.5, completedCount: "2", rewardIssuedCount: Infinity,
    deadlineAt: "not a date",
  })]).contracts[0];
  assert.equal(row.resourceId, secret.toLowerCase());
  assert.equal(row.title, "Untitled contract");
  assert.equal(row.description, "Before after");
  assert.equal(row.category, "general");
  assert.equal(row.status, "paused");
  assert.equal(row.sourceType, "system");
  assert.equal(row.visibility, "hidden");
  assert.equal(row.completionMode, "auto_check");
  assert.equal(row.targetingEditable, false);
  assert.equal(row.reward.label, "12.5 KRW + 2 items");
  assert.deepEqual([row.progressCount, row.submittedCount, row.completedCount, row.rewardIssuedCount], [0, 0, 2, 0]);
  assert.equal(row.deadlineAt, "");
  const { resourceId: _resourceId, ...visible } = row;
  assert.doesNotMatch(JSON.stringify(visible), /abcdefab/i);
  const fallback = normalizeContractsReadModel([{ id: "invalid", status: "other", sourceType: "other", visibility: "other", completionMode: "other" }]).contracts[0];
  assert.equal(fallback.resourceId, null);
  assert.deepEqual([fallback.status, fallback.sourceType, fallback.visibility, fallback.completionMode], ["draft", "teacher", "public", "manual_review"]);
});

test("Contracts detail joins only validated matching IDs and retains authoritative progress precedence", () => {
  const row = normalizeContractsReadModel([contract()]).contracts[0];
  const detail = normalizeContractDetail({
    progress: { progress: [
      { progressId: PROGRESS_ID.toUpperCase(), status: "submitted", playerName: "Do not display", evidencePayload: { writtenResponse: "Progress evidence" }, resultPayload: { feedback: "Authoritative feedback" } },
      { progressId: "invalid", status: "submitted" },
      { progressId: "31000000-0000-4000-8000-000000000003", status: "completed" },
      null,
    ] },
    submissions: { data: { contractSubmissions: [
      { submissionId: PROGRESS_ID, displayName: "First" },
      { id: PROGRESS_ID, displayName: `Safe ${PLAYER_ID}`, status: "completed", evidence: `Evidence ${PLAYER_ID}`, resultPayload: { feedback: "Projection feedback" } },
      { progressId: "invalid", displayName: "Must not join", evidence: "Must not join" },
      { progressId: "32000000-0000-4000-8000-000000000003", displayName: "Unrelated" },
    ] } },
  }, row);
  assert.equal(detail.contract, row);
  assert.equal(detail.participants.length, 3);
  const [joined, invalid, unmatched] = detail.participants;
  assert.equal(joined.playerName, "Safe");
  assert.equal(joined.status, "submitted");
  assert.equal(joined.evidence, "Evidence");
  assert.equal(joined.feedback, "Authoritative feedback");
  assert.equal(invalid.playerName, "Player");
  assert.equal(invalid.resourceId, null);
  assert.equal(invalid.canReview, false);
  assert.equal(unmatched.playerName, "Player");
  assert.equal(unmatched.canIssueReward, true);
  assert.deepEqual(detail.summary, { participantCount: 3, submittedCount: 2, completedCount: 1, rewardIssuedCount: 0 });
  assert.ok(Object.isFrozen(detail) && Object.isFrozen(detail.participants) && detail.participants.every(Object.isFrozen));
});

test("Contracts review and reward eligibility follows status, valid ID and issued state across all states", () => {
  const row = normalizeContractsReadModel([contract()]).contracts[0];
  const issuedAt = "2026-08-07T03:00:00.000Z";
  for (const status of ["available", "in_progress", "submitted", "completed", "failed", "expired", "dismissed", "unknown"]) {
    for (const id of [PROGRESS_ID, "invalid"]) {
      for (const issued of ["", issuedAt]) {
        const detail = normalizeContractDetail({
          progress: { progress: [{ progressId: id, status, rewardIssuedAt: issued }] },
          submissions: { data: { submissions: [{ progressId: id, status: "completed", rewardIssuedAt: issued }] } },
        }, row);
        const item = detail.participants[0];
        assert.equal(item.canReview, id === PROGRESS_ID && status === "submitted" && !issued, `${status}/${id}/${issued}: review`);
        assert.equal(item.canIssueReward, id === PROGRESS_ID && status === "completed" && !issued, `${status}/${id}/${issued}: reward`);
        assert.equal(item.status, status === "unknown" ? "available" : status);
      }
    }
  }
  const projected = normalizeContractDetail({
    progress: { progress: [{ progressId: PROGRESS_ID }] },
    submissions: { data: { submissions: [{ progressId: PROGRESS_ID, status: "completed", rewardIssuedAt: issuedAt }] } },
  }, row).participants[0];
  assert.equal(projected.status, "completed");
  assert.equal(projected.rewardIssuedAt, issuedAt);
  assert.equal(projected.canIssueReward, false);
});

test("Contracts evidence fallback retains answer limits, empty defaults and bounded detail rows", () => {
  const row = normalizeContractsReadModel([contract()]).contracts[0];
  const evidencePayload = { answers: Array.from({ length: 21 }, (_, index) => ({ prompt: `Question ${index} ${PLAYER_ID}`, answer: `Answer ${index}` })) };
  const detail = normalizeContractDetail({ progress: { progress: [
    { id: PROGRESS_ID, evidencePayload }, {},
  ] } }, row);
  assert.equal(detail.participants[0].evidence.split(" · ").length, 20);
  assert.doesNotMatch(detail.participants[0].evidence, /Question 20|40000000/);
  assert.equal(detail.participants[1].evidence, "No submitted evidence");
  assert.equal(normalizeContractDetail({ progress: { progress: [] } }, row).isEmpty, true);
  assert.equal(normalizeContractDetail({ progress: { progress: Array(2_001).fill({}) } }, row).participants.length, 2_000);
});

test("Contracts extracted read model retains controller exports without a controller dependency", async () => {
  const model = await import("../admin/v2/src/routes/contracts/ContractsReadModel.js");
  assert.equal(model.normalizeContractsReadModel, normalizeContractsReadModel);
  assert.equal(model.normalizeContractDetail, normalizeContractDetail);
  assert.equal(model.formatContractText(`Created ${PLAYER_ID}`, 280), "Created");
  assert.equal(model.isContractResourceId(PROGRESS_ID), true);
  assert.equal(model.isContractResourceId("invalid"), false);
  for (const status of ["draft", "scheduled", "active", "paused", "completed", "expired", "archived"]) assert.equal(model.isContractStatus(status), true);
  assert.equal(model.isContractStatus("other"), false);
});

test("Contracts controller preserves scoped mutations, retry identity and duplicate suppression after extraction", async () => {
  const calls = [];
  let resolveFirst;
  const methods = ["createContract", "updateContract", "publishContract", "archiveContract", "duplicateContract", "reviewProgress", "issueRewards"];
  const api = Object.fromEntries(methods.map((method) => [method, async (args) => {
    calls.push({ method, args });
    return { ok: true };
  }]));
  Object.assign(api, {
    readContracts: async () => ({ contracts: [] }),
    readContractDetail: async () => ({ progress: { progress: [] } }),
  });
  api.createContract = (args) => {
    calls.push({ method: "createContract", args });
    if (calls.length === 1) return new Promise((resolve) => { resolveFirst = resolve; });
    if (calls.length === 2) return Promise.reject({ code: "SERVICE_UNAVAILABLE", retryable: true });
    return Promise.resolve({ ok: true });
  };
  const notifications = [];
  const controller = createContractsController({
    api, selectedGameId: GAME_ID, hasPermission: () => true,
    cryptoObject: { randomUUID: () => "50000000-0000-4000-8000-000000000005" },
    notify: (notification) => notifications.push(notification),
  });
  try {
    const input = { title: `Draft ${PLAYER_ID}` };
    const pending = controller.createContract(input);
    assert.equal((await controller.createContract(input)).busy, true);
    assert.equal(calls.length, 1);
    resolveFirst({ ok: true });
    assert.equal((await pending).ok, true);
    assert.equal(notifications[0].message, "Draft was created.");
    assert.equal((await controller.createContract(input)).ok, false);
    const retryKey = calls.at(-1).args.idempotencyKey;
    assert.equal((await controller.createContract(input)).ok, true);
    assert.equal(calls.at(-1).args.idempotencyKey, retryKey);
    assert.notEqual(retryKey, calls[0].args.idempotencyKey);
    const row = normalizeContractsReadModel([contract({ status: "draft", targetingPayload: { allPlayers: true } })]).contracts[0];
    const participant = { resourceId: PROGRESS_ID, playerName: "Player" };
    for (const method of ["updateContract", "publishContract", "archiveContract", "duplicateContract"]) {
      assert.equal((await controller[method](row, input)).ok, true);
      assert.equal(calls.at(-1).args.contractId, CONTRACT_ID);
    }
    assert.equal((await controller.reviewProgress(row, participant, "approve", "Good evidence")).ok, true);
    assert.equal((await controller.issueRewards(row, participant)).ok, true);
    assert.equal(calls.at(-2).args.progressId, PROGRESS_ID);
    assert.equal(calls.at(-1).args.progressId, PROGRESS_ID);
    assert.equal(calls.at(-2).args.feedback, "Good evidence");
    assert.ok(calls.every(({ args }) => args.gameId === GAME_ID && args.idempotencyKey.startsWith("admin.contracts.")));
    const writes = calls.length;
    assert.equal((await controller.updateContract({ ...row, status: "active" }, input)).error.code, "CONFLICT");
    assert.equal((await controller.publishContract({})).error.code, "NOT_FOUND");
    assert.equal(calls.length, writes);
  } finally { controller.destroy(); }
});
