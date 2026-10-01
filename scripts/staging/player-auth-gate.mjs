#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PROJECT = "eecvbssdvarfcykcfrny";
const BASE = "http://127.0.0.1:4173";
const PREFIX = "/functions/v1/player-web-session-api";
const BOOTSTRAP = "/proxy/players/me";
const CAPABILITIES = "/proxy/players/me/capabilities";
const COOKIE = "econovaria_player_session";
const LIMIT = 10;
const isFixture = data => data?.player?.playerIdentifier === "GOLD-ALPHA"
  && data?.player?.status === "active" && data?.gameSession?.name === "Econovaria Golden Five";
const ALLOWED = new Set(["POST /login", "POST /logout", "GET /status", `GET ${BOOTSTRAP}`, `GET ${CAPABILITIES}`]);
const check = (condition, message) => { if (!condition) throw new Error(message); };

export function configuration(env, now = Date.now()) {
  check(env.ECONOVARIA_PROJECT_REF === PROJECT, "Exact staging target required");
  check(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || ""), "Source SHA required");
  // Login silently upgrades legacy credentials. A fresh metadata-only confirmation
  // is required BEFORE this job; response inspection cannot undo such an upgrade.
  const verified = Date.parse(env.AUTH_FIXTURE_VERIFIED_AT || "");
  check(env.AUTH_FIXTURE_VERSION === "pbkdf2-sha256-v2" && Number.isFinite(verified)
    && now >= verified && now - verified <= 3600000, "Fresh fixture-version confirmation required");
  check(/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY || ""), "Staging publishable key required");
  check(Boolean(env.ECONOVARIA_GOLDEN_ALPHA_ACCESS_CODE), "Existing synthetic fixture credential required");
  return { key: env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY, code: env.ECONOVARIA_GOLDEN_ALPHA_ACCESS_CODE,
    source: env.GITHUB_SHA, verifiedAt: new Date(verified).toISOString() };
}

export async function runGate(config, fetchImpl = fetch) {
  const evidence = { schemaVersion: 1, projectRef: PROJECT, testSource: config.source,
    fixtureVersionVerifiedAt: config.verifiedAt, capturedAt: new Date().toISOString(),
    // This certifies requests to the existing deployment, not deployment of testSource.
    deployedEdgeSource: "not_attested_by_this_check", productionCertified: false,
    requestLimit: LIMIT, requests: [], decision: "FAIL", cleanup: "not_needed" };
  let cookie = "", csrf = "", logoutAttempted = false;
  async function request(label, method, route, body, session = "", token = "") {
    check(ALLOWED.has(`${method} ${route}`), "Request outside auth/read allowlist");
    check(evidence.requests.length < LIMIT, "Request budget exhausted");
    const entry = { check: label, method, route, status: null, passed: false };
    evidence.requests.push(entry);
    const headers = { apikey: config.key, origin: BASE, "content-type": "application/json" };
    if (session) headers.cookie = `${COOKIE}=${session}`;
    if (token) headers["x-econovaria-csrf-token"] = token;
    // No client retry or redirect. Existing server-side read recovery is unchanged.
    const response = await fetchImpl(`${BASE}${PREFIX}${route}`, { method, headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error", signal: AbortSignal.timeout(30000) });
    entry.status = response.status;
    const data = await response.json();
    return { response, data, entry };
  }
  function expect(result, status, predicate = () => true) {
    check(result.response.status === status && predicate(result.data), `Check failed: ${result.entry.check}`);
    result.entry.passed = true;
  }
  async function logout() {
    logoutAttempted = true;
    evidence.cleanup = "unconfirmed";
    const result = await request("logout", "POST", "/logout", {}, cookie, csrf);
    expect(result, 200, data => data?.ok === true);
    evidence.cleanup = "revoked";
  }
  try {
    const errorCode = code => data => data?.error?.code === code;
    expect(await request("malformed_login", "POST", "/login", []), 400, errorCode("invalid_request_body"));
    expect(await request("nonexistent_login", "POST", "/login", {
      gameJoinCode: "ECO-GOLDEN-FIVE-584", playerIdentifier: `REF019-ABSENT-${randomUUID()}`,
      accessCode: "REF019-INVALID-CODE",
    }), 401, errorCode("invalid_player_login"));
    expect(await request("missing_session", "GET", BOOTSTRAP), 401, errorCode("player_session_missing"));
    // Valid envelope shape, invalid ciphertext: reaches session validation rather than gateway filtering.
    const invalid = `v1.${"A".repeat(16)}.${"A".repeat(32)}`;
    expect(await request("invalid_session", "GET", BOOTSTRAP, undefined, invalid), 401, errorCode("player_session_invalid"));
    const login = await request("fixture_login", "POST", "/login", {
      gameJoinCode: "ECO-GOLDEN-FIVE-584", playerIdentifier: "GOLD-ALPHA", accessCode: config.code,
    });
    cookie = String(login.response.headers.get("set-cookie") || "").match(/(?:^|,\s*)econovaria_player_session=([^;]+)/)?.[1] || "";
    csrf = typeof login.data?.csrfToken === "string" ? login.data.csrfToken : "";
    if (cookie) evidence.cleanup = "required";
    expect(login, 200, data => data?.ok === true && data?.session?.authenticated === true && isFixture(data) && Boolean(cookie && csrf));
    expect(await request("session_status", "GET", "/status", undefined, cookie), 200,
      data => data?.ok === true && data?.session?.authenticated === true && isFixture(data));
    expect(await request("bootstrap", "GET", BOOTSTRAP, undefined, cookie), 200,
      data => data?.ok === true && data?.session?.status === "active" && isFixture(data));
    expect(await request("capabilities", "GET", CAPABILITIES, undefined, cookie), 200,
      data => data?.ok === true);
    await logout();
    expect(await request("revoked_session", "GET", BOOTSTRAP, undefined, cookie), 401, errorCode("player_session_invalid"));
    evidence.decision = "PASS";
  } catch {
    // Never retain bodies, cookies, CSRF, keys, access codes, UUIDs, or exception text.
    evidence.failure = evidence.requests.at(-1)?.check || "preflight";
  } finally {
    if (cookie && csrf && !logoutAttempted) {
      try { await logout(); } catch { evidence.cleanup = "unconfirmed"; }
    }
    if (cookie && !csrf) evidence.cleanup = "unconfirmed";
  }
  return evidence;
}

async function selfTest() {
  const env = { ECONOVARIA_PROJECT_REF: PROJECT, GITHUB_SHA: "a".repeat(40),
    AUTH_FIXTURE_VERSION: "pbkdf2-sha256-v2", AUTH_FIXTURE_VERIFIED_AT: new Date().toISOString(),
    ECONOVARIA_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture", ECONOVARIA_GOLDEN_ALPHA_ACCESS_CODE: "private-fixture" };
  const config = configuration(env);
  for (const patch of [{ ECONOVARIA_PROJECT_REF: "cgiukdjwicykrmtkhudh" },
    { AUTH_FIXTURE_VERSION: "sha256-v1" }, { AUTH_FIXTURE_VERIFIED_AT: "2020-01-01" }]) {
    assert.throws(() => configuration({ ...env, ...patch }));
  }
  const fixture = { player: { playerIdentifier: "GOLD-ALPHA", status: "active" },
    gameSession: { name: "Econovaria Golden Five" } };
  const responses = [
    [400, { error: { code: "invalid_request_body" } }], [401, { error: { code: "invalid_player_login" } }],
    [401, { error: { code: "player_session_missing" } }], [401, { error: { code: "player_session_invalid" } }],
    [200, { ...fixture, ok: true, session: { authenticated: true }, csrfToken: "private-csrf" }],
    [200, { ...fixture, ok: true, session: { authenticated: true } }],
    [200, { ...fixture, ok: true, session: { status: "active" } }],
    [200, { ok: true }], [200, { ok: true }], [401, { error: { code: "player_session_invalid" } }],
  ];
  async function scenario(failAt = -1) {
    let count = 0;
    return runGate(config, async (url, options) => {
      assert.equal(new URL(url).origin, BASE);
      assert.equal(options.redirect, "error");
      assert(ALLOWED.has(`${options.method} ${new URL(url).pathname.slice(PREFIX.length)}`));
      const index = count++;
      const [status, body] = new URL(url).pathname.endsWith("/logout") ? responses[8] : responses[index];
      return new Response(JSON.stringify(index === failAt ? { secret: config.code } : body), {
        status: index === failAt ? 503 : status,
        headers: index === 4 ? { "set-cookie": `${COOKIE}=private-cookie; HttpOnly` } : {},
      });
    });
  }
  const pass = await scenario();
  assert.equal(pass.decision, "PASS"); assert.equal(pass.requests.length, LIMIT);
  for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const fail = await scenario(index);
    assert.equal(fail.decision, "FAIL"); assert(fail.requests.length <= LIMIT);
    assert.equal(fail.cleanup, [4, 8].includes(index) ? "unconfirmed" : index >= 5 ? "revoked" : "not_needed");
    assert(!JSON.stringify(fail).includes("private-"));
  }
  let calls = 0;
  const networkFailure = await runGate(config, async () => { calls++; throw new Error(config.code); });
  assert.equal(calls, 1); assert.equal(networkFailure.decision, "FAIL");
  assert(!JSON.stringify(networkFailure).includes(config.code));
  assert(!JSON.stringify(pass).includes("private-"));
  console.log("Player auth gate mocked contracts passed");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "--self-test") await selfTest();
  else {
    try {
      const evidence = await runGate(configuration(process.env));
      await mkdir("/tmp/player-auth-gate", { recursive: true });
      await writeFile("/tmp/player-auth-gate/evidence.json", `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
      console.log(JSON.stringify({ decision: evidence.decision, requests: evidence.requests.length, cleanup: evidence.cleanup }));
      process.exitCode = evidence.decision === "PASS" ? 0 : 1;
    } catch { console.error("Player auth gate preflight failed; no credential details retained"); process.exitCode = 1; }
  }
}
