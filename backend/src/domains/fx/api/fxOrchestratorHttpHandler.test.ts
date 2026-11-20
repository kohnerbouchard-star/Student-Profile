import type {
  FxFixingEngineInput,
  FxFixingEngineResult,
} from "../contracts/fxFixingContracts.ts";
import { fxPolicyV1Input } from "../tests/fxFixingTestFixtures.ts";
import type {
  FxFixingOrchestratorRepository,
} from "../infrastructure/supabaseFxFixingRepository.ts";
import type {
  FxFixingApplyResult,
  FxFixingClaim,
  FxFixingLoadedInput,
} from "../services/fxFixingRunner.ts";
import { FxFixingRunnerError } from "../services/fxFixingRunner.ts";
import {
  FX_SCHEDULER_HEADER,
  FX_SCHEDULER_NAME,
  handleFxOrchestratorRequest,
} from "./fxOrchestratorHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const LEASE_TOKEN = "10000000-0000-4000-8000-000000000001";
const RUN_UUID = "90000000-0000-4000-8000-000000000001";
const VALID_TOKEN = "a".repeat(64);
const TOKEN_HASH = "b".repeat(64);
const NOW = "2026-08-26T00:00:05.000Z";

Deno.test("FX orchestrator exposes POST only and no browser CORS path", async () => {
  let repositoryCreated = false;
  const response = await handleFxOrchestratorRequest(
    new Request("https://scheduler.internal/fx-orchestrator", {
      method: "OPTIONS",
    }),
    dependencies(new FakeRepository(), {
      onCreateRepository: () => repositoryCreated = true,
    }),
  );

  assertEquals(response.status, 405);
  assertEquals(response.headers.get("allow"), "POST");
  assertEquals(response.headers.get("access-control-allow-origin"), null);
  assertEquals(repositoryCreated, false);
});

Deno.test("FX orchestrator rejects malformed scheduler tokens before runtime access", async () => {
  let repositoryCreated = false;
  for (const token of [undefined, "short", "g".repeat(64)]) {
    const headers = new Headers();
    if (token) headers.set(FX_SCHEDULER_HEADER, token);
    const response = await handleFxOrchestratorRequest(
      new Request("https://scheduler.internal/fx-orchestrator", {
        method: "POST",
        headers,
      }),
      dependencies(new FakeRepository(), {
        onCreateRepository: () => repositoryCreated = true,
      }),
    );
    const body = await readJson(response);
    assertEquals(response.status, 401);
    assertEquals(body.error.code, "invalid_scheduler_token");
  }
  assertEquals(repositoryCreated, false);
});

Deno.test("FX orchestrator verifies the fixed scheduler name and hashed token", async () => {
  const repository = new FakeRepository();
  repository.authorized = false;
  const response = await handleFxOrchestratorRequest(
    request(),
    dependencies(repository),
  );

  assertEquals(response.status, 401);
  assertEquals(repository.verifyCalls, [{
    schedulerName: FX_SCHEDULER_NAME,
    tokenSha256: TOKEN_HASH,
  }]);
  assertEquals(repository.claimCalls, []);
});

Deno.test("FX orchestrator rejects caller-selected game scope after authentication", async () => {
  const repository = new FakeRepository();
  const response = await handleFxOrchestratorRequest(
    request({ gameSessionId: GAME_ID }),
    dependencies(repository),
  );
  const body = await readJson(response);

  assertEquals(response.status, 400);
  assertEquals(body.error.code, "invalid_fx_orchestrator_request");
  assertEquals(repository.verifyCalls.length, 1);
  assertEquals(repository.claimCalls, []);
});

Deno.test("FX orchestrator runs fixed-scope due claims and returns aggregates without UUIDs", async () => {
  const repository = new FakeRepository();
  repository.claims = [claim()];
  const response = await handleFxOrchestratorRequest(
    request({}),
    dependencies(repository),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
    dueCount: 1,
    appliedCount: 1,
    replayedCount: 0,
    failedCount: 0,
    failureRecordFailedCount: 0,
    failureCodes: [],
  });
  assertEquals(repository.claimCalls, [{
    claimedAt: NOW,
    limit: 25,
    leaseOwner: `fx-run:20260826000005000:${RUN_UUID}`,
    leaseSeconds: 300,
  }]);
  assertEquals(response.headers.get("access-control-allow-origin"), null);
  assertFalse(JSON.stringify(body).includes(GAME_ID));
  assertFalse(JSON.stringify(body).includes(LEASE_TOKEN));
});

Deno.test("FX orchestrator returns retryable aggregate failure without leaking claimed scope", async () => {
  const repository = new FakeRepository();
  repository.claims = [claim()];
  const response = await handleFxOrchestratorRequest(
    request(),
    dependencies(repository, {
      calculate: () => {
        throw { code: "fx_test_calculation_failed" };
      },
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 500);
  assertEquals(body.error, {
    code: "fx_fixing_batch_incomplete",
    message: "One or more due FX fixings did not complete.",
    retryable: true,
  });
  assertEquals(body.summary.failedCount, 1);
  assertEquals(body.summary.failureCodes, ["fx_test_calculation_failed"]);
  assertFalse(JSON.stringify(body).includes(GAME_ID));
  assertEquals(repository.failureCalls.length, 1);
});

Deno.test("FX orchestrator reports scheduler verifier outages separately from bad tokens", async () => {
  const repository = new FakeRepository();
  repository.verifierFailure = new FxFixingRunnerError(
    "fx_scheduler_authorization_failed",
    "Canonical FX fixing persistence failed.",
    500,
    true,
  );
  const response = await handleFxOrchestratorRequest(
    request(),
    dependencies(repository),
  );
  const body = await readJson(response);

  assertEquals(response.status, 500);
  assertEquals(body.error.code, "fx_scheduler_authorization_failed");
  assertEquals(body.error.retryable, true);
});

Deno.test("FX orchestrator rejects an invalid runtime clock before claiming games", async () => {
  const repository = new FakeRepository();
  const response = await handleFxOrchestratorRequest(
    request(),
    dependencies(repository, { now: () => new Date(Number.NaN) }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 500);
  assertEquals(body.error.code, "fx_orchestrator_clock_invalid");
  assertEquals(repository.claimCalls, []);
});

class FakeRepository implements FxFixingOrchestratorRepository {
  authorized = true;
  verifierFailure: Error | null = null;
  claims: readonly FxFixingClaim[] = [];
  readonly verifyCalls: unknown[] = [];
  readonly claimCalls: unknown[] = [];
  readonly failureCalls: unknown[] = [];

  async verifySchedulerToken(input: unknown): Promise<boolean> {
    this.verifyCalls.push(input);
    if (this.verifierFailure) throw this.verifierFailure;
    return this.authorized;
  }

  async claimDueFixings(input: unknown): Promise<readonly FxFixingClaim[]> {
    this.claimCalls.push(input);
    return this.claims;
  }

  async loadFixingInput(claim: FxFixingClaim): Promise<FxFixingLoadedInput> {
    return {
      engineInput: engineInput(claim.gameSessionId),
      inputHash: "c".repeat(64),
    };
  }

  async applyFixing(_input: unknown): Promise<FxFixingApplyResult> {
    return {
      outcome: "applied",
      fixingPublicId: "fxf_20260826_0001",
      currencyValuesInserted: 11,
      shocksConsumed: 0,
    };
  }

  async failFixingClaim(input: unknown): Promise<void> {
    this.failureCalls.push(input);
  }
}

function dependencies(
  repository: FakeRepository,
  overrides: {
    readonly onCreateRepository?: () => void;
    readonly calculate?: (input: FxFixingEngineInput) => FxFixingEngineResult;
    readonly now?: () => Date;
  } = {},
) {
  return {
    createRepository: () => {
      overrides.onCreateRepository?.();
      return repository;
    },
    calculate: overrides.calculate ?? calculateStub,
    now: overrides.now ?? (() => new Date(NOW)),
    randomUuid: () => RUN_UUID,
    hashSchedulerToken: async () => TOKEN_HASH,
  };
}

function request(body?: unknown): Request {
  return new Request("https://scheduler.internal/fx-orchestrator", {
    method: "POST",
    headers: {
      [FX_SCHEDULER_HEADER]: VALID_TOKEN,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function claim(): FxFixingClaim {
  return {
    gameSessionId: GAME_ID,
    fixingLocalDate: "2026-08-26",
    fixingEffectiveAt: "2026-08-25T23:00:00.000Z",
    gameTimezone: "Asia/Seoul",
    leaseToken: LEASE_TOKEN,
  };
}

function engineInput(gameSessionId: string): FxFixingEngineInput {
  return {
    gameSessionId,
    fixingLocalDate: "2026-08-26",
    policyVersion: "fx-policy-v1",
    policy: fxPolicyV1Input(),
    currencies: [],
    storyShocks: [],
  };
}

function calculateStub(input: FxFixingEngineInput): FxFixingEngineResult {
  return {
    gameSessionId: input.gameSessionId,
    fixingLocalDate: input.fixingLocalDate,
    policyVersion: input.policyVersion,
    canonicalInputJson: JSON.stringify(input),
    values: [
      {
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
      },
    ],
  };
}

async function readJson(response: Response): Promise<any> {
  return JSON.parse(await response.text());
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
