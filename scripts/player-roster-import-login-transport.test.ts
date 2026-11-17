// Use the same pinned client as the production edge composition root. Fetch is
// intercepted in memory: synthetic fixtures only, no network or hosted data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import type { EdgeSupabaseClient } from "../backend/src/platform/supabase/edgeStaffSession.ts";
import { handlePlayerLoginRequest } from "../backend/src/domains/players/api/playerLoginHttpHandler.ts";

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000002";
const IDENTIFIER = "STU-000000000000000000000001";
const ACCESS_CODE = "SYNTHETIC-4826";
const identity = {
  id: PLAYER,
  display_name: "Synthetic Student",
  roster_label: null,
  player_identifier: IDENTIFIER,
  status: "active",
};
const credential = {
  id: "00000000-0000-4000-8000-000000000003",
  player_id: PLAYER,
  status: "active",
  normalized_student_code_hash: "a".repeat(64),
  credential_version: "pbkdf2-sha256-v2",
  credential_salt: "b".repeat(22),
  credential_verifier: "c".repeat(43),
  credential_iterations: 600_000,
};
const allowed = {
  allowed: true,
  retryAfterSeconds: 0,
  limitingDimension: null,
  failureCount: 0,
  lockedUntil: null,
};

type Options = {
  identityData?: unknown;
  identityError?: boolean;
  credentials?: unknown;
  game?: unknown;
  verified?: boolean;
  throttled?: boolean;
  upgrade?: boolean;
};

function fixture(options: Options = {}) {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const events: string[] = [];
  const client = createClient(
    "https://synthetic.invalid",
    "synthetic-service-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          const pathname = new URL(url).pathname;
          const body = typeof init?.body === "string"
            ? JSON.parse(init.body)
            : null;
          requests.push({ url, method: init?.method ?? "GET", body });
          events.push(pathname.split("/").at(-1)!);
          let data: unknown;
          let status = 200;
          if (pathname === "/rest/v1/game_sessions") {
            data = "game" in options ? options.game : {
              id: GAME,
              name: "Synthetic Game",
              status: "active",
              game_join_code_status: "active",
            };
          } else if (
            pathname === "/rest/v1/rpc/lookup_player_login_identity_v1"
          ) {
            status = options.identityError ? 500 : 200;
            data = options.identityError
              ? { message: "Synthetic database error", code: "XX000" }
              : "identityData" in options
              ? options.identityData
              : [identity];
          } else if (pathname === "/rest/v1/player_access_credentials") {
            data = "credentials" in options ? options.credentials : credential;
          } else if (
            pathname === "/rest/v1/rpc/upgrade_player_access_credential_v2"
          ) {
            data = options.upgrade === true;
          } else if (pathname === "/rest/v1/rpc/create_player_session_v2") {
            data = [{
              session_id: "00000000-0000-4000-8000-000000000004",
              expires_at: "2026-11-13T12:00:00.000Z",
            }];
          } else {
            throw new Error("Unexpected synthetic transport request");
          }
          return Promise.resolve(
            new Response(JSON.stringify(data), {
              status,
              headers: { "content-type": "application/json" },
            }),
          );
        },
      },
    },
  );
  return {
    requests,
    events,
    run: () =>
      handlePlayerLoginRequest(
        new Request(
          "https://synthetic.invalid/players/login",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              gameJoinCode: "SYNTHETIC-GAME",
              playerIdentifier: `  ${IDENTIFIER.toLowerCase()}  `,
              accessCode: ACCESS_CODE,
            }),
          },
        ),
        {
          createServiceClient: () => client as unknown as EdgeSupabaseClient,
          readEnvironment: () => ({
            ok: true,
            value: {
              supabaseUrl: "https://synthetic.invalid",
              supabaseAnonKey: "synthetic-anon",
              supabaseServiceRoleKey: "synthetic-service",
            },
          }),
          buildThrottleBuckets: async ({ accountIdentifier }) => {
            same(accountIdentifier, `SYNTHETIC-GAME|${IDENTIFIER}`);
            events.push("buckets");
            return [];
          },
          checkThrottle: async () => {
            events.push("throttle");
            return options.throttled
              ? { ...allowed, allowed: false, retryAfterSeconds: 60 }
              : allowed;
          },
          recordFailure: async () => {
            events.push("failure");
            return allowed;
          },
          recordSuccess: async () => {
            events.push("success");
          },
          hashValue: async () => "a".repeat(64),
          verifyCredential: async (code, row) => {
            same(code, ACCESS_CODE);
            same(row.credential_iterations, 600_000);
            events.push("verify");
            return options.verified !== false;
          },
          createCredentialMaterial: async () => {
            events.push("upgrade-material");
            return {
              credentialVersion: "pbkdf2-sha256-v2",
              lookupDigest: "b".repeat(64),
              salt: "c".repeat(22),
              verifier: "d".repeat(43),
              iterations: 600_000,
            };
          },
          generateSessionToken: () => "ps_synthetic_one_time_token",
          now: () => Date.parse("2026-11-13T00:00:00Z"),
        },
      ),
  };
}

Deno.test("SDK control reproduces the original GET identifier URL exposure", async () => {
  let requestUrl = "";
  const client = createClient(
    "https://synthetic.invalid",
    "synthetic-service-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          requestUrl = String(input);
          same(init?.method, "GET");
          return Promise.resolve(
            new Response("[]", {
              headers: { "content-type": "application/json" },
            }),
          );
        },
      },
    },
  );
  await client.from("players").select("id")
    .eq("game_session_id", GAME).eq("player_identifier_normalized", IDENTIFIER)
    .eq("status", "active").maybeSingle();
  same(
    new URL(requestUrl).searchParams.get("player_identifier_normalized"),
    `eq.${IDENTIFIER}`,
  );
  same(decodeURIComponent(requestUrl).includes(IDENTIFIER), true);
});

Deno.test("login sends normalized identity only in scoped RPC POST body, never URLs", async () => {
  const f = fixture();
  const response = await f.run();
  same(response.status, 200);
  same(f.events, [
    "buckets",
    "throttle",
    "game_sessions",
    "lookup_player_login_identity_v1",
    "player_access_credentials",
    "verify",
    "create_player_session_v2",
    "success",
  ]);
  const lookup = f.requests[1];
  same(lookup.method, "POST");
  same(new URL(lookup.url).search, "");
  same(lookup.body, {
    p_game_session_id: GAME,
    p_player_identifier_normalized: IDENTIFIER,
  });
  for (const request of f.requests) {
    const url = decodeURIComponent(request.url);
    same(
      [IDENTIFIER, ACCESS_CODE, "SYNTHETIC-GAME", "Synthetic Student"].some(
        (v) => url.includes(v),
      ),
      false,
    );
  }
  same(
    f.requests.some((r) => new URL(r.url).pathname === "/rest/v1/players"),
    false,
  );
  const credentialQuery = new URL(f.requests[2].url).searchParams;
  same(credentialQuery.get("game_session_id"), `eq.${GAME}`);
  same(credentialQuery.get("player_id"), `eq.${PLAYER}`);
  same(credentialQuery.get("status"), "eq.active");
  const result = JSON.stringify(await response.json());
  same(
    result.includes(GAME) || result.includes(PLAYER) ||
      result.includes(ACCESS_CODE),
    false,
  );
  same(response.headers.get("cache-control"), "private, no-store, max-age=0");
});

for (
  const [name, options, status] of [
    ["missing identity", { identityData: [] }, 401],
    ["inactive identity", {
      identityData: [{ ...identity, status: "archived" }],
    }, 401],
    ["unsafe public identity", {
      identityData: [{ ...identity, player_identifier: PLAYER }],
    }, 401],
    ["multiple identities", { identityData: [identity, identity] }, 500],
    ["non-array identity", { identityData: identity }, 500],
    ["null identity response", { identityData: null }, 500],
    ["malformed row", { identityData: [null] }, 500],
    [
      "malformed field",
      { identityData: [{ ...identity, display_name: 42 }] },
      500,
    ],
    ["lookup failure", { identityError: true }, 500],
    ["missing credential", { credentials: null }, 401],
    ["other player credential", {
      credentials: { ...credential, player_id: GAME },
    }, 401],
    ["wrong access code", { verified: false }, 401],
  ] as const
) {
  Deno.test(`private login lookup fails closed: ${name}`, async () => {
    const f = fixture(options);
    const response = await f.run();
    same(response.status, status);
    same(
      f.events.includes("create_player_session_v2") ||
        f.events.includes("success"),
      false,
    );
    same(f.events.includes("failure"), status === 401);
    same(
      f.requests.map((r) => r.url).some((url) => url.includes(IDENTIFIER)),
      false,
    );
    const result = JSON.stringify(await response.json());
    same(
      [IDENTIFIER, ACCESS_CODE, PLAYER, "Synthetic database error"].some((v) =>
        result.includes(v)
      ),
      false,
    );
  });
}

Deno.test("throttle prevents every database lookup and no game prevents identity lookup", async () => {
  const throttled = fixture({ throttled: true });
  same((await throttled.run()).status, 429);
  same(throttled.events, ["buckets", "throttle"]);
  same(throttled.requests.length, 0);
  const missingGame = fixture({ game: null });
  same((await missingGame.run()).status, 401);
  same(missingGame.events, ["buckets", "throttle", "game_sessions", "failure"]);
});

Deno.test("legacy credential upgrade remains before session creation and fails closed", async () => {
  for (const upgrade of [false, true]) {
    const f = fixture({
      upgrade,
      credentials: {
        ...credential,
        credential_version: "sha256-v1",
        credential_salt: null,
        credential_verifier: null,
        credential_iterations: null,
      },
    });
    const response = await f.run();
    same(response.status, upgrade ? 200 : 500);
    same(f.events.includes("verify"), false);
    same(f.events.includes("upgrade_player_access_credential_v2"), true);
    same(f.events.includes("create_player_session_v2"), upgrade);
    if (upgrade) {
      same(
        f.events.indexOf("upgrade_player_access_credential_v2") <
          f.events.indexOf("create_player_session_v2"),
        true,
      );
    }
  }
});

function same(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Synthetic assertion mismatch: ${JSON.stringify(actual)} != ${
        JSON.stringify(expected)
      }`,
    );
  }
}
