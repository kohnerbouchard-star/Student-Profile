import type {
  FxFixingEngineInput,
  FxFixingEngineResult,
} from "../contracts/fxFixingContracts.ts";
import { fxPolicyV1Input } from "../tests/fxFixingTestFixtures.ts";
import {
  type FxFixingApplyResult,
  type FxFixingClaim,
  type FxFixingLoadedInput,
  type FxFixingRunnerRepository,
  runFxFixingRunner,
} from "./fxFixingRunner.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_A = "00000000-0000-4000-8000-000000000001";
const GAME_B = "00000000-0000-4000-8000-000000000002";
const LEASE_A = "10000000-0000-4000-8000-000000000001";
const LEASE_B = "10000000-0000-4000-8000-000000000002";
const CLAIMED_AT = "2026-08-26T00:00:05.000Z";
const CALCULATED_AT = "2026-08-26T00:00:06.000Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

Deno.test("FX fixing runner claims once, orders scopes, and persists DB-authoritative hashes", async () => {
  const repository = new FakeRepository(
    [
      claim(GAME_B, LEASE_B, "2026-08-26T00:00:00.000Z"),
      claim(GAME_A, LEASE_A, "2026-08-26T00:00:00.000Z"),
    ],
    new Map([
      [GAME_A, loaded(GAME_A, HASH_A)],
      [GAME_B, loaded(GAME_B, HASH_B)],
    ]),
  );
  repository.outcomes.set(GAME_A, "applied");
  repository.outcomes.set(GAME_B, "replayed");

  const result = await runFxFixingRunner({
    repository,
    calculate: calculateStub,
    claimedAt: CLAIMED_AT,
    runId: "fx-run:20260826000005000:00000000-0000-4000-8000-000000000099",
  }, { now: () => new Date(CALCULATED_AT) });

  assertEquals(repository.claimCalls, [{
    claimedAt: CLAIMED_AT,
    limit: 25,
    leaseOwner: "fx-run:20260826000005000:00000000-0000-4000-8000-000000000099",
    leaseSeconds: 300,
  }]);
  assertEquals(repository.loadCalls, [GAME_A, GAME_B]);
  assertEquals(
    repository.applyCalls.map((call) => ({
      gameSessionId: call.claim.gameSessionId,
      inputHash: call.inputHash,
      calculatedAt: call.calculatedAt,
    })),
    [
      { gameSessionId: GAME_A, inputHash: HASH_A, calculatedAt: CALCULATED_AT },
      { gameSessionId: GAME_B, inputHash: HASH_B, calculatedAt: CALCULATED_AT },
    ],
  );
  assertEquals(result, {
    dueCount: 2,
    appliedCount: 1,
    replayedCount: 1,
    failedCount: 0,
    failureRecordFailedCount: 0,
    failureCodes: [],
  });
});

Deno.test("FX fixing runner isolates one game failure and releases that claim once", async () => {
  const repository = new FakeRepository(
    [
      claim(GAME_A, LEASE_A, "2026-08-26T00:00:00.000Z"),
      claim(GAME_B, LEASE_B, "2026-08-26T00:00:00.000Z"),
    ],
    new Map([
      [GAME_A, loaded(GAME_A, HASH_A)],
      [GAME_B, loaded(GAME_B, HASH_B)],
    ]),
  );

  const result = await runFxFixingRunner({
    repository,
    calculate: (input) => {
      if (input.gameSessionId === GAME_A) {
        throw { code: "fx_test_engine_failure" };
      }
      return calculateStub(input);
    },
    claimedAt: CLAIMED_AT,
    runId: "fx-run:20260826000005000:00000000-0000-4000-8000-000000000099",
  }, { now: () => new Date(CALCULATED_AT) });

  assertEquals(repository.applyCalls.length, 1);
  assertEquals(repository.applyCalls[0].claim.gameSessionId, GAME_B);
  assertEquals(repository.failureCalls, [{
    gameSessionId: GAME_A,
    errorCode: "fx_test_engine_failure",
    failedAt: CALCULATED_AT,
  }]);
  assertEquals(result, {
    dueCount: 2,
    appliedCount: 1,
    replayedCount: 0,
    failedCount: 1,
    failureRecordFailedCount: 0,
    failureCodes: ["fx_test_engine_failure"],
  });
  assertFalse(JSON.stringify(result).includes(GAME_A));
});

Deno.test("FX fixing runner records load scope and digest failures without applying", async () => {
  const repository = new FakeRepository(
    [
      claim(GAME_A, LEASE_A, "2026-08-26T00:00:00.000Z"),
      claim(GAME_B, LEASE_B, "2026-08-26T00:00:00.000Z"),
    ],
    new Map([
      [GAME_A, loaded(GAME_B, HASH_A)],
      [GAME_B, loaded(GAME_B, "not-a-hash")],
    ]),
  );

  const result = await runFxFixingRunner({
    repository,
    calculate: calculateStub,
    claimedAt: CLAIMED_AT,
    runId: "fx-run:20260826000005000:00000000-0000-4000-8000-000000000099",
  }, { now: () => new Date(CALCULATED_AT) });

  assertEquals(repository.applyCalls, []);
  assertEquals(repository.failureCalls.map((call) => call.errorCode), [
    "fx_fixing_input_scope_mismatch",
    "fx_fixing_input_hash_invalid",
  ]);
  assertEquals(result.failedCount, 2);
});

Deno.test("FX fixing runner reports failure-record outages without masking original error", async () => {
  const repository = new FakeRepository([
    claim(GAME_A, LEASE_A, "2026-08-26T00:00:00.000Z"),
  ], new Map([[GAME_A, loaded(GAME_A, HASH_A)]]));
  repository.failFailureRecords = true;

  const result = await runFxFixingRunner({
    repository,
    calculate: () => {
      throw new Error("calculation unavailable");
    },
    claimedAt: CLAIMED_AT,
    runId: "fx-run:20260826000005000:00000000-0000-4000-8000-000000000099",
  }, { now: () => new Date(CALCULATED_AT) });

  assertEquals(result.failureCodes, ["fx_fixing_engine_failed"]);
  assertEquals(result.failureRecordFailedCount, 1);
});

Deno.test("FX fixing runner rejects duplicate game/date claims before mutation", async () => {
  const duplicate = claim(GAME_A, LEASE_B, "2026-08-26T00:00:00.000Z");
  const repository = new FakeRepository([
    claim(GAME_A, LEASE_A, "2026-08-26T00:00:00.000Z"),
    duplicate,
  ], new Map([[GAME_A, loaded(GAME_A, HASH_A)]]));

  await assertRejectsCode(
    () =>
      runFxFixingRunner({
        repository,
        calculate: calculateStub,
        claimedAt: CLAIMED_AT,
        runId: "fx-run:20260826000005000:00000000-0000-4000-8000-000000000099",
      }),
    "duplicate_fx_fixing_claim",
  );
  assertEquals(repository.loadCalls, []);
  assertEquals(repository.applyCalls, []);
});

Deno.test("FX fixing runner rejects calculation evidence that does not bind the loaded input", async () => {
  const repository = new FakeRepository([
    claim(GAME_A, LEASE_A, "2026-08-26T00:00:00.000Z"),
  ], new Map([[GAME_A, loaded(GAME_A, HASH_A)]]));

  const result = await runFxFixingRunner({
    repository,
    calculate: (input) => ({
      ...calculateStub(input),
      policyVersion: "unexpected-policy",
    }),
    claimedAt: CLAIMED_AT,
    runId: "fx-run:20260826000005000:00000000-0000-4000-8000-000000000099",
  }, { now: () => new Date(CALCULATED_AT) });

  assertEquals(repository.applyCalls, []);
  assertEquals(repository.failureCalls.map((call) => call.errorCode), [
    "fx_fixing_result_evidence_mismatch",
  ]);
  assertEquals(result.failedCount, 1);
});

class FakeRepository implements FxFixingRunnerRepository {
  readonly claimCalls: unknown[] = [];
  readonly loadCalls: string[] = [];
  readonly applyCalls: {
    readonly claim: FxFixingClaim;
    readonly fixing: FxFixingEngineResult;
    readonly inputHash: string;
    readonly calculatedAt: string;
  }[] = [];
  readonly failureCalls: {
    readonly gameSessionId: string;
    readonly errorCode: string;
    readonly failedAt: string;
  }[] = [];
  readonly outcomes = new Map<string, FxFixingApplyResult["outcome"]>();
  failFailureRecords = false;

  constructor(
    private readonly claims: readonly FxFixingClaim[],
    private readonly inputs: ReadonlyMap<string, FxFixingLoadedInput>,
  ) {}

  async claimDueFixings(input: unknown): Promise<readonly FxFixingClaim[]> {
    this.claimCalls.push(input);
    return this.claims;
  }

  async loadFixingInput(claim: FxFixingClaim): Promise<FxFixingLoadedInput> {
    this.loadCalls.push(claim.gameSessionId);
    const value = this.inputs.get(claim.gameSessionId);
    if (!value) throw new Error("missing test input");
    return value;
  }

  async applyFixing(input: {
    readonly claim: FxFixingClaim;
    readonly fixing: FxFixingEngineResult;
    readonly inputHash: string;
    readonly calculatedAt: string;
  }): Promise<FxFixingApplyResult> {
    this.applyCalls.push(input);
    return {
      outcome: this.outcomes.get(input.claim.gameSessionId) ?? "applied",
      fixingPublicId: `fxf_${input.claim.gameSessionId.slice(-12)}`,
      currencyValuesInserted: 11,
      shocksConsumed: 0,
    };
  }

  async failFixingClaim(input: {
    readonly claim: FxFixingClaim;
    readonly errorCode: string;
    readonly failedAt: string;
  }): Promise<void> {
    this.failureCalls.push({
      gameSessionId: input.claim.gameSessionId,
      errorCode: input.errorCode,
      failedAt: input.failedAt,
    });
    if (this.failFailureRecords) {
      throw new Error("failure recorder unavailable");
    }
  }
}

function claim(
  gameSessionId: string,
  leaseToken: string,
  fixingEffectiveAt: string,
): FxFixingClaim {
  return {
    gameSessionId,
    fixingLocalDate: "2026-08-26",
    fixingEffectiveAt,
    gameTimezone: "Asia/Seoul",
    leaseToken,
  };
}

function loaded(gameSessionId: string, inputHash: string): FxFixingLoadedInput {
  return {
    engineInput: {
      gameSessionId,
      fixingLocalDate: "2026-08-26",
      policyVersion: "fx-policy-v1",
      policy: fxPolicyV1Input(),
      currencies: [],
      storyShocks: [],
    },
    inputHash,
  };
}

function calculateStub(input: FxFixingEngineInput): FxFixingEngineResult {
  return {
    gameSessionId: input.gameSessionId,
    fixingLocalDate: input.fixingLocalDate,
    policyVersion: input.policyVersion,
    canonicalInputJson: JSON.stringify(input),
    values: [ecoValue()],
  };
}

function ecoValue(): FxFixingEngineResult["values"][number] {
  return {
    currencyCode: "ECO",
    countryCode: null,
    snapshotId: null,
    snapshotSequence: null,
    previousUnitsPerEco: "1.000000000000000000",
    unitsPerEco: "1.000000000000000000",
    components: {
      gdpBasisPoints: 0,
      inflationBasisPoints: 0,
      realInterestBasisPoints: 0,
      tradeBasisPoints: 0,
      confidenceStabilityBasisPoints: 0,
      fundamentalBasisPoints: 0,
      storyBasisPoints: 0,
      finalBasisPoints: 0,
    },
    appliedStoryShockIds: [],
  };
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assertEquals((error as { readonly code?: string }).code, expectedCode);
    return;
  }
  throw new Error(`Expected rejection ${expectedCode}.`);
}

function assertFalse(value: boolean): void {
  if (value) throw new Error("Expected value to be false.");
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
