import {
  authorizeInternalRunnerRequest,
  buildInternalRunnerSignaturePayload,
  INTERNAL_RUNNER_NONCE_HEADER,
  INTERNAL_RUNNER_SIGNATURE_HEADER,
  INTERNAL_RUNNER_TIMESTAMP_HEADER,
  type InternalRunnerNonceClaim,
} from "./internalRunnerAuth.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const SECRET = "runner-secret";
const NOW = new Date("2026-07-26T08:00:00.000Z");
const TIMESTAMP = Math.floor(NOW.getTime() / 1000);
const NONCE = "00000000-0000-4000-8000-000000000004";
const URL = "https://example.supabase.co/functions/v1/stock-market-runner";
const INTERNAL_HEADER = "x-stock-market-runner-secret";
const BODY = JSON.stringify({
  action: "run_tick",
  gameSessionId: "00000000-0000-4000-8000-000000000001",
});

Deno.test("signed internal runner accepts one fresh project-bound request", async () => {
  const claims: InternalRunnerNonceClaim[] = [];
  const request = await signedRequest();
  const result = await authorizeInternalRunnerRequest(request, options({
    claimNonce: async (claim) => {
      claims.push(claim);
      return true;
    },
  }));

  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(claims.length, 1);
  assertEquals(claims[0].runnerName, "stock-market-runner");
  assertMatch(claims[0].nonceHash, /^[0-9a-f]{64}$/);
  assertEquals(claims[0].timestampSeconds, TIMESTAMP);
  assertEquals(result.request.headers.get(INTERNAL_HEADER), SECRET);
  assertEquals(result.request.headers.has(INTERNAL_RUNNER_TIMESTAMP_HEADER), false);
  assertEquals(result.request.headers.has(INTERNAL_RUNNER_NONCE_HEADER), false);
  assertEquals(result.request.headers.has(INTERNAL_RUNNER_SIGNATURE_HEADER), false);
  assertEquals(await result.request.text(), BODY);
});

Deno.test("signed internal runner rejects the retired raw-secret transport", async () => {
  const request = await signedRequest({
    extraHeaders: { [INTERNAL_HEADER]: SECRET },
  });
  const response = await deniedResponse(request);
  const body = await response.json();

  assertEquals(response.status, 401);
  assertEquals(body.error.code, "legacy_runner_secret_forbidden");
});

Deno.test("signed internal runner rejects missing, malformed, stale, and future signatures before nonce storage", async () => {
  const cases = [
    new Request(URL, { method: "POST", body: BODY }),
    await signedRequest({ signature: "v1=invalid" }),
    await signedRequest({ timestampSeconds: TIMESTAMP - 301 }),
    await signedRequest({ timestampSeconds: TIMESTAMP + 301 }),
    await signedRequest({ nonce: "not-a-uuid" }),
  ];

  for (const request of cases) {
    let claimed = false;
    const result = await authorizeInternalRunnerRequest(request, options({
      claimNonce: async () => {
        claimed = true;
        return true;
      },
    }));
    assertEquals(result.ok, false);
    assertEquals(claimed, false);
    if (!result.ok) {
      assertEquals(result.response.status, 401);
    }
  }
});

Deno.test("signed internal runner binds method, project origin, route, query, and body", async () => {
  const signed = await signedRequest();
  const headers = new Headers(signed.headers);
  const variants = [
    new Request(URL.replace("example", "other"), {
      method: "POST",
      headers,
      body: BODY,
    }),
    new Request(`${URL}/other`, { method: "POST", headers, body: BODY }),
    new Request(`${URL}?scope=other`, { method: "POST", headers, body: BODY }),
    new Request(URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "run_tick",
        gameSessionId: "00000000-0000-4000-8000-000000000002",
      }),
    }),
  ];

  for (const request of variants) {
    const response = await deniedResponse(request);
    const body = await response.json();
    assertEquals(response.status, 401);
    assertEquals(body.error.code, "invalid_internal_runner_signature");
  }

  const getResponse = await deniedResponse(
    new Request(URL, { method: "GET", headers }),
  );
  assertEquals(getResponse.status, 405);
});

Deno.test("signed internal runner denies nonce replay and fails closed when storage is unavailable", async () => {
  const replay = await authorizeInternalRunnerRequest(
    await signedRequest(),
    options({ claimNonce: async () => false }),
  );
  assertEquals(replay.ok, false);
  if (!replay.ok) {
    const body = await replay.response.json();
    assertEquals(replay.response.status, 409);
    assertEquals(body.error.code, "internal_runner_replay_denied");
  }

  const unavailable = await authorizeInternalRunnerRequest(
    await signedRequest(),
    options({
      claimNonce: async () => {
        throw new Error("database unavailable");
      },
    }),
  );
  assertEquals(unavailable.ok, false);
  if (!unavailable.ok) {
    const body = await unavailable.response.json();
    assertEquals(unavailable.response.status, 503);
    assertEquals(body.error.code, "internal_runner_nonce_store_unavailable");
    assertEquals(body.error.retryable, true);
  }
});

Deno.test("signed internal runner enforces bounded request bodies before nonce storage", async () => {
  const bodyText = "x".repeat(2048);
  const request = await signedRequest({ body: bodyText });
  let claimed = false;
  const result = await authorizeInternalRunnerRequest(request, options({
    maxBodyBytes: 1024,
    claimNonce: async () => {
      claimed = true;
      return true;
    },
  }));

  assertEquals(result.ok, false);
  assertEquals(claimed, false);
  if (!result.ok) {
    assertEquals(result.response.status, 413);
  }
});

function options(overrides: Partial<{
  claimNonce: (claim: InternalRunnerNonceClaim) => Promise<boolean>;
  maxBodyBytes: number;
}> = {}) {
  return {
    runnerName: "stock-market-runner",
    internalSecretHeader: INTERNAL_HEADER,
    dependencies: {
      readSecret: () => SECRET,
      claimNonce: overrides.claimNonce ?? (async () => true),
      now: () => NOW,
      ...(overrides.maxBodyBytes === undefined
        ? {}
        : { maxBodyBytes: overrides.maxBodyBytes }),
    },
  };
}

async function deniedResponse(request: Request): Promise<Response> {
  const result = await authorizeInternalRunnerRequest(request, options());
  if (result.ok) throw new Error("Expected signed runner request to be denied.");
  return result.response;
}

async function signedRequest({
  url = URL,
  method = "POST",
  body = BODY,
  timestampSeconds = TIMESTAMP,
  nonce = NONCE,
  signature,
  extraHeaders = {},
}: {
  readonly url?: string;
  readonly method?: string;
  readonly body?: string;
  readonly timestampSeconds?: number;
  readonly nonce?: string;
  readonly signature?: string;
  readonly extraHeaders?: Record<string, string>;
} = {}): Promise<Request> {
  const bodyHash = await sha256Hex(new TextEncoder().encode(body));
  const payload = buildInternalRunnerSignaturePayload({
    runnerName: "stock-market-runner",
    timestampSeconds,
    nonce,
    method,
    url,
    bodyHash,
  });
  const computedSignature = signature ?? `v1=${await sign(payload)}`;
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      [INTERNAL_RUNNER_TIMESTAMP_HEADER]: String(timestampSeconds),
      [INTERNAL_RUNNER_NONCE_HEADER]: nonce,
      [INTERNAL_RUNNER_SIGNATURE_HEADER]: computedSignature,
      ...extraHeaders,
    },
    ...(method === "GET" || method === "HEAD" ? {} : { body }),
  });
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(new TextEncoder().encode(SECRET)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      ownedArrayBuffer(new TextEncoder().encode(payload)),
    ),
  );
  return encodeBase64Url(signature);
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", ownedArrayBuffer(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ownedArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function assertMatch(actual: string, expected: RegExp): void {
  if (!expected.test(actual)) {
    throw new Error(`Actual ${actual} did not match ${expected}.`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
