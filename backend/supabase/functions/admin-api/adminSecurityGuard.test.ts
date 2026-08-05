import {
  ADMIN_PERMISSIONS,
  guardAdminRequest,
  normalizedAdminAction,
  requiredAdminPermission,
  type AdminPermission,
} from "./adminSecurityGuard.ts";
import { buildStaffRateLimitBuckets } from "../../../src/security/rateLimitKeying.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const GAME_ID = "22222222-2222-4222-8222-222222222222";
const RATE_LIMIT_SECRET =
  "EconovariaSecurityConvergenceRateLimitSecret_2026_07";

Deno.test("allows an AAL1 Admin read only with its server grant", async () => {
  const result = await guardAdminRequest(
    new Request(`https://example.test/admin-api/games/${GAME_ID}`, {
      method: "GET",
    }),
    contextWith({ aal: "aal1", permissions: ["game.read"] }),
    `/games/${GAME_ID}`,
    { consumeRateLimit: allowRateLimit },
  );

  assertEquals(result.ok, true);
  if (result.ok === true) {
    assertEquals(result.assuranceLevel, "aal1");
    assertEquals(result.requiredPermission, "game.read");
    assertEquals(result.permissions, ["game.read"]);
    assertEquals(result.permissions.includes("economy.adjust"), false);
    assertEquals(result.permissions.includes("*" as AdminPermission), false);
  }
});

Deno.test("requires AAL2 after the settings grant is verified", async () => {
  const result = await guardAdminRequest(
    new Request(`https://example.test/admin-api/games/${GAME_ID}/settings`, {
      method: "PATCH",
    }),
    contextWith({ aal: "aal1", permissions: ["settings.manage"] }),
    `/games/${GAME_ID}/settings`,
    { consumeRateLimit: allowRateLimit },
  );

  assertEquals(result.ok, false);
  if (result.ok === false) {
    assertEquals(result.status, 403);
    assertEquals(result.code, "staff_mfa_required");
  }
});

Deno.test("allows an AAL2 Player mutation with only players.manage", async () => {
  let capturedAction = "";
  const result = await guardAdminRequest(
    new Request(`https://example.test/admin-api/games/${GAME_ID}/players/99`, {
      method: "POST",
    }),
    contextWith({ aal: "aal2", permissions: ["players.manage"] }),
    `/games/${GAME_ID}/players/99`,
    {
      consumeRateLimit: async (_service, input) => {
        capturedAction = input.action;
        return allowedDecision();
      },
    },
  );

  assertEquals(result.ok, true);
  if (result.ok === true) {
    assertEquals(result.requiredPermission, "players.manage");
    assertEquals(result.permissions, ["players.manage"]);
  }
  assertEquals(capturedAction, "staff.admin.write.players");
});

Deno.test("denies a route when only an unrelated grant exists", async () => {
  let rateLimitCalls = 0;
  const result = await guardAdminRequest(
    new Request(`https://example.test/admin-api/games/${GAME_ID}/players`, {
      method: "GET",
    }),
    contextWith({ aal: "aal2", permissions: ["audit.read"] }),
    `/games/${GAME_ID}/players`,
    {
      consumeRateLimit: async () => {
        rateLimitCalls += 1;
        return allowedDecision();
      },
    },
  );

  assertEquals(result.ok, false);
  if (result.ok === false) {
    assertEquals(result.status, 403);
    assertEquals(result.code, "staff_permission_denied");
  }
  assertEquals(rateLimitCalls, 0);
});

Deno.test("fails closed when permission grants cannot be loaded", async () => {
  const result = await guardAdminRequest(
    new Request("https://example.test/admin-api/games", { method: "GET" }),
    contextWith({
      aal: "aal2",
      permissions: [],
      permissionError: { message: "permission store unavailable" },
    }),
    "/games",
    { consumeRateLimit: allowRateLimit },
  );

  assertEquals(result.ok, false);
  if (result.ok === false) {
    assertEquals(result.status, 503);
    assertEquals(result.code, "staff_permissions_unavailable");
  }
});

Deno.test("rejects stale role and security version claims before grants", async () => {
  const context = contextWith({ aal: "aal2", permissions: ADMIN_PERMISSIONS });
  context.user.app_metadata.security_version = 2;
  const result = await guardAdminRequest(
    new Request("https://example.test/admin-api/games", { method: "GET" }),
    context,
    "/games",
    { consumeRateLimit: allowRateLimit },
  );

  assertEquals(result.ok, false);
  if (result.ok === false) {
    assertEquals(result.code, "staff_claims_outdated");
  }
});

Deno.test("returns Retry-After metadata after authorization succeeds", async () => {
  const result = await guardAdminRequest(
    new Request("https://example.test/admin-api/games", { method: "GET" }),
    contextWith({ aal: "aal2", permissions: ["game.read"] }),
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
  if (result.ok === false) {
    assertEquals(result.status, 429);
    assertEquals(result.retryAfterSeconds, 45);
    assertEquals(result.resetAt, "2026-07-26T12:05:00.000Z");
  }
});

Deno.test("affected Admin mutations consume the authorized user-action limit exactly once", async () => {
  const affectedRoutes = [
    ["POST", `/games/${GAME_ID}/players`],
    ["POST", `/games/${GAME_ID}/attendance/scans`],
    ["POST", `/games/${GAME_ID}/attendance/corrections`],
    ["POST", `/games/${GAME_ID}/store/items`],
    ["PATCH", `/games/${GAME_ID}/store/items/item-1`],
    ["DELETE", `/games/${GAME_ID}/store/items/item-1`],
    ["POST", `/games/${GAME_ID}/contracts`],
    ["POST", `/games/${GAME_ID}/contracts/contract-1/publish`],
    ["PATCH", `/games/${GAME_ID}/settings`],
    ["POST", `/games/${GAME_ID}/join-code/reset`],
  ] as const;

  for (const [method, path] of affectedRoutes) {
    let rateLimitCalls = 0;
    const result = await guardAdminRequest(
      new Request(`https://example.test/admin-api${path}`, { method }),
      contextWith({ aal: "aal2", permissions: ADMIN_PERMISSIONS }),
      path,
      {
        consumeRateLimit: async () => {
          rateLimitCalls += 1;
          return allowedDecision();
        },
      },
    );

    assertEquals(result.ok, true);
    assertEquals(rateLimitCalls, 1);
  }
});

Deno.test("maps reviewed Admin resources to explicit grants", () => {
  assertEquals(requiredAdminPermission("GET", "/games"), "game.read");
  assertEquals(requiredAdminPermission("POST", "/games"), "game.create");
  assertEquals(
    requiredAdminPermission("PATCH", `/games/${GAME_ID}/settings`),
    "settings.manage",
  );
  assertEquals(
    requiredAdminPermission("GET", `/games/${GAME_ID}/logs`),
    "audit.read",
  );
  assertEquals(
    requiredAdminPermission("POST", `/games/${GAME_ID}/marketplace/disputes`),
    "marketplace.moderate",
  );
  assertEquals(requiredAdminPermission("GET", "/unreviewed/path"), null);
});

Deno.test("maps identifiers to one canonical bounded Admin action", () => {
  assertEquals(
    normalizedAdminAction(
      "DELETE",
      `/games/${GAME_ID}/contracts/12345`,
    ),
    "staff.admin.delete.contracts",
  );
  assertEquals(
    normalizedAdminAction("GET", "/unreviewed-attacker-route/anything"),
    "staff.admin.read.unknown",
  );
});

Deno.test("canonical Admin actions satisfy shared rate-limit keying", async () => {
  const action = normalizedAdminAction(
    "PATCH",
    `/games/${GAME_ID}/settings`,
  );
  const buckets = await buildStaffRateLimitBuckets({
    action,
    gameUuid: GAME_ID,
    ipAddress: "203.0.113.15",
    staffUuid: STAFF_ID,
    profile: "sensitive",
  }, RATE_LIMIT_SECRET);

  assertEquals(action, "staff.admin.write.settings");
  assertEquals(buckets.length, 4);
  assertEquals(buckets.map((bucket) => bucket.dimension).sort(), [
    "action",
    "game",
    "identity",
    "ip",
  ]);
});

function contextWith(options: {
  readonly aal: "aal1" | "aal2";
  readonly permissions: readonly AdminPermission[];
  readonly permissionError?: { readonly message: string } | null;
}) {
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
              data: options.permissions.map((permission) => ({ permission })),
              error: options.permissionError ?? null,
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
