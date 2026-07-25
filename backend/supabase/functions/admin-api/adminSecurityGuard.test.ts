import {
  ADMIN_PERMISSIONS,
  guardAdminRequest,
  normalizedAdminAction,
} from "./adminSecurityGuard.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const GAME_ID = "22222222-2222-4222-8222-222222222222";

Deno.test("allows an AAL1 Admin read with matching controlled claims", async () => {
  const context = contextWith({ aal: "aal1" });
  const result = await guardAdminRequest(
    new Request(`https://example.test/admin-api/games/${GAME_ID}`, {
      method: "GET",
    }),
    context,
    `/games/${GAME_ID}`,
    { consumeRateLimit: allowRateLimit },
  );

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.assuranceLevel, "aal1");
    assertEquals(result.permissions.includes("economy.adjust"), true);
    assertEquals(result.permissions.includes("*"), false);
    assertEquals(result.permissions, ADMIN_PERMISSIONS);
  }
});

Deno.test("requires AAL2 before an Admin mutation", async () => {
  const result = await guardAdminRequest(
    new Request(`https://example.test/admin-api/games/${GAME_ID}/settings`, {
      method: "PATCH",
    }),
    contextWith({ aal: "aal1" }),
    `/games/${GAME_ID}/settings`,
    { consumeRateLimit: allowRateLimit },
  );

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 403);
    assertEquals(result.code, "staff_mfa_required");
  }
});

Deno.test("allows an AAL2 Admin mutation after the rate gate", async () => {
  let capturedAction = "";
  const result = await guardAdminRequest(
    new Request(`https://example.test/admin-api/games/${GAME_ID}/players/99`, {
      method: "POST",
    }),
    contextWith({ aal: "aal2" }),
    `/games/${GAME_ID}/players/99`,
    {
      consumeRateLimit: async (_service, input) => {
        capturedAction = input.action;
        return allowedDecision();
      },
    },
  );

  assertEquals(result.ok, true);
  assertEquals(capturedAction, "admin.POST./games/:uuid/players/:id");
});

Deno.test("rejects stale role and security version claims", async () => {
  const context = contextWith({ aal: "aal2" });
  context.user.app_metadata.security_version = 2;
  const result = await guardAdminRequest(
    new Request("https://example.test/admin-api/games", { method: "GET" }),
    context,
    "/games",
    { consumeRateLimit: allowRateLimit },
  );

  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "staff_claims_outdated");
});

Deno.test("returns Retry-After metadata when the Admin route is limited", async () => {
  const result = await guardAdminRequest(
    new Request("https://example.test/admin-api/games", { method: "GET" }),
    contextWith({ aal: "aal2" }),
    "/games",
    {
      consumeRateLimit: async () => ({
        allowed: false,
        retryAfterSeconds: 45,
        limitingDimension: "ip",
        limit: 100,
        remaining: 0,
        resetAt: "2026-07-26T12:05:00.000Z",
      }),
    },
  );

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 429);
    assertEquals(result.retryAfterSeconds, 45);
    assertEquals(result.resetAt, "2026-07-26T12:05:00.000Z");
  }
});

Deno.test("normalizes identifiers out of rate-limit action names", () => {
  assertEquals(
    normalizedAdminAction(
      "DELETE",
      `/games/${GAME_ID}/contracts/12345`,
    ),
    "admin.DELETE./games/:uuid/contracts/:id",
  );
});

function contextWith(options: { readonly aal: "aal1" | "aal2" }) {
  return {
    token: jwt(options.aal),
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
        if (table !== "staff_users") throw new Error(`Unexpected table: ${table}`);
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
      },
      rpc: async () => ({ data: null, error: null }),
    },
  };
}

async function allowRateLimit() {
  return allowedDecision();
}

function allowedDecision() {
  return {
    allowed: true,
    retryAfterSeconds: 0,
    limitingDimension: null,
    limit: 100,
    remaining: 99,
    resetAt: "2026-07-26T12:05:00.000Z",
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
