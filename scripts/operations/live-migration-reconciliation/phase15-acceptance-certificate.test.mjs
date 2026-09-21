import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PHASE15_ACCEPTANCE_LIMITS,
  PHASE15_REQUIRED_ACCEPTANCE_CLAIMS,
  validatePhase15AcceptanceCertificate,
} from "./phase15-acceptance-certificate.mjs";

const contractUrl = new URL(
  "../../../docs/operations/contracts/phase15-acceptance-evidence-v1.json",
  import.meta.url,
);
const helperPath = fileURLToPath(new URL("./phase15-acceptance-certificate.mjs", import.meta.url));

async function readContract() {
  return JSON.parse(await readFile(contractUrl, "utf8"));
}

function clone(value) {
  return structuredClone(value);
}

function expectInvalid(contract, pattern) {
  assert.throws(
    () => validatePhase15AcceptanceCertificate(contract),
    (error) => {
      assert.match(error.message, /^PHASE15_ACCEPTANCE_CERTIFICATE_INVALID:/u);
      assert.match(error.message, pattern);
      return true;
    },
  );
}

function attachExactCandidateFinalRuns(contract) {
  const economics = clone(
    contract.evidence.find((record) => record.id === "pr-718-two-game-economic-baseline").acceptance.economics,
  );
  const load = clone(
    contract.evidence.find((record) => record.id === "pr-719-load-baseline").acceptance.load,
  );
  const loadRunId = 999_000_000_001;
  const economicRunId = 999_000_000_004;
  Object.assign(load, {
    schemaVersion: 1,
    sourceCommit: contract.candidate.head,
    sourceTree: contract.candidate.tree,
    workflow: {
      runId: loadRunId,
      runAttempt: 1,
      job: "connected-player-runtime",
      name: "Player Multiplayer and Load E2E",
      path: ".github/workflows/player-multiplayer-load-e2e.yml",
      event: "push",
    },
    thresholds: { loginP95Ms: 15_000, readP95Ms: 8_000 },
    retryEvents: 0,
    serverErrors: 0,
    browserServerErrors: 0,
    browserEvidenceFiles: 9,
  });
  Object.assign(economics, {
    schemaVersion: 1,
    sourceCommit: contract.candidate.head,
    sourceTree: contract.candidate.tree,
    workflow: {
      runId: economicRunId,
      runAttempt: 1,
      job: "phase15-economic-acceptance",
      name: "Business Player Store Cutover V2",
      path: ".github/workflows/business-player-store-cutover-v2.yml",
      event: "push",
    },
    sourceJobs: {
      cutoverAuthority: "success",
      backendRuntime: "success",
      databaseSettlement: "success",
      databaseReplay: "success",
      playerTerminal: "success",
      connectedStore: "success",
    },
    connectedAuthenticatedJourneys: true,
  });
  contract.evidence.push({
    id: "new-exact-candidate-load-acceptance",
    role: "candidate-evidence",
    finalAcceptanceRun: true,
    claims: [
      "authenticated-browser",
      "browser-server-cleanliness",
      "load-30",
      "load-40",
    ],
    envelope: {
      source: {
        head: contract.candidate.head,
        tree: contract.candidate.tree,
        branch: contract.candidate.branch,
      },
      run: {
        id: loadRunId,
        name: "Player Multiplayer and Load E2E",
        path: ".github/workflows/player-multiplayer-load-e2e.yml",
        event: "push",
        status: "completed",
        conclusion: "success",
        attempt: 1,
        head: contract.candidate.head,
        tree: contract.candidate.tree,
      },
      jobs: [
        {
          id: 999_000_000_002,
          runId: loadRunId,
          name: "Two-browser Player journey, secure mutations, and 30-40 Player load",
          status: "completed",
          conclusion: "success",
        },
      ],
      artifacts: [
        {
          id: 999_000_000_003,
          runId: loadRunId,
          name: `player-multiplayer-load-${contract.candidate.head}`,
          digest: `sha256:${"a".repeat(64)}`,
          head: contract.candidate.head,
          tree: contract.candidate.tree,
          expired: false,
          evidenceFiles: [
            {
              path: "econovaria-player-load/phase15-load-summary.json",
              sha256: "b".repeat(64),
            },
          ],
        },
      ],
    },
    evidenceBindings: [
      {
        artifactId: 999_000_000_003,
        path: "econovaria-player-load/phase15-load-summary.json",
        sha256: "b".repeat(64),
      },
    ],
    candidateBinding: { mode: "exact-source" },
    acceptance: { load },
  });
  contract.evidence.push({
    id: "new-exact-candidate-economic-acceptance",
    role: "candidate-evidence",
    finalAcceptanceRun: true,
    claims: [
      "authenticated-browser",
      "browser-server-cleanliness",
      "economic-concurrency",
      "economic-conservation",
      "ordering-race",
      "two-game-isolation",
    ],
    envelope: {
      source: {
        head: contract.candidate.head,
        tree: contract.candidate.tree,
        branch: contract.candidate.branch,
      },
      run: {
        id: economicRunId,
        name: "Business Player Store Cutover V2",
        path: ".github/workflows/business-player-store-cutover-v2.yml",
        event: "push",
        status: "completed",
        conclusion: "success",
        attempt: 1,
        head: contract.candidate.head,
        tree: contract.candidate.tree,
      },
      jobs: [
        {
          id: 999_000_000_007,
          runId: economicRunId,
          name: "Verify serial settlement, ordering races, and two-game isolation",
          status: "completed",
          conclusion: "success",
        },
        {
          id: 999_000_000_008,
          runId: economicRunId,
          name: "Verify connected Buyer and seller Store journey in two games",
          status: "completed",
          conclusion: "success",
        },
        {
          id: 999_000_000_005,
          runId: economicRunId,
          name: "Certify exact-source economic isolation and conservation",
          status: "completed",
          conclusion: "success",
        },
      ],
      artifacts: [
        {
          id: 999_000_000_006,
          runId: economicRunId,
          name: `phase15-economic-acceptance-${contract.candidate.head}`,
          digest: `sha256:${"c".repeat(64)}`,
          head: contract.candidate.head,
          tree: contract.candidate.tree,
          expired: false,
          evidenceFiles: [
            {
              path: "econovaria-phase10a4-player-store-evidence/phase15-economic-summary.json",
              sha256: "d".repeat(64),
            },
          ],
        },
      ],
    },
    evidenceBindings: [
      {
        artifactId: 999_000_000_006,
        path: "econovaria-phase10a4-player-store-evidence/phase15-economic-summary.json",
        sha256: "d".repeat(64),
      },
    ],
    candidateBinding: { mode: "exact-source" },
    acceptance: { economics },
  });
  contract.candidate.finalAcceptanceRunIds = [loadRunId, economicRunId];
  contract.status = "PASS";
  contract.pendingReason = null;
  return [loadRunId, economicRunId];
}

test("the checked-in certificate is valid but remains pending for exact-candidate evidence", async () => {
  const contract = await readContract();
  const result = validatePhase15AcceptanceCertificate(contract, {
    expectedHead: "5b11f344bc0e725cf7028c3f7c4a2a890e9972e3",
    expectedTree: "e06c33db2a4db2e7fc437f7c92b1af152926b83a",
  });

  assert.equal(result.status, "PENDING");
  assert.deepEqual(result.finalAcceptanceRunIds, []);
  assert.deepEqual(result.candidateClaims, [
    "authenticated-browser",
    "browser-server-cleanliness",
    "golden-five-lifecycle",
  ]);
  assert.deepEqual(result.missingClaims, [
    "economic-concurrency",
    "economic-conservation",
    "load-30",
    "load-40",
    "ordering-race",
    "two-game-isolation",
  ]);
  assert.deepEqual(result.priorBaselineClaims, [
    "authenticated-browser",
    "browser-server-cleanliness",
    "economic-concurrency",
    "economic-conservation",
    "load-30",
    "load-40",
    "ordering-race",
    "two-game-isolation",
  ]);
});

test("an exact-source final run can complete the certificate only when every claim is attached", async () => {
  const contract = await readContract();
  const runIds = attachExactCandidateFinalRuns(contract);
  const result = validatePhase15AcceptanceCertificate(contract, { requirePass: true });

  assert.equal(result.status, "PASS");
  assert.deepEqual(result.finalAcceptanceRunIds, runIds);
  assert.deepEqual(result.candidateClaims, PHASE15_REQUIRED_ACCEPTANCE_CLAIMS);
  assert.deepEqual(result.missingClaims, []);
});

test("a declared PASS cannot substitute historical baselines for new candidate evidence", async () => {
  const contract = await readContract();
  contract.status = "PASS";
  contract.pendingReason = null;
  expectInvalid(contract, /status derived from attached evidence must be "PENDING"/u);
});

test("the immutable 30/40 load policy rejects threshold drift", async () => {
  const mutations = [
    ["baselineConcurrentPlayers", 29],
    ["maximumConcurrentPlayers", 41],
    ["baselineReadCount", 209],
    ["burstReadCount", 279],
    ["maximumLoginP95Ms", 15_001],
    ["maximumReadP95Ms", 8_001],
    ["maximumErrors", 1],
  ];
  for (const [field, value] of mutations) {
    const contract = await readContract();
    contract.policy.thresholds[field] = value;
    expectInvalid(contract, new RegExp(`policy\\.thresholds\\.${field}`, "u"));
  }
  assert.deepEqual(PHASE15_ACCEPTANCE_LIMITS, {
    goldenFivePlayers: 5,
    baselineConcurrentPlayers: 30,
    maximumConcurrentPlayers: 40,
    readPathsPerPlayer: 7,
    baselineReadCount: 210,
    burstReadCount: 280,
    maximumLoginP95Ms: 15_000,
    maximumReadP95Ms: 8_000,
    maximumErrors: 0,
  });
});

test("load evidence enforces exact counts, zero errors, and both p95 ceilings", async () => {
  const cases = [
    ["baseline30.concurrentPlayers", 29, /baseline30\.concurrentPlayers/u],
    ["baseline30.readCount", 209, /baseline30\.readCount/u],
    ["burst40.concurrentPlayers", 39, /burst40\.concurrentPlayers/u],
    ["burst40.loginCount", 40, /burst40\.loginCount/u],
    ["burst40.readCount", 279, /burst40\.readCount/u],
    ["baseline30.loginErrors", 1, /baseline30\.loginErrors/u],
    ["burst40.serverErrors", 1, /burst40\.serverErrors/u],
    ["baseline30.loginP95Ms", 15_000.01, /loginP95Ms exceeds 15000/u],
    ["burst40.readP95Ms", 8_000.01, /readP95Ms exceeds 8000/u],
  ];
  for (const [propertyPath, value, pattern] of cases) {
    const contract = await readContract();
    const load = contract.evidence.find((record) => record.id === "pr-719-load-baseline").acceptance.load;
    const [group, property] = propertyPath.split(".");
    load[group][property] = value;
    expectInvalid(contract, pattern);
  }
});

test("economic evidence enforces two-game isolation, conservation, concurrency, and races", async () => {
  for (const field of [
    "playerIsolation",
    "gameIsolationBidirectional",
    "concurrencyPassed",
    "economicConservation",
    "sourceDebitsExact",
    "recipientCreditExact",
    "inventoryTransferExact",
    "replayZeroDelta",
    "orderingRacePassed",
    "withdrawalFirstRejectedBeforePayment",
    "purchaseFirstExcessWithdrawalRejected",
    "purchaseFirstRemainingWithdrawalAccepted",
  ]) {
    const contract = await readContract();
    const economics = contract.evidence.find(
      (record) => record.id === "pr-718-two-game-economic-baseline",
    ).acceptance.economics;
    economics[field] = false;
    expectInvalid(contract, new RegExp(`acceptance\\.economics\\.${field}`, "u"));
  }
});

test("run, job, artifact, digest, head, and tree bindings fail closed", async () => {
  const mutations = [
    [(record) => { record.envelope.run.head = "f".repeat(40); }, /envelope\.run\.head/u],
    [(record) => { record.envelope.run.tree = "f".repeat(40); }, /envelope\.run\.tree/u],
    [(record) => { record.envelope.jobs[0].runId += 1; }, /envelope\.jobs\[0\]\.runId/u],
    [(record) => { record.envelope.artifacts[0].runId += 1; }, /envelope\.artifacts\[0\]\.runId/u],
    [(record) => { record.envelope.artifacts[0].digest = `sha256:${"A".repeat(64)}`; }, /\.digest/u],
    [(record) => { record.envelope.artifacts[0].head = "f".repeat(40); }, /envelope\.artifacts\[0\]\.head/u],
    [(record) => { record.envelope.artifacts[0].tree = "f".repeat(40); }, /envelope\.artifacts\[0\]\.tree/u],
    [(record) => { record.envelope.artifacts[0].evidenceFiles[0].sha256 = "0".repeat(63); }, /\.sha256/u],
  ];
  for (const [mutate, pattern] of mutations) {
    const contract = await readContract();
    mutate(contract.evidence[0]);
    expectInvalid(contract, pattern);
  }
});

test("equivalence requires an exact diff allowlist and rejects relevant source changes", async () => {
  const mismatched = await readContract();
  const mismatchedBinding = mismatched.evidence.find(
    (record) => record.id === "pr-719-load-baseline",
  ).candidateBinding;
  mismatchedBinding.observedDiff.pop();
  expectInvalid(mismatched, /observed diff/u);

  const relevant = await readContract();
  const relevantBinding = relevant.evidence.find(
    (record) => record.id === "pr-719-load-baseline",
  ).candidateBinding;
  const relevantPath = "backend/supabase/functions/player-api/runtime.ts";
  relevantBinding.diffAllowlist.push(relevantPath);
  relevantBinding.observedDiff.push(relevantPath);
  relevantBinding.diffAllowlist.sort((left, right) => left.localeCompare(right));
  relevantBinding.observedDiff.sort((left, right) => left.localeCompare(right));
  relevantBinding.relevantSurfaceChangedPaths.push(relevantPath);
  expectInvalid(relevant, /relevantSurfaceChangedPaths must be empty/u);
});

test("the CLI reports pending successfully and --require-pass fails closed", () => {
  const pending = spawnSync(process.execPath, [helperPath, "--contract", fileURLToPath(contractUrl)], {
    encoding: "utf8",
  });
  assert.equal(pending.status, 0, pending.stderr);
  assert.equal(JSON.parse(pending.stdout).status, "PENDING");

  const required = spawnSync(
    process.execPath,
    [helperPath, "--contract", fileURLToPath(contractUrl), "--require-pass"],
    { encoding: "utf8" },
  );
  assert.notEqual(required.status, 0);
  assert.match(required.stderr, /certificate status required by --require-pass must be "PASS"/u);
});
