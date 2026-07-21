import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const apiBase = requireEnv("CLASSROOM_API_URL").replace(/\/$/u, "");
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const confirmation = requireEnv("ECONOVARIA_STAGING_CONFIRMATION");
if (confirmation !== "I_ACKNOWLEDGE_ISOLATED_STAGING") {
  throw new Error("Refusing to run without isolated-staging confirmation.");
}

const evidencePath = resolve(
  process.env.ECONOVARIA_SECURITY_EVIDENCE_PATH ??
    "artifacts/security/rate-limit-http-probe.json",
);
const canaries = Object.freeze({
  accessCode: "ECO-CANARY-ACCESS-7F4A2D",
  credentialHash: "a".repeat(64),
  internalUuid: "11111111-2222-4333-8444-555555555555",
  playerIdentifier: "ECO-CANARY-PLAYER-9B81",
  sessionToken: "eco_canary_session_token_6b75c7a8d4",
});

const startedAt = new Date().toISOString();
const loginResponses = [];
for (let index = 0; index < 95; index += 1) {
  loginResponses.push(await request("/players/login", {
    method: "POST",
    headers: spoofedHeaders(index),
    body: JSON.stringify({
      gameJoinCode: canaries.internalUuid,
      playerIdentifier: canaries.playerIdentifier,
      accessCode: canaries.accessCode,
      credentialHash: canaries.credentialHash,
    }),
  }));
}

const firstRateLimitedIndex = loginResponses.findIndex(
  (response) => response.status === 429,
);
if (firstRateLimitedIndex < 90 || firstRateLimitedIndex > 94) {
  throw new Error(
    `Expected shared-NAT login denial after 90 attempts; first 429 was ${firstRateLimitedIndex}.`,
  );
}
for (const response of loginResponses) assertNoLeak(response);
const login429 = loginResponses[firstRateLimitedIndex];
assertRateLimitResponse(login429);

const malformedSession = await request("/players/me", {
  method: "GET",
  headers: {
    "x-player-session-token": canaries.sessionToken,
    "x-injected-game-id": canaries.internalUuid,
  },
});
if (![401, 429].includes(malformedSession.status)) {
  throw new Error(`Malformed session probe returned ${malformedSession.status}.`);
}
assertNoLeak(malformedSession);

const optionalAuthCases = [];
for (const [name, tokenEnv] of [
  ["expired", "ECONOVARIA_EXPIRED_PLAYER_SESSION_TOKEN"],
  ["revoked", "ECONOVARIA_REVOKED_PLAYER_SESSION_TOKEN"],
  ["wrongRole", "ECONOVARIA_STAFF_ACCESS_TOKEN"],
]) {
  const token = process.env[tokenEnv]?.trim();
  if (!token) continue;
  const response = await request("/players/me", {
    method: "GET",
    headers: { "x-player-session-token": token },
  });
  if (response.status !== 401) {
    throw new Error(`${name} session probe returned ${response.status}, expected 401.`);
  }
  assertNoLeak(response);
  optionalAuthCases.push({ name, status: response.status, passed: true });
}

const scannerEvidence = await runOptionalScannerBurst();
const outageEvidence = await runOptionalOutageProbe();

const evidence = {
  schemaVersion: "econovaria-beta-security-http-probe-v1",
  target: new URL(apiBase).host,
  startedAt,
  completedAt: new Date().toISOString(),
  loginSharedNat: {
    attempts: loginResponses.length,
    firstRateLimitedAttempt: firstRateLimitedIndex + 1,
    denied: loginResponses.filter((response) => response.status === 429).length,
    retryAfter: Number(login429.headers["retry-after"]),
    clientSpoofHeadersRotated: true,
  },
  malformedSession: { status: malformedSession.status, passed: true },
  optionalAuthCases,
  scannerBurst: scannerEvidence,
  limiterOutage: outageEvidence,
  privacy: {
    responseCountScanned: loginResponses.length + 1 + optionalAuthCases.length,
    canariesAbsentFromHeadersAndBodies: true,
  },
  passed: true,
};

await mkdir(dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
  mode: 0o600,
});
console.log(`Security HTTP probe passed; evidence written to ${evidencePath}`);

async function runOptionalScannerBurst() {
  const staffToken = process.env.ECONOVARIA_STAFF_ACCESS_TOKEN?.trim();
  const gameId = process.env.ECONOVARIA_STAGING_GAME_ID?.trim();
  if (!staffToken || !gameId) return { executed: false };

  const responses = [];
  for (let index = 0; index < 305; index += 1) {
    responses.push(await request(`/games/${encodeURIComponent(gameId)}/attendance/scan`, {
      method: "POST",
      headers: { authorization: `Bearer ${staffToken}` },
      body: "{}",
    }));
  }
  const first429 = responses.findIndex((response) => response.status === 429);
  if (first429 < 300 || first429 > 304) {
    throw new Error(`Scanner burst first 429 was ${first429}; expected after 300 attempts.`);
  }
  for (const response of responses) assertNoLeak(response);
  assertRateLimitResponse(responses[first429]);
  return {
    executed: true,
    attempts: responses.length,
    firstRateLimitedAttempt: first429 + 1,
    denied: responses.filter((response) => response.status === 429).length,
  };
}

async function runOptionalOutageProbe() {
  const outageUrl = process.env.ECONOVARIA_LIMITER_OUTAGE_PROBE_URL?.trim();
  if (!outageUrl) return { executed: false };
  const response = await rawRequest(outageUrl, {
    method: "POST",
    headers: spoofedHeaders(0),
    body: JSON.stringify({
      gameJoinCode: canaries.internalUuid,
      playerIdentifier: canaries.playerIdentifier,
      accessCode: canaries.accessCode,
    }),
  });
  if (response.status !== 503) {
    throw new Error(`Limiter outage probe returned ${response.status}, expected 503.`);
  }
  if (response.json?.error?.code !== "rate_limit_service_unavailable") {
    throw new Error("Limiter outage probe returned the wrong error code.");
  }
  assertNoLeak(response);
  return { executed: true, status: 503, failClosed: true };
}

function spoofedHeaders(index) {
  const suffix = (index % 200) + 1;
  return {
    "cf-connecting-ip": `198.51.100.${suffix}`,
    "x-real-ip": `192.0.2.${suffix}`,
    "x-forwarded-for": `203.0.113.${suffix}`,
    "true-client-ip": `198.18.0.${suffix}`,
  };
}

async function request(path, options) {
  return rawRequest(`${apiBase}${path}`, options);
}

async function rawRequest(url, options) {
  const response = await fetch(url, {
    ...options,
    redirect: "error",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    text,
    json,
  };
}

function assertRateLimitResponse(response) {
  if (response.status !== 429) throw new Error("Expected HTTP 429.");
  const retryAfter = Number(response.headers["retry-after"]);
  if (!Number.isInteger(retryAfter) || retryAfter < 1) {
    throw new Error("429 response omitted a valid Retry-After header.");
  }
  if (response.json?.error?.code !== "rate_limit_exceeded") {
    throw new Error("429 response returned the wrong error code.");
  }
  if (response.headers["cache-control"] !== "private, no-store") {
    throw new Error("429 response is not private and no-store.");
  }
}

function assertNoLeak(response) {
  const serialized = `${JSON.stringify(response.headers)}\n${response.text}`;
  for (const [name, value] of Object.entries(canaries)) {
    if (serialized.includes(value)) {
      throw new Error(`Response leaked ${name}.`);
    }
  }
  const lowered = serialized.toLowerCase();
  for (const forbiddenName of [
    "session_token_hash",
    "normalized_student_code_hash",
    "supabase_service_role_key",
    "econovaria_rate_limit_hmac_secret",
  ]) {
    if (lowered.includes(forbiddenName)) {
      throw new Error(`Response leaked sensitive field ${forbiddenName}.`);
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}
