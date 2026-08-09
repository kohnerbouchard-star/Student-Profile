import {
  guardAdminRequest,
  normalizedAdminAction,
  requiredAdminPermission,
  type AdminPermission,
} from "./adminSecurityGuard.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const GAME_ID = "22222222-2222-4222-8222-222222222222";

Deno.test("Crafting and plural Business routes use explicit product permissions and bounded rate-limit families", () => {
  assertEquals(
    requiredAdminPermission("GET", `/games/${GAME_ID}/crafting/oversight`),
    "inventory.redeem",
  );
  assertEquals(
    requiredAdminPermission("POST", `/games/${GAME_ID}/crafting/jobs/job-1/recover`),
    "inventory.redeem",
  );
  assertEquals(
    requiredAdminPermission("GET", `/games/${GAME_ID}/businesses`),
    "business.manage",
  );
  assertEquals(
    requiredAdminPermission("POST", `/games/${GAME_ID}/businesses/business-1/compliance`),
    "business.manage",
  );
  assertEquals(
    normalizedAdminAction("GET", `/games/${GAME_ID}/crafting/oversight`),
    "staff.admin.read.crafting",
  );
  assertEquals(
    normalizedAdminAction("POST", `/games/${GAME_ID}/businesses/business-1/compliance`),
    "staff.admin.write.business",
  );
});

Deno.test("generic game grants cannot authorize Crafting or plural Business routes", async () => {
  for (const [method, path] of [
    ["GET", `/games/${GAME_ID}/crafting/oversight`],
    ["POST", `/games/${GAME_ID}/crafting/jobs/job-1/recover`],
    ["GET", `/games/${GAME_ID}/businesses`],
    ["POST", `/games/${GAME_ID}/businesses/business-1/compliance`],
  ] as const) {
    let rateLimitCalls = 0;
    const result = await guardAdminRequest(
      new Request(`https://example.test/admin-api${path}`, { method }),
      contextWith(["game.read", "game.update"]),
      path,
      {
        consumeRateLimit: async () => {
          rateLimitCalls += 1;
          return allowedDecision();
        },
      },
    );
    assertEquals(result.ok, false);
    if (result.ok === false) {
      assertEquals(result.code, "staff_permission_denied");
    }
    assertEquals(rateLimitCalls, 0);
  }
});

Deno.test("explicit Crafting and Business grants authorize their own routes", async () => {
  for (const [method, path, permission] of [
    ["GET", `/games/${GAME_ID}/crafting/oversight`, "inventory.redeem"],
    ["POST", `/games/${GAME_ID}/crafting/supply/item-1`, "inventory.redeem"],
    ["GET", `/games/${GAME_ID}/businesses`, "business.manage"],
    ["POST", `/games/${GAME_ID}/businesses/business-1/compliance`, "business.manage"],
  ] as const) {
    const result = await guardAdminRequest(
      new Request(`https://example.test/admin-api${path}`, { method }),
      contextWith([permission]),
      path,
      { consumeRateLimit: async () => allowedDecision() },
    );
    assertEquals(result.ok, true);
    if (result.ok === true) {
      assertEquals(result.requiredPermission, permission);
    }
  }
});

function contextWith(permissions: readonly AdminPermission[]) {
  return {
    token: jwt("aal2"),
    user: {
      id: "auth-user",
      app_metadata: {
        econovaria_role: "game_admin",
        permission_version: 1,
        security_version: 1,
      },
    },
    staff: { id: STAFF_ID },
    games: [{ id: GAME_ID }],
    service: {
      from(table: string) {
        if (table === "staff_users") {
          const response = {
            data: {
              status: "active",
              role: "game_admin",
              permission_version: 1,
              security_version: 1,
              mfa_required: true,
            },
            error: null,
          };
          const query = {
            select: () => query,
            eq: () => query,
            maybeSingle: async () => response,
          };
          return query;
        }
        if (table === "staff_permission_grants") {
          const query = {
            select: () => query,
            eq: async () => ({
              data: permissions.map((permission) => ({ permission })),
              error: null,
            }),
          };
          return query;
        }
        throw new Error(`Unexpected table: ${table}`);
      },
      rpc: async () => ({ data: null, error: null }),
    },
  };
}

function allowedDecision() {
  return {
    allowed: true,
    retryAfterSeconds: 0,
    limitingDimension: null,
    limit: 100,
    remaining: 99,
    resetAt: "2026-08-09T01:00:00.000Z",
  } as const;
}

function jwt(aal: "aal1" | "aal2"): string {
  return [
    base64Url({ alg: "none", typ: "JWT" }),
    base64Url({ aal }),
    "signature",
  ].join(".");
}

function base64Url(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
