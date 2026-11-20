function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Actual: ${actualJson} Expected: ${expectedJson}`);
  }
}
import { handlePlayerBusinessRequest } from "./playerBusinessHttpHandler.ts";
import { readPlayerBusinessRoutePath } from "./playerBusinessRoutePaths.ts";
import type {
  BusinessWorkforceSnapshotDto,
  PlayerBusinessRepository,
} from "../contracts/playerBusinessContracts.ts";

const BUSINESS_KEY = `biz_${"a".repeat(32)}`;
const CANDIDATE_KEY = `wfc_${"b".repeat(32)}`;
const EMPLOYEE_KEY = `emp_${"c".repeat(32)}`;

Deno.test("Phase 4B routes expose candidates and candidate-only hiring", () => {
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/workforce/candidates"),
    { kind: "businessRead", resource: "workforceCandidates" },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      `/players/me/business/workforce/candidates/${CANDIDATE_KEY}/hire`,
    ),
    { kind: "businessCandidateHire", candidateKey: CANDIDATE_KEY },
  );
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/employees/hire"),
    { kind: "businessHire" },
  );
});

Deno.test("Phase 4B returns a public candidate pool", async () => {
  const workforce: BusinessWorkforceSnapshotDto = {
    businessKey: BUSINESS_KEY,
    generatedAt: "2026-08-22T00:00:00.000Z",
    candidates: [{
      candidateKey: CANDIDATE_KEY,
      roleKey: "workforce.production.operator",
      roleName: "Production Operator",
      laborClass: "production",
      displayLabel: "Candidate 17",
      countryCode: "NVA",
      currencyCode: "NVC",
      wagePerCycle: 125,
      laborMinutesPerCycle: 2400,
      skillBasisPoints: 6200,
      productivityIndex: 1,
      contractType: "cycle",
      availabilityEndsAt: null,
      version: 1,
    }],
  };
  const repository = fakeRepository(workforce);
  const response = await request(
    "/players/me/business/workforce/candidates",
    "GET",
    undefined,
    repository,
  );
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body, workforce);
  assert(!JSON.stringify(body).includes("00000000-"));
});

Deno.test("Phase 4B hiring forwards only candidate intent and server scope", async () => {
  let command = "";
  let args: Record<string, unknown> = {};
  const repository = fakeRepository(undefined, (nextCommand, nextArgs) => {
    command = nextCommand;
    args = { ...nextArgs };
    return {
      business_key: BUSINESS_KEY,
      employee_key: EMPLOYEE_KEY,
      candidate_key: CANDIDATE_KEY,
      workforce_role_key: "workforce.production.operator",
      role_name: "Production Operator",
      contract_type: "cycle",
      wage_per_cycle: 125,
      currency_code: "NVC",
      labor_minutes_per_cycle: 2400,
      skill_basis_points: 6200,
      productivity_index: 1,
      employee_status: "active",
      hired_at: "2026-08-22T00:00:00.000Z",
      replayed: false,
    };
  });
  const response = await request(
    `/players/me/business/workforce/candidates/${CANDIDATE_KEY}/hire`,
    "POST",
    { businessKey: BUSINESS_KEY, idempotencyKey: "phase4b-hire-001" },
    repository,
  );
  assertEquals(response.status, 200);
  assertEquals(command, "hire_business_workforce_candidate_v2");
  assertEquals(args, {
    p_game_session_id: "game-scope",
    p_player_id: "player-scope",
    p_business_key: BUSINESS_KEY,
    p_candidate_key: CANDIDATE_KEY,
    p_idempotency_key: "phase4b-hire-001",
  });
  const body = await response.json();
  assertEquals(body.receipt.employeeKey, EMPLOYEE_KEY);
  assertEquals(body.receipt.wagePerCycle, 125);
  assertEquals(body.receipt.productivityIndex, 1);
});

Deno.test("retired free-text hiring is authenticated and returns 410", async () => {
  let executed = false;
  const repository = fakeRepository(undefined, () => {
    executed = true;
    return {};
  });
  const response = await request(
    "/players/me/business/employees/hire",
    "POST",
    {
      businessKey: BUSINESS_KEY,
      employeePlayerIdentifier: "P-102",
      role: "Player-authored role",
      contractType: "cycle",
      wagePerCycle: 999,
      productivityIndex: 3,
      idempotencyKey: "retired-hire-001",
    },
    repository,
  );
  assertEquals(response.status, 410);
  assertEquals((await response.json()).error.code, "business_free_text_hiring_retired");
  assertEquals(executed, false);
});

function fakeRepository(
  workforce?: BusinessWorkforceSnapshotDto,
  execute?: (
    command: string,
    args: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown>,
): PlayerBusinessRepository {
  return {
    readBusiness: () => Promise.reject(new Error("not used")),
    readWorkforceCandidates: () => Promise.resolve(workforce ?? {
      businessKey: BUSINESS_KEY,
      generatedAt: "2026-08-22T00:00:00.000Z",
      candidates: [],
    }),
    execute: (command, args) => Promise.resolve(
      execute?.(command, args) ?? {},
    ),
  };
}

async function request(
  path: string,
  method: string,
  body: Record<string, unknown> | undefined,
  repository: PlayerBusinessRepository,
): Promise<Response> {
  const route = readPlayerBusinessRoutePath(path);
  if (!route) throw new Error(`Route was not parsed: ${path}`);
  return handlePlayerBusinessRequest(
    new Request(`https://example.test${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
    route,
    {
      readEnvironment: () => ({
        ok: true,
        value: {
          supabaseUrl: "https://example.supabase.co",
          serviceRoleKey: "test-service-role",
        },
      }) as never,
      createServiceClient: () => ({}) as never,
      resolveScope: () => Promise.resolve({
        gameId: "game-scope",
        playerUuid: "player-scope",
      }),
      createRepository: () => repository,
    },
  );
}
