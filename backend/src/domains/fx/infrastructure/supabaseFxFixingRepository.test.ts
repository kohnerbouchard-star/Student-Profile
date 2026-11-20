import type { FxFixingEngineResult } from "../contracts/fxFixingContracts.ts";
import type { FxFixingClaim } from "../services/fxFixingRunner.ts";
import { fxPolicyV1Input } from "../tests/fxFixingTestFixtures.ts";
import { SupabaseFxFixingRepository } from "./supabaseFxFixingRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const LEASE_TOKEN = "10000000-0000-4000-8000-000000000001";
const SNAPSHOT_ID = "20000000-0000-4000-8000-000000000001";
const INPUT_HASH = "a".repeat(64);
const CLAIM: FxFixingClaim = {
  gameSessionId: GAME_ID,
  fixingLocalDate: "2026-08-26",
  fixingEffectiveAt: "2026-08-25T23:00:00.000Z",
  gameTimezone: "Asia/Seoul",
  leaseToken: LEASE_TOKEN,
};

Deno.test("Supabase FX repository verifies only the named scheduler digest", async () => {
  const client = new FakeClient();
  client.responses.set("verify_runtime_scheduler_token_v1", {
    data: true,
    error: null,
  });
  const repository = new SupabaseFxFixingRepository(client);

  assertEquals(
    await repository.verifySchedulerToken({
      schedulerName: "econovaria-fx-runtime-scheduler-v1",
      tokenSha256: "b".repeat(64),
    }),
    true,
  );
  assertEquals(client.calls, [{
    functionName: "verify_runtime_scheduler_token_v1",
    args: {
      p_scheduler_name: "econovaria-fx-runtime-scheduler-v1",
      p_token_sha256: "b".repeat(64),
    },
  }]);
});

Deno.test("Supabase FX repository claims bounded leased game/date scopes", async () => {
  const client = new FakeClient();
  client.responses.set("claim_due_fx_games_v1", {
    data: [{
      game_session_id: GAME_ID,
      fixing_local_date: "2026-08-26",
      fixing_effective_at: "2026-08-25T23:00:00.000Z",
      game_timezone: "Asia/Seoul",
      lease_token: LEASE_TOKEN,
    }],
    error: null,
  });
  const repository = new SupabaseFxFixingRepository(client);

  assertEquals(
    await repository.claimDueFixings({
      claimedAt: "2026-08-26T00:00:05.000Z",
      limit: 25,
      leaseOwner: "fx-run:test-0001",
      leaseSeconds: 120,
    }),
    [CLAIM],
  );
  assertEquals(client.calls[0], {
    functionName: "claim_due_fx_games_v1",
    args: {
      p_now: "2026-08-26T00:00:05.000Z",
      p_limit: 25,
      p_lease_owner: "fx-run:test-0001",
      p_lease_seconds: 120,
    },
  });
});

Deno.test("Supabase FX repository loads exact decimal engine input and accepts bootstrap sequence zero", async () => {
  const client = new FakeClient();
  client.responses.set("load_fx_fixing_input_v1", {
    data: [{ input_hash: INPUT_HASH, engine_input: engineInput() }],
    error: null,
  });
  const repository = new SupabaseFxFixingRepository(client);
  const loaded = await repository.loadFixingInput(CLAIM);

  assertEquals(loaded.inputHash, INPUT_HASH);
  assertEquals(loaded.engineInput.gameSessionId, GAME_ID);
  assertEquals(loaded.engineInput.policyVersion, "fx-policy-v1");
  assertEquals(loaded.engineInput.policy.parameters.gdp.capBasisPoints, 50);
  assertEquals(
    loaded.engineInput.currencies[0].previousUnitsPerEco,
    "1.250000000000",
  );
  assertEquals(loaded.engineInput.currencies[0].snapshotSequence, 0);
  assertEquals(loaded.engineInput.storyShocks?.[0], {
    shockId: "fxs_story-001",
    currencyCode: "NRC",
    basisPoints: 125,
  });
  assertEquals(client.calls[0], {
    functionName: "load_fx_fixing_input_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_fixing_local_date: "2026-08-26",
      p_lease_token: LEASE_TOKEN,
    },
  });
});

Deno.test("Supabase FX repository rejects lossy numeric macro input", async () => {
  const client = new FakeClient();
  const input = engineInput();
  input.currencies[0].inflationRate = 0.03;
  client.responses.set("load_fx_fixing_input_v1", {
    data: [{ input_hash: INPUT_HASH, engine_input: input }],
    error: null,
  });

  await assertRejectsCode(
    () => new SupabaseFxFixingRepository(client).loadFixingInput(CLAIM),
    "fx_fixing_rpc_result_invalid",
  );
});

Deno.test("Supabase FX repository applies one immutable result through the atomic RPC", async () => {
  const client = new FakeClient();
  client.responses.set("apply_fx_fixing_v1", {
    data: [{
      outcome: "applied",
      fixing_public_id: "fxf_20260826_0001",
      currency_values_inserted: 11,
      shocks_consumed: 1,
    }],
    error: null,
  });
  const repository = new SupabaseFxFixingRepository(client);
  const fixing = fixingResult();

  assertEquals(
    await repository.applyFixing({
      claim: CLAIM,
      fixing,
      inputHash: INPUT_HASH,
      calculatedAt: "2026-08-26T00:00:06.000Z",
    }),
    {
      outcome: "applied",
      fixingPublicId: "fxf_20260826_0001",
      currencyValuesInserted: 11,
      shocksConsumed: 1,
    },
  );
  assertEquals(client.calls[0], {
    functionName: "apply_fx_fixing_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_fixing_local_date: "2026-08-26",
      p_fixing_effective_at: "2026-08-25T23:00:00.000Z",
      p_lease_token: LEASE_TOKEN,
      p_input_hash: INPUT_HASH,
      p_calculated_at: "2026-08-26T00:00:06.000Z",
      p_fixing_result: fixing,
    },
  });
});

Deno.test("Supabase FX repository releases a failed claim with a bounded error code", async () => {
  const client = new FakeClient();
  client.responses.set("fail_fx_fixing_claim_v1", {
    data: true,
    error: null,
  });
  const repository = new SupabaseFxFixingRepository(client);

  await repository.failFixingClaim({
    claim: CLAIM,
    errorCode: "fx_fixing_engine_failed",
    failedAt: "2026-08-26T00:00:06.000Z",
  });
  assertEquals(client.calls[0], {
    functionName: "fail_fx_fixing_claim_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_fixing_local_date: "2026-08-26",
      p_lease_token: LEASE_TOKEN,
      p_error_code: "fx_fixing_engine_failed",
      p_failed_at: "2026-08-26T00:00:06.000Z",
    },
  });
});

Deno.test("Supabase FX repository maps absent schema and incomplete macro evidence", async () => {
  const missingClient = new FakeClient();
  missingClient.responses.set("claim_due_fx_games_v1", {
    data: null,
    error: { code: "42883", message: "function does not exist" },
  });
  await assertRejectsCode(
    () =>
      new SupabaseFxFixingRepository(missingClient).claimDueFixings({
        claimedAt: "2026-08-26T00:00:05.000Z",
        limit: 25,
        leaseOwner: "fx-run:test-0001",
        leaseSeconds: 120,
      }),
    "fx_fixing_schema_not_applied",
  );

  const incompleteClient = new FakeClient();
  incompleteClient.responses.set("load_fx_fixing_input_v1", {
    data: null,
    error: {
      code: "P0001",
      message: "FX_INPUT_MACRO_COHORT_INCOMPLETE",
    },
  });
  await assertRejectsCode(
    () =>
      new SupabaseFxFixingRepository(incompleteClient).loadFixingInput(CLAIM),
    "fx_fixing_input_incomplete",
  );
});

class FakeClient {
  readonly calls: {
    readonly functionName: string;
    readonly args: Readonly<Record<string, unknown>> | undefined;
  }[] = [];
  readonly responses = new Map<string, {
    readonly data: unknown;
    readonly error: { readonly code?: string; readonly message: string } | null;
  }>();

  async rpc<T>(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<{ readonly data: T | null; readonly error: any }> {
    this.calls.push({ functionName, args });
    const response = this.responses.get(functionName);
    if (!response) {
      return {
        data: null,
        error: { message: `Unexpected RPC ${functionName}` },
      };
    }
    return response as { readonly data: T | null; readonly error: any };
  }
}

function engineInput(): any {
  return {
    gameSessionId: GAME_ID,
    fixingLocalDate: "2026-08-26",
    policyVersion: "fx-policy-v1",
    policy: fxPolicyV1Input(),
    currencies: [{
      currencyCode: "NRC",
      countryCode: "NORTHREACH",
      previousUnitsPerEco: "1.250000000000",
      snapshotId: SNAPSHOT_ID,
      snapshotSequence: 0,
      realGdpIndex: "100.000000000000",
      gdpGrowthRate: "0.025000000000",
      inflationRate: "0.030000000000",
      interestRate: "0.040000000000",
      consumerConfidenceIndex: "100.000000000000",
      businessConfidenceIndex: "100.000000000000",
      importDependencyIndex: "0.500000000000",
      currencyStabilityIndex: "0.500000000000",
      tradeBalanceIndex: "0.000000000000",
      exportStrengthIndex: "0.500000000000",
      marketRiskIndex: "0.500000000000",
      politicalStabilityIndex: "0.500000000000",
    }],
    storyShocks: [{
      shockId: "fxs_story-001",
      currencyCode: "NRC",
      basisPoints: 125,
    }],
  };
}

function fixingResult(): FxFixingEngineResult {
  return {
    gameSessionId: GAME_ID,
    fixingLocalDate: "2026-08-26",
    policyVersion: "fx-policy-v1",
    canonicalInputJson: '{"canonical":true}',
    values: [],
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

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
