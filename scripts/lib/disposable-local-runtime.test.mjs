import assert from "node:assert/strict";
import test from "node:test";

import {
  DisposableLocalRuntimeError,
  assertDisposableLocalRuntime,
  normalizeLoopbackHost,
  parseSupabaseStatusEnv,
} from "./disposable-local-runtime.mjs";

const LOCAL_STATUS = [
  'API_URL="http://127.0.0.1:54321"',
  'DB_URL="postgresql://postgres:local-password@127.0.0.1:54322/postgres"',
  'PUBLISHABLE_KEY="sb_publishable_local-sensitive-value"',
  'SERVICE_ROLE_KEY="sb_secret_local-sensitive-value"',
].join("\n");

function expectCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof DisposableLocalRuntimeError);
    assert.equal(error.code, code);
    return true;
  });
}

function validate(overrides = {}) {
  return assertDisposableLocalRuntime({
    statusOutput: LOCAL_STATUS,
    gatewayUrl: "http://127.0.0.1:4173",
    ...overrides,
  });
}

test("parses Supabase env output with POSIX and Windows assignment forms", () => {
  const parsed = parseSupabaseStatusEnv([
    "# Supabase local status",
    'set "API_URL=http://127.0.0.1:54321"',
    "export DB_URL='postgresql://postgres:p%40ss@localhost:54322/postgres'",
    'SERVICE_ROLE_KEY="header.payload=signature"',
    "IGNORED LINE",
    "",
  ].join("\r\n"));

  assert.deepEqual(parsed, {
    API_URL: "http://127.0.0.1:54321",
    DB_URL: "postgresql://postgres:p%40ss@localhost:54322/postgres",
    SERVICE_ROLE_KEY: "header.payload=signature",
  });
  assert.equal(Object.isFrozen(parsed), true);
});

test("rejects ambiguous or malformed Supabase env output", () => {
  expectCode(
    () => parseSupabaseStatusEnv("API_URL=http://127.0.0.1:54321\nAPI_URL=http://localhost:54321"),
    "STATUS_ENV_KEY_DUPLICATE",
  );
  expectCode(
    () => parseSupabaseStatusEnv('API_URL="http://127.0.0.1:54321'),
    "STATUS_ENV_VALUE_INVALID",
  );
});

test("normalizes explicit IPv4, localhost, and IPv6 loopback spellings", () => {
  for (const host of [
    "127.0.0.1",
    "LOCALHOST",
    "localhost.",
    "::1",
    "[::1]",
    "0:0:0:0:0:0:0:1",
  ]) {
    assert.equal(normalizeLoopbackHost(host), "loopback", host);
  }
  for (const host of ["0.0.0.0", "host.docker.internal", "example.supabase.co", "127.0.0.2"]) {
    assert.equal(normalizeLoopbackHost(host), null, host);
  }
});

test("accepts Windows CRLF and IPv6 while matching loopback aliases", () => {
  const statusOutput = [
    'set "API_URL=http://[::1]:54321"',
    'set "DB_URL=postgresql://postgres:ipv6-secret@[::1]:54322/postgres"',
    'set "PUBLISHABLE_KEY=sb_publishable_ipv6-secret"',
  ].join("\r\n");

  const evidence = assertDisposableLocalRuntime({
    statusOutput,
    inheritedDatabaseUrl: "postgresql://another-user:another-secret@localhost:54322/postgres",
    gatewayUrl: "http://[::1]:4173",
  });

  assert.equal(evidence.loopbackOnly, true);
  assert.equal(evidence.database.inheritedDatabaseMatches, true);
  assert.equal(evidence.api.port, 54321);
  assert.equal(evidence.database.port, 54322);
  assert.equal(evidence.gateway.port, 4173);
});

test("returns frozen aggregate evidence without URLs or secrets", () => {
  const secrets = [
    "local-password",
    "sb_publishable_local-sensitive-value",
    "sb_secret_local-sensitive-value",
    "postgresql://",
    "127.0.0.1",
    "postgres",
  ];
  const evidence = validate({
    inheritedDatabaseUrl:
      "postgresql://different-user:different-password@localhost:54322/postgres",
  });
  const serialized = JSON.stringify(evidence);

  assert.equal(evidence.productionSelected, false);
  assert.equal(evidence.stagingSelected, false);
  assert.equal(evidence.secretsIncluded, false);
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.database), true);
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, secret);
});

test("rejects production and staging environment authorization", () => {
  for (const targetEnvironment of ["production", "staging", "development", ""]) {
    expectCode(
      () => validate({ targetEnvironment }),
      "TARGET_ENVIRONMENT_NON_LOCAL",
    );
  }

  expectCode(
    () => validate({ statusOutput: `${LOCAL_STATUS}\nECONOVARIA_ENVIRONMENT=production` }),
    "STATUS_ENVIRONMENT_NON_LOCAL",
  );
  expectCode(
    () => validate({ statusOutput: `${LOCAL_STATUS}\nSEED_TARGET_ENVIRONMENT=staging` }),
    "STATUS_ENVIRONMENT_NON_LOCAL",
  );
});

test("rejects hosted or wildcard API, database, and gateway targets", () => {
  expectCode(
    () => validate({
      statusOutput: LOCAL_STATUS.replace(
        "http://127.0.0.1:54321",
        "https://production-ref.supabase.co",
      ),
    }),
    "STATUS_API_URL_PROTOCOL_INVALID",
  );
  expectCode(
    () => validate({
      statusOutput: LOCAL_STATUS.replace(
        "127.0.0.1:54322",
        "staging.pooler.supabase.com:5432",
      ),
    }),
    "STATUS_DATABASE_URL_NON_LOOPBACK",
  );
  expectCode(
    () => validate({ gatewayUrl: "http://0.0.0.0:4173" }),
    "GATEWAY_URL_NON_LOOPBACK",
  );
  expectCode(
    () => validate({ gatewayUrl: "https://production.example.test" }),
    "GATEWAY_URL_PROTOCOL_INVALID",
  );
});

test("rejects inherited DATABASE_URL endpoint and database mismatches", () => {
  for (const inheritedDatabaseUrl of [
    "postgresql://postgres:secret@localhost:54323/postgres",
    "postgresql://postgres:secret@localhost:54322/another_database",
  ]) {
    expectCode(
      () => validate({ inheritedDatabaseUrl }),
      "INHERITED_DATABASE_TARGET_MISMATCH",
    );
  }
  expectCode(
    () => validate({
      inheritedDatabaseUrl:
        "postgresql://postgres:secret@production.pooler.supabase.com:5432/postgres",
    }),
    "INHERITED_DATABASE_URL_NON_LOOPBACK",
  );
});

test("rejects URL metadata that can redirect a supposedly local target", () => {
  expectCode(
    () => validate({
      inheritedDatabaseUrl:
        "postgresql://postgres:secret@localhost:54322/postgres?host=production.example.test",
    }),
    "INHERITED_DATABASE_URL_INVALID",
  );
  expectCode(
    () => validate({ gatewayUrl: "http://127.0.0.1:4173/?target=production" }),
    "GATEWAY_URL_INVALID",
  );
});

test("rejects conflicting Supabase status aliases", () => {
  expectCode(
    () => validate({
      statusOutput: `${LOCAL_STATUS}\nSUPABASE_URL=http://localhost:54320`,
    }),
    "STATUS_API_URL_MISSING_CONFLICT",
  );
  expectCode(
    () => validate({
      statusOutput: `${LOCAL_STATUS}\nDATABASE_URL=postgresql://postgres:secret@localhost:54323/postgres`,
    }),
    "STATUS_DATABASE_URL_MISSING_CONFLICT",
  );
});
