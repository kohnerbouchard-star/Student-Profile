import {
  BUSINESS_SUPERVISION_FIELDS,
  projectBusinessSupervision,
} from "./businessSupervisionProjection.ts";
import {
  assert,
  assertEquals,
  BUSINESS_KEY,
  GAME_ID,
  request,
  STAFF_ID,
} from "./businessBankingTestSupport.ts";
import { handleBusinessBankingAdminOperation } from "./businessBankingOperations.ts";

Deno.test("Phase 13 projection bounds every section and rejects private identity and arbitrary metadata", () => {
  const sections = Object.fromEntries(
    Object.keys(BUSINESS_SUPERVISION_FIELDS).map((key) => [key, {
      status: "ready",
      rows: Array.from({ length: 101 }, () => ({
        public_key: "own_" + "a".repeat(32),
        units: "9007199254740993",
        posted_amount: "9007199254740993.123456789123456789",
        roleName: "private " + GAME_ID,
        game_session_id: GAME_ID,
        player_id: STAFF_ID,
        metadata: { secret: "POISON" },
      })),
    }]),
  );
  const result = projectBusinessSupervision({
    schemaVersion: 1,
    readOnly: true,
    businessKey: BUSINESS_KEY,
    sections,
  }, BUSINESS_KEY) as any;
  for (const section of Object.values(result.sections) as any[]) {
    assertEquals(section.rows.length, 100);
    assertEquals(section.truncated, true);
  }
  assertEquals(
    result.sections.checking.rows[0].posted_amount,
    "9007199254740993.123456789123456789",
  );
  assertEquals(result.sections.workforce.rows[0].roleName, null);
  assert(
    !/POISON|game_session_id|player_id|00000000-0000/.test(
      JSON.stringify(result),
    ),
    "private data leaked",
  );
});

Deno.test("Phase 13 projection refuses wrong-business and mutable contracts", () => {
  for (
    const value of [null, {}, {
      schemaVersion: 1,
      readOnly: false,
      businessKey: BUSINESS_KEY,
      sections: {},
    }, {
      schemaVersion: 1,
      readOnly: true,
      businessKey: "biz_" + "b".repeat(32),
      sections: {},
    }]
  ) {
    let failed = false;
    try {
      projectBusinessSupervision(value, BUSINESS_KEY);
    } catch {
      failed = true;
    }
    assert(failed, "invalid contract accepted");
  }
});

Deno.test("Phase 13 handler forwards only trusted game, staff and public Business key; DB denial is bounded", async () => {
  const calls: unknown[] = [];
  const service = {
    from() {
      throw new Error("Direct table read forbidden");
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({
        data: null,
        error: { message: "BUSINESS_SUPERVISION_DENIED internal details" },
      });
    },
  };
  const result = await handleBusinessBankingAdminOperation(service, {
    request: request("GET", "/ignored?player_id=" + STAFF_ID),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/businesses/" + BUSINESS_KEY,
  });
  assertEquals(result.status, 403);
  assertEquals(calls, [{
    name: "read_admin_business_supervision_v2",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
      p_business_key: BUSINESS_KEY,
    },
  }]);
  assert(
    !JSON.stringify(result).includes("internal details"),
    "diagnostics leaked",
  );
});
